// Canvas renderer: board, warbands, POIs, highlights and lightweight animations (GDD §24, §27).
window.HB = window.HB || {};
(function () {
  const hex = HB.hex, CFG = HB.CONFIG, POIS = HB.cards.POIS, R = HB.rules;
  const COL = CFG.COLORS;

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d');
      this.s = null; this.size = 30; this.offset = { x: 0, y: 0 }; this.dpr = 1;
      this.highlights = []; // { col,row, kind:'target'|'path'|'facing', label?, dir? }
      this.texts = [];      // floating texts
      this.flash = {};      // key -> { t0, dur, color }
      this.shake = { 1: 0, 2: 0 };
      this.slide = { 1: null, 2: null }; // { path, t0, per }
      this.timeline = [];   // { at, fn }
      this.now = 0; this.animOffset = 0;
      requestAnimationFrame(t => this.frame(t));
    }
    setState(s) { this.s = s; this.highlights = []; this.texts = []; this.flash = {}; this.timeline = []; this.slide = { 1: null, 2: null }; }
    resize(w, h) {
      const s = this.s; if (!s) return;
      const size = Math.floor(Math.min(w / (1.5 * (s.cols - 1) + 2), h / (hex.SQRT3 * s.rows)));
      this.size = Math.max(10, size);
      const b = hex.boardSize(s.cols, s.rows, this.size);
      this.dpr = window.devicePixelRatio || 1;
      this.canvas.width = Math.round(w * this.dpr); this.canvas.height = Math.round(h * this.dpr);
      this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
      this.offset = { x: (w - b.w) / 2, y: (h - b.h) / 2 };
    }
    cellXY(col, row) { const p = hex.pixel(col, row, this.size); return { x: p.x + this.offset.x, y: p.y + this.offset.y }; }
    cellFromPointer(clientX, clientY) {
      const r = this.canvas.getBoundingClientRect();
      return hex.pixelToCell(clientX - r.left - this.offset.x, clientY - r.top - this.offset.y, this.size, this.s.cols, this.s.rows);
    }

    // ---- animation helpers
    schedule(delay, fn) { this.timeline.push({ at: performance.now() + delay, fn }); }
    addText(col, row, text, color, opts) {
      opts = opts || {};
      const p = this.cellXY(col, row);
      this.texts.push({ x: p.x, y: p.y + (opts.dy || 0), text, color: color || '#fff', t0: performance.now(), dur: opts.dur || 1100, big: !!opts.big });
    }
    flashCell(col, row, color, dur) { this.flash[hex.key(col, row)] = { t0: performance.now(), dur: dur || 500, color: color || '#fff' }; }

    // Turns rule events into animations. Returns the total animation length in ms.
    applyEvents(events) {
      let t = 0;
      const s = this.s;
      for (const ev of events) {
        const light = ev.player ? COL[ev.player + 'Light'] : '#fff';
        switch (ev.type) {
          case 'move': {
            const per = ev.blink ? 260 : 180;
            const pid = ev.player, path = ev.path.slice();
            const from = this.prevPos ? this.prevPos[pid] : null; // set by main.js before the action
            const start = from ? this.cellXY(from.col, from.row) : null;
            this.schedule(t, () => { this.slide[pid] = { path, t0: performance.now(), per, blink: ev.blink, start }; });
            if (this.prevPos) this.prevPos[pid] = path[path.length - 1];
            t += per * path.length;
            break;
          }
          case 'paint':
            ev.cells.forEach((c, i) => this.schedule(Math.max(0, t - 180 * (ev.cells.length - i)), () => this.flashCell(c.col, c.row, '#ffffff', 450)));
            break;
          case 'fill': {
            const cells = ev.cells;
            cells.forEach((c, i) => this.schedule(t + 40 * i, () => this.flashCell(c.col, c.row, '#ffffff', 600)));
            const mid = cells[Math.floor(cells.length / 2)];
            this.schedule(t + 40 * cells.length, () => this.addText(mid.col, mid.row, `+${ev.count} Territory`, light, { big: true, dur: 1500 }));
            t += 40 * cells.length + 200;
            break;
          }
          case 'poi':
            this.schedule(t, () => { this.flashCell(ev.col, ev.row, '#ffe27a', 800); this.addText(ev.col, ev.row, ev.cardName, '#ffe27a', { dy: -this.size * 0.9, dur: 1600 }); });
            t += 250;
            break;
          case 'attack': {
            const col = ev.col, row = ev.row, def = ev.defender;
            this.schedule(t, () => {
              this.shake[def] = performance.now();
              if (ev.label) this.addText(col, row, ev.label, ev.zone === 'back' ? '#ffd45a' : '#ffffff', { dy: -this.size * 1.6, big: true, dur: 1400 });
              this.addText(col, row, `−${ev.dmg}`, '#ff6b6b', { dy: -this.size * 0.6, big: true });
            });
            t += 500;
            break;
          }
          case 'explosion':
            this.schedule(t, () => { this.flashCell(ev.col, ev.row, '#ffb347', 700); if (ev.dmg) { this.shake[ev.defender] = performance.now(); this.addText(ev.col, ev.row, `−${ev.dmg}`, '#ff6b6b', { big: true }); } else this.addText(ev.col, ev.row, 'BLOCKED', '#ffb347'); });
            t += 400;
            break;
          case 'reinforce':
            this.schedule(t, () => this.addText(ev.col, ev.row, `+${ev.amount}`, light, { dy: -this.size * 1.4, big: true }));
            t += 300;
            break;
          case 'gameover': t += 400; break;
        }
      }
      return t;
    }

    // ---- drawing
    frame(now) {
      this.now = now;
      try {
        for (let i = this.timeline.length - 1; i >= 0; i--) if (this.timeline[i].at <= now) { const it = this.timeline.splice(i, 1)[0]; it.fn(); }
        if (this.s) this.draw(now);
      } catch (e) { console.error('render', e); } // never let one bad frame kill the loop
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
      // cells
      for (const k in s.cells) {
        const c = s.cells[k], p = this.cellXY(c.col, c.row);
        this.hexPath(ctx, p.x, p.y, 1.2);
        ctx.fillStyle = c.owner ? COL[c.owner] : COL.neutral;
        ctx.fill();
        if (c.bonus) { ctx.strokeStyle = 'rgba(255,226,122,0.9)'; ctx.lineWidth = 2; this.hexPath(ctx, p.x, p.y, 4); ctx.stroke(); }
        const f = this.flash[k];
        if (f) {
          const a = 1 - (now - f.t0) / f.dur;
          if (a <= 0) delete this.flash[k]; else { ctx.fillStyle = f.color; ctx.globalAlpha = 0.65 * a; this.hexPath(ctx, p.x, p.y, 1.2); ctx.fill(); ctx.globalAlpha = 1; }
        }
        if (R.isBlocked(s, c)) {
          ctx.strokeStyle = 'rgba(20,20,20,0.75)'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(p.x - S * 0.35, p.y - S * 0.35); ctx.lineTo(p.x + S * 0.35, p.y + S * 0.35);
          ctx.moveTo(p.x + S * 0.35, p.y - S * 0.35); ctx.lineTo(p.x - S * 0.35, p.y + S * 0.35); ctx.stroke();
        }
      }
      // POIs
      for (const poi of s.pois) {
        const p = this.cellXY(poi.col, poi.row), def = POIS[poi.type];
        ctx.beginPath(); ctx.arc(p.x, p.y, S * 0.42, 0, Math.PI * 2);
        ctx.fillStyle = poi.owner ? COL[poi.owner + 'Light'] : '#efe6cc'; ctx.fill();
        ctx.lineWidth = 2.5; ctx.strokeStyle = poi.owner ? '#ffffff' : '#7a6a48'; ctx.stroke();
        ctx.fillStyle = '#2a2318'; ctx.font = `bold ${Math.round(S * 0.5)}px system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(def.icon, p.x, p.y + 1);
      }
      // highlights
      const pulse = 0.55 + 0.45 * Math.sin(now / 180);
      for (const h of this.highlights) {
        const p = this.cellXY(h.col, h.row);
        if (h.kind === 'path') {
          ctx.fillStyle = 'rgba(255,255,255,0.28)'; this.hexPath(ctx, p.x, p.y, 3); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(S * 0.55)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(String(h.label || ''), p.x, p.y + 1);
        } else {
          ctx.lineWidth = 3; ctx.strokeStyle = `rgba(255,255,255,${0.5 + 0.5 * pulse})`; this.hexPath(ctx, p.x, p.y, 4); ctx.stroke();
          ctx.fillStyle = `rgba(255,255,255,${0.12 + 0.12 * pulse})`; ctx.fill();
          if (h.kind === 'facing') this.drawArrow(ctx, p.x, p.y, h.dir, S * 0.45, '#fff');
        }
      }
      // warbands: draw the non-active one first so the active one is on top
      const order = s.current === 1 ? [2, 1] : [1, 2];
      for (const pid of order) this.drawWarband(ctx, s.players[pid], now);
      // floating texts
      for (let i = this.texts.length - 1; i >= 0; i--) {
        const t = this.texts[i], k = (now - t.t0) / t.dur;
        if (k >= 1) { this.texts.splice(i, 1); continue; }
        ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
        ctx.font = `${t.big ? 'bold ' : ''}${Math.round(S * (t.big ? 0.62 : 0.48))}px system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.strokeText(t.text, t.x, t.y - k * S * 0.9);
        ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y - k * S * 0.9);
        ctx.globalAlpha = 1;
      }
    }
    drawArrow(ctx, x, y, dir, len, color) {
      const a = hex.dirAngle(dir);
      const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - Math.cos(a) * len * 0.6, y - Math.sin(a) * len * 0.6); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x2 + Math.cos(a) * len * 0.35, y2 + Math.sin(a) * len * 0.35);
      ctx.lineTo(x2 + Math.cos(a + 2.5) * len * 0.35, y2 + Math.sin(a + 2.5) * len * 0.35);
      ctx.lineTo(x2 + Math.cos(a - 2.5) * len * 0.35, y2 + Math.sin(a - 2.5) * len * 0.35); ctx.closePath(); ctx.fill();
    }
    warbandPos(p, now) {
      const sl = this.slide[p.id];
      const end = this.cellXY(p.warband.col, p.warband.row);
      if (!sl) return end;
      // rAF timestamps can lag behind performance.now() captured when the slide was scheduled, so clamp at 0
      const k = Math.max(0, (now - sl.t0) / (sl.per * sl.path.length));
      if (k >= 1) { this.slide[p.id] = null; return end; }
      // interpolate along the path; the start position is the cell before the first path step, estimated from the current cell
      const pts = sl.path.map(c => this.cellXY(c.col, c.row));
      const start = sl.start || (sl.start = this.estimateStart(pts));
      const all = [start].concat(pts);
      const seg = Math.min(all.length - 2, Math.floor(k * (all.length - 1))), f = k * (all.length - 1) - seg;
      const a = all[seg], b = all[seg + 1];
      let y = a.y + (b.y - a.y) * f;
      if (sl.blink) y -= Math.sin(f * Math.PI) * this.size * 0.8;
      return { x: a.x + (b.x - a.x) * f, y };
    }
    estimateStart(pts) {
      if (pts.length >= 2) return { x: pts[0].x - (pts[1].x - pts[0].x), y: pts[0].y - (pts[1].y - pts[0].y) };
      return { x: pts[0].x, y: pts[0].y + this.size * hex.SQRT3 * 0.5 };
    }
    drawWarband(ctx, p, now) {
      const S = this.size, w = p.warband, pos = this.warbandPos(p, now);
      let x = pos.x, y = pos.y;
      const sh = now - this.shake[p.id];
      if (sh < 350) { x += Math.sin(sh / 18) * S * 0.12 * (1 - sh / 350); }
      const color = COL[p.id], light = COL[p.id + 'Light'];
      // front arc wedge (facing readability, GDD §26)
      const a = hex.dirAngle(w.facing);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, S * 1.55, a - Math.PI / 3, a + Math.PI / 3); ctx.closePath();
      ctx.fillStyle = light; ctx.globalAlpha = 0.22; ctx.fill(); ctx.globalAlpha = 1;
      // minion cluster
      const n = Math.min(w.minions, 13), r = S * 0.11;
      ctx.fillStyle = '#1d1d24';
      for (let i = 0; i < n; i++) {
        const ring = i === 0 ? 0 : i < 7 ? 1 : 2, idx = i === 0 ? 0 : i < 7 ? i - 1 : i - 7, cnt = ring === 1 ? 6 : 6;
        const ang = ring ? (idx / cnt) * Math.PI * 2 + (ring === 2 ? Math.PI / 6 : 0) : 0, rad = ring * S * 0.24;
        ctx.beginPath(); ctx.arc(x + Math.cos(ang) * rad, y + Math.sin(ang) * rad, r * (ring === 2 ? 0.85 : 1), 0, Math.PI * 2);
        ctx.fillStyle = light; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#1d1d24'; ctx.stroke();
      }
      // facing arrow
      this.drawArrow(ctx, x + Math.cos(a) * S * 0.62, y + Math.sin(a) * S * 0.62, w.facing, S * 0.34, '#ffffff');
      // banner
      const txt = String(w.minions), fs = Math.round(S * 0.5);
      ctx.font = `bold ${fs}px system-ui, sans-serif`;
      const tw = ctx.measureText(txt).width + S * 0.5, bh = S * 0.62, bx = x - tw / 2, by = y - S * 1.32;
      ctx.fillStyle = color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(bx, by, tw, bh, 5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x, by + bh / 2 + 1);
      if (p.id === this.s.current && this.s.phase === 'play') {
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.arc(x, y, S * 0.78, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      }
    }
  }
  HB.Renderer = Renderer;
})();
