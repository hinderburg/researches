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

  // Арена-песочница: две большие кувшинки и вода между ними
  function sandbox(tA, tB) {
    var s = Sim.createMatch(tA || ['jumper', 'bulwark'], tB || ['poison', 'tongue'], 7);
    Sim.startRound(s);
    s.pads = [
      { id: 0, x: 100, y: 600, r: 60, cap: 99, wear: 0, state: 'stable', subTimer: 0 },
      { id: 1, x: 300, y: 600, r: 60, cap: 99, wear: 0, state: 'stable', subTimer: 0 },
      { id: 2, x: 100, y: 200, r: 60, cap: 99, wear: 0, state: 'stable', subTimer: 0 },
      { id: 3, x: 300, y: 200, r: 60, cap: 99, wear: 0, state: 'stable', subTimer: 0 }
    ];
    put(s, 0, 100, 600); put(s, 1, 300, 600); put(s, 2, 100, 200); put(s, 3, 300, 200);
    return s;
  }
  function put(s, id, x, y) { var f = s.frogs[id]; f.x = x; f.y = y; var p = Sim.padAt(s, x, y); f.pad = p ? p.id : -1; f.inWater = !p; }

  test('round start: 4 frogs on their start pads, player moves first', function () {
    var s = Sim.createMatch(['jumper', 'bulwark'], ['poison', 'tongue'], 1);
    Sim.startRound(s);
    eq(s.frogs.length, 4); eq(s.turnSide, 0); eq(s.round, 1);
    s.frogs.forEach(function (f) { ok(!f.inWater && f.pad >= 0, 'frog ' + f.id + ' on pad'); });
    ok(s.frogs[0].y > T.H / 2 && s.frogs[2].y < T.H / 2, 'player bottom, bot top');
    eq(s.frogs[0].maxHp, 132, 'Leap & Guard +10% HP');
  });

  test('pads are point-symmetric (fair start)', function () {
    var s = Sim.createMatch(['jumper', 'bulwark'], ['poison', 'tongue'], 3);
    Sim.startRound(s); s.round = 1; Sim.startRound(s); // раунд 2 — с разбросом
    for (var i = 0; i + 1 < s.pads.length - 1; i += 2) {
      var a = s.pads[i], b = s.pads[i + 1];
      ok(Math.abs(a.x + b.x - T.W) < 1e-6 && Math.abs(a.y + b.y - T.H) < 1e-6 && a.r === b.r, 'pair ' + i);
    }
  });

  test('jump onto enemy: damage = Damage, knockback, attacker stays before target', function () {
    var s = sandbox();
    put(s, 2, 100, 420); // враг в воде на линии прыжка Jumper
    var e = s.frogs[2], hp = e.hp, f = s.frogs[0];
    var r = Sim.apply(s, { frog: 0, mode: 'move', dx: 0, dy: -180 });
    ok(r.ok);
    eq(hp - e.hp, Math.round(f.dmg * T.waterVulnerability), 'water vulnerability damage');
    ok(e.y < 420 - 30, 'knocked back up');
    ok(f.y > e.y, 'attacker before target');
  });

  test('jump into empty water → frog in water, turn passes', function () {
    var s = sandbox();
    Sim.apply(s, { frog: 0, mode: 'move', dx: 0, dy: -150 });
    ok(s.frogs[0].inWater); eq(s.turnSide, 1);
  });

  test('long leap (≥70% range) hits ×1.5', function () {
    var s = sandbox();
    var f = s.frogs[0], d = Math.round(f.range * 0.9);
    put(s, 2, 100, 600 - d);
    s.pads.push({ id: 4, x: 100, y: 600 - d, r: 40, cap: 99, wear: 0, state: 'stable', subTimer: 0 }); put(s, 2, 100, 600 - d);
    var hp = s.frogs[2].hp;
    Sim.apply(s, { frog: 0, mode: 'move', dx: 0, dy: -d });
    eq(hp - s.frogs[2].hp, Math.round(f.dmg * T.jumperLongLeapMul));
  });

  test('dash costs Stamina; at 0 Stamina it costs HP and can climb a pad', function () {
    var s = sandbox();
    put(s, 0, 100, 450); var f = s.frogs[0]; ok(f.inWater);
    f.st = 1;
    Sim.apply(s, { frog: 0, mode: 'move', dx: 0, dy: 60 }); eq(f.st, 0);
    s.turnSide = 0;
    var hp = f.hp; put(s, 0, 100, 450);
    Sim.apply(s, { frog: 0, mode: 'move', dx: 0, dy: 100 });
    eq(hp - f.hp, T.dashHpCostNoStamina);
    ok(!f.inWater, 'climbed the pad');
  });

  test('pad sinks under a frog and recovers later', function () {
    var s = sandbox();
    s.pads[0].cap = 3;
    for (var i = 0; i < 3; i++) { s.turnSide = 0; Sim.apply(s, { frog: 0, mode: 'rest' }); }
    eq(s.pads[0].state, 'submerged'); ok(s.frogs[0].inWater, 'frog fell');
    for (var j = 0; j < T.padSubmergedTurns; j++) { s.turnSide = 0; Sim.apply(s, { frog: 1, mode: 'rest' }); }
    eq(s.pads[0].state, 'stable'); ok(!s.frogs[0].inWater, 'lifted back');
  });

  test('Stamina regenerates on pad at own turn start, not in water', function () {
    var s = sandbox();
    s.frogs[0].st = 0; s.frogs[1].st = 0; put(s, 1, 200, 450);
    Sim.apply(s, { frog: 0, mode: 'rest' });      // REST на кувшинке: +1
    eq(s.frogs[0].st, 1);
    Sim.apply(s, { frog: 2, mode: 'rest' });      // ход бота, затем старт хода игрока: +1 на кувшинке
    eq(s.frogs[0].st, 2); eq(s.frogs[1].st, 0, 'in water no regen');
  });

  test('Poison Cloud poisons enemies, poison ticks at their turn start', function () {
    var s = sandbox(['poison', 'tongue'], ['jumper', 'bulwark']);
    var e = s.frogs[2], hp = e.hp;
    Sim.apply(s, { frog: 0, mode: 'ability', dx: 0, dy: -200 }); // облако на (100,400): мимо
    eq(e.poison, 0);
    s.turnSide = 0; s.frogs[0].st = 3;
    Sim.apply(s, { frog: 0, mode: 'ability', dx: 0, dy: -400 }); // дальность 210 → (100,390)
    put(s, 2, 100, 395); s.turnSide = 0; s.frogs[0].st = 3;
    var r = Sim.apply(s, { frog: 1, mode: 'rest' }); // конец хода — облако травит, старт хода врага — тик
    ok(e.hp < hp, 'poison ticked');
  });

  test('Tongue Grab pulls first enemy on the line into contact (off the pad)', function () {
    var s = sandbox(['tongue', 'spur'], ['jumper', 'bulwark']);
    put(s, 2, 100, 440);
    var r = Sim.apply(s, { frog: 0, mode: 'ability', dx: 0, dy: -185 });
    var e = s.frogs[2], f = s.frogs[0];
    ok(Math.abs(Sim.dist(e.x, e.y, f.x, f.y) - (e.r + f.r + 2)) < 1, 'pulled to contact');
    ok(e.bleed > 0, 'Hook & Spur: bleed');
  });

  test('Bubble traps an enemy for its next turn', function () {
    var s = sandbox(['mystic', 'poison'], ['jumper', 'bulwark']);
    Sim.apply(s, { frog: 0, mode: 'ability', dx: 0, dy: -400 }); // (100,370) — пусто
    s.turnSide = 0; s.frogs[0].st = 3; put(s, 2, 100, 380);
    Sim.apply(s, { frog: 0, mode: 'ability', dx: 0, dy: -220 });
    ok(!Sim.canAct(s, s.frogs[2]), 'trapped cannot act');
    ok(s.frogs[2].poison > 0, 'Witch Brew poison');
    Sim.apply(s, { frog: 3, mode: 'rest' });
    Sim.apply(s, { frog: 1, mode: 'rest' });
    ok(Sim.canAct(s, s.frogs[2]), 'free next turn');
  });

  test('Spur Spin: hits close enemies, applies Bleed that ticks', function () {
    var s = sandbox(['spur', 'jumper'], ['poison', 'tongue']);
    put(s, 2, 100, 625); var e = s.frogs[2], hp = e.hp;
    Sim.apply(s, { frog: 0, mode: 'ability', dx: 0, dy: -1 });
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

  test('Double Hop: turn continues, second hop shorter, then ends', function () {
    var s = sandbox();
    var r = Sim.apply(s, { frog: 0, mode: 'ability', dx: 200, dy: 0 });
    ok(r.continues, 'continues'); eq(s.pendingHop, 0); eq(s.turnSide, 0);
    ok(!Sim.apply(s, { frog: 1, mode: 'move', dx: 0, dy: -50 }).ok, 'other frog blocked');
    Sim.apply(s, { frog: 0, mode: 'hop', dx: 0, dy: -500 });
    var f = s.frogs[0];
    ok(Math.abs(600 - f.y - f.range * T.jumperHopRangeMul) < 1, 'hop range');
    eq(s.turnSide, 1);
  });

  test('preview == apply (deterministic, predictable trajectory)', function () {
    var s = sandbox(); put(s, 2, 120, 430);
    var cmd = { frog: 0, mode: 'move', dx: 15, dy: -170 };
    var p = Sim.preview(s, cmd);
    Sim.apply(s, cmd);
    eq(p.state.frogs[2].hp, s.frogs[2].hp); eq(p.state.frogs[0].x, s.frogs[0].x); eq(p.state.frogs[2].y, s.frogs[2].y);
  });

  test('round KO and match flow', function () {
    var s = sandbox();
    s.frogs[2].alive = false; s.frogs[2].hp = 0; s.frogs[3].hp = 1; put(s, 3, 100, 430);
    Sim.apply(s, { frog: 0, mode: 'move', dx: 0, dy: -170 });
    eq(s.phase, 'roundOver'); eq(s.score[0], 1);
    Sim.startRound(s); eq(s.turnSide, 1, 'round 2 starts bot');
    s.frogs[0].alive = false; s.frogs[1].hp = 1;
    s.frogs[2].x = s.frogs[1].x; s.frogs[2].y = s.frogs[1].y - 150; s.frogs[2].inWater = false;
    s.pads.push({ id: 99, x: s.frogs[2].x, y: s.frogs[2].y, r: 30, cap: 99, wear: 0, state: 'stable', subTimer: 0 });
    s.pads[s.pads.length - 1].id = s.pads.length - 1;
    Sim.apply(s, { frog: 2, mode: 'move', dx: 0, dy: 150 });
    eq(s.score[1], 1);
  });

  test('bot returns a legal command', function () {
    var s = Sim.createMatch(['jumper', 'bulwark'], ['poison', 'tongue'], 11);
    Sim.startRound(s); s.turnSide = 1;
    var plan = AI.choose(s, AI.makeRand(5));
    ok(plan && Sim.apply(s, plan.cmd).ok, 'legal');
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
