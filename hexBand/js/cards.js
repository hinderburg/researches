// Card and POI definitions (0.7.0 card pool — D-038, active outpost cards — D-041; UI text in English since 0.12.0 — D-052).
// Movement cards define a PATTERN and a DISTANCE, never a direction (D-030): `pattern` lists turn offsets relative to a
// base direction chosen by the player when the card is dropped; `mirror: true` also allows the left-handed version.
window.HB = window.HB || {};
(function () {
  const CARDS = {
    // ---- base pool
    advance:            { id: 'advance', title: 'March', type: 'Movement', kind: 'move', pattern: [0], text: 'One step in any direction.' },
    double_advance:     { id: 'double_advance', title: 'Double March', type: 'Movement', kind: 'move', pattern: [0, 0], text: 'Two steps in a straight line, any direction.' },
    hook:               { id: 'hook', title: 'Hook', type: 'Maneuver', kind: 'move', pattern: [0, 1], mirror: true, text: 'Two steps with a 60° turn (either way).' },
    zigzag:             { id: 'zigzag', title: 'Zigzag', type: 'Maneuver', kind: 'move', pattern: [0, 2], mirror: true, text: 'Two steps with a 120° turn: a jag to either side.' },
    around:             { id: 'around', title: 'Around', type: 'Maneuver', kind: 'move', pattern: [0, 1, 2], mirror: true, text: 'Three steps in a half-ring around a neighbouring hex.' },
    rally:              { id: 'rally', title: 'Rally', type: 'Reinforcement', kind: 'reinforce', amount: 4, text: '+4 minions.' },
    battle_cry:         { id: 'battle_cry', title: 'Battle Cry', type: 'Combat', kind: 'buff_next', bonus: 2, text: 'Your next strike deals +2 damage.' },
    reinforced_formation:{ id: 'reinforced_formation', title: 'Formation', type: 'Defense', kind: 'formation', text: 'Until your next turn every strike against you deals 2 less (never below 1).' },
    // ---- advanced pool
    forced_march:       { id: 'forced_march', title: 'Forced March', type: 'Movement', kind: 'move', pattern: [0, 0, 0], text: 'Three steps in a straight line, any direction.' },
    long_hook:          { id: 'long_hook', title: 'Long Hook', type: 'Maneuver', kind: 'move', pattern: [0, 0, 1], mirror: true, text: 'Two steps straight, then one step with a 60° turn.' },
    split_march:        { id: 'split_march', title: 'Wide March', type: 'Territory', kind: 'move', pattern: [0], wide: true, text: 'One step in any direction; the two hexes flanking the step are captured too.' },
    dash:               { id: 'dash', title: 'Dash', type: 'Territory', kind: 'move', pattern: [0, 0], ahead: 1, text: 'Two steps straight; the next hex ahead is captured as well.' },
    flank_claim:        { id: 'flank_claim', title: 'Flank Claim', type: 'Territory', kind: 'flank_claim', target: 'axis', text: 'Capture two adjacent hexes on one line through your warband, on opposite sides.' },
    volley:             { id: 'volley', title: 'Volley', type: 'Combat', kind: 'volley', range: 2, text: 'Strike the enemy warband up to 2 hexes away. No retaliation.' },
    warband_reinforcements:{ id: 'warband_reinforcements', title: 'Reinforcements', type: 'Reinforcement', kind: 'reinforce', amount: 6, text: '+6 minions.' },
    // ---- POI cards (all with an immediate, visible effect — D-041)
    recruitment:        { id: 'recruitment', title: 'Recruitment', type: 'Reinforcement', kind: 'reinforce', amount: 6, poi: true, text: '+6 minions.' },
    cordon:             { id: 'cordon', title: 'Cordon', type: 'Territory', kind: 'cordon', poi: true, text: 'Capture every hex around your warband.' },
    explosive_charge:   { id: 'explosive_charge', title: 'Explosive Charge', type: 'Combat', kind: 'explosive', target: 'adjacent', poi: true, text: 'Pick an adjacent hex: an enemy on it takes 4 damage and the hex is blocked for one round.' },
    prayer:             { id: 'prayer', title: 'Prayer', type: 'Utility', kind: 'prayer', poi: true, text: 'Return the top card of your discard pile to your hand.' },
    catapult:           { id: 'catapult', title: 'Catapult', type: 'Combat', kind: 'catapult', range: 3, damage: 3, poi: true, text: '3 damage to the enemy warband up to 3 hexes away.' },
    scout_draw:         { id: 'scout_draw', title: 'Scouting', type: 'Utility', kind: 'scout_draw', poi: true, text: 'Draw cards until your hand is full.' },
    banner:             { id: 'banner', title: 'Banner', type: 'Territory', kind: 'banner', poi: true, text: 'Your hexes around (and under) the warband are worth 2 points instead of 1.' },
    blink:              { id: 'blink', title: 'Blink', type: 'Movement', kind: 'blink', poi: true, text: 'Jump over one hex in any direction. The hex in between is not captured.' },
  };
  const BASE_POOL = ['advance', 'double_advance', 'hook', 'zigzag', 'around', 'rally', 'battle_cry', 'reinforced_formation'];
  const ADVANCED_POOL = ['forced_march', 'long_hook', 'split_march', 'dash', 'flank_claim', 'volley', 'warband_reinforcements'];
  const DECK_POOL = BASE_POOL.concat(ADVANCED_POOL);
  // absolute directions for logs / labels: 0 N, 1 NE, 2 SE, 3 S, 4 SW, 5 NW
  const DIR_LABEL = ['up', 'up-right', 'down-right', 'down', 'down-left', 'up-left'];
  const AXIS_LABEL = ['vertical', 'diagonal ↗', 'diagonal ↘'];

  const POIS = {
    village:    { id: 'village', title: 'Village', card: 'recruitment', text: 'Grants Recruitment (+6 minions).' },
    watchtower: { id: 'watchtower', title: 'Watchtower', card: 'cordon', text: 'Grants Cordon (capture every hex around the warband).' },
    mine:       { id: 'mine', title: 'Mine', card: 'explosive_charge', text: 'Grants Explosive Charge (4 damage + a blocked hex).' },
    shrine:     { id: 'shrine', title: 'Shrine', card: 'prayer', text: 'Grants Prayer (top discard card back to hand).' },
    workshop:   { id: 'workshop', title: 'Workshop', card: 'catapult', text: 'Grants Catapult (3 damage at up to 3 hexes).' },
    scout_camp: { id: 'scout_camp', title: 'Scout Camp', card: 'scout_draw', text: 'Grants Scouting (draw up to a full hand).' },
    war_banner: { id: 'war_banner', title: 'War Banner', card: 'banner', text: 'Grants Banner (+1 point on hexes around the warband).' },
    portal:     { id: 'portal', title: 'Mystic Gate', card: 'blink', text: 'Grants Blink (jump over a hex).' },
  };
  const POI_POOL = Object.keys(POIS);

  const PRESETS = {
    balanced:  { title: 'Balanced', cards: ['advance', 'double_advance', 'hook', 'zigzag', 'around', 'rally', 'battle_cry', 'reinforced_formation'], pois: ['village', 'watchtower', 'shrine'] },
    expansion: { title: 'Expansion', cards: ['advance', 'double_advance', 'hook', 'zigzag', 'around', 'split_march', 'forced_march', 'dash'], pois: ['war_banner', 'scout_camp', 'portal'] },
    duel:      { title: 'Duel', cards: ['advance', 'double_advance', 'hook', 'volley', 'battle_cry', 'reinforced_formation', 'rally', 'warband_reinforcements'], pois: ['shrine', 'mine', 'workshop'] },
    swarm:     { title: 'Swarm', cards: ['advance', 'double_advance', 'hook', 'around', 'rally', 'warband_reinforcements', 'battle_cry', 'flank_claim'], pois: ['village', 'shrine', 'war_banner'] },
  };

  HB.cards = { CARDS, BASE_POOL, ADVANCED_POOL, DECK_POOL, POIS, POI_POOL, PRESETS, DIR_LABEL, AXIS_LABEL };
})();
