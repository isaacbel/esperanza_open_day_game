'use client';

import React from 'react';
import { GameMode } from '../vision/HandTypes';

interface ModeSelectorProps {
  mode: GameMode;
  onChange: (mode: GameMode) => void;
}

const MODES: { id: GameMode; label: string; icon: string; sub: string; badge?: string }[] = [
  { id: 'NORMAL', label: 'CLASSIC', icon: '⏱️', sub: '60s Time Attack' },
  { id: 'SURVIVAL', label: 'SURVIVAL', icon: '🛡️', sub: 'Endless Speed Surge' },
  { id: 'TIME_ATTACK', label: 'SPRINT', icon: '⚡', sub: '30s Frantic Blitz' },
  { id: 'ZEN', label: 'ZEN', icon: '🧘', sub: 'Infinite Flow & Focus' },
  { id: 'CHAOS', label: 'CHAOS', icon: '🌀', sub: 'Multi-Trajectory Storm' },
  { id: 'TWO_HANDS', label: 'TWO HANDS', icon: '👐', sub: 'Split Dual Challenges' },
  { id: 'NIGHTMARE', label: 'NIGHTMARE', icon: '🔥', sub: 'Maximum Overdrive', badge: 'HARDCORE' },
  { id: 'TUTORIAL', label: 'TUTORIAL', icon: '🎓', sub: '3-Step Interaction' }
];

export const ModeSelector: React.FC<ModeSelectorProps> = ({ mode, onChange }) => {
  return (
    <div className="mode-grid-container" role="radiogroup" aria-label="Game Mode">
      {MODES.map((m) => {
        const isSelected = mode === m.id;
        const isNightmare = m.id === 'NIGHTMARE';
        return (
          <button
            key={m.id}
            type="button"
            className={`mode-card ${isSelected ? 'selected' : ''} ${isNightmare ? 'nightmare-card' : ''}`}
            onClick={() => onChange(m.id)}
            role="radio"
            aria-checked={isSelected}
          >
            {m.badge && <span className="mode-badge">{m.badge}</span>}
            <div className="mode-card-header">
              <span className="mode-icon">{m.icon}</span>
              <span className="mode-title">{m.label}</span>
            </div>
            <span className="mode-sub">{m.sub}</span>
          </button>
        );
      })}
    </div>
  );
};
