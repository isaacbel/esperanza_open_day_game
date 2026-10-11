/**
 * HandTypes.ts - Complete Human Hand Model for HAND CATCH
 *
 * Full 3D-aware, temporally-rich, pose-classified hand data model.
 * Every tracked hand is understood as a physical human body part,
 * not just a 2D cursor.
 */

// ─── Primitives ────────────────────────────────────────────────────────────────

export interface Point2D {
  x: number;
  y: number;
}

export interface Point3D {
  x: number;
  y: number;
  z: number; // Relative depth (negative = closer to camera in MediaPipe)
}

export interface CollisionCircle {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  radius: number;
}

// ─── Pose Classification ────────────────────────────────────────────────────────

/**
 * Discrete hand pose states classified from landmark geometry.
 * These reflect the player's actual physical hand configuration.
 */
export type HandPose =
  | 'OPEN_HAND'     // All fingers extended, palm visible
  | 'CLOSED_HAND'   // Most fingers folded
  | 'FIST'          // All fingers tightly folded, power grip
  | 'RELAXED'       // Fingers slightly curled, neutral rest pose
  | 'POINTING'      // Index extended, others curled
  | 'PINCH'         // Thumb and index tip very close
  | 'GRAB'          // Fingers closing around an area (catching motion)
  | 'REACHING'      // Hand open and moving toward a target
  | 'UNKNOWN';

/** Backwards-compat alias */
export type HandGesture = HandPose;

// ─── Movement Classification ────────────────────────────────────────────────────

/**
 * Temporal movement state classified over the last N frames.
 */
export type MovementClass =
  | 'IDLE'
  | 'MOVING_LEFT'
  | 'MOVING_RIGHT'
  | 'MOVING_UP'
  | 'MOVING_DOWN'
  | 'MOVING_TOWARD_CAMERA'
  | 'MOVING_AWAY_CAMERA'
  | 'FAST_REACH'
  | 'SWIPE_LEFT'
  | 'SWIPE_RIGHT'
  | 'SWIPE_UP'
  | 'SWIPE_DOWN';

// ─── Palm Orientation ──────────────────────────────────────────────────────────

/**
 * Orientation of the palm plane relative to the camera.
 * Derived from cross-product of palm basis vectors.
 */
export interface PalmOrientation {
  normalX: number;
  normalY: number;
  facingCamera: boolean;
  rollAngle: number;
  tiltAngle: number;
}

// ─── Finger State ──────────────────────────────────────────────────────────────

export interface FingerState {
  index: number;       // 0=Thumb, 1=Index, 2=Middle, 3=Ring, 4=Pinky
  extension: number;   // 0.0 (fully curled) to 1.0 (fully extended)
  tip: Point2D;
  mcp: Point2D;
  pip: Point2D;
  dip: Point2D;
  angle: number;       // Angle of finger relative to wrist (radians)
}

// ─── Temporal Frame ────────────────────────────────────────────────────────────

/**
 * One entry in the hand's temporal history ring buffer.
 * Stored for the last ~30 frames for movement analysis.
 */
export interface HandFrame {
  timestamp: number;
  palmX: number;
  palmY: number;
  scale: number;
  pose: HandPose;
  depthEstimate: number;
  confidence: number;
  openness: number;
}

// ─── Main Tracked Hand Data ────────────────────────────────────────────────────

/**
 * Complete model of one tracked human hand.
 */
export interface TrackedHandData {
  trackId: number;
  index: number;
  active: boolean;
  isGhost: boolean;
  opacity: number;
  color: string;
  colorGlow: string;
  handedness: string;

  // ── Position & Scale ──
  scale: number;
  depthEstimate: number;   // Relative depth 0.0 (far) to 1.0 (close)

  // ── Velocity & Dynamics ──
  vx: number;
  vy: number;
  ax: number;              // px/s² horizontal acceleration
  ay: number;              // px/s² vertical acceleration
  speed: number;
  acceleration: number;    // px/s² total magnitude

