import uuid
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from paddleocr import PaddleOCR

router = APIRouter()
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

# Инициализируем OCR. lang='ru' для русского, 'en' для английского.
try:
    ocr_engine = PaddleOCR(use_doc_orientation_classify=False, use_doc_unwarping=False, use_textline_orientation=False, lang='ru')
except Exception as e:
    print(f"Ошибка инициализации OCR: {e}")
    ocr_engine = None

# Временное хранилище в памяти
NOTES: list[dict] = []

class NoteOut(BaseModel):
    id: str
    filename: str
    status: str
    text: str | None = None

@router.post("/notes", response_model=NoteOut)
async def upload_note(file: UploadFile = File(...)):
    if not ocr_engine:
        raise HTTPException(status_code=500, detail="OCR движок не загружен")

    note_id = str(uuid.uuid4())
    ext = Path(file.filename).suffix
    file_path = UPLOAD_DIR / f"{note_id}{ext}"
    
    # 1. Сохраняем файл
    file_path.write_bytes(await file.read())

    # 2. Создаем запись
    note = {"id": note_id, "filename": file.filename, "status": "processing", "text": None}
    NOTES.append(note)

    # 3. Запускаем OCR (пока синхронно, для теста)
    try:
        # В PaddleOCR 3.x метод predict возвращает список объектов
        result = ocr_engine.predict(str(file_path))
        
        full_text = ""
        if result:
            for res in result:
                # Извлекаем распознанный текст
                texts = res.get('rec_texts', [])
                if texts:
                    full_text += "\n".join(texts) + "\n"
        
        note["text"] = full_text.strip()
        note["status"] = "done"
    except Exception as e:
        print(f"Ошибка распознавания: {e}")
        note["status"] = "error"
        note["text"] = f"Не удалось распознать текст: {e}"

    return note

@router.get("/notes", response_model=list[NoteOut])
def list_notes():
    return NOTES