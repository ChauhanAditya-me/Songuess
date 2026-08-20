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

/**
 * Helper: raw authenticated fetch that does NOT throw on non-2xx.
 * Returns the Response object so callers can inspect .status / .ok.
 */
async function rawSpotifyFetch(url) {
  const token = await getValidAccessToken();
  if (!token) return null;
  try {
    return await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return null;
  }
}

function extractTracks(items) {
  const tracks = [];
  for (const item of items || []) {
    const t = item.track || item.item || item;
    if (t && (t.type === 'track' || !t.type) && t.uri && t.name) {
      tracks.push(t);
    }
  }
  return tracks;
}

export async function getPlaylistTracks(playlistId) {
  if (playlistId === '__liked__') {
    return getLikedTracks();
  }

  let tracks = [];

  // --- Strategy 1: GET /v1/playlists/{id} (full playlist object, no market) ---
  try {
    const res = await rawSpotifyFetch(
      `https://api.spotify.com/v1/playlists/${playlistId}`
    );
    console.warn(`[PlaylistLoader] Strategy 1 /playlists/${playlistId}: status=${res?.status}`);
    if (res?.ok) {
      const data = await res.json();
      const totalReported = data?.tracks?.total ?? 0;
      const itemCount = data?.tracks?.items?.length ?? 0;
      console.warn(`[PlaylistLoader] Strategy 1 response: total=${totalReported}, items=${itemCount}`);
      tracks = extractTracks(data?.tracks?.items);
      console.warn(`[PlaylistLoader] Strategy 1 extracted ${tracks.length} playable tracks`);

      let nextUrl = data?.tracks?.next;
      let pages = 1;
      while (nextUrl && pages < 5 && tracks.length < totalReported) {
        const pageRes = await rawSpotifyFetch(nextUrl);
        if (!pageRes?.ok) break;
        const pageData = await pageRes.json();
        tracks.push(...extractTracks(pageData.items));
        nextUrl = pageData.next;
        pages++;
      }
    }
  } catch (e) {
    console.warn('[PlaylistLoader] Strategy 1 error:', e.message);
  }

  if (tracks.length > 0) return tracks;

  // --- Strategy 2: GET /v1/playlists/{id}/tracks (tracks sub-endpoint) ---
  try {
    let nextUrl = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=50`;
    let pages = 0;

    while (nextUrl && pages < 5) {
      const pageRes = await rawSpotifyFetch(nextUrl);
      console.warn(`[PlaylistLoader] Strategy 2 /tracks page ${pages}: status=${pageRes?.status}`);
      if (!pageRes?.ok) break;
      const pageData = await pageRes.json();
      tracks.push(...extractTracks(pageData.items));
      nextUrl = pageData.next;
      pages++;
    }
  } catch (e) {
    console.warn('[PlaylistLoader] Strategy 2 error:', e.message);
  }

  if (tracks.length > 0) return tracks;

  // --- Strategy 3: Render backend loader with Librespot token ---
  try {
    const serverUrl = await getActiveAudioServerUrl();
    const res = await fetch(`${serverUrl}/public/playlist?url=${encodeURIComponent(playlistId)}`);
    console.warn(`[PlaylistLoader] Strategy 3 audio-server: status=${res?.status}`);
    if (res.ok) {
      const data = await res.json();
      if (data?.tracks?.length > 0) {
        return data.tracks;
      }
    }
  } catch (e) {
    console.warn('[PlaylistLoader] Strategy 3 error:', e.message);
  }

  console.warn(`[PlaylistLoader] All strategies exhausted for playlist ${playlistId}. Returning ${tracks.length} tracks.`);
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
