"""Private file storage for recordings. Paths are built only from database ids, never from user input."""
from pathlib import Path
import shutil

from ..config import get_settings


def interview_dir(user_id: int, interview_id: int) -> Path:
    d = get_settings().storage_dir.resolve() / f"user_{user_id}" / f"interview_{interview_id}"
    d.mkdir(parents=True, exist_ok=True)
    return d


def resolve(stored: str) -> Path:
    root = get_settings().storage_dir.resolve()
    p = (root / stored).resolve()
    if root not in p.parents:
        raise ValueError("Invalid storage path")
    return p


def relative(p: Path) -> str:
    return str(p.resolve().relative_to(get_settings().storage_dir.resolve()))


def delete_interview_files(user_id: int, interview_id: int) -> None:
    d = get_settings().storage_dir.resolve() / f"user_{user_id}" / f"interview_{interview_id}"
    shutil.rmtree(d, ignore_errors=True)


def delete_user_files(user_id: int) -> None:
    shutil.rmtree(get_settings().storage_dir.resolve() / f"user_{user_id}", ignore_errors=True)
