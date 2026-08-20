import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';

export default function WinScreen({ track, guessedSeconds, onNext, onBackToPlaylists }) {
  useEffect(() => {
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
  }, []);

  const coverUrl =
    track?.album?.images?.[0]?.url ||
    track?.album?.images?.[1]?.url ||
    'https://placehold.co/300x300/181818/ffffff?text=🎵';

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

          <button className="btn-next-song" onClick={onNext}>
            <span>Next Song</span>
            <span>▶</span>
          </button>
        </div>
      </main>
    </div>
  );
}
