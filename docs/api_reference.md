# Tetches API Reference

This document describes the **actual** wire contract between Tetches clients and the server.

> Phase 3 (May 2026) consolidated server state into a single authoritative
> `World` (`server/world/World.js`).  There is now exactly **one** game on
> the server.  Gameplay actions flow through Socket.IO; the REST surface is
> intentionally minimal and provides health, world summaries and
> external-AI registration only.  The legacy multi-game REST sandbox has
> been removed.

Coordinates are always sparse 3D: `{ x: number, z: number }` (with `y` reserved
for vertical effects only). There is no fixed board width or height; cells are
stored in `board.cells["x,z"]`.

---

## 1. REST endpoints (Express)

### 1.1 Auth & accounts (in `server.js`)

| Method | Path | Body | Description |
|--------|------|------|-------------|
| POST | `/api/auth/magic-link` | `{ email }` | Send a magic-link sign-in email. |
| GET  | `/auth/verify`         | `?token=...` | Consume a magic-link token, sets the session. |
| POST | `/api/auth/generate-game-key` | (auth) `{ label? }` | Issue a long-lived game key for headless clients. |

### 1.2 World & external AI (`routes/api.js`, mounted at `/api`)

| Method | Path | Description |
|--------|------|-------------|
| GET  | `/api`                              | Health check; lists supported endpoints + world id + player count |
| GET  | `/api/world`                        | Read-only summary of the single authoritative world (bounds, player roster, cell count) |
| GET  | `/api/world/visualization`          | ASCII / JSON debug view of the world |
| POST | `/api/computer-players/register`    | Register an external AI; returns `{ playerId, apiToken }` (then connect via Socket.IO) |
| GET  | `/api/computer-players`             | List registered external AIs |

External AI bots register via REST to obtain an id + token, then join the
world over Socket.IO like any other player.  There are no REST gameplay
endpoints — that path used to keep a parallel game store with a stub 2D
board and has been removed.

### 1.3 Advertisers (`routes/advertisers.js`, mounted at `/api/advertisers`)

Standard CRUD plus `/next`, `/:id/impression`, `/:id/click`, `/:id/stats`,
`/ranking/current`. Used by the in-game ad rotator.

---

## 2. Socket.IO events

The socket is the live multiplayer surface. All callbacks return
`{ success: boolean, ... }`. A common rate-limit ack is
`{ success:false, error:'rate_limited', retryAfterMs }`.

### 2.1 Client → Server

| Event | Payload | Notes |
|-------|---------|-------|
| `join_game`             | `(gameId, playerName, cb)` | Joins or auto-creates a game. |
| `create_game`           | `(settings, cb)` | Explicit game creation. |
| `request_game_state`    | `({ gameId? }, cb)` | Re-sync after reconnect. |
| `get_game_state`        | `({ gameId? }, cb)` | Same as above, legacy name. |
| `tetromino_placed`      | `({ tetromino:{ type, rotation, position:{x,z} } }, cb)` | Drop a tetromino. |
| `request_tetromino`     | `(cb)` | Get the next tetromino from the 7-bag. |
| `chess_move`            | `({ pieceId, targetPosition:{x,z} }, cb)` | Move a chess piece. |
| `promote_pawn`          | `({ pawnId, promoteTo }, cb)` | Resolve a pending promotion. |
| `detonate_pawn`         | `({ pawnId }, cb)` | Trigger the pawn-detonation sacrifice. |
| `king_duel_response`    | `({ duelId, accept })` | Accept/decline a King's Duel. |
| `restart_game`          | `(data)` | Host restarts the current game. |
| `exit_game`             | `(data, cb)` | Leave the game cleanly. |
| `disconnect_game`       | `(data, cb)` | Soft disconnect (keeps slot for reconnect). |
| `request_spectate`      | `({ gameId })` | Begin spectating. |
| `stop_spectating`       | `()` | End spectating. |

### 2.2 Server → Client

#### Session

- `player_id` — `playerId` assigned on connect.
- `set_session` — `{ playerId }` mirror for client-side persistence.

#### Game lifecycle

- `player_joined` / `player_left` — `{ playerId, playerName?, gameId, players }`.
- `game_started` — `{ gameId, players, ... }`.
- `game_over` — `{ winner, reason, ... }`.

#### State sync

- `game_state` — full snapshot (used after `request_game_state`).
- `game_update` — either a full snapshot or a delta:
  - Full: `{ ...state, fullUpdate:true, timestamp, boardBounds }`
  - Delta: `{ fullUpdate:false, timestamp, boardChanges, removedCells, boardBounds, chessPieces, lastAction }`

#### Tetromino phase

- `new_tetromino` — `{ tetromino, queue? }` newly drawn from the 7-bag.
- `row_cleared` — `{ rows:[z,...], cols:[x,...], playerId }`. Rows are
  X-aligned lines, cols are Z-aligned lines. Either array may be empty; at
  least one is non-empty when the event fires.
- `tetrominoFailed` — `{ message, reason? }` placement was rejected.
- `no_valid_chess_moves` — `{ playerId, message }` auto-skip chess phase.

#### Chess phase

- `chess_move` — `{ playerId, movedPiece, capturedPiece? }`.
- `chessFailed` — `{ message }` invalid move.
- `pawn_promotion_available` — `{ pawnId, allowedPromotions }`.
- `king_captured` — `{ playerId, capturedKingPlayer }`.

#### Specials

- `island_decay` — `{ cells, ... }` cells removed by king-support decay.
- `suicidal_pawn` — `{ pawnId, ... }`.
- `king_detonation` — `{ playerId, position }`.
- `king_duel_announced` / `king_duel_round_result` / `king_duel_result`.

#### Spectator

- `spectator_update` — `{ ...state }`.

---

## 3. Canonical data structures

### Sparse board

```json
{
  "cells": {
    "3,5": [
      { "type": "home", "player": "p1", "color": 16711680 },
      { "type": "chess", "player": "p1", "pieceId": "p1-KING", "pieceType": "king" }
    ],
    "4,5": [ { "type": "tetromino", "player": "p1", "placedAt": 1715000000000 } ]
  },
  "minX": 0, "maxX": 31,
  "minZ": 0, "maxZ": 31
}
```

A cell value is always an **array** of layered content items. The board never
holds raw `0/1` markers.

### Chess piece

```json
{
  "id": "p1-KING-1",
  "type": "KING",
  "player": "p1",
  "position": { "x": 4, "z": 5 },
  "hasMoved": false
}
```

### Tetromino

```json
{
  "type": "T",
  "rotation": 0,
  "position": { "x": 5, "z": 10 },
  "shape": [[0,1,0],[1,1,1],[0,0,0]]
}
```

Clients **may** send a `shape`, but the server replaces it with the canonical
rotation lookup before validating.

---

## 4. Standard error codes (in `cb({ success:false, error })`)

| Code | Meaning |
|------|---------|
| `GAME_NOT_FOUND`     | The requested game does not exist. |
| `GAME_FULL`          | At `MAX_PLAYERS_PER_GAME` already. |
| `INVALID_MOVE`       | Chess move is illegal. |
| `INVALID_PLACEMENT`  | Tetromino placement failed validation. |
| `PLAYER_NOT_FOUND`   | Player not registered. |
| `RATE_LIMITED`       | Action issued before its cooldown expired. |
| `UNAUTHORIZED`       | Missing/invalid session. |
| `SERVER_ERROR`       | Unexpected server-side error. |
