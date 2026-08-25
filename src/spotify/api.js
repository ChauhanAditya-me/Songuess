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
    try {
      const data = JSON.parse(text);
      message = data?.error?.message || data?.error_description || text;
    } catch {}
    throw new Error(message || `Spotify request failed: ${response.status}`);
  }
  return response;
}

export async function getProfile() {
  return (await spotifyFetch('https://api.spotify.com/v1/me')).json();
}

export async function getPlaylists() {
  const playlists = [];
  let url = 'https://api.spotify.com/v1/me/playlists?limit=50';
  let pages = 0;

  while (url && pages < 3) {
    try {
      const res = await spotifyFetch(url);
      if (!res.ok) break;
      const data = await res.json();
      const items = data.items || [];
      playlists.push(...items);
      url = data.next;
      pages++;
    } catch {
      break;
    }
  }

  return playlists;
}

export async function getLikedTracks() {
  const tracks = [];
  let url = 'https://api.spotify.com/v1/me/tracks?limit=50';
  let pages = 0;

  while (url && pages < 6) {
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

const playlistCache = new Map();

export async function getPlaylistTracks(playlistId) {
  if (playlistCache.has(playlistId)) {
    return playlistCache.get(playlistId);
  }

  if (playlistId === '__liked__') {
    const tracks = await getLikedTracks();
    if (tracks.length > 0) playlistCache.set(playlistId, tracks);
    return tracks;
  }

  // 1. Try Direct Spotify Web API with access token (paginate up to 300 tracks with limit=50)
  try {
    let url = `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/tracks?limit=50&additional_types=track`;
    const allItems = [];
    let pages = 0;

    while (url && pages < 6) {
      const res = await rawSpotifyFetch(url);
      if (!res?.ok) break;
      const data = await res.json();
      const items = data?.items || [];
      allItems.push(...items);
      url = data?.next;
      pages++;
    }

    const directTracks = extractTracks(allItems);
    if (directTracks.length > 0) {
      if (playlistCache.size > 25) {
        const firstKey = playlistCache.keys().next().value;
        playlistCache.delete(firstKey);
      }
      playlistCache.set(playlistId, directTracks);
      return directTracks;
    }
  } catch {}

  // 2. Fallback to Audio Server's Spotify Session / Embed Fetcher
  try {
    const serverUrl = await getActiveAudioServerUrl();
    const res = await fetch(`${serverUrl}/public/playlist?url=${encodeURIComponent(playlistId)}`);
    if (res.ok) {
      const data = await res.json();
      if (data?.tracks?.length > 0) {
        if (playlistCache.size > 25) {
          const firstKey = playlistCache.keys().next().value;
          playlistCache.delete(firstKey);
        }
        playlistCache.set(playlistId, data.tracks);
        return data.tracks;
      }
    }
  } catch {}

  return [];
}
