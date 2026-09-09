import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X, Sparkles, LayoutGrid, Table2, ChevronLeft, ChevronRight, Home, Columns3, Eye, EyeOff } from 'lucide-react';
import { AchievementBadge } from './AchievementBadge';
import { AchievementDetailModal } from './AchievementDetailModal';
import { DeckAchievementBadge } from './DeckAchievementBadge';
import { DeckAchievementDetailModal } from './DeckAchievementDetailModal';
import { getAchievementMeta, ACHIEVEMENTS_REGISTRY, getDeckAchievementMeta, DECK_ACHIEVEMENTS_REGISTRY, AchievementTier } from '../utils/achievementBadges';
import CardImage from './CardImage';
import { PaginationFooter, GlassSearchInput, TableShell } from './common';
import { useColumnManager } from '../hooks/useColumnManager';
import { ColumnCustomizerModal } from './ColumnCustomizerModal';

interface AchievementsViewProps {
  palette: any;
  initialAchievement?: string | null;
  onClearInitialAchievement?: () => void;
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
  { key: 'achievement', label: 'Achievement', description: 'Achievement name with mini emblem badge', visible: true, width: 'flex-[1.8] min-w-[180px]', align: 'left' },
  { key: 'cards_achieved', label: 'Cards Achieved', description: 'Mini art previews of the top earning cards (click to inspect)', visible: true, width: 'flex-[3] min-w-[200px]', align: 'center' },
  { key: 'highest_tier', label: 'Highest Tier', description: 'Highest achievement tier earned', visible: true, width: 'flex-[1.1] min-w-[110px]', align: 'center' },
  { key: 'legendary', label: 'Legend', description: 'Times the Legendary tier has been earned', visible: true, width: 'flex-[0.8] min-w-[70px]', align: 'center' },
  { key: 'platinum', label: 'Platinum', description: 'Times the Platinum tier has been earned', visible: true, width: 'flex-[0.8] min-w-[70px]', align: 'center' },
  { key: 'gold', label: 'Gold', description: 'Times the Gold tier has been earned', visible: true, width: 'flex-[0.8] min-w-[70px]', align: 'center' },
  { key: 'silver', label: 'Silver', description: 'Times the Silver tier has been earned', visible: true, width: 'flex-[0.8] min-w-[70px]', align: 'center' },
  { key: 'bronze', label: 'Bronze', description: 'Times the Bronze tier has been earned', visible: true, width: 'flex-[0.8] min-w-[70px]', align: 'center' },
  { key: 'iron', label: 'Iron', description: 'Times the Iron tier has been earned', visible: false, width: 'flex-[0.8] min-w-[70px]', align: 'center' },
  { key: 'first_earned', label: 'First Earned', description: 'Date the achievement was first earned', visible: true, width: 'flex-[1.2] min-w-[110px]', align: 'center' },
  { key: 'cards', label: 'Cards', description: 'Distinct decorated cards count', visible: true, width: 'flex-[0.9] min-w-[80px]', align: 'center' },
];

const ACH_COLUMNS_STORAGE_KEY = 'rhystic_achievements_columns';


