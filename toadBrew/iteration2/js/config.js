// TOADBREW — итерация 2 (GDD v2). Все числа здесь; переопределение без правки кода: ?t={"kbBase":90}
// Ссылки §N — на docs/GDD.md, D-xxx — на docs/DECISIONS.md.
var FB = window.FB || {};
window.FB = FB;

FB.VERSION = '2.9.0';

// Мир: координаты = пиксели макета арены × K (art/src/arena.webp, 941×1672)
FB.K = 1.6;
function A(x, y) { return { x: x * FB.K, y: y * FB.K }; }
FB.A = A;

FB.T = {
  IMG_W: 941, IMG_H: 1672,
  U: 109,                      // единица дальности: Jump 7.0 = 763 мира (+30% D-067, ещё +40% D-074)
  wallH: 340,                  // высота стен на экране — выше любой видимой дуги, видно в перспективе (D-051, D-062)
  visH: 2.5,                   // дуга на экране выше симуляционной в 2.5 раза: прыжок читается сверху (D-062)
  obstH: 60,                   // колонна и Toxic Crystal: блокируют дугу ниже этой высоты (§16, §23) — почти любую, кроме пика длинного прыжка (D-052)
  arcBase: 20, arcPerLen: 0.09,        // высота дуги: 420 → 70, ниже стен

  // Матч (§32, §33)
  roundCap: 15,
  turnTimeSec: 15,
  tipSec: 5,                           // совет перед матчем (D-088)
  minPull: 0.1,

  // Урон и физика (§10)
  impactBase: 14, impactSpeed: 10,     // физический урон прямого попадания: base + speed × доля дальности
  kbBase: 75, kbMin: 18, kbMax: 190, kbSpeedMin: 0.6,
  slamDamage: 8,                       // удар о стену/колонну/кристалл после отброса
  contactAssist: 14,                   // запас попадания в жабу (D-084)
  wallBonus: 0.1, wlzBonus: 0.3,       // прибавка остатка дальности после отскока от стены / Wall Launch Zone (§21)
  maxBounces: 2,

  // Элементы (§9), Tier I; Tier n: × (1 + tierStep × (n-1)) (§5.2)
  tierStep: 0.2,
  elemR: 109, elemSplash: 0.6,          // элемент на поверхности задевает врагов в радиусе, не прямую цель — × elemSplash
  fireDmg: 12,
  iceDmg: 4, chillMul: 0.75,
  poisonDmg: 3, poisonTick: 6, poisonTicks: 2,
  lightDmg: 7, lightArc: 6, lightArcR: 308,

  // Реакции (§12–§18)
  veilR: 273, veilTurns: 4, veilBounceMin: 81, veilSight: 150,     // радиусы и размеры эффектов +30% (D-067), ещё +40% (D-074)
  detR: 263, detDamage: 28, detKnock: 85,
  orbRange: 1729, orbR: 16, orbDamage: 26, orbKnock: 55,
  crystalLen: 245, crystalThick: 36, crystalTurns: 4,
  shellMul: 0.4, shellKnockR: 210, shellKnock: 70,
  neuroR: 200, neuroTick: 9, neuroJumps: 2,
  sameChargeMul: 1.6,                  // заряд из двух одинаковых элементов — усиленный базовый эффект
  surgeR: 200, surgePhys: 10, surgeKnock: 40, // ВСПЛЕСК: лужа своего цвета — физ. 10 + полный элемент всем в радиусе 200, отброс 40 (D-089)

  // Лужи и Drain Nodes (§11, §25–§28)
  puddleR: 116, nodeR: 34,             // лужи вдвое больше (D-075)
  reservoirMul: 1.5,                   // Reservoir Control (§7)

  // Командные свойства (§7)
  divingPerUnit: 1 / 1400, divingMax: 2.0,  // Diving Strike: impact × (1 + путь в воздухе / 1400), не больше ×2; полный прыжок ≈ ×1.5, ×2 — с отскоками (D-082)
  catapultRangeMul: 0.8,                    // Living Catapult: доп. прыжок от союзника дальше — до 80% (D-077)
  // Отскок от союзника (D-077, D-080, D-083): сидит на спине, окно на прыжок в любую сторону до allyHopMax, без ввода — автоотскок allyHopMul
  allyWindow: 2.8, allyHopMax: 0.5, allyHopMul: 0.25, // окно 2.8 с, прицел в любую сторону (D-080)
  allyGap: 18, allyShove: 55, perchH: 14,    // perchH — высота спины союзника, с которой стартует доп. прыжок (D-083)
  pinnedSlamMul: 3, pinnedBonus: 10,        // Pinned Target
  gripWindow: 0.8, gripRangeMul: 1.25, gripImpactMul: 1.2, // Reactive Grip (§22): ×1.2 за каждый отскок (D-082, D-086)

  // Бот
  botAimNoiseDeg: 2.5, botAimNoisePow: 0.04, botTopPick: 3, botDepthTop: 5,
  animSpeed: 1
};

