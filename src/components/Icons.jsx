import React from 'react';

export function SpotifyIcon({ size = 24, color = '#000000', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} className={className}>
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.495 17.306c-.216.353-.674.467-1.027.25-2.812-1.718-6.351-2.107-10.52-1.155-.403.092-.803-.16-.895-.563-.092-.403.16-.803.563-.895 4.571-1.044 8.492-.599 11.629 1.336.353.217.467.674.25 1.027zm1.465-3.26c-.272.443-.853.585-1.296.313-3.218-1.977-8.124-2.55-11.93-1.394-.499.151-1.029-.134-1.18-.633-.151-.499.134-1.029.633-1.18 4.352-1.321 9.774-.682 13.46 1.598.443.272.585.853.313 1.296zm.126-3.41c-3.858-2.291-10.222-2.502-13.889-1.39-.59.179-1.218-.16-1.397-.75-.179-.59.16-1.218.75-1.397 4.218-1.28 11.246-1.037 15.69 1.601.53.315.703 1.002.388 1.532-.315.53-1.002.703-1.532.388z" />
    </svg>
  );
}

export function PlayIcon({ size = 28, color = '#000000', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} className={className}>
      <polygon points="7 4 20 12 7 20 7 4" />
    </svg>
  );
}

export function PauseIcon({ size = 28, color = '#000000', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} className={className}>
      <rect x="6" y="4" width="4" height="16" rx="1.5" />
      <rect x="14" y="4" width="4" height="16" rx="1.5" />
    </svg>
  );
}

export function SkipIcon({ size = 18, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polygon points="5 4 15 12 5 20 5 4" fill="currentColor" stroke="none" />
      <line x1="19" y1="5" x2="19" y2="19" />
    </svg>
  );
}

export function SearchIcon({ size = 18, color = '#888888', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="11" cy="11" r="7.5" />
      <line x1="21" y1="21" x2="16.5" y2="16.5" />
    </svg>
  );
}

export function LogoutIcon({ size = 18, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
