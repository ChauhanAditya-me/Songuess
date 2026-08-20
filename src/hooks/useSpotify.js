import { useEffect, useState } from 'react';
import { getProfile, getPlaylists, getPlaylistTracks } from '../spotify/api';
import { getAccessToken } from '../spotify/auth';

export function useSpotify() {
  const [profile, setProfile] = useState(null);
  const [playlists, setPlaylists] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!getAccessToken()) return;
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
      .catch(e => setError(e.message));
  }, []);

  async function loadPlaylist(playlist) {
    setSelectedPlaylist(playlist);
    setTracks([]);
    setLoadingTracks(true);
    setError(null);
    try { setTracks(await getPlaylistTracks(playlist.id)); }
    catch (e) { setError(e.message); }
    finally { setLoadingTracks(false); }
  }

  function loadCustomTracks(name, trackList) {
    setSelectedPlaylist({ name, id: 'custom' });
    setTracks(trackList);
    setLoadingTracks(false);
    setError(null);
  }

  function resetPlaylist() {
    setSelectedPlaylist(null);
    setTracks([]);
  }

  return { profile, playlists, tracks, selectedPlaylist, loadingTracks, error, loadPlaylist, loadCustomTracks, resetPlaylist };
}
