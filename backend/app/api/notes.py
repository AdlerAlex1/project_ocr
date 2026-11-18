import uuid
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlmodel import Session, select
from app.database import get_session
from app.models import Note, User
from app.auth import get_current_user
from paddleocr import PaddleOCR

router = APIRouter()
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

# Инициализируем OCR (как в рабочем варианте)
try:
    ocr_engine = PaddleOCR(use_doc_orientation_classify=False, use_doc_unwarping=False, use_textline_orientation=False, lang='ru')
except Exception as e:
    print(f"Ошибка инициализации OCR: {e}")
    ocr_engine = None

@router.post("/notes")
async def upload_note(
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    if not ocr_engine:
        raise HTTPException(status_code=500, detail="OCR движок не загружен")

    note_id = str(uuid.uuid4())
    ext = Path(file.filename).suffix
    file_path = UPLOAD_DIR / f"{note_id}{ext}"
    
    # 1. Сохраняем файл на диск
    file_path.write_bytes(await file.read())

    # 2. Запускаем OCR
    full_text = ""
    status = "done"
    try:
        result = ocr_engine.predict(str(file_path))
        if result:
            for res in result:
                texts = res.get('rec_texts', [])
                if texts:
                    full_text += "\n".join(texts) + "\n"
        full_text = full_text.strip()
    except Exception as e:
        print(f"Ошибка OCR: {e}")
        status = "error"
        full_text = f"Ошибка распознавания: {e}"

    # 3. Создаем запись в БД
    new_note = Note(
        filename=file.filename,
        text=full_text,
        status=status,
        user_id=current_user.id,
        subject="Без предмета"
    )
    
    session.add(new_note)
    session.commit()
    session.refresh(new_note)

    return new_note

@router.get("/notes")
def list_notes(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    # Возвращаем только конспекты текущего пользователя
    notes = session.exec(select(Note).where(Note.user_id == current_user.id)).all()
    return notes