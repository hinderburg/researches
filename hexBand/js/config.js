// HEXBand prototype — tunables. See docs/DECISIONS.md for the reasoning behind each value.
window.HB = window.HB || {};
HB.CONFIG = {
  VERSION: '0.21.0',
  COLS: 7,               // flat-top hex columns; odd columns are shifted down and hold one cell less (see D-002)
  ROWS: 11,              // rows in even columns; odd columns have ROWS-1
  HAND_SIZE: 4,
  DECK_SIZE: 8,
  POI_PICKS: 2,          // D-058: two outposts per player, both start captured
  CITADEL_MODE: 'fixed', // D-061: 'fixed' = always Muster (default), 'once' = one random card for the whole match, 'reroll' = a new one after each capture
  ROUND_LIMIT: 10,       // GDD §23: 10 rounds per player for the first prototype
  START_MINIONS: 24,
  // D-047: a warband's strike = DAMAGE_BASE × (minions / DAMAGE_REF) ^ DAMAGE_EXP, kept fractional until dealt
  DAMAGE_BASE: 5, DAMAGE_REF: 24, DAMAGE_EXP: 0.7,
  // D-043: card modifiers are flat
  BATTLE_CRY_BONUS: 2,   // Battle Cry: + to the next strike
  FORMATION_REDUCE: 2,   // Formation: − from every incoming strike until the next turn (never below 1)
  EXPLOSIVE_DAMAGE: 4,
  ATTACKS_PER_TURN: 0,   // D-031 / D-063: how many times a warband may attack per turn; 0 = unlimited (default since 0.16.2)
  BOT_DELAY_MS: 700,
  // Outpost slots (D-058): two per player, left and right of the start zone, adjacent to the starting territory,
  // mirrored top/bottom. Both start captured; their cards are shuffled into the owner's deck.
  POI_SLOTS: {
    1: [{ col: 1, row: 8 }, { col: 5, row: 8 }],   // blue: left, right
    2: [{ col: 1, row: 1 }, { col: 5, row: 1 }],   // red: mirrored
  },
  // D-059: the neutral citadel in the middle column. No hex of column 3 is equidistant from both starts (10 rows);
  // row 4 is one step closer to Red, who moves second.
  CENTER_POI: { col: 3, row: 4 },
  START: { 1: { col: 3, row: 9 }, 2: { col: 3, row: 0 } },
  COLORS: {
    grass: '#74b64b', grassAlt: '#6dae46', grassEdge: '#4f8a33', grassSide: '#4a7d2e',
    1: '#3f8ae6', 2: '#e0503f',
    '1Light': '#8cc4ff', '2Light': '#ff9a8a',
    '1Dark': '#1f4f9a', '2Dark': '#8f2419',
  },
};
