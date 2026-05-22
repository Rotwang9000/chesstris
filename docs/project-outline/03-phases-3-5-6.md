# 03 Phases 3 5 6

> Part of the [Tetches project outline](README.md). Phase 3–6 architecture and client hardening.

## Phase 3 — Single Source of Truth (May 2026)

The server now stores game state in exactly **one** authoritative place.
This was previously split across three independent stores (the socket
layer's `games`/`players`/`computerPlayers` Maps in `server.js`,
`GameManager.games`, and `routes/api.js`'s parallel REST sandbox).
Phase 3 unifies those into a single `World` module.

### Architecture
- `server/world/World.js` — singleton world record with `id`, `board`,
  `chessPieces`, `islands`, `players` (keyed by id), `homeZones`,
  `currentTurns`, `lastAction` plus tunables (`maxPlayers`,
  `homeZoneDistance`, `gameMode`).  Mutators (`upsertPlayer`,
  `removePlayer`, `eliminatePlayer`, …) mark a `dirty` flag the
  persistence layer reads.
- `server/world/Sessions.js` — ephemeral `socket.id ↔ playerId` map.
  Not persisted; reconnecting clients re-bind via the
  `tetches_player_id` cookie.
- `server/world/Disconnects.js` — in-memory reconnect grace timers.
- `server/world/LegacyAdapters.js` — thin Map-shaped views over the
  world (`gamesMap`, `playerMap({ requireComputer })`,
  `persistentPlayerMap`).  The Phase-3 cut introduces them so the
  ~3,600-line `server.js` keeps working without rewriting every
  call-site at once.  Future cleanup: replace each
  `games.get(GLOBAL_GAME_ID)` with `World.getWorld()` and each
  `players.get(pid)` with `World.getPlayer(pid)`.

### What changed
- `server.js` no longer owns its own `games`/`players`/
  `computerPlayers`/`persistentPlayers` Maps — those are now legacy
  adapters backed by `World`.
- `GameManager` is stateless: it owns the sub-managers (board, chess,
  tetromino, islands, players, AI) but no `this.games` map.
  `gameManager.getGame(id)` returns the world.
- `server/persistence.js` now reads/writes a single unified snapshot
  (`{ version: 2, world: WorldState }`).  Snapshots written by the
  previous code (v1, with separate `game`/`gameManagerGame`/
  `humanPlayers`/`computerPlayers`/`persistentPlayers` fields) are
  migrated forward on first load.  The existing `data/world.json`
  loads cleanly into the new format.
- `routes/api.js` has been gutted — no more parallel `games` Map and
  no more stub 2D-board move handlers.  The REST surface now exposes
  health/world summary endpoints and external-AI registration only;
  gameplay continues to flow through Socket.IO so the world stays
  authoritative.
- AI-roster setup (boot, restart, top-up) now registers the bot via
  `gameManager.registerPlayer` **first** (which sets up the home
  zone and pieces), then merges the AI-specific metadata on top.

### Client-side reconciliation
The client already reconciles to the server via the existing
`game_update` socket event (`public/js/enhanced-gameCore.js`
handles full and delta updates and merges them into the local
sparse board).  Optimistic placement is straightforward to layer on
top — apply the move locally to drive the animation, then accept
whatever `game_update` the server broadcasts as authoritative.

### Tests
- New: `tests/server/world.test.js` — 12 cases covering `World`
  mutators, `Sessions` bind/unbind, `Disconnects` grace timers, and
  the v1 → v2 persistence migration.
- All **124** server-side tests pass.

## Phase 5 — May 2026 — Client refactor & WebGL hardening

The previous phases all targeted the server.  Phase 5 ports the same
philosophy to the client: split big files into focused modules,
delete dead code, and replace the 2D-mode redirect loop with a
graceful WebGL-unavailable overlay.

### WebGL/redirect loop fix
- `public/js/main-enhanced.js` now runs an early WebGL probe via
  `debugUtils.printSystemDiagnostics()`.  If WebGL and WebGL2 are both
  unavailable, it shows the new `showWebglUnavailableOverlay()` and
  throws.  This means deeper renderer failures never reach the
  redirect-to-2D path.
- `public/js/enhanced-gameCore.js` no longer redirects to
  `/index-2d.html` on context failure — it calls the same overlay.
- `public/index-2d.html` and `public/2D/index.html` are now static
  "2D mode has been removed" pages with no client-side redirect, so
  even a stale bookmark can't loop the user back to the broken state.

### Client-side modularisation
Several previously monolithic modules were broken into focused
sub-modules under their own folders:

- `public/js/tetromino.js`: **3282 → 253** lines.  Logic now lives
  under `public/js/tetromino/`:
  - `shapes.js`, `bag.js`, `validation.js`, `pool.js`, `rendering.js`,
    `spawn.js`, `network.js`, `nextPiece.js`, `animations.js`,
    `pathViz.js`, `movementQueue.js`.
- `public/js/boardFunctions.js`: **2577 → 70** lines.  Logic now lives
  under `public/js/boardFunctions/`:
  - `cells.js`, `colours.js`, `pieces.js`, `moves.js`, `rendering.js`.
- `public/js/chessPieceCreator.js`: **1945 → 228** lines.  Logic now
  lives under `public/js/chessPieceCreator/`:
  - `materials.js`, `russianPieces.js`, `simplePieces.js`,
    `specialModes.js`, `validation.js`.
- `public/js/enhanced-gameCore.js`: **1348 → 715** lines.  Heavy
  helpers moved to `public/js/enhanced-gameCore/`:
  - `networkEvents.js`, `webglOverlay.js`, `axisHelpers.js`,
    `gameOverOverlay.js`, `orbitControls.js`.
- `public/js/scene.js`: **1046 → 770** lines (dead `setupScene` /
  `rebuildScene` removed).
- Toast notifications consolidated onto the single exported
  `showToastMessage()`; `main-enhanced.js` re-uses it instead of its
  own local copy.

### Dead-code sweep
The following files were unused and have been removed entirely:
- `public/js/utils/gameRenderer.js` (2221 lines).
- `public/js/utils/boardManager.js` (284 lines).
- `public/js/utils/texture-generator.js` (263 lines).
- `public/js/utils/three.js` (57 lines).
- `public/js/test-boardFunctions.js` (43 lines) and the matching
  `public/test-boardFunctions.html`.
- `public/js/updatePlayerBar.js` (406 lines).
- `public/js/models.js`.

Plus dead functions removed from surviving files:
- `findPlayerKingPosition`, `addChessPiece`, `debugAdjacencyCheck`,
  `updateBoardCell`, `createBoardCells`, `moveChessPiece`,
  `selectChessPiece`, `moveSelectedChessPiece`,
  `synchronizeBoardState`, `handleTetrisPhaseClick` from
  `boardFunctions.js`.
- `setupScene`, `rebuildScene`, `onWindowResize` from `scene.js`.
- `registerCustomModel`, `loadCustomModels` from
  `chessPieceCreator.js`.
- `updateBoardCenter`, `handleNetworkErrorDuringPlacement` and a
  block of unused imports from `enhanced-gameCore.js`.

### Tests
- `tests/server/staticAssets.test.js` now covers all new
  sub-modules (35 cases total).
- Full suite still green: **124 server-side tests pass**.

## Phase 6 — May 2026 — Multiplayer polish & UX safety

### Home-zone placement now clusters new players
- `server/boardGenerator.js` previously seeded every new home zone
  from `(0, 0)`, so the 21st player ended up 100+ units away from the
  origin while existing players sat near the centre. New algorithm:
  - Computes the **centroid** of existing zones, plus 1–3 random
    neighbour anchors, and tries radii `[10, 14, 18, 24, 32]` around
    each. Only falls back to a wider centroid-based spiral if those
    fail.
  - Removed all per-attempt overlap-check `console.log` lines that
    were flooding the server log on each join.
- `tests/server/boardGenerator.test.js` (new): guards against the
  regression, asserting the 20th player lands within 60 units of the
  cluster centroid.

### Chess interaction lock-out fixes
- `public/js/chessInteraction.js` was calling
  `removeValidMoveHighlights()` — a function that does not exist —
  inside `moveChessPieceToCell`. The `ReferenceError` left
  `gameState.processingMove = true` permanently, so **every
  subsequent click was ignored** (which matched the user-reported
  "after I drop a tetromino the pieces aren't selectable any more").
  Fixed to call the real `clearMoveHighlights()`.
- Clicking an empty cell or off-board sky while a piece is selected
  now clears the selection (and dismisses any pending detonate
  button) rather than leaving the player visually locked in.
- `Escape` now always clears the chess selection from anywhere.

### Row-clear flash spam reduced
- `public/js/tetromino/network.js` ignores `row_cleared` events from
  remote players; in a 20-player world we were drawing dozens of
  cyan stripes per minute that meant nothing to the local player.
- `public/js/tetromino/animations.js` clamps the flash bar to 12
  cells centred on the local king (was the full board width/depth,
  hundreds of units long in a busy shared world).

### Dynamic imports and dead code
- `public/js/unifiedPlayerBar.js` no longer dynamically imports
  `pieceHighlightManager.js` (violated the project rule).  Static
  import + removed unused fallback shims (~35 lines).
- `public/js/inputManager.js` lost the unused `handleMouseDown`
  helper.

### Disconnected-island grace period
- `server/game/IslandManager.js` no longer wipes territory the instant
  it loses connection to its king. Cells are stamped with a
  `disconnectedSince` timestamp; only islands that have been adrift
  for `DISCONNECTED_GRACE_MS` (30 s) actually collapse. Reconnecting
  via a bridge tetromino clears the timestamp and saves the cells.
- The timestamps are persisted (`server/world/World.js`,
  `server/persistence.js`) and broadcast in `game_update`
  (`server/net/broadcasts.js`).
- `public/js/boardFunctions/rendering.js` reads the map and renders
  decaying cells with a translucent + faintly red-glowing material so
  the player can see exactly what's about to be lost.
- `public/js/tetromino/network.js` now uses the server's `reason`
  field for clearer "no path back to your king" / "must touch your
  own territory" toasts when a tetromino is rejected (no more
  cryptic "dissolved into sand").

