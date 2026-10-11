/**
 * GameConfig.ts - Single Source of Truth for HAND CATCH (Hardcore Upgrade)
 * Contains all gameplay mechanics, hardcore difficulty curves, spawn director parameters,
 * pattern libraries, vision filter tuning, collision parameters, and catch assist settings.
 */
import { QualityLevel } from '../vision/HandTypes';

export type GameLevelId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface GameLevelDef {
  level: GameLevelId;
  name: string;
  subtitle: string;
  minTimeSec: number;
  spawnIntervalMs: number;
  baseFallSpeed: number;
  maxSimultaneousObjects: number;
  objectWidth: number;
  objectHeight: number;
  allowedPatterns: string[];
  burstAllowed: boolean;
  scoreMultiplierBonus: number;
  themeHue: number; // for visual intensity tint
}

export interface SpecialEventDef {
  type: 'RAPID_FIRE' | 'CHAOS' | 'DOUBLE_HAND' | 'ZIGZAG' | 'FINAL_RUSH';
  name: string;
  banner: string;
  durationMs: number;
  spawnIntervalMs: number;
  color: string;
}

export interface IGameConfig {
  initialLives: number;
  maxLives: number;
  gameDuration: number;
  baseScore: number;
  comboStep: number;
  comboMultiplierIncrement: number;
  comboCap: number;

  levels: GameLevelDef[];

  nightmare: {
    baseFallSpeed: number;
    maxFallSpeed: number;
    spawnIntervalMs: number;
    maxSimultaneousObjects: number;
    objectWidth: number;
    objectHeight: number;
    scoreMultiplier: number;
  };

  difficultyTimeConstant: number;
  initialObjectSpeed: number;
  maximumObjectSpeed: number;
  spawnInterval: number;
  minimumSpawnInterval: number;
  initialMaxObjects: number;
  finalMaxObjects: number;
  initialObjectWidth: number;
  minimumObjectWidth: number;
  initialObjectHeight: number;
  minimumObjectHeight: number;

  burst: {
    minIntervalMs: number;      // Cooldown between bursts (5-7s)
    maxIntervalMs: number;
    durationMs: number;         // Burst duration (1.5-2.5s)
    spawnIntervalMs: number;    // Rapid spawn interval during burst (120-160ms)
    minLevel: number;           // Level required to trigger bursts
  };

  finalPhase: {
    startSecondsRemaining: number; // 10s remaining (at 50s mark)
    insaneSecondsRemaining: number;// 5s remaining (at 55s mark)
    finalGoldenObjectScoreMult: number; // x5 multiplier for final golden column
  };

  collisionPadding: number;
  minHandRadius: number;
  maxHandRadius: number;
  palmRadiusMultiplier: number;
  fingertipRadiusMultiplier: number;

  catchAssist: number;          // subtle proximity assist
  catchFreezeMs: number;        // ~50-80ms freeze for "feel good" catch
  comboGracePeriodMs: number;   // grace period for combo protection

  handSmoothingMode: 'oneEuro' | 'exponential';
  handSmoothing: number;
  oneEuroMinCutoff: number;
  oneEuroBeta: number;
  oneEuroDCutoff: number;
  predictionMinMs: number;
  predictionMaxMs: number;

  handHoldMs: number;
  handFadeMs: number;
  handReacquireMs: number;
  autoPauseAfterMs: number;
  noHandThresholdMs: number;

  logicalWidth: number;
  logicalHeight: number;

  arena: {
    centerX: number;
    centerY: number;
    radiusX: number;
    radiusY: number;
    floorY: number;
    ringWidth: number;
    sweepSpeed: number;
  };

  specialChance: {
    gold: number;
    heart: number;
    fast: number;
    slow: number;
    multiplier: number;
    combo: number;
  };
  enableHazards: boolean;
  hazardChance: number;

  qualityLevel: QualityLevel;
  maxParticles: number;
  trailLength: number;
  screenShake: boolean;
  screenShakeMaxOffset: number;
  dwellMs: number;

  mediaPipeVisionWasmUrl: string;
  mediaPipeModelAssetPath: string;
}

