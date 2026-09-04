import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle2, XCircle, Layers, X, Upload, Download, Copy, CheckCircle, AlertTriangle, Trash2, Image as ImageIcon, RotateCcw, Search, Sparkles } from 'lucide-react';
import { PieChart, Pie, Cell } from 'recharts';
import { invoke } from '@tauri-apps/api/core';
import { ManaPip } from './ManaPip';
import DeckCardList from './DeckCardList';
import TrueDeckListView from './TrueDeckListView';
import { AchievementBadge } from './AchievementBadge';
import { DeckAchievementsModal } from './DeckAchievementsModal';
import CardImage from './CardImage';
import { ensureLocalImage } from '../utils/cardImageCache';

interface DeckDetailViewProps {
  isOpen: boolean;
  deckName: string;
  detail: any;
  palette: any;
  onBack: () => void;
  onSelectMatch: (matchId: string) => void;
  onViewAll: () => void;
  onDeckListImported?: () => void;
  formatDateShort: (ts: string) => string;
  onShowCard: (card: { name: string; grp_id?: number }, isCommander: boolean) => void;
  onDeleteDeck: (deckName: string) => void;
}

type Tip = { text: string; x: number; y: number };

const formatChipColor = (formatStr?: string) => {
  if (!formatStr) return { bg: '#94A3B818', fg: '#CBD5E1', border: '#94A3B838' };
  const f = formatStr.toLowerCase();
  if (f.includes('brawl') || f.includes('commander')) {
    return { bg: '#4A7FA318', fg: '#7FAAC9', border: '#4A7FA338' };
  } else if (f.includes('standard')) {
    return { bg: '#B8503A18', fg: '#D57C69', border: '#B8503A38' };
  } else if (f.includes('historic')) {
    return { bg: '#4A785618', fg: '#76A382', border: '#4A785638' };
  } else if (f.includes('timeless')) {
    return { bg: '#8a719d18', fg: '#b39ec4', border: '#8a719d38' };
  } else if (f.includes('alchemy')) {
    return { bg: '#D4A23718', fg: '#E2BF6F', border: '#D4A23738' };
  } else if (f.includes('explorer') || f.includes('pioneer')) {
    return { bg: '#5B699418', fg: '#8C9AC4', border: '#5B699438' };
  } else if (f.includes('draft') || f.includes('sealed') || f.includes('limited')) {
    return { bg: '#D4A23718', fg: '#E2BF6F', border: '#D4A23738' };
  } else if (f.includes('bot') || f.includes('sparky')) {
    return { bg: '#3D7D7D18', fg: '#6EA8A8', border: '#3D7D7D38' };
  } else if (f.includes('direct') || f.includes('challenge') || f.includes('friendly')) {
    return { bg: '#B8503A18', fg: '#D57C69', border: '#B8503A38' };
  } else if (f.includes('mwm') || f.includes('midweek')) {
    return { bg: '#9E5B8E18', fg: '#C48EB6', border: '#9E5B8E38' };
  } else if (f.includes('gladiator')) {
    return { bg: '#6E8A4218', fg: '#98B36D', border: '#6E8A4238' };
  }
  return { bg: '#94A3B818', fg: '#CBD5E1', border: '#94A3B838' };
};

