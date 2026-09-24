# Tetches

> Real-time multiplayer fusion of **Chess** and **Tetris** on a dynamically
> expanding board. Build territory with tetrominoes; capture opponents with
> chess pieces. Live at **[tetches.com](https://tetches.com)**.

*(Tetris + chess. The game was called **Shaktris** for a while — "Schack" is
the Swedish word for chess — before the rebrand to **Tetches**.)*

---

## How it works (in one paragraph)

Every player starts with a standard chess set on an 8×2 home zone. Tetromino
pieces fall from the sky and stick to the board only if they touch territory
that has an unbroken path back to your king. Chess pieces can only move on
cells that exist on the board — so the Tetris half is about *making the
battlefield* and the chess half is about *fighting on it*. Capture an opponent's
king and you inherit their territory and pieces. Lose your king and you are
eliminated.

The default mode is a **single continuous shared world** — players join, fight,
and leave; the world persists across server restarts.

**Battle mode** offers private 2–4 player matches on top of the shared world:
a circular arena (diameter 32) of neutral ring cells that any seated player
may build against but nobody can clear or own, with home zones a fixed 8
cells apart. Create a battle from the ⚔ Battle button (or the welcome
screen), share the 6-char code / `?battle=CODE` invite link, and empty seats
are filled with bots on start. Your main kingdom is untouched while you
fight. Design + implementation notes: `docs/battle-mode-design.md`.

---

## Definitive Rules Reference

**`docs/players-bible.md`** is the single source of truth for game rules. If
the code and the bible disagree, the code is wrong. Always update the bible
alongside any rule change.

A short tabular summary lives in `docs/game_rules.md`.

---

## Quick Start

Requires Node.js 18+.

```bash
npm install
npm run dev      # starts on http://localhost:3022 (override with PORT=xxxx)
```

A 3D view is served at `/`. The renderer auto-selects from three profiles
(`normal`, `cute`, `retro`); pass `?cute`, `?retro`, or `?render=cute` to
override. The legacy 2D view has been removed — if WebGL is unavailable
the client shows a graceful overlay instead of redirecting.

Tests:

```bash
npm test                  # everything
npm run test:gameplay     # game-rule tests
npm run test:server       # manager unit tests
npm run test:security     # anti-cheat / input validation
```

---

## External API (bots, fly-throughs, dashboards)

Tetches exposes a small REST surface for AI registration plus a full
Socket.IO contract for gameplay and the activity feed. Two worked
examples ship with the repo:

```bash
SERVER=https://tetches.com node examples/random-bot.js       # plays valid random moves
SERVER=https://tetches.com node examples/spectator-feed.js   # streams the activity log
```

Full protocol reference: **[`docs/external-api.md`](docs/external-api.md)**.

> The older `docs/computer-player-*.md` files describe a multi-game
> REST sandbox that was removed in May 2026 and are clearly marked
> as deprecated at the top of each file. They are kept for history
> only — do not integrate against them.

---

## Advertising surfaces

There are two advertising routes today, with the second in the
process of replacing the first:

1. **Sponsored cells** (`routes/advertisers.js` + the
   `/admin/advertisers` page) — the original mechanism. Admin uploads
   an ad with a target cell count + bid; the ad rotates onto
   tetromino placements. Still works, still ships, but the user
   flagged it as "complex to begin with and needs work" — treat as
   legacy.
2. **Viking longship sails** (`server/world/boats.js` +
   `public/js/boatsRenderer.js`) — a small fleet of longships
   drifts around the playable area. Sails carry adverts pulled
   from the same active-bid ranking. Simpler to reason about for
   first-time players and lays groundwork for the planned
   "knights go viking" travel mechanic. Design doc:
   [`docs/boats-and-viking-knights.md`](docs/boats-and-viking-knights.md).

---

## Project Structure

```
server.js                     13-line entrypoint: load .env → bootstrap → listen
server/
  bootstrap.js                Wires every service, restores world, starts timers
  app.js                      Pure Express setup (middleware + static + routes)
  world/                      Single source of truth for game state
    World.js                  The world (singleton): board, players, zones, ...
    Sessions.js               Ephemeral socket.id <-> playerId bindings
    Disconnects.js            Reconnect grace timers
    integrity.js              Per-action + periodic world integrity sweeps
    homeZones.js              Home-zone degradation timer
    lifecycle.js              Composite player + world lifecycle operations
  net/
    broadcasts.js             game_update broadcaster (sparse deltas + spectator)
    spectators.js             Spectator → target mapping
  king/
    capture.js                King-capture consequences (transfer, suicidal pawns)
    duels.js                  King's-Duel mini-game state machine
  ai/
    strategy.js               Heuristics + difficulty profile
    actions.js                Concrete AI moves
    runner.js                 Tick + respawn orchestration
  game/                       Authoritative gameplay logic (stateless façades)
    GameManager.js            Façade for the sub-managers below
    BoardManager.js           Sparse cell map, row clearing, gravity
    TetrominoManager.js       Placement validation, 7-bag generation
    ChessManager.js           Movement, capture, castling, king capture
    IslandManager.js          BFS connectivity, island decay
    PlayerManager.js          Registration, actions
    ComputerPlayerManager.js  AI opponents
    Constants.js              Single source of truth for tunables
  sockets/                    One file per socket event group
    connection.js, join.js, tetromino.js, chess.js, duels.js,
    state.js, spectate.js, lifecycle.js
  auth/
    routes.js                 Auth0 public-config + game-key routes (no PII)
    gameKey.js                Shareable world-key generator
  utils/                      cookies, validation, cooldowns + board helpers
  persistence.js              World snapshot to data/world.json (v2 schema)
public/                       Browser frontend (vanilla ES modules + Three.js)
  index.html                  3D entry point (only renderer; WebGL required)
  index-2d.html               Static "2D mode removed" notice
  2D/index.html               Static "2D mode removed" notice (legacy URL)
  js/                         Game-side modules
    main-enhanced.js          Entry: WebGL probe → init → run loop
    enhanced-gameCore.js      Init/state coordinator
    enhanced-gameCore/        Helpers split out of the coordinator
      networkEvents.js        NetworkManager event handlers
      webglOverlay.js         WebGL-unavailable overlay
      axisHelpers.js          Debug XYZ axis + labels
      gameOverOverlay.js      Pulsing GAME OVER text
      orbitControls.js        OrbitControls wrapper + tuning
    tetromino.js              Thin re-export shell
    tetromino/                Tetromino feature modules
      shapes.js, bag.js, validation.js,
      pool.js, rendering.js, spawn.js,
      network.js, nextPiece.js, animations.js,
      pathViz.js, movementQueue.js
    boardFunctions.js         Thin re-export shell
    boardFunctions/           Board feature modules
      cells.js, colours.js, pieces.js, moves.js, rendering.js
    chessPieceCreator.js      Orchestrator for chess-piece geometry
    chessPieceCreator/        Piece-builder family
      materials.js            Shared MeshStandard material palettes
      russianPieces.js        Detailed imperial-style pieces
      simplePieces.js         Geometric pieces + `createPiece`
      specialModes.js         Retro letter + cute voxel pieces
      validation.js           Material/fallback hygiene helpers
    setupCamera.js            Camera setup, fly-to-king, overview
    scene.js                  Lights, floating cubes, particles
    gameLoop.js               Animation loop + per-frame updates
    inputManager.js           Pointer + keyboard wiring
    chessInteraction.js       Picking, valid moves, move animation
    updateChessPieces.js      Chess piece group diffing
    rendererManager.js        WebGL renderer + fallback strategies
    showToastMessage.js       Themed toast notification API
    createLoadingIndicator.js Loading splash, errors, status, tutorial
    unifiedPlayerBar.js       Side-panel player list
    utils/                    Network manager, theming, helpers
routes/
  api.js                      REST API for external computer-player bots
  advertisers.js              Sponsor / advertising subsystem (optional)
data/
  world.json                  Persisted shared world (auto-managed)
docs/
  players-bible.md            Definitive rules reference
  game_rules.md               Short summary
  api_reference.md            REST + Socket.IO API
  …                           See docs/ for the rest
tests/
  gameplay/                   Row clearing, pawn promotion, king capture, …
  server/                     Manager unit tests
  security/                   Anti-cheat / input validation
  backend/, core/, ui/        Higher-level integration
```

---

## Socket.IO Contract (golden path)

The server is authoritative; clients send actions and receive state.

**Client → Server**
- `join_game { playerName?, gameId? }` — `gameId` defaults to the shared world.
- `tetromino_placed { tetromino }` — ack returns `{ success, boardState, clearedRows, hasValidMoves }`
  or `{ success: false, error: 'invalid_placement', reason, message }`.
- `chess_move { pieceId, targetPosition: { x, z } }` — ack returns
  `{ success, updatedPiece, capturedPiece? }`.
- `detonate_pawn { pieceId }` — voluntary pawn (or last-king) detonation.
- `promote_pawn { pieceId }` — legacy entry point: bank a promotion
  credit for `pieceId` (the pawn must already have walked
  `PAWN_PROMOTION_DISTANCE` cells forward). The chess_move handler
  auto-banks now, so this is rarely needed by new clients.
- `redeem_promotion { capturedType, creditId? }` — spend one banked
  promotion credit + one matching captured piece to deploy that piece.
  Lands at the credit's original cell when still owned, or the nearest
  owned cell to the player's king if the original is gone. The local
  player triggers this by clicking their promotion-credit badge.
- `get_game_state`, `request_tetromino`, `request_spectate`, `exit_game`.

**Server → Client**
- `game_update` — full snapshot on first send, sparse deltas thereafter:
  - Full: `{ ...state, fullUpdate: true, timestamp, boardBounds }`
  - Delta: `{ fullUpdate: false, timestamp, boardChanges:[{x,z,value}], removedCells:[{x,z}], boardBounds, chessPieces, lastAction }`
- `row_cleared { rows, playerId }`
- `player_joined`, `player_left`, `king_capture`, `king_detonation`, `pawn_detonation`
- `new_tetromino`, `tetrominoFailed`, `no_valid_chess_moves`
- `captured_basket { basket: [{ type, originalOwner, ... }] }` — sent to the
  owning player when their basket changes (capture or promotion redeem).
- `promotion_credits { credits: [{ id, originalX, originalZ, createdAt }] }`
  — sent to the owning player when their banked-credit list changes
  (auto-bank from a chess move, or redeem).
- `promotion_credit_added { playerId, creditId, originalX, originalZ, createdAt }`
  — fired the moment a pawn completes its promotion walk; the client
  pops up the redeem dialog if the player already has a captured piece.
- `promotion_credit_redeemed { playerId, creditId, pieceId, pieceType, x, z, originalX, originalZ, fallback }`
  — fired when a credit is spent; carries `fallback: true` when the
  original cell was gone and we landed near the king instead.
- `powerup_spawned { orb }`, `powerup_claimed { orb, piece, playerId }`,
  `powerup_expired { orbId, x, z }` — random orb power-ups that spawn on
  empty cells; the first player to connect (tetromino placement) claims the
  contained piece. Spawning is biased toward players with fewer pieces.
- `error { message, code }`

---

## Server-Authoritative Real-Time Cadence

There are no strict turns. The server enforces short per-action cooldowns to
prevent spamming:

| Action | Cooldown |
|--------|---------:|
| Chess move | 500 ms |
| Tetromino placement | 800 ms |

After a tetromino is placed the client transitions to chess phase; if the
player has no valid chess moves the server skips back to tetromino phase
immediately.

---

## Render Profiles

The bottom-left **Mode** button cycles between three cosmetic profiles
(saved in `localStorage`):

| Profile | Look |
|---------|------|
| **Normal** | Daylight scene, Russian-styled 3D pieces, cream/sage board. |
| **Cute**   | 8-bit space theme, pixelated rendering, voxel pieces. |
| **Retro**  | 1980s CRT terminal, green/amber phosphor, letter-sprite pieces. |

If WebGL initialisation fails the client automatically redirects to the 2D view.

---

## Persistence

The shared world is saved to `data/world.json` every 30 seconds (when state has
changed) and on graceful shutdown (SIGINT/SIGTERM). A previous snapshot is
kept as `data/world.json.bak`, plus up to six hourly rolling snapshots under
`data/backups/world.<timestamp>.json` for "oh god the world got corrupted"
rollbacks. A version-based migration framework in `server/persistence.js`
upgrades older saves on load. Per-player `capturedBasket` and
`promotionCredits` are part of the v2 schema and survive restarts.

---

## Production hardening (May 2026)

The previous domain (shaktris.com) expired; the game has been rebranded
to **tetches.com** (pointed at `95.216.77.237`). The cutover runbook is in
[`docs/tetches-cutover.md`](docs/tetches-cutover.md); the deploy
infrastructure has been refreshed to match. Highlights:

* **Security.** `helmet` + per-route rate limiting + strict CORS
  allowlist (`ALLOWED_ORIGIN` env var) covering both Express and
  Socket.IO. Smoke-tested by `tests/server/security.test.js`.
* **Authentication is delegated to Auth0** (passwordless email /
  hosted login). Auth0 hosts the entire sign-in journey *and* email
  delivery, so the game sends/receives no email and stores no PII —
  we persist only an opaque player key derived from the Auth0
  subject. The server merely exposes the *public* Auth0 config
  (`AUTH0_DOMAIN` / `AUTH0_CLIENT_ID`, optional `AUTH0_CONNECTION`)
  via `GET /api/auth/config`. SendGrid and the old self-hosted
  magic-link/token code have been removed.
  The `/admin/advertisers` panel and the destructive `/api/advertisers`
  endpoints (POST/PUT/DELETE/activate, list, stats) are gated behind
  an `ADMIN_TOKEN` env var when `NODE_ENV=production`. Supply it via
  the `?adminToken=…` query string (admin HTML) or the `x-admin-token`
  request header (API). If the env var is unset, those endpoints
  refuse all requests in production.
* **Observability.** Pino structured logger
  (`server/observability/logger.js`), Prometheus `/metrics`
  (`server/observability/metrics.js`), cheap `/api/health` probe used
  by the Dockerfile HEALTHCHECK.
* **Deploy.** Multi-stage `Dockerfile` (+ `.dockerignore`),
  GitHub Actions workflow at `.github/workflows/ci.yml`,
  Jenkinsfile now runs `npm run lint` before tests.
* **Gameplay polish.** Nameplates render above every king
  (`public/js/nameplateRenderer.js`); captured-piece glyphs in the
  player bar now show in the *original owner's* colour so it's clear
  which player each piece came from. Spectator nameplates additionally
  list the player's captured-piece summary.
* **Sentry.** Server-side error reporting wired via
  `server/observability/sentry.js`. Boots only when `SENTRY_DSN` is
  set so dev runs stay quiet; production picks it up from the
  per-environment `.env`.
* **Sound design.** Procedural Web Audio cues
  (`public/js/audio/`) with a floating mute toggle (`M` key). Cues:
  line clear, capture, orb claim, promotion, tetromino lock, hard
  drop, king fall, rejected move. Procedural so there's nothing to
  license — real samples can be bolted on later via the same cue
  catalogue.
* **Input modes.** Keyboard-only chess via
  `public/js/keyboardChess.js` — `Tab` cycles pieces, arrow keys
  cycle valid targets by direction, `Enter` confirms, `Escape`
  cancels. Touch-only play via `public/js/touchGestures.js` —
  swipe to move, double-tap to rotate, two-finger tap to rotate
  the other way, long-press to hard drop. Mouse still works
  exactly as before.
* **Inline rename.** "Change Name" used to clear localStorage and
  reload — which raced the auto-init and silently dropped the user
  back to "Guest". A `change_name` socket event + a dialog at
  `public/js/renameDialog.js` now updates the server in-place and
  broadcasts a `player_renamed` event to every client.
* **Orbs have host blocks.** Power-up orbs now sit above a
  translucent, wireframe-outlined ghost block matching standard
  cell dimensions. Players read "build to *that* cell" at a glance
  instead of guessing which tile the floating sphere targets.
* **Client bundling.** `npm run build:client` produces
  `public/dist/app.bundle.js` (esbuild, ~300 KiB IIFE, 71 modules
  in 30 ms). The server detects the bundle at boot and rewrites the
  entry `<script>` tag in index.html (see
  `server/bundling/indexHtmlBundleSwap.js`) so production users
  fetch one file instead of ~70. Dev runs without the bundle and
  load modules directly.
* **Code shape.** `public/js/utils/NetworkManagerClass.js` was
  1,444 LOC; it's now 1,148 with the socket-event forwarding lifted
  to `network/socketEventBridge.js` and the in-memory listener
  book-keeping to `network/eventBus.js`.
  `server/game/ChessManager.js` was 1,614 LOC; it's now 1,086 with
  every move-validation helper (`validateChessMove`,
  `isValidChessMove`, `hasValidChessMoves`, castle / path /
  piece-type validators) extracted to
  `server/game/chess/moveValidation.js`. All 380+ server tests
  still pass.

---

## Development Notes

* The frontend is vanilla ES modules. Dev runs load each module
  directly via `<script type="module">`; production builds bundle
  them via esbuild (`npm run build:client` → `public/dist/`).
* `public/js/main-enhanced.js` is the entry point.
* `server.js` is now a 13-line entrypoint that calls `server/bootstrap.js`.
  All real work lives in `server/` sub-directories; see the Project Structure
  diagram above and Phase 4 in
  [`docs/project-outline/02-phase-4-and-server-refactor.md`](docs/project-outline/02-phase-4-and-server-refactor.md)
  for the architecture. The full project outline lives under
  [`docs/project-outline/`](docs/project-outline/README.md) (split from the
  old monolithic `project_outline.md` to keep files editor-safe).
* The user-rules in `.cursor/rules` apply: tabs not spaces, British spelling
  in prose, no dynamic imports, files under 1500 lines.

---

## TODOs / Stretch Goals

* **Piece Designer + marketplace** — players design and trade custom piece
  styles; 10% house commission.
* **King's Duel mini-game UI** — server resolves simultaneous king captures
  via a 4×2 knight hide-and-seek; the client UI for it is not yet built.
* **Captured-style switching** — server tracks `capturedStyles[]`; client UI
  not yet implemented.
* **Sponsor / advertising subsystem** — currently a feature-complete back end
  in `routes/advertisers.js`; the client integration is partial.

---

## Licence

MIT. See `LICENSE`.
