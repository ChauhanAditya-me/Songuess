export function getPlayableTracks(tracks) {
  return tracks.filter(track => track?.type === 'track' && track?.uri);
}

export function pickRandomTrack(tracks) {
  const playable = getPlayableTracks(tracks);
  if (!playable.length) return null;
  return playable[Math.floor(Math.random() * playable.length)];
}