### World gravity (slow drift)
- `server/world/gravity.js` adds a once-a-minute world-gravity tick
  driven from `server/bootstrap.js`. When a player's home-zone centre
  is more than `GRAVITY_TRIGGER_DISTANCE` (60 cells) from the
  centroid of all live players, their entire territory (cells +
  chess pieces + home zone + `disconnectedSince` keys) slides one
  cell along the dominant axis towards the centroid. Shifts that
  would overlap another player are skipped silently. New
  `tests/server/gravity.test.js` covers centroid, footprint, safe
  shift, apply-shift and tick behaviour.

### Normal-mode sky decorations
- `public/js/scene.js` gains `addSkyDecorations()` for the default
  render profile: a layered sun + glow, ~22 large drifting clouds in
  a wide ring above the board, ~36 pastel mountain silhouettes on the
  horizon, and ~8 slow-orbiting birds.
- The new `animateSkyDecorations()` runs from `public/js/gameLoop.js`
  in normal mode only; the `DECORATION_NAMES` cleanup in
  `setupLights` disposes them when the render profile flips.

### King-support repair before island detection
- `IslandManager` now calls `_ensureKingSupportCells(game)` *before*
  `detectIslands(...)` in both `checkForIslandsAfterRowClear` and
  `updateIslandsAfterTetrominoPlacement`. Previously a king sitting
  on a cell whose tetromino content had been consumed could read as
  "off-island", and the player's entire home zone would be flagged
  as disconnected (and eventually decay).
