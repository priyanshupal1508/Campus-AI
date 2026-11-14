from fastapi import APIRouter, Depends, Request, Response, status

from ..database import APP_ENV, SESSION_TTL_HOURS
from ..schemas import (
    AuthResponse,
    AuthUserOut,
    ChangePasswordRequest,
    LoginRequest,
    MessageResponse,
    SessionUserResponse,
    StudentRegisterRequest,
)
from ..services.auth_service import (
    SESSION_COOKIE_NAME,
    authenticate_user,
    change_user_password,
    create_auth_session,
    extract_session_token,
    register_student,
    require_current_user,
    revoke_session_token,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=SESSION_TTL_HOURS * 3600,
        httponly=True,
        samesite="lax",
        secure=APP_ENV != "development",
        path="/",
    )


@router.post(
    "/register",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
)
def register_student_account(
    payload: StudentRegisterRequest,
    response: Response,
) -> AuthResponse:
    user = register_student(
        full_name=payload.full_name,
        email=payload.email,
        enrollment_number=payload.enrollment_number,
        department=payload.department,
        semester=payload.semester,
        password=payload.password,
        requested_role=payload.role,
    )
    token = create_auth_session(user["id"])
    _set_session_cookie(response, token)
    return AuthResponse(
        user=AuthUserOut(**user),
        access_token=token,
        message="Student account registered successfully.",
    )


@router.post("/login", response_model=AuthResponse)
def login_account(payload: LoginRequest, response: Response) -> AuthResponse:
    user = authenticate_user(
        email=payload.email,
        password=payload.password,
        portal_role=payload.role,
    )
    token = create_auth_session(user["id"])
    _set_session_cookie(response, token)
    return AuthResponse(
        user=AuthUserOut(**user),
        access_token=token,
        message="Login successful.",
    )


@router.get("/me", response_model=SessionUserResponse)
def get_current_session_user(
    current_user: dict = Depends(require_current_user),
) -> SessionUserResponse:
    return SessionUserResponse(user=AuthUserOut(**current_user))


@router.post("/logout", response_model=MessageResponse)
def logout_account(request: Request, response: Response) -> MessageResponse:
    token = extract_session_token(request)
    revoke_session_token(token)
    response.delete_cookie(key=SESSION_COOKIE_NAME, path="/")
    return MessageResponse(message="Signed out successfully.")


@router.post("/change-password", response_model=MessageResponse)
def update_password(
    payload: ChangePasswordRequest,
    request: Request,
    current_user: dict = Depends(require_current_user),
) -> MessageResponse:
    token = extract_session_token(request)
    change_user_password(
        user_id=current_user["id"],
        current_password=payload.current_password,
        new_password=payload.new_password,
        current_token=token,
    )
    return MessageResponse(message="Password updated successfully.")
