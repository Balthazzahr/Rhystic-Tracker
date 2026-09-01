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
  const [, setOverlayImgTriedNamed] = useState(false);
  const [, setOverlayImgFailed] = useState(false);

  const cardName = deckCardOverlay?.card?.name || 'Card';

  useEffect(() => {
    setOverlayImgFailed(false);
    setOverlayImgTriedNamed(false);
  }, [cardName, isOpen, overlaySelected]);

  if (!isOpen || !deckCardOverlay) return null;

  const accentColor = palette?.accent || '#6B7280';
  const selPrinting = overlayPrintings.find((p) => printingKey(p) === overlaySelected);
  const rarity = selPrinting?.rarity ?? deckCardOverlay.card.rarity;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-md animate-fade-in select-none"
      onClick={onClose}
    >
      <div
        className="flex flex-col items-center max-h-full overflow-y-auto custom-scrollbar relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Floating Close Button in Top-Right */}
        <button
          onClick={onClose}
          className="self-end mb-2.5 flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider font-bold text-neutral-400 hover:text-white px-3 py-1.5 border border-white/15 hover:border-white/30 bg-neutral-900 hover:bg-neutral-800 transition-colors cursor-pointer"
          title="Close (Esc)"
        >
          <X className="w-4 h-4" /> Close (Esc)
        </button>

        {/* 3-COLUMN LAYOUT CONTAINER */}
        <div className="flex flex-row flex-nowrap items-start justify-center gap-4 max-w-full">
          {/* ========================================================================= */}
          {/* PANEL 1: Card image preview + Set / Art Selector                         */}
          {/* ========================================================================= */}
          <div className="w-[360px] max-w-[90vw] shrink-0 flex flex-col">
            <CardImage
              key={`${cardName}:${selPrinting?.set_code || ''}:${selPrinting?.collector_number || ''}`}
              name={cardName}
              version="normal"
              printing={selPrinting ? { setCode: selPrinting.set_code, collectorNumber: selPrinting.collector_number } : undefined}
              className="w-full aspect-[2.5/3.5] shadow-2xl block border border-white/15"
              alt={cardName}
            />

            {/* Set / Art Selector Underneath */}
            <div className="mt-3 shrink-0">
              <p className="text-xs font-mono uppercase tracking-wider text-neutral-400 mb-1">
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
          {/* PANEL 2: Card Metadata, Oracle Text & Achievements (Fully Opaque Box)     */}
          {/* ========================================================================= */}
          <div className="hidden min-[920px]:flex w-[410px] max-w-full max-h-[740px] overflow-y-auto custom-scrollbar flex-col gap-4 shrink-0 border border-white/10 bg-neutral-950 p-5 shadow-2xl">
            {/* Header: Title & Mana Cost */}
            <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2.5 shrink-0">
              <h3 className="text-lg font-bold font-display uppercase tracking-wide text-white leading-tight">
                {cardName}
              </h3>
              <span className="shrink-0 flex items-center gap-1">
                {parseMtgaManaCost(deckCardOverlay.card.mana_cost || '').map((s, i) => (
                  <ManaFontPip key={i} symbol={s} size={18} />
                ))}
              </span>
            </div>

            {/* Sub-header: Commander & Card Type */}
            <div className="space-y-1.5 shrink-0">
              {deckCardOverlay.isCommander && (
                <span className="text-xs font-mono font-bold uppercase tracking-wider px-2 py-0.5 border border-white/20 bg-white/10 text-neutral-200 inline-block mr-2">
                  Commander
                </span>
              )}
              {deckCardOverlay.card.card_type && (
                <p className="text-sm font-mono uppercase text-neutral-300">
                  {deckCardOverlay.card.card_type}
                </p>
              )}
            </div>

            {/* Quick Stats Grid (Clean 3-col with borders, no inner dark boxes) */}
            <div className="grid grid-cols-3 gap-2 py-2.5 border-t border-b border-white/10 shrink-0">
              <div>
                <p className="text-xs font-mono uppercase text-neutral-400">Rarity</p>
                <p
                  className="text-sm font-mono font-bold truncate mt-0.5"
                  style={{ color: cardRarityColor(rarity) }}
                >
                  {cardRarityLabel(rarity)}
                </p>
              </div>
              <div>
                <p className="text-xs font-mono uppercase text-neutral-400">Set</p>
                <p className="text-sm font-mono font-bold truncate text-white uppercase mt-0.5">
                  {selPrinting?.set_name
                    ? `${selPrinting.set_code}`
                    : selPrinting?.set_code || deckCardOverlay.card.set_code || '—'}
                </p>
              </div>
              <div>
                <p className="text-xs font-mono uppercase text-neutral-400">Decks</p>
                <p className="text-sm font-mono font-bold tabular-nums text-white mt-0.5">
                  {overlayStats ? overlayStats.deck_count : '—'}
                </p>
              </div>
            </div>

            {/* Decks Present In Chips */}
            {overlayStats?.decks?.length > 0 && (
              <div className="space-y-1.5 shrink-0">
                <p className="text-xs font-mono uppercase text-neutral-300 font-bold">
                  Decks Present In:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {overlayStats.decks.slice(0, 12).map((d: string, i: number) => (
                    <button
                      key={i}
                      onClick={() => {
                        onClose();
                        onSelectDeck(d);
                      }}
                      className="text-xs font-mono uppercase px-2 py-1 border border-white/10 bg-white/[0.04] hover:bg-white/[0.12] text-neutral-200 hover:text-white transition-colors cursor-pointer"
                      title={`Open ${d}`}
                    >
                      {d}
                    </button>
                  ))}
                  {overlayStats.decks.length > 12 && (
                    <span className="text-xs font-mono px-2 py-1 text-neutral-400">
                      +{overlayStats.decks.length - 12} more
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Scryfall Details Loading */}
            {overlayScryfallLoading && (
              <div className="flex items-center gap-2 py-1 text-sm font-mono text-neutral-400 shrink-0">
                <div className="w-4 h-4 border-2 border-white/20 border-t-white animate-spin rounded-full" />
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
                  <div className="space-y-3 flex-1 min-h-0">
                    {oracleText && (
                      <div className="space-y-1">
                        <p className="text-xs font-mono uppercase text-neutral-400">Oracle Text</p>
                        <p className="font-plantin text-sm whitespace-pre-wrap text-neutral-200 leading-relaxed">
                          {oracleText}
                        </p>
                      </div>
                    )}
                    {flavorText && (
                      <div className="space-y-1">
                        <p className="text-xs font-mono uppercase text-neutral-400">Flavor Text</p>
                        <p className="font-plantin text-sm italic text-neutral-400 leading-relaxed">
                          {flavorText}
                        </p>
                      </div>
                    )}
                    {(power !== undefined ||
                      toughness !== undefined ||
                      loyalty !== undefined) && (
                      <div className="flex items-center gap-3 pt-1 text-sm font-mono font-bold text-amber-400">
                        {power !== undefined && toughness !== undefined && (
                          <span>P/T: {power}/{toughness}</span>
                        )}
                        {loyalty !== undefined && <span>Loyalty: {loyalty}</span>}
                      </div>
                    )}
                    {keywords.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {keywords.map((kw: string, i: number) => (
                          <span
                            key={i}
                            className="text-xs font-mono px-2 py-0.5 border border-white/10 bg-white/[0.03] text-neutral-300"
                          >
                            {kw}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

            {/* Ownership 4-Diamond Selector */}
            <div className="pt-3 shrink-0 border-t border-white/10 flex items-center justify-between">
              <span className="text-xs font-mono uppercase font-bold text-neutral-300">
                Owned Copies
              </span>
              <div className="flex items-center gap-3">
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
                      className="group p-1 transition-transform hover:scale-125 focus:outline-none cursor-pointer"
                      title={`Set ${slot} copy owned`}
                    >
                      <span
                        className="inline-block w-3 h-3 rotate-45 transition-colors border"
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

            {/* Achievements Section (Seamlessly integrated, no extra outer box) */}
            {overlayStats?.lifetime_titles && Object.keys(overlayStats.lifetime_titles).length > 0 && (
              <div className="pt-3.5 border-t border-white/10 space-y-2.5 shrink-0">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-mono font-bold uppercase tracking-wider text-neutral-300">
                    Card Achievements
                  </p>
                  <button
                    onClick={onOpenTrophyCase}
                    className="text-xs font-mono font-medium uppercase tracking-wider text-neutral-300 hover:text-white transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Trophy className="w-3.5 h-3.5 text-amber-400" />
                    <span>View All →</span>
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 pt-0.5">
                  {Object.entries(overlayStats.lifetime_titles).slice(0, 4).map(
                    ([title, count]: [string, any]) => (
                      <AchievementBadge key={title} title={title} count={count} size="sm" />
                    )
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ========================================================================= */}
          {/* PANEL 3: Persistent Card Combat Analytics (Fully Opaque Box)              */}
          {/* ========================================================================= */}
          <div className="hidden min-[1320px]:flex w-[410px] max-w-full max-h-[740px] overflow-y-auto custom-scrollbar border border-white/10 bg-neutral-950 p-5 space-y-5 shrink-0 flex-col shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5 shrink-0">
              <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-white">
                Card Combat Analytics
              </h3>
              {overlayStats?.best_deck && (
                <span className="text-xs font-mono font-bold px-2.5 py-0.5 border border-white/15 bg-white/[0.04] text-neutral-200 uppercase">
                  MVP: {overlayStats.best_deck.name}
                </span>
              )}
            </div>

            {/* 4 KPIs Clean Grid (Unboxed stat blocks with subtle borders) */}
            <div className="grid grid-cols-2 gap-4 shrink-0">
              <div className="space-y-1">
                <p className="text-xs font-mono uppercase text-neutral-400">Matches Played</p>
                <p className="text-xl font-mono font-bold tabular-nums text-white">
                  {overlayStats?.matches_played ?? 0}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-mono uppercase text-neutral-400">Win Rate When Cast</p>
                <p
                  className={`text-xl font-mono font-bold tabular-nums ${
                    (overlayStats?.win_rate ?? 0) >= 50
                      ? 'text-emerald-400'
                      : overlayStats?.matches_played
                      ? 'text-rose-400'
                      : 'text-neutral-400'
                  }`}
                >
                  {overlayStats?.matches_played
                    ? `${overlayStats.win_rate}%`
                    : '—'}
                </p>
                {overlayStats?.matches_played ? (
                  <p className="text-xs font-mono text-neutral-400 tabular-nums">
                    {overlayStats.wins_when_played}W - {overlayStats.losses_when_played}L
                  </p>
                ) : null}
              </div>
              <div className="space-y-1">
                <p className="text-xs font-mono uppercase text-neutral-400">Total Damage Dealt</p>
                <p className="text-xl font-mono font-bold tabular-nums text-white">
                  {overlayStats?.total_damage ?? 0}
                  {(overlayStats?.max_hit ?? 0) > 0 && (
                    <span className="text-sm font-normal text-neutral-400 ml-1">
                      (max {overlayStats.max_hit})
                    </span>
                  )}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-mono uppercase text-neutral-400">Impactful Games</p>
                <p className="text-xl font-mono font-bold tabular-nums text-white">
                  {overlayStats?.times_impactful ?? 0}
                </p>
              </div>
            </div>

            {/* Opening Hand & Mulligan Profile (Unboxed) */}
            <div className="pt-3.5 border-t border-white/10 space-y-2.5 shrink-0">
              <div className="flex items-center justify-between text-xs font-mono uppercase font-bold text-neutral-300">
                <span>Mulligan Profile</span>
                {overlayStats?.mulligan_stats?.opener_matches > 0 && (
                  <span className="text-neutral-200 tabular-nums font-mono">
                    {overlayStats.mulligan_stats.opener_win_rate}% In-Hand WR
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center py-2">
                <div>
                  <p className="text-xs font-mono uppercase text-neutral-400">Keep Rate</p>
                  <p className="text-base font-mono font-bold text-white mt-0.5">
                    {overlayStats?.mulligan_stats?.keep_rate ?? 0}%
                  </p>
                  <p className="text-xs font-mono text-neutral-400 tabular-nums mt-0.5">
                    {overlayStats?.mulligan_stats?.times_kept ?? 0}K /{' '}
                    {overlayStats?.mulligan_stats?.times_mulliganed ?? 0}M
                  </p>
                </div>
                <div>
                  <p className="text-xs font-mono uppercase text-neutral-400">Bottomed</p>
                  <p className="text-base font-mono font-bold text-white mt-0.5">
                    {overlayStats?.mulligan_stats?.times_bottomed ?? 0}
                  </p>
                  <p className="text-xs font-mono text-neutral-400 mt-0.5">London</p>
                </div>
                <div>
                  <p className="text-xs font-mono uppercase text-neutral-400">Opener WR</p>
                  <p
                    className={`text-base font-mono font-bold mt-0.5 ${
                      (overlayStats?.mulligan_stats?.opener_win_rate ?? 0) >= 50
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {overlayStats?.mulligan_stats?.opener_matches
                      ? `${overlayStats.mulligan_stats.opener_win_rate}%`
                      : '—'}
                  </p>
                  <p className="text-xs font-mono text-neutral-400 tabular-nums mt-0.5">
                    {overlayStats?.mulligan_stats?.opener_wins ?? 0}W -{' '}
                    {(overlayStats?.mulligan_stats?.opener_matches ?? 0) -
                      (overlayStats?.mulligan_stats?.opener_wins ?? 0)}
                    L
                  </p>
                </div>
              </div>
            </div>

            {/* Damage Target Distribution (Unboxed progress split) */}
            <div className="pt-3.5 border-t border-white/10 space-y-2.5 shrink-0">
              <div className="flex items-center justify-between text-xs font-mono uppercase font-bold text-neutral-300">
                <span>Damage Target Split</span>
                <span className="tabular-nums text-neutral-200">{overlayStats?.total_damage ?? 0} Total DMG</span>
              </div>
              {overlayStats && overlayStats.total_damage > 0 ? (
                (() => {
                  const face = overlayStats.damage_to_player || 0;
                  const perm = overlayStats.damage_to_permanents || 0;
                  const total = face + perm > 0 ? face + perm : 1;
                  const facePct = Math.round((face / total) * 100);
                  const permPct = 100 - facePct;
                  return (
                    <div className="space-y-2">
                      <div className="h-2 w-full flex border border-white/10 overflow-hidden bg-neutral-900">
                        <div
                          className="bg-amber-400/90 h-full transition-all"
                          style={{ width: `${facePct}%` }}
                        />
                        <div
                          className="bg-neutral-500 h-full transition-all"
                          style={{ width: `${permPct}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-amber-400 font-medium">
                          Face: {face} ({facePct}%)
                        </span>
                        <span className="text-neutral-300 font-medium">
                          Permanents: {perm} ({permPct}%)
                        </span>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="py-2 text-center text-sm font-mono text-neutral-500">
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