- `_refreshDisconnectedTimestamps(game, islands)` now runs on every
  detection pass — not just when there are still-disconnected
  islands — so cells that have been bridged back to the king lose
  their "decaying" marker immediately, not on the next destructive
  event.

### Chess-phase skip + auto-skip
- The previous `tetromino.js` socket handler had a defensive override
  that *suppressed* auto-skip if the player still had any chess
  marker on the board. That left players stuck in a chess phase with
  no legal moves. Override removed — `hasValidChessMoves(...)` is now
  the single source of truth.
- New `skip_chess_move` socket handler in `server/sockets/chess.js`
  rolls a fresh tetromino and broadcasts the change. The frontend
  surfaces this via a "Skip chess move" button
  (`public/js/skipChessButton.js`) that fades in 30 s after the chess
  phase starts and cancels itself once a move is made or a new
  tetromino arrives.
- `public/js/tetromino/movementQueue.js` no longer flips to the chess
  phase on a *failed* tetromino — instead it always hands the player
  a fresh piece. The authoritative `hasValidMoves` flag still drives
  the chess phase on *successful* placements.

### Camera fly-to-king fallback
- `public/js/setupCamera.js#moveToPlayerZone` now falls back to the
  centre of a player's home zone when their king is missing from
  `gameState.chessPieces`. Sidebar clicks always do *something*
  instead of silently failing, and the click handler surfaces a toast
  if even the home zone is unreachable.

