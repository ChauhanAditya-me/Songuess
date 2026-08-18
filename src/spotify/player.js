const PLAYER_NAME = 'SpotiGuess Player';

let player = null;
let promise = null;
let deviceId = null;
let sdkReady = false;
let readyPromise = null;
let resolveReady = null;
let rejectReady = null;

const listeners = new Map();

function emit(type, value) {
  (listeners.get(type) || []).forEach(fn => fn(value));
}

export function subscribe(type, fn) {
  if (!listeners.has(type)) {
    listeners.set(type, new Set());
  }

  listeners.get(type).add(fn);

  return () => {
    listeners.get(type)?.delete(fn);
  };
}

function loadSdk() {
  if (window.Spotify) {
    return Promise.resolve();
  }

  if (window.__spotiguessSdkPromise) {
    return window.__spotiguessSdkPromise;
  }

  window.__spotiguessSdkPromise = new Promise(resolve => {
    const previous = window.onSpotifyWebPlaybackSDKReady;

    window.onSpotifyWebPlaybackSDKReady = () => {
      previous?.();
      resolve();
    };

    if (!document.getElementById('spotify-player-script')) {
      const script = document.createElement('script');
      script.id = 'spotify-player-script';
      script.src = 'https://sdk.scdn.co/spotify-player.js';
      script.async = true;
      document.body.appendChild(script);
    }
  });

  return window.__spotiguessSdkPromise;
}

function waitForReady(timeout = 10000) {
  if (sdkReady && deviceId) {
    return Promise.resolve(deviceId);
  }

  if (!readyPromise) {
    readyPromise = new Promise((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;

      setTimeout(() => {
        if (resolveReady === resolve) {
          resolveReady = null;
          rejectReady = null;
          readyPromise = null;
          reject(new Error('Spotify player did not become ready.'));
        }
      }, timeout);
    });
  }

  return readyPromise;
}

export async function getSpotifyPlayer() {
  if (player && sdkReady && deviceId) {
    return { player, deviceId };
  }

  if (promise) {
    return promise;
  }

  promise = (async () => {
    await loadSdk();

    if (player && sdkReady && deviceId) {
      return { player, deviceId };
    }

    player = new window.Spotify.Player({
      name: PLAYER_NAME,
      getOAuthToken: cb => cb(localStorage.getItem('spotify_access_token')),
      volume: 0.5
    });

    player.addListener('ready', ({ device_id }) => {
      deviceId = device_id;
      sdkReady = true;
      window.spotiguessDeviceId = device_id;

      emit('ready', device_id);

      if (resolveReady) {
        const resolve = resolveReady;
        resolveReady = null;
        rejectReady = null;
        readyPromise = null;
        resolve(device_id);
      }
    });

    player.addListener('not_ready', ({ device_id }) => {
      if (device_id === deviceId) {
        sdkReady = false;
        emit('not_ready', device_id);
      }
    });

    player.addListener('initialization_error', ({ message }) => {
      emit('error', message);
    });

    player.addListener('authentication_error', ({ message }) => {
      emit('error', `Authentication failed: ${message}`);

      if (rejectReady) {
        const reject = rejectReady;
        resolveReady = null;
        rejectReady = null;
        readyPromise = null;
        reject(new Error(`Authentication failed: ${message}`));
      }
    });

    player.addListener('account_error', ({ message }) => {
      emit('error', message);
    });

    player.addListener('playback_error', ({ message }) => {
      if (!message?.includes('no list was loaded')) {
        emit('playback_error', message);
      }
    });

    player.addListener('player_state_changed', state => {
      emit('state', state);
    });

    const connected = await player.connect();

    if (!connected) {
      throw new Error('Spotify player could not connect.');
    }

    if (!deviceId) {
      await waitForReady();
    }

    return { player, deviceId };
  })().catch(error => {
    promise = null;
    emit('error', error.message);
    throw error;
  });

  return promise;
}

export function getCurrentPlayer() {
  return player;
}

export function getCurrentDeviceId() {
  return deviceId || window.spotiguessDeviceId || null;
}

export function isPlayerReady() {
  return Boolean(player && sdkReady && getCurrentDeviceId());
}
