import React, { useMemo } from "react";
import { Lightbulb } from "lucide-react";
import { WidgetProps } from "../types";
import { WidgetShell } from "../WidgetShell";
import { ManaPip } from "../../ManaPip";

const renderColorPips = (colors: string[], size: number = 11) => {
  if (!colors || colors.length === 0) {
    return <i className="ms ms-c ms-cost ms-shadow text-neutral-400" style={{ fontSize: `${size}px` }} />;
  }
  return (
    <div className="flex items-center gap-0.5">
      {colors.map((c, i) => (
        <i
          key={i}
          className={`ms ms-${c.toLowerCase()} ms-cost ms-shadow`}
          style={{ fontSize: `${size}px` }}
        />
      ))}
    </div>
  );
};

export const FunFactsWidget: React.FC<WidgetProps> = ({
  widget,
  winLossMatches,
  deckOverview,
  palette,
  onSelectDeck,
  onShowCard,
}) => {
  const accentColor = palette?.accent || "#38bdf8";

  const funFacts = useMemo(() => {
    const onPlay = winLossMatches.filter((m) => m.going_first === true).length;
    const onDraw = winLossMatches.filter((m) => m.going_first === false).length;
    const playTotal = onPlay + onDraw;
    const playWins = winLossMatches.filter(
      (m) => m.going_first === true && m.result === "win"
    ).length;
    const drawWins = winLossMatches.filter(
      (m) => m.going_first === false && m.result === "win"
    ).length;

    // Arch nemesis: worst win rate opponent commander, min 10 games (fallback 5)
    const agg = new Map<
      string,
      {
        name: string;
        count: number;
        wins: number;
        grp_id?: number;
        colors: string[];
        _freq?: Map<string, number>;
      }
    >();
    for (const m of winLossMatches) {
      const name = m.opponent_commander_name;
      if (!name) continue;
      const e = agg.get(name) || { name, count: 0, wins: 0, colors: [] };
      e.count++;
      if (m.result === "win") e.wins++;
      if (m.opponent_commander_id && !e.grp_id) e.grp_id = m.opponent_commander_id;
      if (m.opponent_colors && m.opponent_colors.length > 0) {
        const key = [...m.opponent_colors].sort().join("");
        if (!e._freq) e._freq = new Map<string, number>();
        e._freq.set(key, (e._freq.get(key) || 0) + 1);
      }
      agg.set(name, e);
    }
    let nemesis: {
      name: string;
      count: number;
      winrate: number;
      grp_id?: number;
      colors: string[];
    } | null = null;
    for (const e of agg.values()) {
      if (e.count < 10) continue;
      const wr = (e.wins / e.count) * 100;
      if (!nemesis || wr < nemesis.winrate) {
        let colors: string[] = [];
        if (e._freq) {
          const top = [...e._freq.entries()].sort((a, b) => b[1] - a[1])[0];
          if (top) colors = top[0].split("");
        }
        nemesis = {
          name: e.name,
          count: e.count,
          winrate: wr,
          grp_id: e.grp_id,
          colors,
        };
      }
    }

    // Longest streaks
    const chrono = [...winLossMatches].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    let cur = { type: "", len: 0 };
    let bestWin = { len: 0 };
    let bestLoss = { len: 0 };
    for (const m of chrono) {
      if (cur.type === m.result) cur.len++;
      else cur = { type: m.result, len: 1 };
      if (m.result === "win" && cur.len > bestWin.len) bestWin = { len: cur.len };
      if (m.result === "loss" && cur.len > bestLoss.len) bestLoss = { len: cur.len };
    }

    // Most played deck
    let mostPlayed: any = null;
    for (const d of deckOverview || []) {
      if (!mostPlayed || (d.total_matches || 0) > (mostPlayed.total_matches || 0)) {
        mostPlayed = d;
      }
    }

    // Favorite / Least deck colors
    const matchColorCount: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
    for (const m of winLossMatches) {
      for (const c of m.deck_colors || []) {
        if (c in matchColorCount) matchColorCount[c]++;
      }
    }
    const colorEntries = Object.entries(matchColorCount).sort((a, b) => b[1] - a[1]);
    const favColorMatch = colorEntries[0]?.[1] > 0 ? colorEntries[0] : null;
    const leastColorMatch =
      colorEntries[colorEntries.length - 1]?.[1] >= 0
        ? colorEntries[colorEntries.length - 1]
        : null;

    // Organic speed / turns
    let fastestOrganicWin: { turns: number; duration: number } | null = null;
    let longestGame: { turns: number; duration: number } | null = null;
    let totalTurns = 0;
    let totalSec = 0;
    let validDurationCount = 0;

    for (const m of winLossMatches) {
      if (m.duration_seconds > 0) {
        totalSec += m.duration_seconds;
        totalTurns += m.turns || 0;
        validDurationCount++;
      }
      if (
        m.result === "win" &&
        m.turns > 0 &&
        (!m.result_reason || !m.result_reason.toLowerCase().includes("concede"))
      ) {
        if (!fastestOrganicWin || m.turns < fastestOrganicWin.turns) {
          fastestOrganicWin = { turns: m.turns, duration: m.duration_seconds };
        }
      }
      if (m.turns > 0 && (!longestGame || m.turns > longestGame.turns)) {
        longestGame = { turns: m.turns, duration: m.duration_seconds };
      }
    }

    return {
      totalGames: winLossMatches.length,
      onPlayPct: playTotal > 0 ? (onPlay / playTotal) * 100 : 50,
      playWinRate: onPlay > 0 ? (playWins / onPlay) * 100 : 0,
      drawWinRate: onDraw > 0 ? (drawWins / onDraw) * 100 : 0,
      avgTurns: validDurationCount > 0 ? totalTurns / validDurationCount : 0,
      avgSec: validDurationCount > 0 ? totalSec / validDurationCount : 0,
      fastestOrganicWin,
      longestGame,
      bestWin,
      bestLoss,
      favColorMatch,
      leastColorMatch,
      mostPlayed,
      nemesis,
    };
  }, [winLossMatches, deckOverview]);

  return (
    <WidgetShell
      icon={<Lightbulb className="w-4 h-4 text-amber-300" />}
      title="FUN FACTS"
      subtitle="Play style and matchup telemetry"
      isEmpty={winLossMatches.length === 0}
      emptyMessage="Play matches to unlock personal gameplay facts."
    >
      <div className="space-y-2 text-xs font-sans w-full">
        <div className="flex items-center justify-between">
          <span className="text-neutral-400">Games played</span>
          <span className="font-semibold text-white tabular-nums">
            {funFacts.totalGames.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-neutral-400">On play %</span>
          <span className="font-semibold text-white tabular-nums">
            {funFacts.onPlayPct.toFixed(1)}%
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-neutral-400">Win Rate — Play vs Draw</span>
          <span className="font-semibold text-white tabular-nums">
            {funFacts.playWinRate.toFixed(0)}% / {funFacts.drawWinRate.toFixed(0)}%
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-neutral-400">Average match length</span>
          <span className="font-semibold text-white tabular-nums">
            {funFacts.avgTurns.toFixed(1)} turns ({Math.floor(funFacts.avgSec / 60)}m{" "}
            {Math.floor(funFacts.avgSec % 60)}s)
          </span>
        </div>
        {funFacts.fastestOrganicWin && (
          <div className="flex items-center justify-between">
            <span className="text-neutral-400">Fastest win (no concedes)</span>
            <span className="font-semibold text-emerald-400 tabular-nums">
              Turn {funFacts.fastestOrganicWin.turns} ({Math.floor(funFacts.fastestOrganicWin.duration / 60)}m{" "}
              {Math.floor(funFacts.fastestOrganicWin.duration % 60)}s)
            </span>
          </div>
        )}
        {funFacts.longestGame && (
          <div className="flex items-center justify-between">
            <span className="text-neutral-400">Longest game</span>
            <span className="font-semibold text-amber-300 tabular-nums">
              Turn {funFacts.longestGame.turns} ({Math.floor(funFacts.longestGame.duration / 60)}m{" "}
              {Math.floor(funFacts.longestGame.duration % 60)}s)
            </span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-neutral-400">Longest win streak</span>
          <span className="font-semibold text-white tabular-nums">
            {funFacts.bestWin.len > 0 ? `${funFacts.bestWin.len} games` : "—"}
          </span>
        </div>
        {funFacts.favColorMatch && (
          <div className="flex items-center justify-between">
            <span className="text-neutral-400">Most favorite deck color</span>
            <span className="flex items-center gap-1 font-semibold text-white">
              <ManaPip symbol={funFacts.favColorMatch[0]} size={12} />
              <span>({funFacts.favColorMatch[1]} games)</span>
            </span>
          </div>
        )}
        {funFacts.mostPlayed && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-neutral-400 shrink-0">Most played deck</span>
            <div
              onClick={() => onSelectDeck(funFacts.mostPlayed.deck_name)}
              className="flex items-center gap-1.5 font-semibold text-white truncate max-w-[200px] cursor-pointer hover:underline"
              style={{ color: accentColor }}
            >
              {renderColorPips(funFacts.mostPlayed.colors || [], 11)}
              <span className="truncate">{funFacts.mostPlayed.deck_name}</span>
              <span className="text-neutral-400 font-normal">
                ({funFacts.mostPlayed.total_matches}g)
              </span>
            </div>
          </div>
        )}
        {funFacts.nemesis && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-neutral-400 shrink-0">Arch Nemesis</span>
            <div
              onClick={() =>
                onShowCard(
                  {
                    name: funFacts.nemesis!.name,
                    grp_id: funFacts.nemesis!.grp_id,
                  },
                  true
                )
              }
              className="flex items-center gap-1.5 font-semibold text-white min-w-0 cursor-pointer hover:underline"
            >
              {renderColorPips(funFacts.nemesis.colors || [], 11)}
              <span className="truncate max-w-[180px]" title={funFacts.nemesis.name}>
                {funFacts.nemesis.name}
              </span>
              <span className="text-rose-400 tabular-nums shrink-0">
                ({funFacts.nemesis.winrate.toFixed(0)}% WR)
              </span>
            </div>
          </div>
        )}
      </div>
    </WidgetShell>
  );
};
