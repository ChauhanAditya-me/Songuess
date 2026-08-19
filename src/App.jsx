import React, { useEffect, useRef, useState } from 'react';
import { beginSpotifyLogin, exchangeCode, getAccessToken, logout } from './spotify/auth';
import { useSpotify } from './hooks/useSpotify';
import { useSpotifyPlayer } from './hooks/useSpotifyPlayer';
import { useGame } from './hooks/useGame';
import { isAudioServerOnline, getAudioServerAuthStatus, startAudioServerLogin, submitAudioServerCode, fetchPublicPlaylist } from './spotify/playback';
import './App.css';
import SongSearch from './components/SongSearch';

function Callback({ code }) {
  const started = useRef(false);
  const [status, setStatus] = React.useState('Connecting to Spotify...');
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    exchangeCode(code).then(() => { window.location.replace('/'); }).catch(e => setStatus(`Failed to connect: ${e.message}`));
  }, [code]);
  return <main className="app"><h1>Songuess</h1><p>{status}</p></main>;
}

function Home() {
  const [serverStatus, setServerStatus] = useState({ online: false, authenticated: false });
  const serverReady = Boolean(serverStatus.online && serverStatus.authenticated);
  const [authCodeInput, setAuthCodeInput] = useState('');
  const [submittingCode, setSubmittingCode] = useState(false);
  const [customUrlInput, setCustomUrlInput] = useState('');
  const [loadingPublic, setLoadingPublic] = useState(false);
  const [publicError, setPublicError] = useState(null);

  const spotify = useSpotify();
  const sdk = useSpotifyPlayer();
  const game = useGame(spotify.tracks, sdk.ready || serverReady);

  useEffect(() => {
    getAudioServerAuthStatus().then(setServerStatus);
  }, []);

  const handleAudioServerAuth = async () => {
    await startAudioServerLogin();
    const interval = setInterval(async () => {
      const s = await getAudioServerAuthStatus();
      setServerStatus(s);
      if (s.authenticated) {
        clearInterval(interval);
        window.location.reload();
      }
    }, 1500);
    setTimeout(() => clearInterval(interval), 60000);
  };

  const handleCodeSubmit = async (e) => {
    e.preventDefault();
    if (!authCodeInput.trim()) return;
    setSubmittingCode(true);
    const ok = await submitAudioServerCode(authCodeInput.trim());
    setSubmittingCode(false);
    if (ok) {
      window.location.reload();
    } else {
      alert('Failed to authenticate with that code. Please try clicking Authenticate again.');
    }
  };

  const handleLoadPublicPlaylist = async (urlOrId) => {
    setPublicError(null);
    setLoadingPublic(true);
    try {
      const data = await fetchPublicPlaylist(urlOrId);
      if (data?.tracks?.length > 0) {
        spotify.loadCustomTracks(data.name, data.tracks);
      } else {
        setPublicError('No tracks found in playlist.');
      }
    } catch (err) {
      setPublicError(err.message || 'Failed to load playlist.');
    } finally {
      setLoadingPublic(false);
    }
  };

  const handleCustomUrlSubmit = (e) => {
    e.preventDefault();
    if (!customUrlInput.trim()) return;
    handleLoadPublicPlaylist(customUrlInput.trim());
  };

  return <main className="app">
    <h1>Songuess</h1>
    <p>Guess the song before the time runs out.</p>

    {spotify.error && <p className="error">{spotify.error}</p>}

    {/* Auth / Profile Bar */}
    {spotify.profile ? (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Welcome, {spotify.profile.display_name}!</h2>
          <p style={{ margin: '2px 0', color: '#1db954', fontSize: '0.85rem' }}>Spotify Account Linked 🎵</p>
        </div>
        <button
          onClick={logout}
          style={{ background: '#282828', color: '#eee', border: '1px solid #444', padding: '6px 14px', borderRadius: '16px', cursor: 'pointer', fontSize: '0.85rem' }}
        >
          🚪 Logout
        </button>
      </div>
    ) : (
      <div style={{ margin: '15px 0', padding: '12px 16px', background: '#1c1c1c', borderRadius: '8px', border: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <strong>Playing as Guest</strong>
          <p style={{ margin: '2px 0', color: '#888', fontSize: '0.85rem' }}>Link your Spotify to load your private playlists</p>
        </div>
        <button onClick={beginSpotifyLogin} style={{ padding: '8px 16px', borderRadius: '20px' }}>
          Connect Spotify
        </button>
      </div>
    )}

    {/* Server Status Badge / Link Box */}
    {serverStatus.online && serverStatus.authenticated ? (
      <p style={{ color: '#1db954', fontWeight: 'bold', fontSize: '0.9rem' }}>⚡ Ultra-Fast Audio Server Active</p>
    ) : serverStatus.online && !serverStatus.authenticated ? (
      <div style={{ margin: '15px 0', padding: '15px', background: '#181818', borderRadius: '8px', border: '1px solid #282828' }}>
        <p style={{ color: '#e5a50a', marginTop: 0 }}>⚠️ Audio server is online but needs 1-time Spotify link</p>
        <button className="btn-reconnect" onClick={handleAudioServerAuth}>
          🔑 1-Click Authenticate Audio Server
        </button>

        <form onSubmit={handleCodeSubmit} style={{ marginTop: '12px', display: 'flex', gap: '8px', justifyContent: 'center' }}>
          <input
            type="text"
            placeholder="Paste redirected URL or code here..."
            value={authCodeInput}
            onChange={e => setAuthCodeInput(e.target.value)}
            style={{ width: '280px', padding: '6px 10px', borderRadius: '4px', border: '1px solid #444', background: '#222', color: '#fff' }}
          />
          <button type="submit" disabled={submittingCode}>
            {submittingCode ? 'Linking...' : 'Submit Code'}
          </button>
        </form>
      </div>
    ) : (
      <>
        {sdk.error && sdk.error !== 'The operation is not allowed.' && (
          <p className="error">Player error: {sdk.error}</p>
        )}
        {sdk.reconnecting && <p>🔄 Reconnecting player...</p>}
        {sdk.ready && !sdk.reconnecting && <p>🎧 Spotify Web Player is ready</p>}
        {(sdk.ready || sdk.error) && !sdk.reconnecting && (
          <button
            className="btn-reconnect"
            disabled={sdk.reconnecting}
            onClick={async () => {
              await game.reset();
              await sdk.reconnect();
            }}
          >
            🔄 Reconnect Player
          </button>
        )}
      </>
    )}

    {/* Guest Mode / Public Playlist Picker (Always visible when no playlist is selected) */}
    {!spotify.selectedPlaylist && (
      <div style={{ margin: '20px 0', padding: '16px', background: '#181818', borderRadius: '12px', border: '1px solid #282828', textAlign: 'left' }}>
        <h3 style={{ marginTop: 0, color: '#fff', fontSize: '1.1rem' }}>🎮 Play Any Spotify Playlist</h3>
        <p style={{ color: '#aaa', fontSize: '0.85rem', margin: '4px 0 12px' }}>
          Choose a quick mix or paste any Spotify playlist link:
        </p>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
          {[
            { name: "🔥 Today's Top Hits", id: "37i9dQZF1DXcBWIGoYBM5M" },
            { name: "🎸 Rock Classics", id: "37i9dQZF1DWXRqgorJj26U" },
            { name: "🕺 All Out 2000s", id: "37i9dQZF1DX4o1oenSJRJd" },
            { name: "🎧 Chill Hits", id: "37i9dQZF1DX4WYpdgoIcn6" },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => handleLoadPublicPlaylist(item.id)}
              disabled={loadingPublic}
              style={{ background: '#242424', border: '1px solid #444', color: '#fff', padding: '6px 12px', borderRadius: '16px', cursor: 'pointer', fontSize: '0.85rem' }}
            >
              {item.name}
            </button>
          ))}
        </div>

        <form onSubmit={handleCustomUrlSubmit} style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            placeholder="Paste Spotify playlist link or ID..."
            value={customUrlInput}
            onChange={e => setCustomUrlInput(e.target.value)}
            style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid #444', background: '#222', color: '#fff' }}
          />
          <button type="submit" disabled={loadingPublic}>
            {loadingPublic ? 'Loading...' : '▶ Play'}
          </button>
        </form>
        {publicError && <p style={{ color: '#e55353', marginTop: '10px', fontSize: '0.85rem' }}>{publicError}</p>}
      </div>
    )}

    {/* Personal Playlists (if logged in and no playlist selected) */}
    {spotify.profile && !spotify.selectedPlaylist && spotify.playlists.length > 0 && (
      <>
        <h2>Your Personal Playlists</h2>
        <ul>
          {spotify.playlists.map(p => <li key={p.id}><button onClick={() => spotify.loadPlaylist(p)}>{p.name}</button> — {p.items?.total ?? 0} songs</li>)}
        </ul>
      </>
    )}

    {/* Active Game Section */}
    {spotify.selectedPlaylist && <>
      <button onClick={spotify.resetPlaylist}>← Back to Playlists</button>
      <h2>{spotify.selectedPlaylist.name}</h2>
      {spotify.loadingTracks && <p>Loading songs...</p>}
      {!spotify.loadingTracks && <p>{spotify.tracks.length} songs loaded</p>}

      {spotify.tracks.length > 0 && <section className="game">
        <h2>Songuess</h2><p>Score: <strong>{game.score}</strong></p>
        {!game.gameTrack && <button onClick={game.start} disabled={!sdk.ready && !serverReady}>▶ Start Round</button>}
        {game.gameTrack && <>
          <p>Snippet: <strong>{game.snippetSeconds}s</strong></p>
          {game.status === 'loading' && <p style={{ color: '#e5a50a' }}>⏳ Loading snippet...</p>}
          {game.status === 'playing' && <p style={{ color: '#1db954' }}>🔊 Playing...</p>}
          {['loading', 'playing', 'paused'].includes(game.status) && (
            <form onSubmit={game.submitGuess}>
              <SongSearch
                tracks={spotify.tracks}
                value={game.guess}
                onChange={game.setGuess}
                onSelect={track => game.setGuess(track.name)}
              />

              <button type="submit">Guess</button>

              <button type="button" onClick={game.replay}>
                ▶ Play Again
              </button>

              <button type="button" onClick={game.stop}>
                ■ Stop
              </button>

              <button type="button" onClick={game.skip}>
                Skip
              </button>
            </form>
          )}
          {game.result === 'wrong' && <p>❌ Wrong. Try again.</p>}
          {game.result === 'correct' && <><p>✅ Correct — <strong>{game.gameTrack.name}</strong></p><button onClick={game.nextRound}>Next</button></>}
          {game.result === 'gave_up' && <><p>❌ Answer: <strong>{game.gameTrack.name}</strong></p><button onClick={game.nextRound}>Next</button></>}
          {game.error && <p className="error">Game error: {game.error}</p>}
        </>}

      </section>}
    </>}
  </main>;
}

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const error = params.get('error');
  if (error) return <main className="app"><h1>Songuess</h1><p>Spotify authorization was cancelled.</p></main>;
  if (code) return <Callback code={code} />;
  return <Home />;
}
