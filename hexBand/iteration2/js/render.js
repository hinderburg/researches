// Canvas renderer: stylised board (grass, trees, rocks), territory with outlined borders, outposts with a floating
// reward card, minion crowds with banners, highlights and lightweight animations (GDD §24–27, D-027).
window.HB = window.HB || {};
(function () {
  const hex = HB.hex, CFG = HB.CONFIG, POIS = HB.cards.POIS, CARDS = HB.cards.CARDS, R = HB.rules;
  const COL = CFG.COLORS;
  const hash = (a, b, c) => { let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 1597334677)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  // flat-top hex: the edge that faces neighbour direction d runs between these two corners (corner i at 60·i degrees)
  const EDGE = [[4, 5], [5, 0], [0, 1], [1, 2], [2, 3], [3, 4]];
  // easing for the capture animation (D-055): a block shoots up with overshoot, hangs, then settles back down
  const easeOutBack = u => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); };
  const liftCurve = k => k < 0.28 ? easeOutBack(k / 0.28) : k < 0.5 ? 1 : (u => 1 - (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2))((k - 0.5) / 0.5);
  const TILE_THICK = 0.14; // D-064: side face of a tile block, in hex sizes
  // D-068: walls live on the edge between two hexes, keyed like rules.js does
  const wallKey = (a, b) => { const ka = hex.key(a.col, a.row), kb = hex.key(b.col, b.row); return ka < kb ? ka + '|' + kb : kb + '|' + ka; };
  const mix = (a, b, t) => { const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16), ch = sh => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t); return `rgb(${ch(16)},${ch(8)},${ch(0)})`; };

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d');
      this.s = null; this.size = 30; this.offset = { x: 0, y: 0 }; this.dpr = 1;
      this.highlights = []; this.texts = []; this.flash = {}; this.shake = { 1: 0, 2: 0 }; this.slide = { 1: null, 2: null };
      this.timeline = []; this.decor = {}; this.dropOK = false; this.dragging = false; this.fx = []; this.forecast = null;
      // D-055: capture animation state — cells whose new owner is not revealed yet, cells popping up, settlements being built
      this.reveal = {}; this.pop = {}; this.flip = {}; this.build = {}; this.settle = {}; this.bump = { 1: 0, 2: 0 }; this.badgePop = {};
      // D-064: match intro state — hidden warbands, rising banners, counting minions
      this.hideWb = {}; this.raise = {}; this.countAnim = {}; this.order = [];
      // D-068: field animation state — wall raising, summon slides, hidden new summons, ghosts of dead summons, step marker
      this.wallAnim = {}; this.summonAnim = {}; this.summonHide = {}; this.ghosts = {}; this.stepHint = null;
      // iteration2 (D-074, D-075): castles (shown defence, rise / fall, shake), fallen warbands, crowd sizes for fleeing
      this.castleShown = {}; this.castleRise = {}; this.castleGone = {}; this.castleShake = { 1: 0, 2: 0 }; this.ghostWb = {}; this.crowdN = {}; this.bigBump = {}; this.castleDust = {}; this.minShown = {}; this.bigText = null;
      requestAnimationFrame(t => this.frame(t));
    }
    setState(s) {
      this.s = s; this.highlights = []; this.texts = []; this.flash = {}; this.timeline = []; this.slide = { 1: null, 2: null }; this.reveal = {}; this.pop = {}; this.flip = {}; this.build = {}; this.fx = []; this.bump = { 1: 0, 2: 0 }; this.badgePop = {};
      this.hideWb = {}; this.raise = {}; this.countAnim = {};
      this.wallAnim = {}; this.summonAnim = {}; this.summonHide = {}; this.ghosts = {}; this.stepHint = null;
      this.castleShown = {}; this.castleRise = {}; this.castleGone = {}; this.castleShake = { 1: 0, 2: 0 }; this.ghostWb = {}; this.crowdN = {}; this.bigBump = {}; this.castleDust = {}; this.minShown = {}; this.bigText = null;
      // D-064: tiles are drawn as blocks top to bottom, so a lower tile's face covers the side of the tile above it
      this.order = Object.values(s.cells).sort((a, b) => (a.row + 0.5 * (a.col & 1)) - (b.row + 0.5 * (b.col & 1)) || a.col - b.col);
      this.buildDecor();
    }
    // D-064, iteration2: the match opens on a neutral board — each castle rises out of the ground, the start zone and
    // the two outposts flip to the player's colour (the castle grows with them), then the warband gathers in the castle:
    // men run in from the hexes around it and, in proportion, from every outpost held
    playIntro() {
      const s = this.s; let t = 0, end = 0;
      for (const k in s.cells) if (s.cells[k].owner) this.reveal[k] = 0;
      for (const pid of [1, 2]) {
        const w = s.players[pid].warband, c = (s.castles || {})[pid] || w, t0 = t; t += 800; // the second player starts a bit later
        this.hideWb[pid] = true; this.castleRise[pid] = Infinity;
        this.schedule(t0, () => { this.castleRise[pid] = performance.now(); const p = this.cellXY(c.col, c.row); this.spawnDust(p.x, p.y, 9); });
        const cells = Object.values(s.cells).filter(q => q.owner === pid).map(q => ({ c: q, d: hex.distance(q, c) })).sort((a, b) => a.d - b.d);
        let last = 0;
        cells.forEach(({ c: q, d }, i) => { const at = t0 + 700 + d * 110 + (i % 4) * 20; last = Math.max(last, at); this.schedule(at, () => this.flipCell(q.col, q.row, 0, pid)); });
        const sources = this.armySources(pid, c);
        const gatherAt = last + 250;
        this.schedule(gatherAt, () => this.gather(pid, c.col, c.row, sources, w.minions));
        end = Math.max(end, gatherAt + this.gatherTime(pid, c, sources) + 200);
      }
      return end;
    }
    // where a warband's men come from (D-075): the castle's own levy from around it, the rest from every outpost held
    armySources(pid, c) {
      const s = this.s, out = [{ col: c.col, row: c.row, count: CFG.ARMY_BASE, around: true }];
      for (const q of s.pois) if (q.owner === pid) out.push({ col: q.col, row: q.row, count: POIS[q.type].random ? CFG.ARMY_PER_CITADEL : CFG.ARMY_PER_POI });
      return out;
    }
    // iteration2: little figures run into the castle from its neighbours and from the outposts (about 14 in all,
    // split by how many men each source gives); when the last one is in, the banner rises and the count climbs
    gatherPlan(pid, col, row, sources) {
      const S = this.size, s = this.s, p = this.cellXY(col, row), total = sources.reduce((a, x) => a + x.count, 0) || 1, runs = [];
      const around = []; for (let d = 0; d < 6; d++) { const n = hex.neighbor(col, row, d); if (s.cells[hex.key(n.col, n.row)]) around.push(n); }
      for (const src of sources) {
        const n = Math.max(1, Math.round(14 * src.count / total));
        for (let i = 0; i < n; i++) {
          const o = src.around ? around[(i * 5 + pid) % around.length] || { col, row } : src;
          const f = this.cellXY(o.col, o.row), jx = (hash(pid, i, src.col * 9 + src.row) - 0.5) * S * 0.7, jy = (hash(src.row, i, pid + 3) - 0.5) * S * 0.5;
          const x0 = f.x + jx, y0 = f.y + jy, dist = Math.hypot(x0 - p.x, y0 - p.y);
          runs.push({ x0, y0, x1: p.x + (hash(i, pid, 7) - 0.5) * S * 0.6, y1: p.y + (hash(pid, i, 11) - 0.3) * S * 0.4, start: src.around ? i * 55 : 120 + i * 110, dur: 380 + dist / S * 190 });
        }
      }
      return runs;
    }
    gatherTime(pid, c, sources) { return this.gatherPlan(pid, c.col, c.row, sources).reduce((m, r) => Math.max(m, r.start + r.dur), 0) + 1000; }
    gather(pid, col, row, sources, minions) {
      const now = performance.now(), runs = this.gatherPlan(pid, col, row, sources);
      let end = 0;
      this.hideWb[pid] = true; delete this.ghostWb[pid]; this.crowdN[pid] = undefined;
      runs.forEach((r, i) => { this.fx.push({ type: 'recruit', pid, x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1, t0: now + r.start, dur: r.dur, seed: i }); end = Math.max(end, r.start + r.dur); });
      const xy = this.cellXY(col, row);
      this.schedule(end - 60, () => {
        const t = performance.now();
        this.hideWb[pid] = false; this.raise[pid] = t; this.minShown[pid] = minions;
        this.countAnim[pid] = { t0: t + 200, dur: 700, from: 0, to: minions };
        this.bump[pid] = t + 900;
        this.fx.push({ type: 'ring', x: xy.x, y: xy.y, color: COL[pid + 'Light'], t0: t, dur: 600, big: true });
      });
      return end + 1000;
    }
    // iteration2: a figure leaves the crowd — runs about a hex away and fades (losses), or the whole crowd scatters
    spawnFlee(pid, x, y, n, far) {
      const now = performance.now(), S = this.size;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, d = S * (far ? 1.3 + Math.random() * 0.9 : 0.8 + Math.random() * 0.5);
        this.fx.push({ type: 'flee', pid, x0: x + (Math.random() - 0.5) * S * 0.5, y0: y + (Math.random() - 0.5) * S * 0.3, x1: x + Math.cos(a) * d, y1: y + Math.sin(a) * d * 0.75, t0: now + (far ? i * 35 : i * 60), dur: far ? 850 : 700, seed: i });
      }
    }
    // castle defence as the board currently shows it: hexes still waiting for their flip count for their old owner
    shownDefense(pid) {
      const s = this.s; let hexes = 0;
      for (const k in s.cells) { const c = s.cells[k]; if (c.castle !== pid && this.shownOwner(k) === pid) hexes++; }
      let v = CFG.CASTLE_BASE + CFG.CASTLE_PER_HEX * hexes;
      for (const q of s.pois) if (this.shownOwner(hex.key(q.col, q.row)) === pid) v += POIS[q.type].random ? CFG.CASTLE_PER_CITADEL : CFG.CASTLE_PER_POI;
      return v;
    }
    buildDecor() {
      const s = this.s; this.decor = {}; this.settle = {};
      const reserved = new Set();
      for (const pid of [1, 2]) { const st = CFG.START[pid]; reserved.add(hex.key(st.col, st.row)); for (let d = 0; d < 6; d++) { const n = hex.neighbor(st.col, st.row, d); reserved.add(hex.key(n.col, n.row)); } }
      for (const k in s.cells) {
        const c = s.cells[k];
        if (c.poi >= 0 || c.castle) continue; // no trees, rocks or huts on outposts and castles
        const r = hash(s.decorSeed, c.col * 7 + 1, c.row * 13 + 3);
        if (!reserved.has(k) && r < 0.17) {
          const n = 1 + Math.floor(hash(s.decorSeed, c.col, c.row + 50) * 3), items = [];
          for (let i = 0; i < n; i++) items.push({ dx: (hash(s.decorSeed, c.col + 100 * i, c.row) - 0.5) * 0.7, dy: (hash(s.decorSeed, c.col, c.row + 100 * i + 7) - 0.5) * 0.5, sc: 0.75 + hash(s.decorSeed, c.col + 3, c.row + 9 + i) * 0.5 });
          this.decor[k] = { type: 'trees', items };
        } else if (!reserved.has(k) && r < 0.25) {
          this.decor[k] = { type: 'rock', dx: (hash(s.decorSeed, c.col + 5, c.row) - 0.5) * 0.5, dy: (hash(s.decorSeed, c.col, c.row + 5) - 0.5) * 0.4, sc: 0.7 + hash(s.decorSeed, c.col + 9, c.row + 9) * 0.6 };
        } else if (r > 0.6) {
          // settlement slot: a hut or a camp appears here in the owner's colour once the hex is captured (D-055)
          this.settle[k] = { dx: (hash(s.decorSeed, c.col + 11, c.row) - 0.5) * 0.45, dy: (hash(s.decorSeed, c.col, c.row + 11) - 0.5) * 0.35 + 0.1, sc: 0.85 + hash(s.decorSeed, c.col + 13, c.row + 13) * 0.3, flip: hash(s.decorSeed, c.col + 17, c.row) < 0.5 };
        }
      }
    }
    // after a hex lands on its new colour it keeps showing that colour even when a later event of the same action
    // changes it again (a hex lost by the castle, then taken when the castle falls) — until that event's own flip
    showAs(k, owner) { if (this.s.cells[k] && this.s.cells[k].owner !== owner) this.reveal[k] = owner; else delete this.reveal[k]; }
    // owner as currently shown: a captured hex keeps its previous colour until its pop-up animation starts
    shownOwner(k) { const r = this.reveal[k]; return r !== undefined ? r : this.s.cells[k].owner; }
    // D-055: a captured hex jumps up as a coloured block, sheds chips and settles; a settlement is built shortly after
    popCell(col, row, owner) {
      const k = hex.key(col, row), now = performance.now(), S = this.size, p = this.cellXY(col, row);
      this.showAs(k, owner);
      this.pop[k] = { t0: now, dur: 620, owner };
      this.schedule(590, () => this.spawnDust(p.x, p.y, 5)); // D-062: dust when the block settles
      if (this.settle[k]) this.build[k] = now + 260;
    }
    // D-057: a hex captured by enclosure jumps, flips over to its new colour and lands; chips fly on landing
    flipCell(col, row, from, to) {
      const k = hex.key(col, row), now = performance.now(), S = this.size, p = this.cellXY(col, row), dur = 640;
      this.showAs(k, to);
      this.flip[k] = { t0: now, dur, from, to };
      this.schedule(dur - 40, () => this.spawnDust(p.x, p.y, 7)); // D-062: dust when the tile lands
      if (this.settle[k]) this.build[k] = now + dur;
    }
    // D-062: clouds of dust rolling out sideways from a tile that has just landed
    spawnDust(x, y, n) {
      const now = performance.now(), S = this.size;
      for (let i = 0; i < n; i++) {
        const side = Math.random() < 0.5 ? -1 : 1, spread = 0.3 + Math.random() * 0.7;
        this.fx.push({ type: 'dust', x: x + side * S * 0.25 * spread, y: y + S * 0.35 + (Math.random() - 0.5) * S * 0.2, vx: side * S * (0.9 + Math.random() * 0.9) * spread, vy: -S * (0.15 + Math.random() * 0.35), r0: S * (0.12 + Math.random() * 0.1), grow: S * (0.28 + Math.random() * 0.18), t0: now + Math.random() * 70, dur: 520 + Math.random() * 220 });
      }
    }
    // D-057: recruits run in from the surroundings and join the crowd; the banner bumps when they arrive
    spawnRecruits(pid, col, row, amount) {
      const now = performance.now(), S = this.size, p = this.cellXY(col, row), n = Math.min(8, Math.max(3, amount));
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, d = S * (2 + Math.random() * 1.2);
        this.fx.push({ type: 'recruit', pid, x0: p.x + Math.cos(a) * d, y0: p.y + Math.sin(a) * d * 0.8, x1: p.x + (Math.random() - 0.5) * S * 0.6, y1: p.y + (Math.random() - 0.3) * S * 0.4, t0: now + i * 45, dur: 520, seed: i });
      }
    }
    resize(w, h) {
      const s = this.s; if (!s) return;
      // D-035: the board takes the whole width; only a small top margin is kept for the banner of a warband on row 0
      const size = Math.floor(Math.min(w / (1.5 * (s.cols - 1) + 2), h / (hex.SQRT3 * s.rows + 1.2)));
      this.size = Math.max(10, size);
      const b = hex.boardSize(s.cols, s.rows, this.size);
      this.dpr = window.devicePixelRatio || 1;
      this.canvas.width = Math.round(w * this.dpr); this.canvas.height = Math.round(h * this.dpr);
      this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
      this.offset = { x: (w - b.w) / 2, y: (h - b.h) / 2 + this.size * 0.6 }; // room for the taller banner on row 0
      this.cssSize = { w, h };
    }
    cellXY(col, row) { const p = hex.pixel(col, row, this.size); return { x: p.x + this.offset.x, y: p.y + this.offset.y }; }
    cellFromPointer(clientX, clientY) {
      const r = this.canvas.getBoundingClientRect();
      return hex.pixelToCell(clientX - r.left - this.offset.x, clientY - r.top - this.offset.y, this.size, this.s.cols, this.s.rows);
    }
    warbandScreenX(pid) { const r = this.canvas.getBoundingClientRect(), w = this.s.players[pid].warband; return r.left + this.cellXY(w.col, w.row).x; }

    // ---- animation helpers
    schedule(delay, fn) { this.timeline.push({ at: performance.now() + delay, fn }); }
    addText(col, row, text, color, opts) {
      opts = opts || {};
      const p = this.cellXY(col, row);
      this.texts.push({ x: p.x + (opts.dx || 0), y: Math.max(this.size * 1.0, p.y + (opts.dy || 0)), // kept inside the canvas for hexes on the top row
                      text, color: color || '#fff', t0: performance.now(), dur: opts.dur || 1100, big: !!opts.big, pop: !!opts.pop, parts: opts.parts || null }); // parts: [{ t, color }] — a text in several colours
    }
    // battle effects (D-039): smoke puffs and sparks at a hex, or a bolt flying between two hexes
    spawnFight(x, y) {
      const now = performance.now(), S = this.size;
      for (let i = 0; i < 7; i++) this.fx.push({ type: 'smoke', x: x + (Math.random() - 0.5) * S * 0.8, y: y + (Math.random() - 0.5) * S * 0.6, r: S * (0.25 + Math.random() * 0.25), t0: now + i * 60, dur: 900 });
      for (let i = 0; i < 12; i++) { const a = Math.random() * Math.PI * 2; this.fx.push({ type: 'spark', x, y, a, len: S * (0.5 + Math.random() * 0.7), t0: now + Math.random() * 200, dur: 380 }); }
    }
    spawnBolt(from, to, dur) { const a = this.cellXY(from.col, from.row), b = this.cellXY(to.col, to.row); this.fx.push({ type: 'bolt', x0: a.x, y0: a.y, x1: b.x, y1: b.y, t0: performance.now(), dur }); }
    flashCell(col, row, color, dur) { this.flash[hex.key(col, row)] = { t0: performance.now(), dur: dur || 500, color: color || '#fff' }; }

    applyEvents(events) {
      let t = 0, combat = false;
      // hold every warband at its pre-action position until its own slide starts (no jump-then-slide flicker)
      if (this.prevPos) for (const pid of [1, 2]) {
        const w = this.s.players[pid].warband, pp = this.prevPos[pid];
        if (pp && pp.col >= 0 && (pp.col !== w.col || pp.row !== w.row)) this.slide[pid] = { path: [{ col: pp.col, row: pp.row }], t0: performance.now(), per: 1, start: this.cellXY(pp.col, pp.row), hold: true };
        // iteration2: banners and crowds show the count from before the action until each hit lands
        if (pp && pp.minions != null && !pp.dead) this.minShown[pid] = pp.minions;
      }
      // iteration2: a destroyed warband stays on the board as a ghost until its rout; a raised one waits for its muster;
      // hexes a castle gives up (or the whole land, when it falls) keep their colour until their own flip
      for (const ev of events) {
        if (ev.type === 'warbandDown') this.ghostWb[ev.player] = { col: ev.col, row: ev.row };
        if (ev.type === 'respawn') this.hideWb[ev.player] = true;
        if (ev.type === 'castleHit') for (const c of ev.lost) { const k = hex.key(c.col, c.row); if (!(k in this.reveal)) this.reveal[k] = c.from; }
        if (ev.type === 'castleFall') { this.castleGone[ev.owner] = { t0: Infinity, dur: 1600 }; for (const c of ev.cells) { const k = hex.key(c.col, c.row); if (!(k in this.reveal)) this.reveal[k] = c.from; } }
      }
      // D-055: captured hexes keep their old colour until their own pop-up in the animation
      for (const ev of events) if (ev.type === 'paint' || ev.type === 'fill' || ev.type === 'scorch') for (const c of ev.cells) this.reveal[hex.key(c.col, c.row)] = c.from || 0;
      // D-068: new walls and summons stay hidden until their own moment in the animation
      for (const ev of events) {
        if (ev.type === 'walls') for (const e of ev.edges) this.wallAnim[wallKey(e.a, e.b)] = Infinity;
        if (ev.type === 'summon') this.summonHide[ev.id] = true;
        if (ev.type === 'summonMove') this.summonAnim[ev.id] = { from: ev.from, to: ev.to, t0: Infinity, dur: 320 }; // stays put until its turn in the timeline
      }
      for (const ev of events) {
        const light = ev.player ? COL[ev.player + 'Light'] : '#fff';
        switch (ev.type) {
          case 'move': {
            combat = false;
            const per = ev.blink ? 260 : 190, pid = ev.player, path = ev.path.slice();
            const from = this.prevPos ? this.prevPos[pid] : null;
            const start = from ? this.cellXY(from.col, from.row) : null;
            this.schedule(t, () => { this.slide[pid] = { path, t0: performance.now(), per, blink: ev.blink, start }; });
            if (this.prevPos) this.prevPos[pid] = path[path.length - 1];
            t += per * path.length;
            break;
          }
          case 'paint': { // D-065: hexes the warband passes through flip over; only the hex it stops on just pops up
            const w = this.s.players[ev.player].warband;
            ev.cells.forEach((c, i) => this.schedule(Math.max(0, t - 190 * (ev.cells.length - i) + 60), () => {
              if (c.col === w.col && c.row === w.row) this.popCell(c.col, c.row, ev.player); else this.flipCell(c.col, c.row, c.from || 0, ev.player);
            }));
            break;
          }
          case 'fill': { // enclosure: a wave of pop-ups spreading out from the warband (D-055)
            const w = this.s.players[ev.player].warband, origin = { col: w.col, row: w.row };
            const cells = ev.cells.map(c => ({ c, d: hex.distance(c, origin) })).sort((a, b) => a.d - b.d);
            const d0 = cells.length ? cells[0].d : 0, ring = 70, step = 12;
            let last = 0;
            cells.forEach(({ c, d }, i) => { const at = t + (d - d0) * ring + (i % 5) * step; last = Math.max(last, at); this.schedule(at, () => this.flipCell(c.col, c.row, c.from || 0, ev.player)); });
            const mid = cells[Math.floor(cells.length / 2)].c;
            this.schedule(last + 400, () => this.addText(mid.col, mid.row, `+${ev.count} territory`, light, { big: true, dur: 1500 }));
            t = last + 640;
            break;
          }
          case 'buff': { // D-057: Battle Cry / Formation — a burst around the warband, the badge pops in
            const xy = this.cellXY(ev.col, ev.row), atk = ev.kind === 'attack', colr = atk ? '#ffb347' : '#9fd0ff';
            this.schedule(t, () => {
              this.badgePop[ev.player + ev.kind] = performance.now();
              this.fx.push({ type: 'ring', x: xy.x, y: xy.y, color: colr, t0: performance.now(), dur: 600, big: true });
              this.addText(ev.col, ev.row, atk ? `BATTLE CRY +${ev.value}` : `FORMATION −${ev.value}`, colr, { dy: -this.size * 1.9, big: true, dur: 1400 });
            });
            t += 450;
            break;
          }
          case 'siege': { // D-054: the enemy warband is fully surrounded — the ring flashes, it takes damage
            const S = this.size, xy = this.cellXY(ev.col, ev.row), aLight = COL[ev.attacker + 'Light'];
            this.schedule(t + 200, () => {
              for (let d = 0; d < 6; d++) { const n = hex.neighbor(ev.col, ev.row, d); this.flashCell(n.col, n.row, aLight, 800); }
              this.fx.push({ type: 'ring', x: xy.x, y: xy.y, color: aLight, t0: performance.now(), dur: 700, big: true });
            });
            this.schedule(t + 450, () => {
              this.shake[ev.defender] = performance.now(); this.minShown[ev.defender] = ev.after;
              this.spawnFight(xy.x, xy.y);
              this.addText(ev.col, ev.row, 'SURROUNDED!', aLight, { dy: -S * 1.9, big: true, dur: 1500 });
              this.addText(ev.col, ev.row, `−${ev.dmg}`, '#ff6b6b', { dy: -S * 0.6, big: true, dur: 1400 });
            });
            t += 1000;
            break;
          }
          case 'poi':
            this.schedule(t, () => { this.flashCell(ev.col, ev.row, '#ffe27a', 800); this.addText(ev.col, ev.row, 'Outpost captured!', '#ffe27a', { dy: -this.size * 1.9, dur: 1600, big: true }); });
            t += 250;
            break;
          case 'attack': { // one-sided ranged hit: a bolt flies, then the target shakes
            const col = ev.col, row = ev.row, def = ev.defender, flight = 260;
            if (ev.from) this.schedule(t, () => this.spawnBolt(ev.from, { col, row }, flight));
            combat = true;
            this.schedule(t + (ev.from ? flight : 0), () => {
              this.shake[def] = performance.now(); this.minShown[def] = ev.after;
              this.spawnFight(this.cellXY(col, row).x, this.cellXY(col, row).y);
              if (ev.label) this.addText(col, row, ev.label.toUpperCase(), '#ffd45a', { dy: -this.size * 1.9, big: true, dur: 1400 });
              this.addText(col, row, `−${ev.dmg}`, '#ff6b6b', { dy: -this.size * 0.6, big: true });
            });
            t += 500 + (ev.from ? flight : 0);
            break;
          }
          case 'clash': { // D-039: attacker runs onto the defender's hex, both strike, the smaller one falls back
            const A = ev.attacker, D = ev.defender, S = this.size;
            const fromXY = this.cellXY(ev.from.col, ev.from.row), atXY = this.cellXY(ev.at.col, ev.at.row);
            const run = 260, fight = 1050, back = 260;
            combat = true;
            this.schedule(t, () => { this.slide[A] = { path: [ev.at], t0: performance.now(), per: run, start: fromXY, hold: true }; });
            t += run;
            this.schedule(t, () => {
              this.spawnFight(atXY.x, atXY.y);
              this.shake[A] = this.shake[D] = performance.now();
              this.minShown[A] = ev.aAfter; this.minShown[D] = ev.dAfter; // the crowds thin out: the fallen run off
              const side = fromXY.x <= atXY.x ? -1 : 1; // attacker's number on the attacker's side
              this.addText(ev.at.col, ev.at.row, `−${ev.dmgToAtt}`, COL[A + 'Light'], { dx: side * S * 0.55, dy: -S * 0.5, big: true, dur: 1500 });
              this.addText(ev.at.col, ev.at.row, `−${ev.dmgToDef}`, COL[D + 'Light'], { dx: -side * S * 0.55, dy: -S * 0.5, big: true, dur: 1500 });
            });
            // iteration2: the bigger warband's number swells — that is why it keeps (or takes) the hex
            if (ev.aAfter > 0 && ev.dAfter > 0 && (ev.aAfter !== ev.dAfter || ev.held)) {
              const W = ev.held ? D : ev.aAfter > ev.dAfter ? A : D;
              this.schedule(t + 480, () => {
                this.bigBump[W] = performance.now();
                const dy = ev.at.row <= 1 ? S * 1.2 : -S * 2.35;
                if (ev.held) this.addText(ev.at.col, ev.at.row, 'CASTLE HOLDS', COL[W + 'Light'], { dy, big: true, dur: 1500, pop: true }); // in its castle a warband never falls back, bigger or not
                else { // each number in its warband's colour, on its warband's side (like the damage numbers); the sign in the bigger one's colour
                  const L = fromXY.x <= atXY.x ? A : D, Rt = L === A ? D : A, lv = L === A ? ev.aAfter : ev.dAfter, rv = L === A ? ev.dAfter : ev.aAfter;
                  this.addText(ev.at.col, ev.at.row, '', null, { dy, big: true, dur: 1500, pop: true,
                    parts: [{ t: String(lv), color: COL[L + 'Light'] }, { t: lv > rv ? ' > ' : ' < ', color: COL[W + 'Light'] }, { t: String(rv), color: COL[Rt + 'Light'] }] });
                }
              });
            }
            t += fight;
            this.schedule(t, () => {
              if (ev.result === 'defenderRetreats') { this.slide[A] = null; this.slide[D] = { path: [ev.defenderTo], t0: performance.now(), per: back, start: atXY }; }
              else this.slide[A] = { path: [ev.attackerTo], t0: performance.now(), per: back, start: atXY, hold: ev.result === 'eliminated' };
            });
            t += back + 100;
            break;
          }
          // ---- iteration2: fallen warbands, castles
          case 'warbandDown': { // the last men scatter in every direction
            const pid = ev.player;
            this.schedule(t, () => {
              const p = this.slide[pid] && this.slide[pid].hold ? this.warbandPos(this.s.players[pid], performance.now()) : this.cellXY(ev.col, ev.row);
              this.spawnFlee(pid, p.x, p.y, 9, true);
              this.spawnDust(p.x, p.y, 5);
              this.addText(ev.col, ev.row, 'ROUTED!', COL[pid + 'Light'], { dy: -this.size * 1.4, big: true, dur: 1500 });
              delete this.ghostWb[pid]; this.slide[pid] = null; this.minShown[pid] = 0; this.crowdN[pid] = undefined;
            });
            t += 450;
            break;
          }
          case 'respawn': // D-075: the warband gathers again in its castle
            this.schedule(t, () => this.gather(ev.player, ev.col, ev.row, ev.sources, ev.minions));
            this.schedule(t + 500, () => this.addText(ev.col, ev.row, 'TO ARMS!', COL[ev.player + 'Light'], { dy: -this.size * 2.2, big: true, dur: 1500 }));
            t += this.gatherTime(ev.player, ev, ev.sources);
            break;
          case 'castleHit': { // D-074: the castle shakes and gives up its farthest hexes, one after another
            const A = ev.attacker, O = ev.owner, S = this.size, cxy = this.cellXY(ev.col, ev.row);
            let hit = t, done = t;
            if (!combat && ev.melee && ev.from) { // assault on an empty castle: run in, strike, run back
              const fromXY = this.cellXY(ev.from.col, ev.from.row), run = 260;
              this.schedule(t, () => { this.slide[A] = { path: [{ col: ev.col, row: ev.row }], t0: performance.now(), per: run, start: fromXY, hold: true }; });
              hit = t + run;
              this.schedule(hit + 750, () => { this.slide[A] = { path: [ev.from], t0: performance.now(), per: 260, start: cxy, hold: true }; });
              done = hit + 1010;
            } else if (!combat && ev.ranged && ev.from) { this.schedule(t, () => this.spawnBolt(ev.from, ev, 300)); hit = t + 300; }
            combat = false;
            this.schedule(hit, () => {
              this.castleShake[O] = performance.now();
              this.spawnFight(cxy.x, cxy.y - S * 0.3);
              const low = ev.row <= 1; // a castle on the top row gets its captions below it
              if (ev.label) this.addText(ev.col, ev.row, ev.label.toUpperCase(), '#ffd45a', { dy: low ? S * 1.75 : -S * 2.6, big: true, dur: 1400 });
              this.addText(ev.col, ev.row, 'CASTLE HIT', COL[A + 'Light'], { dy: low ? S * 1.15 : -S * 1.9, big: true, dur: 1500 });
              this.addText(ev.col, ev.row, `−${ev.dmg}`, '#ff6b6b', { dx: ev.counter ? S * 0.55 : 0, dy: -S * 0.6, big: true, dur: 1500, pop: true });
              if (ev.counter) { // D-077: the castle strikes back at the same moment
                this.shake[A] = performance.now(); this.minShown[A] = ev.aAfter;
                this.addText(ev.col, ev.row, `−${ev.counter}`, COL[A + 'Light'], { dx: -S * 0.55, dy: -S * 0.6, big: true, dur: 1500, pop: true });
                const fromXY = ev.from ? this.cellXY(ev.from.col, ev.from.row) : cxy;
                for (let i = 0; i < 3; i++) this.schedule(i * 70, () => this.fx.push({ type: 'bolt', x0: cxy.x + (i - 1) * S * 0.3, y0: cxy.y - S * 0.9, x1: (cxy.x + fromXY.x) / 2 + (i - 1) * S * 0.2, y1: (cxy.y + fromXY.y) / 2, t0: performance.now(), dur: 220 })); // arrows from the walls
              }
            });
            ev.lost.forEach((c, i) => this.schedule(hit + 250 + i * 85, () => this.flipCell(c.col, c.row, c.from, 0)));
            t = Math.max(done, hit + 250 + ev.lost.length * 85 + 450);
            break;
          }
          case 'castleFall': { // the castle sinks into the ground and the whole land turns to the attacker in a wave
            const A = ev.attacker, O = ev.owner, cxy = this.cellXY(ev.col, ev.row);
            this.schedule(t, () => {
              const now = performance.now();
              this.castleGone[O] = { t0: now, dur: 1600 }; this.castleShake[O] = now;
              for (let i = 0; i < 5; i++) this.schedule(i * 280, () => this.spawnDust(cxy.x + (Math.random() - 0.5) * this.size, cxy.y, 8));
              this.bigText = { text: 'THE CASTLE FALLS!', color: COL[A + 'Light'], t0: now, dur: 2600 };
            });
            const cells = ev.cells.map(c => ({ c, d: hex.distance(c, ev) })).sort((a, b) => a.d - b.d);
            let last = t;
            cells.forEach(({ c, d }, i) => { const at = t + 900 + d * 120 + (i % 5) * 15; last = Math.max(last, at); this.schedule(at, () => this.flipCell(c.col, c.row, c.from, A)); });
            t = last + 800;
            break;
          }
          case 'turn': // iteration2: the last round is announced across the board
            combat = false;
            if (ev.last && ev.roundStart) this.schedule(t, () => { this.bigText = { text: 'LAST ROUND!', color: '#ffd45a', t0: performance.now(), dur: 2200 }; });
            break;
          case 'bonus':
            ev.cells.forEach((c, i) => this.schedule(t + 50 * i, () => this.flashCell(c.col, c.row, '#ffe27a', 700)));
            t += 50 * ev.cells.length + 200;
            break;
          case 'explosion':
            combat = true;
            this.schedule(t, () => { this.flashCell(ev.col, ev.row, '#ffb347', 700); if (ev.dmg && ev.defender) this.minShown[ev.defender] = ev.after; if (ev.dmg) { if (ev.defender) this.shake[ev.defender] = performance.now(); this.addText(ev.col, ev.row, `−${ev.dmg}`, '#ff6b6b', { big: true }); } else this.addText(ev.col, ev.row, 'BLOCKED', '#ffb347'); });
            t += 400;
            break;
          case 'reinforce': { // D-057: recruits run in, then a burst, a banner bump and the big number
            const xy = this.cellXY(ev.col, ev.row);
            this.schedule(t, () => this.spawnRecruits(ev.player, ev.col, ev.row, ev.amount));
            this.schedule(t + 560, () => {
              this.bump[ev.player] = performance.now(); this.minShown[ev.player] = ev.after;
              this.fx.push({ type: 'ring', x: xy.x, y: xy.y, color: '#9cff8a', t0: performance.now(), dur: 550, big: true });
              for (let i = 0; i < 10; i++) { const a = Math.random() * Math.PI * 2, v = this.size * (1.5 + Math.random() * 1.5); this.fx.push({ type: 'chip', x: xy.x, y: xy.y - this.size * 0.3, vx: Math.cos(a) * v, vy: Math.sin(a) * v - this.size * 1.5, r: this.size * 0.07, color: i % 2 ? '#9cff8a' : '#ffffff', t0: performance.now(), dur: 500 }); }
              this.addText(ev.col, ev.row, `+${ev.amount}`, '#9cff8a', { dy: -this.size * 1.9, big: true, dur: 1500, pop: true });
            });
            t += 900;
            break;
          }
          // ---- D-068: field cards and summons
          case 'walls': {
            const S = this.size;
            this.schedule(t, () => {
              for (const e of ev.edges) { this.wallAnim[wallKey(e.a, e.b)] = performance.now(); const a = this.cellXY(e.a.col, e.a.row), b = this.cellXY(e.b.col, e.b.row); this.spawnDust((a.x + b.x) / 2, (a.y + b.y) / 2 - S * 0.3, 3); }
              const e0 = ev.edges[Math.floor(ev.edges.length / 2)];
              if (e0) this.addText(e0.a.col, e0.a.row, 'PALISADE', '#e8c48a', { dy: -S * 1.2, big: true, dur: 1300 });
            });
            t += 450;
            break;
          }
          case 'summon': {
            this.schedule(t, () => { delete this.summonHide[ev.id]; this.summonAnim[ev.id] = { from: ev.from, to: { col: ev.col, row: ev.row }, t0: performance.now(), dur: 320, spawn: true }; });
            t += 340;
            break;
          }
          case 'summonMove':
            this.schedule(t, () => { this.summonAnim[ev.id] = { from: ev.from, to: ev.to, t0: performance.now(), dur: 320 }; });
            t += 340;
            break;
          case 'summonGone': { // its last step is done — it waves and leaves in a puff of dust
            const g = { id: ev.id, owner: ev.owner, col: ev.col, row: ev.row, kind: ev.kind || 'militiaman', acts: 0 };
            this.ghosts[ev.id] = g;
            this.schedule(t + 150, () => { const p = this.cellXY(g.col, g.row); this.spawnDust(p.x, p.y - this.size * 0.2, 5); delete this.ghosts[ev.id]; });
            t += 200;
            break;
          }
          case 'summonKilled': { // trampled by the enemy warband — stays until the warband gets there, then a puff and a skull
            const g = { id: ev.id, owner: ev.owner, col: ev.col, row: ev.row, kind: ev.kind || 'militiaman', acts: 0 };
            this.ghosts[ev.id] = g;
            this.schedule(t + 260, () => { const p = this.cellXY(g.col, g.row); this.spawnFight(p.x, p.y); this.addText(g.col, g.row, 'TRAMPLED', '#ffb3a8', { dy: -this.size * 1.1, big: true, dur: 1200 }); delete this.ghosts[ev.id]; });
            break;
          }
          case 'fortify':
            this.schedule(t, () => { ev.cells.forEach(c => this.flashCell(c.col, c.row, '#f3ecdc', 700)); const w = this.s.players[ev.player].warband; this.addText(w.col, w.row, 'FORTIFIED', '#f3ecdc', { dy: -this.size * 1.9, big: true, dur: 1400 }); });
            t += 450;
            break;
          case 'scorch': {
            this.schedule(t, () => {
              ev.line.forEach((c, i) => this.schedule(i * 90, () => { this.flashCell(c.col, c.row, '#ff9a3a', 600); const p = this.cellXY(c.col, c.row); this.spawnFight(p.x, p.y); }));
              ev.cells.forEach(c => this.schedule(120, () => this.flipCell(c.col, c.row, c.from, 0)));
              const w = this.s.players[ev.player].warband; this.addText(w.col, w.row, 'SCORCH!', '#ffb347', { dy: -this.size * 1.9, big: true, dur: 1300 });
            });
            t += 900;
            break;
          }
          case 'swamp':
            this.schedule(t, () => { this.flashCell(ev.col, ev.row, '#7c9a4a', 800); this.addText(ev.col, ev.row, 'QUAGMIRE', '#b7d68a', { dy: -this.size * 0.9, big: true, dur: 1300 }); });
            t += 350;
            break;
          case 'gameover': t += 400; break;
        }
      }
      this.schedule(t, () => { for (const pid of [1, 2]) if (this.slide[pid] && this.slide[pid].hold) this.slide[pid] = null; this.minShown = {}; this.ghostWb = {}; this.reveal = {}; });
      return t;
    }

    // ---- frame
    frame(now) {
      try {
        for (let i = this.timeline.length - 1; i >= 0; i--) if (this.timeline[i].at <= now) { const it = this.timeline.splice(i, 1)[0]; it.fn(); }
        if (this.s) this.draw(now);
      } catch (e) { console.error('render', e); }
      requestAnimationFrame(t => this.frame(t));
    }
    hexPath(ctx, x, y, inset) {
      const pts = hex.corners(x, y, this.size, inset);
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < 6; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
    }
    // D-064: a tile block — side face under corners 0..3 (right, lower-right, lower-left, left) extruded down by `thick`,
    // then the top face with a thin outline; a 1 px inset leaves a dark seam between neighbouring tiles
    drawTileBlock(ctx, x, y, top, side, thick) {
      const S = this.size, inset = 1, t = hex.corners(x, y, S, inset), b = hex.corners(x, y + thick, S, inset);
      ctx.fillStyle = side; ctx.beginPath();
      ctx.moveTo(t[0].x, t[0].y); for (let i = 1; i <= 3; i++) ctx.lineTo(t[i].x, t[i].y);
      for (let i = 3; i >= 0; i--) ctx.lineTo(b[i].x, b[i].y); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 1; for (let i = 1; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(t[i].x, t[i].y); ctx.lineTo(b[i].x, b[i].y); ctx.stroke(); }
      ctx.fillStyle = top; ctx.beginPath(); ctx.moveTo(t[0].x, t[0].y); for (let i = 1; i < 6; i++) ctx.lineTo(t[i].x, t[i].y); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1; ctx.stroke();
    }
    draw(now) {
      const ctx = this.ctx, s = this.s, S = this.size;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      // finished pop-ups become flat territory before anything is drawn (no one-frame gap between block and tile)
      for (const k in this.pop) if (now - this.pop[k].t0 >= this.pop[k].dur) delete this.pop[k];
      for (const k in this.flip) if (now - this.flip[k].t0 >= this.flip[k].dur) delete this.flip[k];
      // D-064: tiles as blocks — a dark side face under the lower edges and a slightly inset top face, drawn top to
      // bottom so each lower tile covers the side of the one above. Tiles that are popping or flipping leave a hole.
      const T = S * TILE_THICK;
      for (const c of this.order) {
        const k = hex.key(c.col, c.row), p = this.cellXY(c.col, c.row), owner = this.shownOwner(k);
        if (this.pop[k] || this.flip[k]) { ctx.fillStyle = '#4a3a22'; this.hexPath(ctx, p.x, p.y, 0); ctx.fill(); continue; }
        const grassAlt = hash(s.decorSeed, c.col, c.row) < 0.5;
        const top = owner ? COL[owner] : grassAlt ? COL.grass : COL.grassAlt, side = owner ? COL[owner + 'Dark'] : COL.grassSide;
        this.drawTileBlock(ctx, p.x, p.y, top, side, T);
        if (!owner) { // grass tufts
          ctx.strokeStyle = 'rgba(40,90,20,0.35)'; ctx.lineWidth = 1.5;
          for (let i = 0; i < 3; i++) { const tx = p.x + (hash(c.col, c.row, i + 20) - 0.5) * S * 1.0, ty = p.y + (hash(c.col, c.row, i + 40) - 0.5) * S * 1.1; ctx.beginPath(); ctx.moveTo(tx - 2, ty + 3); ctx.lineTo(tx, ty - 2); ctx.lineTo(tx + 2, ty + 3); ctx.stroke(); }
        }
      }
      // territory outline: edges between own cells and anything else
      for (const k in s.cells) {
        const c = s.cells[k], owner = this.shownOwner(k); if (!owner || this.pop[k] || this.flip[k]) continue;
        const p = this.cellXY(c.col, c.row), corners = hex.corners(p.x, p.y, S, 1.5);
        ctx.strokeStyle = COL[owner + 'Light']; ctx.lineWidth = 3; ctx.setLineDash([S * 0.22, S * 0.14]);
        for (let d = 0; d < 6; d++) {
          const n = hex.neighbor(c.col, c.row, d), nk = hex.key(n.col, n.row), nc = s.cells[nk];
          if (nc && this.shownOwner(nk) === owner && !this.pop[nk] && !this.flip[nk]) continue;
          const [a, b] = EDGE[d];
          ctx.beginPath(); ctx.moveTo(corners[a].x, corners[a].y); ctx.lineTo(corners[b].x, corners[b].y); ctx.stroke();
        }
        ctx.setLineDash([]);
        if (c.bonus) { ctx.strokeStyle = 'rgba(255,226,122,0.95)'; ctx.lineWidth = 2; this.hexPath(ctx, p.x, p.y, 5); ctx.stroke(); }
      }
      // pop-up blocks (D-055): captured hexes rise as coloured blocks, top to bottom so lower blocks overlap upper ones
      const lifts = {};
      const pops = Object.keys(this.pop).map(k => ({ k, c: s.cells[k], p: this.pop[k] })).sort((a, b) => a.c.row - b.c.row || a.c.col - b.c.col);
      for (const { k, c, p: pp } of pops) {
        const kk = (now - pp.t0) / pp.dur;
        const lift = S * 0.6 * liftCurve(kk), pt = this.cellXY(c.col, c.row);
        lifts[k] = lift;
        const top = hex.corners(pt.x, pt.y - lift, S, 0), base = hex.corners(pt.x, pt.y + S * TILE_THICK, S, 0); // keeps the block's own thickness when it settles
        // side faces: the lower silhouette (corners 0..3) extruded down to the ground
        ctx.fillStyle = COL[pp.owner + 'Dark']; ctx.beginPath();
        ctx.moveTo(top[0].x, top[0].y); for (let i = 1; i <= 3; i++) ctx.lineTo(top[i].x, top[i].y);
        for (let i = 3; i >= 0; i--) ctx.lineTo(base[i].x, base[i].y); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1; for (let i = 1; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(top[i].x, top[i].y); ctx.lineTo(base[i].x, base[i].y); ctx.stroke(); }
        // top face: bright at first, settling into the owner's colour
        const glow = Math.max(0, 1 - kk / 0.55);
        ctx.fillStyle = mix(COL[pp.owner], '#ffffff', 0.15 + 0.55 * glow); this.hexPath(ctx, pt.x, pt.y - lift, 0); ctx.fill();
        ctx.strokeStyle = COL[pp.owner + 'Light']; ctx.lineWidth = 2.5; this.hexPath(ctx, pt.x, pt.y - lift, 1.5); ctx.stroke();
      }
      // flips (D-057): an enclosed hex jumps, turns over to its new colour and lands back in place
      for (const k in this.flip) {
        const f = this.flip[k], c = s.cells[k], kk = (now - f.t0) / f.dur, pt = this.cellXY(c.col, c.row);
        const jump = S * 0.85 * Math.sin(Math.PI * kk), th = Math.PI * kk, cs = Math.cos(th), sn = Math.sin(th);
        lifts[k] = jump;
        // the hole under the tile and its shadow
        ctx.fillStyle = '#4a3a22'; this.hexPath(ctx, pt.x, pt.y, 0); ctx.fill();
        ctx.fillStyle = `rgba(0,0,0,${0.3 - 0.15 * jump / S})`; ctx.beginPath(); ctx.ellipse(pt.x, pt.y + S * 0.15, S * (0.8 - 0.2 * jump / S), S * (0.35 - 0.1 * jump / S) * Math.max(0.15, Math.abs(cs)), 0, 0, Math.PI * 2); ctx.fill();
        // D-065: a solid slab of thickness T rotating about its horizontal axis. A corner (u, v) on a face at height z
        // maps to v' = v·cos − z·sin (screen y) and z' = v·sin + z·cos (height, drawn as an upward offset);
        // the two faces and six walls are painted back to front by their average height.
        // H is the oblique factor (how much of a vertical extent shows on screen); the slab's real thickness is T / H
        // so that a resting slab shows exactly the block's side height T
        const T = S * TILE_THICK, H = 0.6, TZ = T / H, cy0 = pt.y - jump + T / 2;
        const local = hex.corners(0, 0, S, 1);
        const proj = (u, v, z) => ({ x: pt.x + u, y: cy0 + (v * cs - z * sn) - H * (v * sn + z * cs), d: v * sn + z * cs });
        const topPts = local.map(c => proj(c.x, c.y, TZ / 2)), botPts = local.map(c => proj(c.x, c.y, -TZ / 2));
        const fromCol = f.from ? COL[f.from] : COL.grass, toCol = f.to ? COL[f.to] : COL.grass;
        const fromSide = f.from ? COL[f.from + 'Dark'] : COL.grassSide, toSide = f.to ? COL[f.to + 'Dark'] : COL.grassSide;
        const wallCol = cs >= 0 ? fromSide : toSide; // walls take the shade of the face currently on top
        const polys = [];
        const avg = pts => pts.reduce((a, p) => a + p.d, 0) / pts.length;
        polys.push({ pts: topPts, d: avg(topPts), fill: fromCol, stroke: f.from ? COL[f.from + 'Light'] : COL.grassEdge });
        polys.push({ pts: botPts, d: avg(botPts), fill: toCol, stroke: f.to ? COL[f.to + 'Light'] : COL.grassEdge });
        for (let i = 0; i < 6; i++) { const j = (i + 1) % 6, pts = [topPts[i], topPts[j], botPts[j], botPts[i]]; polys.push({ pts, d: avg(pts), fill: wallCol, stroke: 'rgba(0,0,0,0.25)' }); }
        polys.sort((a, b) => a.d - b.d);
        for (const poly of polys) {
          ctx.fillStyle = poly.fill; ctx.strokeStyle = poly.stroke; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(poly.pts[0].x, poly.pts[0].y); for (let i = 1; i < poly.pts.length; i++) ctx.lineTo(poly.pts[i].x, poly.pts[i].y); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        // sheen while the new face swings up
        if (cs < 0) { ctx.fillStyle = `rgba(255,255,255,${0.4 * (1 - Math.abs(cs))})`; ctx.beginPath(); ctx.moveTo(botPts[0].x, botPts[0].y); for (let i = 1; i < 6; i++) ctx.lineTo(botPts[i].x, botPts[i].y); ctx.closePath(); ctx.fill(); }
      }
      // flashes, blocked, decorations, settlements
      for (const k in s.cells) {
        const c = s.cells[k], p = this.cellXY(c.col, c.row), lift = lifts[k] || 0;
        const f = this.flash[k];
        if (f) {
          const a = 1 - (now - f.t0) / f.dur;
          if (a <= 0) delete this.flash[k]; else { ctx.fillStyle = f.color; ctx.globalAlpha = 0.65 * a; this.hexPath(ctx, p.x, p.y - lift, 0); ctx.fill(); ctx.globalAlpha = 1; }
        }
        if (R.isBlocked(s, c)) {
          ctx.fillStyle = 'rgba(30,20,10,0.35)'; this.hexPath(ctx, p.x, p.y, 2); ctx.fill();
          ctx.strokeStyle = '#2a1a0a'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(p.x - S * 0.3, p.y - S * 0.3); ctx.lineTo(p.x + S * 0.3, p.y + S * 0.3); ctx.moveTo(p.x + S * 0.3, p.y - S * 0.3); ctx.lineTo(p.x - S * 0.3, p.y + S * 0.3); ctx.stroke();
        }
        const dec = this.decor[k];
        if (dec) {
          if (dec.type === 'rock') this.drawRock(ctx, p.x + dec.dx * S, p.y + dec.dy * S - lift, S * 0.3 * dec.sc);
          else for (const t of dec.items) this.drawTree(ctx, p.x + t.dx * S, p.y + t.dy * S - lift, S * 0.36 * t.sc);
        }
        const st = this.settle[k], owner = this.shownOwner(k);
        if (st && owner) {
          let sc = 1;
          const b = this.build[k];
          if (b !== undefined) { if (now < b) continue; const u = (now - b) / 380; if (u >= 1) delete this.build[k]; else sc = easeOutBack(u); }
          this.drawSettlement(ctx, p.x + st.dx * S, p.y + st.dy * S - lift, S * 0.5 * st.sc * sc, owner, st.flip);
        }
      }
      this.drawField(ctx, now); // D-068: walls, swamps, fortified hexes
      // highlights
      const pulse = 0.55 + 0.45 * Math.sin(now / 180);
      for (const h of this.highlights) {
        if (h.kind === 'wall') { this.drawWall(ctx, h.a, h.b, 1, 0, now, true); continue; } // D-068: Palisade preview
        const p = this.cellXY(h.col, h.row);
        if (h.kind === 'path') {
          const atk = h.attack; // D-042: the last step onto the enemy is an attack — red
          ctx.fillStyle = atk ? `rgba(255,70,50,${0.35 + 0.2 * pulse})` : h.strong ? 'rgba(255,255,255,0.42)' : 'rgba(255,255,255,0.22)'; this.hexPath(ctx, p.x, p.y, 3); ctx.fill();
          ctx.strokeStyle = atk ? '#ff5a3c' : 'rgba(255,255,255,0.9)'; ctx.lineWidth = atk ? 3.5 : 2.5; ctx.setLineDash(atk ? [] : [S * 0.2, S * 0.12]); this.hexPath(ctx, p.x, p.y, 4); ctx.stroke(); ctx.setLineDash([]);
          const lbl = atk ? '⚔' : h.label;
          if (lbl != null) { ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 4; ctx.font = `bold ${Math.round(S * 0.55)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.strokeText(String(lbl), p.x, p.y + 1); ctx.fillText(String(lbl), p.x, p.y + 1); }
        } else {
          ctx.lineWidth = 3; ctx.strokeStyle = `rgba(255,255,255,${(h.strong ? 0.9 : 0.5) + 0.3 * pulse})`; this.hexPath(ctx, p.x, p.y, 4); ctx.stroke();
          ctx.fillStyle = `rgba(255,255,255,${(h.strong ? 0.3 : 0.1) + 0.12 * pulse})`; ctx.fill();
        }
      }
      // path arrows between consecutive path highlights
      const path = this.highlights.filter(h => h.kind === 'path');
      if (path.length && this.pathFrom) {
        let prev = this.cellXY(this.pathFrom.col, this.pathFrom.row);
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 3; ctx.setLineDash([S * 0.15, S * 0.12]);
        for (const h of path) { const p = this.cellXY(h.col, h.row); ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(p.x, p.y); ctx.stroke(); prev = p; }
        ctx.setLineDash([]);
      }
      // outposts
      for (const poi of s.pois) this.drawOutpost(ctx, poi, now);
      this.drawCastles(ctx, now); // iteration2 (D-074)
      // warbands: draw the upper one first so overlapping banners read correctly
      const rowOf = pid => { const g = this.ghostWb[pid]; return g ? g.row : s.players[pid].warband.row; };
      const swell = pid => { const k = now - (this.bigBump[pid] || -1e9); return k >= 0 && k < 1100 ? 1 : 0; }; // a swelling banner goes on top
      const order = [1, 2].sort((a, b) => swell(a) - swell(b) || rowOf(a) - rowOf(b));
      this.drawSummons(ctx, now); // D-068
      for (const pid of order) this.drawWarband(ctx, s.players[pid], now);
      this.drawCastlePlaques(ctx, now);
      this.drawStepHint(ctx, now); // D-068: free-step marker
      // battle fx
      for (let i = this.fx.length - 1; i >= 0; i--) {
        const f = this.fx[i], k = (now - f.t0) / f.dur;
        if (k >= 1) { this.fx.splice(i, 1); continue; }
        if (k < 0) continue;
        if (f.type === 'smoke') {
          ctx.globalAlpha = 0.55 * (1 - k); ctx.fillStyle = k < 0.3 ? '#ffd29a' : '#b9b3a8';
          ctx.beginPath(); ctx.arc(f.x, f.y - k * S * 0.5, f.r * (0.5 + k), 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
        } else if (f.type === 'spark') {
          const d0 = f.len * k, d1 = f.len * Math.min(1, k + 0.25);
          ctx.strokeStyle = k < 0.5 ? '#fff4b0' : '#ffb347'; ctx.lineWidth = 2.5; ctx.globalAlpha = 1 - k;
          ctx.beginPath(); ctx.moveTo(f.x + Math.cos(f.a) * d0, f.y + Math.sin(f.a) * d0); ctx.lineTo(f.x + Math.cos(f.a) * d1, f.y + Math.sin(f.a) * d1); ctx.stroke(); ctx.globalAlpha = 1;
        } else if (f.type === 'bolt') {
          const x = f.x0 + (f.x1 - f.x0) * k, y = f.y0 + (f.y1 - f.y0) * k - Math.sin(k * Math.PI) * S * 1.2;
          ctx.fillStyle = '#3a2a12'; ctx.beginPath(); ctx.arc(x, y, S * 0.14, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(255,220,120,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - (f.x1 - f.x0) * 0.08, y - (f.y1 - f.y0) * 0.08 + S * 0.1); ctx.stroke();
        } else if (f.type === 'chip') { // D-055: a bit of ground thrown up by a popping hex, falls back under gravity
          const tt = k * f.dur / 1000, x = f.x + f.vx * tt, y = f.y + f.vy * tt + 0.5 * S * 14 * tt * tt;
          ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3; ctx.fillStyle = f.color;
          ctx.save(); ctx.translate(x, y); ctx.rotate(tt * 9); ctx.fillRect(-f.r, -f.r, f.r * 2, f.r * 2); ctx.restore(); ctx.globalAlpha = 1;
        } else if (f.type === 'ring') { // expanding hex ring around a popping hex or a surrounded warband
          const sc = f.big ? 1 + k * 1.4 : 0.7 + k * 0.9;
          ctx.save(); ctx.translate(f.x, f.y); ctx.scale(sc, sc); ctx.translate(-f.x, -f.y);
          ctx.strokeStyle = f.color; ctx.lineWidth = (f.big ? 4 : 3) / sc; ctx.globalAlpha = 1 - k; this.hexPath(ctx, f.x, f.y, 0); ctx.stroke();
          ctx.restore(); ctx.globalAlpha = 1;
        } else if (f.type === 'dust') { // D-062: a soft puff that drifts sideways, grows and fades
          const e = 1 - Math.pow(1 - k, 2), x = f.x + f.vx * e, y = f.y + f.vy * e, r = f.r0 + f.grow * e;
          ctx.globalAlpha = 0.55 * (1 - k) * (k < 0.15 ? k / 0.15 : 1);
          ctx.fillStyle = '#d7c6a3'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#efe4cc'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.55, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        } else if (f.type === 'recruit' || f.type === 'flee') { // D-057: a small figure running into the crowd; iteration2: or running away from it
          const flee = f.type === 'flee', e = flee ? k : 1 - Math.pow(1 - k, 2);
          const gy = f.y0 + (f.y1 - f.y0) * e, x = f.x0 + (f.x1 - f.x0) * e, y = gy - Math.abs(Math.sin(k * Math.PI * (flee ? 5 : 4) + f.seed)) * S * 0.12;
          const r = S * 0.16, color = COL[f.pid], light = COL[f.pid + 'Light'], dark = COL[f.pid + 'Dark'];
          ctx.globalAlpha = flee ? (k < 0.35 ? 1 : 1 - (k - 0.35) / 0.65) : k > 0.9 ? 1 - (k - 0.9) / 0.1 : 1;
          ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(x, gy + r * 0.6, r * 1.1, r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = color; ctx.strokeStyle = dark; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.ellipse(x, y, r * 1.05, r * 0.9, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.fillStyle = light; ctx.beginPath(); ctx.arc(x, y - r * 1.1, r * 0.85, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(x, y - r * 1.2, r * 0.9, Math.PI, 0); ctx.closePath(); ctx.fill();
          if (flee) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - r * 0.5, y - r * 2.3); ctx.lineTo(x - r * 0.2, y - r * 2.9); ctx.moveTo(x + r * 0.5, y - r * 2.3); ctx.lineTo(x + r * 0.2, y - r * 2.9); ctx.stroke(); } // panic lines
          ctx.globalAlpha = 1;
        }
      }
      // iteration2: a headline across the board (LAST ROUND!, THE CASTLE FALLS!)
      const bt = this.bigText;
      if (bt && this.cssSize) {
        const k = (now - bt.t0) / bt.dur;
        if (k >= 1) this.bigText = null;
        else if (k >= 0) {
          const sc = k < 0.15 ? easeOutBack(k / 0.15) : 1, a = k > 0.8 ? 1 - (k - 0.8) / 0.2 : 1, cx = this.cssSize.w / 2, cy = this.cssSize.h * 0.42;
          const fs = Math.min(S * 1.25, this.cssSize.w / (bt.text.length * 0.62));
          ctx.save(); ctx.globalAlpha = a; ctx.translate(cx, cy); ctx.scale(sc, sc);
          ctx.fillStyle = 'rgba(20,12,6,0.55)'; ctx.beginPath(); ctx.roundRect(-this.cssSize.w * 0.48, -fs * 0.85, this.cssSize.w * 0.96, fs * 1.7, fs * 0.4); ctx.fill();
          ctx.font = `900 ${Math.round(fs)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.lineWidth = Math.max(4, fs * 0.14); ctx.strokeStyle = 'rgba(30,15,5,0.95)'; ctx.strokeText(bt.text, 0, 2);
          ctx.fillStyle = bt.color; ctx.fillText(bt.text, 0, 2);
          ctx.restore();
        }
      }
      // floating texts
      for (let i = this.texts.length - 1; i >= 0; i--) {
        const t = this.texts[i], k = (now - t.t0) / t.dur;
        if (k >= 1) { this.texts.splice(i, 1); continue; }
        ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
        const popSc = t.pop ? (k < 0.18 ? easeOutBack(k / 0.18) * 1.35 : 1.35 - 0.35 * Math.min(1, (k - 0.18) / 0.3)) : 1;
        ctx.font = `${t.big ? '900 ' : 'bold '}${Math.round(S * (t.big ? 0.6 : 0.46) * popSc)}px system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const ty = t.y - k * S * 0.9;
        if (t.parts) { // iteration2: several colours on one line, laid out left to right around the centre
          const ws = t.parts.map(p => ctx.measureText(p.t).width), total = ws.reduce((a, b) => a + b, 0);
          let x = t.x - total / 2; ctx.textAlign = 'left';
          t.parts.forEach((p, j) => { ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(30,15,5,0.85)'; ctx.strokeText(p.t, x, ty); ctx.fillStyle = p.color; ctx.fillText(p.t, x, ty); x += ws[j]; });
        } else {
          ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(30,15,5,0.85)'; ctx.strokeText(t.text, t.x, ty);
          ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, ty);
        }
        ctx.globalAlpha = 1;
      }
    }
    drawTree(ctx, x, y, h) {
      ctx.fillStyle = '#5b3a1e'; ctx.fillRect(x - h * 0.08, y, h * 0.16, h * 0.35);
      const tri = (dy, w, hh, color) => { ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x, y - hh + dy); ctx.lineTo(x - w, y + dy); ctx.lineTo(x + w, y + dy); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#1f4d18'; ctx.lineWidth = 1; ctx.stroke(); };
      tri(0.05 * h, h * 0.5, h * 0.7, '#2f7a34'); tri(-0.35 * h, h * 0.4, h * 0.65, '#3a9440'); tri(-0.7 * h, h * 0.28, h * 0.55, '#49ad4c');
    }
    // D-055: settlements in the owner's colour — Blue builds huts, Red pitches tents
    drawSettlement(ctx, x, y, h, owner, flip) {
      const color = COL[owner], light = COL[owner + 'Light'], dark = COL[owner + 'Dark'];
      ctx.save(); ctx.translate(x, y); if (flip) ctx.scale(-1, 1);
      ctx.lineJoin = 'round';
      if (owner === 1) { // hut: cream walls, blue roof, dark door
        const w = h * 0.9, bh = h * 0.55;
        ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(0, h * 0.08, w * 0.62, h * 0.16, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f1e4c8'; ctx.strokeStyle = '#5a4324'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.rect(-w / 2, -bh, w, bh); ctx.fill(); ctx.stroke();
        ctx.fillStyle = color; ctx.strokeStyle = dark;
        ctx.beginPath(); ctx.moveTo(-w * 0.62, -bh); ctx.lineTo(0, -bh - h * 0.55); ctx.lineTo(w * 0.62, -bh); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = light; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-w * 0.3, -bh - h * 0.27); ctx.lineTo(w * 0.3, -bh - h * 0.27); ctx.stroke();
        ctx.fillStyle = '#5a4324'; ctx.beginPath(); ctx.roundRect(-w * 0.12, -bh * 0.6, w * 0.24, bh * 0.6, [w * 0.12, w * 0.12, 0, 0]); ctx.fill();
      } else { // tent: red canvas with a light flap and a pennant
        const w = h * 1.05;
        ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(0, h * 0.08, w * 0.62, h * 0.16, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = color; ctx.strokeStyle = dark; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.lineTo(0, -h * 1.05); ctx.lineTo(w / 2, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = light; ctx.beginPath(); ctx.moveTo(0, -h * 0.55); ctx.lineTo(-w * 0.16, 0); ctx.lineTo(w * 0.16, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(0, -h * 0.4); ctx.lineTo(-w * 0.09, 0); ctx.lineTo(w * 0.09, 0); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#4a3218'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -h * 1.05); ctx.lineTo(0, -h * 1.4); ctx.stroke();
        ctx.fillStyle = light; ctx.beginPath(); ctx.moveTo(0, -h * 1.4); ctx.lineTo(w * 0.3, -h * 1.3); ctx.lineTo(0, -h * 1.2); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    // ---- D-068: field objects ------------------------------------------------------------------------------
    drawField(ctx, now) {
      const s = this.s, S = this.size;
      for (const k in s.swamps || {}) { // Quagmire: murky water with ripples and reeds
        if (!R.active(s, s.swamps[k])) continue;
        const c = s.cells[k], p = this.cellXY(c.col, c.row);
        ctx.fillStyle = 'rgba(70,86,44,0.9)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + S * 0.05, S * 0.66, S * 0.44, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(160,184,110,0.55)'; ctx.lineWidth = 1.5;
        for (let i = 0; i < 2; i++) { const r = ((now / 1400 + i * 0.5) % 1); ctx.globalAlpha = 1 - r; ctx.beginPath(); ctx.ellipse(p.x, p.y + S * 0.05, S * 0.18 + S * 0.4 * r, S * 0.1 + S * 0.26 * r, 0, 0, Math.PI * 2); ctx.stroke(); }
        ctx.globalAlpha = 1;
        for (const [dx, h] of [[-0.35, 0.42], [-0.25, 0.3], [0.38, 0.36]]) {
          const rx = p.x + dx * S, ry = p.y + S * 0.12;
          ctx.strokeStyle = '#4f6a2a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx + S * 0.03, ry - S * h); ctx.stroke();
          ctx.fillStyle = '#6b4a22'; ctx.beginPath(); ctx.ellipse(rx + S * 0.03, ry - S * h, S * 0.035, S * 0.08, 0, 0, Math.PI * 2); ctx.fill();
        }
      }
      for (const k in s.cells) { // Fortify: a ring of stones on the hex rim
        const c = s.cells[k];
        if (!c.fortOwner || !R.active(s, c.fortUntil || -1)) continue;
        const p = this.cellXY(c.col, c.row);
        ctx.setLineDash([]); ctx.strokeStyle = 'rgba(50,40,30,0.55)'; ctx.lineWidth = S * 0.14; this.hexPath(ctx, p.x, p.y, S * 0.14); ctx.stroke();
        ctx.setLineDash([S * 0.17, S * 0.06]); ctx.strokeStyle = '#ddd5c4'; ctx.lineWidth = S * 0.1; this.hexPath(ctx, p.x, p.y, S * 0.14); ctx.stroke();
        ctx.setLineDash([]);
      }
      for (const key in s.walls || {}) { // Palisade: stakes rising along the edge
        const w = s.walls[key];
        if (!R.active(s, w.until)) continue;
        const a0 = this.wallAnim[key];
        let k = 1;
        if (a0 !== undefined) { if (now < a0) continue; k = Math.min(1, (now - a0) / 380); k = k < 1 ? easeOutBack(k) : 1; }
        this.drawWall(ctx, w.a, w.b, k, w.owner, now, false);
      }
    }
    drawWall(ctx, a, b, k, owner, now, preview) {
      const S = this.size, d = hex.dirBetween(a, b);
      if (d < 0) return;
      const [i, j] = EDGE[d], p = this.cellXY(a.col, a.row), cs = hex.corners(p.x, p.y, S, 1.5), P = cs[i], Q = cs[j];
      if (preview) {
        ctx.strokeStyle = `rgba(255,214,140,${0.55 + 0.35 * Math.sin(now / 180)})`; ctx.lineWidth = S * 0.16; ctx.lineCap = 'round'; ctx.setLineDash([S * 0.12, S * 0.1]);
        ctx.beginPath(); ctx.moveTo(P.x, P.y); ctx.lineTo(Q.x, Q.y); ctx.stroke(); ctx.setLineDash([]); ctx.lineCap = 'butt';
        return;
      }
      ctx.strokeStyle = '#4a2f14'; ctx.lineWidth = S * 0.1; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(P.x, P.y); ctx.lineTo(Q.x, Q.y); ctx.stroke(); ctx.lineCap = 'butt';
      const n = 4, h = S * 0.36 * k, sw = S * 0.1;
      for (let m = 0; m < n; m++) {
        const t = (m + 0.5) / n, x = P.x + (Q.x - P.x) * t, y = P.y + (Q.y - P.y) * t;
        ctx.fillStyle = '#b37c3c'; ctx.strokeStyle = '#4a2f14'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(x - sw / 2, y); ctx.lineTo(x - sw / 2, y - h); ctx.lineTo(x, y - h - sw * 0.9 * k); ctx.lineTo(x + sw / 2, y - h); ctx.lineTo(x + sw / 2, y); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      if (k > 0.3) { // a band in the owner's colour ties the stakes together
        ctx.strokeStyle = COL[owner] || '#8a6b3a'; ctx.lineWidth = S * 0.06;
        ctx.beginPath(); ctx.moveTo(P.x, P.y - h * 0.5); ctx.lineTo(Q.x, Q.y - h * 0.5); ctx.stroke();
      }
    }
    drawSummons(ctx, now) {
      const S = this.size, list = (this.s.summons || []).filter(u => !this.summonHide[u.id]).concat(Object.values(this.ghosts));
      for (const u of list) {
        let pos = this.cellXY(u.col, u.row), hop = 0;
        const an = this.summonAnim[u.id];
        if (an) {
          const k = (now - an.t0) / an.dur;
          if (k >= 1) delete this.summonAnim[u.id];
          else {
            const kk = Math.max(0, k), a = this.cellXY(an.from.col, an.from.row), b = this.cellXY(an.to.col, an.to.row);
            pos = { x: a.x + (b.x - a.x) * kk, y: a.y + (b.y - a.y) * kk }; hop = Math.sin(kk * Math.PI) * S * 0.25;
          }
        }
        const x = pos.x, y = pos.y + S * 0.12 - hop, r = S * 0.17, color = COL[u.owner], light = COL[u.owner + 'Light'], dark = COL[u.owner + 'Dark'];
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(pos.x, pos.y + S * 0.3, S * 0.3, S * 0.1, 0, 0, Math.PI * 2); ctx.fill();
        if (u.kind === 'rider') { // a small horse under the rider
          ctx.fillStyle = '#7a5230'; ctx.strokeStyle = '#3b2512'; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.ellipse(x, y + r * 0.9, r * 1.5, r * 0.7, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.ellipse(x + r * 1.45, y + r * 0.2, r * 0.45, r * 0.3, -0.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.strokeStyle = '#3b2512'; ctx.lineWidth = 2; for (const lx of [-0.9, -0.4, 0.5, 1.0]) { ctx.beginPath(); ctx.moveTo(x + lx * r, y + r * 1.4); ctx.lineTo(x + lx * r, y + r * 2.1); ctx.stroke(); }
        } else { // a spear
          ctx.strokeStyle = '#4a3218'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + r * 0.9, y + r * 0.6); ctx.lineTo(x + r * 1.3, y - r * 2.4); ctx.stroke();
          ctx.fillStyle = '#d8dbe3'; ctx.beginPath(); ctx.moveTo(x + r * 1.33, y - r * 2.9); ctx.lineTo(x + r * 1.1, y - r * 2.3); ctx.lineTo(x + r * 1.55, y - r * 2.3); ctx.closePath(); ctx.fill();
        }
        const by = u.kind === 'rider' ? y - r * 0.2 : y;
        ctx.fillStyle = color; ctx.strokeStyle = dark; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(x, by, r * 1.05, r * 0.9, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = light; ctx.beginPath(); ctx.arc(x, by - r * 1.1, r * 0.85, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(x, by - r * 1.2, r * 0.9, Math.PI, 0); ctx.closePath(); ctx.fill();
        for (let i = 0; i < u.acts; i++) { // pips: captures still to come
          const px = x - (u.acts - 1) * S * 0.08 + i * S * 0.16, py = by - r * 2.6;
          ctx.fillStyle = '#fff'; ctx.strokeStyle = dark; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(px, py, S * 0.06, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
      }
    }
    // D-068: the free step — a boot badge by the current warband (crossed out once used) and chevrons towards every
    // hex it can step to while the human player may take it
    drawStepHint(ctx, now) {
      const h = this.stepHint, s = this.s;
      if (!h || !s || s.phase !== 'play' || this.hideWb[h.pid] || s.players[h.pid].warband.dead) return;
      const S = this.size, p = s.players[h.pid], pos = this.warbandPos(p, now), pulse = 0.5 + 0.5 * Math.sin(now / 200);
      if (!h.used && h.targets.length && !this.highlights.length && !this.dragging) {
        for (const t of h.targets) {
          const c = this.cellXY(t.col, t.row), dx = c.x - pos.x, dy = c.y - pos.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
          const cx = pos.x + dx * 0.6, cy = pos.y + dy * 0.6, tip = { x: cx + ux * S * 0.14, y: cy + uy * S * 0.14 };
          const b1 = { x: cx - ux * S * 0.1 - uy * S * 0.16, y: cy - uy * S * 0.1 + ux * S * 0.16 }, b2 = { x: cx - ux * S * 0.1 + uy * S * 0.16, y: cy - uy * S * 0.1 - ux * S * 0.16 };
          ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(b1.x, b1.y); ctx.lineTo(tip.x, tip.y); ctx.lineTo(b2.x, b2.y); ctx.stroke();
          ctx.strokeStyle = t.attack ? `rgba(255,110,90,${0.6 + 0.4 * pulse})` : `rgba(255,255,255,${0.6 + 0.4 * pulse})`; ctx.lineWidth = 3.5;
          ctx.beginPath(); ctx.moveTo(b1.x, b1.y); ctx.lineTo(tip.x, tip.y); ctx.lineTo(b2.x, b2.y); ctx.stroke();
          ctx.lineCap = 'butt';
        }
      }
      const bx = pos.x - S * 0.66, by = pos.y + S * 0.38, r = S * 0.2;
      ctx.fillStyle = h.used ? '#8a8378' : '#f7ead0'; ctx.strokeStyle = h.used ? '#5a544a' : COL[p.id]; ctx.lineWidth = h.used ? 2 : 2.5 + (h.targets.length ? pulse : 0);
      ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = h.used ? '#5a544a' : '#5a3a1a';
      ctx.beginPath(); ctx.moveTo(bx - r * 0.38, by - r * 0.55); ctx.lineTo(bx - r * 0.38, by + r * 0.3); ctx.lineTo(bx + r * 0.55, by + r * 0.3); ctx.lineTo(bx + r * 0.55, by + r * 0.05); ctx.lineTo(bx + r * 0.05, by - r * 0.08); ctx.lineTo(bx + r * 0.05, by - r * 0.55); ctx.closePath(); ctx.fill();
      if (h.used) { ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(bx - r * 0.72, by + r * 0.72); ctx.lineTo(bx + r * 0.72, by - r * 0.72); ctx.stroke(); }
    }
    drawRock(ctx, x, y, r) {
      ctx.fillStyle = '#8f9199'; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#4c4e56'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#b8bac2'; ctx.beginPath(); ctx.ellipse(x - r * 0.3, y - r * 0.25, r * 0.4, r * 0.25, -0.4, 0, Math.PI * 2); ctx.fill();
    }
    pill(ctx, x, y, text, size, bg, fg) {
      ctx.font = `bold ${Math.round(size)}px system-ui, sans-serif`;
      const w = ctx.measureText(text).width + size * 1.1, h = size * 1.5;
      ctx.fillStyle = bg; ctx.strokeStyle = 'rgba(60,40,10,0.8)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y + 1);
    }
    // D-061: every outpost type has its own landmark on the hex; the citadel is a small castle. The reward card floats
    // above it: full size with title and name while neutral, 25 % smaller with only the icon once captured, so the
    // landmark stays visible. Outpost cards get a bronze double frame, the citadel card a gold ornamented one.
    drawOutpost(ctx, poi, now) {
      const S = this.size, p = this.cellXY(poi.col, poi.row), def = POIS[poi.type], x = p.x, y = p.y, cardId = R.poiCardId(poi);
      const owner = poi.owner, citadel = !!def.random, teamCol = owner ? COL[owner] : citadel ? '#c9941c' : '#8a6b3a';
      this.drawLandmark(ctx, poi.type, x, y, S, owner);
      const bob = Math.sin(now / 520 + poi.id) * S * 0.04;
      const gold = '#d9a516', goldDark = '#8a6208', bronze = '#b07a3a';
      if (owner) {
        // captured: compact card, icon only
        const cw = S * 1.5 * 0.75, ch = S * 1.85 * 0.75, cx = x - cw / 2, cy = y - S * 1.55 + bob;
        ctx.shadowColor = COL[owner + 'Light']; ctx.shadowBlur = S * 0.35;
        ctx.fillStyle = citadel ? '#fff3d0' : '#f7ead0'; ctx.strokeStyle = teamCol; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.roundRect(cx, cy, cw, ch, S * 0.1); ctx.fill(); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = citadel ? gold : bronze; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(cx + 3, cy + 3, cw - 6, ch - 6, S * 0.07); ctx.stroke();
        ctx.fillStyle = teamCol; ctx.beginPath(); ctx.roundRect(cx, cy, cw, ch * 0.16, [S * 0.1, S * 0.1, 0, 0]); ctx.fill();
        if (citadel) this.drawOrnament(ctx, cx, cy + ch * 0.16, cw, gold);
        const img = HB.icons.image(cardId, '#3a2a12'), isz = cw * 0.72;
        if (img.complete && img.naturalWidth) ctx.drawImage(img, x - isz / 2, cy + ch * 0.5 - isz / 2 + ch * 0.06, isz, isz);
        return;
      }
      // neutral: full card with the outpost name and the card name, raised so the landmark below stays visible
      const cw = S * 1.4, ch = S * 1.7, cx = x - cw / 2, cy = y - S * 1.9 + bob;
      if (citadel) { ctx.shadowColor = 'rgba(255,200,60,0.9)'; ctx.shadowBlur = S * 0.45; }
      ctx.fillStyle = citadel ? '#fff3d0' : '#f7ead0'; ctx.strokeStyle = citadel ? gold : teamCol; ctx.lineWidth = citadel ? 3 : 2;
      ctx.beginPath(); ctx.roundRect(cx, cy, cw, ch, S * 0.12); ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = citadel ? gold : teamCol;
      ctx.beginPath(); ctx.roundRect(cx, cy, cw, ch * 0.2, [S * 0.12, S * 0.12, 0, 0]); ctx.fill();
      if (citadel) { ctx.strokeStyle = goldDark; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(cx + 3, cy + 3, cw - 6, ch - 6, S * 0.09); ctx.stroke(); this.drawOrnament(ctx, cx, cy + ch * 0.2, cw, gold); this.drawOrnament(ctx, cx, cy + ch * 0.8, cw, gold); }
      ctx.fillStyle = citadel ? '#2b1d05' : '#fff'; ctx.font = `bold ${Math.round(S * 0.22)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(def.title, x, cy + ch * 0.1 + 1, cw * 0.92);
      const img = HB.icons.image(cardId, '#3a2a12'), isz = cw * 0.62;
      if (img.complete && img.naturalWidth) ctx.drawImage(img, x - isz / 2, cy + ch * 0.26, isz, isz);
      ctx.fillStyle = '#3a2a12'; ctx.font = `bold ${Math.round(S * 0.2)}px system-ui, sans-serif`;
      ctx.fillText(CARDS[cardId].title, x, cy + ch * 0.9, cw * 0.92);
    }
    // a row of small gold diamonds on a hairline — the citadel card's ornament
    drawOrnament(ctx, cx, y, w, color) {
      ctx.fillStyle = color;
      const n = 5, step = w / (n + 1), r = w * 0.03;
      for (let i = 1; i <= n; i++) { const ox = cx + i * step; ctx.beginPath(); ctx.moveTo(ox, y - r); ctx.lineTo(ox + r, y); ctx.lineTo(ox, y + r); ctx.lineTo(ox - r, y); ctx.closePath(); ctx.fill(); }
      ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx + step * 0.4, y); ctx.lineTo(cx + w - step * 0.4, y); ctx.stroke();
    }
    // D-061: landmarks per outpost type, drawn in the lower half of the hex under the floating card
    drawLandmark(ctx, type, x, y, S, owner) {
      const wood = '#7a4f22', stone = '#a9a5a0', stoneDark = '#6c6862', roof = owner ? COL[owner] : '#8a6b3a';
      const base = y + S * 0.45;
      ctx.lineJoin = 'round'; ctx.lineWidth = 1.5;
      const shadow = w => { ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(x, base + S * 0.08, w, S * 0.12, 0, 0, Math.PI * 2); ctx.fill(); };
      switch (type) {
        case 'citadel': { // a small castle: wall with battlements, two towers, a keep with a flag
          shadow(S * 0.75);
          ctx.fillStyle = stone; ctx.strokeStyle = stoneDark;
          ctx.beginPath(); ctx.rect(x - S * 0.62, base - S * 0.42, S * 1.24, S * 0.42); ctx.fill(); ctx.stroke();
          for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.rect(x + i * S * 0.19 - S * 0.06, base - S * 0.52, S * 0.12, S * 0.12); ctx.fill(); ctx.stroke(); }
          for (const tx of [x - S * 0.58, x + S * 0.58]) { ctx.beginPath(); ctx.rect(tx - S * 0.13, base - S * 0.72, S * 0.26, S * 0.72); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#5a3f22'; ctx.beginPath(); ctx.moveTo(tx - S * 0.17, base - S * 0.72); ctx.lineTo(tx, base - S * 0.95); ctx.lineTo(tx + S * 0.17, base - S * 0.72); ctx.closePath(); ctx.fill(); ctx.fillStyle = stone; }
          ctx.beginPath(); ctx.rect(x - S * 0.2, base - S * 0.78, S * 0.4, S * 0.78); ctx.fill(); ctx.stroke(); // keep
          for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.rect(x + i * S * 0.14 - S * 0.05, base - S * 0.86, S * 0.1, S * 0.1); ctx.fill(); ctx.stroke(); }
          ctx.fillStyle = '#3a2a12'; ctx.beginPath(); ctx.roundRect(x - S * 0.09, base - S * 0.26, S * 0.18, S * 0.26, [S * 0.09, S * 0.09, 0, 0]); ctx.fill(); // gate
          ctx.strokeStyle = '#3b2a14'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, base - S * 0.86); ctx.lineTo(x, base - S * 1.12); ctx.stroke();
          ctx.fillStyle = owner ? COL[owner] : '#d9a516'; ctx.beginPath(); ctx.moveTo(x, base - S * 1.12); ctx.lineTo(x + S * 0.22, base - S * 1.05); ctx.lineTo(x, base - S * 0.98); ctx.closePath(); ctx.fill();
          break;
        }
        case 'village': { // three huts
          shadow(S * 0.6);
          for (const [dx, sc] of [[-0.4, 0.8], [0.35, 0.9], [0, 1]]) {
            const hx = x + dx * S, h = S * 0.3 * sc, w = S * 0.34 * sc, by = base - (dx === 0 ? 0 : S * 0.04);
            ctx.fillStyle = '#f1e4c8'; ctx.strokeStyle = '#5a4324'; ctx.beginPath(); ctx.rect(hx - w / 2, by - h, w, h); ctx.fill(); ctx.stroke();
            ctx.fillStyle = roof; ctx.beginPath(); ctx.moveTo(hx - w * 0.65, by - h); ctx.lineTo(hx, by - h - h * 0.9); ctx.lineTo(hx + w * 0.65, by - h); ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#5a4324'; ctx.beginPath(); ctx.roundRect(hx - w * 0.12, by - h * 0.55, w * 0.24, h * 0.55, [w * 0.12, w * 0.12, 0, 0]); ctx.fill();
          }
          break;
        }
        case 'watchtower': { // a tall wooden tower on legs with a lookout
          shadow(S * 0.35);
          ctx.strokeStyle = wood; ctx.lineWidth = Math.max(2, S * 0.07);
          ctx.beginPath(); ctx.moveTo(x - S * 0.22, base); ctx.lineTo(x - S * 0.14, base - S * 0.7); ctx.moveTo(x + S * 0.22, base); ctx.lineTo(x + S * 0.14, base - S * 0.7); ctx.moveTo(x - S * 0.2, base - S * 0.35); ctx.lineTo(x + S * 0.2, base - S * 0.35); ctx.stroke();
          ctx.fillStyle = '#9c6a34'; ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.rect(x - S * 0.28, base - S * 0.95, S * 0.56, S * 0.28); ctx.fill(); ctx.stroke();
          ctx.fillStyle = roof; ctx.beginPath(); ctx.moveTo(x - S * 0.34, base - S * 0.95); ctx.lineTo(x, base - S * 1.2); ctx.lineTo(x + S * 0.34, base - S * 0.95); ctx.closePath(); ctx.fill(); ctx.stroke();
          break;
        }
        case 'mine': { // a mine entrance in a rock with props and a cart
          shadow(S * 0.6);
          ctx.fillStyle = stone; ctx.strokeStyle = stoneDark; ctx.beginPath(); ctx.moveTo(x - S * 0.6, base); ctx.lineTo(x - S * 0.4, base - S * 0.5); ctx.lineTo(x, base - S * 0.68); ctx.lineTo(x + S * 0.4, base - S * 0.48); ctx.lineTo(x + S * 0.6, base); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#2a1e10'; ctx.beginPath(); ctx.roundRect(x - S * 0.18, base - S * 0.36, S * 0.36, S * 0.36, [S * 0.18, S * 0.18, 0, 0]); ctx.fill();
          ctx.strokeStyle = wood; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x - S * 0.22, base); ctx.lineTo(x - S * 0.22, base - S * 0.36); ctx.moveTo(x + S * 0.22, base); ctx.lineTo(x + S * 0.22, base - S * 0.36); ctx.moveTo(x - S * 0.26, base - S * 0.36); ctx.lineTo(x + S * 0.26, base - S * 0.36); ctx.stroke();
          ctx.fillStyle = roof; ctx.strokeStyle = '#3a2a12'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x + S * 0.3, base - S * 0.2); ctx.lineTo(x + S * 0.58, base - S * 0.2); ctx.lineTo(x + S * 0.52, base); ctx.lineTo(x + S * 0.36, base); ctx.closePath(); ctx.fill(); ctx.stroke();
          break;
        }
        case 'shrine': { // a stone altar with an obelisk and a glowing gem
          shadow(S * 0.45);
          ctx.fillStyle = stone; ctx.strokeStyle = stoneDark; ctx.beginPath(); ctx.rect(x - S * 0.42, base - S * 0.14, S * 0.84, S * 0.14); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.rect(x - S * 0.3, base - S * 0.26, S * 0.6, S * 0.12); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x - S * 0.12, base - S * 0.26); ctx.lineTo(x - S * 0.08, base - S * 0.95); ctx.lineTo(x + S * 0.08, base - S * 0.95); ctx.lineTo(x + S * 0.12, base - S * 0.26); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.fillStyle = owner ? COL[owner + 'Light'] : '#ffe27a'; ctx.beginPath(); ctx.moveTo(x, base - S * 1.12); ctx.lineTo(x + S * 0.1, base - S * 1.0); ctx.lineTo(x, base - S * 0.88); ctx.lineTo(x - S * 0.1, base - S * 1.0); ctx.closePath(); ctx.fill(); ctx.stroke();
          break;
        }
        case 'workshop': { // a forge: stone building with a chimney, a glowing furnace and an anvil
          shadow(S * 0.55);
          ctx.fillStyle = '#8f7a5a'; ctx.strokeStyle = '#4a3a22'; ctx.beginPath(); ctx.rect(x - S * 0.5, base - S * 0.45, S * 1.0, S * 0.45); ctx.fill(); ctx.stroke();
          ctx.fillStyle = roof; ctx.beginPath(); ctx.moveTo(x - S * 0.56, base - S * 0.45); ctx.lineTo(x - S * 0.1, base - S * 0.78); ctx.lineTo(x + S * 0.56, base - S * 0.45); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.fillStyle = stoneDark; ctx.beginPath(); ctx.rect(x + S * 0.22, base - S * 0.9, S * 0.14, S * 0.4); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#ff9a3a'; ctx.beginPath(); ctx.roundRect(x - S * 0.12, base - S * 0.3, S * 0.24, S * 0.3, [S * 0.1, S * 0.1, 0, 0]); ctx.fill();
          ctx.fillStyle = '#3a3a40'; ctx.beginPath(); ctx.moveTo(x - S * 0.5, base - S * 0.02); ctx.lineTo(x - S * 0.18, base - S * 0.02); ctx.lineTo(x - S * 0.22, base - S * 0.14); ctx.lineTo(x - S * 0.46, base - S * 0.14); ctx.closePath(); ctx.fill();
          break;
        }
        case 'scout_camp': { // two tents and a campfire
          shadow(S * 0.6);
          for (const [dx, sc] of [[-0.38, 0.9], [0.38, 0.8]]) {
            const tx = x + dx * S, h = S * 0.42 * sc, w = S * 0.46 * sc;
            ctx.fillStyle = roof; ctx.strokeStyle = '#3a2a12'; ctx.beginPath(); ctx.moveTo(tx - w / 2, base); ctx.lineTo(tx, base - h); ctx.lineTo(tx + w / 2, base); ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#3a2a12'; ctx.beginPath(); ctx.moveTo(tx, base - h * 0.45); ctx.lineTo(tx - w * 0.14, base); ctx.lineTo(tx + w * 0.14, base); ctx.closePath(); ctx.fill();
          }
          ctx.strokeStyle = wood; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - S * 0.12, base - S * 0.02); ctx.lineTo(x + S * 0.12, base - S * 0.14); ctx.moveTo(x + S * 0.12, base - S * 0.02); ctx.lineTo(x - S * 0.12, base - S * 0.14); ctx.stroke();
          ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.moveTo(x - S * 0.09, base - S * 0.1); ctx.quadraticCurveTo(x - S * 0.04, base - S * 0.3, x, base - S * 0.4); ctx.quadraticCurveTo(x + S * 0.06, base - S * 0.28, x + S * 0.09, base - S * 0.1); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#ffe27a'; ctx.beginPath(); ctx.moveTo(x - S * 0.04, base - S * 0.1); ctx.quadraticCurveTo(x, base - S * 0.22, x + S * 0.01, base - S * 0.3); ctx.quadraticCurveTo(x + S * 0.03, base - S * 0.2, x + S * 0.04, base - S * 0.1); ctx.closePath(); ctx.fill();
          break;
        }
        case 'war_banner': { // a tall standard with a swallow-tailed flag on a stone base
          shadow(S * 0.35);
          ctx.fillStyle = stone; ctx.strokeStyle = stoneDark; ctx.beginPath(); ctx.rect(x - S * 0.22, base - S * 0.12, S * 0.44, S * 0.12); ctx.fill(); ctx.stroke();
          ctx.strokeStyle = '#3b2a14'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, base - S * 0.12); ctx.lineTo(x, base - S * 1.15); ctx.stroke();
          ctx.fillStyle = roof; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, base - S * 1.12); ctx.lineTo(x + S * 0.56, base - S * 1.04); ctx.lineTo(x + S * 0.42, base - S * 0.82); ctx.lineTo(x + S * 0.56, base - S * 0.6); ctx.lineTo(x, base - S * 0.52); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#ffe14a'; ctx.beginPath(); ctx.arc(x, base - S * 1.18, S * 0.06, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case 'portal': { // a stone arch with a glowing gate
          shadow(S * 0.5);
          ctx.fillStyle = owner ? COL[owner + 'Light'] : '#b28cff'; ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.ellipse(x, base - S * 0.36, S * 0.24, S * 0.36, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
          ctx.strokeStyle = stoneDark; ctx.fillStyle = stone; ctx.lineWidth = 1.5;
          for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.rect(x + sgn * S * 0.3 - S * 0.09, base - S * 0.62, S * 0.18, S * 0.62); ctx.fill(); ctx.stroke(); }
          ctx.beginPath(); ctx.moveTo(x - S * 0.4, base - S * 0.62); ctx.quadraticCurveTo(x, base - S * 1.1, x + S * 0.4, base - S * 0.62); ctx.lineTo(x + S * 0.24, base - S * 0.62); ctx.quadraticCurveTo(x, base - S * 0.9, x - S * 0.24, base - S * 0.62); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#ffe27a'; ctx.beginPath(); ctx.arc(x, base - S * 0.9, S * 0.05, 0, Math.PI * 2); ctx.fill();
          break;
        }
        default: { // fence fallback
          ctx.strokeStyle = wood; ctx.lineWidth = Math.max(2, S * 0.06); ctx.lineCap = 'round';
          const fy = y + S * 0.72;
          ctx.beginPath(); ctx.moveTo(x - S * 0.62, fy); ctx.lineTo(x + S * 0.62, fy); ctx.stroke();
          for (let i = -3; i <= 3; i++) { const fx = x + i * S * 0.2; ctx.beginPath(); ctx.moveTo(fx, fy - S * 0.16); ctx.lineTo(fx, fy + S * 0.06); ctx.stroke(); }
          ctx.lineCap = 'butt';
        }
      }
      ctx.lineWidth = 1;
    }
    // ---- iteration2 (D-074): castles ------------------------------------------------------------------------
    // The castle stands on its hex like a building half sunk in the ground: the more its owner holds, the more of it
    // shows. The shown defence eases towards the board's current value, so the castle visibly rises as hexes flip to
    // its owner and sinks as they are lost; when it falls it sinks away completely.
    drawCastles(ctx, now) {
      const s = this.s, S = this.size;
      if (!s.castles) return;
      for (const pid of [1, 2]) {
        const c = s.castles[pid]; if (!c) continue;
        const cell = s.cells[hex.key(c.col, c.row)], gone = this.castleGone[pid];
        let sink = 0;
        if (gone && gone.t0 !== Infinity) { const k = (now - gone.t0) / gone.dur; if (k >= 1) continue; sink = k < 0.12 ? 0 : Math.pow((k - 0.12) / 0.88, 1.4); }
        else if (!gone && (!cell || cell.castle !== pid)) continue;
        let rise = 1; const r0 = this.castleRise[pid];
        if (r0 !== undefined) { if (now < r0) continue; const k = (now - r0) / 900; if (k >= 1) delete this.castleRise[pid]; else rise = 1 - Math.pow(1 - k, 3); }
        const target = this.shownDefense(pid);
        let d = this.castleShown[pid]; if (d === undefined) d = target;
        const step = target - d;
        d = Math.abs(step) > 0.05 ? d + step * 0.08 : target;
        this.castleShown[pid] = d;
        const p = this.cellXY(c.col, c.row);
        if (Math.abs(step) > 0.8 && now - (this.castleDust[pid] || 0) > 240) { this.castleDust[pid] = now; this.spawnDust(p.x, p.y + S * 0.05, 2); } // grinding stone
        const level = Math.max(0, Math.min(1, (d - CFG.CASTLE_BASE) / 48));
        let x = p.x;
        const sh = now - this.castleShake[pid];
        if (sh >= 0 && sh < 420) x += Math.sin(sh / 16) * S * 0.1 * (1 - sh / 420);
        if (sink > 0) x += Math.sin(now / 22) * S * 0.035 * (1 - sink);
        this.drawCastle(ctx, pid, x, p.y, (0.5 + 0.5 * level) * rise * (1 - sink), level, now);
      }
    }
    drawCastle(ctx, pid, x, y, vis, level, now) {
      // the castle fills the back of its hex: towers stand out on both sides of a warband inside it
      const S = this.size, base = y + S * 0.16, H = S * 1.55, off = (1 - vis) * H;
      const stone = '#bdb5a7', stoneDark = '#6f675c', stoneLight = '#dcd5c7', roof = COL[pid], roofDark = COL[pid + 'Dark'], light = COL[pid + 'Light'];
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(x, base + S * 0.04, S * 0.95, S * 0.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.save();
      ctx.beginPath(); ctx.rect(x - S * 1.4, base - H - S * 1.5, S * 2.8, H + S * 1.5 + S * 0.02); ctx.clip(); // nothing shows below the ground line
      ctx.translate(0, off);
      ctx.lineJoin = 'round'; ctx.lineWidth = 1.5;
      const box = (x0, y0, w, h, fill) => { ctx.fillStyle = fill || stone; ctx.strokeStyle = stoneDark; ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.fill(); ctx.stroke(); };
      const merlons = (x0, w, top, n) => { const mw = w / (2 * n - 1); for (let i = 0; i < n; i++) box(x0 + i * 2 * mw, top - S * 0.12, mw, S * 0.12); };
      const pennant = (px, py, sc) => {
        const wave = Math.sin(now / 240 + px) * S * 0.03 * sc;
        ctx.strokeStyle = '#3b2a14'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - S * 0.3 * sc); ctx.stroke();
        ctx.fillStyle = roof; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(px, py - S * 0.3 * sc); ctx.quadraticCurveTo(px + S * 0.15 * sc, py - S * 0.3 * sc - wave, px + S * 0.3 * sc, py - S * 0.22 * sc + wave); ctx.lineTo(px, py - S * 0.14 * sc); ctx.closePath(); ctx.fill(); ctx.stroke();
      };
      // keep behind the wall
      box(x - S * 0.3, base - S * 1.28, S * 0.6, S * 0.8, stoneLight);
      merlons(x - S * 0.3, S * 0.6, base - S * 1.28, 3);
      ctx.fillStyle = '#2d2418'; for (const wx of [-0.12, 0.12]) { ctx.beginPath(); ctx.roundRect(x + wx * S - S * 0.04, base - S * 1.1, S * 0.08, S * 0.16, [S * 0.04, S * 0.04, 0, 0]); ctx.fill(); }
      // curtain wall with battlements and courses of stone
      box(x - S * 0.62, base - S * 0.62, S * 1.24, S * 0.62);
      merlons(x - S * 0.62, S * 1.24, base - S * 0.62, 7);
      ctx.strokeStyle = 'rgba(80,70,60,0.35)'; ctx.lineWidth = 1;
      for (const ly of [0.2, 0.41]) { ctx.beginPath(); ctx.moveTo(x - S * 0.62, base - S * ly); ctx.lineTo(x + S * 0.62, base - S * ly); ctx.stroke(); }
      ctx.lineWidth = 1.5;
      // side towers with pointed roofs in the owner's colour and pennants
      for (const sg of [-1, 1]) {
        const tx = x + sg * S * 0.74, tw = S * 0.4, th = S * 1.02;
        box(tx - tw / 2, base - th, tw, th);
        ctx.strokeStyle = 'rgba(80,70,60,0.35)'; ctx.lineWidth = 1; for (const ly of [0.3, 0.6]) { ctx.beginPath(); ctx.moveTo(tx - tw / 2, base - S * ly); ctx.lineTo(tx + tw / 2, base - S * ly); ctx.stroke(); } ctx.lineWidth = 1.5;
        ctx.fillStyle = roof; ctx.strokeStyle = roofDark; ctx.beginPath(); ctx.moveTo(tx - tw * 0.66, base - th); ctx.lineTo(tx, base - th - S * 0.5); ctx.lineTo(tx + tw * 0.66, base - th); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#2d2418'; ctx.beginPath(); ctx.roundRect(tx - S * 0.05, base - th + S * 0.18, S * 0.1, S * 0.17, [S * 0.05, S * 0.05, 0, 0]); ctx.fill();
        pennant(tx, base - th - S * 0.48, 1);
        if (level >= 0.35) { // a richer realm hangs banners from the towers
          const bx = tx, by = base - th + S * 0.42;
          ctx.fillStyle = roof; ctx.strokeStyle = roofDark; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(bx - S * 0.1, by); ctx.lineTo(bx + S * 0.1, by); ctx.lineTo(bx + S * 0.1, by + S * 0.34); ctx.lineTo(bx, by + S * 0.26); ctx.lineTo(bx - S * 0.1, by + S * 0.34); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.fillStyle = light; ctx.beginPath(); ctx.arc(bx, by + S * 0.12, S * 0.04, 0, Math.PI * 2); ctx.fill();
          ctx.lineWidth = 1.5;
        }
      }
      // gate with a portcullis
      ctx.fillStyle = '#2a2016'; ctx.beginPath(); ctx.roundRect(x - S * 0.16, base - S * 0.4, S * 0.32, S * 0.4, [S * 0.16, S * 0.16, 0, 0]); ctx.fill();
      ctx.strokeStyle = 'rgba(200,190,170,0.5)'; ctx.lineWidth = 1;
      for (const gx of [-0.08, 0, 0.08]) { ctx.beginPath(); ctx.moveTo(x + gx * S, base - S * 0.34); ctx.lineTo(x + gx * S, base); ctx.stroke(); }
      if (level >= 0.75) { ctx.fillStyle = '#ffd45a'; ctx.strokeStyle = '#8a6208'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, base - S * 0.9, S * 0.08, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); } // gold crest
      ctx.restore();
      // the earth it stands in: a rim of dirt round the foot
      ctx.fillStyle = '#6b5433'; ctx.beginPath(); ctx.ellipse(x, base + S * 0.01, S * 0.95, S * 0.08, 0, 0, Math.PI); ctx.fill();
    }
    // defence plaque under each castle; while an attack on the castle is being aimed, what it would do
    drawCastlePlaques(ctx, now) {
      const s = this.s, S = this.size, fc = this.forecast;
      if (!s.castles) return;
      for (const pid of [1, 2]) {
        const c = s.castles[pid], cell = c && s.cells[hex.key(c.col, c.row)];
        if (!cell || cell.castle !== pid || this.castleGone[pid]) continue;
        if (this.castleRise[pid] !== undefined && now < this.castleRise[pid]) continue;
        const p = this.cellXY(c.col, c.row), w = s.players[pid].warband;
        const inside = !w.dead && w.col === c.col && w.row === c.row && !this.hideWb[pid];
        const aimed = fc && fc.d === pid ? fc : null;
        if (inside && aimed && aimed.kind !== 'castle') continue; // the warband's own forecast is what counts there
        const def = Math.round(this.castleShown[pid] != null ? this.castleShown[pid] : R.defense(s, pid));
        // on the castle wall when the castle is empty; beside the warband's feet when it stands inside
        const shot = aimed && aimed.kind === 'castle' ? aimed : null;
        const cx = p.x + (inside ? S * 0.55 : 0), cy = inside ? p.y + S * 0.66 : p.y - S * 0.02;
        const fs = Math.round(S * 0.3); ctx.font = `900 ${fs}px system-ui, sans-serif`;
        const txt = shot ? `${def} → ${shot.defAfter}` : String(def), bw = ctx.measureText(txt).width + S * 0.6, bh = S * 0.42, bx = cx - bw / 2;
        const pulse = 0.5 + 0.5 * Math.sin(now / 160);
        ctx.fillStyle = 'rgba(20,12,6,0.86)'; ctx.strokeStyle = shot && shot.falls ? `rgba(255,90,60,${0.6 + 0.4 * pulse})` : shot ? '#ffd766' : COL[pid + 'Light']; ctx.lineWidth = shot ? 3 : 2;
        ctx.beginPath(); ctx.roundRect(bx, cy - bh / 2, bw, bh, bh / 2); ctx.fill(); ctx.stroke();
        const ix = bx + S * 0.22, r = S * 0.13; // shield icon
        ctx.fillStyle = COL[pid + 'Light']; ctx.beginPath(); ctx.moveTo(ix - r, cy - r * 0.85); ctx.lineTo(ix + r, cy - r * 0.85); ctx.lineTo(ix + r, cy + r * 0.1); ctx.quadraticCurveTo(ix + r, cy + r, ix, cy + r * 1.15); ctx.quadraticCurveTo(ix - r, cy + r, ix - r, cy + r * 0.1); ctx.closePath(); ctx.fill();
        ctx.fillStyle = shot && shot.falls ? '#ff8a76' : shot ? '#ffe9a8' : '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(txt, bx + S * 0.4, cy + 1);
        if (shot && shot.falls) { // the attack would take the castle
          ctx.font = `900 ${Math.round(S * 0.34)}px system-ui, sans-serif`; ctx.textAlign = 'center';
          ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(30,15,5,0.9)'; ctx.strokeText('FALLS!', cx, cy - bh * 0.95);
          ctx.fillStyle = `rgb(255,${Math.round(90 + 60 * pulse)},70)`; ctx.fillText('FALLS!', cx, cy - bh * 0.95);
        }
      }
    }
    warbandPos(p, now) {
      const g = this.ghostWb[p.id], sl = this.slide[p.id], end = g ? this.cellXY(g.col, g.row) : this.cellXY(p.warband.col, p.warband.row);
      if (!sl) return end;
      const k = Math.max(0, (now - sl.t0) / (sl.per * sl.path.length));
      if (k >= 1) { if (sl.hold) { const c = sl.path[sl.path.length - 1]; return this.cellXY(c.col, c.row); } this.slide[p.id] = null; return end; }
      const pts = sl.path.map(c => this.cellXY(c.col, c.row));
      const start = sl.start || (sl.start = pts.length >= 2 ? { x: pts[0].x - (pts[1].x - pts[0].x), y: pts[0].y - (pts[1].y - pts[0].y) } : { x: pts[0].x, y: pts[0].y + this.size });
      const all = [start].concat(pts);
      const seg = Math.min(all.length - 2, Math.floor(k * (all.length - 1))), f = k * (all.length - 1) - seg;
      const a = all[seg], b = all[seg + 1];
      let y = a.y + (b.y - a.y) * f;
      const hop = Math.abs(Math.sin(f * Math.PI)) * this.size * (sl.blink ? 0.8 : 0.12);
      return { x: a.x + (b.x - a.x) * f, y: y - hop };
    }
    drawWarband(ctx, p, now) {
      // D-064: not on the board yet during the match intro; iteration2: a destroyed warband is gone until it gathers
      // again — but it is still drawn (as a ghost) until its rout plays
      const ghost = this.ghostWb[p.id];
      if (!ghost && (this.hideWb[p.id] || p.warband.dead)) { this.crowdN[p.id] = undefined; return; }
      const S = this.size, w = p.warband, pos = this.warbandPos(p, now);
      const minions = this.minShown[p.id] != null ? this.minShown[p.id] : w.minions;
      let x = pos.x, y = pos.y;
      const sh = now - this.shake[p.id];
      if (sh < 350) x += Math.sin(sh / 18) * S * 0.12 * (1 - sh / 350);
      const color = COL[p.id], light = COL[p.id + 'Light'], dark = COL[p.id + 'Dark'];
      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(x, y + S * 0.3, S * 0.55, S * 0.22, 0, 0, Math.PI * 2); ctx.fill();
      // crowd
      const n = Math.min(Math.max(1, Math.ceil(minions / 4)), 7);
      const slots = [[0, 0.2], [-0.36, 0.06], [0.36, 0.06], [-0.18, -0.16], [0.18, -0.16], [-0.5, -0.24], [0.5, -0.24]];
      // iteration2: when the crowd shrinks, the figures that are no longer there run off and fade
      const prevN = this.crowdN[p.id];
      if (prevN !== undefined && n < prevN) for (let i = n; i < prevN; i++) {
        const o = slots[i], a = Math.atan2(o[1] - 0.02, o[0] || (Math.random() - 0.5)) + (Math.random() - 0.5) * 0.8, d = S * (0.9 + Math.random() * 0.5);
        const x0 = x + o[0] * S, y0 = y + o[1] * S;
        this.fx.push({ type: 'flee', pid: p.id, x0, y0, x1: x0 + Math.cos(a) * d, y1: y0 + Math.sin(a) * d * 0.75, t0: now + (i - n) * 50, dur: 750, seed: i });
      }
      this.crowdN[p.id] = n;
      const list = slots.slice(0, n).map((o, i) => ({ dx: o[0] * S, dy: o[1] * S, i })).sort((u, v) => u.dy - v.dy);
      const bob = k => Math.sin(now / 260 + k * 1.7) * S * 0.02;
      for (const m of list) {
        const mx = x + m.dx, my = y + m.dy + bob(m.i), r = S * 0.2;
        if (m.i % 2 === 0) { ctx.strokeStyle = '#4a3218'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(mx + r * 0.9, my); ctx.lineTo(mx + r * 1.4, my - r * 2.6); ctx.stroke(); ctx.fillStyle = '#d8dbe3'; ctx.beginPath(); ctx.moveTo(mx + r * 1.4, my - r * 3.1); ctx.lineTo(mx + r * 1.1, my - r * 2.5); ctx.lineTo(mx + r * 1.7, my - r * 2.5); ctx.closePath(); ctx.fill(); }
        ctx.fillStyle = color; ctx.strokeStyle = dark; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(mx, my, r * 1.05, r * 0.9, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();      // body
        ctx.fillStyle = light; ctx.beginPath(); ctx.arc(mx, my - r * 1.1, r * 0.85, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); // head
        ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(mx, my - r * 1.2, r * 0.9, Math.PI, 0); ctx.closePath(); ctx.fill();      // helmet
        ctx.fillStyle = '#ffe14a'; ctx.beginPath(); ctx.arc(mx - r * 0.3, my - r * 0.95, r * 0.17, 0, Math.PI * 2); ctx.arc(mx + r * 0.3, my - r * 0.95, r * 0.17, 0, Math.PI * 2); ctx.fill(); // eyes
        if (m.i % 3 === 1) { ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(mx - r * 0.9, my + r * 0.1, r * 0.55, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = light; ctx.lineWidth = 1; ctx.stroke(); } // shield
      }
      // D-057: active buffs — an aura around the crowd and badges beside the banner pole
      const boosted = p.status.attackBonus > 0, formed = R.active(this.s, p.status.formationUntil);
      if (boosted || formed) {
        const glow = 0.5 + 0.5 * Math.sin(now / 220);
        ctx.strokeStyle = boosted ? `rgba(255,179,71,${0.55 + 0.35 * glow})` : `rgba(159,208,255,${0.55 + 0.35 * glow})`; ctx.lineWidth = boosted ? 3 : 4;
        if (formed && !boosted) ctx.setLineDash([S * 0.16, S * 0.08]);
        ctx.beginPath(); ctx.ellipse(x, y + S * 0.05, S * 0.72 + glow * S * 0.05, S * 0.56 + glow * S * 0.04, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      }
      // banner: only the minion count (D-047); it bumps when reinforcements arrive
      const bumpK = (now - this.bump[p.id]) / 380;
      let bumpSc = bumpK >= 0 && bumpK < 1 ? 1 + 0.35 * Math.sin(bumpK * Math.PI) : 1;
      // iteration2: after a clash the bigger warband's number swells, holds for a moment and settles
      const bb = (now - (this.bigBump[p.id] || -1e9)) / 1100, big = bb >= 0 && bb < 1;
      if (big) bumpSc = 1 + 0.75 * (bb < 0.2 ? easeOutBack(bb / 0.2) : bb < 0.65 ? 1 : 1 - (bb - 0.65) / 0.35);
      // D-064: during the intro the banner rises from the crowd and the count climbs from 0
      const rk = this.raise[p.id] ? Math.min(1, Math.max(0, (now - this.raise[p.id]) / 500)) : 1, rise = rk < 1 ? easeOutBack(rk) : 1;
      const px = x + S * 0.05, top = y - S * 0.2 - S * 1.4 * rise;
      ctx.strokeStyle = '#3b2a14'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(px, y - S * 0.2); ctx.lineTo(px, top); ctx.stroke();
      let shown = minions;
      const ca = this.countAnim[p.id];
      if (ca) { const ck = (now - ca.t0) / ca.dur; if (ck >= 1) delete this.countAnim[p.id]; else shown = Math.round(ca.from + (ca.to - ca.from) * (ck < 0 ? 0 : 1 - Math.pow(1 - ck, 2))); }
      const txt = String(shown), fs = Math.round(S * 0.44);
      ctx.font = `900 ${fs}px system-ui, sans-serif`;
      const fw = Math.max(S * 0.9, ctx.measureText(txt).width + S * 0.5), fh = S * 0.56;
      ctx.save(); ctx.translate(px, top + fh * 0.54); ctx.scale(bumpSc, bumpSc); ctx.translate(-px, -(top + fh * 0.54));
      if (big) { ctx.shadowColor = '#ffd45a'; ctx.shadowBlur = S * 0.5; }
      ctx.fillStyle = color; ctx.strokeStyle = big ? '#ffd45a' : bumpSc > 1 ? '#9cff8a' : '#fff'; ctx.lineWidth = big ? 3 : 2;
      ctx.beginPath(); ctx.moveTo(px, top); ctx.lineTo(px + fw, top + fh * 0.08); ctx.lineTo(px + fw - S * 0.13, top + fh * 0.54); ctx.lineTo(px + fw, top + fh); ctx.lineTo(px, top + fh + fh * 0.08); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, px + fw / 2 - S * 0.05, top + fh * 0.54);
      ctx.restore();
      // badges: sword +N (Battle Cry) and shield −N (Formation) to the left of the pole, popping in when gained
      let by = top + fh * 0.1;
      const badge = (kind, text, bg, drawIcon) => {
        const bk = (now - (this.badgePop[p.id + kind] || -1e9)) / 380, bsc = bk >= 0 && bk < 1 ? easeOutBack(bk) : 1;
        const bs = Math.round(S * 0.3); ctx.font = `900 ${bs}px system-ui, sans-serif`;
        const bw = ctx.measureText(text).width + S * 0.62, bh = S * 0.44, bx = px - S * 0.12 - bw, cy = by + bh / 2;
        ctx.save(); ctx.translate(bx + bw / 2, cy); ctx.scale(bsc, bsc); ctx.translate(-(bx + bw / 2), -cy);
        ctx.fillStyle = bg; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, bh / 2); ctx.fill(); ctx.stroke();
        drawIcon(bx + S * 0.25, cy, S * 0.15);
        ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(text, bx + S * 0.45, cy + 1);
        ctx.restore();
        by += bh + S * 0.06;
      };
      if (boosted) badge('attack', `+${p.status.attackBonus}`, '#d9541e', (ix, iy, r) => { // sword
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(ix - r, iy + r); ctx.lineTo(ix + r * 0.9, iy - r * 0.9); ctx.stroke();
        ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ix - r * 0.9, iy + r * 0.1); ctx.lineTo(ix - r * 0.1, iy + r * 0.9); ctx.stroke();
      });
      if (formed) badge('formation', `−${CFG.FORMATION_REDUCE}`, '#3f6fa3', (ix, iy, r) => { // shield
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(ix - r, iy - r * 0.8); ctx.lineTo(ix + r, iy - r * 0.8); ctx.lineTo(ix + r, iy + r * 0.2); ctx.quadraticCurveTo(ix + r, iy + r, ix, iy + r * 1.1); ctx.quadraticCurveTo(ix - r, iy + r, ix - r, iy + r * 0.2); ctx.closePath(); ctx.fill();
      });
      // battle forecast (D-047): predicted losses of both warbands while an attacking route is being chosen
      const fc = this.forecast;
      if (fc && !ghost && (fc.kind === 'castle' ? fc.a === p.id && fc.dmgToAtt > 0 : fc.a === p.id || fc.d === p.id)) { // D-077: at a castle only the attacker's loss
        const mine = fc.a === p.id, loss = mine ? fc.dmgToAtt : fc.dmgToDef, after = mine ? fc.aAfter : fc.dAfter;
        if (!(mine && loss === 0)) {
          const t = `−${loss} → ${after}`, bs = Math.round(S * 0.3);
          ctx.font = `900 ${bs}px system-ui, sans-serif`;
          const bw = ctx.measureText(t).width + S * 0.4, bh = S * 0.42, bx = x - bw / 2, by = y + S * 0.42;
          ctx.fillStyle = 'rgba(20,12,6,0.88)'; ctx.strokeStyle = after <= 0 ? '#ff5a3c' : '#ffd766'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, bh / 2); ctx.fill(); ctx.stroke();
          ctx.fillStyle = after <= 0 ? '#ff8a76' : '#ffe9a8'; ctx.fillText(t, x, by + bh / 2 + 1);
        }
      }
      if (p.id === this.s.current && this.s.phase === 'play' && !ghost) {
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.ellipse(x, y + S * 0.05, S * 0.78, S * 0.62, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      }
    }
  }
  HB.Renderer = Renderer;
})();
