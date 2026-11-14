from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Optional
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status

from ..database import MAX_UPLOAD_SIZE_BYTES, UPLOAD_DIR
from ..models import DocumentRepository
from ..schemas import (
    ALLOWED_CATEGORIES,
    DeleteDocumentResponse,
    DocumentContentResponse,
    DocumentListResponse,
    DocumentOut,
    DocumentUploadResponse,
)
from ..services.auth_service import require_admin
from ..services.pdf_processor import (
    PdfValidationError,
    extract_text_from_pdf,
    save_pdf_file,
    validate_pdf_upload,
)

router = APIRouter(
    prefix="/api/documents",
    tags=["documents"],
    dependencies=[Depends(require_admin)],
)


def _parse_json_str_list(raw: Optional[str]) -> Optional[list[Optional[str]]]:
    if not raw or not raw.strip():
        return None
    try:
        parsed = json.loads(raw)
        if not isinstance(parsed, list):
            return None
        return [v.strip() if isinstance(v, str) else None for v in parsed]
    except json.JSONDecodeError:
        return None


async def _read_upload_with_limit(upload: UploadFile, max_bytes: int) -> bytes:
    chunks: list[bytes] = []
    total = 0
    chunk_size = 1024 * 1024  # 1 MB chunks
    while True:
        chunk = await upload.read(chunk_size)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            max_mb = max_bytes // (1024 * 1024)
            raise PdfValidationError(
                f"File '{upload.filename or 'upload.pdf'}' exceeds the {max_mb} MB size limit.",
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            )
        chunks.append(chunk)
    return b"".join(chunks)


@router.post(
    "/upload",
    response_model=DocumentUploadResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_documents(
    file: Optional[UploadFile] = File(None),
    files: Optional[list[UploadFile]] = File(None),
    title: Optional[str] = Form(None),
    category: str = Form(...),
    academic_year: str = Form(...),
    department: str = Form(...),
    semester: Optional[str] = Form(None),
    titles_json: Optional[str] = Form(None),
    categories_json: Optional[str] = Form(None),
    academic_years_json: Optional[str] = Form(None),
    departments_json: Optional[str] = Form(None),
    semesters_json: Optional[str] = Form(None),
) -> DocumentUploadResponse:
    default_category = category.strip()
    cleaned_year = academic_year.strip()
    cleaned_department = department.strip()
    cleaned_semester = semester.strip() if semester and semester.strip() else None

    titles_arr = _parse_json_str_list(titles_json)
    categories_arr = _parse_json_str_list(categories_json)
    years_arr = _parse_json_str_list(academic_years_json)
    departments_arr = _parse_json_str_list(departments_json)
    semesters_arr = _parse_json_str_list(semesters_json)

    incoming_files: list[UploadFile] = []
    if file is not None:
        incoming_files.append(file)
    if files:
        incoming_files.extend(files)

    if not incoming_files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one PDF file must be provided.",
        )

    processed_docs: list[DocumentOut] = []
    status_notes: list[str] = []

    for index, upload in enumerate(incoming_files):
        item_category = (
            categories_arr[index]
            if categories_arr and index < len(categories_arr) and categories_arr[index]
            else default_category
        )
        item_year = (
            years_arr[index]
            if years_arr and index < len(years_arr) and years_arr[index]
            else cleaned_year
        )
        item_department = (
            departments_arr[index]
            if departments_arr and index < len(departments_arr) and departments_arr[index]
            else cleaned_department
        )
        item_semester = (
            semesters_arr[index] or None
            if semesters_arr and index < len(semesters_arr)
            else cleaned_semester
        )

        if item_category not in ALLOWED_CATEGORIES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid category '{item_category}'. Allowed categories: {', '.join(ALLOWED_CATEGORIES)}.",
            )
        if not item_year:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Academic year is required.",
            )
        if not item_department:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Department or branch is required.",
            )

        try:
            raw_bytes = await _read_upload_with_limit(upload, MAX_UPLOAD_SIZE_BYTES)
            safe_filename = validate_pdf_upload(
                filename=upload.filename,
                content_type=upload.content_type,
                data=raw_bytes,
                max_size_bytes=MAX_UPLOAD_SIZE_BYTES,
            )
        except PdfValidationError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
        finally:
            await upload.close()

        doc_id = str(uuid.uuid4())
        saved_path = save_pdf_file(UPLOAD_DIR, doc_id, safe_filename, raw_bytes)
        extraction = extract_text_from_pdf(saved_path)

        default_title = Path(safe_filename).stem.replace("_", " ").strip() or safe_filename
        explicit_title = (
            titles_arr[index]
            if titles_arr and index < len(titles_arr) and titles_arr[index]
            else None
        )
        resolved_title = (
            explicit_title
            or (
                title.strip()
                if title and title.strip() and len(incoming_files) == 1
                else (f"{title.strip()} ({index + 1})" if title and title.strip() else default_title)
            )
        )

        upload_timestamp = datetime.now(timezone.utc).isoformat()
        created = DocumentRepository.create_document_with_pages(
            doc_id=doc_id,
            filename=safe_filename,
            title=resolved_title,
            category=item_category,
            department=item_department,
            semester=item_semester,
            academic_year=item_year,
            upload_date=upload_timestamp,
            file_path=str(saved_path),
            processing_status=extraction.processing_status,
            pages=extraction.pages,
        )
        processed_docs.append(DocumentOut(**created))
        status_notes.append(f"{safe_filename}: {extraction.detail_message}")

    return DocumentUploadResponse(
        document=processed_docs[0] if len(processed_docs) == 1 else None,
        documents=processed_docs,
        message=" | ".join(status_notes),
    )


@router.get("", response_model=DocumentListResponse)
def list_documents(
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
) -> DocumentListResponse:
    rows = DocumentRepository.list_documents(category=category, search=search)
    docs = [DocumentOut(**row) for row in rows]
    return DocumentListResponse(documents=docs, total=len(docs))


@router.get("/{document_id}", response_model=DocumentOut)
def get_document(document_id: str) -> DocumentOut:
    row = DocumentRepository.get_document(document_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found.",
        )
    return DocumentOut(**row)


@router.get("/{document_id}/content", response_model=DocumentContentResponse)
def get_document_content(document_id: str) -> DocumentContentResponse:
    row = DocumentRepository.get_document(document_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found.",
        )
    pages = DocumentRepository.get_document_pages(document_id)
    return DocumentContentResponse(
        document=DocumentOut(**row),
        pages=pages,
    )


@router.delete("/{document_id}", response_model=DeleteDocumentResponse)
def delete_document(document_id: str) -> DeleteDocumentResponse:
    file_path_str = DocumentRepository.delete_document(document_id)
    if file_path_str is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found.",
        )

    # Remove physical PDF safely if present inside UPLOAD_DIR
    try:
        candidate = Path(file_path_str).resolve()
        if UPLOAD_DIR.resolve() in candidate.parents and candidate.is_file():
            candidate.unlink()
    except OSError:
        pass

    return DeleteDocumentResponse(
        deleted=True,
        document_id=document_id,
        message="Document and extracted page text deleted.",
    )
