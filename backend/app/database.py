import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from dotenv import load_dotenv

BACKEND_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_ROOT / ".env", override=True)

APP_ENV = os.getenv("APP_ENV", "development")

_raw_db_path = os.getenv("SQLITE_DB_PATH", "./campusai.db")
SQLITE_DB_PATH = (
    Path(_raw_db_path)
    if Path(_raw_db_path).is_absolute()
    else (BACKEND_ROOT / _raw_db_path).resolve()
)

_raw_upload_dir = os.getenv("UPLOAD_DIR", "./uploads")
UPLOAD_DIR = (
    Path(_raw_upload_dir)
    if Path(_raw_upload_dir).is_absolute()
    else (BACKEND_ROOT / _raw_upload_dir).resolve()
)

MAX_UPLOAD_SIZE_MB = int(os.getenv("MAX_UPLOAD_SIZE_MB", "20"))
MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024

_raw_cors = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173",
)
CORS_ORIGINS = [origin.strip() for origin in _raw_cors.split(",") if origin.strip()]

# Auth configuration loaded strictly from backend environment variables (no hardcoded credentials)
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "").strip().lower()
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")
ADMIN_PASSWORD_HASH = os.getenv("ADMIN_PASSWORD_HASH", "").strip()
ADMIN_FULL_NAME = os.getenv("ADMIN_FULL_NAME", "CampusAI Administrator").strip() or "CampusAI Administrator"
AUTH_SECRET_KEY = os.getenv("AUTH_SECRET_KEY", "").strip()
SESSION_TTL_HOURS = int(os.getenv("SESSION_TTL_HOURS", "24"))

# Future Supabase migration config placeholders (unused in initial SQLite mode)
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()


def ensure_storage_ready() -> None:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    SQLITE_DB_PATH.parent.mkdir(parents=True, exist_ok=True)


@contextmanager
def get_db_connection() -> Iterator[sqlite3.Connection]:
    ensure_storage_ready()
    conn = sqlite3.connect(str(SQLITE_DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    """Initialize SQLite tables for documents, extracted pages, users, and auth sessions."""
    with get_db_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                filename TEXT NOT NULL,
                title TEXT NOT NULL,
                category TEXT NOT NULL,
                department TEXT NOT NULL,
                semester TEXT,
                academic_year TEXT NOT NULL,
                upload_date TEXT NOT NULL,
                file_path TEXT NOT NULL,
                processing_status TEXT NOT NULL
            );
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS extracted_pages (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL,
                page_number INTEGER NOT NULL,
                extracted_text TEXT NOT NULL,
                FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
            );
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_extracted_pages_doc_page
            ON extracted_pages (document_id, page_number);
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                full_name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL CHECK (role IN ('student', 'admin')),
                enrollment_number TEXT,
                department TEXT,
                semester TEXT,
                is_active INTEGER NOT NULL DEFAULT 1,
                is_predefined_admin INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_users_email
            ON users (email);
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS auth_sessions (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                token_hash TEXT NOT NULL UNIQUE,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_auth_sessions_token_hash
            ON auth_sessions (token_hash);
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS auth_metadata (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            """
        )
