import React, { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';

// --- Local image cache ------------------------------------------------------
// Card images are downloaded once and stored under
// ~/.config/rhystic-tracker/cardimg/. On later renders the local file is used
// directly (via convertFileSrc), so Scryfall's API is never hit again.

// Global queue: Scryfall's named?exact endpoint is rate limited (~10 req/s),
// so image resolutions are serialized with a small delay between requests to
// stay well under the limit.
let queue: Promise<void> = Promise.resolve();
let inflight = 0;
const MIN_INTERVAL_MS = 150; // >= 6 req/s max, comfortably under the limit

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task);
  // Chain a delay so the next task doesn't start until MIN_INTERVAL_MS later.
  queue = run.then(() => new Promise((r) => setTimeout(r, MIN_INTERVAL_MS)), () => new Promise((r) => setTimeout(r, MIN_INTERVAL_MS)));
  return run;
}

async function fetchImageBlob(url: string): Promise<Blob> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.blob();
}

function blobToBytes(blob: Blob): Promise<Uint8Array> {
  return blob.arrayBuffer().then((buf) => new Uint8Array(buf));
}

// Resolve the direct CDN URL, download the bytes, cache to disk, and return
// the local file path (for convertFileSrc). All rate-limited through the queue.
// When a specific printing (set_code + collector_number) is given, use that
// printing's image instead of the default named?exact resolution.
async function ensureLocalImage(
  name: string,
  version: 'art_crop' | 'normal',
  printing?: { setCode?: string | null; collectorNumber?: string | null },
): Promise<string | null> {
  const cacheName = printing?.setCode && printing.collectorNumber
    ? `${name}|${printing.setCode}|${printing.collectorNumber}`
    : name;
  // 1. Already cached locally? (returns the file path if so)
  try {
    const cached = await invoke<string | null>('has_card_image', { name: cacheName, version });
    if (cached) return convertFileSrc(cached);
  } catch { /* fall through */ }

  // 2. Resolve + download via the shared rate-limited queue.
  return enqueue(async () => {
    try {
      const url = printing?.setCode && printing.collectorNumber
        ? `https://api.scryfall.com/cards/${String(printing.setCode).toLowerCase()}/${encodeURIComponent(String(printing.collectorNumber))}?format=image&version=${version}`
        : `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=${version}`;
      const blob = await fetchImageBlob(url);
      const bytes = await blobToBytes(blob);
      const path = await invoke<string>('save_card_image', { name: cacheName, version, data: Array.from(bytes) });
      return convertFileSrc(path);
    } catch {
      return null;
    }
  });
}

interface CardImageProps {
  name: string;
  version?: 'art_crop' | 'normal';
  printing?: { setCode?: string | null; collectorNumber?: string | null };
  className?: string;
  style?: React.CSSProperties;
  alt?: string;
  onClick?: (e: React.MouseEvent) => void;
}

/**
 * Card image that downloads once, caches locally, and never re-fetches from
 * Scryfall. Shows the card name + a loading spinner until the image is ready,
 * then swaps to the image (name/spinner disappear).
 */
// In-memory cache of resolved local file URLs, keyed by name+version. Lets a
// remounted tile (page change) render its image synchronously instead of
// flashing the spinner again while the IPC/local-file check re-runs.
const srcCache = new Map<string, string>();

export function CardImage({ name, version = 'art_crop', printing, className, style, alt, onClick }: CardImageProps) {
  const printKey = printing?.setCode && printing.collectorNumber
    ? `${printing.setCode}|${printing.collectorNumber}`
    : '';
  const cacheKey = `${version}:${printKey || name}`;
  const [src, setSrc] = useState<string | null>(() => srcCache.get(cacheKey) || null);
  const [failed, setFailed] = useState(false);
  const mountedRef = useRef(true);
  const attemptRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    attemptRef.current = 0;

    if (srcCache.has(cacheKey)) {
      // Already resolved in a previous mount — render immediately.
      const cached = srcCache.get(cacheKey)!;
      setSrc(cached);
      setFailed(false);
      return () => { mountedRef.current = false; };
    }

    let cancelled = false;
    (async () => {
      const url = await ensureLocalImage(name, version, printing);
      if (cancelled || !mountedRef.current) return;
      if (url) {
        srcCache.set(cacheKey, url);
        setSrc(url);
      } else {
        setFailed(true);
      }
    })();

    return () => { cancelled = true; mountedRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, version, cacheKey]);

  // Retry the local-cache check if the file was somehow missing.
  const retry = () => {
    if (attemptRef.current >= 2) return;
    attemptRef.current += 1;
    setFailed(false);
    (async () => {
      const url = await ensureLocalImage(name, version, printing);
      if (mountedRef.current && url) {
        srcCache.set(cacheKey, url);
        setSrc(url);
      } else if (mountedRef.current) setFailed(true);
    })();
  };

  return (
    <div
      className={className}
      style={{ ...style, position: 'relative', overflow: 'hidden' }}
      onClick={onClick}
    >
      {src ? (
        <img
          src={src}
          alt={alt || name}
          className="w-full h-full object-cover"
          onError={retry}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/70">
          {/* Loading spinner */}
          <div
            className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white/90 animate-spin"
            style={{ borderTopColor: '#38BDF8' }}
          />
          {/* Card name while loading */}
          <span
            className="text-[9px] font-mono font-semibold px-1.5 text-center leading-tight"
            style={{ color: failed ? '#F87171' : '#E2E8F0', maxWidth: '100%' }}
          >
            {name}
          </span>
        </div>
      )}
    </div>
  );
}

export default CardImage;
