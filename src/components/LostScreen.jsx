import React, { useEffect } from 'react';
import { playFullTrack, stopPlayback } from '../spotify/playback';
import { getCoverUrl } from '../utils/getCoverUrl';

export default function LostScreen({ track, onNext, onBackToPlaylists }) {
  useEffect(() => {
    // Play full track reveal audio
    if (track?.uri) {
      playFullTrack(track.uri);
    }

    return () => {
      stopPlayback();
    };
  }, [track]);

  const coverUrl = getCoverUrl(track);
  const artistsText = track?.artists?.map(a => a.name).join(', ') || '';
  const albumName = track?.album?.name || '';
  const subtitle = [artistsText, albumName].filter(Boolean).join(' • ');

  return (
    <div className="result-screen lost-screen">
      <header className="brand-header">
        <button className="btn-back" onClick={onBackToPlaylists}>
          ← <span className="brand-logo">Songuess</span>
        </button>
      </header>

      <main className="result-content">
        <div className="result-card lost-card">
          <div className="album-art-wrapper lost-glow">
            <img src={coverUrl} alt={track?.name} className="album-cover" />
          </div>

          <span className="label-it-was">IT WAS...</span>
          <h1 className="song-title">{track?.name}</h1>
          <p className="song-subtitle">{subtitle}</p>

          <div className="badge-lost-stamp">
            LOST!
          </div>

          <button
            className="btn-next-song btn-lost-next"
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
