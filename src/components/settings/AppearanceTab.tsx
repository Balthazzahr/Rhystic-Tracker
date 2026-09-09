import React from 'react';
import { Shuffle, Image as ImageIcon, ImageOff, X as XIcon } from 'lucide-react';
import { CustomDropdown } from '../CustomDropdown';
import { ManaPip } from '../ManaPip';
import { MTG_COLORS, BG_WINDOWS, ManaThemeOption } from './types';

export interface AppearanceTabProps {
  palette: any;
  isSearching: boolean;

  // Search matches
  matchThemes: boolean;
  matchGlassOpacity: boolean;
  matchManaPipStyle: boolean;
  matchCollectionSort: boolean;
  matchCompactMode: boolean;
  matchDeckFlair: boolean;
  matchBackground: boolean;

  // Active theme
  activeThemeId: string;
  setActiveThemeId: (id: string) => void;
  manaThemeOptions: ManaThemeOption[];

  // Visual settings
  glassOpacity: string;
  glassOpacityOptions: { value: string; label: string }[];
  onChangeGlassOpacity: (val: string) => void;

  manaPipStyle: string;
  manaPipStyleOptions: { value: string; label: string }[];
  onChangeManaPipStyle: (val: string) => void;

  defaultCollectionSort: string;
  collectionSortOptions: { value: string; label: string }[];
  onChangeDefaultCollectionSort: (val: string) => void;

  compactCardsMode: boolean;
  onToggleCompactCardsMode: (val: boolean) => void;

  deckBoxFlair: boolean;
  onToggleDeckBoxFlair: (val: boolean) => void;

  // Background artwork
  bgMode: 'random' | 'preset' | 'none';
  bgPresets: Record<string, string>;
  onSetBgMode: (mode: 'random' | 'preset' | 'none') => void;
  onOpenBgSearch: (tabId: string) => void;
  onRemoveBgPreset: (tabId: string) => void;
}

