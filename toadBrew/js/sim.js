// Симуляция TOADBREW — Alchemical Arena (D-040). Без DOM и Canvas: состояние — простой объект, активация — команда.
// apply(state, cmd) меняет состояние и возвращает события для анимации. Случайность — только от сида.
// Ссылки §N — на docs/GDD.md.
(function () {
  var T = FB.T;
  var Sim = {};
  FB.Sim = Sim;

  // ---------- утилиты ----------
  function dist(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }
  function norm(x, y) { var l = Math.sqrt(x * x + y * y); return l > 1e-6 ? { x: x / l, y: y / l, l: l } : { x: 0, y: 0, l: 0 }; }
  function inside(p) { return p.x >= T.margin && p.x <= T.W - T.margin && p.y >= T.margin && p.y <= T.H - T.margin; }
  function clampXY(p) {
    p.x = Math.max(T.margin, Math.min(T.W - T.margin, p.x));
    p.y = Math.max(T.margin, Math.min(T.H - T.margin, p.y));
    return p;
  }
  Sim.dist = dist;
  Sim.norm = norm;
  Sim.clone = function (s) { return JSON.parse(JSON.stringify(s)); };
  Sim.center = function () { return { x: T.W / 2, y: T.H / 2 }; };

  // ---------- создание ----------
  // flasksA/B: [[l,l,l],[l,l,l]] — по три разные жидкости на жабу (§9.3)
  Sim.createMatch = function (teamA, teamB, flasksA, flasksB, seed) {
    return {
      seed: seed >>> 0, rng: seed >>> 0,
      teams: [teamA.slice(), teamB.slice()],
      flasks: [flasksA.map(function (f) { return f.slice(); }), flasksB.map(function (f) { return f.slice(); })],
      round: 0, starter: 1, phase: 'init', frogs: [], objects: [], plates: [], zones: [], links: [null, null],
      zoneSeq: 0, safeR: null, score: [0, 0]
    };
  };

  function mirror(p) { return { x: T.W - p.x, y: T.H - p.y }; }

  function buildArena(s) {
    var A = FB.ARENA_HALF;
    s.objects = []; s.plates = [];
    A.objects.forEach(function (o) {
      [o, Object.assign({}, o, mirror(o))].forEach(function (q) {
        var hp = q.kind === 'pillar' ? T.pillarHp : (q.kind === 'tank' ? T.tankHp : T.barrelHp);
        s.objects.push({ id: s.objects.length, kind: q.kind, x: q.x, y: q.y, r: q.r, hp: hp, maxHp: hp, state: 'intact', liquid: q.liquid || null });
      });
    });
    A.plates.forEach(function (o) {
      [o, mirror(o)].forEach(function (q) { s.plates.push({ id: s.plates.length, x: q.x, y: q.y, r: o.r, hp: T.plateHp, state: 'intact' }); });
    });
  }

  function makeFrog(s, side, slot, kind) {
    var d = FB.FROGS[kind];
    return {
      id: side * 2 + slot, side: side, slot: slot, kind: kind,
      x: 0, y: 0, r: d.r, hp: d.hp, maxHp: d.hp, impact: d.impact, mass: d.mass, jump: d.jump,
      alive: true, flasks: s.flasks[side][slot].slice(), fi: 0,
      poison: 0, bleed: 0, chill: 0, corroded: 0, envShield: 0, pit: -1
    };
  }

  Sim.startRound = function (s) {
    buildArena(s);
    s.frogs = [];
    var st = FB.ARENA_HALF.starts;
    for (var side = 0; side < 2; side++) {
      for (var slot = 0; slot < 2; slot++) {
        var f = makeFrog(s, side, slot, s.teams[side][slot]);
        var p = side === 0 ? st[slot] : mirror(st[slot]);
        f.x = p.x; f.y = p.y;
        s.frogs.push(f);
      }
    }
    s.zones = []; s.links = [null, null]; s.safeR = null;
    s.round = 1; s.starter = 0; s.turnSide = 0; s.acted = {};
    s.phase = 'play'; s.roundWinner = null; s.activations = 0;
    return [{ t: 'roundStart', round: s.round, side: s.turnSide }];
  };

  // ---------- запросы ----------
  Sim.canAct = function (s, f) { return s.phase === 'play' && f.alive && f.side === s.turnSide && !s.acted[f.id]; };
  Sim.activeFlask = function (f) { return f.flasks[f.fi]; };
  Sim.nextFlask = function (f) { return f.flasks[(f.fi + 1) % 3]; };

  // Партнёр по Link, если пара ещё вместе (§12.2)
  Sim.linkPartner = function (s, f) {
    var L = s.links[f.side];
    if (!L || (L.a !== f.id && L.b !== f.id)) return null;
    var p = s.frogs[L.a === f.id ? L.b : L.a];
    if (!p.alive || !f.alive) return null;
    if (dist(f.x, f.y, p.x, p.y) > f.r + p.r + T.linkSlack) return null;
    return p;
  };

  // Chill, который жаба получит в начале активации, стоя во вражеской Frost / Noxious зоне
  Sim.pendingChill = function (s, f) {
    var z = zoneAt(s, f.x, f.y);
    return !!(z && z.side !== f.side && (z.type === 'frost' || z.type === 'noxious'));
  };
  Sim.rangeFor = function (s, f) {
    var r = f.jump;
    if (f.chill || Sim.pendingChill(s, f)) r *= T.chillRangeMul;
    if (f.pit >= 0) r *= T.pitRangeMul;
    var p = Sim.linkPartner(s, f);
    if (p) {
      if (f.kind === 'spring') r *= T.springLinkRangeMul;
      if (p.kind === 'aegis' || f.kind === 'aegis') r *= T.aegisLaunchMul;
    }
    return r;
  };
  Sim.arcHeight = function (len) { return T.arcBase + len * T.arcPerLen; };

  function objHeight(o) {
    if (o.state === 'destroyed') return 0;
    return o.kind === 'pillar' ? T.pillarHeight : (o.kind === 'tank' ? T.tankHeight : T.barrelHeight);
  }
  function blocking(o) { return o.state !== 'destroyed'; }

  function zoneAt(s, x, y) { // самая свежая зона в точке
    for (var i = s.zones.length - 1; i >= 0; i--) { var z = s.zones[i]; if (dist(x, y, z.x, z.y) <= z.r) return z; }
    return null;
  }
  Sim.zoneAt = zoneAt;
  function plateAt(s, x, y) {
    for (var i = 0; i < s.plates.length; i++) { var p = s.plates[i]; if (dist(x, y, p.x, p.y) <= p.r) return p; }
    return null;
  }
  Sim.plateAt = plateAt;
  function enemiesOf(s, f) { return s.frogs.filter(function (e) { return e.alive && e.side !== f.side; }); }

  // Жидкость зоны для реакций: Resonance = Force, Noxious Ice в реакции не вступает
  function zoneLiquid(z) { return z.type === 'resonance' ? 'force' : (z.type === 'noxious' ? null : z.type); }

  // Что случится с колбой при приземлении (для превью и для самого прыжка)
  Sim.resolveFlask = function (s, f, x, y, partner) {
    var a = Sim.activeFlask(f);
    if (partner) {
      var b = Sim.activeFlask(partner);
      if (a === b) return { kind: 'over', liquid: a, link: true };
      return { kind: 'react', key: FB.reactionKey(a, b), link: true };
    }
    var z = zoneAt(s, x, y), zl = z ? zoneLiquid(z) : null;
    if (!zl) return { kind: 'base', liquid: a };
    if (zl === a) return { kind: 'over', liquid: a, zone: z.id };
    return { kind: 'react', key: FB.reactionKey(a, zl), zone: z.id };
  };

  // ---------- урон, статусы, физика ----------
  function unlinkFrog(s, f, events) {
    [0, 1].forEach(function (sd) { var L = s.links[sd]; if (L && (L.a === f.id || L.b === f.id)) { s.links[sd] = null; events.push({ t: 'unlink', side: sd }); } });
  }
  function damage(s, f, amount, events, src) {
    if (!f.alive || amount <= 0) return 0;
    amount = Math.round(amount);
    f.hp -= amount;
    events.push({ t: 'hit', id: f.id, dmg: amount, src: src || 'hit' });
    if (f.hp <= 0) {
      f.hp = 0; f.alive = false; f.poison = 0; f.bleed = 0; f.chill = 0; f.corroded = 0;
      events.push({ t: 'death', id: f.id, x: f.x, y: f.y });
      unlinkFrog(s, f, events);
    }
    return amount;
  }
  // Environmental damage (§5.3, §15.1): щит Aegis съедает один раз
  function envDamage(s, f, amount, events, src) {
    if (!f.alive) return;
    if (f.envShield) { f.envShield = 0; events.push({ t: 'shieldBlock', id: f.id }); return; }
    damage(s, f, amount, events, src);
  }

  function objectDamage(s, o, lvl, events) {
    if (o.state === 'destroyed' || lvl <= 0) return;
    o.hp = Math.max(0, o.hp - lvl);
    var crackAt = o.kind === 'pillar' ? T.pillarCrackAt : 1;
    var prev = o.state;
    o.state = o.hp <= 0 ? 'destroyed' : (o.hp <= crackAt ? 'cracked' : 'intact');
    if (o.state !== prev) events.push({ t: 'objState', id: o.id, state: o.state, kind: o.kind, x: o.x, y: o.y });
    if (o.state === 'destroyed' && o.kind === 'tank' && o.liquid) { // резервуар разливает свою жидкость
      addZone(s, o.liquid, o.x, o.y, T.tankSpillR, T.venomZoneTurns, -1, events);
    }
  }

  function plateDamage(s, p, lvl, events) {
    if (p.state === 'pit' || lvl <= 0) return;
    p.hp = Math.max(0, p.hp - lvl);
    var prev = p.state;
    p.state = p.hp <= 0 ? 'pit' : 'cracked';
    if (p.state !== prev) events.push({ t: 'plateState', id: p.id, state: p.state, x: p.x, y: p.y });
    if (p.state === 'pit') s.frogs.forEach(function (f) { if (f.alive && f.pit < 0 && dist(f.x, f.y, p.x, p.y) <= p.r) fallIntoPit(s, f, p, events); });
  }

  function fallIntoPit(s, f, p, events) {
    f.pit = p.id;
    events.push({ t: 'fall', id: f.id, plate: p.id });
    envDamage(s, f, T.pitDamage, events, 'pit');
    unlinkFrog(s, f, events);
  }

  // Удар по местности в точке: объекты рядом и плита под точкой
  function terrainAt(s, x, y, rad, lvl, events, crackedBonus) {
    s.objects.forEach(function (o) {
      if (o.state === 'destroyed' || dist(x, y, o.x, o.y) > rad + o.r) return;
      objectDamage(s, o, lvl + (crackedBonus && o.state === 'cracked' ? crackedBonus : 0), events);
    });
    s.plates.forEach(function (p) { if (dist(x, y, p.x, p.y) <= Math.max(p.r, rad * 0.6)) plateDamage(s, p, lvl, events); });
  }

  function addZone(s, type, x, y, r, turns, side, events) {
    var z = { id: ++s.zoneSeq, type: type, x: x, y: y, r: r, turns: turns, side: side };
    s.zones.push(z);
    events.push({ t: 'zone', zone: Object.assign({}, z) });
    return z;
  }
  function removeZone(s, id, events) {
    s.zones = s.zones.filter(function (z) { return z.id !== id; });
    events.push({ t: 'zoneGone', id: id });
  }

  // Knockback с массой и скоростью (§15.2); путь упирается в колонны и стены — удар об них (§15.1)
  Sim.knockAmount = function (a, e, speed, mul) {
    var k = T.kbBase * (T.kbSpeedMin + (1 - T.kbSpeedMin) * Math.min(1, speed)) * a.mass / e.mass * (mul || 1);
    return Math.max(T.kbMin, Math.min(T.kbMax, k));
  };
  function push(s, e, dir, amount, events, src) {
    if (!e.alive || amount <= 0) return;
    var from = { x: e.x, y: e.y }, steps = Math.ceil(amount / 4), hitWall = false;
    var px = e.x, py = e.y;
    for (var i = 1; i <= steps; i++) {
      var nx = e.x + dir.x * amount * i / steps, ny = e.y + dir.y * amount * i / steps;
      if (!inside({ x: nx, y: ny })) { hitWall = true; break; }
      var block = s.objects.filter(function (o) { return o.kind === 'pillar' && blocking(o) && dist(nx, ny, o.x, o.y) < o.r + e.r; })[0];
      if (block) { hitWall = true; break; }
      px = nx; py = ny;
    }
    e.x = px; e.y = py;
    if (e.pit >= 0 && dist(e.x, e.y, s.plates[e.pit].x, s.plates[e.pit].y) > s.plates[e.pit].r) e.pit = -1; // выбило из провала
    events.push({ t: 'push', id: e.id, from: from, to: { x: e.x, y: e.y }, wall: hitWall, src: src || 'kb' });
    if (hitWall) envDamage(s, e, T.wallHitDamage, events, 'wall');
    var pl = plateAt(s, e.x, e.y);
    if (pl && pl.state === 'pit' && e.pit < 0 && e.alive) fallIntoPit(s, e, pl, events);
  }

  // Траектория (§7.2): первая преграда на пути, если дуга ниже её
  Sim.flight = function (s, f, tx, ty) {
    var len = dist(f.x, f.y, tx, ty), H = Sim.arcHeight(len), d = norm(tx - f.x, ty - f.y), n = 40;
    for (var i = 2; i <= n; i++) {
      var u = i / n, x = f.x + (tx - f.x) * u, y = f.y + (ty - f.y) * u, h = Math.sin(Math.PI * u) * H;
      for (var k = 0; k < s.objects.length; k++) {
        var o = s.objects[k];
        if (!blocking(o)) continue;
        if (dist(x, y, o.x, o.y) < o.r + f.r * 0.55 && h < objHeight(o)) {
          var back = norm(x - o.x - d.x * 3, y - o.y - d.y * 3);
          if (back.l < 1e-6) back = { x: -d.x, y: -d.y };
          return { bonk: o, u: u, x: o.x + back.x * (o.r + f.r + 1), y: o.y + back.y * (o.r + f.r + 1) };
        }
      }
    }
    return null;
  };

  // ---------- активация ----------
  // cmd: { frog, dx, dy } — прыжок на вектор (мировые единицы), или { frog, mode: 'skip' }
  Sim.apply = function (s, cmd, opts) {
    opts = opts || {};
    var events = [];
    var f = s.frogs[cmd.frog];
    if (!f || !Sim.canAct(s, f)) return { ok: false, events: events, why: 'cannot act' };
    events.push({ t: 'act', id: f.id, side: f.side });

    // Начало активации: поверхность под жабой и перегрузка арены (§10, §17)
    startOfActivation(s, f, events); // в превью тоже: дальность и урон показываются честно

    if (f.alive && cmd.mode !== 'skip') jump(s, f, cmd.dx || 0, cmd.dy || 0, events);
    else if (cmd.mode === 'skip') events.push({ t: 'skip', id: f.id });

    if (!opts.noEnd) endActivation(s, f, events);
    return { ok: true, events: events };
  };

  function startOfActivation(s, f, events) {
    var z = zoneAt(s, f.x, f.y);
    if (z && z.side !== f.side) {
      if (z.type === 'ember') damage(s, f, T.emberBurn, events, 'burn');
      if ((z.type === 'venom' || z.type === 'noxious') && !f.poison) { f.poison = 1; events.push({ t: 'status', id: f.id, s: 'poison' }); }
      if ((z.type === 'frost' || z.type === 'noxious') && !f.chill) { f.chill = 1; events.push({ t: 'status', id: f.id, s: 'chill' }); }
    }
    if (f.alive && s.safeR !== null && dist(f.x, f.y, T.W / 2, T.H / 2) > s.safeR) envDamage(s, f, T.overloadDamage, events, 'overload');
  }

  function jump(s, f, vx, vy, events) {
    var partner = Sim.linkPartner(s, f);
    var range = Sim.rangeFor(s, f);
    var v = norm(vx, vy), len = Math.min(v.l, range);
    var dir = v.l > 0 ? v : { x: 0, y: f.side === 0 ? -1 : 1 };
    var from = { x: f.x, y: f.y };
    var L = clampXY({ x: f.x + dir.x * len, y: f.y + dir.y * len });
    var speed = len / Math.max(1, f.jump);
    if (f.chill) { f.chill = 0; events.push({ t: 'statusGone', id: f.id, s: 'chill' }); }
    f.pit = -1;
    var ram = f.kind === 'ram';

    // Полёт: колонна/бочка на пути (§7.2)
    var fl = Sim.flight(s, f, L.x, L.y), bonk = null;
    if (fl) { bonk = fl.bonk; L = clampXY({ x: fl.x, y: fl.y }); }

    // Приземление: враг, союзник (Link) или пол
    var enemy = null, ally = null, best = 1e9;
    s.frogs.forEach(function (e) {
      if (!e.alive || e.id === f.id) return;
      var d = dist(L.x, L.y, e.x, e.y);
      if (d <= f.r + e.r + T.contactAssist && d < best) { best = d; if (e.side === f.side) { ally = e; enemy = null; } else { enemy = e; ally = null; } }
    });
    // на нетронутый объект приземлиться нельзя — встаём рядом
    s.objects.forEach(function (o) {
      if (!blocking(o) || dist(L.x, L.y, o.x, o.y) >= o.r + f.r) return;
      var bk = norm(L.x - o.x, L.y - o.y); if (bk.l < 1e-6) bk = { x: -dir.x, y: -dir.y };
      L = clampXY({ x: o.x + bk.x * (o.r + f.r + 1), y: o.y + bk.y * (o.r + f.r + 1) });
      if (!bonk) bonk = o;
    });

    if (ally && !partner) { // Link (§12.2): мягкий отскок рядом с союзником, без урона и без колбы
      var aegis = ally.kind === 'aegis' || f.kind === 'aegis';
      var bk2 = norm(L.x - ally.x, L.y - ally.y); if (bk2.l < 1e-6) bk2 = { x: -dir.x, y: -dir.y };
      var gap = f.r + ally.r + (aegis ? 0 : 3);
      f.x = ally.x + bk2.x * gap; f.y = ally.y + bk2.y * gap;
      clampXY(f);
      events.push({ t: 'jump', id: f.id, from: from, to: { x: f.x, y: f.y }, len: dist(from.x, from.y, f.x, f.y), link: ally.id });
      s.links[f.side] = { a: f.id, b: ally.id };
      events.push({ t: 'link', side: f.side, a: f.id, b: ally.id, aegis: aegis });
      if (aegis) { f.envShield = 1; ally.envShield = 1; events.push({ t: 'status', id: f.id, s: 'shield' }); events.push({ t: 'status', id: ally.id, s: 'shield' }); }
      switchFlask(f, events);
      return;
    }
    if (ally && partner) { // из Link на союзника — просто рядом
      var bk3 = norm(L.x - ally.x, L.y - ally.y); if (bk3.l < 1e-6) bk3 = { x: -dir.x, y: -dir.y };
      L = clampXY({ x: ally.x + bk3.x * (f.r + ally.r + 2), y: ally.y + bk3.y * (f.r + ally.r + 2) });
    }

    f.x = L.x; f.y = L.y;
    events.push({ t: 'jump', id: f.id, from: from, to: { x: f.x, y: f.y }, len: dist(from.x, from.y, f.x, f.y), bonk: bonk ? bonk.id : -1, flask: Sim.activeFlask(f), linkFire: partner ? partner.id : -1 });
    if (partner) { s.links[f.side] = null; events.push({ t: 'unlink', side: f.side, fired: true }); }

    var lvl = 1 + (ram && (enemy || bonk || s.objects.some(function (o) { return blocking(o) && dist(f.x, f.y, o.x, o.y) < o.r + f.r + 14; })) ? 1 : 0);
    if (bonk) { objectDamage(s, bonk, lvl, events); events.push({ t: 'bonk', id: f.id, obj: bonk.id }); }

    // Колба (§10–§12)
    var res = Sim.resolveFlask(s, f, f.x, f.y, partner);
    var areaMul = (f.kind === 'bellows' ? T.wideSpillMul : 1) * (partner && f.kind === 'spring' ? T.springLinkAreaMul : 1);
    var kbMul = 1, impactMul = 1, terrainLvl = lvl;
    events.push({ t: 'flask', id: f.id, res: res, x: f.x, y: f.y });

    // Прямое попадание (§7.3)
    var directDmg = 0, dirToEnemy = null;
    if (enemy) {
      directDmg = f.impact * (enemy.corroded ? T.corrodedMul : 1);
      if (enemy.corroded) { enemy.corroded = 0; events.push({ t: 'statusGone', id: enemy.id, s: 'corroded' }); }
      dirToEnemy = norm(enemy.x - f.x, enemy.y - f.y); if (dirToEnemy.l < 1e-6) dirToEnemy = dir;
    }
    var liquid = res.liquid, mul = res.kind === 'over' ? T.overchargeMul : 1;
    if (res.kind === 'react' && res.key === 'ember+force') impactMul = T.meteorImpactMul;
    if (res.kind !== 'react' && liquid === 'force') { kbMul = T.forceKnockMul * (mul > 1 ? 1.3 : 1); terrainLvl += mul > 1 ? 2 : 1; }

    if (enemy) {
      events.push({ t: 'impact', id: enemy.id, by: f.id, x: enemy.x, y: enemy.y });
      damage(s, enemy, directDmg * impactMul, events, 'impact');
      if (enemy.alive && f.kind === 'spur' && !enemy.bleed) { enemy.bleed = 1; events.push({ t: 'status', id: enemy.id, s: 'bleed' }); }
    }

    var zr = T.zoneR * areaMul, R = T.reactR * areaMul;
    var nearEnemies = function (rad) { return enemiesOf(s, f).filter(function (e) { return dist(e.x, e.y, f.x, f.y) <= rad + e.r * 0.5; }); };
    var withDirect = function (list) { if (enemy && enemy.alive && list.indexOf(enemy) < 0) list.push(enemy); return list; };
    if (res.kind === 'base' || res.kind === 'over') {
      var zrm = zr * (mul > 1 ? 1.3 : 1);
      if (res.zone) removeZone(s, res.zone, events); // одинаковая зона «впитывается» в усиленную
      if (liquid === 'ember') {
        (enemy ? [enemy] : nearEnemies(28)).forEach(function (e) { damage(s, e, T.emberBonus * mul, events, 'ember'); });
        addZone(s, 'ember', f.x, f.y, zrm, T.emberZoneTurns, f.side, events);
      } else if (liquid === 'venom') {
        withDirect(nearEnemies(zrm)).forEach(function (e) { if (!e.alive) return; e.poison = mul > 1 ? 2 : 1; events.push({ t: 'status', id: e.id, s: 'poison' }); });
        addZone(s, 'venom', f.x, f.y, zrm, T.venomZoneTurns, f.side, events);
      } else if (liquid === 'frost') {
        withDirect(nearEnemies(zrm)).forEach(function (e) { if (!e.alive) return; e.chill = 1; events.push({ t: 'status', id: e.id, s: 'chill' }); });
        addZone(s, 'frost', f.x, f.y, zrm, T.frostZoneTurns, f.side, events);
      } else if (liquid === 'force') {
        addZone(s, 'resonance', f.x, f.y, 35 * areaMul, T.resonanceTurns, f.side, events);
      }
    } else { // реакция (§11.2)
      var key = res.key, rx = FB.REACTIONS[key];
      if (res.zone) removeZone(s, res.zone, events);
      events.push({ t: 'reaction', id: f.id, key: key, name: rx.name, x: f.x, y: f.y, r: R, link: !!res.link });
      if (key === 'ember+venom') { // BLAST
        var bl = withDirect(nearEnemies(R));
        bl.forEach(function (e) { damage(s, e, T.blastDamage, events, 'blast'); });
        bl.forEach(function (e) { if (e === enemy) return; var d = norm(e.x - f.x, e.y - f.y); if (d.l < 1e-6) d = dir; push(s, e, d, T.blastKnock, events); });
        terrainLvl += 1;
        terrainAt(s, f.x, f.y, R, 1, events);
      } else if (key === 'ember+frost') { // STEAM BURST
        s.zones.filter(function (z) { return dist(z.x, z.y, f.x, f.y) <= R + z.r; }).forEach(function (z) { removeZone(s, z.id, events); });
        s.frogs.forEach(function (e) {
          if (!e.alive || e.id === f.id || dist(e.x, e.y, f.x, f.y) > R + e.r) return;
          if (e.side !== f.side) damage(s, e, T.steamDamage, events, 'steam');
          var d = norm(e.x - f.x, e.y - f.y); if (d.l < 1e-6) d = dir;
          push(s, e, d, T.steamKnock / Math.sqrt(e.mass), events);
        });
        enemy = null; // отброс прямой цели уже применён волной
      } else if (key === 'ember+force') { // METEOR
        if (!enemy) nearEnemies(40).forEach(function (e) { damage(s, e, T.meteorDamage, events, 'meteor'); });
        terrainLvl += T.meteorTerrain;
        terrainAt(s, f.x, f.y, 50, T.meteorTerrain, events);
      } else if (key === 'frost+venom') { // NOXIOUS ICE
        var nr = zr * T.noxiousRMul;
        addZone(s, 'noxious', f.x, f.y, nr, T.venomZoneTurns, f.side, events);
        withDirect(nearEnemies(nr)).forEach(function (e) { e.poison = 1; e.chill = 1; events.push({ t: 'status', id: e.id, s: 'poison' }); events.push({ t: 'status', id: e.id, s: 'chill' }); });
      } else if (key === 'force+venom') { // CORROSIVE BURST
        withDirect(nearEnemies(R * 0.8)).forEach(function (e) {
          damage(s, e, T.corrosiveDamage, events, 'corrosive');
          if (e.alive) { e.corroded = 1; events.push({ t: 'status', id: e.id, s: 'corroded' }); }
        });
      } else if (key === 'force+frost') { // SHATTER
        var tgt = enemy || nearEnemies(50).sort(function (a, b) { return dist(a.x, a.y, f.x, f.y) - dist(b.x, b.y, f.x, f.y); })[0];
        if (tgt) damage(s, tgt, T.shatterDamage, events, 'shatter');
        terrainAt(s, f.x, f.y, R, 1, events, T.shatterTerrain);
      }
    }

    // Отброс прямой цели
    if (enemy && enemy.alive) push(s, enemy, dirToEnemy, Sim.knockAmount(f, enemy, speed, kbMul), events);

    // Местность в точке приземления (§5.2)
    terrainAt(s, f.x, f.y, f.r + 8, terrainLvl, events);

    // Механический язык (§13.3)
    if (f.kind === 'harpoon' && f.alive) hook(s, f, events);

    // Провал под ногами
    var pl = plateAt(s, f.x, f.y);
    if (f.alive && pl && pl.state === 'pit' && f.pit < 0) fallIntoPit(s, f, pl, events);

    switchFlask(f, events);
  }

  function lineBlocked(s, ax, ay, bx, by) {
    return s.objects.some(function (o) {
      if (o.kind !== 'pillar' || !blocking(o)) return false;
      var d = norm(bx - ax, by - ay), t = (o.x - ax) * d.x + (o.y - ay) * d.y;
      if (t <= 0 || t >= d.l) return false;
      return Math.abs((o.x - ax) * d.y - (o.y - ay) * d.x) < o.r;
    });
  }
  Sim.lineBlocked = lineBlocked;
  function hook(s, f, events) {
    var t = enemiesOf(s, f).filter(function (e) { return dist(e.x, e.y, f.x, f.y) <= T.hookR + e.r && !lineBlocked(s, f.x, f.y, e.x, e.y); })
      .sort(function (a, b) { return dist(a.x, a.y, f.x, f.y) - dist(b.x, b.y, f.x, f.y); })[0];
    if (!t) return;
    var d = norm(f.x - t.x, f.y - t.y), room = d.l - (f.r + t.r + 2);
    events.push({ t: 'tongue', id: f.id, target: t.id, from: { x: f.x, y: f.y }, to: { x: t.x, y: t.y } });
    if (room > 1) push(s, t, d, Math.min(T.hookPull, room), events, 'hook');
  }

  function switchFlask(f, events) {
    f.fi = (f.fi + 1) % 3;
    events.push({ t: 'flaskSwitch', id: f.id, fi: f.fi, liquid: Sim.activeFlask(f) });
  }

  // Конец активации: тики статусов, зоны, Link, очерёдность, раунды
  function endActivation(s, f, events) {
    if (f.alive && f.poison) { var pt = T.poisonTick * f.poison; f.poison = 0; damage(s, f, pt, events, 'poison'); }
    if (f.alive && f.bleed) { f.bleed = 0; damage(s, f, T.bleedTick, events, 'bleed'); }
    s.acted[f.id] = true;
    s.activations++;
    s.zones.forEach(function (z) { z.turns--; });
    s.zones.filter(function (z) { return z.turns <= 0; }).forEach(function (z) { events.push({ t: 'zoneGone', id: z.id }); });
    s.zones = s.zones.filter(function (z) { return z.turns > 0; });
    [0, 1].forEach(function (sd) { // пара разошлась (knockback, смерть) — Link рвётся
      var L = s.links[sd]; if (!L) return;
      var a = s.frogs[L.a], b = s.frogs[L.b];
      if (!a.alive || !b.alive || dist(a.x, a.y, b.x, b.y) > a.r + b.r + T.linkSlack) { s.links[sd] = null; events.push({ t: 'unlink', side: sd }); }
    });
    checkEnd(s, events);
    if (s.phase !== 'play') return;
    advance(s, events);
  }

  function sideCanAct(s, side) { return s.frogs.some(function (f) { return f.side === side && f.alive && !s.acted[f.id]; }); }

  function advance(s, events) {
    var other = 1 - s.turnSide;
    if (sideCanAct(s, other)) s.turnSide = other;
    else if (!sideCanAct(s, s.turnSide)) { // все сходили — новый раунд (§6.2)
      s.round++;
      s.acted = {};
      s.starter = 1 - s.starter;
      s.turnSide = sideCanAct(s, s.starter) ? s.starter : 1 - s.starter;
      if (s.round >= T.overloadRound) { // ARENA OVERLOAD (§17)
        s.safeR = Math.max(60, T.overloadStartR - T.overloadShrink * (s.round - T.overloadRound));
        events.push({ t: 'overload', round: s.round, r: s.safeR });
      }
      events.push({ t: 'round', round: s.round, side: s.turnSide });
      if (s.round > T.roundCap) { decideByHp(s, events); return; }
    }
    events.push({ t: 'turn', side: s.turnSide });
  }

  function aliveCount(s, side) { return s.frogs.filter(function (f) { return f.side === side && f.alive; }).length; }
  function checkEnd(s, events) {
    if (s.phase !== 'play') return;
    var a0 = aliveCount(s, 0), a1 = aliveCount(s, 1);
    if (a0 > 0 && a1 > 0) return;
    finish(s, a0 === 0 && a1 === 0 ? -1 : (a1 === 0 ? 0 : 1), events, 'ko');
  }
  function hpFrac(s, side) { var h = 0, m = 0; s.frogs.forEach(function (f) { if (f.side === side) { h += f.hp; m += f.maxHp; } }); return h / m; }
  function decideByHp(s, events) { var a = hpFrac(s, 0), b = hpFrac(s, 1); finish(s, a === b ? -1 : (a > b ? 0 : 1), events, 'time'); }
  function finish(s, winner, events, why) {
    s.roundWinner = winner; s.roundWhy = why;
    if (winner >= 0) s.score[winner]++;
    s.phase = 'matchOver';
    s.matchWinner = winner >= 0 ? winner : (hpFrac(s, 0) >= hpFrac(s, 1) ? 0 : 1);
    events.push({ t: 'roundEnd', winner: winner, why: why, match: s.matchWinner });
  }

  // Прогноз для превью (§2.5, §20): та же функция на копии, без конца активации и без эффектов её начала
  Sim.preview = function (s, cmd) {
    var c = Sim.clone(s);
    var r = Sim.apply(c, cmd, { noEnd: true, preview: true });
    return { state: c, events: r.events, ok: r.ok };
  };
})();
