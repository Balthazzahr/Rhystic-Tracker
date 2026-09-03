import { parseMtgaManaCost } from '../../utils/manaUtils';

export interface TimelineAction {
  turn_number?: number;
  turn?: number;
  seat_id?: number;
  is_player?: boolean;
  event_type?: string;
  type?: string;
  grp_id?: number;
  name?: string;
  target_name?: string;
  card_type?: string;
  mana_cost?: string;
  amount?: number;
  titles?: string[];
  count?: number;
  timestamp?: string;
  heroLifeBefore?: number;
  heroLifeAfter?: number;
  oppLifeBefore?: number;
  oppLifeAfter?: number;
  targetDied?: boolean;
}

export function calculateCmc(costStr?: string): number {
  if (!costStr) return 0;
  const pips = parseMtgaManaCost(costStr);
  let total = 0;
  for (const pip of pips) {
    const n = parseInt(pip, 10);
    if (!isNaN(n)) total += n;
    else total += 1;
  }
  return total;
}

/**
 * Evaluates an action and assigns an impact score.
 * Higher scores indicate higher tactical and narrative significance in a match.
 */
export function scoreAction(ev: TimelineAction, isOutOfTurn: boolean = false): number {
  const evType = (ev.event_type || ev.type || '').toLowerCase();
  const cardType = (ev.card_type || '').toLowerCase();
  const cmc = calculateCmc(ev.mana_cost);
  const hasTitles = Array.isArray(ev.titles) && ev.titles.length > 0;

  // Highlights ONLY include cards played or considerable damage being done.
  // Never include cards drawn, tokens, dies, or life events.
  if (evType === 'draw' || evType === 'token' || evType === 'dies' || evType.startsWith('life')) {
    return 0;
  }

  // 1. Damage events (only considerable damage >= 3)
  if (evType.startsWith('damage') || evType === 'damage') {
    let magnitude = ev.amount || 0;
    if (magnitude === 0 && ev.event_type?.startsWith('damage:')) {
      const parts = ev.event_type.split(':');
      if (parts.length >= 4) {
        magnitude = Math.abs(parseInt(parts[2] || '0', 10));
      } else {
        magnitude = Math.abs(parseInt(parts[2] || parts[1] || '0', 10));
      }
    }
    if (magnitude < 3) return 0;

    const isToPlayer =
      ev.target_name?.toLowerCase().includes('you') ||
      ev.target_name?.toLowerCase().includes('opponent');

    if (magnitude >= 10) return 1000 + magnitude;
    if (isToPlayer && magnitude >= 5) return 800 + magnitude;
    if (magnitude >= 4) return 700 + magnitude;
    return 300 + magnitude;
  }

  // 2. Plays (cards played)
  if (evType === 'play') {
    // Ignore basic lands
    if (cardType.includes('basic') || (cardType.includes('land') && !cardType.includes('creature'))) {
      return 0;
    }
    if (hasTitles) return 650 + cmc * 10;
    if (cardType.includes('planeswalker') || cardType.includes('battle')) return 550 + cmc * 15;
    if (isOutOfTurn) return 500 + cmc * 10;
    if (cmc >= 5) return 450 + cmc * 10;
    if (cardType.includes('creature')) return 250 + cmc * 5;
    if (cardType.includes('sorcery') || cardType.includes('instant')) return 220 + cmc * 5;
    return 180 + cmc * 5;
  }

  return 0;
}

/**
 * Finds the highest-impact action in a round.
 */
export function getRoundHighlight(
  roundEvents: TimelineAction[],
  goingFirst: boolean
): { highlight: TimelineAction | null; score: number } {
  if (!roundEvents || roundEvents.length === 0) {
    return { highlight: null, score: 0 };
  }

  let bestAction: TimelineAction | null = null;
  let bestScore = 0;

  for (const ev of roundEvents) {
    const turn = ev.turn_number !== undefined ? ev.turn_number : (ev.turn !== undefined ? ev.turn : 1);
    const isPlayer = ev.is_player !== undefined ? ev.is_player : (ev.seat_id === (goingFirst ? 1 : 2));
    
    // Determine who owns this turn
    const isTurnOdd = turn % 2 !== 0;
    const isTurnOwnerHero = isTurnOdd ? goingFirst : !goingFirst;
    const isOutOfTurn = isPlayer !== isTurnOwnerHero;

    const score = scoreAction(ev, isOutOfTurn);
    if (score > bestScore) {
      bestScore = score;
      bestAction = ev;
    }
  }

  if (bestScore <= 0 || !bestAction) {
    return { highlight: null, score: 0 };
  }

  return { highlight: bestAction, score: bestScore };
}

/**
 * Enriches sequential match turn actions with combat context:
 * - Running player life totals before and after combat damage
 * - Identification of creature targets and whether they died in combat
 */
