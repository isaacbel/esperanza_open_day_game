from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, DateTime
from .database import Base

class Leaderboard(Base):
    __tablename__ = "leaderboard"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    player_name = Column(String(12), nullable=False, index=True)
    score = Column(Integer, nullable=False, index=True)
    max_combo = Column(Integer, nullable=False, default=0)
    caught = Column(Integer, nullable=False, default=0)
    missed = Column(Integer, nullable=False, default=0)
    accuracy = Column(Float, nullable=False, default=0.0)
    mode = Column(String(10), nullable=False, default="NORMAL", index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
