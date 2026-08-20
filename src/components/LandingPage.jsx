import React from 'react';
import { SpotifyIcon } from './Icons';

export default function LandingPage({ onConnect, error }) {
  return (
    <div className="landing-screen">
      <header className="brand-header">
        <span className="brand-logo">Songuess</span>
      </header>

      <main className="landing-content">
        <h1 className="landing-title">Songuess</h1>
        <p className="landing-subtitle">Can you guess your favourite songs?</p>

        {error && (
          <div className="auth-error-notice" style={{ color: '#ff6b6b', fontSize: '0.9rem', marginBottom: '16px', textAlign: 'center', maxWidth: '320px', background: 'rgba(255, 75, 75, 0.1)', padding: '8px 14px', borderRadius: '8px', border: '1px solid rgba(255, 75, 75, 0.25)' }}>
            {error.includes('expired') || error.includes('401') || error.includes('not connected')
              ? 'Your Spotify session has expired. Please reconnect to continue.'
              : error}
          </div>
        )}

        <button className="btn-spotify-connect" onClick={onConnect}>
          <SpotifyIcon size={24} color="#000000" />
          <span>Connect with spotify</span>
        </button>
      </main>
    </div>
  );
}

