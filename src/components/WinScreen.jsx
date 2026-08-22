import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { playFullTrack, stopPlayback } from '../spotify/playback';
import { getCoverUrl } from '../utils/getCoverUrl';

export default function WinScreen({ track, guessedSeconds, onNext, onBackToPlaylists }) {
  useEffect(() => {
    // Play the full track reveal/celebration audio
    if (track?.uri) {
      playFullTrack(track.uri);
    }

    // Trigger celebratory confetti burst
    const end = Date.now() + 1500;
    const colors = ['#1ed760', '#ffffff', '#22e570', '#88ffbb'];

    (function frame() {
      confetti({
        particleCount: 4,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.7 },
        colors: colors,
      });
      confetti({
        particleCount: 4,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.7 },
        colors: colors,
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    })();

    return () => {
      stopPlayback();
    };
  }, [track]);

  const coverUrl = getCoverUrl(track);
  const artistsText = track?.artists?.map(a => a.name).join(', ') || '';
  const albumName = track?.album?.name || '';
  const subtitle = [artistsText, albumName].filter(Boolean).join(' • ');

  return (
    <div className="result-screen win-screen">
      <header className="brand-header">
        <button className="btn-back" onClick={onBackToPlaylists}>
          ← <span className="brand-logo">Songuess</span>
        </button>
      </header>

      <main className="result-content">
        <div className="result-card">
          <div className="album-art-wrapper win-glow">
            <img src={coverUrl} alt={track?.name} className="album-cover" />
          </div>

          <h1 className="song-title">{track?.name}</h1>
          <p className="song-subtitle">{subtitle}</p>

          <div className="badge-guessed-pill">
            GUESSED IN {guessedSeconds}S!
          </div>

          <button
            className="btn-next-song"
            onClick={() => {
              stopPlayback();
              onNext();
            }}
          >
            <span>Next Song</span>
            <span>▶</span>
          </button>
        </div>
      </main>
    </div>
  );
}
