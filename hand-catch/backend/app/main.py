from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import settings
from .database import init_db
from .api import health, config, leaderboard

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize SQLite tables on startup
    init_db()
    yield

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Backend API for HAND CATCH Arcade Game (Leaderboard, Health, Config)",
    lifespan=lifespan
)

# CORS Middleware to allow Next.js client access
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routers
app.include_router(health.router)
app.include_router(config.router)
app.include_router(leaderboard.router)

@app.get("/")
def root():
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "docs": "/docs",
        "health": "/api/health",
        "leaderboard": "/api/leaderboard"
    }
