import React from 'react';
import { ManaPip } from '../components/ManaPip';

export function parseMtgaManaCost(costStr?: string): string[] {
  if (!costStr) return [];

  // Handle standard MTG bracketed notation e.g. "{3}{W}{U}", "{G/W}", "{W/P}".
  const bracketMatches = costStr.match(/\{[^}]+\}/g);
  if (bracketMatches) {
    return bracketMatches.map(m => m.replace(/[{}]/g, ''));
  }

  // Handle MTGA raw encoded string notation e.g. "o3oWoU", "o5oBoBoB", "o(G/W)",
  // "o0", "o15". A parenthesized group is a single hybrid/phyrexian symbol.
  if (costStr.includes('o')) {
    const parts = costStr.split('o').filter(p => p.trim().length > 0);
    const symbols: string[] = [];
    for (const p of parts) {
      const upper = p.toUpperCase();
      // Parenthesized hybrid / phyrexian symbol e.g. "(G/W)", "(W/P)", "(2/W)".
      if (upper.startsWith('(') && upper.endsWith(')')) {
        const inner = upper.slice(1, -1);
        symbols.push(inner);
        continue;
      }
      // If it's a numeric cost e.g. "5" or "12"
      if (/^\d+$/.test(upper)) {
        if (upper !== '0') {
          symbols.push(upper);
        }
      } else {
        // Handle repeated color characters or single color e.g. "B" or "BBB"
        for (const char of upper) {
          if (['W', 'U', 'B', 'R', 'G', 'C', 'X'].includes(char)) {
            symbols.push(char);
          }
        }
      }
    }
    return symbols;
  }

  // Fallback for single characters or numbers
  return [costStr];
}

interface ManaCostProps {
  costStr?: string;
  size?: number;
}

export function RenderManaCost({ costStr, size = 14 }: ManaCostProps) {
  const symbols = parseMtgaManaCost(costStr);
  if (symbols.length === 0) return null;

  return (
    <div className="flex items-center gap-0.5 shrink-0">
      {symbols.map((sym, idx) => (
        <ManaPip key={idx} symbol={sym} size={size} />
      ))}
    </div>
  );
}
