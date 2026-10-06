/**
 * handTracking.js - Camera Capture, MediaPipe Tasks Vision,
 * One-Euro Smoothing Filter, Hand Zones, and Coordinate Pipeline.
 */
import { GAME_CONFIG } from './config.js';

/**
 * 1-Euro Filter implementation for smooth, jitter-free, lag-free tracking.
 */
class OneEuroFilter {
  constructor(minCutoff = 1.0, beta = 0.035, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = null;
  }

  filter(val, timestamp) {
    if (this.tPrev === null) {
      this.xPrev = val;
      this.dxPrev = 0;
      this.tPrev = timestamp;
      return val;
    }

    const dt = Math.max(0.001, (timestamp - this.tPrev) / 1000);
    this.tPrev = timestamp;

    // Estimate derivative
    const dx = (val - this.xPrev) / dt;
    const edx = this.exponentialSmoothing(dx, this.dxPrev, this.alpha(dt, this.dCutoff));
    this.dxPrev = edx;

    // Adaptive cutoff based on speed
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    const xFiltered = this.exponentialSmoothing(val, this.xPrev, this.alpha(dt, cutoff));
    this.xPrev = xFiltered;

    return xFiltered;
  }

  alpha(dt, cutoff) {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
  }

  exponentialSmoothing(val, prev, alpha) {
    return alpha * val + (1 - alpha) * prev;
  }

  reset() {
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = null;
  }
}

/**
 * TrackedHand represents one active or ghost hand in game space.
 */
class TrackedHand {
  constructor(trackId, index) {
    this.trackId = trackId;
    this.index = index;
    this.active = true;
    this.isGhost = false;
    this.opacity = 1.0;
    this.lastSeenTime = performance.now();
    this.color = index === 0 ? '#00f0ff' : '#ff00b7'; // Cyan for hand 0, Magenta for hand 1
    this.colorGlow = index === 0 ? 'rgba(0, 240, 255, 0.4)' : 'rgba(255, 0, 183, 0.4)';
    this.handedness = 'Unknown';

    // Geometry in Game coordinates (1280x720)
    this.palm = { x: 640, y: 360, prevX: 640, prevY: 360, radius: 55 };
    this.fingertips = []; // 5 fingertips { x, y, prevX, prevY, radius }
    this.landmarks = []; // All 21 filtered landmarks for debug

    this.vx = 0;
    this.vy = 0;
    this.scale = 60; // Wrist to MCP distance

    // One-Euro Filters for palm
    this.filterPalmX = new OneEuroFilter(GAME_CONFIG.oneEuroMinCutoff, GAME_CONFIG.oneEuroBeta, GAME_CONFIG.oneEuroDCutoff);
    this.filterPalmY = new OneEuroFilter(GAME_CONFIG.oneEuroMinCutoff, GAME_CONFIG.oneEuroBeta, GAME_CONFIG.oneEuroDCutoff);

    // One-Euro Filters for 5 fingertips
    this.filterTipX = Array.from({ length: 5 }, () => new OneEuroFilter(GAME_CONFIG.oneEuroMinCutoff, GAME_CONFIG.oneEuroBeta, GAME_CONFIG.oneEuroDCutoff));
    this.filterTipY = Array.from({ length: 5 }, () => new OneEuroFilter(GAME_CONFIG.oneEuroMinCutoff, GAME_CONFIG.oneEuroBeta, GAME_CONFIG.oneEuroDCutoff));

    // One-Euro Filters for all 21 landmarks
    this.filterLmX = Array.from({ length: 21 }, () => new OneEuroFilter(GAME_CONFIG.oneEuroMinCutoff, GAME_CONFIG.oneEuroBeta, GAME_CONFIG.oneEuroDCutoff));
    this.filterLmY = Array.from({ length: 21 }, () => new OneEuroFilter(GAME_CONFIG.oneEuroMinCutoff, GAME_CONFIG.oneEuroBeta, GAME_CONFIG.oneEuroDCutoff));
  }

  updateGhost(now) {
    const elapsed = now - this.lastSeenTime;
    if (elapsed < GAME_CONFIG.handHoldMs) {
      this.isGhost = true;
      this.active = true;
      this.opacity = 1.0;
    } else if (elapsed < GAME_CONFIG.handHoldMs + GAME_CONFIG.handFadeMs) {
      this.isGhost = true;
      const fadeProgress = (elapsed - GAME_CONFIG.handHoldMs) / GAME_CONFIG.handFadeMs;
      this.opacity = Math.max(0, 1 - fadeProgress);
      this.active = this.opacity > 0.15; // Still collides while partially visible
    } else {
      this.isGhost = true;
      this.opacity = 0;
      this.active = false;
    }
  }
}

