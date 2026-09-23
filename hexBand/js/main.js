// UI glue: main menu (D-051), settings screen, hand with piles (D-037), drag-to-play (D-028/D-036) and tap-to-play
// (D-046/D-048), bot turns, hotseat hand-over, results. All player-facing text is English (D-052).
window.HB = window.HB || {};
(function () {
  const R = HB.rules, hex = HB.hex, CFG = HB.CONFIG, CARDS = HB.cards.CARDS, POIS = HB.cards.POIS, PRESETS = HB.cards.PRESETS;
  const $ = sel => document.querySelector(sel);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const KIND_CLASS = { move: 'k-move', blink: 'k-move', reinforce: 'k-reinf', buff_next: 'k-combat', explosive: 'k-combat', volley: 'k-combat', catapult: 'k-combat', formation: 'k-def', flank_claim: 'k-terr', cordon: 'k-terr', banner: 'k-terr', prayer: 'k-util', scout_draw: 'k-util' };
  const cardHTML = (defId, poi) => { const d = CARDS[defId]; return `<div class="card-icon">${HB.icons.svg(defId)}</div><div class="card-name">${d.title}</div>${poi ? '<div class="card-poi">POI</div>' : ''}`; };
  const cardClass = (defId, poi) => 'card ' + (KIND_CLASS[CARDS[defId].kind] || '') + (poi ? ' poi' : '');
  const rectOf = e => e.getBoundingClientRect();

  const UI = {
    state: null, renderer: null, busy: false, opts: null, drag: null, sel: null, lastActor: null, handoverPending: false, lastEvents: [], pendingIncoming: new Set(),
    // whose hand the bottom panel shows: the human in bot mode, the current player in hotseat (D-044)
    handPlayer() { const s = this.state; return this.opts && this.opts.players[2].bot ? s.players[1] : s.players[s.current]; },
    setup: { mode: 'bot', rounds: CFG.ROUND_LIMIT, seed: '', p: { 1: null, 2: null }, botPreset: 'balanced', control: 'drag' },
    // D-048: input scheme — 'drag' (drag the card onto the board) or 'tap' (tap the card, then tap the target)
    setControl(mode) {
      this.setup.control = mode === 'tap' ? 'tap' : 'drag';
      document.body.classList.toggle('ctl-tap', this.setup.control === 'tap');
      try { localStorage.setItem('hexband.control', this.setup.control); } catch (e) {}
      if (this.sel) this.cancelSelect();
      if (this.drag) this.endDrag({}, false);
    },

    // ------------------------------------------------------------ settings screen
    initSetup() {
      const S = this.setup;
      S.p[1] = { cards: PRESETS.balanced.cards.slice(), pois: PRESETS.balanced.pois.slice() };
      S.p[2] = { cards: PRESETS.duel.cards.slice(), pois: PRESETS.duel.pois.slice() };
      $('#setup-version').textContent = 'v' + CFG.VERSION;
      document.querySelectorAll('input[name=mode]').forEach(r => r.addEventListener('change', () => { S.mode = r.value; this.renderSetup(); }));
      $('#sel-rounds').value = String(S.rounds);
      $('#sel-rounds').addEventListener('change', e => S.rounds = +e.target.value);
      $('#inp-seed').addEventListener('input', e => S.seed = e.target.value);
      $('#sel-attacks').value = String(CFG.ATTACKS_PER_TURN);
      $('#sel-attacks').addEventListener('change', e => S.attacks = +e.target.value);
      $('#sel-bot-preset').addEventListener('change', e => { S.botPreset = e.target.value; this.renderSetup(); });
      let ctl = 'drag'; try { ctl = localStorage.getItem('hexband.control') || 'drag'; } catch (e) {}
      this.setControl(ctl);
      $('#sel-control').value = this.setup.control;
      $('#sel-control').addEventListener('change', e => this.setControl(e.target.value));
      $('#btn-start').addEventListener('click', () => this.startFromSetup());
      $('#btn-help').addEventListener('click', () => this.showHelp());
      $('#btn-help-game').addEventListener('click', () => this.showHelp());
      $('#btn-intro').addEventListener('click', () => this.showIntro(true));
      this.renderSetup(); // D-051: the Basics popup is no longer shown automatically; it lives behind a button
    },
    showIntro(manual) {
      const ic = id => `<span class="intro-ic">${HB.icons.svg(id)}</span>`;
      const tap = this.setup.control === 'tap';
      const ov = this.overlay(`<div class="intro">
        <h2>HEXBand — how it works</h2>
        <div class="intro-item">${ic('hook')}<div><b>Move with cards.</b> ${tap ? 'Tap a card — every hex it can take your warband to lights up; tap the one you want and the warband moves at once.' : 'Drag a card onto the board and release it where the warband should go; it moves at once.'} The card sets the shape of the route, you choose the direction. Play as many cards per turn as you like, at least one, then press End Turn. The control scheme (drag / tap) can be changed in Settings.</div></div>
        <div class="intro-item">${ic('ring')}<div><b>Claim territory.</b> Every hex you walk through becomes yours. Enclose an area with your hexes (or with your hexes and the map edge) and everything inside becomes yours too, as long as the enemy is not in it. Score = your hexes.</div></div>
        <div class="intro-item">${ic('recruitment')}<div><b>Take outposts.</b> Walk through an outpost or enclose it. The card floating above it flies straight into your hand and works instantly. Lose the outpost and you lose the card.</div></div>
        <div class="intro-item">${ic('battle_cry')}<div><b>Fight.</b> To attack, run a card's route onto the enemy's hex (it turns red) — the game shows a forecast: how much each warband loses and who falls back. More minions hit harder, but cards let a smaller army win the exchange. One attack per turn.</div></div>
        <div class="intro-item">${ic('claim')}<div><b>Win.</b> Destroy the enemy warband or capture the whole map — instant win. Otherwise, after ${this.setup.rounds} rounds the player with more territory wins.</div></div>
        <button class="btn primary" id="btn-intro-close">${manual ? 'Got it' : 'To settings'}</button></div>`);
      $('#btn-intro-close').addEventListener('click', () => { ov.hidden = true; });
    },
    renderSetup() {
      const S = this.setup;
      $('#bot-preset-row').hidden = S.mode !== 'bot';
      $('#builder-2').hidden = S.mode !== 'hotseat';
      this.renderBuilder(1); if (S.mode === 'hotseat') this.renderBuilder(2);
      this.validateSetup();
    },
    renderBuilder(pid) {
      const S = this.setup, sel = S.p[pid], root = $('#builder-' + pid);
      root.innerHTML = '';
      root.appendChild(el('h3', null, pid === 1 ? 'Blue (you)' : 'Red'));
      const presets = el('div', 'presets');
      for (const key in PRESETS) {
        const b = el('button', 'chip', PRESETS[key].title);
        b.addEventListener('click', () => { sel.cards = PRESETS[key].cards.slice(); sel.pois = PRESETS[key].pois.slice(); this.renderBuilder(pid); this.validateSetup(); });
        presets.appendChild(b);
      }
      root.appendChild(presets);
      root.appendChild(el('div', 'builder-label', `Deck: <b>${sel.cards.length}</b>/${CFG.DECK_SIZE}`));
      const grid = el('div', 'pick-grid');
      for (const id of HB.cards.DECK_POOL) {
        const d = CARDS[id], on = sel.cards.includes(id);
        const c = el('div', 'pick' + (on ? ' on' : '') + (HB.cards.ADVANCED_POOL.includes(id) ? ' adv' : ''), `<div class="pick-icon">${HB.icons.svg(id)}</div><div class="pick-name">${d.title}</div><div class="pick-type">${d.type}</div><div class="pick-text">${d.text}</div>`);
        c.addEventListener('click', () => {
          if (on) sel.cards = sel.cards.filter(x => x !== id); else if (sel.cards.length < CFG.DECK_SIZE) sel.cards.push(id); else return;
          this.renderBuilder(pid); this.validateSetup();
        });
        grid.appendChild(c);
      }
      root.appendChild(grid);
      root.appendChild(el('div', 'builder-label', `Outposts (left to right: near you, middle, near the centre): <b>${sel.pois.length}</b>/${CFG.POI_PICKS}`));
      const pg = el('div', 'pick-grid pois');
      for (const id of HB.cards.POI_POOL) {
        const d = POIS[id], on = sel.pois.includes(id), idx = sel.pois.indexOf(id);
        const c = el('div', 'pick' + (on ? ' on' : ''), `<div class="pick-icon">${HB.icons.svg(d.card)}</div><div class="pick-name">${on ? (idx + 1) + '. ' : ''}${d.title}</div><div class="pick-type">→ ${CARDS[d.card].title}</div><div class="pick-text">${d.text}</div>`);
        c.addEventListener('click', () => {
          if (on) sel.pois = sel.pois.filter(x => x !== id); else if (sel.pois.length < CFG.POI_PICKS) sel.pois.push(id); else return;
          this.renderBuilder(pid); this.validateSetup();
        });
        pg.appendChild(c);
      }
      root.appendChild(pg);
    },
    validateSetup() {
      const S = this.setup;
      const okP = p => p.cards.length === CFG.DECK_SIZE && p.pois.length === CFG.POI_PICKS;
      const ok = okP(S.p[1]) && (S.mode === 'bot' || okP(S.p[2]));
      $('#btn-start').disabled = !ok;
      $('#setup-hint').textContent = ok ? '' : `Pick exactly ${CFG.DECK_SIZE} cards and ${CFG.POI_PICKS} outposts for each player.`;
    },
    startFromSetup() {
      const S = this.setup;
      const p2 = S.mode === 'bot' ? { deck: PRESETS[S.botPreset].cards.slice(), pois: PRESETS[S.botPreset].pois.slice(), bot: true, name: 'Red (bot)' }
        : { deck: S.p[2].cards, pois: S.p[2].pois, bot: false, name: 'Red' };
      const seed = S.seed.trim() ? (parseInt(S.seed, 10) || hashStr(S.seed)) : (Math.random() * 0xffffffff) >>> 0;
      this.opts = { seed, roundLimit: S.rounds, attackLimit: S.attacks != null ? S.attacks : CFG.ATTACKS_PER_TURN, players: { 1: { deck: S.p[1].cards, pois: S.p[1].pois, bot: false, name: 'Blue' }, 2: p2 } };
      this.startGame(this.opts);
    },

    // ------------------------------------------------------------ game
    startGame(opts) {
      this.state = R.createGame(opts);
      this.lastActor = null; this.handoverPending = false; this.busy = false; this.lastEvents = []; this.pendingIncoming = new Set();
      $('#setup').hidden = true; $('#menu').hidden = true; $('#game').hidden = false; $('#overlay').hidden = true;
      if (!this.renderer) {
        this.renderer = new HB.Renderer($('#board'));
        $('#board').addEventListener('click', e => this.onCanvasClick(e));
        window.addEventListener('resize', () => this.layout());
        if (window.ResizeObserver) new ResizeObserver(() => this.layout()).observe($('#board-wrap'));
        $('#btn-quit').addEventListener('click', () => this.toSetup());
        $('#btn-pass').addEventListener('click', () => this.showPassPicker());
        $('#btn-end-fb').addEventListener('click', () => this.endTurn());
        this.bindDrag(); this.bindTap();
      }
      this.renderer.setState(this.state);
      this.renderer.prevPos = this.positions();
      R.takeEvents(this.state);
      $('#log-lines').innerHTML = '';
      this.appendLog(this.state.log);
      this.layout();
      this.refresh();
      this.nextTurn();
    },
    toSetup() { this.showMenu(); },
    // ------------------------------------------------------------ main menu (D-051): win conditions with live scenes, Play, Settings
    initMenu() {
      $('#btn-play').addEventListener('click', () => this.startFromSetup());
      $('#btn-settings').addEventListener('click', () => this.showSetup());
      $('#btn-back').addEventListener('click', () => this.showMenu());
      $('#btn-menu-intro').addEventListener('click', e => { e.preventDefault(); this.showIntro(true); });
      this.menuPics = [];
      this.buildMenuPics();
      window.addEventListener('resize', () => this.layoutMenu());
    },
    showMenu() { $('#game').hidden = true; $('#setup').hidden = true; $('#overlay').hidden = true; $('#menu').hidden = false; this.state = null; this.layoutMenu(); },
    showSetup() { $('#menu').hidden = true; $('#game').hidden = true; $('#setup').hidden = false; },
    // a tiny hand-made board state the normal renderer can draw
    miniState(cols, rows, fn) {
      const st = () => ({ attackBonus: 0, formationUntil: -1 });
      const s = { cols, rows, cells: {}, pois: [], blocked: {}, turnIndex: 0, current: 1, phase: 'play', decorSeed: 11,
        players: [null, { id: 1, warband: { col: 1, row: 1, minions: 24 }, status: st() }, { id: 2, warband: { col: 3, row: 1, minions: 24 }, status: st() }] };
      for (let c = 0; c < cols; c++) for (let r = 0; r < hex.rowsInCol(c, rows); r++) s.cells[hex.key(c, r)] = { col: c, row: r, owner: 0, bonus: 0, poi: -1 };
      fn(s); return s;
    },
    buildMenuPics() {
      const mk = (id, s) => { const cv = $(id); if (!cv) return null; const rd = new HB.Renderer(cv); rd.setState(s); this.menuPics.push({ el: cv, rd }); return rd; };
      // 1 · elimination: a full warband keeps hitting a dying one
      const s1 = this.miniState(5, 4, s => { s.players[1].warband = { col: 1, row: 1, minions: 24 }; s.players[2].warband = { col: 2, row: 1, minions: 3 }; for (const k in s.cells) s.cells[k].owner = s.cells[k].col <= 1 ? 1 : s.cells[k].col >= 3 ? 2 : 0; });
      const r1 = mk('#pic-elim', s1);
      if (r1) setInterval(() => { if ($('#menu').hidden) return; const p = r1.cellXY(2, 1); r1.spawnFight(p.x, p.y); r1.shake[2] = performance.now(); r1.addText(2, 1, '−5', '#ff6b6b', { dy: -r1.size * 0.6, big: true }); }, 1700);
      // 2 · domination: every hex is blue except the one under the enemy
      const s2 = this.miniState(5, 4, s => { s.players[1].warband = { col: 1, row: 1, minions: 24 }; s.players[2].warband = { col: 3, row: 1, minions: 9 }; for (const k in s.cells) s.cells[k].owner = 1; s.cells[hex.key(3, 1)].owner = 0; });
      mk('#pic-dom', s2);
      // 3 · territory at the end: a split board
      const s3 = this.miniState(5, 4, s => { s.players[1].warband = { col: 1, row: 2, minions: 18 }; s.players[2].warband = { col: 3, row: 0, minions: 14 }; for (const k in s.cells) { const c = s.cells[k]; c.owner = c.row >= 2 || (c.row === 1 && c.col <= 2) ? 1 : (c.col === 0 && c.row === 0 ? 0 : 2); } });
      mk('#pic-terr', s3);
      this.layoutMenu();
    },
    layoutMenu() { for (const m of this.menuPics) { const r = rectOf(m.el.parentElement); if (r.width > 0) m.rd.resize(Math.floor(r.width), Math.floor(r.height)); } },
    positions() { const s = this.state; return { 1: { col: s.players[1].warband.col, row: s.players[1].warband.row }, 2: { col: s.players[2].warband.col, row: s.players[2].warband.row } }; },
    layout() {
      const wrap = $('#board-wrap'); if (!this.renderer || !this.state) return;
      const r = rectOf(wrap);
      this.renderer.resize(Math.floor(r.width), Math.floor(r.height));
    },
    current() { return this.state.players[this.state.current]; },

    nextTurn() {
      const s = this.state;
      if (s.phase === 'over') { this.showGameOver(); return; }
      const p = this.current();
      this.refresh();
      if (p.bot) { this.busy = true; this.refresh(); setTimeout(() => this.botMove(), CFG.BOT_DELAY_MS); return; }
      if (this.opts.players[2].bot === false && this.lastActor && this.lastActor !== p.id) this.showHandover(p);
      const incoming = this.lastEvents.filter(e => e.player === p.id && (e.type === 'draw' || e.type === 'poiCard' || e.type === 'cardToHand'));
      this.lastEvents = [];
      if (incoming.length) this.animateIncoming(incoming);
    },
    botMove() {
      const s = this.state; if (!s || s.phase !== 'play') { this.nextTurn(); return; }
      const move = HB.ai.choose(s);
      this.renderer.prevPos = this.positions();
      this.lastActor = s.current;
      if (move.end) R.endTurn(s);
      else if (move.pass) { if (!R.passTurn(s, move.uid)) { s.playedThisTurn = 1; R.endTurn(s); } }
      else if (!R.playCard(s, move.uid, move.choice)) { if (!R.endTurn(s)) { s.playedThisTurn = 1; R.endTurn(s); } }
      this.afterAction();
    },
    afterAction() {
      const s = this.state, events = R.takeEvents(s);
      this.lastEvents = events;
      this.sel = null; $('#card-desc').hidden = true; this.renderer.forecast = null;
      // cards that will fly into the hand must not flash in the hand before their flight (D-044)
      const hp = this.handPlayer();
      for (const ev of events) {
        if (ev.player !== hp.id) continue;
        if (ev.type === 'draw') ev.uids.forEach(u => this.pendingIncoming.add(u));
        else if (ev.type === 'poiCard' || ev.type === 'cardToHand') this.pendingIncoming.add(ev.uid);
      }
      this.appendLog(events.filter(e => e.type === 'log').map(e => e.text));
      const dur = this.renderer.applyEvents(events);
      this.renderer.highlights = []; this.renderer.pathFrom = null;
      this.busy = true; this.refresh();
      setTimeout(() => { this.busy = false; this.refresh(); this.nextTurn(); }, Math.min(dur, 2500) + 150);
    },

    // ------------------------------------------------------------ HUD & hand (D-037)
    refresh() {
      const s = this.state; if (!s) return;
      const total = R.totalCells(s), sc = R.scoreboard(s);
      for (const pid of [1, 2]) {
        const p = s.players[pid];
        $(`#hud-${pid} .hud-name`).textContent = p.name;
        $(`#hud-${pid} .hud-terr`).textContent = sc[pid].territory;
        $(`#hud-${pid} .hud-pct`).textContent = '(' + Math.round(sc[pid].cells / total * 100) + '%)';
        $(`#hud-${pid} .hud-min`).textContent = p.warband.minions;
        $(`#hud-${pid} .hud-poi`).textContent = sc[pid].pois;
        $(`#hud-${pid}`).classList.toggle('active', s.current === pid && s.phase === 'play');
      }
      $('#hud-round').textContent = `Round ${R.round(s)} / ${s.roundLimit}`;
      // D-044: against the bot the hand, deck and discard always belong to the human player
      const p = this.handPlayer(), mine = s.current === p.id;
      const busy = this.busy || !mine || s.phase !== 'play' || this.handoverPending;
      const hideHand = this.handoverPending;
      const hand = $('#hand'); hand.innerHTML = '';
      const playable = p.hand.map(card => mine && R.getPlay(s, card).ok);
      for (let i = 0; i < CFG.HAND_SIZE; i++) {
        const slot = el('div', 'slot');
        const card = p.hand[i];
        if (card) {
          const c = el('div', cardClass(card.def, card.poi >= 0) + (playable[i] ? '' : ' disabled'), cardHTML(card.def, card.poi >= 0));
          c.dataset.uid = card.uid;
          if (hideHand) c.classList.add('hidden-card');
          if (this.pendingIncoming.has(card.uid)) c.classList.add('incoming');
          if (this.sel && this.sel.uid === card.uid) c.classList.add('selected');
          slot.appendChild(c);
        } else if (i === CFG.HAND_SIZE - 1 && s.playedThisTurn >= 1 && !busy) {
          const b = el('button', 'btn end-turn', 'End<br>turn');
          b.addEventListener('click', () => this.endTurn());
          slot.appendChild(b);
        }
        hand.appendChild(slot);
      }
      $('#deck-count').textContent = p.deck.length;
      $('#discard-count').textContent = p.discard.length;
      $('#pile-deck').classList.toggle('empty', p.deck.length === 0);
      $('#pile-discard').classList.toggle('empty', p.discard.length === 0);
      const last = p.discard[p.discard.length - 1];
      $('#pile-discard').innerHTML = last ? `<div class="pile-face">${HB.icons.svg(last.def)}</div>` : '';
      $('#status-line').textContent = busy ? (!mine && s.phase === 'play' ? `${this.current().name}'s turn…` : '') : this.statusText(p);
      $('#btn-pass').hidden = busy || s.playedThisTurn > 0 || playable.some(x => x);
      // a full hand (outpost card arrived) leaves no slot for the end-turn button — show a fallback under the hand
      $('#btn-end-fb').hidden = busy || s.playedThisTurn < 1 || p.hand.length < CFG.HAND_SIZE;
    },
    statusText(p) {
      const s = this.state, st = p.status, out = [];
      if (st.attackBonus) out.push(`Battle Cry +${st.attackBonus}`);
      if (R.active(s, st.formationUntil)) out.push('Formation −2');
      return out.length ? 'Effects: ' + out.join(', ') : '';
    },
    // flying card between two screen rects (played card → discard, deck → slot, discard → deck)
    fly(fromRect, toRect, html, cls, dur) {
      const f = el('div', 'fly-card ' + (cls || ''), html);
      document.body.appendChild(f);
      const w = 60, h = 80;
      f.style.width = w + 'px'; f.style.height = h + 'px';
      const x0 = fromRect.left + fromRect.width / 2 - w / 2, y0 = fromRect.top + fromRect.height / 2 - h / 2;
      const x1 = toRect.left + toRect.width / 2 - w / 2, y1 = toRect.top + toRect.height / 2 - h / 2;
      const s0 = Math.min(1, fromRect.width / w), s1 = Math.min(1, toRect.width / w);
      const anim = f.animate([{ transform: `translate(${x0}px,${y0}px) scale(${s0})`, opacity: 1 }, { transform: `translate(${x1}px,${y1}px) scale(${s1})`, opacity: 0.9 }], { duration: dur || 380, easing: 'cubic-bezier(.2,.7,.3,1)' });
      return new Promise(res => {
        let done = false;
        const finish = () => { if (done) return; done = true; f.remove(); res(); };
        anim.onfinish = finish;
        setTimeout(finish, (dur || 380) + 200); // background tabs may never fire onfinish
      });
    },
    // Cards arriving in the hand fly in from their source: the deck (draw), the outpost on the board (poiCard, D-040)
    // or the discard pile (prayer). The hand is already rendered; incoming cards stay hidden until their flight ends.
    async animateIncoming(events) {
      const items = [];
      for (const ev of events) {
        if (ev.type === 'draw') ev.uids.forEach(uid => items.push({ uid, from: 'deck', reshuffled: ev.reshuffled }));
        else if (ev.type === 'poiCard') items.push({ uid: ev.uid, from: 'cell', col: ev.col, row: ev.row });
        else items.push({ uid: ev.uid, from: 'discard' });
      }
      const cards = items.map(it => ({ it, el: document.querySelector(`#hand .card[data-uid="${it.uid}"]`) })).filter(x => x.el);
      cards.forEach(x => x.el.classList.add('incoming'));
      if (items.some(it => it.reshuffled)) {
        await this.fly(rectOf($('#pile-discard')), rectOf($('#pile-deck')), '<div class="pile-face back"></div>', 'stack', 420);
        $('#pile-deck').classList.add('shuffle'); setTimeout(() => $('#pile-deck').classList.remove('shuffle'), 500);
        await new Promise(r => setTimeout(r, 200));
      }
      const srcRect = it => {
        if (it.from === 'deck') return rectOf($('#pile-deck'));
        if (it.from === 'discard') return rectOf($('#pile-discard'));
        const br = rectOf($('#board')), c = this.renderer.cellXY(it.col, it.row), S = this.renderer.size;
        return { left: br.left + c.x - S * 0.75, top: br.top + c.y - S * 2.1, width: S * 1.5, height: S * 1.85 };
      };
      const flights = cards.map((x, i) => new Promise(res => setTimeout(async () => {
        await this.fly(srcRect(x.it), rectOf(x.el), x.el.innerHTML, x.el.className.replace('card', '').replace('incoming', ''), x.it.from === 'cell' ? 520 : 360);
        x.el.classList.remove('incoming'); this.pendingIncoming.delete(x.it.uid); res();
      }, i * 110)));
      items.forEach(it => { if (!cards.some(x => x.it.uid === it.uid)) this.pendingIncoming.delete(it.uid); }); // card no longer in hand
      await Promise.all(flights);
    },

    // ------------------------------------------------------------ drag & drop (D-028, D-036)
    bindDrag() {
      const hand = $('#hand');
      hand.addEventListener('pointerdown', e => {
        if (this.setup.control !== 'drag') return; // tap mode handles cards on click (bindTap)
        const cardEl = e.target.closest('.card'); if (!cardEl || !cardEl.dataset.uid) return;
        e.preventDefault();
        this.startDrag(e, +cardEl.dataset.uid, cardEl);
      });
      window.addEventListener('pointermove', e => { if (this.drag && e.pointerId === this.drag.pointerId) this.moveDrag(e); });
      window.addEventListener('pointerup', e => { if (this.drag && e.pointerId === this.drag.pointerId) this.endDrag(e, true); });
      window.addEventListener('pointercancel', e => { if (this.drag && e.pointerId === this.drag.pointerId) this.endDrag(e, false); });
    },
    // description of the chosen card over the hand zone; the footer explains how to cancel in the current input scheme
    showDesc(title, text, needsTarget) {
      const tap = this.setup.control === 'tap';
      const hint = tap
        ? `<span class="desc-cancel-ic">✕</span><span>${needsTarget ? 'Tap a highlighted hex on the board to play' : 'Tap the board to play'}. Changed your mind? Tap this panel — the card stays in your hand.</span>`
        : `<span class="desc-cancel-ic">↩</span><span>Changed your mind? Release the card here — it returns to your hand</span>`;
      $('#card-desc').innerHTML = `<div class="desc-body"><b>${title}</b><span>${text}</span><div class="desc-forecast" hidden></div></div><div class="desc-cancel">${hint}</div>`;
      $('#card-desc').hidden = false;
    },
    // D-047: battle forecast while an attacking route (or a ranged card) is being aimed — shared by both input schemes
    updateForecast(ctx) {
      const s = this.state, p = this.current(), enemy = s.players[3 - p.id], kind = ctx.def.kind, rd = this.renderer;
      let fc = null;
      if (ctx.valid && ctx.choice && ctx.choice.path && ctx.choice.path.some(c => c.attack)) fc = R.forecast(s, p, enemy, 'clash');
      else if (ctx.valid && ctx.over && (kind === 'volley' || kind === 'catapult')) fc = R.forecast(s, p, enemy, kind);
      rd.forecast = fc ? Object.assign({ a: p.id, d: enemy.id }, fc) : null;
      const fcEl = $('#card-desc .desc-forecast');
      if (!fcEl) return;
      if (fc) {
        const outcome = { defenderRetreats: 'the enemy falls back, you take its hex', attackerRetreats: fc.aAfter === fc.dAfter ? 'equal numbers — you fall back' : 'you fall back', ranged: 'no retaliation',
          eliminated: fc.dAfter <= 0 && fc.aAfter <= 0 ? 'both warbands die — a draw' : fc.dAfter <= 0 ? 'the enemy warband is destroyed' : 'your warband is destroyed' }[fc.result];
        fcEl.innerHTML = `<b>Battle forecast:</b> you −${fc.dmgToAtt} (${p.warband.minions} → ${fc.aAfter}), enemy −${fc.dmgToDef} (${enemy.warband.minions} → ${fc.dAfter}) — ${outcome}`;
        fcEl.hidden = false;
      } else fcEl.hidden = true;
    },
    startDrag(e, uid, cardEl) {
      const s = this.state, p = this.handPlayer();
      if (!s || this.busy || s.current !== p.id || s.phase !== 'play' || this.handoverPending) return;
      const card = p.hand.find(c => c.uid === uid); if (!card) return;
      const play = R.getPlay(s, card), d = CARDS[card.def];
      this.showDesc(d.title, d.text);
      if (!play.ok) { cardEl.classList.add('shake'); setTimeout(() => { cardEl.classList.remove('shake'); $('#card-desc').hidden = true; }, 700); return; }
      const fx = $('#drag-fx'); fx.hidden = false; fx.className = 'p' + p.id;
      cardEl.classList.add('lifted');
      this.drag = { uid, card, def: d, play, cardEl, pointerId: e.pointerId, choice: null, over: false, x: e.clientX, y: e.clientY };
      this.renderer.dragging = true;
      this.renderer.pathFrom = { col: p.warband.col, row: p.warband.row };
      this.moveDrag(e);
    },
    moveDrag(e) {
      const dg = this.drag, s = this.state, p = this.current(), rd = this.renderer;
      dg.x = e.clientX; dg.y = e.clientY;
      const fx = $('#drag-fx'); fx.style.left = e.clientX + 'px'; fx.style.top = e.clientY + 'px';
      const br = rectOf($('#board'));
      dg.over = e.clientX >= br.left && e.clientX <= br.right && e.clientY >= br.top && e.clientY <= br.bottom;
      const hl = [], play = dg.play, kind = dg.def.kind;
      dg.choice = null; dg.valid = false;
      if (play.options && play.options[0] && play.options[0].end) {
        // D-030: pick the pattern variant whose end cell is closest to the pointer; the first cell breaks ties
        const px = e.clientX - br.left, py = e.clientY - br.top;
        const dist = c => { const q = rd.cellXY(c.col, c.row); return Math.hypot(q.x - px, q.y - py); };
        let opt = play.options[0], best = Infinity;
        for (const o of play.options) { const sc = dist(o.end) + 0.35 * dist(o.path[0]); if (sc < best) { best = sc; opt = o; } }
        dg.choice = opt; dg.valid = true;
        const ends = new Set(play.options.map(o => hex.key(o.end.col, o.end.row)));
        for (const k of ends) { const [c, r] = k.split(',').map(Number); hl.push({ col: c, row: r, kind: 'target', strong: false }); }
        opt.path.forEach((c, i) => hl.push({ col: c.col, row: c.row, kind: 'path', label: i + 1, strong: true, attack: !!c.attack }));
      } else if (play.options && play.options[0] && play.options[0].axis != null) {
        // Flank Claim: pick the axis whose direction is closest to pointer-from-warband
        const wc = rd.cellXY(p.warband.col, p.warband.row);
        const ang = Math.atan2(e.clientY - (br.top + wc.y), e.clientX - (br.left + wc.x));
        const diff = (a, b) => { let d = Math.abs(a - b) % (Math.PI * 2); return d > Math.PI ? Math.PI * 2 - d : d; };
        let opt = play.options[0], best = Infinity;
        for (const o of play.options) { const d = Math.min(diff(ang, hex.dirAngle(o.axis)), diff(ang, hex.dirAngle(o.axis + 3))); if (d < best) { best = d; opt = o; } }
        dg.choice = opt; dg.valid = true;
        for (const o of play.options) for (const c of o.cells) hl.push({ col: c.col, row: c.row, kind: 'target', strong: o === opt });
      } else if (play.options && play.options[0] && play.options[0].side != null) {
        const wx = rd.warbandScreenX(p.id), side = e.clientX < wx ? -1 : 1;
        const opt = play.options.find(o => o.side === side) || play.options[0];
        dg.choice = opt; dg.valid = true;
        this.showDesc(`${dg.def.title}: ${opt.label}`, dg.def.text);
      } else if (kind === 'explosive') {
        const cell = dg.over ? rd.cellFromPointer(e.clientX, e.clientY) : null;
        const opt = cell && play.options.find(o => o.cell.col === cell.col && o.cell.row === cell.row);
        dg.choice = opt || null; dg.valid = !!opt;
        for (const o of play.options) hl.push({ col: o.cell.col, row: o.cell.row, kind: 'target', strong: o === opt });
      } else {
        dg.valid = true;
        if (play.path) play.path.forEach((c, i) => hl.push({ col: c.col, row: c.row, kind: 'path', label: i + 1, strong: dg.over, attack: !!c.attack }));
      }
      rd.highlights = hl;
      this.updateForecast({ valid: dg.valid, choice: dg.choice, over: dg.over, def: dg.def });
      fx.classList.toggle('ok', dg.over && dg.valid);
      $('#hand-area').classList.toggle('drop-cancel', !dg.over);
    },
    endDrag(e, drop) {
      const dg = this.drag; if (!dg) return;
      if (drop && e.clientX != null) this.moveDrag(e); // decide by where the pointer was released, not the last move
      this.drag = null;
      $('#drag-fx').hidden = true; $('#card-desc').hidden = true;
      dg.cardEl.classList.remove('lifted');
      $('#hand-area').classList.remove('drop-cancel');
      this.renderer.highlights = []; this.renderer.pathFrom = null; this.renderer.dragging = false; this.renderer.forecast = null;
      if (drop && dg.over && dg.valid) {
        this.commit(dg.uid, dg.choice, { x: e.clientX, y: e.clientY, cardEl: dg.cardEl });
        return;
      }
      this.refresh();
    },
    // ------------------------------------------------------------ tap to play (control = 'tap', D-046/D-048)
    bindTap() {
      $('#hand').addEventListener('click', e => { if (this.setup.control !== 'tap') return; const el = e.target.closest('.card'); if (!el || !el.dataset.uid) return; this.onCardTap(+el.dataset.uid, el); });
      $('#card-desc').addEventListener('click', () => { if (this.setup.control === 'tap' && this.sel) this.cancelSelect(); });
      $('#board').addEventListener('pointermove', e => { if (this.sel && e.pointerType !== 'touch') this.previewAt(e.clientX, e.clientY); });
    },
    needsTarget(play) { return !!(play.options && play.options.length); },
    onCardTap(uid, cardEl) {
      const s = this.state, p = this.handPlayer();
      if (!s || this.busy || s.current !== p.id || s.phase !== 'play' || this.handoverPending) return;
      const card = p.hand.find(c => c.uid === uid); if (!card) return;
      if (this.sel && this.sel.uid === uid) { if (!this.needsTarget(this.sel.play)) this.commitSel(this.cardCenter(uid)); return; }
      const play = R.getPlay(s, card), d = CARDS[card.def];
      if (!play.ok) { cardEl.classList.add('shake'); setTimeout(() => cardEl.classList.remove('shake'), 400); return; }
      this.sel = { uid, card, def: d, play, choice: null, valid: false };
      this.showDesc(d.title, d.text, this.needsTarget(play));
      this.refresh();
      this.previewAt(null, null);
    },
    cardCenter(uid) { const el = document.querySelector(`#hand .card[data-uid="${uid}"]`); if (!el) return null; const r = rectOf(el); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; },
    cancelSelect() { this.sel = null; $('#card-desc').hidden = true; this.renderer.highlights = []; this.renderer.pathFrom = null; this.renderer.forecast = null; this.refresh(); },
    // computes the option for a tap/hover position and draws the preview; without a position every target is shown faintly
    previewAt(clientX, clientY) {
      const sel = this.sel, p = this.current(), rd = this.renderer, play = sel.play, kind = sel.def.kind, hl = [];
      const br = rectOf($('#board')), has = clientX != null;
      rd.pathFrom = { col: p.warband.col, row: p.warband.row };
      sel.choice = null; sel.valid = false;
      if (play.options && play.options[0] && play.options[0].end) {
        let opt = null;
        if (has) {
          const px = clientX - br.left, py = clientY - br.top;
          const dist = c => { const q = rd.cellXY(c.col, c.row); return Math.hypot(q.x - px, q.y - py); };
          let best = Infinity;
          for (const o of play.options) { const sc = dist(o.end) + 0.35 * dist(o.path[0]); if (sc < best) { best = sc; opt = o; } }
          if (best > rd.size * 2.4) opt = null; // tapped far from any end cell
        }
        const ends = new Set(play.options.map(o => hex.key(o.end.col, o.end.row)));
        for (const k of ends) { const [c, r] = k.split(',').map(Number); hl.push({ col: c, row: r, kind: 'target', strong: false }); }
        if (opt) { sel.choice = opt; sel.valid = true; opt.path.forEach((c, i) => hl.push({ col: c.col, row: c.row, kind: 'path', label: i + 1, strong: true, attack: !!c.attack })); }
      } else if (play.options && play.options[0] && play.options[0].axis != null) {
        let opt = null;
        if (has) {
          const wc = rd.cellXY(p.warband.col, p.warband.row);
          const ang = Math.atan2(clientY - (br.top + wc.y), clientX - (br.left + wc.x));
          const diff = (a, b) => { let d = Math.abs(a - b) % (Math.PI * 2); return d > Math.PI ? Math.PI * 2 - d : d; };
          let best = Infinity;
          for (const o of play.options) { const d = Math.min(diff(ang, hex.dirAngle(o.axis)), diff(ang, hex.dirAngle(o.axis + 3))); if (d < best) { best = d; opt = o; } }
        }
        if (opt) { sel.choice = opt; sel.valid = true; }
        for (const o of play.options) for (const c of o.cells) hl.push({ col: c.col, row: c.row, kind: 'target', strong: o === opt });
      } else if (play.options && play.options[0] && play.options[0].side != null) {
        if (has) { const wx = rd.warbandScreenX(p.id), side = clientX < wx ? -1 : 1; const opt = play.options.find(o => o.side === side) || play.options[0]; sel.choice = opt; sel.valid = true; }
        for (let d = 0; d < 6; d++) { const n = hex.neighbor(p.warband.col, p.warband.row, d); if (hex.exists(n.col, n.row, this.state.cols, this.state.rows)) hl.push({ col: n.col, row: n.row, kind: 'target', strong: false }); }
      } else if (kind === 'explosive') {
        const cell = has ? rd.cellFromPointer(clientX, clientY) : null;
        const opt = cell && play.options.find(o => o.cell.col === cell.col && o.cell.row === cell.row);
        if (opt) { sel.choice = opt; sel.valid = true; }
        for (const o of play.options) hl.push({ col: o.cell.col, row: o.cell.row, kind: 'target', strong: o === opt });
      } else { sel.valid = true; }
      rd.highlights = hl;
      this.updateForecast({ valid: sel.valid, choice: sel.choice, over: has, def: sel.def });
      return sel.valid;
    },
    commitSel(from) {
      const sel = this.sel; this.sel = null;
      $('#card-desc').hidden = true; this.renderer.highlights = []; this.renderer.pathFrom = null; this.renderer.forecast = null;
      this.commit(sel.uid, sel.choice, from);
    },
    commit(uid, choice, from) {
      const s = this.state, p = this.current(), card = p.hand.find(c => c.uid === uid);
      this.renderer.prevPos = this.positions();
      this.lastActor = s.current;
      const ok = R.playCard(s, uid, choice);
      if (!ok) { this.refresh(); return; }
      if (from && card) { // the played card flies from the finger into the discard pile (D-037)
        const start = { left: from.x - 20, top: from.y - 28, width: 40, height: 56 };
        this.fly(start, rectOf($('#pile-discard')), cardHTML(card.def, card.poi >= 0), cardClass(card.def, card.poi >= 0), 420);
      }
      this.afterAction();
    },
    endTurn() {
      const s = this.state; if (!s || s.playedThisTurn < 1 || this.busy) return;
      this.renderer.prevPos = this.positions();
      this.lastActor = s.current;
      if (R.endTurn(s)) this.afterAction();
    },
    onCanvasClick(e) {
      const s = this.state; if (!s || this.drag) return;
      if (this.sel) { // tap mode: a tap on the board plays the selected card at that target
        if (this.previewAt(e.clientX, e.clientY)) this.commitSel(this.cardCenter(this.sel.uid));
        return;
      }
      const cell = this.renderer.cellFromPointer(e.clientX, e.clientY);
      if (!cell) return;
      const c = s.cells[hex.key(cell.col, cell.row)];
      const owner = c.owner ? s.players[c.owner].name : 'neutral';
      let txt = `Hex ${cell.col},${cell.row}: ${owner}${c.bonus ? ', +' + c.bonus + ' bonus' : ''}`;
      if (c.poi >= 0) { const poi = s.pois[c.poi], d = POIS[poi.type]; txt += ` · ${d.title} → ${CARDS[d.card].title}`; }
      const occ = R.occupant(s, cell);
      if (occ) { const w = s.players[occ].warband; txt += ` · ${s.players[occ].name} warband, ${w.minions} minions`; }
      $('#status-line').textContent = txt;
    },

    // ------------------------------------------------------------ overlays
    overlay(html) { const ov = $('#overlay'); ov.hidden = false; ov.innerHTML = `<div class="panel">${html}</div>`; return ov; },
    showPassPicker() {
      const s = this.state, p = this.current(); if (s.playedThisTurn > 0 || this.busy) return;
      const ov = this.overlay(`<h2>No playable cards</h2><p>Pick a card to discard — the turn passes to your opponent.</p><div class="pick-row" id="pass-row"></div><button class="btn ghost" id="pass-cancel">Cancel</button>`);
      const row = $('#pass-row');
      for (const card of p.hand) {
        const c = el('div', cardClass(card.def, card.poi >= 0), cardHTML(card.def, card.poi >= 0));
        c.addEventListener('click', () => { ov.hidden = true; this.renderer.prevPos = this.positions(); this.lastActor = s.current; R.passTurn(s, card.uid); this.afterAction(); });
        row.appendChild(c);
      }
      $('#pass-cancel').addEventListener('click', () => { ov.hidden = true; });
    },
    showHandover(p) {
      this.handoverPending = true; this.refresh();
      const ov = this.overlay(`<h2>${p.name}'s turn</h2><p>Pass the device.</p><button class="btn primary" id="btn-handover">Continue</button>`);
      $('#btn-handover').addEventListener('click', () => { ov.hidden = true; this.handoverPending = false; this.refresh(); });
    },
    showGameOver() {
      const s = this.state, sc = s.scores;
      const title = s.winner ? `${s.players[s.winner].name} win` : 'Draw';
      const reason = { elimination: 'Enemy warband destroyed', domination: 'The whole map captured', territory: 'More territory', 'tiebreak:pois': 'Tie-break: more outposts', 'tiebreak:minions': 'Tie-break: more minions', 'tiebreak:lastRound': 'Tie-break: more captured in the last round', draw: 'A perfect tie' }[s.endReason] || s.endReason;
      const row = (label, k) => `<tr><td>${label}</td><td class="c1">${sc[1][k]}</td><td class="c2">${sc[2][k]}</td></tr>`;
      this.overlay(`<h2 class="${s.winner ? 'w' + s.winner : ''}">${title}</h2><p>${reason}</p>
        <table class="score"><tr><th></th><th class="c1">${s.players[1].name}</th><th class="c2">${s.players[2].name}</th></tr>
        ${row('Territory points', 'territory')}${row('Hexes', 'cells')}${row('Outposts', 'pois')}${row('Minions', 'minions')}</table>
        <p class="muted">Seed ${s.seed} · ${s.roundLimit} rounds</p>
        <div class="row"><button class="btn primary" id="btn-rematch">Rematch</button><button class="btn ghost" id="btn-menu">Main menu</button></div>`);
      $('#btn-rematch').addEventListener('click', () => { this.opts.seed = (Math.random() * 0xffffffff) >>> 0; this.startGame(this.opts); });
      $('#btn-menu').addEventListener('click', () => this.toSetup());
    },
    showHelp() {
      const tap = this.setup.control === 'tap';
      const ov = this.overlay(`<div class="help"><h2>How to play</h2>
        <p><b>Turn.</b> At the start of your turn you draw up to 4 cards (when the deck runs out, the discard pile is shuffled into it). ${tap
          ? 'To play a card, tap it: a description panel appears over the hand and every target lights up on the board. Tap the hex you want — the warband acts at once and the card goes to the discard pile. A card without a target (Rally, Battle Cry…) is played by tapping the board or tapping the card again. Changed your mind — tap the description panel and the card stays in your hand.'
          : 'To play a card, drag it onto the board: the route is previewed, the warband acts as soon as you release the card, and the card goes to the discard pile. Release it over the hand and it returns.'} Play as many cards per turn as you like, at least one; after the first card an End Turn button appears in the rightmost slot. The control scheme can be switched in Settings → Controls.</p>
        <p><b>Directions.</b> A movement card sets only the shape and length of the route (straight, hook, zigzag, half-ring). Where to go is your choice: every possible end of the route is highlighted, and the one closest to where you release or tap is used. For Wide March the side is left or right of the warband.</p>
        <p><b>Territory.</b> Hexes you walk through take your colour. An area bounded only by your hexes — or by your hexes and the map edge — with no enemy hexes or warband inside becomes entirely yours. A fully enclosed area (no way out to the edge) is filled even with enemy hexes inside. <b>Outposts</b> are captured by walking through their hex or enclosing it; the card floating above an outpost flies straight into your hand (onto the deck if the hand is full). Every outpost card works instantly: Recruitment +6, Cordon captures the hexes around the warband, Explosive Charge hits an adjacent hex, Prayer returns the top discard card, Catapult hits at up to 3 hexes, Scouting refills the hand, Banner makes your hexes around the warband worth +1, Blink jumps over a hex. Losing an outpost takes the card away.</p>
        <p><b>Combat.</b> Warbands never fight on their own: to attack, run a movement card's route onto the enemy's hex — that step is highlighted red with a sword and the move ends there. While you aim, both warbands show their predicted losses and this panel says who falls back. Your warband charges the enemy's hex and both strike at once. Strength grows with the number of minions, but slower than the number itself (24 minions — about 5 damage, 12 — about 3, 6 — about 2); Battle Cry adds +2 to your next strike, Formation reduces every incoming strike by 2. After the exchange the warband with fewer minions falls back one hex (the attacker to where it came from; the defender away from the attacker, and then the attacker takes its hex); on equal numbers the attacker falls back. One attack per turn. Volley and Catapult strike from a distance with no retaliation.</p>
        <p><b>Victory</b>: destroy the enemy warband, capture the whole map, or have more territory points when the round limit is reached. Tie-breaks: outposts → minions → captured in the last round.</p>
        <p class="muted">Pictograms: arrows — movement (chevrons = number of steps), figures — minions, sword — attack, shield — defence, flag — territory points.</p>
        <button class="btn primary" id="btn-help-close">Got it</button></div>`);
      $('#btn-help-close').addEventListener('click', () => { ov.hidden = true; });
    },
    appendLog(lines) {
      const box = $('#log-lines');
      for (const t of lines) box.appendChild(el('div', 'log-line', t));
      box.scrollTop = box.scrollHeight;
    },
  };
  function hashStr(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  window.addEventListener('DOMContentLoaded', () => { UI.initSetup(); UI.initMenu(); });
  HB.UI = UI;
})();
