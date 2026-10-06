/**
 * ParticleSystem.ts - Pooled Particles, Shockwaves, Floating Popups, and Screen Shake
 */
import { GAME_CONFIG } from './GameConfig';

const glowCache = new Map<string, HTMLCanvasElement>();

export function getGlowSprite(color: string, radius: number = 32): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const key = `${color}_${radius}`;
  if (!glowCache.has(key)) {
    const canvas = document.createElement('canvas');
    canvas.width = radius * 2;
    canvas.height = radius * 2;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
      grad.addColorStop(0, color);
      grad.addColorStop(0.4, color.replace(/[\d.]+\)$/g, '0.45)'));
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(radius, radius, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    glowCache.set(key, canvas);
  }
  return glowCache.get(key) || null;
}

class Particle {
  public active: boolean = false;
  public x: number = 0;
  public y: number = 0;
  public vx: number = 0;
  public vy: number = 0;
  public size: number = 2;
  public initialSize: number = 2;
  public color: string = '#00f0ff';
  public alpha: number = 1;
  public life: number = 0;
  public maxLife: number = 1;
  public friction: number = 0.94;
  public gravity: number = 40;

  public spawn(
    x: number, y: number, vx: number, vy: number,
    size: number, color: string, maxLife: number,
    friction: number = 0.93, gravity: number = 60
  ): void {
    this.active = true;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.initialSize = size;
    this.size = size;
    this.color = color;
    this.alpha = 1;
    this.life = 0;
    this.maxLife = Math.max(0.1, maxLife);
    this.friction = friction;
    this.gravity = gravity;
  }

  public update(dt: number): void {
    if (!this.active) return;
    this.life += dt;
    if (this.life >= this.maxLife) {
      this.active = false;
      return;
    }
    const progress = this.life / this.maxLife;
    this.alpha = 1 - progress;
    this.size = this.initialSize * (1 - progress * 0.7);

    this.vx *= Math.pow(this.friction, dt * 60);
    this.vy *= Math.pow(this.friction, dt * 60);
    this.vy += this.gravity * dt;

    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }
}

class Shockwave {
  public active: boolean = false;
  public x: number = 0;
  public y: number = 0;
  public radius: number = 0;
  public maxRadius: number = 120;
  public color: string = '#00f0ff';
  public lineWidth: number = 4;
  public alpha: number = 1;
  public speed: number = 360;

  public spawn(x: number, y: number, color: string = '#00f0ff', maxRadius: number = 130, speed: number = 380): void {
    this.active = true;
    this.x = x;
    this.y = y;
    this.radius = 10;
    this.maxRadius = maxRadius;
    this.color = color;
    this.alpha = 1;
    this.lineWidth = 5;
    this.speed = speed;
  }

  public update(dt: number): void {
    if (!this.active) return;
    this.radius += this.speed * dt;
    const progress = this.radius / this.maxRadius;
    if (progress >= 1) {
      this.active = false;
      return;
    }
    this.alpha = 1 - progress;
    this.lineWidth = Math.max(1, 5 * (1 - progress * 0.8));
  }
}

class ScorePopup {
  public active: boolean = false;
  public x: number = 0;
  public y: number = 0;
  public vy: number = -60;
  public text: string = '';
  public subtext: string = '';
  public color: string = '#00f0ff';
  public alpha: number = 1;
  public scale: number = 1;
  public life: number = 0;
  public maxLife: number = 0.85;
  public isBig: boolean = false;

  public spawn(x: number, y: number, text: string, subtext: string = '', color: string = '#00f0ff', isBig: boolean = false): void {
    this.active = true;
    this.x = x;
    this.y = y;
    this.vy = isBig ? -90 : -65;
    this.text = text;
    this.subtext = subtext;
    this.color = color;
    this.alpha = 1;
    this.scale = isBig ? 1.4 : 1.0;
    this.life = 0;
    this.maxLife = isBig ? 1.1 : 0.8;
    this.isBig = isBig;
  }

  public update(dt: number): void {
    if (!this.active) return;
    this.life += dt;
    if (this.life >= this.maxLife) {
      this.active = false;
      return;
    }
    const progress = this.life / this.maxLife;
    if (progress < 0.15) {
      this.scale = (this.isBig ? 1.4 : 1.0) * (0.8 + 0.4 * (progress / 0.15));
    } else {
      this.scale = (this.isBig ? 1.4 : 1.0);
    }
    this.alpha = Math.max(0, 1 - Math.pow(progress, 1.8));
    this.y += this.vy * dt;
    this.vy *= 0.95;
  }
}

export class ParticleSystem {
  private particles: Particle[] = Array.from({ length: GAME_CONFIG.maxParticles }, () => new Particle());
  private shockwaves: Shockwave[] = Array.from({ length: 30 }, () => new Shockwave());
  private popups: ScorePopup[] = Array.from({ length: 40 }, () => new ScorePopup());

  private shakeTrauma: number = 0;
  private shakeDuration: number = 0;
  private shakeElapsed: number = 0;
  public shakeOffsetX: number = 0;
  public shakeOffsetY: number = 0;

  public reset(): void {
    for (const p of this.particles) p.active = false;
    for (const s of this.shockwaves) s.active = false;
    for (const pop of this.popups) pop.active = false;
    this.shakeTrauma = 0;
    this.shakeOffsetX = 0;
    this.shakeOffsetY = 0;
  }

  public triggerShake(trauma: number = 0.5, durationMs: number = 220): void {
    if (!GAME_CONFIG.screenShake) return;
    this.shakeTrauma = Math.min(1.0, this.shakeTrauma + trauma);
    this.shakeDuration = durationMs / 1000;
    this.shakeElapsed = 0;
  }

