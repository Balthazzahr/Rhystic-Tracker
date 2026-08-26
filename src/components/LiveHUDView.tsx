import React from 'react';
import { Clock, Swords, Activity, Sparkles } from 'lucide-react';
import { ManaPip } from './ManaPip';
import CardImage from './CardImage';
import logoImg from '../assets/RhysticTrackerLogo.svg';
import symbolIcon from '../assets/RhysticTrackerICON.svg';

interface LiveHUDViewProps {
  palette: any;
  liveMatchState: any;
  onShowCard?: (card: { name: string; grp_id?: number }, isCommander?: boolean) => void;
  formatChipColor?: (format?: string) => { text: string; bg: string; border: string };
}

function getContrastTextColor(hexColor?: string): string {
  if (!hexColor) return '#FFFFFF';
  const cleanHex = hexColor.replace('#', '');
  if (cleanHex.length < 6) return '#FFFFFF';
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 160 ? '#09090B' : '#FFFFFF';
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

  // Render mana pips for live deck colors
  const renderLiveDeckColors = (colors?: string[]) => {
    if (!colors || colors.length === 0) {
      return <span className="text-xs font-mono text-neutral-500 italic">Undetected</span>;
    }
    return (
      <div className="flex items-center gap-1.5">
        {colors.map((c) => (
          <ManaPip key={c} symbol={c} size={16} className="shrink-0" />
        ))}
      </div>
    );
  };

  // Card type badge helper
  const getCardTypeBadge = (cardType?: string) => {
    if (!cardType) return null;
    const typeIcons: Record<string, { icon: string; color: string }> = {
      Creature: { icon: 'ms-creature', color: '#34D399' },
      Instant: { icon: 'ms-instant', color: '#F87171' },
      Sorcery: { icon: 'ms-sorcery', color: '#FBBF24' },
      Artifact: { icon: 'ms-artifact', color: '#94A3B8' },
      Enchantment: { icon: 'ms-enchantment', color: '#C084FC' },
      Planeswalker: { icon: 'ms-planeswalker', color: '#FB923C' },
      Battle: { icon: 'ms-battle', color: '#F43F5E' },
      Land: { icon: 'ms-land', color: '#D97706' },
    };
    const match = Object.entries(typeIcons).find(([k]) =>
      cardType.toLowerCase().includes(k.toLowerCase())
    );
    if (!match) return null;
    const [, info] = match;
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold px-1.5 py-0.2 border shrink-0 border-white/10 bg-white/5 text-neutral-300">
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
          className="text-xs font-mono flex items-center gap-1.5 py-1 border-b border-white/5"
        >
          <span
            className={`px-1.5 py-0.2 border text-[9.5px] font-mono font-bold uppercase shrink-0 ${
              positive
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
            }`}
          >
            LIFE {positive ? `+${e.delta}` : e.delta}
          </span>
          <span className={`truncate font-sans font-medium ${positive ? 'text-emerald-300' : 'text-rose-300'}`}>
            {e.name}
          </span>
        </div>
      );
    }

    if (e.type === 'damage') {
      return (
        <div
          key={idx}
          className="text-xs font-mono flex items-center gap-1.5 py-1 border-b border-white/5"
        >
          <span className="px-1.5 py-0.2 border text-[9.5px] font-mono font-bold uppercase bg-amber-500/15 text-amber-300 border-amber-500/30 shrink-0">
            {e.amount} DMG
          </span>
          <span
            className="truncate font-sans font-bold text-white hover:underline cursor-pointer"
            onClick={() => e.name && onShowCard?.({ name: e.name }, false)}
          >
            {e.name}
          </span>
          {getCardTypeBadge(e.card_type)}
          <span className="text-neutral-500 text-[10px] shrink-0">→</span>
          <span className="truncate text-amber-300/90 text-[11px] font-sans">
            {e.target_name}
          </span>
        </div>
      );
    }

    let badgeText = 'PLAY';
    let badgeStyle = 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30';
    if (e.type === 'mulligan') {
      badgeText = 'MULLIGAN';
      badgeStyle = 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    } else if (e.type === 'bottom') {
      badgeText = 'BOTTOM';
      badgeStyle = 'bg-orange-500/15 text-orange-300 border-orange-500/30';
    } else if (e.type === 'draw') {
      badgeText = 'DRAW';
      badgeStyle = 'bg-purple-500/10 text-purple-300 border-purple-500/30';
    } else if (e.type === 'token') {
      badgeText = 'TOKEN';
      badgeStyle = 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30';
    } else if (e.type === 'dies') {
      badgeText = 'DIES';
      badgeStyle = 'bg-rose-500/10 text-rose-300 border-rose-500/30';
    } else if (e.type === 'exile') {
      badgeText = 'EXILE';
      badgeStyle = 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30';
    }

    return (
      <div
        key={idx}
        className="text-xs font-mono flex items-center gap-1.5 py-1 border-b border-white/5"
      >
        <span
          className={`px-1.5 py-0.2 border text-[9.5px] font-mono font-bold uppercase shrink-0 ${badgeStyle}`}
        >
          {badgeText}
        </span>
        <span
          className="truncate font-sans font-medium text-white hover:underline cursor-pointer"
          onClick={() => e.name && onShowCard?.({ name: e.name }, false)}
        >
          {e.name}
        </span>
        {getCardTypeBadge(e.card_type)}
      </div>
    );
  };

  const formatBadge = liveMatchState?.format
    ? formatChipColor
      ? formatChipColor(liveMatchState.format)
      : { text: '#F3F4F6', bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.15)' }
    : null;

  return (
    <div className="flex-1 min-h-0 flex flex-col space-y-3 px-8 py-4 overflow-hidden select-none">
      {/* 1. HEADER */}
      <div className="flex items-center justify-between pb-2 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="ms ms-instant text-2xl" style={{ color: accentColor }} />
          <h1 className="text-[26px] font-display font-bold tracking-[0.12em] uppercase text-white leading-none">
            LIVE MATCH HUD
          </h1>
          <span className="text-xs text-neutral-400 font-sans ml-2">
            {liveMatchState ? '(Active match stream)' : '(Real-time combat engine)'}
          </span>
        </div>
      </div>

      {/* 2. TOP TOOLBAR & STATUS BAR */}
      <div className="shrink-0 border border-white/10 bg-white/[0.02] p-2 flex items-center justify-between gap-2.5 flex-wrap">
        <div className="flex items-center gap-2">
          <span
            className={`ms ms-instant text-sm ${
              liveMatchState ? 'text-emerald-400 animate-pulse' : 'text-neutral-500'
            }`}
          />
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-white">
            {liveMatchState ? 'Match in Progress' : 'Waiting for Match'}
          </span>
        </div>

        {liveMatchState && (
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono font-bold px-2.5 py-0.5 border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 uppercase tracking-wider">
              ROUND {liveMatchState.round ?? Math.ceil((liveMatchState.turn || 1) / 2)}
            </span>
          </div>
        )}
      </div>

      {/* 3. MAIN CONTENT CONTAINER */}
      <div className="flex-1 border border-white/10 bg-neutral-950/80 p-5 flex flex-col justify-between space-y-4 min-h-0 overflow-hidden">
        {liveMatchState ? (
          <div className="flex-1 flex flex-col space-y-4 relative min-h-0 overflow-hidden">
            {/* Match Result Overlay: shown for a window after the game ends */}
            {liveMatchState.just_completed && (
              <div
                className={`absolute inset-0 z-50 border flex flex-col items-center justify-center p-8 space-y-5 backdrop-blur-2xl animate-fade-in ${
                  liveMatchState.result === 'win'
                    ? 'bg-emerald-950/95 border-emerald-500/50 shadow-[0_0_60px_rgba(16,185,129,0.25)]'
                    : 'bg-rose-950/95 border-rose-500/50 shadow-[0_0_60px_rgba(244,63,94,0.25)]'
                }`}
              >
                {/* Header Banner */}
                <div className="flex flex-col items-center space-y-1.5 text-center">
                  <div
                    className={`text-6xl font-bold font-display tracking-[0.2em] uppercase drop-shadow-xl ${
                      liveMatchState.result === 'win' ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {liveMatchState.result === 'win' ? 'VICTORY' : 'DEFEAT'}
                  </div>
                  <div className="text-sm font-mono text-neutral-300 uppercase tracking-widest">
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
                      {liveMatchState.turns ?? 1} Turns
                    </span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 border border-white/15 bg-black/60 shadow-inner">
                    <Activity className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400 font-bold">{liveMatchState.player_life ?? 20} HP</span>
                    <span className="text-neutral-500">vs</span>
                    <span className="text-rose-400 font-bold">{liveMatchState.opponent_life ?? 0} HP</span>
                  </div>
                </div>

                {/* Notable Plays / Big Impact Cards */}
                {liveMatchState.impactful_cards && liveMatchState.impactful_cards.length > 0 && (
                  <div className="w-full max-w-2xl flex flex-col items-center space-y-2.5 pt-2">
                    <div className="text-xs font-mono font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Notable Cards & Plays
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-3 w-full">
                      {liveMatchState.impactful_cards.map((card: any, idx: number) => (
                        <div
                          key={idx}
                          onClick={() => onShowCard?.({ name: card.name }, false)}
                          className="border border-white/20 bg-black/80 flex items-center p-2.5 gap-3 shadow-xl min-w-[220px] max-w-[280px] cursor-pointer hover:border-white/40 transition-colors"
                        >
                          <div className="w-12 h-12 shrink-0 border border-white/25 overflow-hidden bg-neutral-900 shadow">
                            <CardImage
                              name={card.name}
                              version="art_crop"
                              alt={card.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-bold font-display uppercase tracking-wide text-white truncate block">
                              {card.name}
                            </span>
                            <span className="text-[11px] font-sans text-neutral-400 block truncate mt-0.5">
                              {card.reason || 'Impactful Action'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Top Match Info Bar */}
            <div className="p-3.5 border border-white/10 bg-white/[0.02] flex items-center justify-between flex-wrap gap-4 shrink-0">
              <div className="flex items-center gap-5 flex-wrap">
                {formatBadge && (
                  <div>
                    <p className="text-[9.5px] font-mono uppercase text-neutral-500 mb-0.5">Format</p>
                    <span
                      className="text-[10px] font-mono font-bold px-2 py-0.5 border uppercase tracking-wider"
                      style={{
                        color: formatBadge.text,
                        backgroundColor: formatBadge.bg,
                        borderColor: formatBadge.border,
                      }}
                    >
                      {liveMatchState.format || 'Standard'}
                    </span>
                  </div>
                )}
                <div className="h-6 w-px bg-white/10 hidden sm:block" />
                <div>
                  <p className="text-[9.5px] font-mono uppercase text-neutral-500 mb-0.5">Your Deck</p>
                  <p className="text-xs font-bold font-display uppercase tracking-wide text-white truncate max-w-[220px]">
                    {liveMatchState.player_deck_name || '—'}
                  </p>
                </div>
                <div className="h-6 w-px bg-white/10 hidden sm:block" />
                <div>
                  <p className="text-[9.5px] font-mono uppercase text-neutral-500 mb-0.5">Opponent</p>
                  <p className="text-xs font-bold font-display uppercase tracking-wide text-white truncate max-w-[160px]">
                    {liveMatchState.opponent_name || 'Opponent'}
                  </p>
                </div>
              </div>
            </div>

            {/* Middle Row: Player vs Opponent Split Panels */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 items-stretch min-h-0">
              {/* Player Panel */}
              <div className="p-4 border border-white/10 bg-neutral-950 flex flex-col space-y-3 min-h-0">
                <div className="flex items-center justify-between shrink-0 pb-2 border-b border-white/10">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-emerald-400">
                    Your Life
                  </span>
                  <span className="text-[11px] font-mono tabular-nums text-neutral-500">
                    {liveMatchState.player_cards_seen ?? 0} cards seen
                  </span>
                </div>

                <div className="text-5xl font-bold font-display text-emerald-400 tabular-nums shrink-0 leading-none">
                  {liveMatchState.player_life ?? 20} <span className="text-sm font-mono text-emerald-400/70">HP</span>
                </div>

                {liveMatchState.format?.toLowerCase().includes('brawl') && liveMatchState.player_commander && (
                  <div className="text-xs shrink-0">
                    <span className="text-[9.5px] font-mono uppercase text-neutral-500 block mb-0.5">
                      Commander
                    </span>
                    <span className="font-bold font-display uppercase tracking-wide text-white">
                      {liveMatchState.player_commander.name}
                    </span>
                  </div>
                )}

                <div className="shrink-0">
                  <span className="text-[9.5px] font-mono uppercase text-neutral-500 block mb-1">
                    Deck Colors
                  </span>
                  {renderLiveDeckColors(liveMatchState.player_colors)}
                </div>

                {/* Live Action Feed (Player) */}
                <div className="flex-1 min-h-0 border border-white/10 bg-black/40 p-2.5 overflow-y-auto custom-scrollbar">
                  <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-neutral-400 mb-1 sticky top-0 bg-neutral-950/90 py-0.5">
                    Your Actions
                  </p>
                  {(liveMatchState.recent_events || []).filter((e: any) => e.is_player).length === 0 ? (
                    <p className="text-xs font-sans italic text-neutral-500 py-4 text-center">
                      No actions logged yet
                    </p>
                  ) : (
                    (liveMatchState.recent_events || [])
                      .filter((e: any) => e.is_player)
                      .slice()
                      .reverse()
                      .map((e: any, idx: number) => renderFeedItem(e, idx))
                  )}
                </div>
              </div>

              {/* Opponent Panel */}
              <div className="p-4 border border-white/10 bg-neutral-950 flex flex-col space-y-3 min-h-0">
                <div className="flex items-center justify-between shrink-0 pb-2 border-b border-white/10">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-rose-400">
                    Opponent Life
                  </span>
                  <span className="text-[11px] font-mono tabular-nums text-neutral-500">
                    {liveMatchState.opponent_cards_seen ?? 0} cards seen
                  </span>
                </div>

                <div className="text-5xl font-bold font-display text-rose-400 tabular-nums shrink-0 leading-none">
                  {liveMatchState.opponent_life ?? 20} <span className="text-sm font-mono text-rose-400/70">HP</span>
                </div>

                {liveMatchState.format?.toLowerCase().includes('brawl') && liveMatchState.opponent_commander && (
                  <div className="text-xs shrink-0">
                    <span className="text-[9.5px] font-mono uppercase text-neutral-500 block mb-0.5">
                      Commander
                    </span>
                    <span className="font-bold font-display uppercase tracking-wide text-white">
                      {liveMatchState.opponent_commander.name}
                    </span>
                  </div>
                )}

                <div className="shrink-0">
                  <span className="text-[9.5px] font-mono uppercase text-neutral-500 block mb-1">
                    Detected Colors
                  </span>
                  {renderLiveDeckColors(liveMatchState.opponent_colors)}
                </div>

                {/* Live Action Feed (Opponent) */}
                <div className="flex-1 min-h-0 border border-white/10 bg-black/40 p-2.5 overflow-y-auto custom-scrollbar">
                  <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-neutral-400 mb-1 sticky top-0 bg-neutral-950/90 py-0.5">
                    Opponent Actions
                  </p>
                  {(liveMatchState.recent_events || []).filter((e: any) => !e.is_player).length === 0 ? (
                    <p className="text-xs font-sans italic text-neutral-500 py-4 text-center">
                      No actions logged yet
                    </p>
                  ) : (
                    (liveMatchState.recent_events || [])
                      .filter((e: any) => !e.is_player)
                      .slice()
                      .reverse()
                      .map((e: any, idx: number) => renderFeedItem(e, idx))
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Row: Last Action Ticker */}
            <div className="p-3 border border-white/10 bg-white/[0.02] flex items-center gap-3 shrink-0">
              <span className="ms ms-instant text-sm text-amber-400 shrink-0" />
              <span className="text-xs font-mono uppercase tracking-wider text-neutral-500 shrink-0">
                Last Action:
              </span>
              <span className="text-xs font-mono font-bold truncate text-white">
                {liveMatchState.last_event ? (
                  <>
                    <span
                      style={{
                        color: liveMatchState.last_event.is_player
                          ? accentColor
                          : '#FBBF24',
                      }}
                    >
                      {liveMatchState.last_event.is_player
                        ? 'YOU'
                        : (liveMatchState.opponent_name || 'OPPONENT').toUpperCase()}
                    </span>
                    <span className="text-neutral-400">
                      {' '}
                      {liveMatchState.last_event.type === 'draw'
                        ? 'DREW A CARD'
                        : 'PLAYED A CARD'}
                    </span>
                  </>
                ) : (
                  <span className="text-neutral-500 italic">Awaiting first combat or spell action...</span>
                )}
              </span>
            </div>
          </div>
        ) : (
          /* IDLE / WAITING FOR MATCH STATE */
          <div className="flex-1 relative flex flex-col items-center justify-center overflow-hidden">
            {/* Watermark Logo */}
            <img
              src={logoImg}
              alt=""
              className="absolute top-[14%] left-1/2 -translate-x-1/2 w-[50%] object-contain opacity-15 grayscale"
            />

            {/* IDLE / WAITING FOR MATCH BANNER */}
            <div className="relative z-10 px-10 py-4 border border-white/20 bg-black/80 backdrop-blur-md shadow-2xl">
              <span className="text-lg font-bold font-display tracking-[0.16em] uppercase text-white">
                Idle · Waiting for Match
              </span>
            </div>

            {/* Diminished Icon Symbol */}
            <img
              src={symbolIcon}
              alt=""
              className="absolute bottom-[8%] left-1/2 -translate-x-1/2 w-[22%] object-contain opacity-10 grayscale"
            />

            {/* Launch prompt at the bottom */}
            <div className="absolute bottom-8 left-0 right-0 z-10 text-center">
              <p className="text-xs font-mono text-neutral-400 uppercase tracking-wider">
                Launch a match on MTG Arena to begin live tracking
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveHUDView;
