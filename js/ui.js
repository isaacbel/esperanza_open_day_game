/**
 * ui.js - Screen Transitions, Glassmorphic Overlays, Status Pill,
 * Hand-Dwell Mouse-Free Navigation, and Leaderboard Presentation.
 */
import { GAME_CONFIG } from './config.js';
import { leaderboard } from './leaderboard.js';
import { audio } from './audio.js';
import { handTracker } from './handTracking.js';

export class UIManager {
  constructor(handlers) {
    this.handlers = handlers; // { onStartGame, onRestart, onReturnMenu, onResume, onToggleDebug, onToggleMute, onToggleMotion }

    // Screen elements
    this.screenMenu = document.getElementById('screen-menu');
    this.screenCountdown = document.getElementById('screen-countdown');
    this.screenPaused = document.getElementById('screen-paused');
    this.screenGameOver = document.getElementById('screen-game-over');
    this.screenError = document.getElementById('screen-error');

    // UI Controls
    this.statusPill = document.getElementById('status-pill');
    this.statusText = document.getElementById('status-text');
    this.statusDot = document.getElementById('status-dot');

    this.btnStart = document.getElementById('btn-start-game');
    this.btnPlayAgain = document.getElementById('btn-play-again');
    this.btnGameOverMenu = document.getElementById('btn-game-over-menu');
    this.btnResume = document.getElementById('btn-resume');
    this.btnPauseMenu = document.getElementById('btn-pause-menu');
    this.btnRetry = document.getElementById('btn-retry-error');
    this.btnErrorMenu = document.getElementById('btn-error-menu');

    this.btnSoundToggle = document.getElementById('btn-sound-toggle');
    this.btnDebugToggle = document.getElementById('btn-debug-toggle');
    this.btnMotionToggle = document.getElementById('btn-motion-toggle');
    this.btnFullscreen = document.getElementById('btn-fullscreen');

    this.inputPlayerName = document.getElementById('input-player-name');
    this.modeNormalRadio = document.getElementById('mode-normal');
    this.modeEndlessRadio = document.getElementById('mode-endless');

    this.leaderboardList = document.getElementById('leaderboard-list');
    this.btnClearLeaderboard = document.getElementById('btn-clear-leaderboard');
    this.clearConfirmTimeout = null;

    // Countdown state
    this.countdownTimer = null;
    this.countdownValue = 3;

    // Hand Dwell tracking state
    this.hoveredDwellElement = null;
    this.dwellStartTime = 0;
    this.dwellProgress = 0;
    this.lastDwellTickTime = 0;

    // Insecure / file protocol banner
    this.checkInsecureContext();

    // Bind event listeners
    this.initEventListeners();
    this.loadSavedPreferences();
    this.renderLeaderboard();
  }

  checkInsecureContext() {
    const isFile = window.location.protocol === 'file:';
    const isSecure = window.isSecureContext;

    if (isFile || !isSecure) {
      const banner = document.getElementById('insecure-banner');
      if (banner) {
        banner.style.display = 'flex';
        const reason = isFile ? 'Loaded via file://' : 'Insecure HTTP context';
        const msg = document.getElementById('insecure-msg');
        if (msg) {
          msg.textContent = `${reason}: Webcam and Web Workers require a secure local server (http://localhost). Run: python -m http.server 8000 or npx serve`;
        }
      }
    }
  }

  loadSavedPreferences() {
    try {
      const savedName = localStorage.getItem('handCatch.playerName');
      if (savedName && this.inputPlayerName) {
        this.inputPlayerName.value = savedName.slice(0, 12);
      }
      const savedMode = localStorage.getItem('handCatch.mode');
      if (savedMode === 'ENDLESS' && this.modeEndlessRadio) {
        this.modeEndlessRadio.checked = true;
      }
      const savedMotion = localStorage.getItem('handCatch.reduceMotion');
      if (savedMotion === 'true' && this.btnMotionToggle) {
        this.btnMotionToggle.classList.add('active');
        GAME_CONFIG.reduceMotion = true;
      }
    } catch (_) {}
  }

  savePlayerName() {
    if (this.inputPlayerName) {
      const name = this.inputPlayerName.value.trim().slice(0, 12) || 'PLAYER';
      try {
        localStorage.setItem('handCatch.playerName', name);
      } catch (_) {}
      return name;
    }
    return 'PLAYER';
  }

