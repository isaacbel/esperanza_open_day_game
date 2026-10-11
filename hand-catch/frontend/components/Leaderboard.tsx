'use client';

import React, { useEffect, useState } from 'react';
import { GameMode } from '../vision/HandTypes';

export interface LeaderboardItem {
  id?: number;
  playerName: string;
  score: number;
  maxCombo: number;
  caught: number;
  missed?: number;
  accuracy?: number;
  mode: string;
  createdAt?: string;
}

interface LeaderboardProps {
  mode: GameMode;
  highlightScore?: number | null;
}

const DEFAULT_BENCHMARKS: Record<GameMode, LeaderboardItem[]> = {
  NORMAL: [
    { playerName: 'ACE', score: 380, maxCombo: 10, caught: 28, mode: 'NORMAL' },
    { playerName: 'NEO', score: 290, maxCombo: 8, caught: 22, mode: 'NORMAL' },
    { playerName: 'CYBER', score: 210, maxCombo: 6, caught: 18, mode: 'NORMAL' },
  ],
  SURVIVAL: [
    { playerName: 'IMMORTAL', score: 920, maxCombo: 22, caught: 64, mode: 'SURVIVAL' },
    { playerName: 'SHADOW', score: 680, maxCombo: 15, caught: 48, mode: 'SURVIVAL' },
    { playerName: 'VALKYRIE', score: 450, maxCombo: 11, caught: 32, mode: 'SURVIVAL' },
  ],
  TIME_ATTACK: [
    { playerName: 'BOLT', score: 540, maxCombo: 18, caught: 42, mode: 'TIME_ATTACK' },
    { playerName: 'FLASH', score: 410, maxCombo: 14, caught: 33, mode: 'TIME_ATTACK' },
    { playerName: 'SONIC', score: 310, maxCombo: 9, caught: 24, mode: 'TIME_ATTACK' },
  ],
  ZEN: [
    { playerName: 'LOTUS', score: 480, maxCombo: 32, caught: 50, mode: 'ZEN' },
    { playerName: 'AURA', score: 360, maxCombo: 24, caught: 38, mode: 'ZEN' },
    { playerName: 'HARMONY', score: 240, maxCombo: 16, caught: 26, mode: 'ZEN' },
  ],
  CHAOS: [
    { playerName: 'VORTEX', score: 1420, maxCombo: 28, caught: 78, mode: 'CHAOS' },
    { playerName: 'CYCLONE', score: 980, maxCombo: 20, caught: 56, mode: 'CHAOS' },
    { playerName: 'HAVOC', score: 640, maxCombo: 14, caught: 39, mode: 'CHAOS' },
  ],
  TWO_HANDS: [
    { playerName: 'AMBIDEX', score: 860, maxCombo: 19, caught: 58, mode: 'TWO_HANDS' },
    { playerName: 'DUALIST', score: 620, maxCombo: 14, caught: 42, mode: 'TWO_HANDS' },
    { playerName: 'TWIN', score: 410, maxCombo: 9, caught: 28, mode: 'TWO_HANDS' },
  ],
  NIGHTMARE: [
    { playerName: 'APEX', score: 1840, maxCombo: 34, caught: 92, mode: 'NIGHTMARE' },
    { playerName: 'VIPER', score: 1250, maxCombo: 24, caught: 68, mode: 'NIGHTMARE' },
    { playerName: 'PHANTOM', score: 890, maxCombo: 18, caught: 46, mode: 'NIGHTMARE' },
  ],
  TRAINING: [
    { playerName: 'STUDENT', score: 250, maxCombo: 10, caught: 20, mode: 'TRAINING' },
  ],
  TUTORIAL: [
    { playerName: 'RECRUIT', score: 120, maxCombo: 5, caught: 8, mode: 'TUTORIAL' },
  ],
  ENDLESS: [
    { playerName: 'TITAN', score: 740, maxCombo: 16, caught: 52, mode: 'ENDLESS' },
    { playerName: 'GHOST', score: 520, maxCombo: 12, caught: 38, mode: 'ENDLESS' },
    { playerName: 'VALKYRIE', score: 360, maxCombo: 9, caught: 27, mode: 'ENDLESS' },
  ],
  PRECISION: [
    { playerName: 'DEADEYE', score: 1240, maxCombo: 26, caught: 48, mode: 'PRECISION' },
    { playerName: 'BULLSEYE', score: 910, maxCombo: 20, caught: 36, mode: 'PRECISION' },
    { playerName: 'SURGEON', score: 650, maxCombo: 14, caught: 28, mode: 'PRECISION' },
  ],
  DAILY_CHALLENGE: [
    { playerName: 'TOP_CHALLENGER', score: 1450, maxCombo: 28, caught: 58, mode: 'DAILY_CHALLENGE' },
    { playerName: 'DAILY_RUNNER', score: 1080, maxCombo: 22, caught: 44, mode: 'DAILY_CHALLENGE' },
    { playerName: 'DAY_ONE', score: 720, maxCombo: 15, caught: 32, mode: 'DAILY_CHALLENGE' },
  ],
  BOSS_RUSH: [
    { playerName: 'SLAYER', score: 2450, maxCombo: 36, caught: 85, mode: 'BOSS_RUSH' },
    { playerName: 'WARLORD', score: 1820, maxCombo: 28, caught: 66, mode: 'BOSS_RUSH' },
    { playerName: 'GLADIATOR', score: 1290, maxCombo: 20, caught: 48, mode: 'BOSS_RUSH' },
  ]
};

