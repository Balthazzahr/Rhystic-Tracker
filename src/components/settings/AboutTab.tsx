import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { MTG_COLORS } from './types';

export interface AboutTabProps {
  isSearching: boolean;
  matchAboutSummary: boolean;
  matchLegal: boolean;
  version: string;
}

export const AboutTab: React.FC<AboutTabProps> = ({
  isSearching,
  matchAboutSummary,
  matchLegal,
  version,
}) => {
  return (
    <div className="space-y-6">
      {/* App Summary */}
      {(matchAboutSummary || !isSearching) && (
        <div className="space-y-3">
          <div className="border-b border-white/10 pb-3 flex items-center justify-between">
            <div className="space-y-0.5">
              <h3 className="text-base font-bold font-sans uppercase tracking-wide text-white">
                Rhystic Tracker
              </h3>
              <p className="text-xs font-sans text-neutral-400">
                The Next-Generation Native MTG Arena Combat Analytics & Match Companion.
              </p>
            </div>
            <div className="text-right">
              <span className="text-sm font-mono font-bold" style={{ color: MTG_COLORS.gold.text }}>v{version}</span>
              <p className="text-[10px] font-mono text-neutral-500">Tauri 2.0 / Rust / React</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center pt-1">
            <div className="border border-white/10 bg-white/[0.02] p-2.5">
              <p className="text-[9px] font-mono uppercase text-neutral-500">Framework</p>
              <p className="text-xs font-mono font-bold text-white mt-0.5">Tauri 2.0</p>
            </div>
            <div className="border border-white/10 bg-white/[0.02] p-2.5">
              <p className="text-[9px] font-mono uppercase text-neutral-500">Engine</p>
              <p className="text-xs font-mono font-bold text-white mt-0.5">Rust (WebKit)</p>
            </div>
            <div className="border border-white/10 bg-white/[0.02] p-2.5">
              <p className="text-[9px] font-mono uppercase text-neutral-500">Database</p>
              <p className="text-xs font-mono font-bold text-white mt-0.5">SQLite 3</p>
            </div>
            <div className="border border-white/10 bg-white/[0.02] p-2.5">
              <p className="text-[9px] font-mono uppercase text-neutral-500">License</p>
              <p className="text-xs font-mono font-bold text-white mt-0.5" style={{ color: MTG_COLORS.green.text }}>Open Source</p>
            </div>
          </div>
        </div>
      )}

      {/* Legal Attribution */}
      {(matchLegal || !isSearching) && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center gap-2" style={{ color: MTG_COLORS.gold.text }}>
            <ShieldCheck className="w-4 h-4" />
            <span className="text-xs font-sans font-bold uppercase tracking-wider">
              Fan Content Policy & Legal Disclosures
            </span>
          </div>
          <div className="text-xs text-neutral-400 space-y-2 leading-relaxed font-sans border border-white/10 bg-white/[0.02] p-4">
            <p>
              <strong className="text-white">Rhystic Tracker</strong> is unofficial Fan Content permitted under the Wizards of the Coast Fan Content Policy. Not approved or endorsed by Wizards of the Coast. Portions of the materials used are property of Wizards of the Coast. © Wizards of the Coast LLC.
            </p>
            <p>
              Card metadata, symbol artwork, and mana pips are fetched via <strong className="text-white">Scryfall's API</strong> under Scryfall's Free Attribution License. Rhystic Tracker is free, open-source software built for the Magic: The Gathering community.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
