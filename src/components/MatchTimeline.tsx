import React, { useEffect, useState, useMemo } from 'react';
import { Play, AlertCircle, CheckCircle2, XCircle, ChevronsUpDown, ChevronDown, ChevronRight } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { CardItem } from './CardBreakdown';
import { TimelineAction, enrichActionsWithCombatContext } from './timeline/roundHighlightUtils';
import { TurnActionRow } from './timeline/TurnActionRow';
import { RoundTurnGroup } from './timeline/RoundTurnGroup';

interface MatchTimelineProps {
  matchId: string;
  turns: number;
  goingFirst: boolean;
  result: string;
  palette: any;
  cards: CardItem[];
  opponentName?: string;
  formatName?: string;
  onCardClick?: (card: CardItem, turn: number) => void;
  searchTerm?: string;
}

export function MatchTimeline({
  matchId,
  turns,
  goingFirst,
  result,
  cards,
  opponentName,
  formatName,
  onCardClick,
  searchTerm = '',
}: MatchTimelineProps) {
  const [turnEvents, setTurnEvents] = useState<TimelineAction[]>([]);
  const [heroSeatId, setHeroSeatId] = useState<number>(goingFirst ? 1 : 2);
  const [loading, setLoading] = useState<boolean>(true);

  // Two-tier collapsible state
  const [collapsedRounds, setCollapsedRounds] = useState<Set<number>>(new Set());
  const [collapsedTurns, setCollapsedTurns] = useState<Set<number>>(new Set());
  const [openingCollapsed, setOpeningCollapsed] = useState<boolean>(true);
  const [hasInitializedRounds, setHasInitializedRounds] = useState<boolean>(false);

  useEffect(() => {
    let isCancelled = false;
    const fetchEvents = async () => {
      setLoading(true);
      setHasInitializedRounds(false);
      try {
        const res = await invoke<any>('get_match_turn_events', { matchId });
        if (!isCancelled) {
          if (res && Array.isArray(res.events)) {
            setTurnEvents(res.events);
            setHeroSeatId(res.hero_seat_id || (goingFirst ? 1 : 2));
          } else if (Array.isArray(res)) {
            setTurnEvents(res);
          }
        }
      } catch (e) {
        if (!isCancelled) {
          console.error('Failed to fetch match turn events:', e);
          setTurnEvents([]);
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };
    fetchEvents();
    return () => {
      isCancelled = true;
    };
  }, [matchId, goingFirst]);

  // Group events by Opening Phase (Turn 0) and by Round (Turn >= 1)
  const { openingEvents, roundsData, totalRounds } = useMemo(() => {
    const enrichedEvents = enrichActionsWithCombatContext(turnEvents, formatName, opponentName);
    const opening: TimelineAction[] = [];
    const map: Record<number, { first: TimelineAction[]; second: TimelineAction[]; firstTurn: number; secondTurn: number }> = {};

    let maxRound = Math.ceil(Math.max(1, turns) / 2);

    for (const ev of enrichedEvents) {
      const turnNum = ev.turn_number !== undefined ? ev.turn_number : (ev.turn !== undefined ? ev.turn : 1);

      if (turnNum === 0) {
        opening.push(ev);
      } else {
        const round = Math.ceil(turnNum / 2);
        if (round > maxRound) maxRound = round;

        if (!map[round]) {
          map[round] = {
            first: [],
            second: [],
            firstTurn: round * 2 - 1,
            secondTurn: round * 2,
          };
        }

        if (turnNum % 2 !== 0) {
          map[round].first.push(ev);
        } else {
          map[round].second.push(ev);
        }
      }
    }

    const rounds = [];
    for (let r = 1; r <= maxRound; r++) {
      const entry = map[r] || {
        first: [],
        second: [],
        firstTurn: r * 2 - 1,
        secondTurn: r * 2,
      };
      rounds.push({ round: r, ...entry });
    }

    return { openingEvents: opening, roundsData: rounds, totalRounds: maxRound };
  }, [turnEvents, turns]);

  // Collapse all rounds by default on initial load of a match
  useEffect(() => {
    if (!loading && totalRounds > 0 && !hasInitializedRounds) {
      const allRounds = new Set<number>();
      for (let r = 1; r <= totalRounds; r++) {
        allRounds.add(r);
      }
      setCollapsedRounds(allRounds);
      setOpeningCollapsed(true);
      setHasInitializedRounds(true);
    }
  }, [loading, totalRounds, hasInitializedRounds]);

  const toggleRound = (roundNum: number) => {
    setCollapsedRounds((prev) => {
      const next = new Set(prev);
      if (next.has(roundNum)) {
        next.delete(roundNum);
      } else {
        next.add(roundNum);
      }
      return next;
    });
  };

  const toggleTurn = (turnNum: number) => {
    setCollapsedTurns((prev) => {
      const next = new Set(prev);
      if (next.has(turnNum)) {
        next.delete(turnNum);
      } else {
        next.add(turnNum);
      }
      return next;
    });
  };

  const areAllCollapsed = collapsedRounds.size >= totalRounds;

  const toggleAllRounds = () => {
    if (areAllCollapsed) {
      // Expand all
      setCollapsedRounds(new Set());
      setOpeningCollapsed(false);
    } else {
      // Collapse all
      const all = new Set<number>();
      for (let r = 1; r <= totalRounds; r++) {
        all.add(r);
      }
      setCollapsedRounds(all);
      setOpeningCollapsed(true);
    }
  };

  return (
    <div className="h-full flex flex-col space-y-3 p-4 min-h-0 overflow-hidden">
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2 shrink-0">
        <div className="flex items-center gap-2">
          <Play className="w-3.5 h-3.5 text-neutral-400" />
          <h3 className="font-sans text-[11px] font-semibold uppercase tracking-wider text-white">
            Match Play Timeline
          </h3>
          <span className="text-[10px] font-mono text-neutral-400 tabular-nums">
            ({totalRounds} {totalRounds === 1 ? 'Round' : 'Rounds'})
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Master Expand / Collapse Toggle */}
          {!loading && turnEvents.length > 0 && (
            <button
              onClick={toggleAllRounds}
              className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono font-bold uppercase rounded border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 hover:text-white transition-colors"
            >
              <ChevronsUpDown className="w-3 h-3 text-amber-400" />
              <span>{areAllCollapsed ? 'Expand All' : 'Collapse All'}</span>
            </button>
          )}

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-neutral-400 tabular-nums">
              Events: {turnEvents.length}
            </span>
            <span
              className={`text-[10px] font-mono font-bold px-2 py-0.5 border uppercase tracking-wider ${
                result === 'win'
                  ? 'bg-[#4A7856]/20 text-[#76A382] border-[#4A7856]/40'
                  : 'bg-[#B8503A]/20 text-[#D57C69] border-[#B8503A]/40'
              }`}
            >
              {result}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 custom-scrollbar min-h-0">
        {loading ? (
          <div className="p-8 text-center text-xs text-neutral-500 font-mono">
            Loading turn timeline...
          </div>
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
            {/* Opening Phase (Turn 0: Mulligans & Opening Hands) */}
            {openingEvents.length > 0 && (
              <div className="border-b border-white/10 pb-1">
                <div
                  className="flex items-center justify-between px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/15 border-y border-purple-500/20 cursor-pointer transition-colors select-none"
                  onClick={() => setOpeningCollapsed((prev) => !prev)}
                >
                  <div className="flex items-center gap-2">
                    {openingCollapsed ? (
                      <ChevronRight className="w-3.5 h-3.5 text-purple-300" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-purple-300" />
                    )}
                    <span className="font-mono text-xs font-bold text-purple-300 tracking-wider uppercase">
                      Opening Phase · Turn 0
                    </span>
                    <span className="text-[10px] font-mono text-purple-300/70">
                      (Mulligans & Opening Hands)
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-purple-300/80">
                    {openingEvents.length} {openingEvents.length === 1 ? 'action' : 'actions'}
                  </span>
                </div>

                {!openingCollapsed && (
                  <div className="pt-1 pb-1 space-y-0">
                    {openingEvents.map((ev, idx) => (
                      <TurnActionRow
                        key={`open-${idx}`}
                        action={ev}
                        isTurnActivePlayer={goingFirst}
                        density="detailed"
                        opponentName={opponentName}
                        onCardClick={onCardClick}
                        searchTerm={searchTerm}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* In-Game Rounds (Turn >= 1) — Collapsed by Default with Highlights */}
            {roundsData.map((r) => (
              <RoundTurnGroup
                key={`round-${r.round}`}
                roundNum={r.round}
                firstTurnNum={r.firstTurn}
                secondTurnNum={r.secondTurn}
                firstTurnEvents={r.first}
                secondTurnEvents={r.second}
                firstPlayerIsHero={goingFirst}
                opponentName={opponentName}
                isRoundCollapsed={collapsedRounds.has(r.round)}
                onToggleRound={() => toggleRound(r.round)}
                collapsedTurns={collapsedTurns}
                onToggleTurn={toggleTurn}
                density="detailed"
                searchTerm={searchTerm}
                onCardClick={onCardClick}
              />
            ))}
          </>
        )}

        {/* Final Match Outcome Marker at Bottom of Sequence */}
        {!loading && turnEvents.length > 0 && (
          <div className="pt-2">
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
        )}
      </div>
    </div>
  );
}

export default MatchTimeline;
