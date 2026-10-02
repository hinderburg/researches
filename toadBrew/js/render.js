// Отрисовка Canvas 2D (D-042): каменная арена, объекты, плиты, зоны жидкостей, механические жабы с колбами,
// превью прыжка с реакцией. Читает показанное состояние (HP, статусы, колбы) и «экранную» модель анимации.
(function () {
  var T = FB.T;
  var R = {};
  FB.R = R;

  var cv, ctx, dpr = 1, bg = null;
  var view = { s: 1, ox: 0, oy: 0, cw: 0, ch: 0 };
  R.view = view;

  R.init = function (canvas) { cv = canvas; ctx = cv.getContext('2d'); };
  R.resize = function (topPx, botPx) {
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    var w = cv.clientWidth, h = cv.clientHeight;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    view.cw = w; view.ch = h;
    var availH = h - topPx - botPx;
    view.s = Math.min(w / T.W, availH / T.H);
    view.ox = (w - T.W * view.s) / 2;
    view.oy = topPx + (availH - T.H * view.s) / 2;
    bg = null;
  };
  R.toWorld = function (px, py) { return { x: (px - view.ox) / view.s, y: (py - view.oy) / view.s }; };
  R.toScreen = function (x, y) { return { x: view.ox + x * view.s, y: view.oy + y * view.s }; };

  function ell(c, x, y, rx, ry, rot) { c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, Math.PI * 2); }
  function hash(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  R.roundRect = rr;

  // ---------- механические жабы (§4.2) ----------
  var PAL = {
    ram:     { body: '#7a7d80', dark: '#3f4245', trim: '#c9a24a', skin: '#a8a37a', eye: '#ffb31a' },
    spur:    { body: '#a7afb6', dark: '#5c646b', trim: '#c9a24a', skin: '#7f9a48', eye: '#ffd24a' },
    harpoon: { body: '#8e8a52', dark: '#4e4a24', trim: '#d4ab52', skin: '#8fa04a', eye: '#ff3b2e' },
    bellows: { body: '#9c8f6a', dark: '#5b5036', trim: '#c08850', skin: '#b5b04a', eye: '#ffd24a' },
    spring:  { body: '#2f5f9e', dark: '#1b3560', trim: '#d6ad55', skin: '#7f9a48', eye: '#ffe37a' },
    aegis:   { body: '#2d4f98', dark: '#172a57', trim: '#e2b955', skin: '#7f9a48', eye: '#ffd24a' }
  };
  R.PAL = PAL;
  var OUT = '#1a1510';

  function rivets(c, pts, r) { c.fillStyle = '#e8d08a'; pts.forEach(function (p) { ell(c, p[0], p[1], r, r); c.fill(); }); }

  function flaskBottle(c, x, y, s, liquid, state) { // state: 2 — активная, 1 — следующая, 0 — прочая
    var L = FB.LIQUIDS[liquid];
    if (state === 2) { var g = c.createRadialGradient(x, y, s * 0.2, x, y, s * 2.4); g.addColorStop(0, 'rgba(' + L.glow + ',0.9)'); g.addColorStop(1, 'rgba(' + L.glow + ',0)'); c.fillStyle = g; ell(c, x, y, s * 2.4, s * 2.4); c.fill(); }
    c.strokeStyle = OUT; c.lineWidth = Math.max(1, s * 0.22);
    c.fillStyle = 'rgba(220,240,255,0.35)'; ell(c, x, y, s, s); c.fill(); c.stroke();
    c.fillStyle = L.color; c.globalAlpha = state === 0 ? 0.75 : 1; ell(c, x, y + s * 0.15, s * 0.78, s * 0.7); c.fill(); c.globalAlpha = 1;
    c.fillStyle = 'rgba(255,255,255,0.75)'; ell(c, x - s * 0.35, y - s * 0.3, s * 0.22, s * 0.18); c.fill();
    c.fillStyle = '#9a6a3a'; rr(c, x - s * 0.32, y - s * 1.35, s * 0.64, s * 0.5, s * 0.12); c.fill(); c.stroke();
    if (state === 1) { c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = Math.max(1, s * 0.18); ell(c, x, y, s * 1.25, s * 1.25); c.stroke(); }
    if (state === 2) { c.strokeStyle = '#fff6c0'; c.lineWidth = Math.max(1.2, s * 0.26); ell(c, x, y, s * 1.3, s * 1.3); c.stroke(); }
  }
  R.flaskBottle = flaskBottle;

  // Жаба вида сверху, вперёд = -y, радиус r
  function mechFrog(c, kind, r, t, o) {
    var p = PAL[kind], lw = Math.max(1.2, r * 0.09);
    c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = OUT; c.lineWidth = lw;
    var spring = kind === 'spring', heavy = kind === 'ram' || kind === 'aegis' || kind === 'bellows';
    // лапы: шарниры и стопы
    for (var sg = -1; sg <= 1; sg += 2) {
      var lk = spring ? 1.35 : (heavy ? 0.9 : 1.1);
      c.fillStyle = p.dark;
      ell(c, sg * r * 0.9, r * 0.5, r * 0.26 * lk, r * 0.55 * lk, sg * -0.55); c.fill(); c.stroke();
      if (spring) { // пружины вместо сухожилий
        c.strokeStyle = '#d9c27a'; c.lineWidth = lw * 0.8;
        for (var k = 0; k < 4; k++) { c.beginPath(); c.ellipse(sg * r * (0.98 + k * 0.08), r * (0.62 + k * 0.14), r * 0.18, r * 0.06, sg * 0.6, 0, Math.PI * 2); c.stroke(); }
        c.strokeStyle = OUT; c.lineWidth = lw;
      }
      c.fillStyle = p.trim; ell(c, sg * r * 1.08, r * 1.05 * lk, r * 0.26, r * 0.13, sg * 0.3); c.fill(); c.stroke();
      c.fillStyle = p.dark; ell(c, sg * r * 0.8, -r * 0.48, r * 0.15, r * 0.32, sg * 0.6); c.fill(); c.stroke();
      c.fillStyle = p.trim; ell(c, sg * r * 0.95, -r * 0.75, r * 0.13, r * 0.09); c.fill(); c.stroke();
    }
    // боковые меха Bellows
    if (kind === 'bellows') for (sg = -1; sg <= 1; sg += 2) {
      var tg = c.createLinearGradient(sg * r * 0.9, 0, sg * r * 1.35, 0); tg.addColorStop(0, '#d2804a'); tg.addColorStop(1, '#7a3f1e');
      c.fillStyle = tg; rr(c, sg > 0 ? r * 0.82 : -r * 1.36, -r * 0.35, r * 0.54, r * 0.95, r * 0.22); c.fill(); c.stroke();
      c.strokeStyle = '#3b210f'; c.lineWidth = lw * 0.6;
      for (var b = 0; b < 3; b++) { c.beginPath(); c.moveTo(sg > 0 ? r * 0.86 : -r * 1.32, -r * 0.15 + b * r * 0.28); c.lineTo(sg > 0 ? r * 1.32 : -r * 0.86, -r * 0.15 + b * r * 0.28); c.stroke(); }
      c.strokeStyle = OUT; c.lineWidth = lw;
    }
    // корпус
    var bw = heavy ? 1.12 : (spring ? 0.86 : 1), bh = heavy ? 1.1 : 1.02;
    var g = c.createRadialGradient(-r * 0.35, -r * 0.3, r * 0.15, 0, 0, r * 1.25);
    g.addColorStop(0, '#f1e4b8'); g.addColorStop(0.18, p.body); g.addColorStop(1, p.dark);
    c.fillStyle = g; ell(c, 0, r * 0.08, r * bw, r * bh); c.fill(); c.stroke();
    // пластины и заклёпки
    c.strokeStyle = 'rgba(20,15,10,0.55)'; c.lineWidth = lw * 0.6;
    c.beginPath(); c.moveTo(-r * bw * 0.85, r * 0.05); c.quadraticCurveTo(0, r * 0.25, r * bw * 0.85, r * 0.05); c.stroke();
    c.beginPath(); c.moveTo(0, -r * 0.5); c.lineTo(0, r * 1.05); c.stroke();
    rivets(c, [[-r * 0.6, r * 0.55], [r * 0.6, r * 0.55], [-r * 0.75, -r * 0.1], [r * 0.75, -r * 0.1], [0, r * 0.95]], r * 0.05);
    // приметы
    if (kind === 'aegis') { // щит-площадка
      c.strokeStyle = OUT; c.lineWidth = lw;
      c.beginPath();
      for (var q = 0; q < 8; q++) { var a = q / 8 * Math.PI * 2 + Math.PI / 8; c.lineTo(Math.cos(a) * r * 0.82, r * 0.25 + Math.sin(a) * r * 0.72); }
      c.closePath();
      var sgd = c.createLinearGradient(0, -r * 0.4, 0, r); sgd.addColorStop(0, '#3a63b8'); sgd.addColorStop(1, '#1d3570');
      c.fillStyle = sgd; c.fill(); c.strokeStyle = p.trim; c.lineWidth = lw * 1.8; c.stroke(); c.strokeStyle = OUT; c.lineWidth = lw * 0.6; c.stroke();
      c.fillStyle = '#e8c86a'; c.beginPath(); c.moveTo(-r * 0.25, r * 0.4); c.lineTo(-r * 0.25, r * 0.15); c.lineTo(-r * 0.12, r * 0.27); c.lineTo(0, r * 0.1); c.lineTo(r * 0.12, r * 0.27); c.lineTo(r * 0.25, r * 0.15); c.lineTo(r * 0.25, r * 0.4); c.closePath(); c.fill();
    }
    if (kind === 'spur') { // шпоры
      c.fillStyle = '#d7dde2'; c.strokeStyle = OUT; c.lineWidth = lw * 0.8;
      for (sg = -1; sg <= 1; sg += 2) for (var sp = 0; sp < 3; sp++) {
        var sy = -r * 0.2 + sp * r * 0.38, sx = sg * r * 0.98;
        c.beginPath(); c.moveTo(sx, sy - r * 0.12); c.lineTo(sx + sg * r * 0.38, sy); c.lineTo(sx, sy + r * 0.12); c.closePath(); c.fill(); c.stroke();
      }
    }
    // три колбы на спине (§9.4)
    var fl = o.flasks || [], fi = o.fi || 0, fs = r * 0.24, fy = kind === 'aegis' ? r * 0.72 : r * 0.55;
    for (var i = 0; i < 3 && fl.length; i++) {
      var st = o.dead ? 0 : (i === fi ? 2 : (i === (fi + 1) % 3 ? 1 : 0));
      flaskBottle(c, (i - 1) * r * 0.52, fy + (i === 1 ? -r * 0.08 : 0), fs, fl[i], st);
    }
    // голова
    c.strokeStyle = OUT; c.lineWidth = lw;
    var hg = c.createRadialGradient(-r * 0.2, -r * 0.8, r * 0.1, 0, -r * 0.6, r * 0.8);
    hg.addColorStop(0, '#f1e4b8'); hg.addColorStop(0.3, p.body); hg.addColorStop(1, p.dark);
    c.fillStyle = hg; ell(c, 0, -r * 0.62, r * 0.68 * (heavy ? 1.1 : 1), r * 0.5); c.fill(); c.stroke();
    if (kind === 'ram') { // рога-тараны
      c.strokeStyle = p.trim; c.lineWidth = r * 0.2;
      for (sg = -1; sg <= 1; sg += 2) { c.beginPath(); c.arc(sg * r * 0.72, -r * 0.62, r * 0.32, sg > 0 ? -Math.PI * 0.9 : -Math.PI * 0.1, sg > 0 ? Math.PI * 0.6 : Math.PI * 1.4, sg < 0); c.stroke(); }
      c.strokeStyle = OUT; c.lineWidth = lw;
    }
    if (kind === 'harpoon' && !o.noTongue) { // язык-гарпун
      c.strokeStyle = '#c9cfd4'; c.lineWidth = r * 0.14;
      c.beginPath(); c.moveTo(0, -r * 1.0); c.lineTo(0, -r * 1.75); c.stroke();
      c.strokeStyle = OUT; c.lineWidth = lw * 0.8;
      c.beginPath(); c.arc(r * 0.12, -r * 1.78, r * 0.18, Math.PI * 0.6, Math.PI * 2.1); c.stroke();
    }
    // глаза
    var eyeR = r * (spring ? 0.27 : 0.22);
    for (sg = -1; sg <= 1; sg += 2) {
      var ex = sg * r * 0.36, ey = -r * 0.78;
      c.fillStyle = p.trim; ell(c, ex, ey, eyeR * 1.3, eyeR * 1.3); c.fill(); c.stroke();
      if (o.dead) { c.strokeStyle = OUT; c.lineWidth = lw * 1.2; c.beginPath(); c.moveTo(ex - eyeR * 0.6, ey - eyeR * 0.6); c.lineTo(ex + eyeR * 0.6, ey + eyeR * 0.6); c.moveTo(ex + eyeR * 0.6, ey - eyeR * 0.6); c.lineTo(ex - eyeR * 0.6, ey + eyeR * 0.6); c.stroke(); c.lineWidth = lw; continue; }
      var eg = c.createRadialGradient(ex - eyeR * 0.3, ey - eyeR * 0.3, 1, ex, ey, eyeR);
      eg.addColorStop(0, '#fff8d0'); eg.addColorStop(1, p.eye);
      c.fillStyle = eg; ell(c, ex, ey, eyeR, eyeR); c.fill(); c.stroke();
      c.fillStyle = '#120c08'; ell(c, ex, ey, eyeR * 0.36, eyeR * 0.5); c.fill();
      c.fillStyle = '#fff'; ell(c, ex - eyeR * 0.3, ey - eyeR * 0.35, eyeR * 0.2, eyeR * 0.2); c.fill();
    }
    if (kind === 'spur') { // забрало
      c.fillStyle = '#c9d0d6'; rr(c, -r * 0.42, -r * 1.06, r * 0.84, r * 0.36, r * 0.12); c.fill(); c.stroke();
      c.strokeStyle = '#3b4247'; c.lineWidth = lw * 0.7;
      for (var v = -2; v <= 2; v++) { c.beginPath(); c.moveTo(v * r * 0.13, -r * 1.02); c.lineTo(v * r * 0.13, -r * 0.74); c.stroke(); }
    }
  }

  R.drawFrog = function (c, kind, x, y, r, facing, o) {
    o = o || {};
    c.save(); c.translate(x, y); c.rotate(facing + (o.wobble || 0));
    var sc = o.scale || 1; c.scale(sc, sc);
    if (o.dead) { c.globalAlpha = 0.85; c.filter = 'grayscale(0.8) brightness(0.7)'; }
    mechFrog(c, kind, r, o.t || 0, o);
    c.restore();
  };

  // Портрет для экранов меты
  R.portrait = function (canvas, kind, flasks) {
    var c = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
    c.clearRect(0, 0, w, h);
    var r = Math.min(w, h) * 0.28 * (FB.FROGS[kind].r / 22);
    c.fillStyle = 'rgba(0,0,0,0.3)'; ell(c, w / 2, h * 0.62 + r * 0.2, r * 1.4, r * 0.55); c.fill();
    R.drawFrog(c, kind, w / 2, h * 0.55, r, 0, { flasks: flasks || [], fi: 0 });
  };

  // ---------- арена (§5) ----------
  function buildBg() {
    bg = document.createElement('canvas'); bg.width = cv.width; bg.height = cv.height;
    var c = bg.getContext('2d'); c.scale(dpr, dpr);
    var w = view.cw, h = view.ch, s = view.s;
    // окружение: тёмная кладка трибун
    var g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#2a1f17'); g.addColorStop(1, '#1c140e');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    for (var i = 0; i < 160; i++) { c.fillStyle = 'rgba(' + (60 + hash(i) * 40 | 0) + ',' + (45 + hash(i + 1) * 30 | 0) + ',30,0.5)'; c.fillRect(hash(i + 2) * w, hash(i + 3) * h, 18 + hash(i + 4) * 22, 8 + hash(i + 5) * 6); }
    var L = view.ox, Tp = view.oy, W = T.W * s, H = T.H * s;
    // стена-кольцо
    c.fillStyle = '#4b3b2c'; rr(c, L - 10 * s, Tp - 10 * s, W + 20 * s, H + 20 * s, 26 * s); c.fill();
    c.strokeStyle = '#2a1f15'; c.lineWidth = 3; c.stroke();
    // пол: каменные плиты
    c.save(); rr(c, L, Tp, W, H, 20 * s); c.clip();
    c.fillStyle = '#8b7357'; c.fillRect(L, Tp, W, H);
    var tile = 34 * s;
    for (var yy = 0, row = 0; yy < H + tile; yy += tile * 0.8, row++) {
      for (var xx = -(row % 2) * tile / 2; xx < W + tile; xx += tile) {
        var id = row * 31 + Math.round(xx / tile), sh = 0.85 + hash(id) * 0.3;
        c.fillStyle = 'rgb(' + (139 * sh | 0) + ',' + (115 * sh | 0) + ',' + (87 * sh | 0) + ')';
        rr(c, L + xx + 1.5, Tp + yy + 1.5, tile - 3, tile * 0.8 - 3, 3 * s); c.fill();
        if (hash(id + 9) > 0.8) { c.strokeStyle = 'rgba(40,28,18,0.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(L + xx + tile * 0.2, Tp + yy + tile * 0.2); c.lineTo(L + xx + tile * 0.6, Tp + yy + tile * 0.45); c.stroke(); }
      }
    }
    // каналы по бокам с алхимической жидкостью
    [[L + 4 * s, 0], [L + W - 12 * s, 1]].forEach(function (ch) {
      c.fillStyle = '#3a2c20'; c.fillRect(ch[0], Tp + H * 0.3, 8 * s, H * 0.4);
      var cg = c.createLinearGradient(0, Tp + H * 0.3, 0, Tp + H * 0.7); cg.addColorStop(0, '#2fbf6a'); cg.addColorStop(0.5, '#3fa8ff'); cg.addColorStop(1, '#2fbf6a');
      c.fillStyle = cg; c.globalAlpha = 0.6; c.fillRect(ch[0] + 1.5 * s, Tp + H * 0.3 + 2, 5 * s, H * 0.4 - 4); c.globalAlpha = 1;
    });
    // центральная эмблема
    var cx = L + W / 2, cy = Tp + H / 2;
    c.fillStyle = 'rgba(70,52,34,0.55)'; ell(c, cx, cy, 70 * s, 70 * s); c.fill();
    c.strokeStyle = 'rgba(200,160,90,0.45)'; c.lineWidth = 3 * s; ell(c, cx, cy, 64 * s, 64 * s); c.stroke(); ell(c, cx, cy, 52 * s, 52 * s); c.stroke();
    c.fillStyle = 'rgba(200,160,90,0.4)'; ell(c, cx, cy + 6 * s, 26 * s, 18 * s); c.fill(); ell(c, cx - 12 * s, cy - 10 * s, 8 * s, 8 * s); c.fill(); ell(c, cx + 12 * s, cy - 10 * s, 8 * s, 8 * s); c.fill();
    c.beginPath(); c.moveTo(cx - 14 * s, cy - 24 * s); c.lineTo(cx - 14 * s, cy - 34 * s); c.lineTo(cx - 7 * s, cy - 28 * s); c.lineTo(cx, cy - 37 * s); c.lineTo(cx + 7 * s, cy - 28 * s); c.lineTo(cx + 14 * s, cy - 34 * s); c.lineTo(cx + 14 * s, cy - 24 * s); c.closePath(); c.fill();
    c.restore();
    // баннеры команд и факелы
    function banner(x, y, col) { c.fillStyle = col; c.beginPath(); c.moveTo(x - 9 * s, y); c.lineTo(x + 9 * s, y); c.lineTo(x + 9 * s, y + 26 * s); c.lineTo(x, y + 20 * s); c.lineTo(x - 9 * s, y + 26 * s); c.closePath(); c.fill(); c.fillStyle = '#e8c86a'; ell(c, x, y + 10 * s, 4 * s, 4 * s); c.fill(); }
    banner(L + W * 0.3, Tp - 9 * s, '#9a2a2a'); banner(L + W * 0.7, Tp - 9 * s, '#9a2a2a');
    banner(L + W * 0.3, Tp + H - 17 * s, '#24479a'); banner(L + W * 0.7, Tp + H - 17 * s, '#24479a');
    R._torches = [[L - 4 * s, Tp + H * 0.25], [L + W + 4 * s, Tp + H * 0.25], [L - 4 * s, Tp + H * 0.75], [L + W + 4 * s, Tp + H * 0.75], [L + 14 * s, Tp - 4 * s], [L + W - 14 * s, Tp - 4 * s], [L + 14 * s, Tp + H + 4 * s], [L + W - 14 * s, Tp + H + 4 * s]];
    R._torches.forEach(function (p) { c.fillStyle = '#2b1f14'; ell(c, p[0], p[1], 7 * s, 7 * s); c.fill(); c.strokeStyle = '#6b5236'; c.lineWidth = 2; c.stroke(); });
  }

  function drawTorches(c, t) {
    (R._torches || []).forEach(function (p, i) {
      var f = 0.8 + 0.2 * Math.sin(t * 9 + i * 1.7), s = view.s;
      var g = c.createRadialGradient(p[0], p[1], 1, p[0], p[1], 40 * s * f); g.addColorStop(0, 'rgba(255,190,90,0.55)'); g.addColorStop(1, 'rgba(255,140,40,0)');
      c.fillStyle = g; ell(c, p[0], p[1], 40 * s * f, 40 * s * f); c.fill();
      c.fillStyle = '#ffd36a'; ell(c, p[0], p[1] - 3 * s, 3.5 * s * f, 6 * s * f); c.fill();
      c.fillStyle = '#ff7a2a'; ell(c, p[0], p[1] - 1 * s, 2.5 * s, 3.5 * s * f); c.fill();
    });
  }

  // плита пола (§5.2)
  function drawPlate(c, p, t) {
    var P = R.toScreen(p.x, p.y), r = p.r * view.s;
    if (p.state === 'pit') {
      var g = c.createRadialGradient(P.x, P.y, r * 0.1, P.x, P.y, r);
      g.addColorStop(0, '#0b0806'); g.addColorStop(0.8, '#2a1d12'); g.addColorStop(1, '#5a4430');
      c.fillStyle = g; ell(c, P.x, P.y, r, r * 0.9); c.fill();
      c.strokeStyle = '#3a2a1c'; c.lineWidth = 3; c.stroke();
      return;
    }
    c.fillStyle = 'rgba(120,95,70,0.6)'; c.strokeStyle = 'rgba(60,42,28,0.7)'; c.lineWidth = 2;
    c.beginPath();
    for (var i = 0; i < 6; i++) { var a = i / 6 * Math.PI * 2 + p.id; c.lineTo(P.x + Math.cos(a) * r, P.y + Math.sin(a) * r * 0.9); }
    c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(40,28,18,0.6)'; c.lineWidth = 1.2; c.setLineDash([3, 3]);
    c.beginPath(); c.arc(P.x, P.y, r * 0.7, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
    if (p.state === 'cracked') {
      c.strokeStyle = 'rgba(25,15,8,0.9)'; c.lineWidth = 2;
      for (var k = 0; k < 5; k++) { var a2 = k * 1.3 + p.id; c.beginPath(); c.moveTo(P.x, P.y); c.lineTo(P.x + Math.cos(a2) * r * 0.5, P.y + Math.sin(a2) * r * 0.5); c.lineTo(P.x + Math.cos(a2 + 0.3) * r * 0.95, P.y + Math.sin(a2 + 0.3) * r * 0.85); c.stroke(); }
      c.fillStyle = 'rgba(255,120,40,' + (0.15 + 0.1 * Math.sin(t * 3)) + ')'; ell(c, P.x, P.y, r * 0.3, r * 0.3); c.fill();
    }
  }

  // объект (§5.2): колонна, бочка, резервуар
  function drawObject(c, o, t, pass) {
    var P = R.toScreen(o.x, o.y), r = o.r * view.s, s = view.s;
    if (o.state === 'destroyed') {
      if (pass !== 'base') return;
      for (var i = 0; i < 6; i++) { var a = i * 1.1 + o.id; c.fillStyle = o.kind === 'tank' ? 'rgba(180,220,230,0.6)' : (o.kind === 'barrel' ? '#6b4423' : '#8a8279'); ell(c, P.x + Math.cos(a) * r * 0.7, P.y + Math.sin(a) * r * 0.6, r * 0.28, r * 0.2, a); c.fill(); }
      return;
    }
    var h = o.kind === 'pillar' ? 38 * s : (o.kind === 'tank' ? 16 * s : 12 * s);
    if (pass === 'base') { c.fillStyle = 'rgba(0,0,0,0.35)'; ell(c, P.x + 4 * s, P.y + 4 * s, r * 1.1, r * 0.8); c.fill(); return; }
    var top = P.y - h;
    if (o.kind === 'pillar') {
      var g = c.createLinearGradient(P.x - r, 0, P.x + r, 0); g.addColorStop(0, '#6f675d'); g.addColorStop(0.45, '#c2b8a8'); g.addColorStop(1, '#5e574e');
      c.fillStyle = g; c.fillRect(P.x - r, top, r * 2, h); c.strokeStyle = '#2d2924'; c.lineWidth = 1.5; c.strokeRect(P.x - r, top, r * 2, h);
      ell(c, P.x, P.y, r, r * 0.45); c.fill(); c.stroke();
      c.fillStyle = '#d6ccbc'; ell(c, P.x, top, r * 1.12, r * 0.5); c.fill(); c.stroke();
      c.fillStyle = 'rgba(110,150,70,0.55)'; ell(c, P.x - r * 0.3, top - r * 0.05, r * 0.4, r * 0.18); c.fill();
    } else if (o.kind === 'barrel') {
      c.fillStyle = '#7a4c25'; c.fillRect(P.x - r, top, r * 2, h); ell(c, P.x, P.y, r, r * 0.45); c.fill();
      c.fillStyle = '#9a6634'; ell(c, P.x, top, r, r * 0.5); c.fill(); c.strokeStyle = '#2a170a'; c.lineWidth = 1.5; c.stroke();
      c.strokeStyle = '#3b3b3b'; c.lineWidth = 2; ell(c, P.x, top, r * 0.75, r * 0.36); c.stroke();
    } else if (o.kind === 'tank') {
      var L = FB.LIQUIDS[o.liquid];
      c.fillStyle = 'rgba(200,230,240,0.35)'; c.fillRect(P.x - r, top, r * 2, h);
      c.fillStyle = L.color; c.globalAlpha = 0.8; c.fillRect(P.x - r + 2, top + h * 0.35, r * 2 - 4, h * 0.65); c.globalAlpha = 1;
      c.strokeStyle = '#5a4a32'; c.lineWidth = 2; c.strokeRect(P.x - r, top, r * 2, h);
      c.fillStyle = '#7a6440'; ell(c, P.x, top, r, r * 0.45); c.fill(); c.stroke();
      c.fillStyle = 'rgba(' + L.glow + ',' + (0.5 + 0.2 * Math.sin(t * 3 + o.id)) + ')'; ell(c, P.x, top, r * 0.5, r * 0.22); c.fill();
    }
    if (o.state === 'cracked') {
      c.strokeStyle = 'rgba(20,12,6,0.95)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(P.x - r * 0.5, top + 2); c.lineTo(P.x - r * 0.1, top + h * 0.4); c.lineTo(P.x - r * 0.4, top + h * 0.7); c.lineTo(P.x, P.y); c.stroke();
      c.beginPath(); c.moveTo(P.x + r * 0.4, top + h * 0.2); c.lineTo(P.x + r * 0.1, top + h * 0.55); c.stroke();
    }
  }

  // зоны жидкостей (§10)
  var ZCOL = { ember: '255,110,40', venom: '80,220,70', frost: '100,180,255', resonance: '255,205,60', noxious: '90,210,190' };
  function drawZone(c, z, t, alpha) {
    var P = R.toScreen(z.x, z.y), r = z.r * view.s, col = ZCOL[z.type], a = (alpha === undefined ? 1 : alpha) * Math.min(1, z.turns / 2 + 0.3);
    if (z.type === 'resonance') {
      c.strokeStyle = 'rgba(' + col + ',' + (0.8 * a) + ')'; c.lineWidth = 2.5; c.setLineDash([6, 4]);
      c.beginPath(); c.arc(P.x, P.y, r, t, t + Math.PI * 2); c.stroke(); c.setLineDash([]);
      c.fillStyle = 'rgba(' + col + ',' + (0.12 * a) + ')'; c.fill();
      for (var i = 0; i < 6; i++) { var aa = i / 6 * Math.PI * 2 - t; c.fillStyle = 'rgba(' + col + ',' + (0.8 * a) + ')'; c.fillRect(P.x + Math.cos(aa) * r * 0.7 - 2, P.y + Math.sin(aa) * r * 0.7 - 2, 4, 4); }
      return;
    }
    var g = c.createRadialGradient(P.x, P.y, r * 0.1, P.x, P.y, r);
    g.addColorStop(0, 'rgba(' + col + ',' + (0.55 * a) + ')'); g.addColorStop(0.75, 'rgba(' + col + ',' + (0.35 * a) + ')'); g.addColorStop(1, 'rgba(' + col + ',0)');
    c.fillStyle = g; ell(c, P.x, P.y, r, r * 0.92); c.fill();
    c.strokeStyle = 'rgba(' + col + ',' + (0.75 * a) + ')'; c.lineWidth = 2; ell(c, P.x, P.y, r * 0.96, r * 0.88); c.stroke();
    var n = 7;
    for (var k = 0; k < n; k++) {
      var ph = (t * (z.type === 'ember' ? 1.6 : 0.6) + k / n + z.id * 0.37) % 1, ang = k * 2.39 + z.id;
      var px = P.x + Math.cos(ang) * r * 0.6 * hash(k + z.id), py = P.y + Math.sin(ang) * r * 0.55 * hash(k + 3 + z.id);
      if (z.type === 'ember') { c.fillStyle = 'rgba(255,' + (200 - ph * 120 | 0) + ',60,' + (a * (1 - ph)) + ')'; ell(c, px, py - ph * 16 * view.s, 3 + 3 * (1 - ph), 5 + 4 * (1 - ph)); c.fill(); }
      else if (z.type === 'frost') { c.strokeStyle = 'rgba(230,248,255,' + (0.8 * a) + ')'; c.lineWidth = 1.5; for (var j = 0; j < 3; j++) { var q = j * Math.PI / 3; c.beginPath(); c.moveTo(px - Math.cos(q) * 5, py - Math.sin(q) * 5); c.lineTo(px + Math.cos(q) * 5, py + Math.sin(q) * 5); c.stroke(); } }
      else { c.strokeStyle = 'rgba(200,255,190,' + (a * (1 - ph)) + ')'; c.lineWidth = 1.4; ell(c, px, py, 2 + ph * 5, 2 + ph * 5); c.stroke(); }
    }
  }
  R.ZCOL = ZCOL;

  // ---------- кадр ----------
  R.frame = function (scene) {
    if (!cv.width || !cv.height) return;
    if (!bg) buildBg();
    var s = scene.state, t = scene.t, sc = view.s;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bg, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (scene.shake > 0) ctx.translate((Math.random() - 0.5) * scene.shake, (Math.random() - 0.5) * scene.shake);
    drawTorches(ctx, t);
    if (!s) return;

    // перегрузка арены (§17): вне безопасной зоны — раскалённые трещины
    if (s.safeR !== null && s.safeR !== undefined) {
      var C = R.toScreen(T.W / 2, T.H / 2);
      ctx.save(); ctx.beginPath(); ctx.rect(view.ox, view.oy, T.W * sc, T.H * sc); ctx.arc(C.x, C.y, s.safeR * sc, 0, Math.PI * 2, true); ctx.clip('evenodd');
      ctx.fillStyle = 'rgba(120,20,10,' + (0.35 + 0.1 * Math.sin(t * 4)) + ')'; ctx.fillRect(view.ox, view.oy, T.W * sc, T.H * sc);
      ctx.strokeStyle = 'rgba(255,120,40,0.7)'; ctx.lineWidth = 2;
      for (var i = 0; i < 40; i++) { var a = hash(i) * Math.PI * 2, d = s.safeR * sc + hash(i + 7) * 200 * sc; ctx.beginPath(); ctx.moveTo(C.x + Math.cos(a) * d, C.y + Math.sin(a) * d); ctx.lineTo(C.x + Math.cos(a + 0.08) * (d + 18 * sc), C.y + Math.sin(a + 0.08) * (d + 18 * sc)); ctx.stroke(); }
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,150,60,0.9)'; ctx.lineWidth = 3; ctx.setLineDash([10, 6]); ctx.beginPath(); ctx.arc(C.x, C.y, s.safeR * sc, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }

    s.plates.forEach(function (p) { drawPlate(ctx, p, t); });
    s.zones.forEach(function (z) { drawZone(ctx, z, t, scene.zoneAlpha ? scene.zoneAlpha(z) : 1); });
    s.objects.forEach(function (o) { drawObject(ctx, o, t, 'base'); });
    if (scene.fxUnder) scene.fxUnder(ctx);

    // Link — подсветка трубок между парой (§12.2)
    [0, 1].forEach(function (sd) {
      var L = s.links[sd]; if (!L) return;
      var a = scene.disp[L.a], b = scene.disp[L.b]; if (!a || !b) return;
      var A = R.toScreen(a.x, a.y), B = R.toScreen(b.x, b.y), fa = s.frogs[L.a], fb = s.frogs[L.b];
      var ca = FB.LIQUIDS[fa.flasks[fa.fi]].glow, cb = FB.LIQUIDS[fb.flasks[fb.fi]].glow;
      var g = ctx.createLinearGradient(A.x, A.y, B.x, B.y); g.addColorStop(0, 'rgba(' + ca + ',0.95)'); g.addColorStop(1, 'rgba(' + cb + ',0.95)');
      ctx.strokeStyle = g; ctx.lineWidth = 6 + 2 * Math.sin(t * 6); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2; ctx.stroke();
    });

    // объекты и жабы по глубине (y), летящие — сверху
    var items = [];
    s.objects.forEach(function (o) { items.push({ y: o.y, z: 0, o: o }); });
    s.frogs.forEach(function (f) { var d = scene.disp[f.id]; items.push({ y: d.y, z: d.z || 0, f: f }); });
    items.sort(function (a, b) { return (a.z > 1) - (b.z > 1) || a.y - b.y; });
    items.forEach(function (it) {
      if (it.o) { drawObject(ctx, it.o, t, 'top'); return; }
      var f = it.f, d = scene.disp[f.id], P = R.toScreen(d.x, d.y), r = f.r * sc, z = (d.z || 0) * sc, dead = !d.alive;
      var inPit = f.pit >= 0 && z < 1 && !dead;
      // тень и кольцо команды
      if (z > 0.5) { ctx.fillStyle = 'rgba(0,0,0,' + Math.max(0.12, 0.4 - z / 300) + ')'; ell(ctx, P.x, P.y, r * (1.1 - Math.min(0.5, z / 200)), r * (0.7 - Math.min(0.35, z / 220))); ctx.fill(); }
      else if (!dead) {
        var col = f.side === 0 ? '70,150,255' : '255,70,60';
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ell(ctx, P.x + 2, P.y + 4, r * 1.1, r * 0.75); ctx.fill();
        ctx.strokeStyle = 'rgba(' + col + ',0.9)'; ctx.lineWidth = 3; ell(ctx, P.x, P.y + r * 0.15, r * 1.35, r * 0.95); ctx.stroke();
        ctx.fillStyle = 'rgba(' + col + ',0.18)'; ctx.fill();
      }
      var sel = scene.selected === f.id;
      if (sel && !dead && z < 1) {
        ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 2.5; ctx.setLineDash([8, 6]);
        ctx.beginPath(); ctx.ellipse(P.x, P.y + r * 0.15, r * 1.65, r * 1.15, 0, t * 0.8, t * 0.8 + Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        // стрелка над выбранной
        ctx.fillStyle = '#7fd0ff'; ctx.beginPath(); var ay = P.y - r * 2.6 + Math.sin(t * 5) * 3; ctx.moveTo(P.x - 7, ay - 9); ctx.lineTo(P.x + 7, ay - 9); ctx.lineTo(P.x, ay); ctx.closePath(); ctx.fill();
      } else if (scene.actable && scene.actable(f) && z < 1) {
        ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 2; ctx.setLineDash([4, 5]);
        ctx.beginPath(); ctx.ellipse(P.x, P.y + r * 0.15, r * 1.55, r * 1.08, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      }
      var lift = z * 0.9;
      var scale = (1 + z / (110 * sc)) * (inPit ? 0.8 : 1) * (1 + (d.squash || 0));
      ctx.save();
      if (inPit) ctx.globalAlpha = 0.8;
      R.drawFrog(ctx, f.kind, P.x, P.y - lift, r, d.facing, { dead: dead, t: t + f.id, scale: scale, wobble: d.wob || 0, flasks: f.flasks, fi: f.fi, noTongue: d.tongueOut });
      ctx.restore();
      if (d.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + d.flash * 0.6 + ')'; ell(ctx, P.x, P.y - lift, r * 1.15 * scale, r * 1.15 * scale); ctx.fill(); }
      if (dead) { // пар из сломанной жабы (§16)
        for (var k = 0; k < 3; k++) { var ph = (t * 0.6 + k * 0.33 + f.id * 0.2) % 1; ctx.fillStyle = 'rgba(220,220,220,' + (0.45 * (1 - ph)) + ')'; ell(ctx, P.x + Math.sin(k * 2 + t) * 6, P.y - ph * 30 * sc, 5 + ph * 8, 5 + ph * 8); ctx.fill(); }
      }
      if (!dead && z < 1) drawStatus(ctx, f, P.x, P.y, r, t);
    });

    if (scene.fxOver) scene.fxOver(ctx);
    if (scene.aim) drawAim(ctx, scene);
  };

  function drawStatus(c, f, x, y, r, t) {
    var icons = [];
    if (f.poison) icons.push(['☠', '#7dff6a']);
    if (f.bleed) icons.push(['💧', '#ff5a5a']);
    if (f.chill) icons.push(['❄', '#9fd8ff']);
    if (f.corroded) icons.push(['⚠', '#c6ff4a']);
    if (f.envShield) icons.push(['🛡', '#ffe08a']);
    icons.forEach(function (ic, i) {
      var ix = x + r * 1.25, iy = y - r * 1.1 + i * 13;
      c.fillStyle = 'rgba(15,10,6,0.8)'; ell(c, ix, iy, 7, 7); c.fill();
      c.font = '10px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = ic[1]; c.fillText(ic[0], ix, iy + 0.5);
    });
    if (f.poison) { c.fillStyle = 'rgba(90,230,80,' + (0.2 + 0.1 * Math.sin(t * 4)) + ')'; ell(c, x, y, r * 1.2, r * 1.0); c.fill(); }
    if (f.chill) { c.strokeStyle = 'rgba(170,220,255,0.8)'; c.lineWidth = 2; ell(c, x, y, r * 1.25, r * 1.05); c.stroke(); }
  }

  // ---------- превью прыжка (§7.1, §20) ----------
  var ICON = { dmg: '⚔', kb: '➜', crack: '⛏', dot: '☠', slow: '❄' };
  function drawAim(c, scene) {
    var a = scene.aim, sc = view.s, f = scene.state.frogs[a.frog], d = scene.disp[f.id];
    var F = R.toScreen(d.x, d.y);
    if (a.finger) { // натяжение — пружина от жабы к пальцу
      var Fi = a.finger;
      c.strokeStyle = 'rgba(230,200,130,0.9)'; c.lineWidth = 3;
      var n = 10, dx = Fi.x - F.x, dy = Fi.y - F.y, L = Math.hypot(dx, dy), nx = -dy / (L || 1), ny = dx / (L || 1);
      c.beginPath(); c.moveTo(F.x, F.y);
      for (var i = 1; i <= n; i++) { var u = i / n, w = (i % 2 ? 1 : -1) * 6 * (1 - Math.abs(u - 0.5)); c.lineTo(F.x + dx * u + nx * w, F.y + dy * u + ny * w); }
      c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.9)'; c.beginPath(); c.arc(Fi.x, Fi.y, 13, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#3aa6e8'; c.lineWidth = 4; c.stroke();
    }
    if (!a.valid) return;
    var pv = a.preview, t = scene.t;
    var end = R.toScreen(pv.land.x, pv.land.y), tgt = R.toScreen(a.target.x, a.target.y);
    // дальность
    c.strokeStyle = 'rgba(255,255,255,0.14)'; c.lineWidth = 1.5; c.beginPath(); c.arc(F.x, F.y, a.range * sc, 0, Math.PI * 2); c.stroke();
    // дуга
    var len = Math.hypot(end.x - F.x, end.y - F.y), H = FB.Sim.arcHeight(len / sc) * sc * 0.9, steps = Math.max(8, Math.round(len / 14));
    var stopU = pv.bonk ? 1 : 1;
    for (var k = 1; k <= steps; k++) {
      var u = k / steps * stopU, px = F.x + (end.x - F.x) * u, py = F.y + (end.y - F.y) * u - Math.sin(Math.PI * u) * H;
      c.fillStyle = 'rgba(140,210,255,' + (0.5 + 0.5 * ((u + t * 1.5) % 1)) + ')'; c.beginPath(); c.arc(px, py, 3.2, 0, Math.PI * 2); c.fill();
    }
    if (pv.bonk) { // объект первого столкновения
      c.strokeStyle = '#ff6a4a'; c.lineWidth = 3.5; var bx = end.x, by = end.y - 18;
      c.beginPath(); c.moveTo(bx - 7, by - 7); c.lineTo(bx + 7, by + 7); c.moveTo(bx + 7, by - 7); c.lineTo(bx - 7, by + 7); c.stroke();
    }
    // landing circle: цвет колбы или реакции
    var col = pv.color, lr = (pv.areaR || f.r + 6) * sc;
    c.fillStyle = 'rgba(' + col + ',0.18)'; c.strokeStyle = 'rgba(' + col + ',0.95)'; c.lineWidth = 3; c.setLineDash([9, 6]);
    c.beginPath(); c.arc(end.x, end.y, lr, t * 0.6, t * 0.6 + Math.PI * 2); c.fill(); c.stroke(); c.setLineDash([]);
    c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 2; c.beginPath(); c.arc(end.x, end.y, f.r * sc, 0, Math.PI * 2); c.stroke();
    // стрелки knockback (§15.2)
    (pv.pushes || []).forEach(function (p) {
      var A = R.toScreen(p.from.x, p.from.y), B = R.toScreen(p.to.x, p.to.y);
      if (Math.hypot(B.x - A.x, B.y - A.y) < 4) return;
      c.strokeStyle = 'rgba(255,230,120,0.95)'; c.lineWidth = 3; c.beginPath(); c.moveTo(A.x, A.y); c.lineTo(B.x, B.y); c.stroke();
      var ang = Math.atan2(B.y - A.y, B.x - A.x); c.fillStyle = 'rgba(255,230,120,0.95)';
      c.beginPath(); c.moveTo(B.x, B.y); c.lineTo(B.x - Math.cos(ang - 0.5) * 10, B.y - Math.sin(ang - 0.5) * 10); c.lineTo(B.x - Math.cos(ang + 0.5) * 10, B.y - Math.sin(ang + 0.5) * 10); c.closePath(); c.fill();
    });
    // урон над целями
    (pv.hits || []).forEach(function (h) {
      var dd = scene.disp[h.id], P = R.toScreen(dd.x, dd.y);
      label(c, P.x, P.y - scene.state.frogs[h.id].r * sc * 2.3, '-' + h.dmg + (h.kill ? ' KO' : ''), h.kill ? '#ffd23f' : '#ff6b6b', 15);
    });
    // название реакции у landing circle (§2.5)
    if (pv.title) {
      var ty = end.y - lr - 16;
      label(c, end.x, ty, pv.title, pv.titleColor || '#fff', pv.react ? 19 : 14);
      if (pv.icons && pv.icons.length) label(c, end.x, ty + 17, pv.icons.map(function (k) { return ICON[k]; }).join('  '), '#ffe9a8', 13);
    }
    if (pv.note) label(c, end.x, end.y + lr + 14, pv.note, '#ffe27a', 13);
  }
  function label(c, x, y, text, color, size) {
    c.font = '900 ' + (size || 15) + 'px Nunito, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 4.5; c.strokeStyle = 'rgba(15,10,6,0.9)'; c.strokeText(text, x, y);
    c.fillStyle = color; c.fillText(text, x, y);
  }
  R.label = label;
})();
