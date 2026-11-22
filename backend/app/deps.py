from fastapi import Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .database import get_db
from .models import Interview, User
from .security import decode_access_token

bearer = HTTPBearer(auto_error=False)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    token: str | None = Query(default=None, description="Only for media URLs used directly in <video src>"),
    db: Session = Depends(get_db),
) -> User:
    raw = creds.credentials if creds else token
    user_id = decode_access_token(raw) if raw else None
    user = db.get(User, user_id) if user_id else None
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in to continue.", headers={"WWW-Authenticate": "Bearer"})
    return user


def owned_interview(interview_id: int, user: User, db: Session) -> Interview:
    iv = db.get(Interview, interview_id)
    if not iv or iv.user_id != user.id:  # never reveal other users' interviews exist
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Interview not found.")
    return iv
