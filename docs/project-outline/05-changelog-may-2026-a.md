# 05 Changelog May 2026 A

> Part of the [Tetches project outline](README.md). May 2026 fixes: seventh pass through invalid-moves report.

## Recently Fixed (Feb 2026 - Seventh Pass)

### Game Rules
- **Pawn promotion at 9 moves** (was 13): `PAWN_PROMOTION_DISTANCE = 9`
- **Home zone degradation 2.5 min** (was 5 min): `HOME_ZONE_DEGRADATION_INTERVAL = 150000`
- **Castling implemented**: King moves 2 squares towards rook, rook jumps to crossed square. Works along any axis. Validated in both `_validateMoveByPieceType`, `isValidChessMove`, and `hasAnyValidMoves`.
- **Moving into check is permitted**: Intentional design decision for real-time play.

### King Capture Overhaul
- **Suicidal pawns**: Inherited pawns self-destruct (Lemmings-style) after 3s delay, one every 0.5s. Each destroys its cell, creating islands that decay removes.
- **King prison**: Captured kings go to a prison list (`game.state.kingPrison`) with stats. Only one king per player ever.
- **Colour adoption**: Captor may adopt defeated player's colour/style (tracked in `capturedStyles`).
- **Simultaneous capture resolution**: If two players capture each other within 1s, first-processed wins (random if within 100ms).
- **Dramatic king battle overlay**: Frontend pauses with "VICTORY/DEFEATED/A KING HAS FALLEN" overlay for 5 seconds.

### Player's Bible
- Complete rewrite with all finalised rules from user feedback and gameplay review.

### Visual Themes (Feb 2026)
- **Three-mode cycle**: Normal → Cute → Retro, seamlessly switchable via Mode button.
- **Retro mode**: Inspired by the original 1984 Soviet Tetris. Black CRT terminal aesthetic.
  - Green phosphor (`#00ff41`) for local player, amber (`#ff8800`) for opponents.
  - Chess pieces as Cyrillic text sprites (К, Ф, Л, С, Кн, П) on dark board.
  - CRT scanline overlay via CSS.
  - Dark green board cells, green fog/lighting, no shadows.
- **Exit Game button** moved from bottom bar into the player sidebar menu.
- Session warning in bottom bar now opens the player panel to copy Player Code.

### Stability & Integrity Fixes (Mar 2026)
- **Integrity sweep de-fanged**: Removed aggressive cell/piece purge from `repairChessPieceCellConsistency` that was wiping player and AI territory when player IDs couldn't be found in the current session maps. The island detection already handles disconnected territory correctly.
- **AI roster top-up on restore**: `ensureAiRoster()` at startup checks if the restored world has fewer than 3 AI opponents and creates any missing ones (Novice/Standard/Expert).
- **Gravity multi-row fix**: `_makePiecesFallTowardsKing` now calculates the total number of cleared rows between each cell and its player's king and shifts by that full amount, instead of only shifting by 1 per row.
- **Piece info popup positioning**: `showPieceInfoPopup` now uses `!= null` instead of truthiness to check `mouse.clientX`/`clientY`, preventing fallback to centre when coordinates are `0`.
- **Server log noise reduction**: Removed per-row and per-cell home-zone debug logging from `BoardManager` row-clear checks. Only actual row clears are logged.
- **Yellow row-clear highlight fixed**: `highlightClearedRows` used a hardcoded 16-unit yellow plane. Replaced with a dynamic-width cyan flash that fades out in 600ms, using actual board bounds.
- **Home cells protected during row clear**: `clearRow` now skips any cell containing a chess piece, preventing floating pieces after row clears in degraded home zones.
- **Detonate button repositioned**: Moved from bottom-centre (blocking 3D board clicks) to top-right with `width: max-content`.
- **AI king-only self-detonation**: When an AI has only its king remaining, it automatically detonates and respawns as a fresh AI player of the same difficulty after 5 seconds.
- **AI strategic stubs replaced**: `checkForThreatenedPieces`, `isKingExposed`, and `hasAttackOpportunity` now use real proximity checks instead of random dice rolls.
- **Exit game warning**: The confirm dialog now warns explicitly about losing pieces and territory if the player still has pieces on the board.
- **Chess interactions phase-gated**: `performRaycast`/input handlers now ignore chess selection while in Tetris phase, preventing invalid cross-phase selection states and stuck move UI.
- **Detonation local-state sync**: Successful pawn detonation now immediately removes the local piece mesh + local chess piece entry, so floating pawn visuals cannot persist while waiting for server update.
- **Move-highlight stability fix**: `clearMoveHighlights` no longer disposes shared cached geometry/material each click cycle, preventing broken/unclickable move markers.
- **Explosion performance cap**: `showExplosionAnimation` now limits concurrent effects, reduces particle counts, removes per-frame forced renderer calls, and hard-stops runaway effects (~1.8s safety cap).
- **AI king self-detonation bug fixed**: Corrected argument order for `detonatePawn` and added `pendingRespawn` guard to prevent duplicate/phantom AI respawns.
- **No-valid-moves false-negative guard**: After tetromino placement, server now rechecks move availability after repair and suppresses auto-skip when board still contains owned chess markers.

