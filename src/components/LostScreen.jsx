import React from 'react';

export default function LostScreen({ track, onNext, onBackToPlaylists }) {
  const coverUrl =
    track?.album?.images?.[0]?.url ||
    track?.album?.images?.[1]?.url ||
    'https://placehold.co/300x300/181818/ffffff?text=🎵';

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

          <button className="btn-next-song btn-lost-next" onClick={onNext}>
            <span>Next Song</span>
            <span>▶</span>
          </button>
        </div>
      </main>
    </div>
  );
}