  public emitCatch(x: number, y: number, color: string, count: number = 24, handVx: number = 0, handVy: number = 0): void {
    let spawned = 0;
    const speedBoost = Math.hypot(handVx, handVy) * 0.15;

    for (const p of this.particles) {
      if (!p.active) {
        const angle = (Math.PI * 2 * (spawned / count)) + (Math.random() - 0.5) * 0.6;
        const speed = 120 + Math.random() * 220 + speedBoost;
        p.spawn(
          x, y,
          Math.cos(angle) * speed + handVx * 0.25,
          Math.sin(angle) * speed + handVy * 0.25,
          2.5 + Math.random() * 3.5,
          color,
          0.45 + Math.random() * 0.4,
          0.92,
          110
        );
        spawned++;
        if (spawned >= count) break;
      }
    }
    this.emitShockwave(x, y, color, 120, 360);
  }

  public emitShockwave(x: number, y: number, color: string = '#00f0ff', maxRadius: number = 130, speed: number = 380): void {
    for (const s of this.shockwaves) {
      if (!s.active) {
        s.spawn(x, y, color, maxRadius, speed);
        break;
      }
    }
  }

  public emitComboMilestone(x: number, y: number, combo: number): void {
    const colors = ['#00f0ff', '#ffd700', '#ff00b7', '#00ffaa'];
    const color = colors[Math.floor(combo / 5) % colors.length];

    let spawned = 0;
    for (const p of this.particles) {
      if (!p.active) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 160 + Math.random() * 280;
        p.spawn(
          x, y,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          3.5 + Math.random() * 4,
          color,
          0.7 + Math.random() * 0.5,
          0.93,
          50
        );
        spawned++;
        if (spawned >= 40) break;
      }
    }
    this.emitShockwave(x, y, color, 220, 480);
    this.triggerShake(0.45, 240);
  }

  public emitMiss(x: number, y: number): void {
    let spawned = 0;
    const color = '#ff2a5f';
    for (const p of this.particles) {
      if (!p.active) {
        const angle = Math.PI + (Math.random() - 0.5) * Math.PI;
        const speed = 100 + Math.random() * 240;
        p.spawn(
          x + (Math.random() - 0.5) * 30, y,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          3 + Math.random() * 3,
          color,
          0.5 + Math.random() * 0.35,
          0.90,
          180
        );
        spawned++;
        if (spawned >= 20) break;
      }
    }
    this.emitShockwave(x, y, color, 90, 320);
    this.triggerShake(0.65, 300);
  }

  public addPopup(x: number, y: number, text: string, subtext: string = '', color: string = '#00f0ff', isBig: boolean = false): void {
    for (const pop of this.popups) {
      if (!pop.active) {
        pop.spawn(x, y, text, subtext, color, isBig);
        break;
      }
    }
  }

  public update(dt: number): void {
    for (const p of this.particles) {
      if (p.active) p.update(dt);
    }
    for (const s of this.shockwaves) {
      if (s.active) s.update(dt);
    }
    for (const pop of this.popups) {
      if (pop.active) pop.update(dt);
    }

    if (this.shakeTrauma > 0 && GAME_CONFIG.screenShake) {
      this.shakeElapsed += dt;
      const progress = this.shakeElapsed / Math.max(0.01, this.shakeDuration);
      if (progress >= 1) {
        this.shakeTrauma = 0;
        this.shakeOffsetX = 0;
        this.shakeOffsetY = 0;
      } else {
        const current = this.shakeTrauma * (1 - progress);
        const intensity = current * current * GAME_CONFIG.screenShakeMaxOffset;
        this.shakeOffsetX = (Math.random() * 2 - 1) * intensity;
        this.shakeOffsetY = (Math.random() * 2 - 1) * intensity;
      }
    } else {
      this.shakeOffsetX = 0;
      this.shakeOffsetY = 0;
    }
  }

  public render(ctx: CanvasRenderingContext2D, lowQuality: boolean = false): void {
    // 1. Shockwaves
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const s of this.shockwaves) {
      if (s.active && s.alpha > 0.01) {
        ctx.strokeStyle = s.color;
        ctx.globalAlpha = s.alpha;
        ctx.lineWidth = s.lineWidth;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();

    // 2. Particles (draw half if in low quality)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    let count = 0;
    for (const p of this.particles) {
      if (p.active && p.alpha > 0.01) {
        count++;
        if (lowQuality && count % 2 === 0) continue;
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // 3. Floating Score Popups
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const pop of this.popups) {
      if (pop.active && pop.alpha > 0.01) {
        ctx.globalAlpha = pop.alpha;
        ctx.save();
        ctx.translate(pop.x, pop.y);
        ctx.scale(pop.scale, pop.scale);

        ctx.shadowColor = 'rgba(0,0,0,0.85)';
        ctx.shadowBlur = 8;
        ctx.font = pop.isBig
          ? '900 28px "Orbitron", system-ui, sans-serif'
          : '800 20px "Orbitron", system-ui, sans-serif';
        ctx.fillStyle = pop.color;
        ctx.fillText(pop.text, 0, 0);

        if (pop.subtext) {
          ctx.font = '600 13px system-ui, sans-serif';
          ctx.fillStyle = '#ffffff';
          ctx.fillText(pop.subtext, 0, 18);
        }
        ctx.restore();
      }
    }
    ctx.restore();
  }

  public getActiveCount(): number {
    let count = 0;
    for (const p of this.particles) if (p.active) count++;
    return count;
  }
}
