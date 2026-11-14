import os
import re
from typing import Any

from google import genai
from google.genai import types

from ..database import get_db_connection

SYSTEM_INSTRUCTION = (
    "You are CampusAI, the academic assistant for Baderia Global Institute of Engineering & Management "
    "(BGIEM), Jabalpur. Keep replies brief, direct, and easy to scan (2-4 short sentences or up to 5 crisp bullets). "
    "Skip introductory greetings and never echo raw document names, filenames, or excerpts unless explicitly asked. "
    "Ground institutional numbers, dates, and schedules strictly in the provided context and never fabricate them."
)


def _tokenize_query(question: str) -> list[str]:
    stop_words = {
        "what", "the", "are", "for", "can", "find", "show", "latest",
        "where", "how", "when", "about", "tell", "give", "please",
        "this", "that", "with", "from", "have", "does", "which", "who",
    }
    normalized = question.lower()
    normalized = re.sub(r"\bb\.?\s*tech\b", "btech", normalized)
    normalized = re.sub(r"\bm\.?\s*tech\b", "mtech", normalized)
    normalized = re.sub(r"\bb\.?\s*c\.?\s*a\b", "bca", normalized)
    normalized = re.sub(r"\bm\.?\s*c\.?\s*a\b", "mca", normalized)
    normalized = re.sub(r"\bm\.?\s*b\.?\s*a\b", "mba", normalized)

    tokens: list[str] = []
    seen: set[str] = set()
    for tok in re.findall(r"[a-z0-9]{2,}", normalized):
        if tok in stop_words:
            continue
        if tok not in seen:
            seen.add(tok)
            tokens.append(tok)
        if len(tok) > 3 and tok.endswith("s") and not tok.endswith(("ss", "us", "is")):
            singular = tok[:-1]
            if singular not in stop_words and singular not in seen:
                seen.add(singular)
                tokens.append(singular)
    return tokens


def _search_relevant_pages(question: str, limit: int = 3) -> list[dict[str, Any]]:
    tokens = _tokenize_query(question)
    if not tokens:
        return []

    like_clauses = " OR ".join(
        [
            "(LOWER(p.extracted_text) LIKE ? OR LOWER(d.title) LIKE ? OR LOWER(d.filename) LIKE ? OR LOWER(d.category) LIKE ? OR LOWER(d.department) LIKE ? OR LOWER(COALESCE(d.semester, '')) LIKE ?)"
            for _ in tokens
        ]
    )
    params: list[Any] = []
    for tok in tokens:
        pattern = f"%{tok}%"
        params.extend([pattern, pattern, pattern, pattern, pattern, pattern])

    query = f"""
        SELECT d.title, d.filename, d.category, d.department, d.semester, p.page_number, p.extracted_text
        FROM extracted_pages p
        INNER JOIN documents d ON d.id = p.document_id
        WHERE d.processing_status = 'completed'
          AND LENGTH(TRIM(p.extracted_text)) > 0
          AND ({like_clauses})
    """

    with get_db_connection() as conn:
        rows = conn.execute(query, params).fetchall()

    scored: list[tuple[int, int, dict[str, Any]]] = []
    for row in rows:
        title_lower = f"{row['title']} {row['filename']}".lower()
        cat_lower = str(row["category"]).lower()
        meta_lower = f"{row['department']} {row['semester'] or ''}".lower()
        text = str(row["extracted_text"]).strip()
        text_lower = text.lower()
        score = 0
        matched_tokens = 0
        for tok in tokens:
            matched = False
            if tok in title_lower:
                score += 6
                matched = True
            if tok in cat_lower:
                score += 3
                matched = True
            if tok in meta_lower:
                score += 2
                matched = True
            if tok in text_lower:
                score += 1
                matched = True
            if matched:
                matched_tokens += 1
        score += matched_tokens * 12
        scored.append(
            (
                score,
                -int(row["page_number"]),
                {
                    "document": row["filename"] or row["title"],
                    "title": row["title"],
                    "page": int(row["page_number"]),
                    "excerpt": text[:1100],
                },
            )
        )

    scored.sort(key=lambda item: (item[0], item[1]), reverse=True)
    top_score = scored[0][0] if scored else 0
    if top_score >= 24:
        scored = [item for item in scored if item[0] >= top_score * 0.45]
    return [item[2] for item in scored[:limit]]


def generate_chat_reply(question: str) -> tuple[str, list[dict[str, Any]]]:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key or api_key == "YOUR_GEMINI_API_KEY":
        raise RuntimeError(
            "GEMINI_API_KEY is not configured in backend/.env."
        )

    matched_pages = _search_relevant_pages(question, limit=3)

    if matched_pages:
        context_blocks = [item["excerpt"] for item in matched_pages]
        prompt = (
            "Verified institutional information:\n"
            + "\n---\n".join(context_blocks)
            + f"\n\nStudent Question: {question}\n\nProvide a concise, well-structured answer without attaching or listing source documents."
        )
    else:
        prompt = f"{question}\n\nProvide a concise, direct answer."

    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model="gemini-3.1-flash-lite",
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_INSTRUCTION,
        ),
    )

    answer = (response.text or "").strip()
    if not answer:
        raise RuntimeError("Gemini returned an empty response.")

    return answer, []
