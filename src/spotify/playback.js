import { startPlayback } from './api';
import { getCurrentPlayer, getSpotifyPlayer } from './player';

const AUDIO_SERVER_URL =
  import.meta.env.VITE_AUDIO_SERVER_URL ||
  (typeof window !== 'undefined' && window.location.protocol === 'https:' && window.location.hostname !== '127.0.0.1' && window.location.hostname !== 'localhost'
    ? 'https://songuess.onrender.com'
    : 'http://127.0.0.1:3001');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

let currentHtmlAudio = null;
let serverAvailable = null; // null: unknown, true: online, false: offline

let playbackQueue = Promise.resolve();
let operationId = 0;
let savedVolume = 0.5;

export function resetPlaybackQueue() {
  playbackQueue = Promise.resolve();
  operationId++;
  savedVolume = 0.5;
  if (currentHtmlAudio) {
    try {
      currentHtmlAudio.pause();
      currentHtmlAudio = null;
    } catch {}
  }
}

function enqueue(task) {
  const run = playbackQueue.then(task, task);
  playbackQueue = run.catch(() => {});
  return run;
}

export async function isAudioServerOnline(forceCheck = false) {
  if (!forceCheck && serverAvailable === true) return true;
  try {
    const res = await fetch(`${AUDIO_SERVER_URL}/health`, { signal: AbortSignal.timeout(3500) });
    const data = await res.json();
    serverAvailable = Boolean(data?.status === 'ok' && data?.authenticated);
  } catch {
    serverAvailable = false;
  }
  return serverAvailable;
}

export async function getAudioServerAuthStatus() {
  try {
    const res = await fetch(`${AUDIO_SERVER_URL}/auth/status`, { signal: AbortSignal.timeout(3500) });
    if (!res.ok) return { online: false, authenticated: false };
    const data = await res.json();
    return { online: true, authenticated: Boolean(data.authenticated), hasCredentials: Boolean(data.has_credentials) };
  } catch {
    return { online: false, authenticated: false, hasCredentials: false };
  }
}

