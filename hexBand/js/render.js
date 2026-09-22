// Canvas renderer: stylised board (grass, trees, rocks), territory with outlined borders, outposts with a floating
// reward card, minion crowds with banners, highlights and lightweight animations (GDD §24–27, D-027).
window.HB = window.HB || {};
(function () {
  const hex = HB.hex, CFG = HB.CONFIG, POIS = HB.cards.POIS, CARDS = HB.cards.CARDS, R = HB.rules;
  const COL = CFG.COLORS;
  const hash = (a, b, c) => { let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 1597334677)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  // flat-top hex: the edge that faces neighbour direction d runs between these two corners (corner i at 60·i degrees)
  const EDGE = [[4, 5], [5, 0], [0, 1], [1, 2], [2, 3], [3, 4]];

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d');
      this.s = null; this.size = 30; this.offset = { x: 0, y: 0 }; this.dpr = 1;
      this.highlights = []; this.texts = []; this.flash = {}; this.shake = { 1: 0, 2: 0 }; this.slide = { 1: null, 2: null };
      this.timeline = []; this.decor = {}; this.dropOK = false; this.dragging = false;
      requestAnimationFrame(t => this.frame(t));
    }
    setState(s) { this.s = s; this.highlights = []; this.texts = []; this.flash = {}; this.timeline = []; this.slide = { 1: null, 2: null }; this.buildDecor(); }
    buildDecor() {
      const s = this.s; this.decor = {};
      const reserved = new Set();
      for (const pid of [1, 2]) { const st = CFG.START[pid]; reserved.add(hex.key(st.col, st.row)); for (let d = 0; d < 6; d++) { const n = hex.neighbor(st.col, st.row, d); reserved.add(hex.key(n.col, n.row)); } }
      for (const k in s.cells) {
        const c = s.cells[k];
        if (c.poi >= 0 || reserved.has(k)) continue;
        const r = hash(s.decorSeed, c.col * 7 + 1, c.row * 13 + 3);
        if (r < 0.17) {
          const n = 1 + Math.floor(hash(s.decorSeed, c.col, c.row + 50) * 3), items = [];
          for (let i = 0; i < n; i++) items.push({ dx: (hash(s.decorSeed, c.col + 100 * i, c.row) - 0.5) * 0.7, dy: (hash(s.decorSeed, c.col, c.row + 100 * i + 7) - 0.5) * 0.5, sc: 0.75 + hash(s.decorSeed, c.col + 3, c.row + 9 + i) * 0.5 });
          this.decor[k] = { type: 'trees', items };
        } else if (r < 0.25) {
          this.decor[k] = { type: 'rock', dx: (hash(s.decorSeed, c.col + 5, c.row) - 0.5) * 0.5, dy: (hash(s.decorSeed, c.col, c.row + 5) - 0.5) * 0.4, sc: 0.7 + hash(s.decorSeed, c.col + 9, c.row + 9) * 0.6 };
        }
      }
    }
    resize(w, h) {
      const s = this.s; if (!s) return;
      // D-035: the board takes the whole width; only a small top margin is kept for the banner of a warband on row 0
      const size = Math.floor(Math.min(w / (1.5 * (s.cols - 1) + 2), h / (hex.SQRT3 * s.rows + 0.7)));
      this.size = Math.max(10, size);
      const b = hex.boardSize(s.cols, s.rows, this.size);
      this.dpr = window.devicePixelRatio || 1;
      this.canvas.width = Math.round(w * this.dpr); this.canvas.height = Math.round(h * this.dpr);
      this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
      this.offset = { x: (w - b.w) / 2, y: (h - b.h) / 2 + this.size * 0.35 };
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
      this.texts.push({ x: p.x, y: p.y + (opts.dy || 0), text, color: color || '#fff', t0: performance.now(), dur: opts.dur || 1100, big: !!opts.big });
    }
    flashCell(col, row, color, dur) { this.flash[hex.key(col, row)] = { t0: performance.now(), dur: dur || 500, color: color || '#fff' }; }

    applyEvents(events) {
      let t = 0;
      for (const ev of events) {
        const light = ev.player ? COL[ev.player + 'Light'] : '#fff';
        switch (ev.type) {
          case 'move': {
            const per = ev.blink ? 260 : 190, pid = ev.player, path = ev.path.slice();
            const from = this.prevPos ? this.prevPos[pid] : null;
            const start = from ? this.cellXY(from.col, from.row) : null;
            this.schedule(t, () => { this.slide[pid] = { path, t0: performance.now(), per, blink: ev.blink, start }; });
            if (this.prevPos) this.prevPos[pid] = path[path.length - 1];
            t += per * path.length;
            break;
          }
          case 'paint':
            ev.cells.forEach((c, i) => this.schedule(Math.max(0, t - 190 * (ev.cells.length - i)), () => this.flashCell(c.col, c.row, '#ffffff', 450)));
            break;
          case 'fill': {
            const cells = ev.cells;
            cells.forEach((c, i) => this.schedule(t + 40 * i, () => this.flashCell(c.col, c.row, '#ffffff', 600)));
            const mid = cells[Math.floor(cells.length / 2)];
            this.schedule(t + 40 * cells.length, () => this.addText(mid.col, mid.row, `+${ev.count} территории`, light, { big: true, dur: 1500 }));
            t += 40 * cells.length + 200;
            break;
          }
          case 'poi':
            this.schedule(t, () => { this.flashCell(ev.col, ev.row, '#ffe27a', 800); this.addText(ev.col, ev.row, 'Точка захвачена!', '#ffe27a', { dy: -this.size * 1.9, dur: 1600, big: true }); });
            t += 250;
            break;
          case 'attack': {
            const col = ev.col, row = ev.row, def = ev.defender;
            this.schedule(t, () => {
              this.shake[def] = performance.now();
              const label = ev.overwatch ? 'ДОЗОР' : ev.counter ? 'ОТВЕТНЫЙ УДАР' : '';
              if (label) this.addText(col, row, label, '#ffd45a', { dy: -this.size * 1.9, big: true, dur: 1400 });
              this.addText(col, row, `−${ev.dmg}`, '#ff6b6b', { dy: -this.size * 0.6, big: true });
            });
            t += 500;
            break;
          }
          case 'explosion':
            this.schedule(t, () => { this.flashCell(ev.col, ev.row, '#ffb347', 700); if (ev.dmg) { this.shake[ev.defender] = performance.now(); this.addText(ev.col, ev.row, `−${ev.dmg}`, '#ff6b6b', { big: true }); } else this.addText(ev.col, ev.row, 'ЗАБЛОКИРОВАНО', '#ffb347'); });
            t += 400;
            break;
          case 'reinforce':
            this.schedule(t, () => this.addText(ev.col, ev.row, `+${ev.amount}`, '#9cff8a', { dy: -this.size * 1.7, big: true }));
            t += 300;
            break;
          case 'gameover': t += 400; break;
        }
      }
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
    draw(now) {
      const ctx = this.ctx, s = this.s, S = this.size;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      // grass
      for (const k in s.cells) {
        const c = s.cells[k], p = this.cellXY(c.col, c.row);
        this.hexPath(ctx, p.x, p.y, 0);
        ctx.fillStyle = hash(s.decorSeed, c.col, c.row) < 0.5 ? COL.grass : COL.grassAlt; ctx.fill();
        ctx.strokeStyle = COL.grassEdge; ctx.lineWidth = 2; ctx.stroke();
        // grass tufts
        ctx.strokeStyle = 'rgba(40,90,20,0.35)'; ctx.lineWidth = 1.5;
        for (let i = 0; i < 3; i++) { const tx = p.x + (hash(c.col, c.row, i + 20) - 0.5) * S * 1.1, ty = p.y + (hash(c.col, c.row, i + 40) - 0.5) * S * 1.2; ctx.beginPath(); ctx.moveTo(tx - 2, ty + 3); ctx.lineTo(tx, ty - 2); ctx.lineTo(tx + 2, ty + 3); ctx.stroke(); }
      }
      // territory
      for (const k in s.cells) {
        const c = s.cells[k]; if (!c.owner) continue;
        const p = this.cellXY(c.col, c.row);
        this.hexPath(ctx, p.x, p.y, 0); ctx.fillStyle = COL[c.owner]; ctx.globalAlpha = 0.92; ctx.fill(); ctx.globalAlpha = 1;
        ctx.strokeStyle = COL[c.owner + 'Dark']; ctx.lineWidth = 1.5; ctx.stroke();
      }
      // territory outline: edges between own cells and anything else
      for (const k in s.cells) {
        const c = s.cells[k]; if (!c.owner) continue;
        const p = this.cellXY(c.col, c.row), corners = hex.corners(p.x, p.y, S, 1.5);
        ctx.strokeStyle = COL[c.owner + 'Light']; ctx.lineWidth = 3; ctx.setLineDash([S * 0.22, S * 0.14]);
        for (let d = 0; d < 6; d++) {
          const n = hex.neighbor(c.col, c.row, d), nc = s.cells[hex.key(n.col, n.row)];
          if (nc && nc.owner === c.owner) continue;
          const [a, b] = EDGE[d];
          ctx.beginPath(); ctx.moveTo(corners[a].x, corners[a].y); ctx.lineTo(corners[b].x, corners[b].y); ctx.stroke();
        }
        ctx.setLineDash([]);
        if (c.bonus) { ctx.strokeStyle = 'rgba(255,226,122,0.95)'; ctx.lineWidth = 2; this.hexPath(ctx, p.x, p.y, 5); ctx.stroke(); }
      }
      // flashes, blocked, decorations
      for (const k in s.cells) {
        const c = s.cells[k], p = this.cellXY(c.col, c.row);
        const f = this.flash[k];
        if (f) {
          const a = 1 - (now - f.t0) / f.dur;
          if (a <= 0) delete this.flash[k]; else { ctx.fillStyle = f.color; ctx.globalAlpha = 0.65 * a; this.hexPath(ctx, p.x, p.y, 0); ctx.fill(); ctx.globalAlpha = 1; }
        }
        if (R.isBlocked(s, c)) {
          ctx.fillStyle = 'rgba(30,20,10,0.35)'; this.hexPath(ctx, p.x, p.y, 2); ctx.fill();
          ctx.strokeStyle = '#2a1a0a'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(p.x - S * 0.3, p.y - S * 0.3); ctx.lineTo(p.x + S * 0.3, p.y + S * 0.3); ctx.moveTo(p.x + S * 0.3, p.y - S * 0.3); ctx.lineTo(p.x - S * 0.3, p.y + S * 0.3); ctx.stroke();
        }
        const dec = this.decor[k];
        if (dec) {
          if (dec.type === 'rock') this.drawRock(ctx, p.x + dec.dx * S, p.y + dec.dy * S, S * 0.3 * dec.sc);
          else for (const t of dec.items) this.drawTree(ctx, p.x + t.dx * S, p.y + t.dy * S, S * 0.36 * t.sc);
        }
      }
      // highlights
      const pulse = 0.55 + 0.45 * Math.sin(now / 180);
      for (const h of this.highlights) {
        const p = this.cellXY(h.col, h.row);
        if (h.kind === 'path') {
          ctx.fillStyle = h.strong ? 'rgba(255,255,255,0.42)' : 'rgba(255,255,255,0.22)'; this.hexPath(ctx, p.x, p.y, 3); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2.5; ctx.setLineDash([S * 0.2, S * 0.12]); this.hexPath(ctx, p.x, p.y, 4); ctx.stroke(); ctx.setLineDash([]);
          if (h.label != null) { ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 4; ctx.font = `bold ${Math.round(S * 0.55)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.strokeText(String(h.label), p.x, p.y + 1); ctx.fillText(String(h.label), p.x, p.y + 1); }
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
      // warbands: draw the upper one first so overlapping banners read correctly
      const order = [1, 2].sort((a, b) => s.players[a].warband.row - s.players[b].warband.row);
      for (const pid of order) this.drawWarband(ctx, s.players[pid], now);
      // floating texts
      for (let i = this.texts.length - 1; i >= 0; i--) {
        const t = this.texts[i], k = (now - t.t0) / t.dur;
        if (k >= 1) { this.texts.splice(i, 1); continue; }
        ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
        ctx.font = `${t.big ? '900 ' : 'bold '}${Math.round(S * (t.big ? 0.6 : 0.46))}px system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(30,15,5,0.85)'; ctx.strokeText(t.text, t.x, t.y - k * S * 0.9);
        ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y - k * S * 0.9);
        ctx.globalAlpha = 1;
      }
    }
    drawTree(ctx, x, y, h) {
      ctx.fillStyle = '#5b3a1e'; ctx.fillRect(x - h * 0.08, y, h * 0.16, h * 0.35);
      const tri = (dy, w, hh, color) => { ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x, y - hh + dy); ctx.lineTo(x - w, y + dy); ctx.lineTo(x + w, y + dy); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#1f4d18'; ctx.lineWidth = 1; ctx.stroke(); };
      tri(0.05 * h, h * 0.5, h * 0.7, '#2f7a34'); tri(-0.35 * h, h * 0.4, h * 0.65, '#3a9440'); tri(-0.7 * h, h * 0.28, h * 0.55, '#49ad4c');
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
    drawOutpost(ctx, poi, now) {
      const S = this.size, p = this.cellXY(poi.col, poi.row), def = POIS[poi.type], x = p.x, y = p.y;
      const owner = poi.owner, teamCol = owner ? COL[owner] : '#8a6b3a';
      // fence: the landmark at the bottom of the hex (D-036)
      ctx.strokeStyle = '#7a4f22'; ctx.lineWidth = Math.max(2, S * 0.06); ctx.lineCap = 'round';
      const fy = y + S * 0.72;
      ctx.beginPath(); ctx.moveTo(x - S * 0.62, fy); ctx.lineTo(x + S * 0.62, fy); ctx.stroke();
      for (let i = -3; i <= 3; i++) { const fx = x + i * S * 0.2; ctx.beginPath(); ctx.moveTo(fx, fy - S * 0.16); ctx.lineTo(fx, fy + S * 0.06); ctx.stroke(); }
      ctx.lineCap = 'butt';
      // floating reward card, about a hex wide (D-036)
      const bob = Math.sin(now / 520 + poi.id) * S * 0.04, cw = S * 1.5, ch = S * 1.85, cx = x - cw / 2, cy = y - S * 1.25 + bob;
      if (owner) { ctx.shadowColor = COL[owner + 'Light']; ctx.shadowBlur = S * 0.4; }
      ctx.fillStyle = '#f7ead0'; ctx.strokeStyle = teamCol; ctx.lineWidth = owner ? 3 : 2;
      ctx.beginPath(); ctx.roundRect(cx, cy, cw, ch, S * 0.12); ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;
      // header with the outpost name
      ctx.fillStyle = owner ? teamCol : '#8a6b3a';
      ctx.beginPath(); ctx.roundRect(cx, cy, cw, ch * 0.2, [S * 0.12, S * 0.12, 0, 0]); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(S * 0.22)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(def.ru, x, cy + ch * 0.1 + 1, cw * 0.92);
      // reward icon + name
      const img = HB.icons.image(def.card, '#3a2a12'), isz = cw * 0.66;
      if (img.complete && img.naturalWidth) ctx.drawImage(img, x - isz / 2, cy + ch * 0.24, isz, isz);
      ctx.fillStyle = '#3a2a12'; ctx.font = `bold ${Math.round(S * 0.2)}px system-ui, sans-serif`;
      ctx.fillText(CARDS[def.card].ru, x, cy + ch * 0.88, cw * 0.92);
    }
    warbandPos(p, now) {
      const sl = this.slide[p.id], end = this.cellXY(p.warband.col, p.warband.row);
      if (!sl) return end;
      const k = Math.max(0, (now - sl.t0) / (sl.per * sl.path.length));
      if (k >= 1) { this.slide[p.id] = null; return end; }
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
      const S = this.size, w = p.warband, pos = this.warbandPos(p, now);
      let x = pos.x, y = pos.y;
      const sh = now - this.shake[p.id];
      if (sh < 350) x += Math.sin(sh / 18) * S * 0.12 * (1 - sh / 350);
      const color = COL[p.id], light = COL[p.id + 'Light'], dark = COL[p.id + 'Dark'];
      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(x, y + S * 0.3, S * 0.55, S * 0.22, 0, 0, Math.PI * 2); ctx.fill();
      // crowd
      const n = Math.min(Math.max(1, Math.ceil(w.minions / 4)), 7);
      const slots = [[0, 0.2], [-0.36, 0.06], [0.36, 0.06], [-0.18, -0.16], [0.18, -0.16], [-0.5, -0.24], [0.5, -0.24]];
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
      // banner
      const px = x + S * 0.05, top = y - S * 1.55;
      ctx.strokeStyle = '#3b2a14'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(px, y - S * 0.2); ctx.lineTo(px, top); ctx.stroke();
      const txt = String(w.minions), fs = Math.round(S * 0.42);
      ctx.font = `900 ${fs}px system-ui, sans-serif`;
      const fw = Math.max(S * 0.7, ctx.measureText(txt).width + S * 0.45), fh = S * 0.5;
      ctx.fillStyle = color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(px, top); ctx.lineTo(px + fw, top + fh * 0.1); ctx.lineTo(px + fw - S * 0.12, top + fh * 0.55); ctx.lineTo(px + fw, top + fh); ctx.lineTo(px, top + fh + fh * 0.1); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, px + fw / 2 - S * 0.04, top + fh * 0.55);
      if (p.id === this.s.current && this.s.phase === 'play') {
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.ellipse(x, y + S * 0.05, S * 0.78, S * 0.62, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      }
    }
  }
  HB.Renderer = Renderer;
})();
