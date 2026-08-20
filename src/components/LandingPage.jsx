import React from 'react';
import { SpotifyIcon } from './Icons';

export default function LandingPage({ onConnect }) {
  return (
    <div className="landing-screen">
      <header className="brand-header">
        <span className="brand-logo">Songuess</span>
      </header>

      <main className="landing-content">
        <h1 className="landing-title">Songuess</h1>
        <p className="landing-subtitle">Can you guess your favourite songs?</p>

        <button className="btn-spotify-connect" onClick={onConnect}>
          <SpotifyIcon size={24} color="#000000" />
          <span>Connect with spotify</span>
        </button>
      </main>
    </div>
  );
}
