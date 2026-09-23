// UI glue: setup screen, hand with piles (D-037), drag-to-play with a glowing cursor FX (D-028, D-036), bot turns,
// hotseat hand-over, results.
window.HB = window.HB || {};
(function () {
  const R = HB.rules, hex = HB.hex, CFG = HB.CONFIG, CARDS = HB.cards.CARDS, POIS = HB.cards.POIS, PRESETS = HB.cards.PRESETS;
  const $ = sel => document.querySelector(sel);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const KIND_CLASS = { move: 'k-move', blink: 'k-move', reinforce: 'k-reinf', buff_next: 'k-combat', explosive: 'k-combat', volley: 'k-combat', catapult: 'k-combat', formation: 'k-def', flank_claim: 'k-terr', cordon: 'k-terr', banner: 'k-terr', prayer: 'k-util', scout_draw: 'k-util' };
  const cardHTML = (defId, poi) => { const d = CARDS[defId]; return `<div class="card-icon">${HB.icons.svg(defId)}</div><div class="card-name">${d.ru}</div>${poi ? '<div class="card-poi">POI</div>' : ''}`; };
  const cardClass = (defId, poi) => 'card ' + (KIND_CLASS[CARDS[defId].kind] || '') + (poi ? ' poi' : '');
  const rectOf = e => e.getBoundingClientRect();

  const UI = {
    state: null, renderer: null, busy: false, opts: null, drag: null, lastActor: null, handoverPending: false, lastEvents: [], pendingIncoming: new Set(),
    // whose hand the bottom panel shows: the human in bot mode, the current player in hotseat (D-044)
    handPlayer() { const s = this.state; return this.opts && this.opts.players[2].bot ? s.players[1] : s.players[s.current]; },
    setup: { mode: 'bot', rounds: CFG.ROUND_LIMIT, seed: '', p: { 1: null, 2: null }, botPreset: 'balanced' },

    // ------------------------------------------------------------ setup screen
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
      $('#btn-start').addEventListener('click', () => this.startFromSetup());
      $('#btn-help').addEventListener('click', () => this.showHelp());
      $('#btn-help-game').addEventListener('click', () => this.showHelp());
      $('#btn-intro').addEventListener('click', () => this.showIntro(true));
      this.renderSetup();
      let skip = false; try { skip = localStorage.getItem('hexband.introSeen') === '1'; } catch (e) {}
      if (!skip) this.showIntro(false);
    },
    showIntro(manual) {
      const ic = id => `<span class="intro-ic">${HB.icons.svg(id)}</span>`;
      const ov = this.overlay(`<div class="intro">
        <h2>HEXBand — как это работает</h2>
        <div class="intro-item">${ic('hook')}<div><b>Ходите картами.</b> Перетащите карту на поле: карта задаёт форму маршрута, а куда идти — решаете вы, отпустив её в нужной стороне. Отряд идёт сразу. За ход можно сыграть сколько угодно карт, минимум одну; затем «Закончить ход».</div></div>
        <div class="intro-item">${ic('ring')}<div><b>Захватывайте территорию.</b> Каждый пройденный гекс становится вашим. Замкните область своими гексами — всё внутри тоже станет вашим. Очки = ваши гексы.</div></div>
        <div class="intro-item">${ic('recruitment')}<div><b>Берите форпосты.</b> Пройдите через форпост или обведите его контуром. Карта, парящая над ним, сразу прилетает вам в руку — её эффект срабатывает мгновенно. Потеряете форпост — потеряете и карту.</div></div>
        <div class="intro-item">${ic('battle_cry')}<div><b>Бой.</b> Чтобы атаковать, доведите маршрут карты до гекса противника (он подсветится красным) — игра сразу покажет прогноз: сколько потеряет каждый отряд и кто отступит. Больше миньонов — сильнее удар, но карты позволяют выиграть обмен и меньшей армией. Не больше одной атаки за ход.</div></div>
        <div class="intro-item">${ic('claim')}<div><b>Победа.</b> Уничтожили отряд противника — победа сразу. Иначе после ${this.setup.rounds} раундов побеждает тот, у кого больше очков территории.</div></div>
        <label class="radio intro-skip"><input type="checkbox" id="intro-skip"> Больше не показывать</label>
        <button class="btn primary" id="btn-intro-close">${manual ? 'Понятно' : 'К настройке матча'}</button></div>`);
      $('#btn-intro-close').addEventListener('click', () => {
        ov.hidden = true;
        if ($('#intro-skip').checked) { try { localStorage.setItem('hexband.introSeen', '1'); } catch (e) {} }
      });
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
      root.appendChild(el('h3', null, pid === 1 ? 'Синие (вы)' : 'Красные'));
      const presets = el('div', 'presets');
      for (const key in PRESETS) {
        const b = el('button', 'chip', PRESETS[key].ru);
        b.addEventListener('click', () => { sel.cards = PRESETS[key].cards.slice(); sel.pois = PRESETS[key].pois.slice(); this.renderBuilder(pid); this.validateSetup(); });
        presets.appendChild(b);
      }
      root.appendChild(presets);
      root.appendChild(el('div', 'builder-label', `Колода: <b>${sel.cards.length}</b>/${CFG.DECK_SIZE}`));
      const grid = el('div', 'pick-grid');
      for (const id of HB.cards.DECK_POOL) {
        const d = CARDS[id], on = sel.cards.includes(id);
        const c = el('div', 'pick' + (on ? ' on' : '') + (HB.cards.ADVANCED_POOL.includes(id) ? ' adv' : ''), `<div class="pick-icon">${HB.icons.svg(id)}</div><div class="pick-name">${d.ru}</div><div class="pick-type">${d.name} · ${d.type}</div><div class="pick-text">${d.text}</div>`);
        c.addEventListener('click', () => {
          if (on) sel.cards = sel.cards.filter(x => x !== id); else if (sel.cards.length < CFG.DECK_SIZE) sel.cards.push(id); else return;
          this.renderBuilder(pid); this.validateSetup();
        });
        grid.appendChild(c);
      }
      root.appendChild(grid);
      root.appendChild(el('div', 'builder-label', `Точки интереса (слева направо: у себя, посередине, у центра): <b>${sel.pois.length}</b>/${CFG.POI_PICKS}`));
      const pg = el('div', 'pick-grid pois');
      for (const id of HB.cards.POI_POOL) {
        const d = POIS[id], on = sel.pois.includes(id), idx = sel.pois.indexOf(id);
        const c = el('div', 'pick' + (on ? ' on' : ''), `<div class="pick-icon">${HB.icons.svg(d.card)}</div><div class="pick-name">${on ? (idx + 1) + '. ' : ''}${d.ru}</div><div class="pick-type">${d.name} → ${CARDS[d.card].ru}</div><div class="pick-text">${d.text}</div>`);
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
      $('#setup-hint').textContent = ok ? '' : `Нужно выбрать ровно ${CFG.DECK_SIZE} карт и ${CFG.POI_PICKS} точки интереса для каждого игрока.`;
    },
    startFromSetup() {
      const S = this.setup;
      const p2 = S.mode === 'bot' ? { deck: PRESETS[S.botPreset].cards.slice(), pois: PRESETS[S.botPreset].pois.slice(), bot: true, name: 'Красные (бот)' }
        : { deck: S.p[2].cards, pois: S.p[2].pois, bot: false, name: 'Красные' };
      const seed = S.seed.trim() ? (parseInt(S.seed, 10) || hashStr(S.seed)) : (Math.random() * 0xffffffff) >>> 0;
      this.opts = { seed, roundLimit: S.rounds, attackLimit: S.attacks != null ? S.attacks : CFG.ATTACKS_PER_TURN, players: { 1: { deck: S.p[1].cards, pois: S.p[1].pois, bot: false, name: 'Синие' }, 2: p2 } };
      this.startGame(this.opts);
    },

    // ------------------------------------------------------------ game
    startGame(opts) {
      this.state = R.createGame(opts);
      this.lastActor = null; this.handoverPending = false; this.busy = false; this.lastEvents = []; this.pendingIncoming = new Set();
      $('#setup').hidden = true; $('#game').hidden = false; $('#overlay').hidden = true;
      if (!this.renderer) {
        this.renderer = new HB.Renderer($('#board'));
        $('#board').addEventListener('click', e => this.onCanvasClick(e));
        window.addEventListener('resize', () => this.layout());
        if (window.ResizeObserver) new ResizeObserver(() => this.layout()).observe($('#board-wrap'));
        $('#btn-quit').addEventListener('click', () => this.toSetup());
        $('#btn-pass').addEventListener('click', () => this.showPassPicker());
        $('#btn-end-fb').addEventListener('click', () => this.endTurn());
        this.bindDrag();
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
    toSetup() { $('#game').hidden = true; $('#overlay').hidden = true; $('#setup').hidden = false; this.state = null; },
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
      $('#hud-round').textContent = `Раунд ${R.round(s)} / ${s.roundLimit}`;
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
          slot.appendChild(c);
        } else if (i === CFG.HAND_SIZE - 1 && s.playedThisTurn >= 1 && !busy) {
          const b = el('button', 'btn end-turn', 'Закончить<br>ход');
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
      $('#status-line').textContent = busy ? (!mine && s.phase === 'play' ? `Ход: ${this.current().name}…` : '') : this.statusText(p);
      $('#btn-pass').hidden = busy || s.playedThisTurn > 0 || playable.some(x => x);
      // a full hand (outpost card arrived) leaves no slot for the end-turn button — show a fallback under the hand
      $('#btn-end-fb').hidden = busy || s.playedThisTurn < 1 || p.hand.length < CFG.HAND_SIZE;
    },
    statusText(p) {
      const s = this.state, st = p.status, out = [];
      if (st.attackBonus) out.push(`Боевой клич +${st.attackBonus}`);
      if (R.active(s, st.counterUntil)) out.push('Ответный удар');
      if (R.active(s, st.blessingUntil)) out.push('Благословение +15%');
      if (R.active(s, st.formationUntil)) out.push('Плотный строй');
      if (R.active(s, st.forcedUntil)) out.push('Форс-марш −15% защиты');
      if (R.active(s, st.overwatchUntil)) out.push('Дозор');
      if (st.shieldsOnce) out.push('Крепкие щиты');
      if (st.splitSteps) out.push(`Широкий марш ×${st.splitSteps}`);
      if (st.claimSteps) out.push(`Знамя ×${st.claimSteps}`);
      return out.length ? 'Эффекты: ' + out.join(', ') : '';
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
        const cardEl = e.target.closest('.card'); if (!cardEl || !cardEl.dataset.uid) return;
        e.preventDefault();
        this.startDrag(e, +cardEl.dataset.uid, cardEl);
      });
      window.addEventListener('pointermove', e => { if (this.drag && e.pointerId === this.drag.pointerId) this.moveDrag(e); });
      window.addEventListener('pointerup', e => { if (this.drag && e.pointerId === this.drag.pointerId) this.endDrag(e, true); });
      window.addEventListener('pointercancel', e => { if (this.drag && e.pointerId === this.drag.pointerId) this.endDrag(e, false); });
    },
    // description of the dragged card over the hand zone; the footer explains that dropping it here cancels the play
    showDesc(title, text) {
      $('#card-desc').innerHTML = `<div class="desc-body"><b>${title}</b><span>${text}</span><div class="desc-forecast" hidden></div></div><div class="desc-cancel"><span class="desc-cancel-ic">↩</span><span>Передумали? Отпустите карту здесь — она вернётся в руку</span></div>`;
      $('#card-desc').hidden = false;
    },
    startDrag(e, uid, cardEl) {
      const s = this.state, p = this.handPlayer();
      if (!s || this.busy || s.current !== p.id || s.phase !== 'play' || this.handoverPending) return;
      const card = p.hand.find(c => c.uid === uid); if (!card) return;
      const play = R.getPlay(s, card), d = CARDS[card.def];
      this.showDesc(d.ru, d.text);
      if (!play.ok) { cardEl.classList.add('shake'); setTimeout(() => { cardEl.classList.remove('shake'); $('#card-desc').hidden = true; }, 700); return; }
      if (d.kind === 'scout') play.options = R.scoutOptions(s, p);
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
        this.showDesc(`${dg.def.ru}: ${opt.label}`, dg.def.text);
      } else if (kind === 'explosive') {
        const cell = dg.over ? rd.cellFromPointer(e.clientX, e.clientY) : null;
        const opt = cell && play.options.find(o => o.cell.col === cell.col && o.cell.row === cell.row);
        dg.choice = opt || null; dg.valid = !!opt;
        for (const o of play.options) hl.push({ col: o.cell.col, row: o.cell.row, kind: 'target', strong: o === opt });
      } else if (kind === 'scout') {
        dg.valid = true;
      } else {
        dg.valid = true;
        if (play.path) play.path.forEach((c, i) => hl.push({ col: c.col, row: c.row, kind: 'path', label: i + 1, strong: dg.over, attack: !!c.attack }));
      }
      rd.highlights = hl;
      // D-047: battle forecast while an attacking route (or a ranged card) is being aimed
      const enemy = s.players[3 - p.id];
      let fc = null;
      if (dg.valid && dg.choice && dg.choice.path && dg.choice.path.some(c => c.attack)) fc = R.forecast(s, p, enemy, 'clash');
      else if (dg.valid && dg.over && (kind === 'volley' || kind === 'catapult')) fc = R.forecast(s, p, enemy, kind);
      rd.forecast = fc ? Object.assign({ a: p.id, d: enemy.id }, fc) : null;
      const fcEl = $('#card-desc .desc-forecast');
      if (fcEl) {
        if (fc) {
          const outcome = { defenderRetreats: 'противник отступит, вы займёте его гекс', attackerRetreats: fc.aAfter === fc.dAfter ? 'равные силы — вы отступите' : 'вы отступите', ranged: 'без ответа',
            eliminated: fc.dAfter <= 0 && fc.aAfter <= 0 ? 'оба отряда погибнут — ничья' : fc.dAfter <= 0 ? 'отряд противника будет уничтожен' : 'ваш отряд будет уничтожен' }[fc.result];
          fcEl.innerHTML = `<b>Прогноз боя:</b> вы −${fc.dmgToAtt} (${p.warband.minions} → ${fc.aAfter}), противник −${fc.dmgToDef} (${enemy.warband.minions} → ${fc.dAfter}) — ${outcome}`;
          fcEl.hidden = false;
        } else fcEl.hidden = true;
      }
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
      const cell = this.renderer.cellFromPointer(e.clientX, e.clientY);
      if (!cell) return;
      const c = s.cells[hex.key(cell.col, cell.row)];
      const owner = c.owner ? s.players[c.owner].name : 'нейтральный';
      let txt = `Гекс ${cell.col},${cell.row}: ${owner}${c.bonus ? ', +' + c.bonus + ' бонус' : ''}`;
      if (c.poi >= 0) { const poi = s.pois[c.poi], d = POIS[poi.type]; txt += ` · ${d.ru} → «${CARDS[d.card].ru}»`; }
      const occ = R.occupant(s, cell);
      if (occ) { const w = s.players[occ].warband; txt += ` · отряд ${s.players[occ].name}, ${w.minions} миньонов`; }
      $('#status-line').textContent = txt;
    },

    // ------------------------------------------------------------ overlays
    overlay(html) { const ov = $('#overlay'); ov.hidden = false; ov.innerHTML = `<div class="panel">${html}</div>`; return ov; },
    showPassPicker() {
      const s = this.state, p = this.current(); if (s.playedThisTurn > 0 || this.busy) return;
      const ov = this.overlay(`<h2>Нет доступных ходов</h2><p>Выберите карту, которая уйдёт в сброс — ход перейдёт сопернику.</p><div class="pick-row" id="pass-row"></div><button class="btn ghost" id="pass-cancel">Отмена</button>`);
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
      const ov = this.overlay(`<h2>Ход: ${p.name}</h2><p>Передайте устройство.</p><button class="btn primary" id="btn-handover">Продолжить</button>`);
      $('#btn-handover').addEventListener('click', () => { ov.hidden = true; this.handoverPending = false; this.refresh(); });
    },
    showGameOver() {
      const s = this.state, sc = s.scores;
      const title = s.winner ? `Победа: ${s.players[s.winner].name}` : 'Ничья';
      const reason = { elimination: 'Отряд противника уничтожен', territory: 'Больше территории', 'tiebreak:pois': 'Тай-брейк: больше точек интереса', 'tiebreak:minions': 'Тай-брейк: больше миньонов', 'tiebreak:lastRound': 'Тай-брейк: захват в последнем раунде', draw: 'Полное равенство' }[s.endReason] || s.endReason;
      const row = (label, k) => `<tr><td>${label}</td><td class="c1">${sc[1][k]}</td><td class="c2">${sc[2][k]}</td></tr>`;
      this.overlay(`<h2 class="${s.winner ? 'w' + s.winner : ''}">${title}</h2><p>${reason}</p>
        <table class="score"><tr><th></th><th class="c1">${s.players[1].name}</th><th class="c2">${s.players[2].name}</th></tr>
        ${row('Очки территории', 'territory')}${row('Гексов', 'cells')}${row('Точек интереса', 'pois')}${row('Миньонов', 'minions')}</table>
        <p class="muted">Seed ${s.seed} · ${s.roundLimit} раундов</p>
        <div class="row"><button class="btn primary" id="btn-rematch">Реванш</button><button class="btn ghost" id="btn-menu">В меню</button></div>`);
      $('#btn-rematch').addEventListener('click', () => { this.opts.seed = (Math.random() * 0xffffffff) >>> 0; this.startGame(this.opts); });
      $('#btn-menu').addEventListener('click', () => this.toSetup());
    },
    showHelp() {
      const ov = this.overlay(`<div class="help"><h2>Как играть</h2>
        <p><b>Ход.</b> В начале хода рука добирается до 4 карт из колоды (если колода пуста, сброс перемешивается в колоду). Чтобы сыграть карту, перетащите её на поле: маршрут показывается заранее, отряд выполняет действие сразу после того, как вы отпустите карту, и она уходит в сброс. Отпустите над рукой — карта вернётся на место. За ход можно сыграть сколько угодно карт, минимум одну; после первой карты в правом слоте появляется «Закончить ход».</p>
        <p><b>Направления.</b> Карта движения задаёт только форму и длину маршрута (прямая, крюк, зигзаг, полукольцо, кольцо). Куда идти — решаете вы: пока тянете карту, на поле подсвечены все возможные концы маршрута, а выбирается тот, что ближе к точке, где вы отпустите карту. Для «Широкого марша» сторона — слева или справа от отряда.</p>
        <p><b>Территория.</b> Пройденные гексы окрашиваются в ваш цвет. Если ваши гексы замыкают область, всё внутри становится вашим. <b>Форпосты</b> захватываются проходом через гекс или замыканием контура; карта, парящая над форпостом, сразу прилетает в руку (если рука полна — ложится наверх колоды). Все карты форпостов срабатывают мгновенно: Вербовка +6, Оцепление красит гексы вокруг отряда, Взрывной заряд бьёт соседний гекс, Молитва возвращает верхнюю карту сброса, Катапульта бьёт на 3 гекса, Разведка добирает руку, Знамя даёт +1 очко вашим гексам вокруг отряда, Прыжок — через гекс. Потеря форпоста забирает карту.</p>
        <p><b>Бой.</b> Отряды не дерутся сами по себе: чтобы атаковать, доведите маршрут карты движения до гекса противника — этот шаг подсвечивается красным с мечом, и движение на нём заканчивается. Пока вы целитесь, у обоих отрядов показывается прогноз потерь, а в этой панели — кто отступит. Ваш отряд набегает на гекс противника, оба бьют одновременно. Сила удара растёт с числом миньонов, но медленнее, чем оно само (24 миньона — около 5 урона, 12 — около 3, 6 — около 2); «Боевой клич» даёт +2 к следующему удару, «Плотный строй» уменьшает каждый входящий удар на 2. После обмена отряд, в котором осталось меньше бойцов, отступает на гекс (атакующий — откуда пришёл, защитник — прочь от атакующего, и тогда атакующий занимает его гекс); при равенстве отступает атакующий. Не больше одной атаки за ход. «Залп» и «Катапульта» бьют на расстоянии без ответа.</p>
        <p><b>Победа</b>: уничтожить отряд противника или иметь больше очков территории после лимита раундов. Тай-брейк: точки → миньоны → захват в последнем раунде.</p>
        <p class="muted">Пиктограммы: стрелки — движение (шевроны = число шагов), фигурки — миньоны, меч — атака, щит — защита, глаз — дозор, флаг — очки территории.</p>
        <button class="btn primary" id="btn-help-close">Понятно</button></div>`);
      $('#btn-help-close').addEventListener('click', () => { ov.hidden = true; });
    },
    appendLog(lines) {
      const box = $('#log-lines');
      for (const t of lines) box.appendChild(el('div', 'log-line', t));
      box.scrollTop = box.scrollHeight;
    },
  };
  function hashStr(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  window.addEventListener('DOMContentLoaded', () => UI.initSetup());
  HB.UI = UI;
})();
