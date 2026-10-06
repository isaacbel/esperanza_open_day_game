/**
 * ColumnRenderer.ts - Falling Columns Object Pool, Neon Shaders & "Feel Good" Catch Lifecycle
 *
 * Implements 10 distinct interactive column types:
 *   - NORMAL (🔴) - Standard catch points
 *   - GOLD (🟡) - High score & radiant aura
 *   - HEART (💚) - Recovers +1 life
 *   - FAST (⚡) - Temporarily speeds up & grants rapid bonus
 *   - SLOW (❄️) - Triggers global slow-motion time dilation
 *   - HAZARD / BOMB (💣) - Costs 2 lives on touch; deflectable with fast swipe!
 *   - MULTIPLIER (⭐) - Boosts score multiplier
 *   - TELEPORT (🌀) - Jumps position midway down with quantum particles
 *   - GHOST (👻) - Phase-shifts; requires fist/grab or deliberate catch
 *   - COMBO (🔥) - Instant +3 combo surge & maintains streak
 *   - FINAL_GOLD (🌟) - 5x golden finale climax object
 */
import { GAME_CONFIG } from './GameConfig';
import { getGlowSprite } from './ParticleSystem';
import { lerp } from '../utils/math';

export type ColumnType =
  | 'normal'
  | 'gold'
  | 'heart'
  | 'fast'
  | 'slow'
  | 'multiplier'
  | 'hazard'
  | 'combo'
  | 'final_gold'
  | 'teleport'
  | 'ghost';

export type ColumnState = 'falling' | 'caught' | 'missed' | 'inactive';
export type ColumnMovement = 'vertical' | 'drift' | 'wave' | 'diagonal' | 'zigzag' | 'swerve' | 'accel';

export interface FallingColumnData {
  id: number;
  type: ColumnType;
  x: number;
  y: number;
  prevY: number;
  baseX: number;
  width: number;
  height: number;
  initialWidth: number;
  initialHeight: number;
  vy: number;
  vx: number;
  ay: number;
  swerveTriggered: boolean;
  hasTeleported: boolean;
  color: string;
  scoreMultiplier: number;
  spawnTime: number;
  state: ColumnState;
  caughtByHand: number | null;
  movement: ColumnMovement;
  driftSpeed: number;
  waveFreq: number;
  waveAmp: number;
  catchProgress: number; // 0 to 1 during micro-freeze & pull
  catchTargetX: number;
  catchTargetY: number;
  trail: { x: number; y: number; alpha: number }[];
  trailIndex: number;
}

export class ColumnRenderer {
  public columns: FallingColumnData[];

  constructor(poolSize: number = 44) {
    this.columns = Array.from({ length: poolSize }, (_, id) => ({
      id,
      type: 'normal',
      x: 0,
      y: 0,
      prevY: 0,
      baseX: 0,
      width: 70,
      height: 190,
      initialWidth: 70,
      initialHeight: 190,
      vy: 220,
      vx: 0,
      ay: 0,
      swerveTriggered: false,
      hasTeleported: false,
      color: '#00f0ff',
      scoreMultiplier: 1,
      spawnTime: 0,
      state: 'inactive',
      caughtByHand: null,
      movement: 'vertical',
      driftSpeed: 0,
      waveFreq: 2,
      waveAmp: 0,
      catchProgress: 0,
      catchTargetX: 0,
      catchTargetY: 0,
      trail: Array.from({ length: GAME_CONFIG.trailLength }, () => ({ x: 0, y: 0, alpha: 0 })),
      trailIndex: 0
    }));
  }

  public reset(): void {
    for (const col of this.columns) {
      col.state = 'inactive';
      col.caughtByHand = null;
      col.catchProgress = 0;
      col.swerveTriggered = false;
      col.hasTeleported = false;
    }
  }

