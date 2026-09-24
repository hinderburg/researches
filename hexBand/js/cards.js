// Card and POI definitions (0.7.0 card pool — D-038, active outpost cards — D-041; UI text in English since 0.12.0 — D-052).
// Movement cards define a PATTERN and a DISTANCE, never a direction (D-030): `pattern` lists turn offsets relative to a
// base direction chosen by the player when the card is dropped; `mirror: true` also allows the left-handed version.
window.HB = window.HB || {};
(function () {
  const CARDS = {
    // ---- base pool
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
    // ---- field pool (D-068): cards that change the board itself — walls on hex edges, summons, fortified, burnt and swampy ground
    palisade:           { id: 'palisade', title: 'Palisade', type: 'Field', kind: 'palisade', target: 'adjacent', rounds: 3, text: 'Build a wall one hex ahead of your warband, along the three far edges of the chosen neighbouring hex. Warbands and summons cannot cross it, and it closes enclosures like a border. Lasts 3 rounds.' },
    levy:               { id: 'levy', title: 'Levy', type: 'Summon', kind: 'summon', target: 'adjacent', count: 1, acts: 2, text: 'Summon a militiaman on an adjacent hex; he captures it, then at the start of your next 2 turns steps to a neighbouring hex and captures it too. An enemy warband that walks onto him kills him.' },
    outriders:          { id: 'outriders', title: 'Outriders', type: 'Summon', kind: 'summon', count: 2, acts: 1, text: 'Two riders appear on free hexes next to your warband and capture them; at the start of your next turn each rides on and captures one more hex. An enemy warband kills them by walking onto them.' },
    fortify:            { id: 'fortify', title: 'Fortify', type: 'Field', kind: 'fortify', rounds: 2, radius: 2, text: 'Your hexes within 2 of the warband cannot be captured or burnt by the enemy for 2 rounds.' },
    scorch:             { id: 'scorch', title: 'Scorch', type: 'Field', kind: 'scorch', target: 'adjacent', range: 3, text: 'Burn a line of 3 hexes from your warband: enemy hexes on it turn neutral. Outposts and fortified hexes resist.' },
    quagmire:           { id: 'quagmire', title: 'Quagmire', type: 'Field', kind: 'swamp', target: 'cell', rounds: 2, text: 'Turn a hex up to 2 away into a swamp for 2 rounds: a warband that enters it stops there.' },
    // ---- POI cards (all with an immediate, visible effect — D-041)
    recruitment:        { id: 'recruitment', title: 'Recruitment', type: 'Reinforcement', kind: 'reinforce', amount: 6, poi: true, text: '+6 minions.' },
    cordon:             { id: 'cordon', title: 'Cordon', type: 'Territory', kind: 'cordon', poi: true, text: 'Capture every hex around your warband.' },
    explosive_charge:   { id: 'explosive_charge', title: 'Explosive Charge', type: 'Combat', kind: 'explosive', target: 'adjacent', poi: true, text: 'Pick an adjacent hex: an enemy on it takes 4 damage and the hex is blocked for one round.' },
    prayer:             { id: 'prayer', title: 'Prayer', type: 'Utility', kind: 'prayer', poi: true, text: 'Return the top card of your discard pile to your hand.' },
    catapult:           { id: 'catapult', title: 'Catapult', type: 'Combat', kind: 'catapult', range: 3, damage: 3, poi: true, text: '3 damage to the enemy warband up to 3 hexes away.' },
    scout_draw:         { id: 'scout_draw', title: 'Scouting', type: 'Utility', kind: 'scout_draw', poi: true, text: 'Draw cards until your hand is full.' },
    banner:             { id: 'banner', title: 'Banner', type: 'Territory', kind: 'banner', poi: true, text: 'Your hexes around (and under) the warband are worth 2 points instead of 1.' },
    blink:              { id: 'blink', title: 'Blink', type: 'Movement', kind: 'blink', poi: true, text: 'Jump over one hex in any direction. The hex in between is not captured.' },
    // D-059 / D-061: citadel cards — outpost cards about 15–25 % stronger; one of them sits in the citadel
    muster:             { id: 'muster', title: 'Muster', type: 'Reinforcement', kind: 'reinforce', amount: 7, poi: true, text: '+7 minions.' },
    heavy_charge:       { id: 'heavy_charge', title: 'Heavy Charge', type: 'Combat', kind: 'explosive', target: 'adjacent', damage: 5, poi: true, text: 'Pick an adjacent hex: an enemy on it takes 5 damage and the hex is blocked for one round.' },
    trebuchet:          { id: 'trebuchet', title: 'Trebuchet', type: 'Combat', kind: 'catapult', range: 3, damage: 4, poi: true, text: '4 damage to the enemy warband up to 3 hexes away.' },
    war_horn:           { id: 'war_horn', title: 'War Horn', type: 'Combat', kind: 'buff_next', bonus: 3, poi: true, text: '+3 to your next strike.' },
  };
  // D-068: March is gone — every warband has one free step per turn instead
  const BASE_POOL = ['double_advance', 'hook', 'zigzag', 'around', 'rally', 'battle_cry', 'reinforced_formation'];
  const ADVANCED_POOL = ['forced_march', 'long_hook', 'split_march', 'dash', 'flank_claim', 'volley', 'warband_reinforcements'];
  const FIELD_POOL = ['palisade', 'levy', 'outriders', 'fortify', 'scorch', 'quagmire'];
  const DECK_POOL = BASE_POOL.concat(ADVANCED_POOL, FIELD_POOL);
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
    // D-059: the neutral citadel in the middle of the map; its card is rolled from CITADEL_POOL and re-rolled after each capture
    citadel:    { id: 'citadel', title: 'Citadel', card: null, random: true, text: 'Neutral castle in the middle. Holds a stronger card: Muster by default, or a random one (see Settings).' },
  };
  const POI_POOL = Object.keys(POIS).filter(id => !POIS[id].random);
  const CITADEL_POOL = ['muster', 'heavy_charge', 'trebuchet', 'war_horn'], CITADEL_DEFAULT = 'muster';
  // D-061: three visual tiers of cards — plain deck cards, outpost cards, the citadel card
  const tierOf = id => CITADEL_POOL.includes(id) ? 'citadel' : (CARDS[id] && CARDS[id].poi) ? 'outpost' : '';

  // D-070: three archetypes that play very differently. `tag` is the one-line pitch shown on the main-menu button.
  const PRESETS = {
    landgrab: { title: 'Land Grab', icon: 'forced_march', tag: 'Run wide, close big loops, win on territory.',
      cards: ['forced_march', 'long_hook', 'around', 'dash', 'split_march', 'flank_claim', 'outriders', 'levy'], pois: ['watchtower', 'scout_camp'] },
    warlord:  { title: 'Warlord', icon: 'battle_cry', tag: 'Grow the horde, hit hard, destroy the enemy warband.',
      cards: ['double_advance', 'hook', 'battle_cry', 'volley', 'rally', 'warband_reinforcements', 'reinforced_formation', 'forced_march'], pois: ['mine', 'workshop'] },
    warden:   { title: 'Warden', icon: 'palisade', tag: 'Wall them off, burn their land, keep yours safe.',
      cards: ['double_advance', 'hook', 'around', 'palisade', 'fortify', 'scorch', 'levy', 'reinforced_formation'], pois: ['watchtower', 'village'] },
  };

  HB.cards = { CARDS, BASE_POOL, ADVANCED_POOL, FIELD_POOL, DECK_POOL, POIS, POI_POOL, CITADEL_POOL, CITADEL_DEFAULT, tierOf, PRESETS, DIR_LABEL, AXIS_LABEL };
})();
