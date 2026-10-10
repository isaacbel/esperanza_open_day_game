import time
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, HTTPException, Header, Request, status
from sqlalchemy.orm import Session
from ..database import get_db
from ..schemas import LeaderboardCreate, LeaderboardResponse
from ..config import settings
from ..services.leaderboard_service import (
    get_top_leaderboard,
    create_leaderboard_entry,
    clear_leaderboard
)

router = APIRouter(prefix="/api/leaderboard", tags=["Leaderboard"])

MODE_PATTERN = r"^(NORMAL|SURVIVAL|TIME_ATTACK|ZEN|CHAOS|TWO_HANDS|NIGHTMARE|TRAINING|TUTORIAL|ENDLESS)$"

# Lightweight in-memory rate limiter for score submissions (sliding window per IP)
_submission_timestamps: dict[str, list[float]] = {}
MAX_SUBMISSIONS_PER_MINUTE = 30

def check_rate_limit(request: Request) -> None:
    client_ip = request.client.host if request.client else "unknown"
    now = time.time()
    cutoff = now - 60.0
    history = _submission_timestamps.setdefault(client_ip, [])
    # Clean old entries
    _submission_timestamps[client_ip] = [t for t in history if t > cutoff]
    if len(_submission_timestamps[client_ip]) >= MAX_SUBMISSIONS_PER_MINUTE:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Please wait before submitting another score."
        )
    _submission_timestamps[client_ip].append(now)

@router.get("", response_model=List[LeaderboardResponse])
def get_leaderboard(
    mode: str = Query("NORMAL", pattern=MODE_PATTERN, description="Mode filter"),
    limit: int = Query(5, ge=1, le=50, description="Max scores to return"),
    db: Session = Depends(get_db)
):
    """Retrieve top leaderboard rankings for the specified mode."""
    items = get_top_leaderboard(db, mode=mode, limit=limit)
    return [
        LeaderboardResponse(
            id=item.id,
            playerName=item.player_name,
            score=item.score,
            maxCombo=item.max_combo,
            caught=item.caught,
            missed=item.missed,
            accuracy=item.accuracy,
            mode=item.mode,
            createdAt=item.created_at
        )
        for item in items
    ]

@router.post("", response_model=LeaderboardResponse, status_code=status.HTTP_201_CREATED)
def submit_score(
    payload: LeaderboardCreate,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Submit a completed game session score.
    Input is sanitized and validated against statistical constraints.
    """
    check_rate_limit(request)

    if payload.caught > 0 and payload.score == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Inconsistent score payload: caught columns with zero score."
        )

    if payload.caught == 0 and payload.score > 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Inconsistent score payload: zero columns caught but non-zero score reported."
        )

    # Maximum possible score estimation guard (prevents absurd hacked numbers)
    multiplier_ceiling = 1500 if payload.mode == "NIGHTMARE" else 800
    max_plausible_score = payload.caught * multiplier_ceiling + 1000
    if payload.score > max_plausible_score:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Score rejected: mathematically implausible for reported caught column count."
        )

    item = create_leaderboard_entry(db, payload)
    return LeaderboardResponse(
        id=item.id,
        playerName=item.player_name,
        score=item.score,
        maxCombo=item.max_combo,
        caught=item.caught,
        missed=item.missed,
        accuracy=item.accuracy,
        mode=item.mode,
        createdAt=item.created_at
    )

@router.delete("", status_code=status.HTTP_200_OK)
def reset_leaderboard(
    mode: Optional[str] = Query(None, pattern=MODE_PATTERN),
    x_admin_key: Optional[str] = Header(None, alias="X-Admin-Key"),
    db: Session = Depends(get_db)
):
    """Reset leaderboard entries for a given mode or all. Requires admin authorization header."""
    # Allow local development reset if admin key matches or in debug mode
    if not settings.debug and x_admin_key != settings.admin_key:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin authorization required to clear leaderboard records."
        )

    deleted = clear_leaderboard(db, mode=mode)
    return {"status": "success", "deleted": deleted, "mode": mode or "ALL"}

