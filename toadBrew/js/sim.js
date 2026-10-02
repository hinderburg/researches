// Пошаговая симуляция боя (D-002, D-003). Без DOM и Canvas: состояние — простой объект, ход — команда.
// apply(state, cmd) меняет состояние и возвращает список событий для анимации. Случайность — только от сида.
(function () {
  var T = FB.T;
  var Sim = {};
  FB.Sim = Sim;

  // ---------- утилиты ----------
  function rng(state) { // mulberry32 в состоянии — клоны детерминированы
    var t = (state.rng = (state.rng + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function dist(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }
  function norm(x, y) { var l = Math.sqrt(x * x + y * y); return l > 1e-6 ? { x: x / l, y: y / l, l: l } : { x: 0, y: 0, l: 0 }; }
  function clampXY(p) {
    p.x = Math.max(T.margin, Math.min(T.W - T.margin, p.x));
    p.y = Math.max(T.margin, Math.min(T.H - T.margin, p.y));
    return p;
  }
  Sim.dist = dist;
  Sim.norm = norm;
  Sim.clone = function (s) { return JSON.parse(JSON.stringify(s)); };

  // ---------- создание ----------
  Sim.createMatch = function (teamA, teamB, seed) {
    var s = {
      seed: seed >>> 0, rng: seed >>> 0,
      teams: [teamA.slice(), teamB.slice()],
      bonus: [FB.findPair(teamA[0], teamA[1]), FB.findPair(teamB[0], teamB[1])],
      round: 0, score: [0, 0], roundStarter: 1, // startRound переключит → первый раунд начинает игрок
      phase: 'init', frogs: [], pads: [], clouds: [], log: []
    };
    return s;
  };

  function buildPads(s) {
    var half = FB.PADS_HALF, pads = [], j = s.round > 1 ? T.padJitter : 0;
    // Сколько раз кувшинка ещё всплывёт (D-020): чем больше, тем больше раз
    function livesFor(r) { for (var i = 0; i < T.padLives.length; i++) if (r >= T.padLives[i][0]) return T.padLives[i][1]; return 1; }
    for (var i = 0; i < half.length; i++) {
      var h = half[i];
      var jx = h.start !== undefined ? 0 : (rng(s) * 2 - 1) * j;
      var jy = h.start !== undefined ? 0 : (rng(s) * 2 - 1) * j;
      var jr = h.start !== undefined ? 0 : Math.round((rng(s) * 2 - 1) * j / 3);
      var r = h.r + jr;
      pads.push({ x: h.x + jx, y: h.y + jy, r: r, start: h.start, side: 0 });
      pads.push({ x: T.W - (h.x + jx), y: T.H - (h.y + jy), r: r, start: h.start, side: 1 });
    }
    var c = FB.PAD_CENTER;
    pads.push({ x: c.x, y: c.y, r: c.r });
    for (var k = 0; k < pads.length; k++) {
      var p = pads[k];
      // cap/wear — прогресс затопления для отрисовки: wear из cap ходов уже прошло (D-025)
      p.id = k; p.cap = 1; p.wear = 0; p.sinkLeft = null; p.state = 'stable'; p.subTimer = 0; p.lives = livesFor(p.r);
    }
    return pads;
  }

  function makeFrog(s, side, slot, kind) {
    var d = FB.FROGS[kind], b = s.bonus[side];
    var hp = Math.round(d.hp * (b && b.hpMul ? b.hpMul : 1));
    return {
      id: side * 2 + slot, side: side, slot: slot, kind: kind,
      x: 0, y: 0, r: d.r, weight: d.weight,
      hp: hp, maxHp: hp, st: d.st, maxSt: d.st, dmg: d.dmg,
      range: Math.round(d.range * (b && b.rangeMul ? b.rangeMul : 1)), dash: d.dash, knock: d.knock,
      alive: true, inWater: false, pad: -1, turnMul: 1,
      poison: 0, bleed: 0, bleedTurns: 0, shield: 0, shieldTurns: 0, trapped: 0
    };
  }

  Sim.startRound = function (s) {
    s.round++;
    s.roundStarter = 1 - s.roundStarter;
    s.pads = buildPads(s);
    s.frogs = [];
    for (var side = 0; side < 2; side++) {
      for (var slot = 0; slot < 2; slot++) {
        var f = makeFrog(s, side, slot, s.teams[side][slot]);
        var pad = null;
        for (var i = 0; i < s.pads.length; i++) if (s.pads[i].side === side && s.pads[i].start === slot) pad = s.pads[i];
        f.x = pad.x; f.y = pad.y; f.pad = pad.id;
        s.frogs.push(f);
        touchPad(s, pad, f, null); // стартовая кувшинка тоже начинает тонуть — иначе на ней можно сидеть вечно
      }
    }
    s.clouds = [];
    s.turnSide = s.roundStarter;
    s.turnCount = [0, 0];
    resetTurn(s);
    s.phase = 'play';
    s.roundWinner = null;
    return [{ t: 'roundStart', round: s.round, side: s.turnSide }];
  };

  // ---------- геометрия ----------
  Sim.padAt = function (s, x, y) {
    var best = null, bd = 1e9;
    for (var i = 0; i < s.pads.length; i++) {
      var p = s.pads[i];
      if (p.state !== 'stable') continue;
      var d = dist(x, y, p.x, p.y);
      if (d <= p.r && d < bd) { bd = d; best = p; }
    }
    return best;
  };

  // Жаба попала на кувшинку — та начинает тонуть, и это не отменить, даже если жаба уйдёт (D-025)
  function touchPad(s, p, f, events) {
    if (p.state !== 'stable' || p.sinkLeft !== null) return;
    var total = (p.r >= T.padBigR ? T.padSinkBig : T.padSinkSmall) - (f.weight > 1 ? 1 : 0);
    p.sinkLeft = total; p.cap = total; p.wear = 0;
    if (events) events.push({ t: 'padTouch', pad: p.id });
  }

  // Состояние хода: какая жаба ходит, сколько оттяжек осталось, попадания в кольцо (D-026, D-027)
  function resetTurn(s) {
    s.active = null; s.pullsLeft = 0; s.pullsUsed = 0; s.qteHits = 0; s.abilityUsed = false;
  }
  Sim.pullsFor = function (s, f) { var b = s.bonus[f.side]; return T.pullsPerTurn + (b && b.pulls ? b.pulls : 0); };

  // Поставить жабу в точку: кувшинка или вода (§4)
  function place(s, f, x, y, events) {
    var p = clampXY({ x: x, y: y });
    f.x = p.x; f.y = p.y;
    if (!f.alive) { f.inWater = true; f.pad = -1; return; }
    var pad = Sim.padAt(s, f.x, f.y);
    f.pad = pad ? pad.id : -1;
    f.inWater = !pad;
    if (pad) touchPad(s, pad, f, events);
  }

  function enemiesOf(s, f) { return s.frogs.filter(function (e) { return e.alive && e.side !== f.side; }); }

  Sim.rangeFor = function (s, f, mode) {
    var d = FB.FROGS[f.kind];
    if (mode === 'move') return f.inWater ? f.dash : f.range;
    if (mode === 'rest') return 0;
    switch (d.ability) {
      case 'hop': return f.range;
      case 'slam': return f.range * T.slamRangeMul;
      case 'cloud': return T.cloudRange;
      case 'tongue': return T.tongueRange;
      case 'spin': return T.spinRadius;
      case 'bubble': return T.bubbleRange;
    }
    return 0;
  };

  // Какой прицел у режима: arc — прыжок/бросок по параболе, line — по прямой, radius — вокруг себя
  Sim.aimKind = function (s, f, mode) {
    if (mode === 'move') return f.inWater ? 'line' : 'arc';
    var a = FB.FROGS[f.kind].ability;
    if (a === 'tongue') return 'line';
    if (a === 'spin') return 'radius';
    return 'arc';
  };

  // Доступные действия выбранной жабы
  Sim.canAct = function (s, f) {
    return s.phase === 'play' && f.alive && f.side === s.turnSide && f.trapped <= 0 &&
      (s.active === null || s.active === f.id);
  };
  Sim.abilityAvailable = function (s, f) {
    if (s.abilityUsed) return false;              // одна способность за ход (D-026)
    var a = FB.FROGS[f.kind].ability;
    if (f.st < T.abilityStaminaCost) return false;
    if ((a === 'hop' || a === 'slam') && f.inWater) return false; // прыжковые — только с кувшинки
    return true;
  };

  // ---------- урон и статусы ----------
  function damage(s, f, amount, events, src) {
    if (!f.alive || amount <= 0) return 0;
    var absorbed = 0;
    if (f.shield > 0) { absorbed = Math.min(f.shield, amount); f.shield -= absorbed; amount -= absorbed; if (f.shield <= 0) f.shieldTurns = 0; }
    f.hp -= amount;
    events.push({ t: 'hit', id: f.id, dmg: amount, absorbed: absorbed, src: src || 'hit' });
    if (f.hp <= 0) {
      f.hp = 0; f.alive = false; f.inWater = true; f.pad = -1;
      f.poison = 0; f.bleed = 0; f.bleedTurns = 0; f.trapped = 0; f.shield = 0;
      events.push({ t: 'death', id: f.id, x: f.x, y: f.y });
    }
    return amount;
  }

  function hitDamage(s, a, e, mul) {
    var b = s.bonus[a.side];
    var m = mul * (e.inWater ? T.waterVulnerability : 1);
    if (b && b.bleedDmgMul && e.bleed > 0) m *= b.bleedDmgMul;
    m *= a.turnMul || 1;                          // бонус за попадание в кольцо (D-027)
    return Math.round(a.dmg * m);
  }

  function addPoison(s, e, events) {
    if (!e.alive) return;
    var fresh = e.poison <= 0;
    e.poison = T.poisonTurns;
    events.push({ t: 'status', id: e.id, s: 'poison', fresh: fresh });
  }
  function addBleed(s, e, events) {
    if (!e.alive) return;
    e.bleed = Math.min(T.bleedMaxStacks, e.bleed + 1);
    e.bleedTurns = T.bleedTurns;
    events.push({ t: 'status', id: e.id, s: 'bleed', val: e.bleed });
  }

  // Пассивки при контактном ударе (§8)
  function onContact(s, a, e, events) {
    var b = s.bonus[a.side];
    if (a.kind === 'poison') addPoison(s, e, events);
    if (a.kind === 'spur') addBleed(s, e, events);
    if (a.kind === 'bulwark' && b && b.bulwarkBleed) addBleed(s, e, events);
  }

  // Сдвинуть врага (отброс / подтягивание) с проверкой «упал в воду» (§7)
  function push(s, a, e, nx, ny, events, kind) {
    if (!e.alive) return;
    var from = { x: e.x, y: e.y }, wasWater = e.inWater;
    place(s, e, nx, ny, events);
    events.push({ t: kind || 'push', id: e.id, from: from, to: { x: e.x, y: e.y }, water: e.inWater });
    var b = s.bonus[a.side];
    if (!wasWater && e.inWater) {
      events.push({ t: 'splash', x: e.x, y: e.y, big: true });
      if (b && b.waterDrain && e.st > 0) { e.st = Math.max(0, e.st - b.waterDrain); events.push({ t: 'status', id: e.id, s: 'drain' }); }
    }
  }

  // Контактный удар a по e с направлением dir
  function strike(s, a, e, dir, mul, knock, events) {
    var dmg = hitDamage(s, a, e, mul);
    events.push({ t: 'impact', id: e.id, by: a.id, x: e.x, y: e.y });
    damage(s, e, dmg, events, 'hit');
    if (!e.alive) return;
    onContact(s, a, e, events);
    if (knock > 0) push(s, a, e, e.x + dir.x * knock, e.y + dir.y * knock, events, 'push');
  }

  // Ближайший враг/союзник в точке приземления
  function contactAt(s, a, x, y, side) {
    var best = null, bd = 1e9;
    for (var i = 0; i < s.frogs.length; i++) {
      var e = s.frogs[i];
      if (!e.alive || e.id === a.id) continue;
      if (side === 'enemy' && e.side === a.side) continue;
      if (side === 'ally' && e.side !== a.side) continue;
      var d = dist(x, y, e.x, e.y);
      if (d <= a.r + e.r + T.contactAssist && d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // ---------- действия ----------
  // Прыжок по параболе: в полёте ни с кем не сталкивается, удар — при приземлении (D-006)
  function doJump(s, f, vx, vy, maxRange, events, opts) {
    opts = opts || {};
    var v = norm(vx, vy), len = Math.min(v.l, maxRange);
    var dir = v.l > 0 ? v : { x: 0, y: f.side === 0 ? -1 : 1 };
    var from = { x: f.x, y: f.y };
    var L = clampXY({ x: f.x + dir.x * len, y: f.y + dir.y * len });
    var travelled = dist(from.x, from.y, L.x, L.y);
    var enemy = contactAt(s, f, L.x, L.y, 'enemy');
    var lx = L.x, ly = L.y;
    if (enemy) { // отскок: встаём вплотную перед целью
      var back = norm(L.x - from.x, L.y - from.y);
      if (back.l < 1e-6) back = dir;
      lx = enemy.x - back.x * (f.r + enemy.r + 1); ly = enemy.y - back.y * (f.r + enemy.r + 1);
    } else {
      var ally = contactAt(s, f, L.x, L.y, 'ally');
      if (ally) {
        var bk = norm(L.x - ally.x, L.y - ally.y); if (bk.l < 1e-6) bk = { x: -dir.x, y: -dir.y };
        lx = ally.x + bk.x * (f.r + ally.r + 1); ly = ally.y + bk.y * (f.r + ally.r + 1);
      }
    }
    var wasWater = f.inWater;
    place(s, f, lx, ly, events);
    events.push({ t: 'jump', id: f.id, from: from, to: { x: f.x, y: f.y }, len: travelled, water: f.inWater, slam: !!opts.slam });
    if (f.inWater) events.push({ t: 'splash', x: f.x, y: f.y, big: false });
    else events.push({ t: 'padBob', pad: f.pad, w: f.weight });
    var longLeap = f.kind === 'jumper' && travelled >= T.jumperLongLeapFrac * f.range;
    if (opts.slam) {
      events.push({ t: 'slam', id: f.id, x: f.x, y: f.y, r: T.slamRadius });
      var targets = enemiesOf(s, f).filter(function (e) { return dist(e.x, e.y, f.x, f.y) <= T.slamRadius + e.r; });
      targets.forEach(function (e) {
        var d = norm(e.x - f.x, e.y - f.y); if (d.l < 1e-6) d = dir;
        strike(s, f, e, d, T.slamDamageMul, T.slamKnock, events);
      });
    } else if (enemy) {
      if (longLeap) events.push({ t: 'label', id: f.id, text: 'LONG LEAP!' });
      strike(s, f, enemy, dir, longLeap ? T.jumperLongLeapMul : 1, f.knock, events);
    }
    return { enemy: enemy, landedWater: f.inWater && !wasWater };
  }

  // Рывок в воде по прямой: может протаранить врага и выйти на кувшинку (§4.2)
  function doDash(s, f, vx, vy, events) {
    var v = norm(vx, vy), len = Math.min(v.l, f.dash);
    if (v.l < 1e-6) return;
    var from = { x: f.x, y: f.y };
    if (f.st >= T.dashStaminaCost) { f.st -= T.dashStaminaCost; }
    else { damage(s, f, T.dashHpCostNoStamina, events, 'exhaust'); if (!f.alive) return; }
    var hit = null, ht = len;
    enemiesOf(s, f).forEach(function (e) {
      var ex = e.x - f.x, ey = e.y - f.y, t = ex * v.x + ey * v.y;
      if (t <= 0) return;
      var px = ex - v.x * t, py = ey - v.y * t, perp = Math.sqrt(px * px + py * py), rr = f.r + e.r;
      if (perp > rr) return;
      var tc = t - Math.sqrt(rr * rr - perp * perp); // точка касания
      if (tc <= len && tc < ht) { ht = Math.max(0, tc); hit = e; }
    });
    var end = clampXY({ x: f.x + v.x * ht, y: f.y + v.y * ht });
    place(s, f, end.x, end.y, events);
    events.push({ t: 'dash', id: f.id, from: from, to: { x: f.x, y: f.y }, water: f.inWater });
    if (!f.inWater) events.push({ t: 'padBob', pad: f.pad, w: f.weight });
    if (hit) strike(s, f, hit, v, T.dashDamageMul, f.knock * T.dashKnockMul, events);
  }

  function doCloud(s, f, vx, vy, events) {
    var v = norm(vx, vy), len = Math.min(v.l, T.cloudRange), b = s.bonus[f.side];
    var p = clampXY({ x: f.x + v.x * len, y: f.y + v.y * len });
    var c = { x: p.x, y: p.y, r: T.cloudRadius, turns: T.cloudTurns + (b && b.cloudBonus ? b.cloudBonus : 0), side: f.side };
    s.clouds.push(c);
    events.push({ t: 'cloud', id: f.id, from: { x: f.x, y: f.y }, x: c.x, y: c.y, r: c.r });
    enemiesOf(s, f).forEach(function (e) { if (dist(e.x, e.y, c.x, c.y) <= c.r + e.r * 0.5) addPoison(s, e, events); });
  }

  function doTongue(s, f, vx, vy, events) {
    var v = norm(vx, vy), len = Math.min(v.l, T.tongueRange), b = s.bonus[f.side];
    if (v.l < 1e-6) return;
    var hit = null, ht = len;
    enemiesOf(s, f).forEach(function (e) {
      var ex = e.x - f.x, ey = e.y - f.y, t = ex * v.x + ey * v.y;
      if (t <= 0 || t > len + e.r) return;
      var perp = Math.abs(ex * v.y - ey * v.x);
      if (perp <= e.r + 4 && t < ht + e.r) { if (!hit || t < ht) { hit = e; ht = t; } }
    });
    var tip = hit ? { x: hit.x, y: hit.y } : { x: f.x + v.x * len, y: f.y + v.y * len };
    events.push({ t: 'tongue', id: f.id, from: { x: f.x, y: f.y }, to: tip, target: hit ? hit.id : -1 });
    if (!hit) return;
    damage(s, hit, Math.round(hitDamage(s, f, hit, T.tongueDamageMul)), events, 'tongue');
    if (!hit.alive) return;
    if (b && b.tonguePoison) addPoison(s, hit, events);
    if (b && b.tongueBleed) addBleed(s, hit, events);
    var gap = f.r + hit.r + 2;
    push(s, f, hit, f.x + v.x * gap, f.y + v.y * gap, events, 'pull');
  }

  function doSpin(s, f, events) {
    events.push({ t: 'spin', id: f.id, x: f.x, y: f.y, r: T.spinRadius });
    enemiesOf(s, f).forEach(function (e) {
      if (dist(e.x, e.y, f.x, f.y) > T.spinRadius + e.r) return;
      var d = norm(e.x - f.x, e.y - f.y); if (d.l < 1e-6) d = { x: 0, y: f.side === 0 ? -1 : 1 };
      var dmg = hitDamage(s, f, e, T.spinDamageMul);
      events.push({ t: 'impact', id: e.id, by: f.id, x: e.x, y: e.y });
      damage(s, e, dmg, events, 'spin');
      if (!e.alive) return;
      addBleed(s, e, events);
      push(s, f, e, e.x + d.x * T.spinKnock, e.y + d.y * T.spinKnock, events, 'push');
    });
  }

  function doBubble(s, f, vx, vy, events) {
    var v = norm(vx, vy), len = Math.min(v.l, T.bubbleRange), b = s.bonus[f.side];
    var p = clampXY({ x: f.x + v.x * len, y: f.y + v.y * len });
    var target = null, bd = 1e9;
    s.frogs.forEach(function (e) {
      if (!e.alive || e.id === f.id) return;
      var d = dist(e.x, e.y, p.x, p.y);
      if (d <= T.bubbleCatch + e.r && d < bd) { bd = d; target = e; }
    });
    events.push({ t: 'bubble', id: f.id, from: { x: f.x, y: f.y }, to: target ? { x: target.x, y: target.y } : p, target: target ? target.id : -1,
      ally: !!(target && target.side === f.side) });
    if (!target) return;
    if (target.side === f.side) {
      target.shield = T.shieldAmount; target.shieldTurns = T.shieldTurns;
      events.push({ t: 'status', id: target.id, s: 'shield' });
      if (b && b.shieldStamina) target.st = Math.min(target.maxSt, target.st + b.shieldStamina);
    } else {
      damage(s, target, hitDamage(s, f, target, T.bubbleDamageMul), events, 'bubble');
      if (!target.alive) return;
      target.trapped = 1;
      events.push({ t: 'status', id: target.id, s: 'trap' });
      if (b && b.bubblePoison) addPoison(s, target, events);
    }
  }

  // ---------- ход ----------
  // Ход (D-026): игрок выбирает жабу, и она делает до pullsFor() оттяжек подряд (прыжок/рывок/способность),
  // либо весь ход отдыхает (REST). END — закончить ход раньше.
  // cmd: { frog: id, mode: 'move'|'ability'|'rest'|'end', dx, dy, qte } — (dx,dy) вектор цели в мировых единицах,
  // qte — попал ли игрок в сужающееся кольцо на 2-й и следующих оттяжках (D-027).
  Sim.apply = function (s, cmd, opts) {
    opts = opts || {};
    var events = [];
    var f = s.frogs[cmd.frog];
    if (!f || !Sim.canAct(s, f)) return { ok: false, events: events, why: 'cannot act' };
    var mode = cmd.mode;
    if (mode === 'rest' && s.active !== null) return { ok: false, events: events, why: 'rest only as a whole turn' };
    if (mode === 'end' && s.active === null) return { ok: false, events: events, why: 'nothing to end' };
    if (mode === 'ability' && !Sim.abilityAvailable(s, f)) return { ok: false, events: events, why: 'no stamina' };
    var dx = cmd.dx || 0, dy = cmd.dy || 0;
    var a = FB.FROGS[f.kind].ability;

    if (mode === 'rest') {
      events.push({ t: 'act', id: f.id, mode: mode, side: f.side });
      events.push({ t: 'rest', id: f.id });
      // Отдых на кувшинке: вся Stamina и часть HP (D-019, D-028)
      if (!f.inWater) {
        if (f.st < f.maxSt) { f.st = f.maxSt; events.push({ t: 'status', id: f.id, s: 'refill' }); }
        var heal = Math.min(f.maxHp - f.hp, Math.round(f.maxHp * T.restHealFrac));
        if (heal > 0) { f.hp += heal; events.push({ t: 'heal', id: f.id, amount: heal }); }
      }
      if (!opts.noEnd) endTurn(s, events);
      return { ok: true, events: events };
    }
    if (mode === 'end') {
      events.push({ t: 'endTurn', id: f.id });
      if (!opts.noEnd) endTurn(s, events);
      return { ok: true, events: events };
    }

    // Оттяжка
    if (s.active === null) { s.active = f.id; s.pullsLeft = Sim.pullsFor(s, f); }
    events.push({ t: 'act', id: f.id, mode: mode, side: f.side, pull: s.pullsUsed + 1 });
    if (cmd.qte && s.pullsUsed >= 1 && s.qteHits < T.qteBonus.length - 1) {
      s.qteHits++;
      events.push({ t: 'perfect', id: f.id, hits: s.qteHits, bonus: T.qteBonus[s.qteHits] });
    }
    f.turnMul = 1 + T.qteBonus[s.qteHits];
    var freePull = false;
    if (mode === 'move') {
      if (f.inWater) doDash(s, f, dx, dy, events);
      else doJump(s, f, dx, dy, f.range, events);
    } else if (mode === 'ability') {
      f.st -= T.abilityStaminaCost;
      s.abilityUsed = true;
      events.push({ t: 'ability', id: f.id, ability: a });
      if (a === 'hop') { doJump(s, f, dx, dy, f.range, events); freePull = true; } // Free Hop: прыжок без траты оттяжки
      else if (a === 'slam') doJump(s, f, dx, dy, f.range * T.slamRangeMul, events, { slam: true });
      else if (a === 'cloud') doCloud(s, f, dx, dy, events);
      else if (a === 'tongue') doTongue(s, f, dx, dy, events);
      else if (a === 'spin') doSpin(s, f, events);
      else if (a === 'bubble') doBubble(s, f, dx, dy, events);
    }
    s.pullsUsed++;
    if (!freePull) s.pullsLeft--;
    events.push({ t: 'pulls', left: s.pullsLeft, used: s.pullsUsed });

    checkRoundEnd(s, events);
    var more = s.phase === 'play' && f.alive && s.pullsLeft > 0;
    if (more) return { ok: true, events: events, continues: true };
    if (!opts.noEnd && s.phase === 'play') endTurn(s, events);
    return { ok: true, events: events };
  };

  function frogsOnPad(s, pad) {
    return s.frogs.filter(function (f) { return f.alive && !f.inWater && f.pad === pad.id; });
  }

  // Конец хода: затопление кувшинок (§6, D-025), облака, статусы, передача хода
  function endTurn(s, events) {
    var side = s.turnSide;
    s.frogs.forEach(function (f) { if (f.side === side) f.turnMul = 1; });
    resetTurn(s);
    // Кувшинки: тронутая отсчитывает ходы до затопления, что бы ни происходило
    s.pads.forEach(function (p) {
      if (p.state === 'stable') {
        if (p.sinkLeft === null) return;
        p.sinkLeft--; p.wear = p.cap - p.sinkLeft;
        if (p.sinkLeft <= 0) {
          var on = frogsOnPad(s, p);
          // Всплытий ограниченное число (D-020): последнее затопление — навсегда
          if (p.lives > 0) { p.state = 'submerged'; p.subTimer = T.padSubmergedTurns; }
          else p.state = 'gone';
          p.sinkLeft = null;
          events.push({ t: 'padSink', pad: p.id, gone: p.state === 'gone' });
          on.forEach(function (f) {
            f.inWater = true; f.pad = -1;
            events.push({ t: 'fall', id: f.id });
            events.push({ t: 'splash', x: f.x, y: f.y, big: true });
          });
        }
      } else if (p.state === 'submerged') {
        p.subTimer--;
        if (p.subTimer <= 0) {
          p.state = 'stable'; p.wear = 0; p.cap = 1; p.lives = Math.max(0, p.lives - 1);
          events.push({ t: 'padRise', pad: p.id });
          s.frogs.forEach(function (f) { // всплывающая кувшинка подбирает жабу из воды — и сразу начинает тонуть
            if (f.alive && f.inWater && dist(f.x, f.y, p.x, p.y) <= p.r) { f.inWater = false; f.pad = p.id; events.push({ t: 'lift', id: f.id, pad: p.id }); touchPad(s, p, f, events); }
          });
        }
      }
    });
    // Облака яда
    s.clouds.forEach(function (c) {
      s.frogs.forEach(function (e) {
        if (e.alive && e.side !== c.side && dist(e.x, e.y, c.x, c.y) <= c.r + e.r * 0.5) addPoison(s, e, events);
      });
      c.turns--;
    });
    s.clouds = s.clouds.filter(function (c) { return c.turns > 0; });
    // Длительности стороны, которая сходила
    s.frogs.forEach(function (f) {
      if (f.side !== side || !f.alive) return;
      if (f.trapped > 0) f.trapped--;
      if (f.shieldTurns > 0) { f.shieldTurns--; if (f.shieldTurns <= 0) f.shield = 0; }
    });
    s.turnCount[side]++;
    checkRoundEnd(s, events);
    if (s.phase !== 'play') return;
    if (s.turnCount[0] >= T.turnCapPerSide && s.turnCount[1] >= T.turnCapPerSide) { decideByHp(s, events); return; }
    s.turnSide = 1 - side;
    startTurn(s, events, 0);
  }

  function startTurn(s, events, depth) {
    var side = s.turnSide;
    events.push({ t: 'turn', side: side });
    s.frogs.forEach(function (f) {
      if (f.side !== side || !f.alive) return;
      if (f.poison > 0) { f.poison--; damage(s, f, T.poisonDamage, events, 'poison'); }
      if (f.alive && f.bleed > 0) {
        damage(s, f, T.bleedDamage * f.bleed, events, 'bleed');
        f.bleedTurns--; if (f.bleedTurns <= 0) f.bleed = 0;
      }
      if (f.alive && !f.inWater && f.st < f.maxSt) {
        f.st = Math.min(f.maxSt, f.st + T.staminaRegenOnPad);
        events.push({ t: 'regen', id: f.id });
      }
    });
    checkRoundEnd(s, events);
    if (s.phase !== 'play') return;
    var canAny = s.frogs.some(function (f) { return f.side === side && f.alive && f.trapped <= 0; });
    if (!canAny && depth < 3) { // обе в пузыре — ход пропускается
      events.push({ t: 'pass', side: side });
      endTurn(s, events);
    }
  }

  function aliveCount(s, side) { return s.frogs.filter(function (f) { return f.side === side && f.alive; }).length; }

  function checkRoundEnd(s, events) {
    if (s.phase !== 'play') return;
    var a0 = aliveCount(s, 0), a1 = aliveCount(s, 1);
    if (a0 > 0 && a1 > 0) return;
    finishRound(s, a0 === 0 && a1 === 0 ? -1 : (a1 === 0 ? 0 : 1), events, 'ko');
  }

  function hpFrac(s, side) {
    var h = 0, m = 0;
    s.frogs.forEach(function (f) { if (f.side === side) { h += f.hp; m += f.maxHp; } });
    return h / m;
  }

  function decideByHp(s, events) {
    var h0 = hpFrac(s, 0), h1 = hpFrac(s, 1);
    finishRound(s, Math.abs(h0 - h1) < 1e-9 ? -1 : (h0 > h1 ? 0 : 1), events, 'time');
  }

  function finishRound(s, winner, events, why) {
    s.roundWinner = winner; s.roundWhy = why;
    if (winner >= 0) s.score[winner]++;
    s.phase = 'roundOver';
    if (winner >= 0 && s.score[winner] >= T.roundsToWin) { s.phase = 'matchOver'; s.matchWinner = winner; }
    else if (s.round >= T.maxRounds) {
      s.phase = 'matchOver';
      s.matchWinner = s.score[0] === s.score[1] ? (hpFrac(s, 0) >= hpFrac(s, 1) ? 0 : 1) : (s.score[0] > s.score[1] ? 0 : 1);
    }
    events.push({ t: 'roundEnd', winner: winner, why: why, score: s.score.slice(), match: s.phase === 'matchOver' ? s.matchWinner : null });
  }

  // Прогноз для превью: та же функция, без конца хода (D-006 — траектория предсказуема)
  Sim.preview = function (s, cmd) {
    var c = Sim.clone(s);
    var r = Sim.apply(c, cmd, { noEnd: true });
    return { state: c, events: r.events, ok: r.ok };
  };
})();