export const AppearanceTab: React.FC<AppearanceTabProps> = ({
  palette,
  isSearching,
  matchThemes,
  matchGlassOpacity,
  matchManaPipStyle,
  matchCollectionSort,
  matchCompactMode,
  matchDeckFlair,
  matchBackground,
  activeThemeId,
  setActiveThemeId,
  manaThemeOptions,
  glassOpacity,
  glassOpacityOptions,
  onChangeGlassOpacity,
  manaPipStyle,
  manaPipStyleOptions,
  onChangeManaPipStyle,
  defaultCollectionSort,
  collectionSortOptions,
  onChangeDefaultCollectionSort,
  compactCardsMode,
  onToggleCompactCardsMode,
  deckBoxFlair,
  onToggleDeckBoxFlair,
  bgMode,
  bgPresets,
  onSetBgMode,
  onOpenBgSearch,
  onRemoveBgPreset,
}) => {
  return (
    <div className="space-y-6">
      {/* Mana Color Themes */}
      {(matchThemes || !isSearching) && (
        <div className="space-y-3">
          <div className="border-b border-white/10 pb-2 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-300 font-sans">
                5-Color Mana Theme Presets
              </span>
              <p className="text-xs font-sans text-neutral-400 mt-0.5">
                Select your Magic color identity. All themes use a master dark obsidian base with custom mana accents.
              </p>
            </div>
            <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 border border-white/15 bg-white/[0.04] text-white">
              Active: {palette?.name || activeThemeId}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5 pt-1">
            {manaThemeOptions.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveThemeId(t.id)}
                className={`p-3 border flex flex-col items-center gap-2 transition-all cursor-pointer ${
                  activeThemeId === t.id
                    ? 'border-white/40 bg-white/10 shadow-lg'
                    : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.05] opacity-80 hover:opacity-100'
                }`}
              >
                <ManaPip symbol={t.symbol} size={28} colorOverride={t.color} />
                <span className="text-xs font-bold font-sans uppercase tracking-wide text-white">
                  {t.label.split(' ')[0]}
                </span>
                <span className="text-[9.5px] font-sans text-neutral-400 text-center leading-tight">
                  {t.desc}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Visual Theme & Contrast Options */}
      {(matchGlassOpacity || matchManaPipStyle || !isSearching) && (
        <div className="space-y-3 pt-2">
          <div className="border-b border-white/10 pb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-300 font-sans">
              Glassmorphism & Symbol Contrast
            </span>
            <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider">Surface Tint</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            {(matchGlassOpacity || !isSearching) && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase text-neutral-400 font-bold">
                  Backdrop Glass Opacity & Tint
                </label>
                <CustomDropdown
                  options={glassOpacityOptions}
                  value={glassOpacity}
                  onChange={onChangeGlassOpacity}
                  palette={palette}
                />
                <p className="text-[11px] font-sans text-neutral-500">
                  Controls the opacity of obsidian containers over custom card art backgrounds.
                </p>
              </div>
            )}

            {(matchManaPipStyle || !isSearching) && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase text-neutral-400 font-bold">
                  Mana Pip Representation Style
                </label>
                <CustomDropdown
                  options={manaPipStyleOptions}
                  value={manaPipStyle}
                  onChange={onChangeManaPipStyle}
                  palette={palette}
                />
                <p className="text-[11px] font-sans text-neutral-500">
                  Choose between graphical mana pips, classic vector glyphs, or raw text codes.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Card & Library Display Options */}
      {(matchCollectionSort || matchCompactMode || matchDeckFlair || !isSearching) && (
        <div className="space-y-3 pt-2">
          <div className="border-b border-white/10 pb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-300 font-sans">
              Card & Library Display
            </span>
            <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider">Visuals</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            {(matchCollectionSort || !isSearching) && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase text-neutral-400 font-bold">
                  Default Collection Sort Order
                </label>
                <CustomDropdown
                  options={collectionSortOptions}
                  value={defaultCollectionSort}
                  onChange={onChangeDefaultCollectionSort}
                  palette={palette}
                />
                <p className="text-[11px] font-sans text-neutral-500">
                  Initial sorting method applied when opening the Card Library.
                </p>
              </div>
            )}

            {(matchCompactMode || !isSearching) && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase text-neutral-400 font-bold">
                  Compact Card Preview
                </label>
                <div className="flex items-center justify-between p-2 border border-white/10 bg-white/[0.02] h-10">
                  <span className="text-xs font-mono text-neutral-300">Slim Card Rows in Lists</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={compactCardsMode}
                    onClick={() => onToggleCompactCardsMode(!compactCardsMode)}
                    style={compactCardsMode ? { backgroundColor: MTG_COLORS.green.bg, borderColor: MTG_COLORS.green.border } : undefined}
                    className={`relative inline-flex items-center h-5 w-9 shrink-0 cursor-pointer border transition-colors ${
                      compactCardsMode ? '' : 'bg-white/[0.04] border-white/15'
                    }`}
                  >
                    <span
                      style={compactCardsMode ? { backgroundColor: MTG_COLORS.green.base } : undefined}
                      className={`inline-block h-3 w-3 transform transition-transform ${
                        compactCardsMode ? 'translate-x-5' : 'translate-x-1 bg-neutral-500'
                      }`}
                    />
                  </button>
                </div>
                <p className="text-[11px] font-sans text-neutral-500">
                  Optimizes vertical card height for dense match breakdowns.
                </p>
              </div>
            )}

            {(matchDeckFlair || !isSearching) && (
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-[10px] font-mono uppercase text-neutral-400 font-bold">
                  Deck Box Visual Flair
                </label>
                <div className="flex items-center justify-between p-2 border border-white/10 bg-white/[0.02] h-10">
                  <span className="text-xs font-mono text-neutral-300">Mana Pip Stickers & Win Rate Stamps</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={deckBoxFlair}
                    onClick={() => onToggleDeckBoxFlair(!deckBoxFlair)}
                    style={deckBoxFlair ? { backgroundColor: MTG_COLORS.green.bg, borderColor: MTG_COLORS.green.border } : undefined}
                    className={`relative inline-flex items-center h-5 w-9 shrink-0 cursor-pointer border transition-colors ${
                      deckBoxFlair ? '' : 'bg-white/[0.04] border-white/15'
                    }`}
                  >
                    <span
                      style={deckBoxFlair ? { backgroundColor: MTG_COLORS.green.base } : undefined}
                      className={`inline-block h-3 w-3 transform transition-transform ${
                        deckBoxFlair ? 'translate-x-5' : 'translate-x-1 bg-neutral-500'
                      }`}
                    />
                  </button>
                </div>
                <p className="text-[11px] font-sans text-neutral-500">
                  Display mana pip stickers and hand-drawn win rate percentage on deck library boxes. Turning this off displays minimal boxes with deck title only.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Background Settings */}
      {(matchBackground || !isSearching) && (
        <div className="space-y-3 pt-2">
          <div className="border-b border-white/10 pb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-300 font-sans">
              Background Ambient Artwork
            </span>
            <p className="text-xs font-sans text-neutral-400 mt-0.5">
              Card art backgrounds behind page content. Random uses cards from your tracked decks.
            </p>
          </div>

          {/* Mode selector */}
          <div className="flex gap-1.5 pt-1">
            {[
              { id: 'random' as const, label: 'Random', icon: <Shuffle className="w-3.5 h-3.5" /> },
              { id: 'preset' as const, label: 'Preset', icon: <ImageIcon className="w-3.5 h-3.5" /> },
              { id: 'none' as const, label: 'No Image', icon: <ImageOff className="w-3.5 h-3.5" /> },
            ].map((opt) => (
              <button
                key={opt.id}
                onClick={() => onSetBgMode(opt.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-wider transition-all cursor-pointer border ${
                  bgMode === opt.id
                    ? 'border-white/40 bg-white/10 text-white font-bold'
                    : 'border-white/10 bg-white/[0.02] text-neutral-400 hover:text-white hover:border-white/20'
                }`}
              >
                {opt.icon}
                <span>{opt.label}</span>
              </button>
            ))}
          </div>

          {/* Preset list */}
          {bgMode === 'preset' && (
            <div className="space-y-1 pt-2">
              {BG_WINDOWS.map((win) => {
                const cardName = bgPresets[win.id];
                return (
                  <div
                    key={win.id}
                    className="flex items-center justify-between px-3 py-2 border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={`${win.iconClass} text-sm shrink-0 text-neutral-400`} />
                      <span className="text-xs font-sans text-neutral-300">{win.label}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {cardName ? (
                        <span className="text-[11px] font-mono text-neutral-200 truncate max-w-[140px]">
                          {cardName.startsWith('custom:') ? '🖼️ Custom Image' : cardName}
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono text-neutral-500 italic">Random</span>
                      )}
                      <button
                        onClick={() => onOpenBgSearch(win.id)}
                        className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-white transition-colors cursor-pointer"
                      >
                        {cardName ? 'Change' : 'Set'}
                      </button>
                      {cardName && (
                        <button
                          onClick={() => onRemoveBgPreset(win.id)}
                          className="text-[10px] font-mono hover:text-white transition-colors cursor-pointer px-1"
                          style={{ color: MTG_COLORS.red.text }}
                        >
                          <XIcon className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
