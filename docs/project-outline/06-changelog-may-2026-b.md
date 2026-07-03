# 06 Changelog May 2026 B

> Part of the [Tetches project outline](README.md). May 2026: piece locator, wings rule, UX cleanups.

### May 2026 (cont.) — "Lots of dissolving + most moves Invalid" report

User came back with three intertwined complaints:

1. *"Lots of dissolving going on"* — many overlapping sand-fall
   animations playing simultaneously.
2. *"It's lagging — we need to miss frames if things are taking too
   long"*.
3. *"Every move is coming up Invalid chess move … even the local
   side gets it wrong — see here the queen can clearly do the
   diagonal, yet it isn't an option"*.

The first two turned out to be the same problem from different
angles, the third was a snapshot-staleness race.

**Sand-dissolve render-storm.**
`public/js/tetromino/animations.js → showSandDissolveFallAnimation`
was calling `renderer.render(scene, camera)` on every animation
RAF tick — so every cell dissolve queued its own full scene
render in addition to the per-frame render the main game loop
already did. With the 40-cell island-decay throttle, that's up to
40 extra scene renders *per browser frame* — which is exactly
the GPU pressure that showed up as "lag" once a decay storm
started. The inner render call has been removed; particles are
drawn by the regular game-loop render pass like every other
scene member.

**Per-cell dedupe for island_decay.**
`networkEvents.handleIslandDecay` keeps a small Map of
`"x,z" → last-playback-ms` and refuses to spawn a fresh sand
dissolve on a cell whose previous dissolve started less than
1500ms ago. Repeat broadcasts from back-to-back integrity
passes (every 10s) no longer stack on top of each other for the
same cell.

**Frame-budget governor.**
`public/js/gameLoop.js` now treats any inter-frame gap >33ms
(below 30 FPS) as "we're falling behind" and skips decorative
work (water plane animation, ambient particles, sky decorations,
cloud rotation, LOD update, `animationsModule.updateAnimations`)
for the next frame. After `RECOVERY_FRAMES` (6) consecutive
on-budget frames we drop back into full mode. Controls,
TWEENs and the renderer call NEVER skip — input always stays
responsive.

