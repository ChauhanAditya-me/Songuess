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

    // Trigger a single celebratory confetti pop
    confetti({
      particleCount: 50,
      spread: 65,
      origin: { y: 0.65 },
      colors: ['#1ed760', '#ffffff', '#22e570', '#88ffbb'],
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
