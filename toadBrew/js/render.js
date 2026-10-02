// Отрисовка Canvas 2D (D-014): пруд, кувшинки, процедурные жабы вида сверху, эффекты, превью прицела.
// Читает состояние симуляции (HP, статусы, кувшинки) и «экранную» модель анимации (позиции, высота прыжка).
(function () {
  var T = FB.T;
  var R = {};
  FB.R = R;

  var cv, ctx, dpr = 1, bg = null;
  var view = { s: 1, ox: 0, oy: 0, cw: 0, ch: 0 };
  R.view = view;

  R.init = function (canvas) { cv = canvas; ctx = cv.getContext('2d'); };

  // Поле вписывается между верхним HUD и нижней панелью действий
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

  // ---------- палитры жаб ----------
  var PAL = {
    jumper:  { body: '#2f66e3', dark: '#1a3c9c', light: '#e9f1ff', spot: '#ffffff' },
    bulwark: { body: '#2a8a99', dark: '#185863', light: '#d9f2ef', spot: '#7cc04e' },
    poison:  { body: '#8fb640', dark: '#58771f', light: '#c9df7d', spot: '#9b5cc9' },
    tongue:  { body: '#ea5a2f', dark: '#a8331a', light: '#ffb48e', spot: '#ffd2b8' },
    spur:    { body: '#a5733d', dark: '#6a4520', light: '#e0bb85', spot: '#f0d6a6' },
    mystic:  { body: '#55c7cb', dark: '#2a8d92', light: '#eafcff', spot: '#b8f4ff' }
  };
  R.PAL = PAL;
  var OUT = '#13262f';

  function ell(c, x, y, rx, ry, rot) { c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, Math.PI * 2); }

  // Жаба в локальных координатах: вперёд = -y, радиус r
  function frogShape(c, kind, r, t, o) {
    var p = PAL[kind], lw = Math.max(1.2, r * 0.11);
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.strokeStyle = OUT; c.lineWidth = lw;
    var legK = kind === 'jumper' ? 1.25 : (kind === 'bulwark' ? 0.85 : 1);
    // задние лапы
    for (var sgn = -1; sgn <= 1; sgn += 2) {
      c.fillStyle = p.dark;
      ell(c, sgn * r * 0.85, r * 0.55, r * 0.32 * legK, r * 0.62 * legK, sgn * -0.5); c.fill(); c.stroke();
      c.fillStyle = p.body;
      ell(c, sgn * r * 1.05, r * 1.05 * legK, r * 0.28, r * 0.16, sgn * 0.3); c.fill(); c.stroke();
      // пальцы
      for (var k = -1; k <= 1; k++) { c.fillStyle = p.light; ell(c, sgn * r * (1.2 + 0.05 * k), r * (1.15 * legK + 0.12 * k), r * 0.1, r * 0.08); c.fill(); }
    }
    // передние лапы
    for (sgn = -1; sgn <= 1; sgn += 2) {
      c.fillStyle = p.body;
      ell(c, sgn * r * 0.78, -r * 0.45, r * 0.18, r * 0.36, sgn * 0.6); c.fill(); c.stroke();
      c.fillStyle = p.light; ell(c, sgn * r * 0.95, -r * 0.72, r * 0.13, r * 0.1); c.fill(); c.stroke();
    }
    // шипы Spur — до тела, чтобы торчали по краю
    if (kind === 'spur') {
      c.fillStyle = p.spot;
      for (var i = 0; i < 11; i++) {
        var a = Math.PI * 0.15 + i / 10 * Math.PI * 1.7, ax = Math.cos(a), ay = Math.sin(a);
        c.beginPath();
        c.moveTo(ax * r * 0.82 - ay * r * 0.17, ay * r * 0.95 + ax * r * 0.17);
        c.lineTo(ax * r * 1.28, ay * r * 1.38);
        c.lineTo(ax * r * 0.82 + ay * r * 0.17, ay * r * 0.95 - ax * r * 0.17);
        c.closePath(); c.fill(); c.stroke();
      }
    }
    // тело
    var g = c.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.2, 0, 0, r * 1.2);
    g.addColorStop(0, p.light); g.addColorStop(0.25, p.body); g.addColorStop(1, p.dark);
    c.fillStyle = g;
    var bw = kind === 'bulwark' ? 1.12 : 1, bh = kind === 'bulwark' ? 1.12 : 1.08;
    ell(c, 0, r * 0.05, r * bw, r * bh); c.fill(); c.stroke();

    // приметы
    c.lineWidth = lw * 0.8;
    if (kind === 'jumper') {
      c.fillStyle = p.spot;
      [[-0.45, 0.2, 0.3, 0.2, 0.4], [0.4, 0.45, 0.25, 0.17, -0.3], [0.1, -0.05, 0.18, 0.12, 0.2], [-0.2, 0.65, 0.2, 0.13, 0], [0.55, -0.1, 0.12, 0.09, 0]].forEach(function (s) {
        ell(c, s[0] * r, s[1] * r, s[2] * r, s[3] * r, s[4]); c.fill();
      });
    } else if (kind === 'bulwark') {
      c.strokeStyle = p.light; c.lineWidth = r * 0.28;
      c.beginPath(); c.moveTo(-r * 0.55, -r * 0.05); c.quadraticCurveTo(0, r * 0.45, r * 0.55, -r * 0.05); c.stroke();
      c.strokeStyle = OUT; c.lineWidth = lw * 0.7;
      [[-0.7, 0.5], [0.7, 0.5], [-0.35, 0.8], [0.35, 0.82], [0, 0.95], [-0.8, 0.05], [0.8, 0.08], [-0.5, -0.45], [0.5, -0.45]].forEach(function (w) {
        c.fillStyle = p.spot; ell(c, w[0] * r, w[1] * r, r * 0.15, r * 0.15); c.fill(); c.stroke();
      });
    } else if (kind === 'poison') {
      c.fillStyle = p.dark;
      [[0.55, 0.25], [0.45, 0.7], [0.1, 0.05], [-0.25, -0.15], [0.5, -0.2]].forEach(function (w) { ell(c, w[0] * r, w[1] * r, r * 0.13, r * 0.11); c.fill(); });
      c.strokeStyle = OUT;
      [[-0.45, 0.35, 0.27], [-0.1, 0.62, 0.23], [-0.75, 0.62, 0.21], [0.25, 0.4, 0.18], [-0.6, 0.0, 0.17]].forEach(function (b) {
        var bg2 = c.createRadialGradient(b[0] * r - b[2] * r * 0.3, b[1] * r - b[2] * r * 0.3, 1, b[0] * r, b[1] * r, b[2] * r);
        bg2.addColorStop(0, '#d7a6f5'); bg2.addColorStop(1, '#6b2f96');
        c.fillStyle = bg2; ell(c, b[0] * r, b[1] * r, b[2] * r, b[2] * r); c.fill(); c.stroke();
      });
    } else if (kind === 'tongue') {
      c.strokeStyle = p.dark; c.lineWidth = r * 0.12;
      for (var j = 0; j < 3; j++) { c.beginPath(); c.arc(0, r * 0.35, r * (0.3 + j * 0.25), Math.PI * 1.15, Math.PI * 1.85); c.stroke(); }
      c.fillStyle = p.spot; [[-0.5, 0.6], [0.5, 0.6], [0, 0.85]].forEach(function (w) { ell(c, w[0] * r, w[1] * r, r * 0.1, r * 0.1); c.fill(); });
      if (!o.noTongue) { // язык из пасти
        c.strokeStyle = OUT; c.lineWidth = lw; c.fillStyle = '#ff8fb3';
        var tl = r * (0.55 + 0.1 * Math.sin(t * 3));
        c.beginPath(); c.moveTo(-r * 0.12, -r * 1.0); c.quadraticCurveTo(r * 0.25, -r - tl, r * 0.05, -r - tl * 1.2);
        c.quadraticCurveTo(-r * 0.25, -r - tl * 0.9, r * 0.1, -r * 1.0); c.closePath(); c.fill(); c.stroke();
      }
    } else if (kind === 'spur') {
      c.fillStyle = p.dark;
      [[-0.35, 0.3], [0.35, 0.35], [0, 0.65], [-0.15, -0.1], [0.45, -0.15], [-0.5, -0.3]].forEach(function (w) { ell(c, w[0] * r, w[1] * r, r * 0.14, r * 0.12); c.fill(); });
      c.fillStyle = p.light; [[-0.35, 0.3], [0.35, 0.35], [0, 0.65]].forEach(function (w) { ell(c, w[0] * r - r * 0.03, w[1] * r - r * 0.03, r * 0.05, r * 0.04); c.fill(); });
    } else if (kind === 'mystic') {
      c.strokeStyle = p.light; c.lineWidth = r * 0.1;
      c.beginPath(); c.arc(0, r * 0.3, r * 0.45, 0.3, Math.PI * 1.6); c.stroke();
      c.beginPath(); c.arc(0, r * 0.3, r * 0.2, Math.PI, Math.PI * 2.6); c.stroke();
    }

    // голова и глаза
    c.strokeStyle = OUT; c.lineWidth = lw;
    var eyeR = r * (kind === 'bulwark' ? 0.36 : 0.4), eyeY = -r * 0.62, eyeX = r * 0.48;
    for (sgn = -1; sgn <= 1; sgn += 2) {
      c.fillStyle = p.body; ell(c, sgn * eyeX, eyeY, eyeR * 1.18, eyeR * 1.15); c.fill(); c.stroke();
      if (o.dead) {
        c.strokeStyle = OUT; c.lineWidth = lw * 1.2;
        c.beginPath(); c.moveTo(sgn * eyeX - eyeR * 0.5, eyeY - eyeR * 0.5); c.lineTo(sgn * eyeX + eyeR * 0.5, eyeY + eyeR * 0.5);
        c.moveTo(sgn * eyeX + eyeR * 0.5, eyeY - eyeR * 0.5); c.lineTo(sgn * eyeX - eyeR * 0.5, eyeY + eyeR * 0.5); c.stroke();
        c.lineWidth = lw;
        continue;
      }
      var eg = c.createRadialGradient(sgn * eyeX - eyeR * 0.3, eyeY - eyeR * 0.3, 1, sgn * eyeX, eyeY, eyeR);
      eg.addColorStop(0, '#fff6a8'); eg.addColorStop(1, '#f5b800');
      c.fillStyle = eg; ell(c, sgn * eyeX, eyeY, eyeR, eyeR); c.fill(); c.stroke();
      var sleepy = kind === 'poison' || kind === 'mystic';
      c.fillStyle = '#0d1418';
      ell(c, sgn * eyeX + sgn * eyeR * 0.08, eyeY - eyeR * 0.05, eyeR * 0.42, eyeR * (sleepy ? 0.3 : 0.55)); c.fill();
      c.fillStyle = '#fff'; ell(c, sgn * eyeX - eyeR * 0.25, eyeY - eyeR * 0.3, eyeR * 0.18, eyeR * 0.18); c.fill();
      if (sleepy || kind === 'spur' || kind === 'tongue') { // веко — сонный/злой взгляд
        c.fillStyle = p.dark;
        c.beginPath();
        var ang = kind === 'spur' || kind === 'tongue' ? sgn * 0.45 : 0;
        c.ellipse(sgn * eyeX, eyeY, eyeR * 1.02, eyeR * 1.02, ang, Math.PI * 1.08, Math.PI * 1.92); c.closePath(); c.fill(); c.stroke();
      }
    }
  }

  // Брюшком вверх (§5: HP = 0)
  function deadShape(c, kind, r) {
    var p = PAL[kind], lw = Math.max(1.2, r * 0.11);
    c.strokeStyle = OUT; c.lineWidth = lw; c.lineCap = 'round';
    for (var sgn = -1; sgn <= 1; sgn += 2) {
      c.fillStyle = p.body;
      ell(c, sgn * r * 0.95, -r * 0.7, r * 0.18, r * 0.4, sgn * 0.7); c.fill(); c.stroke();
      ell(c, sgn * r * 0.9, r * 0.85, r * 0.2, r * 0.45, sgn * -0.6); c.fill(); c.stroke();
    }
    c.fillStyle = p.dark; ell(c, 0, 0, r * 1.05, r * 1.1); c.fill(); c.stroke();
    c.fillStyle = '#f2e9c9'; ell(c, 0, r * 0.08, r * 0.78, r * 0.85); c.fill();
    c.strokeStyle = OUT;
    for (sgn = -1; sgn <= 1; sgn += 2) {
      var ex = sgn * r * 0.38, ey = -r * 0.62, er = r * 0.2;
      c.fillStyle = '#ffe46a'; ell(c, ex, ey, er * 1.3, er * 1.3); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(ex - er * 0.7, ey - er * 0.7); c.lineTo(ex + er * 0.7, ey + er * 0.7);
      c.moveTo(ex + er * 0.7, ey - er * 0.7); c.lineTo(ex - er * 0.7, ey + er * 0.7); c.stroke();
    }
    c.fillStyle = '#ff8fb3'; c.beginPath(); c.ellipse(r * 0.2, -r * 0.2, r * 0.12, r * 0.4, 0.4, 0, Math.PI * 2); c.fill(); c.stroke();
  }

  R.drawFrog = function (c, kind, x, y, r, facing, o) {
    o = o || {};
    c.save(); c.translate(x, y); c.rotate(facing + (o.wobble || 0));
    var sc = o.scale || 1; c.scale(sc, sc);
    if (o.dead) deadShape(c, kind, r); else frogShape(c, kind, r, o.t || 0, o);
    c.restore();
  };

  // Портрет для экрана выбора
  R.portrait = function (canvas, kind, opts) {
    var c = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
    c.clearRect(0, 0, w, h);
    var r = Math.min(w, h) * 0.26 * (kind === 'bulwark' ? 1.08 : 1);
    c.save();
    c.fillStyle = 'rgba(0,0,0,0.25)'; ell(c, w / 2, h * 0.6 + r * 0.25, r * 1.4, r * 0.7); c.fill();
    R.drawFrog(c, kind, w / 2, h * 0.56, r, 0, { t: (opts && opts.t) || 0 });
    c.restore();
  };

  // ---------- фон ----------
  function hash(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  function buildBg() {
    bg = document.createElement('canvas');
    bg.width = cv.width; bg.height = cv.height;
    var c = bg.getContext('2d');
    c.scale(dpr, dpr);
    var w = view.cw, h = view.ch;
    var g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1d7f9c'); g.addColorStop(0.5, '#2a9cb5'); g.addColorStop(1, '#1b7590');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    // глубина: светлее в центре поля
    var cx = view.ox + T.W * view.s / 2, cy = view.oy + T.H * view.s / 2;
    var rg = c.createRadialGradient(cx, cy, 30, cx, cy, Math.max(w, h) * 0.7);
    rg.addColorStop(0, 'rgba(120,220,230,0.35)'); rg.addColorStop(1, 'rgba(10,50,70,0.35)');
    c.fillStyle = rg; c.fillRect(0, 0, w, h);
    // тёмные пятна дна
    for (var i = 0; i < 18; i++) {
      c.fillStyle = 'rgba(12,60,80,' + (0.08 + hash(i) * 0.1) + ')';
      ell(c, hash(i + 3) * w, hash(i + 7) * h, 30 + hash(i + 11) * 60, 20 + hash(i + 13) * 40, hash(i) * 3); c.fill();
    }
    // камни и камыши по краям поля
    var s = view.s;
    function rock(x, y, rr, seed) {
      c.save(); c.translate(x, y);
      c.fillStyle = 'rgba(0,0,0,0.25)'; ell(c, rr * 0.15, rr * 0.25, rr * 1.05, rr * 0.8); c.fill();
      c.beginPath();
      for (var k = 0; k < 9; k++) { var a = k / 9 * Math.PI * 2, rad = rr * (0.75 + hash(seed + k) * 0.35); c.lineTo(Math.cos(a) * rad, Math.sin(a) * rad * 0.8); }
      c.closePath();
      var rg2 = c.createLinearGradient(-rr, -rr, rr, rr); rg2.addColorStop(0, '#c9c9bf'); rg2.addColorStop(1, '#6f7470');
      c.fillStyle = rg2; c.fill(); c.strokeStyle = '#3c4440'; c.lineWidth = 2; c.stroke();
      c.fillStyle = 'rgba(110,160,70,0.85)'; ell(c, -rr * 0.2, -rr * 0.35, rr * 0.5, rr * 0.25, -0.3); c.fill();
      c.restore();
    }
    function reed(x, y, hgt, seed) {
      c.strokeStyle = '#3f7a2e'; c.lineWidth = 2.2;
      for (var k = 0; k < 4; k++) {
        var lean = (hash(seed + k) - 0.5) * 0.6;
        c.beginPath(); c.moveTo(x + k * 4, y); c.quadraticCurveTo(x + k * 4 + lean * hgt * 0.5, y - hgt * 0.5, x + k * 4 + lean * hgt, y - hgt); c.stroke();
      }
      c.fillStyle = '#7b4a25'; ell(c, x + 6, y - hgt * 0.95, 3.2, 9); c.fill();
    }
    function lotus(x, y, rr) {
      c.fillStyle = '#f3efe4';
      for (var k = 0; k < 7; k++) { var a = k / 7 * Math.PI * 2; ell(c, x + Math.cos(a) * rr * 0.55, y + Math.sin(a) * rr * 0.55, rr * 0.5, rr * 0.25, a); c.fill(); }
      c.fillStyle = '#ffd34a'; ell(c, x, y, rr * 0.3, rr * 0.3); c.fill();
    }
    var L = view.ox, Rr = view.ox + T.W * s, Tp = view.oy, B = view.oy + T.H * s;
    rock(L - 6, Tp + 40 * s, 34 * s, 1); rock(Rr + 8, Tp + 120 * s, 30 * s, 5); rock(L - 10, B - 170 * s, 30 * s, 9);
    rock(Rr + 4, B - 60 * s, 38 * s, 13); rock(L + 30 * s, B + 4, 26 * s, 17); rock(Rr - 40 * s, Tp - 6, 24 * s, 21);
    reed(L + 2, Tp + 260 * s, 46 * s, 3); reed(Rr - 20 * s, Tp + 330 * s, 52 * s, 8); reed(L + 6, B - 40 * s, 50 * s, 12); reed(Rr - 14 * s, Tp + 30 * s, 44 * s, 15);
    lotus(L + 22 * s, B - 110 * s, 12 * s); lotus(Rr - 26 * s, Tp + 210 * s, 11 * s); lotus(L + 30 * s, Tp + 140 * s, 9 * s);
    // мелкие декоративные листья (не игровые)
    for (i = 0; i < 9; i++) {
      var px = L + hash(i + 40) * T.W * s, py = Tp + hash(i + 50) * T.H * s;
      var edge = (hash(i + 60) > 0.5) ? L + 8 * s : Rr - 8 * s;
      px = edge; c.fillStyle = 'rgba(110,175,70,0.55)'; ell(c, px, py, 9 * s, 8 * s); c.fill();
    }
  }

  // ---------- кувшинки ----------
  R.drawPad = function (c, p, vis, t) {
    var s = view.s, P = R.toScreen(p.x, p.y), r = p.r * s;
    var notch = hash(p.id + 1) * Math.PI * 2;
    var sub = vis.sub;      // 0 — над водой, 1 — под водой
    var w = Math.min(1, vis.wear);
    var bob = vis.bob > 0 ? Math.sin(vis.bob * 18) * vis.bob * 0.08 : 0;
    var shrink = 1 - 0.1 * w - 0.12 * sub + bob;
    var lives = p.lives || 0, last = lives <= 0; // последняя жизнь: следующее затопление — навсегда (D-020)
    function shape(rad) {
      c.beginPath();
      c.moveTo(P.x, P.y);
      c.arc(P.x, P.y, rad, notch + 0.28, notch - 0.28 + Math.PI * 2);
      c.closePath();
    }
    if (sub > 0.98) {
      if (p.state === 'gone') { // утонула навсегда: обрывки листа расходятся и тают
        var gk = Math.min(1, vis.gone || 0);
        if (gk >= 1) return;
        c.save(); c.globalAlpha = (1 - gk) * 0.55;
        for (var q = 0; q < 5; q++) {
          var qa = notch + q * 1.25, qd = r * (0.3 + 0.5 * gk);
          c.fillStyle = 'rgba(60,90,40,0.9)';
          ell(c, P.x + Math.cos(qa) * qd, P.y + Math.sin(qa) * qd, r * 0.22, r * 0.12, qa); c.fill();
        }
        c.restore();
        return;
      }
      // тёмный контур под водой (§2.4); цветки всплытий видны сквозь воду
      var pulse = vis.recovering ? 0.12 + 0.1 * Math.sin(t * 5) : 0;
      shape(r * 0.88); c.fillStyle = 'rgba(8,45,60,' + (0.32 + pulse) + ')'; c.fill();
      if (vis.recovering) { c.strokeStyle = 'rgba(150,230,170,' + (0.35 + pulse) + ')'; c.lineWidth = 2; c.setLineDash([5, 5]); c.stroke(); c.setLineDash([]); }
      flowers(c, P, r * 0.88, notch, lives, 0.45, t, true);
      return;
    }
    // тень
    c.save(); c.globalAlpha = 1 - sub * 0.6;
    shape(r * shrink * 1.02); c.fillStyle = 'rgba(5,40,50,0.35)'; c.save(); c.translate(3 * s, 4 * s); c.fill(); c.restore();
    var rr = r * shrink;
    var g = c.createRadialGradient(P.x - rr * 0.3, P.y - rr * 0.3, rr * 0.1, P.x, P.y, rr);
    // износ: зелень темнеет и желтеет; последняя жизнь — лист пожухлый
    var base = mix([125, 196, 72], [110, 130, 60], w), edge = mix([70, 140, 45], [60, 85, 40], w);
    if (last) { base = mix(base, [168, 160, 78], 0.45); edge = mix(edge, [130, 95, 45], 0.6); }
    g.addColorStop(0, rgb(mix(base, [190, 230, 120], 0.35))); g.addColorStop(0.75, rgb(base)); g.addColorStop(1, rgb(edge));
    shape(rr); c.fillStyle = g; c.fill();
    c.strokeStyle = last ? 'rgba(95,70,30,0.9)' : 'rgba(40,90,30,0.9)'; c.lineWidth = Math.max(1.5, 2.2 * s); c.stroke();
    // прожилки
    c.strokeStyle = 'rgba(60,120,40,0.55)'; c.lineWidth = Math.max(1, 1.3 * s);
    for (var k = 1; k < 8; k++) {
      var a = notch + 0.28 + k / 8 * (Math.PI * 2 - 0.56);
      c.beginPath(); c.moveTo(P.x, P.y); c.lineTo(P.x + Math.cos(a) * rr * 0.85, P.y + Math.sin(a) * rr * 0.85); c.stroke();
    }
    if (last) { // трещины и бурые пятна
      c.strokeStyle = 'rgba(90,60,25,0.8)'; c.lineWidth = Math.max(1, 1.4 * s);
      for (var cr = 0; cr < 3; cr++) {
        var ca = notch + 1.2 + cr * 1.7, x0 = P.x + Math.cos(ca) * rr * 0.95, y0 = P.y + Math.sin(ca) * rr * 0.95;
        c.beginPath(); c.moveTo(x0, y0);
        c.lineTo(P.x + Math.cos(ca + 0.15) * rr * 0.7, P.y + Math.sin(ca + 0.15) * rr * 0.7);
        c.lineTo(P.x + Math.cos(ca - 0.05) * rr * 0.5, P.y + Math.sin(ca - 0.05) * rr * 0.5); c.stroke();
      }
      c.fillStyle = 'rgba(140,100,45,0.45)';
      ell(c, P.x + Math.cos(notch + 2.4) * rr * 0.45, P.y + Math.sin(notch + 2.4) * rr * 0.45, rr * 0.18, rr * 0.12, notch); c.fill();
      ell(c, P.x + Math.cos(notch + 4.1) * rr * 0.6, P.y + Math.sin(notch + 4.1) * rr * 0.6, rr * 0.12, rr * 0.08, notch); c.fill();
    }
    flowers(c, P, rr, notch, lives, 1, t, false);
    // Тонет (D-025): тронутая кувшинка — рябь по краю и пузырьки, пока не уйдёт под воду
    if (p.sinkLeft !== null && p.sinkLeft !== undefined) {
      for (var q = 0; q < 2; q++) {
        var ph = (t * 0.9 + q * 0.5 + p.id * 0.13) % 1;
        c.strokeStyle = 'rgba(200,245,255,' + (0.55 * (1 - ph)) + ')'; c.lineWidth = 2;
        c.beginPath(); c.arc(P.x, P.y, rr * (1.02 + ph * 0.35), 0, Math.PI * 2); c.stroke();
      }
      for (var bq = 0; bq < 4; bq++) {
        var bph = (t * 0.7 + bq * 0.25 + p.id * 0.31) % 1, ba = notch + bq * 1.6 + p.id;
        c.strokeStyle = 'rgba(225,250,255,' + (0.8 * (1 - bph)) + ')'; c.lineWidth = 1.2;
        c.beginPath(); c.arc(P.x + Math.cos(ba) * rr * 1.05, P.y + Math.sin(ba) * rr * 1.05 - bph * 8 * s, 1.5 + bph * 2.5 * s, 0, Math.PI * 2); c.stroke();
      }
    }
    // вода заливает край при проседании
    if (w > 0.45 || sub > 0) {
      var k2 = Math.min(1, (w - 0.45) / 0.55 + sub);
      c.strokeStyle = 'rgba(40,150,180,' + (0.35 + 0.45 * k2) + ')'; c.lineWidth = rr * 0.18 * k2 + 1;
      c.beginPath(); c.arc(P.x, P.y, rr * (0.95 - 0.04 * Math.sin(t * 4 + p.id)), 0, Math.PI * 2); c.stroke();
      c.fillStyle = 'rgba(40,150,180,' + (0.25 * k2) + ')'; shape(rr); c.fill();
    }
    c.restore();
  };

  // Цветки лотоса на листе: сколько цветков — столько раз кувшинка ещё всплывёт (D-020)
  function flowers(c, P, rr, notch, n, alpha, t, under) {
    if (n <= 0) return;
    var fr = Math.max(4, rr * 0.19), base = notch + Math.PI;
    c.save(); c.globalAlpha *= alpha;
    for (var i = 0; i < n; i++) {
      var d = rr - fr * 1.25, a = base + (i - (n - 1) / 2) * (fr * 2.3 / d);
      var x = P.x + Math.cos(a) * d, y = P.y + Math.sin(a) * d + (under ? Math.sin(t * 2 + i) * 1.5 : 0);
      for (var k = 0; k < 6; k++) {
        var pa = k / 6 * Math.PI * 2 + i;
        c.fillStyle = k % 2 ? '#ffb8d4' : '#ff8fbf';
        ell(c, x + Math.cos(pa) * fr * 0.5, y + Math.sin(pa) * fr * 0.5, fr * 0.55, fr * 0.3, pa); c.fill();
      }
      c.strokeStyle = 'rgba(150,40,90,0.6)'; c.lineWidth = 1; ell(c, x, y, fr * 0.95, fr * 0.95); c.stroke();
      c.fillStyle = '#ffd94a'; ell(c, x, y, fr * 0.3, fr * 0.3); c.fill();
    }
    c.restore();
  }
  function mix(a, b, k) { return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; }
  function rgb(a) { return 'rgb(' + (a[0] | 0) + ',' + (a[1] | 0) + ',' + (a[2] | 0) + ')'; }

  // ---------- кадр ----------
  // scene: { state, disp (frogs: x,y,z,facing,wob, flash), padVis, fx, aim, selected, t }
  R.frame = function (scene) {
    if (!cv.width || !cv.height) return; // вкладка ещё без размера (скрытая панель)
    if (!bg) buildBg();
    var s = scene.state, t = scene.t, sc = view.s;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bg, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (scene.shake > 0) ctx.translate((Math.random() - 0.5) * scene.shake, (Math.random() - 0.5) * scene.shake);

    // блики на воде
    ctx.strokeStyle = 'rgba(200,250,255,0.10)'; ctx.lineWidth = 1.5;
    for (var i = 0; i < 14; i++) {
      var bx = (hash(i + 90) * view.cw + t * 6 * (0.5 + hash(i))) % (view.cw + 60) - 30;
      var by = hash(i + 95) * view.ch;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx + 14, by - 4 + Math.sin(t + i) * 2, bx + 30, by); ctx.stroke();
    }
    if (!s) return;

    s.pads.forEach(function (p) { R.drawPad(ctx, p, scene.padVis[p.id] || { wear: 0, sub: 0, bob: 0 }, t); });

    // облака яда под жабами
    s.clouds.forEach(function (cl, ci) {
      var P = R.toScreen(cl.x, cl.y), rr = cl.r * sc, fade = Math.min(1, cl.turns / 2);
      for (var k = 0; k < 9; k++) {
        var a = k / 9 * Math.PI * 2 + t * 0.4 + ci, d = rr * (0.45 + 0.15 * Math.sin(t * 1.3 + k));
        ctx.fillStyle = 'rgba(150,230,60,' + (0.16 * fade) + ')';
        ell(ctx, P.x + Math.cos(a) * d, P.y + Math.sin(a) * d, rr * 0.5, rr * 0.42); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(190,255,90,' + (0.45 * fade) + ')'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.arc(P.x, P.y, rr, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    });

    if (scene.fxUnder) scene.fxUnder(ctx);

    // жабы: сначала тени, затем по высоте (летящая — сверху)
    // седок на спине (D-032) рисуется после того, кто под ним
    var order = s.frogs.slice().sort(function (a, b) { return (scene.disp[a.id].z || 0) - (scene.disp[b.id].z || 0) || ((a.on >= 0) - (b.on >= 0)) || a.y - b.y; });
    order.forEach(function (f) {
      var d = scene.disp[f.id], P = R.toScreen(d.x, d.y), r = f.r * sc, z = (d.z || 0) * sc;
      var riding = f.on >= 0 && z < 1 && d.alive;
      if (riding) z = 7 * sc; // сидит на спине — чуть выше нижней жабы
      var inWater = d.inWater, dead = !d.alive;
      // тень / рябь
      if (riding) { /* тень — сама нижняя жаба */ }
      else if (z > 0.5) { ctx.fillStyle = 'rgba(0,30,40,' + Math.max(0.12, 0.35 - z / 400) + ')'; ell(ctx, P.x, P.y, r * (1.1 - Math.min(0.5, z / 200)), r * (0.8 - Math.min(0.4, z / 220))); ctx.fill(); }
      else if (inWater) {
        ctx.strokeStyle = 'rgba(220,250,255,0.45)'; ctx.lineWidth = 1.5;
        var rp = (t * 0.8 + f.id * 0.3) % 1;
        ctx.beginPath(); ctx.ellipse(P.x, P.y, r * (1.2 + rp * 0.8), r * (1.0 + rp * 0.6), 0, 0, Math.PI * 2); ctx.globalAlpha = 1 - rp; ctx.stroke(); ctx.globalAlpha = 1;
      } else { ctx.fillStyle = 'rgba(10,50,30,0.3)'; ell(ctx, P.x + 2, P.y + 3, r * 1.05, r * 0.95); ctx.fill(); }

      var sel = scene.selected === f.id;
      if (sel && !dead && (z < 1 || riding)) { // выделение выбранной жабы
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(P.x, P.y, r * 1.55 + Math.sin(t * 5) * 1.5, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = 'rgba(120,220,255,0.5)'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(P.x, P.y, r * 1.55, 0, Math.PI * 2); ctx.stroke();
      }
      var canAct = scene.actable && scene.actable(f);
      if (canAct && !sel && (z < 1 || riding)) {
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2; ctx.setLineDash([4, 5]);
        ctx.beginPath(); ctx.arc(P.x, P.y, r * 1.45, t, t + Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      }

      if (d.glow) { // ультимативный прыжок — золотое сияние
        var gg = ctx.createRadialGradient(P.x, P.y - z * 0.9, r * 0.3, P.x, P.y - z * 0.9, r * 3);
        gg.addColorStop(0, 'rgba(255,220,120,0.75)'); gg.addColorStop(1, 'rgba(255,160,40,0)');
        ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(P.x, P.y - z * 0.9, r * 3, 0, Math.PI * 2); ctx.fill();
      }
      ctx.save();
      if (inWater && !dead && z < 1) { // в воде видна только верхняя часть
        ctx.globalAlpha = 0.92;
      }
      var lift = z * 0.9;
      var scale = (1 + z / (110 * sc)) * (inWater && z < 1 ? 0.92 : 1);
      if (d.squash) scale *= 1 + d.squash;
      R.drawFrog(ctx, f.kind, P.x, P.y - lift, r, d.facing, { dead: dead, t: t + f.id, scale: scale, wobble: d.wob || 0, noTongue: d.tongueOut });
      ctx.restore();
      if (inWater && !dead && z < 1) { // кромка воды поверх
        ctx.fillStyle = 'rgba(42,156,181,0.45)'; ell(ctx, P.x, P.y + r * 0.55, r * 1.2, r * 0.55); ctx.fill();
      }
      if (d.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + d.flash * 0.7 + ')'; ell(ctx, P.x, P.y - lift, r * 1.1 * scale, r * 1.1 * scale); ctx.fill(); }

      // статусы на поле
      if (!dead) {
        if (f.shield > 0) {
          ctx.strokeStyle = 'rgba(160,230,255,0.85)'; ctx.lineWidth = 2.5;
          ctx.fillStyle = 'rgba(160,230,255,0.15)';
          ctx.beginPath(); ctx.arc(P.x, P.y - lift, r * 1.45, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
        if (f.trapped > 0) {
          var bgr = ctx.createRadialGradient(P.x - r * 0.5, P.y - r * 0.6, 2, P.x, P.y, r * 1.7);
          bgr.addColorStop(0, 'rgba(255,255,255,0.55)'); bgr.addColorStop(0.7, 'rgba(150,220,255,0.18)'); bgr.addColorStop(1, 'rgba(120,200,255,0.5)');
          ctx.fillStyle = bgr; ctx.beginPath(); ctx.arc(P.x, P.y - 2, r * 1.7 + Math.sin(t * 3) * 1.5, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5; ctx.stroke();
        }
        if (f.kind === 'mystic') { // парящие пузырьки — примета
          for (var b = 0; b < 3; b++) {
            var ba = t * 1.2 + b * 2.1, bx2 = P.x + Math.cos(ba) * r * 1.5, by2 = P.y - lift + Math.sin(ba) * r * 1.3;
            ctx.strokeStyle = 'rgba(220,250,255,0.85)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(bx2, by2, r * 0.18, 0, Math.PI * 2); ctx.stroke();
          }
        }
        // локальные полоски HP / Stamina (§14)
        if (z < 1 || riding) drawBars(ctx, f, P.x, P.y - r * (riding ? 2.4 : 1.75) - lift, r);
      }
    });

    if (scene.fxOver) scene.fxOver(ctx);
    if (scene.aim) drawAim(ctx, scene);
  };

  function drawBars(c, f, x, y, r) {
    var w = Math.max(30, r * 2.4), h = 5;
    c.fillStyle = 'rgba(10,20,28,0.75)'; roundRect(c, x - w / 2 - 2, y - 2, w + 4, h * 2 + 5, 3); c.fill();
    c.fillStyle = '#3a1c22'; c.fillRect(x - w / 2, y, w, h);
    c.fillStyle = f.side === 0 ? '#ff4f5e' : '#ff4f5e'; c.fillRect(x - w / 2, y, w * f.hp / f.maxHp, h);
    var sy = y + h + 1, n = f.maxSt, gap = 1.5, sw = (w - gap * (n - 1)) / n;
    for (var i = 0; i < n; i++) { c.fillStyle = i < f.st ? '#3fc6ff' : '#1d3442'; c.fillRect(x - w / 2 + i * (sw + gap), sy, sw, h - 1); }
    // иконки статусов
    var ix = x + w / 2 + 6;
    if (f.poison > 0) { c.fillStyle = '#9be03a'; c.beginPath(); c.arc(ix, y + 4, 4, 0, Math.PI * 2); c.fill(); ix += 9; }
    if (f.bleed > 0) { c.fillStyle = '#ff3b3b'; c.beginPath(); c.moveTo(ix, y); c.quadraticCurveTo(ix + 4, y + 5, ix, y + 8); c.quadraticCurveTo(ix - 4, y + 5, ix, y); c.fill(); }
  }
  function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  R.roundRect = roundRect;

  // ---------- превью прицела (§4.1) ----------
  function drawAim(c, scene) {
    var a = scene.aim, sc = view.s, f = scene.state.frogs[a.frog], d = scene.disp[f.id];
    var F = R.toScreen(d.x, d.y);
    // резинка рогатки: от жабы к пальцу
    if (a.finger) {
      var Fi = a.finger;
      var grd = c.createLinearGradient(F.x, F.y, Fi.x, Fi.y); grd.addColorStop(0, 'rgba(180,235,255,0.15)'); grd.addColorStop(1, 'rgba(180,235,255,0.75)');
      c.strokeStyle = grd; c.lineWidth = 14 * Math.min(1, a.power + 0.3); c.lineCap = 'round';
      c.beginPath(); c.moveTo(F.x, F.y); c.lineTo(Fi.x, Fi.y); c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.9)'; c.beginPath(); c.arc(Fi.x, Fi.y, 13, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#3aa6e8'; c.lineWidth = 4; c.beginPath(); c.arc(Fi.x, Fi.y, 13, 0, Math.PI * 2); c.stroke();
      c.fillStyle = '#3aa6e8'; c.beginPath(); c.arc(Fi.x, Fi.y, 5, 0, Math.PI * 2); c.fill();
    }
    var pv = a.preview, t = scene.t;
    if (!a.valid) return;
    var kind = a.kind;
    if (kind === 'radius') {
      c.strokeStyle = 'rgba(255,220,120,0.9)'; c.lineWidth = 2.5; c.setLineDash([7, 6]);
      c.beginPath(); c.arc(F.x, F.y, a.range * sc + 18 * sc, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
      c.fillStyle = 'rgba(255,200,90,0.12)'; c.fill();
    } else {
      var L = a.target, Ls = R.toScreen(L.x, L.y);
      var end = a.end ? R.toScreen(a.end.x, a.end.y) : Ls;
      // дальность — тонкий круг
      c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(F.x, F.y, a.range * sc, 0, Math.PI * 2); c.stroke();
      var n = Math.max(6, Math.round(Math.hypot(end.x - F.x, end.y - F.y) / 16));
      for (var i = 1; i <= n; i++) {
        var u = i / n, px = F.x + (end.x - F.x) * u, py = F.y + (end.y - F.y) * u;
        if (kind === 'arc') py -= Math.sin(Math.PI * u) * Math.min(90, Math.hypot(end.x - F.x, end.y - F.y) * 0.35);
        var rad = 3.2 + (kind === 'arc' ? Math.sin(Math.PI * u) * 1.8 : 0);
        c.fillStyle = 'rgba(255,255,255,' + (0.55 + 0.45 * ((u + t * 1.5) % 1)) + ')';
        c.beginPath(); c.arc(px, py, rad, 0, Math.PI * 2); c.fill();
      }
      // точка приземления
      var col = pv.hitEnemy ? '255,90,90' : (pv.mount ? '120,255,150' : (pv.water ? '120,200,255' : '255,255,255'));
      c.strokeStyle = 'rgba(' + col + ',0.95)'; c.lineWidth = 3;
      var lr = (a.markR || 16) * sc;
      c.beginPath(); c.arc(end.x, end.y, lr, 0, Math.PI * 2); c.stroke();
      c.save(); c.translate(end.x, end.y); c.rotate(t * 1.5);
      for (var k = 0; k < 4; k++) { c.rotate(Math.PI / 2); c.beginPath(); c.moveTo(lr + 2, 0); c.lineTo(lr + 8, 0); c.stroke(); }
      c.restore();
      if (a.areaR) { // радиус удара / облака
        c.fillStyle = 'rgba(' + (a.areaColor || '255,200,90') + ',0.14)'; c.strokeStyle = 'rgba(' + (a.areaColor || '255,200,90') + ',0.8)';
        c.lineWidth = 2; c.setLineDash([6, 5]); c.beginPath(); c.arc(end.x, end.y, a.areaR * sc, 0, Math.PI * 2); c.fill(); c.stroke(); c.setLineDash([]);
      }
      // прицел заранее говорит, будет ли урон (D-030)
      if (pv.hitEnemy) { c.fillStyle = 'rgba(255,90,90,0.25)'; c.beginPath(); c.arc(end.x, end.y, lr, 0, Math.PI * 2); c.fill(); label(c, end.x, end.y + lr + 14, 'HIT', '#ff6b6b'); }
      else if (pv.mount) label(c, end.x, end.y + lr + 14, 'HOP ON', '#9dffb0');
      else if (pv.nearMiss) label(c, end.x, end.y + lr + 14, 'NO HIT', '#c9d6de');
      if (pv.water && !pv.hitEnemy && !pv.mount && !pv.nearMiss && a.mode !== 'ability') {
        label(c, end.x, end.y + lr + 14, 'WATER', '#9fdcff');
      }
    }
    // прогноз урона над целями
    (pv.hits || []).forEach(function (h) {
      var dd = scene.disp[h.id], P = R.toScreen(dd.x, dd.y);
      label(c, P.x, P.y - scene.state.frogs[h.id].r * sc * 2.6, '-' + h.dmg + (h.kill ? ' KO' : ''), h.kill ? '#ffd23f' : '#ff6b6b');
    });
    if (pv.note) label(c, F.x, F.y + f.r * sc * 2.4, pv.note, '#ffe27a');
  }
  function label(c, x, y, text, color) {
    c.font = '800 15px Nunito, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 4; c.strokeStyle = 'rgba(10,20,30,0.85)'; c.strokeText(text, x, y);
    c.fillStyle = color; c.fillText(text, x, y);
  }
  R.label = label;
})();
