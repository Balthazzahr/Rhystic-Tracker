import React, { useMemo } from "react";
import { WidgetProps } from "../types";
import { WidgetShell } from "../WidgetShell";
import { CardNameTooltip } from "../../CardNameTooltip";

const scryfallCardUrl = (name: string) =>
  `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=normal`;

const scryfallArtUrl = (name: string) =>
  `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=art_crop`;

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
  onSelectDeck,
  onShowCard,
}) => {
  const width = widget.width || 5;
  const height = widget.height || 3;
  const isSmall = width <= 4 || height <= 2;

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

  const spotlightIsBrawl = useMemo(
    () =>
      (spotlight?.formats || []).some((f: any) =>
        String(f.format || "")
          .toLowerCase()
          .includes("brawl"),
      ),
    [spotlight],
  );

  const spotlightMarquee = useMemo(() => {
    if (!spotlight) return null;
    if (spotlightIsBrawl && spotlight.top_commander_name) {
      return {
        name: spotlight.top_commander_name,
        grp_id: spotlight.top_commander_grp_id,
        isCommander: true,
      };
    }
    const keys: any[] = spotlight.key_cards || [];
    const best = keys.reduce<any | null>(
      (acc, k) => (!acc || (k.cmc || 0) > (acc.cmc || 0) ? k : acc),
      null,
    );
    if (best)
      return { name: best.name, grp_id: best.grp_id, isCommander: false };
    if (spotlight.top_card_name)
      return {
        name: spotlight.top_card_name,
        grp_id: spotlight.top_card_grp_id,
        isCommander: false,
      };
    return null;
  }, [spotlight, spotlightIsBrawl]);

  const spotlightKeyCards = useMemo(() => {
    if (!spotlight) return [];
    const BASIC_LANDS = new Set([
      "Plains",
      "Island",
      "Swamp",
      "Mountain",
      "Forest",
      "Snow-Covered Plains",
      "Snow-Covered Island",
      "Snow-Covered Swamp",
      "Snow-Covered Mountain",
      "Snow-Covered Forest",
      "Wastes",
    ]);
    const rawKeys: any[] = spotlight.key_cards || [];
    const nonLandKeys = rawKeys.filter((k) => !BASIC_LANDS.has(k.name));

    const cardsList: any[] = spotlight.cards || spotlight.main_deck || [];
    const addedNames = new Set(nonLandKeys.map((k) => k.name));
    if (spotlightMarquee) addedNames.add(spotlightMarquee.name);

    const extraCards = cardsList.filter(
      (c) => !BASIC_LANDS.has(c.name) && !addedNames.has(c.name),
    );
    const maxCards = isSmall ? 4 : 8;
    return [...nonLandKeys, ...extraCards].slice(0, maxCards);
  }, [spotlight, spotlightMarquee, isSmall]);

  return (
    <WidgetShell
      title="DECK SPOTLIGHT"
      subtitle={!isSmall && spotlight ? "Top performing active deck" : undefined}
      isEmpty={!spotlight}
      emptyMessage="No qualifying deck recorded (requires 10+ games and 50%+ win rate)."
    >
      {spotlight && (
        <div className="flex gap-3.5 items-start w-full pt-1 flex-1 min-h-0 overflow-hidden">
          {/* Featured / Marquee Commander Card */}
          {spotlightMarquee && (
            <div
              className={`shrink-0 overflow-hidden cursor-zoom-in group shadow-2xl transition-all hover:scale-105 border border-white/10 bg-neutral-900 rounded-xs ${
                isSmall
                  ? "w-[110px] h-[154px]"
                  : "w-[155px] sm:w-[172px] h-[217px] sm:h-[240px]"
              }`}
              onClick={(e) => {
                e.stopPropagation();
                onShowCard(
                  {
                    name: spotlightMarquee.name,
                    grp_id: spotlightMarquee.grp_id,
                  },
                  spotlightMarquee.isCommander,
                );
              }}
            >
              <img
                src={scryfallCardUrl(spotlightMarquee.name)}
                alt={spotlightMarquee.name}
                className="w-full h-full object-cover"
                loading="lazy"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.src = scryfallArtUrl(spotlightMarquee.name);
                }}
              />
            </div>
          )}

          {/* Deck Info & Notable Cards */}
          <div className="min-w-0 flex-1 flex flex-col justify-start gap-2.5 self-start">
            <div>
              <div
                onClick={() => onSelectDeck(spotlight.deck_name)}
                className={`font-display font-bold text-white truncate leading-tight cursor-pointer hover:underline ${
                  isSmall ? "text-base sm:text-lg" : "text-xl sm:text-2xl"
                }`}
                title={spotlight.deck_name}
              >
                {spotlight.deck_name}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                {renderColorPips(spotlight.colors || [], 11)}
                {spotlightMarquee?.isCommander && (
                  <span className="text-[11px] font-sans text-neutral-400 truncate opacity-80">
                    {spotlightMarquee.name}
                  </span>
                )}
              </div>
              <div className="text-[11px] font-sans text-neutral-300 mt-1 tabular-nums">
                {spotlight.total_matches} games <span className="opacity-40">·</span>{" "}
                <span className="font-semibold text-white">
                  {String(spotlight.winrate || "").replace(/%/g, "")}% WR
                </span>
              </div>
            </div>

            {/* Notable Cards Grid */}
            {spotlightKeyCards.length > 0 && (
              <div className="mt-1">
                <div className="text-[9px] font-sans uppercase tracking-wider text-neutral-400 mb-1 opacity-80 font-medium">
                  NOTABLE CARDS IN DECK
                </div>
                <div
                  className={`grid gap-1.5 w-fit ${
                    isSmall ? "grid-cols-4" : "grid-cols-4"
                  }`}
                >
                  {spotlightKeyCards.map((k: any) => (
                    <div
                      key={k.grp_id ?? k.name}
                      className={`shrink-0 ${
                        isSmall ? "w-[36px] h-[50px]" : "w-[46px] h-[64px]"
                      }`}
                    >
                      <CardNameTooltip name={k.name}>
                        <div
                          className={`w-full h-full overflow-hidden border border-white/15 cursor-zoom-in hover:scale-105 transition-transform shadow-md bg-neutral-900 rounded-xs`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onShowCard({ name: k.name, grp_id: k.grp_id }, false);
                          }}
                        >
                          <img
                            src={scryfallCardUrl(k.name)}
                            alt={k.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.src = scryfallArtUrl(k.name);
                            }}
                          />
                        </div>
                      </CardNameTooltip>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </WidgetShell>
  );
};
