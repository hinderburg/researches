// Renderer additions for V4 "Overlord" (iteration3, D-085): the gothic castle with a tower per minion type, the
// Overlord with his retinue in sectors (a type per sector, figures ∝ numbers, a plaque with emblem and count), squads on
// sorties / on the way back / waiting, upgrade points, and the animations of the new events. The camera, tiles, fills,
// walls and generic effects come from render.js.
window.HB = window.HB || {};
(function () {
  const P = HB.Renderer.prototype, hex = HB.hex, CFG = HB.CONFIG, COL = CFG.COLORS, TYPES = HB.cards.MINION_TYPES, R = HB.rules;
  const easeOut = k => 1 - Math.pow(1 - k, 3);
  const easeOutBack = u => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); };
  const V4_EVENTS = new Set(['sortie', 'squadMove', 'fight', 'shoot', 'join', 'muster', 'heal', 'heroDown', 'poi', 'buff']);
  P.isV4 = function () { return !!(this.s && this.s.variant === 'overlord'); };
  P.v4Handles = function (ev) { return this.isV4() && V4_EVENTS.has(ev.type); };

  // ---------------------------------------------------------------- view model
  // While an action animates, the board shows counts as they were before it and changes them when each blow lands.
  P.snapshotView = function (s) {
    const v = { ret: {}, hp: {}, squads: {} };
    for (const pid of [1, 2]) {
      const p = s.players[pid]; v.ret[pid] = {};
      for (const t of p.types) v.ret[pid][t] = p.retinue[t].n;
      v.hp[pid] = p.warband.hp;
    }
    for (const q of s.squads) v.squads[q.id] = { id: q.id, owner: q.owner, type: q.type, n: q.n, col: q.col, row: q.row, state: q.state };
    return v;
  };
  P.retShown = function (pid, t) { const v = this.view; if (v && v.ret[pid] && v.ret[pid][t] != null) return v.ret[pid][t]; const r = this.s.players[pid].retinue[t]; return r ? r.n : 0; };
  P.hpShown = function (pid) { const v = this.view; return v && v.hp[pid] != null ? v.hp[pid] : this.s.players[pid].warband.hp; };
  P.squadsShown = function () {
    if (this.view) return Object.values(this.view.squads);
    return this.s.squads.map(q => ({ id: q.id, owner: q.owner, type: q.type, n: q.n, col: q.col, row: q.row, state: q.state }));
  };

  // ---------------------------------------------------------------- events
  P.applyV4 = function (ev, t) {
    const S = this.size, v = this.view;
    const light = ev.player ? COL[ev.player + 'Light'] : '#fff';
    switch (ev.type) {
      case 'sortie': {
        this.schedule(t, () => {
          if (!this.view) return;
          this.view.ret[ev.player][ev.sqType] = 0;
          this.view.squads[ev.id] = { id: ev.id, owner: ev.player, type: ev.sqType, n: ev.n, col: ev.col, row: ev.row, state: 'out' };
          const p = this.cellXY(ev.col, ev.row);
          this.fx.push({ type: 'ring', x: p.x, y: p.y, color: TYPES[ev.sqType].color, t0: performance.now(), dur: 420, big: false });
        });
        return t + 60;
      }
      case 'squadMove': {
        const per = ev.back ? 150 : 175, path = ev.path.slice();
        this.schedule(t, () => {
          const sq = this.view && this.view.squads[ev.id];
          const from = sq ? { col: sq.col, row: sq.row } : path[0];
          this.squadAnim[ev.id] = { pts: [from].concat(path), t0: performance.now(), per };
          if (sq) { const e = path[path.length - 1]; sq.col = e.col; sq.row = e.row; if (!ev.back) sq.state = 'out'; else sq.state = 'return'; }
          const e = path[path.length - 1]; this.ensureVisible(e.col, e.row);
        });
        return t + per * path.length;
      }
      case 'fight': {
        const A = ev.attacker, D = ev.defender, run = 230, hit = t + run, fromXY = this.cellXY(ev.from.col, ev.from.row), atXY = this.cellXY(ev.at.col, ev.at.row);
        this.schedule(t, () => {
          this.ensureVisible(ev.at.col, ev.at.row);
          if (ev.a.before.kind === 'hero') this.slide[A] = { path: [ev.at], t0: performance.now(), per: run, start: fromXY, hold: true };
          else this.squadBump[ev.a.before.id] = { to: ev.at, t0: performance.now(), dur: run * 2 + 500 };
        });
        this.schedule(hit, () => {
          this.spawnFight(atXY.x, atXY.y);
          if (ev.a.before.kind === 'hero') this.shake[A] = performance.now();
          if (ev.d.before.kind === 'hero') this.shake[D] = performance.now();
          this.applySide(ev.a, atXY, -1); this.applySide(ev.d, atXY, 1);
          // each side's strike in its colour, on its side of the fight
          const a = { t: String(ev.dmgToDef), color: COL[A + 'Light'] }, d = { t: String(ev.dmgToAtt), color: COL[D + 'Light'] }, mid = { t: ' ⚔ ', color: '#fff' };
          this.addText(ev.at.col, ev.at.row, '', null, { dy: -S * 1.9, big: true, dur: 1500, pop: true, parts: fromXY.x <= atXY.x ? [a, mid, d] : [d, mid, a] });
        });
        this.schedule(hit + 650, () => { if (ev.a.before.kind === 'hero') this.slide[A] = { path: [ev.from], t0: performance.now(), per: run, start: atXY, hold: true }; });
        return hit + 650 + run + 60;
      }
      case 'shoot': {
        const flight = 280;
        this.schedule(t, () => {
          this.ensureVisible(ev.at.col, ev.at.row);
          for (let i = 0; i < 3; i++) this.schedule(i * 60, () => { const a = this.cellXY(ev.from.col, ev.from.row), b = this.cellXY(ev.at.col, ev.at.row); this.fx.push({ type: 'bolt', x0: a.x + (i - 1) * S * 0.15, y0: a.y - S * 0.2, x1: b.x + (i - 1) * S * 0.2, y1: b.y, t0: performance.now(), dur: flight }); });
        });
        this.schedule(t + flight + 120, () => {
          const at = this.cellXY(ev.at.col, ev.at.row);
          if (ev.d.before.kind === 'hero') this.shake[ev.defender] = performance.now();
          this.applySide(ev.d, at, 1);
          this.addText(ev.at.col, ev.at.row, `−${ev.dmg}`, '#ffd45a', { dy: -S * 1.9, big: true, dur: 1300, pop: true });
        });
        return t + flight + 520;
      }
      case 'join': {
        const dur = ev.how === 'recall' ? 380 : 260;
        this.schedule(t, () => {
          const sq = this.view && this.view.squads[ev.id], w = this.s.players[ev.player].warband;
          if (sq) this.squadAnim[ev.id] = { pts: [{ col: sq.col, row: sq.row }, { col: w.col, row: w.row }], t0: performance.now(), per: dur };
          this.schedule(dur, () => {
            if (!this.view) return;
            delete this.view.squads[ev.id]; delete this.squadAnim[ev.id];
            this.view.ret[ev.player][ev.sqType] = (this.view.ret[ev.player][ev.sqType] || 0) + ev.n;
            this.bump[ev.player] = performance.now();
          });
        });
        return t + (ev.how === 'recall' ? 70 : dur);
      }
      case 'muster': {
        const c0 = this.cellXY(ev.from.col, ev.from.row), road = [c0].concat(ev.road.map(c => this.cellXY(c.col, c.row)));
        const per = 110, dur = Math.max(400, per * (road.length - 1) + 250), m = Math.min(6, Math.max(2, Math.ceil(ev.n / 2)));
        this.schedule(t, () => {
          const now = performance.now();
          for (let i = 0; i < m; i++) this.fx.push({ type: 'march', pid: ev.player, mtype: ev.sqType, pts: road, t0: now + i * 70, dur, seed: i });
          this.towerPulse[ev.player + ':' + ev.sqType] = now;
        });
        this.schedule(t + dur + m * 70, () => {
          if (!this.view) return;
          if (ev.join) { this.view.ret[ev.player][ev.sqType] = (this.view.ret[ev.player][ev.sqType] || 0) + ev.n; this.bump[ev.player] = performance.now(); }
          else {
            const q = this.view.squads[ev.id];
            if (q) q.n += ev.n; else this.view.squads[ev.id] = { id: ev.id, owner: ev.player, type: ev.sqType, n: ev.n, col: ev.to.col, row: ev.to.row, state: 'wait' };
          }
        });
        return t + Math.min(900, dur);
      }
      case 'heal': {
        this.schedule(t, () => {
          const w = this.s.players[ev.player].warband, xy = this.cellXY(w.col, w.row);
          this.fx.push({ type: 'ring', x: xy.x, y: xy.y, color: '#9cff8a', t0: performance.now(), dur: 520, big: true });
          if (ev.hero) this.addText(w.col, w.row, `+${ev.hero} ❤`, '#9cff8a', { dy: -S * 2.1, big: true, dur: 1300 });
          if (this.view) this.view.hp[ev.player] = ev.hp;
        });
        return t + 380;
      }
      case 'heroDown': {
        this.schedule(t, () => {
          const xy = this.cellXY(ev.col, ev.row), now = performance.now();
          this.heroFall[ev.player] = now;
          for (let i = 0; i < 4; i++) this.schedule(i * 160, () => this.spawnFight(xy.x + (Math.random() - 0.5) * S, xy.y + (Math.random() - 0.5) * S * 0.6));
          this.spawnFlee(ev.player, xy.x, xy.y, 10, true);
          this.bigText = { text: 'THE OVERLORD HAS FALLEN!', color: COL[(3 - ev.player) + 'Light'], t0: now, dur: 2600 };
          if (this.view) this.view.hp[ev.player] = 0;
        });
        return t + 1100;
      }
      case 'poi': {
        this.schedule(t, () => {
          this.flashCell(ev.col, ev.row, '#ffe27a', 800);
          const txt = ev.kind === 'citadel' ? 'CITADEL TAKEN!' : `${ev.title.toUpperCase()}: ${TYPES[ev.kind].title.toUpperCase()} +1`;
          this.addText(ev.col, ev.row, txt, ev.kind === 'citadel' ? '#ffe27a' : TYPES[ev.kind].color, { dy: -S * 1.9, dur: 1600, big: true });
        });
        return t + 250;
      }
      case 'buff': {
        this.schedule(t, () => {
          const xy = this.cellXY(ev.col, ev.row);
          this.fx.push({ type: 'ring', x: xy.x, y: xy.y, color: '#ffb347', t0: performance.now(), dur: 600, big: true });
          this.addText(ev.col, ev.row, `WAR CRY +${ev.value}`, '#ffb347', { dy: -S * 2.1, big: true, dur: 1400 });
          this.warCryPulse[ev.player] = performance.now();
        });
        return t + 420;
      }
    }
    return t;
  };
  // after a blow: update the shown counts, the figures that are gone run off, the losses float up
  P.applySide = function (side, atXY, dir) {
    if (!this.view) return;
    const S = this.size, b = side.before, a = side.after;
    const lost = Object.values(side.losses || {}).reduce((x, y) => x + y, 0);
    if (b.kind === 'hero') {
      this.view.ret[b.pid] = Object.assign({}, a.ret); this.view.hp[b.pid] = a.hp;
      const w = this.s.players[b.pid].warband, xy = this.cellXY(w.col, w.row);
      if (lost) this.spawnFlee(b.pid, xy.x, xy.y, Math.min(8, lost), false);
      const txt = (lost ? `−${lost}` : '') + (side.heroDmg ? `${lost ? ' ' : ''}−${side.heroDmg}❤` : '');
      if (txt) this.addText(w.col, w.row, txt, side.heroDmg ? '#ff6b6b' : COL[b.pid + 'Light'], { dx: dir * S * 0.6, dy: -S * 0.7, big: true, dur: 1500 });
    } else {
      const q = this.view.squads[b.id];
      if (q) {
        q.n = a.n;
        const xy = this.cellXY(q.col, q.row);
        if (lost) { this.spawnFlee(b.pid, xy.x, xy.y, Math.min(8, lost), a.n <= 0); this.addText(q.col, q.row, `−${lost}`, COL[b.pid + 'Light'], { dx: dir * S * 0.6, dy: -S * 0.7, big: true, dur: 1500 }); }
        if (a.n <= 0) { delete this.view.squads[b.id]; delete this.squadAnim[b.id]; }
      }
    }
  };

  // ---------------------------------------------------------------- intro
  // castles rise, the start zones flip, then the retinue runs out of the tower pits to the Overlord
  P.playIntroV4 = function () {
    const s = this.s; let t = 0, end = 0;
    for (const k in s.cells) if (s.cells[k].owner && !s.cells[k].castle) this.reveal[k] = 0;
    this.view = this.snapshotView(s);
    for (const pid of [1, 2]) for (const tt of s.players[pid].types) this.view.ret[pid][tt] = 0;
    for (const pid of [1, 2]) {
      const p = s.players[pid], c = s.castles[pid], w = p.warband, t0 = t; t += 700;
      this.castleRise[pid] = Infinity; this.hideWb[pid] = true;
      this.schedule(t0, () => { this.castleRise[pid] = performance.now(); const xy = this.cellXY(c.col, c.row); this.spawnDust(xy.x, xy.y, 9); });
      const cells = Object.values(s.cells).filter(q => q.owner === pid && !q.castle).map(q => ({ c: q, d: hex.distance(q, c) })).sort((a, b) => a.d - b.d);
      cells.forEach(({ c: q }, i) => this.schedule(t0 + 650 + i * 70, () => this.flipCell(q.col, q.row, 0, pid)));
      const heroAt = t0 + 650 + cells.length * 70 + 150;
      this.schedule(heroAt, () => { this.hideWb[pid] = false; this.heroRise[pid] = performance.now(); const xy = this.cellXY(w.col, w.row); this.spawnDust(xy.x, xy.y, 7); });
      p.types.forEach((tt, i) => {
        const at = heroAt + 350 + i * 260;
        this.schedule(at, () => {
          const now = performance.now(), road = [this.cellXY(c.col, c.row), this.cellXY(w.col, w.row)];
          for (let j = 0; j < Math.min(6, Math.ceil(p.comp[tt] / 2)); j++) this.fx.push({ type: 'march', pid, mtype: tt, pts: road, t0: now + j * 60, dur: 420, seed: j });
          this.towerPulse[pid + ':' + tt] = now;
          this.schedule(560, () => { if (this.view) this.view.ret[pid][tt] = p.comp[tt]; this.bump[pid] = performance.now(); });
        });
        end = Math.max(end, at + 900);
      });
    }
    this.schedule(end, () => { this.view = null; });
    return end + 100;
  };

  // ---------------------------------------------------------------- drawing
  P.drawV4 = function (ctx, now) {
    const s = this.s;
    for (const q of s.pois) this.drawPoint(ctx, q, now);
    for (const pid of [1, 2]) this.drawGothicCastle(ctx, pid, now);
    this.drawSquads(ctx, now);
    const order = [1, 2].sort((a, b) => s.players[a].warband.row - s.players[b].warband.row);
    for (const pid of order) this.drawOverlord(ctx, s.players[pid], now);
    this.drawForecastV4(ctx, now);
  };

  // one minion figure: the body in the team colour, the type told by its silhouette and a type-coloured detail
  P.drawMinion = function (ctx, x, y, r, pid, type, now, seed) {
    const color = COL[pid], light = COL[pid + 'Light'], dark = COL[pid + 'Dark'], tc = TYPES[type].color;
    const bob = Math.sin(now / 240 + seed * 1.7) * r * 0.12;
    y += bob;
    const big = type === 'brute' ? 1.45 : type === 'runner' ? 0.85 : 1;
    const rr = r * big;
    ctx.lineWidth = 1.2; ctx.strokeStyle = dark;
    if (type === 'brawler') { ctx.strokeStyle = '#4a3218'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x + rr * 0.9, y); ctx.lineTo(x + rr * 1.3, y - rr * 2.5); ctx.stroke(); ctx.fillStyle = '#d8dbe3'; ctx.beginPath(); ctx.moveTo(x + rr * 1.33, y - rr * 2.9); ctx.lineTo(x + rr * 1.12, y - rr * 2.4); ctx.lineTo(x + rr * 1.55, y - rr * 2.4); ctx.closePath(); ctx.fill(); }
    if (type === 'archer') { ctx.strokeStyle = '#6b4a22'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x + rr * 0.7, y - rr * 0.6, rr * 1.1, -1.2, 1.2); ctx.stroke(); ctx.strokeStyle = '#e8e2d0'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(x + rr * 0.7 + rr * 1.1 * Math.cos(-1.2), y - rr * 0.6 + rr * 1.1 * Math.sin(-1.2)); ctx.lineTo(x + rr * 0.7 + rr * 1.1 * Math.cos(1.2), y - rr * 0.6 + rr * 1.1 * Math.sin(1.2)); ctx.stroke(); }
    if (type === 'healer') { ctx.strokeStyle = '#6b4a22'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + rr * 0.9, y + rr * 0.6); ctx.lineTo(x + rr * 1.0, y - rr * 2.3); ctx.stroke(); ctx.fillStyle = tc; ctx.globalAlpha = 0.6 + 0.4 * Math.sin(now / 300 + seed); ctx.beginPath(); ctx.arc(x + rr * 1.0, y - rr * 2.5, rr * 0.35, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
    ctx.fillStyle = color; ctx.strokeStyle = dark; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(x, y, rr * 1.05, rr * 0.9, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (type === 'healer') { ctx.fillStyle = '#fff'; ctx.fillRect(x - rr * 0.12, y - rr * 0.55, rr * 0.24, rr * 0.9); ctx.fillRect(x - rr * 0.4, y - rr * 0.22, rr * 0.8, rr * 0.24); }
    if (type === 'brute') { ctx.fillStyle = tc; ctx.fillRect(x - rr * 1.0, y + rr * 0.05, rr * 2.0, rr * 0.28); ctx.fillStyle = light; ctx.beginPath(); ctx.arc(x - rr * 1.1, y - rr * 0.1, rr * 0.38, 0, Math.PI * 2); ctx.arc(x + rr * 1.1, y - rr * 0.1, rr * 0.38, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = light; ctx.beginPath(); ctx.arc(x, y - rr * 1.05, rr * 0.78, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // headgear in the type colour: helmet (brawlers, brutes), headband (runners), hood (archers), cap (healers)
    ctx.fillStyle = type === 'brawler' || type === 'brute' ? dark : tc;
    if (type === 'runner') { ctx.fillRect(x - rr * 0.78, y - rr * 1.3, rr * 1.56, rr * 0.26); }
    else if (type === 'archer') { ctx.beginPath(); ctx.moveTo(x - rr * 0.85, y - rr * 0.9); ctx.quadraticCurveTo(x, y - rr * 2.4, x + rr * 0.85, y - rr * 0.9); ctx.closePath(); ctx.fill(); }
    else { ctx.beginPath(); ctx.arc(x, y - rr * 1.15, rr * 0.82, Math.PI, 0); ctx.closePath(); ctx.fill(); }
    if (type === 'brawler') { ctx.fillStyle = tc; ctx.strokeStyle = dark; ctx.beginPath(); ctx.arc(x - rr * 0.95, y + rr * 0.05, rr * 0.55, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = '#ffe14a'; ctx.beginPath(); ctx.arc(x - rr * 0.28, y - rr * 0.95, rr * 0.14, 0, Math.PI * 2); ctx.arc(x + rr * 0.28, y - rr * 0.95, rr * 0.14, 0, Math.PI * 2); ctx.fill();
  };
  const SLOTS = [[0, 0], [-0.9, 0.15], [0.9, 0.15], [-0.45, -0.75], [0.45, -0.75], [0, 0.95], [-1.35, -0.6], [1.35, -0.6]];
  // a crowd of one type: figures ∝ count (1 per 2, up to 8) round a centre, then its plaque
  P.drawCrowd = function (ctx, pid, type, n, cx, cy, now, plaque, extra) {
    if (n <= 0) return;
    const S = this.size, r = S * 0.12, m = Math.min(8, Math.ceil(n / 2));
    const list = SLOTS.slice(0, m).map((o, i) => ({ x: cx + o[0] * r * 2.1, y: cy + o[1] * r * 1.7, i })).sort((a, b) => a.y - b.y);
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(cx, cy + r * 1.2, r * (1.4 + Math.min(m, 5) * 0.35), r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
    for (const f of list) this.drawMinion(ctx, f.x, f.y, r, pid, type, now, f.i + (extra || 0));
    if (plaque) this.drawTypePlaque(ctx, pid, type, n, cx, cy - r * 3.4, plaque === 'wait');
  };
  // emblem + number; at a distance the plaques carry the information, close up the figures do
  P.drawTypePlaque = function (ctx, pid, type, n, x, y, waiting) {
    const S = this.size, z = this.zoom || 1, sc = z > 1.6 ? 0.85 : 1.1;
    const h = S * 0.36 * sc, fs = Math.round(S * 0.27 * sc);
    ctx.font = `900 ${fs}px system-ui, sans-serif`;
    const txt = (waiting ? '⏳' : '') + String(n), tw = ctx.measureText(txt).width, w = h + tw + S * 0.2 * sc;
    const bx = x - w / 2, by = y - h / 2;
    ctx.fillStyle = 'rgba(20,12,6,0.82)'; ctx.strokeStyle = COL[pid + 'Light']; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(bx, by, w, h, h / 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = TYPES[type].color; ctx.beginPath(); ctx.arc(bx + h / 2, y, h * 0.42, 0, Math.PI * 2); ctx.fill();
    const img = HB.icons.image('t_' + type, '#2a1d0e'), is = h * 0.62;
    if (img.complete && img.naturalWidth) ctx.drawImage(img, bx + h / 2 - is / 2, y - is / 2, is, is);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(txt, bx + h + S * 0.04, y + 1);
  };
  // sectors round the Overlord: the first type in front (towards the enemy), the others behind-left / behind-right —
  // the same order as the towers of the castle, left to right
  P.sectorOffsets = function (pid) {
    const S = this.size, f = pid === 1 ? -1 : 1;
    return [{ x: 0, y: f * S * 0.62 }, { x: -S * 0.72, y: -f * S * 0.18 }, { x: S * 0.72, y: -f * S * 0.18 }];
  };
  P.drawOverlord = function (ctx, p, now) {
    if (this.hideWb[p.id]) return;
    const S = this.size, w = p.warband, pos = this.warbandPos(p, now), pid = p.id;
    let x = pos.x, y = pos.y;
    const sh = now - (this.shake[pid] || 0);
    if (sh < 350) x += Math.sin(sh / 18) * S * 0.1 * (1 - sh / 350);
    const fall = this.heroFall[pid], dead = w.dead && fall == null;
    if (dead) return;
    const fk = fall != null ? Math.min(1, (now - fall) / 900) : 0;
    const rise = this.heroRise[pid] != null ? Math.min(1, (now - this.heroRise[pid]) / 450) : 1;
    // the retinue, sector by sector (behind the Overlord first)
    const offs = this.sectorOffsets(pid);
    const idx = p.types.map((t, i) => ({ t, i, o: offs[i] })).sort((a, b) => a.o.y - b.o.y);
    for (const e of idx) if (e.o.y <= 0) this.drawCrowd(ctx, pid, e.t, this.retShown(pid, e.t), x + e.o.x, y + e.o.y, now, true, e.i * 3);
    // the Overlord: a big figure with a cape and a horned helm
    ctx.save();
    if (fk > 0) { ctx.globalAlpha = 1 - fk; ctx.translate(x, y); ctx.rotate(fk * 1.2); ctx.translate(-x, -y); }
    if (rise < 1) { ctx.globalAlpha *= rise; y -= (1 - easeOutBack(rise)) * S * 0.6; }
    const color = COL[pid], light = COL[pid + 'Light'], dark = COL[pid + 'Dark'], r = S * 0.26;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x, y + r * 1.1, r * 1.4, r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(x - r * 1.1, y + r * 0.9); ctx.quadraticCurveTo(x, y - r * 1.4, x + r * 1.1, y + r * 0.9); ctx.closePath(); ctx.fill(); // cape
    ctx.fillStyle = color; ctx.strokeStyle = dark; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(x, y, r * 0.95, r * 1.0, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e9d7b4'; ctx.beginPath(); ctx.arc(x, y - r * 1.15, r * 0.62, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2d2a33'; ctx.beginPath(); ctx.arc(x, y - r * 1.25, r * 0.66, Math.PI, 0); ctx.closePath(); ctx.fill(); // helm
    ctx.strokeStyle = '#efe6d2'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(x - r * 0.55, y - r * 1.45); ctx.quadraticCurveTo(x - r * 1.0, y - r * 1.9, x - r * 0.75, y - r * 2.3); ctx.moveTo(x + r * 0.55, y - r * 1.45); ctx.quadraticCurveTo(x + r * 1.0, y - r * 1.9, x + r * 0.75, y - r * 2.3); ctx.stroke(); // horns
    ctx.fillStyle = '#ff5a3c'; ctx.beginPath(); ctx.arc(x - r * 0.22, y - r * 1.1, r * 0.1, 0, Math.PI * 2); ctx.arc(x + r * 0.22, y - r * 1.1, r * 0.1, 0, Math.PI * 2); ctx.fill(); // eyes
    ctx.strokeStyle = '#3b2a14'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x + r * 1.05, y + r * 0.9); ctx.lineTo(x + r * 1.2, y - r * 2.1); ctx.stroke(); // staff
    ctx.fillStyle = light; ctx.beginPath(); ctx.arc(x + r * 1.2, y - r * 2.25, r * 0.28, 0, Math.PI * 2); ctx.fill();
    const wc = now - (this.warCryPulse[pid] || -1e9);
    if (R.active(this.s, p.status.warCryUntil) || wc < 600) { ctx.strokeStyle = `rgba(255,179,71,${0.55 + 0.35 * Math.sin(now / 200)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x, y, r * 1.8, r * 1.5, 0, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
    // sectors below the Overlord are nearer to the viewer: drawn after him
    for (const e of idx) if (e.o.y > 0) this.drawCrowd(ctx, pid, e.t, this.retShown(pid, e.t), x + e.o.x, y + e.o.y, now, true, e.i * 3);
    if (fk > 0) return;
    // banner with the Overlord's HP and the shield of his retinue
    const bumpK = (now - (this.bump[pid] || -1e9)) / 380, bsc = bumpK >= 0 && bumpK < 1 ? 1 + 0.25 * Math.sin(bumpK * Math.PI) : 1;
    const px = x + S * 0.3, top = y - S * 2.05; // the pole stands to the right, above the front sector
    ctx.strokeStyle = '#3b2a14'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(px, y - S * 0.35); ctx.lineTo(px, top); ctx.stroke();
    const hp = this.hpShown(pid), txt = `❤ ${hp}`, fs = Math.round(S * 0.36);
    ctx.font = `900 ${fs}px system-ui, sans-serif`;
    const fw = Math.max(S * 0.95, ctx.measureText(txt).width + S * 0.45), fh = S * 0.5;
    ctx.save(); ctx.translate(px, top + fh / 2); ctx.scale(bsc, bsc); ctx.translate(-px, -(top + fh / 2));
    ctx.fillStyle = color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px, top); ctx.lineTo(px + fw, top + fh * 0.08); ctx.lineTo(px + fw - S * 0.12, top + fh * 0.54); ctx.lineTo(px + fw, top + fh); ctx.lineTo(px, top + fh + fh * 0.08); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, px + fw / 2 - S * 0.04, top + fh * 0.54);
    ctx.restore();
    // shield: the retinue's HP; it flashes red when the enemy could break through it next turn
    const th = this.s.phase === 'play' ? R.heroThreat(this.s, pid) : null;
    const shield = th ? th.shield : 0, danger = th && th.threat > th.shield;
    const st = `🛡 ${shield}`, ss = Math.round(S * 0.26); ctx.font = `900 ${ss}px system-ui, sans-serif`;
    const sw = ctx.measureText(st).width + S * 0.3, sh2 = S * 0.34, sx = px + S * 0.05, sy = top + fh + S * 0.12;
    const pulse = 0.5 + 0.5 * Math.sin(now / 150);
    ctx.fillStyle = danger ? `rgba(120,20,10,${0.75 + 0.2 * pulse})` : 'rgba(20,12,6,0.8)'; ctx.strokeStyle = danger ? '#ff6b5a' : COL[pid + 'Light']; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(sx, sy, sw, sh2, sh2 / 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(st, sx + S * 0.15, sy + sh2 / 2 + 1);
    if (pid === this.s.current && this.s.phase === 'play') {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.ellipse(x, y, S * 1.25, S * 1.0, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
  };
  P.squadPos = function (q, now) {
    const a = this.squadAnim[q.id];
    let p = this.cellXY(q.col, q.row), hop = 0;
    if (a) {
      const total = a.per * (a.pts.length - 1), k = (now - a.t0) / Math.max(1, total);
      if (k >= 1) delete this.squadAnim[q.id];
      else if (k >= 0 && a.pts.length > 1) {
        const f = k * (a.pts.length - 1), i = Math.min(a.pts.length - 2, Math.floor(f)), u = f - i;
        const A = this.cellXY(a.pts[i].col, a.pts[i].row), B = this.cellXY(a.pts[i + 1].col, a.pts[i + 1].row);
        p = { x: A.x + (B.x - A.x) * u, y: A.y + (B.y - A.y) * u }; hop = Math.abs(Math.sin(u * Math.PI)) * this.size * 0.12;
      } else if (k < 0) p = this.cellXY(a.pts[0].col, a.pts[0].row);
    }
    const b = this.squadBump[q.id];
    if (b) {
      const k = (now - b.t0) / b.dur;
      if (k >= 1) delete this.squadBump[q.id];
      else if (k >= 0) { const T = this.cellXY(b.to.col, b.to.row), u = k < 0.3 ? k / 0.3 : k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3; p = { x: p.x + (T.x - p.x) * 0.55 * u, y: p.y + (T.y - p.y) * 0.55 * u }; }
    }
    return { x: p.x, y: p.y - hop };
  };
  P.drawSquads = function (ctx, now) {
    const S = this.size;
    const list = this.squadsShown().sort((a, b) => a.row - b.row);
    // two groups of one player on one hex are drawn side by side
    const seen = {};
    for (const q of list) {
      const k = q.col + ',' + q.row, slot = seen[k] = (seen[k] || 0) + 1;
      let pos = this.squadPos(q, now);
      if (slot > 1) pos = { x: pos.x + (slot % 2 ? -1 : 1) * S * 0.45, y: pos.y + S * 0.2 };
      if (q.state === 'return' && !this.squadAnim[q.id]) { // dotted line back to the Overlord
        const w = this.s.players[q.owner].warband, h = this.warbandPos(this.s.players[q.owner], now);
        if (!w.dead) { ctx.strokeStyle = COL[q.owner + 'Light']; ctx.globalAlpha = 0.6; ctx.lineWidth = 2; ctx.setLineDash([4, 5]); ctx.beginPath(); ctx.moveTo(pos.x, pos.y); ctx.lineTo(h.x, h.y); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; }
      }
      this.drawCrowd(ctx, q.owner, q.type, q.n, pos.x, pos.y, now, q.state === 'wait' ? 'wait' : true, q.id);
    }
  };
  // the gothic castle: dark stone, lancet windows, three towers with spires — a tower per minion type, left to right in
  // the order of the retinue sectors, with the type's colour on its spire and banner; a pit pulses when minions leave it
  P.drawGothicCastle = function (ctx, pid, now) {
    const s = this.s, c = s.castles && s.castles[pid]; if (!c) return;
    const S = this.size, p = this.cellXY(c.col, c.row), types = s.players[pid].types;
    let vis = 1; const r0 = this.castleRise[pid];
    if (r0 !== undefined) { if (now < r0) return; const k = (now - r0) / 900; if (k >= 1) delete this.castleRise[pid]; else vis = easeOut(k); }
    const x = p.x, base = p.y + S * 0.45, H = S * 1.9, off = (1 - vis) * H;
    const stone = '#6f6a72', stoneDark = '#3e3a44', stoneLight = '#8d8894', team = COL[pid], teamDark = COL[pid + 'Dark'];
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x, base + S * 0.04, S * 1.0, S * 0.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.rect(x - S * 1.5, base - H - S * 1.6, S * 3, H + S * 1.6 + S * 0.02); ctx.clip(); ctx.translate(0, off);
    ctx.lineJoin = 'round'; ctx.lineWidth = 1.4;
    const box = (x0, y0, w, h, f) => { ctx.fillStyle = f || stone; ctx.strokeStyle = stoneDark; ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.fill(); ctx.stroke(); };
    const lancet = (cx, y0, w, h, glow) => { ctx.fillStyle = glow ? `rgba(255,200,90,${0.55 + 0.25 * Math.sin(now / 400 + cx)})` : '#1d1a22'; ctx.beginPath(); ctx.moveTo(cx - w / 2, y0 + h); ctx.lineTo(cx - w / 2, y0 + h * 0.35); ctx.quadraticCurveTo(cx - w / 2, y0, cx, y0 - h * 0.12); ctx.quadraticCurveTo(cx + w / 2, y0, cx + w / 2, y0 + h * 0.35); ctx.lineTo(cx + w / 2, y0 + h); ctx.closePath(); ctx.fill(); };
    // curtain wall with a gate and buttresses
    box(x - S * 0.85, base - S * 0.55, S * 1.7, S * 0.55);
    for (const bx of [-0.62, 0.62]) { ctx.fillStyle = stoneDark; ctx.beginPath(); ctx.moveTo(x + bx * S - S * 0.07, base); ctx.lineTo(x + bx * S - S * 0.03, base - S * 0.55); ctx.lineTo(x + bx * S + S * 0.03, base - S * 0.55); ctx.lineTo(x + bx * S + S * 0.07, base); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = '#17141b'; ctx.beginPath(); ctx.moveTo(x - S * 0.15, base); ctx.lineTo(x - S * 0.15, base - S * 0.25); ctx.quadraticCurveTo(x - S * 0.15, base - S * 0.42, x, base - S * 0.47); ctx.quadraticCurveTo(x + S * 0.15, base - S * 0.42, x + S * 0.15, base - S * 0.25); ctx.lineTo(x + S * 0.15, base); ctx.closePath(); ctx.fill();
    // three towers: side ones shorter, the middle one tallest
    const towers = [{ dx: -0.62, h: 1.15, w: 0.34 }, { dx: 0, h: 1.45, w: 0.4 }, { dx: 0.62, h: 1.15, w: 0.34 }];
    // tower i holds the pit of type i (first type = middle tower, second = left, third = right: front sector ↔ middle)
    const towerType = [types[1], types[0], types[2]];
    towers.forEach((tw, i) => {
      const tx = x + tw.dx * S, th = tw.h * S, ww = tw.w * S, t = towerType[i], tc = t ? TYPES[t].color : stoneLight;
      const pulse = t ? (now - (this.towerPulse[pid + ':' + t] || -1e9)) / 600 : 2;
      box(tx - ww / 2, base - th, ww, th, i === 1 ? stoneLight : stone);
      lancet(tx, base - th + S * 0.22, ww * 0.34, S * 0.3, pulse >= 0 && pulse < 1);
      lancet(tx, base - th + S * 0.62, ww * 0.3, S * 0.22, false);
      // spire in the type colour, trimmed in the team colour
      ctx.fillStyle = tc; ctx.strokeStyle = teamDark; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(tx - ww * 0.62, base - th); ctx.lineTo(tx, base - th - S * (i === 1 ? 0.95 : 0.75)); ctx.lineTo(tx + ww * 0.62, base - th); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = team; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(tx - ww * 0.62, base - th); ctx.lineTo(tx + ww * 0.62, base - th); ctx.stroke();
      // banner with the type emblem
      if (t) {
        const by = base - th + S * 0.02, bw = ww * 0.8, bh = S * 0.42, wave = Math.sin(now / 280 + i) * S * 0.02;
        ctx.fillStyle = team; ctx.strokeStyle = teamDark; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(tx - bw / 2, by); ctx.lineTo(tx + bw / 2, by); ctx.lineTo(tx + bw / 2 + wave, by + bh); ctx.lineTo(tx, by + bh * 0.8); ctx.lineTo(tx - bw / 2 + wave, by + bh); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = tc; ctx.beginPath(); ctx.arc(tx, by + bh * 0.42, bw * 0.3, 0, Math.PI * 2); ctx.fill();
        const img = HB.icons.image('t_' + t, '#2a1d0e'), is = bw * 0.46;
        if (img.complete && img.naturalWidth) ctx.drawImage(img, tx - is / 2, by + bh * 0.42 - is / 2, is, is);
        if (pulse >= 0 && pulse < 1) { ctx.strokeStyle = `rgba(255,230,140,${1 - pulse})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(tx, base - th * 0.5, ww * (0.6 + pulse), 0, Math.PI * 2); ctx.stroke(); }
      }
    });
    ctx.restore();
    ctx.fillStyle = '#4c3f33'; ctx.beginPath(); ctx.ellipse(x, base + S * 0.01, S * 0.95, S * 0.08, 0, 0, Math.PI); ctx.fill();
  };
  // upgrade points: a landmark per kind and a floating tag with the type emblem ("+1") or the Citadel's crown
  const LANDMARK = { brawler: 'workshop', runner: 'scout_camp', archer: 'watchtower', brute: 'mine', healer: 'shrine', citadel: 'citadel' };
  P.drawPoint = function (ctx, q, now) {
    const S = this.size, p = this.cellXY(q.col, q.row), owner = q.owner;
    this.drawLandmark(ctx, LANDMARK[q.kind] || 'village', p.x, p.y, S, owner);
    const bob = Math.sin(now / 520 + q.id) * S * 0.04, cy = p.y - S * 1.35 + bob, r = S * 0.34;
    const citadel = q.kind === 'citadel', fill = citadel ? '#d9a516' : TYPES[q.kind].color;
    if (owner) { ctx.shadowColor = COL[owner + 'Light']; ctx.shadowBlur = S * 0.35; }
    ctx.fillStyle = fill; ctx.strokeStyle = owner ? COL[owner] : '#3a2a12'; ctx.lineWidth = owner ? 3 : 2;
    ctx.beginPath(); ctx.arc(p.x, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
    if (citadel) { ctx.fillStyle = '#fff'; ctx.font = `900 ${Math.round(S * 0.34)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('❤', p.x, cy + 1); }
    else { const img = HB.icons.image('t_' + q.kind, '#2a1d0e'), is = r * 1.3; if (img.complete && img.naturalWidth) ctx.drawImage(img, p.x - is / 2, cy - is / 2, is, is); }
    ctx.font = `900 ${Math.round(S * 0.22)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,12,6,0.9)';
    const lbl = citadel ? '+5❤ · +1/turn' : '+1 lvl';
    ctx.strokeText(lbl, p.x, cy + r + S * 0.16); ctx.fillStyle = '#fff'; ctx.fillText(lbl, p.x, cy + r + S * 0.16);
  };
  // forecast while aiming: a plaque over the target cell (set by the UI from R.forecastPlay)
  P.drawForecastV4 = function (ctx, now) {
    const f = this.forecast; if (!f || !f.cell || !f.text) return;
    const S = this.size, p = this.cellXY(f.cell.col, f.cell.row), fs = Math.round(S * 0.3);
    ctx.font = `900 ${fs}px system-ui, sans-serif`;
    const w = ctx.measureText(f.text).width + S * 0.4, h = S * 0.44, y = p.y + S * 0.62;
    const pulse = 0.5 + 0.5 * Math.sin(now / 160);
    ctx.fillStyle = 'rgba(20,12,6,0.9)'; ctx.strokeStyle = f.win ? `rgba(255,215,90,${0.6 + 0.4 * pulse})` : f.bad ? '#ff5a3c' : '#ffd766'; ctx.lineWidth = f.win ? 3 : 2;
    ctx.beginPath(); ctx.roundRect(p.x - w / 2, y - h / 2, w, h, h / 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = f.win ? '#ffe27a' : f.bad ? '#ff8a76' : '#ffe9a8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(f.text, p.x, y + 1);
  };
  // a figure running along a polyline (muster along the road, the intro)
  P.drawMarchFx = function (ctx, f, k) {
    const e = k, pts = f.pts, n = pts.length - 1;
    let x, y;
    if (n <= 0) { x = pts[0].x; y = pts[0].y; }
    else { const fpos = e * n, i = Math.min(n - 1, Math.floor(fpos)), u = fpos - i; x = pts[i].x + (pts[i + 1].x - pts[i].x) * u; y = pts[i].y + (pts[i + 1].y - pts[i].y) * u; }
    const S = this.size, jitter = (f.seed % 3 - 1) * S * 0.12;
    ctx.globalAlpha = k > 0.9 ? 1 - (k - 0.9) / 0.1 : 1;
    this.drawMinion(ctx, x + jitter, y + (f.seed % 2 ? S * 0.08 : -S * 0.05) - Math.abs(Math.sin(k * Math.PI * 6 + f.seed)) * S * 0.08, S * 0.11, f.pid, f.mtype, performance.now(), f.seed);
    ctx.globalAlpha = 1;
  };
})();
