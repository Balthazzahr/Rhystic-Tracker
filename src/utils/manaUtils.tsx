import React from 'react';
import { ManaFontPip } from '../components/ManaFontPip';

export function parseMtgaManaCost(costStr?: string): string[] {
  if (!costStr) return [];

  // Handle standard MTG bracketed notation e.g. "{3}{W}{U}", "{G/W}", "{W/P}".
  const bracketMatches = costStr.match(/\{[^}]+\}/g);
  if (bracketMatches) {
    return bracketMatches.map((m) => m.replace(/[{}]/g, ''));
  }

  const clean = costStr.trim();

  // Handle MTGA raw encoded string notation e.g. "o3oWoU", "o5oBoBoB", "o(G/W)", "o2o(GU)",
  // "o0", "o15". A parenthesized group is a single hybrid/phyrexian symbol.
  if (clean.includes('o')) {
    const parts = clean.split('o').filter((p) => p.trim().length > 0);
    const symbols: string[] = [];
    for (const p of parts) {
      const upper = p.toUpperCase().trim();
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
          if (['W', 'U', 'B', 'R', 'G', 'C', 'X', 'S', 'E', 'T', 'Q'].includes(char)) {
            symbols.push(char);
          }
        }
      }
    }
    return symbols;
  }

  // Handle parenthesized hybrid tokens in strings like "2(G/U)" or "(G/U)"
  const parenMatches = clean.match(/\([^)]+\)|\d+|[WUBRGCX]/gi);
  if (parenMatches && parenMatches.length > 0) {
    return parenMatches.map((m) => m.replace(/[()]/g, '').toUpperCase());
  }

  // Fallback for single characters or numbers
  return [clean];
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
        <ManaFontPip key={idx} symbol={sym} size={size} />
      ))}
    </div>
  );
}
