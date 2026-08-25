let resolvedServerUrl = null;
let serverUrlPromise = null;

export async function getActiveAudioServerUrl() {
  if (resolvedServerUrl) return resolvedServerUrl;
  if (serverUrlPromise) return serverUrlPromise;

  serverUrlPromise = (async () => {
    if (import.meta.env.VITE_AUDIO_SERVER_URL) {
      resolvedServerUrl = import.meta.env.VITE_AUDIO_SERVER_URL;
      return resolvedServerUrl;
    }
    if (
      typeof window !== 'undefined' &&
      window.location.protocol === 'https:' &&
      !window.location.hostname.includes('localhost') &&
      !window.location.hostname.includes('127.0.0.1')
    ) {
      resolvedServerUrl = 'https://songuess.onrender.com';
      return resolvedServerUrl;
    }
    // On local dev machine: try local 3001 first (with fast 250ms timeout)
    try {
      const res = await fetch('http://127.0.0.1:3001/health', { signal: AbortSignal.timeout(250) });
      if (res.ok) {
        resolvedServerUrl = 'http://127.0.0.1:3001';
        return resolvedServerUrl;
      }
    } catch {}
    resolvedServerUrl = 'https://songuess.onrender.com';
    return resolvedServerUrl;
  })();

  return serverUrlPromise;
}

let serverAvailable = null; // null: unknown, true: online, false: offline

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

export function checkServerStatus() {
  serverAvailable = null;
  return isAudioServerOnline(true);
}

// Web Audio API In-Memory Cache for 0ms Replays and Instant Snippets
let audioCtx = null;
const audioBufferCache = new Map(); // uri -> { buffer, bytes }
let totalAudioBufferBytes = 0;
const MAX_CACHE_BYTES = 50 * 1024 * 1024; // 50 MB RAM limit

// Separate State for Snippets vs Full Track Reveal Playback
let currentSnippetNode = null;
let currentSnippetTimeout = null;
let currentSnippetHtmlAudio = null;

let currentFullTrackNode = null;
let currentFullTrackHtmlAudio = null;
let fullTrackDelayTimer = null;
let currentFullTrackSessionId = 0;

const activeAudioSet = new Set();

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

const inFlightPreloads = new Map();

export async function fetchAndCacheTrackAudio(uri) {
  if (!uri) return null;
  if (audioBufferCache.has(uri)) {
    return audioBufferCache.get(uri).buffer;
  }
  if (inFlightPreloads.has(uri)) {
    return inFlightPreloads.get(uri);
  }

  const promise = (async () => {
    const serverUrl = await getActiveAudioServerUrl();
    const res = await fetch(`${serverUrl}/audio/snippet?uri=${encodeURIComponent(uri)}&duration=15`);
    if (!res.ok) {
      throw new Error(`Failed to load audio snippet (status ${res.status})`);
    }

    const arrayBuffer = await res.arrayBuffer();
    const ctx = getAudioContext();
    if (ctx) {
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      const entryBytes = audioBuffer.length * audioBuffer.numberOfChannels * 4;

      // Evict oldest entries if total cache size exceeds 50MB
      while (audioBufferCache.size > 0 && totalAudioBufferBytes + entryBytes > MAX_CACHE_BYTES) {
        const firstKey = audioBufferCache.keys().next().value;
        const entry = audioBufferCache.get(firstKey);
        totalAudioBufferBytes -= entry.bytes;
        audioBufferCache.delete(firstKey);
      }

      audioBufferCache.set(uri, { buffer: audioBuffer, bytes: entryBytes });
      totalAudioBufferBytes += entryBytes;
      return audioBuffer;
    }
    return null;
  })().finally(() => {
    inFlightPreloads.delete(uri);
  });

  inFlightPreloads.set(uri, promise);
  return promise;
}

/**
 * Preloads a track into browser memory ahead of time.
 */
export async function preloadTrack(uri) {
  if (!uri) return false;
  try {
    const buffer = await fetchAndCacheTrackAudio(uri);
    return Boolean(buffer);
  } catch {
    return false;
  }
}

export async function loadTrack(uri) {
  return preloadTrack(uri);
}

function registerAudio(audio) {
  if (!audio) return audio;
  activeAudioSet.add(audio);
  audio.addEventListener('ended', () => activeAudioSet.delete(audio), { once: true });
  audio.addEventListener('error', () => activeAudioSet.delete(audio), { once: true });
  return audio;
}

function killAudioElement(audio) {
  if (!audio) return;
  activeAudioSet.delete(audio);
  try {
    audio.pause();
    audio.currentTime = 0;
    audio.removeAttribute('src');
    audio.src = '';
    audio.load();
  } catch {}
}

/**
 * Stops full-track reveal audio from Win/Lost screens immediately.
 */
export function stopFullTrackPlayback() {
  ++currentFullTrackSessionId; // Invalidate any pending or in-flight full track stream

  if (fullTrackDelayTimer) {
    clearTimeout(fullTrackDelayTimer);
    fullTrackDelayTimer = null;
  }

  if (currentFullTrackNode) {
    try {
      currentFullTrackNode.stop();
      currentFullTrackNode.disconnect();
    } catch {}
    currentFullTrackNode = null;
  }

  if (currentFullTrackHtmlAudio) {
    killAudioElement(currentFullTrackHtmlAudio);
    currentFullTrackHtmlAudio = null;
  }
}

/**
 * Stops gameplay snippet audio immediately.
 */
