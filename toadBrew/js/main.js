// Экраны TOADBREW (D-044): TEAM, ALCHEMY, бой, результат. Ввод-оттяжка, проигрывание событий симуляции, бот, HUD.
(function () {
  var T = FB.T, Sim = FB.Sim, R = FB.R, AI = FB.AI;
  var $ = function (id) { return document.getElementById(id); };
  var cv = $('cv');
  R.init(cv);

  function log(ev, data) { console.log('[FB] ev ' + ev, data !== undefined ? JSON.stringify(data) : ''); }
  document.title = 'TOADBREW v' + FB.VERSION;

  var NAMES = ['YOU', 'BOT'];
  var RXCOL = { 'ember+venom': '255,120,40', 'ember+frost': '230,240,255', 'ember+force': '255,150,30', 'frost+venom': '90,210,190', 'force+venom': '170,230,60', 'force+frost': '140,210,255' };
  var ICON_TXT = { shield: '🛡', sword: '🗡', hook: '⚓', plus: '✚', dash: '»' };
  var store = {
    get: function (k) { try { return JSON.parse(localStorage.getItem('toadbrew2.' + k)); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem('toadbrew2.' + k, JSON.stringify(v)); } catch (e) {} }
  };

  // ---------- состояние ----------
  var app = {
    screen: 'team', picks: store.get('picks') || ['spring', 'aegis'], flasks: store.get('flasks') || {},
    s: null, shown: null, disp: null, fx: [], queue: [], cur: null, busy: false, playing: false,
    selected: -1, aim: null, rand: null, t: 0, shake: 0, speed: store.get('speed') || 1, botTimer: null, paused: false,
    auto: /[?&]auto=1/.test(location.search), turnLeft: 0, slotPick: null
  };
  if (!Array.isArray(app.picks) || app.picks.length > 2 || app.picks.some(function (k) { return !FB.FROGS[k]; })) app.picks = ['spring', 'aegis'];
  function defaultFlasks(kind) {
    var best = (FB.FROGS[kind].best || []).slice(), rest = FB.LIQUID_ORDER.filter(function (l) { return best.indexOf(l) < 0; });
    return best.concat(rest).slice(0, 3);
  }
  function flasksOf(kind) {
    var f = app.flasks[kind];
    if (!f || f.length !== 3 || f.some(function (l) { return !FB.LIQUIDS[l]; }) || new Set(f).size !== 3) f = app.flasks[kind] = defaultFlasks(kind);
    return f;
  }

  // ---------- маленькие канвасы ----------
  var pcache = {};
  function portrait(kind, w, h, flasks) {
    var key = kind + w + 'x' + h + (flasks ? flasks.join() : '');
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    if (!pcache[key]) { var src = document.createElement('canvas'); src.width = w; src.height = h; R.portrait(src, kind, flasks); pcache[key] = src; }
    c.getContext('2d').drawImage(pcache[key], 0, 0);
    return c;
  }
  function bottle(liquid, w, h, state) {
    var c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2;
    var x = c.getContext('2d'); x.scale(2, 2);
    R.flaskBottle(x, w / 2, h * 0.6, Math.min(w, h) * 0.32, liquid, state === undefined ? 0 : state);
    return c;
  }

  // ---------- TEAM ----------
  function buildRoster() {
    var root = $('roster'); root.innerHTML = '';
    FB.FROG_ORDER.forEach(function (k) {
      var d = FB.FROGS[k], el = document.createElement('button');
      el.className = 'card'; el.dataset.kind = k;
      el.appendChild(portrait(k, 220, 220, flasksOf(k)));
      el.insertAdjacentHTML('beforeend', '<div class="cicon">' + ICON_TXT[d.icon] + '</div><div class="check">✓</div><div class="cname">' + d.name.toUpperCase() + '</div><div class="stars">◆◇◇</div>');
      el.onclick = function () { togglePick(k); };
      root.appendChild(el);
    });
  }
  function togglePick(k) {
    var i = app.picks.indexOf(k);
    if (i >= 0) app.picks.splice(i, 1);
    else if (app.picks.length < 2) app.picks.push(k);
    else app.picks[1] = k;
    store.set('picks', app.picks); log('pick', app.picks);
    renderTeam();
  }
  function renderTeam() {
    document.querySelectorAll('.card').forEach(function (el) { el.classList.toggle('sel', app.picks.indexOf(el.dataset.kind) >= 0); });
    $('pick-n').textContent = app.picks.length;
    for (var i = 0; i < 2; i++) {
      var ped = $('ped-' + i), k = app.picks[i]; ped.innerHTML = '';
      if (!k) { ped.innerHTML = '<div class="empty">Tap a frog</div>'; continue; }
      ped.appendChild(portrait(k, 240, 240, flasksOf(k)));
      ped.insertAdjacentHTML('beforeend', '<div class="pname">' + FB.FROGS[k].name.toUpperCase() + '</div>');
      var fl = document.createElement('div'); fl.className = 'pfl';
      flasksOf(k).forEach(function (l, j) { fl.appendChild(bottle(l, 18, 22, j === 0 ? 2 : 0)); });
      ped.appendChild(fl);
    }
    var syn = app.picks.length === 2 ? FB.synergyFor(app.picks[0], app.picks[1]) : null;
    $('syn').innerHTML = syn ? '<div class="s-ic">🐸✦🐸</div><div class="s-l">SYNERGY</div><div class="s-n">' + syn.name + '</div><div class="s-d">' + syn.desc + '</div>' : '<div class="s-d">Pick two frogs</div>';
    $('btn-battle').disabled = app.picks.length !== 2;
  }

  // ---------- ALCHEMY (§9, §19) ----------
  function renderAlchemy() {
    var root = $('racks'); root.innerHTML = '';
    app.picks.forEach(function (k, fi) {
      var rack = document.createElement('div'); rack.className = 'rack';
      var left = document.createElement('div');
      left.appendChild(portrait(k, 200, 200, flasksOf(k)));
      left.insertAdjacentHTML('beforeend', '<div class="rname">' + FB.FROGS[k].name.toUpperCase() + '</div>');
      var right = document.createElement('div');
      right.innerHTML = '<div class="seq-h"><span>FLASK SEQUENCE</span><button class="chip auto">🎲 AUTO</button></div>';
      var slots = document.createElement('div'); slots.className = 'slots';
      flasksOf(k).forEach(function (l, si) {
        var b = document.createElement('button'); b.className = 'slot' + (app.slotPick && app.slotPick.kind === k && app.slotPick.i === si ? ' pick' : '');
        b.innerHTML = '<div class="sl">SLOT ' + ['I', 'II', 'III'][si] + '</div>';
        b.appendChild(bottle(l, 34, 40, si === 0 ? 2 : 0));
        b.insertAdjacentHTML('beforeend', '<div class="ln" style="color:' + FB.LIQUIDS[l].color + '">' + FB.LIQUIDS[l].name + '</div>');
        b.onclick = function () { app.slotPick = app.slotPick && app.slotPick.kind === k && app.slotPick.i === si ? null : { kind: k, i: si }; renderAlchemy(); };
        slots.appendChild(b);
      });
      right.appendChild(slots);
      right.querySelector('.auto').onclick = function () {
        var r = AI.makeRand(Date.now() % 1e9), arr = FB.LIQUID_ORDER.slice();
        for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), tt = arr[i]; arr[i] = arr[j]; arr[j] = tt; }
        app.flasks[k] = arr.slice(0, 3); store.set('flasks', app.flasks); app.slotPick = null; renderAlchemy();
      };
      rack.appendChild(left); rack.appendChild(right); root.appendChild(rack);
    });
    // реакции пары через Link (любая колба A × любая колба B) и через зоны
    var A = app.picks[0] ? flasksOf(app.picks[0]) : [], B = app.picks[1] ? flasksOf(app.picks[1]) : [];
    var linkKeys = {};
    A.forEach(function (a) { B.forEach(function (b) { if (a !== b) linkKeys[FB.reactionKey(a, b)] = true; }); });
    $('reactions').innerHTML = Object.keys(FB.REACTIONS).map(function (key) {
      var rx = FB.REACTIONS[key], ls = key.split('+');
      return '<div class="rx' + (linkKeys[key] ? ' on' : '') + '"><div class="rf"><span style="color:' + FB.LIQUIDS[ls[0]].color + '">' + FB.LIQUIDS[ls[0]].name + '</span> + <span style="color:' + FB.LIQUIDS[ls[1]].color + '">' + FB.LIQUIDS[ls[1]].name + '</span></div>' +
        '<div class="rn" style="color:rgb(' + RXCOL[key] + ')">' + rx.name + '</div><div class="rd">' + rx.desc + '</div>' + (linkKeys[key] ? '<div class="rv">✦ your pair can Link it</div>' : '') + '</div>';
    }).join('') + '<div class="rx on"><div class="rf">SAME + SAME</div><div class="rn" style="color:#ffd24a">OVERCHARGE</div><div class="rd">The base effect, stronger.</div></div>';
    var lq = $('liquids'); lq.innerHTML = '';
    FB.LIQUID_ORDER.forEach(function (l) {
      var b = document.createElement('button'); b.className = 'liq' + (app.slotPick ? ' armed' : '');
      b.appendChild(bottle(l, 34, 40, 0));
      b.insertAdjacentHTML('beforeend', '<div class="ln" style="color:' + FB.LIQUIDS[l].color + '">' + FB.LIQUIDS[l].name + '</div><div class="lh">' + FB.LIQUIDS[l].hint + '</div>');
      b.onclick = function () {
        if (!app.slotPick) return;
        var arr = flasksOf(app.slotPick.kind).slice(), j = arr.indexOf(l);
        if (j >= 0) arr[j] = arr[app.slotPick.i]; // жидкость уже стоит в другом слоте — меняем местами (без дубликатов, §9.3)
        arr[app.slotPick.i] = l;
        app.flasks[app.slotPick.kind] = arr; store.set('flasks', app.flasks); log('flasks', { kind: app.slotPick.kind, f: arr });
        app.slotPick = null; renderAlchemy();
      };
      lq.appendChild(b);
    });
  }

  // ---------- экраны ----------
  function showScreen(name) {
    app.screen = name;
    var meta = name === 'team' || name === 'alchemy';
    $('team').classList.toggle('hidden', name !== 'team');
    $('alchemy').classList.toggle('hidden', name !== 'alchemy');
    $('topbar').classList.toggle('hidden', !meta);
    $('nav').classList.toggle('hidden', !meta);
    $('hud').classList.toggle('hidden', name !== 'battle');
    $('result').classList.toggle('hidden', name !== 'result');
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('on', t.dataset.tab === name); });
    if (name === 'team') { buildRoster(); renderTeam(); }
    if (name === 'alchemy') renderAlchemy();
    layout();
  }
  document.querySelectorAll('.tab').forEach(function (t) { t.onclick = function () { if (!t.disabled) showScreen(t.dataset.tab); }; });
  $('btn-clear').onclick = function () { app.picks = []; store.set('picks', app.picks); renderTeam(); };

  // ---------- бой ----------
  function seedFromUrl() { var m = /[?&]seed=(\d+)/.exec(location.search); return m ? +m[1] : (Date.now() % 1e9); }
  var lastMatch = null;
  function startBattle(rematch) {
    var seed = seedFromUrl();
    app.rand = AI.makeRand(seed ^ 0x5bd1e995);
    var bt, bf;
    if (rematch && lastMatch) { bt = lastMatch.bt; bf = lastMatch.bf; }
    else {
      var o = FB.FROG_ORDER, pairs = [];
      for (var i = 0; i < o.length; i++) for (var j = i + 1; j < o.length; j++) pairs.push([o[i], o[j]]);
      bt = pairs[Math.floor(app.rand() * pairs.length)];
      bf = [AI.flasksFor(bt[0], app.rand), AI.flasksFor(bt[1], app.rand)];
    }
    var pf = [flasksOf(app.picks[0]).slice(), flasksOf(app.picks[1]).slice()];
    lastMatch = { bt: bt, bf: bf };
    app.s = Sim.createMatch(app.picks, bt, pf, bf, seed);
    log('match', { seed: seed, player: app.picks, pf: pf, bot: bt, bf: bf });
    Sim.startRound(app.s);
    app.shown = Sim.clone(app.s);
    app.disp = {};
    app.s.frogs.forEach(function (f) { app.disp[f.id] = { x: f.x, y: f.y, z: 0, facing: f.side === 0 ? 0 : Math.PI, alive: true, flash: 0, wob: 0, squash: 0 }; });
    app.fx = []; app.queue = []; app.cur = null; app.aim = null; app.selected = -1;
    showScreen('battle');
    buildCards();
    banner('FIGHT!', 'gold', 1100, 'Round 1');
    app.busy = true;
    setTimeout(function () { app.busy = false; nextTurn(); }, 1200 / app.speed);
  }

  function actable(f) { return app.s && app.s.turnSide === 0 && !app.busy && !app.auto && Sim.canAct(app.s, f); }

  function nextTurn() {
    var s = app.s;
    if (app.screen !== 'battle') return;
    if (s.phase !== 'play') return onMatchOver();
    if (s.turnSide === 1 || app.auto) return botTurn();
    var cur = s.frogs[app.selected];
    if (!cur || !Sim.canAct(s, cur)) { var c = s.frogs.filter(function (f) { return Sim.canAct(s, f); }); app.selected = c.length ? c[0].id : -1; }
    banner('YOUR TURN', 'p', 650);
    app.turnLeft = T.turnTimeSec;
    updateHud();
  }

  function botTurn() {
    var side = app.s.turnSide;
    banner(side ? 'BOT\'S TURN' : 'AUTO', side ? 'b' : 'p', 600);
    app.busy = true; updateHud();
    clearTimeout(app.botTimer);
    app.botTimer = setTimeout(function () {
      if (app.screen !== 'battle' || !app.s || app.s.turnSide !== side) return;
      var plan = AI.choose(app.s, app.rand);
      if (!plan) { app.busy = false; return; }
      app.selected = plan.cmd.frog;
      if (plan.cmd.mode !== 'skip') app.aim = buildAim(app.s.frogs[plan.cmd.frog], plan.cmd.dx, plan.cmd.dy, null, 1);
      updateHud();
      app.botTimer = setTimeout(function () { app.aim = null; execute(plan.cmd); }, 900 / app.speed);
    }, 600 / app.speed);
  }

  function execute(cmd) {
    var pre = Sim.clone(app.s);
    var r = Sim.apply(app.s, cmd);
    if (!r.ok) { log('reject', { cmd: cmd, why: r.why }); app.busy = false; return; }
    log('act', { side: pre.turnSide, frog: pre.frogs[cmd.frog].kind, flask: Sim.activeFlask(pre.frogs[cmd.frog]), dx: Math.round(cmd.dx || 0), dy: Math.round(cmd.dy || 0), skip: cmd.mode === 'skip' });
    app.shown = pre; app.queue = r.events.slice(); app.busy = true; app.aim = null; app.turnLeft = 0;
    updateHud();
  }

  function onPlaybackDone() {
    app.shown = Sim.clone(app.s);
    app.s.frogs.forEach(function (f) { var d = app.disp[f.id]; d.x = f.x; d.y = f.y; d.alive = f.alive; d.z = 0; });
    app.busy = false; updateHud(); nextTurn();
  }

  function onMatchOver() {
    var s = app.s, win = s.matchWinner === 0;
    app.busy = true;
    banner(win ? 'VICTORY!' : 'DEFEAT', win ? 'gold' : 'b', 1400, s.roundWhy === 'time' ? 'More HP left' : null);
    log('matchEnd', { winner: s.matchWinner, why: s.roundWhy, rounds: s.round });
    setTimeout(function () { if (app.screen === 'battle') showResult(); }, 1600 / app.speed);
  }

  function showResult() {
    var s = app.s, win = s.matchWinner === 0;
    $('result').classList.toggle('lose', !win);
    $('res-title').textContent = win ? 'VICTORY' : 'DEFEAT';
    [0, 1].forEach(function (side) {
      var root = $('res-' + side); root.innerHTML = '';
      s.frogs.filter(function (f) { return f.side === side; }).forEach(function (f) {
        var d = document.createElement('div'); if (!f.alive) d.className = 'gone';
        d.appendChild(portrait(f.kind, 160, 160, f.flasks));
        d.insertAdjacentHTML('beforeend', '<div>' + FB.FROGS[f.kind].name.toUpperCase() + '</div>' + (f.alive ? '' : '<span class="x">✕</span>'));
        root.appendChild(d);
      });
    });
    $('res-sub').textContent = (s.roundWhy === 'time' ? 'Decided by remaining HP. ' : '') + 'Rounds: ' + s.round;
    showScreen('result');
  }

  // ---------- проигрывание событий ----------
  function D(id) { return app.disp[id]; }
  function SF(id) { return app.shown.frogs[id]; }
  function ease(u) { return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; }
  function easeOut(u) { return 1 - Math.pow(1 - u, 3); }
  function faceTo(d, from, to) { var dx = to.x - from.x, dy = to.y - from.y; if (Math.abs(dx) + Math.abs(dy) > 1) d.facing = Math.atan2(dx, -dy); }

  function startEvent(e) {
    var dur = 0, upd = null, end = null;
    switch (e.t) {
      case 'jump': {
        var d = D(e.id); faceTo(d, e.from, e.to);
        var H = Sim.arcHeight(e.len) * 0.9;
        dur = 0.45 + e.len / 1000;
        upd = function (u) { var k = ease(u); d.x = e.from.x + (e.to.x - e.from.x) * k; d.y = e.from.y + (e.to.y - e.from.y) * k; d.z = Math.sin(Math.PI * u) * H; d.squash = u < 0.12 ? -0.12 : 0; };
        end = function () { d.z = 0; d.squash = 0.25; SF(e.id).x = e.to.x; SF(e.id).y = e.to.y; dust(e.to.x, e.to.y, 8); app.shake = Math.max(app.shake, 3); };
        break;
      }
      case 'bonk': { var o = app.shown.objects[e.obj]; sparks(o.x, o.y, 12, '255,220,150'); app.shake = Math.max(app.shake, 7); addFx({ k: 'num', x: o.x, y: o.y - 30, text: 'BONK!', color: '#ffd09a', life: 0.8 }); dur = 0.12; break; }
      case 'impact': { sparks(e.x, e.y, 14, '255,240,170'); app.shake = Math.max(app.shake, 9); dur = 0.05; break; }
      case 'hit': {
        var f = SF(e.id); f.hp = Math.max(0, f.hp - e.dmg); D(e.id).flash = 1;
        var col = { poison: '#8dff6a', bleed: '#ff5a5a', burn: '#ff9a4a', ember: '#ff8a4a', pit: '#d9b07a', wall: '#d9b07a', overload: '#ff6a3a' }[e.src] || '#ffffff';
        addFx({ k: 'num', x: D(e.id).x, y: D(e.id).y - 24, text: '-' + e.dmg, color: col, life: 1.0, big: e.src === 'impact' || /blast|meteor|shatter|corrosive|steam/.test(e.src) });
        dur = e.src === 'poison' || e.src === 'bleed' ? 0.35 : 0.12;
        updateHud();
        break;
      }
      case 'death': {
        var dz = D(e.id); dz.alive = false; SF(e.id).alive = false;
        for (var i = 0; i < 10; i++) addFx({ k: 'smoke', x: dz.x, y: dz.y, vx: (Math.random() - 0.5) * 50, vy: -20 - Math.random() * 40, life: 1.2 });
        sparks(dz.x, dz.y, 20, '255,200,120');
        addFx({ k: 'num', x: dz.x, y: dz.y - 34, text: 'BROKEN!', color: '#ffd23f', life: 1.3, big: true });
        app.shake = Math.max(app.shake, 12); dur = 0.5; updateHud();
        break;
      }
      case 'push': {
        var dp = D(e.id); dur = e.src === 'hook' ? 0.28 : 0.26;
        upd = function (u) { var k = easeOut(u); dp.x = e.from.x + (e.to.x - e.from.x) * k; dp.y = e.from.y + (e.to.y - e.from.y) * k; dp.wob = Math.sin(u * 20) * 0.25 * (1 - u); };
        end = function () { dp.wob = 0; SF(e.id).x = e.to.x; SF(e.id).y = e.to.y; if (e.wall) { sparks(e.to.x, e.to.y, 8, '220,200,160'); app.shake = Math.max(app.shake, 6); } };
        break;
      }
      case 'flask': break;
      case 'zone': { app.shown.zones.push(Object.assign({ born: app.t }, e.zone)); var zc = R.ZCOL[e.zone.type]; addFx({ k: 'ring', x: e.zone.x, y: e.zone.y, r0: 6, r1: e.zone.r, life: 0.45, color: zc }); splashLiquid(e.zone.x, e.zone.y, zc); dur = 0.12; break; }
      case 'zoneGone': { app.shown.zones = app.shown.zones.filter(function (z) { return z.id !== e.id; }); break; }
      case 'reaction': { // (§11.2)
        var rc = RXCOL[e.key];
        for (var q = 0; q < 3; q++) addFx({ k: 'ring', x: e.x, y: e.y, r0: 10 + q * 6, r1: e.r * (1 + q * 0.2), life: 0.5 + q * 0.12, color: rc, wide: true });
        sparks(e.x, e.y, 30, rc);
        addFx({ k: 'flash', life: 0.35, color: rc });
        addFx({ k: 'num', x: e.x, y: e.y - 40, text: e.name + '!', color: 'rgb(' + rc + ')', life: 1.4, big: true, huge: true });
        app.shake = Math.max(app.shake, 14); dur = 0.45;
        break;
      }
      case 'objState': {
        var so = app.shown.objects[e.id]; so.state = e.state; so.hp = app.s.objects[e.id].hp;
        if (e.state === 'destroyed') { for (var w = 0; w < 14; w++) addFx({ k: 'debris', x: e.x, y: e.y, vx: (Math.random() - 0.5) * 160, vy: (Math.random() - 0.5) * 160, life: 0.7, color: e.kind === 'barrel' ? '#7a4c25' : (e.kind === 'tank' ? '#bfe6f2' : '#a59a8a') }); app.shake = Math.max(app.shake, 10); addFx({ k: 'num', x: e.x, y: e.y - 30, text: 'DESTROYED', color: '#ffb47a', life: 1.0 }); }
        else addFx({ k: 'num', x: e.x, y: e.y - 30, text: 'CRACKED', color: '#e8c89a', life: 0.9 });
        dust(e.x, e.y, 10); dur = 0.15;
        break;
      }
      case 'plateState': { var sp = app.shown.plates[e.id]; sp.state = e.state; sp.hp = app.s.plates[e.id].hp; dust(e.x, e.y, 14); if (e.state === 'pit') { app.shake = Math.max(app.shake, 10); addFx({ k: 'num', x: e.x, y: e.y - 26, text: 'COLLAPSE!', color: '#e8b07a', life: 1.0 }); } dur = 0.15; break; }
      case 'fall': { SF(e.id).pit = e.plate; addFx({ k: 'num', x: D(e.id).x, y: D(e.id).y - 30, text: 'FELL IN!', color: '#e8b07a', life: 1.0 }); dur = 0.25; break; }
      case 'tongue': { var dt = D(e.id); faceTo(dt, e.from, e.to); dt.tongueOut = true; dur = 0.3; addFx({ k: 'tongue', id: e.id, target: e.target, life: 0.6 }); break; }
      case 'link': {
        app.shown.links[e.side] = { a: e.a, b: e.b };
        addFx({ k: 'num', x: D(e.b).x, y: D(e.b).y - 40, text: 'LINKED!', color: '#9fe8ff', life: 1.2, big: true });
        sparks(D(e.b).x, D(e.b).y, 16, '150,220,255'); dur = 0.3;
        break;
      }
      case 'unlink': { app.shown.links[e.side] = null; break; }
      case 'status': {
        var sf = SF(e.id), fin = app.s.frogs[e.id];
        ['poison', 'bleed', 'chill', 'corroded', 'envShield'].forEach(function (k) { sf[k] = fin[k]; });
        if (e.s === 'shield') sf.envShield = 1;
        var lbl = { poison: ['POISON', '#8dff6a'], bleed: ['BLEED', '#ff6b6b'], chill: ['CHILL', '#9fd8ff'], corroded: ['CORRODED', '#c6ff4a'], shield: ['SHIELD', '#ffe08a'] }[e.s];
        if (lbl) addFx({ k: 'num', x: D(e.id).x, y: D(e.id).y + 28, text: lbl[0], color: lbl[1], life: 1.0 });
        dur = 0.06; updateHud();
        break;
      }
      case 'statusGone': { var sg = SF(e.id); if (e.s === 'chill') sg.chill = 0; if (e.s === 'corroded') sg.corroded = 0; break; }
      case 'shieldBlock': { SF(e.id).envShield = 0; addFx({ k: 'num', x: D(e.id).x, y: D(e.id).y - 30, text: 'BLOCKED', color: '#ffe08a', life: 0.9 }); dur = 0.15; break; }
      case 'flaskSwitch': { var fs = SF(e.id); fs.fi = e.fi; addFx({ k: 'num', x: D(e.id).x, y: D(e.id).y + 30, text: '⚗ ' + FB.LIQUIDS[e.liquid].name, color: FB.LIQUIDS[e.liquid].color, life: 0.9 }); updateHud(); break; }
      case 'skip': { addFx({ k: 'num', x: D(e.id).x, y: D(e.id).y - 30, text: 'SKIP', color: '#cfc2a6', life: 0.8 }); dur = 0.3; break; }
      case 'round': { app.shown.round = e.round; app.shown.acted = {}; banner('ROUND ' + e.round, 'gold', 900, e.round >= T.overloadRound ? 'ARENA OVERLOAD' : null); dur = 0.8; updateHud(); break; }
      case 'overload': { app.shown.safeR = e.r; app.shake = Math.max(app.shake, 8); break; }
      case 'turn': { app.shown.turnSide = e.side; break; }
      case 'act': { app.shown.acted[e.id] = true; break; }
      case 'roundEnd': dur = 0.4; break;
    }
    return { e: e, t: 0, dur: dur / app.speed, upd: upd, end: end };
  }

  function stepPlayback(dt) {
    var guard = 0;
    while (guard++ < 300) {
      if (!app.cur) {
        if (!app.queue.length) { if (app.busy && app.playing) { app.playing = false; onPlaybackDone(); } return; }
        app.playing = true;
        app.cur = startEvent(app.queue.shift());
        if (app.cur.dur <= 0) { if (app.cur.upd) app.cur.upd(1); if (app.cur.end) app.cur.end(); app.cur = null; continue; }
      }
      var c = app.cur; c.t += dt; dt = 0;
      var u = Math.min(1, c.t / c.dur);
      if (c.upd) c.upd(u);
      if (u >= 1) { if (c.end) c.end(); app.cur = null; continue; }
      return;
    }
  }

  // ---------- эффекты ----------
  function addFx(o) { o.t = 0; app.fx.push(o); return o; }
  function sparks(x, y, n, col) { for (var i = 0; i < n; i++) { var a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 140; addFx({ k: 'spark', x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.4 + Math.random() * 0.3, color: col }); } }
  function dust(x, y, n) { for (var i = 0; i < n; i++) { var a = Math.random() * Math.PI * 2, v = 20 + Math.random() * 50; addFx({ k: 'smoke', x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.6, dust: true }); } }
  function splashLiquid(x, y, col) { for (var i = 0; i < 12; i++) { var a = Math.random() * Math.PI * 2, v = 40 + Math.random() * 90; addFx({ k: 'drop', x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5, color: col }); } }

  function drawFx(c, under) {
    var sc = R.view.s;
    app.fx.forEach(function (f) {
      var u = Math.min(1, f.t / f.life), P;
      if (under !== (f.k === 'ring')) return;
      switch (f.k) {
        case 'ring': P = R.toScreen(f.x, f.y); c.strokeStyle = 'rgba(' + f.color + ',' + (1 - u) * 0.9 + ')'; c.lineWidth = (f.wide ? 10 : 3) * (1 - u) + 1; c.beginPath(); c.arc(P.x, P.y, (f.r0 + (f.r1 - f.r0) * easeOut(u)) * sc, 0, Math.PI * 2); c.stroke(); break;
        case 'spark': P = R.toScreen(f.x + f.vx * f.t, f.y + f.vy * f.t); c.fillStyle = 'rgba(' + (f.color || '255,240,170') + ',' + (1 - u) + ')'; c.beginPath(); c.arc(P.x, P.y, 3 * sc * (1 - u) + 1, 0, Math.PI * 2); c.fill(); break;
        case 'drop': P = R.toScreen(f.x + f.vx * f.t, f.y + f.vy * f.t); c.fillStyle = 'rgba(' + f.color + ',' + (1 - u) + ')'; c.beginPath(); c.arc(P.x, P.y - Math.sin(Math.PI * u) * 12 * sc, 2.6 * sc, 0, Math.PI * 2); c.fill(); break;
        case 'debris': P = R.toScreen(f.x + f.vx * f.t, f.y + f.vy * f.t); c.fillStyle = f.color; c.globalAlpha = 1 - u; c.fillRect(P.x - 3 * sc, P.y - 3 * sc - Math.sin(Math.PI * u) * 18 * sc, 6 * sc, 5 * sc); c.globalAlpha = 1; break;
        case 'smoke': P = R.toScreen(f.x + f.vx * f.t, f.y + f.vy * f.t); c.fillStyle = f.dust ? 'rgba(170,140,100,' + (0.5 * (1 - u)) + ')' : 'rgba(210,210,210,' + (0.55 * (1 - u)) + ')'; c.beginPath(); c.arc(P.x, P.y, (4 + 10 * u) * sc, 0, Math.PI * 2); c.fill(); break;
        case 'flash': c.fillStyle = 'rgba(' + f.color + ',' + (0.35 * (1 - u)) + ')'; c.fillRect(0, 0, R.view.cw, R.view.ch); break;
        case 'tongue': {
          var A = R.toScreen(D(f.id).x, D(f.id).y), B = R.toScreen(D(f.target).x, D(f.target).y), k = u < 0.5 ? u * 2 : 1;
          c.strokeStyle = '#c9cfd4'; c.lineWidth = 5 * sc; c.lineCap = 'round'; c.beginPath(); c.moveTo(A.x, A.y); c.lineTo(A.x + (B.x - A.x) * k, A.y + (B.y - A.y) * k); c.stroke();
          c.strokeStyle = '#3b4247'; c.lineWidth = 2 * sc; c.stroke();
          if (u >= 0.98) D(f.id).tongueOut = false;
          break;
        }
        case 'num':
          P = R.toScreen(f.x, f.y);
          c.save(); c.globalAlpha = u < 0.75 ? 1 : (1 - u) / 0.25;
          var size = (f.huge ? 30 : (f.big ? 22 : 15)) * (u < 0.15 ? 0.6 + u / 0.15 * 0.4 : 1);
          c.font = '900 ' + size + 'px Nunito, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.lineWidth = 5; c.strokeStyle = 'rgba(15,10,6,0.92)'; c.strokeText(f.text, P.x, P.y - u * 28);
          c.fillStyle = f.color; c.fillText(f.text, P.x, P.y - u * 28); c.restore(); break;
      }
    });
  }

  // ---------- прицел и превью (§2.5, §7.1, §20) ----------
  var LIQ_ICONS = { ember: ['dmg'], venom: ['dot'], frost: ['slow'], force: ['kb', 'crack'] };
  function buildAim(f, dx, dy, finger, power) {
    var s = app.s, range = Sim.rangeFor(s, f);
    var cmd = { frog: f.id, dx: dx, dy: dy };
    var pv = Sim.preview(s, cmd);
    var a = { frog: f.id, range: range, finger: finger, power: power, cmd: cmd, valid: pv.ok, preview: { hits: [], pushes: [] } };
    if (!pv.ok) return a;
    var len = Math.min(range, Math.hypot(dx, dy)), n = Sim.norm(dx, dy);
    a.target = { x: f.x + n.x * len, y: f.y + n.y * len };
    var after = pv.state, P = a.preview, hp = {};
    s.frogs.forEach(function (x) { hp[x.id] = x.hp; });
    pv.events.forEach(function (e) {
      if (e.t === 'jump' && e.id === f.id) P.land = e.to;
      if (e.t === 'bonk') P.bonk = true;
      if (e.t === 'push') P.pushes.push(e);
      if (e.t === 'link') P.link = true;
      if (e.t === 'flask') P.res = e.res;
      if (e.t === 'reaction') { P.reactR = e.r; }
      if (e.t === 'objState') P.breaks = (P.breaks || 0) + 1;
    });
    s.frogs.forEach(function (x) {
      var d = hp[x.id] - after.frogs[x.id].hp;
      if (d > 0 && x.side !== f.side) P.hits.push({ id: x.id, dmg: d, kill: !after.frogs[x.id].alive });
    });
    if (!P.land) P.land = { x: f.x, y: f.y };
    var flask = Sim.activeFlask(f), partner = Sim.linkPartner(s, f);
    if (P.link) { P.title = 'LINK'; P.titleColor = '#9fe8ff'; P.color = '150,220,255'; P.icons = []; P.desc = 'No damage. Next launch from the pair fires both flasks.'; }
    else if (P.res && P.res.kind === 'react') {
      var rx = FB.REACTIONS[P.res.key]; P.react = true; P.title = rx.name; P.titleColor = 'rgb(' + RXCOL[P.res.key] + ')'; P.color = RXCOL[P.res.key]; P.icons = rx.icons; P.areaR = P.reactR; P.desc = rx.desc;
    } else if (P.res && P.res.kind === 'over') {
      P.title = 'OVERCHARGE'; P.titleColor = FB.LIQUIDS[P.res.liquid].color; P.color = FB.LIQUIDS[P.res.liquid].glow; P.icons = LIQ_ICONS[P.res.liquid]; P.desc = FB.LIQUIDS[P.res.liquid].name + ', stronger.';
    } else {
      P.title = FB.LIQUIDS[flask].name; P.titleColor = FB.LIQUIDS[flask].color; P.color = FB.LIQUIDS[flask].glow; P.icons = LIQ_ICONS[flask]; P.areaR = T.zoneR * (f.kind === 'bellows' ? T.wideSpillMul : 1); P.desc = FB.LIQUIDS[flask].desc;
    }
    if (P.bonk) P.note = 'BLOCKED — lands short';
    else if (P.breaks) P.note = 'BREAKS ' + P.breaks;
    a.partner = partner ? partner.id : -1;
    return a;
  }

  var drag = null;
  function pointerPos(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  cv.addEventListener('pointerdown', function (e) {
    if (app.screen !== 'battle' || app.busy || app.paused || !app.s || app.s.turnSide !== 0 || app.s.phase !== 'play' || app.auto) return;
    var p = pointerPos(e), w = R.toWorld(p.x, p.y);
    log('tap', { nx: +(p.x / R.view.cw).toFixed(3), ny: +(p.y / R.view.ch).toFixed(3) });
    var hit = null, bd = 1e9;
    app.s.frogs.forEach(function (f) { if (!Sim.canAct(app.s, f)) return; var d = Sim.dist(w.x, w.y, f.x, f.y); if (d <= Math.max(f.r * 1.8, 30 / R.view.s) && d < bd) { bd = d; hit = f; } });
    var anchor = p;
    if (hit) { if (app.selected !== hit.id) { app.selected = hit.id; updateHud(); } anchor = R.toScreen(hit.x, hit.y); }
    if (app.selected < 0) return;
    cv.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, anchor: anchor };
    e.preventDefault();
  });
  cv.addEventListener('pointermove', function (e) {
    if (!drag || drag.id !== e.pointerId) return;
    var p = pointerPos(e), px = drag.anchor.x - p.x, py = drag.anchor.y - p.y, len = Math.hypot(px, py);
    var maxPull = Math.min(170, R.view.cw * 0.4), power = Math.min(1, len / maxPull), f = app.s.frogs[app.selected];
    if (power < T.minPull) { app.aim = null; renderPreviewCard(); return; }
    var range = Sim.rangeFor(app.s, f), n = Sim.norm(px, py), F = R.toScreen(f.x, f.y);
    app.aim = buildAim(f, n.x * power * range, n.y * power * range, { x: F.x - n.x * power * maxPull, y: F.y - n.y * power * maxPull }, power);
    renderPreviewCard();
  });
  function endDrag(e, cancel) {
    if (!drag || drag.id !== e.pointerId) return;
    var aim = app.aim; drag = null; app.aim = null;
    if (cancel || !aim || !aim.valid) { renderPreviewCard(); return; }
    execute(aim.cmd);
  }
  cv.addEventListener('pointerup', function (e) { endDrag(e, false); });
  cv.addEventListener('pointercancel', function (e) { endDrag(e, true); });
  $('btn-skip').onclick = function () { if (app.busy || !app.s || app.s.turnSide !== 0) return; var f = app.s.frogs[app.selected]; if (f && Sim.canAct(app.s, f)) execute({ frog: f.id, mode: 'skip' }); };

  // ---------- HUD ----------
  function buildCards() {
    app.s.frogs.forEach(function (f) {
      var el = $('fc-' + f.id); el.innerHTML = '';
      el.appendChild(portrait(f.kind, 76, 76, f.flasks));
      el.insertAdjacentHTML('beforeend', '<div><div class="fn">' + FB.FROGS[f.kind].name.toUpperCase() + '<span class="tag"></span></div><div class="hpb"><i></i><em></em></div><div class="ffl"></div></div>');
      el.onclick = function () { if (f.side === 0 && actable(f)) { app.selected = f.id; updateHud(); } };
    });
  }
  function updateHud() {
    if (!app.shown || app.screen !== 'battle') return;
    var s = app.s, sh = app.shown;
    sh.frogs.forEach(function (f) {
      var el = $('fc-' + f.id);
      el.querySelector('.hpb i').style.width = (100 * f.hp / f.maxHp) + '%';
      el.querySelector('.hpb em').textContent = f.hp + '/' + f.maxHp;
      var fl = el.querySelector('.ffl'); fl.innerHTML = '';
      f.flasks.forEach(function (l, i) { var b = bottle(l, 13, 16, i === f.fi ? 2 : (i === (f.fi + 1) % 3 ? 1 : 0)); if (i === f.fi) b.className = 'on'; fl.appendChild(b); });
      var st = (f.poison ? '☠' : '') + (f.bleed ? '💧' : '') + (f.chill ? '❄' : '') + (f.corroded ? '⚠' : '') + (f.envShield ? '🛡' : '') + (f.pit >= 0 ? '⬇' : '');
      fl.insertAdjacentHTML('beforeend', '<span class="sts">' + st + '</span>');
      var done = s.phase === 'play' && s.acted[f.id] && f.alive;
      el.querySelector('.tag').textContent = done ? 'DONE' : (s.linkPartner ? '' : '');
      if (Sim.linkPartner(sh, f)) el.querySelector('.tag').textContent = 'LINKED';
      el.classList.toggle('done', !!done);
      el.classList.toggle('dead', !f.alive);
      el.classList.toggle('sel', f.side === 0 && app.selected === f.id && s.turnSide === 0 && !app.busy);
    });
    $('round-n').textContent = sh.round || s.round;
    $('ovl').classList.toggle('hidden', !(sh.safeR !== null && sh.safeR !== undefined));
    var myTurn = s.turnSide === 0 && s.phase === 'play' && !app.busy && !app.auto;
    document.querySelector('#hud .bottom').classList.toggle('wait', !myTurn);
    $('btn-skip').disabled = !myTurn;
    renderPreviewCard();
  }

  function renderPreviewCard() {
    var el = $('pvcard'), s = app.s; if (!s) return;
    var f = s.frogs[app.selected];
    if (!f) { el.innerHTML = '<div></div><div class="pv-d">' + (s.turnSide === 1 ? 'Bot is thinking…' : '') + '</div>'; return; }
    var a = app.aim && app.aim.frog === f.id ? app.aim : null, partner = Sim.linkPartner(s, f);
    var fl = '<div class="pv-fl"></div>';
    var html;
    if (a && a.valid) {
      html = '<div><div class="pv-t" style="color:' + a.preview.titleColor + '">' + a.preview.title + '</div><div class="pv-d">' + (a.preview.desc || '') +
        (a.preview.hits.length ? ' <b style="color:#ff8a7a">' + a.preview.hits.map(function (h) { return '-' + h.dmg; }).join(' ') + '</b>' : '') + '</div></div>';
    } else if (s.turnSide === 1) {
      html = '<div><div class="pv-h">BOT</div><div class="pv-d">' + FB.FROGS[f.kind].name + ' is aiming…</div></div>';
    } else {
      var next = partner ? FB.LIQUIDS[Sim.activeFlask(f)].name + ' + ' + FB.LIQUIDS[Sim.activeFlask(partner)].name : FB.LIQUIDS[Sim.activeFlask(f)].name;
      var rx = partner && Sim.activeFlask(f) !== Sim.activeFlask(partner) ? FB.REACTIONS[FB.reactionKey(Sim.activeFlask(f), Sim.activeFlask(partner))].name : null;
      html = '<div><div class="pv-h">DRAG TO LAUNCH ' + FB.FROGS[f.kind].name.toUpperCase() + '</div><div class="pv-d">' + (partner ? 'LINKED: ' + next + (rx ? ' = <b>' + rx + '</b>' : ' = OVERCHARGE') : 'Active flask: <b style="color:' + FB.LIQUIDS[Sim.activeFlask(f)].color + '">' + next + '</b>. Land on a zone or your other frog for combos.') + '</div></div>';
    }
    el.innerHTML = fl + html;
    var holder = el.querySelector('.pv-fl');
    holder.appendChild(bottle(Sim.activeFlask(f), 22, 26, 2));
    if (partner) { holder.insertAdjacentHTML('beforeend', '+'); holder.appendChild(bottle(Sim.activeFlask(partner), 22, 26, 2)); }
  }

  var bannerTimer = null;
  function banner(text, cls, ms, small) {
    var b = $('banner');
    b.className = 'banner ' + (cls || '');
    b.innerHTML = text + (small ? '<small>' + small + '</small>' : '');
    void b.offsetWidth; b.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(function () { b.classList.remove('show'); }, (ms || 900) / app.speed);
  }

  // ---------- таймер активации (D-046) ----------
  function myTurnNow() { return app.screen === 'battle' && app.s && app.s.phase === 'play' && app.s.turnSide === 0 && !app.busy && !app.auto; }
  function tickTimer(dt) {
    var el = $('timer');
    if (!myTurnNow() || app.turnLeft <= 0) return;
    app.turnLeft -= dt;
    var sec = Math.max(0, Math.ceil(app.turnLeft));
    if (sec !== app.timerShown) { app.timerShown = sec; el.querySelector('span').textContent = sec; el.classList.toggle('low', sec <= 5); }
    el.querySelector('i').style.width = Math.max(0, 100 * app.turnLeft / T.turnTimeSec) + '%';
    if (app.turnLeft <= 0) {
      drag = null; app.aim = null;
      var f = app.s.frogs[app.selected];
      if (!f || !Sim.canAct(app.s, f)) f = app.s.frogs.filter(function (x) { return Sim.canAct(app.s, x); })[0];
      if (!f) return;
      log('timeout', { frog: f.kind }); banner('TIME!', 'b', 600, 'Skipped');
      execute({ frog: f.id, mode: 'skip' });
    }
  }

  // ---------- меню ----------
  function setSpeedLabel() { $('m-speed').textContent = 'Animation speed: x' + app.speed; }
  $('btn-menu').onclick = function () { app.paused = true; $('menu').classList.remove('hidden'); setSpeedLabel(); };
  $('m-resume').onclick = function () { app.paused = false; $('menu').classList.add('hidden'); };
  $('m-speed').onclick = function () { app.speed = app.speed === 1 ? 2 : 1; store.set('speed', app.speed); setSpeedLabel(); };
  $('m-help').onclick = function () { $('help').classList.remove('hidden'); };
  $('m-quit').onclick = function () { app.paused = false; $('menu').classList.add('hidden'); quit(); };
  $('btn-help').onclick = function () { $('help').classList.remove('hidden'); };
  $('h-close').onclick = function () { $('help').classList.add('hidden'); };
  $('btn-battle').onclick = function () { if (app.picks.length === 2) startBattle(false); };
  $('btn-continue').onclick = function () { quit(); };
  $('btn-rematch').onclick = function () { startBattle(true); };
  function quit() { clearTimeout(app.botTimer); app.s = null; app.shown = null; app.queue = []; app.cur = null; app.busy = false; app.aim = null; app.fx = []; showScreen('team'); }

  // ---------- раскладка и цикл ----------
  function layout() {
    var top = 0, bot = 0;
    if (app.screen === 'battle') {
      top = document.querySelector('#hud .top').getBoundingClientRect().height + 6;
      bot = document.querySelector('#hud .bottom').getBoundingClientRect().height + 6;
    }
    R.resize(top, bot);
    draw();
  }
  window.addEventListener('resize', layout);

  var last = performance.now(), lastFrame = 0;
  function update(now) {
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    app.t += dt;
    if (app.paused) return;
    if (app.s && app.screen === 'battle') stepPlayback(dt);
    app.fx.forEach(function (f) { f.t += dt; });
    app.fx = app.fx.filter(function (f) { return f.t < f.life; });
    if (app.disp) for (var id in app.disp) { var d = app.disp[id]; d.flash = Math.max(0, d.flash - dt * 4); if (d.squash > 0) d.squash = Math.max(0, d.squash - dt * 1.6); }
    app.shake = Math.max(0, app.shake - dt * 40);
    tickTimer(dt);
  }
  // Логика идёт и без кадров (фоновая вкладка, скрытая панель)
  setInterval(function () { var n = performance.now(); if (n - lastFrame > 250) { update(n); draw(); } }, 50);
  function loop(now) { lastFrame = now; update(now); draw(); requestAnimationFrame(loop); }
  function draw() {
    var battle = (app.screen === 'battle' || app.screen === 'result') && app.shown;
    R.frame(battle ? {
      state: app.shown, disp: app.disp, t: app.t, aim: app.aim, shake: app.shake,
      selected: app.s && app.s.phase === 'play' && (app.s.turnSide === 0 || app.aim) ? app.selected : -1,
      actable: function (f) { return actable(app.s.frogs[f.id]); },
      fxUnder: function (c) { drawFx(c, true); }, fxOver: function (c) { drawFx(c, false); }
    } : { state: null, t: app.t });
  }

  showScreen('team');
  requestAnimationFrame(loop);
  window.FBAPP = app; // отладка
  log('boot', { v: FB.VERSION });
})();
