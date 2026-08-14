import React, { useState, useEffect } from 'react';
import { ChevronLeft, Trophy, CheckCircle2, XCircle, Layers, X } from 'lucide-react';
import { ManaPip } from './ManaPip';

interface DeckDetailViewProps {
  isOpen: boolean;
  deckName: string;
  detail: any;
  palette: any;
  onBack: () => void;
  onSelectMatch: (matchId: string) => void;
  onViewAll: () => void;
  formatDateShort: (ts: string) => string;
}

// Scryfall card image (full card, for the hover preview) + art crop for the header.
const scryfallCardUrl = (name: string) =>
  `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=normal`;
const scryfallArtUrl = (name: string) =>
  `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=art_crop`;

export function DeckDetailView({
  isOpen,
  deckName,
  detail,
  palette,
  onBack,
  onSelectMatch,
  onViewAll,
  formatDateShort,
}: DeckDetailViewProps) {
  const [hoverCmdr, setHoverCmdr] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    // Browser-style back navigation: push history so the mouse back button works.
    window.history.pushState({ deckDetail: deckName }, '');
    const onPop = () => onBack();
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
    };
  }, [isOpen, deckName, onBack]);

  if (!isOpen || !detail) return null;

  const winrateNum = parseFloat(detail.winrate) || 0;
  const playTotal = (detail.play?.wins || 0) + (detail.play?.losses || 0);
  const drawTotal = (detail.draw?.wins || 0) + (detail.draw?.losses || 0);
  const playWinPct = playTotal > 0 ? ((detail.play?.wins || 0) / playTotal) * 100 : 0;
  const drawWinPct = drawTotal > 0 ? ((detail.draw?.wins || 0) / drawTotal) * 100 : 0;

  // Win/loss bar continuum: green fills left-to-right for wins, red fills
  // right-to-left for losses, with win% shown above.
  const winLossBar = (wins: number, losses: number, winPct: number) => {
    const total = wins + losses;
    const winShare = total > 0 ? (wins / total) * 100 : 0;
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px] font-mono font-bold">
          <span className="text-emerald-400">{wins}W</span>
          <span className="opacity-90" style={{ color: palette?.text }}>{winPct.toFixed(1)}%</span>
          <span className="text-rose-400">{losses}L</span>
        </div>
        <div className="h-2.5 rounded-full overflow-hidden bg-white/10 relative">
          <div className="h-full bg-emerald-400" style={{ width: `${winShare}%` }} />
          <div className="h-full bg-rose-400 absolute inset-y-0 right-0" style={{ width: `${100 - winShare}%` }} />
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-xl animate-fade-in select-none">
      <div
        className="w-full max-w-5xl h-[88vh] rounded-3xl border shadow-2xl flex flex-col overflow-hidden relative"
        style={{ backgroundColor: palette?.mantle || '#12141A', borderColor: palette?.border || '#2A2F3D' }}
      >
        {/* Header bar */}
        <div className="p-4 border-b flex items-center justify-between shrink-0" style={{ borderColor: palette?.border }}>
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs font-bold opacity-70 hover:opacity-100 transition-opacity"
            style={{ color: palette?.text }}
          >
            <ChevronLeft className="w-4 h-4" /> Deck Library
          </button>
          <button onClick={onBack} className="text-xs font-mono opacity-60 hover:opacity-100 p-1.5 rounded-lg border hover:bg-white/5" style={{ borderColor: palette?.border }} title="Close (mouse back)">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Title card (full width): deck name, larger mana pips, prominent commander */}
          <div className="px-5 pt-4 shrink-0">
            <div className="p-5 rounded-2xl border space-y-4" style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}>
              <div className="flex items-center justify-between">
                <h2 className="text-4xl font-black font-outfit uppercase tracking-wide" style={{ color: palette?.text }}>
                  {detail.deck_name}
                </h2>
                {/* Larger mana pips */}
                <div className="flex gap-1">
                  {(detail.colors || []).map((c: string) => <ManaPip key={c} symbol={c} size={34} />)}
                  {(detail.colors || []).length === 0 && <ManaPip symbol="C" size={34} />}
                </div>
              </div>

              {/* Commander: larger art + hover shows the full card */}
              {detail.commander_name && (
                <div className="flex items-center gap-4 pt-3 border-t" style={{ borderColor: `${palette?.border}66` }}>
                  <img
                    src={scryfallArtUrl(detail.commander_name)}
                    alt={detail.commander_name}
                    className="w-20 h-20 rounded-xl object-cover border"
                    style={{ borderColor: `${palette?.border}66` }}
                    onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
                  />
                  <div>
                    <p className="text-[10px] font-mono uppercase opacity-50">Commander</p>
                    <button
                      onMouseMove={(e) => setHoverCmdr({ x: e.clientX, y: e.clientY })}
                      onMouseLeave={() => setHoverCmdr(null)}
                      className="text-xl font-bold hover:underline cursor-help"
                      style={{ color: palette?.accent || '#38BDF8' }}
                      title="Hover to preview card"
                    >
                      {detail.commander_name}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 flex overflow-hidden min-h-0">
            {/* Left sidebar: stats + recent matches */}
            <div className="w-[300px] shrink-0 border-r flex flex-col" style={{ borderColor: palette?.border, backgroundColor: palette?.surface }}>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-4">
                {/* Winrate */}
                <div className="rounded-2xl border p-3 flex items-center justify-between" style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}>
                  <div>
                    <p className="text-[10px] uppercase font-semibold opacity-60">Winrate</p>
                    <h3 className="text-3xl font-extrabold font-outfit mt-0.5" style={{ color: winrateNum >= 50 ? '#34D399' : '#F87171' }}>{detail.winrate}</h3>
                  </div>
                  <Trophy className="w-6 h-6 opacity-40" style={{ color: palette?.accent }} />
                </div>

                {/* W/L record */}
                <div className="rounded-2xl border p-3 flex items-center justify-between" style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}>
                  <div>
                    <p className="text-[10px] uppercase font-semibold opacity-60">W / L Record</p>
                    <h3 className="text-3xl font-extrabold font-outfit mt-0.5">{detail.wins} - {detail.losses}</h3>
                  </div>
                  <Layers className="w-6 h-6 opacity-40" style={{ color: palette?.accent }} />
                </div>

                {/* Win rate by position */}
                <div className="rounded-2xl border p-3 space-y-3" style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}>
                  <p className="text-[10px] uppercase font-semibold opacity-60">Win Rate by Position</p>
                  <div>
                    <p className="text-[11px] font-mono font-bold uppercase opacity-60 mb-1">On the Play</p>
                    {winLossBar(detail.play?.wins || 0, detail.play?.losses || 0, playWinPct)}
                  </div>
                  <div>
                    <p className="text-[11px] font-mono font-bold uppercase opacity-60 mb-1">On the Draw</p>
                    {winLossBar(detail.draw?.wins || 0, detail.draw?.losses || 0, drawWinPct)}
                  </div>
                </div>
              </div>

              {/* Recent matches (below stats, still in left sidebar) */}
              <div className="border-t shrink-0 flex flex-col" style={{ borderColor: `${palette?.border}66`, maxHeight: '40%' }}>
                <div className="px-3 py-2.5 border-b" style={{ borderColor: `${palette?.border}66` }}>
                  <p className="text-[10px] font-mono uppercase tracking-wider font-bold" style={{ color: palette?.accent }}>Recent Matches</p>
                </div>
                <div className="overflow-y-auto custom-scrollbar divide-y divide-white/5">
                  {(detail.recent_matches || []).map((m: any) => (
                    <button
                      key={m.match_id}
                      onClick={() => onSelectMatch(m.match_id)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors"
                    >
                      {m.result === 'win' ? (
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                      )}
                      <span className="flex-1 font-semibold text-xs truncate" style={{ color: palette?.text }}>
                        {m.opponent_name || 'Opponent'}
                      </span>
                      <span className="text-[10px] font-mono opacity-50 shrink-0">{formatDateShort(m.timestamp)}</span>
                    </button>
                  ))}
                  {/* View All as a continuation row */}
                  <button
                    onClick={onViewAll}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/10 transition-colors"
                    style={{ color: palette?.accent || '#38BDF8' }}
                  >
                    <span className="text-xs font-bold font-mono uppercase tracking-wide">View All →</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Main content area (charts coming in Stage 2) */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
              <div className="rounded-2xl border border-dashed p-8 text-center text-xs font-mono opacity-40" style={{ borderColor: palette?.border }}>
                Charts (mana curve, card types, mana distribution, win-rate pie) arriving in Stage 2.
              </div>
            </div>
          </div>
        </div>

        {/* Floating commander card preview on hover */}
        {hoverCmdr && detail.commander_name && (
          <div
            className="fixed pointer-events-none z-[60] w-48 rounded-xl overflow-hidden border shadow-2xl transition-opacity duration-150"
            style={{ left: `${hoverCmdr.x + 18}px`, top: `${Math.min(hoverCmdr.y - 100, window.innerHeight - 360)}px`, borderColor: palette?.border }}
          >
            <img src={scryfallCardUrl(detail.commander_name)} alt={detail.commander_name} className="w-full" />
          </div>
        )}
      </div>
    </div>
  );
}
