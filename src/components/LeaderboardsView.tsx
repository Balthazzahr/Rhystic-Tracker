import React, { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { GlassSearchInput } from './common';
import {
  LeaderboardCategory,
  LeaderboardSection,
  LeaderboardPodiumCard,
  LeaderboardDetailModal,
} from './leaderboards';

function isTokenCard(card: any): boolean {
  if (!card) return false;
  const name = (card.card_name || card.name || '').toLowerCase();
  const type = (card.card_type || '').toLowerCase();
  const rarity = (card.rarity || '').toLowerCase();
  if (type.includes('token') || rarity === 'token' || name.includes('token')) return true;
  if (type.includes('creature') && (!card.mana_cost || card.mana_cost.trim() === '')) return true;
  return false;
}

interface LeaderboardsViewProps {
  palette: any;
  onShowCard?: (card: { name: string; grp_id?: number }, isCommander?: boolean) => void;
}

export const LeaderboardsView: React.FC<LeaderboardsViewProps> = ({ palette, onShowCard }) => {
  const [loading, setLoading] = useState(true);
  const [leaderboards, setLeaderboards] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategory, setExpandedCategory] = useState<LeaderboardCategory | null>(null);

  useEffect(() => {
    loadLeaderboards();
  }, []);

  const loadLeaderboards = async () => {
    setLoading(true);
    try {
      const res: any = await invoke('get_global_leaderboards');
      setLeaderboards(res);
    } catch (err) {
      console.error('Failed to load leaderboards:', err);
    } finally {
      setLoading(false);
    }
  };

  const sections: LeaderboardSection[] = useMemo(
    () => [
      {
        domainId: 'combat',
        domainTitle: 'Combat Damage',
        domainSubtitle: 'Attacking power & battle strikes across combat phases',
        domainIconClass: 'ms ms-ability-menace',
        domainColor: '#D97706',
        categories: [
          {
            id: 'combat_single_hit',
            title: 'Highest Single-Hit Strike',
            subtitle: 'Haymakers — Most combat damage in a single swing',
            iconClass: 'ms ms-ability-trample',
            color: '#D97706',
            data: ((leaderboards?.combat_single_hit || []) as any[]).filter((c) => !isTokenCard(c)),
          },
          {
            id: 'combat_match_damage',
            title: 'Match Combat Record',
            subtitle: 'Juggernauts — Most combat damage in a single game',
            iconClass: 'ms ms-ability-double-strike',
            color: '#D97706',
            data: ((leaderboards?.combat_match_damage || []) as any[]).filter((c) => !isTokenCard(c)),
          },
          {
            id: 'combat_lifetime_damage',
            title: 'Lifetime Combat Dominance',
            subtitle: 'Pure Muscle — Total cumulative combat damage',
            iconClass: 'ms ms-ability-ferocious',
            color: '#D97706',
            data: ((leaderboards?.combat_lifetime_damage || []) as any[]).filter((c) => !isTokenCard(c)),
          },
        ],
      },
      {
        domainId: 'spells',
        domainTitle: 'Non-Combat (Spells & Abilities) Damage',
        domainSubtitle: 'Direct burns, triggered abilities, and multi-target board wipes',
        domainIconClass: 'ms ms-instant',
        domainColor: '#8B70CD',
        categories: [
          {
            id: 'spell_single_hit',
            title: 'Highest Single Cast / Hit',
            subtitle: 'Annihilators — Most damage in 1 cast (AoE summed)',
            iconClass: 'ms ms-ability-annihilator',
            color: '#8B70CD',
            data: ((leaderboards?.spell_single_hit || []) as any[]).filter((c) => !isTokenCard(c)),
          },
          {
            id: 'spell_match_damage',
            title: 'Match Spell Record',
            subtitle: 'Arcane Nukes — Most spell damage in a single game',
            iconClass: 'ms ms-instant',
            color: '#8B70CD',
            data: ((leaderboards?.spell_match_damage || []) as any[]).filter((c) => !isTokenCard(c)),
          },
          {
            id: 'spell_lifetime_damage',
            title: 'Lifetime Spell Dominance',
            subtitle: 'Spell Slingers — Total cumulative non-combat damage',
            iconClass: 'ms ms-planeswalker',
            color: '#8B70CD',
            data: ((leaderboards?.spell_lifetime_damage || []) as any[]).filter((c) => !isTokenCard(c)),
          },
        ],
      },
      {
        domainId: 'honors',
        domainTitle: 'Honors, Engine & Utility Dominance',
        domainSubtitle: 'Card advantage, cast frequencies, and match awards',
        domainIconClass: 'ms ms-ability-duels-renowned',
        domainColor: '#10B981',
        categories: [
          {
            id: 'most_decorated',
            title: 'Most Decorated Cards',
            subtitle: 'Honors — Most lifetime achievements won',
            iconClass: 'ms ms-ability-duels-renowned',
            color: '#10B981',
            data: ((leaderboards?.most_decorated || []) as any[]).filter((c) => !isTokenCard(c)),
          },
          {
            id: 'card_draw_engines',
            title: 'Card Draw Engines',
            subtitle: 'Gas In The Tank — Most total cards drawn',
            iconClass: 'ms ms-ability-cycling',
            color: '#10B981',
            data: ((leaderboards?.card_draw_engines || []) as any[]).filter((c) => !isTokenCard(c)),
          },
          {
            id: 'battlefield_stalwarts',
            title: 'Battlefield Stalwarts',
            subtitle: 'Trusty Steeds — Most times cast or played',
            iconClass: 'ms ms-ability-convoke',
            color: '#10B981',
            data: ((leaderboards?.battlefield_stalwarts || []) as any[]).filter((c) => !isTokenCard(c)),
          },
        ],
      },
    ],
    [leaderboards]
  );

  const isSearchActive = searchQuery.trim().length > 0;
  const cleanQuery = searchQuery.toLowerCase().trim();
  const accentColor = palette?.accent || '#A855F7';

  return (
    <div className="flex-1 min-h-0 flex flex-col space-y-3 px-8 py-4 overflow-hidden select-none">
      {/* 1. HEADER */}
      <div className="flex items-center justify-between pb-2 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="ms ms-ability-kicker text-2xl" style={{ color: accentColor }} />
          <h1 className="text-[26px] font-display font-bold tracking-[0.12em] uppercase text-white leading-none">
            LEADERBOARDS
          </h1>
          <span className="text-xs text-neutral-400 font-sans ml-2">
            (Top performers & all-time records across 9 combat & arcane domains)
          </span>
        </div>
      </div>

      {/* 2. TOP FILTER / SEARCH TOOLBAR */}
      <div className="shrink-0 flex items-center gap-2.5 pb-1 flex-wrap">
        <GlassSearchInput
          placeholder="Search for card..."
          value={searchQuery}
          onChange={setSearchQuery}
        />
      </div>

      {/* 3. MAIN SCROLLABLE CONTENT */}
      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-1 min-h-0">
        {loading ? (
          <div className="py-24 text-center text-xs font-mono uppercase tracking-wider text-neutral-500">
            Calculating Hall of Fame records...
          </div>
        ) : (
          sections.map((sec) => (
            <div key={sec.domainId} className="space-y-0">
              {/* 3 Columns Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {sec.categories.map((cat) => (
                  <LeaderboardPodiumCard
                    key={cat.id}
                    category={cat}
                    isSearchActive={isSearchActive}
                    cleanQuery={cleanQuery}
                    onExpand={setExpandedCategory}
                    onShowCard={onShowCard}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 4. EXPANDED MODAL (TOP 25 / SEARCH ALL CARDS) */}
      <LeaderboardDetailModal
        category={expandedCategory}
        onClose={() => setExpandedCategory(null)}
        onShowCard={onShowCard}
      />
    </div>
  );
};

export default LeaderboardsView;
