// Экраны, ввод (рогатка), проигрывание событий симуляции, бот, HUD.
(function () {
  var T = FB.T, Sim = FB.Sim, R = FB.R, AI = FB.AI;
  var $ = function (id) { return document.getElementById(id); };
  var cv = $('cv');
  R.init(cv);

  function log(ev, data) { console.log('[FB] ev ' + ev, data !== undefined ? JSON.stringify(data) : ''); }
  document.title = 'ToadBrew v' + FB.VERSION;
  $('version').textContent = 'v' + FB.VERSION;

  var NAMES = ['AquaAlchemist', 'BogWitch'];
  var store = {
    get: function (k) { try { return JSON.parse(localStorage.getItem('toadbrew.' + k)); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem('toadbrew.' + k, JSON.stringify(v)); } catch (e) {} }
  };

  // ---------- состояние приложения ----------
  var app = {
    screen: 'team', picks: store.get('picks') || ['jumper', 'bulwark'],
    s: null, shown: null, disp: null, padVis: {}, fx: [], queue: [], cur: null, busy: false,
    selected: -1, mode: 'move', aim: null, rand: null, t: 0, shake: 0, speed: store.get('speed') || 1, botTimer: null, paused: false, auto: /[?&]auto=1/.test(location.search)
  };
  if (!Array.isArray(app.picks) || app.picks.some(function (k) { return !FB.FROGS[k]; })) app.picks = ['jumper', 'bulwark'];

  // ---------- иконки действий ----------
  var ICON = {
    jump: '<svg viewBox="0 0 40 40"><path d="M6 32 Q14 4 32 12" fill="none" stroke="#bfe9ff" stroke-width="3.5" stroke-dasharray="1 5" stroke-linecap="round"/><ellipse cx="31" cy="13" rx="6" ry="5" fill="#bfe9ff"/><ellipse cx="9" cy="33" rx="7" ry="2.5" fill="#7fb8d6"/></svg>',
    dash: '<svg viewBox="0 0 40 40"><path d="M4 26 q4-4 8 0 t8 0 t8 0 t8 0" fill="none" stroke="#7fd8ff" stroke-width="3"/><path d="M8 18 H30 M24 12 l7 6 -7 6" fill="none" stroke="#e8f8ff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    hop: '<svg viewBox="0 0 40 40"><path d="M4 32 Q10 14 18 28 Q26 6 36 22" fill="none" stroke="#bfe9ff" stroke-width="3.5" stroke-linecap="round"/><circle cx="36" cy="22" r="3.5" fill="#fff"/></svg>',
    slam: '<svg viewBox="0 0 40 40"><circle cx="20" cy="22" r="7" fill="#9fe0ff"/><circle cx="20" cy="22" r="12" fill="none" stroke="#ffd36a" stroke-width="2.5"/><circle cx="20" cy="22" r="17" fill="none" stroke="#ffd36a" stroke-width="2" stroke-dasharray="3 4"/><path d="M20 3 v8 M16 8 l4 4 4-4" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/></svg>',
    cloud: '<svg viewBox="0 0 40 40"><g fill="#9be03a"><circle cx="14" cy="22" r="8"/><circle cx="24" cy="17" r="9"/><circle cx="28" cy="25" r="7"/><circle cx="18" cy="27" r="7"/></g><circle cx="20" cy="22" r="4" fill="#3d5a12"/><circle cx="18.5" cy="21" r="1" fill="#9be03a"/><circle cx="21.5" cy="21" r="1" fill="#9be03a"/></svg>',
    tongue: '<svg viewBox="0 0 40 40"><path d="M6 32 Q16 30 22 18 Q26 8 34 8" fill="none" stroke="#ff8fb3" stroke-width="5" stroke-linecap="round"/><circle cx="34" cy="8" r="4.5" fill="#ff8fb3" stroke="#a83350" stroke-width="1.5"/></svg>',
    spin: '<svg viewBox="0 0 40 40"><path d="M20 6 A14 14 0 1 1 6 20" fill="none" stroke="#ffcf7e" stroke-width="3.5" stroke-linecap="round"/><path d="M6 20 l-3-6 M6 20 l6-3" stroke="#ffcf7e" stroke-width="3" stroke-linecap="round"/><path d="M14 20 l6-8 6 8 -6 8z" fill="#e0bb85" stroke="#6a4520" stroke-width="1.5"/></svg>',
    bubble: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="13" fill="rgba(160,230,255,0.35)" stroke="#dff7ff" stroke-width="2.5"/><circle cx="15" cy="15" r="3.5" fill="#fff"/><circle cx="31" cy="9" r="3" fill="none" stroke="#dff7ff" stroke-width="1.5"/></svg>',
    rest: '<svg viewBox="0 0 40 40"><text x="8" y="30" font-family="Lilita One, sans-serif" font-size="20" fill="#cfe3ef">Z</text><text x="20" y="22" font-family="Lilita One, sans-serif" font-size="14" fill="#9fb8c8">z</text><text x="28" y="14" font-family="Lilita One, sans-serif" font-size="10" fill="#7f98a8">z</text></svg>'
  };

  // ---------- экран команды ----------
  function portraitCanvas(kind, w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; R.portrait(c, kind); return c; }

  function buildRoster() {
    var root = $('roster'); root.innerHTML = '';
    FB.FROG_ORDER.forEach(function (k) {
      var d = FB.FROGS[k], el = document.createElement('button');
      el.className = 'card'; el.dataset.kind = k;
      el.appendChild(portraitCanvas(k, 240, 180));
      el.insertAdjacentHTML('beforeend', '<div class="check">✓</div><div class="cname">' + d.name + '</div><div class="role ' + d.role + '">' + d.role +
        '</div><div class="mini"><span class="h">♥' + d.hp + '</span><span class="d">⚔' + d.dmg + '</span><span class="s">💧' + d.st + '</span></div>');
      el.onclick = function () { togglePick(k); };
      root.appendChild(el);
    });
  }

  function togglePick(k) {
    var i = app.picks.indexOf(k);
    if (i >= 0) app.picks.splice(i, 1);
    else if (app.picks.length < 2) app.picks.push(k);
    else app.picks[1] = k;
    store.set('picks', app.picks);
    log('pick', app.picks);
    renderTeam();
  }

  function renderTeam() {
    document.querySelectorAll('.card').forEach(function (el) { el.classList.toggle('sel', app.picks.indexOf(el.dataset.kind) >= 0); });
    document.querySelectorAll('.slot').forEach(function (slot) {
      var i = +slot.dataset.slot, k = app.picks[i], body = slot.querySelector('.slot-body');
      var x = slot.querySelector('.slot-x'); if (x) x.remove();
      body.innerHTML = '';
      slot.classList.toggle('empty', !k);
      if (!k) { body.innerHTML = '<div class="slot-empty">Tap a frog<br>in the roster</div>'; return; }
      var d = FB.FROGS[k];
      body.appendChild(portraitCanvas(k, 300, 200));
      body.insertAdjacentHTML('beforeend', '<div class="fname">' + d.name + '</div><div class="role ' + d.role + '">' + d.role + '</div>' +
        '<div class="stats"><div><span>❤️ HP</span><b>' + d.hp + '</b></div><div><span>🗡️ Damage</span><b>' + d.dmg + '</b></div><div><span>⚡ Stamina</span><b>' + d.st + '</b></div></div>' +
        '<div class="ability-line">' + d.abilityName + ': ' + d.abilityDesc + '</div>');
      var xb = document.createElement('button'); xb.className = 'slot-x'; xb.textContent = '✕';
      xb.onclick = function (e) { e.stopPropagation(); togglePick(k); };
      slot.appendChild(xb);
    });
    var b = $('bonus'), p = app.picks.length === 2 ? FB.findPair(app.picks[0], app.picks[1]) : null;
    b.classList.toggle('none', !p);
    b.innerHTML = p ? '<div class="b-ico">✨</div><div><div class="b-name">Team Bonus: ' + p.name + '</div><div class="b-desc">' + p.desc + '</div></div>'
      : '<div class="b-ico">🐸</div><div><div class="b-desc">' + (app.picks.length === 2 ? 'No team bonus for this pair. Synergies still come from abilities.' : 'Pick two frogs. Some pairs unlock a Team Bonus.') + '</div></div>';
    $('btn-battle').disabled = app.picks.length !== 2;
  }

  function showScreen(name) {
    app.screen = name;
    $('team').classList.toggle('hidden', name !== 'team');
    $('hud').classList.toggle('hidden', name !== 'battle');
    $('result').classList.toggle('hidden', name !== 'result');
    layout();
  }

  // ---------- старт боя ----------
  function seedFromUrl() { var m = /[?&]seed=(\d+)/.exec(location.search); return m ? +m[1] : (Date.now() % 1e9); }

  function botTeam(rand) {
    var o = FB.FROG_ORDER, pairs = [];
    for (var i = 0; i < o.length; i++) for (var j = i + 1; j < o.length; j++) pairs.push([o[i], o[j]]);
    return pairs[Math.floor(rand() * pairs.length)];
  }

  var lastTeams = null;
  function startBattle(rematch) {
    var seed = seedFromUrl();
    app.rand = AI.makeRand(seed ^ 0x5bd1e995);
    var bt = rematch && lastTeams ? lastTeams[1] : botTeam(app.rand);
    lastTeams = [app.picks.slice(), bt];
    app.s = Sim.createMatch(app.picks, bt, seed);
    log('match', { seed: seed, player: app.picks, bot: bt });
    showScreen('battle');
    beginRound();
  }

  function beginRound() {
    var ev = Sim.startRound(app.s);
    app.shown = Sim.clone(app.s);
    app.disp = {};
    app.s.frogs.forEach(function (f) {
      app.disp[f.id] = { x: f.x, y: f.y, z: 0, facing: f.side === 0 ? 0 : Math.PI, alive: true, inWater: false, flash: 0, wob: 0, squash: 0 };
    });
    app.padVis = {};
    app.s.pads.forEach(function (p) { app.padVis[p.id] = { wear: 0, sub: 0, bob: 0, recovering: false }; });
    app.fx = []; app.queue = []; app.cur = null; app.aim = null;
    app.selected = -1; app.mode = 'move';
    updateHud();
    banner('ROUND ' + app.s.round, 'gold', 1100, app.s.round === 1 ? 'vs ' + NAMES[1] : null);
    log('round', { round: app.s.round, starter: app.s.turnSide });
    app.busy = true;
    setTimeout(function () { app.busy = false; nextTurn(); }, 1250 / app.speed);
  }

  // ---------- ход ----------
  function actable(f) { return app.s && app.s.phase === 'play' && app.s.turnSide === 0 && !app.busy && Sim.canAct(app.s, f); }

  function nextTurn() {
    var s = app.s;
    if (app.screen !== 'battle') return;
    if (s.phase === 'roundOver' || s.phase === 'matchOver') return onRoundOver();
    if (s.turnSide === 1 || app.auto) return botTurn();
    // игрок
    if (s.pendingHop !== null) { app.selected = s.pendingHop; app.mode = 'hop'; }
    else {
      var cur = s.frogs[app.selected];
      if (!cur || !Sim.canAct(s, cur)) {
        var c = s.frogs.filter(function (f) { return Sim.canAct(s, f); });
        app.selected = c.length ? c[0].id : -1;
      }
      app.mode = 'move';
    }
    if (!app.lastBannerSide || app.lastBannerSide !== 'p' || s.pendingHop === null) banner('YOUR TURN', 'p', 700);
    app.lastBannerSide = 'p';
    updateHud();
  }

  function botTurn() {
    var side = app.s.turnSide;
    app.lastBannerSide = side ? 'b' : 'p';
    if (app.s.pendingHop === null) banner(side ? NAMES[1].toUpperCase() + "'S TURN" : 'AUTO TURN', side ? 'b' : 'p', 700);
    updateHud();
    app.busy = true;
    clearTimeout(app.botTimer);
    app.botTimer = setTimeout(function () {
      if (app.screen !== 'battle' || !app.s || app.s.turnSide !== side) return;
      var plan = AI.choose(app.s, app.rand);
      if (!plan) { app.busy = false; return; }
      var f = app.s.frogs[plan.cmd.frog];
      app.selected = f.id;
      // показать прицел бота — читаемость (§14: траектория, landing preview)
      if (plan.cmd.mode !== 'rest') {
        var mode = plan.cmd.mode;
        app.aim = buildAim(f, mode, plan.cmd.dx, plan.cmd.dy, null, 1);
      }
      app.botTimer = setTimeout(function () {
        app.aim = null;
        execute(plan.cmd);
      }, (plan.cmd.mode === 'rest' ? 250 : 800) / app.speed);
    }, 650 / app.speed);
  }

  function execute(cmd) {
    var pre = Sim.clone(app.s);
    var r = Sim.apply(app.s, cmd);
    if (!r.ok) { log('reject', { cmd: cmd, why: r.why }); app.busy = false; return; }
    log('act', { side: pre.turnSide, frog: pre.frogs[cmd.frog].kind, mode: cmd.mode, dx: Math.round(cmd.dx || 0), dy: Math.round(cmd.dy || 0) });
    app.shown = pre;
    app.queue = r.events.slice();
    app.busy = true;
    app.aim = null;
    updateHud();
  }

  function onPlaybackDone() {
    app.shown = Sim.clone(app.s);
    app.s.frogs.forEach(function (f) { var d = app.disp[f.id]; d.x = f.x; d.y = f.y; d.alive = f.alive; d.inWater = f.inWater; d.z = 0; });
    app.busy = false;
    updateHud();
    nextTurn();
  }

  function onRoundOver() {
    var s = app.s, w = s.roundWinner;
    app.busy = true;
    var txt = w === 0 ? 'ROUND WON!' : (w === 1 ? 'ROUND LOST' : 'DRAW');
    banner(txt, w === 0 ? 'gold' : 'b', 1500, s.score[0] + ' : ' + s.score[1]);
    log('roundEnd', { winner: w, score: s.score });
    setTimeout(function () {
      if (app.screen !== 'battle') return;
      if (s.phase === 'matchOver') return showResult();
      beginRound();
    }, 1800 / app.speed);
  }

  function showResult() {
    var s = app.s, win = s.matchWinner === 0;
    $('result').classList.toggle('lose', !win);
    $('res-title').textContent = win ? 'VICTORY!' : 'DEFEAT';
    $('res-score').textContent = s.score[0] + ' : ' + s.score[1];
    $('res-sub').textContent = (win ? 'Your ' : NAMES[1] + "'s ") + 'frogs win the pond.  You: ' +
      s.teams[0].map(function (k) { return FB.FROGS[k].name; }).join(' + ') + '  vs  ' + s.teams[1].map(function (k) { return FB.FROGS[k].name; }).join(' + ');
    log('matchEnd', { winner: s.matchWinner, score: s.score });
    showScreen('result');
  }

  // ---------- проигрывание событий ----------
  function D(id) { return app.disp[id]; }
  function SF(id) { return app.shown.frogs[id]; }
  function ease(u) { return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; }
  function easeOut(u) { return 1 - Math.pow(1 - u, 3); }
  function faceTo(d, from, to) { var dx = to.x - from.x, dy = to.y - from.y; if (Math.abs(dx) + Math.abs(dy) > 1) d.facing = Math.atan2(dx, -dy); }

  function startEvent(e) {
    var sp = app.speed, dur = 0, upd = null, end = null;
    switch (e.t) {
      case 'jump': {
        var d = D(e.id); faceTo(d, e.from, e.to);
        var H = 30 + e.len * 0.22;
        dur = (0.42 + e.len / 1100);
        upd = function (u) { var k = ease(u); d.x = e.from.x + (e.to.x - e.from.x) * k; d.y = e.from.y + (e.to.y - e.from.y) * k; d.z = Math.sin(Math.PI * u) * H; d.squash = u < 0.12 ? -0.1 : 0; };
        end = function () { d.z = 0; d.inWater = e.water; d.squash = 0.22; SF(e.id).x = e.to.x; SF(e.id).y = e.to.y; SF(e.id).inWater = e.water; };
        break;
      }
      case 'dash': {
        var dd = D(e.id); faceTo(dd, e.from, e.to);
        dur = 0.32;
        upd = function (u) { var k = easeOut(u); dd.x = e.from.x + (e.to.x - e.from.x) * k; dd.y = e.from.y + (e.to.y - e.from.y) * k; if (Math.random() < 0.6) addFx({ k: 'drop', x: dd.x, y: dd.y, vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40, life: 0.4 }); };
        end = function () { dd.inWater = e.water; SF(e.id).x = e.to.x; SF(e.id).y = e.to.y; SF(e.id).inWater = e.water; };
        break;
      }
      case 'push': case 'pull': {
        var dp = D(e.id);
        dur = e.t === 'pull' ? 0.28 : 0.26;
        upd = function (u) { var k = easeOut(u); dp.x = e.from.x + (e.to.x - e.from.x) * k; dp.y = e.from.y + (e.to.y - e.from.y) * k; dp.wob = Math.sin(u * 20) * 0.25 * (1 - u); };
        end = function () { dp.wob = 0; dp.inWater = e.water; SF(e.id).x = e.to.x; SF(e.id).y = e.to.y; SF(e.id).inWater = e.water; };
        break;
      }
      case 'impact': {
        for (var i = 0; i < 10; i++) { var a = Math.random() * Math.PI * 2; addFx({ k: 'spark', x: e.x, y: e.y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, life: 0.35 }); }
        app.shake = Math.max(app.shake, 7);
        break;
      }
      case 'hit': {
        var f = SF(e.id);
        f.hp = Math.max(0, f.hp - e.dmg);
        if (e.absorbed) { f.shield = Math.max(0, f.shield - e.absorbed); }
        D(e.id).flash = 1;
        var col = e.src === 'poison' ? '#a8f05a' : (e.src === 'bleed' ? '#ff5050' : (e.src === 'exhaust' ? '#ffb15c' : '#ffffff'));
        if (e.dmg > 0) addFx({ k: 'num', x: D(e.id).x, y: D(e.id).y - 20, text: '-' + e.dmg, color: col, life: 1.0, big: e.src === 'hit' || e.src === 'tongue' });
        if (e.absorbed) addFx({ k: 'num', x: D(e.id).x + 14, y: D(e.id).y - 34, text: 'SHIELD -' + e.absorbed, color: '#a8e6ff', life: 0.9 });
        dur = e.src === 'poison' || e.src === 'bleed' ? 0.35 : 0.14;
        updateHud();
        break;
      }
      case 'death': {
        var dz = D(e.id); dz.alive = false; dz.inWater = true; SF(e.id).alive = false; SF(e.id).inWater = true;
        splash(dz.x, dz.y, true);
        addFx({ k: 'num', x: dz.x, y: dz.y - 30, text: 'KO!', color: '#ffd23f', life: 1.2, big: true });
        app.shake = Math.max(app.shake, 10);
        dur = 0.45;
        updateHud();
        break;
      }
      case 'splash': splash(e.x, e.y, e.big); break;
      case 'padBob': if (app.padVis[e.pad]) app.padVis[e.pad].bob = 0.6 + 0.3 * (e.w || 1); break;
      case 'slam': {
        addFx({ k: 'ring', x: e.x, y: e.y, r0: 10, r1: e.r, life: 0.45, color: '255,215,110' });
        addFx({ k: 'ring', x: e.x, y: e.y, r0: 5, r1: e.r * 0.7, life: 0.35, color: '255,255,255' });
        app.shake = Math.max(app.shake, 12);
        dur = 0.12;
        break;
      }
      case 'cloud': {
        dur = 0.5;
        var fxc = addFx({ k: 'lob', from: e.from, to: { x: e.x, y: e.y }, life: dur, color: '#9be03a', r: 8, h: 70 });
        end = function () { app.shown.clouds = app.s.clouds.map(function (c) { return Object.assign({}, c); }); addFx({ k: 'ring', x: e.x, y: e.y, r0: 6, r1: e.r, life: 0.4, color: '170,240,80' }); };
        break;
      }
      case 'tongue': {
        var dt = D(e.id); faceTo(dt, e.from, e.to); dt.tongueOut = true;
        dur = 0.34;
        var tf = addFx({ k: 'tongue', from: e.from, to: e.to, life: dur + (e.target >= 0 ? 0.28 : 0), id: e.id, hold: e.target >= 0 ? e.target : -1 });
        end = function () { };
        break;
      }
      case 'spin': {
        var ds = D(e.id); dur = 0.4;
        addFx({ k: 'swirl', x: e.x, y: e.y, r: e.r, life: 0.45 });
        upd = function (u) { ds.wob = u * Math.PI * 2; };
        end = function () { ds.wob = 0; };
        break;
      }
      case 'bubble': {
        dur = 0.45;
        addFx({ k: 'lob', from: e.from, to: e.to, life: dur, color: 'bubble', r: 9, h: 40 });
        break;
      }
      case 'status': {
        var sf = SF(e.id), fin = app.s.frogs[e.id];
        sf.poison = fin.poison; sf.bleed = fin.bleed; sf.bleedTurns = fin.bleedTurns; sf.trapped = fin.trapped; sf.shield = fin.shield; sf.shieldTurns = fin.shieldTurns; sf.st = fin.st;
        var lbl = { poison: ['POISON', '#a8f05a'], bleed: ['BLEED' + (e.val > 1 ? ' x' + e.val : ''), '#ff6b6b'], trap: ['TRAPPED', '#bfefff'], shield: ['SHIELD', '#a8e6ff'], drain: ['-1 STAMINA', '#7fd8ff'] }[e.s];
        if (lbl && (e.s !== 'poison' || e.fresh)) addFx({ k: 'num', x: D(e.id).x, y: D(e.id).y + 26, text: lbl[0], color: lbl[1], life: 1.0 });
        dur = 0.08;
        updateHud();
        break;
      }
      case 'label': addFx({ k: 'num', x: D(e.id).x, y: D(e.id).y - 46, text: e.text, color: '#ffe27a', life: 1.1, big: true }); break;
      case 'padSink': {
        app.shown.pads[e.pad].state = 'submerged'; app.shown.pads[e.pad].wear = app.shown.pads[e.pad].cap;
        var p = app.shown.pads[e.pad];
        for (var q = 0; q < 3; q++) addFx({ k: 'ring', x: p.x, y: p.y, r0: p.r * 0.5, r1: p.r * (1.2 + q * 0.2), life: 0.6 + q * 0.15, color: '200,245,255' });
        dur = 0.3;
        break;
      }
      case 'padRise': { var pr = app.shown.pads[e.pad]; pr.state = 'stable'; pr.wear = 0; addFx({ k: 'ring', x: pr.x, y: pr.y, r0: pr.r * 0.6, r1: pr.r * 1.3, life: 0.5, color: '170,240,140' }); dur = 0.15; break; }
      case 'fall': { var dfl = D(e.id); dfl.inWater = true; SF(e.id).inWater = true; addFx({ k: 'num', x: dfl.x, y: dfl.y - 28, text: 'SPLASH!', color: '#9fdcff', life: 0.9 }); dur = 0.2; break; }
      case 'lift': { D(e.id).inWater = false; SF(e.id).inWater = false; break; }
      case 'rest': { addFx({ k: 'num', x: D(e.id).x, y: D(e.id).y - 30, text: app.s.frogs[e.id].inWater ? 'WAIT' : 'REST', color: '#cfe3ef', life: 0.9 }); dur = 0.35; break; }
      case 'pass': { banner('SKIP — TRAPPED', e.side === 0 ? 'p' : 'b', 700); dur = 0.6; break; }
      case 'hopReady': { addFx({ k: 'num', x: D(e.id).x, y: D(e.id).y - 46, text: 'HOP AGAIN!', color: '#9fe0ff', life: 1.0, big: true }); break; }
      case 'turn': { app.shown.turnSide = e.side; break; }
      case 'regen': { var rf = SF(e.id); rf.st = Math.min(rf.maxSt, rf.st + T.staminaRegenOnPad); break; }
      case 'roundEnd': dur = 0.5; break;
      case 'ability': {
        var ab = FB.FROGS[app.s.frogs[e.id].kind].abilityName;
        addFx({ k: 'num', x: D(e.id).x, y: D(e.id).y + 30, text: ab.toUpperCase(), color: '#ffd36a', life: 0.9 });
        var ff = SF(e.id); ff.st = Math.max(0, ff.st - T.abilityStaminaCost);
        updateHud();
        break;
      }
    }
    return { e: e, t: 0, dur: dur / sp, upd: upd, end: end };
  }

  function stepPlayback(dt) {
    var guard = 0;
    while (guard++ < 200) {
      if (!app.cur) {
        if (!app.queue.length) {
          if (app.busy && app.playing) { app.playing = false; onPlaybackDone(); }
          return;
        }
        app.playing = true;
        app.cur = startEvent(app.queue.shift());
        if (app.cur.dur <= 0) { if (app.cur.upd) app.cur.upd(1); if (app.cur.end) app.cur.end(); app.cur = null; continue; }
      }
      var c = app.cur;
      c.t += dt; dt = 0;
      var u = Math.min(1, c.t / c.dur);
      if (c.upd) c.upd(u);
      if (u >= 1) { if (c.end) c.end(); app.cur = null; continue; }
      return;
    }
  }

  // ---------- эффекты ----------
  function addFx(o) { o.t = 0; app.fx.push(o); return o; }
  function splash(x, y, big) {
    var n = big ? 14 : 8;
    for (var i = 0; i < n; i++) { var a = Math.random() * Math.PI * 2, v = 40 + Math.random() * (big ? 110 : 70); addFx({ k: 'drop', x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.3 }); }
    addFx({ k: 'ring', x: x, y: y, r0: 8, r1: big ? 46 : 32, life: 0.6, color: '230,250,255' });
    addFx({ k: 'ring', x: x, y: y, r0: 4, r1: big ? 30 : 20, life: 0.45, color: '230,250,255' });
  }

  function drawFx(c, under) {
    var sc = R.view.s;
    app.fx.forEach(function (f) {
      var u = Math.min(1, f.t / f.life), P;
      if (under !== (f.k === 'ring' || f.k === 'swirl')) return;
      switch (f.k) {
        case 'ring':
          P = R.toScreen(f.x, f.y);
          c.strokeStyle = 'rgba(' + f.color + ',' + (1 - u) * 0.85 + ')'; c.lineWidth = 3 * (1 - u) + 1;
          c.beginPath(); c.arc(P.x, P.y, (f.r0 + (f.r1 - f.r0) * easeOut(u)) * sc, 0, Math.PI * 2); c.stroke(); break;
        case 'drop':
          P = R.toScreen(f.x + f.vx * f.t, f.y + f.vy * f.t);
          c.fillStyle = 'rgba(225,248,255,' + (1 - u) + ')'; c.beginPath(); c.arc(P.x, P.y - Math.sin(Math.PI * u) * 14 * sc, 2.6 * sc, 0, Math.PI * 2); c.fill(); break;
        case 'spark':
          P = R.toScreen(f.x + f.vx * f.t, f.y + f.vy * f.t);
          c.fillStyle = 'rgba(255,240,170,' + (1 - u) + ')'; c.beginPath(); c.arc(P.x, P.y, 3.2 * sc * (1 - u) + 1, 0, Math.PI * 2); c.fill(); break;
        case 'num':
          P = R.toScreen(f.x, f.y);
          c.save(); c.globalAlpha = u < 0.75 ? 1 : (1 - u) / 0.25;
          var size = (f.big ? 24 : 16) * (u < 0.15 ? 0.6 + u / 0.15 * 0.4 : 1);
          c.font = '900 ' + size + 'px Nunito, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.lineWidth = 4.5; c.strokeStyle = 'rgba(12,22,30,0.9)'; c.strokeText(f.text, P.x, P.y - u * 28);
          c.fillStyle = f.color; c.fillText(f.text, P.x, P.y - u * 28); c.restore(); break;
        case 'lob': {
          var x = f.from.x + (f.to.x - f.from.x) * u, y = f.from.y + (f.to.y - f.from.y) * u;
          P = R.toScreen(x, y); var lift = Math.sin(Math.PI * u) * f.h * sc;
          c.fillStyle = 'rgba(0,30,40,0.25)'; c.beginPath(); c.ellipse(P.x, P.y, f.r * sc, f.r * sc * 0.6, 0, 0, Math.PI * 2); c.fill();
          if (f.color === 'bubble') {
            c.fillStyle = 'rgba(170,230,255,0.4)'; c.strokeStyle = '#e6fbff'; c.lineWidth = 2;
            c.beginPath(); c.arc(P.x, P.y - lift, f.r * sc * 1.3, 0, Math.PI * 2); c.fill(); c.stroke();
          } else {
            c.fillStyle = f.color; c.strokeStyle = '#2d4a0d'; c.lineWidth = 2;
            c.beginPath(); c.arc(P.x, P.y - lift, f.r * sc, 0, Math.PI * 2); c.fill(); c.stroke();
          }
          break;
        }
        case 'tongue': {
          var A = R.toScreen(D(f.id).x, D(f.id).y), out = 0.34 / app.speed / f.life;
          var k = u < out ? u / out : 1 - (u - out) / (1 - out);
          var tipW = f.hold >= 0 && u >= out ? R.toScreen(D(f.hold).x, D(f.hold).y) : R.toScreen(f.from.x + (f.to.x - f.from.x) * k, f.from.y + (f.to.y - f.from.y) * k);
          if (f.hold >= 0 && u >= out) k = 1;
          c.strokeStyle = '#a83350'; c.lineWidth = 9 * sc; c.lineCap = 'round';
          c.beginPath(); c.moveTo(A.x, A.y); c.lineTo(tipW.x, tipW.y); c.stroke();
          c.strokeStyle = '#ff8fb3'; c.lineWidth = 6 * sc; c.beginPath(); c.moveTo(A.x, A.y); c.lineTo(tipW.x, tipW.y); c.stroke();
          c.fillStyle = '#ff8fb3'; c.beginPath(); c.arc(tipW.x, tipW.y, 6 * sc, 0, Math.PI * 2); c.fill();
          if (u >= 0.98) D(f.id).tongueOut = false;
          break;
        }
        case 'swirl': {
          P = R.toScreen(f.x, f.y);
          c.strokeStyle = 'rgba(255,210,130,' + (1 - u) + ')'; c.lineWidth = 4;
          for (var s2 = 0; s2 < 3; s2++) { c.beginPath(); c.arc(P.x, P.y, f.r * sc * (0.5 + 0.5 * u), u * 9 + s2 * 2.1, u * 9 + s2 * 2.1 + 1.3); c.stroke(); }
          break;
        }
      }
    });
  }

  // ---------- прицел и превью ----------
  // Прогноз через симуляцию: та же функция, что и ход (D-006)
  function buildAim(f, mode, dx, dy, finger, power) {
    var s = app.s, kind = Sim.aimKind(s, f, mode), range = Sim.rangeFor(s, f, mode);
    var cmd = { frog: f.id, mode: mode, dx: dx, dy: dy };
    var pv = Sim.preview(s, cmd);
    var a = { frog: f.id, mode: mode, kind: kind, range: range, finger: finger, power: power, cmd: cmd, valid: pv.ok, preview: { hits: [], water: false, hitEnemy: false } };
    if (!pv.ok) return a;
    var after = pv.state, me = after.frogs[f.id];
    var len = Math.min(range, Math.hypot(dx, dy)), n = Sim.norm(dx, dy);
    a.target = { x: f.x + n.x * len, y: f.y + n.y * len };
    var ab = FB.FROGS[f.kind].ability;
    var moving = mode === 'move' || mode === 'hop' || (mode === 'ability' && (ab === 'hop' || ab === 'slam'));
    if (moving) { a.end = { x: me.x, y: me.y }; a.markR = f.r; }
    var note = null;
    pv.events.forEach(function (e) {
      if (e.t === 'hit' && after.frogs[e.id].side !== f.side) {
        var ex = a.preview.hits.filter(function (h) { return h.id === e.id; })[0];
        if (ex) ex.dmg += e.dmg; else a.preview.hits.push({ id: e.id, dmg: e.dmg });
      }
      if (e.t === 'hit' && e.id === f.id && e.src === 'exhaust') note = 'NO STAMINA: -' + e.dmg + ' HP';
      if (e.t === 'label') note = e.text;
      if (e.t === 'tongue') { a.end = e.to; a.markR = 8; }
      if (e.t === 'bubble') { a.end = e.to; a.markR = T.bubbleCatch; }
      if (e.t === 'cloud') { a.end = { x: e.x, y: e.y }; a.areaR = e.r; a.areaColor = '170,240,80'; a.markR = 8; }
      if (e.t === 'slam') { a.areaR = e.r; }
    });
    a.preview.hits.forEach(function (h) { h.kill = !after.frogs[h.id].alive; });
    a.preview.hitEnemy = a.preview.hits.length > 0;
    a.preview.water = moving && me.inWater;
    if (mode === 'ability' && ab === 'bubble') {
      var tgt = pv.events.filter(function (e) { return e.t === 'bubble'; })[0];
      if (tgt && tgt.target >= 0) note = tgt.ally ? 'SHIELD ' + T.shieldAmount : 'TRAP!';
    }
    if (mode === 'ability' && ab === 'hop' && !me.inWater) note = note || 'THEN HOP AGAIN';
    a.preview.note = note;
    return a;
  }

  var drag = null;
  function pointerPos(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

  cv.addEventListener('pointerdown', function (e) {
    if (app.screen !== 'battle' || app.busy || app.paused || !app.s || app.s.turnSide !== 0 || app.s.phase !== 'play') return;
    var p = pointerPos(e), w = R.toWorld(p.x, p.y);
    log('tap', { nx: +(p.x / R.view.cw).toFixed(3), ny: +(p.y / R.view.ch).toFixed(3) });
    var hitFrog = null, bd = 1e9;
    app.s.frogs.forEach(function (f) {
      if (!f.alive) return;
      var d = Sim.dist(w.x, w.y, f.x, f.y);
      if (d <= Math.max(f.r * 1.8, 30 / R.view.s) && d < bd) { bd = d; hitFrog = f; }
    });
    var anchor = p;
    if (hitFrog && hitFrog.side === 0 && Sim.canAct(app.s, hitFrog)) {
      if (app.selected !== hitFrog.id) { app.selected = hitFrog.id; if (app.s.pendingHop === null) app.mode = 'move'; updateHud(); }
      anchor = R.toScreen(hitFrog.x, hitFrog.y);
    }
    if (app.selected < 0) return;
    cv.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, anchor: anchor, moved: false };
    e.preventDefault();
  });

  cv.addEventListener('pointermove', function (e) {
    if (!drag || drag.id !== e.pointerId) return;
    var p = pointerPos(e);
    var px = drag.anchor.x - p.x, py = drag.anchor.y - p.y, len = Math.hypot(px, py);
    var maxPull = Math.min(170, R.view.cw * 0.4);
    var power = Math.min(1, len / maxPull);
    var f = app.s.frogs[app.selected];
    if (power < T.minPull) { app.aim = null; drag.power = power; return; }
    drag.moved = true;
    var range = Sim.rangeFor(app.s, f, app.mode), n = Sim.norm(px, py);
    var ws = R.view.s, dx = n.x * power * range, dy = n.y * power * range;
    // палец рисуется в точке экрана; резинка — от жабы
    var F = R.toScreen(f.x, f.y);
    var finger = { x: F.x - n.x * power * maxPull, y: F.y - n.y * power * maxPull };
    app.aim = buildAim(f, app.mode, dx, dy, finger, power);
    drag.power = power;
  });

  function endDrag(e, cancel) {
    if (!drag || drag.id !== e.pointerId) return;
    var aim = app.aim; drag = null; app.aim = null;
    if (cancel || !aim || !aim.valid) return;
    execute(aim.cmd);
  }
  cv.addEventListener('pointerup', function (e) { endDrag(e, false); });
  cv.addEventListener('pointercancel', function (e) { endDrag(e, true); });

  // ---------- кнопки действий ----------
  document.querySelectorAll('.act').forEach(function (b) {
    b.addEventListener('click', function () {
      if (app.busy || !app.s || app.s.turnSide !== 0) return;
      var f = app.s.frogs[app.selected]; if (!f) return;
      var mode = b.dataset.mode;
      if (mode === 'rest') { execute({ frog: f.id, mode: 'rest' }); return; }
      if (mode === 'move') app.mode = app.s.pendingHop !== null ? 'hop' : 'move';
      if (mode === 'ability' && Sim.abilityAvailable(app.s, f)) app.mode = app.mode === 'ability' ? 'move' : 'ability';
      log('mode', app.mode);
      updateHud();
    });
  });

  // ---------- HUD ----------
  function chipsHtml(side) {
    var s = app.shown, h = '<div class="side-head"><div class="avatar">' + (side === 0 ? '🧙' : '🧹') + '</div><div class="pname">' + NAMES[side] + '</div></div><div class="frogs">';
    s.frogs.filter(function (f) { return f.side === side; }).forEach(function (f) {
      var st = '';
      for (var i = 0; i < f.maxSt; i++) st += '<i class="' + (i < f.st ? 'on' : '') + '"></i>';
      var sts = (f.poison > 0 ? '☠️' : '') + (f.bleed > 0 ? '🩸' + (f.bleed > 1 ? f.bleed : '') : '') + (f.shield > 0 ? '🛡️' : '') + (f.trapped > 0 ? '🫧' : '') + (f.alive && f.inWater ? '💦' : '');
      h += '<div class="fchip ' + (f.alive ? '' : 'dead') + '" data-id="' + f.id + '"><canvas width="52" height="52" data-kind="' + f.kind + '"></canvas><div class="bars"><div class="hpbar"><i style="width:' +
        (100 * f.hp / f.maxHp) + '%"></i></div><div class="stp">' + st + '</div><div class="sts">' + sts + '</div></div></div>';
    });
    return h + '</div>';
  }

  var portraitCache = {};
  function chipPortraits(root) {
    root.querySelectorAll('canvas[data-kind]').forEach(function (c) {
      var k = c.dataset.kind;
      if (!portraitCache[k]) portraitCache[k] = portraitCanvas(k, 52, 52);
      c.getContext('2d').drawImage(portraitCache[k], 0, 0);
    });
  }

  function updateHud() {
    if (!app.shown || app.screen !== 'battle') return;
    var s = app.s, sh = app.shown;
    for (var side = 0; side < 2; side++) {
      var el = $('side-' + side);
      el.innerHTML = chipsHtml(side); chipPortraits(el);
      el.classList.toggle('turn', sh.turnSide === side && s.phase === 'play');
    }
    $('round-n').textContent = s.round + '/' + (T.roundsToWin * 2 - 1);
    var sc = '';
    for (var i = 0; i < T.roundsToWin; i++) sc += '<i class="' + (i < s.score[0] ? 'p' : '') + '"></i>';
    sc += '<span style="width:4px"></span>';
    for (i = 0; i < T.roundsToWin; i++) sc += '<i class="' + (i < s.score[1] ? 'b' : '') + '"></i>';
    $('score').innerHTML = sc;

    var myTurn = s.turnSide === 0 && s.phase === 'play' && !app.busy;
    document.querySelector('#hud .bottom').classList.toggle('wait', !myTurn);
    var f = s.frogs[app.selected];
    var bm = $('act-move'), ba = $('act-ability'), br = $('act-rest');
    if (!f || f.side !== 0) f = s.frogs.filter(function (x) { return x.side === 0 && x.alive; })[0];
    if (!f) return;
    var d = FB.FROGS[f.kind], hop = s.pendingHop !== null;
    var water = f.inWater;
    bm.querySelector('.ico').innerHTML = hop ? ICON.hop : (water ? ICON.dash : ICON.jump);
    bm.querySelector('.lbl').textContent = hop ? 'HOP' : (water ? 'DASH' : 'JUMP');
    bm.querySelector('.cost').textContent = !hop && water ? (f.st >= T.dashStaminaCost ? '💧' + T.dashStaminaCost : '❤' + T.dashHpCostNoStamina) : '';
    bm.classList.toggle('on', app.mode === 'move' || app.mode === 'hop');
    ba.querySelector('.ico').innerHTML = ICON[d.ability];
    ba.querySelector('.lbl').textContent = d.abilityName;
    ba.querySelector('.cost').textContent = '💧' + T.abilityStaminaCost;
    ba.disabled = !myTurn || !Sim.abilityAvailable(s, f);
    ba.classList.toggle('on', app.mode === 'ability');
    br.querySelector('.ico').innerHTML = ICON.rest;
    br.querySelector('.lbl').textContent = hop ? 'SKIP' : (water ? 'WAIT' : 'REST');
    br.querySelector('.cost').textContent = !hop && !water && f.st < f.maxSt ? '+💧' + T.restBonusStamina : '';
    bm.disabled = br.disabled = !myTurn;

    var hint = '';
    if (s.phase === 'play' && s.turnSide === 1) hint = NAMES[1] + ' is thinking…';
    else if (myTurn) {
      var where = water ? 'in water' : 'on a lily pad';
      if (hop) hint = 'Hop again: drag back from ' + d.name + ', or SKIP';
      else if (app.mode === 'ability') hint = d.abilityName + ': ' + d.abilityDesc;
      else hint = d.name + ' ' + where + ' — drag back to ' + (water ? 'dash' : 'jump') + '. Tap the other frog to switch.';
      var pad = !water && f.pad >= 0 ? s.pads[f.pad] : null;
      if (pad && pad.wear / pad.cap >= 0.6) hint = '⚠ This lily pad is sinking! ' + hint;
    }
    $('hint').textContent = hint;
  }

  var bannerTimer = null;
  function banner(text, cls, ms, small) {
    var b = $('banner');
    b.className = 'banner ' + (cls || '');
    b.innerHTML = text + (small ? '<small>' + small + '</small>' : '');
    void b.offsetWidth;
    b.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(function () { b.classList.remove('show'); }, (ms || 900) / app.speed);
  }

  // ---------- меню ----------
  function setSpeedLabel() { $('m-speed').textContent = 'Animation speed: x' + app.speed; }
  $('btn-menu').onclick = function () { app.paused = true; $('menu').classList.remove('hidden'); setSpeedLabel(); };
  $('m-resume').onclick = function () { app.paused = false; $('menu').classList.add('hidden'); };
  $('m-speed').onclick = function () { app.speed = app.speed === 1 ? 2 : 1; store.set('speed', app.speed); setSpeedLabel(); };
  $('m-help').onclick = function () { $('help').classList.remove('hidden'); };
  $('m-quit').onclick = function () { app.paused = false; $('menu').classList.add('hidden'); quitToTeam(); };
  $('btn-help').onclick = function () { $('help').classList.remove('hidden'); };
  $('h-close').onclick = function () { $('help').classList.add('hidden'); };
  $('btn-battle').onclick = function () { if (app.picks.length === 2) startBattle(false); };
  $('btn-continue').onclick = function () { quitToTeam(); };
  $('btn-rematch').onclick = function () { startBattle(true); };

  function quitToTeam() {
    clearTimeout(app.botTimer);
    app.s = null; app.shown = null; app.queue = []; app.cur = null; app.busy = false; app.aim = null; app.fx = [];
    showScreen('team'); renderTeam();
  }

  // ---------- раскладка и цикл ----------
  function layout() {
    var top = 0, bot = 0;
    if (app.screen === 'battle') {
      top = document.querySelector('#hud .top').getBoundingClientRect().height + 8;
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
    if (!app.paused) {
      if (app.s && app.screen === 'battle') stepPlayback(dt);
      app.fx.forEach(function (f) { f.t += dt; });
      app.fx = app.fx.filter(function (f) { return f.t < f.life; });
      if (app.disp) for (var id in app.disp) {
        var d = app.disp[id];
        d.flash = Math.max(0, d.flash - dt * 4);
        if (d.squash > 0) d.squash = Math.max(0, d.squash - dt * 1.6);
      }
      app.shake = Math.max(0, app.shake - dt * 40);
      // визуал кувшинок тянется к показанному состоянию
      if (app.shown) app.shown.pads.forEach(function (p) {
        var v = app.padVis[p.id]; if (!v) return;
        var tw = p.state === 'stable' ? p.wear / p.cap : 1, ts = p.state === 'stable' ? 0 : 1;
        v.wear += (tw - v.wear) * Math.min(1, dt * 4);
        v.sub += (ts - v.sub) * Math.min(1, dt * (ts > v.sub ? 3 : 5));
        v.recovering = p.state !== 'stable' && p.subTimer <= T.padRecoveringTurns;
        v.bob = Math.max(0, v.bob - dt * 1.5);
      });
    }
  }
  // Логика идёт и без кадров (вкладка в фоне, скрытая панель): иначе бой «замирает» (D-014)
  setInterval(function () { var n = performance.now(); if (n - lastFrame > 250) { update(n); draw(); } }, 50);
  function loop(now) {
    lastFrame = now;
    update(now);
    draw();
    requestAnimationFrame(loop);
  }
  function draw() {
    var scene = (app.screen === 'battle' || app.screen === 'result') && app.shown ? {
      state: app.shown, disp: app.disp, padVis: app.padVis, t: app.t, aim: app.aim, shake: app.shake,
      selected: app.s && app.s.turnSide === 0 && app.s.phase === 'play' ? app.selected : (app.aim ? app.aim.frog : -1),
      actable: function (f) { return actable(app.s.frogs[f.id]); },
      fxUnder: function (c) { drawFx(c, true); }, fxOver: function (c) { drawFx(c, false); }
    } : { state: null, t: app.t };
    R.frame(scene);
  }

  buildRoster();
  renderTeam();
  showScreen('team');
  requestAnimationFrame(loop);
  window.FBAPP = app; // отладка
  log('boot', { v: FB.VERSION });
})();
