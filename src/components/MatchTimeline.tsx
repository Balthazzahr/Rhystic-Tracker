import React, { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, AlertCircle, Play, Sparkles } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { CardItem } from './CardBreakdown';
import { RenderManaCost } from '../utils/manaUtils';

interface TurnEventItem {
  turn_number: number;
  seat_id: number;
  is_player?: boolean;
  event_type: 'play' | 'draw' | string;
  grp_id: number;
  timestamp: string;
  name: string;
  card_type?: string;
  mana_cost?: string;
}

interface MatchTimelineProps {
  matchId: string;
  turns: number;
  goingFirst: boolean;
  result: string;
  palette: any;
  cards: CardItem[];
  opponentName?: string;
  onCardClick?: (card: CardItem, turn: number) => void;
}

export function MatchTimeline({
  matchId,
  turns,
  goingFirst,
  result,
  palette,
  cards,
  opponentName,
  onCardClick,
}: MatchTimelineProps) {
  const [turnEvents, setTurnEvents] = useState<TurnEventItem[]>([]);
  const [heroSeatId, setHeroSeatId] = useState<number>(goingFirst ? 1 : 2);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchEvents = async () => {
      setLoading(true);
      try {
        const res = await invoke<any>('get_match_turn_events', { matchId });
        if (res && Array.isArray(res.events)) {
          setTurnEvents(res.events);
          setHeroSeatId(res.hero_seat_id || (goingFirst ? 1 : 2));
        } else if (Array.isArray(res)) {
          setTurnEvents(res);
        }
      } catch (e) {
        console.error('Failed to fetch match turn events:', e);
        setTurnEvents([]);
      } finally {
        setLoading(false);
      }
    };
    fetchEvents();
  }, [matchId, goingFirst]);

  // Group turn events by round. MTGA's turnNumber increments once per player-turn,
  // so a "round" (both players having taken a turn) spans two turn numbers:
  // Round 1 = turns 1 & 2, Round 2 = turns 3 & 4, etc.
  const eventsByRound = React.useMemo(() => {
    const map: Record<number, { player: TurnEventItem[]; opponent: TurnEventItem[] }> = {};
    for (const ev of turnEvents) {
      const round = Math.ceil(ev.turn_number / 2);
      if (!map[round]) {
        map[round] = { player: [], opponent: [] };
      }
      const isPlayer = ev.is_player !== undefined ? ev.is_player : (ev.seat_id === heroSeatId);
      (isPlayer ? map[round].player : map[round].opponent).push(ev);
    }
    return map;
  }, [turnEvents, heroSeatId]);

  const renderEventRow = (ev: TurnEventItem, isPlayer: boolean) => (
    <div
      key={`${ev.turn_number}-${ev.seat_id}-${ev.grp_id}-${ev.timestamp}`}
      onClick={() => onCardClick && onCardClick({ grp_id: ev.grp_id, is_opponent: !isPlayer, count: 1, name: ev.name, mana_cost: ev.mana_cost, card_type: ev.card_type }, ev.turn_number)}
      className="text-xs flex items-center justify-between p-1.5 rounded hover:bg-white/10 cursor-pointer group"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className={`text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded border shrink-0 ${
          ev.event_type === 'play' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-purple-500/10 text-purple-400 border-purple-500/30'
        }`}>
          {ev.event_type === 'draw' ? 'draw' : 'play'}
        </span>
        <span className="font-semibold text-xs truncate" style={{ color: palette?.text }}>{ev.name}</span>
      </div>
      <RenderManaCost costStr={ev.mana_cost} size={12} />
    </div>
  );

  return (
    <div className="h-full flex flex-col space-y-4 p-4 rounded-2xl border" style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}>
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: `${palette?.border}88` }}>
        <div className="flex items-center gap-2">
          <Play className="w-4 h-4" style={{ color: palette?.accent }} />
          <h3 className="font-bold text-sm font-outfit uppercase tracking-wide" style={{ color: palette?.text }}>
            Match Play Timeline
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono opacity-60">Total Events: {turnEvents.length}</span>
          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase ${
            result === 'win' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
          }`}>
            {result}
          </span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
        {loading ? (
          <div className="p-8 text-center text-xs opacity-40 font-mono">Loading turn timeline...</div>
        ) : turnEvents.length === 0 ? (
          <div className="p-8 border border-dashed rounded-2xl text-center space-y-2" style={{ backgroundColor: `${palette?.surface}44`, borderColor: palette?.border }}>
            <AlertCircle className="w-6 h-6 mx-auto opacity-40 text-amber-400" />
            <p className="text-xs font-bold font-outfit" style={{ color: palette?.text }}>
              Detailed Turn Timeline Unavailable
            </p>
            <p className="text-[10px] font-mono opacity-50 max-w-sm mx-auto">
              This is a historical match. Live turn-stamped event logging is enabled for all new live matches going forward.
            </p>
          </div>
        ) : (
          Object.entries(eventsByRound).map(([roundStr, cols]) => {
            const roundNum = parseInt(roundStr, 10);
            const playerCount = cols.player.length;
            const opponentCount = cols.opponent.length;
            if (playerCount === 0 && opponentCount === 0) return null;

            return (
              <div
                key={roundNum}
                className="p-3 rounded-xl border space-y-2"
                style={{ backgroundColor: palette?.surface, borderColor: `${palette?.border}88` }}
              >
                <div className="flex items-center justify-between border-b pb-1.5" style={{ borderColor: `${palette?.border}44` }}>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-black/50 border" style={{ borderColor: palette?.border, color: palette?.accent }}>
                    Round {roundNum}
                  </span>
                  <span className="text-[9px] font-mono opacity-50">
                    {`Turn ${roundNum * 2 - 1} + ${roundNum * 2}`}
                  </span>
                </div>

                {/* Two-column: Player vs Opponent actions for this round */}
                <div className="grid grid-cols-2 gap-2">
                  {/* Player Column */}
                  <div className="rounded-lg border p-2 space-y-1" style={{ borderColor: `${palette?.border}66`, backgroundColor: `${palette?.surface}44` }}>
                    <div className="text-[9px] font-mono font-bold uppercase tracking-wider text-sky-400 border-b pb-1" style={{ borderColor: `${palette?.border}44` }}>
                      You ({playerCount})
                    </div>
                    {playerCount === 0 ? (
                      <div className="text-[10px] font-mono opacity-30 p-1">No actions</div>
                    ) : (
                      cols.player.map((ev) => renderEventRow(ev, true))
                    )}
                  </div>

                  {/* Opponent Column */}
                  <div className="rounded-lg border p-2 space-y-1" style={{ borderColor: `${palette?.border}66`, backgroundColor: `${palette?.surface}44` }}>
                    <div className="text-[9px] font-mono font-bold uppercase tracking-wider text-amber-400 border-b pb-1" style={{ borderColor: `${palette?.border}44` }}>
                      {(opponentName || 'Opponent')} ({opponentCount})
                    </div>
                    {opponentCount === 0 ? (
                      <div className="text-[10px] font-mono opacity-30 p-1">No actions</div>
                    ) : (
                      cols.opponent.map((ev) => renderEventRow(ev, false))
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* Item 8: Color-Coded Final Match Outcome Marker at Bottom of Sequence */}
        <div className="pt-2">
          {result === 'win' ? (
            <div className="p-3 rounded-xl border bg-emerald-500/10 text-emerald-400 border-emerald-500/30 flex items-center justify-center gap-2 text-xs font-black tracking-widest font-mono uppercase">
              <CheckCircle2 className="w-4 h-4" /> MATCH ENDED — VICTORY
            </div>
          ) : (
            <div className="p-3 rounded-xl border bg-rose-500/10 text-rose-400 border-rose-500/30 flex items-center justify-center gap-2 text-xs font-black tracking-widest font-mono uppercase">
              <XCircle className="w-4 h-4" /> MATCH ENDED — DEFEAT
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
