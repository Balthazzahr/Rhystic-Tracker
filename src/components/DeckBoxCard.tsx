import React, { useState, useMemo } from 'react';
import CardImage from './CardImage';
import { ManaPip } from './ManaPip';

interface DeckBoxCardProps {
  deck: any;
  width: number;
  height: number;
  palette?: any;
  showFlair?: boolean;
  onSelectDeck: (deckName: string) => void;
  onDeleteDeck?: (deckName: string) => void;
  onOpenCardOverlay?: (card: any, isOpponent: boolean) => void;
  formatChipColor?: (format?: string) => { bg: string; fg: string; border: string } | null;
  winRateColor?: (wr?: string) => string;
  renderDeckColorIdentity?: (colors?: string[], size?: number) => React.ReactNode;
}

// Global SVG clip-path definition for the deck box lid
export const DeckBoxClipDef: React.FC = () => (
  <svg width="0" height="0" className="absolute pointer-events-none w-0 h-0 overflow-hidden" aria-hidden="true">
    <defs>
      <clipPath id="deckBoxLidClip" clipPathUnits="objectBoundingBox">
        <path d="M0,0 L1,0 L1,0.72 C1,0.93 0.68,1 0.5,1 C0.32,1 0,0.93 0,0.72 Z" />
      </clipPath>
      <linearGradient id="upturnedCardboardLip" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="rgba(255, 255, 255, 0.18)" />
        <stop offset="45%" stopColor="rgba(190, 150, 100, 0.22)" />
        <stop offset="100%" stopColor="rgba(70, 45, 20, 0.38)" />
      </linearGradient>
    </defs>
  </svg>
);

