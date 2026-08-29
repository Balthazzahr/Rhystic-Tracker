import React, { useState, useEffect } from 'react';
import { X, Trophy } from 'lucide-react';
import { CustomDropdown } from './CustomDropdown';
import { ManaFontPip } from './ManaFontPip';
import { parseMtgaManaCost } from '../utils/manaUtils';
import { AchievementBadge } from './AchievementBadge';
import { setCardStylePref } from '../utils/cardStylePrefs';
import { CardImage } from './CardImage';

interface CardInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  deckCardOverlay: any;
  palette: any;
  overlayPrintings: any[];
  overlayPrintingsLoading: boolean;
  overlaySelected: string | null;
  setOverlaySelected: (val: string | null) => void;
  overlayScryfall: any;
  overlayScryfallLoading: boolean;
  overlayFlavors: Record<string, string>;
  overlayStats: any;
  setOverlayStats: React.Dispatch<React.SetStateAction<any>>;
  setDeckCardOverlay: React.Dispatch<React.SetStateAction<any>>;
  onSelectDeck: (deckName: string) => void;
  onOpenTrophyCase: () => void;
  onStyleChanged?: () => void;
}

const normalizeScryfallSetCode = (code?: string): string => {
  if (!code) return '';
  const s = String(code).trim().toLowerCase();
  if (s === 'conf') return 'con';
  return s;
};

