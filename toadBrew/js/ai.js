// Бот (D-047): перебор «жаба × цель» через ту же симуляцию на клоне + оценка позиции,
// для лучших кандидатов — лучший ответ соперника (его одна активация). Погрешность прицела — как у человека.
(function () {
  var T = FB.T, Sim = FB.Sim;
  var AI = {};
  FB.AI = AI;

  function threatCount(s, f) {
    var n = 0;
    s.frogs.forEach(function (e) {
      if (!e.alive || e.side === f.side) return;
      if (Sim.dist(e.x, e.y, f.x, f.y) <= Sim.rangeFor(s, e) + f.r) n++;
    });
    return n;
  }

  // Оценка позиции для стороны side (больше — лучше)
  AI.evaluate = function (s, side) {
    if (s.phase !== 'play') return s.matchWinner === side ? 100000 : -100000;
    var v = 0, c = Sim.center();
    s.frogs.forEach(function (f) {
      var sign = f.side === side ? 1 : -1;
      if (!f.alive) { v -= sign * 260; return; }
      var val = f.hp + 150;
      val -= f.poison * T.poisonTick * 0.9 + f.bleed * T.bleedTick * 0.9;
      if (f.chill) val -= 18;
      if (f.corroded) val -= 30;
      if (f.pit >= 0) val -= 25;
      if (f.envShield) val += 10;
      var z = Sim.zoneAt(s, f.x, f.y);
      if (z && z.side !== f.side) val -= z.type === 'ember' ? T.emberBurn : 22;
      if (s.safeR !== null && Sim.dist(f.x, f.y, c.x, c.y) > s.safeR - 20) val -= T.overloadDamage;
      // угрозы для той стороны, что ходит не сейчас
      if (f.side !== s.turnSide) val -= threatCount(s, f) * 12;
      v += sign * val;
    });
    // подготовленный Link — сильный следующий прыжок
    [0, 1].forEach(function (sd) {
      var L = s.links[sd]; if (!L) return;
      var a = s.frogs[L.a], b = s.frogs[L.b];
      if (a.alive && b.alive) v += (sd === side ? 1 : -1) * (Sim.activeFlask(a) !== Sim.activeFlask(b) ? 55 : 30);
    });
    return v;
  };

  function targetsFor(s, f, quick) {
    var range = Sim.rangeFor(s, f), out = [];
    function add(x, y) {
      var dx = x - f.x, dy = y - f.y, l = Math.sqrt(dx * dx + dy * dy);
      if (l < 4) return;
      if (l > range) { dx *= range / l; dy *= range / l; }
      out.push({ dx: dx, dy: dy });
    }
    s.frogs.forEach(function (e) {
      if (!e.alive || e.id === f.id) return;
      add(e.x, e.y);
      if (e.side !== f.side) { var d = Sim.norm(e.x - f.x, e.y - f.y); add(e.x - d.x * 12, e.y - d.y * 12); add(e.x + d.x * 14, e.y + d.y * 14); }
    });
    s.zones.forEach(function (z) { add(z.x, z.y); });
    s.objects.forEach(function (o) { if (o.state !== 'destroyed') add(o.x, o.y); });
    if (quick) return out;
    var n = 16, pows = [0.35, 0.65, 1];
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2;
      for (var j = 0; j < pows.length; j++) out.push({ dx: Math.cos(a) * range * pows[j], dy: Math.sin(a) * range * pows[j] });
    }
    return out;
  }

  function commands(s, quick) {
    var out = [];
    s.frogs.forEach(function (f) {
      if (!Sim.canAct(s, f)) return;
      targetsFor(s, f, quick).forEach(function (t) { out.push({ frog: f.id, dx: t.dx, dy: t.dy }); });
    });
    return out;
  }

  // Лучший ответ соперника: худшая для нас оценка после его активации
  function replyValue(st, side) {
    if (st.phase !== 'play' || st.turnSide === side) return AI.evaluate(st, side);
    var worst = AI.evaluate(st, side);
    commands(st, true).forEach(function (cmd) {
      var c = Sim.clone(st), r = Sim.apply(c, cmd);
      if (!r.ok) return;
      var v = AI.evaluate(c, side);
      if (v < worst) worst = v;
    });
    return worst;
  }

  AI.choose = function (s, rand) {
    var side = s.turnSide, cands = [];
    commands(s, false).forEach(function (cmd) {
      var c = Sim.clone(s), r = Sim.apply(c, cmd);
      if (r.ok) cands.push({ cmd: cmd, score: AI.evaluate(c, side), state: c });
    });
    if (!cands.length) {
      var f = s.frogs.filter(function (x) { return Sim.canAct(s, x); })[0];
      return f ? { cmd: { frog: f.id, mode: 'skip' }, score: 0 } : null;
    }
    cands.sort(function (a, b) { return b.score - a.score; });
    var deep = cands.slice(0, T.botDepthTop);
    deep.forEach(function (c) { c.score = replyValue(c.state, side) + c.score * 0.05; });
    deep.sort(function (a, b) { return b.score - a.score; });
    var top = deep.filter(function (c, i) { return i < T.botTopPick && c.score >= deep[0].score - 8; });
    var pick = top[Math.floor(rand() * top.length)];
    var cmd = { frog: pick.cmd.frog, dx: pick.cmd.dx, dy: pick.cmd.dy };
    if (T.botAimNoiseDeg > 0) { // погрешность прицела
      var ang = ((rand() + rand() - 1) * T.botAimNoiseDeg) * Math.PI / 180;
      var k = 1 + (rand() + rand() - 1) * T.botAimNoisePow, cs = Math.cos(ang), sn = Math.sin(ang);
      var nx = (cmd.dx * cs - cmd.dy * sn) * k, ny = (cmd.dx * sn + cmd.dy * cs) * k;
      cmd.dx = nx; cmd.dy = ny;
    }
    return { cmd: cmd, score: pick.score, considered: cands.length };
  };

  // Бот заправляет колбы: любимые жидкости жабы впереди, три разные (§9.3)
  AI.flasksFor = function (kind, rand) {
    var best = (FB.FROGS[kind].best || []).slice(), rest = FB.LIQUID_ORDER.filter(function (l) { return best.indexOf(l) < 0; });
    for (var i = rest.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)), t = rest[i]; rest[i] = rest[j]; rest[j] = t; }
    return best.concat(rest).slice(0, 3);
  };

  AI.makeRand = function (seed) {
    var st = seed >>> 0;
    return function () {
      var t = (st = (st + 0x6D2B79F5) | 0);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
})();
