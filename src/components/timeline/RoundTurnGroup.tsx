import React from 'react';
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { TimelineAction, getRoundHighlight } from './roundHighlightUtils';
import { TurnActionRow } from './TurnActionRow';
import { cleanCardName } from '../../utils/cardImageCache';

interface RoundTurnGroupProps {
  roundNum: number;
  firstTurnNum: number;
  secondTurnNum: number;
  firstTurnEvents: TimelineAction[];
  secondTurnEvents: TimelineAction[];
  firstPlayerIsHero: boolean;
  opponentName?: string;
  isRoundCollapsed: boolean;
  onToggleRound: () => void;
  collapsedTurns: Set<number>;
  onToggleTurn: (turnNum: number) => void;
  density?: 'compact' | 'detailed';
  searchTerm?: string;
  onCardClick?: (card: any, turn: number) => void;
}

export const RoundTurnGroup: React.FC<RoundTurnGroupProps> = ({
  roundNum,
  firstTurnNum,
  secondTurnNum,
  firstTurnEvents,
  secondTurnEvents,
  firstPlayerIsHero,
  opponentName = 'Opponent',
  isRoundCollapsed,
  onToggleRound,
  collapsedTurns,
  onToggleTurn,
  density = 'detailed',
  searchTerm = '',
  onCardClick,
}) => {
  // Odd turns are First Player, Even turns are Second Player
  const firstTurnOwnerIsHero = firstPlayerIsHero;
  const secondTurnOwnerIsHero = !firstPlayerIsHero;

  const allRoundEvents = React.useMemo(
    () => [...firstTurnEvents, ...secondTurnEvents],
    [firstTurnEvents, secondTurnEvents]
  );

  const totalActions = allRoundEvents.length;

  // Compute highlight action for the round
  const { highlight } = React.useMemo(() => {
    return getRoundHighlight(allRoundEvents, firstPlayerIsHero);
  }, [allRoundEvents, firstPlayerIsHero]);

  const isFirstTurnCollapsed = collapsedTurns.has(firstTurnNum);
  const isSecondTurnCollapsed = collapsedTurns.has(secondTurnNum);

  // Render Highlight preview when round is collapsed
  const renderHighlightPreview = () => {
    if (!highlight) {
      return null;
    }

    const isHero = Boolean(highlight.is_player);
    const turn = highlight.turn_number || highlight.turn || 1;
    const isOdd = turn % 2 !== 0;
    const isOwnerHero = isOdd ? firstPlayerIsHero : !firstPlayerIsHero;
    const isOutOfTurn = isHero !== isOwnerHero;
    const cleanName = cleanCardName(highlight.name || '');

    // Format highlight summary
    let actionDesc = cleanName;
    const evType = (highlight.event_type || highlight.type || '').toLowerCase();
    if (evType.startsWith('damage')) {
      let dmg = highlight.amount || 0;
      if (dmg === 0 && highlight.event_type?.startsWith('damage:')) {
        const parts = highlight.event_type.split(':');
        dmg = parseInt(parts[2] || parts[1] || '0', 10);
      }
      actionDesc = `${dmg} DMG ${cleanName}${highlight.target_name ? ` → ${highlight.target_name}` : ''}`;
    }

    return (
      <div className="flex items-center gap-2 overflow-hidden">
        <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-amber-400/80 flex items-center gap-1 shrink-0">
          <Sparkles className="w-2.5 h-2.5 text-amber-400" />
          HIGHLIGHT:
        </span>
        <div
          className={`flex items-center gap-1.5 px-2 py-0.5 border text-xs truncate max-w-md ${
            isHero
              ? 'bg-[#4A7856]/20 text-[#76A382] border-[#4A7856]/40'
              : 'bg-[#B8503A]/20 text-[#D57C69] border-[#B8503A]/40'
          }`}
        >
          {isOutOfTurn && (
            <i className="ms ms-instant text-[11px] text-sky-400 shrink-0" title="Cast at instant speed / Flash" />
          )}
          <span className="font-mono text-[9px] font-bold uppercase shrink-0">
            [{isHero ? 'You' : opponentName}]
          </span>
          <span className="truncate font-sans font-medium text-neutral-200">{actionDesc}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="border-b border-white/10 pb-1">
      {/* Outer Round Banner (Clean full-width divider) */}
      <div
        className="flex items-center justify-between px-3 py-1.5 bg-white/[0.04] hover:bg-white/[0.07] border-y border-white/10 cursor-pointer transition-colors select-none"
        onClick={onToggleRound}
      >
        <div className="flex items-center gap-2">
          {isRoundCollapsed ? (
            <ChevronRight className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          )}
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]" />
          <span className="font-mono text-xs font-bold text-white tracking-wider uppercase">
            ROUND {roundNum}
          </span>
          <span className="text-[10px] font-mono text-neutral-400">
            (Turn {firstTurnNum} & {secondTurnNum})
          </span>
        </div>

        {/* Highlight action displayed ONLY when round is collapsed */}
        <div className="flex items-center gap-3">
          {isRoundCollapsed ? (
            renderHighlightPreview()
          ) : (
            <span className="text-[10px] font-mono text-neutral-400">
              {totalActions} {totalActions === 1 ? 'action' : 'actions'}
            </span>
          )}
        </div>
      </div>

      {/* Expanded Round Content: Distinctive Turn Sections with Left Accent Bars */}
      {!isRoundCollapsed && (
        <div className="pt-2 pb-1 space-y-3">
          {/* Turn 1 Section */}
          <div className="space-y-0.5">
            {/* Turn 1 Header with Left Accent Line */}
            <div
              className={`flex items-center justify-between py-1.5 px-3 bg-white/[0.02] hover:bg-white/[0.04] cursor-pointer select-none border-l-2 ${
                firstTurnOwnerIsHero ? 'border-[#76A382]' : 'border-[#D57C69]'
              }`}
              onClick={() => onToggleTurn(firstTurnNum)}
            >
              <div className="flex items-center gap-2">
                {isFirstTurnCollapsed ? (
                  <ChevronRight className="w-3 h-3 text-neutral-400" />
                ) : (
                  <ChevronDown className="w-3 h-3 text-neutral-400" />
                )}
                <span
                  className={`text-[11px] font-mono font-bold tracking-wider uppercase ${
                    firstTurnOwnerIsHero ? 'text-[#76A382]' : 'text-[#D57C69]'
                  }`}
                >
                  TURN {firstTurnNum} · {firstTurnOwnerIsHero ? 'YOUR TURN' : `${opponentName.toUpperCase()}'S TURN`}
                </span>
              </div>
              <span className="text-[9.5px] font-mono text-neutral-500 tabular-nums">
                {firstTurnEvents.length} {firstTurnEvents.length === 1 ? 'action' : 'actions'}
              </span>
            </div>

            {/* Turn 1 Actions (Unboxed, floating on surface) */}
            {!isFirstTurnCollapsed && (
              <div className="space-y-0 pt-0.5 pb-1">
                {firstTurnEvents.length === 0 ? (
                  <div className="text-[11px] font-sans italic text-neutral-500 py-1.5 px-4">
                    No actions recorded
                  </div>
                ) : (
                  firstTurnEvents.map((ev, idx) => (
                    <TurnActionRow
                      key={`t-${firstTurnNum}-${idx}`}
                      action={ev}
                      isTurnActivePlayer={firstTurnOwnerIsHero}
                      density={density}
                      opponentName={opponentName}
                      onCardClick={onCardClick}
                      searchTerm={searchTerm}
                    />
                  ))
                )}
              </div>
            )}
          </div>

          {/* Turn 2 Section */}
          <div className="space-y-0.5">
            {/* Turn 2 Header with Left Accent Line */}
            <div
              className={`flex items-center justify-between py-1.5 px-3 bg-white/[0.02] hover:bg-white/[0.04] cursor-pointer select-none border-l-2 ${
                secondTurnOwnerIsHero ? 'border-[#76A382]' : 'border-[#D57C69]'
              }`}
              onClick={() => onToggleTurn(secondTurnNum)}
            >
              <div className="flex items-center gap-2">
                {isSecondTurnCollapsed ? (
                  <ChevronRight className="w-3 h-3 text-neutral-400" />
                ) : (
                  <ChevronDown className="w-3 h-3 text-neutral-400" />
                )}
                <span
                  className={`text-[11px] font-mono font-bold tracking-wider uppercase ${
                    secondTurnOwnerIsHero ? 'text-[#76A382]' : 'text-[#D57C69]'
                  }`}
                >
                  TURN {secondTurnNum} · {secondTurnOwnerIsHero ? 'YOUR TURN' : `${opponentName.toUpperCase()}'S TURN`}
                </span>
              </div>
              <span className="text-[9.5px] font-mono text-neutral-500 tabular-nums">
                {secondTurnEvents.length} {secondTurnEvents.length === 1 ? 'action' : 'actions'}
              </span>
            </div>

            {/* Turn 2 Actions (Unboxed, floating on surface) */}
            {!isSecondTurnCollapsed && (
              <div className="space-y-0 pt-0.5 pb-1">
                {secondTurnEvents.length === 0 ? (
                  <div className="text-[11px] font-sans italic text-neutral-500 py-1.5 px-4">
                    No actions recorded
                  </div>
                ) : (
                  secondTurnEvents.map((ev, idx) => (
                    <TurnActionRow
                      key={`t-${secondTurnNum}-${idx}`}
                      action={ev}
                      isTurnActivePlayer={secondTurnOwnerIsHero}
                      density={density}
                      opponentName={opponentName}
                      onCardClick={onCardClick}
                      searchTerm={searchTerm}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
