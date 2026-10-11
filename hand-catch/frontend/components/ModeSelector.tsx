'use client';

import React from 'react';
import { GameMode } from '../vision/HandTypes';

interface ModeSelectorProps {
  mode: GameMode;
  onChange: (mode: GameMode) => void;
}

const MODES: {
  id: GameMode;
  label: string;
  icon: string;
  sub: string;
  desc: string;
  difficulty: number; // 1–5
  badge?: string;
  accentColor?: string;
}[] = [
  {
    id: 'NORMAL',
    label: 'CLASSIC',
    icon: '⏱️',
    sub: '60s Time Attack',
    desc: 'Score as high as possible in 60 seconds. Difficulty ramps as you improve.',
    difficulty: 2,
    accentColor: 'var(--cyan)'
  },
  {
    id: 'SURVIVAL',
    label: 'SURVIVAL',
    icon: '🛡️',
    sub: 'Endless Speed Surge',
    desc: 'No timer — survive until you run out of lives. Speed climbs relentlessly.',
    difficulty: 3,
    accentColor: '#00ff99'
  },
  {
    id: 'ENDLESS',
    label: 'ENDLESS',
    icon: '♾️',
    sub: 'Unlimited Lives Run',
    desc: 'Infinite lives — focus on setting the highest score with no pressure.',
    difficulty: 2,
    accentColor: '#a78bfa'
  },
  {
    id: 'TIME_ATTACK',
    label: 'SPRINT',
    icon: '⚡',
    sub: '30s Frantic Blitz',
    desc: 'Only 30 seconds, maximum objects. Can you beat your personal best?',
    difficulty: 3,
    accentColor: '#facc15'
  },
  {
    id: 'ZEN',
    label: 'ZEN',
    icon: '🧘',
    sub: 'Infinite Flow & Focus',
    desc: 'Slow, peaceful falling. No lives lost. Perfect for warming up or relaxing.',
    difficulty: 1,
    accentColor: '#34d399'
  },
  {
    id: 'CHAOS',
    label: 'CHAOS',
    icon: '🌀',
    sub: 'Multi-Trajectory Storm',
    desc: 'Objects fly in from all directions at extreme speed. Barely survivable.',
    difficulty: 5,
    accentColor: '#c084fc'
  },
  {
    id: 'TWO_HANDS',
    label: 'TWO HANDS',
    icon: '👐',
    sub: 'Split Dual Challenges',
    desc: 'Every pattern requires BOTH hands simultaneously. Train your coordination.',
    difficulty: 3,
    accentColor: '#fb923c'
  },
  {
    id: 'PRECISION',
    label: 'PRECISION',
    icon: '🎯',
    sub: 'Center Palm Accuracy',
    desc: 'Score multipliers graded by palm center alignment (PERFECT/GREAT/GOOD/GRAZE).',
    difficulty: 4,
    badge: 'SKILL',
    accentColor: '#38bdf8'
  },
  {
    id: 'DAILY_CHALLENGE',
    label: 'DAILY SEED',
    icon: '📅',
    sub: 'Global Daily Gauntlet',
    desc: 'Deterministic daily seed: compete against all players globally on the exact same pattern.',
    difficulty: 3,
    badge: 'DAILY',
    accentColor: '#fbbf24'
  },
  {
    id: 'BOSS_RUSH',
    label: 'BOSS RUSH',
    icon: '⚔️',
    sub: '5-Wave Apex Gauntlet',
    desc: 'Sequential boss waves: Swarm, Crossfire, Warp, Hazard Trial & Climax.',
    difficulty: 5,
    badge: 'BOSS',
    accentColor: '#f43f5e'
  },
  {
    id: 'NIGHTMARE',
    label: 'NIGHTMARE',
    icon: '🔥',
    sub: 'Maximum Overdrive',
    desc: 'Level 8 from the start. Insane speed, density and pattern complexity.',
    difficulty: 5,
    badge: 'HARDCORE',
    accentColor: '#ff2a5f'
  },
  {
    id: 'TUTORIAL',
    label: 'TUTORIAL',
    icon: '🎓',
    sub: '8-Step Guided Mastery',
    desc: 'Master the full vision pipeline: catches, dual hands, deflections, time freeze & bursts.',
    difficulty: 1,
    accentColor: '#60a5fa'
  }
];

function DifficultyPips({ level, color }: { level: number; color: string }) {
  return (
    <div className="mode-difficulty" aria-label={`Difficulty: ${level} out of 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className="mode-pip"
          style={{ background: i < level ? color : 'rgba(255,255,255,0.12)' }}
        />
      ))}
    </div>
  );
}

export const ModeSelector: React.FC<ModeSelectorProps> = ({ mode, onChange }) => {
  const [hovered, setHovered] = React.useState<GameMode | null>(null);

  return (
    <div className="mode-grid-container" role="radiogroup" aria-label="Game Mode">
      {MODES.map((m) => {
        const isSelected = mode === m.id;
        const isNightmare = m.id === 'NIGHTMARE';
        const accent = m.accentColor ?? 'var(--cyan)';

        return (
          <button
            key={m.id}
            type="button"
            id={`mode-btn-${m.id.toLowerCase()}`}
            className={`mode-card ${isSelected ? 'selected' : ''} ${isNightmare ? 'nightmare-card' : ''}`}
            style={isSelected ? { '--mode-accent': accent } as React.CSSProperties : undefined}
            onClick={() => onChange(m.id)}
            onMouseEnter={() => setHovered(m.id)}
            onMouseLeave={() => setHovered(null)}
            role="radio"
            aria-checked={isSelected}
          >
            {m.badge && <span className="mode-badge">{m.badge}</span>}
            <div className="mode-card-header">
              <span className="mode-icon">{m.icon}</span>
              <span className="mode-title">{m.label}</span>
            </div>
            <span className="mode-sub">{m.sub}</span>
            {(isSelected || hovered === m.id) && (
              <span className="mode-desc">{m.desc}</span>
            )}
            <DifficultyPips level={m.difficulty} color={accent} />
          </button>
        );
      })}
    </div>
  );
};
