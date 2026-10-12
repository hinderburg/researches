// TOADBREW — Relay Alchemy (ветка Quoridor, GDD v3). Все числа здесь; переопределение без правки кода: ?t={"jumpR":420}
// Ссылки §N — на docs/GDD.md, D-xxx — на docs/DECISIONS.md.
var FB = window.FB || {};
window.FB = FB;

FB.VERSION = '5.7.0';

// Мир: координаты = пиксели макета арены × K (art/src/arena.webp, 941×1672)
FB.K = 1.6;
function A(x, y) { return { x: x * FB.K, y: y * FB.K }; }
FB.A = A;

FB.T = {
  IMG_W: 941, IMG_H: 1672,
  wallH: 340,                  // высота стен на экране — выше любой видимой дуги
  visH: 2.5,                   // дуга на экране выше симуляционной в 2.5 раза: прыжок читается сверху (D-062)
  arcBase: 20, arcPerLen: 0.09,        // высота дуги: base + длина × perLen (полный прыжок 400 → 56)
  colH: 40,                    // Crystal Column блокирует дугу ниже этой высоты: короткий прыжок и края длинного (§21, D-114)

  // Сетка (§4, D-112): 6 × 14 клеток по 128; базы — две крайние линии каждой стороны
  cols: 6, rows: 14, cell: 128, baseRows: 2,
  flaskR: 110,                 // Base Flask: финальное приземление ближе flaskR + r/2 к центру фляги врага — победа (§3, D-119)

  // Прыжок (§7, D-113): дальность у всех жаб одна — 400 (≈3 клетки); один полный бак (3 прыжка) не доводит до чужой фляги
  jumpR: 400, minPull: 0.1,
  wallBonus: 0.1, maxBounces: 2,       // отскок от стены: остаток дальности +10%, не больше 2 отскоков
  perchH: 14,                          // высота спины союзника: с неё стартует прыжок эстафеты
  relayAuto: 0.25,                     // не прыгнула со спины до конца хода — автоотскок 25% дальности по ходу (D-110)

  // Эликсир (§12–§17, D-115)
  tank: 3, startCharges: 1, emptyReturn: 2, recallsPerTurn: 1,
  seqLen: 96,                          // общая последовательность элементов: мешки по 4 (каждые 4 подряд — все элементы)

  // Матч (§28)
  turnCap: 120,                        // 60 ходов на сторону; дальше — победа того, кто ближе к чужой фляге
  turnTimeSec: 20,
  tipSec: 8,
  simplify: 1, simplifyFrogR: 6, simplifyArenaR: 6, simplifyLevels: 4, simplifyLineL: 0.17, // упрощённый визуал (D-106)

  // Урон и физика (§10)
  impactBase: 34, impactSpeed: 23,     // удар сверху: base + speed × доля дальности, × impact жабы, − Defense
  kbBase: 190, kbMin: 60, kbMax: 380, kbSpeedMin: 0.6,
  slamDamage: 10,                      // отброс в стену / колонну
  contactAssist: 14,
  hitAnimSec: 0.6,                     // анимация отброса (D-108)
  ambient: 1,                          // живые клетки и фляги: частицы над поверхностями (D-129); ?t={"ambient":0} — выключить

  // Реакции на сетке (§36, D-116)
  plasmaDmg: 39, plasmaKnock: 80,                  // Plasma Burst: 3×3 клетки — урон врагам и лёгкий отброс
  detR: 300, detKnock: 300,                        // Detonation: без урона — сильный разброс врагов вокруг и очистка 3×3 (D-124)
  vortexR: 340, vortexDmg: 0,                      // Toxic Vortex: стягивает врагов в этом радиусе к центру (D-126)
  freezeR: 340, chillMul: 0.55,                    // Frost Ward: ближайший враг в радиусе — во льду на свой ход; приземлился в мороз — следующая активация ×0.55 дальности (D-125)
  jetLen: 256, jetChain: 3,                        // Steam Jet: приземление на струю подбрасывает жабу на 2 клетки по стрелке стороны-создателя, до 3 струй подряд (D-123)
  ampMul: 1.5,                                     // Alchemical Relay: реакция сильнее и шире

  // Командные свойства (§29, D-117)
  catapultMul: 1.4,                    // Living Catapult: прыжок со спины напарника по паре — дальность ×1.4 (D-134)
  breachWipe: 0,                       // Breach: стирать чужой рельеф при приземлении — выключено (D-128)
  breachR: 160, breachMul: 0.3, breachKnock: 110, // Breach: удар задевает врагов рядом с целью — половина урона и отброс (D-134)
  anchorRecoil: 210,                   // Anchor: напавшая на связанную жабу отлетает сама (D-134)
  momentumPerRelay: 0.35,              // Momentum Strike: удар ×(1 + 0.35 × эстафеты)
  momentumKb: 1.4,
  anchorR: 400,                        // Anchor: Clingfoot и Spur Knight не отбрасываются, пока напарник в радиусе прыжка

  // Бот
  botAimNoiseDeg: 2, botAimNoisePow: 0.03, botTopPick: 3, botDepthTop: 6,
  botAdv: 1.4, botDef: 0.8,            // вес своего продвижения и чужого отставания в оценке позиции
  botRecallGain: 30, botRecallEvery: 4,  // отзыв бота: когда позиция после него заметно лучше и не чаще раза в 4 своих хода (D-121)
  animSpeed: 1
};

