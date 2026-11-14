from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import logging
import re
import secrets
from typing import Any, Optional
import uuid

import bcrypt
from fastapi import Depends, HTTPException, Request, status

from ..database import (
    ADMIN_EMAIL,
    ADMIN_FULL_NAME,
    ADMIN_PASSWORD,
    ADMIN_PASSWORD_HASH,
    APP_ENV,
    AUTH_SECRET_KEY,
    SESSION_TTL_HOURS,
    get_db_connection,
)

logger = logging.getLogger("campusai.auth")

SESSION_COOKIE_NAME = "campusai_session"
_EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_RUNTIME_EPHEMERAL_SECRET = secrets.token_hex(32)


def _get_signing_secret() -> bytes:
    secret = AUTH_SECRET_KEY or _RUNTIME_EPHEMERAL_SECRET
    return secret.encode("utf-8")


def normalize_email(raw_email: str) -> str:
    return raw_email.strip().lower()


def validate_email_format(email: str) -> str:
    normalized = normalize_email(email)
    if not _EMAIL_PATTERN.match(normalized):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please enter a valid email address.",
        )
    return normalized


def hash_password(plain_password: str) -> str:
    password_bytes = plain_password.encode("utf-8")
    if len(password_bytes) > 72:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must not exceed 72 bytes.",
        )
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password_bytes, salt).decode("utf-8")


def verify_password(plain_password: str, password_hash: str) -> bool:
    try:
        password_bytes = plain_password.encode("utf-8")
        if len(password_bytes) > 72:
            return False
        return bcrypt.checkpw(password_bytes, password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def _is_valid_bcrypt_hash(candidate: str) -> bool:
    return (
        candidate.startswith(("$2a$", "$2b$", "$2y$"))
        and len(candidate) >= 59
    )


def _compute_env_admin_fingerprint(email: str, secret_material: str) -> str:
    # Non-reversible digest used solely to detect when backend/.env admin credentials changed.
    return hmac.new(
        b"campusai-admin-env-sync",
        f"{email}:{secret_material}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _hash_session_token(raw_token: str) -> str:
    return hmac.new(
        _get_signing_secret(),
        raw_token.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _row_to_public_user(row: Any) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "full_name": str(row["full_name"]),
        "email": str(row["email"]),
        "role": str(row["role"]),
        "enrollment_number": row["enrollment_number"],
        "department": row["department"],
        "semester": row["semester"],
    }


def sync_initial_admin_account() -> None:
    """
    Seed or synchronize the predefined administrator account from backend env vars.
    Passwords are always stored as bcrypt hashes; plaintext is never persisted.
    """
    if not ADMIN_EMAIL:
        logger.warning(
            "ADMIN_EMAIL is not set in backend/.env; initial admin account will not be seeded."
        )
        return

    secret_source = ADMIN_PASSWORD_HASH or ADMIN_PASSWORD
    if not secret_source or secret_source == "SET_DEV_ADMIN_PASSWORD":
        logger.warning(
            "ADMIN_PASSWORD / ADMIN_PASSWORD_HASH is not configured in backend/.env; initial admin account is disabled."
        )
        return

    if ADMIN_PASSWORD_HASH:
        if not _is_valid_bcrypt_hash(ADMIN_PASSWORD_HASH):
            raise RuntimeError(
                "ADMIN_PASSWORD_HASH in backend/.env is not a valid bcrypt hash."
            )
        password_hash = ADMIN_PASSWORD_HASH
    else:
        password_hash = hash_password(ADMIN_PASSWORD)

    current_fingerprint = _compute_env_admin_fingerprint(ADMIN_EMAIL, secret_source)
    now_iso = datetime.now(timezone.utc).isoformat()

    with get_db_connection() as conn:
        meta_row = conn.execute(
            "SELECT value FROM auth_metadata WHERE key = 'seeded_admin_fingerprint'"
        ).fetchone()
        previous_fingerprint = str(meta_row["value"]) if meta_row else ""

        existing_admin = conn.execute(
            "SELECT id, email, role, is_predefined_admin FROM users WHERE email = ?",
            (ADMIN_EMAIL,),
        ).fetchone()

        if existing_admin is None:
            # Deactivate any older predefined admin accounts if ADMIN_EMAIL changed in .env
            old_admins = conn.execute(
                "SELECT id FROM users WHERE is_predefined_admin = 1 AND email != ?",
                (ADMIN_EMAIL,),
            ).fetchall()
            for old in old_admins:
                conn.execute(
                    "DELETE FROM auth_sessions WHERE user_id = ?",
                    (old["id"],),
                )
                conn.execute(
                    "UPDATE users SET is_active = 0, is_predefined_admin = 0, updated_at = ? WHERE id = ?",
                    (now_iso, old["id"]),
                )

            admin_id = str(uuid.uuid4())
            conn.execute(
                """
                INSERT INTO users (
                    id, full_name, email, password_hash, role,
                    enrollment_number, department, semester,
                    is_active, is_predefined_admin, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, 'admin', NULL, 'Administration', NULL, 1, 1, ?, ?)
                """,
                (admin_id, ADMIN_FULL_NAME, ADMIN_EMAIL, password_hash, now_iso, now_iso),
            )
        elif previous_fingerprint != current_fingerprint:
            # Environment admin password or email changed in backend/.env without touching code.
            conn.execute(
                """
                UPDATE users
                SET full_name = ?,
                    password_hash = ?,
                    role = 'admin',
                    is_active = 1,
                    is_predefined_admin = 1,
                    updated_at = ?
                WHERE id = ?
                """,
                (ADMIN_FULL_NAME, password_hash, now_iso, existing_admin["id"]),
            )
            conn.execute(
                "DELETE FROM auth_sessions WHERE user_id = ?",
                (existing_admin["id"],),
            )

        conn.execute(
            """
            INSERT INTO auth_metadata (key, value)
            VALUES ('seeded_admin_fingerprint', ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
            """,
            (current_fingerprint,),
        )


def register_student(
    *,
    full_name: str,
    email: str,
    enrollment_number: str,
    department: str,
    semester: str,
    password: str,
    requested_role: Optional[str] = None,
) -> dict[str, Any]:
    if requested_role is not None and requested_role.strip().lower() != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Public admin registration is disabled. Only student accounts can be registered.",
        )

    cleaned_email = validate_email_format(email)
    if ADMIN_EMAIL and cleaned_email == ADMIN_EMAIL:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This email address is reserved and cannot be used for student registration.",
        )

    cleaned_name = full_name.strip()
    cleaned_enrollment = enrollment_number.strip()
    cleaned_department = department.strip()
    cleaned_semester = semester.strip()

    if not cleaned_name or not cleaned_enrollment or not cleaned_department or not cleaned_semester:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="All student registration fields are required.",
        )

    if len(password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters long.",
        )

    password_hash = hash_password(password)
    user_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()

    with get_db_connection() as conn:
        existing = conn.execute(
            "SELECT id FROM users WHERE email = ?",
            (cleaned_email,),
        ).fetchone()
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this email address already exists.",
            )

        conn.execute(
            """
            INSERT INTO users (
                id, full_name, email, password_hash, role,
                enrollment_number, department, semester,
                is_active, is_predefined_admin, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, 'student', ?, ?, ?, 1, 0, ?, ?)
            """,
            (
                user_id,
                cleaned_name,
                cleaned_email,
                password_hash,
                cleaned_enrollment,
                cleaned_department,
                cleaned_semester,
                now_iso,
                now_iso,
            ),
        )
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()

    return _row_to_public_user(row)


