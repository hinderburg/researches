> Копия `TOADBREW_Relay_Alchemy_GDD.md` автора (2026-10-12), текст дословно, нумерация разделов сохранена — ссылки §N в коде и решениях ведут сюда. Ветка `Quoridor2` (выведена из `Quoridor`). Прошлый GDD (итерации 2–4) — `GDD-v3-arena2.md`.
>
> **Правки 2026-10-13 по слову автора** — сводка ниже. Текст автора не переписан: в начале каждого изменённого раздела стоит пометка «✎ Правка 2026-10-13». Подробности — [DECISIONS.md](DECISIONS.md) D-141…D-154, план и открытые вопросы — [ROADMAP.md](ROADMAP.md).

## Правки 2026-10-13 · Relay Alchemy 2 (ветка `Quoridor2`, версии 6.0.0–6.1.0)

**Автор, 13.10:** «проанализируй гдд, проанализируй другие игры в жарне мидкор кэжуал, и предложи правки и изменения в правилах, чтобы игра стала более понятной для восприятия и интуитивного понимания работы механик».
**Автор, 13.10:** «меня волнует темп игры и логика возврата. на нее уже жаловались, что она непонятная, и неприятно, когда игра забирает твою жабу. при этом, опять же, непонятно, почему этой жабой нельзя уже прыгать».
**Автор, 13.10:** «выведи новую ветку, и реализуй там все описанные пункты. для возврата сделай вариант 1. в новой ветке добавь все эти правки в гдд и роадмап, чтобы не потерять их».
**Автор, 13.10 (6.1):** «непонятно, почему флягу может разбить только жаба с эликсиром. поэтому я хотел, чтобы после расходования эликсира жаба переставала двигаться - тогда понятно, почему она не может дальше идти… туториал хороший, но лучше сделать туториальные подсказки в первом обычном матче, которые объяснили бы основные механики и цель игры».

Цель правок: около 16 понятий, часть из которых невидима, свести к 7–8 видимым. Каждое правило — одно слово и иконка там, где оно действует.

| Что | Было | Стало | Почему | § · D |
|---|---|---|---|---|
| Жаба без эликсира | EMPTY: не ходит, только точка эстафеты; через 2 своих хода сама улетает домой | **Эликсир — топливо пружины:** пустая жаба стоит (оседает, тусклая, «🪫 EMPTY»), остаётся точкой эстафеты. Игра сама её не забирает. Превью заранее предупреждает о последнем эликсире | «неприятно, когда игра забирает твою жабу»; «хотел, чтобы после расходования эликсира жаба переставала двигаться — тогда понятно, почему она не может дальше идти» | §24, §25 · D-153 (6.0: сухой прыжок, D-141 — снят) |
| Отзыв | Бесплатно, 1 раз за ход, кнопка RECALL внизу | **«⟲ Домой»** на карточке жабы, без лимита; дома бак **сразу** наливается — можно прыгнуть в тот же ход | Ходов без действия нет; кнопка там, где жаба | §23 · D-153 |
| Последовательность элементов | Общая лента с двумя указателями (▶ мой, ◀ врага) | **Своя очередь NEXT** из трёх элементов, как в Tetris; врага — отдельно. Под капотом та же общая последовательность | Самое тяжёлое правило | §15, §32 · D-142 |
| Первый ход | База первого ходящего в первый ход не наливала | **Симметрично:** база каждой стороны наливает +1 в начале каждого своего хода, включая первый | Убрать исключение | §14, §17 · D-142 |
| Элементы | Свойства элементов разные в каждой реакции | **Элемент = глагол:** 🔥 DAMAGE · ❄ STOP · ☠ ZONE · ⚡ PUSH | Реакцию можно угадать без таблицы | §18, §36 · D-143 |
| Реакции | Plasma Burst, Detonation, Toxic Vortex, Steam Jet, Crystal Column, Frost Ward | **Сумма глаголов:** Plasma Burst (урон + толчок), **Wildfire** (урон + зона: горящее поле), **Ice Blast** (урон + стоп: заморозка), Crystal Column (стоп + зона), Toxic Vortex (толчок + зона), **Ice Slide** (толчок + стоп: горки) | Detonation разбрасывала без урона, хотя огонь — урон | §20, §36 · D-143 |
| Комбо через союзника | Только если у союзника есть заряды другого элемента | **Без условия:** союзник с другим элементом всегда даёт реакцию пары в конце цепочки; сухой прыжок комбо не даёт | Невидимое условие | §9 · D-143 |
| Командные свойства | 3 свойства пар из 6, часть — только при эстафете между конкретной парой | **Перк жабы, от которой отскочили:** 🏹 Catapult, ⚓ Anchor, 🌀 Amplify, ☄️ Power (как Friendship Combo в Monster Strike) | «Что даст прыжок на эту жабу?» — видно по ней | §29, §30 · D-144 |
| Колонна | Блокирует низкую часть дуги | **Стена:** обычный прыжок не проходит никогда; прыжок со спины союзника пролетает. Колонна не может закрыть последний путь к фляге (правило Quoridor) | Без превью было не предсказать; эстафета — ответ на стены | §21 · D-145 |
| Угрозы | Не видны | **Круги досягаемости врага** на своём ходу; «⚠ CHECK» — враг достаёт до нашей фляги; золотой путь к фляге врага | «Почему я проиграл?» видно заранее | новое · D-146 |
| Невидимые правила | База не красится, зона фляги, свойства клеток — нигде не показаны | Штриховка баз, пульсирующая зона победы, **легенда клетки по тапу**; на карточке только HP, перк, элемент и эликсир | Правило видно там, где действует | §37 · D-147 |
| Обучение | Всё открыто с первого матча | **Подсказки в первом обычном матче:** по ситуации на поле, по одной за ход, с кольцом вокруг цели — цель, прыжок, шах, пустой бак, эстафета, эликсир, удар, реакция (+ покраска, перки, стена, NEXT) | «лучше сделать туториальные подсказки в первом обычном матче, которые объяснили бы основные механики и цель игры» | §40 · D-154 (6.0: ступени, D-148 — сняты) |
| Темп | Медиана около 30 ходов, 6–8 минут; пасы, когда все жабы пустые | **Перегрузка фляг:** с 24-го хода зона победы растёт на 30 за ход. Пасов по принуждению нет. Паузы бота и баннеры короче, налив разом | Матч 3–5 минут с гарантированным финалом | §28 · D-149 |
| Победа | Любая жаба на фляге врага | Как у автора: **любая жаба**. Пустая и так не прыгает | 6.0 требовал эликсир (D-150) — автору непонятно, снято | §3 · D-153 |
| Прыжок со спины своей | Как обычный | Как у автора — полная дальность; пролетает над колоннами (D-145) | Трамплин 6.0 (D-151) не нужен без сухого прыжка | §9 · D-153 |

