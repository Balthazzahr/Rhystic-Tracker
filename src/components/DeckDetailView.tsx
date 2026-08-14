import React, { useState, useEffect } from 'react';
import { ChevronLeft, Trophy, CheckCircle2, XCircle, Layers, X } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
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

// Mana value histogram (7 bins: 0-1, 2, 3, 4, 5, 6, 7+) using simple div bars,
// consistent with the histogram style used elsewhere in the app.
function ManaValueHistogram({ bins, palette }: { bins: number[]; palette: any }) {
  const labels = ['0-1', '2', '3', '4', '5', '6', '7+'];
  const max = Math.max(...bins, 1);
  return (
    <div className="flex items-end gap-1.5 h-32">
      {bins.map((val, idx) => (
        <div key={idx} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
          <span className="text-[10px] font-mono font-bold" style={{ color: palette?.accent }}>{val}</span>
          <div
            className="w-full rounded-t-sm"
            style={{ height: `${Math.max((val / max) * 100, 3)}%`, backgroundColor: val > 0 ? (palette?.accent || '#38BDF8') : 'rgba(255,255,255,0.1)' }}
          />
          <span className="text-[9px] font-mono opacity-50">{labels[idx]}</span>
        </div>
      ))}
    </div>
  );
}

// Card type distribution: horizontal bars.
function CardTypeBars({ data, palette }: { data: { type: string; count: number }[]; palette: any }) {
  if (!data || data.length === 0) return <div className="text-xs font-mono opacity-40">No card type data</div>;
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="space-y-1.5">
      {data.map((d) => (
        <div key={d.type} className="flex items-center gap-2">
          <span className="w-28 shrink-0 text-[11px] font-semibold truncate" style={{ color: palette?.text }}>{d.type}</span>
          <div className="flex-1 h-3 rounded bg-white/5 overflow-hidden">
            <div className="h-full rounded" style={{ width: `${(d.count / max) * 100}%`, backgroundColor: palette?.accent || '#38BDF8' }} />
          </div>
          <span className="w-8 shrink-0 text-right text-[11px] font-mono font-bold" style={{ color: palette?.accent }}>{d.count}</span>
        </div>
      ))}
    </div>
  );
}

// Mana distribution pie: each card counts once per color it has.
const MANA_COLORS: Record<string, string> = {
  W: '#F8F6D8', U: '#38BDF8', B: '#A855F7', R: '#F87171', G: '#34D399', C: '#94A3B8',
};
function ManaPie({ data }: { data: { color: string; count: number }[] }) {
  if (!data || data.length === 0) return <div className="text-xs font-mono opacity-40">No mana distribution data</div>;
  return (
    <PieChart width={180} height={180}>
      <Pie data={data} dataKey="count" nameKey="color" cx="50%" cy="50%" outerRadius={70} innerRadius={40} paddingAngle={2} label={({ color }) => color}>
        {data.map((d) => <Cell key={d.color} fill={MANA_COLORS[d.color] || '#94A3B8'} />)}
      </Pie>
      <Tooltip contentStyle={{ backgroundColor: '#12141A', borderColor: '#2A2F3D', fontSize: 12 }} />
      <Legend wrapperStyle={{ fontSize: 11 }} />
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

            {/* Main content area: Stage 2 charts */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-5">
              {/* Win rate pie */}
              <div className="rounded-2xl border p-4" style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}>
                <p className="text-[10px] font-mono uppercase tracking-wider font-bold mb-2" style={{ color: palette?.accent }}>Overall Win Rate</p>
                <PieChart width={180} height={180}>
                  <Pie data={[{name:'Wins',value:detail.wins||0},{name:'Losses',value:detail.losses||0}]} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={40} paddingAngle={2}>
                    <Cell fill="#34D399" />
                    <Cell fill="#F87171" />
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: palette?.mantle, borderColor: palette?.border, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </div>

              {/* Mana value histogram */}
              <div className="rounded-2xl border p-4" style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}>
                <p className="text-[10px] font-mono uppercase tracking-wider font-bold mb-3" style={{ color: palette?.accent }}>Mana Value Distribution</p>
                <ManaValueHistogram bins={detail.mana_curve || [0,0,0,0,0,0,0]} palette={palette} />
              </div>

              {/* Card type distribution */}
              <div className="rounded-2xl border p-4" style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}>
                <p className="text-[10px] font-mono uppercase tracking-wider font-bold mb-3" style={{ color: palette?.accent }}>Card Types</p>
                <CardTypeBars data={detail.card_types || []} palette={palette} />
              </div>

              {/* Mana distribution pie */}
              <div className="rounded-2xl border p-4" style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}>
                <p className="text-[10px] font-mono uppercase tracking-wider font-bold mb-2" style={{ color: palette?.accent }}>Mana Distribution</p>
                <ManaPie data={detail.mana_distribution || []} />
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
