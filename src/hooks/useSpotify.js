import { useEffect, useState } from 'react';
import { getProfile, getPlaylists, getPlaylistTracks } from '../spotify/api';
import { fetchPublicPlaylist } from '../spotify/playback';
import { isAuthenticated } from '../spotify/auth';

export function useSpotify() {
  const [profile, setProfile] = useState(null);
  const [playlists, setPlaylists] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [loading, setLoading] = useState(isAuthenticated());
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isAuthenticated()) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    Promise.all([getProfile(), getPlaylists()])
      .then(([p, lists]) => {
        setProfile(p);
        const likedItem = {
          id: '__liked__',
          name: 'Liked Songs',
          isLiked: true,
          owner: { display_name: p.display_name || 'You' },
          images: [{ url: 'https://misc.scdn.co/liked-songs/liked-songs-640.png' }],
        };
        setPlaylists([likedItem, ...(lists || [])]);
      })
      .catch(e => {
        console.warn('Failed to load Spotify profile/playlists:', e);
        setProfile(null);
        setError(e.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  async function loadPlaylist(playlist) {
    setSelectedPlaylist(playlist);
    setTracks([]);
    setLoadingTracks(true);
    setError(null);
    try {
      setTracks(await getPlaylistTracks(playlist.id));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingTracks(false);
    }
  }

  async function loadPublicPlaylist(urlOrId) {
    setTracks([]);
    setLoadingTracks(true);
    setError(null);
    try {
      const data = await fetchPublicPlaylist(urlOrId);
      if (!data?.tracks || data.tracks.length === 0) {
        throw new Error('No playable tracks found in this playlist.');
      }
      setSelectedPlaylist({
        id: data.id || 'public-playlist',
        name: data.name || 'Public Playlist',
        isGuest: true,
        images: data.images || [],
      });
      setTracks(data.tracks);
      return data;
    } catch (e) {
      setError(e.message || 'Failed to load public playlist.');
      throw e;
    } finally {
      setLoadingTracks(false);
    }
  }

  function loadCustomTracks(name, trackList, images = []) {
    setSelectedPlaylist({ name, id: 'custom', isGuest: true, images });
    setTracks(trackList);
    setLoadingTracks(false);
    setError(null);
  }

  function resetPlaylist() {
    setSelectedPlaylist(null);
    setTracks([]);
    setError(null);
  }

  return {
    profile,
    playlists,
    tracks,
    selectedPlaylist,
    loading,
    loadingTracks,
    error,
    loadPlaylist,
    loadPublicPlaylist,
    loadCustomTracks,
    resetPlaylist,
  };
}