export async function startAudioServerLogin() {
  try {
    const res = await fetch(`${AUDIO_SERVER_URL}/auth/login-url`);
    const data = await res.json();
    if (data.auth_url) {
      window.open(data.auth_url, 'spotify_login', 'width=600,height=750');
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// Reset cached server availability on demand
export function checkServerStatus() {
  serverAvailable = null;
  return isAudioServerOnline();
}

async function getState(player) {
  return player.getCurrentState().catch(() => null);
}

async function waitForState(player, predicate, timeout = 8000) {
  const started = performance.now();

  while (performance.now() - started < timeout) {
    const state = await getState(player);

    if (state && predicate(state)) {
      return state;
    }

    await sleep(35);
  }

  return null;
}

async function pauseConfirmed(player, timeout = 1400) {
  for (let i = 0; i < 4; i++) {
    await player.pause().catch(() => {});

    const state = await waitForState(
      player,
      current => current.paused === true,
      timeout / 4
    );

    if (state?.paused) return true;

    await sleep(25);
  }

  return false;
}

async function seekToZero(player) {
  for (let i = 0; i < 3; i++) {
    await player.seek(0).catch(() => {});

    const state = await waitForState(
      player,
      current => Number(current.position || 0) <= 100,
      700
    );

    if (state) return true;
  }

  return false;
}

async function setVolume(player, volume) {
  await player.setVolume(volume).catch(() => {});
}

async function loadTrackInternal(player, deviceId, uri) {
  const currentVol = await player.getVolume().catch(() => 0.5);
  if (currentVol && currentVol > 0.05) {
    savedVolume = currentVol;
  } else if (!savedVolume || savedVolume <= 0.05) {
    savedVolume = 0.5;
  }

  await setVolume(player, 0);
  await pauseConfirmed(player);

  let loaded = false;
  let lastError = null;

  for (let attempt = 0; attempt < 2 && !loaded; attempt++) {
    try {
      await startPlayback(deviceId, uri);

      const state = await waitForState(
        player,
        current => current.track_window?.current_track?.uri === uri,
        8000
      );

      loaded = Boolean(state);
    } catch (error) {
      lastError = error;
      await sleep(150);
    }
  }

  if (!loaded) {
    throw lastError || new Error('Spotify took too long to load the track.');
  }

  await pauseConfirmed(player);
  await seekToZero(player);
  await setVolume(player, savedVolume || 0.5);
}

export async function ensurePlayer() {
  const result = await getSpotifyPlayer();

  if (!result.deviceId) {
    throw new Error('Spotify player device is not available yet.');
  }

  return result;
}

/*
 * Prepares a track and caches it into memory (or SDK).
 */
export async function preloadTrack(uri) {
  const serverOnline = await isAudioServerOnline();
  if (serverOnline) {
    // Heat server-side cache in background
    fetch(`${AUDIO_SERVER_URL}/audio/preload?uri=${encodeURIComponent(uri)}`, {
      method: 'POST',
      signal: AbortSignal.timeout(4000),
    }).catch(() => {});
    return true;
  }

  return enqueue(async () => {
    const { player, deviceId } = await ensurePlayer();

    const current = await getState(player);
    if (current?.track_window?.current_track?.uri === uri) {
      await pauseConfirmed(player);
      await seekToZero(player);
      return player;
    }

    await loadTrackInternal(player, deviceId, uri);
    return player;
  });
}

export async function loadTrack(uri) {
  return preloadTrack(uri);
}

/*
 * Plays an exact audio snippet using the Librespot backend (or falls back to SDK).
 */
export async function playSnippet(uri, seconds, isCurrent = () => true, onPlay = () => {}) {
  const serverOnline = await isAudioServerOnline();

  if (serverOnline) {
    // Stop any existing HTML5 audio
    if (currentHtmlAudio) {
      try {
        currentHtmlAudio.pause();
        currentHtmlAudio = null;
      } catch {}
    }

    const audioUrl = `${AUDIO_SERVER_URL}/audio/snippet?uri=${encodeURIComponent(uri)}&duration=${seconds}`;
    const audio = new Audio(audioUrl);
    currentHtmlAudio = audio;

    return new Promise((resolve, reject) => {
      audio.onplaying = () => {
        if (isCurrent()) {
          onPlay?.();
        }
      };

      audio.onended = () => {
        if (currentHtmlAudio === audio) currentHtmlAudio = null;
        resolve();
      };

      audio.onerror = () => {
        if (currentHtmlAudio === audio) currentHtmlAudio = null;
        reject(new Error('Audio playback failed from server.'));
      };

      audio.play().catch(reject);
    });
  }

  // --- Fallback to Spotify Web Playback SDK ---
  const player = getCurrentPlayer();
  if (!player) throw new Error('Spotify player is not initialized.');

  const current = await player.getCurrentState().catch(() => null);
  const loaded = current?.track_window?.current_track?.uri === uri;

  if (!loaded) {
    await loadTrack(uri);
  }

  if (!isCurrent()) return;

  await player.pause().catch(() => {});
  if (!isCurrent()) return;

  await sleep(100);
  await player.seek(0).catch(() => {});
  if (!isCurrent()) return;

  await sleep(100);
  const vol = savedVolume && savedVolume > 0.05 ? savedVolume : 0.5;
  await player.setVolume(vol).catch(() => {});

  await player.resume();
  if (isCurrent()) {
    onPlay?.();
  }

  if (!isCurrent()) {
    await player.pause().catch(() => {});
    return;
  }

  const started = performance.now();
  const targetMs = seconds * 1000;

  while (isCurrent()) {
    const state = await player.getCurrentState().catch(() => null);

    if (state?.track_window?.current_track?.uri !== uri) {
      break;
    }

    if (
      state.position >= targetMs ||
      performance.now() - started >= targetMs + 700
    ) {
      break;
    }

    await sleep(25);
  }

  if (isCurrent()) {
    await player.pause().catch(() => {});
  }
}

export async function replaySnippet(uri, seconds, isCurrent = () => true) {
  return playSnippet(uri, seconds, isCurrent);
}

export async function stopPlayback() {
  ++operationId;

  // Stop HTML5 audio if active
  if (currentHtmlAudio) {
    try {
      currentHtmlAudio.pause();
      currentHtmlAudio.currentTime = 0;
      currentHtmlAudio = null;
    } catch {}
  }

  const serverOnline = await isAudioServerOnline();
  if (serverOnline) return;

  return enqueue(async () => {
    const player = getCurrentPlayer();
    if (!player) return;

    await setVolume(player, 0);
    await pauseConfirmed(player);
    await seekToZero(player);

    const vol = savedVolume && savedVolume > 0.05 ? savedVolume : 0.5;
    await setVolume(player, vol);
  });
}
