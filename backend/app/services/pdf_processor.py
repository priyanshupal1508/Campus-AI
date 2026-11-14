import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import fitz  # PyMuPDF

from ..schemas import ProcessingStatus

PDF_MAGIC_HEADER = b"%PDF-"
ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "application/x-pdf",
    "application/octet-stream",
}


class PdfValidationError(Exception):
    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


@dataclass
class PdfExtractionResult:
    processing_status: ProcessingStatus
    pages: list[tuple[int, str]]
    detail_message: str


def sanitize_filename(raw_filename: Optional[str]) -> str:
    base_name = os.path.basename(raw_filename or "document.pdf").strip()
    if not base_name:
        base_name = "document.pdf"
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", base_name).strip("._")
    if not cleaned:
        cleaned = "document"
    if not cleaned.lower().endswith(".pdf"):
        cleaned = f"{cleaned}.pdf"
    return cleaned[:180]


def validate_pdf_upload(
    *,
    filename: Optional[str],
    content_type: Optional[str],
    data: bytes,
    max_size_bytes: int,
) -> str:
    if not filename or not filename.lower().endswith(".pdf"):
        raise PdfValidationError("Only .pdf files are permitted.", status_code=400)

    if content_type and content_type.lower() not in ALLOWED_CONTENT_TYPES:
        raise PdfValidationError(
            f"Unsupported content type '{content_type}'. Expected application/pdf.",
            status_code=400,
        )

    if len(data) == 0:
        raise PdfValidationError("Uploaded PDF file is empty.", status_code=400)

    if len(data) > max_size_bytes:
        max_mb = max_size_bytes // (1024 * 1024)
        raise PdfValidationError(
            f"File exceeds the maximum allowed size of {max_mb} MB.",
            status_code=413,
        )

    if not data.lstrip()[:5].startswith(PDF_MAGIC_HEADER):
        raise PdfValidationError(
            "Invalid file signature. The uploaded file does not appear to be a valid PDF.",
            status_code=400,
        )

    return sanitize_filename(filename)


def save_pdf_file(upload_dir: Path, doc_id: str, safe_filename: str, data: bytes) -> Path:
    upload_dir.mkdir(parents=True, exist_ok=True)
    disk_filename = f"{doc_id}_{safe_filename}"
    target_path = (upload_dir / disk_filename).resolve()

    # Ensure target stays strictly inside upload_dir
    if upload_dir.resolve() not in target_path.parents:
        raise PdfValidationError("Invalid upload destination path.", status_code=400)

    target_path.write_bytes(data)
    return target_path


def extract_text_from_pdf(file_path: Path) -> PdfExtractionResult:
    """
    Extract text page-by-page using PyMuPDF starting at page 1.
    Detects encrypted/password-protected, corrupted, empty, and scanned (OCR-required) PDFs.
    """
    doc: Optional[fitz.Document] = None
    try:
        doc = fitz.open(str(file_path))
    except (fitz.FileDataError, RuntimeError, ValueError) as exc:
        return PdfExtractionResult(
            processing_status="corrupted",
            pages=[],
            detail_message=f"Unable to open PDF with PyMuPDF: {exc}",
        )
    except Exception as exc:
        return PdfExtractionResult(
            processing_status="failed",
            pages=[],
            detail_message=f"Unexpected error opening PDF: {exc}",
        )

    try:
        if doc.needs_pass or doc.is_encrypted:
            return PdfExtractionResult(
                processing_status="password_protected",
                pages=[],
                detail_message="PDF is password-protected or encrypted and cannot be extracted without decryption.",
            )

        if doc.page_count == 0:
            return PdfExtractionResult(
                processing_status="corrupted",
                pages=[],
                detail_message="PDF contains zero pages.",
            )

        extracted_pages: list[tuple[int, str]] = []
        non_empty_chars = 0

        for page_index in range(doc.page_count):
            page_number = page_index + 1
            page = doc.load_page(page_index)
            raw_text = page.get_text("text") or ""
            normalized_text = raw_text.strip()
            non_empty_chars += len(re.sub(r"\s+", "", normalized_text))
            extracted_pages.append((page_number, normalized_text))

        if non_empty_chars == 0:
            return PdfExtractionResult(
                processing_status="ocr_required",
                pages=extracted_pages,
                detail_message=(
                    f"Scanned PDF detected across {doc.page_count} page(s) with no extractable text. "
                    "OCR processing is required."
                ),
            )

        return PdfExtractionResult(
            processing_status="completed",
            pages=extracted_pages,
            detail_message=f"Successfully extracted text from {doc.page_count} page(s).",
        )
    except (fitz.FileDataError, RuntimeError) as exc:
        return PdfExtractionResult(
            processing_status="corrupted",
            pages=[],
            detail_message=f"Corrupted PDF page stream: {exc}",
        )
    except Exception as exc:
        return PdfExtractionResult(
            processing_status="failed",
            pages=[],
            detail_message=f"Unexpected PDF extraction error: {exc}",
        )
    finally:
        if doc is not None:
            doc.close()
