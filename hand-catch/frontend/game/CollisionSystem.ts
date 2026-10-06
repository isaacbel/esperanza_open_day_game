/**
 * CollisionSystem.ts - Pose-Aware Swept Multi-Circle Collision Engine
 *
 * Understands the hand as a physical 3D object:
 *   - Open palm = full interaction volume
 *   - GRAB/FIST = bonus "close-hand catch" detection
 *   - Palm facing camera = stronger catch zone
 *   - Depth-scaled radii (closer hand = bigger catch zone)
 *   - Swept trajectory prevents tunneling on fast swipes
 *   - Predicted position compensates for webcam latency
 *   - Reaching score gates subtle assist (intentional movement only)
 */
import { Point2D, TrackedHandData } from '../vision/HandTypes';
import { GAME_CONFIG } from './GameConfig';
import { FallingColumnData } from './ColumnRenderer';

export interface CollisionResult {
  hit: boolean;
  hitPoint: Point2D | null;
  assisted?: boolean;
  catchType?: 'PALM' | 'FINGERTIP' | 'GRAB' | 'INTERCEPT' | 'PREDICT';
}

export interface Box2D {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export class CollisionSystem {

  public static circleIntersectsAABB(cx: number, cy: number, r: number, box: Box2D): boolean {
    const clampX = Math.max(box.minX, Math.min(cx, box.maxX));
    const clampY = Math.max(box.minY, Math.min(cy, box.maxY));
    return (cx - clampX) ** 2 + (cy - clampY) ** 2 <= r * r;
  }

