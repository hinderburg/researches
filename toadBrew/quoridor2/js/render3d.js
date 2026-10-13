// 3D-рендер итерации 2 (Three.js r128): арена по макету с высокими стенами, перспективная камера сверху
// (панорама, зум, слежение), жабы из отдельных частей (атлас + риг) с позами прыжка, приземления и захвата стены,
// эликсир в резервуаре перекрашивается под элемент (D-053, D-054). Состояние читает из main.js, сам ничего не решает.
(function () {
  var T = FB.T, AR = FB.ARENA, K = FB.K;
  var W = T.IMG_W * K, H = T.IMG_H * K;
  var R = FB.R3 = { fxScale: 1 };
  var renderer, scene, camera, cv, sun, labels;
  var tex = {}, rigs = {}, atlasImg = {}, fullImg = {}, recolored = {};
  var frogs = {}, dyn = { cells: {} }, fxList = [], aimGroup = null;
  var app = null;

  // ---------- камера (D-051) ----------
  var cam = { tx: W / 2, ty: H * 0.72, d: 1000, td: 1000, maxD: 2000, minD: 400, tilt: 0.1, fov: 64, follow: null, user: false, shake: 0 };
  R.cam = cam;

  function hsl2rgb(h, s, l) {
    var c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2, r, g, b;
    if (h < 60) { r = c; g = x; b = 0; } else if (h < 120) { r = x; g = c; b = 0; } else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; } else if (h < 300) { r = x; g = 0; b = c; } else { r = c; g = 0; b = x; }
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  }
  function rgb2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, s = 0, h = 0, d = mx - mn;
    if (d > 1e-6) { s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : (mx === g ? (b - r) / d + 2 : (r - g) / d + 4); h *= 60; }
    return [h, s, l];
  }
  // Эликсир на артах бирюзовый: перекрашиваем пиксели этого тона в цвет элемента (D-054)
  function recolor(img, el) {
    var c = document.createElement('canvas'); c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
    var x = c.getContext('2d'); x.drawImage(img, 0, 0);
    if (el === 'orig') return c; // исходный арт — на экране команды
    var E = FB.ELEMENTS[el], id = x.getImageData(0, 0, c.width, c.height), d = id.data; // без элемента / пустой бак — серый резервуар (§37)
    for (var i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 10) continue;
      var q = rgb2hsl(d[i], d[i + 1], d[i + 2]);
      if (q[0] < 150 || q[0] > 195 || q[1] < 0.25) continue;
      var rgb = E ? hsl2rgb(E.hue, Math.min(1, q[1] * 1.3 + 0.25), Math.min(0.95, q[2] + (E.light || 0))) : hsl2rgb(30, 0.06, q[2] * 0.7); // ярче, чем на арте: «краска» (D-063)
      d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2];
    }
    x.putImageData(id, 0, 0);
    return c;
  }
  function atlasTank(kind) { // круг резервуара в координатах атласа (в риге — относительно детали тела)
    var r = rigs[kind], b = r.parts.filter(function (p) { return p.name === 'body'; })[0];
    return { cx: b.rect[0] + r.tank.cx, cy: b.rect[1] + r.tank.cy, r: r.tank.r };
  }
  // Арт гайда v2 (D-140): резервуар — кремовое стекло в круге на теле; красим только его, блик стекла оставляем белым
  function recolorTank(img, el, tk) {
    var c = document.createElement('canvas'); c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
    var x = c.getContext('2d'); x.drawImage(img, 0, 0);
    if (el === 'orig' || !tk) return c;
    var E = FB.ELEMENTS[el], x0 = Math.max(0, Math.floor(tk.cx - tk.r)), y0 = Math.max(0, Math.floor(tk.cy - tk.r)), w = Math.min(c.width - x0, Math.ceil(tk.r * 2)), h = Math.min(c.height - y0, Math.ceil(tk.r * 2));
    var id = x.getImageData(x0, y0, w, h), d = id.data;
    for (var yy = 0; yy < h; yy++) for (var xx = 0; xx < w; xx++) {
      var px = x0 + xx - tk.cx, py = y0 + yy - tk.cy; if (px * px + py * py > tk.r * tk.r) continue;
      var o = (yy * w + xx) * 4; if (d[o + 3] < 10) continue;
      var mx = Math.max(d[o], d[o + 1], d[o + 2]), mn = Math.min(d[o], d[o + 1], d[o + 2]), L = (mx + mn) / 510;
      if (L < 0.55 || mx - mn > 80) continue; // латунь и тёмный контур — мимо
      if (L > 0.93) continue;                  // блик
      var t = (L - 0.55) / 0.38, rgb = E ? hsl2rgb(E.hue, 0.9, 0.3 + t * 0.38 + (E.light || 0)) : hsl2rgb(30, 0.05, 0.3 + t * 0.25);
      d[o] = rgb[0]; d[o + 1] = rgb[1]; d[o + 2] = rgb[2];
    }
    x.putImageData(id, x0, y0);
    return c;
  }
  R.portrait = function (kind, el) { // канвас для UI (команда, алхимия, HUD)
    var key = 'full:' + kind + ':' + (el || '');
    if (!recolored[key] && fullImg[kind]) recolored[key] = rigs[kind] && rigs[kind].tankFull ? recolorTank(fullImg[kind], el, rigs[kind].tankFull) : recolor(fullImg[kind], el);
    return recolored[key];
  };
  function atlasTex(kind, el) {
    var key = kind + ':' + (el || '');
    if (!tex[key]) {
      var t = new THREE.CanvasTexture(rigs[kind] && rigs[kind].tank ? recolorTank(atlasImg[kind], el, atlasTank(kind)) : recolor(atlasImg[kind], el));
      t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
      tex[key] = t;
    }
    return tex[key];
  }

  // ---------- упрощение визуала (итерация 4, D-106) ----------
  // Фильтр Кувахары: мелкие детали (заклёпки, царапины, мох, трещины) сливаются в ровные плоские участки,
  // контуры сохраняются. Потом мягкое квантование яркости (qw — вес ступени) — «монолитные» детали.
  // Суммы по квадрантам — через интегральные изображения; картинка обрабатывается полосами (память телефона).
  function simplifyImage(img, r, levels, qw, lineL) {
    var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var x = c.getContext('2d'); x.drawImage(img, 0, 0);
    var src = x.getImageData(0, 0, w, h), d = src.data, out = x.createImageData(w, h), od = out.data, W = w + 1, BAND = 192;
    for (var b0 = 0; b0 < h; b0 += BAND) {
      var b1 = Math.min(h, b0 + BAND), y0b = Math.max(0, b0 - r), y1b = Math.min(h - 1, b1 - 1 + r), bh = y1b - y0b + 1, N = W * (bh + 1);
      var IA = new Float64Array(N), IR = new Float64Array(N), IG = new Float64Array(N), IB = new Float64Array(N), IY = new Float64Array(N), IY2 = new Float64Array(N);
      for (var yy = 0; yy < bh; yy++) {
        var ra = 0, rr = 0, rg = 0, rb = 0, ry = 0, ry2 = 0;
        for (var xx = 0; xx < w; xx++) {
          var o = ((yy + y0b) * w + xx) * 4, a = d[o + 3] / 255, R0 = d[o], G0 = d[o + 1], B0 = d[o + 2], Y = 0.3 * R0 + 0.59 * G0 + 0.11 * B0;
          ra += a; rr += R0 * a; rg += G0 * a; rb += B0 * a; ry += Y * a; ry2 += Y * Y * a;
          var k = (yy + 1) * W + xx + 1, up = yy * W + xx + 1;
          IA[k] = IA[up] + ra; IR[k] = IR[up] + rr; IG[k] = IG[up] + rg; IB[k] = IB[up] + rb; IY[k] = IY[up] + ry; IY2[k] = IY2[up] + ry2;
        }
      }
      var S = function (I, x0, ya, x1, yb) { ya -= y0b; yb -= y0b; return I[(yb + 1) * W + x1 + 1] - I[ya * W + x1 + 1] - I[(yb + 1) * W + x0] + I[ya * W + x0]; };
      for (yy = b0; yy < b1; yy++) for (xx = 0; xx < w; xx++) {
        var p = (yy * w + xx) * 4; od[p + 3] = d[p + 3];
        if (d[p + 3] < 8) continue;
        var best = 1e18, br = d[p], bg = d[p + 1], bb = d[p + 2];
        for (var q = 0; q < 4; q++) {
          var x0 = q & 1 ? xx : xx - r, x1 = q & 1 ? xx + r : xx, ya = q & 2 ? yy : yy - r, yb = q & 2 ? yy + r : yy;
          if (x0 < 0) x0 = 0; if (ya < y0b) ya = y0b; if (x1 >= w) x1 = w - 1; if (yb > y1b) yb = y1b;
          var sa = S(IA, x0, ya, x1, yb); if (sa < 1.5) continue;
          var my = S(IY, x0, ya, x1, yb) / sa, v = S(IY2, x0, ya, x1, yb) / sa - my * my;
          if (v < best) { best = v; br = S(IR, x0, ya, x1, yb) / sa; bg = S(IG, x0, ya, x1, yb) / sa; bb = S(IB, x0, ya, x1, yb) / sa; }
        }
        // линейный рисунок исходника (контуры, швы между деталями) сохраняем поверх плоской заливки
        if (lineL && d[p + 3] > 128) { var oL = (Math.max(d[p], d[p + 1], d[p + 2]) + Math.min(d[p], d[p + 1], d[p + 2])) / 510; if (oL < lineL) { od[p] = d[p] * 0.8; od[p + 1] = d[p + 1] * 0.8; od[p + 2] = d[p + 2] * 0.8; continue; } }
        var hl = rgb2hsl(br, bg, bb), L = hl[2];
        if (L > 0.12) { var qL = (Math.floor(L * levels) + 0.5) / levels; L = L * (1 - qw) + qL * qw; }
        var rgb = hsl2rgb(hl[0], Math.min(1, hl[1] * 1.12), Math.max(0, Math.min(1, L)));
        od[p] = rgb[0]; od[p + 1] = rgb[1]; od[p + 2] = rgb[2];
      }
    }
    x.putImageData(out, 0, 0);
    return c;
  }
  R.simplifyImage = simplifyImage;
  function simplifyAll() {
    if (!T.simplify) return;
    var t0 = performance.now();
    FB.FROG_ORDER.forEach(function (k) {
      if (rigs[k] && rigs[k].src) return; // арт гайда v2 и так чистый — не размываем (D-140)
      atlasImg[k] = simplifyImage(atlasImg[k], T.simplifyFrogR, T.simplifyLevels, 0.55, T.simplifyLineL);
      fullImg[k] = simplifyImage(fullImg[k], T.simplifyFrogR + 2, T.simplifyLevels, 0.55, T.simplifyLineL);
    });
    atlasImg.arena = simplifyImage(atlasImg.arena, T.simplifyArenaR, T.simplifyLevels + 2, 0.3, T.simplifyLineL * 0.7);
    console.log('[FB] simplify ' + Math.round(performance.now() - t0) + ' ms');
  }
  // ---------- загрузка ----------
  var BUILD = window.FB_BUILD && window.FB_BUILD !== 'dev' ? window.FB_BUILD : String(Date.now()); // метка сборки против кэша
  function bust(src) { return src + '?b=' + BUILD; }
  function loadImg(src) { return new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = function () { rej(new Error(src)); }; i.src = bust(src); }); }
  R.load = function () {
    var jobs = [loadImg('art/src/arena.webp').then(function (i) { atlasImg.arena = i; })];
    FB.FROG_ORDER.forEach(function (k) {
      jobs.push(loadImg('art/out/' + k + '_atlas.png').then(function (i) { atlasImg[k] = i; }));
      jobs.push(loadImg('art/out/' + k + '_full.png').then(function (i) { fullImg[k] = i; }));
      jobs.push(fetch(bust('art/out/' + k + '_rig.json')).then(function (r) { return r.json(); }).then(function (j) { rigs[k] = j; }));
    });
    return Promise.all(jobs).then(simplifyAll);
  };

  // ---------- инициализация ----------
  R.init = function (canvas, labelsEl, appRef) {
    cv = canvas; labels = labelsEl; app = appRef;
    renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x120c08);
    camera = new THREE.PerspectiveCamera(cam.fov, 1, 10, 9000);
    scene.add(new THREE.HemisphereLight(0xfff2dc, 0x3a2a1c, 0.75));
    sun = new THREE.DirectionalLight(0xffe8c8, 0.75);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    var sc = sun.shadow.camera; sc.left = -W * 0.62; sc.right = W * 0.62; sc.top = H * 0.6; sc.bottom = -H * 0.6; sc.near = 100; sc.far = 4000;
    sun.shadow.bias = -0.0015;
    sun.position.set(W / 2 - 600, 1500, H / 2 - 450); sun.target.position.set(W / 2, 0, H / 2);
    scene.add(sun); scene.add(sun.target);
    buildArena();
    R.resize();
  };

  R.resize = function () {
    if (!renderer) return;
    var w = cv.clientWidth || 1, h = cv.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    var tf = Math.tan(cam.fov * Math.PI / 360);
    cam.maxD = Math.max(H / (2 * tf), W / (2 * tf * camera.aspect)) * 1.04;
    cam.minD = cam.maxD * 0.2;
    if (!cam.inited) { cam.inited = true; cam.d = cam.td = cam.maxD * 0.5; } // ≈ четверть карты на экране: карта ~ 4 экрана
    cam.td = Math.max(cam.minD, Math.min(cam.maxD, cam.td));
  };

  // ---------- арена ----------
  function stoneTexture() {
    var c = document.createElement('canvas'); c.width = c.height = 256;
    var x = c.getContext('2d'); x.fillStyle = '#4a4038'; x.fillRect(0, 0, 256, 256);
    var simple = T.simplify, rows = simple ? 4 : 8, bw = simple ? 128 : 64, bh = 256 / rows; // упрощённый вид — крупные ровные блоки (D-106)
    for (var row = 0; row < rows; row++) for (var col = -1; col < 256 / bw + 1; col++) {
      var bx = col * bw + (row % 2) * bw / 2, by = row * bh, v = simple ? 86 + (row % 2) * 8 : 70 + Math.random() * 40;
      x.fillStyle = 'rgb(' + (v + 10 | 0) + ',' + (v | 0) + ',' + (v - 12 | 0) + ')';
      x.fillRect(bx + 3, by + 3, bw - 6, bh - 6);
      x.fillStyle = 'rgba(255,240,210,0.08)'; x.fillRect(bx + 3, by + 3, bw - 6, simple ? 6 : 4);
      x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(bx + 3, by + bh - (simple ? 9 : 7), bw - 6, simple ? 6 : 4);
    }
    var t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding;
    return t;
  }
  // UV: верх — по картинке арены, бока — кирпич по длине и высоте
  var arenaUV = {
    generateTopUV: function (g, v, a, b, c) {
      return [a, b, c].map(function (i) { return new THREE.Vector2(v[i * 3] / W, 1 + v[i * 3 + 1] / H); });
    },
    generateSideWallUV: function (g, v, a, b, c, d) {
      var ax = v[a * 3], ay = v[a * 3 + 1], az = v[a * 3 + 2], bx = v[b * 3], by = v[b * 3 + 1], bz = v[b * 3 + 2];
      var cx = v[c * 3], cy = v[c * 3 + 1], cz = v[c * 3 + 2], dx = v[d * 3], dy = v[d * 3 + 1], dz = v[d * 3 + 2], S = 1 / 128;
      if (Math.abs(ay - by) < Math.abs(ax - bx)) return [new THREE.Vector2(ax * S, az * S), new THREE.Vector2(bx * S, bz * S), new THREE.Vector2(cx * S, cz * S), new THREE.Vector2(dx * S, dz * S)];
      return [new THREE.Vector2(ay * S, az * S), new THREE.Vector2(by * S, bz * S), new THREE.Vector2(cy * S, cz * S), new THREE.Vector2(dy * S, dz * S)];
    }
  };
  // Пол (§4, D-112): арт макета без колонны, поверх — каменные плиты по сетке: швы, латунные рамки баз, гравировка фляг.
  // Сетка видна «строительством пола», а не шахматной доской.
  function arenaArt() {
    var img = atlasImg.arena, c = document.createElement("canvas"); c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
    var x = c.getContext('2d'), o = AR.columnArt, w = o.x1 - o.x0, h = o.y1 - o.y0;
    x.drawImage(img, 0, 0);
    x.drawImage(img, o.x0, o.y1 + 45, w, h, o.x0, o.y0, w, h); // колонны больше нет — на её месте пол
    var k = 1 / K, X0 = AR.x0 * k, Y0 = AR.y0 * k, cs = T.cell * k, NC = T.cols, NR = T.rows;
    // плиты: каждая клетка чуть светлее или темнее, мягкая фаска
    for (var r = 0; r < NR; r++) for (var cc = 0; cc < NC; cc++) {
      var px = X0 + cc * cs, py = Y0 + r * cs, v = ((r * 7 + cc * 13) % 5) / 5;
      x.fillStyle = 'rgba(' + (v > 0.5 ? '255,236,200,' : '0,0,0,') + (0.05 + 0.04 * Math.abs(v - 0.5)) + ')'; x.fillRect(px, py, cs, cs);
      x.fillStyle = 'rgba(255,240,210,0.10)'; x.fillRect(px + 2, py + 2, cs - 4, 2); x.fillRect(px + 2, py + 2, 2, cs - 4);
      x.fillStyle = 'rgba(0,0,0,0.20)'; x.fillRect(px + 2, py + cs - 4, cs - 4, 2); x.fillRect(px + cs - 4, py + 2, 2, cs - 4);
    }
    x.strokeStyle = 'rgba(20,12,6,0.75)'; x.lineWidth = 2.2; // швы
    x.beginPath();
    for (cc = 0; cc <= NC; cc++) { x.moveTo(X0 + cc * cs, Y0); x.lineTo(X0 + cc * cs, Y0 + NR * cs); }
    for (r = 0; r <= NR; r++) { x.moveTo(X0, Y0 + r * cs); x.lineTo(X0 + NC * cs, Y0 + r * cs); }
    x.stroke();
    // базы: латунная рамка и цвет стороны (внизу — твоя, синяя; вверху — враг, красный)
    [[NR - T.baseRows, '74,163,255'], [0, '255,90,74']].forEach(function (b) {
      var by = Y0 + b[0] * cs, bh = T.baseRows * cs;
      x.fillStyle = 'rgba(' + b[1] + ',0.10)'; x.fillRect(X0, by, NC * cs, bh);
      x.strokeStyle = 'rgba(214,168,80,0.9)'; x.lineWidth = 4; x.strokeRect(X0 + 3, by + 3, NC * cs - 6, bh - 6);
      x.strokeStyle = 'rgba(' + b[1] + ',0.7)'; x.lineWidth = 2; x.strokeRect(X0 + 9, by + 9, NC * cs - 18, bh - 18);
      x.save(); x.beginPath(); x.rect(X0 + 9, by + 9, NC * cs - 18, bh - 18); x.clip(); x.strokeStyle = 'rgba(' + b[1] + ',0.13)'; x.lineWidth = 7; // база не красится (D-147): штриховка
      for (var hx = -bh; hx < NC * cs; hx += 30) { x.beginPath(); x.moveTo(X0 + hx, by + bh); x.lineTo(X0 + hx + bh, by); x.stroke(); }
      x.restore();
    });
    // гравировка под флягами
    AR.flasks.forEach(function (f, side) {
      var fx = f.x * k, fy = f.y * k, rr = T.flaskR * k;
      x.strokeStyle = 'rgba(214,168,80,0.95)'; x.lineWidth = 3; x.beginPath(); x.arc(fx, fy, rr, 0, 7); x.stroke();
      x.strokeStyle = side === 0 ? 'rgba(74,163,255,0.8)' : 'rgba(255,90,74,0.8)'; x.lineWidth = 2; x.beginPath(); x.arc(fx, fy, rr - 6, 0, 7); x.stroke();
      for (var i = 0; i < 12; i++) { var a = i / 12 * 6.283; x.beginPath(); x.moveTo(fx + Math.cos(a) * (rr - 6), fy + Math.sin(a) * (rr - 6)); x.lineTo(fx + Math.cos(a) * (rr + 6), fy + Math.sin(a) * (rr + 6)); x.stroke(); }
    });
    return c;
  }
  function extrude(shape, h, topMat, sideMat) {
    var g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, UVGenerator: arenaUV });
    g.rotateX(-Math.PI / 2); // (x, −y, h) → (x, h, y)
    var m = new THREE.Mesh(g, [topMat, sideMat]);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }
  var flaskObjs = [];
  function buildArena() {
    var at = new THREE.Texture(arenaArt()); at.needsUpdate = true; at.encoding = THREE.sRGBEncoding; at.anisotropy = 8;
    var floorMat = new THREE.MeshLambertMaterial({ map: at });
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), floorMat);
    floor.rotation.x = -Math.PI / 2; floor.position.set(W / 2, 0, H / 2); floor.receiveShadow = true;
    scene.add(floor);
    var under = new THREE.Mesh(new THREE.PlaneGeometry(W * 4, H * 3), new THREE.MeshBasicMaterial({ color: 0x0d0906 }));
    under.rotation.x = -Math.PI / 2; under.position.set(W / 2, -2, H / 2); scene.add(under);

    var stone = stoneTexture();
    var topMat = new THREE.MeshLambertMaterial({ map: stone, color: 0x8a7c6a }), sideMat = new THREE.MeshLambertMaterial({ map: stone, color: 0xb8a890 });
    // стены вокруг прямоугольного поля, выше любой дуги прыжка
    var outer = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(W, 0), new THREE.Vector2(W, -H), new THREE.Vector2(0, -H)]);
    outer.holes.push(new THREE.Path(AR.floor.map(function (p) { return new THREE.Vector2(p.x, -p.y); })));
    scene.add(extrude(outer, T.wallH, topMat, sideMat));
    // Base Flask (§3): стеклянная колба с эликсиром цвета стороны на латунной подставке
    AR.flasks.forEach(function (p, side) {
      var g = new THREE.Group(), col = side === 0 ? 0x3aa0ff : 0xff4a3a;
      var base = new THREE.Mesh(new THREE.CylinderGeometry(T.flaskR * 0.62, T.flaskR * 0.7, 14, 24), new THREE.MeshLambertMaterial({ color: 0xb08a40 }));
      base.position.y = 7; base.castShadow = true; g.add(base);
      var liquid = new THREE.Mesh(new THREE.SphereGeometry(T.flaskR * 0.44, 24, 16), new THREE.MeshLambertMaterial({ color: col, emissive: new THREE.Color(col).multiplyScalar(0.25) }));
      liquid.position.y = 14 + T.flaskR * 0.46; g.add(liquid);
      var glass = new THREE.Mesh(new THREE.SphereGeometry(T.flaskR * 0.56, 24, 16), new THREE.MeshLambertMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.16, depthWrite: false }));
      glass.position.y = 14 + T.flaskR * 0.52; g.add(glass);
      var neck = new THREE.Mesh(new THREE.CylinderGeometry(T.flaskR * 0.16, T.flaskR * 0.2, T.flaskR * 0.55, 16), new THREE.MeshLambertMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.35, depthWrite: false }));
      neck.position.y = 14 + T.flaskR * 1.25; g.add(neck);
      var cork = new THREE.Mesh(new THREE.CylinderGeometry(T.flaskR * 0.2, T.flaskR * 0.17, 12, 12), new THREE.MeshLambertMaterial({ color: 0x8a5a30 }));
      cork.position.y = 14 + T.flaskR * 1.58; g.add(cork);
      var glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: new THREE.Color(col), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.scale.set(T.flaskR * 1.6, T.flaskR * 1.6, 1); glow.position.y = 30; glow.material.opacity = 0.28; g.add(glow);
      var ring = new THREE.Mesh(new THREE.RingGeometry(T.flaskR - 5, T.flaskR, 48), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.6, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 1.4; g.add(ring);
      g.position.set(p.x, 0, p.y); scene.add(g);
      flaskObjs.push({ g: g, liquid: liquid, glow: glow, ring: ring, ly: liquid.position.y });
    });
  }
  R.flaskObjs = flaskObjs;
  // Победа (D-137): жаба влетает во флягу — колба взрывается осколками стекла, эликсир выплёскивается и растекается по полу
  R.flaskBurst = function (side) {
    var F = flaskObjs[side], p = AR.flasks[side]; if (!F || F.broken) return;
    F.broken = true;
    var col = '#' + F.liquid.material.color.getHexString(), i, a, v;
    F.g.children.forEach(function (o, k) { if (k > 0) o.visible = false; }); // остаётся только латунная подставка
    for (i = 0; i < 26; i++) { // осколки стекла
      a = Math.random() * 6.28; v = 160 + Math.random() * 260;
      var sh = sprite(shardTex(), i % 3 ? 0xe8fbff : 0xbfe8ff); sh.material.rotation = a;
      particle(sh, p.x, p.y, 40 + Math.random() * 40, { life: 1.1 + Math.random() * 0.5, v: { x: Math.cos(a) * v, y: 260 + Math.random() * 220, z: Math.sin(a) * v }, drag: 1.4, s0: 26 + Math.random() * 18, s1: 12, spin: (Math.random() - 0.5) * 12 });
    }
    for (i = 0; i < 70; i++) { // брызги эликсира по дугам
      a = Math.random() * 6.28; v = 120 + Math.random() * 380;
      drop(p.x, 40 + Math.random() * 30, p.y, Math.cos(a) * v, 220 + Math.random() * 300, Math.sin(a) * v, col, (12 + Math.random() * 18) * FXS);
    }
    particle(sprite(solidTex(), col, false), p.x, p.y, 50, { life: 0.5, s0: 60, s1: 360, ease: true, a0: 0.9 });
    particle(sprite(glowTex(), 0xffffff, true), p.x, p.y, 60, { life: 0.35, s0: 80, s1: 420, ease: true });
    R.ring(p.x, p.y, 320, col, 0.8); setTimeout(function () { R.ring(p.x, p.y, 460, col, 1); }, 140);
    // лужа эликсира растекается и остаётся до конца матча
    R.splat(p.x, p.y, col, 240, 60); setTimeout(function () { R.splat(p.x + 60, p.y - 40, col, 150, 60); R.splat(p.x - 70, p.y + 20, col, 130, 60); }, 220);
    swirl(p.x, p.y, 30, 260, [col, '#ffffff'], { out: true, w: 0.5, turns: 2, life: 1.2, sz: 28, lift: 120 });
    R.shake(26);
  };
  function restoreFlasks() { flaskObjs.forEach(function (F) { F.broken = false; F.g.children.forEach(function (o) { o.visible = true; }); }); }
  // Перк Clingfoot ⚓ (D-144): от неё отскочили — до конца хода врага её не сдвинуть; под жабой крутится латунный круг
  var anchorRings = {};
  function anchorTex() { return canvasTex('anchor', function (x) { x.clearRect(0, 0, 128, 128); x.strokeStyle = 'rgba(40,24,8,0.9)'; x.lineWidth = 14; x.beginPath(); x.arc(64, 64, 52, 0, 7); x.stroke(); x.strokeStyle = '#ffd070'; x.lineWidth = 8; x.setLineDash([14, 8]); x.beginPath(); x.arc(64, 64, 52, 0, 7); x.stroke(); }); }
  function syncAnchors(s, t) {
    s.frogs.forEach(function (f) {
      var A = anchorRings[f.id], d = app.disp[f.id], on = !!f.anchor && f.alive && !!d;
      if (!A) { if (!on) return; A = anchorRings[f.id] = flatMesh(anchorTex(), 0xffffff, f.r * 3.2, 3, false); A.renderOrder = 5; scene.add(A); }
      A.visible = on; if (!on) return;
      A.position.set(d.x, 3 + (d.z || 0) * T.visH, d.y); A.rotation.z = t * 0.8; A.material.opacity = 0.7 + 0.25 * Math.sin(t * 4);
    });
  }
  // Угрозы (D-146): куда враг дотянется следующим ходом — бледные красные круги; его путь к нашей фляге — «ШАХ»; наш путь к его фляге — золотом
  var threatGroup = null;
  R.setThreat = function (th) {
    if (threatGroup) { scene.remove(threatGroup); threatGroup.traverse(function (o) { if (o.geometry && !o.isSprite) o.geometry.dispose(); }); threatGroup = null; }
    R.threat = th || null;
    if (!th) return;
    threatGroup = new THREE.Group(); scene.add(threatGroup);
    (th.rings || []).forEach(function (r) { var m = flatRing(r.x, r.y, r.r - 5, r.r, 0xff5a4a, 0.3); m.renderOrder = 7; threatGroup.add(m); });
    function path(p, col) { threatGroup.add(dots(p.map(function (q) { return new THREE.Vector3(q.x, 12, q.y); }), new THREE.Color(col), 14, 26)); }
    if (th.foe) path(th.foe, 0xff4a3a);
    if (th.mine) path(th.mine, 0xffd040);
  };
  // Жидкость во фляге — следующий элемент стороны из общей последовательности (D-130): им зарядится жаба, начинающая новый бак.
  // Смена цвета — с перетеканием и всплеском; над колбой поднимаются пузыри этого цвета.
  function syncFlasks(s, t) {
    flaskObjs.forEach(function (F, side) {
      if (F.broken) return; // разбита — ни цвета, ни пузырей
      // зона победы (D-147, D-149): круг растёт с перегрузкой; фляга врага — цель — пульсирует; своя под «шахом» мигает красным
      var danger = side === 0 && R.threat && R.threat.foe;
      F.ring.scale.setScalar(FB.Sim.flaskR(s) / T.flaskR);
      F.ring.material.color.set(danger ? 0xff3020 : side === 0 ? 0x3aa0ff : 0xff4a3a);
      F.ring.material.opacity = danger ? 0.55 + 0.45 * Math.sin(t * 9) : side === 1 ? 0.5 + 0.35 * Math.sin(t * 3) : 0.5;
      if (!s.seq || !s.seq.length || !s.ptr || !(s.rules && s.rules.economy)) return; // без экономики новых баков нет — жидкость цвета стороны
      var el = s.seq[s.ptr[side] % s.seq.length], E = FB.ELEMENTS[el];
      if (!E) return;
      if (F.el !== el) {
        var first = !F.el; F.el = el; F.from = F.liquid.material.color.clone(); F.to = new THREE.Color(E.color); F.mixT = first ? 1 : 0;
        if (!first) { var p = AR.flasks[side]; R.ring(p.x, p.y, T.flaskR * 1.3, E.color, 0.6); R.flash(p.x, p.y, 120, E.color); for (var k = 0; k < 8; k++) { var a = Math.random() * 6.28; particle(sprite(glowTex(), E.color, true), p.x, p.y, 60, { life: 0.8, v: { x: Math.cos(a) * 80, y: 120 + Math.random() * 80, z: Math.sin(a) * 80 }, drag: 2, s0: 22, s1: 8 }); } }
      }
      if (F.mixT < 1) F.mixT = Math.min(1, F.mixT + 0.02);
      var c = F.from ? F.from.clone().lerp(F.to, F.mixT) : F.to;
      F.liquid.material.color.copy(c); F.liquid.material.emissive.copy(c).multiplyScalar(0.3 + 0.08 * Math.sin(t * 3 + side));
      F.glow.material.color.copy(c);
      var ph = t * 2.4 + side * 2; // жидкость плещется: сплющивается то вдоль, то поперёк, уровень покачивается (D-130)
      F.liquid.scale.set(1 + 0.06 * Math.sin(ph), 1 + 0.05 * Math.sin(ph * 1.3 + 1), 1 + 0.06 * Math.sin(ph + Math.PI / 2));
      F.liquid.position.y = F.ly + 2.5 * Math.sin(ph * 0.9);
      F.liquid.rotation.z = 0.12 * Math.sin(ph * 0.7); F.liquid.rotation.x = 0.1 * Math.sin(ph * 0.6 + 1);
      if (T.ambient !== 0 && (!F.nextI || t > F.nextI)) { // мелкие пузырьки внутри колбы
        F.nextI = t + 0.12 + Math.random() * 0.2;
        var pi2 = AR.flasks[side];
        particle(sprite(glowTex(), 0xffffff, true), pi2.x + (Math.random() - 0.5) * T.flaskR * 0.45, pi2.y + (Math.random() - 0.5) * T.flaskR * 0.45, 18, { life: 0.55, v: { x: 0, y: 70, z: 0 }, s0: 6, s1: 3, a0: 0.8 });
      }
      if (T.ambient !== 0 && (!F.nextB || t > F.nextB)) {
        F.nextB = t + 0.25 + Math.random() * 0.35;
        var q = AR.flasks[side];
        particle(sprite(dotRingTex(), c.getHex(), false), q.x + (Math.random() - 0.5) * T.flaskR * 0.5, q.y + (Math.random() - 0.5) * T.flaskR * 0.4, 30, { life: 1.2, v: { x: 0, y: 60 + Math.random() * 40, z: 0 }, s0: 8, s1: 18, a0: 0.8 });
      }
    });
  }

  // ---------- жабы ----------
  var POSES = { // градусы для левой стороны [плечо, предплечье]; правая — зеркально (D-053)
    idle:  { f: [0, 0], r: [0, 0], s: 1 },
    aim:   { f: [-14, 22], r: [22, -26], s: 0.93 },
    // полёт: лапы вытянуты вдоль тела, как у настоящей жабы. dir — направление сегментов (рад от оси тела в свою сторону)
    air:   { dir: { r: { back: true, s: [0.22, 0.1, 0.04] }, f: { back: true, s: [0.62, 0.42, 0.25] } }, s: 1.06 },
    // снижение: задние ещё вытянуты, передние выносятся вперёд под приземление
    fall:  { dir: { r: { back: true, s: [0.38, 0.2, 0.1] }, f: { back: false, s: [0.42, 0.22, 0.1] } }, s: 1.04 },
    land:  { f: [-12, 6], r: [16, -6], s: 1.1 },
    grip:  { f: [38, -18], r: [14, 4], s: 1 },
    dead:  { f: [-34, 20], r: [34, -20], s: 0.95 },
    perch: { f: [-18, 26], r: [26, -30], s: 0.93 },   // сидит на спине союзника, лапы чуть поджаты (D-083)
    squash: { f: [-40, 46], r: [44, -52], s: 0.86 },  // на неё запрыгнули: лапы под телом, сплющилась
    rest:   { f: [-30, 40], r: [40, -48], s: 0.88 }   // пустой бак в поле (D-153): пружина спущена — осела, лапы поджаты
  };
  function wrapA(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
  function buildFrog(f) {
    var rig = rigs[f.kind], grp = new THREE.Group(), lift = new THREE.Group(), root = new THREE.Group();
    grp.add(lift); lift.add(root);
    var mat = new THREE.MeshLambertMaterial({ map: atlasTex(f.kind, f.el || ''), alphaTest: 0.5, side: THREE.DoubleSide });
    var depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: mat.map, alphaTest: 0.5 });
    var by = {}, nodes = {}, AW = rig.w, AH = rig.h;
    rig.parts.forEach(function (p) { by[p.name] = p; });
    function make(p) {
      if (nodes[p.name]) return nodes[p.name];
      var node = new THREE.Group(), par = p.parent ? by[p.parent] : null;
      var w = p.rect[2], h = p.rect[3], g = new THREE.PlaneGeometry(w, h);
      var uv = g.attributes.uv;
      for (var i = 0; i < uv.count; i++) { var u = uv.getX(i), v = uv.getY(i); uv.setXY(i, (p.rect[0] + u * w) / AW, 1 - (p.rect[1] + (1 - v) * h) / AH); }
      g.rotateX(-Math.PI / 2);
      var m = new THREE.Mesh(g, mat); m.castShadow = true; m.customDepthMaterial = depth;
      m.position.set(w / 2 - p.pivot[0], 0, h / 2 - p.pivot[1]);
      node.add(m);
      if (par) { make(par).add(node); node.position.set(p.at[0] - par.pivot[0], (p.z - par.z) * 0.8, p.at[1] - par.pivot[1]); }
      else { root.add(node); node.position.y = p.z * 0.8; }
      node.userData = { base: p.rot, p: p };
      node.rotation.y = -p.rot;
      nodes[p.name] = node;
      // «кость» сегмента: от шарнира к следующему шарниру той же лапы (или к центру детали) — для поз «вдоль тела»
      var kid = rig.parts.filter(function (c) { return c.parent === p.name && c.grp === p.grp; })[0];
      var bv = kid ? [kid.at[0] - p.pivot[0], kid.at[1] - p.pivot[1]] : [w / 2 - p.pivot[0], h / 2 - p.pivot[1]];
      order.push({ node: node, p: p, parent: par ? info[par.name] : null, base: p.rot, cur: p.rot, bone: Math.atan2(bv[1], bv[0]), cum: 0 });
      info[p.name] = order[order.length - 1];
      return node;
    }
    var order = [], info = {};
    rig.parts.forEach(make);
    var body = by.body || rig.parts[0], sc = (f.r * 2 * 1.08) / Math.max(body.rect[2], body.rect[3]);
    root.scale.set(sc, sc, sc);
    if (rig.flip) root.rotation.y = Math.PI;
    // какая конечность передняя/левая — по положению плеча относительно тела в кадре «голова вверх»
    grp.updateMatrixWorld(true);
    var bodyPos = new THREE.Vector3(); nodes[body.name].getWorldPosition(bodyPos);
    var limbs = [];
    order.forEach(function (I) {
      var p = I.p; if (!p.seg) return;
      var top = p; while (top.parent && by[top.parent].grp === p.grp) top = by[top.parent];
      var wp = new THREE.Vector3(); nodes[top.name].getWorldPosition(wp);
      I.limb = { seg: p.seg, front: wp.z < bodyPos.z, side: wp.x < bodyPos.x ? 1 : -1, sign: (wp.x < bodyPos.x ? 1 : -1) * (rig.flip ? -1 : 1) };
      limbs.push(I);
    });
    // тень-пятно прямо под жабой: сжимается и бледнеет с высотой — главный признак «вверх, потом вниз»
    var blob = new THREE.Mesh(new THREE.CircleGeometry(f.r * 1.15, 32), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2; blob.position.y = 2.2; blob.renderOrder = 3; grp.add(blob);
    lift.rotation.order = 'YXZ';
    // кольцо стороны и свечение резервуара
    var ring = new THREE.Mesh(new THREE.RingGeometry(f.r * 0.92, f.r * 1.12, 40), new THREE.MeshBasicMaterial({ color: f.side === 0 ? 0x4aa3ff : 0xff5a4a, transparent: true, opacity: 0.85, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 2.6; ring.renderOrder = 4;
    grp.add(ring);
    // шкала зарядов (D-132): три дуги цвета элемента вокруг жабы — сколько осталось, видно сверху с любого зума
    var segs = [];
    for (var sk = 0; sk < T.tank; sk++) {
      var gap = 0.16, th = Math.PI * 2 / T.tank, sm = new THREE.Mesh(new THREE.RingGeometry(f.r * 1.42, f.r * 1.72, 20, 1, Math.PI / 2 + sk * th + gap, th - gap * 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }));
      sm.rotation.x = -Math.PI / 2; sm.position.y = 2.9; sm.renderOrder = 5; grp.add(sm); segs.push(sm);
    }
    var glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: new THREE.Color(f.el ? FB.ELEMENTS[f.el].color : '#888888'), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.set(f.r * 2.2, f.r * 2.2, 1); glow.position.y = 14; lift.add(glow);
    var shell = new THREE.Mesh(new THREE.IcosahedronGeometry(f.r * 1.5, 0), new THREE.MeshLambertMaterial({ color: 0xd8f6ff, emissive: new THREE.Color(0x3a8aa8), transparent: true, opacity: 0.55, depthWrite: false }));
    shell.visible = false; lift.add(shell);
    var label = document.createElement('div'); label.className = 'flabel ' + (f.side === 0 ? 'mine' : 'enemy');
    label.innerHTML = '<div class="fl-st"></div><div class="fl-hp"><i></i></div>';
    labels.appendChild(label);
    scene.add(grp);
    return { grp: grp, lift: lift, root: root, mat: mat, limbs: limbs, order: order, rootA: rig.flip ? Math.PI : 0, blob: blob, ring: ring, segs: segs, glow: glow, shell: shell, label: label, el: '?', pose: 'idle', kind: f.kind, r: f.r };
  }
  var _glow = null;
  function glowTex() {
    if (_glow) return _glow;
    var c = document.createElement('canvas'); c.width = c.height = 64; var x = c.getContext('2d');
    var g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.4)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    _glow = new THREE.CanvasTexture(c); return _glow;
  }

  R.resetFrogs = function () {
    restoreFlasks();
    Object.keys(frogs).forEach(function (id) { scene.remove(frogs[id].grp); frogs[id].label.remove(); });
    frogs = {};
    Object.keys(dyn.cells).forEach(function (id) { if (dyn.cells[id]) scene.remove(dyn.cells[id].obj); }); dyn.cells = {};
    fxList.forEach(function (f) { if (f.obj) scene.remove(f.obj); if (f.el) f.el.remove(); }); fxList = [];
    decals.forEach(function (D) { scene.remove(D.obj); }); decals = [];
    Object.keys(anchorRings).forEach(function (id) { scene.remove(anchorRings[id]); }); anchorRings = {};
    R.setAim(null); R.setThreat(null);
  };

  function syncFrog(f, d, dt, t, hidden) {
    var F = frogs[f.id] || (frogs[f.id] = buildFrog(f));
    var rules = app.shown && app.shown.rules || {}, econ = !!rules.economy, empty = econ && f.ch <= 0, stuck = empty && !FB.Sim.onBase(f) && d.alive;
    var tk = econ ? (f.el && !empty ? f.el : '') : (f.el || 'orig'); // без эликсира — серый резервуар (§37); без экономики — элемент навсегда или исходный арт
    if (F.el !== tk) { F.el = tk; F.mat.map = atlasTex(f.kind, tk); F.mat.needsUpdate = true; if (FB.ELEMENTS[tk]) F.glow.material.color.set(FB.ELEMENTS[tk].color); }
    F.grp.visible = !hidden;
    F.label.style.display = hidden || !d.alive ? 'none' : '';
    var hv = (d.z || 0) * T.visH;
    F.grp.position.set(d.x, 0, d.y);
    F.lift.position.y = hv + 4; // жаба всегда над лужами, пятнами и тенью (D-073)
    F.lift.rotation.y = -(d.facing || 0);
    F.pitch = (F.pitch || 0) + ((d.pitch || 0) - (F.pitch || 0)) * Math.min(1, dt * 12);
    F.lift.rotation.x = F.pitch; // нос вверх на взлёте, вниз на снижении
    F.blob.material.opacity = d.alive ? 0.42 * Math.max(0.15, 1 - hv / 320) : 0.2;
    F.blob.scale.setScalar(Math.max(0.45, 1 - hv / 450));
    var pose = (stuck && d.pose === 'idle' ? POSES.rest : POSES[d.pose]) || POSES.idle, k = Math.min(1, dt * (pose.dir ? 18 : 12));
    F.order.forEach(function (I) {
      var pc = I.parent ? I.parent.cum : F.rootA;
      if (I.limb) {
        var L = I.limb, want, dr = pose.dir && pose.dir[L.front ? 'f' : 'r'];
        if (dr) { // направление сегмента в кадре тела: назад (π/2) или вперёд (−π/2), чуть в свою сторону
          var sp = dr.s[Math.min(dr.s.length - 1, L.seg - 1)], tgt = dr.back ? Math.PI / 2 + L.side * sp : -Math.PI / 2 - L.side * sp;
          want = I.base + wrapA(tgt - pc - I.bone - I.base);
        } else want = I.base + (L.front ? pose.f : pose.r)[Math.min(1, L.seg - 1)] * (L.seg > 2 ? 0.5 : 1) * L.sign * Math.PI / 180;
        I.cur += (want - I.cur) * k;
        I.node.rotation.y = -I.cur;
      }
      I.cum = pc + I.cur;
    });
    var breathe = d.pose === 'idle' && d.alive && !stuck ? 1 + Math.sin(t * 2.4 + f.id) * 0.018 : 1;
    F.sc = (F.sc || 1) + ((pose.s * breathe * (1 + (d.squash || 0))) - (F.sc || 1)) * Math.min(1, dt * 16);
    F.st = (F.st || 0) + ((d.stretch || 0) - (F.st || 0)) * Math.min(1, dt * 14);
    // реакция на отброс (D-108), видна сверху: «желе» — сплющило вдоль тела и раздуло вширь, потом наоборот,
    // затухая; корпус мотает из стороны в сторону, сама жаба на миг раздувается
    var hk = d.hitT > 0 ? d.hitT / T.hitAnimSec : 0, hp = 1 - hk, hw = (d.hitPow || 1) * hk, jel = 0.38 * hw * Math.cos(hp * Math.PI * 4), pop = 1 + 0.22 * hw * Math.max(0, Math.cos(hp * Math.PI * 1.5));
    F.lift.rotation.y = -(d.facing || 0) + 0.55 * hw * Math.sin(hp * Math.PI * 5);
    F.lift.scale.set(F.sc * (1 - F.st * 0.45) * (1 + jel) * pop, F.sc * pop, F.sc * (1 + F.st) * (1 - jel) * pop); // вытягивается вдоль тела в полёте
    F.ring.visible = d.alive; F.ring.material.opacity = d.sel ? 1 : 0.6;
    var sc2 = f.el ? FB.ELEMENTS[f.el].color : '#6a645c', fk = d.fillT > 0 ? d.fillK : -1;
    F.segs.forEach(function (sm, k) {
      var on = k < f.ch;
      sm.material.color.set(sc2); sm.material.opacity = on ? 0.95 : 0.22;
      var pul = k === fk ? 1 + 0.45 * d.fillT : (on ? 1 + 0.04 * Math.sin(t * 4 + k) : 1); sm.scale.set(pul, pul, 1); // новый заряд вспыхивает
      sm.visible = d.alive && !hidden && econ; // без экономики заряды не нужны
    });
    F.ring.scale.setScalar(d.sel ? 1.12 + Math.sin(t * 6) * 0.05 : 1);
    if (!d.alive) { F.mat.color.setRGB(0.35, 0.33, 0.32); F.glow.visible = false; }
    else {
      var fl = d.flash || 0; F.dk = (F.dk || 0) + ((d.dark ? 1 : 0) - (F.dk || 0)) * Math.min(1, dt * 8); var sh = 1 - F.dk * 0.5; // тень от жабы сверху (D-083)
      var iz = f.frozen ? [0.6, 0.85, 1.25] : stuck ? [0.62, 0.6, 0.58] : [1, 1, 1]; // во льду — голубая (D-125); пустая в поле — тусклая (D-153)
      if (stuck && !hidden && T.ambient !== 0 && (!F.puffT || t > F.puffT)) { F.puffT = t + 1.6 + Math.random(); particle(sprite(puffTex(), 0x8a8580, false), d.x, d.y, 30, { life: 1.3, v: { x: 0, y: 50, z: 0 }, s0: 16, s1: 46, ease: true, a0: 0.45 }); } // струйка пара из пустого бака
      F.mat.color.setRGB((1 + fl * 2) * sh * iz[0], (1 + fl * 1.2) * sh * iz[1], (1 + fl * 1.2) * sh * iz[2]);
      F.mat.emissive && F.mat.emissive.setRGB(fl * 0.6, fl * 0.2, fl * 0.2);
      F.glow.visible = !!FB.ELEMENTS[F.el]; F.glow.material.opacity = (0.25 + 0.2 * Math.sin(t * 3 + f.id * 1.7)) * (0.5 + 0.5 * f.ch / T.tank);
      if (d.fillT > 0) { F.glow.material.opacity += d.fillT * 0.7; F.glow.scale.setScalar(f.r * (2.2 + d.fillT * 1.6)); } else F.glow.scale.setScalar(f.r * 2.2); // резервуар наполняется (D-132)
    }
    F.shell.visible = !!f.frozen && d.alive; // закованная в лёд — ледяная глыба (D-125)
    if (F.shell.visible) { F.shell.material.opacity = 0.55 + 0.08 * Math.sin(t * 2 + f.id); F.shell.position.y = f.r * 0.9; F.shell.rotation.y = 0.4; }
    // подпись над жабой (§37, D-147): элемент и заряды ●●○; без эликсира — «DRY ½»; перк жабы — значком; якорь — ⚓
    var st = rules.perks && FB.FROGS[f.kind].perk ? '<span class="pk">' + FB.FROGS[f.kind].perk.icon + '</span>' : '';
    if (f.frozen) st += '<span class="emp ice">🧊 FROZEN</span>';
    else if (f.el && !empty) { st += '<span class="elb" style="--c:' + FB.ELEMENTS[f.el].color + '">' + FB.ELEMENTS[f.el].icon + '</span>'; if (econ) { st += '<span class="pips">'; for (var pi = 0; pi < T.tank; pi++) st += '<i class="' + (pi < f.ch ? 'on' : '') + '" style="--c:' + FB.ELEMENTS[f.el].color + '"></i>'; st += '</span>'; } } // крупный бейдж элемента и точки зарядов (D-132)
    else if (econ && FB.Sim.onBase(f)) st += '<span class="emp">⏳</span>';
    else if (econ) st += '<span class="emp empty">🪫 EMPTY</span>'; // пружина спущена: стоит, пока «⟲ Домой» не заправит (D-153)
    if (f.anchor) st += '<span class="emp anc">⚓</span>';
    if (F.stHtml !== st) { F.stHtml = st; F.label.firstChild.innerHTML = st; }
    var w = Math.max(0, f.hp / f.maxHp) * 100;
    if (F.hpW !== w) { F.hpW = w; F.label.lastChild.firstChild.style.width = w + '%'; }
    var p = toScreen(d.x, hv + 30, d.y - f.r * 1.2);
    F.label.style.transform = 'translate(' + (p.x | 0) + 'px,' + (p.y | 0) + 'px)';
  }

  // ---------- клетки сетки (§5, §22, §37): элемент — плитка цвета элемента, рельеф — свой узор и рамка цвета стороны ----------
  function discMat(color, op) { return new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: op, depthWrite: false }); }
  function rgba(hex, a) { var c = new THREE.Color(hex); return 'rgba(' + (c.r * 255 | 0) + ',' + (c.g * 255 | 0) + ',' + (c.b * 255 | 0) + ',' + a + ')'; }
  function rrect(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
  function tileTex(el, t, side) {
    return canvasTex('tile:' + el + ':' + t + ':' + side, function (x) {
      var col = t ? FB.TERRAIN[t].color : FB.ELEMENTS[el].color, team = side === 0 ? '#4aa3ff' : side === 1 ? '#ff5a4a' : null;
      x.clearRect(0, 0, 128, 128);
      rrect(x, 7, 7, 114, 114, 16);
      var g = x.createLinearGradient(0, 0, 128, 128); g.addColorStop(0, rgba(col, 0.72)); g.addColorStop(1, rgba(col, 0.48));
      x.fillStyle = g; x.fill();
      x.save(); rrect(x, 7, 7, 114, 114, 16); x.clip();
      if (t === 'blaze') { x.fillStyle = 'rgba(255,220,80,0.55)'; [[30, 104, 22], [66, 110, 30], [100, 102, 20]].forEach(function (q) { x.beginPath(); x.moveTo(q[0] - q[2] * 0.6, q[1]); x.quadraticCurveTo(q[0] - q[2] * 0.5, q[1] - q[2] * 1.6, q[0], q[1] - q[2] * 2.4); x.quadraticCurveTo(q[0] + q[2] * 0.5, q[1] - q[2] * 1.6, q[0] + q[2] * 0.6, q[1]); x.closePath(); x.fill(); }); } // языки огня (D-143)
      if (t === 'jet') { x.save(); x.translate(64, 64); if (side === 1) x.rotate(Math.PI); x.strokeStyle = 'rgba(255,255,255,0.95)'; x.lineWidth = 9; x.lineJoin = 'round'; x.lineCap = 'round'; [-30, -2, 26].forEach(function (yy) { x.beginPath(); x.moveTo(-30, yy + 18); x.lineTo(0, yy - 6); x.lineTo(30, yy + 18); x.stroke(); }); x.restore(); } // шевроны — куда бросает струя (D-123)
      x.fillStyle = 'rgba(255,255,255,0.22)'; x.fillRect(7, 7, 114, 18); // блик сверху — «глянец краски»
      x.restore();
      x.lineWidth = team ? 6 : 4; x.strokeStyle = team || rgba(col, 0.95); rrect(x, 7, 7, 114, 114, 16); x.stroke();
      x.font = '48px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      if (t !== 'jet') { x.globalAlpha = t ? 0.75 : 0.6; x.fillStyle = '#fff'; x.fillText(t ? FB.TERRAIN[t].icon : FB.ELEMENTS[el].icon, 64, 68); x.globalAlpha = 1; }
    });
  }
  function buildCell(i, cl) {
    var g = new THREE.Group(), p = FB.Sim.cellCenter(i), cs = T.cell;
    var tile = new THREE.Mesh(new THREE.PlaneGeometry(cs, cs), new THREE.MeshBasicMaterial({ map: tileTex(cl.el, cl.t, cl.side), transparent: true, depthWrite: false }));
    tile.rotation.x = -Math.PI / 2; tile.position.y = 1.2; tile.renderOrder = 2; g.add(tile);
    var D = { obj: g, tile: tile, born: tAll, t: cl.t, puffs: [] };
    if (cl.t === 'column') { // Crystal Column: шестигранный кристалл на всю клетку (§21)
      var hgt = T.wallH * 0.8; // колонна — стена (D-145): выше любой дуги, перелетает только эстафета
      var m = new THREE.Mesh(new THREE.CylinderGeometry(cs * 0.36, cs * 0.44, hgt, 6), new THREE.MeshLambertMaterial({ color: 0x5cffb0, emissive: new THREE.Color(0x0f7a50), transparent: true, opacity: 0.9 }));
      m.position.y = hgt / 2; m.castShadow = true; g.add(m);
      var tip = new THREE.Mesh(new THREE.ConeGeometry(cs * 0.36, 34, 6), m.material); tip.position.y = hgt + 17; g.add(tip);
      var ring = new THREE.Mesh(new THREE.RingGeometry(cs * 0.44, cs * 0.5, 6), discMat(cl.side === 0 ? 0x4aa3ff : 0xff5a4a, 0.9)); ring.rotation.x = -Math.PI / 2; ring.position.y = 1.6; g.add(ring);
      D.col = m; D.tip = tip; D.hgt = hgt;
    }
    if (cl.t === 'blaze' || cl.t === 'jet') { // свечение над клеткой
      var gl = new THREE.Mesh(new THREE.PlaneGeometry(cs * 1.2, cs * 1.2), new THREE.MeshBasicMaterial({ map: glowTex(), color: new THREE.Color(FB.TERRAIN[cl.t].color), transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
      gl.rotation.x = -Math.PI / 2; gl.position.y = 2; g.add(gl); D.gl = gl;
    }
    g.position.set(p.x, 0, p.y); scene.add(g);
    return D;
  }
  // Живые клетки (D-129): каждая поверхность всё время что-то делает — огонь искрит, яд пузырится, молния трещит,
  // лёд поблёскивает, струя пыхает паром по стрелке, мороз сыплет снегом, кристалл бликует. Частицы короткие и редкие.
  var AMB = { fire: [0.12, 0.28], poison: [0.2, 0.45], ice: [0.25, 0.6], lightning: [0.45, 1.1], jet: [0.2, 0.4], blaze: [0.06, 0.16], column: [0.35, 0.8] };
  function cellAmbient(D, cl, i, t) {
    var kind = cl.t || cl.el, p = FB.Sim.cellCenter(i), cs = T.cell, rx = function () { return p.x + (Math.random() - 0.5) * cs * 0.8; }, ry = function () { return p.y + (Math.random() - 0.5) * cs * 0.8; };
    // плитка «дышит»: огонь и молния мерцают, яд и лёд мягко пульсируют
    var fl = kind === 'fire' || kind === 'blaze' ? 0.88 + 0.16 * Math.sin(t * 9 + i) * Math.sin(t * 5.3 + i * 2) : kind === 'lightning' ? (Math.random() < 0.06 ? 1.35 : 0.95) : kind === 'poison' ? 0.92 + 0.1 * Math.sin(t * 2.4 + i) : kind === 'ice' ? 0.95 + 0.07 * Math.sin(t * 1.7 + i) : 1;
    D.tile.material.color.setScalar(fl);
    if (!AMB[kind] || T.ambient === 0) return;
    if (D.next === undefined) D.next = t + Math.random() * AMB[kind][1];
    if (t < D.next) return;
    D.next = t + AMB[kind][0] + Math.random() * (AMB[kind][1] - AMB[kind][0]);
    var x = rx(), y = ry(), sp;
    if (kind === 'blaze') { // горящее поле: высокие языки и дым
      particle(sprite(glowTex(), Math.random() < 0.5 ? 0xff5a00 : 0xffa020, true), x, y, 8, { life: 0.8 + Math.random() * 0.4, v: { x: (Math.random() - 0.5) * 24, y: 110 + Math.random() * 70, z: (Math.random() - 0.5) * 24 }, s0: 70, s1: 14, a0: 1 });
      if (Math.random() < 0.3) particle(sprite(puffTex(), 0x3a2a1a, false), rx(), ry(), 40, { life: 1.2, v: { x: 0, y: 70, z: 0 }, s0: 30, s1: 80, ease: true, a0: 0.35 });
    } else if (kind === 'fire') { // язычки и искры вверх
      particle(sprite(glowTex(), Math.random() < 0.5 ? 0xff7a10 : 0xffc040, true), x, y, 6, { life: 0.7 + Math.random() * 0.4, v: { x: (Math.random() - 0.5) * 20, y: 70 + Math.random() * 60, z: (Math.random() - 0.5) * 20 }, s0: 52, s1: 10, a0: 0.95 });
      if (Math.random() < 0.4) particle(sprite(dropTex(), 0xff5a00, false), rx(), ry(), 4, { life: 0.6, v: { x: (Math.random() - 0.5) * 60, y: 140, z: (Math.random() - 0.5) * 60 }, drag: 2.5, s0: 16, s1: 8 });
    } else if (kind === 'poison') { // пузырь поднимается и лопается
      particle(sprite(dotRingTex(), 0x9dff3a, false), x, y, 3, { life: 1.0 + Math.random() * 0.4, v: { x: 0, y: 26 + Math.random() * 18, z: 0 }, s0: 12, s1: 40, a0: 0.85 });
    } else if (kind === 'ice') { // блик-звёздочка
      particle(sprite(glowTex(), 0xe8fbff, true), x, y, 5, { life: 0.55, s0: 8, s1: 60, ease: true, a0: 1 });
    } else if (kind === 'lightning') { // разряд поперёк клетки
      var a = Math.random() * Math.PI, d = cs * 0.38;
      R.bolt({ x: p.x - Math.cos(a) * d, y: p.y - Math.sin(a) * d }, { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d }, Math.random() < 0.5 ? '#ffe100' : '#fff6a0', 6);
    } else if (kind === 'jet') { // пых пара по стрелке
      var dz = cl.side === 0 ? -1 : 1;
      particle(sprite(puffTex(), 0xdff6ff, false), p.x + (Math.random() - 0.5) * 30, p.y - dz * cs * 0.3, 8, { life: 0.8, v: { x: (Math.random() - 0.5) * 20, y: 50, z: dz * 190 }, drag: 1.2, s0: 26, s1: 80, ease: true, a0: 0.6 });
    } else if (kind === 'column' && D.hgt) { // блик бежит по грани кристалла
      particle(sprite(glowTex(), 0xb0ffe0, true), p.x + (Math.random() - 0.5) * cs * 0.5, p.y + (Math.random() - 0.5) * cs * 0.3, 20 + Math.random() * D.hgt, { life: 0.5, s0: 14, s1: 64, ease: true, a0: 0.9 });
    }
  }
  // Всплеск, когда клетка меняется (D-129): краска шлёпается, рельеф поднимается, очищенная клетка дымит
  R.cellBurst = function (x, y, el, t) {
    var i, a, c;
    if (!el && !t) { // очищена: белая пыль и кольцо
      for (i = 0; i < 5; i++) { a = Math.random() * 6.28; particle(sprite(puffTex(), 0xd8d0c0, false), x, y, 10, { life: 0.8, v: { x: Math.cos(a) * 70, y: 40, z: Math.sin(a) * 70 }, drag: 2, s0: 30, s1: 70, ease: true, a0: 0.55 }); }
      particle(flatMesh(dotRingTex(), 0xffffff, 10, 2, false), x, y, 2, { life: 0.45, s0: 20, s1: T.cell * 1.1, ease: true, a0: 0.7 });
      return;
    }
    c = t ? FB.TERRAIN[t].color : FB.ELEMENTS[el].color;
    particle(flatMesh(dotRingTex(), c, 10, 2, false), x, y, 2, { life: 0.5, s0: 20, s1: T.cell * 1.15, ease: true, a0: 0.85 });
    if (t === 'jet') for (i = 0; i < 3; i++) particle(sprite(puffTex(), 0xdff6ff, false), x, y, 10, { life: 0.9, v: { x: (Math.random() - 0.5) * 30, y: 160 + i * 60, z: (Math.random() - 0.5) * 30 }, drag: 1.5, s0: 30, s1: 90, ease: true, a0: 0.7 });
    else if (t === 'blaze') for (i = 0; i < 6; i++) { a = Math.random() * 6.28; particle(sprite(glowTex(), i % 2 ? 0xff5a00 : 0xffc040, true), x, y, 10, { life: 0.7, v: { x: Math.cos(a) * 80, y: 160 + Math.random() * 80, z: Math.sin(a) * 80 }, drag: 2, s0: 50, s1: 12 }); }
    else if (!t) for (i = 0; i < 6; i++) { a = i / 6 * 6.28 + Math.random() * 0.5; particle(sprite(el === 'lightning' || el === 'fire' ? glowTex() : el === 'ice' ? shardTex() : dropTex(), c, el === 'lightning' || el === 'fire'), x, y, 8, { life: 0.6, v: { x: Math.cos(a) * 110, y: 120 + Math.random() * 60, z: Math.sin(a) * 110 }, drag: 2.2, s0: 18, s1: 8 }); }
  };
  // Вихрь частиц: внутрь (стягивание) или наружу (комбо, заморозка)
  function swirl(x, y, n, r0, colors, o) {
    o = o || {};
    for (var i = 0; i < n; i++) {
      var add = i % 3 === 0, s2 = sprite(add ? glowTex() : (o.tex || dropTex()), colors[i % colors.length], add);
      scene.add(s2);
      fxList.push({ obj: s2, t: -i * (o.stagger || 0.012), life: o.life || 0.9, swirl: { x: x, y: y, a0: i / n * Math.PI * 2 * (o.turns || 3), r0: r0 * (0.75 + Math.random() * 0.35), w: o.w || 1.2, h: o.h || 16, lift: o.lift || 40, sz: o.sz || 22, out: !!o.out } });
    }
  }
  // Комбо (D-129): две ленты цветов союзника и прыгуньи раскручиваются из точки, вспышка обоих цветов
  R.comboFx = function (x, y, c1, c2) {
    swirl(x, y, 36, 170, [c1, c2], { out: true, w: 0.9, turns: 2, life: 0.8, sz: 26, lift: 70 });
    R.flash(x, y, 190, c1); setTimeout(function () { R.flash(x, y, 140, c2); }, 80);
    R.ring(x, y, 130, c1, 0.5); setTimeout(function () { R.ring(x, y, 170, c2, 0.6); }, 110);
  };
  // Заморозка (D-129): ледяные осколки вокруг жабы, иней по кругу, белая вспышка
  // Бак опустел (D-153): серый пых из резервуара, жаба оседает
  R.emptyFx = function (x, y) {
    for (var i = 0; i < 6; i++) { var a = i / 6 * 6.28; particle(sprite(puffTex(), 0x9a948c, false), x, y, 26, { life: 0.9, v: { x: Math.cos(a) * 60, y: 70, z: Math.sin(a) * 60 }, drag: 2, s0: 24, s1: 60, ease: true, a0: 0.6 }); }
    R.ring(x, y, 80, '#8a8580', 0.5);
  };
  R.freezeFx = function (x, y) {
    for (var i = 0; i < 14; i++) { var a = i / 14 * 6.28, sh = sprite(shardTex(), i % 2 ? 0xd8f6ff : 0x8fdcff); sh.material.rotation = a; particle(sh, x + Math.cos(a) * 30, y + Math.sin(a) * 30, 10, { life: 0.8, v: { x: Math.cos(a) * 40, y: 150 + Math.random() * 60, z: Math.sin(a) * 40 }, drag: 3, s0: 34, s1: 20 }); }
    swirl(x, y, 18, 110, [0xffffff, 0xbfefff], { w: -1, turns: 1, life: 0.7, sz: 14, lift: 30 });
    particle(flatMesh(hexTex(), 0xbfefff, 10, 3, false), x, y, 3, { life: 0.8, s0: 150, s1: 80, ease: true });
    R.flash(x, y, 140, '#e8fbff');
  };

  function syncDyn(s, t) {
    (s.cells || []).forEach(function (cl, i) {
      var key = cl.el || cl.t ? (cl.el || '') + '|' + (cl.t || '') + '|' + cl.side : '';
      var D = dyn.cells[i];
      if (D && D.key !== key) { scene.remove(D.obj); D = dyn.cells[i] = null; }
      if (!key) return;
      if (!D) { D = dyn.cells[i] = buildCell(i, cl); D.key = key; }
      var a = Math.min(1, (t - D.born) * 4), pop = a < 1 ? 0.5 + a * 0.6 : 1;
      D.tile.scale.set(pop, pop, 1);
      if (D.col) { var rise = Math.min(1, (t - D.born) * 2.5); D.col.scale.y = Math.max(0.02, rise); D.col.position.y = D.hgt / 2 * rise; D.tip.position.y = D.hgt * rise + 17; D.tip.visible = rise > 0.9; }
      if (D.gl) D.gl.material.opacity = (D.t === 'jet' ? 0.2 + 0.25 * Math.max(0, Math.sin(t * 5 - (i % T.cols) * 0.7)) : D.t === 'blaze' ? 0.3 + 0.2 * Math.abs(Math.sin(t * 9 + i) * Math.sin(t * 4.1 + i)) : 0.25 + 0.12 * Math.sin(t * 2.2 + i));
      cellAmbient(D, cl, i, t);
    });
  }

  // ---------- эффекты ----------
  // ---------- краска в духе Splatoon (D-063): глянцевые кляксы, капли, пятна на полу ----------
  var inkCache = {}, decals = [];
  function rnd(seed) { var s = seed * 9301 + 49297; return function () { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }
  function shade(hex, k) { var c = new THREE.Color(hex); if (k < 0) c.multiplyScalar(1 + k); else c.lerp(new THREE.Color(1, 1, 1), k); return '#' + c.getHexString(); }
  // Клякса: неровный круг + брызги вокруг; тёмный нижний край и белые блики сверху — «мокрая» глянцевая краска
  function inkTex(color, variant, smooth) {
    var key = color + ':' + variant + ':' + (smooth ? 1 : 0);
    if (inkCache[key]) return inkCache[key];
    var S = 256, c = document.createElement('canvas'); c.width = c.height = S; var x = c.getContext('2d'), r = rnd(variant * 7 + (smooth ? 101 : 3));
    var R0 = smooth ? 92 : 64, waves = smooth ? [[3, 0.06], [5, 0.04], [7, 0.025]] : [[5, 0.13], [7, 0.1], [11, 0.07]];
    var ph = waves.map(function () { return r() * 6.28; });
    function blob(dx, dy, scale) {
      x.beginPath();
      for (var i = 0; i <= 72; i++) {
        var a = i / 72 * Math.PI * 2, rr = R0 * scale;
        waves.forEach(function (w, j) { rr += R0 * scale * w[1] * Math.sin(w[0] * a + ph[j]); });
        var px = S / 2 + dx + Math.cos(a) * rr, py = S / 2 + dy + Math.sin(a) * rr;
        if (i) x.lineTo(px, py); else x.moveTo(px, py);
      }
      if (!smooth) for (var k = 0; k < 9; k++) { // брызги
        var a2 = r() * 6.28, dd = R0 * scale * (1.15 + r() * 0.55), s2 = 5 + r() * 13;
        x.moveTo(S / 2 + dx + Math.cos(a2) * dd + s2, S / 2 + dy + Math.sin(a2) * dd);
        x.arc(S / 2 + dx + Math.cos(a2) * dd, S / 2 + dy + Math.sin(a2) * dd, s2, 0, 7);
      }
    }
    x.fillStyle = shade(color, -0.42); blob(0, 0, 1); x.fill();
    x.globalCompositeOperation = 'source-atop';
    x.fillStyle = color; blob(-3, -6, 0.97); x.fill();
    x.fillStyle = shade(color, 0.28); blob(-8, -14, 0.62); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.85)';
    x.beginPath(); x.ellipse(S / 2 - R0 * 0.35, S / 2 - R0 * 0.42, R0 * 0.22, R0 * 0.09, -0.5, 0, 7); x.fill();
    x.beginPath(); x.arc(S / 2 - R0 * 0.62, S / 2 - R0 * 0.12, R0 * 0.07, 0, 7); x.fill();
    var t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
    return (inkCache[key] = t);
  }
  var _drop = null;
  function dropTex() {
    if (_drop) return _drop;
    var c = document.createElement('canvas'); c.width = c.height = 32; var x = c.getContext('2d');
    x.fillStyle = '#9a9a9a'; x.beginPath(); x.arc(16, 16, 15, 0, 7); x.fill();
    x.fillStyle = '#ffffff'; x.beginPath(); x.arc(15, 14, 12.5, 0, 7); x.fill();
    x.fillStyle = 'rgba(255,255,255,1)'; x.beginPath(); x.ellipse(11, 9, 4, 2.4, -0.6, 0, 7); x.fill();
    _drop = new THREE.CanvasTexture(c); return _drop;
  }
  // Пятно краски на полу: появляется с «шлепком», живёт life секунд и тает
  R.splat = function (x, y, color, size, life) {
    var m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: inkTex(color, Math.floor(Math.random() * 6), false), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.rotation.x = -Math.PI / 2; m.rotation.z = Math.random() * 6.28; m.position.set(x, 0.8 + decals.length * 0.005, y); m.renderOrder = 1;
    scene.add(m);
    var D = { obj: m, t: 0, life: life || 24, size: size * FXS };
    decals.push(D);
    while (decals.length > 80) { var o = decals.shift(); scene.remove(o.obj); o.obj.geometry.dispose(); o.obj.material.dispose(); }
  };
  function stepDecals(dt) {
    decals = decals.filter(function (D) {
      D.t += dt; var u = D.t / D.life;
      if (u >= 1) { scene.remove(D.obj); D.obj.geometry.dispose(); D.obj.material.dispose(); return false; }
      var pop = D.t < 0.12 ? 0.4 + 0.6 * (D.t / 0.12) * 1.15 : (D.t < 0.2 ? 1.15 - (D.t - 0.12) / 0.08 * 0.15 : 1);
      D.obj.scale.set(D.size * pop, D.size * pop, 1);
      D.obj.material.opacity = u > 0.7 ? (1 - u) / 0.3 : 1;
      return true;
    });
  }
  var FXS = 1.82; // размер всех эффектов: +30% (D-067), ещё +40% (D-074)
  function drop(x, h, y, vx, vy, vz, color, sz) {
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dropTex(), color: new THREE.Color(color), transparent: true, depthWrite: false }));
    sp.scale.set(sz, sz, 1); sp.position.set(x, h, y); scene.add(sp);
    fxList.push({ obj: sp, t: 0, life: 2, vx: vx, vy: vy, vz: vz, g: 900, color: color, sz: sz });
  }
  R.burst = function (x, y, color, n, h) {
    for (var i = 0; i < (n || 10); i++) {
      var a = Math.random() * Math.PI * 2, v = (90 + Math.random() * 220) * FXS;
      drop(x, (h || 10) + Math.random() * 10, y, Math.cos(a) * v, 120 + Math.random() * 220, Math.sin(a) * v, color, (9 + Math.random() * 14) * FXS);
    }
  };
  // Струя реагента из устья трубы в точку лужи: капли летят по баллистике и шлёпаются вокруг (D-068)
  R.pour = function (from, to, color, dur, done) {
    fxList.push({ pour: true, t: 0, life: dur + 0.5, dur: dur, from: from, to: to, color: color, acc: 0, done: done });
  };
  R.ring = function (x, y, r, color, life) {
    var m = new THREE.Mesh(new THREE.RingGeometry(0.7, 1, 48), new THREE.MeshBasicMaterial({ color: color, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 3, y); scene.add(m);
    fxList.push({ obj: m, t: 0, life: life || 0.5, ring: r * FXS });
  };
  R.flash = function (x, y, r, color) {
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: new THREE.Color(color), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.position.set(x, 30, y); scene.add(sp); fxList.push({ obj: sp, t: 0, life: 0.45, flash: r * FXS });
  };
  // Молния — цепочка светящихся точек по ломаной (линии WebGL в 1 px на телефоне не видны)
  R.bolt = function (a, b, color, h) {
    var pts = [], n = 8, base = h || 30;
    for (var i = 0; i <= n; i++) { var u = i / n, j = i && i < n ? (Math.random() - 0.5) * 40 : 0; pts.push(new THREE.Vector3(a.x + (b.x - a.x) * u + j, base + Math.random() * 12, a.y + (b.y - a.y) * u + j)); }
    var g = new THREE.Group(), mat = new THREE.SpriteMaterial({ map: glowTex(), color: new THREE.Color(color || 0xfff27a), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    for (var k = 1; k < pts.length; k++) {
      var A = pts[k - 1], B = pts[k], L = A.distanceTo(B), m = Math.max(1, Math.round(L / 9));
      for (var q = 0; q < m; q++) { var sp = new THREE.Sprite(mat); sp.position.copy(A).lerp(B, q / m); sp.scale.set(16, 16, 1); g.add(sp); }
    }
    scene.add(g); fxList.push({ obj: g, t: 0, life: 0.4, fadeMat: mat });
  };
  // Заряд комбинации (D-079): спираль искр двух цветов вокруг жабы, дуги от напарника, двойное кольцо и вспышка
  R.chargeFx = function (from, to, c1, c2) {
    // две закрученные ленты искр: сплошные капли (видны на светлом полу) и свечение поверх (D-079, крупнее в D-081)
    for (var i = 0; i < 48; i++) {
      var solid = i % 3 !== 2, sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: solid ? dropTex() : glowTex(), color: new THREE.Color(i % 2 ? c2 : c1), transparent: true, depthWrite: false, blending: solid ? THREE.NormalBlending : THREE.AdditiveBlending }));
      scene.add(sp);
      fxList.push({ obj: sp, t: 0, life: 1.6, spiral: { x: to.x, y: to.y, a0: (i % 2 ? Math.PI : 0) + Math.floor(i / 2) / 24 * Math.PI * 3, r0: 30, d: Math.floor(i / 2) * 0.022, sz: solid ? 30 : 46 } });
    }
    var col = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: new THREE.Color(c1), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    col.center.set(0.5, 0.1); col.position.set(to.x, 0, to.y); scene.add(col);
    fxList.push({ obj: col, t: 0, life: 1.2, part: true, s0: 40, s1: 90, a0: 0.8, fin: 0.15, column: 380 });
    if (from) { R.bolt(from, to, c1, 40); setTimeout(function () { R.bolt(from, to, c2, 46); }, 90); }
    R.ring(to.x, to.y, 90, c1, 0.6); setTimeout(function () { R.ring(to.x, to.y, 120, c2, 0.7); }, 120);
    R.flash(to.x, to.y, 160, c1); R.flash(to.x, to.y, 110, c2);
  };
  R.orb = function (path, dur) {
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffb040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.scale.set(T.orbR * 7, T.orbR * 7, 1); scene.add(sp);
    var L = [0]; for (var i = 1; i < path.length; i++) L.push(L[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
    fxList.push({ obj: sp, t: 0, life: dur, path: path, L: L });
  };
  R.text = function (x, y, txt, cls) {
    var el = document.createElement('div'); el.className = 'ftext ' + (cls || ''); el.innerHTML = txt; labels.appendChild(el);
    var fx = { el: el, t: 0, life: 1.1, x: x, y: y }; fxList.push(fx); return fx;
  };
  // ---------- эффекты реакций (D-081): свой характер у каждой, без чернильных клякс — не путаются с лужами ----------
  var texCache = {};
  function canvasTex(key, draw) {
    if (texCache[key]) return texCache[key];
    var c = document.createElement('canvas'); c.width = c.height = 128; draw(c.getContext('2d'));
    var t = new THREE.CanvasTexture(c); return (texCache[key] = t);
  }
  function puffTex() { return canvasTex('puff', function (x) { for (var i = 0; i < 7; i++) { var a = i / 7 * 6.28, cx = 64 + Math.cos(a) * 22, cy = 64 + Math.sin(a) * 22, g = x.createRadialGradient(cx, cy, 2, cx, cy, 38); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); } }); }
  function shardTex() { return canvasTex('shard', function (x) { x.fillStyle = '#ffffff'; x.beginPath(); x.moveTo(64, 4); x.lineTo(84, 64); x.lineTo(64, 124); x.lineTo(44, 64); x.closePath(); x.fill(); x.fillStyle = 'rgba(160,255,230,0.9)'; x.beginPath(); x.moveTo(64, 4); x.lineTo(84, 64); x.lineTo(64, 64); x.closePath(); x.fill(); }); }
  function scorchTex() { return canvasTex('scorch', function (x) { var g = x.createRadialGradient(64, 64, 4, 64, 64, 62); g.addColorStop(0, 'rgba(10,6,2,0.9)'); g.addColorStop(0.55, 'rgba(40,24,8,0.6)'); g.addColorStop(1, 'rgba(40,24,8,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); x.strokeStyle = 'rgba(255,120,30,0.7)'; x.lineWidth = 2; for (var i = 0; i < 9; i++) { var a = i / 9 * 6.28 + Math.random() * 0.4; x.beginPath(); x.moveTo(64, 64); x.lineTo(64 + Math.cos(a) * (30 + Math.random() * 30), 64 + Math.sin(a) * (30 + Math.random() * 30)); x.stroke(); } }); }
  function hexTex() { return canvasTex('hex', function (x) { x.strokeStyle = '#ffffff'; x.lineWidth = 6; x.beginPath(); for (var i = 0; i <= 6; i++) { var a = i / 6 * 6.28 + 0.52; if (i) x.lineTo(64 + Math.cos(a) * 58, 64 + Math.sin(a) * 58); else x.moveTo(64 + Math.cos(a) * 58, 64 + Math.sin(a) * 58); } x.stroke(); }); }
  function solidTex() { return canvasTex('solid', function (x) { var g = x.createRadialGradient(64, 64, 0, 64, 64, 62); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.55, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); }); }
  function dotRingTex() { return canvasTex('ring', function (x) { var g = x.createRadialGradient(64, 64, 34, 64, 64, 62); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.55, 'rgba(255,255,255,1)'); g.addColorStop(0.8, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); }); }
  function sprite(tex, color, blend) { return new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(color), transparent: true, depthWrite: false, blending: blend ? THREE.AdditiveBlending : THREE.NormalBlending })); }
  function flatMesh(tex, color, size, y, blend) {
    var m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(color), transparent: true, depthWrite: false, blending: blend ? THREE.AdditiveBlending : THREE.NormalBlending }));
    m.rotation.x = -Math.PI / 2; m.position.y = y || 1.5; m.scale.set(size, size, 1); return m;
  }
  // универсальная частица: скорость с торможением, рост, вращение, появление и затухание
  function particle(obj, x, y, h, o) { obj.position.set(x, h || 20, y); scene.add(obj); fxList.push(Object.assign({ obj: obj, t: 0, part: true }, o)); }
  function stepParticle(f, dt, u) {
    var o = f.obj;
    if (f.v) { o.position.x += f.v.x * dt; o.position.y += f.v.y * dt; o.position.z += f.v.z * dt; if (f.drag) { var k = Math.max(0, 1 - f.drag * dt); f.v.x *= k; f.v.y *= k; f.v.z *= k; } }
    if (f.s0 !== undefined) { var s = f.s0 + (f.s1 - f.s0) * (f.ease ? 1 - Math.pow(1 - u, 3) : u); o.scale.set(s, f.column || s, 1); }
    if (f.spin && o.isSprite) o.material.rotation += f.spin * dt;
    var a = f.a0 !== undefined ? f.a0 : 1, fin = f.fin || 0;
    o.material.opacity = a * (fin && u < fin ? u / fin : (u > 0.55 ? (1 - u) / 0.45 : 1));
  }
  R.reactionFx = function (key, x, y, R0) {
    var r = R0 || 150, i, a, sp;
    if (key === 'fire+ice') { // STEAM VEIL — клубы пара разлетаются и поднимаются, шипящая волна
      for (i = 0; i < 26; i++) { a = Math.random() * 6.28; sp = 60 + Math.random() * 140; particle(sprite(puffTex(), i % 3 ? 0xf4f8fb : 0xc9d6de), x, y, 20, { life: 1.6 + Math.random() * 0.6, v: { x: Math.cos(a) * sp, y: 40 + Math.random() * 60, z: Math.sin(a) * sp }, drag: 1.4, s0: 40, s1: 150 + Math.random() * 80, ease: true, fin: 0.1, spin: (Math.random() - 0.5) * 2, a0: 0.9 }); }
      particle(flatMesh(dotRingTex(), 0xe8f6ff, 10, 2, false), x, y, 2, { life: 0.7, s0: 20, s1: r * 2.4, ease: true, a0: 0.8 });
    } else if (key === 'fire+poison') { // TOXIC DETONATION — огненный шар, ударная волна, выжженный след, дым
      particle(sprite(solidTex(), 0xff8a10, false), x, y, 40, { life: 0.55, s0: 40, s1: r * 1.7, ease: true, a0: 0.95 }); particle(sprite(glowTex(), 0xffd040, true), x, y, 60, { life: 0.4, s0: 60, s1: r * 2.2, ease: true });
      particle(sprite(solidTex(), 0x8cff10, false), x, y, 44, { life: 0.6, s0: 30, s1: r * 1.05, ease: true, a0: 0.9 });
      particle(flatMesh(dotRingTex(), 0xffd060, 10, 3, false), x, y, 3, { life: 0.55, s0: 30, s1: r * 2.3, ease: true });
      var scm = flatMesh(scorchTex(), 0xffffff, r * 1.5, 0.9, false); scm.rotation.z = Math.random() * 6.28; particle(scm, x, y, 0.9, { life: 14, a0: 0.9, fin: 0.02 });
      for (i = 0; i < 14; i++) { a = Math.random() * 6.28; particle(sprite(puffTex(), i % 2 ? 0x3a3020 : 0x4a5a20), x, y, 30, { life: 1.4, v: { x: Math.cos(a) * 120, y: 90 + Math.random() * 80, z: Math.sin(a) * 120 }, drag: 1.2, s0: 50, s1: 140, ease: true, fin: 0.15, a0: 0.75 }); }
      R.burst(x, y, '#ff7a00', 10, 30); R.burst(x, y, '#78ff14', 8, 30); R.shake(18);
    } else if (key === 'fire+lightning') { // PLASMA ORB — плазменный разряд: вспышка и лучи-молнии
      particle(flatMesh(solidTex(), 0xff9a30, T.cell * 3, 1.5, true), x, y, 1.5, { life: 0.5, s0: T.cell * 2, s1: T.cell * 3.4, ease: true, a0: 0.7 }); // вспышка по квадрату 3×3 (D-129)
      swirl(x, y, 24, r, [0xffe100, 0xff7a00], { out: true, w: 0.4, turns: 1, life: 0.6, sz: 20, lift: 40 });
      particle(sprite(solidTex(), 0xffb030, false), x, y, 40, { life: 0.45, s0: 30, s1: r * 1.4, ease: true });
      for (i = 0; i < 6; i++) { a = i / 6 * 6.28 + Math.random() * 0.3; R.bolt({ x: x, y: y }, { x: x + Math.cos(a) * r * 0.9, y: y + Math.sin(a) * r * 0.9 }, i % 2 ? '#ffe100' : '#ff7a00', 30); }
    } else if (key === 'ice+poison') { // TOXIC CRYSTAL — осколки разлетаются, морозная волна
      for (i = 0; i < 18; i++) { a = Math.random() * 6.28; var sh = sprite(shardTex(), i % 2 ? 0x8dff5a : 0x9fe8ff); sh.material.rotation = a; sp = 150 + Math.random() * 150; particle(sh, x, y, 30, { life: 0.9, v: { x: Math.cos(a) * sp, y: 60 + Math.random() * 120, z: Math.sin(a) * sp }, drag: 2, s0: 34, s1: 18 }); }
      particle(flatMesh(dotRingTex(), 0xb8ffe0, 10, 2.5, false), x, y, 2.5, { life: 0.7, s0: 20, s1: r * 1.8, ease: true });
    } else if (key === 'ice+lightning') { // FROST WARD (D-129) — морозная волна, иней и снежный вихрь, искры холода
      particle(flatMesh(dotRingTex(), 0xd8f6ff, 10, 3, false), x, y, 3, { life: 0.8, s0: 20, s1: r * 2.4, ease: true });
      particle(flatMesh(hexTex(), 0x9fe8ff, 10, 3.2, false), x, y, 3.2, { life: 0.9, s0: 60, s1: r * 1.6, ease: true, fin: 0.1 });
      swirl(x, y, 30, r * 1.1, [0xffffff, 0xbfefff, 0x7ad8ff], { out: true, w: 0.6, turns: 2, life: 1.0, sz: 16, lift: 50, tex: shardTex() });
      for (i = 0; i < 4; i++) { a = Math.random() * 6.28; R.bolt({ x: x, y: y }, { x: x + Math.cos(a) * r * 0.8, y: y + Math.sin(a) * r * 0.8 }, '#cff4ff', 20); }
    } else if (key === 'lightning+poison') { // TOXIC VORTEX (D-129) — ядовитый смерч затягивает внутрь, кольцо сжимается
      swirl(x, y, 54, r, [0x9dff3a, 0xc070ff, 0x78ff14], { w: 1.6, turns: 3, life: 1.1, sz: 24, lift: 60, stagger: 0.008 });
      particle(flatMesh(dotRingTex(), 0x9dff3a, 10, 3, false), x, y, 3, { life: 0.9, s0: r * 2.2, s1: 30, ease: true, a0: 0.9 });
      particle(flatMesh(dotRingTex(), 0xc070ff, 10, 3.2, false), x, y, 3.2, { life: 1.0, s0: r * 1.6, s1: 20, ease: true, a0: 0.8 });
      for (i = 0; i < 6; i++) { a = i / 6 * 6.28; particle(sprite(puffTex(), i % 2 ? 0x5a8a20 : 0x6a3a8a), x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8, 20, { life: 1.0, v: { x: -Math.cos(a) * r * 0.8, y: 60, z: -Math.sin(a) * r * 0.8 }, drag: 1, s0: 60, s1: 30, a0: 0.6 }); }
    } else { // OVERCHARGE — белая вспышка
      particle(sprite(solidTex(), 0xffffff, false), x, y, 40, { life: 0.5, s0: 30, s1: r * 2, ease: true });
    }
  };
  // ВСПЛЕСК (D-091): небольшая волна цвета элемента и 6 осколков по траекториям из симуляции
  R.surgeFx = function (x, y, color, r, shards, el) {
    var i, a, sp;
    for (i = 0; i < 14; i++) { a = Math.random() * 6.28; sp = 30 + Math.random() * 60; particle(sprite(dropTex(), color, false), x, y, 10, { life: 0.8, v: { x: Math.cos(a) * sp, y: 200 + Math.random() * 160, z: Math.sin(a) * sp }, drag: 1.8, s0: 26, s1: 10 }); }
    particle(flatMesh(dotRingTex(), color, 10, 3, false), x, y, 3, { life: 0.5, s0: 20, s1: r * 2.1, ease: true });
    particle(sprite(solidTex(), color, false), x, y, 30, { life: 0.35, s0: 30, s1: r * 1.1, ease: true, a0: 0.85 });
    (shards || []).forEach(function (sh, k) {
      if (sh.pts.length < 2) return;
      var L = [0]; for (var j = 1; j < sh.pts.length; j++) L.push(L[j - 1] + Math.hypot(sh.pts[j].x - sh.pts[j - 1].x, sh.pts[j].y - sh.pts[j - 1].y));
      var tex = el === 'ice' ? shardTex() : el === 'fire' ? solidTex() : el === 'poison' ? dropTex() : glowTex();
      var o = sprite(tex, color, el === 'lightning'); scene.add(o);
      fxList.push({ obj: o, t: 0, life: el === 'ice' ? 0.35 : el === 'fire' ? 0.65 : 0.5, shard: { pts: sh.pts, L: L, el: el, color: color, lob: sh.lob } });
    });
    R.shake(8);
  };
  function stepShard(f, u) {
    var S = f.shard, d = u * S.L[S.L.length - 1], i = 1; while (i < S.L.length - 1 && S.L[i] < d) i++;
    var a = S.pts[i - 1], b = S.pts[i], k = (d - S.L[i - 1]) / Math.max(1e-6, S.L[i] - S.L[i - 1]);
    var x = a.x + (b.x - a.x) * k, y = a.y + (b.y - a.y) * k, h = S.lob ? 20 + Math.sin(Math.PI * u) * 150 : 28;
    f.obj.position.set(x, h, y);
    var sz = (S.el === 'ice' ? 46 : S.el === 'fire' ? 30 : 32) * FXS;
    f.obj.scale.set(sz, sz, 1);
    if (S.el === 'ice') { // льдинка смотрит по ходу полёта
      var p0 = R.toScreen(a.x, h, a.y), p1 = R.toScreen(b.x, h, b.y); f.obj.material.rotation = Math.atan2(-(p1.y - p0.y), p1.x - p0.x) - Math.PI / 2;
    }
    f.obj.material.opacity = u > 0.85 ? (1 - u) / 0.15 : 1;
    if (S.el === 'poison') f.obj.scale.set(sz * (1 + 0.25 * Math.sin(u * 30)), sz * (1 - 0.2 * Math.sin(u * 30)), 1);
    if (Math.random() < 0.7) { // след: огонь — искры, лёд — иней, яд — капли, молния — разряд
      if (S.el === 'lightning' && Math.random() < 0.35) R.bolt({ x: a.x, y: a.y }, { x: x, y: y }, S.color, 26);
      else particle(sprite(S.el === 'poison' ? dropTex() : glowTex(), S.color, S.el !== 'poison'), x, y, h, { life: 0.35, s0: sz * 0.6, s1: 4, v: { x: 0, y: S.el === 'fire' ? 40 : 0, z: 0 } });
    }
    if (u > 0.97 && !f.boom) { f.boom = true; particle(sprite(solidTex(), S.color, false), x, y, h, { life: 0.3, s0: 20, s1: S.lob ? 110 : 60, ease: true, a0: 0.8 }); }
  }
  // нервный разряд к цели Neuroshock
  R.zap = function (a, b) { R.bolt(a, b, '#c070ff', 30); R.bolt(a, b, '#c6ff00', 36); };
  function stepFx(dt) {
    var cur = fxList; fxList = []; // эффекты, рождённые во время шага (капли струи, искры снаряда), попадут в новый список
    var keep = cur.filter(function (f) {
      f.t += dt; var u = f.t / f.life;
      if (f.pour) {
        if (f.t < f.dur) {
          f.acc += dt * 45;
          while (f.acc >= 1) {
            f.acc--; var Tf = 0.42 + Math.random() * 0.08, tx = f.to.x + (Math.random() - 0.5) * 50, ty = f.to.y + (Math.random() - 0.5) * 50, h0 = 45;
            drop(f.from.x, h0, f.from.y, (tx - f.from.x) / Tf, (0.5 * 900 * Tf * Tf - h0) / Tf, (ty - f.from.y) / Tf, f.color, (10 + Math.random() * 10) * FXS);
          }
        }
        if (!f.fired && f.t >= f.dur + 0.42) { f.fired = true; if (f.done) f.done(); }
        return u < 1 || !f.fired;
      }
      if (u >= 1) { if (f.obj) scene.remove(f.obj); if (f.el) f.el.remove(); return false; }
      if (f.vx !== undefined) { // капля краски: падает и шлёпается в маленькое пятно
        f.vy -= f.g * dt; f.obj.position.x += f.vx * dt; f.obj.position.y += f.vy * dt; f.obj.position.z += f.vz * dt;
        if (f.obj.position.y <= 2) { scene.remove(f.obj); f.obj.material.dispose(); return false; } // капли без пятен: краска на полу — только клетки (D-120)
      }
      else if (f.swirl) { // вихрь (D-129): частица кружит и затягивается к центру (или разлетается, если out)
        if (u < 0) return true; var W = f.swirl, k2 = W.out ? u : 1 - Math.pow(u, 0.8), rr = W.r0 * (W.out ? 0.15 + 0.85 * k2 : k2), aa = W.a0 + W.w * u * Math.PI * 2;
        f.obj.position.set(W.x + Math.cos(aa) * rr, W.h + Math.sin(u * Math.PI) * W.lift, W.y + Math.sin(aa) * rr);
        var sz2 = W.sz * (W.out ? 1 - u * 0.6 : 0.5 + 0.5 * (1 - u)); f.obj.scale.set(sz2, sz2, 1);
        f.obj.material.opacity = u < 0.15 ? u / 0.15 : (u > 0.7 ? (1 - u) / 0.3 : 1);
      }
      else if (f.ring) { var r = f.ring * (0.2 + 0.8 * Math.sqrt(u)); f.obj.scale.set(r, r, r); f.obj.material.opacity = 1 - u; }
      else if (f.flash) { var s = f.flash * (0.5 + u); f.obj.scale.set(s, s, 1); f.obj.material.opacity = 1 - u; }
      else if (f.path) {
        var d = u * f.L[f.L.length - 1], i = 1; while (i < f.L.length - 1 && f.L[i] < d) i++;
        var a = f.path[i - 1], b = f.path[i], k = (d - f.L[i - 1]) / Math.max(1e-6, f.L[i] - f.L[i - 1]);
        f.obj.position.set(a.x + (b.x - a.x) * k, 30, a.y + (b.y - a.y) * k);
        if (Math.random() < 0.8) particle(sprite(glowTex(), Math.random() < 0.5 ? 0xffc040 : 0xfff27a, true), f.obj.position.x, f.obj.position.z, 30, { life: 0.4, s0: 34, s1: 6, v: { x: (Math.random() - 0.5) * 80, y: 20, z: (Math.random() - 0.5) * 80 } }); // след плазмы, не краска
      }
      else if (f.fade) f.obj.material.opacity = 1 - u;
      else if (f.fadeMat) f.fadeMat.opacity = 1 - u;
      else if (f.part) stepParticle(f, dt, u);
      else if (f.shard) stepShard(f, u);
      else if (f.spiral) { var S = f.spiral, uu = Math.max(0, (f.t - S.d) / (f.life - S.d)), ang = S.a0 + uu * 9, rr = S.r0 + uu * 90; f.obj.position.set(S.x + Math.cos(ang) * rr, 10 + uu * 260, S.y + Math.sin(ang) * rr); f.obj.material.opacity = f.t < S.d ? 0 : (uu > 0.65 ? (1 - uu) / 0.35 : 1); var zz = (S.sz || 22) * (1 - uu * 0.5) * FXS; f.obj.scale.set(zz, zz, 1); }
      if (f.el) { var p = toScreen(f.x, 60 + u * 50, f.y); f.el.style.transform = 'translate(' + (p.x | 0) + 'px,' + (p.y | 0) + 'px) scale(' + (u < 0.15 ? 0.6 + u * 2.6 : 1) + ')'; f.el.style.opacity = u > 0.7 ? (1 - u) / 0.3 : 1; }
      return true;
    });
    fxList = keep.concat(fxList);
  }

  // ---------- превью прицела (§34–§35) ----------
  function dashedLine(pts, color, op) {
    var g = new THREE.BufferGeometry().setFromPoints(pts);
    var l = new THREE.Line(g, new THREE.LineDashedMaterial({ color: color, dashSize: 12, gapSize: 9, transparent: true, opacity: op || 1, depthTest: false }));
    l.computeLineDistances(); l.renderOrder = 10; return l;
  }
  // Пунктир из светящихся точек: WebGL-линии в 1 px на телефоне не видны
  var _dot = null;
  function dotTex() {
    if (_dot) return _dot;
    var c = document.createElement("canvas"); c.width = c.height = 32; var x = c.getContext("2d");
    x.fillStyle = "rgba(20,10,4,0.85)"; x.beginPath(); x.arc(16, 16, 15, 0, 7); x.fill();
    x.fillStyle = "#fff"; x.beginPath(); x.arc(16, 16, 10.5, 0, 7); x.fill();
    _dot = new THREE.CanvasTexture(c); return _dot;
  }
  function dots(pts, color, size, gap) {
    var g = new THREE.Group(), acc = 0, mat = new THREE.SpriteMaterial({ map: dotTex(), color: color, transparent: true, depthTest: false, depthWrite: false });
    for (var i = 1; i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i], L = a.distanceTo(b);
      while (acc <= L) { var sp = new THREE.Sprite(mat); sp.position.copy(a).lerp(b, L ? acc / L : 0); sp.scale.set(size, size, 1); sp.renderOrder = 11; g.add(sp); acc += gap; }
      acc -= L;
    }
    return g;
  }
  function flatRing(x, y, r0, r1, color, op) {
    var m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 48), new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: op, depthWrite: false, depthTest: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 3, y); m.renderOrder = 9; return m;
  }
  R.setAim = function (a) {
    if (aimGroup) { scene.remove(aimGroup); aimGroup.traverse(function (o) { if (o.geometry && !o.isSprite) o.geometry.dispose(); }); aimGroup = null; }
    var old = document.querySelectorAll('.alabel'); old.forEach(function (e) { e.remove(); });
    R.aimLabels = [];
    if (!a) return;
    aimGroup = new THREE.Group(); scene.add(aimGroup);
    var col = new THREE.Color(a.color || '#ffffff');
    a.segs.forEach(function (sg) {
      var pts = [];
      for (var i = 0; i <= 24; i++) { var u = i / 24, h = FB.Sim.arcAt(sg.h0, sg.H, u) * T.visH; pts.push(new THREE.Vector3(sg.from.x + (sg.to.x - sg.from.x) * u, h + 4, sg.from.y + (sg.to.y - sg.from.y) * u)); }
      aimGroup.add(dots(pts, col, 15, 22));
      if (sg.hit) aimGroup.add(flatRing(sg.to.x, sg.to.y, 6, 12, sg.wlz !== null && sg.wlz !== undefined ? 0xffb040 : 0xffffff, 0.9));
    });
    if (a.grip) aimGroup.add(flatRing(a.grip.x, a.grip.y, 14, 22, 0xffa030, 1));
    else {
      aimGroup.add(flatRing(a.land.x, a.land.y, a.r * 0.82, a.r * 1.08, col, 0.95));
      if (a.elemR) aimGroup.add(flatRing(a.land.x, a.land.y, a.elemR - 2, a.elemR, col, 0.4));
    }
    (a.pushes || []).forEach(function (p) {
      aimGroup.add(dots([new THREE.Vector3(p.from.x, 6, p.from.y), new THREE.Vector3(p.to.x, 6, p.to.y)], new THREE.Color(p.wall ? 0xff6040 : 0xffd080), 10, 14));
      aimGroup.add(flatRing(p.to.x, p.to.y, 4, 9, p.wall ? 0xff6040 : 0xffd080, 1));
    });
    // клетки (§19): куда ляжет элемент и что заденет реакция — видно до отпускания
    (a.cells || []).forEach(function (c) {
      var p = FB.Sim.cellCenter(c.i), cs = T.cell, col2 = new THREE.Color(c.color || a.color || '#ffffff');
      var fill = new THREE.Mesh(new THREE.PlaneGeometry(cs - 8, cs - 8), new THREE.MeshBasicMaterial({ color: col2, transparent: true, opacity: c.op || 0.22, depthWrite: false, depthTest: false }));
      fill.rotation.x = -Math.PI / 2; fill.position.set(p.x, 2.5, p.y); fill.renderOrder = 8; aimGroup.add(fill);
      if (c.edge !== false) [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(function (d) {
        var e = new THREE.Mesh(new THREE.PlaneGeometry(d[0] ? 5 : cs - 8, d[0] ? cs - 8 : 5), new THREE.MeshBasicMaterial({ color: col2, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false }));
        e.rotation.x = -Math.PI / 2; e.position.set(p.x + d[0] * (cs / 2 - 6), 2.6, p.y + d[1] * (cs / 2 - 6)); e.renderOrder = 9; aimGroup.add(e);
      });
    });
    if (a.orb) aimGroup.add(dots(a.orb.map(function (q) { return new THREE.Vector3(q.x, 30, q.y); }), new THREE.Color(0xffa040), 11, 24));
    if (a.crystal) {
      var c = a.crystal, m = new THREE.Mesh(new THREE.BoxGeometry(c.hl * 2, T.obstH * T.visH, c.ht * 2), new THREE.MeshBasicMaterial({ color: 0x5cff2e, transparent: true, opacity: 0.3, depthWrite: false }));
      m.position.set(c.cx, T.obstH * T.visH / 2, c.cy); m.rotation.y = -Math.atan2(c.uy, c.ux); aimGroup.add(m);
    }
    (a.autoSegs || []).forEach(function (sg) { // автоотскок от союзника — бледнее и мельче
      var pts = [];
      for (var i = 0; i <= 16; i++) { var u = i / 16, h = FB.Sim.arcAt(sg.h0, sg.H, u) * T.visH; pts.push(new THREE.Vector3(sg.from.x + (sg.to.x - sg.from.x) * u, h + 4, sg.from.y + (sg.to.y - sg.from.y) * u)); }
      var g = dots(pts, new THREE.Color(0xffffff), 10, 18); g.children.forEach(function (c) { c.material.opacity = 0.55; }); aimGroup.add(g);
    });
    (a.shards || []).forEach(function (sh) { // пути осколков всплеска — бледным пунктиром цвета элемента
      var g = dots(sh.pts.map(function (q) { return new THREE.Vector3(q.x, 8, q.y); }), new THREE.Color(a.shardColor || '#ffffff'), 9, 22);
      g.children.forEach(function (c) { c.material.opacity = 0.6; }); aimGroup.add(g);
    });
    if (a.ally) { // заряд: двойное кольцо вокруг своей жабы
      aimGroup.add(flatRing(a.ally.x, a.ally.y, a.ally.r * 1.25, a.ally.r * 1.45, new THREE.Color(a.ally.color), 0.95));
      aimGroup.add(flatRing(a.ally.x, a.ally.y, a.ally.r * 1.7, a.ally.r * 1.82, new THREE.Color(a.ally.color), 0.6));
    }
    if (a.veilR) aimGroup.add(flatRing(a.land.x, a.land.y, a.veilR - 3, a.veilR, 0xeef4f8, 0.6));
    if (a.blastR) aimGroup.add(flatRing(a.land.x, a.land.y, a.blastR - 3, a.blastR, 0xff7a30, 0.6));
    (a.labels || []).forEach(function (l) {
      var el = document.createElement('div'); el.className = 'alabel ' + (l.cls || ''); el.innerHTML = l.text; labels.appendChild(el);
      R.aimLabels.push({ el: el, x: l.x, y: l.y, h: l.h || 50 });
    });
  };

  R.debug = function () { return { aim: aimGroup ? aimGroup.children.map(function (c) { return c.type + (c.children.length ? ":" + c.children.length : ""); }) : null, fx: fxList.length }; };

  // ---------- камера, экранные координаты ----------
  var _v = new THREE.Vector3();
  function toScreen(x, h, y) {
    _v.set(x, h, y).project(camera);
    return { x: (_v.x * 0.5 + 0.5) * cv.clientWidth, y: (-_v.y * 0.5 + 0.5) * cv.clientHeight, vis: _v.z < 1 };
  }
  R.toScreen = toScreen;
  var _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2(), _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), _hit = new THREE.Vector3();
  R.toWorld = function (sx, sy, h) {
    _ndc.set(sx / cv.clientWidth * 2 - 1, -(sy / cv.clientHeight) * 2 + 1);
    _ray.setFromCamera(_ndc, camera); _plane.constant = -(h || 0);
    return _ray.ray.intersectPlane(_plane, _hit) ? { x: _hit.x, y: _hit.z } : null;
  };
  R.worldPerPx = function () { return 2 * cam.d * Math.tan(cam.fov * Math.PI / 360) / (cv.clientHeight || 1); };
  R.pan = function (dxPx, dyPx) { var k = R.worldPerPx(); cam.tx -= dxPx * k; cam.ty -= dyPx * k / Math.cos(cam.tilt); cam.user = true; clampCam(); };
  R.zoom = function (f, sx, sy) {
    var before = sx !== undefined ? R.toWorld(sx, sy) : null;
    cam.td = cam.d = Math.max(cam.minD, Math.min(cam.maxD, cam.d * f));
    placeCamera();
    if (before) { var after = R.toWorld(sx, sy); if (after) { cam.tx += before.x - after.x; cam.ty += before.y - after.y; } }
    cam.user = true; clampCam();
  };
  // Перелёт камеры к группе точек (D-131): все попадают в кадр с запасом под HUD сверху и снизу
  R.frameAll = function (pts, hudTopPx, hudBotPx) {
    if (!pts.length || !cv) return;
    var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, pad = 110;
    pts.forEach(function (p) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); });
    var hpx = cv.clientHeight || 1, top = hudTopPx || 0, bot = hudBotPx || 0, frac = Math.max(0.3, (hpx - top - bot) / hpx);
    var tf = Math.tan(cam.fov * Math.PI / 360), bw = x1 - x0 + pad * 2, bh = (y1 - y0 + pad * 2) / Math.cos(cam.tilt);
    var fracW = Math.max(0.4, ((cv.clientWidth || 1) - 130) / (cv.clientWidth || 1)); // слева полоса последовательности, справа зум
    var d = Math.max(bh / (2 * tf * frac), bw / (2 * tf * camera.aspect * fracW));
    d = Math.max(cam.minD * 1.4, Math.min(cam.maxD, d));
    var shift = (bot - top) / 2 * (2 * d * tf / hpx); // свободная середина экрана смещена — сдвигаем цель
    cam.follow = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 + shift }; cam.td = d; cam.user = false;
  };
  R.focus = function (x, y, zoomTo) { cam.follow = { x: x, y: y }; cam.user = false; if (zoomTo) cam.td = Math.max(cam.minD, Math.min(cam.maxD, cam.maxD * zoomTo)); };
  function clampCam() {
    var tf = Math.tan(cam.fov * Math.PI / 360), visH = 2 * cam.d * tf, visW = visH * camera.aspect;
    var mx = Math.max(0, (W - visW) / 2 + 60), my = Math.max(0, (H - visH) / 2 + 80);
    cam.tx = Math.max(W / 2 - mx, Math.min(W / 2 + mx, cam.tx));
    cam.ty = Math.max(H / 2 - my, Math.min(H / 2 + my, cam.ty));
  }
  function placeCamera() {
    var sx = cam.shake ? (Math.random() - 0.5) * cam.shake : 0, sz = cam.shake ? (Math.random() - 0.5) * cam.shake : 0;
    camera.position.set(cam.tx + sx, cam.d * Math.cos(cam.tilt), cam.ty + cam.d * Math.sin(cam.tilt) + sz);
    camera.lookAt(cam.tx + sx, 0, cam.ty + sz);
  }
  R.shake = function (a) { cam.shake = Math.max(cam.shake, a); };

  // ---------- кадр ----------
  var tAll = 0;
  R.frame = function (dt) {
    if (!renderer) return;
    tAll += dt;
    if (cam.follow && !cam.user) {
      var k = Math.min(1, dt * 4);
      cam.tx += (cam.follow.x - cam.tx) * k; cam.ty += (cam.follow.y - cam.ty) * k;
    }
    cam.d += (cam.td - cam.d) * Math.min(1, dt * 5);
    clampCam();
    cam.shake = Math.max(0, cam.shake - dt * 40);
    placeCamera();
    var s = app.shown;
    if (s) {
      syncDyn(s, tAll);
      syncFlasks(s, tAll);
      syncAnchors(s, tAll);
      s.frogs.forEach(function (f) { var d = app.disp[f.id]; if (d) syncFrog(f, d, dt, tAll, d.hidden); });
    }
    stepFx(dt * R.fxScale); stepDecals(dt * R.fxScale); // fxScale — замедление эффектов для отладки
    (R.aimLabels || []).forEach(function (l) { var p = toScreen(l.x, l.h, l.y); l.el.style.transform = 'translate(' + (p.x | 0) + 'px,' + (p.y | 0) + 'px)'; });
    renderer.render(scene, camera);
  };
})();
