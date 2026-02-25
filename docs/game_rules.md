# Shaktris Game Rules

> For the definitive reference, see `docs/players-bible.md`. This file is a
> shorter summary.

## Overview

Shaktris is a real-time multiplayer game that fuses chess and Tetris on a
dynamically expanding board. Players grow territory by placing tetromino
pieces and use chess tactics to capture enemy pieces and kings.

The default mode is a **single continuous game** — players join and leave
freely; the world persists.

## Game Setup

1. **Board**: Sparse, coordinate-based — no fixed size. Expands as players
   place pieces.
2. **Home zone**: Each player receives an 8×2 home zone with chess pieces
   arranged in the standard starting formation.
3. **Tetromino queue**: Each player has their own queue of upcoming tetromino
   pieces (7 standard shapes: I, O, T, S, Z, J, L).

## Core Mechanics

### Tetromino Placement

1. Seven standard shapes, each with 4 rotations.
2. **No overlap** — every cell must land on an empty coordinate.
3. **Adjacency** — at least one cell must be adjacent (including diagonals)
   to an existing cell owned by the same player.
4. **Connectivity to king** — the adjacent cell must have a contiguous path
   back to the player's king (BFS, 8-directional).
5. If a tetromino cannot be placed, it "explodes" — the piece is lost. Play
   proceeds to chess phase if valid moves exist; otherwise a new tetromino
   is given.

### Chess Movement

1. All standard chess movement rules apply.
2. Pieces can **only move to cells that exist** on the board. Empty space is
   not traversable.
3. Path obstruction checks only consider other chess pieces, not cell content.
4. When a piece moves, the underlying cell content is preserved.
5. **No check/checkmate** — only king capture. Moving into check is legal.
6. **No en passant**.

### Pawn Specifics

- **First move**: may advance 1 or 2 squares forward.
- **Diagonal capture**: one square diagonally forward.
- **Promotion**: after 9 squares net forward distance
  (`PAWN_PROMOTION_DISTANCE = 9`), the player chooses Queen, Rook, Bishop,
  or Knight. Auto-promotes to Queen after 15 seconds.

### Castling

- Standard rules: neither king nor rook has moved; all cells between them
  exist and are free of chess pieces.
- King moves 2 squares towards the rook; rook jumps over.
- Works along any axis (orientation-dependent).

### Turn Structure

The game is **real-time** — all players act simultaneously. Server-side
cooldowns prevent spamming:

| Action | Cooldown |
|--------|----------|
| Chess move | 750 ms |
| Tetromino placement | 1 500 ms |

After placing a tetromino the client transitions to chess phase. If the
player has no valid chess moves, it skips straight back to tetromino phase.

## Row Clearing

After every tetromino placement the server checks all z-rows:

- **Threshold**: 8 consecutive filled cells in a single z-row.
- **Home-zone handling**: Safe home-zone cells (containing at least one
  chess piece) **break** the consecutive count — it resets to zero.
- **What is removed**: All non-home cell content in the cleared segment.

After a row is cleared:
1. **Gravity towards king** — cells shift one step toward the gap.
2. **Island decay** — disconnected groups of cells (no path to king) are
   removed along with any chess pieces on them.

## King Capture

Capturing an opponent's king triggers:

1. Non-pawn chess pieces **transfer** to the captor.
2. Defeated player's pawns become **suicidal** — after a 3-second delay,
   they self-destruct one every 0.5 s, each destroying its cell.
3. Island decay runs after all pawns detonate.
4. Remaining territory transfers to the captor.
5. The captured king goes to prison.
6. The defeated player is eliminated.

### Simultaneous Capture — "King's Duel"

If two players capture each other's kings within 1 second, a **King's
Duel** mini-game starts:

- 4×2 grid, each player hides a knight and guesses the opponent's position.
- Exactly one correct guess wins the round.
- Max 5 rounds; 10-second timeout per round.

## Home Zone

| Setting | Value |
|---------|-------|
| Width | 8 cells |
| Height | 2 cells |
| Degradation interval | 2.5 minutes (if no pieces remain) |

Safe home-zone cells (with at least one piece) are never cleared by row
clearing and break the consecutive-cell count.

## Island Decay

After any row clear or tetromino placement, a BFS groups all cells into
connected components per player. Any island without its player's king is
removed, along with chess pieces sitting on those cells.

## AI Opponents

| Difficulty | Move interval |
|------------|--------------|
| Easy | 15 s |
| Medium | 10 s |
| Hard | 5 s |

## Scoring

| Event | Points |
|-------|--------|
| Tetromino placement | Base points |
| Row clearing | Bonus per row |
| Chess capture | Varies by piece value |
| King capture | Large bonus + inherited pieces |

## Piece Prices (Purchasable Reinforcements)

| Piece | Cost (SOL) |
|-------|-----------|
| Pawn | 0.1 |
| Rook | 0.5 |
| Knight | 0.5 |
| Bishop | 0.5 |
| Queen | 1.0 |
| King | Not purchasable |

## Visual Themes

| Theme | Description |
|-------|-------------|
| Normal | Daylight scene, Russian-styled 3D pieces, cream/sage board |
| Cute | 8-bit space theme, pixelated rendering, starfield |
| Retro | 1980s CRT terminal, green phosphor, Cyrillic text sprites |

## Game Modes

Primary mode: continuous open world. Future modes: Timed, Survival, Arena.
