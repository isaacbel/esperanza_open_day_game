/**
 * ArenaRenderer.ts - Futuristic Circular Perspective Arena, Moving Grid & Cyber Visuals
 * Pre-renders static geometry and radial grids to offscreen canvases for maximum frame rate.
 * Supports serene Zen mode aesthetic and dramatic cinematic Boss Pre-Warning overlay.
 */
import { GAME_CONFIG } from './GameConfig';

interface AmbientParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  pulsePhase: number;
  pulseSpeed: number;
}

export class ArenaRenderer {
  private offscreenVignette: HTMLCanvasElement | null = null;
  private offscreenArena: HTMLCanvasElement | null = null;
  public scannerAngle: number = 0;
  public floorFlashAlpha: number = 0;
  public vignetteRedFlash: number = 0;
  public isZenMode: boolean = false;
  private ambientParticles: AmbientParticle[] = [];
  private gridOffset: number = 0;

  constructor() {
    this.initAmbientParticles();
  }

  public initOffscreenLayers(): void {
    if (typeof document === 'undefined') return;
    const w = GAME_CONFIG.logicalWidth;
    const h = GAME_CONFIG.logicalHeight;

    // 1. Pre-rendered Cyber Vignette & Depth Tint
    const vigCanvas = document.createElement('canvas');
    vigCanvas.width = w;
    vigCanvas.height = h;
    const vCtx = vigCanvas.getContext('2d');
    if (vCtx) {
      vCtx.fillStyle = 'rgba(2, 6, 18, 0.40)';
      vCtx.fillRect(0, 0, w, h);

      const grad = vCtx.createRadialGradient(w / 2, h / 2, h * 0.28, w / 2, h / 2, Math.max(w, h) * 0.75);
      grad.addColorStop(0, 'rgba(0, 20, 45, 0.05)');
      grad.addColorStop(0.55, 'rgba(2, 8, 26, 0.55)');
      grad.addColorStop(1, 'rgba(1, 3, 12, 0.96)');
      vCtx.fillStyle = grad;
      vCtx.fillRect(0, 0, w, h);
      this.offscreenVignette = vigCanvas;
    }

    // 2. Pre-rendered Arena Geometry (Elliptical perspective floor & spokes)
    const aCanvas = document.createElement('canvas');
    aCanvas.width = w;
    aCanvas.height = h;
    const aCtx = aCanvas.getContext('2d');
    if (aCtx) {
      const cx = GAME_CONFIG.arena.centerX;
      const cy = GAME_CONFIG.arena.centerY;
      const rx = GAME_CONFIG.arena.radiusX;
      const ry = GAME_CONFIG.arena.radiusY;

      // Concentric rings
      const rings = [0.35, 0.65, 0.85, 1.0];
      for (const ratio of rings) {
        aCtx.strokeStyle = ratio === 1.0 ? 'rgba(0, 240, 255, 0.85)' : 'rgba(0, 240, 255, 0.22)';
        aCtx.lineWidth = ratio === 1.0 ? 3.5 : 1.5;
        aCtx.beginPath();
        aCtx.ellipse(cx, cy, rx * ratio, ry * ratio, 0, 0, Math.PI * 2);
        aCtx.stroke();
      }

      // Radial spokes
      const spokes = 16;
      aCtx.strokeStyle = 'rgba(0, 240, 255, 0.16)';
      aCtx.lineWidth = 1;
      for (let i = 0; i < spokes; i++) {
        const angle = (Math.PI * 2 * i) / spokes;
        aCtx.beginPath();
        aCtx.moveTo(cx + Math.cos(angle) * rx * 0.35, cy + Math.sin(angle) * ry * 0.35);
        aCtx.lineTo(cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry);
        aCtx.stroke();
      }

      // Outer rim ticks
      const ticks = 48;
      aCtx.strokeStyle = 'rgba(0, 240, 255, 0.65)';
      aCtx.lineWidth = 2;
      for (let i = 0; i < ticks; i++) {
        const angle = (Math.PI * 2 * i) / ticks;
        const tickLen = i % 4 === 0 ? 12 : 6;
        aCtx.beginPath();
        aCtx.moveTo(cx + Math.cos(angle) * (rx - tickLen), cy + Math.sin(angle) * (ry - (tickLen * (ry / rx))));
        aCtx.lineTo(cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry);
        aCtx.stroke();
      }
      this.offscreenArena = aCanvas;
    }
  }

