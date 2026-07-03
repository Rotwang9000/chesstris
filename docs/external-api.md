# Tetches External API

This document is the source of truth for talking to a Tetches server
from an external process — for example a custom AI bot, a fly-through
camera, a Discord activity bridge, or a leaderboard scraper.

> **TL;DR.** Gameplay flows over Socket.IO. REST is for registration,
> a couple of read-only summaries, and admin. Two working examples are
> shipped in this repo:
>
> * `examples/random-bot.js` — registers, joins, and plays valid random
>   tetromino and chess moves.
> * `examples/spectator-feed.js` — connects without claiming a player
>   slot, dumps the activity log backlog, then streams every live event.
>
> ```bash
> SERVER=https://tetches.com node examples/random-bot.js
> SERVER=https://tetches.com node examples/spectator-feed.js
> ```

The "computer-player" docs that used to live in this folder
(`computer-player-api.md`, `computer-player-troubleshooting.md`,
`frontend-computer-player-integration.md`) described a multi-game REST
gameplay sandbox that was deleted in May 2026. They are kept around
only as historical reference and **must not be used as integration
documentation**.

---

## 1 · Architecture

```
            ┌───────────────────────────────────────────┐
            │                Tetches server             │
   REST ──▶ │  /api/health      /api/world              │
            │  /api/computer-players (register / list)  │
            │                                           │
Socket.IO ─▶│  join_game   get_game_state               │
            │  tetromino_placed   chess_move            │
            │  activity_event   game_update             │
            └───────────────────────────────────────────┘
                              │
                              ▼
                    one authoritative `World`
                  (`server/world/World.js`)
```

* The server keeps **one shared world** (id `global_game`). REST is a
  thin overlay; it does not maintain a parallel game state.
* Gameplay actions all go over **Socket.IO**. The REST surface is
  intentionally small: health probe, world summary, AI registration,
  admin panel.
* Each connected socket is bound to **one** `playerId`. The id is
  resolved at handshake time from (in this order): the API token
  match for registered bots, the `tetches_player_id` cookie, or a
  freshly-minted UUID for new browser visitors.

---

## 2 · REST endpoints

Base URL: `https://<host>/api` (e.g. `https://tetches.com/api`).

All `/api/*` routes are rate-limited at **120 requests / minute / IP**.
CORS in production is restricted to the `ALLOWED_ORIGIN` allow-list
(server-to-server tools without an `Origin` header are unaffected).

### `GET /api/health`

Cheap liveness probe used by Docker / nginx / uptime monitors.

```json
{ "status": "ok", "worldId": "global_game", "players": 4, "uptimeSec": 17, "memoryMB": 103 }
```

### `GET /api/world`

Coarse summary. Bot can use this to decide whether the world is busy
enough to bother joining; spectators can use it for periodic polling.

```json
{
  "success": true,
  "world": {
    "id": "global_game",
    "status": "active",
    "maxPlayers": 64,
    "boardBounds": { "minX": -32, "maxX": 32, "minZ": -32, "maxZ": 32 },
    "cellCount": 412,
    "chessPieces": 28,
    "players": [
      { "id": "...", "name": "Geofrey", "isComputer": false, "eliminated": false }
    ]
  }
}
```

This is intentionally a *summary*. Full board cells and piece
positions are only available over Socket.IO (see `get_game_state`).

### `POST /api/computer-players/register`

Creates a real `World` player record for a bot, returns an `apiToken`
the bot uses to authenticate its Socket.IO handshake.

Request:

```json
{ "name": "MyBot", "description": "optional", "apiEndpoint": "optional" }
```

Response:

```json
{
  "success": true,
  "playerId": "ext-ai-9f3c08a1",
  "apiToken": "...64 hex chars...",
  "socketHandshake": {
    "query": { "playerId": "ext-ai-9f3c08a1", "apiToken": "..." },
    "cookies": { "tetches_player_id": "ext-ai-9f3c08a1", "tetches_api_token": "..." }
  }
}
```

The token is **per-process**: if you restart the Tetches server, the
in-memory token store is wiped and you must re-register. (For now —
persisted tokens are a roadmap item.) Bots should treat the token as
ephemeral and re-register on connect failure.

### `GET /api/computer-players`

Lists the registered bots (no tokens). Useful for debugging.

### Admin (production-gated)

