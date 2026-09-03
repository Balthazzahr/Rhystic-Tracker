import React from 'react';
import { TimelineAction } from './roundHighlightUtils';
import { cleanCardName } from '../../utils/cardImageCache';

interface TurnActionRowProps {
  action: TimelineAction;
  isTurnActivePlayer: boolean;
  density?: 'compact' | 'detailed';
  opponentName?: string;
  onCardClick?: (card: any, turn: number) => void;
  searchTerm?: string;
}

const CARD_TYPE_CONFIG: Record<string, { icon: string; color: string }> = {
  Creature: { icon: 'ms-creature', color: '#76A382' },
  Instant: { icon: 'ms-instant', color: '#D57C69' },
  Sorcery: { icon: 'ms-sorcery', color: '#E5A96A' },
  Artifact: { icon: 'ms-artifact', color: '#94A3B8' },
  Enchantment: { icon: 'ms-enchantment', color: '#A855F7' },
  Planeswalker: { icon: 'ms-planeswalker', color: '#F97316' },
  Battle: { icon: 'ms-battle', color: '#F43F5E' },
  Land: { icon: 'ms-land', color: '#C89B5F' },
};

export const TurnActionRow: React.FC<TurnActionRowProps> = ({
  action,
  isTurnActivePlayer,
  density = 'detailed',
  opponentName = 'Opponent',
  onCardClick,
  searchTerm = '',
}) => {
  const isPlayer = Boolean(action.is_player);
  const isOutOfTurn = isPlayer !== isTurnActivePlayer;

  const evType = (action.event_type || action.type || 'play').toLowerCase();
  let rawName = action.source_name || action.name || 'Unknown Action';
  if (evType.startsWith('life')) {
    if (rawName.startsWith('Life Total:')) {
      rawName = action.source_name || 'Life Total Change';
    } else if (rawName.includes('→')) {
      const m = rawName.match(/\(([^)]+)\)$/);
      if (m && !m[1].match(/^[+-]?\d+$/)) {
        rawName = m[1];
      } else {
        rawName = action.source_name || 'Life Total Change';
      }
    }
  }
  const displayName = cleanCardName(rawName);

  const cleanQuery = searchTerm.trim().toLowerCase();
  const isMatch = Boolean(cleanQuery && displayName.toLowerCase().includes(cleanQuery));
  const isDeemphasized = Boolean(cleanQuery && !isMatch);

  // Parse damage amount & target if damage event
  let damageAmount = action.amount || 0;
  let targetName = (action.target_name || '').trim();
  if (evType.startsWith('damage')) {
    if (damageAmount === 0 && action.event_type?.startsWith('damage:')) {
      const parts = action.event_type.split(':');
      if (parts.length >= 4) {
        damageAmount = parseInt(parts[2] || '0', 10);
      } else {
        damageAmount = parseInt(parts[2] || parts[1] || '0', 10);
      }
    }
  }

  // Parse life delta if life event
  let lifeDelta = 0;
  let lifeTotal = '';
  if (evType.startsWith('life')) {
    if (action.delta !== undefined && action.delta !== 0) {
      lifeDelta = action.delta;
    } else if (action.amount !== undefined && action.amount !== 0) {
      lifeDelta = action.amount;
    } else if (action.event_type?.startsWith('life:')) {
      const parts = action.event_type.split(':');
      lifeDelta = parseInt(parts[1] || '0', 10);
      lifeTotal = parts[2] || '';
    }
    // Also parse from displayName if needed (e.g. "25 → 24 (-1) (Talisman of Indulgence)")
    if (lifeDelta === 0) {
      const m = displayName.match(/\(([+-]?\d+)\)/);
      if (m) {
        lifeDelta = parseInt(m[1], 10);
      }
    }
  }

  // Card Type Badge (Icon with instantaneous CSS tooltip)
  const renderCardTypeBadge = () => {
    if (!action.card_type) return null;
    const match = Object.entries(CARD_TYPE_CONFIG).find(([k]) =>
      action.card_type!.toLowerCase().includes(k.toLowerCase())
    );
    if (!match) return null;
    const [, info] = match;
    return (
      <div className="relative group/type flex items-center justify-center shrink-0">
        <span className="inline-flex items-center justify-center p-1 border shrink-0 border-white/10 bg-white/[0.03] text-neutral-300 rounded hover:bg-white/[0.08] transition-colors cursor-help">
          <i className={`ms ${info.icon} text-[11px] leading-none`} style={{ color: info.color }} />
        </span>
        <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover/type:flex items-center px-1.5 py-0.5 bg-neutral-900 border border-white/20 text-[10px] font-sans font-medium text-neutral-200 shadow-xl pointer-events-none whitespace-nowrap z-50 rounded">
          {action.card_type}
        </div>
      </div>
    );
  };

  // Action Badge Pill
  const renderActionBadge = () => {
    if (evType.startsWith('life')) {
      const isPositive = lifeDelta > 0;
      return (
        <span
          className={`px-1.5 py-0.5 border text-[9.5px] font-mono font-bold uppercase shrink-0 tabular-nums ${
            isPositive
              ? 'bg-[#4A7856]/20 text-[#76A382] border-[#4A7856]/40'
              : 'bg-[#B8503A]/20 text-[#D57C69] border-[#B8503A]/40'
          }`}
        >
          {isPositive ? `+${lifeDelta}` : lifeDelta} LIFE
        </span>
      );
    }
    if (evType === 'dies') {
      const cardTypeLower = (action.card_type || '').toLowerCase();
      const isCreature = cardTypeLower.includes('creature');
      const isNonCreatureToken =
        !isCreature &&
        (cardTypeLower.includes('token') ||
          ['treasure', 'food', 'clue', 'blood', 'map', 'powerstone', 'incubator', 'gold'].some((t) =>
            displayName.toLowerCase().includes(t)
          ));
      if (isNonCreatureToken) {
        return (
          <span className="px-1.5 py-0.5 border text-[9.5px] font-mono font-bold uppercase bg-amber-950/30 text-amber-300 border-amber-500/40 shrink-0">
            USED
          </span>
        );
      }
      return (
        <span className="px-1.5 py-0.5 border text-[9.5px] font-mono font-bold uppercase bg-[#B8503A]/20 text-[#D57C69] border-[#B8503A]/30 shrink-0">
          DIES
        </span>
      );
    }
    if (evType === 'token') {
      return (
        <span className="px-1.5 py-0.5 border text-[9.5px] font-mono font-bold uppercase bg-purple-950/30 text-purple-300 border-purple-500/30 shrink-0">
          TOKEN{action.count && action.count > 1 ? ` x${action.count}` : ''}
        </span>
      );
    }
    if (evType === 'draw') {
      return (
        <span className="px-1.5 py-0.5 border text-[9.5px] font-mono font-bold uppercase bg-sky-950/30 text-sky-300 border-sky-500/30 shrink-0">
          DRAW
        </span>
      );
    }
    if (evType.startsWith('counter')) {
      const parts = (action.event_type || action.type || '').split(':');
      let counterLabel = 'COUNTER';
      if (parts.length >= 3) {
        const kind = parts[1];
        const amt = parseInt(parts[2] || '0', 10);
        if (kind === '+1/+1') {
          counterLabel = amt >= 0 ? `+${amt}/+${amt}` : `${amt}/${amt}`;
        } else {
          counterLabel = amt >= 0 ? `+${amt} ${kind}` : `${amt} ${kind}`;
        }
      }
      return (
        <span className="px-1.5 py-0.5 border text-[9.5px] font-mono font-bold uppercase bg-amber-950/30 text-amber-300 border-amber-500/30 shrink-0">
          {counterLabel}
        </span>
      );
    }
    if (evType === 'exile') {
      return (
        <span className="px-1.5 py-0.5 border text-[9.5px] font-mono font-bold uppercase bg-amber-900/30 text-amber-400 border-amber-500/30 shrink-0">
          EXILE
        </span>
      );
    }
    if (evType === 'mulligan') {
      return (
        <span className="px-1.5 py-0.5 border text-[9.5px] font-mono font-bold uppercase bg-purple-950/30 text-purple-300 border-purple-500/30 shrink-0">
          MULLIGAN
        </span>
      );
    }
    if (evType === 'bottom') {
      return (
        <span className="px-1.5 py-0.5 border text-[9.5px] font-mono font-bold uppercase bg-blue-950/30 text-blue-300 border-blue-500/30 shrink-0">
          BOTTOM
        </span>
      );
    }
    if (evType.startsWith('mill')) {
      let count = 1;
      const parts = (action.event_type || action.type || '').split(':');
      if (parts.length >= 2) {
        count = parseInt(parts[1] || '1', 10);
      }
      return (
        <span className="px-1.5 py-0.5 border text-[9.5px] font-mono font-bold uppercase bg-indigo-950/30 text-indigo-300 border-indigo-500/30 shrink-0">
          MILL {count}
        </span>
      );
    }
    if (evType === 'blink' || evType === 'return') {
      return (
        <span className="px-1.5 py-0.5 border text-[9.5px] font-mono font-bold uppercase bg-cyan-950/30 text-cyan-300 border-cyan-500/30 shrink-0">
          BLINK
        </span>
      );
    }
    // Default: play / cast
    return (
      <span
        className={`px-1.5 py-0.5 border text-[9.5px] font-mono font-bold uppercase shrink-0 ${
          isPlayer
            ? 'bg-[#4A7856]/20 text-[#76A382] border-[#4A7856]/40'
            : 'bg-[#B8503A]/20 text-[#D57C69] border-[#B8503A]/40'
        }`}
      >
        PLAY
      </span>
    );
  };

  const cardPayload = {
    grp_id: action.grp_id || 0,
    is_opponent: !isPlayer,
    count: 1,
    name: displayName,
    mana_cost: action.mana_cost,
    card_type: action.card_type,
  };

  const handleCardClick = (e: React.MouseEvent) => {
    if (onCardClick && action.grp_id) {
      e.stopPropagation();
      onCardClick(cardPayload, action.turn_number || action.turn || 1);
    }
  };

  // =========================================================================
  // 1. COMBAT & TARGETED DAMAGE ACTIONS (PERFECTLY ALIGNED 3-ZONE GRID)
  // =========================================================================
  const isTargetHero =
    targetName === 'You' ||
    targetName.toLowerCase() === 'you' ||
    targetName.toLowerCase().includes('player');

  const isTargetOpponent =
    targetName === opponentName ||
    targetName.toLowerCase().includes('opponent');

  const isSelfDamage = (isPlayer && isTargetHero) || (!isPlayer && isTargetOpponent);

  if (evType.startsWith('damage') && !isSelfDamage) {
    const isTargetPlayer = isTargetHero || isTargetOpponent;

    const lifeChangeStr =
      action.oppLifeAfter !== undefined
        ? `❤️ -${damageAmount} → ${action.oppLifeAfter}`
        : `❤️ -${damageAmount}`;

    const heroLifeChangeStr =
      action.heroLifeAfter !== undefined
        ? `❤️ -${damageAmount} → ${action.heroLifeAfter}`
        : `❤️ -${damageAmount}`;

    const arrowColorClass = isPlayer ? 'bg-[#76A382]' : 'bg-red-500';
    const arrowheadColorClass = isPlayer ? 'text-[#76A382]' : 'text-red-500';

    return (
      <div
        className={`w-full py-1.5 px-3 border-b border-white/[0.03] transition-colors flex items-center justify-center ${
          isDeemphasized ? 'opacity-30' : ''
        } ${isMatch ? 'bg-amber-950/20' : 'hover:bg-white/[0.02]'}`}
      >
        <div className="flex items-center justify-center min-w-0">
          {/* ZONE 1: OPPONENT SIDE (Left zone, fixed width w-[280px] sm:w-[320px], right-aligned to touch arrow) */}
          <div className="w-[280px] sm:w-[320px] shrink-0 flex items-center justify-end gap-2 pr-2 min-w-0">
            {isPlayer ? (
              // Hero attacked Opponent
              isTargetPlayer ? (
                // Target is Opponent Player -> [Life Change] DeathNDespair (Opponent)
                <>
                  <span className="text-[10px] font-mono px-2 py-0.5 bg-[#B8503A]/20 text-[#D57C69] border border-[#B8503A]/30 tabular-nums shrink-0 font-medium">
                    {lifeChangeStr}
                  </span>
                  <span className="text-xs font-sans font-bold text-[#D57C69] truncate">
                    {opponentName} (Opponent)
                  </span>
                </>
              ) : (
                // Target is Opponent's Creature (e.g. Diversion Unit defending)
                <>
                  <span className="text-xs font-sans font-bold text-[#D57C69] truncate">
                    {targetName}
                  </span>
                  <span className="text-[10px] font-sans text-neutral-400 shrink-0">(Creature)</span>
                </>
              )
            ) : (
              // Opponent attacked Hero (e.g. Diversion Unit attacking)
              <>
                <span
                  onClick={handleCardClick}
                  className={`text-xs font-sans font-semibold text-neutral-100 hover:text-[#D57C69] truncate ${
                    action.grp_id ? 'hover:underline cursor-pointer' : ''
                  }`}
                  title={displayName}
                >
                  {displayName}
                </span>
                {renderCardTypeBadge()}
                {isOutOfTurn && (
                  <span className="inline-flex items-center justify-center shrink-0" title="Cast at instant speed / Flash">
                    <i className="ms ms-instant text-[12px] text-sky-400 leading-none" />
                  </span>
                )}
              </>
            )}
          </div>

          {/* ZONE 2: COMBAT VECTOR ARROW (20% shorter: w-28 sm:w-36 with absolute centered damage box) */}
          <div className="w-28 sm:w-36 shrink-0 h-6 flex items-center justify-center relative select-none mx-2">
            {/* The continuous line across the entire width */}
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">
              {isPlayer && <span className={`${arrowheadColorClass} text-xs leading-none shrink-0 font-bold -mr-0.5`}>◀</span>}
              <div className={`flex-1 h-[1.5px] ${arrowColorClass}`} />
              {!isPlayer && <span className={`${arrowheadColorClass} text-xs leading-none shrink-0 font-bold -ml-0.5`}>▶</span>}
            </div>

            {/* The damage number box in the exact dead center of Zone 2 */}
            <span className="relative z-10 px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase bg-neutral-900 border border-red-500/50 text-red-400 shrink-0 tabular-nums">
              {damageAmount} DMG
            </span>
          </div>

          {/* ZONE 3: HERO SIDE (Right zone, fixed width w-[280px] sm:w-[320px], left-aligned starting from the arrow) */}
          <div className="w-[280px] sm:w-[320px] shrink-0 flex items-center justify-start gap-2 pl-2 min-w-0">
            {isPlayer ? (
              // Hero is the attacker (e.g. Stoic Sphinx, Lord of the Eagles)
              <>
                <span
                  onClick={handleCardClick}
                  className={`text-xs font-sans font-semibold text-neutral-100 hover:text-[#76A382] truncate ${
                    action.grp_id ? 'hover:underline cursor-pointer' : ''
                  }`}
                  title={displayName}
                >
                  {displayName}
                </span>
                {renderCardTypeBadge()}
                {isOutOfTurn && (
                  <span className="inline-flex items-center justify-center shrink-0" title="Cast at instant speed / Flash">
                    <i className="ms ms-instant text-[12px] text-sky-400 leading-none" />
                  </span>
                )}
              </>
            ) : (
              // Opponent attacked Hero -> Target is Hero or Hero's Creature
              isTargetPlayer ? (
                <>
                  <span className="text-xs font-sans font-bold text-[#76A382] truncate">
                    You
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 bg-[#4A7856]/20 text-[#76A382] border border-[#4A7856]/30 tabular-nums shrink-0 font-medium">
                    {heroLifeChangeStr}
                  </span>
                </>
              ) : (
                // Target is Hero's Creature (e.g. The Lord of the Eagles defending)
                <>
                  <span className="text-xs font-sans font-bold text-[#76A382] truncate">
                    {targetName}
                  </span>
                  <span className="text-[10px] font-sans text-neutral-400 shrink-0">(Creature)</span>
                </>
              )
            )}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // 2. STANDARD NON-DAMAGING & DIES ACTIONS (SYMMETRICALLY MIRRORED)
  // =========================================================================
  if (isPlayer) {
    // HERO SIDE (Right): Symmetrically mirrored -> [Type] [Life] [Target] [Name] [⚡] [ACTION BADGE]
    return (
      <div
        className={`w-full flex justify-end py-1 px-3 border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors ${
          isDeemphasized ? 'opacity-30' : ''
        }`}
      >
        <div
          className={`flex items-center gap-1.5 sm:gap-2 max-w-[92%] sm:max-w-[85%] justify-end ${
            isMatch ? 'bg-amber-950/20 px-1.5 py-0.5 rounded' : ''
          }`}
        >
          {/* Card Type Badge (Creature, Instant, etc.) */}
          {renderCardTypeBadge()}

          {/* Life total if life event */}
          {lifeTotal && (
            <span className="text-[10px] font-mono text-neutral-400 shrink-0">
              ({lifeTotal})
            </span>
          )}

          {/* Target name if ability target */}
          {targetName && (
            <span className="text-[11px] font-sans text-neutral-400 shrink-0 flex items-center gap-1">
              <span className="text-neutral-600">→</span>
              <span className="text-neutral-300 font-medium truncate max-w-[140px]" title={targetName}>
                {targetName}
              </span>
            </span>
          )}

          {/* Card or Action Name */}
          <span
            className={`text-xs font-sans font-medium truncate ${
              action.grp_id ? 'hover:underline cursor-pointer' : ''
            } text-neutral-200 hover:text-[#76A382]`}
            onClick={handleCardClick}
            title={displayName}
          >
            {displayName}
          </span>

          {/* Out-of-turn Reaction Instant/Flash Indicator */}
          {isOutOfTurn && (
            <span
              className="inline-flex items-center justify-center shrink-0"
              title="Cast at instant speed / Flash"
            >
              <i className="ms ms-instant text-[12px] text-sky-400 leading-none" />
            </span>
          )}

          {/* Action Type Badge (PLAY, DRAW, DIES, etc.) anchored on far right */}
          {renderActionBadge()}
        </div>
      </div>
    );
  }

  // OPPONENT SIDE (Left): Standard flow -> [ACTION BADGE] [⚡] [Name] [Target] [Life] [Type]
  return (
    <div
      className={`w-full flex justify-start py-1 px-3 border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors ${
        isDeemphasized ? 'opacity-30' : ''
      }`}
    >
      <div
        className={`flex items-center gap-1.5 sm:gap-2 max-w-[92%] sm:max-w-[85%] ${
          isMatch ? 'bg-amber-950/20 px-1.5 py-0.5 rounded' : ''
        }`}
      >
        {/* Action Type Badge (PLAY, DRAW, DIES, etc.) anchored on far left */}
        {renderActionBadge()}

        {/* Out-of-turn Reaction Instant/Flash Indicator */}
        {isOutOfTurn && (
          <span
            className="inline-flex items-center justify-center shrink-0"
            title="Cast at instant speed / Flash"
          >
            <i className="ms ms-instant text-[12px] text-sky-400 leading-none" />
          </span>
        )}

        {/* Card or Action Name */}
        <span
          className={`text-xs font-sans font-medium truncate ${
            action.grp_id ? 'hover:underline cursor-pointer' : ''
          } text-neutral-200 hover:text-[#D57C69]`}
          onClick={handleCardClick}
          title={displayName}
        >
          {displayName}
        </span>

        {/* Target name if ability target */}
        {targetName && (
          <span className="text-[11px] font-sans text-neutral-400 shrink-0 flex items-center gap-1">
            <span className="text-neutral-600">→</span>
            <span className="text-neutral-300 font-medium truncate max-w-[140px]" title={targetName}>
              {targetName}
            </span>
          </span>
        )}

        {/* Life total if life event */}
        {lifeTotal && (
          <span className="text-[10px] font-mono text-neutral-400 shrink-0">
            ({lifeTotal})
          </span>
        )}

        {/* Card Type Badge (Creature, Instant, etc.) */}
        {renderCardTypeBadge()}
      </div>
    </div>
  );
};