**Move-generator O(N²) → O(N).**
`getChessPieceMoveSets` previously called `getChessPieceAt`
(linear scan over `chessPieces`) inside every direction loop —
~64 lookups × 50 pieces = 3200 string compares per call. We now
build a `Map<"x,z", piece>` once at the top of each call (and
again ONCE at the top of `analyzePossibleMoves`, reused for all
of a player's pieces) so lookups are O(1). On a 50-piece board
the per-call cost dropped from ~4.5 ms to ~0.2 ms (>20× faster)
— that gives plenty of headroom even on a phone GPU.

**Refactor sidecar**: `getPiecesForPlayer` moved from
`public/js/boardFunctions/pieces.js` into `cells.js` so the
move generator no longer transitively imports
`centreBoardMarker.js` (and therefore the whole renderer
graph). This unblocks Node-side unit testing of the client move
generator — which we now use.

**Invalid-chess-move "destination_missing" vs "invalid_geometry".**
The user's queen-can't-do-diagonal report is a snapshot race:
the client's view of `gameState.board.cells` includes a square
that the server has already decayed/cleared. The old server
reply was a bare `chessFailed: "Invalid chess move"` with no
hint of *why*, so the client's stale highlight stayed exactly
where it was. The server now distinguishes:

- `destination_missing` — target square has no cell on the
  server. The chess socket pushes a forced full game_update
  immediately so the client's next click is against the real
  board, not the cached one.
- `invalid_geometry` — destination exists but the piece type
  can't move there. No refresh; the user just clicked wrong.
- `piece_gone` — already existed; piece id no longer in
  `world.chessPieces`.
- `desync_repaired` — already existed; source cell was
  self-healed.
- `rate_limited` — already existed; CHESS_MOVE_COOLDOWN_MS.

`public/js/chessInteraction.js → handleChessMoveRejection`
forces `gameState._forceUpdate = true` on both
`destination_missing` and `desync_repaired` so the client
snapshot is rebuilt in place.

**Test coverage added (48 new tests):**
- `tests/server/chessMovesCoverage.test.js` (44 tests):
  • Every piece type's basic moves on a stamped board.
  • Pawn orientations 0/1/2/3, including diagonal capture
    direction.
  • Client move generator agrees with server validator on a
    bunch of mixed-terrain layouts.
  • Realistic "queen in front of own pieces, diagonals are free
    even when row is blocked" matches the user screenshot.
  • Stale orphan chess-marker on source / in path does not
    block.
  • LIVE chess piece in path DOES block.
  • Move generator handles 50-piece board <50ms; whole-player
    `analyzePossibleMoves` <75ms for 20 iterations.
  • `destination_missing` vs `invalid_geometry` distinguished by
    `isValidChessMove`.
- `tests/server/chessMoveErrorReasons.test.js` (4 tests):
  • Full socket round-trip asserting the rejection payload
    carries the correct `reason`, the failed cell in
    `attempted: { x, z }`, and a forced
    `broadcastGameUpdate({ forceFullUpdate: true })` on
    `destination_missing` but NOT on `invalid_geometry`.

All 273 server tests pass.

### Single shared "piece locator" + activity-logged rejections

The user kept seeing "Invalid chess move" toasts on what looked
like obviously legal moves, with the Recent Activity panel
permanently empty. Two real bugs were behind it:

1. **Client / server / AI all disagreed about who's on what
   square.** The socket validator (`isValidChessMove`) walked
   cell markers filtered by `livePieceIds`; the AI validator
   (`validateChessMove → _checkPathObstruction`) walked raw
   markers; the client move generator walked `chessPieces`.
   In any state where the three sources diverged (phantom in
   `chessPieces`, stale marker, ghost id) the engines gave
   different answers — and the user saw the discrepancy as
   "Invalid chess move".

2. **The Recent Activity panel never received any events.**
   `NetworkManagerClass.js` was missing socket listeners for
   `activity_event` and `activity_log_snapshot`, so the
   server's stream went nowhere.

**The fix is a single shared `_buildPieceLocator(game)` on
`ChessManager`.** Everywhere a "what's on (x,z)?" question is
asked — `isValidChessMove`, `validateChessMove`,
`_checkPathObstruction`, `_validateMoveByPieceType` (pawn),
`_validateCastle`, `hasValidChessMoves` — they all call this
locator. The locator's truth ordering is:

1. `game.chessPieces` — every live piece's position is occupied.
2. Legacy cell markers WITHOUT a `pieceId` (older migration
   data the user can't easily clear). Markers WITH a `pieceId`
   that no longer matches a live piece are treated as ghosts
   and ignored.

The client `public/js/boardFunctions/moves.js → buildPieceIndex`
mirrors rule 1. (Rule 2 is server-only; legacy markers don't
appear in fresh game state and the per-frame `Object.entries`
scan is too costly on a 41×41 board. If a discrepancy ever
matters, the server's rejection reason now tells the user why.)

**The client move generator now offers castling.** A new
`addCastlingMoves` routine scans each cardinal direction from
the king for a friendly unmoved rook with a clear path of real
board cells, exactly mirroring `_validateCastle`. The king's
landing square is highlighted; the rook's auto-move (the cell
the king crosses) is intentionally NOT a separate highlight.

**Every chess-move rejection is now logged.**
`server/world/activityLog.js → recordChessMoveRejected` records
the failing piece, source, target, and reason. `server/sockets/
chess.js → classifyMoveRejection` translates the failure into
a stable code (`destination_missing`, `same_square`,
`friendly_blocker`, `path_blocked`, `path_off_board`,
`bad_geometry`, `piece_gone`, `not_your_piece`,
`desync_repaired`). The client renders those codes in the
Recent Activity panel and as toast text, so the user always
sees *why* a move was refused.

**Test coverage added (56 new tests):**
- `tests/server/chessGameplayScenarios.test.js` (56 tests):
  • Queen diagonals on tiny / sparse footprints (the user's
    screenshot).
  • Bishop bidirectional moves (the "forwards only" bug).
  • Pawn movement / capture matrix in all four orientations.
  • Pawn-promotion behaviour.
  • King + castling (short, long, blocked, post-move, gap).
  • Knight + queen capture rays.
  • Desync robustness — orphan and ghost markers, source-only
    chess markers, mid-move position drift.
  • Strict client/server agreement on a dozen snapshot races
    (phantom piece in `chessPieces` with no marker, marker
    pointing to a piece that's elsewhere, etc.).
  • `validateChessMove` (AI path) and `isValidChessMove`
    (socket path) agree across clean AND messy snapshots.
  • Castling appears in the client's move-set when valid;
    the rook's destination does NOT.

All 108 chess-related server tests pass; the move-generator
50-piece performance lock at <50 ms is intact (≈42 ms).

### Wings rule for chess pieces on cleared rows (bible §15.2)

Players said "when a row is flashing to be cleared, any pieces on
it should grow bird wings, hover until the cells have finished
moving, and then attempt to land". The previous behaviour
silently shielded chess cells from clearing (`cells.isClearable`
returned false on any cell with a chess marker), which made the
gravity-fed re-support feel arbitrary — sometimes a piece's cell
re-appeared, sometimes not, with no on-screen explanation.

The new rule, server-side:

1. `cells.isLineClearTarget` + `cells.stripForLineClear` —
   parallel helpers to the legacy `isClearable` /
   `stripClearable`. The new ones treat chess markers as
   strippable (the cell loses the marker, the piece becomes
   "airborne") while still preserving home / centre / special
   markers.
2. `BoardManager._clearLine` accepts an `airbornePieces[]`
   accumulator. For every cell it strips, if a chess marker was
   removed it pushes `{ pieceId, x, z, player }`.
3. `BoardManager.settleAirbornePieces(game, airbornePieces, …)`
   resolves the fate of each airborne piece:
   • No cell at `(x, z)` after gravity → `chess_piece_lost` with
     reason `fell_to_water`.
   • Cell exists, no other chess marker → re-add the marker and
     emit a `landed` outcome.
   • Cell exists with another chess piece → the existing piece is
     removed with reason `knocked_off`, our piece takes the
     square (`landed` + `bumpedPieceId`).
4. `LineClearService.runCascade` emits the `airbornePieceIds`
   alongside `cells_clearing` (so the client knows which pieces
   to flap) and the per-piece `settleOutcomes` alongside
   `row_cleared`.

Client-side (`public/js/wingAnimations.js`):

• `liftAirbornePieces(pieceIds)` attaches two wing planes per
  mesh, tweens the piece up 1.4 units, and starts a sin-flap
  ticker. Pieces flagged as airborne also tell the chess
  reconciler to leave them alone (`userData.airborne` + a check
  in both the position-sync and prune passes of
  `updateChessPieces.js`).
• `settleAirbornePieces(outcomes)` eases landed pieces back
  down to floor level, then strips the wings; fallen / bumped
  pieces drop ~4 units, fade out, and are removed from the
  scene.

Activity log additions: the new `fell_to_water` and
`knocked_off` reasons render with bespoke labels ("wings failed
— fell into the water", "knocked off the board by a landing
piece").

Test coverage in `tests/server/wingsRule.test.js` (4 tests):
• Piece falls when no cell remains under it after gravity.
• Piece bumps a friendly chess cell that gravity dragged
  beneath it (reasons `knocked_off` + `landed` with
  `bumpedPieceId`).
• `runImmediate` exposes `settleOutcomes` to legacy callers.
• `runCascade` includes `airbornePieceIds` + `settleOutcomes`
  in the socket payload.

`BoardManager.test.js` was updated to reflect the new rule
(chess cells now appear in the `cells_clearing` flash list, and
an orphan piece falls after the clear).

### Other UX cleanups from the same pass

- **Recent Activity filter** — `public/js/activityLog.js`
  carries a persistent "Only mine" toggle in the panel header.
  When enabled it shows only events whose payload's
  `playerId`/`fromPlayerId`/`toPlayerId`/`capturedBy.playerId`
  matches the local player id. Preference is persisted in
  `localStorage`.
- **Eliminated players hidden from the sidebar.** Server
  `buildPlayersList` now exposes `eliminated`. Client
  `unifiedPlayerBar` filters them out of the list (always
  keeping the local player visible). The home-zone allocator
  (`boardGenerator.collectExistingHomeZones`,
  `GameUtilities.findHomeZonePosition`) also ignores
  eliminated players, so a new joiner is anchored around
  living players instead of dead-king corpses scattered
  through old maps.
- **Camera controls.** A new "Controls" button in the
  `#debug-indicator` opens a help overlay listing every camera
  and gameplay shortcut. `public/js/cameraControlsHelp.js`
  installs keyboard zoom (`+` / `−`), pan (`W`/`A`/`S`/`D`),
  and reset (`0`) so touchpad users without pinch zoom can
  still move the camera. The "Player Code" reminder text on
  the same bar was reworded to "💾 Copy your Player Code to
  resume later" with a hover tooltip clarifying why it
  matters.

