import React, { useState, useEffect } from 'react';
import { ManaPip, MANA_TEXT_COLORS } from './ManaPip';

interface ManaFontPipProps {
  symbol: string;
  size?: number;
  className?: string;
  colorOverride?: string;
}

const MS_CLASSES: Record<string, string> = {
  W: 'ms-w', U: 'ms-u', B: 'ms-b', R: 'ms-r', G: 'ms-g', C: 'ms-c',
  T: 'ms-tap', Q: 'ms-untap', S: 'ms-s',
  X: 'ms-x', Y: 'ms-y', Z: 'ms-z',
  '∞': 'ms-infinity',
};

// Hybrid pairs -> mana-font class (e.g. G/W -> ms-gu, W/P -> ms-wp).
function hybridClass(sym: string): string | null {
  const inner = sym.replace(/[()]/g, '').trim();
  const hyb = inner.toLowerCase().replace('/', '');
  if (!/^[wubrgcp0-9]{2,3}$/.test(hyb)) return null;
  const known = [
    'wu','wb','ub','ur','br','bg','rw','rg','gw','gu',
    '2w','2u','2b','2r','2g','cw','cu','cb','cr','cg',
    'wp','up','bp','rp','gp','wup','wbp','ubp','urp','brp','bgp','rwp','rgp','gwp','gup',
  ];
  if (known.includes(hyb)) return `ms-${hyb}`;
  if (hyb.length === 2) {
    const rev = hyb[1] + hyb[0];
    if (known.includes(rev)) return `ms-${rev}`;
  }
  return null;
}

export const ManaFontPip: React.FC<ManaFontPipProps> = ({ symbol, size = 16, className = '', colorOverride }) => {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return null;

  const [manaPipStyle, setManaPipStyle] = useState<string>(() => {
    return localStorage.getItem('manaPipStyle') || 'graphic';
  });

  useEffect(() => {
    const handleSettingsChanged = () => {
      setManaPipStyle(localStorage.getItem('manaPipStyle') || 'graphic');
    };
    window.addEventListener('rhystic_settings_changed', handleSettingsChanged);
    return () => window.removeEventListener('rhystic_settings_changed', handleSettingsChanged);
  }, []);

  const cleanSym = sym.replace(/[{}]/g, '');

  // 1. Text Style: Always colored with authentic mana colors
  if (manaPipStyle === 'text') {
    const textColor = colorOverride || MANA_TEXT_COLORS[cleanSym] || '#94A3B8';
    return (
      <span 
        className={`inline-flex items-center justify-center font-mono font-bold tracking-tighter ${className}`}
        style={{
          fontSize: Math.max(9, Math.round(size * 0.7)),
          color: textColor,
          lineHeight: 1,
        }}
        title={`Mana {${cleanSym}}`}
      >
        {`{${cleanSym}}`}
      </span>
    );
  }

  // 2. Graphic Style (Default)
  if (manaPipStyle === 'graphic') {
    const isStandard = /^[WUBRGCX\d]+$/.test(cleanSym);
    if (isStandard) {
      return <ManaPip symbol={cleanSym} size={size} className={className} colorOverride={colorOverride} />;
    }
  }

  // 3. Vector Style (or fallback for complex symbols/hybrids)
  const hc = hybridClass(sym);
  const cls = hc || MS_CLASSES[sym] || `ms-${sym.toLowerCase()}`;

  return (
    <span
      className={`ms ms-cost ${cls} inline-block shrink-0 leading-none ${className}`}
      style={{ fontSize: size * 0.8 }}
      aria-label={symbol}
    />
  );
};
