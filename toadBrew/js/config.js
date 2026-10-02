// Тюнинг и данные. Все числа — здесь; переопределение без правки кода: ?t={"jumpDamageWater":1.5}
// Ссылки §N — на docs/GDD.md, D-xxx — на docs/DECISIONS.md.
var FB = window.FB || {};
window.FB = FB;

FB.VERSION = '0.5.0';

FB.T = {
  // Поле (мировые единицы, портрет 9:16, D-004)
  W: 400, H: 720, margin: 18,

  // Матч (§12, D-003)
  roundsToWin: 1,              // один раунд (автор, 02.10; было Bo3 — D-018)
  maxRounds: 5,
  turnCapPerSide: 20,          // после — победа раунда по доле HP (D-011)
  padJitter: 12,               // разброс раскладки кувшинок между раундами (§12), раунд 1 — без разброса

  // Stamina (§5, D-008)
  staminaRegenOnPad: 1,        // в начале своего хода, если жаба на кувшинке
  restHealFrac: 0.10,          // и лечит долю макс. HP (автор, 02.10 — D-019)
  turnTimeSec: 15,             // таймер хода игрока; истёк — REST (D-021)
  dashStaminaCost: 1,
  dashHpCostNoStamina: 12,     // рывок при Stamina = 0 стоит HP (§5)
  abilityStaminaCost: 2,

  // Бой (§7, D-006)
  contactAssist: 4,            // допуск попадания при приземлении, к сумме радиусов
  waterVulnerability: 1.2,     // жаба в воде получает больше урона (D-008)
  dashDamageMul: 0.6,          // таран в воде слабее удара с прыжка
  dashKnockMul: 0.6,
  minPull: 0.12,               // оттяжка короче — отмена

  // Кувшинки (§2.4, §6, D-007)
  padSinkBig: 7,               // ходов от первой жабы на кувшинке до затопления (r >= padBigR), не прерывается (D-025)
  padSinkSmall: 4,             // то же для маленьких; Bulwark (вес 2) — на 1 ход быстрее
  padBigR: 36,
  padSubmergedTurns: 4,        // ходов под водой (ход = ход одной стороны)
  padRecoveringTurns: 2,       // последние ходы из них — «всплывает» (ещё нельзя встать)
  padLives: [[40, 3], [32, 2], [0, 1]], // сколько раз всплывёт: r >= 40 — 3, r >= 32 — 2, мельче — 1 (D-020)

  // Статусы (§8)
  poisonDamage: 8, poisonTurns: 3,
  bleedDamage: 5, bleedTurns: 3, bleedMaxStacks: 3,
  cloudRadius: 58, cloudTurns: 6,
  shieldAmount: 40, shieldTurns: 4,

  // Способности (D-009)
  jumperLongLeapFrac: 0.7, jumperLongLeapMul: 1.5,
  pullsPerTurn: 3,             // оттяжек за ход на сторону, делятся между жабами как угодно; синергия может добавить (D-030)
  ultPerfects: 2,              // столько идеальных прыжковых оттяжек за ход — и прыжок становится ультимейтом (D-033)
  ultRadius: 100, ultDirectMul: 1.6, ultMul: 1.0, ultKnock: 110, // ультимативное приземление (D-034)
  dmgBonusCap: 0.6,            // бонусы урона складываются и не больше +60% в сумме (D-036)
  repeatHitMul: [1, 0.7, 0.45], // 1-й / 2-й / 3-й и далее удар по той же жабе за ход (D-036)
  buffTime: 3,                 // бафф после оттяжки угасает за столько секунд — прыгни до этого (D-038)
  slamRangeMul: 0.85, slamRadius: 78, slamKnock: 105, slamDamageMul: 1.0,
  cloudRange: 210,
  tongueRange: 185, tongueDamageMul: 0.5,
  spinRadius: 72, spinDamageMul: 0.7, spinKnock: 30,
  bubbleRange: 230, bubbleCatch: 28, bubbleDamageMul: 0.5,

  // Бот (D-012)
  botAimNoiseDeg: 3.5, botAimNoisePow: 0.04, botTopPick: 3,
  botQteChance: 0.6,           // как часто бот попадает в кольцо
  botWater: 14, botThreat: 10, botReach: 6,  // веса оценки позиции (угроза — за каждого врага, который достаёт; «достаю» — доля Damage)
  botDepthTop: 6,              // сколько лучших ходов проверять ответом соперника (0 — жадный бот)

  // Темп анимации
  animSpeed: 1
};

