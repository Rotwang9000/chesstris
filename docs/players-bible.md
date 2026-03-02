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
| Cell size | 1 unit (cube 0.94 rendered) | `Constants.DEFAULT_CELL_SIZE` |
| Maximum players | 2 048 | `Constants.MAX_PLAYERS_PER_GAME` |

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
  (`HOME_ZONE_DEGRADATION_INTERVAL = 150 000 ms`, checked periodically).
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

The global game world **survives server restarts**. The server saves a snapshot
of the entire world (board cells, chess pieces, player data, AI state) to
`data/world.json` every 30 seconds when state has changed and on graceful
shutdown (SIGINT/SIGTERM). On startup the server restores from this file,
re-registers AI opponents, and reconnects returning players via their cookies.
A backup copy (`world.json.bak`) is kept for safety. A version-based migration
framework allows rule changes to be applied to saved worlds automatically.

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

After every tetromino placement the server checks all z-rows.

| Rule | Detail |
|------|--------|
| Threshold | **8 consecutive** filled cells in a single z-row |
| Home-zone handling | Safe home-zone cells **break** the consecutive count - the count **resets to zero** at each home cell. Cells on opposite sides of a home zone are counted independently. |
| What is removed | All non-home cell content in the cleared row. Home-zone markers are preserved. |

### After a row is cleared

1. **Gravity towards king** - cells on the far side of the gap (relative to
   each cell's owner's king) shift one step towards the gap.
2. **Island decay** - any group of cells that is no longer connected to its
   player's king is removed, along with chess pieces sitting on those cells
   (see section 10 Island Decay below).

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
3. All disconnected island cells belonging to that player are removed, and any
   chess pieces sitting on those cells are also removed.

This prevents orphaned territory from persisting after row clears, captures, or
strategic disconnection attacks.

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
4. **Multiple row clears** - if a single tetromino placement completes multiple
   rows, all qualifying rows are cleared simultaneously. Gravity and island
   decay run once after all rows are processed.
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
   guarantees that king still has a board cell beneath it. If that player then
   chooses king self-destruct, all of their remaining cells collapse and are
   removed.

---

## 16. Key Constants Quick-Reference

```
REQUIRED_CELLS_FOR_ROW_CLEARING     = 8
PAWN_PROMOTION_DISTANCE             = 9
HOME_ZONE_WIDTH                     = 8
HOME_ZONE_HEIGHT                    = 2
HOME_ZONE_DEGRADATION_INTERVAL      = 150 000 ms (2.5 min)
CHESS_MOVE_COOLDOWN_MS              = 500
TETROMINO_PLACEMENT_COOLDOWN_MS     = 800
SUICIDAL_PAWN_DELAY_MS              = 3 000
SIMULTANEOUS_CAPTURE_WINDOW_MS      = 1 000
KING_CAPTURE_GRACE_MOVES            = 1
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
