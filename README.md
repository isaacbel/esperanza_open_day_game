# 🎮 HAND CATCH — AI Webcam Arcade Game

> **Catch falling energy columns with your real hands.** Powered by on-device MediaPipe AI hand tracking — no plugins, no latency, runs 100% in the browser.

---

## 📦 Two Editions, One Repo

| Edition | Location | Stack | Description |
|---|---|---|---|
| **Standalone** | `./` (root) | HTML5 · Vanilla JS · CSS | Zero build step. Open with any static server. |
| **Full-Stack** | `hand-catch/` | Next.js 15 · TypeScript · FastAPI · SQLite | Production-grade app with REST leaderboard API. |

---

## 🚀 Quick Start

### Standalone Edition
No install required — just serve the root folder:
```bash
python -m http.server 8080
```
Open **http://localhost:8080** in Chrome or Edge.

> 💡 No webcam? Add `?mouse=1` to the URL to play with your mouse.

---

### Full-Stack Edition

**1. Backend (FastAPI)**
```bash
cd hand-catch/backend

# Create and activate a virtual environment
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate    # macOS / Linux

pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```
- API Docs: http://localhost:8000/docs
- Health check: http://localhost:8000/api/health

**2. Frontend (Next.js)**
```bash
cd hand-catch/frontend
npm install
npm run dev
```
Open **http://localhost:3000**

> 💡 No webcam? Use **http://localhost:3000/?mouse=1** for mouse mode.

---

## 🕹️ Gameplay

Neon energy columns fall from the top of the screen. Move your hands in front of the webcam to catch them before they hit the ground.

### Object Types

| Object | Effect |
|---|---|
| 🔵 Normal | Catch for points |
| 🟡 Gold | High bonus score |
| 💚 Heart | Recover 1 life |
| ⚡ Speed | Temporarily speeds up objects |
| ❄️ Slow | Slows all objects briefly |
| 💣 Bomb | **Don't touch it** — costs 2 lives |
| ⭐ Multiplier | Activates x2/x3 score boost |
| 🌀 Teleport | Jumps to a random position |
| 👻 Ghost | Requires a specific hand gesture |
| 🔥 Combo | Extends your active combo streak |

### Combo System

| Streak | Multiplier |
|---|---|
| 5 catches | ×2 |
| 10 catches | ×3 |
| 20 catches | ×4 |
| 30 catches | ×5 |

Missing any object resets the combo.

### Lives
You start with **3 lives ❤️❤️❤️**. Missing a normal object or touching a bomb costs lives. Reach 0 → **Game Over**.

---

## 🎮 Game Modes

| Mode | Description |
|---|---|
| **Classic** | 60-second timed run — maximize your score |
| **Survival** | 3 lives, endless — how long can you last? |
| **Sprint** | Catch 30 objects as fast as possible |
| **Zen** | No lives, no pressure — just vibes |
| **Chaos** | Maximum spawn rate from the start |
| **Two Hands** | Both hands required simultaneously |
| **Nightmare** | Insane speed with bomb-heavy spawns |
| **Tutorial** | Step-by-step introduction for new players |

---

## 📈 Difficulty Progression

The game uses an **AI Difficulty Director** that adapts to your play style in real time:

```
EASY → NORMAL → FAST → HARD → INSANE
```

- Falling speed scales from **200 px/s → 850+ px/s**
- Spawn rate increases from sparse to continuous streams
- Boss phases trigger at 30s, 45s, and 55s with elite object patterns
- The director tracks left/right hand accuracy and targets your weaker side

---

## 🤖 Hand Tracking

Built on **Google MediaPipe HandLandmarker** (WebAssembly + SIMD):

- Detects **21 3D landmarks** per hand, up to 2 hands simultaneously
- **1-Euro Filter** eliminates jitter without adding lag
- **Palm + 5 fingertip** hit circles for precise collision detection
- Automatic GPU → CPU fallback if WebGL is unavailable
- Mouse simulation mode for testing without a webcam (`?mouse=1`)

---

## 🔊 Audio

All sounds are **synthesized on-the-fly** using the Web Audio API — no audio files downloaded:

- Catch chimes that pitch-scale with your combo streak
- Bomb explosion, life-lost, and combo-milestone effects
- Deep cinematic ambient drone in the background

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|---|---|
| `ESC` | Pause / Resume |
| `M` | Toggle mute |
| `D` | Toggle debug overlay (landmarks, hitboxes) |
| `F` | Toggle fullscreen |

---

## 🌐 Browser Support

| Browser | Status | Notes |
|---|---|---|
| Chrome 90+ | ✅ Full | Best performance — recommended |
| Edge 90+ | ✅ Full | Excellent |
| Firefox 96+ | ✅ Full | Allow camera when prompted |
| Safari 16+ | ✅ Full | Click once to unlock Web Audio |
| Mobile | ⚠️ Partial | High-end phones, landscape only |

---

## 🩺 Troubleshooting

**Camera not working?**
- The page must be on `http://localhost` or `https://` — plain `file:///` won't work
- Check no other app (Zoom, OBS, Teams) is using the webcam
- Click the camera icon in your browser's address bar → set to **Allow**
- If it still fails, click **🖱 Play with Mouse** on the error screen to play without a camera

**Low FPS?**
- Enable Hardware Acceleration in your browser (`chrome://settings/system`)
- Toggle **Reduce Motion** in the in-game settings panel

**No sound?**
- Click anywhere on the screen first (browsers block autoplay until a user gesture)
- Press `M` to toggle mute

---

## 🗂️ Project Structure

```
esperanza_open_day_game/
│
├── index.html                  # Standalone edition entry point
├── css/style.css               # Standalone styles
├── js/                         # Standalone game logic (Vanilla JS)
│   ├── game.js
│   ├── handTracking.js
│   ├── collision.js
│   ├── particles.js
│   ├── audio.js
│   └── ...
│
└── hand-catch/                 # Full-Stack edition
    ├── frontend/               # Next.js 15 app
    │   ├── app/                # App Router (page.tsx, globals.css)
    │   ├── components/         # React UI components
    │   ├── game/               # Game engine (GameEngine, SpawnDirector, ...)
    │   ├── vision/             # Hand tracking (HandTracker, CoordinateMapper, ...)
    │   └── audio/              # Web Audio synthesis
    │
    └── backend/                # FastAPI REST API
        ├── app/main.py         # App entry point
        ├── app/api/            # Leaderboard routes
        ├── app/models.py       # SQLAlchemy models
        └── requirements.txt
```

---

## 🏆 Leaderboard API

The FastAPI backend exposes a REST leaderboard:

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/leaderboard?mode=CLASSIC&limit=10` | Fetch top scores for a mode |
| `POST` | `/api/leaderboard` | Submit a new score |
| `GET` | `/api/health` | Health check |

Interactive docs available at **http://localhost:8000/docs** when the backend is running.

---

## 📄 License

MIT — free to use, modify, and share.