### Row-clear rewrite — "home cells are empty space" + animated cascade (May 2026)

Players complained that the clearing system was "still a load of shit":
home cells were sometimes counted toward the 8-line threshold, clears
happened instantaneously with no preview of what was about to disappear,
and the existing animation was just a yellow bar drawn AFTER the cells
were already gone. Full rewrite of the find / apply / animate pipeline:

- **Home cells are empty space** (bible §8 rewrite): any cell carrying a
  `home` marker breaks the consecutive-cell count exactly like an empty
  cell would, regardless of whether the home zone is currently "safe"
  (has a chess piece) or "unsafe". Only degraded home zones — whose
  home markers have been converted to `home_converted` tetromino terrain
  — drop out of this protection and clear like any other cell.
- **Find / apply split** (`BoardManager.findClearableLines` /
  `applyClearedLines`): the destructive step is now decoupled from the
  detection step. Detection returns `{ rows, cols, cells }` where
  `cells` is the de-duplicated set of cells that would actually have
  content removed (chess- / home-protected cells are filtered out).
  This lets the new animation know exactly which cells to flash.
- **`LineClearService`** (new, `server/game/LineClearService.js`): an
  async cascade orchestrator that:
  1. detects clearable lines,
  2. emits `cells_clearing` with the cell list + `durationMs`,
  3. awaits the flash window (default 700 ms),
  4. applies the clear, runs gravity, broadcasts `game_update`, emits
     `row_cleared` with an `iteration` field,
  5. loops up to 16 times so gravity-induced **cascade** clears each
     get their own flash + toast before being removed.
- **Client flash animation** (`flashCellsBeforeClear` in
  `public/js/tetromino/animations.js`): per-cell yellow box that pulses
  3× over the flash duration with a sinusoidal opacity / scale curve.
  Wired through `NetworkManager` → `handleCellsClearing` →
  `flashCellsBeforeClear`.
- **AI parity**: AI tetromino placements now also go through
  `lineClearService.runCascade`, so AI-triggered clears flash on every
  player's screen exactly like a human-triggered clear.
- **Tests**: new `tests/server/LineClearService.test.js` (5 tests
  covering immediate vs animated, no-op, cascade ordering, and event
  sequence); two new `BoardManager.test.js` cases for the home-as-empty
  rule (broken run → no clear, full 8-run alongside a home cell → does
  clear); three new cases for the `findClearableLines` /
  `applyClearedLines` split.

### "Pieces vanish for no reason" pass (May 2026, late)

Players reported losing pieces — sometimes their whole army except the king —
while composing a chat message. Root cause was a combination of (a) chess
cells being eligible for direct row-clear removal, (b) a 30-second island
decay grace that was too short for human reaction times, and (c) silent
loss with no UI warning. Fixed wholesale:

- **Chess cells are protected from row-clear removal** (`BoardManager._clearLine`).
  When a clearing line passes through a cell containing a chess marker, the
  cell is preserved entirely (chess marker + terrain underneath). The chess
  piece may now be sitting on an island, in which case island decay handles
  it after the more-generous grace window.
- **Two-tier island decay grace** (`server/game/IslandManager.js`):
  - Terrain-only islands: **90 s** grace (was 30 s).
  - Piece-bearing islands: **180 s** grace.
  Both constants are exported on `IslandManager` so tests don't go stale.
