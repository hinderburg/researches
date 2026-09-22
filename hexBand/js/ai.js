// Bot: 1-ply greedy search. Every playable card × every option is simulated on a clone of the state
// and scored with a hand-written heuristic (D-014). It only sees its own hand.
window.HB = window.HB || {};
(function () {
  const R = HB.rules, hex = HB.hex, CARDS = HB.cards.CARDS, CFG = HB.CONFIG;

  const W = { territory: 1.0, minions: 1.2, poi: 3.0, poiPull: 0.5, threat: 1.0, threatIfMustPivot: 0.5, opportunity: 0.5, noise: 0.6, minGain: 0.3 };

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
    return score;
  }

  function candidates(s) {
    const p = s.players[s.current], out = [];
    for (const card of p.hand) {
      const play = R.getPlay(s, card);
      if (!play.ok) continue;
      if (CARDS[card.def].kind === 'scout') for (const o of R.scoutOptions(s, p)) out.push({ uid: card.uid, choice: o });
      else if (play.options) for (const o of play.options) out.push({ uid: card.uid, choice: o });
      else out.push({ uid: card.uid, choice: null });
    }
    return out;
  }

  // Returns { uid, choice } for the next card to play, { end: true } to end the turn (D-022: a turn holds any number
  // of cards; the bot keeps playing while a card improves its evaluation), or { pass: true, uid } when nothing is playable.
  function choose(s) {
    const me = s.current, base = R.clone(s), played = s.playedThisTurn;
    const cands = candidates(base);
    const fallback = played ? { end: true } : { pass: true, uid: s.players[me].hand.length ? s.players[me].hand[0].uid : null };
    if (!cands.length) return fallback;
    const cur = evaluate(base, me);
    let best = null, bestScore = -Infinity;
    for (const c of cands) {
      const sim = R.clone(base);
      if (!R.playCard(sim, c.uid, c.choice)) continue;
      const sc = evaluate(sim, me) + (R.rand(sim) - 0.5) * W.noise;
      if (sc > bestScore) { bestScore = sc; best = c; }
    }
    if (!best) return fallback;
    if (played >= 1 && bestScore < cur + W.minGain) return { end: true };
    return best;
  }

  HB.ai = { choose, evaluate, W };
})();
