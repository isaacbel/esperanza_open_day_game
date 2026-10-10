from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import desc
from ..models import Leaderboard
from ..schemas import LeaderboardCreate

DEFAULT_BENCHMARKS: dict[str, list[dict]] = {
    "NORMAL": [
        {"player_name": "ACE", "score": 380, "max_combo": 10, "caught": 28, "missed": 2, "accuracy": 93.3},
        {"player_name": "NEO", "score": 290, "max_combo": 8, "caught": 22, "missed": 3, "accuracy": 88.0},
        {"player_name": "CYBER", "score": 210, "max_combo": 6, "caught": 18, "missed": 4, "accuracy": 81.8},
    ],
    "SURVIVAL": [
        {"player_name": "IMMORTAL", "score": 920, "max_combo": 22, "caught": 64, "missed": 2, "accuracy": 97.0},
        {"player_name": "SHADOW", "score": 680, "max_combo": 15, "caught": 48, "missed": 3, "accuracy": 94.1},
        {"player_name": "VALKYRIE", "score": 450, "max_combo": 11, "caught": 32, "missed": 3, "accuracy": 91.4},
    ],
    "TIME_ATTACK": [
        {"player_name": "BOLT", "score": 540, "max_combo": 18, "caught": 42, "missed": 1, "accuracy": 97.6},
        {"player_name": "FLASH", "score": 410, "max_combo": 14, "caught": 33, "missed": 2, "accuracy": 94.2},
        {"player_name": "SONIC", "score": 310, "max_combo": 9, "caught": 24, "missed": 3, "accuracy": 88.8},
    ],
    "ZEN": [
        {"player_name": "LOTUS", "score": 480, "max_combo": 32, "caught": 50, "missed": 0, "accuracy": 100.0},
        {"player_name": "AURA", "score": 360, "max_combo": 24, "caught": 38, "missed": 1, "accuracy": 97.4},
        {"player_name": "HARMONY", "score": 240, "max_combo": 16, "caught": 26, "missed": 1, "accuracy": 96.2},
    ],
    "CHAOS": [
        {"player_name": "VORTEX", "score": 1420, "max_combo": 28, "caught": 78, "missed": 4, "accuracy": 95.1},
        {"player_name": "CYCLONE", "score": 980, "max_combo": 20, "caught": 56, "missed": 5, "accuracy": 91.8},
        {"player_name": "HAVOC", "score": 640, "max_combo": 14, "caught": 39, "missed": 5, "accuracy": 88.6},
    ],
    "TWO_HANDS": [
        {"player_name": "AMBIDEX", "score": 860, "max_combo": 19, "caught": 58, "missed": 2, "accuracy": 96.6},
        {"player_name": "DUALIST", "score": 620, "max_combo": 14, "caught": 42, "missed": 3, "accuracy": 93.3},
        {"player_name": "TWIN", "score": 410, "max_combo": 9, "caught": 28, "missed": 4, "accuracy": 87.5},
    ],
    "NIGHTMARE": [
        {"player_name": "APEX", "score": 1840, "max_combo": 34, "caught": 92, "missed": 3, "accuracy": 96.8},
        {"player_name": "VIPER", "score": 1250, "max_combo": 24, "caught": 68, "missed": 5, "accuracy": 93.1},
        {"player_name": "PHANTOM", "score": 890, "max_combo": 18, "caught": 46, "missed": 6, "accuracy": 88.4},
    ],
    "TRAINING": [
        {"player_name": "STUDENT", "score": 250, "max_combo": 10, "caught": 20, "missed": 1, "accuracy": 95.2},
    ],
    "TUTORIAL": [
        {"player_name": "RECRUIT", "score": 120, "max_combo": 5, "caught": 8, "missed": 0, "accuracy": 100.0},
    ],
    "ENDLESS": [
        {"player_name": "TITAN", "score": 740, "max_combo": 16, "caught": 52, "missed": 3, "accuracy": 94.5},
        {"player_name": "GHOST", "score": 520, "max_combo": 12, "caught": 38, "missed": 3, "accuracy": 92.7},
        {"player_name": "VALKYRIE", "score": 360, "max_combo": 9, "caught": 27, "missed": 3, "accuracy": 90.0},
    ],
}

def seed_default_scores(db: Session, target_mode: Optional[str] = None) -> None:
    """Idempotently seed default arcade benchmark scores for one or all modes."""
    modes_to_seed = [target_mode.upper()] if target_mode else list(DEFAULT_BENCHMARKS.keys())
    entries_to_add: list[Leaderboard] = []

    for m in modes_to_seed:
        if m not in DEFAULT_BENCHMARKS:
            continue
        # Only seed if no records currently exist for this mode
        exists = db.query(Leaderboard.id).filter(Leaderboard.mode == m).first()
        if not exists:
            for b in DEFAULT_BENCHMARKS[m]:
                entries_to_add.append(
                    Leaderboard(
                        player_name=b["player_name"],
                        score=b["score"],
                        max_combo=b["max_combo"],
                        caught=b["caught"],
                        missed=b.get("missed", 0),
                        accuracy=b.get("accuracy", 100.0),
                        mode=m
                    )
                )

    if entries_to_add:
        db.add_all(entries_to_add)
        db.commit()

def get_top_leaderboard(db: Session, mode: str = "NORMAL", limit: int = 5) -> List[Leaderboard]:
    normalized_mode = mode.upper()
    query = db.query(Leaderboard).filter(Leaderboard.mode == normalized_mode)
    results = query.order_by(desc(Leaderboard.score), desc(Leaderboard.max_combo)).limit(limit).all()
    
    # If empty, seed initial arcade benchmark scores for this mode
    if not results:
        seed_default_scores(db, normalized_mode)
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

