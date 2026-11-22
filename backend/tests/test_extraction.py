import pytest

from app.services.extraction import ExtractionError, extract_text, validate_pasted_text
from conftest import SAMPLES

MB = 8 * 1024 * 1024


def test_pdf_extraction():
    text = extract_text("resume.pdf", (SAMPLES / "sample_resume.pdf").read_bytes(), MB)
    assert "DocuQuery" in text and "JNTU" in text


def test_docx_extraction():
    text = extract_text("jd.docx", (SAMPLES / "sample_job_description.docx").read_bytes(), MB)
    assert "LangGraph" in text


@pytest.mark.parametrize("name,data,msg", [
    ("x.png", b"\x89PNG....", "Unsupported file type"),
    ("x.pdf", b"not a pdf at all", "not a valid PDF"),
    ("x.docx", b"not a zip", "not a valid DOCX"),
    ("x.doc", b"whatever", ".doc files are not supported"),
    ("x.pdf", b"", "empty"),
])
def test_rejects_bad_files(name, data, msg):
    with pytest.raises(ExtractionError, match=msg):
        extract_text(name, data, MB)


def test_rejects_oversized_file():
    with pytest.raises(ExtractionError, match="larger than"):
        extract_text("big.pdf", b"%PDF" + b"0" * 100, 50)


def test_rejects_text_too_short():
    with pytest.raises(ExtractionError, match="at least"):
        validate_pasted_text("too short")
