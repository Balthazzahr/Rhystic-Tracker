import React from 'react';

interface ManaFontPipProps {
  symbol: string;
  size?: number;
  className?: string;
}

const MS_CLASSES: Record<string, string> = {
  W: 'ms-w', U: 'ms-u', B: 'ms-b', R: 'ms-r', G: 'ms-g', C: 'ms-c',
  T: 'ms-tap', Q: 'ms-untap', S: 'ms-s',
  X: 'ms-x', Y: 'ms-y', Z: 'ms-z',
  '∞': 'ms-infinity',
};

// Hybrid pairs -> mana-font class (e.g. G/W -> ms-gw, W/P -> ms-wp).
function hybridClass(sym: string): string | null {
  const inner = sym.replace(/[()]/g, '');
  const hyb = inner.toLowerCase().replace('/', '');
  // Only treat 2-3 char combos made of mana letters (incl phyrexian P suffix)
  // as a mana-font hybrid glyph; otherwise fall back to rendering parts.
  if (!/^[wubrgcp0-9]{2,3}$/.test(hyb)) return null;
  const known = [
    'wu','wb','ub','ur','br','bg','rw','rg','gw','gu',
    '2w','2u','2b','2r','2g','cw','cu','cb','cr','cg',
    'wp','up','bp','rp','gp','wup','wbp','ubp','urp','brp','bgp','rwp','rgp','gwp','gup',
  ];
  if (known.includes(hyb)) return `ms-${hyb}`;
  return null;
}

export const ManaFontPip: React.FC<ManaFontPipProps> = ({ symbol, size = 16, className = '' }) => {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return null;

  const hc = hybridClass(sym);
  const cls = hc || MS_CLASSES[sym] || `ms-${sym.toLowerCase()}`;

  // .ms-cost draws a 1.3em circle and 0.95em glyph. Back-compute the font-size
  // so the visible pip diameter matches `size` (avoids clipping top/bottom).
  return (
    <span
      className={`ms ms-cost ${cls} inline-block shrink-0 leading-none ${className}`}
      style={{ fontSize: size * 0.8 }}
      aria-label={symbol}
    />
  );
};
