// HEXBand prototype — tunables. See docs/DECISIONS.md for the reasoning behind each value.
window.HB = window.HB || {};
HB.CONFIG = {
  VERSION: '0.39.0-it3',
  COLS: 11,              // flat-top hex columns; odd columns are shifted down and hold one cell less (see D-002). iteration3 (D-083): 7 → 11
  BOARD_TIP: 1.5,        // D-093: the diamond board narrows to ±1.5 hex widths (3 columns) at the castle ends
  BOARD_SIDE: 1.5,       // D-093: and its left and right corners are blunted (3 hexes tall instead of 1)
  ROWS: 17,              // rows in even columns; odd columns have ROWS-1. iteration3 (D-083): 11 → 17 — the board is ~50 % larger each way
  // D-085 (iteration3, V4 "Overlord"): a deck of 6 — 3 Overlord cards + 1 card for each of the 3 minion types; hand of 3
  HAND_SIZE: 3,
  HERO_CARDS: 3,
  MINION_TYPES_MAX: 3,
  ROUND_LIMIT: 12,       // GDD §23 had 10; iteration3 (D-084): 12 on the 11 × 17 board
  ATTACKS_PER_TURN: 0,   // no limit on attacks (D-063)
  BOT_DELAY_MS: 700,
  // D-085: the Overlord. Direct numbers: what the camp shows is what the match uses. Level L adds floor((L−1) × grow).
  HERO: { hp: 40, hpGrow: 3, atk: 3, atkGrow: 0.25, command: 23, commandGrow: 1 },
  MAX_LEVEL: 10,
  POST_BOOST: 0.1,       // D-091: a recruiting post raises the army size of the type that took it by 10 % (at least 1)
  CITADEL_HEAL: 5,       // D-085: taking the Citadel heals the Overlord
  // castles (passive bases, D-084): the castle hex; the Overlord starts on the hex in front of it
  START: { 1: { col: 5, row: 15 }, 2: { col: 5, row: 0 } },
  HERO_START: { 1: { col: 5, row: 14 }, 2: { col: 5, row: 1 } },
  // D-085/D-091: recruiting posts in the middle band, ≥ 5 hexes from both castles, and the Citadel.
  // D-093: on the diamond board the Citadel stands one step nearer to Blue (first move measured 36 % with it nearer Red)
  POINTS: {
    left: [{ col: 2, row: 5 }, { col: 2, row: 11 }],
    right: [{ col: 8, row: 5 }, { col: 8, row: 11 }],
    citadel: { col: 5, row: 8 },
  },
  COLORS: {
    grass: '#74b64b', grassAlt: '#6dae46', grassEdge: '#4f8a33', grassSide: '#4a7d2e',
    1: '#3f8ae6', 2: '#e0503f',
    '1Light': '#8cc4ff', '2Light': '#ff9a8a',
    '1Dark': '#1f4f9a', '2Dark': '#8f2419',
  },
};