  private initAmbientParticles(): void {
    this.ambientParticles = [];
    for (let i = 0; i < 40; i++) {
      this.ambientParticles.push({
        x: Math.random() * GAME_CONFIG.logicalWidth,
        y: Math.random() * GAME_CONFIG.logicalHeight,
        vx: (Math.random() - 0.5) * 16,
        vy: -15 - Math.random() * 25,
        size: 1 + Math.random() * 2.2,
        alpha: 0.15 + Math.random() * 0.35,
        pulseSpeed: 1 + Math.random() * 2,
        pulsePhase: Math.random() * Math.PI * 2
      });
    }
  }

  public update(dt: number): void {
    this.scannerAngle = (this.scannerAngle + GAME_CONFIG.arena.sweepSpeed * dt) % (Math.PI * 2);
    this.gridOffset = (this.gridOffset + dt * 45) % 40;

    if (this.floorFlashAlpha > 0) {
      this.floorFlashAlpha = Math.max(0, this.floorFlashAlpha - dt * 3.0);
    }
    if (this.vignetteRedFlash > 0) {
      this.vignetteRedFlash = Math.max(0, this.vignetteRedFlash - dt * 2.5);
    }

    for (const p of this.ambientParticles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.pulsePhase += p.pulseSpeed * dt;
      if (p.y < -10) {
        p.y = GAME_CONFIG.logicalHeight + 10;
        p.x = Math.random() * GAME_CONFIG.logicalWidth;
      }
      if (p.x < -10) p.x = GAME_CONFIG.logicalWidth + 10;
      if (p.x > GAME_CONFIG.logicalWidth + 10) p.x = -10;
    }
  }

  public renderBackground(ctx: CanvasRenderingContext2D): void {
    if (this.offscreenVignette) {
      ctx.drawImage(this.offscreenVignette, 0, 0);
    }

    // Serene Zen mode soft emerald aura overlay
    if (this.isZenMode) {
      ctx.save();
      const w = GAME_CONFIG.logicalWidth;
      const h = GAME_CONFIG.logicalHeight;
      const zenGrad = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, w * 0.7);
      zenGrad.addColorStop(0, 'rgba(0, 255, 153, 0.03)');
      zenGrad.addColorStop(1, 'rgba(2, 28, 20, 0.45)');
      ctx.fillStyle = zenGrad;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
      return;
    }