- **Home-zone degradation interval doubled** to 5 minutes (was 2.5). The
  earlier value triggered while users were still composing their first
  message.
- **`island_at_risk` warnings**: the periodic integrity sweep now emits a
  player-targeted toast warning at 60 s / 30 s / 10 s before a decaying
  island collapses. Once-per-threshold to avoid spam.
- **Chess move self-heal**: when the server can't find the source cell or
  the source chess marker, it no longer returns "Source cell not found".
  Instead it runs an integrity pass, force-broadcasts the world state, and
  returns a clear human-readable message ("desync_repaired"). The piece
  isn't lost just because the cell drifted.
- **Lemmings-style king detonation** (`server/king/detonation.js` —
  brand-new service). Both AI-driven lone-king detonations and voluntary
  human king self-destruct now play out as a *layered* explosion: rings of
  cells explode furthest-first, server removes one ring per
  `layerIntervalMs` tick, broadcasts the new state, and emits
  `king_detonation_layer` events between rings. The full sequence is also
  emitted up-front so clients can pre-schedule their animations. All
  connected players see the cascade.
- **Phantom-clear protection sharpened**: `_findClearableLines` still
  counts via `_cellHasClearableContent` (ignoring bare home / centre
  markers); `_clearLine` returns the number of cells actually modified,
  and `checkAndClearLines` only adds a line to the cleared list when at
  least one cell changed. This prevents the misleading "Line cleared!"
  toasts players reported when the run was entirely chess-protected.

Test coverage added: `tests/server/kingDetonation.test.js` (5 tests for
the new service), updated `tests/server/BoardManager.test.js` to assert
chess-cell preservation, updated `IslandManager` and `ChessManager` tests
to use the exported grace constants instead of hard-coded 30/60 s values.

### May 2026 — gravity edge-case, lone-king sweep, activity log, water theme

* `BoardManager._applyGravityTowardsKing` now applies a per-player BFS
  to enforce the **chess-piece connectivity rule**: a cell carrying a
  chess piece only moves with gravity if it's directly adjacent to a
  cleared line or linked to one by an unbroken 4-connected chain of
  single-owner cells of the same player. Cells with terrain alone
  still move unconditionally. Tests in `tests/server/BoardManager.test.js`
  cover adjacent, linked, mixed-owner-broken, and stranded scenarios.
* New `server/king/loneKingSweep.js` service auto-detonates any
  player (human, guest, or AI) reduced to just a king after
  `LONE_KING_GRACE_MS` (60 s) of inactivity. Wired into bootstrap on
  a 15 s tick so guest players who lose everything don't sit on the
  board indefinitely.
* New `server/world/activityLog.js` records significant events
  (placements, moves, captures, decay, detonations, joins/leaves) in
  a rolling 200-event buffer that's persisted with the world. The
  client subscribes to `activity_event` + `activity_log_snapshot`
  and renders them in a slide-in panel (`public/js/activityLog.js`)
  with a clock-shaped toggle button and an unread badge. Clicking
  an entry flies the camera to the relevant cell via
  `window.gameCore.flyToCell`.
* Sidebar fly-to-player camera animation: `flyToPosition` now
  snapshots and disables OrbitControls damping/auto-rotate while
  animating so the controls don't fight per-frame writes. A 250 ms
  per-row cooldown stops rapid clicks from stacking animations, and
  the redundant delegated-container handler that competed with the
  per-row one was removed.
* Tetromino rotation now binds Q/E and R as additional aliases of
  Z/X; the next-piece HUD shows a permanent controls list (rotate,
  move, drop) plus a one-shot "press Z/X to rotate" banner on the
  player's first tetris drop (gated by `localStorage`).
* `scene.js` adds a 1200×1200 animated water plane (via
  `addWaterPlane` + `updateWaterPlane`) under the floating cells in
  normal render mode, so the board reads as actually floating on a
  gentle sea. Disabled for cute / retro to keep their aesthetics
  intact; cleaned up automatically when the render profile changes.

## Cell-system deep rewrite — single-owner gravity + move-based decay (May 2026)

Players reported the cell system felt "fundamentally badly written" — too
many ad-hoc filters, multi-owner cells sliding the wrong way during
gravity, and pieces vanishing on wall-clock timers that never fit human
play patterns. Resolved with a substantial refactor:

- **New `server/game/cells.js` helper module** — the *only* place the
  engine reasons about what an "item" inside `board.cells[key]` means.
  Exposes `getOwner`, `gravityAnchor`, `isClearable`, `stripClearable`,
  `transferOwnership`, plus the `HOME_TYPE` / `CHESS_TYPE` /
  `TETROMINO_TYPE` / `SPECIAL_TYPE` / `CENTRE_TYPE` constants. Every
  cell-aware module (`BoardManager`, `ChessManager`, `TetrominoManager`,
  the chess + tetromino socket handlers, the AI actions) now delegates
  to this module so there's one canonical definition of "single owner",
  "movable", "clearable" etc.
- **Tetris-style gravity, fixed**: `BoardManager._applyGravityTowardsKing`
  was rewritten to process both axes in lock-step and to only move a
  cell when `cells.gravityAnchor` says it has a clear single owner.
  - Single-owner cells gravitate one step closer to their owner's king
    per cleared line, just like Tetris.
  - Cells with conflicting owners (multi-player non-home content) stay
    put — the engine refuses to guess.
  - Cells containing a chess piece always move with the piece's owner
    even if their underlying terrain has gone, so pieces never end up
    floating in mid-air after a clear.
  - Bare home cells stay put because the home overlay is anchored to
    its spawn coordinates.
- **Move-based island decay** (bible §10): `disconnectedSince` is now an
  object `{ since, moveSnapshot }` instead of a bare timestamp. A
  disconnected island decays when **either** the owning player has
  taken `DISCONNECTED_MOVE_LIMIT` moves since the disconnection
  (terrain: 6, piece-bearing: 12), **or** the wall-clock backstop hits
  (terrain: 10 min, piece-bearing: 20 min). The move counter is the
  primary trigger — an actively playing opponent can no longer hoard
  stranded territory just by running out the clock; the time backstop
  cleans up after AFK players.
- **`player.moveCount`** is a new monotonic counter in `World.js`. It
  ticks up on every tetromino placement, chess move, and "Skip chess
  move" action (both for humans and AI). Persisted in `persistence.js`.
- **At-risk warnings updated**: the integrity sweep now toasts the
  affected player at **3 / 2 / 1 moves remaining** (primary) and at
  **120 / 60 / 30 / 10 seconds remaining** (backstop), whichever
  applies. The `island_at_risk` payload carries both axes so the client
  can word the toast appropriately.
- **`cells.transferOwnership` used everywhere** captures or chess moves
  reassign a cell — the player-side and AI-side chess handlers, as well
  as `ChessManager._transferCellOwnership`, now route through the
  helper instead of repeating the same loop.
- **Test coverage**: new `tests/server/cells.test.js` (17 tests for the
  helper module covering every rule above); new `BoardManager` test
  block "gravity rules — bible §15.2" (7 tests: single-owner, multi-
  owner immobility, chess-piece anchoring, home immobility,
  enemy-home+chess anchor, two-axis lock-step, two-row pull); new
  `IslandManager` test "move-based decay: collapses once the owning
  player has taken DISCONNECTED_MOVE_LIMIT moves" exercising the
  primary trigger path. All 193 server unit tests + the socket
  integration test pass.

### May 2026 — UX, replay & ad-system polish

- **Activity log / replay panel** (`public/js/activityLog.js`): rolling
  buffer of the 200 most-recent significant events, surfaced behind a
  clock-shaped toggle pinned to the bottom-right of the viewport. Each
  row shows an icon, who did it, where, and a relative timestamp;
  clicking a row flies the camera to the event location. Server-side
  events come from `server/world/activityLog.js`, are persisted in the
  world snapshot, and are streamed via a `activity_event` socket
  message (with `get_activity_log` for the initial snapshot).
- **Lone-king sweep** (`server/king/loneKingSweep.js`): any player —
  human, guest or AI — reduced to a single king triggers a 60-second
  countdown; any qualifying action (chess move, tetromino placement,
  skip) resets the timer. If the timer expires the king
  auto-detonates (lemming-style) with an explicit
  `reason: 'lone_king_sweep'` (or `'ai_lone_king'` for AI), so the
  death isn't silently attributed to a captor.