**Остаётся как у автора:** поле 6×14, фляги, прыжок рогаткой с одной дальностью у всех, эстафета и правило «каждого союзника раз за активацию», бак 3 и налив +1 на базе, покраска клеток и реакции на сетке, постоянный рельеф, 4 жабы с HP, Defense, массой и силой удара, бот-соперник.

---


# TOADBREW — Relay Alchemy
## Game Design Document
### Quoridor-inspired tactical PvP with slingshot frogs, relay movement and permanent alchemical terrain

> **Status:** working GDD / prototype rules  
> **Core format:** PvP, two opposing alchemists  
> **Input:** select frog → pull back → aim → release  
> **Primary goal:** land any of your frogs on the opponent's Base Flask  
> **Board philosophy:** free physical movement on top of a fixed hidden grid  
> **Strategic pillars:** movement through allied frogs, rotation through elixir economy, permanent terrain modification, predictable shared element sequence

---

# 1. High Concept

TOADBREW is a tactical PvP game inspired structurally by **Quoridor**, but played with physical slingshot-controlled mechanical frogs.

Each player launches frogs from their own alchemical base and tries to advance toward the opponent's **Base Flask**.

The central twist is that the player's frogs are simultaneously:

- units;
- moving pieces of infrastructure;
- relay points for longer movement;
- combat targets;
- carriers of elemental elixir.

A single frog should not be able to slowly brute-force its way across the whole arena. Efficient advancement comes from positioning several allied frogs so that they can be used as **Relay points**.

Meanwhile, elemental elixirs permanently alter grid cells. Players gradually transform an initially identical neutral board into a unique battlefield by creating elemental cells, reactions and terrain.

The intended feel is a hybrid of:

- Quoridor — advance yourself or interfere with the opponent's route;
- checkers — satisfying multi-stage movement through positioned pieces;
- systemic elemental games — elements combine into predictable reactions;
- physics/slingshot toy — every active move is still made by pulling and releasing a frog.

---

# 2. Design Pillars

## 2.1. One primary input

The player should mostly interact with the game by launching frogs.

Core action:

`Select Frog → Pull → Aim → Release → Jump`

There should not be separate movement, attack and spell buttons.

The main exception is **Recall**, which is a simple free management action used to rotate frogs.

## 2.2. Your frogs are your route

All frogs share the same base jump range.

A frog can advance normally by making standard jumps, but the most efficient movement comes from landing on allied frogs.

Landing on an allied frog triggers a **Relay** and allows the currently active frog to immediately make another jump within the same activation.

Therefore the player's route is not a permanent trail of pads.

The route is the current spatial arrangement of the player's living frogs.

## 2.3. The board begins identical every match

The arena contains no pre-generated elemental areas.

At the beginning of the match:

