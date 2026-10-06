/**
 * HandPoseAnalyzer.ts - Full Human Hand Geometry Analyzer
 *
 * Understands the hand as a physical 3D object, not just a 2D point.
 * Analyzes:
 *   - All 21 landmark positions (2D + relative Z)
 *   - Each finger's extension using PIP/DIP joint angles
 *   - Palm orientation via cross-product of basis vectors
 *   - Relative depth from Z landmarks + hand scale
 *   - Openness score (0=fist, 1=fully spread)
 *   - Pose classification (OPEN, GRAB, FIST, REACHING, etc.)
 *   - Stability score from temporal variance
 */
import { Point2D, Point3D, HandPose, FingerState, PalmOrientation } from './HandTypes';

// MediaPipe hand landmark indices
// Wrist=0, Thumb: 1-4, Index: 5-8, Middle: 9-12, Ring: 13-16, Pinky: 17-20
const IDX = {
  WRIST: 0,
  THUMB_CMC: 1, THUMB_MCP: 2, THUMB_IP: 3,  THUMB_TIP: 4,
  INDEX_MCP: 5, INDEX_PIP: 6, INDEX_DIP: 7,  INDEX_TIP: 8,
  MIDDLE_MCP: 9, MIDDLE_PIP: 10, MIDDLE_DIP: 11, MIDDLE_TIP: 12,
  RING_MCP: 13,  RING_PIP: 14,  RING_DIP: 15,  RING_TIP: 16,
  PINKY_MCP: 17, PINKY_PIP: 18, PINKY_DIP: 19, PINKY_TIP: 20,
} as const;

// Per-finger landmark groups: [MCP, PIP, DIP, TIP]
const FINGER_GROUPS: [number, number, number, number][] = [
  [IDX.THUMB_MCP,  IDX.THUMB_IP,   IDX.THUMB_TIP,  IDX.THUMB_TIP],   // Thumb special (2 joints)
  [IDX.INDEX_MCP,  IDX.INDEX_PIP,  IDX.INDEX_DIP,  IDX.INDEX_TIP],
  [IDX.MIDDLE_MCP, IDX.MIDDLE_PIP, IDX.MIDDLE_DIP, IDX.MIDDLE_TIP],
  [IDX.RING_MCP,   IDX.RING_PIP,   IDX.RING_DIP,   IDX.RING_TIP],
  [IDX.PINKY_MCP,  IDX.PINKY_PIP,  IDX.PINKY_DIP,  IDX.PINKY_TIP],
];

