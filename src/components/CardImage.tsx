import React, { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';

// --- Local image cache ------------------------------------------------------
// Card images are downloaded once and stored under
// ~/.config/rhystic-tracker/cardimg/. On later renders the local file is used
// directly (via convertFileSrc), so Scryfall's API is never hit again.

// Normalize MTGA set codes to Scryfall set codes (e.g. DAR -> DOM)
function normalizeScryfallSetCode(code?: string | null): string {
  if (!code) return '';
  const c = code.trim().toLowerCase();
  if (c === 'dar') return 'dom';
  if (c === 'arenasup') return 'spg';
  if (c === 'conf') return 'con';
  return c;
}

// Clean MTGA raw collector number strings (e.g. "'16'" -> "16", "0" -> "")
function cleanCollectorNumber(cn?: string | number | null): string {
  if (cn === undefined || cn === null) return '';
  const s = String(cn).replace(/['"]/g, '').trim();
  return (s === '' || s === '0') ? '' : s;
}

// A printing is only usable for a direct /cards/{set}/{collector} URL when it
// has a real collector number.
function hasValidCollector(cn?: string | number | null): boolean {
  return cleanCollectorNumber(cn) !== '';
}

// Concurrency queue for downloading uncached images from Scryfall.
// Scryfall allows up to 10 req/s. Running with concurrency of 4 and 100ms spacing
// downloads a 20-card page in ~1.5s instead of 30+ seconds.
const MAX_CONCURRENT_DOWNLOADS = 4;
let activeDownloads = 0;
const downloadQueue: (() => void)[] = [];

function enqueueDownload<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const runner = async () => {
      activeDownloads++;
      try {
        const res = await task();
        resolve(res);
      } catch (err) {
        reject(err);
      } finally {
        activeDownloads--;
        // Small interval before next download in this slot
        setTimeout(() => {
          if (downloadQueue.length > 0) {
            const next = downloadQueue.shift();
            if (next) next();
          }
        }, 80);
      }
    };

    if (activeDownloads < MAX_CONCURRENT_DOWNLOADS) {
      runner();
    } else {
      downloadQueue.push(runner);
    }
  });
}

async function fetchImageBlob(url: string): Promise<Blob> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.blob();
}

function blobToBytes(blob: Blob): Promise<Uint8Array> {
  return blob.arrayBuffer().then((buf) => new Uint8Array(buf));
}

// In-memory LRU cache of resolved local file URLs. Caps memory usage to at most
// 120 active image entries (e.g. current page + neighbor pages) to prevent
// WebKit bitmap memory leaks when browsing hundreds of cards.
const MAX_SRC_CACHE = 120;
class LruMap<K, V> {
  private max: number;
  private map: Map<K, V>;

  constructor(max: number) {
    this.max = max;
    this.map = new Map();
  }

  get(key: K): V | undefined {
    const val = this.map.get(key);
    if (val !== undefined) {
      this.map.delete(key);
      this.map.set(key, val);
    }
    return val;
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  set(key: K, val: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.max) {
      const firstKey = this.map.keys().next().value;
      if (firstKey !== undefined) this.map.delete(firstKey);
    }
    this.map.set(key, val);
  }
}

const srcCache = new LruMap<string, string>(MAX_SRC_CACHE);

// Optional image compression via offscreen HTML5 Canvas before writing to disk
async function compressImageBlob(blob: Blob, quality = 0.80): Promise<Uint8Array> {
  // If the blob is already small (< 25 KB), don't waste CPU compressing
  if (blob.size < 25 * 1024) {
    return blobToBytes(blob);
  }

  try {
    const imgBitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = imgBitmap.width;
    canvas.height = imgBitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      imgBitmap.close();
      return blobToBytes(blob);
    }
    ctx.drawImage(imgBitmap, 0, 0);
    imgBitmap.close();

    const compressedBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/webp', quality);
    });

    if (compressedBlob && compressedBlob.size > 0 && compressedBlob.size < blob.size) {
      return blobToBytes(compressedBlob);
    }
  } catch (e) {
    // Fall back to original bytes on any canvas error
  }
  return blobToBytes(blob);
}

// Resolve the direct CDN URL, download the bytes, cache to disk, and return
// the local file path (for convertFileSrc).
// When a specific printing (set_code + collector_number) is given, use that
// printing's image; if that fails/404s, fall back to the default named?exact resolution.
async function ensureLocalImage(
  name: string,
  version: 'art_crop' | 'normal' | 'small',
  printing?: { setCode?: string | null; collectorNumber?: string | null },
): Promise<string | null> {
  const normSet = normalizeScryfallSetCode(printing?.setCode);
  const cleanCn = cleanCollectorNumber(printing?.collectorNumber);
  const cacheName = normSet && cleanCn
    ? `${name}|${normSet}|${cleanCn}`
    : name;

  // 1. Already cached locally on disk? (Immediate IPC check, outside any download queue)
  try {
    const cached = await invoke<string | null>('has_card_image', { name: cacheName, version });
    if (cached) {
      const url = convertFileSrc(cached);
      srcCache.set(`${version}:${cacheName}`, url);
      srcCache.set(`${version}:${name}`, url);
      return url;
    }
  } catch { /* fall through */ }

  // 2. Resolve + download via the parallel download pool.
  return enqueueDownload(async () => {
    // Try printing-specific URL first if available
    if (normSet && cleanCn) {
      try {
        const printingUrl = `https://api.scryfall.com/cards/${encodeURIComponent(normSet)}/${encodeURIComponent(cleanCn)}?format=image&version=${version}`;
        const blob = await fetchImageBlob(printingUrl);
        const bytes = await compressImageBlob(blob);
        if (bytes.length > 500) {
          const path = await invoke<string>('save_card_image', { name: cacheName, version, data: Array.from(bytes) });
          const url = convertFileSrc(path);
          srcCache.set(`${version}:${cacheName}`, url);
          return url;
        }
      } catch {
        // Fall through to named lookup
      }
    }

    // Fallback: named?exact resolution
    try {
      const namedUrl = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=${version}`;
      const blob = await fetchImageBlob(namedUrl);
      const bytes = await compressImageBlob(blob);
      if (bytes.length > 500) {
        const path = await invoke<string>('save_card_image', { name: cacheName, version, data: Array.from(bytes) });
        const url = convertFileSrc(path);
        srcCache.set(`${version}:${cacheName}`, url);
        srcCache.set(`${version}:${name}`, url);
        return url;
      }
      return null;
    } catch {
      return null;
    }
  });
}

interface CardImageProps {
  name: string;
  version?: 'art_crop' | 'normal' | 'small';
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
export function CardImage({ name, version = 'art_crop', printing, className, style, alt, onClick }: CardImageProps) {
  const normSet = normalizeScryfallSetCode(printing?.setCode);
  const cleanCn = cleanCollectorNumber(printing?.collectorNumber);
  const cacheName = normSet && cleanCn ? `${name}|${normSet}|${cleanCn}` : name;
  const cacheKey = `${version}:${cacheName}`;
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

    setSrc(null);
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
