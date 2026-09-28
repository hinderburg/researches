// Bot. D-066: plans the whole turn — a beam search over sequences of cards and the Overlord's free step — and scores
// the best sequences against the opponent's best reply, played after a real end of turn (so the reply sees returning
// squads and musters). D-085 (V4 "Overlord"): the evaluation is territory, both Overlords' health and retinues, armies
// on the field, upgrade points, the road home and above all danger — what the enemy could hit each Overlord with next
// turn against the shield of his retinue. The opponent's hand is unknown, so the reply is searched over his loadout
// cards (public information), not over the real hand. The greedy 1-ply bot is kept as chooseGreedy (Easy).
window.HB = window.HB || {};
(function () {
  const R = HB.rules, hex = HB.hex, CARDS = HB.cards.CARDS;

  // D-085 (V4 "Overlord"): territory, the Overlords' health, armies, upgrade points — and above all the danger to each
  // Overlord: what the enemy could hit him with next turn against the shield of his retinue (a lost Overlord loses the match)
  const W = { territory: 1.0, hero: 1.4, army: 0.35, poi: 3.0, poiPull: 0.35, road: 1.5, fort: 0.25, danger: 2.2, lethal: 60, opportunity: 0.9, kill: 30,
    noise: 0.3, minGain: 0.3, cardCost: 0.3, hit: 0.25 };
  // search parameters: sequence depth, beam width, how many finished sequences get the opponent-reply check,
  // and how much the reply weighs against the position right after our turn
  const SEARCH = { depth: 4, beam: 12, finals: 10, reply: 0.6, replyDepth: 1 };

  const TYPES = HB.cards.MINION_TYPES;
  function armyValue(s, pid) { // every minion is worth its HP and Attack, wherever it is
    const p = s.players[pid]; let v = 0;
    for (const t of p.types) v += p.retinue[t].n * (R.typeStat(s, pid, t, 'hp') + 1.5 * R.typeStat(s, pid, t, 'atk'));
    for (const q of s.squads) if (q.owner === pid) v += q.n * (R.typeStat(s, pid, q.type, 'hp') + 1.5 * R.typeStat(s, pid, q.type, 'atk'));
    return v;
  }
  function danger(s, pid) { // > 0: the enemy can break through the shield; lethal when it reaches the Overlord's HP
    const t = R.heroThreat(s, pid), over = t.threat - t.shield;
    if (over <= 0) return 0;
    return over >= t.hp ? W.lethal : W.danger * over;
  }
  function onRoad(s, pid) {
    const w = s.players[pid].warband; if (w.dead) return false;
    const reg = R.roadRegion(s, pid);
    for (let d = -1; d < 6; d++) { const c = d < 0 ? w : hex.neighbor(w.col, w.row, d); if (reg.set.has(hex.key(c.col, c.row))) return true; }
    return false;
  }
  function evaluate(s, me) {
    const en = 3 - me, p = s.players[me], e = s.players[en];
    if (s.phase === 'over') return s.winner === me ? 1000 : s.winner === 0 ? 0 : -1000;
    const pw = p.warband, ew = e.warband;
    let score = W.territory * (R.territory(s, me) - R.territory(s, en))
      + W.hero * (pw.hp - ew.hp)
      + W.army * (armyValue(s, me) - armyValue(s, en))
      + W.poi * (R.poiCount(s, me) - R.poiCount(s, en));
    score -= danger(s, me);
    score += W.opportunity * danger(s, en) / W.danger * (danger(s, en) >= W.lethal ? 0.5 : 1);
    if (onRoad(s, me)) score += W.road;
    if (!pw.dead) {
      let nearest = 99;
      for (const q of s.pois) if (q.owner !== me) nearest = Math.min(nearest, hex.distance(pw, q));
      if (nearest < 99) score -= W.poiPull * nearest;
    }
    for (const k in s.cells) { const c = s.cells[k]; if (c.fortOwner && c.owner === c.fortOwner && R.active(s, c.fortUntil || -1)) score += (c.owner === me ? 1 : -1) * W.fort; }
    return score;
  }

  function candidates(s) {
    const p = s.players[s.current], out = [];
    for (const card of p.hand) {
      const play = R.getPlay(s, card);
      if (!play.ok) continue;
      if (play.options) for (const o of play.options) out.push({ uid: card.uid, choice: o });
      else out.push({ uid: card.uid, choice: null });
    }
    for (const o of R.stepOptions(s)) out.push({ uid: null, step: o.dir }); // D-068: the free step
    return out;
  }
  const apply = (sim, c) => c.step != null ? R.freeStep(sim, c.step) : R.playCard(sim, c.uid, c.choice);
  const actions = s => s.playedThisTurn + (s.stepUsed ? 1 : 0);

  // what the move itself did: hits on the enemy count a little on top of the position (helps the beam keep fights)
  function aggressionBonus(events, me) {
    let b = 0;
    for (const ev of events) {
      if (ev.type === 'fight' || ev.type === 'shoot') {
        const mine = ev.attacker === me, side = ev.type === 'shoot' ? ev.d : (mine ? ev.d : ev.a);
        const kills = Object.values(side.losses || {}).reduce((a, x) => a + x, 0) + (side.heroDmg || 0);
        b += (mine ? 1 : -1) * W.hit * kills;
      }
      else if (ev.type === 'heroDown') b += ev.player === me ? -W.kill : W.kill;
    }
    return b;
  }
  // The worst position the opponent can leave us in with its next turn: a greedy sequence of up to
  // SEARCH.replyDepth cards, each chosen to hurt us most. Its hand is modelled as one copy of every card type in
  // its deck list plus the cards of the outposts it holds (the real hand is hidden from the bot).
  // D-085: the reply starts from the real start of the opponent's turn — its sorties go on, its groups come back and its
  // pits send out new minions — so a threat that only exists after that is seen
  function replyValue(s, me) {
    const en = 3 - me, sim0 = R.clone(s);
    sim0.playedThisTurn = Math.max(1, sim0.playedThisTurn);
    R.endTurn(sim0); R.takeEvents(sim0);
    if (sim0.phase !== 'play') return evaluate(sim0, me);
    const e = sim0.players[en];
    const defs = new Set(e.deckIds);
    let uid = 1e6;
    e.hand = [...defs].map(d => ({ uid: uid++, def: d, poi: -1 }));
    let cur = sim0, worst = evaluate(s, me);
    for (let d = 0; d < SEARCH.replyDepth; d++) {
      let bestSim = null, bestV = Infinity;
      for (const c of candidates(cur)) {
        const sim = R.clone(cur);
        if (!apply(sim, c)) continue;
        const v = evaluate(sim, me);
        if (v < bestV) { bestV = v; bestSim = sim; }
      }
      if (!bestSim) break;
      if (d === 0 || bestV < worst) worst = bestV;
      if (bestSim.phase !== 'play') break;
      R.takeEvents(bestSim); cur = bestSim;
    }
    return worst;
  }

  function plan(s, cfg) {
    cfg = cfg || SEARCH;
    const me = s.current, base = R.clone(s);
    const finals = [];
    if (base.playedThisTurn >= 1) finals.push({ state: base, seq: [], bonus: 0, quick: evaluate(base, me) });
    let beams = [{ state: base, seq: [], bonus: 0 }];
    for (let depth = 0; depth < cfg.depth && beams.length; depth++) {
      const next = [];
      for (const b of beams) for (const c of candidates(b.state)) {
        const sim = R.clone(b.state);
        if (!apply(sim, c)) continue;
        const bonus = b.bonus + aggressionBonus(R.takeEvents(sim), me);
        const seq = b.seq.concat([c]), cards = seq.filter(x => x.step == null).length;
        // every card played costs a little: a card that changes nothing is better kept for the next turn
        next.push({ state: sim, seq, bonus, quick: evaluate(sim, me) + bonus - W.cardCost * cards + (R.rand(sim) - 0.5) * W.noise });
      }
      next.sort((a, b) => b.quick - a.quick);
      const kept = next.slice(0, cfg.beam);
      finals.push(...kept.filter(n => n.state.playedThisTurn >= 1 || n.state.phase !== 'play')); // a turn needs a card; a step alone does not end it
      beams = kept.filter(n => n.state.phase === 'play');
    }
    if (!finals.length) return null;
    finals.sort((a, b) => b.quick - a.quick);
    if (!cfg.finals) return finals[0].seq; // no reply check (Normal level)
    let best = null, bestScore = -Infinity;
    for (const f of finals.slice(0, cfg.finals)) {
      const sc = f.state.phase === 'over' ? f.quick
        : (1 - cfg.reply) * f.quick + cfg.reply * (replyValue(f.state, me) + f.bonus);
      if (sc > bestScore) { bestScore = sc; best = f; }
    }
    return best.seq;
  }

  // Returns { uid, choice } for the next card, { end: true } to end the turn, or { pass: true, uid } when nothing is
  // playable. The turn is planned once; later calls replay the plan while it still matches the hand.
  // D-067: difficulty levels. easy = the old greedy bot, normal = turn plan without the reply check, hard = full search
  const LEVELS = { normal: { depth: 4, beam: 4, finals: 0, reply: 0 }, hard: null };
  let cache = null;
  function choose(s, level) {
    level = level || 'hard';
    if (level === 'easy') return chooseGreedy(s);
    const me = s.current, key = s.seed + ':' + s.turnIndex + ':' + me + ':' + level;
    const fallback = s.playedThisTurn ? { end: true } : { pass: true, uid: s.players[me].hand.length ? s.players[me].hand[0].uid : null };
    if (!cache || cache.key !== key || cache.at !== actions(s)) {
      const seq = plan(s, LEVELS[level] || SEARCH);
      if (!seq) return fallback;
      cache = { key, steps: seq, at: actions(s) };
    }
    const step = cache.steps.shift();
    if (!step) { cache = null; return s.playedThisTurn ? { end: true } : fallback; }
    if (step.step == null ? !s.players[me].hand.some(c => c.uid === step.uid) : s.stepUsed) { cache = null; return choose(s, level); }
    cache.at = actions(s) + 1;
    return step.step != null ? { step: step.step } : { uid: step.uid, choice: step.choice };
  }

  // the pre-0.18 bot: 1-ply greedy, one card at a time (kept for the balance sim)
  function chooseGreedy(s) {
    const me = s.current, base = R.clone(s), played = s.playedThisTurn;
    const cands = candidates(base);
    const fallback = played ? { end: true } : { pass: true, uid: s.players[me].hand.length ? s.players[me].hand[0].uid : null };
    if (!cands.length) return fallback;
    const cur = evaluate(base, me);
    let best = null, bestScore = -Infinity;
    for (const c of cands) {
      const sim = R.clone(base);
      if (!apply(sim, c)) continue;
      const sc = evaluate(sim, me) + (R.rand(sim) - 0.5) * W.noise + aggressionBonus(R.takeEvents(sim), me);
      if (sc > bestScore) { bestScore = sc; best = c; }
    }
    if (!best) return fallback;
    if (played >= 1 && bestScore < cur + W.minGain) return { end: true };
    return best.step != null ? { step: best.step } : best;
  }

  HB.ai = { choose, chooseGreedy, evaluate, plan, W, SEARCH, LEVELS };
})();
