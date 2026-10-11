/**
 * HandTracker.ts - Production Multi-Stage AI Hand Tracking Engine (v2)
 *
 * Full human hand model pipeline:
 *   WEBCAM → VIDEO FRAME → HAND LANDMARK DETECTION → LANDMARK VALIDATION →
 *   COORDINATE TRANSFORMATION → PALM & SCALE ESTIMATION → HAND ID TRACKING →
 *   POSITION SMOOTHING → VELOCITY/ACCELERATION → POSE ANALYSIS (HandPoseAnalyzer) →
 *   MOVEMENT CLASSIFICATION (MovementClassifier) → GESTURE EVENTS (GestureEventBus) →
 *   GAME ENGINE
 */import {
  Point2D, Point3D, TrackedHandData, TrackingStatus, HandPose,
  MovementClass, PalmOrientation, FingerState, HandFrame
} from './HandTypes';
import { GAME_CONFIG } from '../game/GameConfig';
import { OneEuroFilter } from './HandSmoothing';
import { CoordinateMapper } from './CoordinateMapper';
import { PalmCenterEstimator } from './PalmCenterEstimator';
import { LandmarkValidator, RawLandmark } from './LandmarkValidator';
import { HandIdentityTracker, DetectionCandidate } from './HandIdentityTracker';
import { VelocityPredictor } from './VelocityPredictor';
import { GestureDetector } from './GestureDetector';
import { CameraQualityDetector, CameraQualityReport } from './CameraQualityDetector';
import { SyntheticTrajectory, SyntheticPattern } from './SyntheticTrajectory';
import { HandPoseAnalyzer } from './HandPoseAnalyzer';
import { MovementClassifier } from './MovementClassifier';
import { HandGestureStateMachine, gestureEventBus } from './GestureEventBus';

// ---- TrackedHandState -------------------------------------------------------

class TrackedHandState {
  public trackId: number;
  public index: number;
  public active: boolean = true;
  public isGhost: boolean = false;
  public opacity: number = 1.0;
  public lastSeenTime: number = performance.now();
  public color: string;
  public colorGlow: string;
  public handedness: string = 'Unknown';
  public scale: number = 60;
  public confidence: number = 0.9;

  public pose: HandPose = 'OPEN_HAND';
  public openness: number = 0.8;
  public depthEstimate: number = 0.3;
  public orientation: PalmOrientation = { normalX: 0, normalY: 1, facingCamera: true, rollAngle: 0, tiltAngle: 0 };
  public fingers: FingerState[] = [];
  public stabilityScore: number = 1.0;

  public vx: number = 0;
  public vy: number = 0;
  public ax: number = 0;
  public ay: number = 0;
  public speed: number = 0;
  public acceleration: number = 0;

  public movement: MovementClass = 'IDLE';
  public reachingScore: number = 0;

  public palm = { x: 640, y: 360, prevX: 640, prevY: 360, radius: 55 };
  public predictedPalm: Point2D = { x: 640, y: 360 };
  public fingertips: { x: number; y: number; prevX: number; prevY: number; radius: number }[] = [];
  public predictedFingertips: Point2D[] = [];
  public landmarks: Point2D[] = [];
  public landmarks3D: Point3D[] = [];
  public history: HandFrame[] = [];

  public filterPalmX: OneEuroFilter;
  public filterPalmY: OneEuroFilter;
  public filterScale: OneEuroFilter;
  public filterTipX: OneEuroFilter[];
  public filterTipY: OneEuroFilter[];
  public filterLmX: OneEuroFilter[];
  public filterLmY: OneEuroFilter[];

  public velocityPredictor: VelocityPredictor = new VelocityPredictor();
  public movementClassifier: MovementClassifier = new MovementClassifier();
  public gestureFSM: HandGestureStateMachine = new HandGestureStateMachine(gestureEventBus);

