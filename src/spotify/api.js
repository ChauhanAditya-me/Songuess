import { getValidAccessToken, refreshAccessToken, clearAuthData } from './auth';
import { getActiveAudioServerUrl } from './playback';

export async function spotifyFetch(url, options = {}, isRetry = false) {
  const token = await getValidAccessToken();
  if (!token) throw new Error('Spotify session expired or not connected.');

  const response = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` },
  });

  if (response.status === 401 && !isRetry) {
    const refreshedToken = await refreshAccessToken();
    if (refreshedToken) {
      return spotifyFetch(url, options, true);
    }
    clearAuthData();
    throw new Error('Spotify session expired. Please connect Spotify again.');
  }

  if (!response.ok) {
    if (response.status === 401) {
      clearAuthData();
    }
    const text = await response.text();
    let message = text;
    try { const data = JSON.parse(text); message = data?.error?.message || data?.error_description || text; } catch {}
    throw new Error(message || `Spotify request failed: ${response.status}`);
  }
  return response;
}


export async function getProfile() {
  return (await spotifyFetch('https://api.spotify.com/v1/me')).json();
}

export async function getPlaylists() {
  const data = await (await spotifyFetch('https://api.spotify.com/v1/me/playlists?limit=50')).json();
  return data.items || [];
}

export async function getLikedTracks() {
  const tracks = [];
  let url = 'https://api.spotify.com/v1/me/tracks?limit=50';
  let pages = 0;

  while (url && pages < 4) {
    try {
      const res = await spotifyFetch(url);
      if (!res.ok) break;
      const data = await res.json();
      const items = data.items || [];

      for (const item of items) {
        const t = item.track;
        if (t && t.uri && t.name) {
          tracks.push(t);
        }
      }

      url = data.next;
      pages++;
    } catch {
      break;
    }
  }

  return tracks;
}

export async function getPlaylistTracks(playlistId) {
  if (playlistId === '__liked__') {
    return getLikedTracks();
  }

  const tracks = [];

  // 1. First attempt: Direct Spotify Web API playlist endpoint
  try {
    const url = `https://api.spotify.com/v1/playlists/${playlistId}`;
    const initialRes = await spotifyFetch(url);
    if (initialRes.ok) {
      const playlistData = await initialRes.json();
      const trackObj = playlistData.tracks;
      if (trackObj?.items) {
        for (const item of trackObj.items) {
          const t = item.track || item.item || item;
          if (t && (t.type === 'track' || !t.type) && t.uri && t.name) {
            tracks.push(t);
          }
        }

        let nextUrl = trackObj.next;
        let pages = 1;
        while (nextUrl && pages < 5) {
          try {
            const pageRes = await spotifyFetch(nextUrl);
            if (!pageRes.ok) break;
            const pageData = await pageRes.json();
            for (const item of pageData.items || []) {
              const t = item.track || item.item || item;
              if (t && (t.type === 'track' || !t.type) && t.uri && t.name) {
                tracks.push(t);
              }
            }
            nextUrl = pageData.next;
            pages++;
          } catch {
            break;
          }
        }
      }
    }
  } catch {}

  if (tracks.length > 0) {
    return tracks;
  }

  // 2. Second attempt: Render backend loader with Librespot token
  try {
    const serverUrl = await getActiveAudioServerUrl();
    const res = await fetch(`${serverUrl}/public/playlist?url=${encodeURIComponent(playlistId)}`);
    if (res.ok) {
      const data = await res.json();
      if (data?.tracks?.length > 0) {
        return data.tracks;
      }
    }
  } catch {}

  return tracks;
}

export async function startPlayback(deviceId, uri) {
  if (!deviceId) throw new Error('Spotify player device is not available yet.');
  const response = await spotifyFetch(`https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uris: [uri], position_ms: 0 }),
  });
  if (response.status !== 204 && !response.ok) throw new Error('Unable to start Spotify playback.');
}
