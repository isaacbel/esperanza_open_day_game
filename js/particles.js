/**
 * particles.js - High-performance pooled particle system, shockwaves,
 * score popups, pre-rendered glow sprites, and screen shake.
 */
import { GAME_CONFIG } from './config.js';

// Pre-rendered offscreen radial glow sprites cache to avoid expensive shadowBlur
const glowSprites = new Map();

function createGlowSprite(color, radius = 32) {
  const canvas = document.createElement('canvas');
  canvas.width = radius * 2;
  canvas.height = radius * 2;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
  grad.addColorStop(0, color);
  grad.addColorStop(0.4, color.replace(/[\d.]+\)$/g, '0.4)'));
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(radius, radius, radius, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

export function getGlowSprite(colorHex, radius = 32) {
  const key = `${colorHex}_${radius}`;
  if (!glowSprites.has(key)) {
    // Generate rgba from hex or color string
    let rgba = colorHex;
    if (colorHex.startsWith('#')) {
      const r = parseInt(colorHex.slice(1, 3), 16);
      const g = parseInt(colorHex.slice(3, 5), 16);
      const b = parseInt(colorHex.slice(5, 7), 16);
      rgba = `rgba(${r}, ${g}, ${b}, 0.85)`;
    }
    glowSprites.set(key, createGlowSprite(rgba, radius));
  }
  return glowSprites.get(key);
}

class Particle {
  constructor() {
    this.active = false;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.size = 2;
    this.initialSize = 2;
    this.color = '#00f0ff';
    this.alpha = 1;
    this.life = 0;
    this.maxLife = 1;
    this.friction = 0.94;
    this.gravity = 40; // px/s^2 downward drift
    this.type = 'spark'; // 'spark' | 'dust' | 'ring'
  }

  spawn(x, y, vx, vy, size, color, maxLife, type = 'spark', friction = 0.93, gravity = 60) {
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
    this.type = type;
  }

  update(dt) {
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
  constructor() {
    this.active = false;
    this.x = 0;
    this.y = 0;
    this.radius = 0;
    this.maxRadius = 120;
    this.color = '#00f0ff';
    this.lineWidth = 4;
    this.alpha = 1;
    this.speed = 360;
  }

  spawn(x, y, color = '#00f0ff', maxRadius = 130, speed = 380) {
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

  update(dt) {
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
  constructor() {
    this.active = false;
    this.x = 0;
    this.y = 0;
    this.vy = -60;
    this.text = '';
    this.subtext = '';
    this.color = '#00f0ff';
    this.alpha = 1;
    this.scale = 1;
    this.life = 0;
    this.maxLife = 0.85;
    this.isBig = false;
  }

  spawn(x, y, text, subtext = '', color = '#00f0ff', isBig = false) {
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

  update(dt) {
    if (!this.active) return;
    this.life += dt;
    if (this.life >= this.maxLife) {
      this.active = false;
      return;
    }
    const progress = this.life / this.maxLife;
    // Pop in, then float and fade
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
  constructor() {
    this.particles = Array.from({ length: GAME_CONFIG.maxParticles }, () => new Particle());
    this.shockwaves = Array.from({ length: 30 }, () => new Shockwave());
    this.popups = Array.from({ length: 40 }, () => new ScorePopup());
    
    // Ambient dust particles
    this.ambientDust = [];
    this.initAmbientDust();

    // Screen Shake
    this.shakeTrauma = 0;
    this.shakeDuration = 0;
    this.shakeElapsed = 0;
    this.shakeOffsetX = 0;
    this.shakeOffsetY = 0;
    this.reduceMotion = GAME_CONFIG.reduceMotion;
  }

  initAmbientDust() {
    this.ambientDust = [];
    for (let i = 0; i < 45; i++) {
      this.ambientDust.push({
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

  reset() {
    for (const p of this.particles) p.active = false;
    for (const s of this.shockwaves) s.active = false;
    for (const pop of this.popups) pop.active = false;
    this.shakeTrauma = 0;
    this.shakeOffsetX = 0;
    this.shakeOffsetY = 0;
  }

  triggerShake(trauma = 0.5, durationMs = 220) {
    if (this.reduceMotion || !GAME_CONFIG.screenShake) return;
    this.shakeTrauma = Math.min(1.0, this.shakeTrauma + trauma);
    this.shakeDuration = durationMs / 1000;
    this.shakeElapsed = 0;
  }

  emitCatch(x, y, color = '#00f0ff', count = 24, handVx = 0, handVy = 0) {
    let spawned = 0;
    const speedBoost = Math.hypot(handVx, handVy) * 0.15;
    
    for (const p of this.particles) {
      if (!p.active) {
        const angle = (Math.PI * 2 * (spawned / count)) + (Math.random() - 0.5) * 0.6;
        const speed = 120 + Math.random() * 220 + speedBoost;
        const vx = Math.cos(angle) * speed + handVx * 0.25;
        const vy = Math.sin(angle) * speed + handVy * 0.25;
        const size = 2.5 + Math.random() * 3.5;
        const life = 0.45 + Math.random() * 0.4;
        
        p.spawn(x, y, vx, vy, size, color, life, 'spark', 0.92, 110);
        spawned++;
        if (spawned >= count) break;
      }
    }

    this.emitShockwave(x, y, color, 120, 360);
  }

  emitShockwave(x, y, color = '#00f0ff', maxRadius = 130, speed = 380) {
    for (const s of this.shockwaves) {
      if (!s.active) {
        s.spawn(x, y, color, maxRadius, speed);
        break;
      }
    }
  }

  emitComboMilestone(x, y, combo) {
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
          'spark',
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

  emitMiss(x, y) {
    let spawned = 0;
    const color = '#ff2a5f';
    for (const p of this.particles) {
      if (!p.active) {
        const angle = Math.PI + (Math.random() - 0.5) * Math.PI; // Upward splash
        const speed = 100 + Math.random() * 240;
        p.spawn(
          x + (Math.random() - 0.5) * 30,
          y,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          3 + Math.random() * 3,
          color,
          0.5 + Math.random() * 0.35,
          'spark',
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

  addPopup(x, y, text, subtext = '', color = '#00f0ff', isBig = false) {
    for (const pop of this.popups) {
      if (!pop.active) {
        pop.spawn(x, y, text, subtext, color, isBig);
        break;
      }
    }
  }

  update(dt) {
    // Update particles
    for (const p of this.particles) {
      if (p.active) p.update(dt);
    }

    // Update shockwaves
    for (const s of this.shockwaves) {
      if (s.active) s.update(dt);
    }

    // Update popups
    for (const pop of this.popups) {
      if (pop.active) pop.update(dt);
    }

    // Update ambient dust
    for (const d of this.ambientDust) {
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.pulsePhase += d.pulseSpeed * dt;
      if (d.y < -10) {
        d.y = GAME_CONFIG.logicalHeight + 10;
        d.x = Math.random() * GAME_CONFIG.logicalWidth;
      }
      if (d.x < -10) d.x = GAME_CONFIG.logicalWidth + 10;
      if (d.x > GAME_CONFIG.logicalWidth + 10) d.x = -10;
    }

    // Update screen shake
    if (this.shakeTrauma > 0 && !this.reduceMotion) {
      this.shakeElapsed += dt;
      const progress = this.shakeElapsed / Math.max(0.01, this.shakeDuration);
      if (progress >= 1) {
        this.shakeTrauma = 0;
        this.shakeOffsetX = 0;
        this.shakeOffsetY = 0;
      } else {
        const currentTrauma = this.shakeTrauma * (1 - progress);
        const intensity = currentTrauma * currentTrauma * GAME_CONFIG.screenShakeMaxOffset;
        this.shakeOffsetX = (Math.random() * 2 - 1) * intensity;
        this.shakeOffsetY = (Math.random() * 2 - 1) * intensity;
      }
    } else {
      this.shakeOffsetX = 0;
      this.shakeOffsetY = 0;
    }
  }

  render(ctx) {
    // 1. Render Ambient Dust
    ctx.save();
    for (const d of this.ambientDust) {
      const alpha = d.alpha * (0.6 + 0.4 * Math.sin(d.pulsePhase));
      ctx.fillStyle = `rgba(0, 240, 255, ${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 2. Render Shockwaves (additive blending for rich neon punch)
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

    // 3. Render Particles
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      if (p.active && p.alpha > 0.01) {
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // 4. Render Floating Score Popups
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const pop of this.popups) {
      if (pop.active && pop.alpha > 0.01) {
        ctx.globalAlpha = pop.alpha;
        ctx.save();
        ctx.translate(pop.x, pop.y);
        ctx.scale(pop.scale, pop.scale);

        // Text shadow for crisp legibility against video
        ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 2;

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

  getActiveParticleCount() {
    let count = 0;
    for (const p of this.particles) if (p.active) count++;
    return count;
  }
}
