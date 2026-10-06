/**
 * HandRenderer.ts - 3D-Like Human Hand Visualizer & Advanced Debug Overlay
 *
 * Renders the full hand model:
 *   - Anatomically correct bone skeleton (21 landmarks, all connections)
 *   - Per-finger segments with thickness proportional to depth
 *   - Palm collision volume (scales with depth, pose, and speed)
 *   - Fingertip interaction nodes (only for extended fingers)
 *   - Palm orientation indicator
 *   - Hand depth scale (bigger = closer to camera)
 *   - Pose label (OPEN_HAND, GRAB, FIST, REACHING...)
 *   - Movement classification badge
 *   - Reaching glow aura when reaching score is high
 *   - Debug overlay with all metrics, velocity vectors, skeleton, predicted position
 */
import { TrackedHandData } from '../vision/HandTypes';
import { getGlowSprite } from './ParticleSystem';

// MediaPipe hand skeleton connections (21 landmarks)
const HAND_CONNECTIONS: [number, number][] = [
  // Thumb
  [0,1],[1,2],[2,3],[3,4],
  // Index
  [0,5],[5,6],[6,7],[7,8],
  // Middle
  [5,9],[9,10],[10,11],[11,12],
  // Ring
  [9,13],[13,14],[14,15],[15,16],
  // Pinky
  [13,17],[17,18],[18,19],[19,20],
  // Palm arch
  [0,17],[5,17],
];

// Bone thickness per segment (MCP joints thicker, distal thinner)
const BONE_WIDTH = [
  2.5, 2.0, 1.8, 1.5,   // Thumb
  2.5, 2.0, 1.8, 1.5,   // Index
  1.8, 1.8, 1.5, 1.4,   // Middle link (5-9, 9-10...)
  1.8, 1.6, 1.4, 1.3,   // Ring
  1.6, 1.5, 1.3, 1.2,   // Pinky
  2.0, 1.8               // Palm arch
];

// Fingertip landmark indices
const TIP_INDICES = [4, 8, 12, 16, 20];

export class HandRenderer {
  public static renderHands(
    ctx: CanvasRenderingContext2D,
    hands: TrackedHandData[],
    lowQuality: boolean = false
  ): void {
    for (const hand of hands) {
      if (hand.opacity <= 0.01) continue;
      ctx.save();
      ctx.globalAlpha = hand.opacity;

      const speed = hand.speed || Math.hypot(hand.vx, hand.vy);
      const isFast = speed > 300;
      const depth  = hand.depthEstimate ?? 0.3;         // 0=far, 1=close
      const depthScale = 0.75 + depth * 0.5;            // 0.75–1.25× visual scale

      // ── 1. Glow aura (scales with depth + reaching state) ────────────────
      if (!lowQuality) {
        const isReaching = (hand.reachingScore ?? 0) > 0.5;
        const glowRadius = Math.round((isFast ? 72 : isReaching ? 64 : 52) * depthScale);
        const glow = getGlowSprite(hand.color, 64);
        if (glow) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const alpha = isFast ? 0.8 : isReaching ? 0.65 : 0.50;
          ctx.globalAlpha = hand.opacity * alpha;
          ctx.drawImage(glow, hand.palm.x - glowRadius, hand.palm.y - glowRadius,
            glowRadius * 2, glowRadius * 2);
          ctx.restore();
        }

        // Reaching pulse ring
        if (isReaching) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(hand.palm.x, hand.palm.y, hand.palm.radius * 1.5 * depthScale, 0, Math.PI * 2);
          ctx.strokeStyle = hand.color;
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = hand.opacity * (hand.reachingScore ?? 0) * 0.5;
          ctx.setLineDash([6, 6]);
          ctx.stroke();
          ctx.restore();
        }
      }

      // ── 2. Bone skeleton with 3D-like depth shading ──────────────────────
      if (hand.landmarks?.length >= 21) {
        const lm = hand.landmarks;

        for (let ci = 0; ci < HAND_CONNECTIONS.length; ci++) {
          const [a, b] = HAND_CONNECTIONS[ci];
          ctx.beginPath();
          ctx.moveTo(lm[a].x, lm[a].y);
          ctx.lineTo(lm[b].x, lm[b].y);
          ctx.strokeStyle = hand.color;
          ctx.lineWidth = (BONE_WIDTH[ci] ?? 1.5) * depthScale;
          ctx.globalAlpha = hand.opacity * (ci < 17 ? 0.85 : 0.65);
          ctx.stroke();
        }
        ctx.globalAlpha = hand.opacity;

        // Landmark nodes — larger for MCP joints, smaller for tips
        for (let i = 0; i < 21; i++) {
          const isTip = TIP_INDICES.includes(i);
          const isMCP = [5, 9, 13, 17].includes(i);
          const nodeR = (isMCP ? 4.5 : isTip ? 3.5 : 2.5) * depthScale;
          ctx.beginPath();
          ctx.arc(lm[i].x, lm[i].y, nodeR, 0, Math.PI * 2);
          ctx.fillStyle = isTip ? '#ffffff' : hand.color;
          ctx.fill();
        }
      }

