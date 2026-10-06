'use client';

import React from 'react';
import { requestFullscreen } from '../utils/device';

interface SettingsPanelProps {
  isMuted: boolean;
  onToggleMute: () => void;
  debugMode: boolean;
  onToggleDebug: () => void;
  reduceMotion: boolean;
  onToggleReduceMotion: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  isMuted,
  onToggleMute,
  debugMode,
  onToggleDebug,
  reduceMotion,
  onToggleReduceMotion,
}) => {
  return (
    <div className="controls-bar">
      <button
        type="button"
        className={`btn-tool ${isMuted ? 'muted' : ''}`}
        onClick={onToggleMute}
        aria-label={isMuted ? 'Unmute Audio' : 'Mute Audio'}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          {!isMuted ? (
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
          ) : (
            <line x1="23" y1="9" x2="17" y2="15" />
          )}
        </svg>
        {isMuted ? 'Sound: OFF' : 'Sound: ON'}
      </button>

      <button
        type="button"
        className={`btn-tool ${debugMode ? 'active' : ''}`}
        onClick={onToggleDebug}
        aria-label="Toggle Debug Mode"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2a4 4 0 0 0-4 4v2H6a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2v4a4 4 0 0 0 8 0v-4h2a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-2V6a4 4 0 0 0-4-4z" />
        </svg>
        Debug [D]
      </button>

      <button
        type="button"
        className={`btn-tool ${reduceMotion ? 'active' : ''}`}
        onClick={onToggleReduceMotion}
        aria-label="Toggle Reduced Motion"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M8 12h8" />
        </svg>
        Reduce Motion
      </button>

      <button
        type="button"
        className="btn-tool"
        onClick={() => requestFullscreen()}
        aria-label="Toggle Fullscreen"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
        </svg>
        Fullscreen
      </button>
    </div>
  );
};
