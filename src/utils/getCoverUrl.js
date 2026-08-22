const DEFAULT_COVER = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&auto=format&fit=crop&q=80';

/**
 * Resolves the best available cover art URL for a track.
 * Supports Spotify API objects (album.images), librespot CDN images, and direct image/cover URLs.
 *
 * @param {object} track - Spotify track object
 * @returns {string} - Cover image URL
 */
export function getCoverUrl(track) {
  if (!track) return DEFAULT_COVER;

  return (
    track.album?.images?.[0]?.url ||
    track.album?.images?.[1]?.url ||
    track.album?.images?.[2]?.url ||
    track.image_url ||
    track.cover_url ||
    DEFAULT_COVER
  );
}