export function enrichActionsWithCombatContext(
  events: TimelineAction[],
  formatName?: string,
  opponentName = 'Opponent'
): TimelineAction[] {
  const fmt = (formatName || '').toLowerCase();
  const startingLife = fmt.includes('brawl') ? 25 : (fmt.includes('commander') ? 40 : 20);

  let currentHeroLife = startingLife;
  let currentOppLife = startingLife;

  // Track creatures that died in each turn: turn -> Set of creature names
  const diesInTurn = new Map<number, Set<string>>();
  for (const ev of events) {
    const t = ev.turn_number !== undefined ? ev.turn_number : (ev.turn !== undefined ? ev.turn : 0);
    const evType = (ev.event_type || ev.type || '').toLowerCase();
    if (evType === 'dies' || evType.startsWith('dies:')) {
      if (!diesInTurn.has(t)) diesInTurn.set(t, new Set());
      const cName = (ev.name || '').trim().toLowerCase();
      if (cName) diesInTurn.get(t)!.add(cName);
    }
  }

  const enrichedEvents = events.map((ev) => {
    const enriched: TimelineAction = { ...ev };
    const evType = (ev.event_type || ev.type || '').toLowerCase();
    const isPlayer = Boolean(ev.is_player);
    const turn = ev.turn_number !== undefined ? ev.turn_number : (ev.turn !== undefined ? ev.turn : 0);

    if (evType.startsWith('damage')) {
      let dmg = ev.amount || 0;
      if (dmg === 0 && ev.event_type?.startsWith('damage:')) {
        const parts = ev.event_type.split(':');
        dmg = parseInt(parts[2] || parts[1] || '0', 10);
      }
      enriched.amount = dmg;

      const target = (ev.target_name || '').trim();
      const isTargetHero =
        target === 'You' ||
        target.toLowerCase() === 'you' ||
        target.toLowerCase().includes('player');

      const isTargetOpponent =
        target === opponentName ||
        target.toLowerCase().includes('opponent');

      if (isTargetOpponent) {
        enriched.oppLifeBefore = currentOppLife;
        currentOppLife = Math.max(0, currentOppLife - dmg);
        enriched.oppLifeAfter = currentOppLife;
      } else if (isTargetHero) {
        enriched.heroLifeBefore = currentHeroLife;
        currentHeroLife = Math.max(0, currentHeroLife - dmg);
        enriched.heroLifeAfter = currentHeroLife;
      } else if (target) {
        // Target is creature
        const targetClean = target.toLowerCase();
        const died = diesInTurn.get(turn)?.has(targetClean) || false;
        enriched.targetDied = died;
      }
    } else if (evType.startsWith('life')) {
      let delta = 0;
      if (ev.event_type?.startsWith('life:')) {
        const parts = ev.event_type.split(':');
        delta = parseInt(parts[1] || '0', 10);
      } else if (ev.amount !== undefined) {
        delta = ev.amount;
      }
      if (isPlayer) {
        currentHeroLife = Math.max(0, currentHeroLife + delta);
      } else {
        currentOppLife = Math.max(0, currentOppLife + delta);
      }
    }

    return enriched;
  });

  // Reorder events within each turn so that any 'dies' event for a creature
  // that took damage in that turn occurs AFTER the combat damage actions.
  const turnGrouped = new Map<number, TimelineAction[]>();
  for (const ev of enrichedEvents) {
    const t = ev.turn_number !== undefined ? ev.turn_number : (ev.turn !== undefined ? ev.turn : 0);
    if (!turnGrouped.has(t)) turnGrouped.set(t, []);
    turnGrouped.get(t)!.push(ev);
  }

  const result: TimelineAction[] = [];
  for (const [, turnEvs] of turnGrouped.entries()) {
    const nonDies: TimelineAction[] = [];
    const diesEvents: TimelineAction[] = [];
    const damagedCreaturesInTurn = new Set<string>();
    const damagedGrpsInTurn = new Set<number>();

    for (const ev of turnEvs) {
      const evType = (ev.event_type || ev.type || '').toLowerCase();
      if (evType.startsWith('damage')) {
        if (ev.target_name) {
          damagedCreaturesInTurn.add(ev.target_name.trim().toLowerCase());
        }
        if (ev.event_type?.startsWith('damage:')) {
          const parts = ev.event_type.split(':');
          const tgtGid = parseInt(parts[4] || '0', 10);
          if (tgtGid > 0) damagedGrpsInTurn.add(tgtGid);
        }
      }
    }

    for (const ev of turnEvs) {
      const evType = (ev.event_type || ev.type || '').toLowerCase();
      if (evType === 'dies' || evType.startsWith('dies:')) {
        const cName = (ev.name || '').trim().toLowerCase();
        const gid = ev.grp_id || 0;
        if ((cName && damagedCreaturesInTurn.has(cName)) || (gid > 0 && damagedGrpsInTurn.has(gid))) {
          diesEvents.push(ev);
          continue;
        }
      }
      nonDies.push(ev);
    }

    // Insert diesEvents right after the last damage event in the turn
    let lastDmgIdx = -1;
    for (let i = 0; i < nonDies.length; i++) {
      const evType = (nonDies[i].event_type || nonDies[i].type || '').toLowerCase();
      if (evType.startsWith('damage')) {
        lastDmgIdx = i;
      }
    }

    if (lastDmgIdx !== -1 && diesEvents.length > 0) {
      nonDies.splice(lastDmgIdx + 1, 0, ...diesEvents);
      result.push(...nonDies);
    } else {
      result.push(...turnEvs);
    }
  }

  return result;
}
