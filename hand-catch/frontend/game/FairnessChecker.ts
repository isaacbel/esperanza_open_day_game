/**
 * FairnessChecker.ts - Biomechanical Reachability & Anti-Overlap Guardian
 *
 * Guarantees that every spawn pattern remains 100% humanly catchable:
 *   1. No vertical column overlapping / impossible stacked blocks.
 *   2. Reachability validation based on active hand count, positions, and maximum human hand speed.
 *   3. Reaction time verification: ensures time-to-catch-line >= human reaction window.
 *   4. Single-hand jump damping (prevents impossible 1000px teleportation requirements).
 */
import { FallingColumnData } from './ColumnRenderer';
import { TrackedHandData } from '../vision/HandTypes';
import { GAME_CONFIG } from './GameConfig';

export class FairnessChecker {
  private static readonly MAX_HUMAN_HAND_SPEED_PX_S = 1800; // max physical reach speed
  private static readonly BASE_HUMAN_REACTION_SEC = 0.26;
  private static readonly INSANE_HUMAN_REACTION_SEC = 0.14;

  /**
   * Validates if a proposed column spawn is fair and physically catchable
   */
  public static isSpawnFair(
    x: number,
    vy: number,
    width: number,
    height: number,
    activeColumns: FallingColumnData[],
    trackedHands: TrackedHandData[],
    difficulty: number,
    lastSpawnX: number
  ): boolean {
    const floorY = GAME_CONFIG.arena.floorY;
    const timeToFloor = Math.max(0.1, (floorY - 0) / vy);

    // 1. Reaction Time Floor Check
    const minReactionTime =
      this.BASE_HUMAN_REACTION_SEC -
      difficulty * (this.BASE_HUMAN_REACTION_SEC - this.INSANE_HUMAN_REACTION_SEC);

    if (timeToFloor < minReactionTime) {
      return false;
    }

    // 2. Vertical / Lane Overlap Check
    // Reject if another active column is falling in the exact same lane too close behind/ahead
    for (const col of activeColumns) {
      if (col.state !== 'falling') continue;
      const xDist = Math.abs(col.x - x);
      const minXSpacing = (col.width + width) * 0.58;

      if (xDist < minXSpacing) {
        // If within the same lane, ensure at least 1.6x height distance
        if (col.y < height * 1.6) {
          return false;
        }
      }
    }

    // 3. Biomechanical Reachability Check
    const activeHands = trackedHands.filter(h => h.active && !h.isGhost);

    if (activeHands.length === 0) {
      // No hands tracked (fallback to gentle single-hand jump damping)
      const maxJumpPx = 480 + difficulty * 240;
      if (Math.abs(x - lastSpawnX) > maxJumpPx) {
        return false;
      }
      return true;
    }

    if (activeHands.length === 1) {
      // Single hand active: check if this hand can reach the target X before the column hits floor
      const hand = activeHands[0];
      const dist = Math.abs(hand.palm.x - x);
      const timeNeeded = dist / this.MAX_HUMAN_HAND_SPEED_PX_S + minReactionTime * 0.7;

      if (timeNeeded > timeToFloor * 1.15) {
        // Hand would need superhuman velocity to reach this location
        return false;
      }
    }

    // 4. Two or more hands active: check if at least ONE hand is within viable intercept range
    let anyHandViable = false;
    for (const hand of activeHands) {
      const dist = Math.abs(hand.palm.x - x);
      const timeNeeded = dist / this.MAX_HUMAN_HAND_SPEED_PX_S + minReactionTime * 0.6;
      if (timeNeeded <= timeToFloor * 1.25) {
        anyHandViable = true;
        break;
      }
    }

    return anyHandViable;
  }

  /**
   * Adjusts a candidate X position to the closest fair X coordinate if slightly out of bounds
   */
  public static clampToFairArena(x: number, width: number): number {
    const minX = GAME_CONFIG.arena.centerX - GAME_CONFIG.arena.radiusX * 0.82 + width * 0.5;
    const maxX = GAME_CONFIG.arena.centerX + GAME_CONFIG.arena.radiusX * 0.82 - width * 0.5;
    return Math.max(minX, Math.min(maxX, x));
  }
}
