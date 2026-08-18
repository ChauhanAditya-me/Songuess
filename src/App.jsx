import React from "react";
const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
const REDIRECT_URI = "http://127.0.0.1:5173/callback";


async function getAccessToken(code) {
  const verifier = localStorage.getItem("code_verifier");

  if (!verifier) {
    throw new Error("Code verifier not found.");
  }

  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: "authorization_code",
    code: code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  });

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error_description || "Token request failed.");
  }

  localStorage.setItem("spotify_access_token", data.access_token);

  if (data.refresh_token) {
    localStorage.setItem("spotify_refresh_token", data.refresh_token);
  }

  localStorage.setItem("spotify_token_expires", Date.now() + data.expires_in * 1000);

  localStorage.removeItem("code_verifier");

  return data.access_token;
}

function App() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const error = params.get("error");

  if (error) {
    return (
      <div>
        <h1>SpotiGuess</h1>
        <p>Spotify authorization was cancelled.</p>
      </div>
    );
  }

  if (code) {
    return <Callback code={code} />;
  }

  return <Home />;
}

function Callback({ code }) {
  const [status, setStatus] = React.useState("Connecting to Spotify...");
  const [connected, setConnected] = React.useState(false);
  const started = React.useRef(false);

  React.useEffect(() => {
    if (started.current) {
      return;
    }

    started.current = true;

    getAccessToken(code)
      .then(() => {
        setStatus("Spotify connected!");
        setConnected(true);

        window.location.href = "/";
      })
      .catch((error) => {
        console.error(error);
        setStatus("Failed to connect to Spotify.");
      });
  }, [code]);

  return (
    <div>
      <h1>SpotiGuess</h1>

      <p>{status}</p>

      {connected && <p>🎵 You are ready to play!</p>}
    </div>
  );
}

