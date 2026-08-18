import React, { useEffect, useMemo, useRef, useState } from 'react';

function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function SongSearch({ tracks, value, onChange, onSelect }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef(null);

  const results = useMemo(() => {
    const query = normalize(value);

    if (!query) return [];

    const words = query.split(' ');

    return tracks
      .map(track => {
        const title = normalize(track.name || '');
        const artists = normalize(
          track.artists?.map(a => a.name).join(' ') || ''
        );

        const text = `${title} ${artists}`;

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
    if (!results.length) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(index =>
        index < results.length - 1 ? index + 1 : 0
      );
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(index =>
        index > 0 ? index - 1 : results.length - 1
      );
    }

    if (event.key === 'Enter') {
      event.preventDefault();

      const track = results[activeIndex];

      if (track) {
        onSelect(track);
        setOpen(false);
      }
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
        placeholder="Search for a song..."
        autoComplete="off"
      />

      {open && value && results.length > 0 && (
        <div className="song-search-results">
          {results.map((track, index) => (
            <button
              type="button"
              className={`song-search-result ${
                index === activeIndex ? 'active' : ''
              }`}
              key={track.id}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => selectTrack(track)}
            >
              <span className="song-search-icon">🎵</span>

              <span className="song-search-info">
                <strong>{track.name}</strong>

                <small>
                  {track.artists?.map(a => a.name).join(', ')}
                </small>
              </span>
            </button>
          ))}
        </div>
      )}

      {open && value && results.length === 0 && (
        <div className="song-search-empty">
          No songs found
        </div>
      )}
    </div>
  );
}