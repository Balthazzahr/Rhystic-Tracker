// Central Registry of Card Achievements and Custom SVG Badges

export type AchievementTier = 'iron' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'legendary';

export interface AchievementCriteria {
  iron: string;
  bronze: string;
  silver: string;
  gold: string;
  platinum: string;
  legendary: string;
}

export interface AchievementTierDescriptions {
  iron: string;
  bronze: string;
  silver: string;
  gold: string;
  platinum: string;
  legendary: string;
}

export interface AchievementArtCard {
  name: string;
  setCode?: string;
  collectorNumber?: string;
  artist?: string;
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
  artCard?: AchievementArtCard;
}

export const ACHIEVEMENTS_REGISTRY: Record<string, AchievementMeta> = {
  scoop_inducer: {
    id: 'scoop_inducer',
    title: 'Scoop Inducer',
    category: 'Closer',
    description: 'Awarded when casting a 5+ mana card immediately compels the opponent to concede.',
    tierDescriptions: {
      iron: 'Awarded when opponent scoops Round 8 or earlier with 20+ life after casting a 5+ mana card.',
      bronze: 'Awarded when opponent scoops Round 7 or earlier with 20+ life after casting a 5+ mana card.',
      silver: 'Awarded when opponent scoops Round 6 or earlier with 25+ life after casting a 5+ mana card.',
      gold: 'Awarded when opponent scoops Round 5 or earlier with 25+ life after casting a 5+ mana card.',
      platinum: 'Awarded when opponent scoops Round 4 or earlier with 26+ life after casting a 5+ mana card.',
      legendary: 'Awarded when opponent scoops Round 3 or earlier with 30+ life after casting a 5+ mana card.',
    },
    criteria: {
      iron: 'Opponent scoops ≤ Round 8 with ≥ 20 life after a 5+ mana card is cast.',
      bronze: 'Opponent scoops ≤ Round 7 with ≥ 20 life after a 5+ mana card is cast.',
      silver: 'Opponent scoops ≤ Round 6 with ≥ 25 life after a 5+ mana card is cast.',
      gold: 'Opponent scoops ≤ Round 5 with ≥ 25 life after a 5+ mana card is cast.',
      platinum: 'Opponent scoops ≤ Round 4 with ≥ 26 life after a 5+ mana card is cast.',
      legendary: 'Opponent scoops ≤ Round 3 with ≥ 30 life after a 5+ mana card is cast.',
    },
    flavorQuote: 'All your plans, all your spells, all your dreams—swept away in an instant.',
    flavorAttribution: 'Door to Nothingness',
    artCard: {
      name: 'Gingerbrute',
      setCode: 'woe',
      collectorNumber: '246',
    },
  },
  executioner: {
    id: 'executioner',
    title: 'Executioner',
    category: 'Closer',
    description: "Awarded to the creature or direct spell that delivers the final lethal strike reducing the opponent\'s life total to zero or below.",
    tierDescriptions: {
      iron: 'Awarded for dealing the killing blow to an opponent who had ≤ 6 health before the hit.',
      bronze: 'Awarded for dealing the killing blow to an opponent who had ≤ 7 health before the hit.',
      silver: 'Awarded for dealing the killing blow to an opponent who had ≤ 9 health before the hit.',
      gold: 'Awarded for dealing the killing blow to an opponent who had ≤ 14 health before the hit.',
      platinum: 'Awarded for dealing the killing blow to an opponent who had ≤ 20 health before the hit.',
      legendary: 'Awarded for dealing the killing blow to an opponent who had ≤ 25 health before the hit.',
    },
    criteria: {
      iron: 'Killing blow dealt when opponent had ≤ 6 health.',
      bronze: 'Killing blow dealt when opponent had ≤ 7 health.',
      silver: 'Killing blow dealt when opponent had ≤ 9 health.',
      gold: 'Killing blow dealt when opponent had ≤ 14 health.',
      platinum: 'Killing blow dealt when opponent had ≤ 20 health.',
      legendary: 'Killing blow dealt when opponent had ≤ 25 health.',
    },
    flavorQuote: 'One touch is all that separates the living from memory.',
    flavorAttribution: 'Phage the Untouchable',
    artCard: {
      name: "Elspeth's Smite",
      setCode: 'mom',
      collectorNumber: '13',
      artist: 'Livia Prima',
    },
  },
  over_killer: {
    id: 'over_killer',
    title: 'Over-Killer',
    category: 'Closer',
    description: 'Awarded on a match-ending blow for inflicting devastating excess overkill damage beyond zero life.',
    tierDescriptions: {
      iron: 'Awarded for dealing a match-winning blow with 5+ excess overkill damage beyond zero life.',
      bronze: 'Awarded for dealing a match-winning blow with 7+ excess overkill damage beyond zero life.',
      silver: 'Awarded for dealing a match-winning blow with 10+ excess overkill damage beyond zero life.',
      gold: 'Awarded for dealing a match-winning blow with 15+ excess overkill damage beyond zero life.',
      platinum: 'Awarded for dealing a match-winning blow with 30+ excess overkill damage beyond zero life.',
      legendary: 'Awarded for dealing a match-winning blow with 50+ excess overkill damage beyond zero life.',
    },
    criteria: {
      iron: 'Dealt 5+ excess overkill damage beyond zero life.',
      bronze: 'Dealt 7+ excess overkill damage beyond zero life.',
      silver: 'Dealt 10+ excess overkill damage beyond zero life.',
      gold: 'Dealt 15+ excess overkill damage beyond zero life.',
      platinum: 'Dealt 30+ excess overkill damage beyond zero life.',
      legendary: 'Dealt 50+ excess overkill damage beyond zero life.',
    },
    flavorQuote: "For when winning just isn't enough, leave nothing behind to bury.",
    flavorAttribution: 'Urza',
    artCard: {
      name: 'Scorching Dragonfire',
      setCode: 'eld',
      collectorNumber: '139',
    },
  },
  haymaker: {
    id: 'haymaker',
    title: 'Haymaker',
    category: 'Combat',
    description: 'Awarded to any creature or spell that connects with a massive single-hit strike to any target (player or permanent).',
    tierDescriptions: {
      iron: 'Awarded for dealing 8+ damage in a single hit to any target.',
      bronze: 'Awarded for dealing 10+ damage in a single hit to any target.',
      silver: 'Awarded for dealing 12+ damage in a single hit to any target.',
      gold: 'Awarded for dealing 20+ damage in a single hit to any target.',
      platinum: 'Awarded for dealing 30+ damage in a single hit to any target.',
      legendary: 'Awarded for dealing 50+ damage in a single hit to any target.',
    },
    criteria: {
      iron: 'Dealt 8+ damage in a single hit.',
      bronze: 'Dealt 10+ damage in a single hit.',
      silver: 'Dealt 12+ damage in a single hit.',
      gold: 'Dealt 20+ damage in a single hit.',
      platinum: 'Dealt 30+ damage in a single hit.',
      legendary: 'Dealt 50+ damage in a single hit.',
    },
    flavorQuote: 'No warnings, no subtlety—just pure, unadulterated devastation.',
    flavorAttribution: 'Akroma, Angel of Wrath',
    artCard: {
      name: 'Savage Punch',
      setCode: 'ktk',
      collectorNumber: '146',
    },
  },
  juggernaut: {
    id: 'juggernaut',
    title: 'Juggernaut',
    category: 'Combat',
    description: 'Awarded to an unstoppable card accumulating colossal cumulative damage across a single match.',
    tierDescriptions: {
      iron: 'Awarded for dealing 20+ total cumulative damage across a match.',
      bronze: 'Awarded for dealing 25+ total cumulative damage across a match.',
      silver: 'Awarded for dealing 30+ total cumulative damage across a match.',
      gold: 'Awarded for dealing 40+ total cumulative damage across a match.',
      platinum: 'Awarded for dealing 50+ total cumulative damage across a match.',
      legendary: 'Awarded for dealing 100+ total cumulative damage across a match.',
    },
    criteria: {
      iron: 'Dealt 20+ total damage across the match.',
      bronze: 'Dealt 25+ total damage across the match.',
      silver: 'Dealt 30+ total damage across the match.',
      gold: 'Dealt 40+ total damage across the match.',
      platinum: 'Dealt 50+ total damage across the match.',
      legendary: 'Dealt 100+ total damage across the match.',
    },
    flavorQuote: 'A storm of steel and stone that turns entire matches into rubble.',
    flavorAttribution: 'Ulamog',
    artCard: {
      name: 'Darksteel Colossus',
      setCode: 'dst',
      collectorNumber: '109',
      artist: 'Carl Critchlow',
    },
  },
  hardened: {
    id: 'hardened',
    title: 'Hardened',
    category: 'Toughness',
    description: "Awarded to spells, equipment, or abilities that increase a creature\'s toughness.",
    tierDescriptions: {
      iron: 'Awarded for increasing a creature\'s toughness by 5+ via spells, equipment, or abilities.',
      bronze: 'Awarded for increasing a creature\'s toughness by 7+ via spells, equipment, or abilities.',
      silver: 'Awarded for increasing a creature\'s toughness by 10+ via spells, equipment, or abilities.',
      gold: 'Awarded for increasing a creature\'s toughness by 15+ via spells, equipment, or abilities.',
      platinum: 'Awarded for increasing a creature\'s toughness by 20+ via spells, equipment, or abilities.',
      legendary: 'Awarded for increasing a creature\'s toughness by 30+ via spells, equipment, or abilities.',
    },
    criteria: {
      iron: 'Boosted a creature\'s toughness by 5+.',
      bronze: 'Boosted a creature\'s toughness by 7+.',
      silver: 'Boosted a creature\'s toughness by 10+.',
      gold: 'Boosted a creature\'s toughness by 15+.',
      platinum: 'Boosted a creature\'s toughness by 20+.',
      legendary: 'Boosted a creature\'s toughness by 30+.',
    },
    flavorQuote: 'Armor may buckle, but true resolve hardens under fire.',
    flavorAttribution: 'Gideon Jura',
    artCard: {
      name: 'Hardened Scales',
      setCode: 'ktk',
      collectorNumber: '133',
    },
  },
  ozolithic: {
    id: 'ozolithic',
    title: 'Ozolithic!',
    category: 'Counters',
    description: 'Awarded to a card that places +1/+1 counters onto a creature.',
    tierDescriptions: {
      iron: 'Awarded for putting 5+ +1/+1 counters onto a creature across a match.',
      bronze: 'Awarded for putting 10+ +1/+1 counters onto a creature across a match.',
      silver: 'Awarded for putting 14+ +1/+1 counters onto a creature across a match.',
      gold: 'Awarded for putting 20+ +1/+1 counters onto a creature across a match.',
      platinum: 'Awarded for putting 30+ +1/+1 counters onto a creature across a match.',
      legendary: 'Awarded for putting 50+ +1/+1 counters onto a creature across a match.',
    },
    criteria: {
      iron: 'Placed 5+ +1/+1 counters on a creature.',
      bronze: 'Placed 10+ +1/+1 counters on a creature.',
      silver: 'Placed 14+ +1/+1 counters on a creature.',
      gold: 'Placed 20+ +1/+1 counters on a creature.',
      platinum: 'Placed 30+ +1/+1 counters on a creature.',
      legendary: 'Placed 50+ +1/+1 counters on a creature.',
    },
    flavorQuote: 'Power is never truly lost on Ikoria—it merely finds a more terrifying vessel.',
    flavorAttribution: 'The Ozolith',
    artCard: {
      name: 'The Ozolith',
      setCode: 'iko',
      collectorNumber: '237',
    },
  },
  vampiric: {
    id: 'vampiric',
    title: 'Vampiric',
    category: 'Drain',
    description: 'Awarded to a card that leeches vitality directly from the opponent via non-combat aristocrat or drain triggers.',
    tierDescriptions: {
      iron: 'Awarded for draining 5+ non-combat life from opponents across a match.',
      bronze: 'Awarded for draining 10+ non-combat life from opponents across a match.',
      silver: 'Awarded for draining 15+ non-combat life from opponents across a match.',
      gold: 'Awarded for draining 20+ non-combat life from opponents across a match.',
      platinum: 'Awarded for draining 25+ non-combat life from opponents across a match.',
      legendary: 'Awarded for draining 30+ non-combat life from opponents across a match.',
    },
    criteria: {
      iron: 'Drained 5+ life from opponent.',
      bronze: 'Drained 10+ life from opponent.',
      silver: 'Drained 15+ life from opponent.',
      gold: 'Drained 20+ life from opponent.',
      platinum: 'Drained 25+ life from opponent.',
      legendary: 'Drained 30+ life from opponent.',
    },
    flavorQuote: 'I have lived for millennia. Your heartbeat was always meant to sustain mine.',
    flavorAttribution: 'Sorin Markov',
    artCard: {
      name: 'Bankrupt in Blood',
      setCode: 'rna',
      collectorNumber: '62',
      artist: 'Seb McKinnon',
    },
  },
  negator: {
    id: 'negator',
    title: 'Negator',
    category: 'Control',
    description: "Awarded for countering an opponent\'s high-impact spells on the stack.",
    tierDescriptions: {
      iron: 'Awarded for countering an opponent spell with mana value 4+ on the stack.',
      bronze: 'Awarded for countering an opponent spell with mana value 5+ on the stack.',
      silver: 'Awarded for countering an opponent spell with mana value 6+ on the stack.',
      gold: 'Awarded for countering an opponent spell with mana value 7+ on the stack.',
      platinum: 'Awarded for countering an opponent spell with mana value 8+ on the stack.',
      legendary: 'Awarded for countering a massive spell with mana value 10+ on the stack.',
    },
    criteria: {
      iron: 'Countered a spell with CMC 4+.',
      bronze: 'Countered a spell with CMC 5+.',
      silver: 'Countered a spell with CMC 6+.',
      gold: 'Countered a spell with CMC 7+.',
      platinum: 'Countered a spell with CMC 8+.',
      legendary: 'Countered a spell with CMC ≥ 10.',
    },
    flavorQuote: "It was a masterpiece of arcane design. It's a shame it will never happen.",
    flavorAttribution: 'Jace Beleren',
    artCard: {
      name: 'Remand',
      setCode: 'rav',
      collectorNumber: '63',
      artist: 'Mark A. Nelson',
    },
  },
  sweeper: {
    id: 'sweeper',
    title: 'Sweeper',
    category: 'Removal',
    description: 'Awarded to a single spell that wipes out multiple opponent-controlled permanents simultaneously.',
    tierDescriptions: {
      iron: 'Awarded for destroying or exiling 6+ opponent permanents in a single spell.',
      bronze: 'Awarded for destroying or exiling 7+ opponent permanents in a single spell.',
      silver: 'Awarded for destroying or exiling 8+ opponent permanents in a single spell.',
      gold: 'Awarded for destroying or exiling 10+ opponent permanents in a single spell.',
      platinum: 'Awarded for destroying or exiling 15+ opponent permanents in a single spell.',
      legendary: 'Awarded for destroying or exiling 20+ opponent permanents in a single spell.',
    },
    criteria: {
      iron: 'Destroyed or exiled 6+ opponent permanents at once.',
      bronze: 'Destroyed or exiled 7+ opponent permanents at once.',
      silver: 'Destroyed or exiled 8+ opponent permanents at once.',
      gold: 'Destroyed or exiled 10+ opponent permanents at once.',
      platinum: 'Destroyed or exiled 15+ opponent permanents at once.',
      legendary: 'Destroyed or exiled 20+ opponent permanents at once.',
    },
    flavorQuote: 'Sweep the impure from our sight and let perfection reign.',
    flavorAttribution: 'Elesh Norn',
    artCard: {
      name: 'Day of Judgment',
      setCode: 'm12',
      collectorNumber: '12',
      artist: 'Vincent Proce',
    },
  },
  cataclysm: {
    id: 'cataclysm',
    title: 'Cataclysm',
    category: 'Removal',
    description: 'Awarded to a catastrophic spell destroying or exiling permanents across the entire battlefield.',
    tierDescriptions: {
      iron: 'Awarded for destroying or exiling 10+ permanents across the entire battlefield in a single spell.',
      bronze: 'Awarded for destroying or exiling 12+ permanents across the entire battlefield in a single spell.',
      silver: 'Awarded for destroying or exiling 14+ permanents across the entire battlefield in a single spell.',
      gold: 'Awarded for destroying or exiling 18+ permanents across the entire battlefield in a single spell.',
      platinum: 'Awarded for destroying or exiling 25+ permanents across the entire battlefield in a single spell.',
      legendary: 'Awarded for destroying or exiling 30+ permanents across the entire battlefield in a single spell.',
    },
    criteria: {
      iron: 'Destroyed or exiled 10+ total permanents across the board.',
      bronze: 'Destroyed or exiled 12+ total permanents across the board.',
      silver: 'Destroyed or exiled 14+ total permanents across the board.',
      gold: 'Destroyed or exiled 18+ total permanents across the board.',
      platinum: 'Destroyed or exiled 25+ total permanents across the board.',
      legendary: 'Destroyed or exiled 30+ total permanents across the board.',
    },
    flavorQuote: 'I will wipe mankind, whom I have created, from the face of the earth.',
    flavorAttribution: 'Wrath of God',
    artCard: {
      name: 'Doomskar',
      setCode: 'khm',
      collectorNumber: '9',
    },
  },
  royal_assassin: {
    id: 'royal_assassin',
    title: 'Royal Assassin',
    category: 'Combat',
    description: 'Awarded to an individual creature or targeted removal card eliminating multiple opponent creatures across a match.',
    tierDescriptions: {
      iron: 'Awarded for destroying or eliminating 2+ opponent creatures across a match.',
      bronze: 'Awarded for destroying or eliminating 3+ opponent creatures across a match.',
      silver: 'Awarded for destroying or eliminating 4+ opponent creatures across a match.',
      gold: 'Awarded for destroying or eliminating 5+ opponent creatures across a match.',
      platinum: 'Awarded for destroying or eliminating 8+ opponent creatures across a match.',
      legendary: 'Awarded for destroying or eliminating 10+ opponent creatures across a match.',
    },
    criteria: {
      iron: 'Eliminated 2+ opponent creatures.',
      bronze: 'Eliminated 3+ opponent creatures.',
      silver: 'Eliminated 4+ opponent creatures.',
      gold: 'Eliminated 5+ opponent creatures.',
      platinum: 'Eliminated 8+ opponent creatures.',
      legendary: 'Eliminated 10+ opponent creatures.',
    },
    flavorQuote: 'He does not boast. He does not threaten. He simply crosses another name off the list.',
    flavorAttribution: 'Royal Assassin',
    artCard: {
      name: 'Hired Blade',
      setCode: 'm19',
      collectorNumber: '100',
      artist: 'Mark Behm',
    },
  },
  ironclad: {
    id: 'ironclad',
    title: 'Ironclad',
    category: 'Defense',
    description: 'Awarded to a resilient creature absorbing heavy combat damage on block and surviving without dying.',
    tierDescriptions: {
      iron: 'Awarded for absorbing 8+ combat damage in blocking without dying.',
      bronze: 'Awarded for absorbing 10+ combat damage in blocking without dying.',
      silver: 'Awarded for absorbing 12+ combat damage in blocking without dying.',
      gold: 'Awarded for absorbing 16+ combat damage in blocking without dying.',
      platinum: 'Awarded for absorbing 20+ combat damage in blocking without dying.',
      legendary: 'Awarded for absorbing 25+ combat damage in blocking without dying.',
    },
    criteria: {
      iron: 'Absorbed 8+ combat damage on block without dying.',
      bronze: 'Absorbed 10+ combat damage on block without dying.',
      silver: 'Absorbed 12+ combat damage on block without dying.',
      gold: 'Absorbed 16+ combat damage on block without dying.',
      platinum: 'Absorbed 20+ combat damage on block without dying.',
      legendary: 'Absorbed 25+ combat damage on block without dying.',
    },
    flavorQuote: 'The strongest wall is not made of stone, but of unyielding discipline and iron will.',
    flavorAttribution: 'Arcades, the Strategist',
    artCard: {
      name: 'Darksteel Colossus',
      setCode: 'dst',
      collectorNumber: '109',
      artist: 'Carl Critchlow',
    },
  },
  tax_collector: {
    id: 'tax_collector',
    title: 'Tax Collector',
    category: 'Resource',
    description: 'Awarded to a permanent whose taxing triggered ability is paid repeatedly by the opponent across a match.',
    tierDescriptions: {
      iron: 'Awarded when opponents pay taxing triggers 2+ times across a match.',
      bronze: 'Awarded when opponents pay taxing triggers 4+ times across a match.',
      silver: 'Awarded when opponents pay taxing triggers 6+ times across a match.',
      gold: 'Awarded when opponents pay taxing triggers 8+ times across a match.',
      platinum: 'Awarded when opponents pay taxing triggers 10+ times across a match.',
      legendary: 'Awarded when opponents pay taxing triggers 20+ times across a match.',
    },
    criteria: {
      iron: 'Opponent paid taxing trigger 2+ times.',
      bronze: 'Opponent paid taxing trigger 4+ times.',
      silver: 'Opponent paid taxing trigger 6+ times.',
      gold: 'Opponent paid taxing trigger 8+ times.',
      platinum: 'Opponent paid taxing trigger 10+ times.',
      legendary: 'Opponent paid taxing trigger 20+ times.',
    },
    flavorQuote: 'Did you pay the one? I didn\'t think so.',
    flavorAttribution: 'Rhystic Study',
    artCard: {
      name: 'Smothering Tithe',
      setCode: 'rna',
      collectorNumber: '22',
    },
  },
  cat_burglar: {
    id: 'cat_burglar',
    title: 'Cat Burglar',
    category: 'Theft',
    description: "Awarded to a card stealing, reanimating, or casting cards from the opponent\'s hand or library.",
    tierDescriptions: {
      iron: 'Awarded for stealing 2+ cards from an opponent\'s hand or library across a match.',
      bronze: 'Awarded for stealing 3+ cards from an opponent\'s hand or library across a match.',
      silver: 'Awarded for stealing 4+ cards from an opponent\'s hand or library across a match.',
      gold: 'Awarded for stealing 5+ cards from an opponent\'s hand or library across a match.',
      platinum: 'Awarded for stealing 8+ cards from an opponent\'s hand or library across a match.',
      legendary: 'Awarded for stealing 10+ cards from an opponent\'s hand or library across a match.',
    },
    criteria: {
      iron: 'Stole or cast 2+ cards from opponent hand/library.',
      bronze: 'Stole or cast 3+ cards from opponent hand/library.',
      silver: 'Stole or cast 4+ cards from opponent hand/library.',
      gold: 'Stole or cast 5+ cards from opponent hand/library.',
      platinum: 'Stole or cast 8+ cards from opponent hand/library.',
      legendary: 'Stole or cast 10+ cards from opponent hand/library.',
    },
    flavorQuote: "What's yours is mine, and what's mine was probably yours five seconds ago.",
    flavorAttribution: 'Gonti, Lord of Luxury',
    artCard: {
      name: 'Robber of the Rich',
      setCode: 'eld',
      collectorNumber: '138',
    },
  },
  grand_larceny: {
    id: 'grand_larceny',
    title: 'Grand Larceny',
    category: 'Theft',
    description: "Awarded for taking direct control of permanents already on the opponent\'s battlefield.",
    tierDescriptions: {
      iron: 'Awarded for stealing control of 2+ permanents on the opponent\'s battlefield.',
      bronze: 'Awarded for stealing control of 3+ permanents on the opponent\'s battlefield.',
      silver: 'Awarded for stealing control of 4+ permanents on the opponent\'s battlefield.',
      gold: 'Awarded for stealing control of 5+ permanents on the opponent\'s battlefield.',
      platinum: 'Awarded for stealing control of 8+ permanents on the opponent\'s battlefield.',
      legendary: 'Awarded for stealing control of 10+ permanents on the opponent\'s battlefield.',
    },
    criteria: {
      iron: 'Stole 2+ permanents from the battlefield.',
      bronze: 'Stole 3+ permanents from the battlefield.',
      silver: 'Stole 4+ permanents from the battlefield.',
      gold: 'Stole 5+ permanents from the battlefield.',
      platinum: 'Stole 8+ permanents from the battlefield.',
      legendary: 'Stole 10+ permanents from the battlefield.',
    },
    flavorQuote: "Look at me. I'm the commander now.",
    flavorAttribution: 'Control Magic',
    artCard: {
      name: 'Hostage Taker',
      setCode: 'xln',
      collectorNumber: '223',
    },
  },
  blinkmaster: {
    id: 'blinkmaster',
    title: 'Blinkmaster',
    category: 'Value',
    description: 'Awarded to a permanent exiled and returned directly to the battlefield repeatedly for ETB value.',
    tierDescriptions: {
      iron: 'Awarded for flickering (exiled and returned to battlefield) 2+ times across a match.',
      bronze: 'Awarded for flickering (exiled and returned to battlefield) 3+ times across a match.',
      silver: 'Awarded for flickering (exiled and returned to battlefield) 5+ times across a match.',
      gold: 'Awarded for flickering (exiled and returned to battlefield) 7+ times across a match.',
      platinum: 'Awarded for flickering (exiled and returned to battlefield) 10+ times across a match.',
      legendary: 'Awarded for flickering (exiled and returned to battlefield) 15+ times across a match.',
    },
    criteria: {
      iron: 'Flickered / re-entered the battlefield 2+ times.',
      bronze: 'Flickered / re-entered the battlefield 3+ times.',
      silver: 'Flickered / re-entered the battlefield 5+ times.',
      gold: 'Flickered / re-entered the battlefield 7+ times.',
      platinum: 'Flickered / re-entered the battlefield 10+ times.',
      legendary: 'Flickered / re-entered the battlefield 15+ times.',
    },
    flavorQuote: 'Time is merely a suggestion when reality bends to your cycle.',
    flavorAttribution: 'Yorion, Sky Nomad',
    artCard: {
      name: 'Ephemerate',
      setCode: 'sta',
      collectorNumber: '5',
    },
  },
  immortal: {
    id: 'immortal',
    title: 'Immortal',
    category: 'Value',
    description: 'Awarded to a creature returning to the battlefield from the graveyard across a match.',
    tierDescriptions: {
      iron: 'Awarded for returning from the graveyard to the battlefield 2+ times across a match.',
      bronze: 'Awarded for returning from the graveyard to the battlefield 3+ times across a match.',
      silver: 'Awarded for returning from the graveyard to the battlefield 4+ times across a match.',
      gold: 'Awarded for returning from the graveyard to the battlefield 5+ times across a match.',
      platinum: 'Awarded for returning from the graveyard to the battlefield 6+ times across a match.',
      legendary: 'Awarded for returning from the graveyard to the battlefield 7+ times across a match.',
    },
    criteria: {
      iron: 'Returned from the graveyard 2+ times.',
      bronze: 'Returned from the graveyard 3+ times.',
      silver: 'Returned from the graveyard 4+ times.',
      gold: 'Returned from the graveyard 5+ times.',
      platinum: 'Returned from the graveyard 6+ times.',
      legendary: 'Returned from the graveyard 7+ times.',
    },
    flavorQuote: 'Death is a revolving door for those too stubborn to rest.',
    flavorAttribution: "Kroxa, Titan of Death's Hunger",
    artCard: {
      name: 'Squee, the Immortal',
      setCode: 'dom',
      collectorNumber: '146',
    },
  },
  swarmer: {
    id: 'swarmer',
    title: 'Swarmer',
    category: 'Tokens',
    description: 'Awarded to a card spawning an overwhelming swarm of creature tokens across a match.',
    tierDescriptions: {
      iron: 'Awarded for spawning 10+ creature tokens across a match.',
      bronze: 'Awarded for spawning 20+ creature tokens across a match.',
      silver: 'Awarded for spawning 30+ creature tokens across a match.',
      gold: 'Awarded for spawning 40+ creature tokens across a match.',
      platinum: 'Awarded for spawning 50+ creature tokens across a match.',
      legendary: 'Awarded for spawning 100+ creature tokens across a match.',
    },
    criteria: {
      iron: 'Spawned 10+ creature tokens across the match.',
      bronze: 'Spawned 20+ creature tokens across the match.',
      silver: 'Spawned 30+ creature tokens across the match.',
      gold: 'Spawned 40+ creature tokens across the match.',
      platinum: 'Spawned 50+ creature tokens across the match.',
      legendary: 'Spawned 100+ creature tokens across the match.',
    },
    flavorQuote: 'One was annoying. Ten were alarming. A thousand is an extinction-level event.',
    flavorAttribution: 'Scute Swarm',
    artCard: {
      name: 'Scute Swarm',
      setCode: 'znr',
      collectorNumber: '203',
    },
  },
  rhystic_tracker: {
    id: 'rhystic_tracker',
    title: 'Rhystic Tracker',
    category: 'Card Draw',
    description: 'Awarded to an engine drawing abundant extra cards throughout the course of a match.',
    tierDescriptions: {
      iron: 'Awarded for drawing 4+ extra cards across a match.',
      bronze: 'Awarded for drawing 5+ extra cards across a match.',
      silver: 'Awarded for drawing 6+ extra cards across a match.',
      gold: 'Awarded for drawing 8+ extra cards across a match.',
      platinum: 'Awarded for drawing 12+ extra cards across a match.',
      legendary: 'Awarded for drawing 15+ extra cards across a match.',
    },
    criteria: {
      iron: 'Drew 4+ extra cards across the match.',
      bronze: 'Drew 5+ extra cards across the match.',
      silver: 'Drew 6+ extra cards across the match.',
      gold: 'Drew 8+ extra cards across the match.',
      platinum: 'Drew 12+ extra cards across the match.',
      legendary: 'Drew 15+ extra cards across the match.',
    },
    flavorQuote: 'Every card in hand is another equation solved in advance.',
    flavorAttribution: 'Niv-Mizzet, Parun',
    artCard: {
      name: 'Rhystic Study',
      setCode: 'wot',
      collectorNumber: '25',
      artist: 'Serena Malyon',
    },
  },
  mana_dynamo: {
    id: 'mana_dynamo',
    title: 'Mana Dynamo',
    category: 'Ramp',
    description: 'Awarded to a permanent generating explosive bursts of mana in a single turn.',
    tierDescriptions: {
      iron: 'Awarded for generating 4+ mana in a single turn from this permanent.',
      bronze: 'Awarded for generating 5+ mana in a single turn from this permanent.',
      silver: 'Awarded for generating 6+ mana in a single turn from this permanent.',
      gold: 'Awarded for generating 7+ mana in a single turn from this permanent.',
      platinum: 'Awarded for generating 8+ mana in a single turn from this permanent.',
      legendary: 'Awarded for generating 10+ mana in a single turn from this permanent.',
    },
    criteria: {
      iron: 'Generated 4+ mana in a single turn.',
      bronze: 'Generated 5+ mana in a single turn.',
      silver: 'Generated 6+ mana in a single turn.',
      gold: 'Generated 7+ mana in a single turn.',
      platinum: 'Generated 8+ mana in a single turn.',
      legendary: 'Generated 10+ mana in a single turn.',
    },
    flavorQuote: 'Harnessing the raw energy of stars to fuel unimaginable spells.',
    flavorAttribution: 'Caged Sun',
    artCard: {
      name: 'Worn Powerstone',
      setCode: 'brr',
      collectorNumber: '65',
    },
  },
  brain_freeze: {
    id: 'brain_freeze',
    title: 'Brain Freeze',
    category: 'Mill',
    description: 'Awarded to a mill engine eroding libraries into graveyards across a match.',
    tierDescriptions: {
      iron: 'Awarded for milling 10+ cards across a match.',
      bronze: 'Awarded for milling 15+ cards across a match.',
      silver: 'Awarded for milling 20+ cards across a match.',
      gold: 'Awarded for milling 30+ cards across a match.',
      platinum: 'Awarded for milling 40+ cards across a match.',
      legendary: 'Awarded for milling 50+ cards across a match.',
    },
    criteria: {
      iron: 'Milled 10+ cards across the match.',
      bronze: 'Milled 15+ cards across the match.',
      silver: 'Milled 20+ cards across the match.',
      gold: 'Milled 30+ cards across the match.',
      platinum: 'Milled 40+ cards across the match.',
      legendary: 'Milled 50+ cards across the match.',
    },
    flavorQuote: 'A single thought can shatter a mind when given enough echo.',
    flavorAttribution: 'Brain Freeze',
    artCard: {
      name: 'Brain Freeze',
      setCode: 'dmr',
      collectorNumber: '46',
    },
  },
  bouncer: {
    id: 'bouncer',
    title: 'Bouncer',
    category: 'Tempo',
    description: "Awarded to cards returning opponent permanents from the battlefield back to their owner\'s hand.",
    tierDescriptions: {
      iron: 'Awarded for bouncing 4+ opponent permanents across a match.',
      bronze: 'Awarded for bouncing 5+ opponent permanents across a match.',
      silver: 'Awarded for bouncing 6+ opponent permanents across a match.',
      gold: 'Awarded for bouncing 7+ opponent permanents across a match.',
      platinum: 'Awarded for bouncing 8+ opponent permanents across a match.',
      legendary: 'Awarded for bouncing 10+ opponent permanents across a match.',
    },
    criteria: {
      iron: 'Bounced 4+ opponent permanents across the match.',
      bronze: 'Bounced 5+ opponent permanents across the match.',
      silver: 'Bounced 6+ opponent permanents across the match.',
      gold: 'Bounced 7+ opponent permanents across the match.',
      platinum: 'Bounced 8+ opponent permanents across the match.',
      legendary: 'Bounced 10+ opponent permanents across the match.',
    },
    flavorQuote: "You're not on the guest list. Out.",
    flavorAttribution: 'Cyclonic Rift',
    artCard: {
      name: 'Cyclonic Rift',
      setCode: 'rtr',
      collectorNumber: '35',
    },
  },
  thought_seizer: {
    id: 'thought_seizer',
    title: 'Thought Seizer',
    category: 'Disruption',
    description: "Awarded to targeted discard spells stripping options directly from the opponent\'s hand.",
    tierDescriptions: {
      iron: 'Awarded for forcing 3+ discards from opponent hand across a match.',
      bronze: 'Awarded for forcing 4+ discards from opponent hand across a match.',
      silver: 'Awarded for forcing 5+ discards from opponent hand across a match.',
      gold: 'Awarded for forcing 6+ discards from opponent hand across a match.',
      platinum: 'Awarded for forcing 7+ discards from opponent hand across a match.',
      legendary: 'Awarded for forcing 10+ discards from opponent hand across a match.',
    },
    criteria: {
      iron: 'Forced 3+ opponent discards across the match.',
      bronze: 'Forced 4+ opponent discards across the match.',
      silver: 'Forced 5+ opponent discards across the match.',
      gold: 'Forced 6+ opponent discards across the match.',
      platinum: 'Forced 7+ opponent discards across the match.',
      legendary: 'Forced 10+ opponent discards across the match.',
    },
    flavorQuote: 'No secret is safe from those who know where to reach.',
    flavorAttribution: 'Thoughtseize',
    artCard: {
      name: 'Thoughtseize',
      setCode: 'ths',
      collectorNumber: '107',
    },
  },
  reanimator: {
    id: 'reanimator',
    title: 'Reanimator',
    category: 'Graveyard',
    description: 'Awarded to spells or engines resurrecting creatures from the graveyard straight to the battlefield.',
    tierDescriptions: {
      iron: 'Awarded for resurrecting 3+ creatures from graveyards across a match.',
      bronze: 'Awarded for resurrecting 4+ creatures from graveyards across a match.',
      silver: 'Awarded for resurrecting 5+ creatures from graveyards across a match.',
      gold: 'Awarded for resurrecting 6+ creatures from graveyards across a match.',
      platinum: 'Awarded for resurrecting 7+ creatures from graveyards across a match.',
      legendary: 'Awarded for resurrecting 10+ creatures from graveyards across a match.',
    },
    criteria: {
      iron: 'Resurrected 3+ creatures from graveyards across the match.',
      bronze: 'Resurrected 4+ creatures from graveyards across the match.',
      silver: 'Resurrected 5+ creatures from graveyards across the match.',
      gold: 'Resurrected 6+ creatures from graveyards across the match.',
      platinum: 'Resurrected 7+ creatures from graveyards across the match.',
      legendary: 'Resurrected 10+ creatures from graveyards across the match.',
    },
    flavorQuote: 'The grave is merely a waiting room.',
    flavorAttribution: 'Reanimate',
    artCard: {
      name: 'Reanimate',
      setCode: 'jmp',
      collectorNumber: '270',
    },
  },
  rider_of_the_storm: {
    id: 'rider_of_the_storm',
    title: 'Rider of the Storm',
    category: 'Storm',
    description: 'Awarded to storm spells duplicating themselves into a flurry of copies upon casting.',
    tierDescriptions: {
      iron: 'Awarded for generating 3+ spell copies across a match.',
      bronze: 'Awarded for generating 4+ spell copies across a match.',
      silver: 'Awarded for generating 5+ spell copies across a match.',
      gold: 'Awarded for generating 6+ spell copies across a match.',
      platinum: 'Awarded for generating 7+ spell copies across a match.',
      legendary: 'Awarded for generating 10+ spell copies across a match.',
    },
    criteria: {
      iron: 'Generated 3+ spell copies across the match.',
      bronze: 'Generated 4+ spell copies across the match.',
      silver: 'Generated 5+ spell copies across the match.',
      gold: 'Generated 6+ spell copies across the match.',
      platinum: 'Generated 7+ spell copies across the match.',
      legendary: 'Generated 10+ spell copies across the match.',
    },
    flavorQuote: 'One drop precedes the deluge.',
    flavorAttribution: 'Flusterstorm',
    artCard: {
      name: 'Flusterstorm',
      setCode: 'sta',
      collectorNumber: '49',
    },
  },
};

