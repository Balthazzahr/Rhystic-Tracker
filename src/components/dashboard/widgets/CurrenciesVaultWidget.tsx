import React from "react";
import { Gem, Coins, Award, Package, Lock, Unlock, ShieldAlert } from "lucide-react";
import { WidgetProps } from "../types";
import { WidgetShell } from "../WidgetShell";
import { usePlayerEconomy, formatCurrency, BoosterPack } from "./economyCommon";

// Map MTGA set code aliases to Keyrune classes
const KEYRUNE_CODE_ALIAS: Record<string, string> = {
  DAR: "dom",
  CONF: "con",
  TLA: "tla",
  HOB: "hob",
  ZNR: "znr",
  THB: "thb",
  MSH: "msh",
  FRA: "fra",
};
const keyruneClass = (code: string) =>
  `ss ss-${(KEYRUNE_CODE_ALIAS[code.toUpperCase()] || code).toLowerCase()}`;

/**
 * Authentic MTGA Physical Foil Booster Pack Graphic
 * Features crimped/serrated heat seals, metallic amber gradient, and centered Keyrune/Planeswalker set logo.
 */
interface FoilBoosterPackProps {
  setCode: string;
  className?: string;
}

const FoilBoosterPack: React.FC<FoilBoosterPackProps> = ({ setCode, className = "" }) => {
  const isGolden = setCode.toUpperCase() === "GOLDEN";

  return (
    <div
      className={`w-[54px] h-[82px] rounded-[1px] ${
        isGolden
          ? "bg-gradient-to-b from-amber-700/60 via-amber-950 to-yellow-950 border border-yellow-400/90 shadow-[0_0_14px_rgba(245,158,11,0.4)]"
          : "bg-gradient-to-b from-neutral-800 via-neutral-900 to-neutral-950 border border-amber-400/50 shadow-md"
      } flex flex-col items-center justify-between overflow-hidden transition-all duration-200 ${className}`}
    >
      {/* Top Crimp Seal (Metallic Heat-Sealed Serrated Edge) */}
      <div
        className={`w-full shrink-0 flex flex-col items-center ${
          isGolden
            ? "bg-gradient-to-b from-yellow-500/80 via-amber-300 to-yellow-600 border-b border-yellow-300/60"
            : "bg-gradient-to-b from-amber-600/50 via-amber-400/60 to-amber-700/50 border-b border-amber-400/30"
        }`}
      >
        <svg
          className="w-full h-1 text-neutral-950 fill-current"
          viewBox="0 0 54 4"
          preserveAspectRatio="none"
        >
          <path d="M0,0 L2.25,3 L4.5,0 L6.75,3 L9,0 L11.25,3 L13.5,0 L15.75,3 L18,0 L20.25,3 L22.5,0 L24.75,3 L27,0 L29.25,3 L31.5,0 L33.75,3 L36,0 L38.25,3 L40.5,0 L42.75,3 L45,0 L47.25,3 L49.5,0 L51.75,3 L54,0 L54,0 Z" />
        </svg>
        <div className="w-full h-1 bg-[repeating-linear-gradient(90deg,transparent,transparent_2px,rgba(0,0,0,0.4)_2px,rgba(0,0,0,0.4)_3px)] opacity-70" />
      </div>

      {/* Foil Sheen Diagonal Accent & Shimmer Sweep */}
      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-amber-300/[0.08] to-transparent pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.1] to-transparent pointer-events-none -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out" />

      {/* Center: Set Logo Emblem — Enforced 38px font size via inline style to prevent keyrune.css override */}
      <div className="relative flex-1 flex items-center justify-center w-full px-0.5 overflow-hidden">
        {isGolden ? (
          <span
            className="ms ms-planeswalker text-amber-300 leading-none drop-shadow-[0_0_12px_rgba(251,191,36,0.9)] group-hover:text-amber-200 group-hover:scale-105 transition-all duration-150"
            style={{ fontSize: "38px" }}
          />
        ) : (
          <i
            className={`${keyruneClass(
              setCode
            )} text-amber-300 leading-none drop-shadow-[0_0_10px_rgba(245,158,11,0.65)] group-hover:text-amber-200 group-hover:scale-105 transition-all duration-150`}
            style={{ fontSize: "38px" }}
          />
        )}
      </div>

      {/* Bottom Crimp Seal (Metallic Heat-Sealed Serrated Edge) */}
      <div
        className={`w-full shrink-0 flex flex-col items-center ${
          isGolden
            ? "bg-gradient-to-t from-yellow-500/80 via-amber-300 to-yellow-600 border-t border-yellow-300/60"
            : "bg-gradient-to-t from-amber-600/50 via-amber-400/60 to-amber-700/50 border-t border-amber-400/30"
        }`}
      >
        <div className="w-full h-1 bg-[repeating-linear-gradient(90deg,transparent,transparent_2px,rgba(0,0,0,0.4)_2px,rgba(0,0,0,0.4)_3px)] opacity-70" />
        <svg
          className="w-full h-1 text-neutral-950 fill-current"
          viewBox="0 0 54 4"
          preserveAspectRatio="none"
        >
          <path d="M0,4 L2.25,1 L4.5,4 L6.75,1 L9,4 L11.25,1 L13.5,4 L15.75,1 L18,4 L20.25,1 L22.5,4 L24.75,1 L27,4 L29.25,1 L31.5,4 L33.75,1 L36,4 L38.25,1 L40.5,4 L42.75,1 L45,4 L47.25,1 L49.5,4 L51.75,1 L54,4 L54,4 Z" />
        </svg>
      </div>
    </div>
  );
};

