// HEXBand prototype — tunables. See docs/DECISIONS.md for the reasoning behind each value.
window.HB = window.HB || {};
HB.CONFIG = {
  VERSION: '0.3.1',
  COLS: 7,               // flat-top hex columns; odd columns are shifted down and hold one cell less (see D-002)
  ROWS: 11,              // rows in even columns; odd columns have ROWS-1
  HAND_SIZE: 4,
  DECK_SIZE: 8,
  POI_PICKS: 3,
  ROUND_LIMIT: 10,       // GDD §23: 10 rounds per player for the first prototype
  START_MINIONS: 24,
  DMG_PER_MINION: 0.15,  // Damage = DMG_PER_MINION × attacker minions × facing × card mods (D-007)
  FACING_MOD: { front: 1.0, side: 1.25, back: 1.5 }, // GDD §8.2; facing is derived from the last move (D-024)
  OVERWATCH_MULT: 0.5,
  EXPLOSIVE_DAMAGE: 4,
  CHARGE_MULT: 1.3,
  BOT_DELAY_MS: 700,
  // POI slots (D-026): three per side on a diagonal — the left one close to the player, the middle one mid-half,
  // the right one near the centre line. The red side is the 180° rotation of the blue side.
  POI_SLOTS: [
    { col: 1, row: 8 }, { col: 3, row: 6 }, { col: 4, row: 5 },   // blue: left, middle, right
    { col: 5, row: 1 }, { col: 3, row: 3 }, { col: 2, row: 5 },   // red: mirrored
  ],
  START: { 1: { col: 3, row: 9, facing: 0 }, 2: { col: 3, row: 0, facing: 3 } },
  COLORS: {
    grass: '#74b64b', grassAlt: '#6dae46', grassEdge: '#4f8a33',
    1: '#3f8ae6', 2: '#e0503f',
    '1Light': '#8cc4ff', '2Light': '#ff9a8a',
    '1Dark': '#1f4f9a', '2Dark': '#8f2419',
  },
};