### Cell ownership transfer on chess capture
- `server/sockets/chess.js`'s `chess_move` handler now transfers
  non-home cell content to the mover when landing on an enemy cell
  (parity with `ChessManager.executeChessMove`) and immediately
  triggers an integrity pass so islands stranded by the capture
  decay on their grace timer rather than waiting for the periodic
  10 s sweep.

### Orphan-marker tolerant validation
- `ChessManager.isValidChessMove`, `TetrominoManager.validateTetrominoPlacement`,
  and `IslandManager.hasPathToKing` now cross-reference cell-level
  chess markers against the authoritative `chessPieces` array. Markers
  whose `pieceId` no longer matches a live piece (e.g. stale residue
  between a chess move and the next integrity sweep) are ignored, so
  a valid move no longer reads as "invalid" until the next pass cleans
  up the orphan. Two regression tests in `tests/server/` lock this in.

### Turn-action button stack
- `public/js/skipChessButton.js` now owns a shared "turn action stack"
  container anchored directly under the Next Piece widget. Both skip
  buttons (`Skip chess move`, `Skip to chess move`) and the Detonate
  Pawn/King button now live in this stack, so toasts and alerts never
  hide behind them and the buttons never overlap.
- Failing a tetromino drop arms a 30s timer for the new "Skip to chess
  move" button. Successful drops + new tetrominos cancel it.

### Sidebar polish
- Local player is now pinned to the top of the player list.
- The sidebar colour swatch matches the in-scene palette (warm wood
  for the local player, green/cyan/blue hues for opponents) instead of
  the previous misleading bright red.
- Click handlers gained click-feedback (a brief pulse + scale) and a
  console log so we can confirm the click landed even when the camera
  silently fails. `flyToPlayerKing` also logs target state for easier
  diagnostics.

### Floating-cell aesthetic
- Normal-mode cells now sit on a 3-puff white cloud created in
  `public/js/boardFunctions/rendering.js`. Clouds are cached, share
  geometry/material, and are hidden under decaying cells so dying
  islands visually lose their support. Cute mode (the 8-bit space
  theme) and retro mode both opt out — cute uses its own star/heart
  bed and retro is intentionally flat — so clouds only appear under
  the default render profile.

### Row-clearing rewrite (no more phantom clears)
- `BoardManager._cellHasClearableContent` now defines what counts as
  "filled" for line clearing: a cell with at least one non-home,
  non-special-marker item. Bare home markers in unsafe / degraded
  home zones no longer pad the consecutive count — they couldn't be
  cleared anyway, and treating them as filled was producing phantom
  "Line cleared!" toasts on every drop.
- `_clearLine` now follows the bible §8 properly: it strips **all**
  non-home content, including chess markers. The next integrity pass
  removes the orphaned pieces (kings get re-anchored with a fresh
  king-anchor cell). Players asked why "8 in a row" cleared only the
  T they just dropped and left the chess pieces — this is why.
- `_clearLine` reports how many cells it actually modified.
  `checkAndClearLines` only adds an axis index to the cleared list
  when at least one cell changed, so the `row_cleared` socket event
  is never emitted for a line whose entire run is safe-home cells.
- `isCellInSafeHomeZone` now cross-references chess markers against
  the authoritative `chessPieces` array, so a stranded marker can't
  keep an empty home zone artificially "safe".

### Integrity tightening
- Kings on stripped-but-non-empty cells (line clear left an enemy
  home marker but stripped the king's own terrain) are now
  re-anchored with a fresh king_anchor tetromino cell instead of
  leaving the king floating on hostile territory. Non-king pieces
  in the same state are left alone and resolved by the standard
  island-decay grace window, matching the bible.
- AI chess captures (`server/ai/actions.js`) now transfer cell
  ownership the same way human captures do, so the AI never strands
  enemy terrain under itself.
- Captures (human and AI) now log to the server console with both
  attacker and victim piece IDs and the square, making
  "where did my pawn go?" traceable.
- Toast notifications for "Your <piece> was captured!" now use a
  louder red `alert` variant for 5 s so the local player can't miss
  it even when looking elsewhere on the board.
- `BoardManager.addToCellContents` is no longer fooled by legacy
  snapshots that wrote an object (rather than an array) at the
  centre marker. Object cells are upgraded to arrays in place.

