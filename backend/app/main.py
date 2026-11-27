import os
import mimetypes
import uuid
from pathlib import Path
from datetime import datetime, timezone
from enum import Enum
from typing import Generator

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, Response, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, Integer, String, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://tenderai:tenderai_dev@localhost:5433/tenderai",
)
engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class AnalysisStatus(str, Enum):
    draft = "draft"
    in_progress = "in_progress"
    completed = "completed"


class Analysis(Base):
    __tablename__ = "analyses"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    status: Mapped[AnalysisStatus] = mapped_column(
        SAEnum(AnalysisStatus, name="analysis_status"),
        default=AnalysisStatus.draft,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc), nullable=False
    )


class AnalysisCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)


class AnalysisUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    status: AnalysisStatus | None = None


class AnalysisRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    description: str | None
    status: AnalysisStatus
    created_at: datetime
    updated_at: datetime


UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "/data/uploads"))
MAX_FILE_SIZE = 25 * 1024 * 1024
ALLOWED_EXTENSIONS = {".pdf", ".docx", ".xlsx", ".txt"}


class AnalysisDocument(Base):
    __tablename__ = "analysis_documents"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    analysis_id: Mapped[int] = mapped_column(
        ForeignKey("analyses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    original_name: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    extension: Mapped[str] = mapped_column(String(12), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )


class DocumentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    analysis_id: int
    original_name: str
    extension: str
    size_bytes: int
    uploaded_at: datetime


app = FastAPI(title="TenderAI API", version="0.3.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def create_tables() -> None:
    Base.metadata.create_all(bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "tender-ai-api"}


@app.get("/api/analyses", response_model=list[AnalysisRead])
def list_analyses(db: Session = Depends(get_db)) -> list[Analysis]:
    return list(db.scalars(select(Analysis).order_by(Analysis.updated_at.desc())))


@app.post("/api/analyses", response_model=AnalysisRead, status_code=status.HTTP_201_CREATED)
def create_analysis(payload: AnalysisCreate, db: Session = Depends(get_db)) -> Analysis:
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="Название не может быть пустым")
    item = Analysis(title=title, description=payload.description)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@app.get("/api/analyses/{analysis_id}", response_model=AnalysisRead)
def get_analysis(analysis_id: int, db: Session = Depends(get_db)) -> Analysis:
    item = db.get(Analysis, analysis_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Анализ не найден")
    return item


@app.patch("/api/analyses/{analysis_id}", response_model=AnalysisRead)
def update_analysis(
    analysis_id: int, payload: AnalysisUpdate, db: Session = Depends(get_db)
) -> Analysis:
    item = db.get(Analysis, analysis_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Анализ не найден")
    changes = payload.model_dump(exclude_unset=True)
    if "title" in changes:
        changes["title"] = changes["title"].strip()
        if not changes["title"]:
            raise HTTPException(status_code=422, detail="Название не может быть пустым")
    for key, value in changes.items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


@app.get("/api/analyses/{analysis_id}/documents", response_model=list[DocumentRead])
def list_documents(analysis_id: int, db: Session = Depends(get_db)) -> list[AnalysisDocument]:
    if db.get(Analysis, analysis_id) is None:
        raise HTTPException(status_code=404, detail="Анализ не найден")
    return list(db.scalars(
        select(AnalysisDocument)
        .where(AnalysisDocument.analysis_id == analysis_id)
        .order_by(AnalysisDocument.uploaded_at.desc())
    ))


@app.post(
    "/api/analyses/{analysis_id}/documents",
    response_model=DocumentRead,
    status_code=status.HTTP_201_CREATED,
)
async def upload_document(
    analysis_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> AnalysisDocument:
    if db.get(Analysis, analysis_id) is None:
        raise HTTPException(status_code=404, detail="Анализ не найден")
    original_name = Path(file.filename or "document").name
    extension = Path(original_name).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail="Поддерживаются файлы PDF, DOCX, XLSX и TXT",
        )
    content = await file.read(MAX_FILE_SIZE + 1)
    if not content:
        raise HTTPException(status_code=422, detail="Файл пуст")
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="Максимальный размер файла — 25 МБ")

    stored_name = f"{uuid.uuid4().hex}{extension}"
    target_dir = UPLOAD_DIR / str(analysis_id)
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / stored_name
    target_path.write_bytes(content)

    item = AnalysisDocument(
        analysis_id=analysis_id,
        original_name=original_name[:255],
        stored_name=stored_name,
        extension=extension,
        size_bytes=len(content),
    )
    try:
        db.add(item)
        db.commit()
        db.refresh(item)
    except Exception:
        db.rollback()
        target_path.unlink(missing_ok=True)
        raise
    return item


@app.get("/api/analyses/{analysis_id}/documents/{document_id}/download")
def download_document(
    analysis_id: int, document_id: int, db: Session = Depends(get_db)
) -> Response:
    from fastapi.responses import FileResponse

    item = db.get(AnalysisDocument, document_id)
    if item is None or item.analysis_id != analysis_id:
        raise HTTPException(status_code=404, detail="Документ не найден")
    path = UPLOAD_DIR / str(analysis_id) / item.stored_name
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Файл не найден в хранилище")
    return FileResponse(path, filename=item.original_name)


@app.delete(
    "/api/analyses/{analysis_id}/documents/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_document(
    analysis_id: int, document_id: int, db: Session = Depends(get_db)
) -> Response:
    item = db.get(AnalysisDocument, document_id)
    if item is None or item.analysis_id != analysis_id:
        raise HTTPException(status_code=404, detail="Документ не найден")
    path = UPLOAD_DIR / str(analysis_id) / item.stored_name

    # Delete only the requested document. Other documents belonging to the
    # same analysis must remain available for download.
    db.delete(item)
    db.commit()

    path.unlink(missing_ok=True)
    try:
        (UPLOAD_DIR / str(analysis_id)).rmdir()
    except OSError:
        # The directory is not empty when other documents still exist.
        pass
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.delete("/api/analyses/{analysis_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_analysis(analysis_id: int, db: Session = Depends(get_db)) -> Response:
    item = db.get(Analysis, analysis_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Анализ не найден")
    documents = list(db.scalars(
        select(AnalysisDocument).where(AnalysisDocument.analysis_id == analysis_id)
    ))
    for document in documents:
        (UPLOAD_DIR / str(analysis_id) / document.stored_name).unlink(missing_ok=True)
        db.delete(document)
    db.delete(item)
    db.commit()
    try:
        (UPLOAD_DIR / str(analysis_id)).rmdir()
    except OSError:
        pass
    return Response(status_code=status.HTTP_204_NO_CONTENT)
