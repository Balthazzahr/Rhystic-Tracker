import React, { useState, useMemo } from 'react';
import { Clock, Swords, Activity, Sparkles, Search, X } from 'lucide-react';
import { ManaPip } from './ManaPip';
import CardImage from './CardImage';
import logoImg from '../assets/RhysticTrackerLogo.svg';
import symbolIcon from '../assets/RhysticTrackerICON.svg';

interface LiveHUDViewProps {
  palette?: any;
  liveMatchState?: any;
  onShowCard?: (card: { name: string; grp_id?: number }, isCommander?: boolean) => void;
  formatChipColor?: (format?: string) => { text: string; bg: string; border: string };
}

function formatMatchDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const LiveHUDView: React.FC<LiveHUDViewProps> = ({
  palette,
  liveMatchState,
  onShowCard,
  formatChipColor,
}) => {
  const accentColor = palette?.accent || '#A855F7';

  // Search input state
  const [search, setSearch] = useState<string>('');

  const isMatchActive = !!liveMatchState && liveMatchState.status === 'IN_MATCH';

  // Determine who went first: true if Hero went first, false if Opponent went first
  const firstPlayerIsHero = liveMatchState?.going_first !== false;

  // Filter events based on search query
  const query = search.trim().toLowerCase();

  const filterEvent = (e: any) => {
    if (!query) return true;
    const nameMatch = e.name?.toLowerCase().includes(query);
    const typeMatch = e.card_type?.toLowerCase().includes(query);
    const targetMatch = e.target_name?.toLowerCase().includes(query);
    const actionMatch = e.type?.toLowerCase().includes(query);
    return nameMatch || typeMatch || targetMatch || actionMatch;
  };

  // Group events by Round & Turn
  const { roundsList, openingEvents } = useMemo(() => {
    const rawEvents = liveMatchState?.recent_events || [];
    const opening: { first: any[]; second: any[] } = { first: [], second: [] };
    const roundsMap: Record<number, { first: any[]; second: any[]; firstTurn: number; secondTurn: number }> = {};

    let maxRound = 1;

    for (const ev of rawEvents) {
      const turn = ev.turn !== undefined ? ev.turn : 1;
      const isHero = ev.is_player;
      const isFirst = firstPlayerIsHero ? isHero : !isHero;

      if (turn === 0) {
        if (filterEvent(ev)) {
          (isFirst ? opening.first : opening.second).push(ev);
        }
      } else {
        const roundNum = Math.ceil(turn / 2);
        if (roundNum > maxRound) maxRound = roundNum;
        if (!roundsMap[roundNum]) {
          roundsMap[roundNum] = {
            first: [],
            second: [],
            firstTurn: roundNum * 2 - 1,
            secondTurn: roundNum * 2,
          };
        }
        if (filterEvent(ev)) {
          (isFirst ? roundsMap[roundNum].first : roundsMap[roundNum].second).push(ev);
        }
      }
    }

    const currentRound = liveMatchState?.round || Math.ceil((liveMatchState?.turn || 1) / 2) || maxRound;
    const totalRounds = Math.max(maxRound, currentRound);

    const rounds = [];
    for (let r = 1; r <= totalRounds; r++) {
      const entry = roundsMap[r] || {
        first: [],
        second: [],
        firstTurn: r * 2 - 1,
        secondTurn: r * 2,
      };
      rounds.push({ round: r, ...entry });
    }

    return { roundsList: rounds, openingEvents: opening };
  }, [liveMatchState?.recent_events, liveMatchState?.turn, liveMatchState?.round, firstPlayerIsHero, query]);

  // Determine latest life change delta in current turn for Player and Opponent
  const currentTurn = liveMatchState?.turn || 1;
  const rawEvents = liveMatchState?.recent_events || [];

  const playerRecentLifeDelta = useMemo(() => {
    const lifeEvs = rawEvents.filter(
      (e: any) => e.is_player && (e.type === 'life' || e.type === 'damage') && (e.turn === currentTurn || e.turn === currentTurn - 1)
    );
    if (lifeEvs.length === 0) return null;
    const latest = lifeEvs[lifeEvs.length - 1];
    if (latest.type === 'life' && latest.delta !== undefined) return latest.delta;
    if (latest.type === 'damage' && latest.amount !== undefined) return -latest.amount;
    return null;
  }, [rawEvents, currentTurn]);

  const opponentRecentLifeDelta = useMemo(() => {
    const lifeEvs = rawEvents.filter(
      (e: any) => !e.is_player && (e.type === 'life' || e.type === 'damage') && (e.turn === currentTurn || e.turn === currentTurn - 1)
    );
    if (lifeEvs.length === 0) return null;
    const latest = lifeEvs[lifeEvs.length - 1];
    if (latest.type === 'life' && latest.delta !== undefined) return latest.delta;
    if (latest.type === 'damage' && latest.amount !== undefined) return -latest.amount;
    return null;
  }, [rawEvents, currentTurn]);

  // Last 3 Actions for bottom ticker
  const lastThreeActions = useMemo(() => {
    const raw = liveMatchState?.recent_events || [];
    if (raw.length === 0) return [];
    return raw.slice().reverse().slice(0, 3);
  }, [liveMatchState?.recent_events]);

  // Max starting life based on format
  const formatLower = liveMatchState?.format?.toLowerCase() || '';
  const maxLife = formatLower.includes('brawl') || formatLower.includes('commander') ? 25 : 20;

  const playerLife = liveMatchState?.player_life ?? 20;
  const opponentLife = liveMatchState?.opponent_life ?? 20;

  const playerLifePct = Math.min(100, Math.max(0, (playerLife / maxLife) * 100));
  const opponentLifePct = Math.min(100, Math.max(0, (opponentLife / maxLife) * 100));

  // Render mana pips for live deck colors
  const renderLiveDeckColors = (colors?: string[]) => {
    if (!colors || colors.length === 0) {
      return <span className="text-xs font-mono text-neutral-400 italic">Undetected</span>;
    }
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        {colors.map((c) => (
          <ManaPip key={c} symbol={c} size={22} className="shrink-0 drop-shadow" />
        ))}
      </div>
    );
  };

  // Card type badge helper
  const getCardTypeBadge = (cardType?: string) => {
    if (!cardType) return null;
    const typeIcons: Record<string, { icon: string; color: string }> = {
      Creature: { icon: 'ms-creature', color: '#22C55E' },
      Instant: { icon: 'ms-instant', color: '#EF4444' },
      Sorcery: { icon: 'ms-sorcery', color: '#F59E0B' },
      Artifact: { icon: 'ms-artifact', color: '#94A3B8' },
      Enchantment: { icon: 'ms-enchantment', color: '#A855F7' },
      Planeswalker: { icon: 'ms-planeswalker', color: '#F97316' },
      Battle: { icon: 'ms-battle', color: '#F43F5E' },
      Land: { icon: 'ms-land', color: '#D97706' },
    };
    const match = Object.entries(typeIcons).find(([k]) =>
      cardType.toLowerCase().includes(k.toLowerCase())
    );
    if (!match) return null;
    const [, info] = match;
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold px-1.5 py-0.5 border shrink-0 border-white/10 bg-white/[0.04] text-neutral-300">
        <i className={`ms ${info.icon} text-[10px]`} style={{ color: info.color }} />
        <span>{cardType}</span>
      </span>
    );
  };

  // Render a single action feed row with crisp rectangular badges
  const renderFeedItem = (
    e: {
      type: string;
      name?: string;
      card_type?: string;
      delta?: number;
      amount?: number;
      target_name?: string;
      damage_type?: string;
    },
    idx: number
  ) => {
    if (e.type === 'life') {
      const positive = (e.delta ?? 0) >= 0;
      return (
        <div
          key={idx}
          className="text-xs font-mono flex items-center gap-2 py-1 px-2.5 border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
        >
          <span
            className={`px-1.5 py-0.5 border text-[9.5px] font-mono font-bold uppercase shrink-0 tabular-nums ${
              positive
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
            }`}
          >
            LIFE {positive ? `+${e.delta}` : e.delta}
          </span>
          <span className={`truncate font-sans font-medium text-xs ${positive ? 'text-emerald-300' : 'text-rose-300'}`}>
            {e.name}
          </span>
        </div>
      );
    }

    if (e.type === 'damage') {
      return (
        <div
          key={idx}
          className="text-xs font-mono flex items-center gap-2 py-1 px-2.5 border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
        >
          <span className="px-1.5 py-0.5 border text-[9.5px] font-mono font-bold uppercase bg-amber-500/15 text-amber-300 border-amber-500/30 shrink-0 tabular-nums">
            {e.amount} DMG
          </span>
          <span
            className="truncate font-sans font-semibold text-white hover:text-amber-300 hover:underline cursor-pointer transition-colors text-xs"
            onClick={() => e.name && onShowCard?.({ name: e.name }, false)}
          >
            {e.name}
          </span>
          {getCardTypeBadge(e.card_type)}
          <span className="text-neutral-500 text-[10px] shrink-0">→</span>
          <span className="truncate text-amber-200/90 text-xs font-sans">
            {e.target_name}
          </span>
        </div>
      );
    }

    let badgeText = 'PLAY';
    let badgeStyle = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    if (e.type === 'mulligan') {
      badgeText = 'MULLIGAN';
      badgeStyle = 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    } else if (e.type === 'bottom') {
      badgeText = 'BOTTOM';
      badgeStyle = 'bg-orange-500/15 text-orange-300 border-orange-500/30';
    } else if (e.type === 'draw') {
      badgeText = 'DRAW';
      badgeStyle = 'bg-sky-500/15 text-sky-300 border-sky-500/30';
    } else if (e.type === 'token') {
      badgeText = 'TOKEN';
      badgeStyle = 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30';
    } else if (e.type === 'dies') {
      badgeText = 'DIES';
      badgeStyle = 'bg-rose-500/15 text-rose-400 border-rose-500/30';
    } else if (e.type === 'exile') {
      badgeText = 'EXILE';
      badgeStyle = 'bg-purple-500/15 text-purple-300 border-purple-500/30';
    }

    return (
      <div
        key={idx}
        className="text-xs font-mono flex items-center gap-2 py-1 px-2.5 border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
      >
        <span
          className={`px-1.5 py-0.5 border text-[9.5px] font-mono font-bold uppercase shrink-0 ${badgeStyle}`}
        >
          {badgeText}
        </span>
        <span
          className="truncate font-sans font-medium text-neutral-100 hover:text-white hover:underline cursor-pointer transition-colors text-xs"
          onClick={() => e.name && onShowCard?.({ name: e.name }, false)}
        >
          {e.name}
        </span>
        {getCardTypeBadge(e.card_type)}
      </div>
    );
  };

  // Helper to format an action string for ticker
  const formatTickerAction = (e: any) => {
    if (e.type === 'damage') {
      return `${e.amount} DMG (${e.name} → ${e.target_name})`;
    }
    if (e.type === 'life') {
      return `LIFE ${e.delta >= 0 ? `+${e.delta}` : e.delta} (${e.name})`;
    }
    if (e.type === 'token') {
      return `TOKEN (${e.name})`;
    }
    if (e.type === 'dies') {
      return `DIES (${e.name})`;
    }
    if (e.type === 'exile') {
      return `EXILE (${e.name})`;
    }
    if (e.type === 'draw') {
      return `${e.name || 'Drew a card'}`;
    }
    if (e.type === 'mulligan') {
      return `${e.name || 'Mulligan'}`;
    }
    return `PLAY (${e.name})`;
  };

  const formatBadge = liveMatchState?.format
    ? formatChipColor
      ? formatChipColor(liveMatchState.format)
      : { text: '#F3F4F6', bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.15)' }
    : null;

  const hasPlayerCommander = !!liveMatchState?.player_commander;
  const hasOpponentCommander = !!liveMatchState?.opponent_commander;

  // Unboxed Player Top Station (Sitting directly on the background)
  const renderPlayerStation = () => (
    <div className="flex flex-col space-y-2 min-h-0">
      {/* Top Meta Bar */}
      <div className="flex items-center justify-between shrink-0 pb-1 border-b border-white/10">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(34,197,94,0.6)] shrink-0" />
          <span className="text-xs font-sans uppercase font-bold tracking-wider text-emerald-400 shrink-0">
            Your Deck:
          </span>
          <span className="text-xs font-sans font-bold uppercase tracking-wide text-white truncate">
            {liveMatchState?.player_deck_name || 'Standard Deck'}
          </span>
        </div>
        <span className="text-[11px] font-mono tabular-nums text-neutral-300 shrink-0 ml-2">
          {liveMatchState?.player_cards_seen ?? 0} cards seen
        </span>
      </div>

      {/* Dynamic Health Bar */}
      <div className="w-full h-11 relative overflow-hidden bg-black/60 border border-emerald-500/40 shrink-0">
        <div
          className="absolute inset-y-0 left-0 transition-all duration-500 ease-out bg-gradient-to-r from-emerald-800/50 via-emerald-600/60 to-emerald-500/70 border-r border-emerald-400/50"
          style={{ width: `${playerLifePct}%` }}
        />
        <div className="relative z-10 flex items-center justify-center gap-2.5 h-full">
          <div className="text-2xl font-mono font-bold text-white tabular-nums tracking-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
            {playerLife} <span className="text-xs font-mono text-emerald-300 font-normal">HP</span>
          </div>
          {playerRecentLifeDelta !== null && playerRecentLifeDelta !== 0 && (
            <span
              className={`text-xs font-mono font-bold px-1.5 py-0.2 border shadow-md animate-pulse ${
                playerRecentLifeDelta > 0
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
              }`}
            >
              {playerRecentLifeDelta > 0 ? `+${playerRecentLifeDelta}` : playerRecentLifeDelta} HP
            </span>
          )}
        </div>
      </div>

      {/* Unboxed Commander & Color Identity */}
      <div className="grid grid-cols-2 gap-4 shrink-0 pt-0.5 items-center">
        {hasPlayerCommander ? (
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-11 h-11 border border-white/20 overflow-hidden bg-neutral-900 shrink-0 shadow">
              <CardImage
                name={liveMatchState?.player_commander?.name || ''}
                version="art_crop"
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-sans uppercase font-bold text-neutral-300 block tracking-wider leading-none mb-1">
                Commander
              </span>
              <span
                className="font-sans font-bold text-xs uppercase tracking-wide text-white hover:text-emerald-400 hover:underline cursor-pointer truncate block"
                onClick={() =>
                  liveMatchState?.player_commander &&
                  onShowCard?.({ name: liveMatchState.player_commander.name }, true)
                }
              >
                {liveMatchState?.player_commander?.name}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center min-w-0">
            <span className="text-xs font-sans text-neutral-400 italic">No Commander</span>
          </div>
        )}

        <div>
          <span className="text-[10px] font-sans uppercase font-bold text-neutral-300 block tracking-wider leading-none mb-1">
            Color Identity
          </span>
          {renderLiveDeckColors(liveMatchState?.player_colors)}
        </div>
      </div>
    </div>
  );

  // Unboxed Opponent Top Station (Sitting directly on the background)
  const renderOpponentStation = () => (
    <div className="flex flex-col space-y-2 min-h-0">
      {/* Top Meta Bar */}
      <div className="flex items-center justify-between shrink-0 pb-1 border-b border-white/10">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_6px_rgba(239,68,68,0.6)] shrink-0" />
          <span className="text-xs font-sans uppercase font-bold tracking-wider text-rose-400 shrink-0">
            Opponent:
          </span>
          <span className="text-xs font-sans font-bold uppercase tracking-wide text-white truncate">
            {liveMatchState?.opponent_name || 'Opponent'}
          </span>
        </div>
        <span className="text-[11px] font-mono tabular-nums text-neutral-300 shrink-0 ml-2">
          {liveMatchState?.opponent_cards_seen ?? 0} cards seen
        </span>
      </div>

      {/* Dynamic Health Bar */}
      <div className="w-full h-11 relative overflow-hidden bg-black/60 border border-rose-500/40 shrink-0">
        <div
          className="absolute inset-y-0 left-0 transition-all duration-500 ease-out bg-gradient-to-r from-rose-900/50 via-rose-700/60 to-rose-600/70 border-r border-rose-400/50"
          style={{ width: `${opponentLifePct}%` }}
        />
        <div className="relative z-10 flex items-center justify-center gap-2.5 h-full">
          <div className="text-2xl font-mono font-bold text-white tabular-nums tracking-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
            {opponentLife} <span className="text-xs font-mono text-rose-300 font-normal">HP</span>
          </div>
          {opponentRecentLifeDelta !== null && opponentRecentLifeDelta !== 0 && (
            <span
              className={`text-xs font-mono font-bold px-1.5 py-0.2 border shadow-md animate-pulse ${
                opponentRecentLifeDelta > 0
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
              }`}
            >
              {opponentRecentLifeDelta > 0 ? `+${opponentRecentLifeDelta}` : opponentRecentLifeDelta} HP
            </span>
          )}
        </div>
      </div>

      {/* Unboxed Opponent Commander & Color Identity */}
      <div className="grid grid-cols-2 gap-4 shrink-0 pt-0.5 items-center">
        {hasOpponentCommander ? (
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-11 h-11 border border-white/20 overflow-hidden bg-neutral-900 shrink-0 shadow">
              <CardImage
                name={liveMatchState?.opponent_commander?.name || ''}
                version="art_crop"
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-sans uppercase font-bold text-neutral-300 block tracking-wider leading-none mb-1">
                Commander
              </span>
              <span
                className="font-sans font-bold text-xs uppercase tracking-wide text-white hover:text-rose-400 hover:underline cursor-pointer truncate block"
                onClick={() =>
                  liveMatchState?.opponent_commander &&
                  onShowCard?.({ name: liveMatchState.opponent_commander.name }, true)
                }
              >
                {liveMatchState?.opponent_commander?.name}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center min-w-0">
            <span className="text-xs font-sans text-neutral-400 italic">No Commander</span>
          </div>
        )}

        <div>
          <span className="text-[10px] font-sans uppercase font-bold text-neutral-300 block tracking-wider leading-none mb-1">
            Color Identity
          </span>
          {renderLiveDeckColors(liveMatchState?.opponent_colors)}
        </div>
      </div>
    </div>
  );

  const leftLabel = firstPlayerIsHero ? 'Your Timeline' : 'Opponent Timeline';
  const rightLabel = firstPlayerIsHero ? 'Opponent Timeline' : 'Your Timeline';
  const leftColorClass = firstPlayerIsHero ? 'text-emerald-400' : 'text-rose-400';
  const rightColorClass = firstPlayerIsHero ? 'text-rose-400' : 'text-emerald-400';

  return (
    <div className="flex-1 min-h-0 flex flex-col space-y-3 px-8 py-4 overflow-hidden select-none">
      {/* 1. HEADER (Design System Reference Standard) */}
      <div className="flex items-center justify-between pb-2 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="ms ms-instant text-2xl" style={{ color: accentColor }} />
          <h1 className="text-[26px] font-display font-bold tracking-[0.12em] uppercase text-white leading-none">
            LIVE MATCH HUD
          </h1>
          <span className="text-xs text-neutral-400 font-sans ml-2">
            {isMatchActive ? '(Active match stream)' : '(Real-time combat engine)'}
          </span>
        </div>
      </div>

      {/* 2. FLOATING TOP FILTER & RIGHT-JUSTIFIED METRICS TOOLBAR */}
      <div className="shrink-0 flex items-center gap-2.5 pb-1 flex-wrap">
        {/* Search Bar (Left-aligned) */}
        <div className="relative w-64 shrink-0 h-8 flex items-center">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search card or action..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 text-xs rounded-none bg-white/[0.04] hover:bg-white/[0.07] focus:bg-white/[0.09] text-white placeholder:text-neutral-500 focus:outline-none transition-colors font-sans"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Flexible space pushing all indicators to the right */}
        <div className="flex-1" />

        {/* Right-justified Status & Metrics Cluster */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Match Status */}
          <div className="flex items-center gap-2 px-3 py-1 bg-white/[0.04] border border-white/10 h-8">
            <span
              className={`w-2 h-2 rounded-full ${
                isMatchActive ? 'bg-emerald-500 shadow-[0_0_8px_rgba(34,197,94,0.8)] animate-pulse' : 'bg-neutral-600'
              }`}
            />
            <span className="text-xs font-sans uppercase font-bold tracking-wider text-white">
              {isMatchActive ? 'Match in Progress' : 'Waiting for Match'}
            </span>
          </div>

          {/* Format Badge */}
          {liveMatchState?.format && formatBadge && (
            <div className="flex items-center h-8">
              <span
                className="text-[11px] font-mono font-bold px-2.5 py-1 border uppercase tracking-wider h-8 flex items-center"
                style={{
                  color: formatBadge.text,
                  backgroundColor: formatBadge.bg,
                  borderColor: formatBadge.border,
                }}
              >
                {liveMatchState.format}
              </span>
            </div>
          )}

          {/* Elapsed Time */}
          {isMatchActive && (
            <div className="flex items-center gap-2 px-3 py-1 bg-white/[0.04] border border-white/10 text-xs tabular-nums text-neutral-300 h-8 font-mono">
              <Clock className="w-3.5 h-3.5 text-sky-400" />
              <span className="text-neutral-400 text-[11px] font-sans uppercase">Elapsed:</span>
              <span className="font-bold text-white">
                {formatMatchDuration(liveMatchState?.duration_seconds)}
              </span>
            </div>
          )}

          {/* Turn / Round */}
          {isMatchActive && (
            <div className="flex items-center gap-2 px-3 py-1 bg-white/[0.04] border border-white/10 text-xs tabular-nums text-neutral-300 h-8 font-mono">
              <Swords className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-neutral-400 text-[11px] font-sans uppercase">Turn:</span>
              <span className="font-bold text-white">
                {liveMatchState?.turn || 1}
              </span>
              <span className="text-neutral-500">|</span>
              <span className="text-neutral-400 text-[11px] font-sans uppercase">Round:</span>
              <span className="font-bold text-white">
                {liveMatchState?.round ?? Math.ceil((liveMatchState?.turn || 1) / 2)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 3. MAIN WORKSPACE (No outer box — top elements sit directly on background, timeline is the only container) */}
      {isMatchActive && liveMatchState ? (
        <div className="flex-1 flex flex-col space-y-3 min-h-0 overflow-hidden relative">
          {/* MATCH RESULT OVERLAY: VICTORY / DEFEAT BANNER */}
          {liveMatchState.just_completed && (
            <div
              className={`absolute inset-0 z-50 flex flex-col items-center justify-center p-8 space-y-6 backdrop-blur-2xl animate-fade-in border ${
                liveMatchState.result === 'win'
                  ? 'bg-emerald-950/95 border-emerald-500/50 shadow-[0_0_80px_rgba(34,197,94,0.3)]'
                  : 'bg-rose-950/95 border-rose-500/50 shadow-[0_0_80px_rgba(239,68,68,0.3)]'
              }`}
            >
              {/* Header Banner */}
              <div className="flex flex-col items-center space-y-2 text-center">
                <div
                  className={`text-6xl font-bold font-display tracking-[0.2em] uppercase drop-shadow-2xl ${
                    liveMatchState.result === 'win' ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {liveMatchState.result === 'win' ? 'VICTORY' : 'DEFEAT'}
                </div>
                <div className="text-xs font-mono text-neutral-300 uppercase tracking-widest bg-black/40 px-3 py-1 border border-white/10">
                  {liveMatchState.reason_label || 'Match Concluded'}
                </div>
              </div>

              {/* Match Statistics Pill Bar */}
              <div className="flex items-center gap-3 flex-wrap justify-center font-mono text-xs tabular-nums">
                <div className="flex items-center gap-2 px-3 py-1.5 border border-white/15 bg-black/60 shadow-inner">
                  <Clock className="w-3.5 h-3.5 text-sky-400" />
                  <span className="text-neutral-400">Duration:</span>
                  <span className="font-bold text-white">
                    {formatMatchDuration(liveMatchState.duration_seconds)}
                  </span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 border border-white/15 bg-black/60 shadow-inner">
                  <Swords className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-neutral-400">Turns:</span>
                  <span className="font-bold text-white">
                    {liveMatchState.turns ?? liveMatchState.turn ?? 1} Turns
                  </span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 border border-white/15 bg-black/60 shadow-inner">
                  <Activity className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-bold">{liveMatchState.player_life ?? 0} HP</span>
                  <span className="text-neutral-500">vs</span>
                  <span className="text-rose-400 font-bold">{liveMatchState.opponent_life ?? 0} HP</span>
                </div>
              </div>

              {/* Notable Plays / Big Impact Cards */}
              {liveMatchState.impactful_cards && liveMatchState.impactful_cards.length > 0 && (
                <div className="w-full max-w-3xl flex flex-col items-center space-y-3 pt-2">
                  <div className="text-xs font-sans font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Notable Match Cards & MVPs
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-3 w-full">
                    {liveMatchState.impactful_cards.map((card: any, idx: number) => (
                      <div
                        key={idx}
                        onClick={() => onShowCard?.({ name: card.name }, false)}
                        className="border border-white/20 bg-black/85 flex items-center p-3 gap-3 shadow-xl min-w-[240px] max-w-[290px] cursor-pointer hover:border-white/50 transition-colors group"
                      >
                        <div className="w-12 h-12 shrink-0 border border-white/25 overflow-hidden bg-neutral-900 shadow">
                          <CardImage
                            name={card.name}
                            version="art_crop"
                            alt={card.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-sans font-bold uppercase tracking-wide text-white truncate block group-hover:text-amber-300 transition-colors">
                            {card.name}
                          </span>
                          <span className="text-[11px] font-sans text-neutral-400 block truncate mt-0.5">
                            {card.reason || 'High Impact Action'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TOP SECTION: COMMAND METRICS (Floating Unboxed directly on the background) */}
          <div className="grid grid-cols-2 gap-6 shrink-0 pt-1 pb-1">
            {firstPlayerIsHero ? (
              <>
                {renderPlayerStation()}
                {renderOpponentStation()}
              </>
            ) : (
              <>
                {renderOpponentStation()}
                {renderPlayerStation()}
              </>
            )}
          </div>

          {/* UNIFIED TIMELINE CONTAINER (The ONLY container box on the page — Standardized bg-neutral-950/50) */}
          <div className="flex-1 min-h-0 border border-white/10 bg-neutral-950/50 backdrop-blur-md p-3.5 overflow-y-auto custom-scrollbar flex flex-col space-y-3">
            {/* Top Timeline Column Labels */}
            <div className="grid grid-cols-2 gap-4 pb-1.5 border-b border-white/10 sticky top-0 bg-neutral-950/95 py-1 z-10">
              <div className={`text-[10.5px] font-sans font-bold uppercase tracking-wider ${leftColorClass} pl-3`}>
                {leftLabel}
              </div>
              <div className={`text-[10.5px] font-sans font-bold uppercase tracking-wider ${rightColorClass} pl-4`}>
                {rightLabel}
              </div>
            </div>

            {/* Opening Phase Row (if any) */}
            {(openingEvents.first.length > 0 || openingEvents.second.length > 0) && (
              <div className="space-y-1.5">
                <div className="text-[9.5px] font-mono uppercase font-bold tracking-wider text-amber-300/90 px-3 py-1 bg-amber-500/10 border-y border-amber-500/30 flex items-center justify-between">
                  <span>OPENING PHASE · TURN 0</span>
                  <span className="text-[9px] text-neutral-400 font-sans">Mulligans & Opening Hands</span>
                </div>
                <div className="grid grid-cols-2 gap-4 items-start">
                  <div className="space-y-1 pl-3 pr-4 border-r border-white/5">
                    {openingEvents.first.length > 0 ? (
                      openingEvents.first.map((e: any, idx: number) => renderFeedItem(e, idx))
                    ) : (
                      <div className="text-[10px] font-sans italic text-neutral-400 py-1">No actions</div>
                    )}
                  </div>
                  <div className="space-y-1 pl-4 pr-3">
                    {openingEvents.second.length > 0 ? (
                      openingEvents.second.map((e: any, idx: number) => renderFeedItem(e, idx))
                    ) : (
                      <div className="text-[10px] font-sans italic text-neutral-400 py-1">No actions</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Synchronized Rounds (Full-Width Header spanning both sides, 2-column actions with subtle separator line) */}
            {roundsList.map((r) => {
              const hasFirst = r.first.length > 0;
              const hasSecond = r.second.length > 0;

              return (
                <div key={r.round} className="space-y-1.5">
                  {/* Full-width Round Separator Banner */}
                  <div className="flex items-center justify-between text-xs font-mono uppercase font-bold px-3 py-1 bg-white/[0.05] border-y border-white/10 text-white tracking-wider">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]" />
                      <span>ROUND {r.round}</span>
                    </div>
                    <div className="flex items-center gap-4 text-[10px]">
                      <span className={`${leftColorClass} font-bold`}>
                        TURN {r.firstTurn} ({firstPlayerIsHero ? 'YOU' : 'OPPONENT'})
                      </span>
                      <span className="text-neutral-600">|</span>
                      <span className={`${rightColorClass} font-bold`}>
                        TURN {r.secondTurn} ({firstPlayerIsHero ? 'OPPONENT' : 'YOU'})
                      </span>
                    </div>
                  </div>

                  {/* 2-Column Synchronized Turn Actions (Top-to-Bottom Flow with subtle vertical separator line) */}
                  <div className="grid grid-cols-2 gap-4 items-start">
                    {/* Left Column (First Player) */}
                    <div className="space-y-1 pl-3 pr-4 border-r border-white/5">
                      {hasFirst ? (
                        r.first.map((e: any, idx: number) => renderFeedItem(e, idx))
                      ) : (
                        <div className="text-[10px] font-sans italic text-neutral-400 py-1 px-1">
                          No actions recorded
                        </div>
                      )}
                    </div>

                    {/* Right Column (Second Player) */}
                    <div className="space-y-1 pl-4 pr-3">
                      {hasSecond ? (
                        r.second.map((e: any, idx: number) => renderFeedItem(e, idx))
                      ) : (
                        <div className="text-[10px] font-sans italic text-neutral-400 py-1 px-1">
                          No actions recorded
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {roundsList.length === 0 && openingEvents.first.length === 0 && openingEvents.second.length === 0 && (
              <p className="text-xs font-sans italic text-neutral-400 py-8 text-center">
                {query ? 'No matching actions found' : 'Awaiting first game actions...'}
              </p>
            )}
          </div>

          {/* BOTTOM ROW: LAST THREE ACTIONS TICKER */}
          <div className="p-2 border border-white/10 bg-white/[0.02] flex items-center justify-between gap-3 shrink-0 font-mono text-xs">
            <div className="flex items-center gap-2 min-w-0 overflow-hidden">
              <span className="ms ms-instant text-sm text-amber-400 shrink-0" />
              <span className="text-neutral-300 text-[10px] font-sans uppercase font-bold tracking-wider shrink-0">
                Last Actions:
              </span>
              {lastThreeActions.length === 0 ? (
                <span className="text-neutral-400 italic font-sans text-xs">
                  Awaiting combat or spell actions...
                </span>
              ) : (
                <div className="flex items-center gap-2 truncate text-xs">
                  {lastThreeActions.map((action: any, idx: number) => {
                    const isHero = action.is_player;
                    return (
                      <React.Fragment key={idx}>
                        {idx > 0 && <span className="text-neutral-600 font-bold">•</span>}
                        <span className="truncate flex items-center gap-1">
                          <span
                            className="font-bold font-sans uppercase"
                            style={{ color: isHero ? '#22C55E' : '#EF4444' }}
                          >
                            {isHero ? 'YOU' : (liveMatchState?.opponent_name || 'OPPONENT').toUpperCase()}:
                          </span>
                          <span className="text-neutral-200 font-sans">
                            {formatTickerAction(action)}
                          </span>
                        </span>
                      </React.Fragment>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest shrink-0 hidden sm:block">
              {liveMatchState.match_id || 'LIVE_GRE_SYNC'}
            </div>
          </div>
        </div>
      ) : (
        /* IDLE / WAITING FOR MATCH SCREEN */
        <div className="flex-1 relative flex flex-col items-center justify-center overflow-hidden select-none">
          {/* Watermark Logo */}
          <img
            src={logoImg}
            alt=""
            className="absolute top-[15%] left-1/2 -translate-x-1/2 w-[46%] object-contain opacity-10 grayscale pointer-events-none"
          />

          {/* Idle Status Display */}
          <div className="relative z-10 px-8 py-5 border border-white/20 bg-neutral-950/80 backdrop-blur-md shadow-2xl flex flex-col items-center space-y-2 text-center">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-neutral-500 animate-pulse" />
              <span className="text-base font-sans font-bold tracking-[0.14em] uppercase text-white">
                Idle · Waiting for Match
              </span>
            </div>
            <p className="text-xs font-sans text-neutral-300 max-w-sm">
              Launch a match on Magic: The Gathering Arena to begin real-time combat tracking and live state sync.
            </p>
          </div>

          {/* Diminished Icon Symbol */}
          <img
            src={symbolIcon}
            alt=""
            className="absolute bottom-[10%] left-1/2 -translate-x-1/2 w-[18%] object-contain opacity-5 grayscale pointer-events-none"
          />
        </div>
      )}
    </div>
  );
};

export default LiveHUDView;
