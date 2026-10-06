/**
 * MovementClassifier.ts - Temporal Human Movement Analyzer
 *
 * Analyzes a sliding window of recent hand positions to understand
 * HOW the hand is moving, not just WHERE it is.
 *
 * Classifies:
 *   - IDLE: hand barely moving
 *   - MOVING_LEFT/RIGHT/UP/DOWN: sustained directional movement
 *   - SWIPE_LEFT/RIGHT/UP/DOWN: fast burst in one direction
 *   - FAST_REACH: rapid movement toward an object
 *   - MOVING_TOWARD/AWAY_CAMERA: depth movement via scale change
 *
 * Also computes:
 *   - Reaching score: probability player is reaching for a specific target
 *   - Stability score: position variance (low = stable, high = jittery)
 *   - Acceleration magnitude
 */
import { MovementClass, HandFrame } from './HandTypes';

// Thresholds (in game-space pixels/second)
const SWIPE_MIN_SPEED = 550;          // Must be faster than this to count as swipe
const SWIPE_MIN_DURATION_MS = 60;     // Swipe must sustain at least this long
const SWIPE_MAX_DURATION_MS = 350;    // Swipe must complete within this window
const MOVING_MIN_SPEED = 60;          // Below this = IDLE
const FAST_REACH_SPEED = 280;         // Fast reach threshold
const DEPTH_SCALE_THRESHOLD = 0.025;  // Scale change ratio to detect depth movement

const HISTORY_MAX = 30;               // Frames to keep in buffer

export interface MovementState {
  movement: MovementClass;
  reachingScore: number;    // 0.0-1.0: probability the hand is reaching toward a target
  stabilityScore: number;   // 0.0-1.0: how stable/jitter-free the position is
  ax: number;               // Smoothed acceleration X (px/s²)
  ay: number;               // Smoothed acceleration Y (px/s²)
  acceleration: number;     // Total acceleration magnitude
}

export interface ReachTarget {
  x: number;
  y: number;
  vx: number; // Target's velocity
  vy: number;
}

export class MovementClassifier {
  private history: HandFrame[] = [];
  private prevVx: number = 0;
  private prevVy: number = 0;
  private ax: number = 0;
  private ay: number = 0;

  /**
   * Feed a new frame into the classifier.
   * Call once per tracking update.
   */
  public addFrame(frame: HandFrame): void {
    this.history.push(frame);
    if (this.history.length > HISTORY_MAX) {
      this.history.shift();
    }
  }

  /**
   * Classify the current movement state from temporal history.
   * @param currentVx  Current horizontal velocity (px/s)
   * @param currentVy  Current vertical velocity (px/s)
   * @param targets    Optional list of falling objects to compute reaching score
   */
  public classify(
    currentVx: number,
    currentVy: number,
    targets?: ReachTarget[]
  ): MovementState {
    const n = this.history.length;

    // Need at least 3 frames to do anything useful
    if (n < 3) {
      return this.idleState();
    }

    // Compute smoothed acceleration
    const dtAcc = Math.max(0.001, (this.history[n - 1].timestamp - this.history[n - 2].timestamp) / 1000);
    const rawAx = (currentVx - this.prevVx) / dtAcc;
    const rawAy = (currentVy - this.prevVy) / dtAcc;
    this.ax = this.ax * 0.6 + rawAx * 0.4;
    this.ay = this.ay * 0.6 + rawAy * 0.4;
    this.prevVx = currentVx;
    this.prevVy = currentVy;

    const totalAcc = Math.hypot(this.ax, this.ay);
    const speed = Math.hypot(currentVx, currentVy);

    // Stability: measure position variance over last 8 frames
    const stabilityScore = this.computeStability();

    // Check for swipe gesture in recent history
    const swipe = this.detectSwipe();
    if (swipe !== null) {
      const reachingScore = targets ? this.computeReachingScore(currentVx, currentVy, targets) : 0;
      return { movement: swipe, reachingScore, stabilityScore, ax: this.ax, ay: this.ay, acceleration: totalAcc };
    }

    // Classify sustained directional movement
    const movement = this.classifyDirection(speed, currentVx, currentVy, n);

    // Reaching score: when moving fast toward a target
    const reachingScore = targets ? this.computeReachingScore(currentVx, currentVy, targets) : 0;

    return { movement, reachingScore, stabilityScore, ax: this.ax, ay: this.ay, acceleration: totalAcc };
  }

  /**
   * Detect a swipe gesture over the last SWIPE_MAX_DURATION_MS window.
   * A swipe is a fast, directionally-dominant burst.
   */
  private detectSwipe(): MovementClass | null {
    const now = this.history[this.history.length - 1].timestamp;

    // Collect frames within the swipe window
    const window = this.history.filter(f => now - f.timestamp <= SWIPE_MAX_DURATION_MS);
    if (window.length < 3) return null;

    const first = window[0];
    const last  = window[window.length - 1];
    const dt = (last.timestamp - first.timestamp) / 1000;
    if (dt < SWIPE_MIN_DURATION_MS / 1000) return null;

    const dx = last.palmX - first.palmX;
    const dy = last.palmY - first.palmY;
    const dist = Math.hypot(dx, dy);
    const avgSpeed = dist / dt;

    if (avgSpeed < SWIPE_MIN_SPEED) return null;

    // Determine dominant axis
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const axisDominance = Math.max(absX, absY) / (Math.min(absX, absY) + 1);

    // Must be at least 1.5x more movement on dominant axis (directional swipe)
    if (axisDominance < 1.5) return null;

    if (absX > absY) {
      return dx < 0 ? 'SWIPE_LEFT' : 'SWIPE_RIGHT';
    } else {
      return dy < 0 ? 'SWIPE_UP' : 'SWIPE_DOWN';
    }
  }

