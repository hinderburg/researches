// Game rules — V4 "Overlord" (iteration3, D-085; design in docs/VARIANT-OVERLORD.md).
// Pure data state + functions that mutate it and push events for the renderer. The state holds no functions or DOM
// references, so it can be JSON-cloned (the bot relies on this).
//
// Each player has an Overlord (kept in `players[pid].warband` so the UI's position code keeps working) with a retinue of
// up to 3 minion types. Minion cards send ALL minions of their type on a sortie along a route; they paint, fight, then
// walk back. Damage to the Overlord's hex is taken by the retinue first (the shield). Dead minions go back to their pit
// in the castle; each turn a pit sends out `out` minions while the type is below the army size, and they run to the
// Overlord along the player's own territory — or wait at its nearest hex when there is no road. The castle is a
// passive, untakeable base. Win: kill the enemy Overlord, or hold more territory after the last round.
window.HB = window.HB || {};
(function () {
  const hex = HB.hex, CFG = HB.CONFIG, CARDS = HB.cards.CARDS, TYPES = HB.cards.MINION_TYPES, PK = HB.cards.POINT_KINDS;
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
  const exists = (s, c) => !!s.cells[K(c.col, c.row)]; // D-093: the board is the set of cells (a diamond), not a rectangle
  const enemyOf = (s, pid) => s.players[3 - pid];
  const edgeKey = (a, b) => { const ka = K(a.col, a.row), kb = K(b.col, b.row); return ka < kb ? ka + '|' + kb : kb + '|' + ka; };
  const walled = (s, a, b) => { const w = s.walls[edgeKey(a, b)]; return !!w && active(s, w.until); };
  const isSwamp = (s, c) => active(s, s.swamps[K(c.col, c.row)] || -1);
  const isFortifiedAgainst = (s, cell, pid) => !!cell.fortOwner && cell.fortOwner !== pid && active(s, cell.fortUntil || -1);
  const isBlocked = (s, c) => active(s, s.blocked[K(c.col, c.row)] || -1);
  const castleAt = (s, c) => { const cell = cellAt(s, c); return cell ? cell.castle || 0 : 0; };

  // ---------------------------------------------------------------- stats: direct numbers (D-085)
  const lvlAdd = (L, g) => Math.floor((L - 1) * (g || 0) + 1e-9);
  // what a minion type has at meta level L (no match bonuses) — the camp shows exactly these numbers
  function statsAt(t, L) {
    const d = TYPES[t];
    return { hp: d.hp + lvlAdd(L, d.grow.hp), atk: d.atk + lvlAdd(L, d.grow.atk), out: d.out + lvlAdd(L, d.grow.out), ret: d.ret + (L >= 4 ? 1 : 0) + (L >= 8 ? 1 : 0),
      speed: d.speed, capture: d.capture, range: d.range, weight: d.weight, shield: d.shield };
  }
  function heroStatsAt(L) { const H = CFG.HERO; return { hp: H.hp + lvlAdd(L, H.hpGrow), atk: H.atk + lvlAdd(L, H.atkGrow), command: H.command + lvlAdd(L, H.commandGrow) }; }
  const citadelHeld = (s, pid) => s.pois.some(q => q.kind === 'citadel' && q.owner === pid);
  // D-091: a recruiting post raises the army size of the type that took it by 10 % (at least 1) while the player holds it
  function postBoost(s, p, t) {
    const n = s.pois.filter(q => q.kind === 'post' && q.owner === p.id && q.boost === t).length;
    return n ? Math.max(1, Math.round(p.baseComp[t] * CFG.POST_BOOST * n)) : 0;
  }
  function recomputeComp(s) { for (const pid of [1, 2]) { const p = s.players[pid]; for (const t of p.types) p.comp[t] = p.baseComp[t] + postBoost(s, p, t); } }
  const typeLevel = (s, pid, t) => s.players[pid].levels[t] || 1;
  function typeStat(s, pid, t, key) {
    const st = statsAt(t, typeLevel(s, pid, t));
    return key === 'out' ? st.out + (citadelHeld(s, pid) ? 1 : 0) : st[key];
  }
  const heroStat = (p, key) => heroStatsAt(p.levels.hero || 1)[key];
  const warCry = (s, p) => active(s, p.status.warCryUntil) ? 1 : 0;

  // ---------------------------------------------------------------- groups on the board
  function heroAtCell(s, c) { for (const pid of [1, 2]) { const w = s.players[pid].warband; if (!w.dead && w.col === c.col && w.row === c.row) return pid; } return 0; }
  const squadsAt = (s, c) => s.squads.filter(q => q.col === c.col && q.row === c.row);
  // the group standing on a hex: an Overlord (with his retinue) or a squad; an Overlord hides squads of his own on his hex
  function groupAt(s, c) {
    const h = heroAtCell(s, c); if (h) return { kind: 'hero', pid: h };
    const q = s.squads.find(x => x.col === c.col && x.row === c.row);
    return q ? { kind: 'squad', pid: q.owner, sq: q } : null;
  }
  const occupant = (s, c) => { const g = groupAt(s, c); return g ? g.pid : 0; };
  const groupPos = (s, g) => g.kind === 'hero' ? { col: s.players[g.pid].warband.col, row: s.players[g.pid].warband.row } : { col: g.sq.col, row: g.sq.row };
  function armyOnField(s, pid, t) {
    const p = s.players[pid]; let n = 0;
    for (const tt of p.types) if (!t || t === tt) n += p.retinue[tt].n;
    for (const q of s.squads) if (q.owner === pid && (!t || q.type === t)) n += q.n;
    return n;
  }
  const retinueHP = (s, p) => p.types.reduce((a, t) => a + Math.max(0, p.retinue[t].n * typeStat(s, p.id, t, 'hp') - p.retinue[t].wound), 0);
  function syncMinions(s) { for (const pid of [1, 2]) s.players[pid].warband.minions = armyOnField(s, pid); }
  const sortieBlocked = (s, p, t) => s.squads.some(q => q.owner === p.id && q.type === t && (q.state === 'out' || q.state === 'return' || q.state === 'hold'));

  function makeCard(s, defId) { return { uid: s.nextUid++, def: defId, poi: -1 }; }
  function newStatus() { return { warCryUntil: -1, attackBonus: 0, formationUntil: -1 }; }

  // ---------------------------------------------------------------- setup
  function createGame(opts) {
    const seed = (opts.seed >>> 0) || 1;
    const s = {
      version: CFG.VERSION, variant: 'overlord', seed, rng: seed, nextUid: 1, nextSquadId: 1,
      cols: CFG.COLS, rows: CFG.ROWS, roundLimit: opts.roundLimit || CFG.ROUND_LIMIT,
      turnIndex: 0, current: 1, playedThisTurn: 0, attacksThisTurn: 0, attackLimit: 0,
      phase: 'play', winner: 0, endReason: '', scores: null, decorSeed: seed,
      cells: {}, pois: [], players: [null, null, null], blocked: {}, walls: {}, swamps: {}, summons: [], squads: [],
      paintBuf: [], paintedThisCard: null, events: [], log: [], stepUsed: false, castles: {},
    };
    for (let c = 0; c < s.cols; c++) for (let r = 0; r < hex.rowsInCol(c, s.rows); r++) if (hex.inDiamond(c, r, s.cols, s.rows, CFG.BOARD_TIP, CFG.BOARD_SIDE)) s.cells[K(c, r)] = { col: c, row: r, owner: 0, bonus: 0, poi: -1, paintedAt: -1 };
    for (const pid of [1, 2]) {
      const o = opts.players[pid], lo = o.loadout, lv = o.levels || {};
      const types = Object.keys(lo.types), hs = CFG.HERO_START[pid];
      const p = s.players[pid] = {
        id: pid, name: o.name || (pid === 1 ? 'Blue' : 'Red'), bot: !!o.bot, army: o.preset || null,
        deckIds: lo.hero.concat(lo.minion), types, comp: Object.assign({}, lo.types), baseComp: Object.assign({}, lo.types), // D-091: comp = base + posts
        levels: Object.assign({ hero: lv.hero || 1 }, ...types.map(t => ({ [t]: lv[t] || 1 }))),
        warband: { col: hs.col, row: hs.row, hp: 0, maxHp: 0, minions: 0, dead: false },
        retinue: {}, status: newStatus(), deck: [], hand: [], discard: [], inPlay: null, gained: 0, gainedLastRound: 0, coins: CFG.COINS_START, // D-097
      };
      for (const t of types) p.retinue[t] = { n: p.comp[t], wound: 0 };
      p.warband.maxHp = p.warband.hp = heroStat(p, 'hp');
      // D-093: the castle is a plateau of three hexes at the tip of the diamond — its hex and the two behind it (farther
      // from the middle of the board). Nobody enters it; the hexes round it are the start territory.
      const st = CFG.START[pid], Yc = (s.rows - 1) / 2, far = c => Math.abs(c.row + 0.5 * (c.col & 1) - Yc);
      const cells = [{ col: st.col, row: st.row }];
      for (let d = 0; d < 6; d++) { const n = hex.neighbor(st.col, st.row, d); if (exists(s, n) && far(n) > far(st)) cells.push({ col: n.col, row: n.row }); }
      // D-095: a fourth hex closes the plateau into a small rhombus — the tip straight out beyond the castle hex (just off
      // the rectangle of the grid: (5,16) at the bottom, (5,-1) at the top)
      const tip = hex.neighbor(st.col, st.row, far({ col: st.col, row: st.row + 1 }) > far(st) ? 3 : 0);
      if (!exists(s, tip)) s.cells[K(tip.col, tip.row)] = { col: tip.col, row: tip.row, owner: 0, bonus: 0, poi: -1, paintedAt: -1 };
      cells.push({ col: tip.col, row: tip.row });
      for (const c of cells) { const cell = cellAt(s, c); cell.castle = pid; cell.owner = pid; }
      s.castles[pid] = { col: st.col, row: st.row, cells, tip: { col: tip.col, row: tip.row } };
      for (const c of cells) for (let d = 0; d < 6; d++) { const n = hex.neighbor(c.col, c.row, d); if (exists(s, n) && !cellAt(s, n).castle) cellAt(s, n).owner = pid; }
    }
    // upgrade points: four recruiting posts (D-091: whoever takes one raises that type's army size) and the Citadel
    const addPoint = (c, kind) => { const q = { id: s.pois.length, col: c.col, row: c.row, kind, owner: 0, boost: null }; s.pois.push(q); s.cells[K(c.col, c.row)].poi = q.id; };
    for (const side of ['left', 'right']) for (const c of CFG.POINTS[side]) addPoint(c, 'post');
    addPoint(CFG.POINTS.citadel, 'citadel');
    for (const c of CFG.POINTS.mines || []) addPoint(c, 'mine'); // D-097: gold mines
    for (const pid of [1, 2]) {
      const p = s.players[pid];
      p.deck = shuffle(s, p.deckIds.map(id => makeCard(s, id)));
      draw(s, p, CFG.HAND_SIZE);
    }
    syncMinions(s);
    s.paintBuf = []; s.events = [];
    log(s, `Match started. Seed ${seed}, ${s.roundLimit} rounds.`);
    s.events.push({ type: 'turn', player: 1, round: 1 });
    s.players[2].coins += CFG.COINS_SECOND; // D-097: the second player's purse makes up for moving second
    collectIncome(s, s.players[1]); // D-097: the first player's first turn
    return s;
  }

  // ---------------------------------------------------------------- coins (D-097)
  // Income at the start of each own turn: a base, +1 for every territory step reached (5, 8, 13, 21, 34, 55, 89 — the
  // steps grow like Fibonacci, so each next +1 takes more land) and +1 for every gold mine held.
  const cardCost = def => def.cost || 0;
  const incomeSteps = (s, pid) => { const t = territory(s, pid); return CFG.INCOME_STEPS.filter(x => t >= x).length; };
  const minesHeld = (s, pid) => s.pois.filter(q => q.kind === 'mine' && q.owner === pid).length;
  function incomeOf(s, pid) { return CFG.INCOME_BASE + incomeSteps(s, pid) + CFG.MINE_INCOME * minesHeld(s, pid); }
  // how many more hexes of territory until the next +1 (null when every step is reached)
  function nextIncomeStep(s, pid) { const t = territory(s, pid), n = CFG.INCOME_STEPS.find(x => x > t); return n == null ? null : n - t; }
  function collectIncome(s, p) {
    const amount = incomeOf(s, p.id);
    p.coins += amount;
    s.events.push({ type: 'income', player: p.id, amount, coins: p.coins });
  }
  const burnValue = def => Math.round(cardCost(def) * CFG.BURN_SHARE);
  // the burn slot: the card goes to the discard for 35 % of its cost; it counts as the turn's card
  function burnCard(s, uid) {
    if (s.phase !== 'play') return false;
    const p = s.players[s.current], idx = p.hand.findIndex(c => c.uid === uid);
    if (idx < 0) return false;
    const card = p.hand.splice(idx, 1)[0], def = CARDS[card.def], gain = burnValue(def);
    p.discard.push(card); p.coins += gain; s.playedThisTurn++;
    s.events.push({ type: 'burn', player: p.id, def: card.def, gain, coins: p.coins });
    log(s, `${p.name} burn ${def.title}: +${gain} coins.`);
    return true;
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

  // ---------------------------------------------------------------- territory
  function paint(s, p, c, via) {
    const cell = cellAt(s, c);
    if (!cell || cell.castle) return false; // castles are bases: never painted (D-084)
    if (via !== 'walk' && heroAtCell(s, c) && heroAtCell(s, c) !== p.id) return false; // D-017: the hex under the enemy Overlord
    if (cell.owner === p.id) return false;
    if (isFortifiedAgainst(s, cell, p.id)) return false;
    const from = cell.owner;
    cell.owner = p.id; cell.bonus = 0; cell.paintedAt = s.turnIndex;
    p.gained++;
    s.paintBuf.push({ col: cell.col, row: cell.row, via, from });
    if (s.paintedThisCard) s.paintedThisCard.push(K(cell.col, cell.row));
    if (cell.poi >= 0) capturePoint(s, p, cell.poi);
    return true;
  }
  function flushPaint(s, p) {
    if (!s.paintBuf.length) return;
    const walked = s.paintBuf.filter(c => c.via !== 'fill'), filled = s.paintBuf.filter(c => c.via === 'fill');
    if (walked.length) s.events.push({ type: 'paint', player: p.id, cells: walked });
    if (filled.length) s.events.push({ type: 'fill', player: p.id, cells: filled, count: filled.length });
    s.paintBuf = [];
  }
  // D-096: the map edge closes a contour again (as in D-049…D-056, before D-073): every area of hexes that are not the
  // player's, cut off by his hexes (walls count) and the edge of the board, is filled — except the open field, i.e. the
  // area the enemy Overlord stands in and the area round the enemy castle
  function enclosure(s, p) {
    if (s.phase !== 'play') return 0;
    const own = k => s.cells[k].owner === p.id;
    const e = enemyOf(s, p.id), ew = e.warband;
    const seen = new Set();
    let filled = 0;
    for (const k0 in s.cells) {
      if (own(k0) || seen.has(k0)) continue;
      const comp = [], queue = [s.cells[k0]];
      let hasEnemy = false;
      seen.add(k0);
      while (queue.length) {
        const c = queue.shift();
        comp.push(c);
        if (c.castle === e.id) hasEnemy = true;
        if (!ew.dead && c.col === ew.col && c.row === ew.row) hasEnemy = true;
        for (let d = 0; d < 6; d++) {
          const n = hex.neighbor(c.col, c.row, d), nk = K(n.col, n.row);
          if (!exists(s, n) || seen.has(nk) || own(nk) || walled(s, c, n)) continue;
          seen.add(nk); queue.push(s.cells[nk]);
        }
      }
      if (hasEnemy) continue;
      for (const c of comp) if (paint(s, p, c, 'fill')) filled++;
    }
    if (filled) log(s, `${p.name}: enclosure closed, +${filled} hexes.`);
    return filled;
  }
  function capturePoint(s, p, id) {
    const q = s.pois[id];
    if (q.owner === p.id) return;
    const prev = q.owner;
    q.owner = p.id;
    const def = PK[q.kind];
    if (q.kind === 'post') { q.boost = painterType(s, p); recomputeComp(s); } // D-091: the taker's type grows; the loser's shrinks back
    const add = q.boost ? p.comp[q.boost] - p.baseComp[q.boost] : 0;
    s.events.push({ type: 'poi', player: p.id, poiId: id, kind: q.kind, title: def.title, from: prev, col: q.col, row: q.row, boost: q.kind === 'post' ? q.boost : null });
    log(s, `${p.name} take the ${def.title}${q.kind === 'post' && q.boost ? ` — ${TYPES[q.boost].title.toLowerCase()} army ${p.baseComp[q.boost]} → ${p.comp[q.boost]} (+${add})` : ''}.`);
    if (q.kind === 'citadel') heal(s, p, 0, CFG.CITADEL_HEAL, 'Citadel');
  }
  // D-091: which of the player's types took a hex — the group that is painting (s.painter, set by whoever moves), or, for
  // the Overlord, the largest type with him
  function painterType(s, p) {
    const pt = s.painter;
    if (pt && pt.pid === p.id && pt.type) return pt.type;
    let best = null, bn = 0;
    for (const t of p.types) if (p.retinue[t].n > bn) { bn = p.retinue[t].n; best = t; }
    return best;
  }
  const territory = (s, pid) => { let t = 0; for (const k in s.cells) { const c = s.cells[k]; if (c.owner === pid) t += 1 + c.bonus; } return t; };
  const cellCount = (s, pid) => { let t = 0; for (const k in s.cells) if (s.cells[k].owner === pid) t++; return t; };
  const poiCount = (s, pid) => s.pois.filter(p => p.owner === pid).length;
  const totalCells = s => Object.keys(s.cells).length;

  // D-085: the road — the player's own hexes connected to the castle
  function roadRegion(s, pid) {
    const c0 = s.castles[pid], k0 = K(c0.col, c0.row), set = new Set([k0]), parent = {}, queue = [c0];
    while (queue.length) {
      const c = queue.shift();
      for (let d = 0; d < 6; d++) {
        const n = hex.neighbor(c.col, c.row, d), nk = K(n.col, n.row);
        if (!exists(s, n) || set.has(nk) || s.cells[nk].owner !== pid || walled(s, c, n)) continue;
        set.add(nk); parent[nk] = K(c.col, c.row); queue.push(n);
      }
    }
    return { set, parent, k0 };
  }
  function roadPath(reg, target) {
    const out = []; let k = K(target.col, target.row);
    while (k && k !== reg.k0) { const [c, r] = k.split(',').map(Number); out.unshift({ col: c, row: r }); k = reg.parent[k]; }
    return out;
  }

  // ---------------------------------------------------------------- combat: direct numbers (D-085)
  // power = what a group deals in a fight: minions × Attack (+ card bonus, + War Cry); an Overlord adds his own Attack
  function power(s, g, vs) {
    const p = s.players[g.pid], wc = warCry(s, p);
    if (g.kind === 'squad') {
      const q = g.sq; let v = q.n * (typeStat(s, g.pid, q.type, 'atk') + (q.n ? q.bonus + wc : 0));
      if (TYPES[q.type].trait === 'breach' && vs && vs.kind === 'squad' && vs.sq.state === 'wait') v *= 2; // Breach
      return v;
    }
    let v = heroStat(p, 'atk');
    for (const t of p.types) { const r = p.retinue[t]; if (r.n) v += r.n * (typeStat(s, g.pid, t, 'atk') + wc); }
    return v;
  }
  function hitGroup(grp, hp, dmg) { // removes minions by their HP; the remainder wounds the next one
    const cap = grp.n * hp - grp.wound;
    if (dmg >= cap) { const killed = grp.n; grp.n = 0; grp.wound = 0; return { killed, left: dmg - cap }; }
    const total = grp.wound + dmg, killed = Math.floor(total / hp);
    grp.n -= killed; grp.wound = total - killed * hp;
    return { killed, left: 0 };
  }
  // damage to a group; an Overlord's retinue takes it first, highest shield first (brutes, brawlers, healers, the rest)
  function damage(s, g, dmg) {
    const out = { losses: {}, heroDmg: 0 };
    if (dmg <= 0) return out;
    if (g.kind === 'squad') { const r = hitGroup(g.sq, typeStat(s, g.pid, g.sq.type, 'hp'), dmg); out.losses[g.sq.type] = r.killed; return out; }
    const p = s.players[g.pid];
    let left = dmg;
    const order = p.types.slice().sort((a, b) => TYPES[b].shield - TYPES[a].shield);
    for (const t of order) {
      if (left <= 0) break;
      const r = p.retinue[t]; if (!r.n) continue;
      const h = hitGroup(r, typeStat(s, g.pid, t, 'hp'), left);
      if (h.killed) out.losses[t] = h.killed;
      left = h.left;
    }
    if (left > 0) { const w = p.warband, before = w.hp; w.hp = Math.max(0, w.hp - left); out.heroDmg = before - w.hp; }
    return out;
  }
  const snapshot = (s, g) => {
    if (g.kind === 'squad') return { kind: 'squad', pid: g.pid, id: g.sq.id, sqType: g.sq.type, n: g.sq.n };
    const p = s.players[g.pid], ret = {};
    for (const t of p.types) ret[t] = p.retinue[t].n;
    return { kind: 'hero', pid: g.pid, hp: p.warband.hp, n: p.types.reduce((a, t) => a + ret[t], 0), ret };
  };
  function cleanup(s) {
    s.squads = s.squads.filter(q => q.n > 0);
    for (const pid of [1, 2]) {
      const w = s.players[pid].warband;
      if (!w.dead && w.hp <= 0) {
        w.dead = true;
        s.events.push({ type: 'heroDown', player: pid, col: w.col, row: w.row });
        log(s, `${s.players[pid].name}'s Overlord has fallen!`);
        if (s.phase === 'play') endGame(s, 3 - pid, 'hero');
      }
    }
    syncMinions(s);
  }
  // mutual fight: both groups strike at once
  function fight(s, A, D) {
    const pa = power(s, A, D), pd = power(s, D, A), before = { a: snapshot(s, A), d: snapshot(s, D) };
    const at = groupPos(s, D), from = groupPos(s, A);
    const lA = damage(s, A, pd), lD = damage(s, D, pa);
    const after = { a: snapshot(s, A), d: snapshot(s, D) };
    s.attacksThisTurn++;
    const ev = { type: 'fight', attacker: A.pid, defender: D.pid, from, at, dmgToDef: pa, dmgToAtt: pd, a: { before: before.a, after: after.a, losses: lA.losses, heroDmg: lA.heroDmg }, d: { before: before.d, after: after.d, losses: lD.losses, heroDmg: lD.heroDmg } };
    s.events.push(ev);
    const who = x => x.kind === 'hero' ? `${s.players[x.pid].name}'s Overlord` : `${s.players[x.pid].name}'s ${TYPES[x.sqType].title.toLowerCase()}`;
    log(s, `Fight: ${who(before.a)} (${pa}) vs ${who(before.d)} (${pd}).`);
    const dGone = D.kind === 'squad' ? D.sq.n <= 0 : false, aGone = A.kind === 'squad' ? A.sq.n <= 0 : false;
    cleanup(s);
    return { attackerGone: aGone, defenderGone: dGone, ev };
  }
  function shoot(s, A, D, dmg) {
    const before = snapshot(s, D), from = groupPos(s, A), at = groupPos(s, D);
    const l = damage(s, D, dmg);
    s.attacksThisTurn++;
    s.events.push({ type: 'shoot', attacker: A.pid, defender: D.pid, from, at, dmg, d: { before, after: snapshot(s, D), losses: l.losses, heroDmg: l.heroDmg } });
    log(s, `${s.players[A.pid].name}'s archers shoot: −${dmg}.`);
    cleanup(s);
  }
  function enemyGroupsNear(s, pid, pos, range) {
    const out = [], e = enemyOf(s, pid);
    if (!e.warband.dead) { const d = hex.distance(pos, e.warband); if (d <= range) out.push({ g: { kind: 'hero', pid: e.id }, d }); }
    for (const q of s.squads) if (q.owner !== pid) { const d = hex.distance(pos, q); if (d <= range) out.push({ g: { kind: 'squad', pid: q.owner, sq: q }, d }); }
    out.sort((a, b) => a.d - b.d || (a.g.kind === 'hero' ? -1 : 1));
    return out;
  }
  function heal(s, p, healers, heroHp, why) {
    const w = p.warband; let wounds = 0;
    if (healers) for (const t of p.types) { if (p.retinue[t].wound) { wounds += p.retinue[t].wound; p.retinue[t].wound = 0; } }
    const before = w.hp; w.hp = Math.min(w.maxHp, w.hp + heroHp);
    if (wounds || w.hp > before) {
      s.events.push({ type: 'heal', player: p.id, col: w.col, row: w.row, hero: w.hp - before, wounds, hp: w.hp });
      log(s, `${p.name}: ${why} — Overlord +${w.hp - before} HP${wounds ? ', wounds healed' : ''}.`);
    }
  }

  // ---------------------------------------------------------------- the Overlord moves
  function heroPath(s, p, dirs) {
    let cur = { col: p.warband.col, row: p.warband.row }; const path = [];
    for (const d of dirs) {
      const n = hex.neighbor(cur.col, cur.row, d);
      if (!exists(s, n) || walled(s, cur, n) || castleAt(s, n) || isBlocked(s, n)) break;
      const g = groupAt(s, n);
      if (g && g.pid !== p.id) { path.push({ col: n.col, row: n.row, attack: true }); break; }
      path.push({ col: n.col, row: n.row }); cur = n;
      if (isSwamp(s, n)) break;
    }
    return path;
  }
  function moveHero(s, p, dirs) {
    s.painter = { pid: p.id, type: null }; // D-091: the Overlord paints
    const w = p.warband, path = [];
    for (const d of dirs) {
      const n = hex.neighbor(w.col, w.row, d);
      if (!exists(s, n) || walled(s, w, n) || castleAt(s, n) || isBlocked(s, n)) break;
      const g = groupAt(s, n);
      if (g && g.pid !== p.id) {
        if (path.length) s.events.push({ type: 'move', player: p.id, path: path.slice() });
        flushPaint(s, p);
        const res = fight(s, { kind: 'hero', pid: p.id }, g);
        // D-088: a group wiped out — the Overlord takes its hex; otherwise he falls back to the hex he struck from
        if (s.phase === 'play' && !w.dead && res.defenderGone && !groupAt(s, n)) {
          res.ev.enter = true;
          w.col = n.col; w.row = n.row;
          paint(s, p, n, 'walk');
        }
        return;
      }
      w.col = n.col; w.row = n.row; path.push({ col: n.col, row: n.row });
      paint(s, p, n, 'walk');
      for (const q of squadsAt(s, n).filter(x => x.owner === p.id && x.state !== 'out')) join(s, q, 'met'); // walking onto his own group gathers it
      // D-090: an enemy ambush shoots him on the way
      if (ambushAt(s, p.id, n, () => ({ kind: 'hero', pid: p.id }), () => { if (path.length) s.events.push({ type: 'move', player: p.id, path: path.splice(0) }); flushPaint(s, p); }) && (s.phase !== 'play' || w.dead)) return;
      if (isSwamp(s, n)) break;
    }
    if (path.length) s.events.push({ type: 'move', player: p.id, path });
  }
  function stepOptions(s) {
    if (s.phase !== 'play' || s.stepUsed) return [];
    const p = s.players[s.current], out = [];
    if (p.warband.dead) return out;
    for (let d = 0; d < 6; d++) {
      const path = heroPath(s, p, [d]);
      if (path.length) out.push({ key: 's' + d, dir: d, path, end: path[0], label: HB.cards.DIR_LABEL[d] });
    }
    return out;
  }
  function freeStep(s, dir) {
    const opt = stepOptions(s).find(o => o.dir === dir);
    if (!opt) return false;
    const p = s.players[s.current];
    s.stepUsed = true;
    s.events.push({ type: 'step', player: p.id });
    log(s, `${p.name}'s Overlord steps ${opt.label}.`);
    moveHero(s, p, [dir]);
    enclosure(s, p); flushPaint(s, p);
    joinWaiting(s, p); // D-089
    return true;
  }

  // ---------------------------------------------------------------- sorties (D-085)
  function squadPath(s, p, t, dirs) {
    const breach = TYPES[t].trait === 'breach';
    let cur = { col: p.warband.col, row: p.warband.row }; const path = [];
    for (const d of dirs) {
      const n = hex.neighbor(cur.col, cur.row, d);
      if (!exists(s, n) || (walled(s, cur, n) && !breach) || castleAt(s, n) || isBlocked(s, n)) break;
      const g = groupAt(s, n);
      if (g && g.pid !== p.id) { path.push({ col: n.col, row: n.row, attack: true }); break; }
      path.push({ col: n.col, row: n.row }); cur = n;
      if (isSwamp(s, n)) break;
    }
    return path;
  }
  function launchSortie(s, p, def, dirs, bend) {
    const t = def.owner, r = p.retinue[t], w = p.warband;
    const sq = { id: s.nextSquadId++, owner: p.id, type: t, n: r.n, wound: r.wound, col: w.col, row: w.row, state: 'out', dirs: dirs.slice(), orig: dirs.slice(), walked: 0,
      bonus: def.atkBonus || 0, curl: !!def.curl, wide: !!def.wide, bend: bend || 1, start: { col: w.col, row: w.row }, shot: false, card: def.id,
      range: (!def.fx && def.range) || 0 }; // D-090: Volley shoots farther on the way
    r.n = 0; r.wound = 0;
    s.squads.push(sq);
    s.events.push({ type: 'sortie', player: p.id, id: sq.id, sqType: t, n: sq.n, col: w.col, row: w.row });
    log(s, `${p.name}: ${def.title} — ${sq.n} ${TYPES[t].title.toLowerCase()} set out.`);
    advanceSquad(s, sq, typeStat(s, p.id, t, 'speed'));
  }
  function advanceSquad(s, sq, steps) {
    const p = s.players[sq.owner], d0 = TYPES[sq.type], ranged = d0.range > 0, breach = d0.trait === 'breach';
    s.painter = { pid: sq.owner, type: sq.type }; // D-091: this group paints
    let path = [], moved = 0;
    const flush = () => { if (path.length) { s.events.push({ type: 'squadMove', player: sq.owner, id: sq.id, sqType: sq.type, path }); path = []; } };
    const me = () => ({ kind: 'squad', pid: sq.owner, sq });
    // one step of the route: the hex under the group; Capture 2 (runners): the hex beside it, always on the side the
    // pattern bends to — a 2-wide strip (D-087); Sweep: both sides
    const step = (n, d, walk) => {
      sq.col = n.col; sq.row = n.row; sq.dirs.shift(); moved++; sq.walked++;
      if (walk) path.push({ col: n.col, row: n.row }); // a hex taken in a fight is shown by the fight itself
      paint(s, p, n, 'walk');
      if (d0.capture >= 2) { const side = hex.neighbor(n.col, n.row, hex.turn(d, sq.bend || 1)); if (exists(s, side) && !groupAt(s, side)) paint(s, p, side, 'split'); }
      if (sq.wide) for (const tt of [2, -2]) { const side = hex.neighbor(n.col, n.row, hex.turn(d, tt)); if (exists(s, side) && !groupAt(s, side)) paint(s, p, side, 'split'); }
    };
    const shootNow = () => {
      const near = enemyGroupsNear(s, sq.owner, sq, sq.range || d0.range);
      if (!near.length) return false;
      flush(); flushPaint(s, p);
      shoot(s, me(), near[0].g, sq.n * (typeStat(s, sq.owner, sq.type, 'atk') + sq.bonus + warCry(s, p)));
      sq.shot = true;
      return true;
    };
    let guard = 0;
    while (moved < steps && sq.dirs.length && s.phase === 'play' && guard++ < 12) {
      if (ranged && !sq.shot && shootNow()) { if (s.phase !== 'play') return; }
      const d = sq.dirs[0], n = hex.neighbor(sq.col, sq.row, d);
      if (!exists(s, n) || castleAt(s, n) || isBlocked(s, n) || (walled(s, sq, n) && !breach)) { sq.dirs = []; break; }
      const g = groupAt(s, n);
      if (g && g.pid !== sq.owner) {
        flush(); flushPaint(s, p);
        if (ranged) { if (!sq.shot) shootNow(); sq.dirs = []; break; }
        const res = fight(s, me(), g);
        if (s.phase !== 'play' || !s.squads.includes(sq)) return;
        // D-088: the enemy group wiped out — the squad takes its hex (a step of its route); otherwise it falls back to the
        // hex it struck from and the sortie ends. Steady: after taking the hex it keeps going
        if (res.defenderGone && !groupAt(s, n)) {
          res.ev.enter = true;
          step(n, d, false);
          if (d0.trait === 'steady' && !isSwamp(s, n)) continue;
        }
        sq.dirs = []; break;
      }
      step(n, d, true);
      // D-090: walking past an enemy ambush draws its arrows
      if (ambushAt(s, sq.owner, n, me, () => { flush(); flushPaint(s, p); }) && (s.phase !== 'play' || !s.squads.includes(sq))) return;
      if (isSwamp(s, n)) { sq.dirs = []; break; }
    }
    flush();
    if (sq.state === 'out' && !sq.dirs.length) {
      if (sq.curl && sq.walked === sq.orig.length) { const c = hex.neighbor(sq.start.col, sq.start.row, sq.orig[1]); if (exists(s, c) && !groupAt(s, c)) paint(s, p, c, 'split'); }
      if (ranged && !sq.shot && s.phase === 'play') shootNow();
      if (s.phase === 'play' && s.squads.includes(sq)) { flushPaint(s, p); sortieEnd(s, sq); }
      if (s.squads.includes(sq) && sq.state === 'out') sq.state = 'return';
    }
    if (s.phase !== 'play') return;
    enclosure(s, p); flushPaint(s, p);
    if (s.squads.includes(sq) && sq.state === 'return' && !p.warband.dead && hex.distance(sq, p.warband) === 0) join(s, sq, 'back');
  }
  // D-090: what a sortie does where its route ends (the card's `fx`); the direction is that of its last step
  function sortieEnd(s, sq) {
    const p = s.players[sq.owner], def = CARDS[sq.card]; if (!def || !def.fx) return;
    const dir = sq.orig[Math.max(0, Math.min(sq.orig.length, sq.walked) - 1)], T = s.turnIndex, e = enemyOf(s, p.id), name = TYPES[sq.type].title.toLowerCase();
    switch (def.fx) {
      case 'hold': // Ambush: they stay until the owner's next turn and shoot the first enemy group that comes within range
        sq.state = 'hold'; sq.holdUntil = T + 2; sq.holdRange = def.range; sq.firedAt = -1;
        s.events.push({ type: 'hold', player: p.id, id: sq.id, sqType: sq.type, col: sq.col, row: sq.row, range: def.range });
        log(s, `${p.name}: the ${name} lie in wait — anyone within ${def.range} hexes will be shot.`);
        break;
      case 'scorch': { // Fire Arrows: the line of hexes beyond them
        const line = [], burnt = []; let c = sq;
        for (let i = 0; i < def.range; i++) { c = hex.neighbor(c.col, c.row, dir); if (!exists(s, c)) break; line.push({ col: c.col, row: c.row }); }
        for (const q of line) {
          const cell = cellAt(s, q);
          if (!cell || cell.castle || heroAtCell(s, q) || cell.poi >= 0 || cell.owner !== e.id || isFortifiedAgainst(s, cell, p.id)) continue;
          burnt.push({ col: cell.col, row: cell.row, from: cell.owner }); cell.owner = 0; cell.bonus = 0;
        }
        s.events.push({ type: 'scorch', player: p.id, cells: burnt, line, col: sq.col, row: sq.row });
        log(s, `${p.name}: ${def.title} — ${burnt.length} enemy hexes burnt.`);
        break;
      }
      case 'palisade': { // Earthworks: walls along the three far edges of their hex
        const edges = [];
        for (const t of [-1, 0, 1]) {
          const n = hex.neighbor(sq.col, sq.row, hex.turn(dir, t)); if (!exists(s, n)) continue;
          const a = { col: sq.col, row: sq.row }, b = { col: n.col, row: n.row };
          s.walls[edgeKey(a, b)] = { owner: p.id, until: T + 2 * def.rounds, a, b }; edges.push({ a, b });
        }
        s.events.push({ type: 'walls', player: p.id, edges });
        log(s, `${p.name}: ${def.title} — ${edges.length} walls.`);
        break;
      }
      case 'bless': { // Blessing: the Overlord and your groups within the radius
        const w = p.warband;
        for (const q of s.squads) if (q.owner === p.id && hex.distance(q, sq) <= def.radius) q.wound = 0;
        if (!w.dead && hex.distance(w, sq) <= def.radius) heal(s, p, 1, sq.n, 'Blessing');
        break;
      }
      case 'call': muster(s, p, 2); break; // Call to Arms
    }
  }
  // D-090: archers lying in wait shoot the first enemy group that comes within their range — once per turn. The mover is
  // `moverPid`'s group at `pos` (target() gives it for the fight rules); before() flushes the movement shown so far.
  // Returns true when someone shot.
  function ambushAt(s, moverPid, pos, target, before) {
    let hit = false;
    for (const q of s.squads.slice()) {
      if (s.phase !== 'play' || q.owner === moverPid || q.state !== 'hold' || q.firedAt === s.turnIndex || !s.squads.includes(q)) continue;
      if (hex.distance(q, pos) > (q.holdRange || 3)) continue;
      const D = target(); if (D.kind === 'squad' && !s.squads.includes(D.sq)) break;
      if (before && !hit) before();
      q.firedAt = s.turnIndex; hit = true;
      shoot(s, { kind: 'squad', pid: q.owner, sq: q }, D, q.n * typeStat(s, q.owner, q.type, 'atk'));
      const ev = s.events.filter(x => x.type === 'shoot').pop(); if (ev) ev.ambush = true;
    }
    return hit;
  }
  // D-092: the way home of a returning group — over the player's own hexes wherever it can (a detour of a few steps is
  // worth it: a step on own land costs 1, on any other 5), across other land only where it must. Returning groups (but
  // runners) do not paint, so this keeps them on their own ground instead of cutting across neutral land.
  function returnPath(s, sq) {
    const w = s.players[sq.owner].warband, pid = sq.owner, breach = TYPES[sq.type].trait === 'breach';
    const fk = K(sq.col, sq.row), tk = K(w.col, w.row);
    if (fk === tk) return [];
    const dist = { [fk]: 0 }, parent = { [fk]: null }, open = [{ k: fk, c: { col: sq.col, row: sq.row }, d: 0 }], done = new Set();
    while (open.length) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (open[i].d < open[bi].d) bi = i;
      const { k, c, d } = open.splice(bi, 1)[0];
      if (done.has(k)) continue; done.add(k);
      if (k === tk) { const out = []; let x = k; while (x !== fk) { const [cc, rr] = x.split(',').map(Number); out.unshift({ col: cc, row: rr }); x = parent[x]; } return out; }
      for (let dd = 0; dd < 6; dd++) {
        const n = hex.neighbor(c.col, c.row, dd), nk = K(n.col, n.row);
        if (!exists(s, n) || done.has(nk) || castleAt(s, n) || isBlocked(s, n) || (walled(s, c, n) && !breach)) continue;
        const g = groupAt(s, n); if (g && g.pid !== pid) continue;
        const nd = d + (nk === tk || cellAt(s, n).owner === pid ? 1 : 5);
        if (dist[nk] == null || nd < dist[nk]) { dist[nk] = nd; parent[nk] = k; open.push({ k: nk, c: n, d: nd }); }
      }
    }
    return null;
  }
  function returnSquad(s, sq) {
    const p = s.players[sq.owner], w = p.warband;
    s.painter = { pid: sq.owner, type: sq.type };
    if (w.dead) return;
    if (hex.distance(sq, w) <= 1) { join(s, sq, 'back'); return; }
    const path = returnPath(s, sq); // D-092: home over own land where it can
    if (!path) return;
    const steps = Math.min(typeStat(s, sq.owner, sq.type, 'ret'), path.length);
    const walked = path.slice(0, steps);
    let seg = [];
    const flushSeg = () => { if (seg.length) s.events.push({ type: 'squadMove', player: sq.owner, id: sq.id, sqType: sq.type, path: seg, back: true }); seg = []; };
    for (const c of walked) {
      sq.col = c.col; sq.row = c.row; seg.push(c);
      if (TYPES[sq.type].trait === 'paint_back') paint(s, p, c, 'walk');
      // D-090: coming back past an enemy ambush
      if (ambushAt(s, sq.owner, c, () => ({ kind: 'squad', pid: sq.owner, sq }), () => { flushSeg(); flushPaint(s, p); }) && (s.phase !== 'play' || !s.squads.includes(sq))) return;
    }
    flushSeg();
    if (hex.distance(sq, w) <= 1) join(s, sq, 'back');
  }
  function join(s, sq, how) {
    const p = s.players[sq.owner], r = p.retinue[sq.type];
    r.n += sq.n; r.wound = Math.max(r.wound, sq.wound);
    s.squads = s.squads.filter(q => q !== sq);
    s.events.push({ type: 'join', player: sq.owner, id: sq.id, sqType: sq.type, n: sq.n, col: sq.col, row: sq.row, how });
    syncMinions(s);
  }
  // the pits (D-085): each type below its army size sends out `out` minions (or `only`), to the Overlord by road or to wait
  function muster(s, p, only) {
    const w = p.warband; if (w.dead) return;
    const reg = roadRegion(s, p.id), road = reg.set.has(K(w.col, w.row)) || [...reg.set].some(k => { const [c, r] = k.split(',').map(Number); return hex.distance({ col: c, row: r }, w) <= 1; });
    for (const t of p.types) {
      const need = p.comp[t] - armyOnField(s, p.id, t); if (need <= 0) continue;
      const k = Math.min(need, only != null ? only : typeStat(s, p.id, t, 'out')); if (k <= 0) continue;
      const castle = s.castles[p.id];
      if (road) {
        p.retinue[t].n += k;
        // the road to the Overlord: through the region to the hex closest to him
        let best = null, bd = Infinity;
        for (const kk of reg.set) { const [c, r] = kk.split(',').map(Number), d = hex.distance({ col: c, row: r }, w); if (d < bd) { bd = d; best = { col: c, row: r }; } }
        const route = roadPath(reg, best); if (bd === 1 || !route.length || route[route.length - 1].col !== w.col || route[route.length - 1].row !== w.row) route.push({ col: w.col, row: w.row });
        s.events.push({ type: 'muster', player: p.id, sqType: t, n: k, road: route, join: true, from: castle });
        log(s, `${p.name}: +${k} ${TYPES[t].title.toLowerCase()} from the pit run to the Overlord.`);
      } else {
        let best = null, bd = Infinity, bc = Infinity;
        for (const kk of reg.set) {
          if ((kk === reg.k0 || s.cells[kk].castle) && reg.set.size > 1) continue; // never on the castle plateau (D-093)
          const [c, r] = kk.split(',').map(Number), cell = { col: c, row: r }, g = groupAt(s, cell);
          if (g && g.pid !== p.id) continue;
          const d = hex.distance(cell, w), dc = hex.distance(cell, castle);
          if (d < bd || (d === bd && dc < bc)) { bd = d; bc = dc; best = cell; }
        }
        if (!best) continue;
        let sq = s.squads.find(q => q.owner === p.id && q.type === t && q.state === 'wait' && q.col === best.col && q.row === best.row);
        if (sq) sq.n += k;
        else { sq = { id: s.nextSquadId++, owner: p.id, type: t, n: k, wound: 0, col: best.col, row: best.row, state: 'wait', dirs: [], orig: [], walked: 0, bonus: 0, start: { col: castle.col, row: castle.row }, shot: false }; s.squads.push(sq); }
        s.events.push({ type: 'muster', player: p.id, sqType: t, n: k, road: roadPath(reg, best), join: false, to: best, id: sq.id, from: castle });
        log(s, `${p.name}: +${k} ${TYPES[t].title.toLowerCase()} from the pit wait — no road to the Overlord.`);
      }
    }
    syncMinions(s);
  }
  // D-089: a waiting group joins the Overlord as soon as its patch of land touches his — whether or not the road to the
  // castle is back. landLink: the way over the player's own hexes (no castles, no enemy groups) from the group to the
  // Overlord's hex, or null when the lands are apart
  function landLink(s, pid, from, w) {
    const fk = K(from.col, from.row), parent = { [fk]: null }, queue = [{ col: from.col, row: from.row }];
    while (queue.length) {
      const c = queue.shift(), ck = K(c.col, c.row);
      if (hex.distance(c, w) <= 1) {
        const out = []; let k = ck;
        while (k !== fk) { const [cc, rr] = k.split(',').map(Number); out.unshift({ col: cc, row: rr }); k = parent[k]; }
        if (ck !== K(w.col, w.row)) out.push({ col: w.col, row: w.row });
        return out;
      }
      for (let d = 0; d < 6; d++) {
        const n = hex.neighbor(c.col, c.row, d), nk = K(n.col, n.row);
        if (nk in parent || !exists(s, n)) continue;
        const cell = cellAt(s, n);
        if (!cell || cell.owner !== pid || cell.castle || walled(s, c, n)) continue;
        const g = groupAt(s, n); if (g && g.pid !== pid) continue;
        parent[nk] = ck; queue.push(n);
      }
    }
    return null;
  }
  function waitCheck(s, sq) {
    const p = s.players[sq.owner], w = p.warband; if (w.dead || s.phase !== 'play') return false;
    if (hex.distance(sq, w) <= 1) { join(s, sq, 'met'); return true; }
    const path = landLink(s, p.id, sq, w);
    if (!path) return false;
    s.events.push({ type: 'squadMove', player: sq.owner, id: sq.id, sqType: sq.type, path, back: true });
    const last = path[path.length - 1]; sq.col = last.col; sq.row = last.row;
    log(s, `${p.name}: the waiting ${TYPES[sq.type].title.toLowerCase()} rejoin the Overlord — their land touches his.`);
    join(s, sq, 'road');
    return true;
  }
  // after anything that changes the player's land or moves his Overlord: every waiting group that now can, rejoins
  function joinWaiting(s, p) {
    for (const sq of s.squads.filter(q => q.owner === p.id && q.state === 'wait')) if (s.squads.includes(sq)) waitCheck(s, sq);
  }

  // ---------------------------------------------------------------- card play
  // Returns { ok, options? }. options: array of { key, label, ... } — one of them is passed back as `choice`.
  function rotations(def, from, fn) {
    const opts = [], seen = new Set();
    for (let d = 0; d < 6; d++) for (const m of def.mirror ? [1, -1] : [1]) {
      const dirs = def.pattern.map(o => ((d + m * o) % 6 + 6) % 6), key = dirs.join('');
      if (seen.has(key)) continue; seen.add(key);
      const path = fn(dirs);
      if (path.length) opts.push({ key: 'p' + key, dirs, path, bend: m, end: path[path.length - 1], label: HB.cards.DIR_LABEL[d] + (m < 0 ? ' (mirrored)' : '') });
    }
    return opts;
  }
  // D-087: the plan of a move for its preview — where the group stops at the end of each turn (a squad walks `speed`
  // hexes a turn; the Overlord walks the whole route now) and which hexes it will capture (route + Capture-2 strip,
  // Sweep sides, Envelop's closing hex), not counting hexes already the player's
  function planOf(s, def, opt) {
    const p = s.players[s.current], w = p.warband, out = { steps: [], capture: [] }, seen = new Set();
    const cap = c => {
      const k = K(c.col, c.row); if (seen.has(k)) return; seen.add(k);
      const cell = cellAt(s, c);
      if (!cell || cell.castle || cell.owner === p.id || isFortifiedAgainst(s, cell, p.id)) return;
      const g = groupAt(s, c); if (g && g.pid !== p.id) return;
      out.capture.push({ col: c.col, row: c.row });
    };
    const sortie = def.kind === 'sortie', d0 = sortie ? TYPES[def.owner] : null;
    const sp = sortie ? Math.max(1, typeStat(s, p.id, def.owner, 'speed')) : Infinity, n = opt.path.length;
    opt.path.forEach((c, i) => {
      out.steps.push({ col: c.col, row: c.row, attack: !!c.attack, turn: sortie ? Math.floor(i / sp) + 1 : 1, stop: i === n - 1 || (sortie && (i + 1) % sp === 0) });
      if (c.attack) return;
      cap(c);
      if (!sortie) return;
      const d = opt.dirs[i];
      if (d0.capture >= 2) { const side = hex.neighbor(c.col, c.row, hex.turn(d, opt.bend || 1)); if (exists(s, side)) cap(side); }
      if (def.wide) for (const tt of [2, -2]) { const side = hex.neighbor(c.col, c.row, hex.turn(d, tt)); if (exists(s, side)) cap(side); }
    });
    if (sortie && def.curl && n === def.pattern.length && !opt.path[n - 1].attack) { const c = hex.neighbor(w.col, w.row, opt.dirs[1]); if (exists(s, c)) cap(c); }
    // D-090: what the sortie does at the end of its route — the ambush / volley / blessing zone, the line of fire, the walls
    if (sortie) {
      const walk = opt.path.filter(c => !c.attack), end = walk.length ? walk[walk.length - 1] : { col: w.col, row: w.row };
      const dir = opt.dirs[Math.max(0, walk.length - 1)];
      if (def.fx === 'hold' || (!def.fx && def.range)) out.zone = { col: end.col, row: end.row, r: def.range, tone: 'shot' };
      if (def.fx === 'bless') out.zone = { col: end.col, row: end.row, r: def.radius, tone: 'heal' };
      if (def.fx === 'scorch') { out.burn = []; let c = end; for (let i = 0; i < def.range; i++) { c = hex.neighbor(c.col, c.row, dir); if (!exists(s, c)) break; out.burn.push({ col: c.col, row: c.row }); } }
      if (def.fx === 'palisade') { out.walls = []; for (const t of [-1, 0, 1]) { const m = hex.neighbor(end.col, end.row, hex.turn(dir, t)); if (exists(s, m)) out.walls.push({ a: { col: end.col, row: end.row }, b: m }); } }
    }
    return out;
  }
  // D-097: a card the player cannot pay for is not playable (why: 'coins')
  function getPlay(s, card) {
    const r = getPlayFree(s, card), cost = cardCost(CARDS[card.def]);
    if (r.ok && s.players[s.current].coins < cost) return { ok: false, why: 'coins', cost };
    return r;
  }
  function getPlayFree(s, card) {
    const p = s.players[s.current], def = CARDS[card.def], w = p.warband;
    if (w.dead || s.phase !== 'play') return { ok: false };
    const withType = t => p.retinue[t] && p.retinue[t].n > 0;
    switch (def.kind) {
      case 'hero_move': { const o = rotations(def, w, dirs => heroPath(s, p, dirs)); return { ok: o.length > 0, options: o }; }
      case 'sortie': {
        const t = def.owner;
        if (!withType(t)) return { ok: false, why: 'none' };
        if (sortieBlocked(s, p, t)) return { ok: false, why: 'out' };
        const o = rotations(def, w, dirs => squadPath(s, p, t, dirs));
        return { ok: o.length > 0, options: o };
      }
      case 'volley': {
        if (!withType('archer')) return { ok: false, why: 'none' };
        const o = enemyGroupsNear(s, p.id, w, def.range).map(x => { const c = groupPos(s, x.g); return { key: 'v' + K(c.col, c.row), cell: c, label: x.g.kind === 'hero' ? 'Overlord' : TYPES[x.g.sq.type].title }; });
        return { ok: o.length > 0, options: o };
      }
      case 'scorch': case 'palisade': {
        if (!withType(def.owner)) return { ok: false, why: 'none' };
        const opts = [];
        for (let d = 0; d < 6; d++) {
          const n = hex.neighbor(w.col, w.row, d);
          if (!exists(s, n)) continue;
          const o = { key: (def.kind === 'palisade' ? 'w' : 'r') + d, dir: d, cell: n, label: HB.cards.DIR_LABEL[d] };
          if (def.kind === 'scorch') { o.cells = []; let c = w; for (let i = 0; i < def.range; i++) { c = hex.neighbor(c.col, c.row, d); if (!exists(s, c)) break; o.cells.push(c); } }
          opts.push(o);
        }
        return { ok: opts.length > 0, options: opts };
      }
      case 'recall': return { ok: s.squads.some(q => q.owner === p.id) };
      case 'bless': return { ok: withType('healer') };
      case 'call': return { ok: p.types.some(t => p.comp[t] > armyOnField(s, p.id, t)) };
      default: return { ok: true };
    }
  }
  function resolve(s, p, def, choice) {
    const w = p.warband, T = s.turnIndex, e = enemyOf(s, p.id);
    switch (def.kind) {
      case 'hero_move': moveHero(s, p, choice.dirs); enclosure(s, p); break;
      case 'sortie': launchSortie(s, p, def, choice.dirs, choice.bend); break;
      case 'recall': {
        for (const q of s.squads.filter(x => x.owner === p.id)) join(s, q, 'recall');
        log(s, `${p.name}: Recall — every group is back with the Overlord.`); break;
      }
      case 'war_cry': p.status.warCryUntil = T + 1; s.events.push({ type: 'buff', player: p.id, kind: 'attack', value: def.bonus, col: w.col, row: w.row }); log(s, `${p.name}: War Cry, +1 Attack for every minion this turn.`); break;
      case 'fortify': {
        const cells = [];
        for (const k in s.cells) { const c = s.cells[k]; if (c.owner === p.id && !c.castle && hex.distance(c, w) <= (def.radius || 1)) { c.fortOwner = p.id; c.fortUntil = T + 2 * def.rounds; cells.push({ col: c.col, row: c.row }); } }
        s.events.push({ type: 'fortify', player: p.id, cells });
        log(s, `${p.name}: ${def.title} — ${cells.length} hexes fortified.`); break;
      }
      case 'volley': {
        const g = groupAt(s, choice.cell); if (!g || g.pid === p.id) break;
        const r = p.retinue.archer, dmg = r.n * (typeStat(s, p.id, 'archer', 'atk') + warCry(s, p));
        shoot(s, { kind: 'hero', pid: p.id }, g, dmg); break;
      }
      case 'scorch': {
        const burnt = [];
        for (const c of choice.cells) {
          const cell = cellAt(s, c);
          if (!cell || cell.castle || heroAtCell(s, c) || cell.poi >= 0 || cell.owner !== e.id || isFortifiedAgainst(s, cell, p.id)) continue;
          burnt.push({ col: cell.col, row: cell.row, from: cell.owner });
          cell.owner = 0; cell.bonus = 0;
        }
        s.events.push({ type: 'scorch', player: p.id, cells: burnt, line: choice.cells });
        log(s, `${p.name}: ${def.title} — ${burnt.length} enemy hexes burnt.`);
        enclosure(s, p); break;
      }
      case 'palisade': {
        const edges = [], front = choice.cell;
        for (const t of [-1, 0, 1]) {
          const n = hex.neighbor(front.col, front.row, hex.turn(choice.dir, t));
          if (!exists(s, n)) continue;
          const a = { col: front.col, row: front.row }, b = { col: n.col, row: n.row };
          s.walls[edgeKey(a, b)] = { owner: p.id, until: T + 2 * def.rounds, a, b };
          edges.push({ a, b });
        }
        s.events.push({ type: 'walls', player: p.id, edges });
        log(s, `${p.name}: ${def.title} — ${edges.length} walls ${choice.label}.`);
        enclosure(s, p); break;
      }
      case 'bless': heal(s, p, 1, p.retinue.healer ? p.retinue.healer.n : 0, 'Blessing'); break;
      case 'call': muster(s, p, 2); break;
    }
  }
  function validChoice(play, choice) {
    if (!play.options) return true;
    return !!choice && play.options.some(o => o.key === choice.key);
  }
  function playCard(s, uid, choice) {
    if (s.phase !== 'play') return false;
    const p = s.players[s.current];
    const idx = p.hand.findIndex(c => c.uid === uid);
    if (idx < 0) return false;
    const card = p.hand[idx], def = CARDS[card.def];
    const play = getPlay(s, card);
    if (!play.ok || !validChoice(play, choice)) return false;
    p.hand.splice(idx, 1); p.inPlay = card;
    p.coins -= cardCost(def); // D-097
    s.events.push({ type: 'play', player: p.id, card: def.title });
    log(s, `${p.name} play ${def.title}${choice && choice.label ? ' (' + choice.label + ')' : ''}.`);
    resolve(s, p, def, choice);
    flushPaint(s, p);
    if (s.phase === 'play') joinWaiting(s, p); // D-089: the land may have joined up
    if (p.inPlay) { p.discard.push(p.inPlay); p.inPlay = null; }
    s.playedThisTurn++;
    syncMinions(s);
    return true;
  }
  // D-022: a turn ends on demand, after at least one card was played
  function endTurn(s) {
    if (s.phase !== 'play' || s.playedThisTurn < 1) return false;
    finishTurn(s);
    return true;
  }
  // D-009: a pass discards one card so that a hand full of unplayable cards cannot lock the player
  // D-097: a pass burns a card (for its coins) and ends the turn
  function passTurn(s, uid) {
    if (s.phase !== 'play' || s.playedThisTurn > 0) return false;
    if (!burnCard(s, uid)) return false;
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
    s.playedThisTurn = 0; s.attacksThisTurn = 0; s.stepUsed = false;
    if (s.turnIndex % 2 === 0) for (const pid of [1, 2]) { const q = s.players[pid]; q.gainedLastRound = q.gained; q.gained = 0; }
    for (const k in s.walls) if (!active(s, s.walls[k].until)) delete s.walls[k];
    for (const k in s.swamps) if (!active(s, s.swamps[k])) delete s.swamps[k];
    const np = s.players[s.current];
    s.events.push({ type: 'turn', player: np.id, round: round(s), last: round(s) === s.roundLimit, roundStart: s.turnIndex % 2 === 0 });
    // the start of a turn: sorties go on, returning groups walk back, waiting groups look for a road, the pits send out
    // new minions, healers heal — then the hand is refilled
    for (const sq of s.squads.filter(q => q.owner === np.id)) {
      if (s.phase !== 'play') return;
      if (!s.squads.includes(sq)) continue;
      if (sq.state === 'out') advanceSquad(s, sq, typeStat(s, np.id, sq.type, 'speed'));
      else if (sq.state === 'return') returnSquad(s, sq);
      else if (sq.state === 'wait') waitCheck(s, sq);
      else if (sq.state === 'hold' && s.turnIndex >= sq.holdUntil) { sq.state = 'return'; returnSquad(s, sq); } // D-090: the ambush is over
    }
    if (s.phase !== 'play') return;
    enclosure(s, np); flushPaint(s, np);
    joinWaiting(s, np); // D-089
    muster(s, np);
    const healers = np.retinue.healer ? np.retinue.healer.n : 0;
    if (healers) heal(s, np, healers, Math.max(1, Math.floor(healers / 2)), 'Healers');
    collectIncome(s, np); // D-097
    draw(s, np, CFG.HAND_SIZE);
    syncMinions(s);
  }
  const round = s => Math.min(s.roundLimit, Math.floor(s.turnIndex / 2) + 1);

  function scoreboard(s) {
    const out = {};
    for (const pid of [1, 2]) out[pid] = { territory: territory(s, pid), cells: cellCount(s, pid), pois: poiCount(s, pid), minions: armyOnField(s, pid), hero: s.players[pid].warband.hp, gained: s.players[pid].gained };
    return out;
  }
  function territoryVictory(s) {
    const sc = scoreboard(s);
    const cmp = key => Math.sign(sc[1][key] - sc[2][key]);
    let w = cmp('territory'), reason = 'territory';
    if (!w) { w = cmp('pois'); reason = 'tiebreak:pois'; }
    if (!w) { w = cmp('hero'); reason = 'tiebreak:hero'; }
    if (!w) { w = cmp('minions'); reason = 'tiebreak:minions'; }
    if (!w) { endGame(s, 0, 'draw'); return; }
    endGame(s, w > 0 ? 1 : 2, reason);
  }
  function endGame(s, winner, reason) {
    if (s.phase === 'over') return;
    s.phase = 'over'; s.winner = winner; s.endReason = reason; s.scores = scoreboard(s);
    const name = winner ? s.players[winner].name : 'Draw';
    const why = { hero: 'the enemy Overlord has fallen', territory: 'more territory', 'tiebreak:pois': 'equal territory, more upgrade points',
      'tiebreak:hero': 'equal territory and points, a healthier Overlord', 'tiebreak:minions': 'all else equal, a bigger army', draw: 'a perfect tie' }[reason];
    log(s, winner ? `${name} win — ${why}.` : `Draw — ${why}.`);
    s.events.push({ type: 'gameover', winner, reason, scores: s.scores });
  }

  // ---------------------------------------------------------------- forecasts (always true: they play the move on a copy)
  function outcome(s, sim, me) {
    const e = 3 - me;
    return { myArmy: [armyOnField(s, me), armyOnField(sim, me)], enemyArmy: [armyOnField(s, e), armyOnField(sim, e)],
      myHero: [s.players[me].warband.hp, sim.players[me].warband.hp], enemyHero: [s.players[e].warband.hp, sim.players[e].warband.hp],
      won: sim.phase === 'over' && sim.winner === me, lost: sim.phase === 'over' && sim.winner === e,
      // D-096: the hexes this move would take by closing a contour — shown in the preview
      fill: sim.events.filter(x => x.type === 'fill' && x.player === me).reduce((a, x) => a.concat(x.cells.map(c => ({ col: c.col, row: c.row }))), []) };
  }
  function forecastPlay(s, uid, choice) { const sim = clone(s), me = s.current; if (!playCard(sim, uid, choice)) return null; return outcome(s, sim, me); }
  function forecastStep(s, dir) { const sim = clone(s), me = s.current; if (!freeStep(sim, dir)) return null; return outcome(s, sim, me); }
  // D-085: how much the enemy could hit this Overlord with next turn, against his shield (retinue HP) — for the warning
  function heroThreat(s, pid) {
    const p = s.players[pid], e = enemyOf(s, pid), w = p.warband;
    let threat = 0;
    if (w.dead) return { threat: 0, shield: 0, hp: 0 };
    if (!e.warband.dead && hex.distance(e.warband, w) <= 3) threat += power(s, { kind: 'hero', pid: e.id });
    for (const t of e.types) if (e.retinue[t].n && !sortieBlocked(s, e, t) && hex.distance(e.warband, w) <= 4) threat += e.retinue[t].n * typeStat(s, e.id, t, 'atk');
    for (const q of s.squads) if (q.owner === e.id && q.state !== 'return' && hex.distance(q, w) <= 3) threat += q.n * typeStat(s, e.id, q.type, 'atk');
    return { threat, shield: retinueHP(s, p), hp: w.hp };
  }

  function takeEvents(s) { const e = s.events; s.events = []; return e; }
  function clone(s) { const e = s.events, l = s.log; s.events = []; s.log = []; const c = JSON.parse(JSON.stringify(s)); s.events = e; s.log = l; return c; }

  HB.rules = { createGame, playCard, endTurn, passTurn, burnCard, burnValue, cardCost, incomeOf, nextIncomeStep, getPlay, planOf, returnPath, takeEvents, clone, territory, cellCount, poiCount, totalCells,
    scoreboard, round, occupant, groupAt, isBlocked, active, rand, stepOptions, freeStep, walled, isSwamp, isFortifiedAgainst, castleAt,
    statsAt, heroStatsAt, typeStat, typeLevel, heroStat, armyOnField, retinueHP, roadRegion, heroThreat, forecastPlay, forecastStep,
    sortieBlocked, power };
})();
