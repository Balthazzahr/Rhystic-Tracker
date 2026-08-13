import React from 'react';
import { CardItem } from './CardBreakdown';

interface HoverArtPreviewProps {
  card: CardItem | null;
  palette: any;
}

export function HoverArtPreview({ card, palette }: HoverArtPreviewProps) {
  if (!card) {
    return (
      <div 
        className="h-64 rounded-2xl border border-dashed flex flex-col items-center justify-center p-4 text-center space-y-1 transition-all"
        style={{ borderColor: `${palette?.border}88`, backgroundColor: `${palette?.surface}66` }}
      >
        <span className="text-xs font-mono opacity-40">Hover any card to preview artwork</span>
        <span className="text-[10px] font-mono opacity-25">Scryfall On-Demand Art Integration</span>
      </div>
    );
  }

  // Construct Scryfall image URL using card name
  const encodedName = encodeURIComponent(card.name);
  const imageUrl = `https://api.scryfall.com/cards/named?exact=${encodedName}&format=image&version=normal`;

  return (
    <div 
      className="h-64 rounded-2xl border p-2 flex flex-col items-center justify-center overflow-hidden shadow-2xl relative transition-all group"
      style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}
    >
      <img 
        src={imageUrl} 
        alt={card.name}
        className="h-full object-contain rounded-lg drop-shadow-md transition-transform duration-200 group-hover:scale-105"
        onError={(e) => {
          // Fallback to placeholder text on image fail
          (e.target as HTMLElement).style.display = 'none';
        }}
      />
      <div className="absolute bottom-2 left-2 right-2 bg-black/80 backdrop-blur-md p-1.5 rounded-lg border text-center truncate" style={{ borderColor: palette?.border }}>
        <p className="text-xs font-bold truncate" style={{ color: palette?.text }}>{card.name}</p>
        <p className="text-[9px] font-mono opacity-60">GRP ID: {card.grp_id} {card.set_code ? `• ${card.set_code}` : ''}</p>
      </div>
    </div>
  );
}
