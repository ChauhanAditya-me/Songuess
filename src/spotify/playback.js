import { startPlayback } from './api';
import { getCurrentPlayer, getSpotifyPlayer } from './player';

let activeAudioServerUrl = 'https://songuess.onrender.com';

export async function getActiveAudioServerUrl() {
  if (import.meta.env.VITE_AUDIO_SERVER_URL) {
    return import.meta.env.VITE_AUDIO_SERVER_URL;
  }
  if (
    typeof window !== 'undefined' &&
    window.location.protocol === 'https:' &&
    !window.location.hostname.includes('localhost') &&
    !window.location.hostname.includes('127.0.0.1')
  ) {
    return 'https://songuess.onrender.com';
  }
  // On local dev machine: try local 3001 first; if not running, auto-route to Render!
  try {
    const res = await fetch('http://127.0.0.1:3001/health', { signal: AbortSignal.timeout(800) });
    if (res.ok) {
      activeAudioServerUrl = 'http://127.0.0.1:3001';
      return activeAudioServerUrl;
    }
  } catch {}
  activeAudioServerUrl = 'https://songuess.onrender.com';
  return activeAudioServerUrl;
}

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
    const url = await getActiveAudioServerUrl();
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3500) });
    const data = await res.json();
    serverAvailable = Boolean(data?.status === 'ok' && data?.authenticated);
  } catch {
    serverAvailable = false;
  }
  return serverAvailable;
}

export async function getAudioServerAuthStatus() {
  try {
    const url = await getActiveAudioServerUrl();
    const res = await fetch(`${url}/auth/status`, { signal: AbortSignal.timeout(3500) });
    if (!res.ok) return { online: false, authenticated: false };
    const data = await res.json();
    return { online: true, authenticated: Boolean(data.authenticated), hasCredentials: Boolean(data.has_credentials) };
  } catch {
    return { online: false, authenticated: false, hasCredentials: false };
  }
}

