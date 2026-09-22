// Card and POI definitions (GDD §12, §13, §16 with the 0.3.x changes: no facing control, absolute directions — D-024..D-026, D-029).
// `name` keeps the GDD English name (used in docs/logs), `ru` is what the UI shows.
window.HB = window.HB || {};
(function () {
  // Relative directions for the board as the player sees it: 0 = forward (toward the enemy), 5 = forward-left,
  // 1 = forward-right, 3 = back, 4 = back-left, 2 = back-right. For the red player they are mirrored vertically (D-025).
  // pick: 'fwd3' — the player picks one of the three forward directions by where the card is dropped (D-029);
  //       'rear3' — one of the three rear directions; 'side' — left or right variant (sideDirs).
  const CARDS = {
    // ---- base pool
    advance:            { id: 'advance', name: 'Advance', ru: 'Марш', type: 'Movement', kind: 'move', pick: 'fwd3', steps: 1, text: 'Шаг на 1 гекс в любом из трёх передних направлений.' },
    double_advance:     { id: 'double_advance', name: 'Double Advance', ru: 'Двойной марш', type: 'Movement', kind: 'move', pick: 'fwd3', steps: 2, text: 'Два шага в одном из трёх передних направлений.' },
    diagonal_march:     { id: 'diagonal_march', name: 'Diagonal March', ru: 'Косой марш', type: 'Movement', kind: 'move', pick: 'side', sideDirs: { L: [5, 5], R: [1, 1] }, text: 'Два шага по диагонали вперёд-влево или вперёд-вправо.' },
    flank_march:        { id: 'flank_march', name: 'Flank March', ru: 'Обход', type: 'Maneuver', kind: 'move', pick: 'side', sideDirs: { L: [5, 4], R: [1, 2] }, text: 'Обойти на два гекса вбок (влево или вправо), оставаясь на том же ряду.' },
    backstep:           { id: 'backstep', name: 'Backstep', ru: 'Назад', type: 'Movement', kind: 'move', pick: 'rear3', steps: 1, text: 'Шаг на 1 гекс в любом из трёх задних направлений.' },
    zigzag:             { id: 'zigzag', name: 'Zigzag', ru: 'Зигзаг', type: 'Maneuver', kind: 'move', pick: 'side', sideDirs: { L: [5, 1], R: [1, 5] }, text: 'Шаг вперёд-влево, затем вперёд-вправо (или наоборот).' },
    rally:              { id: 'rally', name: 'Rally', ru: 'Сбор', type: 'Reinforcement', kind: 'reinforce', amount: 4, text: '+4 миньона.' },
    battle_cry:         { id: 'battle_cry', name: 'Battle Cry', ru: 'Боевой клич', type: 'Combat', kind: 'buff_next', mult: 1.25, text: 'Следующая атака наносит +25% урона.' },
    // ---- advanced pool
    forced_march:       { id: 'forced_march', name: 'Forced March', ru: 'Форсированный марш', type: 'Movement', kind: 'move', pick: 'fwd3', steps: 3, forcedMarch: true, text: 'Три шага в одном из трёх передних направлений. Если рядом окажется противник — −15% защиты до следующего хода.' },
    retreat:            { id: 'retreat', name: 'Retreat', ru: 'Отход', type: 'Maneuver', kind: 'move', pick: 'rear3', steps: 2, text: 'Два шага в одном из трёх задних направлений.' },
    charge:             { id: 'charge', name: 'Charge', ru: 'Натиск', type: 'Combat', kind: 'charge', pick: 'fwd3', steps: 1, text: 'Шаг в одном из передних направлений. Если сразу после этого начинается бой — атака наносит +30% урона.' },
    reinforced_formation:{ id: 'reinforced_formation', name: 'Reinforced Formation', ru: 'Плотный строй', type: 'Defense', kind: 'formation', text: 'До следующего хода: урон во фронт ×0.7, сбоку ×0.85.' },
    rear_assault:       { id: 'rear_assault', name: 'Rear Assault', ru: 'Удар в спину', type: 'Combat', kind: 'rear_assault', text: 'Следующая атака: в спину — модификатор ×1.9 вместо ×1.5; иначе +10% урона.' },
    split_march:        { id: 'split_march', name: 'Split March', ru: 'Широкий марш', type: 'Territory', kind: 'split', target: 'side', text: 'Следующие 2 пройденных гекса красят также по одному боковому соседу (сторона на выбор).' },
    warband_reinforcements:{ id: 'warband_reinforcements', name: 'Warband Reinforcements', ru: 'Подкрепление', type: 'Reinforcement', kind: 'reinforce', amount: 7, poiBonus: 2, text: '+7 миньонов. Если контролируете 2+ точки — ещё +2.' },
    // ---- POI cards
    recruitment:        { id: 'recruitment', name: 'Recruitment', ru: 'Вербовка', type: 'Reinforcement', kind: 'reinforce', amount: 6, poi: true, text: '+6 миньонов.' },
    overwatch:          { id: 'overwatch', name: 'Overwatch', ru: 'Дозор', type: 'Defense', kind: 'overwatch', poi: true, text: 'До следующего хода: противник, вошедший в один из 3 фронтальных гексов, получает автоатаку с 50% урона.' },
    explosive_charge:   { id: 'explosive_charge', name: 'Explosive Charge', ru: 'Взрывной заряд', type: 'Combat', kind: 'explosive', target: 'adjacent', poi: true, text: 'Выбрать соседний гекс: противник на нём получает 4 урона, гекс заблокирован на 1 раунд.' },
    war_blessing:       { id: 'war_blessing', name: 'War Blessing', ru: 'Благословение', type: 'Combat', kind: 'blessing', poi: true, text: 'На этот и 2 следующих хода: +15% к атаке.' },
    reinforced_shields: { id: 'reinforced_shields', name: 'Reinforced Shields', ru: 'Крепкие щиты', type: 'Defense', kind: 'shields', poi: true, text: 'Следующая атака во фронт по отряду наносит на 40% меньше урона.' },
    scout_route:        { id: 'scout_route', name: 'Scout Route', ru: 'Разведка', type: 'Utility', kind: 'scout', target: 'scout', poi: true, text: 'Посмотреть 3 верхние карты колоды и положить одну из них наверх.' },
    claim:              { id: 'claim', name: 'Claim', ru: 'Знамя', type: 'Territory', kind: 'claim', poi: true, text: 'Следующие 3 пройденных гекса дают по 2 очка территории вместо 1.' },
    blink:              { id: 'blink', name: 'Blink', ru: 'Прыжок', type: 'Movement', kind: 'blink', poi: true, text: 'Переместиться через 1 гекс вперёд. Промежуточный гекс не окрашивается.' },
  };
  const BASE_POOL = ['advance', 'double_advance', 'diagonal_march', 'flank_march', 'backstep', 'zigzag', 'rally', 'battle_cry'];
  const ADVANCED_POOL = ['forced_march', 'retreat', 'charge', 'reinforced_formation', 'rear_assault', 'split_march', 'warband_reinforcements'];
  const DECK_POOL = BASE_POOL.concat(ADVANCED_POOL);
  const DIR_RU = { 0: 'вперёд', 5: 'вперёд-влево', 1: 'вперёд-вправо', 3: 'назад', 4: 'назад-влево', 2: 'назад-вправо' };

  // `build` selects the outpost drawing in render.js
  const POIS = {
    village:    { id: 'village', name: 'Village', ru: 'Деревня', build: 'house', card: 'recruitment', text: 'Даёт карту «Вербовка» (+6 миньонов).' },
    watchtower: { id: 'watchtower', name: 'Watchtower', ru: 'Башня', build: 'tower', card: 'overwatch', text: 'Даёт карту «Дозор» (автоатака входящих во фронт).' },
    mine:       { id: 'mine', name: 'Mine', ru: 'Шахта', build: 'mine', card: 'explosive_charge', text: 'Даёт карту «Взрывной заряд» (урон + блок гекса).' },
    shrine:     { id: 'shrine', name: 'Shrine', ru: 'Святилище', build: 'shrine', card: 'war_blessing', text: 'Даёт карту «Благословение» (+15% атаки на 2 хода).' },
    workshop:   { id: 'workshop', name: 'Workshop', ru: 'Мастерская', build: 'workshop', card: 'reinforced_shields', text: 'Даёт карту «Крепкие щиты» (−40% к следующей атаке во фронт).' },
    scout_camp: { id: 'scout_camp', name: 'Scout Camp', ru: 'Лагерь', build: 'camp', card: 'scout_route', text: 'Даёт карту «Разведка» (выбор из 3 верхних карт).' },
    war_banner: { id: 'war_banner', name: 'War Banner', ru: 'Знамя войны', build: 'banner', card: 'claim', text: 'Даёт карту «Знамя» (3 гекса по 2 очка).' },
    portal:     { id: 'portal', name: 'Mystic Gate', ru: 'Портал', build: 'portal', card: 'blink', text: 'Даёт карту «Прыжок» (прыжок через гекс).' },
  };
  const POI_POOL = Object.keys(POIS);

  const PRESETS = {
    balanced:  { name: 'Balanced Starter', ru: 'Сбалансированная', cards: ['advance', 'double_advance', 'diagonal_march', 'flank_march', 'backstep', 'zigzag', 'rally', 'battle_cry'], pois: ['village', 'watchtower', 'shrine'] },
    expansion: { name: 'Expansion', ru: 'Экспансия', cards: ['advance', 'double_advance', 'diagonal_march', 'flank_march', 'zigzag', 'split_march', 'forced_march', 'backstep'], pois: ['war_banner', 'scout_camp', 'portal'] },
    duel:      { name: 'Duel', ru: 'Дуэль', cards: ['advance', 'diagonal_march', 'flank_march', 'charge', 'battle_cry', 'rear_assault', 'retreat', 'rally'], pois: ['shrine', 'mine', 'workshop'] },
    swarm:     { name: 'Swarm', ru: 'Орда', cards: ['advance', 'double_advance', 'diagonal_march', 'flank_march', 'backstep', 'rally', 'warband_reinforcements', 'battle_cry'], pois: ['village', 'shrine', 'war_banner'] },
  };

  HB.cards = { CARDS, BASE_POOL, ADVANCED_POOL, DECK_POOL, POIS, POI_POOL, PRESETS, DIR_RU };
})();
