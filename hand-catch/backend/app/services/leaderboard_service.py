from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import desc
from ..models import Leaderboard
from ..schemas import LeaderboardCreate

def get_top_leaderboard(db: Session, mode: str = "NORMAL", limit: int = 5) -> List[Leaderboard]:
    query = db.query(Leaderboard).filter(Leaderboard.mode == mode.upper())
    results = query.order_by(desc(Leaderboard.score), desc(Leaderboard.max_combo)).limit(limit).all()
    
    # If empty, seed initial arcade benchmark scores
    if not results:
        seed_default_scores(db)
        results = query.order_by(desc(Leaderboard.score), desc(Leaderboard.max_combo)).limit(limit).all()

    return results

def create_leaderboard_entry(db: Session, entry: LeaderboardCreate) -> Leaderboard:
    db_item = Leaderboard(
        player_name=entry.playerName,
        score=entry.score,
        max_combo=entry.maxCombo,
        caught=entry.caught,
        missed=entry.missed,
        accuracy=entry.accuracy,
        mode=entry.mode.upper()
    )
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item

def clear_leaderboard(db: Session, mode: Optional[str] = None) -> int:
    query = db.query(Leaderboard)
    if mode:
        query = query.filter(Leaderboard.mode == mode.upper())
    deleted_count = query.delete(synchronize_session=False)
    db.commit()
    return deleted_count

def seed_default_scores(db: Session):
    default_entries = [
        # Normal Mode
        Leaderboard(player_name="ACE", score=380, max_combo=10, caught=28, missed=2, accuracy=93.3, mode="NORMAL"),
        Leaderboard(player_name="NEO", score=290, max_combo=8, caught=22, missed=3, accuracy=88.0, mode="NORMAL"),
        Leaderboard(player_name="CYBER", score=210, max_combo=6, caught=18, missed=4, accuracy=81.8, mode="NORMAL"),
        # Endless Mode
        Leaderboard(player_name="TITAN", score=740, max_combo=16, caught=52, missed=3, accuracy=94.5, mode="ENDLESS"),
        Leaderboard(player_name="GHOST", score=520, max_combo=12, caught=38, missed=3, accuracy=92.7, mode="ENDLESS"),
        Leaderboard(player_name="VALKYRIE", score=360, max_combo=9, caught=27, missed=3, accuracy=90.0, mode="ENDLESS")
    ]
    db.add_all(default_entries)
    db.commit()
