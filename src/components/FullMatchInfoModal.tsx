import React, { useState, useEffect } from 'react';
import { AchievementBadge } from './AchievementBadge';
import { X, CheckCircle2, XCircle, ListFilter, Clock } from 'lucide-react';
import { ManaPip } from './ManaPip';
import { CardBreakdown, CardItem } from './CardBreakdown';
import { MatchTimeline } from './MatchTimeline';
import CardImage from './CardImage';

interface FullMatchInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedMatch: any;
  cards: CardItem[];
  commanderInfo: any;
  palette: any;
  impactfulGrpIds?: Set<number>;
  impactfulCards?: any[];
  onSelectDeck?: (deckName: string) => void;
  onSelectOpponent?: (opponentName: string) => void;
  onShowCard?: (card: any, isCommander?: boolean) => void;
}

export function FullMatchInfoModal({
  isOpen,
  onClose,
  selectedMatch,
  cards,
  commanderInfo,
  palette,
  impactfulGrpIds,
  impactfulCards,
  onSelectDeck,
  onSelectOpponent,
  onShowCard,
}: FullMatchInfoModalProps) {
  const [subTab, setSubTab] = useState<'cards' | 'timeline'>('cards');

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !selectedMatch) return null;

  const renderDeckColorIdentity = (colors: any) => {
    if (!colors) return <ManaPip symbol="C" size={14} />;
    const list = Array.isArray(colors)
      ? colors
      : colors.split('').filter((c: string) => ['W', 'U', 'B', 'R', 'G'].includes(c));
    if (list.length === 0) return <ManaPip symbol="C" size={14} />;
    return (
      <div className="flex gap-1 items-center">
        {list.map((c: string, i: number) => (
          <ManaPip key={i} symbol={c} size={14} />
        ))}
      </div>
    );
  };

  const matchOutcome = (m: any): string => {
    const reason = m.result_reason || '';
    if (reason.includes('Concede')) {
      if (m.result === 'win') return 'Victory — Opponent Conceded';
      if (m.result === 'loss') return 'Defeat — Player Conceded';
      return 'Match Ended (Concede)';
    }
    if (reason.includes('Timeout')) {
      if (m.result === 'win') return 'Victory — Opponent Timeout';
      return 'Defeat — Player Timeout';
    }
    if (m.result === 'win') return 'Victory';
    if (m.result === 'loss') return 'Defeat';
    return 'Match Ended';
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-xl animate-fade-in select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[95vw] max-w-[1520px] h-[97vh] max-h-[1150px] border border-white/20 bg-neutral-950/92 backdrop-blur-md shadow-2xl flex flex-col overflow-hidden relative"
      >
        {/* Header Bar: VS Header with Status */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0 bg-neutral-900/60">
          <div className="flex-1 flex flex-col items-center justify-center text-center space-y-1">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-neutral-400">
              Full Match Inspector
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => onSelectDeck && onSelectDeck(selectedMatch.player_deck_name)}
                className="text-xl sm:text-2xl font-bold font-display uppercase tracking-wide text-white hover:underline cursor-pointer"
                title="View Deck Details"
              >
                {selectedMatch.player_deck_name}
              </button>
              <span className="text-xs font-mono font-bold text-neutral-500">VS</span>
              <button
                onClick={() => onSelectOpponent && onSelectOpponent(selectedMatch.opponent_name || 'Opponent')}
                className="text-xl sm:text-2xl font-bold font-display uppercase tracking-wide text-neutral-300 hover:text-white hover:underline cursor-pointer"
                title="View Opponent Head-to-Head Stats"
              >
                {selectedMatch.opponent_name || 'Opponent'}
              </button>
            </div>

            {/* Victory / Defeat Badge */}
            <div className="pt-0.5">
              {selectedMatch.result === 'win' ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-0.5 text-xs font-mono font-bold tracking-wider uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  <CheckCircle2 className="w-3.5 h-3.5" /> VICTORY
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-0.5 text-xs font-mono font-bold tracking-wider uppercase bg-rose-500/10 text-rose-400 border border-rose-500/30">
                  <XCircle className="w-3.5 h-3.5" /> DEFEAT
                </span>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white border border-white/10 hover:border-white/20 transition-colors self-start cursor-pointer"
            title="Close Modal (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body: 2-Panel Layout (Left Floating Sidebar + Center Main View) */}
        <div className="flex-1 overflow-hidden grid grid-cols-12 p-4 sm:p-5 gap-5 min-h-0">
          {/* Column 1: Left Floating Match Specs Sidebar (Col-Span 3) */}
          <div className="col-span-12 lg:col-span-3 flex flex-col gap-4 min-h-0 h-full overflow-y-auto custom-scrollbar pr-1 border-r border-white/10">
            {/* Brawl / Standard Brawl Commander Cards (Floating) */}
            {selectedMatch?.format_name && selectedMatch.format_name.toLowerCase().includes('brawl') && (
              <div className="space-y-2 shrink-0 border-b border-white/10 pb-3.5">
                <p className="text-[10px] font-mono uppercase tracking-wider font-bold text-neutral-400">
                  Commanders
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  {/* Player Commander */}
                  <div className="text-center flex flex-col gap-1 overflow-hidden">
                    <p className="text-[9px] font-mono text-neutral-500 uppercase shrink-0">Your Cmdr</p>
                    {commanderInfo?.player_commander ? (
                      <>
                        <div className="h-16 w-full border border-white/15 overflow-hidden bg-neutral-900 shadow">
                          <CardImage
                            name={commanderInfo.player_commander.name}
                            version="art_crop"
                            alt={commanderInfo.player_commander.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <p className="text-[11px] font-bold font-display uppercase tracking-wide text-white truncate shrink-0 mt-0.5">
                          {commanderInfo.player_commander.name}
                        </p>
                      </>
                    ) : (
                      <div className="h-16 border border-dashed border-white/10 flex items-center justify-center text-[10px] text-neutral-500 font-mono">
                        No Cmdr
                      </div>
                    )}
                  </div>

                  {/* Opponent Commander */}
                  <div className="text-center flex flex-col gap-1 overflow-hidden">
                    <p className="text-[9px] font-mono text-neutral-500 uppercase shrink-0">Opp Cmdr</p>
                    {commanderInfo?.opponent_commander ? (
                      <>
                        <div className="h-16 w-full border border-white/15 overflow-hidden bg-neutral-900 shadow">
                          <CardImage
                            name={commanderInfo.opponent_commander.name}
                            version="art_crop"
                            alt={commanderInfo.opponent_commander.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <p className="text-[11px] font-bold font-display uppercase tracking-wide text-white truncate shrink-0 mt-0.5">
                          {commanderInfo.opponent_commander.name}
                        </p>
                      </>
                    ) : (
                      <div className="h-16 border border-dashed border-white/10 flex flex-col items-center justify-center text-[10px] text-neutral-500 font-mono px-1">
                        <span>Uncast /</span>
                        <span>Unknown</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Match Specs Sidebar (Floating with dividers) */}
            <div className="space-y-3 text-xs shrink-0 pr-2">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="text-[10px] font-mono uppercase text-neutral-500">Format</span>
                <span className="font-bold font-mono px-2 py-0.5 border border-white/15 bg-black/40 text-neutral-200 uppercase">
                  {selectedMatch.format_name}
                </span>
              </div>

              {/* Side-by-Side Dual Color Identity Pips */}
              <div className="space-y-1.5 border-b border-white/10 pb-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase text-neutral-500">Your Colors</span>
                  {renderDeckColorIdentity(selectedMatch.deck_colors || selectedMatch.hero_deck_colors)}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase text-neutral-500">Opp Colors</span>
                  {renderDeckColorIdentity(selectedMatch.opponent_colors || selectedMatch.opponent_colors_str)}
                </div>
              </div>

              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="text-[10px] font-mono uppercase text-neutral-500">Duration</span>
                <span className="font-mono font-bold text-white tabular-nums">
                  {selectedMatch.turns} Turns ({Math.round(selectedMatch.duration_seconds / 60)}m)
                </span>
              </div>

              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="text-[10px] font-mono uppercase text-neutral-500">Order</span>
                <span className="font-bold text-amber-400 text-xs">
                  {selectedMatch.going_first ? 'Went First (Play)' : 'Went Second (Draw)'}
                </span>
              </div>

              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="text-[10px] font-mono uppercase text-neutral-500">Mulligans</span>
                <div className="font-mono font-bold text-xs text-right tabular-nums">
                  <span className={(selectedMatch.player_mulligans ?? 0) > 0 ? 'text-amber-400' : 'text-emerald-400'}>
                    {selectedMatch.player_mulligans ?? 0}
                  </span>
                  <span className="text-neutral-500 px-1 font-normal">vs</span>
                  <span className={(selectedMatch.opponent_mulligans ?? 0) > 0 ? 'text-amber-400' : 'text-emerald-400'}>
                    {selectedMatch.opponent_mulligans ?? 0}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="text-[10px] font-mono uppercase text-neutral-500">Ending Life</span>
                <div className="font-mono font-bold text-xs text-right tabular-nums">
                  <span className="text-emerald-400">{selectedMatch.player_life_end ?? 20} HP</span>
                  <span className="text-neutral-500 px-1 font-normal">vs</span>
                  <span className="text-rose-400">{selectedMatch.opponent_life_end ?? 0} HP</span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-mono uppercase text-neutral-500">Outcome</span>
                <span className={`font-mono font-bold text-xs block ${selectedMatch.result === 'win' ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {matchOutcome(selectedMatch)}
                </span>
              </div>
            </div>
          </div>

          {/* Column 2: Full Width Center View Container (Col-Span 9) */}
          <div className="col-span-12 lg:col-span-9 flex flex-col space-y-3 overflow-hidden min-h-0">
            {/* Match Honors & Impactful Cards Shelf (Floating) */}
            {impactfulCards && impactfulCards.length > 0 && (
              <div className="space-y-1.5 shrink-0 border-b border-white/10 pb-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="ms ms-ability-duels-renowned text-amber-400 text-xs" />
                    <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-neutral-400">
                      Match Honors & MVPs
                    </span>
                  </div>
                  <span className="text-[9.5px] font-mono text-neutral-500 tabular-nums">
                    {impactfulCards.length} {impactfulCards.length === 1 ? 'Card' : 'Cards'} Recognized
                  </span>
                </div>
                <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1">
                  {impactfulCards.map((c, i) => {
                    const titles: string[] = c.titles || [];
                    return (
                      <div
                        key={i}
                        onClick={() => onShowCard?.(c)}
                        className="flex items-center gap-2 px-2 py-1 border border-white/10 bg-black/40 hover:bg-white/5 transition-colors cursor-pointer shrink-0 group min-w-[190px]"
                        title="Click to view card details"
                      >
                        <div className="w-8 h-8 border border-white/15 overflow-hidden shrink-0 bg-neutral-900">
                          <CardImage
                            name={c.name}
                            version="art_crop"
                            alt={c.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        </div>
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-xs font-bold font-display uppercase tracking-wide text-white truncate group-hover:underline leading-tight">
                            {c.name}
                          </span>
                          <div className="flex flex-wrap items-center gap-1 mt-0.5">
                            {titles.length > 0 ? (
                              titles.map((t, ti) => (
                                <AchievementBadge
                                  key={ti}
                                  title={t}
                                  size="sm"
                                  showTooltip={true}
                                />
                              ))
                            ) : (
                              <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 border border-amber-500/30 bg-amber-500/10 text-amber-400">
                                {c.total_damage} Total DMG
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Main View Switcher */}
            <div className="flex items-center border border-white/10 bg-black/40 shrink-0">
              <button
                onClick={() => setSubTab('cards')}
                className={`flex-1 py-1.5 text-xs font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                  subTab === 'cards'
                    ? 'border border-white/20 bg-white/10 text-white'
                    : 'text-neutral-400 hover:text-white border border-transparent'
                }`}
              >
                <ListFilter className="w-3.5 h-3.5" />
                Side-by-Side Card Breakdown ({cards.length})
              </button>
              <button
                onClick={() => setSubTab('timeline')}
                className={`flex-1 py-1.5 text-xs font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer border-l border-white/10 ${
                  subTab === 'timeline'
                    ? 'border border-white/20 bg-white/10 text-white'
                    : 'text-neutral-400 hover:text-white border border-transparent'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                Play Timeline
              </button>
            </div>

            {/* Sub-View Content */}
            <div className="flex-1 overflow-hidden min-h-0">
              {subTab === 'cards' ? (
                <div className="h-full overflow-hidden">
                  <CardBreakdown
                    cards={cards}
                    palette={palette}
                    impactfulGrpIds={impactfulGrpIds}
                    onCardClick={(card) => {
                      onShowCard?.(card);
                    }}
                  />
                </div>
              ) : (
                <div className="h-full overflow-hidden">
                  <MatchTimeline
                    matchId={selectedMatch.match_id}
                    turns={selectedMatch.turns}
                    goingFirst={selectedMatch.going_first}
                    result={selectedMatch.result}
                    palette={palette}
                    cards={cards}
                    onCardClick={(card) => {
                      onShowCard?.(card);
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FullMatchInfoModal;
