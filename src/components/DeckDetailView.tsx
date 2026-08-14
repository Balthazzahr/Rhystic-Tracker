import React, { useState, useEffect } from 'react';
import { ChevronLeft, Trophy, CheckCircle2, XCircle, Layers, X } from 'lucide-react';
import { PieChart, Pie, Cell } from 'recharts';
import { ManaPip } from './ManaPip';
import DeckCardList from './DeckCardList';

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

// Mana value histogram (7 bins: 0-1, 2, 3, 4, 5, 6, 7+). Bars fill the full
// cell height; each bar shows its mana value label underneath, hover shows count.
type Tip = { text: string; x: number; y: number };
function ManaValueHistogram({ bins, palette, onTip }: { bins: number[]; palette: any; onTip: (t: Tip | null) => void }) {
  const labels = ['0-1', '2', '3', '4', '5', '6', '7+'];
  const max = Math.max(...bins, 1);
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 flex items-end gap-1 min-h-0">
        {bins.map((val, idx) => (
          <div key={idx} className="flex-1 h-full flex flex-col justify-end">
            <div
              className="w-full rounded-t-sm"
              style={{
                height: `${Math.max((val / max) * 100, 3)}%`,
                backgroundColor: val > 0 ? (palette?.accent || '#38BDF8') : 'rgba(255,255,255,0.1)',
              }}
              onMouseEnter={(e) => onTip({ text: `${val} card${val === 1 ? '' : 's'}`, x: e.clientX, y: e.clientY })}
              onMouseMove={(e) => onTip({ text: `${val} card${val === 1 ? '' : 's'}`, x: e.clientX, y: e.clientY })}
              onMouseLeave={() => onTip(null)}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1 mt-1 shrink-0">
        {labels.map((l, idx) => (
          <span key={idx} className="flex-1 text-center text-[9px] font-mono opacity-60 leading-none">{l}</span>
        ))}
      </div>
    </div>
  );
}

// Card type distribution: horizontal bars, instant hover tooltip shows count.
function CardTypeBars({ data, palette, onTip }: { data: { type: string; count: number }[]; palette: any; onTip: (t: Tip | null) => void }) {
  if (!data || data.length === 0) return <div className="text-xs font-mono opacity-40">No card type data</div>;
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="flex-1 space-y-1 flex flex-col justify-center min-h-0">
      {data.map((d) => (
        <div
          key={d.type}
          className="flex items-center gap-1.5 group cursor-help"
          onMouseEnter={(e) => onTip({ text: `${d.type}: ${d.count}`, x: e.clientX, y: e.clientY })}
          onMouseMove={(e) => onTip({ text: `${d.type}: ${d.count}`, x: e.clientX, y: e.clientY })}
          onMouseLeave={() => onTip(null)}
        >
          <span className="w-20 shrink-0 text-[10px] font-semibold truncate" style={{ color: palette?.text }}>{d.type}</span>
          <div className="flex-1 h-1.5 rounded bg-white/5 overflow-hidden">
            <div className="h-full rounded" style={{ width: `${(d.count / max) * 100}%`, backgroundColor: palette?.accent || '#38BDF8' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// Mana distribution pie: full pie, no tooltip — each slice renders the mana pip
// symbol shrunk to fit inside the slice.
const MANA_COLORS: Record<string, string> = {
  W: '#F8F6D8', U: '#38BDF8', B: '#A855F7', R: '#F87171', G: '#34D399', C: '#94A3B8',
};
const RADIAN = Math.PI / 180;
function ManaPie({ data }: { data: { color: string; count: number }[] }) {
  if (!data || data.length === 0) return <div className="text-xs font-mono opacity-40">No mana distribution data</div>;
  return (
    <PieChart width={170} height={170}>
      <Pie
        data={data}
        dataKey="count"
        nameKey="color"
        cx="50%"
        cy="50%"
        outerRadius={80}
        paddingAngle={0}
        stroke="none"
        labelLine={false}
        label={(props: any) => {
          const { cx, cy, midAngle, outerRadius, percent, payload } = props;
          if (!payload || percent < 0.04) return null;
          const r = outerRadius * 0.62;
          const x = cx + r * Math.cos(-midAngle * RADIAN);
          const y = cy + r * Math.sin(-midAngle * RADIAN);
          const size = Math.max(10, Math.min(30, outerRadius * 0.95 * Math.sqrt(percent)));
          return (
            <foreignObject x={x - size / 2} y={y - size / 2} width={size} height={size}>
              <div className="w-full h-full flex items-center justify-center">
                <ManaPip symbol={payload.color} size={size} />
              </div>
            </foreignObject>
          );
        }}
      >
        {data.map((d) => <Cell key={d.color} fill={MANA_COLORS[d.color] || '#94A3B8'} />)}
      </Pie>
    </PieChart>
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
  formatDateShort,
}: DeckDetailViewProps) {
  const [hoverCmdr, setHoverCmdr] = useState<{ x: number; y: number } | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);

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
        className="w-full max-w-6xl h-[85vh] rounded-3xl border shadow-2xl flex flex-col overflow-hidden relative"
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
          {/* Title card (full width) */}
          <div className="px-5 pt-4 shrink-0">
            <div className="p-5 rounded-2xl border space-y-4" style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}>
              {/* Row 1: deck name + commander + mana pips */}
              <div className="flex items-center gap-6">
                <h2 className="text-5xl font-black font-outfit uppercase tracking-wide shrink-0" style={{ color: palette?.text }}>
                  {detail.deck_name}
                </h2>

                {/* Commander: name first, picture after, right-justified before pips */}
                {detail.commander_name && (
                  <div className="flex items-center gap-4 ml-auto shrink-0">
                    <div className="text-right">
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
                    <img
                      src={scryfallArtUrl(detail.commander_name)}
                      alt={detail.commander_name}
                      className="w-20 h-20 rounded-xl object-cover border"
                      style={{ borderColor: `${palette?.border}66` }}
                      onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
                    />
                  </div>
                )}

                {/* Mana pips, far right */}
                <div className={`flex gap-1 shrink-0 ${detail.commander_name ? '' : 'ml-auto'}`}>
                  {(detail.colors || []).map((c: string) => <ManaPip key={c} symbol={c} size={34} />)}
                  {(detail.colors || []).length === 0 && <ManaPip symbol="C" size={34} />}
                </div>
              </div>

              {/* Row 2: mana distribution pie + mana value histogram + card types */}
              <div className="grid grid-cols-[auto_1fr_1fr] gap-4 pt-4 border-t" style={{ borderColor: `${palette?.border}66` }}>
                <div className="rounded-xl border p-2 flex flex-col items-center justify-center" style={{ backgroundColor: palette?.surface, borderColor: `${palette?.border}66` }}>
                  <p className="text-[9px] font-mono uppercase tracking-wider font-bold mb-1 opacity-60" style={{ color: palette?.accent }}>Mana Distribution</p>
                  <ManaPie data={detail.mana_distribution || []} />
                </div>
                <div className="rounded-xl border p-3 flex flex-col min-h-0" style={{ backgroundColor: palette?.surface, borderColor: `${palette?.border}66` }}>
                  <p className="text-[9px] font-mono uppercase tracking-wider font-bold mb-2 opacity-60" style={{ color: palette?.accent }}>Mana Value</p>
                  <ManaValueHistogram bins={detail.mana_curve || [0,0,0,0,0,0,0]} palette={palette} onTip={setTip} />
                </div>
                <div className="rounded-xl border p-3 flex flex-col min-h-0" style={{ backgroundColor: palette?.surface, borderColor: `${palette?.border}66` }}>
                  <p className="text-[9px] font-mono uppercase tracking-wider font-bold mb-2 opacity-60" style={{ color: palette?.accent }}>Card Types</p>
                  <CardTypeBars data={detail.card_types || []} palette={palette} onTip={setTip} />
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 flex overflow-hidden min-h-0">
            {/* Left sidebar: stats + recent matches */}
            <div className="w-[300px] shrink-0 border-r flex flex-col" style={{ borderColor: palette?.border }}>
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
              <div className="p-3 shrink-0 flex flex-col max-h-[40%]">
                <div className="rounded-2xl border flex flex-col overflow-hidden min-h-0" style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}>
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
            </div>

            {/* Main content area: categorized decklist (Stage 3) */}
            <div className="flex-1 p-5 overflow-hidden min-h-0">
              <DeckCardList deckName={deckName} palette={palette} />
            </div>
          </div>
        </div>

        {/* Floating commander card preview on hover */}
        {hoverCmdr && detail.commander_name && (
          <div
            className="fixed pointer-events-none z-[60] w-[340px] rounded-xl overflow-hidden border shadow-2xl transition-opacity duration-150"
            style={{ left: `${hoverCmdr.x + 18}px`, top: `${Math.min(hoverCmdr.y - 100, window.innerHeight - 560)}px`, borderColor: palette?.border }}
          >
            <img src={scryfallCardUrl(detail.commander_name)} alt={detail.commander_name} className="w-full" />
          </div>
        )}

        {/* Instant hover tooltip (charts) */}
        {tip && (
          <div
            className="fixed z-[70] pointer-events-none px-2 py-1 rounded-md border text-[11px] font-mono font-bold shadow-xl"
            style={{ left: tip.x + 14, top: tip.y + 14, backgroundColor: palette?.mantle, borderColor: palette?.border, color: palette?.text }}
          >
            {tip.text}
          </div>
        )}
      </div>
    </div>
  );
}
