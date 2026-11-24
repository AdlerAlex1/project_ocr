
import uuid
import logging
from io import BytesIO
from pathlib import Path

from PIL import Image, UnidentifiedImageError

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlmodel import Session, select

from app.database import get_session
from app.api.auth import get_current_user
from app.models import Note, User
from app.ocr import recognize_image

logger = logging.getLogger(__name__)

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

ALLOWED_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp"
}

router = APIRouter()


@router.get("/notes")
async def list_notes(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    notes = session.exec(
        select(Note).where(Note.user_id == current_user.id)
    ).all()

    return notes


@router.post("/notes")
async def upload_note(
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Разрешены JPG, PNG и WEBP"
        )

    content = await file.read()

    if not content:
        raise HTTPException(
            status_code=400,
            detail="Файл пустой"
        )

    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail="Максимальный размер файла — 10 МБ"
        )

    try:
        image = Image.open(BytesIO(content))
        image.load()

        buffer = BytesIO()
        image.convert("RGB").save(buffer, format="JPEG")
        prepared_image = buffer.getvalue()

    except (UnidentifiedImageError, OSError):
        raise HTTPException(
            status_code=400,
            detail="Не удалось открыть изображение"
        )

    note_id = str(uuid.uuid4())
    ext = Path(file.filename or "image.jpg").suffix or ".jpg"
    file_path = UPLOAD_DIR / f"{note_id}{ext}"

    file_path.write_bytes(content)

    status_ = "done"
    full_text = ""
    ocr_error = None

    try:
        full_text = await recognize_image(
            prepared_image,
            mime_type="JPEG"
        )

        if not full_text.strip():
            status_ = "error"
            ocr_error = "Текст на фотографии не распознан"

    except Exception as e:
        logger.exception("Ошибка OCR")
        status_ = "error"
        ocr_error = str(e)

    new_note = Note(
        filename=file.filename or "image.jpg",
        text=full_text,
        status=status_,
        user_id=current_user.id,
        subject="Без предмета",
    )

    session.add(new_note)
    session.commit()
    session.refresh(new_note)

    return {
        "id": new_note.id,
        "filename": new_note.filename,
        "text": new_note.text,
        "status": new_note.status,
        "subject": new_note.subject,
        "ocr_error": ocr_error
    }
