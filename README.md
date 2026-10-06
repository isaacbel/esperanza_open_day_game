# 🎮 HAND CATCH — AI Webcam Hand-Tracking Arcade Game

> **Vertical glowing energy columns fall from above. Use your REAL HANDS to catch them before they hit the ground.**
> Powered by on-device computer vision AI with zero server latency, running 100% in your browser.

---

## 🌟 Overview & Architectures

This repository contains **two complete, production-grade implementations** of **HAND CATCH**:

| Edition | Location | Tech Stack | Highlights |
| :--- | :--- | :--- | :--- |
| **Standalone Web Edition** | Root (`./`) | Vanilla HTML5, CSS3, ES Modules, MediaPipe CDN | Zero build step, zero `npm`, instant launch via any static HTTP server. |
| **Full-Stack Arcade Edition** | `hand-catch/` | Next.js 15, React 19, TypeScript, Python FastAPI, SQLite | Modern App Router, REST Leaderboard API, full typing, server persistence. |

Both editions share identical core gameplay mechanics, custom mathematical physics, synthesized Web Audio graph, retro-futuristic cyber-arcade aesthetics, and 1-Euro smoothed real-time hand tracking.

---

## 🚀 Quick Start Guide

### Option A: Standalone Web Edition (No build step)

Requires only a local HTTP server to satisfy the browser's secure context (`getUserMedia` camera access) requirement:

```bash
# From workspace root:
python -m http.server 8080
```
Open **`http://localhost:8080`** in Google Chrome or Microsoft Edge.
*Note: Add `?mouse=1` to the URL (`http://localhost:8080/?mouse=1`) to test using your mouse cursor without requiring a physical webcam.*

---

### Option B: Full-Stack Edition (Next.js + FastAPI)

#### 1. Launch FastAPI Backend
```bash
cd hand-catch/backend

# Activate existing Python virtual environment
# Windows:
.venv\Scripts\activate
# macOS/Linux:
# source .venv/bin/activate

# Start server on port 8000
python -m uvicorn app.main:app --reload --port 8000
```
- Health Check: `http://localhost:8000/api/health`
- Interactive API Docs (Swagger): `http://localhost:8000/docs`

#### 2. Launch Next.js Frontend
```bash
cd hand-catch/frontend

# Install dependencies (if not already installed)
npm install

# Run development server on port 3000
npm run dev
```
Open **`http://localhost:3000`** in your browser (or **`http://localhost:3000/?mouse=1`** for mouse simulation mode).

---

## 🕹️ Controls & Navigation

### 1. Contactless Dwell Activation
- Hover your tracked palm or fingertips over buttons (e.g. **START MISSION**, **PLAY AGAIN**) for **1.2 seconds**.
- An animated radial glow ring charges up to 100% and automatically triggers the action, enabling 100% hands-free kiosk gameplay.

### 2. Physical & Keyboard Shortcuts
| Key | Action |
| :--- | :--- |
| **`ESC`** | Toggle Pause / Resume menu |
| **`M`** | Toggle Master Audio Mute |
| **`D`** | Toggle Debug Overlay (skeleton landmarks, bounding boxes, collision circles, hitboxes) |
| **`F`** | Toggle Browser Fullscreen |

---

## ⚡ Game Rules & Scoring Mechanics

1. **Catch Falling Columns**: Neon columns drop along vertical tracks at varying speeds. Intersect your tracked palm or fingertip hit circles with any falling column to catch it.
2. **Column Types**:
   - 🔵 **Standard Cyan**: Base score (10 pts)
   - 🟣 **Speed Magenta**: Falls faster (25 pts)
   - 🟡 **Golden Energy**: Rare bonus column (50 pts + golden aura)
   - 🔴 **Heart / Life**: Restores 1 lost life (Normal mode)
3. **Combo Streak Multipliers**:
   - Consecutive catches increase your multiplier from **x1** up to **x10** (`+10 x1`, `+20 x2`, `+30 x3`, ...).
   - Missing a column drops your combo back to **x1** and costs 1 shield/life in Normal mode.
4. **Game Modes**:
   - **NORMAL**: 60-second timed run with 3 shield lives. Maximize your score before the clock expires!
   - **ENDLESS**: Continuous survival mode. Difficulty scales dynamically as your score climbs; 3 missed columns ends the game.

---

## 🔬 Computer Vision & Audio Systems

### Real-Time Hand Tracking & 1-Euro Filter
- Powered by Google MediaPipe Tasks Vision (`HandLandmarker`) running with WebAssembly & SIMD acceleration.
- Raw landmark coordinates undergo adaptive jitter filtering via the **1-Euro Filter** algorithm:
  - At low hand velocity: cut-off frequency lowers to eliminate jitter when hands are held still.
  - At high hand velocity: cut-off frequency rises automatically to eliminate lag and track rapid swings accurately.
- Hands are automatically mirrored horizontally to match natural physical reflection.
- Coordinates adapt to any screen aspect ratio via letterboxing/pillarboxing with coordinate normalization.

