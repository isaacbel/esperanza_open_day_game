'use client';

import React, { useState } from 'react';
import { GameMode } from '../vision/HandTypes';
import { ModeSelector } from './ModeSelector';
import { SettingsPanel } from './SettingsPanel';
import { ProgressionSystem } from '../game/ProgressionSystem';
import { AchievementSystem } from '../game/AchievementSystem';

interface StartScreenProps {
  mode: GameMode;
  onModeChange: (mode: GameMode) => void;
  playerName: string;
  onPlayerNameChange: (name: string) => void;
  inputMode: 'CAMERA' | 'MOUSE';
  onInputModeChange: (mode: 'CAMERA' | 'MOUSE') => void;
  onStartGame: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  debugMode: boolean;
  onToggleDebug: () => void;
  reduceMotion: boolean;
  onToggleReduceMotion: () => void;
}

export const StartScreen: React.FC<StartScreenProps> = ({
  mode,
  onModeChange,
  playerName,
  onPlayerNameChange,
  inputMode,
  onInputModeChange,
  onStartGame,
  isMuted,
  onToggleMute,
  debugMode,
  onToggleDebug,
  reduceMotion,
  onToggleReduceMotion,
}) => {
  const [showAchievements, setShowAchievements] = useState(false);
  const prog = ProgressionSystem.getProgression();
  const achievements = AchievementSystem.getAllWithStatus();
  const unlockedCount = achievements.filter(a => a.isUnlocked).length;

  const currentXp = prog.xp;
  const currentReq = prog.currentTier.xpRequired;
  const nextReq = prog.nextTier ? prog.nextTier.xpRequired : currentReq + 10000;
  const xpPercent = Math.min(100, Math.max(0, Math.round(((currentXp - currentReq) / (nextReq - currentReq)) * 100)));

  return (
    <main className="ui-layer" role="region" aria-label="Main Menu">
      <div className="glass-panel main-menu-glass">
        <header className="menu-header">
          <div className="title-row">
            <h1 className="game-title">HAND CATCH</h1>
            <div className="player-xp-badge">
              <div className="badge-level">LVL {prog.level}</div>
              <div className="badge-info">
                <span className="badge-title">{prog.title}</span>
                <div className="xp-bar-container">
                  <div className="xp-bar-fill" style={{ width: `${xpPercent}%` }} />
                </div>
              </div>
            </div>
          </div>
          <p className="game-tagline">ARCADE REFLEX & COMPUTER VISION INTERACTION</p>
        </header>

        <div className="menu-grid">
          {/* Left Column: Mode Selector & Player Tag */}
          <div className="menu-section">
            <div className="section-label">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              Select Game Mode
            </div>

            <ModeSelector mode={mode} onChange={onModeChange} />

            <div className="name-input-group">
              <label htmlFor="input-player-name">Call-Sign</label>
              <input
                id="input-player-name"
                type="text"
                maxLength={12}
                value={playerName}
                onChange={(e) => onPlayerNameChange(e.target.value.slice(0, 12))}
                placeholder="PLAYER"
                autoComplete="off"
                spellCheck="false"
              />
            </div>

            <div className="input-source-group" style={{ marginTop: 14 }}>
              <div className="section-label" style={{ marginBottom: 8, fontSize: 11 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                Control Method
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button
                  type="button"
                  id="btn-input-camera"
                  className={`btn-mode-toggle ${inputMode === 'CAMERA' ? 'active' : ''}`}
                  onClick={() => onInputModeChange('CAMERA')}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: inputMode === 'CAMERA' ? 'rgba(0, 240, 255, 0.18)' : 'rgba(255, 255, 255, 0.04)',
                    border: inputMode === 'CAMERA' ? '1px solid var(--neon-cyan)' : '1px solid rgba(255, 255, 255, 0.1)',
                    color: inputMode === 'CAMERA' ? '#00f0ff' : 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    transition: 'all 0.2s ease'
                  }}
                >
                  📷 Webcam AI
                </button>
                <button
                  type="button"
                  id="btn-input-mouse"
                  className={`btn-mode-toggle ${inputMode === 'MOUSE' ? 'active' : ''}`}
                  onClick={() => onInputModeChange('MOUSE')}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: inputMode === 'MOUSE' ? 'rgba(0, 240, 255, 0.18)' : 'rgba(255, 255, 255, 0.04)',
                    border: inputMode === 'MOUSE' ? '1px solid var(--neon-cyan)' : '1px solid rgba(255, 255, 255, 0.1)',
                    color: inputMode === 'MOUSE' ? '#00f0ff' : 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    transition: 'all 0.2s ease'
                  }}
                >
                  🖱️ Mouse
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Interaction Guide & Objects Legend */}
          <div className="menu-section">
            <div className="section-label">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              Physical Gestures & Objects
            </div>

            <div className="legend-grid">
              <div className="legend-item">
                <span className="legend-icon">🖐</span>
                <div><strong>Open Hand</strong>: Normal catch & baseline score.</div>
              </div>
              <div className="legend-item">
                <span className="legend-icon">✊</span>
                <div><strong>Fist / Grab</strong>: +50 Perfect Grab bonus & catches Ghosts.</div>
              </div>
              <div className="legend-item">
                <span className="legend-icon">💨</span>
                <div><strong>Fast Swipe</strong>: Deflect red bombs (+150 pts).</div>
              </div>
              <div className="legend-item">
                <span className="legend-icon">❄️</span>
                <div><strong>Freeze Orb</strong>: Slows down time for 3.5s.</div>
              </div>
              <div className="legend-item">
                <span className="legend-icon">🌀</span>
                <div><strong>Quantum Warp</strong>: Teleports horizontally midway down.</div>
              </div>
              <div className="legend-item">
                <span className="legend-icon">💣</span>
                <div><strong>Hazard Bomb</strong>: Touch costs 2 lives! Deflect it!</div>
              </div>
            </div>

            <button
              type="button"
              className="btn-achievement-drawer"
              onClick={() => setShowAchievements(true)}
            >
              🏆 View Achievements ({unlockedCount}/{achievements.length})
            </button>
          </div>
        </div>

        {/* Start Action & Settings */}
        <div className="menu-actions">
          <button
            type="button"
            className="btn-primary-glow dwell-btn"
            onClick={onStartGame}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            LAUNCH MISSION
          </button>

          <SettingsPanel
            isMuted={isMuted}
            onToggleMute={onToggleMute}
            debugMode={debugMode}
            onToggleDebug={onToggleDebug}
            reduceMotion={reduceMotion}
            onToggleReduceMotion={onToggleReduceMotion}
          />
        </div>
      </div>

      {/* Achievements Modal */}
      {showAchievements && (
        <div className="ui-modal-overlay" onClick={() => setShowAchievements(false)}>
          <div className="glass-panel achievements-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>🏆 ACHIEVEMENTS ({unlockedCount}/{achievements.length})</h2>
              <button type="button" className="btn-close" onClick={() => setShowAchievements(false)}>✕</button>
            </div>
            <div className="achievements-list">
              {achievements.map((ach) => (
                <div key={ach.id} className={`achievement-card ${ach.isUnlocked ? 'unlocked' : 'locked'}`}>
                  <span className="ach-icon">{ach.icon}</span>
                  <div className="ach-details">
                    <div className="ach-title">
                      {ach.title} {ach.isUnlocked && <span className="ach-check">✓ UNLOCKED</span>}
                    </div>
                    <div className="ach-desc">{ach.description}</div>
                  </div>
                  <div className="ach-xp">+{ach.xpReward} XP</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
