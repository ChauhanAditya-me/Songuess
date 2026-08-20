import { useCallback, useEffect, useRef, useState } from 'react';
import { SNIPPET_DURATIONS, LAST_STAGE } from '../game/stages';
import { pickRandomTrack } from '../game/songSelector';
import { isCorrectGuess } from '../utils/normalizeAnswer';
import {
  playSnippet,
  preloadTrack,
  stopPlayback,
  isAudioServerOnline,
} from '../spotify/playback';

export function useGame(tracks, playerReady) {
  const [gameTrack, setGameTrack] = useState(null);
  const [stage, setStage] = useState(0);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [guess, setGuess] = useState('');
  const [result, setResult] = useState(null);
  const [score, setScore] = useState(0);

  const requestRef = useRef(0);
  const preparedTrackRef = useRef(null);
  const preloadPromiseRef = useRef(null);

  // Keep one track prepared while the user is looking at the playlist.
  // The first Start can therefore skip most of Spotify's track-loading delay.
  useEffect(() => {
    let cancelled = false;

    if (!tracks?.length) return;

    const track = pickRandomTrack(tracks);
    if (!track) return;

    preparedTrackRef.current = track;

    preloadPromiseRef.current = preloadTrack(track.uri)
      .catch(() => null)
      .finally(() => {
        if (!cancelled) {
          preloadPromiseRef.current = null;
        }
      });

    return () => {
      cancelled = true;
    };
  }, [tracks]);

  const prepareNext = useCallback((excludeId = null) => {
    if (!tracks?.length) return null;

    let track = pickRandomTrack(tracks);

    for (let i = 0; i < 5 && track?.id === excludeId; i++) {
      track = pickRandomTrack(tracks);
    }

    if (!track) return null;

    preparedTrackRef.current = track;

    preloadPromiseRef.current = preloadTrack(track.uri)
      .catch(() => null)
      .finally(() => {
        preloadPromiseRef.current = null;
      });

    return track;
  }, [tracks]);

  const play = useCallback(async (track, targetStage) => {
    const requestId = ++requestRef.current;

    setError(null);
    setStatus('loading');
    setResult(null);

    try {
      await playSnippet(
        track.uri,
        SNIPPET_DURATIONS[targetStage],
        () => requestId === requestRef.current,
        () => {
          if (requestId === requestRef.current) {
            setStatus('playing');
          }
        }
      );

      if (requestId === requestRef.current) {
        setStatus('paused');
      }
    } catch (e) {
      if (requestId === requestRef.current) {
        setStatus('idle');
        setError(e.message);
      }
    }
  }, []);

  const start = useCallback(async () => {
    if (!playerReady) {
      const serverOnline = await isAudioServerOnline();
      if (!serverOnline) {
        setError('Connecting to audio engine, please try again in a moment...');
        return;
      }
    }

    let track = preparedTrackRef.current;

    if (!track) {
      track = pickRandomTrack(tracks);
    }

    if (!track) {
      setError('No playable tracks found.');
      return;
    }

    // If the preloader is still finishing, wait for it briefly rather than blocking indefinitely
    if (preloadPromiseRef.current) {
      await Promise.race([
        preloadPromiseRef.current,
        new Promise(r => setTimeout(r, 1500))
      ]);
    }

    setGameTrack(track);
    setStage(0);
    setGuess('');
    setResult(null);

    await play(track, 0);

    // Immediately prepare another candidate for the next round.
    prepareNext(track.id);
  }, [tracks, playerReady, play, prepareNext]);

  const replay = useCallback(async () => {
    if (!gameTrack) return;
    await play(gameTrack, stage);
  }, [gameTrack, stage, play]);

  const skip = useCallback(async () => {
    if (!gameTrack) return;

    if (stage >= LAST_STAGE) {
      ++requestRef.current;
      setResult('gave_up');
      setStatus('gave_up');
      stopPlayback().catch(() => {});
      return;
    }

    const nextStage = stage + 1;
    setStage(nextStage);

    await play(gameTrack, nextStage);
  }, [gameTrack, stage, play]);

  const [guessedSeconds, setGuessedSeconds] = useState(0);

  const submitGuess = useCallback(async (customGuessText = null) => {
    const guessText = customGuessText || guess;

    if (!gameTrack || !['playing', 'paused', 'loading'].includes(status)) {
      return;
    }

    if (isCorrectGuess(guessText, gameTrack)) {
      ++requestRef.current;
      stopPlayback().catch(() => {});

      const wonAtSeconds = SNIPPET_DURATIONS[stage];
      setGuessedSeconds(wonAtSeconds);
      setScore(score => score + 1000);
      setResult('correct');
      setStatus('correct');
      setGuess('');

      prepareNext(gameTrack.id);
    } else {
      setResult('wrong');
    }
  }, [gameTrack, guess, status, stage, prepareNext]);

  const stop = useCallback(async () => {
    ++requestRef.current;
    stopPlayback().catch(() => {});
    setStatus('paused');
  }, []);

  const nextRound = useCallback(async () => {
    const requestId = ++requestRef.current;
    stopPlayback().catch(() => {});

    let track = preparedTrackRef.current;

    if (!track || track.id === gameTrack?.id) {
      track = pickRandomTrack(tracks);
    }

    if (!track) {
      setGameTrack(null);
      setError('No playable tracks found.');
      setStatus('idle');
      return;
    }

    if (preloadPromiseRef.current) {
      await Promise.race([
        preloadPromiseRef.current,
        new Promise(r => setTimeout(r, 1500))
      ]);
    }

    if (requestId !== requestRef.current) return;

    setGameTrack(track);
    setStage(0);
    setGuess('');
    setResult(null);

    await play(track, 0);

    prepareNext(track.id);
  }, [tracks, gameTrack, play, prepareNext]);

  const reset = useCallback(async () => {
    ++requestRef.current;
    await stopPlayback();

    setGameTrack(null);
    setStage(0);
    setStatus('idle');
    setResult(null);
    setGuess('');
    setScore(0);
    setError(null);

    preparedTrackRef.current = null;
    preloadPromiseRef.current = null;
  }, []);

  return {
    gameTrack,
    stage,
    snippetSeconds: SNIPPET_DURATIONS[stage],
    guessedSeconds: guessedSeconds || SNIPPET_DURATIONS[stage],
    status,
    error,
    guess,
    setGuess,
    result,
    score,
    start,
    replay,
    skip,
    submitGuess,
    stop,
    nextRound,
    reset
  };
}
