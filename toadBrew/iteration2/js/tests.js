// Тесты правил TOADBREW v2 (GDD v2) и автоплей бот-против-бота. Открывать tests.html.
(function () {
  var Sim = FB.Sim, AI = FB.AI, T = FB.T, AR = FB.ARENA;
  var out = document.getElementById('tests'), results = [];

  function test(name, fn) {
    try { fn(); results.push([name, true]); }
    catch (e) { results.push([name, false, e.message]); console.error(name, e); }
  }
  function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + ' expected ' + b + ', got ' + a); }
  function ok(v, msg) { if (!v) throw new Error(msg || 'assert'); }
  function near(a, b, eps, msg) { if (Math.abs(a - b) > eps) throw new Error((msg || '') + ' expected ~' + b + ', got ' + a); }

  var EL = [['fire', 'ice'], ['poison', 'lightning']];
  // Нижняя половина арены свободна: жабы расставлены вручную, постоянные лужи выключены
  function sandbox(tA, tB, eA, eB) {
    var s = Sim.createMatch(tA || ['spring', 'cling'], tB || ['bellows', 'spur'], eA || EL[0], eB || EL[1], 7);
    Sim.startMatch(s);
    s.puddles.forEach(function (p) { p.active = false; });
    put(s, 0, 600, 2000); put(s, 1, 900, 2000); put(s, 2, 600, 400); put(s, 3, 900, 400);
    return s;
  }
  function put(s, id, x, y) { var f = s.frogs[id]; f.x = x; f.y = y; }
  function jumpTo(s, id, x, y, mode) { var f = s.frogs[id]; return Sim.apply(s, { frog: id, dx: x - f.x, dy: y - f.y, mode: mode }); }
  function ev(r, t) { return r.events.filter(function (e) { return e.t === t; }); }
  function has(r, t) { return ev(r, t).length > 0; }

  test('match start: 4 frogs, 4 fixed puddles, 4 drain nodes, player starts', function () {
    var s = Sim.createMatch(['spring', 'cling'], ['bellows', 'spur'], EL[0], EL[1], 1);
    Sim.startMatch(s);
    eq(s.frogs.length, 4); eq(s.turnSide, 0); eq(s.round, 1);
    eq(s.puddles.filter(function (p) { return p.fixed; }).length, 4); eq(s.nodes.length, 4);
    s.frogs.forEach(function (f) { ok(Sim.insideArena(f.x, f.y, f.r), 'frog ' + f.id + ' inside'); });
    eq(s.frogs[0].el, 'fire'); eq(s.frogs[3].el, 'lightning');
  });

  test('arena is point-symmetric (floor, puddles, nodes, starts)', function () {
    var cx = 0, cy = 0, P = AR.floor;
    var xs = P.map(function (p) { return p.x; }), ys = P.map(function (p) { return p.y; });
    cx = (Math.min.apply(0, xs) + Math.max.apply(0, xs)) / 2; cy = (Math.min.apply(0, ys) + Math.max.apply(0, ys)) / 2;
    P.forEach(function (p) { ok(P.some(function (q) { return Math.abs(q.x + p.x - 2 * cx) < 1 && Math.abs(q.y + p.y - 2 * cy) < 1; }), 'floor ' + p.x + ',' + p.y); });
    AR.nodes.forEach(function (n) { ok(AR.nodes.some(function (m) { return Math.abs(m.p.x + n.p.x - 2 * cx) < 1 && Math.abs(m.p.y + n.p.y - 2 * cy) < 1; }), 'node'); });
    ok(Math.abs(AR.starts[0][0].x + AR.starts[1][0].x - 2 * cx) < 1 && Math.abs(AR.starts[0][0].y + AR.starts[1][0].y - 2 * cy) < 1, 'starts');
  });

  test('each frog activates once per round, sides alternate, starter switches', function () {
    var s = sandbox(), order = [];
    for (var i = 0; i < 4; i++) {
      var side = s.turnSide, f = s.frogs.filter(function (x) { return x.side === side && Sim.canAct(s, x); })[0];
      order.push(f.id); Sim.apply(s, { frog: f.id, mode: 'skip' });
    }
    eq(order.join(','), '0,2,1,3'); eq(s.round, 2); eq(s.turnSide, 1, 'round 2 starts with bot');
    ok(!Sim.apply(s, { frog: 0, mode: 'skip' }).ok, 'player cannot act out of turn');
  });

  test('direct hit: impact cut by Defense + element, enemy knocked back', function () {
    var s = sandbox(); put(s, 2, 600, 1800);
    var hp = s.frogs[2].hp, y0 = 1800, r = jumpTo(s, 0, 600, 1800);
    var hits = ev(r, 'hit').filter(function (e) { return e.id === 2; });
    ok(hits.length >= 2, 'impact + fire');
    var imp = (T.impactBase + T.impactSpeed * 200 / s.frogs[0].jump) * (1 - FB.FROGS.bellows.def / 100);
    eq(hits[0].dmg, Math.round(imp), 'impact');
    eq(hits[1].dmg, Math.round(T.fireDmg * (1 - FB.FROGS.bellows.def / 100)), 'fire');
    ok(s.frogs[2].y < y0 - 10, 'pushed away');
    ok(s.frogs[2].hp < hp);
  });

  test('wall bounce reflects and adds range (+10%)', function () {
    var s = sandbox(); put(s, 0, 500, 2000);
    var r = jumpTo(s, 0, 500 - 400, 2000);
    ok(has(r, 'bounce'), 'bounced'); var j = ev(r, 'jump')[0];
    eq(j.segs.length, 2);
    near(j.segs[1].len, (400 - j.segs[0].len) * (1 + T.wallBonus), 0.5, 'remaining × 1.1');
    ok(s.frogs[0].x > 500, 'came back to the right');
  });

  test('Wall Launch Zone bounce adds +30%', function () {
    var s = sandbox(); var z = AR.wlz[0]; put(s, 0, 520, (z.y0 + z.y1) / 2);
    var r = jumpTo(s, 0, 320, (z.y0 + z.y1) / 2), j = ev(r, "jump")[0]; // короткий: отскок не долетает до колонны
    ok(j.segs[0].wlz !== null && j.segs[0].wlz !== undefined, 'hit WLZ');
    near(j.segs[1].len, (200 - j.segs[0].len) * (1 + T.wlzBonus), 0.5);
  });

  test('column blocks the jump and ricochets', function () {
    var s = sandbox(); var C = AR.column; put(s, 0, (C.x0 + C.x1) / 2, C.y1 + 120);
    var r = jumpTo(s, 0, (C.x0 + C.x1) / 2, C.y1 - 150);
    ok(ev(r, 'bounce').some(function (e) { return e.kind === 'column'; }), 'bounced off column');
    ok(s.frogs[0].y > C.y1, 'ended below the column');
  });

  test('column blocks even a long high jump (no passing through)', function () {
    var s = sandbox(); var C = AR.column, cx = (C.x0 + C.x1) / 2; put(s, 0, cx, C.y1 + 140);
    var r = jumpTo(s, 0, cx, C.y1 + 140 - s.frogs[0].jump); // полный прыжок вверх, вершина дуги — над колонной
    ok(ev(r, 'bounce').some(function (e) { return e.kind === 'column'; }), 'bounced off column');
    ok(s.frogs[0].y > C.y1, 'stayed on its side');
  });

  test('landing on ally gives Reaction Charge; next jump triggers it anywhere', function () {
    var s = sandbox(['spring', 'bellows'], ['cling', 'spur']); // momentum, не catapult
    put(s, 0, 480, 2000); put(s, 1, 480, 1800); // левее колонны: автоотскок вперёд не упирается в неё
    var r = jumpTo(s, 0, 480, 1800);
    ok(has(r, 'charge')); eq(s.frogs[0].charge.join('+'), 'fire+ice');
    eq(s.frogs[1].hp, s.frogs[1].maxHp, 'ally not hurt');
    ok(r.continues && s.pending.kind === 'hop', 'bounce window');
    var x0 = s.frogs[0].x, y0 = s.frogs[0].y, ra = Sim.apply(s, { frog: 0, mode: 'end' }); // окно прошло — автоотскок
    ok(has(ra, 'autoHop') && !has(ra, 'reaction'), 'auto bounce does not fire the charge');
    near(Math.hypot(s.frogs[0].x - x0, s.frogs[0].y - y0), s.frogs[0].jump * T.allyHopMul, 3, 'auto bounce 25%');
    ok(s.frogs[0].y < y0, 'along the main jump direction (up)');
    eq(s.frogs[0].charge.join('+'), 'fire+ice', 'charge kept for next turn');
    Sim.apply(s, { frog: 2, mode: "skip" }); Sim.apply(s, { frog: 1, mode: "skip" }); Sim.apply(s, { frog: 3, mode: "skip" }); Sim.apply(s, { frog: 2, mode: "skip" }); // раунд 2 начинает бот
    var r2 = jumpTo(s, 0, s.frogs[0].x + 150, s.frogs[0].y);
    var re = ev(r2, 'reaction')[0];
    ok(re && re.key === 'fire+ice', 'steam veil from charge'); eq(s.frogs[0].charge, null);
    eq(s.veils.length, 1);
  });

  test('puddle of another element → reaction, puddle used until next round', function () {
    var s = sandbox(); var p = s.puddles[0]; p.active = true; // poison
    put(s, 0, p.x, p.y + 250);
    var r = jumpTo(s, 0, p.x, p.y);
    var re = ev(r, 'reaction')[0];
    ok(re && re.key === 'fire+poison', 'toxic detonation'); ok(!p.active, 'used');
    for (var i = 0; i < 3; i++) { var side = s.turnSide; Sim.apply(s, { frog: s.frogs.filter(function (x) { return x.side === side && Sim.canAct(s, x); })[0].id, mode: 'skip' }); }
    eq(s.round, 2); ok(p.active, 'back next round');
  });

  test('own-color puddle SURGES: area hit, stronger than a splash, puddle used', function () {
    var s = sandbox(); var p = s.puddles[1]; p.active = true; eq(p.el, 'fire'); p.x = 600; p.y = 1700;
    put(s, 0, 600, 1950); put(s, 2, 600 + 90, 1700); put(s, 3, 600, 1700 - T.shardRange); // один — в малой области, другой — там, где падает огненный осколок
    var hp2 = s.frogs[2].hp, hp3 = s.frogs[3].hp, r = jumpTo(s, 0, 600, 1700), sg = ev(r, 'surge')[0];
    ok(sg && !has(r, 'reaction'), 'surge, not a combo'); ok(!p.active, 'puddle used'); eq(sg.shards.length, 6, '6 shards');
    var d2 = hp2 - s.frogs[2].hp, splash = Math.round(T.fireDmg * T.elemSplash * (1 - FB.FROGS.bellows.def / 100));
    ok(d2 > splash * 1.8, 'area ' + d2 + ' vs splash ' + splash);
    ok(sg.shards.some(function (q) { return q.hit === 3; }) && s.frogs[3].hp < hp3, 'far enemy hit by a shard');
    eq(ev(r, 'hit').filter(function (e) { return e.id === 3 && e.src === 'shard'; }).length, 1, 'one shard per enemy');
  });

  test('pipes: every round each pipe pours a puddle; uncharged pipes pick a random element', function () {
    var s = Sim.createMatch(['spring', 'cling'], ['bellows', 'spur'], EL[0], EL[1], 3); Sim.startMatch(s);
    var sp = s.puddles.filter(function (p) { return !p.fixed; });
    eq(sp.length, 4, 'round 1'); sp.forEach(function (p) { ok(FB.ELEMENTS[p.el] && p.active); });
  });

  test('Drain Node: last element wins, puddle spawns next round, lasts one round', function () {
    var s = sandbox(); var n = s.nodes[2];
    put(s, 0, n.x + 200, n.y); put(s, 2, n.x + 200, n.y + 300);
    jumpTo(s, 0, n.x, n.y); eq(n.el, 'fire'); eq(n.side, 0);
    jumpTo(s, 2, n.x, n.y + 10); // бот перебивает
    eq(n.el, 'poison'); eq(n.side, 1);
    Sim.apply(s, { frog: 1, mode: 'skip' }); Sim.apply(s, { frog: 3, mode: 'skip' });
    eq(s.round, 2);
    var sp = s.puddles.filter(function (p) { return p.node === 2; });
    eq(s.puddles.filter(function (p) { return !p.fixed; }).length, 4, 'all pipes'); eq(sp.length, 1); eq(sp[0].el, 'poison'); near(sp[0].x, n.sx, 0.1); near(sp[0].r, T.puddleR, 0.1);
    eq(n.el, null, 'node reset');
    for (var i = 0; i < 4; i++) { var side = s.turnSide; Sim.apply(s, { frog: s.frogs.filter(function (x) { return x.side === side && Sim.canAct(s, x); })[0].id, mode: 'skip' }); }
    eq(s.round, 3); ok(!s.puddles.some(function (p) { return p.id === sp[0].id; }), 'gone after its round');
  });

  test('Reservoir Control: node puddles ×1.5', function () {
    var s = sandbox(['bellows', 'cling'], ['spring', 'spur']); var n = s.nodes[2];
    put(s, 0, n.x + 200, n.y); jumpTo(s, 0, n.x, n.y);
    for (var i = 0; i < 3; i++) { var side = s.turnSide; Sim.apply(s, { frog: s.frogs.filter(function (x) { return x.side === side && Sim.canAct(s, x); })[0].id, mode: 'skip' }); }
    var sp = s.puddles.filter(function (p) { return p.node === 2; })[0];
    near(sp.r, T.puddleR * T.reservoirMul, 0.1);
    ok(s.puddles.filter(function (p) { return !p.fixed && p.node !== 2; }).every(function (p) { return Math.abs(p.r - T.puddleR) < 0.1; }), 'uncharged pipes normal size');
  });

  test('Steam Veil hides frogs from the enemy view', function () {
    var s = sandbox(); s.frogs[0].charge = ['fire', 'ice'];
    jumpTo(s, 0, 600, 1850);
    eq(s.veils.length, 1); ok(Sim.hiddenFrom(s, 1, s.frogs[0]), 'hidden from bot'); ok(!Sim.hiddenFrom(s, 0, s.frogs[0]), 'visible to owner');
    var v = Sim.perceived(s, 1); ok(v.frogs[0].hidden && v.frogs[0].x < -1000);
    ok(Sim.dist(s.frogs[0].x, s.frogs[0].y, s.veils[0].x, s.veils[0].y) <= T.veilR, 'bounced inside veil');
  });

  test('Toxic Crystal becomes an obstacle and expires', function () {
    var s = sandbox(); s.frogs[0].el = 'ice'; s.frogs[0].charge = ['ice', 'poison'];
    jumpTo(s, 0, 600, 1800);
    eq(s.crystals.length, 1); eq(Sim.obstacles(s).length, 2);
    for (var i = 0; i < T.crystalTurns; i++) { var side = s.turnSide; var f = s.frogs.filter(function (x) { return x.side === side && Sim.canAct(s, x); })[0]; Sim.apply(s, { frog: f.id, mode: 'skip' }); }
    eq(s.crystals.length, 0);
  });

  test('Static Shell cuts the next hit and lasts until own activation', function () {
    var s = sandbox(); s.frogs[0].el = 'ice'; s.frogs[0].charge = ['ice', 'lightning'];
    jumpTo(s, 0, 600, 1900); eq(s.frogs[0].shell, 1);
    put(s, 2, 600, 1650);
    var hp = s.frogs[0].hp, r = jumpTo(s, 2, s.frogs[0].x, s.frogs[0].y);
    ok(has(r, 'shellBreak')); eq(s.frogs[0].shell, 0);
    var imp = ev(r, 'hit').filter(function (e) { return e.id === 0; })[0].dmg;
    ok(imp <= Math.ceil((T.impactBase + T.impactSpeed) * T.shellMul), 'reduced: ' + imp);
  });

  test('Neuroshock: damage on each of the next 2 jumps', function () {
    var s = sandbox(['spring', 'cling'], ['bellows', 'spur'], ['lightning', 'ice'], ['poison', 'fire']);
    s.frogs[0].charge = ['lightning', 'poison']; put(s, 2, 640, 1820);
    jumpTo(s, 0, 600, 1850); eq(s.frogs[2].neuro, T.neuroJumps);
    var hp = s.frogs[2].hp, r = jumpTo(s, 2, 640, 1500);
    ok(ev(r, 'hit').some(function (e) { return e.id === 2 && e.src === 'neuro'; })); eq(s.frogs[2].neuro, 1);
  });

  test('Plasma Orb flies along the landing direction and hits', function () {
    var s = sandbox(); s.frogs[0].el = 'fire'; s.frogs[0].charge = ["fire", "lightning"]; put(s, 0, 480, 2000); put(s, 2, 480, 1400);
    var r = jumpTo(s, 0, s.frogs[0].x, 1850);
    var o = ev(r, 'orb')[0]; ok(o, 'orb'); eq(o.hit, 2);
  });

  test('Reactive Grip: cling to WLZ, second jump is the same activation and stronger', function () {
    var s = sandbox(['bellows', 'spur'], ['spring', 'cling'], ['fire', 'ice'], ['poison', 'lightning']);
    var z = AR.wlz[0]; put(s, 0, 500, (z.y0 + z.y1) / 2);
    var r = jumpTo(s, 0, 160, (z.y0 + z.y1) / 2);
    ok(r.continues && has(r, 'grip'), 'gripped'); eq(s.pending.kind, 'grip'); eq(s.turnSide, 0);
    ok(!Sim.apply(s, { frog: 1, mode: 'jump', dx: 0, dy: -100 }).ok, 'other frog waits');
    ok(Sim.rangeFor(s, s.frogs[0], 'grip') > s.frogs[0].jump * 1.2);
    put(s, 2, s.frogs[0].x + 115, s.frogs[0].y); // колонна рядом — цель между стеной и колонной
    var r2 = jumpTo(s, 0, s.frogs[0].x + 115, s.frogs[0].y, "grip");
    ok(r2.ok && has(r2, 'impact')); eq(s.turnSide, 1, 'activation over');
  });

  test('ally bounce: perch, shove on jump-off; extra hop onto an enemy fires the charge, puddles stay', function () {
    var s = sandbox(['spring', 'bellows'], ['cling', 'spur']);
    put(s, 0, 480, 2050); put(s, 1, 480, 1850); put(s, 2, 760, 1700);
    var p = s.puddles[0]; p.active = true; p.x = 760; p.y = 1700; // враг стоит в луже Poison
    var y1 = s.frogs[1].y, r = jumpTo(s, 0, 480, 1850);
    eq(Sim.dist(s.frogs[0].x, s.frogs[0].y, s.frogs[1].x, s.frogs[1].y), 0, 'perched on the ally');
    var r2 = jumpTo(s, 0, 760, 1700, 'hop');
    ok(s.frogs[1].x < 480 - 20, 'ally shoved away when the frog jumps off');
    var rx = ev(r2, 'reaction')[0];
    ok(has(r2, 'impact'), 'hit the enemy'); ok(rx && rx.key === 'fire+ice', 'charged reaction fires on an enemy hit'); ok(p.active, 'puddle untouched');
    eq(s.frogs[0].charge, null, 'charge spent');
  });

  test('Living Catapult: landing on ally gives an extra hop', function () {
    var s = sandbox(['cling', 'spring'], ['bellows', 'spur']); put(s, 1, 600, 1800);
    var r = jumpTo(s, 0, 600, 1800);
    ok(r.continues && has(r, 'hopReady')); eq(s.pending.kind, 'hop');
    var r2 = jumpTo(s, 0, s.frogs[0].x + 100, s.frogs[0].y, 'hop');
    ok(r2.ok); eq(s.turnSide, 1);
  });

  test('Pinned Target: marked by one frog, smashed into a wall by the other', function () {
    var s = sandbox(['cling', 'spur'], ['bellows', 'spring']);
    put(s, 2, 430, 1900); put(s, 0, 430 + 200, 1900);
    jumpTo(s, 0, 430, 1900); eq(s.frogs[2].pinnedBy, 0, 'marked');
    Sim.apply(s, { frog: 3, mode: 'skip' });
    put(s, 2, 430, 1700); put(s, 1, 650, 1700);
    var r = jumpTo(s, 1, 430, 1700);
    var slam = ev(r, 'hit').filter(function (e) { return e.id === 2 && e.src === 'slam'; })[0];
    ok(slam, 'slammed'); eq(slam.dmg, T.slamDamage * T.pinnedSlamMul + T.pinnedBonus);
  });

  test('Diving Strike: longer flight → harder impact', function () {
    function hitWith(team) {
      var s = sandbox(team, ['bellows', 'cling']); put(s, 2, 600, 1660); put(s, 0, 600, 2000);
      var r = jumpTo(s, 0, 600, 1660); return ev(r, 'hit').filter(function (e) { return e.id === 2; })[0].dmg;
    }
    near(hitWith(['spring', 'spur']) / hitWith(['spring', 'cling']), 1 + 340 * T.divingPerUnit, 0.08, 'x(1 + air/1400)');
  });

  test('Reactive Grip: every wall bounce multiplies the hit by 1.3', function () {
    function hitWith(team) {
      var s = sandbox(team, ['spring', 'cling']); put(s, 0, 520, 2050);
      var probe = Sim.preview(s, { frog: 0, dx: -300, dy: 0 }), L = probe.state.frogs[0]; // куда приземлится после отскока
      put(s, 2, L.x, L.y);
      var r = Sim.apply(s, { frog: 0, dx: -300, dy: 0 });
      ok(has(r, 'bounce'), 'bounced'); return ev(r, 'hit').filter(function (e) { return e.id === 2 && e.src === 'impact'; })[0].dmg;
    }
    near(hitWith(['bellows', 'spur']) / hitWith(['bellows', 'cling']), T.gripImpactMul, 0.08);
  });

  test('round cap → decided by HP%', function () {
    var s = sandbox(); s.round = T.roundCap; s.frogs[2].hp = 50;
    for (var i = 0; i < 4; i++) { var side = s.turnSide; Sim.apply(s, { frog: s.frogs.filter(function (x) { return x.side === side && Sim.canAct(s, x); })[0].id, mode: 'skip' }); }
    eq(s.phase, 'over'); eq(s.winner, 0); eq(s.why, 'time');
  });

  test('preview equals the real result', function () {
    var s = sandbox(); put(s, 2, 640, 1720); s.puddles[2].active = true;
    var cmd = { frog: 0, dx: 30, dy: -290 };
    var p = Sim.preview(s, cmd), r = Sim.apply(s, cmd);
    eq(JSON.stringify(p.state.frogs.map(function (f) { return [Math.round(f.x), Math.round(f.y), f.hp]; })), JSON.stringify(s.frogs.map(function (f) { return [Math.round(f.x), Math.round(f.y), f.hp]; })));
  });

  test('determinism: same seed → same bot match', function () {
    var a = AI.playMatch(['spring', 'spur'], ['bellows', 'cling'], ['fire', 'ice'], ['poison', 'lightning'], 5, 40);
    var b = AI.playMatch(['spring', 'spur'], ['bellows', 'cling'], ['fire', 'ice'], ['poison', 'lightning'], 5, 40);
    eq(JSON.stringify(a.state.frogs), JSON.stringify(b.state.frogs));
  });

  // ---------- вывод ----------
  var nOk = results.filter(function (r) { return r[1]; }).length;
  out.innerHTML = '<p class="' + (nOk === results.length ? 'ok' : 'fail') + '">' + nOk + ' / ' + results.length + ' passed</p>' +
    results.map(function (r) { return '<div class="' + (r[1] ? 'ok' : 'fail') + '">' + (r[1] ? '✔ ' : '✘ ') + r[0] + (r[2] ? ' — ' + r[2] : '') + '</div>'; }).join('');
  window.TEST_RESULTS = { ok: nOk, total: results.length, fails: results.filter(function (r) { return !r[1]; }) };

  // ---------- автоплей ----------
  var KINDS = FB.FROG_ORDER, PAIRS = [];
  for (var i = 0; i < KINDS.length; i++) for (var j = i + 1; j < KINDS.length; j++) PAIRS.push([KINDS[i], KINDS[j]]);
  var ELS = FB.ELEMENT_ORDER;
  window.runMatrix = function (n, done) {
    var rows = [], jobs = [], seed = 100;
    PAIRS.forEach(function (a) { PAIRS.forEach(function (b) { if (a !== b) for (var k = 0; k < n; k++) jobs.push([a, b, seed++]); }); });
    var tot = { wins: {}, games: {}, rounds: [], reactions: {}, grips: 0, hops: 0, bounces: 0, sideWins: [0, 0], ko: 0 };
    var t0 = performance.now(), idx = 0;
    function step() {
      var until = performance.now() + 40;
      while (idx < jobs.length && performance.now() < until) {
        var jb = jobs[idx++], e0 = [ELS[jb[2] % 4], ELS[(jb[2] + 1) % 4]], e1 = [ELS[(jb[2] + 2) % 4], ELS[(jb[2] + 3) % 4]];
        var r = AI.playMatch(jb[0], jb[1], e0, e1, jb[2], 300), s = r.state;
        var ka = jb[0].join('+'), kb = jb[1].join('+');
        tot.games[ka] = (tot.games[ka] || 0) + 1; tot.games[kb] = (tot.games[kb] || 0) + 1;
        if (s.winner >= 0) { var wk = s.winner === 0 ? ka : kb; tot.wins[wk] = (tot.wins[wk] || 0) + 1; tot.sideWins[s.winner]++; } else tot.draws = (tot.draws || 0) + 1;
        tot.rounds.push(s.round); if (s.why === 'ko') tot.ko++;
        for (var rk in r.stats.reactions) tot.reactions[rk] = (tot.reactions[rk] || 0) + r.stats.reactions[rk];
        tot.grips += r.stats.grips; tot.hops += r.stats.hops; tot.bounces += r.stats.bounces;
      }
      document.getElementById('auto').textContent = 'running ' + idx + ' / ' + jobs.length + '…';
      if (idx < jobs.length) return setTimeout(step, 0);
      tot.rounds.sort(function (a, b) { return a - b; });
      var html = '<p>' + jobs.length + ' matches, ' + ((performance.now() - t0) / 1000).toFixed(1) + ' s. Median rounds: ' + tot.rounds[tot.rounds.length >> 1] +
        '. Side wins P/B: ' + tot.sideWins.join(' / ') + ', draws ' + (tot.draws || 0) + ', KO ' + tot.ko +  '. Grips ' + tot.grips + ', hops ' + tot.hops + ', bounces ' + tot.bounces + '.</p>';
      html += '<table><tr><th>Team (trait)</th><th>Games</th><th>Win %</th></tr>' + PAIRS.map(function (p) {
        var k = p.join('+'), t = FB.traitFor(p[0], p[1]);
        return '<tr><td>' + FB.FROGS[p[0]].name + ' + ' + FB.FROGS[p[1]].name + ' (' + t.name + ')</td><td>' + (tot.games[k] || 0) + '</td><td>' + Math.round(100 * (tot.wins[k] || 0) / (tot.games[k] || 1)) + '</td></tr>';
      }).join('') + '</table>';
      html += '<p>Reactions: ' + Object.keys(tot.reactions).map(function (k) { return k + ' ' + tot.reactions[k]; }).join(', ') + '</p>';
      document.getElementById('auto').innerHTML = html;
      window.MATRIX = tot;
      if (done) done(tot);
    }
    step();
  };
  document.getElementById('run').onclick = function () { runMatrix(+document.getElementById('n').value || 1); };
  if (/auto=1/.test(location.search)) runMatrix(1);
})();
