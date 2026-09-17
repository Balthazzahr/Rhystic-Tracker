import React, { useMemo } from "react";
import { Shield, Sparkles, Trophy, Skull } from "lucide-react";
import { WidgetProps } from "../types";
import { WidgetShell } from "../WidgetShell";
import { ManaPip } from "../../ManaPip";

interface GuildArchetype {
  key: string;
  name: string;
  colors: string[];
  type: "guild" | "shard" | "wedge" | "mono" | "five";
  wins: number;
  losses: number;
  total: number;
  winRate: number;
}

const GUILD_MAP: Record<string, { name: string; colors: string[]; type: "guild" | "shard" | "wedge" | "mono" | "five" }> = {
  // Guilds (2-color)
  "WU": { name: "Azorius", colors: ["W", "U"], type: "guild" },
  "UB": { name: "Dimir", colors: ["U", "B"], type: "guild" },
  "BR": { name: "Rakdos", colors: ["B", "R"], type: "guild" },
  "RG": { name: "Gruul", colors: ["R", "G"], type: "guild" },
  "GW": { name: "Selesnya", colors: ["G", "W"], type: "guild" },
  "WB": { name: "Orzhov", colors: ["W", "B"], type: "guild" },
  "UR": { name: "Izzet", colors: ["U", "R"], type: "guild" },
  "BG": { name: "Golgari", colors: ["B", "G"], type: "guild" },
  "WR": { name: "Boros", colors: ["W", "R"], type: "guild" },
  "GU": { name: "Simic", colors: ["G", "U"], type: "guild" },
  // Shards / Wedges (3-color)
  "WUB": { name: "Esper", colors: ["W", "U", "B"], type: "shard" },
  "UBR": { name: "Grixis", colors: ["U", "B", "R"], type: "shard" },
  "BRG": { name: "Jund", colors: ["B", "R", "G"], type: "shard" },
  "RGW": { name: "Naya", colors: ["R", "G", "W"], type: "shard" },
  "GWU": { name: "Bant", colors: ["G", "W", "U"], type: "shard" },
  "WBG": { name: "Abzan", colors: ["W", "B", "G"], type: "wedge" },
  "URW": { name: "Jeskai", colors: ["U", "R", "W"], type: "wedge" },
  "BGU": { name: "Sultai", colors: ["B", "G", "U"], type: "wedge" },
  "RWB": { name: "Mardu", colors: ["R", "W", "B"], type: "wedge" },
  "GUR": { name: "Temur", colors: ["G", "U", "R"], type: "wedge" },
  // 5-Color & Monocolor
  "WUBRG": { name: "Five-Color", colors: ["W", "U", "B", "R", "G"], type: "five" },
  "W": { name: "Mono-White", colors: ["W"], type: "mono" },
  "U": { name: "Mono-Blue", colors: ["U"], type: "mono" },
  "B": { name: "Mono-Black", colors: ["B"], type: "mono" },
  "R": { name: "Mono-Red", colors: ["R"], type: "mono" },
  "G": { name: "Mono-Green", colors: ["G"], type: "mono" },
};

function normalizeColorKey(colors?: string[]): string {
  if (!colors || colors.length === 0) return "";
  const wubrg = ["W", "U", "B", "R", "G"];
  const set = new Set(colors.map((c) => c.toUpperCase()));
  return wubrg.filter((c) => set.has(c)).join("");
}

