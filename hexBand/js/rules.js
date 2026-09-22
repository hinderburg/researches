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
    return { nextAttackMult: 1, chargeMult: 1, rearAssault: false, blessingUntil: -1, formationUntil: -1, forcedUntil: -1,
      overwatchUntil: -1, shieldsOnce: false, splitSteps: 0, splitSide: 1, claimSteps: 0 };
  }
  // D-025: card directions are absolute for the board as the player sees it (forward = toward the enemy).
  // Blue plays bottom-up; for red the vertical axis is mirrored so "left" stays screen-left.
  const MIRROR = [3, 2, 1, 0, 5, 4];
  const absDir = (p, r) => p.id === 1 ? r : MIRROR[r];
  const absDirs = (p, rel) => rel.map(r => absDir(p, r));

  // ---------------------------------------------------------------- setup
  function createGame(opts) {
    const seed = (opts.seed >>> 0) || 1;
    const s = {
      version: CFG.VERSION, seed, rng: seed, nextUid: 1,
      cols: CFG.COLS, rows: CFG.ROWS, roundLimit: opts.roundLimit || CFG.ROUND_LIMIT,
      turnIndex: 0, current: 1, playedThisTurn: 0, phase: 'play', winner: 0, endReason: '', scores: null,
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
        warband: { col: st.col, row: st.row, facing: st.facing, minions: CFG.START_MINIONS },
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
    for (let i = 0; i < n; i++) {
      if (p.hand.length >= CFG.HAND_SIZE) return;
      if (p.deck.length === 0) {
        if (p.discard.length === 0) return;
        p.deck = shuffle(s, p.discard); p.discard = [];
        s.events.push({ type: 'reshuffle', player: p.id });
      }
      p.hand.push(p.deck.shift());
    }
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
    p.deck.unshift(makeCard(s, def.card, poiId));
    draw(s, p, 1); // GDD §6.2: comes to hand at once when there is a free slot
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
    if (!hex.inFrontArc(e.warband.facing, hex.dirBetween(e.warband, p.warband))) return;
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
    if (path.length) { w.facing = lastDir; s.events.push({ type: 'move', player: p.id, path }); } // D-024: the crowd faces where it last walked
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
    const aw = a.warband, dw = d.warband, st = a.status, ds = d.status, notes = [];
    let zone = hex.relZone(dw.facing, hex.dirBetween(dw, aw));
    let mult = CFG.FACING_MOD[zone], amod = 1, dmod = 1;
    if (!opts.overwatch) {
      if (st.rearAssault) { st.rearAssault = false; if (zone === 'back') mult = 1.9; else amod *= 1.1; notes.push('Rear Assault'); }
      if (st.chargeMult !== 1) { amod *= st.chargeMult; st.chargeMult = 1; notes.push('Charge'); }
      if (st.nextAttackMult !== 1) { amod *= st.nextAttackMult; st.nextAttackMult = 1; notes.push('Battle Cry'); }
      if (active(s, st.blessingUntil)) { amod *= 1.15; notes.push('War Blessing'); }
    }
    if (active(s, ds.formationUntil)) { dmod *= zone === 'front' ? 0.7 : zone === 'side' ? 0.85 : 1; notes.push('Reinforced Formation'); }
    if (active(s, ds.forcedUntil)) { dmod *= 1.15; notes.push('Forced March'); }
    if (zone === 'front' && ds.shieldsOnce) { ds.shieldsOnce = false; dmod *= 0.6; notes.push('Reinforced Shields'); }
    let dmg = CFG.DMG_PER_MINION * aw.minions * mult * amod * dmod * (opts.overwatch ? CFG.OVERWATCH_MULT : 1);
    dmg = Math.max(1, Math.round(dmg));
    const before = dw.minions;
    dw.minions = Math.max(0, dw.minions - dmg);
    const label = opts.overwatch ? 'OVERWATCH' : zone === 'back' ? 'BACKSTAB!' : zone === 'side' ? 'FLANK!' : '';
    s.events.push({ type: 'attack', attacker: a.id, defender: d.id, zone, dmg, before, after: dw.minions, label, notes,
      overwatch: !!opts.overwatch, col: dw.col, row: dw.row });
    const zoneRu = { front: 'во фронт', side: 'во фланг', back: 'в спину' }[zone];
    log(s, `${a.name} ${opts.overwatch ? 'Overwatch: ' : ''}атакуют ${zoneRu}: −${dmg} (${before} → ${dw.minions})` + (notes.length ? ` [${notes.join(', ')}]` : ''));
    if (dw.minions <= 0) endGame(s, a.id, 'elimination');
  }
  // GDD §9.1 + D-006: after any card, the active warband attacks if the enemy stands in its front arc.
  function combatCheck(s, p) {
    if (s.phase !== 'play') return;
    const e = enemyOf(s, p.id);
    if (hex.distance(p.warband, e.warband) !== 1) return;
    if (!hex.inFrontArc(p.warband.facing, hex.dirBetween(p.warband, e.warband))) return;
    attack(s, p, e, {});
  }

  // ---------------------------------------------------------------- card play
  // Returns { ok, options?, path? }. options: array of { key, label, cell?, facing?, side?, uid?, path? }.
  function getPlay(s, card) {
    const p = s.players[s.current], def = CARDS[card.def], w = p.warband;
    const sideOpts = dirsFor => {
      const opts = [];
      for (const side of [-1, 1]) {
        const path = previewPath(s, p, absDirs(p, dirsFor(side)));
        if (path.length) opts.push({ key: side < 0 ? 'L' : 'R', side, label: side < 0 ? '← влево' : 'вправо →', path });
      }
      return { ok: opts.length > 0, options: opts };
    };
    switch (def.kind) {
      case 'move': case 'charge': { const path = previewPath(s, p, absDirs(p, def.dirs)); return { ok: path.length > 0, path }; }
      case 'sidestep': return sideOpts(side => [side < 0 ? 4 : 2]);          // back-left / back-right
      case 'zigzag': return sideOpts(side => side < 0 ? [5, 1] : [1, 5]);    // forward-left then forward-right, or the reverse
      case 'split': return { ok: true, options: [{ key: 'L', side: -1, label: '← левый бок' }, { key: 'R', side: 1, label: 'правый бок →' }] };
      case 'blink': {
        const f = absDir(p, 0), mid = hex.neighbor(w.col, w.row, f), tgt = hex.neighbor(mid.col, mid.row, f);
        return { ok: canEnter(s, tgt), path: [tgt] };
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
        moveAlong(s, p, absDirs(p, def.dirs));
        if (def.forcedMarch && hex.distance(w, enemyOf(s, p.id).warband) === 1) st.forcedUntil = T + 2;
        enclosure(s, p); break;
      }
      case 'charge': { st.chargeMult = CFG.CHARGE_MULT; moveAlong(s, p, absDirs(p, def.dirs)); enclosure(s, p); break; }
      case 'sidestep': { moveAlong(s, p, absDirs(p, [choice.side < 0 ? 4 : 2])); enclosure(s, p); break; }
      case 'zigzag': { moveAlong(s, p, absDirs(p, choice.side < 0 ? [5, 1] : [1, 5])); enclosure(s, p); break; }
      case 'reinforce': {
        let amt = def.amount;
        if (def.poiBonus && poiCount(s, p.id) >= 2) amt += def.poiBonus;
        const before = w.minions; w.minions += amt;
        s.events.push({ type: 'reinforce', player: p.id, amount: amt, before, after: w.minions, col: w.col, row: w.row });
        log(s, `${p.name}: +${amt} миньонов (${before} → ${w.minions}).`); break;
      }
      case 'buff_next': st.nextAttackMult *= def.mult; break;
      case 'formation': st.formationUntil = T + 2; break;
      case 'rear_assault': st.rearAssault = true; break;
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
        const f = absDir(p, 0), mid = hex.neighbor(w.col, w.row, f), tgt = hex.neighbor(mid.col, mid.row, f);
        if (canEnter(s, tgt)) {
          w.col = tgt.col; w.row = tgt.row; w.facing = f;
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
    s.playedThisTurn = 0;
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
