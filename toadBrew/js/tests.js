// Тесты правил симуляции TOADBREW и автоплей бот-против-бота. Открывать tests.html.
(function () {
  var Sim = FB.Sim, AI = FB.AI, T = FB.T;
  var out = document.getElementById('tests'), results = [];

  function test(name, fn) {
    try { fn(); results.push([name, true]); }
    catch (e) { results.push([name, false, e.message]); console.error(name, e); }
  }
  function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + ' expected ' + b + ', got ' + a); }
  function ok(v, msg) { if (!v) throw new Error(msg || 'assert'); }

  var DEF = [['ember', 'venom', 'frost'], ['venom', 'force', 'ember']];
  // Пустая арена (без объектов и плит), жабы расставлены вручную
  function sandbox(tA, tB, fA, fB) {
    var s = Sim.createMatch(tA || ['spur', 'aegis'], tB || ['ram', 'harpoon'], fA || DEF, fB || DEF, 7);
    Sim.startRound(s);
    s.objects = []; s.plates = [];
    put(s, 0, 120, 600); put(s, 1, 280, 600); put(s, 2, 120, 150); put(s, 3, 280, 150);
    return s;
  }
  function put(s, id, x, y) { var f = s.frogs[id]; f.x = x; f.y = y; }
  function jumpTo(s, id, x, y, extra) { var f = s.frogs[id], c = { frog: id, dx: x - f.x, dy: y - f.y }; for (var k in extra || {}) c[k] = extra[k]; return Sim.apply(s, c); }
  function has(r, t) { return r.events.some(function (e) { return e.t === t; }); }

  test('match start: 4 frogs, player first, flask I active', function () {
    var s = Sim.createMatch(['ram', 'spring'], ['aegis', 'bellows'], DEF, DEF, 1);
    Sim.startRound(s);
    eq(s.frogs.length, 4); eq(s.turnSide, 0); eq(s.round, 1);
    s.frogs.forEach(function (f) { eq(f.fi, 0); });
    eq(s.objects.length, 8, '4 pillars + 4 fragile'); eq(s.plates.length, 4, '4 plates');
  });

  test('arena is point-symmetric', function () {
    var s = Sim.createMatch(['ram', 'spring'], ['aegis', 'bellows'], DEF, DEF, 1); Sim.startRound(s);
    for (var i = 0; i < s.objects.length; i += 2) ok(Math.abs(s.objects[i].x + s.objects[i + 1].x - T.W) < 1e-6 && s.objects[i].kind === s.objects[i + 1].kind, 'obj ' + i);
  });

  test('each frog activates once per round, sides alternate, starter switches next round', function () {
    var s = sandbox();
    jumpTo(s, 0, 120, 560); eq(s.turnSide, 1);
    ok(!Sim.apply(s, { frog: 0, dx: 0, dy: -10 }).ok, 'no second activation');
    jumpTo(s, 2, 120, 190); eq(s.turnSide, 0);
    jumpTo(s, 1, 280, 560); eq(s.turnSide, 1);
    jumpTo(s, 3, 280, 190); eq(s.round, 2); eq(s.turnSide, 1, 'round 2 starts with the other player');
  });

  test('flask cycles I → II → III → I after own jumps; skip does not switch', function () {
    var s = sandbox(), f = s.frogs[0];
    eq(Sim.activeFlask(f), 'ember');
    jumpTo(s, 0, 120, 580); eq(Sim.activeFlask(f), 'venom');
    Sim.apply(s, { frog: 2, mode: 'skip' }); eq(Sim.activeFlask(s.frogs[2]), 'ember', 'skip keeps flask');
  });

  test('direct hit: impact damage, enemy knocked away, attacker lands where aimed', function () {
    var s = sandbox(['spur', 'aegis'], ['ram', 'harpoon'], [['force', 'venom', 'frost'], DEF[1]]);
    put(s, 2, 120, 450);
    var e = s.frogs[2], hp = e.hp;
    jumpTo(s, 0, 120, 450);
    eq(hp - e.hp, FB.FROGS.spur.impact + T.bleedTick * 0, 'impact');
    ok(Math.abs(s.frogs[0].y - 450) < 1e-6, 'attacker at landing point');
    ok(e.y < 450 - 20, 'knocked away'); ok(e.bleed === 1, 'Spurs: bleed');
  });

  test('knockback depends on mass', function () {
    var a = Sim.knockAmount(FB.FROGS.ram, FB.FROGS.spring, 1), b = Sim.knockAmount(FB.FROGS.spring, FB.FROGS.ram, 1);
    ok(a > b * 3, 'Ram pushes Springjack much farther than the other way (' + a + ' vs ' + b + ')');
  });

  test('Ember: extra landing damage and a burning zone', function () {
    var s = sandbox(); put(s, 2, 120, 450); var e = s.frogs[2], hp = e.hp;
    var r = jumpTo(s, 0, 120, 450);
    eq(hp - e.hp, FB.FROGS.spur.impact + T.emberBonus);
    ok(s.zones.some(function (z) { return z.type === 'ember'; }), 'fire zone'); ok(has(r, 'zone'));
  });

  test('Venom: poison ticks after the poisoned frog\'s next activation', function () {
    var s = sandbox(['spur', 'aegis'], ['ram', 'harpoon'], [['venom', 'ember', 'frost'], DEF[1]]);
    put(s, 2, 174, 450); var e = s.frogs[2]; // в зоне яда, но без прямого удара
    jumpTo(s, 0, 120, 450); eq(e.poison, 1, 'poisoned'); e.x = 380; e.y = 60; var hp = e.hp;
    jumpTo(s, 2, e.x, e.y - 60);
    eq(hp - e.hp, T.poisonTick); eq(e.poison, 0);
  });

  test('Frost: chill shortens only the next jump', function () {
    var s = sandbox(['spur', 'aegis'], ['ram', 'harpoon'], [['frost', 'ember', 'venom'], DEF[1]]);
    put(s, 2, 140, 450); var e = s.frogs[2];
    jumpTo(s, 0, 120, 450); eq(e.chill, 1);
    e.x = 380; e.y = 60; // вне холодной зоны
    eq(Math.round(Sim.rangeFor(s, e)), Math.round(e.jump * T.chillRangeMul));
    Sim.apply(s, { frog: 2, dx: 0, dy: 500 });
    ok(Math.abs(e.y - 60 - e.jump * T.chillRangeMul) < 1, 'short jump'); eq(e.chill, 0, 'chill gone');
  });

  test('Surface reaction: Ember landing in a Venom zone = BLAST, zone consumed', function () {
    var s = sandbox(); put(s, 2, 150, 420); put(s, 3, 90, 420);
    s.zones.push({ id: 99, type: 'venom', x: 120, y: 420, r: 45, turns: 5, side: 1 });
    var h2 = s.frogs[2].hp, h3 = s.frogs[3].hp;
    var r = jumpTo(s, 0, 120, 420);
    ok(r.events.some(function (e) { return e.t === 'reaction' && e.name === 'BLAST'; }), 'BLAST');
    ok(h2 - s.frogs[2].hp >= T.blastDamage && h3 - s.frogs[3].hp >= T.blastDamage, 'both enemies hit');
    ok(!s.zones.some(function (z) { return z.id === 99; }), 'zone consumed');
  });

  test('Overcharge: same liquid on its own zone is stronger', function () {
    var s = sandbox(); put(s, 2, 120, 420);
    s.zones.push({ id: 98, type: 'ember', x: 120, y: 420, r: 45, turns: 5, side: 0 });
    var hp = s.frogs[2].hp; jumpTo(s, 0, 120, 420);
    eq(hp - s.frogs[2].hp, FB.FROGS.spur.impact + Math.round(T.emberBonus * T.overchargeMul));
  });

  test('Link: landing on an ally links the pair (no damage, no flask effect); the next launch fires both flasks', function () {
    var s = sandbox(['spring', 'aegis'], ['ram', 'harpoon'], [['ember', 'frost', 'force'], ['venom', 'force', 'ember']]);
    var a = s.frogs[1], hp = a.hp;
    var r = jumpTo(s, 0, a.x, a.y);
    ok(has(r, 'link'), 'linked'); eq(a.hp, hp, 'no friendly damage'); eq(s.zones.length, 0, 'no flask effect');
    ok(s.frogs[0].envShield && a.envShield, 'Aegis Launch Pad shields');
    eq(Sim.activeFlask(s.frogs[0]), 'frost', 'jumper switched');
    Sim.apply(s, { frog: 2, mode: 'skip' });
    // Aegis запускается из пары: VENOM (своя) + FROST (Springjack) = NOXIOUS ICE
    put(s, 3, a.x, a.y - 120);
    var rr = jumpTo(s, 1, a.x, a.y - 120);
    ok(rr.events.some(function (e) { return e.t === 'reaction' && e.name === 'NOXIOUS ICE'; }), 'combined reaction');
    eq(Sim.activeFlask(s.frogs[0]), 'frost', 'partner flask unchanged'); eq(Sim.activeFlask(a), 'force', 'launcher switched');
    eq(s.links[0], null, 'link used up');
  });

  test('Springjack launching from Link: +20% range (and Aegis +15%)', function () {
    var s = sandbox(['spring', 'aegis']);
    s.links[0] = { a: 0, b: 1 }; put(s, 0, 280 - 18 - 25, 600);
    eq(Math.round(Sim.rangeFor(s, s.frogs[0])), Math.round(FB.FROGS.spring.jump * T.springLinkRangeMul * T.aegisLaunchMul));
  });

  test('a pillar blocks a low arc; repeated hits crack and destroy it', function () {
    var s = sandbox(); s.objects = [{ id: 0, kind: 'pillar', x: 120, y: 540, r: 22, hp: T.pillarHp, maxHp: T.pillarHp, state: 'intact' }];
    var r = jumpTo(s, 0, 120, 480);
    ok(has(r, 'bonk'), 'bonk'); ok(s.frogs[0].y > 540, 'stopped before the pillar');
    var p = s.objects[0];
    for (var i = 0; i < 6 && p.state !== 'destroyed'; i++) { s.acted = {}; s.turnSide = 0; put(s, 0, 120, 600); jumpTo(s, 0, 120, 480); }
    eq(p.state, 'destroyed');
  });

  test('fragile plate: cracks, then becomes a pit; falling hurts; jumping out is shorter', function () {
    var s = sandbox(); s.plates = [{ id: 0, x: 120, y: 480, r: 32, hp: T.plateHp, state: 'intact' }];
    jumpTo(s, 0, 120, 480); eq(s.plates[0].state, 'cracked');
    s.acted = {}; s.turnSide = 0; put(s, 0, 120, 600); var hp = s.frogs[0].hp;
    var r = jumpTo(s, 0, 120, 480);
    eq(s.plates[0].state, 'pit'); ok(has(r, 'fall')); eq(hp - s.frogs[0].hp, T.pitDamage);
    eq(Math.round(Sim.rangeFor(s, s.frogs[0])), Math.round(s.frogs[0].jump * T.pitRangeMul));
  });

  test('a broken alchemical tank spills its liquid', function () {
    var s = sandbox(); s.objects = [{ id: 0, kind: 'tank', x: 120, y: 470, r: 17, hp: 1, maxHp: 2, state: 'cracked', liquid: 'venom' }];
    var r = jumpTo(s, 0, 120, 500); // разлив тут же вступает в реакцию с Ember — это по правилам
    ok(r.events.some(function (e) { return e.t === 'zone' && e.zone.type === 'venom' && e.zone.side === -1; }), 'venom spill');
    ok(r.events.some(function (e) { return e.t === 'reaction' && e.name === 'BLAST'; }), 'Ember on the spill = BLAST');
  });

  test('Tongue Harpooner hooks the nearest enemy after landing', function () {
    var s = sandbox(['harpoon', 'aegis'], ['ram', 'spur']); put(s, 2, 120, 380);
    var y0 = s.frogs[2].y;
    var r = jumpTo(s, 0, 120, 480);
    ok(has(r, 'tongue'), 'tongue'); ok(s.frogs[2].y > y0 + 20, 'pulled closer');
  });

  test('Corrosive Burst: corroded target takes x1.5 from the next impact', function () {
    var s = sandbox(['spur', 'aegis'], ['ram', 'harpoon'], [['venom', 'ember', 'frost'], ['force', 'venom', 'ember']]);
    put(s, 2, 120, 420); s.zones.push({ id: 97, type: 'resonance', x: 120, y: 420, r: 35, turns: 2, side: 0 });
    var r = jumpTo(s, 0, 120, 420);
    ok(r.events.some(function (e) { return e.t === 'reaction' && e.name === 'CORROSIVE BURST'; }), 'reaction'); eq(s.frogs[2].corroded, 1, 'corroded');
    var e = s.frogs[2]; s.acted = {}; s.turnSide = 0; var hp = e.hp; put(s, 1, e.x, e.y + 120);
    jumpTo(s, 1, e.x, e.y);
    eq(hp - e.hp, Math.round(FB.FROGS.aegis.impact * T.corrodedMul), 'next impact x1.5'); eq(e.corroded, 0, 'used up');
  });

  test('Steam Burst clears surfaces and knocks everyone around', function () {
    var s = sandbox(); put(s, 2, 160, 420);
    s.zones.push({ id: 96, type: 'frost', x: 120, y: 420, r: 45, turns: 5, side: 1 });
    s.zones.push({ id: 95, type: 'venom', x: 170, y: 430, r: 30, turns: 5, side: 1 });
    var x0 = s.frogs[2].x;
    var r = jumpTo(s, 0, 120, 420);
    ok(r.events.some(function (e) { return e.t === 'reaction' && e.name === 'STEAM BURST'; }));
    eq(s.zones.length, 0, 'surfaces cleared'); ok(s.frogs[2].x > x0 + 20, 'knocked');
  });

  test('Arena Overload from round 7: outside the safe zone hurts at activation start', function () {
    var s = sandbox();
    for (var i = 0; i < 6 * 4; i++) { var f = s.frogs.filter(function (x) { return Sim.canAct(s, x); })[0]; Sim.apply(s, { frog: f.id, mode: 'skip' }); }
    eq(s.round, 7); ok(s.safeR !== null, 'overload');
    var f2 = s.frogs.filter(function (x) { return Sim.canAct(s, x); })[0]; put(s, f2.id, 30, 30); var hp = f2.hp;
    Sim.apply(s, { frog: f2.id, mode: 'skip' });
    eq(hp - f2.hp, T.overloadDamage);
  });

  test('preview == apply (predictable)', function () {
    var s = sandbox(); put(s, 2, 140, 430);
    var cmd = { frog: 0, dx: 15, dy: -170 };
    var p = Sim.preview(s, cmd);
    Sim.apply(s, cmd);
    eq(p.state.frogs[2].hp, s.frogs[2].hp); eq(p.state.frogs[0].x, s.frogs[0].x); eq(p.state.frogs[2].y, s.frogs[2].y);
  });

  test('KO of both enemy frogs ends the match', function () {
    var s = sandbox(); s.frogs[3].alive = false; s.frogs[3].hp = 0; s.frogs[2].hp = 5; put(s, 2, 120, 450);
    jumpTo(s, 0, 120, 450);
    eq(s.phase, 'matchOver'); eq(s.matchWinner, 0); eq(s.roundWhy, 'ko');
  });

  test('bot returns a legal activation', function () {
    var s = Sim.createMatch(['ram', 'spring'], ['aegis', 'bellows'], DEF, DEF, 11);
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
    var rand = AI.makeRand(seed * 31 + 7);
    var s = Sim.createMatch(tA, tB, [AI.flasksFor(tA[0], rand), AI.flasksFor(tA[1], rand)], [AI.flasksFor(tB[0], rand), AI.flasksFor(tB[1], rand)], seed);
    Sim.startRound(s);
    var n = 0, st = { reactions: 0, links: 0, destroyed: 0, falls: 0 };
    while (s.phase === 'play' && n < 400) {
      var plan = AI.choose(s, rand); if (!plan) break;
      var r = Sim.apply(s, plan.cmd);
      r.events.forEach(function (e) { if (e.t === 'reaction') st.reactions++; if (e.t === 'link') st.links++; if (e.t === 'objState' && e.state === 'destroyed') st.destroyed++; if (e.t === 'fall') st.falls++; });
      n++;
    }
    return { winner: s.matchWinner, rounds: s.round, why: s.roundWhy, stats: st };
  }
  window.playMatch = playMatch;

  function pairs() { var o = FB.FROG_ORDER, p = []; for (var i = 0; i < o.length; i++) for (var j = i + 1; j < o.length; j++) p.push([o[i], o[j]]); return p; }

  function runMatrix(n, done) {
    var P = pairs(), jobs = [], seed = 100;
    for (var i = 0; i < P.length; i++) for (var j = 0; j < P.length; j++) if (i !== j) for (var k = 0; k < n; k++) jobs.push([i, j, seed++]);
    if (jobs.length > 60) { var stride = jobs.length / 60, sel = []; for (var q = 0; q < 60; q++) sel.push(jobs[Math.floor(q * stride)]); jobs = sel; }
    var frogW = {}, frogG = {}, rounds = [], ko = 0, st = { reactions: 0, links: 0, destroyed: 0, falls: 0 }, idx = 0, t0 = performance.now();
    FB.FROG_ORDER.forEach(function (k) { frogW[k] = 0; frogG[k] = 0; });
    function step() {
      var until = performance.now() + 40;
      while (idx < jobs.length && performance.now() < until) {
        var jb = jobs[idx++], A = P[jb[0]], B = P[jb[1]], r = playMatch(A, B, jb[2]);
        A.forEach(function (k) { frogG[k]++; if (r.winner === 0) frogW[k]++; });
        B.forEach(function (k) { frogG[k]++; if (r.winner === 1) frogW[k]++; });
        rounds.push(r.rounds); if (r.why === 'ko') ko++;
        for (var kk in st) st[kk] += r.stats[kk];
      }
      document.getElementById('auto').textContent = 'running ' + idx + '/' + jobs.length;
      if (idx < jobs.length) return setTimeout(step, 0);
      rounds.sort(function (a, b) { return a - b; });
      var m = jobs.length;
      var html = '<p>' + m + ' matches in ' + Math.round(performance.now() - t0) + ' ms. Rounds: median ' + rounds[m >> 1] + ', p90 ' + rounds[Math.floor(m * 0.9)] +
        '. KO ' + Math.round(100 * ko / m) + '%. Per match: reactions ' + (st.reactions / m).toFixed(1) + ', links ' + (st.links / m).toFixed(1) +
        ', objects destroyed ' + (st.destroyed / m).toFixed(1) + ', pit falls ' + (st.falls / m).toFixed(1) + '</p>';
      html += '<table><tr><th>Frog</th><th>Win %</th><th>Games</th></tr>' + FB.FROG_ORDER.map(function (k) {
        return '<tr><td>' + FB.FROGS[k].name + '</td><td>' + Math.round(100 * frogW[k] / Math.max(1, frogG[k])) + '</td><td>' + frogG[k] + '</td></tr>';
      }).join('') + '</table>';
      document.getElementById('auto').innerHTML = html;
      window.AUTO_RESULT = { rounds: rounds, ko: ko, m: m, frogW: frogW, frogG: frogG, st: st };
      if (done) done();
    }
    step();
  }
  document.getElementById('run').onclick = function () { runMatrix(+document.getElementById('n').value || 1); };
  window.runMatrix = runMatrix;
})();