- the board layout is identical for both players;
- all terrain cells are Neutral;
- only the players can create elemental or reaction terrain;
- the same global element sequence is available to both players.

Differences between matches should emerge from player decisions, not initial random terrain.

## 2.4. Terrain changes are persistent

Any reaction that changes terrain or territory remains active until another player action removes or replaces it.

No short timers for core terrain.

If a Crystal Column is created, it stays there.

If a cell becomes a persistent hazardous reaction cell, it remains there.

The arena records the history of the match.

## 2.5. Geometry must stay learnable

The game's strategic geometry should not change because of progression.

Therefore:

- all frogs use the same base jump range;
- jump range is not upgraded in the meta;
- tank capacity is universal, not frog-specific;
- progression may improve durability or trait strength, but should not redefine basic board reachability.

---

# 3. Match Objective

> ✎ **Правка 2026-10-13.** Победа — любая жаба, как у автора; пустая и так не прыгает (6.1, D-153). С 24-го хода зона победы обеих фляг растёт на 30 за ход, до +260 — перегрузка фляг (D-149).

Each player has a **Base Flask** at their side of the arena.

The opponent's Base Flask is the final objective.

## Victory condition

> **Any legal jump that reaches / lands on the opponent's Base Flask wins the match.**

The final jump does **not** need to originate from an allied frog.

Relay is a movement advantage, not a special key required to score.

---

# 4. Arena Structure

The arena is visually free-form, but logically built on a fixed square grid.

The player does not move frogs cell-by-cell.

Frogs land freely inside physical space.

The grid exists underneath the arena to define:

- elemental ownership of territory;
- reactions;
- terrain creation;
- terrain removal;
- column placement;
- persistent hazards;
- clear rule resolution.

Example logical board:

```text
┌───┬───┬───┬───┬───┬───┐
│   │   │   │   │   │   │
├───┼───┼───┼───┼───┼───┤
│   │   │   │   │   │   │
├───┼───┼───┼───┼───┼───┤
│   │   │   │   │   │   │
├───┼───┼───┼───┼───┼───┤
│   │   │   │   │   │   │
└───┴───┴───┴───┴───┴───┘
```

The grid should be visually readable through floor construction:

- stone slabs;
- seams;
- metal frames;
- drainage panels;
- engraved alchemical borders.

It does not need to look like a literal chess board.

---

# 5. Cell States

Every grid cell is always in one clear state.

## Neutral

Default floor.

No elemental property.

## Elemental

A cell currently contains one base element:

- Fire;
- Ice;
- Poison;
- Lightning.

## Reaction Terrain

A reaction has transformed the cell into a special persistent state.

Examples:

- Crystal Column;
- Steam Cell / Steam Zone;
- Charged Field;
- Toxic Field;
- other reaction-specific terrain.

Each cell must clearly communicate its current state visually.

---

# 6. Frog Roster

Current frog archetypes:

- **Springjack**
- **Clingfoot**
- **Bellows Toad**
- **Spur Knight**

Players build a team from these frog types.

Current prototype assumption:

> **3 frogs per player on the board / roster for a match.**

This number is a prototype parameter and can be tuned.

---

# 7. Universal Frog Movement

All frog types share the same:

- base jump distance;
- core aiming rules;
- gravity / arc logic;
- universal tank capacity.

Frog identity should come from:

- HP;
- Defense;
- physical impact profile;
- Team Traits;
- special Relay interactions;
- interaction with terrain and enemies.

Not from fundamentally different board reach.

---

# 8. Standard Activation

To activate a frog:

1. player selects a frog that currently has at least one Elixir Charge;
2. player pulls back;
3. trajectory preview appears;
4. player releases;
5. frog performs a physical jump;
6. landing is resolved;
7. if the landing is on an allied frog, Relay may continue;
8. once the activation reaches its final landing, elemental resolution occurs;
9. one Elixir Charge is consumed for the activation.

A complete chain such as:

`Launch → Ally → Ally → Final Landing`

is still **one activation** and costs **one charge**.

---

# 9. Relay

> ✎ **Правка 2026-10-13.** Прыжок со спины союзника пролетает над колоннами (D-145). Союзник даёт отскочившей свой перк (D-144). Комбо через союзника другого элемента — без условия заряда (D-143). От пустой жабы тоже можно отскочить (D-153).

Relay is the central movement mechanic.

## Trigger

If the active frog lands on one of its allied frogs:

> the activation does not end.

The active frog immediately becomes aimable again.

The player performs another pull-and-release with the same frog.

Example:

```text
A ─────→ B
          ↓
       Relay
          ↓
      A ─────→ Final Landing
```

## Relay jump range

A Relay jump uses the same base maximum range as a normal jump.

No special universal distance multiplier is required.

The advantage is the additional segment of movement, not a larger individual jump.

## Relay chain

With several correctly positioned allied frogs:

```text
A → B → C → Final Landing
```

