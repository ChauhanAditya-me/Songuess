import { loadTrack, pauseRemote } from "./playback";

let preparedTrack = null;
let preparingTrack = null;

export function getPreparedTrack() {
  return preparedTrack;
}

export function isPrepared(track) {
  return (
    preparedTrack &&
    track &&
    preparedTrack.uri === track.uri
  );
}

export async function preloadTrack({
  player,
  deviceId,
  track,
}) {
  if (!player || !deviceId || !track?.uri) {
    return false;
  }

  if (isPrepared(track)) {
    return true;
  }

  if (preparingTrack === track.uri) {
    return true;
  }

  preparingTrack = track.uri;

  try {
    /*
     * Load the track through Spotify once.
     *
     * We temporarily mute the SDK so the preload itself
     * never becomes an audible "whole song" playback.
     */
    let oldVolume = 0.5;

    try {
      oldVolume = await player.getVolume();
    } catch {
      // Keep default volume.
    }

    await player.setVolume(0);

    await loadTrack(deviceId, track.uri);

    await waitForTrack(player, track.uri);

    /*
     * Stop the preload immediately after Spotify has
     * acknowledged the track locally.
     */
    try {
      await player.pause();
    } catch {
      // Ignore "no list was loaded" style races.
    }

    try {
      await pauseRemote(deviceId);
    } catch {
      // Ignore remote pause failures.
    }

    try {
      await player.seek(0);
    } catch {
      // Ignore a transient seek race.
    }

    await player.setVolume(oldVolume);

    preparedTrack = track;

    return true;
  } finally {
    preparingTrack = null;
  }
}

export function clearPreparedTrack() {
  preparedTrack = null;
}

async function waitForTrack(player, uri, timeout = 5000) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const state = await player.getCurrentState();

    if (
      state?.track_window?.current_track?.uri === uri
    ) {
      return true;
    }

    await delay(50);
  }

  throw new Error(
    "Spotify took too long to load the track."
  );
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}