import React, { useState } from 'react';
import { X, Sparkles, Check, ZoomIn, ZoomOut } from 'lucide-react';

interface BadgeMockupPlaygroundProps {
  onClose: () => void;
  palette?: any;
}

export const BadgeMockupPlayground: React.FC<BadgeMockupPlaygroundProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'card' | 'deck'>('card');
  const [cardStyle, setCardStyle] = useState<'s1' | 's2' | 's3'>('s1');
  const [deckStyle, setDeckStyle] = useState<'s1' | 's2' | 's3'>('s1');
  const [tierFilter, setTierFilter] = useState<'all' | 'gold' | 'silver' | 'bronze'>('all');
  const [scale50, setScale50] = useState(true); // Default to 50% larger viewer as requested

  // Sample card achievements for live preview
  const sampleCardAchievements = [
    {
      id: 'haymaker',
      title: 'HAYMAKER',
      category: 'Combat',
      mvpName: 'HALIYA, GUIDED BY LIGHT',
      mvpCardArt: '/mockups/gigantosaurus.jpg',
      awards: 15,
      cardsCount: 12,
    },
    {
      id: 'executioner',
      title: 'EXECUTIONER',
      category: 'Closer',
      mvpName: 'DELIGHTED HALFLING',
      mvpCardArt: '/mockups/elspeths_smite.jpg',
      awards: 19,
      cardsCount: 15,
    },
    {
      id: 'scoop_inducer',
      title: 'SCOOP INDUCER',
      category: 'Closer',
      mvpName: 'EMRAKUL, THE WORLD ANEW',
      mvpCardArt: '/mockups/gingerbrute.jpg',
      awards: 9,
      cardsCount: 8,
    },
  ];

  // Sample deck achievements for live preview
  const sampleDeckAchievements = [
    {
      id: 'haymaker',
      title: 'GENESIS',
      category: 'Deck Milestone',
      description: 'Pilot this deck to a 5+ consecutive game winning streak across competitive queues.',
      decksCount: 4,
    },
    {
      id: 'executioner',
      title: 'BLITZKRIEG',
      category: 'Deck Milestone',
      description: 'Deliver match-clinching lethal combat damage on or before Turn 4 in 3 separate matches.',
      decksCount: 2,
    },
    {
      id: 'scoop_inducer',
      title: 'ENDURANCE',
      category: 'Deck Milestone',
      description: 'Emerge victorious from a grueling marathon match lasting 15+ combat rounds.',
      decksCount: 6,
    },
  ];

  const cardStyleLabels = {
    s1: {
      name: 'Style 1: Winged Laurel MTG Frame',
      tag: 'Reference Match',
      desc: 'Exact reference match: Winged apex crest with ruby gem, 65% ascending side feather laurels, and a lower beveled title nameplate.',
    },
    s2: {
      name: 'Style 2: Sleek Beveled Modern',
      tag: 'Minimal / Clean',
      desc: 'Smooth beveled metallic card border with clean side rails and minimalist apex wing crest for maximal art viewing area.',
    },
    s3: {
      name: 'Style 3: High-Fantasy Ornate Filigree',
      tag: 'High Embellishment',
      desc: 'Elaborate filigree relief scrollwork along all four borders with ruby & sapphire accent jewels.',
    },
  };

  const deckStyleLabels = {
    s1: {
      name: 'Style 1: Outstretched Wings & Stitched Flap',
      tag: 'Reference Match',
      desc: 'Exact reference match: Stitched leather deckbox top flap with centered gem, outward golden angel wings, and bottom title plaque.',
    },
    s2: {
      name: 'Style 2: Contemporary Leather Deckbox',
      tag: 'Minimal / Clean',
      desc: 'Modern compact deckbox presentation with fine-grain stitched leather flap, geometric beveled chassis, and wide horizontal art viewing port.',
    },
    s3: {
      name: 'Style 3: Grand Laurel Arch & Velvet Plaque',
      tag: 'High Embellishment',
      desc: 'Flourishing corner filigree, curved arched opening, deep leather textures, and winged laurel medallion.',
    },
  };

  const tiers: Array<'gold' | 'silver' | 'bronze'> =
    tierFilter === 'all' ? ['gold', 'silver', 'bronze'] : [tierFilter];

  return (
    <div className="fixed inset-0 z-[99999] flex flex-col bg-neutral-950/95 backdrop-blur-2xl text-white select-none animate-in fade-in duration-200">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-neutral-900/60 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 border border-amber-500/40 bg-amber-500/10 flex items-center justify-center text-amber-400">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-display font-bold uppercase tracking-wider text-white">
                Interactive Achievement Badge Mockup Studio
              </h2>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 border border-amber-500/40 bg-amber-500/20 text-amber-300 uppercase">
                Test Environment
              </span>
            </div>
            <p className="text-xs font-sans text-neutral-400 mt-0.5">
              Compare 3 distinct styles for Card Achievements (portrait) & Deck Achievements (landscape) across Bronze, Silver, and Gold.
            </p>
          </div>
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="p-2 border border-white/10 hover:border-white/30 bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white transition-all cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Control Strip */}
      <div className="px-6 py-3 border-b border-white/10 bg-neutral-900/40 flex flex-wrap items-center justify-between gap-4 shrink-0">
        {/* Category Switcher: Card vs Deck */}
        <div className="flex items-center bg-black/40 border border-white/10 p-1 gap-1">
          <button
            onClick={() => setActiveTab('card')}
            className={`px-4 py-1.5 text-xs font-sans font-bold uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'card'
                ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300 shadow-sm'
                : 'text-neutral-400 hover:text-white border border-transparent'
            }`}
          >
            🎴 Card Achievements (Portrait)
          </button>
          <button
            onClick={() => setActiveTab('deck')}
            className={`px-4 py-1.5 text-xs font-sans font-bold uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'deck'
                ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300 shadow-sm'
                : 'text-neutral-400 hover:text-white border border-transparent'
            }`}
          >
            📦 Deck Achievements (Landscape)
          </button>
        </div>

        {/* Style Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono uppercase tracking-wider text-neutral-400 mr-1">
            Frame Style:
          </span>
          {(['s1', 's2', 's3'] as const).map((st) => {
            const isSelected = activeTab === 'card' ? cardStyle === st : deckStyle === st;
            const meta = activeTab === 'card' ? cardStyleLabels[st] : deckStyleLabels[st];
            return (
              <button
                key={st}
                onClick={() => (activeTab === 'card' ? setCardStyle(st) : setDeckStyle(st))}
                className={`px-3 py-1.5 text-xs font-mono uppercase tracking-wider border transition-all cursor-pointer flex items-center gap-1.5 ${
                  isSelected
                    ? 'border-amber-400 bg-amber-400/20 text-white font-bold shadow-[0_0_15px_rgba(251,191,36,0.25)]'
                    : 'border-white/10 hover:border-white/30 text-neutral-300 bg-white/5'
                }`}
              >
                <span>{st.toUpperCase()}</span>
                <span className="opacity-60 text-[10px]">({meta.tag})</span>
                {isSelected && <Check className="w-3 h-3 text-amber-300 ml-0.5" />}
              </button>
            );
          })}
        </div>

        {/* Zoom 50% Toggle */}
        <button
          onClick={() => setScale50(!scale50)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-wider border transition-all cursor-pointer ${
            scale50
              ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300 font-bold'
              : 'border-white/10 text-neutral-300 hover:text-white bg-white/5'
          }`}
        >
          {scale50 ? <ZoomOut className="w-3.5 h-3.5" /> : <ZoomIn className="w-3.5 h-3.5" />}
          <span>{scale50 ? 'Large (+50% Zoomed)' : 'Standard (100%)'}</span>
        </button>

        {/* Tier Filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono uppercase tracking-wider text-neutral-400 mr-1">
            Tiers:
          </span>
          {(['all', 'gold', 'silver', 'bronze'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTierFilter(t)}
              className={`px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider border transition-all cursor-pointer ${
                tierFilter === t
                  ? t === 'gold'
                    ? 'border-amber-500 bg-amber-500/20 text-amber-300 font-bold'
                    : t === 'silver'
                    ? 'border-slate-400 bg-slate-400/20 text-slate-200 font-bold'
                    : t === 'bronze'
                    ? 'border-orange-600 bg-orange-600/20 text-orange-300 font-bold'
                    : 'border-white bg-white/20 text-white font-bold'
                  : 'border-white/10 text-neutral-400 hover:text-white bg-black/20'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Style Description Banner */}
      <div className="px-6 py-2.5 bg-black/40 border-b border-white/5 flex items-center justify-between shrink-0">
        <div className="text-xs font-sans text-neutral-300 flex items-center gap-2">
          <span className="font-bold font-sans uppercase tracking-wider text-amber-400">
            {activeTab === 'card' ? cardStyleLabels[cardStyle].name : deckStyleLabels[deckStyle].name}:
          </span>
          <span className="text-neutral-400">
            {activeTab === 'card' ? cardStyleLabels[cardStyle].desc : deckStyleLabels[deckStyle].desc}
          </span>
        </div>
        <span className="text-[11px] font-mono text-neutral-500 uppercase">
          Pre-composited High-Res Assets · 60 FPS Native WebKit
        </span>
      </div>

      {/* Main Interactive Showcase Grid */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        <div className="max-w-7xl mx-auto space-y-12">
          {tiers.map((tier) => {
            const tierTitle = tier.toUpperCase();
            const tierBadgeColor =
              tier === 'gold'
                ? 'border-amber-500/50 bg-amber-500/15 text-amber-300'
                : tier === 'silver'
                ? 'border-slate-400/50 bg-slate-400/15 text-slate-200'
                : 'border-orange-700/50 bg-orange-900/30 text-orange-300';

            return (
              <div key={tier} className="space-y-5">
                {/* Tier Row Section Header */}
                <div className="flex items-center gap-3 border-b border-white/10 pb-2">
                  <span className={`text-xs font-mono font-bold uppercase tracking-wider px-2.5 py-0.5 border ${tierBadgeColor}`}>
                    {tierTitle} TIER
                  </span>
                  <span className="text-xs font-mono text-neutral-400">
                    {scale50 ? 'Showing +50% Enlarged Presentation for Visual Inspection' : 'Showing Standard Card View Footprint'}
                  </span>
                </div>

                {/* Card Achievements Showcase */}
                {activeTab === 'card' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {sampleCardAchievements.map((ach) => {
                      const badgeSrc = `/mockups/badges/badge_card_${ach.id}_${cardStyle}_${tier}.png`;

                      return (
                        <div
                          key={ach.title}
                          className={`shrink-0 p-5 border border-white/10 hover:border-white/30 bg-neutral-950/90 hover:bg-neutral-900/90 transition-all flex flex-col justify-between cursor-pointer group shadow-2xl mx-auto ${
                            scale50 ? 'w-[450px] min-h-[550px]' : 'w-[325px] h-[370px]'
                          }`}
                        >
                          {/* Card Top Header */}
                          <div className="w-full flex items-center justify-between pb-2 border-b border-white/10">
                            <h4 className={`${scale50 ? 'text-[20px]' : 'text-[17px]'} font-bold font-sans uppercase tracking-wide text-white truncate text-left flex-1`}>
                              {ach.title}
                            </h4>
                            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 border uppercase tracking-wider shrink-0 ${tierBadgeColor}`}>
                              {tier}
                            </span>
                          </div>

                          {/* Badge Graphic with Card Art Window */}
                          <div className={`relative flex items-center justify-center my-auto mx-auto group-hover:scale-105 transition-transform duration-300 ${
                            scale50 ? 'w-[315px] h-[360px]' : 'w-[210px] h-[185px]'
                          }`}>
                            <img
                              src={badgeSrc}
                              alt={`${ach.title} ${tier} badge`}
                              className="w-full h-full object-contain pointer-events-none drop-shadow-[0_12px_24px_rgba(0,0,0,0.9)]"
                            />
                          </div>

                          {/* Stats description */}
                          <div className="space-y-0.5 mb-1 text-center">
                            <p className={`${scale50 ? 'text-xs' : 'text-[11px]'} font-mono text-neutral-400 tabular-nums`}>
                              Awarded to <span className="text-white font-bold">{ach.cardsCount}</span> cards ({ach.awards}× total)
                            </p>
                          </div>

                          {/* Bottom Footer: MVP Card Preview */}
                          <div className="w-full pt-2 border-t border-white/10 flex items-center justify-between gap-2 text-xs font-mono">
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <div className={`${scale50 ? 'w-10 h-10' : 'w-8 h-8'} border border-white/15 overflow-hidden shrink-0 bg-neutral-900 shadow-sm`}>
                                <img
                                  src={ach.mvpCardArt}
                                  alt={ach.mvpName}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <div className="min-w-0 flex-1 text-left">
                                <span className="text-[9px] font-mono text-neutral-500 uppercase tracking-wider block leading-none">
                                  MVP
                                </span>
                                <span className={`${scale50 ? 'text-[14px]' : 'text-[12.5px]'} font-bold font-sans uppercase text-white truncate block tracking-wide`}>
                                  {ach.mvpName}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* Deck Achievements Showcase (Landscape Presentation) */
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {sampleDeckAchievements.map((ach) => {
                      const badgeSrc = `/mockups/badges/badge_deck_${ach.id}_${deckStyle}_${tier}.png`;

                      return (
                        <div
                          key={ach.title}
                          className={`p-5 border border-white/10 hover:border-white/30 bg-neutral-950/90 hover:bg-neutral-900/90 transition-all flex flex-col justify-between cursor-pointer group shadow-2xl mx-auto ${
                            scale50 ? 'w-[480px] min-h-[480px]' : 'w-full max-w-[380px] min-h-[340px]'
                          }`}
                        >
                          {/* Deck Top Header */}
                          <div className="w-full flex items-center justify-between pb-2 border-b border-white/10">
                            <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">
                              {ach.category}
                            </span>
                            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 border uppercase tracking-wider shrink-0 ${tierBadgeColor}`}>
                              {tier}
                            </span>
                          </div>

                          {/* Hero Deckbox Plaque Frame */}
                          <div className={`relative flex items-center justify-center my-auto mx-auto group-hover:scale-105 transition-transform duration-300 ${
                            scale50 ? 'w-full h-[270px]' : 'w-full h-[190px]'
                          }`}>
                            <img
                              src={badgeSrc}
                              alt={`${ach.title} deck badge`}
                              className="w-full h-full object-contain pointer-events-none drop-shadow-[0_12px_28px_rgba(0,0,0,0.95)]"
                            />
                          </div>

                          {/* Deck Description */}
                          <div className="text-center px-2">
                            <h4 className={`font-sans font-bold ${scale50 ? 'text-base' : 'text-sm'} uppercase tracking-wide text-white truncate`}>
                              {ach.title}
                            </h4>
                            <p className={`${scale50 ? 'text-xs' : 'text-[11px]'} font-sans text-neutral-300 line-clamp-2 mt-1 leading-relaxed`}>
                              {ach.description}
                            </p>
                          </div>

                          {/* Bottom Footer */}
                          <div className="w-full pt-2 border-t border-white/10 flex items-center justify-between text-xs font-mono text-neutral-400 mt-2">
                            <span className="tabular-nums text-neutral-300">
                              {ach.decksCount} {ach.decksCount === 1 ? 'deck' : 'decks'} awarded
                            </span>
                            <span className="text-amber-300 font-bold uppercase tracking-wider text-[10px]">
                              Inspect
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default BadgeMockupPlayground;
