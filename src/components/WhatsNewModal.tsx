import React from "react";
import { X, ExternalLink, Sliders, Layers } from "lucide-react";
import symbolIcon from "../assets/RhysticTrackerICON.svg";

interface WhatsNewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenDeckTracker?: () => void;
  onOpenSettings?: () => void;
}

const NEW_DECK_TRACKER_FEATURES = [
  {
    title: "Real-Time Deck Overlay",
    icon: <i className="ms ms-planeswalker text-amber-400 text-base" />,
    desc: "A dedicated always-on-top floating deck overlay that tracks every card left in your library, hands, battlefield, and graveyard.",
    badge: "Pop-Up Overlay",
  },
  {
    title: "Draw Probabilities Telemetry",
    icon: <i className="ms ms-land text-emerald-400 text-base" />,
    desc: "Dynamic hypergeometric draw chances for Lands, Creatures, and Spells updated live after every turn and draw.",
    badge: "Telemetry",
  },
  {
    title: "Brawl Commander Zone",
    icon: <i className="ms ms-loyalty text-sky-400 text-base" />,
    desc: "Dedicated Command Zone section pinned at the top for Brawl games with commander tax and status recognition.",
    badge: "Brawl & Commander",
  },
  {
    title: "Foldable Card Zones & Smart Memory",
    icon: <i className="ms ms-untap text-indigo-400 text-base" />,
    desc: "Fold up cards in hand, on the battlefield, or dead zone. Remembers your fold preferences, sort mode, and screen position across games.",
    badge: "Smart Memory",
  },
];

export const WhatsNewModal: React.FC<WhatsNewModalProps> = ({
  isOpen,
  onClose,
  onOpenDeckTracker,
  onOpenSettings,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 select-none">
      <div className="relative w-full max-w-2xl bg-neutral-950 border border-white/20 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header Ribbon */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-300 shadow-inner">
              <img src={symbolIcon} alt="Rhystic Tracker" className="w-5 h-5 object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold uppercase tracking-widest text-amber-400">
                  Version 1.8.0 Update
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 bg-amber-400/10 text-amber-300 border border-amber-400/20">
                  NEW
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-display font-bold uppercase tracking-wider text-white">
                Live Deck Tracker Pop-Up
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
            Introducing the standalone <strong className="text-white">Live Deck Tracker Pop-Up Window</strong>! Designed specifically for multi-monitor and single-screen MTGA players, you can now pop out an always-on-top, movable deck tracker window alongside your game.
          </p>

          {/* Feature Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {NEW_DECK_TRACKER_FEATURES.map((feat) => (
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

          {/* How It Works Explainer Banner */}
          <div className="p-4 bg-amber-950/20 border border-amber-500/30 flex items-start gap-3.5 relative overflow-hidden">
            <div className="p-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 shrink-0 mt-0.5">
              <Layers className="w-4 h-4" />
            </div>
            <div className="space-y-1">
              <div className="text-xs font-mono font-bold uppercase tracking-wider text-amber-300">
                How It Works & Setup
              </div>
              <p className="text-xs text-neutral-300 leading-relaxed font-sans">
                Pop it out anytime by clicking the <span className="font-bold text-white bg-white/10 px-1 py-0.5 border border-white/20">↗</span> pop-out icon on the Live Match HUD rail, or head to <strong className="text-white">Settings → General & Behavior</strong> to enable <span className="text-amber-300 font-semibold">"Auto-Open Live Deck Tracker Pop-Up"</span> so it automatically summons upon match start and remembers your chosen screen position.
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
          {onOpenSettings && (
            <button
              onClick={() => {
                onClose();
                onOpenSettings();
              }}
              className="px-4 py-2 text-xs font-mono font-semibold text-neutral-200 hover:text-white bg-white/[0.05] hover:bg-white/[0.1] transition-all cursor-pointer border border-white/10 uppercase tracking-wider flex items-center gap-1.5"
            >
              <Sliders className="w-3.5 h-3.5 text-neutral-400" />
              Configure Settings
            </button>
          )}
          {onOpenDeckTracker && (
            <button
              onClick={() => {
                onClose();
                onOpenDeckTracker();
              }}
              className="px-5 py-2 text-xs font-mono font-bold text-neutral-950 bg-amber-400 hover:bg-amber-300 active:scale-95 transition-all cursor-pointer flex items-center gap-2 uppercase tracking-wider shadow-lg shadow-amber-400/20"
            >
              <ExternalLink className="w-3.5 h-3.5 text-neutral-950" />
              Open Deck Tracker
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