The active frog may cover much more total distance in one activation.

This creates the desired checkers-like feeling of building a multi-step route through positioned pieces.

## Anti-loop rule

A specific allied frog can be used as a Relay point only **once during the current activation**.

Therefore this is illegal:

```text
A → B → C → B → C → ...
```

With a three-frog team, the number of available Relay steps is naturally limited.

## Relay does not paint cells

Intermediate Relay contacts do not apply elements to the grid.

Only the **final landing** of the activation performs elemental resolution.

This keeps the board readable and prevents a long Relay chain from painting several cells in one action.

---

# 10. Enemy Frog Collision

Current core rule:

> **Only allied frogs extend movement.**

Landing on an enemy frog does not create a Relay.

Enemy collision resolves physical combat:

- damage;
- impact;
- knockback;
- frog-specific combat effects.

After the enemy interaction is resolved, the activation ends unless a later prototype rule explicitly adds a special exception.

This prevents enemy pieces from becoming unintended long-distance movement infrastructure.

---

# 11. Why Equal Jump Range Still Allows Full-Board Progression

The map should be longer than one frog can cross with its personal activation budget.

A lone frog moves:

```text
Base → Jump → Jump → Jump
```

and eventually runs out of elixir before reaching the enemy base.

A coordinated team advances by leapfrogging over one another:

```text
Turn 1:
A moves forward.

Turn 2:
B → A → forward.

Turn 3:
C → A → B → forward.

Later:
A uses B / C to rejoin the front.
```

The formation itself migrates across the arena.

A frog that rushes too far ahead may leave Relay range and isolate itself.

This is intended.

---

# 12. Elixir as Activation Economy

> ✎ **Правка 2026-10-13.** Эликсир — топливо пружины механической жабы: каждая активация сжигает 1, пустая жаба стоит, пока «⟲ Домой» не вернёт её на базу — там бак наливается сразу (6.1, D-153).

Elixir should not limit the number of jumps inside one Relay chain.

Instead:

> **1 Elixir Charge = 1 frog activation.**

The frog may perform several Relay segments during that activation.

This preserves long tactical combos while preventing one frog from advancing forever.

---

# 13. Universal Tank Capacity

All frogs use the same tank size.

Prototype default:

> **Maximum 3 charges.**

This is a universal match rule, not a frog stat.

Tank capacity should not be upgraded through meta progression.

This makes activation economy predictable for both players.

---

# 14. Base Charging

> ✎ **Правка 2026-10-13.** Исключения первого хода нет: база каждой стороны наливает +1 в начале каждого своего хода, включая первый (D-142).

Frogs recharge only while on their own base.

At the beginning of the player's turn:

> every eligible frog currently on the Base receives one Elixir Charge, up to the universal maximum.

A frog therefore becomes stronger as a future expedition piece the longer it remains at home.

Example:

```text
Turn 1: ●○○
Turn 2: ●●○
Turn 3: ●●●
```

This creates a tempo decision:

> launch now with little fuel, or wait and prepare a longer field presence?

---

# 15. Shared Element Sequence

> ✎ **Правка 2026-10-13.** Игрок видит свою очередь NEXT из трёх элементов, отдельно — очередь врага. Общая последовательность с указателем каждой стороны осталась под капотом (D-142).

Players do **not** freely choose the next element for each frog.

Instead, every match uses a visible global element sequence.

Example:

```text
Fire → Ice → Lightning → Poison → Fire → Poison → Ice → ...
```

The sequence itself is the same for both players.

Each player has an independent pointer into that same sequence.

Therefore players may progress through it at different speeds.

Example:

```text
Shared sequence:
🔥 → ❄ → ⚡ → ☠ → 🔥 → ❄ → ...

Player A:              ▲
Player B:         ▲
```

This provides asymmetry through decisions rather than hidden random generation.

---

# 16. Assigning an Element to a Frog

When a frog is on the Base with an empty tank and begins a new charging cycle:

1. it receives the next element from that player's sequence pointer;
2. the sequence pointer advances by one;
3. the frog now charges only that element until the tank is emptied or the frog is Recalled.

Example:

```text
Next element: Ice

Clingfoot enters new cycle:
❄ ●○○

Later:
❄ ●●○
❄ ●●●
```

It cannot mix Fire and Ice inside the same tank.

---

# 17. Starting State

> ✎ **Правка 2026-10-13.** Баки пусты у обеих сторон; первая порция наливается в начале своего первого хода, струйки видны сразу после стартовой подсказки (D-142).

Prototype starting rule:

- both players begin with their match frogs on their Base;
- each frog starts with **1 charge**;
- the frogs receive their starting elements from the common sequence in a deterministic roster-slot order.

Example:

```text
Shared sequence:
🔥 → ❄ → ⚡ → ☠ ...

Slot 1 → Fire ●
Slot 2 → Ice ●
Slot 3 → Lightning ●
```

