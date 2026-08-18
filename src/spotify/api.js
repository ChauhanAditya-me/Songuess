import { getAccessToken } from './auth';

export async function spotifyFetch(url, options = {}) {
  const token = getAccessToken();
  if (!token) throw new Error('Spotify is not connected.');
  const response = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
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

export async function getPlaylistTracks(playlistId) {
  const tracks = [];
  let url = `https://api.spotify.com/v1/playlists/${playlistId}/items?limit=50`;

  while (url) {
    const data = await (await spotifyFetch(url)).json();

    tracks.push(
      ...(data.items || [])
        .map(item => item.item)
        .filter(item => item?.type === 'track' && item.uri)
    );

    url = data.next;
  }

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
