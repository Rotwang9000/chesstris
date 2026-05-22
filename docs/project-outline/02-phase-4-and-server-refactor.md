# 02 Phase 4 And Server Refactor

> Part of the [Tetches project outline](README.md). Phase 4 server single source of truth.

## Phase 4: Server-side Single Source of Truth + Modularisation (May 2026)

Phase 3 promised one authoritative game state. Phase 4 actually delivered it.
The 3.6k-line `server.js` is gone — replaced with a 13-line entrypoint and a
collection of small, dependency-injected modules. The previous "three parallel
game stores" are now a single `World` object with explicit ephemeral helpers
for live sockets and disconnect grace timers.

### Server architecture

`server.js` is now a thin shim that loads `.env`, calls
`server/bootstrap.js`, and starts the HTTP server. Everything else lives in:

- `server/world/World.js` — single source of truth for persistent game state
  (board, players, chess pieces, home zones, king prison, turn phase…).
- `server/world/Sessions.js` — ephemeral playerId ↔ socket binding.
- `server/world/Disconnects.js` — disconnect grace timers (15 s).
- `server/world/integrity.js` — startup + periodic world integrity sweeps
  (orphaned cells, broken chess piece references, dead islands).
- `server/world/homeZones.js` — home-zone degradation timer.
- `server/world/lifecycle.js` — composite world & player operations
  (remove, restart, apply settings, end, rehydrate).
- `server/net/broadcasts.js` — `game_update` broadcasting with sparse
  board deltas (falls back to full update past a threshold) and spectator
  streams.
- `server/net/spectators.js` — spectator → target mapping.
- `server/king/capture.js` — king-capture consequences (territory transfer,
  suicidal pawns, prison).
- `server/king/duels.js` — King's-Duel mini-game state machine.
- `server/ai/strategy.js`, `actions.js`, `runner.js` — AI heuristics,
  concrete moves, and tick/respawn orchestration.
- `server/auth/routes.js` — magic-link routes mounted on the Express app.
- `server/sockets/*` — one file per socket event group (`join`, `tetromino`,
  `chess`, `duels`, `state`, `spectate`, `lifecycle`, `connection`).
- `server/utils/{cookies,validation,cooldowns}.js` — small helpers
  previously inlined.
- `server/app.js` — Express middleware + static + API + auth wiring only.
- `server/bootstrap.js` — wires every service together, restores the
  world, fills the AI roster, schedules timers, registers connection
  handler, configures graceful shutdown.

All managers (`GameManager`, `BoardManager`, `ChessManager`, `IslandManager`,
`TetrominoManager`, `PlayerManager`, `ComputerPlayerManager`) are now
stateless façades that operate on the injected `World` object. The legacy
`World/LegacyAdapters.js` shim has been deleted.

### Frontend modularisation (in progress)

Two of the worst monoliths are starting to break apart:

- **`public/js/tetromino.js`** (was 3.3k lines, now ~2.5k):
  - `public/js/tetromino/pool.js` — Three.js mesh object pool.
  - `public/js/tetromino/animations.js` — drop, explosion, sand-dissolve,
    placement burst, cleared-line highlight effects.
  - `public/js/tetromino/pathViz.js` — BFS path-to-king + animated
    highlight overlay.
  - `tetromino.js` itself now re-exports the extracted symbols, so the
    rest of the client code (which imports as a namespace) is untouched.
  - Added a real `synchronizeCenterPositions` implementation (it was being
    called from `enhanced-gameCore.js` but never defined; updates the
    Three.js shape group when the centre marker shifts).
- **`public/js/enhanced-gameCore.js`** (was 1.3k lines, now ~1k):
  - `public/js/enhanced-gameCore/networkEvents.js` — all `NetworkManager`
    event wiring (`game_state`, `game_update`, `row_cleared`,
    `chess_move`, `king_detonation`, `island_decay`, King's-Duel events,
    etc.). Fixed an undefined-variable bug (`cappedDistances` was used
    where `sortedDistances` was meant) while extracting.

### Tests

- All 106 server-side tests still pass.
- `tests/server/staticAssets.test.js` extended to validate that the new
  client sub-modules are served by Express with the right content type
  (`/js/tetromino/pool.js`, `/animations.js`, `/pathViz.js`, and
  `/js/enhanced-gameCore/networkEvents.js`).