    if (this.vignetteRedFlash > 0.01) {
      ctx.save();
      ctx.globalAlpha = this.vignetteRedFlash * 0.7;
      ctx.fillStyle = 'rgba(255, 20, 60, 0.4)';
      ctx.fillRect(0, 0, GAME_CONFIG.logicalWidth, GAME_CONFIG.logicalHeight);
      ctx.restore();
    }
  }

  public renderArena(ctx: CanvasRenderingContext2D): void {
    const cx = GAME_CONFIG.arena.centerX;
    const cy = GAME_CONFIG.arena.centerY;
    const rx = GAME_CONFIG.arena.radiusX;
    const ry = GAME_CONFIG.arena.radiusY;
    const themeColor = this.isZenMode ? 'rgba(0, 255, 153, 0.12)' : 'rgba(0, 240, 255, 0.09)';

    // 1. Moving 3D Perspective Grid Lines
    ctx.save();
    ctx.strokeStyle = themeColor;
    ctx.lineWidth = 1;
    for (let x = 180; x <= 1100; x += 90) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(cx + (x - cx) * 1.25, GAME_CONFIG.arena.floorY);
      ctx.stroke();
    }
    ctx.restore();

    // 2. Offscreen Arena Geometry
    if (this.offscreenArena) {
      ctx.drawImage(this.offscreenArena, 0, 0);
    }

    // 3. Rotating Radar Scanner Sweep
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.clip();

    const grad = ctx.createConicGradient(this.scannerAngle, cx, cy);
    if (this.isZenMode) {
      grad.addColorStop(0, 'rgba(0, 255, 153, 0.22)');
      grad.addColorStop(0.55 / (Math.PI * 2), 'rgba(0, 255, 153, 0.0)');
      grad.addColorStop(1, 'rgba(0, 255, 153, 0.0)');
    } else {
      grad.addColorStop(0, 'rgba(0, 240, 255, 0.22)');
      grad.addColorStop(0.55 / (Math.PI * 2), 'rgba(0, 240, 255, 0.0)');
      grad.addColorStop(1, 'rgba(0, 240, 255, 0.0)');
    }

    ctx.fillStyle = grad;
    ctx.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
    ctx.restore();

    // 4. Ambient floating dust particles
    ctx.save();
    for (const d of this.ambientParticles) {
      const a = d.alpha * (0.6 + 0.4 * Math.sin(d.pulsePhase));
      ctx.fillStyle = this.isZenMode ? `rgba(0, 255, 153, ${a.toFixed(3)})` : `rgba(0, 240, 255, ${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 5. Floor Line (Miss threshold line)
    ctx.save();
    const floorY = GAME_CONFIG.arena.floorY;
    const halfW = rx * 0.95;
    ctx.beginPath();
    ctx.moveTo(cx - halfW, floorY);
    ctx.lineTo(cx + halfW, floorY);

    if (this.floorFlashAlpha > 0.02) {
      if (this.isZenMode) {
        ctx.strokeStyle = `rgba(0, 255, 153, ${this.floorFlashAlpha * 0.7})`;
        ctx.lineWidth = 3.5;
        ctx.shadowColor = '#00ff99';
        ctx.shadowBlur = 10;
      } else {
        ctx.strokeStyle = `rgba(255, 42, 95, ${this.floorFlashAlpha})`;
        ctx.lineWidth = 4.5;
        ctx.shadowColor = '#ff2a5f';
        ctx.shadowBlur = 14;
      }
    } else {
      ctx.strokeStyle = this.isZenMode ? 'rgba(0, 255, 153, 0.35)' : 'rgba(0, 240, 255, 0.35)';
      ctx.lineWidth = 2;
    }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Dramatic 2-Second Boss & Challenge Pre-Warning Overlay (W-005)
   */
  public renderBossWarningOverlay(
    ctx: CanvasRenderingContext2D,
    title: string,
    subtitle: string,
    color: string = '#ff0055',
    remainingMs: number = 2000
  ): void {
    const w = GAME_CONFIG.logicalWidth;
    const pulse = 1.0 + Math.sin(performance.now() * 0.018) * 0.08;
    const bannerY = 240;
    const bannerHeight = 90;

    ctx.save();
    // Backdrop bar
    ctx.fillStyle = 'rgba(5, 5, 16, 0.88)';
    ctx.fillRect(0, bannerY - bannerHeight / 2, w, bannerHeight);

    // Hazard top & bottom glowing accent lines
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;

    ctx.beginPath();
    ctx.moveTo(0, bannerY - bannerHeight / 2);
    ctx.lineTo(w, bannerY - bannerHeight / 2);
    ctx.moveTo(0, bannerY + bannerHeight / 2);
    ctx.lineTo(w, bannerY + bannerHeight / 2);
    ctx.stroke();

    // Animated diagonal warning chevrons
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, bannerY - bannerHeight / 2, w, bannerHeight);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 8;
    const offset = (performance.now() * 0.08) % 40;
    for (let x = -40 + offset; x < w + 40; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, bannerY - bannerHeight / 2);
      ctx.lineTo(x + 30, bannerY + bannerHeight / 2);
      ctx.stroke();
    }
    ctx.restore();

    // Pulsing Text & Subtitle
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.save();
    ctx.translate(w / 2, bannerY - 12);
    ctx.scale(pulse, pulse);
    ctx.font = '900 24px "Orbitron", system-ui';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    ctx.fillText(`⚠️ ${title.toUpperCase()} ⚠️`, 0, 0);
    ctx.restore();

    ctx.font = '700 13px "Orbitron", system-ui';
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    const countdownSec = (Math.max(0, remainingMs) / 1000).toFixed(1);
    ctx.fillText(`${subtitle.toUpperCase()} — INCOMING IN ${countdownSec}s`, w / 2, bannerY + 22);

    ctx.restore();
  }
}