// ?t={json}
(function () {
  try {
    var m = /[?&]t=([^&]+)/.exec(location.search);
    if (m) { var o = JSON.parse(decodeURIComponent(m[1])); for (var k in o) FB.T[k] = o[k]; console.log('[FB] tuning override', o); }
  } catch (e) { console.warn('[FB] bad ?t=', e); }
})();


FB.ELEMENTS = {
  fire:      { name: 'FIRE',      icon: '🔥', color: '#ff5a00', glow: '255,110,0', hue: 20,  light: 0 },
  ice:       { name: 'ICE',       icon: '❄',  color: '#12c8ff', glow: '20,200,255', hue: 195, light: 0.06 },
  poison:    { name: 'POISON',    icon: '☠',  color: '#78ff14', glow: '120,255,20', hue: 98, light: 0 },
  lightning: { name: 'LIGHTNING', icon: '⚡', color: '#ffe100', glow: '255,225,0', hue: 52,  light: 0.05 }
};
FB.ELEMENT_ORDER = ['fire', 'ice', 'poison', 'lightning'];

// Шесть реакций на сетке (§36, D-116): категории GDD — мгновенный урон, отброс, опасная клетка, сокрытие, рельеф, контроль
FB.REACTIONS = {
  'fire+lightning':  { name: 'PLASMA BURST',   type: 'Instant damage',      terrain: null,     desc: 'Blast on the 3×3 cells around: damage to enemies and a light knockback.' },
  'fire+poison':     { name: 'DETONATION',     type: 'Push · cleanse',      terrain: null,     desc: 'No damage: a shockwave throws enemies around far away and wipes all cells around back to neutral — columns too.' },
  'lightning+poison':{ name: 'TOXIC VORTEX',   type: 'Pull',                terrain: null,     desc: 'A toxic whirl pulls the enemies around into a tight knot by the landing cell.' },
  'fire+ice':        { name: 'STEAM JET',      type: 'Movement · persistent',terrain: 'jet',    desc: 'A plus of steam jets pointing at the enemy flask. Land on one and it launches you 2 cells forward; enemies are blown back toward their base.' },
  'ice+poison':      { name: 'CRYSTAL COLUMN', type: 'Terrain · persistent',terrain: 'column', desc: 'A crystal pillar rises in the cell: blocks short and low jumps and knockback.' },
  'ice+lightning':   { name: 'FROST WARD',     type: 'Slow · freeze',       terrain: 'frost',  desc: 'Freezes the nearest enemy in ice — it skips its next turn — and lays a line of 3 frost cells across your jump: an enemy landing in it jumps short next time.' },
};
FB.TERRAIN = { // как выглядит и что значит клетка рельефа
  jet:    { name: 'JET',    icon: '⇧', color: '#ffd9a0' },
  column: { name: 'COLUMN', icon: '▮', color: '#5cffb0' },
  frost:  { name: 'FROST',  icon: '❄', color: '#bfefff' }
};
FB.reactionKey = function (a, b) { return a < b ? a + '+' + b : b + '+' + a; };

