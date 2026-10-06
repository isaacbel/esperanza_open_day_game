from typing import List, Optional
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.orm import Session
from ..database import get_db
from ..schemas import LeaderboardCreate, LeaderboardResponse
from ..services.leaderboard_service import (
    get_top_leaderboard,
    create_leaderboard_entry,
    clear_leaderboard
)

router = APIRouter(prefix="/api/leaderboard", tags=["Leaderboard"])

@router.get("", response_model=List[LeaderboardResponse])
def get_leaderboard(
    mode: str = Query("NORMAL", pattern="^(NORMAL|ENDLESS|NIGHTMARE)$", description="Mode filter (NORMAL, ENDLESS, NIGHTMARE)"),
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
    db: Session = Depends(get_db)
):
    """
    Submit a completed game session score.
    Input is sanitized and validated against statistical constraints.
    """
    if payload.caught > 0 and payload.score == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Inconsistent score payload: caught columns with zero score."
        )

    # Maximum possible score estimation guard (prevents absurd hacked numbers)
    multiplier_ceiling = 1200 if payload.mode == "NIGHTMARE" else 600
    max_plausible_score = payload.caught * multiplier_ceiling + 1000
    if payload.score > max_plausible_score and payload.caught > 0:
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
    mode: Optional[str] = Query(None, pattern="^(NORMAL|ENDLESS)$"),
    db: Session = Depends(get_db)
):
    """Reset leaderboard entries for a given mode or all."""
    deleted = clear_leaderboard(db, mode=mode)
    return {"status": "success", "deleted": deleted, "mode": mode or "ALL"}