- **Tetromino rotation hints**: `Q`/`E`/`R` aliases for `Z`/`X`,
  plus a permanent control legend inside the Next-Piece HUD and a
  one-shot first-drop hint banner (gated by localStorage).
- **Camera-fly stability**: `flyToPosition` now disables
  OrbitControls damping (and any auto-rotate) for the duration of
  the animation and restores them afterwards. The sidebar player-
  bar consolidated onto a single `pointerdown` listener with a
  `FLY_COOLDOWN_MS` debounce, fixing the "click does nothing /
  feels laggy" regression.
- **Water plane** (`public/js/scene.js`): the normal render mode
  now lays a large animated water plane under the board so the
  game feels like it's on the sea rather than in space. Decaying
  islands "sink into the water" which makes the new collapse
  animation read better.
- **Advertiser persistence** (`routes/advertisers.js`): the
  in-memory `Map` is now backed by `advertisers.json` (debounced
  write + sync flush helpers) so registered advertisers survive a
  server restart. The "Advertise Here" link on the home screen
  takes the user to `/advertise` where the Solana-wallet payment
  flow is wired up end-to-end (registration → Phantom connect →
  pay/activate → impressions/clicks/stats).
- **Test coverage**: new `tests/server/loneKingSweep.test.js`,
  `tests/server/advertisers.test.js`, and an extended
  `tests/server/clientImports.test.js` that walks every relative
  `import … from './…'` and asserts the target exists — catches
  typo-broken paths (like the `./uiUtils.js` regression that left
  the player staring at a blank canvas) before they ship.
  204 server tests pass.

### May 2026 (cont.) — Chess-piece lifecycle overhaul

A user reported pieces "just disappearing" with nothing in the
activity log to explain why. Audit showed `world.chessPieces` was
being mutated from a dozen places (chess capture, AI capture,
integrity drops, island decay, line-clear gravity, king detonation,
pawn detonation, player teardown, world reset) and only a couple of
those paths recorded an `activity_event`. Mirror of the earlier
`cells.js` refactor — collapse every mutation into one helper module
and record an event on every removal.

- **`server/game/pieces.js`** (new): the single source of truth for
  chess-piece lifecycle changes. Exports
  `removePiece(world, pieceOrId, { reason, activityLog, ... })`,
  `removePiecesAtCells(world, playerId, cells, { reason, ... })`,
  `removeAllPlayerPieces(world, playerId, { reason, ... })` and
  `relocatePiece(world, piece, newPos)`. Every removal requires a
  `reason` from `REMOVAL_REASONS` (captured / island_decay /
  no_supporting_cell / invalid_position / owner_gone /
  king_detonation_collateral / suicidal_pawn / detonated /
  player_left / world_reset).
- **New activity-log events**: `chess_piece_lost`,
  `chess_pieces_lost` (bulk summary for player teardown),
  `chess_piece_captured`, `chess_piece_detonated`,
  `chess_piece_promoted`. The client (`public/js/activityLog.js`)
  renders each with an appropriate icon and a reason-specific
  message ("Alice's rook (3, 5) — stranded — island decayed").
- **Silent paths fixed**:
  - `server/world/integrity.js`: orphaned chess pieces (no
    supporting cell, invalid position, owner gone) used to be
    `console.log` only — now emit `chess_piece_lost` via the
    helper.
  - `server/game/IslandManager.js`: per-piece island decay
    now goes through `pieces.removePiecesAtCells` with
    `reason: 'island_decay'` and a `protect()` predicate for
    home-zone safety, so each decayed piece gets a row in the
    activity panel (was previously hidden behind an aggregate
    `island_decayed` event with `hasPiece: false` hard-coded).
  - `server/king/detonation.js`: king detonation now emits the
    `king_detonation` event itself (so the activity panel
    matches the lemming animation), and every non-king piece
    the explosion takes with it is logged as
    `chess_piece_lost` with `reason: 'king_detonation_collateral'`.
    (Previously rooks/pawns sometimes survived the splice
    and were quietly cleaned up by the next integrity tick.)
  - `server/king/capture.js`: suicidal pawns after a king
    capture record `chess_piece_detonated` (reason:
    `suicidal_pawn`).
  - `server/ai/actions.js`: AI captures used to splice the
    target silently — now route through `pieces.removePiece`
    (silent) AND record a `chess_move` with `captured:{…}`,
    matching the human flow.
  - `server/sockets/chess.js`: voluntary pawn detonation
    records `chess_piece_detonated`; promotion records
    `chess_piece_promoted`.
  - `server/world/lifecycle.js`: player teardown
    (`removePlayerCompletely`, `rehydratePlayer`) records a
    single `chess_pieces_lost` summary event before the bulk
    `filter`.
