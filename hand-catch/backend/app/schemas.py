import re
from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field, field_validator, ConfigDict

class LeaderboardCreate(BaseModel):
    playerName: str = Field(..., description="Player call-sign (max 12 chars)")
    score: int = Field(..., ge=0, le=1_000_000, description="Final score")
    maxCombo: int = Field(0, ge=0, le=9999, description="Maximum combo streak reached")
    caught: int = Field(0, ge=0, le=5000, description="Total columns caught")
    missed: int = Field(0, ge=0, le=1000, description="Total columns missed")
    accuracy: float = Field(0.0, ge=0.0, le=100.0, description="Catch accuracy percentage")
    mode: Literal[
        "NORMAL",
        "SURVIVAL",
        "TIME_ATTACK",
        "ZEN",
        "CHAOS",
        "TWO_HANDS",
        "NIGHTMARE",
        "TRAINING",
        "TUTORIAL",
        "ENDLESS"
    ] = Field("NORMAL", description="Game mode")

    @field_validator("playerName", mode="before")
    @classmethod
    def sanitize_player_name(cls, v: str) -> str:
        if not isinstance(v, str):
            return "PLAYER"
        # Keep only alphanumeric, underscores, hyphens, and spaces; cap at 12 characters
        clean = re.sub(r"[^A-Za-z0-9_\- ]", "", v).strip()
        if not clean:
            clean = "PLAYER"
        return clean[:12]

class LeaderboardResponse(BaseModel):
    id: int
    playerName: str
    score: int
    maxCombo: int
    caught: int
    missed: int
    accuracy: float
    mode: str
    createdAt: datetime

    model_config = ConfigDict(from_attributes=True)

class HealthResponse(BaseModel):
    status: str
    version: str
    database: str
    timestamp: datetime

class ConfigResponse(BaseModel):
    gameDuration: int
    initialLives: int
    maxComboMultiplier: int
    baseScore: int
    minHandRadius: int
    maxHandRadius: int
