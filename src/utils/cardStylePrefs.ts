// Persisted card-style (printing) preference per card name. When the user picks
// a specific set/art in the card viewer, we remember it so the main Collection
// grid shows the same printing.

export interface CardPrintingRef {
  setCode: string;
  collectorNumber: string;
}

const KEY = 'rhysticCardStylePrefs_v1';

function load(): Record<string, CardPrintingRef> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

function save(map: Record<string, CardPrintingRef>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // ignore quota errors
  }
}

export function getCardStylePref(name: string): CardPrintingRef | null {
  const m = load();
  return m[name] || null;
}

export function setCardStylePref(name: string, ref: CardPrintingRef) {
  const m = load();
  m[name] = ref;
  save(m);
}

export function clearCardStylePref(name: string) {
  const m = load();
  delete m[name];
  save(m);
}
