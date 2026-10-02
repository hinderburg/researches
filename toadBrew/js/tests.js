// Тесты правил симуляции и автоплей бот-против-бота. Открывать tests.html.
(function () {
  var Sim = FB.Sim, AI = FB.AI, T = FB.T;
  var out = document.getElementById('tests'), results = [];

  function test(name, fn) {
    try { fn(); results.push([name, true]); }
    catch (e) { results.push([name, false, e.message]); console.error(name, e); }
  }
  function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + ' expected ' + b + ', got ' + a); }
  function ok(v, msg) { if (!v) throw new Error(msg || 'assert'); }

  // Арена-песочница: четыре большие кувшинки, которые не тонут, пока их не тронули (sinkLeft: null)
  function sandbox(tA, tB) {
    var s = Sim.createMatch(tA || ['jumper', 'bulwark'], tB || ['poison', 'tongue'], 7);
    Sim.startRound(s);
    s.pads = [[100, 600], [300, 600], [100, 200], [300, 200]].map(function (c, i) {
      return { id: i, x: c[0], y: c[1], r: 60, cap: 1, wear: 0, sinkLeft: null, state: 'stable', subTimer: 0, lives: 9 };
    });
    put(s, 0, 100, 600); put(s, 1, 300, 600); put(s, 2, 100, 200); put(s, 3, 300, 200);
    return s;
  }
  function put(s, id, x, y) { var f = s.frogs[id]; f.x = x; f.y = y; var p = Sim.padAt(s, x, y); f.pad = p ? p.id : -1; f.inWater = !p; }
  function addPad(s, x, y, r) { var p = { id: s.pads.length, x: x, y: y, r: r || 40, cap: 1, wear: 0, sinkLeft: null, state: 'stable', subTimer: 0, lives: 9 }; s.pads.push(p); return p; }
  // Действие и сразу конец хода (если ход продолжается)
  function turn(s, cmd) { var r = Sim.apply(s, cmd); if (r.ok && r.continues) Sim.apply(s, { frog: cmd.frog, mode: 'end' }); return r; }

  test('round start: frogs on start pads, player moves first, start pads already sinking', function () {
    var s = Sim.createMatch(['jumper', 'bulwark'], ['poison', 'tongue'], 1);
    Sim.startRound(s);
    eq(s.frogs.length, 4); eq(s.turnSide, 0); eq(s.round, 1);
    s.frogs.forEach(function (f) { ok(!f.inWater && f.pad >= 0, 'frog ' + f.id + ' on pad'); ok(s.pads[f.pad].sinkLeft !== null, 'start pad ticking'); });
    ok(s.frogs[0].y > T.H / 2 && s.frogs[2].y < T.H / 2, 'player bottom, bot top');
    eq(s.frogs[0].maxHp, 132, 'Leap & Guard +10% HP');
  });

  test('pads are point-symmetric (fair start)', function () {
    var s = Sim.createMatch(['jumper', 'bulwark'], ['poison', 'tongue'], 3);
    Sim.startRound(s); s.round = 1; Sim.startRound(s);
    for (var i = 0; i + 1 < s.pads.length - 1; i += 2) {
      var a = s.pads[i], b = s.pads[i + 1];
      ok(Math.abs(a.x + b.x - T.W) < 1e-6 && Math.abs(a.y + b.y - T.H) < 1e-6 && a.r === b.r, 'pair ' + i);
    }
  });

  test('jump onto enemy: lands right on its spot, enemy takes damage and is knocked away', function () {
    var s = sandbox();
    put(s, 2, 100, 420);
    var e = s.frogs[2], hp = e.hp, f = s.frogs[0];
    ok(Sim.apply(s, { frog: 0, mode: 'move', dx: 0, dy: -180 }).ok);
    eq(hp - e.hp, Math.round(f.dmg * T.waterVulnerability), 'water vulnerability damage');
    ok(Math.abs(f.x - 100) < 1e-6 && Math.abs(f.y - 420) < 1e-6, 'attacker landed exactly where aimed');
    ok(Sim.dist(e.x, e.y, f.x, f.y) >= f.r + e.r, 'enemy pushed clear'); ok(e.y < 420, 'pushed away along the jump');
  });

  test('3 pulls per turn shared between both frogs, then the turn passes', function () {
    var s = sandbox();
    var r1 = Sim.apply(s, { frog: 0, mode: 'move', dx: 0, dy: -150 });
    ok(r1.continues, 'continues'); ok(s.frogs[0].inWater, 'in water after jump');
    ok(!Sim.apply(s, { frog: 0, mode: 'rest' }).ok, 'no REST after a pull');
    ok(Sim.apply(s, { frog: 1, mode: 'move', dx: 0, dy: -50 }).continues, 'other frog takes the 2nd pull');
    var r3 = Sim.apply(s, { frog: 0, mode: 'move', dx: 0, dy: -40 });
    ok(r3.ok && !r3.continues, '3rd pull ends'); eq(s.turnSide, 1);
  });

  test('ring counts only on jump pulls from the 2nd on; two perfect jumps = ultimate landing', function () {
    var s = sandbox(['spur', 'jumper'], ['poison', 'tongue']), f = s.frogs[0], e = s.frogs[2];
    put(s, 0, 100, 450); // в воде: первая оттяжка — рывок на кувшинку
    Sim.apply(s, { frog: 0, mode: 'move', dx: 0, dy: 100, qte: true });
    eq(s.qteHits, 0, 'no ring on the 1st pull / dash'); ok(!f.inWater, 'climbed');
    put(s, 0, 100, 600); put(s, 2, 100, 480); e.bleed = 0; var h1 = e.hp;
    var r2 = Sim.apply(s, { frog: 0, mode: 'move', dx: 0, dy: -120, qte: true });
    eq(s.qteHits, 1); ok(r2.events.some(function (x) { return x.t === 'perfect' && x.hits === 1 && !x.ult; }), 'perfect 1/2');
    eq(h1 - e.hp, Math.round(f.dmg * T.waterVulnerability), 'perfect 1 does not change damage');
    put(s, 0, 100, 600); put(s, 2, 100, 480); put(s, 3, 150, 470); e.hp = e.maxHp; var h3 = s.frogs[3].hp;
    var r3 = Sim.apply(s, { frog: 0, mode: 'move', dx: 0, dy: -120, qte: true });
    ok(r3.events.some(function (x) { return x.t === 'ult'; }), 'ultimate landing');
    // 2-й удар по той же жабе за ход; бонусы складываются (вода + ультимейт) и упираются в потолок (D-036)
    ok(e.maxHp - e.hp >= Math.round(f.dmg * (1 + Math.min(T.waterVulnerability - 1 + T.ultDirectMul - 1, T.dmgBonusCap)) * T.repeatHitMul[1]), 'direct ultimate hit');
    ok(s.frogs[3].hp < h3, 'shockwave hits the other enemy too');
  });

  test('a dash never counts for the ring', function () {
    var s = sandbox();
    Sim.apply(s, { frog: 0, mode: 'move', dx: 0, dy: -150 }); // в воду
    Sim.apply(s, { frog: 0, mode: 'move', dx: 0, dy: -40, qte: true });
    eq(s.qteHits, 0);
  });

  test('jump onto own frog floating in water: ride on its back, top frog acts, bottom is locked', function () {
    var s = sandbox(); put(s, 1, 200, 450); ok(s.frogs[1].inWater);
    Sim.apply(s, { frog: 0, mode: 'move', dx: 100, dy: -150 });
    var f = s.frogs[0];
    eq(f.on, 1, 'riding'); ok(!f.inWater, 'out of water'); ok(!Sim.canAct(s, s.frogs[1]), 'bottom frog locked'); ok(Sim.canAct(s, f), 'top acts');
    eq(Sim.aimKind(s, f, 'move'), 'arc', 'jumps from the back, not a dash');
    eq(Math.round(Sim.rangeFor(s, f, 'move')), Math.round(f.range * 1.35), 'Springboard (Bulwark below): +35% range');
    Sim.apply(s, { frog: 0, mode: 'move', dx: 0, dy: -100 });
    eq(f.on, -1, 'jumped off'); ok(Sim.canAct(s, s.frogs[1]), 'bottom free again');
  });

  test('dash into own frog in water: climb on its back', function () {
    var s = sandbox(); put(s, 0, 200, 420); put(s, 1, 200, 470);
    Sim.apply(s, { frog: 0, mode: 'move', dx: 0, dy: 80 });
    eq(s.frogs[0].on, 1); ok(!s.frogs[0].inWater);
  });

  test('Relay: a jump off Jumper\'s back does not use up a pull', function () {
    var s = sandbox(); put(s, 0, 200, 450);           // Jumper в воде
    Sim.apply(s, { frog: 1, mode: 'move', dx: -100, dy: -150 }); // Bulwark садится на спину Jumper
    eq(s.frogs[1].on, 0);
    var left = s.pullsLeft;
    Sim.apply(s, { frog: 1, mode: 'move', dx: 0, dy: -120 });
    eq(s.pullsLeft, left, 'pull kept');
  });

  test('knocking the bottom frog throws the rider off', function () {
    var s = sandbox(); put(s, 1, 200, 450);
    Sim.apply(s, { frog: 0, mode: 'move', dx: 100, dy: -150 }); Sim.apply(s, { frog: 0, mode: 'end' });
    eq(s.frogs[0].on, 1);
    addPad(s, 200, 300, 40); put(s, 2, 200, 300); // враг прыгает прямо на стопку: бьёт верхнюю
    Sim.apply(s, { frog: 2, mode: 'move', dx: 0, dy: 150 });
    eq(s.frogs[0].on, -1, 'rider knocked off'); ok(s.frogs[0].hp < s.frogs[0].maxHp, 'top frog took the hit');
  });

  test('preview shows the hit before release', function () {
    var s = sandbox(); put(s, 2, 100, 430);
    var p = Sim.preview(s, { frog: 0, mode: 'move', dx: 0, dy: -170 });
    ok(p.events.some(function (x) { return x.t === 'hit' && x.id === 2; }), 'hit predicted');
    var q = Sim.preview(s, { frog: 0, mode: 'move', dx: 60, dy: -170 });
    ok(!q.events.some(function (x) { return x.t === 'hit'; }), 'miss predicted');
  });

  test('END finishes the turn early; Arcane Leap gives 4 pulls', function () {
    var s = sandbox();
    Sim.apply(s, { frog: 0, mode: 'move', dx: 0, dy: -100 });
    Sim.apply(s, { frog: 0, mode: 'end' }); eq(s.turnSide, 1);
    var t = sandbox(['jumper', 'mystic'], ['poison', 'tongue']);
    eq(Sim.pullsFor(t, t.frogs[0]), 4);
  });

  test('long leap (>=70% range) hits x1.5', function () {
    var s = sandbox(), f = s.frogs[0], d = Math.round(f.range * 0.9);
    addPad(s, 100, 600 - d); put(s, 2, 100, 600 - d);
    var hp = s.frogs[2].hp;
    Sim.apply(s, { frog: 0, mode: 'move', dx: 0, dy: -d });
    eq(hp - s.frogs[2].hp, Math.round(f.dmg * T.jumperLongLeapMul));
  });

  test('damage bonuses add up and are capped; repeat hits on the same frog in a turn get weaker', function () {
    var s = sandbox(['jumper', 'tongue'], ['poison', 'bulwark']), f = s.frogs[0], e = s.frogs[2];
    var d = Math.round(f.range * 0.9);
    put(s, 0, 100, 600); put(s, 2, 100, 600 - d);                     // враг в воде, Long Leap: +50% + вода +20%
    Sim.apply(s, { frog: 0, mode: 'move', dx: 0, dy: -d });
    eq(e.maxHp - e.hp, Math.round(f.dmg * (1 + Math.min(0.5 + 0.2, T.dmgBonusCap))), 'additive & capped (was x1.8 multiplicative)');
    var hp = e.hp; put(s, 0, 100, 600); put(s, 2, 100, 480);
    Sim.apply(s, { frog: 0, mode: 'move', dx: 0, dy: -120 });
    eq(hp - e.hp, Math.round(f.dmg * 1.2 * T.repeatHitMul[1]), '2nd hit this turn weaker');
  });

  test('dash costs Stamina; at 0 Stamina it costs HP and can climb a pad', function () {
    var s = sandbox();
    put(s, 0, 100, 450); var f = s.frogs[0]; ok(f.inWater);
    f.st = 1;
    Sim.apply(s, { frog: 0, mode: 'move', dx: 0, dy: 60 }); eq(f.st, 0);
    var hp = f.hp; put(s, 0, 100, 450);
    Sim.apply(s, { frog: 0, mode: 'move', dx: 0, dy: 100 });
    eq(hp - f.hp, T.dashHpCostNoStamina); ok(!f.inWater, 'climbed the pad');
  });

  test('a touched pad keeps sinking after the frog leaves, then floats up', function () {
    var s = sandbox(), p = s.pads[0];
    Sim.apply(s, { frog: 0, mode: 'move', dx: 0, dy: 20 });   // приземлилась на ту же кувшинку — та тронута
    ok(p.sinkLeft !== null, 'ticking'); var total = p.sinkLeft;
    Sim.apply(s, { frog: 0, mode: 'move', dx: 150, dy: 0 });  // ушла на соседнюю (не на спину союзнику)
    Sim.apply(s, { frog: 0, mode: 'end' });
    var n = 1; while (p.state === 'stable' && n < 20) { turn(s, { frog: s.turnSide === 0 ? 0 : 3, mode: 'rest' }); n++; }
    eq(n, total, 'sank after its countdown'); eq(p.state, 'submerged');
    for (var i = 0; i < T.padSubmergedTurns; i++) turn(s, { frog: s.turnSide === 0 ? 0 : 3, mode: 'rest' });
    eq(p.state, 'stable', 'floated up'); eq(p.lives, 8, 'used one float-up');
  });

  test('frog on a sinking pad falls into water when it goes under', function () {
    var s = sandbox(), p = s.pads[0];
    p.sinkLeft = 1; p.cap = 3; p.wear = 2;
    turn(s, { frog: 0, mode: 'rest' });
    ok(s.frogs[0].inWater, 'fell');
  });

  test('pad lives: big pads float up more times than small; last sink is forever', function () {
    var s = Sim.createMatch(['jumper', 'bulwark'], ['poison', 'tongue'], 1); Sim.startRound(s);
    var big = s.pads.filter(function (p) { return p.r >= 40; })[0], small = s.pads.filter(function (p) { return p.r < 32; })[0];
    ok(big.lives > small.lives, 'big ' + big.lives + ' > small ' + small.lives);
    var t = sandbox(), p = t.pads[1]; p.lives = 0; p.sinkLeft = 1; p.cap = 2; p.wear = 1;
    turn(t, { frog: 0, mode: 'rest' });
    eq(p.state, 'gone');
    for (var j = 0; j < 20; j++) turn(t, { frog: t.turnSide === 0 ? 0 : 3, mode: 'rest' });
    eq(p.state, 'gone', 'never comes back'); ok(!Sim.padAt(t, p.x, p.y), 'not standable');
  });

  test('REST on a pad refills all Stamina and heals part of HP; in water nothing', function () {
    var s = sandbox(), f = s.frogs[0];
    f.hp = 50; f.st = 0;
    turn(s, { frog: 0, mode: 'rest' });
    eq(f.hp, 50 + Math.round(f.maxHp * T.restHealFrac)); eq(f.st, f.maxSt, 'full stamina');
    turn(s, { frog: 2, mode: 'rest' });
    put(s, 0, 200, 420); f.st = 0; var hp = f.hp;
    turn(s, { frog: 0, mode: 'rest' });
    eq(f.hp, hp, 'no heal in water'); eq(f.st, 0, 'no stamina in water');
  });

  test('one ability per turn', function () {
    var s = sandbox(['poison', 'tongue'], ['jumper', 'bulwark']);
    ok(Sim.apply(s, { frog: 0, mode: 'ability', dx: 0, dy: -200 }).continues);
    ok(!Sim.abilityAvailable(s, s.frogs[0]), 'second ability blocked');
  });

  test('Free Hop does not use up a pull', function () {
    var s = sandbox();
    Sim.apply(s, { frog: 0, mode: 'ability', dx: 0, dy: -100 });
    eq(s.pullsLeft, T.pullsPerTurn, 'pull kept'); eq(s.pullsUsed, 1);
  });

  test('Poison Cloud poisons enemies, poison ticks at their turn start', function () {
    var s = sandbox(['poison', 'tongue'], ['jumper', 'bulwark']);
    var e = s.frogs[2], hp = e.hp;
    put(s, 2, 100, 395);
    turn(s, { frog: 0, mode: 'ability', dx: 0, dy: -400 });
    ok(e.hp < hp, 'poison ticked');
  });

  test('Tongue Grab pulls first enemy on the line into contact (off the pad)', function () {
    var s = sandbox(['tongue', 'spur'], ['jumper', 'bulwark']);
    put(s, 2, 100, 440);
    Sim.apply(s, { frog: 0, mode: 'ability', dx: 0, dy: -185 });
    var e = s.frogs[2], f = s.frogs[0];
    ok(Math.abs(Sim.dist(e.x, e.y, f.x, f.y) - (e.r + f.r + 2)) < 1, 'pulled to contact');
    ok(e.bleed > 0, 'Hook & Spur: bleed');
  });

  test('Bubble traps an enemy for its next turn', function () {
    var s = sandbox(['mystic', 'poison'], ['jumper', 'bulwark']);
    put(s, 2, 100, 380);
    turn(s, { frog: 0, mode: 'ability', dx: 0, dy: -220 });
    ok(!Sim.canAct(s, s.frogs[2]), 'trapped cannot act'); ok(s.frogs[2].poison > 0, 'Witch Brew poison');
    turn(s, { frog: 3, mode: 'rest' });
    turn(s, { frog: 1, mode: 'rest' });
    ok(Sim.canAct(s, s.frogs[2]), 'free next turn');
  });

  test('Spur Spin: hits close enemies, applies Bleed that ticks', function () {
    var s = sandbox(['spur', 'jumper'], ['poison', 'tongue']);
    put(s, 2, 100, 625); var e = s.frogs[2], hp = e.hp;
    turn(s, { frog: 0, mode: 'ability', dx: 0, dy: -1 });
    eq(e.bleed, 1, 'bleed applied');
    eq(hp - e.hp, Math.round(50 * T.spinDamageMul) + T.bleedDamage, 'spin + bleed tick');
  });

  test('Heavy Slam hits all enemies in radius', function () {
    var s = sandbox(['bulwark', 'jumper'], ['poison', 'tongue']);
    put(s, 2, 70, 470); put(s, 3, 130, 470);
    var h2 = s.frogs[2].hp, h3 = s.frogs[3].hp;
    Sim.apply(s, { frog: 0, mode: 'ability', dx: 0, dy: -120 });
    ok(s.frogs[2].hp < h2 && s.frogs[3].hp < h3, 'both hit');
  });

  test('preview == apply (deterministic, predictable trajectory)', function () {
    var s = sandbox(); put(s, 2, 120, 430);
    var cmd = { frog: 0, mode: 'move', dx: 15, dy: -170 };
    var p = Sim.preview(s, cmd);
    Sim.apply(s, cmd);
    eq(p.state.frogs[2].hp, s.frogs[2].hp); eq(p.state.frogs[0].x, s.frogs[0].x); eq(p.state.frogs[2].y, s.frogs[2].y);
  });

  test('single round: KO ends the match (roundsToWin = 1)', function () {
    var s = sandbox();
    s.frogs[2].alive = false; s.frogs[2].hp = 0; s.frogs[3].hp = 1; put(s, 3, 100, 430);
    Sim.apply(s, { frog: 0, mode: 'move', dx: 0, dy: -170 });
    eq(s.phase, 'matchOver'); eq(s.matchWinner, 0); eq(s.roundWhy, 'ko');
  });

  test('Bo3 still works via tuning (roundsToWin = 2)', function () {
    var keep = T.roundsToWin; T.roundsToWin = 2;
    try {
      var s = sandbox();
      s.frogs[2].alive = false; s.frogs[2].hp = 0; s.frogs[3].hp = 1; put(s, 3, 100, 430);
      Sim.apply(s, { frog: 0, mode: 'move', dx: 0, dy: -170 });
      eq(s.phase, 'roundOver'); eq(s.score[0], 1);
      Sim.startRound(s); eq(s.turnSide, 1, 'round 2 starts bot');
    } finally { T.roundsToWin = keep; }
  });

  test('bot plays a whole turn of legal pulls', function () {
    var s = Sim.createMatch(['jumper', 'bulwark'], ['poison', 'tongue'], 11);
    Sim.startRound(s); s.turnSide = 1;
    var rand = AI.makeRand(5), n = 0;
    while (s.turnSide === 1 && n < 6) { var plan = AI.choose(s, rand); ok(plan && Sim.apply(s, plan.cmd).ok, 'legal'); n++; }
    eq(s.turnSide, 0, 'turn passed');
  });

  var pass = results.filter(function (r) { return r[1]; }).length;
  out.innerHTML = '<p class="' + (pass === results.length ? 'ok' : 'fail') + '">Tests: ' + pass + '/' + results.length + '</p>' +
    results.map(function (r) { return '<div class="' + (r[1] ? 'ok' : 'fail') + '">' + (r[1] ? '✔ ' : '✘ ') + r[0] + (r[2] ? ' — ' + r[2] : '') + '</div>'; }).join('');
  window.TEST_RESULT = { pass: pass, total: results.length, failed: results.filter(function (r) { return !r[1]; }) };

  // ---------- Автоплей ----------
  function playMatch(tA, tB, seed) {
    var s = Sim.createMatch(tA, tB, seed), rand = AI.makeRand(seed * 31 + 7), turns = 0, rounds = [];
    Sim.startRound(s);
    var stats = { abil: 0, moves: 0, water: 0, sinks: 0 };
    while (s.phase !== 'matchOver' && turns < 2000) {
      if (s.phase === 'roundOver') { rounds.push(s.turnCount[0] + s.turnCount[1]); Sim.startRound(s); continue; }
      var plan = AI.choose(s, rand);
      if (!plan) break;
      var r = Sim.apply(s, plan.cmd);
      if (plan.cmd.mode === 'ability') stats.abil++; else if (plan.cmd.mode !== 'rest') stats.moves++;
      r.events.forEach(function (e) { if (e.t === 'padSink') stats.sinks++; if (e.t === 'splash') stats.water++; });
      turns++;
    }
    if (s.phase === 'roundOver' || s.phase === 'matchOver') rounds.push(s.turnCount[0] + s.turnCount[1]);
    return { winner: s.matchWinner, rounds: rounds, turns: turns, stats: stats, score: s.score };
  }
  window.playMatch = playMatch;

  function pairs() {
    var o = FB.FROG_ORDER, p = [];
    for (var i = 0; i < o.length; i++) for (var j = i + 1; j < o.length; j++) p.push([o[i], o[j]]);
    return p;
  }

  function runMatrix(n, done) {
    var P = pairs(), jobs = [], seed = 100;
    for (var i = 0; i < P.length; i++) for (var j = 0; j < P.length; j++) if (i !== j) for (var k = 0; k < n; k++) jobs.push([i, j, seed++]);
    // выборка, чтобы не ждать вечно: не больше 120 матчей
    if (jobs.length > 120) { var stride = jobs.length / 120, sel = []; for (var q = 0; q < 120; q++) sel.push(jobs[Math.floor(q * stride)]); jobs = sel; }
    var wins = {}, games = {}, frogW = {}, frogG = {}, roundLens = [], abil = 0, moves = 0, sinks = 0, idx = 0, t0 = performance.now();
    P.forEach(function (p) { wins[p.join('+')] = 0; games[p.join('+')] = 0; });
    FB.FROG_ORDER.forEach(function (k) { frogW[k] = 0; frogG[k] = 0; });
    function step() {
      var until = performance.now() + 40;
      while (idx < jobs.length && performance.now() < until) {
        var jb = jobs[idx++], A = P[jb[0]], B = P[jb[1]], r = playMatch(A, B, jb[2]);
        var ka = A.join('+'), kb = B.join('+');
        games[ka]++; games[kb]++;
        if (r.winner === 0) wins[ka]++; else wins[kb]++;
        A.forEach(function (k) { frogG[k]++; if (r.winner === 0) frogW[k]++; });
        B.forEach(function (k) { frogG[k]++; if (r.winner === 1) frogW[k]++; });
        roundLens = roundLens.concat(r.rounds); abil += r.stats.abil; moves += r.stats.moves; sinks += r.stats.sinks;
      }
      document.getElementById('auto').textContent = 'running ' + idx + '/' + jobs.length;
      if (idx < jobs.length) return setTimeout(step, 0);
      roundLens.sort(function (a, b) { return a - b; });
      var med = roundLens[Math.floor(roundLens.length / 2)];
      var html = '<p>' + jobs.length + ' matches in ' + Math.round(performance.now() - t0) + ' ms. Round length (turns, both sides): median ' + med +
        ', p10 ' + roundLens[Math.floor(roundLens.length * 0.1)] + ', p90 ' + roundLens[Math.floor(roundLens.length * 0.9)] +
        '. Abilities ' + Math.round(100 * abil / (abil + moves)) + '% of actions. Pad sinks per match: ' + (sinks / jobs.length).toFixed(1) + '</p>';
      html += '<table><tr><th>Frog</th><th>Win %</th><th>Games</th></tr>' + FB.FROG_ORDER.map(function (k) {
        return '<tr><td>' + k + '</td><td>' + Math.round(100 * frogW[k] / Math.max(1, frogG[k])) + '</td><td>' + frogG[k] + '</td></tr>';
      }).join('') + '</table>';
      html += '<table><tr><th>Pair</th><th>Win %</th><th>Games</th><th>Bonus</th></tr>' + P.map(function (p) {
        var k = p.join('+'), b = FB.findPair(p[0], p[1]);
        return '<tr><td>' + k + '</td><td>' + Math.round(100 * wins[k] / Math.max(1, games[k])) + '</td><td>' + games[k] + '</td><td>' + (b ? b.name : '') + '</td></tr>';
      }).join('') + '</table>';
      document.getElementById('auto').innerHTML = html;
      window.AUTO_RESULT = { med: med, frogW: frogW, frogG: frogG, wins: wins, games: games };
      if (done) done();
    }
    step();
  }
  document.getElementById('run').onclick = function () { runMatrix(+document.getElementById('n').value || 2); };
  window.runMatrix = runMatrix;
})();
