import React, { useState, useEffect } from "react";
import { Palette, X, RotateCcw, Check, Copy } from "lucide-react";

export interface DashboardCustomColors {
  allTimeWinRate: { positive: string; negative: string };
  todayWinRate: { positive: string; negative: string };
  currentStreak: { win: string; loss: string };
  trendingWinRate: { win: string; loss: string };
  recentMatches: { win: string; loss: string };
  deckSpotlight: { positive: string; negative: string };
}

export const DEFAULT_DASHBOARD_COLORS: DashboardCustomColors = {
  allTimeWinRate: { positive: "#10B981", negative: "#EF4444" },
  todayWinRate: { positive: "#10B981", negative: "#EF4444" },
  currentStreak: { win: "#10B981", loss: "#EF4444" },
  trendingWinRate: { win: "#10B981", loss: "#EF4444" },
  recentMatches: { win: "#10B981", loss: "#EF4444" },
  deckSpotlight: { positive: "#10B981", negative: "#EF4444" },
};

const normalizeHex = (raw: string): string => {
  let val = raw.trim().replace(/^#/, "");
  if (val.length === 3) {
    val = val
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (/^[0-9A-Fa-f]{6}$/.test(val)) {
    return `#${val.toUpperCase()}`;
  }
  return raw.startsWith("#") ? raw : `#${raw}`;
};

const isValidHex = (val: string): boolean => {
  return /^#[0-9A-Fa-f]{6}$/.test(val);
};

interface ColorSlotRowProps {
  label: string;
  value: string;
  onChange: (color: string) => void;
}

const ColorSlotRow: React.FC<ColorSlotRowProps> = ({
  label,
  value,
  onChange,
}) => {
  const [textInput, setTextInput] = useState(value);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setTextInput(value);
  }, [value]);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setTextInput(raw);
    const normalized = normalizeHex(raw);
    if (isValidHex(normalized)) {
      onChange(normalized);
    }
  };

  const handleBlur = () => {
    const normalized = normalizeHex(textInput);
    if (isValidHex(normalized)) {
      setTextInput(normalized);
      onChange(normalized);
    } else {
      setTextInput(value);
    }
  };

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("Failed to copy hex to clipboard:", err);
    }
  };

  const safePickerHex = isValidHex(value) ? value : "#10B981";

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 bg-white/[0.02] border border-white/10 rounded-xs hover:border-white/20 transition-colors">
      <span className="text-xs font-sans text-neutral-300 truncate" title={label}>
        {label}
      </span>

      <div className="flex items-center gap-2 shrink-0">
        {/* Color Wheel / HSV Native Picker Swatch */}
        <div
          className="relative w-7 h-7 shrink-0 rounded-xs overflow-hidden border border-white/25 hover:border-white/50 shadow-inner cursor-pointer transition-all"
          title="Click to open color chooser"
          style={{ backgroundColor: safePickerHex }}
        >
          <input
            type="color"
            value={safePickerHex}
            onChange={(e) => {
              const hex = e.target.value.toUpperCase();
              onChange(hex);
              setTextInput(hex);
            }}
            className="absolute -top-2 -left-2 w-12 h-12 cursor-pointer opacity-0"
          />
        </div>

        {/* Editable Hex Input */}
        <input
          type="text"
          value={textInput}
          onChange={handleTextChange}
          onBlur={handleBlur}
          className="w-20 px-2 py-1 bg-black/50 border border-white/15 text-xs font-mono uppercase text-white rounded-xs focus:border-sky-400 focus:outline-none tabular-nums"
          placeholder="#000000"
          maxLength={7}
        />

        {/* Copy Hex Button */}
        <button
          onClick={handleCopy}
          title="Copy hex value"
          className="px-2 py-1 border border-white/15 hover:border-white/30 bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white rounded-xs transition-colors flex items-center gap-1 text-[11px] font-mono cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400 text-[10px]">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 text-neutral-400" />
              <span className="text-neutral-400 text-[10px]">Copy</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

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

  useEffect(() => {
    setDraft(colors);
  }, [colors, isOpen]);

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
    {
      key: "deckSpotlight" as const,
      name: "Deck Spotlight",
      slots: [
        { key: "positive", label: "Win Rate (≥ 50%) & Mana Curve" },
        { key: "negative", label: "Win Rate (< 50%)" },
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
        <div className="space-y-4 max-h-[62vh] overflow-y-auto custom-scrollbar pr-2">
          {modules.map((mod) => (
            <div
              key={mod.key}
              className="p-3.5 bg-white/[0.01] border border-white/10 rounded-xs space-y-2.5"
            >
              <div className="text-xs font-sans font-bold uppercase tracking-wider text-neutral-300">
                {mod.name}
              </div>

              <div className="space-y-2">
                {mod.slots.map((slot) => {
                  const currentColor =
                    (draft[mod.key] as any)[slot.key] || "#10B981";
                  return (
                    <ColorSlotRow
                      key={slot.key}
                      label={slot.label}
                      value={currentColor}
                      onChange={(newHex) =>
                        updateColor(mod.key, slot.key, newHex)
                      }
                    />
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