export function stopSnippetPlayback() {
  if (currentSnippetTimeout) {
    clearTimeout(currentSnippetTimeout);
    currentSnippetTimeout = null;
  }

  if (currentSnippetNode) {
    try {
      currentSnippetNode.stop();
      currentSnippetNode.disconnect();
    } catch {}
    currentSnippetNode = null;
  }

  if (currentSnippetHtmlAudio) {
    killAudioElement(currentSnippetHtmlAudio);
    currentSnippetHtmlAudio = null;
  }
}

/**
 * Global stop for all audio.
 */
export function stopPlayback() {
  stopFullTrackPlayback();
  stopSnippetPlayback();

  for (const audio of activeAudioSet) {
    killAudioElement(audio);
  }
  activeAudioSet.clear();

  if (typeof document !== 'undefined') {
    document.querySelectorAll('audio').forEach(killAudioElement);
  }
}

/**
 * Plays an exact audio snippet using in-memory Web Audio Buffer (0ms instant playback).
 */
export async function playSnippet(uri, seconds, isCurrent = () => true, onPlay = () => {}) {
  // Stop reveal track and previous snippet
  stopFullTrackPlayback();
  stopSnippetPlayback();

  const ctx = getAudioContext();

  // Try in-memory buffer
  let cachedEntry = audioBufferCache.get(uri);
  let buffer = cachedEntry?.buffer;
  if (!buffer) {
    buffer = await fetchAndCacheTrackAudio(uri);
  }

  if (!isCurrent()) return;

  if (ctx && buffer) {
    return new Promise((resolve) => {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      currentSnippetNode = source;

      onPlay?.();
      source.start(0, 0, seconds);

      currentSnippetTimeout = setTimeout(() => {
        try {
          source.stop();
        } catch {}
        if (currentSnippetNode === source) {
          currentSnippetNode = null;
        }
        resolve();
      }, seconds * 1000);

      source.onended = () => {
        if (currentSnippetTimeout) {
          clearTimeout(currentSnippetTimeout);
          currentSnippetTimeout = null;
        }
        if (currentSnippetNode === source) {
          currentSnippetNode = null;
        }
        resolve();
      };
    });
  }

  // HTML5 Fallback
  const serverUrl = await getActiveAudioServerUrl();
  const audioUrl = `${serverUrl}/audio/snippet?uri=${encodeURIComponent(uri)}&duration=${seconds}`;
  const audio = registerAudio(new Audio(audioUrl));
  currentSnippetHtmlAudio = audio;

  return new Promise((resolve, reject) => {
    let triggered = false;

    const handleStart = () => {
      if (!triggered && isCurrent()) {
        triggered = true;
        onPlay?.();
      }
    };

    audio.onplaying = handleStart;
    audio.ontimeupdate = handleStart;

    audio.onended = () => {
      if (currentSnippetHtmlAudio === audio) currentSnippetHtmlAudio = null;
      resolve();
    };

    audio.onerror = () => {
      if (currentSnippetHtmlAudio === audio) currentSnippetHtmlAudio = null;
      reject(new Error('Audio snippet failed to load.'));
    };

    audio.play().catch((err) => {
      if (currentSnippetHtmlAudio === audio) currentSnippetHtmlAudio = null;
      reject(err);
    });

    currentSnippetTimeout = setTimeout(() => {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {}
      if (currentSnippetHtmlAudio === audio) currentSnippetHtmlAudio = null;
      resolve();
    }, seconds * 1000 + 400);
  });
}

/**
 * Plays reveal song audio on the Result (Win / Lost) screens with 0ms instant playback.
 * Uses in-memory Web Audio Buffer first, falling back to fast snippet stream.
 */
export async function playFullTrack(uri, delayMs = 50) {
  stopFullTrackPlayback();
  stopSnippetPlayback();

  const thisSessionId = ++currentFullTrackSessionId;

  // 1. Instant 0ms playback if track audio buffer is already in memory
  const ctx = getAudioContext();
  const cachedEntry = audioBufferCache.get(uri);
  const buffer = cachedEntry?.buffer;
  if (ctx && buffer) {
    try {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(ctx.destination);
      currentFullTrackNode = source;
      source.start(0, 0);
      return;
    } catch {}
  }

  // 2. Otherwise stream from server with debounce
  fullTrackDelayTimer = setTimeout(async () => {
    fullTrackDelayTimer = null;
    if (thisSessionId !== currentFullTrackSessionId) return;

    try {
      const serverUrl = await getActiveAudioServerUrl();
      if (thisSessionId !== currentFullTrackSessionId) return;

      const audioUrl = `${serverUrl}/audio/full?uri=${encodeURIComponent(uri)}`;
      const audio = registerAudio(new Audio());
      currentFullTrackHtmlAudio = audio;
      audio.volume = 0.85;

      audio.onplaying = () => {
        if (thisSessionId !== currentFullTrackSessionId) {
          killAudioElement(audio);
          if (currentFullTrackHtmlAudio === audio) currentFullTrackHtmlAudio = null;
        }
      };

      audio.onerror = () => {
        killAudioElement(audio);
        if (currentFullTrackHtmlAudio === audio) currentFullTrackHtmlAudio = null;
      };

      audio.src = audioUrl;

      if (thisSessionId !== currentFullTrackSessionId) {
        killAudioElement(audio);
        if (currentFullTrackHtmlAudio === audio) currentFullTrackHtmlAudio = null;
        return;
      }

      await audio.play().catch(() => {});

      if (thisSessionId !== currentFullTrackSessionId) {
        killAudioElement(audio);
        if (currentFullTrackHtmlAudio === audio) currentFullTrackHtmlAudio = null;
      }
    } catch {}
  }, delayMs);
}

export async function replaySnippet(uri, seconds, isCurrent = () => true) {
  return playSnippet(uri, seconds, isCurrent);
}
