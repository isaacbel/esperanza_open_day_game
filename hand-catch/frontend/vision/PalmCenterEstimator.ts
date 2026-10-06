/**
 * PalmCenterEstimator.ts - Stable Weighted Palm Center & Hand Scale Calculation
 *
 * Formula:
 *   palmCenter = wrist * 0.15 + indexMCP * 0.20 + middleMCP * 0.30 + ringMCP * 0.20 + pinkyMCP * 0.15
 *
 * Landmark Indices in MediaPipe:
 *   0: Wrist
 *   5: Index MCP
 *   9: Middle MCP
 *   13: Ring MCP
 *   17: Pinky MCP
 */
import { Point2D } from './HandTypes';
import { distance } from '../utils/math';

export class PalmCenterEstimator {
  private static readonly WEIGHT_WRIST = 0.15;
  private static readonly WEIGHT_INDEX_MCP = 0.20;
  private static readonly WEIGHT_MIDDLE_MCP = 0.30;
  private static readonly WEIGHT_RING_MCP = 0.20;
  private static readonly WEIGHT_PINKY_MCP = 0.15;

  /**
   * Calculates a rock-solid, weighted biomechanical palm center.
   */
  public static calculatePalmCenter(landmarks: Point2D[]): Point2D {
    if (landmarks.length < 21) {
      return { x: 640, y: 360 };
    }

    const wrist = landmarks[0];
    const indexMCP = landmarks[5];
    const middleMCP = landmarks[9];
    const ringMCP = landmarks[13];
    const pinkyMCP = landmarks[17];

    const x =
      wrist.x * this.WEIGHT_WRIST +
      indexMCP.x * this.WEIGHT_INDEX_MCP +
      middleMCP.x * this.WEIGHT_MIDDLE_MCP +
      ringMCP.x * this.WEIGHT_RING_MCP +
      pinkyMCP.x * this.WEIGHT_PINKY_MCP;

    const y =
      wrist.y * this.WEIGHT_WRIST +
      indexMCP.y * this.WEIGHT_INDEX_MCP +
      middleMCP.y * this.WEIGHT_MIDDLE_MCP +
      ringMCP.y * this.WEIGHT_RING_MCP +
      pinkyMCP.y * this.WEIGHT_PINKY_MCP;

    return { x, y };
  }

  /**
   * Calculates hand scale based on distance between wrist and middle MCP.
   * Clamped to realistic anatomical ranges in game pixels.
   */
  public static calculateHandScale(landmarks: Point2D[]): number {
    if (landmarks.length < 21) return 60;
    const wrist = landmarks[0];
    const middleMCP = landmarks[9];
    const dist = distance(wrist.x, wrist.y, middleMCP.x, middleMCP.y);
    return Math.max(25, Math.min(180, dist));
  }
}
