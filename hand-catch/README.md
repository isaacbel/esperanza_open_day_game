# 🎮 HAND CATCH — AI Webcam Hand-Tracking Arcade Game

> **Use your real hands to catch falling neon columns. Powered by MediaPipe AI, running 100% in your browser.**

---

## 📸 Concept

Stand in front of your webcam. Vertical glowing columns fall from above. Use your hands to catch them before they hit the floor. Build combos, earn bonus multipliers, and compete for the top of the leaderboard.

---

## 🚀 Quick Start

### Prerequisites
- **Node.js 20+** (for the Next.js frontend)
- **Python 3.11+** (for the FastAPI backend)
- A browser with **camera access** (Chrome 90+, Edge 90+, Firefox 96+, Safari 16+)
- **HTTPS or localhost** — `getUserMedia` requires a secure context

### 1. Start the Backend (FastAPI + SQLite)

```bash
cd hand-catch/backend

# Create and activate a virtual environment
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run the server (http://localhost:8000)
uvicorn app.main:app --reload --port 8000
```

The backend serves:
- `GET /api/leaderboard?mode=NORMAL&limit=5` — fetch top scores
- `POST /api/leaderboard` — submit a score
- `DELETE /api/leaderboard?mode=NORMAL` — clear leaderboard
- `GET /api/health` — health check
- `GET /docs` — Swagger UI

### 2. Start the Frontend (Next.js)

```bash
cd hand-catch/frontend

# Install dependencies (first time only)
npm install

# Run the dev server (http://localhost:3000)
npm run dev
```

Then open **http://localhost:3000** in your browser.

> **Tip:** If the backend is unavailable, the leaderboard silently falls back to a locally cached version (or placeholder benchmarks).

---

## 🌐 Browser Support

| Browser | Webcam | Hand Tracking | GPU Delegate |
|---------|--------|---------------|--------------|
| Chrome 90+ | ✅ | ✅ | ✅ |
| Edge 90+ | ✅ | ✅ | ✅ |
| Firefox 96+ | ✅ | ✅ | ⚠️ CPU fallback |
| Safari 16.4+ | ✅ | ✅ | ⚠️ CPU fallback |

---

## 🎮 Gameplay

| Element | Description |
|---------|-------------|
| **Normal Column** | Falling cyan/magenta column. Catch to score. Miss → lose a life. |
| **Gold Column** ✨ | Rare column with 2× base score. |
| **Heart Column** ❤️ | Restores 1 life. |
| **Hazard Column** ☠️ | Touching it loses a life instantly! |
| **Combo Multiplier** | Catch without missing. x2 at 3, x3 at 6, x5 at 10, x10 at 15. |
| **Lives** | 3 lives (♥♥♥). Game ends at 0 lives or (NORMAL mode) when time runs out. |

### Game Modes

- **NORMAL** — 60-second timed run. Score as high as possible.
- **ENDLESS** — No timer. Survive as long as you can.

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `ESC` | Pause / Resume |
| `M` | Mute / Unmute audio |
| `D` | Toggle debug overlay (FPS, inference time, hand data) |
| `F` | Toggle fullscreen |

### Mouse / Test Mode

Append `?mouse=1` to the URL to play with your mouse cursor instead of the camera — great for testing without a webcam.

---

## 🛠️ Configuration

All game constants live in [`frontend/game/GameConfig.ts`](hand-catch/frontend/game/GameConfig.ts).

Key values you can tweak:

```ts
// frontend/game/GameConfig.ts
export const GAME_CONFIG = {
  initialLives: 3,          // Starting lives
  maxLives: 5,              // Maximum lives (from heart pickups)
  gameDuration: 60,         // NORMAL mode duration (seconds)
  baseScore: 10,            // Points per catch before multiplier
  columnFallSpeedBase: 180, // Base fall speed (game units/sec)
  spawnIntervalMin: 0.6,    // Minimum spawn interval (seconds)
  noHandThresholdMs: 800,   // How long without hands before auto-pause
  // ... see file for full list
};
```

MediaPipe model URL is also in `GameConfig.ts` under `mediaPipeModelAssetPath` and `mediaPipeVisionWasmUrl` — change these to use a self-hosted model if needed.

---

## 🔧 Troubleshooting

### "Camera access denied"
- Click the camera icon in the browser address bar and allow access.
- Ensure no other app (Zoom, Teams, OBS) is exclusively holding the camera.
- On Firefox, check `about:permissions`.

### Hand tracking not working
- Ensure you are on `localhost` or an HTTPS page (required for `getUserMedia`).
- Provide good, diffuse frontal lighting — backlighting causes tracking failures.
- Stand 1–2 metres from the camera with your hands clearly visible.
- Try appending `?mouse=1` to confirm the game engine is running correctly.

