import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { WidgetProps } from "../types";
import { WidgetShell } from "../WidgetShell";
import { AchievementBadge } from "../../AchievementBadge";
import { CardImage } from "../../CardImage";

export const RecentAchievementsWidget: React.FC<WidgetProps> = ({
  widget,
  onInspectAchievement,
}) => {
  const [recentAchievements, setRecentAchievements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const width = widget.width || 6;
  const isCompact = width <= 4;

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const res: any = await invoke("get_global_achievements");
        if (!isMounted || !res?.achievements) return;
        const allEarnedCards: any[] = [];
        for (const ach of res.achievements) {
          for (const card of ach.cards || []) {
            allEarnedCards.push({
              achievement: ach.achievement,
              tier: card.highest_tier || ach.highest_tier || "bronze",
              cardName: card.card_name,
              grpId: card.grp_id,
              count: card.count,
              earnedAt: card.earned_at || "",
              rawAch: ach,
            });
          }
        }
        allEarnedCards.sort((a, b) =>
          (b.earnedAt || "").localeCompare(a.earnedAt || ""),
        );
        const limit = widget.settings?.limit || 4;
        setRecentAchievements(allEarnedCards.slice(0, limit));
      } catch (err) {
        console.error("Failed to load achievements in widget:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [widget.settings?.limit]);

  return (
    <WidgetShell
      title="RECENT ACHIEVEMENTS"
      subtitle={!isCompact && recentAchievements.length > 0 ? "Latest earned badges" : undefined}
      isEmpty={!loading && recentAchievements.length === 0}
      emptyMessage="No earned achievements recorded yet."
      isLoading={loading}
    >
      <div className="flex flex-col space-y-2 w-full flex-1 overflow-y-auto custom-scrollbar pr-0.5">
        {recentAchievements.map((item, idx) => (
          <div
            key={`${item.achievement}-${item.cardName}-${idx}`}
            onClick={() => onInspectAchievement?.(item.rawAch)}
            title={`${item.achievement} (${item.cardName})`}
            className="flex items-center justify-between gap-3 p-2 bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] transition-colors cursor-pointer group rounded-xs"
          >
            {/* Left: 2x Large Badge + Achievement Name & Card Name */}
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="shrink-0 flex items-center justify-center w-8 h-7">
                <AchievementBadge
                  title={item.achievement}
                  tier={item.tier}
                  count={item.count}
                  size="lg"
                  showTitle={false}
                  showCount={false}
                />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-display font-bold text-xs uppercase tracking-wide text-neutral-100 group-hover:text-white truncate">
                  {item.achievement}
                </span>
                {item.cardName && (
                  <span className="text-[11px] font-sans text-neutral-400 group-hover:text-neutral-300 truncate">
                    {item.cardName}
                  </span>
                )}
              </div>
            </div>

            {/* Right: Card artwork crop thumbnail */}
            <div className="w-8 h-8 shrink-0 overflow-hidden border border-white/15 shadow-sm bg-neutral-900 rounded-xs">
              <CardImage
                name={item.cardName}
                version="art_crop"
                className="w-full h-full object-cover group-hover:scale-110 transition-transform"
              />
            </div>
          </div>
        ))}
      </div>
    </WidgetShell>
  );
};
