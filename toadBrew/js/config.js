// Тюнинг и данные TOADBREW — Alchemical Arena. Все числа — здесь; переопределение без правки кода: ?t={"kbBase":70}
// Ссылки §N — на docs/GDD.md, D-xxx — на docs/DECISIONS.md.
var FB = window.FB || {};
window.FB = FB;

FB.VERSION = '1.0.0';

FB.T = {
  // Арена (§5, D-041): мир 400×720, портрет
  W: 400, H: 720, margin: 22,

  // Матч (§6, §16, §17)
  roundsToWin: 1,
  overloadRound: 7,            // ARENA OVERLOAD с 7-го раунда (после 6-го, §17)
  overloadStartR: 330,         // радиус безопасной зоны от центра в первом раунде перегрузки
  overloadShrink: 45,          // на сколько сужается каждый раунд
  overloadDamage: 40,          // environmental damage за начало активации вне безопасной зоны
  roundCap: 14,                // страховка: после — победа по доле HP
  turnTimeSec: 15,             // таймер активации игрока; истёк — пропуск (D-046)

  // Прыжок (§7)
  minPull: 0.12,
  arcBase: 25, arcPerLen: 0.3, // высота параболы: arcBase + длина × arcPerLen
  contactAssist: 5,
  chillRangeMul: 0.65,         // Chill: следующий прыжок короче (§10.3)
  pitRangeMul: 0.7,            // выпрыгнуть из провала (§5.3)

  // Урон и физика (§15)
  kbBase: 55, kbMin: 14, kbMax: 150,
  kbSpeedMin: 0.6,             // knockback × (kbSpeedMin + (1-kbSpeedMin) × доля дальности)
  wallHitDamage: 25,           // столкновение после knockback с колонной/стеной (§15.1)
  pitDamage: 40,               // падение в провал (§5.3)

  // Колбы (§10): радиусы зон и длительности в активациях (одна активация любой жабы = 1)
  zoneR: 42,
  emberBonus: 25, emberZoneTurns: 3, emberBurn: 25,
  poisonTick: 30, bleedTick: 25,
  forceKnockMul: 1.6, resonanceTurns: 2,
  venomZoneTurns: 6, frostZoneTurns: 6,
  overchargeMul: 1.5,          // одинаковые жидкости (§11.1)

  // Реакции (§11.2)
  reactR: 70,
  blastDamage: 90, blastKnock: 40,
  steamDamage: 30, steamKnock: 95,
  meteorImpactMul: 1.8, meteorDamage: 60, meteorTerrain: 2,
  noxiousRMul: 1.6,
  corrosiveDamage: 45, corrodedMul: 1.5,
  shatterDamage: 85, shatterTerrain: 2,

  // Жабы (§13)
  wideSpillMul: 1.35,          // Bellows Toad
  hookR: 120, hookPull: 55,    // Tongue Harpooner
  springLinkRangeMul: 1.2, springLinkAreaMul: 1.2, // Springjack
  aegisLaunchMul: 1.15,        // Aegis Toad: запуск из пары с Aegis
  linkSlack: 16,               // насколько можно разойтись, оставаясь Linked

  // Объекты (§5.2): прочность; CRACKED при hp <= crackAt
  pillarHp: 4, pillarCrackAt: 2, pillarHeight: 90,
  barrelHp: 2, barrelHeight: 22,
  tankHp: 2, tankHeight: 28, tankSpillR: 55,
  plateHp: 2,

  // Бот (D-047)
  botAimNoiseDeg: 3, botAimNoisePow: 0.04, botTopPick: 3, botDepthTop: 6,

  animSpeed: 1
};

// Жидкости (§10)
FB.LIQUIDS = {
  ember: { name: 'EMBER', color: '#ff4a2e', glow: '255,90,40',  hint: 'Damage', desc: 'Extra landing damage, burning zone.' },
  venom: { name: 'VENOM', color: '#46d94a', glow: '90,230,80',  hint: 'DoT / Poison', desc: 'Poison and a toxic zone.' },
  frost: { name: 'FROST', color: '#3fa8ff', glow: '90,170,255', hint: 'Slow / Control', desc: 'Chill: the next jump is shorter. Cold zone.' },
  force: { name: 'FORCE', color: '#ffc928', glow: '255,205,60', hint: 'Knockback', desc: 'Big knockback, breaks the arena, Resonance mark.' }
};
FB.LIQUID_ORDER = ['ember', 'venom', 'frost', 'force'];

// Реакции пар (§11.2); ключ — пара в алфавитном порядке
FB.REACTIONS = {
  'ember+venom': { name: 'BLAST',           desc: 'Explosion: high area damage, cracks the arena.', icons: ['dmg', 'crack'] },
  'ember+frost': { name: 'STEAM BURST',     desc: 'Clears surfaces, huge knockback around.',        icons: ['kb'] },
  'ember+force': { name: 'METEOR',          desc: 'Heavy impact, smashes objects and floor.',        icons: ['dmg', 'crack'] },
  'frost+venom': { name: 'NOXIOUS ICE',     desc: 'Big zone: Poison + Chill.',                       icons: ['dot', 'slow'] },
  'force+venom': { name: 'CORROSIVE BURST', desc: 'Area damage, targets take more from the next impact.', icons: ['dmg'] },
  'force+frost': { name: 'SHATTER',         desc: 'Burst on the target, wrecks cracked objects.',    icons: ['dmg', 'crack'] }
};
FB.reactionKey = function (a, b) { return a < b ? a + '+' + b : b + '+' + a; };

