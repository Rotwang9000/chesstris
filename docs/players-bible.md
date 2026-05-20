# Shaktris - Player's Bible

> Definitive game-rules reference. This is the single source of truth - if the
> code disagrees with this document, the code is wrong.
> Last updated: February 2026.

---

## 1. Overview

Shaktris is a real-time multiplayer game that fuses **Tetris** with **chess** on a
dynamically expanding board. Each player begins with a standard chess set placed
on a small home zone. Players grow their territory by placing tetromino pieces
and use chess tactics to capture enemy pieces and kings.

The default mode is a **single continuous game** - there is no fixed end point.
Players join and leave freely; the world persists.

---

## 2. Board

| Property | Value | Source |
|----------|-------|--------|
| Cell storage | Sparse map keyed `"x,z"` | `BoardManager.createEmptyBoard()` |
| Cell size | 1 unit (cube ≈0.94 rendered) | Client renderer |
| Maximum players | 32 | `Constants.MAX_PLAYERS_PER_GAME` |

The board has no fixed size - it expands automatically whenever new cells are
placed. Boundaries are recalculated from the set of occupied cells.

**Each cell coordinate has exactly one owner at a time.** Home-zone markers and
tetromino content **do not coexist** in the same coordinate - a tetromino
landing on a home cell replaces the home marker (the home marker is preserved
only internally for row-clearing protection logic).

---

## 3. Home Zone

Each player is assigned a home zone when they join.

| Setting | Value |
|---------|-------|
| Width | 8 cells |
| Height (depth) | 2 cells |
| Distance from centre | 8-12 cells (spiral placement) |

### Home zone protection

- Cells inside a **safe home zone** (one that still contains at least one chess
  piece) are **never cleared** by row-clearing.
- Home-zone cells **break** the consecutive-cell count for row clearing - the
  count resets to zero on either side (see section 8).

### Home zone degradation

Home zones now degrade by converting to normal terrain (not by deleting cells):

- **Interval**: after sustained inactivity
  (`HOME_ZONE_DEGRADATION_INTERVAL = 300 000 ms` = 5 minutes, checked
  periodically). The previous 2.5-minute window felt punitive — players
  reported having all their cells stripped while composing a single chat
  message.
- Home markers are converted into normal owned terrain cells.
- Occupied cells are preserved: pieces remain on-board; no timed auto-removal of
  cells just because a piece is standing on them.
- Once converted, those cells are no longer treated as protected "safe home
  zone" cells for row-clearing rules.

---

## 4. Session and Identity

Players are identified by a **session cookie** (`shaktris_player_id`) that
persists across browser reloads. On reconnection the server matches the cookie
to the existing player record and restores their game state. There is a
**5-minute grace period** after disconnect before the player is removed.

- **Terminology**:
  - **World** = the single shared global board (current default mode).
  - **Player Code** = your persistent player identity/session inside that world.
- **Where to find Player Code**: open the **PLAYERS** panel and copy it from the
  **Player Code** field.

- **Exit**: a player may explicitly leave via an "Exit Game" button. This shows
  a warning: *"If you have not stored your player code, you will lose your
  game."* Confirming clears the session cookie.
- **Rejoin**: if the cookie is still set, the player silently rejoins their
  previous game on page load.

### World Persistence

The global game world **survives server restarts**. There is exactly one
authoritative world on the server (`server/world/World.js`), and **all**
gameplay state — board cells, chess pieces, home zones, player records and
AI metadata — lives in that single record. The server saves a snapshot of
it to `data/world.json` every 30 seconds when state has changed and on
graceful shutdown (SIGINT/SIGTERM). On startup the server restores from
this file, re-arms AI tick loops, and reconnects returning players via
their cookies. A backup copy (`world.json.bak`) is kept for safety. A
version-based migration framework allows rule changes to be applied to
saved worlds automatically; the current schema is v2.

Clients can start an animation optimistically the moment a move is made,
but the **server is authoritative** — any local prediction is reconciled
against the next `game_update` event before the animation ends.

---

## 5. Game Start Flow

1. The page loads with the camera in a **neutral overview position**.
2. The player sees a start screen and clicks **"Enter Shared World"**.
3. Their home zone and chess pieces are added to the board.
4. The camera **flies behind their pieces** (drone-style).
5. Once the camera animation completes, the first tetromino piece appears and
   play begins.