  getSelectedMode() {
    if (this.modeEndlessRadio && this.modeEndlessRadio.checked) {
      return 'ENDLESS';
    }
    return 'NORMAL';
  }

  initEventListeners() {
    // Mode radio save
    if (this.modeNormalRadio) {
      this.modeNormalRadio.addEventListener('change', () => {
        try { localStorage.setItem('handCatch.mode', 'NORMAL'); } catch (_) {}
        this.renderLeaderboard();
      });
    }
    if (this.modeEndlessRadio) {
      this.modeEndlessRadio.addEventListener('change', () => {
        try { localStorage.setItem('handCatch.mode', 'ENDLESS'); } catch (_) {}
        this.renderLeaderboard();
      });
    }

    // Start Button
    if (this.btnStart) {
      this.btnStart.addEventListener('click', () => {
        const mode = this.getSelectedMode();
        const playerName = this.savePlayerName();
        if (this.handlers.onStartGame) this.handlers.onStartGame(mode, playerName);
      });
    }

    // Play Again Button
    if (this.btnPlayAgain) {
      this.btnPlayAgain.addEventListener('click', () => {
        const mode = this.getSelectedMode();
        const playerName = this.savePlayerName();
        if (this.handlers.onRestart) this.handlers.onRestart(mode, playerName);
      });
    }

    // Return to Menu Buttons
    if (this.btnGameOverMenu) {
      this.btnGameOverMenu.addEventListener('click', () => {
        if (this.handlers.onReturnMenu) this.handlers.onReturnMenu();
      });
    }
    if (this.btnPauseMenu) {
      this.btnPauseMenu.addEventListener('click', () => {
        if (this.handlers.onReturnMenu) this.handlers.onReturnMenu();
      });
    }
    if (this.btnErrorMenu) {
      this.btnErrorMenu.addEventListener('click', () => {
        if (this.handlers.onReturnMenu) this.handlers.onReturnMenu();
      });
    }

    // Resume Button
    if (this.btnResume) {
      this.btnResume.addEventListener('click', () => {
        if (this.handlers.onResume) this.handlers.onResume();
      });
    }

    // Retry Button
    if (this.btnRetry) {
      this.btnRetry.addEventListener('click', () => {
        const mode = this.getSelectedMode();
        const playerName = this.savePlayerName();
        if (this.handlers.onStartGame) this.handlers.onStartGame(mode, playerName);
      });
    }

    // Sound Mute Toggle
    if (this.btnSoundToggle) {
      this.btnSoundToggle.addEventListener('click', () => {
        const muted = audio.toggleMute();
        this.btnSoundToggle.classList.toggle('muted', muted);
        this.btnSoundToggle.setAttribute('aria-label', muted ? 'Unmute Sound' : 'Mute Sound');
      });
    }

    // Debug Mode Toggle
    if (this.btnDebugToggle) {
      this.btnDebugToggle.addEventListener('click', () => {
        const isDebug = this.handlers.onToggleDebug ? this.handlers.onToggleDebug() : false;
        this.btnDebugToggle.classList.toggle('active', isDebug);
      });
    }

    // Reduce Motion Toggle
    if (this.btnMotionToggle) {
      this.btnMotionToggle.addEventListener('click', () => {
        GAME_CONFIG.reduceMotion = !GAME_CONFIG.reduceMotion;
        this.btnMotionToggle.classList.toggle('active', GAME_CONFIG.reduceMotion);
        try {
          localStorage.setItem('handCatch.reduceMotion', GAME_CONFIG.reduceMotion.toString());
        } catch (_) {}
      });
    }

    // Fullscreen Toggle
    if (this.btnFullscreen) {
      this.btnFullscreen.addEventListener('click', () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      });
    }

