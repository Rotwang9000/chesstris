# Battle Mode — design (v1)

Owner brief (July 2026): *2–4 players. Opponents can be computer, or share a
link/code to invite. Home cells a fixed distance apart and the play zone
limited — 2 players face each other, 4 players each at 90°. 8 cells apart,
ring around is diameter 32 cells. The ring is made of cells which can be
used by anyone, but as it is a circle it will stop long-distance travel.*

## Decision: arenas inside the shared world, not a multi-world refactor

Two options were assessed against the current architecture (see the
single-world audit summarised below):

1. **True multi-world** — promote `World.js` to `Map<worldId, WorldState>`.
   Touches ~55 `World.getWorld()` call sites, every lifecycle sweep, the
   broadcaster, persistence and the AI runner. Weeks of work, high
   regression risk to the live game.
2. **Battle arenas as remote regions of the existing world** — the board is
   already a sparse, unbounded `${x},${z}` map. An arena is just a circle
   of pre-built cells placed far from the organic cluster, plus a small
   registry and a handful of scoped rules.

**v1 ships option 2.** Everything (broadcast, persistence, chess movement,
line clears, elimination, AI) keeps working because it *is* the same world.
If battles take off, the registry gives us the seam to split worlds later.

Key architecture facts this leans on:

- Chess pieces can only move across **existing cells**; empty space blocks
  sliding moves and castling (`server/game/chess/moveValidation.js`). So a
  circular arena is naturally self-contained: there are no cells leading
  out, and the ring's curvature prevents long straight rook/bishop runs —
  exactly the owner's intent.
- Tetromino placement needs adjacency to own live content plus
  path-to-king (`TetrominoManager.validateTetrominoPlacement`,
  `IslandManager.hasPathToKing`).
- Home zones are 8×2 with 16 pieces, created by
  `ChessManager.initializeChessPieces(game, playerId, homeZone)` — reusable
  with explicit rects/orientations.
- AI (`server/ai/runner.js`) anchors its placements on the AI's own cells,
  so a bot seated in an arena stays in the arena for free.

## Geometry

All battle constants live in `server/battle/constants.js` (new).

- `RING_DIAMETER = 32` → ring radius 16 from arena centre.
- `HOME_SEPARATION = 8` — gap between opposing home-zone front rows.
- Arena centre `C = (cx, cz)`. The **ring** is the set of cells at integer
  coordinates with `round(dist(C)) == 16` (a 1-cell-thick rasterised
  circle, ~100 cells). Ring cells are `type: 'tetromino'` with
  `battleRing: <battleId>` and **no owner**.
- **Seats** (front rows face the centre, standard 8×2 zones):
  - 2 players: north seat and south seat, front rows at `cz - 4` and
    `cz + 4` (8 apart), zones centred on `cx`.
  - 3–4 players: seats at N, E, S, W — front rows 4 cells from centre
    along their axis, each zone rotated to face the centre (orientations
    0–3 as used by `boardGenerator.js`).
- **Arena bounds**: a cell is "inside" the arena when
  `dist(C) <= 16`. Battle participants may only place tetrominoes fully
  inside their own arena; everyone else is rejected from placing inside
  any arena.
- **Arena allocation in world space**: arenas sit on a lattice far from
  the organic cluster: arena *i* at
  `(ARENA_FIELD_X + (i % 8) * ARENA_PITCH, ARENA_FIELD_Z + floor(i / 8) * ARENA_PITCH)`
  with `ARENA_FIELD = (1200, 1200)` and `ARENA_PITCH = 96`. The organic
  world lives within a couple of hundred cells of the origin and gravity
  pulls it inward, so no practical collision. Slots are reused once a
  battle is cleaned up.

## Rules deltas (all scoped to battle participants)

1. **Placement bounds** — in `validateTetrominoPlacement`: if the acting
   player is seated in an active battle, every shape cell must be inside
   their arena (reason `outside_arena`); if not seated, no shape cell may
   fall inside any active arena (reason `arena_reserved`).
