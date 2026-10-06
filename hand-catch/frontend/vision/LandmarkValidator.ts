/**
 * LandmarkValidator.ts - Strict MediaPipe Landmark & Frame Validation
 *
 * Rejects:
 *   1. NaN / Infinite coordinates
 *   2. Coordinates wildly outside viewport ([ -0.2, 1.2 ] bounds)
 *   3. Anatomically impossible hand scales (too miniature < 0.02 or gigantically distorted > 0.95)
 *   4. Instantaneous teleport jumps (> 480px displacement without matching velocity)
 *   5. Low detection confidence frames
 */
import { Point2D } from './HandTypes';
import { distance } from '../utils/math';

export interface RawLandmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export class LandmarkValidator {
  private static readonly MAX_DISPLACEMENT_PX = 480;
  private static readonly MIN_CONFIDENCE = 0.45;

  /**
   * Validates raw MediaPipe normalized landmarks before transformation.
   */
  public static isValidRawHand(landmarks: RawLandmark[], score?: number): boolean {
    if (!landmarks || landmarks.length !== 21) return false;

    // Check confidence threshold if provided
    if (typeof score === 'number' && score < this.MIN_CONFIDENCE) {
      return false;
    }

    // Check all landmarks are finite and within reasonable bounds
    for (let i = 0; i < 21; i++) {
      const lm = landmarks[i];
      if (
        !Number.isFinite(lm.x) ||
        !Number.isFinite(lm.y) ||
        lm.x < -0.25 || lm.x > 1.25 ||
        lm.y < -0.25 || lm.y > 1.25
      ) {
        return false;
      }
    }

    // Check normalized anatomical scale between wrist (0) and middle MCP (9)
    const wrist = landmarks[0];
    const middleMCP = landmarks[9];
    const normDist = Math.hypot(wrist.x - middleMCP.x, wrist.y - middleMCP.y);

    // If wrist to middle MCP is < 0.03 (tiny artifact) or > 0.7 (distorted whole-frame bug), reject
    if (normDist < 0.03 || normDist > 0.70) {
      return false;
    }

    return true;
  }

  /**
   * Validates whether a candidate detection is physically consistent with an existing track.
   * Prevents erratic teleport jumps across the canvas in a single frame.
   */
  public static isPlausibleDisplacement(
    candidatePalm: Point2D,
    previousPalm: Point2D,
    dtSec: number
  ): boolean {
    const dist = distance(candidatePalm.x, candidatePalm.y, previousPalm.x, previousPalm.y);
    if (dist <= 120) return true;

    // If distance > 120px, check if velocity is within human physical swipe limits (~2800 px/s)
    const effectiveDt = Math.max(0.016, dtSec);
    const impliedSpeed = dist / effectiveDt;

    if (dist > this.MAX_DISPLACEMENT_PX && impliedSpeed > 3200) {
      // Impossible frame teleport (e.g., glitch detecting a background object as a hand)
      return false;
    }

    return true;
  }
}
