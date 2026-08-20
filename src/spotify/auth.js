const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
const REDIRECT_URI =
  window.location.hostname === '127.0.0.1'
    ? 'http://127.0.0.1:5173/callback'
    : `${window.location.origin}/callback`;

let refreshPromise = null;

export function getAccessToken() {
  return localStorage.getItem('spotify_access_token');
}

export function getRefreshToken() {
  return localStorage.getItem('spotify_refresh_token');
}

export function getTokenExpiry() {
  const expires = localStorage.getItem('spotify_token_expires');
  return expires ? Number(expires) : 0;
}

export function isTokenExpired() {
  const token = getAccessToken();
  if (!token) return true;
  const expires = getTokenExpiry();
  // Expired or will expire within 60 seconds
  return !expires || Date.now() >= expires - 60 * 1000;
}

export function clearAuthData() {
  localStorage.removeItem('spotify_access_token');
  localStorage.removeItem('spotify_refresh_token');
  localStorage.removeItem('spotify_token_expires');
  localStorage.removeItem('code_verifier');
  sessionStorage.removeItem('code_verifier');
}

export function isAuthenticated() {
  return Boolean(getAccessToken() || getRefreshToken());
}

export async function refreshAccessToken() {
  if (refreshPromise) {
    return refreshPromise;
  }

  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    clearAuthData();
    return null;
  }

  if (!CLIENT_ID) {
    console.error('Spotify Client ID is missing. Cannot refresh token.');
    return null;
  }

  refreshPromise = (async () => {
    try {
      const body = new URLSearchParams({
        client_id: CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      });

      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });

      const data = await response.json();
      if (!response.ok) {
        console.warn('Failed to refresh Spotify token:', data);
        clearAuthData();
        return null;
      }

      if (data.access_token) {
        localStorage.setItem('spotify_access_token', data.access_token);
        const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 3600;
        localStorage.setItem('spotify_token_expires', String(Date.now() + expiresIn * 1000));
      }

      if (data.refresh_token) {
        localStorage.setItem('spotify_refresh_token', data.refresh_token);
      }

      return data.access_token;
    } catch (err) {
      console.error('Error while refreshing token:', err);
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function getValidAccessToken() {
  const token = getAccessToken();
  if (token && !isTokenExpired()) {
    return token;
  }

  const refreshToken = getRefreshToken();
  if (refreshToken) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return refreshed;
    }
  }

  return null;
}

export function generateCodeVerifier(length = 128) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

export async function generateCodeChallenge(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function beginSpotifyLogin() {
  if (!CLIENT_ID) {
    alert('Spotify Client ID is not configured. Please add VITE_SPOTIFY_CLIENT_ID in your Vercel Environment Variables.');
    return;
  }
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  sessionStorage.setItem('code_verifier', verifier);
  localStorage.setItem('code_verifier', verifier);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: 'user-read-private user-read-email playlist-read-private playlist-read-collaborative user-library-read streaming user-modify-playback-state user-read-playback-state',
    code_challenge_method: 'S256',
    code_challenge: challenge,
  });

  window.location.assign(`https://accounts.spotify.com/authorize?${params}`);
}

export async function exchangeCode(code) {
  const verifier = sessionStorage.getItem('code_verifier') || localStorage.getItem('code_verifier');
  if (!verifier) throw new Error('Code verifier not found. Please connect Spotify again.');

  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  });

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || 'Token request failed.');

  localStorage.setItem('spotify_access_token', data.access_token);
  if (data.refresh_token) localStorage.setItem('spotify_refresh_token', data.refresh_token);
  localStorage.setItem('spotify_token_expires', String(Date.now() + data.expires_in * 1000));
  sessionStorage.removeItem('code_verifier');
  localStorage.removeItem('code_verifier');
  return data.access_token;
}

export function logout() {
  clearAuthData();
  localStorage.clear();
  sessionStorage.clear();
  window.location.replace('/');
}

