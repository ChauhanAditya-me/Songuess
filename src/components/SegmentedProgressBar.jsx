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
          const isUnlocked = index < currentStage;
          const isCurrent = index === currentStage;
          const isLocked = index > currentStage;

          let segmentClass = 'progress-segment';
          if (isUnlocked) segmentClass += ' unlocked';
          else if (isCurrent) segmentClass += ' current';
          else segmentClass += ' locked';
          if (isCurrent && isPlaying) segmentClass += ' active-playing';

          return (
            <div
              key={index}
              className={segmentClass}
              style={{ flex: weights[index] }}
              title={`Snippet ${sec}s`}
            >
              {/* Completed stages get a full fill */}
              {isUnlocked && <div className="progress-segment-fill" />}

              {/* Current stage gets an animated left-to-right fill when playing */}
              {isCurrent && isPlaying && (
                <div
                  className="progress-segment-active-fill"
                  style={{ animationDuration: `${sec}s` }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Duration labels */}
      <div className="segmented-progress-labels">
        {SNIPPET_DURATIONS.map((sec, index) => {
          const isCurrent = index === currentStage;
          return (
            <span
              key={index}
              className={`progress-label ${isCurrent ? 'label-current' : ''} ${index <= currentStage ? 'label-unlocked' : ''}`}
              style={{ flex: weights[index] }}
            >
              {sec}s
            </span>
          );
        })}
      </div>
    </div>
  );
}