- **Bootstrap wiring**: `gameManager.activityLog`,
  `gameManager.islandManager.activityLog` etc. are stamped on
  bootstrap so any subsystem reachable through the gameManager
  can record events without us threading the dependency
  through every signature. New constructor parameters on
  `createKingDetonationService`, `createKingCaptureService`,
  `createLifecycleService` accept the activity log directly.
- **Test coverage**: new `tests/server/pieces.test.js`
  (10 tests: removePiece, removePiecesAtCells with `protect`,
  removeAllPlayerPieces summary event, relocatePiece, silent
  flag, fallback to generic `record()`); new
  `tests/server/integrityActivityLog.test.js` (3 tests:
  no_supporting_cell, invalid_position, owner_gone all emit
  `chess_piece_lost`); new IslandManager test
  "records chess_piece_lost activity-log events when island
  decay removes a piece". All 218 server tests pass.

### May 2026 (cont.) — Bishop forward-move bug + remaining silent paths

After the chess-piece lifecycle overhaul, the user reported two
follow-on issues:

1. **A bishop refused to move "forward" but worked "backward"** — the
   client move-set generator (`public/js/boardFunctions/moves.js`)
   clamped sliding-piece rays against a cached `boardBounds`
   rectangle. When the snapshot lagged the server (e.g. immediately
   after a tetromino placement extended the board), the cached
   rectangle was smaller than the actual playable area, so forward
   diagonals appeared "off the board" even when their cells existed.
   The fix removes the bounds check entirely — the sparse
   `hasBoardCell` check is the authoritative terminator. A
   `MAX_SLIDE_STEPS` safety cap (256) protects against pathological
   loops on a corrupted snapshot.

2. **"Cells just disappeared from me" with no activity trace** — the
   chess-piece overhaul covered piece losses but two cell-level
   silent paths remained:

   - **Line-clear cascade**: `LineClearService.runCascade` /
     `runImmediate` now accept an `activityLog` and emit a
     `rows_cleared` event per cascade iteration (`{ rows, cols,
     cellCount, playerId }`). Previously the `recordRowsCleared`
     helper existed but was never wired in.
   - **Chess-move territory transfer**: when a chess move lands on
     another player's non-home cell, `cells.transferOwnership`
     reassigns the underlying tetromino marker to the mover.
     This used to be completely silent; both `server/sockets/chess.js`
     and `server/ai/actions.js` now emit a `territory_captured`
     event (`{ fromPlayerId, toPlayerId, cellCount, sampleCells }`)
     for every previous owner whose content was reassigned.

   Combined with the chess-piece events from the previous turn,
   every cell or piece that the user can lose now leaves an
   activity-log row.

- **Dual-ownership rule clarified and regression-tested**: a cell
  with content from two players is part of *both* players' islands
  for path-to-king purposes (`IslandManager.detectIslands` /
  `hasPathToKing`). The new test
  `tests/server/activityLogCoverage.test.js` builds a bridge cell
  shared between two corridors and asserts both players' BFS
  finds their king through it. This isn't a behaviour change — the
  engine already worked this way — it just locks the rule in
  before another refactor regresses it.

- **Activity log helper expanded**: `recordTerritoryCaptured` added
  to `server/world/activityLog.js`; the client
  (`public/js/activityLog.js`) renders the new event with a
  shield icon and "X captured a cell from Y at (a,b)" text.

- **Test coverage**: new `tests/server/activityLogCoverage.test.js`
  (2 tests covering `rows_cleared` emission + dual-ownership
  BFS). All 220 server tests pass.

### May 2026 (cont.) — Knight "vanished into the void" capture race

After the previous activity-log instrumentation, a player reported:
*"I went to capture a piece with my knight. Instead my knight just
disappeared. Half a minute later a message came up saying my knight
was captured and it played a dissolve animation nowhere near where it
was!"* Investigation found four overlapping problems:

