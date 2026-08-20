import React, { useState } from 'react';
import SegmentedProgressBar from './SegmentedProgressBar';
import { PlayIcon, PauseIcon, SkipIcon, SearchIcon } from './Icons';
import SongSearch from './SongSearch';

export default function MainGame({
  game,
  tracks,
  playlistName,
  onBackToPlaylists,
  serverReady,
}) {
  const isPlaying = game.status === 'playing';
  const isLoading = game.status === 'loading';

  const handlePlayToggle = () => {
    if (!game.gameTrack) {
      game.start();
    } else if (isPlaying) {
      game.stop();
    } else {
      game.replay();
    }
  };

  return (
    <div className="game-screen">
      <header className="brand-header">
        <button className="btn-back" onClick={onBackToPlaylists} title="Back to Home">
          ← <span className="brand-logo">Songuess</span>
        </button>
        <div className="game-header-right">
          {game.streak > 0 && (
            <div className="streak-badge" key={game.streak}>
              <span className="streak-fire">🔥</span>
              <span className="streak-count">{game.streak}</span>
            </div>
          )}
          {playlistName && <span className="playlist-badge">{playlistName}</span>}
        </div>
      </header>

      <main className="game-content">
        <div className="game-card">
          {/* Top Segmented Progress Bar */}
          <SegmentedProgressBar
            currentStage={game.stage}
            isPlaying={isPlaying}
            duration={game.snippetSeconds}
          />

          {/* Center Circular Play/Pause/Replay Button */}
          <div className="play-circle-wrapper">
            <button
              className={`btn-play-circle ${isPlaying ? 'playing' : ''} ${isLoading ? 'loading' : ''}`}
              onClick={handlePlayToggle}
              title={isPlaying ? 'Pause snippet' : 'Play snippet'}
            >
              {isLoading ? (
                <div className="spinner-ring" />
              ) : isPlaying ? (
                <PauseIcon size={36} color="#000000" />
              ) : (
                <PlayIcon size={36} color="#000000" />
              )}
            </button>

            {/* Snippet Duration Tag */}
            <span className="duration-tag">{game.snippetSeconds}s</span>
          </div>

          {/* Bottom Controls: Search & Skip */}
          <div className="game-controls-row">
            <div className="search-input-wrapper">
              <SongSearch
                tracks={tracks}
                value={game.guess}
                onChange={game.setGuess}
                onSelect={track => {
                  game.submitGuess(track.name);
                }}
              />
            </div>

            <button className="btn-skip" onClick={game.skip} title="Skip to next snippet">
              <SkipIcon size={16} />
              <span>Skip</span>
            </button>
          </div>

          {/* Feedback error or hint */}
          {game.result === 'wrong' && (
            <p className="wrong-feedback-toast">❌ Wrong answer. Try again or skip!</p>
          )}

          {game.error && (
            <p className="game-error-toast">{game.error}</p>
          )}
        </div>
      </main>
    </div>
  );
}
