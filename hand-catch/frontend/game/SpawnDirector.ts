/**
 * SpawnDirector.ts - Master Choreography & Spawning AI
 *
 * Architecture:
 *   DifficultySystem → SpawnDirector → PatternGenerator → FairnessChecker → ObjectPool → GameEngine
 *
 * Responsibilities:
 *   1. Evaluates current Difficulty Level (Level 1 WARM UP to Level 8 INSANE) or specific Game Mode.
 *   2. Selects intelligent procedural patterns from PatternGenerator (all 18+ patterns).
 *   3. Directs Boss/Challenge phases (30s Rapid Challenge, 45s Two-Hand Challenge, 55s Final Rush).
 *   4. Directs Special Difficulty Events (RAPID_FIRE, CHAOS, DOUBLE_HAND, ZIGZAG, FINAL_RUSH).
 *   5. Drives Rapid Burst events (1.5–2.5s rapid waves with predictable rhythm & fair cooldowns).
 *   6. Adapts dynamically to AI Player Model (weak side challenge placement).
 *   7. Enforces biomechanical fairness through FairnessChecker.
 *   8. Supports all 10 Game Modes (NORMAL, SURVIVAL, TIME_ATTACK, ZEN, CHAOS, TWO_HANDS, NIGHTMARE, TRAINING, TUTORIAL, ENDLESS).
 */
import { GAME_CONFIG, GameLevelDef, SpecialEventDef } from './GameConfig';
import { ColumnRenderer, ColumnType, ColumnMovement } from './ColumnRenderer';
import { DifficultySystem } from './DifficultySystem';
import { PatternGenerator, PatternName } from './PatternGenerator';
import { FairnessChecker } from './FairnessChecker';
import { PlayerModel } from './PlayerModel';
import { TrackedHandData, GameMode } from '../vision/HandTypes';

interface QueuedSpawn {
  spawnTimeMs: number;
  x: number;
  type: ColumnType;
  movement: ColumnMovement;
  speedMultiplier: number;
  widthMultiplier: number;
}

export class SpawnDirector {
  private lastSpawnTime: number = 0;
  private nextInterval: number = GAME_CONFIG.spawnInterval;
  private lastSpawnX: number = 640;

  // Queued pattern items
  private spawnQueue: QueuedSpawn[] = [];

  // Rapid Burst State
  public isBursting: boolean = false;
  private burstEndTime: number = 0;
  private nextBurstEligibleTime: number = 0;

  // Special Difficulty Events
  public activeSpecialEvent: SpecialEventDef | null = null;
  private specialEventEndTime: number = 0;
  private nextSpecialEventEligibleTime: number = 0;

  // Challenge Phases (30s Challenge, 45s Dual Challenge, 55s Final Rush)
  public activeChallengeName: string | null = null;
  private challenge30Triggered: boolean = false;
  private challenge45Triggered: boolean = false;

  // Final Phase State
  public isFinalPhase: boolean = false;
  public isInsaneFinal5: boolean = false;
  private finalSequenceSpawned: boolean = false;

  // Tutorial State
  public tutorialStep: number = 1;
  private tutorialStepTimer: number = 0;

  // Stress Test Mode (?stress=1)
  public stressMode: boolean = false;

  // Current active level definition
  public currentLevelDef: GameLevelDef = GAME_CONFIG.levels[0];
  public mode: GameMode = 'NORMAL';
  public playerModel: PlayerModel = new PlayerModel();

  // ── Pattern Cooldown System (W-001) ─────────────────────────────────────────
  // Tracks when each pattern last fired so the same pattern can't repeat too soon.
  private patternCooldowns: Map<string, number> = new Map();
  private readonly PATTERN_COOLDOWN_MS = 6000; // 6s minimum between same pattern
  private patternHistory: PatternName[] = [];  // last 5 patterns for variety scoring

