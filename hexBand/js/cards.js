// Card and POI definitions. Movement cards define a PATTERN and a DISTANCE, never a direction (D-030):
// `pattern` lists turn offsets relative to a base direction d chosen by the player when the card is dropped
// (0 = keep going, +1 = turn 60° right, +2 = 120° right ...). `mirror: true` also allows the left-handed version.
// `name` keeps the GDD English name (used in docs/logs), `ru` is what the UI shows.
window.HB = window.HB || {};
(function () {
  const CARDS = {
    // ---- base pool
    advance:            { id: 'advance', name: 'March', ru: 'Марш', type: 'Movement', kind: 'move', pattern: [0], text: 'Один шаг в любом направлении.' },
    double_advance:     { id: 'double_advance', name: 'Double March', ru: 'Двойной марш', type: 'Movement', kind: 'move', pattern: [0, 0], text: 'Два шага по прямой в любом направлении.' },
    hook:               { id: 'hook', name: 'Hook', ru: 'Крюк', type: 'Maneuver', kind: 'move', pattern: [0, 1], mirror: true, text: 'Два шага с поворотом на 60° (в любую сторону).' },
    zigzag:             { id: 'zigzag', name: 'Zigzag', ru: 'Зигзаг', type: 'Maneuver', kind: 'move', pattern: [0, 2], mirror: true, text: 'Два шага с поворотом на 120°: зубец в любую сторону.' },
    around:             { id: 'around', name: 'Around', ru: 'Обход', type: 'Maneuver', kind: 'move', pattern: [0, 1, 2], mirror: true, text: 'Три шага полукольцом вокруг соседнего гекса.' },
    rally:              { id: 'rally', name: 'Rally', ru: 'Сбор', type: 'Reinforcement', kind: 'reinforce', amount: 4, text: '+4 миньона.' },
    battle_cry:         { id: 'battle_cry', name: 'Battle Cry', ru: 'Боевой клич', type: 'Combat', kind: 'buff_next', mult: 1.25, text: 'Следующая атака наносит +25% урона.' },
    reinforced_formation:{ id: 'reinforced_formation', name: 'Reinforced Formation', ru: 'Плотный строй', type: 'Defense', kind: 'formation', text: 'До следующего хода: весь входящий урон ×0.75.' },
    // ---- advanced pool
    forced_march:       { id: 'forced_march', name: 'Forced March', ru: 'Форсированный марш', type: 'Movement', kind: 'move', pattern: [0, 0, 0], forcedMarch: true, text: 'Три шага по прямой. Если рядом окажется противник — −15% защиты до следующего хода.' },
    long_hook:          { id: 'long_hook', name: 'Long Hook', ru: 'Дальний крюк', type: 'Maneuver', kind: 'move', pattern: [0, 0, 1], mirror: true, text: 'Два шага прямо, затем шаг с поворотом на 60°.' },
    ring:               { id: 'ring', name: 'Ring', ru: 'Кольцо', type: 'Territory', kind: 'move', pattern: [0, 1, 2, 3, 4], mirror: true, text: 'Пять шагов вокруг соседнего гекса — замыкает кольцо и захватывает его.' },
    charge:             { id: 'charge', name: 'Charge', ru: 'Натиск', type: 'Combat', kind: 'charge', pattern: [0], text: 'Один шаг в любом направлении. Если сразу после этого начинается бой — атака наносит +30% урона.' },
    counter:            { id: 'counter', name: 'Counterstrike', ru: 'Ответный удар', type: 'Defense', kind: 'counter', text: 'До следующего хода: каждая атака по отряду получает ответный удар с 50% урона.' },
    split_march:        { id: 'split_march', name: 'Split March', ru: 'Широкий марш', type: 'Territory', kind: 'split', target: 'side', text: 'Следующие 2 пройденных гекса красят также по одному боковому соседу (сторона на выбор).' },
    warband_reinforcements:{ id: 'warband_reinforcements', name: 'Warband Reinforcements', ru: 'Подкрепление', type: 'Reinforcement', kind: 'reinforce', amount: 7, poiBonus: 2, text: '+7 миньонов. Если контролируете 2+ точки — ещё +2.' },
    // ---- POI cards
    recruitment:        { id: 'recruitment', name: 'Recruitment', ru: 'Вербовка', type: 'Reinforcement', kind: 'reinforce', amount: 6, poi: true, text: '+6 миньонов.' },
    overwatch:          { id: 'overwatch', name: 'Overwatch', ru: 'Дозор', type: 'Defense', kind: 'overwatch', poi: true, text: 'До следующего хода: противник, вошедший на соседний гекс, получает автоатаку с 50% урона.' },
    explosive_charge:   { id: 'explosive_charge', name: 'Explosive Charge', ru: 'Взрывной заряд', type: 'Combat', kind: 'explosive', target: 'adjacent', poi: true, text: 'Выбрать соседний гекс: противник на нём получает 4 урона, гекс заблокирован на 1 раунд.' },
    war_blessing:       { id: 'war_blessing', name: 'War Blessing', ru: 'Благословение', type: 'Combat', kind: 'blessing', poi: true, text: 'На этот и 2 следующих хода: +15% к атаке.' },
    reinforced_shields: { id: 'reinforced_shields', name: 'Reinforced Shields', ru: 'Крепкие щиты', type: 'Defense', kind: 'shields', poi: true, text: 'Следующая атака по отряду наносит на 40% меньше урона.' },
    scout_route:        { id: 'scout_route', name: 'Scout Route', ru: 'Разведка', type: 'Utility', kind: 'scout', target: 'scout', poi: true, text: 'Посмотреть 3 верхние карты колоды и положить одну из них наверх.' },
    claim:              { id: 'claim', name: 'Claim', ru: 'Знамя', type: 'Territory', kind: 'claim', poi: true, text: 'Следующие 3 пройденных гекса дают по 2 очка территории вместо 1.' },
    blink:              { id: 'blink', name: 'Blink', ru: 'Прыжок', type: 'Movement', kind: 'blink', poi: true, text: 'Прыжок через один гекс в любом направлении. Промежуточный гекс не окрашивается.' },
  };
  const BASE_POOL = ['advance', 'double_advance', 'hook', 'zigzag', 'around', 'rally', 'battle_cry', 'reinforced_formation'];
  const ADVANCED_POOL = ['forced_march', 'long_hook', 'ring', 'charge', 'counter', 'split_march', 'warband_reinforcements'];
  const DECK_POOL = BASE_POOL.concat(ADVANCED_POOL);
  // absolute directions for logs / labels: 0 N, 1 NE, 2 SE, 3 S, 4 SW, 5 NW
  const DIR_RU = ['вверх', 'вверх-вправо', 'вниз-вправо', 'вниз', 'вниз-влево', 'вверх-влево'];

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
    balanced:  { name: 'Balanced Starter', ru: 'Сбалансированная', cards: ['advance', 'double_advance', 'hook', 'zigzag', 'around', 'rally', 'battle_cry', 'reinforced_formation'], pois: ['village', 'watchtower', 'shrine'] },
    expansion: { name: 'Expansion', ru: 'Экспансия', cards: ['advance', 'double_advance', 'hook', 'zigzag', 'around', 'ring', 'split_march', 'forced_march'], pois: ['war_banner', 'scout_camp', 'portal'] },
    duel:      { name: 'Duel', ru: 'Дуэль', cards: ['advance', 'double_advance', 'hook', 'charge', 'battle_cry', 'counter', 'rally', 'reinforced_formation'], pois: ['shrine', 'mine', 'workshop'] },
    swarm:     { name: 'Swarm', ru: 'Орда', cards: ['advance', 'double_advance', 'hook', 'around', 'rally', 'warband_reinforcements', 'battle_cry', 'long_hook'], pois: ['village', 'shrine', 'war_banner'] },
  };

  HB.cards = { CARDS, BASE_POOL, ADVANCED_POOL, DECK_POOL, POIS, POI_POOL, PRESETS, DIR_RU };
})();
