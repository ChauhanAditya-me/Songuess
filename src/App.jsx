import React, { Component, useEffect, useRef, useState } from 'react';
import { beginSpotifyLogin, exchangeCode, logout } from './spotify/auth';
import { useSpotify } from './hooks/useSpotify';
import { useGame } from './hooks/useGame';
import LandingPage from './components/LandingPage';
import PlaylistSelector from './components/PlaylistSelector';
import GuestModal from './components/GuestModal';
import MainGame from './components/MainGame';
import WinScreen from './components/WinScreen';
import LostScreen from './components/LostScreen';
import './App.css';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[Songuess Crash]', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-container">
          <div className="loading-screen">
            <div className="loading-pulse-disc">⚠️</div>
            <h2>Something went wrong</h2>
            <p style={{ color: '#ff6b6b', marginTop: '10px', maxWidth: '360px', fontSize: '0.9rem' }}>
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <button
              className="btn-spotify-connect"
              style={{ marginTop: '20px' }}
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.replace('/');
              }}
            >
              Restart App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function Callback({ code }) {
  const started = useRef(false);
  const [status, setStatus] = useState('Connecting to Spotify...');

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    exchangeCode(code)
      .then(() => {
        window.location.replace('/');
      })
      .catch(e => setStatus(`Failed to connect: ${e.message}`));
  }, [code]);

  return (
    <div className="app-container">
      <div className="loading-screen">
        <div className="loading-pulse-disc">🎵</div>
        <p>{status}</p>
      </div>
    </div>
  );
}

function Home() {
  const [showHome, setShowHome] = useState(true);
  const [showGuestModal, setShowGuestModal] = useState(false);
  const spotify = useSpotify();
  const game = useGame(spotify.tracks);

  const { start } = game;

  // Auto-start round 1 when a playlist finishes loading
  useEffect(() => {
    if (
      spotify.selectedPlaylist &&
      spotify.tracks.length > 0 &&
      !game.gameTrack &&
      game.status === 'idle'
    ) {
      start();
    }
  }, [spotify.selectedPlaylist, spotify.tracks, game.gameTrack, game.status, start]);

  const handleBackToPlaylists = () => {
    game.reset();
    spotify.resetPlaylist();
  };

  const handleBackToHome = () => {
    game.reset();
    spotify.resetPlaylist();
    setShowHome(true);
    setShowGuestModal(false);
  };

  const handleLoadGuestPlaylist = async (urlOrId) => {
    await spotify.loadPublicPlaylist(urlOrId);
    setShowGuestModal(false);
    setShowHome(false);
  };

  const isLoggedIn = !spotify.loading && spotify.profile;
  const isLoggedOut = !spotify.loading && !spotify.profile;

  return (
    <div className="app-container">
      {/* 1. Initial Authentication & Profile Loading */}
      {spotify.loading && (
        <div className="loading-screen">
          <div className="loading-pulse-disc">🎵</div>
          <p className="loading-text">Connecting to Spotify...</p>
        </div>
      )}

      {/* 2. Landing Screen — logged-out */}
      {isLoggedOut && !spotify.selectedPlaylist && (
        <LandingPage
          onConnect={beginSpotifyLogin}
          onPlayGuest={() => setShowGuestModal(true)}
          isLoggedIn={false}
          error={spotify.error}
        />
      )}

      {/* 3. Landing Screen — logged-in */}
      {isLoggedIn && showHome && !spotify.selectedPlaylist && (
        <LandingPage
          onPlay={() => setShowHome(false)}
          onPlayGuest={() => setShowGuestModal(true)}
          isLoggedIn={true}
          profileName={spotify.profile.display_name}
          error={spotify.error}
        />
      )}

      {/* 4. Playlist Selector Screen (for logged in users) */}
      {isLoggedIn && !showHome && !spotify.selectedPlaylist && (
        <PlaylistSelector
          playlists={spotify.playlists}
          onSelectPlaylist={playlist => spotify.loadPlaylist(playlist)}
          onOpenCustomModal={() => setShowGuestModal(true)}
          onLogout={logout}
          onBack={() => setShowHome(true)}
          profile={spotify.profile}
        />
      )}

      {/* 5. Guest Modal (for pasting links or picking curated charts) */}
      {showGuestModal && (
        <GuestModal
          onClose={() => setShowGuestModal(false)}
          onLoadPlaylist={handleLoadGuestPlaylist}
        />
      )}

      {/* 6. Loading Playlist Tracks State */}
      {!spotify.loading && spotify.selectedPlaylist && spotify.loadingTracks && (
        <div className="loading-screen">
          <div className="loading-pulse-disc">🎵</div>
          <p className="loading-text">Loading {spotify.selectedPlaylist.name}...</p>
        </div>
      )}

      {/* 7. Playlist Load Error State */}
      {!spotify.loading && spotify.selectedPlaylist && !spotify.loadingTracks && spotify.tracks.length === 0 && (
        <div className="loading-screen">
          <div className="loading-pulse-disc">⚠️</div>
          <h2 style={{ marginTop: '16px', fontSize: '1.4rem' }}>Unable to load playlist</h2>
          <p style={{ color: '#ff6b6b', marginTop: '8px', maxWidth: '400px', textAlign: 'center' }}>
            {spotify.error || 'No playable tracks could be found in this playlist.'}
          </p>
          <button
            className="btn-spotify-connect"
            style={{ marginTop: '24px' }}
            onClick={isLoggedIn ? handleBackToPlaylists : handleBackToHome}
          >
            {isLoggedIn ? 'Choose Another Playlist' : 'Try Another Playlist'}
          </button>
        </div>
      )}

      {/* 8. Active Game / Results */}
      {!spotify.loading && spotify.selectedPlaylist && !spotify.loadingTracks && spotify.tracks.length > 0 && (
        <>
          {game.result === 'correct' && (
            <WinScreen
              track={game.gameTrack}
              guessedSeconds={game.guessedSeconds}
              streak={game.streak}
              onNext={game.nextRound}
              onBackToPlaylists={handleBackToHome}
            />
          )}

          {game.result === 'gave_up' && (
            <LostScreen
              track={game.gameTrack}
              onNext={game.nextRound}
              onBackToPlaylists={handleBackToHome}
            />
          )}

          {game.result !== 'correct' && game.result !== 'gave_up' && (
            <MainGame
              game={game}
              tracks={spotify.tracks}
              playlistName={spotify.selectedPlaylist.name}
              onBackToPlaylists={handleBackToHome}
            />
          )}
        </>
      )}
    </div>
  );
}

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const error = params.get('error');

  if (error) {
    return (
      <div className="app-container">
        <div className="loading-screen">
          <h1>Songuess</h1>
          <p style={{ color: '#ff4d4d', marginTop: '10px' }}>Spotify authorization was cancelled.</p>
          <button className="btn-spotify-connect" onClick={() => window.location.replace('/')} style={{ marginTop: '20px' }}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      {code ? <Callback code={code} /> : <Home />}
    </ErrorBoundary>
  );
}
