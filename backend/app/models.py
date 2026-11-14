import uuid
from typing import Any, Optional

from .database import get_db_connection

STATUS_DESCRIPTIONS: dict[str, str] = {
    "completed": "Text extracted successfully across all readable pages.",
    "ocr_required": "Scanned PDF detected with no extractable text. OCR processing is required.",
    "password_protected": "PDF is password-protected or encrypted and cannot be extracted.",
    "corrupted": "PDF file is corrupted or unreadable.",
    "failed": "Unexpected error while processing PDF.",
}


def get_status_message(status: str) -> str:
    return STATUS_DESCRIPTIONS.get(status, "Unknown processing status.")


def _row_to_public_document(row: Any) -> dict[str, Any]:
    """Map a SQLite document row to a public dict without exposing server file_path."""
    status = row["processing_status"]
    return {
        "id": row["id"],
        "filename": row["filename"],
        "title": row["title"],
        "category": row["category"],
        "department": row["department"],
        "semester": row["semester"],
        "academic_year": row["academic_year"],
        "upload_date": row["upload_date"],
        "processing_status": status,
        "status_message": get_status_message(status),
        "page_count": int(row["page_count"]) if "page_count" in row.keys() else 0,
    }


class DocumentRepository:
    """Persistence layer for documents and extracted_pages (SQLite implementation)."""

    @staticmethod
    def create_document_with_pages(
        *,
        doc_id: str,
        filename: str,
        title: str,
        category: str,
        department: str,
        semester: Optional[str],
        academic_year: str,
        upload_date: str,
        file_path: str,
        processing_status: str,
        pages: list[tuple[int, str]],
    ) -> dict[str, Any]:
        with get_db_connection() as conn:
            conn.execute(
                """
                INSERT INTO documents (
                    id, filename, title, category, department,
                    semester, academic_year, upload_date, file_path, processing_status
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    doc_id,
                    filename,
                    title,
                    category,
                    department,
                    semester,
                    academic_year,
                    upload_date,
                    file_path,
                    processing_status,
                ),
            )

            if pages:
                conn.executemany(
                    """
                    INSERT INTO extracted_pages (id, document_id, page_number, extracted_text)
                    VALUES (?, ?, ?, ?)
                    """,
                    [
                        (str(uuid.uuid4()), doc_id, page_number, extracted_text)
                        for page_number, extracted_text in pages
                    ],
                )

            row = conn.execute(
                """
                SELECT d.*,
                       COUNT(p.id) AS page_count
                FROM documents d
                LEFT JOIN extracted_pages p ON p.document_id = d.id
                WHERE d.id = ?
                GROUP BY d.id
                """,
                (doc_id,),
            ).fetchone()

        return _row_to_public_document(row)

    @staticmethod
    def list_documents(
        *,
        category: Optional[str] = None,
        search: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        query = """
            SELECT d.*,
                   COUNT(p.id) AS page_count
            FROM documents d
            LEFT JOIN extracted_pages p ON p.document_id = d.id
        """
        conditions: list[str] = []
        params: list[Any] = []

        if category and category != "All":
            conditions.append("d.category = ?")
            params.append(category)

        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(
                "(d.title LIKE ? OR d.filename LIKE ? OR d.department LIKE ? OR d.academic_year LIKE ?)"
            )
            params.extend([term, term, term, term])

        if conditions:
            query += " WHERE " + " AND ".join(conditions)

        query += " GROUP BY d.id ORDER BY d.upload_date DESC"

        with get_db_connection() as conn:
            rows = conn.execute(query, params).fetchall()

        return [_row_to_public_document(row) for row in rows]

    @staticmethod
    def get_document(document_id: str) -> Optional[dict[str, Any]]:
        with get_db_connection() as conn:
            row = conn.execute(
                """
                SELECT d.*,
                       COUNT(p.id) AS page_count
                FROM documents d
                LEFT JOIN extracted_pages p ON p.document_id = d.id
                WHERE d.id = ?
                GROUP BY d.id
                """,
                (document_id,),
            ).fetchone()

        if row is None:
            return None
        return _row_to_public_document(row)

    @staticmethod
    def get_document_pages(document_id: str) -> list[dict[str, Any]]:
        with get_db_connection() as conn:
            rows = conn.execute(
                """
                SELECT id, document_id, page_number, extracted_text
                FROM extracted_pages
                WHERE document_id = ?
                ORDER BY page_number ASC
                """,
                (document_id,),
            ).fetchall()

        return [
            {
                "id": row["id"],
                "document_id": row["document_id"],
                "page_number": int(row["page_number"]),
                "extracted_text": row["extracted_text"],
            }
            for row in rows
        ]

    @staticmethod
    def delete_document(document_id: str) -> Optional[str]:
        """
        Delete a document and its cascade-linked extracted_pages rows.
        Returns the internal file_path for cleanup by the caller, or None if not found.
        """
        with get_db_connection() as conn:
            row = conn.execute(
                "SELECT file_path FROM documents WHERE id = ?",
                (document_id,),
            ).fetchone()
            if row is None:
                return None

            file_path = str(row["file_path"])
            conn.execute("DELETE FROM extracted_pages WHERE document_id = ?", (document_id,))
            conn.execute("DELETE FROM documents WHERE id = ?", (document_id,))

        return file_path
