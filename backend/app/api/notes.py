import uuid
import logging
import json
import re
import warnings
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Any

from PIL import Image, UnidentifiedImageError

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlmodel import Session, select

from app.database import get_session
from app.api.auth import get_current_user
from app.models import Note, NoteAsset, NoteAnnotation, User
from app.ocr import recognize_image


logger = logging.getLogger(__name__)

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

IMAGE_FORMATS = {
    ".jpg": ("image/jpeg", "JPEG"),
    ".jpeg": ("image/jpeg", "JPEG"),
    ".png": ("image/png", "PNG"),
    ".webp": ("image/webp", "WEBP"),
}
ASSET_KEY_PATTERN = re.compile(r"^[0-9a-f]{32}\.(?:jpg|jpeg|png|webp)$")
MAX_FILE_SIZE = 10 * 1024 * 1024
MAX_IMAGE_PIXELS = 40_000_000
MAX_ANNOTATION_BYTES = 10 * 1024 * 1024
MAX_ANNOTATION_OBJECTS = 5_000
ANNOTATION_OBJECT_TYPES = {
    "Path",
    "IText",
    "Textbox",
    "Rect",
    "Circle",
    "Ellipse",
    "Line",
    "Triangle",
    "Polygon",
    "Polyline",
}

router = APIRouter()


class NoteUpdate(BaseModel):
    text: str


class NoteAnnotationPayload(BaseModel):
    width: int
    height: int
    canvas: dict[str, Any]


def serialize_annotation_payload(payload: NoteAnnotationPayload) -> str:
    if (
        payload.width < 1
        or payload.height < 1
        or payload.width * payload.height > MAX_IMAGE_PIXELS
    ):
        raise HTTPException(status_code=422, detail="Размеры аннотаций некорректны")

    objects = payload.canvas.get("objects")
    if not isinstance(objects, list) or len(objects) > MAX_ANNOTATION_OBJECTS:
        raise HTTPException(status_code=422, detail="Список аннотаций некорректен")
    if any(
        not isinstance(annotation, dict)
        or annotation.get("type") not in ANNOTATION_OBJECT_TYPES
        for annotation in objects
    ):
        raise HTTPException(status_code=422, detail="Тип объекта аннотации не поддерживается")

    values_to_check: list[Any] = [payload.canvas]
    while values_to_check:
        value = values_to_check.pop()
        if isinstance(value, dict):
            object_type = value.get("type")
            if object_type is not None and object_type not in ANNOTATION_OBJECT_TYPES:
                raise HTTPException(status_code=422, detail="Тип объекта аннотации не поддерживается")
            if any(key in value for key in ("src", "backgroundImage", "overlayImage")):
                raise HTTPException(status_code=422, detail="Нельзя сохранять оригинал внутри аннотаций")
            values_to_check.extend(value.values())
        elif isinstance(value, list):
            values_to_check.extend(value)

    try:
        serialized = json.dumps(
            payload.canvas,
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
        )
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="Данные аннотаций некорректны")

    if len(serialized.encode("utf-8")) > MAX_ANNOTATION_BYTES:
        raise HTTPException(status_code=413, detail="Размер аннотаций превышает допустимый")

    return serialized


def get_annotation_response(annotation: NoteAnnotation | None) -> dict[str, Any] | None:
    if annotation is None:
        return None

    try:
        canvas = json.loads(annotation.fabric_json)
    except (json.JSONDecodeError, TypeError):
        logger.exception("Повреждены данные аннотаций для заметки %s", annotation.note_id)
        raise HTTPException(status_code=500, detail="Не удалось прочитать сохранённые аннотации")

    return {
        "width": annotation.image_width,
        "height": annotation.image_height,
        "canvas": canvas,
        "updated_at": annotation.updated_at,
    }


def get_safe_asset_path(asset: NoteAsset) -> Path | None:
    if not ASSET_KEY_PATTERN.fullmatch(asset.storage_key):
        return None

    asset_path = UPLOAD_DIR / asset.storage_key
    if asset_path.is_symlink() or asset_path.resolve().parent != UPLOAD_DIR.resolve():
        return None

    return asset_path