function dist2D(a: Point2D, b: Point2D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function dot2D(ax: number, ay: number, bx: number, by: number): number {
  return ax * bx + ay * by;
}

function cross2D(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

/** Compute signed angle between two 2D vectors */
function angleBetween(ax: number, ay: number, bx: number, by: number): number {
  return Math.atan2(cross2D(ax, ay, bx, by), dot2D(ax, ay, bx, by));
}

export interface PoseAnalysisResult {
  pose: HandPose;
  openness: number;
  depthEstimate: number;
  orientation: PalmOrientation;
  fingers: FingerState[];
  stabilityScore: number; // computed externally from history, passed in
}

export class HandPoseAnalyzer {
  /**
   * Main analysis entry point.
   * @param lm2D     2D game-space landmarks (21 points)
   * @param lm3D     Raw 3D normalized landmarks from MediaPipe (21 points)
   * @param scale    Hand scale (wrist-to-middleMCP distance in game pixels)
   * @param stability Pre-computed stability score from history
   */
  public static analyze(
    lm2D: Point2D[],
    lm3D: Point3D[],
    scale: number,
    stability: number = 1.0
  ): PoseAnalysisResult {
    if (lm2D.length < 21) {
      return this.defaultResult();
    }

    const fingers = this.analyzeFingers(lm2D, scale);
    const openness = this.computeOpenness(fingers, scale, lm2D);
    const depthEstimate = this.estimateDepth(lm3D, scale);
    const orientation = this.computeOrientation(lm2D);
    const pose = this.classifyPose(fingers, openness, scale, lm2D);

    return { pose, openness, depthEstimate, orientation, fingers, stabilityScore: stability };
  }

  /**
   * Analyze each finger's extension state using joint angles and distance ratios.
   * Uses PIP and DIP joints for accurate curling detection.
   */
  private static analyzeFingers(lm: Point2D[], scale: number): FingerState[] {
    const wrist = lm[IDX.WRIST];
    const results: FingerState[] = [];

    for (let fi = 0; fi < 5; fi++) {
      const [mcpIdx, pipIdx, dipIdx, tipIdx] = FINGER_GROUPS[fi];
      const mcp = lm[mcpIdx];
      const pip = lm[pipIdx];
      const dip = lm[dipIdx];
      const tip = lm[tipIdx];

      let extension: number;

      if (fi === 0) {
        // Thumb: compare tip distance from index MCP (abduction proxy)
        const indexMcp = lm[IDX.INDEX_MCP];
        const pinchDist = dist2D(tip, lm[IDX.INDEX_TIP]);
        const thumbReachDist = dist2D(tip, indexMcp);
        // Thumb is extended if tip is far from index MCP and not pinching index tip
        extension = Math.min(1.0, Math.max(0.0,
          (thumbReachDist / (scale * 0.9)) * (pinchDist > scale * 0.25 ? 1.0 : 0.3)
        ));
      } else {
        // For other fingers: use angular approach via PIP and DIP joints
        // Vector MCP→PIP
        const v1x = pip.x - mcp.x;
        const v1y = pip.y - mcp.y;
        // Vector PIP→DIP
        const v2x = dip.x - pip.x;
        const v2y = dip.y - pip.y;
        // Vector DIP→TIP
        const v3x = tip.x - dip.x;
        const v3y = tip.y - dip.y;

        // Compute bend angles (larger bend = more curled)
        const pipAngle  = Math.abs(angleBetween(v1x, v1y, v2x, v2y));
        const dipAngle  = Math.abs(angleBetween(v2x, v2y, v3x, v3y));

        // Normalize: 0 rad bend = fully extended (1.0), π rad bend = fully curled (0.0)
        const maxBend = Math.PI;
        const avgBend = (pipAngle + dipAngle) * 0.5;
        extension = Math.max(0.0, Math.min(1.0, 1.0 - (avgBend / (maxBend * 0.65))));
      }

      // Compute finger direction angle relative to wrist
      const angle = Math.atan2(tip.y - wrist.y, tip.x - wrist.x);

      results.push({ index: fi, extension, tip, mcp, pip, dip, angle });
    }

    return results;
  }

  /**
   * Compute hand openness from 0.0 (fist) to 1.0 (full open spread).
   * Uses both finger extension AND spread between fingers.
   */
  private static computeOpenness(fingers: FingerState[], scale: number, lm: Point2D[]): number {
    if (scale < 1) return 0.5;

    // Average extension of non-thumb fingers (fingers 1-4)
    const fingerExtensions = fingers.slice(1).map(f => f.extension);
    const avgExtension = fingerExtensions.reduce((a, b) => a + b, 0) / fingerExtensions.length;

    // Spread bonus: distance between outermost fingertips relative to hand width
    const indexTip = lm[IDX.INDEX_TIP];
    const pinkyTip = lm[IDX.PINKY_TIP];
    const tipSpread = dist2D(indexTip, pinkyTip);
    const spreadRatio = Math.min(1.0, tipSpread / (scale * 1.8));

    return Math.min(1.0, avgExtension * 0.7 + spreadRatio * 0.3);
  }

  /**
   * Estimate relative hand depth (0=far, 1=close to camera).
   * Uses Z values from MediaPipe landmarks + 2D scale proxy.
   */
  private static estimateDepth(lm3D: Point3D[], scale: number): number {
    if (!lm3D || lm3D.length < 21) {
      // Fallback: use 2D scale (bigger hand = closer to camera)
      // Scale range ~25px (far) to ~180px (close)
      return Math.min(1.0, Math.max(0.0, (scale - 25) / 155));
    }

    // MediaPipe Z: negative = closer to camera, 0 = at wrist depth
    // Average Z of key palm landmarks
    const wristZ  = lm3D[IDX.WRIST]?.z ?? 0;
    const mcpZ    = ((lm3D[IDX.INDEX_MCP]?.z ?? 0) + (lm3D[IDX.MIDDLE_MCP]?.z ?? 0)) * 0.5;
    const palmZ   = (wristZ + mcpZ) * 0.5;

    // Z range from MediaPipe typically -0.3 (close) to +0.1 (far in hand model)
    // Map to 0..1 (inverted: more negative = closer = higher value)
    const zBased = Math.min(1.0, Math.max(0.0, (-palmZ + 0.1) / 0.4));

    // Blend with scale-based estimate (scale is more reliable in practice)
    const scaleBased = Math.min(1.0, Math.max(0.0, (scale - 25) / 155));

    return zBased * 0.4 + scaleBased * 0.6;
  }

  /**
   * Compute palm orientation from the palm basis vectors.
   * Uses wrist→indexMCP and wrist→pinkyMCP to define the palm plane.
   */
  private static computeOrientation(lm: Point2D[]): PalmOrientation {
    const wrist    = lm[IDX.WRIST];
    const indexMCP = lm[IDX.INDEX_MCP];
    const pinkyMCP = lm[IDX.PINKY_MCP];
    const middleMCP = lm[IDX.MIDDLE_MCP];

    // Basis vector along knuckle row (index → pinky)
    const kx = pinkyMCP.x - indexMCP.x;
    const ky = pinkyMCP.y - indexMCP.y;
    const kLen = Math.hypot(kx, ky) || 1;

    // Basis vector along wrist → middle MCP (finger direction)
    const fx = middleMCP.x - wrist.x;
    const fy = middleMCP.y - wrist.y;
    const fLen = Math.hypot(fx, fy) || 1;

    // 2D "normal" of palm plane: perpendicular to knuckle row in 2D
    const normalX = -ky / kLen;
    const normalY =  kx / kLen;

    // Roll angle = angle of knuckle row from horizontal
    const rollAngle = Math.atan2(ky, kx);

    // Tilt = angle of finger direction from vertical
    const tiltAngle = Math.atan2(fx / fLen, -fy / fLen);

    // If normal.y is positive the palm faces camera (in image space y increases downward)
    const facingCamera = normalY > 0;

    return { normalX, normalY, facingCamera, rollAngle, tiltAngle };
  }

  /**
   * Classify the hand into a meaningful pose state.
   * Priority order: PINCH → FIST → GRAB → POINTING → RELAXED → OPEN_HAND → REACHING
   */
  private static classifyPose(
    fingers: FingerState[],
    openness: number,
    scale: number,
    lm: Point2D[]
  ): HandPose {
    const thumbTip  = lm[IDX.THUMB_TIP];
    const indexTip  = lm[IDX.INDEX_TIP];
    const [thumb, index, middle, ring, pinky] = fingers;

    // PINCH: thumb and index tips very close
    const pinchDist = dist2D(thumbTip, indexTip);
    if (pinchDist < scale * 0.30 && index.extension > 0.4) {
      return 'PINCH';
    }

    // Count extended non-thumb fingers
    const extendedCount = [index, middle, ring, pinky].filter(f => f.extension > 0.55).length;
    const curledCount   = [index, middle, ring, pinky].filter(f => f.extension < 0.35).length;

    // FIST: all fingers tightly curled, openness very low
    if (openness < 0.25 && curledCount >= 3) {
      return 'FIST';
    }

    // CLOSED_HAND: most fingers curled
    if (openness < 0.42 && curledCount >= 2) {
      return 'CLOSED_HAND';
    }

    // GRAB: fingers partially closing (mid-motion between open and closed)
    // Detected when middle + ring + pinky are significantly curled but index is not fully curled
    if (index.extension > 0.25 && middle.extension < 0.55 && ring.extension < 0.55 && openness < 0.60) {
      return 'GRAB';
    }

    // POINTING: index extended, others curled
    if (index.extension > 0.65 && middle.extension < 0.4 && ring.extension < 0.4 && pinky.extension < 0.4) {
      return 'POINTING';
    }

    // OPEN_HAND: all 4 fingers well extended
    if (extendedCount >= 4 && openness > 0.65) {
      return 'OPEN_HAND';
    }

    // RELAXED: 2-3 fingers somewhat extended
    if (extendedCount >= 2 && openness > 0.40) {
      return 'RELAXED';
    }

    return 'UNKNOWN';
  }

  private static defaultResult(): PoseAnalysisResult {
    return {
      pose: 'UNKNOWN',
      openness: 0.5,
      depthEstimate: 0.3,
      orientation: { normalX: 0, normalY: 1, facingCamera: true, rollAngle: 0, tiltAngle: 0 },
      fingers: [],
      stabilityScore: 0.5,
    };
  }
}
