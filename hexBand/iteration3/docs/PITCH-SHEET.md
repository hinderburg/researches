# HEXBand — Pitch Sheet

*Based on the playable web prototype, branch `iteration2`, v0.27.0-it2 · play: https://hinderburg.github.io/researches/hexBand/iteration2/*

---

## Elevator Pitch

**One sentence:** HEXBand is a bite-sized 1v1 hex tactics game where every step your warband takes paints the land, and closing a loop flips everything inside to your colour in one sweeping wave — cards set the shape of each manoeuvre, you pick the direction.

---

## Toy

**Toy reference:** Paper.io 2 / Splix.io — paint the ground by moving, close a loop, take everything inside. Slowed down to turns and put on a hex board, so every loop is a plan, not a reflex.

**Core mechanic / input:**
- Drag a movement card onto the board. The card fixes the *shape* of the route (straight, hook, zigzag, arc); where you release picks the *direction*. The warband runs the route and paints every hex it passes.
- Once per turn, the warband takes a free step: press it and swipe in any direction.
- Any area you fully surround with your own hexes flips to your colour, enemy hexes included.
- To attack, run a route onto the enemy warband or castle. Before you let go, the game shows the outcome, e.g. "−5 → 13" or "FALLS!".

**Why it feels good:**
- **Instant, physical payoff.** Tiles are chunky blocks that jump, flip like coins and land with a puff of dust. A closed loop sets off a flip wave outward from your warband.
- **Plan → watch it happen.** You see the whole route and the battle forecast before committing, so every success reads as *your* idea.
- **One readable number.** Your whole army is a crowd under a banner with a single count. Bigger holds the hex, and the banner swells to show it.
- **Your land is your armour.** Your castle rises out of the ground as your realm grows and sinks as you lose hexes.

---

## Rules

**Rules reference:** Clash Royale (a deck of 8 built before the match, short 1v1, three archetypes) crossed with Risk / Polytopia (territory as score, attack by moving onto the enemy), with Into the Breach's "see the result before you commit".

**Board and turn:**
- 74 flat-top hexes, portrait layout.
- Each side starts with a castle, 6 hexes around it and 2 outposts; a neutral Citadel sits in the centre.
- Each turn the hand refills to 4. Play any number of cards (at least one), plus one free step.
- Capturing an outpost puts its card straight into your hand.

**Win condition (either):**
1. **More territory when round 10 ends.** Tie-breaks: outposts → minions → hexes captured in the last round.
2. **Storm the enemy castle.**
   - Castle defence = 20 + 1 per hex + 2 per outpost + 4 for the Citadel.
   - Each hit burns the owner's farthest hexes, and the castle strikes back at the same moment.
   - If your warband still outnumbers the defence after both hits, you march in and the whole map floods your colour.
   - A starting warband alone can never take a starting castle. You have to grow it first (reinforcement cards, outposts, the Citadel).

**Lose condition:** The opponent has more land at the end of round 10, or your castle falls.
- Losing your warband is **not** a loss. It regroups in your castle next turn with 16 men + 4 per outpost + 6 for the Citadel.

**Match length:**
- 10 rounds = 20 turns, about 5–8 minutes.
- In bot-vs-bot simulation, matches average about 14–17 turns. Castle storms usually land in rounds 4–9.

**Progression / meta:**
- *In the prototype:*
  - 3 armies: **Land Grab** (wide routes, summons, enclosures), **Warlord** (grow the horde, crush the warband, storm the castle), **Warden** (walls, fortify, scorched earth, steal outposts).
  - A deck builder: 8 of 20 cards, 2 of 8 outposts.
  - Bot difficulty: Easy / Normal / Hard.
- *Proposed meta:*
  - card collection with sidegrade variants rather than raw power;
  - unlockable armies and outposts;
  - ranked ladder with seasons;
  - cosmetic tiers for tiles, castles, banners and capture effects.

---

## Why it's marketable

**Hook (first second):** A warband dashes a hook-shaped route and — *click* — a whole region of the board flips from grass to blue in a rippling wave, tile after tile.

**Satisfying / close-call moments:**
- **The loop.** One last step seals a ring, 14 hexes flip and "+14 territory" pops.
- **The storm.** The forecast reads **"27 → 19 FALLS!"**. The warband charges, both sides trade blows, the enemy castle sinks into the ground in clouds of dust and the entire map floods your colour.
- **The close call.** After a clash, the numbers pop as **"28 > 24"**, each in its player's colour. The bigger banner swells, and the smaller warband's men scatter and fade.
- **"LAST ROUND!"** splashes across the board while the territory count is neck and neck.

