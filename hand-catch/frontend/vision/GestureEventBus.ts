/**
 * GestureEventBus.ts - Typed Gesture Event System for HAND CATCH
 *
 * Allows the hand tracking pipeline to emit high-level gesture events,
 * and the game engine to react without polling.
 *
 * Events:
 *   onHandDetected    — A new hand appeared in frame
 *   onHandLost        — A hand disappeared
 *   onReachStart      — Hand starts moving toward a falling object
 *   onReachEnd        — Reaching stopped
 *   onGrabStart       — Fingers begin closing (GRAB pose entered)
 *   onGrab            — Confirmed grab (fingers closed within catch window)
 *   onGrabRelease     — Fingers reopened after grab
 *   onSwipe           — Fast directional swipe detected
 *   onPinchStart      — Pinch pose entered
 *   onPinchEnd        — Pinch released
 *   onOpenHand        — Hand fully opened
 *   onFist            — Hand formed a fist
 *   onTwoHandInteraction — Both hands converging on same area
 */
import { GestureEvent, GestureEventType, MovementClass } from './HandTypes';

export type GestureListener = (event: GestureEvent) => void;

export class GestureEventBus {
  private listeners: Map<GestureEventType, Set<GestureListener>> = new Map();
  private allListeners: Set<GestureListener> = new Set();

  /** Subscribe to a specific event type */
  public on(type: GestureEventType, listener: GestureListener): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
    return () => this.off(type, listener);
  }

  /** Subscribe to all events */
  public onAny(listener: GestureListener): () => void {
    this.allListeners.add(listener);
    return () => this.allListeners.delete(listener);
  }

  public off(type: GestureEventType, listener: GestureListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  public emit(event: GestureEvent): void {
    this.listeners.get(event.type)?.forEach(l => l(event));
    this.allListeners.forEach(l => l(event));
  }

  public clear(): void {
    this.listeners.clear();
    this.allListeners.clear();
  }
}

// ─── Per-Hand Gesture State Machine ──────────────────────────────────────────

/**
 * Tracks the previous pose/movement state of a single hand and emits
 * events when state transitions occur.
 *
 * Used internally by HandTracker — one instance per tracked hand.
 */
import { HandPose, MovementClass as MvClass } from './HandTypes';

interface HandGestureState {
  pose: HandPose;
  movement: MvClass;
  reachingScore: number;
  openness: number;
  trackId: number;
}

const REACH_START_THRESHOLD = 0.45;  // Reaching score above this = onReachStart
const REACH_END_THRESHOLD   = 0.25;  // Below this = onReachEnd

export class HandGestureStateMachine {
  private prev: HandGestureState | null = null;
  private isReaching: boolean = false;
  private isGrabbing: boolean = false;
  private isPinching: boolean = false;

  constructor(private readonly bus: GestureEventBus) {}

  public update(current: HandGestureState, now: number): void {
    if (!this.prev) {
      // First frame: emit detection
      this.bus.emit({ type: 'onHandDetected', trackId: current.trackId, timestamp: now });
      this.prev = { ...current };
      return;
    }

    const p = this.prev;

    // ── Pose transitions ───────────────────────────────────────────────────

    if (current.pose === 'OPEN_HAND' && p.pose !== 'OPEN_HAND') {
      this.bus.emit({ type: 'onOpenHand', trackId: current.trackId, timestamp: now,
        data: { openness: current.openness } });
    }

    if ((current.pose === 'FIST') && p.pose !== 'FIST') {
      this.bus.emit({ type: 'onFist', trackId: current.trackId, timestamp: now });
      this.isGrabbing = false;
    }

    if (current.pose === 'GRAB' && p.pose !== 'GRAB' && p.pose !== 'FIST') {
      this.bus.emit({ type: 'onGrabStart', trackId: current.trackId, timestamp: now });
      this.isGrabbing = true;
    }

    if (this.isGrabbing && (current.pose === 'FIST' || current.pose === 'CLOSED_HAND')) {
      this.bus.emit({ type: 'onGrab', trackId: current.trackId, timestamp: now });
    }

    if (this.isGrabbing && current.pose !== 'GRAB' && current.pose !== 'FIST' && current.pose !== 'CLOSED_HAND') {
      this.bus.emit({ type: 'onGrabRelease', trackId: current.trackId, timestamp: now });
      this.isGrabbing = false;
    }

    if (current.pose === 'PINCH' && p.pose !== 'PINCH') {
      this.bus.emit({ type: 'onPinchStart', trackId: current.trackId, timestamp: now });
      this.isPinching = true;
    }

    if (this.isPinching && current.pose !== 'PINCH') {
      this.bus.emit({ type: 'onPinchEnd', trackId: current.trackId, timestamp: now });
      this.isPinching = false;
    }

    // ── Movement / Reaching transitions ────────────────────────────────────

    if (!this.isReaching && current.reachingScore >= REACH_START_THRESHOLD) {
      this.isReaching = true;
      this.bus.emit({ type: 'onReachStart', trackId: current.trackId, timestamp: now,
        data: { speed: current.reachingScore } });
    }

    if (this.isReaching && current.reachingScore < REACH_END_THRESHOLD) {
      this.isReaching = false;
      this.bus.emit({ type: 'onReachEnd', trackId: current.trackId, timestamp: now });
    }

    // ── Swipe detection ────────────────────────────────────────────────────

    const isSwipe = (m: MvClass) => m.startsWith('SWIPE_');
    if (isSwipe(current.movement) && !isSwipe(p.movement)) {
      this.bus.emit({ type: 'onSwipe', trackId: current.trackId, timestamp: now,
        data: { direction: current.movement as MovementClass } });
    }

    this.prev = { ...current };
  }

  public lostHand(trackId: number, now: number): void {
    this.isReaching = false;
    this.isGrabbing = false;
    this.isPinching = false;
    this.prev = null;
    this.bus.emit({ type: 'onHandLost', trackId, timestamp: now });
  }

  public reset(): void {
    this.prev = null;
    this.isReaching = false;
    this.isGrabbing = false;
    this.isPinching = false;
  }
}

/** Singleton event bus — import and subscribe from GameEngine */
export const gestureEventBus = new GestureEventBus();
