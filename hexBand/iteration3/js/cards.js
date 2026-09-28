// V4 "Overlord" data (iteration3, D-085): minion types with direct numbers, Overlord cards, minion cards, upgrade
// points and ready-made loadouts. UI text is English (D-052).
// Route cards define a PATTERN, never a direction (D-030): `pattern` lists turn offsets relative to a base direction
// chosen by the player when the card is dropped; `mirror: true` also allows the left-handed version.
window.HB = window.HB || {};
(function () {
  // ---- minion types. Every type is the same set of numbers plus one trait (VARIANT-OVERLORD §4.3):
  // hp / atk per minion, speed (route steps per turn), capture (1 = the hex it walks on, 2 = plus the hex to its right),
  // ret (hexes per turn back to the Overlord), range (0 = melee), weight (Command units per minion), shield (who takes
  // a hit for the Overlord first: higher goes first), out (minions leaving the pit per turn). Level L adds
  // floor((L − 1) × grow) to hp / atk / out; ret gets +1 at levels 4 and 8.
  const MINION_TYPES = {
    brawler: { id: 'brawler', title: 'Brawlers', one: 'Brawler', color: '#c98a3a', hp: 3, atk: 2, speed: 2, capture: 1, ret: 2, range: 0, weight: 1, shield: 3, out: 2,
      grow: { hp: 0.34, atk: 0.34, out: 0.25 }, trait: 'steady', traitTitle: 'Steady', traitText: 'After winning a fight on a sortie they keep going.' },
    runner: { id: 'runner', title: 'Runners', one: 'Runner', color: '#5cbf57', hp: 1, atk: 1, speed: 3, capture: 2, ret: 3, range: 0, weight: 1, shield: 1, out: 3,
      grow: { hp: 0.2, atk: 0.2, out: 0.25 }, trait: 'paint_back', traitTitle: 'Light-footed', traitText: 'They paint hexes on the way back too.' },
    archer: { id: 'archer', title: 'Archers', one: 'Archer', color: '#e2c24a', hp: 2, atk: 2, speed: 1, capture: 1, ret: 2, range: 2, weight: 1, shield: 1, out: 2,
      grow: { hp: 0.25, atk: 0.34, out: 0.25 }, trait: 'ranged', traitTitle: 'Ranged 2', traitText: 'They shoot an enemy group within 2 hexes instead of closing in; no retaliation.' },
    brute: { id: 'brute', title: 'Brutes', one: 'Brute', color: '#9a8f86', hp: 8, atk: 5, speed: 1, capture: 1, ret: 1, range: 0, weight: 3, shield: 4, out: 1,
      grow: { hp: 1, atk: 0.5, out: 0.15 }, trait: 'breach', traitTitle: 'Breach', traitText: 'They walk through palisades and deal double damage to waiting groups.' },
    healer: { id: 'healer', title: 'Healers', one: 'Healer', color: '#b98be0', hp: 2, atk: 0, speed: 2, capture: 1, ret: 2, range: 0, weight: 1, shield: 2, out: 2,
      grow: { hp: 0.34, atk: 0, out: 0.25 }, trait: 'heal', traitTitle: 'Healing', traitText: 'While with the Overlord they heal the retinue\'s wounds and the Overlord (+1 HP per 2 healers) each turn.' },
  };
  const TYPE_ORDER = ['brawler', 'runner', 'archer', 'brute', 'healer'];

  const CARDS = {
    // ---- Overlord cards (pick 3)
    stride: { id: 'stride', title: 'Stride', type: 'Overlord', owner: 'hero', kind: 'hero_move', pattern: [0, 0], icon: 'double_advance', text: 'Your Overlord walks 2 hexes in a straight line, painting them. Stepping onto an enemy group attacks it.' },
    detour: { id: 'detour', title: 'Detour', type: 'Overlord', owner: 'hero', kind: 'hero_move', pattern: [0, 1], mirror: true, icon: 'hook', text: 'Your Overlord walks 2 hexes with a 60° turn, painting them.' },
    recall: { id: 'recall', title: 'Recall', type: 'Overlord', owner: 'hero', kind: 'recall', icon: 'v_recall', text: 'Every group of yours on the field — on a sortie, on its way back or waiting — runs back to the Overlord at once.' },
    war_cry: { id: 'war_cry', title: 'War Cry', type: 'Overlord', owner: 'hero', kind: 'war_cry', bonus: 1, icon: 'v_warcry', text: '+1 Attack to every minion of yours until the end of your turn.' },
    standard: { id: 'standard', title: 'Standard', type: 'Overlord', owner: 'hero', kind: 'fortify', radius: 1, rounds: 2, icon: 'fortify', text: 'Your hexes next to the Overlord cannot be captured or burnt by the enemy for 2 rounds.' },
    // ---- Brawlers
    b_charge: { id: 'b_charge', title: 'Charge', type: 'Brawlers', owner: 'brawler', kind: 'sortie', pattern: [0, 0, 0], atkBonus: 1, req: 4, icon: 'v_charge', text: 'All brawlers with the Overlord charge 3 hexes straight, +1 Attack in fights on the way. Needs 4+ brawlers in the army.' },
    b_breach: { id: 'b_breach', title: 'Break Through', type: 'Brawlers', owner: 'brawler', kind: 'sortie', pattern: [0, 1], mirror: true, req: 1, icon: 'hook', text: 'All brawlers with the Overlord go 2 hexes with a 60° turn.' },
    b_envelop: { id: 'b_envelop', title: 'Envelop', type: 'Brawlers', owner: 'brawler', kind: 'sortie', pattern: [0, 1], mirror: true, curl: true, req: 3, icon: 'around', text: 'All brawlers with the Overlord curl 2 hexes round a neighbour; that hex is captured too. Needs 3+ brawlers.' },
    // ---- Runners
    r_raid: { id: 'r_raid', title: 'Raid', type: 'Runners', owner: 'runner', kind: 'sortie', pattern: [0, 0, 1, 1], mirror: true, req: 4, icon: 'v_raid', text: 'All runners with the Overlord run 4 hexes: 2 straight, then 2 after one bend. They capture a 2-hex-wide strip on the inner side of the bend. Needs 4+ runners.' },
    r_weave: { id: 'r_weave', title: 'Weave', type: 'Runners', owner: 'runner', kind: 'sortie', pattern: [0, 2, 0], mirror: true, req: 1, icon: 'v_weave', text: 'All runners with the Overlord zigzag 3 hexes.' },
    r_sweep: { id: 'r_sweep', title: 'Sweep', type: 'Runners', owner: 'runner', kind: 'sortie', pattern: [0, 0], wide: true, req: 2, icon: 'v_sweep', text: 'All runners with the Overlord run 2 hexes straight and capture the hexes on both sides. Needs 2+ runners.' },
    // ---- Archers
    a_volley: { id: 'a_volley', title: 'Volley', type: 'Archers', owner: 'archer', kind: 'volley', range: 2, req: 1, icon: 'volley', text: 'The archers with the Overlord shoot an enemy group within 2 hexes: archers × Attack damage, no retaliation. They stay with the Overlord.' },
    a_ambush: { id: 'a_ambush', title: 'Ambush', type: 'Archers', owner: 'archer', kind: 'sortie', pattern: [0, 0], atkBonus: 1, req: 3, icon: 'v_ambush', text: 'All archers with the Overlord walk 2 hexes (slowly) and shoot the first enemy group within 2 hexes with +1 Attack. Needs 3+ archers.' },
    a_fire: { id: 'a_fire', title: 'Fire Arrows', type: 'Archers', owner: 'archer', kind: 'scorch', range: 3, req: 4, icon: 'scorch', text: 'Burn a line of 3 hexes from the Overlord: enemy hexes on it turn neutral. Needs archers with the Overlord and 4+ in the army.' },
    // ---- Brutes
    u_ram: { id: 'u_ram', title: 'Ram', type: 'Brutes', owner: 'brute', kind: 'sortie', pattern: [0, 0], atkBonus: 2, req: 1, icon: 'v_ram', text: 'All brutes with the Overlord smash 2 hexes straight, +2 Attack in fights on the way.' },
    u_earthworks: { id: 'u_earthworks', title: 'Earthworks', type: 'Brutes', owner: 'brute', kind: 'palisade', rounds: 2, req: 1, icon: 'palisade', text: 'The brutes throw up a wall along the three far edges of a neighbouring hex for 2 rounds. They stay with the Overlord.' },
    u_smash: { id: 'u_smash', title: 'Smash', type: 'Brutes', owner: 'brute', kind: 'sortie', pattern: [0, 1], mirror: true, req: 2, icon: 'v_smash', text: 'All brutes with the Overlord go 2 hexes with a 60° turn. Needs 2+ brutes.' },
    // ---- Healers
    h_bless: { id: 'h_bless', title: 'Blessing', type: 'Healers', owner: 'healer', kind: 'bless', req: 1, icon: 'prayer', text: 'Every wounded minion with the Overlord is healed and the Overlord gets +1 HP per healer with him.' },
    h_pilgrims: { id: 'h_pilgrims', title: 'Pilgrims', type: 'Healers', owner: 'healer', kind: 'sortie', pattern: [0, 2], mirror: true, req: 1, icon: 'zigzag', text: 'All healers with the Overlord walk 2 hexes with a 120° turn, capturing on the way.' },
    h_call: { id: 'h_call', title: 'Call to Arms', type: 'Healers', owner: 'healer', kind: 'call', req: 2, icon: 'v_call', text: 'Every pit sends up to 2 more minions now (never above the army size), by the road rule. Needs 2+ healers.' },
  };
  for (const id in CARDS) CARDS[id].ru = CARDS[id].title;
  const HERO_POOL = ['stride', 'detour', 'recall', 'war_cry', 'standard'];
  const MINION_CARDS = t => Object.keys(CARDS).filter(id => CARDS[id].owner === t);

  // ---- upgrade points (D-085): each mirrored pair belongs to a minion type chosen at the start of a match
  const POINT_KINDS = {
    brawler: { title: 'Forge', text: '+1 level to your brawlers while you hold it.' },
    runner: { title: 'Nest', text: '+1 level to your runners while you hold it.' },
    archer: { title: 'Archery Range', text: '+1 level to your archers while you hold it.' },
    brute: { title: 'Quarry', text: '+1 level to your brutes while you hold it.' },
    healer: { title: 'Well', text: '+1 level to your healers while you hold it.' },
    citadel: { title: 'Citadel', text: 'Taking it heals your Overlord by 5; while you hold it every pit sends 1 more minion per turn.' },
  };

  // ---- ready-made loadouts: 3 minion types with their counts (weights within Command 23), 3 Overlord cards, 1 card per type
  const LOADOUTS = {
    horde: { title: 'Horde', icon: 't_brawler', tag: 'Brawlers up front, runners for land, archers behind.',
      types: { brawler: 10, runner: 8, archer: 5 }, hero: ['stride', 'war_cry', 'recall'], minion: ['b_charge', 'r_raid', 'a_volley'] },
    raiders: { title: 'Raiders', icon: 't_runner', tag: 'Fast land-grabbers who heal and come back.',
      types: { runner: 12, brawler: 6, healer: 5 }, hero: ['detour', 'recall', 'standard'], minion: ['r_raid', 'b_breach', 'h_pilgrims'] },
    siege: { title: 'Ironclad', icon: 't_brute', tag: 'Few, heavy and hard to stop.',
      types: { brute: 4, brawler: 6, archer: 5 }, hero: ['stride', 'war_cry', 'standard'], minion: ['u_ram', 'b_breach', 'a_ambush'] },
  };

  const DIR_LABEL = ['up', 'up-right', 'down-right', 'down', 'down-left', 'up-left'];
  const AXIS_LABEL = ['vertical', 'diagonal ↗', 'diagonal ↘'];
  const tierOf = id => (CARDS[id] && CARDS[id].owner === 'hero') ? 'hero' : '';
  const iconOf = id => (CARDS[id] && CARDS[id].icon) || id;

  HB.cards = { CARDS, MINION_TYPES, TYPE_ORDER, HERO_POOL, MINION_CARDS, POINT_KINDS, LOADOUTS, PRESETS: LOADOUTS, DIR_LABEL, AXIS_LABEL, tierOf, iconOf };
})();
