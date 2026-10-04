// 3D-рендер итерации 2 (Three.js r128): арена по макету с высокими стенами, перспективная камера сверху
// (панорама, зум, слежение), жабы из отдельных частей (атлас + риг) с позами прыжка, приземления и захвата стены,
// эликсир в резервуаре перекрашивается под элемент (D-053, D-054). Состояние читает из main.js, сам ничего не решает.
(function () {
  var T = FB.T, AR = FB.ARENA, K = FB.K;
  var W = T.IMG_W * K, H = T.IMG_H * K;
  var R = FB.R3 = { fxScale: 1 };
  var renderer, scene, camera, cv, sun, labels;
  var tex = {}, rigs = {}, atlasImg = {}, fullImg = {}, recolored = {};
  var frogs = {}, dyn = { puddles: {}, nodes: {}, veils: {}, crystals: {} }, fxList = [], aimGroup = null;
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
    if (!el) return c;
    var E = FB.ELEMENTS[el], id = x.getImageData(0, 0, c.width, c.height), d = id.data;
    for (var i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 10) continue;
      var q = rgb2hsl(d[i], d[i + 1], d[i + 2]);
      if (q[0] < 150 || q[0] > 195 || q[1] < 0.25) continue;
      var rgb = hsl2rgb(E.hue, Math.min(1, q[1] * 1.3 + 0.25), Math.min(0.95, q[2] + (E.light || 0))); // ярче, чем на арте: «краска» (D-063)
      d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2];
    }
    x.putImageData(id, 0, 0);
    return c;
  }
  R.portrait = function (kind, el) { // канвас для UI (команда, алхимия, HUD)
    var key = 'full:' + kind + ':' + (el || '');
    if (!recolored[key] && fullImg[kind]) recolored[key] = recolor(fullImg[kind], el);
    return recolored[key];
  };
  function atlasTex(kind, el) {
    var key = kind + ':' + (el || '');
    if (!tex[key]) {
      var t = new THREE.CanvasTexture(recolor(atlasImg[kind], el));
      t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
      tex[key] = t;
    }
    return tex[key];
  }

  // ---------- загрузка ----------
  var BUILD = window.FB_BUILD && window.FB_BUILD !== 'dev' ? window.FB_BUILD : String(Date.now()); // метка сборки против кэша
  function bust(src) { return src + '?b=' + BUILD; }
  function loadImg(src) { return new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = function () { rej(new Error(src)); }; i.src = bust(src); }); }
  R.load = function () {
    var jobs = [loadImg('art/src/arena.webp').then(function (i) { atlasImg.arena = i; })];
    FB.FROG_ORDER.concat(['wild']).forEach(function (k) {
      jobs.push(loadImg('art/out/' + k + '_atlas.png').then(function (i) { atlasImg[k] = i; }));
      jobs.push(loadImg('art/out/' + k + '_full.png').then(function (i) { fullImg[k] = i; }));
      jobs.push(fetch(bust('art/out/' + k + '_rig.json')).then(function (r) { return r.json(); }).then(function (j) { rigs[k] = j; }));
    });
    return Promise.all(jobs);
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
    for (var row = 0; row < 8; row++) for (var col = -1; col < 5; col++) {
      var bx = col * 64 + (row % 2) * 32, by = row * 32, v = 70 + Math.random() * 40;
      x.fillStyle = 'rgb(' + (v + 10 | 0) + ',' + (v | 0) + ',' + (v - 12 | 0) + ')';
      x.fillRect(bx + 2, by + 2, 60, 28);
      x.fillStyle = 'rgba(255,240,210,0.08)'; x.fillRect(bx + 2, by + 2, 60, 4);
      x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(bx + 2, by + 26, 60, 4);
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
  // Колонна меньше нарисованной (D-086): место старой закрываем плитками пола из-под неё,
  // саму колонну рисуем уменьшенной на её новом месте, с мягкой тенью.
  function arenaArt() {
    var img = atlasImg.arena, c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    var x = c.getContext('2d'), o = AR.columnArt, w = o.x1 - o.x0, h = o.y1 - o.y0;
    x.drawImage(img, 0, 0);
    x.drawImage(img, o.x0, o.y1 + 45, w, h, o.x0, o.y0, w, h); // свободный пол прямо под колонной
    var n = { x0: AR.column.x0 / K, y0: AR.column.y0 / K, x1: AR.column.x1 / K, y1: AR.column.y1 / K };
    x.save(); x.shadowColor = 'rgba(0,0,0,0.55)'; x.shadowBlur = 24; x.shadowOffsetY = 10;
    x.fillStyle = '#2a2420'; x.fillRect(n.x0 + 4, n.y0 + 4, n.x1 - n.x0 - 8, n.y1 - n.y0 - 8); x.restore();
    x.drawImage(img, o.x0, o.y0, w, h, n.x0, n.y0, n.x1 - n.x0, n.y1 - n.y0);
    return c;
  }
  function extrude(shape, h, topMat, sideMat) {
    var g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, UVGenerator: arenaUV });
    g.rotateX(-Math.PI / 2); // (x, −y, h) → (x, h, y)
    var m = new THREE.Mesh(g, [topMat, sideMat]);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }
  function buildArena() {
    var at = new THREE.Texture(arenaArt()); at.needsUpdate = true; at.encoding = THREE.sRGBEncoding; at.anisotropy = 8;
    var floorMat = new THREE.MeshLambertMaterial({ map: at });
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), floorMat);
    floor.rotation.x = -Math.PI / 2; floor.position.set(W / 2, 0, H / 2); floor.receiveShadow = true;
    scene.add(floor);
    var under = new THREE.Mesh(new THREE.PlaneGeometry(W * 4, H * 3), new THREE.MeshBasicMaterial({ color: 0x0d0906 }));
    under.rotation.x = -Math.PI / 2; under.position.set(W / 2, -2, H / 2); scene.add(under);

    var stone = stoneTexture();
    var topMat = new THREE.MeshLambertMaterial({ map: at }), sideMat = new THREE.MeshLambertMaterial({ map: stone, color: 0xb8a890 });
    // стены: прямоугольник картинки с дыркой-полом, выше любой дуги прыжка
    var outer = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(W, 0), new THREE.Vector2(W, -H), new THREE.Vector2(0, -H)]);
    outer.holes.push(new THREE.Path(AR.floor.map(function (p) { return new THREE.Vector2(p.x, -p.y); })));
    scene.add(extrude(outer, T.wallH, topMat, sideMat));
    // колонна
    var C = AR.column;
    var col = new THREE.Shape([new THREE.Vector2(C.x0, -C.y0), new THREE.Vector2(C.x0, -C.y1), new THREE.Vector2(C.x1, -C.y1), new THREE.Vector2(C.x1, -C.y0)]);
    scene.add(extrude(col, T.colLowH * T.visH, topMat, sideMat)); // вдвое ниже прежней — сверху резервуар с NPC (D-103)
    buildTank();
    // Wall Launch Zones: светящиеся панели на внутренней грани стены
    // Wall Launch Zones: полоса на грани стены, на её верхе и подсветка пола — камера сверху видит грани почти ребром
    var wz = new THREE.MeshBasicMaterial({ map: stripeTexture(), transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
    var wf = new THREE.MeshBasicMaterial({ map: fadeTexture(), transparent: true, opacity: 0.8, depthWrite: false });
    AR.wlz.forEach(function (z) {
      var xs = AR.floor.map(function (p) { return p.x; }), L = z.side === 'L', x = L ? Math.min.apply(0, xs) : Math.max.apply(0, xs), cy = (z.y0 + z.y1) / 2, len = z.y1 - z.y0, k = L ? 1 : -1;
      var m = new THREE.Mesh(new THREE.PlaneGeometry(len, T.wallH * 0.8), wz);
      m.position.set(x + k * 1.5, T.wallH * 0.45, cy); m.rotation.y = L ? Math.PI / 2 : -Math.PI / 2; scene.add(m);
      var top = new THREE.Mesh(new THREE.PlaneGeometry(44, len), wz);
      top.rotation.x = -Math.PI / 2; top.position.set(x - k * 22, T.wallH + 0.6, cy); scene.add(top);
      var fl = new THREE.Mesh(new THREE.PlaneGeometry(110, len), wf);
      fl.rotation.x = -Math.PI / 2; fl.rotation.z = L ? 0 : Math.PI; fl.position.set(x + k * 55, 1.2, cy); scene.add(fl);
    });
  }
  function fadeTexture() {
    var c = document.createElement('canvas'); c.width = 64; c.height = 8; var x = c.getContext('2d');
    var g = x.createLinearGradient(0, 0, 64, 0); g.addColorStop(0, "rgba(255,160,40,0.95)"); g.addColorStop(1, "rgba(255,160,40,0)");
    x.fillStyle = g; x.fillRect(0, 0, 64, 8); var t = new THREE.CanvasTexture(c); return t;
  }
  function stripeTexture() {
    var c = document.createElement('canvas'); c.width = 256; c.height = 64; var x = c.getContext('2d');
    var g = x.createLinearGradient(0, 0, 0, 64); g.addColorStop(0, 'rgba(255,170,60,0.15)'); g.addColorStop(0.5, 'rgba(255,190,80,0.9)'); g.addColorStop(1, 'rgba(255,170,60,0.15)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 64);
    x.fillStyle = 'rgba(60,30,10,0.55)'; for (var i = -64; i < 256; i += 32) { x.beginPath(); x.moveTo(i, 64); x.lineTo(i + 16, 64); x.lineTo(i + 48, 0); x.lineTo(i + 32, 0); x.fill(); }
    x.strokeStyle = '#ffe2a0'; x.lineWidth = 3; x.strokeRect(2, 2, 252, 60);
    var t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
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
    squash: { f: [-40, 46], r: [44, -52], s: 0.86 }   // на неё запрыгнули: лапы под телом, сплющилась
  };
  function wrapA(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
  function buildFrog(f) {
    var rig = rigs[f.kind], grp = new THREE.Group(), lift = new THREE.Group(), root = new THREE.Group();
    grp.add(lift); lift.add(root);
    var mat = new THREE.MeshLambertMaterial({ map: atlasTex(f.kind, f.npc ? null : f.el), alphaTest: 0.5, side: THREE.DoubleSide });
    var partMats = {};
    var depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: mat.map, alphaTest: 0.5 });
    var by = {}, nodes = {}, AW = rig.w, AH = rig.h;
    rig.parts.forEach(function (p) { by[p.name] = p; });
    function make(p) {
      if (nodes[p.name]) return nodes[p.name];
      var node = new THREE.Group(), par = p.parent ? by[p.parent] : null;
      var w = p.rect[2], h = p.rect[3], g = new THREE.PlaneGeometry(w, h);
      var uv = g.attributes.uv, own = f.npc && (p.name === 'head' || p.name === 'res');
      if (!own) for (var i = 0; i < uv.count; i++) { var u = uv.getX(i), v = uv.getY(i); uv.setXY(i, (p.rect[0] + u * w) / AW, 1 - (p.rect[1] + (1 - v) * h) / AH); }
      g.rotateX(-Math.PI / 2);
      var pm = mat;
      if (f.npc && (p.name === 'head' || p.name === 'res')) { // своя текстура на деталь: перекраска по раунду
        for (var q = 0; q < uv.count; q++) uv.setXY(q, uv.getX(q), uv.getY(q)); // uv 0..1 — вся деталь
        g.attributes.uv.needsUpdate = true;
        pm = partMats[p.name] = new THREE.MeshLambertMaterial({ alphaTest: 0.5, side: THREE.DoubleSide });
        pm.userData.rect = p.rect;
      }
      var m = new THREE.Mesh(g, pm); m.castShadow = true; m.customDepthMaterial = depth;
      if (pm !== mat) m.castShadow = false; // у деталей со своей текстурой тень от тела
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
    var ring = new THREE.Mesh(new THREE.RingGeometry(f.r * 0.92, f.r * 1.12, 40), new THREE.MeshBasicMaterial({ color: f.npc ? 0xb050ff : f.side === 0 ? 0x4aa3ff : 0xff5a4a, transparent: true, opacity: 0.85, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 2.6; ring.renderOrder = 4;
    grp.add(ring);
    var glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: new THREE.Color(FB.ELEMENTS[f.el].color), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.set(f.r * 2.2, f.r * 2.2, 1); glow.position.y = 14; lift.add(glow);
    var shell = new THREE.Mesh(new THREE.SphereGeometry(f.r * 1.45, 24, 16), new THREE.MeshBasicMaterial({ color: 0x9fe0ff, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
    shell.visible = false; lift.add(shell);
    var label = document.createElement('div'); label.className = 'flabel ' + (f.npc ? 'npc' : f.side === 0 ? 'mine' : 'enemy');
    label.innerHTML = '<div class="fl-st"></div><div class="fl-hp"><i></i></div>';
    labels.appendChild(label);
    scene.add(grp);
    return { grp: grp, lift: lift, root: root, mat: mat, partMats: partMats, limbs: limbs, order: order, rootA: rig.flip ? Math.PI : 0, blob: blob, ring: ring, glow: glow, shell: shell, label: label, el: f.el, pose: 'idle', kind: f.kind, r: f.r };
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
    Object.keys(frogs).forEach(function (id) { scene.remove(frogs[id].grp); frogs[id].label.remove(); });
    frogs = {};
    ['puddles', 'nodes', 'veils', 'crystals'].forEach(function (k) { Object.keys(dyn[k]).forEach(function (id) { scene.remove(dyn[k][id].obj); }); dyn[k] = {}; });
    fxList.forEach(function (f) { if (f.obj) scene.remove(f.obj); if (f.el) f.el.remove(); }); fxList = [];
    decals.forEach(function (D) { scene.remove(D.obj); }); decals = [];
    R.setAim(null);
  };

  function syncFrog(f, d, dt, t, hidden) {
    var F = frogs[f.id] || (frogs[f.id] = buildFrog(f));
    if (f.npc) {
      var nk = f.res + '|' + f.eyes.join('+');
      if (F.npcKey !== nk) { F.npcKey = nk; npcRecolor(F, f); F.glow.material.color.set(FB.ELEMENTS[f.res].color); }
    } else if (F.el !== f.el) { F.el = f.el; F.mat.map = atlasTex(f.kind, f.el); F.mat.needsUpdate = true; F.glow.material.color.set(FB.ELEMENTS[f.el].color); }
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
    var pose = POSES[d.pose] || POSES.idle, k = Math.min(1, dt * (pose.dir ? 18 : 12));
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
    var breathe = d.pose === 'idle' && d.alive ? 1 + Math.sin(t * 2.4 + f.id) * 0.018 : 1;
    F.sc = (F.sc || 1) + ((pose.s * breathe * (1 + (d.squash || 0))) - (F.sc || 1)) * Math.min(1, dt * 16);
    F.st = (F.st || 0) + ((d.stretch || 0) - (F.st || 0)) * Math.min(1, dt * 14);
    F.lift.scale.set(F.sc * (1 - F.st * 0.45), F.sc, F.sc * (1 + F.st)); // вытягивается вдоль тела в полёте
    F.ring.visible = d.alive; F.ring.material.opacity = d.sel ? 1 : 0.6;
    F.ring.scale.setScalar(d.sel ? 1.12 + Math.sin(t * 6) * 0.05 : 1);
    if (!d.alive) { F.mat.color.setRGB(0.35, 0.33, 0.32); F.glow.visible = false; }
    else {
      var fl = d.flash || 0; F.dk = (F.dk || 0) + ((d.dark ? 1 : 0) - (F.dk || 0)) * Math.min(1, dt * 8); var sh = 1 - F.dk * 0.5; // тень от жабы сверху (D-083)
      F.mat.color.setRGB((1 + fl * 2) * sh, (1 + fl * 1.2) * sh, (1 + fl * 1.2) * sh);
      F.mat.emissive && F.mat.emissive.setRGB(fl * 0.6, fl * 0.2, fl * 0.2);
      F.glow.visible = true; F.glow.material.opacity = 0.35 + 0.2 * Math.sin(t * 3 + f.id * 1.7) + (f.charge ? 0.25 : 0);
    }
    F.shell.visible = !!f.shell && d.alive;
    // заряд комбинации: вокруг корпуса кружат огоньки двух цветов (GDD §20, D-079)
    if (f.charge && d.alive) {
      var ck = f.charge.join('+');
      if (!F.orbit || F.orbitKey !== ck) {
        if (F.orbit) F.lift.remove(F.orbit);
        F.orbit = new THREE.Group(); F.orbitKey = ck;
        for (var oi = 0; oi < 8; oi++) {
          var os = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: new THREE.Color(FB.ELEMENTS[f.charge[oi % 2]].color), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
          os.userData.a = oi / 8 * Math.PI * 2; os.scale.set(f.r * 0.55, f.r * 0.55, 1); F.orbit.add(os);
        }
        F.lift.add(F.orbit);
      }
      F.orbit.visible = true;
      F.orbit.children.forEach(function (os, i) {
        var a = os.userData.a + t * (i % 2 ? 2.6 : -2.1), rr = f.r * (1.35 + 0.12 * Math.sin(t * 5 + i));
        os.position.set(Math.cos(a) * rr, 18 + 10 * Math.sin(t * 4 + i * 1.3), Math.sin(a) * rr);
        os.material.opacity = 0.65 + 0.35 * Math.sin(t * 9 + i * 2);
      });
    } else if (F.orbit) F.orbit.visible = false;
    // под Neuroshock жаба потрескивает разрядами (D-081)
    if (f.neuro && d.alive && !hidden && Math.random() < dt * 4) {
      var za = Math.random() * 6.28; R.bolt({ x: d.x + Math.cos(za) * f.r, y: d.y + Math.sin(za) * f.r }, { x: d.x - Math.cos(za) * f.r, y: d.y - Math.sin(za) * f.r }, Math.random() < 0.5 ? '#c070ff' : '#c6ff00', hv + 25);
    }
    // подпись над жабой: HP и статусы
    var st = '';
    if (f.charge) st += '<b class="ch">' + FB.ELEMENTS[f.charge[0]].icon + FB.ELEMENTS[f.charge[1]].icon + '</b>';
    if (f.poison) st += '<span>☠</span>'; if (f.chill) st += '<span>❄</span>'; if (f.neuro) st += '<span>⚡' + f.neuro + '</span>';
    if (f.pinnedBy >= 0) st += '<span>🎯</span>'; if (f.shell) st += '<span>🛡</span>';
    if (F.stHtml !== st) { F.stHtml = st; F.label.firstChild.innerHTML = st; }
    var w = Math.max(0, f.hp / f.maxHp) * 100;
    if (F.hpW !== w) { F.hpW = w; F.label.lastChild.firstChild.style.width = w + '%'; }
    var p = toScreen(d.x, hv + 30, d.y - f.r * 1.2);
    F.label.style.transform = 'translate(' + (p.x | 0) + 'px,' + (p.y | 0) + 'px)';
  }

  // ---------- объекты состояния: лужи, узлы, облака, кристаллы ----------
  function discMat(color, op) { return new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: op, depthWrite: false }); }
  function syncDyn(s, t) {
    var seen = {};
    s.puddles.forEach(function (p) {
      seen[p.id] = 1;
      var D = dyn.puddles[p.id];
      if (!D) {
        var g = new THREE.Group(), E = FB.ELEMENTS[p.el];
        // лужа — глянцевая клякса краски; гладкий край отличает её от следов приземлений
        var disc = new THREE.Mesh(new THREE.PlaneGeometry(p.r * 2.5, p.r * 2.5), new THREE.MeshBasicMaterial({ map: inkTex(E.color, p.id.length + p.x % 5 | 0, true), transparent: true, depthWrite: false }));
        disc.rotation.x = -Math.PI / 2; disc.rotation.z = (p.x * 0.013 + p.y * 0.007) % 6.28; disc.position.y = 1.6; disc.renderOrder = 2; g.add(disc);
        // свечение — плоский круг на полу: спрайт смотрит в камеру, поднимается и ложится поверх жабы (D-076)
        var gl = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glowTex(), color: new THREE.Color(E.color), transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending }));
        gl.rotation.x = -Math.PI / 2; gl.renderOrder = 1;
        gl.scale.set(p.r * 2.6, p.r * 2.6, 1); gl.position.y = 1.0; g.add(gl);
        var lab = document.createElement('div'); lab.className = 'plabel'; lab.textContent = E.icon; labels.appendChild(lab);
        g.position.set(p.x, 0, p.y); scene.add(g);
        D = dyn.puddles[p.id] = { obj: g, disc: disc, gl: gl, lab: lab, born: t };
      }
      var on = p.active, a = Math.min(1, (t - D.born) * 3);
      D.disc.material.opacity = on ? 1 : 0.35; D.disc.material.color.setScalar(on ? 1 : 0.55); D.gl.visible = on;
      D.gl.material.opacity = 0.22 + 0.1 * Math.sin(t * 2.5 + p.x);
      var wob = on ? 1 + 0.035 * Math.sin(t * 3.1 + p.y) : 0.92, pop = a < 1 ? 0.3 + a * 0.85 : 1;
      D.obj.scale.set(wob * pop, 1, (2 - wob) * pop);
      var covered = s.frogs.some(function (f) { var dd = app.disp[f.id]; return dd && f.alive && !dd.hidden && Math.hypot(dd.x - p.x, dd.y - p.y) < p.r + f.r * 0.5; });
      D.lab.style.opacity = covered ? 0 : (on ? 1 : 0.3); // значок не лезет поверх жабы, стоящей в луже
      var q = toScreen(p.x, 2, p.y); D.lab.style.transform = 'translate(' + (q.x | 0) + 'px,' + (q.y | 0) + 'px)';
    });
    Object.keys(dyn.puddles).forEach(function (id) { if (!seen[id]) { scene.remove(dyn.puddles[id].obj); dyn.puddles[id].lab.remove(); delete dyn.puddles[id]; } });

    s.nodes.forEach(function (n) {
      var D = dyn.nodes[n.id];
      if (!D) {
        var g = new THREE.Group();
        var ring = new THREE.Mesh(new THREE.RingGeometry(T.nodeR * 0.8, T.nodeR * 1.15, 32), discMat(0xffffff, 0)); ring.rotation.x = -Math.PI / 2; ring.position.set(n.x, 1.6, n.y); g.add(ring);
        var ghost = new THREE.Mesh(new THREE.RingGeometry(T.puddleR * 0.9, T.puddleR, 48), discMat(0xffffff, 0)); ghost.rotation.x = -Math.PI / 2; ghost.position.set(n.sx, 1.6, n.sy); g.add(ghost);
        var lab = document.createElement('div'); lab.className = 'nlabel'; labels.appendChild(lab);
        scene.add(g); D = dyn.nodes[n.id] = { obj: g, ring: ring, ghost: ghost, lab: lab, key: null };
      }
      var key = n.el ? n.el + n.side : '';
      if (D.key !== key) {
        D.key = key;
        if (n.el) { var c = FB.ELEMENTS[n.el].color; D.ring.material.color.set(c); D.ghost.material.color.set(c); D.lab.innerHTML = 'NEXT ROUND<br>' + FB.ELEMENTS[n.el].icon + ' ' + FB.ELEMENTS[n.el].name; D.lab.style.color = c; D.lab.className = 'nlabel ' + (n.side === 0 ? 'mine' : 'enemy'); }
      }
      var pulse = 0.5 + 0.3 * Math.sin(t * 4 + n.id);
      D.ring.material.opacity = n.el ? 0.85 : 0.18 + 0.1 * Math.sin(t * 2 + n.id);
      if (!n.el) D.ring.material.color.set(0xd8c8a8);
      D.ghost.material.opacity = n.el ? pulse : 0;
      D.lab.style.display = n.el ? '' : 'none';
      var q = toScreen(n.sx, 4, n.sy); D.lab.style.transform = 'translate(' + (q.x | 0) + 'px,' + (q.y | 0) + 'px)';
    });

    var vs = {};
    (s.veils || []).forEach(function (v) {
      vs[v.id] = 1;
      var D = dyn.veils[v.id];
      if (!D) {
        var g = new THREE.Group();
        for (var i = 0; i < 9; i++) {
          var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex(), color: 0xeef4f8, transparent: true, opacity: 0.5, depthWrite: false }));
          var a = i / 9 * Math.PI * 2, rr = i ? v.r * 0.55 : 0;
          sp.position.set(Math.cos(a) * rr, 40 + (i % 3) * 14, Math.sin(a) * rr); sp.scale.set(v.r * 1.3, v.r * 1.3, 1);
          sp.userData.ph = i; g.add(sp);
        }
        g.position.set(v.x, 0, v.y); scene.add(g); D = dyn.veils[v.id] = { obj: g, born: t };
      }
      var a2 = Math.min(1, (t - D.born) * 2);
      D.obj.children.forEach(function (sp) { sp.material.opacity = (v.side === 0 ? 0.32 : 0.62) * a2; sp.position.y = 40 + Math.sin(t * 0.8 + sp.userData.ph) * 8; });
      D.obj.scale.setScalar(0.4 + 0.6 * a2);
    });
    Object.keys(dyn.veils).forEach(function (id) { if (!vs[id]) { scene.remove(dyn.veils[id].obj); delete dyn.veils[id]; } });

    var cs = {};
    (s.crystals || []).forEach(function (c) {
      cs[c.id] = 1;
      var D = dyn.crystals[c.id];
      if (!D) {
        var m = new THREE.Mesh(new THREE.BoxGeometry(c.hl * 2, T.obstH * T.visH, c.ht * 2), new THREE.MeshLambertMaterial({ color: 0x5cff2e, emissive: new THREE.Color(0x1f9a10), transparent: true, opacity: 0.88 }));
        m.castShadow = true; m.position.set(c.cx, T.obstH * T.visH / 2, c.cy); m.rotation.y = -Math.atan2(c.uy, c.ux);
        scene.add(m); D = dyn.crystals[c.id] = { obj: m, born: t };
      }
      var a3 = Math.min(1, (t - D.born) * 3);
      D.obj.scale.y = Math.max(0.01, a3); D.obj.position.y = T.obstH * T.visH / 2 * a3;
    });
    Object.keys(dyn.crystals).forEach(function (id) { if (!cs[id]) { scene.remove(dyn.crystals[id].obj); delete dyn.crystals[id]; } });
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
      particle(sprite(solidTex(), 0xffb030, false), x, y, 40, { life: 0.45, s0: 30, s1: r * 1.4, ease: true });
      for (i = 0; i < 6; i++) { a = i / 6 * 6.28 + Math.random() * 0.3; R.bolt({ x: x, y: y }, { x: x + Math.cos(a) * r * 0.9, y: y + Math.sin(a) * r * 0.9 }, i % 2 ? '#ffe100' : '#ff7a00', 30); }
    } else if (key === 'ice+poison') { // TOXIC CRYSTAL — осколки разлетаются, морозная волна
      for (i = 0; i < 18; i++) { a = Math.random() * 6.28; var sh = sprite(shardTex(), i % 2 ? 0x8dff5a : 0x9fe8ff); sh.material.rotation = a; sp = 150 + Math.random() * 150; particle(sh, x, y, 30, { life: 0.9, v: { x: Math.cos(a) * sp, y: 60 + Math.random() * 120, z: Math.sin(a) * sp }, drag: 2, s0: 34, s1: 18 }); }
      particle(flatMesh(dotRingTex(), 0xb8ffe0, 10, 2.5, false), x, y, 2.5, { life: 0.7, s0: 20, s1: r * 1.8, ease: true });
    } else if (key === 'ice+lightning') { // STATIC SHELL — шестигранник-щит вспыхивает, по кругу трещат молнии
      particle(flatMesh(hexTex(), 0x2fd8ff, 10, 3, false), x, y, 3, { life: 0.9, s0: 160, s1: 90, ease: true, fin: 0.1 });
      for (i = 0; i < 6; i++) { a = i / 6 * 6.28; var b = a + 1.05; R.bolt({ x: x + Math.cos(a) * 70, y: y + Math.sin(a) * 70 }, { x: x + Math.cos(b) * 70, y: y + Math.sin(b) * 70 }, '#9fe0ff', 40); }
    } else if (key === 'lightning+poison') { // NEUROSHOCK — электрическая волна, фиолетово-лаймовая
      particle(flatMesh(dotRingTex(), 0xc070ff, 10, 3, false), x, y, 3, { life: 0.8, s0: 20, s1: r * 2.2, ease: true });
      particle(flatMesh(dotRingTex(), 0xc6ff00, 10, 3.2, false), x, y, 3.2, { life: 0.9, s0: 10, s1: r * 1.7, ease: true });
      for (i = 0; i < 5; i++) { a = Math.random() * 6.28; R.bolt({ x: x, y: y }, { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r }, i % 2 ? '#c070ff' : '#c6ff00', 25); }
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
  // ---------- дикая жаба-NPC (D-102, D-103) ----------
  // Перекраска по раунду: жидкость в резервуаре — цвет слабого места, глаза — пара элементов её реакции
  var npcTexCache = {};
  function npcPartTex(part, rect, fn, key) {
    if (npcTexCache[key]) return npcTexCache[key];
    var c = document.createElement('canvas'); c.width = rect[2]; c.height = rect[3];
    var x = c.getContext('2d'); x.drawImage(atlasImg.wild, rect[0], rect[1], rect[2], rect[3], 0, 0, rect[2], rect[3]);
    var id = x.getImageData(0, 0, c.width, c.height), d = id.data;
    for (var i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 10) continue;
      var q = rgb2hsl(d[i], d[i + 1], d[i + 2]), hue = fn(q, (i / 4) % c.width < c.width / 2);
      if (hue === null) continue;
      var E = FB.ELEMENTS[hue], rgb = hsl2rgb(E.hue, Math.min(1, q[1] * 1.1), Math.min(0.95, q[2] + (E.light || 0)));
      d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2];
    }
    x.putImageData(id, 0, 0);
    var t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
    return (npcTexCache[key] = t);
  }
  function npcRecolor(F, f) {
    var pr = F.partMats.res, ph = F.partMats.head;
    if (pr) { pr.map = npcPartTex('res', pr.userData.rect, function (q) { return q[1] > 0.6 && q[2] > 0.35 && (q[0] < 50 || q[0] > 340) ? f.res : null; }, 'res:' + f.res); pr.needsUpdate = true; }
    // глаза: яркие жёлто-оранжевые пиксели; левая половина головы — первый элемент, правая — второй (зрачки — вертикальные, из арта)
    if (ph) { ph.map = npcPartTex('head', ph.userData.rect, function (q, left) { return q[1] > 0.7 && q[2] > 0.42 && q[0] > 12 && q[0] < 62 ? (left ? f.eyes[0] : f.eyes[1]) : null; }, 'head:' + f.eyes.join('+')); ph.needsUpdate = true; }
  }
  // Резервуар на укороченной колонне: стекло, латунные кольца, жидкость цвета резервуара NPC
  var tank = null;
  function buildTank() {
    var C = AR.column, cx = (C.x0 + C.x1) / 2, cy = (C.y0 + C.y1) / 2, rad = Math.min(C.x1 - C.x0, C.y1 - C.y0) * 0.38, base = T.colLowH * T.visH, Ht = 170;
    var g = new THREE.Group(); g.position.set(cx, base, cy);
    var glass = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, Ht, 40, 1, true), new THREE.MeshPhongMaterial({ color: 0xbfeeff, transparent: true, opacity: 0.25, shininess: 120, specular: 0xffffff, side: THREE.DoubleSide, depthWrite: false }));
    glass.position.y = Ht / 2; glass.renderOrder = 5; g.add(glass);
    var liquid = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.94, rad * 0.94, Ht * 0.7, 40), new THREE.MeshBasicMaterial({ color: 0xff5a00, transparent: true, opacity: 0.3, depthWrite: false }));
    liquid.position.y = Ht * 0.35; liquid.renderOrder = 4; g.add(liquid);
    var brass = new THREE.MeshLambertMaterial({ color: 0x7a4e1e });
    [6, Ht - 4].forEach(function (y) { var ring = new THREE.Mesh(new THREE.TorusGeometry(rad, 9, 10, 40), brass); ring.rotation.x = Math.PI / 2; ring.position.y = y; ring.castShadow = true; g.add(ring); });
    for (var k = 0; k < 4; k++) { var bar = new THREE.Mesh(new THREE.BoxGeometry(10, Ht, 10), brass); var a = k / 4 * Math.PI * 2 + Math.PI / 4; bar.position.set(Math.cos(a) * rad, Ht / 2, Math.sin(a) * rad); g.add(bar); }
    scene.add(g);
    tank = { g: g, liquid: liquid, glass: glass, rad: rad, Ht: Ht, cracks: [], shake: 0, broken: false };
  }
  function crackTex() { return canvasTex('crack', function (x) { x.strokeStyle = 'rgba(255,255,255,0.95)'; x.lineWidth = 3; for (var j = 0; j < 6; j++) { x.beginPath(); x.moveTo(64, 64); var px = 64, py = 64, a = j / 6 * 6.28 + Math.random() * 0.5; for (var s2 = 0; s2 < 4; s2++) { px += Math.cos(a) * 14; py += Math.sin(a) * 14; a += (Math.random() - 0.5) * 0.8; x.lineTo(px, py); } x.stroke(); } }); }
  R.npcStruggle = function () { // бьётся о стекло: тряска и новые трещины
    if (!tank || tank.broken) return;
    tank.shake = 0.9;
    for (var k = 0; k < 3; k++) {
      var a = Math.random() * Math.PI * 2, sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: crackTex(), transparent: true, depthWrite: false, opacity: 0.9 }));
      sp.position.set(Math.cos(a) * tank.rad * 0.98, 30 + Math.random() * (tank.Ht - 60), Math.sin(a) * tank.rad * 0.98); sp.scale.set(60, 60, 1);
      tank.g.add(sp); tank.cracks.push(sp);
    }
  };
  R.npcRelease = function (color) { // стекло разлетается, жидкость выплёскивается
    if (!tank || tank.broken) return;
    tank.broken = true; tank.g.visible = false;
    var p = tank.g.position;
    for (var i = 0; i < 34; i++) {
      var a = Math.random() * 6.28, sp = 160 + Math.random() * 260, sh = sprite(shardTex(), i % 3 ? 0xd8f6ff : 0x9fe8ff);
      sh.material.rotation = a; particle(sh, p.x + Math.cos(a) * tank.rad, p.z + Math.sin(a) * tank.rad, p.y + 40 + Math.random() * 100, { life: 1.1, v: { x: Math.cos(a) * sp, y: 120 + Math.random() * 200, z: Math.sin(a) * sp }, drag: 1.2, s0: 30, s1: 16 });
    }
    R.burst(p.x, p.z, color, 30, p.y + 60);
    R.flash(p.x, p.z, 220, '#ffffff'); R.shake(16);
  };
  function syncTank(s, t, dt) {
    if (!tank) return;
    var n = s.frogs[s.npcId];
    if (!n) { tank.g.visible = false; return; }
    if (!n.caged && !tank.broken) { tank.broken = true; tank.g.visible = false; } // загрузка в середине матча
    if (n.caged && tank.broken) { tank.broken = false; tank.g.visible = true; tank.cracks.forEach(function (c) { tank.g.remove(c); }); tank.cracks = []; } // новый матч
    if (tank.broken) return;
    tank.liquid.material.color.set(FB.ELEMENTS[n.res].color);
    tank.liquid.position.y = tank.Ht * 0.35 + Math.sin(t * 2) * 3;
    tank.shake = Math.max(0, tank.shake - dt);
    var C = AR.column, j = tank.shake > 0 ? (Math.random() - 0.5) * 12 * tank.shake : 0;
    tank.g.position.x = (C.x0 + C.x1) / 2 + j; tank.g.position.z = (C.y0 + C.y1) / 2 + (tank.shake > 0 ? (Math.random() - 0.5) * 12 * tank.shake : 0);
  }
  R.resetTank = function () { if (!tank) return; tank.broken = false; tank.g.visible = true; tank.cracks.forEach(function (c) { tank.g.remove(c); }); tank.cracks = []; };
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
        if (f.obj.position.y <= 2) { if (Math.random() < 0.55) R.splat(f.obj.position.x, f.obj.position.z, f.color, f.sz * 1.9, 14); scene.remove(f.obj); f.obj.material.dispose(); return false; }
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
      syncTank(s, tAll, dt);
      s.frogs.forEach(function (f) { var d = app.disp[f.id]; if (d) syncFrog(f, d, dt, tAll, d.hidden); });
    }
    stepFx(dt * R.fxScale); stepDecals(dt * R.fxScale); // fxScale — замедление эффектов для отладки
    (R.aimLabels || []).forEach(function (l) { var p = toScreen(l.x, l.h, l.y); l.el.style.transform = 'translate(' + (p.x | 0) + 'px,' + (p.y | 0) + 'px)'; });
    renderer.render(scene, camera);
  };
})();
