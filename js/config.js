/**
 * GAME_CONFIG - Single source of truth for HAND CATCH
 * All gameplay, tracking, rendering, audio, and arena constants are defined here.
 */
export const GAME_CONFIG = {
  // Gameplay Rules
  initialLives: 3,
  maxLives: 3,
  gameDuration: 60,              // seconds (NORMAL mode)
  baseScore: 10,
  comboStep: 1,                  // catches per multiplier increment
  comboMultiplierIncrement: 1,   // multiplier increase per step (+1x)
  comboCap: 10,                  // max multiplier (x10)

  // Difficulty Ramp: difficulty(t) = 1 - Math.exp(-t / difficultyTimeConstant)
  difficultyTimeConstant: 45,    // seconds to reach ~63% max difficulty
  initialObjectSpeed: 180,       // px/s (game space)
  maximumObjectSpeed: 620,       // px/s
  spawnInterval: 1100,           // ms between spawns at start
  minimumSpawnInterval: 380,     // ms between spawns at max difficulty
  initialMaxObjects: 2,          // max simultaneous columns at start
  finalMaxObjects: 7,            // max simultaneous columns at max difficulty
  initialObjectWidth: 90,        // px
  minimumObjectWidth: 44,        // px
  initialObjectHeight: 220,      // px
  minimumObjectHeight: 150,      // px

  // Collision
  collisionPadding: 14,          // px added to each side of column bounding box for forgiving catch
  minHandRadius: 40,             // px minimum palm collision radius
  maxHandRadius: 130,            // px maximum palm collision radius
  palmRadiusMultiplier: 1.45,    // multiplier on hand scale for palm collision circle
  fingertipRadiusMultiplier: 0.55,// multiplier on hand scale for 5 fingertip circles

  // Hand Tracking & Smoothing
  handSmoothingMode: 'oneEuro',  // 'oneEuro' | 'exponential'
  handSmoothing: 0.55,           // fallback exponential smoothing weight
  oneEuroMinCutoff: 1.0,         // One-Euro filter minCutoff (Hz) - keeps stillness rock-steady
  oneEuroBeta: 0.035,            // One-Euro filter beta speed coefficient - eliminates lag during fast swipes
  oneEuroDCutoff: 1.0,           // One-Euro filter dCutoff (Hz)
  handHoldMs: 250,               // ms to keep ghost hand active & colliding after disappearance
  handFadeMs: 350,               // ms to fade out ghost hand visually
  handReacquireMs: 800,          // ms threshold to reacquire lost track
  autoPauseAfterMs: 5000,        // ms without any hands before auto-pausing game
  noHandThresholdMs: 400,        // ms without hands before reporting "No Hand Detected" status

  // Coordinate Space & Canvas
  logicalWidth: 1280,            // logical game coordinate width
  logicalHeight: 720,            // logical game coordinate height

  // Arena Geometry (centered perspective circular arena)
  arena: {
    centerX: 640,
    centerY: 550,
    radiusX: 490,                // horizontal semi-axis of elliptical arena floor
    radiusY: 135,                // vertical semi-axis of elliptical floor (perspective flatten)
    floorY: 575,                 // Y coordinate for column catch/miss line
    ringWidth: 6,
    sweepSpeed: 0.85             // radians per second for rotating scanner
  },

  // Special Columns & Hazards
  specialChance: {
    gold: 0.07,                  // 7% chance for gold column (x3 score)
    heart: 0.035                 // 3.5% chance for heart column (+1 life when lives < maxLives)
  },
  enableHazards: false,          // Hazards disabled by default per brief
  hazardChance: 0.04,

  // Visuals & Effects
  maxParticles: 400,
  trailLength: 4,                // ghost segments per column
  screenShake: true,
  screenShakeMaxOffset: 12,      // px max screen shake
  reduceMotion: false,
  dwellMs: 1200,                 // ms required for hand-dwell to trigger button

  // Audio Configuration
  defaultSoundMuted: false,
  defaultVolume: 0.75,

  // Debug & Developer Options
  debugDefault: false,

  // Pinned MediaPipe Tasks Vision CDN URLs
  mediaPipeVisionWasmUrl: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm",
  mediaPipeModelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
  mediaPipeJsCdn: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm"
};
