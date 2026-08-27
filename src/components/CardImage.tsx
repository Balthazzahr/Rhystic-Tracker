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

function cleanCardNameForScryfall(name: string): string {
  if (!name) return '';
  return name.trim();
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

    // Fallback 1: named?exact resolution
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
    } catch {
      // Fall through to split card / double face fallback
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

export function RhysticIcon({ className = 'w-4 h-4', style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 2048 2048"
      className={className}
      style={style}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Rhystic Tracker Icon"
    >
      <path d="M 689.00,1319.00 C 686.94,1312.77 685.50,1301.79 684.41,1295.00 684.41,1295.00 677.58,1255.00 677.58,1255.00 677.58,1255.00 651.92,1104.00 651.92,1104.00 651.92,1104.00 580.92,679.00 580.92,679.00 580.92,679.00 556.92,537.00 556.92,537.00 556.92,537.00 551.34,499.00 551.34,499.00 551.34,485.17 556.06,469.30 564.04,458.00 581.06,433.92 603.62,431.40 630.00,425.79 630.00,425.79 706.00,409.20 706.00,409.20 706.00,409.20 792.00,390.42 792.00,390.42 792.00,390.42 957.00,354.58 957.00,354.58 957.00,354.58 1050.00,334.20 1050.00,334.20 1050.00,334.20 1127.00,317.35 1127.00,317.35 1148.18,312.55 1165.59,307.09 1187.00,315.46 1204.34,322.24 1218.52,335.67 1225.55,353.00 1230.10,364.22 1232.25,378.96 1234.42,391.00 1234.42,391.00 1242.00,433.00 1242.00,433.00 1230.58,432.47 1186.26,421.56 1172.00,418.42 1172.00,418.42 1039.00,389.79 1039.00,389.79 1024.86,386.79 990.56,378.15 978.00,378.00 978.00,378.00 969.00,378.00 969.00,378.00 927.58,378.20 887.04,410.47 870.31,447.00 862.46,464.13 859.33,486.35 855.60,505.00 855.60,505.00 835.58,604.00 835.58,604.00 835.58,604.00 826.00,651.00 826.00,651.00 826.00,651.00 793.20,813.00 793.20,813.00 793.20,813.00 732.60,1112.00 732.60,1112.00 732.60,1112.00 703.40,1257.00 703.40,1257.00 703.40,1257.00 695.00,1298.00 695.00,1298.00 693.71,1304.43 692.76,1313.72 689.00,1319.00 Z M 1402.00,564.00 C 1405.94,554.91 1415.03,540.45 1420.67,532.00 1464.82,465.80 1530.33,435.54 1606.00,420.40 1619.77,417.64 1645.47,413.16 1659.00,413.00 1659.00,413.00 1679.00,412.00 1679.00,412.00 1697.39,411.97 1715.96,412.37 1734.00,416.21 1743.62,418.26 1752.26,420.30 1758.15,429.00 1763.74,437.26 1763.11,447.50 1763.00,457.00 1762.90,465.27 1759.30,484.43 1757.42,493.00 1751.99,517.76 1746.37,536.28 1737.42,560.00 1700.60,657.60 1632.92,746.28 1539.00,794.74 1508.38,810.54 1476.24,821.34 1443.00,830.12 1443.00,830.12 1403.00,840.58 1403.00,840.58 1396.46,842.45 1387.65,844.52 1382.00,848.00 1413.80,861.48 1449.09,863.29 1483.00,858.72 1483.00,858.72 1519.00,851.00 1519.00,851.00 1518.03,860.39 1508.09,877.29 1503.30,886.00 1490.23,909.81 1475.99,933.11 1459.88,955.00 1408.09,1025.37 1349.32,1081.88 1268.00,1116.57 1240.54,1128.29 1211.75,1137.58 1183.00,1145.58 1183.00,1145.58 1134.00,1160.00 1134.00,1160.00 1134.00,1160.00 1154.00,1165.53 1154.00,1165.53 1164.98,1168.26 1175.79,1169.32 1187.00,1170.09 1187.00,1170.09 1197.00,1171.00 1197.00,1171.00 1213.29,1171.19 1233.09,1169.13 1249.00,1165.58 1249.00,1165.58 1272.00,1159.00 1272.00,1159.00 1268.76,1165.05 1263.71,1169.91 1259.16,1175.00 1249.03,1186.35 1239.50,1195.23 1228.00,1205.13 1179.40,1246.96 1121.55,1275.47 1060.00,1292.58 1039.46,1298.29 1018.03,1302.60 997.00,1306.08 990.92,1307.09 973.20,1308.31 969.18,1311.51 966.30,1313.81 959.46,1325.20 957.05,1329.00 957.05,1329.00 932.40,1370.00 932.40,1370.00 932.40,1370.00 907.80,1411.00 907.80,1411.00 907.80,1411.00 892.93,1438.00 892.93,1438.00 889.39,1447.00 884.39,1474.33 882.39,1485.00 877.73,1509.91 873.82,1535.73 872.00,1561.00 872.00,1561.00 872.00,1569.00 872.00,1569.00 872.00,1569.00 871.00,1580.00 871.00,1580.00 871.00,1580.00 870.00,1609.00 870.00,1609.00 869.99,1612.21 870.18,1616.04 868.69,1618.96 866.06,1624.09 851.60,1630.72 846.00,1633.77 824.04,1645.71 803.45,1660.36 784.00,1676.00 767.17,1689.54 752.24,1704.76 737.00,1720.00 729.25,1727.75 723.57,1736.71 712.00,1737.00 714.22,1729.20 720.49,1719.22 724.58,1712.00 724.58,1712.00 741.72,1681.00 741.72,1681.00 741.72,1681.00 770.58,1630.00 770.58,1630.00 770.58,1630.00 785.09,1605.10 785.09,1605.10 789.12,1599.78 793.49,1600.02 799.00,1597.48 803.93,1595.22 807.75,1591.65 810.52,1587.00 819.98,1571.16 807.66,1549.82 789.00,1551.10 786.19,1551.29 782.51,1552.30 780.00,1553.56 777.57,1554.78 775.96,1556.16 774.02,1558.04 768.52,1563.37 766.20,1568.35 766.01,1576.00 765.81,1584.55 768.70,1589.64 764.63,1598.00 764.63,1598.00 757.30,1611.00 757.30,1611.00 757.30,1611.00 736.42,1648.00 736.42,1648.00 736.42,1648.00 693.00,1726.00 693.00,1726.00 685.14,1721.68 689.41,1711.08 691.13,1704.00 691.13,1704.00 704.25,1639.00 704.25,1639.00 704.25,1639.00 710.00,1582.00 710.00,1582.00 710.00,1582.00 711.00,1558.00 711.00,1558.00 711.00,1558.00 710.00,1545.00 710.00,1545.00 709.96,1541.07 709.55,1533.42 711.31,1530.09 713.28,1526.38 719.38,1523.37 723.00,1521.20 723.00,1521.20 748.00,1505.14 748.00,1505.14 775.70,1485.32 801.61,1463.84 827.00,1441.16 827.00,1441.16 851.96,1418.00 851.96,1418.00 859.47,1410.11 874.66,1382.90 881.20,1372.00 881.20,1372.00 932.69,1289.00 932.69,1289.00 986.14,1206.02 1043.15,1124.97 1102.37,1046.00 1175.26,948.82 1259.18,847.68 1343.04,760.00 1343.04,760.00 1363.99,739.00 1363.99,739.00 1363.99,739.00 1375.00,727.00 1375.00,727.00 1375.00,727.00 1417.00,685.96 1417.00,685.96 1417.00,685.96 1438.00,665.04 1438.00,665.04 1438.00,665.04 1480.00,626.17 1480.00,626.17 1480.00,626.17 1525.00,586.16 1525.00,586.16 1525.00,586.16 1552.00,562.00 1552.00,562.00 1535.58,569.08 1505.17,590.95 1490.00,602.12 1454.04,628.58 1419.68,656.43 1386.00,685.72 1312.93,749.26 1245.79,819.38 1181.85,892.00 1133.89,946.47 1087.43,1002.95 1043.87,1061.00 1004.80,1113.08 966.45,1165.82 930.33,1220.00 930.33,1220.00 899.69,1266.00 899.69,1266.00 895.91,1271.87 889.88,1283.90 884.00,1287.00 859.20,1212.61 854.68,1135.02 879.67,1060.00 884.89,1044.32 890.36,1029.83 897.75,1015.00 900.88,1008.73 904.00,1000.90 909.00,996.00 909.00,996.00 909.91,1009.00 909.91,1009.00 912.24,1042.89 918.82,1083.35 940.00,1111.00 940.00,1066.46 938.74,1023.92 948.42,980.00 954.22,953.70 963.45,926.22 975.26,902.00 998.66,854.00 1038.38,806.70 1073.84,767.00 1073.84,767.00 1105.01,733.00 1105.01,733.00 1105.01,733.00 1131.00,707.99 1131.00,707.99 1138.70,700.47 1155.64,683.99 1165.00,680.00 1165.00,680.00 1163.08,691.00 1163.08,691.00 1163.08,691.00 1160.28,710.00 1160.28,710.00 1160.28,710.00 1159.00,745.00 1159.00,745.00 1159.01,754.02 1161.42,771.23 1163.73,780.00 1163.73,780.00 1169.00,798.00 1169.00,798.00 1169.00,798.00 1171.00,798.00 1171.00,798.00 1171.00,798.00 1177.63,774.00 1177.63,774.00 1194.90,705.77 1215.28,649.19 1265.09,597.01 1265.09,597.01 1274.00,588.91 1274.00,588.91 1295.85,568.59 1317.81,551.92 1343.00,535.95 1343.00,535.95 1384.00,512.14 1384.00,512.14 1391.17,508.16 1402.53,501.13 1410.00,499.00 1410.00,499.00 1405.23,517.00 1405.23,517.00 1403.02,526.35 1401.79,535.47 1400.83,545.00 1400.15,551.80 1398.64,557.63 1402.00,564.00 Z" />
    </svg>
  );
}

export function OrbitSpinner({ className = 'w-full h-full max-w-[36px] max-h-[36px]' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center p-0.5 pointer-events-none select-none ${className}`}>
      <svg viewBox="0 0 100 100" className="w-full h-full block" role="img" aria-label="Loading...">
        <defs>
          <linearGradient id="orb-g1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#C084FC" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.7" />
          </linearGradient>
          <linearGradient id="orb-g2" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#C084FC" stopOpacity="0.65" />
          </linearGradient>
        </defs>

        {/* Prominent guide rings */}
        <g fill="none" stroke="#FFFFFF" strokeOpacity="0.22">
          <circle cx="50" cy="50" r="38" strokeWidth="1.2" />
          <circle cx="50" cy="50" r="26" strokeWidth="1" />
          <circle cx="50" cy="50" r="14" strokeWidth="0.8" />
        </g>

        {/* Outer rotating arc */}
        <g>
          <circle
            cx="50"
            cy="50"
            r="38"
            fill="none"
            stroke="url(#orb-g1)"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray="80 160"
          />
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 50 50"
            to="360 50 50"
            dur="4s"
            repeatCount="indefinite"
          />
        </g>

        {/* Mid counter-rotating arc */}
        <g>
          <circle
            cx="50"
            cy="50"
            r="26"
            fill="none"
            stroke="url(#orb-g2)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="55 110"
          />
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="360 50 50"
            to="0 50 50"
            dur="2.5s"
            repeatCount="indefinite"
          />
        </g>

        {/* Inner fast arc */}
        <g>
          <circle
            cx="50"
            cy="50"
            r="14"
            fill="none"
            stroke="url(#orb-g1)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="28 60"
          />
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 50 50"
            to="360 50 50"
            dur="1.4s"
            repeatCount="indefinite"
          />
        </g>

        {/* Bright shimmer dash on outer ring */}
        <g>
          <circle
            cx="50"
            cy="50"
            r="38"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="2"
            strokeLinecap="round"
            strokeOpacity="0.85"
            strokeDasharray="12 228"
          />
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 50 50"
            to="360 50 50"
            dur="1.8s"
            repeatCount="indefinite"
          />
        </g>

        {/* Core pulsing dot */}
        <circle cx="50" cy="50" r="3" fill="#C084FC" fillOpacity="1">
          <animate
            attributeName="r"
            values="2.2;3.8;2.2"
            dur="1.6s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="fill-opacity"
            values="0.7;1;0.7"
            dur="1.6s"
            repeatCount="indefinite"
          />
        </circle>
      </svg>
    </div>
  );
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
 * Scryfall. Shows an orbital spinner while loading.
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
      ) : failed ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-2 text-center bg-neutral-950 border border-white/10 select-none">
          <div className={`${version === 'normal' ? 'w-10 h-10 mb-2' : 'w-4 h-4'} text-neutral-500/70 flex items-center justify-center`}>
            <RhysticIcon className="w-full h-full" />
          </div>
          {version === 'normal' && (
            <>
              <span className="text-xs font-bold text-neutral-300 line-clamp-2 leading-tight">{name}</span>
              <span className="text-[9px] font-mono uppercase tracking-wider text-neutral-500 font-semibold mt-1">Card Art Missing</span>
            </>
          )}
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 p-2">
          <OrbitSpinner className={`w-full h-full ${version === 'normal' ? 'max-w-[84px] max-h-[84px]' : 'max-w-[32px] max-h-[32px]'}`} />
        </div>
      )}
    </div>
  );
}

export default CardImage;