export const DeckBoxCard: React.FC<DeckBoxCardProps> = React.memo(({
  deck,
  width,
  height,
  showFlair = true,
  onSelectDeck,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const artName = deck.top_commander_name || deck.top_card_name;
  const colors: string[] = deck.colors || [];
  const isSmallMode = width <= 270;

  // Winrate data for the hand-drawn marker circle
  const winRateStr = deck.winrate || '0%';
  const wrNum = parseFloat(deck.winrate) || 0;
  const hasMatches = (deck.total_matches || 0) > 0;
  const markerColor = hasMatches
    ? wrNum >= 50
      ? '#22C55E' // Bold green marker for >= 50%
      : '#EF4444' // Bold red marker for < 50%
    : '#94A3B8'; // Bold slate marker for 0 games

  // Deterministic styling parameters derived from deck name
  const { tapeAngle, stampAngle, qcAngle, hash } = useMemo(() => {
    let h = 0;
    const str = deck.deck_name || '';
    for (let i = 0; i < str.length; i++) {
      h = (h << 5) - h + str.charCodeAt(i);
      h |= 0;
    }
    const abs = Math.abs(h);
    const raw = ((abs % 1000) / 1000) * 4.8 - 2.4;
    const tAngle = Math.abs(raw) < 0.6 ? (raw < 0 ? -1.3 : 1.3) : Number(raw.toFixed(2));
    
    const stampRaw = (((abs >> 4) % 1000) / 1000) * 7.0 - 3.5;
    const sAngle = Math.abs(stampRaw) < 0.8 ? (stampRaw < 0 ? -2.2 : 2.2) : Number(stampRaw.toFixed(2));

    const qcRaw = (((abs >> 7) % 1000) / 1000) * 24.0 - 12.0;
    const qAngle = Math.abs(qcRaw) < 2.0 ? (qcRaw < 0 ? -6.0 : 6.0) : Number(qcRaw.toFixed(2));

    return { tapeAngle: tAngle, stampAngle: sAngle, qcAngle: qAngle, hash: abs };
  }, [deck.deck_name]);

  // Extract up to 3 cards for the peek-through interior preview (only mounted on hover)
  const peekCards: { name: string; grp_id?: number }[] = useMemo(() => {
    const list: { name: string; grp_id?: number }[] = [];
    if (deck.key_cards && deck.key_cards.length > 0) {
      deck.key_cards.forEach((k: any) => {
        if (k?.name && !list.some((item) => item.name === k.name)) {
          list.push({ name: k.name, grp_id: k.grp_id });
        }
      });
    }
    if (artName && !list.some((item) => item.name === artName)) {
      list.push({ name: artName, grp_id: deck.top_commander_grp_id || deck.top_card_grp_id });
    }
    return list.slice(0, 3);
  }, [deck, artName]);

  // Exact lid height percentage: 56% of total card height
  const lidHeightPct = 56;
  const innerArtHeightPct = 100 / (lidHeightPct / 100); // 178.57% to align with resting body art

  return (
    <div
      style={{
        width,
        height,
        perspective: isHovered ? '1000px' : undefined,
        contain: 'layout paint',
        transform: 'translateZ(0)',
        backfaceVisibility: 'hidden',
      }}
      className="group relative select-none text-left cursor-pointer focus:outline-none shrink-0 bg-transparent"
      onClick={() => onSelectDeck(deck.deck_name)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* --- 1. NARROWER INNER CARDBOARD BODY (INSET BY 6PX WITH PURE BACKGROUND OUTSIDE) --- */}
      <div
        className="absolute top-[2px] bottom-0 inset-x-[6px] bg-neutral-950 overflow-hidden rounded-[3px]"
        style={{
          boxShadow: '0 6px 14px -2px rgba(0,0,0,0.9), inset 1px 0 2px rgba(255, 255, 255, 0.15), inset -1px 0 3px rgba(0, 0, 0, 0.85)',
          transform: 'translateZ(0)',
          backfaceVisibility: 'hidden',
        }}
      >
        {artName ? (
          <CardImage
            name={artName}
            version="art_crop"
            alt={artName}
            className="w-full h-full object-cover relative z-0"
          />
        ) : (
          <div className="w-full h-full bg-neutral-900 relative z-0" />
        )}

        {/* Resting Under-Lip Drop Shadow Cast onto Body Art */}
        <div className="absolute top-[38%] inset-x-0 h-[22%] bg-gradient-to-b from-black/85 via-black/40 to-transparent pointer-events-none opacity-90 z-10" />

        {/* --- OPTIONAL FLAIR: HAND-CIRCLED WIN RATE PERCENTAGE (BOTTOM-LEFT BODY) --- */}
        {showFlair && (
          <div
            className={`absolute bottom-2.5 left-2.5 z-20 pointer-events-none select-none flex items-center justify-center ${
              isSmallMode ? 'w-10 h-10' : 'w-12 h-12'
            }`}
            style={{
              transform: `rotate(${qcAngle}deg)`,
            }}
          >
            {/* Hand-Drawn Grease Pencil / Marker Loop SVG (Background layer) */}
            <svg
              viewBox="0 0 52 52"
              className="absolute -inset-2 w-[calc(100%+16px)] h-[calc(100%+16px)] pointer-events-none overflow-visible z-0"
              aria-hidden="true"
            >
              <path
                d="M 10,26 C 8,12 20,4 30,5 C 42,6 50,15 48,29 C 46,42 32,49 20,47 C 9,45 5,33 10,22 C 12,17 17,13 23,11"
                fill="none"
                stroke={markerColor}
                strokeWidth={isSmallMode ? '2.8' : '3.6'}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ filter: 'drop-shadow(0 1.5px 3px rgba(0, 0, 0, 0.95))' }}
              />
            </svg>

            {/* Bold Handwritten Marker Win Rate Number (On top of the circle) */}
            <span
              className={`leading-none text-white tracking-tight relative z-10 select-none ${
                isSmallMode ? 'text-[13px]' : 'text-[17px]'
              }`}
              style={{
                fontFamily: '"Permanent Marker", "Outfit", cursive, sans-serif',
                textShadow: '0 0 2px #000, 0 1px 3px #000, 0 0 6px #000, 0 0 1px #000',
                letterSpacing: '-0.02em',
              }}
            >
              {hasMatches ? winRateStr : '0%'}
            </span>
          </div>
        )}

        {/* --- OPTIONAL FLAIR: MANA STICKERS (BOTTOM-RIGHT BODY) --- */}
        {showFlair && (
          <div
            className="absolute bottom-2.5 right-2.5 z-20 pointer-events-none select-none flex items-center"
            style={{
              transform: `rotate(${stampAngle}deg)`,
              filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.85))',
            }}
          >
            {colors.length > 0 ? (
              <div className={`flex items-center ${isSmallMode ? '-space-x-1' : '-space-x-1.5'}`}>
                {colors.map((c, i) => {
                  // Random deterministic layer level per pip
                  const layerZ = ((hash + i * 11) % colors.length) + 1;
                  // Random deterministic vertical stagger offset (-2px to +2px)
                  const vOffset = (((hash >> (i * 3)) % 5) - 2) * 1.0;

                  return (
                    <div
                      key={c}
                      className={`rounded-full bg-[#FAF7EE] border border-[#D4C4A0]/80 flex items-center justify-center shrink-0 relative ${
                        isSmallMode ? 'w-[23px] h-[23px] p-[0.5px]' : 'w-[28px] h-[28px] p-[1px]'
                      }`}
                      style={{
                        zIndex: layerZ,
                        transform: `translateY(${vOffset}px)`,
                        boxShadow: 'inset 0 0.5px 0 rgba(255, 255, 255, 0.95), 0 1px 2px rgba(0,0,0,0.35)',
                      }}
                    >
                      <ManaPip symbol={c} size={isSmallMode ? 19 : 24} />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div
                className={`rounded-full bg-[#FAF7EE] border border-[#D4C4A0]/80 flex items-center justify-center shrink-0 ${
                  isSmallMode ? 'w-[23px] h-[23px] p-[0.5px]' : 'w-[28px] h-[28px] p-[1px]'
                }`}
                style={{
                  boxShadow: 'inset 0 0.5px 0 rgba(255, 255, 255, 0.95), 0 1px 2px rgba(0,0,0,0.35)',
                }}
              >
                <ManaPip symbol="C" size={isSmallMode ? 19 : 24} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* --- 2. INTERIOR RECESSED CHAMBER (PEEKING 3 AUTHENTIC CARDS WITH BORDERS & TEXT ON HOVER) --- */}
      <div
        className="absolute top-0 inset-x-[6px] z-10 pointer-events-none overflow-hidden rounded-t-[3px]"
        style={{
          height: `${lidHeightPct}%`,
          clipPath: 'url(#deckBoxLidClip)',
          transform: 'translateZ(0)',
        }}
      >
        {/* Dark Interior Cavity */}
        <div
          className="w-full h-full relative"
          style={{
            background: 'linear-gradient(180deg, #040406 0%, #0a0a0d 40%, #121216 100%)',
            boxShadow: 'inset 0 8px 16px rgba(0, 0, 0, 0.98)',
          }}
        >
          {/* 3 Revealed Cards with Full Borders and Text (version="normal") */}
          {isHovered && (
            <div className="absolute inset-x-2 top-2 bottom-0 flex items-start justify-between gap-1.5 animate-fadeIn">
              {peekCards.map((c, i) => (
                <div
                  key={c.grp_id || c.name || i}
                  className="flex-1 h-[140%] relative rounded-[2px] overflow-hidden border border-white/25 shadow-md bg-neutral-900"
                  style={{
                    transform: i === 0 ? 'rotate(-2.5deg)' : i === 2 ? 'rotate(2.5deg)' : 'none',
                  }}
                >
                  <CardImage
                    name={c.name}
                    version="normal"
                    alt={c.name}
                    className="w-full h-full object-cover object-top"
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60 pointer-events-none" />
                </div>
              ))}
            </div>
          )}

          {/* Top Hinge Ambient Shadow */}
          <div className="absolute inset-x-0 top-0 h-4 bg-gradient-to-b from-black/95 to-transparent pointer-events-none z-10" />
        </div>
      </div>

      {/* --- 3. 3D TILTING LID (FULL OUTER WIDTH OVERHANGING NARROWER BODY) --- */}
      <div
        className="absolute top-0 left-0 right-0 z-20 pointer-events-none"
        style={{
          height: `${lidHeightPct}%`,
          transformOrigin: 'top center',
          transform: 'translateZ(0)',
          backfaceVisibility: 'hidden',
        }}
      >
        {/* Inner 3D Transform Container */}
        <div
          className="w-full h-full relative group-hover:[transform:rotateX(-26deg)_translateY(-3px)]"
          style={{
            transformOrigin: 'top center',
            transition: 'transform 0.35s cubic-bezier(0.2, 0.9, 0.3, 1.2)',
            willChange: isHovered ? 'transform' : 'auto',
          }}
        >
          {/* Clipped Lid Surface with Continuous Artwork */}
          <div
            className="w-full h-full relative overflow-hidden bg-neutral-950 rounded-t-[4px]"
            style={{
              clipPath: 'url(#deckBoxLidClip)',
              boxShadow: '0 4px 10px rgba(0, 0, 0, 0.75)',
            }}
          >
            {/* Top-Left Specular Edge Highlight on the Lid Shell */}
            <div
              className="absolute inset-0 z-10 pointer-events-none rounded-t-[4px]"
              style={{
                boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.25), inset 1px 0 0 rgba(255, 255, 255, 0.12), inset -1px 0 0 rgba(0, 0, 0, 0.6)',
              }}
            />

            {/* --- LIP FOLD / SCORED CARDBOARD HINGE TEXTURE --- */}
            <div
              className="absolute top-0 inset-x-0 h-3.5 pointer-events-none opacity-30 z-10"
              style={{
                background: 'repeating-linear-gradient(180deg, transparent 0px, transparent 2px, rgba(255, 255, 255, 0.22) 2.5px, rgba(0, 0, 0, 0.4) 3.5px)',
                maskImage: 'linear-gradient(180deg, black 60%, transparent 100%)',
                WebkitMaskImage: 'linear-gradient(180deg, black 60%, transparent 100%)',
              }}
            />

            {/* Art image sized to 178.57% to align with the body artwork */}
            {artName ? (
              <div
                className="w-full absolute top-0 left-0"
                style={{ height: `${innerArtHeightPct}%` }}
              >
                <CardImage
                  name={artName}
                  version="art_crop"
                  alt={artName}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div className="w-full h-full bg-neutral-900" />
            )}

            {/* Lid Top Specular Sheen (Subtle surface light) */}
            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.12] via-transparent to-black/20 pointer-events-none" />
          </div>

          {/* Prominent Seam Line & Physical Lip Drop Shadows & Delicate Translucent Upturned Lip Rim */}
          <svg
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
            aria-hidden="true"
          >
            {/* Outer Diffuse Under-Lip Shadow */}
            <path
              d="M0,0.72 C0,0.93 0.32,1 0.5,1 C0.68,1 1,0.93 1,0.72"
              fill="none"
              stroke="rgba(0, 0, 0, 0.95)"
              strokeWidth="0.04"
              vectorEffect="non-scaling-stroke"
              opacity="0.85"
            />
            {/* Core Dark Seam Stroke */}
            <path
              d="M0,0.72 C0,0.93 0.32,1 0.5,1 C0.68,1 1,0.93 1,0.72"
              fill="none"
              stroke="rgba(0, 0, 0, 1.0)"
              strokeWidth="0.02"
              vectorEffect="non-scaling-stroke"
            />

            {/* --- UPTURNED CARDBOARD LIP (THINNER TOWARDS MIDDLE, HIGHLY TRANSLUCENT PRESERVING ART) --- */}
            <path
              d="M0,0.72 C0,0.93 0.32,0.978 0.5,0.978 C0.68,0.978 1,0.93 1,0.72 L1,0.72 C1,0.93 0.68,1.0 0.5,1.0 C0.32,1.0 0,0.93 0,0.72 Z"
              fill="url(#upturnedCardboardLip)"
            />

            {/* Crisp Top-Lip Specular Bevel Highlight */}
            <path
              d="M0,0.72 C0,0.93 0.32,1 0.5,1 C0.68,1 1,0.93 1,0.72"
              fill="none"
              stroke="rgba(255, 255, 255, 0.75)"
              strokeWidth="0.007"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {/* --- DECK NAME ON LID: MASKING TAPE WITH PERMANENT MARKER HANDWRITTEN FONT --- */}
          <div className="absolute top-[18%] inset-x-2 z-30 pointer-events-none flex items-center justify-center">
            <div
              className={`max-w-[94%] flex items-center justify-center relative select-none ${
                isSmallMode ? 'px-2 py-0.5' : 'px-3.5 py-1'
              }`}
              style={{
                background: 'linear-gradient(178deg, rgba(248, 244, 230, 0.90) 0%, rgba(238, 232, 214, 0.86) 100%)',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.4), 0 0 1px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.6), inset 0 -1px 0 rgba(0, 0, 0, 0.08)',
                clipPath: 'polygon(0% 4%, 2% 16%, 0.5% 32%, 2.5% 48%, 0% 64%, 2% 80%, 0.5% 96%, 98% 98%, 99.5% 82%, 97.5% 66%, 100% 50%, 98% 34%, 99.5% 18%, 97.5% 2%)',
                transform: `rotate(${tapeAngle}deg)`,
              }}
            >
              <span
                className={`tracking-wide truncate uppercase leading-tight text-[#141418] ${
                  isSmallMode ? 'text-[13px]' : 'text-[17px]'
                }`}
                style={{
                  fontFamily: '"Permanent Marker", "Outfit", cursive, sans-serif',
                  textShadow: '0 0 1px rgba(20, 20, 24, 0.6), 0 0.5px 0.5px rgba(0, 0, 0, 0.4)',
                  letterSpacing: '0.02em',
                }}
              >
                {deck.deck_name}
              </span>
            </div>
          </div>

        </div>
      </div>

    </div>
  );
});
