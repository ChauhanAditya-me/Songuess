import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SearchIcon } from './Icons';
import { normalizeAnswer } from '../utils/normalizeAnswer';
import { getCoverUrl } from '../utils/getCoverUrl';

export default function SongSearch({ tracks, value, onChange, onSelect }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef(null);

  const results = useMemo(() => {
    const query = normalizeAnswer(value);

    if (!query) return [];

    const words = query.split(' ');

    return tracks
      .map(track => {
        const title = normalizeAnswer(track.name || '');
        const artists = normalizeAnswer(
          track.artists?.map(a => a.name).join(' ') || ''
        );

        let score = 0;

        if (title === query) score += 100;
        if (title.startsWith(query)) score += 50;
        if (title.includes(query)) score += 30;

        for (const word of words) {
          if (title.includes(word)) score += 10;
          if (artists.includes(word)) score += 5;
        }

        return { track, score };
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(item => item.track);
  }, [tracks, value]);

  useEffect(() => {
    setActiveIndex(0);
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  function handleKeyDown(event) {
    if (event.key === 'ArrowDown' && results.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(index =>
        index < results.length - 1 ? index + 1 : 0
      );
      return;
    }

    if (event.key === 'ArrowUp' && results.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(index =>
        index > 0 ? index - 1 : results.length - 1
      );
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();

      if (results.length > 0) {
        const track = results[activeIndex] || results[0];
        if (track) {
          selectTrack(track);
          return;
        }
      }

      setOpen(false);
      return;
    }

    if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  function selectTrack(track) {
    onSelect(track);
    setOpen(false);
  }

  return (
    <div className="song-search" ref={containerRef}>
      <div className="song-search-field">
        <SearchIcon size={18} color="#777777" className="search-field-icon" />
        <input
          value={value}
          onChange={event => {
            onChange(event.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (value) setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search songs..."
          autoComplete="off"
          spellCheck="false"
        />
      </div>

      {open && value && results.length > 0 && (
        <div className="song-search-results">
          {results.map((track, index) => {
            const cover = getCoverUrl(track);

            return (
              <button
                type="button"
                className={`song-search-result ${
                  index === activeIndex ? 'active' : ''
                }`}
                key={track.id || `${track.name}-${index}`}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevents blur before click
                  selectTrack(track);
                }}
                onClick={() => selectTrack(track)}
              >
                {cover ? (
                  <img src={cover} alt="" className="search-result-thumb" loading="lazy" />
                ) : (
                  <span className="search-result-fallback">🎵</span>
                )}

                <span className="song-search-info">
                  <strong className="search-track-name">{track.name}</strong>
                  <small className="search-track-artists">
                    {track.artists?.map(a => a.name).join(', ')}
                  </small>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {open && value && results.length === 0 && (
        <div className="song-search-empty">
          No matching songs found in playlist
        </div>
      )}
    </div>
  );
}