// Тесты правил Relay Alchemy 2 (GDD + правки 2026-10-13) и автоплей бот-против-бота. Открывать tests.html.
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
  function match(tA, tB, rules) { var s = Sim.createMatch(tA || ['spring', 'cling', 'bellows'], tB || ['cling', 'bellows', 'spur'], 7, rules); Sim.startMatch(s); return s; }
  function put(s, id, c, r) { var f = s.frogs[id]; f.x = cx(c); f.y = cy(r); }
  function jumpTo(s, id, x, y, mode) { var f = s.frogs[id]; return Sim.apply(s, { frog: id, dx: x - f.x, dy: y - f.y, mode: mode }); }
  function jumpCell(s, id, c, r) { return jumpTo(s, id, cx(c), cy(r)); }
  function ev(r, t) { return r.events.filter(function (e) { return e.t === t; }); }
  function has(r, t) { return ev(r, t).length > 0; }
  function cell(s, c, r) { return s.cells[r * T.cols + c]; }
  function skip(s) { return Sim.apply(s, { mode: 'skip' }); }

  test('start is symmetric: tanks empty, each side’s base pours 1 charge at the start of its first turn (no first-turn exception)', function () {
    var s = match();
    eq(s.frogs.length, 6); eq(s.turnSide, 0);
    s.frogs.forEach(function (f) { ok(Sim.onBase(f), 'frog ' + f.id + ' on base'); });
    [0, 1, 2].forEach(function (i) { eq(s.frogs[i].ch, 1); eq(s.frogs[i].el, s.seq[i]); });
    [3, 4, 5].forEach(function (i) { eq(s.frogs[i].ch, 0, 'enemy waits for its turn'); });
    skip(s);
    [3, 4, 5].forEach(function (i) { eq(s.frogs[i].ch, 1); eq(s.frogs[i].el, s.seq[i - 3], 'same sequence, own pointer'); });
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

  test('jump paints a neutral cell; one activation costs one charge; a frog out of elixir stays where it is (no auto-return)', function () {
    var s = match(), f = s.frogs[0];
    var r = jumpCell(s, 0, 1, 10);
    ok(r.ok); eq(cell(s, 1, 10).el, f.el); eq(f.ch, 0); eq(s.turnSide, 1);
    var x = f.x, y = f.y;
    for (var i = 0; i < 7; i++) skip(s);
    eq(s.turnSide, 0); eq(f.x, x); eq(f.y, y, 'still in the field'); ok(Sim.canAct(s, f), 'can still act');
  });

  test('dry hop: out of elixir the frog still jumps — half range, no element, no reaction, still hits and relays', function () {
    var s = match(); put(s, 0, 2, 10); s.frogs[0].ch = 0; cell(s, 2, 8).el = 'poison';
    ok(Sim.canAct(s, s.frogs[0])); ok(Math.abs(Sim.rangeFor(s, s.frogs[0], 'jump') - T.jumpR * T.dryMul) < 1, 'half range');
    var r = jumpCell(s, 0, 2, 7);
    ok(ev(r, 'act')[0].dry, 'dry'); ok(Math.abs(cy(10) - s.frogs[0].y - T.jumpR * T.dryMul) < 12, 'flew only half a jump'); ok(!has(r, 'reaction') && !has(r, 'cell'), 'no paint, no reaction'); eq(s.frogs[0].ch, 0);
    s = match(); put(s, 0, 2, 10); s.frogs[0].ch = 0; put(s, 4, 2, 9);
    var hp = s.frogs[4].hp; r = jumpTo(s, 0, s.frogs[4].x, s.frogs[4].y);
    ok(has(r, 'impact') && s.frogs[4].hp < hp, 'dry hop still hits');
  });

  test('«⟲ Home»: free, any number of frogs per turn, empties the tank; base pours a new tank next turn', function () {
    var s = match(); put(s, 0, 2, 9); put(s, 1, 3, 9);
    var r = Sim.apply(s, { frog: 0, mode: 'recall' });
    ok(r.ok && Sim.onBase(s.frogs[0])); eq(s.frogs[0].ch, 0); eq(s.frogs[0].el, null); eq(s.turnSide, 0, 'still my turn');
    ok(Sim.apply(s, { frog: 1, mode: 'recall' }).ok, 'a second one too');
    jumpCell(s, 2, 1, 10); skip(s);
    eq(s.frogs[0].ch, 1); eq(s.frogs[0].el, s.seq[3], 'next element of my pointer');
  });

  test('base charging: +1 per own turn up to 3', function () {
    var s = match();
    skip(s); skip(s); eq(s.frogs[1].ch, 2);
    skip(s); skip(s); eq(s.frogs[1].ch, 3);
    skip(s); skip(s); eq(s.frogs[1].ch, 3, 'tank max 3');
  });

  test('relay: landing on an ally continues the activation; relay contact paints nothing; one charge for the chain', function () {
    var s = match(); put(s, 1, 2, 10); put(s, 2, 2, 7); s.frogs[1].el = s.frogs[2].el = s.frogs[0].el; // тот же элемент — без комбо
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
    var e = s.frogs[4]; ok(Sim.onBase(e), 'at base'); eq(e.hp, e.maxHp); eq(e.ch, 1, 'tank emptied, base pours a new one at its turn start');
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
  test('Crystal Column (❄+☠): a wall — a normal jump never passes, a jump off an ally’s back flies over', function () {
    var x = reactWith('ice', 'poison'); eq(cell(x.s, 2, 10).t, 'column');
    ok(Sim.cellIdx(x.s.frogs[0].x, x.s.frogs[0].y) !== 10 * T.cols + 2, 'frog ejected');
    var s = x.s, f = s.frogs[1]; put(s, 1, 2, 12);
    var fl = Sim.flight(s, f, { x: f.x, y: f.y }, { x: 0, y: -1 }, T.jumpR, {});
    ok(fl.segs[0].hit === 'column', 'full-length jump bounces off the column');
    var fr = Sim.flight(s, f, { x: f.x, y: f.y }, { x: 0, y: -1 }, T.jumpR, { relay: true, h0: T.perchH });
    ok(!fr.segs[0].hit, 'relay jump flies over');
    for (var i = 0; i < 6; i++) skip(s); eq(cell(s, 2, 10).t, 'column', 'still there');
  });
  test('Crystal Column: can never close every path between the bases (Quoridor rule)', function () {
    var s = match(); [0, 1, 3, 4, 5].forEach(function (c) { cell(s, c, 7).t = 'column'; });
    s.frogs[0].el = 'ice'; cell(s, 2, 7).el = 'poison'; put(s, 0, 2, 9);
    var r = jumpCell(s, 0, 2, 7);
    ok(has(r, 'blocked'), 'last gap stays open'); ok(cell(s, 2, 7).t !== 'column'); ok(Sim.pathOpen(s));
  });
  test('Plasma Burst (🔥+⚡): damage + push on 3×3', function () {
    var x = reactWith('fire', 'lightning', function (s) { put(s, 4, 3, 9); });
    ok(x.s.frogs[4].hp < x.s.frogs[4].maxHp, 'enemy in 3×3 hit'); ok(ev(x.r, 'push').some(function (p) { return p.id === 4; }), 'pushed');
  });
  test('Wildfire (🔥+☠): damage + zone — burns enemies and terrain (columns too), leaves a burning field', function () {
    var x = reactWith('fire', 'poison', function (s) { put(s, 4, 3, 10); cell(s, 2, 9).t = 'column'; }), s = x.s;
    ok(s.frogs[4].hp < s.frogs[4].maxHp, 'burned'); eq(cell(s, 2, 9).t, 'blaze', 'column burned away'); eq(cell(s, 2, 10).t, 'blaze'); eq(cell(s, 1, 10).t, 'blaze');
    ok(ev(x.r, 'burn').some(function (e) { return e.id === 4; }), 'enemy turn starts in the fire — burns');
  });
  test('Ice Blast (🔥+❄): damage + stop — 3×3 hit, the nearest enemy frozen for its turn', function () {
    var x = reactWith('fire', 'ice', function (s) { put(s, 3, 3, 9); }), s = x.s;
    ok(s.frogs[3].hp < s.frogs[3].maxHp, 'hit'); ok(s.frogs[3].frozen, 'frozen'); ok(!Sim.canAct(s, s.frogs[3]), 'skips its turn');
    skip(s); ok(!s.frogs[3].frozen, 'thawed after its turn');
  });
  test('Toxic Vortex (⚡+☠): push + zone — pulls enemies toward the landing cell', function () {
    var x = reactWith('lightning', 'poison', function (s) { put(s, 4, 4, 9); put(s, 5, 0, 10); });
    var p = Sim.cellCenter(10 * T.cols + 2), e4 = x.s.frogs[4], e5 = x.s.frogs[5];
    ok(Sim.dist(e4.x, e4.y, p.x, p.y) < C * 1.2 && Sim.dist(e5.x, e5.y, p.x, p.y) < C * 1.2, 'pulled in');
    ok(Sim.dist(e4.x, e4.y, e5.x, e5.y) >= e4.r + e5.r, 'no overlap');
  });
  test('Ice Slide (⚡+❄): push + stop — slides throw your frog forward and an enemy back', function () {
    var x = reactWith('lightning', 'ice'), s = x.s; eq(cell(s, 2, 10).t, 'jet'); eq(cell(s, 2, 9).t, 'jet');
    put(s, 0, 5, 5); put(s, 3, 1, 7);
    var r = jumpCell(s, 3, 1, 10);
    ok(has(r, 'jet')); ok(s.frogs[3].y < cy(10) - C * 1.5, 'enemy thrown back');
    put(s, 1, 2, 12);
    r = jumpCell(s, 1, 2, 11);
    eq(ev(r, 'jet').length, 2, 'slides chain'); ok(Math.abs(s.frogs[1].y - cy(7)) < 30, 'thrown forward 4 cells');
  });
  test('Relay combo: an ally of another element always adds its element — no charge needed; a dry hop gets no combo', function () {
    var s = match(); put(s, 1, 2, 10); s.frogs[0].el = 'ice'; s.frogs[1].el = 'poison'; s.frogs[1].ch = 0;
    var r1 = jumpTo(s, 0, s.frogs[1].x, s.frogs[1].y);
    eq(ev(r1, 'relay')[0].combo, 'ice+poison');
    var rx = ev(jumpCell(s, 0, 2, 7), 'reaction')[0]; ok(rx && rx.key === 'ice+poison' && rx.combo, 'combo fired');
    s = match(); put(s, 1, 2, 10); put(s, 0, 2, 11); s.frogs[0].el = 'ice'; s.frogs[0].ch = 0; s.frogs[1].el = 'poison';
    eq(ev(jumpTo(s, 0, s.frogs[1].x, s.frogs[1].y), 'relay')[0].combo, null, 'dry — no combo');
  });

  test('perk Springjack: bounce off it — the next jump ×1.4', function () {
    var s = match(['cling', 'spring', 'bellows']); put(s, 1, 2, 10); s.frogs[1].el = s.frogs[0].el;
    jumpTo(s, 0, s.frogs[1].x, s.frogs[1].y);
    ok(Math.abs(Sim.rangeFor(s, s.frogs[0], 'jump') - T.jumpR * T.catapultMul) < 1, 'longer');
    var y0 = s.frogs[0].y; jumpTo(s, 0, s.frogs[0].x, s.frogs[0].y - 900);
    ok(y0 - s.frogs[0].y > T.jumpR * 1.2, 'flew further than a normal jump');
  });
  test('perk Clingfoot: bounce off it — it can’t be pushed until the enemy turn ends; attackers bounce off', function () {
    var s = match(['spring', 'cling', 'bellows'], ['cling', 'spur', 'spring']); put(s, 1, 2, 10); s.frogs[1].el = s.frogs[0].el;
    jumpTo(s, 0, s.frogs[1].x, s.frogs[1].y); jumpCell(s, 0, 4, 12);
    ok(s.frogs[1].anchor, 'anchored'); eq(s.turnSide, 1);
    put(s, 4, 2, 7); var x = s.frogs[1].x, r = jumpTo(s, 4, s.frogs[1].x, s.frogs[1].y);
    ok(has(r, 'anchored')); eq(s.frogs[1].x, x, 'not moved'); ok(Sim.dist(s.frogs[4].x, s.frogs[4].y, x, s.frogs[1].y) > 150, 'attacker bounced off');
    ok(!s.frogs[1].anchor, 'released at the start of its own turn');
  });
  test('perk Bellows: bounce off it — the reaction at the end is amplified', function () {
    var s = match(['spring', 'bellows', 'cling']); put(s, 1, 2, 10); s.frogs[0].el = 'fire'; s.frogs[1].el = 'fire'; cell(s, 2, 7).el = 'lightning';
    jumpTo(s, 0, s.frogs[1].x, s.frogs[1].y); var r = jumpCell(s, 0, 2, 7);
    ok(ev(r, 'reaction')[0].amp, 'amplified');
  });
  test('perk Spur Knight: bounce off it — the hit lands harder and strikes enemies next to the target', function () {
    function hitDmg(relay) {
      var s = match(['spring', 'spur', 'cling'], ['bellows', 'cling', 'spring']); put(s, 1, 2, 10); put(s, 3, 2, 8); put(s, 4, 3, 8); s.frogs[1].el = s.frogs[0].el;
      if (relay) jumpTo(s, 0, s.frogs[1].x, s.frogs[1].y); else { s.frogs[0].x = s.frogs[1].x + 60; s.frogs[0].y = s.frogs[1].y; }
      var r = jumpTo(s, 0, s.frogs[3].x, s.frogs[3].y);
      return { d: ev(r, 'hit').filter(function (e) { return e.id === 3; })[0].dmg, n: ev(r, 'hit').some(function (e) { return e.id === 4; }) };
    }
    var a = hitDmg(true), b = hitDmg(false); ok(a.d > b.d * 1.2, 'harder'); ok(a.n && !b.n, 'neighbour hit');
  });
  test('rules: perks off — no perk; economy off — tank always full, element fixed; no elements — nothing painted', function () {
    var s = match(['spring', 'cling', 'bellows'], null, { perks: false }); put(s, 1, 2, 10); s.frogs[1].el = s.frogs[0].el;
    jumpTo(s, 0, s.frogs[1].x, s.frogs[1].y); ok(Math.abs(Sim.rangeFor(s, s.frogs[0], 'jump') - T.jumpR) < 1, 'no catapult');
    s = match(null, null, { els: ['fire', 'ice'], economy: false });
    ok(s.frogs.every(function (f) { return f.ch === T.tank && (f.el === 'fire' || f.el === 'ice'); }), 'full tanks, two elements');
    var el = s.frogs[0].el; jumpCell(s, 0, 1, 10); eq(s.frogs[0].ch, T.tank); eq(s.frogs[0].el, el);
    s = match(null, null, { els: [], economy: false });
    var r = jumpCell(s, 0, 1, 10); ok(!has(r, 'cell'), 'no paint');
  });

  test('victory: any frog landing on the enemy flask wins; the flask zone grows late in the match', function () {
    var s = match(), fk = AR.flasks[1]; s.frogs[0].x = fk.x; s.frogs[0].y = fk.y + 300;
    var r = jumpTo(s, 0, fk.x, fk.y);
    ok(has(r, 'flask')); eq(s.phase, 'over'); eq(s.winner, 0);
    ok(Sim.flaskR(s, T.overloadTurn - 1) === T.flaskR && Sim.flaskR(s, T.overloadTurn + 4) > T.flaskR + 100, 'overload grows');
  });
  test('only elixir breaks the flask: a dry frog bounces off it; a dry frog never counts as a winning route', function () {
    var s = match(), fk = AR.flasks[1], f = s.frogs[0]; f.x = fk.x; f.y = fk.y + 150; f.ch = 0;
    var r = jumpTo(s, 0, fk.x, fk.y);
    ok(!has(r, 'flask') && s.phase === 'play', 'no win'); ok(Sim.dist(f.x, f.y, fk.x, fk.y) > T.flaskR + f.r, 'thrown off the zone');
    var s2 = match(); s2.frogs[3].x = AR.flasks[0].x; s2.frogs[3].y = AR.flasks[0].y - 250; s2.frogs[3].ch = 0;
    ok(!Sim.reach(s2, 1, false).win, 'dry is not a threat'); s2.frogs[3].ch = 1; ok(Sim.reach(s2, 1, false).win, 'with elixir it is');
  });
  test('springboard: from an ally’s back even a dry frog jumps full range', function () {
    var s = match(); put(s, 0, 2, 10); put(s, 1, 2, 9); s.frogs[0].ch = 0;
    var r = jumpTo(s, 0, s.frogs[1].x, s.frogs[1].y);
    ok(r.continues, 'relay'); ok(Math.abs(Sim.rangeFor(s, s.frogs[0], 'jump') - T.jumpR) < 1, 'full range from the back');
  });
  test('second-player lever (off by default): secondBonus frogs get +1 extra on side 1’s first turn', function () {
    var old = T.secondBonus; T.secondBonus = 1;
    try { var s = match(); skip(s); eq(s.frogs[3].ch, 2); eq(s.frogs[4].ch, 1); skip(s); skip(s); eq(s.frogs[4].ch, 2, 'only the first turn'); }
    finally { T.secondBonus = old; }
    var s2 = match(); skip(s2); eq(s2.frogs[3].ch, 1, 'default: symmetric');
  });
  test('reach / check: the enemy chain that can reach my flask next turn is detected', function () {
    var s = match(); put(s, 3, 3, 6); put(s, 4, 3, 9); s.frogs[3].ch = 1;
    ok(Sim.reach(s, 1, true).win, 'enemy can win next turn: relay 6 → 9 → flask');
    var s2 = match(); ok(!Sim.reach(s2, 1, true).win, 'not from the base');
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
  function runMatrix(n, rules) {
    var rows = [], all = [], seed = 100;
    TEAMS.forEach(function (a, i) {
      var w = 0, l = 0, d = 0;
      TEAMS.forEach(function (b, j) {
        if (i === j) return;
        for (var k = 0; k < n; k++) {
          var r = AI.playMatch(a, b, seed++, 600, rules); all.push(r);
          if (r.winner === 0) w++; else if (r.winner === 1) l++; else d++;
        }
      });
      rows.push({ team: a.join('+'), w: w, l: l, d: d });
    });
    var med = function (arr) { arr = arr.slice().sort(function (x, y) { return x - y; }); return arr[arr.length >> 1]; };
    var sum = function (k) { return all.reduce(function (s, r) { return s + r.stats[k]; }, 0); };
    var why = {}; all.forEach(function (r) { why[r.why] = (why[r.why] || 0) + 1; });
    var p0 = all.filter(function (r) { return r.winner === 0; }).length;
    var per = {}; ['relays', 'jets', 'reactions', 'recalls', 'deaths', 'terrain', 'dry', 'skips'].forEach(function (k) { per[k] = +(sum(k) / all.length).toFixed(1); });
    return { rows: rows, n: all.length, turns: med(all.map(function (r) { return r.turns; })), why: why, first: p0, perMatch: per };
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
