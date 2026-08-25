import { useCallback, useEffect, useRef, useState } from 'react';
import { SNIPPET_DURATIONS, LAST_STAGE } from '../game/stages';
import { createShuffledDeck, getPlayableTracks } from '../game/songSelector';
import { isCorrectGuess } from '../utils/normalizeAnswer';
import {
  playSnippet,
  preloadTrack,
  stopPlayback,
  stopFullTrackPlayback,
} from '../spotify/playback';

export function useGame(tracks) {
  const [gameTrack, setGameTrack] = useState(null);
  const [stage, setStage] = useState(0);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [guess, setGuess] = useState('');
  const [result, setResult] = useState(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [roundNumber, setRoundNumber] = useState(1);

  const requestRef = useRef(0);
  const unplayedDeckRef = useRef([]); // Shuffled deck of unplayed tracks for fair non-repeating selection
  const playedHistoryRef = useRef([]); // Tracks played in current cycle
  const preloadQueueRef = useRef([]); // Preloaded audio buffer in RAM
  const unplayableTrackIdsRef = useRef(new Set());
  const lastPlayedTrackIdRef = useRef(null);

  // Draws a track from the shuffled deck, creating a fresh deck when exhausted
  const drawNextFromDeck = useCallback((tracksList = tracks) => {
    const playable = getPlayableTracks(tracksList).filter(t => t?.id && !unplayableTrackIdsRef.current.has(t.id));
    if (!playable.length) return null;

    // If deck is empty, recreate and reshuffle
    if (!unplayedDeckRef.current.length) {
      unplayedDeckRef.current = createShuffledDeck(
        tracksList,
        unplayableTrackIdsRef.current,
        lastPlayedTrackIdRef.current
      );
      playedHistoryRef.current = [];
    }

    let candidate = unplayedDeckRef.current.shift();
    while (candidate && unplayableTrackIdsRef.current.has(candidate.id)) {
      candidate = unplayedDeckRef.current.shift();
    }

    if (!candidate && playable.length > 0) {
      unplayedDeckRef.current = createShuffledDeck(
        tracksList,
        unplayableTrackIdsRef.current,
        lastPlayedTrackIdRef.current
      );
      candidate = unplayedDeckRef.current.shift();
    }

    return candidate || null;
  }, [tracks]);

  // Fill the preload queue with up to 2 tracks ahead of time in background
  const replenishQueue = useCallback((tracksList = tracks, depth = 0) => {
    if (!tracksList || tracksList.length === 0 || depth > 5) return;

    while (preloadQueueRef.current.length < 2) {
      const candidate = drawNextFromDeck(tracksList);
      if (!candidate) break;

      preloadQueueRef.current.push(candidate);
      preloadTrack(candidate.uri).then((ok) => {
        if (!ok) {
          // Track is unplayable (e.g. 404 geo-restricted) - blacklist and discard
          unplayableTrackIdsRef.current.add(candidate.id);
          preloadQueueRef.current = preloadQueueRef.current.filter(t => t.id !== candidate.id);
          replenishQueue(tracksList, depth + 1);
        }
      });
    }
  }, [tracks, drawNextFromDeck]);

  // Initial setup when playlist tracks change
  useEffect(() => {
    unplayableTrackIdsRef.current = new Set();
    playedHistoryRef.current = [];
    preloadQueueRef.current = [];
    lastPlayedTrackIdRef.current = null;
    setRoundNumber(1);

    if (tracks?.length) {
      unplayedDeckRef.current = createShuffledDeck(tracks, unplayableTrackIdsRef.current);
      replenishQueue(tracks);
    } else {
      unplayedDeckRef.current = [];
    }
  }, [tracks, replenishQueue]);

  const getNextTrack = useCallback(() => {
    let next = preloadQueueRef.current.shift();
    while (next && unplayableTrackIdsRef.current.has(next.id)) {
      next = preloadQueueRef.current.shift();
    }

    if (!next) {
      next = drawNextFromDeck(tracks);
    }

    if (next) {
      lastPlayedTrackIdRef.current = next.id;
      playedHistoryRef.current.push(next.id);
    }

    // Keep the preload buffer full
    replenishQueue(tracks);
    return next;
  }, [tracks, drawNextFromDeck, replenishQueue]);

  const play = useCallback(async (track, targetStage, retryCount = 0) => {
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

        if (retryCount >= 3) {
          setStatus('idle');
          setError('Multiple tracks failed to play. Please choose another playlist.');
          return;
        }

        const next = getNextTrack();
        if (next && next.id !== track?.id) {
          setGameTrack(next);
          setStage(0);
          setGuess('');
          setResult(null);
          play(next, 0, retryCount + 1);
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
    setRoundNumber(1);

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

  const submitGuess = useCallback(async (guessInput = null) => {
    const guessValue = guessInput || guess;

    if (!gameTrack) {
      return;
    }

    let isCorrect = false;

    // 1. Direct object / ID match (when selected from search dropdown)
    if (guessValue && typeof guessValue === 'object') {
      if (
        (guessValue.id && gameTrack.id && guessValue.id === gameTrack.id) ||
        (guessValue.uri && gameTrack.uri && guessValue.uri === gameTrack.uri)
      ) {
        isCorrect = true;
      } else if (guessValue.name) {
        isCorrect = isCorrectGuess(guessValue.name, gameTrack);
      }
    } else if (typeof guessValue === 'string' && guessValue.trim()) {
      // 2. String text match (when typed or submitted as text)
      isCorrect = isCorrectGuess(guessValue.trim(), gameTrack);
    }

    if (isCorrect) {
      ++requestRef.current;
      stopFullTrackPlayback();
      stopPlayback();

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
  }, [gameTrack, guess, stage]);

  const stop = useCallback(async () => {
    ++requestRef.current;
    stopPlayback().catch(() => {});
    setStatus('paused');
  }, []);

  const nextRound = useCallback(async () => {
    stopFullTrackPlayback();
    stopPlayback();

    const track = getNextTrack();

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
    setRoundNumber(r => r + 1);

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
    setRoundNumber(1);
    setError(null);
    preloadQueueRef.current = [];
    playedHistoryRef.current = [];
    unplayableTrackIdsRef.current = new Set();
    lastPlayedTrackIdRef.current = null;

    if (tracks?.length) {
      unplayedDeckRef.current = createShuffledDeck(tracks, unplayableTrackIdsRef.current);
      replenishQueue(tracks);
    }
  }, [tracks, replenishQueue]);

  const totalPlayableTracks = getPlayableTracks(tracks).length;

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
    roundNumber,
    totalPlayableTracks,
    start,
    replay,
    skip,
    submitGuess,
    stop,
    nextRound,
    reset
  };
}
