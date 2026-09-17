import React from "react";
import { X, LayoutGrid, Sliders } from "lucide-react";

interface WhatsNewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenCustomize: () => void;
}

const NEW_WIDGET_FEATURES = [
  {
    title: "Format Distribution",
    icon: <i className="ms ms-ability-prototype text-sky-400 text-base" />,
    desc: "Interactive format breakdown with pie chart, win rates, and direct format filtering.",
    badge: "Interactive",
  },
  {
    title: "Fun Facts Telemetry",
    icon: <i className="ms ms-ability-renowned text-amber-400 text-base" />,
    desc: "16+ dynamic gameplay stats, toughest commander matchups, fast wins, and battle records.",
    badge: "Live Telemetry",
  },
  {
    title: "Guild & Clan Mastery",
    icon: <i className="ms ms-ability-duels-renowned text-emerald-400 text-base" />,
    desc: "2-color guild performance matrix, dominance records, and color identity analytics.",
    badge: "Analytics",
  },
  {
    title: "Mulligan Resilience",
    icon: <i className="ms ms-untap text-indigo-400 text-base" />,
    desc: "Opening hand retention tracking and win-rate drop-off across mulligan counts.",
    badge: "Efficiency",
  },
  {
    title: "Lucky Charms & Cursed Spells",
    icon: <i className="ms ms-ability-flash text-purple-400 text-base" />,
    desc: "Statistical impact analysis pinpointing cards correlated with your highest wins and losses.",
    badge: "Intelligence",
  },
  {
    title: "Archetype Pace Matrix",
    icon: <i className="ms ms-battle text-rose-400 text-base" />,
    desc: "Classify and measure match pacing across Aggro, Midrange, Control, and Combo matchups.",
    badge: "Metagame",
  },
];

export const WhatsNewModal: React.FC<WhatsNewModalProps> = ({
  isOpen,
  onClose,
  onOpenCustomize,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 select-none">
      <div className="relative w-full max-w-2xl bg-neutral-950 border border-white/20 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header Ribbon */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-300 shadow-inner">
              <i className="ms ms-ability-party text-lg leading-none" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold uppercase tracking-widest text-amber-400">
                  Version 1.5.3 Update
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-400/10 text-amber-300 border border-amber-400/20">
                  NEW
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-display font-bold uppercase tracking-wider text-white">
                New Dashboard Widgets
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer rounded-none border border-transparent hover:border-white/10"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 custom-scrollbar">
          <p className="text-sm text-neutral-300 leading-relaxed font-sans">
            Your match intelligence dashboard is now fully modular and customizable! We have introduced brand new telemetry widgets to visualize every angle of your Magic: The Gathering Arena journey.
          </p>

          {/* Feature Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {NEW_WIDGET_FEATURES.map((feat) => (
              <div
                key={feat.title}
                className="p-3.5 bg-white/[0.02] border border-white/10 hover:border-white/20 transition-all flex flex-col gap-1.5 relative overflow-hidden"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {feat.icon}
                    <span className="font-sans font-bold text-sm text-neutral-100">
                      {feat.title}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 bg-white/[0.05] text-neutral-400 border border-white/10">
                    {feat.badge}
                  </span>
                </div>
                <p className="text-xs text-neutral-400 leading-normal font-sans">
                  {feat.desc}
                </p>
              </div>
            ))}
          </div>

          {/* Call to Action Banner */}
          <div className="p-4 bg-sky-950/30 border border-sky-500/30 flex items-start gap-3.5 relative overflow-hidden">
            <div className="p-2 bg-sky-500/10 border border-sky-500/30 text-sky-400 shrink-0 mt-0.5">
              <Sliders className="w-4 h-4" />
            </div>
            <div className="space-y-1">
              <div className="text-xs font-mono font-bold uppercase tracking-wider text-sky-300">
                Customize Your Dashboard
              </div>
              <p className="text-xs text-neutral-300 leading-relaxed font-sans">
                Click the <span className="font-bold text-white bg-white/10 px-1.5 py-0.5 rounded-sm border border-white/20">Customize</span> button in the top right of the dashboard at any time to add new widgets, drag to rearrange, resize cards, or personalize your color accents.
              </p>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-white/10 bg-white/[0.02] flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-mono font-semibold text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer border border-transparent hover:border-white/10 uppercase tracking-wider"
          >
            Got It
          </button>
          <button
            onClick={() => {
              onClose();
              onOpenCustomize();
            }}
            className="px-5 py-2 text-xs font-mono font-bold text-neutral-950 bg-amber-400 hover:bg-amber-300 active:scale-95 transition-all cursor-pointer flex items-center gap-2 uppercase tracking-wider shadow-lg shadow-amber-400/20"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-neutral-950" />
            Customize Dashboard
          </button>
        </div>
      </div>
    </div>
  );
};
