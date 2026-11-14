from typing import Literal, Optional

from pydantic import BaseModel, Field

ALLOWED_CATEGORIES = (
    "Timetable",
    "Fee Structure",
    "Syllabus",
    "Examination",
    "College Notice",
    "Admission",
    "Academic Regulations",
    "Other",
)

DocumentCategory = Literal[
    "Timetable",
    "Fee Structure",
    "Syllabus",
    "Examination",
    "College Notice",
    "Admission",
    "Academic Regulations",
    "Other",
]

ProcessingStatus = Literal[
    "completed",
    "ocr_required",
    "password_protected",
    "corrupted",
    "failed",
]


class DocumentOut(BaseModel):
    id: str
    filename: str
    title: str
    category: str
    department: str
    semester: Optional[str] = None
    academic_year: str
    upload_date: str
    processing_status: ProcessingStatus
    status_message: str
    page_count: int = Field(ge=0)


class DocumentListResponse(BaseModel):
    documents: list[DocumentOut]
    total: int


class DocumentUploadResponse(BaseModel):
    document: Optional[DocumentOut] = None
    documents: list[DocumentOut]
    message: str


class ExtractedPageOut(BaseModel):
    id: str
    document_id: str
    page_number: int = Field(ge=1)
    extracted_text: str


class DocumentContentResponse(BaseModel):
    document: DocumentOut
    pages: list[ExtractedPageOut]


class DeleteDocumentResponse(BaseModel):
    deleted: bool
    document_id: str
    message: str


UserRole = Literal["student", "admin"]


class AuthUserOut(BaseModel):
    id: str
    full_name: str
    email: str
    role: UserRole
    enrollment_number: Optional[str] = None
    department: Optional[str] = None
    semester: Optional[str] = None


class StudentRegisterRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=120)
    email: str = Field(..., min_length=5, max_length=254)
    enrollment_number: str = Field(..., min_length=2, max_length=64)
    department: str = Field(..., min_length=2, max_length=120)
    semester: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=8, max_length=128)
    role: Optional[str] = None


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=254)
    password: str = Field(..., min_length=1, max_length=128)
    role: UserRole


class AuthResponse(BaseModel):
    user: AuthUserOut
    access_token: str
    message: str


class SessionUserResponse(BaseModel):
    user: AuthUserOut


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=128)
    new_password: str = Field(..., min_length=8, max_length=128)


class MessageResponse(BaseModel):
    message: str