  // ── Pose & Gesture ──
  pose: HandPose;
  gesture: HandPose;       // Alias for backwards compat
  openness: number;        // 0.0 (fully closed) to 1.0 (fully open)
  orientation: PalmOrientation;
  fingers: FingerState[];

  // ── Movement Classification ──
  movement: MovementClass;
  reachingScore: number;   // 0.0-1.0 confidence that player is reaching

  // ── Collision Volumes ──
  palm: CollisionCircle;
  predictedPalm: Point2D;
  fingertips: CollisionCircle[];
  predictedFingertips: Point2D[];

  // ── Raw Skeleton ──
  landmarks: Point2D[];
  landmarks3D: Point3D[];

  // ── Confidence & Quality ──
  confidence: number;
  stabilityScore: number;

  // ── Temporal History ──
  history: HandFrame[];
}

// ─── Gesture Events ───────────────────────────────────────────────────────────

export type GestureEventType =
  | 'onHandDetected'
  | 'onHandLost'
  | 'onReachStart'
  | 'onReachEnd'
  | 'onGrabStart'
  | 'onGrab'
  | 'onGrabRelease'
  | 'onSwipe'
  | 'onPinchStart'
  | 'onPinchEnd'
  | 'onOpenHand'
  | 'onFist'
  | 'onTwoHandInteraction';

export interface GestureEvent {
  type: GestureEventType;
  trackId: number;
  timestamp: number;
  data?: {
    direction?: MovementClass;
    speed?: number;
    secondHandTrackId?: number;
    openness?: number;
  };
}

// ─── Two-Hand Interaction ─────────────────────────────────────────────────────

export interface TwoHandInteraction {
  leftHand: TrackedHandData;
  rightHand: TrackedHandData;
  distanceBetweenHands: number;
  relativeVelocity: number;
  midpoint: Point2D;
  isApproaching: boolean;
  isTwoHandCatch: boolean;
}

// ─── Tracking & App Types ─────────────────────────────────────────────────────

export type TrackingStatus =
  | 'IDLE'
  | 'REQUESTING_CAMERA'
  | 'CAMERA_READY'
  | 'INIT_TRACKING'
  | 'ACTIVE'
  | 'NO_HANDS'
  | 'ERROR';

export type AppState =
  | 'LOADING'
  | 'MENU'
  | 'REQUESTING_CAMERA'
  | 'INITIALIZING_TRACKING'
  | 'CALIBRATION'
  | 'READY'
  | 'COUNTDOWN'
  | 'PLAYING'
  | 'PAUSED'
  | 'GAME_OVER'
  | 'CAMERA_ERROR';

export type GameMode =
  | 'NORMAL'
  | 'SURVIVAL'
  | 'TIME_ATTACK'
  | 'ZEN'
  | 'CHAOS'
  | 'TWO_HANDS'
  | 'NIGHTMARE'
  | 'TRAINING'
  | 'TUTORIAL'
  | 'ENDLESS'
  | 'PRECISION'
  | 'DAILY_CHALLENGE'
  | 'BOSS_RUSH';
export type QualityLevel = 'ULTRA' | 'HIGH' | 'MEDIUM' | 'LOW';

export type CameraGuidance =
  | 'PERFECT'
  | 'TOO_CLOSE'
  | 'TOO_FAR'
  | 'MOVE_LEFT'
  | 'MOVE_RIGHT'
  | 'LOW_LIGHT'
  | 'RAISE_HANDS';

export interface CalibrationData {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  handScale: number;
  isCalibrated: boolean;
}

export interface ViewportTransform {
  canvasWidth: number;
  canvasHeight: number;
  gameScale: number;
  gameOriginX: number;
  gameOriginY: number;
  videoFitScale: number;
  videoOffsetX: number;
  videoOffsetY: number;
}

/** @deprecated Use HandPose */
export interface ConfidenceMetrics {
  detection: number;
  tracking: number;
  presence: number;
}
