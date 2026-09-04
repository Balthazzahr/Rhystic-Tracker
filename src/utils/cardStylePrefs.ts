// Persisted card-style (printing) preference per card name. When the user picks
// a specific set/art in the card viewer or sets default art, we remember it
// in both SQLite and localStorage so the entire application shows the same printing.
import { invoke } from '@tauri-apps/api/core';

export interface CardPrintingRef {
  setCode: string;
  collectorNumber: string;
  grpId?: number | null;
}

const KEY = 'rhysticCardStylePrefs_v1';

let inMemoryCache: Record<string, CardPrintingRef> | null = null;

function loadLocalStorage(): Record<string, CardPrintingRef> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

function saveLocalStorage(map: Record<string, CardPrintingRef>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // ignore quota errors
  }
}

// Asynchronously load preferences from SQLite database into memory cache
export async function initCardStylePrefs(): Promise<void> {
  try {
    const fromDb = await invoke<Record<string, [string, string, number | null]>>('get_preferred_prints');
    const map: Record<string, CardPrintingRef> = {};
    for (const [name, [setCode, collectorNumber, grpId]] of Object.entries(fromDb)) {
      map[name] = { setCode, collectorNumber, grpId };
    }
    // Also merge with localStorage if any
    const local = loadLocalStorage();
    for (const [name, pref] of Object.entries(local)) {
      if (!map[name]) {
        map[name] = pref;
        // Backfill to SQLite in background
        invoke('set_preferred_print', {
          cardName: name,
          setCode: pref.setCode,
          collectorNumber: pref.collectorNumber,
          grpId: pref.grpId || null,
        }).catch(() => {});
      }
    }
    inMemoryCache = map;
    saveLocalStorage(map);
  } catch (e) {
    inMemoryCache = loadLocalStorage();
  }
}

// Trigger initial load immediately
initCardStylePrefs().catch(() => {});

export function getCardStylePref(name: string): CardPrintingRef | null {
  if (inMemoryCache) {
    return inMemoryCache[name] || null;
  }
  const m = loadLocalStorage();
  return m[name] || null;
}

export function setCardStylePref(name: string, ref: CardPrintingRef) {
  if (!inMemoryCache) {
    inMemoryCache = loadLocalStorage();
  }
  inMemoryCache[name] = ref;
  saveLocalStorage(inMemoryCache);

  // Async persist to SQLite
  invoke('set_preferred_print', {
    cardName: name,
    setCode: ref.setCode,
    collectorNumber: ref.collectorNumber,
    grpId: ref.grpId || null,
  }).catch((err) => console.error('Failed to set preferred print in SQLite:', err));

  window.dispatchEvent(new CustomEvent('rhystic-card-style-changed', {
    detail: { name, setCode: ref.setCode, collectorNumber: ref.collectorNumber }
  }));
}

export function clearCardStylePref(name: string) {
  if (!inMemoryCache) {
    inMemoryCache = loadLocalStorage();
  }
  delete inMemoryCache[name];
  saveLocalStorage(inMemoryCache);

  // Async clear from SQLite
  invoke('clear_preferred_print', { cardName: name })
    .catch((err) => console.error('Failed to clear preferred print in SQLite:', err));

  window.dispatchEvent(new CustomEvent('rhystic-card-style-changed', {
    detail: { name, setCode: null, collectorNumber: null }
  }));
}