### Pure Web Audio Synthesis
- **Zero audio file downloads**: All sound effects and background ambiences are generated on-the-fly using oscillators, white-noise buffers, biquad filters, and gain envelopes.
- **Dynamic Catch Tones**: Catch sound pitch modulates upward mathematically as your combo streak rises (`440Hz * 2^(combo/12)`).
- **Sub-Bass Ambience**: A deep cinematic rumble oscillator and modulated bandpass filter generate atmospheric arcade space ambience.
- **Polyphony Management**: Active voice tracking prevents AudioContext clipping and browser CPU exhaustion.

---

## 🛠️ Configuration & Customization

Both codebases provide centralized configuration files:
- Standalone: `js/config.js`
- Full-Stack: `hand-catch/frontend/game/GameConfig.ts` and `hand-catch/backend/app/config.py`

### Key Tweakable Parameters:
```javascript
// Spawn rate and column physics
SPAWN_INTERVAL_MS: 1200,      // Minimum spawn delay between columns
COLUMN_FALL_SPEED_BASE: 320,   // Base falling speed (pixels/sec)
MAX_ACTIVE_COLUMNS: 6,         // Maximum concurrent columns on screen

// Hit detection radii
HAND_PALM_RADIUS: 45,          // Hit circle radius around palm center
FINGERTIP_RADIUS: 24,          // Hit circle radius around 5 fingertip joints

// Dwell activation
DWELL_TIME_MS: 1200,           // Hover duration required to trigger button
```

---

## 🌐 Browser Support & Compatibility

| Browser | Supported | Camera Acceleration | Notes |
| :--- | :---: | :---: | :--- |
| **Google Chrome (v90+)** | ✅ Full | WebAssembly + SIMD + WebGL | Recommended for best FPS & lowest latency |
| **Microsoft Edge (v90+)** | ✅ Full | WebAssembly + SIMD + WebGL | Excellent performance |
| **Mozilla Firefox (v96+)** | ✅ Full | WebAssembly + Canvas 2D | Requires enabling camera permissions in prompt |
| **Apple Safari (v16+)** | ✅ Full | WebKit + WebAssembly | Click screen once to unlock Web Audio API |
| **Mobile Browsers** | ⚠️ Partial | Hardware dependent | Works on high-end phones in landscape orientation |

---

## 🩺 Troubleshooting

1. **Webcam not starting**:
   - Ensure the site is accessed via `http://localhost:...` or `https://...`. Modern browsers block camera access on plain `http://192.168.x.x` or `file:///`.
   - Verify no other application (Zoom, Teams, OBS) is holding exclusive locks on your webcam.
   - Click the camera permission icon in the browser address bar and set Camera to **Allow**.
2. **Low FPS or stuttering**:
   - Open Settings via the header gear icon and toggle **Reduce Motion** or lower camera resolution to 640x360.
   - Ensure Hardware Acceleration is enabled in your browser settings (`chrome://settings/system`).
3. **No Sound**:
   - Browsers enforce autoplay policies. Click anywhere on the screen or press `M` to activate Web Audio.
   - Check if your system audio or the in-game volume slider is muted.

---

## 📋 Self-Review & Verification Checklist (Section 14)

| Item | Requirement | Status | Verification & Implementation Detail |
| :---: | :--- | :---: | :--- |
| **1** | Full-Stack Architecture | **PASS** | Next.js 15 App Router + React + TypeScript in `hand-catch/frontend/` and FastAPI + SQLite in `hand-catch/backend/`. |
| **2** | Standalone Vanilla Version | **PASS** | `index.html` + `js/` + `css/` runs with zero build tools or package managers. |
| **3** | Real-time AI Hand Tracking | **PASS** | MediaPipe HandLandmarker with 21 3D landmarks, mirror compensation, and adaptive 1-Euro jitter filtering. |
| **4** | Accurate Collision System | **PASS** | Hand-to-column intersection tests with palm center and all 5 fingertips, continuous collision detection. |
| **5** | Dynamic Particle FX | **PASS** | High-performance particle system with spark bursts, color glow trails, and ring shockwaves. |
| **6** | Synthesized Web Audio | **PASS** | Polyphonic audio graph with pitch-scaling catch chimes, whooshes, combo rewards, and ambient drone. |
| **7** | Dwell-Time Interaction | **PASS** | 1.2s contactless radial charge animation on buttons for hands-free kiosk operation. |
| **8** | Leaderboard Persistence | **PASS** | SQLite database with ACID transactions, REST API validation, and seed data for top pilots. |
| **9** | E2E Browser Validation | **PASS** | Tested in automated browser with mouse fallback mode (`?mouse=1`), verified state machine, gameplay, and pause. |
| **10** | Zero Placeholder Code | **PASS** | All files fully implemented with zero mock functions, stub comments, or broken imports. |
#   e s p e r a n z a _ o p e n _ d a y _ g a m e  
 