      // ── 3. Palm interaction volume (depth-scaled ring) ───────────────────
      const palmR = hand.palm.radius * depthScale;
      ctx.globalAlpha = hand.opacity;
      ctx.beginPath();
      ctx.arc(hand.palm.x, hand.palm.y, palmR, 0, Math.PI * 2);
      ctx.strokeStyle = hand.color;
      ctx.lineWidth = isFast ? 3.5 : 2.5;
      ctx.stroke();

      // Palm fill (shows orientation: brighter when facing camera)
      const fillAlpha = hand.orientation?.facingCamera ? 0.18 : 0.08;
      ctx.fillStyle = hand.colorGlow.replace('0.45', fillAlpha.toString());
      ctx.fill();

      // Palm center dot
      ctx.beginPath();
      ctx.arc(hand.palm.x, hand.palm.y, 4 * depthScale, 0, Math.PI * 2);
      ctx.fillStyle = hand.color;
      ctx.fill();

      // ── 4. Extended fingertip interaction circles ────────────────────────
      if (hand.fingertips?.length > 0) {
        for (let i = 0; i < hand.fingertips.length; i++) {
          const tip = hand.fingertips[i];
          const ext = hand.fingers?.[i]?.extension ?? 0.5;
          if (ext < 0.3) continue; // Don't show circles for curled fingers

          ctx.beginPath();
          ctx.arc(tip.x, tip.y, tip.radius * depthScale, 0, Math.PI * 2);
          ctx.strokeStyle = hand.color;
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = hand.opacity * (0.4 + ext * 0.45);
          ctx.stroke();
        }
      }

      ctx.globalAlpha = hand.opacity;

      // ── 5. Pose badge ────────────────────────────────────────────────────
      if (!lowQuality) {
        const pose = hand.pose ?? 'UNKNOWN';
        if (pose !== 'UNKNOWN') {
          ctx.font = `600 10px "Orbitron", system-ui`;
          ctx.fillStyle = hand.color;
          ctx.textAlign = 'center';
          ctx.globalAlpha = hand.opacity * 0.8;
          ctx.fillText(pose, hand.palm.x, hand.palm.y - hand.palm.radius * depthScale - 12);
        }
      }

      // Ghost label
      if (hand.isGhost) {
        ctx.font = '600 11px "Orbitron", system-ui';
        ctx.fillStyle = hand.color;
        ctx.textAlign = 'center';
        ctx.globalAlpha = hand.opacity * 0.7;
        ctx.fillText('REACQUIRING...', hand.palm.x, hand.palm.y - hand.palm.radius * depthScale - 26);
      }

