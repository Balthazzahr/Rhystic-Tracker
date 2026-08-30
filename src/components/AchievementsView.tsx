import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X, Target, Sparkles, Search, LayoutGrid, Table2, ChevronLeft, ChevronRight, Home, Columns3, GripVertical, RotateCcw, Check, ChevronUp, ChevronDown, Eye, EyeOff } from 'lucide-react';
import { AchievementBadge } from './AchievementBadge';
import { getAchievementMeta, ACHIEVEMENTS_REGISTRY } from '../utils/achievementBadges';
import CardImage from './CardImage';

interface AchievementsViewProps {
  palette: any;
  onShowCard?: (card: { name: string; grp_id?: number }, isCommander?: boolean) => void;
}

export interface AchievementColumnDef {
  key: string;
  label: string;
  description: string;
  visible: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
}

const DEFAULT_ACH_COLUMNS: AchievementColumnDef[] = [
  { key: 'achievement', label: 'Achievement', description: 'Achievement name with mini emblem badge', visible: true, width: 'flex-1 min-w-[220px]', align: 'left' },
  { key: 'highest_tier', label: 'Highest Tier', description: 'Highest achievement tier earned (Gold / Silver / Bronze)', visible: true, width: 'w-28', align: 'center' },
  { key: 'gold', label: 'Gold', description: 'Times the Gold tier has been earned', visible: true, width: 'w-16', align: 'center' },
  { key: 'silver', label: 'Silver', description: 'Times the Silver tier has been earned', visible: true, width: 'w-16', align: 'center' },
  { key: 'bronze', label: 'Bronze', description: 'Times the Bronze tier has been earned', visible: true, width: 'w-16', align: 'center' },
  { key: 'first_earned', label: 'First Earned', description: 'Date the achievement was first earned', visible: true, width: 'w-28', align: 'center' },
  { key: 'cards', label: 'Cards', description: 'Distinct decorated cards count', visible: true, width: 'w-20', align: 'center' },
  { key: 'cards_achieved', label: 'Cards Achieved', description: 'Mini art previews of the top earning cards (click to inspect)', visible: true, width: 'flex-1 min-w-[180px]', align: 'center' },
];

const ACH_COLUMNS_STORAGE_KEY = 'rhystic_achievements_columns';

function getContrastTextColor(hexColor?: string): string {
  if (!hexColor) return '#FFFFFF';
  const cleanHex = hexColor.replace('#', '');
  if (cleanHex.length < 6) return '#FFFFFF';
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 160 ? '#09090B' : '#FFFFFF';
}


