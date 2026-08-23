import React, { useState, useEffect } from 'react';
import { AchievementBadge } from './AchievementBadge';
import { X, CheckCircle2, XCircle, ListFilter, Clock } from 'lucide-react';
import { ManaPip } from './ManaPip';
import { CardBreakdown, CardItem } from './CardBreakdown';
import { MatchTimeline } from './MatchTimeline';
import { ManaFontPip } from './ManaFontPip';
import { parseMtgaManaCost } from '../utils/manaUtils';

export const TITLE_BADGES: Record<string, { icon: string; label: string; color: string; bg: string; border: string }> = {
  'Scoop Inducer': { icon: '⚡', label: 'Scoop Inducer', color: '#FBBF24', bg: 'rgba(251, 191, 36, 0.15)', border: 'rgba(251, 191, 36, 0.4)' },
  'Executioner': { icon: '🗡️', label: 'Executioner', color: '#F43F5E', bg: 'rgba(244, 63, 94, 0.15)', border: 'rgba(244, 63, 94, 0.4)' },
  'Over-Killer': { icon: '⏱️', label: 'Over-Killer', color: '#E11D48', bg: 'rgba(225, 29, 72, 0.15)', border: 'rgba(225, 29, 72, 0.4)' },
  'Haymaker': { icon: '🥊', label: 'Haymaker', color: '#FB923C', bg: 'rgba(251, 146, 60, 0.15)', border: 'rgba(251, 146, 60, 0.4)' },
  'Juggernaut': { icon: '🚂', label: 'Juggernaut', color: '#A855F7', bg: 'rgba(168, 85, 247, 0.15)', border: 'rgba(168, 85, 247, 0.4)' },
  'Ironclad': { icon: '🛡️', label: 'Ironclad', color: '#38BDF8', bg: 'rgba(56, 189, 248, 0.15)', border: 'rgba(56, 189, 248, 0.4)' },
  'Giant Grower': { icon: '🌱', label: 'Giant Grower', color: '#4ADE80', bg: 'rgba(74, 222, 128, 0.15)', border: 'rgba(74, 222, 128, 0.4)' },
  'Cataclysm': { icon: '🌪️', label: 'Cataclysm', color: '#C084FC', bg: 'rgba(192, 132, 252, 0.15)', border: 'rgba(192, 132, 252, 0.4)' },
  'Sweeper': { icon: '🧹', label: 'Sweeper', color: '#FACC15', bg: 'rgba(250, 204, 21, 0.15)', border: 'rgba(250, 204, 21, 0.4)' },
  'Royal Assassin': { icon: '👑', label: 'Royal Assassin', color: '#EC4899', bg: 'rgba(236, 72, 153, 0.15)', border: 'rgba(236, 72, 153, 0.4)' },
  'Clutch Denial': { icon: '🚫', label: 'Clutch Denial', color: '#60A5FA', bg: 'rgba(96, 165, 250, 0.15)', border: 'rgba(96, 165, 250, 0.4)' },
  'Swarmer': { icon: '🌾', label: 'Swarmer', color: '#A3E635', bg: 'rgba(163, 230, 53, 0.15)', border: 'rgba(163, 230, 53, 0.4)' },
  'Rhystic Tracker': { icon: '🪶', label: 'Rhystic Tracker', color: '#38BDF8', bg: 'rgba(56, 189, 248, 0.15)', border: 'rgba(56, 189, 248, 0.4)' },
  'Mana Dynamo': { icon: '⚡', label: 'Mana Dynamo', color: '#34D399', bg: 'rgba(52, 211, 153, 0.15)', border: 'rgba(52, 211, 153, 0.4)' },
};

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

  // Escape key handler to close modal
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

  // Helper to render deck color identity pips (accepts either a WUBRG string or array)
  const renderDeckColorIdentity = (colors: any) => {
    if (!colors) return <ManaPip symbol="C" size={14} />;
    const list = Array.isArray(colors) ? colors : colors.split('').filter((c: string) => ['W', 'U', 'B', 'R', 'G'].includes(c));
    if (list.length === 0) return <ManaPip symbol="C" size={14} />;
    return (
      <div className="flex gap-0.5 items-center">
        {list.map((c: string, i: number) => (
          <ManaPip key={i} symbol={c} size={14} />
        ))}
      </div>
    );
  };

  // Human-friendly match outcome subtitle. For concedes / timeouts,
  // "ResultReason_Concede" + result tells us who conceded.
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
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/75 backdrop-blur-xl animate-fade-in select-none"
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="w-[80vw] h-[90vh] max-w-[80vw] max-h-[90vh] rounded-3xl border shadow-2xl flex flex-col overflow-hidden relative"
        style={{ backgroundColor: palette?.mantle || '#12141A', borderColor: palette?.border || '#2A2F3D' }}
      >
        {/* Header Bar: Prominent Fighting-Game Style VS Header with Centered Win/Loss Banner */}
        <div className="p-5 border-b flex items-center justify-between shrink-0" style={{ borderColor: palette?.border }}>
          <div className="flex-1 flex flex-col items-center justify-center text-center space-y-1.5">
            <span className="text-[10px] font-mono uppercase tracking-wider font-bold opacity-60">Full Match Inspector</span>
            <div className="flex items-center gap-3">
              <button 
                onClick={() => onSelectDeck && onSelectDeck(selectedMatch.player_deck_name)}
                className="text-xl font-extrabold font-outfit uppercase tracking-wide hover:underline cursor-pointer"
                style={{ color: palette?.accent || '#38BDF8' }}
                title="View Deck Details"
              >
                {selectedMatch.player_deck_name}
              </button>
              <span className="text-xs font-mono font-bold opacity-40">VS</span>
              <button 
                onClick={() => onSelectOpponent && onSelectOpponent(selectedMatch.opponent_name || 'Opponent')}
                className="text-xl font-extrabold font-outfit uppercase tracking-wide hover:underline cursor-pointer"
                style={{ color: palette?.text }}
                title="View Opponent Head-to-Head Stats"
              >
                {selectedMatch.opponent_name || 'Opponent'}
              </button>
            </div>

            {/* Item 1: Prominently Centered Victory / Defeat Badge */}
            <div className="pt-0.5">
              {selectedMatch.result === 'win' ? (
                <span className="inline-flex items-center gap-1.5 px-4 py-1 rounded-full text-xs font-black tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  <CheckCircle2 className="w-4 h-4" /> VICTORY
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-4 py-1 rounded-full text-xs font-black tracking-widest bg-rose-500/10 text-rose-400 border border-rose-500/30">
                  <XCircle className="w-4 h-4" /> DEFEAT
                </span>
              )}
            </div>
          </div>

          <button 
            onClick={onClose}
            className="p-2 rounded-xl border opacity-60 hover:opacity-100 hover:bg-white/5 transition-all self-start"
            style={{ borderColor: palette?.border }}
            title="Close Modal (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: Spacious 2-Panel Layout (Left Sidebar + Center Main View) */}
        <div className="flex-1 overflow-hidden grid grid-cols-12 p-6 gap-6">
          {/* Column 1: Left Match Metadata Sidebar (Col-Span 3) */}
          <div className="col-span-3 flex flex-col gap-4 min-h-0 h-full overflow-hidden pr-1">
            {/* Brawl / Standard Brawl Commander Cards */}
            {selectedMatch?.format_name && selectedMatch.format_name.toLowerCase().includes('brawl') && (
              <div className="flex-1 min-h-0 flex flex-col p-3 rounded-2xl border gap-2" style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}>
                <p className="text-[10px] font-mono uppercase tracking-wider font-bold opacity-60 shrink-0">Commanders</p>
                <div className="flex-1 min-h-0 flex flex-col gap-2">
                  {/* Player Commander */}
                  <div className="flex-1 min-h-0 flex flex-col p-2 rounded-xl border bg-black/40 text-center gap-1 overflow-hidden" style={{ borderColor: palette?.border }}>
                    <p className="text-[9px] font-mono opacity-50 uppercase shrink-0">Player Commander</p>
                    {commanderInfo?.player_commander ? (
                      <>
                        <img 
                          src={`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(commanderInfo.player_commander.name)}&format=image&version=art_crop`}
                          alt={commanderInfo.player_commander.name}
                          className="flex-1 min-h-0 w-full object-cover rounded-lg border border-white/10"
                        />
                        <p className="text-xs font-bold truncate shrink-0" style={{ color: palette?.text }}>{commanderInfo.player_commander.name}</p>
                      </>
                    ) : (
                      <div className="flex-1 min-h-0 rounded-lg border border-dashed flex items-center justify-center text-[10px] opacity-40 font-mono" style={{ borderColor: palette?.border }}>
                        No Cmdr
                      </div>
                    )}
                  </div>

                  {/* Opponent Commander */}
                  <div className="flex-1 min-h-0 flex flex-col p-2 rounded-xl border bg-black/40 text-center gap-1 overflow-hidden" style={{ borderColor: palette?.border }}>
                    <p className="text-[9px] font-mono opacity-50 uppercase shrink-0">Opponent Commander</p>
                    {commanderInfo?.opponent_commander ? (
                      <>
                        <img 
                          src={`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(commanderInfo.opponent_commander.name)}&format=image&version=art_crop`}
                          alt={commanderInfo.opponent_commander.name}
                          className="flex-1 min-h-0 w-full object-cover rounded-lg border border-white/10"
                        />
                        <p className="text-xs font-bold truncate shrink-0" style={{ color: palette?.text }}>{commanderInfo.opponent_commander.name}</p>
                      </>
                    ) : (
                      <div className="flex-1 min-h-0 rounded-lg border border-dashed flex flex-col items-center justify-center text-[10px] opacity-40 font-mono px-2 text-center" style={{ borderColor: palette?.border }}>
                        <span>Uncast /</span>
                        <span>Unknown</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Match Specs Sidebar Panel */}
            <div className="p-4 rounded-2xl border space-y-3 text-xs shrink-0" style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}>
              <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: palette?.border }}>
                <span className="opacity-60 text-[10px] uppercase font-semibold">Format</span>
                <span className="font-bold font-mono px-2 py-0.5 rounded border bg-black/40" style={{ borderColor: palette?.border }}>{selectedMatch.format_name}</span>
              </div>

              {/* Item 11: Side-by-Side Dual Color Identity Pips */}
              <div className="space-y-1.5 border-b pb-2" style={{ borderColor: palette?.border }}>
                <div className="flex items-center justify-between">
                  <span className="opacity-60 text-[10px] uppercase font-semibold">Player Colors</span>
                  {renderDeckColorIdentity(selectedMatch.deck_colors || selectedMatch.hero_deck_colors)}
                </div>
                <div className="flex items-center justify-between">
                  <span className="opacity-60 text-[10px] uppercase font-semibold">Opponent Colors</span>
                  {renderDeckColorIdentity(selectedMatch.opponent_colors || selectedMatch.opponent_colors_str)}
                </div>
              </div>

              <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: palette?.border }}>
                <span className="opacity-60 text-[10px] uppercase font-semibold">Duration</span>
                <span className="font-mono font-bold">{selectedMatch.turns} Turns ({Math.round(selectedMatch.duration_seconds / 60)}m)</span>
              </div>
              <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: palette?.border }}>
                <span className="opacity-60 text-[10px] uppercase font-semibold">Order</span>
                <span className="font-bold text-amber-400">{selectedMatch.going_first ? 'Went First (Play)' : 'Went Second (Draw)'}</span>
              </div>

              <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: palette?.border }}>
                <span className="opacity-60 text-[10px] uppercase font-semibold">Mulligans</span>
                <div className="font-mono font-bold text-xs text-right">
                  <span className={(selectedMatch.player_mulligans ?? 0) > 0 ? 'text-amber-400' : 'text-emerald-400'}>
                    {selectedMatch.player_mulligans ?? 0}
                  </span>
                  <span className="opacity-40 px-1 font-normal">vs</span>
                  <span className={(selectedMatch.opponent_mulligans ?? 0) > 0 ? 'text-amber-400' : 'text-emerald-400'}>
                    {selectedMatch.opponent_mulligans ?? 0}
                  </span>
                </div>
              </div>

              {/* Item 3: Clean Single-Line Ending HP Comparison & Right Alignment */}
              <div className="flex items-center justify-between">
                <span className="opacity-60 text-[10px] uppercase font-semibold shrink-0">Ending Life</span>
                <div className="font-mono font-bold text-xs text-right">
                  <span className="text-emerald-400">{selectedMatch.player_life_end ?? 20} HP</span>
                  <span className="opacity-40 px-1 font-normal">vs</span>
                  <span className="text-rose-400">{selectedMatch.opponent_life_end ?? 0} HP</span>
                </div>
              </div>

              {/* Item 3B: How the match ended (victory/defeat + who conceded) */}
              <div className="border-t pt-2 space-y-1" style={{ borderColor: `${palette?.border}66` }}>
                <span className="opacity-60 text-[10px] uppercase font-semibold">Outcome</span>
                <span className={`font-mono font-bold text-xs block ${selectedMatch.result === 'win' ? 'text-emerald-400' : 'text-rose-400'}`}>{matchOutcome(selectedMatch)}</span>
              </div>
            </div>
          </div>

          {/* Column 2: Full Width Center View Container (Col-Span 9) */}
          <div className="col-span-9 flex flex-col space-y-3 overflow-hidden">
            {/* Match Honors & Impactful Cards Shelf */}
            {impactfulCards && impactfulCards.length > 0 && (
              <div
                className="p-3 rounded-2xl border space-y-2 shrink-0 bg-black/40"
                style={{ borderColor: palette?.border }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs">🏆</span>
                    <span className="text-[10px] font-mono uppercase tracking-wider font-bold opacity-75" style={{ color: palette?.text }}>
                      Match Honors & MVPs
                    </span>
                  </div>
                  <span className="text-[9px] font-mono opacity-50">
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
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl border bg-black/50 hover:bg-white/10 transition-all cursor-pointer shrink-0 group min-w-[200px]"
                        style={{ borderColor: `${palette?.border}88` }}
                        title="Click to view card details"
                      >
                        <img
                          src={`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(c.name)}&format=image&version=art_crop`}
                          alt={c.name}
                          className="w-9 h-9 rounded-lg object-cover border border-white/10 shrink-0"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-xs font-bold truncate group-hover:text-sky-300 transition-colors" style={{ color: palette?.text }}>
                            {c.name}
                          </span>
                          <div className="flex flex-wrap items-center gap-1 mt-1">
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
                              <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
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
            <div className="flex items-center p-1 rounded-xl border bg-black/40 shrink-0" style={{ borderColor: palette?.border }}>
              <button
                onClick={() => setSubTab('cards')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                  subTab === 'cards' ? 'shadow-md' : 'opacity-60 hover:opacity-100'
                }`}
                style={{
                  backgroundColor: subTab === 'cards' ? (palette?.accent || '#38BDF8') : 'transparent',
                  color: subTab === 'cards' ? '#000000' : (palette?.text || '#F8FAFC'),
                }}
              >
                <ListFilter className="w-4 h-4" />
                Side-by-Side Card Breakdown ({cards.length})
              </button>
              <button
                onClick={() => setSubTab('timeline')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                  subTab === 'timeline' ? 'shadow-md' : 'opacity-60 hover:opacity-100'
                }`}
                style={{
                  backgroundColor: subTab === 'timeline' ? (palette?.accent || '#38BDF8') : 'transparent',
                  color: subTab === 'timeline' ? '#000000' : (palette?.text || '#F8FAFC'),
                }}
              >
                <Clock className="w-4 h-4" />
                Play Timeline
              </button>
            </div>

            {/* View 1: Item 1 Side-by-Side Card Breakdown */}
            {subTab === 'cards' && (
              <div className="flex-1 overflow-hidden">
                <CardBreakdown 
                  cards={cards} 
                  palette={palette} 
                  impactfulGrpIds={impactfulGrpIds}
                  onCardClick={(card) => {
                    onShowCard?.(card);
                  }}
                />
              </div>
            )}

            {/* View 2: Turn Timeline */}
            {subTab === 'timeline' && (
              <div className="flex-1 overflow-hidden">
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
  );
}
