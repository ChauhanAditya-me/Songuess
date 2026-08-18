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

async function waitForState(player, predicate, timeout = 3000) {
  const started = performance.now();

  while (performance.now() - started < timeout) {
    const state = await getState(player);

    if (state && predicate(state)) {
      return state;
    }

    await sleep(30);
  }

  return null;
}

async function pauseConfirmed(player, timeout = 1200) {
  for (let i = 0; i < 4; i++) {
    await player.pause().catch(() => {});

    const state = await waitForState(
      player,
      current => current.paused === true,
      timeout / 4
    );

    if (state?.paused) {
      return true;
    }

    await sleep(20);
  }

  return false;
}

async function seekToZero(player) {
  await player.seek(0).catch(() => {});

  const state = await waitForState(
    player,
    current => Number(current.position || 0) <= 80,
    1200
  );

  return Boolean(state);
}

async function setVolume(player, volume) {
  await player.setVolume(volume).catch(() => {});
}

async function prepareTrack(player, deviceId, uri) {
  savedVolume = await player.getVolume().catch(() => 0.5);

  await setVolume(player, 0);

  // There is intentionally only ONE Spotify REST playback call here.
  // It is used to put the selected track into the Web Playback SDK.
  await startPlayback(deviceId, uri);

  const loaded = await waitForState(
    player,
    state => state.track_window?.current_track?.uri === uri,
    5000
  );

  if (!loaded) {
    throw new Error('Spotify took too long to load the track.');
  }

  const paused = await pauseConfirmed(player);

  if (!paused) {
    throw new Error('Spotify player could not be paused after loading the track.');
  }

  await seekToZero(player);

  // Do NOT restore volume until the player is definitely paused at 0.
  await setVolume(player, savedVolume);
}

export async function ensurePlayer() {
  const result = await getSpotifyPlayer();

  if (!result.deviceId) {
    throw new Error('Spotify player device is not available yet.');
  }

  return result;
}

export async function waitForTrack(uri, timeout = 5000) {
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

export async function loadTrack(uri) {
  return enqueue(async () => {
    const { player, deviceId } = await ensurePlayer();
    await prepareTrack(player, deviceId, uri);
    return player;
  });
}

async function playSnippetInternal(uri, seconds, id, isCurrent) {
  const player = getCurrentPlayer();

  if (!player) {
    throw new Error('Spotify player is not initialized.');
  }

  let state = await getState(player);

  const loaded =
    state?.track_window?.current_track?.uri === uri;

  if (!loaded) {
    const { deviceId } = await ensurePlayer();

    if (!currentOperation(id, isCurrent)) return;

    await prepareTrack(player, deviceId, uri);

    if (!currentOperation(id, isCurrent)) {
      await pauseConfirmed(player);
      return;
    }
  }

  if (!currentOperation(id, isCurrent)) {
    await pauseConfirmed(player);
    return;
  }

  // Always begin a snippet from the exact beginning.
  await pauseConfirmed(player);

  if (!currentOperation(id, isCurrent)) {
    await pauseConfirmed(player);
    return;
  }

  await seekToZero(player);

  if (!currentOperation(id, isCurrent)) {
    await pauseConfirmed(player);
    return;
  }

  // Make absolutely sure volume is restored before starting.
  if (savedVolume !== null) {
    await setVolume(player, savedVolume);
  }

  await player.resume();

  // Wait until Spotify reports actual playback.
  state = await waitForState(
    player,
    current =>
      current.track_window?.current_track?.uri === uri &&
      current.paused === false,
    1200
  );

  if (!state) {
    throw new Error('Spotify did not start playback.');
  }

  const targetMs = Math.max(50, seconds * 1000);

  /*
   * For very short snippets, the SDK's state events can arrive later than
   * the requested duration. We therefore mute at the target first, then
   * confirm pause before restoring volume.
   */
  while (currentOperation(id, isCurrent)) {
    state = await getState(player);

    if (!state || state.track_window?.current_track?.uri !== uri) {
      break;
    }

    if (Number(state.position || 0) >= targetMs) {
      break;
    }

    await sleep(seconds <= 0.5 ? 10 : 20);
  }

  if (!currentOperation(id, isCurrent)) {
    await pauseConfirmed(player);
    return;
  }

  // Kill audible output immediately at the target.
  await setVolume(player, 0);

  const paused = await pauseConfirmed(player);

  if (!paused) {
    // Never restore volume if Spotify did not actually pause.
    throw new Error('Spotify player did not stop the snippet cleanly.');
  }

  await seekToZero(player);

  if (savedVolume !== null) {
    await setVolume(player, savedVolume);
  }
}

export async function playSnippet(uri, seconds, isCurrent = () => true) {
  const id = ++operationId;

  return enqueue(async () => {
    if (!isCurrent()) return;

    try {
      await playSnippetInternal(uri, seconds, id, isCurrent);
    } finally {
      if (id === operationId) {
        const player = getCurrentPlayer();

        if (player) {
          const state = await getState(player);

          if (state?.paused !== true) {
            await pauseConfirmed(player);
          }
        }
      }
    }
  });
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
