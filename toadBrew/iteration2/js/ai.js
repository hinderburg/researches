// Бот TOADBREW v2: перебор прыжков на копиях того, что видит его сторона (Steam Veil прячет врагов и от бота).
// Оценка: урон и нокауты, заряды, узлы, отбросы к стенам; штраф за позицию под прямым ударом врага.
(function () {
  var Sim = FB.Sim, T = FB.T, AI = {};
  FB.AI = AI;

  function score(before, after, side, me) {
    var v = 0, trait = after.traits[side];
    after.frogs.forEach(function (f, i) {
      var b = before.frogs[i], lost = b.hp - f.hp;
      if (f.side === side) { v -= lost * 1.15; if (b.alive && !f.alive) v -= 70; }
      else if (!b.hidden) {
        v += lost * (1 + 0.6 * (1 - b.hp / b.maxHp)); if (b.alive && !f.alive) v += 80; if (f.poison > b.poison) v += 6; if (f.neuro > b.neuro) v += 8; if (f.chill > b.chill) v += 4; // урон по раненому ценнее — фокус огня пары (D-095)
        if (f.pinnedBy >= 0 && b.pinnedBy < 0) v += trait === 'pinned' ? 12 : 6;
        // Pinned Target: помеченный враг у стены/колонны — напарнику есть куда его вбить (D-095)
        if (trait === 'pinned' && f.alive && f.pinnedBy >= 0 && !Sim.insideArena(f.x, f.y, f.r + 120)) v += 6;
      }
      if (f.side === side && f.alive) {
        if (f.charge && !b.charge) v += 22; // заряд комбинации — ценный задел (D-095)
        if (f.charge) { var rr = Sim.rangeFor(after, f, 'jump'); if (after.frogs.some(function (e) { return e.alive && e.side !== side && !e.hidden && Sim.dist(e.x, e.y, f.x, f.y) < rr; })) v += 6; }
        if (f.shell && !b.shell) v += 10;
      }
    });
    var nodeW = trait === 'reservoir' ? 2 : 1;
    after.nodes.forEach(function (n, i) { var b = before.nodes[i]; if (n.side === side && (b.side !== side || b.el !== n.el)) v += 5 * nodeW; if (b.side !== side && b.side >= 0 && n.side === side) v += 4 * nodeW; });
    if (after.crystals.length > before.crystals.length) v += 6;
    if (after.veils.length > before.veils.length) v += 8;
    if (after.phase === 'over') v += after.winner === side ? 1000 : -1000;
    v -= danger(after, side, me);
    v += threat(after, side);
    v += teamwork(after, side);
    return v;
  }

  // Жабы держатся так, чтобы ещё не ходившая могла запрыгнуть на напарника за зарядом (D-095)
  function teamwork(s, side) {
    var mine = s.frogs.filter(function (f) { return f.alive && f.side === side; });
    if (mine.length < 2) return 0;
    var a = mine[0], b = mine[1], t = 0;
    [[a, b], [b, a]].forEach(function (p) {
      var j = p[0], k = p[1];
      if (!s.acted[j.id] && !j.charge && Sim.dist(j.x, j.y, k.x, k.y) < Sim.rangeFor(s, j, 'jump')) t += 4;
    });
    return t;
  }

  // Угроза: враги в досягаемости наших жаб (без этого бот не сближается — D-055)
  function threat(s, side) {
    var t = 0;
    s.frogs.forEach(function (f) {
      if (!f.alive || f.side !== side) return;
      var r = Sim.rangeFor(s, f, 'jump'), best = 1e9;
      s.frogs.forEach(function (e) { if (e.alive && e.side !== side && !e.hidden) best = Math.min(best, Sim.dist(e.x, e.y, f.x, f.y) - e.r); });
      if (best < r) t += 9; else if (best < 1e8) t -= (best - r) * 0.02;
    });
    return t;
  }

  // Насколько жаба me открыта: враги, которые ещё ходят в этом/следующем раунде и достают до неё прыжком
  function danger(s, side, me) {
    var f = s.frogs[me]; if (!f || !f.alive) return 0;
    var d = 0;
    s.frogs.forEach(function (e) {
      if (!e.alive || e.side === side || e.hidden) return;
      var r = Sim.rangeFor(s, e, 'jump'), dd = Sim.dist(e.x, e.y, f.x, f.y);
      if (dd < r + f.r) d += (T.impactBase + T.impactSpeed * Math.min(1, dd / e.jump)) * (1 - f.def / 100) * 0.3 * (s.acted[e.id] ? 0.6 : 1);
      // рядом со стеной отброс бьёт об неё
      if (dd < r + f.r && !Sim.insideArena(f.x, f.y, f.r + 70)) d += 3;
    });
    return d;
  }

  function candidates(s, f, mode, P) {
    var out = [], range = Sim.rangeFor(s, f, mode), N = 28, pows = [0.35, 0.65, 1.0];
    for (var i = 0; i < N; i++) {
      var a = i / N * Math.PI * 2 + (mode === 'grip' ? 0.05 : 0);
      for (var k = 0; k < pows.length; k++) out.push({ frog: f.id, dx: Math.sin(a) * range * pows[k], dy: -Math.cos(a) * range * pows[k], mode: mode });
    }
    function aimAt(x, y) { var dx = x - f.x, dy = y - f.y; if (Math.sqrt(dx * dx + dy * dy) <= range * 1.6) out.push({ frog: f.id, dx: dx, dy: dy, mode: mode }); }
    s.frogs.forEach(function (e) { if (e.alive && e.id !== f.id && !e.hidden) aimAt(e.x, e.y); });
    s.puddles.forEach(function (p) { if (p.active) aimAt(p.x, p.y); });
    s.nodes.forEach(function (n) { aimAt(n.x, n.y); });
    if (mode === 'grip') out.push({ frog: f.id, mode: 'drop' });
    if (mode === 'hop') out.push({ frog: f.id, mode: 'end' });
    if (mode === 'jump') out.push({ frog: f.id, mode: 'skip', pen: 4 });
    return out;
  }

  function evalCmd(view, cmd, side, depth) {
    var c = Sim.clone(view), r = Sim.apply(c, cmd, { noEnd: true });
    if (!r.ok) return null;
    var v;
    if (c.pending && c.phase === 'play' && depth > 0) { // зацеп или подскок: лучший следующий шаг
      var best = -1e9, f2 = c.frogs[c.pending.frog];
      candidates(c, f2, c.pending.kind, c.pending).forEach(function (c2, i) {
        if (i % 2 && c2.mode !== 'drop' && c2.mode !== 'end') return; // прореживаем
        var e = evalCmd(c, c2, side, depth - 1); if (e && e.v > best) best = e.v;
      });
      // продолжение оценивалось от c — добавляем то, что дал первый шаг
      v = best + score(view, c, side, cmd.frog) - score(c, c, side, cmd.frog);
    } else v = score(view, c, side, cmd.frog);
    if (cmd.pen) v -= cmd.pen;
    return { cmd: cmd, v: v, state: c.pending ? null : c };
  }

  // Связка с напарником (D-095): что сможет сделать вторая жаба после этого хода.
  // Ход соперника между ними не моделируем, поэтому выгода берётся с весом botTeamW.
  function partnerGain(e, side) {
    var c = e.state; if (!c || c.phase !== 'play') return 0;
    var mate = c.frogs.filter(function (f) { return f.alive && f.side === side && f.id !== e.cmd.frog && !c.acted[f.id]; })[0];
    if (!mate) return 0;
    var base = Sim.clone(c); base.acted[e.cmd.frog] = true; base.turnSide = side; base.pending = null;
    var best = 0;
    candidates(base, mate, 'jump').forEach(function (c2, i) {
      if (i % 3 && c2.mode !== 'skip' && i < 84) return; // прореживаем веер, прицельные варианты — все
      var e2 = evalCmd(base, c2, side, 1); if (e2) best = Math.max(best, e2.v - score(base, base, side, mate.id));
    });
    return best;
  }

  // Выбор хода для стороны side. Возвращает команду (с шумом прицела).
  AI.choose = function (s, side, rnd) {
    rnd = rnd || Math.random;
    var view = Sim.perceived(s, side), list = [];
    var frogs = s.pending ? [view.frogs[s.pending.frog]] : view.frogs.filter(function (f) { return Sim.canAct(view, f); });
    frogs.forEach(function (f) {
      var mode = s.pending ? s.pending.kind : 'jump';
      candidates(view, f, mode, s.pending).forEach(function (c) { var e = evalCmd(view, c, side, 1); if (e) list.push(e); });
    });
    if (!list.length) return null;
    list.sort(function (a, b) { return b.v - a.v; });
    var tw = T.botTeamWBySide ? T.botTeamWBySide[side] : T.botTeamW; // BySide — только для сравнения в автоплее
    if (!s.pending && tw) list.slice(0, T.botTeamTop).forEach(function (e) { e.v += tw * partnerGain(e, side); });
    list.sort(function (a, b) { return b.v - a.v; });
    var top = list.slice(0, Math.max(1, T.botTopPick)).filter(function (e) { return e.v >= list[0].v - 6; });
    var pick = top[Math.floor(rnd() * top.length)].cmd;
    return AI.noisy(pick, rnd);
  };

  AI.noisy = function (cmd, rnd) {
    if (cmd.dx === undefined) return cmd;
    var a = (rnd() * 2 - 1) * T.botAimNoiseDeg * Math.PI / 180, p = 1 + (rnd() * 2 - 1) * T.botAimNoisePow;
    var c = Math.cos(a), sn = Math.sin(a);
    return { frog: cmd.frog, mode: cmd.mode, dx: (cmd.dx * c - cmd.dy * sn) * p, dy: (cmd.dx * sn + cmd.dy * c) * p };
  };

  // Бот против бота до конца матча (для автоплея и тестов)
  AI.playMatch = function (teamA, teamB, elA, elB, seed, maxSteps) {
    var s = Sim.createMatch(teamA, teamB, elA, elB, seed), r = 0, rr = seed * 9301 + 49297;
    var rnd = function () { rr = (rr * 9301 + 49297) % 233280; return rr / 233280; };
    Sim.startMatch(s);
    var steps = 0, stats = { reactions: {}, grips: 0, hops: 0, bounces: 0, charges: 0, chargeFires: 0, pinSmash: 0 };
    while (s.phase === 'play' && steps++ < (maxSteps || 400)) {
      var cmd = AI.choose(s, s.turnSide, rnd);
      if (!cmd) break;
      var res = Sim.apply(s, cmd);
      if (!res.ok) { // запасной вариант: пропуск
        res = Sim.apply(s, { frog: cmd.frog, mode: s.pending ? (s.pending.kind === 'grip' ? 'drop' : 'end') : 'skip' });
        if (!res.ok) break;
      }
      res.events.forEach(function (e) {
        if (e.t === 'reaction') stats.reactions[e.name] = (stats.reactions[e.name] || 0) + 1;
        if (e.t === 'grip') stats.grips++; if (e.t === 'hopReady') stats.hops++; if (e.t === 'bounce') stats.bounces++;
        if (e.t === 'charge') stats.charges++; if (e.t === 'chargeUsed') stats.chargeFires++; if (e.t === 'label' && /PINNED/.test(e.text)) stats.pinSmash++;
      });
    }
    return { state: s, steps: steps, stats: stats };
  };
})();
