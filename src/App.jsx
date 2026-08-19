import React, { useEffect, useRef } from 'react';
import { beginSpotifyLogin, exchangeCode, getAccessToken } from './spotify/auth';
import { useSpotify } from './hooks/useSpotify';
import { useSpotifyPlayer } from './hooks/useSpotifyPlayer';
import { useGame } from './hooks/useGame';
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
  return <main className="app"><h1>SpotiGuess</h1><p>{status}</p></main>;
}

function Home() {
  const spotify = useSpotify();
  const sdk = useSpotifyPlayer();
  const game = useGame(spotify.tracks, sdk.ready);

  return <main className="app">
    <h1>SpotiGuess</h1>
    <p>Guess the song before the time runs out.</p>

    {spotify.error && <p className="error">{spotify.error}</p>}
    {!spotify.profile && getAccessToken() == null && <button onClick={beginSpotifyLogin}>Connect Spotify</button>}

    {spotify.profile && <>
      <h2>Welcome, {spotify.profile.display_name}!</h2>
      <p>Spotify Connected 🎵</p>
      {sdk.error && sdk.error !== 'The operation is not allowed.' && (
        <p className="error">Player error: {sdk.error}</p>
      )}
      {sdk.reconnecting && <p>🔄 Reconnecting player...</p>}
      {sdk.ready && !sdk.reconnecting && <p>🎧 SpotiGuess player is ready</p>}
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

      <h2>Your Playlists</h2>
      {!spotify.selectedPlaylist && <ul>
        {spotify.playlists.map(p => <li key={p.id}><button onClick={() => spotify.loadPlaylist(p)}>{p.name}</button> — {p.items?.total ?? 0} songs</li>)}
      </ul>}

      {spotify.selectedPlaylist && <>
        <button onClick={spotify.resetPlaylist}>← Back to Playlists</button>
        <h2>{spotify.selectedPlaylist.name}</h2>
        {spotify.loadingTracks && <p>Loading songs...</p>}
        {!spotify.loadingTracks && <p>{spotify.tracks.length} songs loaded</p>}

        {spotify.tracks.length > 0 && <section className="game">
          <h2>SpotiGuess</h2><p>Score: <strong>{game.score}</strong></p>
          {!game.gameTrack && <button onClick={game.start} disabled={!sdk.ready}>▶ Start Round</button>}
          {game.gameTrack && <>
            <p>Snippet: <strong>{game.snippetSeconds}s</strong></p>
            {game.status === 'playing' && <p>🔊 Playing...</p>}
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
    </>}
  </main>;
}

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const error = params.get('error');
  if (error) return <main className="app"><h1>SpotiGuess</h1><p>Spotify authorization was cancelled.</p></main>;
  if (code) return <Callback code={code} />;
  return <Home />;
}