/**
 * Grouped Booster Pack Presentation
 * Fanned layout:
 * - 1 Pack: Single upright pack centered.
 * - 2 Packs: 2 packs fanned out with alternating diagonal angles from bottom center (thinner at bottom, wider at top).
 * - 3 Packs: 3 packs fanned out from bottom center (middle upright in front, left/right fanning diagonally up and out).
 * - >3 Packs: 3-pack fan visual representation with "X{count}" displayed underneath.
 */
interface BoosterPackGroupProps {
  booster: BoosterPack;
}

const BoosterPackGroup: React.FC<BoosterPackGroupProps> = ({ booster }) => {
  const count = booster.count;

  return (
    <div
      className="flex flex-col items-center justify-start group cursor-default shrink-0 select-none w-28"
      title={`${booster.count}x ${booster.set_name || booster.set_code} (${
        booster.count === 1 ? "1 Pack" : `${booster.count} Packs`
      })`}
    >
      {/* Visual Booster Fanning Area — All cards anchored to exact bottom-center (left: 50%, bottom: 0, origin-bottom) */}
      <div className="relative w-full h-[88px]">
        {count === 1 && (
          <FoilBoosterPack
            setCode={booster.set_code}
            className="absolute bottom-0 left-1/2 -translate-x-1/2 origin-bottom rotate-0 z-10 shadow-lg group-hover:scale-105 group-hover:-translate-y-1"
          />
        )}

        {count === 2 && (
          <>
            {/* Right Pack (underneath, angled diagonally up to the right from bottom center) */}
            <FoilBoosterPack
              setCode={booster.set_code}
              className="absolute bottom-0 left-1/2 -translate-x-1/2 origin-bottom rotate-[14deg] opacity-90 shadow-md z-0 group-hover:rotate-[17deg] pointer-events-none"
            />
            {/* Left Pack (in front, angled diagonally up to the left from bottom center) */}
            <FoilBoosterPack
              setCode={booster.set_code}
              className="absolute bottom-0 left-1/2 -translate-x-1/2 origin-bottom -rotate-[14deg] shadow-xl z-10 group-hover:-rotate-[17deg] group-hover:-translate-y-0.5"
            />
          </>
        )}

        {count >= 3 && (
          <>
            {/* Left Pack (underneath, fanning diagonally up and out to the left from bottom center) */}
            <FoilBoosterPack
              setCode={booster.set_code}
              className="absolute bottom-0 left-1/2 -translate-x-1/2 origin-bottom -rotate-[20deg] opacity-90 shadow-md z-0 group-hover:-rotate-[24deg] pointer-events-none"
            />
            {/* Right Pack (underneath, fanning diagonally up and out to the right from bottom center) */}
            <FoilBoosterPack
              setCode={booster.set_code}
              className="absolute bottom-0 left-1/2 -translate-x-1/2 origin-bottom rotate-[20deg] opacity-90 shadow-md z-0 group-hover:rotate-[24deg] pointer-events-none"
            />
            {/* Center Pack (front and center, straight upright, same size as single cards) */}
            <FoilBoosterPack
              setCode={booster.set_code}
              className="absolute bottom-0 left-1/2 -translate-x-1/2 origin-bottom rotate-0 shadow-2xl z-10 group-hover:-translate-y-1"
            />
          </>
        )}
      </div>

      {/* Set Title & Count Underneath — Consistent height for uniform horizontal layout */}
      <div className="mt-2 flex flex-col items-center justify-start w-full min-h-[36px] text-center">
        <span
          className="text-neutral-200 text-[11px] font-sans font-semibold line-clamp-2 leading-tight group-hover:text-amber-200 transition-colors"
          title={booster.set_name || booster.set_code}
        >
          {booster.set_name || booster.set_code}
        </span>

        {/* Amount Underneath when beyond 3 packs */}
        {count > 3 && (
          <span className="mt-0.5 text-xs font-mono font-bold text-amber-300 drop-shadow-[0_0_6px_rgba(245,158,11,0.5)] tracking-wide">
            X{count}
          </span>
        )}
      </div>
    </div>
  );
};

