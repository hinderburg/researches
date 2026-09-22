// Card and POI definitions (0.7.0: card pool rework — D-038, active outpost cards — D-041).
// Movement cards define a PATTERN and a DISTANCE, never a direction (D-030): `pattern` lists turn offsets relative to a
// base direction chosen by the player when the card is dropped; `mirror: true` also allows the left-handed version.
// `name` keeps an English name for docs/logs, `ru` is what the UI shows.
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
    battle_cry:         { id: 'battle_cry', name: 'Battle Cry', ru: 'Боевой клич', type: 'Combat', kind: 'buff_next', mult: 1.25, text: 'Следующий удар вашего отряда наносит +25% урона.' },
    reinforced_formation:{ id: 'reinforced_formation', name: 'Reinforced Formation', ru: 'Плотный строй', type: 'Defense', kind: 'formation', text: 'До следующего хода: весь входящий урон ×0.75.' },
    // ---- advanced pool
    forced_march:       { id: 'forced_march', name: 'Forced March', ru: 'Форсированный марш', type: 'Movement', kind: 'move', pattern: [0, 0, 0], text: 'Три шага по прямой в любом направлении.' },
    long_hook:          { id: 'long_hook', name: 'Long Hook', ru: 'Дальний крюк', type: 'Maneuver', kind: 'move', pattern: [0, 0, 1], mirror: true, text: 'Два шага прямо, затем шаг с поворотом на 60°.' },
    split_march:        { id: 'split_march', name: 'Wide March', ru: 'Широкий марш', type: 'Territory', kind: 'move', pattern: [0], wide: true, text: 'Один шаг в любом направлении; захватываются также два гекса по бокам от шага.' },
    dash:               { id: 'dash', name: 'Dash', ru: 'Бросок', type: 'Territory', kind: 'move', pattern: [0, 0], ahead: 1, text: 'Два шага по прямой; следующий гекс по ходу движения тоже захватывается.' },
    flank_claim:        { id: 'flank_claim', name: 'Flank Claim', ru: 'Захват флангов', type: 'Territory', kind: 'flank_claim', target: 'axis', text: 'Захватить два соседних гекса на одной линии с отрядом, с разных сторон от него.' },
    volley:             { id: 'volley', name: 'Volley', ru: 'Залп', type: 'Combat', kind: 'volley', range: 2, text: 'Удар по отряду противника на расстоянии до 2 гексов. Противник не отвечает.' },
    warband_reinforcements:{ id: 'warband_reinforcements', name: 'Warband Reinforcements', ru: 'Подкрепление', type: 'Reinforcement', kind: 'reinforce', amount: 6, text: '+6 миньонов.' },
    // ---- POI cards (all with an immediate, visible effect — D-041)
    recruitment:        { id: 'recruitment', name: 'Recruitment', ru: 'Вербовка', type: 'Reinforcement', kind: 'reinforce', amount: 6, poi: true, text: '+6 миньонов.' },
    cordon:             { id: 'cordon', name: 'Cordon', ru: 'Оцепление', type: 'Territory', kind: 'cordon', poi: true, text: 'Захватить все гексы вокруг отряда.' },
    explosive_charge:   { id: 'explosive_charge', name: 'Explosive Charge', ru: 'Взрывной заряд', type: 'Combat', kind: 'explosive', target: 'adjacent', poi: true, text: 'Выбрать соседний гекс: противник на нём получает 4 урона, гекс заблокирован на 1 раунд.' },
    prayer:             { id: 'prayer', name: 'Prayer', ru: 'Молитва', type: 'Utility', kind: 'prayer', poi: true, text: 'Вернуть верхнюю карту сброса в руку.' },
    catapult:           { id: 'catapult', name: 'Catapult', ru: 'Катапульта', type: 'Combat', kind: 'catapult', range: 3, damage: 3, poi: true, text: '3 урона отряду противника на расстоянии до 3 гексов.' },
    scout_draw:         { id: 'scout_draw', name: 'Scouting', ru: 'Разведка', type: 'Utility', kind: 'scout_draw', poi: true, text: 'Добрать карты до полной руки.' },
    banner:             { id: 'banner', name: 'Banner', ru: 'Знамя', type: 'Territory', kind: 'banner', poi: true, text: 'Ваши гексы вокруг отряда (и под ним) дают по 2 очка вместо 1.' },
    blink:              { id: 'blink', name: 'Blink', ru: 'Прыжок', type: 'Movement', kind: 'blink', poi: true, text: 'Прыжок через один гекс в любом направлении. Промежуточный гекс не окрашивается.' },
  };
  const BASE_POOL = ['advance', 'double_advance', 'hook', 'zigzag', 'around', 'rally', 'battle_cry', 'reinforced_formation'];
  const ADVANCED_POOL = ['forced_march', 'long_hook', 'split_march', 'dash', 'flank_claim', 'volley', 'warband_reinforcements'];
  const DECK_POOL = BASE_POOL.concat(ADVANCED_POOL);
  // absolute directions for logs / labels: 0 N, 1 NE, 2 SE, 3 S, 4 SW, 5 NW
  const DIR_RU = ['вверх', 'вверх-вправо', 'вниз-вправо', 'вниз', 'вниз-влево', 'вверх-влево'];
  const AXIS_RU = ['вертикаль', 'диагональ ↗', 'диагональ ↘'];

  const POIS = {
    village:    { id: 'village', name: 'Village', ru: 'Деревня', card: 'recruitment', text: 'Даёт карту «Вербовка» (+6 миньонов).' },
    watchtower: { id: 'watchtower', name: 'Watchtower', ru: 'Башня', card: 'cordon', text: 'Даёт карту «Оцепление» (захват всех гексов вокруг отряда).' },
    mine:       { id: 'mine', name: 'Mine', ru: 'Шахта', card: 'explosive_charge', text: 'Даёт карту «Взрывной заряд» (4 урона + блок гекса).' },
    shrine:     { id: 'shrine', name: 'Shrine', ru: 'Святилище', card: 'prayer', text: 'Даёт карту «Молитва» (верхняя карта сброса в руку).' },
    workshop:   { id: 'workshop', name: 'Workshop', ru: 'Мастерская', card: 'catapult', text: 'Даёт карту «Катапульта» (3 урона на расстоянии до 3).' },
    scout_camp: { id: 'scout_camp', name: 'Scout Camp', ru: 'Лагерь', card: 'scout_draw', text: 'Даёт карту «Разведка» (добор до полной руки).' },
    war_banner: { id: 'war_banner', name: 'War Banner', ru: 'Знамя войны', card: 'banner', text: 'Даёт карту «Знамя» (+1 очко гексам вокруг отряда).' },
    portal:     { id: 'portal', name: 'Mystic Gate', ru: 'Портал', card: 'blink', text: 'Даёт карту «Прыжок» (прыжок через гекс).' },
  };
  const POI_POOL = Object.keys(POIS);

  const PRESETS = {
    balanced:  { name: 'Balanced Starter', ru: 'Сбалансированная', cards: ['advance', 'double_advance', 'hook', 'zigzag', 'around', 'rally', 'battle_cry', 'reinforced_formation'], pois: ['village', 'watchtower', 'shrine'] },
    expansion: { name: 'Expansion', ru: 'Экспансия', cards: ['advance', 'double_advance', 'hook', 'zigzag', 'around', 'split_march', 'forced_march', 'dash'], pois: ['war_banner', 'scout_camp', 'portal'] },
    duel:      { name: 'Duel', ru: 'Дуэль', cards: ['advance', 'double_advance', 'hook', 'volley', 'battle_cry', 'reinforced_formation', 'rally', 'warband_reinforcements'], pois: ['shrine', 'mine', 'workshop'] },
    swarm:     { name: 'Swarm', ru: 'Орда', cards: ['advance', 'double_advance', 'hook', 'around', 'rally', 'warband_reinforcements', 'battle_cry', 'flank_claim'], pois: ['village', 'shrine', 'war_banner'] },
  };

  HB.cards = { CARDS, BASE_POOL, ADVANCED_POOL, DECK_POOL, POIS, POI_POOL, PRESETS, DIR_RU, AXIS_RU };
})();
