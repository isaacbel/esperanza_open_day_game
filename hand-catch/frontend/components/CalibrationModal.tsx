'use client';

import React, { useEffect, useState } from 'react';
import { handTracker } from '../vision/HandTracker';
import { CameraQualityReport } from '../vision/CameraQualityDetector';

interface CalibrationModalProps {
  handsCount: number;
  onReady: () => void;
  onCancel: () => void;
  onPlayWithMouse?: () => void;
}

export const CalibrationModal: React.FC<CalibrationModalProps> = ({
  handsCount,
  onReady,
  onCancel,
  onPlayWithMouse
}) => {
  const [step, setStep] = useState<'SETUP' | 'SWEEP_LEFT' | 'SWEEP_RIGHT' | 'RAISE_UP' | 'CONFIRMED'>('SETUP');
  const [quality, setQuality] = useState<CameraQualityReport>(() => handTracker.getQualityReport());
  const [calibratedBounds, setCalibratedBounds] = useState({ minX: 640, maxX: 640, minY: 360, maxY: 360 });
  const previewCanvasRef = React.useRef<HTMLCanvasElement | null>(null);

  // Render live camera feed into the preview viewfinder
  useEffect(() => {
    let animId: number;

    const renderPreview = () => {
      const canvas = previewCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const w = canvas.width;
          const h = canvas.height;

          // Clear
          ctx.fillStyle = '#050a18';
          ctx.fillRect(0, 0, w, h);

          // Draw live video if available
          if (handTracker.video && handTracker.video.readyState >= 2) {
            ctx.save();
            ctx.translate(w, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(handTracker.video, 0, 0, w, h);
            ctx.restore();

            // Subtle cyber grid overlay
            ctx.strokeStyle = 'rgba(0, 240, 255, 0.12)';
            ctx.lineWidth = 1;
            ctx.strokeRect(8, 8, w - 16, h - 16);
            ctx.strokeRect(w * 0.25, h * 0.25, w * 0.5, h * 0.5);

            // Draw tracked hands preview
            const hands = handTracker.getTrackedHands();
            for (const hand of hands) {
              if (!hand.active) continue;
              // Normalize game coordinates (1280x720) to preview canvas (w x h)
              const px = (hand.palm.x / 1280) * w;
              const py = (hand.palm.y / 720) * h;

              // Palm ring
              ctx.strokeStyle = hand.color || '#00f0ff';
              ctx.fillStyle = hand.colorGlow || 'rgba(0, 240, 255, 0.3)';
              ctx.lineWidth = 2.5;
              ctx.beginPath();
              ctx.arc(px, py, 18, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();

              // Fingertips
              for (const tip of hand.fingertips) {
                const tx = (tip.x / 1280) * w;
                const ty = (tip.y / 720) * h;
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(tx, ty, 3, 0, Math.PI * 2);
                ctx.fill();
              }
            }
          } else {
            // Placeholder when video is loading or mouse mode is active
            ctx.fillStyle = 'rgba(0, 240, 255, 0.05)';
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.font = '12px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('CAMERA FEED CONNECTING...', w / 2, h / 2);
          }
        }
      }
      animId = requestAnimationFrame(renderPreview);
    };

    animId = requestAnimationFrame(renderPreview);
    return () => cancelAnimationFrame(animId);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      const rep = handTracker.getQualityReport();
      setQuality(rep);

      // Track bounding range during calibration steps
      const hands = handTracker.getTrackedHands();
      if (hands.length > 0) {
        setCalibratedBounds(prev => {
          let nMinX = prev.minX;
          let nMaxX = prev.maxX;
          let nMinY = prev.minY;
          let nMaxY = prev.maxY;
          for (const h of hands) {
            nMinX = Math.min(nMinX, h.palm.x);
            nMaxX = Math.max(nMaxX, h.palm.x);
            nMinY = Math.min(nMinY, h.palm.y);
            nMaxY = Math.max(nMaxY, h.palm.y);
          }
          return { minX: nMinX, maxX: nMaxX, minY: nMinY, maxY: nMaxY };
        });
      }
    }, 200);

    return () => clearInterval(timer);
  }, []);

  const handleStartCalibration = () => {
    setStep('SWEEP_LEFT');
    setTimeout(() => setStep('SWEEP_RIGHT'), 1400);
    setTimeout(() => setStep('RAISE_UP'), 2800);
    setTimeout(() => setStep('CONFIRMED'), 4200);
  };

  const isVideoStreaming = handTracker.video && handTracker.video.readyState >= 2;
  const vw = handTracker.video?.videoWidth || 1280;
  const vh = handTracker.video?.videoHeight || 720;

  return (
    <div className="ui-layer" role="dialog" aria-modal="true">
      <div className="glass-panel card-center" style={{ maxWidth: 540 }}>
        {step === 'SETUP' && (
          <>
            <h2 className="modal-title" style={{ color: 'var(--neon-cyan)', fontSize: 26, textAlign: 'center' }}>
              {handsCount > 0 ? 'HANDS DETECTED!' : 'PILOT ALIGNMENT'}
            </h2>
            <p className="modal-subtitle" style={{ textAlign: 'center' }}>
              {handsCount > 0
                ? `${handsCount} hand${handsCount === 1 ? '' : 's'} locked on target.`
                : 'Raise your hands in front of the camera.'}
            </p>

            {/* Live Camera Viewfinder Screen */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              margin: '14px 0 10px',
              position: 'relative'
            }}>
              <div style={{
                position: 'relative',
                borderRadius: 10,
                overflow: 'hidden',
                border: '2px solid rgba(0, 240, 255, 0.4)',
                boxShadow: '0 0 20px rgba(0, 240, 255, 0.25)',
                background: '#040816'
              }}>
                <canvas
                  ref={previewCanvasRef}
                  width={320}
                  height={180}
                  style={{ display: 'block', width: 320, height: 180 }}
                />
                <div style={{
                  position: 'absolute',
                  top: 6,
                  left: 8,
                  fontSize: 10,
                  fontFamily: 'monospace',
                  background: 'rgba(0, 0, 0, 0.65)',
                  padding: '2px 6px',
                  borderRadius: 4,
                  color: isVideoStreaming ? '#00f0ff' : '#ffaa00',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5
                }}>
                  <span style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: isVideoStreaming ? '#00ff88' : '#ffaa00'
                  }} />
                  {isVideoStreaming ? `LIVE ${vw}×${vh}` : 'CONNECTING'}
                </div>
                <div style={{
                  position: 'absolute',
                  bottom: 6,
                  right: 8,
                  fontSize: 10,
                  fontFamily: 'monospace',
                  background: 'rgba(0, 0, 0, 0.65)',
                  padding: '2px 6px',
                  borderRadius: 4,
                  color: handsCount > 0 ? '#00ff88' : '#ffffff'
                }}>
                  {handsCount > 0 ? `✋ ${handsCount} DETECTED` : '⏳ WAITING FOR HANDS'}
                </div>
              </div>
            </div>

            {/* Live Camera Framing Guidance */}
            <div style={{
              background: 'rgba(0, 240, 255, 0.08)',
              border: '1px solid rgba(0, 240, 255, 0.25)',
              borderRadius: 8,
              padding: '10px 14px',
              margin: '10px 0 16px',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              color: quality.isLowLight ? 'var(--neon-gold)' : 'var(--neon-cyan)'
            }}>
              <span style={{ fontSize: 16 }}>
                {quality.isLowLight ? '💡' : quality.guidance === 'PERFECT' ? '✅' : '🎯'}
              </span>
              <div>
                <strong>Position Guidance:</strong> {quality.statusText}
              </div>
            </div>

            <div className="btn-group" style={{ marginTop: 16, display: 'flex', gap: 10 }}>
              <button
                type="button"
                className="btn-primary-glow"
                onClick={onReady}
                style={{ flex: 1.2 }}
              >
                READY TO PLAY!
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleStartCalibration}
                style={{ flex: 1 }}
              >
                CALIBRATE (4s)
              </button>
            </div>

            <div style={{
              marginTop: 14,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              paddingTop: 10
            }}>
              {onPlayWithMouse && (
                <button
                  type="button"
                  onClick={onPlayWithMouse}
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(0, 240, 255, 0.35)',
                    borderRadius: 6,
                    color: 'var(--neon-cyan)',
                    fontSize: 12,
                    padding: '6px 12px',
                    cursor: 'pointer'
                  }}
                >
                  🖱️ Play with Mouse instead
                </button>
              )}
              <button
                type="button"
                onClick={onCancel}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'rgba(255, 255, 255, 0.45)',
                  fontSize: 12,
                  cursor: 'pointer'
                }}
              >
                Abort to Menu
              </button>
            </div>
          </>
        )}

        {step === 'SWEEP_LEFT' && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <h2 className="modal-title" style={{ color: 'var(--neon-cyan)' }}>STEP 1 / 3</h2>
            <p className="modal-subtitle" style={{ fontSize: 18, color: '#ffffff' }}>
              Move hands to the <strong>LEFT</strong> edge of your screen
            </p>
            <div style={{ fontSize: 44, margin: '18px 0' }}>⬅️ ✋</div>
            <button type="button" className="btn-secondary" onClick={onReady}>SKIP</button>
          </div>
        )}

        {step === 'SWEEP_RIGHT' && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <h2 className="modal-title" style={{ color: 'var(--neon-magenta)' }}>STEP 2 / 3</h2>
            <p className="modal-subtitle" style={{ fontSize: 18, color: '#ffffff' }}>
              Move hands to the <strong>RIGHT</strong> edge of your screen
            </p>
            <div style={{ fontSize: 44, margin: '18px 0' }}>✋ ➡️</div>
            <button type="button" className="btn-secondary" onClick={onReady}>SKIP</button>
          </div>
        )}

        {step === 'RAISE_UP' && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <h2 className="modal-title" style={{ color: 'var(--neon-gold)' }}>STEP 3 / 3</h2>
            <p className="modal-subtitle" style={{ fontSize: 18, color: '#ffffff' }}>
              <strong>RAISE</strong> your hands up high
            </p>
            <div style={{ fontSize: 44, margin: '18px 0' }}>⬆️ 🙌</div>
            <button type="button" className="btn-secondary" onClick={onReady}>SKIP</button>
          </div>
        )}

        {step === 'CONFIRMED' && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <h2 className="modal-title" style={{ color: 'var(--neon-cyan)' }}>CALIBRATION COMPLETE!</h2>
            <p className="modal-subtitle" style={{ color: '#ffffff' }}>
              Reach Range: {Math.round(calibratedBounds.maxX - calibratedBounds.minX)}px span mapped.
            </p>
            <div style={{ marginTop: 24 }}>
              <button type="button" className="btn-primary-glow" onClick={onReady} style={{ width: '100%' }}>
                LAUNCH MISSION!
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
