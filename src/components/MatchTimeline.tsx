import React, { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, AlertCircle, Play } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { CardItem } from './CardBreakdown';
import { AchievementBadge } from './AchievementBadge';
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
  titles?: string[];
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

  const { openingEvents, eventsByRound } = React.useMemo(() => {
    const opening: { player: TurnEventItem[]; opponent: TurnEventItem[] } = { player: [], opponent: [] };
    const map: Record<number, { player: TurnEventItem[]; opponent: TurnEventItem[] }> = {};

    for (const ev of turnEvents) {
      const isPlayer = ev.is_player !== undefined ? ev.is_player : (ev.seat_id === heroSeatId);
      if (ev.turn_number === 0) {
        (isPlayer ? opening.player : opening.opponent).push(ev);
      } else {
        const round = Math.ceil(ev.turn_number / 2);
        if (!map[round]) {
          map[round] = { player: [], opponent: [] };
        }
        (isPlayer ? map[round].player : map[round].opponent).push(ev);
      }
    }
    return { openingEvents: opening, eventsByRound: map };
  }, [turnEvents, heroSeatId]);

  const CARD_TYPE_CONFIG: Record<string, { icon: string; color: string; bg: string; border: string }> = {
    Creature: { icon: 'ms-creature', color: '#34D399', bg: 'rgba(52, 211, 153, 0.1)', border: 'rgba(52, 211, 153, 0.25)' },
    Instant: { icon: 'ms-instant', color: '#F87171', bg: 'rgba(248, 113, 113, 0.1)', border: 'rgba(248, 113, 113, 0.25)' },
    Sorcery: { icon: 'ms-sorcery', color: '#FBBF24', bg: 'rgba(251, 191, 36, 0.1)', border: 'rgba(251, 191, 36, 0.25)' },
    Artifact: { icon: 'ms-artifact', color: '#94A3B8', bg: 'rgba(148, 163, 184, 0.1)', border: 'rgba(148, 163, 184, 0.25)' },
    Enchantment: { icon: 'ms-enchantment', color: '#C084FC', bg: 'rgba(192, 132, 252, 0.1)', border: 'rgba(192, 132, 252, 0.25)' },
    Planeswalker: { icon: 'ms-planeswalker', color: '#FB923C', bg: 'rgba(251, 146, 60, 0.1)', border: 'rgba(251, 146, 60, 0.25)' },
    Battle: { icon: 'ms-battle', color: '#F43F5E', bg: 'rgba(244, 63, 94, 0.1)', border: 'rgba(244, 63, 94, 0.25)' },
    Land: { icon: 'ms-land', color: '#D97706', bg: 'rgba(217, 119, 6, 0.1)', border: 'rgba(217, 119, 6, 0.25)' },
    Token: { icon: 'ms-token', color: '#A1A1AA', bg: 'rgba(161, 161, 170, 0.1)', border: 'rgba(161, 161, 170, 0.25)' },
    Other: { icon: 'ms-multicolor', color: '#E2E8F0', bg: 'rgba(226, 232, 240, 0.1)', border: 'rgba(226, 232, 240, 0.25)' },
  };

  const getCardTypeBadge = (rawType?: string) => {
    if (!rawType) return null;
    const lower = rawType.toLowerCase();
    let category = 'Other';
    if (lower.includes('token')) category = 'Token';
    else {
      for (const kw of ['planeswalker', 'battle', 'creature', 'land', 'enchantment', 'artifact', 'instant', 'sorcery']) {
        if (lower.includes(kw)) {
          category = kw[0].toUpperCase() + kw.slice(1);
          break;
        }
      }
    }
    const conf = CARD_TYPE_CONFIG[category] || CARD_TYPE_CONFIG.Other;
    return (
      <span
        className="inline-flex items-center gap-1 text-[9px] font-mono font-bold px-1.5 py-0.2 border shrink-0"
        style={{ color: conf.color, backgroundColor: conf.bg, borderColor: conf.border }}
        title={rawType}
      >
        <span className={`ms ${conf.icon} text-[10px] leading-none`} style={{ color: conf.color }} />
        <span>{category}</span>
      </span>
    );
  };

  const renderEventRow = (ev: TurnEventItem, isPlayer: boolean) => {
    const isDamage = ev.event_type.startsWith('damage:');
    let dmgAmount = '';
    if (isDamage) {
      const parts = ev.event_type.split(':');
      dmgAmount = parts[2] || '';
    }

    const isMulligan = ev.event_type === 'mulligan';
    const isBottom = ev.event_type === 'bottom';
    const isHidden = ev.grp_id === 0;

    const displayName = isHidden
      ? (isMulligan ? 'Mulligan taken (Hand shuffled back)' : 'Card bottomed')
      : ev.name;

    return (
      <div
        key={`${ev.turn_number}-${ev.seat_id}-${ev.grp_id}-${ev.event_type}-${ev.timestamp}-${Math.random()}`}
        onClick={() => {
          if (!isHidden && onCardClick) {
            onCardClick({ grp_id: ev.grp_id, is_opponent: !isPlayer, count: 1, name: ev.name, mana_cost: ev.mana_cost, card_type: ev.card_type }, ev.turn_number);
          }
        }}
        className={`text-xs flex items-center justify-between p-1.5 border border-white/5 bg-white/[0.015] ${
          isHidden ? 'opacity-70' : 'hover:bg-white/5 cursor-pointer'
        } group`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {isDamage ? (
            <span className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.2 border shrink-0 bg-amber-500/15 text-amber-300 border-amber-500/30">
              {dmgAmount} DMG
            </span>
          ) : (
            (() => {
              let badgeText = 'PLAY';
              let badgeStyle = 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30';
              if (isMulligan) {
                badgeText = 'MULLIGAN';
                badgeStyle = 'bg-amber-500/15 text-amber-300 border-amber-500/30';
              } else if (isBottom) {
                badgeText = 'BOTTOM';
                badgeStyle = 'bg-orange-500/15 text-orange-300 border-orange-500/30';
              } else if (ev.event_type === 'draw') {
                badgeText = ev.turn_number === 0 ? 'KEPT' : 'DRAW';
                badgeStyle = ev.turn_number === 0 ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' : 'bg-purple-500/10 text-purple-300 border-purple-500/30';
              } else if (ev.event_type === 'token') {
                badgeText = 'TOKEN';
                badgeStyle = 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30';
              } else if (ev.event_type === 'dies') {
                badgeText = 'DIES';
                badgeStyle = 'bg-rose-500/10 text-rose-300 border-rose-500/30';
              } else if (ev.event_type === 'exile') {
                badgeText = 'EXILE';
                badgeStyle = 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30';
              }
              return (
                <span className={`text-[9px] font-mono font-bold uppercase px-1.5 py-0.2 border shrink-0 ${badgeStyle}`}>
                  {badgeText}
                </span>
              );
            })()
          )}
          <span className={`font-display font-bold text-xs uppercase tracking-wide truncate ${isHidden ? 'italic opacity-60' : 'text-white group-hover:underline'}`}>
            {displayName}
          </span>
          {!isHidden && getCardTypeBadge(ev.card_type)}
          {!isHidden && ev.titles && ev.titles.length > 0 && (
            <div className="flex items-center gap-1 shrink-0">
              {ev.titles.map((t, ti) => (
                <AchievementBadge
                  key={ti}
                  title={t}
                  size="sm"
                  showTooltip={true}
                />
              ))}
            </div>
          )}
        </div>
        {!isHidden && <RenderManaCost costStr={ev.mana_cost} size={12} />}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col space-y-3 p-3 border border-white/10 bg-neutral-950/80 min-h-0 overflow-hidden">
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2 shrink-0">
        <div className="flex items-center gap-2">
          <Play className="w-3.5 h-3.5 text-neutral-400" />
          <h3 className="text-xs font-display font-bold uppercase tracking-wider text-white">
            Match Play Timeline
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-neutral-500 tabular-nums">Total Events: {turnEvents.length}</span>
          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 border uppercase tracking-wider ${
            result === 'win' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
          }`}>
            {result}
          </span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 custom-scrollbar min-h-0">
        {loading ? (
          <div className="p-8 text-center text-xs text-neutral-500 font-mono">Loading turn timeline...</div>
        ) : turnEvents.length === 0 ? (
          <div className="p-8 border border-dashed border-white/10 text-center space-y-1.5 bg-neutral-900/30">
            <AlertCircle className="w-5 h-5 mx-auto text-amber-400 opacity-60" />
            <p className="text-xs font-bold font-display uppercase tracking-wide text-white">
              Detailed Turn Timeline Unavailable
            </p>
            <p className="text-[11px] font-sans text-neutral-400 max-w-sm mx-auto">
              This is a historical match. Live turn-stamped event logging is enabled for all new live matches going forward.
            </p>
          </div>
        ) : (
          <>
            {/* Opening Hand & Mulligans Phase (Turn 0) */}
            {(openingEvents.player.length > 0 || openingEvents.opponent.length > 0) && (
              <div className="p-2.5 border border-white/10 bg-neutral-900/40 space-y-2">
                <div className="flex items-center justify-between border-b border-white/10 pb-1">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-purple-300">
                    Opening Phase & Mulligans
                  </span>
                  <span className="text-[9px] font-mono text-neutral-500">Pre-Game</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {/* Player Opening Hand */}
                  <div className="border border-white/5 bg-black/40 p-2 space-y-1">
                    <div className="text-[9.5px] font-mono font-bold uppercase tracking-wider text-emerald-400 border-b border-white/10 pb-1">
                      You ({openingEvents.player.length})
                    </div>
                    {openingEvents.player.length === 0 ? (
                      <div className="text-[10px] font-mono text-neutral-600 p-1">No opening cards recorded</div>
                    ) : (
                      openingEvents.player.map((ev) => renderEventRow(ev, true))
                    )}
                  </div>

                  {/* Opponent Opening Hand */}
                  <div className="border border-white/5 bg-black/40 p-2 space-y-1">
                    <div className="text-[9.5px] font-mono font-bold uppercase tracking-wider text-rose-400 border-b border-white/10 pb-1">
                      {(opponentName || 'Opponent')} ({openingEvents.opponent.length})
                    </div>
                    {openingEvents.opponent.length === 0 ? (
                      <div className="text-[10px] font-mono text-neutral-600 p-1">No mulligans taken</div>
                    ) : (
                      openingEvents.opponent.map((ev) => renderEventRow(ev, false))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* In-Game Rounds (Turn >= 1) */}
            {Object.entries(eventsByRound).map(([roundStr, cols]) => {
              const roundNum = parseInt(roundStr, 10);
              const playerCount = cols.player.length;
              const opponentCount = cols.opponent.length;
              if (playerCount === 0 && opponentCount === 0) return null;

              return (
                <div
                  key={roundNum}
                  className="p-2.5 border border-white/10 bg-neutral-900/30 space-y-2"
                >
                  <div className="flex items-center justify-between border-b border-white/10 pb-1">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-white">
                      Round {roundNum}
                    </span>
                    <span className="text-[9px] font-mono text-neutral-500">
                      {`Turn ${roundNum * 2 - 1} + ${roundNum * 2}`}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {/* Player Column */}
                    <div className="border border-white/5 bg-black/40 p-2 space-y-1">
                      <div className="text-[9.5px] font-mono font-bold uppercase tracking-wider text-emerald-400 border-b border-white/10 pb-1">
                        You ({playerCount})
                      </div>
                      {playerCount === 0 ? (
                        <div className="text-[10px] font-mono text-neutral-600 p-1">No actions</div>
                      ) : (
                        cols.player.map((ev) => renderEventRow(ev, true))
                      )}
                    </div>

                    {/* Opponent Column */}
                    <div className="border border-white/5 bg-black/40 p-2 space-y-1">
                      <div className="text-[9.5px] font-mono font-bold uppercase tracking-wider text-rose-400 border-b border-white/10 pb-1">
                        {(opponentName || 'Opponent')} ({opponentCount})
                      </div>
                      {opponentCount === 0 ? (
                        <div className="text-[10px] font-mono text-neutral-600 p-1">No actions</div>
                      ) : (
                        cols.opponent.map((ev) => renderEventRow(ev, false))
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* Final Match Outcome Marker at Bottom of Sequence */}
        <div className="pt-1">
          {result === 'win' ? (
            <div className="p-2.5 border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 flex items-center justify-center gap-2 text-xs font-bold tracking-widest font-mono uppercase">
              <CheckCircle2 className="w-4 h-4" /> MATCH ENDED — VICTORY
            </div>
          ) : (
            <div className="p-2.5 border border-rose-500/30 bg-rose-500/10 text-rose-400 flex items-center justify-center gap-2 text-xs font-bold tracking-widest font-mono uppercase">
              <XCircle className="w-4 h-4" /> MATCH ENDED — DEFEAT
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MatchTimeline;