// ==========================================
// DECK ACHIEVEMENTS REGISTRY (Coming Soon)
// ==========================================
export const DECK_ACHIEVEMENTS_REGISTRY: Record<string, AchievementMeta> = {
  on_a_roll: {
    id: 'on_a_roll',
    title: 'On a Roll',
    category: 'Streak',
    description: 'Awarded for piloting a deck to consecutive winning streaks in match play.',
    tierDescriptions: {
      iron: 'Achieved Iron tier milestone in streak play.',
      bronze: 'Awarded for maintaining a 3+ game winning streak with this deck.',
      silver: 'Awarded for maintaining a 5+ game winning streak with this deck.',
      gold: 'Awarded for maintaining a 7+ game winning streak with this deck.',
      platinum: 'Achieved Platinum tier milestone in streak play.',
      legendary: 'Achieved Legendary tier milestone in streak play.',
    },
    criteria: {
      iron: 'Achieved Iron milestone.',
      bronze: '3+ consecutive game win streak.',
      silver: '5+ consecutive game win streak.',
      gold: '7+ consecutive game win streak.',
      platinum: 'Achieved Platinum milestone.',
      legendary: 'Achieved Legendary milestone.',
    },
    flavorQuote: 'Momentum is an avalanche disguised as confidence.',
    flavorAttribution: 'Ral Zarek',
    artCard: {
      name: 'Steam Vents',
      setCode: 'grn',
      collectorNumber: '257',
    },
  },
  comeback_kid: {
    id: 'comeback_kid',
    title: 'Comeback Kid',
    category: 'Clutch',
    description: 'Awarded for pulling off a miraculous victory from the brink of defeat.',
    tierDescriptions: {
      iron: 'Achieved Iron tier milestone.',
      bronze: 'Awarded for winning a match after dropping to 5 or fewer life.',
      silver: 'Awarded for winning a match after dropping to 2 or fewer life.',
      gold: 'Awarded for winning a match after dropping to exactly 1 life.',
      platinum: 'Achieved Platinum tier milestone.',
      legendary: 'Achieved Legendary tier milestone.',
    },
    criteria: {
      iron: 'Achieved Iron milestone.',
      bronze: 'Won match after dropping to ≤ 5 life.',
      silver: 'Won match after dropping to ≤ 2 life.',
      gold: 'Won match after dropping to exactly 1 life.',
      platinum: 'Achieved Platinum milestone.',
      legendary: 'Achieved Legendary milestone.',
    },
    flavorQuote: 'The only hit point that matters is the last one.',
    flavorAttribution: 'Phyrexian Unlife',
    artCard: {
      name: 'Near-Death Experience',
      setCode: 'roe',
      collectorNumber: '38',
    },
  },
  blitzkrieg: {
    id: 'blitzkrieg',
    title: 'Blitzkrieg',
    category: 'Speed',
    description: 'Awarded for overwhelming the opponent with blistering speed and early match finishes.',
    tierDescriptions: {
      iron: 'Achieved Iron tier milestone.',
      bronze: 'Awarded for winning in 4 or fewer turns.',
      silver: 'Awarded for winning in 3 or fewer turns.',
      gold: 'Awarded for winning on Turn 1 or Turn 2.',
      platinum: 'Achieved Platinum tier milestone.',
      legendary: 'Achieved Legendary tier milestone.',
    },
    criteria: {
      iron: 'Achieved Iron milestone.',
      bronze: 'Won match in ≤ 4 turns.',
      silver: 'Won match in ≤ 3 turns.',
      gold: 'Won match in ≤ 2 turns.',
      platinum: 'Achieved Platinum milestone.',
      legendary: 'Achieved Legendary milestone.',
    },
    flavorQuote: 'Strike like lightning: before they hear the thunder, the battle is already decided.',
    flavorAttribution: 'Monastery Swiftspear',
    artCard: {
      name: 'Monastery Swiftspear',
      setCode: 'ktk',
      collectorNumber: '118',
    },
  },
  iron_fortress: {
    id: 'iron_fortress',
    title: 'Iron Fortress',
    category: 'Defense',
    description: 'Awarded for impenetrable defensive matches where the player sustains little to no damage.',
    tierDescriptions: {
      iron: 'Achieved Iron tier milestone.',
      bronze: 'Awarded for winning without life falling below 15.',
      silver: 'Awarded for winning without life falling below 18.',
      gold: 'Awarded for winning with a Flawless Victory (starting or above starting life).',
      platinum: 'Achieved Platinum tier milestone.',
      legendary: 'Achieved Legendary tier milestone.',
    },
    criteria: {
      iron: 'Achieved Iron milestone.',
      bronze: 'Won match with life never dropping below 15.',
      silver: 'Won match with life never dropping below 18.',
      gold: 'Flawless Victory: life remained at or above starting total.',
      platinum: 'Achieved Platinum milestone.',
      legendary: 'Achieved Legendary milestone.',
    },
    flavorQuote: 'An impenetrable shield forged from discipline and stone.',
    flavorAttribution: 'Ensnaring Bridge',
    artCard: {
      name: 'Ensnaring Bridge',
      setCode: '2xm',
      collectorNumber: '249',
    },
  },
  marathon: {
    id: 'marathon',
    title: 'Marathon',
    category: 'Endurance',
    description: 'Awarded for emerging victorious in prolonged tactical wars of attrition.',
    tierDescriptions: {
      iron: 'Achieved Iron tier milestone.',
      bronze: 'Awarded for winning a match lasting 15+ turns.',
      silver: 'Awarded for winning a match lasting 20+ turns.',
      gold: 'Awarded for winning a grueling match lasting 25+ turns.',
      platinum: 'Achieved Platinum tier milestone.',
      legendary: 'Achieved Legendary tier milestone.',
    },
    criteria: {
      iron: 'Achieved Iron milestone.',
      bronze: 'Won match lasting ≥ 15 turns.',
      silver: 'Won match lasting ≥ 20 turns.',
      gold: 'Won match lasting ≥ 25 turns.',
      platinum: 'Achieved Platinum milestone.',
      legendary: 'Achieved Legendary milestone.',
    },
    flavorQuote: 'Endurance is not just the ability to bear a hard thing, but to turn it into glory.',
    flavorAttribution: 'Sphinx of the Steel Wind',
    artCard: {
      name: 'Sphinx of the Steel Wind',
      setCode: 'arb',
      collectorNumber: '110',
    },
  },
  dominance: {
    id: 'dominance',
    title: 'Dominance',
    category: 'Life',
    description: 'Awarded for finishing matches with overwhelming life totals.',
    tierDescriptions: {
      iron: 'Achieved Iron tier milestone.',
      bronze: 'Awarded for winning with 30+ life.',
      silver: 'Awarded for winning with 40+ life.',
      gold: 'Awarded for winning with 50+ life.',
      platinum: 'Achieved Platinum tier milestone.',
      legendary: 'Achieved Legendary tier milestone.',
    },
    criteria: {
      iron: 'Achieved Iron milestone.',
      bronze: 'Won match with ≥ 30 life.',
      silver: 'Won match with ≥ 40 life.',
      gold: 'Won match with ≥ 50 life.',
      platinum: 'Achieved Platinum milestone.',
      legendary: 'Achieved Legendary milestone.',
    },
    flavorQuote: 'When life itself is your weapon, defeat is an impossibility.',
    flavorAttribution: 'Serra Ascendant',
    artCard: {
      name: 'Serra Ascendant',
      setCode: 'm11',
      collectorNumber: '28',
    },
  },
};

