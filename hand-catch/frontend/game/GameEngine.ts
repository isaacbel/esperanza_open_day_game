/**
 * GameEngine.ts - Core Arcade Engine for HAND CATCH (Hardcore Master Edition)
 * Pure TypeScript orchestrator. Zero React state in hot loop.
 */
import { GAME_CONFIG } from './GameConfig';
import { GameMode, TrackedHandData } from '../vision/HandTypes';
import { handTracker } from '../vision/HandTracker';
import { audio } from '../audio/AudioManager';
import { GameLoop } from './GameLoop';
import { ArenaRenderer } from './ArenaRenderer';
import { ColumnRenderer, FallingColumnData } from './ColumnRenderer';
import { HandRenderer } from './HandRenderer';
import { ParticleSystem } from './ParticleSystem';
import { SpawnDirector } from './SpawnDirector';
import { CollisionSystem } from './CollisionSystem';
import { ScoreSystem } from './ScoreSystem';
import { PerformanceMonitor } from '../utils/performance';
import { GameOverStats } from './GameState';
import { ProgressionSystem } from './ProgressionSystem';
import { AchievementSystem } from './AchievementSystem';

export class GameEngine {
  public canvas: HTMLCanvasElement;
  public ctx: CanvasRenderingContext2D;

  public arenaRenderer: ArenaRenderer;
  public columnRenderer: ColumnRenderer;
  public particleSystem: ParticleSystem;
  public spawnDirector: SpawnDirector;
  public scoreSystem: ScoreSystem;
  public perfMonitor: PerformanceMonitor;
  private loop: GameLoop;

  public mode: GameMode = 'NORMAL';
  public playerName: string = 'PLAYER';
  public lives: number = GAME_CONFIG.initialLives;
  public timeRemaining: number = GAME_CONFIG.gameDuration;
  public elapsedTime: number = 0;
  public level: number = 1;

  public isRunning: boolean = false;
  public isPaused: boolean = false;
  public debugMode: boolean = false;
  public heartShakeTime: number = 0;

  // Time Dilation (Freeze Slow-Mo)
  public timeDilationTimer: number = 0;

  // Gesture Tracker counts for current round
  private grabCount: number = 0;

  public onGameOver?: (stats: GameOverStats) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Failed to acquire 2D Canvas context');
    this.ctx = context;

    this.arenaRenderer = new ArenaRenderer();
    this.columnRenderer = new ColumnRenderer(44);
    this.particleSystem = new ParticleSystem();
    this.spawnDirector = new SpawnDirector();
    this.scoreSystem = new ScoreSystem();
    this.perfMonitor = new PerformanceMonitor();

    this.loop = new GameLoop(
      (dt: number) => this.update(dt),
      (alpha: number) => this.render(alpha)
    );
    this.loop.start();

