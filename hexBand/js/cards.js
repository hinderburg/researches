// Card and POI definitions (GDD §12, §13, §16). Card names stay in English as in the GDD; texts are Russian for the UI.
window.HB = window.HB || {};
(function () {
  const CARDS = {
    // ---- base pool (GDD §12)
    advance:            { id: 'advance', name: 'Advance', type: 'Movement', kind: 'move', dirs: [0], text: 'Шаг на 1 гекс вперёд.' },
    double_advance:     { id: 'double_advance', name: 'Double Advance', type: 'Movement', kind: 'move', dirs: [0, 0], text: 'Шаг на 2 гекса вперёд.' },
    forward_left:       { id: 'forward_left', name: 'Forward Left', type: 'Movement', kind: 'move', dirs: [5], diagonal: true, text: 'Шаг на соседний гекс вперёд-влево.' },
    forward_right:      { id: 'forward_right', name: 'Forward Right', type: 'Movement', kind: 'move', dirs: [1], diagonal: true, text: 'Шаг на соседний гекс вперёд-вправо.' },
    backstep:           { id: 'backstep', name: 'Backstep', type: 'Movement', kind: 'move', dirs: [3], text: 'Шаг на 1 гекс назад, направление взгляда не меняется.' },
    pivot:              { id: 'pivot', name: 'Pivot', type: 'Maneuver', kind: 'pivot', target: 'facing', text: 'Повернуть отряд на 60° или 120° без движения.' },
    rally:              { id: 'rally', name: 'Rally', type: 'Reinforcement', kind: 'reinforce', amount: 4, text: '+4 миньона.' },
    battle_cry:         { id: 'battle_cry', name: 'Battle Cry', type: 'Combat', kind: 'buff_next', mult: 1.25, text: 'Следующая атака наносит +25% урона.' },
    // ---- advanced pool (GDD §13)
    hook_turn:          { id: 'hook_turn', name: 'Hook Turn', type: 'Maneuver', kind: 'hook', target: 'side', text: 'Шаг вперёд-вбок, затем ещё шаг дальше в ту же сторону; отряд поворачивается по последнему шагу.' },
    forced_march:       { id: 'forced_march', name: 'Forced March', type: 'Movement', kind: 'move', dirs: [0, 0, 0], forcedMarch: true, text: 'Шаг на 3 гекса вперёд. Если рядом окажется противник — −15% защиты до следующего хода.' },
    reinforced_formation:{ id: 'reinforced_formation', name: 'Reinforced Formation', type: 'Defense', kind: 'formation', text: 'До следующего хода: урон во фронт ×0.7, сбоку ×0.85; отряд не может менять направление.' },
    rear_assault:       { id: 'rear_assault', name: 'Rear Assault', type: 'Combat', kind: 'rear_assault', text: 'Следующая атака: в спину — модификатор ×1.9 вместо ×1.5; иначе +10% урона.' },
    split_march:        { id: 'split_march', name: 'Split March', type: 'Territory', kind: 'split', target: 'side', text: 'Следующие 2 пройденных гекса красят также по одному боковому соседу (сторона на выбор).' },
    warband_reinforcements:{ id: 'warband_reinforcements', name: 'Warband Reinforcements', type: 'Reinforcement', kind: 'reinforce', amount: 7, poiBonus: 2, text: '+7 миньонов. Если контролируете 2+ POI — ещё +2.' },
    tactical_reversal:  { id: 'tactical_reversal', name: 'Tactical Reversal', type: 'Maneuver', kind: 'reversal', text: 'Шаг на 1 гекс назад и разворот на 180°. Следующая атака сбоку по отряду считается атакой во фронт.' },
    // ---- POI cards (GDD §16)
    recruitment:        { id: 'recruitment', name: 'Recruitment', type: 'Reinforcement', kind: 'reinforce', amount: 6, poi: true, text: '+6 миньонов.' },
    overwatch:          { id: 'overwatch', name: 'Overwatch', type: 'Defense', kind: 'overwatch', poi: true, text: 'До следующего хода: противник, вошедший в один из 3 фронтальных гексов, получает автоатаку с 50% урона.' },
    explosive_charge:   { id: 'explosive_charge', name: 'Explosive Charge', type: 'Combat', kind: 'explosive', target: 'adjacent', poi: true, text: 'Выбрать соседний гекс: противник на нём получает 4 урона, гекс заблокирован на 1 раунд.' },
    war_blessing:       { id: 'war_blessing', name: 'War Blessing', type: 'Combat', kind: 'blessing', poi: true, text: 'На этот и 2 следующих хода: +15% к атаке.' },
    reinforced_shields: { id: 'reinforced_shields', name: 'Reinforced Shields', type: 'Defense', kind: 'shields', poi: true, text: 'Следующая атака во фронт по отряду наносит на 40% меньше урона.' },
    scout_route:        { id: 'scout_route', name: 'Scout Route', type: 'Utility', kind: 'scout', target: 'scout', poi: true, text: 'Посмотреть 3 верхние карты колоды и положить одну из них наверх.' },
    claim:              { id: 'claim', name: 'Claim', type: 'Territory', kind: 'claim', poi: true, text: 'Следующие 3 пройденных гекса дают по 2 Territory Points вместо 1.' },
    blink:              { id: 'blink', name: 'Blink', type: 'Movement', kind: 'blink', poi: true, text: 'Переместиться через 1 гекс вперёд. Промежуточный гекс не окрашивается.' },
  };
  const BASE_POOL = ['advance', 'double_advance', 'forward_left', 'forward_right', 'backstep', 'pivot', 'rally', 'battle_cry'];
  const ADVANCED_POOL = ['hook_turn', 'forced_march', 'reinforced_formation', 'rear_assault', 'split_march', 'warband_reinforcements', 'tactical_reversal'];
  const DECK_POOL = BASE_POOL.concat(ADVANCED_POOL);

  const POIS = {
    village:    { id: 'village', name: 'Village', icon: 'V', card: 'recruitment', text: 'Даёт карту Recruitment (+6 миньонов).' },
    watchtower: { id: 'watchtower', name: 'Watchtower', icon: 'T', card: 'overwatch', text: 'Даёт карту Overwatch (автоатака входящих во фронт).' },
    mine:       { id: 'mine', name: 'Mine', icon: 'M', card: 'explosive_charge', text: 'Даёт карту Explosive Charge (урон + блок гекса).' },
    shrine:     { id: 'shrine', name: 'Shrine', icon: 'S', card: 'war_blessing', text: 'Даёт карту War Blessing (+15% атаки на 2 хода).' },
    workshop:   { id: 'workshop', name: 'Workshop', icon: 'W', card: 'reinforced_shields', text: 'Даёт карту Reinforced Shields (−40% к следующей атаке во фронт).' },
    scout_camp: { id: 'scout_camp', name: 'Scout Camp', icon: 'C', card: 'scout_route', text: 'Даёт карту Scout Route (выбор из 3 верхних карт).' },
    war_banner: { id: 'war_banner', name: 'War Banner', icon: 'B', card: 'claim', text: 'Даёт карту Claim (3 гекса по 2 очка).' },
    portal:     { id: 'portal', name: 'Mystic Gate', icon: 'G', card: 'blink', text: 'Даёт карту Blink (прыжок через гекс).' },
  };
  const POI_POOL = Object.keys(POIS);

  // GDD §14, §15 — deck presets built from the 15-card pool.
  const PRESETS = {
    balanced:  { name: 'Balanced Starter', cards: ['advance', 'double_advance', 'forward_left', 'forward_right', 'backstep', 'pivot', 'rally', 'battle_cry'], pois: ['village', 'watchtower', 'shrine'] },
    expansion: { name: 'Expansion', cards: ['advance', 'double_advance', 'forward_left', 'forward_right', 'hook_turn', 'split_march', 'forced_march', 'backstep'], pois: ['war_banner', 'scout_camp', 'portal'] },
    duel:      { name: 'Duel', cards: ['advance', 'forward_left', 'forward_right', 'pivot', 'battle_cry', 'rear_assault', 'tactical_reversal', 'rally'], pois: ['shrine', 'mine', 'workshop'] },
    swarm:     { name: 'Swarm', cards: ['advance', 'double_advance', 'forward_left', 'forward_right', 'pivot', 'rally', 'warband_reinforcements', 'battle_cry'], pois: ['village', 'shrine', 'war_banner'] },
  };

  HB.cards = { CARDS, BASE_POOL, ADVANCED_POOL, DECK_POOL, POIS, POI_POOL, PRESETS };
})();
