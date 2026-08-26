import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { playFullTrack, stopFullTrackPlayback } from '../spotify/playback';
import { getCoverUrl } from '../utils/getCoverUrl';

export default function WinScreen({ track, guessedSeconds, onNext, onBackToPlaylists }) {
  useEffect(() => {
    // Play the full track reveal/celebration audio
    if (track?.uri) {
      playFullTrack(track.uri);
    }

    // Natural randomized celebratory edge confetti burst
    const colors = ['#1ed760', '#ffffff', '#22e570', '#88ffbb', '#10b981', '#6ee7b7'];
    const randomInRange = (min, max) => Math.random() * (max - min) + min;

    // Left side pop
    confetti({
      particleCount: Math.floor(randomInRange(35, 100)),
      angle: randomInRange(50, 75),
      spread: randomInRange(35, 65),
      startVelocity: randomInRange(40, 58),
      origin: { x: randomInRange(0.02, 0.12), y: randomInRange(0.68, 0.76) },
      colors,
      ticks: 220,
      gravity: 1.05,
      decay: 0.92,
      scalar: randomInRange(0.85, 1.15),
      drift: randomInRange(-0.4, 0.6),
    });

    // Right side pop
    confetti({
      particleCount: Math.floor(randomInRange(35, 50)),
      angle: randomInRange(105, 130),
      spread: randomInRange(65, 95),
      startVelocity: randomInRange(40, 58),
      origin: { x: randomInRange(0.88, 0.98), y: randomInRange(0.68, 0.76) },
      colors,
      ticks: 220,
      gravity: 1.05,
      decay: 0.92,
      scalar: randomInRange(0.85, 1.15),
      drift: randomInRange(-0.6, 0.4),
    });

    return () => {
      stopFullTrackPlayback();
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
              stopFullTrackPlayback();
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