export const AchievementsView: React.FC<AchievementsViewProps> = ({
  palette,
  initialAchievement,
  onClearInitialAchievement,
  onShowCard,
}) => {
  const [activeCategory] = useState<'card'>('card');
  const [loading, setLoading] = useState(true);
  const [achievementsData, setAchievementsData] = useState<any>(null);
  const [deckAchievementsData, setDeckAchievementsData] = useState<Array<any>>([]);
  const [loadingDeck, setLoadingDeck] = useState(false);
  const [selectedAchievement, setSelectedAchievement] = useState<any>(null);
  const [selectedDeckAchievement, setSelectedDeckAchievement] = useState<any>(null);
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
    loadDeckAchievements();
  }, []);

  // Global Escape key listener to dismiss drill-down modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedAchievement(null);
        setSelectedDeckAchievement(null);
      }
    };
    if (selectedAchievement || selectedDeckAchievement) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [selectedAchievement, selectedDeckAchievement]);

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

  const loadDeckAchievements = async () => {
    setLoadingDeck(true);
    try {
      const res = await invoke<Array<any>>('get_all_deck_achievements');
      setDeckAchievementsData(res || []);
    } catch (err) {
      console.error('Failed to load all deck achievements:', err);
      setDeckAchievementsData([]);
    } finally {
      setLoadingDeck(false);
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

  // Deck achievements display list grouped by milestone ID
  const deckDisplayList = useMemo(() => {
    // Group all earned deck achievements by achievement_id
    const grouped = new Map<string, {
      achievement_id: string;
      highest_tier: AchievementTier;
      decks: Array<{ deck_name: string; tier: AchievementTier; earned_at: string; match_id: string }>;
    }>();

    const tierRank: Record<string, number> = { gold: 3, silver: 2, bronze: 1 };

    for (const entry of deckAchievementsData) {
      const aid = entry.achievement_id;
      if (!grouped.has(aid)) {
        grouped.set(aid, {
          achievement_id: aid,
          highest_tier: entry.tier as AchievementTier,
          decks: [],
        });
      }
      const g = grouped.get(aid)!;
      g.decks.push({
        deck_name: entry.deck_name,
        tier: entry.tier as AchievementTier,
        earned_at: entry.earned_at,
        match_id: entry.match_id,
      });
      if ((tierRank[entry.tier] || 1) > (tierRank[g.highest_tier] || 1)) {
        g.highest_tier = entry.tier as AchievementTier;
      }
    }

    const list: Array<any> = [];

    // Always iterate through all 6 DECK_ACHIEVEMENTS_REGISTRY entries
    for (const meta of Object.values(DECK_ACHIEVEMENTS_REGISTRY)) {
      const earned = grouped.get(meta.id);
      if (earned) {
        list.push({
          achievement_id: meta.id,
          achievement: meta.title,
          highest_tier: earned.highest_tier,
          decks: earned.decks,
          is_unearned: false,
          meta,
        });
      } else if (showUnearned) {
        list.push({
          achievement_id: meta.id,
          achievement: meta.title,
          highest_tier: 'bronze' as AchievementTier,
          decks: [],
          is_unearned: true,
          meta,
        });
      }
    }

    // Apply search filter if present
    if (achSearch.trim()) {
      const q = achSearch.toLowerCase().trim();
      return list.filter((item) => {
        return (
          item.achievement.toLowerCase().includes(q) ||
          item.meta.category.toLowerCase().includes(q) ||
          item.meta.description.toLowerCase().includes(q)
        );
      });
    }

    return list;
  }, [deckAchievementsData, showUnearned, achSearch]);

  // Open initialAchievement if passed via prop (e.g. from CardInspectorModal deep-link)
  useEffect(() => {
    if (!initialAchievement || displayList.length === 0) return;
    const meta = getAchievementMeta(initialAchievement);
    const existing = displayList.find((a: any) => {
      const aMeta = getAchievementMeta(a.achievement);
      return aMeta.id === meta.id || a.achievement.toLowerCase() === initialAchievement.toLowerCase() || aMeta.title.toLowerCase() === initialAchievement.toLowerCase();
    });
    if (existing) {
      setSelectedAchievement(existing);
    } else {
      setSelectedAchievement({
        achievement: meta.title,
        highest_tier: 'bronze',
        total_awards: 0,
        cards: [],
        is_unearned: true,
        meta,
      });
    }
    if (onClearInitialAchievement) {
      onClearInitialAchievement();
    }
  }, [initialAchievement, displayList, onClearInitialAchievement]);

  // Global listener for deep-linking into specific achievement drill-down
  useEffect(() => {
    const handleOpenAch = (e: any) => {
      const achName = e.detail?.name || e.detail?.achievement;
      if (!achName) return;
      const meta = getAchievementMeta(achName);
      const existing = displayList.find((a: any) => {
        const aMeta = getAchievementMeta(a.achievement);
        return aMeta.id === meta.id || a.achievement.toLowerCase() === achName.toLowerCase() || aMeta.title.toLowerCase() === achName.toLowerCase();
      });
      if (existing) {
        setSelectedAchievement(existing);
      } else {
        setSelectedAchievement({
          achievement: meta.title,
          highest_tier: 'bronze',
          total_awards: 0,
          cards: [],
          is_unearned: true,
          meta,
        });
      }
    };
    window.addEventListener('rhystic-open-achievement', handleOpenAch);
    return () => window.removeEventListener('rhystic-open-achievement', handleOpenAch);
  }, [displayList]);

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
  const {
    columns,
    visibleColumns,
    showColumnModal,
    setShowColumnModal,
    toggleColumnVisibility,
    moveColumn,
    resetColumns,
  } = useColumnManager<AchievementColumnDef>({
    storageKey: ACH_COLUMNS_STORAGE_KEY,
    defaultColumns: DEFAULT_ACH_COLUMNS,
  });

  // Pagination
  const [page, setPage] = useState(1);
  const TABLE_PAGE_SIZE = 30;
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
        <GlassSearchInput
          placeholder="Search achievements or cards..."
          value={achSearch}
          onChange={setAchSearch}
        />



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
        <button
          onClick={() => setShowUnearned(!showUnearned)}
          className={`flex items-center justify-center px-2.5 py-1.5 bg-transparent hover:bg-white/[0.08] active:scale-95 transition-all cursor-pointer ${
            showUnearned ? 'text-white' : 'text-neutral-300 hover:text-white'
          }`}
          title={showUnearned ? 'Show only earned achievements' : 'Show all achievements'}
        >
          {showUnearned ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4 opacity-40" />}
        </button>
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
            <div ref={setCardWrapRef} className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto custom-scrollbar p-1">
                <div
                  className="grid justify-center gap-5"
                  style={{
                    gridTemplateColumns: `repeat(${cols}, ${CARD_W}px)`,
                  }}
                >
                  {displayedCards.map((ach: any) => {
                    const meta = getAchievementMeta(ach.achievement);
                    const isUnearned = !!ach.is_unearned;

                    return (
                      <div
                        key={ach.achievement}
                        onClick={() => setSelectedAchievement(ach)}
                        className={`group relative flex flex-col justify-between p-4 border transition-all cursor-pointer select-none bg-neutral-900/40 hover:bg-neutral-900/80 hover:border-white/30 hover:shadow-xl ${
                          isUnearned
                            ? 'border-white/5 opacity-50 grayscale hover:grayscale-0 hover:opacity-90'
                            : 'border-white/10'
                        }`}
                        style={{ width: `${CARD_W}px`, height: `${CARD_H}px` }}
                      >
                        {/* Top: Embellished Header with Tier and Category */}
                        <div className="w-full flex items-center justify-between pb-2 border-b border-white/10">
                          <h4 className="text-[17px] font-bold font-sans uppercase tracking-wide text-white truncate text-left flex-1" title={meta.title}>
                            {meta.title}
                          </h4>
                          {isUnearned ? (
                            <span className="text-[9.5px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 border border-white/10 bg-white/5 text-neutral-400 shrink-0">
                              Unearned
                            </span>
                          ) : (
                            <span className={`text-[9.5px] font-mono font-bold px-2 py-0.5 border uppercase tracking-wider shrink-0 ${
                              ach.highest_tier === 'legendary' ? 'bg-gradient-to-r from-amber-500/20 via-rose-500/20 to-purple-500/20 text-rose-200 border-rose-400/50 shadow-sm'
                              : ach.highest_tier === 'platinum' ? 'bg-[#4fbbb4]/20 text-[#4fbbb4] border-[#4fbbb4]/50 shadow-sm'
                              : ach.highest_tier === 'gold' ? 'bg-amber-500/15 text-amber-300 border-amber-500/35'
                              : ach.highest_tier === 'silver' ? 'bg-slate-400/15 text-slate-200 border-slate-400/35'
                              : ach.highest_tier === 'iron' ? 'bg-zinc-700/30 text-zinc-300 border-zinc-500/35'
                              : 'bg-amber-900/25 text-amber-200 border-amber-700/35'
                            }`}>
                              {ach.highest_tier}
                            </span>
                          )}
                        </div>

                        {/* Middle: Centered Large Hero Badge Footprint */}
                        <div className={`flex-1 w-full min-h-0 flex items-center justify-center my-1 transition-transform duration-300 group-hover:scale-105 ${isUnearned ? 'opacity-35 grayscale' : ''}`}>
                          <AchievementBadge
                            title={ach.achievement}
                            tier={ach.highest_tier}
                            count={ach.total_awards}
                            size="hero"
                            showTitle={false}
                            showCount={false}
                            showTooltip={false}
                          />
                        </div>

                        {/* Awards Description */}
                        <div className="space-y-0.5 mb-1">
                          {isUnearned ? (
                            <p className="text-[11px] font-mono text-neutral-500">Click to inspect criteria</p>
                          ) : (
                            <p className="text-[11px] font-mono text-neutral-400 tabular-nums">
                              Awarded to <span className="text-white font-bold">{ach.cards?.length || 0}</span> {ach.cards?.length === 1 ? 'card' : 'cards'} ({ach.total_awards || 1}× total)
                            </p>
                          )}
                        </div>

                        {/* Bottom: Restored MVP Card Preview */}
                        <div className="w-full pt-2 border-t border-white/10 flex items-center justify-between gap-2 text-xs font-mono">
                          {isUnearned ? (
                            <div className="flex items-center justify-center w-full text-neutral-500 text-[11px] font-mono py-0.5">
                              <span>Locked · Not yet earned</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              {ach.cards?.[0] && (
                                <div className="w-8 h-8 border border-white/15 overflow-hidden shrink-0 bg-neutral-900 shadow-sm">
                                  <CardImage
                                    name={ach.cards[0].card_name || ach.cards[0].name}
                                    version="art_crop"
                                    alt={ach.cards[0].card_name || ach.cards[0].name}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              )}
                              <div className="min-w-0 flex-1 text-left">
                                <span className="text-[9px] font-mono text-neutral-500 uppercase tracking-wider block leading-none">MVP</span>
                                <span className="text-[12.5px] font-bold font-sans uppercase text-white truncate block tracking-wide" title={ach.cards?.[0]?.card_name || ach.cards?.[0]?.name}>
                                  {ach.cards?.[0]?.card_name || ach.cards?.[0]?.name || '—'}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            /* Table View */
            <TableShell
              columns={visibleColumns}
              empty={displayedCards.length === 0}
              emptyMessage="No achievements match the current filters"
              items={displayedCards}
              renderRow={(ach: any) => {
                const meta = getAchievementMeta(ach.achievement);
                const isUnearnedItem = !!ach.is_unearned;
                const rawDate = ach.first_earned_at || ach.first_earned;
                const dateStr = rawDate
                  ? new Date(rawDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                  : '—';
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
                                  ach.highest_tier === 'legendary' ? 'bg-gradient-to-r from-amber-500/20 via-rose-500/20 to-purple-500/20 text-rose-200 border-rose-400/50 shadow-sm'
                                  : ach.highest_tier === 'platinum' ? 'bg-[#4fbbb4]/20 text-[#4fbbb4] border-[#4fbbb4]/50 shadow-sm'
                                  : ach.highest_tier === 'gold' ? 'bg-amber-500/15 text-amber-300 border-amber-500/35'
                                  : ach.highest_tier === 'silver' ? 'bg-slate-400/15 text-slate-200 border-slate-400/35'
                                  : ach.highest_tier === 'iron' ? 'bg-zinc-700/30 text-zinc-300 border-zinc-500/35'
                                  : 'bg-amber-900/25 text-amber-200 border-amber-700/35'
                                }`}>{ach.highest_tier}</span>
                              )}
                            </div>
                          );
                        case 'legendary':
                        case 'platinum':
                        case 'gold':
                        case 'silver':
                        case 'bronze':
                        case 'iron':
                          const tierVal = ach[`${col.key}_count`] ?? ach[col.key] ?? 0;
                          return (
                            <div key={col.key} className={cellClass}>
                              {isUnearnedItem ? (
                                <span className="text-xs font-mono text-neutral-600">—</span>
                              ) : (
                                <span className="text-xs font-mono text-neutral-300 tabular-nums">{tierVal}</span>
                              )}
                            </div>
                          );
                        case 'total':
                          return (
                            <div key={col.key} className={cellClass}>
                              {isUnearnedItem ? (
                                <span className="text-xs font-mono text-neutral-600">—</span>
                              ) : (
                                <span className="text-xs font-mono font-bold text-white tabular-nums">{ach.total_awards || 0}</span>
                              )}
                            </div>
                          );
                        case 'cards':
                        case 'decorated_cards':
                          return (
                            <div key={col.key} className={cellClass}>
                              {isUnearnedItem ? (
                                <span className="text-xs font-mono text-neutral-600">—</span>
                              ) : (
                                <span className="text-xs font-mono text-neutral-300 tabular-nums">{ach.cards?.length || 0}</span>
                              )}
                            </div>
                          );
                        case 'first_earned':
                          return (
                            <div key={col.key} className={cellClass}>
                              <span className="text-xs font-mono text-neutral-400">{dateStr}</span>
                            </div>
                          );
                        case 'cards_achieved':
                        case 'top_earners':
                          return (
                            <div key={col.key} className={cellClass}>
                              {isUnearnedItem ? (
                                <span className="text-xs font-mono text-neutral-600">—</span>
                              ) : (
                                <div className="flex items-center gap-1.5 overflow-hidden">
                                  {topEarners.map((c: any) => {
                                    const cName = c.card_name || c.name || `Card #${c.grp_id}`;
                                    return (
                                      <div
                                        key={c.grp_id || cName}
                                        className="w-6 h-6 border border-white/15 overflow-hidden shrink-0 bg-neutral-900 shadow-sm"
                                        title={`${cName} (${c.highest_tier || 'bronze'}, ${c.count || c.award_count || 1}×)`}
                                      >
                                        <CardImage name={cName} version="art_crop" alt={cName} className="w-full h-full object-cover" />
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        default:
                          return null;
                      }
                    })}
                  </div>
                );
              }}
            />
          )}

          {/* Floating Pagination Footer */}
          {filteredList.length > 0 && (
            <PaginationFooter
              currentPage={safePage}
              totalPages={totalPages}
              onPageChange={(p, dir) => {
                if (p === 1 && dir === 'prev') {
                  pageDirRef.current = 'prev';
                  setPage(1);
                } else if (dir) {
                  goPage(dir);
                } else {
                  setPage(p);
                }
              }}
              rightSummary={
                <span className="text-xs font-mono text-neutral-400 tabular-nums">
                  <span className="text-white font-bold">{totalUnlocked.toLocaleString()}</span> of {totalPossible.toLocaleString()} achievements earned
                </span>
              }
            />
          )}
        </>
      ) : (
        /* Deck Achievements View — Coming Soon */
        <div className="flex-1 flex flex-col items-center justify-center min-h-0 py-24 text-center select-none space-y-4">
          <div className="w-16 h-16 bg-white/[0.03] border border-white/10 flex items-center justify-center text-amber-400 mx-auto shadow-xl">
            <span className="ms ms-ability-adventure text-3xl opacity-80" />
          </div>
          <div className="space-y-1">
            <h3 className="text-xl font-display font-bold tracking-wider uppercase text-white">
              Deck Achievements
            </h3>
            <span className="inline-block text-[10px] font-mono font-bold uppercase tracking-widest px-2.5 py-0.5 border border-amber-500/40 bg-amber-500/10 text-amber-300">
              Coming Soon
            </span>
          </div>
          <p className="text-xs font-sans text-neutral-400 max-w-md mx-auto leading-relaxed">
            Deck milestone honors, win streaks, and tactical endurance badges are currently in forge and will debut in an upcoming update!
          </p>
        </div>
      )}

      {/* 4. DRILL-DOWN MODAL & FLOATING FLAVOR QUOTE */}
      {selectedAchievement && (
        <AchievementDetailModal
          achievement={selectedAchievement}
          onClose={() => setSelectedAchievement(null)}
          onShowCard={onShowCard}
          palette={palette}
        />
      )}

      {selectedDeckAchievement && (
        <DeckAchievementDetailModal
          achievement={selectedDeckAchievement}
          onClose={() => setSelectedDeckAchievement(null)}
          palette={palette}
        />
      )}

      {/* COLUMN CUSTOMIZER MODAL */}
      <ColumnCustomizerModal
        isOpen={showColumnModal}
        onClose={() => setShowColumnModal(false)}
        title="CUSTOMIZE ACHIEVEMENT COLUMNS"
        subtitle="Toggle column visibility and drag or click arrows to reorder table columns."
        columns={columns}
        accentColor={accentColor}
        onToggleVisibility={toggleColumnVisibility}
        onMoveColumn={moveColumn}
        onResetColumns={resetColumns}
      />
    </div>
  );
};

export default AchievementsView;
