from typing import Any, Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from ..services.chat_service import generate_chat_reply

router = APIRouter(prefix="/api", tags=["chat"])


class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1)
    session_id: str = Field(..., min_length=1)


class ChatSourceOut(BaseModel):
    document: str
    page: Optional[int | str] = None
    reference: Optional[str] = None


class ChatResponse(BaseModel):
    answer: str
    sources: list[ChatSourceOut]
    session_id: str


@router.post("/chat", response_model=ChatResponse)
def chat_endpoint(payload: ChatRequest) -> ChatResponse:
    cleaned_question = payload.question.strip()
    if not cleaned_question:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Question must not be empty.",
        )

    try:
        answer, raw_sources = generate_chat_reply(cleaned_question)
        sources = [ChatSourceOut(**src) for src in raw_sources]
        return ChatResponse(
            answer=answer,
            sources=sources,
            session_id=payload.session_id,
        )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Gemini API request failed: {exc}",
        ) from exc