def get_safe_pdf_path(note_id: int) -> Path | None:
    pdf_path = UPLOAD_DIR / f"{note_id}.pdf"
    if pdf_path.is_symlink() or pdf_path.resolve().parent != UPLOAD_DIR.resolve():
        return None

    return pdf_path


def stage_file_for_deletion(file_path: Path | None) -> Path | None:
    if file_path is None or not file_path.exists():
        return None
    if file_path.is_symlink() or not file_path.is_file():
        raise HTTPException(status_code=500, detail="Невозможно безопасно удалить файл конспекта")

    staged_path = file_path.with_name(f".{file_path.name}.{uuid.uuid4().hex}.deleting")
    try:
        file_path.rename(staged_path)
    except OSError:
        logger.exception("Не удалось подготовить файл к удалению: %s", file_path)
        raise HTTPException(status_code=500, detail="Файл не удалён; запись сохранена")

    return staged_path


def get_user_note(note_id: int, session: Session, current_user: User) -> Note:
    note = session.exec(
        select(Note).where(
            Note.id == note_id,
            Note.user_id == current_user.id,
        )
    ).first()

    if not note:
        raise HTTPException(status_code=404, detail="Запись не найдена")

    return note


@router.get("/notes")
async def list_notes(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    return session.exec(
        select(Note)
        .where(Note.user_id == current_user.id)
        .order_by(Note.id.desc())
    ).all()


@router.post("/notes")
async def upload_note(
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    filename = file.filename or "upload"
    suffix = Path(filename).suffix.lower()
    content = await file.read()

    if not content:
        raise HTTPException(status_code=400, detail="Файл пустой")

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Максимальный размер файла — 10 МБ")

    # PDF сохраняется как документ: OCR для него не запускается.
    if suffix == ".pdf":
        if b"%PDF-" not in content[:1024]:
            raise HTTPException(status_code=400, detail="Файл не является корректным PDF")

        new_note = Note(
            filename=filename,
            text=None,
            status="pdf",
            user_id=current_user.id,
            subject="Без предмета",
        )

        try:
            session.add(new_note)
            session.commit()
            session.refresh(new_note)

            pdf_path = UPLOAD_DIR / f"{new_note.id}.pdf"
            pdf_path.write_bytes(content)
        except Exception:
            session.rollback()
            if new_note.id is not None:
                try:
                    session.delete(new_note)
                    session.commit()
                except Exception:
                    session.rollback()
            logger.exception("Ошибка сохранения PDF")
            raise HTTPException(status_code=500, detail="Не удалось сохранить PDF")

        return {
            "id": new_note.id,
            "filename": new_note.filename,
            "text": new_note.text,
            "status": new_note.status,
            "subject": new_note.subject,
        }

    expected_image = IMAGE_FORMATS.get(suffix)
    if expected_image is None or file.content_type != expected_image[0]:
        raise HTTPException(status_code=400, detail="Разрешены согласованные JPG, PNG и WEBP файлы")

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(content)) as image:
                actual_format = image.format
                if image.width * image.height > MAX_IMAGE_PIXELS:
                    raise HTTPException(status_code=400, detail="Размер изображения превышает допустимый")
                image.verify()

            if actual_format != expected_image[1]:
                raise HTTPException(status_code=400, detail="Тип изображения не соответствует содержимому файла")

            with Image.open(BytesIO(content)) as image:
                image.load()
                buffer = BytesIO()
                image.convert("RGB").save(buffer, format="JPEG")
                prepared_image = buffer.getvalue()
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(status_code=400, detail="Размер изображения превышает допустимый")
    except (UnidentifiedImageError, OSError):
        raise HTTPException(status_code=400, detail="Не удалось открыть изображение")

    storage_key = f"{uuid.uuid4().hex}{suffix}"
    file_path = UPLOAD_DIR / storage_key
    try:
        with file_path.open("xb") as original_file:
            original_file.write(content)
    except OSError:
        logger.exception("Ошибка сохранения исходного изображения")
        raise HTTPException(status_code=500, detail="Не удалось сохранить исходное изображение")

    status_ = "done"
    full_text = ""
    ocr_error = None

    try:
        full_text = await recognize_image(prepared_image, mime_type="JPEG")
        if not full_text or not full_text.strip():
            status_ = "error"
            ocr_error = "Текст на фотографии не распознан"
    except Exception as e:
        logger.exception("Ошибка OCR")
        status_ = "error"
        ocr_error = str(e)

    new_note = Note(
        filename=filename,
        text=full_text,
        status=status_,
        user_id=current_user.id,
        subject="Без предмета",
    )

    try:
        session.add(new_note)
        session.flush()
        if new_note.id is None:
            raise RuntimeError("Не удалось создать идентификатор записи")
        session.add(
            NoteAsset(
                note_id=new_note.id,
                storage_key=storage_key,
                media_type=expected_image[0],
            )
        )
        session.commit()
        session.refresh(new_note)
    except Exception:
        session.rollback()
        try:
            file_path.unlink(missing_ok=True)
        except OSError:
            logger.exception("Не удалось удалить несвязанный файл изображения")
        logger.exception("Ошибка сохранения записи")
        raise HTTPException(status_code=500, detail="Не удалось сохранить запись")

    return {
        "id": new_note.id,
        "filename": new_note.filename,
        "text": new_note.text,
        "status": new_note.status,
        "subject": new_note.subject,
        "ocr_error": ocr_error,
    }


@router.get("/notes/{note_id}/file")
async def get_note_file(
    note_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    note = get_user_note(note_id, session, current_user)

    suffix = Path(note.filename).suffix.lower()
    if suffix == ".pdf":
        pdf_path = get_safe_pdf_path(note_id)
        if pdf_path is None or not pdf_path.is_file():
            raise HTTPException(status_code=404, detail="Файл PDF не найден на сервере")
        try:
            with pdf_path.open("rb") as pdf_file:
                is_pdf = b"%PDF-" in pdf_file.read(1024)
        except OSError:
            is_pdf = False
        if not is_pdf:
            raise HTTPException(status_code=404, detail="Файл PDF повреждён или недоступен")

        return FileResponse(
            path=pdf_path,
            media_type="application/pdf",
            filename=Path(note.filename).name,
            content_disposition_type="inline",
        )

    if suffix not in IMAGE_FORMATS:
        raise HTTPException(status_code=400, detail="Формат исходного файла не поддерживается")

    asset = session.get(NoteAsset, note_id)
    if not asset:
        raise HTTPException(
            status_code=404,
            detail="Исходное изображение недоступно: у этого старого конспекта нет привязки к файлу.",
        )

    image_path = get_safe_asset_path(asset)
    if image_path is None or not image_path.is_file():
        raise HTTPException(status_code=404, detail="Файл изображения не найден на сервере")

    expected_media_type, expected_format = IMAGE_FORMATS[suffix]
    if asset.media_type != expected_media_type:
        raise HTTPException(status_code=404, detail="Тип сохранённого изображения не совпадает с записью")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(image_path) as image:
                actual_format = image.format
                if image.width * image.height > MAX_IMAGE_PIXELS:
                    raise HTTPException(status_code=404, detail="Размер изображения превышает допустимый")
                image.verify()
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(status_code=404, detail="Размер изображения превышает допустимый")
    except (UnidentifiedImageError, OSError):
        raise HTTPException(status_code=404, detail="Файл изображения повреждён или недоступен")
    if actual_format != expected_format:
        raise HTTPException(status_code=404, detail="Формат изображения не совпадает с записью")

    return FileResponse(
        path=image_path,
        media_type=asset.media_type,
        filename=Path(note.filename).name,
        content_disposition_type="inline",
    )


@router.get("/notes/{note_id}/annotations")
async def get_note_annotations(
    note_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    note = get_user_note(note_id, session, current_user)
    if Path(note.filename).suffix.lower() == ".pdf":
        raise HTTPException(status_code=400, detail="Аннотации PDF пока не поддерживаются")

    annotation = session.get(NoteAnnotation, note_id)
    if annotation and annotation.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Запись не найдена")

    return get_annotation_response(annotation)


@router.put("/notes/{note_id}/annotations")
async def save_note_annotations(
    note_id: int,
    payload: NoteAnnotationPayload,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    note = get_user_note(note_id, session, current_user)
    if Path(note.filename).suffix.lower() == ".pdf":
        raise HTTPException(status_code=400, detail="Аннотации PDF пока не поддерживаются")

    serialized = serialize_annotation_payload(payload)
    annotation = session.get(NoteAnnotation, note_id)
    if annotation and annotation.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Запись не найдена")

    if annotation is None:
        annotation = NoteAnnotation(
            note_id=note_id,
            user_id=current_user.id,
            image_width=payload.width,
            image_height=payload.height,
            fabric_json=serialized,
        )
    else:
        annotation.image_width = payload.width
        annotation.image_height = payload.height
        annotation.fabric_json = serialized
        annotation.updated_at = datetime.now(timezone.utc)

    try:
        session.add(annotation)
        session.commit()
        session.refresh(annotation)
    except Exception:
        session.rollback()
        logger.exception("Ошибка сохранения аннотаций для заметки %s", note_id)
        raise HTTPException(status_code=500, detail="Не удалось сохранить аннотации")

    return get_annotation_response(annotation)


@router.patch("/notes/{note_id}")
async def update_note(
    note_id: int,
    data: NoteUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    note = get_user_note(note_id, session, current_user)

    if Path(note.filename).suffix.lower() == ".pdf":
        raise HTTPException(status_code=400, detail="Текст PDF в этом режиме не редактируется")

    note.text = data.text

    try:
        session.add(note)
        session.commit()
        session.refresh(note)
    except Exception:
        session.rollback()
        logger.exception("Ошибка обновления записи")
        raise HTTPException(status_code=500, detail="Не удалось сохранить изменения")

    return {
        "id": note.id,
        "filename": note.filename,
        "text": note.text,
        "status": note.status,
        "subject": note.subject,
    }


@router.delete("/notes/{note_id}")
async def delete_note(
    note_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    note = get_user_note(note_id, session, current_user)
    suffix = Path(note.filename).suffix.lower()
    is_pdf = suffix == ".pdf"
    asset = session.get(NoteAsset, note_id)
    annotation = session.get(NoteAnnotation, note_id)
    if annotation and annotation.user_id != current_user.id:
        raise HTTPException(status_code=409, detail="Связь аннотаций с владельцем некорректна")

    if is_pdf:
        file_path = get_safe_pdf_path(note_id)
        if file_path is None:
            raise HTTPException(status_code=500, detail="Невозможно безопасно удалить PDF-файл")
    elif asset:
        file_path = get_safe_asset_path(asset)
        if file_path is None:
            raise HTTPException(status_code=500, detail="Невозможно безопасно удалить файл изображения")
    else:
        file_path = None

    staged_path = stage_file_for_deletion(file_path)
    try:
        if asset:
            session.delete(asset)
        if annotation:
            session.delete(annotation)
        session.delete(note)
        session.commit()
    except Exception:
        session.rollback()
        if staged_path and file_path:
            try:
                staged_path.rename(file_path)
            except OSError:
                logger.exception("Не удалось восстановить файл после ошибки удаления записи")
                raise HTTPException(
                    status_code=500,
                    detail="Не удалось удалить запись и восстановить оригинал; требуется ручная проверка.",
                )
        logger.exception("Ошибка удаления записи")
        raise HTTPException(status_code=500, detail="Не удалось удалить запись")

    if staged_path:
        try:
            staged_path.unlink()
        except OSError:
            logger.exception("Не удалось окончательно удалить файл конспекта: %s", staged_path)
            raise HTTPException(
                status_code=500,
                detail="Запись удалена, но оригинальный файл не удалось окончательно удалить; требуется ручная очистка.",
            )

    if not is_pdf and asset is None:
        return {
            "message": "Запись удалена. Исходный файл не удалён, так как его связь с записью не подтверждена.",
            "id": note_id,
            "original_file_retained": True,
        }

    return {"message": "Запись удалена", "id": note_id}
