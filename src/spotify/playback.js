import { startPlayback } from './api';
import { getCurrentPlayer, getSpotifyPlayer } from './player';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

let playbackQueue = Promise.resolve();
let operationId = 0;
let savedVolume = null;

function enqueue(task) {
  const run = playbackQueue.then(task, task);
  playbackQueue = run.catch(() => {});
  return run;
}

function currentOperation(id, isCurrent) {
  return id === operationId && isCurrent();
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
  savedVolume = await player.getVolume().catch(() => 0.5);

  // Keep loading completely silent. If Spotify starts before the SDK reports
  // the new track, the user never hears the beginning of the full song.
  await setVolume(player, 0);
  await pauseConfirmed(player);

  let loaded = false;
  let lastError = null;

  // Spotify can occasionally accept the request but take longer to expose
  // the track through the Web Playback SDK. Give it a second attempt.
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

  // Leave the track loaded and paused. This is the important preload state.
  await setVolume(player, savedVolume);
}

export async function ensurePlayer() {
  const result = await getSpotifyPlayer();

  if (!result.deviceId) {
    throw new Error('Spotify player device is not available yet.');
  }

  return result;
}

export async function waitForTrack(uri, timeout = 8000) {
  const player = getCurrentPlayer();

  if (!player) {
    throw new Error('Spotify player is not initialized.');
  }

  const state = await waitForState(
    player,
    current => current.track_window?.current_track?.uri === uri,
    timeout
  );

  if (!state) {
    throw new Error('Spotify took too long to load the track.');
  }

  return state;
}

/*
 * Prepares a track and leaves it paused at 0:00.
 * This is safe to call while the game is idle.
 */
export async function preloadTrack(uri) {
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

async function playSnippetInternal(uri, seconds, id, isCurrent) {
  const player = getCurrentPlayer();

  if (!player) {
    throw new Error('Spotify player is not initialized.');
  }

  let state = await getState(player);
  const loaded = state?.track_window?.current_track?.uri === uri;

  if (!loaded) {
    const { deviceId } = await ensurePlayer();

    if (!currentOperation(id, isCurrent)) return;

    await loadTrackInternal(player, deviceId, uri);

    if (!currentOperation(id, isCurrent)) {
      await pauseConfirmed(player);
      return;
    }
  }

  if (!currentOperation(id, isCurrent)) {
    await pauseConfirmed(player);
    return;
  }

  await pauseConfirmed(player);

  if (!currentOperation(id, isCurrent)) return;

  await seekToZero(player);

  if (!currentOperation(id, isCurrent)) return;

  if (savedVolume !== null) {
    await setVolume(player, savedVolume);
  }

  await player.resume();
  state.paused === false

  state = await waitForState(
    player,
    current =>
      current.track_window?.current_track?.uri === uri &&
      current.paused === false,
    1600
  );

  if (!state) {
    throw new Error('Spotify did not start playback.');
  }

  const targetMs = Math.max(50, seconds * 1000);

  while (currentOperation(id, isCurrent)) {
    state = await getState(player);

    if (!state || state.track_window?.current_track?.uri !== uri) break;

    if (Number(state.position || 0) >= targetMs) break;

    await sleep(seconds <= 0.5 ? 10 : 20);
  }

  if (!currentOperation(id, isCurrent)) {
    await pauseConfirmed(player);
    return;
  }

  // Mute first so a delayed pause command cannot leak more audio.
  await setVolume(player, 0);
  await pauseConfirmed(player);
  await seekToZero(player);

  if (savedVolume !== null) {
    await setVolume(player, savedVolume);
  }
}

export async function playSnippet(uri, seconds, isCurrent = () => true) {
  const player = getCurrentPlayer();

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

  await player.resume();

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

  return enqueue(async () => {
    const player = getCurrentPlayer();
    if (!player) return;

    await setVolume(player, 0);
    await pauseConfirmed(player);
    await seekToZero(player);

    if (savedVolume !== null) {
      await setVolume(player, savedVolume);
    }
  });
}