  /**
   * Classify the general direction of sustained movement.
   */
  private classifyDirection(
    speed: number,
    vx: number,
    vy: number,
    n: number
  ): MovementClass {
    if (speed < MOVING_MIN_SPEED) return 'IDLE';

    // Look at scale change for depth movement (5-frame window)
    if (n >= 5) {
      const oldest = this.history[n - 5];
      const newest = this.history[n - 1];
      const scaleChange = (newest.scale - oldest.scale) / (oldest.scale + 1);
      if (Math.abs(scaleChange) > DEPTH_SCALE_THRESHOLD) {
        return scaleChange > 0 ? 'MOVING_TOWARD_CAMERA' : 'MOVING_AWAY_CAMERA';
      }
    }

    if (speed >= FAST_REACH_SPEED) {
      // Fast movement — classify as fast reach or directional
      const absX = Math.abs(vx);
      const absY = Math.abs(vy);
      if (absX > absY * 1.3) return vx < 0 ? 'MOVING_LEFT' : 'MOVING_RIGHT';
      if (absY > absX * 1.3) return vy < 0 ? 'MOVING_UP' : 'MOVING_DOWN';
      return 'FAST_REACH';
    }

    // Normal directional movement
    const absX = Math.abs(vx);
    const absY = Math.abs(vy);
    if (absX > absY * 1.2) return vx < 0 ? 'MOVING_LEFT' : 'MOVING_RIGHT';
    if (absY > absX * 1.2) return vy < 0 ? 'MOVING_UP' : 'MOVING_DOWN';

    // Diagonal — pick strongest axis
    return absX > absY ? (vx < 0 ? 'MOVING_LEFT' : 'MOVING_RIGHT')
                       : (vy < 0 ? 'MOVING_UP' : 'MOVING_DOWN');
  }

  /**
   * Compute reaching score: probability that the hand is intentionally
   * moving toward a target (falling object).
   *
   * Factors:
   *   1. Hand velocity direction aligns with hand→target vector
   *   2. Hand is accelerating toward target
   *   3. Distance is decreasing over time
   */
  public computeReachingScore(
    vx: number,
    vy: number,
    targets: ReachTarget[]
  ): number {
    if (!targets.length || this.history.length < 2) return 0;

    const current = this.history[this.history.length - 1];
    const speed = Math.hypot(vx, vy);
    if (speed < 30) return 0; // Not moving = not reaching

    let bestScore = 0;

    for (const target of targets) {
      // Direction from hand to target
      const toTargetX = target.x - current.palmX;
      const toTargetY = target.y - current.palmY;
      const toTargetDist = Math.hypot(toTargetX, toTargetY);

      if (toTargetDist < 1) continue;

      // Dot product of velocity and hand→target direction (cosine similarity)
      const alignment = (vx * toTargetX + vy * toTargetY) / (speed * toTargetDist);

      // Is the distance decreasing? Check last 5 frames
      let distDecreasing = false;
      if (this.history.length >= 5) {
        const prev = this.history[this.history.length - 5];
        const prevDist = Math.hypot(target.x - prev.palmX, target.y - prev.palmY);
        distDecreasing = toTargetDist < prevDist;
      }

      // Score = alignment (0..1) * speed factor * distance-decrease bonus
      const speedFactor = Math.min(1.0, speed / 400);
      const score = Math.max(0, alignment) * speedFactor * (distDecreasing ? 1.3 : 0.7);

      bestScore = Math.max(bestScore, Math.min(1.0, score));
    }

    return bestScore;
  }

  /**
   * Compute position stability over the last 8 frames.
   * Returns 1.0 for perfectly stable, 0.0 for very jittery.
   */
  private computeStability(): number {
    const n = this.history.length;
    const windowSize = Math.min(8, n);
    if (windowSize < 2) return 1.0;

    const window = this.history.slice(n - windowSize);
    const meanX = window.reduce((s, f) => s + f.palmX, 0) / windowSize;
    const meanY = window.reduce((s, f) => s + f.palmY, 0) / windowSize;

    const variance = window.reduce((s, f) => {
      return s + (f.palmX - meanX) ** 2 + (f.palmY - meanY) ** 2;
    }, 0) / windowSize;

    // Map variance: 0 = stable (1.0), 400+ = unstable (0.0)
    return Math.max(0.0, 1.0 - variance / 400);
  }

  public reset(): void {
    this.history = [];
    this.prevVx = 0;
    this.prevVy = 0;
    this.ax = 0;
    this.ay = 0;
  }

  public getHistory(): HandFrame[] {
    return this.history;
  }

  private idleState(): MovementState {
    return { movement: 'IDLE', reachingScore: 0, stabilityScore: 1, ax: 0, ay: 0, acceleration: 0 };
  }
}