// Шесть жаб (§8; стартовые числа — со скрина Choose Your Team, D-005). range — дальность прыжка, dash — рывка.
FB.FROGS = {
  jumper:  { name: 'Jumper Frog',    role: 'JUMPER',  hp: 120, dmg: 45, st: 6, r: 17, weight: 1, range: 285, dash: 120, knock: 45,
             ability: 'hop',    abilityName: 'Free Hop',    abilityDesc: 'A jump that does not use up a pull. Long leaps hit x1.5.',
             leap: { name: 'Relay', desc: 'A jump off its back does not use up a pull.', free: true } },
  bulwark: { name: 'Bulwark Frog',   role: 'TANK',    hp: 220, dmg: 30, st: 4, r: 22, weight: 2, range: 180, dash: 80,  knock: 80,
             ability: 'slam',   abilityName: 'Heavy Slam',  abilityDesc: 'Jump with a shockwave: damage and big knockback around landing.',
             leap: { name: 'Springboard', desc: 'A jump off its back goes 35% farther and knocks back 50% harder.', rangeMul: 1.35, knockMul: 1.5 } },
  poison:  { name: 'Poison Toad',    role: 'SUPPORT', hp: 160, dmg: 35, st: 6, r: 18, weight: 1, range: 210, dash: 100, knock: 45,
             ability: 'cloud',  abilityName: 'Poison Cloud', abilityDesc: 'Lob a toxic cloud. Enemies inside get Poison. Hits poison too.',
             leap: { name: 'Toxic Launch', desc: 'A jump off its back poisons whoever it lands on.', poison: true } },
  tongue:  { name: 'Tongue Grabber', role: 'CONTROL', hp: 140, dmg: 50, st: 5, r: 18, weight: 1, range: 200, dash: 100, knock: 45,
             ability: 'tongue', abilityName: 'Tongue Grab',  abilityDesc: 'Grab the first enemy on the line and pull it close. Off the pad!',
             leap: { name: 'Fling', desc: 'A jump off its back hits 25% harder.', dmgMul: 1.25 } },
  spur:    { name: 'Spur Toad',      role: 'BRUISER', hp: 180, dmg: 50, st: 5, r: 19, weight: 1, range: 195, dash: 100, knock: 50,
             ability: 'spin',   abilityName: 'Spur Spin',    abilityDesc: 'Spin: hit all enemies close by. Every hit applies Bleed.',
             leap: { name: 'Spiked Launch', desc: 'A jump off its back makes the target bleed.', bleed: true } },
  mystic:  { name: 'Mystic Frog',    role: 'MAGE',    hp: 110, dmg: 60, st: 6, r: 16, weight: 1, range: 225, dash: 110, knock: 40,
             ability: 'bubble', abilityName: 'Bubble',       abilityDesc: 'Enemy: trapped for a turn. Ally: shield 40.',
             leap: { name: 'Bubble Lift', desc: 'The frog jumping off its back gets a 25 shield.', shield: 25 } }
};
FB.FROG_ORDER = ['jumper', 'bulwark', 'poison', 'tongue', 'spur', 'mystic'];

// Синергии пары (§9, D-010): у каждой жабы 1–3 партнёра; бонус меняет поведение способности, не только числа.
FB.PAIRS = [
  { a: 'jumper',  b: 'bulwark', name: 'Leap & Guard',   desc: 'Your team gains +10% HP and +10% jump distance.', hpMul: 1.1, rangeMul: 1.1 },
  { a: 'poison',  b: 'tongue',  name: 'Toxic Grip',     desc: 'Tongue Grab poisons its target.', tonguePoison: true },
  { a: 'jumper',  b: 'spur',    name: 'Bleed & Chase',  desc: '+25% damage against bleeding enemies.', bleedDmgMul: 1.25 },
  { a: 'bulwark', b: 'tongue',  name: 'Water Pressure', desc: 'Enemies knocked or pulled into water lose 1 Stamina.', waterDrain: 1 },
  { a: 'poison',  b: 'mystic',  name: 'Witch Brew',     desc: 'Poison Cloud lasts 2 turns longer. Bubble poisons enemies.', cloudBonus: 2, bubblePoison: true },
  { a: 'bulwark', b: 'spur',    name: 'Spiked Wall',    desc: 'Bulwark hits apply Bleed.', bulwarkBleed: true },
  { a: 'tongue',  b: 'spur',    name: 'Hook & Spur',    desc: 'Tongue Grab applies Bleed.', tongueBleed: true },
  { a: 'jumper',  b: 'mystic',  name: 'Arcane Leap',    desc: 'Your frogs get +1 pull every turn (4 instead of 3).', pulls: 1 }
];

FB.findPair = function (k1, k2) {
  for (var i = 0; i < FB.PAIRS.length; i++) {
    var p = FB.PAIRS[i];
    if ((p.a === k1 && p.b === k2) || (p.a === k2 && p.b === k1)) return p;
  }
  return null;
};

// Базовая раскладка нижней половины пруда; верх — точечное отражение (честный старт, D-004).
FB.PADS_HALF = [
  { x: 112, y: 616, r: 44, start: 0 },
  { x: 290, y: 624, r: 42, start: 1 },
  { x: 205, y: 548, r: 26 },
  { x: 52,  y: 500, r: 26 },
  { x: 345, y: 520, r: 30 },
  { x: 140, y: 440, r: 37 },
  { x: 285, y: 420, r: 28 }
];
FB.PAD_CENTER = { x: 200, y: 360, r: 34 };

// ?t={json} — переопределение тюнинга (D-013)
(function () {
  try {
    var m = /[?&]t=([^&]+)/.exec(location.search);
    if (m) {
      var o = JSON.parse(decodeURIComponent(m[1]));
      for (var k in o) FB.T[k] = o[k];
      console.log('[FB] tuning override', o);
    }
  } catch (e) { console.warn('[FB] bad ?t=', e); }
})();
