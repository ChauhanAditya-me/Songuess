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
  const [streak, setStreak] = useState(0);

  const requestRef = useRef(0);
  const preloadQueueRef = useRef([]); // Buffer of preloaded tracks ready in RAM
  const playedTrackIdsRef = useRef(new Set());
  const unplayableTrackIdsRef = useRef(new Set());

  // Fill the preload queue with 2 tracks ahead of time in background
  const replenishQueue = useCallback((tracksList = tracks) => {
    if (!tracksList || tracksList.length === 0) return;

    // Filter out known unplayable tracks
    const playableCandidates = tracksList.filter(t => t?.id && !unplayableTrackIdsRef.current.has(t.id));
    if (!playableCandidates.length) return;

    while (preloadQueueRef.current.length < 2) {
      // Pick a track not recently played
      let candidate = pickRandomTrack(playableCandidates);
      for (let i = 0; i < 6 && (playedTrackIdsRef.current.has(candidate?.id) || preloadQueueRef.current.some(t => t.id === candidate?.id)); i++) {
        candidate = pickRandomTrack(playableCandidates);
      }
      if (!candidate) candidate = pickRandomTrack(playableCandidates);
      if (!candidate) break;

      preloadQueueRef.current.push(candidate);
      preloadTrack(candidate.uri).then((ok) => {
        if (!ok) {
          // Track is unplayable on Spotify (e.g. 404 geo-restricted) - discard & blacklist
          unplayableTrackIdsRef.current.add(candidate.id);
          preloadQueueRef.current = preloadQueueRef.current.filter(t => t.id !== candidate.id);
          replenishQueue(playableCandidates);
        }
      });
    }
  }, [tracks]);

  // Initial fill when playlist changes
  useEffect(() => {
    preloadQueueRef.current = [];
    playedTrackIdsRef.current = new Set();
    unplayableTrackIdsRef.current = new Set();
    if (tracks?.length) {
      replenishQueue(tracks);
    }
  }, [tracks, replenishQueue]);

  const getNextTrack = useCallback(() => {
    let next = preloadQueueRef.current.shift();
    while (next && unplayableTrackIdsRef.current.has(next.id)) {
      next = preloadQueueRef.current.shift();
    }
    if (!next) {
      const playable = tracks?.filter(t => t?.id && !unplayableTrackIdsRef.current.has(t.id));
      next = pickRandomTrack(playable?.length ? playable : tracks);
    }
    if (next) {
      playedTrackIdsRef.current.add(next.id);
      if (playedTrackIdsRef.current.size > 25) {
        const oldest = playedTrackIdsRef.current.values().next().value;
        playedTrackIdsRef.current.delete(oldest);
      }
    }
    // Replenish the background queue immediately
    replenishQueue(tracks);
    return next;
  }, [tracks, replenishQueue]);

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
        console.warn(`[Game] Track ${track?.name} failed to load (${e.message}). Skipping unplayable track...`);
        if (track?.id) {
          unplayableTrackIdsRef.current.add(track.id);
        }
        const next = getNextTrack();
        if (next && next.id !== track?.id) {
          setGameTrack(next);
          setStage(0);
          setGuess('');
          setResult(null);
          play(next, 0);
        } else {
          setStatus('idle');
          setError('Could not find playable tracks in this playlist.');
        }
      }
    }
  }, [getNextTrack]);

  const start = useCallback(async () => {
    const track = getNextTrack();

    if (!track) {
      setError('No playable tracks found.');
      return;
    }

    setGameTrack(track);
    setStage(0);
    setGuess('');
    setResult(null);

    await play(track, 0);
  }, [getNextTrack, play]);

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
      setStreak(0);
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
      setStreak(s => s + 1);
      setResult('correct');
      setStatus('correct');
      setGuess('');
    } else {
      setResult('wrong');
    }
  }, [gameTrack, guess, status, stage]);

  const stop = useCallback(async () => {
    ++requestRef.current;
    stopPlayback().catch(() => {});
    setStatus('paused');
  }, []);

  const nextRound = useCallback(async () => {
    const requestId = ++requestRef.current;
    await stopPlayback();

    const track = getNextTrack();

    if (!track) {
      setGameTrack(null);
      setError('No playable tracks found.');
      setStatus('idle');
      return;
    }

    if (requestId !== requestRef.current) return;

    setGameTrack(track);
    setStage(0);
    setGuess('');
    setResult(null);

    await play(track, 0);
  }, [getNextTrack, play]);

  const reset = useCallback(async () => {
    ++requestRef.current;
    await stopPlayback();

    setGameTrack(null);
    setStage(0);
    setStatus('idle');
    setResult(null);
    setGuess('');
    setScore(0);
    setStreak(0);
    setError(null);
    preloadQueueRef.current = [];
    if (tracks?.length) {
      replenishQueue(tracks);
    }
  }, [tracks, replenishQueue]);

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
    streak,
    start,
    replay,
    skip,
    submitGuess,
    stop,
    nextRound,
    reset
  };
}