---

## 6. Turn Structure

The game world is **real-time** - all players act simultaneously. There are no
strict turns, but the server enforces **cooldowns** to prevent spamming:

| Action | Server cooldown |
|--------|-----------------|
| Chess move | 500 ms (`CHESS_MOVE_COOLDOWN_MS`) |
| Tetromino placement | 800 ms (`TETROMINO_PLACEMENT_COOLDOWN_MS`) |

### Phase flow

After a player places a tetromino, the client transitions to **chess phase**.
If the player has **no valid chess moves**, the client skips straight back to
**tetromino phase** and a new piece appears.

If a tetromino **misses adjacency/path checks**, it falls through and
**dissolves**. If it collides with occupied cells, it still **explodes**.
After failure, the client transitions to **chess phase** if valid chess moves
exist; otherwise a new tetromino is given.

---

## 7. Tetromino Placement

### Shapes

Seven standard shapes: **I, O, T, S, Z, J, L** - each with four rotations
(defined in `Constants.TETROMINO_SHAPES`).

### Placement rules

1. **No overlap** - every cell of the piece must land on an empty coordinate.

2. **Adjacency** - at least one cell of the piece must be **orthogonally
   adjacent** (up/down/left/right — **not** diagonals) to an existing cell
   **owned by the same player**.

3. **Connectivity to king** - for all placements after the first, the adjacent
   owned cell must have a **contiguous path** back to the player's king through
   owned cells (validated by BFS in `IslandManager.hasPathToKing`).

4. **First placement exception** - the very first tetromino may connect to
   any owned cell or to the player's home zone directly.

If a tetromino cannot be placed at Y = 1 (the lowest valid height), the piece
is lost:
- **Missed connection / no king path**: the tetromino falls through and
  dissolves into sand.
- **Collision with occupied cells**: the tetromino explodes.

In UI copy this is treated as a **missed drop** rather than a generic
"invalid". Play proceeds to the **chess phase** if valid chess moves exist;
otherwise a new tetromino is given immediately (see section 6).

---

## 8. Row Clearing

After every tetromino placement the server scans **both axes** of the sparse
board for clearable lines. Home zones spawn in four orientations so a single
fixed axis would be unfair to half the players; clearing along whichever axis
hits the threshold first keeps the game symmetric.

| Rule | Detail |
|------|--------|
| Threshold | **8 consecutive** filled cells along a single z-row (constant z) **or** x-column (constant x) |
| Home cells are empty space | Any cell with a **home marker** counts as **empty space** for the purposes of clearing. It breaks the consecutive count exactly like an empty cell would, and it is never touched by the clear itself. This is true regardless of whether the home zone is "safe" (has a chess piece) or "unsafe" — only a **degraded** home zone (which has lost its home markers and now carries `home_converted` tetromino terrain) drops out of this rule. Cells on opposite sides of a home zone therefore have their runs counted independently. |
| What counts as "filled" | A cell with at least one item that isn't a home / specialMarker / boardCentre marker. |
| What is removed | Every non-home, non-chess item in the cleared segment (tetromino terrain, `home_converted` cells, etc.). Board-centre markers and chess markers are preserved. |
| Chess pieces on cleared cells | The cell is shielded entirely during the clear — the player keeps the chess marker, the underlying tetromino terrain under the piece, **and** the cell itself. The piece may now be sitting on an island, in which case its fate is decided by **island decay** (next section), not by the row clear itself. The grace window for stranded territory is **move-based** (see §10 below) — the player gets several of their own moves to bridge back. |
| Phantom-clear protection | A candidate line is only reported as cleared if applying the clear actually modifies at least one cell. A line whose entire run is chess-protected, for example, won't broadcast a "Line cleared!" toast even if it technically meets the threshold. |

### Pre-clear flash + cascade animation

Clearing is no longer instantaneous. The server batches the destructive
step behind a short animation so players can see what is about to
disappear:

1. After a tetromino placement, the server finds every cell that
   *would* be cleared (chess / home cells are filtered out — they're
   preserved).
2. The server broadcasts `cells_clearing` with that cell list and a
   `durationMs` (currently **700 ms**). Clients render a pulsing
   yellow flash on each cell.