const cleanCollectorNumber = (cn?: string | number): string => {
  if (cn === undefined || cn === null) return '';
  const s = String(cn).replace(/['"]/g, '').trim();
  return s === '' || s === '0' ? '' : s;
};

const printingKey = (p: any) =>
  `${normalizeScryfallSetCode(p.set_code)}|${cleanCollectorNumber(p.collector_number)}`;

const scryfallPrintingImageUrl = (name: string, p?: any): string => {
  const setCode = normalizeScryfallSetCode(p?.set_code);
  const cn = cleanCollectorNumber(p?.collector_number);
  if (setCode && cn) {
    return `https://api.scryfall.com/cards/${encodeURIComponent(setCode)}/${encodeURIComponent(cn)}?format=image&version=normal`;
  }
  return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=normal`;
};

const cardRarityLabel = (r: number): string => {
  const labels: Record<number, string> = {
    1: 'Land',
    2: 'Common',
    3: 'Uncommon',
    4: 'Rare',
    5: 'Mythic',
  };
  return labels[r] ?? '—';
};

const cardRarityColor = (r: number): string => {
  const colors: Record<number, string> = {
    1: '#9CA3AF',
    2: '#E5E7EB',
    3: '#CBD5E1',
    4: '#D4AF37',
    5: '#F97316',
  };
  return colors[r] ?? '#9CA3AF';
};

export const CardInspectorModal: React.FC<CardInspectorModalProps> = ({
  isOpen,
  onClose,
  deckCardOverlay,
  palette,
  overlayPrintings,
  overlayPrintingsLoading,
  overlaySelected,
  setOverlaySelected,
  overlayScryfall,
  overlayScryfallLoading,
  overlayFlavors,
  overlayStats,
  setOverlayStats,
  setDeckCardOverlay,
  onSelectDeck,
  onOpenTrophyCase,
  onStyleChanged,
}) => {
  const [overlayImgTriedNamed, setOverlayImgTriedNamed] = useState(false);
  const [overlayImgFailed, setOverlayImgFailed] = useState(false);

  const cardName = deckCardOverlay?.card?.name || 'Card';

  useEffect(() => {
    setOverlayImgFailed(false);
    setOverlayImgTriedNamed(false);
  }, [cardName, isOpen, overlaySelected]);

  if (!isOpen || !deckCardOverlay) return null;

  const accentColor = palette?.accent || '#A855F7';
  const selPrinting = overlayPrintings.find((p) => printingKey(p) === overlaySelected);
  const rarity = selPrinting?.rarity ?? deckCardOverlay.card.rarity;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-xl animate-fade-in select-none"
      onClick={onClose}
    >
      <div
        className="flex flex-col items-center max-h-full overflow-y-auto custom-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button Bar */}
        <button
          onClick={onClose}
          className="self-end mb-2 flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider font-bold text-neutral-400 hover:text-white p-1.5 border border-white/10 hover:border-white/20 bg-neutral-900/60 hover:bg-neutral-800 transition-colors cursor-pointer"
          title="Close (Esc)"
        >
          <X className="w-4 h-4" /> Close
        </button>

        {/* 3-CARD ROW CONTAINER */}
        <div className="flex flex-row flex-nowrap items-start justify-center gap-5 max-w-full">
          {/* ========================================================================= */}
          {/* PANEL 1: Card image preview + Set / Art Selector                         */}
          {/* ========================================================================= */}
          <div className="w-[420px] max-w-[90vw] shrink-0 flex flex-col">
            <CardImage
              key={`${cardName}:${selPrinting?.set_code || ''}:${selPrinting?.collector_number || ''}`}
              name={cardName}
              version="normal"
              printing={selPrinting ? { setCode: selPrinting.set_code, collectorNumber: selPrinting.collector_number } : undefined}
              className="w-full aspect-[2.5/3.5] shadow-2xl block border border-white/20"
              alt={cardName}
            />

            {/* Set / Art Selector Underneath */}
            <div className="mt-3 shrink-0">
              <p className="text-[9.5px] font-mono uppercase tracking-wider text-neutral-400 mb-1">
                Card Style / Set
              </p>
              <CustomDropdown
                options={
                  overlayPrintings.length === 0
                    ? [
                        {
                          value: '',
                          label: overlayPrintingsLoading ? 'Loading printings…' : 'No printings found',
                        },
                      ]
                    : overlayPrintings.map((p) => ({
                        value: printingKey(p),
                        label: p.set_name ? `${p.set_name} (${p.set_code})` : p.set_code,
                      }))
                }
                value={overlaySelected ?? ''}
                onChange={(val) => {
                  setOverlaySelected(val || null);
                  setOverlayImgFailed(false);
                  setOverlayImgTriedNamed(false);
                  if (val) {
                    const p = overlayPrintings.find((pp) => printingKey(pp) === val);
                    if (p?.set_code && p.collector_number) {
                      setCardStylePref(cardName, {
                        setCode: p.set_code,
                        collectorNumber: p.collector_number,
                      });
                      onStyleChanged?.();
                      window.dispatchEvent(
                        new CustomEvent('rhystic-card-style-changed', {
                          detail: {
                            name: cardName,
                            setCode: p.set_code,
                            collectorNumber: p.collector_number,
                          },
                        })
                      );
                    }
                  }
                }}
                palette={palette}
              />
            </div>
          </div>

          {/* ========================================================================= */}
          {/* PANEL 2: Card Metadata, Oracle Text + Standalone Achievements Box         */}
          {/* ========================================================================= */}
          <div className="hidden min-[920px]:flex w-[390px] max-w-full max-h-[720px] overflow-y-auto custom-scrollbar flex-col gap-3 shrink-0">
            {/* Metadata & Oracle Box */}
            <div className="border border-white/15 bg-neutral-950/90 backdrop-blur-md p-4 space-y-3.5 shrink-0 flex flex-col shadow-xl">
              <div className="space-y-2.5">
                {/* Title & Mana Cost */}
                <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2.5">
                  <h3 className="text-base font-bold font-display uppercase tracking-wide text-white leading-tight">
                    {cardName}
                  </h3>
                  <span className="shrink-0 flex items-center gap-0.5">
                    {parseMtgaManaCost(deckCardOverlay.card.mana_cost || '').map((s, i) => (
                      <ManaFontPip key={i} symbol={s} size={16} />
                    ))}
                  </span>
                </div>

                {deckCardOverlay.isCommander && (
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 border border-purple-500/30 bg-purple-500/10 text-purple-300 inline-block">
                    Commander
                  </span>
                )}
                {deckCardOverlay.card.card_type && (
                  <p className="text-xs font-mono uppercase text-neutral-400">
                    {deckCardOverlay.card.card_type}
                  </p>
                )}

                {/* Rarity, Set, Decks Grid */}
                <div className="grid grid-cols-3 gap-2 pt-1 border-t border-b border-white/10 py-2">
                  <div>
                    <p className="text-[9px] font-mono uppercase text-neutral-500">Rarity</p>
                    <p
                      className="text-xs font-mono font-bold truncate"
                      style={{ color: cardRarityColor(rarity) }}
                    >
                      {cardRarityLabel(rarity)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-mono uppercase text-neutral-500">Set</p>
                    <p className="text-xs font-mono font-bold truncate text-white uppercase">
                      {selPrinting?.set_name
                        ? `${selPrinting.set_code}`
                        : selPrinting?.set_code || deckCardOverlay.card.set_code || '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-mono uppercase text-neutral-500">Decks</p>
                    <p className="text-xs font-mono font-bold tabular-nums text-white">
                      {overlayStats ? overlayStats.deck_count : '—'}
                    </p>
                  </div>
                </div>

                {/* Decks Present In Chips */}
                {overlayStats?.decks?.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-mono uppercase text-neutral-400 font-bold">
                      Decks Present In:
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {overlayStats.decks.slice(0, 12).map((d: string, i: number) => (
                        <button
                          key={i}
                          onClick={() => {
                            onClose();
                            onSelectDeck(d);
                          }}
                          className="text-[9.5px] font-mono uppercase px-1.5 py-0.5 border border-white/10 bg-black/40 hover:bg-white/10 text-neutral-300 hover:text-white transition-colors cursor-pointer"
                          title={`Open ${d}`}
                        >
                          {d}
                        </button>
                      ))}
                      {overlayStats.decks.length > 12 && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 text-neutral-500">
                          +{overlayStats.decks.length - 12} more
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Scryfall Details Loading */}
                {overlayScryfallLoading && (
                  <div className="flex items-center gap-2 py-1 text-xs font-mono text-neutral-400">
                    <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white animate-spin rounded-full" />
                    <span>Loading oracle text…</span>
                  </div>
                )}

                {/* Oracle & Flavor Details */}
                {overlayScryfall &&
                  (() => {
                    const scry = overlayScryfall;
                    const face = scry.card_faces?.[0] || null;
                    const oracleText = scry.oracle_text || face?.oracle_text || '';
                    const flavorText = (overlaySelected && overlayFlavors[overlaySelected]) || '';
                    const power = scry.power ?? face?.power;
                    const toughness = scry.toughness ?? face?.toughness;
                    const loyalty = scry.loyalty ?? face?.loyalty;
                    const keywords: string[] = scry.keywords || [];
                    return (
                      <>
                        {oracleText && (
                          <div className="space-y-0.5">
                            <p className="text-[9.5px] font-mono uppercase text-neutral-500">Oracle Text</p>
                            <p className="font-plantin text-xs whitespace-pre-wrap text-neutral-200 leading-relaxed">
                              {oracleText}
                            </p>
                          </div>
                        )}
                        {flavorText && (
                          <div className="space-y-0.5">
                            <p className="text-[9.5px] font-mono uppercase text-neutral-500">Flavor Text</p>
                            <p className="font-plantin text-xs italic text-neutral-400 leading-relaxed">
                              {flavorText}
                            </p>
                          </div>
                        )}
                        {(power !== undefined ||
                          toughness !== undefined ||
                          loyalty !== undefined) && (
                          <div className="flex items-center gap-3 pt-1 text-xs font-mono font-bold text-amber-400">
                            {power !== undefined && toughness !== undefined && (
                              <span>P/T: {power}/{toughness}</span>
                            )}
                            {loyalty !== undefined && <span>Loyalty: {loyalty}</span>}
                          </div>
                        )}
                        {keywords.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {keywords.map((kw: string, i: number) => (
                              <span
                                key={i}
                                className="text-[9px] font-mono px-1.5 py-0.2 border border-white/10 bg-black/40 text-neutral-400"
                              >
                                {kw}
                              </span>
                            ))}
                          </div>
                        )}
                      </>
                    );
                  })()}
              </div>

              {/* Ownership 4-Diamond Selector Pinned at Bottom */}
              <div className="mt-3 pt-2.5 shrink-0 border-t border-white/10">
                <div className="flex items-center justify-between py-1.5 px-3 border border-white/10 bg-black/40">
                  <span className="text-[10px] font-mono uppercase font-bold text-neutral-400">
                    Owned Copies
                  </span>
                  <div className="flex items-center gap-2.5">
                    {[1, 2, 3, 4].map((slot) => {
                      const curOwned =
                        overlayStats?.owned_count ?? deckCardOverlay?.card?.owned_count ?? 0;
                      const isFilled = slot <= curOwned;
                      return (
                        <button
                          key={slot}
                          onClick={async () => {
                            const newCount = slot === 1 && curOwned === 1 ? 0 : slot;
                            const targetGrp =
                              deckCardOverlay.card.grp_id || overlayPrintings[0]?.grp_id;
                            if (!targetGrp) return;
                            setOverlayStats((prev: any) =>
                              prev ? { ...prev, owned_count: newCount } : { owned_count: newCount }
                            );
                            setDeckCardOverlay((prev: any) =>
                              prev ? { ...prev, card: { ...prev.card, owned_count: newCount } } : prev
                            );
                            try {
                              const { invoke } = await import('@tauri-apps/api/core');
                              await invoke('update_collection_card_count', {
                                grpId: targetGrp,
                                count: newCount,
                              });
                              onStyleChanged?.();
                              window.dispatchEvent(
                                new CustomEvent('rhystic-collection-updated', {
                                  detail: { grpId: targetGrp, count: newCount },
                                })
                              );
                            } catch (err) {
                              console.error('Failed to update card ownership:', err);
                            }
                          }}
                          className="group p-0.5 transition-transform hover:scale-125 focus:outline-none cursor-pointer"
                          title={`Set ${slot} copy owned`}
                        >
                          <span
                            className="inline-block w-2.5 h-2.5 rotate-45 transition-colors border"
                            style={{
                              backgroundColor: isFilled ? accentColor : 'transparent',
                              borderColor: isFilled ? accentColor : '#64748B',
                              boxShadow: isFilled ? `0 0 6px ${accentColor}88` : 'none',
                            }}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Standalone Card Achievements Box (Below Metadata) */}
            {overlayStats?.lifetime_titles && Object.keys(overlayStats.lifetime_titles).length > 0 && (
              <div className="border border-white/15 bg-neutral-950/90 backdrop-blur-md p-3.5 space-y-2.5 shrink-0 shadow-xl">
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <p className="text-xs font-mono font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <span className="ms ms-ability-duels-renowned" />
                    <span>Card Achievements</span>
                  </p>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 border border-amber-500/30 bg-amber-500/10 text-amber-400 tabular-nums">
                    {Object.values(overlayStats.lifetime_titles).reduce((a: any, b: any) => a + b, 0)} Total
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 pt-0.5">
                  {Object.entries(overlayStats.lifetime_titles).map(
                    ([title, count]: [string, any]) => (
                      <AchievementBadge key={title} title={title} count={count} size="md" />
                    )
                  )}
                </div>
                <div className="pt-2 border-t border-white/10">
                  <button
                    onClick={onOpenTrophyCase}
                    className="w-full py-1.5 px-3 border border-white/15 bg-black/40 hover:bg-white/10 text-xs font-mono font-bold uppercase tracking-wider text-white transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    title="Open Card Trophy Case"
                  >
                    <Trophy className="w-3.5 h-3.5 text-amber-400" />
                    <span>Show All Achievements</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ========================================================================= */}
          {/* PANEL 3: Persistent Card Combat Analytics                                 */}
          {/* ========================================================================= */}
          <div className="hidden min-[1320px]:flex w-[390px] max-w-full max-h-[720px] overflow-y-auto custom-scrollbar border border-white/15 bg-neutral-950/90 backdrop-blur-md p-4 space-y-3.5 shrink-0 flex-col shadow-xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-white">
                Card Combat Analytics
              </h3>
              {overlayStats?.best_deck && (
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 uppercase">
                  MVP: {overlayStats.best_deck.name}
                </span>
              )}
            </div>

            {/* 4 KPI Grid */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 border border-white/10 bg-black/40 space-y-0.5">
                <p className="text-[9px] font-mono uppercase text-neutral-500">Matches Played</p>
                <p className="text-sm font-mono font-bold tabular-nums text-white">
                  {overlayStats?.matches_played ?? 0}
                </p>
              </div>
              <div className="p-2 border border-white/10 bg-black/40 space-y-0.5">
                <p className="text-[9px] font-mono uppercase text-neutral-500">Win Rate When Cast</p>
                <p
                  className={`text-sm font-mono font-bold tabular-nums ${
                    (overlayStats?.win_rate ?? 0) >= 50
                      ? 'text-emerald-400'
                      : overlayStats?.matches_played
                      ? 'text-rose-400'
                      : 'text-neutral-400'
                  }`}
                >
                  {overlayStats?.matches_played
                    ? `${overlayStats.win_rate}% (${overlayStats.wins_when_played}W - ${overlayStats.losses_when_played}L)`
                    : '—'}
                </p>
              </div>
              <div className="p-2 border border-white/10 bg-black/40 space-y-0.5">
                <p className="text-[9px] font-mono uppercase text-neutral-500">Total Damage Dealt</p>
                <p className="text-sm font-mono font-bold tabular-nums text-amber-400">
                  {overlayStats?.total_damage ?? 0} DMG
                  {(overlayStats?.max_hit ?? 0) > 0 && (
                    <span className="text-[10px] font-normal opacity-70 ml-1">
                      (max {overlayStats.max_hit})
                    </span>
                  )}
                </p>
              </div>
              <div className="p-2 border border-white/10 bg-black/40 space-y-0.5">
                <p className="text-[9px] font-mono uppercase text-neutral-500">Impactful Games</p>
                <p className="text-sm font-mono font-bold tabular-nums text-white">
                  {overlayStats?.times_impactful ?? 0}
                </p>
              </div>
            </div>

            {/* Opening Hand & Mulligan Profile */}
            <div className="p-2.5 border border-white/10 bg-black/40 space-y-2">
              <div className="flex items-center justify-between text-[10px] font-mono uppercase font-bold text-neutral-300">
                <span className="flex items-center gap-1">Mulligan Profile</span>
                {overlayStats?.mulligan_stats?.opener_matches > 0 && (
                  <span className="text-emerald-400 tabular-nums">
                    {overlayStats.mulligan_stats.opener_win_rate}% In-Hand WR
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-1.5 text-center">
                <div className="p-1.5 border border-white/10 bg-black/60">
                  <p className="text-[8px] font-mono uppercase text-neutral-500">Keep Rate</p>
                  <p className="text-xs font-mono font-bold text-sky-400">
                    {overlayStats?.mulligan_stats?.keep_rate ?? 0}%
                  </p>
                  <p className="text-[8px] font-mono text-neutral-500 tabular-nums">
                    {overlayStats?.mulligan_stats?.times_kept ?? 0}K /{' '}
                    {overlayStats?.mulligan_stats?.times_mulliganed ?? 0}M
                  </p>
                </div>
                <div className="p-1.5 border border-white/10 bg-black/60">
                  <p className="text-[8px] font-mono uppercase text-neutral-500">Bottomed</p>
                  <p className="text-xs font-mono font-bold text-amber-400">
                    {overlayStats?.mulligan_stats?.times_bottomed ?? 0}
                  </p>
                  <p className="text-[8px] font-mono text-neutral-500">London</p>
                </div>
                <div className="p-1.5 border border-white/10 bg-black/60">
                  <p className="text-[8px] font-mono uppercase text-neutral-500">Opener WR</p>
                  <p
                    className={`text-xs font-mono font-bold ${
                      (overlayStats?.mulligan_stats?.opener_win_rate ?? 0) >= 50
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {overlayStats?.mulligan_stats?.opener_matches
                      ? `${overlayStats.mulligan_stats.opener_win_rate}%`
                      : '—'}
                  </p>
                  <p className="text-[8px] font-mono text-neutral-500 tabular-nums">
                    {overlayStats?.mulligan_stats?.opener_wins ?? 0}W -{' '}
                    {(overlayStats?.mulligan_stats?.opener_matches ?? 0) -
                      (overlayStats?.mulligan_stats?.opener_wins ?? 0)}
                    L
                  </p>
                </div>
              </div>
            </div>

            {/* Damage Target Distribution */}
            <div className="p-2.5 border border-white/10 bg-black/40 space-y-2">
              <div className="flex items-center justify-between text-[10px] font-mono uppercase font-bold text-neutral-300">
                <span>Damage Target Split</span>
                <span className="tabular-nums">{overlayStats?.total_damage ?? 0} Total DMG</span>
              </div>
              {overlayStats && overlayStats.total_damage > 0 ? (
                (() => {
                  const face = overlayStats.damage_to_player || 0;
                  const perm = overlayStats.damage_to_permanents || 0;
                  const total = face + perm > 0 ? face + perm : 1;
                  const facePct = Math.round((face / total) * 100);
                  const permPct = 100 - facePct;
                  return (
                    <div className="space-y-1.5">
                      <div className="h-2 w-full flex border border-white/10 overflow-hidden bg-neutral-900">
                        <div
                          className="bg-amber-400 h-full transition-all"
                          style={{ width: `${facePct}%` }}
                        />
                        <div
                          className="bg-purple-400 h-full transition-all"
                          style={{ width: `${permPct}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] font-mono">
                        <span className="text-amber-400">
                          Opponent Face: {face} ({facePct}%)
                        </span>
                        <span className="text-purple-400">
                          Permanents: {perm} ({permPct}%)
                        </span>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="py-2 text-center text-xs font-mono text-neutral-500">
                  No damage recorded
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CardInspectorModal;