    // Clear Leaderboard with 3-second confirmation step
    if (this.btnClearLeaderboard) {
      this.btnClearLeaderboard.addEventListener('click', () => {
        if (this.btnClearLeaderboard.dataset.confirming === 'true') {
          // Confirmed!
          const mode = this.getSelectedMode();
          leaderboard.clear(mode);
          this.renderLeaderboard();
          this.resetClearConfirm();
        } else {
          // First click: ask confirm
          this.btnClearLeaderboard.dataset.confirming = 'true';
          this.btnClearLeaderboard.textContent = 'CONFIRM CLEAR?';
          this.btnClearLeaderboard.classList.add('confirming');

          if (this.clearConfirmTimeout) clearTimeout(this.clearConfirmTimeout);
          this.clearConfirmTimeout = setTimeout(() => {
            this.resetClearConfirm();
          }, 3000);
        }
      });
    }
  }

  resetClearConfirm() {
    if (this.btnClearLeaderboard) {
      this.btnClearLeaderboard.dataset.confirming = 'false';
      this.btnClearLeaderboard.textContent = 'CLEAR LEADERBOARD';
      this.btnClearLeaderboard.classList.remove('confirming');
    }
    if (this.clearConfirmTimeout) {
      clearTimeout(this.clearConfirmTimeout);
      this.clearConfirmTimeout = null;
    }
  }

  renderLeaderboard(highlightScore = null) {
    if (!this.leaderboardList) return;
    const mode = this.getSelectedMode();
    const top = leaderboard.getTop(mode, 5);

    this.leaderboardList.innerHTML = '';
    if (top.length === 0) {
      const emptyItem = document.createElement('li');
      emptyItem.className = 'leaderboard-empty';
      emptyItem.textContent = 'No records yet. Catch columns to set a score!';
      this.leaderboardList.appendChild(emptyItem);
      return;
    }

    top.forEach((entry, idx) => {
      const li = document.createElement('li');
      li.className = 'leaderboard-row';
      if (highlightScore !== null && entry.score === highlightScore) {
        li.classList.add('highlight-row');
      }

      const rankSpan = document.createElement('span');
      rankSpan.className = 'col-rank';
      rankSpan.textContent = `#${idx + 1}`;

      const nameSpan = document.createElement('span');
      nameSpan.className = 'col-name';
      nameSpan.textContent = entry.name;

      const comboSpan = document.createElement('span');
      comboSpan.className = 'col-combo';
      comboSpan.textContent = `x${entry.maxCombo || 0}`;

      const scoreSpan = document.createElement('span');
      scoreSpan.className = 'col-score';
      scoreSpan.textContent = entry.score.toString().padStart(4, '0');

      li.appendChild(rankSpan);
      li.appendChild(nameSpan);
      li.appendChild(comboSpan);
      li.appendChild(scoreSpan);

      this.leaderboardList.appendChild(li);
    });
  }

  /**
   * Status Pill updater
   */
  updateStatus(statusKey) {
    if (!this.statusText || !this.statusDot) return;

    this.statusDot.className = 'status-dot';
    switch (statusKey) {
      case 'REQUESTING_CAMERA':
        this.statusText.textContent = 'Requesting Camera Permission…';
        this.statusDot.classList.add('amber');
        break;
      case 'CAMERA_READY':
        this.statusText.textContent = 'Camera Ready';
        this.statusDot.classList.add('amber');
        break;
      case 'INIT_TRACKING':
        this.statusText.textContent = 'Hand Tracking Initializing…';
        this.statusDot.classList.add('amber');
        break;
      case 'ACTIVE':
        const handsCount = handTracker.getTrackedHands().length;
        this.statusText.textContent = `Hand Tracking: ACTIVE (${handsCount} hand${handsCount === 1 ? '' : 's'})`;
        this.statusDot.classList.add('green');
        break;
      case 'NO_HANDS':
        this.statusText.textContent = 'No Hand Detected';
        this.statusDot.classList.add('red');
        break;
      case 'ERROR':
        this.statusText.textContent = 'Tracking Error';
        this.statusDot.classList.add('red');
        break;
      default:
        this.statusText.textContent = 'System Ready';
        this.statusDot.classList.add('amber');
    }
  }

  showScreen(screenId) {
    const screens = [
      this.screenMenu,
      this.screenCountdown,
      this.screenPaused,
      this.screenGameOver,
      this.screenError
    ];

    screens.forEach(s => {
      if (s) {
        s.style.display = s.id === screenId ? 'flex' : 'none';
        s.setAttribute('aria-hidden', s.id === screenId ? 'false' : 'true');
      }
    });

    if (screenId === 'screen-menu') {
      this.renderLeaderboard();
    }
  }

  /**
   * Countdown: 3, 2, 1, GO!
   */
  startCountdown(onComplete) {
    this.showScreen('screen-countdown');
    const numberEl = document.getElementById('countdown-number');
    const ringEl = document.getElementById('countdown-ring');

    let count = 3;
    if (numberEl) {
      numberEl.textContent = count;
      numberEl.className = 'countdown-num pop';
    }
    audio.playTick(false);

    if (this.countdownTimer) clearInterval(this.countdownTimer);

    this.countdownTimer = setInterval(() => {
      count--;
      if (count > 0) {
        if (numberEl) {
          numberEl.textContent = count;
          numberEl.className = 'countdown-num pop';
        }
        audio.playTick(false);
      } else if (count === 0) {
        if (numberEl) {
          numberEl.textContent = 'GO!';
          numberEl.className = 'countdown-num pop go';
        }
        audio.playTick(true);
      } else {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
        this.showScreen(null); // Hide countdown overlay
        if (onComplete) onComplete();
      }
    }, 1000);
  }

  showPauseScreen(reason = 'Game Paused') {
    this.showScreen('screen-paused');
    const reasonEl = document.getElementById('pause-reason');
    if (reasonEl) {
      reasonEl.textContent = reason;
    }
  }

  showGameOverScreen(stats) {
    this.showScreen('screen-game-over');

    // Populate Game Over metrics
    const finalScoreEl = document.getElementById('go-final-score');
    const maxComboEl = document.getElementById('go-max-combo');
    const caughtEl = document.getElementById('go-caught');
    const accuracyEl = document.getElementById('go-accuracy');
    const modeBadgeEl = document.getElementById('go-mode-badge');
    const newRecordBadge = document.getElementById('go-new-record');

    if (finalScoreEl) {
      // Animated count-up
      this.animateCountUp(finalScoreEl, stats.score, 1000);
    }
    if (maxComboEl) maxComboEl.textContent = `x${stats.maxCombo}`;
    if (caughtEl) caughtEl.textContent = `${stats.caught} / ${stats.totalSpawned}`;
    if (accuracyEl) accuracyEl.textContent = `${stats.accuracy}%`;
    if (modeBadgeEl) modeBadgeEl.textContent = stats.mode;

    // Check if new record
    const isNew = leaderboard.isHighScore(stats.score, stats.mode);
    if (newRecordBadge) {
      newRecordBadge.style.display = isNew ? 'inline-block' : 'none';
    }

    // Auto-save to leaderboard
    leaderboard.add({
      name: stats.playerName,
      score: stats.score,
      maxCombo: stats.maxCombo,
      caught: stats.caught,
      mode: stats.mode
    });

    // Render leaderboard with highlighted score
    this.renderLeaderboard(stats.score);
  }

  animateCountUp(el, target, durationMs) {
    const start = 0;
    const startTime = performance.now();

    const update = (now) => {
      const progress = Math.min(1, (now - startTime) / durationMs);
      const val = Math.floor(start + (target - start) * progress);
      el.textContent = val.toString().padStart(4, '0');
      if (progress < 1) {
        requestAnimationFrame(update);
      }
    };
    requestAnimationFrame(update);
  }

  showErrorScreen(error) {
    this.showScreen('screen-error');
    const titleEl = document.getElementById('error-title');
    const descEl = document.getElementById('error-desc');
    const stepsEl = document.getElementById('error-steps');

    if (!titleEl || !descEl || !stepsEl) return;

    if (error.name === 'NotAllowedError') {
      titleEl.textContent = 'Camera Permission Denied';
      descEl.textContent = 'Camera access is required to play this game so the AI can track your hands.';
      stepsEl.innerHTML = `
        <li>Click the lock or camera icon in your browser's address bar.</li>
        <li>Set <strong>Camera</strong> to <strong>Allow</strong>.</li>
        <li>Click <strong>Retry</strong> below or refresh the page.</li>
      `;
    } else if (error.name === 'NotFoundError') {
      titleEl.textContent = 'No Camera Detected';
      descEl.textContent = 'Could not find a webcam or video capture device connected to your computer.';
      stepsEl.innerHTML = `
        <li>Check that your webcam is plugged in and recognized by your system.</li>
        <li>Ensure no other application is holding exclusive camera access.</li>
        <li>Or test using <strong>Mouse Test Mode</strong> (add <code>?mouse=1</code> to the URL).</li>
      `;
    } else if (error.name === 'NotReadableError') {
      titleEl.textContent = 'Camera Busy or Disconnected';
      descEl.textContent = 'The camera is currently being used by another application or was unplugged.';
      stepsEl.innerHTML = `
        <li>Close apps using your camera (Zoom, Teams, Discord, other browser tabs).</li>
        <li>Reconnect your webcam and click Retry.</li>
      `;
    } else {
      titleEl.textContent = 'Initialization Failed';
      descEl.textContent = error.message || 'Failed to initialize hand tracking vision model.';
      stepsEl.innerHTML = `
        <li>Ensure you have a working internet connection to load the MediaPipe model CDN.</li>
        <li>Verify you are running in a secure context (http://localhost or https).</li>
        <li>Check browser console for detailed diagnostic logs.</li>
      `;
    }
  }

  /**
   * Hand-Dwell Interactive Buttons Engine.
   * Allows players to trigger buttons without touching the keyboard or mouse!
   */
  updateHandDwell(trackedHands) {
    // Only active during screens with visible buttons (COUNTDOWN, PAUSED, GAME_OVER, START)
    const activeScreen = [
      this.screenMenu,
      this.screenCountdown,
      this.screenPaused,
      this.screenGameOver,
      this.screenError
    ].find(s => s && s.style.display !== 'none');

    if (!activeScreen || trackedHands.length === 0) {
      this.clearDwellState();
      return;
    }

    // Find all clickable buttons with .dwell-btn on current active screen
    const dwellButtons = activeScreen.querySelectorAll('.dwell-btn');
    if (dwellButtons.length === 0) {
      this.clearDwellState();
      return;
    }

    let currentlyHovered = null;

    // Check each hand against each button's client bounding box
    for (const hand of trackedHands) {
      if (!hand.active || hand.opacity < 0.2) continue;

      // Convert hand palm game coordinates to screen client coordinates
      const screenPos = handTracker.gameToCanvas(hand.palm.x, hand.palm.y);
      const clientX = screenPos.x / (window.devicePixelRatio || 1);
      const clientY = screenPos.y / (window.devicePixelRatio || 1);

      for (const btn of dwellButtons) {
        const rect = btn.getBoundingClientRect();
        // Check with generous padding
        if (
          clientX >= rect.left - 15 &&
          clientX <= rect.right + 15 &&
          clientY >= rect.top - 15 &&
          clientY <= rect.bottom + 15
        ) {
          currentlyHovered = btn;
          break;
        }
      }
      if (currentlyHovered) break;
    }

    const now = performance.now();

    if (currentlyHovered) {
      if (this.hoveredDwellElement !== currentlyHovered) {
        // Just started hovering a new button
        this.clearDwellState();
        this.hoveredDwellElement = currentlyHovered;
        this.dwellStartTime = now;
        this.hoveredDwellElement.classList.add('dwell-active');
      }

      const elapsed = now - this.dwellStartTime;
      const progress = Math.min(1.0, elapsed / GAME_CONFIG.dwellMs);
      this.dwellProgress = progress;

      // Update dwell progress visual on button
      this.hoveredDwellElement.style.setProperty('--dwell-progress', `${(progress * 100).toFixed(1)}%`);

      // Gentle tick sounds while dwelling
      if (now - this.lastDwellTickTime >= 180 && progress < 0.95) {
        audio.playDwellTick();
        this.lastDwellTickTime = now;
      }

      // Reached 100% dwell trigger!
      if (progress >= 1.0) {
        audio.playDwellTrigger();
        const targetBtn = this.hoveredDwellElement;
        this.clearDwellState();
        targetBtn.click();
      }
    } else {
      this.clearDwellState();
    }
  }

  clearDwellState() {
    if (this.hoveredDwellElement) {
      this.hoveredDwellElement.classList.remove('dwell-active');
      this.hoveredDwellElement.style.removeProperty('--dwell-progress');
      this.hoveredDwellElement = null;
    }
    this.dwellProgress = 0;
    this.dwellStartTime = 0;
  }
}
