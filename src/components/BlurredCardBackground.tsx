import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { ensureLocalImage } from '../utils/cardImageCache';

// Module-scoped last pick so it survives across tab navigations
let lastPickedName: string | null = null;

// Locked visual parameters (user-dialed values)
const SATURATE = 0.55;
const BRIGHTNESS = 0.5;
const BASE_OVERLAY_OPACITY = 0.8;
const ACCENT_OVERLAY_OPACITY = 0.04;

const BG_TAB_IDS = [
  'dashboard', 'matches', 'decks', 'collection',
  'achievements', 'leaderboards', 'live', 'settings',
];

interface BlurredCardBackgroundProps {
  deckOverview: any[];
  palette: any;
  activeTab: string;
}

type BgMode = 'random' | 'preset' | 'none';
const BG_MODE_KEY = 'bgMode';
const BG_PRESETS_KEY = 'bgPresets';

function deriveCandidateNames(decks: any[]): string[] {
  const names = new Set<string>();
  for (const d of decks) {
    const primary = d.top_commander_name || d.top_card_name;
    if (primary) names.add(primary);
    if (Array.isArray(d.key_cards)) {
      for (const k of d.key_cards) {
        if (k.name) names.add(k.name);
      }
    }
  }
  return Array.from(names);
}

function pickRandom<T>(arr: T[], exclude: T | null): T | null {
  if (arr.length === 0) return null;
  if (arr.length === 1) return arr[0];
  const candidates = arr.filter((v) => v !== exclude);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// Pre-decode a local image URL so that when attached to an <img> DOM element it paints instantly
async function preloadAndDecodeImage(srcUrl: string): Promise<boolean> {
  try {
    const img = new Image();
    img.src = srcUrl;
    await img.decode();
    return true;
  } catch {
    return false;
  }
}

export const BlurredCardBackground: React.FC<BlurredCardBackgroundProps> = ({
  deckOverview,
  palette,
  activeTab,
}) => {
  // --- Mode & presets (reactive to settings) ---
  const [bgMode, setBgMode] = useState<BgMode>(
    () => (localStorage.getItem(BG_MODE_KEY) as BgMode) || 'random'
  );
  const [bgPresets, setBgPresets] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem(BG_PRESETS_KEY) || '{}'); }
    catch { return {}; }
  });
  const [glassOpacity, setGlassOpacity] = useState<string>(() => {
    return localStorage.getItem('glassOpacity') || 'standard';
  });

  useEffect(() => {
    const handleSettingsChanged = () => {
      setBgMode((localStorage.getItem(BG_MODE_KEY) as BgMode) || 'random');
      try {
        setBgPresets(JSON.parse(localStorage.getItem(BG_PRESETS_KEY) || '{}'));
      } catch {
        setBgPresets({});
      }
      setGlassOpacity(localStorage.getItem('glassOpacity') || 'standard');
    };
    window.addEventListener('rhystic_settings_changed', handleSettingsChanged);
    return () => window.removeEventListener('rhystic_settings_changed', handleSettingsChanged);
  }, []);

  // --- Display state ---
  const [displayed, setDisplayed] = useState<{ url: string; name: string | null } | null>(null);

  // --- Refs ---
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const bgModeRef = useRef(bgMode);
  bgModeRef.current = bgMode;

  const bgPresetsRef = useRef(bgPresets);
  bgPresetsRef.current = bgPresets;

  const pendingRef = useRef<{ url: string; name: string } | null>(null);
  const preparingRef = useRef(false);
  const awaitingRandomRef = useRef(false);
  const presetCacheRef = useRef<Map<string, string>>(new Map()); // cardName -> localUrl
  const presetInFlightRef = useRef<Map<string, Promise<string | null>>>(new Map());

  const candidates = useMemo(
    () => deriveCandidateNames(deckOverview),
    [deckOverview],
  );

  const desiredPreset = useMemo(() => {
    return bgMode === 'preset' ? (bgPresets[activeTab] || null) : null;
  }, [bgMode, bgPresets, activeTab]);

  const swapTo = useCallback((url: string, name: string | null) => {
    setDisplayed({ url, name });
  }, []);

  // Fetch + cache a preset card URL (deduplicates concurrent in-flight requests)
  const resolveAndCachePreset = useCallback(async (presetVal: string): Promise<string | null> => {
    if (presetCacheRef.current.has(presetVal)) {
      return presetCacheRef.current.get(presetVal)!;
    }
    if (presetInFlightRef.current.has(presetVal)) {
      return presetInFlightRef.current.get(presetVal)!;
    }

    const resolvePromise = (async () => {
      try {
        let localUrl: string | null = null;
        if (presetVal.startsWith('custom:')) {
          const filePath = presetVal.slice(7);
          const { convertFileSrc } = await import('@tauri-apps/api/core');
          localUrl = convertFileSrc(filePath);
        } else {
          localUrl = await ensureLocalImage(presetVal, 'art_crop');
        }

        if (!localUrl) return null;
        await preloadAndDecodeImage(localUrl);
        presetCacheRef.current.set(presetVal, localUrl);
        return localUrl;
      } finally {
        presetInFlightRef.current.delete(presetVal);
      }
    })();

    presetInFlightRef.current.set(presetVal, resolvePromise);
    return resolvePromise;
  }, []);

  // Pre-warm random candidate in the background
  const triggerRandomPrepare = useCallback(() => {
    if (bgModeRef.current === 'none') return;
    if (preparingRef.current) return;
    if (pendingRef.current !== null && !awaitingRandomRef.current) return;
    if (candidates.length === 0) return;

    preparingRef.current = true;
    const name = pickRandom(candidates, lastPickedName);
    if (!name) {
      preparingRef.current = false;
      return;
    }

    (async () => {
      try {
        const localUrl = await ensureLocalImage(name, 'art_crop');
        if (!localUrl) return;
        await preloadAndDecodeImage(localUrl);

        lastPickedName = name;
        const prepared = { url: localUrl, name };

        const currentTab = activeTabRef.current;
        const currentMode = bgModeRef.current;
        const currentPresets = bgPresetsRef.current;
        const currentNeedsRandom =
          currentMode === 'random' || (currentMode === 'preset' && !currentPresets[currentTab]);

        if (awaitingRandomRef.current && currentNeedsRandom) {
          awaitingRandomRef.current = false;
          swapTo(prepared.url, prepared.name);
          // Queue up next candidate for future navigation
          setTimeout(() => triggerRandomPrepare(), 50);
        } else {
          pendingRef.current = prepared;
        }
      } finally {
        preparingRef.current = false;
      }
    })();
  }, [candidates, swapTo]);

  // Pre-warm all assigned presets in the background
  const preWarmPresets = useCallback(async () => {
    if (bgModeRef.current !== 'preset') return;
    for (const name of Object.values(bgPresetsRef.current)) {
      if (!name || presetCacheRef.current.has(name)) continue;
      await resolveAndCachePreset(name);
    }
  }, [resolveAndCachePreset]);

  // --- Settings reactivity ---
  useEffect(() => {
    const sync = () => {
      const mode = (localStorage.getItem(BG_MODE_KEY) as BgMode) || 'random';
      setBgMode(mode);
      try {
        setBgPresets(JSON.parse(localStorage.getItem(BG_PRESETS_KEY) || '{}'));
      } catch {
        setBgPresets({});
      }
    };
    window.addEventListener('rhystic_settings_changed', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('rhystic_settings_changed', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  // --- Primary navigation / config layout effect (before paint) ---
  useLayoutEffect(() => {
    if (bgMode === 'none') {
      awaitingRandomRef.current = false;
      setDisplayed(null);
      return;
    }

    // 1. Preset assigned for this tab
    if (desiredPreset) {
      awaitingRandomRef.current = false;
      const cached = presetCacheRef.current.get(desiredPreset);
      if (cached) {
        swapTo(cached, desiredPreset);
        return;
      }

      // Fetch on demand and swap once ready if still on this preset tab
      const target = desiredPreset;
      resolveAndCachePreset(target).then((url) => {
        if (
          url &&
          bgModeRef.current === 'preset' &&
          bgPresetsRef.current[activeTabRef.current] === target
        ) {
          swapTo(url, target);
        }
      });
      return;
    }

    // 2. Random needed (random mode or preset mode unset tab)
    if (pendingRef.current) {
      const p = pendingRef.current;
      pendingRef.current = null;
      awaitingRandomRef.current = false;
      swapTo(p.url, p.name);
      // Immediately pre-warm the next random candidate
      triggerRandomPrepare();
      return;
    }

    // Pending not ready yet (e.g. cold start) — mark awaiting and start prepare
    awaitingRandomRef.current = true;
    triggerRandomPrepare();
  }, [activeTab, bgMode, desiredPreset, swapTo, resolveAndCachePreset, triggerRandomPrepare]);

  // --- Trigger preset pre-warming when mode or presets change ---
  useEffect(() => {
    if (bgMode === 'preset') {
      preWarmPresets();
    }
  }, [bgMode, bgPresets, preWarmPresets]);

  // --- Kick off initial prepare when candidates become available ---
  useEffect(() => {
    if (bgMode !== 'none' && candidates.length > 0 && !pendingRef.current) {
      triggerRandomPrepare();
    }
  }, [bgMode, candidates, triggerRandomPrepare]);

  // --- Prune stale presets from preset cache when presets are modified ---
  useEffect(() => {
    const assigned = new Set(Object.values(bgPresets));
    for (const key of presetCacheRef.current.keys()) {
      if (!assigned.has(key)) {
        presetCacheRef.current.delete(key);
      }
    }
  }, [bgPresets]);

  const opacityConfig = useMemo(() => {
    switch (glassOpacity) {
      case 'subtle':
        return { baseOpacity: 0.65, brightness: 0.50, saturate: 0.65 };
      case 'high':
        return { baseOpacity: 0.88, brightness: 0.35, saturate: 0.40 };
      case 'opaque':
        return { baseOpacity: 0.97, brightness: 0.15, saturate: 0.20 };
      case 'standard':
      default:
        return { baseOpacity: 0.78, brightness: 0.45, saturate: 0.50 };
    }
  }, [glassOpacity]);

  if (bgMode === 'none') return null;

  return (
    <div className="absolute inset-0 pointer-events-none select-none overflow-hidden">
      {displayed && (
        <img
          src={displayed.url}
          alt=""
          className="absolute inset-0 w-full h-full object-cover transition-all duration-300"
          style={{
            objectPosition: 'center 30%',
            filter: `saturate(${opacityConfig.saturate}) brightness(${opacityConfig.brightness})`,
          }}
          draggable={false}
        />
      )}

      <div
        className="absolute inset-0 transition-opacity duration-300"
        style={{ backgroundColor: palette?.base || '#0E0E10', opacity: opacityConfig.baseOpacity }}
      />
      <div
        className="absolute inset-0 transition-opacity duration-300"
        style={{
          backgroundColor: palette?.accent || '#4A7FA3',
          opacity: ACCENT_OVERLAY_OPACITY,
          mixBlendMode: 'screen',
        }}
      />
    </div>
  );
};

export default BlurredCardBackground;

