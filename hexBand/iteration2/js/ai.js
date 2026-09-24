// Bot. D-066: plans the whole turn — a beam search over sequences of up to four cards (so it can walk out and walk
// back to close an enclosure within one turn) — and scores the best sequences against the opponent's best
// reply (replyDepth cards; 1 measured as strong as 2 and is faster). The opponent's hand is unknown to the bot, so the reply is searched over the card types of the opponent's
// deck list and outposts (public information), not over the real hand. The old 1-ply greedy bot (D-014, D-045) is
// kept as chooseGreedy for comparison in the balance sim.
window.HB = window.HB || {};
(function () {
  const R = HB.rules, hex = HB.hex, CARDS = HB.cards.CARDS;

  const W = { territory: 1.0, minions: 1.2, poi: 3.0, summon: 1.2, fort: 0.25, poiPull: 0.5, threat: 1.0, opportunity: 0.5, noise: 0.3, minGain: 0.3, cardCost: 0.3, aggression: 5, castleThreat: 3, castleOpp: 1.5 };
  // search parameters: sequence depth, beam width, how many finished sequences get the opponent-reply check,
  // and how much the reply weighs against the position right after our turn
  const SEARCH = { depth: 4, beam: 12, finals: 10, reply: 0.6, replyDepth: 1 };

  function evaluate(s, me) {
    const en = 3 - me, p = s.players[me], e = s.players[en];
    if (s.phase === 'over') return s.winner === me ? 1000 : s.winner === 0 ? 0 : -1000;
    let score = W.territory * (R.territory(s, me) - R.territory(s, en))
      + W.minions * (p.warband.minions - e.warband.minions)
      + W.poi * (R.poiCount(s, me) - R.poiCount(s, en));
    if (hex.distance(p.warband, e.warband) === 1) {
      // D-039: adjacency means a mutual clash on the enemy's turn; the bigger warband holds the ground
      score -= W.threat * R.baseDamage(e.warband.minions);
      score += W.opportunity * R.baseDamage(p.warband.minions);
    }
    let nearest = 99;
    for (const poi of s.pois) if (poi.owner !== me) nearest = Math.min(nearest, hex.distance(p.warband, poi));
    if (nearest < 99) score -= W.poiPull * nearest;
    // D-068: a summon is worth the hexes it will still capture
    for (const u of s.summons) score += (u.owner === me ? 1 : -1) * W.summon * u.acts;
    // D-070: a fortified hex cannot be lost — worth a little on top of its territory point
    for (const k in s.cells) { const c = s.cells[k]; if (c.fortOwner && c.owner === c.fortOwner && R.active(s, c.fortUntil || -1)) score += (c.owner === me ? 1 : -1) * W.fort; }
    // iteration2 (D-074): a castle whose defence is close to the enemy warband's number is in danger when that
    // warband is near; a warband standing in its own castle shields it
    if (s.castles) score += W.castleOpp * castleDanger(s, p, e) - W.castleThreat * castleDanger(s, e, p);
    return score;
  }
  function castleDanger(s, att, def) {
    const aw = att.warband; if (aw.dead) return 0;
    const c = s.castles[def.id], margin = R.defense(s, def.id) - aw.minions - R.baseDamage(aw.minions);
    if (margin >= 6) return 0;
    const d = hex.distance(aw, c), shield = R.inOwnCastle(s, def) ? 0.3 : 1;
    return shield * (6 - margin) / Math.max(1, d - 1);
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

  // D-045: an attack that pushes the enemy back (or eliminates it) is worth pressing; bouncing off is not
  function aggressionBonus(events, me) {
    let b = 0;
    for (const ev of events) {
      if (ev.type !== 'clash' || ev.attacker !== me) continue;
      if (ev.result === 'defenderRetreats' || (ev.result === 'eliminated' && ev.aAfter > 0)) b += W.aggression;
      else if (ev.result === 'attackerRetreats') b -= W.aggression * 0.5;
    }
    return b;
  }

  // The worst position the opponent can leave us in with its next turn: a greedy sequence of up to
  // SEARCH.replyDepth cards, each chosen to hurt us most. Its hand is modelled as one copy of every card type in
  // its deck list plus the cards of the outposts it holds (the real hand is hidden from the bot).
  function replyValue(s, me) {
    const en = 3 - me, sim0 = R.clone(s), e = sim0.players[en];
    const defs = new Set(e.deckIds);
    for (const poi of sim0.pois) if (poi.owner === en) defs.add(R.poiCardId(poi));
    let uid = 1e6;
    e.hand = [...defs].map(d => ({ uid: uid++, def: d, poi: -1 }));
    sim0.current = en; sim0.playedThisTurn = 0; sim0.attacksThisTurn = 0; sim0.stepUsed = false;
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
