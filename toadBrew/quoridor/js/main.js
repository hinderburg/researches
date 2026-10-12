// Экраны, ввод, ход и проигрывание событий симуляции — Relay Alchemy (ветка Quoridor). Рендер — FB.R3 (Three.js).
(function () {
  var Sim = FB.Sim, AI = FB.AI, T = FB.T, R = FB.R3, AR = FB.ARENA;
  var $ = function (id) { return document.getElementById(id); };
  function log(ev, data) { console.log('[FB] ' + ev, data !== undefined ? JSON.stringify(data) : ''); }
  var store = {
    get: function (k) { try { return JSON.parse(localStorage.getItem('toadbrewQ.' + k)); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem('toadbrewQ.' + k, JSON.stringify(v)); } catch (e) {} }
  };
  var app = FB.app = {
    screen: 'team', picks: store.get('picks3') || ['spring', 'cling', 'bellows'],
    s: null, shown: null, disp: {}, queue: [], cur: null, busy: false, playing: false, speed: 1, paused: false,
    auto: /[?&]auto=1/.test(location.search), sel: -1, aimCmd: null, turnLeft: 0, timerTurn: -1, hudT: 0
  };
  if (!Array.isArray(app.picks) || app.picks.length !== 3 || app.picks.some(function (k) { return !FB.FROGS[k]; }) || app.picks[0] === app.picks[1] || app.picks[1] === app.picks[2] || app.picks[0] === app.picks[2]) app.picks = ['spring', 'cling', 'bellows'];
  var SIDE_C = ['#4aa3ff', '#ff5a4a'];
  var ELC = function (el) { return FB.ELEMENTS[el] ? FB.ELEMENTS[el].color : '#d8c8a8'; };
  var RXC = { 'fire+ice': '#eefaff', 'fire+poison': '#ff6a00', 'fire+lightning': '#ff9800', 'ice+poison': '#46ffb0', 'ice+lightning': '#18d4ff', 'lightning+poison': '#9dff3a' };

  // ---------- портреты ----------
  function pic(kind, el, size) {
    var c = document.createElement('canvas'); c.width = c.height = size;
    var src = R.portrait(kind, el); if (src) c.getContext('2d').drawImage(src, 0, 0, size, size);
    return c;
  }
  function pips(ch, el) { var h = ''; for (var i = 0; i < T.tank; i++) h += '<i class="' + (i < ch ? 'on' : '') + '" style="--c:' + ELC(el) + '"></i>'; return '<span class="pips">' + h + '</span>'; }

  // ---------- TEAM ----------
  function buildRoster() {
    var r = $('roster'); r.innerHTML = '';
    FB.FROG_ORDER.forEach(function (k) {
      var F = FB.FROGS[k], el = document.createElement('button'); el.className = 'card'; el.dataset.kind = k;
      el.appendChild(pic(k, 'orig', 200));
      el.insertAdjacentHTML('beforeend', '<div class="check">✓</div><div class="cname">' + F.name + '</div><div class="cstats">❤ ' + F.hp + ' · 🛡 ' + F.def + '% · 💥 ×' + F.impact + '</div><div class="ctrait">' + F.role + ' — ' + F.tdesc + '</div>');
      el.onclick = function () { togglePick(k); };
      r.appendChild(el);
    });
  }
  function togglePick(k) {
    if (app.picks.indexOf(k) >= 0) return; // всегда ровно 3: тап по четвёртой заменяет самую давнюю
    app.picks = app.picks.slice(1).concat([k]);
    store.set('picks3', app.picks); renderTeam();
  }
  function renderTeam() {
    document.querySelectorAll('.card').forEach(function (el) { el.classList.toggle('sel', app.picks.indexOf(el.dataset.kind) >= 0); });
    $('traits').innerHTML = FB.teamTraits(app.picks).map(function (id) {
      var t = FB.traitById(id);
      return '<div class="trc"><div class="tr-ic">' + t.icon + '</div><div><div class="tr-n">' + t.name + (t.when === 'relay' ? ' <small>on relay</small>' : ' <small>always</small>') + '</div><div class="tr-d">' + t.desc + '</div></div></div>';
    }).join('');
  }

  // ---------- ALCHEMY ----------
  function renderAlchemy() {
    $('reactions').innerHTML = Object.keys(FB.REACTIONS).map(function (key) {
      var Rx = FB.REACTIONS[key], els = key.split('+');
      return '<div class="rx on"><div class="rf">' + els.map(function (e) { return FB.ELEMENTS[e].icon; }).join(' + ') + '</div><div class="rn">' + Rx.name + ' <small>' + Rx.type + '</small></div><div class="rd">' + Rx.desc + '</div></div>';
    }).join('');
  }

  // ---------- навигация ----------
  function showScreen(name) {
    app.screen = name;
    ['team', 'alchemy', 'result'].forEach(function (id) { $(id).classList.toggle('hidden', id !== name); });
    var meta = name === 'team' || name === 'alchemy';
    $('nav').classList.toggle('hidden', !meta); $('topbar').classList.toggle('hidden', !meta);
    $('hud').classList.toggle('hidden', name !== 'battle');
    $('labels').classList.toggle('hidden', name !== 'battle');
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('on', t.dataset.tab === name); });
    if (name === 'team') renderTeam();
    if (name === 'alchemy') renderAlchemy();
    if (meta) { app.shown = null; R.resetFrogs(); R.focus(AR.x0 + AR.w / 2, AR.y0 + AR.h / 2, 1); }
    log('screen', name);
  }
  document.querySelectorAll('.tab').forEach(function (t) { t.onclick = function () { if (!t.disabled) showScreen(t.dataset.tab); }; });
  $('btn-battle').onclick = function () { startBattle(); };
  $('btn-help').onclick = $('m-help').onclick = function () { $('help').classList.remove('hidden'); };
  $('h-close').onclick = function () { $('help').classList.add('hidden'); };
  $('btn-menu').onclick = function () { app.paused = true; $('menu').classList.remove('hidden'); };
  $('m-resume').onclick = function () { app.paused = false; $('menu').classList.add('hidden'); };
  $('m-speed').onclick = function () { app.speed = app.speed === 1 ? 2 : 1; $('m-speed').textContent = 'Animation speed: x' + app.speed; };
  $('m-quit').onclick = function () { app.paused = false; $('menu').classList.add('hidden'); clearTimeout(app.botTimer); app.s = null; showScreen('team'); };
  $('btn-continue').onclick = function () { showScreen('team'); };
  $('btn-rematch').onclick = function () { startBattle(true); };
  $('z-in').onclick = function () { R.zoom(0.8); };
  $('z-out').onclick = function () { R.zoom(1.25); };
  $('z-all').onclick = function () { R.focus(AR.x0 + AR.w / 2, AR.y0 + AR.h / 2, 1); };

  // ---------- бой ----------
  function seedFromUrl() { var m = /[?&]seed=(\d+)/.exec(location.search); return m ? +m[1] : (Date.now() % 1e9); }
  var botRng = Math.random;
  function startBattle() {
    var fixed = /[?&]seed=\d+/.test(location.search), seed = fixed ? seedFromUrl() : Math.floor(Math.random() * 1e9);
    app.lastSeed = seed;
    var rr = seed % 233280; botRng = function () { rr = (rr * 9301 + 49297) % 233280; return rr / 233280; };
    // бот берёт случайные три жабы из четырёх; ?seed= делает выбор повторяемым
    var pick = fixed ? botRng : Math.random, pool = FB.FROG_ORDER.slice(), drop = Math.floor(pick() * 4);
    var botTeam = pool.filter(function (k, i) { return i !== drop; });
    for (var i = botTeam.length - 1; i > 0; i--) { var j = Math.floor(pick() * (i + 1)), x = botTeam[i]; botTeam[i] = botTeam[j]; botTeam[j] = x; }
    app.botTeam = botTeam;
    app.s = Sim.createMatch(app.picks, botTeam, seed);
    var ev = Sim.startMatch(app.s);
    app.shown = Sim.clone(app.s); app.disp = {}; app.queue = []; app.cur = null; app.sel = -1; app.aimCmd = null; app.timerTurn = -1;
    app.s.frogs.forEach(function (f) { app.disp[f.id] = { x: f.x, y: f.y, z: 0, facing: f.side === 0 ? 0 : Math.PI, pose: 'idle', poseT: 0, alive: true, flash: 0, squash: 0 }; });
    R.resetFrogs();
    showScreen('battle');
    R.focus(AR.x0 + AR.w / 2, AR.y0 + AR.h * 0.62, 0.62);
    log('battle', { seed: seed, me: app.picks, bot: botTeam });
    buildCards(); buildTraits(); seqKey = '';
    app.busy = true;
    var go = function () { if (app.s && app.screen === 'battle') { app.queue = ev; app.playing = true; } };
    if (app.auto) setTimeout(go, 400); else showTip(go);
  }

  function showTip(done) {
    var box = $('tip'), fin = false;
    $('tip-t').innerHTML = 'Land on <b>your own frog</b> to jump again — build a relay route. Charge on your base. Paint cells and set off reactions to block the enemy route.';
    box.classList.remove('hidden');
    var bar = box.querySelector('.tip-bar i'); bar.style.transition = 'none'; bar.style.width = '100%';
    requestAnimationFrame(function () { bar.style.transition = 'width ' + T.tipSec + 's linear'; bar.style.width = '0%'; });
    function close() { if (fin) return; fin = true; clearTimeout(app.tipT); box.classList.add('hidden'); box.onclick = null; done(); }
    box.onclick = close; app.tipT = setTimeout(close, T.tipSec * 1000);
  }

  function myTurn() { return app.s && app.s.phase === 'play' && app.s.turnSide === 0 && !app.auto; }
  function canAimNow() { return myTurn() && !app.busy && !app.paused && !app.playing; }
  function mineSel() { var f = app.s && app.s.frogs[app.sel]; return f && f.side === 0 ? f : null; }

  function nextTurn() {
    var s = app.s;
    if (!s || app.screen !== 'battle') return;
    if (s.phase !== 'play') return onMatchOver();
    if (app.timerTurn !== s.turn) { app.timerTurn = s.turn; app.turnLeft = T.turnTimeSec; } // таймер — один на ход (D-110); отзыв его не сбрасывает
    if (s.turnSide === 0 && !app.auto) {
      var c = myActable();
      if (!s.pending && !mineSel()) app.sel = c.length ? c[0].id : -1;
      refreshHud(true);
    } else botTurn();
  }

  function botTurn() {
    var s = app.s, side = s.turnSide;
    app.busy = true; refreshHud(true);
    app.botTimer = setTimeout(function () {
      if (app.screen !== 'battle' || app.s !== s || s.phase !== 'play') return;
      if (app.paused) return botTurn();
      var cmd = AI.choose(s, side, botRng);
      var f = cmd.frog !== undefined ? s.frogs[cmd.frog] : null;
      var visible = f && (side === 0 || !Sim.hiddenFrom(s, 0, f));
      if (visible && cmd.dx !== undefined) { app.sel = cmd.frog; R.focus(f.x, f.y); showAim(f, cmd); }
      app.botTimer = setTimeout(function () { R.setAim(null); execute(cmd); }, (visible && cmd.dx !== undefined ? 800 : 300) / app.speed);
    }, (s.pending ? 200 : 450) / app.speed);
  }

  function execute(cmd) {
    app.dmgPop = {};
    var res = Sim.apply(app.s, cmd);
    log('cmd', { cmd: { frog: cmd.frog, mode: cmd.mode || 'jump', dx: cmd.dx && Math.round(cmd.dx), dy: cmd.dy && Math.round(cmd.dy) }, ok: res.ok, why: res.why });
    app.aimCmd = null; R.setAim(null); notice(null);
    if (!res.ok) { app.busy = false; if (app.s.turnSide === 1 || app.auto) execute(app.s.pending ? { frog: app.s.pending.frog, mode: 'end' } : { mode: 'skip' }); return; }
    app.busy = true; app.playing = true;
    app.queue = app.queue.concat(res.events);
  }

  function onPlaybackDone() {
    app.playing = false;
    var s = app.s;
    app.shown = Sim.clone(s);
    var P = s.pending;
    s.frogs.forEach(function (f) {
      var d = app.disp[f.id]; d.x = f.x; d.y = f.y; d.alive = true;
      var perched = P && P.frog === f.id, under = P && P.onAlly === f.id;
      d.hop = null; d.landAt = null;
      if (perched) { d.z = T.perchH; d.pose = 'perch'; }
      else { d.z = 0; d.pitch = 0; d.stretch = 0; if (d.pose === 'air' || d.pose === 'fall' || d.pose === 'perch') d.pose = 'land'; }
      if (under) { d.pose = 'squash'; d.dark = 1; } else { if (d.pose === 'squash') d.pose = 'idle'; d.dark = 0; }
    });
    app.busy = false;
    if (s.phase !== 'play') return onMatchOver();
    if (P) {
      var pf = s.frogs[P.frog];
      if (pf.side === 0 && !app.auto) { app.sel = pf.id; refreshHud(true); }
      else botTurn();
      return;
    }
    nextTurn();
  }

  function onMatchOver() {
    if (app.overShown) return;
    app.overShown = true;
    var w = app.s.winner;
    banner(w === 0 ? 'VICTORY!' : w === 1 ? 'DEFEAT' : 'DRAW', w === 0 ? 'gold' : 'b', app.s.why === 'flask' ? (w === 0 ? 'You reached the enemy flask' : 'The enemy reached your flask') : 'Turn limit');
    log('over', { winner: w, why: app.s.why, turn: app.s.turn });
    setTimeout(function () { app.overShown = false; if (app.screen === 'battle') showResult(); }, 2200);
  }
  function showResult() {
    var s = app.s, w = s.winner;
    $('res-title').textContent = w === 0 ? 'VICTORY' : w === 1 ? 'DEFEAT' : 'DRAW';
    $('result').classList.toggle('lose', w !== 0);
    [0, 1].forEach(function (side) {
      var box = $('res-' + side); box.innerHTML = '';
      s.frogs.filter(function (f) { return f.side === side; }).forEach(function (f) {
        var d = document.createElement('div');
        d.appendChild(pic(f.kind, f.empty ? '' : f.el, 120));
        d.insertAdjacentHTML('beforeend', FB.FROGS[f.kind].name);
        box.appendChild(d);
      });
    });
    $('res-sub').textContent = s.why === 'flask' ? (w === 0 ? 'Your frog landed on the enemy Base Flask on turn ' : 'An enemy frog landed on your Base Flask on turn ') + s.turn + '.' : 'Turn limit: the side closer to the enemy flask wins.';
    showScreen('result');
  }

  // ---------- проигрывание событий ----------
  function D(id) { return app.disp[id]; }
  function SF(id) { return app.shown.frogs[id]; }
  function easeOut(u) { return 1 - Math.pow(1 - u, 3); }
  function faceDir(d, dx, dy) { if (Math.abs(dx) + Math.abs(dy) > 0.5) d.facing = Math.atan2(dx, -dy); }
  function setPose(d, p) { d.pose = p; d.poseT = 0; }
  function cam() { return R.cam; }

  function startEvent(e) {
    var d = e.id !== undefined && app.disp[e.id] ? D(e.id) : null, upd = null, end = null, dur = 0;
    switch (e.t) {
      case 'act': if (!d.hidden) R.focus(d.x, d.y); app.sel = e.id; dur = 0.12; break;
      case 'jump': {
        app.s.frogs.forEach(function (o) { var A = D(o.id); if (A.dark) { A.dark = 0; if (A.pose === 'squash') setPose(A, 'idle'); } }); // спрыгнула со спины — нижняя распрямляется
        var segs = e.segs, durs = segs.map(function (sg) { return 0.3 + sg.len / 1250; }), tot = durs.reduce(function (a, b) { return a + b; }, 0);
        var pre = 0.12, last = -1; dur = pre + tot;
        upd = function (u) {
          var t = u * dur;
          if (t < pre) { d.pose = 'aim'; d.squash = -0.12 * t / pre; return; }
          t -= pre; var i = 0; while (i < segs.length - 1 && t > durs[i]) { t -= durs[i]; i++; }
          var sg = segs[i], q = Math.min(1, t / durs[i]), k = q + 0.32 * Math.sin(2 * Math.PI * q) / (2 * Math.PI);
          if (i !== last) { if (last >= 0 && segs[last].hit) R.shake(6); faceDir(d, sg.to.x - sg.from.x, sg.to.y - sg.from.y); last = i; }
          d.x = sg.from.x + (sg.to.x - sg.from.x) * k; d.y = sg.from.y + (sg.to.y - sg.from.y) * k;
          d.z = Sim.arcAt(sg.h0, sg.H, k);
          var slope = (-sg.h0 + 4 * sg.H * (1 - 2 * k)) / Math.max(40, sg.len) * T.visH;
          d.pitch = Math.max(-0.65, Math.min(0.65, Math.atan(slope) * 0.75));
          d.stretch = Math.min(0.28, 0.1 + 0.12 * Math.abs(slope));
          d.squash = 0;
          d.pose = i === segs.length - 1 && k > 0.55 ? 'fall' : 'air';
          if (!d.hidden && !cam().user) R.focus(d.x, d.y);
        };
        break;
      }
      case 'smash': { var sp = Sim.cellCenter(e.i); R.reactionFx('ice+poison', sp.x, sp.y, 90); R.text(sp.x, sp.y, '⛏ BREACH', 'gold'); R.shake(8); dur = 0.12; break; }
      case 'land': {
        var z1 = d.z, onTop = e.onEnemy !== undefined || e.perch, zTop = onTop ? T.perchH : 0;
        if (e.onEnemy !== undefined) { d.x = D(e.onEnemy).x; d.y = D(e.onEnemy).y; } else { d.x = e.x; d.y = e.y; }
        dur = 0.08;
        upd = function (u) { d.z = zTop + (z1 - zTop) * (1 - u); };
        end = function () {
          d.z = zTop; d.pitch = 0; d.stretch = 0; setPose(d, e.perch ? 'perch' : 'land');
          if (e.perch) { var A = D(e.onAlly); A.pose = 'squash'; A.poseT = 0; A.dark = 1; }
          if (e.onEnemy !== undefined) d.landAt = { x: e.x, y: e.y };
          d.squash = 0.28; R.shake(4); SF(e.id).x = e.x; SF(e.id).y = e.y;
        };
        break;
      }
      case 'relay': R.text(d.x, d.y, 'RELAY ' + e.n + (e.trait ? '<br><small>' + FB.traitById(e.trait).icon + ' ' + FB.traitById(e.trait).name + '</small>' : ''), 'charge'); R.ring(d.x, d.y, 70, SIDE_C[SF(e.id).side]); dur = 0.3; break;
      case 'impact': {
        var atk = D(e.by);
        if (atk.landAt) atk.hop = { t: 0, dur: 0.42, z0: atk.z, from: { x: atk.x, y: atk.y }, to: atk.landAt };
        atk.landAt = null;
        D(e.id).flash = 1; R.flash(e.x, e.y, 120, '#fff0c0'); R.shake(12); // без брызг краски: краска — только в клетках (D-120)
        if (e.mom) R.text(e.x, e.y - 40, '☄️ ×' + e.mom.toFixed(2), 'gold');
        dur = 0.12; break;
      }
      case 'hit': {
        var hf = SF(e.id); hf.hp = Math.max(0, hf.hp - e.dmg); d.flash = 1;
        var cls = { slam: 'slam', toxic: 'poison', ward: 'light', plasma: 'fire', det: 'fire' }[e.src] || 'dmg';
        if (!d.hidden) {
          var dp = (app.dmgPop = app.dmgPop || {})[e.id];
          if (dp && dp.fx.t < dp.fx.life - 0.05) { dp.total += e.dmg; dp.fx.el.innerHTML = '−' + dp.total; dp.fx.el.className = 'ftext dmg big'; dp.fx.t = Math.min(dp.fx.t, 0.15); dp.fx.x = d.x; dp.fx.y = d.y; }
          else app.dmgPop[e.id] = { fx: R.text(d.x, d.y, '−' + e.dmg, cls), total: e.dmg };
        }
        dur = 0.06; break;
      }
      case 'push': {
        var f0 = e.from, t0 = e.to; dur = e.soft ? 0.22 : 0.32;
        var pd = Math.hypot(t0.x - f0.x, t0.y - f0.y), hop = Math.min(18, 4 + pd * 0.12);
        upd = function (u) { var k = easeOut(u); d.x = f0.x + (t0.x - f0.x) * k; d.y = f0.y + (t0.y - f0.y) * k; d.z = Math.sin(Math.PI * u) * hop; };
        if (!e.soft) { d.hitT = T.hitAnimSec; d.hitPow = Math.min(1, 0.45 + pd / 120); } // отброс виден по самой жабе (D-108)
        end = function () { d.z = 0; SF(e.id).x = t0.x; SF(e.id).y = t0.y; if (e.wall) { R.shake(10); R.text(t0.x, t0.y, 'SLAM!', 'slam'); } };
        break;
      }
      case 'anchored': d.hitT = T.hitAnimSec * 0.6; d.hitPow = 0.5; R.text(d.x, d.y, e.why === 'ward' ? 'ϟ WARD HOLDS' : '⚓ ANCHORED', 'gold'); dur = 0.2; break;
      case 'death': R.flash(e.x, e.y, 160, '#ffffff'); R.text(e.x, e.y, 'KO!', 'ko'); R.shake(14); d.flash = 1; dur = 0.5; break;
      case 'home': { // домой: смерть — исчезает и появляется на базе; отзыв и авто-возврат — улетает дугой
        var hf2 = SF(e.id), from = e.from, to = e.to, far = Math.hypot(to.x - from.x, to.y - from.y);
        hf2.ch = 0; hf2.el = null; hf2.empty = false; hf2.ret = 0; if (e.why === 'death') hf2.hp = hf2.maxHp;
        if (e.why === 'death') { d.x = to.x; d.y = to.y; d.z = 0; hf2.x = to.x; hf2.y = to.y; R.ring(to.x, to.y, 80, SIDE_C[hf2.side]); dur = 0.25; break; }
        dur = 0.45 + far / 2600; R.text(from.x, from.y, e.why === 'recall' ? '⟲ RECALL' : '⟲ HOME', 'gold');
        upd = function (u) { var k = u * u * (3 - 2 * u); d.x = from.x + (to.x - from.x) * k; d.y = from.y + (to.y - from.y) * k; d.z = Math.sin(Math.PI * u) * Math.min(160, 40 + far * 0.08); d.pose = 'air'; faceDir(d, to.x - from.x, to.y - from.y); };
        end = function () { d.z = 0; setPose(d, 'land'); hf2.x = to.x; hf2.y = to.y; R.ring(to.x, to.y, 70, SIDE_C[hf2.side]); };
        break;
      }
      case 'recall': dur = 0.05; break;
      case 'cell': { var cl = app.shown.cells[e.i]; cl.el = e.el; cl.t = e.tt; cl.side = e.side; var cp = Sim.cellCenter(e.i); if (e.el || e.tt) R.ring(cp.x, cp.y, 60, e.tt ? FB.TERRAIN[e.tt].color : ELC(e.el), 0.4); dur = 0.04; break; }
      case 'reaction':
        R.reactionFx(e.key, e.x, e.y, { 'fire+lightning': T.cell * (e.amp ? 2.5 : 1.5), 'fire+poison': T.detR, 'lightning+poison': T.cell * 1.4, 'fire+ice': T.cell * 1.4, 'ice+poison': T.cell * 0.8, 'ice+lightning': T.cell }[e.key] || 150);
        R.text(e.x, e.y, e.name + (e.amp ? '<br><small>🌀 ×' + T.ampMul + '</small>' : ''), 'rx'); R.shake(8); dur = 0.5; break;
      case 'wardZap': { var wp = Sim.cellCenter(e.i); R.reactionFx('ice+lightning', wp.x, wp.y, 90); R.zap({ x: wp.x - 50, y: wp.y }, { x: wp.x + 50, y: wp.y }); R.text(d.x, d.y, 'ϟ WARD!', 'light'); dur = 0.25; break; }
      case 'toxic': R.text(d.x, d.y, '☣ TOXIC', 'poison'); dur = 0.15; break;
      case 'spend': SF(e.id).ch = e.ch; break;
      case 'empty': SF(e.id).empty = true; SF(e.id).ret = e.ret; R.text(d.x, d.y, 'EMPTY', 'dmg'); dur = 0.2; break;
      case 'ret': SF(e.id).ret = e.ret; break;
      case 'tick': { var tf = SF(e.id); tf.ch = e.ch; tf.el = e.el; tf.empty = false; if (e.fresh) { R.ring(d.x, d.y, 60, ELC(e.el)); if (!d.hidden && tf.side === 0) R.text(d.x, d.y, FB.ELEMENTS[e.el].icon + ' NEW TANK', 'charge'); } dur = e.fresh ? 0.12 : 0.03; break; }
      case 'flask': { var fk = AR.flasks[1 - e.side]; R.reactionFx('fire+poison', fk.x, fk.y, 220); R.text(fk.x, fk.y, 'FLASK!', 'ko'); R.shake(20); dur = 0.9; break; }
      case 'turn': app.shown.turnSide = e.side; app.shown.turn = e.turn; app.shown.recalls = 0; banner(e.side === 0 ? 'YOUR TURN' : 'ENEMY TURN', e.side === 0 ? 'p' : 'b', 'Turn ' + e.turn); dur = 0.55; break;
      case 'label': if (d) R.text(d.x, d.y, e.text, 'gold'); dur = 0.25; break;
      case 'skip': if (d) R.text(d.x, d.y, 'PASS', 'dmg'); dur = 0.25; break;
      case 'over': dur = 0.3; break;
    }
    return dur > 0 ? { e: e, t: 0, dur: dur, upd: upd, end: end } : (end && end(), null);
  }

  function stepPlayback(dt) {
    var guard = 0;
    while (guard++ < 60) {
      if (app.cur) {
        var c = app.cur; c.t += dt; dt = 0;
        var u = Math.min(1, c.t / c.dur); if (c.upd) c.upd(u);
        if (u < 1) return;
        if (c.end) c.end(); app.cur = null;
      }
      if (!app.queue.length) { if (app.playing) onPlaybackDone(); return; }
      app.cur = startEvent(app.queue.shift());
    }
  }

  // ---------- скрытность (Steam) с точки зрения игрока ----------
  function hiddenNow(f) {
    if (f.side === 0 || !app.shown || app.auto) return false;
    var d = D(f.id), cl = app.shown.cells[Sim.cellIdx(d.x, d.y)];
    if (!cl || cl.t !== 'steam' || cl.side !== f.side) return false;
    return !app.shown.frogs.some(function (o) { return o.side === 0 && Math.hypot(D(o.id).x - d.x, D(o.id).y - d.y) <= T.steamSight; });
  }

  // ---------- прицел и превью (§19: всё видно по траектории) ----------
  function showAim(f, cmd) {
    var pv = Sim.preview(app.s, cmd, f.side === 0 ? 0 : undefined), a = { segs: [], r: f.r, color: ELC(f.el), labels: [], pushes: [], cells: [] };
    var dmg = {}, deaths = {}, info = { title: (f.el ? FB.ELEMENTS[f.el].icon + ' ' : '') + FB.FROGS[f.kind].name, lines: [] }, reacted = null, relayTo = -1, won = false, zap = false, painted = [];
    var start = {}; app.s.frogs.forEach(function (x) { start[x.id] = { x: x.x, y: x.y }; });
    pv.events.forEach(function (e) {
      if (e.t === 'jump') a.segs = a.segs.concat(e.segs);
      if (e.t === 'land' && e.id === f.id) a.land = { x: e.x, y: e.y };
      if (e.t === 'hit') dmg[e.id] = (dmg[e.id] || 0) + e.dmg;
      if (e.t === 'death') deaths[e.id] = true;
      if (e.t === 'push' && !e.soft) a.pushes.push(e);
      if (e.t === 'relay') relayTo = e.ally;
      if (e.t === 'reaction') reacted = e;
      if (e.t === 'cell') painted.push(e);
      if (e.t === 'flask') won = true;
      if (e.t === 'wardZap') zap = true;
      if (e.t === 'anchored') info.lines.push(e.why === 'ward' ? 'Ward holds it in place' : 'Anchored — no knockback');
      if (e.t === 'smash') info.lines.push('Breach: smashes the column');
    });
    if (!a.land && a.segs.length) { var ls = a.segs[a.segs.length - 1]; a.land = ls.to; }
    if (!a.land) return;
    var fin = pv.state.frogs[f.id];
    if (relayTo >= 0) { // эстафета: кольцо вокруг своей жабы и плашка
      var ap = start[relayTo];
      a.ally = { x: ap.x, y: ap.y, r: app.s.frogs[relayTo].r, color: '#7fd0ff' };
      a.color = '#7fd0ff';
      a.labels.push({ x: ap.x, y: ap.y, text: 'RELAY → jump again', cls: 'charge', h: 90 });
      info.title = '↗ RELAY'; info.lines.unshift('Same activation: jump again from ' + FB.FROGS[app.s.frogs[relayTo].kind].name);
      if (f.side === 0) notice('↗ RELAY', 'Land on <b>' + FB.FROGS[app.s.frogs[relayTo].kind].name + '</b> → jump again', 'One charge for the whole chain · each ally once', a.color);
    } else {
      notice(null);
      var ci = Sim.cellIdx(fin.x, fin.y);
      if (won) { a.color = '#ffd040'; a.labels.push({ x: a.land.x, y: a.land.y, text: '★ FLASK — WIN!', cls: 'rx', h: 80 }); info.title = '★ VICTORY'; info.lines.unshift('Lands on the enemy Base Flask'); }
      else if (zap) { a.color = '#7ad8ff'; a.labels.push({ x: a.land.x, y: a.land.y, text: 'ϟ WARD — thrown back', cls: 'light', h: 70 }); info.lines.unshift('Enemy Static Ward: zapped and thrown back, no paint'); }
      else if (reacted) {
        a.color = RXC[reacted.key] || '#ffe080';
        a.labels.push({ x: a.land.x, y: a.land.y, text: reacted.name, cls: 'rx', h: 70 });
        info.title = reacted.name; info.lines.unshift(FB.REACTIONS[reacted.key].desc);
        painted.forEach(function (c) { a.cells.push({ i: c.i, color: c.tt ? FB.TERRAIN[c.tt].color : (c.el ? ELC(c.el) : '#ffffff'), op: 0.3 }); });
        if (reacted.key === 'fire+lightning') FB.Sim.cellCenter && a.cells.push({ i: reacted.i, color: a.color, op: 0.35 });
        if (reacted.key === 'fire+poison') a.blastR = T.detR;
      } else if (Sim.cellBase(ci) >= 0) info.lines.push('Base cell: never painted');
      else {
        painted.forEach(function (c) { a.cells.push({ i: c.i, color: ELC(c.el), op: 0.28 }); });
        var cl = app.s.cells[ci];
        if (cl.el === f.el) info.lines.push('Same element: no reaction');
        else if (cl.t) info.lines.push(FB.TERRAIN[cl.t].name + ' replaced by ' + FB.ELEMENTS[f.el].name);
        else if (painted.length) info.lines.push('Paints the cell ' + FB.ELEMENTS[f.el].icon);
      }
      if (!a.cells.length && !won) a.cells.push({ i: ci, color: a.color, op: 0.14 });
      var left = fin.ch;
      if (!won) info.lines.push(left > 0 || Sim.onBase(fin) ? 'Charges left: ' + left : 'Will be EMPTY — home in ' + T.emptyReturn + ' turns');
    }
    if (pv.pending && pv.pending.frog === f.id) { // бледным — куда отскочит сама, если ход кончится
      var ac = Sim.clone(pv.state), ar = Sim.apply(ac, { frog: f.id, mode: 'end' }, { noEnd: true });
      ar.events.forEach(function (e) { if (e.t === 'jump') a.autoSegs = e.segs; });
    }
    Object.keys(dmg).forEach(function (id) {
      var p = start[id]; a.labels.push({ x: p.x, y: p.y, text: (deaths[id] ? 'KO ' : '') + '−' + dmg[id], cls: +id === f.id ? 'self' : 'dmg' });
    });
    var tot = Object.keys(dmg).filter(function (id) { return app.s.frogs[id].side !== f.side; }).reduce(function (s, id) { return s + dmg[id]; }, 0);
    if (tot) info.lines.unshift('Damage ' + tot + (Object.keys(deaths).length ? ' · KO → home' : ''));
    R.setAim(a);
    if (f.side === 0) setPv(info.title, info.lines.join(' · ') || 'Release to jump');
  }
  function notice(title, main, sub, color) {
    var n = $('notice'); if (!n) return;
    if (!title) { n.classList.add('hidden'); return; }
    n.style.setProperty('--c', color || '#ffe080');
    n.innerHTML = '<div class="n-t">' + title + '</div><div class="n-m">' + main + '</div><div class="n-s">' + sub + '</div>';
    n.classList.remove('hidden');
  }
  function setPv(t, d) { $('pvcard').innerHTML = '<div class="pv-t">' + t + '</div><div class="pv-d">' + d + '</div>'; }

  // ---------- ввод ----------
  var cv = $('gl'), pts = {}, mode = null, aimFrog = -1, pinch = null, downAt = null;
  function frogAt(sx, sy, list) {
    var best = -1, bd = 1e9;
    list.forEach(function (f) {
      var d = D(f.id), p = R.toScreen(d.x, (d.z || 0) * T.visH, d.y), q = R.toScreen(d.x + f.r, (d.z || 0) * T.visH, d.y);
      var rad = Math.max(34, Math.abs(q.x - p.x) * 1.5), dd = Math.hypot(p.x - sx, p.y - sy);
      if (dd < rad && dd < bd) { bd = dd; best = f.id; }
    });
    return best;
  }
  function myActable() { var s = app.s; return s ? s.frogs.filter(function (f) { return f.side === 0 && Sim.canAct(s, f); }) : []; }
  function myFrogs() { var s = app.s; return s ? s.frogs.filter(function (f) { return f.side === 0; }) : []; }
  function local(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  cv.addEventListener('pointerdown', function (e) {
    if (app.screen !== 'battle') return;
    try { cv.setPointerCapture(e.pointerId); } catch (err) {}
    var p = local(e); pts[e.pointerId] = p;
    var ids = Object.keys(pts);
    if (ids.length === 2) { mode = 'pinch'; cancelAim(); var a = pts[ids[0]], b = pts[ids[1]]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; return; }
    downAt = { x: p.x, y: p.y, t: performance.now() };
    if (canAimNow()) {
      var id = frogAt(p.x, p.y, myActable());
      if (id >= 0) { mode = 'aim'; aimFrog = id; app.sel = id; D(id).pose = 'aim'; refreshHud(true); log('aim.start', { frog: id }); return; }
    }
    mode = 'pan';
  });
  cv.addEventListener('pointermove', function (e) {
    if (!pts[e.pointerId]) return;
    var p = local(e), prev = pts[e.pointerId]; pts[e.pointerId] = p;
    if (mode === 'pan') R.pan(p.x - prev.x, p.y - prev.y);
    else if (mode === 'pinch') {
      var ids = Object.keys(pts); if (ids.length < 2) return;
      var a = pts[ids[0]], b = pts[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      if (d > 10) R.zoom(pinch.d / d, mx, my);
      R.pan(mx - pinch.mx, my - pinch.my);
      pinch.d = d; pinch.mx = mx; pinch.my = my;
    } else if (mode === 'aim') updateAim(p);
  });
  function endPointer(e) {
    if (!pts[e.pointerId]) return;
    var p = pts[e.pointerId]; delete pts[e.pointerId];
    if (mode === 'aim') {
      var cmd = app.aimCmd; mode = null;
      D(aimFrog).pose = restPose(aimFrog);
      if (cmd && canAimNow()) { log('aim.release', { frog: aimFrog }); execute(cmd); }
      else cancelAim();
      return;
    }
    if (mode === 'pan' && downAt && Math.hypot(p.x - downAt.x, p.y - downAt.y) < 8 && canAimNow() && !app.s.pending) {
      var id = frogAt(p.x, p.y, myFrogs()); if (id >= 0) { app.sel = id; refreshHud(true); }
    }
    if (!Object.keys(pts).length) mode = null; else if (mode === 'pinch') mode = 'pan';
  }
  cv.addEventListener('pointerup', endPointer); cv.addEventListener('pointercancel', endPointer);
  cv.addEventListener('wheel', function (e) { e.preventDefault(); var p = local(e); R.zoom(e.deltaY > 0 ? 1.12 : 0.89, p.x, p.y); }, { passive: false });

  function updateAim(p) {
    var f = app.s.frogs[aimFrog], d = D(f.id), sp = R.toScreen(d.x, (d.z || 0) * T.visH, d.y);
    var L = Math.hypot(p.x - sp.x, p.y - sp.y), pull = Math.min(cv.clientWidth, cv.clientHeight) * 0.3, pow = Math.min(1, L / pull);
    var w = R.toWorld(p.x, p.y, (d.z || 0) * T.visH);
    if (!w || pow < T.minPull) { app.aimCmd = null; R.setAim(null); notice(null); setPv('Pull back', 'Drag away from the frog and release'); return; }
    var dx = f.x - w.x, dy = f.y - w.y, l = Math.hypot(dx, dy) || 1, range = T.jumpR;
    app.aimCmd = { frog: f.id, dx: dx / l * range * pow, dy: dy / l * range * pow, mode: 'jump' };
    // доводка: на жабу (эстафета/удар) или на центр фляги врага, если прицел рядом
    var tx = f.x + app.aimCmd.dx, ty = f.y + app.aimCmd.dy, snap = null, sd = 1e9, act = app.s.act;
    app.s.frogs.forEach(function (o) {
      if (!o.alive || o.id === f.id || (o.side !== 0 && Sim.hiddenFrom(app.s, 0, o)) || (o.side === 0 && act && act.used[o.id])) return;
      var dd = Math.hypot(o.x - tx, o.y - ty), lim = o.r + f.r * 0.6 + 26;
      if (dd < lim && dd < sd && Math.hypot(o.x - f.x, o.y - f.y) <= range) { sd = dd; snap = o; }
    });
    var fk = AR.flasks[1];
    if (!snap && Math.hypot(fk.x - tx, fk.y - ty) < T.flaskR + 20 && Math.hypot(fk.x - f.x, fk.y - f.y) <= range) snap = fk;
    if (snap) { app.aimCmd.dx = snap.x - f.x; app.aimCmd.dy = snap.y - f.y; }
    showAim(f, app.aimCmd);
  }
  function restPose(id) { var P = app.s && app.s.pending; return P && P.frog === id ? 'perch' : 'idle'; }
  function cancelAim() { app.aimCmd = null; R.setAim(null); notice(null); if (aimFrog >= 0 && D(aimFrog)) D(aimFrog).pose = restPose(aimFrog); aimFrog = -1; refreshHud(true); }

  $('btn-skip').onclick = function () {
    if (!canAimNow()) return;
    var P = app.s.pending;
    if (P) return execute({ frog: P.frog, mode: 'end' });
    execute({ mode: 'skip' });
  };
  $('btn-recall').onclick = function () {
    var f = mineSel();
    if (!canAimNow() || !f || !Sim.canRecall(app.s, f)) return;
    execute({ frog: f.id, mode: 'recall' });
  };

  // ---------- HUD ----------
  function banner(txt, cls, sub) {
    var b = $('banner'); b.className = 'banner show ' + (cls || ''); b.innerHTML = txt + (sub ? '<small>' + sub + '</small>' : '');
    clearTimeout(app.bannerT); app.bannerT = setTimeout(function () { b.className = 'banner'; }, 1100);
  }
  function buildTraits() {
    [0, 1].forEach(function (side) {
      var el = $('traits-' + side); el.innerHTML = '';
      app.s.traits[side].forEach(function (id) {
        var t = FB.traitById(id), b = document.createElement('button'); b.className = 'tb';
        b.innerHTML = '<span class="ti">' + t.icon + '</span><b>' + t.name + '</b>';
        b.onclick = function () { banner(t.icon + ' ' + t.name, side === 0 ? 'p' : 'b', t.desc); };
        el.appendChild(b);
      });
    });
  }
  // Общая последовательность (§15, §32): окно вокруг указателей обеих сторон; ▶ — твой следующий элемент, ◀ — врага
  var seqKey = '';
  function renderSeq() {
    var s = app.shown; if (!s) return;
    var a = s.ptr[0], b = s.ptr[1], lo = Math.max(0, Math.min(a, b) - 1), hi = Math.max(a, b) + 4;
    if (hi - lo > 11) hi = lo + 11;
    var key = a + ':' + b; if (key === seqKey) return; seqKey = key;
    var h = '<div class="sq-h">NEXT</div>';
    for (var i = lo; i <= hi; i++) {
      var e = s.seq[i % s.seq.length], past = i < Math.min(a, b);
      h += '<div class="sq' + (past ? ' past' : '') + '"><span class="mk me">' + (i === a ? '▶' : '') + '</span><span class="sqi" style="--c:' + ELC(e) + '">' + FB.ELEMENTS[e].icon + '</span><span class="mk foe">' + (i === b ? '◀' : '') + '</span></div>';
    }
    $('seq').innerHTML = h;
  }
  $('seq').onclick = function () { if (app.shown) banner('SHARED SEQUENCE', 'p', '▶ your next element · ◀ enemy next — a frog takes one when it starts a new tank on its base'); };
  function buildCards() {
    [0, 1].forEach(function (side) {
      var box = $('cards-' + side); box.innerHTML = '';
      app.s.frogs.filter(function (f) { return f.side === side; }).forEach(function (f) {
        var c = document.createElement('div'); c.className = 'fcard ' + (side === 0 ? 'mine-c' : 'enemy'); c.id = 'fc-' + f.id;
        c.innerHTML = '<div class="fpic"></div><div class="fbody"><div class="fn">' + FB.FROGS[f.kind].name + '</div><div class="hpb"><i></i><em></em></div><div class="ffl"></div></div>';
        c.onclick = function () { if (side === 0 && canAimNow() && !app.s.pending) { app.sel = f.id; refreshHud(true); } var d = D(f.id); if (!d.hidden) R.focus(d.x, d.y); };
        box.appendChild(c);
      });
    });
  }
  function refreshHud(force) {
    if (!app.s || !app.shown) return;
    var s = app.shown;
    $('turn-n').textContent = s.turn;
    $('tb-l').textContent = s.turnSide === 0 ? 'YOUR TURN' : 'ENEMY';
    $('turnbox').className = 'turnbox ' + (s.turnSide === 0 ? 'mine' : 'enemy');
    renderSeq();
    s.frogs.forEach(function (f) {
      var c = $('fc-' + f.id); if (!c) return;
      var key = f.kind + (f.empty ? '' : f.el || '');
      if (c.dataset.pk !== key) { c.dataset.pk = key; var fp = c.querySelector('.fpic'); fp.innerHTML = ''; fp.appendChild(pic(f.kind, f.empty ? '' : f.el, 64)); }
      var hp = Math.max(0, f.hp);
      c.querySelector('.hpb i').style.width = (100 * hp / f.maxHp) + '%';
      c.querySelector('.hpb em').textContent = hp + ' / ' + f.maxHp;
      var home = Sim.onBase(f), st;
      if (f.empty) st = '<span class="emp">EMPTY ⟲' + f.ret + '</span>';
      else if (f.el) st = '<span class="eli" style="color:' + ELC(f.el) + '">' + FB.ELEMENTS[f.el].icon + '</span>' + pips(f.ch, f.el);
      else st = '<span class="emp">⏳ new tank next turn</span>';
      if (home && !f.empty) st += '<span class="hm">BASE</span>';
      c.querySelector('.ffl').innerHTML = st;
      c.classList.toggle('done', f.side === s.turnSide && !Sim.canAct(app.s, app.s.frogs[f.id]) && !app.s.pending);
      c.classList.toggle('sel', f.id === app.sel && myTurn());
    });
    var mine = myTurn() && !app.playing && !app.busy, P = app.s.pending, sel = mineSel();
    $('bottom').classList.toggle('wait', !mine);
    $('tring').classList.toggle('off', !mine);
    $('btn-skip').textContent = P && myTurn() ? 'AUTO' : 'PASS';
    $('btn-recall').disabled = !(mine && sel && Sim.canRecall(app.s, sel));
    $('btn-recall').textContent = app.s.recalls >= T.recallsPerTurn ? 'RECALLED' : 'RECALL';
    if (!app.aimCmd) {
      if (!mine) setPv(app.s.phase === 'play' ? (app.s.turnSide === 1 ? 'Enemy turn' : 'Watching…') : 'Match over', app.s.turnSide === 1 ? 'The bot is thinking' : '');
      else if (P) setPv('↗ RELAY', 'Jump again — any direction, full range. Each ally once. Timer runs out → auto hop ' + Math.round(T.relayAuto * 100) + '%');
      else if (sel) {
        var can = Sim.canAct(app.s, sel), txt;
        if (can) txt = 'Drag back to jump · ' + sel.ch + ' charge' + (sel.ch > 1 ? 's' : '') + (Sim.canRecall(app.s, sel) ? ' · RECALL: home now' : '');
        else if (sel.empty) txt = 'Empty: relay point only · home in ' + sel.ret + ' turn' + (sel.ret > 1 ? 's' : '') + (Sim.canRecall(app.s, sel) ? ' · RECALL now' : '');
        else txt = 'No charge yet — charges on the base each turn';
        setPv((sel.el && !sel.empty ? FB.ELEMENTS[sel.el].icon + ' ' : '') + FB.FROGS[sel.kind].name, txt);
      } else setPv('Your turn', myActable().length ? 'Pick a frog with a charge' : 'No frog can act — PASS');
    }
  }

  // ---------- цикл ----------
  var last = performance.now(), lastRaf = 0;
  function update(dt) {
    if (app.screen === 'battle' && app.s) {
      if (!app.paused) stepPlayback(dt * app.speed);
      app.s.frogs.forEach(function (f) {
        var d = D(f.id); if (!d) return;
        d.flash = Math.max(0, (d.flash || 0) - dt * 4); d.hitT = Math.max(0, (d.hitT || 0) - dt * app.speed); d.squash = Math.max(0, (d.squash || 0) - dt * 0.6);
        d.poseT += dt; if (d.pose === 'land' && d.poseT > 0.35) setPose(d, 'idle');
        if (d.hop) {
          d.hop.t += dt * app.speed; var hk = Math.min(1, d.hop.t / d.hop.dur);
          d.z = d.hop.z0 * (1 - hk) + Math.sin(Math.PI * hk) * 26; d.x = d.hop.from.x + (d.hop.to.x - d.hop.from.x) * hk; d.y = d.hop.from.y + (d.hop.to.y - d.hop.from.y) * hk;
          d.pose = hk < 0.8 ? 'air' : 'land'; if (hk >= 1) { d.z = 0; d.hop = null; setPose(d, 'land'); d.squash = 0.2; }
        }
        d.sel = f.id === app.sel && (myTurn() || app.s.turnSide === f.side);
        d.hidden = hiddenNow(app.shown.frogs[f.id]);
        if (f.id === aimFrog && mode === 'aim') d.pose = 'aim';
      });
      if (canAimNow() && !app.paused) {
        app.turnLeft -= dt;
        var tl = Math.max(0, app.turnLeft);
        $('timer').querySelector('i').style.width = (100 * tl / T.turnTimeSec) + '%';
        $('timer').querySelector('span').textContent = Math.ceil(tl);
        $('tring-n').textContent = Math.ceil(tl); $('tring-fg').style.strokeDashoffset = (106.8 * (1 - tl / T.turnTimeSec)).toFixed(1); $('tring').classList.toggle('low', tl < 5);
        $('timer').classList.toggle('low', tl < 5);
        if (app.turnLeft <= 0) { // ход кончился: на спине союзника — автоотскок, иначе пас
          cancelAim(); mode = null;
          var P = app.s.pending;
          execute(P ? { frog: P.frog, mode: 'end' } : { mode: 'skip' });
        }
      }
      app.hudT -= dt; if (app.hudT <= 0) { app.hudT = 0.12; refreshHud(); }
    }
    R.frame(dt);
  }
  function tick(now) {
    var dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
    update(dt);
  }
  function raf(now) { lastRaf = performance.now(); tick(now); requestAnimationFrame(raf); }
  setInterval(function () { var n = performance.now(); if (n - lastRaf > 120) tick(n); }, 50); // вкладка без rAF (скрытая панель)
  window.addEventListener('resize', function () { R.resize(); });

  document.addEventListener('pointerdown', function goFull() {
    var el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen && window.matchMedia('(pointer: coarse)').matches) el.requestFullscreen({ navigationUI: 'hide' }).catch(function () {});
  }, { capture: true });

  // ---------- старт ----------
  R.load().then(function () {
    R.init(cv, $('labels'), app);
    $('loading').classList.add('hidden');
    buildRoster(); showScreen('team');
    requestAnimationFrame(raf);
    if (app.auto) startBattle();
  }).catch(function (err) { $('loading').textContent = 'Load failed: ' + err.message; console.error(err); });
})();
