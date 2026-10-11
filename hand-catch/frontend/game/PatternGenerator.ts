/**
 * PatternGenerator.ts - Hardcore Procedural Pattern & Choreography Engine
 *
 * Generates structured, fair, and adrenaline-inducing wave patterns for HAND CATCH.
 * Includes all 18+ requested procedural patterns with dynamic trajectories:
 *   - DOUBLE, TRIPLE, QUAD
 *   - LEFT_RIGHT, RIGHT_LEFT, CENTER_SPLIT
 *   - ZIGZAG, WAVE, STAIRCASE, CROSSING, ALTERNATING
 *   - FULL_WIDTH, RAPID_BURST, RANDOM_BURST, FAKE_GAP
 *   - TWO_SIDE_ATTACK, CENTER_ATTACK, CHAOS, FINAL_RUSH
 */
import { ColumnType, ColumnMovement } from './ColumnRenderer';
import { GAME_CONFIG } from './GameConfig';

export type PatternName =
  | 'SINGLE'
  | 'DOUBLE'
  | 'TRIPLE'
  | 'QUAD'
  | 'LEFT_RIGHT'
  | 'RIGHT_LEFT'
  | 'CENTER_SPLIT'
  | 'ZIGZAG'
  | 'WAVE'
  | 'STAIRCASE'
  | 'CROSSING'
  | 'ALTERNATING'
  | 'FULL_WIDTH'
  | 'RAPID_BURST'
  | 'RANDOM_BURST'
  | 'FAKE_GAP'
  | 'TWO_SIDE_ATTACK'
  | 'CENTER_ATTACK'
  | 'CHAOS'
  | 'FINAL_RUSH'
  | 'BOSS_SWARM'
  | 'BOSS_CROSSFIRE'
  | 'BOSS_WARP'
  | 'BOSS_HAZARD_TRIAL';

export interface PatternSpawnItem {
  x: number;
  delayMs: number;
  type: ColumnType;
  movement: ColumnMovement;
  speedMultiplier: number; // 0.72 (slow) to 1.45 (very fast)
  widthMultiplier: number;
}

