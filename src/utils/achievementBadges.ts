// Central Registry of Card Achievements and Custom SVG Badges

export type AchievementTier = 'bronze' | 'silver' | 'gold';

export interface AchievementCriteria {
  bronze: string;
  silver: string;
  gold: string;
}

export interface AchievementTierDescriptions {
  bronze: string;
  silver: string;
  gold: string;
}

export interface AchievementMeta {
  id: string;
  title: string;
  category: string;
  description: string;
  tierDescriptions: AchievementTierDescriptions;
  criteria: AchievementCriteria;
  flavorQuote: string;
  flavorAttribution: string;
}

export const ACHIEVEMENTS_REGISTRY: Record<string, AchievementMeta> = {
  scoop_inducer: {
    id: 'scoop_inducer',
    title: 'Scoop Inducer',
    category: 'Closer',
    description: 'Awarded when casting a 5+ mana card immediately compels the opponent to concede.',
    tierDescriptions: {
      bronze: 'Awarded when opponent scoops Round 6 or earlier with 20+ life after casting a 5+ mana card.',
      silver: 'Awarded when opponent scoops Round 5 or earlier with 25+ life after casting a 5+ mana card.',
      gold: 'Awarded when opponent scoops Round 4 or earlier with 25+ life after casting a 5+ mana card.',
    },
    criteria: {
      bronze: 'Opponent scoops ≤ Round 6 with ≥ 20 life after a 5+ mana card is cast.',
      silver: 'Opponent scoops ≤ Round 5 with ≥ 25 life after a 5+ mana card is cast.',
      gold: 'Opponent scoops ≤ Round 4 with ≥ 25 life after a 5+ mana card is cast.',
    },
    flavorQuote: 'All your plans, all your spells, all your dreams—swept away in an instant.',
    flavorAttribution: 'Door to Nothingness',
  },
  executioner: {
    id: 'executioner',
    title: 'Executioner',
    category: 'Closer',
    description: "Awarded to the creature or direct spell that delivers the final lethal strike reducing the opponent's life total to zero or below.",
    tierDescriptions: {
      bronze: 'Awarded for dealing the killing blow to an opponent who had ≤ 7 health before the hit.',
      silver: 'Awarded for dealing the killing blow to an opponent who had 8+ health before the hit.',
      gold: 'Awarded for dealing the killing blow to an opponent who had 15+ health before the hit.',
    },
    criteria: {
      bronze: 'Killing blow dealt when opponent had ≤ 7 health.',
      silver: 'Killing blow dealt when opponent had 8+ health.',
      gold: 'Killing blow dealt when opponent had 15+ health.',
    },
    flavorQuote: 'One touch is all that separates the living from memory.',
    flavorAttribution: 'Phage the Untouchable',
  },
  over_killer: {
    id: 'over_killer',
    title: 'Over-Killer',
    category: 'Closer',
    description: 'Awarded on a match-ending blow for inflicting devastating excess overkill damage beyond zero life.',
    tierDescriptions: {
      bronze: 'Awarded for dealing a match-winning blow with 7+ excess overkill damage beyond zero life.',
      silver: 'Awarded for dealing a match-winning blow with 10+ excess overkill damage beyond zero life.',
      gold: 'Awarded for dealing a match-winning blow with 15+ excess overkill damage beyond zero life.',
    },
    criteria: {
      bronze: 'Dealt 7+ excess overkill damage beyond zero life (7+ excess overkill).',
      silver: 'Dealt 10+ excess overkill damage beyond zero life (10+ excess overkill).',
      gold: 'Dealt 15+ excess overkill damage beyond zero life (15+ excess overkill).',
    },
    flavorQuote: "For when winning just isn't enough, leave nothing behind to bury.",
    flavorAttribution: 'Urza',
  },
  haymaker: {
    id: 'haymaker',
    title: 'Haymaker',
    category: 'Combat',
    description: 'Awarded to any creature or spell that connects with a massive single-hit strike to any target (player or permanent).',
    tierDescriptions: {
      bronze: 'Awarded for dealing 10+ damage in a single hit to any target.',
      silver: 'Awarded for dealing 20+ damage in a single hit to any target.',
      gold: 'Awarded for dealing 30+ damage in a single hit to any target.',
    },
    criteria: {
      bronze: 'Dealt 10+ damage in a single hit.',
      silver: 'Dealt 20+ damage in a single hit.',
      gold: 'Dealt 30+ damage in a single hit.',
    },
    flavorQuote: 'No warnings, no subtlety—just pure, unadulterated devastation.',
    flavorAttribution: 'Akroma, Angel of Wrath',
  },
  juggernaut: {
    id: 'juggernaut',
    title: 'Juggernaut',
    category: 'Combat',
    description: 'Awarded to an unstoppable card accumulating colossal cumulative damage across a single match.',
    tierDescriptions: {
      bronze: 'Awarded for dealing 25+ total cumulative damage across a match.',
      silver: 'Awarded for dealing 40+ total cumulative damage across a match.',
      gold: 'Awarded for dealing 60+ total cumulative damage across a match.',
    },
    criteria: {
      bronze: 'Dealt 25+ total damage across the match.',
      silver: 'Dealt 40+ total damage across the match.',
      gold: 'Dealt 60+ total damage across the match.',
    },
    flavorQuote: 'A storm of steel and stone that turns entire matches into rubble.',
    flavorAttribution: 'Ulamog',
  },
  hardened: {
    id: 'hardened',
    title: 'Hardened',
    category: 'Counters',
    description: 'Awarded to a creature accumulating power/toughness-boosting counters on itself across a match.',
    tierDescriptions: {
      bronze: 'Awarded for accumulating 7+ power/toughness counters on a single creature across a match.',
      silver: 'Awarded for accumulating 12+ power/toughness counters on a single creature across a match.',
      gold: 'Awarded for accumulating 20+ power/toughness counters on a single creature across a match.',
    },
    criteria: {
      bronze: 'Accumulated 7+ counters on a single creature.',
      silver: 'Accumulated 12+ counters on a single creature.',
      gold: 'Accumulated 20+ counters on a single creature.',
    },
    flavorQuote: 'Growth is not an event; it is an unstoppable physical inevitability.',
    flavorAttribution: 'Vorel of the Hull Clade',
  },
  ozolithic: {
    id: 'ozolithic',
    title: 'Ozolithic!',
    category: 'Counters',
    description: 'Awarded when a creature reaches monumental total power derived from counters.',
    tierDescriptions: {
      bronze: "Awarded for boosting a creature's total power to 25+ via counters.",
      silver: "Awarded for boosting a creature's total power to 50+ via counters.",
      gold: "Awarded for boosting a creature's total power to 75+ via counters.",
    },
    criteria: {
      bronze: 'Reached 25+ total power via counters.',
      silver: 'Reached 50+ total power via counters.',
      gold: 'Reached 75+ total power via counters.',
    },
    flavorQuote: 'Power is never truly lost on Ikoria—it merely finds a more terrifying vessel.',
    flavorAttribution: 'The Ozolith',
  },
  vampiric: {
    id: 'vampiric',
    title: 'Vampiric',
    category: 'Drain',
    description: 'Awarded to a card that leeches vitality directly from the opponent via non-combat aristocrat or drain triggers.',
    tierDescriptions: {
      bronze: 'Awarded for draining 10+ non-combat life from opponents across a match.',
      silver: 'Awarded for draining 20+ non-combat life from opponents across a match.',
      gold: 'Awarded for draining 30+ non-combat life from opponents across a match.',
    },
    criteria: {
      bronze: 'Drained 10+ life from opponent.',
      silver: 'Drained 20+ life from opponent.',
      gold: 'Drained 30+ life from opponent.',
    },
    flavorQuote: 'I have lived for millennia. Your heartbeat was always meant to sustain mine.',
    flavorAttribution: 'Sorin Markov',
  },
  negator: {
    id: 'negator',
    title: 'Negator',
    category: 'Control',
    description: "Awarded for countering an opponent's high-impact spells on the stack.",
    tierDescriptions: {
      bronze: 'Awarded for countering a high-value spell with mana value 5+ on the stack.',
      silver: 'Awarded for countering a high-value spell with mana value 7+ on the stack.',
      gold: 'Awarded for countering a massive spell with mana value 10+ on the stack.',
    },
    criteria: {
      bronze: 'Countered a spell with CMC 5+.',
      silver: 'Countered a spell with CMC 7+.',
      gold: 'Countered a spell with CMC ≥ 10.',
    },
    flavorQuote: "It was a masterpiece of arcane design. It's a shame it will never happen.",
    flavorAttribution: 'Jace Beleren',
  },
  sweeper: {
    id: 'sweeper',
    title: 'Sweeper',
    category: 'Removal',
    description: 'Awarded to a single spell that wipes out multiple opponent-controlled permanents simultaneously.',
    tierDescriptions: {
      bronze: 'Awarded for destroying or exiling 8+ opponent permanents in a single spell.',
      silver: 'Awarded for destroying or exiling 12+ opponent permanents in a single spell.',
      gold: 'Awarded for destroying or exiling 18+ opponent permanents in a single spell.',
    },
    criteria: {
      bronze: 'Destroyed or exiled 8+ opponent permanents at once.',
      silver: 'Destroyed or exiled 12+ opponent permanents at once.',
      gold: 'Destroyed or exiled 18+ opponent permanents at once.',
    },
    flavorQuote: 'Sweep the impure from our sight and let perfection reign.',
    flavorAttribution: 'Elesh Norn',
  },
  cataclysm: {
    id: 'cataclysm',
    title: 'Cataclysm',
    category: 'Removal',
    description: 'Awarded to a catastrophic spell destroying or exiling permanents across the entire battlefield.',
    tierDescriptions: {
      bronze: 'Awarded for destroying or exiling 12+ permanents across the entire battlefield in a single spell.',
      silver: 'Awarded for destroying or exiling 18+ permanents across the entire battlefield in a single spell.',
      gold: 'Awarded for destroying or exiling 25+ permanents across the entire battlefield in a single spell.',
    },
    criteria: {
      bronze: 'Destroyed or exiled 12+ total permanents across the board.',
      silver: 'Destroyed or exiled 18+ total permanents across the board.',
      gold: 'Destroyed or exiled 25+ total permanents across the board.',
    },
    flavorQuote: 'I will wipe mankind, whom I have created, from the face of the earth.',
    flavorAttribution: 'Wrath of God',
  },
  royal_assassin: {
    id: 'royal_assassin',
    title: 'Royal Assassin',
    category: 'Combat',
    description: 'Awarded to an individual creature or targeted removal card eliminating multiple opponent creatures across a match.',
    tierDescriptions: {
      bronze: 'Awarded for destroying or eliminating 3+ opponent creatures across a match.',
      silver: 'Awarded for destroying or eliminating 5+ opponent creatures across a match.',
      gold: 'Awarded for destroying or eliminating 7+ opponent creatures across a match.',
    },
    criteria: {
      bronze: 'Eliminated 3+ opponent creatures.',
      silver: 'Eliminated 5+ opponent creatures.',
      gold: 'Eliminated 7+ opponent creatures.',
    },
    flavorQuote: 'He does not boast. He does not threaten. He simply crosses another name off the list.',
    flavorAttribution: 'Royal Assassin',
  },
  ironclad: {
    id: 'ironclad',
    title: 'Ironclad',
    category: 'Defense',
    description: 'Awarded to a resilient creature absorbing heavy combat damage on block and surviving without dying.',
    tierDescriptions: {
      bronze: 'Awarded for absorbing 10+ combat damage in blocking without dying.',
      silver: 'Awarded for absorbing 15+ combat damage in blocking without dying.',
      gold: 'Awarded for absorbing 20+ combat damage in blocking without dying.',
    },
    criteria: {
      bronze: 'Absorbed 10+ combat damage on block without dying.',
      silver: 'Absorbed 15+ combat damage on block without dying.',
      gold: 'Absorbed 20+ combat damage on block without dying.',
    },
    flavorQuote: 'The strongest wall is not made of stone, but of unyielding discipline and iron will.',
    flavorAttribution: 'Arcades, the Strategist',
  },
  tax_collector: {
    id: 'tax_collector',
    title: 'Tax Collector',
    category: 'Resource',
    description: 'Awarded to a permanent whose taxing triggered ability is paid repeatedly by the opponent across a match.',
    tierDescriptions: {
      bronze: 'Awarded when opponents pay taxing triggers 4+ times across a match.',
      silver: 'Awarded when opponents pay taxing triggers 7+ times across a match.',
      gold: 'Awarded when opponents pay taxing triggers 10+ times across a match.',
    },
    criteria: {
      bronze: 'Opponent paid taxing trigger 4+ times.',
      silver: 'Opponent paid taxing trigger 7+ times.',
      gold: 'Opponent paid taxing trigger 10+ times.',
    },
    flavorQuote: 'Did you pay the one? I didn\'t think so.',
    flavorAttribution: 'Rhystic Study',
  },
  cat_burglar: {
    id: 'cat_burglar',
    title: 'Cat Burglar',
    category: 'Theft',
    description: "Awarded to a card stealing, reanimating, or casting cards from the opponent's hand or library.",
    tierDescriptions: {
      bronze: "Awarded for stealing 3+ cards from an opponent's hand or library across a match.",
      silver: "Awarded for stealing 5+ cards from an opponent's hand or library across a match.",
      gold: "Awarded for stealing 7+ cards from an opponent's hand or library across a match.",
    },
    criteria: {
      bronze: 'Stole or cast 3+ cards from opponent hand/library.',
      silver: 'Stole or cast 5+ cards from opponent hand/library.',
      gold: 'Stole or cast 7+ cards from opponent hand/library.',
    },
    flavorQuote: "What's yours is mine, and what's mine was probably yours five seconds ago.",
    flavorAttribution: 'Gonti, Lord of Luxury',
  },
  grand_larceny: {
    id: 'grand_larceny',
    title: 'Grand Larceny',
    category: 'Theft',
    description: "Awarded for taking direct control of permanents already on the opponent's battlefield.",
    tierDescriptions: {
      bronze: "Awarded for stealing control of 3+ permanents on the opponent's battlefield.",
      silver: "Awarded for stealing control of 5+ permanents on the opponent's battlefield.",
      gold: "Awarded for stealing control of 7+ permanents on the opponent's battlefield.",
    },
    criteria: {
      bronze: 'Stole 3+ permanents from the battlefield.',
      silver: 'Stole 5+ permanents from the battlefield.',
      gold: 'Stole 7+ permanents from the battlefield.',
    },
    flavorQuote: "Look at me. I'm the commander now.",
    flavorAttribution: 'Control Magic',
  },
  blinkmaster: {
    id: 'blinkmaster',
    title: 'Blinkmaster',
    category: 'Value',
    description: 'Awarded to a permanent exiled and returned directly to the battlefield repeatedly for ETB value.',
    tierDescriptions: {
      bronze: 'Awarded for flickering (exiled and returned to battlefield) 3+ times across a match.',
      silver: 'Awarded for flickering (exiled and returned to battlefield) 5+ times across a match.',
      gold: 'Awarded for flickering (exiled and returned to battlefield) 7+ times across a match.',
    },
    criteria: {
      bronze: 'Flickered / re-entered the battlefield 3+ times.',
      silver: 'Flickered / re-entered the battlefield 5+ times.',
      gold: 'Flickered / re-entered the battlefield 7+ times.',
    },
    flavorQuote: 'Time is merely a suggestion when reality bends to your cycle.',
    flavorAttribution: 'Yorion, Sky Nomad',
  },
  immortal: {
    id: 'immortal',
    title: 'Immortal',
    category: 'Value',
    description: 'Awarded to a creature returning to the battlefield from the graveyard across a match.',
    tierDescriptions: {
      bronze: 'Awarded for returning from the graveyard to the battlefield 3+ times across a match.',
      silver: 'Awarded for returning from the graveyard to the battlefield 5+ times across a match.',
      gold: 'Awarded for returning from the graveyard to the battlefield 7+ times across a match.',
    },
    criteria: {
      bronze: 'Returned from the graveyard 3+ times.',
      silver: 'Returned from the graveyard 5+ times.',
      gold: 'Returned from the graveyard 7+ times.',
    },
    flavorQuote: 'Death is a revolving door for those too stubborn to rest.',
    flavorAttribution: "Kroxa, Titan of Death's Hunger",
  },
  swarmer: {
    id: 'swarmer',
    title: 'Swarmer',
    category: 'Tokens',
    description: 'Awarded to a card spawning an overwhelming swarm of creature tokens across a match.',
    tierDescriptions: {
      bronze: 'Awarded for spawning 20+ creature tokens across a match.',
      silver: 'Awarded for spawning 35+ creature tokens across a match.',
      gold: 'Awarded for spawning 50+ creature tokens across a match.',
    },
    criteria: {
      bronze: 'Spawned 20+ creature tokens across the match.',
      silver: 'Spawned 35+ creature tokens across the match.',
      gold: 'Spawned 50+ creature tokens across the match.',
    },
    flavorQuote: 'One was annoying. Ten were alarming. A thousand is an extinction-level event.',
    flavorAttribution: 'Scute Swarm',
  },
  rhystic_tracker: {
    id: 'rhystic_tracker',
    title: 'Rhystic Tracker',
    category: 'Card Draw',
    description: 'Awarded to an engine drawing abundant extra cards throughout the course of a match.',
    tierDescriptions: {
      bronze: 'Awarded for drawing 6+ extra cards across a match.',
      silver: 'Awarded for drawing 8+ extra cards across a match.',
      gold: 'Awarded for drawing 12+ extra cards across a match.',
    },
    criteria: {
      bronze: 'Drew 6+ extra cards across the match.',
      silver: 'Drew 8+ extra cards across the match.',
      gold: 'Drew 12+ extra cards across the match.',
    },
    flavorQuote: 'Every card in hand is another equation solved in advance.',
    flavorAttribution: 'Niv-Mizzet, Parun',
  },
  mana_dynamo: {
    id: 'mana_dynamo',
    title: 'Mana Dynamo',
    category: 'Ramp',
    description: 'Awarded to a permanent generating explosive bursts of mana in a single turn.',
    tierDescriptions: {
      bronze: 'Awarded for generating 5+ mana in a single turn from this permanent.',
      silver: 'Awarded for generating 8+ mana in a single turn from this permanent.',
      gold: 'Awarded for generating 15+ mana in a single turn from this permanent.',
    },
    criteria: {
      bronze: 'Generated 5+ mana in a single turn.',
      silver: 'Generated 8+ mana in a single turn.',
      gold: 'Generated 15+ mana in a single turn.',
    },
    flavorQuote: 'Harnessing the raw energy of stars to fuel unimaginable spells.',
    flavorAttribution: 'Caged Sun',
  },
};