2. **Ring is shared ground** — for adjacency and path-to-king only, a ring
   cell of the player's own arena counts as friendly: it can anchor a
   placement and the king-path BFS may traverse it. Implemented as an
   ownership predicate hook shared by `TetrominoManager.hasAdjacentCell`
   and `IslandManager.hasPathToKing`. Chess movement needs no change
   (any existing cell is already walkable), which is what makes the ring
   "usable by anyone".
3. **Sweeps keep out** — players with an active `battleId`:
   - skipped by world gravity (`server/world/gravity.js`),
   - skipped by home-zone degradation (`server/world/homeZones.js`),
   - skipped by the ghost-player sweep while the battle is live,
   - not used as anchors by `boardGenerator.calculateHomePosition`
     (otherwise remote arenas would drag the spawn centroid),
   - not targeted by power-up orb spawns (v1: keep orbs out of arenas).
4. **Line clears** work unchanged inside arenas (8 consecutive cells,
   `REQUIRED_CELLS_FOR_ROW_CLEARING`), but see the performance note below.
   **Ring cells are line-clear blockers** (like home markers): near the
   circle's poles the raster produces 8+ collinear ring cells, which the
   clearer would otherwise treat as a full line and delete on the first
   cascade. They also never settle/move and are excluded from island
   decay (ownerless).
5. **Ring connectivity** — the ring is rasterised as an annulus ~1.5
   cells wide (`|hypot(dx,dz) − 16| ≤ 0.75`) so it stays 4-connected;
   kings/pawns can walk it and the path-to-king BFS can traverse it.

## Seats and identity

A battle seat gets its **own player record** (`battle_<code>_s<n>`), so a
player's main-world kingdom is untouched while they fight. The socket stays
bound to the human's real id; gameplay handlers resolve an *effective id*:

- `BattleManager.effectivePlayerId(realId)` → seat id while the player is
  seated in an active battle, else the real id.
- Resolved at the top of the tetromino and chess socket handlers (and the
  AI runner needs nothing — bots are registered directly under seat ids).
- The `battle_join`/`battle_create` acks return `seatPlayerId`; the client
  adopts it as `gameState.localPlayerId` so ownership colouring, ghost
  validation and "focus my king" all work inside the arena.
- Seat records carry `battleId`, `controlledBy: <realId>`, and the human's
  display name with a `⚔` prefix so the player bar reads sensibly.

When the battle ends, the mapping clears: the human's next placement acts
on their main kingdom again. Seat records lose `battleId` (so normal decay
reclaims the arena) and eliminated seats behave like any eliminated player.

## Lifecycle

```
battle_create {seats: 2|3|4, name}   → {code, battleId, seatPlayerId}
battle_join   {code}                 → {battleId, seatPlayerId, seatsLeft}
battle_start  {battleId}             → fills empty seats with AI, status: active
battle_state  {code?}                → snapshot for lobby UI
```

- Codes come from `generateGameKey()` (6 chars, unambiguous alphabet),
  stored in the registry (`world.battles[battleId]`), share link
  `https://tetches.com/?battle=CODE`.
- `status: 'lobby' → 'active' → 'finished'`.
- Creating seats the creator immediately; the arena (ring + all home
  zones) is built at **start**, not create, so lobby abandonment costs
  nothing.
- Auto-start when the last seat fills; the creator can start early and
  empty seats are filled with `registerAi`-spawned bots seated under seat
  ids (difficulty `normal`).
- **Win**: on each seat elimination, if ≤1 seat remains alive the battle
  becomes `finished`, winner broadcast (`battle_finished` + toast), the
  effective-id mappings drop, and a cleanup pass converts the ring cells
  of that arena to normal unowned decay-eligible cells (they'll be swept
  by island decay as ownerless remnants — v1 simply deletes them).
- **Abandonment**: battles idle in lobby > 30 min, or active > 24 h, are
  cleaned up by a slow sweep (delete ring cells, remove seat records via
  the normal removal path, free the lattice slot).
- Registry persists inside the world snapshot (`world.battles`), so
  restarts keep live battles.

