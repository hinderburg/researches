// Renderer additions for V4 "Overlord" (iteration3, D-085): the gothic castle with a tower per minion type, the
// Overlord with his retinue in sectors (a type per sector, figures ∝ numbers, a plaque with emblem and count), squads on
// sorties / on the way back / waiting, upgrade points, and the animations of the new events. The camera, tiles, fills,
// walls and generic effects come from render.js.
window.HB = window.HB || {};
(function () {
  const P = HB.Renderer.prototype, hex = HB.hex, CFG = HB.CONFIG, COL = CFG.COLORS, TYPES = HB.cards.MINION_TYPES, R = HB.rules;
  const easeOut = k => 1 - Math.pow(1 - k, 3);
  const easeOutBack = u => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); };
  const V4_EVENTS = new Set(['sortie', 'squadMove', 'fight', 'shoot', 'join', 'muster', 'heal', 'heroDown', 'poi', 'buff', 'hold']);
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
        // D-086: at the start of a turn every group makes its way within the half second of the turn banner
        const path = ev.path.slice(), per = this.quick ? Math.min(ev.back ? 150 : 175, 460 / path.length) : ev.back ? 150 : 175;
        this.lastMovePer = per;
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
        // D-088: the defenders wiped out — the attacker takes their hex; otherwise it falls back to where it struck from
        if (ev.enter && ev.a.before.kind === 'hero') { if (this.prevPos) this.prevPos[A] = { col: ev.at.col, row: ev.at.row }; }
        else if (ev.enter) this.schedule(hit + 400, () => {
          const id = ev.a.before.id, q = this.view && this.view.squads[id]; delete this.squadBump[id];
          if (q) { const from = { col: q.col, row: q.row }; q.col = ev.at.col; q.row = ev.at.row; this.squadAnim[id] = { pts: [from, { col: ev.at.col, row: ev.at.row }], t0: performance.now() - 0.55 * 260, per: 260 }; }
        });
        this.schedule(hit + 650, () => { if (ev.a.before.kind === 'hero' && !ev.enter) this.slide[A] = { path: [ev.from], t0: performance.now(), per: run, start: atXY, hold: true }; });
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
          if (ev.ambush) this.addText(ev.at.col, ev.at.row, 'AMBUSH!', COL[ev.attacker + 'Light'], { dy: -S * 2.6, big: true, dur: 1500 }); // D-090
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
        const m = Math.min(6, Math.max(2, Math.ceil(ev.n / 2))), gap = this.quick ? 25 : 70;
        const dur = this.quick ? 500 - m * gap : Math.max(400, 110 * (road.length - 1) + 250); // D-086: within the turn banner
        this.schedule(t, () => {
          const now = performance.now();
          for (let i = 0; i < m; i++) this.fx.push({ type: 'march', pid: ev.player, mtype: ev.sqType, pts: road, t0: now + i * gap, dur, seed: i });
          this.towerPulse[ev.player + ':' + ev.sqType] = now;
        });
        this.schedule(t + dur + m * gap, () => {
          if (!this.view) return;
          if (ev.join) { this.view.ret[ev.player][ev.sqType] = (this.view.ret[ev.player][ev.sqType] || 0) + ev.n; this.bump[ev.player] = performance.now(); }
          else {
            const q = this.view.squads[ev.id];
            if (q) q.n += ev.n; else this.view.squads[ev.id] = { id: ev.id, owner: ev.player, type: ev.sqType, n: ev.n, col: ev.to.col, row: ev.to.row, state: 'wait' };
          }
        });
        return this.quick ? t + dur + m * gap : t + Math.min(900, dur);
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
          const txt = ev.kind === 'citadel' ? 'CITADEL TAKEN!' : ev.boost ? `${TYPES[ev.boost].title.toUpperCase()} +10% ARMY` : 'POST TAKEN'; // D-091
          this.addText(ev.col, ev.row, txt, ev.kind === 'citadel' ? '#ffe27a' : ev.boost ? TYPES[ev.boost].color : '#ffe9a8', { dy: -S * 1.9, dur: 1600, big: true });
        });
        return t + 250;
      }
      case 'hold': { // D-090: archers lie in wait — their range shows round them until the ambush is over
        this.schedule(t, () => {
          const q = this.view && this.view.squads[ev.id]; if (q) q.state = 'hold';
          const xy = this.cellXY(ev.col, ev.row);
          this.fx.push({ type: 'ring', x: xy.x, y: xy.y, color: COL[ev.player + 'Light'], t0: performance.now(), dur: 600, big: true });
          this.addText(ev.col, ev.row, 'IN AMBUSH', COL[ev.player + 'Light'], { dy: -S * 1.6, big: true, dur: 1400 });
        });
        return t + 300;
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

  // ---------------------------------------------------------------- the start of a turn (D-086)
  // The camera pulls back to the whole board and the turn banner comes in (0.5 s); meanwhile every group that has to
  // move does so at once — each group runs on its own lane of the timeline. Then the camera closes in on the player to
  // move: every hex his cards and his free step can reach, plus one ring.
  P.laneKeys = function (ev) {
    const side = b => b.kind === 'hero' ? 'h' + b.pid : 'q' + b.id;
    switch (ev.type) {
      case 'sortie': case 'squadMove': case 'join': case 'hold': return ['q' + ev.id];
      case 'fight': return [side(ev.a.before), side(ev.d.before)];
      case 'shoot': return ['@last', side(ev.d.before)];
      case 'muster': return ['m' + ev.player + ev.sqType];
      case 'paint': case 'fill': case 'poi': case 'scorch': case 'walls': return ['@last']; // they follow the group that just moved
      case 'heal': return ['h' + ev.player];
      case 'heroDown': case 'gameover': return ['@all'];
      default: return []; // logs, draws — no time of their own
    }
  };
  P.laneStart = function (L, ev) {
    const keys = this.laneKeys(ev);
    if (!keys.length || keys[0] === '@all') return L.end;
    let t = L.t0;
    for (const k of keys) { const kk = k === '@last' ? L.last : k; if (kk && L.by[kk] != null) t = Math.max(t, L.by[kk]); }
    return t;
  };
  P.laneEnd = function (L, ev, t) {
    const keys = this.laneKeys(ev);
    for (const k of keys) { const kk = k === '@last' ? L.last : k; if (kk && kk !== '@all') L.by[kk] = t; }
    if (keys.length && keys[0][0] !== '@') L.last = keys[0];
    L.end = Math.max(L.end, t);
  };
  P.showTurnBanner = function (pid, sub) {
    const p = this.s.players[pid];
    this.turnBanner = { pid, text: p.bot ? 'OPPONENT TURN' : 'YOUR TURN', sub, t0: performance.now(), out: null };
  };
  P.turnStartV4 = function (ev, t) {
    this.schedule(t, () => { this.camTo(1, null, 450); this.showTurnBanner(ev.player, ev.last ? 'LAST ROUND' : `ROUND ${ev.round} / ${this.s.roundLimit}`); });
    return t;
  };
  P.turnFocusV4 = function (L) {
    const at = Math.max(L.end, L.t0 + 500) + 150;
    this.schedule(at, () => { if (this.turnBanner) this.turnBanner.out = performance.now(); if (this.s.phase === 'play') this.focusTurn(); });
    return at + (this.s.phase === 'play' ? 700 : 0);
  };
  // the first turn of a match, after the intro
  P.turnOpening = function (t) {
    const pid = this.s.current;
    this.schedule(t, () => { this.camTo(1, null, 450); this.showTurnBanner(pid, `ROUND 1 / ${this.s.roundLimit}`); });
    this.schedule(t + 650, () => { if (this.turnBanner) this.turnBanner.out = performance.now(); this.focusTurn(); });
    return t + 650 + 700;
  };
  P.focusTurn = function (dur) { return this.focusCells(this.turnFocusCells(this.s.current), dur || 700); };
  P.turnFocusCells = function (pid) {
    const s = this.s, p = s.players[pid], w = p.warband, out = new Map();
    const add = c => { if (c && s.cells[hex.key(c.col, c.row)]) out.set(hex.key(c.col, c.row), { col: c.col, row: c.row }); };
    if (!w.dead) add(w);
    if (s.current === pid && s.phase === 'play') {
      for (const o of R.stepOptions(s)) o.path.forEach(add);
      for (const card of p.hand) {
        const play = R.getPlay(s, card);
        for (const o of play.options || []) { (o.path || []).forEach(add); add(o.cell); (o.cells || []).forEach(add); }
      }
    }
    for (const c of [...out.values()]) for (let d = 0; d < 6; d++) add(hex.neighbor(c.col, c.row, d)); // + one ring
    return [...out.values()];
  };
  // the banner: a dark ribbon unrolls across the screen, then the words pop in (0.5 s); it fades up as the camera closes in
  P.drawTurnBanner = function (ctx, now) {
    const b = this.turnBanner; if (!b || !this.cssSize) return;
    const kin = Math.min(1, (now - b.t0) / 500); if (kin < 0) return;
    const kout = b.out != null ? Math.max(0, (now - b.out) / 320) : 0;
    if (kout >= 1) { this.turnBanner = null; return; }
    const { w, h } = this.cssSize, cy = h * 0.4, color = COL[b.pid], light = COL[b.pid + 'Light'], dark = COL[b.pid + 'Dark'];
    const fs = Math.max(22, Math.min(46, w / (b.text.length * 0.7))), bh = fs * 2.2;
    const grow = easeOut(Math.min(1, kin / 0.55)), pop = kin < 0.3 ? 0 : easeOutBack(Math.min(1, (kin - 0.3) / 0.7));
    ctx.save(); ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1 - kout; ctx.translate(0, -kout * bh * 0.4);
    const bw = w * grow, g = ctx.createLinearGradient(0, cy - bh / 2, 0, cy + bh / 2);
    g.addColorStop(0, 'rgba(20,12,6,0.9)'); g.addColorStop(1, 'rgba(20,12,6,0.74)');
    ctx.fillStyle = g; ctx.fillRect(w / 2 - bw / 2, cy - bh / 2, bw, bh);
    ctx.fillStyle = color; ctx.fillRect(w / 2 - bw / 2, cy - bh / 2, bw, 3); ctx.fillRect(w / 2 - bw / 2, cy + bh / 2 - 3, bw, 3);
    if (pop > 0) {
      ctx.translate(w / 2, cy - fs * 0.18); ctx.scale(pop, pop);
      ctx.font = `900 ${Math.round(fs)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(4, fs * 0.14); ctx.strokeStyle = dark; ctx.strokeText(b.text, 0, 0);
      ctx.fillStyle = light; ctx.fillText(b.text, 0, 0);
      if (b.sub) { ctx.font = `800 ${Math.round(fs * 0.36)}px system-ui, sans-serif`; ctx.fillStyle = b.sub === 'LAST ROUND' ? '#ffd45a' : 'rgba(255,255,255,0.78)'; ctx.fillText(b.sub, 0, fs * 0.8); }
    }
    ctx.restore();
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
    for (const pid of [1, 2]) this.drawCastleRim(ctx, pid); // D-093
    for (const pid of [1, 2]) this.drawGothicCastle(ctx, pid, now);
    this.drawSquads(ctx, now);
    const order = [1, 2].sort((a, b) => s.players[a].warband.row - s.players[b].warband.row);
    for (const pid of order) this.drawOverlord(ctx, s.players[pid], now);
    this.drawPlanV4(ctx, now, 'over'); // D-087
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
  const MINION_R = 0.18; // D-087: minion figures ×1.5 (was 0.12 of the hex size)
  // D-088: minions trail their leader — each figure eases towards its place (exponential follow, its own lag), so when
  // the Overlord or a group moves the figures fall behind and catch up instead of moving as one block
  P.lagPos = function (key, tx, ty, tau, now) {
    const L = this.lagState || (this.lagState = {}), S = this.size;
    let e = L[key];
    if (!e || now - e.t > 400 || e.S !== S || Math.hypot(tx - e.x, ty - e.y) > S * 5) { e = L[key] = { x: tx, y: ty, t: now, S }; return e; }
    const k = 1 - Math.exp(-Math.max(0, now - e.t) / tau);
    e.x += (tx - e.x) * k; e.y += (ty - e.y) * k; e.t = now;
    return e;
  };
  // a crowd of one type: figures ∝ count (1 per 2, up to o.max) round a centre, then (o.plaque) its plaque above.
  // o.lag: a key — the figures trail the centre when it moves; o.scale: plaque size; o.seed: gait variety
  P.drawCrowd = function (ctx, pid, type, n, cx, cy, now, o) {
    o = o || {};
    if (n <= 0) return;
    const S = this.size, r = S * MINION_R, m = Math.min(o.max || 8, Math.ceil(n / 2)), sx = r * 1.75, sy = r * 1.4;
    let ax = 0, ay = 0;
    const list = SLOTS.slice(0, m).map((q, i) => {
      let fx = cx + q[0] * sx, fy = cy + q[1] * sy;
      if (o.lag) { const L = this.lagPos(o.lag + ':' + i, fx, fy, 60 + (i * 37) % 100, now); fx = L.x; fy = L.y; }
      ax += fx - q[0] * sx; ay += fy - q[1] * sy;
      return { x: fx, y: fy, i };
    }).sort((a, b) => a.y - b.y);
    ax /= m; ay /= m; // the shadow follows the (trailing) crowd
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(ax, ay + r * 1.2, r * (1.3 + Math.min(m, 5) * 0.3), r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    for (const f of list) this.drawMinion(ctx, f.x, f.y, r, pid, type, now, f.i + (o.seed || 0));
    if (o.plaque) this.drawTypePlaque(ctx, pid, type, n, cx, cy - r * 2.9 - (o.scale > 1 ? S * 0.1 : 0), o.plaque === 'wait' ? '⏳' : o.plaque === 'hold' ? '🎯' : '', o.scale);
  };
  // emblem + number; at a distance the plaques carry the information, close up the figures do.
  // D-088: groups away from the Overlord carry them 1.5× larger (scale)
  P.drawTypePlaque = function (ctx, pid, type, n, x, y, waiting, scale) {
    const S = this.size, z = this.zoom || 1, sc = (z > 1.6 ? 0.85 : 1.1) * (scale || 1);
    const h = S * 0.36 * sc, fs = Math.round(S * 0.27 * sc);
    ctx.font = `900 ${fs}px system-ui, sans-serif`;
    // D-091: a type whose army is above its base size (a recruiting post, or extras kept after losing one) — gold number and ▲
    const Pl = this.s && this.s.players && this.s.players[pid], boosted = !!(Pl && Pl.baseComp && Pl.baseComp[type] != null && (Pl.comp[type] > Pl.baseComp[type] || R.armyOnField(this.s, pid, type) > Pl.baseComp[type]));
    const txt = (typeof waiting === 'string' ? waiting : waiting ? '⏳' : '') + String(n) + (boosted ? '▲' : ''), tw = ctx.measureText(txt).width, w = h + tw + S * 0.2 * sc;
    const bx = x - w / 2, by = y - h / 2;
    ctx.fillStyle = 'rgba(20,12,6,0.82)'; ctx.strokeStyle = boosted ? '#ffd45a' : COL[pid + 'Light']; ctx.lineWidth = boosted ? 2.2 : 1.5;
    ctx.beginPath(); ctx.roundRect(bx, by, w, h, h / 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = TYPES[type].color; ctx.beginPath(); ctx.arc(bx + h / 2, y, h * 0.42, 0, Math.PI * 2); ctx.fill();
    const img = HB.icons.image('t_' + type, '#2a1d0e'), is = h * 0.62;
    if (img.complete && img.naturalWidth) ctx.drawImage(img, bx + h / 2 - is / 2, y - is / 2, is, is);
    ctx.fillStyle = boosted ? '#ffd45a' : '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(txt, bx + h + S * 0.04, y + 1);
  };
  // D-087: the Overlord as a dark lord in the manner of Sauron — black plate armour, a crown of iron spikes over a closed
  // helm with a burning eye slit, spiked pauldrons, a flanged mace, a cape in the team colour (the team reads by the cape,
  // the belt and the banner). 1.2 hex high (√3·S) from the feet to the tip of the middle spike.
  P.drawDarkLord = function (ctx, x, y0, r, pid, now) {
    const color = COL[pid], light = COL[pid + 'Light'], dark = COL[pid + 'Dark'], lw = Math.max(1.4, r * 0.05);
    const steel = '#2a2630', steelHi = '#5a5463', black = '#17141a';
    const poly = (pts, fill, stroke) => { ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(x + q[0] * r, y0 + q[1] * r) : ctx.moveTo(x + q[0] * r, y0 + q[1] * r)); ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); } };
    const spike = (bx, by, ang, len, wid, fill) => { const dx = Math.sin(ang), dy = -Math.cos(ang), nx = -dy, ny = dx; ctx.beginPath(); ctx.moveTo(x + (bx + nx * wid) * r, y0 + (by + ny * wid) * r); ctx.lineTo(x + (bx + dx * len) * r, y0 + (by + dy * len) * r); ctx.lineTo(x + (bx - nx * wid) * r, y0 + (by - ny * wid) * r); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); };
    // shadow and cape
    ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.beginPath(); ctx.ellipse(x, y0 + r * 1.02, r * 1.35, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    const cg = ctx.createLinearGradient(0, y0 - r * 0.8, 0, y0 + r); cg.addColorStop(0, color); cg.addColorStop(1, dark);
    ctx.beginPath(); ctx.moveTo(x - r * 0.72, y0 - r * 0.72); ctx.quadraticCurveTo(x - r * 1.15, y0 + r * 0.2, x - r * 1.28, y0 + r * 1.0);
    ctx.quadraticCurveTo(x, y0 + r * 1.12, x + r * 1.28, y0 + r * 1.0); ctx.quadraticCurveTo(x + r * 1.15, y0 + r * 0.2, x + r * 0.72, y0 - r * 0.72); ctx.closePath();
    ctx.fillStyle = cg; ctx.fill(); ctx.strokeStyle = black; ctx.lineWidth = lw; ctx.stroke();
    // armoured skirt and boots
    poly([[-0.5, 0.1], [-0.74, 0.98], [0.74, 0.98], [0.5, 0.1]], steel, black);
    ctx.strokeStyle = steelHi; ctx.lineWidth = lw * 0.8;
    for (const k of [-0.3, 0, 0.3]) { ctx.beginPath(); ctx.moveTo(x + k * r, y0 + r * 0.18); ctx.lineTo(x + k * 1.35 * r, y0 + r * 0.95); ctx.stroke(); }
    ctx.fillStyle = black; ctx.beginPath(); ctx.ellipse(x - r * 0.32, y0 + r * 0.98, r * 0.22, r * 0.1, 0, 0, Math.PI * 2); ctx.ellipse(x + r * 0.32, y0 + r * 0.98, r * 0.22, r * 0.1, 0, 0, Math.PI * 2); ctx.fill();
    // breastplate with a ridge and lames
    const bg = ctx.createLinearGradient(0, y0 - r * 0.75, 0, y0 + r * 0.15); bg.addColorStop(0, '#4a4452'); bg.addColorStop(1, '#1c1920');
    poly([[-0.62, -0.72], [0.62, -0.72], [0.5, 0.15], [-0.5, 0.15]], bg, black);
    ctx.strokeStyle = steelHi; ctx.lineWidth = lw * 0.8; ctx.beginPath(); ctx.moveTo(x, y0 - r * 0.7); ctx.lineTo(x, y0 + r * 0.1);
    for (const k of [-0.42, -0.2]) { ctx.moveTo(x - r * 0.55, y0 + k * r); ctx.quadraticCurveTo(x, y0 + (k + 0.12) * r, x + r * 0.55, y0 + k * r); } ctx.stroke();
    // belt in the team colour
    ctx.fillStyle = color; ctx.fillRect(x - r * 0.53, y0 + r * 0.02, r * 1.06, r * 0.15); ctx.strokeStyle = black; ctx.lineWidth = lw * 0.7; ctx.strokeRect(x - r * 0.53, y0 + r * 0.02, r * 1.06, r * 0.15);
    // arms: the left holds the mace up, the right grips the banner pole
    ctx.strokeStyle = steel; ctx.lineCap = 'round'; ctx.lineWidth = r * 0.26;
    ctx.beginPath(); ctx.moveTo(x - r * 0.72, y0 - r * 0.55); ctx.lineTo(x - r * 0.9, y0 - r * 0.02); ctx.moveTo(x + r * 0.72, y0 - r * 0.55); ctx.lineTo(x + r * 0.95, y0 - r * 0.05); ctx.stroke();
    // the mace: a long haft and a flanged head
    ctx.strokeStyle = '#1a1612'; ctx.lineWidth = r * 0.09; ctx.beginPath(); ctx.moveTo(x - r * 0.84, y0 + r * 0.3); ctx.lineTo(x - r * 1.16, y0 - r * 1.0); ctx.stroke(); ctx.lineCap = 'butt';
    const mx = -1.19, my = -1.12;
    for (let i = 0; i < 6; i++) spike(mx, my, i * Math.PI / 3 + 0.3, 0.38, 0.09, steel);
    ctx.fillStyle = '#35303b'; ctx.beginPath(); ctx.arc(x + mx * r, y0 + my * r, r * 0.22, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = steelHi; ctx.lineWidth = lw * 0.7; ctx.stroke();
    // gauntlets; the right one wears the ring
    ctx.fillStyle = black; ctx.beginPath(); ctx.arc(x - r * 0.9, y0 + r * 0.02, r * 0.14, 0, Math.PI * 2); ctx.arc(x + r * 0.97, y0 - r * 0.02, r * 0.14, 0, Math.PI * 2); ctx.fill();
    const glint = 0.6 + 0.4 * Math.sin(now / 260);
    ctx.fillStyle = `rgba(255,214,90,${glint})`; ctx.beginPath(); ctx.arc(x + r * 0.9, y0 + r * 0.06, r * 0.05, 0, Math.PI * 2); ctx.fill();
    // spiked pauldrons
    for (const sd of [-1, 1]) {
      for (const a of [-0.35, 0.25, 0.85]) spike(sd * 0.74, -0.72, sd * a, 0.42, 0.07, steel);
      ctx.fillStyle = '#35303b'; ctx.beginPath(); ctx.ellipse(x + sd * r * 0.7, y0 - r * 0.64, r * 0.32, r * 0.24, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = black; ctx.lineWidth = lw; ctx.stroke();
    }
    // the crown of iron spikes, behind the helm
    for (let i = -3; i <= 3; i++) { const a = i * 0.24, len = 0.95 - Math.abs(i) * 0.1; spike(Math.sin(a) * 0.3, -1.3 - Math.cos(a) * 0.12, a, len, 0.07, i % 2 ? steel : black); }
    // the closed helm with a burning eye slit
    ctx.beginPath(); ctx.moveTo(x - r * 0.34, y0 - r * 0.72); ctx.lineTo(x - r * 0.38, y0 - r * 1.25); ctx.quadraticCurveTo(x, y0 - r * 1.62, x + r * 0.38, y0 - r * 1.25); ctx.lineTo(x + r * 0.34, y0 - r * 0.72); ctx.quadraticCurveTo(x, y0 - r * 0.62, x - r * 0.34, y0 - r * 0.72); ctx.closePath();
    ctx.fillStyle = '#1f1c23'; ctx.fill(); ctx.strokeStyle = steelHi; ctx.lineWidth = lw; ctx.stroke();
    ctx.strokeStyle = steelHi; ctx.lineWidth = lw * 0.8; ctx.beginPath(); ctx.moveTo(x, y0 - r * 1.45); ctx.lineTo(x, y0 - r * 0.78); ctx.stroke(); // nasal ridge
    const fl = 0.75 + 0.25 * Math.sin(now / 90 + pid);
    const eg = ctx.createRadialGradient(x, y0 - r * 1.1, 0, x, y0 - r * 1.1, r * 0.42); eg.addColorStop(0, `rgba(255,150,40,${0.55 * fl})`); eg.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(x, y0 - r * 1.1, r * 0.42, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(255,${Math.round(150 + 60 * fl)},60,1)`; ctx.beginPath(); ctx.ellipse(x - r * 0.15, y0 - r * 1.1, r * 0.12, r * 0.035, 0, 0, Math.PI * 2); ctx.ellipse(x + r * 0.15, y0 - r * 1.1, r * 0.12, r * 0.035, 0, 0, Math.PI * 2); ctx.fill();
  };
  // D-088: the retinue stands in the Overlord's own hex, in front of him — the first type at the middle, the others to
  // his left and right (the same order as the castle towers: middle, left, right); at most 6 figures a type here
  P.sectorOffsets = function () {
    const S = this.size;
    return [{ x: 0, y: S * 0.5 }, { x: -S * 0.52, y: S * 0.14 }, { x: S * 0.52, y: S * 0.14 }];
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
    // the Overlord: 1.2 hex high; D-088: he stands in the middle of his hex, his feet a little above its centre, so the
    // retinue fits in front of him in the same hex. r is his body unit (feet at y0 + r)
    const r = 1.2 * Math.sqrt(3) * S / 3.47, y0 = y - S * 0.08 - r;
    ctx.save();
    if (fk > 0) { ctx.globalAlpha = 1 - fk; ctx.translate(x, y0); ctx.rotate(fk * 1.2); ctx.translate(-x, -y0); }
    let yy = y0;
    if (rise < 1) { ctx.globalAlpha *= rise; yy -= (1 - easeOutBack(rise)) * S * 0.6; }
    this.drawDarkLord(ctx, x, yy, r, pid, now);
    const wc = now - (this.warCryPulse[pid] || -1e9);
    if (R.active(this.s, p.status.warCryUntil) || wc < 600) { ctx.strokeStyle = `rgba(255,179,71,${0.55 + 0.35 * Math.sin(now / 200)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x, yy - r * 0.35, r * 1.6, r * 1.95, 0, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
    // banner pole in his right hand
    const px = x + r * 0.97, top = y0 - r * 2.75;
    if (fk <= 0) {
      ctx.strokeStyle = '#3b2a14'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(px, y0 + r * 0.95); ctx.lineTo(px, top); ctx.stroke();
      ctx.fillStyle = '#17141a'; ctx.beginPath(); ctx.arc(px, y0 - r * 0.02, r * 0.14, 0, Math.PI * 2); ctx.fill(); // the gauntlet over the pole
    }
    // the retinue in front of him, back rows first; the figures trail him when he moves (D-088)
    const offs = this.sectorOffsets(pid);
    const idx = p.types.map((t, i) => ({ t, i, o: offs[i] })).sort((a, b) => a.o.y - b.o.y);
    for (const e of idx) this.drawCrowd(ctx, pid, e.t, this.retShown(pid, e.t), x + e.o.x, y + e.o.y, now, { max: 6, lag: 'h' + pid + e.t, seed: e.i * 3 });
    if (fk > 0) return;
    // the retinue's plaques: a column at his left hand, in the order of the sectors
    p.types.forEach((t, i) => this.drawTypePlaque(ctx, pid, t, this.retShown(pid, t), x - S * 0.95, y0 - r * 1.55 + i * S * 0.46, false));
    // banner with the Overlord's HP and the shield of his retinue
    const bumpK = (now - (this.bump[pid] || -1e9)) / 380, bsc = bumpK >= 0 && bumpK < 1 ? 1 + 0.25 * Math.sin(bumpK * Math.PI) : 1;
    const hp = this.hpShown(pid), txt = `❤ ${hp}`, fs = Math.round(S * 0.36);
    ctx.font = `900 ${fs}px system-ui, sans-serif`;
    const fw = Math.max(S * 0.95, ctx.measureText(txt).width + S * 0.45), fh = S * 0.5;
    ctx.save(); ctx.translate(px, top + fh / 2); ctx.scale(bsc, bsc); ctx.translate(-px, -(top + fh / 2));
    ctx.fillStyle = COL[pid]; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
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
    if (pid === this.s.current && this.s.phase === 'play') { // whose turn: a dashed ring round his hex
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.ellipse(x, y + S * 0.15, S * 1.15, S * 0.8, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
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
      if (q.state === 'return' && !this.squadAnim[q.id]) { // D-092: the actual way home, hex by hex, with the turn of each stop
        const w = this.s.players[q.owner].warband, real = this.s.squads.find(x => x.id === q.id);
        const route = !w.dead && real && real.col === q.col && real.row === q.row ? R.returnPath(this.s, real) : null;
        if (route && route.length) {
          const pts = [pos].concat(route.map(c => this.cellXY(c.col, c.row))), per = Math.max(1, R.typeStat(this.s, q.owner, q.type, 'ret'));
          ctx.strokeStyle = COL[q.owner + 'Light']; ctx.globalAlpha = 0.65; ctx.lineWidth = 2.5; ctx.setLineDash([4, 6]); ctx.lineCap = 'round';
          ctx.beginPath(); pts.forEach((pt, i) => i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)); ctx.stroke(); ctx.setLineDash([]); ctx.lineCap = 'butt';
          // where it will stand after each of the coming turns (it joins as soon as it is next to the Overlord)
          for (let i = per; i < route.length - 1; i += per) { const c = pts[i]; ctx.fillStyle = 'rgba(20,12,6,0.85)'; ctx.beginPath(); ctx.arc(c.x, c.y, S * 0.17, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = COL[q.owner + 'Light']; ctx.font = `900 ${Math.round(S * 0.22)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(i / per), c.x, c.y + 1); }
          ctx.globalAlpha = 1;
        }
      }
      if (q.state === 'hold') { // D-090: the reach of the ambush
        const real = this.s.squads.find(x => x.id === q.id), rr = ((real && real.holdRange) || 3) * Math.sqrt(3) * S + S * 0.6;
        ctx.strokeStyle = COL[q.owner + 'Light']; ctx.globalAlpha = 0.35 + 0.15 * Math.sin(now / 300); ctx.lineWidth = 2; ctx.setLineDash([6, 8]);
        ctx.beginPath(); ctx.arc(pos.x, pos.y, rr, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      }
      this.drawCrowd(ctx, q.owner, q.type, q.n, pos.x, pos.y, now, { plaque: q.state === 'wait' || q.state === 'hold' ? q.state : true, scale: 1.5, lag: 'q' + q.id, seed: q.id }); // D-088: big plaques away from the Overlord; figures trail the group
    }
  };
  // the gothic castle: dark stone, lancet windows, three towers with spires — a tower per minion type, left to right in
  // the order of the retinue sectors, with the type's colour on its spire and banner; a pit pulses when minions leave it
  // D-093: the castle stands on a raised stone plateau of three hexes — one seamless block, no territory colour, a pale
  // rim with merlons along its outer edges: clearly not ground anyone can walk on
  const CASTLE_SCALE = 2.1, PLATEAU_THICK = 0.34;
  P.drawCastleTile = function (ctx, c, p) {
    const S = this.size, T = S * PLATEAU_THICK, t = hex.corners(p.x, p.y, S, 0), b = hex.corners(p.x, p.y + T, S, 0);
    ctx.fillStyle = '#2c2832'; ctx.beginPath(); ctx.moveTo(t[0].x, t[0].y); for (let i = 1; i <= 3; i++) ctx.lineTo(t[i].x, t[i].y); for (let i = 3; i >= 0; i--) ctx.lineTo(b[i].x, b[i].y); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1; for (let i = 0; i < 3; i++) { const y = t[1].y + (i + 1) * T / 4; ctx.beginPath(); ctx.moveTo(t[2].x, y); ctx.lineTo(t[1].x, y); ctx.stroke(); } // stone courses (under the lower edge only)
    ctx.fillStyle = '#57525e'; ctx.beginPath(); ctx.moveTo(t[0].x, t[0].y); for (let i = 1; i < 6; i++) ctx.lineTo(t[i].x, t[i].y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; // paving flags
    for (let i = 0; i < 5; i++) { const fx = p.x + (((c.col * 7 + c.row * 13 + i * 5) % 9) / 9 - 0.5) * S * 1.1, fy = p.y + (((c.col * 3 + c.row * 11 + i * 7) % 7) / 7 - 0.5) * S * 1.1; ctx.fillRect(fx - S * 0.12, fy - S * 0.07, S * 0.24, S * 0.14); }
  };
  P.drawCastleRim = function (ctx, pid) {
    const s = this.s, cs = s.castles && s.castles[pid]; if (!cs || !cs.cells) return;
    const S = this.size, own = new Set(cs.cells.map(c => hex.key(c.col, c.row)));
    for (const c of cs.cells) {
      const p = this.cellXY(c.col, c.row), k = hex.corners(p.x, p.y, S, 0);
      for (let d = 0; d < 6; d++) {
        const n = hex.neighbor(c.col, c.row, d); if (own.has(hex.key(n.col, n.row))) continue;
        const a = k[(d + 4) % 6], b2 = k[(d + 5) % 6];
        ctx.strokeStyle = '#1e1b22'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b2.x, b2.y); ctx.stroke();
        ctx.strokeStyle = '#9c96a4'; ctx.lineWidth = 3; ctx.stroke();
        for (let i = 1; i <= 3; i++) { const u = i / 4, mx = a.x + (b2.x - a.x) * u, my = a.y + (b2.y - a.y) * u; ctx.fillStyle = '#9c96a4'; ctx.strokeStyle = '#1e1b22'; ctx.lineWidth = 1; ctx.fillRect(mx - S * 0.07, my - S * 0.12, S * 0.14, S * 0.12); ctx.strokeRect(mx - S * 0.07, my - S * 0.12, S * 0.14, S * 0.12); } // merlons
      }
    }
  };
  P.drawGothicCastle = function (ctx, pid, now) {
    const s = this.s, c = s.castles && s.castles[pid]; if (!c) return;
    const S = this.size, p = this.cellXY(c.col, c.row), types = s.players[pid].types;
    let vis = 1; const r0 = this.castleRise[pid];
    if (r0 !== undefined) { if (now < r0) return; const k = (now - r0) / 900; if (k >= 1) delete this.castleRise[pid]; else vis = easeOut(k); }
    // D-093: on its plateau the castle is drawn ×2.1, standing in the middle of the three hexes
    if (c.cells && !this._castleScaled) {
      let cx = 0, cy = 0; for (const q of c.cells) { const xy = this.cellXY(q.col, q.row); cx += xy.x; cy += xy.y; } cx /= c.cells.length; cy /= c.cells.length;
      ctx.save(); ctx.translate(cx, cy + S * 0.55); ctx.scale(CASTLE_SCALE, CASTLE_SCALE); ctx.translate(-p.x, -(p.y + S * 0.45));
      this._castleScaled = true; try { this.drawGothicCastle(ctx, pid, now); } finally { this._castleScaled = false; ctx.restore(); }
      return;
    }
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
    // D-094: the castle at the bottom tip keeps its middle tower low — the three spires form a V, so the Overlord on the
    // start hex just above it stays in view; the castle at the top keeps the tall middle tower
    const low = !!(c.cells && c.row > s.rows / 2);
    const towers = [{ dx: -0.62, h: 1.15, w: 0.34, sp: 0.75 }, low ? { dx: 0, h: 0.62, w: 0.4, sp: 0.42 } : { dx: 0, h: 1.45, w: 0.4, sp: 0.95 }, { dx: 0.62, h: 1.15, w: 0.34, sp: 0.75 }];
    // tower i holds the pit of type i (first type = middle tower, second = left, third = right: front sector ↔ middle)
    const towerType = [types[1], types[0], types[2]];
    towers.forEach((tw, i) => {
      const tx = x + tw.dx * S, th = tw.h * S, ww = tw.w * S, t = towerType[i], tc = t ? TYPES[t].color : stoneLight;
      const pulse = t ? (now - (this.towerPulse[pid + ':' + t] || -1e9)) / 600 : 2;
      box(tx - ww / 2, base - th, ww, th, i === 1 ? stoneLight : stone);
      lancet(tx, base - th + S * 0.22, ww * 0.34, S * 0.3, pulse >= 0 && pulse < 1);
      if (th > S * 0.9) lancet(tx, base - th + S * 0.62, ww * 0.3, S * 0.22, false);
      // spire in the type colour, trimmed in the team colour
      ctx.fillStyle = tc; ctx.strokeStyle = teamDark; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(tx - ww * 0.62, base - th); ctx.lineTo(tx, base - th - S * tw.sp); ctx.lineTo(tx + ww * 0.62, base - th); ctx.closePath(); ctx.fill(); ctx.stroke();
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
  const LANDMARK = { post: 'war_banner', citadel: 'citadel' }; // D-091: recruiting posts fly a war banner
  P.drawPoint = function (ctx, q, now) {
    const S = this.size, p = this.cellXY(q.col, q.row), owner = q.owner;
    this.drawLandmark(ctx, LANDMARK[q.kind] || 'village', p.x, p.y, S, owner);
    const bob = Math.sin(now / 520 + q.id) * S * 0.04, cy = p.y - S * 1.35 + bob, r = S * 0.34;
    const citadel = q.kind === 'citadel', bt = !citadel && owner && q.boost ? q.boost : null; // D-091: a post shows the type it boosts
    const fill = citadel ? '#d9a516' : bt ? TYPES[bt].color : '#c9b48a';
    if (owner) { ctx.shadowColor = COL[owner + 'Light']; ctx.shadowBlur = S * 0.35; }
    ctx.fillStyle = fill; ctx.strokeStyle = owner ? COL[owner] : '#3a2a12'; ctx.lineWidth = owner ? 3 : 2;
    ctx.beginPath(); ctx.arc(p.x, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
    if (citadel) { ctx.fillStyle = '#fff'; ctx.font = `900 ${Math.round(S * 0.34)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('❤', p.x, cy + 1); }
    else if (bt) { const img = HB.icons.image('t_' + bt, '#2a1d0e'), is = r * 1.3; if (img.complete && img.naturalWidth) ctx.drawImage(img, p.x - is / 2, cy - is / 2, is, is); }
    else { ctx.fillStyle = '#2a1d0e'; ctx.font = `900 ${Math.round(S * 0.3)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('⚑', p.x, cy + 1); }
    ctx.font = `900 ${Math.round(S * 0.22)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,12,6,0.9)';
    const lbl = citadel ? '+5❤ · +1/turn' : '+10% army';
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
  // D-087: the preview of a move, not tied to hex shapes.
  //  under the figures: the hexes the move will capture (small tokens in the team colour), the line of fire, candidate ends;
  //  over the figures: the route as a moving dotted line from the Overlord, and at each stop the number of the turn the
  //  group gets there (a squad walks its speed a turn; ⚔ where it strikes)
  P.drawPlanV4 = function (ctx, now, layer) {
    const hl = this.highlights; if (!hl || !hl.length) return;
    const S = this.size, pid = this.s.current, color = COL[pid], light = COL[pid + 'Light'], pulse = 0.5 + 0.5 * Math.sin(now / 180);
    if (layer === 'under') {
      for (const h of hl) {
        const p = this.cellXY(h.col, h.row);
        if (h.kind === 'capture') {
          const pts = hex.corners(p.x, p.y, S * 0.36, 0);
          ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.closePath();
          ctx.globalAlpha = 0.55 + 0.25 * pulse; ctx.fillStyle = color; ctx.fill();
          ctx.globalAlpha = 1; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2; ctx.stroke();
        } else if (h.kind === 'target') {
          ctx.strokeStyle = `rgba(255,255,255,${(h.strong ? 0.85 : 0.45) + 0.15 * pulse})`; ctx.lineWidth = h.strong ? 3 : 2;
          ctx.beginPath(); ctx.arc(p.x, p.y, S * 0.3, 0, Math.PI * 2); ctx.stroke();
        } else if (h.kind === 'zone') { // D-090: the reach of an ambush / volley (gold) or a blessing (green)
          const rr = h.r * Math.sqrt(3) * S + S * 0.6, col = h.tone === 'heal' ? '156,255,138' : '255,212,90';
          ctx.fillStyle = `rgba(${col},${0.08 + 0.05 * pulse})`; ctx.strokeStyle = `rgba(${col},0.85)`; ctx.lineWidth = 2.5; ctx.setLineDash([8, 7]);
          ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
        } else if (h.kind === 'burn') {
          ctx.fillStyle = `rgba(255,120,40,${0.35 + 0.25 * pulse})`; ctx.beginPath(); ctx.arc(p.x, p.y, S * 0.42, 0, Math.PI * 2); ctx.fill();
          ctx.font = `${Math.round(S * 0.5)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🔥', p.x, p.y + 1);
        }
      }
      return;
    }
    const path = hl.filter(h => h.kind === 'path');
    if (!path.length || !this.pathFrom) return;
    const pts = [this.cellXY(this.pathFrom.col, this.pathFrom.row)].concat(path.map(h => this.cellXY(h.col, h.row)));
    const gap = S * 0.27, off = -(now / 30) % gap;
    const line = (a, b, col) => {
      ctx.lineCap = 'round'; ctx.setLineDash([0.01, gap]); ctx.lineDashOffset = off;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = 'rgba(20,12,6,0.75)'; ctx.lineWidth = S * 0.2; ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = S * 0.12; ctx.stroke();
    };
    for (let i = 1; i < pts.length; i++) line(pts[i - 1], pts[i], path[i - 1].attack ? '#ff5a3c' : light);
    ctx.setLineDash([]); ctx.lineDashOffset = 0; ctx.lineCap = 'butt';
    const end = path[path.length - 1];
    path.forEach((h, i) => {
      if (h.label == null && !h.attack) return;
      const p = pts[i + 1], r = S * 0.27, atk = h.attack, last = h === end;
      const sc = last ? 1 + 0.08 * pulse : 1;
      ctx.save(); ctx.translate(p.x, p.y); ctx.scale(sc, sc);
      ctx.fillStyle = atk ? '#8a1c10' : 'rgba(20,12,6,0.9)'; ctx.strokeStyle = atk ? '#ff6b5a' : light; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `900 ${Math.round(S * (atk ? 0.3 : 0.34))}px system-ui, sans-serif`; ctx.fillText(atk ? '⚔' : String(h.label), 0, 1);
      if (atk && h.label > 1) { // a strike on a later turn: its turn number on a small chip
        ctx.fillStyle = 'rgba(20,12,6,0.95)'; ctx.strokeStyle = light; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(r * 0.8, -r * 0.8, r * 0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = `900 ${Math.round(S * 0.2)}px system-ui, sans-serif`; ctx.fillText(String(h.label), r * 0.8, -r * 0.8 + 1);
      }
      ctx.restore();
    });
  };
  // a figure running along a polyline (muster along the road, the intro)
  P.drawMarchFx = function (ctx, f, k) {
    const e = k, pts = f.pts, n = pts.length - 1;
    let x, y;
    if (n <= 0) { x = pts[0].x; y = pts[0].y; }
    else { const fpos = e * n, i = Math.min(n - 1, Math.floor(fpos)), u = fpos - i; x = pts[i].x + (pts[i + 1].x - pts[i].x) * u; y = pts[i].y + (pts[i + 1].y - pts[i].y) * u; }
    const S = this.size, jitter = (f.seed % 3 - 1) * S * 0.12;
    ctx.globalAlpha = k > 0.9 ? 1 - (k - 0.9) / 0.1 : 1;
    this.drawMinion(ctx, x + jitter, y + (f.seed % 2 ? S * 0.08 : -S * 0.05) - Math.abs(Math.sin(k * Math.PI * 6 + f.seed)) * S * 0.08, S * MINION_R * 0.92, f.pid, f.mtype, performance.now(), f.seed);
    ctx.globalAlpha = 1;
  };
})();
