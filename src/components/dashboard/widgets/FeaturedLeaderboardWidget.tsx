import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ChevronDown } from "lucide-react";
import { WidgetProps } from "../types";
import { WidgetShell } from "../WidgetShell";
import { CardImage } from "../../CardImage";

const CATEGORIES = [
  {
    key: "combat_single_hit",
    title: "Highest Single-Hit Strike",
    shortTitle: "COMBAT STRIKE",
    description: "Most combat damage dealt in a single swing",
    unit: "dmg",
  },
  {
    key: "combat_match_damage",
    title: "Match Combat Record",
    shortTitle: "MATCH COMBAT",
    description: "Most combat damage dealt in a single game",
    unit: "dmg",
  },
  {
    key: "combat_lifetime_damage",
    title: "Lifetime Combat Dominance",
    shortTitle: "LIFETIME COMBAT",
    description: "Cumulative combat damage across all matches",
    unit: "dmg",
  },
  {
    key: "spell_single_hit",
    title: "Highest Single Cast / Hit",
    shortTitle: "SPELL STRIKE",
    description: "Most non-combat / spell damage in a single cast",
    unit: "dmg",
  },
  {
    key: "spell_match_damage",
    title: "Match Spell Record",
    shortTitle: "MATCH SPELLS",
    description: "Most non-combat / spell damage in a single game",
    unit: "dmg",
  },
  {
    key: "spell_lifetime_damage",
    title: "Lifetime Spell Output",
    shortTitle: "LIFETIME SPELLS",
    description: "Cumulative spell damage across all matches",
    unit: "dmg",
  },
];

export const FeaturedLeaderboardWidget: React.FC<WidgetProps> = ({
  widget,
  onShowCard,
  onUpdateSettings,
}) => {
  const [leaderboards, setLeaderboards] = useState<any>(null);
  const [selectedKey, setSelectedKey] = useState<string>(
    widget.settings?.category || "combat_single_hit"
  );
  const [loading, setLoading] = useState(true);

  const width = widget.width || 6;
  const isCompact = width <= 4;

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const res: any = await invoke("get_global_leaderboards");
        if (!isMounted || !res) return;
        setLeaderboards(res);
      } catch (err) {
        console.error("Failed to load leaderboards in widget:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const activeCategory = CATEGORIES.find((c) => c.key === selectedKey) || CATEGORIES[0];
  const items = leaderboards?.[activeCategory.key]?.slice(0, 5) || [];

  const handleCategoryChange = (key: string) => {
    setSelectedKey(key);
    onUpdateSettings?.({ ...widget.settings, category: key });
  };

  const headerActions = (
    <div className="relative inline-block">
      <select
        value={selectedKey}
        onChange={(e) => handleCategoryChange(e.target.value)}
        className="appearance-none bg-white/[0.04] border border-white/10 text-neutral-300 text-[10px] font-sans font-medium px-2 py-0.5 pr-4 rounded-xs cursor-pointer hover:bg-white/[0.08] focus:outline-none focus:border-white/20 max-w-[120px] sm:max-w-none truncate"
      >
        {CATEGORIES.map((c) => (
          <option key={c.key} value={c.key} className="bg-neutral-900 text-neutral-200">
            {c.title}
          </option>
        ))}
      </select>
      <ChevronDown className="w-2.5 h-2.5 text-neutral-400 absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none" />
    </div>
  );

  const displayTitle = isCompact ? activeCategory.shortTitle : "FEATURED LEADERBOARD";
  const displaySubtitle = !isCompact ? activeCategory.description : undefined;

  return (
    <WidgetShell
      title={displayTitle}
      subtitle={displaySubtitle}
      headerActions={headerActions}
      isEmpty={!loading && items.length === 0}
      emptyMessage="No leaderboard damage records logged yet."
      isLoading={loading}
    >
      <div className="flex flex-col space-y-1.5 w-full flex-1 overflow-y-auto custom-scrollbar">
        {items.map((entry: any, i: number) => (
          <div
            key={entry.grp_id ?? i}
            onClick={() => onShowCard({ name: entry.card_name, grp_id: entry.grp_id }, false)}
            className="flex items-center justify-between gap-2 p-1.5 bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] transition-colors cursor-pointer group text-xs font-sans rounded-xs"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`w-3.5 text-center font-bold font-mono text-[11px] shrink-0 ${
                  i === 0
                    ? "text-amber-400"
                    : i === 1
                    ? "text-slate-300"
                    : i === 2
                    ? "text-amber-700"
                    : "text-neutral-500"
                }`}
              >
                #{i + 1}
              </span>
              <div className="w-5 h-5 shrink-0 overflow-hidden border border-white/10 bg-neutral-900 rounded-xs">
                <CardImage
                  name={entry.card_name}
                  version="art_crop"
                  className="w-full h-full object-cover"
                />
              </div>
              <span className="font-medium text-neutral-200 group-hover:text-white truncate">
                {entry.card_name}
              </span>
            </div>
            <span className="font-bold text-white tabular-nums shrink-0 text-[11px]">
              {entry.value} {activeCategory.unit}
            </span>
          </div>
        ))}
      </div>
    </WidgetShell>
  );
};
