// Симуляция TOADBREW, итерация 2 (GDD v2, D-049). Без DOM и WebGL: состояние — простой объект, ход — команда.
// apply(state, cmd) меняет состояние и возвращает события для анимации. Случайность — только от сида.
(function () {
  var T = FB.T, AR = FB.ARENA;
  var Sim = {};
  FB.Sim = Sim;

  // ---------- утилиты ----------
  function rng(s) {
    var t = (s.rng = (s.rng + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function dist(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }
  function norm(x, y) { var l = Math.sqrt(x * x + y * y); return l > 1e-6 ? { x: x / l, y: y / l, l: l } : { x: 0, y: 0, l: 0 }; }
  Sim.dist = dist; Sim.norm = norm;
  Sim.clone = function (s) { return JSON.parse(JSON.stringify(s)); };
  function tierMul(f) { return 1 + T.tierStep * ((f.tier || 1) - 1); }

  // ---------- геометрия арены ----------
  var EDGES = [];
  (function () {
    var P = AR.floor;
    for (var i = 0; i < P.length; i++) {
      var a = P[i], b = P[(i + 1) % P.length], d = norm(b.x - a.x, b.y - a.y);
      // внутренняя нормаль: многоугольник по часовой стрелке в экранных координатах (y вниз) → нормаль (-dy, dx)
      EDGES.push({ a: a, b: b, d: d, n: { x: -d.y, y: d.x }, wlz: null });
    }
    // Wall Launch Zones лежат на боковых стенах
    AR.wlz.forEach(function (z, k) {
      EDGES.forEach(function (e) {
        var vertical = Math.abs(e.d.x) < 0.01, left = e.a.x < FB.T.IMG_W * FB.K / 2;
        if (!vertical || (z.side === 'L') !== left) return;
        var y0 = Math.min(e.a.y, e.b.y), y1 = Math.max(e.a.y, e.b.y);
        if (z.y0 >= y0 && z.y1 <= y1) { e.wlzs = e.wlzs || []; e.wlzs.push({ id: k, y0: z.y0, y1: z.y1 }); }
      });
    });
  })();
  Sim.EDGES = EDGES;

  function insidePoly(x, y) {
    var P = AR.floor, c = false;
    for (var i = 0, j = P.length - 1; i < P.length; j = i++) {
      if (((P[i].y > y) !== (P[j].y > y)) && (x < (P[j].x - P[i].x) * (y - P[i].y) / (P[j].y - P[i].y) + P[i].x)) c = !c;
    }
    return c;
  }
  function segDist(px, py, e) {
    var vx = e.b.x - e.a.x, vy = e.b.y - e.a.y, L2 = vx * vx + vy * vy, t = Math.max(0, Math.min(1, ((px - e.a.x) * vx + (py - e.a.y) * vy) / L2));
    return { d: dist(px, py, e.a.x + vx * t, e.a.y + vy * t), t: t };
  }
  function nearestEdge(x, y) {
    var best = null, bd = 1e9;
    EDGES.forEach(function (e) { var r = segDist(x, y, e); if (r.d < bd) { bd = r.d; best = { e: e, d: r.d }; } });
    return best;
  }
  function wallClear(x, y, r) { return insidePoly(x, y) && nearestEdge(x, y).d >= r; }
  Sim.insideArena = function (x, y, r) { return wallClear(x, y, r || 0); };

  // Препятствия средней высоты: колонна (AABB) и кристаллы (повёрнутые прямоугольники)
  function npcOut(s) { var n = s.frogs && s.frogs[s.npcId]; return !!(n && !n.caged); }
  Sim.npcOut = npcOut;
  function obstacles(s) {
    var C = AR.column, list = npcOut(s) ? [] : [{ kind: 'column', cx: (C.x0 + C.x1) / 2, cy: (C.y0 + C.y1) / 2, ux: 1, uy: 0, hl: (C.x1 - C.x0) / 2, ht: (C.y1 - C.y0) / 2 }]; // после побега колонна — низкая площадка, не препятствие (D-105)
    (s.crystals || []).forEach(function (c) { list.push({ kind: 'crystal', id: c.id, cx: c.cx, cy: c.cy, ux: c.ux, uy: c.uy, hl: c.hl, ht: c.ht }); });
    return list;
  }
  Sim.obstacles = obstacles;
  // Точка внутри прямоугольника, расширенного на m; нормаль — по стороне наименьшего проникновения
  function inObst(o, x, y, m) {
    var dx = x - o.cx, dy = y - o.cy, lu = dx * o.ux + dy * o.uy, lv = -dx * o.uy + dy * o.ux;
    var pu = o.hl + m - Math.abs(lu), pv = o.ht + m - Math.abs(lv);
    if (pu <= 0 || pv <= 0) return null;
    if (pu < pv) return { n: { x: o.ux * Math.sign(lu || 1), y: o.uy * Math.sign(lu || 1) }, pen: pu };
    return { n: { x: -o.uy * Math.sign(lv || 1), y: o.ux * Math.sign(lv || 1) }, pen: pv };
  }
  function reflect(d, n) { var k = 2 * (d.x * n.x + d.y * n.y); return norm(d.x - k * n.x, d.y - k * n.y); }

  Sim.arcHeight = function (len) { return T.arcBase + len * T.arcPerLen; };
  // Высота на доле пути u: парабола (как под гравитацией), старт с высоты h0 (отскок от стены, зацеп)
  Sim.arcAt = function (h0, H, u) { return h0 * (1 - u) + 4 * H * u * (1 - u); };

  // Полёт с отскоками (§21, §23): шагами по дуге; стены выше любой дуги, колонна/кристалл — только низкой.
  // opts.grip — команда может зацепиться за Wall Launch Zone (Reactive Grip, §22)
  Sim.flight = function (s, f, from, dir, len, opts) {
    opts = opts || {};
    var segs = [], pos = { x: from.x, y: from.y }, d = norm(dir.x, dir.y), remaining = len, h0 = opts.h0 || 0, air = 0, bounces = 0, step = 6;
    var obs = obstacles(s).filter(function (o) { return !inObst(o, from.x, from.y, f.r * 0.75); }); // стоит внутри — может выбраться (D-096)
    var npcF = npcOut(s) && s.frogs[s.npcId].alive ? s.frogs[s.npcId] : null;
    while (true) {
      var segLen = Math.max(1, remaining), H = Sim.arcHeight(segLen), hit = null, t;
      // прыжок на NPC, стоящего на колонне: на верх колонны можно запрыгнуть (D-103)
      var ex = pos.x + d.x * segLen, ey = pos.y + d.y * segLen, ontoCol = npcF && dist(ex, ey, npcF.x, npcF.y) <= npcF.r + f.r + T.contactAssist;
      for (t = step; t <= segLen + 0.01; t += step) {
        var tt = Math.min(t, segLen), x = pos.x + d.x * tt, y = pos.y + d.y * tt, u = tt / segLen, h = Sim.arcAt(h0, H, u);
        if (!wallClear(x, y, f.r * 0.8)) {
          var ne = nearestEdge(x, y), wz = null;
          if (ne.e.wlzs) ne.e.wlzs.forEach(function (z) { if (y >= z.y0 && y <= z.y1) wz = z; });
          hit = { kind: 'wall', n: ne.e.n, wlz: wz, t: tt - step, h: h };
          break;
        }
        // колонна высокая — отбивает прыжок на любой высоте; кристалл — только дугу ниже obstH (D-086)
        for (var k = 0; k < obs.length; k++) {
          if (obs[k].kind === 'column' && (ontoCol || (obs[k].low && h >= T.colLowH))) continue; // низкая колонна — как стенка (D-103)
          if (obs[k].kind !== 'column' && h >= T.obstH) continue;
          var r = inObst(obs[k], x, y, f.r * 0.75);
          if (r) { hit = { kind: obs[k].kind, n: r.n, t: tt - step, h: h, obj: obs[k].id }; break; }
        }
        if (hit) break;
      }
      if (!hit) {
        var end = { x: pos.x + d.x * segLen, y: pos.y + d.y * segLen };
        segs.push({ from: pos, to: end, len: segLen, H: H, h0: h0 });
        air += segLen;
        return { segs: segs, land: end, dir: d, air: air, bounces: bounces };
      }
      var ht = Math.max(0, hit.t), c = { x: pos.x + d.x * ht, y: pos.y + d.y * ht };
      segs.push({ from: pos, to: c, len: ht, H: H, h0: h0, hit: hit.kind, wlz: hit.wlz ? hit.wlz.id : null });
      air += ht;
      if (hit.kind === 'wall' && hit.wlz && opts.grip) return { segs: segs, land: c, dir: d, air: air, bounces: bounces, grip: { x: c.x, y: c.y, n: hit.n, h: hit.h, wlz: hit.wlz.id } };
      if (bounces >= T.maxBounces || segLen - ht < 8) { // сил нет — падает у стены
        return { segs: segs, land: c, dir: d, air: air, bounces: bounces, stopped: true };
      }
      bounces++;
      var bonus = hit.kind === 'wall' ? (hit.wlz ? T.wlzBonus : T.wallBonus) : T.wallBonus;
      remaining = (segLen - ht) * (1 + bonus);
      d = reflect(d, hit.n); pos = c; h0 = Math.max(0, hit.h);
    }
  };

  // ---------- создание ----------
  // team: [kindA, kindB]; elems: [elA, elB]; tiers: [n, n]
  Sim.createMatch = function (teamA, teamB, elA, elB, seed, tiers) {
    return { seed: seed >>> 0, rng: seed >>> 0, teams: [teamA.slice(), teamB.slice()], elems: [elA.slice(), elB.slice()], tiers: tiers || [[1, 1], [1, 1]],
      traits: [FB.traitFor(teamA[0], teamA[1]), FB.traitFor(teamB[0], teamB[1])].map(function (t) { return t ? t.id : null; }),
      round: 0, phase: 'init', frogs: [], puddles: [], nodes: [], crystals: [], veils: [], seq: 0 };
  };

  Sim.startMatch = function (s) {
    s.frogs = [];
    for (var side = 0; side < 2; side++) for (var slot = 0; slot < 2; slot++) {
      var k = s.teams[side][slot], d = FB.FROGS[k], p = AR.starts[side][slot];
      s.frogs.push({ id: side * 2 + slot, side: side, slot: slot, kind: k, el: s.elems[side][slot], tier: s.tiers[side][slot],
        x: p.x, y: p.y, r: d.r, hp: d.hp, maxHp: d.hp, def: d.def, jump: d.jump * T.U, mass: d.mass, alive: true,
        facing: side === 0 ? 0 : Math.PI, charge: null, chill: 0, poison: 0, neuro: 0, shell: 0, pinnedBy: -1 });
    }
    var N = FB.NPC, C0 = AR.column; // дикая жаба-NPC (D-102): сидит в резервуаре на колонне до раунда T.npcReleaseRound
    s.npcId = s.frogs.length;
    s.frogs.push({ id: s.npcId, side: 2, npc: true, kind: 'wild', el: 'fire', res: 'fire', eyes: ['fire', 'ice'], tier: N.tier, caged: true,
      x: (C0.x0 + C0.x1) / 2, y: (C0.y0 + C0.y1) / 2, r: N.r, hp: N.hp, maxHp: N.hp, def: N.def, jump: 9999, mass: N.mass, alive: true,
      facing: Math.PI, charge: null, chill: 0, poison: 0, neuro: 0, shell: 0, pinnedBy: -1 });
    s.npcLastHit = -1;
    s.puddles = AR.puddles.map(function (q, i) { return { id: 'f' + i, x: q.p.x, y: q.p.y, r: T.puddleR, el: q.el, fixed: true, active: true }; });
    s.nodes = AR.nodes.map(function (n, i) { return { id: i, x: n.p.x, y: n.p.y, sx: n.spawn.x, sy: n.spawn.y, px: n.pipe.x, py: n.pipe.y, el: null, side: -1 }; });
    s.crystals = []; s.veils = [];
    s.round = 1; s.starter = 0; s.turnSide = 0; s.acted = {}; s.pending = null;
    s.phase = 'play'; s.winner = null;
    var ev = []; pipePuddles(s, ev); ev.push({ t: 'round', round: 1, side: 0 }); npcRound(s, ev);
    return ev;
  };

  // ---------- запросы ----------
  Sim.canAct = function (s, f) {
    if (s.phase !== 'play' || !f.alive || f.side !== s.turnSide) return false;
    if (s.pending) return s.pending.frog === f.id;
    return !s.acted[f.id];
  };
  Sim.rangeFor = function (s, f, mode) {
    var r = f.jump;
    if (f.chill) r *= T.chillMul;
    if (mode === 'grip') r *= T.gripRangeMul;
    if (mode === 'hop') r *= s.traits[f.side] === 'catapult' ? T.catapultRangeMul : T.allyHopMax;
    if (mode === 'auto') r *= T.allyHopMul;
    return r;
  };
  Sim.trait = function (s, side) { return s.traits[side]; };
  function partner(s, f) { return s.frogs.filter(function (x) { return x.side === f.side && x.id !== f.id; })[0]; }
  function enemiesOf(s, f) { return s.frogs.filter(function (e) { return e.alive && !e.caged && e.side !== f.side; }); }

  // Что случится при приземлении (для превью и подсказок): reaction / charge / base
  Sim.reactionAt = function (s, f, x, y, skipCharge) {
    if (skipCharge) return { kind: 'base', el: f.el }; // доп. прыжок от союзника: никаких реакций — ни заряда, ни лужи (D-080)
    if (f.charge) return { kind: f.charge[0] === f.charge[1] ? 'over' : 'react', key: FB.reactionKey(f.charge[0], f.charge[1]), from: 'charge', els: f.charge };
    var pd = puddleAt(s, x, y);
    if (pd && pd.el !== f.el) return { kind: 'charge', key: FB.reactionKey(f.el, pd.el), from: 'puddle', puddle: pd.id, els: [f.el, pd.el] }; // лужа другого цвета заряжает жабу (D-100)
    if (pd && pd.el === f.el) return { kind: 'surge', el: f.el, from: 'puddle', puddle: pd.id }; // лужа своего цвета — всплеск (D-089)
    return { kind: 'base', el: f.el };
  };
  function puddleAt(s, x, y) { for (var i = 0; i < s.puddles.length; i++) { var p = s.puddles[i]; if (p.active && dist(x, y, p.x, p.y) <= p.r) return p; } return null; }
  function nodeAt(s, x, y, r) { for (var i = 0; i < s.nodes.length; i++) { var n = s.nodes[i]; if (dist(x, y, n.x, n.y) <= T.nodeR + r * 0.5) return n; } return null; }
  Sim.puddleAt = puddleAt; Sim.nodeAt = nodeAt;

  // Жабы, скрытые в Steam Veil от наблюдателя (§13): внутри облака и рядом нет жаб наблюдателя
  Sim.hiddenFrom = function (s, viewer, f) {
    if (f.side === viewer || !f.alive) return false;
    return (s.veils || []).some(function (v) {
      if (dist(f.x, f.y, v.x, v.y) > v.r) return false;
      // видна, только если жаба наблюдателя стоит вплотную (veilSight): облако огромное, «внутри облака» видело бы почти всё (D-078)
      return !s.frogs.some(function (o) { return o.side === viewer && o.alive && dist(o.x, o.y, f.x, f.y) <= T.veilSight; });
    });
  };
  // То, что видит сторона: скрытых врагов уносим с поля (превью и бот не знают, где они)
  Sim.perceived = function (s, viewer) {
    var c = Sim.clone(s);
    c.frogs.forEach(function (f) { if (Sim.hiddenFrom(s, viewer, s.frogs[f.id])) { f.hidden = true; f.x = -5000; f.y = -5000; } });
    return c;
  };

  // ---------- урон и статусы ----------
  function damage(s, f, amount, events, src, by) {
    if (!f.alive || amount <= 0) return 0;
    if (f.caged) return 0;
    if (f.npc && s.curSide !== undefined && s.curSide !== 2) s.npcLastHit = s.curSide;
    var raw = amount;
    if (src !== 'poison' && src !== 'neuro' && src !== 'slam') amount *= (1 - f.def / 100); // Defense (§4)
    if (f.shell && src !== 'poison' && src !== 'neuro') { // Static Shell (§17)
      amount *= T.shellMul; f.shell = 0;
      events.push({ t: 'shellBreak', id: f.id, x: f.x, y: f.y });
      enemiesOf(s, f).forEach(function (e) { if (dist(e.x, e.y, f.x, f.y) <= T.shellKnockR + e.r) { var d = norm(e.x - f.x, e.y - f.y); push(s, e, d.l ? d : { x: 0, y: 1 }, T.shellKnock, events, null); } });
    }
    amount = Math.max(1, Math.round(amount));
    f.hp -= amount;
    events.push({ t: 'hit', id: f.id, dmg: amount, src: src || 'hit' });
    if (f.hp <= 0) {
      f.hp = 0; f.alive = false; f.charge = null; f.poison = 0; f.neuro = 0; f.chill = 0; f.shell = 0;
      events.push({ t: 'death', id: f.id, x: f.x, y: f.y });
    }
    return amount;
  }

  // Отброс (§10): шагами, с ударом о стену / колонну / кристалл
  function push(s, e, dir, amount, events, attacker, gentle, ignoreId) { // gentle — без удара о стену; ignoreId — препятствие, из которого выталкиваем
    if (!e.alive || amount <= 0) return;
    var from = { x: e.x, y: e.y }, x = e.x, y = e.y, hit = null, obs = obstacles(s).filter(function (o) { return (ignoreId === undefined || o.id !== ignoreId) && !inObst(o, e.x, e.y, e.r * 0.8); }), step = 4;
    for (var t = step; t <= amount; t += step) {
      var nx = e.x + dir.x * t, ny = e.y + dir.y * t;
      if (!wallClear(nx, ny, e.r * 0.9)) { hit = 'wall'; break; }
      for (var k = 0; k < obs.length; k++) if (inObst(obs[k], nx, ny, e.r * 0.8)) { hit = obs[k].kind; break; }
      if (hit) break;
      x = nx; y = ny;
    }
    e.x = x; e.y = y;
    events.push({ t: 'push', id: e.id, from: from, to: { x: x, y: y }, wall: hit });
    if (hit && !gentle) {
      var dmg = T.slamDamage;
      // Pinned Target (§7): помеченную одной жабой цель вторая жаба пары вбивает в стену/колонну
      if (attacker && s.traits[attacker.side] === 'pinned' && e.pinnedBy >= 0 && e.pinnedBy !== attacker.id && s.frogs[e.pinnedBy].side === attacker.side) {
        dmg = T.slamDamage * T.pinnedSlamMul + T.pinnedBonus; e.pinnedBy = -1;
        events.push({ t: 'label', id: e.id, text: 'PINNED SMASH!', color: '#ff8a4a' });
      }
      damage(s, e, dmg, events, 'slam');
    }
  }

  function knockAmount(a, e, speed) { return Math.max(T.kbMin, Math.min(T.kbMax, T.kbBase * (T.kbSpeedMin + (1 - T.kbSpeedMin) * Math.min(1, speed)) * a.mass / e.mass)); }

  // Базовый элемент (§9) по цели (full) или задетой (splash)
  // Отброс от точки удара (D-097): у каждого урона по врагу есть отброс, как в версии 1.0
  function knockFrom(s, e, from, amount, events, f, fallback) {
    if (!e.alive || amount <= 0) return;
    var d = norm(e.x - from.x, e.y - from.y); if (!d.l) d = fallback || { x: 0, y: f && f.side === 0 ? -1 : 1 };
    push(s, e, d, amount, events, f);
  }
  function elementHit(s, f, e, el, mul, events) {
    var m = mul * tierMul(f);
    if (el === 'fire') damage(s, e, T.fireDmg * m, events, 'fire');
    else if (el === 'ice') { damage(s, e, T.iceDmg * m, events, 'ice'); if (e.alive && !e.chill) { e.chill = 1; events.push({ t: 'status', id: e.id, s: 'chill' }); } }
    else if (el === 'poison') { damage(s, e, T.poisonDmg * m, events, 'poison'); if (e.alive) { e.poison = T.poisonTicks; events.push({ t: 'status', id: e.id, s: 'poison' }); } }
    else if (el === 'lightning') {
      damage(s, e, T.lightDmg * m, events, 'lightning');
      var other = enemiesOf(s, f).filter(function (o) { return o.id !== e.id && dist(o.x, o.y, e.x, e.y) <= T.lightArcR; })[0];
      if (other) { events.push({ t: 'arc', from: { x: e.x, y: e.y }, to: { x: other.x, y: other.y } }); damage(s, other, T.lightArc * m, events, 'lightning'); knockFrom(s, other, e, T.kbArc, events, f); }
    }
  }

  // ---------- команды ----------
  // cmd: { frog, dx, dy, mode: 'jump'|'grip'|'hop'|'drop'|'end'|'skip' }
  Sim.apply = function (s, cmd, opts) {
    opts = opts || {};
    var events = [], f = s.frogs[cmd.frog], mode = cmd.mode || 'jump';
    if (!f || !Sim.canAct(s, f)) return { ok: false, events: events, why: 'cannot act' };
    s.curSide = f.side;
    var P = s.pending;
    if (P && mode !== P.kind && !(P.kind === 'grip' && mode === 'drop') && !(P.kind === 'hop' && mode === 'end')) return { ok: false, events: events, why: 'pending ' + P.kind };
    if (!P && (mode === 'grip' || mode === 'hop' || mode === 'drop' || mode === 'end')) return { ok: false, events: events, why: 'nothing pending' };

    if (!P) { // начало активации
      events.push({ t: 'act', id: f.id, side: f.side });
      if (f.shell) { f.shell = 0; events.push({ t: 'statusGone', id: f.id, s: 'shell' }); }
    }
    s.pending = null;
    var cont = false;
    // спрыгивая со спины союзника, жаба отталкивает его назад — они расходятся (D-083)
    if (P && P.kind === 'hop' && P.onAlly !== undefined && (mode === 'hop' || mode === 'end')) {
      var jd = mode === 'end' ? norm(P.dir.x, P.dir.y) : norm(cmd.dx || 0, cmd.dy || 0); if (!jd.l) jd = norm(P.dir.x, P.dir.y);
      var al = s.frogs[P.onAlly]; if (al.alive) push(s, al, { x: -jd.x, y: -jd.y }, T.allyShove, events, null, true);
    }
    if (mode === 'skip') events.push({ t: 'skip', id: f.id });
    else if (mode === 'end') { events.push({ t: 'autoHop', id: f.id }); cont = jump(s, f, P.dir.x * 1e4, P.dir.y * 1e4, 'auto', events, P); }
    else if (mode === 'drop') { events.push({ t: 'drop', id: f.id, from: { x: f.x, y: f.y } }); land(s, f, { x: f.x, y: f.y }, P.dir, 0, 0, events, { drop: true }); }
    else cont = jump(s, f, cmd.dx || 0, cmd.dy || 0, mode, events, P);

    checkEnd(s, events);
    if (cont && s.phase === 'play') return { ok: true, events: events, continues: true, pending: s.pending };
    s.pending = null;
    if (!opts.noEnd && s.phase === 'play') endActivation(s, f, events);
    return { ok: true, events: events };
  };

  function jump(s, f, dx, dy, mode, events, P) {
    var range = Sim.rangeFor(s, f, mode), v = norm(dx, dy);
    if (v.l < 1e-6) v = { x: 0, y: f.side === 0 ? -1 : 1, l: 1 };
    var len = Math.min(v.l, range), from = { x: f.x, y: f.y }, h0 = P && P.onAlly !== undefined ? T.perchH : 0;
    if (mode === 'grip' && P) { // с выступа стены — только от стены
      var dn = v.x * P.n.x + v.y * P.n.y;
      if (dn < 0.2) { var adj = norm(v.x + P.n.x * (0.2 - dn) * 2, v.y + P.n.y * (0.2 - dn) * 2); v = { x: adj.x, y: adj.y, l: v.l }; }
      h0 = P.h || 30;
    }
    if (f.chill) { f.chill = 0; events.push({ t: 'statusGone', id: f.id, s: 'chill' }); }
    if (f.neuro) { f.neuro--; damage(s, f, T.neuroTick, events, 'neuro'); if (!f.alive) return false; } // Neuroshock (§18)
    var canGrip = s.traits[f.side] === 'grip' && mode !== 'grip';
    var fl = Sim.flight(s, f, from, v, len, { grip: canGrip, h0: h0 });
    f.facing = Math.atan2(fl.dir.x, -fl.dir.y);
    events.push({ t: 'jump', id: f.id, segs: fl.segs, mode: mode, grip: !!fl.grip });
    fl.segs.forEach(function (sg) { if (sg.hit) events.push({ t: 'bounce', id: f.id, x: sg.to.x, y: sg.to.y, kind: sg.hit, wlz: sg.wlz }); });
    if (fl.grip) { // Reactive Grip: висит на стене, ждёт второй прыжок (§22)
      f.x = fl.grip.x; f.y = fl.grip.y;
      s.pending = { kind: 'grip', frog: f.id, n: fl.grip.n, h: fl.grip.h, dir: fl.dir, air: fl.air, bounces: fl.bounces + 1 }; // зацеп = ещё один отскок
      events.push({ t: 'grip', id: f.id, x: f.x, y: f.y, n: fl.grip.n, h: fl.grip.h });
      return true;
    }
    var speed = len / f.jump;
    var airTotal = fl.air + (P && P.air ? P.air : 0);
    var bTotal = fl.bounces + (P && P.bounces ? P.bounces : 0);
    return land(s, f, fl.land, fl.dir, speed, airTotal, events, { mode: mode, bounces: bTotal });
  }

  // Приземление (§10, §11, §19): враг / союзник / лужа / узел
  function land(s, f, L, dir, speed, air, events, o) {
    o = o || {};
    var L0 = { x: L.x, y: L.y };
    // нельзя стоять внутри препятствия — выталкиваем к ближайшей стороне
    obstacles(s).forEach(function (ob) { var r = inObst(ob, L.x, L.y, f.r); if (r) { L = { x: L.x + r.n.x * (r.pen + 1), y: L.y + r.n.y * (r.pen + 1) }; } });
    if (!wallClear(L.x, L.y, f.r * 0.8)) { var ne = nearestEdge(L.x, L.y); L = { x: L.x + ne.e.n.x * (f.r - ne.d + 1), y: L.y + ne.e.n.y * (f.r - ne.d + 1) }; }
    var enemy = null, ally = null, best = 1e9;
    s.frogs.forEach(function (e) {
      if (!e.alive || e.id === f.id || e.caged) return;
      var d = Math.min(dist(L.x, L.y, e.x, e.y), e.npc ? dist(L0.x, L0.y, e.x, e.y) : 1e9);
      if (d <= f.r + e.r + T.contactAssist && d < best) { best = d; if (e.side === f.side) { ally = e; enemy = null; } else { enemy = e; ally = null; } }
    });

    // Союзник: Reaction Charge (§19), без урона и без элемента
    if (ally && !o.drop) {
      var perch = o.mode !== 'hop' && o.mode !== 'auto';
      if (perch) { f.x = ally.x; f.y = ally.y; } // сидит на спине союзника, пока не спрыгнет (D-083)
      else { // доп. прыжок снова на союзника — соскакивает рядом
        var bk = norm(dir.x, dir.y); if (bk.l < 1e-6) bk = norm(L.x - ally.x, L.y - ally.y);
        f.x = ally.x + bk.x * (f.r + ally.r + T.allyGap); f.y = ally.y + bk.y * (f.r + ally.r + T.allyGap);
        if (!wallClear(f.x, f.y, f.r * 0.8)) { f.x = L.x; f.y = L.y; }
      }
      events.push({ t: 'land', id: f.id, x: f.x, y: f.y, onAlly: ally.id, perch: perch });
      if (!f.charge) { f.charge = [f.el, ally.el]; events.push({ t: 'charge', id: f.id, els: f.charge.slice(), key: FB.reactionKey(f.el, ally.el) }); }
      if (perch) { // окно на доп. прыжок в любую сторону, иначе автоотскок 25% по ходу основного (D-077, D-080)
        s.pending = { kind: 'hop', frog: f.id, dir: dir, onAlly: ally.id };
        events.push({ t: 'hopReady', id: f.id });
        return true;
      }
      return false;
    }

    f.x = L.x; f.y = L.y;
    events.push({ t: 'land', id: f.id, x: f.x, y: f.y, onEnemy: enemy ? enemy.id : undefined });
    // доп. прыжок со спины союзника: заряд срабатывает, только если попал во врага; лужи не срабатывают (D-094)
    var hopLike = o.mode === 'hop' || o.mode === 'auto';
    var res = hopLike ? (enemy && f.charge ? Sim.reactionAt(s, f, f.x, f.y) : { kind: 'base', el: f.el }) : Sim.reactionAt(s, f, f.x, f.y);

    // Прямое попадание (§10)
    if (enemy) {
      var imp = T.impactBase + T.impactSpeed * Math.min(1, speed);
      if (s.traits[f.side] === 'diving') imp *= Math.min(T.divingMax, 1 + air * T.divingPerUnit); // Diving Strike
      if (s.traits[f.side] === 'grip' && o.bounces) imp *= Math.pow(T.gripImpactMul, o.bounces); // Reactive Grip: каждый отскок ×1.3 (D-082)
      if (enemy.npc && f.el === enemy.res) { imp *= T.npcWeakMul; events.push({ t: 'label', id: enemy.id, text: 'WEAK SPOT!', color: FB.ELEMENTS[f.el].color }); } // D-104
      events.push({ t: 'impact', id: enemy.id, by: f.id, x: enemy.x, y: enemy.y });
      damage(s, enemy, imp, events, 'impact', f);
      if (enemy.alive && (res.kind === 'base' || res.kind === 'charge')) elementHit(s, f, enemy, f.el, 1, events);
      if (enemy.alive && s.traits[f.side] === 'pinned') {
        if (enemy.pinnedBy < 0 || s.frogs[enemy.pinnedBy].side !== f.side) { enemy.pinnedBy = f.id; events.push({ t: 'status', id: enemy.id, s: 'pinned' }); }
      }
    }
    if ((res.kind === 'base' || res.kind === 'charge') && !o.drop) // элемент по поверхности задевает врагов рядом
      enemiesOf(s, f).forEach(function (e) { if (e !== enemy && dist(e.x, e.y, f.x, f.y) <= T.elemR + e.r * 0.5) { elementHit(s, f, e, f.el, T.elemSplash, events); knockFrom(s, e, f, T.kbSplash, events, f); } });

    // Drain Node (§26, §28): последний элемент определяет будущую лужу
    var nd = nodeAt(s, f.x, f.y, f.r);
    if (nd && !o.drop) { nd.el = f.el; nd.side = f.side; events.push({ t: 'node', id: nd.id, el: f.el, side: f.side }); }

    // Реакция (§11–§19)
    if (res.kind !== 'base' && !o.drop) {
      if (res.from === 'charge') { f.charge = null; events.push({ t: 'chargeUsed', id: f.id }); }
      if (res.from === 'puddle') {
        var pd = s.puddles.filter(function (p) { return p.id === res.puddle; })[0];
        pd.active = false; events.push({ t: 'puddleUsed', id: pd.id });
        if (s.traits[f.side] === 'momentum') { // Alchemical Momentum: второй жабе — заряд с элементом лужи
          var pt = partner(s, f);
          if (pt && pt.alive && !pt.charge) { pt.charge = [pt.el, pd.el]; events.push({ t: 'charge', id: pt.id, els: pt.charge.slice(), key: FB.reactionKey(pt.el, pd.el), via: 'momentum' }); }
        }
      }
      if (res.kind === 'charge') { // заряд из лужи: реакция — следующим прыжком, где угодно (D-100)
        f.charge = res.els.slice(); events.push({ t: 'charge', id: f.id, els: f.charge.slice(), key: res.key, via: 'puddle' });
      } else if (res.kind === 'surge') { // ВСПЛЕСК (D-091): небольшая область + 6 осколков, траектория по элементу
        var hitBy = {}, shards = surgeShards(s, f, dir);
        events.push({ t: 'surge', id: f.id, el: f.el, x: f.x, y: f.y, r: T.surgeR, shards: shards });
        enemiesOf(s, f).forEach(function (e) {
          if (dist(e.x, e.y, f.x, f.y) > T.surgeR + e.r) return;
          hitBy[e.id] = 1;
          damage(s, e, T.surgePhys * tierMul(f), events, 'surge', f);
          if (e.alive) elementHit(s, f, e, f.el, 1, events);
          if (e.alive && e !== enemy) { var sd = norm(e.x - f.x, e.y - f.y); push(s, e, sd.l ? sd : dir, T.surgeKnock, events, f); }
        });
        shards.forEach(function (sh) { // каждого врага — не больше одного осколка, и не тех, кого задела область
          if (sh.hit < 0 || hitBy[sh.hit]) return;
          var e = s.frogs[sh.hit]; if (!e.alive) return;
          hitBy[e.id] = 1;
          damage(s, e, T.shardDmg * tierMul(f), events, 'shard', f);
          if (e.alive) elementHit(s, f, e, f.el, T.elemSplash, events);
          knockFrom(s, e, f, T.kbShard, events, f);
        });
      } else if (res.kind === 'over') { // одинаковые элементы — усиленный базовый эффект
        events.push({ t: 'reaction', id: f.id, key: null, name: 'OVERCHARGE', x: f.x, y: f.y });
        enemiesOf(s, f).forEach(function (e) { if (e === enemy || dist(e.x, e.y, f.x, f.y) <= T.elemR * 1.4 + e.r) { elementHit(s, f, e, f.el, T.sameChargeMul, events); if (e !== enemy) knockFrom(s, e, f, T.kbOver, events, f, dir); } });
      } else reaction(s, f, res.key, dir, enemy, events);
    }

    // Отброс прямой цели — после реакций
    if (enemy && enemy.alive) push(s, enemy, norm(enemy.x - f.x, enemy.y - f.y).l > 1 ? norm(enemy.x - f.x, enemy.y - f.y) : dir, knockAmount(f, enemy, speed), events, f);
    return false;
  }

  // Осколки всплеска (D-091): 6 направлений от направления прыжка, дальность T.shardRange.
  // Огонь — навесом (бьёт в точке падения), лёд — прямо, яд — волной, молния — зигзагом.
  // Путь — ломаная в мире; режется о стены и колонну; первый задетый враг — цель осколка.
  function surgeShards(s, f, dir) {
    var out = [], base = Math.atan2(dir.y || -1, dir.x || 0), obs = obstacles(s), el = f.el;
    for (var i = 0; i < 6; i++) {
      var a = base + i / 6 * Math.PI * 2, ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux, pts = [{ x: f.x, y: f.y }], hit = -1, N = 24;
      for (var k = 1; k <= N; k++) {
        var u = k / N, d = T.shardRange * u, off = 0;
        if (el === 'poison') off = Math.sin(u * Math.PI * 3) * 34;
        else if (el === 'lightning') off = (k % 2 ? 1 : -1) * 26 * Math.min(1, u * 4);
        var x = f.x + ux * d + nx * off, y = f.y + uy * d + ny * off;
        if (!wallClear(x, y, 6) || obs.some(function (o) { return inObst(o, x, y, 6); })) break;
        pts.push({ x: x, y: y });
        if (el === 'fire' && k < N) continue; // навесом: бьёт только там, где упал
        var target = s.frogs.filter(function (e) { return e.alive && !e.caged && e.side !== f.side && dist(e.x, e.y, x, y) <= e.r + (el === 'fire' ? 50 : 14); })[0];
        if (target) { hit = target.id; break; }
      }
      out.push({ pts: pts, hit: hit, lob: el === 'fire' });
    }
    return out;
  }
  function reaction(s, f, key, dir, enemy, events) {
    var R = FB.REACTIONS[key], m = tierMul(f);
    events.push({ t: 'reaction', id: f.id, key: key, name: R.name, x: f.x, y: f.y });
    if (key === 'fire+ice') { // STEAM VEIL (§13)
      var v = { id: ++s.seq, x: f.x, y: f.y, r: T.veilR, turns: T.veilTurns, side: f.side };
      s.veils.push(v);
      events.push({ t: 'veil', veil: Object.assign({}, v) });
      enemiesOf(s, f).forEach(function (e) { if (e !== enemy && dist(e.x, e.y, f.x, f.y) <= T.veilR * 0.7 + e.r) knockFrom(s, e, f, T.kbSteam, events, f, dir); }); // паровой удар (D-097)
      for (var tries = 0; tries < 24; tries++) { // случайный безопасный отскок внутри облака
        var a = rng(s) * Math.PI * 2, d = T.veilBounceMin + rng(s) * (v.r - T.veilBounceMin - f.r);
        var x = v.x + Math.cos(a) * d, y = v.y + Math.sin(a) * d;
        if (!wallClear(x, y, f.r) || obstacles(s).some(function (o) { return inObst(o, x, y, f.r); })) continue;
        if (s.frogs.some(function (o) { return o.alive && o.id !== f.id && dist(o.x, o.y, x, y) < o.r + f.r + 4; })) continue;
        var from = { x: f.x, y: f.y }; f.x = x; f.y = y;
        events.push({ t: 'veilBounce', id: f.id, from: from, to: { x: x, y: y } });
        break;
      }
    } else if (key === 'fire+poison') { // TOXIC DETONATION (§14)
      enemiesOf(s, f).forEach(function (e) {
        if (dist(e.x, e.y, f.x, f.y) > T.detR + e.r) return;
        damage(s, e, T.detDamage * m, events, 'detonation', f);
        if (e.alive) { var d2 = norm(e.x - f.x, e.y - f.y); push(s, e, d2.l ? d2 : dir, T.detKnock, events, f); }
      });
    } else if (key === 'fire+lightning') { // PLASMA ORB (§15)
      var orb = Sim.orbPath(s, f, { x: f.x, y: f.y }, dir);
      events.push({ t: 'orb', id: f.id, path: orb.path, hit: orb.hit });
      if (orb.hit >= 0) { var e2 = s.frogs[orb.hit]; damage(s, e2, T.orbDamage * m, events, 'orb', f); if (e2.alive) push(s, e2, orb.dirAtHit, T.orbKnock, events, f); }
    } else if (key === 'ice+poison') { // TOXIC CRYSTAL (§16)
      var c = Sim.crystalFor(f, dir);
      c.id = ++s.seq; c.turns = T.crystalTurns;
      s.crystals.push(c);
      events.push({ t: 'crystal', crystal: Object.assign({}, c) });
      s.frogs.forEach(function (o) { // кристалл, поднимаясь под жабой, бьёт врага и отбрасывает наружу (D-096)
        if (!o.alive) return;
        var r = inObst(c, o.x, o.y, o.r); if (!r) return;
        if (o.side !== f.side) damage(s, o, T.crystalRiseDmg * m, events, 'crystal', f);
        // выталкиваем поперёк стены на её сторону; если жаба по центру — на дальнюю от кастера (D-101)
        var nd = { x: -c.uy, y: c.ux }, lv = (o.x - c.cx) * nd.x + (o.y - c.cy) * nd.y;
        var sg = Math.abs(lv) > 4 ? Math.sign(lv) : Math.sign((c.cx - f.x) * nd.x + (c.cy - f.y) * nd.y) || 1;
        if (o.alive) push(s, o, { x: nd.x * sg, y: nd.y * sg }, c.ht + o.r - Math.abs(lv) + T.crystalRiseKnock, events, null, true, c.id);
      });
    } else if (key === 'ice+lightning') { // STATIC SHELL (§17)
      f.shell = 1; events.push({ t: 'status', id: f.id, s: 'shell' });
      enemiesOf(s, f).forEach(function (e) { if (e !== enemy && dist(e.x, e.y, f.x, f.y) <= T.shellKnockR + e.r) knockFrom(s, e, f, T.shellKnock, events, f, dir); }); // D-097
    } else if (key === 'lightning+poison') { // NEUROSHOCK (§18)
      enemiesOf(s, f).forEach(function (e) {
        if (e !== enemy && dist(e.x, e.y, f.x, f.y) > T.neuroR + e.r) return;
        e.neuro = T.neuroJumps; events.push({ t: 'status', id: e.id, s: 'neuro' });
        if (e !== enemy) knockFrom(s, e, f, T.kbNeuro, events, f, dir);
      });
    }
  }

  Sim.crystalFor = function (f, dir) {
    var d = norm(dir.x, dir.y); if (!d.l) d = { x: 0, y: -1 };
    return { cx: f.x + d.x * (f.r + T.crystalThick / 2 + 12), cy: f.y + d.y * (f.r + T.crystalThick / 2 + 12), ux: -d.y, uy: d.x, hl: T.crystalLen / 2, ht: T.crystalThick / 2 };
  };

  // Plasma Orb (§15, D-101): самонаводится — плавно доворачивает к ближайшему врагу впереди (orbTurn рад на единицу пути),
  // один отскок от стены/колонны/кристалла; после отскока цель выбирается заново
  Sim.orbPath = function (s, f, from, dir) {
    var d = norm(dir.x, dir.y), pos = { x: from.x, y: from.y }, path = [{ x: pos.x, y: pos.y }], bounced = false, obs = obstacles(s), step = 8, n = 0;
    function pickTarget() {
      var best = null, bs = 1e9;
      s.frogs.forEach(function (e) {
        if (!e.alive || e.caged || e.side === f.side) return;
        var v = norm(e.x - pos.x, e.y - pos.y), ahead = v.x * d.x + v.y * d.y;
        var sc = v.l * (ahead > 0.2 ? 1 : 3); // впереди — предпочтительнее
        if (v.l < T.orbRange && sc < bs) { bs = sc; best = e; }
      });
      return best;
    }
    var target = pickTarget();
    for (var t = 0; t < T.orbRange; t += step) {
      if (target && target.alive) { // доворот к цели не больше orbTurn × шаг
        var want = norm(target.x - pos.x, target.y - pos.y), cur = Math.atan2(d.y, d.x), aim = Math.atan2(want.y, want.x), da = aim - cur;
        while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
        var lim = T.orbTurn * step; da = Math.max(-lim, Math.min(lim, da)); cur += da; d = { x: Math.cos(cur), y: Math.sin(cur), l: 1 };
      }
      var nx = pos.x + d.x * step, ny = pos.y + d.y * step, hitN = null;
      if (!wallClear(nx, ny, T.orbR)) hitN = nearestEdge(nx, ny).e.n;
      else for (var k = 0; k < obs.length; k++) { var r = inObst(obs[k], nx, ny, T.orbR); if (r) { hitN = r.n; break; } }
      if (hitN) {
        path.push({ x: pos.x, y: pos.y });
        if (bounced) return { path: path, hit: -1 };
        bounced = true; d = reflect(d, hitN); target = pickTarget(); continue;
      }
      pos = { x: nx, y: ny };
      if (++n % 4 === 0) path.push({ x: pos.x, y: pos.y }); // точки дуги для анимации
      if (t > f.r) for (var i = 0; i < s.frogs.length; i++) {
        var e = s.frogs[i];
        if (e.alive && !e.caged && e.side !== f.side && dist(e.x, e.y, pos.x, pos.y) <= e.r + T.orbR) { path.push({ x: pos.x, y: pos.y }); return { path: path, hit: e.id, dirAtHit: d }; }
      }
    }
    path.push({ x: pos.x, y: pos.y });
    return { path: path, hit: -1 };
  };

  // ---------- конец активации и раунды ----------
  function endActivation(s, f, events) {
    if (f.alive && f.poison) { f.poison--; damage(s, f, T.poisonTick, events, 'poison'); }
    s.acted[f.id] = true;
    s.crystals.forEach(function (c) { c.turns--; }); s.veils.forEach(function (v) { v.turns--; });
    s.crystals.filter(function (c) { return c.turns <= 0; }).forEach(function (c) { events.push({ t: 'crystalGone', id: c.id }); });
    s.veils.filter(function (v) { return v.turns <= 0; }).forEach(function (v) { events.push({ t: 'veilGone', id: v.id }); });
    s.crystals = s.crystals.filter(function (c) { return c.turns > 0; }); s.veils = s.veils.filter(function (v) { return v.turns > 0; });
    checkEnd(s, events);
    if (s.phase !== 'play') return;
    var other = 1 - s.turnSide;
    if (sideCanAct(s, other)) s.turnSide = other;
    else if (!sideCanAct(s, s.turnSide)) newRound(s, events);
    events.push({ t: 'turn', side: s.turnSide });
  }
  function sideCanAct(s, side) { return s.frogs.some(function (f) { return f.side === side && f.alive && !s.acted[f.id]; }); }

  function newRound(s, events) {
    s.round++; s.acted = {}; s.starter = 1 - s.starter;
    s.turnSide = sideCanAct(s, s.starter) ? s.starter : 1 - s.starter;
    // лужи: постоянные снова активны, выпущенные в прошлом раунде исчезают; узлы выпускают новые (§27)
    s.puddles = s.puddles.filter(function (p) { if (!p.fixed) events.push({ t: 'puddleGone', id: p.id }); return p.fixed; });
    s.puddles.forEach(function (p) { if (!p.active) { p.active = true; events.push({ t: 'puddleOn', id: p.id }); } });
    pipePuddles(s, events);
    events.push({ t: 'round', round: s.round, side: s.turnSide });
    if (s.round > T.roundCap) { decideByHp(s, events); return; }
    npcRound(s, events);
  }

  // ---------- дикая жаба-NPC (D-102 … D-104) ----------
  // Каждый раунд: новые цвета глаз (пара элементов → её реакция) и резервуара (слабое место).
  // До раунда побега она бьётся в резервуаре; в раунд побега выпрыгивает на колонну; дальше ходит первой.
  function npcRound(s, events) {
    var n = s.frogs[s.npcId]; if (!n || !n.alive || s.phase !== 'play') return;
    var a = Math.floor(rng(s) * 4), b = (a + 1 + Math.floor(rng(s) * 3)) % 4, E = FB.ELEMENT_ORDER;
    n.eyes = [E[a], E[b]]; n.res = E[Math.floor(rng(s) * 4)]; n.el = n.res;
    events.push({ t: 'npcRoll', id: n.id, eyes: n.eyes.slice(), res: n.res, key: FB.reactionKey(n.eyes[0], n.eyes[1]) });
    if (n.caged) {
      if (s.round < T.npcReleaseRound) { events.push({ t: 'npcStruggle', id: n.id, left: T.npcReleaseRound - s.round }); return; }
      n.caged = false; events.push({ t: 'npcRelease', id: n.id, x: n.x, y: n.y }); return;
    }
    npcAct(s, events);
  }
  function npcAct(s, events) {
    var n = s.frogs[s.npcId], C0 = AR.column, home = { x: (C0.x0 + C0.x1) / 2, y: (C0.y0 + C0.y1) / 2 };
    s.curSide = 2;
    events.push({ t: 'act', id: n.id, side: 2 });
    if (n.shell) { n.shell = 0; events.push({ t: 'statusGone', id: n.id, s: 'shell' }); }
    if (n.poison) { n.poison--; damage(s, n, T.poisonTick, events, 'poison'); }
    if (n.neuro) { n.neuro--; damage(s, n, T.neuroTick, events, 'neuro'); }
    if (!n.alive) { checkEnd(s, events); return; }
    // цель — ближайшая живая жаба любой стороны
    var tg = null, bd = 1e9;
    s.frogs.forEach(function (e) { if (e.alive && !e.npc) { var d = dist(e.x, e.y, n.x, n.y) + e.hp * 0.3; if (d < bd) { bd = d; tg = e; } } });
    if (!tg) return;
    var from = { x: n.x, y: n.y }, to = { x: tg.x, y: tg.y }, len = dist(from.x, from.y, to.x, to.y), dir = norm(to.x - from.x, to.y - from.y);
    n.facing = Math.atan2(dir.x, -dir.y);
    events.push({ t: 'jump', id: n.id, segs: [{ from: from, to: to, len: len, H: T.npcJumpH, h0: 0 }], mode: 'npc' });
    n.x = to.x; n.y = to.y;
    events.push({ t: 'land', id: n.id, x: n.x, y: n.y, onEnemy: tg.id });
    events.push({ t: 'impact', id: tg.id, by: n.id, x: tg.x, y: tg.y });
    damage(s, tg, T.npcImpact * tierMul(n), events, 'impact', n);
    reaction(s, n, FB.reactionKey(n.eyes[0], n.eyes[1]), dir.l ? dir : { x: 0, y: 1 }, tg, events); // глаза задают комбинацию
    if (tg.alive) push(s, tg, norm(tg.x - n.x, tg.y - n.y).l > 1 ? norm(tg.x - n.x, tg.y - n.y) : dir, knockAmount(n, tg, 1), events, n);
    // остаётся там, куда прыгнула — на поле (D-105)
    checkEnd(s, events);
  }

  // Каждая труба в начале раунда выпускает лужу у своей решётки (§27, D-068): элемент заряженного узла,
  // иначе случайный (от сида матча). Лужа живёт один раунд, одно использование.
  function pipePuddles(s, events) {
    s.nodes.forEach(function (n) {
      var charged = !!n.el, el = charged ? n.el : FB.ELEMENT_ORDER[Math.floor(rng(s) * 4)];
      var r = T.puddleR * (charged && s.traits[n.side] === 'reservoir' ? T.reservoirMul : 1);
      var p = { id: 'n' + (++s.seq), x: n.sx, y: n.sy, r: r, el: el, fixed: false, active: true, node: n.id, charged: charged };
      s.puddles.push(p);
      events.push({ t: 'spawn', puddle: Object.assign({}, p), node: n.id, pipe: { x: n.px, y: n.py } });
      n.el = null; n.side = -1;
    });
  }

  function aliveCount(s, side) { return s.frogs.filter(function (f) { return f.side === side && f.alive; }).length; }
  function checkEnd(s, events) {
    if (s.phase !== 'play') return;
    var n = s.frogs[s.npcId];
    if (n && !n.alive && !n.caged) { finish(s, s.npcLastHit, events, 'npc'); return; } // кто добил NPC — победил (D-104)
    var a0 = aliveCount(s, 0), a1 = aliveCount(s, 1);
    if (a0 && a1) return;
    finish(s, !a0 && !a1 ? -1 : (a1 ? 1 : 0), events, 'ko');
  }
  function hpFrac(s, side) { var h = 0, m = 0; s.frogs.forEach(function (f) { if (f.side === side) { h += f.hp; m += f.maxHp; } }); return h / m; }
  function decideByHp(s, events) { var a = hpFrac(s, 0), b = hpFrac(s, 1); finish(s, a === b ? -1 : (a > b ? 0 : 1), events, 'time'); }
  function finish(s, w, events, why) {
    s.phase = 'over'; s.why = why;
    s.winner = w; // -1 — ничья (одновременный нокаут или равные HP% на лимите раундов)
    events.push({ t: 'over', winner: s.winner, why: why });
  }

  // Превью (§34–§35): та же функция на копии того, что видит сторона
  Sim.preview = function (s, cmd, viewer) {
    var c = viewer === undefined ? Sim.clone(s) : Sim.perceived(s, viewer);
    var r = Sim.apply(c, cmd, { noEnd: true });
    return { state: c, events: r.events, ok: r.ok, pending: c.pending };
  };
})();
