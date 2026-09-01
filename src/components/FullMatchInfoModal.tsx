import React, { useState, useEffect } from 'react';
import { AchievementBadge } from './AchievementBadge';
import { X, CheckCircle2, XCircle, ListFilter, Clock, Search } from 'lucide-react';
import { ManaPip } from './ManaPip';
import { CardBreakdown, CardItem } from './CardBreakdown';
import { MatchTimeline } from './MatchTimeline';
import CardImage from './CardImage';
import AvatarImage from './AvatarImage';
import PlatformBadge, { formatPlatformName } from './PlatformBadge';
import { ensureLocalImage } from '../utils/cardImageCache';

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
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [bgImageUrl, setBgImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !selectedMatch) {
      setBgImageUrl(null);
      setSearchQuery('');
      return;
    }

    let candidateCardName: string | null = null;

    // 1. Random card from Match Honors & MVPs (Hero cards only)
    if (impactfulCards && impactfulCards.length > 0) {
      const heroImpactful = impactfulCards.filter((c) => !c.is_opponent && c.name);
      if (heroImpactful.length > 0) {
        const chosen = heroImpactful[Math.floor(Math.random() * heroImpactful.length)];
        if (chosen?.name) candidateCardName = chosen.name;
      }
    }

    // 2. Fallback: random non-land card from match cards (Hero cards only)
    if (!candidateCardName && cards && cards.length > 0) {
      const heroNonLands = cards.filter(
        (c) => !c.is_opponent && !c.card_type?.toLowerCase().includes('land') && c.name
      );
      if (heroNonLands.length > 0) {
        const chosen = heroNonLands[Math.floor(Math.random() * heroNonLands.length)];
        candidateCardName = chosen.name;
      } else {
        const heroCards = cards.filter((c) => !c.is_opponent && c.name);
        if (heroCards.length > 0) {
          const chosen = heroCards[Math.floor(Math.random() * heroCards.length)];
          if (chosen?.name) candidateCardName = chosen.name;
        }
      }
    }

    if (candidateCardName) {
      ensureLocalImage(candidateCardName, 'art_crop').then((url) => {
        setBgImageUrl(url);
      });
    } else {
      setBgImageUrl(null);
    }
  }, [isOpen, selectedMatch, impactfulCards, cards]);

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

  const renderDeckColorIdentity = (colors: any, size = 20) => {
    if (!colors) return <ManaPip symbol="C" size={size} />;
    const list = Array.isArray(colors)
      ? colors
      : colors.split('').filter((c: string) => ['W', 'U', 'B', 'R', 'G'].includes(c));
    if (list.length === 0) return <ManaPip symbol="C" size={size} />;
    return (
      <div className="flex gap-1 items-center shrink-0">
        {list.map((c: string, i: number) => (
          <ManaPip key={i} symbol={c} size={size} />
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
  const fmtChip = formatChipColor(selectedMatch.format_name);

  // Partition impactful cards into MVPs and Achievement Earners (Hero non-tokens only)
  const mvpCards = (impactfulCards || []).filter((c) => (c.total_damage && c.total_damage > 0));
  const achievementCards = (impactfulCards || []).filter(
    (c) =>
      !c.is_opponent &&
      !c.card_type?.toLowerCase().includes('token') &&
      !c.name?.toLowerCase().includes('token') &&
      c.titles &&
      c.titles.length > 0
  );

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

          {/* --- HERO SIDE (Left: Avatar rising behind window + Deck Info + Larger Mana Pips Underneath) --- */}
          <div className="flex-1 flex items-end gap-4 min-w-0 justify-start">
            {/* Hero Avatar (Standing behind the modal window top rim) */}
            <div className="h-48 sm:h-60 max-w-[340px] shrink-0 flex items-end justify-center pointer-events-none translate-y-4 sm:translate-y-5 -mb-4 sm:-mb-5 z-0">
              <AvatarImage
                avatarId={heroAvatar}
                className="h-full"
              />
            </div>

            {/* Hero Deck Name + Mana Pips Underneath (Floating unboxed) */}
            <div className="flex flex-col min-w-0 max-w-[420px] pb-2">
              <span className="font-sans text-[10px] font-semibold uppercase tracking-widest text-[#76A382] mb-0.5">
                Your Deck
              </span>
              <button
                onClick={() => onSelectDeck && onSelectDeck(selectedMatch.player_deck_name)}
                className="text-xl sm:text-3xl font-bold font-display uppercase tracking-wide text-white hover:underline cursor-pointer text-left leading-tight line-clamp-2"
                title={`View Deck: ${selectedMatch.player_deck_name}`}
              >
                {selectedMatch.player_deck_name || 'Hero Deck'}
              </button>
              <div className="mt-1.5 flex items-center">
                {renderDeckColorIdentity(selectedMatch.deck_colors || selectedMatch.hero_deck_colors, 20)}
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

          {/* --- OPPONENT SIDE (Right: Opponent Info + Larger Mana Pips Underneath + Avatar rising behind window) --- */}
          <div className="flex-1 flex items-end gap-4 min-w-0 justify-end text-right">
            {/* Opponent Name + Mana Pips Underneath (Floating unboxed) */}
            <div className="flex flex-col min-w-0 max-w-[420px] items-end pb-2">
              <span className="font-sans text-[10px] font-semibold uppercase tracking-widest text-[#D57C69] mb-0.5">
                Opponent
              </span>
              <button
                onClick={() => onSelectOpponent && onSelectOpponent(selectedMatch.opponent_name || 'Opponent')}
                className="text-xl sm:text-3xl font-bold font-display uppercase tracking-wide text-neutral-200 hover:text-white hover:underline cursor-pointer text-right leading-tight line-clamp-2"
                title={`View Opponent: ${selectedMatch.opponent_name || 'Opponent'}`}
              >
                {selectedMatch.opponent_name || 'Opponent'}
              </button>
              <div className="mt-1.5 flex items-center justify-end">
                {renderDeckColorIdentity(selectedMatch.opponent_colors || selectedMatch.opponent_colors_str, 20)}
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
          {/* Ambient Background Card Art Crop */}
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

          <div className="flex-1 overflow-hidden grid grid-cols-12 min-h-0 relative z-10">
            {/* Column 1: Left Floating Match Specs Sidebar (Col-Span 3) */}
            <div className="col-span-12 lg:col-span-3 flex flex-col gap-4 min-h-0 h-full overflow-y-auto custom-scrollbar p-4 sm:p-5 border-r border-white/10 bg-neutral-950/70 backdrop-blur-md">
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
              <div className="space-y-3 text-xs shrink-0">
                {/* Format with App-Wide Themed Format Chip */}
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <span className="font-sans text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                    Format
                  </span>
                  <span
                    className="font-mono font-bold px-2 py-0.5 border uppercase text-[10.5px]"
                    style={{ backgroundColor: fmtChip.bg, borderColor: fmtChip.border, color: fmtChip.fg }}
                  >
                    {selectedMatch.format_name}
                  </span>
                </div>

                {/* Client Platforms & Devices with Icons */}
                <div className="space-y-1.5 border-b border-white/10 pb-2">
                  <div className="flex items-center justify-between">
                    <span className="font-sans text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                      Your Device
                    </span>
                    <PlatformBadge platform={heroPlatform} showLabel={true} size="sm" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-sans text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                      Opp Device
                    </span>
                    <PlatformBadge platform={oppPlatform} showLabel={true} size="sm" />
                  </div>
                </div>

                {/* Duration: Only display minutes if recorded & greater than 0 */}
                {(() => {
                  const mins = selectedMatch.duration_seconds ? Math.round(selectedMatch.duration_seconds / 60) : 0;
                  return (
                    <div className="flex items-center justify-between border-b border-white/10 pb-2">
                      <span className="font-sans text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                        Duration
                      </span>
                      <span className="font-mono font-bold text-white tabular-nums">
                        {selectedMatch.turns} Turns{mins > 0 ? ` (${mins}m)` : ''}
                      </span>
                    </div>
                  );
                })()}

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

                {/* Outcome: Right Justified */}
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <span className="font-sans text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                    Outcome
                  </span>
                  <span
                    className={`font-mono font-bold text-xs text-right ${
                      isWin ? 'text-[#76A382]' : 'text-[#D57C69]'
                    }`}
                  >
                    {matchOutcome(selectedMatch)}
                  </span>
                </div>
              </div>

              {/* Match MVPs & Achievements in Sidebar */}
              {((mvpCards.length > 0) || (achievementCards.length > 0)) && (
                <div className="space-y-3 pt-3 shrink-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="ms ms-ability-duels-renowned text-[#E2BF6F] text-xs" />
                      <span className="font-sans text-[11px] font-semibold uppercase tracking-wider text-neutral-300">
                        Match MVPs & Achievements
                      </span>
                    </div>
                  </div>

                  {/* Sub-section 1: Match MVPs */}
                  {mvpCards.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="font-sans text-[10px] font-semibold uppercase tracking-widest text-neutral-400 block">
                        Match MVPs ({mvpCards.length})
                      </span>
                      <div className="space-y-1">
                        {mvpCards.map((c, i) => (
                          <div
                            key={`mvp-${i}`}
                            onClick={() => onShowCard?.(c)}
                            className="flex items-center gap-2.5 p-1.5 border border-white/10 bg-white/[0.02] hover:bg-white/[0.06] transition-colors cursor-pointer group"
                            title="Click to view card details"
                          >
                            <div className="w-7 h-7 border border-white/15 overflow-hidden shrink-0 bg-neutral-900">
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
                              <span className="text-[9.5px] font-mono font-bold text-[#E2BF6F]">
                                {c.total_damage} Total DMG
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sub-section 2: Achievement Earners */}
                  {achievementCards.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="font-sans text-[10px] font-semibold uppercase tracking-widest text-neutral-400 block">
                        Achievements ({achievementCards.length})
                      </span>
                      <div className="space-y-1">
                        {achievementCards.map((c, i) => (
                          <div
                            key={`ach-${i}`}
                            onClick={() => onShowCard?.(c)}
                            className="flex items-center gap-2.5 p-1.5 border border-white/10 bg-white/[0.02] hover:bg-white/[0.06] transition-colors cursor-pointer group"
                            title="Click to view card details"
                          >
                            <div className="w-7 h-7 border border-white/15 overflow-hidden shrink-0 bg-neutral-900">
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
                                {c.titles.map((t: string, ti: number) => (
                                  <AchievementBadge
                                    key={ti}
                                    title={t}
                                    size="sm"
                                    showTooltip={true}
                                  />
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Column 2: Full Width Center View Container (Col-Span 9) */}
            <div className="col-span-12 lg:col-span-9 flex flex-col p-4 sm:p-5 space-y-3 overflow-hidden min-h-0 bg-transparent">
              {/* Top Toolbar: Search Bar on Left + View Switcher on Right */}
              <div className="flex items-center justify-between gap-4 shrink-0 pb-1 flex-wrap">
                {/* Search Filter Input */}
                <div className="relative w-64 max-w-[280px] h-8 flex items-center shrink-0">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search cards in match..."
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

                {/* Top View Selector Switcher (Right Justified) */}
                <div className="inline-flex items-center bg-white/[0.03] p-0.5 gap-0.5 shrink-0">
                  <button
                    onClick={() => setSubTab('cards')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-wider transition-all cursor-pointer ${
                      subTab === 'cards'
                        ? 'bg-white/[0.12] text-white shadow-sm font-bold'
                        : 'opacity-40 hover:opacity-90 hover:bg-white/[0.05] text-neutral-400'
                    }`}
                  >
                    <ListFilter className="w-3.5 h-3.5" />
                    <span>Cards Played ({cards.length})</span>
                  </button>
                  <button
                    onClick={() => setSubTab('timeline')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-wider transition-all cursor-pointer ${
                      subTab === 'timeline'
                        ? 'bg-white/[0.12] text-white shadow-sm font-bold'
                        : 'opacity-40 hover:opacity-90 hover:bg-white/[0.05] text-neutral-400'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Play Timeline</span>
                  </button>
                </div>
              </div>

              {/* Sub-View Content Container (Unboxed flat surface) */}
              <div className="flex-1 overflow-hidden min-h-0">
                {subTab === 'cards' ? (
                  <div className="h-full overflow-hidden">
                    <CardBreakdown
                      cards={cards}
                      palette={palette}
                      impactfulGrpIds={impactfulGrpIds}
                      searchTerm={searchQuery}
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
                      searchTerm={searchQuery}
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