  public static sweptCircleIntersectsAABB(
    p0x: number, p0y: number,
    p1x: number, p1y: number,
    radius: number,
    box: Box2D
  ): { hit: boolean; hitX: number; hitY: number } {
    if (this.circleIntersectsAABB(p1x, p1y, radius, box))
      return { hit: true, hitX: p1x, hitY: p1y };
    if (this.circleIntersectsAABB(p0x, p0y, radius, box))
      return { hit: true, hitX: p0x, hitY: p0y };
    const dx = p1x - p0x;
    const dy = p1y - p0y;
    const dist = Math.hypot(dx, dy);
    const stepSize = Math.max(radius * 0.75, 12);
    if (dist <= stepSize) return { hit: false, hitX: 0, hitY: 0 };
    const steps = Math.min(Math.ceil(dist / stepSize), 8);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.circleIntersectsAABB(p0x + dx * t, p0y + dy * t, radius, box))
        return { hit: true, hitX: p0x + dx * t, hitY: p0y + dy * t };
    }
    return { hit: false, hitX: 0, hitY: 0 };
  }

  public static getColumnBox(col: FallingColumnData, padding: number, assistPadding: number = 0): Box2D {
    const halfW = col.width * 0.5;
    const pad   = padding + assistPadding;
    const topY  = Math.min(col.y, col.prevY);
    const botY  = Math.max(col.y + col.height, col.prevY + col.height);
    return { minX: col.x - halfW - pad, maxX: col.x + halfW + pad, minY: topY - pad, maxY: botY + pad };
  }

  public static getColumnPaddedBox(col: FallingColumnData, padding: number = GAME_CONFIG.collisionPadding, assistPadding: number = 0): Box2D {
    return this.getColumnBox(col, padding, assistPadding);
  }

  public static checkHandColumn(hand: TrackedHandData, col: FallingColumnData): CollisionResult {
    if (!hand.active || hand.opacity <= 0.1 || col.state !== 'falling')
      return { hit: false, hitPoint: null };

    const speed = hand.speed || Math.hypot(hand.vx, hand.vy);
    const speedBoost = Math.min(18, speed * 0.015);
    const facingBonus = hand.orientation?.facingCamera ? 1.0 : 0.8;
    const poseMultiplier = this.getPoseCollisionMultiplier(hand);
    const effectivePalmR = Math.max(GAME_CONFIG.minHandRadius,
      Math.min(GAME_CONFIG.maxHandRadius * 1.2, hand.palm.radius * poseMultiplier * facingBonus + speedBoost));

    let assistPadding = 0;
    if (GAME_CONFIG.catchAssist > 0 && (speed > 70 || (hand.reachingScore ?? 0) > 0.5)) {
      const reachFactor = 0.5 + (hand.reachingScore ?? 0) * 0.5;
      assistPadding = col.width * GAME_CONFIG.catchAssist * 0.45 * reachFactor;
    }

    const box = this.getColumnBox(col, GAME_CONFIG.collisionPadding, assistPadding);
    const palmY = hand.palm.y; const palmPrevY = hand.palm.prevY;
    const predY = hand.predictedPalm?.y ?? palmY;
    const handMinY = Math.min(palmY, palmPrevY, predY) - effectivePalmR - 40;
    const handMaxY = Math.max(palmY, palmPrevY, predY) + effectivePalmR + 40;
    if (box.maxY < handMinY || box.minY > handMaxY) return { hit: false, hitPoint: null };

    // 1. Palm swept
    const palmHit = this.sweptCircleIntersectsAABB(
      hand.palm.prevX, hand.palm.prevY, hand.palm.x, hand.palm.y, effectivePalmR, box);
    if (palmHit.hit)
      return { hit: true, hitPoint: { x: palmHit.hitX, y: palmHit.hitY }, assisted: assistPadding > 0, catchType: 'PALM' };

    // 2. Predicted palm
    if (hand.predictedPalm && speed > 150) {
      if (this.circleIntersectsAABB(hand.predictedPalm.x, hand.predictedPalm.y, effectivePalmR * 0.9, box))
        return { hit: true, hitPoint: hand.predictedPalm, assisted: true, catchType: 'PREDICT' };
    }

    // 3. Fingertips
    if (hand.fingertips?.length > 0) {
      const isGrabbing = hand.pose === 'GRAB' || hand.pose === 'FIST' || hand.pose === 'CLOSED_HAND';
      const tipCheckCount = isGrabbing ? 2 : hand.fingertips.length;
      for (let i = 0; i < Math.min(tipCheckCount, hand.fingertips.length); i++) {
        const tip = hand.fingertips[i];
        if (!isGrabbing && hand.fingers?.[i]?.extension < 0.3) continue;
        const tipR = tip.radius + speedBoost * 0.4;
        const tipHit = this.sweptCircleIntersectsAABB(tip.prevX, tip.prevY, tip.x, tip.y, tipR, box);
        if (tipHit.hit)
          return { hit: true, hitPoint: { x: tipHit.hitX, y: tipHit.hitY }, catchType: isGrabbing ? 'GRAB' : 'FINGERTIP' };
        if (hand.predictedFingertips?.[i] && speed > 200) {
          if (this.circleIntersectsAABB(hand.predictedFingertips[i].x, hand.predictedFingertips[i].y, tipR * 0.85, box))
            return { hit: true, hitPoint: hand.predictedFingertips[i], assisted: true, catchType: 'PREDICT' };
        }
      }
    }

    // 4. Grab intercept
    if ((hand.pose === 'GRAB' || hand.pose === 'FIST') && hand.openness < 0.45) {
      const interceptBox = this.getColumnBox(col, GAME_CONFIG.collisionPadding * 0.5);
      if (this.circleIntersectsAABB(hand.palm.x, hand.palm.y, effectivePalmR * 1.15, interceptBox))
        return { hit: true, hitPoint: { x: hand.palm.x, y: hand.palm.y }, catchType: 'GRAB' };
    }

    return { hit: false, hitPoint: null };
  }

  private static getPoseCollisionMultiplier(hand: TrackedHandData): number {
    switch (hand.pose) {
      case 'OPEN_HAND':   return 1.05;
      case 'REACHING':    return 1.10;
      case 'RELAXED':     return 1.0;
      case 'GRAB':        return 0.95;
      case 'CLOSED_HAND': return 0.85;
      case 'FIST':        return 0.80;
      case 'POINTING':    return 0.70;
      case 'PINCH':       return 0.65;
      default:            return 0.95;
    }
  }
}
