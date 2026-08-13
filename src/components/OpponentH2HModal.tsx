import React, { useEffect, useState } from 'react';
import { X, Trophy, Swords, CheckCircle2, XCircle, BarChart3 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface OpponentH2HModalProps {
  isOpen: boolean;
  onClose: () => void;
  opponentName: string | null;
  palette: any;
  onSelectMatch?: (matchId: string) => void;
}

interface H2HStats {
  opponent_name: string;
  total_matches: number;
  wins: number;
  losses: number;
  winrate: string;
}

export function OpponentH2HModal({
  isOpen,
  onClose,
  opponentName,
  palette,
  onSelectMatch,
}: OpponentH2HModalProps) {
  const [stats, setStats] = useState<H2HStats | null>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen || !opponentName) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const h2hStats = await invoke<H2HStats>('get_opponent_h2h_stats', { opponentName });
        const oppMatches = await invoke<any[]>('get_opponent_matches', { opponentName });
        setStats(h2hStats);
        setMatches(oppMatches);
      } catch (e) {
        console.error('Failed to fetch Opponent H2H stats:', e);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isOpen, opponentName]);

  if (!isOpen || !opponentName) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/75 backdrop-blur-xl animate-fade-in select-none">
      <div 
        className="w-full max-w-4xl h-[75vh] rounded-3xl border shadow-2xl flex flex-col overflow-hidden relative"
        style={{ backgroundColor: palette?.mantle || '#12141A', borderColor: palette?.border || '#2A2F3D' }}
      >
        {/* Header Bar */}
        <div className="p-5 border-b flex items-center justify-between shrink-0" style={{ borderColor: palette?.border }}>
          <div className="flex items-center gap-3">
            <Swords className="w-5 h-5" style={{ color: palette?.accent || '#38BDF8' }} />
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider font-bold opacity-60">Head-to-Head Opponent Record</p>
              <h2 className="text-xl font-extrabold font-outfit uppercase tracking-wide" style={{ color: palette?.text }}>
                vs {opponentName}
              </h2>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="p-2 rounded-xl border opacity-60 hover:opacity-100 hover:bg-white/5 transition-all"
            style={{ borderColor: palette?.border }}
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-hidden p-6 flex flex-col space-y-6">
          {/* Top Lifetime H2H Summary KPI Cards */}
          <div className="grid grid-cols-4 gap-4 shrink-0">
            <div className="p-4 rounded-2xl border flex items-center justify-between shadow-md" style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}>
              <div>
                <p className="text-[10px] uppercase font-semibold opacity-60">Total Played</p>
                <h3 className="text-2xl font-extrabold font-outfit mt-0.5">{stats?.total_matches ?? 0}</h3>
              </div>
              <BarChart3 className="w-5 h-5 opacity-40" style={{ color: palette?.accent }} />
            </div>

            <div className="p-4 rounded-2xl border flex items-center justify-between shadow-md" style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}>
              <div>
                <p className="text-[10px] uppercase font-semibold opacity-60">H2H Winrate</p>
                <h3 className="text-2xl font-extrabold font-outfit mt-0.5" style={{ color: palette?.accent || '#38BDF8' }}>
                  {stats?.winrate ?? '0.0'}%
                </h3>
              </div>
              <Trophy className="w-5 h-5 opacity-40" style={{ color: palette?.accent }} />
            </div>

            <div className="p-4 rounded-2xl border flex items-center justify-between shadow-md" style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}>
              <div>
                <p className="text-[10px] uppercase font-semibold opacity-60">Your Wins</p>
                <h3 className="text-2xl font-extrabold font-outfit mt-0.5 text-emerald-400">{stats?.wins ?? 0}</h3>
              </div>
              <CheckCircle2 className="w-5 h-5 text-emerald-400/40" />
            </div>

            <div className="p-4 rounded-2xl border flex items-center justify-between shadow-md" style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}>
              <div>
                <p className="text-[10px] uppercase font-semibold opacity-60">Opponent Wins</p>
                <h3 className="text-2xl font-extrabold font-outfit mt-0.5 text-rose-400">{stats?.losses ?? 0}</h3>
              </div>
              <XCircle className="w-5 h-5 text-rose-400/40" />
            </div>
          </div>

          {/* Filtered Match History List Against Opponent */}
          <div className="flex-1 rounded-2xl border overflow-hidden shadow-inner flex flex-col" style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}>
            <div className="p-3 border-b text-xs font-mono font-bold uppercase tracking-wider opacity-60 flex items-center justify-between" style={{ borderColor: palette?.border }}>
              <span>Filtered Match History ({matches.length} Games)</span>
              <span>Click row to view full match</span>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
              {loading ? (
                <div className="p-8 text-center text-xs opacity-40 font-mono">Loading opponent records...</div>
              ) : matches.length === 0 ? (
                <div className="p-8 text-center text-xs opacity-40 font-mono">No previous matches recorded against {opponentName}</div>
              ) : (
                matches.map((m) => (
                  <div
                    key={m.match_id}
                    onClick={() => {
                      if (onSelectMatch) onSelectMatch(m.match_id);
                      onClose();
                    }}
                    className="flex items-center justify-between p-3.5 border-b transition-colors cursor-pointer hover:bg-white/10"
                    style={{ borderColor: `${palette?.border}66` }}
                  >
                    <div className="flex items-center gap-3">
                      {m.result === 'win' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono">
                          WIN
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30 font-mono">
                          LOSS
                        </span>
                      )}
                      <div>
                        <p className="text-xs font-bold" style={{ color: palette?.text }}>{m.player_deck_name}</p>
                        <p className="text-[10px] font-mono opacity-50">{m.date_str} • {m.format_name}</p>
                      </div>
                    </div>

                    <div className="text-right font-mono text-xs opacity-70">
                      {m.turns} Turns
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
