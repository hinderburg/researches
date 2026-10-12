// Тесты правил Relay Alchemy (GDD v3) и автоплей бот-против-бота. Открывать tests.html.
(function () {
  var Sim = FB.Sim, AI = FB.AI, T = FB.T, AR = FB.ARENA;
  var out = document.getElementById('tests'), results = [];

  function test(name, fn) {
    try { fn(); results.push([name, true]); }
    catch (e) { results.push([name, false, e.message]); console.error(name, e); }
  }
  function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + ' expected ' + b + ', got ' + a); }
  function ok(v, msg) { if (!v) throw new Error(msg || 'assert'); }

  var C = T.cell;
  function cx(c) { return AR.x0 + (c + 0.5) * C; }
  function cy(r) { return AR.y0 + (r + 0.5) * C; }
  function match(tA, tB) { var s = Sim.createMatch(tA || ['spring', 'cling', 'bellows'], tB || ['cling', 'bellows', 'spur'], 7); Sim.startMatch(s); return s; }
  function put(s, id, c, r) { var f = s.frogs[id]; f.x = cx(c); f.y = cy(r); }
  function jumpTo(s, id, x, y, mode) { var f = s.frogs[id]; return Sim.apply(s, { frog: id, dx: x - f.x, dy: y - f.y, mode: mode }); }
  function jumpCell(s, id, c, r) { return jumpTo(s, id, cx(c), cy(r)); }
  function ev(r, t) { return r.events.filter(function (e) { return e.t === t; }); }
  function has(r, t) { return ev(r, t).length > 0; }
  function cell(s, c, r) { return s.cells[r * T.cols + c]; }
  function skip(s) { return Sim.apply(s, { mode: 'skip' }); }

  test('start: 3 frogs per side on base, 1 charge each, elements from the shared sequence by slot', function () {
    var s = match();
    eq(s.frogs.length, 6); eq(s.turnSide, 0);
    s.frogs.forEach(function (f) { ok(Sim.onBase(f), 'frog ' + f.id + ' on base'); eq(f.ch, 1); });
    eq(s.frogs[0].el, s.seq[0]); eq(s.frogs[2].el, s.seq[2]); eq(s.frogs[3].el, s.seq[0], 'same sequence, own pointer'); eq(s.ptr[0], 3); eq(s.ptr[1], 3);
    ok(s.cells.every(function (cl) { return !cl.el && !cl.t; }), 'all cells neutral');
  });

  test('sequence: bags of 4 — every 4 in a row hold all elements', function () {
    var s = match();
    for (var i = 0; i + 4 <= 40; i += 4) eq(s.seq.slice(i, i + 4).sort().join(), FB.ELEMENT_ORDER.slice().sort().join());
  });

  test('a lone full tank cannot reach the enemy flask (3 jumps < distance)', function () {
    var p = AR.slots[0][0], fk = AR.flasks[1];
    ok(3 * T.jumpR * (1 + T.wallBonus) < Sim.dist(p.x, p.y, fk.x, fk.y) - T.flaskR, 'map long enough');
  });

  test('jump paints a neutral cell; one activation costs one charge; turn passes', function () {
    var s = match(), f = s.frogs[0];
    var r = jumpCell(s, 0, 1, 10);
    ok(r.ok); eq(cell(s, 1, 10).el, f.el); eq(f.ch, 0); eq(s.turnSide, 1);
    ok(f.empty, 'empty in the field'); eq(f.ret, T.emptyReturn);
  });

  test('relay: landing on an ally continues the activation; relay contact paints nothing; one charge for the chain', function () {
    var s = match(); put(s, 1, 2, 10); put(s, 2, 2, 7); s.frogs[1].ch = 0; s.frogs[2].ch = 0; // без эликсира — без комбо (D-127)
    var r1 = jumpTo(s, 0, s.frogs[1].x, s.frogs[1].y);
    ok(r1.continues && has(r1, 'relay')); eq(s.pending.kind, 'relay'); eq(s.frogs[0].ch, 1, 'not spent yet');
    var r2 = jumpTo(s, 0, s.frogs[2].x, s.frogs[2].y);
    ok(r2.continues, 'second relay');
    var r3 = jumpCell(s, 0, 2, 4);
    ok(r3.ok && !r3.continues); eq(s.frogs[0].ch, 0); eq(s.turnSide, 1);
    eq(s.cells.filter(function (cl) { return cl.el; }).length, 1, 'only the final cell painted'); eq(cell(s, 2, 4).el, s.frogs[0].el);
  });

  test('anti-loop: the same ally is a relay point only once per activation', function () {
    var s = match(); put(s, 1, 2, 10);
    jumpTo(s, 0, s.frogs[1].x, s.frogs[1].y);
    var r = jumpTo(s, 0, s.frogs[1].x + 1, s.frogs[1].y + 1); // снова на ту же жабу
    ok(r.ok && !r.continues, 'no second relay'); ok(Sim.dist(s.frogs[0].x, s.frogs[0].y, s.frogs[1].x, s.frogs[1].y) > s.frogs[0].r, 'lands beside');
  });

  test('enemy hit: damage + knockback, no relay, activation ends', function () {
    var s = match(); put(s, 4, 2, 10);
    var hp = s.frogs[4].hp, x0 = s.frogs[4].x, y0 = s.frogs[4].y, r = jumpTo(s, 0, x0, y0);
    ok(has(r, 'impact') && !r.continues); ok(s.frogs[4].hp < hp, 'damaged'); ok(Sim.dist(x0, y0, s.frogs[4].x, s.frogs[4].y) > 40, 'knocked back');
  });

  test('death: frog goes home with an empty tank and full HP', function () {
    var s = match(); put(s, 4, 2, 10); s.frogs[4].hp = 5;
    jumpTo(s, 0, s.frogs[4].x, s.frogs[4].y);
    var e = s.frogs[4]; ok(Sim.onBase(e), 'at base'); eq(e.ch, 0); eq(e.el, null); eq(e.hp, e.maxHp);
  });

  test('same element: no reaction; different element: reaction in that cell only', function () {
    var s = match(), f = s.frogs[0];
    cell(s, 1, 10).el = f.el;
    var r = jumpCell(s, 0, 1, 10); ok(!has(r, 'reaction')); eq(cell(s, 1, 10).el, f.el);
    s = match(); f = s.frogs[0];
    var other = FB.ELEMENT_ORDER.filter(function (e) { return e !== f.el; })[0];
    cell(s, 2, 10).el = other; cell(s, 1, 10).el = other;
    r = jumpCell(s, 0, 1, 10);
    eq(ev(r, 'reaction').length, 1); eq(ev(r, 'reaction')[0].key, FB.reactionKey(f.el, other)); eq(ev(r, 'reaction')[0].i, 10 * T.cols + 1);
  });

  function reactWith(a, b, setup) {
    var s = match(), f = s.frogs[0]; f.el = a; cell(s, 2, 10).el = b; put(s, 0, 2, 12); if (setup) setup(s);
    return { s: s, r: jumpCell(s, 0, 2, 10) };
  }
  test('Crystal Column (ice + poison): persistent pillar in the cell, frog pushed out, blocks a low jump', function () {
    var x = reactWith('ice', 'poison'); eq(cell(x.s, 2, 10).t, 'column');
    ok(Sim.cellIdx(x.s.frogs[0].x, x.s.frogs[0].y) !== 10 * T.cols + 2, 'frog ejected');
    var s = x.s; skip(s); // ход врага
    put(s, 1, 2, 12); s.frogs[1].ch = 1;
    var fl = Sim.flight(s, s.frogs[1], { x: s.frogs[1].x, y: s.frogs[1].y }, { x: 0, y: -1 }, 200, {});
    ok(fl.segs[0].hit === 'column', 'short jump bounces off the column');
    for (var i = 0; i < 6; i++) skip(s); eq(cell(s, 2, 10).t, 'column', 'still there');
  });
  test('Plasma Burst (fire + lightning): damage on 3×3 and a light knockback; terrain stays', function () {
    var x = reactWith('fire', 'lightning', function (s) { put(s, 4, 3, 9); cell(s, 1, 11).t = 'column'; });
    ok(x.s.frogs[4].hp < x.s.frogs[4].maxHp, 'enemy in 3×3 hit'); eq(cell(x.s, 1, 11).t, 'column', 'terrain stays');
  });
  test('Detonation (fire + poison): no damage, enemies thrown far, cells around cleansed (columns too)', function () {
    var x = reactWith('fire', 'poison', function (s) { put(s, 4, 3, 10); cell(s, 1, 11).t = 'column'; cell(s, 3, 9).el = 'ice'; });
    var e = x.s.frogs[4]; ok(!ev(x.r, 'hit').some(function (h) { return h.src !== 'slam'; }), 'no reaction damage (only a wall slam)'); ok(Math.abs(e.x - cx(3)) > 150, 'knocked far');
    ok(!cell(x.s, 1, 11).t && !cell(x.s, 3, 9).el, 'cleansed');
  });
  test('Toxic Vortex (lightning + poison): pulls enemies around toward the landing cell', function () {
    var x = reactWith('lightning', 'poison', function (s) { put(s, 4, 4, 9); put(s, 5, 0, 10); });
    var p = Sim.cellCenter(10 * T.cols + 2), e4 = x.s.frogs[4], e5 = x.s.frogs[5];
    ok(Sim.dist(e4.x, e4.y, p.x, p.y) < C * 1.2 && Sim.dist(e5.x, e5.y, p.x, p.y) < C * 1.2, 'pulled in');
    ok(Sim.dist(e4.x, e4.y, e5.x, e5.y) >= e4.r + e5.r, 'no overlap');
  });
  test('Steam Jet (fire + ice): plus of jets; landing launches own frog 2 cells forward and blows an enemy back', function () {
    var x = reactWith('fire', 'ice'), s = x.s; eq(cell(s, 2, 10).t, 'jet'); eq(cell(s, 2, 9).t, 'jet');
    put(s, 0, 5, 5); put(s, 3, 1, 7); s.frogs[3].ch = 1;
    var r = jumpCell(s, 3, 1, 10); // враг на струю стороны 0 — отброшен назад к своей базе
    ok(has(r, 'jet')); ok(s.frogs[3].y < cy(10) - C * 1.5, 'enemy blown back');
    put(s, 1, 2, 12); s.frogs[1].ch = 1;
    r = jumpCell(s, 1, 2, 11); // своя: на (2,11) → струя → (2,9) — тоже струя → (2,7)
    eq(ev(r, 'jet').length, 2, 'jets chain'); ok(Math.abs(s.frogs[1].y - cy(7)) < 30, 'launched forward 4 cells');
  });
  test('Frost Ward (ice + lightning): nearest enemy frozen (skips its turn); frost line slows an enemy landing in it', function () {
    var x = reactWith('ice', 'lightning', function (s) { put(s, 3, 3, 8); s.frogs[3].ch = 1; }), s = x.s;
    eq(cell(s, 1, 10).t, 'frost'); eq(cell(s, 2, 10).t, 'frost'); eq(cell(s, 3, 10).t, 'frost');
    ok(s.frogs[3].frozen, 'frozen'); ok(!Sim.canAct(s, s.frogs[3]), 'cannot act this turn');
    skip(s); ok(!s.frogs[3].frozen, 'thawed after its turn');
    put(s, 3, 3, 7); s.frogs[3].ch = 1; skip(s); // Clingfoot: у Bellows и Spur этой команды Breach — они стирают чужой рельеф
    eq(s.turnSide, 1); jumpCell(s, 3, 3, 10);
    ok(s.frogs[3].chill, 'slowed'); ok(Math.abs(Sim.rangeFor(s, s.frogs[3], 'jump') - T.jumpR * T.chillMul) < 1, 'short next jump');
  });
  test('Relay combo: ally with elixir of another element → the chain end fires their reaction', function () {
    var s = match(); put(s, 1, 2, 10); s.frogs[0].el = 'ice'; s.frogs[1].el = 'poison'; s.frogs[1].ch = 2;
    var r1 = jumpTo(s, 0, s.frogs[1].x, s.frogs[1].y);
    eq(ev(r1, 'relay')[0].combo, 'ice+poison'); eq(s.frogs[1].ch, 2, 'ally keeps its charges');
    var r2 = jumpCell(s, 0, 2, 7);
    var rx = ev(r2, 'reaction')[0]; ok(rx && rx.key === 'ice+poison' && rx.combo, 'combo fired on a neutral cell'); eq(cell(s, 2, 7).t, 'column');
    s = match(); put(s, 1, 2, 10); s.frogs[0].el = 'ice'; s.frogs[1].el = 'ice'; s.frogs[1].ch = 2;
    eq(ev(jumpTo(s, 0, s.frogs[1].x, s.frogs[1].y), 'relay')[0].combo, null, 'same element — no combo');
  });
  test('Recall: free, once per turn, empties the tank; new element next turn', function () {
    var s = match(); put(s, 0, 2, 9);
    var r = Sim.apply(s, { frog: 0, mode: 'recall' });
    ok(r.ok && Sim.onBase(s.frogs[0])); eq(s.frogs[0].ch, 0); eq(s.frogs[0].el, null); eq(s.turnSide, 0, 'still my turn');
    ok(!Sim.apply(s, { frog: 1, mode: 'recall' }).ok, 'only one per turn');
    jumpCell(s, 1, 1, 10); skip(s);
    eq(s.frogs[0].ch, 1); eq(s.frogs[0].el, s.seq[3], 'next element of my pointer');
  });

  test('base charging: +1 per own turn up to 3; empty frog auto-returns after 2 own turns', function () {
    var s = match();
    jumpCell(s, 0, 1, 10); // жаба 0 опустела в поле
    skip(s); eq(s.frogs[1].ch, 2); eq(s.frogs[0].ret, 1);
    skip(s); skip(s); ok(Sim.onBase(s.frogs[0]), 'auto-returned'); eq(s.frogs[0].ch, 1, 'starts a new cycle'); eq(s.frogs[1].ch, 3);
    skip(s); skip(s); eq(s.frogs[1].ch, 3, 'tank max 3');
  });

  test('victory: any frog landing on the enemy flask wins', function () {
    var s = match(), fk = AR.flasks[1]; s.frogs[0].x = fk.x; s.frogs[0].y = fk.y + 300;
    var r = jumpTo(s, 0, fk.x, fk.y);
    ok(has(r, 'flask')); eq(s.phase, 'over'); eq(s.winner, 0);
  });

  test('Living Catapult (spring+cling relay): the jump off the partner reaches ×1.4', function () {
    var s = match(['spring', 'cling', 'bellows']); put(s, 1, 2, 10); s.frogs[1].ch = 0;
    jumpTo(s, 0, s.frogs[1].x, s.frogs[1].y);
    ok(Math.abs(Sim.rangeFor(s, s.frogs[0], 'jump') - T.jumpR * T.catapultMul) < 1, 'longer relay jump');
    var y0 = s.frogs[0].y; jumpTo(s, 0, s.frogs[0].x, s.frogs[0].y - 900);
    ok(y0 - s.frogs[0].y > T.jumpR * 1.2, 'flew further than a normal jump');
  });
  test('Territory (cling+bellows relay): final landing paints the 4 neutral cells around', function () {
    var s = match(['cling', 'bellows', 'spur']); put(s, 1, 2, 10); s.frogs[1].ch = 0;
    jumpTo(s, 0, s.frogs[1].x, s.frogs[1].y); jumpCell(s, 0, 2, 7);
    eq(s.cells.filter(function (cl) { return cl.el; }).length, 5);
  });
  test('Momentum (spring+spur relay): harder hit after the relay', function () {
    function hitDmg(relay) {
      var s = match(['spring', 'spur', 'cling'], ['bellows', 'cling', 'spur']); put(s, 1, 2, 10); put(s, 3, 2, 8);
      if (relay) jumpTo(s, 0, s.frogs[1].x, s.frogs[1].y); else { s.frogs[0].x = s.frogs[1].x + 60; s.frogs[0].y = s.frogs[1].y; }
      var r = jumpTo(s, 0, s.frogs[3].x, s.frogs[3].y);
      return ev(r, 'hit').filter(function (e) { return e.id === 3; })[0].dmg;
    }
    ok(hitDmg(true) > hitDmg(false) * 1.2);
  });
  test('Anchor (cling+spur): not knocked back while the partner is near; the attacker bounces off', function () {
    var s = match(['spring', 'bellows', 'cling'], ['cling', 'spur', 'bellows']); put(s, 3, 2, 9); put(s, 4, 3, 9); put(s, 0, 2, 12);
    var x = s.frogs[3].x, y = s.frogs[3].y, r = jumpTo(s, 0, x, y);
    ok(has(r, 'anchored')); eq(s.frogs[3].x, x);
    ok(Sim.dist(s.frogs[0].x, s.frogs[0].y, x, y) > 150, 'attacker bounced away');
  });
  test('Breach (bellows+spur): smashes through a column; a direct hit also strikes enemies next to the target', function () {
    var s = match(['bellows', 'spur', 'cling']); put(s, 0, 2, 12); cell(s, 2, 11).t = 'column';
    var r = jumpCell(s, 0, 2, 10);
    ok(has(r, 'smash')); ok(!cell(s, 2, 11).t);
    s = match(['bellows', 'spur', 'cling'], ['spring', 'cling', 'bellows']); put(s, 1, 2, 12); put(s, 3, 2, 10); put(s, 4, 3, 10);
    var hp4 = s.frogs[4].hp; jumpTo(s, 1, s.frogs[3].x, s.frogs[3].y);
    ok(s.frogs[4].hp < hp4, 'neighbour hit too');
  });

  test('preview equals the real result', function () {
    var s = match(); put(s, 4, 2, 10);
    var cmd = { frog: 0, dx: s.frogs[4].x - s.frogs[0].x, dy: s.frogs[4].y - s.frogs[0].y };
    var pv = Sim.preview(s, cmd, 0), r = Sim.apply(s, cmd);
    eq(JSON.stringify(ev(pv, 'hit')), JSON.stringify(ev(r, 'hit')));
  });

  test('determinism: same seed → same bot match', function () {
    var a = AI.playMatch(['spring', 'cling', 'bellows'], ['cling', 'bellows', 'spur'], 11, 120), b = AI.playMatch(['spring', 'cling', 'bellows'], ['cling', 'bellows', 'spur'], 11, 120);
    eq(JSON.stringify(a), JSON.stringify(b));
  });

  out.innerHTML = '<p><b>' + results.filter(function (r) { return r[1]; }).length + ' / ' + results.length + ' passed</b></p>' +
    results.map(function (r) { return '<div class="' + (r[1] ? 'ok' : 'fail') + '">' + (r[1] ? '✔' : '✘') + ' ' + r[0] + (r[2] ? ' — ' + r[2] : '') + '</div>'; }).join('');
  window.__testResults = results;

  // ---------- автоплей ----------
  var TEAMS = [['spring', 'cling', 'bellows'], ['spring', 'cling', 'spur'], ['spring', 'bellows', 'spur'], ['cling', 'bellows', 'spur']];
  function runMatrix(n) {
    var rows = [], all = [], seed = 100;
    TEAMS.forEach(function (a, i) {
      var w = 0, l = 0, d = 0;
      TEAMS.forEach(function (b, j) {
        if (i === j) return;
        for (var k = 0; k < n; k++) {
          var r = AI.playMatch(a, b, seed++); all.push(r);
          if (r.winner === 0) w++; else if (r.winner === 1) l++; else d++;
        }
      });
      rows.push({ team: a.join('+'), w: w, l: l, d: d });
    });
    var med = function (arr) { arr = arr.slice().sort(function (x, y) { return x - y; }); return arr[arr.length >> 1]; };
    var sum = function (k) { return all.reduce(function (s, r) { return s + r.stats[k]; }, 0); };
    var why = {}; all.forEach(function (r) { why[r.why] = (why[r.why] || 0) + 1; });
    var p0 = all.filter(function (r) { return r.winner === 0; }).length;
    return { rows: rows, n: all.length, turns: med(all.map(function (r) { return r.turns; })), why: why, first: p0,
      perMatch: { relays: sum('relays') / all.length, jets: sum('jets') / all.length, reactions: sum('reactions') / all.length, recalls: sum('recalls') / all.length, deaths: sum('deaths') / all.length, terrain: sum('terrain') / all.length } };
  }
  window.runMatrix = runMatrix;
  document.getElementById('run').onclick = function () {
    var n = +document.getElementById('n').value || 1, box = document.getElementById('auto');
    box.textContent = 'running…';
    setTimeout(function () {
      var t0 = performance.now(), m = runMatrix(n);
      box.innerHTML = '<table><tr><th>team</th><th>W</th><th>L</th><th>D</th><th>win %</th></tr>' + m.rows.map(function (r) { return '<tr><td>' + r.team + '</td><td>' + r.w + '</td><td>' + r.l + '</td><td>' + r.d + '</td><td>' + Math.round(100 * r.w / (r.w + r.l + r.d)) + '</td></tr>'; }).join('') + '</table>' +
        '<pre>' + JSON.stringify({ matches: m.n, medianTurns: m.turns, why: m.why, firstPlayerWins: m.first, perMatch: m.perMatch, ms: Math.round(performance.now() - t0) }, null, 1) + '</pre>';
    }, 30);
  };
})();