export const CurrenciesVaultWidget: React.FC<WidgetProps> = React.memo(({ widget }) => {
  const { economy, loading } = usePlayerEconomy();

  const goldenProgress = economy?.golden_pack_progress ?? 0;
  const boosters = economy?.boosters ?? [];
  const totalBoosterCount = boosters.reduce((sum, b) => sum + (b.count || 0), 0);

  return (
    <WidgetShell
      title="Currencies & Inventory"
      subtitle="Gold, Gems, Boosters, Tokens & Golden Pack"
      icon={<Coins className="w-3.5 h-3.5 text-amber-400" />}
      isLoading={loading}
      isEmpty={!economy && !loading}
      emptyMessage="No economy data detected yet. Log into MTGA to track."
    >
      <div className="flex-1 min-h-0 flex flex-col justify-between gap-2.5 h-full">
        {/* 1. Top Quadrant of 4: Gold & Gems, then Draft & Jump In Tokens */}
        <div className="grid grid-cols-2 gap-2 shrink-0">
          {/* Gold */}
          <div className="bg-white/[0.03] border border-amber-500/25 hover:border-amber-500/40 px-3 py-2 flex items-center justify-between transition-colors shadow-sm">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0 shadow-[0_0_8px_rgba(245,158,11,0.25)]">
                <span className="ms ms-counter-gold text-amber-400 text-sm leading-none" />
              </div>
              <span className="text-[10px] font-sans font-semibold uppercase tracking-wider text-amber-400/90 truncate">
                Gold
              </span>
            </div>
            <div className="text-lg font-mono font-bold text-amber-300 tabular-nums truncate pl-2">
              {formatCurrency(economy?.gold)}
            </div>
          </div>

          {/* Gems */}
          <div className="bg-white/[0.03] border border-cyan-500/25 hover:border-cyan-500/40 px-3 py-2 flex items-center justify-between transition-colors shadow-sm">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-full bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center shrink-0 shadow-[0_0_8px_rgba(6,182,212,0.25)]">
                <Gem className="w-3.5 h-3.5 text-cyan-400" />
              </div>
              <span className="text-[10px] font-sans font-semibold uppercase tracking-wider text-cyan-400/90 truncate">
                Gems
              </span>
            </div>
            <div className="text-lg font-mono font-bold text-cyan-300 tabular-nums truncate pl-2">
              {formatCurrency(economy?.gems)}
            </div>
          </div>

          {/* Draft Tokens */}
          <div className="bg-white/[0.02] border border-white/10 hover:border-white/20 px-3 py-2 flex items-center justify-between transition-colors">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                <span className="ms ms-ticket text-amber-400 text-xs leading-none" />
              </div>
              <span className="text-neutral-300 text-xs font-sans font-medium truncate">Draft Tokens</span>
            </div>
            <span className="font-mono font-bold text-sm text-neutral-100 tabular-nums pl-2">
              {economy?.draft_tokens ?? 0}
            </span>
          </div>

          {/* Jump In! Tokens */}
          <div className="bg-white/[0.02] border border-white/10 hover:border-white/20 px-3 py-2 flex items-center justify-between transition-colors">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                <span className="ms ms-token text-emerald-400 text-xs leading-none" />
              </div>
              <span className="text-neutral-300 text-xs font-sans font-medium truncate">Jump In!</span>
            </div>
            <span className="font-mono font-bold text-sm text-neutral-100 tabular-nums pl-2">
              {economy?.jump_in_tokens ?? 0}
            </span>
          </div>
        </div>

        {/* 2. Unopened Booster Packs Section (Horizontal flow left-to-right, scrollable if needed) */}
        <div className="flex-1 min-h-0 flex flex-col justify-start space-y-1.5 overflow-hidden">
          <div className="flex items-center justify-between text-[10px] font-sans font-semibold uppercase tracking-wider text-neutral-400 px-0.5 shrink-0">
            <span className="flex items-center gap-1.5 text-amber-300/90">
              <Package className="w-3 h-3 text-amber-400" />
              <span>Unopened Packs ({totalBoosterCount})</span>
            </span>
            <span className="text-neutral-500 font-mono text-[9px]">Available in Client</span>
          </div>

          {totalBoosterCount > 0 ? (
            <div className="flex-1 min-h-0 flex items-start justify-start gap-4 sm:gap-6 overflow-x-auto custom-scrollbar px-3 py-1">
              {boosters.map((b) => (
                <BoosterPackGroup
                  key={`${b.set_code}_${b.collation_id}`}
                  booster={b}
                />
              ))}
            </div>
          ) : (
            <div className="w-full py-2.5 px-3 border border-dashed border-white/10 bg-white/[0.01] flex items-center justify-center gap-2 text-neutral-500 text-xs font-sans">
              <Package className="w-3.5 h-3.5 opacity-40" />
              <span>No unopened booster packs currently in inventory</span>
            </div>
          )}
        </div>

        {/* 3. Golden Pack Progress Section */}
        <div className="relative overflow-hidden bg-gradient-to-b from-neutral-900/90 via-neutral-950 to-neutral-900 border border-amber-500/30 p-2.5 space-y-1.5 shadow-[0_4px_16px_rgba(0,0,0,0.6)] shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0 shadow-[0_0_8px_rgba(245,158,11,0.25)]">
                <span className="ms ms-planeswalker text-amber-300 text-xs leading-none" />
              </div>
              <span className="text-xs font-sans font-bold uppercase tracking-wider text-amber-300">
                Golden Pack Progress
              </span>
            </div>
            <span className="font-mono text-neutral-300 text-xs tabular-nums">
              <strong className="text-amber-300 font-bold">{goldenProgress}</strong> / 10 packs
            </span>
          </div>

          {/* 10 Segmented Pips */}
          <div className="grid grid-cols-10 gap-1">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((idx) => {
              const isFilled = idx < goldenProgress;
              return (
                <div
                  key={idx}
                  className={`h-2.5 border transition-all ${
                    isFilled
                      ? "bg-gradient-to-r from-amber-400 to-yellow-300 border-yellow-200 shadow-[0_0_6px_rgba(234,179,8,0.35)]"
                      : "bg-neutral-950 border-white/10"
                  }`}
                  title={`Store pack purchase ${idx + 1} of 10`}
                />
              );
            })}
          </div>

          <div className="text-[10px] font-sans text-neutral-500 flex justify-between">
            <span>Earn 1 Golden Pack (6 Rares/Mythics) every 10 packs</span>
            <span className="text-amber-400/90 font-medium">{10 - goldenProgress} packs away</span>
          </div>
        </div>
      </div>
    </WidgetShell>
  );
});

