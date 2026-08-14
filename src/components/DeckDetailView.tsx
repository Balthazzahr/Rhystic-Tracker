import React from 'react';
import { ChevronLeft, Trophy, CheckCircle2, XCircle, ListFilter, Activity } from 'lucide-react';
import { ManaPip } from './ManaPip';

interface DeckDetailViewProps {
  deckName: string;
  detail: any;
  palette: any;
  onBack: () => void;
  onSelectMatch: (matchId: string) => void;
  onViewAll: () => void;
  renderDeckArt: (d: any, size?: string) => React.ReactNode;
  renderDeckColorIdentity: (colors?: string[]) => React.ReactNode;
  formatDateShort: (ts: string) => string;
}

export function DeckDetailView({
  deckName,
  detail,
  palette,
  onBack,
  onSelectMatch,
  onViewAll,
  renderDeckArt,
  renderDeckColorIdentity,
  formatDateShort,
}: DeckDetailViewProps) {
  if (!detail) {
    return (
      <div className="flex-1 rounded-2xl border overflow-hidden shadow-2xl flex flex-col items-center justify-center" style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}>
        <p className="text-xs font-mono opacity-40">Loading deck detail...</p>
      </div>
    );
  }

  const winrateNum = parseFloat(detail.winrate) || 0;
  const playTotal = (detail.play?.wins || 0) + (detail.play?.losses || 0);
  const drawTotal = (detail.draw?.wins || 0) + (detail.draw?.losses || 0);

  return (
    <div className="flex-1 rounded-2xl border overflow-hidden shadow-2xl flex flex-col" style={{ backgroundColor: palette?.surface || '#1A1D24', borderColor: palette?.border || '#2A2F3D' }}>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4">
        {/* Back button */}
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-bold opacity-70 hover:opacity-100 transition-opacity"
          style={{ color: palette?.text }}
        >
          <ChevronLeft className="w-4 h-4" /> Back to Deck Library
        </button>

        {/* Header card: deck name, colors, commander */}
        <div className="p-5 rounded-2xl border space-y-3" style={{ backgroundColor: palette?.mantle, borderColor: palette?.border }}>
          <div className="flex items-center justify-between">
            <h2 className="text-3xl font-black font-outfit uppercase tracking-wide" style={{ color: palette?.text }}>
              {detail.deck_name}
            </h2>
            {renderDeckColorIdentity(detail.colors)}
          </div>

          {/* Commander (prominent) */}
          {detail.commander_name && (
            <div className="flex items-center gap-3 pt-2 border-t" style={{ borderColor: `${palette?.border}66` }}>
              {renderDeckArt({ top_commander_name: detail.commander_name }, 'w-14 h-14')}
              <div>
                <p className="text-[10px] font-mono uppercase opacity-50">Commander</p>
                <p className="text-lg font-bold" style={{ color: palette?.accent || '#38BDF8' }}>{detail.commander_name}</p>
              </div>
            </div>
          )}
        </div>

        {/* Stats row: winrate, W/L, play/draw */}
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl border flex items-center justify-between" style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}>
            <div>
              <p className="text-[10px] uppercase font-semibold opacity-60">Winrate</p>
              <h3 className="text-2xl font-extrabold font-outfit mt-0.5" style={{ color: winrateNum >= 50 ? '#34D399' : '#F87171' }}>{detail.winrate}</h3>
            </div>
            <Trophy className="w-6 h-6 opacity-40" style={{ color: palette?.accent }} />
          </div>

          <div className="p-4 rounded-2xl border flex items-center justify-between" style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}>
            <div>
              <p className="text-[10px] uppercase font-semibold opacity-60">W / L Record</p>
              <h3 className="text-2xl font-extrabold font-outfit mt-0.5">{detail.wins} - {detail.losses}</h3>
            </div>
            <ListFilter className="w-6 h-6 opacity-40" style={{ color: palette?.accent }} />
          </div>

          <div className="p-4 rounded-2xl border space-y-1.5" style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}>
            <p className="text-[10px] uppercase font-semibold opacity-60">Play / Draw</p>
            <div className="text-sm font-bold font-mono">
              Play: <span className="text-emerald-400">{detail.play?.wins ?? 0}W</span> / <span className="text-rose-400">{detail.play?.losses ?? 0}L</span>
              <span className="opacity-40 mx-1">•</span>
              Draw: <span className="text-emerald-400">{detail.draw?.wins ?? 0}W</span> / <span className="text-rose-400">{detail.draw?.losses ?? 0}L</span>
            </div>
            <div className="flex gap-1.5">
              {playTotal + drawTotal > 0 && (
                <>
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-white/10">
                    <div className="h-full bg-emerald-400" style={{ width: `${((detail.play?.wins || 0) / (playTotal + drawTotal)) * 100}%` }} />
                  </div>
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-white/10">
                    <div className="h-full bg-rose-400" style={{ width: `${((detail.draw?.losses || 0) / (playTotal + drawTotal)) * 100}%` }} />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Recent 5 matches */}
        <div className="rounded-2xl border" style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}>
          <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: `${palette?.border}66` }}>
            <p className="text-[10px] font-mono uppercase tracking-wider font-bold" style={{ color: palette?.accent }}>Recent Matches</p>
            <button onClick={onViewAll} className="text-[10px] font-mono opacity-60 hover:opacity-100 underline">
              View All →
            </button>
          </div>
          <div className="divide-y divide-white/5">
            {(detail.recent_matches || []).length === 0 ? (
              <div className="p-6 text-center text-xs font-mono opacity-40">No matches recorded</div>
            ) : (
              detail.recent_matches.map((m: any) => (
                <button
                  key={m.match_id}
                  onClick={() => onSelectMatch(m.match_id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
                >
                  <span className="shrink-0">
                    {m.result === 'win' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-400" />
                    )}
                  </span>
                  <span className="flex-1 font-semibold text-sm truncate" style={{ color: palette?.text }}>
                    {m.opponent_name || 'Opponent'}
                  </span>
                  <span className="text-xs font-mono opacity-50">{formatDateShort(m.timestamp)}</span>
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${m.result === 'win' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'}`}>
                    {m.result === 'win' ? 'WIN' : 'LOSS'}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