// Fallback metadata for dynamic or unknown achievement IDs
const DEFAULT_META: AchievementMeta = {
  id: 'unknown',
  title: 'Match Honor',
  category: 'Special',
  description: 'A notable achievement awarded for game-altering combat or strategic impact.',
  tierDescriptions: {
    bronze: 'Achieved Bronze tier milestone in match combat.',
    silver: 'Achieved Silver tier milestone in match combat.',
    gold: 'Achieved Gold tier milestone in match combat.',
  },
  criteria: {
    bronze: 'Achieved Bronze tier milestone.',
    silver: 'Achieved Silver tier milestone.',
    gold: 'Achieved Gold tier milestone.',
  },
  flavorQuote: 'Victory belongs to those who leave a mark upon the battlefield.',
  flavorAttribution: 'Rhystic Tracker',
};

// SVG Badge Asset Mapping via Vite eager glob
const BADGE_ASSETS = import.meta.glob('../assets/badges/*.svg', {
  eager: true,
  query: '?url',
  import: 'default'
}) as Record<string, string>;

/**
 * Normalizes title or ID strings into a standard registry key
 */
export function normalizeAchievementId(titleOrId: string): string {
  if (!titleOrId) return 'unknown';
  const clean = cleanAchievementTitle(titleOrId)
    .toLowerCase()
    .trim()
    .replace(/[!?,]/g, '')
    .replace(/[\s-]+/g, '_');
  
  if (clean === 'ozolithic') return 'ozolithic';
  if (clean === 'rhystic') return 'rhystic_tracker';
  return clean;
}

