import React, { useEffect, useRef, useState } from 'react';

// Scryfall image URL cache, persisted to localStorage so each card name is only
// resolved through the rate-limited `named?exact` endpoint once ever. After a
// successful resolve the direct cards.scryfall.io URL is reused, which loads
// from CDN without hitting the API rate limit.
const CACHE_KEY = 'rhysticCardImageCache_v1';

function loadCache(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveCache(cache: Record<string, string>) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore quota errors
  }
}

// Resolve the direct CDN image URL for a card name via Scryfall's named search
// (JSON, not the image redirect). Cache the result keyed by name + version.
export async function resolveCardImageUrl(name: string, version: 'art_crop' | 'normal' = 'art_crop'): Promise<string | null> {
  const key = `${version}:${name}`;
  const cache = loadCache();
  if (cache[key]) return cache[key];

  try {
    const resp = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=json`);
    if (!resp.ok) return null;
    const data = await resp.json();
    const uris = data.image_uris;
    const url = uris?.[version] || uris?.normal || null;
    if (url) {
      cache[key] = url;
      saveCache(cache);
    }
    return url;
  } catch {
    return null;
  }
}

interface CardImageProps {
  name: string;
  version?: 'art_crop' | 'normal';
  className?: string;
  style?: React.CSSProperties;
  alt?: string;
  onClick?: (e: React.MouseEvent) => void;
}

/**
 * <img> that resolves and caches the direct Scryfall CDN image URL for a card
 * name, avoiding repeated rate-limited `named?exact` image requests. Retries
 * with backoff when the CDN fetch fails transiently.
 */
export function CardImage({ name, version = 'art_crop', className, style, alt, onClick }: CardImageProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const attemptRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    attemptRef.current = 0;
    setSrc(null);
    setFailed(false);

    const key = `${version}:${name}`;
    const cache = loadCache();
    if (cache[key]) {
      setSrc(cache[key]);
      return;
    }

    let cancelled = false;
    const tryResolve = async (delayMs = 0) => {
      await new Promise((r) => setTimeout(r, delayMs));
      if (cancelled || !mountedRef.current) return;
      const url = await resolveCardImageUrl(name, version);
      if (cancelled || !mountedRef.current) return;
      if (url) {
        setSrc(url);
      } else if (attemptRef.current < 3) {
        attemptRef.current += 1;
        tryResolve(1200 * attemptRef.current);
      } else {
        setFailed(true);
      }
    };
    tryResolve();
    return () => { cancelled = true; mountedRef.current = false; };
  }, [name, version]);

  if (failed) {
    return <div className={className} style={{ ...style, backgroundColor: '#0B0C10' }} />;
  }
  if (!src) {
    return <div className={className} style={{ ...style, backgroundColor: '#0B0C10' }} />;
  }
  return (
    <img
      src={src}
      alt={alt || name}
      className={className}
      style={style}
      onClick={onClick}
      loading="lazy"
      onError={() => {
        // Direct CDN URL failed; clear it so a re-render retries resolution.
        if (mountedRef.current && attemptRef.current < 3) {
          attemptRef.current += 1;
          const key = `${version}:${name}`;
          const cache = loadCache();
          delete cache[key];
          saveCache(cache);
          setSrc(null);
          setTimeout(() => resolveCardImageUrl(name, version).then((u) => {
            if (mountedRef.current && u) setSrc(u);
          }), 1200 * attemptRef.current);
        }
      }}
    />
  );
}

export default CardImage;