export function createMulberry32(seed: number): () => number {
  let s = seed | 0;
  return function() {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function getDailySeed(dateStr?: string): number {
  const date = dateStr || new Date().toISOString().slice(0, 10);
  let hash = 0;
  for (let i = 0; i < date.length; i++) {
    hash = ((hash << 5) - hash + date.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export class PatternGenerator {
  private static readonly ARENA_MIN_X = 220;
  private static readonly ARENA_MAX_X = 1060;
  private static readonly ARENA_CENTER_X = 640;
  private static readonly ARENA_SPAN = 840;

  /**
   * Generate an array of timed spawn items for a given pattern
   */
  public static generate(
    pattern: PatternName,
    difficulty: number,
    baseSpeed: number,
    level: number,
    forcedType?: ColumnType,
    rng: () => number = Math.random
  ): PatternSpawnItem[] {
    const minX = this.ARENA_MIN_X;
    const maxX = this.ARENA_MAX_X;
    const span = this.ARENA_SPAN;
    const center = this.ARENA_CENTER_X;

    switch (pattern) {
      case 'SINGLE': {
        const x = minX + Math.random() * span;
        const movement: ColumnMovement = difficulty > 0.4 && Math.random() > 0.5 ? 'accel' : 'vertical';
        return [{
          x,
          delayMs: 0,
          type: forcedType || this.pickRandomType(),
          movement,
          speedMultiplier: 1.0,
          widthMultiplier: 1.0
        }];
      }

      case 'DOUBLE': {
        const isSimultaneous = Math.random() > 0.35;
        const leftX = minX + 50 + Math.random() * (span * 0.35);
        const rightX = maxX - 50 - Math.random() * (span * 0.35);
        return [
          {
            x: leftX,
            delayMs: 0,
            type: forcedType || this.pickRandomType(),
            movement: 'vertical',
            speedMultiplier: 1.0,
            widthMultiplier: 0.95
          },
          {
            x: rightX,
            delayMs: isSimultaneous ? 0 : 160,
            type: this.pickRandomType(),
            movement: 'vertical',
            speedMultiplier: 1.0,
            widthMultiplier: 0.95
          }
        ];
      }

      case 'TRIPLE': {
        const isV = Math.random() > 0.5;
        const x1 = minX + 60;
        const x2 = center;
        const x3 = maxX - 60;
        return [
          { x: x1, delayMs: isV ? 0 : 180, type: forcedType || this.pickRandomType(), movement: 'vertical', speedMultiplier: 1.0, widthMultiplier: 0.9 },
          { x: x2, delayMs: isV ? 180 : 0, type: this.pickRandomType(), movement: 'vertical', speedMultiplier: 1.05, widthMultiplier: 0.9 },
          { x: x3, delayMs: isV ? 0 : 180, type: this.pickRandomType(), movement: 'vertical', speedMultiplier: 1.0, widthMultiplier: 0.9 }
        ];
      }

      case 'QUAD': {
        // 4 columns staggered across 4 distinct lane zones
        const wStep = span / 4;
        const ltr = Math.random() > 0.5;
        const list: PatternSpawnItem[] = [];
        for (let i = 0; i < 4; i++) {
          const lane = ltr ? i : 3 - i;
          const x = minX + lane * wStep + wStep * 0.5;
          list.push({
            x,
            delayMs: i * 140,
            type: i === 3 ? (forcedType || 'gold') : this.pickRandomType(),
            movement: i % 2 === 0 ? 'vertical' : 'accel',
            speedMultiplier: 1.05 + i * 0.05,
            widthMultiplier: 0.88
          });
        }
        return list;
      }

      case 'LEFT_RIGHT': {
        const leftX = minX + 80;
        const rightX = maxX - 80;
        return [
          { x: leftX, delayMs: 0, type: forcedType || 'normal', movement: 'vertical', speedMultiplier: 1.08, widthMultiplier: 0.9 },
          { x: rightX, delayMs: 200, type: 'normal', movement: 'vertical', speedMultiplier: 1.08, widthMultiplier: 0.9 },
          { x: leftX + 130, delayMs: 400, type: 'normal', movement: 'vertical', speedMultiplier: 1.08, widthMultiplier: 0.9 }
        ];
      }

      case 'RIGHT_LEFT': {
        const leftX = minX + 80;
        const rightX = maxX - 80;
        return [
          { x: rightX, delayMs: 0, type: forcedType || 'normal', movement: 'vertical', speedMultiplier: 1.08, widthMultiplier: 0.9 },
          { x: leftX, delayMs: 200, type: 'normal', movement: 'vertical', speedMultiplier: 1.08, widthMultiplier: 0.9 },
          { x: rightX - 130, delayMs: 400, type: 'normal', movement: 'vertical', speedMultiplier: 1.08, widthMultiplier: 0.9 }
        ];
      }

      case 'CENTER_SPLIT': {
        // 2 items spawning at center and drifting outwards diagonally
        return [
          { x: center - 40, delayMs: 0, type: forcedType || 'fast', movement: 'diagonal', speedMultiplier: 1.1, widthMultiplier: 0.9 },
          { x: center + 40, delayMs: 0, type: this.pickRandomType(), movement: 'diagonal', speedMultiplier: 1.1, widthMultiplier: 0.9 }
        ];
      }

      case 'ZIGZAG': {
        const x = center + (Math.random() > 0.5 ? 150 : -150);
        return [
          { x, delayMs: 0, type: forcedType || 'fast', movement: 'zigzag', speedMultiplier: 1.18, widthMultiplier: 0.9 },
          { x: center - (x - center), delayMs: 250, type: 'normal', movement: 'zigzag', speedMultiplier: 1.18, widthMultiplier: 0.9 }
        ];
      }

      case 'WAVE': {
        const x = minX + 100 + Math.random() * (span - 200);
        return [
          { x, delayMs: 0, type: forcedType || this.pickRandomType(), movement: 'wave', speedMultiplier: 0.95, widthMultiplier: 1.05 },
          { x: center + (center - x), delayMs: 220, type: 'fast', movement: 'wave', speedMultiplier: 1.1, widthMultiplier: 0.95 }
        ];
      }

      case 'STAIRCASE': {
        const ltr = Math.random() > 0.5;
        const steps = 4;
        const stepWidth = (span - 100) / (steps - 1);
        const list: PatternSpawnItem[] = [];
        for (let i = 0; i < steps; i++) {
          const idx = ltr ? i : steps - 1 - i;
          const x = minX + 50 + idx * stepWidth;
          list.push({
            x,
            delayMs: i * 140,
            type: i === steps - 1 ? (forcedType || 'gold') : 'normal',
            movement: 'vertical',
            speedMultiplier: 1.0 + i * 0.04,
            widthMultiplier: 0.88
          });
        }
        return list;
      }

      case 'CROSSING': {
        // Two crossing diagonal trajectories
        return [
          { x: minX + 80, delayMs: 0, type: forcedType || 'fast', movement: 'diagonal', speedMultiplier: 1.15, widthMultiplier: 0.9 },
          { x: maxX - 80, delayMs: 0, type: 'fast', movement: 'diagonal', speedMultiplier: 1.15, widthMultiplier: 0.9 }
        ];
      }

      case 'ALTERNATING': {
        return [
          { x: minX + 110, delayMs: 0, type: forcedType || 'normal', movement: 'vertical', speedMultiplier: 1.05, widthMultiplier: 0.9 },
          { x: maxX - 110, delayMs: 180, type: 'normal', movement: 'vertical', speedMultiplier: 1.05, widthMultiplier: 0.9 },
          { x: minX + 240, delayMs: 360, type: 'normal', movement: 'vertical', speedMultiplier: 1.05, widthMultiplier: 0.9 },
          { x: maxX - 240, delayMs: 540, type: 'gold', movement: 'vertical', speedMultiplier: 1.1, widthMultiplier: 0.9 }
        ];
      }

      case 'FULL_WIDTH': {
        // Sweeping 5-column barrage with an intentional readable gap for fair reflex catch
        const count = 5;
        const gapIdx = Math.floor(Math.random() * count);
        const stepW = span / count;
        const list: PatternSpawnItem[] = [];
        for (let i = 0; i < count; i++) {
          if (i === gapIdx) continue;
          const x = minX + i * stepW + stepW * 0.5;
          list.push({
            x,
            delayMs: i * 70,
            type: i === 0 ? 'multiplier' : 'normal',
            movement: 'vertical',
            speedMultiplier: 1.0,
            widthMultiplier: 0.85
          });
        }
        return list;
      }

      case 'RAPID_BURST': {
        // Accelerating rhythm burst: 250ms -> 180ms -> 150ms -> 120ms
        const delays = [0, 250, 430, 580, 700];
        const list: PatternSpawnItem[] = [];
        for (let i = 0; i < delays.length; i++) {
          const x = minX + 70 + Math.random() * (span - 140);
          list.push({
            x,
            delayMs: delays[i],
            type: i === delays.length - 1 ? 'gold' : this.pickRandomType(),
            movement: i === 2 ? 'swerve' : Math.random() > 0.5 ? 'accel' : 'vertical',
            speedMultiplier: 1.08 + i * 0.05,
            widthMultiplier: 0.86
          });
        }
        return list;
      }

      case 'RANDOM_BURST': {
        const list: PatternSpawnItem[] = [];
        for (let i = 0; i < 4; i++) {
          const x = minX + 80 + Math.random() * (span - 160);
          list.push({
            x,
            delayMs: i * 130,
            type: this.pickRandomType(),
            movement: Math.random() > 0.6 ? 'wave' : 'vertical',
            speedMultiplier: 1.1 + Math.random() * 0.2,
            widthMultiplier: 0.88
          });
        }
        return list;
      }

      case 'FAKE_GAP': {
        // Two flank objects followed immediately by a sudden high-speed center object
        return [
          { x: minX + 90, delayMs: 0, type: 'normal', movement: 'vertical', speedMultiplier: 0.95, widthMultiplier: 0.9 },
          { x: maxX - 90, delayMs: 0, type: 'normal', movement: 'vertical', speedMultiplier: 0.95, widthMultiplier: 0.9 },
          { x: center, delayMs: 280, type: forcedType || 'fast', movement: 'accel', speedMultiplier: 1.35, widthMultiplier: 0.85 }
        ];
      }

      case 'TWO_SIDE_ATTACK': {
        // Simultaneous opposite flanks forcing both hands
        const leftX = minX + 80 + Math.random() * 100;
        const rightX = maxX - 80 - Math.random() * 100;
        return [
          { x: leftX, delayMs: 0, type: forcedType || 'normal', movement: 'vertical', speedMultiplier: 1.12, widthMultiplier: 0.88 },
          { x: rightX, delayMs: 0, type: 'normal', movement: 'vertical', speedMultiplier: 1.12, widthMultiplier: 0.88 },
          { x: center, delayMs: 240, type: 'gold', movement: 'vertical', speedMultiplier: 1.22, widthMultiplier: 0.85 }
        ];
      }

      case 'CENTER_ATTACK': {
        return [
          { x: center - 120, delayMs: 0, type: 'fast', movement: 'accel', speedMultiplier: 1.25, widthMultiplier: 0.85 },
          { x: center + 120, delayMs: 140, type: 'fast', movement: 'accel', speedMultiplier: 1.25, widthMultiplier: 0.85 },
          { x: minX + 100, delayMs: 320, type: 'combo', movement: 'vertical', speedMultiplier: 1.1, widthMultiplier: 0.9 },
          { x: maxX - 100, delayMs: 320, type: 'combo', movement: 'vertical', speedMultiplier: 1.1, widthMultiplier: 0.9 }
        ];
      }

      case 'CHAOS': {
        // Multi-trajectory challenge
        return [
          { x: minX + 120, delayMs: 0, type: 'fast', movement: 'diagonal', speedMultiplier: 1.18, widthMultiplier: 0.85 },
          { x: maxX - 120, delayMs: 0, type: 'fast', movement: 'diagonal', speedMultiplier: 1.18, widthMultiplier: 0.85 },
          { x: center, delayMs: 180, type: 'slow', movement: 'wave', speedMultiplier: 0.75, widthMultiplier: 1.1 },
          { x: center, delayMs: 380, type: 'gold', movement: 'accel', speedMultiplier: 1.35, widthMultiplier: 0.85 }
        ];
      }

      case 'FINAL_RUSH': {
        // Scripted endgame climax (Section 12)
        return [
          { x: minX + 80, delayMs: 0, type: 'fast', movement: 'vertical', speedMultiplier: 1.28, widthMultiplier: 0.85 },
          { x: maxX - 80, delayMs: 160, type: 'fast', movement: 'vertical', speedMultiplier: 1.28, widthMultiplier: 0.85 },
          { x: minX + 180, delayMs: 320, type: 'normal', movement: 'diagonal', speedMultiplier: 1.22, widthMultiplier: 0.85 },
          { x: maxX - 180, delayMs: 480, type: 'normal', movement: 'diagonal', speedMultiplier: 1.22, widthMultiplier: 0.85 },
          { x: minX + 100, delayMs: 680, type: 'fast', movement: 'vertical', speedMultiplier: 1.35, widthMultiplier: 0.85 },
          { x: maxX - 100, delayMs: 680, type: 'fast', movement: 'vertical', speedMultiplier: 1.35, widthMultiplier: 0.85 },
          { x: center, delayMs: 950, type: 'final_gold', movement: 'accel', speedMultiplier: 1.2, widthMultiplier: 1.1 }
        ];
      }

      case 'BOSS_SWARM': {
        return [
          { x: minX + 80, delayMs: 0, type: 'fast', movement: 'vertical', speedMultiplier: 1.2, widthMultiplier: 0.88 },
          { x: minX + 240, delayMs: 150, type: 'fast', movement: 'accel', speedMultiplier: 1.25, widthMultiplier: 0.88 },
          { x: center, delayMs: 300, type: 'combo', movement: 'vertical', speedMultiplier: 1.2, widthMultiplier: 0.88 },
          { x: maxX - 240, delayMs: 450, type: 'fast', movement: 'accel', speedMultiplier: 1.25, widthMultiplier: 0.88 },
          { x: maxX - 80, delayMs: 600, type: 'gold', movement: 'vertical', speedMultiplier: 1.3, widthMultiplier: 0.88 }
        ];
      }

      case 'BOSS_CROSSFIRE': {
        return [
          { x: minX + 70, delayMs: 0, type: 'fast', movement: 'diagonal', speedMultiplier: 1.25, widthMultiplier: 0.88 },
          { x: maxX - 70, delayMs: 0, type: 'fast', movement: 'diagonal', speedMultiplier: 1.25, widthMultiplier: 0.88 },
          { x: minX + 200, delayMs: 250, type: 'fast', movement: 'diagonal', speedMultiplier: 1.25, widthMultiplier: 0.88 },
          { x: maxX - 200, delayMs: 250, type: 'gold', movement: 'diagonal', speedMultiplier: 1.25, widthMultiplier: 0.88 }
        ];
      }

      case 'BOSS_WARP': {
        return [
          { x: center - 160, delayMs: 0, type: 'teleport', movement: 'wave', speedMultiplier: 1.0, widthMultiplier: 0.9 },
          { x: center + 160, delayMs: 140, type: 'ghost', movement: 'wave', speedMultiplier: 1.0, widthMultiplier: 0.9 },
          { x: minX + 120, delayMs: 320, type: 'multiplier', movement: 'zigzag', speedMultiplier: 1.2, widthMultiplier: 0.88 },
          { x: maxX - 120, delayMs: 320, type: 'slow', movement: 'zigzag', speedMultiplier: 1.2, widthMultiplier: 0.88 }
        ];
      }

      case 'BOSS_HAZARD_TRIAL': {
        return [
          { x: minX + 100, delayMs: 0, type: 'hazard', movement: 'vertical', speedMultiplier: 1.0, widthMultiplier: 1.0 },
          { x: maxX - 100, delayMs: 0, type: 'hazard', movement: 'vertical', speedMultiplier: 1.0, widthMultiplier: 1.0 },
          { x: center, delayMs: 220, type: 'gold', movement: 'accel', speedMultiplier: 1.2, widthMultiplier: 1.0 },
          { x: center - 140, delayMs: 440, type: 'combo', movement: 'vertical', speedMultiplier: 1.15, widthMultiplier: 0.9 },
          { x: center + 140, delayMs: 440, type: 'combo', movement: 'vertical', speedMultiplier: 1.15, widthMultiplier: 0.9 }
        ];
      }

      default:
        return [{ x: center, delayMs: 0, type: 'normal', movement: 'vertical', speedMultiplier: 1.0, widthMultiplier: 1.0 }];
    }
  }

  private static pickRandomType(rng: () => number = Math.random): ColumnType {
    const roll = rng();
    const sc = GAME_CONFIG.specialChance;
    if (roll < sc.gold) return 'gold';
    if (roll < sc.gold + sc.heart) return 'heart';
    if (roll < sc.gold + sc.heart + sc.fast) return 'fast';
    if (roll < sc.gold + sc.heart + sc.fast + sc.multiplier) return 'multiplier';
    if (roll < sc.gold + sc.heart + sc.fast + sc.multiplier + sc.slow) return 'slow';
    if (roll < sc.gold + sc.heart + sc.fast + sc.multiplier + sc.slow + sc.combo) return 'combo';
    if (roll < sc.gold + sc.heart + sc.fast + sc.multiplier + sc.slow + sc.combo + 0.04) return 'teleport';
    if (roll < sc.gold + sc.heart + sc.fast + sc.multiplier + sc.slow + sc.combo + 0.08) return 'ghost';
    if (GAME_CONFIG.enableHazards && rng() < GAME_CONFIG.hazardChance) return 'hazard';
    return 'normal';
  }
}