export async function startAudioServerLogin() {
  try {
    const url = await getActiveAudioServerUrl();
    const res = await fetch(`${url}/auth/login-url`);
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

export async function submitAudioServerCode(code) {
  try {
    const url = await getActiveAudioServerUrl();
    const res = await fetch(`${url}/auth/submit-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchPublicPlaylist(playlistUrl) {
  const url = await getActiveAudioServerUrl();
  const res = await fetch(`${url}/api/public-playlist?url=${encodeURIComponent(playlistUrl)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to load public playlist.');
  }
  return res.json();
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

// Web Audio API In-Memory Cache for 0ms Replays and Skips
let audioCtx = null;
const audioBufferCache = new Map();
let currentSourceNode = null;
let currentPlaybackTimeout = null;

function getAudioContext() {
  if (!audioCtx && typeof window !== 'undefined') {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export async function fetchAndCacheTrackAudio(uri) {
  if (audioBufferCache.has(uri)) {
    return audioBufferCache.get(uri);
  }

  const serverUrl = await getActiveAudioServerUrl();
  const res = await fetch(`${serverUrl}/audio/snippet?uri=${encodeURIComponent(uri)}&duration=15`);
  if (!res.ok) {
    throw new Error('Failed to load audio snippet from server');
  }

  const arrayBuffer = await res.arrayBuffer();
  const ctx = getAudioContext();
  if (ctx) {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    if (audioBufferCache.size > 15) {
      const firstKey = audioBufferCache.keys().next().value;
      audioBufferCache.delete(firstKey);
    }
    audioBufferCache.set(uri, audioBuffer);
    return audioBuffer;
  }
  return null;
}

/*
 * Prepares a track and caches it into browser RAM in background.
 */
export async function preloadTrack(uri) {
  try {
    fetchAndCacheTrackAudio(uri).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

export async function loadTrack(uri) {
  return preloadTrack(uri);
}

/*
 * Plays an exact audio snippet using in-memory Web Audio Buffer (0ms instant replay/skip).
 */
export async function playSnippet(uri, seconds, isCurrent = () => true, onPlay = () => {}) {
  // Stop previous playback
  stopPlayback();

  const ctx = getAudioContext();

  // Try in-memory buffer
  let buffer = audioBufferCache.get(uri);
  if (!buffer) {
    try {
      buffer = await fetchAndCacheTrackAudio(uri);
    } catch {}
  }

  if (!isCurrent()) return;

  if (ctx && buffer) {
    return new Promise((resolve) => {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      currentSourceNode = source;

      onPlay?.();
      source.start(0, 0, seconds);

      currentPlaybackTimeout = setTimeout(() => {
        try {
          source.stop();
        } catch {}
        if (currentSourceNode === source) {
          currentSourceNode = null;
        }
        resolve();
      }, seconds * 1000);

      source.onended = () => {
        if (currentPlaybackTimeout) {
          clearTimeout(currentPlaybackTimeout);
          currentPlaybackTimeout = null;
        }
        if (currentSourceNode === source) {
          currentSourceNode = null;
        }
        resolve();
      };
    });
  }

  // HTML5 Fallback
  const serverUrl = await getActiveAudioServerUrl();
  const audioUrl = `${serverUrl}/audio/snippet?uri=${encodeURIComponent(uri)}&duration=${seconds}`;
  const audio = new Audio(audioUrl);
  currentHtmlAudio = audio;

  return new Promise((resolve, reject) => {
    let triggered = false;

    const handleStart = () => {
      if (!triggered && isCurrent()) {
        triggered = true;
        onPlay?.();
      }
    };

    audio.onplaying = handleStart;
    audio.oncanplaythrough = handleStart;

    audio.onended = () => {
      if (currentHtmlAudio === audio) currentHtmlAudio = null;
      resolve();
    };

    audio.onerror = () => {
      if (currentHtmlAudio === audio) currentHtmlAudio = null;
      reject(new Error('Audio snippet took too long or failed to load.'));
    };

    audio.play().catch(() => {
      resolve();
    });
  });
}

function killAudioElement(audio) {
  if (!audio) return;
  try {
    audio.pause();
    audio.currentTime = 0;
    audio.removeAttribute('src');
    audio.src = '';
    audio.load();
  } catch {}
}

let currentFullTrackId = 0;
let activeFullAudio = null;
let activeFullAudioSource = null;

/*
 * Plays the full song audio on the Result (Win / Lost) screens.
 * Starts INSTANTLY (0ms) using the in-memory RAM snippet, then seamlessly continues full MP3 playback!
 */
export async function playFullTrack(uri) {
  await stopPlayback();
  const thisTrackId = ++currentFullTrackId;

  const ctx = getAudioContext();
  const cachedBuffer = audioBufferCache.get(uri);

  // 1. Play instantly from RAM (0ms latency!)
  if (ctx && cachedBuffer && thisTrackId === currentFullTrackId) {
    try {
      const source = ctx.createBufferSource();
      source.buffer = cachedBuffer;
      source.connect(ctx.destination);
      activeFullAudioSource = source;
      source.start(0, 0);
    } catch {}
  }

  // 2. Concurrently load full track MP3 stream
  try {
    const serverUrl = await getActiveAudioServerUrl();
    if (thisTrackId !== currentFullTrackId) {
      if (activeFullAudioSource) {
        try {
          activeFullAudioSource.stop();
          activeFullAudioSource.disconnect();
        } catch {}
        activeFullAudioSource = null;
      }
      return;
    }

    const audioUrl = `${serverUrl}/audio/full?uri=${encodeURIComponent(uri)}`;
    const audio = new Audio();
    activeFullAudio = audio;
    audio.volume = 0.85;

    audio.onplaying = () => {
      if (thisTrackId !== currentFullTrackId) {
        killAudioElement(audio);
        if (activeFullAudio === audio) activeFullAudio = null;
        return;
      }

      // Once the full stream is playing, smoothly disconnect the temporary RAM snippet node
      if (activeFullAudioSource) {
        try {
          activeFullAudioSource.stop();
          activeFullAudioSource.disconnect();
        } catch {}
        activeFullAudioSource = null;
      }
    };

    audio.src = audioUrl;

    if (thisTrackId !== currentFullTrackId) {
      killAudioElement(audio);
      if (activeFullAudio === audio) activeFullAudio = null;
      return;
    }

    await audio.play().catch(() => {});

    if (thisTrackId !== currentFullTrackId) {
      killAudioElement(audio);
      if (activeFullAudio === audio) activeFullAudio = null;
    }
  } catch {}
}

export async function replaySnippet(uri, seconds, isCurrent = () => true) {
  return playSnippet(uri, seconds, isCurrent);
}

export async function stopPlayback() {
  ++operationId;
  ++currentFullTrackId; // Invalidate any in-flight full track streaming

  if (currentPlaybackTimeout) {
    clearTimeout(currentPlaybackTimeout);
    currentPlaybackTimeout = null;
  }

  if (activeFullAudioSource) {
    try {
      activeFullAudioSource.stop();
      activeFullAudioSource.disconnect();
    } catch {}
    activeFullAudioSource = null;
  }

  if (currentSourceNode) {
    try {
      currentSourceNode.stop();
      currentSourceNode.disconnect();
    } catch {}
    currentSourceNode = null;
  }

  // Hard kill any full track HTML5 audio
  if (activeFullAudio) {
    killAudioElement(activeFullAudio);
    activeFullAudio = null;
  }

  // Hard kill any regular snippet HTML5 audio
  if (currentHtmlAudio) {
    killAudioElement(currentHtmlAudio);
    currentHtmlAudio = null;
  }

  const player = getCurrentPlayer();
  if (player) {
    try {
      player.pause().catch(() => {});
    } catch {}
  }
}