FB.ELEMENTS = {
  fire:      { name: 'FIRE',      icon: '🔥', color: '#ff5a00', glow: '255,110,0', hue: 20,  light: 0 },
  ice:       { name: 'ICE',       icon: '❄',  color: '#12c8ff', glow: '20,200,255', hue: 195, light: 0.06 },
  poison:    { name: 'POISON',    icon: '☠',  color: '#78ff14', glow: '120,255,20', hue: 98, light: 0 },
  lightning: { name: 'LIGHTNING', icon: '⚡', color: '#ffe100', glow: '255,225,0', hue: 52,  light: 0.05 }
};
FB.ELEMENT_ORDER = ['fire', 'ice', 'poison', 'lightning'];

FB.REACTIONS = {
  'fire+ice':        { name: 'STEAM VEIL',       type: 'Conceal / reposition', desc: 'A steam cloud hides your frogs; the frog bounces to a hidden spot inside.' },
  'fire+poison':     { name: 'TOXIC DETONATION', type: 'AoE damage',           desc: 'Big explosion: heavy damage and knockback around.' },
  'fire+lightning':  { name: 'PLASMA ORB',       type: 'Projectile',           desc: 'Fires an orb forward along the landing direction; bounces off one wall.' },
  'ice+poison':      { name: 'TOXIC CRYSTAL',    type: 'Terraform',            desc: 'A crystal wall rises in front: blocks low jumps, a new surface to bounce off.' },
  'ice+lightning':   { name: 'STATIC SHELL',     type: 'Defense',              desc: 'Shield until your next activation: the first hit is cut and blasts attackers away.' },
  'lightning+poison':{ name: 'NEUROSHOCK',       type: 'DoT on jumps',         desc: 'Enemies nearby take damage on each of their next two jumps.' }
};
FB.reactionKey = function (a, b) { return a < b ? a + '+' + b : b + '+' + a; };

// Четыре стартовые жабы (§6). jump — в единицах U. mass — для отброса. r — радиус в мире.
// HP подняты по автоплею для ровного винрейта пар (D-090): было 100 / 110 / 120 / 130
FB.FROGS = {
  spring:  { name: 'Springjack',   hp: 155, def: 8,  jump: 7.0, mass: 1.0, r: 34, trait: 'Spring Resonator', tdesc: 'Can store and pass on momentum.' },
  cling:   { name: 'Clingfoot',    hp: 160, def: 10, jump: 6.2, mass: 1.2, r: 36, trait: 'Adhesive Pads',    tdesc: 'Can hold a contact, a surface or a target.' },
  bellows: { name: 'Bellows Toad', hp: 128, def: 12, jump: 5.6, mass: 1.5, r: 40, trait: 'Alchemical Glands', tdesc: 'Can carry and spread reagents.' },
  spur:    { name: 'Spur Knight',  hp: 130, def: 14, jump: 5.0, mass: 1.6, r: 38, trait: 'Impact Spurs',     tdesc: 'Turns motion and contact into a stronger physical hit.' }
};
FB.FROG_ORDER = ['spring', 'cling', 'bellows', 'spur'];

