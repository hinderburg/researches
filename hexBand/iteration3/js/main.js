// UI glue: main menu (D-051), the camp (loadout builder, D-085), hand with piles (D-037), drag-to-play (D-028/D-036)
// and tap-to-play (D-046/D-048), bot turns, hotseat hand-over, results. All player-facing text is English (D-052).
window.HB = window.HB || {};
(function () {
  const R = HB.rules, hex = HB.hex, CFG = HB.CONFIG, CARDS = HB.cards.CARDS, TYPES = HB.cards.MINION_TYPES, PRESETS = HB.cards.LOADOUTS;
  const TYPE_ORDER = HB.cards.TYPE_ORDER, HERO_POOL = HB.cards.HERO_POOL, iconOf = HB.cards.iconOf;
  const $ = sel => document.querySelector(sel);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const KIND_CLASS = { hero_move: 'k-move', sortie: 'k-sortie', recall: 'k-util', war_cry: 'k-combat', fortify: 'k-def', volley: 'k-combat', scorch: 'k-combat', palisade: 'k-def', bless: 'k-reinf', call: 'k-reinf' };
  // D-085/D-088: a minion card carries a strip in its type colour with the emblem and the name; Overlord cards a gold crown strip
  const cardHTML = defId => {
    const d = CARDS[defId], t = TYPES[d.owner];
    const tag = t ? `<div class="card-type" style="--tc:${t.color}">${HB.icons.svg('t_' + d.owner)}<span>${t.title}</span></div>` : '<div class="card-type hero"><b>♛</b><span>Overlord</span></div>'; // D-088: a header strip
    return `${tag}<div class="card-icon">${HB.icons.svg(iconOf(defId))}</div><div class="card-name">${d.title}</div>`;
  };
  const cardClass = defId => 'card ' + (KIND_CLASS[CARDS[defId].kind] || '') + (CARDS[defId].owner === 'hero' ? ' tier-hero' : '');
  const rectOf = e => e.getBoundingClientRect();
  const clone = o => JSON.parse(JSON.stringify(o));
  const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));
  // which ready-made army a loadout matches exactly, or null for a custom one
  const presetOf = sel => {
    for (const k in PRESETS) {
      const pr = PRESETS[k];
      if (sameSet(Object.keys(sel.types), Object.keys(pr.types)) && Object.keys(pr.types).every(t => sel.types[t] === pr.types[t]) && sameSet(sel.hero, pr.hero) && sameSet(sel.minion, pr.minion)) return k;
    }
    return null;
  };
  const weightOf = sel => Object.keys(sel.types).reduce((a, t) => a + sel.types[t] * TYPES[t].weight, 0);
  // D-068: highlights for cards aimed at a hex — every legal hex, the chosen one, the line of Fire Arrows, the three walls
  function cellTargetHighlights(hl, play, opt, def, s) {
    for (const o of play.options) hl.push({ col: o.cell.col, row: o.cell.row, kind: 'target', strong: o === opt });
    if (!opt) return;
    if (opt.cells) opt.cells.forEach(c => hl.push({ col: c.col, row: c.row, kind: 'burn' })); // D-087: the line of fire
    if (def.kind === 'palisade') for (const t of [-1, 0, 1]) {
      const m = hex.neighbor(opt.cell.col, opt.cell.row, hex.turn(opt.dir, t));
      if (s.cells[hex.key(m.col, m.row)]) hl.push({ kind: 'wall', a: opt.cell, b: m });
    }
  }
  // D-087: a move's preview — a dotted route with the number of the turn at each stop, and the hexes it will capture
  function planHighlights(hl, s, def, opt) {
    const plan = R.planOf(s, def, opt);
    for (const c of plan.steps) hl.push({ col: c.col, row: c.row, kind: 'path', label: c.stop ? c.turn : null, strong: true, attack: c.attack });
    for (const c of plan.capture) hl.push({ col: c.col, row: c.row, kind: 'capture' });
    if (plan.zone) hl.push(Object.assign({ kind: 'zone' }, plan.zone)); // D-090: sortie effects
    if (plan.burn) plan.burn.forEach(c => hl.push({ col: c.col, row: c.row, kind: 'burn' }));
    if (plan.walls) plan.walls.forEach(e => hl.push({ kind: 'wall', a: e.a, b: e.b }));
  }
  const defaultLevels = () => Object.assign({ hero: 1 }, ...TYPE_ORDER.map(t => ({ [t]: 1 })));

  const UI = {
    state: null, renderer: null, busy: false, opts: null, drag: null, sel: null, lastActor: null, handoverPending: false, lastEvents: [], pendingIncoming: new Set(),
    // whose hand the bottom panel shows: the human in bot mode, the current player in hotseat (D-044)
    handPlayer() { const s = this.state; return this.opts && this.opts.players[2].bot ? s.players[1] : s.players[s.current]; },
    setup: { mode: 'bot', rounds: CFG.ROUND_LIMIT, seed: '', p: { 1: null, 2: null }, levels: { 1: null, 2: null }, preset: 'horde', botPreset: 'random', botLevel: 'hard', control: 'drag' },
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
      try { const pr = localStorage.getItem('hexband.v4.preset'); if (PRESETS[pr]) S.preset = pr; } catch (e) {}
      S.p[1] = clone(PRESETS[S.preset]); S.p[2] = clone(PRESETS.siege);
      S.levels[1] = defaultLevels(); S.levels[2] = defaultLevels();
      try { const lv = JSON.parse(localStorage.getItem('hexband.v4.levels') || 'null'); if (lv) Object.assign(S.levels[1], lv); } catch (e) {}
      $('#setup-version').textContent = 'v' + CFG.VERSION;
      document.querySelectorAll('input[name=mode]').forEach(r => r.addEventListener('change', () => { S.mode = r.value; this.renderSetup(); }));
      $('#sel-rounds').value = String(S.rounds);
      $('#sel-rounds').addEventListener('change', e => S.rounds = +e.target.value);
      $('#inp-seed').addEventListener('input', e => S.seed = e.target.value);
      $('#sel-bot-preset').addEventListener('change', e => { S.botPreset = e.target.value; this.renderSetup(); });
      // D-067: bot difficulty, remembered in the browser like the control scheme
      try { const lv = localStorage.getItem('hexband.botLevel'); if (lv === 'easy' || lv === 'normal' || lv === 'hard') S.botLevel = lv; } catch (e) {}
      $('#sel-bot-level').value = S.botLevel;
      $('#sel-bot-level').addEventListener('change', e => { S.botLevel = e.target.value; try { localStorage.setItem('hexband.botLevel', S.botLevel); } catch (err) {} });
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
        <div class="intro-item">${ic('t_brawler')}<div><b>Your Overlord and his horde.</b> You lead an Overlord with up to three kinds of minions around him. The Overlord is slow: one free step a turn (tap a marked hex or drag from him in the direction you want) plus his own cards. His minions are your strike force and his shield — any blow at the Overlord hits them first.</div></div>
        <div class="intro-item">${ic('long_hook')}<div><b>Send them out.</b> ${tap ? 'Tap a minion card, then tap where the route should end' : 'Drag a minion card onto the board and release it where the route should end'} — all minions of that type leave the Overlord and run the route, painting hexes and fighting whatever stands in the way, then walk back. While they are away, the Overlord has less of a shield. One sortie per type at a time. Hand of 3; play at least one card a turn, then End Turn.</div></div>
        <div class="intro-item">${ic('cordon')}<div><b>Claim territory.</b> Every hex your Overlord or minions walk through becomes yours. Surround an area with your own hexes and everything inside becomes yours too — the map edge does not count as a wall, and an area with the enemy Overlord in it stays theirs.</div></div>
        <div class="intro-item">${ic('recruitment')}<div><b>Pits and the road.</b> Each minion type has a pit in a tower of your castle. Fallen minions return to it, and every turn it sends new ones out while you have fewer than your army size. If your own hexes connect the castle to the Overlord, they run straight to him; if not, they wait at your hex nearest to him — cut the enemy road and his reinforcements get stuck.</div></div>
        <div class="intro-item">${ic('t_archer')}<div><b>Upgrade points.</b> In the middle of the map: a recruiting post gives +10 % army size to the minion type that takes it (the new ones come from the pits; a boosted count shows gold with ▲); the Citadel heals your Overlord and speeds up every pit. The castle itself is a passive base — nobody can take it.</div></div>
        <div class="intro-item">${ic('battle_cry')}<div><b>Win.</b> Slay the enemy Overlord — or hold more territory when round ${this.setup.rounds} ends. The board is big: zoom with the mouse wheel or a two-finger pinch, drag it to scroll, or use + / − / ⤢.</div></div>
        <button class="btn primary" id="btn-intro-close">${manual ? 'Got it' : 'To settings'}</button></div>`);
      $('#btn-intro-close').addEventListener('click', () => { ov.hidden = true; });
    },
    renderSetup() {
      const S = this.setup;
      $('#bot-preset-row').hidden = S.mode !== 'bot'; $('#bot-level-row').hidden = S.mode !== 'bot';
      $('#builder-2').hidden = S.mode !== 'hotseat';
      this.renderBuilder(1); if (S.mode === 'hotseat') this.renderBuilder(2);
      this.validateSetup();
    },
    // D-085: the camp — the Overlord (level, 3 cards) and up to 3 minion types (level, how many, 1 card each). Every number
    // shown here is the number the match uses.
    renderBuilder(pid) {
      const S = this.setup, sel = S.p[pid], lv = S.levels[pid], root = $('#builder-' + pid);
      const save = () => { if (pid === 1) try { localStorage.setItem('hexband.v4.levels', JSON.stringify(lv)); } catch (e) {} };
      const redraw = () => { this.renderBuilder(pid); this.validateSetup(); };
      root.innerHTML = '';
      root.appendChild(el('h3', null, pid === 1 ? 'Blue (you) — camp' : 'Red — camp'));
      const presets = el('div', 'presets');
      for (const key in PRESETS) {
        const b = el('button', 'chip' + (presetOf(sel) === key ? ' on' : ''), PRESETS[key].title);
        b.title = PRESETS[key].tag;
        b.addEventListener('click', () => { if (pid === 1) this.choosePreset(key); else { S.p[2] = clone(PRESETS[key]); redraw(); } });
        presets.appendChild(b);
      }
      root.appendChild(presets);
      const levelSel = (val, onChange) => { const s = el('select', 'lvl'); for (let i = 1; i <= CFG.MAX_LEVEL; i++) { const o = el('option', null, 'Lv ' + i); o.value = i; if (i === val) o.selected = true; s.appendChild(o); } s.addEventListener('change', e => onChange(+e.target.value)); return s; };
      // the Overlord
      const hs = R.heroStatsAt(lv.hero), cmd = hs.command, used = weightOf(sel);
      const hero = el('div', 'camp-hero');
      hero.appendChild(el('div', 'camp-title', `<b>Overlord</b><span>❤ ${hs.hp} HP · ⚔ ${hs.atk} Attack · ⚑ Command ${cmd} <em class="${used > cmd ? 'bad' : ''}">(${used} used)</em> · 1 free step a turn</span>`));
      hero.querySelector('.camp-title').appendChild(levelSel(lv.hero, v => { lv.hero = v; save(); redraw(); }));
      root.appendChild(hero);
      root.appendChild(el('div', 'builder-label', `Overlord cards: <b>${sel.hero.length}</b>/${CFG.HERO_CARDS}`));
      const hg = el('div', 'pick-grid');
      for (const id of HERO_POOL) {
        const d = CARDS[id], on = sel.hero.includes(id);
        const c = el('div', 'pick' + (on ? ' on' : ''), `<div class="pick-icon">${HB.icons.svg(iconOf(id))}</div><div class="pick-name">${d.title}</div><div class="pick-text">${d.text}</div>`);
        c.addEventListener('click', () => { if (on) sel.hero = sel.hero.filter(x => x !== id); else if (sel.hero.length < CFG.HERO_CARDS) sel.hero.push(id); else return; redraw(); });
        hg.appendChild(c);
      }
      root.appendChild(hg);
      // minion types
      const nTypes = Object.keys(sel.types).length;
      root.appendChild(el('div', 'builder-label', `Minion types: <b>${nTypes}</b>/${CFG.MINION_TYPES_MAX} — each brings its own tower in your castle and one card`));
      const tg = el('div', 'camp-types');
      for (const t of TYPE_ORDER) {
        const d = TYPES[t], on = t in sel.types, st = R.statsAt(t, lv[t] || 1);
        const box = el('div', 'camp-type' + (on ? ' on' : ''));
        box.style.setProperty('--tc', d.color);
        const head = el('div', 'camp-type-head', `<span class="camp-emblem">${HB.icons.svg('t_' + t)}</span><b>${d.title}</b>`);
        head.appendChild(levelSel(lv[t] || 1, v => { lv[t] = v; save(); redraw(); }));
        const tog = el('button', 'btn tiny ' + (on ? '' : 'primary'), on ? 'Remove' : 'Take');
        tog.addEventListener('click', () => {
          if (on) { delete sel.types[t]; sel.minion = sel.minion.filter(id => CARDS[id].owner !== t); }
          else { if (nTypes >= CFG.MINION_TYPES_MAX) return; sel.types[t] = Math.max(1, Math.min(5, Math.floor((cmd - used) / d.weight))); sel.minion.push(HB.cards.MINION_CARDS(t).find(id => (CARDS[id].req || 1) <= sel.types[t]) || HB.cards.MINION_CARDS(t)[0]); }
          redraw();
        });
        head.appendChild(tog);
        box.appendChild(head);
        box.appendChild(el('div', 'camp-stats', `<span title="HP per minion">❤ ${st.hp}</span><span title="Attack per minion">⚔ ${st.atk}</span><span title="route steps per turn">➜ ${st.speed}</span><span title="hexes painted per step">▦ ${st.capture}</span><span title="hexes per turn back to the Overlord">↩ ${st.ret}</span>${st.range ? `<span title="range">◎ ${st.range}</span>` : ''}<span title="Command per minion">⚖ ${st.weight}</span><span title="minions out of the pit per turn">⛫ ${st.out}/turn</span>`));
        box.appendChild(el('div', 'camp-trait', `<b>${d.traitTitle}.</b> ${d.traitText}`));
        if (on) {
          const n = sel.types[t];
          const row = el('div', 'camp-count', '<span>Army:</span>');
          const minus = el('button', 'btn tiny', '−'), plus = el('button', 'btn tiny', '+');
          minus.addEventListener('click', () => { if (sel.types[t] > 1) { sel.types[t]--; redraw(); } });
          plus.addEventListener('click', () => { if (used + d.weight <= cmd) { sel.types[t]++; redraw(); } });
          row.appendChild(minus); row.appendChild(el('b', null, String(n))); row.appendChild(plus);
          row.appendChild(el('span', 'muted', ` × ⚖${d.weight} = ${n * d.weight} Command`));
          box.appendChild(row);
          const cards = el('div', 'camp-cards');
          for (const id of HB.cards.MINION_CARDS(t)) {
            const cd = CARDS[id], chosen = sel.minion.includes(id), okReq = (cd.req || 1) <= n;
            const c = el('div', 'pick small' + (chosen ? ' on' : '') + (okReq ? '' : ' locked'), `<div class="pick-icon">${HB.icons.svg(iconOf(id))}</div><div class="pick-name">${cd.title}${cd.req > 1 ? ` <em>${cd.req}+</em>` : ''}</div><div class="pick-text">${cd.text}</div>`);
            c.addEventListener('click', () => { if (!okReq) return; sel.minion = sel.minion.filter(x => CARDS[x].owner !== t).concat([id]); redraw(); });
            cards.appendChild(c);
          }
          box.appendChild(cards);
        }
        tg.appendChild(box);
      }
      root.appendChild(tg);
    },
    loadoutProblem(sel, lv) {
      const types = Object.keys(sel.types), cmd = R.heroStatsAt(lv.hero).command;
      if (sel.hero.length !== CFG.HERO_CARDS) return `pick ${CFG.HERO_CARDS} Overlord cards`;
      if (!types.length) return 'take at least one minion type';
      if (types.length > CFG.MINION_TYPES_MAX) return `at most ${CFG.MINION_TYPES_MAX} minion types`;
      if (weightOf(sel) > cmd) return `the army needs ${weightOf(sel)} Command, the Overlord has ${cmd}`;
      for (const t of types) {
        const c = sel.minion.filter(id => CARDS[id].owner === t);
        if (c.length !== 1) return `pick one card for ${TYPES[t].title.toLowerCase()}`;
        if ((CARDS[c[0]].req || 1) > sel.types[t]) return `${CARDS[c[0]].title} needs ${CARDS[c[0]].req}+ ${TYPES[t].title.toLowerCase()}`;
      }
      return '';
    },
    validateSetup() {
      const S = this.setup;
      const p1 = this.loadoutProblem(S.p[1], S.levels[1]), p2 = S.mode === 'hotseat' ? this.loadoutProblem(S.p[2], S.levels[2]) : '';
      const ok = !p1 && !p2;
      $('#btn-start').disabled = !ok; $('#btn-play').disabled = !ok; // an unfinished camp cannot start a match
      $('#setup-hint').textContent = ok ? '' : (p1 ? 'Blue: ' + p1 : 'Red: ' + p2) + '.';
      if ($('#menu-presets')) this.renderMenuPresets();
    },
    startFromSetup() {
      const S = this.setup;
      // D-070: by default the bot gets a random army each match; it plays at the same levels as the player (fair test)
      const keys = Object.keys(PRESETS), botKey = S.botPreset === 'random' || !PRESETS[S.botPreset] ? keys[Math.floor(Math.random() * keys.length)] : S.botPreset;
      const p2 = S.mode === 'bot' ? { loadout: clone(PRESETS[botKey]), levels: clone(S.levels[1]), bot: true, botLevel: S.botLevel, name: 'Red (bot)', preset: botKey }
        : { loadout: clone(S.p[2]), levels: clone(S.levels[2]), bot: false, name: 'Red', preset: presetOf(S.p[2]) };
      const seed = S.seed.trim() ? (parseInt(S.seed, 10) || hashStr(S.seed)) : (Math.random() * 0xffffffff) >>> 0;
      this.opts = { seed, roundLimit: S.rounds, players: { 1: { loadout: clone(S.p[1]), levels: clone(S.levels[1]), bot: false, name: 'Blue', preset: presetOf(S.p[1]) }, 2: p2 } };
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
        this.bindStep();
        this.bindCamera(); // D-083
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
      // D-064: match intro — recruits arrive, banners rise, start zones flip; the first turn begins when it is over
      const intro = this.renderer.playIntro();
      // D-070: each army announces its preset as its banner goes up
      for (const pid of [1, 2]) {
        const key = opts.players[pid].preset, rd = this.renderer, w = this.state.players[pid].warband;
        if (!key || !PRESETS[key]) continue;
        rd.schedule(1100 + (pid - 1) * 1000, () => rd.addText(w.col, w.row, PRESETS[key].title.toUpperCase(), pid === 1 ? '#bfe0ff' : '#ffc4ba', { dy: pid === 1 ? -rd.size * 2.3 : rd.size * 1.1, big: true, dur: 2400 }));
        this.appendLog([`${this.state.players[pid].name}: ${PRESETS[key].title} army.`]);
      }
      // D-086: then the first turn opens like every other — the banner, and the camera closes in on the player to move
      const open = this.renderer.isV4() ? this.renderer.turnOpening(intro) : intro;
      this.busy = true;
      this.refresh();
      setTimeout(() => { this.busy = false; this.refresh(); this.nextTurn(); }, open + 100);
    },
    toSetup() { this.showMenu(); },
    // ------------------------------------------------------------ main menu (D-051): win conditions with live scenes, Play, Settings
    // D-070: army presets — the same three buttons on the main menu and in the builder
    choosePreset(key) {
      const S = this.setup;
      S.preset = key; S.p[1] = clone(PRESETS[key]);
      try { localStorage.setItem('hexband.v4.preset', key); } catch (e) {}
      this.renderMenuPresets(); this.renderBuilder(1); this.validateSetup();
    },
    renderMenuPresets() {
      const root = $('#menu-presets'); root.innerHTML = '';
      const cur = presetOf(this.setup.p[1]);
      for (const key in PRESETS) {
        const pr = PRESETS[key];
        const b = el('button', 'preset-btn' + (cur === key ? ' on' : ''), `<span class="preset-icon">${HB.icons.svg(pr.icon)}</span><b>${pr.title}</b><span>${pr.tag}</span>`);
        b.addEventListener('click', () => this.choosePreset(key));
        root.appendChild(b);
      }
      if (!cur) root.appendChild(el('p', 'muted preset-custom', 'Custom army from Settings'));
    },
    initMenu() {
      this.renderMenuPresets();
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
    // a tiny hand-made Overlord board the normal renderer can draw (menu scenes, D-085)
    miniState(cols, rows, fn) {
      const pl = (id, types, col, row) => {
        const p = { id, name: id === 1 ? 'Blue' : 'Red', types: Object.keys(types), comp: Object.assign({}, types), retinue: {}, levels: { hero: 1 }, status: { warCryUntil: -1, attackBonus: 0, formationUntil: -1 }, warband: { col, row, hp: 40, maxHp: 40, minions: 0 }, hand: [], deck: [], discard: [] };
        for (const t in types) { p.retinue[t] = { n: types[t], wound: 0 }; p.levels[t] = 1; }
        return p;
      };
      const s = { variant: 'overlord', cols, rows, cells: {}, pois: [], blocked: {}, walls: {}, swamps: {}, summons: [], squads: [], castles: {}, turnIndex: 0, current: 1, phase: 'play', decorSeed: 11,
        players: [null, pl(1, { brawler: 10, runner: 8, archer: 5 }, 1, 2), pl(2, { brute: 4, brawler: 6, archer: 5 }, 3, 0)] };
      for (let c = 0; c < cols; c++) for (let r = 0; r < hex.rowsInCol(c, rows); r++) s.cells[hex.key(c, r)] = { col: c, row: r, owner: 0, bonus: 0, poi: -1 };
      fn(s); return s;
    },
    buildMenuPics() {
      const mk = (id, s) => { const cv = $(id); if (!cv) return null; const rd = new HB.Renderer(cv); rd.setState(s); this.menuPics.push({ el: cv, rd }); return rd; };
      const castle = (s, pid, col, row) => { s.castles[pid] = { col, row }; const c = s.cells[hex.key(col, row)]; c.castle = pid; c.owner = pid; };
      // 1 · territory at the end: a split board, each Overlord in front of his castle
      const s3 = this.miniState(5, 4, s => {
        s.players[1].warband = { col: 1, row: 2, hp: 40, maxHp: 40 }; s.players[2].warband = { col: 3, row: 1, hp: 40, maxHp: 40 };
        for (const k in s.cells) { const c = s.cells[k]; c.owner = c.row >= 2 || (c.row === 1 && c.col <= 2) ? 1 : (c.col === 0 && c.row === 0 ? 0 : 2); }
        castle(s, 1, 2, 3); castle(s, 2, 4, 0);
      });
      mk('#pic-terr', s3);
      // 2 · slay the Overlord: blue brawlers charge a red Overlord whose retinue is off on a sortie
      const s1 = this.miniState(5, 4, s => {
        s.players[1].warband = { col: 0, row: 2, hp: 40, maxHp: 40 }; s.players[2].warband = { col: 3, row: 1, hp: 12, maxHp: 40 };
        s.players[2].retinue.brawler.n = 0; s.players[2].retinue.brute.n = 0; s.players[2].retinue.archer.n = 1;
        s.players[1].retinue.brawler.n = 0;
        s.squads.push({ id: 1, owner: 1, type: 'brawler', n: 8, col: 2, row: 1, state: 'out' });
        s.squads.push({ id: 2, owner: 2, type: 'brawler', n: 5, col: 4, row: 3, state: 'return' });
        for (const k in s.cells) { const c = s.cells[k]; c.owner = c.col <= 2 ? 1 : 2; }
        castle(s, 2, 4, 0); castle(s, 1, 0, 3);
      });
      const r1 = mk('#pic-castle', s1);
      if (r1) setInterval(() => { if ($('#menu').hidden) return; const p = r1.cellXY(3, 1); r1.spawnFight(p.x, p.y); r1.shake[2] = performance.now(); r1.addText(3, 1, '−5 ❤', '#ff6b6b', { dy: -r1.size * 0.9, big: true }); }, 1700);
      this.layoutMenu();
    },
    layoutMenu() { for (const m of this.menuPics) { const r = rectOf(m.el.parentElement); if (r.width > 0) m.rd.resize(Math.floor(r.width), Math.floor(r.height)); } },
    // before every action: where the Overlords stand, and (D-085) the board's counts the animation starts from
    positions() {
      const s = this.state, at = pid => { const w = s.players[pid].warband; return { col: w.col, row: w.row, minions: w.minions, dead: !!w.dead }; };
      if (this.renderer && this.renderer.snapshotView) this.renderer.prevView = this.renderer.snapshotView(s);
      return { 1: at(1), 2: at(2) };
    },
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
      const move = HB.ai.choose(s, this.opts && this.opts.players[s.current].botLevel);
      this.renderer.prevPos = this.positions();
      this.lastActor = s.current;
      if (move.end) R.endTurn(s);
      else if (move.step != null) { if (!R.freeStep(s, move.step) && !R.endTurn(s)) { s.playedThisTurn = 1; R.endTurn(s); } } // D-068
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
      setTimeout(() => { this.busy = false; this.refresh(); this.nextTurn(); }, Math.min(dur, 8000) + 150);
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
        $(`#hud-${pid} .hud-hp`).textContent = p.warband.hp; // D-085: the Overlord's HP
        $(`#hud-${pid} .hud-poi`).textContent = sc[pid].pois;
        $(`#hud-${pid}`).classList.toggle('active', s.current === pid && s.phase === 'play');
      }
      $('#hud-round').textContent = `Round ${R.round(s)} / ${s.roundLimit}`;
      // D-044: against the bot the hand, deck and discard always belong to the human player
      const p = this.handPlayer(), mine = s.current === p.id;
      const busy = this.busy || !mine || s.phase !== 'play' || this.handoverPending;
      const hideHand = this.handoverPending;
      const hand = $("#hand"); hand.innerHTML = ""; hand.style.gridTemplateColumns = `repeat(${CFG.HAND_SIZE}, minmax(0, 1fr))`;
      const playable = p.hand.map(card => mine && R.getPlay(s, card).ok);
      for (let i = 0; i < CFG.HAND_SIZE; i++) {
        const slot = el('div', 'slot');
        const card = p.hand[i];
        if (card) {
          const c = el('div', cardClass(card.def) + (playable[i] ? '' : ' disabled'), cardHTML(card.def));
          const why = !playable[i] && mine ? R.getPlay(s, card).why : null; // D-085: why a minion card is dimmed
          if (why === 'out') c.appendChild(el('div', 'card-away', 'on a sortie')); else if (why === 'none') c.appendChild(el('div', 'card-away', 'none left'));
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
      // D-068: the free-step marker around the current warband; the chevrons only while the human can take it
      const canStep = !busy && this.stepAvailable();
      this.renderer.stepHint = s.phase === 'play' ? { pid: s.current, used: s.stepUsed, targets: canStep ? R.stepOptions(s).map(o => ({ col: o.end.col, row: o.end.row, attack: !!o.path[0].attack })) : [] } : null;
      $('#status-line').textContent = busy ? (!mine && s.phase === 'play' ? `${this.current().name}'s turn…` : '') : this.statusText(p);
      $('#btn-pass').hidden = busy || s.playedThisTurn > 0 || playable.some(x => x);
      // a full hand (outpost card arrived) leaves no slot for the end-turn button — show a fallback under the hand
      $('#btn-end-fb').hidden = busy || s.playedThisTurn < 1 || p.hand.length < CFG.HAND_SIZE;
    },
    statusText(p) {
      const s = this.state, out = [];
      if (R.active(s, p.status.warCryUntil)) out.push('War Cry +1');
      const th = R.heroThreat(s, p.id); // D-085: warn when the enemy could break through the shield next turn
      if (th.threat > th.shield) out.push(`⚠ the enemy could hit your Overlord for ${th.threat} against a shield of ${th.shield}`);
      const step = s.stepUsed ? 'Free step used.' : 'Free step: tap a marked hex or drag from your Overlord.';
      return (out.length ? out.join(' · ') + ' · ' : '') + step;
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
        const br = rectOf($("#board")), c = this.renderer.screenXY(it.col, it.row), S = this.renderer.size * (this.renderer.zoom || 1);
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
    // D-047 / D-085: the forecast while a card is aimed — the move is played on a copy of the match, so it is always true:
    // enemy and own losses, both Overlords' HP, a win. Shared by both input schemes and by the free-step gesture.
    forecastText(o, s) {
      if (!o) return null;
      const lostE = o.enemyArmy[0] - o.enemyArmy[1], lostM = o.myArmy[0] - o.myArmy[1], hE = o.enemyHero[0] - o.enemyHero[1], hM = o.myHero[0] - o.myHero[1];
      if (o.won) return { text: 'The enemy Overlord falls!', win: true, long: '<b>Forecast:</b> the enemy Overlord falls — you win.' };
      if (!lostE && !lostM && !hE && !hM) return null;
      const parts = [];
      if (lostE || hE) parts.push(`enemy −${lostE}${hE ? ` ❤${o.enemyHero[0]}→${o.enemyHero[1]}` : ''}`);
      if (lostM || hM) parts.push(`you −${lostM}${hM ? ` ❤${o.myHero[0]}→${o.myHero[1]}` : ''}`);
      return { text: parts.join(' · '), bad: lostM + hM > lostE + hE, long: `<b>Forecast:</b> ${parts.join(', ')}.` + (o.lost ? ' Your Overlord would fall!' : '') };
    },
    updateForecast(ctx) {
      const s = this.state, rd = this.renderer;
      let f = null;
      if (ctx.valid && ctx.choice && ctx.uid != null) f = this.forecastText(R.forecastPlay(s, ctx.uid, ctx.choice), s);
      const cell = ctx.choice ? (ctx.choice.end || ctx.choice.cell) : null;
      rd.forecast = f && cell ? Object.assign({ cell }, f) : null;
      const fcEl = $('#card-desc .desc-forecast');
      if (!fcEl) return;
      if (f) { fcEl.innerHTML = f.long; fcEl.hidden = false; } else fcEl.hidden = true;
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
        const dist = c => { const q = rd.screenXY(c.col, c.row); return Math.hypot(q.x - px, q.y - py); };
        let opt = play.options[0], best = Infinity;
        for (const o of play.options) { const sc = dist(o.end) + 0.35 * dist(o.path[0]); if (sc < best) { best = sc; opt = o; } }
        dg.choice = opt; dg.valid = true;
        const ends = new Set(play.options.map(o => hex.key(o.end.col, o.end.row)));
        for (const k of ends) { const [c, r] = k.split(',').map(Number); hl.push({ col: c, row: r, kind: 'target', strong: false }); }
        planHighlights(hl, s, dg.def, opt);
      } else if (play.options && play.options[0] && play.options[0].axis != null) {
        // Flank Claim: pick the axis whose direction is closest to pointer-from-warband
        const wc = rd.screenXY(p.warband.col, p.warband.row);
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
      } else if (play.options && play.options[0] && play.options[0].cell) { // D-068: any card aimed at a hex
        const cell = dg.over ? rd.cellFromPointer(e.clientX, e.clientY) : null;
        const opt = cell && play.options.find(o => o.cell.col === cell.col && o.cell.row === cell.row);
        dg.choice = opt || null; dg.valid = !!opt;
        cellTargetHighlights(hl, play, opt, dg.def, s);
      } else {
        dg.valid = true;
        if (play.path) play.path.forEach((c, i) => hl.push({ col: c.col, row: c.row, kind: 'path', label: i + 1, strong: dg.over, attack: !!c.attack }));
      }
      rd.highlights = hl;
      this.updateForecast({ valid: dg.valid, choice: dg.choice, over: dg.over, def: dg.def, uid: dg.uid });
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
          const dist = c => { const q = rd.screenXY(c.col, c.row); return Math.hypot(q.x - px, q.y - py); };
          let best = Infinity;
          for (const o of play.options) { const sc = dist(o.end) + 0.35 * dist(o.path[0]); if (sc < best) { best = sc; opt = o; } }
          if (best > rd.size * (rd.zoom || 1) * 2.4) opt = null; // tapped far from any end cell
        }
        const ends = new Set(play.options.map(o => hex.key(o.end.col, o.end.row)));
        for (const k of ends) { const [c, r] = k.split(',').map(Number); hl.push({ col: c, row: r, kind: 'target', strong: false }); }
        if (opt) { sel.choice = opt; sel.valid = true; planHighlights(hl, this.state, sel.def, opt); }
      } else if (play.options && play.options[0] && play.options[0].axis != null) {
        let opt = null;
        if (has) {
          const wc = rd.screenXY(p.warband.col, p.warband.row);
          const ang = Math.atan2(clientY - (br.top + wc.y), clientX - (br.left + wc.x));
          const diff = (a, b) => { let d = Math.abs(a - b) % (Math.PI * 2); return d > Math.PI ? Math.PI * 2 - d : d; };
          let best = Infinity;
          for (const o of play.options) { const d = Math.min(diff(ang, hex.dirAngle(o.axis)), diff(ang, hex.dirAngle(o.axis + 3))); if (d < best) { best = d; opt = o; } }
        }
        if (opt) { sel.choice = opt; sel.valid = true; }
        for (const o of play.options) for (const c of o.cells) hl.push({ col: c.col, row: c.row, kind: 'target', strong: o === opt });
      } else if (play.options && play.options[0] && play.options[0].side != null) {
        if (has) { const wx = rd.warbandScreenX(p.id), side = clientX < wx ? -1 : 1; const opt = play.options.find(o => o.side === side) || play.options[0]; sel.choice = opt; sel.valid = true; }
        for (let d = 0; d < 6; d++) { const n = hex.neighbor(p.warband.col, p.warband.row, d); if (this.state.cells[hex.key(n.col, n.row)]) hl.push({ col: n.col, row: n.row, kind: 'target', strong: false }); }
      } else if (play.options && play.options[0] && play.options[0].cell) { // D-068: any card aimed at a hex
        const cell = has ? rd.cellFromPointer(clientX, clientY) : null;
        const opt = cell && play.options.find(o => o.cell.col === cell.col && o.cell.row === cell.row);
        if (opt) { sel.choice = opt; sel.valid = true; }
        cellTargetHighlights(hl, play, opt, sel.def, this.state);
      } else { sel.valid = true; }
      rd.highlights = hl;
      this.updateForecast({ valid: sel.valid, choice: sel.choice, over: has, def: sel.def, uid: sel.uid });
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
        this.fly(start, rectOf($('#pile-discard')), cardHTML(card.def), cardClass(card.def), 420);
      }
      this.afterAction();
    },
    endTurn() {
      const s = this.state; if (!s || s.playedThisTurn < 1 || this.busy) return;
      this.renderer.prevPos = this.positions();
      this.lastActor = s.current;
      if (R.endTurn(s)) this.afterAction();
    },
    // ------------------------------------------------------------ free step (D-068)
    // Once per turn: tap a highlighted hex next to the warband, or drag from the warband onto it.
    stepAvailable() {
      const s = this.state;
      return !!s && s.phase === 'play' && !this.busy && !this.handoverPending && !this.sel && !this.drag
        && s.current === this.handPlayer().id && !s.players[s.current].bot && !s.stepUsed;
    },
    stepOptionAt(clientX, clientY) {
      const cell = this.renderer.cellFromPointer(clientX, clientY);
      return cell ? R.stepOptions(this.state).find(o => o.end.col === cell.col && o.end.row === cell.row) || null : null;
    },
    // iteration2: a drag from the warband picks the neighbour by direction — the option whose hex lies closest in angle
    // to the line from the warband to the finger; no need to land on the hex itself. Near the warband nothing is picked.
    stepOptionToward(clientX, clientY) {
      const rd = this.renderer, r = rd.canvas.getBoundingClientRect(), w = this.state.players[this.state.current].warband;
      const c = rd.screenXY(w.col, w.row), dx = clientX - r.left - c.x, dy = clientY - r.top - c.y;
      if (Math.hypot(dx, dy) < rd.size * (rd.zoom || 1) * 0.45) return null;
      const a = Math.atan2(dy, dx);
      let best = null, bd = Infinity;
      for (const o of R.stepOptions(this.state)) {
        const e = rd.screenXY(o.end.col, o.end.row);
        let d = Math.abs(Math.atan2(e.y - c.y, e.x - c.x) - a); if (d > Math.PI) d = 2 * Math.PI - d;
        if (d < bd) { bd = d; best = o; }
      }
      return bd <= Math.PI / 3 ? best : null; // a blocked direction does not snap to a far-off neighbour
    },
    bindStep() {
      const board = $('#board');
      board.addEventListener('pointerdown', e => {
        this.stepPress = null;
        if (!this.stepAvailable()) return;
        const cell = this.renderer.cellFromPointer(e.clientX, e.clientY), w = this.state.players[this.state.current].warband;
        if (cell && cell.col === w.col && cell.row === w.row) { this.stepPress = { id: e.pointerId, opt: null }; try { board.setPointerCapture(e.pointerId); } catch (err) {} }
      });
      board.addEventListener('pointermove', e => {
        if (!this.stepPress || e.pointerId !== this.stepPress.id) return;
        const opt = this.stepOptionToward(e.clientX, e.clientY), rd = this.renderer;
        this.stepPress.opt = opt;
        rd.highlights = []; if (opt) planHighlights(rd.highlights, this.state, { kind: 'hero_move' }, opt);
        rd.pathFrom = opt ? { col: this.state.players[this.state.current].warband.col, row: this.state.players[this.state.current].warband.row } : null;
        rd.forecast = null;
        if (opt && opt.path[0].attack) { const f = this.forecastText(R.forecastStep(this.state, opt.dir), this.state); rd.forecast = f ? Object.assign({ cell: opt.end }, f) : null; }
      });
      board.addEventListener('pointerup', e => {
        if (!this.stepPress || e.pointerId !== this.stepPress.id) return;
        const opt = this.stepOptionToward(e.clientX, e.clientY); // let go back on the warband — no step
        this.stepPress = null;
        const rd = this.renderer; rd.highlights = []; rd.pathFrom = null; rd.forecast = null;
        if (opt) { this.skipClick = true; this.commitStep(opt.dir); }
      });
      board.addEventListener('pointercancel', e => {
        if (!this.stepPress || e.pointerId !== this.stepPress.id) return;
        this.stepPress = null;
        const rd = this.renderer; rd.highlights = []; rd.pathFrom = null; rd.forecast = null;
      });
    },
    // D-083: camera — mouse wheel or two-finger pinch zooms at the pointer, a one-finger / mouse drag on the board pans
    // (a press on your own warband is the free-step gesture instead); + / − / ⤢ buttons in the corner of the board
    bindCamera() {
      const board = $('#board'), pts = new Map();
      let pan = null, pinch = null;
      const local = e => { const r = board.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
      const swallowClick = () => { this.skipClick = true; setTimeout(() => { this.skipClick = false; }, 60); };
      board.addEventListener('wheel', e => {
        if (!this.state || !this.renderer) return;
        e.preventDefault();
        const p = local(e); this.renderer.zoomAt(p.x, p.y, e.deltaY < 0 ? 1.15 : 1 / 1.15);
      }, { passive: false });
      board.addEventListener('pointerdown', e => {
        if (!this.state || this.stepPress || this.drag) return;
        pts.set(e.pointerId, local(e));
        if (pts.size === 1) pan = { id: e.pointerId, last: local(e), moved: false };
        else if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; pan = null; }
      });
      board.addEventListener('pointermove', e => {
        if (!pts.has(e.pointerId)) return;
        const p = local(e); pts.set(e.pointerId, p);
        if (pinch && pts.size >= 2) {
          const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
          if (pinch.d > 0) this.renderer.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinch.d);
          pinch.d = d; swallowClick(); return;
        }
        if (!pan || e.pointerId !== pan.id) return;
        const dx = p.x - pan.last.x, dy = p.y - pan.last.y;
        if (!pan.moved) { if (Math.hypot(dx, dy) < 8) return; pan.moved = true; } // a tap stays a tap
        this.renderer.panBy(dx, dy); pan.last = p;
      });
      const end = e => {
        if (!pts.has(e.pointerId)) return;
        pts.delete(e.pointerId);
        if (pan && pan.id === e.pointerId && pan.moved) swallowClick();
        if (pts.size < 2) pinch = null;
        if (!pts.size) pan = null;
      };
      board.addEventListener('pointerup', end); board.addEventListener('pointercancel', end);
      const wrap = $('#board-wrap'), bar = document.createElement('div');
      bar.className = 'zoom-bar';
      bar.innerHTML = '<button class="btn tiny ghost" data-z="in" aria-label="Zoom in">+</button><button class="btn tiny ghost" data-z="out" aria-label="Zoom out">−</button><button class="btn tiny ghost" data-z="fit" aria-label="Whole board">⤢</button>';
      bar.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b || !this.renderer) return;
        const r = this.renderer.cssSize || { w: 0, h: 0 };
        if (b.dataset.z === 'fit') { this.renderer.camTo(1, null, 450); return; } // D-086: every zoom of the buttons is eased
        // zoom around the warband whose turn it is (clamped into the view), so it stays on screen
        let fx = r.w / 2, fy = r.h / 2;
        const s = this.state, w = s && s.players[s.current] && s.players[s.current].warband;
        if (w && !w.dead) { const p = this.renderer.screenXY(w.col, w.row); fx = Math.min(r.w - 20, Math.max(20, p.x)); fy = Math.min(r.h - 20, Math.max(20, p.y)); }
        this.renderer.zoomAtEased(fx, fy, b.dataset.z === 'in' ? 1.4 : 1 / 1.4);
      });
      wrap.appendChild(bar);
    },
    commitStep(dir) {
      const s = this.state;
      this.renderer.prevPos = this.positions();
      this.lastActor = s.current;
      if (R.freeStep(s, dir)) this.afterAction(); else this.refresh();
    },
    onCanvasClick(e) {
      const s = this.state; if (!s || this.drag) return;
      if (this.skipClick) { this.skipClick = false; return; }
      if (this.sel) { // tap mode: a tap on the board plays the selected card at that target
        if (this.previewAt(e.clientX, e.clientY)) this.commitSel(this.cardCenter(this.sel.uid));
        return;
      }
      if (this.stepAvailable()) { const opt = this.stepOptionAt(e.clientX, e.clientY); if (opt) { this.commitStep(opt.dir); return; } }
      const cell = this.renderer.cellFromPointer(e.clientX, e.clientY);
      if (!cell) return;
      const c = s.cells[hex.key(cell.col, cell.row)];
      const owner = c.owner ? s.players[c.owner].name : 'neutral';
      let txt = `Hex ${cell.col},${cell.row}: ${owner}${c.castle ? ' castle' : ''}${c.bonus ? ', +' + c.bonus + ' bonus' : ''}`;
      if (c.poi >= 0) { const q = s.pois[c.poi], d = HB.cards.POINT_KINDS[q.kind]; txt += ` · ${d.title}${q.owner && q.boost ? ` (${s.players[q.owner].name}: ${TYPES[q.boost].title.toLowerCase()} +10%)` : ''}: ${d.text}`; }
      // D-085: who stands here — an Overlord with his retinue, or a group of minions
      const g = R.groupAt(s, cell);
      if (g && g.kind === 'hero') {
        const p = s.players[g.pid], ret = p.types.map(t => `${p.retinue[t].n} ${TYPES[t].title.toLowerCase()}`).join(', ');
        txt += ` · ${p.name} Overlord ❤${p.warband.hp}/${p.warband.maxHp}, with ${ret || 'no one'}`;
      } else if (g) txt += ` · ${s.players[g.pid].name} ${TYPES[g.sq.type].title.toLowerCase()} ×${g.sq.n} (${{ out: 'on a sortie', return: 'on the way back', wait: 'waiting for a road', hold: 'lying in wait' }[g.sq.state]})`;
      $('#status-line').textContent = txt;
    },

    // ------------------------------------------------------------ overlays
    overlay(html) { const ov = $('#overlay'); ov.hidden = false; ov.innerHTML = `<div class="panel">${html}</div>`; return ov; },
    showPassPicker() {
      const s = this.state, p = this.current(); if (s.playedThisTurn > 0 || this.busy) return;
      const ov = this.overlay(`<h2>No playable cards</h2><p>Pick a card to discard — the turn passes to your opponent.</p><div class="pick-row" id="pass-row"></div><button class="btn ghost" id="pass-cancel">Cancel</button>`);
      const row = $('#pass-row');
      for (const card of p.hand) {
        const c = el('div', cardClass(card.def), cardHTML(card.def));
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
      const reason = { hero: 'The enemy Overlord has fallen', territory: 'More territory', 'tiebreak:pois': 'Tie-break: more upgrade points', 'tiebreak:hero': 'Tie-break: a healthier Overlord', 'tiebreak:minions': 'Tie-break: a bigger army', draw: 'A perfect tie' }[s.endReason] || s.endReason;
      const row = (label, k) => `<tr><td>${label}</td><td class="c1">${sc[1][k]}</td><td class="c2">${sc[2][k]}</td></tr>`;
      this.overlay(`<h2 class="${s.winner ? 'w' + s.winner : ''}">${title}</h2><p>${reason}</p>
        <table class="score"><tr><th></th><th class="c1">${s.players[1].name}</th><th class="c2">${s.players[2].name}</th></tr>
        ${row('Territory points', 'territory')}${row('Hexes', 'cells')}${row('Upgrade points', 'pois')}${row('Overlord HP', 'hero')}${row('Army', 'minions')}</table>
        <p class="muted">Seed ${s.seed} · ${s.roundLimit} rounds</p>
        <div class="row"><button class="btn primary" id="btn-rematch">Rematch</button><button class="btn ghost" id="btn-menu">Main menu</button></div>`);
      $('#btn-rematch').addEventListener('click', () => { this.opts.seed = (Math.random() * 0xffffffff) >>> 0; this.startGame(this.opts); });
      $('#btn-menu').addEventListener('click', () => this.toSetup());
    },
    showHelp() {
      const tap = this.setup.control === 'tap';
      const ov = this.overlay(`<div class="help"><h2>How to play</h2>
        <p><b>Goal.</b> Slay the enemy Overlord, or hold more territory when round ${this.state ? this.state.roundLimit : this.setup.rounds} ends. Tie-breaks: upgrade points → Overlord HP → army size.</p>
        <p><b>Turn.</b> Your hand holds 3 cards from a deck of 6 — 3 Overlord cards and one card for each minion type. ${tap
          ? 'Tap a card: the targets light up; tap the hex you want and it is played at once. A card without a target is played by tapping the board or the card again; tap the description panel to change your mind.'
          : 'Drag a card onto the board: the route and the forecast are previewed; release it and it is played at once. Release it over the hand and it returns.'} Play at least one card a turn, then End Turn. The Overlord also has one free step a turn: tap a marked hex next to him, or press him and drag the way you want.</p>
        <p><b>The Overlord and his retinue.</b> Up to three minion types stand around the Overlord, each in its own sector with a plaque showing how many there are. Any blow at the Overlord hits the retinue first — highest shield first (brutes, brawlers, healers, then runners and archers) — and only then the Overlord himself. The banner shows his HP (❤) and the shield (🛡, the retinue's HP); the shield flashes red when the enemy could break through it next turn.</p>
        <p><b>Sorties.</b> A minion card sends <i>all</i> minions of its type that stand with the Overlord along its route. They move Speed steps a turn, paint the hexes they walk through (Runners paint a hex to the side as well), and fight whatever enemy group stands in the way: both sides strike at once, strike = minions × Attack (+ card bonus, + War Cry); damage removes minions by their HP, the rest wounds the next one. Archers shoot an enemy within 2 hexes instead, with no retaliation. When the route is done the group walks back at its Return speed and joins the Overlord. One sortie per type at a time.</p>
        <p><b>Pits and the road.</b> Each type has a pit in a tower of your castle. Fallen minions go back to it; at the start of your turn it sends out new ones (its Out number) while the type has fewer than your army size. If your own hexes connect the castle to the Overlord, they run straight to him. If not, they gather at your hex nearest to him and wait for a road — the enemy can attack them there, and can cut your road by taking hexes.</p>
        <p><b>Territory.</b> Surround an area with your own hexes (a wall counts as a border, the map edge does not) and it all becomes yours, enemy hexes included — unless the enemy Overlord stands in it. Castles never change hands.</p>
        <p><b>Recruiting posts.</b> Four posts stand in the middle of the map. The type whose group takes one (for the Overlord: the largest type with him) gets +10 % army size, at least +1, while you hold it — up to +40 % with all four. The pits send the new minions by the usual rules. Lose the post and the extra minions stay, but the pits no longer replace them. A boosted count shows gold with ▲. The Citadel heals your Overlord by 5 when taken and adds 1 to every pit's Out while held.</p>
        <p><b>Camp.</b> In Settings pick the Overlord's level and 3 cards, and up to 3 minion types with their level, their number (their Command weight must fit the Overlord's Command) and one card each. Every number shown there is the one the match uses.</p>
        <p class="muted">The board is big: zoom with the mouse wheel or a two-finger pinch, drag to scroll, or use + / − / ⤢ in its corner.</p>
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
