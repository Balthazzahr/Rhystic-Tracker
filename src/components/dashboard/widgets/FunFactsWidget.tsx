import React, { useMemo, useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { WidgetProps } from "../types";
import { WidgetShell } from "../WidgetShell";
import { ManaPip } from "../../ManaPip";
import CardImage from "../../CardImage";

const FannedCardsGlyph: React.FC<{ size?: number; color?: string; className?: string }> = ({
  size = 14,
  color = "currentColor",
  className = "",
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 100 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`inline-block ${className}`}
  >
    <rect
      x="20"
      y="24"
      width="34"
      height="52"
      rx="3"
      stroke={color}
      strokeWidth="4.5"
      transform="rotate(-18 37 50)"
      fill="none"
    />
    <rect
      x="46"
      y="24"
      width="34"
      height="52"
      rx="3"
      stroke={color}
      strokeWidth="4.5"
      transform="rotate(18 63 50)"
      fill="none"
    />
    <rect
      x="33"
      y="18"
      width="34"
      height="52"
      rx="3"
      stroke={color}
      strokeWidth="4.5"
      fill="none"
    />
    <rect x="38" y="24" width="24" height="24" rx="2" stroke={color} strokeWidth="3" fill="none" />
    <line x1="38" y1="54" x2="58" y2="54" stroke={color} strokeWidth="3" strokeLinecap="round" />
    <line x1="38" y1="60" x2="52" y2="60" stroke={color} strokeWidth="3" strokeLinecap="round" />
  </svg>
);

const getIconClass = (iconName: string): string => {
  if (iconName.startsWith("ss-") || iconName.startsWith("ss ")) {
    return iconName.startsWith("ss ") ? iconName : `ss ${iconName}`;
  }
  return iconName.startsWith("ms ") ? iconName : `ms ${iconName}`;
};

interface FunFactCardData {
  id: string;
  title: string;
  msIcon?: string;
  iconNode?: React.ReactNode;
  iconColor: string;
  heroColor: string;
  heroText?: string;
  subText: string;
  bgIcon?: string;
  bgNode?: React.ReactNode;
  customBg?: React.ReactNode;
  customHero?: React.ReactNode;
  isLongHero?: boolean;
  onClick?: () => void;
  visual?: React.ReactNode;
}

export const FunFactsWidget: React.FC<WidgetProps> = React.memo(({
  widget,
  winLossMatches,
  deckOverview,
  palette,
  onSelectDeck,
  onShowCard,
  onSelectMatch,
  customColors,
  isLoading = false,
}) => {
  const width = widget.width ?? 4;
  const height = widget.height ?? 3;

  // Identify longest match ID for card count retrieval
  const longestMatchId = useMemo(() => {
    let bestId = "";
    let maxTurns = 0;
    for (const m of winLossMatches || []) {
      if (m.turns > maxTurns) {
        maxTurns = m.turns;
        bestId = m.match_id;
      }
    }
    return bestId;
  }, [winLossMatches]);

  const [longestMatchSpells, setLongestMatchSpells] = useState<number | null>(null);

  useEffect(() => {
    if (!longestMatchId) {
      setLongestMatchSpells(null);
      return;
    }
    let isMounted = true;
    invoke<any[]>("get_match_cards", { matchId: longestMatchId })
      .then((cards) => {
        if (!isMounted || !Array.isArray(cards)) return;
        const totalSpells = cards
          .filter((c) => !c.card_type || !c.card_type.includes("Land"))
          .reduce((sum, c) => sum + (c.count || 1), 0);
        setLongestMatchSpells(totalSpells);
      })
      .catch((err) => {
        console.warn("Failed to fetch match cards for longest match:", err);
      });
    return () => {
      isMounted = false;
    };
  }, [longestMatchId]);

  // Compute facts
  const factPool: FunFactCardData[] = useMemo(() => {
    if (!winLossMatches || winLossMatches.length === 0) return [];

    const facts: FunFactCardData[] = [];
    const totalMatches = winLossMatches.length;

    // 1. FASTEST WIN (Genuine non-concession victory: turn >= 4, opponent life <= 0 or non-concession reason)
    let fastestWin: { turns: number; duration: number } | null = null;
    let fastWins = 0;
    for (const m of winLossMatches) {
      if (m.result === "win" && m.turns > 0) {
        const reason = (m.result_reason || "").toLowerCase();
        const isConcession =
          reason.includes("concede") ||
          reason.includes("scoop") ||
          reason.includes("timeout") ||
          reason.includes("disconnect") ||
          reason.includes("surrender") ||
          (m.opponent_life_end !== undefined && m.opponent_life_end !== null && m.opponent_life_end > 0) ||
          m.turns < 4;

        if (!isConcession) {
          const dur = (m.duration_seconds >= 30 && m.duration_seconds <= 3600)
            ? m.duration_seconds
            : (m.turns * 45);
          if (!fastestWin || m.turns < fastestWin.turns || (m.turns === fastestWin.turns && dur < fastestWin.duration)) {
            fastestWin = { turns: m.turns, duration: dur };
          }
          if (m.turns <= 4) fastWins++;
        }
      }
    }
    if (fastestWin) {
      const mins = Math.floor(fastestWin.duration / 60);
      const secs = fastestWin.duration % 60;
      facts.push({
        id: "fastest_win",
        title: "Fastest Win",
        msIcon: "ms-ability-flash",
        iconColor: "#F59E0B",
        heroColor: "#FDE68A",
        bgIcon: "ms-ability-flash",
        heroText: `Turn ${fastestWin.turns}`,
        subText: `${mins}m ${secs}s duration (organic win)`,
      });
    }

    // 2. LONGEST WIN STREAK
    const chrono = [...winLossMatches].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    let curStreak = { type: "", len: 0 };
    let bestWinStreak = 0;
    for (const m of chrono) {
      if (curStreak.type === m.result) curStreak.len++;
      else curStreak = { type: m.result, len: 1 };
      if (m.result === "win" && curStreak.len > bestWinStreak) {
        bestWinStreak = curStreak.len;
      }
    }
    if (bestWinStreak > 0) {
      facts.push({
        id: "win_streak",
        title: "Longest Win Streak",
        msIcon: "ms-ability-renowned",
        iconColor: "#10B981",
        heroColor: "#A7F3D0",
        bgIcon: "ms-ability-renowned",
        heroText: `${bestWinStreak} Games`,
        subText: "Personal best all-time win streak",
      });
    }

    // 3. LOWEST HP VICTORY
    let minWinLife = 999;
    let lowLifeWins = 0;
    for (const m of winLossMatches) {
      if (m.result === "win" && m.player_life_end !== undefined && m.player_life_end !== null) {
        if (m.player_life_end < minWinLife) minWinLife = m.player_life_end;
        if (m.player_life_end <= 5) lowLifeWins++;
      }
    }
    if (minWinLife < 999) {
      facts.push({
        id: "lowest_hp_win",
        title: "Lowest HP Win",
        msIcon: "ms-ability-lifelink",
        iconColor: "#EC4899",
        heroColor: "#FBCFE8",
        bgIcon: "ms-ability-lifelink",
        heroText: `${minWinLife} HP`,
        subText: `${lowLifeWins} wins with 5 or fewer life remaining`,
      });
    }

    // 4. FLAWLESS WINS (>= 20 HP)
    let flawlessCount = 0;
    let totalWins = 0;
    for (const m of winLossMatches) {
      if (m.result === "win") {
        totalWins++;
        if (m.player_life_end !== undefined && m.player_life_end >= 20) {
          flawlessCount++;
        }
      }
    }
    if (flawlessCount > 0) {
      const pct = totalWins > 0 ? (flawlessCount / totalWins) * 100 : 0;
      facts.push({
        id: "flawless_wins",
        title: "Flawless Victories",
        msIcon: "ms-ability-vigilance",
        iconColor: "#10B981",
        heroColor: "#A7F3D0",
        bgIcon: "ms-ability-vigilance",
        heroText: `${flawlessCount} Wins`,
        subText: `${pct.toFixed(0)}% of wins ended at ≥20 HP`,
      });
    }

    // 5. PLAY VS DRAW
    let onPlay = 0, onDraw = 0, playWins = 0, drawWins = 0;
    for (const m of winLossMatches) {
      if (m.going_first === true) {
        onPlay++;
        if (m.result === "win") playWins++;
      } else if (m.going_first === false) {
        onDraw++;
        if (m.result === "win") drawWins++;
      }
    }
    const playWR = onPlay > 0 ? (playWins / onPlay) * 100 : 0;
    const drawWR = onDraw > 0 ? (drawWins / onDraw) * 100 : 0;
    if (onPlay > 0 || onDraw > 0) {
      facts.push({
        id: "play_vs_draw",
        title: "Play vs. Draw",
        msIcon: "ms-untap",
        iconColor: "#38BDF8",
        heroColor: "#BAE6FD",
        bgIcon: "ms-untap",
        heroText: `${playWR.toFixed(0)}% / ${drawWR.toFixed(0)}%`,
        subText: `${playWR.toFixed(0)}% on play · ${drawWR.toFixed(0)}% on draw`,
      });
    }

    // 6. OPPONENT CONCEDES
    let concedesCount = 0;
    for (const m of winLossMatches) {
      if (m.result === "win") {
        const reason = (m.result_reason || "").toLowerCase();
        if (reason.includes("concede") || reason.includes("scoop") || (m.opponent_life_end !== undefined && m.opponent_life_end > 0)) {
          concedesCount++;
        }
      }
    }
    if (concedesCount > 0) {
      const concedePct = totalWins > 0 ? (concedesCount / totalWins) * 100 : 0;
      facts.push({
        id: "opponent_concedes",
        title: "Opponent Concedes",
        msIcon: "ms-counter-skull",
        iconColor: "#F59E0B",
        heroColor: "#FDE68A",
        bgIcon: "ms-counter-skull",
        customHero: (
          <div className="flex flex-col items-center justify-center my-auto">
            <span className="font-mono font-black text-2xl sm:text-3xl tracking-tight leading-none text-[#FDE68A]">
              {concedePct.toFixed(0)}%
            </span>
            <span className="text-[10px] sm:text-[11px] font-sans font-bold tracking-widest uppercase text-amber-300/80 mt-1">
              Quit
            </span>
          </div>
        ),
        subText: `${concedesCount} of ${totalWins} wins ended by concede`,
      });
    }

    // 7. TOUGHEST MATCHUP (Opponent commander with the most losses against, min 10 matches)
    const cmdrMap = new Map<string, { name: string; count: number; wins: number; losses: number; grp_id?: number; colors: string[] }>();
    for (const m of winLossMatches) {
      const name = m.opponent_commander_name;
      if (!name || name === "Unknown Commander") continue;
      const e = cmdrMap.get(name) || { name, count: 0, wins: 0, losses: 0, colors: m.opponent_colors || [] };
      e.count++;
      if (m.result === "win") e.wins++;
      else if (m.result === "loss") e.losses++;
      if (m.opponent_commander_id && !e.grp_id) e.grp_id = m.opponent_commander_id;
      cmdrMap.set(name, e);
    }
    
    // Must be at least 10 games played against (fallback to >= 5 or >= 2 if smaller collection)
    let eligibleCmdrs = Array.from(cmdrMap.values()).filter((c) => c.count >= 10);
    if (eligibleCmdrs.length === 0) {
      eligibleCmdrs = Array.from(cmdrMap.values()).filter((c) => c.count >= 5);
    }
    if (eligibleCmdrs.length === 0) {
      eligibleCmdrs = Array.from(cmdrMap.values()).filter((c) => c.count >= 2);
    }

    // Sort by most losses, then lowest win rate
    eligibleCmdrs.sort((a, b) => {
      if (b.losses !== a.losses) return b.losses - a.losses;
      return (a.wins / a.count) - (b.wins / b.count);
    });

    const toughestCmdr = eligibleCmdrs[0];
    if (toughestCmdr) {
      const wr = Math.round((toughestCmdr.wins / toughestCmdr.count) * 100);
      facts.push({
        id: "toughest_matchup",
        title: "Toughest Matchup",
        msIcon: "ms-chaos",
        iconColor: "#F43F5E",
        heroColor: "#FECDD3",
        bgIcon: "ms-chaos",
        customHero: (
          <div
            className="flex-1 flex items-center justify-center my-auto z-10 w-full h-full min-h-0 py-0.5"
            title={toughestCmdr.name}
          >
            <div className="relative group/cmdr cursor-pointer h-full max-h-full flex items-center justify-center">
              <CardImage
                name={toughestCmdr.name}
                grpId={toughestCmdr.grp_id}
                version="normal"
                className="h-full max-h-[135px] sm:max-h-[160px] md:max-h-[190px] w-auto max-w-full rounded-[4px] object-contain shadow-2xl group-hover/cmdr:scale-105 transition-all duration-200"
                alt={toughestCmdr.name}
              />
            </div>
          </div>
        ),
        subText: `${wr}% WR (${toughestCmdr.losses} losses in ${toughestCmdr.count} matches)`,
        onClick: () => onShowCard({ name: toughestCmdr.name, grp_id: toughestCmdr.grp_id }, true),
      });
    }

    // 8. OPENING HANDS KEPT (0 Mulligans with Fanned Cards Icon)
    let cleanHands = 0;
    let mullTracked = 0;
    for (const m of winLossMatches) {
      if (m.player_mulligans !== undefined && m.player_mulligans !== null) {
        mullTracked++;
        if (m.player_mulligans === 0) cleanHands++;
      }
    }
    if (mullTracked > 0) {
      const cleanPct = (cleanHands / mullTracked) * 100;
      facts.push({
        id: "opening_hands",
        title: "Opening Hand Kept",
        iconNode: <FannedCardsGlyph size={15} color="#818CF8" />,
        iconColor: "#818CF8",
        heroColor: "#C7D2FE",
        bgNode: <FannedCardsGlyph size={86} color="#818CF8" />,
        heroText: `${cleanPct.toFixed(0)}%`,
        subText: `${cleanHands} of ${mullTracked} games kept with 0 mulligans`,
      });
    }

    // 9. LONGEST GAME (Hourglass icon, match duration hero, turn count + spells played)
    let longestMatch: { matchId: string; turns: number; duration: number } | null = null;
    let totalSec = 0;
    let totalTurns = 0;
    let durationCount = 0;
    for (const m of winLossMatches) {
      if (m.duration_seconds >= 30 && m.duration_seconds <= 3600) {
        totalSec += m.duration_seconds;
        totalTurns += m.turns || 0;
        durationCount++;
      }
      if (m.turns > 0 && (!longestMatch || m.turns > longestMatch.turns)) {
        const dur = (m.duration_seconds >= 30 && m.duration_seconds <= 3600)
          ? m.duration_seconds
          : (m.turns * 45);
        longestMatch = { matchId: m.match_id, turns: m.turns, duration: dur };
      }
    }
    if (longestMatch) {
      const mins = Math.floor(longestMatch.duration / 60);
      const secs = longestMatch.duration % 60;
      const durationHero = `${mins}m ${secs > 0 ? `${secs}s` : ""}`.trim();
      const spellSub = longestMatchSpells !== null ? ` · ${longestMatchSpells} spells played` : "";
      const currentLongestId = longestMatch.matchId;
      facts.push({
        id: "longest_game",
        title: "Longest Game",
        msIcon: "ss-tsp",
        iconColor: "#A855F7",
        heroColor: "#E9D5FF",
        bgIcon: "ss-tsp",
        heroText: durationHero,
        subText: `Turn ${longestMatch.turns}${spellSub}`,
        onClick: onSelectMatch ? () => onSelectMatch(currentLongestId) : undefined,
      });
    }

    // 10. AVERAGE GAME LENGTH (Culled Outliers)
    if (durationCount > 0) {
      const avgTurns = totalTurns / durationCount;
      const avgSec = totalSec / durationCount;
      const mins = Math.floor(avgSec / 60);
      const secs = Math.floor(avgSec % 60);
      facts.push({
        id: "average_game_length",
        title: "Average Game Length",
        msIcon: "ms-battle",
        iconColor: "#38BDF8",
        heroColor: "#BAE6FD",
        bgIcon: "ms-battle",
        heroText: `${avgTurns.toFixed(1)} Turns`,
        subText: `${mins}m ${secs}s average match duration`,
      });
    }

    // 11. MOST PLAYED DECK (Deck Box Art + Tape Font from Spotlight)
    let mostPlayedDeck: any = null;
    for (const d of deckOverview || []) {
      if (!mostPlayedDeck || (d.total_matches || 0) > (mostPlayedDeck.total_matches || 0)) {
        mostPlayedDeck = d;
      }
    }
    if (mostPlayedDeck && mostPlayedDeck.total_matches > 0) {
      const deckArt = mostPlayedDeck.custom_art_name || mostPlayedDeck.top_commander_name || mostPlayedDeck.top_card_name;
      const isCompact = width <= 5;
      facts.push({
        id: "most_played_deck",
        title: "Most Played Deck",
        msIcon: "ms-library",
        iconColor: "#38BDF8",
        heroColor: "#BAE6FD",
        customBg: deckArt ? (
          <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none opacity-60 filter blur-[0.2px]">
            <CardImage name={deckArt} version="art_crop" className="w-full h-full object-cover object-center scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/90 via-neutral-950/45 to-neutral-950/30" />
          </div>
        ) : null,
        customHero: (
          <div className="flex-1 flex flex-col items-center justify-center my-auto z-10 w-full min-h-0 py-1">
            <div
              className="px-2.5 py-1 max-w-full flex items-center justify-center gap-1.5 relative select-none shadow-md my-auto"
              style={{
                background: "linear-gradient(178deg, rgba(248, 244, 230, 0.94) 0%, rgba(238, 232, 214, 0.90) 100%)",
                boxShadow: "0 2px 6px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.6), inset 0 -1px 0 rgba(0, 0, 0, 0.1)",
                clipPath: "polygon(0% 4%, 2% 16%, 0.5% 32%, 2.5% 48%, 0% 64%, 2% 80%, 0.5% 96%, 98% 98%, 99.5% 82%, 97.5% 66%, 100% 50%, 98% 34%, 99.5% 18%, 97.5% 2%)",
                transform: "rotate(-1.2deg)",
              }}
            >
              {!isCompact && (
                <div className="flex items-center gap-0.5 shrink-0">
                  {(mostPlayedDeck.colors || []).map((c: string) => (
                    <ManaPip key={c} symbol={c} size={11} />
                  ))}
                </div>
              )}
              <span
                className="tracking-wide uppercase leading-tight text-[#141418] text-xs sm:text-sm font-bold text-center break-words"
                style={{
                  fontFamily: '"Permanent Marker", "Outfit", cursive, sans-serif',
                  letterSpacing: "0.02em",
                }}
              >
                {mostPlayedDeck.deck_name}
              </span>
            </div>
          </div>
        ),
        subText: `${mostPlayedDeck.total_matches} matches played`,
        onClick: () => onSelectDeck(mostPlayedDeck.deck_name),
      });
    }

    // 12. TOP DECK COLOR (Big Mana Pip + Games Below)
    const colorCounts: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
    for (const m of winLossMatches) {
      for (const c of m.deck_colors || []) {
        if (c in colorCounts) colorCounts[c]++;
      }
    }
    const colorEntries = Object.entries(colorCounts).sort((a, b) => b[1] - a[1]);
    const topColor = colorEntries[0];
    if (topColor && topColor[1] > 0) {
      const pct = (topColor[1] / totalMatches) * 100;
      facts.push({
        id: "top_deck_color",
        title: "Top Deck Color",
        msIcon: `ms-${topColor[0].toLowerCase()}`,
        iconColor: "#4ADE80",
        heroColor: "#BBF7D0",
        bgIcon: `ms-${topColor[0].toLowerCase()}`,
        customHero: (
          <div className="flex-1 flex flex-col items-center justify-center my-auto z-10 w-full min-h-0 gap-1 py-1">
            <ManaPip symbol={topColor[0]} size={36} />
            <span className="font-mono font-bold text-sm sm:text-base text-neutral-200 tracking-wide">
              {topColor[1]} Games
            </span>
          </div>
        ),
        subText: `Present in ${pct.toFixed(0)}% of games`,
      });
    }

    // 13. WEEKEND VS WEEKDAY
    let wkndWins = 0, wkndTotal = 0, wkdyWins = 0, wkdyTotal = 0;
    for (const m of winLossMatches) {
      const d = new Date(m.timestamp);
      if (isNaN(d.getTime())) continue;
      const day = d.getDay();
      if (day === 0 || day === 6) {
        wkndTotal++;
        if (m.result === "win") wkndWins++;
      } else {
        wkdyTotal++;
        if (m.result === "win") wkdyWins++;
      }
    }
    if (wkndTotal >= 5 && wkdyTotal >= 5) {
      const wkndWR = (wkndWins / wkndTotal) * 100;
      const wkdyWR = (wkdyWins / wkdyTotal) * 100;
      facts.push({
        id: "weekend_vs_weekday",
        title: "Weekend vs. Weekday",
        msIcon: "ms-dfc-day",
        iconColor: "#F59E0B",
        heroColor: "#FDE68A",
        bgIcon: "ms-dfc-day",
        heroText: `${wkndWR.toFixed(0)}% / ${wkdyWR.toFixed(0)}%`,
        subText: `${wkndWR.toFixed(0)}% weekends · ${wkdyWR.toFixed(0)}% weekdays`,
      });
    }

    // 14. FAST WINS (Turn <= 4 genuine wins excluding concessions)
    if (fastWins > 0) {
      facts.push({
        id: "fast_wins",
        title: "Fast Wins",
        msIcon: "ms-ability-haste",
        iconColor: "#EF4444",
        heroColor: "#FECACA",
        bgIcon: "ms-ability-haste",
        heroText: `${fastWins} Wins`,
        subText: "Wins on Turn ≤4 (excluding concessions)",
      });
    }

    // 15. LETHAL FINISHES (Kills + Crossed Swords Background)
    let lethalCount = 0;
    for (const m of winLossMatches) {
      if (m.result === "win" && m.opponent_life_end !== undefined && m.opponent_life_end !== null && m.opponent_life_end <= 0) {
        lethalCount++;
      }
    }
    if (lethalCount > 0) {
      facts.push({
        id: "lethal_blows",
        title: "Lethal Finishes",
        msIcon: "ms-battle",
        iconColor: "#F43F5E",
        heroColor: "#FECDD3",
        bgIcon: "ms-battle",
        heroText: `${lethalCount} Kills`,
        subText: "Victories reducing opponent life to 0 or less",
      });
    }

    // 16. TOTAL BATTLE TIME (Clock Background)
    if (totalSec > 0) {
      const totalHours = (totalSec / 3600).toFixed(1);
      facts.push({
        id: "total_battle_time",
        title: "Battle Time",
        msIcon: "ms-counter-time",
        iconColor: "#38BDF8",
        heroColor: "#BAE6FD",
        bgIcon: "ms-counter-time",
        heroText: `${totalHours} Hours`,
        subText: "Cumulative match time tracked",
      });
    }

    return facts;
  }, [winLossMatches, deckOverview, onSelectDeck, onShowCard, onSelectMatch, longestMatchSpells]);

  // Dynamic grid configuration matching widget dimensions
  const { cols, rows, cardCount } = useMemo(() => {
    let c = 2;
    if (width <= 3) c = 1;
    else if (width <= 5) c = 2;
    else if (width <= 7) c = 3;
    else if (width <= 11) c = 4;
    else c = 5;

    let r = 1;
    if (height <= 2) r = 1;
    else if (height <= 4) r = 2;
    else if (height <= 6) r = 3;
    else r = 4;

    const count = Math.min(factPool.length || 1, c * r);
    return { cols: c, rows: r, cardCount: count };
  }, [width, height, factPool.length]);

  // Selected random cards indices
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);

  // Shuffle handler
  const shuffleCards = useCallback(() => {
    if (factPool.length === 0) return;
    const indices = Array.from({ length: factPool.length }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    setSelectedIndices(indices.slice(0, cardCount));
  }, [factPool, cardCount]);

  // Initial and reactive shuffle on cardCount or pool change
  useEffect(() => {
    shuffleCards();
  }, [factPool.length, cardCount]);

  const displayedFacts = useMemo(() => {
    if (selectedIndices.length === 0 || factPool.length === 0) return [];
    return selectedIndices.map((idx) => factPool[idx]).filter(Boolean);
  }, [selectedIndices, factPool]);

  return (
    <WidgetShell
      icon={<i className="ms ms-ability-renowned text-amber-300 text-sm leading-none" />}
      title="Fun Facts"
      isEmpty={factPool.length === 0}
      emptyMessage="Play matches to unlock gameplay facts."
      isLoading={isLoading}
      headerActions={
        factPool.length > cardCount ? (
          <button
            onClick={shuffleCards}
            className="p-1 text-neutral-400 hover:text-white hover:bg-white/[0.08] rounded transition-all cursor-pointer flex items-center justify-center"
            title="Show more facts"
            aria-label="Show more facts"
          >
            <i className="ms ms-untap text-xs leading-none text-amber-300/80 hover:text-amber-200" />
          </button>
        ) : null
      }
    >
      <div
        className="gap-2.5 flex-1 min-h-0 select-none items-stretch pt-0.5"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
        }}
      >
        {displayedFacts.map((fact) => (
          <div
            key={fact.id}
            onClick={fact.onClick}
            className={`p-3 bg-white/[0.02] border border-white/10 hover:border-white/20 flex flex-col items-center justify-between text-center transition-all h-full relative overflow-hidden ${
              fact.onClick ? "cursor-pointer hover:bg-white/[0.04]" : ""
            }`}
          >
            {/* Transparent Desaturated Watermark / Background Icon (Matched to Longest Win Streak) */}
            {fact.bgIcon && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0 overflow-hidden">
                <i
                  className={`${getIconClass(fact.bgIcon)} leading-none`}
                  style={{
                    fontSize: "5.5rem",
                    color: fact.iconColor,
                    opacity: 0.22,
                    filter: "saturate(0.65)",
                  }}
                />
              </div>
            )}
            {fact.bgNode && (
              <div
                className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0 overflow-hidden"
                style={{
                  opacity: 0.22,
                  filter: "saturate(0.65)",
                }}
              >
                {fact.bgNode}
              </div>
            )}
            {fact.customBg}

            {/* Top Row: MTGA Font Icon + Title (Centered) */}
            <div className="flex flex-col items-center justify-center gap-1 w-full text-center shrink-0 relative z-10">
              <div className="flex items-center justify-center gap-1.5 min-w-0">
                {fact.iconNode ? (
                  fact.iconNode
                ) : fact.msIcon ? (
                  <i
                    className={`${getIconClass(fact.msIcon)} text-sm shrink-0 leading-none`}
                    style={{ color: fact.iconColor }}
                  />
                ) : null}
                <span className="font-sans text-xs font-semibold text-neutral-300">
                  {fact.title}
                </span>
              </div>
              {fact.visual && <div className="flex items-center justify-center">{fact.visual}</div>}
            </div>

            {/* Middle: Custom Hero Component or Scaled Hero Value */}
            {fact.customHero ? (
              <div className="flex-1 flex flex-col items-center justify-center my-auto w-full min-h-0 relative z-10">
                {fact.customHero}
              </div>
            ) : (
              <div className="my-auto py-1 text-center w-full flex items-center justify-center min-h-0 relative z-10">
                <span
                  className={`font-mono font-black tracking-tight leading-tight block text-center ${
                    fact.isLongHero
                      ? "text-sm sm:text-base md:text-lg truncate max-w-full"
                      : rows === 1
                      ? "text-2xl sm:text-3xl md:text-4xl"
                      : "text-xl sm:text-2xl md:text-3xl"
                  }`}
                  style={{ color: fact.heroColor }}
                  title={fact.heroText}
                >
                  {fact.heroText}
                </span>
              </div>
            )}

            {/* Bottom: Clean Subtext (Centered with Multi-line Wrapping) */}
            <div className="text-[11px] font-mono text-neutral-400 text-center leading-snug break-words w-full px-1 shrink-0 relative z-10">
              {fact.subText}
            </div>
          </div>
        ))}
      </div>
    </WidgetShell>
  );
});

FunFactsWidget.displayName = "FunFactsWidget";
