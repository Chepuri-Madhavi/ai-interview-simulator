"""Text extraction and validation for uploaded resumes and job descriptions."""
import io
import re

from docx import Document as DocxDocument
from pypdf import PdfReader
from pypdf.errors import PdfReadError

PDF_MAGIC = b"%PDF"
ZIP_MAGIC = b"PK\x03\x04"  # .docx files are zip archives
MIN_CHARS = 150
MAX_PAGES = 20


class ExtractionError(ValueError):
    """A user-facing problem with an uploaded file."""


def _clean(text: str) -> str:
    text = text.replace("\x00", "")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n\s*\n\s*\n+", "\n\n", text)
    return text.strip()


def extract_text(filename: str, data: bytes, max_bytes: int) -> str:
    name = (filename or "").lower()
    if not data:
        raise ExtractionError("The file is empty.")
    if len(data) > max_bytes:
        raise ExtractionError(f"The file is larger than {max_bytes // (1024 * 1024)} MB. Upload a smaller file.")

    if name.endswith(".pdf"):
        if not data.startswith(PDF_MAGIC):
            raise ExtractionError("This file is not a valid PDF.")
        try:
            reader = PdfReader(io.BytesIO(data))
            if reader.is_encrypted:
                raise ExtractionError("This PDF is password-protected. Remove the password and upload it again.")
            pages = [p.extract_text() or "" for p in reader.pages[:MAX_PAGES]]
        except PdfReadError as e:
            raise ExtractionError("The PDF could not be read. Try exporting it again.") from e
        text = "\n\n".join(pages)
    elif name.endswith(".docx"):
        if not data.startswith(ZIP_MAGIC):
            raise ExtractionError("This file is not a valid DOCX document.")
        try:
            doc = DocxDocument(io.BytesIO(data))
        except Exception as e:  # python-docx raises several types for corrupt files
            raise ExtractionError("The DOCX file could not be read.") from e
        parts = [p.text for p in doc.paragraphs]
        for table in doc.tables:
            for row in table.rows:
                parts.append(" | ".join(c.text for c in row.cells))
        text = "\n".join(parts)
    elif name.endswith(".txt"):
        text = data.decode("utf-8", errors="replace")
    elif name.endswith(".doc"):
        raise ExtractionError("Old .doc files are not supported. Save it as .docx or PDF and upload again.")
    else:
        raise ExtractionError("Unsupported file type. Upload a PDF or DOCX file.")

    text = _clean(text)
    if len(text) < MIN_CHARS:
        raise ExtractionError(
            "Very little text was found. If this is a scanned image, export a text-based PDF or paste the text instead."
        )
    return text


def validate_pasted_text(text: str) -> str:
    text = _clean(text or "")
    if len(text) < MIN_CHARS:
        raise ExtractionError(f"Add more text: at least {MIN_CHARS} characters are needed.")
    if len(text) > 60_000:
        raise ExtractionError("The text is too long. Keep it under 60,000 characters.")
    return text