export const AchievementsView: React.FC<AchievementsViewProps> = ({ palette, onShowCard }) => {
  const [activeCategory, setActiveCategory] = useState<'card' | 'deck'>('card');
  const [loading, setLoading] = useState(true);
  const [achievementsData, setAchievementsData] = useState<any>(null);
  const [selectedAchievement, setSelectedAchievement] = useState<any>(null);
  const [showUnearned, setShowUnearned] = useState<boolean>(() => {
    const saved = localStorage.getItem('rhystic_achievements_show_unearned');
    return saved === 'true';
  });
  const [achSearch, setAchSearch] = useState('');

  useEffect(() => {
    localStorage.setItem('rhystic_achievements_show_unearned', String(showUnearned));
  }, [showUnearned]);

  useEffect(() => {
    loadAchievements();
  }, []);

  // Global Escape key listener to dismiss drill-down modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedAchievement(null);
      }
    };
    if (selectedAchievement) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [selectedAchievement]);

  const loadAchievements = async () => {
    setLoading(true);
    try {
      const res = await invoke('get_global_achievements');
      setAchievementsData(res);
    } catch (err) {
      console.error('Failed to load global achievements:', err);
    } finally {
      setLoading(false);
    }
  };

  const unlockedList = achievementsData?.achievements || [];

  // When showUnearned is true, display earned achievements first followed by all unearned achievements
  const displayList = useMemo(() => {
    if (!showUnearned) {
      return unlockedList;
    }

    const unlockedIds = new Set(
      unlockedList.map((a: any) => getAchievementMeta(a.achievement).id)
    );

    const unearnedList = Object.values(ACHIEVEMENTS_REGISTRY)
      .filter((meta) => !unlockedIds.has(meta.id))
      .map((meta) => ({
        achievement: meta.title,
        highest_tier: 'bronze' as const,
        total_awards: 0,
        cards: [],
        is_unearned: true,
        meta,
      }));

    return [...unlockedList, ...unearnedList];
  }, [unlockedList, showUnearned]);

  // Search-filtered list (by achievement title or decorated card name)
  const filteredList = useMemo(() => {
    if (!achSearch.trim()) return displayList;
    const q = achSearch.toLowerCase();
    return displayList.filter((ach: any) => {
      const meta = getAchievementMeta(ach.achievement);
      if (meta.title.toLowerCase().includes(q)) return true;
      if (ach.cards?.some((c: any) => (c.card_name || c.name || '').toLowerCase().includes(q))) return true;
      return false;
    });
  }, [displayList, achSearch]);

  // View state
  const [achView, setAchView] = useState<'cards' | 'table'>(() => {
    const saved = localStorage.getItem('rhystic_achievements_view');
    return saved === 'table' ? 'table' : 'cards';
  });
  useEffect(() => { localStorage.setItem('rhystic_achievements_view', achView); }, [achView]);

  // --- Column Configuration State (persisted) ---
  const [columns, setColumns] = useState<AchievementColumnDef[]>(() => {
    try {
      const raw = localStorage.getItem(ACH_COLUMNS_STORAGE_KEY);
      if (!raw) return DEFAULT_ACH_COLUMNS;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_ACH_COLUMNS;
      const map = new Map(parsed.map((c: any) => [c.key, c]));
      const result: AchievementColumnDef[] = [];
      for (const saved of parsed) {
        const def = DEFAULT_ACH_COLUMNS.find((d) => d.key === saved.key);
        if (def) {
          result.push({ ...def, visible: typeof saved.visible === 'boolean' ? saved.visible : def.visible });
        }
      }
      return result.length > 0 ? result : DEFAULT_ACH_COLUMNS;
    } catch {
      return DEFAULT_ACH_COLUMNS;
    }
  });
  const [showColumnModal, setShowColumnModal] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const saveColumns = (newCols: AchievementColumnDef[]) => {
    setColumns(newCols);
    try { localStorage.setItem(ACH_COLUMNS_STORAGE_KEY, JSON.stringify(newCols)); } catch { /* ignore */ }
  };
  const resetColumns = () => saveColumns(DEFAULT_ACH_COLUMNS);
  const toggleColumnVisibility = (key: string) => {
    saveColumns(columns.map((c) => (c.key === key ? { ...c, visible: !c.visible } : c)));
  };
  const moveColumn = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= columns.length || fromIdx === toIdx) return;
    const updated = [...columns];
    const [moved] = updated.splice(fromIdx, 1);
    updated.splice(toIdx, 0, moved);
    saveColumns(updated);
  };
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
  };
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) setDragOverIndex(index);
  };
  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    const sourceIdx = draggedIndex !== null ? draggedIndex : parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (!isNaN(sourceIdx) && sourceIdx !== targetIndex) moveColumn(sourceIdx, targetIndex);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };
  const handleDragEnd = () => { setDraggedIndex(null); setDragOverIndex(null); };

  const visibleColumns = useMemo(() => columns.filter((c) => c.visible), [columns]);

  // Escape closes column modal
  useEffect(() => {
    if (!showColumnModal) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowColumnModal(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showColumnModal]);

  // Pagination
  const [page, setPage] = useState(1);
  const TABLE_PAGE_SIZE = 25;
  const CARD_W = 325;
  const CARD_H = 370;
  const CARD_GAP = 20; // gap-5

  // Card view container measurement (callback ref: measures whenever the grid
  // mounts — after loading or on view switch — so pagination can never start
  // at 1×1 from a missed initial measurement).
  const cardWrapRef = useRef<HTMLDivElement>(null);
  const cardAreaRORef = useRef<ResizeObserver | null>(null);
  const [cardArea, setCardArea] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const setCardWrapRef = useCallback((node: HTMLDivElement | null) => {
    cardWrapRef.current = node;
    if (cardAreaRORef.current) {
      cardAreaRORef.current.disconnect();
      cardAreaRORef.current = null;
    }
    if (!node) return;
    const measure = () => {
      const r = node.getBoundingClientRect();
      setCardArea((prev) => {
        const w = Math.round(r.width);
        const h = Math.round(r.height);
        if (prev.w === w && prev.h === h) return prev;
        return { w, h };
      });
    };
    measure();
    cardAreaRORef.current = new ResizeObserver(measure);
    cardAreaRORef.current.observe(node);
  }, []);

  const cols = cardArea.w > 0 ? Math.max(1, Math.floor((cardArea.w + CARD_GAP) / (CARD_W + CARD_GAP))) : 1;
  const rows = cardArea.h > 0 ? Math.max(1, Math.floor((cardArea.h + CARD_GAP) / (CARD_H + CARD_GAP))) : 1;
  const cardPageSize = cols * rows;

  const totalPages = achView === 'cards'
    ? Math.max(1, Math.ceil(filteredList.length / cardPageSize))
    : Math.max(1, Math.ceil(filteredList.length / TABLE_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const displayedCards = achView === 'cards'
    ? filteredList.slice((safePage - 1) * cardPageSize, safePage * cardPageSize)
    : filteredList.slice((safePage - 1) * TABLE_PAGE_SIZE, safePage * TABLE_PAGE_SIZE);

  // Reset page on filter/search/view/page-size changes
  useEffect(() => { setPage(1); }, [achSearch, showUnearned, activeCategory, achView, cardPageSize]);

  // Wheel paging for card view
  const wheelRef = useRef<HTMLDivElement>(null);
  const pageDirRef = useRef<'next' | 'prev'>('next');
  const goPage = useCallback((dir: 'next' | 'prev') => {
    pageDirRef.current = dir;
    setPage((p) => dir === 'next' ? Math.min(totalPages, p + 1) : Math.max(1, p - 1));
  }, [totalPages]);

  useEffect(() => {
    const el = wheelRef.current;
    if (!el || achView !== 'cards') return;
    let lock = false;
    const onWheel = (e: WheelEvent) => {
      if (lock || totalPages <= 1 || Math.abs(e.deltaY) < 10) return;
      e.preventDefault();
      lock = true;
      goPage(e.deltaY > 0 ? 'next' : 'prev');
      setTimeout(() => { lock = false; }, 450);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [achView, totalPages, goPage]);

  // Helper to determine if a specific tier has been achieved
  const isTierAchieved = (targetTier: 'gold' | 'silver' | 'bronze', ach: any) => {
    if (!ach || ach.total_awards === 0 || ach.is_unearned) return false;
    const tier = ach.highest_tier?.toLowerCase();
    if (tier === 'gold') return true;
    if (tier === 'silver') return targetTier === 'silver' || targetTier === 'bronze';
    if (tier === 'bronze') return targetTier === 'bronze';
    return false;
  };

  const accentColor = palette?.accent || '#A855F7';
  const totalUnlocked = achievementsData?.total_unlocked ?? 0;
  const totalPossible = achievementsData?.total_possible ?? 21;

  const selectedMeta = selectedAchievement ? getAchievementMeta(selectedAchievement.achievement) : null;

  return (
    <div className="flex-1 min-h-0 flex flex-col space-y-3 px-8 py-4 overflow-hidden select-none">
      {/* 1. HEADER */}
      <div className="flex items-center justify-between pb-2 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="ms ms-ability-duels-renowned text-2xl leading-none" style={{ color: accentColor }} />
          <h1 className="text-[26px] font-display font-bold tracking-[0.12em] uppercase text-white leading-none">
            ACHIEVEMENTS
          </h1>
          <span className="text-xs text-neutral-400 font-sans ml-2">
            ({totalUnlocked} of {totalPossible} trophies unlocked)
          </span>
        </div>
      </div>

      {/* 2. TOP FILTER & CONTROLS TOOLBAR */}
      <div className="shrink-0 flex items-center gap-2.5 pb-1 flex-wrap">
        {/* 1. Search Filter */}
        <div className="relative w-64 shrink-0 h-8 flex items-center">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search achievements or cards..."
            value={achSearch}
            onChange={(e) => setAchSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 text-xs rounded-none bg-white/[0.04] hover:bg-white/[0.07] focus:bg-white/[0.09] text-white placeholder:text-neutral-500 focus:outline-none transition-colors font-sans"
          />
          {achSearch && (
            <button
              onClick={() => setAchSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white cursor-pointer"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* 2. Category Segmented Toggle */}
        <div className="flex items-center bg-white/[0.03] p-0.5 gap-0.5">
          <button
            onClick={() => setActiveCategory('card')}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono uppercase tracking-wider transition-all cursor-pointer ${
              activeCategory === 'card'
                ? 'bg-white/[0.12] text-white shadow-sm font-bold'
                : 'opacity-40 hover:opacity-90 hover:bg-white/[0.05] text-neutral-400'
            }`}
          >
            <span>Card</span>
          </button>
          <button
            onClick={() => setActiveCategory('deck')}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono uppercase tracking-wider transition-all cursor-pointer ${
              activeCategory === 'deck'
                ? 'bg-white/[0.12] text-white shadow-sm font-bold'
                : 'opacity-40 hover:opacity-90 hover:bg-white/[0.05] text-neutral-400'
            }`}
          >
            <span>Deck</span>
            <span className="text-[9px] font-mono px-1 border border-white/10 bg-white/5 text-neutral-400 ml-0.5 leading-tight">
              Soon
            </span>
          </button>
        </div>

        <div className="flex-1" />

        {/* 3. Column Selector (table view) */}
        {activeCategory === 'card' && achView === 'table' && (
          <button
            onClick={() => setShowColumnModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-wider bg-transparent hover:bg-white/[0.08] active:scale-95 text-neutral-300 hover:text-white transition-all cursor-pointer shrink-0"
            title="Modify, add/remove, and reorder table columns"
          >
            <Columns3 className="w-3.5 h-3.5" style={{ color: accentColor }} />
            <span>({visibleColumns.length})</span>
          </button>
        )}

        {/* 4. View Toggle */}
        <div className="flex items-center bg-white/[0.03] p-0.5 gap-0.5">
          <button
            onClick={() => setAchView('cards')}
            className={`flex items-center justify-center px-2 py-1 transition-all cursor-pointer ${
              achView === 'cards' ? 'bg-white/[0.12] text-white shadow-sm font-bold' : 'opacity-40 hover:opacity-90 hover:bg-white/[0.05] text-neutral-400'
            }`}
            title="Card view"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setAchView('table')}
            className={`flex items-center justify-center px-2 py-1 transition-all cursor-pointer ${
              achView === 'table' ? 'bg-white/[0.12] text-white shadow-sm font-bold' : 'opacity-40 hover:opacity-90 hover:bg-white/[0.05] text-neutral-400'
            }`}
            title="Table view"
          >
            <Table2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 5. Earned/All Eye Toggle */}
        {activeCategory === 'card' && (
          <button
            onClick={() => setShowUnearned(!showUnearned)}
            className={`flex items-center justify-center px-2.5 py-1.5 bg-transparent hover:bg-white/[0.08] active:scale-95 transition-all cursor-pointer ${
              showUnearned ? 'text-white' : 'text-neutral-300 hover:text-white'
            }`}
            title={showUnearned ? 'Show only earned achievements' : 'Show all achievements'}
          >
            {showUnearned ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4 opacity-40" />}
          </button>
        )}
      </div>

      {/* 3. MAIN CONTENT AREA */}
      {activeCategory === 'card' ? (
        <>
          {loading ? (
            <div className="flex-1 overflow-y-auto custom-scrollbar p-1 min-h-0">
              <div className="py-24 text-center text-xs font-mono uppercase tracking-wider text-neutral-500">
                Loading achievements...
              </div>
            </div>
          ) : filteredList.length === 0 ? (
            <div className="flex-1 overflow-y-auto custom-scrollbar p-1 min-h-0">
              <div className="py-24 text-center space-y-3">
                <div className="w-14 h-14 bg-white/[0.02] border border-white/10 flex items-center justify-center text-neutral-500 mx-auto">
                  <span className="ms ms-ability-duels-renowned text-3xl opacity-40" />
                </div>
                <h3 className="text-lg font-display font-bold tracking-wide uppercase text-white">
                  No Achievements {achSearch ? 'Match' : 'Unlocked'} Yet
                </h3>
                <p className="text-xs font-sans text-neutral-400 max-w-md mx-auto leading-relaxed">
                  {achSearch ? 'No achievements match your search.' : 'Play matches on MTG Arena to earn combat honors, lethal strikes, massive token swarms, and card draw titles.'}
                </p>
              </div>
            </div>
          ) : achView === 'cards' ? (
            /* Card View: paginated grid */
            <>
              <div ref={setCardWrapRef} className="flex-1 min-h-0 overflow-hidden">
                <div ref={wheelRef} className="h-full min-h-0 flex flex-wrap items-start justify-start content-start gap-5 w-full">
                  {displayedCards.map((ach: any) => {
                    const meta = getAchievementMeta(ach.achievement);
                    const topCard = ach.cards?.[0];
                    const topCardName = topCard?.card_name || topCard?.name;
                    const isUnearnedItem = ach.is_unearned || ach.total_awards === 0;
                    const cardsCount = ach.cards?.length || 0;

                    return (
                      <div
                        key={ach.achievement}
                        onClick={() => setSelectedAchievement(ach)}
                        className={`w-[325px] h-[370px] shrink-0 p-4 border transition-[border-color,background-color,opacity] duration-200 flex flex-col items-center justify-between cursor-pointer text-center group ${
                          isUnearnedItem
                            ? 'bg-black/40 hover:bg-black/60 border-white/5 hover:border-white/20 opacity-55 hover:opacity-90'
                            : 'bg-neutral-950 hover:bg-white/[0.04] border-white/10 hover:border-white/30'
                        }`}
                      >
                        <div className="w-full flex items-center justify-between gap-2 pb-2 border-b border-white/10">
                          <h4 className="text-[18px] font-bold font-sans uppercase tracking-wide text-white truncate text-left flex-1" title={meta.title}>
                            {meta.title}
                          </h4>
                          {isUnearnedItem ? (
                            <span className="text-[9.5px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 border border-white/10 bg-white/5 text-neutral-400 shrink-0">Unearned</span>
                          ) : (
                            <span className={`text-[9.5px] font-mono font-bold px-2 py-0.5 border uppercase tracking-wider shrink-0 ${
                              ach.highest_tier === 'gold' ? 'bg-amber-500/15 text-amber-300 border-amber-500/35'
                              : ach.highest_tier === 'silver' ? 'bg-slate-400/15 text-slate-200 border-slate-400/35'
                              : 'bg-amber-900/25 text-amber-200 border-amber-700/35'
                            }`}>{ach.highest_tier}</span>
                          )}
                        </div>
                        <div className={`w-[174px] h-[174px] flex items-center justify-center my-auto transition-transform duration-300 group-hover:scale-105 ${isUnearnedItem ? 'opacity-35 grayscale' : ''}`}>
                          <AchievementBadge title={ach.achievement} tier={ach.highest_tier} count={ach.total_awards} size="hero" showTitle={false} showCount={false} />
                        </div>
                        <div className="space-y-0.5 mb-1">
                          {isUnearnedItem ? (
                            <p className="text-[11px] font-mono text-neutral-500">Click to inspect criteria</p>
                          ) : (
                            <p className="text-[11px] font-mono text-neutral-400 tabular-nums">
                              Awarded to <span className="text-white font-bold">{cardsCount}</span> {cardsCount === 1 ? 'card' : 'cards'} ({ach.total_awards}× total)
                            </p>
                          )}
                        </div>
                        <div className="w-full pt-2 border-t border-white/10 flex items-center justify-between gap-2 text-xs font-mono">
                          {isUnearnedItem ? (
                            <div className="flex items-center justify-center w-full text-neutral-500 text-[11px] font-mono py-0.5"><span>Locked · Not yet earned</span></div>
                          ) : (
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              {topCardName && (
                                <div className="w-8 h-8 border border-white/15 overflow-hidden shrink-0 bg-neutral-900 shadow-sm">
                                  <CardImage name={topCardName} version="art_crop" alt={topCardName} className="w-full h-full object-cover" />
                                </div>
                              )}
                              <div className="min-w-0 flex-1 text-left">
                                <span className="text-[9px] font-mono text-neutral-500 uppercase tracking-wider block leading-none">MVP</span>
                                <span className="text-[13px] font-bold font-sans uppercase text-white truncate block tracking-wide" title={topCardName}>{topCardName || '—'}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            /* Table View: floating header + rows */
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden relative">
              {/* Floating Table Header */}
              <div className="flex items-center h-[34px] px-4 shrink-0 select-none text-xs font-sans font-bold text-white">
                {visibleColumns.map((col) => (
                  <div key={col.key} className={`${col.width || 'flex-1'} px-1.5 ${col.align === 'left' ? 'text-left' : 'text-center'}`}>
                    {col.label}
                  </div>
                ))}
              </div>
              {/* Main Data Table Body */}
              <div className="flex-1 min-h-0 border border-white/10 bg-neutral-950/50 backdrop-blur-md flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-white/5">
                  {displayedCards.map((ach: any) => {
                    const meta = getAchievementMeta(ach.achievement);
                    const isUnearnedItem = ach.is_unearned || ach.total_awards === 0;
                    const firstEarned = ach.first_earned_at ? new Date(ach.first_earned_at) : null;
                    const dateStr = firstEarned ? `${firstEarned.toLocaleString('en-US', { month: 'short', day: 'numeric' })} '${String(firstEarned.getFullYear()).slice(2)}` : '—';
                    const topEarners = (ach.cards || []).slice(0, 5);

                    return (
                      <div
                        key={ach.achievement}
                        onClick={() => setSelectedAchievement(ach)}
                        className={`flex items-center py-2 px-4 transition-colors cursor-pointer group ${
                          isUnearnedItem ? 'opacity-55 hover:opacity-90' : 'hover:bg-white/[0.04]'
                        }`}
                      >
                        {visibleColumns.map((col) => {
                          const cellClass = `${col.width || 'flex-1'} px-1.5 min-w-0 ${col.align === 'left' ? 'text-left' : 'text-center flex items-center justify-center'}`;
                          switch (col.key) {
                            case 'achievement':
                              return (
                                <div key={col.key} className={cellClass}>
                                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                    <div className={`w-7 h-7 shrink-0 flex items-center justify-center overflow-hidden ${isUnearnedItem ? 'opacity-35 grayscale' : ''}`}>
                                      <AchievementBadge title={ach.achievement} tier={ach.highest_tier} count={ach.total_awards} size="lg" showTitle={false} showCount={false} />
                                    </div>
                                    <span className="font-semibold text-neutral-100 hover:text-white truncate text-[14px]">{meta.title}</span>
                                  </div>
                                </div>
                              );
                            case 'highest_tier':
                              return (
                                <div key={col.key} className={cellClass}>
                                  {isUnearnedItem ? (
                                    <span className="text-xs font-mono text-neutral-600">—</span>
                                  ) : (
                                    <span className={`text-[10.5px] font-mono font-bold px-2 py-0.5 border uppercase tracking-wider ${
                                      ach.highest_tier === 'gold' ? 'bg-amber-500/15 text-amber-300 border-amber-500/35'
                                      : ach.highest_tier === 'silver' ? 'bg-slate-400/15 text-slate-200 border-slate-400/35'
                                      : 'bg-amber-900/25 text-amber-200 border-amber-700/35'
                                    }`}>{ach.highest_tier}</span>
                                  )}
                                </div>
                              );
                            case 'gold':
                            case 'silver':
                            case 'bronze':
                              return (
                                <div key={col.key} className={cellClass}>
                                  <span className="text-xs font-mono text-neutral-300 tabular-nums font-semibold">{ach[`${col.key}_count`] || '—'}</span>
                                </div>
                              );
                            case 'first_earned':
                              return (
                                <div key={col.key} className={cellClass}>
                                  <span className="text-xs font-mono tabular-nums text-neutral-300">{dateStr}</span>
                                </div>
                              );
                            case 'cards':
                              return (
                                <div key={col.key} className={cellClass}>
                                  <span className="text-xs font-mono text-neutral-300 tabular-nums font-semibold">{ach.cards?.length || '—'}</span>
                                </div>
                              );
                            case 'cards_achieved':
                              return (
                                <div key={col.key} className={cellClass}>
                                  {topEarners.length > 0 ? (
                                  <div className="flex items-center justify-center gap-1.5">
                                    {topEarners.map((c: any, i: number) => (
                                      <button
                                        key={c.grp_id || i}
                                        onClick={(e) => { e.stopPropagation(); onShowCard?.({ name: c.card_name, grp_id: c.grp_id }, false); }}
                                        className="w-7 h-7 border border-white/10 overflow-hidden shadow-sm bg-neutral-900 shrink-0 cursor-zoom-in hover:scale-125 transition-transform"
                                        title={c.card_name}
                                      >
                                        <CardImage name={c.card_name} version="art_crop" alt={c.card_name} className="w-full h-full object-cover" />
                                      </button>
                                    ))}
                                  </div>
                                ) : <span className="text-xs font-mono text-neutral-600">—</span>}
                                </div>
                              );
                            default:
                              return null;
                          }
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Pagination Footer */}
          {filteredList.length > 0 && (
            <div className="shrink-0 flex items-center gap-3 pt-2">
              <div className="flex-1 flex justify-start">
                <button
                  onClick={() => setPage(1)}
                  disabled={safePage <= 1}
                  className="flex items-center justify-center p-1.5 text-xs font-bold bg-transparent hover:bg-white/[0.08] active:scale-95 text-neutral-400 hover:text-white transition-all disabled:opacity-20 cursor-pointer"
                  title="First page"
                >
                  <Home className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => goPage('prev')}
                  disabled={safePage <= 1}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-mono uppercase tracking-wider bg-transparent hover:bg-white/[0.08] active:scale-95 text-neutral-300 hover:text-white transition-all disabled:opacity-20 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Prev
                </button>
                <span className="text-xs font-mono text-neutral-400 px-2">
                  Page <span className="text-white font-bold">{safePage}</span> of <span className="text-neutral-400">{totalPages}</span>
                </span>
                <button
                  onClick={() => goPage('next')}
                  disabled={safePage >= totalPages}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-mono uppercase tracking-wider bg-transparent hover:bg-white/[0.08] active:scale-95 text-neutral-300 hover:text-white transition-all disabled:opacity-20 cursor-pointer"
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex-1 flex justify-end">
                <span className="text-xs font-mono text-neutral-400 tabular-nums">
                  <span className="text-white font-bold">{totalUnlocked.toLocaleString()}</span> of {totalPossible.toLocaleString()} achievements earned
                </span>
              </div>
            </div>
          )}
        </>
      ) : (
        /* Deck Achievements Placeholder */
        <div className="flex-1 overflow-y-auto custom-scrollbar p-1 min-h-0">
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 max-w-lg mx-auto">
            <div className="w-16 h-16 flex items-center justify-center border border-white/10 bg-white/[0.02]">
              <span className="ms ms-ability-adventure text-3xl" style={{ color: accentColor }} />
            </div>
            <h3 className="text-xl font-display font-bold uppercase tracking-wide text-white">Deck Achievements</h3>
            <p className="text-xs font-sans text-neutral-400 leading-relaxed max-w-md">
              Deck-level milestones, win streaks, comeback victories, and archetype dominance achievements are currently in active design.
            </p>
            <div className="p-4 border border-white/10 bg-white/[0.02] text-xs font-mono text-neutral-300 space-y-1.5 w-full text-left">
              <p className="font-bold flex items-center gap-1.5" style={{ color: accentColor }}>
                <Sparkles className="w-4 h-4" /> Roadmap Feature
              </p>
              <p className="text-neutral-400 font-sans text-[11.5px] leading-relaxed">
                Check back in upcoming releases for Deck Win Streaks, Comeback King, and Archetype Mastery badges!
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 4. DRILL-DOWN MODAL & FLOATING FLAVOR QUOTE */}
      {selectedAchievement && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 bg-black/80 backdrop-blur-md select-none overflow-y-auto custom-scrollbar"
          onClick={() => setSelectedAchievement(null)}
        >
          <div className="flex flex-col items-center justify-center max-w-5xl w-full my-auto">
            {/* Modal Frame */}
            <div
              className="w-full max-h-[78vh] flex flex-col bg-neutral-950/92 backdrop-blur-md border border-white/20 shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="p-5 border-b border-white/10 flex items-center justify-between shrink-0 bg-neutral-900/60">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-20 h-20 shrink-0 flex items-center justify-center">
                    <AchievementBadge
                      title={selectedAchievement.achievement}
                      tier={selectedAchievement.highest_tier}
                      count={selectedAchievement.total_awards}
                      size="2xl"
                      showTitle={false}
                      showCount={false}
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h2 className="text-xl font-display font-bold tracking-[0.12em] uppercase text-white">
                        {selectedMeta?.title}
                      </h2>
                      {selectedAchievement.total_awards > 0 ? (
                        <>
                          <span
                            className={`text-[10px] font-mono font-bold px-2 py-0.5 border uppercase tracking-wider ${
                              selectedAchievement.highest_tier === 'gold'
                                ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                                : selectedAchievement.highest_tier === 'silver'
                                ? 'bg-slate-400/15 text-slate-200 border-slate-400/40'
                                : 'bg-amber-900/25 text-amber-200 border-amber-700/40'
                            }`}
                          >
                            {selectedAchievement.highest_tier} Tier
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 border border-white/10 bg-white/5 text-neutral-300">
                            {selectedAchievement.cards?.length || 0} {selectedAchievement.cards?.length === 1 ? 'Card' : 'Cards'} Decorated
                          </span>
                        </>
                      ) : (
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 border border-white/15 bg-white/5 text-neutral-400 uppercase">
                          Unearned
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-400 mt-1 font-sans">
                      {selectedMeta?.tierDescriptions?.[selectedAchievement.highest_tier as 'bronze' | 'silver' | 'gold'] || selectedMeta?.description}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedAchievement(null)}
                  className="p-1.5 bg-transparent hover:bg-white/[0.08] text-neutral-400 hover:text-white active:scale-95 transition-all cursor-pointer"
                  title="Close (Esc)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Body: Left Decorated Cards + Right Tier Milestones */}
              <div className="flex-1 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-white/10 overflow-hidden min-h-0">
                {/* Left Column: Decorated Cards List */}
                <div className="flex-1 flex flex-col min-h-0 p-5 overflow-hidden">
                  <div className="flex items-center justify-between pb-2 mb-3 border-b border-white/10 shrink-0">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider text-neutral-300">
                      Decorated Cards
                    </span>
                    <span className="text-xs font-mono text-neutral-500 tabular-nums">
                      {selectedAchievement.cards?.length || 0} Total
                    </span>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
                    {!selectedAchievement.cards || selectedAchievement.cards.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-2 opacity-60">
                        <span className="ms ms-ability-duels-renowned text-4xl text-neutral-500" />
                        <p className="text-xs font-sans italic text-neutral-400">No cards have achieved this honor yet.</p>
                        <p className="text-[11px] font-sans text-neutral-500 max-w-xs">
                          Trigger the milestone conditions during a live MTG Arena match to decorate your first card.
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {selectedAchievement.cards.map((c: any) => {
                          const cardName = c.card_name || c.name || `Card #${c.grp_id}`;
                          const awardCount = c.count || c.award_count || 1;
                          return (
                            <div
                              key={c.grp_id || cardName}
                              onClick={() => {
                                setSelectedAchievement(null);
                                onShowCard?.({ name: cardName, grp_id: c.grp_id }, false);
                              }}
                              className="p-2.5 border border-white/10 bg-white/[0.02] hover:bg-white/[0.04] flex items-center justify-between gap-2.5 transition-colors cursor-pointer group"
                            >
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                {/* Card Art Thumbnail */}
                                <div className="w-11 h-11 shrink-0 border border-white/15 overflow-hidden bg-neutral-900 group-hover:border-white/50 transition-colors shadow-sm">
                                  <CardImage
                                    name={cardName}
                                    version="art_crop"
                                    alt={cardName}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                  />
                                </div>

                                <div className="min-w-0 flex-1">
                                  <span
                                    className="text-xs font-bold font-display uppercase tracking-wide text-white truncate block text-left w-full group-hover:underline leading-snug"
                                    title={cardName}
                                  >
                                    {cardName}
                                  </span>
                                  <div className="flex items-center gap-1.5 mt-1">
                                    <span
                                      className={`text-[9px] font-mono font-bold px-1.5 py-0.2 border uppercase ${
                                        c.highest_tier === 'gold'
                                          ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                          : c.highest_tier === 'silver'
                                          ? 'bg-slate-400/15 text-slate-200 border-slate-400/30'
                                          : 'bg-amber-900/25 text-amber-200 border-amber-700/30'
                                      }`}
                                    >
                                      {c.highest_tier}
                                    </span>
                                    {c.max_val > 0 && (
                                      <span className="text-[10px] font-mono text-neutral-400">
                                        Best: <strong className="text-white">{c.max_val}</strong>
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Trigger Multiplier Count Pill */}
                              <div className="shrink-0 flex flex-col items-end gap-0.5">
                                <span className="text-xs font-mono font-bold px-2 py-0.5 border border-white/15 bg-white/[0.04] text-white">
                                  {awardCount > 1 ? `×${awardCount}` : '1×'}
                                </span>
                                <span className="text-[8.5px] font-mono uppercase tracking-wider text-neutral-500">
                                  Triggered
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Column: Tier Milestones */}
                <div className="w-full md:w-80 p-5 flex flex-col justify-between space-y-4 bg-neutral-900/20 shrink-0">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 pb-2 border-b border-white/10">
                      <Target className="w-4 h-4" style={{ color: accentColor }} />
                      <span className="text-xs font-mono font-bold uppercase tracking-wider text-white">
                        Tier Milestones
                      </span>
                    </div>

                    {/* Gold Tier */}
                    <div
                      className={`p-3 border transition-all ${
                        isTierAchieved('gold', selectedAchievement)
                          ? 'bg-amber-500/10 border-amber-500/40 shadow-sm'
                          : 'bg-black/20 border-white/10 opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold font-display uppercase tracking-wide text-amber-400 flex items-center gap-1.5">
                          <span className="ms ms-ability-duels-renowned text-xs text-amber-300" /> Gold Tier
                        </span>
                        {isTierAchieved('gold', selectedAchievement) && (
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 border bg-amber-500/20 text-amber-300 border-amber-500/40 uppercase">
                            Achieved
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-sans text-neutral-300 leading-relaxed">
                        {selectedMeta?.tierDescriptions?.gold || selectedMeta?.criteria?.gold}
                      </p>
                    </div>

                    {/* Silver Tier */}
                    <div
                      className={`p-3 border transition-all ${
                        isTierAchieved('silver', selectedAchievement)
                          ? 'bg-slate-400/10 border-slate-400/40 shadow-sm'
                          : 'bg-black/20 border-white/10 opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold font-display uppercase tracking-wide text-slate-200 flex items-center gap-1.5">
                          <span className="ms ms-ability-duels-renowned text-xs text-slate-300" /> Silver Tier
                        </span>
                        {isTierAchieved('silver', selectedAchievement) && (
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 border bg-slate-500/20 text-slate-200 border-slate-500/40 uppercase">
                            Achieved
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-sans text-neutral-300 leading-relaxed">
                        {selectedMeta?.tierDescriptions?.silver || selectedMeta?.criteria?.silver}
                      </p>
                    </div>

                    {/* Bronze Tier */}
                    <div
                      className={`p-3 border transition-all ${
                        isTierAchieved('bronze', selectedAchievement)
                          ? 'bg-amber-900/20 border-amber-700/40 shadow-sm'
                          : 'bg-black/20 border-white/10 opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold font-display uppercase tracking-wide text-amber-500 flex items-center gap-1.5">
                          <span className="ms ms-ability-duels-renowned text-xs text-amber-600" /> Bronze Tier
                        </span>
                        {isTierAchieved('bronze', selectedAchievement) && (
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 border bg-amber-900/30 text-amber-200 border-amber-800/40 uppercase">
                            Achieved
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-sans text-neutral-300 leading-relaxed">
                        {selectedMeta?.tierDescriptions?.bronze || selectedMeta?.criteria?.bronze}
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-white/10 text-center">
                    <span className="text-[10px] font-mono text-neutral-500">
                      {selectedAchievement.is_unearned || selectedAchievement.total_awards === 0
                        ? 'Objective criteria to unlock'
                        : `Highest Honor: ${selectedAchievement.highest_tier?.toUpperCase()}`}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Floating Flavor Quote Outside & Below the Modal Window */}
            {selectedMeta?.flavorQuote && (
              <div
                className="w-full max-w-3xl pt-5 text-center space-y-1"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-base md:text-lg font-plantin italic text-white leading-relaxed drop-shadow-md">
                  "{selectedMeta.flavorQuote}"
                </p>
                {selectedMeta.flavorAttribution && (
                  <p className="text-xs font-mono font-medium text-neutral-400">
                    — {selectedMeta.flavorAttribution}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* COLUMN CUSTOMIZER MODAL */}
      {showColumnModal && (
        <div
          onClick={() => setShowColumnModal(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-md"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl max-h-[85vh] flex flex-col bg-neutral-950/92 backdrop-blur-md border border-white/20 shadow-2xl overflow-hidden"
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-white/10 flex items-center justify-between shrink-0 bg-neutral-900/60">
              <div>
                <div className="flex items-center gap-2">
                  <Columns3 className="w-5 h-5" style={{ color: accentColor }} />
                  <h2 className="text-lg font-display font-bold tracking-[0.14em] uppercase text-white">
                    CUSTOMIZE ACHIEVEMENT COLUMNS
                  </h2>
                </div>
                <p className="text-xs text-neutral-400 mt-1 font-sans">
                  Toggle column visibility and drag or click arrows to reorder table columns.
                </p>
              </div>
              <button
                onClick={() => setShowColumnModal(false)}
                className="p-1.5 text-neutral-400 hover:text-white border border-white/10 hover:border-white/20 transition-colors cursor-pointer"
                title="Close (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Column List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-2">
              {columns.map((col, idx) => {
                const isDragging = draggedIndex === idx;
                const isTarget = dragOverIndex === idx && draggedIndex !== null && draggedIndex !== idx;
                return (
                  <div
                    key={col.key}
                    draggable
                    onDragStart={(e) => handleDragStart(e, idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDrop={(e) => handleDrop(e, idx)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center justify-between p-3 border transition-all cursor-move select-none ${
                      isDragging
                        ? 'opacity-30 border-dashed border-white/40 scale-[0.98]'
                        : isTarget
                        ? 'border-2 scale-[1.02] shadow-xl ring-1'
                        : col.visible
                        ? 'bg-white/[0.04] border-white/15 hover:border-white/30'
                        : 'bg-white/[0.01] border-white/5 opacity-50'
                    }`}
                    style={{
                      borderColor: isTarget ? accentColor : undefined,
                      backgroundColor: isTarget ? `${accentColor}18` : undefined,
                      boxShadow: isTarget ? `0 0 15px ${accentColor}44` : undefined,
                    }}
                  >
                    {/* Left: Grip Handle + Checkbox + Column Info */}
                    <div className="flex items-center gap-3 min-w-0">
                      <GripVertical
                        className={`w-4 h-4 shrink-0 cursor-grab active:cursor-grabbing transition-colors ${
                          isTarget ? 'text-white' : 'text-neutral-500'
                        }`}
                      />
                      <button
                        onClick={() => toggleColumnVisibility(col.key)}
                        className={`w-4 h-4 flex items-center justify-center border text-xs cursor-pointer transition-colors ${
                          col.visible
                            ? 'border-white/40 text-white shadow-sm'
                            : 'border-white/20 text-transparent'
                        }`}
                        style={{
                          backgroundColor: col.visible ? accentColor : 'transparent',
                          borderColor: col.visible ? accentColor : undefined,
                        }}
                      >
                        {col.visible && (
                          <Check
                            className="w-3 h-3 stroke-[3]"
                            style={{ color: getContrastTextColor(accentColor) }}
                          />
                        )}
                      </button>
                      <div>
                        <div className="text-xs font-sans font-bold text-white tracking-wide flex items-center gap-2">
                          <span>{col.label}</span>
                          {isTarget && (
                            <span
                              className="text-[9px] font-mono uppercase px-1.5 py-0.2 border font-bold"
                              style={{
                                color: accentColor,
                                borderColor: `${accentColor}66`,
                                backgroundColor: `${accentColor}20`,
                              }}
                            >
                              ⇄ SWAP TO POS #{idx + 1}
                            </span>
                          )}
                        </div>
                        <div className="text-[10.5px] font-mono text-neutral-400 leading-tight">
                          {col.description}
                        </div>
                      </div>
                    </div>

                    {/* Right: Reorder Up/Down buttons */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        disabled={idx === 0}
                        onClick={() => moveColumn(idx, idx - 1)}
                        className="p-1 border border-white/10 hover:border-white/30 disabled:opacity-20 text-neutral-300 hover:text-white transition-colors cursor-pointer"
                        title="Move column left / up"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        disabled={idx === columns.length - 1}
                        onClick={() => moveColumn(idx, idx + 1)}
                        className="p-1 border border-white/10 hover:border-white/30 disabled:opacity-20 text-neutral-300 hover:text-white transition-colors cursor-pointer"
                        title="Move column right / down"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-white/10 flex items-center justify-between shrink-0 bg-neutral-900/60">
              <button
                onClick={resetColumns}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono text-neutral-400 hover:text-white transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset to Default</span>
              </button>
              <button
                onClick={() => setShowColumnModal(false)}
                className="px-6 py-2 text-xs font-sans font-bold tracking-wider uppercase shadow-md transition-colors cursor-pointer"
                style={{
                  backgroundColor: accentColor,
                  color: getContrastTextColor(accentColor),
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AchievementsView;
