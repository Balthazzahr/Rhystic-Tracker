import React, { useState, useMemo, useRef } from 'react';
import { ChevronRight, ChevronLeft, ChevronDown, ExternalLink, Minimize2, Search, X, Pin } from 'lucide-react';
import { RenderManaCost } from '../../utils/manaUtils';
import CardImage from '../CardImage';
import symbolIcon from '../../assets/RhysticTrackerICON.svg';
import { TrackerCardItem } from './CardOddsHoverTooltip';

export interface DeckTrackerData {
  initial_total: number;
  total_library_cards: number;
  lands_initial: number;
  lands_remaining: number;
  creatures_remaining?: number;
  spells_remaining?: number;
  permanents_remaining?: number;
  nonpermanents_remaining?: number;
  land_odds_next: number;
  creature_odds_next?: number;
  spell_odds_next?: number;
  permanent_odds_next?: number;
  nonpermanent_odds_next?: number;
  land_odds_in_2: number;
  land_odds_in_3: number;
  commander?: TrackerCardItem | null;
  cards: TrackerCardItem[];
}

interface LiveDeckTrackerPanelProps {
  trackerData?: DeckTrackerData | null;
  turn?: number;
  deckName?: string;
  formatName?: string;
  isOverlay?: boolean;
  defaultExpanded?: boolean;
  onPopOut?: () => void;
  onDockBack?: () => void;
}

type SortMode = 'odds' | 'mana' | 'name';

export function getCardTypeIconClass(cardType?: string | null): string {
  if (!cardType) return 'ms ms-multiple';
  const t = cardType.toLowerCase();
  if (t.includes('creature')) return 'ms ms-creature';
  if (t.includes('instant')) return 'ms ms-instant';
  if (t.includes('sorcery')) return 'ms ms-sorcery';
  if (t.includes('enchantment')) return 'ms ms-enchantment';
  if (t.includes('artifact')) return 'ms ms-artifact';
  if (t.includes('planeswalker')) return 'ms ms-planeswalker';
  if (t.includes('land')) return 'ms ms-land';
  if (t.includes('battle')) return 'ms ms-battle';
  return 'ms ms-multiple';
}