/**
 * Returns metadata for a given achievement title or ID
 */
export function getAchievementMeta(titleOrId: string): AchievementMeta {
  const key = normalizeAchievementId(titleOrId);
  return ACHIEVEMENTS_REGISTRY[key] || {
    ...DEFAULT_META,
    title: cleanAchievementTitle(titleOrId) || 'Match Honor'
  };
}

/**
 * Extracts explicit tier from title string if present (e.g. "Scoop Inducer (Gold)" -> "gold")
 */
export function extractTierFromTitle(title: string): AchievementTier | null {
  if (!title) return null;
  const lower = title.toLowerCase();
  if (lower.includes('(gold)') || lower.endsWith('gold')) return 'gold';
  if (lower.includes('(silver)') || lower.endsWith('silver')) return 'silver';
  if (lower.includes('(bronze)') || lower.endsWith('bronze')) return 'bronze';
  return null;
}

/**
 * Strips tier suffix from title string for clean display (e.g. "Scoop Inducer (Gold)" -> "Scoop Inducer")
 */
export function cleanAchievementTitle(title: string): string {
  if (!title) return '';
  return title
    .replace(/\s*\((Gold|Silver|Bronze|gold|silver|bronze)\)/gi, '')
    .trim();
}

/**
 * Default tier mapping from count (or fallback)
 */
export function getTierFromCount(count: number): AchievementTier {
  if (count >= 5) return 'gold';
  if (count >= 3) return 'silver';
  return 'bronze';
}

/**
 * Resolves the dynamic SVG URL for a badge
 */
export function getBadgeSvgUrl(titleOrId: string, tier: AchievementTier = 'bronze'): string | undefined {
  const key = normalizeAchievementId(titleOrId);
  const pathKey = `../assets/badges/${key}_${tier}.svg`;
  return BADGE_ASSETS[pathKey];
}
