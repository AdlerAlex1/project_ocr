from typing import Optional
from sqlmodel import SQLModel, Field

class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(unique=True, index=True)
    hashed_password: str
    # Пока без личного кабинета, просто добавим поле для будущего

class Note(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    filename: str
    text: str
    status: str
    user_id: Optional[int] = Field(default=None, foreign_key="user.id") # Привязка к юзеру
    subject: Optional[str] = Field(default=None) # Пока просто строка для предмета