export const GuildMasteryWidget: React.FC<WidgetProps> = React.memo(({
  widget,
  winLossMatches,
  palette,
  customColors,
  isLoading = false,
}) => {
  const accentColor = palette?.accent || "#38BDF8";
  const winColor = customColors?.trendingWinRate?.win || "#10B981";
  const lossColor = customColors?.trendingWinRate?.loss || "#EF4444";

  const { topMastered, bottomStruggling, totalGuildsTracked } = useMemo(() => {
    const map = new Map<string, { wins: number; losses: number }>();

    for (const m of winLossMatches || []) {
      const colors = m.deck_colors;
      const key = normalizeColorKey(colors);
      if (!key) continue;

      const existing = map.get(key) || { wins: 0, losses: 0 };
      if (m.result === "win") existing.wins++;
      else existing.losses++;
      map.set(key, existing);
    }

    const list: GuildArchetype[] = [];
    for (const [key, data] of map.entries()) {
      const def = GUILD_MAP[key] || {
        name: key,
        colors: key.split(""),
        type: "guild" as const,
      };
      const total = data.wins + data.losses;
      if (total === 0) continue;
      list.push({
        key,
        name: def.name,
        colors: def.colors,
        type: def.type,
        wins: data.wins,
        losses: data.losses,
        total,
        winRate: Math.round((data.wins / total) * 1000) / 10,
      });
    }

    // Sort by win rate descending
    const sortedBest = [...list].sort((a, b) => {
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      return b.total - a.total;
    });

    // Sort by win rate ascending
    const sortedWorst = [...list].sort((a, b) => {
      if (a.winRate !== b.winRate) return a.winRate - b.winRate;
      return b.total - a.total;
    });

    return {
      topMastered: sortedBest.slice(0, 3),
      bottomStruggling: sortedWorst.slice(0, 3),
      totalGuildsTracked: list.length,
    };
  }, [winLossMatches]);

  const hasData = topMastered.length > 0;

  return (
    <WidgetShell
      title="Guild & Clan Mastery"
      subtitle="Best & worst performing color combinations"
      icon={<Shield className="w-3.5 h-3.5" style={{ color: accentColor }} />}
      isLoading={isLoading}
      isEmpty={!hasData}
      emptyMessage="No color identity data recorded yet"
    >
      <div className="flex-1 flex flex-col justify-between select-none min-h-0 pt-1 space-y-2.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1 items-stretch">
          {/* Top Mastered */}
          <div className="flex flex-col space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-sans font-bold uppercase tracking-wider text-emerald-400">
              <Trophy className="w-3.5 h-3.5" /> Highest Win Rate Guilds
            </div>
            <div className="space-y-1.5 flex-1 justify-center flex flex-col">
              {topMastered.map((g) => (
                <div
                  key={`best-${g.key}`}
                  className="flex items-center justify-between p-2 bg-white/[0.02] border border-white/10 hover:border-emerald-500/40 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex items-center gap-0.5 shrink-0">
                      {g.colors.map((c) => (
                        <ManaPip key={c} symbol={c} size={16} className="drop-shadow" />
                      ))}
                    </div>
                    <span className="font-sans font-bold text-xs text-white truncate">
                      {g.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 font-mono tabular-nums text-xs shrink-0">
                    <span className="text-neutral-400 text-[10px]">
                      {g.wins}W - {g.losses}L
                    </span>
                    <span
                      className="font-bold text-xs"
                      style={{ color: g.winRate >= 50 ? winColor : lossColor }}
                    >
                      {g.winRate.toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Struggling */}
          <div className="flex flex-col space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-sans font-bold uppercase tracking-wider text-rose-400">
              <Skull className="w-3.5 h-3.5" /> Lowest Win Rate Guilds
            </div>
            <div className="space-y-1.5 flex-1 justify-center flex flex-col">
              {bottomStruggling.map((g) => (
                <div
                  key={`worst-${g.key}`}
                  className="flex items-center justify-between p-2 bg-white/[0.02] border border-white/10 hover:border-rose-500/40 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex items-center gap-0.5 shrink-0">
                      {g.colors.map((c) => (
                        <ManaPip key={c} symbol={c} size={16} className="drop-shadow" />
                      ))}
                    </div>
                    <span className="font-sans font-bold text-xs text-white truncate">
                      {g.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 font-mono tabular-nums text-xs shrink-0">
                    <span className="text-neutral-400 text-[10px]">
                      {g.wins}W - {g.losses}L
                    </span>
                    <span
                      className="font-bold text-xs"
                      style={{ color: g.winRate >= 50 ? winColor : lossColor }}
                    >
                      {g.winRate.toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footnote */}
        <div className="flex items-center justify-between text-[10px] font-mono text-neutral-400 pt-1 border-t border-white/5">
          <span>{totalGuildsTracked} color identities piloted</span>
          <span>Filtered to your decks with logged colors</span>
        </div>
      </div>
    </WidgetShell>
  );
});

GuildMasteryWidget.displayName = "GuildMasteryWidget";