      ctx.restore();
    }
  }

  public static renderDebugOverlay(
    ctx: CanvasRenderingContext2D,
    hands: TrackedHandData[],
    metrics: string[]
  ): void {
    ctx.save();

    for (const hand of hands) {
      if (hand.opacity <= 0.01) continue;
      const lm = hand.landmarks;
      const depth = hand.depthEstimate ?? 0.3;
      const depthScale = 0.75 + depth * 0.5;

      // ── Full skeleton in debug ───────────────────────────────────────────
      if (lm?.length >= 21) {
        ctx.strokeStyle = hand.color;
        ctx.lineWidth = 2;
        for (const [a, b] of HAND_CONNECTIONS) {
          ctx.beginPath();
          ctx.moveTo(lm[a].x, lm[a].y);
          ctx.lineTo(lm[b].x, lm[b].y);
          ctx.stroke();
        }
        // All 21 landmark dots
        for (let i = 0; i < 21; i++) {
          ctx.beginPath();
          ctx.arc(lm[i].x, lm[i].y, i % 4 === 0 ? 5 : 3, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          // Landmark index label
          ctx.font = '600 8px monospace';
          ctx.fillStyle = hand.color;
          ctx.textAlign = 'center';
          ctx.fillText(i.toString(), lm[i].x + 6, lm[i].y - 4);
        }
      }

      // ── Velocity vector ──────────────────────────────────────────────────
      const velScale = 0.12;
      ctx.beginPath();
      ctx.moveTo(hand.palm.x, hand.palm.y);
      ctx.lineTo(hand.palm.x + hand.vx * velScale, hand.palm.y + hand.vy * velScale);
      ctx.strokeStyle = '#00ff88';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      // Arrowhead
      const vLen = Math.hypot(hand.vx, hand.vy) * velScale;
      if (vLen > 5) {
        const vAngle = Math.atan2(hand.vy, hand.vx);
        ctx.beginPath();
        ctx.moveTo(hand.palm.x + hand.vx * velScale, hand.palm.y + hand.vy * velScale);
        ctx.lineTo(
          hand.palm.x + hand.vx * velScale - 8 * Math.cos(vAngle - 0.4),
          hand.palm.y + hand.vy * velScale - 8 * Math.sin(vAngle - 0.4)
        );
        ctx.lineTo(
          hand.palm.x + hand.vx * velScale - 8 * Math.cos(vAngle + 0.4),
          hand.palm.y + hand.vy * velScale - 8 * Math.sin(vAngle + 0.4)
        );
        ctx.fillStyle = '#00ff88';
        ctx.fill();
      }

      // ── Acceleration vector ──────────────────────────────────────────────
      const accScale = 0.004;
      ctx.beginPath();
      ctx.moveTo(hand.palm.x, hand.palm.y);
      ctx.lineTo(hand.palm.x + (hand.ax ?? 0) * accScale, hand.palm.y + (hand.ay ?? 0) * accScale);
      ctx.strokeStyle = '#ffaa00';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // ── Predicted position (dashed circle) ──────────────────────────────
      if (hand.predictedPalm) {
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(hand.predictedPalm.x, hand.predictedPalm.y, hand.palm.radius * 0.85, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // Line from current to predicted
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(hand.palm.x, hand.palm.y);
        ctx.lineTo(hand.predictedPalm.x, hand.predictedPalm.y);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.stroke();
        ctx.restore();
      }

      // ── Movement trajectory (last 10 history frames) ─────────────────────
      if (hand.history?.length > 2) {
        ctx.beginPath();
        ctx.moveTo(hand.history[0].palmX, hand.history[0].palmY);
        for (let i = 1; i < hand.history.length; i++) {
          ctx.lineTo(hand.history[i].palmX, hand.history[i].palmY);
        }
        ctx.strokeStyle = 'rgba(255, 200, 0, 0.55)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // ── Palm orientation normal arrow ─────────────────────────────────────
      if (hand.orientation) {
        const normalLen = 40;
        ctx.beginPath();
        ctx.moveTo(hand.palm.x, hand.palm.y);
        ctx.lineTo(
          hand.palm.x + hand.orientation.normalX * normalLen,
          hand.palm.y + hand.orientation.normalY * normalLen
        );
        ctx.strokeStyle = hand.orientation.facingCamera ? '#00ffff' : '#ff4400';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // ── Per-finger extension bars ─────────────────────────────────────────
      if (hand.fingers?.length > 0) {
        const barX = hand.palm.x - 55;
        const barY = hand.palm.y + hand.palm.radius * depthScale + 20;
        const fingerNames = ['T', 'I', 'M', 'R', 'P'];
        for (let fi = 0; fi < hand.fingers.length; fi++) {
          const f = hand.fingers[fi];
          const bx = barX + fi * 22;
          // Background
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillRect(bx, barY, 16, 40);
          // Fill
          const fillH = Math.round(40 * f.extension);
          ctx.fillStyle = hand.color;
          ctx.fillRect(bx, barY + (40 - fillH), 16, fillH);
          // Label
          ctx.font = '700 9px monospace';
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.fillText(fingerNames[fi], bx + 8, barY + 52);
        }
      }

      // ── Hand info tag ────────────────────────────────────────────────────
      ctx.font = '600 11px "Courier New", monospace';
      ctx.fillStyle = hand.color;
      ctx.textAlign = 'center';
      ctx.fillText(
        `[${hand.trackId}] ${hand.handedness} | ${hand.pose} | ${hand.movement} | ${Math.round(hand.speed)}px/s`,
        hand.palm.x,
        hand.palm.y + hand.palm.radius * depthScale + 22
      );
      ctx.fillText(
        `depth:${(hand.depthEstimate ?? 0).toFixed(2)} open:${(hand.openness ?? 0).toFixed(2)} reach:${(hand.reachingScore ?? 0).toFixed(2)} conf:${hand.confidence.toFixed(2)}`,
        hand.palm.x,
        hand.palm.y + hand.palm.radius * depthScale + 36
      );
    }

    // ── Profiler Panel ────────────────────────────────────────────────────────
    const px = 1280 - 340;
    const py = 85;
    const boxH = metrics.length * 17 + 24;
    ctx.fillStyle = 'rgba(4, 9, 24, 0.92)';
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.fillRect(px, py, 300, boxH);
    ctx.strokeRect(px, py, 300, boxH);
    ctx.font = '700 11px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    metrics.forEach((line, i) => {
      ctx.fillStyle = i === 0 ? '#00f0ff' : line.includes('LOW') ? '#ffaa00' : 'rgba(255,255,255,0.88)';
      ctx.fillText(line, px + 12, py + 12 + i * 17);
    });

    ctx.restore();
  }
}
