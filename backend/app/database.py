from sqlmodel import create_engine, Session
from app.models import User, Note, NoteAsset, NoteAnnotation

# Для продакшена меняй на postgresql://user:pass@host/db
SQLALCHEMY_DATABASE_URL = "sqlite:///./site_ocr.db"

engine = create_engine(SQLALCHEMY_DATABASE_URL, echo=False, future=True)

def get_session():
    with Session(engine) as session:
        yield session

# Создаем таблицы при старте (для простоты в одном файле)
from sqlmodel import SQLModel
SQLModel.metadata.create_all(engine)
