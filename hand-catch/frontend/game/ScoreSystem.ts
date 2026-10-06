/**
 * ScoreSystem.ts - Combo Multiplier, Reaction Time Measurement, and Performance Rating
 *
 * Implements:
 *   - Hardcore combo milestones: 5, 10, 20, 30, 50, 75, 100
 *   - Player reaction time tracking (spawn-to-catch delay)
 *   - Objects per minute (OPM) calculation
 *   - Highest difficulty level reached
 *   - Level multiplier bonuses (surviving higher levels pays much more)
 *   - Star performance rating (1 to 5 stars)
 */
import { GAME_CONFIG } from './GameConfig';

export class ScoreSystem {
  public score: number = 0;
  public displayScore: number = 0;
  public combo: number = 0;
  public maxCombo: number = 0;
  public caught: number = 0;
  public missed: number = 0;
  public totalSpawned: number = 0;
  public comboScale: number = 1.0;
  public highestLevelName: string = 'LEVEL 1 — WARM UP';
  public highestLevelNumber: number = 1;

  // Reaction time samples (in seconds)
  public reactionTimes: number[] = [];
  public averageReactionTime: number = 0.42;
  public bestReactionTime: number = 0.42;

  // Milestone triggers
  private static readonly MILESTONES = [5, 10, 20, 30, 50, 75, 100];

  public reset(): void {
    this.score = 0;
    this.displayScore = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.caught = 0;
    this.missed = 0;
    this.totalSpawned = 0;
    this.comboScale = 1.0;
    this.highestLevelName = 'LEVEL 1 — WARM UP';
    this.highestLevelNumber = 1;
    this.reactionTimes = [];
    this.averageReactionTime = 0.42;
    this.bestReactionTime = 999;
  }

  public recordLevel(levelNum: number, name: string, subtitle: string): void {
    if (levelNum > this.highestLevelNumber) {
      this.highestLevelNumber = levelNum;
      this.highestLevelName = `${name} — ${subtitle}`;
    }
  }

  public getComboMultiplier(): number {
    const mult = 1 + Math.floor(this.combo / GAME_CONFIG.comboStep) * GAME_CONFIG.comboMultiplierIncrement;
    return Math.min(GAME_CONFIG.comboCap, mult);
  }

  public boostCombo(amount: number = 3): void {
    this.combo += amount;
    if (this.combo > this.maxCombo) {
      this.maxCombo = this.combo;
    }
    this.comboScale = 1.6;
  }

  public registerCatch(
    typeMultiplier: number = 1,
    spawnTime: number = 0,
    catchTime: number = performance.now(),
    levelMultiplierBonus: number = 1.0
  ): { points: number; multiplier: number; isMilestone: boolean } {
    this.caught++;
    this.combo++;
    if (this.combo > this.maxCombo) {
      this.maxCombo = this.combo;
    }
    this.comboScale = 1.45;

    // Track reaction time
    if (spawnTime > 0) {
      const reactionSec = Math.max(0.10, Math.min(1.8, (catchTime - spawnTime) / 1000));
      this.reactionTimes.push(reactionSec);
      if (reactionSec < this.bestReactionTime) {
        this.bestReactionTime = Math.round(reactionSec * 100) / 100;
      }
      if (this.reactionTimes.length > 25) this.reactionTimes.shift();

      const sum = this.reactionTimes.reduce((a, b) => a + b, 0);
      this.averageReactionTime = Math.round((sum / this.reactionTimes.length) * 100) / 100;
    }

    const multiplier = this.getComboMultiplier();
    const points = Math.round(GAME_CONFIG.baseScore * typeMultiplier * multiplier * levelMultiplierBonus);
    this.score += points;

    const isMilestone = ScoreSystem.MILESTONES.includes(this.combo);
    return { points, multiplier, isMilestone };
  }

  public registerMiss(): void {
    this.missed++;
    this.combo = 0;
    this.comboScale = 1.0;
  }

  public getAccuracy(): number {
    if (this.totalSpawned === 0) return 100;
    return Math.round((this.caught / this.totalSpawned) * 100);
  }

  public getObjectsPerMinute(elapsedSec: number): number {
    if (elapsedSec <= 1) return 0;
    return Math.round((this.caught / elapsedSec) * 60);
  }

  public getPerformanceRating(): string {
    const acc = this.getAccuracy();
    const mc = this.maxCombo;
    if (acc >= 90 && mc >= 25) return '★★★★★';
    if (acc >= 82 && mc >= 15) return '★★★★☆';
    if (acc >= 70 && mc >= 8)  return '★★★☆☆';
    if (acc >= 55)             return '★★☆☆☆';
    return '★☆☆☆☆';
  }

  public addScore(amount: number): void {
    this.score += amount;
  }

  public updateDisplayScore(dt: number): void {
    if (this.displayScore < this.score) {
      this.displayScore = Math.min(
        this.score,
        Math.round(this.displayScore + (this.score - this.displayScore) * 0.22 + 1)
      );
    }
    if (this.comboScale > 1.0) {
      this.comboScale = Math.max(1.0, this.comboScale - dt * 3.5);
    }
  }
}