export const Leaderboard: React.FC<LeaderboardProps> = ({ mode, highlightScore }) => {
  const [scores, setScores] = useState<LeaderboardItem[]>([]);
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [confirmingClear, setConfirmingClear] = useState<boolean>(false);

  const fetchScores = async () => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    try {
      const res = await fetch(`${apiUrl}/api/leaderboard?mode=${mode}&limit=5`, {
        signal: AbortSignal.timeout(3000)
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      setScores(data);
      setIsOffline(false);
      // Cache locally for offline resilience
      try {
        localStorage.setItem(`handCatch.leaderboard.${mode}`, JSON.stringify(data));
      } catch (_) {}
    } catch (_) {
      // Offline fallback: try localStorage, or default benchmarks
      setIsOffline(true);
      try {
        const cached = localStorage.getItem(`handCatch.leaderboard.${mode}`);
        if (cached) {
          setScores(JSON.parse(cached));
          return;
        }
      } catch (_) {}
      setScores(DEFAULT_BENCHMARKS[mode]);
    }
  };

  useEffect(() => {
    fetchScores();
  }, [mode]);

  const handleClear = async () => {
    if (confirmingClear) {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      try {
        await fetch(`${apiUrl}/api/leaderboard?mode=${mode}`, { method: 'DELETE' });
      } catch (_) {}
      try {
        localStorage.removeItem(`handCatch.leaderboard.${mode}`);
      } catch (_) {}
      setScores([]);
      setConfirmingClear(false);
    } else {
      setConfirmingClear(true);
      setTimeout(() => setConfirmingClear(false), 3000);
    }
  };

  return (
    <div className="leaderboard-card">
      <div className="leaderboard-header">
        <div className="section-label" style={{ marginBottom: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
            <path d="M4 22h16" />
            <path d="M10 14.66V17c0 .55-.45 1-1 1H7.5c-.55 0-1-.45-1-1v-2.34" />
            <path d="M18 14.66V17c0 .55-.45 1-1 1h-1.5c-.55 0-1-.45-1-1v-2.34" />
            <path d="M18 2H6v7a6 6 0 0 0 12 0V2z" />
          </svg>
          Top Pilots {isOffline && <span className="offline-badge">(Local Cache)</span>}
        </div>
        <button
          type="button"
          className={`btn-danger-text ${confirmingClear ? 'confirming' : ''}`}
          onClick={handleClear}
        >
          {confirmingClear ? 'CONFIRM CLEAR?' : 'CLEAR LEADERBOARD'}
        </button>
      </div>

      <ul className="leaderboard-list">
        {scores.length === 0 ? (
          <li className="leaderboard-empty">No records yet. Catch columns to set a score!</li>
        ) : (
          scores.map((entry, idx) => {
            const isHighlighted = highlightScore !== null && entry.score === highlightScore;
            return (
              <li
                key={`${entry.playerName}-${entry.score}-${idx}`}
                className={`leaderboard-row ${isHighlighted ? 'highlight-row' : ''}`}
              >
                <span className="col-rank">#{idx + 1}</span>
                <span className="col-name">{entry.playerName}</span>
                <span className="col-combo">x{entry.maxCombo}</span>
                <span className="col-score">{entry.score.toString().padStart(4, '0')}</span>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
};
