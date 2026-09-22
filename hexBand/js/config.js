// HEXBand prototype — tunables. See docs/DECISIONS.md for the reasoning behind each value.
window.HB = window.HB || {};
HB.CONFIG = {
  VERSION: '0.1.0',
  COLS: 7,               // flat-top hex columns; odd columns are shifted down and hold one cell less (see D-002)
  ROWS: 11,              // rows in even columns; odd columns have ROWS-1
  HAND_SIZE: 4,
  DECK_SIZE: 8,
  POI_PICKS: 3,
  ROUND_LIMIT: 10,       // GDD §23: 10 rounds per player for the first prototype
  START_MINIONS: 24,
  DMG_PER_MINION: 0.15,  // Damage = DMG_PER_MINION × attacker minions × facing × card mods (D-007)
  FACING_MOD: { front: 1.0, side: 1.25, back: 1.5 }, // GDD §8.2
  OVERWATCH_MULT: 0.5,
  EXPLOSIVE_DAMAGE: 4,
  DIAGONAL_STEP_TURNS: false, // D-005: Forward Left/Right keep facing by default
  BOT_DELAY_MS: 700,
  // POI slots: first three belong to the blue (bottom) side, last three to the red (top) side.
  POI_SLOTS: [
    { col: 1, row: 7 }, { col: 3, row: 6 }, { col: 5, row: 7 },
    { col: 1, row: 2 }, { col: 3, row: 3 }, { col: 5, row: 2 },
  ],
  START: { 1: { col: 3, row: 9, facing: 0 }, 2: { col: 3, row: 0, facing: 3 } },
  COLORS: {
    neutral: '#5d9a4a', neutralEdge: '#4d833d',
    1: '#3c7ddd', 2: '#d6493f',
    '1Light': '#7fb0ff', '2Light': '#ff8b80',
  },
};