**Unique visual or theme angle:**
- Territory is a physical, tactile surface of 3D hex blocks that flip like coins, with huts and tents growing on captured land.
- The castle is a living score bar: it literally rises out of the earth as your realm grows and sinks as you lose it.
- The board reads at thumbnail size: two colours eating each other.

---

## Sanity Check

### 1 — Unique

**Does it break through the noise?** Yes. The combination is new, even though each part is familiar.
- The **.io territory fantasy** (Paper.io, Splix.io) is a proven viral visual, but it is real-time and has no depth.
- **Hex strategy** (Polytopia, Hexonia) and **deck-driven PvP** (Clash Royale, Clash Mini) are proven, but none of them makes *painting land* the core action.

**Closest existing games:**

| Game | What it shares with HEXBand |
|---|---|
| Paper.io 2 | loop-capture, but real time |
| Polytopia | hex conquest, but 4X-length |
| Hexxagon / Ataxx | colour takeover, but abstract |
| Clash Mini | short 1v1, deck, but auto-battle |

**What makes us stand out:**
- **Card-shaped routes with gesture direction.** The card is a *stencil* for movement, not a unit.
- **Enclosure flips** as the main payoff.
- **The land-is-defence castle** that grows and sinks.
- **A battle forecast** on every attack.

### 2 — Competitive

**How mastery is built:**
- **Route geometry.** Which shape, which direction, which order of cards closes a loop this turn.
- **Tempo.** Grab land now, or take the Citadel and grow the army for a storm.
- **Castle economy.** Every hex you hold is +1 defence. Every hex you lose weakens you and feeds the enemy's storm.
- **Reading the opponent.** Their deck list and outposts are public, so you can predict the reply. The Hard bot already plans its whole turn plus the opponent's best answer, and beats the greedy Easy bot about 88 % of the time.

**Viable playstyles:**

| Style | How it wins |
|---|---|
| Land Grab | out-paints the opponent, closes big loops, wins on territory |
| Warlord | grows the horde, crushes the warband, storms the castle |
| Warden | walls the enemy off, fortifies, burns and steals outposts, denies land |
| Custom deck | any mix built in the deck builder |

All three armies are within about 45–60 % of each other in simulation after tuning.

**Where decisions matter:**
- Every card play: shape × direction × order.
- Whether to spend the free step.
- When to attack: the forecast shows the trade before you commit.
- Whether to hold your warband in the castle, where it never retreats, or push out.
- Which outposts to contest.
- When to switch from painting to storming.

### 3 — Mass market

**Is the fun obvious in under 3 seconds?** Yes, for the visual: "my colour eats their colour" needs no explanation. The rules are one level deeper but taught by the UI:
- the board highlights every hex a card can reach;
- attacks show their forecast before you commit;
- the win conditions are shown as two live mini-scenes on the menu: "Hold more territory at the end of round 10… **OR** …destroy the enemy castle!"

**How we communicate it at a glance:**
- Two-colour board.
- Big territory numbers in the HUD.
- One number per army.
- A castle whose height *is* its strength.

**Broadest audience:**
- .io and casual strategy players (Paper.io, Polytopia, board-game apps);
- the Clash Royale / Clash Mini audience wanting a slower, thinkier 1v1;
- core target: mobile mid-core, roughly 18–45.

**Risk:** Turn-based is slower than .io. Keeping matches at 5–8 minutes, with async / pass-and-play options, is key.

### 4 — Monetizable

**Is the progression worth paying for?** Yes, if it stays sidegrade and cosmetic. Territory is the game's main visual payoff, so **how your land looks** is the natural thing to sell.

**What players will pay for:**

| What | Examples |
|---|---|
| Cosmetics (primary) | tile skins and flip effects (ice, lava, gold, pixel); castle skins that grow differently; settlement styles on captured land; banners; warband skins; victory "flood" effects |
| Deckbuilding depth | new cards and outposts as *sidegrades* with different route shapes and field effects; new armies as archetype bundles |
| Season / battle pass | cosmetics plus new cards on a free track, with a ranked ladder |
| Convenience | deck slots, bot practice modes, replays |

**What to avoid:** Card levels that add raw stats. The game's clarity rests on one readable number per army and forecasts that are always true. Pay-to-win power would break the core "I outplayed you" feeling.

---

*Numbers above come from the prototype's bot-vs-bot simulation, 27–54 games per measurement. They are indicators for balance and match length, not player data.*