// Шесть механических жаб (§13). jump — дальность, mass — масса для knockback и разрушения.
FB.FROGS = {
  ram:     { name: 'Iron Ram',         role: 'IMPACT',   icon: 'shield', hp: 560, impact: 95, mass: 3.0, jump: 175, r: 26,
             passive: 'Battering Landing', pdesc: '+1 terrain damage on a direct hit or when landing next to an object.', best: ['force', 'ember'] },
  spur:    { name: 'Spur Knight',      role: 'DUELIST',  icon: 'sword',  hp: 470, impact: 75, mass: 2.0, jump: 235, r: 20,
             passive: 'Spurs', pdesc: 'A direct hit on an enemy frog applies Bleed.', best: ['frost', 'force'] },
  harpoon: { name: 'Tongue Harpooner', role: 'CONTROL',  icon: 'hook',   hp: 420, impact: 50, mass: 1.5, jump: 260, r: 19,
             passive: 'Harpoon Tongue', pdesc: 'After landing, hooks the nearest enemy in range and pulls it closer.', best: ['venom', 'frost'] },
  bellows: { name: 'Bellows Toad',     role: 'ALCHEMY',  icon: 'plus',   hp: 540, impact: 45, mass: 2.5, jump: 210, r: 24,
             passive: 'Wide Spill', pdesc: 'Its liquid zones are 35% larger.', best: ['venom', 'frost', 'ember'] },
  spring:  { name: 'Springjack',       role: 'MOBILITY', icon: 'dash',   hp: 480, impact: 65, mass: 1.0, jump: 300, r: 18,
             passive: 'Loaded Springs', pdesc: 'Launching while Linked: +20% range and a larger combo area.', best: [] },
  aegis:   { name: 'Aegis Toad',       role: 'ANCHOR',   icon: 'shield', hp: 600, impact: 45, mass: 2.5, jump: 170, r: 25,
             passive: 'Launch Pad', pdesc: 'An ally landing on it stays close; the next launch from the pair goes farther; both get a shield vs environment.', best: ['force', 'frost'] }
};
FB.FROG_ORDER = ['ram', 'spur', 'harpoon', 'bellows', 'spring', 'aegis'];

// Подсказка синергии пары на экране команды (§13–14, §19). Механических бонусов нет — синергия из поведения.
FB.SYNERGY = {
  'harpoon+ram':     { name: 'PULL → SMASH',     desc: 'Harpooner drags the enemy in, Iron Ram finishes on cracked floor.' },
  'bellows+harpoon': { name: 'ZONE → PULL BACK', desc: 'Bellows spills a big zone, Harpooner drags enemies back into it.' },
  'aegis+spring':    { name: 'LOAD → LAUNCH',    desc: 'Springjack lands on Aegis, then launches a two-flask combo across the arena.' },
  'bellows+spur':    { name: 'SLOW → HIT',       desc: 'A big Frost zone shortens enemy jumps, Spur Knight lands the hit with Bleed.' },
  'ram+spring':      { name: 'SLINGSHOT',        desc: 'Springjack sets up Links that make up for Iron Ram\'s short jump.' },
  'harpoon+spur':    { name: 'HOOK & STAB',      desc: 'The tongue pulls a target into position for a direct Spur hit.' },
  'bellows+spring':  { name: 'LONG DELIVERY',    desc: 'Springjack fires reactions on Bellows zones far across the arena.' },
  'aegis+spur':      { name: 'STEADY AIM',       desc: 'Aegis prepares a precise boosted Spur Knight jump.' }
};
FB.synergyFor = function (a, b) {
  return FB.SYNERGY[FB.reactionKey(a, b)] || { name: 'LINK COMBO', desc: 'Land one frog on the other to fire both active flasks as one reaction.' };
};

// Арена (§5.1, §21): нижняя половина, верх — точечное отражение (честный старт)
FB.ARENA_HALF = {
  starts: [{ x: 135, y: 640 }, { x: 265, y: 640 }],
  objects: [
    { kind: 'pillar', x: 95, y: 420, r: 22 },
    { kind: 'pillar', x: 290, y: 470, r: 22 },
    { kind: 'barrel', x: 330, y: 575, r: 15 },
    { kind: 'tank',   x: 55,  y: 535, r: 17, liquid: 'venom' }
  ],
  plates: [
    { x: 200, y: 440, r: 34 },
    { x: 150, y: 545, r: 30 }
  ]
};

// ?t={json} — переопределение тюнинга
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
