import React, { useState } from "react";
import { Palette, X, RotateCcw, Check } from "lucide-react";

export interface DashboardCustomColors {
  allTimeWinRate: { positive: string; negative: string };
  todayWinRate: { positive: string; negative: string };
  currentStreak: { win: string; loss: string };
  trendingWinRate: { win: string; loss: string };
  recentMatches: { win: string; loss: string };
}

export const DEFAULT_DASHBOARD_COLORS: DashboardCustomColors = {
  allTimeWinRate: { positive: "#10B981", negative: "#EF4444" },
  todayWinRate: { positive: "#10B981", negative: "#EF4444" },
  currentStreak: { win: "#10B981", loss: "#EF4444" },
  trendingWinRate: { win: "#10B981", loss: "#EF4444" },
  recentMatches: { win: "#10B981", loss: "#EF4444" },
};

const COLOR_SWATCHES = [
  { label: "Theme Green", hex: "#10B981" },
  { label: "Theme Red", hex: "#EF4444" },
  { label: "Pure White", hex: "#FFFFFF" },
  { label: "Mana Blue", hex: "#38BDF8" },
  { label: "Mana Gold", hex: "#F59E0B" },
  { label: "Mana Purple", hex: "#A855F7" },
  { label: "Rose", hex: "#FB7185" },
  { label: "Mint", hex: "#34D399" },
  { label: "Slate Gray", hex: "#94A3B8" },
  { label: "Amber Orange", hex: "#F97316" },
];

interface DashboardColorPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  colors: DashboardCustomColors;
  onSaveColors: (newColors: DashboardCustomColors) => void;
}

export const DashboardColorPickerModal: React.FC<DashboardColorPickerModalProps> = ({
  isOpen,
  onClose,
  colors,
  onSaveColors,
}) => {
  const [draft, setDraft] = useState<DashboardCustomColors>(colors);

  if (!isOpen) return null;

  const updateColor = (
    moduleKey: keyof DashboardCustomColors,
    slotKey: string,
    value: string,
  ) => {
    setDraft((prev) => ({
      ...prev,
      [moduleKey]: {
        ...prev[moduleKey],
        [slotKey]: value,
      },
    }));
  };

  const handleReset = () => {
    setDraft(DEFAULT_DASHBOARD_COLORS);
  };

  const handleSave = () => {
    onSaveColors(draft);
    onClose();
  };

  const modules = [
    {
      key: "allTimeWinRate" as const,
      name: "All-Time Win Rate",
      slots: [
        { key: "positive", label: "Above 50% (Win Rate ≥ 50%)" },
        { key: "negative", label: "Below 50% (Win Rate < 50%)" },
      ],
    },
    {
      key: "todayWinRate" as const,
      name: "Today Win Rate",
      slots: [
        { key: "positive", label: "Above 50% (Today ≥ 50%)" },
        { key: "negative", label: "Below 50% (Today < 50%)" },
      ],
    },
    {
      key: "currentStreak" as const,
      name: "Current Streak",
      slots: [
        { key: "win", label: "Winning Streak" },
        { key: "loss", label: "Losing Streak" },
      ],
    },
    {
      key: "trendingWinRate" as const,
      name: "Trending Win Rate Histogram",
      slots: [
        { key: "win", label: "Wins Bar" },
        { key: "loss", label: "Losses Bar" },
      ],
    },
    {
      key: "recentMatches" as const,
      name: "Recent Matches",
      slots: [
        { key: "win", label: "Match Win" },
        { key: "loss", label: "Match Loss" },
      ],
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none"
      onClick={onClose}
    >
      <div
        className="bg-neutral-900 border border-white/20 max-w-2xl w-full p-6 shadow-2xl space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <Palette className="w-5 h-5 text-sky-400" />
            <h2 className="text-lg font-display font-bold uppercase tracking-wider text-white">
              Customize Module Colors
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modules Color Configuration List */}
        <div className="space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
          {modules.map((mod) => (
            <div
              key={mod.key}
              className="p-3.5 bg-white/[0.02] border border-white/10 rounded-xs space-y-3"
            >
              <div className="text-sm font-sans font-bold text-neutral-200">
                {mod.name}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {mod.slots.map((slot) => {
                  const currentColor = (draft[mod.key] as any)[slot.key] || "#10B981";
                  return (
                    <div key={slot.key} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-sans text-neutral-400">
                        <span>{slot.label}</span>
                        <span className="font-mono text-[11px] uppercase text-neutral-300">
                          {currentColor}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Interactive Color Picker Input */}
                        <div className="relative w-8 h-8 shrink-0 rounded-xs overflow-hidden border border-white/20 shadow-inner cursor-pointer">
                          <input
                            type="color"
                            value={currentColor}
                            onChange={(e) =>
                              updateColor(mod.key, slot.key, e.target.value)
                            }
                            className="absolute -top-2 -left-2 w-12 h-12 cursor-pointer border-0 p-0 bg-transparent"
                          />
                        </div>

                        {/* Quick Color Swatches */}
                        <div className="flex items-center gap-1 flex-wrap">
                          {COLOR_SWATCHES.map((swatch) => (
                            <button
                              key={swatch.hex}
                              title={swatch.label}
                              onClick={() =>
                                updateColor(mod.key, slot.key, swatch.hex)
                              }
                              className={`w-5 h-5 rounded-xs border transition-transform hover:scale-110 cursor-pointer ${
                                currentColor.toLowerCase() === swatch.hex.toLowerCase()
                                  ? "ring-2 ring-white scale-105 border-white"
                                  : "border-white/20"
                              }`}
                              style={{ backgroundColor: swatch.hex }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer Actions */}
        <div className="pt-3 border-t border-white/10 flex items-center justify-between">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-sans text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-colors border border-transparent hover:border-white/10 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset to Defaults</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 bg-white/5 hover:bg-white/10 text-xs font-sans font-medium text-neutral-300 hover:text-white transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-sky-500/20 text-sky-300 border border-sky-500/50 hover:bg-sky-500/30 text-xs font-sans font-semibold transition-all shadow-sm cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Apply Colors</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
