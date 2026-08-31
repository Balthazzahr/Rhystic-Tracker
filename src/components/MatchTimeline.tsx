import React, { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, AlertCircle, Play } from 'lucide-react';
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
    const opening: { first: TurnEventItem[]; second: TurnEventItem[] } = { first: [], second: [] };
    const map: Record<number, { first: TurnEventItem[]; second: TurnEventItem[]; firstTurn: number; secondTurn: number }> = {};

    for (const ev of turnEvents) {
      const isPlayer = ev.is_player !== undefined ? ev.is_player : (ev.seat_id === heroSeatId);
      const isFirst = goingFirst ? isPlayer : !isPlayer;

      if (ev.turn_number === 0) {
        (isFirst ? opening.first : opening.second).push(ev);
      } else {
        const round = Math.ceil(ev.turn_number / 2);
        if (!map[round]) {
          map[round] = {
            first: [],
            second: [],
            firstTurn: round * 2 - 1,
            secondTurn: round * 2,
          };
        }
        const isFirstTurn = ev.turn_number % 2 !== 0;
        (isFirstTurn ? map[round].first : map[round].second).push(ev);
      }
    }
    return { openingEvents: opening, eventsByRound: map };
  }, [turnEvents, heroSeatId, goingFirst]);

  const CARD_TYPE_CONFIG: Record<string, { icon: string; color: string }> = {
    Creature: { icon: 'ms-creature', color: '#22C55E' },
    Instant: { icon: 'ms-instant', color: '#EF4444' },
    Sorcery: { icon: 'ms-sorcery', color: '#F59E0B' },
    Artifact: { icon: 'ms-artifact', color: '#94A3B8' },
    Enchantment: { icon: 'ms-enchantment', color: '#A855F7' },
    Planeswalker: { icon: 'ms-planeswalker', color: '#F97316' },
    Battle: { icon: 'ms-battle', color: '#F43F5E' },
    Land: { icon: 'ms-land', color: '#D97706' },
  };

  const getCardTypeBadge = (rawType?: string) => {
    if (!rawType) return null;
    const match = Object.entries(CARD_TYPE_CONFIG).find(([k]) =>
      rawType.toLowerCase().includes(k.toLowerCase())
    );
    if (!match) return null;
    const [typeName, info] = match;
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold px-1.5 py-0.5 border shrink-0 border-white/10 bg-white/[0.04] text-neutral-300">
        <i className={`ms ${info.icon} text-[10px]`} style={{ color: info.color }} />
        <span>{rawType}</span>
      </span>
    );
  };

  const renderEventRow = (ev: TurnEventItem, columnIsFirst?: boolean) => {
    const isPlayer = ev.is_player !== undefined ? ev.is_player : (ev.seat_id === heroSeatId);
    const activePlayerIsHero = columnIsFirst !== undefined ? (columnIsFirst ? goingFirst : !goingFirst) : isPlayer;
    const isAcrossTurn = columnIsFirst !== undefined && isPlayer !== activePlayerIsHero;
    const ownerTag = isAcrossTurn ? (isPlayer ? ' (You)' : ' (Opponent)') : '';

    const isDamage = ev.event_type.startsWith('damage:');
    if (isDamage) {
      const parts = ev.event_type.split(':');
      const tgtId = parseInt(parts[1] || '0', 10);
      const amount = parts[2] || '0';
      const targetName = tgtId === 1 || tgtId === 2
        ? (tgtId === heroSeatId ? 'You' : (opponentName || 'Opponent'))
        : `Target #${tgtId}`;

      return (
        <div
          key={`${ev.turn_number}-${ev.seat_id}-${ev.grp_id}-${ev.event_type}-${ev.timestamp}-${Math.random()}`}
          className="text-xs font-mono flex items-center gap-2 py-1 px-2.5 border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
        >
          <span className="px-1.5 py-0.5 border text-[9.5px] font-mono font-bold uppercase bg-amber-950/50 text-amber-300 border-amber-500/30 shrink-0 tabular-nums">
            {amount} DMG
          </span>
          <span
            className="truncate font-sans font-semibold text-white hover:text-amber-300 hover:underline cursor-pointer transition-colors text-xs"
            onClick={() => onCardClick && onCardClick({ grp_id: ev.grp_id, is_opponent: !isPlayer, count: 1, name: ev.name, mana_cost: ev.mana_cost, card_type: ev.card_type }, ev.turn_number)}
          >
            {ev.name}{ownerTag}
          </span>
          {getCardTypeBadge(ev.card_type)}
          <span className="text-neutral-500 text-[10px] shrink-0">→</span>
          <span className="truncate text-amber-200/80 text-xs font-sans">
            {targetName}
          </span>
        </div>
      );
    }

    const isLife = ev.event_type.startsWith('life:');
    if (isLife) {
      const parts = ev.event_type.split(':');
      const d = parseInt(parts[1] || '0', 10);
      const total = parseInt(parts[2] || '0', 10);
      const oldTotal = total - d;
      const positive = d >= 0;
      const isOpponent = !isPlayer;
      const sign = positive ? '+' : '';
      const srcName = ev.grp_id > 0 && ev.name ? ` (${ev.name})` : '';
      const displayStr = `${oldTotal} → ${total} (${sign}${d})${srcName}`;

      return (
        <div
          key={`${ev.turn_number}-${ev.seat_id}-${ev.grp_id}-${ev.event_type}-${ev.timestamp}-${Math.random()}`}
          className="text-xs font-mono flex items-center gap-2 py-1 px-2.5 border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
        >
          <span
            className={`px-1.5 py-0.5 border text-[9.5px] font-mono font-bold uppercase shrink-0 tabular-nums ${
              positive
                ? 'bg-emerald-950/50 text-emerald-300 border-emerald-500/30'
                : 'bg-rose-950/50 text-rose-300 border-rose-500/30'
            }`}
          >
            {isOpponent ? 'OPP LIFE ' : 'LIFE '}{positive ? `+${d}` : d}
          </span>
          <span className={`truncate font-sans font-medium text-xs ${positive ? 'text-emerald-300/90' : 'text-rose-300/90'}`}>
            {displayStr}{ownerTag}
          </span>
        </div>
      );
    }

    const isCounter = ev.event_type.startsWith('counter:');
    if (isCounter) {
      const parts = ev.event_type.split(':');
      const counterName = parts[1] || '+1/+1';
      const amount = parseInt(parts[2] || '1', 10);
      let badgeText = '';
      if (counterName === '+1/+1') {
        badgeText = amount > 0 ? `+${amount} +1/+1` : `${amount} +1/+1`;
      } else {
        const cLabel = counterName === 'counter' ? 'COUNTER' : `${counterName.toUpperCase()} COUNTER`;
        badgeText = amount > 0 ? `+${amount} ${cLabel}` : `${amount} ${cLabel}`;
      }
      return (
        <div
          key={`${ev.turn_number}-${ev.seat_id}-${ev.grp_id}-${ev.event_type}-${ev.timestamp}-${Math.random()}`}
          className="text-xs font-mono flex items-center gap-2 py-1 px-2.5 border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
        >
          <span className="px-1.5 py-0.5 border text-[9.5px] font-mono font-bold uppercase bg-amber-950/50 text-amber-300 border-amber-500/30 shrink-0 tabular-nums">
            {badgeText}
          </span>
          <span
            className="truncate font-sans font-medium text-neutral-100 hover:text-white hover:underline cursor-pointer transition-colors text-xs"
            onClick={() => ev.grp_id > 0 && onCardClick && onCardClick({ grp_id: ev.grp_id, is_opponent: !isPlayer, count: 1, name: ev.name, mana_cost: ev.mana_cost, card_type: ev.card_type }, ev.turn_number)}
          >
            {ev.name}{ownerTag}
          </span>
          {getCardTypeBadge(ev.card_type)}
        </div>
      );
    }

    let badgeText = 'PLAY';
    let badgeStyle = 'bg-[#4A7856]/20 text-[#76A382] border-[#4A7856]/40';
    if (ev.event_type === 'mulligan') {
      badgeText = 'MULLIGAN';
      badgeStyle = 'bg-[#D4A237]/20 text-[#E2BF6F] border-[#D4A237]/40';
    } else if (ev.event_type === 'bottom') {
      badgeText = 'BOTTOM';
      badgeStyle = 'bg-[#B8503A]/20 text-[#D57C69] border-[#B8503A]/40';
    } else if (ev.event_type === 'draw') {
      badgeText = ev.turn_number === 0 ? 'KEPT' : 'DRAW';
      badgeStyle = 'bg-[#4A7FA3]/20 text-[#7FAAC9] border-[#4A7FA3]/40';
    } else if (ev.event_type === 'token') {
      badgeText = 'TOKEN';
      badgeStyle = 'bg-[#3D7D7D]/20 text-[#6EA8A8] border-[#3D7D7D]/40';
    } else if (ev.event_type === 'dies') {
      badgeText = 'DIES';
      badgeStyle = 'bg-[#B8503A]/20 text-[#D57C69] border-[#B8503A]/40';
    } else if (ev.event_type === 'exile') {
      badgeText = 'EXILE';
      badgeStyle = 'bg-[#8A719D]/20 text-[#B39EC4] border-[#8A719D]/40';
    }

    const isHidden = ev.grp_id === 0;
    const displayName = isHidden
      ? (ev.event_type === 'mulligan' ? 'Mulligan taken (Hand shuffled back)' : 'Card bottomed')
      : ev.name;

    return (
      <div
        key={`${ev.turn_number}-${ev.seat_id}-${ev.grp_id}-${ev.event_type}-${ev.timestamp}-${Math.random()}`}
        className="text-xs font-mono flex items-center justify-between py-1 px-2.5 border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className={`px-1.5 py-0.5 border text-[9.5px] font-mono font-bold uppercase shrink-0 ${badgeStyle}`}>
            {badgeText}
          </span>
          <span
            className={`truncate font-sans font-medium text-xs ${
              isHidden ? 'italic text-neutral-400' : 'text-neutral-100 hover:text-white hover:underline cursor-pointer'
            }`}
            onClick={() => !isHidden && onCardClick && onCardClick({ grp_id: ev.grp_id, is_opponent: !isPlayer, count: 1, name: ev.name, mana_cost: ev.mana_cost, card_type: ev.card_type }, ev.turn_number)}
          >
            {displayName}{ownerTag}
          </span>
          {!isHidden && getCardTypeBadge(ev.card_type)}
        </div>
        {!isHidden && ev.mana_cost && <RenderManaCost costStr={ev.mana_cost} size={12} />}
      </div>
    );
  };

  const leftLabel = goingFirst ? 'Your Timeline' : `${opponentName || 'Opponent'} Timeline`;
  const rightLabel = goingFirst ? `${opponentName || 'Opponent'} Timeline` : 'Your Timeline';
  const leftColor = goingFirst ? 'text-[#76A382]' : 'text-[#D57C69]';
  const rightColor = goingFirst ? 'text-[#D57C69]' : 'text-[#76A382]';

  return (
    <div className="h-full flex flex-col space-y-3 p-4 min-h-0 overflow-hidden">
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2 shrink-0">
        <div className="flex items-center gap-2">
          <Play className="w-3.5 h-3.5 text-neutral-400" />
          <h3 className="font-sans text-[11px] font-semibold uppercase tracking-wider text-white">
            Match Play Timeline
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-neutral-400 tabular-nums">Events: {turnEvents.length}</span>
          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 border uppercase tracking-wider ${
            result === 'win' ? 'bg-[#4A7856]/20 text-[#76A382] border-[#4A7856]/40' : 'bg-[#B8503A]/20 text-[#D57C69] border-[#B8503A]/40'
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
            <p className="text-xs font-bold font-sans uppercase tracking-wide text-white">
              Detailed Turn Timeline Unavailable
            </p>
            <p className="text-[11px] font-sans text-neutral-400 max-w-sm mx-auto">
              This is a historical match. Live turn-stamped event logging is enabled for all new live matches going forward.
            </p>
          </div>
        ) : (
          <>
            {/* Opening Hand & Mulligans Phase (Turn 0) */}
            {(openingEvents.first.length > 0 || openingEvents.second.length > 0) && (
              <div className="space-y-1.5">
                <div className="text-[9.5px] font-mono uppercase font-bold tracking-wider text-amber-300/90 px-3 py-1 bg-amber-500/10 border-y border-amber-500/30 flex items-center justify-between">
                  <span>Opening Phase · Turn 0</span>
                  <span className="text-[9px] font-mono font-normal opacity-70">
                    Mulligans & Opening Hands
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Left Column Opening Hand (First Player) */}
                  <div className="space-y-1">
                    {openingEvents.first.length === 0 ? (
                      <div className="text-[11px] font-sans text-neutral-500/70 italic px-2.5 py-1">
                        No actions
                      </div>
                    ) : (
                      openingEvents.first.map((ev) => renderEventRow(ev, true))
                    )}
                  </div>

                  {/* Right Column Opening Hand (Second Player) */}
                  <div className="space-y-1">
                    {openingEvents.second.length === 0 ? (
                      <div className="text-[11px] font-sans text-neutral-500/70 italic px-2.5 py-1">
                        No actions
                      </div>
                    ) : (
                      openingEvents.second.map((ev) => renderEventRow(ev, false))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* In-Game Rounds (Turn >= 1) */}
            {Object.entries(eventsByRound).map(([roundStr, cols]) => {
              const roundNum = parseInt(roundStr, 10);
              if (cols.first.length === 0 && cols.second.length === 0) return null;

              return (
                <div key={roundNum} className="space-y-1.5">
                  {/* Round Header Bar */}
                  <div className="text-[10px] font-mono uppercase font-bold tracking-wider text-neutral-200 px-3 py-1 bg-white/[0.03] border-y border-white/10 flex items-center justify-between">
                    <span className="text-amber-400 font-bold flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                      ROUND {roundNum}
                    </span>
                    <div className="flex items-center gap-2 font-mono text-[9px] tracking-widest">
                      <span className={`${leftColor} font-bold`}>
                        TURN {cols.firstTurn} ({goingFirst ? 'YOU' : (opponentName || 'OPPONENT')})
                      </span>
                      <span className="text-neutral-600">|</span>
                      <span className={`${rightColor} font-bold`}>
                        TURN {cols.secondTurn} ({goingFirst ? (opponentName || 'OPPONENT') : 'YOU'})
                      </span>
                    </div>
                  </div>

                  {/* Two-Column Action Grid for the Round */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* Left Column (First Player: Turn 1, 3, 5...) */}
                    <div className="space-y-1">
                      {cols.first.length > 0 ? (
                        cols.first.map((ev) => renderEventRow(ev, true))
                      ) : (
                        <div className="text-[11px] font-sans text-neutral-500/70 italic px-2.5 py-1">
                          No actions recorded
                        </div>
                      )}
                    </div>

                    {/* Right Column (Second Player: Turn 2, 4, 6...) */}
                    <div className="space-y-1">
                      {cols.second.length > 0 ? (
                        cols.second.map((ev) => renderEventRow(ev, false))
                      ) : (
                        <div className="text-[11px] font-sans text-neutral-500/70 italic px-2.5 py-1">
                          No actions recorded
                        </div>
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
            <div className="p-2.5 border border-[#4A7856]/40 bg-[#4A7856]/15 text-[#76A382] flex items-center justify-center gap-2 text-xs font-bold tracking-widest font-mono uppercase">
              <CheckCircle2 className="w-4 h-4 text-[#76A382]" /> MATCH ENDED — VICTORY
            </div>
          ) : (
            <div className="p-2.5 border border-[#B8503A]/40 bg-[#B8503A]/15 text-[#D57C69] flex items-center justify-center gap-2 text-xs font-bold tracking-widest font-mono uppercase">
              <XCircle className="w-4 h-4 text-[#D57C69]" /> MATCH ENDED — DEFEAT
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MatchTimeline;
