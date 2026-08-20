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

export function pickRandomTrack(tracks) {
  const playable = getPlayableTracks(tracks);
  if (!playable.length) return null;
  return playable[Math.floor(Math.random() * playable.length)];
}
