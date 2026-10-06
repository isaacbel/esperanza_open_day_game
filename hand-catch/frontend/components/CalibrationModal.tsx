'use client';

import React, { useEffect, useState } from 'react';
import { handTracker } from '../vision/HandTracker';
import { CameraQualityReport } from '../vision/CameraQualityDetector';

interface CalibrationModalProps {
  handsCount: number;
  onReady: () => void;
  onCancel: () => void;
}

export const CalibrationModal: React.FC<CalibrationModalProps> = ({
  handsCount,
  onReady,
  onCancel
}) => {
  const [step, setStep] = useState<'SETUP' | 'SWEEP_LEFT' | 'SWEEP_RIGHT' | 'RAISE_UP' | 'CONFIRMED'>('SETUP');
  const [quality, setQuality] = useState<CameraQualityReport>(() => handTracker.getQualityReport());
  const [calibratedBounds, setCalibratedBounds] = useState({ minX: 640, maxX: 640, minY: 360, maxY: 360 });

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

  return (
    <div className="ui-layer" role="dialog" aria-modal="true">
      <div className="glass-panel card-center" style={{ maxWidth: 540 }}>
        {step === 'SETUP' && (
          <>
            <h2 className="modal-title" style={{ color: 'var(--neon-cyan)', fontSize: 26 }}>
              {handsCount > 0 ? 'HANDS DETECTED!' : 'PILOT ALIGNMENT'}
            </h2>
            <p className="modal-subtitle">
              {handsCount > 0
                ? `${handsCount} hand${handsCount === 1 ? '' : 's'} locked on target.`
                : 'Raise your hands in front of the camera.'}
            </p>

            {/* Live Camera Framing Guidance */}
            <div style={{
              background: 'rgba(0, 240, 255, 0.08)',
              border: '1px solid rgba(0, 240, 255, 0.25)',
              borderRadius: 8,
              padding: '12px 16px',
              margin: '16px 0',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              color: quality.isLowLight ? 'var(--neon-gold)' : 'var(--neon-cyan)'
            }}>
              <span style={{ fontSize: 18 }}>
                {quality.isLowLight ? '💡' : quality.guidance === 'PERFECT' ? '✅' : '🎯'}
              </span>
              <div>
                <strong>Position Guidance:</strong> {quality.statusText}
              </div>
            </div>

            <div className="btn-group" style={{ marginTop: 24 }}>
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
                CALIBRATE REACH (4s)
              </button>
            </div>
            <div style={{ marginTop: 12, textAlign: 'center' }}>
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
