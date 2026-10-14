// Симуляция TOADBREW — Relay Alchemy 3 (ветка Quoridor3, D-157 — зельеварка). Без DOM и WebGL: состояние — простой объект, ход — команда.
// apply(state, cmd) меняет состояние и возвращает события для анимации. Случайность — только от сида.
// Жабы прыгают свободно; клетки сетки под полем хранят элементы и рельеф (§4, §5).
// Правила 6.0 (GDD, блок «Правки 2026-10-13»): жаба всегда может прыгнуть — без эликсира это короткий «сухой» прыжок;
// игра никогда не уводит жабу сама; элемент = глагол; перк у жабы, от которой отскочили; колонна — стена.
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

  // ---------- геометрия арены: прямоугольник поля ----------
  var EDGES = [];
  (function () {
    var P = AR.floor;
    for (var i = 0; i < P.length; i++) {
      var a = P[i], b = P[(i + 1) % P.length], d = norm(b.x - a.x, b.y - a.y);
      EDGES.push({ a: a, b: b, d: d, n: { x: -d.y, y: d.x } }); // по часовой в экранных координатах → внутренняя нормаль
    }
  })();
  Sim.EDGES = EDGES;
  function insidePoly(x, y) { return x > AR.x0 && x < AR.x0 + AR.w && y > AR.y0 && y < AR.y0 + AR.h; }
  function segDist(px, py, e) {
    var vx = e.b.x - e.a.x, vy = e.b.y - e.a.y, L2 = vx * vx + vy * vy, t = Math.max(0, Math.min(1, ((px - e.a.x) * vx + (py - e.a.y) * vy) / L2));
    return dist(px, py, e.a.x + vx * t, e.a.y + vy * t);
  }
  function nearestEdge(x, y) {
    var best = null, bd = 1e9;
    EDGES.forEach(function (e) { var d = segDist(x, y, e); if (d < bd) { bd = d; best = { e: e, d: d }; } });
    return best;
  }
  function wallClear(x, y, r) { return insidePoly(x, y) && nearestEdge(x, y).d >= r; }
  Sim.insideArena = function (x, y, r) { return wallClear(x, y, r || 0); };

  // ---------- сетка (§4, §5, D-112) ----------
  var C = T.cell, NC = T.cols, NR = T.rows;
  function cellOf(x, y) {
    var c = Math.floor((x - AR.x0) / C), r = Math.floor((y - AR.y0) / C);
    return { c: Math.max(0, Math.min(NC - 1, c)), r: Math.max(0, Math.min(NR - 1, r)) };
  }
  function idx(c, r) { return r * NC + c; }
  function cellIdx(x, y) { var q = cellOf(x, y); return idx(q.c, q.r); }
  function center(i) { return { x: AR.x0 + (i % NC + 0.5) * C, y: AR.y0 + (Math.floor(i / NC) + 0.5) * C }; }
  function baseSideOfRow(r) { return r >= NR - T.baseRows ? 0 : (r < T.baseRows ? 1 : -1); }
  function baseOf(i) { return baseSideOfRow(Math.floor(i / NC)); }
  Sim.cellIdx = cellIdx; Sim.cellCenter = center; Sim.cellBase = baseOf;
  Sim.onBase = function (f) { return baseSideOfRow(cellOf(f.x, f.y).r) === f.side; };
  function inGrid(c, r) { return c >= 0 && c < NC && r >= 0 && r < NR; }
  function neighbors4(i) {
    var c = i % NC, r = Math.floor(i / NC), out = [];
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { if (inGrid(c + d[0], r + d[1])) out.push(idx(c + d[0], r + d[1])); });
    return out;
  }
  function square(i, rad) {
    var c = i % NC, r = Math.floor(i / NC), out = [];
    for (var dy = -rad; dy <= rad; dy++) for (var dx = -rad; dx <= rad; dx++) if (inGrid(c + dx, r + dy)) out.push(idx(c + dx, r + dy));
    return out;
  }
  // Клетка (D-157): краска el + уровень lv (1–3), рельеф t ('column' — кристальная стена, side — чья), лужа яда pz ходов (pd урон, pside — чья)
  function emptyCell() { return { el: null, lv: 0, t: null, side: -1, pz: 0, pd: 0, pside: -1 }; }
  function setCell(s, i, patch, events) {
    var cl = Object.assign(s.cells[i], patch);
    if (!cl.el) cl.lv = 0;
    if (!cl.t) cl.side = -1;
    if (!cl.pz) { cl.pd = 0; cl.pside = -1; }
    events.push({ t: 'cell', i: i, c: Object.assign({}, cl) });
  }

  // Колонны — стены на всю клетку (§21, D-145)
  function obstacles(s) {
    var list = [];
    s.cells.forEach(function (cl, i) { if (cl.t === 'column') { var p = center(i); list.push({ kind: 'column', cell: i, cx: p.x, cy: p.y, ux: 1, uy: 0, hl: C / 2 - 8, ht: C / 2 - 8 }); } });
    return list;
  }
  Sim.obstacles = obstacles;
  function inObst(o, x, y, m) {
    var dx = x - o.cx, dy = y - o.cy, lu = dx * o.ux + dy * o.uy, lv = -dx * o.uy + dy * o.ux;
    var pu = o.hl + m - Math.abs(lu), pv = o.ht + m - Math.abs(lv);
    if (pu <= 0 || pv <= 0) return null;
    if (pu < pv) return { n: { x: o.ux * Math.sign(lu || 1), y: o.uy * Math.sign(lu || 1) }, pen: pu };
    return { n: { x: -o.uy * Math.sign(lv || 1), y: o.ux * Math.sign(lv || 1) }, pen: pv };
  }
  function reflect(d, n) { var k = 2 * (d.x * n.x + d.y * n.y); return norm(d.x - k * n.x, d.y - k * n.y); }

  Sim.arcHeight = function (len) { return T.arcBase + len * T.arcPerLen; };
  Sim.arcAt = function (h0, H, u) { return h0 * (1 - u) + 4 * H * u * (1 - u); };

  // Полёт с отскоками от стен. Колонна (D-145) — стена: обычный прыжок через неё не проходит никогда,
  // прыжок со спины союзника (opts.relay) идёт «с возвышения» и пролетает над колоннами.
  Sim.flight = function (s, f, from, dir, len, opts) {
    opts = opts || {};
    var segs = [], pos = { x: from.x, y: from.y }, d = norm(dir.x, dir.y), remaining = len, h0 = opts.h0 || 0, air = 0, bounces = 0, step = 6;
    var all = obstacles(s), obs = opts.relay ? [] : all.filter(function (o) { return !inObst(o, from.x, from.y, f.r * 0.75); });
    // со спины союзника колонны перелетаются (D-145): дуга поднимается выше кристалла, чтобы перелёт было видно (D-155)
    function overWall(seg) {
      if (!opts.relay || !all.length) return seg;
      var need = 0;
      for (var t2 = 0; t2 <= seg.len; t2 += step) {
        var x2 = seg.from.x + d.x * t2, y2 = seg.from.y + d.y * t2;
        for (var k2 = 0; k2 < all.length; k2++) if (inObst(all[k2], x2, y2, f.r * 0.5)) {
          var u2 = Math.max(0.12, Math.min(0.88, t2 / Math.max(1, seg.len)));
          need = Math.max(need, (T.colVisH / T.visH + 12 - seg.h0 * (1 - u2)) / (4 * u2 * (1 - u2)));
          if (seg.over === undefined) seg.over = all[k2].cell;
        }
      }
      seg.H = Math.max(seg.H, Math.min(170, need));
      return seg;
    }
    while (true) {
      var segLen = Math.max(1, remaining), H = Sim.arcHeight(segLen), hit = null, t;
      for (t = step; t <= segLen + 0.01; t += step) {
        var tt = Math.min(t, segLen), x = pos.x + d.x * tt, y = pos.y + d.y * tt, u = tt / segLen, h = Sim.arcAt(h0, H, u);
        if (!wallClear(x, y, f.r * 0.8)) { hit = { kind: 'wall', n: nearestEdge(x, y).e.n, t: tt - step, h: h }; break; }
        for (var k = 0; k < obs.length; k++) {
          var r = inObst(obs[k], x, y, f.r * 0.75);
          if (r) { hit = { kind: 'column', n: r.n, t: tt - step, h: h, cell: obs[k].cell }; break; }
        }
        if (hit) break;
      }
      if (!hit) {
        var end = { x: pos.x + d.x * segLen, y: pos.y + d.y * segLen };
        segs.push(overWall({ from: pos, to: end, len: segLen, H: H, h0: h0 }));
        air += segLen;
        return { segs: segs, land: end, dir: d, air: air, bounces: bounces };
      }
      var ht = Math.max(0, hit.t), c = { x: pos.x + d.x * ht, y: pos.y + d.y * ht };
      segs.push(overWall({ from: pos, to: c, len: ht, H: H, h0: h0, hit: hit.kind }));
      air += ht;
      if (bounces >= T.maxBounces || segLen - ht < 8) return { segs: segs, land: c, dir: d, air: air, bounces: bounces, stopped: true };
      bounces++;
      remaining = (segLen - ht) * (1 + T.wallBonus);
      d = reflect(d, hit.n); pos = c; h0 = Math.max(0, hit.h);
    }
  };

  // ---------- создание ----------
  // Последовательность элементов (§15): мешки из разрешённых элементов — в каждом мешке все по разу, порядок от сида.
  // На экране у каждого игрока своя очередь NEXT (D-142); общий сид оставляет старт симметричным.
  function makeSequence(s) {
    var els = s.rules.els, out = [];
    if (!els.length) return out;
    while (out.length < T.seqLen) {
      var bag = els.slice();
      for (var i = bag.length - 1; i > 0; i--) { var j = Math.floor(rng(s) * (i + 1)), x = bag[i]; bag[i] = bag[j]; bag[j] = x; }
      if (bag.length > 1 && out.length && bag[0] === out[out.length - 1]) { bag.push(bag.shift()); } // без двух одинаковых подряд на стыке мешков
      out = out.concat(bag);
    }
    return out;
  }
  Sim.nextEl = function (s, side, k) { return s.seq.length ? s.seq[(s.ptr[side] + (k || 0)) % s.seq.length] : null; };
  function takeEl(s, side) { var e = Sim.nextEl(s, side); if (e) s.ptr[side]++; return e; }

  // Правила матча (ступени обучения, D-148): какие элементы, есть ли экономика эликсира, есть ли перки жаб
  Sim.defaultRules = function () { return { els: FB.ELEMENT_ORDER.slice(), economy: true, perks: true }; };

  // teams: [[k, k, k], [k, k, k]] — по три жабы (§6)
  Sim.createMatch = function (teamA, teamB, seed, rules) {
    var s = { seed: seed >>> 0, rng: seed >>> 0, teams: [teamA.slice(), teamB.slice()], rules: Object.assign(Sim.defaultRules(), rules || {}),
      turn: 0, turnSide: 0, phase: 'init', frogs: [], cells: [], seq: [], ptr: [0, 0], played: [0, 0], recalls: 0, recallTurn: [-99, -99], act: null, pending: null };
    s.seq = makeSequence(s);
    return s;
  };

  Sim.startMatch = function (s) {
    s.frogs = []; s.cells = [];
    for (var i = 0; i < NC * NR; i++) s.cells.push(emptyCell());
    for (var side = 0; side < 2; side++) for (var slot = 0; slot < s.teams[side].length; slot++) {
      var k = s.teams[side][slot], d = FB.FROGS[k], p = AR.slots[side][slot];
      s.frogs.push({ id: s.frogs.length, side: side, slot: slot, kind: k, x: p.x, y: p.y, r: d.r, hp: d.hp, maxHp: d.hp, def: d.def, mass: d.mass, imp: d.impact,
        alive: true, facing: side === 0 ? 0 : Math.PI, el: null, ch: 0, frozen: 0, anchor: 0 });
    }
    s.turn = 1; s.turnSide = 0; s.phase = 'play'; s.winner = null; s.recalls = 0; s.act = null; s.pending = null;
    var ev = [{ t: 'turn', side: 0, turn: 1 }];
    if (s.rules.economy) startTurn(s, ev); // старт (D-142): баки пусты, у каждой стороны в начале её первого хода база наливает по заряду — симметрично
    else s.frogs.forEach(function (f) { f.el = takeEl(s, f.side); f.ch = T.tank; }); // без экономики (обучение): бак всегда полон, элемент постоянный
    return ev;
  };

  // ---------- запросы ----------
  // Эликсир — топливо механической жабы (D-153): пустой бак — пружина не заведена, жаба стоит (но остаётся точкой эстафеты)
  Sim.isEmpty = function (s, f) { return !!s.rules.economy && f.ch <= 0; };
  Sim.canAct = function (s, f) {
    if (s.phase !== 'play' || !f.alive || f.side !== s.turnSide) return false;
    if (s.pending) return s.pending.frog === f.id;
    return !f.frozen && !Sim.isEmpty(s, f);
  };
  // «⟲ Домой» (D-153): только по решению игрока, бесплатно, до активации, любой своей жабе в поле; дома бак сразу наливается
  Sim.canRecall = function (s, f) {
    return s.rules.economy && s.phase === 'play' && !s.pending && !s.act && f.alive && f.side === s.turnSide && !Sim.onBase(f);
  };
  Sim.rangeFor = function (s, f, mode) {
    var r = mode === 'end' ? T.jumpR * T.relayAuto : T.jumpR, act = s.act && s.act.frog === f.id;
    if (mode !== 'end' && s.pending && s.pending.frog === f.id && act && s.act.perk === 'spring') r *= T.catapultMul; // перк Springjack (D-144)
    return r;
  };
  // Зона победы фляги растёт к концу матча (перегрузка фляг, D-149)
  Sim.flaskR = function (s, turn) {
    var t = turn === undefined ? s.turn : turn;
    return T.flaskR + Math.min(T.overloadMax, Math.max(0, t - T.overloadTurn + 1) * T.overloadGrow);
  };
  function enemiesOf(s, f) { return s.frogs.filter(function (e) { return e.alive && e.side !== f.side; }); }

  Sim.hiddenFrom = function () { return false; }; // сокрытия нет (D-123); бот и превью смотрят через perceived()
  Sim.perceived = function (s) { return Sim.clone(s); };

  // ---------- база: места, возврат, смерть ----------
  function freeSpot(s, side, f) {
    var occupied = function (p) { return s.frogs.some(function (o) { return o.alive && o.id !== f.id && dist(o.x, o.y, p.x, p.y) < o.r + f.r + 6; }); };
    var pref = AR.slots[side][f.slot];
    if (!occupied(pref)) return pref;
    var cand = AR.slots[side].concat(s.cells.map(function (cl, i) { return i; }).filter(function (i) { return baseOf(i) === side; }).map(center));
    for (var k = 0; k < cand.length; k++) if (!occupied(cand[k])) return cand[k];
    return pref;
  }
  function sendHome(s, f, events, why) {
    var from = { x: f.x, y: f.y }, p = freeSpot(s, f.side, f);
    f.x = p.x; f.y = p.y; f.ch = 0; f.el = null; f.frozen = 0; f.anchor = 0;
    events.push({ t: 'home', id: f.id, from: from, to: { x: p.x, y: p.y }, why: why });
  }

  // ---------- урон, смерть, отброс ----------
  function damage(s, f, amount, events, src) {
    if (!f.alive || amount <= 0) return 0;
    if (src !== 'slam') amount *= (1 - f.def / 100); // Defense
    amount = Math.max(1, Math.round(amount));
    f.hp -= amount;
    events.push({ t: 'hit', id: f.id, dmg: amount, src: src || 'hit' });
    if (f.hp <= 0) { // смерть (§26): жаба на базе с пустым баком и полным здоровьем — единственный случай, когда игра уводит её сама
      events.push({ t: 'death', id: f.id, x: f.x, y: f.y });
      f.hp = f.maxHp; if (!s.rules.economy) { var keepEl = f.el; sendHome(s, f, events, 'death'); f.el = keepEl; f.ch = T.tank; } else sendHome(s, f, events, 'death');
      if (s.pending && s.pending.frog === f.id) s.pending = null;
    }
    return amount;
  }
  // Не сдвинуть: Clingfoot, от которого отскочили, держится до конца хода врага (D-144). Замороженную сдвинуть можно (D-157)
  function immovable(s, e) {
    if (e.anchor) return 'anchor';
    return null;
  }
  Sim.immovable = immovable;
  function push(s, e, dir, amount, events, gentle) {
    if (!e.alive || amount <= 0) return;
    var why = !gentle && immovable(s, e);
    if (why) { events.push({ t: 'anchored', id: e.id, why: why }); return; }
    var from = { x: e.x, y: e.y }, x = e.x, y = e.y, hit = null, obs = obstacles(s).filter(function (o) { return !inObst(o, e.x, e.y, e.r * 0.8); }), step = 4;
    for (var t = step; t <= amount; t += step) {
      var nx = e.x + dir.x * t, ny = e.y + dir.y * t;
      if (!wallClear(nx, ny, e.r * 0.9)) { hit = 'wall'; break; }
      for (var k = 0; k < obs.length; k++) if (inObst(obs[k], nx, ny, e.r * 0.8)) { hit = 'column'; break; }
      if (hit) break;
      x = nx; y = ny;
    }
    e.x = x; e.y = y;
    events.push({ t: 'push', id: e.id, from: from, to: { x: x, y: y }, wall: hit });
    if (hit && !gentle) damage(s, e, T.slamDamage, events, 'slam');
  }
  function knockFrom(s, e, from, amount, events, fallback) {
    var d = norm(e.x - from.x, e.y - from.y); if (!d.l) d = fallback || { x: 0, y: 1 };
    push(s, e, d, amount, events);
  }
  function knockAmount(a, e, speed, mul) { return Math.max(T.kbMin, Math.min(T.kbMax * (mul || 1), T.kbBase * (mul || 1) * (T.kbSpeedMin + (1 - T.kbSpeedMin) * Math.min(1, speed)) * a.mass / e.mass)); }

  // ---------- команды ----------
  // cmd: { frog, dx, dy, mode: 'jump'|'end'|'recall'|'skip' }
  Sim.apply = function (s, cmd, opts) {
    opts = opts || {};
    var events = [], mode = cmd.mode || 'jump', f = s.frogs[cmd.frog];
    if (s.phase !== 'play') return { ok: false, events: events, why: 'over' };
    if (mode === 'skip') {
      if (s.pending) return { ok: false, events: events, why: 'mid-relay' };
      events.push({ t: 'skip', id: f ? f.id : undefined, side: s.turnSide });
      if (!opts.noEnd) endTurn(s, events);
      return { ok: true, events: events };
    }
    if (!f) return { ok: false, events: events, why: 'no frog' };
    if (mode === 'recall') { // «⟲ Домой» (§23, D-153): бесплатно, до активации; дома база сразу наливает новый бак — можно прыгать в этот же ход
      if (!Sim.canRecall(s, f)) return { ok: false, events: events, why: 'cannot recall' };
      s.recalls++;
      s.recallTurn[f.side] = s.turn;
      events.push({ t: 'recall', id: f.id });
      sendHome(s, f, events, 'recall');
      f.el = takeEl(s, f.side); f.ch = Math.min(T.tank, T.homeFill);
      events.push({ t: 'tick', id: f.id, ch: f.ch, el: f.el, fresh: true });
      return { ok: true, events: events, free: true };
    }
    if (!Sim.canAct(s, f)) return { ok: false, events: events, why: 'cannot act' };
    var P = s.pending;
    if (mode === 'end' && !P) return { ok: false, events: events, why: 'nothing pending' };
    if (!P) {
      s.act = { frog: f.id, used: {}, relays: 0, perk: null, amp: false, power: false, combo: null };
      events.push({ t: 'act', id: f.id, side: f.side });
    }
    var maxR = Sim.rangeFor(s, f, mode === 'end' ? 'end' : 'jump'); // до сброса pending: перк Springjack смотрит на него
    s.pending = null;
    var A = s.act, v;
    if (P) { // прыжок со спины союзника
      v = mode === 'end' ? { x: P.dir.x, y: P.dir.y } : norm(cmd.dx || 0, cmd.dy || 0);
      if (!v.x && !v.y) v = { x: P.dir.x, y: P.dir.y };
    }
    var len = mode === 'end' ? maxR : Math.min(norm(cmd.dx || 0, cmd.dy || 0).l, maxR);
    if (mode !== 'end' && len < 1) { len = T.jumpR * T.minPull; }
    var cont = jump(s, f, mode === 'end' ? v : { x: cmd.dx || 0, y: cmd.dy || 0 }, len, events, !!P);
    if (cont && s.phase === 'play') return { ok: true, events: events, continues: true, pending: s.pending };
    s.pending = null;
    if (!opts.noEnd && s.phase === 'play') endTurn(s, events);
    return { ok: true, events: events };
  };

  function jump(s, f, dirv, len, events, fromAlly) {
    var v = norm(dirv.x, dirv.y);
    if (v.l < 1e-6) v = { x: 0, y: f.side === 0 ? -1 : 1, l: 1 };
    var from = { x: f.x, y: f.y }, A = s.act;
    var fl = Sim.flight(s, f, from, v, len, { h0: fromAlly ? T.perchH : 0, relay: fromAlly });
    f.facing = Math.atan2(fl.dir.x, -fl.dir.y);
    events.push({ t: 'jump', id: f.id, segs: fl.segs, relay: fromAlly });
    fl.segs.forEach(function (sg) { if (sg.hit) events.push({ t: 'bounce', id: f.id, x: sg.to.x, y: sg.to.y, kind: sg.hit }); });
    return land(s, f, fl.land, fl.dir, len / T.jumpR, events, A);
  }

  // Приземление: союзник — эстафета (§9), враг — бой (§10), иначе — финальное приземление
  function land(s, f, L, dir, speed, events, A) {
    obstacles(s).forEach(function (ob) { var r = inObst(ob, L.x, L.y, f.r); if (r) L = { x: L.x + r.n.x * (r.pen + 1), y: L.y + r.n.y * (r.pen + 1) }; });
    if (!wallClear(L.x, L.y, f.r * 0.8)) { var ne = nearestEdge(L.x, L.y); L = { x: L.x + ne.e.n.x * (f.r - ne.d + 1), y: L.y + ne.e.n.y * (f.r - ne.d + 1) }; }
    var enemy = null, ally = null, best = 1e9;
    s.frogs.forEach(function (e) {
      if (!e.alive || e.id === f.id) return;
      var d = dist(L.x, L.y, e.x, e.y);
      if (d <= f.r + e.r + T.contactAssist && d < best) { best = d; if (e.side === f.side) { ally = e; enemy = null; } else { enemy = e; ally = null; } }
    });

    if (ally && !A.used[ally.id]) { // эстафета: активация продолжается, клетку не красим (§9)
      A.used[ally.id] = true; A.relays++;
      // перк жабы, от которой отскочили (D-144) — как Friendship Combo в Monster Strike
      var perk = s.rules.perks ? ally.kind : null;
      A.perk = perk;
      if (perk === 'bellows') A.amp = true;
      if (perk === 'spur') A.power = true;
      if (perk === 'cling') ally.anchor = 1;
      // комбо через союзника (D-127, D-143): элемент союзника другого цвета — реакция пары в конце цепочки, без условия заряда
      var comboKey = null;
      if (!A.combo && ally.el && f.el && ally.el !== f.el) A.combo = comboKey = FB.reactionKey(f.el, ally.el);
      f.x = ally.x; f.y = ally.y;
      events.push({ t: 'land', id: f.id, x: f.x, y: f.y, onAlly: ally.id, perch: true });
      events.push({ t: 'relay', id: f.id, ally: ally.id, n: A.relays, perk: perk, combo: comboKey, els: comboKey ? [f.el, ally.el] : null });
      s.pending = { kind: 'relay', frog: f.id, dir: { x: dir.x, y: dir.y }, onAlly: ally.id };
      return true;
    }
    if (ally) { // этот союзник уже был точкой эстафеты — соскакивает рядом
      var bk = norm(dir.x, dir.y); if (bk.l < 1e-6) bk = norm(L.x - ally.x, L.y - ally.y);
      L = { x: ally.x + bk.x * (f.r + ally.r + 10), y: ally.y + bk.y * (f.r + ally.r + 10) };
      if (!wallClear(L.x, L.y, f.r * 0.8)) L = { x: ally.x - bk.x * (f.r + ally.r + 10), y: ally.y - bk.y * (f.r + ally.r + 10) };
    }
    f.x = L.x; f.y = L.y;
    events.push({ t: 'land', id: f.id, x: f.x, y: f.y, onEnemy: enemy ? enemy.id : undefined });

    if (enemy) { // бой (§10): урон и отброс, эстафеты нет
      var pw = A.power ? T.spurPerkMul : 1; // перк Spur Knight: удар сильнее и задевает соседей
      var imp = (T.impactBase + T.impactSpeed * Math.min(1, speed)) * f.imp * pw;
      events.push({ t: 'impact', id: enemy.id, by: f.id, x: enemy.x, y: enemy.y, power: A.power });
      var eid = enemy.id, ex = enemy.x, ey = enemy.y, anchored = immovable(s, enemy) === 'anchor';
      if (A.power) {
        var near = enemiesOf(s, f).filter(function (o) { return o.id !== eid && dist(o.x, o.y, ex, ey) <= T.breachR + o.r; });
        near.forEach(function (o) { damage(s, o, imp * T.breachMul, events, 'splash'); if (o.alive) knockFrom(s, o, { x: ex, y: ey }, T.breachKnock, events, dir); });
      }
      damage(s, enemy, imp, events, 'impact');
      if (anchored && s.frogs[eid].x === ex) { // якорь: связанную жабу не сдвинуть — напавшая отлетает сама
        var rb = norm(f.x - ex, f.y - ey); if (!rb.l) rb = { x: -dir.x, y: -dir.y };
        f.x = ex + rb.x * (enemy.r + f.r + 4); f.y = ey + rb.y * (enemy.r + f.r + 4);
        events.push({ t: 'label', id: eid, text: '⚓ ANCHOR' });
        push(s, f, rb, T.anchorRecoil, events);
      }
      if (enemy.x === ex && enemy.y === ey) { var kd = norm(enemy.x - f.x, enemy.y - f.y); push(s, enemy, kd.l > 1 ? kd : dir, knockAmount(f, enemy, speed, A.power ? 1.3 : 1), events); }
      var e2 = s.frogs[eid]; // враг не сдвинулся (якорь, стена) — атакующая соскакивает назад, чтобы не стоять внутри
      if (dist(e2.x, e2.y, f.x, f.y) < e2.r + f.r) {
        var back = norm(f.x - e2.x, f.y - e2.y); if (!back.l) back = { x: -dir.x, y: -dir.y };
        var nx = e2.x + back.x * (e2.r + f.r + 4), ny = e2.y + back.y * (e2.r + f.r + 4);
        if (!wallClear(nx, ny, f.r * 0.8)) { nx = e2.x - back.x * (e2.r + f.r + 4); ny = e2.y - back.y * (e2.r + f.r + 4); }
        events.push({ t: 'push', id: f.id, from: { x: f.x, y: f.y }, to: { x: nx, y: ny }, soft: true }); f.x = nx; f.y = ny;
      }
    }
    return finalLanding(s, f, dir, events, A);
  }

  // Финальное приземление (§8, §18, §19): фляга врага, ледяная горка, огонь, комбо или элемент в клетку, заряд
  function finalLanding(s, f, dir, events, A) {
    var fk = AR.flasks[1 - f.side];
    if (dist(f.x, f.y, fk.x, fk.y) <= Sim.flaskR(s) + f.r * 0.5) { // победа (§3): любая жаба; зона растёт к концу матча (D-149)
      events.push({ t: 'flask', id: f.id, side: f.side, from: { x: f.x, y: f.y }, to: { x: fk.x, y: fk.y } }); // с края зоны жаба ныряет в саму колбу (D-155)
      f.x = fk.x; f.y = fk.y;
      spendCharge(s, f, events, A);
      finish(s, f.side, events, 'flask');
      return false;
    }
    var own = AR.flasks[f.side];
    if (dist(f.x, f.y, own.x, own.y) < T.flaskR + f.r) slideOff(s, f, own, T.flaskR, events); // на свою флягу не встать — иначе её можно закрыть телом (D-112)
    var i = cellIdx(f.x, f.y);
    if (A.combo && baseOf(i) < 0) brew(s, f, i, A.combo.split('+'), 1, dir, events, A.amp, true); // эстафета через союзника другой стихии — варка в точке приземления (D-157)
    else if (baseOf(i) < 0) resolveCell(s, f, i, dir, events, A);
    spendCharge(s, f, events, A);
    return false;
  }

  function slideOff(s, f, fk, R, events) { // соскальзывает к краю зоны фляги
    var od = norm(f.x - fk.x, f.y - fk.y);
    if (!od.l) od = { x: 0, y: fk.y > (AR.y0 + AR.h / 2) ? -1 : 1, l: 1 };
    var to = { x: fk.x + od.x * (R + f.r + 4), y: fk.y + od.y * (R + f.r + 4) };
    if (!wallClear(to.x, to.y, f.r)) to = { x: fk.x + (od.x >= 0 ? 1 : -1) * (R + f.r + 4), y: fk.y };
    if (!wallClear(to.x, to.y, f.r)) to = { x: fk.x, y: fk.y + (fk.y > (AR.y0 + AR.h / 2) ? -1 : 1) * (R + f.r + 4) };
    events.push({ t: 'push', id: f.id, from: { x: f.x, y: f.y }, to: to, soft: true }); f.x = to.x; f.y = to.y;
  }
  function spendCharge(s, f, events, A) {
    if (!s.rules.economy) return;
    if (f.ch > 0) f.ch--;
    events.push({ t: 'spend', id: f.id, ch: f.ch, empty: f.ch <= 0 && !Sim.onBase(f) }); // бак кончился в поле — жаба встаёт (D-153)
  }
  // ---------- зельеварка (D-157) ----------
  // Приземление красит клетку стихией жабы. Та же стихия — уровень клетки растёт (до 3; лёд третьего уровня — кристальная стена).
  // Другая стихия — варка: обе стихии срабатывают на крест вокруг клетки (клетка и 4 соседние), окрашенные клетки в кресте
  // взрываются своей стихией по цепочке. У каждой стихии одно действие, всегда одно и то же; бьёт только врагов того, кто сварил.
  function resolveCell(s, f, i, dir, events, A) {
    var cl = s.cells[i], el = f.el;
    if (!el || cl.t === 'column') return;
    if (cl.el && cl.el !== el) return brew(s, f, i, [el, cl.el], cl.lv || 1, dir, events, A.amp);
    if (cl.el === el) {
      if (cl.lv >= T.lvMax) return;
      var lv = cl.lv + 1;
      if (el === 'ice' && lv >= T.lvMax) return raiseWall(s, f, i, dir, events);
      setCell(s, i, { lv: lv }, events);
      events.push({ t: 'stack', i: i, el: el, lv: lv });
      return;
    }
    setCell(s, i, { el: el, lv: 1 }, events);
  }
  // Лёд третьего уровня — кристальная стена (§21, D-145); последний путь между базами не закрыть (правило Quoridor)
  function raiseWall(s, f, i, dir, events) {
    s.cells[i].t = 'column'; var ok = pathOpen(s); s.cells[i].t = null;
    if (!ok) { setCell(s, i, { lv: T.lvMax }, events); events.push({ t: 'blocked', i: i }); return; }
    setCell(s, i, { el: null, t: 'column', side: f.side }, events);
    events.push({ t: 'wall', i: i, side: f.side });
    ejectFromColumns(s, f, dir, events);
  }

  // Колонна не должна закрыть все пути между базами (правило Quoridor, D-145)
  function pathOpen(s) {
    var seen = {}, q = [];
    for (var c = 0; c < NC; c++) { var i0 = idx(c, NR - 1); if (s.cells[i0].t !== 'column') { seen[i0] = 1; q.push(i0); } }
    while (q.length) {
      var i = q.shift();
      if (Math.floor(i / NC) === 0) return true;
      neighbors4(i).forEach(function (j) { if (!seen[j] && s.cells[j].t !== 'column') { seen[j] = 1; q.push(j); } });
    }
    return false;
  }
  Sim.pathOpen = pathOpen;

  Sim.cross = function (i, wide) { return wide ? square(i, 1) : [i].concat(neighbors4(i)); };
  // Варка: els — стихии (две, а у клетки цепочки одна своя), lv — уровень клетки (сила ×1 / ×1.5 / ×2), amp — перк Bellows (×1.5 и 3×3)
  function brew(s, f, i, els, lv, dir, events, amp, combo) {
    var p0 = center(i), queue = [{ i: i, els: els, lv: lv, n: 0 }], done = {}, n = 0;
    done[i] = 1;
    events.push({ t: 'brew', id: f.id, i: i, x: p0.x, y: p0.y, els: els.slice(), lv: lv, amp: !!amp, combo: !!combo, cells: Sim.cross(i, amp) });
    while (queue.length) {
      var q = queue.shift(), c0 = center(q.i), wide = amp && !q.n, area = Sim.cross(q.i, wide);
      var k = T.lvMul[Math.max(1, Math.min(T.lvMax, q.lv)) - 1] * (wide ? T.ampMul : 1);
      if (s.cells[q.i].el) setCell(s, q.i, { el: null }, events); // сварено — клетка чистая, лужи остаются
      if (q.n) events.push({ t: 'pop', i: q.i, x: c0.x, y: c0.y, el: q.els[0], lv: q.lv, n: q.n, cells: area });
      applyAtoms(s, f, q.els, area, c0, k, dir, events);
      area.forEach(function (j) { // цепочка: окрашенные клетки в кресте взрываются своей стихией
        var c = s.cells[j];
        if (done[j] || !c.el || baseOf(j) >= 0 || n >= T.chainMax) return;
        done[j] = 1; queue.push({ i: j, els: [c.el], lv: c.lv || 1, n: ++n });
      });
    }
  }
  // Действия стихий (D-157): 🔥 урон и растапливает лёд · ❄ заморозка · ☠ лужа яда · ⚡ отброс — отброс всегда последним
  function applyAtoms(s, f, els, area, c0, k, dir, events) {
    function foes() { return enemiesOf(s, f).filter(function (e) { return area.indexOf(cellIdx(e.x, e.y)) >= 0; }); }
    if (els.indexOf('fire') >= 0) {
      foes().forEach(function (e) { damage(s, e, T.fireDmg * k, events, 'fire'); });
      area.forEach(function (j) { if (s.cells[j].t === 'column') { setCell(s, j, { t: null }, events); events.push({ t: 'melt', i: j }); } });
    }
    if (els.indexOf('ice') >= 0) foes().forEach(function (e) { if (!e.frozen) { e.frozen = 1; events.push({ t: 'frozen', id: e.id }); } });
    if (els.indexOf('poison') >= 0) area.forEach(function (j) {
      if (baseOf(j) >= 0 || s.cells[j].t === 'column') return;
      setCell(s, j, { pz: T.puddleTurns, pd: Math.round(T.puddleDmg * k), pside: f.side }, events);
    });
    if (els.indexOf('lightning') >= 0) foes().forEach(function (e) { knockFrom(s, e, c0, T.shockKnock * k, events, dir); });
  }
  // Колонна поднялась под жабой — жаба выталкивается в ближайшую свободную клетку (назад по ходу прыжка, если можно)
  function ejectFromColumns(s, f, dir, events) {
    s.frogs.forEach(function (o) {
      if (!o.alive) return;
      var i = cellIdx(o.x, o.y); if (s.cells[i].t !== 'column') return;
      var opts = square(i, 1).concat(square(i, 2)).filter(function (j) { return s.cells[j].t !== 'column'; });
      var want = { x: o.x - dir.x * C, y: o.y - dir.y * C };
      opts.sort(function (a, b) { var pa = center(a), pb = center(b); return dist(pa.x, pa.y, want.x, want.y) - dist(pb.x, pb.y, want.x, want.y); });
      var to = null;
      for (var k = 0; k < opts.length && !to; k++) {
        var q = center(opts[k]);
        if (wallClear(q.x, q.y, o.r) && !s.frogs.some(function (z) { return z.alive && z.id !== o.id && dist(z.x, z.y, q.x, q.y) < z.r + o.r; })) to = q;
      }
      if (!to) to = center(opts[0]);
      events.push({ t: 'push', id: o.id, from: { x: o.x, y: o.y }, to: { x: to.x, y: to.y }, soft: true });
      o.x = to.x; o.y = to.y;
    });
  }

  // ---------- ход (§28) ----------
  function endTurn(s, events) {
    s.played[s.turnSide]++;
    s.frogs.forEach(function (f) { if (f.side === s.turnSide && f.frozen) { f.frozen = 0; events.push({ t: 'thaw', id: f.id }); } }); // лёд держит один свой ход (D-125)
    s.act = null; s.pending = null; s.recalls = 0;
    if (s.phase !== 'play') return;
    s.turnSide = 1 - s.turnSide; s.turn++;
    if (s.turn > T.turnCap) return decideByProgress(s, events);
    events.push({ t: 'turn', side: s.turnSide, turn: s.turn });
    startTurn(s, events);
  }
  Sim.progress = function (s, side) { // насколько близко ближайшая жаба стороны к фляге врага (меньше — ближе)
    var fk = AR.flasks[1 - side], b = 1e9;
    s.frogs.forEach(function (f) { if (f.side === side && f.alive) b = Math.min(b, dist(f.x, f.y, fk.x, fk.y)); });
    return b;
  };
  // Начало хода: якорь Clingfoot отпускает, лужа яда врага жжёт и подсыхает, перегрузка фляг, база наливает (§14, D-149, D-157)
  function startTurn(s, events) {
    var side = s.turnSide;
    s.frogs.forEach(function (f) { if (f.side === side && f.anchor) { f.anchor = 0; events.push({ t: 'unanchor', id: f.id }); } });
    s.frogs.forEach(function (f) {
      if (f.side !== side || !f.alive) return;
      var cl = s.cells[cellIdx(f.x, f.y)];
      if (cl.pz > 0 && cl.pside !== side) { events.push({ t: 'burn', id: f.id, src: 'poison' }); damage(s, f, cl.pd, events, 'poison'); }
    });
    s.cells.forEach(function (cl, i) { if (cl.pz > 0 && cl.pside !== side) setCell(s, i, { pz: cl.pz - 1 }, events); }); // лужа живёт puddleTurns ходов того, кого жжёт
    if (s.turn >= T.overloadTurn && Sim.flaskR(s) > Sim.flaskR(s, s.turn - 1)) events.push({ t: 'overload', r: Sim.flaskR(s), first: s.turn === T.overloadTurn });
    if (!s.rules.economy) return;
    var extra = side === 1 && !s.played[1] ? T.secondBonus || 0 : 0; // второй ходящий: в первый ход столько жаб получают +1 сверх налива (D-152)
    s.frogs.forEach(function (f) {
      if (f.side !== side || !f.alive || !Sim.onBase(f)) return;
      var fresh = !f.ch, add = 1 + (extra-- > 0 ? 1 : 0);
      if (fresh) { f.el = takeEl(s, side); f.ch = Math.min(T.tank, add); }
      else if (f.ch < T.tank) f.ch = Math.min(T.tank, f.ch + add);
      else return;
      events.push({ t: 'tick', id: f.id, ch: f.ch, el: f.el, fresh: fresh });
    });
  }
  function decideByProgress(s, events) {
    var a = Sim.progress(s, 0), b = Sim.progress(s, 1);
    finish(s, Math.abs(a - b) < 1 ? -1 : (a < b ? 0 : 1), events, 'cap');
  }
  function finish(s, w, events, why) {
    s.phase = 'over'; s.why = why; s.winner = w;
    events.push({ t: 'over', winner: w, why: why });
  }

  // Досягаемость стороны (D-146): куда каждая её жаба дотянется одной активацией с эстафетой через своих.
  // next=true — для следующего хода этой стороны (база успеет налить заряд, лёд к тому времени держит). Для «шаха» и бота.
  Sim.reach = function (s, side, next) {
    var fk = AR.flasks[1 - side], fr = Sim.flaskR(s, next ? s.turn + 1 : s.turn), rings = [], win = null, best = 1e9;
    var mates = s.frogs.filter(function (f) { return f.alive && f.side === side; });
    mates.forEach(function (st) {
      if (st.frozen) return;
      var start = st, onBase = Sim.onBase(st);
      if (s.rules.economy && st.ch + (next && onBase ? 1 : 0) <= 0) { // пустая в поле не прыгает (D-153) — только ступенька; к следующему ходу её могут вернуть «⟲ Домой» и сразу прыгнуть с базы
        if (!next || onBase) return;
        var p = AR.slots[side][st.slot]; start = { id: st.id, x: p.x, y: p.y };
      }
      var R = T.jumpR, seen = {}, queue = [{ f: start, path: [{ x: start.x, y: start.y }] }];
      seen[st.id] = 1;
      while (queue.length) {
        var n = queue.shift(), d = dist(n.f.x, n.f.y, fk.x, fk.y) - R - fr;
        rings.push({ x: n.f.x, y: n.f.y, r: R });
        if (d < best) best = d;
        if (d <= 0 && (!win || n.path.length < win.length)) win = n.path.concat([{ x: fk.x, y: fk.y }]);
        mates.forEach(function (m) { if (!seen[m.id] && dist(n.f.x, n.f.y, m.x, m.y) <= R) { seen[m.id] = 1; queue.push({ f: m, path: n.path.concat([{ x: m.x, y: m.y }]) }); } });
      }
    });
    return { rings: rings, win: win, remaining: best };
  };

  // Превью (§19: всё видно по траектории): та же функция на копии того, что видит сторона
  Sim.preview = function (s, cmd, viewer) {
    var c = viewer === undefined ? Sim.clone(s) : Sim.perceived(s, viewer);
    var r = Sim.apply(c, cmd, { noEnd: true });
    return { state: c, events: r.events, ok: r.ok, pending: c.pending };
  };
})();