  public spawn(
    x: number,
    y: number,
    width: number,
    height: number,
    vy: number,
    type: ColumnType = 'normal',
    movement: ColumnMovement = 'vertical'
  ): FallingColumnData | null {
    const col = this.columns.find(c => c.state === 'inactive');
    if (!col) return null;

    col.x = x;
    col.baseX = x;
    col.y = y;
    col.prevY = y;
    col.width = width;
    col.height = height;
    col.initialWidth = width;
    col.initialHeight = height;
    col.vy = vy;
    col.vx = 0;
    col.ay = 0;
    col.swerveTriggered = false;
    col.hasTeleported = false;
    col.type = type;
    col.movement = movement;
    col.state = 'falling';
    col.caughtByHand = null;
    col.catchProgress = 0;
    col.spawnTime = performance.now();

    // Movement physics configuration
    col.driftSpeed = (Math.random() - 0.5) * 65; // px/s
    col.waveFreq = 1.4 + Math.random() * 1.0;
    col.waveAmp = 24 + Math.random() * 32;       // wave amplitude

    if (movement === 'diagonal') {
      col.vx = (x < 640 ? 1 : -1) * (140 + Math.random() * 100);
    } else if (movement === 'zigzag') {
      col.vx = (Math.random() > 0.5 ? 1 : -1) * (190 + Math.random() * 90);
    } else if (movement === 'accel') {
      col.ay = 240 + Math.random() * 180; // downward gravitational acceleration
    }

    // Type specifics
    switch (type) {
      case 'gold':
        col.color = '#ffd700';
        col.scoreMultiplier = 3;
        break;
      case 'final_gold':
        col.color = '#fff066'; // Intense Golden Radiance
        col.scoreMultiplier = 5;
        break;
      case 'heart':
        col.color = '#ff007f';
        col.scoreMultiplier = 1;
        break;
      case 'fast':
        col.color = '#bf00ff'; // Neon Electric Purple
        col.width = width * 0.88;
        col.vy = vy * 1.34;
        col.scoreMultiplier = 2;
        break;
      case 'slow':
        col.color = '#00ffaa'; // Bright Aqua / Mint (Freeze Time)
        col.width = width * 1.25;
        col.vy = vy * 0.72;
        col.scoreMultiplier = 1;
        break;
      case 'multiplier':
        col.color = '#ff9900'; // Amber Burst
        col.scoreMultiplier = 2;
        break;
      case 'combo':
        col.color = '#00f0ff'; // Cyan Surge
        col.scoreMultiplier = 2;
        break;
      case 'teleport':
        col.color = '#00e5ff'; // Quantum Cyan / Indigo
        col.scoreMultiplier = 3;
        break;
      case 'ghost':
        col.color = '#c4a1ff'; // Spectral Violet
        col.scoreMultiplier = 3;
        break;
      case 'hazard':
        col.color = '#ff2a2a'; // Bomb Red
        col.scoreMultiplier = 0;
        break;
      default:
        col.color = '#00f0ff';
        col.scoreMultiplier = 1;
        break;
    }

    for (let i = 0; i < col.trail.length; i++) {
      col.trail[i].x = x;
      col.trail[i].y = y;
      col.trail[i].alpha = 0;
    }
    col.trailIndex = 0;

    return col;
  }

  public triggerCatch(col: FallingColumnData, handTrackId: number, targetX: number, targetY: number): void {
    col.state = 'caught';
    col.caughtByHand = handTrackId;
    col.catchProgress = 0;
    col.catchTargetX = targetX;
    col.catchTargetY = targetY;
  }

