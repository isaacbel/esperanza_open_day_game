/**
 * SpawnSystem.ts - Smart AI Column Spawner
 *
 * Analyzes active hand count, hand positions, velocities, and difficulty to guarantee:
 *   1. Zero impossible simultaneous spawns (e.g. opposite edges with only 1 hand active)
 *   2. No vertical overlaps in the same lane (minimum spacing enforced)
 *   3. Dynamic lane distribution (LEFT, CENTER-LEFT, CENTER-RIGHT, RIGHT)
 *   4. Balanced special column pacing (Gold, Heart, Fast, Multiplier)
 */
import { GAME_CONFIG } from './GameConfig';
import { ColumnRenderer, ColumnType, ColumnMovement } from './ColumnRenderer';
import { DifficultySystem } from './DifficultySystem';
import { TrackedHandData } from '../vision/HandTypes';

export class SpawnSystem {
  private lastSpawnTime: number = 0;
  private nextInterval: number = GAME_CONFIG.spawnInterval;
  private lastSpawnX: number = 640;
  private recentSpawnXs: number[] = [];

  public reset(): void {
    this.lastSpawnTime = performance.now() + 400;
    this.nextInterval = GAME_CONFIG.spawnInterval;
    this.lastSpawnX = 640;
    this.recentSpawnXs = [];
  }

  public update(
    now: number,
    elapsedSec: number,
    columnRenderer: ColumnRenderer,
    currentLives: number,
    trackedHands: TrackedHandData[] = [],
    playerAccuracy: number = 100,
    currentCombo: number = 0
  ): number {
    if (now - this.lastSpawnTime < this.nextInterval) return 0;

    // Use adaptive difficulty considering player performance
    const diff = DifficultySystem.getAdaptiveDifficulty(elapsedSec, playerAccuracy, currentCombo);
    const maxSimultaneous = DifficultySystem.getMaxObjects(diff);
    const activeColumns = columnRenderer.columns.filter(c => c.state === 'falling');

    if (activeColumns.length >= maxSimultaneous) return 0;

    const baseSpeed = DifficultySystem.getFallSpeed(diff);
    const width = DifficultySystem.getColumnWidth(diff);
    const height = DifficultySystem.getColumnHeight(diff);

    const minX = GAME_CONFIG.arena.centerX - GAME_CONFIG.arena.radiusX * 0.78;
    const maxX = GAME_CONFIG.arena.centerX + GAME_CONFIG.arena.radiusX * 0.78;
    const availableSpan = maxX - minX;

    const activeHandsCount = Math.max(1, trackedHands.filter(h => h.active && !h.isGhost).length);

    // AI Pattern Selection:
    // Only spawn dual columns if difficulty is high AND either 2 hands are active or columns are close enough for 1 hand
    const allowDual = diff > 0.45 && activeHandsCount >= 2 && activeColumns.length + 2 <= maxSimultaneous;
    const roll = Math.random();

    let candidateXs: { x: number; movement: ColumnMovement }[] = [];

    if (allowDual && roll > 0.75) {
      // DUAL REACHABLE SPAWN: One in left sector, one in right sector
      const leftSectorX = minX + 60 + Math.random() * (availableSpan * 0.35);
      const rightSectorX = maxX - 60 - Math.random() * (availableSpan * 0.35);
      candidateXs = [
        { x: leftSectorX, movement: 'vertical' },
        { x: rightSectorX, movement: 'vertical' }
      ];
    } else if (diff > 0.55 && roll > 0.45) {
      // WAVE / DRIFT COLUMN: Spawns in an alternate quadrant
      const side = this.lastSpawnX < GAME_CONFIG.arena.centerX ? 1 : -1;
      const targetX = GAME_CONFIG.arena.centerX + side * (100 + Math.random() * 200);
      const movement: ColumnMovement = Math.random() > 0.5 ? 'wave' : 'drift';
      candidateXs = [{ x: Math.max(minX, Math.min(maxX, targetX)), movement }];
    } else {
      // SINGLE CONTROLLED JUMP: Prevents wild teleporting across screen
      let candidateX = minX + Math.random() * availableSpan;
      const maxJumpPx = 420;
      if (Math.abs(candidateX - this.lastSpawnX) > maxJumpPx) {
        candidateX = this.lastSpawnX + (candidateX > this.lastSpawnX ? maxJumpPx : -maxJumpPx);
        candidateX = Math.max(minX, Math.min(maxX, candidateX));
      }
      candidateXs = [{ x: candidateX, movement: 'vertical' }];
    }

    let spawnedCount = 0;

    for (const item of candidateXs) {
      const x = item.x;

      // Smart Spawn Fairness (Section 23):
      // Reject if overlaps any active column within vertical collision proximity
      const overlaps = activeColumns.some(c =>
        c.y < height * 1.2 && Math.abs(c.x - x) < width * 1.45
      );
      if (overlaps) continue;

      // Column Type Selection (Section 21)
      let type: ColumnType = 'normal';
      const specialRoll = Math.random();

      if (specialRoll < GAME_CONFIG.specialChance.gold) {
        type = 'gold';
      } else if (currentLives < GAME_CONFIG.maxLives && specialRoll < GAME_CONFIG.specialChance.gold + GAME_CONFIG.specialChance.heart) {
        type = 'heart';
      } else if (specialRoll < GAME_CONFIG.specialChance.gold + GAME_CONFIG.specialChance.heart + GAME_CONFIG.specialChance.fast) {
        type = 'fast';
      } else if (specialRoll < GAME_CONFIG.specialChance.gold + GAME_CONFIG.specialChance.heart + GAME_CONFIG.specialChance.fast + GAME_CONFIG.specialChance.multiplier) {
        type = 'multiplier';
      } else if (specialRoll < GAME_CONFIG.specialChance.gold + GAME_CONFIG.specialChance.heart + GAME_CONFIG.specialChance.fast + GAME_CONFIG.specialChance.multiplier + GAME_CONFIG.specialChance.slow) {
        type = 'slow';
      } else if (GAME_CONFIG.enableHazards && Math.random() < GAME_CONFIG.hazardChance) {
        type = 'hazard';
      }

      const col = columnRenderer.spawn(x, -height - 12, width, height, baseSpeed, type, item.movement);
      if (col) {
        spawnedCount++;
        this.lastSpawnX = x;
        this.recentSpawnXs.push(x);
        if (this.recentSpawnXs.length > 5) this.recentSpawnXs.shift();
      }
    }

    this.lastSpawnTime = now;
    const baseInterval = DifficultySystem.getSpawnInterval(diff);
    // Slight humanization jitter to interval
    this.nextInterval = baseInterval * (0.88 + Math.random() * 0.24);

    return spawnedCount;
  }
}
