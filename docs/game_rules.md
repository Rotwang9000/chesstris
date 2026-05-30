# Tetches Game Rules — Short Summary

> **Definitive reference:** `docs/players-bible.md`. This file is a quick
> tabular summary. Whenever they disagree, the bible is authoritative.

## Overview

Tetches is a real-time multiplayer fusion of chess and Tetris on a
dynamically expanding board. Each player starts with a standard chess set on
an 8×2 home zone. Place tetrominoes to grow territory; move chess pieces to
capture enemies and their kings.

The default mode is a **single continuous shared world** that persists across
server restarts.

## Core mechanics

### Tetromino placement
1. Seven standard shapes (I, O, T, S, Z, J, L), each with four rotations.
2. **No overlap** — every cell of the piece must land on an empty coordinate.
3. **Adjacency** — at least one cell must be **orthogonally adjacent**
   (up/down/left/right; **no** diagonals) to an existing cell owned by the
   same player.
4. **Connectivity to king** — the adjacent owned cell must have a contiguous
   path back to the player's king (BFS, orthogonal-only). The very first
   placement of each player is exempt.
5. If a tetromino cannot be placed it is lost — explode on collision,
   dissolve on missed connection. Play proceeds to chess phase if valid
   moves exist; otherwise a new tetromino is issued immediately.

### Tetromino generation

Each player has their own **7-bag**: a shuffled bag containing one of each
shape is consumed before being refilled and reshuffled. This guarantees fair
piece distribution (no long droughts of a single shape).

### Chess movement
1. Standard chess movement rules apply.
2. Pieces can **only move to cells that exist** on the board. Empty space is
   not traversable.
3. Path obstruction checks only consider other chess pieces, **not** cell
   content like tetrominoes.
4. When a piece moves the underlying cell content is preserved at the source
   and the chess marker is appended at the destination.
5. **Cell ownership transfer** — landing on an enemy cell claims its non-home
   content for the mover; island decay then runs on the previous owner.
6. **Check (king-capture grace)** — a move that would capture a king is
   deferred; the defender gets one timed escape move (20 s) before the capture
   auto-resolves. The same attacker only grants this grace twice; the third
   attack takes the king directly. No classical checkmate.
7. **No en passant**.

### Pawn specifics
- First move may advance one or two squares forward (orientation-aware).
- Diagonal capture one square forward.
- **Promotion** at `PAWN_PROMOTION_DISTANCE = 8` squares net forward distance:
  the pawn **freezes in place** and its cell becomes home-like (cannot be
  cleared or decayed). Clicking it opens a deployment dialog to swap it for a
  Queen / Rook / Bishop / Knight from your **captured basket** (you must have
  captured that piece type). Deploying is optional and can be deferred
  indefinitely; the pawn stays frozen until promoted or captured.

### Castling
Standard rules: neither king nor rook has moved; all cells between them exist
and are free of chess pieces. The king moves two squares towards the rook;
the rook jumps to the square the king crossed. Works along any axis according
to the player's orientation.

### Turn cadence

Real-time. The server enforces per-action cooldowns:

| Action | Cooldown |
|--------|---------:|
| Chess move | 500 ms |
| Tetromino placement | 800 ms |

After placing a tetromino the client transitions to chess phase. If the
player has no valid chess moves, the server skips straight back to tetromino
phase.

## Row clearing

After every tetromino placement the server scans **both** axes for clearable
lines.

| Rule | Detail |
|------|--------|
| Threshold | 8 consecutive filled cells in one axis (X-row or Z-row) |
| Home-zone handling | Safe home-zone cells (still containing at least one chess piece) **break** the consecutive count — it resets to zero. Cells on either side of a home zone are counted independently. |
| What is removed | All non-home cell content in the cleared segment. Home markers stay put. |

After a clear:
1. **Gravity towards king** — cells on the far side of the gap shift towards
   the gap (axis matches the cleared line's axis).
2. **Island decay** — disconnected groups (no orthogonal path to king) are
   removed, taking any chess pieces with them.

## King capture

Capturing an opponent's king:
1. Non-pawn pieces transfer to the captor.
2. The defeated player's pawns become **suicidal** — after a 3 s pause they
   self-destruct one every 0.5 s, each destroying its cell.
3. Island decay runs after all pawns detonate.
4. Remaining territory transfers to the captor.
5. The captured king is sent to prison; the defeated player is eliminated.

### Simultaneous capture — "King's Duel"

If two players capture each other's kings within 1 s a knight hide-and-seek
mini-game decides the winner: each player hides a knight on a 4×2 grid, then
guesses the opponent's cell. Up to 5 rounds, 10 s per round.

## Home zone

| Setting | Value |
|---------|------:|
| Width | 8 cells |
| Height | 2 cells |
| Distance from centre | 8–12 cells (spiral placement, 4 orientations) |
| Degradation interval (idle) | 2.5 min |

Safe home-zone cells are never cleared by row clearing. After degradation
the markers convert to normal owned terrain (cells and pieces are preserved).

## Island decay

After any row clear, tetromino placement, chess move, or pawn detonation a
BFS groups each player's cells into orthogonally connected islands. Any
island without its player's king is removed, along with the chess pieces
sitting on it.

## AI opponents

| Difficulty | Move interval |
|------------|--------------:|
| Easy | 15 s |
| Medium | 10 s |
| Hard | 5 s |

## Piece prices (purchasable reinforcements)

| Piece | Cost (SOL) |
|-------|-----------:|
| Pawn | 0.1 |
| Rook | 0.5 |
| Knight | 0.5 |
| Bishop | 0.5 |
| Queen | 1.0 |
| King | Not purchasable |

A purchased piece must land on an owned cell with a path to the king and not
inside an opponent's safe home zone.

## Visual themes

| Theme | Look |
|-------|------|
| Normal | Daylight, Russian-styled 3D pieces, cream/sage board |
| Cute | 8-bit space theme, pixelated, voxel pieces |
| Retro | 1980s CRT, green/amber phosphor, letter-sprite pieces |