The `/admin/advertisers` panel and the destructive `/api/advertisers`
endpoints (POST register, POST activate, PUT, DELETE, GET list, GET
stats) require an `ADMIN_TOKEN` env var when `NODE_ENV=production`.
Supply it as `?adminToken=…` (admin HTML) or `x-admin-token` header
(API). When unset in production those routes refuse all requests.

---

## 3 · Socket.IO contract

Connect with `socket.io-client@4.x` over the same host as REST. The
server emits its `player_id` and `set_session` on `connect`, and you
should treat those as authoritative.

```js
const { io } = require('socket.io-client');
const socket = io('https://tetches.com', {
  // For registered bots — claims the pre-allocated identity.
  query: { playerId: 'ext-ai-…', apiToken: '…' },
  transports: ['websocket'],
});
```

### 3.1 Handshake authentication

Three identity scenarios:

| Handshake input                                    | Server behaviour |
|---------------------------------------------------|------------------|
| `apiToken` matches a registered bot's token       | Claims that registered identity. Refreshes `lastActiveAt`, marks `isComputer`/`external`. |
| `apiToken` present but **wrong** (or unknown id)  | Server emits `auth_error: { reason: 'invalid_api_token' }` and disconnects. |
| No token (any browser visitor)                    | Server reads `tetches_player_id` cookie; reconnects an existing record or mints a new UUID. |

So:

* **Bots that want a persistent identity** → call `POST
  /api/computer-players/register` first, then connect with the
  returned `playerId` + `apiToken` in the handshake query.
* **Ephemeral bots / spectators** → just connect; the server treats
  you exactly like a browser tab.

### 3.2 Joining the world

Once connected the socket is *bound* but not yet a participant. The
classic browser flow then calls `join_game`:

```js
socket.emit('join_game', { playerName: 'MyBot' }, (resp) => {
  // resp.gameState is the full canonical world snapshot.
});
```

`join_game` is destructive — it places your starting home zone and 16
chess pieces, picks a colour, and broadcasts your arrival. If you do
**not** want a participant slot (e.g. you're building a spectator
tool) skip `join_game` and only listen for broadcast events.

### 3.3 Game state

| Event (client → server) | Payload | Notes |
|-------------------------|---------|-------|
| `get_game_state`        | `{ options?: { aoi?: { centerX, centerZ, radius } } }` | Ack returns `{ success, gameId, state, players, timestamp }`. `state` is the full canonical payload (cells, chess pieces, home zones, islands, current turns, power-ups, turn phase). |
| `request_game_state`    | `{ playerId }` | Legacy alias; calls `emitFullStateTo`. |

| Event (server → client) | Payload sketch |
|-------------------------|----------------|
| `player_id`             | `"<uuid>"` — bound identity. |
| `set_session`           | `{ playerId }` |
| `game_state`            | Full canonical snapshot. Sent in response to `get_game_state`. |
| `game_update`           | Either a full update (when `fullUpdate: true`) or a delta with `boardChanges` / `removedCells` / `lastAction`. Broadcast on every state-affecting event. |
| `new_tetromino`         | `{ tetromino: { pieceType, type, rotation, position, shape? } }` — fires when it's your tetromino phase. |
| `turn_update`           | `{ phase: 'tetris' \| 'chess', currentPlayer }` |

### 3.4 Tetromino placement

```js
socket.emit('tetromino_placed', {
  tetromino: {
    pieceType: 'T',           // or `type`; server reads either
    rotation: 1,              // 0–3
    position: { x: 12, z: 4 },
    // `shape` is optional; the server recomputes it from rotation.
  },
}, (ack) => {
  // ack.success — true|false
  // ack.error / ack.reason — failure detail
  // ack.placedCells — list of {x,z} that were stamped onto the board
  // ack.powerUpClaims — orbs that were converted by this placement
  // ack.retryAfterMs — present on `rate_limited` rejections
});
```

* Cooldown: **800 ms** between placements per player.
* Placement must touch a cell connected back to your king.
* On failure the server also emits a `tetrominoFailed` event so any
  other listener (e.g. a debug feed) can react.

### 3.5 Chess move

```js
socket.emit('chess_move', {
  pieceId: 'p1-ROOK-1',
  targetPosition: { x: 4, z: 5 },
  // Legacy alternates also accepted: { toX, toZ } or { move: {...} }.
}, (ack) => { ... });
```