3. After the flash, the server applies the clear, runs gravity,
   broadcasts a `game_update`, and emits the usual `row_cleared` toast.
4. Gravity may have created a brand-new clearable line — a **cascade**.
   The server goes back to step 1 and flashes again before clearing
   the next wave. The cascade is capped at 16 iterations as a safety
   net.

The `row_cleared` payload now carries an `iteration` field (0 for the
first clear, 1 for the next link in the cascade, etc.) so the UI can
suffix the toast with "chain ×N" for chained clears.

### After a line is cleared

1. **Gravity towards king (single-owner, Tetris-style)** — every cell on the
   far side of the gap (relative to its owner's king) shifts one step
   towards the gap, **along the axis of the cleared line**. Z gravity
   for z-row clears, X gravity for x-column clears. The rules below
   define what "owner" means for gravity purposes.
2. **Island decay** — any group of cells that is no longer connected to its
   player's king is removed, along with chess pieces sitting on those cells
   (see §10 Island Decay below).

If a single tetromino placement completes multiple lines (in either axis
or both), all qualifying segments are cleared simultaneously; gravity
runs **once** at the end of the clear pass, processing both axes in
lock-step so a corner clear (row + column at the same tick) doesn't
double-process a cell.

#### What does "single owner" mean for gravity?

The engine asks `cells.gravityAnchor(items)` for every non-cleared cell
and only moves the cell when the answer is "yes". The rules:

| Cell contents | Moves? | Owner used |
|---|---|---|
| Cell with terrain owned by exactly one player (and no chess piece) | Yes — the gravity train pulls every single-owner cell. | That player. |
| Cell with a **chess piece** | Only if the cell is **directly adjacent** to a cleared row/col, **or** there's an unbroken 4-connected chain of single-owner cells of the same player linking it back to the clear. See below. | The piece's player. |
| Cell with terrain owned by **two or more** players | **No** — the engine refuses to guess which king to pull it towards. The cell stays put until ownership is resolved (typically by a chess capture). | n/a |
| Cell with **only a home marker** and nothing else | **No** — the home overlay is anchored to its spawn coordinates. | n/a |
| Empty cell | n/a | n/a |

A cell sitting *on* a cleared line is already accounted for by the clear
itself (it was either stripped or protected by home/chess), so it never
moves during gravity.

#### The chess-piece connectivity rule

Single-owner terrain is dragged towards the king en masse — that's the
Tetris bit. Chess pieces are special: they only ride along if the
player can be said to be "carrying" them by their own territory. The
engine runs a BFS, per player, with these inputs:

- **Seeds**: every single-owner or chess cell of the player whose
  orthogonal neighbour was on a cleared line. (A cell at z=N+1 is a
  seed for a clear at z=N.)
- **Edges**: 4-connected neighbours that are also single-owner or
  chess cells of the same player.
- **Sinks**: chess cells. Reaching one marks it as "eligible to move",
  but the BFS doesn't propagate further through it — the linking chain
  has to be made of single-owner terrain. (Two chess pieces touching
  each other don't pass eligibility along; each needs its own chain.)

If the chess cell wasn't reached by the BFS — because the chain was
broken by a mixed-owner cell, an enemy cell, an empty cell, or simply
because the piece is too far from the clear — it stays where it is.
Stranded pieces will be picked up by **island decay** (§10) on a later
tick if the disconnect persists.

---

## 9. Chess Pieces

### Starting set per player

Standard chess set arranged on the home zone:

| Back rank (z = 0 of home) | Rook, Knight, Bishop, Queen, **King**, Bishop, Knight, Rook |
|---|---|
| Front rank (z = 1 of home) | 8 Pawns |

### Movement rules

All standard chess movement rules apply, with these Shaktris-specific
conditions:

- Pieces can **only move to cells that exist** on the board (i.e. coordinates
  that contain at least one cell-content entry). Empty space is not traversable.
- Path obstruction checks only consider **other chess pieces**, not cell
  contents like tetrominos.
- When a piece moves, **only the chess entry is removed** from the source cell.
  The underlying tetromino or home-zone content is preserved.
- When a piece arrives at a cell, its chess entry is **appended** alongside
  existing content.
- **Cell ownership transfer** - when a chess piece moves to a cell containing
  enemy tetromino content, that content's ownership transfers to the mover.
  Home-zone markers are **never** transferred. After transfer, island
  detection runs on the previous owner — this can disconnect and destroy
  their territory. This is a key strategic mechanic: moving pieces onto enemy
  cells claims them for your empire.
- **Moving into check is permitted.** There is no check/checkmate concept in
  Shaktris - only king capture. Moving your king into danger is legal but
  unwise.

### Castling

Standard castling rules apply:

- Neither the king nor the participating rook has previously moved.
- All cells between the king and rook must exist on the board and be free of
  chess pieces.
- The king moves **2 squares** towards the rook; the rook moves to the square
  the king crossed over.
- Castling works along any axis (orientation-dependent), not just horizontally.

### Pawn specifics

- **First move**: pawns that have not yet moved (`hasMoved === false`) may
  advance one **or** two squares forward (orientation-aware).
- **Diagonal capture**: pawns capture one square diagonally forward.
- **Direction**: determined by the player's `orientation` field (0-3), which
  maps to a forward vector via `[{0,1}, {1,0}, {0,-1}, {-1,0}]`.

### Pawn detonation (voluntary)

A player may choose to **detonate** one of their own pawns as a deliberate
tactical action. The pawn is destroyed and island detection runs immediately
afterwards.

The detonated coordinate is destroyed entirely (all content at that cell is
removed), including home-marked cells.

If a player has **only their king left**, they may detonate that king as a
final self-destruct. This removes all of that player's remaining territory
from farthest-to-nearest relative to the king, ending that player's run.
The visual detonation is staggered by distance layer (farthest cells first),
with a short pause between each layer so the collapse moves inward visibly.

This allows players to create gaps in enemy territory: if the detonated cell
was a bridge between two sections of an opponent's land, the disconnected
section (and any pieces on it) will be removed by island decay.

| Detail | Value |
|--------|-------|
| Socket event | `detonate_pawn` with `{ pieceId }` |
| Cost | The pawn is permanently lost |
| Effect | Cell destroyed + full island detection (or full self-destruct for last king) |

Frontend presentation:
- The pawn enters a Lemmings-style countdown (`5..1`, then `"Oh no!"`) before detonation.
- A **Cancel Detonation** button is available during the countdown; cancelling aborts the action.

### Pawn promotion

When a pawn has moved **9 squares forward** from its starting position, the
player is offered a choice to promote it to a **Queen, Rook, Bishop, or
Knight**. (The constant `PAWN_PROMOTION_DISTANCE = 9` governs this.) If no
choice is made within 15 seconds, the pawn auto-promotes to Queen.

### King capture and consequences

Capturing an opponent's king triggers a dramatic sequence:

1. The frontend pauses briefly with a **"king battle" overlay** announcing the
   victor and the defeated.
2. All of the defeated player's **non-pawn chess pieces** transfer ownership to
   the capturing player.
3. The defeated player's **pawns become suicidal** - after a 3-second delay,
   they self-destruct one by one (every 0.5s), each destroying the cell it
   sits on. This is the "Lemmings mechanic" and will typically create islands
   of disconnected territory.
4. After all suicidal pawns have detonated, **island decay** runs, removing
   any cells and pieces no longer connected to the captor's king.
5. All of the defeated player's **remaining territory** transfers to the captor.
6. The **captured king is sent to prison** - it is removed from play entirely.
   The captor's stats track their captured kings.
7. The captor may **adopt the defeated player's colour and style** as a trophy.
8. The defeated player is removed from the game.

### Simultaneous king captures — "King's Duel"

If two players capture each other's kings within 1 second
(`SIMULTANEOUS_CAPTURE_WINDOW_MS`), neither capture is resolved immediately.
Instead, both players enter a **King's Duel** mini-game:

1. Both duelling players see a **4×2 grid** (8 cells).
2. Each player secretly **hides a knight** on one cell.
3. Each player then **guesses** which cell their opponent chose.
4. If **exactly one** player guesses correctly, that player wins the duel.
5. If both guess correctly, or neither does, it is a **draw** — both players
   see the reveal and then **re-hide their knights** for another round.
6. The duel repeats until there is a decisive winner (exactly one correct
   guess) or until `KING_DUEL_MAX_ROUNDS` (5) rounds are exhausted, at which
   point the server picks a winner at random.
7. Each round has a **10-second time limit** (`KING_DUEL_TIMEOUT_MS`). If a
   player does not respond in time, a random placement and guess are assigned.

The winning player's original king capture proceeds as normal (transfer,
suicidal pawns, etc.). The losing player's capture is voided.

All other players in the game see a spectator notification that a King's Duel
is in progress.

### One king rule

Each player has exactly one king at all times. Kings cannot be purchased.
A player whose king is captured is eliminated (their pieces and territory
transfer to the captor as described above).

---

## 10. Island Decay (Disconnection)

After any row clear, tetromino placement, chess move, or pawn detonation, the
server runs island detection:

1. A BFS groups all cells by player into **islands** (connected components using
   **4-directional orthogonal adjacency only** — up, down, left, right).
   Diagonal links do **not** count as connected.
2. An island that **does not contain its player's king** is considered
   **disconnected**.
3. Disconnected islands enter a **grace window** during which the cells are
   visibly "decaying" (red emissive ring, lower opacity) but still functional.
   The grace is **move-based** with a wall-clock backstop:

   | Trigger | Terrain-only island | Piece-bearing island |
   |---|---|---|
   | Owning-player moves since disconnection | **6** | **12** |
   | Wall-clock backstop (AFK players) | **10 minutes** | **20 minutes** |

   A move is one tetromino placement *or* one chess move (the
   "Skip chess move" button also counts as a move so a player can't
   freeze the timer by repeatedly skipping). The island decays as soon
   as **either** threshold is hit. The move-based rule is the primary
   trigger so an actively playing opponent can't hoard stranded
   territory by simply running the clock out; the time backstop catches
   AFK players whose move counter never advances.

4. The server emits `island_at_risk` warnings to the affected player as
   either counter ticks down:
   - Move-based: at **3 / 2 / 1** moves remaining (one toast per
     threshold).
   - Time-based: at **120 s / 60 s / 30 s / 10 s** remaining.

   Whichever trigger fires first is shown; the toast wording tells the
   player whether they're being chased by the move counter or the wall
   clock.
5. When the grace expires, the cells are removed and any chess pieces standing
   on them are removed too.

This prevents orphaned territory from persisting after row clears, captures, or
strategic disconnection attacks **without** punishing players who are
momentarily distracted (writing a chat message, switching tabs, etc.).

---

## 11. AI Opponents

AI opponents are managed by `ComputerPlayerManager`. They alternate between
tetromino placement and chess moves with difficulty-based intervals:

| Difficulty | Move interval |
|------------|--------------|
| Easy | 15 s |
| Medium | 10 s |
| Hard | 5 s |

AI logic:
- **Tetromino**: attempts strategic placement adjacent to owned territory,
  preferring positions that extend towards opponents.
- **Chess**: generates all legal moves for its pieces, shuffles them, and picks
  a random valid one. It prioritises captures when available.

---

## 12. Scoring

| Event | Points |
|-------|--------|
| Tetromino placement | Base points for cells placed |
| Row clearing | Bonus per cleared row |
| Chess capture | Varies by piece value (Pawn < Knight = Bishop = Rook < Queen) |
| King capture | Large bonus + inherited pieces count towards score |

---

## 13. Piece Prices (Purchasable Reinforcements)

| Piece | Cost (SOL) |
|-------|-----------|
| Pawn | 0.1 |
| Rook | 0.5 |
| Knight | 0.5 |
| Bishop | 0.5 |
| Queen | 1.0 |
| King | Not purchasable |

### Placement rules for purchased pieces

- The piece must be placed on an **owned cell** that has a path to the player's
  king (adjacency + connectivity, same as tetromino adjacency rule 3).
- The target cell must not already contain another chess piece.
- No piece may be placed inside an opponent's safe home zone.

---

## 14. Piece Styles and the Piece Designer

### Player styles

Each player's chess pieces are rendered with a **personal style** (colour,
material, shape variations). Currently all players receive the default
Russian-inspired style from `chessPieceCreator.js`.

