import React, { useEffect, useState } from 'react';
import { SearchIcon, PlayIcon } from './Icons';

const CURATED_PLAYLISTS = [
  {
    id: '37i9dQZF1DXcBWIGoYBM5M',
    url: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
    name: "Today's Top Hits",
    description: 'The biggest hits right now across the globe',
    icon: '🔥',
    gradient: 'linear-gradient(135deg, #ff0844 0%, #ffb199 100%)',
  },
  {
    id: '37i9dQZF1DX5Ejj0EkURtP',
    url: 'https://open.spotify.com/playlist/37i9dQZF1DX5Ejj0EkURtP',
    name: 'All Out 2010s',
    description: 'The defining pop and rock tracks of the 2010s',
    icon: '✨',
    gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  },
  {
    id: '37i9dQZF1DWXRqgorJj26U',
    url: 'https://open.spotify.com/playlist/37i9dQZF1DWXRqgorJj26U',
    name: 'Rock Classics',
    description: 'Timeless guitar anthems & legend tracks',
    icon: '🎸',
    gradient: 'linear-gradient(135deg, #f12711 0%, #f5af19 100%)',
  },
  {
    id: '37i9dQZF1DWUa8ZRTfalHk',
    url: 'https://open.spotify.com/playlist/37i9dQZF1DWUa8ZRTfalHk',
    name: 'Pop Rising',
    description: 'Who is next in pop music today',
    icon: '🌟',
    gradient: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
  },
  {
    id: '37i9dQZF1DXbYM3nMM0oPk',
    url: 'https://open.spotify.com/playlist/37i9dQZF1DXbYM3nMM0oPk',
    name: 'Mega Hit Mix',
    description: 'A non-stop mix of top chart-topping tunes',
    icon: '⚡',
    gradient: 'linear-gradient(135deg, #8a2387 0%, #e94057 50%, #f27121 100%)',
  },
  {
    id: '37i9dQZEVXbMDoHDwVN2tF',
    url: 'https://open.spotify.com/playlist/37i9dQZEVXbMDoHDwVN2tF',
    name: 'Top 50 - Global',
    description: 'Your daily update of the most played tracks',
    icon: '🌍',
    gradient: 'linear-gradient(135deg, #1ed760 0%, #0d7334 100%)',
  },
];

export default function GuestModal({ onClose, onLoadPlaylist }) {
  const [playlistInput, setPlaylistInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingId, setLoadingId] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && !loading) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, loading]);

  async function handleLoad(urlOrId, pickedId = null) {
    const target = urlOrId?.trim();
    if (!target) {
      setError('Please paste a Spotify playlist link or ID.');
      return;
    }

    setLoading(true);
    setLoadingId(pickedId);
    setError(null);

    try {
      await onLoadPlaylist(target);
    } catch (err) {
      setError(err.message || 'Could not load playlist. Make sure the link is public.');
      setLoading(false);
      setLoadingId(null);
    }
  }

  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setPlaylistInput(text);
        setError(null);
      }
    } catch {
      // Clipboard permissions unavailable
    }
  }

  return (
    <div className="guest-modal-backdrop" onClick={e => e.target === e.currentTarget && !loading && onClose()}>
      <div className="guest-modal-card">
        <header className="guest-modal-header">
          <div>
            <span className="guest-badge-pill">Guest Mode</span>
            <h2 className="guest-modal-title">Play with any Playlist</h2>
            <p className="guest-modal-subtitle">Paste any public Spotify link or pick from top charts below</p>
          </div>
          <button className="btn-modal-close" onClick={onClose} disabled={loading} title="Close">
            ✕
          </button>
        </header>

        {/* Input Bar */}
        <form
          className="guest-input-form"
          onSubmit={e => {
            e.preventDefault();
            handleLoad(playlistInput);
          }}
        >
          <div className="guest-input-wrapper">
            <SearchIcon size={18} color="#777" className="guest-input-icon" />
            <input
              type="text"
              className="guest-url-input"
              value={playlistInput}
              onChange={e => {
                setPlaylistInput(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Paste Spotify playlist link or URI..."
              disabled={loading}
              autoFocus
              spellCheck="false"
            />
            {navigator.clipboard && !playlistInput && (
              <button
                type="button"
                className="btn-paste-clipboard"
                onClick={handlePaste}
                title="Paste from clipboard"
              >
                Paste
              </button>
            )}
          </div>

          <button
            type="submit"
            className="btn-guest-submit"
            disabled={loading || !playlistInput.trim()}
          >
            {loading && !loadingId ? (
              <div className="spinner-ring-small" />
            ) : (
              <>
                <span>Load & Play</span>
                <PlayIcon size={16} color="#000" />
              </>
            )}
          </button>
        </form>

        {/* Inline Error Notice */}
        {error && (
          <div className="guest-error-box">
            <span>⚠️ {error}</span>
          </div>
        )}

        {/* Curated Quick-Picks Divider */}
        <div className="guest-divider">
          <span>Or Choose a Quick-Pick Playlist</span>
        </div>

        {/* Curated Grid */}
        <div className="guest-quick-grid">
          {CURATED_PLAYLISTS.map(pl => {
            const isThisLoading = loading && loadingId === pl.id;

            return (
              <button
                key={pl.id}
                type="button"
                className={`guest-quick-card ${isThisLoading ? 'loading' : ''}`}
                onClick={() => handleLoad(pl.url, pl.id)}
                disabled={loading}
              >
                <div
                  className="guest-card-cover-wrapper"
                  style={{ background: pl.gradient }}
                >
                  <span className="guest-card-icon">{pl.icon}</span>
                  <div className="guest-card-play-overlay">
                    {isThisLoading ? (
                      <div className="spinner-ring-small" />
                    ) : (
                      <PlayIcon size={20} color="#000000" />
                    )}
                  </div>
                </div>

                <div className="guest-card-info">
                  <strong className="guest-card-name">{pl.name}</strong>
                  <span className="guest-card-desc">{pl.description}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