function Home() {
  const [player, setPlayer] = React.useState(null);
  const [playerReady, setPlayerReady] = React.useState(false);
  const [playerError, setPlayerError] = React.useState(null);
  const [profile, setProfile] = React.useState(null);
  const [playlists, setPlaylists] = React.useState([]);
  const [tracks, setTracks] = React.useState([]);
  const [selectedPlaylist, setSelectedPlaylist] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [loadingTracks, setLoadingTracks] = React.useState(false);

  React.useEffect(() => {
    async function loadUserData() {
      const token = localStorage.getItem("spotify_access_token");

      if (!token) {
        console.log("No Spotify token found.");
        return;
      }

      try {
        const profileResponse = await fetch(
          "https://api.spotify.com/v1/me",
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!profileResponse.ok) {
          throw new Error(
            `Profile request failed: ${profileResponse.status}`
          );
        }

        const profileData = await profileResponse.json();
        console.log("Spotify profile:", profileData);
        setProfile(profileData);

        const playlistResponse = await fetch(
          "https://api.spotify.com/v1/me/playlists?limit=50",
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!playlistResponse.ok) {
          throw new Error(
            `Playlist request failed: ${playlistResponse.status}`
          );
        }

        const playlistData = await playlistResponse.json();
        console.log("Spotify playlists:", playlistData);
        setPlaylists(playlistData.items);
      } catch (error) {
        console.error("Spotify data error:", error);
        setError(error.message);
      }
    }

    loadUserData();
  }, []);

  React.useEffect(() => {
    const token = localStorage.getItem("spotify_access_token");

    if (!token) {
      return;
    }

    window.onSpotifyWebPlaybackSDKReady = () => {
      const spotifyPlayer = new window.Spotify.Player({
        name: "SpotiGuess Player",

        getOAuthToken: (callback) => {
          const currentToken =
            localStorage.getItem("spotify_access_token");

          callback(currentToken);
        },

        volume: 0.5,
      });

      spotifyPlayer.addListener("ready", ({ device_id }) => {
        console.log("SpotiGuess player ready:", device_id);
        setPlayerReady(true);
      });

      spotifyPlayer.addListener("not_ready", ({ device_id }) => {
        console.log("SpotiGuess player not ready:", device_id);
        setPlayerReady(false);
      });

      spotifyPlayer.addListener(
        "initialization_error",
        ({ message }) => {
          console.error("Initialization error:", message);
          setPlayerError(message);
        }
      );

      spotifyPlayer.addListener(
        "authentication_error",
        ({ message }) => {
          console.error("Authentication error:", message);
          setPlayerError(message);
        }
      );

      spotifyPlayer.addListener(
        "account_error",
        ({ message }) => {
          console.error("Account error:", message);
          setPlayerError(message);
        }
      );

      spotifyPlayer.addListener(
        "playback_error",
        ({ message }) => {
          console.error("Playback error:", message);
          setPlayerError(message);
        }
      );

      spotifyPlayer.connect();

      setPlayer(spotifyPlayer);
    };

    if (!document.getElementById("spotify-player-script")) {
      const script = document.createElement("script");

      script.id = "spotify-player-script";
      script.src = "https://sdk.scdn.co/spotify-player.js";
      script.async = true;

      document.body.appendChild(script);
    }

    return () => {
      window.onSpotifyWebPlaybackSDKReady = undefined;
    };
  }, []);

  async function loadPlaylist(playlist) {
    const token = localStorage.getItem("spotify_access_token");

    setSelectedPlaylist(playlist);
    setTracks([]);
    setLoadingTracks(true);
    setError(null);

    try {
      const response = await fetch(
        `https://api.spotify.com/v1/playlists/${playlist.id}/items?limit=50`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to get playlist tracks.");
      }

      const data = await response.json();

      const songs = data.items
        .map((item) => item.item)
        .filter((item) => item && item.type === "track");

      setTracks(songs);
    } catch (error) {
      console.error(error);
      setError(error.message);
    } finally {
      setLoadingTracks(false);
    }
  }

  async function connectSpotify() {
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);

    localStorage.setItem("code_verifier", verifier);

    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: "code",
      redirect_uri: REDIRECT_URI,
      scope: "user-read-private user-read-email playlist-read-private streaming",
      code_challenge_method: "S256",
      code_challenge: challenge,
    });

    window.location.href =
      `https://accounts.spotify.com/authorize?${params.toString()}`;
  }

  return (
    <div>
      <h1>SpotiGuess</h1>

      <p>Guess the song before the time runs out.</p>

      {error && <p>{error}</p>}

      {!profile && !error && (
        <button onClick={connectSpotify}>
          Connect Spotify
        </button>
      )}

      {profile && (
        <div>
          <h2>Welcome, {profile.display_name}!</h2>

          <p>Spotify Connected 🎵</p>

          {playerError && (
            <p>Player error: {playerError}</p>
          )}

          {playerReady && (
            <p>🎧 SpotiGuess player is ready</p>
          )}

          <h2>Your Playlists</h2>

          {playerReady && selectedPlaylist && tracks.length > 0 && (
            <button
              onClick={() => {
                player.resume();
              }}
            >
              ▶ Test Player
            </button>
          )}

          {!selectedPlaylist && (
            <>
              {playlists.length === 0 ? (
                <p>No playlists found.</p>
              ) : (
                <ul>
                  {playlists.map((playlist) => (
                    <li key={playlist.id}>
                      <button onClick={() => loadPlaylist(playlist)}>
                        {playlist.name}
                      </button>

                      {" "}
                      — {playlist.items?.total ?? 0} songs
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {selectedPlaylist && (
            <div>
              <button
                onClick={() => {
                  setSelectedPlaylist(null);
                  setTracks([]);
                }}
              >
                ← Back to Playlists
              </button>

              <h2>{selectedPlaylist.name}</h2>

              {loadingTracks && <p>Loading songs...</p>}

              {!loadingTracks && tracks.length === 0 && (
                <p>No playable tracks found.</p>
              )}

              {!loadingTracks && tracks.length > 0 && (
                <div>
                  <p>{tracks.length} songs loaded</p>

                  <ul>
                    {tracks.map((track) => (
                      <li key={track.id}>
                        <strong>{track.name}</strong>
                        {" — "}
                        {track.artists
                          .map((artist) => artist.name)
                          .join(", ")}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function generateCodeVerifier(length = 128) {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  let verifier = "";

  for (let i = 0; i < length; i++) {
    verifier += characters.charAt(
      Math.floor(Math.random() * characters.length)
    );
  }

  return verifier;
}

async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await window.crypto.subtle.digest("SHA-256", data);

  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export default App;