/**
 * Returns metadata for a given deck achievement title or ID
 */
export function getDeckAchievementMeta(titleOrId: string): AchievementMeta {
  const key = normalizeAchievementId(titleOrId);
  return DECK_ACHIEVEMENTS_REGISTRY[key] || {
    ...DEFAULT_META,
    title: cleanAchievementTitle(titleOrId) || 'Deck Honor',
    category: 'Deck',
  };
}

// Fallback metadata for dynamic or unknown achievement IDs
const DEFAULT_META: AchievementMeta = {
  id: 'unknown',
  title: 'Match Honor',
  category: 'Special',
  description: 'A notable achievement awarded for game-altering combat or strategic impact.',
  tierDescriptions: {
    iron: 'Achieved Iron tier milestone in match combat.',
    bronze: 'Achieved Bronze tier milestone in match combat.',
    silver: 'Achieved Silver tier milestone in match combat.',
    gold: 'Achieved Gold tier milestone in match combat.',
    platinum: 'Achieved Platinum tier milestone in match combat.',
    legendary: 'Achieved Legendary tier milestone in match combat.',
  },
  criteria: {
    iron: 'Achieved Iron tier milestone.',
    bronze: 'Achieved Bronze tier milestone.',
    silver: 'Achieved Silver tier milestone.',
    gold: 'Achieved Gold tier milestone.',
    platinum: 'Achieved Platinum tier milestone.',
    legendary: 'Achieved Legendary tier milestone.',
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
  if (lower.includes('(legendary)') || lower.endsWith('legendary')) return 'legendary';
  if (lower.includes('(platinum)') || lower.endsWith('platinum') || lower.includes('(titanium)') || lower.endsWith('titanium')) return 'platinum';
  if (lower.includes('(gold)') || lower.endsWith('gold')) return 'gold';
  if (lower.includes('(silver)') || lower.endsWith('silver')) return 'silver';
  if (lower.includes('(bronze)') || lower.endsWith('bronze')) return 'bronze';
  if (lower.includes('(iron)') || lower.endsWith('iron')) return 'iron';
  return null;
}

/**
 * Strips tier suffix from title string for clean display (e.g. "Scoop Inducer (Gold)" -> "Scoop Inducer")
 */
export function cleanAchievementTitle(title: string): string {
  if (!title) return '';
  return title
    .replace(/\s*\((Legendary|Platinum|Titanium|Gold|Silver|Bronze|Iron|legendary|platinum|titanium|gold|silver|bronze|iron)\)/gi, '')
    .trim();
}

/**
 * Default tier mapping from count (or fallback)
 */
export function getTierFromCount(count: number): AchievementTier {
  if (count >= 10) return 'legendary';
  if (count >= 7) return 'platinum';
  if (count >= 5) return 'gold';
  if (count >= 3) return 'silver';
  if (count >= 2) return 'bronze';
  return 'iron';
}

/**
 * Set of 26 achievements that have pre-rendered layered composites
 */
export const COMPOSITE_ACHIEVEMENT_IDS = new Set([
  'blinkmaster',
  'bouncer',
  'brain_freeze',
  'cat_burglar',
  'cataclysm',
  'executioner',
  'grand_larceny',
  'hardened',
  'haymaker',
  'immortal',
  'ironclad',
  'juggernaut',
  'mana_dynamo',
  'negator',
  'over_killer',
  'ozolithic',
  'reanimator',
  'rhystic_tracker',
  'rider_of_the_storm',
  'royal_assassin',
  'scoop_inducer',
  'swarmer',
  'sweeper',
  'tax_collector',
  'thought_seizer',
  'vampiric',
]);

export function hasCompositeBadge(titleOrId: string): boolean {
  return COMPOSITE_ACHIEVEMENT_IDS.has(normalizeAchievementId(titleOrId));
}

/**
 * Resolves the 6-tier custom badge composite image (WebP preferred, PNG fallback)
 */
export function getCompositeBadgeUrl(titleOrId: string, tier: AchievementTier = 'bronze'): string {
  const key = normalizeAchievementId(titleOrId);
  const t = tier === 'platinum' ? 'platinum' : tier;
  return `/badges/composite/${key}_${t}.webp`;
}

/**
 * Resolves the 6-tier custom badge PNG frame path (base shield frame)
 */
export function getBadgePngUrl(tier: AchievementTier = 'bronze'): string {
  const t = tier === 'platinum' ? 'titanium' : tier;
  return `/badges/badge_${t}.png`;
}



export function getBadgeSvgUrl(titleOrId: string, tier: AchievementTier = 'bronze'): string | undefined {
  const key = normalizeAchievementId(titleOrId);
  const pathKey = `../assets/badges/${key}_${tier}.svg`;
  return BADGE_ASSETS[pathKey];
}
