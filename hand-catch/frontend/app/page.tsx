'use client';

/**
 * page.tsx — HAND CATCH Main Game Page
 *
 * Orchestrates all game states (LOADING → MENU → COUNTDOWN → PLAYING → GAME_OVER)
 * using React hooks + the imperative GameEngine and HandTracker singletons.
 * No game logic lives in React — only UI state mirrors.
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { GameEngine } from '../game/GameEngine';
import { gameStateManager } from '../game/GameState';
import { handTracker } from '../vision/HandTracker';
import { audio } from '../audio/AudioManager';

import { StartScreen } from '../components/StartScreen';
import { Leaderboard, LeaderboardItem } from '../components/Leaderboard';
import { CameraStatus } from '../components/CameraStatus';
import { CalibrationModal } from '../components/CalibrationModal';

import type { AppState, GameMode, TrackingStatus } from '../vision/HandTypes';
import type { GameOverStats } from '../game/GameState';

// ─── API helper ───────────────────────────────────────────────────────────────
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

async function postScore(stats: GameOverStats): Promise<LeaderboardItem | null> {
  try {
    const res = await fetch(`${API_URL}/api/leaderboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerName: stats.playerName,
        score: stats.score,
        maxCombo: stats.maxCombo,
        caught: stats.caught,
        missed: stats.missed,
        accuracy: stats.accuracy,
        mode: stats.mode,
      }),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ─── Countdown helper ────────────────────────────────────────────────────────
function useCountdown(from: number, onDone: () => void) {
  const [count, setCount] = useState(from);
  const doneRef = useRef(false);

  useEffect(() => {
    doneRef.current = false;
    setCount(from);

    const id = setInterval(() => {
      setCount((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          if (!doneRef.current) {
            doneRef.current = true;
            onDone();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from]); // intentionally omit `onDone` to avoid re-triggering

  return count;
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function HandCatchPage() {
  // Canvas ref — game engine is attached imperatively
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);

  // App state mirrors
  const [appState, setAppState] = useState<AppState>('LOADING');
  const [trackingStatus, setTrackingStatus] = useState<TrackingStatus>('IDLE');
  const [handsCount, setHandsCount] = useState(0);
  const [cameraErrorMsg, setCameraErrorMsg] = useState('');

  // Game settings
  const [mode, setMode] = useState<GameMode>(
    () => (gameStateManager.getMode() as GameMode) || 'NORMAL'
  );
  const [playerName, setPlayerName] = useState(
    () => gameStateManager.getPlayerName() || 'PLAYER'
  );
  const [isMuted, setIsMuted] = useState(() => {
    if (typeof window === 'undefined') return false;
    const val = localStorage.getItem('handCatch.muted');
    return val === '1' || val === 'true';
  });
  const [debugMode, setDebugMode] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  // Countdown gate
  const [showCountdown, setShowCountdown] = useState(false);

  // Game-over state
  const [gameOverStats, setGameOverStats] = useState<GameOverStats | null>(null);
  const [isNewRecord, setIsNewRecord] = useState(false);
  const [highlightScore, setHighlightScore] = useState<number | null>(null);

  // ── Transition helper ───────────────────────────────────────────────────────
  const transitionTo = useCallback((next: AppState) => {
    gameStateManager.setState(next);
    setAppState(next);
  }, []);

  // ── Bootstrap: create engine + subscribe to state/tracking updates ──────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!canvasRef.current) return;

    // Create game engine (attaches to canvas, handles resize)
    const engine = new GameEngine(canvasRef.current);
    engineRef.current = engine;

    // Subscribe to gameStateManager (set by game engine triggers)
    const unsubState = gameStateManager.subscribe((state) => {
      setAppState(state);
    });

    // Subscribe to hand tracking status updates
    const unsubTracking = handTracker.onStatusChange((status, handsN) => {
      setTrackingStatus(status);
      setHandsCount(handsN);
    });

    // Auto-pause on tab hidden / resume on tab visible
    const handleVisibility = () => {
      if (document.hidden) {
        if (gameStateManager.getState() === 'PLAYING' && engine.isRunning && !engine.isPaused) {
          engine.pause();
          transitionTo('PAUSED');
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Keyboard shortcuts
    const handleKey = (e: KeyboardEvent) => {
      const state = gameStateManager.getState();
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      switch (e.key.toLowerCase()) {
        case 'd':
          if (engine) {
            engine.debugMode = !engine.debugMode;
            setDebugMode(engine.debugMode);
          }
          break;
        case 'm':
          setIsMuted((prev) => {
            const next = !prev;
            audio.setMuted(next);
            return next;
          });
          break;
        case 'escape':
          if (state === 'PLAYING') {
            engine.pause();
            transitionTo('PAUSED');
          } else if (state === 'PAUSED') {
            engine.resume();
            transitionTo('PLAYING');
          }
          break;
        case 'f':
          document.documentElement.requestFullscreen?.().catch(() => {});
          break;
      }
    };
    window.addEventListener('keydown', handleKey);

    // Apply initial mute from localStorage
    const savedMute = localStorage.getItem('handCatch.muted');
    if (savedMute === '1' || savedMute === 'true') {
      audio.setMuted(true);
    }

    // Transition to MENU after a brief loading tick
    setTimeout(() => transitionTo('MENU'), 200);

    return () => {
      unsubState();
      unsubTracking();
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('keydown', handleKey);
      engine.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Start game flow ──────────────────────────────────────────────────────────
  const handleStartGame = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;

    // Persist settings
    gameStateManager.setMode(mode);
    gameStateManager.setPlayerName(playerName);

    // Unlock audio context on user gesture
    await audio.init();
    if (isMuted) audio.setMuted(true);

    transitionTo('REQUESTING_CAMERA');

    try {
      // Request camera + init hand tracking
      await handTracker.initialize();
      transitionTo('INITIALIZING_TRACKING');
      await handTracker.waitUntilReady();

      // Wire game-over callback
      engine.onGameOver = async (stats: GameOverStats) => {
        transitionTo('GAME_OVER');
        setGameOverStats(stats);

        // Submit to leaderboard
        const saved = await postScore(stats);
        if (saved) {
          setHighlightScore(saved.score);
          // Check if new record (first position in local cache)
          try {
            const cached = localStorage.getItem(`handCatch.leaderboard.${stats.mode}`);
            if (cached) {
              const arr = JSON.parse(cached) as LeaderboardItem[];
              if (!arr.length || stats.score > arr[0].score) {
                setIsNewRecord(true);
              }
            } else {
              setIsNewRecord(true);
            }
          } catch {
            /* ignore */
          }
        }
      };

      // Transition to READY state to display detected hands & optional calibration
      transitionTo('READY');
    } catch (err: unknown) {
      const msg =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Camera access was denied. Please allow camera in your browser settings and try again.'
          : err instanceof Error
          ? err.message
          : 'Unknown camera / tracking error.';
      setCameraErrorMsg(msg);
      transitionTo('CAMERA_ERROR');
    }
  }, [mode, playerName, isMuted, transitionTo]);

  // ── Launch Countdown from READY state ─────────────────────────────────────────
  const handleLaunchCountdown = useCallback(() => {
    setShowCountdown(true);
    transitionTo('COUNTDOWN');
  }, [transitionTo]);

  // ── Countdown done → start engine ────────────────────────────────────────────
  const handleCountdownDone = useCallback(() => {
    setShowCountdown(false);
    const engine = engineRef.current;
    if (!engine) return;
    engine.start(mode, playerName);
    transitionTo('PLAYING');
  }, [mode, playerName, transitionTo]);

  const countdownValue = useCountdown(3, handleCountdownDone);

  // ── Pause / Resume ───────────────────────────────────────────────────────────
  const handleTogglePause = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (appState === 'PLAYING') {
      engine.pause();
      transitionTo('PAUSED');
    } else if (appState === 'PAUSED') {
      engine.resume();
      transitionTo('PLAYING');
    }
  }, [appState, transitionTo]);

  // ── Restart ──────────────────────────────────────────────────────────────────
  const handleRestart = useCallback(() => {
    setGameOverStats(null);
    setIsNewRecord(false);
    setHighlightScore(null);
    transitionTo('MENU');
  }, [transitionTo]);

  // ── Retry camera ─────────────────────────────────────────────────────────────
  const handleRetryCamera = useCallback(() => {
    setCameraErrorMsg('');
    transitionTo('MENU');
  }, [transitionTo]);

  // ── Mouse fallback (skip camera, use mouse tracking) ──────────────────────────
  const handlePlayWithMouse = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    setCameraErrorMsg('');

    // Enable mouse test mode on the singleton
    handTracker.enableMouseTestMode(true);

    // Wire game-over callback
    engine.onGameOver = async (stats: GameOverStats) => {
      transitionTo('GAME_OVER');
      setGameOverStats(stats);
      const saved = await postScore(stats);
      if (saved) setHighlightScore(saved.score);
    };

    transitionTo('READY');
  }, [transitionTo]);

  // ── Settings handlers ─────────────────────────────────────────────────────────
  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      audio.setMuted(next);
      return next;
    });
  }, []);

  const handleToggleDebug = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.debugMode = !engine.debugMode;
    setDebugMode(engine.debugMode);
  }, []);

  const handleToggleReduceMotion = useCallback(() => {
    setReduceMotion((prev) => !prev);
  }, []);

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div id="game-root">
      {/* ── Game Canvas (always mounted, hidden until needed) ── */}
      <canvas
        id="game-canvas"
        ref={canvasRef}
        aria-label="HAND CATCH game arena"
        role="img"
      />

      {/* ── Camera Status Pill (shown during active gameplay) ── */}
      {(appState === 'PLAYING' || appState === 'PAUSED' || appState === 'COUNTDOWN') && (
        <CameraStatus status={trackingStatus} handsCount={handsCount} />
      )}

      {/* ══ LOADING SCREEN ══ */}
      {appState === 'LOADING' && (
        <div className="loading-screen">
          <div className="loading-spinner" />
          <span className="loading-label">Initialising Hand Catch…</span>
        </div>
      )}

      {/* ══ REQUESTING CAMERA / INIT TRACKING ══ */}
      {(appState === 'REQUESTING_CAMERA' || appState === 'INITIALIZING_TRACKING') && (
        <div className="loading-screen">
          <div className="loading-spinner" />
          <span className="loading-label">
            {appState === 'REQUESTING_CAMERA'
              ? 'Requesting camera access…'
              : 'Loading AI hand tracking…'}
          </span>
        </div>
      )}

      {/* ══ MENU ══ */}
      {appState === 'MENU' && (
        <StartScreen
          mode={mode}
          onModeChange={setMode}
          playerName={playerName}
          onPlayerNameChange={setPlayerName}
          onStartGame={handleStartGame}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
          debugMode={debugMode}
          onToggleDebug={handleToggleDebug}
          reduceMotion={reduceMotion}
          onToggleReduceMotion={handleToggleReduceMotion}
        />
      )}

      {/* ══ READY & CALIBRATION (Section 33, 34) ══ */}
      {appState === 'READY' && (
        <CalibrationModal
          handsCount={handsCount}
          onReady={handleLaunchCountdown}
          onCancel={handleRestart}
        />
      )}

      {/* ══ COUNTDOWN ══ */}
      {appState === 'COUNTDOWN' && showCountdown && (
        <div className="countdown-screen" aria-live="assertive">
          <span className="countdown-label">Get Ready</span>
          <span key={countdownValue} className="countdown-number">
            {countdownValue}
          </span>
        </div>
      )}

      {/* ══ PAUSED ══ */}
      {appState === 'PAUSED' && (
        <div className="paused-screen">
          <span className="paused-title">PAUSED</span>
          <span className="paused-sub">Press ESC or click to resume</span>
          <button
            type="button"
            className="btn-primary-glow"
            onClick={handleTogglePause}
            style={{ marginTop: 8 }}
          >
            ▶ Resume
          </button>
          <button type="button" className="btn-secondary" onClick={handleRestart}>
            Back to Menu
          </button>
        </div>
      )}

      {/* ══ CAMERA ERROR ══ */}
      {appState === 'CAMERA_ERROR' && (
        <div className="ui-layer">
          <div className="error-panel" role="alert">
            <div className="error-icon">📷</div>
            <h2 className="error-title">Camera Not Available</h2>
            <p className="error-message">
              {cameraErrorMsg ||
                'Could not access your camera. Ensure you have granted camera permissions and no other app is using it.'}
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '8px 0 16px', lineHeight: 1.5 }}>
              You can still play using your <strong>mouse</strong> to control the hand position.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
              <button
                id="camera-error-retry-btn"
                type="button"
                className="btn-primary-glow"
                onClick={handleRetryCamera}
              >
                ↩ Try Again
              </button>
              <button
                id="camera-error-mouse-btn"
                type="button"
                className="btn-secondary"
                onClick={handlePlayWithMouse}
                style={{ borderColor: 'var(--neon-cyan)', color: 'var(--neon-cyan)' }}
              >
                🖱 Play with Mouse
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ GAME OVER ══ */}
      {appState === 'GAME_OVER' && gameOverStats && (
        <div className="ui-layer">
          <div className="game-over-panel" role="dialog" aria-modal="true" aria-label="Game Over">
            {isNewRecord && (
              <div className="new-record-badge">🏆 New Record!</div>
            )}
            <h2 className="game-over-title">Game Over</h2>
            <p className="game-over-reason">{gameOverStats.reason}</p>

            <div className="stats-grid">
              <div className="stat-cell highlight">
                <span className="stat-label">Score</span>
                <span className="stat-value">
                  {gameOverStats.score.toString().padStart(5, '0')}
                </span>
              </div>
              <div className="stat-cell">
                <span className="stat-label">Max Combo</span>
                <span className="stat-value">×{gameOverStats.maxCombo}</span>
              </div>
              <div className="stat-cell">
                <span className="stat-label">Caught / Miss</span>
                <span className="stat-value">{gameOverStats.caught} / {gameOverStats.missed}</span>
              </div>
              <div className="stat-cell">
                <span className="stat-label">Accuracy</span>
                <span className="stat-value">
                  {gameOverStats.accuracy.toFixed(0)}%
                </span>
              </div>
              <div className="stat-cell">
                <span className="stat-label">Reaction (Avg / Fast)</span>
                <span className="stat-value" style={{ color: 'var(--neon-gold)', fontSize: 16 }}>
                  {gameOverStats.averageReactionTime}s / {gameOverStats.bestReactionTime ? `${gameOverStats.bestReactionTime}s` : 'N/A'}
                </span>
              </div>
              <div className="stat-cell">
                <span className="stat-label">Hand Control</span>
                <span className="stat-value" style={{ color: 'var(--neon-cyan)' }}>
                  {gameOverStats.handControlRating ?? 88}%
                </span>
              </div>
              <div className="stat-cell">
                <span className="stat-label">XP Gained / Level</span>
                <span className="stat-value" style={{ color: 'var(--neon-gold)', fontSize: 14 }}>
                  +{gameOverStats.xpEarned ?? 0} XP (LVL {gameOverStats.playerLevel ?? 1})
                </span>
              </div>
              <div className="stat-cell">
                <span className="stat-label">Rating</span>
                <span className="stat-value" style={{ color: 'var(--neon-cyan)', fontSize: 18 }}>
                  {gameOverStats.performanceRating}
                </span>
              </div>
            </div>

            {/* AI Performance Coach & Spatial Analytics (W-006) */}
            {gameOverStats.spatialInsights && gameOverStats.spatialInsights.length > 0 && (
              <div className="ai-coach-card">
                <div className="ai-coach-header">
                  <span className="ai-coach-title">🧠 AI PERFORMANCE COACH</span>
                  <span style={{ fontSize: '0.62rem', color: 'var(--cyan-dim)', fontFamily: 'var(--font-hud)' }}>
                    DOMINANT: {gameOverStats.dominantSide?.toUpperCase() || 'BALANCED'}
                  </span>
                </div>
                <div className="spatial-balance-bar">
                  <div className="balance-left" style={{ width: `${gameOverStats.leftAccuracy || 33}%` }} title={`Left: ${gameOverStats.leftAccuracy}%`} />
                  <div className="balance-center" style={{ width: `${gameOverStats.centerAccuracy || 34}%` }} title={`Center: ${gameOverStats.centerAccuracy}%`} />
                  <div className="balance-right" style={{ width: `${gameOverStats.rightAccuracy || 33}%` }} title={`Right: ${gameOverStats.rightAccuracy}%`} />
                </div>
                <div className="spatial-stats-row">
                  <span>LEFT: {gameOverStats.leftAccuracy ?? 100}%</span>
                  <span>CENTER: {gameOverStats.centerAccuracy ?? 100}%</span>
                  <span>RIGHT: {gameOverStats.rightAccuracy ?? 100}%</span>
                </div>
                <div className="ai-insight-list">
                  {gameOverStats.spatialInsights.map((insight, i) => (
                    <div key={i} className="ai-insight-item">{insight}</div>
                  ))}
                </div>
              </div>
            )}

            {/* Leaderboard refreshes after score POST */}
            <Leaderboard mode={gameOverStats.mode} highlightScore={highlightScore} />

            <div className="game-over-actions" style={{ marginTop: 20 }}>
              <button
                type="button"
                className="btn-primary-glow"
                onClick={() => {
                  // FIX BUG-003: use proper countdown → PLAYING flow, not engine.start() + setTimeout race
                  const engine = engineRef.current;
                  if (!engine) return;
                  setGameOverStats(null);
                  setIsNewRecord(false);
                  setHighlightScore(null);
                  // Re-wire game-over callback for the next session
                  engine.onGameOver = async (stats: GameOverStats) => {
                    transitionTo('GAME_OVER');
                    setGameOverStats(stats);
                    const saved = await postScore(stats);
                    if (saved) {
                      setHighlightScore(saved.score);
                      try {
                        const cached = localStorage.getItem(`handCatch.leaderboard.${stats.mode}`);
                        if (cached) {
                          const arr = JSON.parse(cached) as LeaderboardItem[];
                          if (!arr.length || stats.score > arr[0].score) setIsNewRecord(true);
                        } else {
                          setIsNewRecord(true);
                        }
                      } catch { /* ignore */ }
                    }
                  };
                  // Trigger countdown — handleCountdownDone will call engine.start()
                  setShowCountdown(true);
                  transitionTo('COUNTDOWN');
                }}
              >
                ↩ Play Again
              </button>
              <button type="button" className="btn-secondary" onClick={handleRestart}>
                Main Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
