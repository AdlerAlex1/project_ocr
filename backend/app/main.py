from fastapi import FastAPI, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select
from pydantic import BaseModel # <--- ДОБАВИТЬ
from app.database import create_db_and_tables, get_session
from app.models import User
from app.auth import get_password_hash, verify_password, create_access_token
from app.api import notes

app = FastAPI(title="Notes OCR API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    create_db_and_tables()

# --- НОВАЯ МОДЕЛЬ ДЛЯ РЕГИСТРАЦИИ ---
class UserCreate(BaseModel):
    email: str
    password: str

@app.post("/register")
def register(user_data: UserCreate, session: Session = Depends(get_session)):
    # Проверка, что такой email уже не занят
    existing_user = session.exec(select(User).where(User.email == user_data.email)).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user = User(email=user_data.email, hashed_password=get_password_hash(user_data.password))
    session.add(user)
    session.commit()
    return {"message": "User created successfully"}

@app.post("/token")
def login(form_data: OAuth2PasswordRequestForm = Depends(), session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.email == form_data.username)).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    
    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}

app.include_router(notes.router, prefix="/api")

@app.get("/health")
def health():
    return {"status": "ok"}