export class HandTracker {
  constructor() {
    this.video = null;
    this.stream = null;
    this.handLandmarker = null;
    this.isTracking = false;
    this.activeDelegate = 'GPU';
    this.status = 'IDLE'; // IDLE | REQUESTING_CAMERA | CAMERA_READY | INIT_TRACKING | ACTIVE | NO_HANDS | ERROR

    // Callbacks
    this.onStatusChange = null;
    this.onError = null;

    // Decoupled tracking loop & performance metrics
    this.trackingFps = 0;
    this.inferenceMs = 0;
    this.lastInferenceTime = 0;
    this.trackingFrameCount = 0;
    this.lastFpsSampleTime = performance.now();
    this.isLoopRunning = false;

    // Tracked Hands (up to 2 hands)
    this.trackedHands = new Map(); // trackId -> TrackedHand
    this.nextTrackId = 1;
    this.lastAnyHandSeenTime = 0;

    // Coordinate pipeline state
    this.canvasWidth = 1280;
    this.canvasHeight = 720;
    this.gameScale = 1.0;
    this.gameOriginX = 0;
    this.gameOriginY = 0;
    this.videoFitScale = 1.0;
    this.videoOffsetX = 0;
    this.videoOffsetY = 0;

    // Mouse fallback testing mode
    this.mouseTestMode = false;
    this.mousePos = { x: 640, y: 360, vx: 0, vy: 0 };
    this.mousePrevPos = { x: 640, y: 360 };
    this.mouseLastTime = performance.now();

    this.checkMouseModeFromUrl();
  }