def _derive_student_name_from_email(email: str) -> str:
    local_part = email.split("@")[0] if "@" in email else "Student"
    cleaned = re.sub(r"[._-]+", " ", local_part).strip()
    if not cleaned:
        return "Student"
    return " ".join(part.capitalize() for part in cleaned.split())


def authenticate_user(*, email: str, password: str, portal_role: str) -> dict[str, Any]:
    cleaned_email = validate_email_format(email)
    if not password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email and password are required.",
        )

    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE email = ?",
            (cleaned_email,),
        ).fetchone()

    if portal_role == "admin":
        if row is not None and str(row["role"]) != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: Student accounts cannot sign in to the Admin portal.",
            )

        # In development, strictly allow only the predefined environment-configured admin account.
        if APP_ENV == "development":
            if not ADMIN_EMAIL or cleaned_email != ADMIN_EMAIL:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid administrator credentials.",
                )

        if (
            row is None
            or int(row["is_active"]) != 1
            or str(row["role"]) != "admin"
            or (APP_ENV == "development" and int(row["is_predefined_admin"]) != 1)
            or not verify_password(password, str(row["password_hash"]))
        ):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid administrator email or password.",
            )
        return _row_to_public_user(row)

    # Student portal authentication: verify existing record, or record new student on first sign-in
    if row is not None and str(row["role"]) == "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Administrator accounts must sign in through the Admin portal.",
        )

    if row is None:
        password_hash = hash_password(password)
        user_id = str(uuid.uuid4())
        now_iso = datetime.now(timezone.utc).isoformat()
        full_name = _derive_student_name_from_email(cleaned_email)

        with get_db_connection() as conn:
            conn.execute(
                """
                INSERT INTO users (
                    id, full_name, email, password_hash, role,
                    enrollment_number, department, semester,
                    is_active, is_predefined_admin, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, 'student', NULL, NULL, NULL, 1, 0, ?, ?)
                """,
                (user_id, full_name, cleaned_email, password_hash, now_iso, now_iso),
            )
            created_row = conn.execute(
                "SELECT * FROM users WHERE id = ?",
                (user_id,),
            ).fetchone()
        return _row_to_public_user(created_row)

    if (
        int(row["is_active"]) != 1
        or str(row["role"]) != "student"
        or not verify_password(password, str(row["password_hash"]))
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    return _row_to_public_user(row)


def create_auth_session(user_id: str) -> str:
    raw_token = secrets.token_urlsafe(32)
    token_hash = _hash_session_token(raw_token)
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(hours=SESSION_TTL_HOURS)
    session_id = str(uuid.uuid4())

    with get_db_connection() as conn:
        conn.execute(
            "DELETE FROM auth_sessions WHERE expires_at <= ?",
            (now.isoformat(),),
        )
        conn.execute(
            """
            INSERT INTO auth_sessions (id, user_id, token_hash, expires_at, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                session_id,
                user_id,
                token_hash,
                expires_at.isoformat(),
                now.isoformat(),
            ),
        )

    return raw_token


def extract_session_token(request: Request) -> Optional[str]:
    auth_header = request.headers.get("Authorization", "").strip()
    if auth_header.lower().startswith("bearer "):
        token = auth_header[7:].strip()
        if token:
            return token

    cookie_token = request.cookies.get(SESSION_COOKIE_NAME, "").strip()
    return cookie_token or None


def resolve_user_from_token(raw_token: str) -> Optional[dict[str, Any]]:
    token_hash = _hash_session_token(raw_token)
    now_iso = datetime.now(timezone.utc).isoformat()

    with get_db_connection() as conn:
        row = conn.execute(
            """
            SELECT u.*, s.id AS session_id, s.expires_at
            FROM auth_sessions s
            INNER JOIN users u ON u.id = s.user_id
            WHERE s.token_hash = ?
            """,
            (token_hash,),
        ).fetchone()

        if row is None:
            return None

        if str(row["expires_at"]) <= now_iso or int(row["is_active"]) != 1:
            conn.execute("DELETE FROM auth_sessions WHERE id = ?", (row["session_id"],))
            return None

        if (
            APP_ENV == "development"
            and str(row["role"]) == "admin"
            and (
                not ADMIN_EMAIL
                or str(row["email"]).lower() != ADMIN_EMAIL
                or int(row["is_predefined_admin"]) != 1
            )
        ):
            return None

    user = _row_to_public_user(row)
    user["is_predefined_admin"] = bool(row["is_predefined_admin"])
    return user


def revoke_session_token(raw_token: Optional[str]) -> None:
    if not raw_token:
        return
    token_hash = _hash_session_token(raw_token)
    with get_db_connection() as conn:
        conn.execute("DELETE FROM auth_sessions WHERE token_hash = ?", (token_hash,))


def change_user_password(
    *,
    user_id: str,
    current_password: str,
    new_password: str,
    current_token: Optional[str] = None,
) -> None:
    if len(new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 8 characters long.",
        )

    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT id, password_hash FROM users WHERE id = ? AND is_active = 1",
            (user_id,),
        ).fetchone()

        if row is None or not verify_password(current_password, str(row["password_hash"])):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Current password is incorrect.",
            )

        new_hash = hash_password(new_password)
        now_iso = datetime.now(timezone.utc).isoformat()
        conn.execute(
            "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
            (new_hash, now_iso, user_id),
        )

        # Revoke any other active sessions for this user
        if current_token:
            current_hash = _hash_session_token(current_token)
            conn.execute(
                "DELETE FROM auth_sessions WHERE user_id = ? AND token_hash != ?",
                (user_id, current_hash),
            )
        else:
            conn.execute("DELETE FROM auth_sessions WHERE user_id = ?", (user_id,))


def require_current_user(request: Request) -> dict[str, Any]:
    token = extract_session_token(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please sign in.",
        )

    user = resolve_user_from_token(token)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired or invalid. Please sign in again.",
        )
    return user


def require_admin(current_user: dict[str, Any] = Depends(require_current_user)) -> dict[str, Any]:
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Administrator privileges are required for this action.",
        )

    if APP_ENV == "development":
        if (
            not ADMIN_EMAIL
            or str(current_user.get("email", "")).lower() != ADMIN_EMAIL
            or not current_user.get("is_predefined_admin")
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: Restricted to the predefined development administrator.",
            )

    return current_user
