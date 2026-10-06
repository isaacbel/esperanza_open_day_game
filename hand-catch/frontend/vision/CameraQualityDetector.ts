/**
 * CameraQualityDetector.ts - Real-Time Lighting, Framing & Player Distance Monitor
 *
 * Lightweight monitor that runs on a low-frequency timer (every 600ms) to:
 *   1. Sample camera luminance to detect dark environments
 *   2. Evaluate player distance based on detected hand scale
 *   3. Evaluate horizontal centering
 *   4. Provide actionable, non-intrusive HUD advice
 */
import { CameraGuidance, TrackedHandData } from './HandTypes';

export interface CameraQualityReport {
  luminance: number;       // 0 (pitch black) to 255 (bright)
  isLowLight: boolean;
  guidance: CameraGuidance;
  statusText: string;
}

export class CameraQualityDetector {
  private sampleCanvas: HTMLCanvasElement | null = null;
  private sampleCtx: CanvasRenderingContext2D | null = null;
  private lastSampleTime: number = 0;
  private sampleIntervalMs: number = 600;

  private currentReport: CameraQualityReport = {
    luminance: 128,
    isLowLight: false,
    guidance: 'RAISE_HANDS',
    statusText: 'System Ready'
  };

  constructor() {
    if (typeof document !== 'undefined') {
      this.sampleCanvas = document.createElement('canvas');
      this.sampleCanvas.width = 64;
      this.sampleCanvas.height = 36;
      this.sampleCtx = this.sampleCanvas.getContext('2d', { willReadFrequently: true });
    }
  }

  public update(video: HTMLVideoElement | null, trackedHands: TrackedHandData[], now: number): CameraQualityReport {
    if (now - this.lastSampleTime < this.sampleIntervalMs) {
      return this.currentReport;
    }
    this.lastSampleTime = now;

    // 1. Evaluate Luminance / Low Light
    let luminance = 128;
    if (video && video.readyState >= 2 && this.sampleCtx && this.sampleCanvas) {
      try {
        this.sampleCtx.drawImage(video, 0, 0, 64, 36);
        const imgData = this.sampleCtx.getImageData(0, 0, 64, 36);
        const data = imgData.data;
        let sum = 0;
        // Sample every 4th pixel for speed
        const step = 4 * 4;
        let samples = 0;
        for (let i = 0; i < data.length; i += step) {
          // Standard ITU-R BT.601 luminance
          sum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
          samples++;
        }
        luminance = sum / Math.max(1, samples);
      } catch {
        /* Ignore cross-origin or video read errors */
      }
    }

    const isLowLight = luminance < 42;

    // 2. Evaluate Player Framing & Distance from Hands
    let guidance: CameraGuidance = 'RAISE_HANDS';
    let statusText = 'Raise your hands to start';

    if (isLowLight) {
      guidance = 'LOW_LIGHT';
      statusText = 'Lighting is low — move to a brighter area';
    } else if (trackedHands.length === 0) {
      guidance = 'RAISE_HANDS';
      statusText = 'Raise your hands to track';
    } else {
      // Analyze average hand scale and centering
      const avgScale = trackedHands.reduce((acc, h) => acc + h.scale, 0) / trackedHands.length;
      const avgX = trackedHands.reduce((acc, h) => acc + h.palm.x, 0) / trackedHands.length;

      if (avgScale > 130) {
        guidance = 'TOO_CLOSE';
        statusText = 'Move slightly farther from the camera';
      } else if (avgScale < 38) {
        guidance = 'TOO_FAR';
        statusText = 'Move slightly closer to the camera';
      } else if (avgX < 260) {
        guidance = 'MOVE_RIGHT';
        statusText = 'Move slightly right to center';
      } else if (avgX > 1020) {
        guidance = 'MOVE_LEFT';
        statusText = 'Move slightly left to center';
      } else {
        guidance = 'PERFECT';
        statusText = 'Perfect position — hands calibrated';
      }
    }

    this.currentReport = {
      luminance,
      isLowLight,
      guidance,
      statusText
    };

    return this.currentReport;
  }

  public getReport(): CameraQualityReport {
    return this.currentReport;
  }
}
