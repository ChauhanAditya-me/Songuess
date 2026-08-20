import React from 'react';
import { SNIPPET_DURATIONS } from '../game/stages';

export default function SegmentedProgressBar({ currentStage, isPlaying, duration }) {
  // Relative visual weights for the 5 stages: [0.1s, 0.5s, 1s, 5s, 15s]
  const weights = [1, 1.5, 2, 3, 5];
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  return (
    <div className="segmented-progress-container">
      <div className="segmented-progress-track">
        {SNIPPET_DURATIONS.map((sec, index) => {
          const isUnlocked = index <= currentStage;
          const isCurrent = index === currentStage;
          const flexBasis = `${(weights[index] / totalWeight) * 100}%`;

          return (
            <div
              key={index}
              className={`progress-segment ${isUnlocked ? 'unlocked' : 'locked'} ${
                isCurrent && isPlaying ? 'active-playing' : ''
              }`}
              style={{ flex: weights[index] }}
              title={`Snippet ${sec}s`}
            >
              {isUnlocked && <div className="progress-segment-fill" />}
              {isCurrent && isPlaying && <div className="progress-segment-pulse" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