  // ── Special Object Throttling (W-002) ────────────────────────────────────────
  // Ensures special objects don't cluster — minimum gap between same type.
  private lastSpecialObjectTime: Map<string, number> = new Map();
  private readonly SPECIAL_OBJ_COOLDOWN_MS = 12000; // 12s between same special type

  // ── Challenge Timing with Jitter (BUG-008) ───────────────────────────────────
  private challenge30Window: number = 0; // randomized ~30s ± 8s
  private challenge45Window: number = 0; // randomized ~45s ± 8s

  constructor() {
    this.checkStressModeFromUrl();
  }

  private checkStressModeFromUrl(): void {
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('stress') === '1') {
        this.stressMode = true;
      }
    } catch (_) {}
  }

  public reset(mode: GameMode = 'NORMAL'): void {
    this.mode = mode;
    this.lastSpawnTime = performance.now() + 300;
    this.nextInterval = this.getInitialInterval(mode);
    this.lastSpawnX = 640;
    this.spawnQueue = [];
    this.isBursting = false;
    this.burstEndTime = 0;
    this.nextBurstEligibleTime = performance.now() + GAME_CONFIG.burst.minIntervalMs;
    this.activeSpecialEvent = null;
    this.specialEventEndTime = 0;
    this.nextSpecialEventEligibleTime = performance.now() + 12000;
    this.activeChallengeName = null;
    this.challenge30Triggered = false;
    this.challenge45Triggered = false;
    this.isFinalPhase = false;
    this.isInsaneFinal5 = false;
    this.finalSequenceSpawned = false;
    this.tutorialStep = 1;
    this.tutorialStepTimer = performance.now() + 800;
    this.currentLevelDef = GAME_CONFIG.levels[0];
    this.playerModel.reset();
    // Reset pattern cooldowns & variety tracking
    this.patternCooldowns.clear();
    this.patternHistory = [];
    this.lastSpecialObjectTime.clear();
    // Randomize challenge windows ±8s (BUG-008 fix)
    this.challenge30Window = 28 + Math.random() * 6; // 28–34s
    this.challenge45Window = 42 + Math.random() * 8; // 42–50s
  }

  private getInitialInterval(mode: GameMode): number {
    switch (mode) {
      case 'NIGHTMARE': return GAME_CONFIG.nightmare.spawnIntervalMs;
      case 'CHAOS': return 160;
      case 'TIME_ATTACK': return 320;
      case 'ZEN': return 950;
      case 'ENDLESS': return 800;
      case 'TWO_HANDS': return 650;
      case 'TRAINING': return 1100;
      case 'TUTORIAL': return 1400;
      default: return GAME_CONFIG.levels[0].spawnIntervalMs;
    }
  }

  public update(
    now: number,
    elapsedSec: number,
    timeRemainingSec: number,
    columnRenderer: ColumnRenderer,
    currentLives: number,
    trackedHands: TrackedHandData[] = [],
    playerAccuracy: number = 100,
    currentCombo: number = 0
  ): number {
    let spawnedCount = 0;

    // 1. Evaluate Dynamic Difficulty & Level based on GameMode
    const adaptiveDiff = this.evaluateDifficulty(elapsedSec, playerAccuracy, currentCombo);
    this.currentLevelDef = this.evaluateLevelDef(elapsedSec, playerAccuracy, currentCombo, adaptiveDiff);

    // 2. Boss & Challenge Phase Triggers in 60s Games (NORMAL mode)
    //    Windows use randomized ±8s offsets set in reset() — BUG-008 fix
    if (this.mode === 'NORMAL') {
      // ~30 Seconds: ⚠ RAPID BURST CHALLENGE (window randomized 28–34s)
      if (elapsedSec >= this.challenge30Window && !this.challenge30Triggered) {
        this.challenge30Triggered = true;
        this.activeChallengeName = '⚡ RAPID CHALLENGE ⚡';
        this.queuePattern('RAPID_BURST', adaptiveDiff, now);
        this.queuePattern('RANDOM_BURST', adaptiveDiff, now + 800);
      }

      // ~45 Seconds: ⚠ TWO HAND CHALLENGE (window randomized 42–50s)
      if (elapsedSec >= this.challenge45Window && !this.challenge45Triggered) {
        this.challenge45Triggered = true;
        this.activeChallengeName = '👐 TWO-HAND ATTACK 👐';
        this.queuePattern('TWO_SIDE_ATTACK', adaptiveDiff, now);
        this.queuePattern('CENTER_SPLIT', adaptiveDiff, now + 700);
        this.queuePattern('CROSSING', adaptiveDiff, now + 1400);
      }

      // 50 Seconds: Final Phase Warning
      if (timeRemainingSec <= GAME_CONFIG.finalPhase.startSecondsRemaining && !this.isFinalPhase) {
        this.isFinalPhase = true;
        this.activeChallengeName = '⚠️ FINAL PHASE ⚠️';
      }

      // 55 Seconds: 🔥 FINAL RUSH CLIMAX
      if (timeRemainingSec <= GAME_CONFIG.finalPhase.insaneSecondsRemaining && !this.isInsaneFinal5) {
        this.isInsaneFinal5 = true;
        this.activeChallengeName = '🔥 FINAL RUSH CLIMAX 🔥';
        if (!this.finalSequenceSpawned) {
          this.finalSequenceSpawned = true;
          this.queuePattern('FINAL_RUSH', adaptiveDiff, now);
        }
      }
    }

    // 3. Special Difficulty Events Director
    if (this.activeSpecialEvent) {
      if (now > this.specialEventEndTime) {
        this.activeSpecialEvent = null;
        this.nextSpecialEventEligibleTime = now + 14000 + Math.random() * 6000;
      }
    } else if (
      now > this.nextSpecialEventEligibleTime &&
      !this.isFinalPhase &&
      (adaptiveDiff > 0.35 || this.mode === 'NIGHTMARE' || this.mode === 'CHAOS')
    ) {
      this.triggerRandomSpecialEvent(now, adaptiveDiff);
    }

    // 4. Interactive Tutorial Step Controller
    if (this.mode === 'TUTORIAL') {
      if (now > this.tutorialStepTimer && this.spawnQueue.length === 0) {
        this.runTutorialScript(now);
      }
    }

    // 5. Process Queued Pattern Spawns
    if (this.spawnQueue.length > 0) {
      const remainingQueue: QueuedSpawn[] = [];
      const activeColumns = columnRenderer.columns.filter(c => c.state === 'falling');
      const maxAllowed = this.stressMode
        ? 22
        : this.mode === 'NIGHTMARE' || this.mode === 'CHAOS'
        ? 18
        : this.currentLevelDef.maxSimultaneousObjects;

      for (const item of this.spawnQueue) {
        if (now >= item.spawnTimeMs && activeColumns.length + spawnedCount < maxAllowed) {
          const success = this.executeSpawn(item, adaptiveDiff, columnRenderer, trackedHands, activeColumns);
          if (success) {
            spawnedCount++;
          }
        } else {
          remainingQueue.push(item);
        }
      }
      this.spawnQueue = remainingQueue;
    }

    // 6. Burst Controller
    if (this.isBursting) {
      if (now > this.burstEndTime) {
        this.isBursting = false;
        this.nextBurstEligibleTime = now + GAME_CONFIG.burst.minIntervalMs + Math.random() * 3000;
      }
    } else if (
      (this.currentLevelDef.burstAllowed || this.mode === 'NIGHTMARE' || this.mode === 'TIME_ATTACK') &&
      now > this.nextBurstEligibleTime &&
      (Math.random() < 0.18 || currentCombo >= 15 || this.mode === 'NIGHTMARE') &&
      !this.isFinalPhase
    ) {
      this.isBursting = true;
      this.burstEndTime = now + GAME_CONFIG.burst.durationMs + Math.random() * 600;
      this.nextInterval = GAME_CONFIG.burst.spawnIntervalMs;
    }

    // 7. Main Spawn Interval Check
    if (now - this.lastSpawnTime < this.nextInterval) {
      return spawnedCount;
    }

    const activeColumns = columnRenderer.columns.filter(c => c.state === 'falling');
    const maxObjects = this.stressMode
      ? 22
      : this.mode === 'NIGHTMARE' || this.mode === 'CHAOS'
      ? 18
      : this.currentLevelDef.maxSimultaneousObjects;

    if (activeColumns.length >= maxObjects) {
      return spawnedCount;
    }

    // 8. Select and Queue Next Pattern
    if (this.mode !== 'TUTORIAL') {
      const patternName = this.selectPattern(adaptiveDiff, currentCombo, trackedHands);
      this.queuePattern(patternName, adaptiveDiff, now);
    }

    this.lastSpawnTime = now;

    // Calculate next interval
    if (this.stressMode) {
      this.nextInterval = 120;
    } else if (this.activeSpecialEvent) {
      this.nextInterval = this.activeSpecialEvent.spawnIntervalMs;
    } else if (this.isBursting) {
      this.nextInterval = GAME_CONFIG.burst.spawnIntervalMs * (0.88 + Math.random() * 0.24);
    } else if (this.mode === 'NIGHTMARE') {
      this.nextInterval = GAME_CONFIG.nightmare.spawnIntervalMs * (0.85 + Math.random() * 0.3);
    } else if (this.mode === 'CHAOS') {
      this.nextInterval = 160 + Math.random() * 100;
    } else if (this.mode === 'ZEN') {
      this.nextInterval = 850 + Math.random() * 300;
    } else {
      const baseInterval = this.currentLevelDef.spawnIntervalMs;
      const comboDiscount = Math.min(0.24, (currentCombo / 50) * 0.24);
      this.nextInterval = baseInterval * (1.0 - comboDiscount) * (0.88 + Math.random() * 0.24);
    }

    return spawnedCount;
  }

  private evaluateDifficulty(elapsedSec: number, accuracy: number, combo: number): number {
    if (this.mode === 'NIGHTMARE') return 1.0;
    if (this.mode === 'ZEN') return 0.15;
    if (this.mode === 'CHAOS') return 0.90;
    if (this.mode === 'SURVIVAL' || this.mode === 'ENDLESS') {
      return Math.min(1.0, 0.15 + (elapsedSec / 120) * 0.85);
    }
    return DifficultySystem.getAdaptiveDifficulty(elapsedSec, accuracy, combo);
  }

  private evaluateLevelDef(elapsedSec: number, accuracy: number, combo: number, adaptiveDiff: number): GameLevelDef {
    if (this.mode === 'NIGHTMARE') {
      return {
        level: 8,
        name: 'LEVEL 8 — NIGHTMARE',
        subtitle: 'MAXIMUM OVERDRIVE',
        minTimeSec: 0,
        spawnIntervalMs: GAME_CONFIG.nightmare.spawnIntervalMs,
        baseFallSpeed: GAME_CONFIG.nightmare.baseFallSpeed,
        maxSimultaneousObjects: GAME_CONFIG.nightmare.maxSimultaneousObjects,
        objectWidth: GAME_CONFIG.nightmare.objectWidth,
        objectHeight: GAME_CONFIG.nightmare.objectHeight,
        allowedPatterns: [
          'SINGLE', 'DOUBLE', 'TRIPLE', 'QUAD', 'LEFT_RIGHT', 'RIGHT_LEFT',
          'CENTER_SPLIT', 'ZIGZAG', 'WAVE', 'STAIRCASE', 'CROSSING', 'ALTERNATING',
          'FULL_WIDTH', 'RAPID_BURST', 'RANDOM_BURST', 'FAKE_GAP', 'TWO_SIDE_ATTACK',
          'CENTER_ATTACK', 'CHAOS', 'FINAL_RUSH'
        ],
        burstAllowed: true,
        scoreMultiplierBonus: 4.0,
        themeHue: 0
      };
    }

    if (this.mode === 'ZEN') {
      return {
        level: 1,
        name: 'ZEN HARMONY',
        subtitle: 'FLOW & ACCURACY',
        minTimeSec: 0,
        spawnIntervalMs: 900,
        baseFallSpeed: 200,
        maxSimultaneousObjects: 3,
        objectWidth: 84,
        objectHeight: 210,
        allowedPatterns: ['SINGLE', 'LEFT_RIGHT', 'WAVE'],
        burstAllowed: false,
        scoreMultiplierBonus: 1.0,
        themeHue: 160
      };
    }

    if (this.mode === 'CHAOS') {
      return {
        level: 7,
        name: 'CHAOS STORM',
        subtitle: 'MULTI-TRAJECTORY MAYHEM',
        minTimeSec: 0,
        spawnIntervalMs: 180,
        baseFallSpeed: 620,
        maxSimultaneousObjects: 14,
        objectWidth: 62,
        objectHeight: 180,
        allowedPatterns: ['CHAOS', 'ZIGZAG', 'WAVE', 'CROSSING', 'RANDOM_BURST'],
        burstAllowed: true,
        scoreMultiplierBonus: 3.0,
        themeHue: 280
      };
    }

    if (this.mode === 'TWO_HANDS') {
      return {
        level: 5,
        name: 'DUAL HAND TRIALS',
        subtitle: 'COORDINATION TEST',
        minTimeSec: 0,
        spawnIntervalMs: 600,
        baseFallSpeed: 420,
        maxSimultaneousObjects: 6,
        objectWidth: 72,
        objectHeight: 195,
        allowedPatterns: ['TWO_SIDE_ATTACK', 'CENTER_SPLIT', 'CROSSING', 'ALTERNATING'],
        burstAllowed: false,
        scoreMultiplierBonus: 2.0,
        themeHue: 45
      };
    }

    return DifficultySystem.getLevelDef(elapsedSec, accuracy, combo);
  }

  private triggerRandomSpecialEvent(now: number, difficulty: number): void {
    const events: SpecialEventDef[] = [
      {
        type: 'RAPID_FIRE',
        name: 'RAPID FIRE',
        banner: '🔥 RAPID FIRE! EXTREME SPEED 🔥',
        durationMs: 3200,
        spawnIntervalMs: 140,
        color: '#ff0055'
      },
      {
        type: 'CHAOS',
        name: 'CHAOS MANIA',
        banner: '⚡ CHAOS STORM! UNPREDICTABLE TRAJECTORIES ⚡',
        durationMs: 4000,
        spawnIntervalMs: 220,
        color: '#00f0ff'
      },
      {
        type: 'DOUBLE_HAND',
        name: 'DUAL ATTACK',
        banner: '👐 DUAL HAND REQUIRED! SPLIT ATTACK 👐',
        durationMs: 4500,
        spawnIntervalMs: 300,
        color: '#ffd700'
      },
      {
        type: 'ZIGZAG',
        name: 'ZIGZAG MANIA',
        banner: '🌀 ZIGZAG FRENZY! DODGE & WEAVE 🌀',
        durationMs: 3800,
        spawnIntervalMs: 240,
        color: '#bf00ff'
      }
    ];

    const selected = events[Math.floor(Math.random() * events.length)];
    this.activeSpecialEvent = selected;
    this.specialEventEndTime = now + selected.durationMs;

    if (selected.type === 'RAPID_FIRE') {
      this.queuePattern('RAPID_BURST', difficulty, now);
    } else if (selected.type === 'CHAOS') {
      this.queuePattern('CHAOS', difficulty, now);
    } else if (selected.type === 'DOUBLE_HAND') {
      this.queuePattern('TWO_SIDE_ATTACK', difficulty, now);
    } else if (selected.type === 'ZIGZAG') {
      this.queuePattern('ZIGZAG', difficulty, now);
    }
  }

  private runTutorialScript(now: number): void {
    if (this.tutorialStep === 1) {
      // Step 1: Catch 2 normal columns with open hand
      this.queuePattern('SINGLE', 0.1, now);
      this.tutorialStepTimer = now + 4000;
      this.tutorialStep = 2;
    } else if (this.tutorialStep === 2) {
      // Step 2: Catch dual columns with both hands
      this.queuePattern('TWO_SIDE_ATTACK', 0.2, now);
      this.tutorialStepTimer = now + 4500;
      this.tutorialStep = 3;
    } else if (this.tutorialStep === 3) {
      // Step 3: Deflect red bomb with swipe
      this.spawnQueue.push({
        spawnTimeMs: now + 200,
        x: 640,
        type: 'hazard',
        movement: 'vertical',
        speedMultiplier: 0.8,
        widthMultiplier: 1.1
      });
      this.tutorialStepTimer = now + 5000;
      this.tutorialStep = 4;
    }
  }

  private selectPattern(
    difficulty: number,
    combo: number,
    trackedHands: TrackedHandData[]
  ): PatternName {
    const now = performance.now();

    if (this.mode === 'TWO_HANDS') {
      const dualPatterns: PatternName[] = ['TWO_SIDE_ATTACK', 'CENTER_SPLIT', 'CROSSING', 'ALTERNATING', 'FULL_WIDTH'];
      return this._pickWithCooldown(dualPatterns, now) ?? dualPatterns[0];
    }

    const activeHandsCount = Math.max(1, trackedHands.filter(h => h.active && !h.isGhost).length);
    const allowed = [...this.currentLevelDef.allowedPatterns] as PatternName[];

    if (combo >= 25 && !allowed.includes('RAPID_BURST')) {
      allowed.push('RAPID_BURST', 'CROSSING', 'RANDOM_BURST', 'TWO_SIDE_ATTACK');
    }

    // Prefer dual patterns when two hands are active
    if (activeHandsCount >= 2 && (difficulty > 0.35 || this.mode === 'NIGHTMARE') && Math.random() > 0.4) {
      const dualPatterns: PatternName[] = ['TWO_SIDE_ATTACK', 'CENTER_SPLIT', 'CROSSING', 'ALTERNATING', 'FULL_WIDTH'];
      const picked = this._pickWithCooldown(dualPatterns, now);
      if (picked) return picked;
    }

    // W-001 / BUG-007: cooldown-aware pattern selection
    const cooledDown = allowed.filter(p => {
      const lastUsed = this.patternCooldowns.get(p) ?? 0;
      return now - lastUsed >= this.PATTERN_COOLDOWN_MS;
    });

    // Fall back to full list if all patterns are on cooldown (e.g. small allowed set)
    const pool = cooledDown.length > 0 ? cooledDown : allowed;
    const chosen = pool[Math.floor(Math.random() * pool.length)] || 'SINGLE';

    // Record in cooldown map and history ring-buffer
    this.patternCooldowns.set(chosen, now);
    this.patternHistory.push(chosen);
    if (this.patternHistory.length > 5) this.patternHistory.shift();

    return chosen;
  }

  /** Pick a pattern from `candidates` respecting cooldowns. Returns null if all are cooling. */
  private _pickWithCooldown(candidates: PatternName[], now: number): PatternName | null {
    const available = candidates.filter(p => {
      const lastUsed = this.patternCooldowns.get(p) ?? 0;
      return now - lastUsed >= this.PATTERN_COOLDOWN_MS;
    });
    const pool = available.length > 0 ? available : candidates;
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    if (chosen) {
      this.patternCooldowns.set(chosen, now);
      this.patternHistory.push(chosen);
      if (this.patternHistory.length > 5) this.patternHistory.shift();
    }
    return chosen ?? null;
  }

  private queuePattern(pattern: PatternName, difficulty: number, nowMs: number): void {
    const baseSpeed = this.mode === 'NIGHTMARE'
      ? GAME_CONFIG.nightmare.baseFallSpeed
      : this.currentLevelDef.baseFallSpeed;

    const items = PatternGenerator.generate(
      pattern,
      difficulty,
      baseSpeed,
      this.currentLevelDef.level
    );

    // AI Player Model Bias Check: If player is weaker on left or right, bias position slightly
    const weakSide = this.playerModel.getChallengingSide();

    for (const item of items) {
      // W-002: Special object throttling — skip if same special type spawned too recently
      if (item.type !== 'normal' && item.type !== 'hazard') {
        const lastUsed = this.lastSpecialObjectTime.get(item.type) ?? 0;
        if (nowMs - lastUsed < this.SPECIAL_OBJ_COOLDOWN_MS) {
          // Replace with a plain normal object so we don't lose the spawn slot
          item.type = 'normal';
        } else {
          this.lastSpecialObjectTime.set(item.type, nowMs);
        }
      }

      let posX = item.x;
      if (weakSide === 'left' && posX > 640 && Math.random() > 0.5) {
        posX = 320 + Math.random() * 260;
      } else if (weakSide === 'right' && posX < 640 && Math.random() > 0.5) {
        posX = 700 + Math.random() * 260;
      }

      this.spawnQueue.push({
        spawnTimeMs: nowMs + item.delayMs,
        x: posX,
        type: item.type,
        movement: item.movement,
        speedMultiplier: item.speedMultiplier,
        widthMultiplier: item.widthMultiplier
      });
    }
  }

  private executeSpawn(
    item: QueuedSpawn,
    difficulty: number,
    columnRenderer: ColumnRenderer,
    trackedHands: TrackedHandData[],
    activeColumns: import('./ColumnRenderer').FallingColumnData[]
  ): boolean {
    const baseWidth = this.mode === 'NIGHTMARE'
      ? GAME_CONFIG.nightmare.objectWidth
      : this.currentLevelDef.objectWidth;

    const baseHeight = this.mode === 'NIGHTMARE'
      ? GAME_CONFIG.nightmare.objectHeight
      : this.currentLevelDef.objectHeight;

    const width = Math.round(baseWidth * item.widthMultiplier);
    // FIX BUG-002: was using widthMultiplier for height — now each axis has its own multiplier
    const heightMult = (item as { heightMultiplier?: number }).heightMultiplier ?? item.widthMultiplier;
    const height = Math.round(baseHeight * heightMult);

    const baseSpeed = this.mode === 'NIGHTMARE'
      ? GAME_CONFIG.nightmare.baseFallSpeed
      : this.currentLevelDef.baseFallSpeed;

    const vy = baseSpeed * item.speedMultiplier;
    const clampedX = FairnessChecker.clampToFairArena(item.x, width);

    // Enforce Fairness (Anti-overlap & reachability)
    if (!this.stressMode && this.mode !== 'TUTORIAL') {
      const isFair = FairnessChecker.isSpawnFair(
        clampedX,
        vy,
        width,
        height,
        activeColumns,
        trackedHands,
        difficulty,
        this.lastSpawnX,
        -height - 15  // actual spawn Y (off-screen)
      );
      if (!isFair) {
        return false;
      }
    }

    const col = columnRenderer.spawn(
      clampedX,
      -height - 15,
      width,
      height,
      vy,
      item.type,
      item.movement
    );

    if (col) {
      this.lastSpawnX = clampedX;
      return true;
    }

    return false;
  }
}
