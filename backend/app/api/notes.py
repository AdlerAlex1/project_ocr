import uuid
import logging
from io import BytesIO
from pathlib import Path

from PIL import Image, UnidentifiedImageError

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlmodel import Session, select

from app.database import get_session
from app.api.auth import get_current_user
from app.models import Note, User
from app.ocr import recognize_image


logger = logging.getLogger(__name__)

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_FILE_SIZE = 10 * 1024 * 1024

router = APIRouter()


class NoteUpdate(BaseModel):
    text: str


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

    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Разрешены JPG, PNG, WEBP и PDF")

    try:
        image = Image.open(BytesIO(content))
        image.load()

        buffer = BytesIO()
        image.convert("RGB").save(buffer, format="JPEG")
        prepared_image = buffer.getvalue()
    except (UnidentifiedImageError, OSError):
        raise HTTPException(status_code=400, detail="Не удалось открыть изображение")

    image_id = str(uuid.uuid4())
    ext = suffix or ".jpg"
    file_path = UPLOAD_DIR / f"{image_id}{ext}"
    file_path.write_bytes(content)

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
        session.commit()
        session.refresh(new_note)
    except Exception:
        session.rollback()
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

    if Path(note.filename).suffix.lower() != ".pdf":
        raise HTTPException(status_code=400, detail="Эта запись не является PDF")

    pdf_path = UPLOAD_DIR / f"{note.id}.pdf"
    if not pdf_path.is_file():
        raise HTTPException(status_code=404, detail="Файл PDF не найден на сервере")

    return FileResponse(
        path=pdf_path,
        media_type="application/pdf",
        filename=Path(note.filename).name,
        content_disposition_type="inline",
    )


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
    pdf_path = UPLOAD_DIR / f"{note.id}.pdf"
    is_pdf = Path(note.filename).suffix.lower() == ".pdf"

    try:
        session.delete(note)
        session.commit()
    except Exception:
        session.rollback()
        logger.exception("Ошибка удаления записи")
        raise HTTPException(status_code=500, detail="Не удалось удалить запись")

    if is_pdf and pdf_path.is_file():
        try:
            pdf_path.unlink()
        except OSError:
            logger.exception("Не удалось удалить файл PDF: %s", pdf_path)

    return {"message": "Запись удалена", "id": note_id}
