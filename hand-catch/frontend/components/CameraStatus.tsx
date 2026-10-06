'use client';

import React from 'react';
import { TrackingStatus } from '../vision/HandTypes';

interface CameraStatusProps {
  status: TrackingStatus;
  handsCount: number;
}

export const CameraStatus: React.FC<CameraStatusProps> = ({ status, handsCount }) => {
  let label = 'System Ready';
  let dotClass = 'amber';

  switch (status) {
    case 'REQUESTING_CAMERA':
      label = 'Requesting Camera Permission…';
      dotClass = 'amber';
      break;
    case 'CAMERA_READY':
      label = 'Camera Ready';
      dotClass = 'amber';
      break;
    case 'INIT_TRACKING':
      label = 'Hand Tracking Initializing…';
      dotClass = 'amber';
      break;
    case 'ACTIVE':
      label = `Hand Tracking: ACTIVE (${handsCount} hand${handsCount === 1 ? '' : 's'})`;
      dotClass = 'green';
      break;
    case 'NO_HANDS':
      label = 'No Hand Detected';
      dotClass = 'red';
      break;
    case 'ERROR':
      label = 'Tracking Error';
      dotClass = 'red';
      break;
  }

  return (
    <div className="status-pill-container" role="status" aria-live="polite">
      <div className="status-pill">
        <span className={`status-dot ${dotClass}`} />
        <span className="status-text">{label}</span>
      </div>
    </div>
  );
};
