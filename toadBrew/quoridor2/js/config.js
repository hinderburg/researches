// TOADBREW — Relay Alchemy 2 (ветка Quoridor2). Все числа здесь; переопределение без правки кода: ?t={"jumpR":420}
// Ссылки §N — на docs/GDD.md, D-xxx — на docs/DECISIONS.md.
var FB = window.FB || {};
window.FB = FB;

FB.VERSION = '6.2.0';

// Мир: координаты = пиксели макета арены × K (art/src/arena.webp, 941×1672)
FB.K = 1.6;
function A(x, y) { return { x: x * FB.K, y: y * FB.K }; }
FB.A = A;

FB.T = {
  IMG_W: 941, IMG_H: 1672,
  wallH: 340,                  // высота стен на экране — выше любой видимой дуги
  visH: 2.5,                   // дуга на экране выше симуляционной в 2.5 раза: прыжок читается сверху (D-062)
  arcBase: 20, arcPerLen: 0.09,        // высота дуги: base + длина × perLen (полный прыжок 400 → 56)

  // Сетка (§4, D-112): 6 × 14 клеток по 128; базы — две крайние линии каждой стороны
  cols: 6, rows: 14, cell: 128, baseRows: 2,
  flaskR: 110,                 // Base Flask: финальное приземление ближе flaskR + r/2 к центру фляги врага — победа (§3, D-119)
  overloadTurn: 24, overloadGrow: 30, overloadMax: 260, // перегрузка фляг (D-149): с 24-го хода (12-го своего) зона победы растёт на 30 за ход, до +260

  // Прыжок (§7, D-113): дальность у всех жаб одна — 400 (≈3 клетки)
  jumpR: 400, minPull: 0.1,
  wallBonus: 0.1, maxBounces: 2,       // отскок от стены: остаток дальности +10%, не больше 2 отскоков
  perchH: 14,                          // высота спины союзника: с неё стартует прыжок эстафеты (и пролетает над колоннами, D-145)
  colVisH: 200,                        // высота кристальной колонны на экране; прыжок со спины над ней поднимается выше (D-155)
  relayAuto: 0.25,                     // не прыгнула со спины до конца хода — автоотскок 25% дальности по ходу (D-110)

  // Эликсир (§12–§17, D-141, D-142)
  tank: 3,                             // бак — топливо прыжка: пустой — жаба стоит (D-153)
  homeFill: 1,                         // «⟲ Домой»: дома бак сразу наливается на столько — можно прыгать в тот же ход (D-153)
  secondBonus: 0,                      // второй ходящий: в свой первый ход база наливает на столько больше (D-152)
  seqLen: 96,                          // последовательность элементов: мешки (каждые 4 подряд — все элементы)

  // Матч (§28)
  turnCap: 120,                        // страховка: 60 ходов на сторону; дальше — победа того, кто ближе к чужой фляге
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

  // Реакции = сумма глаголов (§36, D-143)
  plasmaDmg: 39, plasmaKnock: 80,      // 🔥+⚡ Plasma Burst: урон по 3×3 и отброс
  wildDmg: 26, blazeDmg: 14,           // 🔥+☠ Wildfire: урон по кресту, рельеф выжжен, остаётся горящее поле (жжёт врага, кто встал или начал в нём ход)
  iceBlastDmg: 24, freezeR: 340,       // 🔥+❄ Ice Blast: урон по 3×3, ближайший враг закован в лёд — пропускает свой ход
  vortexR: 340,                        // ⚡+☠ Toxic Vortex: стягивает врагов в этом радиусе к центру
  jetLen: 256, jetChain: 3,            // ⚡+❄ Ice Slide: горка бросает жабу на 2 клетки по стрелке стороны-создателя, до 3 горок подряд
  ampMul: 1.5,                         // перк Bellows Toad: реакция ×1.5 и шире

  // Перки жаб — когда от жабы отскакивают (D-144)
  catapultMul: 1.4,                    // Springjack: следующий прыжок ×1.4
  spurPerkMul: 1.4,                    // Spur Knight: удар в конце цепочки ×1.4 и задевает соседей
  breachR: 160, breachMul: 0.3, breachKnock: 110, // …соседям цели 30% урона и отброс
  anchorRecoil: 210,                   // Clingfoot: не сдвинуть до конца хода врага; напавшая отлетает сама

  // Бот
  botAimNoiseDeg: 2, botAimNoisePow: 0.03, botTopPick: 3, botDepthTop: 6,
  botAdv: 1.4, botDef: 0.8,            // вес своего продвижения и чужого отставания в оценке позиции
  botChargeV: 7, botFullTank: 0, botNear: 35, // оценка бота: цена заряда, штраф за полный бак на базе, бонус жабе со своими в досягаемости — строй для эстафет (D-151)
  botRecallGain: 30, botRecallEvery: 4,  // отзыв бота: когда позиция после него заметно лучше и не чаще раза в 4 своих хода (D-121)
  botDelay: 0.3, botAimShow: 0.55,     // паузы бота: перед ходом и показ прицела, с (темп, D-149)
  firstBotNoise: 2,                    // в первом матче (с подсказками) бот мажет вдвое сильнее (D-154)
  animSpeed: 1
};

// ?t={json}
(function () {
  try {
    var m = /[?&]t=([^&]+)/.exec(location.search);
    if (m) { var o = JSON.parse(decodeURIComponent(m[1])); for (var k in o) FB.T[k] = o[k]; console.log('[FB] tuning override', o); }
  } catch (e) { console.warn('[FB] bad ?t=', e); }
})();

