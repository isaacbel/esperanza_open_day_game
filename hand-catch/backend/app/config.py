import os
from pydantic import BaseModel

class Settings(BaseModel):
    app_name: str = "HAND CATCH Backend API"
    app_version: str = "1.0.0"
    debug: bool = os.getenv("DEBUG", "false").lower() in ("true", "1", "yes")
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./hand_catch.db")
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000"
    ]

settings = Settings()
