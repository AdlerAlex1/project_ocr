from sqlmodel import SQLModel, create_engine, Session

# Файл базы данных появится в папке backend
sqlite_file_name = "database.db"
sqlite_url = f"sqlite:///{sqlite_file_name}"

# check_same_thread=False нужен для работы FastAPI с SQLite в разных потоках [citation:1][citation:4]
connect_args = {"check_same_thread": False}
engine = create_engine(sqlite_url, connect_args=connect_args)

def create_db_and_tables():
    SQLModel.metadata.create_all(engine)

# Зависимость для получения сессии БД в роутах
def get_session():
    with Session(engine) as session:
        yield session