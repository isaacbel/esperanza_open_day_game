/**
 * VelocityPredictor.ts - Real-Time Velocity Estimation & Latency-Compensating Prediction
 *
 * Estimates hand velocity in pixels/second, tracks speed and normalized direction,
 * and projects a near-future position (30ms - 80ms adaptive window) to neutralize
 * webcam camera sensor latency and pipeline latency.
 */
import { Point2D } from './HandTypes';

export interface VelocityState {
  vx: number;        // px / sec
  vy: number;        // px / sec
  speed: number;     // px / sec
  dirX: number;      // normalized [-1, 1]
  dirY: number;      // normalized [-1, 1]
  predicted: Point2D;
}

export class VelocityPredictor {
  private vx: number = 0;
  private vy: number = 0;
  private speed: number = 0;
  private dirX: number = 0;
  private dirY: number = 0;

  // Smoothing factor for velocity calculation to prevent derivative noise
  // 0.22: less lag on fast swipes vs previous 0.35, while still dampening single-frame spikes
  private velocitySmoothing: number = 0.22;

  // Prediction configuration (milliseconds)
  public minPredictionMs: number = 30;
  public maxPredictionMs: number = 80;

  public update(current: Point2D, previous: Point2D, dtSec: number): VelocityState {
    const dt = Math.max(0.001, dtSec);

    // Instantaneous raw velocity
    const rawVx = (current.x - previous.x) / dt;
    const rawVy = (current.y - previous.y) / dt;

    // Exponentially smooth velocity to reject landmark micro-jitter
    this.vx = this.vx * this.velocitySmoothing + rawVx * (1 - this.velocitySmoothing);
    this.vy = this.vy * this.velocitySmoothing + rawVy * (1 - this.velocitySmoothing);

    this.speed = Math.hypot(this.vx, this.vy);

    if (this.speed > 5) {
      this.dirX = this.vx / this.speed;
      this.dirY = this.vy / this.speed;
    } else {
      this.dirX = 0;
      this.dirY = 0;
    }

    // Adaptive prediction window:
    // When moving slowly, predict shorter (~30ms) to prevent overshoot.
    // When swiping fast (> 400 px/s), scale up to ~80ms to lead the motion.
    const speedRatio = Math.min(1.0, this.speed / 800);
    const predictionMs = this.minPredictionMs + (this.maxPredictionMs - this.minPredictionMs) * speedRatio;
    const predictionSec = predictionMs / 1000;

    // Settle dampener: if speed is below threshold, quickly decay prediction towards current pos
    const settle = this.speed < 10 ? 0 : 1.0;

    const predicted: Point2D = {
      x: current.x + this.vx * predictionSec * settle,
      y: current.y + this.vy * predictionSec * settle
    };

    return {
      vx: this.vx,
      vy: this.vy,
      speed: this.speed,
      dirX: this.dirX,
      dirY: this.dirY,
      predicted
    };
  }

  /**
   * Projects any secondary point (e.g. Fingertip) using the calculated velocity vector.
   */
  public predictPoint(point: Point2D): Point2D {
    if (this.speed < 20) return { x: point.x, y: point.y };
    const speedRatio = Math.min(1.0, this.speed / 800);
    const predictionSec = (this.minPredictionMs + (this.maxPredictionMs - this.minPredictionMs) * speedRatio) / 1000;
    return {
      x: point.x + this.vx * predictionSec,
      y: point.y + this.vy * predictionSec
    };
  }

  public reset(): void {
    this.vx = 0;
    this.vy = 0;
    this.speed = 0;
    this.dirX = 0;
    this.dirY = 0;
  }
}
