import React, { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Sparkles, Skull, Flame, Trophy, ExternalLink } from "lucide-react";
import { WidgetProps } from "../types";
import { WidgetShell } from "../WidgetShell";
import CardImage from "../../CardImage";

interface CardCorrelation {
  grp_id: number;
  name: string;
  total_games: number;
  wins: number;
  losses: number;
  win_rate: number;
}

export const LuckyCursedCardsWidget: React.FC<WidgetProps> = React.memo(({
  widget,
  winLossMatches,
  palette,
  onShowCard,
  customColors,
  isLoading = false,
}) => {
  const accentColor = palette?.accent || "#38BDF8";
  const winColor = customColors?.trendingWinRate?.win || "#10B981";
  const lossColor = customColors?.trendingWinRate?.loss || "#EF4444";

  const [correlations, setCorrelations] = useState<CardCorrelation[]>([]);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    setFetching(true);
    invoke<CardCorrelation[]>("get_card_win_correlations")
      .then((res) => {
        setCorrelations(res || []);
      })
      .catch((err) => {
        console.error("Failed to load card win correlations", err);
      })
      .finally(() => setFetching(false));
  }, [winLossMatches]);

  const { luckyCards, cursedCards, totalAnalyzed } = useMemo(() => {
    if (!correlations || correlations.length === 0) {
      return { luckyCards: [], cursedCards: [], totalAnalyzed: 0 };
    }

    // Filter cards with at least 2 games
    const valid = correlations.filter((c) => c.name && c.name !== "Unknown" && c.total_games >= 2);

    // Lucky: Sort by win rate desc, then total games desc
    const lucky = [...valid].sort((a, b) => {
      if (b.win_rate !== a.win_rate) return b.win_rate - a.win_rate;
      return b.total_games - a.total_games;
    });

    // Cursed: Sort by win rate asc, then total games desc
    const cursed = [...valid].sort((a, b) => {
      if (a.win_rate !== b.win_rate) return a.win_rate - b.win_rate;
      return b.total_games - a.total_games;
    });

    return {
      luckyCards: lucky.slice(0, 2),
      cursedCards: cursed.slice(0, 2),
      totalAnalyzed: valid.length,
    };
  }, [correlations]);

  const hasData = luckyCards.length > 0 || cursedCards.length > 0;

  return (
    <WidgetShell
      title="Lucky Charms & Cursed Spells"
      subtitle="Win rate correlation when drawn & played"
      icon={<Sparkles className="w-3.5 h-3.5" style={{ color: accentColor }} />}
      isLoading={isLoading || fetching}
      isEmpty={!hasData}
      emptyMessage="No card performance data recorded yet"
    >
      <div className="flex-1 flex flex-col justify-between select-none min-h-0 pt-1 space-y-2.5">
        {/* Split Container: Left = Lucky, Right = Cursed */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1 items-stretch">
          {/* Column 1: Lucky Charms */}
          <div className="flex flex-col space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-sans font-bold uppercase tracking-wider text-emerald-400">
              <Trophy className="w-3.5 h-3.5" /> Lucky Charms (Highest WR)
            </div>

            <div className="space-y-2 flex-1 justify-center flex flex-col">
              {luckyCards.map((card) => (
                <div
                  key={`lucky-${card.grp_id}`}
                  onClick={() => onShowCard?.({ name: card.name, grp_id: card.grp_id }, false)}
                  className="flex items-center gap-2.5 p-2 bg-emerald-950/20 border border-emerald-500/30 hover:border-emerald-400 hover:bg-emerald-900/30 transition-all cursor-pointer group"
                  title="Click to view card details"
                >
                  <div className="w-10 h-10 border border-emerald-500/40 overflow-hidden shrink-0 bg-neutral-900 shadow">
                    <CardImage
                      name={card.name}
                      version="art_crop"
                      alt={card.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-xs font-sans font-bold text-white truncate group-hover:text-emerald-300 transition-colors leading-tight">
                      {card.name}
                    </span>
                    <div className="flex items-center gap-2 mt-0.5 font-mono text-[11px] tabular-nums">
                      <span className="font-bold text-emerald-400">
                        {card.win_rate.toFixed(0)}% WR
                      </span>
                      <span className="text-neutral-400 text-[10px]">
                        ({card.wins}W - {card.losses}L)
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Column 2: Cursed Spells */}
          <div className="flex flex-col space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-sans font-bold uppercase tracking-wider text-rose-400">
              <Skull className="w-3.5 h-3.5" /> Cursed Spells (Lowest WR)
            </div>

            <div className="space-y-2 flex-1 justify-center flex flex-col">
              {cursedCards.map((card) => (
                <div
                  key={`cursed-${card.grp_id}`}
                  onClick={() => onShowCard?.({ name: card.name, grp_id: card.grp_id }, false)}
                  className="flex items-center gap-2.5 p-2 bg-rose-950/20 border border-rose-500/30 hover:border-rose-400 hover:bg-rose-900/30 transition-all cursor-pointer group"
                  title="Click to view card details"
                >
                  <div className="w-10 h-10 border border-rose-500/40 overflow-hidden shrink-0 bg-neutral-900 shadow">
                    <CardImage
                      name={card.name}
                      version="art_crop"
                      alt={card.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-xs font-sans font-bold text-white truncate group-hover:text-rose-300 transition-colors leading-tight">
                      {card.name}
                    </span>
                    <div className="flex items-center gap-2 mt-0.5 font-mono text-[11px] tabular-nums">
                      <span className="font-bold text-rose-400">
                        {card.win_rate.toFixed(0)}% WR
                      </span>
                      <span className="text-neutral-400 text-[10px]">
                        ({card.wins}W - {card.losses}L)
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footnote */}
        <div className="flex items-center justify-between text-[10px] font-mono text-neutral-400 pt-1 border-t border-white/5">
          <span>Based on {totalAnalyzed} cards played in ≥2 matches</span>
          <span>Click any card to inspect</span>
        </div>
      </div>
    </WidgetShell>
  );
});

LuckyCursedCardsWidget.displayName = "LuckyCursedCardsWidget";