  checkMouseModeFromUrl() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('mouse') === '1') {
        this.enableMouseTestMode(true);
      }
    } catch (_) {}
  }

  enableMouseTestMode(enable = true) {
    this.mouseTestMode = enable;
    if (enable) {
      this.status = 'ACTIVE';
      this.initMouseListeners();
    }
  }

  initMouseListeners() {
    window.addEventListener('mousemove', (e) => {
      if (!this.mouseTestMode) return;
      const gameCoords = this.canvasToGame(e.clientX, e.clientY);
      const now = performance.now();
      const dt = Math.max(0.001, (now - this.mouseLastTime) / 1000);

      this.mousePos.vx = (gameCoords.x - this.mousePos.x) / dt;
      this.mousePos.vy = (gameCoords.y - this.mousePos.y) / dt;

      this.mousePrevPos.x = this.mousePos.x;
      this.mousePrevPos.y = this.mousePos.y;

      this.mousePos.x = gameCoords.x;
      this.mousePos.y = gameCoords.y;
      this.mouseLastTime = now;
      this.lastAnyHandSeenTime = now;
    });
  }

  updateViewport(canvasWidth, canvasHeight) {
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;

    // Uniform game scaling with centering inside canvas
    this.gameScale = Math.min(canvasWidth / GAME_CONFIG.logicalWidth, canvasHeight / GAME_CONFIG.logicalHeight);
    this.gameOriginX = (canvasWidth - GAME_CONFIG.logicalWidth * this.gameScale) / 2;
    this.gameOriginY = (canvasHeight - GAME_CONFIG.logicalHeight * this.gameScale) / 2;

    // Cover-fit scaling for background video
    if (this.video && this.video.videoWidth > 0) {
      const vw = this.video.videoWidth;
      const vh = this.video.videoHeight;
      this.videoFitScale = Math.max(canvasWidth / vw, canvasHeight / vh);
      this.videoOffsetX = (canvasWidth - vw * this.videoFitScale) / 2;
      this.videoOffsetY = (canvasHeight - vh * this.videoFitScale) / 2;
    }
  }

  /**
   * Landmark in normalized [0, 1] unmirrored video space -> Game logical space (1280x720)
   */
  landmarkToGame(lm) {
    if (!this.video || !this.video.videoWidth) {
      // Fallback direct mapping
      const xm = 1 - lm.x;
      return { x: xm * GAME_CONFIG.logicalWidth, y: lm.y * GAME_CONFIG.logicalHeight };
    }

    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;

    // 1. Mirror horizontally: player moves right, cursor moves right
    const xm = 1 - lm.x;

    // 2. Video -> Canvas cover fit
    const canvasX = xm * vw * this.videoFitScale + this.videoOffsetX;
    const canvasY = lm.y * vh * this.videoFitScale + this.videoOffsetY;

    // 3. Canvas -> Game logical space
    const gameX = (canvasX - this.gameOriginX) / this.gameScale;
    const gameY = (canvasY - this.gameOriginY) / this.gameScale;

    return { x: gameX, y: gameY };
  }

  canvasToGame(cx, cy) {
    return {
      x: (cx - this.gameOriginX) / this.gameScale,
      y: (cy - this.gameOriginY) / this.gameScale
    };
  }

  gameToCanvas(gx, gy) {
    return {
      x: gx * this.gameScale + this.gameOriginX,
      y: gy * this.gameScale + this.gameOriginY
    };
  }

  setStatus(status) {
    if (this.status !== status) {
      this.status = status;
      if (this.onStatusChange) this.onStatusChange(status);
    }
  }

  /**
   * Request webcam stream
   */
  async startCamera() {
    this.setStatus('REQUESTING_CAMERA');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const err = new Error('Camera access API is not supported in this browser.');
      err.name = 'NotSupportedError';
      if (this.onError) this.onError(err);
      throw err;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 60, min: 24 }
        },
        audio: false
      });

      this.video = document.createElement('video');
      this.video.setAttribute('playsinline', '');
      this.video.setAttribute('muted', '');
      this.video.autoplay = true;
      this.video.srcObject = this.stream;

      // Handle track disconnection (unplugged camera)
      const videoTrack = this.stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          const err = new Error('Camera disconnected');
          err.name = 'NotReadableError';
          this.setStatus('ERROR');
          if (this.onError) this.onError(err);
        };
      }

      await new Promise((resolve, reject) => {
        this.video.onloadedmetadata = () => {
          this.video.play().then(resolve).catch(reject);
        };
        this.video.onerror = reject;
      });

      this.setStatus('CAMERA_READY');
      this.updateViewport(this.canvasWidth, this.canvasHeight);
      return true;
    } catch (err) {
      this.setStatus('ERROR');
      if (this.onError) this.onError(err);
      throw err;
    }
  }

  /**
   * Initialize MediaPipe HandLandmarker with GPU delegate and CPU fallback
   */
  async initMediaPipe() {
    this.setStatus('INIT_TRACKING');

    try {
      // Dynamic import of pinned MediaPipe Tasks Vision ESM
      const visionModule = await import(GAME_CONFIG.mediaPipeJsCdn);
      const { FilesetResolver, HandLandmarker } = visionModule;

      const vision = await FilesetResolver.forVisionTasks(GAME_CONFIG.mediaPipeVisionWasmUrl);

      // Try GPU delegate first
      try {
        this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: GAME_CONFIG.mediaPipeModelAssetPath,
            delegate: 'GPU'
          },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.55,
          minHandPresenceConfidence: 0.55,
          minTrackingConfidence: 0.55
        });
        this.activeDelegate = 'GPU';
      } catch (gpuErr) {
        console.warn('GPU delegate failed; falling back to CPU delegate:', gpuErr);
        this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: GAME_CONFIG.mediaPipeModelAssetPath,
            delegate: 'CPU'
          },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5
        });
        this.activeDelegate = 'CPU';
      }

      this.isTracking = true;
      this.startInferenceLoop();
      this.setStatus('ACTIVE');
      return true;
    } catch (err) {
      this.setStatus('ERROR');
      if (this.onError) this.onError(err);
      throw err;
    }
  }

  startInferenceLoop() {
    this.isLoopRunning = true;

    const processFrame = () => {
      if (!this.isLoopRunning) return;

      if (this.video && this.video.readyState >= 2 && this.video.currentTime !== this.lastInferenceTime) {
        this.lastInferenceTime = this.video.currentTime;
        const startT = performance.now();

        try {
          const results = this.handLandmarker.detectForVideo(this.video, startT);
          this.inferenceMs = Math.round(performance.now() - startT);
          this.trackingFrameCount++;
          this.processDetectionResults(results, startT);
        } catch (e) {
          // Log transient detection warning without crashing loop
          console.warn('Inference frame exception:', e);
        }

        // Compute tracking FPS
        const now = performance.now();
        if (now - this.lastFpsSampleTime >= 1000) {
          this.trackingFps = Math.round((this.trackingFrameCount * 1000) / (now - this.lastFpsSampleTime));
          this.trackingFrameCount = 0;
          this.lastFpsSampleTime = now;
        }
      }

      // Decoupled inference scheduling
      if ('requestVideoFrameCallback' in this.video) {
        this.video.requestVideoFrameCallback(processFrame);
      } else {
        requestAnimationFrame(processFrame);
      }
    };

    if ('requestVideoFrameCallback' in this.video) {
      this.video.requestVideoFrameCallback(processFrame);
    } else {
      requestAnimationFrame(processFrame);
    }
  }

  /**
   * Process raw MediaPipe landmarks, match stable trackIds, filter jitter,
   * compute hand scale and collision zones.
   */
  processDetectionResults(results, now) {
    if (!results || !results.landmarks || results.landmarks.length === 0) {
      // No hands detected in this frame
      const allHandsGoneDuration = now - this.lastAnyHandSeenTime;
      if (allHandsGoneDuration > GAME_CONFIG.noHandThresholdMs) {
        this.setStatus('NO_HANDS');
      }
      // Update ghost hands
      for (const hand of this.trackedHands.values()) {
        hand.updateGhost(now);
      }
      return;
    }

    this.lastAnyHandSeenTime = now;
    this.setStatus('ACTIVE');

    const detectedHandsData = [];
    const tipIndices = [4, 8, 12, 16, 20]; // Thumb, Index, Middle, Ring, Pinky

    for (let h = 0; h < results.landmarks.length; h++) {
      const rawLm = results.landmarks[h];
      const handednessInfo = results.handednesses && results.handednesses[h] && results.handednesses[h][0];
      const label = handednessInfo ? handednessInfo.displayName || handednessInfo.categoryName : 'Unknown';

      // 1. Convert all 21 landmarks into game coordinates
      const gameLm = rawLm.map(p => this.landmarkToGame(p));

      // 2. Compute palm center = average of wrist(0) and 4 MCPs(5, 9, 13, 17)
      const palmIndices = [0, 5, 9, 13, 17];
      let sumX = 0;
      let sumY = 0;
      for (const idx of palmIndices) {
        sumX += gameLm[idx].x;
        sumY += gameLm[idx].y;
      }
      const rawPalmX = sumX / palmIndices.length;
      const rawPalmY = sumY / palmIndices.length;

      // 3. Hand scale = distance from wrist(0) to middle MCP(9) in game space
      const scale = Math.hypot(gameLm[9].x - gameLm[0].x, gameLm[9].y - gameLm[0].y);

      detectedHandsData.push({
        gameLm,
        rawPalmX,
        rawPalmY,
        scale: Math.max(30, scale),
        label,
        tipIndices
      });
    }

    // Match detected hands to existing tracked hands by nearest distance
    const matchedTrackIds = new Set();

    for (const detected of detectedHandsData) {
      let bestTrack = null;
      let bestDist = 200; // max px distance to preserve trackId

      for (const [tId, trackedHand] of this.trackedHands.entries()) {
        if (!matchedTrackIds.has(tId)) {
          const d = Math.hypot(detected.rawPalmX - trackedHand.palm.x, detected.rawPalmY - trackedHand.palm.y);
          if (d < bestDist) {
            bestDist = d;
            bestTrack = trackedHand;
          }
        }
      }

      // If no close match found, create a new TrackedHand
      if (!bestTrack) {
        const newTrackId = this.nextTrackId++;
        const handIndex = this.trackedHands.size % 2;
        bestTrack = new TrackedHand(newTrackId, handIndex);
        this.trackedHands.set(newTrackId, bestTrack);
      }

      matchedTrackIds.add(bestTrack.trackId);
      bestTrack.active = true;
      bestTrack.isGhost = false;
      bestTrack.opacity = 1.0;
      bestTrack.handedness = detected.label;
      bestTrack.scale = detected.scale;

      const dt = Math.max(0.001, (now - bestTrack.lastSeenTime) / 1000);
      bestTrack.lastSeenTime = now;

      // Filter palm position
      bestTrack.palm.prevX = bestTrack.palm.x;
      bestTrack.palm.prevY = bestTrack.palm.y;

      if (GAME_CONFIG.handSmoothingMode === 'oneEuro') {
        bestTrack.palm.x = bestTrack.filterPalmX.filter(detected.rawPalmX, now);
        bestTrack.palm.y = bestTrack.filterPalmY.filter(detected.rawPalmY, now);
      } else {
        const s = GAME_CONFIG.handSmoothing;
        bestTrack.palm.x = bestTrack.palm.x * s + detected.rawPalmX * (1 - s);
        bestTrack.palm.y = bestTrack.palm.y * s + detected.rawPalmY * (1 - s);
      }

      // Compute palm velocity (px/s)
      bestTrack.vx = (bestTrack.palm.x - bestTrack.palm.prevX) / dt;
      bestTrack.vy = (bestTrack.palm.y - bestTrack.palm.prevY) / dt;

      // Palm collision radius scaled by hand size
      bestTrack.palm.radius = Math.max(
        GAME_CONFIG.minHandRadius,
        Math.min(GAME_CONFIG.maxHandRadius, detected.scale * GAME_CONFIG.palmRadiusMultiplier)
      );

      // Filter 5 Fingertips
      bestTrack.fingertips = [];
      const tipRadius = Math.max(
        GAME_CONFIG.minHandRadius * 0.45,
        Math.min(GAME_CONFIG.maxHandRadius * 0.55, detected.scale * GAME_CONFIG.fingertipRadiusMultiplier)
      );

      for (let i = 0; i < detected.tipIndices.length; i++) {
        const tipIdx = detected.tipIndices[i];
        const tipRaw = detected.gameLm[tipIdx];

        const prevTipX = (bestTrack.fingertips[i] && bestTrack.fingertips[i].x) || tipRaw.x;
        const prevTipY = (bestTrack.fingertips[i] && bestTrack.fingertips[i].y) || tipRaw.y;

        let filteredTipX = tipRaw.x;
        let filteredTipY = tipRaw.y;

        if (GAME_CONFIG.handSmoothingMode === 'oneEuro') {
          filteredTipX = bestTrack.filterTipX[i].filter(tipRaw.x, now);
          filteredTipY = bestTrack.filterTipY[i].filter(tipRaw.y, now);
        }

        bestTrack.fingertips.push({
          x: filteredTipX,
          y: filteredTipY,
          prevX: prevTipX,
          prevY: prevTipY,
          radius: tipRadius
        });
      }

      // Filter all 21 landmarks for debug rendering
      bestTrack.landmarks = detected.gameLm.map((lm, idx) => ({
        x: bestTrack.filterLmX[idx].filter(lm.x, now),
        y: bestTrack.filterLmY[idx].filter(lm.y, now)
      }));
    }

    // Handle unmatched tracked hands as ghosts
    for (const [tId, trackedHand] of this.trackedHands.entries()) {
      if (!matchedTrackIds.has(tId)) {
        trackedHand.updateGhost(now);
        // Clean up stale hands beyond reacquire window
        if (now - trackedHand.lastSeenTime > GAME_CONFIG.handReacquireMs + 1000) {
          this.trackedHands.delete(tId);
        }
      }
    }
  }

  /**
   * Returns array of currently active and ghost hands for game logic and collision
   */
  getTrackedHands() {
    if (this.mouseTestMode) {
      // Simulate Hand 0 at mouse coordinates
      return [{
        trackId: 999,
        index: 0,
        active: true,
        isGhost: false,
        opacity: 1.0,
        color: '#00f0ff',
        colorGlow: 'rgba(0, 240, 255, 0.4)',
        handedness: 'Mouse Sim',
        scale: 65,
        vx: this.mousePos.vx,
        vy: this.mousePos.vy,
        palm: {
          x: this.mousePos.x,
          y: this.mousePos.y,
          prevX: this.mousePrevPos.x,
          prevY: this.mousePrevPos.y,
          radius: 56
        },
        fingertips: [
          { x: this.mousePos.x - 32, y: this.mousePos.y - 45, prevX: this.mousePos.x - 32, prevY: this.mousePos.y - 45, radius: 24 },
          { x: this.mousePos.x - 16, y: this.mousePos.y - 62, prevX: this.mousePos.x - 16, prevY: this.mousePos.y - 62, radius: 24 },
          { x: this.mousePos.x + 4, y: this.mousePos.y - 65, prevX: this.mousePos.x + 4, prevY: this.mousePos.y - 65, radius: 24 },
          { x: this.mousePos.x + 22, y: this.mousePos.y - 58, prevX: this.mousePos.x + 22, prevY: this.mousePos.y - 58, radius: 24 },
          { x: this.mousePos.x + 38, y: this.mousePos.y - 42, prevX: this.mousePos.x + 38, prevY: this.mousePos.y - 42, radius: 24 }
        ],
        landmarks: []
      }];
    }

    const list = [];
    for (const hand of this.trackedHands.values()) {
      if (hand.active || hand.opacity > 0) {
        list.push(hand);
      }
    }
    return list;
  }

  isAnyHandPresent() {
    if (this.mouseTestMode) return true;
    for (const hand of this.trackedHands.values()) {
      if (!hand.isGhost && hand.active) return true;
    }
    return false;
  }

  stop() {
    this.isLoopRunning = false;
    this.isTracking = false;

    if (this.stream) {
      this.stream.getTracks().forEach(track => {
        try { track.stop(); } catch (_) {}
      });
      this.stream = null;
    }

    if (this.video) {
      this.video.srcObject = null;
      this.video = null;
    }

    this.trackedHands.clear();
    this.setStatus('IDLE');
  }
}

export const handTracker = new HandTracker();
