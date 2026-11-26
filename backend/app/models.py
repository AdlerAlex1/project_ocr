from datetime import datetime, timezone
from typing import Optional
from sqlmodel import Field, SQLModel

class User(SQLModel, table=True):
    __tablename__ = "users"

    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(unique=True, index=True)
    hashed_password: str

class Note(SQLModel, table=True):
    __tablename__ = "notes"

    id: Optional[int] = Field(default=None, primary_key=True)
    filename: str
    text: str | None
    status: str  # "done", "error"
    user_id: int = Field(foreign_key="users.id", index=True)
    subject: str = "Без предмета"

class NoteAsset(SQLModel, table=True):
    __tablename__ = "note_assets"

    note_id: int = Field(foreign_key="notes.id", primary_key=True)
    storage_key: str
    media_type: str

class NoteAnnotation(SQLModel, table=True):
    __tablename__ = "note_annotations"

    note_id: int = Field(foreign_key="notes.id", primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    image_width: int
    image_height: int
    fabric_json: str
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