Because the sequence is shared and deterministic, the match begins symmetrically if players use equivalent slot ordering.

---

# 18. Elemental Resolution

> ✎ **Правка 2026-10-13.** У каждого элемента один глагол: 🔥 DAMAGE, ❄ STOP, ☠ ZONE, ⚡ PUSH. Реакция — сумма глаголов двух элементов (D-143).

Elemental interaction occurs only on the **final landing** of a charged frog activation.

The element carried by the active frog interacts with the state of the final grid cell.

## Neutral Cell + Element

Example:

```text
Neutral + Fire
      ↓
Fire Cell
```

The cell becomes that element.

## Same Element + Same Element

Example:

```text
Fire Cell + Fire Frog
```

No new reaction occurs.

The cell remains Fire.

For the prototype, the activation still consumes its normal Elixir Charge.

This keeps activation economy consistent and predictable.

## Different Element + Different Element

Example:

```text
Fire Cell + Ice Frog
        ↓
Fire + Ice Reaction
```

A specific elemental reaction is triggered.

There is no ambiguous proximity rule.

The player must land the frog's **final landing directly inside the target cell**.

---

# 19. Reaction Rule

The universal rule is:

> **A reaction occurs only when a charged frog finishes its activation inside a cell containing a different base element.**

Not:

- next to the cell;
- while flying over it;
- by touching its border;
- during an intermediate Relay;
- from generic proximity.

This should always be predictable from trajectory preview.

---

# 20. Reaction Categories

> ✎ **Правка 2026-10-13.** Набор реакций переназначен по глаголам: Plasma Burst, Wildfire, Ice Blast, Crystal Column, Toxic Vortex, Ice Slide (D-143, таблица в начале документа).

Reactions are divided into two broad categories.

## Instant Reactions

Resolve immediately.

Examples:

- explosion;
- direct damage;
- knockback pulse;
- projectile launch.

After resolution, the cell may become Neutral or another clearly specified state.

## Persistent Terrain Reactions

Permanently alter the board until explicitly countered.

Examples:

- Crystal Column;
- persistent Steam territory;
- charged terrain;
- toxic terrain;
- other reaction-defined structures.

These reactions remain active for the rest of the match unless another valid reaction removes or replaces them.

---

# 21. Terrain Scale

All terrain effects are cell-based.

Even something that previously behaved like a wall is now created as a full-cell object.

Example:

## Crystal Column

> ✎ **Правка 2026-10-13.** Колонна — стена: обычный прыжок не проходит на любой высоте, прыжок со спины союзника пролетает. Колонна не может закрыть последний путь к фляге (D-145).

Instead of:

```text
──────── WALL ────────
```

the reaction creates:

```text
┌─────┐
│  █  │
│  █  │
└─────┘
```

A vertical pillar rises from one grid cell.

It may:

- block low jump trajectories;
- block a direct path;
- create cover;
- become a physical collision object;
- potentially become a special surface for selected Team Traits.

The important rule is:

> one terrain object occupies one well-defined grid cell.

---

# 22. Permanent Board Evolution

The match begins:

```text
□ □ □ □ □ □
□ □ □ □ □ □
□ □ □ □ □ □
□ □ □ □ □ □
```

Later the same board may look conceptually like:

```text
□ 🔥 □ █ □ ⚡
☠ □ □ █ □ □
□ ~ ~ □ ❄ □
□ □ ⚡ □ □ ☠
```

Legend:

- `□` Neutral
- `🔥` Fire
- `❄` Ice
- `☠` Poison
- `⚡` Lightning
- `█` physical reaction terrain
- `~` other persistent reaction territory

The board becomes a visual history of player decisions.

---

# 23. Recall

> ✎ **Правка 2026-10-13.** «⟲ Домой» — кнопка на карточке жабы, без лимита «1 за ход», бесплатно, до активации; дома база сразу наливает новый бак, жабой можно прыгнуть в тот же ход (D-153).

Recall is a **free action**, not an alternative to the player's main frog activation.

Purpose:

- rotate frogs;
- abandon an inconvenient element;
- accelerate progress through the shared element sequence;
- recover an isolated frog;
- reorganize Relay structure.

## Recall behavior

When a frog is Recalled:

1. it immediately returns to its own Base;
2. all remaining Elixir Charges are discarded;
3. the frog's previous element is removed;
4. it waits to begin a new charging cycle;
5. when the new cycle begins, it receives the next element from the player's sequence.

Example:

```text
Springjack:
Fire ●●○

Recall
↓
Base
Empty tank
↓
Next charging cycle:
Poison ●○○
```

## Prototype Recall limit

Recommended first prototype:

> **1 free Recall per player turn.**

This prevents excessive board cleanup while preserving rotation.

This value is a tuning parameter, not a final rule.

---

# 24. Empty Frog State

