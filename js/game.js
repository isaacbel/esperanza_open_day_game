/**
 * game.js - HAND CATCH Arcade Game Engine
 * Manages game state, object pooling, fixed-timestep physics, difficulty curve,
 * arena rendering, collision resolution, adaptive quality, and canvas HUD.
 */
import { GAME_CONFIG } from './config.js';
import { checkHandColumnCollision } from './collision.js';
import { ParticleSystem, getGlowSprite } from './particles.js';
import { audio } from './audio.js';
import { handTracker } from './handTracking.js';

class FallingColumn {
  constructor(id) {
    this.id = id;
    this.type = 'normal'; // 'normal' | 'gold' | 'heart' | 'hazard'
    this.x = 0;
    this.y = 0;
    this.prevY = 0;
    this.width = 70;
    this.height = 190;
    this.vy = 220;
    this.color = '#00f0ff';
    this.scoreMultiplier = 1;
    this.spawnTime = 0;
    this.state = 'inactive'; // 'falling' | 'caught' | 'missed' | 'inactive'
    this.caughtByHand = null;

    // Fixed ring buffer for motion trail (avoids per-frame allocations)
    this.trailMax = GAME_CONFIG.trailLength;
    this.trail = Array.from({ length: this.trailMax }, () => ({ x: 0, y: 0, alpha: 0 }));
    this.trailIndex = 0;
  }

  spawn(x, y, width, height, vy, type = 'normal') {
    this.x = x;
    this.y = y;
    this.prevY = y;
    this.width = width;
    this.height = height;
    this.vy = vy;
    this.type = type;
    this.state = 'falling';
    this.caughtByHand = null;
    this.spawnTime = performance.now();

    if (type === 'gold') {
      this.color = '#ffd700';
      this.scoreMultiplier = 3;
    } else if (type === 'heart') {
      this.color = '#ff007f';
      this.scoreMultiplier = 1;
    } else if (type === 'hazard') {
      this.color = '#ff2a2a';
      this.scoreMultiplier = 0;
    } else {
      this.color = '#00f0ff';
      this.scoreMultiplier = 1;
    }

    // Reset trail buffer
    for (let i = 0; i < this.trailMax; i++) {
      this.trail[i].x = x;
      this.trail[i].y = y;
      this.trail[i].alpha = 0;
    }
    this.trailIndex = 0;
  }

  update(dt) {
    if (this.state !== 'falling') return;

    this.prevY = this.y;
    this.y += this.vy * dt;

    // Update trail ring buffer
    const slot = this.trail[this.trailIndex];
    slot.x = this.x;
    slot.y = this.y;
    slot.alpha = 0.45;
    this.trailIndex = (this.trailIndex + 1) % this.trailMax;

    // Fade trail history
    for (let i = 0; i < this.trailMax; i++) {
      this.trail[i].alpha *= 0.88;
    }
  }
}

export class GameEngine {
  constructor(canvas, onGameOverCallback) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.onGameOver = onGameOverCallback;

    // Particles & Visual effects
    this.particles = new ParticleSystem();

    // Falling columns pool (16 pre-allocated objects)
    this.columnsPool = Array.from({ length: 18 }, (_, idx) => new FallingColumn(idx));

    // Game stats
    this.mode = 'NORMAL'; // 'NORMAL' | 'ENDLESS'
    this.playerName = 'PLAYER';
    this.score = 0;
    this.displayScore = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.comboScale = 1.0;
    this.lives = GAME_CONFIG.initialLives;
    this.maxLives = GAME_CONFIG.maxLives;
    this.timeRemaining = GAME_CONFIG.gameDuration;
    this.elapsedTime = 0;
    this.level = 1;
    this.caughtCount = 0;
    this.missedCount = 0;
    this.totalSpawned = 0;

    // Timing & Fixed-timestep accumulator (60-120 ticks/sec)
    this.isRunning = false;
    this.isPaused = false;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.fixedStep = 1 / 100; // 100 Hz simulation
    this.renderAlpha = 0;

    // Spawning logic
    this.lastSpawnTime = 0;
    this.nextSpawnInterval = GAME_CONFIG.spawnInterval;
    this.lastSpawnX = 640;
    this.patternCooldown = 0;

    // Visual animation states
    this.floorFlashAlpha = 0;
    this.vignetteRedFlash = 0;
    this.heartShakeTime = 0;
    this.scannerAngle = 0;

    // Arena geometry
    this.arena = { ...GAME_CONFIG.arena };

    // Offscreen cached layers
    this.offscreenVignette = null;
    this.offscreenArena = null;
    this.initOffscreenLayers();

    // Adaptive performance quality monitoring
    this.renderFps = 60;
    this.frameCount = 0;
    this.lastFpsUpdate = performance.now();
    this.frameTimeHistory = [];
    this.lowQualityMode = false;

