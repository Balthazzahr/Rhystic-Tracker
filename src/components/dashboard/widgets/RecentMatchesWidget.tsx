import React, { useMemo } from "react";
import { Swords } from "lucide-react";
import { WidgetProps } from "../types";
import { WidgetShell } from "../WidgetShell";
import { CardNameTooltip } from "../../CardNameTooltip";

const scryfallArtUrl = (name: string) =>
  `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=art_crop`;

const formatTimeAgo = (ts: string): string => {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
};

export const RecentMatchesWidget: React.FC<WidgetProps> = ({
  widget,
  winLossMatches,
  deckOverview,
  palette,
  onSelectMatch,
  onShowCard,
  customColors,
  isLoading = false,
}) => {
  const accentColor = palette?.accent || "#38BDF8";
  const width = widget.width || 5;
  const isCompact = width <= 4;
  const isUltraCompact = width <= 3;

  const recentMatches = useMemo(() => {
    return [...winLossMatches]
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      )
      .slice(0, 50);
  }, [winLossMatches]);

  const deckKeyCardsMap = useMemo(() => {
    const map = new Map<string, Array<{ name: string; grp_id?: number }>>();
    for (const d of deckOverview || []) {
      if (d.deck_name && d.key_cards) {
        map.set(d.deck_name, d.key_cards);
      }
    }
    return map;
  }, [deckOverview]);

  const getDeckArt = (deckName: string, commanderName?: string) => {
    if (commanderName) return commanderName;
    const d = (deckOverview || []).find((item) => item.deck_name === deckName);
    if (d) {
      if (d.top_commander_name) return d.top_commander_name;
      if (d.key_cards && d.key_cards.length > 0) return d.key_cards[0].name;
      if (d.top_card_name) return d.top_card_name;
    }
    return null;
  };

  return (
    <WidgetShell
      title="Recent Matches"
      subtitle={`${recentMatches.length} matches`}
      icon={<Swords className="w-3.5 h-3.5" style={{ color: accentColor }} />}
      isLoading={isLoading}
      isEmpty={recentMatches.length === 0}
      emptyMessage="No recent matches recorded"
    >
      <div className="flex-1 min-h-0 h-full overflow-y-auto custom-scrollbar divide-y divide-white/5 pr-1">
        {recentMatches.map((m) => {
          const isWin = m.result === "win";
          const deckArt = getDeckArt(m.player_deck_name, m.player_commander_name);
          const keyCards = (deckKeyCardsMap.get(m.player_deck_name) || []).slice(0, 3);
          const outcomeColor = isWin
            ? customColors?.recentMatches?.win || "#10B981"
            : customColors?.recentMatches?.loss || "#EF4444";

          return (
            <div
              key={m.match_id}
              onClick={() => onSelectMatch(m.match_id)}
              className="py-1.5 px-1.5 flex items-center justify-between gap-3 cursor-pointer group hover:bg-white/[0.03] transition-colors"
            >
              {/* Left: Indicator + Art + Matchup + Format badge */}
              <div className="flex items-center gap-2.5 min-w-0 flex-1 pl-0.5">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{
                    backgroundColor: outcomeColor,
                    boxShadow: isWin ? `0 0 6px rgba(16,185,129,0.6)` : "none",
                  }}
                />
                {!isUltraCompact && deckArt && (
                  <div className="w-6 h-6 shrink-0 overflow-hidden border border-white/10 shadow-sm bg-neutral-900 rounded-xs">
                    <img
                      src={scryfallArtUrl(deckArt)}
                      alt={m.player_deck_name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.visibility = "hidden";
                      }}
                    />
                  </div>
                )}
                <div className="flex items-center gap-1.5 truncate text-[13px] min-w-0">
                  <span className="font-semibold text-neutral-100 group-hover:text-white truncate">
                    {m.player_deck_name}
                  </span>
                  {!isCompact && (
                    <>
                      <span className="text-amber-400/80 font-mono text-[10px] uppercase px-0.5 shrink-0">
                        vs
                      </span>
                      <span className="font-semibold truncate" style={{ color: accentColor }}>
                        {m.opponent_name || "Opponent"}
                      </span>
                    </>
                  )}
                </div>
                {!isCompact && m.format_name && (
                  <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400/80 bg-white/[0.03] px-1.5 py-0.5 border border-white/5 shrink-0">
                    {m.format_name}
                  </span>
                )}
              </div>

              {/* Middle-Right: 3 Mini Impactful Card Portraits (hidden when <= 4 cols) */}
              {!isCompact && keyCards.length > 0 && (
                <div className="hidden min-[1200px]:flex items-center gap-1 shrink-0 px-1">
                  {keyCards.map((k) => (
                    <CardNameTooltip key={k.grp_id ?? k.name} name={k.name}>
                      <div
                        className="w-5 h-5 shrink-0 overflow-hidden border border-white/10 shadow-sm bg-neutral-900 cursor-zoom-in hover:scale-125 transition-transform"
                        onClick={(e) => {
                          e.stopPropagation();
                          onShowCard({ name: k.name, grp_id: k.grp_id }, false);
                        }}
                      >
                        <img
                          src={scryfallArtUrl(k.name)}
                          alt={k.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.visibility = "hidden";
                          }}
                        />
                      </div>
                    </CardNameTooltip>
                  ))}
                </div>
              )}

              {/* Right: Outcome + Time ago */}
              <div className="shrink-0 flex items-center justify-end gap-1.5 text-right tabular-nums">
                <span
                  className="font-bold text-xs tracking-wider"
                  style={{ color: outcomeColor }}
                >
                  {isWin ? "WIN" : "LOSS"}
                </span>
                <span className="opacity-30 text-[10px]">·</span>
                <span className="text-[11px] text-neutral-400 opacity-80">
                  {formatTimeAgo(m.timestamp)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </WidgetShell>
  );
};
