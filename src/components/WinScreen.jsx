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

    // Realistic multi-tier celebratory confetti burst
    const colors = ['#15c853', '#00e732', '#b4ffc7', '#ffffff'];
    const count = 200;
    const defaults = {
      origin: { y: 0.7 },
      colors: colors,
    };

    function fire(particleRatio, opts) {
      confetti({
        ...defaults,
        ...opts,
        particleCount: Math.floor(count * particleRatio),
      });
    }

    fire(0.25, {
      spread: 26,
      startVelocity: 55,
    });
    fire(0.2, {
      spread: 60,
    });
    fire(0.35, {
      spread: 150,
      decay: 0.91,
      scalar: 0.8,
    });
    fire(0.1, {
      spread: 120,
      startVelocity: 25,
      decay: 0.92,
      scalar: 1.2,
    });
    fire(0.1, {
      spread: 120,
      startVelocity: 45,
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
