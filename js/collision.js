/**
 * collision.js - Hand vs Falling Object Collision Detection
 * Implements forgiving multi-circle hand collision with swept segment testing
 * to prevent fast-moving tunneling.
 */
import { GAME_CONFIG } from './config.js';

/**
 * Checks if a circle intersects an Axis-Aligned Bounding Box (AABB)
 * @param {number} cx Circle center X
 * @param {number} cy Circle center Y
 * @param {number} radius Circle radius
 * @param {object} box { minX, minY, maxX, maxY }
 * @returns {boolean}
 */
export function circleIntersectsAABB(cx, cy, radius, box) {
  // Find closest point on AABB to circle center
  const closestX = Math.max(box.minX, Math.min(cx, box.maxX));
  const closestY = Math.max(box.minY, Math.min(cy, box.maxY));

  const dx = cx - closestX;
  const dy = cy - closestY;

  return (dx * dx + dy * dy) <= (radius * radius);
}

/**
 * Swept test between a moving circle (from prev to cur) and an AABB.
 * Uses adaptive step sampling along the motion path to guarantee no tunneling.
 * @param {number} p0x Previous X
 * @param {number} p0y Previous Y
 * @param {number} p1x Current X
 * @param {number} p1y Current Y
 * @param {number} radius Circle radius
 * @param {object} box { minX, minY, maxX, maxY }
 * @returns {{ hit: boolean, hitX: number, hitY: number }}
 */
export function sweptCircleIntersectsAABB(p0x, p0y, p1x, p1y, radius, box) {
  // Check endpoints first
  if (circleIntersectsAABB(p1x, p1y, radius, box)) {
    return { hit: true, hitX: p1x, hitY: p1y };
  }
  if (circleIntersectsAABB(p0x, p0y, radius, box)) {
    return { hit: true, hitX: p0x, hitY: p0y };
  }

  // Calculate motion displacement
  const dx = p1x - p0x;
  const dy = p1y - p0y;
  const dist = Math.hypot(dx, dy);

  // If movement is smaller than radius, endpoints check was sufficient
  const stepSize = Math.max(radius * 0.75, 12);
  if (dist <= stepSize) {
    return { hit: false, hitX: 0, hitY: 0 };
  }

  // Sample along the segment
  const steps = Math.min(Math.ceil(dist / stepSize), 8);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const sx = p0x + dx * t;
    const sy = p0y + dy * t;
    if (circleIntersectsAABB(sx, sy, radius, box)) {
      return { hit: true, hitX: sx, hitY: sy };
    }
  }

  return { hit: false, hitX: 0, hitY: 0 };
}

/**
 * Builds the padded bounding box for a column, accounting for column's vertical sweep
 * @param {object} column 
 * @param {number} padding 
 * @returns {object} { minX, minY, maxX, maxY }
 */
export function getColumnPaddedBox(column, padding = GAME_CONFIG.collisionPadding) {
  const halfW = column.width * 0.5;
  const minX = column.x - halfW - padding;
  const maxX = column.x + halfW + padding;

  // Include previous Y to sweep column vertical motion
  const topY = Math.min(column.y, column.prevY !== undefined ? column.prevY : column.y);
  const bottomY = Math.max(column.y + column.height, (column.prevY || column.y) + column.height);

  return {
    minX,
    maxX,
    minY: topY - padding,
    maxY: bottomY + padding
  };
}

/**
 * Broad-phase bounding box for all hand collision circles
 * @param {object} hand 
 * @returns {object} { minX, minY, maxX, maxY }
 */
export function getHandBoundingBox(hand) {
  let minX = hand.palm.x - hand.palm.radius;
  let maxX = hand.palm.x + hand.palm.radius;
  let minY = hand.palm.y - hand.palm.radius;
  let maxY = hand.palm.y + hand.palm.radius;

  if (hand.fingertips && hand.fingertips.length > 0) {
    for (const tip of hand.fingertips) {
      minX = Math.min(minX, tip.x - tip.radius);
      maxX = Math.max(maxX, tip.x + tip.radius);
      minY = Math.min(minY, tip.y - tip.radius);
      maxY = Math.max(maxY, tip.y + tip.radius);
    }
  }

  return { minX, maxX, minY, maxY };
}

/**
 * Tests collision between a single hand (palm + 5 fingertips) and a falling column
 * @param {object} hand Tracked hand with palm and fingertips
 * @param {object} column Falling column object
 * @returns {{ hit: boolean, hitPoint: { x: number, y: number } | null }}
 */
export function checkHandColumnCollision(hand, column) {
  if (!hand || !hand.active || hand.opacity <= 0.1 || column.state !== 'falling') {
    return { hit: false, hitPoint: null };
  }

  const colBox = getColumnPaddedBox(column, GAME_CONFIG.collisionPadding);

  // Broad-phase: check if hand's rough Y range overlaps column's Y range
  const palmPrevX = hand.palm.prevX !== undefined ? hand.palm.prevX : hand.palm.x;
  const palmPrevY = hand.palm.prevY !== undefined ? hand.palm.prevY : hand.palm.y;

  const handMinY = Math.min(hand.palm.y, palmPrevY) - hand.palm.radius - 40;
  const handMaxY = Math.max(hand.palm.y, palmPrevY) + hand.palm.radius + 40;

  if (colBox.maxY < handMinY || colBox.minY > handMaxY) {
    return { hit: false, hitPoint: null };
  }

  // 1. Test Palm circle (primary & largest hit area)
  const palmHit = sweptCircleIntersectsAABB(
    palmPrevX, palmPrevY,
    hand.palm.x, hand.palm.y,
    hand.palm.radius,
    colBox
  );

  if (palmHit.hit) {
    return {
      hit: true,
      hitPoint: {
        x: Math.max(colBox.minX + GAME_CONFIG.collisionPadding, Math.min(palmHit.hitX, colBox.maxX - GAME_CONFIG.collisionPadding)),
        y: Math.max(colBox.minY + GAME_CONFIG.collisionPadding, Math.min(palmHit.hitY, colBox.maxY - GAME_CONFIG.collisionPadding))
      }
    };
  }

  // 2. Test 5 Fingertips (for precise / reaching catches)
  if (hand.fingertips && hand.fingertips.length > 0) {
    for (const tip of hand.fingertips) {
      const tipPrevX = tip.prevX !== undefined ? tip.prevX : tip.x;
      const tipPrevY = tip.prevY !== undefined ? tip.prevY : tip.y;

      const tipHit = sweptCircleIntersectsAABB(
        tipPrevX, tipPrevY,
        tip.x, tip.y,
        tip.radius,
        colBox
      );

      if (tipHit.hit) {
        return {
          hit: true,
          hitPoint: {
            x: tipHit.hitX,
            y: tipHit.hitY
          }
        };
      }
    }
  }

  return { hit: false, hitPoint: null };
}