## Performance prerequisite: line-scan by occupied cells

`BoardManager._findClearableLines` currently scans the **bounding box**
(`minX..maxX × minZ..maxZ`). An arena at (1200, 1200) inflates the box to
~1300² ≈ 1.7M cell probes per axis per cascade iteration — unacceptable.

Fix (independent win): derive per-line occupancy from `Object.keys(cells)`
— group occupied coordinates by row/column, sort, and detect runs of ≥8
*consecutive* coordinates that pass the existing clearable/blocker
predicates. Empty cells break runs by coordinate gap, so behaviour is
identical; cost becomes O(occupied · log occupied) regardless of world
spread. Covered by an equivalence test against the old implementation's
results on the same boards.

(`settleCellsDownward` and friends operate on the cleared runs, not the
bounding box, so they need no change.)

## Client v1

- Welcome modal: secondary button **⚔ Battle a friend** under PLAY NOW →
  dialog: *Create* (seat count 2/3/4; "fill empty seats with bots" on by
  default) or *Join with code*.
- Create shows the code + copyable invite link, live seat count, and a
  START button (enabled once ≥2 seats total incl. bots).
- `?battle=CODE` on page load short-circuits the welcome modal into the
  join flow (name prompt still applies).
- On battle start: adopt `seatPlayerId`, point the camera at the arena
  centre, normal HUD otherwise. Losing/winning shows the standard
  game-over overlay plus a "back to the shared world" reload button.

## Out of scope for v1 (later)

- Best-of-N rematches, scoreboards, spectating a battle by code.
- Battle-specific tuning (faster cooldowns, no power-ups toggle).
- True multi-world split (this registry is the seam if/when needed).
- Duels integration (`server/king/duels.js`) inside arenas.

## As shipped (July 2026) — deltas from the plan above

Implementation lives in `server/battle/{geometry,rules,BattleManager}.js`,
`server/sockets/battle.js`, `public/js/battle/{battleMode,battleRules}.js`;
tests in `tests/server/battleMode.test.js`. Changes made while building:

- Constants live in **`geometry.js`**, not a separate `constants.js`.
- **Arena field moved to `(2000, 2000)`, pitch 64** (was 1200/96): a
  clean band of separation from the organic world (region threshold
  1500 used by the camera/boat exclusions) while still small enough for
  client float precision. 8 columns × 8 rows = 64 slots, reused after
  cleanup.
- **Ring raster**: rounded radial bands 15–16 (2 cells thick) instead of
  the `|dist − 16| ≤ 0.75` annulus. One shared `radialBand()` classifier
  tiles the plane exactly — play ≤14, ring 15–16, outside ≥17 — so there
  is no dead band where a cell is neither buildable nor wall (the naive
  mix of `sqrt` and `round` checks had exactly that bug at the
  diagonals).
- **Seat ids** are `battle-<code>-s<n>` (lowercased code, hyphens).
- **Effective id** is resolved per-event via `ctx.resolveActingPlayerId()`
  in the tetromino/chess handlers, and `Sessions.js` gained
  seat→human **aliases** so seat-scoped emits reach the controlling
  socket. The create/join acks return the seat id but the client swaps
  identity only on `battle_started`.
- **No auto-start** when the last seat fills — the host presses Start
  (with any mix of humans and bots). Easy follow-up if wanted.
- **Timeouts**: lobby 15 min (was 30), active cap 2 h (was 24 h),
  finished battles linger 60 s then are fully cleaned (ring deleted
  outright — no decay hand-off).
- Extra sweep exemptions found during integration: boat steering
  (`getWorldCentre`/`getOccupiedCells` in `bootstrap.js`),
  `GameUtilities.findHomeZonePosition` living-zone count, AI
  self-detonation/respawn/roster-trim, plus an orphan-seat GC in the
  battle sweep for registry/record mismatches after bad shutdowns.
- Client camera: overview framing filters by region (arena vs organic)
  rather than pointing at the arena centre; `flyToPlayerKing` retries
  while the freshly built arena board is still streaming in.
