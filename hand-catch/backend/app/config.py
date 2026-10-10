import os
from pydantic import BaseModel

def parse_cors_origins() -> list[str]:
    default = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost:8080",
        "http://127.0.0.1:8080"
    ]
    env_origins = os.getenv("CORS_ORIGINS")
    if env_origins:
        return [o.strip() for o in env_origins.split(",") if o.strip()]
    return default

class Settings(BaseModel):
    app_name: str = "HAND CATCH Backend API"
    app_version: str = "1.0.0"
    debug: bool = os.getenv("DEBUG", "false").lower() in ("true", "1", "yes")
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./hand_catch.db")
    cors_origins: list[str] = parse_cors_origins()
    admin_key: str = os.getenv("ADMIN_KEY", "hand-catch-admin-secret")

settings = Settings()