    // Debug mode
    this.debugMode = GAME_CONFIG.debugDefault;

    // Track resize
    this.handleResize();
    window.addEventListener('resize', () => this.handleResize());
  }

  setDebugMode(enabled) {
    this.debugMode = !!enabled;
  }

  toggleDebugMode() {
    this.debugMode = !this.debugMode;
    return this.debugMode;
  }

  handleResize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);

    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    handTracker.updateViewport(this.canvas.width, this.canvas.height);
    this.initOffscreenLayers();
  }

  initOffscreenLayers() {
    // 1. Offscreen dark-blue vignette
    const w = GAME_CONFIG.logicalWidth;
    const h = GAME_CONFIG.logicalHeight;

    const vigCanvas = document.createElement('canvas');
    vigCanvas.width = w;
    vigCanvas.height = h;
    const vigCtx = vigCanvas.getContext('2d');

    const grad = vigCtx.createRadialGradient(w / 2, h / 2, h * 0.25, w / 2, h / 2, Math.max(w, h) * 0.72);
    grad.addColorStop(0, 'rgba(4, 8, 24, 0.45)');
    grad.addColorStop(0.65, 'rgba(3, 7, 20, 0.78)');
    grad.addColorStop(1, 'rgba(1, 3, 10, 0.95)');

    vigCtx.fillStyle = grad;
    vigCtx.fillRect(0, 0, w, h);
    this.offscreenVignette = vigCanvas;

    // 2. Offscreen Arena Floor Grid
    const arenaCanvas = document.createElement('canvas');
    arenaCanvas.width = w;
    arenaCanvas.height = h;
    const aCtx = arenaCanvas.getContext('2d');

    const cx = this.arena.centerX;
    const cy = this.arena.centerY;
    const rx = this.arena.radiusX;
    const ry = this.arena.radiusY;

    // Concentric polar rings
    const ringRatios = [0.35, 0.65, 0.85, 1.0];
    for (const ratio of ringRatios) {
      aCtx.strokeStyle = ratio === 1.0 ? 'rgba(0, 240, 255, 0.75)' : 'rgba(0, 240, 255, 0.22)';
      aCtx.lineWidth = ratio === 1.0 ? 3.5 : 1.5;
      aCtx.beginPath();
      aCtx.ellipse(cx, cy, rx * ratio, ry * ratio, 0, 0, Math.PI * 2);
      aCtx.stroke();
    }

    // Radial spokes
    const spokeCount = 16;
    aCtx.strokeStyle = 'rgba(0, 240, 255, 0.16)';
    aCtx.lineWidth = 1;
    for (let i = 0; i < spokeCount; i++) {
      const angle = (Math.PI * 2 * i) / spokeCount;
      const x1 = cx + Math.cos(angle) * rx * 0.35;
      const y1 = cy + Math.sin(angle) * ry * 0.35;
      const x2 = cx + Math.cos(angle) * rx;
      const y2 = cy + Math.sin(angle) * ry;
      aCtx.beginPath();
      aCtx.moveTo(x1, y1);
      aCtx.lineTo(x2, y2);
      aCtx.stroke();
    }

    // Outer rim tick marks
    const tickCount = 48;
    aCtx.strokeStyle = 'rgba(0, 240, 255, 0.65)';
    aCtx.lineWidth = 2;
    for (let i = 0; i < tickCount; i++) {
      const angle = (Math.PI * 2 * i) / tickCount;
      const isMajor = i % 4 === 0;
      const tickLen = isMajor ? 12 : 6;

      const outerX = cx + Math.cos(angle) * rx;
      const outerY = cy + Math.sin(angle) * ry;
      const innerX = cx + Math.cos(angle) * (rx - tickLen);
      const innerY = cy + Math.sin(angle) * (ry - (tickLen * (ry / rx)));

      aCtx.beginPath();
      aCtx.moveTo(innerX, innerY);
      aCtx.lineTo(outerX, outerY);
      aCtx.stroke();
    }

    this.offscreenArena = arenaCanvas;
  }

  start(mode = 'NORMAL', playerName = 'PLAYER') {
    this.mode = mode;
    this.playerName = playerName || 'PLAYER';
    this.score = 0;
    this.displayScore = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.comboScale = 1.0;
    this.lives = GAME_CONFIG.initialLives;
    this.timeRemaining = GAME_CONFIG.gameDuration;
    this.elapsedTime = 0;
    this.level = 1;
    this.caughtCount = 0;
    this.missedCount = 0;
    this.totalSpawned = 0;
    this.floorFlashAlpha = 0;
    this.vignetteRedFlash = 0;

    // Reset columns
    for (const col of this.columnsPool) {
      col.state = 'inactive';
    }

    this.particles.reset();
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.lastSpawnTime = performance.now() + 500; // brief breathing room
    this.nextSpawnInterval = GAME_CONFIG.spawnInterval;
    this.isRunning = true;
    this.isPaused = false;

    audio.startAmbience();
  }

  pause() {
    this.isPaused = true;
  }

  resume() {
    this.isPaused = false;
    this.lastTime = performance.now();
  }

  stop() {
    this.isRunning = false;
    this.isPaused = false;
    audio.stopAmbience();
  }

  /**
   * Difficulty curve: 0..1 smooth ramp over difficultyTimeConstant
   */
  getDifficulty() {
    return 1 - Math.exp(-this.elapsedTime / GAME_CONFIG.difficultyTimeConstant);
  }

  getComboMultiplier() {
    const step = GAME_CONFIG.comboStep;
    const inc = GAME_CONFIG.comboMultiplierIncrement;
    const mult = 1 + Math.floor(this.combo / step) * inc;
    return Math.min(GAME_CONFIG.comboCap, mult);
  }

  /**
   * Spawns falling columns according to difficulty and smart patterns
   */
  handleSpawning(now) {
    if (now - this.lastSpawnTime < this.nextSpawnInterval) return;

    const diff = this.getDifficulty();
    const activeCols = this.columnsPool.filter(c => c.state === 'falling');

    // Max simultaneous columns interpolates between initialMaxObjects and finalMaxObjects
    const maxSimultaneous = Math.floor(
      GAME_CONFIG.initialMaxObjects + diff * (GAME_CONFIG.finalMaxObjects - GAME_CONFIG.initialMaxObjects)
    );

    if (activeCols.length >= maxSimultaneous) return;

    // Column parameters based on difficulty
    const width = Math.round(GAME_CONFIG.initialObjectWidth - diff * (GAME_CONFIG.initialObjectWidth - GAME_CONFIG.minimumObjectWidth));
    const height = Math.round(GAME_CONFIG.initialObjectHeight - diff * (GAME_CONFIG.initialObjectHeight - GAME_CONFIG.minimumObjectHeight));
    const speed = GAME_CONFIG.initialObjectSpeed + diff * (GAME_CONFIG.maximumObjectSpeed - GAME_CONFIG.initialObjectSpeed);

    // Arena horizontal bounds
    const minX = this.arena.centerX - this.arena.radiusX * 0.78;
    const maxX = this.arena.centerX + this.arena.radiusX * 0.78;

    // Pattern selection
    const patternRoll = Math.random();
    let spawnCount = 1;
    let spawnXs = [];

    if (diff > 0.4 && patternRoll > 0.72 && activeCols.length + 2 <= maxSimultaneous) {
      // Pair spawn (wide spread)
      spawnCount = 2;
      const leftX = minX + Math.random() * ((this.arena.centerX - minX) * 0.7);
      const rightX = this.arena.centerX + 50 + Math.random() * ((maxX - (this.arena.centerX + 50)) * 0.7);
      spawnXs = [leftX, rightX];
    } else {
      // Single spawn with distance constraint relative to previous spawn (avoid impossible jumps)
      let candidateX = minX + Math.random() * (maxX - minX);
      const maxJump = 460;
      if (Math.abs(candidateX - this.lastSpawnX) > maxJump) {
        candidateX = this.lastSpawnX + (candidateX > this.lastSpawnX ? maxJump : -maxJump);
        candidateX = Math.max(minX, Math.min(maxX, candidateX));
      }
      spawnXs = [candidateX];
    }

    // Determine column type: normal, gold, heart, hazard
    for (const x of spawnXs) {
      // Rejection: ensure no existing falling column overlaps x at spawn top
      const overlaps = activeCols.some(c => c.y < height && Math.abs(c.x - x) < width * 1.3);
      if (overlaps) continue;

      let type = 'normal';
      const specialRoll = Math.random();

      if (specialRoll < GAME_CONFIG.specialChance.gold) {
        type = 'gold';
      } else if (this.lives < this.maxLives && specialRoll < GAME_CONFIG.specialChance.gold + GAME_CONFIG.specialChance.heart) {
        type = 'heart';
      } else if (GAME_CONFIG.enableHazards && Math.random() < GAME_CONFIG.hazardChance) {
        type = 'hazard';
      }

      // Find inactive column in pool
      const freeCol = this.columnsPool.find(c => c.state === 'inactive');
      if (freeCol) {
        freeCol.spawn(x, -height - 10, width, height, speed, type);
        this.totalSpawned++;
        this.lastSpawnX = x;
      }
    }

    this.lastSpawnTime = now;
    // Next interval interpolates from spawnInterval down to minimumSpawnInterval
    const baseInterval = GAME_CONFIG.spawnInterval - diff * (GAME_CONFIG.spawnInterval - GAME_CONFIG.minimumSpawnInterval);
    this.nextSpawnInterval = baseInterval * (0.85 + Math.random() * 0.3);
  }

  /**
   * Fixed-timestep update
   */
  update(dt) {
    if (!this.isRunning || this.isPaused) return;

    this.elapsedTime += dt;
    this.level = 1 + Math.floor(this.elapsedTime / 20);

    // 1. Timer countdown (NORMAL mode)
    if (this.mode === 'NORMAL') {
      this.timeRemaining -= dt;
      if (this.timeRemaining <= 0) {
        this.timeRemaining = 0;
        this.triggerGameOver('TIME UP');
        return;
      }
    }

    // 2. Score interpolation for smooth count-up
    if (this.displayScore < this.score) {
      this.displayScore = Math.min(this.score, Math.round(this.displayScore + (this.score - this.displayScore) * 0.2 + 1));
    }

    // 3. Combo pop scale decay
    if (this.comboScale > 1.0) {
      this.comboScale = Math.max(1.0, this.comboScale - dt * 3.5);
    }

    // 4. Visual flashes decay
    if (this.floorFlashAlpha > 0) {
      this.floorFlashAlpha = Math.max(0, this.floorFlashAlpha - dt * 3.0);
    }
    if (this.vignetteRedFlash > 0) {
      this.vignetteRedFlash = Math.max(0, this.vignetteRedFlash - dt * 2.5);
    }
    if (this.heartShakeTime > 0) {
      this.heartShakeTime = Math.max(0, this.heartShakeTime - dt);
    }

    // 5. Arena rotating scanner sweep
    this.scannerAngle = (this.scannerAngle + this.arena.sweepSpeed * dt) % (Math.PI * 2);

    // 6. Spawn falling columns
    this.handleSpawning(performance.now());

    // 7. Update active columns
    for (const col of this.columnsPool) {
      if (col.state === 'falling') {
        col.update(dt);

        // Check if column crossed arena floor without being caught
        if (col.y + col.height >= this.arena.floorY) {
          this.handleColumnMiss(col);
        }
      }
    }

    // 8. Hand Collision Detection
    this.processCollisions();

    // 9. Update particles, shockwaves, popups, and screen shake
    this.particles.update(dt);
  }

  processCollisions() {
    const trackedHands = handTracker.getTrackedHands();
    if (trackedHands.length === 0) return;

    for (const col of this.columnsPool) {
      if (col.state !== 'falling') continue;

      for (const hand of trackedHands) {
        const result = checkHandColumnCollision(hand, col);
        if (result.hit) {
          this.handleColumnCatch(col, hand, result.hitPoint);
          break; // One column claimed by only one hand
        }
      }
    }
  }

  handleColumnCatch(column, hand, hitPoint) {
    column.state = 'caught';
    column.caughtByHand = hand.trackId;
    this.caughtCount++;

    const hitX = hitPoint ? hitPoint.x : column.x;
    const hitY = hitPoint ? hitPoint.y : column.y + column.height * 0.7;

    if (column.type === 'hazard') {
      // Bad column: penalty
      this.combo = 0;
      this.lives = Math.max(0, this.lives - 1);
      audio.playMiss();
      this.particles.emitMiss(hitX, hitY);
      this.vignetteRedFlash = 0.8;
      this.floorFlashAlpha = 0.8;
      this.heartShakeTime = 0.4;
      this.particles.addPopup(hitX, hitY, 'HAZARD!', '-1 LIFE', '#ff2a2a', true);

      if (this.lives <= 0) {
        this.triggerGameOver('NO LIVES REMAINING');
      }
      return;
    }

    // Advance combo
    this.combo++;
    if (this.combo > this.maxCombo) {
      this.maxCombo = this.combo;
    }
    this.comboScale = 1.45;

    const mult = this.getComboMultiplier();
    const points = Math.round(GAME_CONFIG.baseScore * column.scoreMultiplier * mult);
    this.score += points;

    // Sound and particles
    if (column.type === 'gold') {
      audio.playGoldCatch();
      this.particles.emitCatch(hitX, hitY, '#ffd700', 36, hand.vx, hand.vy);
      this.particles.addPopup(hitX, hitY, `+${points}`, `GOLD x${mult}`, '#ffd700', true);
    } else if (column.type === 'heart') {
      this.lives = Math.min(this.maxLives, this.lives + 1);
      audio.playHeartCatch();
      this.particles.emitCatch(hitX, hitY, '#ff007f', 32, hand.vx, hand.vy);
      this.particles.addPopup(hitX, hitY, '+1 LIFE', `SCORE +${points}`, '#ff007f', true);
    } else {
      audio.playCatch(this.combo);
      this.particles.emitCatch(hitX, hitY, hand.color, 24, hand.vx, hand.vy);
      const sub = mult > 1 ? `x${mult} COMBO` : '';
      this.particles.addPopup(hitX, hitY, `+${points}`, sub, hand.color, mult >= 5);
    }

    // Combo milestones (5, 10, 15, 20...)
    if (this.combo >= 5 && this.combo % 5 === 0) {
      audio.playComboMilestone(this.combo);
      this.particles.emitComboMilestone(hitX, hitY, this.combo);
      this.particles.addPopup(this.arena.centerX, 200, `COMBO MILESTONE!`, `x${mult} MULTIPLIER`, '#00f0ff', true);
    }

    // Reset column after catch burst
    setTimeout(() => {
      column.state = 'inactive';
    }, 120);
  }

  handleColumnMiss(column) {
    column.state = 'missed';
    this.missedCount++;

    const floorX = column.x;
    const floorY = this.arena.floorY;

    // Reset combo on any miss
    this.combo = 0;
    this.comboScale = 1.0;

    // Normal and hazard columns lose life
    if (column.type === 'normal' || column.type === 'hazard') {
      this.lives = Math.max(0, this.lives - 1);
      audio.playMiss();
      this.particles.emitMiss(floorX, floorY);
      this.floorFlashAlpha = 1.0;
      this.vignetteRedFlash = 0.85;
      this.heartShakeTime = 0.5;

      if (this.lives <= 0) {
        this.triggerGameOver('NO LIVES REMAINING');
      }
    } else {
      // Gold and heart misses don't cost lives, but reset combo
      audio.playMiss();
      this.particles.emitMiss(floorX, floorY);
      this.floorFlashAlpha = 0.6;
    }

    setTimeout(() => {
      column.state = 'inactive';
    }, 150);
  }

  triggerGameOver(reason = 'GAME OVER') {
    if (!this.isRunning) return;
    this.isRunning = false;

    audio.stopAmbience(0.6);
    audio.playGameOver();

    const accuracy = this.totalSpawned > 0
      ? Math.round((this.caughtCount / this.totalSpawned) * 100)
      : 100;

    const stats = {
      score: this.score,
      maxCombo: this.maxCombo,
      caught: this.caughtCount,
      missed: this.missedCount,
      totalSpawned: this.totalSpawned,
      accuracy,
      mode: this.mode,
      playerName: this.playerName,
      reason
    };

    if (this.onGameOver) {
      this.onGameOver(stats);
    }
  }

  /**
   * Main game rendering pipeline
   */
  render() {
    const ctx = this.ctx;
    const cw = this.canvas.width;
    const ch = this.canvas.height;

    // Clear background
    ctx.fillStyle = '#030614';
    ctx.fillRect(0, 0, cw, ch);

    // 1. Draw Mirrored Webcam Video Feed
    if (handTracker.video && handTracker.video.readyState >= 2) {
      ctx.save();
      // Mirror horizontally
      ctx.translate(cw, 0);
      ctx.scale(-1, 1);

      const vw = handTracker.video.videoWidth;
      const vh = handTracker.video.videoHeight;
      const scale = handTracker.videoFitScale;
      const ox = handTracker.videoOffsetX;
      const oy = handTracker.videoOffsetY;

      ctx.drawImage(handTracker.video, ox, oy, vw * scale, vh * scale);
      ctx.restore();
    }

    // 2. Apply Camera Screen Shake + Game Coordinate Scaling
    ctx.save();
    const gameScale = handTracker.gameScale;
    const originX = handTracker.gameOriginX + this.particles.shakeOffsetX;
    const originY = handTracker.gameOriginY + this.particles.shakeOffsetY;

    ctx.translate(originX, originY);
    ctx.scale(gameScale, gameScale);

    // 3. Draw Darkened Vignette Overlay
    if (this.offscreenVignette) {
      ctx.drawImage(this.offscreenVignette, 0, 0);
    }

    // 4. Red Vignette Flash on Miss
    if (this.vignetteRedFlash > 0.01) {
      ctx.save();
      ctx.globalAlpha = this.vignetteRedFlash * 0.7;
      ctx.fillStyle = 'rgba(255, 20, 60, 0.4)';
      ctx.fillRect(0, 0, GAME_CONFIG.logicalWidth, GAME_CONFIG.logicalHeight);
      ctx.restore();
    }

    // 5. Draw Circular Arena
    this.renderArena(ctx);

    // 6. Draw Falling Columns
    this.renderColumns(ctx);

    // 7. Draw Hands (Palm, Skeleton, Collision Zones)
    this.renderHands(ctx);

    // 8. Draw Particles, Shockwaves, and Score Popups
    this.particles.render(ctx);

    // 9. Draw In-Game HUD (Canvas-rendered for zero DOM garbage)
    this.renderCanvasHUD(ctx);

    // 10. Debug Overlay
    if (this.debugMode) {
      this.renderDebugOverlay(ctx);
    }

    ctx.restore();

    // Measure FPS & Frame times for Adaptive Quality
    this.measurePerformance();
  }

  renderArena(ctx) {
    const cx = this.arena.centerX;
    const cy = this.arena.centerY;
    const rx = this.arena.radiusX;
    const ry = this.arena.radiusY;

    // Draw static pre-rendered arena
    if (this.offscreenArena) {
      ctx.drawImage(this.offscreenArena, 0, 0);
    }

    // Rotating Radar Scanner Sweep
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.clip();

    const sweepAngle = this.scannerAngle;
    const sweepLen = 0.55; // radians width
    const grad = ctx.createConicGradient(sweepAngle, cx, cy);
    grad.addColorStop(0, 'rgba(0, 240, 255, 0.22)');
    grad.addColorStop(sweepLen / (Math.PI * 2), 'rgba(0, 240, 255, 0.0)');
    grad.addColorStop(1, 'rgba(0, 240, 255, 0.0)');

    ctx.fillStyle = grad;
    ctx.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
    ctx.restore();

    // Floor Line (Miss threshold line)
    ctx.save();
    const floorY = this.arena.floorY;
    const floorHalfW = rx * 0.95;

    ctx.beginPath();
    ctx.moveTo(cx - floorHalfW, floorY);
    ctx.lineTo(cx + floorHalfW, floorY);

    if (this.floorFlashAlpha > 0.02) {
      ctx.strokeStyle = `rgba(255, 42, 95, ${this.floorFlashAlpha})`;
      ctx.lineWidth = 4.5;
      ctx.shadowColor = '#ff2a5f';
      ctx.shadowBlur = 14;
    } else {
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.35)';
      ctx.lineWidth = 2;
    }
    ctx.stroke();
    ctx.restore();
  }

  renderColumns(ctx) {
    for (const col of this.columnsPool) {
      if (col.state !== 'falling') continue;

      ctx.save();
      const halfW = col.width * 0.5;
      const left = col.x - halfW;
      const top = col.y;
      const radius = Math.min(10, col.width * 0.35);

      // 1. Motion Trail Ghost Segments (disabled in low quality mode)
      if (!this.lowQualityMode) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < col.trailMax; i++) {
          const t = col.trail[i];
          if (t.alpha > 0.03) {
            ctx.globalAlpha = t.alpha * 0.45;
            ctx.fillStyle = col.color;
            this.drawRoundedRect(ctx, t.x - halfW * 0.9, t.y, col.width * 0.9, col.height * 0.9, radius);
            ctx.fill();
          }
        }
        ctx.restore();
      }

      // 2. Outer Glow Sprite (fast pre-rendered texture)
      const glowSprite = getGlowSprite(col.color, 48);
      if (glowSprite) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.55;
        ctx.drawImage(glowSprite, col.x - 48, top + col.height * 0.5 - 48, 96, 96);
        ctx.restore();
      }

      // 3. Column Body with Vertical Gradient
      const grad = ctx.createLinearGradient(left, top, left, top + col.height);
      if (col.type === 'gold') {
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.2, '#ffe066');
        grad.addColorStop(0.7, '#d4af37');
        grad.addColorStop(1, '#8b6508');
      } else if (col.type === 'heart') {
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.25, '#ff4d94');
        grad.addColorStop(0.7, '#cc0052');
        grad.addColorStop(1, '#800033');
      } else if (col.type === 'hazard') {
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.3, '#ff3333');
        grad.addColorStop(0.8, '#990000');
        grad.addColorStop(1, '#4d0000');
      } else {
        // Neon Cyan Core to Deep Blue
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.2, '#00f0ff');
        grad.addColorStop(0.65, '#0055ff');
        grad.addColorStop(1, '#001a66');
      }

      ctx.fillStyle = grad;
      this.drawRoundedRect(ctx, left, top, col.width, col.height, radius);
      ctx.fill();

      // 4. Inner Bright Highlight Stripe
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.fillRect(col.x - 2, top + 8, 4, col.height - 16);

      // 5. Special Type Emblems
      if (col.type === 'heart') {
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 20px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('♥', col.x, top + col.height * 0.5);
      } else if (col.type === 'gold') {
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 16px "Orbitron", system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('3X', col.x, top + col.height * 0.5);
      }

      ctx.restore();
    }
  }

  drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  renderHands(ctx) {
    const trackedHands = handTracker.getTrackedHands();

    for (const hand of trackedHands) {
      if (hand.opacity <= 0.01) continue;

      ctx.save();
      ctx.globalAlpha = hand.opacity;

      // 1. Palm Center Radial Glow
      const glowSprite = getGlowSprite(hand.color, 48);
      if (glowSprite) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = hand.opacity * 0.6;
        ctx.drawImage(glowSprite, hand.palm.x - 48, hand.palm.y - 48, 96, 96);
        ctx.restore();
      }

      // 2. Collision Palm Ring
      ctx.beginPath();
      ctx.arc(hand.palm.x, hand.palm.y, hand.palm.radius, 0, Math.PI * 2);
      ctx.strokeStyle = hand.color;
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.fillStyle = hand.colorGlow;
      ctx.beginPath();
      ctx.arc(hand.palm.x, hand.palm.y, hand.palm.radius * 0.35, 0, Math.PI * 2);
      ctx.fill();

      // 3. Fingertip Circles & Skeletal Lines
      if (hand.fingertips && hand.fingertips.length > 0) {
        for (const tip of hand.fingertips) {
          // Skeletal line from palm to tip
          ctx.beginPath();
          ctx.moveTo(hand.palm.x, hand.palm.y);
          ctx.lineTo(tip.x, tip.y);
          ctx.strokeStyle = hand.color;
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Fingertip collision circle
          ctx.beginPath();
          ctx.arc(tip.x, tip.y, tip.radius, 0, Math.PI * 2);
          ctx.strokeStyle = hand.color;
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(tip.x, tip.y, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Ghost Hand Label
      if (hand.isGhost) {
        ctx.font = '600 12px "Orbitron", system-ui';
        ctx.fillStyle = hand.color;
        ctx.textAlign = 'center';
        ctx.fillText('REACQUIRING...', hand.palm.x, hand.palm.y - hand.palm.radius - 12);
      }

      ctx.restore();
    }
  }

  renderCanvasHUD(ctx) {
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 8;

    // Top-Left: SCORE & COMBO
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    ctx.font = '700 13px "Orbitron", system-ui';
    ctx.fillStyle = 'rgba(0, 240, 255, 0.7)';
    ctx.fillText('SCORE', 40, 24);

    ctx.font = '900 34px "Orbitron", system-ui';
    ctx.fillStyle = '#ffffff';
    const scoreStr = this.displayScore.toString().padStart(5, '0');
    ctx.fillText(scoreStr, 40, 42);

    // Combo Pill with Pop Scale & Color Ramp
    if (this.combo > 1) {
      ctx.save();
      ctx.translate(40, 90);
      ctx.scale(this.comboScale, this.comboScale);

      // Color ramp based on combo tier
      let comboColor = '#00f0ff';
      if (this.combo >= 15) comboColor = '#ffd700'; // Gold tier
      else if (this.combo >= 10) comboColor = '#ff00b7'; // Magenta tier
      else if (this.combo >= 5) comboColor = '#00ff88'; // Emerald tier

      ctx.font = '900 20px "Orbitron", system-ui';
      ctx.fillStyle = comboColor;
      ctx.fillText(`COMBO x${this.getComboMultiplier()}`, 0, 0);

      ctx.font = '600 12px system-ui';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.fillText(`STREAK: ${this.combo}`, 0, 24);
      ctx.restore();
    }

    // Top-Center: TIME or LEVEL
    ctx.textAlign = 'center';
    if (this.mode === 'NORMAL') {
      const secondsLeft = Math.ceil(this.timeRemaining);
      const isCritical = secondsLeft <= 10;

      ctx.font = '700 13px "Orbitron", system-ui';
      ctx.fillStyle = isCritical ? '#ff2a5f' : 'rgba(0, 240, 255, 0.7)';
      ctx.fillText('TIME REMAINING', GAME_CONFIG.logicalWidth / 2, 24);

      ctx.font = '900 38px "Orbitron", system-ui';
      ctx.fillStyle = isCritical ? (Math.sin(performance.now() * 0.015) > 0 ? '#ff2a5f' : '#ffffff') : '#ffffff';
      ctx.fillText(`${secondsLeft}s`, GAME_CONFIG.logicalWidth / 2, 42);
    } else {
      // ENDLESS mode: elapsed time and current level
      const mins = Math.floor(this.elapsedTime / 60).toString().padStart(2, '0');
      const secs = Math.floor(this.elapsedTime % 60).toString().padStart(2, '0');

      ctx.font = '700 13px "Orbitron", system-ui';
      ctx.fillStyle = 'rgba(0, 240, 255, 0.7)';
      ctx.fillText(`LEVEL ${this.level} • ENDLESS`, GAME_CONFIG.logicalWidth / 2, 24);

      ctx.font = '900 34px "Orbitron", system-ui';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`${mins}:${secs}`, GAME_CONFIG.logicalWidth / 2, 42);
    }

    // Top-Right: LIVES (Animated hearts)
    ctx.textAlign = 'right';
    ctx.font = '700 13px "Orbitron", system-ui';
    ctx.fillStyle = 'rgba(0, 240, 255, 0.7)';
    ctx.fillText('LIVES', GAME_CONFIG.logicalWidth - 40, 24);

    const heartShakeOffset = this.heartShakeTime > 0 ? (Math.random() - 0.5) * 8 : 0;
    ctx.font = '800 28px system-ui';
    for (let i = 0; i < this.maxLives; i++) {
      const heartX = GAME_CONFIG.logicalWidth - 40 - (this.maxLives - 1 - i) * 34 + heartShakeOffset;
      const isAlive = i < this.lives;
      ctx.fillStyle = isAlive ? '#ff2a5f' : 'rgba(255, 255, 255, 0.2)';
      ctx.fillText(isAlive ? '♥' : '♡', heartX, 44);
    }

    ctx.restore();
  }

  renderDebugOverlay(ctx) {
    ctx.save();
    const hands = handTracker.getTrackedHands();

    // 1. Draw MediaPipe 21 Landmarks & Skeleton Connections
    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
      [0, 5], [5, 6], [6, 7], [7, 8],       // Index
      [5, 9], [9, 10], [10, 11], [11, 12],  // Middle
      [9, 13], [13, 14], [14, 15], [15, 16],// Ring
      [13, 17], [17, 18], [18, 19], [19, 20],// Pinky
      [0, 17]                               // Palm base
    ];

    for (const hand of hands) {
      if (!hand.landmarks || hand.landmarks.length < 21) continue;

      ctx.strokeStyle = hand.color;
      ctx.lineWidth = 2;
      for (const [p1, p2] of connections) {
        ctx.beginPath();
        ctx.moveTo(hand.landmarks[p1].x, hand.landmarks[p1].y);
        ctx.lineTo(hand.landmarks[p2].x, hand.landmarks[p2].y);
        ctx.stroke();
      }

      ctx.fillStyle = '#ffffff';
      hand.landmarks.forEach((lm, idx) => {
        ctx.beginPath();
        ctx.arc(lm.x, lm.y, idx % 4 === 0 ? 4 : 2.5, 0, Math.PI * 2);
        ctx.fill();
      });

      // Track info banner
      ctx.font = '600 13px "Courier New", monospace';
      ctx.fillStyle = hand.color;
      ctx.textAlign = 'center';
      ctx.fillText(
        `[Track ${hand.trackId}] ${hand.handedness} (Scale: ${Math.round(hand.scale)})`,
        hand.palm.x,
        hand.palm.y + hand.palm.radius + 20
      );
    }

    // 2. Debug Metrics Panel (Top-right below hearts)
    const px = GAME_CONFIG.logicalWidth - 280;
    const py = 95;
    ctx.fillStyle = 'rgba(5, 10, 25, 0.85)';
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.fillRect(px, py, 240, 170);
    ctx.strokeRect(px, py, 240, 170);

    ctx.font = '600 11px "Courier New", monospace';
    ctx.fillStyle = '#00f0ff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const activeCols = this.columnsPool.filter(c => c.state === 'falling').length;
    const particlesCount = this.particles.getActiveParticleCount();
    const vw = handTracker.video ? handTracker.video.videoWidth : 0;
    const vh = handTracker.video ? handTracker.video.videoHeight : 0;

    const lines = [
      `DEBUG MONITOR [D to toggle]`,
      `Render FPS:     ${this.renderFps}`,
      `Tracking FPS:   ${handTracker.trackingFps}`,
      `Inference:      ${handTracker.inferenceMs} ms`,
      `Delegate:       ${handTracker.activeDelegate}`,
      `Hands Detected: ${hands.length}`,
      `Active Columns: ${activeCols}`,
      `Particles:      ${particlesCount}`,
      `Video Res:      ${vw}x${vh}`,
      `Adaptive Qual:  ${this.lowQualityMode ? 'LOW' : 'HIGH'}`
    ];

    lines.forEach((line, i) => {
      ctx.fillText(line, px + 10, py + 10 + i * 15);
    });

    ctx.restore();
  }

  measurePerformance() {
    this.frameCount++;
    const now = performance.now();
    const delta = now - this.lastFpsUpdate;

    if (delta >= 1000) {
      this.renderFps = Math.round((this.frameCount * 1000) / delta);
      this.frameCount = 0;
      this.lastFpsUpdate = now;

      // Adaptive quality adjustment: if FPS drops below 40 for sustained periods
      if (this.renderFps < 42 && !this.lowQualityMode) {
        this.lowQualityMode = true;
      } else if (this.renderFps >= 55 && this.lowQualityMode) {
        this.lowQualityMode = false;
      }
    }
  }

  /**
   * Main animation frame loop
   */
  loop(timestamp) {
    if (!this.isRunning) return;

    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.1); // clamp at 100ms
    this.lastTime = timestamp;

    if (!this.isPaused) {
      this.accumulator += dt;
      while (this.accumulator >= this.fixedStep) {
        this.update(this.fixedStep);
        this.accumulator -= this.fixedStep;
      }
      this.renderAlpha = this.accumulator / this.fixedStep;
    }

    this.render();
  }
}
