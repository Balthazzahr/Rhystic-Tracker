import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, XCircle, ListFilter, Clock } from 'lucide-react';
import { ManaPip } from './ManaPip';
import { CardBreakdown, CardItem } from './CardBreakdown';
import { MatchTimeline } from './MatchTimeline';
import { ManaFontPip } from './ManaFontPip';
import { parseMtgaManaCost } from '../utils/manaUtils';

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
