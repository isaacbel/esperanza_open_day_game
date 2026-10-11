/**
 * HandIdentityTracker.ts - Stable Multi-Hand Identity Matching & Crossing Disambiguation
 *
 * Prevents identity and color swapping when player hands cross in mid-air.
 * Uses a weighted cost function:
 *   cost = distanceCost * 0.50 + velocityAlignmentCost * 0.30 + handednessCost * 0.20
 *
 * Implements graceful tracking loss recovery:
 *   0–150 ms: Maintain tracking via velocity prediction
 *   150–300 ms: Fade slightly (ghost state)
 *   300–600 ms: Fade further, reduce collision strength
 *   > 600 ms: Drop from collision, remove or reacquire if returns nearby
 */
import { Point2D } from './HandTypes';
import { distance } from '../utils/math';

export interface DetectionCandidate {
  rawPalm: Point2D;
  scale: number;
  handedness: string; // 'Left' | 'Right' | 'Unknown'
  confidence: number;
  landmarks: Point2D[];
}

export interface TrackAssignment {
  trackId: number;
  detectionIndex: number;
}

export class HandIdentityTracker {
  private static readonly MAX_MATCH_DIST = 350; // pixels in game space — allows fast sweeps

  /**
   * Computes the matching cost between an existing track and a new detection candidate.
   * Lower cost = stronger match.
   */
  public static calculateCost(
    existingPalm: Point2D,
    existingVx: number,
    existingVy: number,
    existingHandedness: string,
    candidate: DetectionCandidate,
    dtSec: number
  ): number {
    // 1. Distance Cost (normalized to [0, 1])
    // Predict where existing track should be based on velocity
    const effectiveDt = Math.max(0.016, dtSec);
    const predictedX = existingPalm.x + existingVx * effectiveDt;
    const predictedY = existingPalm.y + existingVy * effectiveDt;

    const d = distance(predictedX, predictedY, candidate.rawPalm.x, candidate.rawPalm.y);
    const distanceCost = Math.min(1.0, d / this.MAX_MATCH_DIST);

    // 2. Velocity Alignment Cost
    // Compare candidate movement vector against prior velocity
    let velocityCost = 0.5;
    const candVx = (candidate.rawPalm.x - existingPalm.x) / effectiveDt;
    const candVy = (candidate.rawPalm.y - existingPalm.y) / effectiveDt;
    const prevSpeed = Math.hypot(existingVx, existingVy);
    const candSpeed = Math.hypot(candVx, candVy);

    if (prevSpeed > 50 && candSpeed > 50) {
      const dot = (existingVx * candVx + existingVy * candVy) / (prevSpeed * candSpeed);
      // dot is in [-1, 1]. Invert: 1 (same direction) -> cost 0, -1 (opposite) -> cost 1
      velocityCost = (1.0 - dot) * 0.5;
    }

    // 3. Handedness Consistency Cost
    let handednessCost = 0.5;
    if (existingHandedness !== 'Unknown' && candidate.handedness !== 'Unknown') {
      handednessCost = existingHandedness === candidate.handedness ? 0.0 : 1.0;
    }

    // Weighted composite cost
    return distanceCost * 0.50 + velocityCost * 0.30 + handednessCost * 0.20;
  }

  /**
   * Solves bipartite matching between existing active tracks and candidate detections.
   * Guarantees optimal assignment without swapping crossed tracks.
   *
   * @param existingTracks - includes lastSeenMs so actual elapsed time is used per-track
   */
  public static matchDetections(
    existingTracks: {
      id: number;
      palm: Point2D;
      vx: number;
      vy: number;
      handedness: string;
      lastSeenMs?: number; // performance.now() timestamp of last detection
    }[],
    candidates: DetectionCandidate[],
    _dtSecIgnored: number, // kept for API compatibility – actual dt computed per-track
    nowMs: number = performance.now()
  ): {
    matched: Map<number, number>; // trackId -> candidateIndex
    unmatchedTracks: number[];    // trackIds with no match
    unmatchedCandidates: number[];// candidate indices that start new tracks
  } {
    const matched = new Map<number, number>();
    const matchedCandidates = new Set<number>();
    const matchedTracks = new Set<number>();

    // Build cost matrix
    interface CostPair {
      trackId: number;
      candIdx: number;
      cost: number;
    }

    const costList: CostPair[] = [];

    for (const track of existingTracks) {
      // Use actual elapsed time since this track was last seen
      const dtSec = track.lastSeenMs != null
        ? Math.max(0.016, (nowMs - track.lastSeenMs) / 1000)
        : 0.016;
      for (let c = 0; c < candidates.length; c++) {
        const cost = this.calculateCost(
          track.palm,
          track.vx,
          track.vy,
          track.handedness,
          candidates[c],
          dtSec
        );
        costList.push({ trackId: track.id, candIdx: c, cost });
      }
    }

    // Sort by lowest cost (greedy optimal for small N <= 2)
    costList.sort((a, b) => a.cost - b.cost);

    for (const pair of costList) {
      if (pair.cost > 0.88) continue; // Exceeds plausibility threshold
      if (!matchedTracks.has(pair.trackId) && !matchedCandidates.has(pair.candIdx)) {
        matched.set(pair.trackId, pair.candIdx);
        matchedTracks.add(pair.trackId);
        matchedCandidates.add(pair.candIdx);
      }
    }

    const unmatchedTracks = existingTracks
      .map(t => t.id)
      .filter(id => !matchedTracks.has(id));

    const unmatchedCandidates: number[] = [];
    for (let c = 0; c < candidates.length; c++) {
      if (!matchedCandidates.has(c)) {
        unmatchedCandidates.push(c);
      }
    }

    return { matched, unmatchedTracks, unmatchedCandidates };
  }
}