> ✎ **Правка 2026-10-13.** Пустая жаба стоит и остаётся точкой эстафеты, как у автора, но это видно: она оседает и тускнеет, над ней «🪫 EMPTY», превью заранее предупреждает о последнем эликсире (D-153).

When a frog spends its last Elixir Charge:

```text
● → ○
```

it becomes **Empty**.

An Empty frog:

- remains physically on the arena;
- can still be attacked;
- can still block space;
- can still be used as an allied Relay point;
- cannot be selected for a new activation.

It is not converted into a special platform object.

It remains the same frog, simply out of fuel.

---

# 25. Automatic Return Timer

> ✎ **Правка 2026-10-13.** Авто-возврата нет: домой — только по решению игрока, кнопкой «⟲ Домой» (D-141, D-153).

To prevent Empty frogs from permanently cluttering the board, they receive an automatic return countdown.

Prototype default:

> **Return in 2 of that player's turns.**

Example:

```text
EMPTY
RETURN: 2

next turn:
RETURN: 1

next turn:
automatic return to Base
```

The player may still Recall the frog earlier as a free action.

This creates temporary tactical windows where an Empty frog still matters as Relay infrastructure.

---

# 26. Death and Respawn

If a frog reaches 0 HP:

1. it is removed from its current board position;
2. it returns to its own Base;
3. all remaining elixir is lost;
4. it returns with an empty tank;
5. it begins a new charging cycle under the normal Base rules.

Death therefore:

- interrupts the opponent's Relay network;
- removes field progress;
- forces that frog to restart its rotation;
- does not permanently eliminate the unit from the match.

This keeps frogs strategically necessary throughout the match.

---

# 27. Anti-Brute-Force Logic

> ✎ **Правка 2026-10-13.** Защита — как у автора: пустая жаба не прыгает, а дальше одной активации от базы без эстафеты не уйти (D-153).

A high-HP upgraded frog must not be able to walk to the enemy Base indefinitely.

The system prevents this in several ways:

1. all frogs have a finite universal tank;
2. every activation costs one charge;
3. an Empty frog cannot start another activation;
4. the map should require more ordinary activations to cross than one full tank provides;
5. efficient long-distance progress therefore requires Relay through allied frogs;
6. enemy damage / death can reset an advanced frog to Base.

Therefore durability helps a frog hold its position, but does not grant unlimited movement.

---

# 28. Turn Structure

> ✎ **Правка 2026-10-13.** Ходов без действия нет: если ни одна жаба не может прыгнуть, «⟲ Домой» сразу заправляет пустую. С 24-го хода — перегрузка фляг (D-149, D-153).

Prototype turn sequence:

## Start of Turn

1. resolve automatic Empty-frog return timers;
2. frogs on Base gain their charging tick;
3. frogs beginning a new charging cycle receive the next sequence element;
4. persistent board states remain unchanged.

## Free Management Window

Player may use allowed free Recall.

## Main Activation

Player selects one frog with at least one Elixir Charge.

## Jump Resolution

- launch;
- possible Relay chain;
- enemy collision if any;
- final landing;
- elemental resolution;
- consume 1 Elixir Charge.

## End of Turn

- if active frog reaches 0 charges, start its Return timer;
- resolve deaths and other end-of-turn effects;
- pass turn to opponent.

---

# 29. Team Traits

> ✎ **Правка 2026-10-13.** Свойства пар заменены перком каждой жабы, который получает отскочившая от неё: 🏹 Catapult, ⚓ Anchor, 🌀 Amplify, ☄️ Power (D-144).

The game should retain unique pair interactions between frog types.

The important design constraint is:

> Team Traits should modify **how frogs cooperate, Relay or resolve impact**, without changing the universal basic jump range or tank capacity.

This preserves a stable board geometry.

Current pair directions:

| Pair | Current identity |
|---|---|
| Springjack + Clingfoot | precision Relay / catapult-style repositioning |
| Springjack + Bellows Toad | elemental Relay / reaction-focused movement |
| Springjack + Spur Knight | momentum / stronger final impact after Relay |
| Clingfoot + Bellows Toad | territory control / stable elemental setup |
| Clingfoot + Spur Knight | anchoring / positional control / displacement resistance |
| Bellows Toad + Spur Knight | breach / interaction with created terrain and obstacles |

Exact numeric effects remain a tuning task.

The core goal is that choosing different frog combinations changes how the same arena is navigated.

---

# 30. Frog Archetype Identity

## Springjack

Theme:

- momentum;
- spring mechanics;
- aggressive Relay;
- movement conversion.

Visual:

- long spring-loaded hind legs;
- lighter chassis;
- jump-focused silhouette.

## Clingfoot

Theme:

- grip;
- anchoring;
- stable Relay geometry;
- resisting displacement.

Visual:

- large adhesive toe pads;
- low stable body;
- broad contact surfaces.

