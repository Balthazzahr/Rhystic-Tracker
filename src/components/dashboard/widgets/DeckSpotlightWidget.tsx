import React, { useMemo } from "react";
import { WidgetProps } from "../types";
import { WidgetShell } from "../WidgetShell";
import CardImage from "../../CardImage";

const renderColorPips = (colors: string[], size: number = 12) => {
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

export const DeckSpotlightWidget: React.FC<WidgetProps> = ({
  widget,
  deckOverview,
  customColors,
  onSelectDeck,
}) => {
  const eligibleDecks = useMemo(
    () =>
      (deckOverview || []).filter(
        (d) =>
          (d.total_matches || 0) >= 10 && (parseFloat(d.winrate) || 0) >= 50,
      ),
    [deckOverview],
  );

  const spotlight = useMemo(() => {
    if (eligibleDecks.length > 0) {
      const idx =
        Math.floor(Date.now() / (5 * 60 * 1000)) % eligibleDecks.length;
      return eligibleDecks[idx];
    }
    return (deckOverview || [])[0] || null;
  }, [eligibleDecks, deckOverview]);

  // Resolve deck art name matching the Deck Box / Deck Library view
  const deckArtName = useMemo(() => {
    if (!spotlight) return "";
    return (
      spotlight.custom_art_name ||
      spotlight.top_commander_name ||
      spotlight.top_card_name ||
      ""
    );
  }, [spotlight]);

  // Deterministic tape angle derived from deck name
  const tapeAngle = useMemo(() => {
    let h = 0;
    const str = spotlight?.deck_name || "";
    for (let i = 0; i < str.length; i++) {
      h = (h << 5) - h + str.charCodeAt(i);
      h |= 0;
    }
    const abs = Math.abs(h);
    const raw = ((abs % 1000) / 1000) * 4.8 - 2.4;
    return Math.abs(raw) < 0.6 ? (raw < 0 ? -1.3 : 1.3) : Number(raw.toFixed(2));
  }, [spotlight?.deck_name]);

  // Deck format label
  const deckFormat = useMemo(() => {
    if (!spotlight?.formats || spotlight.formats.length === 0) return "Constructed";
    const first = spotlight.formats[0];
    return typeof first === "string" ? first : first.format || "Constructed";
  }, [spotlight]);

  // Custom colors for Deck Spotlight
  const positiveColor = customColors?.deckSpotlight?.positive || "#10B981";
  const negativeColor = customColors?.deckSpotlight?.negative || "#EF4444";
  const wrNum = parseFloat(String(spotlight?.winrate || "0").replace(/%/g, "")) || 0;
  const winRateColor = wrNum >= 50 ? positiveColor : negativeColor;

  // Mana curve aggregation
  const curveData = useMemo(() => {
    const raw: number[] = spotlight?.mana_curve || [];
    if (!raw || raw.length === 0) return null;
    const counts = raw.slice(1, 8); // CMC 1 through 7+
    const maxVal = Math.max(...counts, 1);
    return { counts, maxVal };
  }, [spotlight?.mana_curve]);

  // Full-shell background node extending behind header and body
  const backgroundNode = spotlight && (
    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
      {deckArtName ? (
        <CardImage
          name={deckArtName}
          version="art_crop"
          alt={deckArtName}
          className="w-full h-full object-cover object-center scale-105 filter blur-[0.2px]"
        />
      ) : (
        <div className="w-full h-full bg-neutral-900" />
      )}
      {/* Subtle translucent overlays allowing the artwork to show brightly behind header & body */}
      <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/90 via-neutral-950/40 to-neutral-950/20" />
      <div className="absolute inset-0 bg-black/10" />
    </div>
  );

  return (
    <WidgetShell
      title="Deck Spotlight"
      isEmpty={!spotlight}
      emptyMessage="No qualifying deck recorded (requires 10+ games and 50%+ win rate)."
      className="relative overflow-hidden cursor-pointer group"
      headerClassName="bg-black/25 backdrop-blur-xs px-4 pt-3 pb-2 -mx-4 -mt-4 border-b border-white/10 cursor-pointer"
      background={backgroundNode}
    >
      {spotlight && (
        <div
          onClick={() => onSelectDeck(spotlight.deck_name)}
          className="w-full h-full flex flex-col justify-between relative z-10 min-h-0 pt-1 select-none cursor-pointer"
          title={`Open ${spotlight.deck_name} in Deck Inspector`}
        >
          {/* Top Section: Title on Tape with Mana Pips Centered */}
          <div className="flex items-center justify-center w-full">
            <div
              className="transition-transform group-hover:scale-[1.02] active:scale-[0.98] inline-flex items-center max-w-full"
            >
              <div
                className="px-3.5 py-1.5 max-w-full flex items-center gap-2 relative select-none"
                style={{
                  background:
                    "linear-gradient(178deg, rgba(248, 244, 230, 0.94) 0%, rgba(238, 232, 214, 0.90) 100%)",
                  boxShadow:
                    "0 2px 6px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.6), inset 0 -1px 0 rgba(0, 0, 0, 0.1)",
                  clipPath:
                    "polygon(0% 4%, 2% 16%, 0.5% 32%, 2.5% 48%, 0% 64%, 2% 80%, 0.5% 96%, 98% 98%, 99.5% 82%, 97.5% 66%, 100% 50%, 98% 34%, 99.5% 18%, 97.5% 2%)",
                  transform: `rotate(${tapeAngle}deg)`,
                }}
              >
                {renderColorPips(spotlight.colors || [], 14)}
                <span
                  className="tracking-wide truncate uppercase leading-tight text-[#141418] text-base sm:text-lg font-bold"
                  style={{
                    fontFamily:
                      '"Permanent Marker", "Outfit", cursive, sans-serif',
                    textShadow:
                      "0 0 1px rgba(20, 20, 24, 0.6), 0 0.5px 0.5px rgba(0, 0, 0, 0.4)",
                    letterSpacing: "0.02em",
                  }}
                >
                  {spotlight.deck_name}
                </span>
              </div>
            </div>
          </div>

          {/* Bottom Section: Stacked Win Rate & Taller Borderless Transparent Mana Curve */}
          <div className="flex flex-wrap items-end justify-between gap-3 pt-3 border-t border-white/10">
            {/* Stacked Win Rate */}
            <div className="flex flex-col justify-end">
              <div className="text-[10px] font-sans text-neutral-400 font-medium uppercase tracking-wider">
                Win Rate
              </div>
              <div
                className="text-2xl sm:text-3xl font-display font-bold tabular-nums tracking-wide leading-none my-0.5"
                style={{ color: winRateColor }}
              >
                {String(spotlight.winrate || "").replace(/%/g, "")}%
              </div>
              <div className="text-[11px] font-sans text-neutral-400 tabular-nums">
                {spotlight.total_matches} games played
              </div>
            </div>

            {/* Mana Curve Mini Histogram (No curve text, no border, transparent background, taller bars) */}
            {curveData && (
              <div className="flex items-end gap-1.5 h-14 bg-black/20 px-2 py-1 rounded-xs">
                {curveData.counts.map((count: number, idx: number) => {
                  const cmc = idx + 1;
                  const heightPct =
                    curveData.maxVal > 0
                      ? (count / curveData.maxVal) * 100
                      : 0;
                  return (
                    <div
                      key={cmc}
                      className="flex flex-col items-center justify-end h-full gap-0.5"
                      title={`CMC ${cmc >= 7 ? "7+" : cmc}: ${count} cards`}
                    >
                      <div
                        className="w-2.5 sm:w-3 hover:brightness-125 transition-all rounded-t-[1px]"
                        style={{
                          height: `${Math.max(
                            count > 0 ? 4 : 0,
                            Math.round((heightPct / 100) * 38),
                          )}px`,
                          backgroundColor: positiveColor,
                        }}
                      />
                      <span className="text-[8px] font-mono text-neutral-400 leading-none">
                        {cmc >= 7 ? "7+" : cmc}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </WidgetShell>
  );
};