A **Piece Designer** (not yet implemented) will allow players to create and
save custom piece styles. These styles can be sold or traded via the
marketplace.

### Captured styles

When a player captures another's king, they **inherit all of the defeated
player's unlocked styles** (stored in `capturedStyles[]`). The captor may then
switch to any inherited style at will — displaying a vanquished opponent's
colours is a trophy of conquest.

> **Implementation status:** The server tracks `capturedStyles` on each player
> object. The client-side Piece Designer and style-switching UI are planned but
> not yet built. `public/utils/marketplace.js` contains the placeholder API.

---

## 15. Edge Cases and Special Rules

1. **Stalemate prevention** - if a player has no valid chess moves and their
   tetromino explodes, they are given a new tetromino immediately rather than
   being stuck.
2. **Disconnected pieces after row clear** - chess pieces on cells that lose
   their path to the king are removed along with the cells (island decay).
3. **Home zone overlap by enemy** - an opponent's tetromino cannot be placed on
   cells within a safe home zone.
4. **Multiple line clears** - if a single tetromino placement completes
   multiple lines (in either axis or both), all qualifying lines are cleared
   simultaneously. Gravity and island decay run **once** after every clear
   has been resolved.
5. **Self-isolation** - if a player's own tetromino placement disconnects some
   of their territory from their king, those cells are removed (island decay
   is not limited to row clears).