  public update(dt: number): void {
    const freezeDurationSec = Math.max(0.04, GAME_CONFIG.catchFreezeMs / 1000);

    for (const col of this.columns) {
      if (col.state === 'inactive') continue;

      if (col.state === 'falling') {
        col.prevY = col.y;

        // Vertical Acceleration
        if (col.ay > 0) {
          col.vy += col.ay * dt;
        }
        col.y += col.vy * dt;

        // Teleport Item Special Dynamic
        if (col.type === 'teleport' && col.y > 270 && !col.hasTeleported) {
          col.hasTeleported = true;
          const shift = (col.x < 640 ? 1 : -1) * (260 + Math.random() * 120);
          col.x = Math.max(200, Math.min(1080, col.x + shift));
          col.baseX = col.x;
        }

        // Dynamic Trajectory Physics
        if (col.movement === 'drift') {
          col.x = Math.max(160, Math.min(1120, col.x + col.driftSpeed * dt));
        } else if (col.movement === 'wave') {
          const t = (performance.now() - col.spawnTime) / 1000;
          col.x = Math.max(160, Math.min(1120, col.baseX + Math.sin(t * col.waveFreq * Math.PI) * col.waveAmp));
        } else if (col.movement === 'diagonal') {
          col.x = Math.max(160, Math.min(1120, col.x + col.vx * dt));
        } else if (col.movement === 'zigzag') {
          col.x += col.vx * dt;
          if (col.x < 180) {
            col.x = 180;
            col.vx = Math.abs(col.vx);
          } else if (col.x > 1100) {
            col.x = 1100;
            col.vx = -Math.abs(col.vx);
          }
        } else if (col.movement === 'swerve') {
          if (col.y > 200 && !col.swerveTriggered) {
            col.swerveTriggered = true;
            col.vx = (Math.random() > 0.5 ? 1 : -1) * (180 + Math.random() * 120);
          }
          col.x = Math.max(160, Math.min(1120, col.x + col.vx * dt));
        }

        // Update trail ring buffer
        const slot = col.trail[col.trailIndex];
        slot.x = col.x;
        slot.y = col.y;
        slot.alpha = 0.5;
        col.trailIndex = (col.trailIndex + 1) % col.trail.length;

        for (let i = 0; i < col.trail.length; i++) {
          col.trail[i].alpha *= 0.88;
        }
      } else if (col.state === 'caught') {
        // "Feel Good" Catch Lifecycle
        col.catchProgress += dt / freezeDurationSec;

        const p = Math.min(1.0, col.catchProgress);
        col.x = lerp(col.x, col.catchTargetX, p * 0.38);
        col.y = lerp(col.y, col.catchTargetY - 20, p * 0.38);

        col.width = col.initialWidth * (1.0 - p * 0.65);
        col.height = col.initialHeight * (1.0 - p * 0.70);

        if (col.catchProgress >= 1.0) {
          col.state = 'inactive';
        }
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D, lowQuality: boolean = false): void {
    for (const col of this.columns) {
      if (col.state === 'inactive') continue;

      ctx.save();
      const halfW = col.width * 0.5;
      const left = col.x - halfW;
      const top = col.y;
      const radius = Math.min(10, col.width * 0.35);

      // Ghost phase shift pulsation
      if (col.type === 'ghost') {
        const pulse = 0.45 + Math.sin(performance.now() * 0.008 + col.id) * 0.35;
        ctx.globalAlpha = col.state === 'caught' ? 0.9 : pulse;
      } else if (col.state === 'caught') {
        ctx.globalAlpha = Math.max(0, 1.0 - col.catchProgress * 0.8);
      }

      // 1. Motion Trail (falling state only)
      if (!lowQuality && col.state === 'falling') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < col.trail.length; i++) {
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

      // 2. Pre-rendered Outer Glow
      const glowSprite = getGlowSprite(col.color, 48);
      if (glowSprite && !lowQuality) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = col.state === 'caught' ? 0.85 : 0.55;
        ctx.drawImage(glowSprite, col.x - 48, top + col.height * 0.5 - 48, 96, 96);
        ctx.restore();
      }

      // 3. Vertical Gradient Body
      const grad = ctx.createLinearGradient(left, top, left, top + col.height);
      switch (col.type) {
        case 'final_gold':
          grad.addColorStop(0, '#ffffff');
          grad.addColorStop(0.15, '#ffff99');
          grad.addColorStop(0.5, '#ffd700');
          grad.addColorStop(0.85, '#ff9900');
          grad.addColorStop(1, '#994d00');
          break;
        case 'gold':
          grad.addColorStop(0, '#ffffff');
          grad.addColorStop(0.2, '#ffe066');
          grad.addColorStop(0.7, '#d4af37');
          grad.addColorStop(1, '#8b6508');
          break;
        case 'combo':
          grad.addColorStop(0, '#ffffff');
          grad.addColorStop(0.2, '#a6f9ff');
          grad.addColorStop(0.65, '#00d0ff');
          grad.addColorStop(1, '#006699');
          break;
        case 'heart':
          grad.addColorStop(0, '#ffffff');
          grad.addColorStop(0.25, '#ff4d94');
          grad.addColorStop(0.7, '#cc0052');
          grad.addColorStop(1, '#800033');
          break;
        case 'fast':
          grad.addColorStop(0, '#ffffff');
          grad.addColorStop(0.2, '#e066ff');
          grad.addColorStop(0.7, '#bf00ff');
          grad.addColorStop(1, '#4b0082');
          break;
        case 'slow':
          grad.addColorStop(0, '#ffffff');
          grad.addColorStop(0.25, '#66ffcc');
          grad.addColorStop(0.7, '#00cc88');
          grad.addColorStop(1, '#004d33');
          break;
        case 'multiplier':
          grad.addColorStop(0, '#ffffff');
          grad.addColorStop(0.2, '#ffbb33');
          grad.addColorStop(0.7, '#ff8800');
          grad.addColorStop(1, '#663300');
          break;
        case 'teleport':
          grad.addColorStop(0, '#ffffff');
          grad.addColorStop(0.2, '#66ffff');
          grad.addColorStop(0.7, '#0099ff');
          grad.addColorStop(1, '#003366');
          break;
        case 'ghost':
          grad.addColorStop(0, '#ffffff');
          grad.addColorStop(0.3, '#d8b4fe');
          grad.addColorStop(0.7, '#a855f7');
          grad.addColorStop(1, '#581c87');
          break;
        case 'hazard':
          grad.addColorStop(0, '#ffffff');
          grad.addColorStop(0.3, '#ff3333');
          grad.addColorStop(0.8, '#990000');
          grad.addColorStop(1, '#4d0000');
          break;
        default:
          grad.addColorStop(0, '#ffffff');
          grad.addColorStop(0.2, '#00f0ff');
          grad.addColorStop(0.65, '#0055ff');
          grad.addColorStop(1, '#001a66');
          break;
      }

      ctx.fillStyle = grad;
      this.drawRoundedRect(ctx, left, top, col.width, col.height, radius);
      ctx.fill();

      // 4. Inner Bright Highlight Stripe
      ctx.fillStyle = col.type === 'final_gold' ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 255, 255, 0.8)';
      ctx.fillRect(col.x - 2, top + 8, 4, Math.max(0, col.height - 16));

      // 5. Special Type Emblems
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (col.type === 'final_gold') {
        ctx.font = '900 18px "Orbitron", system-ui';
        ctx.fillText('5X★', col.x, top + col.height * 0.5);
      } else if (col.type === 'heart') {
        ctx.font = '700 20px system-ui';
        ctx.fillText('♥', col.x, top + col.height * 0.5);
      } else if (col.type === 'gold') {
        ctx.font = '900 16px "Orbitron", system-ui';
        ctx.fillText('3X', col.x, top + col.height * 0.5);
      } else if (col.type === 'multiplier') {
        ctx.font = '900 14px "Orbitron", system-ui';
        ctx.fillText('+2X', col.x, top + col.height * 0.5);
      } else if (col.type === 'combo') {
        ctx.font = '900 13px "Orbitron", system-ui';
        ctx.fillText('+3🔥', col.x, top + col.height * 0.5);
      } else if (col.type === 'fast') {
        ctx.font = '900 13px "Orbitron", system-ui';
        ctx.fillText('⚡', col.x, top + col.height * 0.5);
      } else if (col.type === 'slow') {
        ctx.font = '900 14px "Orbitron", system-ui';
        ctx.fillText('❄️', col.x, top + col.height * 0.5);
      } else if (col.type === 'teleport') {
        ctx.font = '900 14px "Orbitron", system-ui';
        ctx.fillText('🌀', col.x, top + col.height * 0.5);
      } else if (col.type === 'ghost') {
        ctx.font = '900 14px "Orbitron", system-ui';
        ctx.fillText('👻', col.x, top + col.height * 0.5);
      } else if (col.type === 'hazard') {
        ctx.font = '900 14px "Orbitron", system-ui';
        ctx.fillText('💣', col.x, top + col.height * 0.5);
      }

      ctx.restore();
    }
  }

  private drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
    if (width <= 0 || height <= 0) return;
    const r = Math.min(radius, width * 0.5, height * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}
