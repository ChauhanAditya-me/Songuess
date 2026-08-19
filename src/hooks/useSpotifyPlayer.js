import { useCallback, useEffect, useState } from 'react';
import { getSpotifyPlayer, getCurrentDeviceId, subscribe, reconnectPlayer } from '../spotify/player';

export function useSpotifyPlayer() {
  const [player, setPlayer] = useState(null);
  const [deviceId, setDeviceId] = useState(getCurrentDeviceId());
  const [ready, setReady] = useState(Boolean(getCurrentDeviceId()));
  const [error, setError] = useState(null);
  const [state, setState] = useState(null);
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    let alive = true;

    const unsubReady = subscribe('ready', id => {
      if (!alive) return;
      setDeviceId(id);
      setReady(true);
      setError(null);
    });

    const unsubNotReady = subscribe('not_ready', () => {
      if (!alive) return;
      setReady(false);
    });

    const unsubError = subscribe('error', message => {
      if (alive) setError(message);
    });

    const unsubPlayback = subscribe('playback_error', message => {
      if (alive) setError(message);
    });

    const unsubState = subscribe('state', s => {
      if (alive) setState(s);
    });

    getSpotifyPlayer()
      .then(({ player: p, deviceId: id }) => {
        if (!alive) return;
        setPlayer(p);
        if (id) {
          setDeviceId(id);
          setReady(true);
        }
      })
      .catch(e => {
        if (alive) {
          setReady(false);
          setError(e.message);
        }
      });

    return () => {
      alive = false;
      unsubReady();
      unsubNotReady();
      unsubError();
      unsubPlayback();
      unsubState();
    };
  }, []);

  const reconnect = useCallback(async () => {
    setReconnecting(true);
    setReady(false);
    setError(null);

    try {
      const { player: p, deviceId: id } = await reconnectPlayer();
      setPlayer(p);
      setDeviceId(id);
      setReady(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setReconnecting(false);
    }
  }, []);

  return { player, deviceId, ready, error, state, reconnecting, reconnect };
}
