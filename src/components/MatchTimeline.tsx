import React, { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, AlertCircle, Play, Sparkles } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { CardItem } from './CardBreakdown';
import { RenderManaCost } from '../utils/manaUtils';

interface TurnEventItem {
  turn_number: number;
  seat_id: number;
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
  onHoverCard?: (card: CardItem | null) => void;
}

export function MatchTimeline({
  matchId,
  turns,
  goingFirst,
  result,
  palette,
  cards,
  onHoverCard,
}: MatchTimelineProps) {
  const [turnEvents, setTurnEvents] = useState<TurnEventItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchEvents = async () => {
      setLoading(true);
      try {
        const events = await invoke<TurnEventItem[]>('get_match_turn_events', { matchId });
        setTurnEvents(events);
      } catch (e) {
        console.error('Failed to fetch match turn events:', e);
        setTurnEvents([]);
      } finally {
        setLoading(false);
      }
    };
    fetchEvents();
  }, [matchId]);

  // Group turn events by turn_number
  const eventsByTurn = React.useMemo(() => {
    const map: Record<number, TurnEventItem[]> = {};
    for (const ev of turnEvents) {
      if (!map[ev.turn_number]) {
        map[ev.turn_number] = [];
      }
      map[ev.turn_number].push(ev);
    }
    return map;
  }, [turnEvents]);

  return (
    <div className="flex flex-col h-full space-y-3">
      {/* Items 8 & 9: Prominent Header Banner Showing Play/Draw Order and Total Turns */}
      <div className="p-3 rounded-xl border flex items-center justify-between text-xs font-mono" style={{ backgroundColor: `${palette?.surface}CC`, borderColor: palette?.border }}>
        <div className="flex items-center gap-2">
          <Play className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
          <span className="opacity-60">Order: </span>
          <span className="font-bold text-amber-400">{goingFirst ? 'Went First (Play)' : 'Went Second (Draw)'}</span>
        </div>
        <div>
          <span className="opacity-60">Duration: </span>
          <span className="font-bold">{turns} Turns</span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
        {loading ? (
          <div className="p-8 text-center text-xs opacity-40 font-mono">Loading turn timeline...</div>
        ) : turnEvents.length === 0 ? (
          /* Item 7: Legacy Match Message (No Fabricated Modulo Slices) */
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
          /* Live Turn-by-Turn Events Stream */
          Object.entries(eventsByTurn).map(([turnStr, evList]) => {
            const turnNum = parseInt(turnStr, 10);
            return (
              <div 
                key={turnNum}
                className="p-3 rounded-xl border space-y-2"
                style={{ backgroundColor: palette?.surface, borderColor: `${palette?.border}88` }}
              >
                <div className="flex items-center justify-between border-b pb-1.5" style={{ borderColor: `${palette?.border}44` }}>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-black/50 border" style={{ borderColor: palette?.border, color: palette?.accent }}>
                    Turn {turnNum}
                  </span>
                  <span className="text-[9px] font-mono opacity-50">
                    {turnNum % 2 === (goingFirst ? 1 : 0) ? 'Player Turn' : 'Opponent Turn'}
                  </span>
                </div>

                <div className="space-y-1 pl-1">
                  {evList.map((ev, idx) => (
                    <div 
                      key={idx}
                      onMouseEnter={() => onHoverCard && onHoverCard({ grp_id: ev.grp_id, is_opponent: ev.seat_id !== 1, count: 1, name: ev.name, mana_cost: ev.mana_cost, card_type: ev.card_type })}
                      onMouseLeave={() => onHoverCard && onHoverCard(null)}
                      className="text-xs flex items-center justify-between p-1.5 rounded hover:bg-white/10 cursor-pointer group"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-mono font-bold uppercase px-1.5 py-0.2 rounded border ${
                          ev.event_type === 'play' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-sky-500/10 text-sky-400 border-sky-500/30'
                        }`}>
                          {ev.event_type}
                        </span>
                        <span className="font-semibold text-xs" style={{ color: palette?.text }}>{ev.name}</span>
                      </div>
                      <RenderManaCost costStr={ev.mana_cost} size={12} />
                    </div>
                  ))}
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
