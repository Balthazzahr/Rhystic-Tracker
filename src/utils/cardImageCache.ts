import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';

// Normalize MTGA set codes to Scryfall set codes (e.g. DAR -> DOM)
export function normalizeScryfallSetCode(code?: string | null): string {
  if (!code) return '';
  const c = code.trim().toLowerCase();
  if (c === 'dar') return 'dom';
  if (c === 'arenasup') return 'spg';
  if (c === 'conf') return 'con';
  return c;
}

// Clean MTGA raw collector number strings (e.g. "'16'" -> "16", "0" -> "")
export function cleanCollectorNumber(cn?: string | number | null): string {
  if (cn === undefined || cn === null) return '';
  const s = String(cn).replace(/['"]/g, '').trim();
  return (s === '' || s === '0') ? '' : s;
}

// A printing is only usable for a direct /cards/{set}/{collector} URL when it
// has a real collector number.
export function hasValidCollector(cn?: string | number | null): boolean {
  return cleanCollectorNumber(cn) !== '';
}

// Concurrency queue for downloading uncached images from Scryfall.
// Scryfall allows up to 10 req/s. Running with concurrency of 3 and 100ms spacing
// ensures smooth downloads without 429 rate limit triggers.
const MAX_CONCURRENT_DOWNLOADS = 3;
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
        setTimeout(() => {
          if (downloadQueue.length > 0) {
            const next = downloadQueue.shift();
            if (next) next();
          }
        }, 100);
      }
    };

    if (activeDownloads < MAX_CONCURRENT_DOWNLOADS) {
      runner();
    } else {
      downloadQueue.push(runner);
    }
  });
}

async function fetchImageBlob(url: string, retries = 2, delayMs = 300): Promise<Blob> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(url);
      if (resp.status === 429) {
        // Scryfall rate limit hit — back off and retry
        await new Promise((r) => setTimeout(r, delayMs * (attempt + 1) * 2));
        continue;
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.blob();
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
    }
  }
  throw new Error(`Failed to fetch image after retries: ${url}`);
}

export function cleanCardName(name?: string | null): string {
  if (!name) return '';
  return name.replace(/<[^>]+>/g, '').trim();
}

export function cleanCardNameForScryfall(name: string): string {
  return cleanCardName(name);
}

function blobToBytes(blob: Blob): Promise<Uint8Array> {
  return blob.arrayBuffer().then((buf) => new Uint8Array(buf));
}

// In-memory LRU cache of resolved local file URLs. Caps memory usage to at most
// 120 active image entries (e.g. current page + neighbor pages) to prevent
// WebKit bitmap memory leaks when browsing hundreds of cards.
const MAX_SRC_CACHE = 120;
export class LruMap<K, V> {
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

export const srcCache = new LruMap<string, string>(MAX_SRC_CACHE);

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
export async function ensureLocalImage(
  name: string,
  version: 'art_crop' | 'normal' | 'small',
  printing?: { setCode?: string | null; collectorNumber?: string | null },
): Promise<string | null> {
  const normSet = normalizeScryfallSetCode(printing?.setCode);
  const cleanCn = cleanCollectorNumber(printing?.collectorNumber);
  const cleanName = cleanCardNameForScryfall(name);
  const cacheName = normSet && cleanCn
    ? `${cleanName}|${normSet}|${cleanCn}`
    : cleanName;

  // 1. Already cached locally on disk? (Immediate IPC check, outside any download queue)
  try {
    const cached = await invoke<string | null>('has_card_image', { name: cacheName, version });
    if (cached) {
      const url = convertFileSrc(cached);
      srcCache.set(`${version}:${cacheName}`, url);
      srcCache.set(`${version}:${cleanName}`, url);
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
          srcCache.set(`${version}:${cleanName}`, url);
          return url;
        }
      } catch {
        // Fall through to named lookup
      }
    }

    // Fallback 1: named?exact resolution (with set constraint if normSet provided)
    try {
      const setParam = normSet ? `&set=${encodeURIComponent(normSet)}` : '';
      const namedUrl = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cleanName)}${setParam}&format=image&version=${version}`;
      const blob = await fetchImageBlob(namedUrl);
      const bytes = await compressImageBlob(blob);
      if (bytes.length > 500) {
        const path = await invoke<string>('save_card_image', { name: cacheName, version, data: Array.from(bytes) });
        const url = convertFileSrc(path);
        srcCache.set(`${version}:${cacheName}`, url);
        srcCache.set(`${version}:${cleanName}`, url);
        return url;
      }
    } catch {
      // Fall through to unconstrained named lookup if set-constrained lookup failed
      if (normSet) {
        try {
          const namedUrl = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cleanName)}&format=image&version=${version}`;
          const blob = await fetchImageBlob(namedUrl);
          const bytes = await compressImageBlob(blob);
          if (bytes.length > 500) {
            const path = await invoke<string>('save_card_image', { name: cacheName, version, data: Array.from(bytes) });
            const url = convertFileSrc(path);
            srcCache.set(`${version}:${cacheName}`, url);
            srcCache.set(`${version}:${cleanName}`, url);
            return url;
          }
        } catch { /* fall through */ }
      }
    }

    // Fallback 2: If card name has double-face slash " // ", try front face
    if (cleanName.includes(' // ')) {
      const frontName = cleanName.split(' // ')[0].trim();
      try {
        const namedUrl = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(frontName)}&format=image&version=${version}`;
        const blob = await fetchImageBlob(namedUrl);
        const bytes = await compressImageBlob(blob);
        if (bytes.length > 500) {
          const path = await invoke<string>('save_card_image', { name: cacheName, version, data: Array.from(bytes) });
          const url = convertFileSrc(path);
          srcCache.set(`${version}:${cacheName}`, url);
          srcCache.set(`${version}:${cleanName}`, url);
          return url;
        }
      } catch {
        // Fall through
      }
    }

    return null;
  });
}