6. **No en passant** - this chess rule is intentionally omitted due to the
   complexity of tracking it on a dynamically expanding, real-time board.
7. **Orthogonal-only connectivity** - diagonal adjacency does **not** count
   for island connectivity or tetromino placement. All connections must be
   up/down/left/right. This makes territory easier to disconnect and rewards
   solid, compact building.
8. **Cell ownership transfer** - moving a chess piece onto enemy territory
   claims it. Combined with orthogonal-only connectivity, a single chess move
   can sever and destroy large sections of opponent territory.
9. **Lone-king support** - if a player is reduced to only a king, the server
   guarantees that king still has a board cell beneath it.
   - **AI bots** automatically detonate their king (Lemmings-style — cells
     explode in rings, furthest-from-king first) and respawn after a 5 s
     delay. All connected players see the explosion sequence.
   - **Human players** can voluntarily detonate via the king-detonation
     button; the same lemming-style animation plays for everyone.

---

## 16. Key Constants Quick-Reference

```
REQUIRED_CELLS_FOR_ROW_CLEARING     = 8
PAWN_PROMOTION_DISTANCE             = 9
HOME_ZONE_WIDTH                     = 8
HOME_ZONE_HEIGHT                    = 2
HOME_ZONE_DISTANCE                  = 16     (pawn-clash spacing)
HOME_ZONE_DEGRADATION_INTERVAL      = 150 000 ms (2.5 min)
MAX_PLAYERS_PER_GAME                = 32
CHESS_MOVE_COOLDOWN_MS              = 500
TETROMINO_PLACEMENT_COOLDOWN_MS     = 800
AUTO_QUEEN_TIMEOUT_MS               = 15 000
SUICIDAL_PAWN_DELAY_MS              = 3 000
SUICIDAL_PAWN_INTERVAL_MS           = 500
SIMULTANEOUS_CAPTURE_WINDOW_MS      = 1 000
KING_DUEL_TIMEOUT_MS                = 10 000
KING_DUEL_GRID_COLS                 = 4
KING_DUEL_GRID_ROWS                 = 2
KING_DUEL_MAX_ROUNDS                = 5
```

---

## 17. Visual Themes

Players can seamlessly cycle between visual themes via the **Mode** button
(bottom-left). Theme choice is saved in `localStorage` and persists across
sessions. All themes render the same game state — they are purely cosmetic.

| Theme | Description |
|-------|-------------|
| **Normal** | Rich daylight scene, detailed Russian-styled 3D pieces, cream/sage board, clouds. |
| **Cute** | 8-bit space theme, pixelated rendering, starfield, bright arcade lighting. Chess pieces as blocky voxel-style shapes with dark outlines, each type in a unique arcade colour. |
| **Retro** | 1980s CRT terminal. Black background, green phosphor (local) / amber (opponents). Chess pieces as letter sprites on glowing discs (K/Q/R/B/N/P). Scanline overlay. |

---

## 18. Game Modes

The primary mode is a **continuous open world** - no fixed end condition. Future
modes include:

1. **Timed** - fixed-duration matches; highest score wins.
2. **Survival** - speed increases over time.
3. **Arena** - small 1v1 or 2v2 games with king capture as the win condition.
