// Экраны, ввод, ход и проигрывание событий симуляции для итерации 2. Рендер — FB.R3 (Three.js).
(function () {
  var Sim = FB.Sim, AI = FB.AI, T = FB.T, R = FB.R3;
  var $ = function (id) { return document.getElementById(id); };
  function log(ev, data) { console.log('[FB] ' + ev, data !== undefined ? JSON.stringify(data) : ''); }
  var store = {
    get: function (k) { try { return JSON.parse(localStorage.getItem('toadbrew3.' + k)); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem('toadbrew3.' + k, JSON.stringify(v)); } catch (e) {} }
  };
  var DEF_EL = { spring: 'fire', cling: 'ice', bellows: 'poison', spur: 'lightning' };
  var app = FB.app = {
    screen: 'team', picks: store.get('picks') || ['spring', 'spur'], elems: store.get('elems') || {},
    s: null, shown: null, disp: {}, queue: [], cur: null, busy: false, playing: false, speed: 1, paused: false,
    auto: /[?&]auto=1/.test(location.search), sel: -1, aimCmd: null, turnLeft: 0, gripT: 0, hudT: 0
  };
  if (!Array.isArray(app.picks) || app.picks.length !== 2 || app.picks.some(function (k) { return !FB.FROGS[k]; }) || app.picks[0] === app.picks[1]) app.picks = ['spring', 'spur'];
  function elOf(kind) { return app.elems[kind]; }
  // У четырёх жаб всегда четыре разных элемента (D-071): стартовые — свои у каждой, при выборе на ALCHEMY
  // занятый элемент меняется местами с жабой, у которой он был. Поэтому и в паре элементы разные.
  function normalizeEls() {
    var used = {}, out = {};
    FB.FROG_ORDER.forEach(function (k) { var e = app.elems[k]; if (FB.ELEMENTS[e] && !used[e]) { out[k] = e; used[e] = 1; } });
    FB.FROG_ORDER.forEach(function (k) {
      if (out[k]) return;
      var e = !used[DEF_EL[k]] ? DEF_EL[k] : FB.ELEMENT_ORDER.filter(function (x) { return !used[x]; })[0];
      out[k] = e; used[e] = 1;
    });
    app.elems = out; store.set('elems', out);
  }
  normalizeEls();
  function setEl(kind, e) {
    var old = app.elems[kind];
    FB.FROG_ORDER.forEach(function (k) { if (k !== kind && app.elems[k] === e) app.elems[k] = old; });
    app.elems[kind] = e; store.set('elems', app.elems);
  }
  function teamEls() { return [elOf(app.picks[0]), elOf(app.picks[1])]; }

  // ---------- портреты ----------
  function pic(kind, el, size) {
    var c = document.createElement('canvas'); c.width = c.height = size;
    var src = R.portrait(kind, el); if (src) c.getContext('2d').drawImage(src, 0, 0, size, size);
    return c;
  }

  // ---------- TEAM ----------
  function buildRoster() {
    var r = $('roster'); r.innerHTML = '';
    FB.FROG_ORDER.forEach(function (k) {
      var F = FB.FROGS[k], el = document.createElement('button'); el.className = 'card'; el.dataset.kind = k;
      el.appendChild(pic(k, elOf(k), 220));
      el.insertAdjacentHTML('beforeend', '<div class="cicon">' + FB.ELEMENTS[elOf(k)].icon + '</div><div class="check">✓</div>' +
        '<div class="cname">' + F.name + '</div><div class="cstats">❤ ' + F.hp + ' · 🛡 ' + F.def + '% · ⤴ ' + F.jump.toFixed(1) + '</div><div class="ctrait">' + F.trait + '</div>');
      el.onclick = function () { togglePick(k); };
      r.appendChild(el);
    });
  }
  function togglePick(k) {
    var i = app.picks.indexOf(k);
    if (i >= 0) return; // всегда ровно 2: тап по другой жабе заменяет старшую
    app.picks = [app.picks[1], k];
    store.set('picks', app.picks); renderTeam();
  }
  function renderTeam() {
    teamEls();
    document.querySelectorAll('.card').forEach(function (el) { el.classList.toggle('sel', app.picks.indexOf(el.dataset.kind) >= 0); });
    app.picks.forEach(function (k, i) {
      var p = $('ped-' + i); p.innerHTML = '';
      p.appendChild(pic(k, elOf(k), 240));
      p.insertAdjacentHTML('beforeend', '<div class="pname">' + FB.FROGS[k].name + '</div><div class="ptr">' + FB.FROGS[k].tdesc + '</div>');
    });
    var t = FB.traitFor(app.picks[0], app.picks[1]);
    $('syn').innerHTML = '<div class="s-ic">' + t.icon + '</div><div class="s-l">TEAM TRAIT</div><div class="s-n">' + t.name + '</div><div class="s-a">' + t.arche + '</div><div class="s-d">' + t.desc + '</div>';
  }

  // ---------- ALCHEMY ----------
  function renderAlchemy() {
    teamEls();
    var box = $('tanks'); box.innerHTML = '';
    app.picks.forEach(function (k) {
      var row = document.createElement('div'); row.className = 'tank';
      var left = document.createElement('div'); left.appendChild(pic(k, elOf(k), 200));
      left.insertAdjacentHTML('beforeend', '<div class="rname">' + FB.FROGS[k].name + '</div>');
      var right = document.createElement('div');
      right.innerHTML = '<div class="seq-h">ELIXIR IN THE TANK <span class="tier">TIER I</span></div><div class="els"></div><div class="el-d"></div>';
      FB.ELEMENT_ORDER.forEach(function (e) {
        var E = FB.ELEMENTS[e], b = document.createElement('button'); b.className = 'elb' + (elOf(k) === e ? ' on' : '');
        b.style.setProperty('--c', E.color); b.innerHTML = '<span>' + E.icon + '</span>' + E.name;
        b.onclick = function () { setEl(k, e); renderAlchemy(); buildRoster(); renderTeam(); };
        right.querySelector('.els').appendChild(b);
      });
      right.querySelector('.el-d').textContent = elDesc(elOf(k));
      row.appendChild(left); row.appendChild(right); box.appendChild(row);
    });
    var e0 = elOf(app.picks[0]), e1 = elOf(app.picks[1]), charge = e0 !== e1 ? FB.reactionKey(e0, e1) : null;
    var arena = {}; [e0, e1].forEach(function (a) { ['fire', 'poison'].forEach(function (b) { if (a !== b) arena[FB.reactionKey(a, b)] = true; }); });
    $('reactions').innerHTML = Object.keys(FB.REACTIONS).map(function (key) {
      var Rx = FB.REACTIONS[key], els = key.split('+'), on = key === charge || arena[key];
      return '<div class="rx' + (on ? ' on' : '') + '"><div class="rf">' + els.map(function (e) { return FB.ELEMENTS[e].icon; }).join(' + ') + '</div><div class="rn">' + Rx.name + '</div><div class="rd">' + Rx.desc + '</div>' +
        (key === charge ? '<div class="rv">✔ Reaction Charge: land on your ally</div>' : '') + (arena[key] ? '<div class="rv">✔ Arena puddle</div>' : '') + '</div>';
    }).join('');
  }
  function elDesc(e) {
    return { fire: 'Fire: +' + T.fireDmg + ' damage on a direct hit, splashes nearby enemies.', ice: 'Ice: +' + T.iceDmg + ' damage, the target\'s next jump is ' + Math.round((1 - T.chillMul) * 100) + '% shorter.',
      poison: 'Poison: +' + T.poisonDmg + ' now and ' + T.poisonTick + ' at the end of each of its next ' + T.poisonTicks + ' activations.', lightning: 'Lightning: +' + T.lightDmg + ' damage, and ' + T.lightArc + ' arcs to a second enemy nearby.' }[e];
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
    if (meta) { app.shown = null; R.resetFrogs(); R.focus(T.IMG_W * FB.K / 2, T.IMG_H * FB.K / 2, 1); }
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

  // ---------- бой ----------
  function seedFromUrl() { var m = /[?&]seed=(\d+)/.exec(location.search); return m ? +m[1] : (Date.now() % 1e9); }
  var botRng = Math.random;
  function startBattle(rematch) {
    var fixed = /[?&]seed=\d+/.test(location.search), seed = fixed ? seedFromUrl() : Math.floor(Math.random() * 1e9);
    app.lastSeed = seed;
    var rr = seed % 233280; botRng = function () { rr = (rr * 9301 + 49297) % 233280; return rr / 233280; };
    // бот всегда берёт случайную пару жаб и два разных случайных элемента (D-067); ?seed= делает выбор повторяемым
    var pick = fixed ? botRng : Math.random;
    function two(list) { var a = Math.floor(pick() * list.length), b = (a + 1 + Math.floor(pick() * (list.length - 1))) % list.length; return [list[a], list[b]]; }
    var botTeam = two(FB.FROG_ORDER), botEls = two(FB.ELEMENT_ORDER);
    app.botTeam = botTeam; app.botEls = botEls;
    var my = teamEls();
    app.s = Sim.createMatch(app.picks, botTeam, my, botEls, seed);
    var ev = Sim.startMatch(app.s);
    app.shown = Sim.clone(app.s); app.disp = {}; app.queue = []; app.cur = null; app.sel = -1; app.aimCmd = null; app.roundActs = []; app.activeId = -1;
    app.shown.puddles = app.shown.puddles.filter(function (p) { return p.fixed; }); // лужи из труб появятся с анимацией
    app.s.frogs.forEach(function (f) { app.disp[f.id] = { x: f.x, y: f.y, z: 0, facing: f.side === 0 ? 0 : Math.PI, pose: 'idle', poseT: 0, alive: true, flash: 0, squash: 0 }; });
    R.resetFrogs();
    showScreen('battle');
    var p = app.s.frogs[0]; R.focus(p.x + 90, p.y - 200, 0.5);
    log('battle', { seed: seed, me: app.picks, myEls: my, bot: botTeam, botEls: botEls });
    buildCards(); buildTraits(); orderKey = '';
    app.busy = true;
    setTimeout(function () { if (app.s && app.screen === 'battle') { app.queue = ev; app.playing = true; } }, 400);
  }

  function myTurn() { return app.s && app.s.phase === 'play' && app.s.turnSide === 0 && !app.auto; }
  function canAimNow() { return myTurn() && !app.busy && !app.paused && !app.playing; }

  function nextTurn() {
    var s = app.s;
    if (!s || app.screen !== 'battle') return;
    if (s.phase !== 'play') return onMatchOver();
    if (s.turnSide === 0 && !app.auto) {
      var c = s.frogs.filter(function (f) { return Sim.canAct(s, f); });
      if (!c.some(function (f) { return f.id === app.sel; })) app.sel = c.length ? c[0].id : -1;
      if (!s.pending) app.turnLeft = T.turnTimeSec;
      var f = s.frogs[app.sel]; if (f) R.focus(f.x, f.y - 120);
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
      if (!cmd) cmd = { frog: s.frogs.filter(function (f) { return Sim.canAct(s, f); })[0].id, mode: 'skip' };
      var f = s.frogs[cmd.frog];
      var visible = side === 0 || !Sim.hiddenFrom(s, 0, f);
      if (visible && cmd.dx !== undefined) { app.sel = cmd.frog; R.focus(f.x, f.y); showAim(f, cmd); }
      app.botTimer = setTimeout(function () { R.setAim(null); execute(cmd); }, (visible && cmd.dx !== undefined ? 800 : 250) / app.speed);
    }, (s.pending ? 150 : 450) / app.speed);
  }

  function execute(cmd) {
    var res = Sim.apply(app.s, cmd);
    log('cmd', { cmd: { frog: cmd.frog, mode: cmd.mode || 'jump', dx: cmd.dx && Math.round(cmd.dx), dy: cmd.dy && Math.round(cmd.dy) }, ok: res.ok, why: res.why });
    app.aimCmd = null; R.setAim(null); $('gripbar').classList.add('hidden'); notice(null);
    if (!res.ok) { app.busy = false; return; }
    app.busy = true; app.playing = true;
    app.queue = app.queue.concat(res.events);
  }

  function onPlaybackDone() {
    app.playing = false;
    var s = app.s;
    app.shown = Sim.clone(s);
    s.frogs.forEach(function (f) {
      var d = app.disp[f.id]; d.x = f.x; d.y = f.y; d.alive = f.alive;
      if (!(s.pending && s.pending.frog === f.id && s.pending.kind === 'grip')) { d.z = 0; d.pitch = 0; d.stretch = 0; if (d.pose === 'air' || d.pose === 'grip') d.pose = 'land'; }
      if (!f.alive) d.pose = 'dead';
    });
    app.busy = false;
    if (!s.pending) app.activeId = -1;
    if (s.phase !== 'play') return onMatchOver();
    if (s.pending) {
      var pf = s.frogs[s.pending.frog];
      if (pf.side === 0 && !app.auto) {
        app.sel = pf.id;
        if (s.pending.kind === 'grip') { app.gripT = T.gripWindow; $('gripbar').classList.remove('hidden'); }
        else app.turnLeft = Math.max(app.turnLeft, 6);
        refreshHud(true);
      } else botTurn();
      return;
    }
    nextTurn();
  }

  function onMatchOver() {
    if (app.overShown) return;
    app.overShown = true;
    var w = app.s.winner;
    banner(w === 0 ? 'VICTORY!' : w === 1 ? 'DEFEAT' : 'DRAW', w === 0 ? 'gold' : 'b');
    log('over', { winner: w, why: app.s.why, round: app.s.round });
    setTimeout(function () { app.overShown = false; if (app.screen === 'battle') showResult(); }, 1800);
  }
  function showResult() {
    var s = app.s, w = s.winner;
    $('res-title').textContent = w === 0 ? 'VICTORY' : w === 1 ? 'DEFEAT' : 'DRAW';
    $('result').classList.toggle('lose', w !== 0);
    [0, 1].forEach(function (side) {
      var box = $('res-' + side); box.innerHTML = '';
      s.frogs.filter(function (f) { return f.side === side; }).forEach(function (f) {
        var d = document.createElement('div'); if (!f.alive) d.className = 'gone';
        d.appendChild(pic(f.kind, f.el, 160));
        d.insertAdjacentHTML('beforeend', FB.FROGS[f.kind].name + '<br>' + f.hp + ' / ' + f.maxHp + (f.alive ? '' : '<span class="x">✕</span>'));
        box.appendChild(d);
      });
    });
    var hp = function (side) { var h = 0, m = 0; s.frogs.forEach(function (f) { if (f.side === side) { h += f.hp; m += f.maxHp; } }); return Math.round(100 * h / m); };
    $('res-sub').textContent = s.why === 'ko' ? 'Knockout in round ' + s.round + '.' : 'Round limit: HP ' + hp(0) + '% vs ' + hp(1) + '%.';
    showScreen('result');
  }

  // ---------- проигрывание событий ----------
  function D(id) { return app.disp[id]; }
  function SF(id) { return app.shown.frogs[id]; }
  function ease(u) { return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; }
  function easeOut(u) { return 1 - Math.pow(1 - u, 3); }
  function faceDir(d, dx, dy) { if (Math.abs(dx) + Math.abs(dy) > 0.5) d.facing = Math.atan2(dx, -dy); }
  function setPose(d, p) { d.pose = p; d.poseT = 0; }
  var ELC = function (el) { return FB.ELEMENTS[el] ? FB.ELEMENTS[el].color : '#ffffff'; };
  var RXC = { 'fire+ice': '#eefaff', 'fire+poison': '#ff6a00', 'fire+lightning': '#ff9800', 'ice+poison': '#46ff2e', 'ice+lightning': '#18d4ff', 'lightning+poison': '#c6ff00' };

  function startEvent(e) {
    var d = e.id !== undefined && app.disp[e.id] ? D(e.id) : null, upd = null, end = null, dur = 0;
    switch (e.t) {
      case 'act': if (!d.hidden) R.focus(d.x, d.y); app.sel = e.id; app.activeId = e.id; if (app.roundActs.indexOf(e.id) < 0) app.roundActs.push(e.id); dur = 0.12; break;
      case 'jump': {
        // присед → толчок; по дуге время идёт быстрее у земли и медленнее у вершины: взлёт, зависание, падение (D-062)
        var segs = e.segs, durs = segs.map(function (sg) { return 0.3 + sg.len / 1250; }), tot = durs.reduce(function (a, b) { return a + b; }, 0);
        var pre = e.mode === 'grip' ? 0.04 : 0.12, last = -1, el0 = SF(e.id).el; dur = pre + tot;
        upd = function (u) {
          var t = u * dur;
          if (t < pre) { d.pose = 'aim'; d.squash = -0.12 * t / pre; return; }
          t -= pre; var i = 0; while (i < segs.length - 1 && t > durs[i]) { t -= durs[i]; i++; }
          var sg = segs[i], q = Math.min(1, t / durs[i]), k = q + 0.32 * Math.sin(2 * Math.PI * q) / (2 * Math.PI);
          if (i !== last) {
            if (last >= 0 && segs[last].hit) {
              var wl = segs[last].wlz !== null && segs[last].wlz !== undefined, bx = segs[last].to.x, by = segs[last].to.y;
              R.burst(bx, by, wl ? '#ffa000' : ELC(el0), 12, segs[last].H * 0.5 * T.visH); R.shake(6);
              if (wl) R.text(bx, by, 'LAUNCH +30%', 'gold');
            } else if (last < 0) { R.burst(d.x, d.y, ELC(el0), 6, 4); }
            faceDir(d, sg.to.x - sg.from.x, sg.to.y - sg.from.y); last = i;
          }
          d.x = sg.from.x + (sg.to.x - sg.from.x) * k; d.y = sg.from.y + (sg.to.y - sg.from.y) * k;
          d.z = Sim.arcAt(sg.h0, sg.H, k);
          var slope = (-sg.h0 + 4 * sg.H * (1 - 2 * k)) / Math.max(40, sg.len) * T.visH;
          d.pitch = Math.max(-0.65, Math.min(0.65, Math.atan(slope) * 0.75));
          d.stretch = Math.min(0.28, 0.1 + 0.12 * Math.abs(slope));
          d.squash = 0;
          d.pose = i === segs.length - 1 && k > 0.55 ? 'fall' : 'air';
          if (!d.hidden && !cam().user) R.focus(d.x, d.y);
        };
        if (e.mode === 'grip') R.text(d.x, d.y, 'WALL LAUNCH ×' + T.gripRangeMul, 'gold');
        break;
      }
      case 'grip': setPose(d, 'grip'); d.x = e.x; d.y = e.y; d.z = e.h; d.pitch = 1.1; d.stretch = 0.1; faceDir(d, -e.n.x, -e.n.y); R.burst(e.x, e.y, '#ffa000', 12, e.h * T.visH); R.text(e.x, e.y, 'GRIP!', 'gold'); R.shake(6); dur = 0.3; break;
      case 'drop': { var z0 = d.z; d.pitch = 0; dur = 0.3; upd = function (u) { d.z = z0 * (1 - u * u); }; end = function () { setPose(d, 'land'); }; break; }
      case 'land': {
        var z1 = d.z; d.x = e.x; d.y = e.y; dur = 0.08;
        upd = function (u) { d.z = z1 * (1 - u); };
        end = function () {
          d.z = 0; d.pitch = 0; d.stretch = 0; setPose(d, 'land'); d.squash = 0.28; R.shake(4); SF(e.id).x = e.x; SF(e.id).y = e.y;
          if (!d.hidden) { var c = ELC(SF(e.id).el); R.splat(e.x, e.y, c, SF(e.id).r * 3.4); R.burst(e.x, e.y, c, 10, 6); }
        };
        break;
      }
      case 'impact': D(e.id).flash = 1; R.flash(e.x, e.y, 120, '#fff0c0'); R.burst(e.x, e.y, ELC(SF(e.by).el), 16, 30); R.splat(e.x, e.y, ELC(SF(e.by).el), 80); R.shake(12); dur = 0.12; break;
      case 'hit': {
        var hf = SF(e.id); hf.hp = Math.max(0, hf.hp - e.dmg); d.flash = 1;
        var cls = { fire: 'fire', ice: 'ice', poison: 'poison', lightning: 'light', slam: 'slam', neuro: 'light' }[e.src] || 'dmg';
        if (!d.hidden) R.text(d.x, d.y, '−' + e.dmg, cls); dur = 0.06; break;
      }
      case 'push': {
        var f0 = e.from, t0 = e.to; dur = 0.32;
        upd = function (u) { var k = easeOut(u); d.x = f0.x + (t0.x - f0.x) * k; d.y = f0.y + (t0.y - f0.y) * k; };
        end = function () { SF(e.id).x = t0.x; SF(e.id).y = t0.y; if (e.wall) { R.burst(t0.x, t0.y, ELC(SF(e.id).el), 14, 20); R.splat(t0.x, t0.y, ELC(SF(e.id).el), 70); R.shake(10); R.text(t0.x, t0.y, 'SLAM!', 'slam'); } };
        break;
      }
      case 'death': d.alive = false; setPose(d, 'dead'); SF(e.id).alive = false; R.burst(e.x, e.y, ELC(SF(e.id).el), 28, 30); R.splat(e.x, e.y, ELC(SF(e.id).el), 140, 30); R.text(e.x, e.y, 'KO!', 'ko'); R.shake(14); dur = 0.6; break;
      case 'charge': SF(e.id).charge = e.els; R.ring(d.x, d.y, 90, RXC[e.key] || '#ffffff'); R.text(d.x, d.y, 'CHARGE<br><small>' + (FB.REACTIONS[e.key] ? FB.REACTIONS[e.key].name : 'OVERCHARGE') + '</small>', 'charge'); dur = 0.45; break;
      case 'chargeUsed': SF(e.id).charge = null; break;
      case 'reaction': R.flash(e.x, e.y, 260, RXC[e.key] || '#ffe080'); R.splat(e.x, e.y, RXC[e.key] || '#ffe080', 230, 14); R.burst(e.x, e.y, RXC[e.key] || '#ffe080', 30, 40); R.ring(e.x, e.y, 180, RXC[e.key] || '#ffe080', 0.6); R.text(e.x, e.y, e.name, 'rx'); R.shake(8); dur = 0.5; break;
      case 'veil': app.shown.veils.push(e.veil); dur = 0.3; break;
      case 'veilBounce': {
        var vf = e.from, vt = e.to; dur = d.hidden ? 0.01 : 0.35;
        upd = function (u) { d.x = vf.x + (vt.x - vf.x) * u; d.y = vf.y + (vt.y - vf.y) * u; d.z = Math.sin(Math.PI * u) * 35; };
        end = function () { d.z = 0; SF(e.id).x = vt.x; SF(e.id).y = vt.y; };
        break;
      }
      case 'veilGone': app.shown.veils = app.shown.veils.filter(function (v) { return v.id !== e.id; }); break;
      case 'orb': R.orb(e.path, 0.6); dur = 0.6; break;
      case 'crystal': app.shown.crystals.push(e.crystal); R.burst(e.crystal.cx, e.crystal.cy, '#8dff5a', 14, 20); R.shake(6); dur = 0.35; break;
      case 'crystalGone': app.shown.crystals = app.shown.crystals.filter(function (c) { return c.id !== e.id; }); break;
      case 'status': { var key = e.s === 'pinned' ? 'pinnedBy' : e.s, fin = app.s.frogs[e.id][key]; SF(e.id)[key] = e.s === 'pinned' ? (fin >= 0 ? fin : 0) : (fin || 1); if (e.s === 'shell') R.ring(d.x, d.y, 70, '#9fe0ff'); if (e.s === 'pinned') R.text(d.x, d.y, 'MARKED', 'gold'); break; }
      case 'statusGone': SF(e.id)[e.s] = 0; break;
      case 'shellBreak': SF(e.id).shell = 0; R.ring(e.x, e.y, 130, '#9fe0ff'); R.burst(e.x, e.y, '#9fe0ff', 12, 20); dur = 0.2; break;
      case 'node': { var n = app.shown.nodes[e.id]; n.el = e.el; n.side = e.side; R.ring(n.x, n.y, 70, ELC(e.el)); R.splat(n.x, n.y, ELC(e.el), 70); R.text(n.sx, n.sy, 'NEXT ROUND', 'node'); dur = 0.3; break; }
      case 'puddleUsed': app.shown.puddles.forEach(function (p) { if (p.id === e.id) { p.active = false; R.burst(p.x, p.y, ELC(p.el), 14, 8); } }); break;
      case 'puddleGone': app.shown.puddles = app.shown.puddles.filter(function (p) { return p.id !== e.id; }); break;
      case 'puddleOn': app.shown.puddles.forEach(function (p) { if (p.id === e.id) p.active = true; }); break;
      case 'spawn': { // реагент льётся из трубы, лужа появляется, когда струя долетела (D-068)
        var pp = e.puddle, shownNow = app.shown;
        R.pour(e.pipe, pp, ELC(pp.el), 0.45, function () { if (app.shown === shownNow && !shownNow.puddles.some(function (q) { return q.id === pp.id; })) shownNow.puddles.push(pp); R.splat(pp.x, pp.y, ELC(pp.el), pp.r * 2.2, 6); R.ring(pp.x, pp.y, pp.r * 1.6, ELC(pp.el)); });
        dur = 0.18; break;
      }
      case 'arc': R.bolt(e.from, e.to); dur = 0.12; break;
      case 'round': app.shown.round = e.round; app.shown.acted = {}; app.roundActs = []; app.activeId = -1; banner('ROUND ' + e.round, e.side === 0 ? 'p' : 'b', e.side === 0 ? 'You start' : 'Enemy starts'); dur = 0.9; break;
      case 'turn': app.shown.turnSide = e.side; break;
      case 'label': R.text(d.x, d.y, e.text, 'gold'); dur = 0.3; break;
      case 'hopReady': R.text(d.x, d.y, 'EXTRA HOP!', 'gold'); dur = 0.25; break;
      case 'skip': R.text(d.x, d.y, 'SKIP', 'dmg'); dur = 0.3; break;
      case 'over': dur = 0.3; break;
    }
    if (e.t === 'act') app.shown.acted && (app.shown.acted[e.id] = true);
    return dur > 0 ? { e: e, t: 0, dur: dur, upd: upd, end: end } : (end && end(), null);
  }
  function cam() { return R.cam; }

  function stepPlayback(dt) {
    var guard = 0;
    while (guard++ < 50) {
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

  // ---------- скрытность (Steam Veil) с точки зрения игрока ----------
  function hiddenNow(f) {
    if (f.side === 0 || !app.shown || app.auto) return false;
    var d = D(f.id);
    return (app.shown.veils || []).some(function (v) {
      if (Math.hypot(d.x - v.x, d.y - v.y) > v.r) return false;
      return !app.shown.frogs.some(function (o) { return o.side === 0 && o.alive && Math.hypot(D(o.id).x - v.x, D(o.id).y - v.y) <= v.r; });
    });
  }

  // ---------- прицел и превью ----------
  function showAim(f, cmd) {
    var pv = Sim.preview(app.s, cmd, f.side === 0 ? 0 : undefined), a = { segs: [], r: f.r, color: ELC(f.el), labels: [], pushes: [] };
    var charge = null, allyId = -1;
    var dmg = {}, deaths = {}, info ={ title: FB.ELEMENTS[f.el].icon + ' ' + FB.ELEMENTS[f.el].name, lines: [] }, reacted = null;
    var start = {}; app.s.frogs.forEach(function (x) { start[x.id] = { x: x.x, y: x.y }; });
    pv.events.forEach(function (e) {
      if (e.t === 'jump') a.segs = a.segs.concat(e.segs);
      if (e.t === 'grip') { a.grip = { x: e.x, y: e.y }; a.labels.push({ x: e.x, y: e.y, text: 'GRIP → 2nd jump ×' + T.gripRangeMul, cls: 'gold' }); info.lines.push('Reactive Grip: cling, then a stronger 2nd jump'); }
      if (e.t === 'land' && e.id === f.id) a.land = { x: e.x, y: e.y };
      if (e.t === 'hit' && e.id !== f.id) dmg[e.id] = (dmg[e.id] || 0) + e.dmg;
      if (e.t === 'hit' && e.id === f.id) dmg[e.id] = (dmg[e.id] || 0) + e.dmg;
      if (e.t === 'death') deaths[e.id] = true;
      if (e.t === 'push') a.pushes.push(e);
      if (e.t === 'orb') a.orb = e.path;
      if (e.t === 'crystal') a.crystal = e.crystal;
      if (e.t === 'veil') a.veilR = T.veilR;
      if (e.t === 'reaction') { reacted = e; if (e.key === 'fire+poison') a.blastR = T.detR; }
      if (e.t === 'land' && e.id === f.id && e.onAlly !== undefined) allyId = e.onAlly;
      if (e.t === 'charge') { if (e.id === f.id) charge = e; else info.lines.push('Ally gets a charge: ' + (FB.REACTIONS[e.key] ? FB.REACTIONS[e.key].name : 'OVERCHARGE')); }
      if (e.t === 'node') info.lines.push('Drain Node → next round ' + FB.ELEMENTS[e.el].icon + ' puddle');
      if (e.t === 'hopReady') info.lines.push('Living Catapult: extra hop');
    });
    if (!a.land && !a.grip && a.segs.length) { var ls = a.segs[a.segs.length - 1]; a.land = ls.to; }
    if (!a.land && !a.grip) return;
    if (reacted) { info.title = reacted.name; a.color = RXC[reacted.key] || '#ffe080'; a.labels.push({ x: a.land.x, y: a.land.y, text: reacted.name, cls: 'rx', h: 70 }); }
    else if (a.land && allyId < 0) a.elemR = T.elemR;
    // прыжок на свою жабу: дуга цвета будущей реакции, кольцо вокруг напарника, плашка «CHARGE COMBO» (D-072)
    if (charge && allyId >= 0) {
      var cn = FB.REACTIONS[charge.key] ? FB.REACTIONS[charge.key].name : 'OVERCHARGE';
      var ic = FB.ELEMENTS[charge.els[0]].icon + ' + ' + FB.ELEMENTS[charge.els[1]].icon;
      a.color = RXC[charge.key] || '#ffe080';
      a.ally = { x: start[allyId].x, y: start[allyId].y, r: app.s.frogs[allyId].r, color: a.color };
      a.labels.push({ x: start[allyId].x, y: start[allyId].y, text: 'CHARGE<br>' + ic + ' → ' + cn, cls: 'charge', h: 90 });
      info.title = '⚡ CHARGE COMBO'; info.lines.unshift(ic + ' → ' + cn + ' on the next jump, anywhere');
      if (f.side === 0) notice('⚡ CHARGE COMBO', ic + ' → <b>' + cn + '</b>', 'The next jump of this frog fires it anywhere', a.color);
    } else notice(null);
    Object.keys(dmg).forEach(function (id) {
      var p = start[id]; a.labels.push({ x: p.x, y: p.y, text: (deaths[id] ? 'KO ' : '') + '−' + dmg[id], cls: +id === f.id ? 'self' : 'dmg' });
    });
    var tot = Object.keys(dmg).filter(function (id) { return app.s.frogs[id].side !== f.side; }).reduce(function (s, id) { return s + dmg[id]; }, 0);
    if (tot) info.lines.unshift('Damage ' + tot + (Object.keys(deaths).length ? ' · KO!' : ''));
    R.setAim(a);
    if (f.side === 0) setPv(info.title, info.lines.join(' · ') || 'Release to jump');
  }
  // Плашка-уведомление над полем: появляется, пока прицел ведёт на свою жабу (заряд комбинации)
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
  function local(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  cv.addEventListener('pointerdown', function (e) {
    if (app.screen !== 'battle') return;
    cv.setPointerCapture(e.pointerId);
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
      var f = app.s.frogs[aimFrog]; D(aimFrog).pose = 'idle';
      if (cmd && canAimNow()) { log('aim.release', { frog: aimFrog }); execute(cmd); }
      else { cancelAim(); }
      return;
    }
    if (mode === 'pan' && downAt && Math.hypot(p.x - downAt.x, p.y - downAt.y) < 8 && canAimNow()) {
      var id = frogAt(p.x, p.y, myActable()); if (id >= 0) { app.sel = id; refreshHud(true); }
    }
    if (!Object.keys(pts).length) mode = null; else if (mode === 'pinch') mode = 'pan';
  }
  cv.addEventListener('pointerup', endPointer); cv.addEventListener('pointercancel', endPointer);
  cv.addEventListener('wheel', function (e) { e.preventDefault(); var p = local(e); R.zoom(e.deltaY > 0 ? 1.12 : 0.89, p.x, p.y); }, { passive: false });

  function pendingMode(f) { var P = app.s.pending; return P && P.frog === f.id ? P.kind : 'jump'; }
  function updateAim(p) {
    var f = app.s.frogs[aimFrog], d = D(f.id), sp = R.toScreen(d.x, (d.z || 0) * T.visH, d.y);
    var L = Math.hypot(p.x - sp.x, p.y - sp.y), pull = Math.min(cv.clientWidth, cv.clientHeight) * 0.3, pow = Math.min(1, L / pull);
    var w = R.toWorld(p.x, p.y, (d.z || 0) * T.visH);
    if (!w || pow < T.minPull) { app.aimCmd = null; R.setAim(null); notice(null); setPv('Pull back', 'Drag away from the frog and release'); return; }
    var dx = f.x - w.x, dy = f.y - w.y, l = Math.hypot(dx, dy) || 1, m = pendingMode(f), range = Sim.rangeFor(app.s, f, m);
    app.aimCmd = { frog: f.id, dx: dx / l * range * pow, dy: dy / l * range * pow, mode: m };
    showAim(f, app.aimCmd);
  }
  function cancelAim() { app.aimCmd = null; R.setAim(null); notice(null); if (aimFrog >= 0 && D(aimFrog)) D(aimFrog).pose = 'idle'; aimFrog = -1; refreshHud(true); }

  $('btn-skip').onclick = function () {
    if (!canAimNow()) return;
    var P = app.s.pending;
    if (P) return execute({ frog: P.frog, mode: P.kind === 'grip' ? 'drop' : 'end' });
    var f = app.s.frogs[app.sel]; if (!f || !Sim.canAct(app.s, f)) f = myActable()[0];
    if (f) execute({ frog: f.id, mode: 'skip' });
  };

  // ---------- HUD ----------
  function banner(txt, cls, sub) {
    var b = $('banner'); b.className = 'banner show ' + (cls || ''); b.innerHTML = txt + (sub ? '<small>' + sub + '</small>' : '');
    clearTimeout(app.bannerT); app.bannerT = setTimeout(function () { b.className = 'banner'; }, 1100);
  }
  // Значок командного свойства пары в бою (D-070): тап — описание
  function buildTraits() {
    [0, 1].forEach(function (side) {
      var t = FB.TEAM_TRAITS[FB.reactionKey(app.s.teams[side][0], app.s.teams[side][1])], el = $('trait-' + side);
      el.innerHTML = '<span class="ti">' + t.icon + '</span><b>' + t.name + '</b>';
      el.onclick = function () { banner(t.icon + ' ' + t.name, side === 0 ? 'p' : 'b', t.desc); };
    });
  }
  // Порядок хода в раунде слева по центру (D-070): сыгравшие, текущий, будущие слоты по сторонам.
  // Будущий слот стороны с двумя жабами — «?» (она выберет сама), с одной — портрет этой жабы.
  var orderKey = '';
  function renderOrder() {
    var s = app.shown; if (!s) return;
    var acts = (app.roundActs || []).filter(function (id) { return s.frogs[id]; });
    var rem = { 0: [], 1: [] };
    s.frogs.forEach(function (f) { if (f.alive && acts.indexOf(f.id) < 0) rem[f.side].push(f.id); });
    var slots = acts.map(function (id) { return { id: id, side: s.frogs[id].side, done: id !== app.activeId, now: id === app.activeId }; });
    var cnt = { 0: rem[0].length, 1: rem[1].length }, cur;
    if (app.activeId >= 0) { var as = s.frogs[app.activeId].side; cur = cnt[1 - as] ? 1 - as : as; } else cur = s.turnSide;
    var first = app.activeId < 0;
    while (cnt[0] + cnt[1] > 0) {
      if (!cnt[cur]) cur = 1 - cur;
      slots.push({ side: cur, opts: rem[cur].slice(), now: first }); first = false;
      cnt[cur]--; if (cnt[1 - cur]) cur = 1 - cur;
    }
    var key = JSON.stringify(slots) + s.round;
    if (key === orderKey) return; orderKey = key;
    var box = $('order'); box.innerHTML = '<div class="o-h">ROUND ' + Math.min(s.round, T.roundCap) + '</div>';
    slots.forEach(function (sl, i) {
      var el = document.createElement('div');
      el.className = 'oslot ' + (sl.side === 0 ? 'mine' : 'enemy') + (sl.done ? ' done' : '') + (sl.now ? ' now' : '');
      var id = sl.id !== undefined ? sl.id : (sl.opts.length === 1 ? sl.opts[0] : -1);
      if (id >= 0) { var f = s.frogs[id]; el.appendChild(pic(f.kind, f.el, 64)); }
      else el.insertAdjacentHTML('beforeend', '<span class="q">?</span>');
      el.insertAdjacentHTML('beforeend', '<i>' + (i + 1) + '</i>');
      box.appendChild(el);
    });
  }
  function buildCards() {
    app.s.frogs.forEach(function (f) {
      var c = $('fc-' + f.id); c.innerHTML = '';
      c.appendChild(pic(f.kind, f.el, 76));
      c.insertAdjacentHTML('beforeend', '<div><div class="fn">' + FB.FROGS[f.kind].name + '</div><div class="hpb"><i></i><em></em></div><div class="ffl"></div></div>');
      c.onclick = function () { if (f.side === 0 && canAimNow() && Sim.canAct(app.s, f)) { app.sel = f.id; refreshHud(true); } var d = D(f.id); if (!d.hidden) R.focus(d.x, d.y); };
    });
  }
  function refreshHud(force) {
    if (!app.s || !app.shown) return;
    var s = app.shown;
    $('round-n').textContent = Math.min(s.round, T.roundCap);
    renderOrder();
    s.frogs.forEach(function (f) {
      var c = $('fc-' + f.id); if (!c.lastChild) return;
      var E = FB.ELEMENTS[f.el], hp = Math.max(0, f.hp);
      c.querySelector('.hpb i').style.width = (100 * hp / f.maxHp) + '%';
      c.querySelector('.hpb em').textContent = hp + ' / ' + f.maxHp;
      var st = '<span class="eli" style="color:' + E.color + '">' + E.icon + '</span>';
      if (f.charge) st += '<span class="chg">' + FB.ELEMENTS[f.charge[0]].icon + FB.ELEMENTS[f.charge[1]].icon + '</span>';
      st += '<span class="sts">' + (f.poison ? '☠' : '') + (f.chill ? '❄' : '') + (f.neuro ? '⚡' : '') + (f.shell ? '🛡' : '') + (f.pinnedBy >= 0 ? '🎯' : '') + ' 🛡' + f.def + '%</span>';
      c.querySelector('.ffl').innerHTML = st;
      c.classList.toggle('dead', !f.alive);
      c.classList.toggle('done', f.alive && !!app.s.acted[f.id] && app.s.round === s.round);
      c.classList.toggle('sel', f.id === app.sel && myTurn());
    });
    var mine = myTurn() && !app.playing && !app.busy;
    $('bottom').classList.toggle('wait', !mine);
    if (!app.aimCmd) {
      if (!mine) setPv(app.s.phase === 'play' ? (app.s.turnSide === 1 ? 'Enemy turn' : 'Watching…') : 'Match over', app.s.turnSide === 1 ? 'The bot is thinking' : '');
      else {
        var f = app.s.frogs[app.sel], P = app.s.pending;
        if (P && P.kind === 'grip') setPv('GRIP!', 'Pull again before the bar runs out — 2nd jump ×' + T.gripRangeMul + ' range, ×' + T.gripImpactMul + ' impact');
        else if (P && P.kind === 'hop') setPv('EXTRA HOP', 'Living Catapult: one more short jump, or END');
        else if (f) setPv(FB.ELEMENTS[f.el].icon + ' ' + FB.FROGS[f.kind].name, f.charge ? 'Charged: ' + FB.REACTIONS[FB.reactionKey(f.charge[0], f.charge[1])].name + ' fires on landing' : 'Drag back from the frog to jump');
      }
    }
    $('btn-skip').textContent = app.s.pending && myTurn() ? (app.s.pending.kind === 'grip' ? 'DROP' : 'END') : 'SKIP';
  }

  // ---------- цикл ----------
  var last = performance.now(), lastRaf = 0;
  function update(dt) {
    if (app.screen === 'battle' && app.s) {
      if (!app.paused) stepPlayback(dt * app.speed);
      app.s.frogs.forEach(function (f) {
        var d = D(f.id); if (!d) return;
        d.flash = Math.max(0, (d.flash || 0) - dt * 4); d.squash = Math.max(0, (d.squash || 0) - dt * 0.6);
        d.poseT += dt; if (d.pose === 'land' && d.poseT > 0.35) setPose(d, 'idle');
        d.sel = f.id === app.sel && f.alive && (myTurn() || app.s.turnSide === f.side);
        d.hidden = hiddenNow(app.shown.frogs[f.id]);
        if (f.id === aimFrog && mode === 'aim') d.pose = 'aim';
      });
      if (canAimNow() && !app.paused) {
        var P = app.s.pending;
        if (P && P.kind === 'grip') {
          if (mode !== 'aim') app.gripT -= dt;
          $('gripbar').querySelector('i').style.width = Math.max(0, 100 * app.gripT / T.gripWindow) + '%';
          if (app.gripT <= 0) { cancelAim(); execute({ frog: P.frog, mode: 'drop' }); }
        } else {
          app.turnLeft -= dt;
          var tl = Math.max(0, app.turnLeft);
          $('timer').querySelector('i').style.width = (100 * tl / T.turnTimeSec) + '%';
          $('timer').querySelector('span').textContent = Math.ceil(tl);
          $('timer').classList.toggle('low', tl < 5);
          if (app.turnLeft <= 0) {
            cancelAim(); mode = null;
            var f = app.s.frogs[app.sel]; if (!f || !Sim.canAct(app.s, f)) f = myActable()[0];
            if (P) execute({ frog: P.frog, mode: 'end' }); else if (f) execute({ frog: f.id, mode: 'skip' });
          }
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

  // На телефоне — полноэкранный режим с первого касания (браузер разрешает его только по жесту; iOS Safari не умеет)
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
