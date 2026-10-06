/**
 * PlayerModel.ts - Real-Time AI Player Skill Profiler
 *
 * Continuously models the player's physical performance:
 *   - Left-side vs. Right-side catch accuracy and reaction latency
 *   - Gesture proficiency (Open hand, Fist/Grab, Pinch, Pointing)
 *   - Hand movement velocity and fatigue
 *   - Feeds real-time biometric metrics to the Difficulty Director
 */

export interface PlayerSpatialStats {
  leftAttempts: number;
  leftCatches: number;
  rightAttempts: number;
  rightCatches: number;
  centerAttempts: number;
  centerCatches: number;
  leftReactionAvg: number;
  rightReactionAvg: number;
  centerReactionAvg: number;
}

export interface PlayerGestureStats {
  openHandCatches: number;
  grabCatches: number;
  pinchCatches: number;
  pointingCatches: number;
  deflections: number;
}

export class PlayerModel {
  public spatial: PlayerSpatialStats = {
    leftAttempts: 0,
    leftCatches: 0,
    rightAttempts: 0,
    rightCatches: 0,
    centerAttempts: 0,
    centerCatches: 0,
    leftReactionAvg: 0.45,
    rightReactionAvg: 0.45,
    centerReactionAvg: 0.40
  };

  public gestures: PlayerGestureStats = {
    openHandCatches: 0,
    grabCatches: 0,
    pinchCatches: 0,
    pointingCatches: 0,
    deflections: 0
  };

  public recentHandSpeeds: number[] = [];
  public averageHandSpeed: number = 220;

  public reset(): void {
    this.spatial = {
      leftAttempts: 0,
      leftCatches: 0,
      rightAttempts: 0,
      rightCatches: 0,
      centerAttempts: 0,
      centerCatches: 0,
      leftReactionAvg: 0.45,
      rightReactionAvg: 0.45,
      centerReactionAvg: 0.40
    };
    this.gestures = {
      openHandCatches: 0,
      grabCatches: 0,
      pinchCatches: 0,
      pointingCatches: 0,
      deflections: 0
    };
    this.recentHandSpeeds = [];
    this.averageHandSpeed = 220;
  }

  public recordAttempt(x: number): void {
    if (x < 480) {
      this.spatial.leftAttempts++;
    } else if (x > 800) {
      this.spatial.rightAttempts++;
    } else {
      this.spatial.centerAttempts++;
    }
  }

  public recordCatch(x: number, reactionSec: number, pose: string, handSpeed: number): void {
    this.recordAttempt(x);

    if (x < 480) {
      this.spatial.leftCatches++;
      this.spatial.leftReactionAvg = (this.spatial.leftReactionAvg * 0.8) + (reactionSec * 0.2);
    } else if (x > 800) {
      this.spatial.rightCatches++;
      this.spatial.rightReactionAvg = (this.spatial.rightReactionAvg * 0.8) + (reactionSec * 0.2);
    } else {
      this.spatial.centerCatches++;
      this.spatial.centerReactionAvg = (this.spatial.centerReactionAvg * 0.8) + (reactionSec * 0.2);
    }

    if (pose === 'GRAB' || pose === 'FIST') {
      this.gestures.grabCatches++;
    } else if (pose === 'PINCH') {
      this.gestures.pinchCatches++;
    } else if (pose === 'POINTING') {
      this.gestures.pointingCatches++;
    } else {
      this.gestures.openHandCatches++;
    }

    this.recentHandSpeeds.push(handSpeed);
    if (this.recentHandSpeeds.length > 20) this.recentHandSpeeds.shift();
    this.averageHandSpeed = this.recentHandSpeeds.reduce((a, b) => a + b, 0) / this.recentHandSpeeds.length;
  }

  public recordDeflection(): void {
    this.gestures.deflections++;
  }

  /**
   * Identifies the player's weaker side for intelligent procedural challenge placement
   */
  public getChallengingSide(): 'left' | 'right' | 'center' | 'balanced' {
    const leftAcc = this.spatial.leftAttempts > 2 ? this.spatial.leftCatches / this.spatial.leftAttempts : 0.8;
    const rightAcc = this.spatial.rightAttempts > 2 ? this.spatial.rightCatches / this.spatial.rightAttempts : 0.8;

    if (leftAcc < rightAcc - 0.15 || this.spatial.leftReactionAvg > this.spatial.rightReactionAvg + 0.08) {
      return 'left';
    }
    if (rightAcc < leftAcc - 0.15 || this.spatial.rightReactionAvg > this.spatial.leftReactionAvg + 0.08) {
      return 'right';
    }
    return 'balanced';
  }

  public getHandControlRating(): number {
    const totalCatches = this.spatial.leftCatches + this.spatial.rightCatches + this.spatial.centerCatches;
    if (totalCatches === 0) return 85;

    const varietyScore = Math.min(20, (this.gestures.grabCatches + this.gestures.pinchCatches + this.gestures.deflections) * 4);
    const speedScore = Math.min(30, (this.averageHandSpeed / 350) * 30);
    const balanceScore = 50;

    return Math.min(99, Math.round(balanceScore + varietyScore * 0.5 + speedScore * 0.5));
  }
}