export const GAME_CONFIG: IGameConfig = {
  // Gameplay Rules
  initialLives: 3,
  maxLives: 3,
  gameDuration: 60,              // seconds (NORMAL mode)
  baseScore: 10,
  comboStep: 1,                  // catches per multiplier increment
  comboMultiplierIncrement: 1,   // multiplier increase per step (+1x)
  comboCap: 10,                  // max multiplier (x10)

  // Explicit Hardcore Level Progression (Section 1, 2, 17, 18, 19)
  levels: [
    {
      level: 1,
      name: 'LEVEL 1',
      subtitle: 'WARM UP',
      minTimeSec: 0,
      spawnIntervalMs: 820,
      baseFallSpeed: 230,
      maxSimultaneousObjects: 2,
      objectWidth: 86,
      objectHeight: 220,
      allowedPatterns: ['SINGLE', 'LEFT_RIGHT', 'DOUBLE'],
      burstAllowed: false,
      scoreMultiplierBonus: 1.0,
      themeHue: 190
    },
    {
      level: 2,
      name: 'LEVEL 2',
      subtitle: 'EASY',
      minTimeSec: 10,
      spawnIntervalMs: 620,
      baseFallSpeed: 300,
      maxSimultaneousObjects: 4,
      objectWidth: 76,
      objectHeight: 205,
      allowedPatterns: ['SINGLE', 'DOUBLE', 'LEFT_RIGHT', 'RIGHT_LEFT', 'WAVE'],
      burstAllowed: false,
      scoreMultiplierBonus: 1.0,
      themeHue: 180
    },
    {
      level: 3,
      name: 'LEVEL 3',
      subtitle: 'NORMAL',
      minTimeSec: 20,
      spawnIntervalMs: 480,
      baseFallSpeed: 380,
      maxSimultaneousObjects: 6,
      objectWidth: 68,
      objectHeight: 190,
      allowedPatterns: ['DOUBLE', 'TRIPLE', 'CENTER_SPLIT', 'WAVE', 'ALTERNATING', 'STAIRCASE'],
      burstAllowed: true,
      scoreMultiplierBonus: 1.0,
      themeHue: 170
    },
    {
      level: 4,
      name: 'LEVEL 4',
      subtitle: 'FAST',
      minTimeSec: 30,
      spawnIntervalMs: 360,
      baseFallSpeed: 480,
      maxSimultaneousObjects: 8,
      objectWidth: 60,
      objectHeight: 180,
      allowedPatterns: ['TRIPLE', 'QUAD', 'STAIRCASE', 'ZIGZAG', 'TWO_SIDE_ATTACK', 'CROSSING', 'RAPID_BURST'],
      burstAllowed: true,
      scoreMultiplierBonus: 1.25,
      themeHue: 155
    },
    {
      level: 5,
      name: 'LEVEL 5',
      subtitle: 'HARD',
      minTimeSec: 40,
      spawnIntervalMs: 270,
      baseFallSpeed: 580,
      maxSimultaneousObjects: 11,
      objectWidth: 52,
      objectHeight: 170,
      allowedPatterns: ['QUAD', 'RAPID_BURST', 'CROSSING', 'CENTER_ATTACK', 'TWO_SIDE_ATTACK', 'FAKE_GAP', 'RANDOM_BURST'],
      burstAllowed: true,
      scoreMultiplierBonus: 1.5,
      themeHue: 280
    },
    {
      level: 6,
      name: 'LEVEL 6',
      subtitle: 'VERY HARD',
      minTimeSec: 48,
      spawnIntervalMs: 210,
      baseFallSpeed: 660,
      maxSimultaneousObjects: 13,
      objectWidth: 46,
      objectHeight: 160,
      allowedPatterns: ['FULL_WIDTH', 'CROSSING', 'RAPID_BURST', 'TWO_SIDE_ATTACK', 'CENTER_ATTACK', 'FAKE_GAP'],
      burstAllowed: true,
      scoreMultiplierBonus: 2.0,
      themeHue: 320
    },
    {
      level: 7,
      name: 'LEVEL 7',
      subtitle: 'EXTREME • FINAL PHASE',
      minTimeSec: 54,
      spawnIntervalMs: 170,
      baseFallSpeed: 740,
      maxSimultaneousObjects: 15,
      objectWidth: 42,
      objectHeight: 150,
      allowedPatterns: ['FULL_WIDTH', 'RAPID_BURST', 'TWO_SIDE_ATTACK', 'CENTER_ATTACK', 'CROSSING', 'ZIGZAG'],
      burstAllowed: true,
      scoreMultiplierBonus: 3.0,
      themeHue: 350
    },
    {
      level: 8,
      name: 'LEVEL 8',
      subtitle: 'INSANE CLIMAX',
      minTimeSec: 57,
      spawnIntervalMs: 130,
      baseFallSpeed: 840,
      maxSimultaneousObjects: 18,
      objectWidth: 40,
      objectHeight: 145,
      allowedPatterns: ['FINAL_RUSH', 'RAPID_BURST', 'TWO_SIDE_ATTACK', 'FULL_WIDTH', 'CHAOS'],
      burstAllowed: true,
      scoreMultiplierBonus: 5.0,
      themeHue: 40
    }
  ],

  // Nightmare Mode Settings (Section 17)
  nightmare: {
    baseFallSpeed: 680,
    maxFallSpeed: 920,
    spawnIntervalMs: 140,
    maxSimultaneousObjects: 18,
    objectWidth: 42,
    objectHeight: 145,
    scoreMultiplier: 4.0
  },

  // Rapid Burst Mechanics (Section 4)
  burst: {
    minIntervalMs: 4500,
    maxIntervalMs: 7000,
    durationMs: 2000,
    spawnIntervalMs: 125,
    minLevel: 3
  },

  // Final Phase Climax (Section 12)
  finalPhase: {
    startSecondsRemaining: 10,
    insaneSecondsRemaining: 5,
    finalGoldenObjectScoreMult: 5
  },

  // Continuous Difficulty Curves
  difficultyTimeConstant: 38,
  initialObjectSpeed: 230,
  maximumObjectSpeed: 860,
  spawnInterval: 820,
  minimumSpawnInterval: 120,
  initialMaxObjects: 2,
  finalMaxObjects: 18,
  initialObjectWidth: 86,
  minimumObjectWidth: 40,
  initialObjectHeight: 220,
  minimumObjectHeight: 145,

  // Collision & Catch Mechanics
  collisionPadding: 14,
  minHandRadius: 40,
  maxHandRadius: 130,
  palmRadiusMultiplier: 1.45,
  fingertipRadiusMultiplier: 0.55,
  catchAssist: 0.15,
  catchFreezeMs: 65,
  comboGracePeriodMs: 80,

  // Hand Tracking, Smoothing & Prediction Tuning
  handSmoothingMode: 'oneEuro',
  handSmoothing: 0.55,
  oneEuroMinCutoff: 1.0,
  oneEuroBeta: 0.035,
  oneEuroDCutoff: 1.0,
  predictionMinMs: 30,
  predictionMaxMs: 75,

  handHoldMs: 250,
  handFadeMs: 350,
  handReacquireMs: 800,
  autoPauseAfterMs: 5000,
  noHandThresholdMs: 400,

  // Coordinate Space & Canvas
  logicalWidth: 1280,
  logicalHeight: 720,

  // Arena Geometry
  arena: {
    centerX: 640,
    centerY: 550,
    radiusX: 490,
    radiusY: 135,
    floorY: 575,
    ringWidth: 6,
    sweepSpeed: 0.85
  },

  // Special Columns & Hazards (Section 15)
  specialChance: {
    gold: 0.07,
    heart: 0.035,
    fast: 0.14,
    slow: 0.07,
    multiplier: 0.05,
    combo: 0.04
  },
  enableHazards: true,
  hazardChance: 0.04,

  // Visuals & Adaptive Quality
  qualityLevel: 'HIGH',
  maxParticles: 600,
  trailLength: 4,
  screenShake: true,
  screenShakeMaxOffset: 14,
  dwellMs: 1200,

  // MediaPipe Assets (Local offline bundle with CDN fallback)
  mediaPipeVisionWasmUrl: "/wasm",
  mediaPipeModelAssetPath: "/models/hand_landmarker.task"
};
