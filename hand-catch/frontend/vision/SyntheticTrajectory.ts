/**
 * SyntheticTrajectory.ts - Synthetic Trajectory Generator for Headless / Developer Testing
 *
 * Generates continuous synthetic hand movements to test:
 *   - 'straight': linear horizontal and vertical sweeps
 *   - 'circle': smooth orbital arcs
 *   - 'zigzag': sharp cornering stress test for velocity and 1€ filter
 *   - 'fast': rapid swipe testing (> 1200 px/sec) to verify swept collision & prediction
 *   - 'twoHandsCrossing': two hands moving past each other to verify HandIdentityTracker
 */
import { Point2D, TrackedHandData } from './HandTypes';

export type SyntheticPattern = 'straight' | 'circle' | 'zigzag' | 'fast' | 'twoHandsCrossing';

export class SyntheticTrajectory {
  private startTime: number = performance.now();

  public getHands(pattern: SyntheticPattern, now: number = performance.now()): TrackedHandData[] {
    const t = (now - this.startTime) / 1000;

    switch (pattern) {
      case 'straight': {
        const x = 640 + Math.sin(t * 1.5) * 320;
        const y = 460 + Math.cos(t * 0.8) * 80;
        return [this.createHand(1, 0, x, y, '#00f0ff', 'Hand 1')];
      }

      case 'circle': {
        const x = 640 + Math.cos(t * 2) * 240;
        const y = 420 + Math.sin(t * 2) * 160;
        return [this.createHand(1, 0, x, y, '#00f0ff', 'Hand 1')];
      }

      case 'zigzag': {
        const phase = (t * 1.8) % 4;
        let x = 640;
        let y = 450;
        if (phase < 1) {
          x = 380 + phase * 520;
          y = 380 + phase * 160;
        } else if (phase < 2) {
          x = 900 - (phase - 1) * 520;
          y = 540 - (phase - 1) * 160;
        } else if (phase < 3) {
          x = 380 + (phase - 2) * 520;
          y = 380 + (phase - 2) * 80;
        } else {
          x = 900 - (phase - 3) * 520;
          y = 460 - (phase - 3) * 80;
        }
        return [this.createHand(1, 0, x, y, '#00f0ff', 'Hand 1')];
      }

      case 'fast': {
        // High speed sweeps (> 1500 px/s)
        const x = 640 + Math.sin(t * 4.5) * 450;
        const y = 440 + Math.cos(t * 2.2) * 90;
        return [this.createHand(1, 0, x, y, '#00f0ff', 'Fast Hand')];
      }

      case 'twoHandsCrossing': {
        // Hand 1 moves Left -> Right -> Left
        // Hand 2 moves Right -> Left -> Right
        // They cross in the center at x=640
        const x1 = 640 + Math.sin(t * 1.4) * 340;
        const y1 = 440 + Math.sin(t * 2.8) * 40;

        const x2 = 640 - Math.sin(t * 1.4) * 340;
        const y2 = 440 - Math.sin(t * 2.8) * 40;

        return [
          this.createHand(1, 0, x1, y1, '#00f0ff', 'Right'),
          this.createHand(2, 1, x2, y2, '#ff00b7', 'Left')
        ];
      }
    }
  }

  private createHand(
    trackId: number,
    index: number,
    x: number,
    y: number,
    color: string,
    handedness: string
  ): TrackedHandData {
    return {
      trackId,
      index,
      active: true,
      isGhost: false,
      opacity: 1.0,
      color,
      colorGlow: index === 0 ? 'rgba(0, 240, 255, 0.45)' : 'rgba(255, 0, 183, 0.45)',
      handedness,
      scale: 65,
      vx: 0,
      vy: 0,
      speed: 0,
      gesture: 'OPEN_HAND',
      pose: 'OPEN_HAND',
      confidence: 0.95,
      depthEstimate: 0.4,
      ax: 0,
      ay: 0,
      acceleration: 0,
      openness: 0.9,
      orientation: { normalX: 0, normalY: 1, facingCamera: true, rollAngle: 0, tiltAngle: 0 },
      fingers: [],
      movement: 'IDLE' as const,
      reachingScore: 0,
      stabilityScore: 1.0,
      palm: {
        x,
        y,
        prevX: x,
        prevY: y,
        radius: 56
      },
      predictedPalm: { x, y },
      fingertips: [
        { x: x - 32, y: y - 48, prevX: x - 32, prevY: y - 48, radius: 24 },
        { x: x - 16, y: y - 65, prevX: x - 16, prevY: y - 65, radius: 24 },
        { x: x + 4,  y: y - 68, prevX: x + 4,  prevY: y - 68, radius: 24 },
        { x: x + 22, y: y - 60, prevX: x + 22, prevY: y - 60, radius: 24 },
        { x: x + 38, y: y - 44, prevX: x + 38, prevY: y - 44, radius: 24 }
      ],
      predictedFingertips: [
        { x: x - 32, y: y - 48 },
        { x: x - 16, y: y - 65 },
        { x: x + 4,  y: y - 68 },
        { x: x + 22, y: y - 60 },
        { x: x + 38, y: y - 44 }
      ],
      landmarks: [],
      landmarks3D: [],
      history: [],
    };
  }
}