1. **Human captures bypassed `pieces.removePiece`.** The chess socket
   handler in `server/sockets/chess.js` did
   `world.chessPieces.splice(idx, 1)` directly on the captured piece,
   so the activity log never got a `chess_piece_captured` entry. The
   only signal of the capture was the broadcast `chess_move` event
   (toast only). This is now routed through the central helper, with
   `reason: CAPTURED` and a `capturedBy: { playerId, pieceId,
   pieceType }` context so the resulting `chess_piece_captured`
   activity entry shows who took the piece *and* where.

2. **No dedicated capture VFX.** The dissolve animation the user saw
   "nowhere near" the knight was the `island_decay` sand fall for
   cells stranded by the capture — at the server's stranded-cell
   coordinates, not the captured piece's cell. The chess capture
   itself triggered nothing visual beyond the broadcast `chess_move`
   toast. The server now emits a dedicated `chess_capture` event with
   `{ at: { x, z }, capturedPiece, capturedBy }` — the precise
   server-authoritative cell — and the client (`networkEvents.js`,
   `tetromino/animations.js`) plays a flash + ring + particle burst
   right there, optionally fading out the captured piece's mesh in
   place. The broadcast `chess_move` now also carries `movedFrom`,
   `movedTo` and a `capturedPiece` snapshot with position, so the
   capture toast can say *where* the piece died: "Your knight at
   (5, 7) was captured!".

3. **Optimistic move + concurrent game_update yanked the mesh.** The
   client animates the chess move for ~500ms before contacting the
   server. If a `game_update` arrived mid-tween (which is exactly
   what happens when the user's piece was *already* gone server-side),
   `updateChessPieces` ripped the mesh out from under the running
   animation — the user saw their knight blink out without ever
   reaching its destination. The fix:
   - `chessInteraction.js` exports `setInFlightMove` /
     `clearInFlightMove` and pins the moving piece's id on
     `gameState.inFlightMove` for the duration of the optimistic
     animation + ack round-trip (with a 2-second safety cap).
   - `updateChessPieces.js` honours the pin: a piece that's still in
     flight is *kept in the scene* even when it's missing from
     `chessPieces`. Once the ack resolves, the pin is dropped and
     the next reconciliation snaps to truth.
   - The rejection handler (`handleChessMoveRejection`) is now
     reason-aware: `piece_gone` quietly forces a re-sync and shows
     a clear toast instead of trying to revert-animate a missing
     mesh; `desync_repaired` reverts the visual; rate-limited
     rejections re-pin briefly so the next legitimate move starts
     clean.

4. **`chessFailed` events were ignored.** The server emits a
   `chessFailed` socket event alongside the ack rejection, but no
   client code subscribed to it — failures only ever surfaced via
   the ack callback path. `NetworkManagerClass.js` now subscribes,
   and `networkEvents.js` has a dedicated `handleChessFailed` that
   surfaces a reason-specific toast, clears the in-flight pin,
   forces a chess-piece re-sync, and clears the selection — even
   if the ack callback path were ever to break.

   Closely related, `sendMessage` used to overwrite the server's
   `reason` field with a generic `validation_error` for anything
   that looked like a validation message. The dispatcher now
   preserves the explicit server reason (`piece_gone`,
   `desync_repaired`, `rate_limited`, …) so callers can
   distinguish them.

The chess-piece silent-removal audit was also tightened up: every
remaining `world.chessPieces.splice(…)` outside `server/game/pieces.js`
has been routed through `pieces.removePiece` (the king detonation
final splice uses `{ silent: true }` since `king_detonation` already
carries the meaning; `ChessManager._scheduleSuicidalPawns` and the
legacy `executeChessMove` capture path are now consistent with the
live socket handler).

- **AI symmetry**: `server/ai/actions.js` now records
  `chess_piece_captured` (with the captured piece's position) and
  emits the new `chess_capture` event on every AI capture — the
  human and AI flows are now indistinguishable from the client's
  point of view.
- **Test coverage**: new `tests/server/chessCaptureFlow.test.js`
  (5 tests: human capture emits `chess_capture` + activity event
  with correct cell; AI capture does the same; `chessFailed`
  preserves `reason: piece_gone`; `ChessManager.executeChessMove`
  emits the activity event from inside the legacy path too). All
  225 server tests pass.

