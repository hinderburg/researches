// Game rules. Pure data state + functions that mutate it and push events for the renderer.
// The state contains no functions or DOM references, so it can be JSON-cloned (the bot relies on this).
window.HB = window.HB || {};
(function () {
  const hex = HB.hex, CFG = HB.CONFIG, CARDS = HB.cards.CARDS, POIS = HB.cards.POIS;
  const K = hex.key;

  // ---- deterministic RNG (mulberry32); the state lives in the game state so a seed reproduces a match
  function rand(s) {
    let t = (s.rng = (s.rng + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function shuffle(s, arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rand(s) * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }
  const active = (s, until) => s.turnIndex < until;
  const log = (s, text) => { s.log.push(text); s.events.push({ type: 'log', text }); };
  const cellAt = (s, c) => s.cells[K(c.col, c.row)];
  const exists = (s, c) => hex.exists(c.col, c.row, s.cols, s.rows);
  const enemyOf = (s, pid) => s.players[3 - pid];

  function occupant(s, c) {
    for (const pid of [1, 2]) { const w = s.players[pid].warband; if (w.col === c.col && w.row === c.row) return pid; }
    return 0;
  }
  const isBlocked = (s, c) => active(s, s.blocked[K(c.col, c.row)] || -1);
  const canEnter = (s, c) => exists(s, c) && !occupant(s, c) && !isBlocked(s, c);
  const isEdge = (s, c) => { for (let d = 0; d < 6; d++) if (!exists(s, hex.neighbor(c.col, c.row, d))) return true; return false; };

  function makeCard(s, defId, poiId) {
    return { uid: s.nextUid++, def: defId, poi: poiId == null ? -1 : poiId };
  }
  function newStatus() {
    return { nextAttackMult: 1, chargeMult: 1, blessingUntil: -1, formationUntil: -1, forcedUntil: -1, counterUntil: -1,
      overwatchUntil: -1, shieldsOnce: false, splitSteps: 0, splitSide: 1, claimSteps: 0 };
  }
  // D-030: movement cards carry no direction; the option chosen at drop time holds absolute directions.

  // ---------------------------------------------------------------- setup
  function createGame(opts) {
    const seed = (opts.seed >>> 0) || 1;
    const s = {
      version: CFG.VERSION, seed, rng: seed, nextUid: 1,
      cols: CFG.COLS, rows: CFG.ROWS, roundLimit: opts.roundLimit || CFG.ROUND_LIMIT,
      turnIndex: 0, current: 1, playedThisTurn: 0, attacksThisTurn: 0,
      attackLimit: opts.attackLimit != null ? opts.attackLimit : CFG.ATTACKS_PER_TURN,
      phase: 'play', winner: 0, endReason: '', scores: null,
      decorSeed: seed,
      cells: {}, pois: [], players: [null, null, null], blocked: {}, paintBuf: [], events: [], log: [],
    };
    for (let c = 0; c < s.cols; c++) for (let r = 0; r < hex.rowsInCol(c, s.rows); r++) {
      s.cells[K(c, r)] = { col: c, row: r, owner: 0, bonus: 0, poi: -1, paintedAt: -1 };
    }
    for (const pid of [1, 2]) {
      const o = opts.players[pid], st = CFG.START[pid];
      s.players[pid] = {
        id: pid, name: o.name || (pid === 1 ? 'Синие' : 'Красные'), bot: !!o.bot,
        deckIds: o.deck.slice(), poiIds: o.pois.slice(),
        warband: { col: st.col, row: st.row, minions: CFG.START_MINIONS },
        status: newStatus(), deck: [], hand: [], discard: [], inPlay: null, gained: 0, gainedLastRound: 0,
      };
    }
    CFG.POI_SLOTS.forEach((slot, i) => {
      const side = i < 3 ? 1 : 2;
      const type = s.players[side].poiIds[i % 3];
      const poi = { id: i, col: slot.col, row: slot.row, type, side, owner: 0 };
      s.pois.push(poi);
      s.cells[K(slot.col, slot.row)].poi = i;
    });
    for (const pid of [1, 2]) {
      const p = s.players[pid];
      p.deck = shuffle(s, p.deckIds.map(id => makeCard(s, id)));
      // starting zone: the spawn hex plus its neighbours (GDD §4.2)
      const w = p.warband;
      paint(s, p, w, 'walk');
      for (let d = 0; d < 6; d++) { const n = hex.neighbor(w.col, w.row, d); if (exists(s, n)) paint(s, p, n, 'fill'); }
      draw(s, p, CFG.HAND_SIZE);
    }
    s.paintBuf = []; s.events = [];
    for (const pid of [1, 2]) s.players[pid].gained = 0;
    log(s, `Матч начат. Seed ${seed}, лимит ${s.roundLimit} раундов.`);
    s.events.push({ type: 'turn', player: 1, round: 1 });
    return s;
  }

  // ---------------------------------------------------------------- deck
  function draw(s, p, n) {
    const drawn = [];
    let reshuffled = false;
    for (let i = 0; i < n; i++) {
      if (p.hand.length >= CFG.HAND_SIZE) break;
      if (p.deck.length === 0) {
        if (p.discard.length === 0) break;
        p.deck = shuffle(s, p.discard); p.discard = [];
        reshuffled = true;
        s.events.push({ type: 'reshuffle', player: p.id });
      }
      const c = p.deck.shift(); p.hand.push(c); drawn.push(c.uid);
    }
    if (drawn.length) s.events.push({ type: 'draw', player: p.id, uids: drawn, reshuffled });
  }
  function removePoiCard(s, p, poiId) {
    const pick = arr => { const i = arr.findIndex(c => c.poi === poiId); return i >= 0 ? arr.splice(i, 1)[0] : null; };
    const c = pick(p.hand) || pick(p.deck) || pick(p.discard);
    if (c) return c;
    if (p.inPlay && p.inPlay.poi === poiId) { const x = p.inPlay; p.inPlay = null; return x; }
    return null;
  }
  // Scout Route needs to show the deck top before the card is confirmed. Reshuffles the discard if the deck is empty.
  function peekDeck(s, p, n) {
    if (p.deck.length === 0 && p.discard.length) { p.deck = shuffle(s, p.discard); p.discard = []; }
    return p.deck.slice(0, n);
  }

  // ---------------------------------------------------------------- territory
  function paint(s, p, c, via) {
    const cell = cellAt(s, c);
    if (!cell) return false;
    if (via !== 'walk' && occupant(s, c)) return false; // D-018: a hex under a warband is only repainted by walking onto it
    if (cell.owner === p.id) return false;
    cell.owner = p.id; cell.bonus = 0; cell.paintedAt = s.turnIndex;
    p.gained++;
    s.paintBuf.push({ col: cell.col, row: cell.row, via });
    if (cell.poi >= 0) capturePoi(s, p, cell.poi);
    return true;
  }
  function flushPaint(s, p) {
    if (!s.paintBuf.length) return;
    const walked = s.paintBuf.filter(c => c.via !== 'fill'), filled = s.paintBuf.filter(c => c.via === 'fill');
    if (walked.length) s.events.push({ type: 'paint', player: p.id, cells: walked });
    if (filled.length) s.events.push({ type: 'fill', player: p.id, cells: filled, count: filled.length });
    s.paintBuf = [];
  }
  // D-004: cells not owned by p that cannot reach the board edge through non-p cells are enclosed and get filled.
  function enclosure(s, p) {
    const own = k => s.cells[k].owner === p.id;
    const seen = new Set(), queue = [];
    for (const k in s.cells) { const c = s.cells[k]; if (!own(k) && isEdge(s, c)) { seen.add(k); queue.push(c); } }
    while (queue.length) {
      const c = queue.shift();
      for (let d = 0; d < 6; d++) {
        const n = hex.neighbor(c.col, c.row, d), nk = K(n.col, n.row);
        if (!exists(s, n) || seen.has(nk) || own(nk)) continue;
        seen.add(nk); queue.push(s.cells[nk]);
      }
    }
    const enclosed = [];
    for (const k in s.cells) if (!own(k) && !seen.has(k)) enclosed.push(s.cells[k]);
    let filled = 0;
    for (const c of enclosed) if (paint(s, p, c, 'fill')) filled++;
    if (filled) log(s, `${p.name}: контур замкнут, +${filled} гексов.`);
    return filled;
  }
  function capturePoi(s, p, poiId) {
    const poi = s.pois[poiId];
    if (poi.owner === p.id) return;
    const def = POIS[poi.type];
    if (poi.owner) {
      const prev = s.players[poi.owner];
      removePoiCard(s, prev, poiId);
      s.events.push({ type: 'poiLost', player: prev.id, poiId });
      log(s, `${prev.name} теряют ${def.name} и карту ${CARDS[def.card].name}.`);
    }
    poi.owner = p.id;
    // D-032: the reward card goes on top of the deck and arrives with the next turn's draw, never straight into the hand
    p.deck.unshift(makeCard(s, def.card, poiId));
    s.events.push({ type: 'poi', player: p.id, poiId, cardName: CARDS[def.card].name, col: poi.col, row: poi.row });
    log(s, `${p.name} захватывают ${def.name}: карта ${CARDS[def.card].name} в колоду.`);
  }
  const territory = (s, pid) => { let t = 0; for (const k in s.cells) { const c = s.cells[k]; if (c.owner === pid) t += 1 + c.bonus; } return t; };
  const cellCount = (s, pid) => { let t = 0; for (const k in s.cells) if (s.cells[k].owner === pid) t++; return t; };
  const poiCount = (s, pid) => s.pois.filter(p => p.owner === pid).length;
  const totalCells = s => Object.keys(s.cells).length;

  // ---------------------------------------------------------------- movement
  function enterCell(s, p, c, stepDir) {
    const st = p.status;
    paint(s, p, c, 'walk');
    if (st.claimSteps > 0) { cellAt(s, c).bonus = 1; st.claimSteps--; }
    if (st.splitSteps > 0 && stepDir >= 0) {
      st.splitSteps--;
      const side = hex.neighbor(c.col, c.row, hex.turn(stepDir, st.splitSide));
      if (exists(s, side)) paint(s, p, side, 'split');
    }
    overwatchCheck(s, p);
  }
  function overwatchCheck(s, p) {
    const e = enemyOf(s, p.id);
    if (!active(s, e.status.overwatchUntil)) return;
    if (hex.distance(e.warband, p.warband) !== 1) return;
    e.status.overwatchUntil = -1;
    attack(s, e, p, { overwatch: true });
  }
  // Walks along absolute directions, stopping at the first illegal step (D-008).
  function moveAlong(s, p, dirs) {
    const w = p.warband, path = [];
    let lastDir = -1;
    for (const d of dirs) {
      const n = hex.neighbor(w.col, w.row, d);
      if (!canEnter(s, n)) break;
      w.col = n.col; w.row = n.row; lastDir = d;
      path.push({ col: n.col, row: n.row });
      enterCell(s, p, n, d);
      if (w.minions <= 0) break;
    }
    if (path.length) s.events.push({ type: 'move', player: p.id, path });
    return { path, lastDir };
  }
  function previewPath(s, p, dirs) {
    let cur = { col: p.warband.col, row: p.warband.row }; const path = [];
    for (const d of dirs) { const n = hex.neighbor(cur.col, cur.row, d); if (!canEnter(s, n)) break; path.push(n); cur = n; }
    return path;
  }

  // ---------------------------------------------------------------- combat
  function attack(s, a, d, opts) {
    opts = opts || {};
    // D-034: no facing — damage depends on the attacker's size and card effects only.
    // opts.overwatch / opts.counter are automatic reactions: they use no card buffs and do not count toward the turn limit.
    const aw = a.warband, dw = d.warband, st = a.status, ds = d.status, notes = [];
    const reaction = opts.overwatch || opts.counter;
    let amod = 1, dmod = 1;
    if (!reaction) {
      if (st.chargeMult !== 1) { amod *= st.chargeMult; st.chargeMult = 1; notes.push('Charge'); }
      if (st.nextAttackMult !== 1) { amod *= st.nextAttackMult; st.nextAttackMult = 1; notes.push('Battle Cry'); }
      if (active(s, st.blessingUntil)) { amod *= 1.15; notes.push('War Blessing'); }
    }
    if (active(s, ds.formationUntil)) { dmod *= CFG.FORMATION_MULT; notes.push('Reinforced Formation'); }
    if (active(s, ds.forcedUntil)) { dmod *= 1.15; notes.push('Forced March'); }
    if (ds.shieldsOnce) { ds.shieldsOnce = false; dmod *= CFG.SHIELDS_MULT; notes.push('Reinforced Shields'); }
    const rmod = opts.overwatch ? CFG.OVERWATCH_MULT : opts.counter ? CFG.COUNTER_MULT : 1;
    const dmg = Math.max(1, Math.round(CFG.DMG_PER_MINION * aw.minions * amod * dmod * rmod));
    const before = dw.minions;
    dw.minions = Math.max(0, dw.minions - dmg);
    if (!reaction) s.attacksThisTurn++;
    const label = opts.overwatch ? 'OVERWATCH' : opts.counter ? 'COUNTER' : '';
    s.events.push({ type: 'attack', attacker: a.id, defender: d.id, dmg, before, after: dw.minions, label, notes,
      overwatch: !!opts.overwatch, counter: !!opts.counter, col: dw.col, row: dw.row });
    const kind = opts.overwatch ? 'Дозор: ' : opts.counter ? 'Ответный удар: ' : '';
    log(s, `${a.name} ${kind}атакуют: −${dmg} (${before} → ${dw.minions})` + (notes.length ? ` [${notes.join(', ')}]` : ''));
    if (dw.minions <= 0) { endGame(s, a.id, 'elimination'); return; }
    // retaliation (Ответный удар): once per incoming attack, never against a reaction
    if (!reaction && active(s, ds.counterUntil)) attack(s, d, a, { counter: true });
  }
  // GDD §9.1 + D-006: after any card, the active warband attacks if the enemy stands in its front arc.
  function combatCheck(s, p) {
    if (s.phase !== 'play') return;
    if (s.attackLimit && s.attacksThisTurn >= s.attackLimit) return; // D-031: at most N attacks per turn
    const e = enemyOf(s, p.id);
    if (hex.distance(p.warband, e.warband) !== 1) return; // D-034: adjacency is all that matters
    attack(s, p, e, {});
  }

  // ---------------------------------------------------------------- card play
  // Returns { ok, options?, path? }. options: array of { key, label, cell?, facing?, side?, uid?, path? }.
  function getPlay(s, card) {
    const p = s.players[s.current], def = CARDS[card.def], w = p.warband;
    switch (def.kind) {
      case 'move': case 'charge': {
        // D-030: every rotation (and mirror image) of the card's pattern is an option; the UI picks the one
        // whose end cell is closest to where the card is dropped.
        const opts = [], seen = new Set();
        for (let d = 0; d < 6; d++) for (const m of def.mirror ? [1, -1] : [1]) {
          const dirs = def.pattern.map(o => ((d + m * o) % 6 + 6) % 6), key = dirs.join('');
          if (seen.has(key)) continue; seen.add(key);
          const path = previewPath(s, p, dirs);
          if (path.length) opts.push({ key: 'p' + key, dirs, path, end: path[path.length - 1], label: HB.cards.DIR_RU[d] + (m < 0 ? ' (зеркально)' : '') });
        }
        return { ok: opts.length > 0, options: opts };
      }
      case 'split': return { ok: true, options: [{ key: 'L', side: -1, label: '← левый бок' }, { key: 'R', side: 1, label: 'правый бок →' }] };
      case 'blink': {
        const opts = [];
        for (let d = 0; d < 6; d++) {
          const mid = hex.neighbor(w.col, w.row, d), tgt = hex.neighbor(mid.col, mid.row, d);
          if (canEnter(s, tgt)) opts.push({ key: 'b' + d, dir: d, path: [tgt], end: tgt, label: HB.cards.DIR_RU[d] });
        }
        return { ok: opts.length > 0, options: opts };
      }
      case 'explosive': {
        const opts = [];
        for (let d = 0; d < 6; d++) { const n = hex.neighbor(w.col, w.row, d); if (exists(s, n)) opts.push({ key: 'c' + K(n.col, n.row), cell: n, label: hex.DIR_NAMES[d] }); }
        return { ok: true, options: opts };
      }
      case 'scout': return { ok: p.deck.length + p.discard.length > 0, optionsFrom: 'deck' };
      default: return { ok: true };
    }
  }
  function scoutOptions(s, p) {
    return peekDeck(s, p, 3).map(c => ({ key: 'u' + c.uid, uid: c.uid, label: CARDS[c.def].name }));
  }

  function resolve(s, p, card, def, choice) {
    const st = p.status, w = p.warband, T = s.turnIndex;
    switch (def.kind) {
      case 'move': {
        moveAlong(s, p, choice.dirs);
        if (def.forcedMarch && hex.distance(w, enemyOf(s, p.id).warband) === 1) st.forcedUntil = T + 2;
        enclosure(s, p); break;
      }
      case 'charge': { st.chargeMult = CFG.CHARGE_MULT; moveAlong(s, p, choice.dirs); enclosure(s, p); break; }
      case 'reinforce': {
        let amt = def.amount;
        if (def.poiBonus && poiCount(s, p.id) >= 2) amt += def.poiBonus;
        const before = w.minions; w.minions += amt;
        s.events.push({ type: 'reinforce', player: p.id, amount: amt, before, after: w.minions, col: w.col, row: w.row });
        log(s, `${p.name}: +${amt} миньонов (${before} → ${w.minions}).`); break;
      }
      case 'buff_next': st.nextAttackMult *= def.mult; break;
      case 'formation': st.formationUntil = T + 2; break;
      case 'counter': st.counterUntil = T + 2; break;
      case 'split': st.splitSteps = 2; st.splitSide = choice.side; break;
      case 'overwatch': st.overwatchUntil = T + 2; break;
      case 'explosive': {
        const c = choice.cell, victim = occupant(s, c);
        s.blocked[K(c.col, c.row)] = T + 2;
        if (victim && victim !== p.id) {
          const e = s.players[victim], before = e.warband.minions;
          e.warband.minions = Math.max(0, before - CFG.EXPLOSIVE_DAMAGE);
          s.events.push({ type: 'explosion', col: c.col, row: c.row, dmg: CFG.EXPLOSIVE_DAMAGE, defender: victim, before, after: e.warband.minions });
          log(s, `${p.name}: Explosive Charge, −${CFG.EXPLOSIVE_DAMAGE} (${before} → ${e.warband.minions}).`);
          if (e.warband.minions <= 0) endGame(s, p.id, 'elimination');
        } else {
          s.events.push({ type: 'explosion', col: c.col, row: c.row, dmg: 0 });
          log(s, `${p.name}: Explosive Charge — гекс заблокирован.`);
        }
        break;
      }
      case 'blessing': st.blessingUntil = T + 5; break; // this turn + the next two own turns (D-013)
      case 'shields': st.shieldsOnce = true; break;
      case 'scout': {
        peekDeck(s, p, 3);
        const i = p.deck.findIndex(c => c.uid === choice.uid);
        if (i > 0) { const c = p.deck.splice(i, 1)[0]; p.deck.unshift(c); }
        log(s, `${p.name}: Scout Route — наверх положена ${CARDS[p.deck[0].def].name}.`); break;
      }
      case 'claim': st.claimSteps = 3; break;
      case 'blink': {
        const f = choice.dir, mid = hex.neighbor(w.col, w.row, f), tgt = hex.neighbor(mid.col, mid.row, f);
        if (canEnter(s, tgt)) {
          w.col = tgt.col; w.row = tgt.row;
          s.events.push({ type: 'move', player: p.id, path: [tgt], blink: true });
          enterCell(s, p, tgt, -1);
          enclosure(s, p);
        }
        break;
      }
    }
  }

  function validChoice(play, choice) {
    if (!play.options) return true;
    return !!choice && play.options.some(o => o.key === choice.key);
  }
  // choice: one of the option objects returned by getPlay/scoutOptions (or null for cards without a target).
  function playCard(s, uid, choice) {
    if (s.phase !== 'play') return false;
    const p = s.players[s.current];
    const idx = p.hand.findIndex(c => c.uid === uid);
    if (idx < 0) return false;
    const card = p.hand[idx], def = CARDS[card.def];
    const play = getPlay(s, card);
    if (!play.ok) return false;
    if (def.kind === 'scout') { if (!choice || !peekDeck(s, p, 3).some(c => c.uid === choice.uid)) return false; }
    else if (!validChoice(play, choice)) return false;
    p.hand.splice(idx, 1); p.inPlay = card;
    s.events.push({ type: 'play', player: p.id, card: def.name });
    log(s, `${p.name} играют ${def.name}${choice && choice.label ? ' (' + choice.label + ')' : ''}.`);
    resolve(s, p, card, def, choice);
    flushPaint(s, p);
    combatCheck(s, p);
    p.status.chargeMult = 1; // Charge only boosts the attack that follows it immediately
    // D-022: effects apply at once and the card goes to the discard; the turn continues until endTurn().
    if (p.inPlay) { p.discard.push(p.inPlay); p.inPlay = null; }
    s.playedThisTurn++;
    return true;
  }
  // D-022: a turn ends on demand, after at least one card was played.
  function endTurn(s) {
    if (s.phase !== 'play' || s.playedThisTurn < 1) return false;
    finishTurn(s);
    return true;
  }
  // D-009: a pass discards one card so that a hand full of unplayable cards cannot lock the player.
  // Only allowed when nothing was played this turn (otherwise use endTurn).
  function passTurn(s, uid) {
    if (s.phase !== 'play' || s.playedThisTurn > 0) return false;
    const p = s.players[s.current];
    const idx = p.hand.findIndex(c => c.uid === uid);
    if (idx < 0) return false;
    p.discard.push(p.hand.splice(idx, 1)[0]);
    log(s, `${p.name} пропускают ход, сбрасывая ${CARDS[p.discard[p.discard.length - 1].def].name}.`);
    finishTurn(s);
    return true;
  }

  // ---------------------------------------------------------------- turn flow
  function finishTurn(s) {
    const p = s.players[s.current];
    if (p.inPlay) { p.discard.push(p.inPlay); p.inPlay = null; }
    if (s.phase !== 'play') return;
    s.turnIndex++;
    if (s.turnIndex >= s.roundLimit * 2) { territoryVictory(s); return; }
    s.current = 3 - s.current;
    s.playedThisTurn = 0; s.attacksThisTurn = 0;
    if (s.turnIndex % 2 === 0) for (const pid of [1, 2]) { const q = s.players[pid]; q.gainedLastRound = q.gained; q.gained = 0; }
    const np = s.players[s.current];
    draw(s, np, CFG.HAND_SIZE);
    s.events.push({ type: 'turn', player: np.id, round: round(s) });
  }
  const round = s => Math.min(s.roundLimit, Math.floor(s.turnIndex / 2) + 1);

  function scoreboard(s) {
    const out = {};
    for (const pid of [1, 2]) out[pid] = { territory: territory(s, pid), cells: cellCount(s, pid), pois: poiCount(s, pid), minions: s.players[pid].warband.minions, gained: s.players[pid].gained };
    return out;
  }
  function territoryVictory(s) {
    const sc = scoreboard(s);
    const cmp = key => Math.sign(sc[1][key] - sc[2][key]);
    let w = cmp('territory'), reason = 'territory';
    if (!w) { w = cmp('pois'); reason = 'tiebreak:pois'; }
    if (!w) { w = cmp('minions'); reason = 'tiebreak:minions'; }
    if (!w) { w = cmp('gained'); reason = 'tiebreak:lastRound'; }
    if (!w) { endGame(s, 0, 'draw'); return; }
    endGame(s, w > 0 ? 1 : 2, reason);
  }
  function endGame(s, winner, reason) {
    if (s.phase === 'over') return;
    s.phase = 'over'; s.winner = winner; s.endReason = reason; s.scores = scoreboard(s);
    const name = winner ? s.players[winner].name : 'Ничья';
    const why = { elimination: 'отряд противника уничтожен', territory: 'больше территории', 'tiebreak:pois': 'равная территория, больше POI',
      'tiebreak:minions': 'равная территория и POI, больше миньонов', 'tiebreak:lastRound': 'равные показатели, больше захвачено в последнем раунде', draw: 'полное равенство' }[reason];
    log(s, winner ? `Победа: ${name} — ${why}.` : `Ничья — ${why}.`);
    s.events.push({ type: 'gameover', winner, reason, scores: s.scores });
  }

  function takeEvents(s) { const e = s.events; s.events = []; return e; }
  function clone(s) { const e = s.events, l = s.log; s.events = []; s.log = []; const c = JSON.parse(JSON.stringify(s)); s.events = e; s.log = l; return c; }

  HB.rules = { createGame, playCard, endTurn, passTurn, getPlay, scoutOptions, takeEvents, clone, territory, cellCount, poiCount, totalCells,
    scoreboard, round, occupant, isBlocked, active, rand };
})();