  constructor(trackId: number, index: number) {
    this.trackId = trackId;
    this.index = index;
    this.color = index === 0 ? '#00f0ff' : '#ff00b7';
    this.colorGlow = index === 0 ? 'rgba(0, 240, 255, 0.45)' : 'rgba(255, 0, 183, 0.45)';
    const minCut = GAME_CONFIG.oneEuroMinCutoff;
    const beta   = GAME_CONFIG.oneEuroBeta;
    const dCut   = GAME_CONFIG.oneEuroDCutoff;
    this.filterPalmX  = new OneEuroFilter(minCut, beta, dCut);
    this.filterPalmY  = new OneEuroFilter(minCut, beta, dCut);
    this.filterScale  = new OneEuroFilter(minCut * 0.5, beta * 0.5, dCut);
    this.filterTipX   = Array.from({ length: 5  }, () => new OneEuroFilter(minCut, beta, dCut));
    this.filterTipY   = Array.from({ length: 5  }, () => new OneEuroFilter(minCut, beta, dCut));
    this.filterLmX    = Array.from({ length: 21 }, () => new OneEuroFilter(minCut, beta, dCut));
    this.filterLmY    = Array.from({ length: 21 }, () => new OneEuroFilter(minCut, beta, dCut));
  }

  public updateGhost(now: number): void {
    const elapsed = now - this.lastSeenTime;
    const dt = Math.max(0.001, elapsed / 1000);
    if (elapsed < 150) {
      this.isGhost = true; this.active = true; this.opacity = 0.95;
      this.palm.prevX = this.palm.x; this.palm.prevY = this.palm.y;
      this.palm.x += this.vx * dt * 0.7; this.palm.y += this.vy * dt * 0.7;
      this.predictedPalm.x = this.palm.x; this.predictedPalm.y = this.palm.y;
    } else if (elapsed < 300) {
      this.isGhost = true; this.active = true; this.opacity = 0.65;
    } else if (elapsed < 600) {
      this.isGhost = true;
      this.opacity = Math.max(0.1, 0.65 * (1 - (elapsed - 300) / 300));
      this.palm.radius *= 0.98; this.active = false;
    } else {
      this.isGhost = true; this.opacity = 0; this.active = false;
    }
  }

  public pushHistory(now: number): void {
    const frame: HandFrame = {
      timestamp: now, palmX: this.palm.x, palmY: this.palm.y,
      scale: this.scale, pose: this.pose, depthEstimate: this.depthEstimate,
      confidence: this.confidence, openness: this.openness,
    };
    this.history.push(frame);
    if (this.history.length > 30) this.history.shift();
    this.movementClassifier.addFrame(frame);
  }

  public toData(): TrackedHandData {
    return {
      trackId: this.trackId, index: this.index, active: this.active,
      isGhost: this.isGhost, opacity: this.opacity,
      color: this.color, colorGlow: this.colorGlow, handedness: this.handedness,
      scale: this.scale, depthEstimate: this.depthEstimate,
      vx: this.vx, vy: this.vy, ax: this.ax, ay: this.ay,
      speed: this.speed, acceleration: this.acceleration,
      pose: this.pose, gesture: this.pose,
      openness: this.openness,
      orientation: { ...this.orientation },
      fingers: this.fingers.map(f => ({ ...f, tip: { ...f.tip }, mcp: { ...f.mcp }, pip: { ...f.pip }, dip: { ...f.dip } })),
      movement: this.movement, reachingScore: this.reachingScore,
      palm: { ...this.palm }, predictedPalm: { ...this.predictedPalm },
      fingertips: this.fingertips.map(t => ({ ...t })),
      predictedFingertips: this.predictedFingertips.map(t => ({ ...t })),
      landmarks: this.landmarks.map(l => ({ ...l })),
      landmarks3D: this.landmarks3D.map(l => ({ ...l })),
      confidence: this.confidence, stabilityScore: this.stabilityScore,
      history: this.history.slice(-10),
    };
  }
}

// ---- HandTracker ------------------------------------------------------------

export class HandTracker {
  public video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handLandmarker: any = null;
  public status: TrackingStatus = 'IDLE';
  public activeDelegate: 'GPU' | 'CPU' = 'GPU';
  public trackingFps: number = 0;
  public inferenceMs: number = 0;
  private lastInferenceTime: number = 0;
  private trackingFrameCount: number = 0;
  private lastFpsSampleTime: number = performance.now();
  private isLoopRunning: boolean = false;
  private trackedHands: Map<number, TrackedHandState> = new Map();
  private nextTrackId: number = 1;
  public lastAnyHandSeenTime: number = 0;
  public mapper: CoordinateMapper = new CoordinateMapper();
  public qualityDetector: CameraQualityDetector = new CameraQualityDetector();
  public onError?: (error: Error) => void;
  private statusListeners: Set<(status: TrackingStatus, handsCount: number) => void> = new Set();
  public mouseTestMode: boolean = false;
  private mousePos = { x: 640, y: 360, vx: 0, vy: 0 };
  private mousePrevPos = { x: 640, y: 360 };
  private mouseLastTime = performance.now();
  public syntheticPattern: SyntheticPattern | null = null;
  private syntheticTrajectory: SyntheticTrajectory = new SyntheticTrajectory();