### Low performance / lag
- Enable the debug overlay (`D` key) to check FPS and inference time.
- Close other browser tabs and GPU-heavy applications.
- The game auto-switches to "low quality" rendering mode if FPS drops below 30.
- On unsupported GPUs, MediaPipe falls back to CPU — inference will be ~15–25 ms vs ~3–6 ms.

### Backend leaderboard not saving
- Ensure the FastAPI server is running on `http://localhost:8000`.
- Check the `.env.local` file in `frontend/` contains `NEXT_PUBLIC_API_URL=http://localhost:8000`.
- Scores are cached locally in `localStorage` even when offline.

---

## 📁 Project Structure

```
hand-catch/
├── frontend/               # Next.js 15 + TypeScript + React 19
│   ├── app/
│   │   ├── layout.tsx      # Root layout (fonts, metadata)
│   │   ├── page.tsx        # Main orchestration page (state machine)
│   │   └── globals.css     # Global design system CSS
│   ├── components/         # React UI components
│   │   ├── StartScreen.tsx
│   │   ├── Leaderboard.tsx
│   │   ├── CameraStatus.tsx
│   │   ├── ModeSelector.tsx
│   │   └── SettingsPanel.tsx
│   ├── game/               # Pure TypeScript game engine
│   │   ├── GameEngine.ts   # Core orchestrator
│   │   ├── GameConfig.ts   # All constants
│   │   ├── GameLoop.ts     # Fixed-timestep loop
│   │   ├── ArenaRenderer.ts
│   │   ├── ColumnRenderer.ts
│   │   ├── HandRenderer.ts
│   │   ├── ParticleSystem.ts
│   │   ├── CollisionSystem.ts
│   │   ├── SpawnSystem.ts
│   │   ├── ScoreSystem.ts
│   │   ├── DifficultySystem.ts
│   │   └── GameState.ts
│   ├── vision/             # MediaPipe hand tracking
│   │   ├── HandTracker.ts  # Main tracker with 1-Euro filter
│   │   ├── HandSmoothing.ts
│   │   ├── CoordinateMapper.ts
│   │   └── HandTypes.ts
│   ├── audio/              # Web Audio API (100% synthesized)
│   │   ├── AudioManager.ts
│   │   └── SoundEffects.ts
│   └── utils/
│       ├── device.ts
│       ├── math.ts
│       └── performance.ts
│
└── backend/                # Python FastAPI + SQLite
    ├── app/
    │   ├── main.py         # FastAPI app + CORS
    │   ├── models.py       # SQLAlchemy models
    │   ├── schemas.py      # Pydantic schemas
    │   ├── database.py     # SQLite setup
    │   ├── config.py       # Settings
    │   ├── api/
    │   │   ├── leaderboard.py
    │   │   ├── health.py
    │   │   └── config.py
    │   └── services/
    │       └── leaderboard_service.py
    └── requirements.txt
```

---

## ⚠️ Known Limitations & Fallbacks

| Limitation | Fallback |
|------------|----------|
| MediaPipe WebAssembly requires HTTPS or localhost | Dev server is `localhost` by default. Production must use HTTPS. |
| GPU delegate not available on all browsers | Automatically falls back to CPU delegate. ~3× slower but functional. |
| Safari < 16.4 lacks `requestVideoFrameCallback` | Falls back to `requestAnimationFrame` — tracking still works. |
| Backend unavailable | Leaderboard uses `localStorage` cache, or placeholder benchmark scores. |
| Poor lighting / occlusion | A status pill warns when no hands are detected. |
| Mobile / touch devices | Not fully optimised — camera orientation and small screens may cause issues. |

---

## 🔬 Technical Architecture

- **Zero React in the hot loop.** The game engine (`GameEngine.ts`) updates and renders at 60 FPS using a fixed-timestep loop. React only re-renders on state machine transitions (menu → playing → game over), not per frame.
- **Decoupled hand tracking.** `HandTracker` runs its own inference loop via `requestVideoFrameCallback` (or `rAF`), independent of the game loop.
- **1-Euro Filter smoothing.** All hand landmark positions are smoothed with a 1-Euro Filter to eliminate jitter while preserving fast motion responsiveness.
- **Swept collision detection.** Column-hand collision uses swept circle tests to prevent tunneling at high fall speeds.
- **100% synthesized audio.** No audio files. All sounds (catch, miss, combo, game-over, ambient drone) are generated by the Web Audio API at runtime.

---

*Built with ❤️ using Next.js, MediaPipe Tasks Vision, TypeScript, FastAPI, and the Web Audio API.*
