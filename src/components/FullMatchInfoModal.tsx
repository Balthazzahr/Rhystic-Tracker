import React, { useState, useEffect } from 'react';
import { AchievementBadge } from './AchievementBadge';
import { X, CheckCircle2, XCircle, ListFilter, Clock } from 'lucide-react';
import { ManaPip } from './ManaPip';
import { CardBreakdown, CardItem } from './CardBreakdown';
import { MatchTimeline } from './MatchTimeline';
import CardImage from './CardImage';
import AvatarImage from './AvatarImage';
import PlatformBadge, { formatPlatformName } from './PlatformBadge';

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

  const heroPlatform = selectedMatch.hero_platform;
  const oppPlatform = selectedMatch.opponent_platform;
  const heroAvatar = selectedMatch.hero_avatar;
  const oppAvatar = selectedMatch.opponent_avatar;
  const isWin = selectedMatch.result === 'win';

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-3 sm:p-5 bg-black/95 backdrop-blur-2xl animate-fade-in select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[95vw] max-w-[1520px] flex flex-col h-[94vh] max-h-[1100px] relative"
      >
        {/* =========================================================================
            1. COMPLETELY UNBOXED FLOATING TOP HEADER (FLOATING ABOVE MODAL WINDOW)
            ========================================================================= */}
        <div className="relative w-full shrink-0 flex items-end justify-between px-6 pb-0 pt-2 z-10 select-none">
          {/* Floating Close Button in Top-Right */}
          <button
            onClick={onClose}
            className="absolute top-0 right-2 p-1.5 text-neutral-400 hover:text-white border border-white/10 hover:border-white/20 bg-neutral-900/60 hover:bg-neutral-800 transition-colors cursor-pointer z-30"
            title="Close Inspector (Esc)"
          >
            <X className="w-4 h-4" />
          </button>

          {/* --- HERO SIDE (Left: Avatar rising behind window + Deck Info) --- */}
          <div className="flex-1 flex items-end gap-4 min-w-0 justify-start">
            {/* Hero Avatar (Standing behind the modal window top rim) */}
            <div className="h-48 sm:h-60 max-w-[340px] shrink-0 flex items-end justify-center pointer-events-none translate-y-4 sm:translate-y-5 -mb-4 sm:-mb-5 z-0">
              <AvatarImage
                avatarId={heroAvatar}
                className="h-full"
              />
            </div>

            {/* Hero Deck Name + Mana Pips + Platform (Floating unboxed) */}
            <div className="flex flex-col min-w-0 max-w-[400px] pb-2">
              <span className="font-sans text-[10px] font-semibold uppercase tracking-widest text-[#76A382] mb-0.5">
                Your Deck
              </span>
              <button
                onClick={() => onSelectDeck && onSelectDeck(selectedMatch.player_deck_name)}
                className="text-lg sm:text-2xl font-bold font-display uppercase tracking-wide text-white hover:underline cursor-pointer text-left leading-tight line-clamp-2"
                title={`View Deck: ${selectedMatch.player_deck_name}`}
              >
                {selectedMatch.player_deck_name || 'Hero Deck'}
              </button>

              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {renderDeckColorIdentity(selectedMatch.deck_colors || selectedMatch.hero_deck_colors)}
                {heroPlatform && (
                  <PlatformBadge platform={heroPlatform} showLabel={true} size="sm" />
                )}
                <span className="text-[10px] font-mono text-neutral-400 tabular-nums">
                  {selectedMatch.going_first ? '⚡ Play (1st)' : '🛡️ Draw (2nd)'}
                </span>
              </div>
            </div>
          </div>

          {/* --- DEAD-CENTER FIGHTING GAME "VS" CLUSTER --- */}
          <div className="shrink-0 flex items-center justify-center px-4 sm:px-6 pb-2 text-center pointer-events-none">
            <span
              className="font-display text-3xl sm:text-4xl lg:text-5xl font-black italic tracking-wider transform -skew-x-12 select-none uppercase bg-gradient-to-b from-[#FFF07C] via-[#FF7A00] to-[#E52D27] bg-clip-text text-transparent drop-shadow-lg"
              style={{
                WebkitTextStroke: '1.2px #FFFFFF',
                filter: 'drop-shadow(0 0 12px rgba(229, 45, 39, 0.75)) drop-shadow(0 4px 8px rgba(0, 0, 0, 0.95))',
              }}
            >
              VS
            </span>
          </div>

          {/* --- OPPONENT SIDE (Right: Opponent Info + Avatar rising behind window) --- */}
          <div className="flex-1 flex items-end gap-4 min-w-0 justify-end text-right">
            {/* Opponent Name + Mana Pips + Platform (Floating unboxed) */}
            <div className="flex flex-col min-w-0 max-w-[400px] items-end pb-2">
              <span className="font-sans text-[10px] font-semibold uppercase tracking-widest text-[#D57C69] mb-0.5">
                Opponent
              </span>
              <button
                onClick={() => onSelectOpponent && onSelectOpponent(selectedMatch.opponent_name || 'Opponent')}
                className="text-lg sm:text-2xl font-bold font-display uppercase tracking-wide text-neutral-200 hover:text-white hover:underline cursor-pointer text-right leading-tight line-clamp-2"
                title={`View Opponent: ${selectedMatch.opponent_name || 'Opponent'}`}
              >
                {selectedMatch.opponent_name || 'Opponent'}
              </button>

              <div className="flex items-center gap-2 mt-1.5 flex-wrap justify-end">
                {selectedMatch.opponent_mulligans !== undefined && (
                  <span className="text-[10px] font-mono text-neutral-400 tabular-nums">
                    {selectedMatch.opponent_mulligans === 0
                      ? '0 Mulls'
                      : `${selectedMatch.opponent_mulligans} Mull${selectedMatch.opponent_mulligans > 1 ? 's' : ''}`}
                  </span>
                )}
                {oppPlatform && (
                  <PlatformBadge platform={oppPlatform} showLabel={true} size="sm" />
                )}
                {renderDeckColorIdentity(selectedMatch.opponent_colors || selectedMatch.opponent_colors_str)}
              </div>
            </div>

            {/* Opponent Avatar (Standing behind the modal window top rim) */}
            <div className="h-48 sm:h-60 max-w-[340px] shrink-0 flex items-end justify-center pointer-events-none translate-y-4 sm:translate-y-5 -mb-4 sm:-mb-5 z-0">
              <AvatarImage
                avatarId={oppAvatar}
                isOpponent={true}
                className="h-full"
              />
            </div>
          </div>
        </div>

        {/* =========================================================================
            2. MAIN MODAL CONTAINER (BELOW THE FLOATING SECTION)
            ========================================================================= */}
        <div className="w-full flex-1 border border-white/20 bg-neutral-950 shadow-2xl flex flex-col overflow-hidden min-h-0 relative z-20 rounded-none">
          <div className="flex-1 overflow-hidden grid grid-cols-12 p-4 sm:p-5 gap-6 min-h-0">
            {/* Column 1: Left Floating Match Specs Sidebar (Col-Span 3) */}
            <div className="col-span-12 lg:col-span-3 flex flex-col gap-4 min-h-0 h-full overflow-y-auto custom-scrollbar pr-2 border-r border-white/10">
              {/* Brawl / Standard Brawl Commander Cards (Floating) */}
              {selectedMatch?.format_name && selectedMatch.format_name.toLowerCase().includes('brawl') && (
                <div className="space-y-2 shrink-0 border-b border-white/10 pb-3.5">
                  <p className="font-sans text-[11px] font-semibold uppercase tracking-wider text-neutral-300">
                    Commanders
                  </p>
                  <div className="grid grid-cols-2 gap-2.5">
                    {/* Player Commander */}
                    <div className="text-center flex flex-col gap-1 overflow-hidden">
                      <p className="text-[9px] font-mono text-neutral-400 uppercase shrink-0">Your Cmdr</p>
                      {commanderInfo?.player_commander ? (
                        <>
                          <div
                            onClick={() => onShowCard?.(commanderInfo.player_commander, true)}
                            className="h-16 w-full border border-white/15 overflow-hidden bg-neutral-900 shadow cursor-pointer hover:border-white/30 transition-colors"
                          >
                            <CardImage
                              name={commanderInfo.player_commander.name}
                              version="art_crop"
                              alt={commanderInfo.player_commander.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <p className="text-[11px] font-bold font-sans text-white truncate shrink-0 mt-0.5">
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
                      <p className="text-[9px] font-mono text-neutral-400 uppercase shrink-0">Opp Cmdr</p>
                      {commanderInfo?.opponent_commander ? (
                        <>
                          <div
                            onClick={() => onShowCard?.(commanderInfo.opponent_commander, true)}
                            className="h-16 w-full border border-white/15 overflow-hidden bg-neutral-900 shadow cursor-pointer hover:border-white/30 transition-colors"
                          >
                            <CardImage
                              name={commanderInfo.opponent_commander.name}
                              version="art_crop"
                              alt={commanderInfo.opponent_commander.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <p className="text-[11px] font-bold font-sans text-white truncate shrink-0 mt-0.5">
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

              {/* Match Specs (Flat surface with border-b rules) */}
              <div className="space-y-3 text-xs shrink-0 pr-1">
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <span className="font-sans text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                    Format
                  </span>
                  <span className="font-mono font-bold px-2 py-0.5 border border-white/15 bg-white/[0.04] text-neutral-200 uppercase text-[11px]">
                    {selectedMatch.format_name}
                  </span>
                </div>

                {/* Side-by-Side Dual Color Identity Pips */}
                <div className="space-y-1.5 border-b border-white/10 pb-2">
                  <div className="flex items-center justify-between">
                    <span className="font-sans text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                      Your Colors
                    </span>
                    {renderDeckColorIdentity(selectedMatch.deck_colors || selectedMatch.hero_deck_colors)}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-sans text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                      Opp Colors
                    </span>
                    {renderDeckColorIdentity(selectedMatch.opponent_colors || selectedMatch.opponent_colors_str)}
                  </div>
                </div>

                {/* Client Platforms & Devices */}
                <div className="space-y-1.5 border-b border-white/10 pb-2">
                  <div className="flex items-center justify-between">
                    <span className="font-sans text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                      Your Device
                    </span>
                    <span className="font-mono text-xs text-neutral-300">
                      {formatPlatformName(heroPlatform)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-sans text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                      Opp Device
                    </span>
                    <span className="font-mono text-xs text-neutral-300">
                      {formatPlatformName(oppPlatform)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <span className="font-sans text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                    Duration
                  </span>
                  <span className="font-mono font-bold text-white tabular-nums">
                    {selectedMatch.turns} Turns ({Math.round(selectedMatch.duration_seconds / 60)}m)
                  </span>
                </div>

                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <span className="font-sans text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                    Turn Order
                  </span>
                  <span className="font-mono font-bold text-[#E2BF6F] text-xs">
                    {selectedMatch.going_first ? 'Went First (Play)' : 'Went Second (Draw)'}
                  </span>
                </div>

                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <span className="font-sans text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                    Mulligans
                  </span>
                  <div className="font-mono font-bold text-xs text-right tabular-nums">
                    <span className={(selectedMatch.player_mulligans ?? 0) > 0 ? 'text-[#D4A237]' : 'text-[#76A382]'}>
                      {selectedMatch.player_mulligans ?? 0}
                    </span>
                    <span className="text-neutral-500 px-1 font-normal">vs</span>
                    <span className={(selectedMatch.opponent_mulligans ?? 0) > 0 ? 'text-[#D4A237]' : 'text-[#76A382]'}>
                      {selectedMatch.opponent_mulligans ?? 0}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <span className="font-sans text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                    Ending Life
                  </span>
                  <div className="font-mono font-bold text-xs text-right tabular-nums">
                    <span className="text-[#76A382]">{selectedMatch.player_life_end ?? 20} HP</span>
                    <span className="text-neutral-500 px-1 font-normal">vs</span>
                    <span className="text-[#D57C69]">{selectedMatch.opponent_life_end ?? 0} HP</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="font-sans text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                    Outcome
                  </span>
                  <span
                    className={`font-mono font-bold text-xs block ${
                      isWin ? 'text-[#76A382]' : 'text-[#D57C69]'
                    }`}
                  >
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
                      <span className="ms ms-ability-duels-renowned text-[#E2BF6F] text-xs" />
                      <span className="font-sans text-[11px] font-semibold uppercase tracking-wider text-neutral-300">
                        Match Honors & MVPs
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-neutral-400 tabular-nums">
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
                          className="flex items-center gap-2 px-2.5 py-1.5 border border-white/10 bg-white/[0.02] hover:bg-white/[0.06] transition-colors cursor-pointer shrink-0 group min-w-[200px]"
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
                            <span className="text-xs font-sans font-medium text-white truncate group-hover:underline leading-tight">
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
                                <span className="text-[9.5px] font-mono font-bold px-1.5 py-0.2 border border-[#D4A237]/30 bg-[#D4A237]/10 text-[#E2BF6F]">
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

              {/* Main View Switcher (Clean Minimalist Segmented Tabs) */}
              <div className="flex items-center border border-white/10 bg-white/[0.02] shrink-0 p-0.5 gap-0.5">
                <button
                  onClick={() => setSubTab('cards')}
                  className={`flex-1 py-1.5 text-xs font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    subTab === 'cards'
                      ? 'bg-white/[0.12] text-white shadow-sm'
                      : 'opacity-50 hover:opacity-90 hover:bg-white/[0.05] text-neutral-300'
                  }`}
                >
                  <ListFilter className="w-3.5 h-3.5" />
                  Side-by-Side Card Breakdown ({cards.length})
                </button>
                <button
                  onClick={() => setSubTab('timeline')}
                  className={`flex-1 py-1.5 text-xs font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    subTab === 'timeline'
                      ? 'bg-white/[0.12] text-white shadow-sm'
                      : 'opacity-50 hover:opacity-90 hover:bg-white/[0.05] text-neutral-300'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  Play Timeline
                </button>
              </div>

              {/* Sub-View Content Container (Unboxed flat surface) */}
              <div className="flex-1 overflow-hidden min-h-0 bg-neutral-950/50 backdrop-blur-md border border-white/10">
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
    </div>
  );
}

export default FullMatchInfoModal;
