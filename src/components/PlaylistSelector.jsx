import React from 'react';
import { LogoutIcon } from './Icons';

export default function PlaylistSelector({ playlists, onSelectPlaylist, onOpenCustomModal, onLogout, onBack, profile }) {
  return (
    <div className="playlist-screen">
      <header className="brand-header">
        <button className="btn-back" onClick={onBack} title="Back to Home">
          ← <span className="brand-logo">Songuess</span>
        </button>
        {profile && (
          <div className="user-profile-badge">
            <span className="user-name">{profile.display_name}</span>
            <button className="btn-icon-logout" onClick={onLogout} title="Logout">
              <LogoutIcon size={16} />
            </button>
          </div>
        )}
      </header>

      <main className="playlist-content">
        <h1 className="playlist-heading">Choose your playlist</h1>

        <div className="playlist-list">
          {/* Custom Link / Guest Modal Trigger */}
          {onOpenCustomModal && (
            <button
              className="playlist-card playlist-card-custom"
              onClick={onOpenCustomModal}
              title="Paste any public Spotify link"
            >
              <div className="playlist-card-cover custom-cover-icon">
                <span>🔗</span>
              </div>
              <div className="playlist-card-meta">
                <span className="playlist-title">Paste Any Playlist Link</span>
                <span className="playlist-subtitle">Play any public Spotify playlist</span>
              </div>
            </button>
          )}
          {playlists.map(playlist => {
            const imageUrl =
              playlist.images?.[0]?.url ||
              (playlist.isLiked
                ? 'https://misc.scdn.co/liked-songs/liked-songs-640.png'
                : 'https://placehold.co/120x120/222222/ffffff?text=🎵');

            const ownerName = playlist.owner?.display_name || 'Spotify';

            return (
              <button
                key={playlist.id}
                className="playlist-card"
                onClick={() => onSelectPlaylist(playlist)}
              >
                <div className="playlist-card-cover">
                  <img src={imageUrl} alt={playlist.name} loading="lazy" />
                </div>
                <div className="playlist-card-meta">
                  <span className="playlist-title">{playlist.name}</span>
                  <span className="playlist-subtitle">Playlist • {ownerName}</span>
                </div>
              </button>
            );
          })}
        </div>

        {playlists.length === 0 && (
          <p className="loading-text">Loading your Spotify playlists...</p>
        )}
      </main>
    </div>
  );
}