## Bellows Toad

Theme:

- alchemy;
- reagent manipulation;
- territory and reaction support.

Visual:

- pump / bellows modules;
- reagent pipes;
- heavier alchemical body.

## Spur Knight

Theme:

- physical impact;
- displacement;
- collision;
- breaking formations.

Visual:

- heavier armor;
- rear spurs;
- reinforced legs;
- aggressive impact silhouette.

---

# 31. Meta Progression

Meta progression must not invalidate board geometry.

## Allowed progression spaces

### HP

Makes a frog harder to kill and reset to Base.

### Defense

Reduces incoming damage.

### Impact / Knockback Resistance

Can differentiate tankier frogs without affecting their reach.

### Team Trait Level

Strengthens the frog's unique team identity.

Examples:

- stronger impact;
- better anchoring;
- more efficient reaction interaction;
- more meaningful terrain interaction.

### Elixir / Alchemy Level

May strengthen the **effect** of reactions without increasing tank capacity.

Examples:

- stronger instant reaction damage;
- greater knockback;
- harder-to-remove reaction terrain;
- stronger secondary effect.

## Progression must not change

- base jump range;
- universal tank capacity;
- number of Relay points allowed;
- fundamental reaction recipes;
- Base Flask reach rules.

These are part of the board game grammar and should remain stable.

---

# 32. Element Sequence as Strategy

Because both players use the same public sequence, the sequence itself becomes strategic information.

Example:

```text
Sequence:
🔥 → ❄ → ⚡ → ☠ → 🔥 → ❄ → ...

You:
next = Poison

Enemy:
next = Lightning
```

This allows prediction:

- which reaction the opponent may prepare;
- whether the opponent is likely to Recall;
- whether a current elemental cell is safe to leave in place;
- which frog should remain at Base to accumulate charges.

Players know the same future sequence but may intentionally advance through it at different speeds.

---

# 33. Rotation as a Core Layer

A player constantly decides whether a frog should:

- stay in the field;
- spend remaining charges;
- act as Relay infrastructure;
- be Recalled early;
- be allowed to auto-return after becoming Empty;
- be sacrificed into a risky position.

Rotation is therefore not a separate minigame.

It emerges from:

- fuel;
- Base charging;
- Recall;
- death;
- shared element sequence.

---

# 34. Strategic Decision Types

Each main activation should usually express one of several intentions.

## Advance

Move a frog toward the enemy Base.

## Build Relay Structure

Position a frog where another allied frog can use it later.

## Attack

Damage or displace an enemy frog to break their route.

## Paint

Place a base element on a useful cell.

## React

Land into an opposing elemental cell to create a specific reaction.

## Terraform

Create permanent terrain that alters future paths.

## Rotate

Use free Recall to change future element availability or recover positioning.

A good move may serve several of these purposes at once.

---

# 35. Core Strategic Tension

The intended Quoridor-like question is:

> **Do I spend this turn improving my own route, or worsening the opponent's route?**

But unlike Quoridor, the "walls" and route changes emerge from:

- frog positions;
- combat;
- permanent elemental cells;
- reactions;
- terrain creation.

The player is never placing an abstract wall token.

They are always launching a frog.

---

# 36. Prototype Reaction Framework

> ✎ **Правка 2026-10-13.** Реакции = сумма глаголов (D-143): 🔥+⚡ Plasma Burst · 🔥+☠ Wildfire · 🔥+❄ Ice Blast · ❄+☠ Crystal Column · ⚡+☠ Toxic Vortex · ⚡+❄ Ice Slide.

The exact six reactions should be redesigned around the grid system.

Current required categories:

- at least one pure instant damage reaction;
- at least one displacement / knockback reaction;
- at least one persistent hazardous cell;
- at least one persistent information / concealment territory;
- at least one persistent physical terrain reaction;
- at least one defensive or positional-control reaction.

One already-established direction:

## Ice + Poison → Crystal Column

Creates a permanent physical column occupying exactly one cell.

It remains until removed by a defined counter-reaction.

Other reaction identities are still open for finalization.

---

# 37. Visual Readability Requirements

> ✎ **Правка 2026-10-13.** Добавлено: круги досягаемости врага и «⚠ CHECK» (D-146), штриховка баз, пульсирующая зона победы, легенда клетки по тапу, на карточке только главное (D-147).

A player should be able to understand the tactical state at a glance.

Every frog should clearly show:

- frog type;
- current element;
- remaining charges;
- Empty state;
- Return countdown if Empty.

Every cell should clearly show:

- Neutral;
- current base element;
- reaction terrain.

The global UI should clearly show:

- your next elements;
- opponent's next elements;
- current sequence progression;
- whose turn it is.

---

# 38. Camera and Presentation

Recommended view:

- top-down or high three-quarter perspective;
- full tactical readability;
- enough depth to see raised terrain such as Crystal Columns;
- mobile-friendly vertical composition remains possible.

