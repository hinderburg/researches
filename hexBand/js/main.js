// UI glue: setup screen, drag-and-drop hand (D-028), bot turns, hotseat hand-over, results.
window.HB = window.HB || {};
(function () {
  const R = HB.rules, hex = HB.hex, CFG = HB.CONFIG, CARDS = HB.cards.CARDS, POIS = HB.cards.POIS, PRESETS = HB.cards.PRESETS;
  const $ = sel => document.querySelector(sel);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const KIND_CLASS = { move: 'k-move', charge: 'k-combat', sidestep: 'k-move', zigzag: 'k-move', blink: 'k-move', reinforce: 'k-reinf', buff_next: 'k-combat', rear_assault: 'k-combat', explosive: 'k-combat', blessing: 'k-combat', formation: 'k-def', overwatch: 'k-def', shields: 'k-def', split: 'k-terr', claim: 'k-terr', scout: 'k-util' };
  const cardHTML = (defId, poi) => { const d = CARDS[defId]; return `<div class="card-icon">${HB.icons.svg(defId)}</div><div class="card-name">${d.ru}</div>${poi ? '<div class="card-poi">POI</div>' : ''}`; };

  const UI = {
    state: null, renderer: null, busy: false, opts: null, drag: null, lastActor: null, handoverPending: false,
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
      $('#sel-bot-preset').addEventListener('change', e => { S.botPreset = e.target.value; this.renderSetup(); });
      $('#btn-start').addEventListener('click', () => this.startFromSetup());
      $('#btn-help').addEventListener('click', () => this.showHelp());
      $('#btn-help-game').addEventListener('click', () => this.showHelp());
      this.renderSetup();
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
      this.opts = { seed, roundLimit: S.rounds, players: { 1: { deck: S.p[1].cards, pois: S.p[1].pois, bot: false, name: 'Синие' }, 2: p2 } };
      this.startGame(this.opts);
    },

    // ------------------------------------------------------------ game
    startGame(opts) {
      this.state = R.createGame(opts);
      this.lastActor = null; this.handoverPending = false; this.busy = false;
      $('#setup').hidden = true; $('#game').hidden = false; $('#overlay').hidden = true;
      if (!this.renderer) {
        this.renderer = new HB.Renderer($('#board'));
        $('#board').addEventListener('click', e => this.onCanvasClick(e));
        window.addEventListener('resize', () => this.layout());
        if (window.ResizeObserver) new ResizeObserver(() => this.layout()).observe($('#board-wrap'));
        $('#btn-end').addEventListener('click', () => this.endTurn());
        $('#btn-pass').addEventListener('click', () => this.showPassPicker());
        $('#btn-quit').addEventListener('click', () => this.toSetup());
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
      const r = wrap.getBoundingClientRect();
      this.renderer.resize(Math.floor(r.width), Math.floor(r.height));
    },
    current() { return this.state.players[this.state.current]; },

    nextTurn() {
      const s = this.state;
      if (s.phase === 'over') { this.showGameOver(); return; }
      const p = this.current();
      this.refresh();
      if (p.bot) { this.busy = true; this.refresh(); setTimeout(() => this.botMove(), CFG.BOT_DELAY_MS); }
      else if (this.opts.players[2].bot === false && this.lastActor && this.lastActor !== p.id) this.showHandover(p);
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
      this.appendLog(events.filter(e => e.type === 'log').map(e => e.text));
      const dur = this.renderer.applyEvents(events);
      this.renderer.highlights = []; this.renderer.pathFrom = null;
      this.busy = true; this.refresh();
      setTimeout(() => { this.busy = false; this.refresh(); this.nextTurn(); }, Math.min(dur, 2500) + 150);
    },

    // ------------------------------------------------------------ HUD & hand
    refresh() {
      const s = this.state; if (!s) return;
      const total = R.totalCells(s), sc = R.scoreboard(s);
      for (const pid of [1, 2]) {
        const p = s.players[pid];
        $(`#hud-${pid} .hud-name`).textContent = p.name;
        $(`#hud-${pid} .hud-terr`).textContent = sc[pid].territory;
        $(`#hud-${pid} .hud-pct`).textContent = Math.round(sc[pid].cells / total * 100) + '%';
        $(`#hud-${pid} .hud-min`).textContent = p.warband.minions;
        $(`#hud-${pid} .hud-poi`).textContent = sc[pid].pois;
        $(`#hud-${pid}`).classList.toggle('active', s.current === pid && s.phase === 'play');
      }
      $('#hud-round').textContent = `Раунд ${R.round(s)} / ${s.roundLimit}`;
      const p = this.current();
      const hand = $('#hand'); hand.innerHTML = '';
      const hideHand = p.bot || this.handoverPending;
      for (const card of p.hand) {
        const d = CARDS[card.def], play = R.getPlay(s, card);
        const c = el('div', 'card ' + (KIND_CLASS[d.kind] || '') + (play.ok ? '' : ' disabled') + (card.poi >= 0 ? ' poi' : ''), cardHTML(card.def, card.poi >= 0));
        c.dataset.uid = card.uid;
        if (hideHand) c.classList.add('hidden-card');
        hand.appendChild(c);
      }
      for (let i = p.hand.length; i < CFG.HAND_SIZE; i++) hand.appendChild(el('div', 'card empty', ''));
      $('#hand-title').textContent = `${p.name} · колода ${p.deck.length} · сброс ${p.discard.length}`;
      $('#status-line').textContent = this.statusText(p);
      const busy = this.busy || p.bot || s.phase !== 'play' || this.handoverPending;
      $('#btn-end').hidden = busy; $('#btn-end').disabled = s.playedThisTurn < 1;
      $('#btn-end').classList.toggle('primary', s.playedThisTurn >= 1);
      $('#btn-pass').hidden = busy || s.playedThisTurn > 0;
      if (!this.drag) $('#prompt').textContent = this.promptText(p, busy);
    },
    promptText(p, busy) {
      const s = this.state;
      if (s.phase !== 'play') return 'Матч окончен.';
      if (p.bot) return `${p.name} думают…`;
      if (busy) return '…';
      const n = s.playedThisTurn;
      return n ? `Сыграно карт: ${n}. Перетащите ещё карту на поле или завершите ход.` : 'Перетащите карту на поле, чтобы сыграть её.';
    },
    statusText(p) {
      const s = this.state, st = p.status, out = [];
      if (st.nextAttackMult !== 1) out.push(`Боевой клич ×${st.nextAttackMult.toFixed(2)}`);
      if (st.rearAssault) out.push('Удар в спину');
      if (R.active(s, st.blessingUntil)) out.push('Благословение +15%');
      if (R.active(s, st.formationUntil)) out.push('Плотный строй');
      if (R.active(s, st.forcedUntil)) out.push('Форс-марш −15% защиты');
      if (R.active(s, st.overwatchUntil)) out.push('Дозор');
      if (st.shieldsOnce) out.push('Крепкие щиты');
      if (st.splitSteps) out.push(`Широкий марш ×${st.splitSteps}`);
      if (st.claimSteps) out.push(`Знамя ×${st.claimSteps}`);
      return out.length ? 'Эффекты: ' + out.join(', ') : '';
    },

    // ------------------------------------------------------------ drag & drop (D-028)
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
    startDrag(e, uid, cardEl) {
      const s = this.state, p = this.current();
      if (!s || this.busy || p.bot || s.phase !== 'play' || this.handoverPending) return;
      const card = p.hand.find(c => c.uid === uid); if (!card) return;
      const play = R.getPlay(s, card), d = CARDS[card.def];
      $('#prompt').textContent = `${d.ru}: ${d.text}`;
      if (!play.ok) { cardEl.classList.add('shake'); setTimeout(() => cardEl.classList.remove('shake'), 400); return; }
      if (d.kind === 'scout') play.options = R.scoutOptions(s, p);
      const ghost = cardEl.cloneNode(true); ghost.classList.add('ghost'); ghost.classList.remove('hidden-card');
      document.body.appendChild(ghost);
      cardEl.classList.add('lifted');
      this.drag = { uid, card, def: d, play, ghost, cardEl, pointerId: e.pointerId, choice: null, over: false, offX: cardEl.offsetWidth / 2, offY: cardEl.offsetHeight * 0.7 };
      this.renderer.dragging = true;
      this.renderer.pathFrom = { col: p.warband.col, row: p.warband.row };
      this.moveDrag(e);
    },
    moveDrag(e) {
      const dg = this.drag, s = this.state, p = this.current(), rd = this.renderer;
      dg.ghost.style.left = (e.clientX - dg.offX) + 'px'; dg.ghost.style.top = (e.clientY - dg.offY) + 'px';
      const br = $('#board').getBoundingClientRect();
      dg.over = e.clientX >= br.left && e.clientX <= br.right && e.clientY >= br.top && e.clientY <= br.bottom;
      const hl = [], play = dg.play, kind = dg.def.kind;
      dg.choice = null; dg.valid = false;
      if (play.options && (kind === 'sidestep' || kind === 'zigzag' || kind === 'split')) {
        const wx = rd.warbandScreenX(p.id), side = e.clientX < wx ? -1 : 1;
        const opt = play.options.find(o => o.side === side) || play.options[0];
        dg.choice = opt; dg.valid = true;
        for (const o of play.options) if (o.path) o.path.forEach((c, i) => hl.push({ col: c.col, row: c.row, kind: 'path', label: o === opt ? i + 1 : null, strong: o === opt }));
        if (kind === 'split') { const w = p.warband; for (const o of play.options) { const n = hex.neighbor(w.col, w.row, o.side < 0 ? (p.id === 1 ? 5 : 4) : (p.id === 1 ? 1 : 2)); hl.push({ col: n.col, row: n.row, kind: 'target', strong: o === opt }); } }
      } else if (kind === 'explosive') {
        const cell = dg.over ? rd.cellFromPointer(e.clientX, e.clientY) : null;
        const opt = cell && play.options.find(o => o.cell.col === cell.col && o.cell.row === cell.row);
        dg.choice = opt || null; dg.valid = !!opt;
        for (const o of play.options) hl.push({ col: o.cell.col, row: o.cell.row, kind: 'target', strong: o === opt });
      } else if (kind === 'scout') {
        dg.valid = true;
      } else {
        dg.valid = true;
        if (play.path) play.path.forEach((c, i) => hl.push({ col: c.col, row: c.row, kind: 'path', label: i + 1, strong: dg.over }));
      }
      rd.highlights = hl;
      dg.ghost.classList.toggle('drop-ok', dg.over && dg.valid);
      $('#hand-area').classList.toggle('drop-cancel', !dg.over);
    },
    endDrag(e, drop) {
      const dg = this.drag; if (!dg) return;
      this.drag = null;
      dg.ghost.remove(); dg.cardEl.classList.remove('lifted');
      $('#hand-area').classList.remove('drop-cancel');
      this.renderer.highlights = []; this.renderer.pathFrom = null; this.renderer.dragging = false;
      if (drop && dg.over && dg.valid) {
        if (dg.def.kind === 'scout') { this.showScoutPicker(dg); return; }
        this.commit(dg.uid, dg.choice);
        return;
      }
      this.refresh();
    },
    commit(uid, choice) {
      const s = this.state;
      this.renderer.prevPos = this.positions();
      this.lastActor = s.current;
      const ok = R.playCard(s, uid, choice);
      if (!ok) { this.refresh(); return; }
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
      if (occ) { const w = s.players[occ].warband; txt += ` · отряд ${s.players[occ].name}, ${w.minions} миньонов, смотрит ${hex.DIR_NAMES[w.facing]}`; }
      $('#prompt').textContent = txt;
    },

    // ------------------------------------------------------------ overlays
    overlay(html) { const ov = $('#overlay'); ov.hidden = false; ov.innerHTML = `<div class="panel">${html}</div>`; return ov; },
    showScoutPicker(dg) {
      const ov = this.overlay(`<h2>Разведка</h2><p>Выберите карту, которая ляжет наверх колоды.</p><div class="pick-row" id="scout-row"></div><button class="btn ghost" id="scout-cancel">Отмена</button>`);
      const row = $('#scout-row');
      for (const o of dg.play.options) {
        const uid = o.uid, defId = this.current().deck.find(c => c.uid === uid).def;
        const c = el('div', 'card ' + (KIND_CLASS[CARDS[defId].kind] || ''), cardHTML(defId, CARDS[defId].poi));
        c.addEventListener('click', () => { ov.hidden = true; this.commit(dg.uid, o); });
        row.appendChild(c);
      }
      $('#scout-cancel').addEventListener('click', () => { ov.hidden = true; this.refresh(); });
    },
    showPassPicker() {
      const s = this.state, p = this.current(); if (s.playedThisTurn > 0 || this.busy) return;
      const ov = this.overlay(`<h2>Пропустить ход</h2><p>Выберите карту, которая уйдёт в сброс.</p><div class="pick-row" id="pass-row"></div><button class="btn ghost" id="pass-cancel">Отмена</button>`);
      const row = $('#pass-row');
      for (const card of p.hand) {
        const c = el('div', 'card ' + (KIND_CLASS[CARDS[card.def].kind] || ''), cardHTML(card.def, card.poi >= 0));
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
        <p><b>Ход.</b> В начале хода рука добирается до 4 карт. Чтобы сыграть карту, перетащите её на поле: маршрут показывается заранее, отряд выполняет действие сразу после того, как вы отпустите карту. Отпустите карту над рукой — она вернётся на место. За ход можно сыграть сколько угодно карт, минимум одну; затем «Завершить ход».</p>
        <p><b>Направления.</b> «Вперёд» — всегда вверх по экрану (к противнику), «назад» — вниз, влево/вправо — по экрану. Для карт с выбором стороны (Шаг вбок, Зигзаг, Широкий марш) сторона определяется тем, слева или справа от отряда вы отпустили карту.</p>
        <p><b>Территория.</b> Пройденные гексы окрашиваются в ваш цвет. Если ваши гексы замыкают область, всё внутри становится вашим. <b>Форпосты</b> захватываются проходом через гекс или замыканием контура; карта, парящая над форпостом, — та, что вы получите в колоду.</p>
        <p><b>Бой.</b> Отряд смотрит туда, куда шёл последним. После вашей карты бой начинается автоматически, если противник стоит рядом в одном из трёх гексов перед вашим отрядом. Урон зависит от того, откуда вы бьёте относительно его взгляда: фронт ×1.0, фланг ×1.25, спина ×1.5.</p>
        <p><b>Победа</b>: уничтожить отряд противника или иметь больше очков территории после лимита раундов.</p>
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