    this.handleResize();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => this.handleResize());
    }
  }

  public handleResize(): void {
    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
    const width = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const height = typeof window !== 'undefined' ? window.innerHeight : 720;

    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    const vw = handTracker.video?.videoWidth || 1280;
    const vh = handTracker.video?.videoHeight || 720;
    handTracker.mapper.updateViewport(this.canvas.width, this.canvas.height, vw, vh);
    this.arenaRenderer.initOffscreenLayers();
  }

  public start(mode: GameMode = 'NORMAL', playerName: string = 'PLAYER'): void {
    this.mode = mode;
    this.playerName = playerName;
    this.lives = mode === 'ZEN' ? 99 : GAME_CONFIG.initialLives;
    this.timeRemaining = mode === 'TIME_ATTACK' ? 30 : GAME_CONFIG.gameDuration;
    this.elapsedTime = 0;
    this.level = 1;
    this.heartShakeTime = 0;
    this.timeDilationTimer = 0;
    this.grabCount = 0;

    this.scoreSystem.reset();
    this.columnRenderer.reset();
    this.particleSystem.reset();
    this.spawnDirector.reset(mode);

    this.isRunning = true;
    this.isPaused = false;
    audio.startAmbience();
  }

  public pause(): void {
    this.isPaused = true;
  }

  public resume(): void {
    this.isPaused = false;
  }

  public stop(): void {
    this.isRunning = false;
    this.isPaused = false;
    audio.stopAmbience(0.6);
  }

  public update(dt: number): void {
    if (!this.isRunning || this.isPaused) {
      this.arenaRenderer.update(dt);
      this.particleSystem.update(dt);
      return;
    }

    // Time dilation slow-motion scaling
    let effectiveDt = dt;
    if (this.timeDilationTimer > 0) {
      this.timeDilationTimer = Math.max(0, this.timeDilationTimer - dt);
      effectiveDt = dt * 0.42;
    }

    this.elapsedTime += dt;

    // Record highest level reached
    this.scoreSystem.recordLevel(
      this.spawnDirector.currentLevelDef.level,
      this.spawnDirector.currentLevelDef.name,
      this.spawnDirector.currentLevelDef.subtitle
    );
    this.level = this.spawnDirector.currentLevelDef.level;

    // Timers
    if (this.mode === 'NORMAL' || this.mode === 'TIME_ATTACK') {
      this.timeRemaining -= dt;
      if (this.timeRemaining <= 0) {
        this.timeRemaining = 0;
        this.triggerGameOver('TIME UP');
        return;
      }
    }

    if (this.heartShakeTime > 0) {
      this.heartShakeTime = Math.max(0, this.heartShakeTime - dt);
    }

    this.scoreSystem.updateDisplayScore(dt);
    this.arenaRenderer.update(effectiveDt);
    this.particleSystem.update(effectiveDt);

    // 1. Hands snapshot
    const trackedHands = handTracker.getTrackedHands();

    // 2. Master Spawn Director AI
    const spawned = this.spawnDirector.update(
      performance.now(),
      this.elapsedTime,
      this.timeRemaining,
      this.columnRenderer,
      this.lives,
      trackedHands,
      this.scoreSystem.getAccuracy(),
      this.scoreSystem.combo
    );
    this.scoreSystem.totalSpawned += spawned;

    // 3. Update active columns & check floor miss / combo protection
    this.columnRenderer.update(effectiveDt);
    for (const col of this.columnRenderer.columns) {
      if (col.state === 'falling' && col.y + col.height >= GAME_CONFIG.arena.floorY) {
        this.handleColumnMiss(col);
      }
    }

    // 4. Process collisions
    this.processCollisions();
  }

  private processCollisions(): void {
    const trackedHands = handTracker.getTrackedHands();
    if (trackedHands.length === 0) return;

    for (const col of this.columnRenderer.columns) {
      if (col.state !== 'falling') continue;

      for (const hand of trackedHands) {
        const result = CollisionSystem.checkHandColumn(hand, col);
        if (result.hit) {
          this.handleColumnCatch(
            col,
            hand,
            result.hitPoint?.x,
            result.hitPoint?.y,
            result.assisted,
            result.catchType
          );
          break;
        }
      }
    }
  }

  private handleColumnCatch(
    col: FallingColumnData,
    hand: TrackedHandData,
    hitX?: number,
    hitY?: number,
    assisted: boolean = false,
    catchType?: 'PALM' | 'FINGERTIP' | 'GRAB' | 'INTERCEPT' | 'PREDICT'
  ): void {
    const x = hitX ?? col.x;
    const y = hitY ?? col.y + col.height * 0.7;

    // Physical Hand Feature: Hazard Swipe Deflection
    const isSwipeDeflection = (hand.movement.startsWith('SWIPE_') || hand.speed > 340) && hand.openness > 0.3;
    if (col.type === 'hazard' && isSwipeDeflection) {
      this.columnRenderer.triggerCatch(col, hand.trackId, hand.palm.x, hand.palm.y);
      audio.playFast();
      this.particleSystem.emitCatch(x, y, '#00ffaa', 34, hand.vx * 1.5, hand.vy * 1.5);
      this.scoreSystem.addScore(150);
      this.spawnDirector.playerModel.recordDeflection();
      AchievementSystem.checkAndUnlock('bomb_deflector');
      this.particleSystem.addPopup(x, y, '+150', 'BOMB DEFLECTED!', '#00ffaa', true);
      return;
    }

    // Feel-Good Catch Lifecycle
    this.columnRenderer.triggerCatch(col, hand.trackId, hand.palm.x, hand.palm.y);

    // Hazard / Bomb Hit (Costs 2 lives on direct touch)
    if (col.type === 'hazard') {
      this.scoreSystem.registerMiss();
      if (this.mode !== 'ZEN' && this.mode !== 'TIME_ATTACK' && this.mode !== 'TUTORIAL') {
        this.lives = Math.max(0, this.lives - 2);
      }
      audio.playMiss();
      this.particleSystem.emitMiss(x, y);
      this.arenaRenderer.floorFlashAlpha = 1.0;
      this.arenaRenderer.vignetteRedFlash = 1.0;
      this.heartShakeTime = 0.6;
      this.particleSystem.addPopup(x, y, 'BOMB HIT!', '-2 LIVES', '#ff2a2a', true);

      if (this.lives <= 0 && this.mode !== 'ZEN' && this.mode !== 'TIME_ATTACK' && this.mode !== 'TUTORIAL') {
        this.triggerGameOver('DESTROYED BY HAZARD');
      }
      return;
    }

    // Gesture style & physical interaction bonus evaluation
    let gestureBonus = 0;
    let gestureTag = '';
    if (catchType === 'GRAB' || hand.pose === 'GRAB' || hand.pose === 'FIST') {
      gestureBonus = 50;
      gestureTag = 'PERFECT GRAB!';
      this.grabCount++;
      if (this.grabCount >= 5) AchievementSystem.checkAndUnlock('perfect_grab');
    } else if (catchType === 'INTERCEPT' || (hand.reachingScore ?? 0) > 0.65) {
      gestureBonus = 35;
      gestureTag = 'INTERCEPT!';
    } else if (catchType === 'FINGERTIP' || hand.pose === 'PINCH') {
      gestureBonus = 30;
      gestureTag = hand.pose === 'PINCH' ? 'PINCH CATCH!' : 'FINGERTIP CATCH!';
      if (hand.pose === 'PINCH') AchievementSystem.checkAndUnlock('pinch_precision');
    } else if (hand.speed > 420) {
      gestureBonus = 30;
      gestureTag = 'LIGHTNING FAST!';
    }

    // Reaction Time measurement & score registration
    const levelBonus = this.spawnDirector.currentLevelDef.scoreMultiplierBonus;
    const { points: basePoints, multiplier, isMilestone } = this.scoreSystem.registerCatch(
      col.scoreMultiplier,
      col.spawnTime,
      performance.now(),
      levelBonus
    );

    if (gestureBonus > 0) {
      this.scoreSystem.addScore(gestureBonus * multiplier);
    }
    const totalPoints = basePoints + gestureBonus * multiplier;

    // AI Player Model recording
    const reactionSec = Math.max(0.1, (performance.now() - col.spawnTime) / 1000);
    this.spawnDirector.playerModel.recordCatch(col.x, reactionSec, hand.pose, hand.speed);

    // Achievements Check
    AchievementSystem.checkAndUnlock('first_catch');
    if (reactionSec <= 0.18) AchievementSystem.checkAndUnlock('speed_demon');
    if (hand.speed >= 450) AchievementSystem.checkAndUnlock('lightning_strike');
    if (this.scoreSystem.combo >= 30) AchievementSystem.checkAndUnlock('combo_master');
    if (this.scoreSystem.combo >= 50) AchievementSystem.checkAndUnlock('combo_god');

    // Check dual hands catch
    const activeHands = handTracker.getTrackedHands().filter(h => h.active && !h.isGhost);
    if (activeHands.length >= 2 && (col.x < 420 || col.x > 860)) {
      AchievementSystem.checkAndUnlock('two_hands');
    }

    // Dynamic sound & particle reactions based on column type
    if (col.type === 'final_gold') {
      audio.playGold();
      this.particleSystem.emitCatch(x, y, '#fff066', 48, hand.vx * 1.5, hand.vy * 1.5);
      this.particleSystem.addPopup(x, y, `+${totalPoints}`, '5X★ FINAL OBJECT!', '#fff066', true);
    } else if (col.type === 'slow') {
      // Time Dilation Freeze
      this.timeDilationTimer = 3.5;
      audio.playFast();
      this.particleSystem.emitCatch(x, y, '#00ffaa', 40, hand.vx, hand.vy);
      this.particleSystem.addPopup(x, y, `+${totalPoints}`, '❄️ TIME DILATION!', '#00ffaa', true);
      AchievementSystem.checkAndUnlock('time_dilation');
    } else if (col.type === 'teleport') {
      audio.playFast();
      this.particleSystem.emitCatch(x, y, '#00e5ff', 38, hand.vx, hand.vy);
      this.particleSystem.addPopup(x, y, `+${totalPoints}`, '🌀 QUANTUM WARP!', '#00e5ff', true);
      AchievementSystem.checkAndUnlock('teleport_hunter');
    } else if (col.type === 'ghost') {
      audio.playGold();
      this.particleSystem.emitCatch(x, y, '#c4a1ff', 36, hand.vx, hand.vy);
      this.particleSystem.addPopup(x, y, `+${totalPoints}`, '👻 SPECTRAL CATCH!', '#c4a1ff', true);
      AchievementSystem.checkAndUnlock('ghost_buster');
    } else if (col.type === 'combo') {
      this.scoreSystem.boostCombo(3);
      audio.playFast();
      this.particleSystem.emitCatch(x, y, '#00f0ff', 36, hand.vx, hand.vy);
      this.particleSystem.addPopup(x, y, `+${totalPoints}`, '+3🔥 COMBO SURGE!', '#00f0ff', true);
    } else if (col.type === 'gold') {
      audio.playGold();
      this.particleSystem.emitCatch(x, y, '#ffd700', 36, hand.vx, hand.vy);
      this.particleSystem.addPopup(x, y, `+${totalPoints}`, gestureTag || `GOLD x${multiplier}`, '#ffd700', true);
    } else if (col.type === 'heart') {
      this.lives = Math.min(GAME_CONFIG.maxLives, this.lives + 1);
      audio.playHeart();
      this.particleSystem.emitCatch(x, y, '#ff007f', 32, hand.vx, hand.vy);
      this.particleSystem.addPopup(x, y, '+1 LIFE', `SCORE +${totalPoints}`, '#ff007f', true);
    } else if (col.type === 'multiplier') {
      audio.playMultiplier();
      this.particleSystem.emitCatch(x, y, '#ff9900', 30, hand.vx, hand.vy);
      this.particleSystem.addPopup(x, y, `+${totalPoints}`, gestureTag || `BONUS x${multiplier}`, '#ff9900', true);
    } else if (col.type === 'fast') {
      audio.playFast();
      this.particleSystem.emitCatch(x, y, '#bf00ff', 32, hand.vx, hand.vy);
      this.particleSystem.addPopup(x, y, `+${totalPoints}`, gestureTag || `RAPID! x${multiplier}`, '#bf00ff', true);
    } else {
      audio.playCatch(this.scoreSystem.combo, hand.speed);
      this.particleSystem.emitCatch(x, y, hand.color, 24, hand.vx, hand.vy);
      const sub = gestureTag || (multiplier > 1 ? `x${multiplier} COMBO` : '');
      this.particleSystem.addPopup(x, y, `+${totalPoints}`, sub, hand.color, multiplier >= 5 || gestureBonus > 0);
    }

    if (isMilestone) {
      audio.playComboMilestone(this.scoreSystem.combo);
      this.particleSystem.emitComboMilestone(x, y, this.scoreSystem.combo);
      this.particleSystem.addPopup(
        GAME_CONFIG.arena.centerX, 200,
        `COMBO ${this.scoreSystem.combo}!`,
        `x${multiplier} MULTIPLIER`,
        '#00f0ff',
        true
      );
    }
  }

  private handleColumnMiss(col: FallingColumnData): void {
    // Combo Protection Grace Period
    const trackedHands = handTracker.getTrackedHands();
    let rescuedHand: TrackedHandData | null = null;

    for (const hand of trackedHands) {
      if (!hand.active) continue;
      const d = Math.hypot(hand.palm.x - col.x, hand.palm.y - (col.y + col.height));
      if (d < hand.palm.radius + 80 && (hand.speed > 80 || hand.vy > -50)) {
        rescuedHand = hand;
        break;
      }
    }

    if (rescuedHand) {
      this.handleColumnCatch(col, rescuedHand, col.x, GAME_CONFIG.arena.floorY - 20, true);
      this.particleSystem.addPopup(col.x, GAME_CONFIG.arena.floorY - 30, 'CLOSE CATCH!', 'GRACE RESCUE', '#00ffaa', false);
      return;
    }

    col.state = 'missed';
    this.scoreSystem.registerMiss();
    this.spawnDirector.playerModel.recordAttempt(col.x);

    const floorX = col.x;
    const floorY = GAME_CONFIG.arena.floorY;

    if (col.type === 'normal' || col.type === 'fast') {
      if (this.mode !== 'ZEN' && this.mode !== 'TIME_ATTACK' && this.mode !== 'TUTORIAL') {
        this.lives = Math.max(0, this.lives - 1);
        this.heartShakeTime = 0.5;
        this.arenaRenderer.floorFlashAlpha = 1.0;
        this.arenaRenderer.vignetteRedFlash = 0.85;
      }
      audio.playMiss();
      this.particleSystem.emitMiss(floorX, floorY);

      if (this.lives <= 0 && this.mode !== 'ZEN' && this.mode !== 'TIME_ATTACK' && this.mode !== 'TUTORIAL') {
        this.triggerGameOver('NO LIVES REMAINING');
      }
    } else {
      audio.playMiss();
      this.particleSystem.emitMiss(floorX, floorY);
      this.arenaRenderer.floorFlashAlpha = 0.6;
    }

    setTimeout(() => {
      col.state = 'inactive';
    }, 150);
  }

  private triggerGameOver(reason: string): void {
    if (!this.isRunning) return;
    this.stop();
    audio.playGameOver();

    // Award XP Progression
    const xpBreakdown = ProgressionSystem.awardSessionXP(
      this.scoreSystem.score,
      this.scoreSystem.maxCombo,
      this.scoreSystem.getAccuracy(),
      this.scoreSystem.caught
    );

    // Check End-Game Achievements
    if (this.scoreSystem.getAccuracy() === 100 && this.scoreSystem.caught >= 15) {
      AchievementSystem.checkAndUnlock('perfect_round');
    }
    if (this.mode === 'NIGHTMARE' && this.scoreSystem.score >= 10000) {
      AchievementSystem.checkAndUnlock('nightmare_survivor');
    }
    if (this.mode === 'ZEN' && this.scoreSystem.maxCombo >= 40) {
      AchievementSystem.checkAndUnlock('zen_master');
    }

    const currentProg = ProgressionSystem.getProgression();
    const handControl = this.spawnDirector.playerModel.getHandControlRating();

    const stats: GameOverStats = {
      score: this.scoreSystem.score,
      maxCombo: this.scoreSystem.maxCombo,
      caught: this.scoreSystem.caught,
      missed: this.scoreSystem.missed,
      totalSpawned: this.scoreSystem.totalSpawned,
      accuracy: this.scoreSystem.getAccuracy(),
      averageReactionTime: this.scoreSystem.averageReactionTime,
      bestReactionTime: this.scoreSystem.bestReactionTime,
      performanceRating: this.scoreSystem.getPerformanceRating(),
      objectsPerMinute: this.scoreSystem.getObjectsPerMinute(this.elapsedTime),
      highestLevel: this.scoreSystem.highestLevelName,
      xpEarned: xpBreakdown.totalXP,
      playerLevel: currentProg.level,
      playerTitle: currentProg.title,
      handControlRating: handControl,
      achievementsUnlocked: AchievementSystem.newlyUnlocked.map(a => a.title),
      mode: this.mode,
      playerName: this.playerName,
      reason
    };

    if (this.onGameOver) this.onGameOver(stats);
  }

  public render(_alpha: number): void {
    const ctx = this.ctx;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const lowQual = this.perfMonitor.lowQualityMode;

    ctx.fillStyle = '#030612';
    ctx.fillRect(0, 0, cw, ch);

    // 1. Mirrored Webcam Video Feed
    if (handTracker.video && handTracker.video.readyState >= 2) {
      ctx.save();
      ctx.translate(cw, 0);
      ctx.scale(-1, 1);

      const vw = handTracker.video.videoWidth;
      const vh = handTracker.video.videoHeight;
      const transform = handTracker.mapper.getTransform();
      ctx.drawImage(
        handTracker.video,
        transform.videoOffsetX,
        transform.videoOffsetY,
        vw * transform.videoFitScale,
        vh * transform.videoFitScale
      );
      ctx.restore();
    }

    // 2. Camera Screen Shake + Logical Transform
    ctx.save();
    const transform = handTracker.mapper.getTransform();
    ctx.translate(
      transform.gameOriginX + this.particleSystem.shakeOffsetX,
      transform.gameOriginY + this.particleSystem.shakeOffsetY
    );
    ctx.scale(transform.gameScale, transform.gameScale);

    // 3. Darkened Vignette
    this.arenaRenderer.renderBackground(ctx);

    // 4. Arena Floor & Scanner
    this.arenaRenderer.renderArena(ctx);

    // 5. Falling Columns
    this.columnRenderer.render(ctx, lowQual);

    // 6. Hands
    const hands = handTracker.getTrackedHands();
    HandRenderer.renderHands(ctx, hands, lowQual);

    // 7. Particles, Shockwaves, Popups
    this.particleSystem.render(ctx, lowQual);

    // 8. Time Dilation Visual Overlay
    if (this.timeDilationTimer > 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(0, 240, 255, 0.08)';
      ctx.fillRect(0, 0, GAME_CONFIG.logicalWidth, GAME_CONFIG.logicalHeight);
      ctx.restore();
    }

    // 9. In-Game Canvas HUD
    this.renderCanvasHUD(ctx);

    // 10. Developer Performance Profiler Overlay
    if (this.debugMode) {
      const activeCols = this.columnRenderer.columns.filter(c => c.state === 'falling').length;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mem = (performance as any).memory
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? `${Math.round((performance as any).memory.usedJSHeapSize / 1048576)} MB`
        : 'N/A';
      const latencyEst = Math.round(1000 / Math.max(1, handTracker.trackingFps) + handTracker.inferenceMs);

      const metrics = [
        `PROFILER [D to toggle]`,
        `Render FPS:     ${this.perfMonitor.getFps()}`,
        `Tracking FPS:   ${handTracker.trackingFps}`,
        `Inference:      ${handTracker.inferenceMs} ms`,
        `Delegate:       ${handTracker.activeDelegate}`,
        `Latency Est:    ~${latencyEst} ms`,
        `Hands Detected: ${hands.length}`,
        ...hands.map(h =>
          `  [${h.trackId}] ${h.pose} ${h.movement} ${Math.round(h.speed)}px/s reach:${(h.reachingScore??0).toFixed(2)}`
        ),
        `Active Columns: ${activeCols}`,
        `Particles:      ${this.particleSystem.getActiveCount()}`,
        `Avg Reaction:   ${this.scoreSystem.averageReactionTime}s`,
        `Heap Memory:    ${mem}`,
        `Quality Level:  ${lowQual ? 'LOW' : 'HIGH'}`
      ];
      HandRenderer.renderDebugOverlay(ctx, hands, metrics);
    }

    ctx.restore();
    this.perfMonitor.update();
  }

  private renderCanvasHUD(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 8;

    // Top-Left: SCORE, COMBO & OPM
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    ctx.font = '700 13px "Orbitron", system-ui';
    ctx.fillStyle = 'rgba(0, 240, 255, 0.7)';
    ctx.fillText('SCORE', 40, 24);

    ctx.font = '900 34px "Orbitron", system-ui';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(this.scoreSystem.displayScore.toString().padStart(5, '0'), 40, 42);

    const opm = this.scoreSystem.getObjectsPerMinute(this.elapsedTime);
    ctx.font = '700 11px "Orbitron", system-ui';
    ctx.fillStyle = 'rgba(0, 240, 255, 0.55)';
    ctx.fillText(`${opm} OPM • ${this.scoreSystem.averageReactionTime}s RT`, 40, 80);

    if (this.scoreSystem.combo > 1) {
      ctx.save();
      ctx.translate(40, 102);
      ctx.scale(this.scoreSystem.comboScale, this.scoreSystem.comboScale);

      let comboColor = '#00f0ff';
      if (this.scoreSystem.combo >= 15) comboColor = '#ffd700';
      else if (this.scoreSystem.combo >= 10) comboColor = '#ff00b7';
      else if (this.scoreSystem.combo >= 5) comboColor = '#00ff88';

      ctx.font = '900 20px "Orbitron", system-ui';
      ctx.fillStyle = comboColor;
      ctx.fillText(`COMBO x${this.scoreSystem.getComboMultiplier()}`, 0, 0);

      ctx.font = '600 12px system-ui';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.fillText(`STREAK: ${this.scoreSystem.combo}`, 0, 22);
      ctx.restore();
    }

    // Top-Center: Dynamic Level Title & Time
    ctx.textAlign = 'center';
    const levelDef = this.spawnDirector.currentLevelDef;

    ctx.font = '700 13px "Orbitron", system-ui';
    ctx.fillStyle = this.spawnDirector.isInsaneFinal5
      ? '#ffd700'
      : this.spawnDirector.isFinalPhase
      ? '#ff2a5f'
      : 'rgba(0, 240, 255, 0.85)';
    ctx.fillText(`${levelDef.name} • ${levelDef.subtitle}`, GAME_CONFIG.logicalWidth / 2, 22);

    if (this.mode === 'NORMAL' || this.mode === 'TIME_ATTACK') {
      const secondsLeft = Math.ceil(this.timeRemaining);
      const isCritical = secondsLeft <= 10;

      ctx.font = '900 36px "Orbitron", system-ui';
      ctx.fillStyle = isCritical
        ? (Math.sin(performance.now() * 0.015) > 0 ? '#ff2a5f' : '#ffffff')
        : '#ffffff';
      ctx.fillText(`${secondsLeft}s`, GAME_CONFIG.logicalWidth / 2, 42);
    } else {
      const mins = Math.floor(this.elapsedTime / 60).toString().padStart(2, '0');
      const secs = Math.floor(this.elapsedTime % 60).toString().padStart(2, '0');

      ctx.font = '900 34px "Orbitron", system-ui';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`${mins}:${secs}`, GAME_CONFIG.logicalWidth / 2, 42);
    }

    // Dynamic Central Alert Banner (Boss Challenges / Special Events / Climax / Burst)
    if (this.spawnDirector.isInsaneFinal5) {
      ctx.save();
      const pulse = 1.0 + Math.sin(performance.now() * 0.012) * 0.08;
      ctx.translate(GAME_CONFIG.logicalWidth / 2, 92);
      ctx.scale(pulse, pulse);
      ctx.font = '900 15px "Orbitron", system-ui';
      ctx.fillStyle = '#ffd700';
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 12;
      ctx.fillText('⚡ INSANE FINAL CLIMAX ⚡', 0, 0);
      ctx.restore();
    } else if (this.spawnDirector.activeSpecialEvent) {
      const evt = this.spawnDirector.activeSpecialEvent;
      ctx.save();
      const pulse = 1.0 + Math.sin(performance.now() * 0.014) * 0.06;
      ctx.translate(GAME_CONFIG.logicalWidth / 2, 92);
      ctx.scale(pulse, pulse);
      ctx.font = '900 14px "Orbitron", system-ui';
      ctx.fillStyle = evt.color;
      ctx.shadowColor = evt.color;
      ctx.shadowBlur = 12;
      ctx.fillText(evt.banner, 0, 0);
      ctx.restore();
    } else if (this.spawnDirector.activeChallengeName) {
      ctx.save();
      ctx.translate(GAME_CONFIG.logicalWidth / 2, 92);
      ctx.font = '900 14px "Orbitron", system-ui';
      ctx.fillStyle = '#ff00b7';
      ctx.shadowColor = '#ff00b7';
      ctx.shadowBlur = 10;
      ctx.fillText(this.spawnDirector.activeChallengeName, 0, 0);
      ctx.restore();
    } else if (this.spawnDirector.isBursting) {
      ctx.save();
      ctx.translate(GAME_CONFIG.logicalWidth / 2, 92);
      ctx.font = '900 14px "Orbitron", system-ui';
      ctx.fillStyle = '#ff00b7';
      ctx.shadowColor = '#ff00b7';
      ctx.shadowBlur = 10;
      ctx.fillText('🔥 RAPID BURST! 🔥', 0, 0);
      ctx.restore();
    }

    // Top-Right: LIVES (Animated hearts)
    if (this.mode !== 'ZEN') {
      ctx.textAlign = 'right';
      ctx.font = '700 13px "Orbitron", system-ui';
      ctx.fillStyle = 'rgba(0, 240, 255, 0.7)';
      ctx.fillText('LIVES', GAME_CONFIG.logicalWidth - 40, 24);

      const heartShake = this.heartShakeTime > 0 ? (Math.random() - 0.5) * 8 : 0;
      ctx.font = '800 28px system-ui';
      for (let i = 0; i < GAME_CONFIG.maxLives; i++) {
        const heartX = GAME_CONFIG.logicalWidth - 40 - (GAME_CONFIG.maxLives - 1 - i) * 34 + heartShake;
        const isAlive = i < this.lives;
        ctx.fillStyle = isAlive ? '#ff2a5f' : 'rgba(255, 255, 255, 0.2)';
        ctx.fillText(isAlive ? '♥' : '♡', heartX, 44);
      }
    } else {
      ctx.textAlign = 'right';
      ctx.font = '700 14px "Orbitron", system-ui';
      ctx.fillStyle = '#00ffaa';
      ctx.fillText('🧘 ZEN MODE', GAME_CONFIG.logicalWidth - 40, 36);
    }

    // In-Game Tutorial Guidance Prompts
    if (this.mode === 'TUTORIAL') {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = '900 16px "Orbitron", system-ui';
      ctx.fillStyle = '#00f0ff';
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 10;

      let guideText = '🖐 OPEN YOUR HAND — MOVE TOWARDS THE FALLING COLUMNS';
      if (this.spawnDirector.tutorialStep === 2) {
        guideText = '👐 USE BOTH HANDS — CATCH SIMULTANEOUS TARGETS';
      } else if (this.spawnDirector.tutorialStep === 3) {
        guideText = '💥 SWIPE FAST TO DEFLECT RED BOMBS!';
        ctx.fillStyle = '#ff2a5f';
        ctx.shadowColor = '#ff2a5f';
      } else if (this.spawnDirector.tutorialStep === 4) {
        guideText = '🎉 TUTORIAL COMPLETE — READY FOR ARCADE!';
        ctx.fillStyle = '#00ffaa';
      }
      ctx.fillText(guideText, GAME_CONFIG.logicalWidth / 2, 540);
      ctx.restore();
    }

    ctx.restore();
  }

  public destroy(): void {
    this.stop();
    this.loop.stop();
  }
}