The physics should feel tangible, but board state should remain easy to parse.

---

# 39. Wild NPC Frog — Optional Later Layer

The previously designed Wild Mechanical Frog can be retained as a future mode or mid-match event, but it is **not required for the first prototype of Relay Alchemy**.

Existing concept:

- wild steampunk mechanical frog;
- rough, dangerous silhouette;
- large predator eyes with vertical pupils;
- eye color changes each round and signals its combined reaction;
- back reservoir changes color each round;
- matching the reservoir color when attacking it deals bonus damage.

Because the current core already has many interacting systems, this NPC should be added only after movement, rotation and grid reactions are proven fun.

---

# 40. First Playable Prototype

> ✎ **Правка 2026-10-13.** Механики объясняют подсказки в первом обычном матче — по ситуации на поле, по одной за ход: цель, прыжок, шах, пустой бак, эстафета, эликсир, удар, реакция (6.1, D-154; ступени обучения 6.0 сняты).

The first prototype should deliberately omit most content.

## Board

- fixed symmetrical arena;
- visible grid;
- two Base Flasks;
- all cells start Neutral.

## Units

- 3 frogs per player;
- same base jump range;
- simple placeholder stats.

## Elixir

- universal capacity: 3;
- one shared visible sequence;
- independent player pointers;
- Base gives +1 charge per turn;
- 1 activation costs 1 charge.

## Relay

- landing on allied frog continues activation;
- same jump range;
- each ally usable once per activation;
- Relay landing does not alter cell.

## Rotation

- free Recall;
- Recall discards remaining elixir;
- Empty frog cannot activate;
- Empty frog auto-returns after 2 player turns.

## Combat

- basic direct damage;
- basic knockback;
- death returns frog to Base.

## Elements

Start with only two elements if necessary.

Example:

- Fire;
- Ice.

## Reaction

Start with one permanent terrain reaction.

Example:

- Fire + Ice → placeholder persistent obstacle / terrain state.

The first test should answer whether Relay positioning and elixir rotation are already strategically interesting before adding all six reactions.

---

# 41. Prototype Questions

The following values are intentionally not final.

## Team size

Current assumption: 3 frogs.

Test whether:

- 2 is too shallow;
- 3 creates strong Relay structure;
- 4 becomes too hard to read.

## Tank capacity

Current assumption: 3 activations.

Test 2 / 3 / 4.

## Empty return timer

Current assumption: 2 player turns.

Test whether this creates useful temporary Relay windows without clutter.

## Recall frequency

Current suggestion: 1 free Recall per turn.

Test whether unlimited Recall is abusable or unnecessary.

## Map length

Must be long enough that:

> one full-tank frog cannot reach the opponent Base using only ordinary activations.

But a coordinated frog formation should be able to advance efficiently through Relay.

## Cell size

Must be large enough for reaction readability while still allowing meaningful free physical landing inside a cell.

---

# 42. Current Core Rule Summary

> ✎ **Правка 2026-10-13.** Сводка правил после правок 2026-10-13 — таблица в начале документа.

1. Both players begin on identical neutral boards.
2. Victory occurs when any frog reaches the enemy Base Flask.
3. All frogs use the same base jump range.
4. Frogs move freely; terrain effects are resolved on a hidden grid.
5. All terrain-changing reactions are persistent until countered.
6. Only players create elemental territory.
7. Elixir does not limit Relay segments.
8. One frog activation costs one Elixir Charge.
9. Relay occurs only by landing on allied frogs.
10. Each allied frog can be used once per activation.
11. Only the final landing applies the frog's element to the grid.
12. A different element in the final cell creates a deterministic reaction.
13. All frogs have the same universal tank capacity.
14. Frogs recharge automatically on their own Base.
15. Both players use the same public element sequence but progress through it independently.
16. Recall is a free action and discards the frog's remaining elixir.
17. An Empty frog cannot activate, remains temporarily as Relay infrastructure, then automatically returns to Base.
18. Death sends the frog back to Base and empties its tank.
19. Meta progression may improve durability and trait strength, but not jump range or tank capacity.
20. Team Traits remain an important source of frog identity and should modify cooperation rather than basic board geometry.

---

# 43. Intended Player Fantasy

The player should feel like an alchemist commanding a small group of mechanical frogs across a board that is being permanently rewritten by both sides.

A strong turn should feel like:

> "I used my rear frog to launch the front frog farther, landed exactly on the cell I had prepared two turns ago, triggered the reaction that raised a column in his route, and now his next frog cannot reach the position he was building toward."

The game should reward:

- spatial planning;
- reading the shared element sequence;
- positioning allied frogs;
- knowing when to Recall;
- timing aggressive pushes;
- permanent modification of the battlefield;
- using simple slingshot input to produce complex strategic outcomes.
