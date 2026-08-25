/**
 * Filters and validates playable Spotify track items.
 *
 * @param {Array} tracks - Raw track objects
 * @returns {Array} - Cleaned track objects
 */
export function getPlayableTracks(tracks) {
  if (!Array.isArray(tracks)) return [];
  return tracks
    .filter(track => track && track.name && (track.uri || track.id) && !track.is_local)
    .map(track => {
      if (!track.uri && track.id) {
        return { ...track, uri: `spotify:track:${track.id}` };
      }
      return track;
    });
}

/**
 * Fisher-Yates (Knuth) in-place shuffle returning a new array copy.
 *
 * @param {Array} array
 * @returns {Array} - New shuffled array
 */
export function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Creates a freshly shuffled deck of playable tracks.
 * Guarantees that every song in the deck will be played once before any song repeats.
 *
 * @param {Array} tracks - All playlist tracks
 * @param {Set} excludedIds - Set of unplayable / blacklisted track IDs
 * @param {string|null} lastTrackId - ID of the last played track to avoid back-to-back duplicate across deck resets
 * @returns {Array} - Shuffled deck
 */
export function createShuffledDeck(tracks, excludedIds = new Set(), lastTrackId = null) {
  const playable = getPlayableTracks(tracks).filter(t => t?.id && !excludedIds.has(t.id));
  if (!playable.length) return [];

  const shuffled = shuffleArray(playable);

  // If the first song in the newly shuffled deck is the same as the last played song, swap it
  if (shuffled.length > 1 && lastTrackId && shuffled[0].id === lastTrackId) {
    const swapIdx = 1 + Math.floor(Math.random() * (shuffled.length - 1));
    [shuffled[0], shuffled[swapIdx]] = [shuffled[swapIdx], shuffled[0]];
  }

  return shuffled;
}

/**
 * Fallback random track picker (for standalone pick needs).
 */
export function pickRandomTrack(tracks, excludedIds = new Set()) {
  const playable = getPlayableTracks(tracks).filter(t => t?.id && !excludedIds.has(t.id));
  if (!playable.length) return null;
  return playable[Math.floor(Math.random() * playable.length)];
}
