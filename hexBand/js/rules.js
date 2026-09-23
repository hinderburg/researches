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
  // D-047: a warband's strike = 5 × (N / 24)^0.7 — fractional; rounding happens only when damage is dealt
  const baseDamage = n => CFG.DAMAGE_BASE * Math.pow(Math.max(0, n) / CFG.DAMAGE_REF, CFG.DAMAGE_EXP);
  const applyDamage = v => Math.max(1, Math.round(v));

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
  function newStatus() { return { attackBonus: 0, formationUntil: -1 }; }
  const attackAllowed = s => !s.attackLimit || s.attacksThisTurn < s.attackLimit;
  // D-042: a step onto the enemy's hex is an attack (if attacks are still allowed this turn)
  const isEnemyCell = (s, pid, c) => { const o = occupant(s, c); return o && o !== pid; };

  // ---------------------------------------------------------------- setup
  function createGame(opts) {
    const seed = (opts.seed >>> 0) || 1;
    const s = {
      version: CFG.VERSION, seed, rng: seed, nextUid: 1,
      cols: CFG.COLS, rows: CFG.ROWS, roundLimit: opts.roundLimit || CFG.ROUND_LIMIT,
      turnIndex: 0, current: 1, playedThisTurn: 0, attacksThisTurn: 0,
      attackLimit: opts.attackLimit != null ? opts.attackLimit : CFG.ATTACKS_PER_TURN,
      phase: 'play', winner: 0, endReason: '', scores: null, decorSeed: seed,
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

  // ---------------------------------------------------------------- territory
  function paint(s, p, c, via) {
    const cell = cellAt(s, c);
    if (!cell) return false;
    if (via !== 'walk' && occupant(s, c)) return false; // D-017: a hex under a warband is only repainted by walking onto it
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
      log(s, `${prev.name} теряют ${def.ru} и карту «${CARDS[def.card].ru}».`);
    }
    poi.owner = p.id;
    const card = makeCard(s, def.card, poiId);
    // D-040: the reward card goes straight into the hand when there is room, otherwise on top of the deck
    if (p.hand.length < CFG.HAND_SIZE) { p.hand.push(card); s.events.push({ type: 'poiCard', player: p.id, uid: card.uid, col: poi.col, row: poi.row }); }
    else p.deck.unshift(card);
    s.events.push({ type: 'poi', player: p.id, poiId, cardName: CARDS[def.card].ru, col: poi.col, row: poi.row });
    log(s, `${p.name} захватывают ${def.ru}: карта «${CARDS[def.card].ru}» ${p.hand.includes(card) ? 'в руку' : 'в колоду'}.`);
  }
  const territory = (s, pid) => { let t = 0; for (const k in s.cells) { const c = s.cells[k]; if (c.owner === pid) t += 1 + c.bonus; } return t; };
  const cellCount = (s, pid) => { let t = 0; for (const k in s.cells) if (s.cells[k].owner === pid) t++; return t; };
  const poiCount = (s, pid) => s.pois.filter(p => p.owner === pid).length;
  const totalCells = s => Object.keys(s.cells).length;

  // ---------------------------------------------------------------- movement
  function enterCell(s, p, c, stepDir, def) {
    paint(s, p, c, 'walk');
    if (def && def.wide && stepDir >= 0) { // Wide March: the two cells flanking the step (adjacent to both start and end)
      for (const t of [2, -2]) { const n = hex.neighbor(c.col, c.row, hex.turn(stepDir, t)); if (exists(s, n)) paint(s, p, n, 'split'); }
    }
  }
  // Walks along absolute directions, stopping at the first illegal step (D-008).
  function moveAlong(s, p, dirs, def) {
    const w = p.warband, path = [];
    let lastDir = -1, clashed = false;
    for (const d of dirs) {
      const n = hex.neighbor(w.col, w.row, d);
      if (exists(s, n) && isEnemyCell(s, p.id, n) && attackAllowed(s)) { // D-042: stepping onto the enemy = attack
        if (path.length) s.events.push({ type: 'move', player: p.id, path: path.slice() });
        flushPaint(s, p);
        clash(s, p, enemyOf(s, p.id));
        clashed = true;
        break;
      }
      if (!canEnter(s, n)) break;
      w.col = n.col; w.row = n.row; lastDir = d;
      path.push({ col: n.col, row: n.row });
      enterCell(s, p, n, d, def);
    }
    if (!clashed && path.length) s.events.push({ type: 'move', player: p.id, path });
    if (!clashed && def && def.ahead && lastDir >= 0) { // Dash: claim the next cell(s) in the direction of travel without moving
      let c = { col: w.col, row: w.row };
      for (let i = 0; i < def.ahead; i++) { c = hex.neighbor(c.col, c.row, lastDir); if (!exists(s, c) || occupant(s, c)) break; paint(s, p, c, 'split'); }
    }
    return { path, lastDir };
  }
  function previewPath(s, p, dirs) {
    let cur = { col: p.warband.col, row: p.warband.row }; const path = [];
    for (const d of dirs) {
      const n = hex.neighbor(cur.col, cur.row, d);
      if (exists(s, n) && isEnemyCell(s, p.id, n) && attackAllowed(s)) { path.push({ col: n.col, row: n.row, attack: true }); break; }
      if (!canEnter(s, n)) break;
      path.push(n); cur = n;
    }
    return path;
  }

  // ---------------------------------------------------------------- combat (D-039)
  // outgoing strike of a warband with its card modifiers, reduced by the target's formation
  // D-043: flat modifiers — base + attack bonus (Battle Cry, consumed) − defender's formation reduction (fractional, D-047)
  function strikeValue(s, a, d, consume) {
    let v = baseDamage(a.warband.minions);
    const notes = [];
    if (a.status.attackBonus) { v += a.status.attackBonus; if (consume) a.status.attackBonus = 0; notes.push('Боевой клич'); }
    if (d && active(s, d.status.formationUntil)) { v -= CFG.FORMATION_REDUCE; notes.push('Плотный строй'); }
    return { value: v, notes };
  }
  // D-047: what an attack would do, without touching the state — shown to the player while choosing an attacking route
  function forecast(s, a, d, kind) {
    const aw = a.warband, dw = d.warband;
    if (kind === 'volley' || kind === 'catapult') {
      const dmg = kind === 'volley' ? applyDamage(strikeValue(s, a, d, false).value) : CARDS.catapult.damage;
      return { kind, dmgToDef: dmg, dmgToAtt: 0, aAfter: aw.minions, dAfter: Math.max(0, dw.minions - dmg), result: dw.minions - dmg <= 0 ? 'eliminated' : 'ranged' };
    }
    const dmgToDef = applyDamage(strikeValue(s, a, d, false).value), dmgToAtt = applyDamage(strikeValue(s, d, a, false).value);
    const aAfter = Math.max(0, aw.minions - dmgToAtt), dAfter = Math.max(0, dw.minions - dmgToDef);
    const result = aAfter <= 0 || dAfter <= 0 ? 'eliminated' : aAfter > dAfter ? 'defenderRetreats' : 'attackerRetreats';
    return { kind: 'clash', dmgToDef, dmgToAtt, aAfter, dAfter, result };
  }
  // one-sided hit (Volley, Catapult): no clash, no retreat
  function strike(s, a, d, dmg, kind) {
    const dw = d.warband, before = dw.minions;
    dw.minions = Math.max(0, dw.minions - dmg);
    s.attacksThisTurn++;
    s.events.push({ type: 'attack', attacker: a.id, defender: d.id, dmg, before, after: dw.minions, label: kind, col: dw.col, row: dw.row, from: { col: a.warband.col, row: a.warband.row } });
    log(s, `${a.name}: ${kind} — −${dmg} (${before} → ${dw.minions}).`);
    if (dw.minions <= 0) endGame(s, a.id, 'elimination');
  }
  // mutual clash: the attacker runs onto the defender's hex, both strike, the smaller warband falls back one hex
  function clash(s, a, d) {
    const aw = a.warband, dw = d.warband, from = { col: aw.col, row: aw.row }, at = { col: dw.col, row: dw.row };
    const sa = strikeValue(s, a, d, true), sd = strikeValue(s, d, a, true);
    sa.value = applyDamage(sa.value); sd.value = applyDamage(sd.value); // D-047: round only when dealt
    const aBefore = aw.minions, dBefore = dw.minions;
    dw.minions = Math.max(0, dw.minions - sa.value);
    aw.minions = Math.max(0, aw.minions - sd.value);
    s.attacksThisTurn++;
    let result = 'attackerRetreats', attackerTo = from, defenderTo = at;
    if (aw.minions <= 0 || dw.minions <= 0) result = 'eliminated';
    else if (aw.minions > dw.minions) {
      // the defender falls back away from the attacker; if that hex is taken, to the free neighbour farthest from the attacker
      const dir = hex.dirBetween(from, at);
      let tgt = hex.neighbor(at.col, at.row, dir);
      if (!canEnter(s, tgt)) {
        tgt = null; let bd = -1;
        for (let d6 = 0; d6 < 6; d6++) { const n = hex.neighbor(at.col, at.row, d6); if (!canEnter(s, n)) continue; const dist = hex.distance(n, from); if (dist > bd) { bd = dist; tgt = n; } }
      }
      if (tgt) {
        result = 'defenderRetreats'; defenderTo = tgt; attackerTo = at;
        flushPaint(s, a);
        dw.col = tgt.col; dw.row = tgt.row; paint(s, d, tgt, 'walk'); flushPaint(s, d);
        aw.col = at.col; aw.row = at.row; paint(s, a, at, 'walk');
      } else result = 'hold';
    }
    s.events.push({ type: 'clash', attacker: a.id, defender: d.id, from, at, dmgToDef: sa.value, dmgToAtt: sd.value,
      aBefore, aAfter: aw.minions, dBefore, dAfter: dw.minions, result, attackerTo, defenderTo, notes: sa.notes.concat(sd.notes) });
    const outcome = { attackerRetreats: `${a.name} отступают`, defenderRetreats: `${d.name} отступают`, hold: 'оба стоят', eliminated: 'отряд уничтожен' }[result];
    log(s, `Бой: ${a.name} −${sd.value} (${aBefore} → ${aw.minions}), ${d.name} −${sa.value} (${dBefore} → ${dw.minions}) — ${outcome}.`);
    if (result === 'eliminated') {
      const winner = aw.minions > 0 ? a.id : dw.minions > 0 ? d.id : 0;
      endGame(s, winner, winner ? 'elimination' : 'draw');
      return;
    }
    if (result === 'defenderRetreats') { enclosure(s, a); flushPaint(s, a); }
  }

  // ---------------------------------------------------------------- card play
  // Returns { ok, options? }. options: array of { key, label, ... } — one of them is passed back as `choice`.
  function getPlay(s, card) {
    const p = s.players[s.current], def = CARDS[card.def], w = p.warband, e = enemyOf(s, p.id);
    switch (def.kind) {
      case 'move': {
        // D-030: every rotation (and mirror image) of the pattern is an option; the UI picks the one closest to the drop point
        const opts = [], seen = new Set();
        for (let d = 0; d < 6; d++) for (const m of def.mirror ? [1, -1] : [1]) {
          const dirs = def.pattern.map(o => ((d + m * o) % 6 + 6) % 6), key = dirs.join('');
          if (seen.has(key)) continue; seen.add(key);
          const path = previewPath(s, p, dirs);
          if (path.length) opts.push({ key: 'p' + key, dirs, path, end: path[path.length - 1], label: HB.cards.DIR_RU[d] + (m < 0 ? ' (зеркально)' : '') });
        }
        return { ok: opts.length > 0, options: opts };
      }
      case 'blink': {
        const opts = [];
        for (let d = 0; d < 6; d++) {
          const mid = hex.neighbor(w.col, w.row, d), tgt = hex.neighbor(mid.col, mid.row, d);
          if (canEnter(s, tgt)) opts.push({ key: 'b' + d, dir: d, path: [tgt], end: tgt, label: HB.cards.DIR_RU[d] });
        }
        return { ok: opts.length > 0, options: opts };
      }
      case 'flank_claim': {
        const opts = [];
        for (let axis = 0; axis < 3; axis++) {
          const cells = [hex.neighbor(w.col, w.row, axis), hex.neighbor(w.col, w.row, axis + 3)].filter(c => exists(s, c) && !occupant(s, c));
          if (cells.length) opts.push({ key: 'a' + axis, axis, cells, label: HB.cards.AXIS_RU[axis] });
        }
        return { ok: opts.length > 0, options: opts };
      }
      case 'explosive': {
        const opts = [];
        for (let d = 0; d < 6; d++) { const n = hex.neighbor(w.col, w.row, d); if (exists(s, n)) opts.push({ key: 'c' + K(n.col, n.row), cell: n, label: hex.DIR_NAMES[d] }); }
        return { ok: true, options: opts };
      }
      case 'volley': case 'catapult': return { ok: hex.distance(w, e.warband) <= def.range };
      case 'prayer': return { ok: p.discard.length > 0 };
      case 'scout_draw': return { ok: p.deck.length + p.discard.length > 0 };
      default: return { ok: true };
    }
  }

  function resolve(s, p, card, def, choice) {
    const st = p.status, w = p.warband, T = s.turnIndex, e = enemyOf(s, p.id);
    switch (def.kind) {
      case 'move': { moveAlong(s, p, choice.dirs, def); enclosure(s, p); break; }
      case 'blink': {
        const f = choice.dir, mid = hex.neighbor(w.col, w.row, f), tgt = hex.neighbor(mid.col, mid.row, f);
        if (canEnter(s, tgt)) {
          w.col = tgt.col; w.row = tgt.row;
          s.events.push({ type: 'move', player: p.id, path: [tgt], blink: true });
          enterCell(s, p, tgt, -1, def);
          enclosure(s, p);
        }
        break;
      }
      case 'flank_claim': { for (const c of choice.cells) paint(s, p, c, 'split'); enclosure(s, p); break; }
      case 'cordon': { for (let d = 0; d < 6; d++) { const n = hex.neighbor(w.col, w.row, d); if (exists(s, n)) paint(s, p, n, 'split'); } enclosure(s, p); break; }
      case 'volley': { const sv = strikeValue(s, p, e, true); strike(s, p, e, applyDamage(sv.value), 'Залп'); break; }
      case 'catapult': { strike(s, p, e, def.damage, 'Катапульта'); break; }
      case 'reinforce': {
        const before = w.minions; w.minions += def.amount;
        s.events.push({ type: 'reinforce', player: p.id, amount: def.amount, before, after: w.minions, col: w.col, row: w.row });
        log(s, `${p.name}: +${def.amount} миньонов (${before} → ${w.minions}).`); break;
      }
      case 'buff_next': st.attackBonus += def.bonus; break;
      case 'formation': st.formationUntil = T + 2; break;
      case 'explosive': {
        const c = choice.cell, victim = occupant(s, c);
        s.blocked[K(c.col, c.row)] = T + 2;
        if (victim && victim !== p.id) {
          const v = s.players[victim], before = v.warband.minions;
          v.warband.minions = Math.max(0, before - CFG.EXPLOSIVE_DAMAGE);
          s.events.push({ type: 'explosion', col: c.col, row: c.row, dmg: CFG.EXPLOSIVE_DAMAGE, defender: victim, before, after: v.warband.minions });
          log(s, `${p.name}: Взрывной заряд, −${CFG.EXPLOSIVE_DAMAGE} (${before} → ${v.warband.minions}).`);
          if (v.warband.minions <= 0) endGame(s, p.id, 'elimination');
        } else {
          s.events.push({ type: 'explosion', col: c.col, row: c.row, dmg: 0 });
          log(s, `${p.name}: Взрывной заряд — гекс заблокирован.`);
        }
        break;
      }
      case 'prayer': {
        const c = p.discard.pop();
        if (c) { p.hand.push(c); s.events.push({ type: 'cardToHand', player: p.id, uid: c.uid, from: 'discard' }); log(s, `${p.name}: Молитва — «${CARDS[c.def].ru}» возвращается в руку.`); }
        break;
      }
      case 'scout_draw': { const n = p.hand.length; draw(s, p, CFG.HAND_SIZE); log(s, `${p.name}: Разведка — добор ${p.hand.length - n} карт.`); break; }
      case 'banner': {
        const cells = [];
        const mark = c => { const cell = cellAt(s, c); if (cell && cell.owner === p.id && !cell.bonus) { cell.bonus = 1; cells.push({ col: cell.col, row: cell.row }); } };
        mark(w); for (let d = 0; d < 6; d++) mark(hex.neighbor(w.col, w.row, d));
        s.events.push({ type: 'bonus', player: p.id, cells });
        log(s, `${p.name}: Знамя — +${cells.length} очков территории.`); break;
      }
    }
  }

  function validChoice(play, choice) {
    if (!play.options) return true;
    return !!choice && play.options.some(o => o.key === choice.key);
  }
  // choice: one of the option objects returned by getPlay (or null for cards without a target).
  function playCard(s, uid, choice) {
    if (s.phase !== 'play') return false;
    const p = s.players[s.current];
    const idx = p.hand.findIndex(c => c.uid === uid);
    if (idx < 0) return false;
    const card = p.hand[idx], def = CARDS[card.def];
    const play = getPlay(s, card);
    if (!play.ok || !validChoice(play, choice)) return false;
    p.hand.splice(idx, 1); p.inPlay = card;
    s.events.push({ type: 'play', player: p.id, card: def.ru });
    log(s, `${p.name} играют «${def.ru}»${choice && choice.label ? ' (' + choice.label + ')' : ''}.`);
    resolve(s, p, card, def, choice);
    flushPaint(s, p);
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
  function passTurn(s, uid) {
    if (s.phase !== 'play' || s.playedThisTurn > 0) return false;
    const p = s.players[s.current];
    const idx = p.hand.findIndex(c => c.uid === uid);
    if (idx < 0) return false;
    p.discard.push(p.hand.splice(idx, 1)[0]);
    log(s, `${p.name} пропускают ход, сбрасывая «${CARDS[p.discard[p.discard.length - 1].def].ru}».`);
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
    const why = { elimination: 'отряд противника уничтожен', territory: 'больше территории', 'tiebreak:pois': 'равная территория, больше точек',
      'tiebreak:minions': 'равная территория и точки, больше миньонов', 'tiebreak:lastRound': 'равные показатели, больше захвачено в последнем раунде', draw: 'полное равенство' }[reason];
    log(s, winner ? `Победа: ${name} — ${why}.` : `Ничья — ${why}.`);
    s.events.push({ type: 'gameover', winner, reason, scores: s.scores });
  }

  function takeEvents(s) { const e = s.events; s.events = []; return e; }
  function clone(s) { const e = s.events, l = s.log; s.events = []; s.log = []; const c = JSON.parse(JSON.stringify(s)); s.events = e; s.log = l; return c; }

  HB.rules = { createGame, playCard, endTurn, passTurn, getPlay, takeEvents, clone, territory, cellCount, poiCount, totalCells,
    scoreboard, round, occupant, isBlocked, active, rand, baseDamage, forecast };
})();