function ManaValueHistogram({ bins, palette, onTip }: { bins: number[]; palette: any; onTip: (t: Tip | null) => void }) {
  const labels = ['0', '1', '2', '3', '4', '5', '6', '7', '8+'];
  const startIdx = (bins[0] || 0) > 0 ? 0 : 1;
  const visible = bins.slice(startIdx);
  const visibleLabels = labels.slice(startIdx);
  const max = Math.max(...visible, 1);
  return (
    <div className="relative flex-1 flex flex-col min-h-0 w-full h-full justify-end">
      <div className="absolute top-0 inset-x-0 flex justify-center z-10 pointer-events-none">
        <span className="px-2 py-0.2 border border-white/10 bg-black/60 text-[9px] font-mono uppercase tracking-wider font-bold text-neutral-400">
          Mana Curve
        </span>
      </div>

      <div className="flex-1 flex items-end gap-1.5 min-h-0 pt-6">
        {visible.map((val, i) => (
          <div key={i} className="flex-1 h-full flex flex-col justify-end">
            <div
              className="w-full transition-colors hover:opacity-80 cursor-help"
              style={{
                height: `${Math.max((val / max) * 100, 4)}%`,
                backgroundColor: val > 0 ? (palette?.accent || '#374151') : 'rgba(255,255,255,0.05)',
              }}
              onMouseEnter={(e) => onTip({ text: `CMC ${visibleLabels[i]}: ${val} card${val === 1 ? '' : 's'}`, x: e.clientX, y: e.clientY })}
              onMouseMove={(e) => onTip({ text: `CMC ${visibleLabels[i]}: ${val} card${val === 1 ? '' : 's'}`, x: e.clientX, y: e.clientY })}
              onMouseLeave={() => onTip(null)}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 mt-1.5 shrink-0">
        {visibleLabels.map((l, idx) => (
          <span key={idx} className="flex-1 text-center text-[10px] font-mono text-neutral-500 leading-none">{l}</span>
        ))}
      </div>
    </div>
  );
}

function CardTypeBars({ data, palette, onTip }: { data: { type: string; count: number }[]; palette: any; onTip: (t: Tip | null) => void }) {
  if (!data || data.length === 0) return <div className="text-xs font-mono text-neutral-500">No card type data</div>;
  const max = Math.max(...data.map(d => d.count), 1);
  const barThickness = data.length <= 3 ? 'h-3.5' : data.length <= 5 ? 'h-2.5' : 'h-2';

  return (
    <div className="relative flex-1 flex flex-col min-h-0 w-full h-full justify-center pt-6">
      <div className="absolute top-0 inset-x-0 flex justify-center z-10 pointer-events-none">
        <span className="px-2 py-0.2 border border-white/10 bg-black/60 text-[9px] font-mono uppercase tracking-wider font-bold text-neutral-400">
          Card Types
        </span>
      </div>

      <div className="flex-1 flex flex-col justify-evenly min-h-0 gap-1.5">
        {data.map((d) => (
          <div
            key={d.type}
            className="flex items-center gap-2 group cursor-help py-0.5"
            onMouseEnter={(e) => onTip({ text: `${d.type}: ${d.count} card${d.count === 1 ? '' : 's'}`, x: e.clientX, y: e.clientY })}
            onMouseMove={(e) => onTip({ text: `${d.type}: ${d.count} card${d.count === 1 ? '' : 's'}`, x: e.clientX, y: e.clientY })}
            onMouseLeave={() => onTip(null)}
          >
            <span className="w-24 shrink-0 text-xs font-mono font-bold uppercase truncate text-neutral-400 group-hover:text-white transition-colors">
              {d.type}
            </span>
            <div className={`flex-1 ${barThickness} bg-neutral-900/80 border border-white/10 overflow-hidden`}>
              <div
                className="h-full group-hover:brightness-125 transition-all"
                style={{
                  width: `${(d.count / max) * 100}%`,
                  backgroundColor: palette?.accent || '#374151',
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Exactly mirror the ManaPip default palette colors
const MANA_COLORS: Record<string, string> = {
  W: '#E8E2CC', // Warm Ivory / Parchment
  U: '#4A7FA3', // Steel Sapphire Blue
  B: '#374151', // Traditional Charcoal / Dark Slate
  R: '#B8503A', // Brick / Ember Red
  G: '#4A7856', // Forest Moss Green
  C: '#94A3B8', // Colorless Slate
};

const COLOR_NAMES: Record<string, string> = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green',
  C: 'Colorless',
};

const RADIAN = Math.PI / 180;
function ManaPie({ data, height = 175, onTip }: { data: { color: string; count: number }[]; height?: number; onTip: (t: Tip | null) => void }) {
  if (!data || data.length === 0) return <div className="text-xs font-mono text-neutral-500">No mana data</div>;
  const total = data.reduce((sum, item) => sum + item.count, 0);
  const outerRadius = Math.max(76, Math.min(105, Math.floor((height - 20) / 2)));
  const chartWidth = Math.max(185, outerRadius * 2 + 30);

  return (
    <div className="relative flex items-center justify-center">
      <PieChart width={chartWidth} height={height}>
        <Pie
          data={data}
          dataKey="count"
          nameKey="color"
          cx="50%"
          cy="50%"
          outerRadius={outerRadius}
          paddingAngle={0}
          stroke="none"
          labelLine={false}
          onMouseEnter={(entry: any, index: number, e: any) => {
            const d = data[index] || entry;
            const colorName = COLOR_NAMES[d?.color] || d?.color || 'Color';
            const cnt = d?.count || 0;
            const pct = total > 0 ? Math.round((cnt / total) * 100) : 0;
            onTip({ text: `${colorName}: ${cnt} card${cnt === 1 ? '' : 's'} (${pct}%)`, x: e.clientX, y: e.clientY });
          }}
          onMouseMove={(entry: any, index: number, e: any) => {
            const d = data[index] || entry;
            const colorName = COLOR_NAMES[d?.color] || d?.color || 'Color';
            const cnt = d?.count || 0;
            const pct = total > 0 ? Math.round((cnt / total) * 100) : 0;
            onTip({ text: `${colorName}: ${cnt} card${cnt === 1 ? '' : 's'} (${pct}%)`, x: e.clientX, y: e.clientY });
          }}
          onMouseLeave={() => onTip(null)}
          label={(props: any) => {
            const { cx, cy, midAngle, outerRadius: rRadius, percent, payload } = props;
            if (!payload || percent < 0.04) return null;
            const r = rRadius * 0.62;
            const x = cx + r * Math.cos(-midAngle * RADIAN);
            const y = cy + r * Math.sin(-midAngle * RADIAN);
            const size = Math.max(14, Math.min(26, rRadius * 0.95 * Math.sqrt(percent)));
            return (
              <foreignObject x={x - size / 2} y={y - size / 2} width={size} height={size}>
                <div className="w-full h-full flex items-center justify-center pointer-events-none">
                  <ManaPip symbol={payload.color} size={size} />
                </div>
              </foreignObject>
            );
          }}
        >
          {data.map((d) => <Cell key={d.color} fill={MANA_COLORS[d.color] || '#94A3B8'} />)}
        </Pie>
      </PieChart>
    </div>
  );
}

export function DeckDetailView({
  isOpen,
  deckName,
  detail,
  palette,
  onBack,
  onSelectMatch,
  onViewAll,
  onDeckListImported,
  formatDateShort,
  onShowCard,
  onDeleteDeck,
}: DeckDetailViewProps) {
  const [tip, setTip] = useState<Tip | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const [deckListData, setDeckListData] = useState<any>(null);
  const [deckListStatus, setDeckListStatus] = useState<any>(null);
  const [listMode, setListMode] = useState<'logged' | 'true'>('logged');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [bgImageUrl, setBgImageUrl] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportMode, setExportMode] = useState<'true' | 'logged'>('true');
  const [exportText, setExportText] = useState('');
  const [copied, setCopied] = useState(false);
  const [achievementsModalOpen, setAchievementsModalOpen] = useState(false);

  // Custom Deck Box Cover Art & Background Art Picker State
  const [chooseArtOpen, setChooseArtOpen] = useState(false);
  const [artPickerMode, setArtPickerMode] = useState<'cover' | 'background'>('cover');
  const [artSearch, setArtSearch] = useState('');
  const [deckCardsList, setDeckCardsList] = useState<{ name: string; grp_id?: number; type?: string; mana_cost?: string }[]>([]);
  const [selectedCardArt, setSelectedCardArt] = useState<string | null>(null);
  const [artSaving, setArtSaving] = useState(false);

  useEffect(() => {
    if (!isOpen || !deckName) {
      setBgImageUrl(null);
      setSearchQuery('');
      return;
    }

    let candidateName: string | null = null;
    if (detail?.custom_bg_art_name) {
      candidateName = detail.custom_bg_art_name;
    } else if (detail?.custom_art_name) {
      candidateName = detail.custom_art_name;
    } else if (detail?.commander_name) {
      candidateName = detail.commander_name;
    }

    if (candidateName) {
      ensureLocalImage(candidateName, 'art_crop').then((url) => {
        setBgImageUrl(url);
      });
    } else {
      invoke<any>('get_deck_cards', { deckName })
        .then((res) => {
          if (res?.cards && Array.isArray(res.cards)) {
            const nonLands = res.cards.filter(
              (c: any) =>
                !c.card_type?.toLowerCase().includes('land') &&
                !c.card_type?.toLowerCase().includes('token') &&
                c.name
            );
            if (nonLands.length > 0) {
              const chosen = nonLands[Math.floor(Math.random() * nonLands.length)];
              return ensureLocalImage(chosen.name, 'art_crop');
            } else if (res.cards.length > 0) {
              return ensureLocalImage(res.cards[0].name, 'art_crop');
            }
          }
          return null;
        })
        .then((url) => {
          if (url) setBgImageUrl(url);
        })
        .catch(() => setBgImageUrl(null));
    }
  }, [isOpen, deckName, detail]);

  // If the card style changes for the deck's active background or cover art, refresh background art
  useEffect(() => {
    if (!isOpen || !deckName) return;
    const handleStyleChange = (e: any) => {
      const changedName = e?.detail?.name;
      let candidateName: string | null = null;
      if (detail?.custom_bg_art_name) {
        candidateName = detail.custom_bg_art_name;
      } else if (detail?.custom_art_name) {
        candidateName = detail.custom_art_name;
      } else if (detail?.commander_name) {
        candidateName = detail.commander_name;
      }
      if (
        candidateName &&
        changedName &&
        candidateName.toLowerCase() === changedName.toLowerCase()
      ) {
        ensureLocalImage(candidateName, 'art_crop').then((url) => {
          if (url) setBgImageUrl(url);
        });
      }
    };
    window.addEventListener('rhystic-card-style-changed', handleStyleChange);
    return () => window.removeEventListener('rhystic-card-style-changed', handleStyleChange);
  }, [isOpen, deckName, detail]);

  useEffect(() => {
    if (!chooseArtOpen || !deckName) return;
    let cancelled = false;
    const loadCards = async () => {
      try {
        const cardsRes = await invoke<any>('get_deck_cards', { deckName });
        if (cancelled) return;
        const list: { name: string; grp_id?: number; type?: string; mana_cost?: string }[] = [];
        const seen = new Set<string>();

        if (cardsRes?.commander?.name) {
          seen.add(cardsRes.commander.name);
          list.push({
            name: cardsRes.commander.name,
            grp_id: cardsRes.commander.grp_id,
            type: cardsRes.commander.card_type || 'Commander',
            mana_cost: cardsRes.commander.mana_cost,
          });
        }

        if (Array.isArray(cardsRes?.cards)) {
          cardsRes.cards.forEach((c: any) => {
            if (c?.name && !seen.has(c.name)) {
              seen.add(c.name);
              list.push({
                name: c.name,
                grp_id: c.grp_id,
                type: c.card_type,
                mana_cost: c.mana_cost,
              });
            }
          });
        }

        list.sort((a, b) => a.name.localeCompare(b.name));
        setDeckCardsList(list);
        if (artPickerMode === 'background') {
          setSelectedCardArt(detail?.custom_bg_art_name || '__RANDOM__');
        } else {
          setSelectedCardArt(detail?.custom_art_name || detail?.commander_name || '__DEFAULT__');
        }
      } catch (e) {
        console.error('Failed to load deck cards for art picker:', e);
      }
    };
    loadCards();
    return () => { cancelled = true; };
  }, [chooseArtOpen, deckName, detail, artPickerMode]);

  const openImport = () => {
    setImportResult(null);
    setImportError(null);
    setImportOpen(true);
  };
  const closeImport = () => {
    if (importBusy) return;
    setImportOpen(false);
  };

  const handleImportSubmit = async () => {
    setImportBusy(true);
    setImportError(null);
    try {
      const res = await invoke<any>('save_deck_list', {
        deckName,
        exportText: importText.trim(),
      });
      setImportResult(res);
      onDeckListImported?.();
    } catch (err: any) {
      setImportError(String(err));
    } finally {
      setImportBusy(false);
    }
  };
  const handleSelectArt = async (card: { name: string; grp_id?: number }) => {
    try {
      setArtSaving(true);
      if (artPickerMode === 'cover') {
        await invoke('set_deck_custom_art', {
          deckName,
          cardName: card.name,
          grpId: card.grp_id || null,
        });
      } else {
        await invoke('set_deck_custom_bg_art', {
          deckName,
          cardName: card.name,
          grpId: card.grp_id || null,
        });
      }
      setChooseArtOpen(false);
      if (onDeckListImported) {
        onDeckListImported();
      }
    } catch (e) {
      console.error('Failed to set art:', e);
    } finally {
      setArtSaving(false);
    }
  };

  const handleResetArt = async () => {
    try {
      setArtSaving(true);
      if (artPickerMode === 'cover') {
        await invoke('reset_deck_custom_art', { deckName });
      } else {
        await invoke('reset_deck_custom_bg_art', { deckName });
      }
      setChooseArtOpen(false);
      if (onDeckListImported) {
        onDeckListImported();
      }
    } catch (e) {
      console.error('Failed to reset art:', e);
    } finally {
      setArtSaving(false);
    }
  };

  useEffect(() => {
    if (!exportOpen || !deckName) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await invoke<any>('export_decklist', { deckName, source: exportMode });
        if (!cancelled) {
          setExportText(res?.text || '');
          setCopied(false);
        }
      } catch {
        if (!cancelled) setExportText('');
      }
    };
    load();
    return () => { cancelled = true; };
  }, [exportOpen, exportMode, deckName, importResult]);

  const [chartsReady, setChartsReady] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setChartsReady(false);
      return;
    }
    const timer = setTimeout(() => {
      setChartsReady(true);
    }, 150);
    return () => clearTimeout(timer);
  }, [isOpen, deckName]);

  useEffect(() => {
    if (!isOpen || !deckName || !chartsReady) { setDeckListData(null); setDeckListStatus(null); return; }
    let cancelled = false;
    const load = async () => {
      try {
        const [list, status] = await Promise.all([
          invoke<any>('get_deck_list', { deckName }),
          invoke<any>('get_deck_list_status', { deckName }),
        ]);
        if (cancelled) return;
        setDeckListData(list);
        setDeckListStatus(status);
        setListMode(prev => {
          if (prev === 'logged') return list ? 'true' : 'logged';
          return prev;
        });
      } catch (e) {
        if (!cancelled) { setDeckListData(null); setDeckListStatus(null); }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [isOpen, deckName, chartsReady, importResult]);

  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!isOpen || !deckName) return;
    try {
      window.history.pushState({ deckDetail: deckName }, '');
    } catch (e) {}
    const onPop = () => onBackRef.current();
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
    };
  }, [isOpen, deckName]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (chooseArtOpen) {
          setChooseArtOpen(false);
        } else if (achievementsModalOpen) {
          setAchievementsModalOpen(false);
        } else if (exportOpen) {
          setExportOpen(false);
        } else if (importOpen) {
          if (!importBusy) setImportOpen(false);
        } else {
          onBack();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, chooseArtOpen, achievementsModalOpen, exportOpen, importOpen, importBusy, onBack]);

  if (!isOpen || !detail) return null;

  const winrateNum = parseFloat(detail.winrate) || 0;
  const playTotal = (detail.play?.wins || 0) + (detail.play?.losses || 0);
  const playWinPct = playTotal > 0 ? (detail.play.wins / playTotal) * 100 : 0;
  const drawTotal = (detail.draw?.wins || 0) + (detail.draw?.losses || 0);
  const drawWinPct = drawTotal > 0 ? (detail.draw.wins / drawTotal) * 100 : 0;

  const cardTypeCount = detail.card_types?.length || 0;
  const chartHeight = Math.max(175, cardTypeCount * 28 + 30);

  const winLossBar = (wins: number, losses: number, winPct: number) => {
    const total = wins + losses;
    const winShare = total > 0 ? (wins / total) * 100 : 50;
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px] font-mono font-bold tabular-nums">
          <span className="text-emerald-400/90">{wins}W</span>
          <span className="text-neutral-200">{winPct.toFixed(1)}%</span>
          <span className="text-rose-400/90">{losses}L</span>
        </div>
        <div className="h-1.5 w-full flex border border-white/10 overflow-hidden bg-neutral-900">
          <div className="h-full bg-emerald-500/80" style={{ width: `${winShare}%` }} />
          <div className="h-full bg-rose-500/80" style={{ width: `${100 - winShare}%` }} />
        </div>
      </div>
    );
  };

  return (
    <div 
      onClick={onBack}
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/90 backdrop-blur-2xl animate-fade-in select-none"
      style={{ transform: 'translateZ(0)' }}
    >
      {/* Ambient Background Card Art Crop spanning full window */}
      {bgImageUrl && (
        <img
          src={bgImageUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none z-0 transition-opacity duration-500"
          style={{
            objectPosition: 'center 30%',
            filter: 'saturate(0.60) brightness(0.60)',
          }}
          draggable={false}
        />
      )}

      {/* Ambient darkness layers preserving sharp text contrast and clear background art */}
      <div
        className="absolute inset-0 bg-neutral-950/70 pointer-events-none z-0"
        style={{ mixBlendMode: 'multiply' }}
      />
      <div
        className="absolute inset-0 bg-neutral-950/50 pointer-events-none z-0"
      />

      {/* Floating Close Button in Top-Right */}
      <button
        onClick={onBack}
        className="absolute top-3 right-3 p-1.5 text-neutral-400 hover:text-white border border-white/10 hover:border-white/20 bg-neutral-900/60 hover:bg-neutral-800 transition-colors cursor-pointer z-30"
        title="Close Inspector (Esc)"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Main Inner Container */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[95vw] max-w-[1520px] h-[95vh] max-h-[1150px] flex flex-col min-h-0 relative z-10 select-none gap-4"
      >
        {/* 1. TOP FLOATING UNBOXED HEADER (No bounding border, no dark box) */}
        <div className="shrink-0 space-y-4 px-1 relative z-10">
          <div className="flex items-center justify-between gap-6 flex-wrap pr-10">
            <div className="flex flex-col min-w-0 max-w-[60%] space-y-1.5">
              <div className="flex items-center gap-3 min-w-0 flex-wrap">
                <h2 className="text-2xl sm:text-3xl font-bold font-display uppercase tracking-wide text-white truncate">
                  {detail.deck_name}
                </h2>
                <button
                  onClick={() => onDeleteDeck(detail.deck_name)}
                  className="p-1.5 text-neutral-500 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-colors cursor-pointer shrink-0"
                  title="Delete deck"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {detail.formats && detail.formats.filter((f: string) => !f.toLowerCase().includes('bot')).length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {detail.formats.filter((f: string) => !f.toLowerCase().includes('bot')).map((fmt: string) => {
                    const color = formatChipColor(fmt);
                    return (
                      <span
                        key={fmt}
                        className="text-[10.5px] font-mono font-bold tracking-wider uppercase px-2.5 py-0.5 border"
                        style={{
                          backgroundColor: color.bg,
                          color: color.fg,
                          borderColor: color.border,
                        }}
                      >
                        {fmt}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Commander Preview */}
            {detail.commander_name && (
              <div className="flex items-center gap-3 ml-auto min-w-0">
                <div className="text-right min-w-0">
                  <p className="text-[9.5px] font-mono uppercase text-neutral-400">Commander</p>
                  <button
                    onClick={() => onShowCard({ name: detail.commander_name }, true)}
                    className="text-sm sm:text-base font-semibold font-sans text-white hover:underline truncate block"
                    title="View card"
                  >
                    {detail.commander_name}
                  </button>
                </div>
                <div
                  onClick={() => onShowCard({ name: detail.commander_name }, true)}
                  className="w-14 h-14 border border-white/15 overflow-hidden bg-neutral-900 shrink-0 cursor-pointer shadow hover:border-white/30 transition-colors"
                >
                  <CardImage
                    name={detail.commander_name}
                    version="art_crop"
                    alt={detail.commander_name}
                    className="w-full h-full object-cover hover:scale-105 transition-transform"
                  />
                </div>
              </div>
            )}

            {/* Mana pips */}
            <div className={`flex gap-1.5 shrink-0 ${detail.commander_name ? '' : 'ml-auto'}`}>
              {(detail.colors || []).map((c: string) => <ManaPip key={c} symbol={c} size={32} />)}
              {(detail.colors || []).length === 0 && <ManaPip symbol="C" size={32} />}
            </div>
          </div>

          {/* Row 2: Floating Analytics (Dynamic height and proportional scaling) */}
          <div
            className="grid grid-cols-1 md:grid-cols-[auto_1fr_1fr] gap-6 pt-3 border-t border-white/10 items-center"
            style={{ minHeight: `${chartHeight}px` }}
          >
            {chartsReady ? (
              <>
                <div className="flex items-center justify-center h-full min-h-0">
                  <ManaPie data={detail.mana_distribution || []} height={chartHeight} onTip={setTip} />
                </div>
                <div className="flex flex-col h-full min-h-0" style={{ height: `${chartHeight}px` }}>
                  <ManaValueHistogram bins={detail.mana_curve || [0,0,0,0,0,0,0,0]} palette={palette} onTip={setTip} />
                </div>
                <div className="flex flex-col h-full min-h-0 pr-2" style={{ height: `${chartHeight}px` }}>
                  <CardTypeBars data={detail.card_types || []} palette={palette} onTip={setTip} />
                </div>
              </>
            ) : (
              <div className="col-span-full h-full flex items-center justify-center text-xs font-mono text-neutral-500 uppercase tracking-widest">
                Loading analytics...
              </div>
            )}
          </div>
        </div>

        {/* 2. MAIN WORKSPACE (Unboxed parent, translucent sidebar + translucent decklist table) */}
        <div className="flex-1 flex gap-4 min-h-0 overflow-hidden relative z-10">
          {/* Left sidebar: Translucent box */}
          <div className="w-[320px] shrink-0 border border-white/10 bg-neutral-950/45 backdrop-blur-md p-4 flex flex-col min-h-0 space-y-4 shadow-xl">
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-1">
              {/* Winrate */}
              <div className="border-b border-white/10 pb-3 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-mono uppercase text-neutral-500">Winrate</p>
                  <h3 className="text-2xl font-mono font-bold mt-0.5 tabular-nums" style={{ color: winrateNum >= 50 ? '#34D399' : '#F87171' }}>
                    {detail.winrate}
                  </h3>
                </div>
                <span className="ms ms-ability-duels-renowned text-2xl text-amber-400/70" />
              </div>

              {/* W/L record */}
              <div className="border-b border-white/10 pb-3 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-mono uppercase text-neutral-500">W / L Record</p>
                  <h3 className="text-2xl font-mono font-bold mt-0.5 text-white tabular-nums">
                    {detail.wins} - {detail.losses}
                  </h3>
                </div>
                <span className="ms ms-battle text-2xl text-neutral-500" />
              </div>

              {/* Win rate by position */}
              <div className="border-b border-white/10 pb-3 space-y-2.5">
                <p className="text-[10px] font-mono uppercase text-neutral-400 font-bold">Win Rate by Position</p>
                <div>
                  <p className="text-[10px] font-mono font-bold uppercase text-neutral-500 mb-1">On the Play</p>
                  {winLossBar(detail.play?.wins || 0, detail.play?.losses || 0, playWinPct)}
                </div>
                <div>
                  <p className="text-[10px] font-mono font-bold uppercase text-neutral-500 mb-1">On the Draw</p>
                  {winLossBar(detail.draw?.wins || 0, detail.draw?.losses || 0, drawWinPct)}
                </div>
              </div>

              {/* Top Achievements Summary (Limited to 3 cards, no internal scroll wheel) */}
              {(() => {
                const cleanTopAchievements = (detail.top_card_achievements || []).filter(
                  (ach: any) => !ach.card_name?.toLowerCase().includes('token')
                );

                return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                      <p className="text-[10px] font-mono uppercase text-neutral-400 font-bold">
                        Top Achievements
                      </p>
                      {cleanTopAchievements.length > 0 && (
                        <button
                          onClick={() => setAchievementsModalOpen(true)}
                          className="text-[10px] font-mono font-medium uppercase tracking-wider text-neutral-400 hover:text-white transition-colors cursor-pointer"
                        >
                          View All →
                        </button>
                      )}
                    </div>

                    {cleanTopAchievements.length === 0 ? (
                      <p className="text-xs font-sans italic text-neutral-500 py-1">No achievements earned yet</p>
                    ) : (
                      <div className="space-y-1.5">
                        {cleanTopAchievements.slice(0, 3).map((ach: any, idx: number) => (
                          <div 
                            key={`${ach.grp_id}-${ach.achievement}-${idx}`} 
                            className="flex items-center justify-between gap-2 p-1.5 border border-white/5 bg-white/[0.015] hover:bg-white/[0.05] transition-colors"
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <AchievementBadge
                                title={ach.achievement}
                                tier={ach.tier}
                                count={ach.count}
                                size="sm"
                                showTitle={false}
                                showCount={false}
                              />
                              <div className="min-w-0 flex-1">
                                <button
                                  onClick={() => onShowCard({ name: ach.card_name, grp_id: ach.grp_id }, false)}
                                  className="text-xs font-semibold font-sans truncate block text-left w-full hover:underline leading-tight text-white"
                                  title={ach.card_name}
                                >
                                  {ach.card_name}
                                </button>
                                <span className="text-[10px] font-sans text-neutral-400 block truncate mt-0.5">
                                  {ach.achievement}
                                </span>
                              </div>
                            </div>
                            <span className="text-[10px] font-mono font-bold tabular-nums px-1.5 py-0.2 border border-white/10 bg-black/40 text-neutral-300">
                              {ach.count > 1 ? `×${ach.count}` : '1×'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Recent matches sidebar section */}
            <div className="shrink-0 flex flex-col max-h-[25%] border-t border-white/10 pt-3">
              <div className="flex items-center justify-between pb-1.5 mb-1 border-b border-white/10">
                <p className="text-[10px] font-mono font-bold uppercase text-neutral-400">Recent Matches</p>
                <button
                  onClick={onViewAll}
                  className="text-[10px] font-mono font-medium uppercase tracking-wider text-neutral-400 hover:text-white transition-colors cursor-pointer"
                >
                  View All →
                </button>
              </div>
              <div className="overflow-y-auto custom-scrollbar space-y-1">
                {(detail.recent_matches || []).map((m: any) => (
                  <button
                    key={m.match_id}
                    onClick={() => onSelectMatch(m.match_id)}
                    className="w-full flex items-center gap-2 p-1.5 border border-white/5 bg-black/40 hover:bg-white/5 transition-colors text-left cursor-pointer"
                  >
                    {m.result === 'win' ? (
                      <CheckCircle2 className="w-3 h-3 text-emerald-400/90 shrink-0" />
                    ) : (
                      <XCircle className="w-3 h-3 text-rose-400/90 shrink-0" />
                    )}
                    <span className="flex-1 font-semibold font-sans text-xs text-white truncate">
                      {m.opponent_name || 'Opponent'}
                    </span>
                    <span className="text-[10px] font-mono tabular-nums text-neutral-500 shrink-0">
                      {formatDateShort(m.timestamp)}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Bottom Sidebar Action Buttons: Cover Art & Background Art (Muted colors) */}
            <div className="pt-3 border-t border-white/10 flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  setArtSearch('');
                  setArtPickerMode('cover');
                  setSelectedCardArt(detail?.custom_art_name || detail?.commander_name || '__DEFAULT__');
                  setChooseArtOpen(true);
                }}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 text-[11px] font-mono font-bold uppercase bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-white/20 text-neutral-300 hover:text-white transition-colors cursor-pointer"
                title="Choose Deck Box Artwork"
              >
                <ImageIcon className="w-3.5 h-3.5 text-neutral-400" />
                <span>Cover Art</span>
              </button>
              <button
                onClick={() => {
                  setArtSearch('');
                  setArtPickerMode('background');
                  setSelectedCardArt(detail?.custom_bg_art_name || '__RANDOM__');
                  setChooseArtOpen(true);
                }}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 text-[11px] font-mono font-bold uppercase bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-white/20 text-neutral-300 hover:text-white transition-colors cursor-pointer"
                title="Choose Deck Background Artwork"
              >
                <Sparkles className="w-3.5 h-3.5 text-neutral-400" />
                <span>Background</span>
              </button>
            </div>
          </div>

          {/* Right Main Column: Floating Toolbar on Top, Translucent Decklist Table Below */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden gap-3">
            {/* Floating Toolbar: Transparent with NO bounding box / border */}
            <div className="shrink-0 flex items-center justify-between flex-wrap gap-3 bg-transparent border-0 p-0">
              {/* Search Bar on the Left */}
              <div className="relative w-64 shrink-0 h-8 flex items-center">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search deck cards..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-1.5 text-xs rounded-none bg-white/[0.04] hover:bg-white/[0.07] focus:bg-white/[0.09] text-white placeholder:text-neutral-500 focus:outline-none transition-colors font-sans"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white cursor-pointer"
                    title="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Segmented View Switcher & Action Buttons on the Right */}
              <div className="flex items-center gap-2.5 shrink-0">
                <div className="inline-flex items-center bg-white/[0.03] p-0.5 gap-0.5 shrink-0 border border-white/10">
                  <button
                    onClick={() => setListMode('true')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-wider transition-all cursor-pointer ${
                      listMode === 'true'
                        ? 'bg-white/[0.12] text-white shadow-sm font-bold'
                        : 'opacity-40 hover:opacity-90 hover:bg-white/[0.05] text-neutral-400'
                    }`}
                  >
                    True Decklist
                  </button>
                  <button
                    onClick={() => setListMode('logged')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-wider transition-all cursor-pointer ${
                      listMode === 'logged'
                        ? 'bg-white/[0.12] text-white shadow-sm font-bold'
                        : 'opacity-40 hover:opacity-90 hover:bg-white/[0.05] text-neutral-400'
                    }`}
                  >
                    All Logged Cards
                  </button>
                </div>

                <button
                  onClick={openImport}
                  className="flex items-center gap-1.5 text-xs font-mono font-bold uppercase tracking-wider px-2.5 py-1.5 border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white transition-colors cursor-pointer"
                  title="Import a decklist from MTGA"
                >
                  <Download className="w-3.5 h-3.5 text-neutral-400" /> Import
                </button>
                <button
                  onClick={() => setExportOpen(true)}
                  className="flex items-center gap-1.5 text-xs font-mono font-bold uppercase tracking-wider px-2.5 py-1.5 border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white transition-colors cursor-pointer"
                  title="Export this deck in MTGA format"
                >
                  <Upload className="w-3.5 h-3.5 text-neutral-400" /> Export
                </button>
              </div>
            </div>

            {/* Decklist Container: The only box on the right, translucent */}
            <div className="flex-1 overflow-hidden min-h-0 border border-white/10 bg-neutral-950/45 backdrop-blur-md p-3 shadow-xl">
              {listMode === 'true' && deckListData ? (
                <TrueDeckListView
                  data={deckListData}
                  totalMatches={detail?.total || 0}
                  status={deckListStatus}
                  palette={palette}
                  searchTerm={searchQuery}
                  onShowCard={onShowCard}
                />
              ) : listMode === 'true' ? (
                <div className="flex-1 flex flex-col items-center justify-center min-h-0 h-full">
                  <div
                    className="flex flex-col items-center gap-2 text-center cursor-pointer select-none p-6 border border-dashed border-white/15 hover:border-white/30 transition-colors"
                    onClick={openImport}
                  >
                    <p className="text-base font-display uppercase tracking-wider text-white">
                      Click to Import Decklist
                    </p>
                    <p className="text-xs font-mono text-neutral-400">
                      Upload the full list of cards in this deck from MTG Arena
                    </p>
                  </div>
                </div>
              ) : (
                <DeckCardList deckName={deckName} palette={palette} searchTerm={searchQuery} onShowCard={onShowCard} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Floating Tooltip */}
      {tip && (
        <div
          className="fixed z-50 pointer-events-none px-2.5 py-1 text-xs font-mono font-bold bg-neutral-900/95 border border-white/20 text-white shadow-2xl"
          style={{ left: tip.x + 12, top: tip.y + 12 }}
        >
          {tip.text}
        </div>
      )}

      {/* Import Decklist Modal */}
      {importOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={closeImport}
        >
          <div
            className="w-full max-w-2xl border border-white/20 bg-neutral-950 p-6 flex flex-col gap-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="text-lg font-bold font-display uppercase tracking-wider text-white">
                  Import True Decklist
                </h3>
                <p className="text-xs font-mono text-neutral-400 mt-0.5">
                  Paste an MTG Arena export to establish this deck's authoritative card list
                </p>
              </div>
              <button
                onClick={closeImport}
                disabled={importBusy}
                className="p-1 text-neutral-400 hover:text-white border border-white/10 hover:border-white/20 transition-colors cursor-pointer disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-mono uppercase text-neutral-400 font-bold">
                MTGA Export Text
              </label>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={"Deck\n4 Lightning Bolt\n20 Mountain\n..."}
                rows={10}
                disabled={importBusy}
                className="w-full p-3 bg-neutral-900 border border-white/10 font-mono text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-white/30 resize-none"
              />
            </div>

            {importError && (
              <div className="p-3 border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs font-mono flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{importError}</span>
              </div>
            )}

            {importResult && (
              <div className="p-3 border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs font-mono flex items-center gap-2">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>
                  Successfully imported {importResult.card_count ?? importResult.cards_count ?? 0} cards
                  {importResult.sideboard_count ? ` (${importResult.sideboard_count} sideboard)` : ''}.
                </span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
              <button
                onClick={closeImport}
                disabled={importBusy}
                className="px-4 py-2 border border-white/10 hover:border-white/20 text-xs font-mono font-bold uppercase tracking-wider text-neutral-300 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
              >
                {importResult ? 'Done' : 'Cancel'}
              </button>
              {!importResult && (
                <button
                  onClick={handleImportSubmit}
                  disabled={importBusy || !importText.trim()}
                  className="px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-mono font-bold uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{importBusy ? 'Importing...' : 'Save Decklist'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Export Decklist Modal */}
      {exportOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => setExportOpen(false)}
        >
          <div
            className="w-full max-w-2xl border border-white/20 bg-neutral-950 p-6 flex flex-col gap-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="text-lg font-bold font-display uppercase tracking-wider text-white">
                  Export Decklist
                </h3>
                <p className="text-xs font-mono text-neutral-400 mt-0.5">
                  Copy this deck in MTG Arena export format
                </p>
              </div>
              <button
                onClick={() => setExportOpen(false)}
                className="p-1 text-neutral-400 hover:text-white border border-white/10 hover:border-white/20 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2 border-b border-white/10 pb-3">
              <span className="text-xs font-mono uppercase text-neutral-400 mr-2">Source:</span>
              <button
                onClick={() => setExportMode('true')}
                className={`px-3 py-1 text-xs font-mono font-bold uppercase tracking-wider border transition-colors cursor-pointer ${
                  exportMode === 'true'
                    ? 'border-white/40 bg-white/10 text-white'
                    : 'border-white/10 text-neutral-400 hover:text-white'
                }`}
              >
                True Decklist
              </button>
              <button
                onClick={() => setExportMode('logged')}
                className={`px-3 py-1 text-xs font-mono font-bold uppercase tracking-wider border transition-colors cursor-pointer ${
                  exportMode === 'logged'
                    ? 'border-white/40 bg-white/10 text-white'
                    : 'border-white/10 text-neutral-400 hover:text-white'
                }`}
              >
                All Logged Cards
              </button>
            </div>

            <div className="space-y-1.5">
              <textarea
                value={exportText || 'No decklist cards available to export.'}
                readOnly
                rows={10}
                className="w-full p-3 bg-neutral-900 border border-white/10 font-mono text-xs text-neutral-200 resize-none focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-white/10">
              <span className="text-xs font-mono text-neutral-500">
                {copied ? '✓ Copied to clipboard!' : ''}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setExportOpen(false)}
                  className="px-4 py-2 border border-white/10 hover:border-white/20 text-xs font-mono font-bold uppercase tracking-wider text-neutral-300 hover:text-white transition-colors cursor-pointer"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    if (!exportText) return;
                    navigator.clipboard.writeText(exportText);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  disabled={!exportText}
                  className="px-4 py-2 bg-white/[0.08] hover:bg-white/[0.14] text-white border border-white/20 text-xs font-mono font-bold uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5 text-neutral-400" />
                  <span>{copied ? 'Copied' : 'Copy to Clipboard'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Choose Cover Art / Background Art Modal */}
      {chooseArtOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => setChooseArtOpen(false)}
        >
          <div
            className="w-full max-w-2xl border border-white/20 bg-neutral-950 flex flex-col shadow-2xl overflow-hidden h-[600px] max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0 bg-neutral-900/60">
              <div className="flex items-center gap-2.5">
                {artPickerMode === 'cover' ? (
                  <ImageIcon className="w-4 h-4 text-neutral-400" />
                ) : (
                  <Sparkles className="w-4 h-4 text-neutral-400" />
                )}
                <div>
                  <h3 className="text-base font-bold font-display uppercase tracking-wider text-white">
                    {artPickerMode === 'cover' ? 'Choose Deck Box Cover Artwork' : 'Choose Deck Background Artwork'}
                  </h3>
                  <p className="text-xs font-mono text-neutral-400 mt-0.5">
                    {artPickerMode === 'cover'
                      ? 'Select any card from this deck to use as its deck box art crop'
                      : 'Select any card from this deck to use as its ambient background'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setChooseArtOpen(false)}
                className="p-1 text-neutral-400 hover:text-white border border-white/10 hover:border-white/20 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search Bar */}
            <div className="p-3 border-b border-white/10 shrink-0">
              <div className="relative h-8 flex items-center">
                <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={artSearch}
                  onChange={(e) => setArtSearch(e.target.value)}
                  placeholder="Search cards in this deck..."
                  className="w-full pl-9 pr-8 py-1.5 text-xs rounded-none bg-white/[0.04] hover:bg-white/[0.07] focus:bg-white/[0.09] text-white placeholder:text-neutral-500 focus:outline-none transition-colors font-sans"
                  autoFocus
                />
                {artSearch && (
                  <button
                    onClick={() => setArtSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Content Split: Card List + Live Art Crop Preview */}
            <div className="flex-1 min-h-0 flex divide-x divide-white/10 overflow-hidden">
              {/* Scrollable list of options */}
              <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-white/5 bg-black/20 custom-scrollbar">
                {/* Top Reset/Random Option */}
                {(() => {
                  const isSpecial = artPickerMode === 'background' ? selectedCardArt === '__RANDOM__' : selectedCardArt === '__DEFAULT__';
                  const isCurrent = artPickerMode === 'background' ? !detail?.custom_bg_art_name : !detail?.custom_art_name;
                  const label = artPickerMode === 'background' ? 'Random' : 'Default';
                  const subtext = artPickerMode === 'background' ? 'Random non-land card from deck' : 'Commander or top card';
                  return (
                    <div
                      onClick={() => setSelectedCardArt(artPickerMode === 'background' ? '__RANDOM__' : '__DEFAULT__')}
                      className={`flex items-center justify-between p-2.5 transition-colors cursor-pointer ${
                        isSpecial ? 'bg-white/[0.18] border border-white/40 text-white font-bold' : 'hover:bg-white/5 border border-transparent text-neutral-300'
                      }`}
                    >
                      <div className="flex flex-col min-w-0 pr-2">
                        <span className="text-xs font-mono font-bold text-neutral-200 truncate">
                          {label}
                        </span>
                        <span className="text-[10px] font-sans text-neutral-400 truncate">
                          {subtext}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isCurrent && (
                          <span className="text-[9.5px] font-mono font-bold uppercase px-1.5 py-0.5 bg-white/10 text-neutral-200 border border-white/20">
                            Current
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Deck cards list */}
                {deckCardsList
                  .filter((c) => c.name.toLowerCase().includes(artSearch.toLowerCase()))
                  .map((card) => {
                    const isCurrent = (artPickerMode === 'background' ? detail?.custom_bg_art_name === card.name : detail?.custom_art_name === card.name);
                    const isSelected = selectedCardArt === card.name;
                    return (
                      <div
                        key={card.name}
                        onClick={() => setSelectedCardArt(card.name)}
                        className={`flex items-center justify-between p-2.5 transition-colors cursor-pointer ${
                          isSelected ? 'bg-white/[0.18] border border-white/40 text-white font-bold' : 'hover:bg-white/5 border border-transparent text-neutral-300'
                        }`}
                      >
                        <div className="flex flex-col min-w-0 pr-2">
                          <span className="text-xs font-mono font-bold text-neutral-200 truncate">
                            {card.name}
                          </span>
                          {card.type && (
                            <span className="text-[10px] font-sans text-neutral-500 truncate">
                              {card.type}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {isCurrent && (
                            <span className="text-[9.5px] font-mono font-bold uppercase px-1.5 py-0.5 bg-white/10 text-neutral-200 border border-white/20">
                              Current
                            </span>
                          )}
                          <span className="text-[10px] font-mono text-neutral-500">
                            {card.mana_cost || ''}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                {deckCardsList.filter((c) => c.name.toLowerCase().includes(artSearch.toLowerCase())).length === 0 && artSearch && (
                  <div className="p-8 text-center text-xs font-mono text-neutral-500 uppercase">
                    No matching cards found
                  </div>
                )}
              </div>

              {/* Live Art Crop Preview */}
              <div className="w-64 shrink-0 p-4 bg-neutral-900/30 flex flex-col items-center justify-center space-y-3">
                <div className="w-full aspect-[4/3] border border-white/20 bg-black overflow-hidden shadow-lg relative rounded-sm flex items-center justify-center">
                  {selectedCardArt === '__RANDOM__' ? (
                    <div className="flex flex-col items-center gap-1.5 text-neutral-400">
                      <Sparkles className="w-8 h-8 opacity-60" />
                      <span className="text-[11px] font-mono uppercase font-bold">Random Art</span>
                    </div>
                  ) : selectedCardArt === '__DEFAULT__' ? (
                    <div className="flex flex-col items-center gap-1.5 text-neutral-400">
                      <ImageIcon className="w-8 h-8 opacity-60" />
                      <span className="text-[11px] font-mono uppercase font-bold">Default Art</span>
                    </div>
                  ) : selectedCardArt ? (
                    <CardImage
                      name={selectedCardArt}
                      version="art_crop"
                      alt={selectedCardArt}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs font-mono text-neutral-600">
                      No Preview
                    </div>
                  )}
                </div>
                <div className="text-center w-full min-w-0">
                  <p className="text-xs font-mono font-bold text-white uppercase truncate">
                    {selectedCardArt === '__RANDOM__'
                      ? 'Random'
                      : selectedCardArt === '__DEFAULT__'
                      ? 'Default'
                      : selectedCardArt || 'Select an option'}
                  </p>
                  <p className="text-[10px] font-sans text-neutral-400 mt-0.5">
                    {artPickerMode === 'cover' ? 'Deck Box Cover Preview' : 'Deck Background Preview'}
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (selectedCardArt === '__RANDOM__' || selectedCardArt === '__DEFAULT__') {
                      handleResetArt();
                    } else if (selectedCardArt) {
                      const c = deckCardsList.find((x) => x.name === selectedCardArt);
                      if (c) handleSelectArt(c);
                    }
                  }}
                  disabled={artSaving || !selectedCardArt}
                  className="w-full py-2 bg-white/[0.08] hover:bg-white/[0.14] text-white border border-white/20 text-xs font-mono font-bold uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {artPickerMode === 'cover' ? 'Set as Deck Box Cover' : 'Set as Background'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Deck Achievements Modal */}
      <DeckAchievementsModal
        isOpen={achievementsModalOpen}
        onClose={() => setAchievementsModalOpen(false)}
        deckName={deckName}
        deckArtName={detail?.custom_art_name || detail?.commander_name || (detail?.card_achievements_grouped?.[0]?.cards?.[0]?.card_name)}
        groupedAchievements={detail?.card_achievements_grouped || []}
        palette={palette}
        onShowCard={onShowCard}
      />
    </div>
  );
}

export default DeckDetailView;