// Элементы. У каждого один глагол (D-143) — реакция складывается из глаголов двух элементов
FB.ELEMENTS = {
  fire:      { name: 'FIRE',      icon: '🔥', color: '#ff5a00', glow: '255,110,0', hue: 20,  light: 0,    verb: 'DAMAGE', vi: '💥' },
  ice:       { name: 'ICE',       icon: '❄',  color: '#12c8ff', glow: '20,200,255', hue: 195, light: 0.06, verb: 'STOP',   vi: '🧊' },
  poison:    { name: 'POISON',    icon: '☠',  color: '#78ff14', glow: '120,255,20', hue: 98, light: 0,    verb: 'ZONE',   vi: '☣' },
  lightning: { name: 'LIGHTNING', icon: '⚡', color: '#ffe100', glow: '255,225,0', hue: 52,  light: 0.05, verb: 'PUSH',   vi: '➜' }
};
FB.ELEMENT_ORDER = ['fire', 'ice', 'poison', 'lightning'];

// Шесть реакций (§36, D-143): каждая = сумма двух глаголов
FB.REACTIONS = {
  'fire+lightning':  { name: 'PLASMA BURST',   terrain: null,     desc: 'Damage + push: blast on the 3×3 cells around.' },
  'fire+poison':     { name: 'WILDFIRE',       terrain: 'blaze',  desc: 'Damage + zone: burns enemies and terrain around, leaves a burning field.' },
  'fire+ice':        { name: 'ICE BLAST',      terrain: null,     desc: 'Damage + stop: hits the 3×3 cells around, the nearest enemy is frozen for a turn.' },
  'ice+poison':      { name: 'CRYSTAL COLUMN', terrain: 'column', desc: 'Stop + zone: a crystal wall. Only a jump off an ally’s back gets over it.' },
  'lightning+poison':{ name: 'TOXIC VORTEX',   terrain: null,     desc: 'Push + zone: pulls the enemies around into a knot.' },
  'ice+lightning':   { name: 'ICE SLIDE',      terrain: 'jet',    desc: 'Push + stop: ice slides throw your frogs 2 cells forward and enemies back.' }
};
FB.reactionVerbs = function (key) { return key.split('+').map(function (e) { return FB.ELEMENTS[e].vi; }).join(' + '); };
FB.TERRAIN = { // как выглядит и что значит клетка рельефа
  jet:    { name: 'ICE SLIDE', icon: '⇧', color: '#a8e8ff', tip: 'Ice slide: throws a frog 2 cells along the arrows. Yours forward, enemies back.' },
  column: { name: 'COLUMN',    icon: '▮', color: '#5cffb0', tip: 'Crystal wall: blocks jumps and knockback. A jump off an ally’s back flies over it.' },
  blaze:  { name: 'WILDFIRE',  icon: '🔥', color: '#ff7a2a', tip: 'Burning field: burns an enemy who lands here or starts a turn here.' }
};
FB.reactionKey = function (a, b) { return a < b ? a + '+' + b : b + '+' + a; };

// Четыре жабы (§6, §7, §30). Дальность прыжка у всех одна (jumpR); отличие — HP, Defense, сила удара, масса и перк.
// Перк (D-144) — что получает жаба, которая отскочила от этой (как Friendship Combo в Monster Strike)
FB.FROGS = {
  spring:  { name: 'Springjack',   hp: 115, def: 8,  impact: 1.05, mass: 1.0, r: 34, role: 'Momentum', tdesc: 'Light and springy: the best relay runner.',
             perk: { icon: '🏹', name: 'CATAPULT', desc: 'Bounce off it: the next jump is 40% longer.' } },
  cling:   { name: 'Clingfoot',    hp: 125, def: 10, impact: 0.9,  mass: 1.35, r: 36, role: 'Anchor',  tdesc: 'Hard to move: a stable relay point.',
             perk: { icon: '⚓', name: 'ANCHOR', desc: 'Bounce off it: it can’t be pushed until the enemy turn ends — attackers bounce off.' } },
  bellows: { name: 'Bellows Toad', hp: 120, def: 12, impact: 0.9,  mass: 1.5, r: 40, role: 'Alchemy',  tdesc: 'Reagent pumps: bigger reactions.',
             perk: { icon: '🌀', name: 'AMPLIFY', desc: 'Bounce off it: the reaction at the end is 1.5× stronger and wider.' } },
  spur:    { name: 'Spur Knight',  hp: 110, def: 14, impact: 1.3,  mass: 1.6, r: 38, role: 'Impact',   tdesc: 'Heavy spurs: the hardest hit.',
             perk: { icon: '☄️', name: 'POWER', desc: 'Bounce off it: your hit at the end lands 1.4× harder and strikes enemies next to the target.' } }
};
FB.FROG_ORDER = ['spring', 'cling', 'bellows', 'spur'];

// Подсказки первого матча (D-154, D-155): всего четыре — цель, прыжок, топливо, эстафета; всплывают по ситуации на поле
FB.TIPS = {
  goal:  { icon: '⚗️', title: 'GOAL', text: 'Land any frog on the <b>enemy flask</b> at the far end — and you win. Don’t let the enemy reach yours.' },
  jump:  { icon: '🎯', title: 'JUMP', text: 'Drag back from a frog and release. The dotted arc shows where it lands and what happens there.' },
  empty: { icon: '🪫', title: 'ELIXIR IS FUEL', text: 'Every jump burns 1 elixir ●●○. Out of elixir a frog can’t jump — <b>tap its card</b>: it flies home and refuels at once.' },
  relay: { icon: '↗️', title: 'RELAY', text: 'Land on <b>your own frog</b> — and jump again in the same turn. From its back you even fly over walls.' }
};
FB.TIP_CORE = ['goal', 'jump', 'empty', 'relay'];

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
