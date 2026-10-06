/**
 * GestureDetector.ts - Fast, Zero-Allocation Hand Gesture Classifier
 *
 * Classifies 21 landmarks into:
 *   - 'OPEN_HAND': all 5 fingers extended away from palm
 *   - 'CLOSED_HAND': all fingertips curled inwards toward palm (fist)
 *   - 'PINCH': thumb tip within close proximity to index tip
 *   - 'POINTING': index finger extended while other 3 fingers curled
 *   - 'UNKNOWN': transitional or unclassified
 */
import { Point2D, HandGesture } from './HandTypes';
import { distance } from '../utils/math';

export class GestureDetector {
  /**
   * Evaluates hand gesture without allocations or expensive math.
   */
  public static detectGesture(landmarks: Point2D[], handScale: number): HandGesture {
    if (landmarks.length < 21) return 'UNKNOWN';

    const wrist = landmarks[0];
    const thumbTip = landmarks[4];
    const indexMCP = landmarks[5];
    const indexTip = landmarks[8];
    const middleMCP = landmarks[9];
    const middleTip = landmarks[12];
    const ringMCP = landmarks[13];
    const ringTip = landmarks[16];
    const pinkyMCP = landmarks[17];
    const pinkyTip = landmarks[20];

    // Check pinch: thumb tip and index tip close together
    const pinchDist = distance(thumbTip.x, thumbTip.y, indexTip.x, indexTip.y);
    if (pinchDist < handScale * 0.35) {
      return 'PINCH';
    }

    // Determine extension of each finger (tip farther from wrist than MCP)
    const isIndexExtended = distance(wrist.x, wrist.y, indexTip.x, indexTip.y) >
                            distance(wrist.x, wrist.y, indexMCP.x, indexMCP.y) * 1.25;

    const isMiddleExtended = distance(wrist.x, wrist.y, middleTip.x, middleTip.y) >
                             distance(wrist.x, wrist.y, middleMCP.x, middleMCP.y) * 1.25;

    const isRingExtended = distance(wrist.x, wrist.y, ringTip.x, ringTip.y) >
                           distance(wrist.x, wrist.y, ringMCP.x, ringMCP.y) * 1.25;

    const isPinkyExtended = distance(wrist.x, wrist.y, pinkyTip.x, pinkyTip.y) >
                            distance(wrist.x, wrist.y, pinkyMCP.x, pinkyMCP.y) * 1.25;

    // Pointing: index extended, others curled
    if (isIndexExtended && !isMiddleExtended && !isRingExtended && !isPinkyExtended) {
      return 'POINTING';
    }

    // Closed hand (fist): all curled
    if (!isIndexExtended && !isMiddleExtended && !isRingExtended && !isPinkyExtended) {
      return 'CLOSED_HAND';
    }

    // Open hand: all fingers extended
    if (isIndexExtended && isMiddleExtended && isRingExtended && isPinkyExtended) {
      return 'OPEN_HAND';
    }

    return 'UNKNOWN';
  }
}
