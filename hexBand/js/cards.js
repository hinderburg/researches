// Card and POI definitions (GDD §12, §13, §16 with the 0.3.0 changes: no facing control, absolute directions — D-024..D-026).
// `name` keeps the GDD English name (used in docs/logs), `ru` is what the UI shows.
window.HB = window.HB || {};
(function () {
  // dirs are relative to the board as seen by the player: 0 = forward (toward the enemy), 5 = forward-left, 1 = forward-right,
  // 3 = back, 4 = back-left, 2 = back-right. For the red player they are mirrored vertically (D-025).
  const CARDS = {
    // ---- base pool
    advance:            { id: 'advance', name: 'Advance', ru: 'Марш', type: 'Movement', kind: 'move', dirs: [0], text: 'Шаг на 1 гекс вперёд.' },
    double_advance:     { id: 'double_advance', name: 'Double Advance', ru: 'Двойной марш', type: 'Movement', kind: 'move', dirs: [0, 0], text: 'Шаг на 2 гекса вперёд.' },
    forward_left:       { id: 'forward_left', name: 'Forward Left', ru: 'Вперёд-влево', type: 'Movement', kind: 'move', dirs: [5], text: 'Шаг на соседний гекс вперёд-влево.' },
    forward_right:      { id: 'forward_right', name: 'Forward Right', ru: 'Вперёд-вправо', type: 'Movement', kind: 'move', dirs: [1], text: 'Шаг на соседний гекс вперёд-вправо.' },
    backstep:           { id: 'backstep', name: 'Backstep', ru: 'Назад', type: 'Movement', kind: 'move', dirs: [3], text: 'Шаг на 1 гекс назад.' },
    sidestep:           { id: 'sidestep', name: 'Sidestep', ru: 'Шаг вбок', type: 'Maneuver', kind: 'sidestep', target: 'side', text: 'Шаг на соседний гекс назад-влево или назад-вправо (сторона на выбор).' },
    rally:              { id: 'rally', name: 'Rally', ru: 'Сбор', type: 'Reinforcement', kind: 'reinforce', amount: 4, text: '+4 миньона.' },
    battle_cry:         { id: 'battle_cry', name: 'Battle Cry', ru: 'Боевой клич', type: 'Combat', kind: 'buff_next', mult: 1.25, text: 'Следующая атака наносит +25% урона.' },
    // ---- advanced pool
    zigzag:             { id: 'zigzag', name: 'Zigzag', ru: 'Зигзаг', type: 'Maneuver', kind: 'zigzag', target: 'side', text: 'Шаг вперёд-влево, затем вперёд-вправо (или наоборот — сторона первого шага на выбор).' },
    forced_march:       { id: 'forced_march', name: 'Forced March', ru: 'Форсированный марш', type: 'Movement', kind: 'move', dirs: [0, 0, 0], forcedMarch: true, text: 'Шаг на 3 гекса вперёд. Если рядом окажется противник — −15% защиты до следующего хода.' },
    reinforced_formation:{ id: 'reinforced_formation', name: 'Reinforced Formation', ru: 'Плотный строй', type: 'Defense', kind: 'formation', text: 'До следующего хода: урон во фронт ×0.7, сбоку ×0.85.' },
    rear_assault:       { id: 'rear_assault', name: 'Rear Assault', ru: 'Удар в спину', type: 'Combat', kind: 'rear_assault', text: 'Следующая атака: в спину — модификатор ×1.9 вместо ×1.5; иначе +10% урона.' },
    split_march:        { id: 'split_march', name: 'Split March', ru: 'Широкий марш', type: 'Territory', kind: 'split', target: 'side', text: 'Следующие 2 пройденных гекса красят также по одному боковому соседу (сторона на выбор).' },
    warband_reinforcements:{ id: 'warband_reinforcements', name: 'Warband Reinforcements', ru: 'Подкрепление', type: 'Reinforcement', kind: 'reinforce', amount: 7, poiBonus: 2, text: '+7 миньонов. Если контролируете 2+ точки — ещё +2.' },
    charge:             { id: 'charge', name: 'Charge', ru: 'Натиск', type: 'Combat', kind: 'charge', dirs: [0], text: 'Шаг на 1 гекс вперёд. Если сразу после этого начинается бой — атака наносит +30% урона.' },
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
  const BASE_POOL = ['advance', 'double_advance', 'forward_left', 'forward_right', 'backstep', 'sidestep', 'rally', 'battle_cry'];
  const ADVANCED_POOL = ['zigzag', 'forced_march', 'reinforced_formation', 'rear_assault', 'split_march', 'warband_reinforcements', 'charge'];
  const DECK_POOL = BASE_POOL.concat(ADVANCED_POOL);

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
    balanced:  { name: 'Balanced Starter', ru: 'Сбалансированная', cards: ['advance', 'double_advance', 'forward_left', 'forward_right', 'backstep', 'sidestep', 'rally', 'battle_cry'], pois: ['village', 'watchtower', 'shrine'] },
    expansion: { name: 'Expansion', ru: 'Экспансия', cards: ['advance', 'double_advance', 'forward_left', 'forward_right', 'zigzag', 'split_march', 'forced_march', 'sidestep'], pois: ['war_banner', 'scout_camp', 'portal'] },
    duel:      { name: 'Duel', ru: 'Дуэль', cards: ['advance', 'forward_left', 'forward_right', 'charge', 'battle_cry', 'rear_assault', 'sidestep', 'rally'], pois: ['shrine', 'mine', 'workshop'] },
    swarm:     { name: 'Swarm', ru: 'Орда', cards: ['advance', 'double_advance', 'forward_left', 'forward_right', 'backstep', 'rally', 'warband_reinforcements', 'battle_cry'], pois: ['village', 'shrine', 'war_banner'] },
  };

  HB.cards = { CARDS, BASE_POOL, ADVANCED_POOL, DECK_POOL, POIS, POI_POOL, PRESETS };
})();