* Cooldown: **500 ms** between chess moves per player.
* Captures, promotions and king-respawn lives are handled server-side
  and broadcast via dedicated events (`chess_capture`, `chess_move`,
  `king_respawned`, `king_eliminated`, …).

Other gameplay events you may care about: `promote_pawn`,
`detonate_pawn`, `redeem_promotion`, `king_duel_response`,
`pause_player`, `resume_player`, `pause_status`. See
`server/sockets/` for the canonical handler list.

### 3.6 Pause / resume

```js
socket.emit('pause_status', {}, (ack) => { /* ack.status */ });
socket.emit('pause_player', {}, (ack) => { ... });
socket.emit('resume_player', {}, (ack) => { ... });
```

While paused, your home zone freezes, your pieces refuse capture, and
your cells break line-clear runs. Capped at 4 uses, 30 min/pause,
60 min total per session.

---

## 4 · Activity feed

Every interesting world event is appended to a rolling buffer
(`server/world/activityLog.js`, max 200 events) and broadcast live.

### 4.1 Snapshot

```js
socket.emit('get_activity_log', {}, (ack) => {
  // ack.success === true
  // ack.events: Array<{ id, t, type, payload }>
});
```

Use this on connect / reconnect to gap-fill anything you missed
while disconnected.

### 4.2 Live stream

```js
socket.on('activity_event', (ev) => {
  // { id, t, type, payload }
});
```

Common `type` values:

* `tetromino_placed`, `tetromino_dissolved`
* `chess_move`, `chess_move_rejected`, `chess_piece_captured`,
  `chess_piece_promoted`, `chess_piece_lost`, `chess_piece_detonated`,
  `chess_piece_spawned`
* `rows_cleared`, `territory_captured`, `island_decayed`
* `player_joined`, `player_left`, `player_reaped`
* `powerup_spawned`, `powerup_claimed`, `powerup_expired`
* `promotion_redeemed`, `pawn_promoted_to_credit`
* `king_detonation`, `chat`

The payload shape varies per type — see
`server/world/activityLog.js` for the helpers that build them. For
fly-through cameras the most useful events are `tetromino_placed`
(coordinates of the just-stamped cells), `chess_move` (from/to
coordinates), and `rows_cleared` (which lines disappeared).

---

## 5 · Worked examples

Both shipped in this repo's `examples/` directory.

### `examples/random-bot.js`

Demonstrates the full bot lifecycle:

1. `POST /api/computer-players/register` to claim an identity.
2. Connect Socket.IO with `query: { playerId, apiToken }`.
3. `emit('join_game', { playerName })`.
4. On `new_tetromino` → pick a cell adjacent to one of our own cells,
   submit `tetromino_placed`.
5. On `turn_update: { phase: 'chess' }` → walk our pieces and try each
   1-step direction until one is accepted.

```bash
SERVER=https://tetches.com BOT_NAME=Geofrey node examples/random-bot.js
```

### `examples/spectator-feed.js`

Connects without joining, asks for the activity log backlog, then
streams every live event. Designed as the skeleton for fly-through
cameras and external dashboards.

```bash
SERVER=https://tetches.com node examples/spectator-feed.js
```

---

## 6 · Versioning & guarantees

This API is currently at **`v0` (pre-1.0)**. The wire shapes will
stay stable for the lifetime of the May 2026 release series, but
expect additive changes (new event types, new optional payload
fields) without bumping a major version. Breaking changes will be
announced in `docs/project-outline/` changelogs before they ship.

If you need a guarantee for a production integration, pin against a
specific commit and re-test on each Tetches upgrade.

## 7 · Roadmap (known gaps)

* **Persistent API tokens** — currently in-memory; bots must
  re-register on server restart.
* **Spectator / observer mode** — server-side handlers exist
  (`request_spectate`, `spectator_update`) but the payload still
  carries the raw world object rather than the canonical
  `buildGameStatePayload` shape. Use the activity feed for now.
* **REST snapshot of the full board** — `GET /api/world` is a
  summary. If you need cells + pieces over plain HTTP, raise an
  issue; this is a small addition.
* **Webhook delivery** — pull-only today. A subscribe-and-push
  variant would let bots run without holding a socket open.