// Четыре жабы (§6, §7, §30). Дальность прыжка у всех одна (jumpR); отличие — HP, Defense, сила удара, масса.
FB.FROGS = {
  spring:  { name: 'Springjack',   hp: 115, def: 8,  impact: 1.05, mass: 1.0, r: 34, role: 'Momentum',      tdesc: 'Light and springy: the best relay runner.' },
  cling:   { name: 'Clingfoot',    hp: 125, def: 10, impact: 0.9,  mass: 1.35, r: 36, role: 'Anchor',       tdesc: 'Hard to move: a stable relay point.' },
  bellows: { name: 'Bellows Toad', hp: 120, def: 12, impact: 0.9,  mass: 1.5, r: 40, role: 'Alchemy',       tdesc: 'Reagent pumps: terrain and reaction support.' },
  spur:    { name: 'Spur Knight',  hp: 110, def: 14, impact: 1.3,  mass: 1.6, r: 38, role: 'Impact',        tdesc: 'Heavy spurs: the hardest hit, breaks formations.' }
};
FB.FROG_ORDER = ['spring', 'cling', 'bellows', 'spur'];

// Свойства пар (§29, D-117). В команде из трёх жаб — три пары, все три свойства действуют.
// «relay» — срабатывает, если в эстафете этой активации был прыжок с одной жабы пары на другую.
FB.TEAM_TRAITS = {
  'cling+spring':  { id: 'catapult', icon: '🏹', name: 'LIVING CATAPULT',   when: 'relay',  desc: 'Relay off the partner: the next jump is 40% longer.' },
  'bellows+spring':{ id: 'alchemy',  icon: '🌀', name: 'ALCHEMICAL RELAY',  when: 'relay',  desc: 'Relay off the partner: the reaction is 1.5× stronger and wider.' },
  'spring+spur':   { id: 'momentum', icon: '☄️', name: 'MOMENTUM STRIKE',   when: 'relay',  desc: 'Relay off the partner: your hit lands harder per relay.' },
  'bellows+cling': { id: 'territory',icon: '⛲', name: 'TERRITORY',         when: 'relay',  desc: 'Relay off the partner: the landing paints 4 more cells.' },
  'cling+spur':    { id: 'anchor',   icon: '⚓', name: 'ANCHOR',            when: 'always', desc: 'Chained when close: can’t be pushed, attackers bounce off.' },
  'bellows+spur':  { id: 'breach',   icon: '⛏', name: 'BREACH',            when: 'always', desc: 'Hits also strike enemies next to the target.' }
};
FB.traitFor = function (a, b) { return FB.TEAM_TRAITS[FB.reactionKey(a, b)] || null; };
FB.teamTraits = function (team) { // три пары команды → id свойств
  var out = [];
  for (var i = 0; i < team.length; i++) for (var j = i + 1; j < team.length; j++) { var t = FB.traitFor(team[i], team[j]); if (t && out.indexOf(t.id) < 0) out.push(t.id); }
  return out;
};
FB.traitById = function (id) { for (var k in FB.TEAM_TRAITS) if (FB.TEAM_TRAITS[k].id === id) return FB.TEAM_TRAITS[k]; return null; };

// Арена (§4, D-112): прямоугольное поле 6 × 14 клеток поверх пола макета; две базы с флягами на торцах.
(function () {
  var T = FB.T, x0 = 233 * FB.K, y0 = 1296 - T.rows * T.cell / 2, c = T.cell, W = T.cols * c, L = T.rows * c;
  function P(cx, cy) { return { x: x0 + cx * c, y: y0 + cy * c }; }
  FB.ARENA = {
    x0: x0, y0: y0, w: W, h: L,
    floor: [{ x: x0, y: y0 }, { x: x0 + W, y: y0 }, { x: x0 + W, y: y0 + L }, { x: x0, y: y0 + L }],
    // Фляга стороны 0 — внизу по центру задней линии, стороны 1 — вверху (точечная симметрия)
    flasks: [P(T.cols / 2, T.rows - 0.55), P(T.cols / 2, 0.55)],
    // места на базе: три жабы у фляги
    slots: [[P(0.95, T.rows - 1.5), P(5.05, T.rows - 1.5), P(3, T.rows - 1.95)], [P(5.05, 1.5), P(0.95, 1.5), P(3, 1.95)]],
    columnArt: { x0: 362, y0: 665, x1: 584, y1: 955 }   // где на картинке нарисована старая колонна — закрываем полом
  };
})();
