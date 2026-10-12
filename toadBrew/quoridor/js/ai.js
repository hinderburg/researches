// Бот Relay Alchemy (D-118): перебор активаций с цепочками эстафеты на копиях того, что видит его сторона.
// Оценка позиции: сколько не хватает до фляги врага одной активацией (с эстафетой через своих) у нас и у него,
// угроза победы, здоровье, заряды, строй (жабы в досягаемости друг друга), свой рельеф на подходах к своей фляге.
(function () {
  var Sim = FB.Sim, T = FB.T, AR = FB.ARENA, AI = {};
  FB.AI = AI;

  // Может ли жаба ходить в следующий ход своей стороны (база зарядит, пустая не может)
  function willAct(s, f) { return f.alive && !f.hidden && !f.frozen && (f.ch > 0 || (Sim.onBase(f) && (s.played[f.side] > 0 || f.ch > 0))); }
  // Сколько не хватит до фляги врага за одну активацию: эстафета через своих (каждая — один раз), последний прыжок — R
  function remaining(s, side) {
    var fk = AR.flasks[1 - side], R = T.jumpR * 0.95, best = 1e9, mates = s.frogs.filter(function (f) { return f.side === side && f.alive && !f.hidden; });
    mates.forEach(function (st) {
      if (!willAct(s, st)) return;
      var seen = {}, queue = [st]; seen[st.id] = 1;
      while (queue.length) {
        var n = queue.shift();
        best = Math.min(best, Sim.dist(n.x, n.y, fk.x, fk.y) - R - T.flaskR);
        mates.forEach(function (m) { if (!seen[m.id] && Sim.dist(n.x, n.y, m.x, m.y) <= R) { seen[m.id] = 1; queue.push(m); } });
      }
    });
    return best;
  }
  AI.remaining = remaining;

  function evalState(s, side) {
    if (s.phase === 'over') return s.winner === side ? 1e6 : (s.winner === -1 ? 0 : -1e6);
    var op = 1 - side, v = 0;
    var mine = remaining(s, side), theirs = remaining(s, op);
    if (theirs <= 0) v -= 3e5; // враг ходит следующим и дотягивается до нашей фляги
    if (mine <= 0) v += 2e4;
    v -= Math.max(0, mine) * T.botAdv;
    v += Math.min(1600, Math.max(0, theirs)) * T.botDef;
    var R = T.jumpR;
    s.frogs.forEach(function (f) {
      if (!f.alive || f.hidden) return;
      var my = f.side === side, k = my ? 1 : -1;
      v += k * 22 * f.hp / f.maxHp;
      v += k * (f.ch * 7 + (f.empty ? -4 : 0) - (f.frozen ? 22 : 0) - (f.chill ? 6 : 0)); // лёд и мороз (D-125)
      // жаба впереди без своих в досягаемости — легко срезать и некому её подхватить
      var near = s.frogs.some(function (o) { return o !== f && o.alive && o.side === f.side && Sim.dist(o.x, o.y, f.x, f.y) <= R; });
      v += k * (near ? 10 : 0);
      if (my && !Sim.onBase(f)) { // под ударом: враг, который будет ходить, достаёт прыжком
        var danger = s.frogs.some(function (e) { return e.alive && !e.hidden && e.side !== side && willAct(s, e) && Sim.dist(e.x, e.y, f.x, f.y) <= R + 20; });
        if (danger) v -= f.hp < 45 ? 34 : 9;
      }
    });
    // свой рельеф на подходах к своей фляге мешает врагу; пар прячет; колонны и барьеры — в нашей половине
    s.cells.forEach(function (cl, i) {
      if (!cl.t) return;
      var r = Math.floor(i / T.cols), ourHalf = side === 0 ? r >= T.rows / 2 - 1 : r <= T.rows / 2;
      var w = cl.t === 'jet' ? 4 : (ourHalf ? 7 : 3);
      v += (cl.side === side ? w : -w);
    });
    return v;
  }
  AI.evalState = evalState;

  // Кандидаты прыжка: на своих (эстафета), во врагов, к фляге, в клетки с другим элементом, веер направлений
  function candidates(s, f, P) {
    var out = [], R = Sim.rangeFor(s, f, 'jump'), side = f.side, fk = AR.flasks[1 - side];
    function add(tx, ty, tag) { var dx = tx - f.x, dy = ty - f.y, l = Math.hypot(dx, dy); if (l < 20) return; var k = Math.min(1, R / l); out.push({ frog: f.id, dx: dx * k, dy: dy * k, mode: 'jump', tag: tag }); }
    s.frogs.forEach(function (o) {
      if (!o.alive || o.id === f.id || o.hidden) return;
      if (Sim.dist(o.x, o.y, f.x, f.y) > R + o.r) return;
      if (o.side === side) { if (!(s.act && s.act.used[o.id])) add(o.x, o.y, 'relay'); }
      else add(o.x, o.y, 'hit');
    });
    add(fk.x, fk.y, 'flask');
    s.cells.forEach(function (cl, i) {
      var c = Sim.cellCenter(i), d = Sim.dist(c.x, c.y, f.x, f.y);
      if (d > R || d < 60 || Sim.cellBase(i) >= 0) return;
      if (cl.el && f.el && cl.el !== f.el && !cl.t) add(c.x, c.y, 'react');
      if (cl.t === 'jet' && cl.side === side) add(c.x, c.y, 'jet'); // своя струя — бросок вперёд (D-123)
    });
    var N = 16;
    for (var a = 0; a < N; a++) {
      var ang = a / N * Math.PI * 2;
      [0.55, 1].forEach(function (p) { out.push({ frog: f.id, dx: Math.cos(ang) * R * p, dy: Math.sin(ang) * R * p, mode: 'jump', tag: 'fan' }); });
    }
    if (P) out.push({ frog: f.id, mode: 'end', tag: 'auto' });
    return out;
  }

  // Оценка команды: применить на копии; если эстафета продолжается — лучшая из продолжений (до двух уровней)
  function evalCmd(view, cmd, side, depth) {
    var c = Sim.clone(view), r = Sim.apply(c, cmd, { noEnd: true });
    if (!r.ok) return null;
    if (c.pending && c.phase === 'play') {
      if (depth <= 0) return { cmd: cmd, v: evalState(c, side) - 5 };
      var f2 = c.frogs[c.pending.frog], list = candidates(c, f2, c.pending);
      var scored = list.map(function (c2) { var cc = Sim.clone(c), rr = Sim.apply(cc, c2, { noEnd: true }); return rr.ok ? { c2: c2, st: cc, v: cc.pending ? -1e9 : evalState(cc, side) } : null; }).filter(Boolean);
      var best = -1e9;
      scored.forEach(function (e) { if (e.v > best) best = e.v; });
      // продолжения, где снова эстафета, — глубже
      list.filter(function (c2) { return c2.tag === 'relay'; }).forEach(function (c2) { var e = evalCmd(c, c2, side, depth - 1); if (e && e.v > best) best = e.v; });
      return { cmd: cmd, v: best };
    }
    return { cmd: cmd, v: evalState(c, side) };
  }

  // Отзыв (§23): пустая жаба, только что опустевшая (ret = 2) и бесполезная как точка эстафеты, — домой сразу, на новый цикл
  function recallPick(s, side) {
    if (!s.frogs.some(function (f) { return f.side === side && Sim.canRecall(s, f); })) return null;
    if (s.turn - s.recallTurn[side] < 2 * T.botRecallEvery) return null; // не чаще раза в botRecallEvery своих ходов (D-121)
    // сравнение оценок: позиция после отзыва (жаба дома, начнёт новый бак) против позиции без него
    var base = evalState(s, side), pick = null, best = T.botRecallGain;
    s.frogs.forEach(function (f) {
      if (f.side !== side || !Sim.canRecall(s, f) || Sim.onBase(f)) return;
      if (!f.empty && f.ch > 0) return; // с зарядами в поле — пусть работает
      var c = Sim.clone(s); Sim.apply(c, { frog: f.id, mode: 'recall' });
      var g = evalState(c, side) + (f.empty ? 6 * (f.ret - 1) : 0) - base; // каждый сэкономленный ход ожидания — плюс
      if (g > best) { best = g; pick = f; }
    });
    return pick;
  }

  AI.choose = function (s, side, rnd) {
    rnd = rnd || Math.random;
    var view = Sim.perceived(s, side);
    if (!s.pending) { var rc = recallPick(view, side); if (rc) return { frog: rc.id, mode: 'recall' }; }
    var frogs = s.pending ? [view.frogs[s.pending.frog]] : view.frogs.filter(function (f) { return Sim.canAct(view, f); });
    if (!frogs.length) return { mode: 'skip' };
    var list = [];
    frogs.forEach(function (f) {
      candidates(view, f, s.pending).forEach(function (c) { var e = evalCmd(view, c, side, 0); if (e) list.push(e); });
    });
    list.sort(function (a, b) { return b.v - a.v; });
    // лучшие с продолжением эстафеты считаем глубже
    list.slice(0, T.botDepthTop).forEach(function (e) { if (e.cmd.tag === 'relay') { var d = evalCmd(view, e.cmd, side, 2); if (d) e.v = Math.max(e.v, d.v); } });
    list.sort(function (a, b) { return b.v - a.v; });
    var skip = Sim.clone(view); Sim.apply(skip, { mode: 'skip' }, { noEnd: true });
    if (!s.pending && list.length && evalState(skip, side) > list[0].v + 1) return { mode: 'skip' };
    if (!list.length) return s.pending ? { frog: s.pending.frog, mode: 'end' } : { mode: 'skip' };
    var top = list.filter(function (e) { return e.v >= list[0].v - 6; }).slice(0, T.botTopPick);
    var pick = top[Math.floor(rnd() * top.length)].cmd;
    if (pick.mode === 'jump') { // небольшая неточность руки
      var a = Math.atan2(pick.dy, pick.dx) + (rnd() - 0.5) * 2 * T.botAimNoiseDeg * Math.PI / 180, l = Math.hypot(pick.dx, pick.dy) * (1 + (rnd() - 0.5) * 2 * T.botAimNoisePow);
      if (pick.tag === 'flask' || pick.tag === 'relay' || pick.tag === 'hit' || pick.tag === 'jet') { a = Math.atan2(pick.dy, pick.dx); l = Math.hypot(pick.dx, pick.dy); } // в цель — точно
      pick = { frog: pick.frog, dx: Math.cos(a) * l, dy: Math.sin(a) * l, mode: 'jump', tag: pick.tag };
    }
    return pick;
  };

  // Бот против бота (тесты, автоплей): весь матч без анимации
  AI.playMatch = function (teamA, teamB, seed, maxCmds) {
    var s = Sim.createMatch(teamA, teamB, seed);
    Sim.startMatch(s);
    var r = seed % 233280, rnd = function () { r = (r * 9301 + 49297) % 233280; return r / 233280; };
    var stats = { relays: 0, reactions: 0, recalls: 0, deaths: 0, terrain: 0, jets: 0, cmds: 0 };
    for (var n = 0; n < (maxCmds || 600) && s.phase === 'play'; n++) {
      var cmd = AI.choose(s, s.turnSide, rnd), res = Sim.apply(s, cmd);
      if (!res.ok) res = Sim.apply(s, s.pending ? { frog: s.pending.frog, mode: 'end' } : { mode: 'skip' });
      stats.cmds++;
      res.events.forEach(function (e) {
        if (e.t === 'relay') stats.relays++; if (e.t === 'reaction') stats.reactions++; if (e.t === 'recall') stats.recalls++;
        if (e.t === 'death') stats.deaths++; if (e.t === 'cell' && e.tt) stats.terrain++; if (e.t === 'jet') stats.jets++;
      });
    }
    return { winner: s.winner, why: s.why, turns: s.turn, stats: stats };
  };
})();
