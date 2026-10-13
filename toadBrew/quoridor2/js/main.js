// Экраны, ввод, ход и проигрывание событий симуляции — Relay Alchemy 2 (ветка Quoridor2). Рендер — FB.R3 (Three.js).
(function () {
  var Sim = FB.Sim, AI = FB.AI, T = FB.T, R = FB.R3, AR = FB.ARENA;
  var $ = function (id) { return document.getElementById(id); };
  function log(ev, data) { console.log('[FB] ' + ev, data !== undefined ? JSON.stringify(data) : ''); }
  var store = {
    get: function (k) { try { return JSON.parse(localStorage.getItem('toadbrewQ2.' + k)); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem('toadbrewQ2.' + k, JSON.stringify(v)); } catch (e) {} }
  };
  var BOT_NOISE = { deg: T.botAimNoiseDeg, pow: T.botAimNoisePow };
  // подсказки первого матча (D-154): какие уже показаны, выключены ли; ?tips=1 — показать заново
  if (/[?&]tips=1/.test(location.search)) { store.set('tipsSeen', {}); store.set('tipsOff', false); }
  var tips = { seen: store.get('tipsSeen') || {}, off: !!store.get('tipsOff') };
  var app = FB.app = {
    screen: 'team', picks: store.get('picks3') || ['spring', 'cling', 'bellows'],
    s: null, shown: null, disp: {}, queue: [], cur: null, busy: false, playing: false, speed: 1, paused: false,
    auto: /[?&]auto=1/.test(location.search), sel: -1, aimCmd: null, turnLeft: 0, timerTurn: -1, hudT: 0
  };
  if (!Array.isArray(app.picks)) app.picks = ['spring', 'cling', 'bellows'];
  app.picks = app.picks.filter(function (k, i) { return FB.FROGS[k] && app.picks.indexOf(k) === i; }).slice(0, 3); // 0–3 разных жаб (D-135)
  // три слота треугольником (D-138): пустой слот — null; команда — занятые слоты по порядку
  app.slots = store.get('slots3');
  if (!Array.isArray(app.slots) || app.slots.length !== 3) app.slots = [app.picks[0] || null, app.picks[1] || null, app.picks[2] || null];
  app.slots = app.slots.map(function (k, i, arr) { return FB.FROGS[k] && arr.indexOf(k) === i ? k : null; });
  app.picks = app.slots.filter(Boolean);
  var SIDE_C = ['#4aa3ff', '#ff5a4a'];
  var ELC = function (el) { return FB.ELEMENTS[el] ? FB.ELEMENTS[el].color : '#d8c8a8'; };
  var RXC = { 'fire+ice': '#eefaff', 'fire+poison': '#ff6a00', 'fire+lightning': '#ff9800', 'ice+poison': '#46ffb0', 'ice+lightning': '#bfefff', 'lightning+poison': '#9dff3a' };

  // ---------- портреты ----------
  function pic(kind, el, size) {
    var c = document.createElement('canvas'); c.width = c.height = size;
    var src = R.portrait(kind, el); if (src) c.getContext('2d').drawImage(src, 0, 0, size, size);
    return c;
  }
  function pips(ch, el) { var h = ''; for (var i = 0; i < T.tank; i++) h += '<i class="' + (i < ch ? 'on' : '') + '" style="--c:' + ELC(el) + '"></i>'; return '<span class="pips">' + h + '</span>'; }

  // ---------- TEAM ----------
  // Экран команды по макету автора (D-138): три слота треугольником; под каждым — перк жабы (D-144), стрелка к слоту.
  // Тап по слоту — попап со всеми жабами; жаба, уже стоящая в другом слоте, переезжает сюда, тот слот пустеет.
  var popSlot = -1;
  function syncPicks() { app.picks = app.slots.filter(Boolean); store.set('slots3', app.slots); }
  function buildRoster() { // сетка попапа: все четыре жабы
    var r = $('roster'); r.innerHTML = '';
    FB.FROG_ORDER.forEach(function (k) {
      var F = FB.FROGS[k], el = document.createElement('button'); el.className = 'card ppf'; el.dataset.kind = k;
      el.appendChild(pic(k, 'orig', 160));
      el.insertAdjacentHTML('beforeend', '<div class="pp-tag"></div><div class="cname">' + F.name + '</div><div class="cstats">❤ ' + F.hp + ' · 🛡 ' + F.def + '% · 💥 ×' + F.impact + '</div><div class="ctrait">' + F.role + ' — ' + F.tdesc + '</div>');
      el.onclick = function () { choose(k); };
      r.appendChild(el);
    });
    document.querySelectorAll('.tslot').forEach(function (b) { b.onclick = function () { openPop(+b.dataset.i); }; });
    $('pickpop').onclick = function (e) { if (e.target === $('pickpop')) closePop(); };
    $('pp-clear').onclick = function () { app.slots[popSlot] = null; syncPicks(); closePop(); renderTeam(); };
  }
  function openPop(i) {
    popSlot = i;
    $('pp-h').textContent = 'CHOOSE A FROG · SLOT ' + (i + 1);
    document.querySelectorAll('.ppf').forEach(function (el) {
      var at = app.slots.indexOf(el.dataset.kind);
      el.classList.toggle('sel', at === i);
      el.querySelector('.pp-tag').textContent = at < 0 ? '' : at === i ? 'IN THIS SLOT' : 'IN SLOT ' + (at + 1) + ' → moves here';
      el.classList.toggle('other', at >= 0 && at !== i);
    });
    $('pp-clear').style.display = app.slots[i] ? '' : 'none';
    $('pickpop').classList.remove('hidden');
  }
  function closePop() { $('pickpop').classList.add('hidden'); popSlot = -1; }
  function choose(k) {
    var i = popSlot; if (i < 0) return;
    var at = app.slots.indexOf(k);
    if (at >= 0 && at !== i) app.slots[at] = null; // была в другом слоте — тот пустеет
    app.slots[i] = k;
    syncPicks(); closePop(); renderTeam();
  }
  // Мини-превью перка (D-144): зацикленная сценка — синие свои, красные враги, жёлтая — прыгунья, что отскакивает от этой жабы
  function perkPreview(kind) {
    var D = 'dur="2.4s" repeatCount="indefinite"', frog = function (x, y, c, extra) { return '<circle cx="' + x + '" cy="' + y + '" r="7" fill="' + c + '" stroke="#0a0604" stroke-width="1.5">' + (extra || '') + '</circle>'; };
    var B = '#4aa3ff', E = '#ff5a4a', Y = '#ffd36a', hop = function (path, kt) { return '<circle r="5" fill="' + Y + '" stroke="#0a0604" stroke-width="1.5"><animateMotion ' + D + ' path="' + path + '" keyPoints="0;1;1" keyTimes="0;' + (kt || 0.7) + ';1" calcMode="linear"/></circle>'; };
    var s = '<svg class="s2-pv" viewBox="4 0 112 44" xmlns="http://www.w3.org/2000/svg">';
    var relayPath = 'M10,34 Q24,8 38,30 Q', burst = function (x, y, r, c, kt) { kt = kt || 0.7; return '<circle cx="' + x + '" cy="' + y + '" r="2" fill="none" stroke="' + c + '" stroke-width="3"><animate attributeName="r" values="0;0;' + r + '" keyTimes="0;' + kt + ';1" ' + D + '/><animate attributeName="opacity" values="0;1;0" keyTimes="0;' + kt + ';1" ' + D + '/></circle>'; };
    if (kind === 'spring') s += frog(38, 30, B) + '<path d="M10,34 Q24,8 38,30 Q74,-14 112,30" stroke="' + Y + '" stroke-dasharray="3 3" fill="none" opacity="0.6"/>' + hop('M10,34 Q24,8 38,30 Q74,-14 112,30') + '<text x="86" y="42" fill="' + Y + '" font-size="10" font-weight="900">×1.4</text>';
    else if (kind === 'bellows') s += frog(38, 30, B) + '<rect x="78" y="22" width="16" height="16" fill="#ff5a00" opacity="0.7"/>' + hop(relayPath + '62,0 86,30') + burst(86, 30, 20, '#ffe100') + burst(86, 30, 14, '#ff7a00') + '<text x="98" y="12" fill="' + Y + '" font-size="10" font-weight="900">×1.5</text>';
    else if (kind === 'spur') s += frog(38, 30, B) + frog(86, 30, E) + frog(72, 30, E, '<animate attributeName="cx" values="72;72;62" keyTimes="0;0.7;1" ' + D + '/>') + frog(100, 30, E, '<animate attributeName="cx" values="100;100;110" keyTimes="0;0.7;1" ' + D + '/>') + hop(relayPath + '62,0 86,26') + burst(86, 30, 14, Y) + burst(72, 30, 8, '#ff9a6a') + burst(100, 30, 8, '#ff9a6a') + '<text x="60" y="12" fill="' + Y + '" font-size="11" font-weight="900">×1.4</text>';
    else if (kind === 'cling') s += frog(38, 30, B) + '<text x="31" y="19" font-size="12" opacity="0">⚓<animate attributeName="opacity" values="0;0;1;1" keyTimes="0;0.3;0.36;1" ' + D + '/></text>' + hop(relayPath + '62,0 86,30', 0.55) + frog(104, 6, E, '<animate attributeName="cx" values="104;104;48;96" keyTimes="0;0.62;0.8;1" ' + D + '/><animate attributeName="cy" values="6;6;26;8" keyTimes="0;0.62;0.8;1" ' + D + '/>') + burst(46, 28, 12, Y, 0.8);
    return s + '</svg>';
  }
  function renderTeam() {
    var n = app.picks.length, ready = n === 3;
    $('pick-n').textContent = '🐸 ' + n + ' / 3 PICKED';
    $('btn-battle').classList.toggle('off', !ready);
    $('btn-battle').innerHTML = ready ? '<span>⚔</span> BATTLE' : '<span>🐸</span> PICK ' + (3 - n) + ' MORE';
    document.querySelectorAll('.tslot').forEach(function (b) {
      var k = app.slots[+b.dataset.i];
      if (b.dataset.k === (k || '')) return;
      b.dataset.k = k || ''; b.innerHTML = ''; b.classList.toggle('empty', !k);
      if (k) { b.appendChild(pic(k, 'orig', 180)); b.insertAdjacentHTML('beforeend', '<div class="cname">' + FB.FROGS[k].name + '</div>'); }
      else b.innerHTML = '<div class="plus">＋</div><div class="cname">TAP TO CHOOSE</div>';
      b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
    });
    document.querySelectorAll('.perkb').forEach(function (el) {
      var k = app.slots[+el.dataset.s], key = k || '';
      if (el.dataset.key === key) return;
      el.dataset.key = key; el.classList.toggle('on', !!k);
      if (!k) { el.innerHTML = '<div class="s2-empty">Pick a frog —<br>bounce off it for a bonus</div>'; return; }
      var P = FB.FROGS[k].perk, d = P.desc.replace(/^Bounce off it: /, '');
      el.innerHTML = '<div class="s2-h"><span class="s2-ic">' + P.icon + '</span><b>' + P.name + '</b></div><div class="s2-w">WHEN YOU BOUNCE OFF IT</div>' + perkPreview(k) + '<div class="s2-d">' + d.charAt(0).toUpperCase() + d.slice(1) + '</div>';
      el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    });
    requestAnimationFrame(drawArrows); setTimeout(drawArrows, 300);
  }
  // точка на краю прямоугольника по направлению к цели
  function edge(R, tx, ty) {
    var cx = R.x + R.w / 2, cy = R.y + R.h / 2, dx = tx - cx, dy = ty - cy;
    var k = Math.min(Math.abs(R.w / 2 / (dx || 1e-6)), Math.abs(R.h / 2 / (dy || 1e-6)));
    return { x: cx + dx * k, y: cy + dy * k };
  }
  // Зелёные стрелки (D-138, D-144): от блока перка к слоту его жабы
  function drawArrows() {
    var wrap = $('teamwrap'), svg = $('tarrows'); if (!wrap || app.screen !== 'team') return;
    var W = wrap.getBoundingClientRect(); svg.setAttribute('viewBox', '0 0 ' + W.width + ' ' + W.height);
    function rect(el) { var r = el.getBoundingClientRect(); return { x: r.left - W.left, y: r.top - W.top, w: r.width, h: r.height }; }
    var h = '<defs><marker id="ahg" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#7ddf6a"/></marker><marker id="ahd" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6a5a44"/></marker></defs>';
    document.querySelectorAll('.perkb').forEach(function (el) {
      var on = el.classList.contains('on'), B = rect(el), S = rect(document.querySelector('.tslot[data-i="' + el.dataset.s + '"]'));
      var sc = { x: S.x + S.w / 2, y: S.y + S.h / 2 }, bc = { x: B.x + B.w / 2, y: B.y + B.h / 2 };
      var a = edge(B, sc.x, sc.y), b = edge(S, bc.x, bc.y);
      h += '<path d="M' + a.x + ',' + a.y + ' L' + b.x + ',' + b.y + '" stroke="' + (on ? '#7ddf6a' : '#6a5a44') + '" stroke-width="' + (on ? 3 : 2) + '" fill="none" stroke-linecap="round"' + (on ? '' : ' stroke-dasharray="5 6"') + ' marker-end="url(#' + (on ? 'ahg' : 'ahd') + ')"/>';
    });
    svg.innerHTML = h;
  }
  window.addEventListener('resize', function () { if (app.screen === 'team') drawArrows(); });

  // ---------- ALCHEMY ----------
  // Элемент = глагол, реакция = сумма глаголов (D-143)
  function renderAlchemy() {
    var on = FB.ELEMENT_ORDER;
    $('verbs').innerHTML = FB.ELEMENT_ORDER.map(function (k) {
      var E = FB.ELEMENTS[k];
      return '<div class="vb' + (on.indexOf(k) >= 0 ? ' on' : '') + '" style="--c:' + E.color + '"><span class="vb-i">' + E.icon + '</span><b>' + E.name + '</b><em>' + E.vi + ' ' + E.verb + '</em></div>';
    }).join('');
    $('reactions').innerHTML = Object.keys(FB.REACTIONS).map(function (key) {
      var Rx = FB.REACTIONS[key], els = key.split('+'), open = els.every(function (e) { return on.indexOf(e) >= 0; });
      return '<div class="rx' + (open ? ' on' : '') + '"><div class="rf">' + els.map(function (e) { return FB.ELEMENTS[e].icon; }).join(' + ') + ' <span class="rv">= ' + FB.reactionVerbs(key) + '</span></div><div class="rn">' + Rx.name + (Rx.terrain ? ' <small>TERRAIN</small>' : '') + '</div><div class="rd">' + Rx.desc + '</div></div>';
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
  $('btn-battle').onclick = function () { if (app.picks.length === 3) startBattle(); else { var pn = $('pick-n'); pn.classList.remove('shake'); void pn.offsetWidth; pn.classList.add('shake'); } }; // в бой — только с тремя (D-135)
  $('btn-help').onclick = $('m-help').onclick = function () { $('help').classList.remove('hidden'); };
  $('h-close').onclick = function () { $('help').classList.add('hidden'); };
  $('btn-menu').onclick = function () { app.paused = true; $('menu').classList.remove('hidden'); };
  $('m-resume').onclick = function () { app.paused = false; $('menu').classList.add('hidden'); };
  $('m-speed').onclick = function () { app.speed = app.speed === 1 ? 2 : 1; $('m-speed').textContent = 'Animation speed: x' + app.speed; };
  function tipsLabel() { $('m-tips').textContent = tips.off ? 'Tips: OFF — tap to replay them' : 'Tips: ON'; }
  $('m-tips').onclick = function () { // подсказки (D-154): выключить или показать все заново
    tips.off = !tips.off; store.set('tipsOff', tips.off);
    if (!tips.off) { tips.seen = {}; store.set('tipsSeen', {}); }
    app.tipsMatch = !tips.off && !app.auto; tipsLabel(); log('tips', tips.off ? 'off' : 'replay');
  };
  tipsLabel();
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
    // матч с подсказками (D-154): пока не показаны главные подсказки; в нём бот мажет сильнее
    app.tipsMatch = !app.auto && !tips.off && FB.TIP_CORE.some(function (id) { return !tips.seen[id]; });
    var k = app.tipsMatch ? T.firstBotNoise : 1;
    T.botAimNoiseDeg = BOT_NOISE.deg * k; T.botAimNoisePow = BOT_NOISE.pow * k;
    app.s = Sim.createMatch(app.picks, botTeam, seed);
    var ev = Sim.startMatch(app.s);
    app.shown = Sim.clone(app.s); app.disp = {}; app.queue = []; app.cur = null; app.sel = -1; app.aimCmd = null; app.timerTurn = -1;
    // стартовые баки наливаются на глазах (D-133, D-141): налив первого хода — настоящие события симуляции, на экране баки пока пусты
    ev.forEach(function (e) { if (e.t === 'tick') { var f = app.shown.frogs[e.id]; f.ch = 0; f.el = null; } });
    app.s.frogs.forEach(function (f) { app.disp[f.id] = { x: f.x, y: f.y, z: 0, facing: f.side === 0 ? 0 : Math.PI, pose: 'idle', poseT: 0, alive: true, flash: 0, squash: 0 }; });
    R.resetFrogs();
    showScreen('battle');
    R.focus(AR.x0 + AR.w / 2, AR.y0 + AR.h * 0.62, 0.62);
    log('battle', { seed: seed, me: app.picks, bot: botTeam, tips: app.tipsMatch });
    buildCards(); nextKey = '';
    app.busy = true;
    var go = function () { if (app.s && app.screen === 'battle') { app.queue = ev; app.playing = true; } };
    if (app.auto) setTimeout(go, 400);
    else if (app.tipsMatch && !tips.seen.goal) { // первый матч: цель показываем на самой фляге врага, а не окном
      var fk = AR.flasks[1]; R.focus(fk.x, fk.y + 220, 0.55);
      setTimeout(function () { coach('goal', { world: { x: fk.x, y: fk.y, r: Sim.flaskR(app.s) + 30 } }, go); }, 650);
    } else showTip(go);
  }

  function showTip(done) {
    var box = $('tip'), fin = false;
    // цель матча на стартовом окне (D-136)
    $('tip-t').innerHTML = '<p class="tip-goal">Land any frog on the <b>enemy Base Flask</b> at the far end — and you win. Don’t let the enemy reach yours.</p>' +
      '<p>Land on <b>your own frog</b> to jump again. Every jump burns 1 elixir; an empty frog stands still until ⟲ brings it home to refuel.</p>';
    box.classList.remove('hidden');
    var bar = box.querySelector('.tip-bar i'); bar.style.transition = 'none'; bar.style.width = '100%';
    requestAnimationFrame(function () { bar.style.transition = 'width ' + T.tipSec + 's linear'; bar.style.width = '0%'; });
    function close() { if (fin) return; fin = true; clearTimeout(app.tipT); box.classList.add('hidden'); box.onclick = null; done(); }
    box.onclick = close; app.tipT = setTimeout(close, T.tipSec * 1000);
  }

  function myTurn() { return app.s && app.s.phase === 'play' && app.s.turnSide === 0 && !app.auto; }
  function canAimNow() { return myTurn() && !app.busy && !app.paused && !app.playing && !app.coach; }
  function mineSel() { var f = app.s && app.s.frogs[app.sel]; return f && f.side === 0 ? f : null; }

  function nextTurn() {
    var s = app.s;
    if (!s || app.screen !== 'battle') return;
    if (s.phase !== 'play') return onMatchOver();
    if (app.timerTurn !== s.turn) { app.timerTurn = s.turn; app.turnLeft = T.turnTimeSec; } // таймер — один на ход (D-110); отзыв его не сбрасывает
    if (s.turnSide === 0 && !app.auto) {
      var c = myActable();
      if (!s.pending && (!mineSel() || !Sim.canAct(s, mineSel()))) app.sel = c.length ? c[0].id : (mineSel() ? app.sel : -1);
      updateThreat();
      refreshHud(true);
      if (!s.pending) tipCheck();
    } else { R.setThreat(null); botTurn(); }
  }

  function botTurn() {
    var s = app.s, side = s.turnSide;
    app.busy = true; refreshHud(true);
    app.botTimer = setTimeout(function () {
      if (app.screen !== 'battle' || app.s !== s || s.phase !== 'play') return;
      if (app.paused) return botTurn();
      var cmd = AI.choose(s, side, botRng);
      var f = cmd.frog !== undefined ? s.frogs[cmd.frog] : null;
      if (f && cmd.dx !== undefined) { app.sel = cmd.frog; R.focus(f.x, f.y); showAim(f, cmd); }
      app.botTimer = setTimeout(function () { R.setAim(null); execute(cmd); }, (f && cmd.dx !== undefined ? T.botAimShow * 1000 : 150) / app.speed); // темп (D-149): паузы бота короче
    }, (s.pending ? 0.15 : T.botDelay) * 1000 / app.speed);
  }

  function execute(cmd) {
    app.dmgPop = {};
    var res = Sim.apply(app.s, cmd);
    log('cmd', { cmd: { frog: cmd.frog, mode: cmd.mode || 'jump', dx: cmd.dx && Math.round(cmd.dx), dy: cmd.dy && Math.round(cmd.dy) }, ok: res.ok, why: res.why });
    app.aimCmd = null; R.setAim(null); notice(null); R.setThreat(null);
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
    R.setThreat(null); notice(null); hideGhost();
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
        d.appendChild(pic(f.kind, f.el || 'orig', 120));
        d.insertAdjacentHTML('beforeend', FB.FROGS[f.kind].name);
        box.appendChild(d);
      });
    });
    $('res-sub').innerHTML = s.why === 'flask' ? (w === 0 ? 'Your frog landed on the enemy Base Flask on turn ' : 'An enemy frog landed on your Base Flask on turn ') + s.turn + '.' : 'Turn limit: the side closer to the enemy flask wins.';
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
        e.segs.forEach(function (sg) { if (sg.over !== undefined) { var op = Sim.cellCenter(sg.over); R.text(op.x, op.y, '⤴ OVER THE WALL<br><small>jump from an ally’s back</small>', 'gold'); } }); // перелёт колонны видно (D-155)
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
      case 'relay':
        if (e.combo) { var al = D(e.ally); if (!d.hidden) R.chargeFx({ x: al.x, y: al.y }, { x: d.x, y: d.y }, ELC(e.els[0]), ELC(e.els[1])); } // комбо-заряд от союзника (D-127)
        if (e.perk === 'cling') SF(e.ally).anchor = 1;
        R.text(d.x, d.y, (e.combo ? '⚗ COMBO: ' + FB.REACTIONS[e.combo].name + '<br>' : '') + 'RELAY ' + e.n + (e.perk ? '<br><small>' + FB.FROGS[e.perk].perk.icon + ' ' + FB.FROGS[e.perk].perk.name + '</small>' : ''), 'charge'); R.ring(d.x, d.y, 70, SIDE_C[SF(e.id).side]); dur = 0.3; break; // перк жабы, от которой отскочили (D-144)
      case 'impact': {
        var atk = D(e.by);
        if (atk.landAt) atk.hop = { t: 0, dur: 0.42, z0: atk.z, from: { x: atk.x, y: atk.y }, to: atk.landAt };
        atk.landAt = null;
        D(e.id).flash = 1; R.flash(e.x, e.y, 120, '#fff0c0'); R.shake(12); // без брызг краски: краска — только в клетках (D-120)
        dur = 0.12; break;
      }
      case 'hit': {
        var hf = SF(e.id); hf.hp = Math.max(0, hf.hp - e.dmg); d.flash = 1;
        var cls = { slam: 'slam', burn: 'fire', fire: 'fire', plasma: 'fire', ice: 'ice' }[e.src] || 'dmg';
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
      case 'anchored': d.hitT = T.hitAnimSec * 0.6; d.hitPow = 0.5; R.text(d.x, d.y, e.why === 'ice' ? '🧊 FROZEN SOLID' : '⚓ ANCHORED', 'gold'); dur = 0.2; break;
      case 'unanchor': SF(e.id).anchor = 0; break;
      case 'burn': R.flash(d.x, d.y, 90, '#ff7a2a'); R.text(d.x, d.y - 30, '🔥 BURN', 'fire'); dur = 0.2; break; // горящее поле Wildfire (D-143)
      case 'blocked': { var bp = Sim.cellCenter(e.i); R.ring(bp.x, bp.y, 70, '#ff6040', 0.6); R.text(bp.x, bp.y, '✋ PATH MUST STAY OPEN', 'dmg'); dur = 0.3; break; } // правило Quoridor (D-145)
      case 'overload': [0, 1].forEach(function (sd) { var q = AR.flasks[sd]; R.ring(q.x, q.y, e.r * 1.2, '#ffd040', 0.8); }); if (e.first) banner('⚠ FLASK OVERLOAD', 'gold', 'Both flask zones grow every turn'); dur = e.first ? 0.6 : 0.15; break; // перегрузка фляг (D-149)
      case 'death': R.flash(e.x, e.y, 160, '#ffffff'); R.text(e.x, e.y, 'KO!', 'ko'); R.shake(14); d.flash = 1; dur = 0.5; break;
      case 'home': { // домой: смерть — исчезает и появляется на базе; «⟲ Домой» — улетает дугой (D-141)
        var hf2 = SF(e.id), from = e.from, to = e.to, far = Math.hypot(to.x - from.x, to.y - from.y), sf2 = app.s.frogs[e.id];
        if (app.s.rules.economy) { hf2.ch = 0; hf2.el = null; } else { hf2.ch = T.tank; hf2.el = sf2.el; } // без экономики элемент и бак остаются
        hf2.anchor = 0; hf2.frozen = 0; if (e.why === 'death') hf2.hp = hf2.maxHp;
        if (e.why === 'death') { d.x = to.x; d.y = to.y; d.z = 0; hf2.x = to.x; hf2.y = to.y; R.ring(to.x, to.y, 80, SIDE_C[hf2.side]); dur = 0.25; break; }
        dur = 0.35 + far / 3200; R.text(from.x, from.y, '⟲ HOME', 'gold');
        upd = function (u) { var k = u * u * (3 - 2 * u); d.x = from.x + (to.x - from.x) * k; d.y = from.y + (to.y - from.y) * k; d.z = Math.sin(Math.PI * u) * Math.min(160, 40 + far * 0.08); d.pose = 'air'; faceDir(d, to.x - from.x, to.y - from.y); };
        end = function () { d.z = 0; setPose(d, 'land'); hf2.x = to.x; hf2.y = to.y; R.ring(to.x, to.y, 70, SIDE_C[hf2.side]); };
        break;
      }
      case 'recall': dur = 0.05; break;
      case 'cell': { var cl = app.shown.cells[e.i]; cl.el = e.el; cl.t = e.tt; cl.side = e.side; var cp = Sim.cellCenter(e.i); R.cellBurst(cp.x, cp.y, e.el, e.tt); dur = 0.04; break; } // всплеск смены клетки (D-129)
      case 'reaction':
        if (e.combo) { var ce = e.key.split('+'); R.comboFx(e.x, e.y, ELC(ce[0]), ELC(ce[1])); } // комбо — двойная спираль цветов (D-129)
        R.reactionFx(e.key, e.x, e.y, { 'fire+lightning': T.cell * (e.amp ? 2.5 : 1.5), 'fire+poison': T.cell * (e.amp ? 2.5 : 1.6), 'lightning+poison': T.vortexR, 'fire+ice': T.cell * 1.4, 'ice+poison': T.cell * 0.8, 'ice+lightning': T.cell * 1.3 }[e.key] || 150);
        R.text(e.x, e.y, (e.combo ? '⚗ ' : '') + e.name + '<br><small>' + FB.reactionVerbs(e.key) + (e.amp ? ' · 🌀 ×' + T.ampMul : '') + '</small>', 'rx'); R.shake(8); dur = 0.45; break; // реакция = сумма глаголов (D-143)
      case 'frozen': SF(e.id).frozen = 1; R.freezeFx(d.x, d.y); R.text(d.x, d.y, '🧊 FROZEN', 'ice'); R.shake(6); dur = 0.3; break; // Ice Blast (D-143)
      case 'thaw': SF(e.id).frozen = 0; R.text(d.x, d.y, 'THAW', 'ice'); dur = 0.05; break;
      case 'jet': { var jp = Sim.cellCenter(e.i); R.reactionFx('ice+lightning', jp.x, jp.y, 70); R.text(jp.x, jp.y, e.side === SF(e.id).side ? '⇧ ICE SLIDE' : '⇩ SLID BACK', 'ice'); dur = 0.2; break; } // Ice Slide (D-143)
      case 'spend': SF(e.id).ch = e.ch; if (e.empty) { R.emptyFx(d.x, d.y); R.text(d.x, d.y, '🪫 EMPTY', 'dmg'); dur = 0.3; } break; // бак кончился — пружина спущена, жаба оседает (D-153)
      case 'tick': { // зарядка на базе (D-132): струйка эликсира из своей фляги в резервуар; струйки всех жаб летят разом (темп, D-149)
        var tf = SF(e.id), fk2 = AR.flasks[tf.side], col = ELC(e.el), dd = d;
        tf.el = e.el;
        if (e.fresh) tf.ch = 0;
        R.pour({ x: fk2.x, y: fk2.y }, { x: d.x, y: d.y }, col, 0.28, function () {
          tf.ch = e.ch; dd.fillT = 1; dd.fillK = e.ch - 1; dd.squash = 0.25; dd.flash = Math.max(dd.flash || 0, 0.3);
          R.ring(dd.x, dd.y, 70, col, 0.5);
          if (!dd.hidden) R.text(dd.x, dd.y, e.fresh ? FB.ELEMENTS[e.el].icon + ' NEW TANK' : '+1 ' + FB.ELEMENTS[e.el].icon, 'charge');
        });
        dur = app.queue.length && app.queue[0].t === 'tick' ? 0.06 : 0.34; break;
      }
      case 'flask': { // жаба ныряет с края зоны в саму колбу (D-155), колба взрывается, эликсир разливается (D-137)
        var fk = AR.flasks[1 - e.side], f0 = e.from || fk, far = Math.hypot(fk.x - f0.x, fk.y - f0.y), burst = false, kh = far > 20 ? 0.4 + far / 1500 : 0;
        var boom = function () { if (burst) return; burst = true; d.z = 0; d.squash = 0.3; R.flaskBurst(1 - e.side); R.text(fk.x, fk.y, 'FLASK SHATTERED!', 'ko'); };
        dur = kh + 1.3;
        upd = function (u) {
          var t = u * dur;
          if (t >= kh) return boom();
          var q = t / kh; d.x = f0.x + (fk.x - f0.x) * q; d.y = f0.y + (fk.y - f0.y) * q; d.z = Math.sin(Math.PI * q) * Math.min(110, 40 + far * 0.25);
          d.pose = q > 0.55 ? 'fall' : 'air'; faceDir(d, fk.x - f0.x, fk.y - f0.y); if (!cam().user) R.focus(d.x, d.y);
        };
        if (!kh) boom();
        break;
      }
      case 'turn': app.shown.turnSide = e.side; app.shown.turn = e.turn; app.shown.recalls = 0; frameSide(e.side); banner(e.side === 0 ? 'YOUR TURN' : 'ENEMY TURN', e.side === 0 ? 'p' : 'b', 'Turn ' + e.turn); dur = 0.3; break;
      case 'label': if (d) R.text(d.x, d.y, e.text, 'gold'); dur = 0.25; break;
      case 'skip': if (d) R.text(d.x, d.y, 'PASS', 'dmg'); dur = 0.25; break;
      case 'over': dur = 0.3; break;
    }
    return dur > 0 ? { e: e, t: 0, dur: dur, upd: upd, end: end } : (end && end(), null);
  }

  // Перелёт камеры на новый ход (D-131): в кадре все жабы стороны, которая ходит (итоговые позиции — после возвратов домой)
  function frameSide(side) {
    var pts = app.s.frogs.filter(function (f) { return f.side === side && f.alive; }).map(function (f) { return { x: f.x, y: f.y }; });
    var top = document.querySelector('#hud .top'), bot = $('bottom');
    R.frameAll(pts, top ? top.getBoundingClientRect().bottom + 30 : 120, bot ? bot.offsetHeight + 10 : 200);
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

  function hiddenNow() { return false; } // сокрытия нет: пар заменён на Steam Jet (D-123)

  // ---------- прицел и превью (§19: всё видно по траектории) ----------
  function showAim(f, cmd) {
    var pv = Sim.preview(app.s, cmd, f.side === 0 ? 0 : undefined), econ = app.s.rules.economy;
    var a = { segs: [], r: f.r, color: ELC(f.el), labels: [], pushes: [], cells: [] };
    var frozen = [], combo = null, perk = null, dmg = {}, deaths = {}, info = { title: (f.el ? FB.ELEMENTS[f.el].icon + ' ' : '') + FB.FROGS[f.kind].name, lines: [] }, reacted = null, relayTo = -1, won = false, painted = [];
    var start = {}; app.s.frogs.forEach(function (x) { start[x.id] = { x: x.x, y: x.y }; });
    pv.events.forEach(function (e) {
      if (e.t === 'jump') {
        a.segs = a.segs.concat(e.segs);
        if (e.segs.some(function (sg) { return sg.hit === 'column'; })) info.lines.push('✋ The column blocks the jump — from an ally’s back you fly over');
        e.segs.forEach(function (sg) { if (sg.over === undefined) return; var op = Sim.cellCenter(sg.over); a.labels.push({ x: op.x, y: op.y, text: '⤴ OVER THE WALL', cls: 'charge', h: 130 }); info.lines.push('⤴ From an ally’s back it flies over the column'); });
      }
      if (e.t === 'land' && e.id === f.id) a.land = { x: e.x, y: e.y };
      if (e.t === 'hit') dmg[e.id] = (dmg[e.id] || 0) + e.dmg;
      if (e.t === 'death') deaths[e.id] = true;
      if (e.t === 'push' && !e.soft) a.pushes.push(e);
      if (e.t === 'relay') { relayTo = e.ally; perk = e.perk; if (e.combo) combo = e; }
      if (e.t === 'reaction') reacted = e;
      if (e.t === 'cell') painted.push(e);
      if (e.t === 'flask') won = true;
      if (e.t === 'anchored') info.lines.push(e.why === 'ice' ? 'Frozen solid — no knockback' : '⚓ Anchored — no knockback');
      if (e.t === 'jet') info.lines.push(e.side === f.side ? '⇧ Ice slide: 2 cells forward' : '⇩ Enemy ice slide: thrown back');
      if (e.t === 'blocked') info.lines.push('✋ A column can’t close the last path');
      if (e.t === 'burn') info.lines.push('🔥 Burning field: −' + T.blazeDmg);
      if (e.t === 'frozen') frozen.push(e.id);
    });
    if (!a.land && a.segs.length) { var ls = a.segs[a.segs.length - 1]; a.land = ls.to; }
    if (!a.land) return;
    var fin = pv.state.frogs[f.id];
    if (relayTo >= 0) { // эстафета: кольцо вокруг своей жабы и плашка; перк той, от кого отскочили (D-144)
      var ap = start[relayTo], ally = app.s.frogs[relayTo], P = perk && FB.FROGS[perk].perk;
      a.ally = { x: ap.x, y: ap.y, r: ally.r, color: '#7fd0ff' };
      a.color = '#7fd0ff';
      a.labels.push({ x: ap.x, y: ap.y, text: 'RELAY → jump again' + (P ? '<br>' + P.icon + ' ' + P.name : ''), cls: 'charge', h: 90 });
      info.title = '↗ RELAY'; info.lines.unshift('Jump again from ' + FB.FROGS[ally.kind].name);
      if (P) info.lines.push(P.icon + ' ' + P.name + ': ' + P.desc.replace(/^Bounce off it: /, ''));
      if (combo) { // комбо через союзника (D-143): реакция двух элементов там, где кончится цепочка
        var cn = FB.REACTIONS[combo.combo].name, ci2 = FB.ELEMENTS[combo.els[0]].icon + ' + ' + FB.ELEMENTS[combo.els[1]].icon;
        a.color = RXC[combo.combo] || a.color; a.ally.color = a.color; a.labels[a.labels.length - 1].text = '⚗ COMBO ' + ci2 + '<br>' + cn;
        info.title = '⚗ COMBO'; info.lines.unshift(ci2 + ' → ' + cn + ' where the chain ends');
        if (f.side === 0) notice('⚗ RELAY + COMBO', ci2 + ' → <b>' + cn + '</b>', FB.reactionVerbs(combo.combo) + ' · fires where this chain ends', a.color);
      } else if (f.side === 0) notice('↗ RELAY', 'Land on <b>' + FB.FROGS[ally.kind].name + '</b> → jump again', P ? P.icon + ' ' + P.name + ' · ' + P.desc.replace(/^Bounce off it: /, '') : 'Each ally once per activation', a.color);
    } else {
      notice(null);
      var ci = Sim.cellIdx(fin.x, fin.y);
      if (won) { a.color = '#ffd040'; a.labels.push({ x: a.land.x, y: a.land.y, text: '★ FLASK — WIN!', cls: 'rx', h: 80 }); info.title = '★ VICTORY'; info.lines.unshift('Lands on the enemy Base Flask'); }
      else if (reacted) {
        a.color = RXC[reacted.key] || '#ffe080';
        a.labels.push({ x: a.land.x, y: a.land.y, text: reacted.name + '<br><small>' + FB.reactionVerbs(reacted.key) + '</small>', cls: 'rx', h: 70 });
        info.title = reacted.name; info.lines.unshift(FB.REACTIONS[reacted.key].desc);
        painted.forEach(function (c) { a.cells.push({ i: c.i, color: c.tt ? FB.TERRAIN[c.tt].color : (c.el ? ELC(c.el) : '#ffffff'), op: 0.3 }); });
        if (reacted.key === 'fire+lightning') a.cells.push({ i: reacted.i, color: a.color, op: 0.35 });
      } else if (Sim.cellBase(ci) >= 0) info.lines.push('Base cell: never painted');
      else if (f.el) {
        painted.forEach(function (c) { a.cells.push({ i: c.i, color: ELC(c.el), op: 0.28 }); });
        var cl = app.s.cells[ci];
        if (cl.el === f.el) info.lines.push('Same element: no reaction');
        else if (cl.t) info.lines.push(FB.TERRAIN[cl.t].name + ' replaced by ' + FB.ELEMENTS[f.el].name);
        else if (painted.length) info.lines.push('Paints the cell ' + FB.ELEMENTS[f.el].icon + ' ' + FB.ELEMENTS[f.el].vi + ' ' + FB.ELEMENTS[f.el].verb);
      }
      if (!a.cells.length && !won) a.cells.push({ i: ci, color: a.color, op: 0.14 });
      var left = fin.ch;
      if (!won && econ && !(left > 0 || Sim.onBase(fin))) { // последний эликсир: до прыжка видно, что жаба встанет (D-153)
        a.labels.push({ x: a.land.x, y: a.land.y, text: '🪫 LAST ELIXIR — it stops here', cls: 'dmg', h: 115 });
        info.lines.push('Last elixir: after this jump the frog stops · ⟲ brings it home to refuel');
      } else if (!won && econ) info.lines.push('Elixir left: ' + left);
    }
    if (pv.pending && pv.pending.frog === f.id) { // бледным — куда отскочит сама, если ход кончится
      var ac = Sim.clone(pv.state), ar = Sim.apply(ac, { frog: f.id, mode: 'end' }, { noEnd: true });
      ar.events.forEach(function (e) { if (e.t === 'jump') a.autoSegs = e.segs; });
    }
    frozen.forEach(function (id) { var p = start[id]; a.labels.push({ x: p.x, y: p.y, text: '🧊 FREEZE — skips a turn', cls: 'ice', h: 80 }); });
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
      if (id >= 0) { mode = 'aim'; aimFrog = id; app.sel = id; D(id).pose = 'aim'; R.setThreat(null); notice(null); hideGhost(); refreshHud(true); log('aim.start', { frog: id }); return; }
      var eid = app.s.pending ? -1 : frogAt(p.x, p.y, myFrogs().filter(function (f) { return Sim.isEmpty(app.s, f); }));
      if (eid >= 0) { emptyNudge(eid); mode = null; return; } // пустую не натянуть: качает головой и объясняет почему (D-153)
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
    if (mode === 'pan' && downAt && Math.hypot(p.x - downAt.x, p.y - downAt.y) < 8 && app.s) {
      var id = canAimNow() && !app.s.pending ? frogAt(p.x, p.y, myFrogs()) : -1;
      if (id >= 0) { app.sel = id; refreshHud(true); }
      else if (frogAt(p.x, p.y, app.s.frogs) < 0) cellLegend(p.x, p.y); // тап по клетке — что она делает (D-147)
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
    var dx = f.x - w.x, dy = f.y - w.y, l = Math.hypot(dx, dy) || 1, range = Sim.rangeFor(app.s, f, 'jump');
    app.aimCmd = { frog: f.id, dx: dx / l * range * pow, dy: dy / l * range * pow, mode: 'jump' };
    // доводка: на жабу (эстафета/удар) или на центр фляги врага, если прицел рядом
    var tx = f.x + app.aimCmd.dx, ty = f.y + app.aimCmd.dy, snap = null, sd = 1e9, act = app.s.act;
    app.s.frogs.forEach(function (o) {
      if (!o.alive || o.id === f.id || (o.side !== 0 && Sim.hiddenFrom(app.s, 0, o)) || (o.side === 0 && act && act.used[o.id])) return;
      var dd = Math.hypot(o.x - tx, o.y - ty), lim = o.r + f.r * 0.6 + 26;
      if (dd < lim && dd < sd && Math.hypot(o.x - f.x, o.y - f.y) <= range) { sd = dd; snap = o; }
    });
    var fk = AR.flasks[1];
    if (!snap && Math.hypot(fk.x - tx, fk.y - ty) < Sim.flaskR(app.s) + 20 && Math.hypot(fk.x - f.x, fk.y - f.y) <= range) snap = fk;
    if (snap) { app.aimCmd.dx = snap.x - f.x; app.aimCmd.dy = snap.y - f.y; }
    showAim(f, app.aimCmd);
  }
  function restPose(id) { var P = app.s && app.s.pending; return P && P.frog === id ? 'perch' : 'idle'; }
  function cancelAim() { app.aimCmd = null; R.setAim(null); notice(null); if (aimFrog >= 0 && D(aimFrog)) D(aimFrog).pose = restPose(aimFrog); aimFrog = -1; if (canAimNow()) updateThreat(); refreshHud(true); }

  // Угрозы на своём ходу (D-146): круги, куда враг дотянется следующим ходом; «⚠ CHECK», если он достаёт до нашей фляги; наш путь к фляге врага
  function updateThreat() {
    var s = app.s;
    if (!s || s.phase !== 'play' || s.turnSide !== 0 || s.pending || app.auto) { R.setThreat(null); return; }
    var foe = Sim.reach(s, 1, true), mine = Sim.reach(s, 0, false), seen = {}, rings = [];
    foe.rings.forEach(function (r) { var k = Math.round(r.x) + ':' + Math.round(r.y) + ':' + r.r; if (!seen[k]) { seen[k] = 1; rings.push(r); } });
    R.setThreat({ rings: rings, foe: foe.win, mine: mine.win });
    app.check = !!foe.win;
    if (mine.win) notice('★ ROUTE TO THE FLASK', 'Your frogs can reach <b>the enemy flask</b>', 'Follow the gold dots — check the arc before you release', '#ffd040');
    else if (foe.win) notice('⚠ CHECK', 'The enemy reaches <b>your flask</b> next turn', 'Red dots — its route. Hit, freeze or wall it off', '#ff4a3a');
    else notice(null);
  }
  // Легенда клетки по тапу (D-147): что это за клетка и что она делает
  var legendT = 0;
  function cellLegend(sx, sy) {
    var w = R.toWorld(sx, sy, 0), s = app.s; if (!w || !s) return;
    if (w.x < AR.x0 || w.x > AR.x0 + AR.w || w.y < AR.y0 || w.y > AR.y0 + AR.h) return;
    var i = Sim.cellIdx(w.x, w.y), cl = s.cells[i], base = Sim.cellBase(i), fk = AR.flasks[1], own = AR.flasks[0], t, m, sub, c;
    if (Math.hypot(w.x - fk.x, w.y - fk.y) < Sim.flaskR(s)) { t = '⚗ ENEMY FLASK'; m = 'Land here to <b>win</b>'; sub = (s.rules.economy ? 'Only a frog with elixir breaks it · ' : '') + 'the zone grows from turn ' + T.overloadTurn; c = '#ffd040'; }
    else if (Math.hypot(w.x - own.x, w.y - own.y) < Sim.flaskR(s)) { t = '⚗ YOUR FLASK'; m = 'Guard it'; sub = 'An enemy frog landing here wins'; c = '#4aa3ff'; }
    else if (base >= 0) { t = base === 0 ? 'YOUR BASE' : 'ENEMY BASE'; m = 'Never painted'; sub = s.rules.economy ? 'A frog here gets +1 elixir every turn, up to ' + T.tank : 'Frogs start here'; c = base === 0 ? '#4aa3ff' : '#ff5a4a'; }
    else if (cl.t) { var Tt = FB.TERRAIN[cl.t]; t = Tt.icon + ' ' + Tt.name; m = cl.side === 0 ? 'Yours' : 'Enemy'; sub = Tt.tip; c = Tt.color; }
    else if (cl.el) { var E = FB.ELEMENTS[cl.el]; t = E.icon + ' ' + E.name + ' CELL'; m = E.vi + ' ' + E.verb; sub = 'Land here with another element → reaction (see ALCHEMY)'; c = E.color; }
    else { t = 'EMPTY CELL'; m = 'Paint it'; sub = 'Your final landing paints it with your element'; c = '#d8c8a8'; }
    notice(t, m, sub, c);
    clearTimeout(legendT); legendT = setTimeout(function () { if (app.aimCmd) return; if (canAimNow()) updateThreat(); else notice(null); }, 2600);
    log('legend', { i: i });
  }

  $('btn-skip').onclick = function () {
    if (!canAimNow()) return;
    var P = app.s.pending;
    if (P) return execute({ frog: P.frog, mode: 'end' });
    execute({ mode: 'skip' });
  };
  // «⟲ Домой» (D-141): кнопка на карточке своей жабы; бесплатно, до активации, без лимита «раз в ход»
  function recall(id) {
    var f = app.s && app.s.frogs[id];
    if (!canAimNow() || !f || !Sim.canRecall(app.s, f) || Sim.onBase(f)) return;
    log('recall', { frog: id });
    execute({ frog: id, mode: 'recall' });
  }

  // Пустую жабу не натянуть (D-153): она качается «нет», над ней NO ELIXIR, а кнопка ⟲ на её карточке подпрыгивает
  function emptyNudge(id) {
    var d = D(id); d.hitT = T.hitAnimSec * 0.5; d.hitPow = 0.35;
    R.text(d.x, d.y, '🪫 NO ELIXIR', 'dmg');
    notice('🪫 EMPTY TANK', 'This frog can’t jump', 'Its spring is unwound. Tap its card below: home + refuel at once · or bounce off it', '#c8c0b4');
    var c = $('fc-' + id);
    if (c) { c.classList.remove('nudge'); void c.offsetWidth; c.classList.add('nudge'); }
    clearTimeout(legendT); legendT = setTimeout(function () { if (app.aimCmd) return; if (canAimNow()) updateThreat(); else notice(null); }, 2600);
    log('empty.nudge', { frog: id });
  }

  // ---------- подсказки первого матча (D-154) ----------
  // Всплывают в начале своего хода по ситуации на поле, по одной за ход; пока подсказка открыта, игра стоит.
  // Кольцо показывает, о чём речь (жаба, клетка, фляга), или подсвечивается элемент интерфейса.
  var coachDone = null, coachFocus = null;
  function coach(id, focus, done) {
    var P = FB.TIPS[id]; if (!P) { if (done) done(); return; }
    tips.seen[id] = 1; store.set('tipsSeen', tips.seen);
    app.coach = id; coachDone = done || null; coachFocus = focus || {};
    var box = $('coach'), core = FB.TIP_CORE.indexOf(id) >= 0;
    box.querySelector('.co-ic').textContent = P.icon;
    box.querySelector('.co-t').textContent = P.title;
    box.querySelector('.co-x').innerHTML = P.text;
    box.querySelector('.co-n').textContent = core ? 'TIP ' + FB.TIP_CORE.filter(function (k) { return tips.seen[k]; }).length + ' / ' + FB.TIP_CORE.length : 'TIP';
    document.querySelectorAll('.coach-hi').forEach(function (e) { e.classList.remove('coach-hi'); });
    if (coachFocus.el) coachFocus.el.classList.add('coach-hi');
    var w = coachFocus.world, low = w ? R.toScreen(w.x, 0, w.y).y > cv.clientHeight * 0.5 : !!(coachFocus.el && coachFocus.el.getBoundingClientRect().top > innerHeight * 0.5);
    box.classList.toggle('top', low); // карточка — с другой стороны экрана от того, на что показывает
    box.classList.remove('hidden');
    placeCoachRing();
    log('tip', id);
  }
  function closeCoach() {
    if (!app.coach) return;
    app.coach = null; $('coach').classList.add('hidden'); $('coach-ring').classList.add('hidden');
    document.querySelectorAll('.coach-hi').forEach(function (e) { e.classList.remove('coach-hi'); });
    var d = coachDone; coachDone = null; coachFocus = null;
    if (d) return d();
    if (canAimNow()) { updateThreat(); refreshHud(true); }
  }
  $('coach-ok').onclick = closeCoach;
  $('coach-skip').onclick = function () { tips.off = true; store.set('tipsOff', true); app.tipsMatch = false; app.ghostFrog = -1; log('tips.off'); closeCoach(); };
  function placeCoachRing() { // кольцо вокруг того, о чём подсказка: позиция на поле → экран, каждый кадр (камера едет)
    var ring = $('coach-ring'), w = coachFocus && coachFocus.world;
    if (!app.coach || !w) { ring.classList.add('hidden'); return; }
    var p = R.toScreen(w.x, 0, w.y), q = R.toScreen(w.x + w.r, 0, w.y), r = Math.max(30, Math.abs(q.x - p.x));
    ring.style.transform = 'translate(' + (p.x - r) + 'px,' + (p.y - r) + 'px)'; ring.style.width = ring.style.height = 2 * r + 'px';
    ring.classList.remove('hidden');
  }
  // «Тяни назад»: призрачный палец над жабой, пока игрок впервые не прицелится
  function placeGhost() {
    var g = $('ghost'), f = app.ghostFrog >= 0 && app.s && app.s.frogs[app.ghostFrog];
    if (!f || app.coach || !canAimNow() || !Sim.canAct(app.s, f)) { g.classList.add('hidden'); return; }
    var d = D(f.id), p = R.toScreen(d.x, 0, d.y);
    g.style.transform = 'translate(' + (p.x - 18) + 'px,' + (p.y - 10) + 'px)'; g.classList.remove('hidden');
  }
  function hideGhost() { app.ghostFrog = -1; $('ghost').classList.add('hidden'); }
  // Какая подсказка нужна сейчас: первая по порядку из ещё не показанных, чьё условие есть на поле
  function tipCheck() {
    if (!app.tipsMatch || app.coach || app.screen !== 'battle' || !canAimNow() || tips.turn === app.s.turn) return; // не больше одной за ход
    var s = app.s, act = myActable(), mine = myFrogs();
    var emptyF = mine.filter(function (f) { return f.alive && Sim.isEmpty(s, f) && !Sim.onBase(f); })[0], ally = null;
    act.forEach(function (f) { mine.forEach(function (m) { if (!ally && m !== f && m.alive && !Sim.onBase(m) && Sim.dist(f.x, f.y, m.x, m.y) <= T.jumpR) ally = m; }); });
    function W(o, r) { return { world: { x: o.x, y: o.y, r: r } }; }
    var list = [ // цель — на старте матча; дальше по ситуации, первая подходящая
      ['jump', act.length > 0, function () { app.ghostFrog = act[0].id; return W(act[0], act[0].r * 1.7); }],
      ['empty', !!emptyF, function () { return Object.assign(W(emptyF, emptyF.r * 1.7), { el: $('fc-' + emptyF.id) }); }],
      ['relay', !!ally, function () { return W(ally, ally.r * 1.8); }]
    ];
    for (var k = 0; k < list.length; k++) if (!tips.seen[list[k][0]] && list[k][1]) { tips.turn = s.turn; return coach(list[k][0], list[k][2]()); }
  }

  // ---------- HUD ----------
  function banner(txt, cls, sub) {
    var b = $('banner'); b.className = 'banner show ' + (cls || ''); b.innerHTML = txt + (sub ? '<small>' + sub + '</small>' : '');
    clearTimeout(app.bannerT); app.bannerT = setTimeout(function () { b.className = 'banner'; }, 1100);
  }
  // Своя очередь NEXT — у своей колбы (D-156): колба уже налита следующим элементом, рядом ещё два.
  // Очередь врага не показываем: его колба и так показывает, чем зарядится его следующий бак.
  var nextKey = '';
  function renderNext() {
    var s = app.shown, box = $('nextq'); if (!s) return;
    var on = !!(s.rules.economy && s.seq && s.seq.length && app.screen === 'battle');
    box.classList.toggle('hidden', !on); if (!on) return;
    var key = String(s.ptr[0]); if (key === nextKey) return; nextKey = key;
    var h = '<div class="nq-h">NEXT</div><div class="nq-row">';
    for (var i = 0; i < 3; i++) { var e = s.seq[(s.ptr[0] + i) % s.seq.length]; h += '<div class="nq-i' + (i ? '' : ' first') + '" style="--c:' + ELC(e) + '">' + FB.ELEMENTS[e].icon + '</div>'; }
    box.innerHTML = h + '</div>';
    box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop');
  }
  function placeNext() { // справа от своей колбы; не заезжает под панели HUD и за край экрана
    var box = $('nextq'); if (box.classList.contains('hidden')) return;
    var fk = AR.flasks[0], p = R.toScreen(fk.x + T.flaskR * 1.15, 20, fk.y), top = document.querySelector('#hud .top'), bot = $('bottom');
    var y0 = top ? top.getBoundingClientRect().bottom + 4 : 60, y1 = (bot ? bot.getBoundingClientRect().top : innerHeight) - box.offsetHeight - 4;
    var x = Math.min(cv.clientWidth - box.offsetWidth - 6, Math.max(6, p.x)), y = Math.min(y1, Math.max(y0, p.y - box.offsetHeight / 2));
    box.style.transform = 'translate(' + (x | 0) + 'px,' + (y | 0) + 'px)';
  }
  $('nextq').onclick = function () { if (app.shown) banner('NEXT', 'p', 'Your flask holds the next element — a frog that starts a new tank gets it'); };
  function buildCards() {
    [0, 1].forEach(function (side) {
      var box = $('cards-' + side); box.innerHTML = '';
      app.s.frogs.filter(function (f) { return f.side === side; }).forEach(function (f) {
        var c = document.createElement('div'); c.className = 'fcard ' + (side === 0 ? 'mine-c' : 'enemy'); c.id = 'fc-' + f.id;
        c.innerHTML = '<div class="fpic"></div><div class="fbody"><div class="fn"></div><div class="hpb"><i></i><em></em></div><div class="ffl"></div></div>' +
          (side === 0 ? '<button class="home" aria-label="Home">⟲</button><div class="homecta"><b>⟲ HOME</b><small>tap to refuel</small></div>' : '');
        c.onclick = function () {
          if (side === 0 && c.classList.contains('cta')) return recall(f.id); // пустая в поле: тап по всей плашке — домой (D-156)
          if (side === 0 && canAimNow() && !app.s.pending) { app.sel = f.id; refreshHud(true); }
          var d = D(f.id); if (!d.hidden) R.focus(d.x, d.y);
        };
        if (side === 0) c.querySelector('.home').onclick = function (ev) { ev.stopPropagation(); recall(f.id); };
        box.appendChild(c);
      });
    });
  }
  function refreshHud(force) {
    if (!app.s || !app.shown) return;
    var s = app.shown, econ = s.rules.economy, perks = s.rules.perks;
    $('turn-n').textContent = s.turn;
    $('tb-l').textContent = s.turnSide === 0 ? 'YOUR TURN' : 'ENEMY';
    $('turnbox').className = 'turnbox ' + (s.turnSide === 0 ? 'mine' : 'enemy');
    renderNext();
    var mine = myTurn() && !app.playing && !app.busy, P = app.s.pending, sel = mineSel();
    s.frogs.forEach(function (f) {
      var c = $('fc-' + f.id); if (!c) return;
      var empty = econ && f.ch <= 0, key = f.kind + (empty ? '' : f.el || 'orig');
      if (c.dataset.pk !== key) { c.dataset.pk = key; var fp = c.querySelector('.fpic'); fp.innerHTML = ''; fp.appendChild(pic(f.kind, empty ? '' : f.el || 'orig', 64)); }
      c.querySelector('.fn').innerHTML = (perks ? '<span class="fpk">' + FB.FROGS[f.kind].perk.icon + '</span>' : '') + FB.FROGS[f.kind].name;
      var hp = Math.max(0, f.hp);
      c.querySelector('.hpb i').style.width = (100 * hp / f.maxHp) + '%';
      c.querySelector('.hpb em').textContent = hp + ' / ' + f.maxHp;
      var home = Sim.onBase(f), st; // на карточке только главное (D-147): элемент и эликсир, пустой бак, лёд, якорь
      if (f.frozen) st = '<span class="emp ice">🧊 FROZEN</span>';
      else if (f.el && !empty) st = '<span class="eli" style="color:' + ELC(f.el) + '">' + FB.ELEMENTS[f.el].icon + '</span>' + (econ ? pips(f.ch, f.el) : '');
      else if (econ && home) st = '<span class="emp">⏳ refuels next turn</span>';
      else if (econ) st = '<span class="emp empty">🪫 EMPTY</span>';
      else st = '';
      if (f.anchor) st += '<span class="emp anc">⚓</span>';
      c.querySelector('.ffl').innerHTML = st;
      c.classList.toggle('empty', empty && !home);
      var hb = c.querySelector('.home');
      if (hb) { // «⟲ Домой» (D-156): у пустой в поле вся плашка — кнопка; у заряженной в поле — кнопка-опция в углу
        var can = mine && !P && econ && !home && Sim.canRecall(app.s, app.s.frogs[f.id]);
        c.classList.toggle('cta', can && empty);
        hb.classList.toggle('hidden', !can || empty);
      }
      c.classList.toggle('done', f.side === s.turnSide && !Sim.canAct(app.s, app.s.frogs[f.id]) && !app.s.pending);
      c.classList.toggle('sel', f.id === app.sel && myTurn());
    });
    $('bottom').classList.toggle('wait', !mine);
    $('tring').classList.toggle('off', !mine);
    $('btn-skip').textContent = P && myTurn() ? 'AUTO' : 'PASS';
    if (!app.aimCmd) {
      if (!mine) setPv(app.s.phase === 'play' ? (app.s.turnSide === 1 ? 'Enemy turn' : 'Watching…') : 'Match over', app.s.turnSide === 1 ? 'The bot is thinking' : '');
      else if (P) setPv('↗ RELAY', 'Jump again — any direction, full range. Each ally once. Timer runs out → auto hop ' + Math.round(T.relayAuto * 100) + '%');
      else if (sel) {
        var sem = Sim.isEmpty(app.s, sel), txt;
        if (sel.frozen) txt = 'Frozen: skips this turn';
        else if (sem && Sim.onBase(sel)) txt = 'Empty tank: the base refuels it next turn';
        else if (sem) txt = 'Empty tank: it can’t jump · tap its card: home + refuel now · or bounce off it';
        else txt = 'Drag back to jump' + (econ ? ' · ' + sel.ch + ' elixir' : '');
        setPv((sel.el && !sem ? FB.ELEMENTS[sel.el].icon + ' ' : '') + FB.FROGS[sel.kind].name, txt);
      } else setPv('Your turn', myActable().length ? 'Pick a frog' : 'No frog can jump — tap an empty frog’s card: home + refuel');
    }
  }

  // ---------- цикл ----------
  var last = performance.now(), lastRaf = 0;
  function update(dt) {
    if (app.screen === 'battle' && app.s) {
      if (!app.paused) stepPlayback(dt * app.speed);
      app.s.frogs.forEach(function (f) {
        var d = D(f.id); if (!d) return;
        d.flash = Math.max(0, (d.flash || 0) - dt * 4); d.hitT = Math.max(0, (d.hitT || 0) - dt * app.speed); d.fillT = Math.max(0, (d.fillT || 0) - dt * 1.6); d.squash = Math.max(0, (d.squash || 0) - dt * 0.6);
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
      placeCoachRing(); placeGhost(); placeNext();
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
    if (app.auto) { if (app.picks.length !== 3) app.picks = ['spring', 'cling', 'bellows']; startBattle(); }
  }).catch(function (err) { $('loading').textContent = 'Load failed: ' + err.message; console.error(err); });
})();
