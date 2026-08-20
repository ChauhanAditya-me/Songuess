import React, { useEffect, useRef, useState } from 'react';
import { beginSpotifyLogin, exchangeCode, logout } from './spotify/auth';
import { useSpotify } from './hooks/useSpotify';
import { useSpotifyPlayer } from './hooks/useSpotifyPlayer';
import { useGame } from './hooks/useGame';
import { getAudioServerAuthStatus } from './spotify/playback';
import LandingPage from './components/LandingPage';
import PlaylistSelector from './components/PlaylistSelector';
import MainGame from './components/MainGame';
import WinScreen from './components/WinScreen';
import LostScreen from './components/LostScreen';
import './App.css';

function Callback({ code }) {
  const started = useRef(false);
  const [status, setStatus] = React.useState('Connecting to Spotify...');

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
  const [serverStatus, setServerStatus] = useState({ online: false, authenticated: false });
  const serverReady = Boolean(serverStatus.online && serverStatus.authenticated);

  const spotify = useSpotify();
  const sdk = useSpotifyPlayer();
  const game = useGame(spotify.tracks, sdk.ready || serverReady);

  useEffect(() => {
    getAudioServerAuthStatus().then(setServerStatus);
  }, []);

  // Auto-start round 1 when a playlist finishes loading
  useEffect(() => {
    if (
      spotify.selectedPlaylist &&
      spotify.tracks.length > 0 &&
      !game.gameTrack &&
      game.status === 'idle'
    ) {
      game.start();
    }
  }, [spotify.selectedPlaylist, spotify.tracks, game.gameTrack, game.status]);

  const handleBackToPlaylists = () => {
    game.reset();
    spotify.resetPlaylist();
  };

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

      {/* 2. Landing Screen (Not logged in or Session Expired) */}
      {isLoggedOut && (
        <LandingPage
          onConnect={beginSpotifyLogin}
          error={spotify.error}
        />
      )}

      {/* 3. Playlist Selector Screen */}
      {!spotify.loading && spotify.profile && !spotify.selectedPlaylist && (
        <PlaylistSelector
          playlists={spotify.playlists}
          onSelectPlaylist={playlist => spotify.loadPlaylist(playlist)}
          onLogout={logout}
          profile={spotify.profile}
        />
      )}

      {/* 4. Loading Tracks State */}
      {!spotify.loading && spotify.selectedPlaylist && spotify.loadingTracks && (
        <div className="loading-screen">
          <div className="loading-pulse-disc">🎵</div>
          <p className="loading-text">Loading {spotify.selectedPlaylist.name}...</p>
        </div>
      )}

      {/* 5. Playlist Load Error State */}
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
            onClick={handleBackToPlaylists}
          >
            Choose Another Playlist
          </button>
        </div>
      )}

      {/* 6. Active Game / Results */}
      {!spotify.loading && spotify.selectedPlaylist && !spotify.loadingTracks && spotify.tracks.length > 0 && (
        <>
          {game.result === 'correct' && (
            <WinScreen
              track={game.gameTrack}
              guessedSeconds={game.guessedSeconds}
              onNext={game.nextRound}
              onBackToPlaylists={handleBackToPlaylists}
            />
          )}

          {game.result === 'gave_up' && (
            <LostScreen
              track={game.gameTrack}
              onNext={game.nextRound}
              onBackToPlaylists={handleBackToPlaylists}
            />
          )}

          {game.result !== 'correct' && game.result !== 'gave_up' && (
            <MainGame
              game={game}
              tracks={spotify.tracks}
              playlistName={spotify.selectedPlaylist.name}
              onBackToPlaylists={handleBackToPlaylists}
              serverReady={serverReady}
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

  if (code) return <Callback code={code} />;
  return <Home />;
}
