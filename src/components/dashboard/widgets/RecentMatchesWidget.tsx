import React, { useMemo } from "react";
import { Swords } from "lucide-react";
import { WidgetProps } from "../types";
import { WidgetShell } from "../WidgetShell";
import { CardImage } from "../../CardImage";

const formatTimeAgo = (ts: string): string => {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
};

const formatChipColor = (
  format: string,
): { bg: string; fg: string; border: string } => {
  const f = (format || "").toLowerCase();
  if (f.includes("standard brawl")) {
    return { bg: "#8a719d18", fg: "#b39ec4", border: "#8a719d38" };
  } else if (f.includes("brawl")) {
    return { bg: "#4A7FA318", fg: "#7FAAC9", border: "#4A7FA338" };
  } else if (f.includes("standard")) {
    return { bg: "#B8503A18", fg: "#D57C69", border: "#B8503A38" };
  } else if (f.includes("historic")) {
    return { bg: "#4A785618", fg: "#76A382", border: "#4A785638" };
  } else if (f.includes("timeless")) {
    return { bg: "#8a719d18", fg: "#b39ec4", border: "#8a719d38" };
  } else if (f.includes("alchemy")) {
    return { bg: "#D4A23718", fg: "#E2BF6F", border: "#D4A23738" };
  } else if (f.includes("explorer") || f.includes("pioneer")) {
    return { bg: "#5B699418", fg: "#8C9AC4", border: "#5B699438" };
  } else if (
    f.includes("draft") ||
    f.includes("sealed") ||
    f.includes("limited")
  ) {
    return { bg: "#D4A23718", fg: "#E2BF6F", border: "#D4A23738" };
  } else if (f.includes("bot") || f.includes("sparky")) {
    return { bg: "#3D7D7D18", fg: "#6EA8A8", border: "#3D7D7D38" };
  } else if (
    f.includes("direct") ||
    f.includes("challenge") ||
    f.includes("friendly")
  ) {
    return { bg: "#B8503A18", fg: "#D57C69", border: "#B8503A38" };
  } else if (f.includes("mwm") || f.includes("midweek")) {
    return { bg: "#9E5B8E18", fg: "#C48EB6", border: "#9E5B8E38" };
  } else if (f.includes("gladiator")) {
    return { bg: "#6E8A4218", fg: "#98B36D", border: "#6E8A4238" };
  }
  return { bg: "#94A3B818", fg: "#CBD5E1", border: "#94A3B838" };
};

export const RecentMatchesWidget: React.FC<WidgetProps> = ({
  winLossMatches,
  deckOverview,
  palette,
  onSelectMatch,
  customColors,
  isLoading = false,
}) => {
  const accentColor = palette?.accent || "#38BDF8";

  const recentMatches = useMemo(() => {
    return [...winLossMatches]
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      )
      .slice(0, 50);
  }, [winLossMatches]);

  const getDeckArt = (deckName: string, commanderName?: string) => {
    if (commanderName) return commanderName;
    const d = (deckOverview || []).find((item) => item.deck_name === deckName);
    if (d) {
      if (d.custom_art_name) return d.custom_art_name;
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
          const deckArt = getDeckArt(
            m.player_deck_name,
            m.player_commander_name,
          );
          const outcomeColor = isWin
            ? customColors?.recentMatches?.win || "#10B981"
            : customColors?.recentMatches?.loss || "#EF4444";
          const fmtChip = formatChipColor(m.format_name);

          return (
            <div
              key={m.match_id}
              onClick={() => onSelectMatch(m.match_id)}
              className="py-1.5 px-1.5 flex items-center justify-between gap-3 cursor-pointer group hover:bg-white/[0.04] transition-colors select-none"
            >
              {/* Left: Win/Loss Box + Preview Icon + Matchup */}
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                {/* Win / Loss Box (Fixed width for identical sizing) */}
                <div
                  className="w-12 h-5 rounded-xs flex items-center justify-center font-mono font-bold text-[10px] uppercase tracking-wider shrink-0"
                  style={{
                    backgroundColor: `${outcomeColor}22`,
                    color: outcomeColor,
                    border: `1px solid ${outcomeColor}55`,
                  }}
                >
                  {isWin ? "WIN" : "LOSS"}
                </div>

                {/* Deck Preview Art Icon */}
                {deckArt && (
                  <div className="w-6 h-6 shrink-0 overflow-hidden border border-white/15 shadow-sm bg-neutral-900 rounded-xs">
                    <CardImage
                      name={deckArt}
                      version="art_crop"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                {/* Deck Name vs Opponent Name */}
                <div className="flex items-center gap-1.5 truncate text-[13px] min-w-0">
                  <span className="font-semibold text-neutral-100 group-hover:text-white truncate">
                    {m.player_deck_name}
                  </span>
                  <span className="text-amber-400/80 font-mono text-[10px] uppercase px-0.5 shrink-0">
                    vs
                  </span>
                  <span
                    className="font-semibold truncate"
                    style={{ color: accentColor }}
                  >
                    {m.opponent_name || "Opponent"}
                  </span>
                </div>
              </div>

              {/* Far Right: Time Since Played + Format Badge */}
              <div className="shrink-0 flex items-center justify-end gap-2.5 text-right pl-2">
                <span className="text-[11px] font-sans text-neutral-400 tabular-nums whitespace-nowrap">
                  {formatTimeAgo(m.timestamp)}
                </span>
                {m.format_name && (
                  <span
                    className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-xs shrink-0"
                    style={{
                      backgroundColor: fmtChip.bg,
                      color: fmtChip.fg,
                      border: `1px solid ${fmtChip.border}`,
                    }}
                  >
                    {m.format_name}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </WidgetShell>
  );
};