// Командные свойства пар (§7)
FB.TEAM_TRAITS = {
  'spring+spur':   { id: 'diving', icon: '☄️',    name: 'DIVING STRIKE',       arche: 'Rushdown',           desc: 'The longer the flight (wall bounces count), the harder the direct hit.', tip: 'Go long. Bounce off walls before the hit: the longer the flight, the harder the direct hit lands. Line up direct hits from far away.' },
  'bellows+spring':{ id: 'momentum', icon: '🌀',  name: 'ALCHEMICAL MOMENTUM', arche: 'Element combo',      desc: 'Use a puddle with one frog — the other gets a Reaction Charge with that element.', tip: 'Play the puddles. Use a puddle with one frog to hand the other a Reaction Charge, then fire it. Plan which element goes first.' },
  'cling+spring':  { id: 'catapult', icon: '🏹',  name: 'LIVING CATAPULT',     arche: 'Route building',     desc: 'Your bounce off an ally reaches up to 80% of a jump instead of 50%.', tip: 'Your partner is a springboard. Land on your ally for a charge and a long bounce, and route your jumps through each other.' },
  'bellows+cling': { id: 'reservoir', icon: '⛲', name: 'RESERVOIR CONTROL',   arche: 'Zone control',       desc: 'Puddles you prepare through Drain Nodes spawn 50% larger.', tip: 'Control the pipes. Land on the grates to choose next round’s puddles: yours spawn 50% larger. Own-color puddles SURGE.' },
  'cling+spur':    { id: 'pinned', icon: '📌',    name: 'PINNED TARGET',       arche: 'Billiards',          desc: 'One frog marks a target; the other smashes it into a wall or the column for big damage.', tip: 'Billiards. Mark a target with one frog, then smash it into the column or a wall with the other. Watch the knockback arrows.' },
  'bellows+spur':  { id: 'grip', icon: '🪝',      name: 'REACTIVE GRIP',       arche: 'Trick shot',         desc: 'Hit a Wall Launch Zone to cling on and fire a second, stronger jump.', tip: 'Wall tricks. Cling to the glowing zones on the flanks for a stronger second jump. Every bounce adds x1.2 to the hit.' }
};
FB.traitFor = function (a, b) { return FB.TEAM_TRAITS[FB.reactionKey(a, b)] || null; };

// Арена — по макету (§3, §21–§25). Многоугольник пола, колонна, ниши, решётки, трубы, Wall Launch Zones.
FB.ARENA = {
  // точечная симметрия: (x, y) ↔ (946 − x, 1620 − y) в пикселях макета (D-050)
  floor: [A(232, 205), A(250, 190), A(290, 190), A(290, 55), A(392, 55), A(392, 190), A(554, 190), A(554, 55), A(656, 55), A(656, 190),
    A(696, 190), A(714, 205), A(714, 1415), A(696, 1430), A(656, 1430), A(656, 1565), A(554, 1565), A(554, 1430), A(392, 1430), A(392, 1565),
    A(290, 1565), A(290, 1430), A(250, 1430), A(232, 1415)],
  // колонна на 25% меньше нарисованной на макете (D-086): columnArt — где она на картинке, column — её мир
  columnArt: { x0: 362, y0: 665, x1: 584, y1: 955 },
  column: { x0: 389.75 * FB.K, y0: 701.25 * FB.K, x1: 556.25 * FB.K, y1: 918.75 * FB.K },
  // постоянные лужи в нишах (бассейны макета)
  puddles: [{ p: A(341, 100), el: 'poison' }, { p: A(605, 100), el: 'fire' }, { p: A(341, 1520), el: 'fire' }, { p: A(605, 1520), el: 'poison' }],
  // решётки под красными трубами → точки появления луж (§25–§27)
  // pipe — устье красной трубы над решёткой: отсюда в начале раунда льётся реагент (D-068)
  nodes: [{ p: A(262, 465), spawn: A(372, 515), pipe: A(268, 428) }, { p: A(684, 465), spawn: A(574, 515), pipe: A(678, 428) },
    { p: A(262, 1155), spawn: A(372, 1105), pipe: A(266, 1122) }, { p: A(684, 1155), spawn: A(574, 1105), pipe: A(680, 1122) }],
  // Wall Launch Zones на боковых стенах (§21)
  // по одной на боковую стену, по центру карты (автор, D-075)
  wlz: [{ side: 'L', y0: 600 * FB.K, y1: 1020 * FB.K }, { side: 'R', y0: 600 * FB.K, y1: 1020 * FB.K }], // во всю длину колонны — в узкую было не попасть (D-078)
  starts: [[A(380, 1320), A(566, 1320)], [A(566, 300), A(380, 300)]]
};

// ?t={json}
(function () {
  try {
    var m = /[?&]t=([^&]+)/.exec(location.search);
    if (m) { var o = JSON.parse(decodeURIComponent(m[1])); for (var k in o) FB.T[k] = o[k]; console.log('[FB] tuning override', o); }
  } catch (e) { console.warn('[FB] bad ?t=', e); }
})();
