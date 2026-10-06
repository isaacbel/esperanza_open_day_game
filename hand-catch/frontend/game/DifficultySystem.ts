/**
 * DifficultySystem.ts - Performance-Aware Hardcore Difficulty Engine
 *
 * Combines time elapsed with real-time player performance metrics:
 *   - Current accuracy (0–100%)
 *   - Active combo streak
 *   - Player reaction time
 *
 * Maps continuous game states to discrete and smooth Level Progression:
 *   LEVEL 1 — WARM UP
 *   LEVEL 2 — EASY
 *   LEVEL 3 — NORMAL
 *   LEVEL 4 — FAST
 *   LEVEL 5 — HARD
 *   LEVEL 6 — VERY HARD
 *   LEVEL 7 — EXTREME • FINAL PHASE
 *   LEVEL 8 — INSANE CLIMAX
 */
import { GAME_CONFIG, GameLevelDef } from './GameConfig';
import { lerp } from '../utils/math';

export class DifficultySystem {
  /**
   * Base continuous time-based difficulty curve (0..1)
   */
  public static getBaseDifficulty(elapsedTimeSec: number): number {
    return 1.0 - Math.exp(-elapsedTimeSec / GAME_CONFIG.difficultyTimeConstant);
  }

  /**
   * Adaptive continuous difficulty considering player performance
   */
  public static getAdaptiveDifficulty(
    elapsedTimeSec: number,
    accuracy: number = 100,
    currentCombo: number = 0,
    avgReactionTimeSec: number = 0.42
  ): number {
    const baseDiff = this.getBaseDifficulty(elapsedTimeSec);

    // Performance modifier: [-0.15, +0.18]
    let perfMod = 0;

    // High accuracy & combo boosts difficulty slightly
    if (accuracy > 90 && currentCombo >= 6) {
      perfMod += 0.06;
    }
    if (currentCombo >= 15) {
      perfMod += 0.06;
    }
    if (currentCombo >= 30) {
      perfMod += 0.06;
    }
    if (avgReactionTimeSec < 0.32 && elapsedTimeSec > 12) {
      perfMod += 0.04;
    }

    // Low accuracy (< 70%) or struggling slows difficulty
    if (accuracy < 68) {
      perfMod -= 0.08;
    }
    if (accuracy < 50) {
      perfMod -= 0.08;
    }

    return Math.max(0.05, Math.min(1.0, baseDiff + perfMod));
  }

  /**
   * Resolves the active GameLevelDef based on elapsed time and performance
   */
  public static getLevelDef(
    elapsedTimeSec: number,
    accuracy: number = 100,
    currentCombo: number = 0
  ): GameLevelDef {
    const levels = GAME_CONFIG.levels;
    let activeLevel = levels[0];

    // Find the highest level matching elapsed time
    for (let i = levels.length - 1; i >= 0; i--) {
      if (elapsedTimeSec >= levels[i].minTimeSec) {
        activeLevel = levels[i];
        break;
      }
    }

    // If player has massive combo (> 30), promote level tier by 1 for extra challenge
    if (currentCombo >= 35 && activeLevel.level < 8) {
      const promotedIdx = levels.findIndex(l => l.level === (activeLevel.level + 1));
      if (promotedIdx !== -1) {
        return levels[promotedIdx];
      }
    }

    return activeLevel;
  }

  public static getFallSpeed(difficulty: number): number {
    return lerp(GAME_CONFIG.initialObjectSpeed, GAME_CONFIG.maximumObjectSpeed, difficulty);
  }

  public static getSpawnInterval(difficulty: number): number {
    return lerp(GAME_CONFIG.spawnInterval, GAME_CONFIG.minimumSpawnInterval, difficulty);
  }

  public static getMaxObjects(difficulty: number): number {
    return Math.floor(lerp(GAME_CONFIG.initialMaxObjects, GAME_CONFIG.finalMaxObjects, difficulty));
  }

  public static getColumnWidth(difficulty: number): number {
    return Math.round(lerp(GAME_CONFIG.initialObjectWidth, GAME_CONFIG.minimumObjectWidth, difficulty));
  }

  public static getColumnHeight(difficulty: number): number {
    return Math.round(lerp(GAME_CONFIG.initialObjectHeight, GAME_CONFIG.minimumObjectHeight, difficulty));
  }
}
