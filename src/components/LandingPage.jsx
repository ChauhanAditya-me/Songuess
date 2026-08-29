import React from 'react';
import { SpotifyIcon } from './Icons';

export default function LandingPage({ onConnect, onPlay, onPlayGuest, isLoggedIn, error, profileName }) {
  return (
    <div className="landing-screen">
      <header className="brand-header">
        <span className="brand-logo">Songuess</span>
      </header>

      <main className="landing-content">
        {/* Decorative floating notes */}
        <div className="landing-floating-notes" aria-hidden="true">
          <span className="floating-note note-1">♪</span>
          <span className="floating-note note-2">♫</span>
          <span className="floating-note note-3">♬</span>
        </div>

        <h1 className="landing-title">Songuess</h1>
        <p className="landing-subtitle">
          {isLoggedIn
            ? `Welcome back, ${profileName || 'music lover'}!`
            : 'Can you guess your favourite songs?'}
        </p>

        {error && (
          <div className="auth-error-notice" style={{ color: '#ff6b6b', fontSize: '0.9rem', marginBottom: '16px', textAlign: 'center', maxWidth: '320px', background: 'rgba(255, 75, 75, 0.1)', padding: '8px 14px', borderRadius: '8px', border: '1px solid rgba(255, 75, 75, 0.25)' }}>
            {error.includes('expired') || error.includes('401') || error.includes('not connected')
              ? 'Your Spotify session has expired. Please reconnect to continue.'
              : error}
          </div>
        )}

        <div className="landing-actions">
          {isLoggedIn ? (
            <>
              <button className="btn-play-main" onClick={onPlay}>
                <span className="btn-play-icon">▶</span>
                <span>Play</span>
              </button>

              <button className="btn-guest" onClick={onPlayGuest} title="Play any playlist as guest">
                <span>Play Custom Playlist</span>
              </button>
            </>
          ) : (
            <>
              <button className="btn-spotify-connect" onClick={onConnect}>
                <SpotifyIcon size={24} color="#000000" />
                <span>Connect with Spotify</span>
              </button>

              <button className="btn-guest" onClick={onPlayGuest} title="Play as guest without login">
                <span>Play as Guest</span>
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
