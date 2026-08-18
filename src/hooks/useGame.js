import { useCallback, useRef, useState } from 'react';
import { SNIPPET_DURATIONS, LAST_STAGE } from '../game/stages';
import { pickRandomTrack } from '../game/songSelector';
import { isCorrectGuess } from '../utils/normalizeAnswer';
import { playSnippet, stopPlayback } from '../spotify/playback';

export function useGame(tracks, playerReady) {
  const [gameTrack, setGameTrack] = useState(null);
  const [stage, setStage] = useState(0);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [guess, setGuess] = useState('');
  const [result, setResult] = useState(null);
  const [score, setScore] = useState(0);

  const requestRef = useRef(0);

  const play = useCallback(async (track, targetStage) => {
    const requestId = ++requestRef.current;

    setError(null);
    setStatus('loading');
    setResult(null);

    try {
      await playSnippet(
        track.uri,
        SNIPPET_DURATIONS[targetStage],
        () => requestId === requestRef.current
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
      setError('Waiting for the Spotify player...');
      return;
    }

    const track = pickRandomTrack(tracks);

    if (!track) {
      setError('No playable tracks found.');
      return;
    }

    setGameTrack(track);
    setStage(0);
    setGuess('');
    setResult(null);

    await play(track, 0);
  }, [tracks, playerReady, play]);

  const replay = useCallback(async () => {
    if (!gameTrack) return;
    await play(gameTrack, stage);
  }, [gameTrack, stage, play]);

  const skip = useCallback(async () => {
    if (!gameTrack) return;

    if (stage >= LAST_STAGE) {
      ++requestRef.current;
      await stopPlayback();
      setResult('gave_up');
      setStatus('gave_up');
      return;
    }

    const nextStage = stage + 1;
    setStage(nextStage);

    await play(gameTrack, nextStage);
  }, [gameTrack, stage, play]);

  const submitGuess = useCallback(async event => {
    event?.preventDefault();

    if (!gameTrack || !['playing', 'paused', 'loading'].includes(status)) {
      return;
    }

    if (isCorrectGuess(guess, gameTrack)) {
      ++requestRef.current;
      await stopPlayback();

      setScore(score => score + 1000);
      setResult('correct');
      setStatus('correct');
      setGuess('');
    } else {
      setResult('wrong');
    }
  }, [gameTrack, guess, status]);

  const stop = useCallback(async () => {
    ++requestRef.current;
    await stopPlayback();
    setStatus('paused');
  }, []);

  const nextRound = useCallback(async () => {
    ++requestRef.current;
    await stopPlayback();

    const track = pickRandomTrack(tracks);

    if (!track) {
      setGameTrack(null);
      setError('No playable tracks found.');
      setStatus('idle');
      return;
    }

    setGameTrack(track);
    setStage(0);
    setGuess('');
    setResult(null);

    await play(track, 0);
  }, [tracks, play]);

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
  }, []);

  return {
    gameTrack,
    stage,
    snippetSeconds: SNIPPET_DURATIONS[stage],
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