export const LiveDeckTrackerPanel: React.FC<LiveDeckTrackerPanelProps> = ({
  trackerData,
  turn = 0,
  deckName = 'Current Deck',
  formatName = '',
  isOverlay = false,
  defaultExpanded = false,
  onPopOut,
  onDockBack,
}) => {
  // If in overlay mode, always remain in the full expanded deck list
  const [isExpanded, setIsExpanded] = useState<boolean>(isOverlay || defaultExpanded);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    return (localStorage.getItem('deckTrackerSortMode') as SortMode) || 'mana';
  });
  const [selectedCard, setSelectedCard] = useState<TrackerCardItem | null>(null);
  const [previewPlacement, setPreviewPlacement] = useState<'bottom' | 'top'>('bottom');
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Fold/collapse states with persistence across games
  const [isHandFolded, setIsHandFolded] = useState<boolean>(() => {
    return localStorage.getItem('deckTrackerHandFolded') === 'true';
  });
  const [isBoardFolded, setIsBoardFolded] = useState<boolean>(() => {
    return localStorage.getItem('deckTrackerBoardFolded') === 'true';
  });
  const [isDeadFolded, setIsDeadFolded] = useState<boolean>(() => {
    return localStorage.getItem('deckTrackerDeadFolded') === 'true';
  });

  const handleSetSortMode = (mode: SortMode) => {
    setSortMode(mode);
    localStorage.setItem('deckTrackerSortMode', mode);
  };

  const handleToggleHandFold = () => {
    setIsHandFolded((prev) => {
      const next = !prev;
      localStorage.setItem('deckTrackerHandFolded', String(next));
      return next;
    });
  };

  const handleToggleBoardFold = () => {
    setIsBoardFolded((prev) => {
      const next = !prev;
      localStorage.setItem('deckTrackerBoardFolded', String(next));
      return next;
    });
  };

  const handleToggleDeadFold = () => {
    setIsDeadFolded((prev) => {
      const next = !prev;
      localStorage.setItem('deckTrackerDeadFolded', String(next));
      return next;
    });
  };

  const activePreviewCard = selectedCard;

  const libraryCards = trackerData?.total_library_cards ?? 0;
  const initialCards = trackerData?.initial_total ?? 60;
  const landsLeft = trackerData?.lands_remaining ?? 0;
  const creaturesLeft = trackerData?.creatures_remaining ?? trackerData?.permanents_remaining ?? 0;
  const spellsLeft = trackerData?.spells_remaining ?? trackerData?.nonpermanents_remaining ?? 0;

  const landOddsNext = Math.round(trackerData?.land_odds_next ?? 0);
  const creatureOddsNext = Math.round(trackerData?.creature_odds_next ?? trackerData?.permanent_odds_next ?? 0);
  const spellOddsNext = Math.round(trackerData?.spell_odds_next ?? trackerData?.nonpermanent_odds_next ?? 0);

  const isBrawl = useMemo(() => {
    const f = (formatName || '').toLowerCase();
    return f.includes('brawl') || f.includes('commander') || !!trackerData?.commander;
  }, [formatName, trackerData?.commander]);

  const commanderCard = trackerData?.commander || null;

  // Group and sort cards into sections
  const { handCards, boardCards, deckCards, deadCards } = useMemo(() => {
    if (!trackerData?.cards) {
      return { handCards: [], boardCards: [], deckCards: [], deadCards: [] };
    }

    let list = [...trackerData.cards];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (c) => c.name.toLowerCase().includes(q) || (c.card_type && c.card_type.toLowerCase().includes(q))
      );
    }

    const sortFn = (a: TrackerCardItem, b: TrackerCardItem) => {
      if (sortMode === 'odds') {
        return b.odds_next - a.odds_next || a.cmc - b.cmc || a.name.localeCompare(b.name);
      } else if (sortMode === 'mana') {
        return a.cmc - b.cmc || a.name.localeCompare(b.name);
      } else {
        return a.name.localeCompare(b.name);
      }
    };

    const inHand: TrackerCardItem[] = [];
    const onBoard: TrackerCardItem[] = [];
    const inDeck: TrackerCardItem[] = [];
    const inGraveExile: TrackerCardItem[] = [];

    for (const card of list) {
      const h = card.in_hand || 0;
      const b = card.on_battlefield || 0;
      const g = (card.in_graveyard || 0) + (card.in_exile || 0);
      const rem = card.remaining_count;

      if (h > 0) inHand.push(card);
      if (b > 0) onBoard.push(card);
      if (rem > 0) inDeck.push(card);
      if (g > 0) inGraveExile.push(card);
    }

    inHand.sort(sortFn);
    onBoard.sort(sortFn);
    inDeck.sort(sortFn);
    inGraveExile.sort(sortFn);

    return { handCards: inHand, boardCards: onBoard, deckCards: inDeck, deadCards: inGraveExile };
  }, [trackerData?.cards, searchQuery, sortMode]);

  const handleCardClick = (card: TrackerCardItem, targetEl?: HTMLElement | null) => {
    try {
      if (selectedCard?.grp_id === card.grp_id) {
        setSelectedCard(null);
        return;
      }
      if (scrollContainerRef.current && targetEl) {
        const containerRect = scrollContainerRef.current.getBoundingClientRect();
        const cardRect = targetEl.getBoundingClientRect();
        const relativeTop = cardRect.top - containerRect.top;
        if (relativeTop > containerRect.height * 0.52) {
          setPreviewPlacement('top');
        } else {
          setPreviewPlacement('bottom');
        }
      } else {
        setPreviewPlacement('bottom');
      }
      setSelectedCard(card);
    } catch (err) {
      console.error('Failed to calculate card placement on click:', err);
      setSelectedCard(card);
    }
  };

  /* ------------------------------------------------------------- */
  /* 1. Compact Slim Mini-Rail (Weighted strictly at the top)       */
  /* ------------------------------------------------------------- */
  if (!isExpanded && !isOverlay) {
    return (
      <aside
        aria-label="Deck Tracker Mini Rail"
        className="w-11 bg-neutral-950/95 border-r border-b border-white/10 flex flex-col items-center py-2.5 select-none transition-all duration-150 rounded-none shadow-xl shrink-0 self-start"
      >
        {/* Top: Controls */}
        <div className="flex flex-col items-center gap-2">
          {/* Expand button ('>') */}
          <button
            onClick={() => setIsExpanded(true)}
            className="p-1.5 text-amber-400 hover:text-amber-300 hover:bg-white/10 transition-colors border border-amber-500/30 flex items-center justify-center rounded-none shadow"
            title="Expand Deck Tracker Overlay"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Pop-out detached window button */}
          {onPopOut && (
            <button
              onClick={onPopOut}
              className="p-1.5 text-neutral-400 hover:text-white hover:bg-white/10 transition-colors border border-transparent hover:border-white/10 rounded-none"
              title="Pop out into floating window"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Separator */}
        <div className="w-6 border-b border-white/10 my-2.5" />

        {/* Metrics vertically grouped directly below controls */}
        <div className="flex flex-col items-center gap-2.5">
          {/* Turn Count */}
          <div
            className="flex flex-col items-center justify-center bg-black/60 border border-white/10 px-1 py-1 w-8 font-mono text-[11px] font-bold text-neutral-200"
            title={`Current Turn: ${turn}`}
          >
            <span className="text-[8.5px] uppercase tracking-wider text-neutral-400 font-sans">T</span>
            <span>{turn}</span>
          </div>

          {/* Land Draw % */}
          <div
            className="flex flex-col items-center justify-center bg-emerald-950/60 border border-emerald-500/40 px-1 py-1 w-8 font-mono text-emerald-300"
            title={`Land Draw Chance: ${landOddsNext}% next draw (${landsLeft} of ${libraryCards} left)`}
          >
            <i className="ms ms-land text-[11px] text-emerald-400 mb-0.5" />
            <span className="text-[10px] font-black">{landOddsNext}%</span>
          </div>

          {/* Library Cards Left */}
          <div
            className="flex flex-col items-center justify-center bg-black/40 border border-white/10 px-1 py-1 w-8 font-mono text-[10px]"
            title={`Cards remaining in library: ${libraryCards} of ${initialCards}`}
          >
            <span className="font-extrabold text-white">{libraryCards}</span>
            <span className="text-neutral-600 text-[8px] leading-tight">/</span>
            <span className="text-neutral-400 text-[9px]">{initialCards}</span>
          </div>
        </div>

        {/* Rhystic Tracker Icon anchor */}
        <div className="mt-3 opacity-60 hover:opacity-100 transition-opacity">
          <img src={symbolIcon} alt="Rhystic Tracker" className="w-3.5 h-3.5 object-contain" />
        </div>
      </aside>
    );
  }

  /* ------------------------------------------------------------- */
  /* Helper to render a card row                                   */
  /* ------------------------------------------------------------- */
  const renderCardRow = (card: TrackerCardItem, sectionType: 'hand' | 'board' | 'deck' | 'dead') => {
    const isZeroLeft = card.remaining_count === 0;
    const inHand = card.in_hand || 0;
    const onBoard = card.on_battlefield || 0;
    const inGrave = card.in_graveyard || 0;
    const inExile = card.in_exile || 0;
    const isSelected = selectedCard?.grp_id === card.grp_id;
    const typeIconClass = getCardTypeIconClass(card.card_type);

    let textColorClass = 'text-neutral-200';
    if (sectionType === 'hand') textColorClass = 'text-sky-300 font-semibold';
    else if (sectionType === 'board') textColorClass = 'text-emerald-300 font-semibold';
    else if (sectionType === 'dead') textColorClass = 'text-neutral-500 line-through';

    return (
      <div
        key={`${sectionType}-${card.grp_id}`}
        onClick={(e) => handleCardClick(card, e.currentTarget)}
        className={`flex items-center justify-between px-2.5 py-1.5 cursor-pointer transition-colors ${
          isSelected
            ? 'bg-amber-500/20 border-l-2 border-amber-400'
            : 'hover:bg-white/5'
        } ${sectionType === 'dead' ? 'opacity-40 grayscale' : ''}`}
      >
        {/* Left: Mana Cost & Card Name */}
        <div className="flex items-center gap-1.5 truncate flex-1 mr-2 min-w-0">
          {card.mana_cost ? (
            <div className="scale-85 origin-left shrink-0">
              <RenderManaCost costStr={card.mana_cost} size={12} />
            </div>
          ) : (
            <div className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
              <i className={`${typeIconClass} text-[10px] text-neutral-400`} />
            </div>
          )}

          <span className={`font-sans text-xs truncate font-medium ${textColorClass}`}>
            {card.name}
          </span>

          {/* Zone Badges */}
          <div className="flex items-center gap-1 shrink-0 ml-1">
            {inHand > 0 && sectionType !== 'hand' && (
              <span
                className="px-1 py-0.2 text-[9px] font-mono font-bold uppercase bg-sky-950/70 text-sky-300 border border-sky-500/30"
                title={`${inHand} in hand`}
              >
                {inHand > 1 ? `${inHand}H` : 'H'}
              </span>
            )}
            {onBoard > 0 && sectionType !== 'board' && (
              <span
                className="px-1 py-0.2 text-[9px] font-mono font-bold uppercase bg-emerald-950/70 text-emerald-300 border border-emerald-500/30"
                title={`${onBoard} on battlefield`}
              >
                {onBoard > 1 ? `${onBoard}B` : 'B'}
              </span>
            )}
            {inGrave > 0 && sectionType !== 'dead' && (
              <span
                className="px-1 py-0.2 text-[9px] font-mono font-bold uppercase bg-neutral-900 text-neutral-400 border border-white/10"
                title={`${inGrave} in graveyard`}
              >
                {inGrave > 1 ? `${inGrave}G` : 'G'}
              </span>
            )}
            {inExile > 0 && sectionType !== 'dead' && (
              <span
                className="px-1 py-0.2 text-[9px] font-mono font-bold uppercase bg-purple-950/70 text-purple-300 border border-purple-500/30"
                title={`${inExile} in exile`}
              >
                {inExile > 1 ? `${inExile}E` : 'E'}
              </span>
            )}
          </div>
        </div>

        {/* Right: Remaining / Initial & Next Draw % */}
        <div className="flex items-center gap-2 shrink-0 font-mono text-xs">
          <span className="text-neutral-400">
            {sectionType === 'hand' ? (
              <span className="text-sky-300 font-bold">{inHand} in hand</span>
            ) : sectionType === 'board' ? (
              <span className="text-emerald-300 font-bold">{onBoard} on board</span>
            ) : sectionType === 'dead' ? (
              <span className="text-neutral-500">{inGrave + inExile} gone</span>
            ) : (
              <>
                <span className={isZeroLeft ? 'text-neutral-500' : 'text-white font-bold'}>
                  {card.remaining_count}
                </span>
                <span className="text-neutral-600 text-[10px]">/{card.initial_count}</span>
              </>
            )}
          </span>

          <span
            className={`w-9 text-right font-extrabold ${
              isZeroLeft || sectionType !== 'deck' ? 'text-neutral-600' : 'text-amber-300'
            }`}
          >
            {sectionType === 'deck' ? `${Math.round(card.odds_next)}%` : '—'}
          </span>
        </div>
      </div>
    );
  };

  /* ------------------------------------------------------------- */
  /* 2. Expanded Decklist Overlay View                             */
  /* ------------------------------------------------------------- */
  return (
    <div
      className={`flex flex-col border select-none transition-all duration-150 rounded-none shrink-0 ${
        isOverlay
          ? 'w-full h-full bg-neutral-950 border-white/20 shadow-2xl'
          : 'w-[280px] h-full bg-neutral-950 border-r border-white/20 shadow-2xl z-20'
      }`}
    >
      {/* Header bar */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-neutral-900/80"
        data-tauri-drag-region={isOverlay ? 'true' : undefined}
      >
        <div className="flex items-center gap-1.5 truncate">
          <img src={symbolIcon} alt="Rhystic Tracker" className="w-3.5 h-3.5 object-contain shrink-0" />
          <span className="font-sans text-[11px] font-bold uppercase tracking-wider text-white truncate">
            {deckName}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {!isOverlay && onPopOut && (
            <button
              onClick={onPopOut}
              className="p-1 text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Pop out into floating window"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}

          {isOverlay && onDockBack && (
            <button
              onClick={onDockBack}
              className="p-1 text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Close floating overlay"
            >
              <Minimize2 className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Fold button ('<') - only when docked in main app */}
          {!isOverlay && (
            <button
              onClick={() => setIsExpanded(false)}
              className="p-1 text-amber-400 hover:text-amber-300 hover:bg-white/10 transition-colors border border-amber-500/30 flex items-center gap-0.5 text-[11px] font-bold px-1.5"
              title="Collapse to Mini Rail"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Repurposed Draw Probabilities & Library Banner */}
      <div className="bg-black/70 border-b border-white/10 p-2.5 flex flex-col gap-2">
        {/* Total Cards In Library Header */}
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-neutral-400 font-sans uppercase font-bold tracking-wider text-[10px]">
            Total Cards In Library:
          </span>
          <div className="font-mono text-sm font-black text-white">
            <span className="text-emerald-400">{libraryCards}</span>
            <span className="text-neutral-500 text-xs"> of </span>
            <span className="text-neutral-300 text-xs">{initialCards}</span>
          </div>
        </div>

        {/* Chance To Draw Sub-Header & Probability Cards */}
        <div className="flex flex-col gap-1 pt-0.5">
          <div className="text-[9px] font-sans font-bold uppercase tracking-wider text-neutral-400">
            Chance to Draw
          </div>

          <div className="grid grid-cols-3 gap-1.5 text-center">
            {/* Chance of drawing a land next */}
            <div className="bg-neutral-900/90 border border-emerald-500/30 py-1 px-1 flex flex-col items-center">
              <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-emerald-400 font-sans font-bold">
                <i className="ms ms-land text-[11px]" />
                <span>Land</span>
              </div>
              <div className="font-mono text-base font-black text-emerald-300 mt-0.5">{landOddsNext}%</div>
              <div className="text-[8.5px] font-mono text-neutral-400">{landsLeft} left</div>
            </div>

            {/* Chance of drawing a creature next */}
            <div className="bg-neutral-900/90 border border-amber-500/30 py-1 px-1 flex flex-col items-center">
              <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-amber-400 font-sans font-bold">
                <i className="ms ms-creature text-[11px]" />
                <span>Creatures</span>
              </div>
              <div className="font-mono text-base font-black text-amber-300 mt-0.5">{creatureOddsNext}%</div>
              <div className="text-[8.5px] font-mono text-neutral-400">{creaturesLeft} left</div>
            </div>

            {/* Chance of drawing a non-creature spell next */}
            <div className="bg-neutral-900/90 border border-indigo-500/30 py-1 px-1 flex flex-col items-center">
              <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-indigo-400 font-sans font-bold">
                <i className="ms ms-instant text-[11px]" />
                <span>Spells</span>
              </div>
              <div className="font-mono text-base font-black text-indigo-300 mt-0.5">{spellOddsNext}%</div>
              <div className="text-[8.5px] font-mono text-neutral-400">{spellsLeft} left</div>
            </div>
          </div>
        </div>
      </div>

      {/* Search and Sort Toolbar */}
      <div className="flex items-center justify-between gap-1.5 px-2.5 py-1.5 border-b border-white/10 bg-neutral-900/40 text-[11px]">
        <div className="relative flex-1">
          <Search className="w-3 h-3 text-neutral-500 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search deck..."
            className="w-full bg-black/40 border border-white/10 pl-6 pr-2 py-0.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-400 rounded-none"
          />
        </div>

        <div className="flex items-center gap-0.5 bg-black/40 border border-white/10 p-0.5 shrink-0">
          <button
            onClick={() => handleSetSortMode('odds')}
            className={`px-1.5 py-0.5 text-[10px] font-sans uppercase font-bold transition-colors ${
              sortMode === 'odds' ? 'bg-amber-500/20 text-amber-300' : 'text-neutral-400 hover:text-white'
            }`}
            title="Sort by draw probability"
          >
            %
          </button>
          <button
            onClick={() => handleSetSortMode('mana')}
            className={`px-1.5 py-0.5 text-[10px] font-sans uppercase font-bold transition-colors ${
              sortMode === 'mana' ? 'bg-amber-500/20 text-amber-300' : 'text-neutral-400 hover:text-white'
            }`}
            title="Sort by mana cost"
          >
            Mana
          </button>
          <button
            onClick={() => handleSetSortMode('name')}
            className={`px-1.5 py-0.5 text-[10px] font-sans uppercase font-bold transition-colors ${
              sortMode === 'name' ? 'bg-amber-500/20 text-amber-300' : 'text-neutral-400 hover:text-white'
            }`}
            title="Sort by card name"
          >
            Name
          </button>
        </div>
      </div>

      {/* Top Preview Tray (When hovering/clicking a card at the bottom of the list) */}
      {activePreviewCard && previewPlacement === 'top' && (
        <CardPreviewTray
          card={activePreviewCard}
          libraryCards={libraryCards}
          onClose={() => setSelectedCard(null)}
          placement="top"
        />
      )}

      {/* Cards List Grouped into Sections */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto min-h-0 divide-y divide-white/5 scrollbar-thin scrollbar-thumb-white/20"
      >
        {/* Commander Section (Only shown in Brawl / Commander games) */}
        {isBrawl && commanderCard && (
          <div>
            <div className="w-full bg-amber-950/40 border-y border-amber-500/30 px-2.5 py-1 flex items-center justify-between sticky top-0 z-10 backdrop-blur-sm">
              <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                <i className="ms ms-planeswalker text-[11px] text-amber-400" />
                Commander
              </span>
              <span className="px-1.5 py-0.2 text-[9px] font-mono font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Command Zone
              </span>
            </div>
            {renderCardRow(commanderCard, 'deck')}
          </div>
        )}

        {/* Section 1: Cards in Hand */}
        {handCards.length > 0 && (
          <div>
            <button
              type="button"
              onClick={handleToggleHandFold}
              className="w-full bg-sky-950/40 hover:bg-sky-900/40 border-y border-sky-500/20 px-2.5 py-1 flex items-center justify-between sticky top-0 z-10 backdrop-blur-sm cursor-pointer transition-colors"
            >
              <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-sky-300 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                Cards in Hand ({handCards.reduce((acc, c) => acc + (c.in_hand || 1), 0)})
              </span>
              {isHandFolded ? (
                <ChevronRight className="w-3.5 h-3.5 text-sky-400/70" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-sky-400/70" />
              )}
            </button>
            {!isHandFolded && handCards.map((c) => renderCardRow(c, 'hand'))}
          </div>
        )}

        {/* Section 2: Cards on the Battlefield */}
        {boardCards.length > 0 && (
          <div>
            <button
              type="button"
              onClick={handleToggleBoardFold}
              className="w-full bg-emerald-950/40 hover:bg-emerald-900/40 border-y border-emerald-500/20 px-2.5 py-1 flex items-center justify-between sticky top-0 z-10 backdrop-blur-sm cursor-pointer transition-colors"
            >
              <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Cards on Battlefield ({boardCards.reduce((acc, c) => acc + (c.on_battlefield || 1), 0)})
              </span>
              {isBoardFolded ? (
                <ChevronRight className="w-3.5 h-3.5 text-emerald-400/70" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-emerald-400/70" />
              )}
            </button>
            {!isBoardFolded && boardCards.map((c) => renderCardRow(c, 'board'))}
          </div>
        )}

        {/* Section 3: Cards Still in Deck */}
        <div>
          <div className="bg-neutral-900/90 border-y border-white/10 px-2.5 py-1 flex items-center justify-between sticky top-0 z-10 backdrop-blur-sm">
            <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              Cards Still in Deck ({deckCards.reduce((acc, c) => acc + c.remaining_count, 0)})
            </span>
          </div>
          {deckCards.length === 0 ? (
            <div className="p-3 text-center text-xs text-neutral-500 font-sans uppercase">
              No cards remaining in deck
            </div>
          ) : (
            deckCards.map((c) => renderCardRow(c, 'deck'))
          )}
        </div>

        {/* Section 4: Cards in Graveyard or Exile (Diminished) */}
        {deadCards.length > 0 && (
          <div>
            <button
              type="button"
              onClick={handleToggleDeadFold}
              className="w-full bg-black/60 hover:bg-neutral-900/60 border-y border-white/5 px-2.5 py-1 flex items-center justify-between sticky top-0 z-10 backdrop-blur-sm cursor-pointer transition-colors"
            >
              <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-neutral-600" />
                Cards in Graveyard / Exile ({deadCards.reduce((acc, c) => acc + (c.in_graveyard || 0) + (c.in_exile || 0), 0)})
              </span>
              {isDeadFolded ? (
                <ChevronRight className="w-3.5 h-3.5 text-neutral-500" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-neutral-500" />
              )}
            </button>
            {!isDeadFolded && deadCards.map((c) => renderCardRow(c, 'dead'))}
          </div>
        )}
      </div>

      {/* Bottom Preview Tray (Default placement) */}
      {activePreviewCard && previewPlacement === 'bottom' && (
        <CardPreviewTray
          card={activePreviewCard}
          libraryCards={libraryCards}
          onClose={() => setSelectedCard(null)}
          placement="bottom"
        />
      )}
    </div>
  );
};

/* ------------------------------------------------------------- */
/* Card Preview Tray Component (Renders at top or bottom)       */
/* ------------------------------------------------------------- */
interface CardPreviewTrayProps {
  card: TrackerCardItem;
  libraryCards: number;
  onClose: () => void;
  placement: 'top' | 'bottom';
}

const CardPreviewTray: React.FC<CardPreviewTrayProps> = ({
  card,
  libraryCards,
  onClose,
  placement,
}) => {
  return (
    <div
      className={`shrink-0 bg-neutral-950 p-2.5 flex flex-col gap-2 shadow-2xl z-30 ${
        placement === 'top'
          ? 'border-b-2 border-amber-500/50 animate-in slide-in-from-top-2 duration-150'
          : 'border-t-2 border-amber-500/50 animate-in slide-in-from-bottom-2 duration-150'
      }`}
    >
      <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
        <div className="flex items-center gap-1.5 truncate">
          <i className={`${getCardTypeIconClass(card.card_type)} text-amber-400 text-xs shrink-0`} />
          <span className="font-bold text-xs text-white truncate">{card.name}</span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {card.mana_cost && (
            <div className="origin-right">
              <RenderManaCost costStr={card.mana_cost} size={14} />
            </div>
          )}
          <button
            onClick={onClose}
            className="p-0.5 text-neutral-400 hover:text-white hover:bg-white/10 transition-colors ml-1"
            title="Close Card Preview"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex gap-2.5 items-start">
        {/* Thumbnail Card Art */}
        <div className="w-[84px] h-[116px] shrink-0 border border-white/20 bg-black/60 overflow-hidden shadow">
          <CardImage name={card.name} version="normal" className="w-full h-full object-cover" />
        </div>

        {/* Odds & Copies Breakdown */}
        <div className="flex-1 min-w-0 flex flex-col justify-between h-[116px] py-0.5">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-neutral-400 font-sans uppercase tracking-wider truncate">
              {card.card_type || (card.is_land ? 'Land' : 'Spell')}
            </span>
            <div className="text-[11px] font-mono text-neutral-300">
              <span className="text-neutral-400">Library: </span>
              <span className={card.remaining_count > 0 ? 'text-emerald-400 font-bold' : 'text-neutral-500'}>
                {card.remaining_count}
              </span>
              <span className="text-neutral-500"> / {card.initial_count}</span>
              <span className="text-neutral-500 text-[10px] ml-1">({libraryCards} left)</span>
            </div>

            {/* Current Zone Distribution */}
            <div className="flex items-center gap-1.5 text-[10px] font-mono pt-1 text-neutral-400 flex-wrap">
              {(card.in_hand || 0) > 0 && <span className="text-sky-300">Hand: {card.in_hand}</span>}
              {(card.on_battlefield || 0) > 0 && (
                <span className="text-emerald-300">Board: {card.on_battlefield}</span>
              )}
              {(card.in_graveyard || 0) > 0 && (
                <span className="text-neutral-400">Grave: {card.in_graveyard}</span>
              )}
              {(card.in_exile || 0) > 0 && <span className="text-purple-300">Exile: {card.in_exile}</span>}
            </div>
          </div>

          {/* Multi-Draw Odds Grid */}
          <div className="grid grid-cols-3 gap-1 text-center pt-1 border-t border-white/10">
            <div className="bg-black/50 border border-white/5 py-0.5 px-0.5">
              <div className="text-[8.5px] uppercase tracking-wider text-neutral-400 font-sans">Next</div>
              <div
                className={`font-mono text-xs font-extrabold ${
                  card.remaining_count > 0 ? 'text-amber-300' : 'text-neutral-600'
                }`}
              >
                {Math.round(card.odds_next)}%
              </div>
            </div>
            <div className="bg-black/50 border border-white/5 py-0.5 px-0.5">
              <div className="text-[8.5px] uppercase tracking-wider text-neutral-400 font-sans">In 2</div>
              <div
                className={`font-mono text-xs font-extrabold ${
                  card.remaining_count > 0 ? 'text-amber-300' : 'text-neutral-600'
                }`}
              >
                {Math.round(card.odds_in_2)}%
              </div>
            </div>
            <div className="bg-black/50 border border-white/5 py-0.5 px-0.5">
              <div className="text-[8.5px] uppercase tracking-wider text-neutral-400 font-sans">In 3</div>
              <div
                className={`font-mono text-xs font-extrabold ${
                  card.remaining_count > 0 ? 'text-amber-300' : 'text-neutral-600'
                }`}
              >
                {Math.round(card.odds_in_3)}%
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
