/**
 * main.js - Application Bootstrap & State Machine Wiring
 * Manages high-level lifecycle: LOADING -> MENU -> REQUESTING_CAMERA ->
 * INIT_TRACKING -> COUNTDOWN -> PLAYING -> GAME_OVER / PAUSED
 */
import { GAME_CONFIG } from './config.js';
import { handTracker } from './handTracking.js';
import { GameEngine } from './game.js';
import { UIManager } from './ui.js';
import { audio } from './audio.js';

class App {
  constructor() {
    this.state = 'LOADING'; // LOADING | MENU | REQUESTING_CAMERA | INIT_TRACKING | COUNTDOWN | PLAYING | PAUSED | GAME_OVER | CAMERA_ERROR
    this.canvas = document.getElementById('game-canvas');
    this.game = null;
    this.ui = null;
    this.autoResumeCountdown = null;
    this.autoPauseTimer = null;
    this.lastHandSeenTimestamp = performance.now();

    this.init();
  }

  async init() {
    try {
      // 1. Initialize Game Engine
      this.game = new GameEngine(this.canvas, (stats) => {
        this.setState('GAME_OVER', stats);
      });

      // 2. Initialize UI Manager
      this.ui = new UIManager({
        onStartGame: (mode, name) => this.handleStartRequest(mode, name),
        onRestart: (mode, name) => this.handleRestartRequest(mode, name),
        onReturnMenu: () => this.handleReturnMenu(),
        onResume: () => this.handleResume(),
        onToggleDebug: () => this.game.toggleDebugMode(),
        onToggleMute: () => audio.toggleMute()
      });

      // 3. Connect HandTracker Status & Error Listeners
      handTracker.onStatusChange = (status) => {
        this.ui.updateStatus(status);
        if (status === 'ACTIVE') {
          this.lastHandSeenTimestamp = performance.now();
          // If paused due to lost hands, trigger auto-resume countdown!
          if (this.state === 'PAUSED' && this.pauseReason === 'No Hand Detected') {
            this.handleAutoResume();
          }
        }
      };

      handTracker.onError = (err) => {
        this.setState('CAMERA_ERROR', err);
      };

      // 4. Global keyboard shortcuts
      this.initKeyboardShortcuts();

      // 5. Visibility change handling (Auto-pause when tab is hidden)
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && this.state === 'PLAYING') {
          this.pauseReason = 'Tab Hidden';
          this.setState('PAUSED');
        }
      });

      // 6. Start Main Animation Render & Dwell Loop
      this.startMainLoop();

      // Ready to show menu
      this.setState('MENU');
    } catch (err) {
      console.error('Fatal initialization error:', err);
      this.setState('CAMERA_ERROR', err);
    }
  }

  initKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Ignore if typing in the player name input field
      if (e.target && e.target.tagName === 'INPUT') return;

      if (e.key === 'd' || e.key === 'D') {
        const isDebug = this.game.toggleDebugMode();
        const toggleBtn = document.getElementById('btn-debug-toggle');
        if (toggleBtn) toggleBtn.classList.toggle('active', isDebug);
      } else if (e.key === 'm' || e.key === 'M') {
        const isMuted = audio.toggleMute();
        const soundBtn = document.getElementById('btn-sound-toggle');
        if (soundBtn) soundBtn.classList.toggle('muted', isMuted);
      } else if (e.key === 'Escape') {
        if (this.state === 'PLAYING') {
          this.pauseReason = 'Manual Pause';
          this.setState('PAUSED');
        } else if (this.state === 'PAUSED') {
          this.handleResume();
        }
      } else if (e.key === ' ' || e.key === 'Spacebar') {
        if (this.state === 'MENU') {
          this.ui.btnStart.click();
        } else if (this.state === 'PLAYING') {
          this.pauseReason = 'Manual Pause';
          this.setState('PAUSED');
        } else if (this.state === 'PAUSED') {
          this.handleResume();
        }
      }
    });
  }

  setState(nextState, payload = null) {
    const prevState = this.state;
    this.state = nextState;

    switch (nextState) {
      case 'MENU':
        this.game.stop();
        this.ui.showScreen('screen-menu');
        this.ui.updateStatus('IDLE');
        break;

      case 'REQUESTING_CAMERA':
        this.ui.updateStatus('REQUESTING_CAMERA');
        break;

      case 'INIT_TRACKING':
        this.ui.updateStatus('INIT_TRACKING');
        break;

      case 'COUNTDOWN':
        this.ui.startCountdown(() => {
          this.setState('PLAYING');
        });
        break;

      case 'PLAYING':
        this.ui.showScreen(null); // Clear overlay screens to reveal canvas arena
        if (prevState === 'PAUSED') {
          this.game.resume();
        } else {
          this.game.start(this.currentMode, this.currentPlayerName);
        }
        break;

      case 'PAUSED':
        this.game.pause();
        this.ui.showPauseScreen(this.pauseReason || 'Game Paused');
        break;

      case 'GAME_OVER':
        this.game.stop();
        this.ui.showGameOverScreen(payload);
        break;

      case 'CAMERA_ERROR':
        this.game.stop();
        handTracker.stop();
        this.ui.showErrorScreen(payload || new Error('Camera tracking encountered an error.'));
        break;
    }
  }

  async handleStartRequest(mode, playerName) {
    this.currentMode = mode;
    this.currentPlayerName = playerName;

    // 1. Initialize synthesized Web Audio on user gesture click
    await audio.init();

    // 2. Start Camera and MediaPipe if not already running
    try {
      if (!handTracker.video) {
        this.setState('REQUESTING_CAMERA');
        await handTracker.startCamera();
      }

      if (!handTracker.isTracking) {
        this.setState('INIT_TRACKING');
        await handTracker.initMediaPipe();
      }

      // 3. Begin Countdown
      this.setState('COUNTDOWN');
    } catch (err) {
      console.error('Failed to start camera/tracking:', err);
      this.setState('CAMERA_ERROR', err);
    }
  }

  handleRestartRequest(mode, playerName) {
    this.currentMode = mode;
    this.currentPlayerName = playerName;
    this.setState('COUNTDOWN');
  }

  handleReturnMenu() {
    handTracker.stop();
    this.setState('MENU');
  }

  handleResume() {
    if (this.state !== 'PAUSED') return;
    this.setState('PLAYING');
  }

  handleAutoResume() {
    if (this.state !== 'PAUSED') return;
    const reasonEl = document.getElementById('pause-reason');
    if (reasonEl) reasonEl.textContent = 'Hand returned! Resuming in 1s…';

    if (this.autoResumeCountdown) clearTimeout(this.autoResumeCountdown);
    this.autoResumeCountdown = setTimeout(() => {
      if (this.state === 'PAUSED') {
        this.handleResume();
      }
    }, 1000);
  }

  /**
   * Main Unified Animation Loop
   */
  startMainLoop() {
    const tick = (timestamp) => {
      // 1. Update Game Physics & Render
      this.game.loop(timestamp);

      // 2. Update Hand-Dwell Interactive Buttons (Mouse-free navigation)
      const trackedHands = handTracker.getTrackedHands();
      this.ui.updateHandDwell(trackedHands);

      // 3. Check Auto-Pause (if in-game and no hands detected for autoPauseAfterMs)
      if (this.state === 'PLAYING') {
        const hasHand = handTracker.isAnyHandPresent();
        if (hasHand) {
          this.lastHandSeenTimestamp = timestamp;
        } else {
          if (timestamp - this.lastHandSeenTimestamp > GAME_CONFIG.autoPauseAfterMs) {
            this.pauseReason = 'No Hand Detected';
            this.setState('PAUSED');
          }
        }
      }

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }
}

// Global safety error boundaries
window.addEventListener('error', (event) => {
  console.error('Global runtime error caught:', event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled Promise rejection:', event.reason);
});

// Bootstrap when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  window.__handCatchApp = new App();
});
