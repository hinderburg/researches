// UI glue: setup screen, hand, targeting, bot turns, hotseat hand-over, results.
window.HB = window.HB || {};
(function () {
  const R = HB.rules, hex = HB.hex, CFG = HB.CONFIG, CARDS = HB.cards.CARDS, POIS = HB.cards.POIS, PRESETS = HB.cards.PRESETS;
  const $ = sel => document.querySelector(sel);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

  const UI = {
    state: null, renderer: null, selected: null, play: null, options: null, busy: false, opts: null,
    setup: { mode: 'bot', rounds: CFG.ROUND_LIMIT, diagonal: CFG.DIAGONAL_STEP_TURNS, seed: '', p: { 1: null, 2: null }, botPreset: 'balanced' },

    // ------------------------------------------------------------ setup screen
    initSetup() {
      const S = this.setup;
      S.p[1] = { cards: PRESETS.balanced.cards.slice(), pois: PRESETS.balanced.pois.slice() };
      S.p[2] = { cards: PRESETS.duel.cards.slice(), pois: PRESETS.duel.pois.slice() };
      $('#setup-version').textContent = 'v' + CFG.VERSION;
      document.querySelectorAll('input[name=mode]').forEach(r => r.addEventListener('change', () => { S.mode = r.value; this.renderSetup(); }));
      $('#sel-rounds').value = String(S.rounds);
      $('#sel-rounds').addEventListener('change', e => S.rounds = +e.target.value);
      $('#chk-diagonal').checked = S.diagonal;
      $('#chk-diagonal').addEventListener('change', e => S.diagonal = e.target.checked);
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
        const b = el('button', 'chip', PRESETS[key].name);
        b.addEventListener('click', () => { sel.cards = PRESETS[key].cards.slice(); sel.pois = PRESETS[key].pois.slice(); this.renderBuilder(pid); this.validateSetup(); });
        presets.appendChild(b);
      }
      root.appendChild(presets);
      root.appendChild(el('div', 'builder-label', `Колода: <b class="cnt-cards">${sel.cards.length}</b>/${CFG.DECK_SIZE}`));
      const grid = el('div', 'pick-grid');
      for (const id of HB.cards.DECK_POOL) {
        const d = CARDS[id], on = sel.cards.includes(id);
        const c = el('div', 'pick' + (on ? ' on' : '') + (HB.cards.ADVANCED_POOL.includes(id) ? ' adv' : ''), `<div class="pick-name">${d.name}</div><div class="pick-type">${d.type}</div><div class="pick-text">${d.text}</div>`);
        c.addEventListener('click', () => {
          if (on) sel.cards = sel.cards.filter(x => x !== id); else if (sel.cards.length < CFG.DECK_SIZE) sel.cards.push(id); else return;
          this.renderBuilder(pid); this.validateSetup();
        });
        grid.appendChild(c);
      }
      root.appendChild(grid);
      root.appendChild(el('div', 'builder-label', `Точки интереса: <b>${sel.pois.length}</b>/${CFG.POI_PICKS}`));
      const pg = el('div', 'pick-grid pois');
      for (const id of HB.cards.POI_POOL) {
        const d = POIS[id], on = sel.pois.includes(id);
        const c = el('div', 'pick' + (on ? ' on' : ''), `<div class="pick-name"><span class="poi-icon">${d.icon}</span> ${d.name}</div><div class="pick-text">${d.text}</div>`);
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
      this.opts = { seed, roundLimit: S.rounds, diagonalTurns: S.diagonal, players: { 1: { deck: S.p[1].cards, pois: S.p[1].pois, bot: false, name: 'Синие' }, 2: p2 } };
      this.startGame(this.opts);
    },

    // ------------------------------------------------------------ game
    startGame(opts) {
      this.state = R.createGame(opts);
      $('#setup').hidden = true; $('#game').hidden = false; $('#overlay').hidden = true;
      if (!this.renderer) {
        this.renderer = new HB.Renderer($('#board'));
        $('#board').addEventListener('click', e => this.onCanvasClick(e));
        window.addEventListener('resize', () => this.layout());
        if (window.ResizeObserver) new ResizeObserver(() => this.layout()).observe($('#board-wrap'));
        $('#btn-play').addEventListener('click', () => this.commit(null));
        $('#btn-cancel').addEventListener('click', () => this.clearSelection());
        $('#btn-pass').addEventListener('click', () => this.pass());
        $('#btn-quit').addEventListener('click', () => this.toSetup());
      }
      this.renderer.setState(this.state);
      this.renderer.prevPos = this.positions();
      R.takeEvents(this.state);
      $('#log-lines').innerHTML = '';
      this.appendLog(this.state.log);
      this.layout();
      this.clearSelection();
      this.refresh();
      this.renderLegend();
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
      const s = this.state, move = HB.ai.choose(s);
      this.renderer.prevPos = this.positions();
      this.lastActor = s.current;
      if (move.pass) { if (move.uid != null) R.passTurn(s, move.uid); else s.turnIndex++; }
      else R.playCard(s, move.uid, move.choice);
      this.afterAction();
    },
    afterAction() {
      const s = this.state, events = R.takeEvents(s);
      this.appendLog(events.filter(e => e.type === 'log').map(e => e.text));
      const dur = this.renderer.applyEvents(events);
      this.clearSelection();
      this.busy = true; this.refresh();
      setTimeout(() => { this.busy = false; this.refresh(); this.nextTurn(); }, Math.min(dur, 2500) + 150);
    },

    // ------------------------------------------------------------ hand & targeting
    refresh() {
      const s = this.state; if (!s) return;
      const total = R.totalCells(s), sc = R.scoreboard(s);
      for (const pid of [1, 2]) {
        const p = s.players[pid];
        $(`#hud-${pid} .hud-name`).textContent = p.name;
        $(`#hud-${pid} .hud-terr`).textContent = Math.round(sc[pid].cells / total * 100) + '%';
        $(`#hud-${pid} .hud-min`).textContent = p.warband.minions;
        $(`#hud-${pid} .hud-poi`).textContent = sc[pid].pois;
        $(`#hud-${pid}`).classList.toggle('active', s.current === pid && s.phase === 'play');
      }
      $('#hud-round').textContent = `Раунд ${R.round(s)} / ${s.roundLimit}`;
      const p = this.current();
      const hand = $('#hand'); hand.innerHTML = '';
      const hideHand = p.bot || this.handoverPending;
      for (const card of p.hand) {
        const d = CARDS[card.def];
        const play = R.getPlay(s, card);
        const c = el('div', 'card' + (play.ok ? '' : ' disabled') + (this.selected === card.uid ? ' selected' : '') + (card.poi >= 0 ? ' poi' : ''),
          `<div class="card-type">${d.type}${card.poi >= 0 ? ' · POI' : ''}</div><div class="card-name">${d.name}</div><div class="card-text">${d.text}</div>`);
        if (hideHand) c.classList.add('hidden-card');
        c.addEventListener('click', () => this.onCardClick(card.uid));
        hand.appendChild(c);
      }
      $('#hand-title').textContent = `Рука · ${p.name} · колода ${p.deck.length} · сброс ${p.discard.length}`;
      $('#status-line').textContent = this.statusText(p);
      const busy = this.busy || p.bot || s.phase !== 'play';
      $('#btn-play').hidden = busy || !this.selected || !!(this.play && this.play.options);
      $('#btn-cancel').hidden = busy || !this.selected;
      $('#btn-pass').hidden = busy || !this.selected;
      $('#choice-row').innerHTML = '';
      if (!busy && this.selected && this.play && this.play.options && this.play.optionsUI === 'buttons') {
        for (const o of this.play.options) {
          const b = el('button', 'btn small', o.label);
          b.addEventListener('click', () => this.commit(o));
          $('#choice-row').appendChild(b);
        }
      }
      $('#prompt').textContent = this.promptText(p, busy);
    },
    promptText(p, busy) {
      const s = this.state;
      if (s.phase !== 'play') return 'Матч окончен.';
      if (p.bot) return `${p.name} думают…`;
      if (busy) return '…';
      if (!this.selected) return 'Выберите карту.';
      const d = CARDS[this.selectedCard().def];
      switch (d.kind) {
        case 'pivot': return 'Выберите новое направление на поле.';
        case 'explosive': return 'Выберите соседний гекс.';
        case 'hook': case 'split': return 'Выберите сторону.';
        case 'scout': return 'Выберите карту, которая ляжет наверх колоды.';
        default: return this.play.path && this.play.path.length ? 'Подтвердите ход (кнопка или клик по последнему гексу).' : 'Подтвердите розыгрыш.';
      }
    },
    statusText(p) {
      const s = this.state, st = p.status, out = [];
      if (st.nextAttackMult !== 1) out.push(`Battle Cry ×${st.nextAttackMult.toFixed(2)}`);
      if (st.rearAssault) out.push('Rear Assault');
      if (R.active(s, st.blessingUntil)) out.push('War Blessing +15%');
      if (R.active(s, st.formationUntil)) out.push('Reinforced Formation');
      if (R.active(s, st.forcedUntil)) out.push('Forced March −15% def');
      if (R.active(s, st.overwatchUntil)) out.push('Overwatch');
      if (st.shieldsOnce) out.push('Reinforced Shields');
      if (st.reversalOnce) out.push('Tactical Reversal');
      if (st.splitSteps) out.push(`Split March ×${st.splitSteps}`);
      if (st.claimSteps) out.push(`Claim ×${st.claimSteps}`);
      return out.length ? 'Эффекты: ' + out.join(', ') : '';
    },
    selectedCard() { return this.current().hand.find(c => c.uid === this.selected); },
    onCardClick(uid) {
      const s = this.state, p = this.current();
      if (this.busy || p.bot || s.phase !== 'play') return;
      if (this.selected === uid) { this.clearSelection(); return; }
      const card = p.hand.find(c => c.uid === uid), play = R.getPlay(s, card);
      if (!play.ok) return;
      this.selected = uid; this.play = play;
      const d = CARDS[card.def], w = p.warband;
      this.renderer.highlights = [];
      if (d.kind === 'scout') { play.options = R.scoutOptions(s, p); play.optionsUI = 'buttons'; }
      else if (play.options) {
        if (d.kind === 'pivot') { play.optionsUI = 'board'; for (const o of play.options) { const n = hex.neighbor(w.col, w.row, o.facing); o.cell = n; if (hex.exists(n.col, n.row, s.cols, s.rows)) this.renderer.highlights.push({ col: n.col, row: n.row, kind: 'facing', dir: o.facing }); } }
        else if (d.kind === 'explosive') { play.optionsUI = 'board'; for (const o of play.options) this.renderer.highlights.push({ col: o.cell.col, row: o.cell.row, kind: 'target' }); }
        else play.optionsUI = 'buttons';
      }
      if (play.path) play.path.forEach((c, i) => this.renderer.highlights.push({ col: c.col, row: c.row, kind: 'path', label: i + 1 }));
      this.refresh();
    },
    clearSelection() { this.selected = null; this.play = null; if (this.renderer) this.renderer.highlights = []; this.refresh(); },
    onCanvasClick(e) {
      const s = this.state; if (!s || this.busy || this.current().bot || s.phase !== 'play') return;
      const cell = this.renderer.cellFromPointer(e.clientX, e.clientY);
      if (!cell) return;
      if (!this.selected) { this.describeCell(cell); return; }
      const play = this.play;
      if (play.options && play.optionsUI === 'board') {
        const o = play.options.find(o => o.cell && o.cell.col === cell.col && o.cell.row === cell.row);
        if (o) this.commit(o);
        return;
      }
      if (play.path && play.path.length) {
        const last = play.path[play.path.length - 1];
        if (last.col === cell.col && last.row === cell.row) this.commit(null);
      }
    },
    describeCell(cell) {
      const s = this.state, c = s.cells[hex.key(cell.col, cell.row)];
      const owner = c.owner ? s.players[c.owner].name : 'нейтральный';
      let txt = `Гекс ${cell.col},${cell.row}: ${owner}${c.bonus ? ', +' + c.bonus + ' бонус' : ''}`;
      if (c.poi >= 0) { const poi = s.pois[c.poi], d = POIS[poi.type]; txt += ` · ${d.name} → ${CARDS[d.card].name}`; }
      const occ = R.occupant(s, cell);
      if (occ) { const w = s.players[occ].warband; txt += ` · отряд ${s.players[occ].name}, ${w.minions} миньонов, смотрит ${hex.DIR_NAMES[w.facing]}`; }
      $('#prompt').textContent = txt;
    },
    commit(choice) {
      const s = this.state; if (!this.selected) return;
      this.renderer.prevPos = this.positions();
      this.lastActor = s.current;
      const ok = R.playCard(s, this.selected, choice);
      if (!ok) { this.clearSelection(); return; }
      this.afterAction();
    },
    pass() {
      const s = this.state; if (!this.selected) return;
      this.renderer.prevPos = this.positions();
      this.lastActor = s.current;
      R.passTurn(s, this.selected);
      this.afterAction();
    },

    // ------------------------------------------------------------ overlays
    showHandover(p) {
      this.handoverPending = true; this.refresh();
      const ov = $('#overlay'); ov.hidden = false;
      ov.innerHTML = `<div class="panel"><h2>Ход: ${p.name}</h2><p>Передайте устройство.</p><button class="btn" id="btn-handover">Продолжить</button></div>`;
      $('#btn-handover').addEventListener('click', () => { ov.hidden = true; this.handoverPending = false; this.refresh(); });
    },
    showGameOver() {
      const s = this.state, sc = s.scores, ov = $('#overlay');
      const title = s.winner ? `Победа: ${s.players[s.winner].name}` : 'Ничья';
      const reason = { elimination: 'Отряд противника уничтожен', territory: 'Больше территории', 'tiebrek': '', 'tiebreak:pois': 'Тай-брейк: больше POI', 'tiebreak:minions': 'Тай-брейк: больше миньонов', 'tiebreak:lastRound': 'Тай-брейк: захват в последнем раунде', draw: 'Полное равенство' }[s.endReason] || s.endReason;
      const row = (label, k) => `<tr><td>${label}</td><td class="c1">${sc[1][k]}</td><td class="c2">${sc[2][k]}</td></tr>`;
      ov.hidden = false;
      ov.innerHTML = `<div class="panel"><h2 class="${s.winner ? 'w' + s.winner : ''}">${title}</h2><p>${reason}</p>
        <table class="score"><tr><th></th><th class="c1">${s.players[1].name}</th><th class="c2">${s.players[2].name}</th></tr>
        ${row('Territory Points', 'territory')}${row('Гексов', 'cells')}${row('POI', 'pois')}${row('Миньонов', 'minions')}</table>
        <p class="muted">Seed ${s.seed} · ${s.roundLimit} раундов</p>
        <div class="row"><button class="btn" id="btn-rematch">Реванш</button><button class="btn ghost" id="btn-menu">В меню</button></div></div>`;
      $('#btn-rematch').addEventListener('click', () => { this.opts.seed = (Math.random() * 0xffffffff) >>> 0; this.lastActor = null; this.startGame(this.opts); });
      $('#btn-menu').addEventListener('click', () => this.toSetup());
    },
    showHelp() {
      const ov = $('#overlay'); ov.hidden = false;
      ov.innerHTML = `<div class="panel help"><h2>Как играть</h2>
        <p>Каждый ход: рука добирается до 4 карт, вы разыгрываете <b>одну</b>. Пройденные гексы окрашиваются в ваш цвет. Если ваши гексы замыкают область, всё внутри становится вашим.</p>
        <p><b>POI</b> захватываются проходом через гекс или замыканием контура и дают временную карту в колоду. Потеря POI забирает карту.</p>
        <p><b>Бой</b> начинается автоматически после вашей карты, если противник стоит на соседнем гексе в одном из трёх фронтальных направлений вашего отряда. Урон зависит от того, где вы стоите относительно взгляда противника: фронт ×1.0, фланг (задние диагонали) ×1.25, спина ×1.5.</p>
        <p><b>Победа</b>: уничтожить отряд противника или иметь больше Territory Points после лимита раундов. Тай-брейк: POI → миньоны → захват в последнем раунде.</p>
        <p class="muted">Клик по гексу без выбранной карты показывает информацию о нём. Пропуск хода сбрасывает выбранную карту.</p>
        <button class="btn" id="btn-help-close">Понятно</button></div>`;
      $('#btn-help-close').addEventListener('click', () => { ov.hidden = true; });
    },
    renderLegend() {
      const s = this.state, box = $('#legend'); box.innerHTML = '';
      const seen = new Set();
      for (const poi of s.pois) { if (seen.has(poi.type)) continue; seen.add(poi.type); const d = POIS[poi.type]; box.appendChild(el('span', 'legend-item', `<b>${d.icon}</b> ${d.name} → ${CARDS[d.card].name}`)); }
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