  constructor() { this.checkTestModesFromUrl(); }

  private checkTestModesFromUrl(): void {
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('mouse') === '1') this.enableMouseTestMode(true);
      const syn = params.get('synthetic') as SyntheticPattern;
      if (syn && ['straight','circle','zigzag','fast','twoHandsCrossing'].includes(syn)) {
        this.syntheticPattern = syn; this.setStatus('ACTIVE');
      }
    } catch (_) {}
  }

  public enableMouseTestMode(enable: boolean = true): void {
    this.mouseTestMode = enable;
    if (enable && typeof window !== 'undefined') {
      this.setStatus('ACTIVE');
      window.addEventListener('mousemove', (e) => {
        if (!this.mouseTestMode) return;
        const gc = this.mapper.canvasToGame(e.clientX, e.clientY);
        const now = performance.now();
        const dt = Math.max(0.001, (now - this.mouseLastTime) / 1000);
        this.mousePos.vx = (gc.x - this.mousePos.x) / dt;
        this.mousePos.vy = (gc.y - this.mousePos.y) / dt;
        this.mousePrevPos.x = this.mousePos.x; this.mousePrevPos.y = this.mousePos.y;
        this.mousePos.x = gc.x; this.mousePos.y = gc.y;
        this.mouseLastTime = now; this.lastAnyHandSeenTime = now;
      });
    }
  }

  public onStatusChange(cb: (status: TrackingStatus, handsCount: number) => void): () => void {
    this.statusListeners.add(cb); return () => this.statusListeners.delete(cb);
  }

  private lastBroadcastStatus: TrackingStatus | null = null;
  private lastBroadcastHandsCount: number = -1;

  private setStatus(status: TrackingStatus): void {
    this.status = status;
    const handsCount = this.getTrackedHandsCount();
    if (status === this.lastBroadcastStatus && handsCount === this.lastBroadcastHandsCount) return;
    this.lastBroadcastStatus = status; this.lastBroadcastHandsCount = handsCount;
    for (const cb of this.statusListeners) cb(status, handsCount);
  }

  public getTrackedHandsCount(): number {
    if (this.mouseTestMode || this.syntheticPattern) return 1;
    let n = 0;
    for (const h of this.trackedHands.values()) if (h.active && !h.isGhost) n++;
    return n;
  }

  public async initialize(): Promise<void> {
    // If already fully active, do nothing
    if (this.status === 'ACTIVE' && this.handLandmarker && this.stream) return;
    // Clean up any previous partial init before retrying
    if (this.status === 'ERROR' || this.stream) {
      console.log('[HandTracker] Cleaning up previous init before retry...');
      this.isLoopRunning = false;
      this.stream?.getTracks().forEach(t => t.stop());
      this.stream = null;
      // Don't null the video element, just clear its srcObject
      if (this.video) this.video.srcObject = null;
      this.handLandmarker = null;
    }
    await this.startCamera();
    await this.initMediaPipe();
  }

  public waitUntilReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.status === 'ACTIVE') { resolve(); return; }
      if (this.status === 'ERROR') { reject(new Error('HandTracker ERROR state')); return; }
      const unsub = this.onStatusChange((s) => {
        if (s === 'ACTIVE') { unsub(); resolve(); }
        else if (s === 'ERROR') { unsub(); reject(new Error('HandTracker entered ERROR')); }
      });
    });
  }

  private lastTimestampMs: number = 0;
  public selectedDeviceId: string | null = null;

  public async getAvailableVideoDevices(): Promise<MediaDeviceInfo[]> {
    if (typeof window === 'undefined' || !navigator?.mediaDevices?.enumerateDevices) return [];
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(d => d.kind === 'videoinput');
    } catch {
      return [];
    }
  }

  public async startCamera(): Promise<boolean> {
    this.setStatus('REQUESTING_CAMERA');
    if (typeof window === 'undefined' || !navigator?.mediaDevices?.getUserMedia) {
      const err = new Error('Camera API (getUserMedia) not supported in this browser environment.');
      err.name = 'NotSupportedError';
      this.setStatus('ERROR');
      if (this.onError) this.onError(err);
      throw err;
    }

    const constraintTiers: MediaStreamConstraints[] = this.selectedDeviceId
      ? [
          { video: { deviceId: { exact: this.selectedDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
          { video: { deviceId: { exact: this.selectedDeviceId } }, audio: false }
        ]
      : [
          { video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
          { video: { facingMode: 'user' }, audio: false },
          { video: true, audio: false }
        ];

    let stream: MediaStream | null = null;
    let lastErr: unknown = null;

    for (const constraints of constraintTiers) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (stream) break;
      } catch (e: unknown) {
        lastErr = e;
        // If user explicitly denied permission, break immediately instead of triggering repeated popups
        if (e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError')) {
          break;
        }
        console.warn('getUserMedia tier failed, trying next tier...', constraints, e);
      }
    }

    if (!stream) {
      this.setStatus('ERROR');
      const err = lastErr instanceof Error ? lastErr : new Error('Failed to acquire webcam stream.');
      if (this.onError && err instanceof Error) this.onError(err);
      throw err;
    }

    this.stream = stream;

    // Create or reuse hidden offscreen video element
    // NOTE: Keep width/height realistic (640x480) and position offscreen (-9999px)
    // Avoid 1px x 1px and opacity 0.001 which causes Chromium video frame throttling/pausing!
    if (!this.video) {
      this.video = document.createElement('video');
    }
    this.video.setAttribute('playsinline', 'true');
    this.video.setAttribute('webkit-playsinline', 'true');
    this.video.muted = true;
    this.video.autoplay = true;
    this.video.playsInline = true;
    this.video.style.position = 'fixed';
    this.video.style.top = '-9999px';
    this.video.style.left = '-9999px';
    this.video.style.width = '640px';
    this.video.style.height = '480px';
    this.video.style.pointerEvents = 'none';
    this.video.style.zIndex = '-99999';

    if (typeof document !== 'undefined' && !document.body.contains(this.video)) {
      document.body.appendChild(this.video);
    }

    this.video.srcObject = this.stream;

    const track = this.stream.getVideoTracks()[0];
    if (track) {
      track.onended = () => {
        console.warn('Webcam stream ended by OS/browser');
        this.setStatus('ERROR');
      };
    }

    await new Promise<void>((resolve, reject) => {
      if (!this.video) return reject(new Error('Video element destroyed'));

      let resolved = false;
      let safetyTimer: ReturnType<typeof setTimeout> | null = null;

      const finish = () => {
        if (resolved) return;
        resolved = true;
        if (safetyTimer) clearTimeout(safetyTimer);
        resolve();
      };

      // 5-second safety timer so video element preparation never hangs indefinitely
      safetyTimer = setTimeout(() => {
        console.warn('[HandTracker] Video play safety timeout reached (5000ms), proceeding with stream.');
        finish();
      }, 5000);

      const tryPlay = () => {
        if (!this.video || resolved) return;
        const playPromise = this.video.play();
        if (playPromise !== undefined) {
          playPromise.then(finish).catch((err) => {
            console.warn('[HandTracker] Video play warning:', err);
            finish();
          });
        } else {
          finish();
        }
      };

      if (this.video.readyState >= 2 && this.video.videoWidth > 0) {
        tryPlay();
      } else {
        this.video.onloadedmetadata = () => tryPlay();
        this.video.oncanplay = () => tryPlay();
        this.video.onloadeddata = () => finish();
        this.video.onerror = (e) => {
          if (safetyTimer) clearTimeout(safetyTimer);
          reject(new Error(`Webcam video load error: ${e}`));
        };
        setTimeout(tryPlay, 350);
      }
    });

    this.setStatus('CAMERA_READY');
    const vw = this.video.videoWidth || 1280;
    const vh = this.video.videoHeight || 720;
    this.mapper.updateViewport(
      this.mapper.getTransform().canvasWidth,
      this.mapper.getTransform().canvasHeight,
      vw,
      vh
    );
    return true;
  }

  public async initMediaPipe(): Promise<boolean> {
    this.setStatus('INIT_TRACKING');
    // Wrap async operations in timeouts to prevent silent hangs
    const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timeout (${ms}ms) waiting for: ${label}`)), ms);
        promise.then(v => { clearTimeout(timer); resolve(v); }).catch(e => { clearTimeout(timer); reject(e); });
      });
    };

    try {
      console.log('[HandTracker] Loading MediaPipe vision module...');
      const vision = await withTimeout(import('@mediapipe/tasks-vision'), 10000, 'mediapipe module import');

      // Multi-tier WASM resolution: Local /wasm first, then CDN fallbacks
      const wasmLocations = [
        typeof window !== 'undefined' ? `${window.location.origin}/wasm` : '/wasm',
        GAME_CONFIG.mediaPipeVisionWasmUrl,
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
        'https://unpkg.com/@mediapipe/tasks-vision@0.10.14/wasm'
      ];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let fileset: any = null;
      let filesetErr: unknown = null;

      for (const loc of wasmLocations) {
        try {
          console.log('[HandTracker] Attempting FilesetResolver from:', loc);
          fileset = await withTimeout(
            vision.FilesetResolver.forVisionTasks(loc),
            6000,
            `FilesetResolver (${loc})`
          );
          if (fileset) {
            console.log('[HandTracker] FilesetResolver resolved successfully from:', loc);
            break;
          }
        } catch (e) {
          filesetErr = e;
          console.warn(`[HandTracker] FilesetResolver failed at ${loc}, trying next tier...`, e);
        }
      }

      if (!fileset) {
        throw filesetErr || new Error('Failed to resolve MediaPipe FilesetResolver from all candidate sources.');
      }

      const common = {
        runningMode: 'VIDEO' as const,
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      };

      // Multi-tier model resolution: Local /models first, then Google Cloud Storage CDN
      const modelLocations = [
        typeof window !== 'undefined' ? `${window.location.origin}/models/hand_landmarker.task` : '/models/hand_landmarker.task',
        GAME_CONFIG.mediaPipeModelAssetPath,
        'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
      ];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let landmarkerInstance: any = null;
      let lastModelErr: unknown = null;

      for (const modelPath of modelLocations) {
        // First try GPU
        try {
          console.log('[HandTracker] Creating HandLandmarker (GPU) from:', modelPath);
          landmarkerInstance = await withTimeout(
            vision.HandLandmarker.createFromOptions(fileset, {
              baseOptions: { modelAssetPath: modelPath, delegate: 'GPU' as const },
              ...common,
            }),
            8000,
            `HandLandmarker GPU (${modelPath})`
          );
          this.activeDelegate = 'GPU';
          console.log('[HandTracker] HandLandmarker created on GPU ✓');
          break;
        } catch (gpuErr) {
          console.warn(`[HandTracker] GPU delegate failed for ${modelPath}, trying CPU...`, gpuErr);
          // Fallback to CPU for this model
          try {
            landmarkerInstance = await withTimeout(
              vision.HandLandmarker.createFromOptions(fileset, {
                baseOptions: { modelAssetPath: modelPath, delegate: 'CPU' as const },
                ...common,
              }),
              8000,
              `HandLandmarker CPU (${modelPath})`
            );
            this.activeDelegate = 'CPU';
            console.log('[HandTracker] HandLandmarker created on CPU ✓');
            break;
          } catch (cpuErr) {
            lastModelErr = cpuErr;
            console.warn(`[HandTracker] CPU delegate also failed for ${modelPath}:`, cpuErr);
          }
        }
      }

      if (!landmarkerInstance) {
        throw lastModelErr || new Error('Failed to create HandLandmarker from all candidate model paths.');
      }

      this.handLandmarker = landmarkerInstance;
      this.startInferenceLoop();
      this.setStatus('ACTIVE');
      return true;
    } catch (err: unknown) {
      console.error('[HandTracker] FATAL: Failed to initialize MediaPipe HandLandmarker:', err);
      this.setStatus('ERROR');
      if (this.onError && err instanceof Error) this.onError(err);
      throw err;
    }
  }

  private startInferenceLoop(): void {
    if (this.isLoopRunning) return;
    this.isLoopRunning = true;

    const processFrame = () => {
      if (!this.isLoopRunning) return;

      if (this.video && this.video.paused) {
        this.video.play().catch(() => {});
      }

      if (
        this.video &&
        this.video.readyState >= 2 &&
        this.video.videoWidth > 0 &&
        this.handLandmarker
      ) {
        let nowMs = performance.now();
        if (nowMs <= this.lastTimestampMs) {
          nowMs = this.lastTimestampMs + 1;
        }
        this.lastTimestampMs = nowMs;

        const startT = performance.now();
        try {
          const results = this.handLandmarker.detectForVideo(this.video, nowMs);
          this.inferenceMs = Math.round(performance.now() - startT);
          this.trackingFrameCount++;
          this.processDetectionResults(results, nowMs);
        } catch (e) {
          console.debug('HandLandmarker inference frame warning:', e);
        }

        const now = performance.now();
        if (now - this.lastFpsSampleTime >= 1000) {
          this.trackingFps = Math.round((this.trackingFrameCount * 1000) / (now - this.lastFpsSampleTime));
          this.trackingFrameCount = 0;
          this.lastFpsSampleTime = now;
        }
      }

      requestAnimationFrame(processFrame);
    };

    requestAnimationFrame(processFrame);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private processDetectionResults(results: any, now: number): void {
    if (!results?.landmarks?.length) {
      if (now - this.lastAnyHandSeenTime > GAME_CONFIG.noHandThresholdMs) this.setStatus('NO_HANDS');
      for (const hand of this.trackedHands.values()) {
        const wasActive = hand.active;
        hand.updateGhost(now);
        if (wasActive && !hand.active) hand.gestureFSM.lostHand(hand.trackId, now);
      }
      return;
    }
    this.lastAnyHandSeenTime = now; this.setStatus('ACTIVE');
    const vw = this.video?.videoWidth || 1280;
    const vh = this.video?.videoHeight || 720;
    const tipIndices = [4, 8, 12, 16, 20];
    const candidates: (DetectionCandidate & { landmarks3D: Point3D[] })[] = [];

    for (let h = 0; h < results.landmarks.length; h++) {
      const rawLm: RawLandmark[] = results.landmarks[h];
      const rawLm3D = results.worldLandmarks?.[h] ?? [];
      const hi = results.handednesses?.[h]?.[0];
      const handedness = hi?.displayName ?? hi?.categoryName ?? 'Unknown';
      const confidence  = hi?.score ?? 0.9;
      if (!LandmarkValidator.isValidRawHand(rawLm, confidence)) continue;
      const gameLm: Point2D[] = rawLm.map((p: RawLandmark) => this.mapper.landmarkToGame(p, vw, vh));
      const lm3D: Point3D[] = rawLm3D.length >= 21
        ? rawLm3D.map((p: { x: number; y: number; z: number }) => ({ x: p.x, y: p.y, z: p.z }))
        : rawLm.map((p: RawLandmark) => ({ x: p.x, y: p.y, z: (p as any).z ?? 0 }));
      candidates.push({
        rawPalm: PalmCenterEstimator.calculatePalmCenter(gameLm),
        scale: PalmCenterEstimator.calculateHandScale(gameLm),
        handedness, confidence, landmarks: gameLm, landmarks3D: lm3D
      });
    }

    const existingList = Array.from(this.trackedHands.values()).map(h => ({
      id: h.trackId, palm: { x: h.palm.x, y: h.palm.y }, vx: h.vx, vy: h.vy, handedness: h.handedness
    }));
    const matchResult = HandIdentityTracker.matchDetections(existingList, candidates, 0.016);

    for (const [trackId, candIdx] of matchResult.matched.entries()) {
      const hand = this.trackedHands.get(trackId);
      if (hand) this.updateTrack(hand, candidates[candIdx], tipIndices, now);
    }
    for (const candIdx of matchResult.unmatchedCandidates) {
      const newId   = this.nextTrackId++;
      const newHand = new TrackedHandState(newId, this.trackedHands.size % 2);
      this.trackedHands.set(newId, newHand);
      this.updateTrack(newHand, candidates[candIdx], tipIndices, now);
    }
    for (const trackId of matchResult.unmatchedTracks) {
      const hand = this.trackedHands.get(trackId);
      if (hand) {
        const wasActive = hand.active;
        hand.updateGhost(now);
        if (wasActive && !hand.active) hand.gestureFSM.lostHand(hand.trackId, now);
        if (now - hand.lastSeenTime > GAME_CONFIG.handReacquireMs + 1000) this.trackedHands.delete(trackId);
      }
    }
    this.checkTwoHandInteraction(now);
  }

  private updateTrack(
    hand: TrackedHandState,
    cand: DetectionCandidate & { landmarks3D: Point3D[] },
    tipIndices: number[],
    now: number
  ): void {
    const dt = Math.max(0.001, (now - hand.lastSeenTime) / 1000);
    hand.lastSeenTime = now; hand.active = true; hand.isGhost = false; hand.opacity = 1.0;
    hand.handedness = cand.handedness; hand.confidence = cand.confidence;

    // 1. Scale & Position
    hand.scale = hand.filterScale.filter(cand.scale, now);
    hand.palm.prevX = hand.palm.x; hand.palm.prevY = hand.palm.y;
    if (GAME_CONFIG.handSmoothingMode === 'oneEuro') {
      hand.palm.x = hand.filterPalmX.filter(cand.rawPalm.x, now);
      hand.palm.y = hand.filterPalmY.filter(cand.rawPalm.y, now);
    } else {
      const s = GAME_CONFIG.handSmoothing;
      hand.palm.x = hand.palm.x * s + cand.rawPalm.x * (1 - s);
      hand.palm.y = hand.palm.y * s + cand.rawPalm.y * (1 - s);
    }

    // 2. Velocity & Prediction
    const vel = hand.velocityPredictor.update({ x: hand.palm.x, y: hand.palm.y },
      { x: hand.palm.prevX, y: hand.palm.prevY }, dt);
    hand.vx = vel.vx; hand.vy = vel.vy; hand.speed = vel.speed;
    hand.predictedPalm = vel.predicted;

    // 3. Palm radius (speed-expanded)
    const speedBoost = Math.min(18, hand.speed * 0.015);
    hand.palm.radius = Math.max(GAME_CONFIG.minHandRadius,
      Math.min(GAME_CONFIG.maxHandRadius, hand.scale * GAME_CONFIG.palmRadiusMultiplier + speedBoost));

    // 4. Filter landmarks
    hand.landmarks = cand.landmarks.map((lm, i) => ({
      x: hand.filterLmX[i].filter(lm.x, now), y: hand.filterLmY[i].filter(lm.y, now)
    }));
    hand.landmarks3D = cand.landmarks3D;

    // 5. Fingertips
    const tipRadius = Math.max(GAME_CONFIG.minHandRadius * 0.45,
      Math.min(GAME_CONFIG.maxHandRadius * 0.55, hand.scale * GAME_CONFIG.fingertipRadiusMultiplier + speedBoost * 0.4));
    hand.fingertips = [];
    hand.predictedFingertips = [];
    for (let i = 0; i < tipIndices.length; i++) {
      const tipRaw = hand.landmarks[tipIndices[i]];
      const prevX = hand.fingertips[i]?.x ?? tipRaw.x;
      const prevY = hand.fingertips[i]?.y ?? tipRaw.y;
      const fx = hand.filterTipX[i].filter(tipRaw.x, now);
      const fy = hand.filterTipY[i].filter(tipRaw.y, now);
      hand.fingertips.push({ x: fx, y: fy, prevX, prevY, radius: tipRadius });
      hand.predictedFingertips.push(hand.velocityPredictor.predictPoint({ x: fx, y: fy }));
    }

    // 6. History
    hand.pushHistory(now);

    // 7. Full Pose Analysis
    const histLen = hand.history.length;
    const stability = histLen > 1
      ? Math.max(0, 1.0 - Math.hypot(
          hand.palm.x - (hand.history[histLen - 2]?.palmX ?? hand.palm.x),
          hand.palm.y - (hand.history[histLen - 2]?.palmY ?? hand.palm.y)
        ) / 80)
      : 1.0;
    const pose = HandPoseAnalyzer.analyze(hand.landmarks, hand.landmarks3D, hand.scale, stability);
    hand.pose = pose.pose; hand.openness = pose.openness;
    hand.depthEstimate = pose.depthEstimate; hand.orientation = pose.orientation;
    hand.fingers = pose.fingers; hand.stabilityScore = pose.stabilityScore;

    // Depth-scale collision radius
    const depthScale = 0.85 + pose.depthEstimate * 0.30;
    hand.palm.radius = Math.max(GAME_CONFIG.minHandRadius,
      Math.min(GAME_CONFIG.maxHandRadius * 1.2, hand.palm.radius * depthScale));

    // 8. Movement classification
    const mv = hand.movementClassifier.classify(hand.vx, hand.vy);
    hand.movement = mv.movement; hand.reachingScore = mv.reachingScore;
    hand.ax = mv.ax; hand.ay = mv.ay; hand.acceleration = mv.acceleration;

    // 9. Fallback gesture if pose is UNKNOWN
    if (hand.pose === 'UNKNOWN') {
      hand.pose = GestureDetector.detectGesture(hand.landmarks, hand.scale) as HandPose;
    }

    // 10. Gesture events
    hand.gestureFSM.update({
      pose: hand.pose, movement: hand.movement,
      reachingScore: hand.reachingScore, openness: hand.openness, trackId: hand.trackId,
    }, now);
  }

  private checkTwoHandInteraction(now: number): void {
    const active = Array.from(this.trackedHands.values()).filter(h => h.active && !h.isGhost);
    if (active.length < 2) return;
    const h1 = active[0]; const h2 = active[1];
    const dist = Math.hypot(h1.palm.x - h2.palm.x, h1.palm.y - h2.palm.y);
    const dot = (h2.palm.x - h1.palm.x) * (h1.vx - h2.vx) + (h2.palm.y - h1.palm.y) * (h1.vy - h2.vy);
    if (dot < 0 && dist < 250) {
      gestureEventBus.emit({ type: 'onTwoHandInteraction', trackId: h1.trackId, timestamp: now,
        data: { secondHandTrackId: h2.trackId } });
    }
  }

  public getTrackedHands(): TrackedHandData[] {
    if (this.syntheticPattern) return this.syntheticTrajectory.getHands(this.syntheticPattern);
    if (this.mouseTestMode) {
      const speed = Math.hypot(this.mousePos.vx, this.mousePos.vy);
      const radius = 56 + Math.min(15, speed * 0.015);
      const mx = this.mousePos.x; const my = this.mousePos.y;
      return [{
        trackId: 999, index: 0, active: true, isGhost: false, opacity: 1.0,
        color: '#00f0ff', colorGlow: 'rgba(0, 240, 255, 0.45)',
        handedness: 'Mouse Mode', scale: 65, depthEstimate: 0.4,
        vx: this.mousePos.vx, vy: this.mousePos.vy, ax: 0, ay: 0, speed, acceleration: 0,
        pose: 'OPEN_HAND', gesture: 'OPEN_HAND', openness: 0.9,
        orientation: { normalX: 0, normalY: 1, facingCamera: true, rollAngle: 0, tiltAngle: 0 },
        fingers: [], movement: speed > 200 ? 'FAST_REACH' : 'IDLE', reachingScore: Math.min(1, speed / 500),
        palm: { x: mx, y: my, prevX: this.mousePrevPos.x, prevY: this.mousePrevPos.y, radius },
        predictedPalm: { x: mx + this.mousePos.vx * 0.05, y: my + this.mousePos.vy * 0.05 },
        fingertips: [
          { x: mx-32, y: my-45, prevX: mx-32, prevY: my-45, radius: 22 },
          { x: mx-14, y: my-63, prevX: mx-14, prevY: my-63, radius: 22 },
          { x: mx+4,  y: my-67, prevX: mx+4,  prevY: my-67, radius: 22 },
          { x: mx+22, y: my-60, prevX: mx+22, prevY: my-60, radius: 22 },
          { x: mx+38, y: my-44, prevX: mx+38, prevY: my-44, radius: 22 },
        ],
        predictedFingertips: [
          { x: mx-32+this.mousePos.vx*0.05, y: my-45+this.mousePos.vy*0.05 },
          { x: mx-14+this.mousePos.vx*0.05, y: my-63+this.mousePos.vy*0.05 },
          { x: mx+4 +this.mousePos.vx*0.05, y: my-67+this.mousePos.vy*0.05 },
          { x: mx+22+this.mousePos.vx*0.05, y: my-60+this.mousePos.vy*0.05 },
          { x: mx+38+this.mousePos.vx*0.05, y: my-44+this.mousePos.vy*0.05 },
        ],
        landmarks: [], landmarks3D: [], confidence: 1.0, stabilityScore: 1.0, history: [],
      }];
    }
    const list: TrackedHandData[] = [];
    for (const hand of this.trackedHands.values()) {
      if (hand.active || hand.opacity > 0) list.push(hand.toData());
    }
    return list;
  }

  public isAnyHandPresent(): boolean {
    if (this.mouseTestMode || this.syntheticPattern) return true;
    for (const h of this.trackedHands.values()) if (!h.isGhost && h.active) return true;
    return false;
  }

  public getQualityReport(): CameraQualityReport {
    return this.qualityDetector.update(this.video, this.getTrackedHands(), performance.now());
  }

  public stop(): void {
    this.isLoopRunning = false;
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    if (this.video) { this.video.srcObject = null; this.video = null; }
    this.trackedHands.clear(); this.setStatus('IDLE');
  }
}

export const handTracker = new HandTracker();
