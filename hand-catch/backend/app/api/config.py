from fastapi import APIRouter
from ..schemas import ConfigResponse

router = APIRouter(prefix="/api/config", tags=["Configuration"])

@router.get("", response_model=ConfigResponse)
def get_game_config():
    """Returns official server configuration and gameplay rules."""
    return ConfigResponse(
        gameDuration=60,
        initialLives=3,
        maxComboMultiplier=10,
        baseScore=10,
        minHandRadius=40,
        maxHandRadius=130
    )
