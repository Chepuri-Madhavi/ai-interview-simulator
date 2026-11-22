"""Server-side speech-to-text.

STT_PROVIDER=browser (default): the browser transcribes live with the Web Speech API and sends the text; the
server only stores the audio. STT_PROVIDER=faster_whisper: the server transcribes each uploaded answer clip locally
with faster-whisper (pip install -r requirements-stt.txt); audio never leaves your server.
"""
import logging
from functools import lru_cache
from pathlib import Path

from ..config import get_settings

log = logging.getLogger(__name__)
LANG_CODES = {"English": "en", "Telugu": "te"}


@lru_cache
def _whisper():
    from faster_whisper import WhisperModel  # optional dependency

    return WhisperModel(get_settings().whisper_model, device="auto", compute_type="int8")


def server_stt_enabled() -> bool:
    return get_settings().stt_provider == "faster_whisper"


def transcribe(path: Path, language: str) -> str | None:
    if not server_stt_enabled():
        return None
    try:
        segments, _ = _whisper().transcribe(str(path), language=LANG_CODES.get(language), vad_filter=True)
        return " ".join(s.text.strip() for s in segments).strip()
    except Exception:  # transcription is best-effort; the browser transcript remains
        log.exception("faster-whisper transcription failed")
        return None
