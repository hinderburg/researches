// Бот (D-012): перебор кандидатов «жаба × режим × цель» через ту же симуляцию на клоне + оценка позиции.
// Выбор среди лучших с небольшим разбросом, затем погрешность прицела — бот иногда промахивается, как человек.
(function () {
  var T = FB.T, Sim = FB.Sim;
  var AI = {};
  FB.AI = AI;

  function threatCount(s, f) {
    var n = 0;
    s.frogs.forEach(function (e) {
      if (!e.alive || e.side === f.side) return;
      var reach = e.inWater ? e.dash : e.range;
      if (Sim.dist(e.x, e.y, f.x, f.y) <= reach + f.r) n++;
    });
    return n;
  }
  function canReach(s, f) {
    var reach = f.inWater ? f.dash : f.range;
    return s.frogs.some(function (e) { return e.alive && e.side !== f.side && Sim.dist(e.x, e.y, f.x, f.y) <= reach + e.r; });
  }

  // Оценка позиции для стороны side (больше — лучше)
  AI.evaluate = function (s, side) {
    if (s.phase !== 'play' && s.roundWinner !== null && s.roundWinner !== undefined) {
      if (s.roundWinner === side) return 10000;
      if (s.roundWinner === 1 - side) return -10000;
    }
    var v = 0;
    s.frogs.forEach(function (f) {
      var sign = f.side === side ? 1 : -1;
      if (!f.alive) { v -= sign * 90; return; }
      var val = f.hp + 60;
      val -= f.poison * T.poisonDamage * 0.8;
      val -= f.bleed * T.bleedDamage * f.bleedTurns * 0.8;
      val += f.shield * 0.5;
      val += f.st * 3;
      if (f.inWater) val -= T.botWater + (f.st === 0 ? 12 : 0);
      else if (f.pad >= 0) { var p = s.pads[f.pad], w = p.wear / p.cap; val -= w * w * 22; }
      if (f.trapped > 0) val -= 15;
      // Зависит от очереди: у ходящей стороны «достаю врага» — почти удар, у ждущей «меня достают» — почти урон.
      // Без этого осторожный бот не идёт на сближение и раунды упираются в лимит ходов (D-012).
      if (s.phase === 'play') {
        if (f.side === s.turnSide) { if (canReach(s, f) && f.trapped <= 0) val += T.botReach * f.dmg / 10; }
        else val -= threatCount(s, f) * T.botThreat * (f.inWater ? T.waterVulnerability : 1);
      }
      v += sign * val;
    });
    return v;
  };

  function targetsFor(s, f, mode, quick) {
    var kind = Sim.aimKind(s, f, mode);
    if (mode === 'rest' || kind === 'radius') return [{ dx: 0, dy: f.side === 0 ? -1 : 1 }];
    var range = Sim.rangeFor(s, f, mode), out = [];
    function add(x, y) {
      var dx = x - f.x, dy = y - f.y, l = Math.sqrt(dx * dx + dy * dy);
      if (l < 4) return;
      if (l > range) { dx *= range / l; dy *= range / l; }
      out.push({ dx: dx, dy: dy });
    }
    var ability = mode === 'ability' ? FB.FROGS[f.kind].ability : null;
    s.frogs.forEach(function (e) {
      if (!e.alive || e.id === f.id) return;
      if (e.side === f.side && ability !== 'bubble') return;
      add(e.x, e.y);
      if (kind === 'arc' && e.side !== f.side) { // чуть недолёт/перелёт — разные отскоки
        var d = Sim.norm(e.x - f.x, e.y - f.y);
        add(e.x - d.x * 10, e.y - d.y * 10);
        add(e.x + d.x * 12, e.y + d.y * 12);
      }
    });
    if (mode === 'move' || mode === 'hop' || ability === 'hop' || ability === 'slam') {
      s.pads.forEach(function (p) { if (p.state === 'stable') add(p.x, p.y); });
    }
    if (quick) return out;
    var n = 16, pows = [0.35, 0.65, 1];
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2;
      for (var j = 0; j < pows.length; j++) out.push({ dx: Math.cos(a) * range * pows[j], dy: Math.sin(a) * range * pows[j] });
    }
    return out;
  }

  function modesFor(s, f) {
    if (s.pendingHop !== null) return s.pendingHop === f.id ? ['hop', 'rest'] : [];
    var m = ['move', 'rest'];
    if (Sim.abilityAvailable(s, f)) m.push('ability');
    return m;
  }

  // Ход целиком (Double Hop — с жадным вторым прыжком) → { score, state }
  function playCmd(s, cmd, side) {
    var c = Sim.clone(s);
    var r = Sim.apply(c, cmd);
    if (!r.ok) return null;
    if (r.continues) {
      var f = c.frogs[cmd.frog], hopT = targetsFor(c, f, 'hop', true);
      var cr = Sim.clone(c); Sim.apply(cr, { frog: f.id, mode: 'rest' });
      var best = { score: AI.evaluate(cr, side), state: cr };
      for (var i = 0; i < hopT.length; i++) {
        var c2 = Sim.clone(c), r2 = Sim.apply(c2, { frog: f.id, mode: 'hop', dx: hopT[i].dx, dy: hopT[i].dy });
        if (r2.ok) { var v = AI.evaluate(c2, side); if (v > best.score) best = { score: v, state: c2 }; }
      }
      return best;
    }
    return { score: AI.evaluate(c, side), state: c };
  }

  function commands(s, quick) {
    var out = [];
    s.frogs.forEach(function (f) {
      if (!Sim.canAct(s, f)) return;
      modesFor(s, f).forEach(function (mode) {
        targetsFor(s, f, mode, quick).forEach(function (t) { out.push({ frog: f.id, mode: mode, dx: t.dx, dy: t.dy }); });
      });
    });
    return out;
  }

  // Лучший ответ соперника (полуход 2): худшая для нас оценка
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

  // Бот (D-012): полуход 1 — все кандидаты, полуход 2 — ответ соперника для T.botDepthTop лучших
  AI.choose = function (s, rand) {
    var side = s.turnSide, cands = [];
    commands(s, false).forEach(function (cmd) {
      var r = playCmd(s, cmd, side);
      if (r) cands.push({ cmd: cmd, score: r.score, state: r.state });
    });
    if (!cands.length) return null;
    cands.sort(function (a, b) { return b.score - a.score; });
    var deep = cands.slice(0, T.botDepthTop);
    if (T.botDepthTop > 0) {
      deep.forEach(function (c) { c.score = replyValue(c.state, side) + c.score * 0.05; });
      deep.sort(function (a, b) { return b.score - a.score; });
      cands = deep;
    }
    // Разброс: из топ-N с близкой оценкой (не хуже лучшей на 6)
    var top = cands.filter(function (c, i) { return i < T.botTopPick && c.score >= cands[0].score - 6; });
    var pick = top[Math.floor(rand() * top.length)];
    var cmd = { frog: pick.cmd.frog, mode: pick.cmd.mode, dx: pick.cmd.dx, dy: pick.cmd.dy };
    // Погрешность прицела
    if (T.botAimNoiseDeg > 0 && (cmd.mode !== 'rest')) {
      var ang = ((rand() + rand() - 1) * T.botAimNoiseDeg) * Math.PI / 180;
      var k = 1 + (rand() + rand() - 1) * T.botAimNoisePow;
      var cs = Math.cos(ang), sn = Math.sin(ang);
      var nx = (cmd.dx * cs - cmd.dy * sn) * k, ny = (cmd.dx * sn + cmd.dy * cs) * k;
      cmd.dx = nx; cmd.dy = ny;
    }
    return { cmd: cmd, score: pick.score, considered: cands.length };
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
