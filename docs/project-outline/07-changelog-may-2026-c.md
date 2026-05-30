# 07 Changelog May 2026 C

> Part of the [Tetches project outline](README.md). May 2026: power-up orbs, connectivity, production audit.

### Graphics stress test + findings (29 May 2026)

Drove a live browser stress test (port 3022) to answer "can the graphics keep
up as players pile in, and do we need distance fading?". Added a **dev-only
stress spawner** so the per-difficulty AI trim can't fight the test:

* `server/sockets/lifecycle.js` — `dev_add_ai` socket event (guarded to
  `NODE_ENV !== 'production'`): `{ count }` adds N bots with the duplicate-trim
  suspended; `{ cleanup: true }` re-enables the trim and collapses the roster.
* `server/ai/runner.js` — `setTrimSuspended()` flag; `trimDuplicateAis()`
  no-ops while suspended.
* `scripts/_stress-add-ai.js` — throwaway socket.io-client driver
  (`node scripts/_stress-add-ai.js 12` / `… cleanup`). Safe to delete.

**Measurements** (synchronous `renderer.render()` timing — reliable even when a
backgrounded tab throttles rAF; the THREE build is **r132**):

| Scene | Players | Pieces | Scene objects | Draw calls | render ms | ~fps |
|---|---|---|---|---|---|---|
| Start, zoomed out | 30 | 445 | 6.7k | 4 160 | 66 | 15 |
| +12 AI, zoomed out | 43 | 636 | 10k | 8 427 | 212 | 5 |
| Typical play (zoomed in) | 30 | 448 | 14.6k | 876 | 36 | 28 |

**Conclusions (evidence-based):**

* **Distance fading is *not* the primary lever.** THREE's built-in frustum
  culling already cuts zoomed-in draw calls to ~880; an explicit distance cull
  added ~0 there. It only helps the *zoomed-out overview* (8 000+ calls).
* **The real bottleneck in normal play is scene-object count.** `updateMatrixWorld`
  over ~14k objects costs ~14 ms/frame on its own. Each "cute" piece is **~15
  sub-meshes** (≈22 draw calls), so pieces alone are ~7 000 meshes at 30
  players. Freezing static cells' matrices (`matrixAutoUpdate=false`) gained only
  ~18% (r132 has no per-object `matrixWorldAutoUpdate` subtree-skip).
* **rAF-driven VFX cleanup is fragile under load.** `flashCellsBeforeClear`
  (`public/js/tetromino/animations.js`) disposes its cell-sized boxes only when
  its `requestAnimationFrame` loop finishes; under throttling/heavy load these
  pile up (saw 2.3k → 6.9k loose boxes during the test).

**Implemented this pass:**

* **Guaranteed VFX cleanup.** `flashCellsBeforeClear`, `showPlacementEffect`
  and `highlightClearedLines` (`public/js/tetromino/animations.js`) disposed
  their meshes only when their `requestAnimationFrame` loop reached the final
  frame — so a stalled/throttled rAF leaked them. Each now also disposes via a
  wall-clock `setTimeout` (guarded by a `disposed` flag), so the flash/placement
  boxes can no longer pile up under load. These fire on every clear/placement,
  so this was the main accumulation source.
* **View-distance culling** (`public/js/distanceCulling.js`, wired into
  `gameLoop.js`, ~4×/sec). Hides whole pieces + cells beyond a zoom-relative
  radius `R = clamp(camDist × 2.3, 55, 600)` of the camera's focal point. Tuned
  so the **overview never culls** (R > the board's reach at the default framing,
  any world size → no popping), while **zooming in culls distant in-frustum
  pieces** — measured ~64% of pieces (282/438) dropped at a typical play zoom,
  which frustum culling alone keeps. Only ever un-hides what it hid (WeakSet),
  so it never fights capture-fade / decay / ghost visibility. Toggle off with
  `gameState.distanceCullDisabled = true`.

**Still recommended (bigger, await go-ahead):** (1) merge/instance static
terrain cells → fewer objects to traverse *and* fewer draw calls (helps the
overview, which culling deliberately leaves alone); (2) reduce the cute pieces'
~15 sub-meshes or add a distant-piece LOD/impostor.

### Two-kings bug, eliminated gate, camera controls, piece sizes (29 May 2026)

Follow-up player report after the pause/battle/sticky-mode pass — "I captured a
king but BECAME it and had two kings", "made my king fall in water 3 times, it
just said Game Over and let me carry on", "cute pieces look too similar", and
"controls feel backwards when I spin the board".

* **One-king rule enforced at the transfer (the "two kings" bug).** Every
  capture path already removed the king before `executeKingCapture` (Chess-C1),
  but the transfer loop itself had no guard — a respawn racing the capture or a
  stale persisted snapshot could still hand a live king to the captor.
  `server/king/capture.js` now **collects and removes** any defeated king
  instead of defecting it, so the captor can never end up holding two kings.
* **Self-healing repair for worlds already corrupted.** `server/king/
  missingKingSweep.js` gains `dedupeKings()` — any player owning 2+ kings has
  the surplus retired (keeping the one nearest their home zone, i.e. the
  original). Runs each sweep tick, so a world that already has the bug baked in
  heals itself on the next pass. (`pieces.REMOVAL_REASONS.DUPLICATE_KING`.)
* **Eliminated players can't keep playing.** Neither `chess_move` nor
  `tetromino_placed` checked `player.eliminated`, so a player whose run had
  ended (a stray second king, or finishing the king-detonation) could carry on
  — the "it just said Game Over and let me play" report. Both handlers now
  reject with `reason: 'eliminated'`. (Water-death → lives-exhausted →
  lemming-style detonation was already wired via `kingLifeService` →
  `kingDetonationService`; this closes the "carry on" loophole around it.)
* **Optional camera-relative controls (default off).** Movement keys were
  keyed off the player's fixed home orientation, so orbiting the board made
  them feel backwards. New "Rotate controls with view" toggle in the player
  bar (`public/js/controlSettings.js`, persisted in localStorage) makes Left
  always nudge the piece left *on screen* by projecting the board axes into
  screen space (`inputManager.js#cameraRelativeStep`). Off by default to
  preserve existing muscle memory.
* **Pieces tell apart at a glance.** The cute set gave every piece the same
  ~0.5-unit footprint, so a field of one player's pieces read as identical
  blobs. `buildRussianPiece` now applies a per-type size cue (pawn 0.82 →
  king 1.24), encoding chess rank as scale on top of the existing silhouettes.
* Tests: `kingCaptureResolve.test.js` gains a no-transfer-of-king case, new
  `dedupeKings.test.js` (3 cases), and `pauseGate.test.js` gains the two
  eliminated-gate cases. Full suite 508/508 across 44 suites; client bundle
  builds clean.

### Pause enforcement, battle visuals, sticky chess mode (29 May 2026)

Three player-reported polish items:

* **Pause actually pauses now.** Pause was a footprint shield (zone/cells/
  pieces frozen and immune) but the server never stopped the *paused* player
  from acting — so you could pause for invulnerability and keep playing, and
  nothing on screen confirmed the state beyond the button label. Fixes:
  * `server/sockets/chess.js` and `server/sockets/tetromino.js` now reject a
    paused player's moves/placements up front with `reason: 'paused'` (before
    any board mutation). A returning idle player is auto-resumed on first
    input, so the gate only bites a deliberately-paused player.
  * `public/js/unifiedPlayerBar.js` shows an unmistakable full-screen PAUSED
    vignette + pill while paused, driven by the same pause-status plumbing as
    the button (`applyPauseOverlay`).
  * New `tests/server/pauseGate.test.js` (3 tests) locks in the gate for both
    move types and that resuming lets play through.
* **King threats read as a battle.** A deferred king capture ("check")
  doesn't move the attacker, but the client used to fake-move it onto the
  king's square — it then snapped back, looking like a glitch. Now
  `public/js/chessInteraction.js` glides the attacker back to its real square,
  and `public/js/checkAlert.js` draws on-board clash markers (pulsing rings
  under both combatants, a glowing tension beam, a bobbing ⚔️) for the whole
  check window, visible to attacker, defender and spectators.
* **Failed moves keep you in chess mode.** A rejected move never left the
  source square, so the piece now stays selected with its valid-move rings
  re-shown (`handleChessMoveRejection` → `keepChessMode`); only `piece_gone`
  drops the selection. Friendly text added for `paused` / `awaiting_promotion`
  / check-related reasons.

### Pre-launch bug sweep (late May 2026)

A wide "make-sure-it-all-makes-sense" pass before opening the game up.

**Check mechanic (king-capture grace) hardening.** The 20 s escape window
had several correctness gaps:

* **Timeout now imprisons the king instead of handing it to the captor.**
  `server/king/checkService.js#expireCheck` removes the defending king
  (`pieces.removePiece`) *before* calling `executeKingCapture`, so the
  captor no longer ends up holding two kings (Chess-C1).
* **The window can't be bypassed.** While a `pendingCheck` protects a
  defender, any *new* attempt to capture that king — by a second piece or
  the AI — is rejected (`server/sockets/chess.js`, `server/ai/actions.js`)
  (Chess-C2).
* **No stalling via building.** Tetromino placement and the "skip chess
  move" button are refused while you're in check, server-side
  (`server/sockets/tetromino.js`, `server/sockets/chess.js`) (Chess-H3).
* **Orphaned checks self-cancel.** If the attacker is captured/decayed or
  can no longer legally reach the king during the window, expiry clears the
  check instead of auto-eliminating the defender (Chess-H2).
* **Persistence.** `pendingCheck` is now saved in the world snapshot and
  restored on boot, so a server restart mid-check doesn't lose it (Chess-H1).
* **King capture is idempotent** — a second `executeKingCapture` for an
  already-eliminated player is ignored (Chess-H6).
* New `tests/server/checkService.test.js` covers startCheck, the C1 king
  removal, defer limits and cancel.

**Promotion deploy is transactional.** `deploy_promotion` validates the
target up front and rolls the pawn back if `addPiece` fails, so a failed
deploy can't lose the pawn (Chess-H4).

**Line-clear / gravity ordering.**

* AI tetromino placement no longer runs island-integrity *before* the
  line-clear cascade — it now matches the human path (integrity at the tail,
  after gravity reconnects cells), fixing "the AI cleared my far cells"
  (LC-C1).
* The cascade re-scans after each 700 ms flash and only clears lines that
  are *still* clearable, using fresh run bounds — a cell that became
  protected during the flash (e.g. a mid-cascade pause) is never stripped
  (LC-C2).

**King's Duel submit was broken.** `uiOverlays.js` calls
`NetworkManager.submitDuelResponse(...)` via a namespace import, but the
facade (`public/js/utils/networkManager.js`) never re-exported it — so the
call was `undefined` and threw when a player submitted their hide/guess. The
export was added. (Surfaced as an esbuild "import is undefined" warning.)

**Dead code.** Removed the network-disconnect branch in `main-enhanced.js`
that called non-existent `gameCore.pauseGame()/resumeGame()` (the render
loop is fine while disconnected; reconnect is server-authoritative). The
client bundle now builds with zero warnings.

**Docs aligned to code** (`docs/players-bible.md`): cascade cap 16 → 8
(`MAX_CASCADE_ITERATIONS`), island-decay move limits 6/12 → 15/30 and idle
backstop 10/20 min → 10/15 min, the §16 constants quick-reference dropped
the obsolete `AUTO_QUEEN_TIMEOUT_MS` (promotion is freeze-and-deploy now)
and gained the Check / cascade / island-decay constants.

**Test suite is green again (489/489).** Pre-existing rot was masking the
real signal: a stale `gameContext` "models" assertion, ~15 legacy
standalone `assert`-scripts in `tests/gameplay`/`tests/backend` that aren't
Jest suites, three obsolete `tests/core`/`tests/ui` suites importing the
removed `public/js/game/*Manager` architecture, and the security suite
which couldn't even parse (`jest` re-declared) and then 500'd on every route
(no `express.json()`). Jest now targets only real suites (legacy scripts
remain runnable via `node`), and the security tests were repaired (parser,
body-parser, presence checks, URL-safe fixtures) — 33/33 passing.

### Auto-pause when idle + AI self-destruct fix (late May 2026)

Two pre-launch polish items from a single play session.

1. **Optional auto-pause after 5 minutes idle.** The manual Pause feature
   (freeze your zone/pieces, limited uses per session) now has an opt-in
   companion that fires a normal pause on the player's behalf once they've
   been idle (no input) for 5 minutes, and auto-resumes the moment they
   return. Because it uses the same `pause_player` endpoint it consumes one
   of the player's limited pauses — which is why it's optional.

   * New `public/js/autoPause.js`: a dependency-injected idle watcher
     (`startAutoPauseWatcher({ getPauseStatus, requestPause, requestResume })`)
     plus a persisted on/off flag (`isAutoPauseEnabled` /
     `setAutoPauseEnabled`, default ON, stored in `localStorage`). Activity
     is stamped on `pointer/mouse/key/touch/wheel` events and tab-focus; a
     single low-frequency interval does the idle comparison so high-frequency
     events never churn timers. It only auto-resumes pauses it started, never
     a manual pause.
   * `public/js/unifiedPlayerBar.js`: a "Auto-pause when idle (5 min)"
     checkbox under the Pause button wires the flag and starts the watcher,
     reusing the existing `sendPauseRequest` + `pauseStatusCache` plumbing.
   * Tests: `tests/ui/autoPause.test.js` (8 cases — idle fire, activity
     reset, disabled, no-uses, already-paused, auto-resume, manual-pause
     left alone, flag round-trip).

2. **AI no longer self-destructs with a full roster.** The AI "stuck"
   detector recycled (king self-detonate + respawn) any bot that failed to
   act for 6 consecutive ticks — even one that still had a healthy roster and
   owned terrain. A player reported "the AI killed itself after I took one of
   its pieces even though it had loads left". `server/ai/runner.js` now only
   recycles a stuck AI when it's genuinely out of resources (≤
   `AI_MAROONED_PIECE_MAX` pieces *or* owns no terrain); a stuck-but-healthy
   AI just skips the turn and tries again, with the marooned / lone-king
   guards still catching the truly hopeless cases.

### Promotion "deploy failed: not connected" (late May 2026)

Player report: pawn reached its eighth net forward step, the frozen
promotion dialog popped, the captured-piece basket showed the right
options — but clicking any of them flashed
`Deploy failed: Not connected` despite the socket being live and
emitting other events fine.

Root cause: `NetworkManagerClass.deployPromotion` and its sibling
`redeemPromotion` guarded on `!this.socket`, but the class only ever
stores the socket at `this.state.socket`. The top-level `this.socket`
property has always been `undefined`, so the `!this.socket` clause
returned true on a fully-connected client and the failure callback
fired before anything was emitted. The bug was invisible until
promotion shipped because no other code path touched these two
methods.

  * `public/js/utils/NetworkManagerClass.js`: both
    `deployPromotion` and `redeemPromotion` now read the socket from
    `this.state.socket` (consistent with every other emit site —
    `join_game`, `chess_move`, `tetromino_placement`, `exit_game`,
    `get_game_state`, etc.). A comment in `redeemPromotion`
    documents the trap so the next refactor doesn't reintroduce it.

The wider sweep for `this.X` vs `this.state.X` came back clean:
NetworkManager exposes no other top-level mirrors of `state` fields,
and grep confirms the bogus access pattern existed in exactly these
two functions.

### Gravity collision + AFK piece-loss fixes (late May 2026)

Two compounding bugs identified from a single player report. The player
cleared a column, watched a pawn end up in a gap, then stepped away for
a couple of minutes and returned to find their entire roster wiped with
reason `player_left`.

1. **Gravity post-loop overshot collision-skipped cells.**
   `BoardManager._applyGravityTowardsKing` builds a `moves` array of
   cells eligible to drift towards their owner's king, processes them
   in dependency order, and bails on a per-cell collision (the
   destination already had content). It then ran a SECOND loop over
   `game.chessPieces` that re-computed a `(dx, dz)` shift for every
   piece in `eligibleChess` and applied it unconditionally — including
   to pieces whose cell move had been skipped for collision. Result:
   the piece's logical `position` advanced to a square where its
   supporting terrain hadn't actually moved, the next integrity sweep
   saw "piece at (x, z) with no supporting cell of its player", and
   `pieces.removePiece` killed it for `no_supporting_cell` ("cell
   collapsed underneath" in the activity log).

   * `server/game/BoardManager.js`: the post-loop now keys off a
     `successfulMoves` map (oldKey → new {x, z}) populated only when
     the cell move actually went through. Pieces whose original cell
     stayed put stay put with it. We also defensively mirror the new
     position onto `item.chessPiece.position` inside the cell-move
     loop for chess markers that carry the direct piece reference,
     so any consumer reading cell contents between the two loops
     sees consistent state.

2. **Disconnect grace expiry wiped the player wholesale.**
   `connection.handleDisconnect` armed a 5-minute timer that, on
   expiry, called `lifecycleService.removePlayerCompletely(...)` —
   which deletes the player's record AND emits
   `chess_pieces_lost` for all their remaining pieces with reason
   `player_left`. Server logs confirmed the timeline: Geoffrey
   disconnected at 16:56, his pawn fell into the gap at 16:59 (bug #1),
   then at 17:01 the grace timer wiped his other 13 pieces. The user
   said they were "away a minute or 2"; the server still strictly
   waited 5 minutes, but losing every piece for AFK is the wrong
   default for a game where stepping away is normal.

   * `server/sockets/connection.js`: the grace-expiry callback is
     now a logged no-op. We stamp `lastDisconnectAt` on the player
     record so future sweeps can use it, but we never call
     `removePlayerCompletely` from here. Explicit `exit_game`
     still removes pieces immediately, and the existing ghost-player
     sweep continues to GC eliminated players who've reached zero
     pieces (so abandoned humans whose islands decay naturally are
     still cleaned up — just on the bible's "idle decay" timeline
     rather than a hard 5-minute wall-clock guillotine).

### Chess piece colour-leak + check anti-spam (late May 2026)

Two follow-on player reports addressed in one deploy:

1. "After I have taken a piece, all pieces from all players go my
   colour for a while." Root cause was a shared mutable material
   palette: `chessPieceCreator/materials.js` exported a singleton
   `ENHANCED_MATERIALS` trio per side (`self` / `other`), and
   `createSafeMaterials(side)` returned that singleton by reference.
   When the renderer applied a piece's player-specific colour via
   `material.color.setHex(...)`, it mutated the singleton — so every
   other chess piece sharing that side instantly inherited the
   new colour. Most visible immediately after a capture because the
   captor's mesh rebuilds with the user's colour, contaminating
   the shared `self.primary/secondary/accent` materials that every
   other `self` piece references. The same trap existed on the
   custom-GLTF path (`Object3D.clone()` is shallow → materials are
   shared between clones).

   * `public/js/chessPieceCreator/materials.js`: `createSafeMaterials`
     now CLONES the seed materials (`THREE.Material.clone()`),
     returning a fresh trio per call. Singleton mutation can no
     longer cross-contaminate.
   * `public/js/chessPieceCreator.js`: on the custom-model branch,
     every cloned mesh's material is `.clone()`d before
     `applyColorToMaterial` mutates `.color`, matching the
     pattern already used by the wing-animation code's
     `isolateMeshMaterials`.

2. "Maybe we have to put some limits on check… either shorter time
   or limits on the same piece attacking before it doesn't give
   check and just takes it." Both knobs tweaked:

   * `server/king/checkService.js`: `CHECK_DEADLINE_MS` cut from
     30s → 20s (still ample time for the camera fly-over + a
     thoughtful move, but punishes lazy defenders);
     `MAX_CHECK_DEFERS_PER_PIECE = 2` exposed so the SAME attacker
     piece only earns the defender a grace window twice. `startCheck`
     reads `attackerPiece.checkAttempts` (a per-piece counter, lives
     on the piece itself so it survives persistence and dies with
     the piece) and returns `null` when the budget is spent; the
     pendingCheck payload now also carries `attempt` / `maxAttempts`
     so the UI can surface the remaining grace.
   * `server/sockets/chess.js` (human chess move) and
     `server/ai/actions.js` (AI chess move) both check the
     `startCheck` return value. If defer is granted: standard check
     flow. If defer is denied: the move falls through to the normal
     direct-capture path, which already routes through
     `handleKingCaptured` / `kingCaptureService.executeKingCapture`
     for both flows — so suicidal pawns, territory transfer, and
     `king_captured` broadcast all fire correctly.

### Piece-position dedup + client version handshake (late May 2026)

Two related fixes triggered by a player report: a Queen was reported
"lost when a cell distant from the attacker got cleared", plus a
"wings failed" symptom on the same piece. Investigation against the
production snapshot found a column-29 row clear had legitimately
caught the Queen (the attacker had built a long vertical column the
defender hadn't noticed), but ALSO uncovered seven instances of
duplicate chess pieces stacked on the same cell — a real corruption
that explains the bizarre airborne-bump knock-off events.

Root cause: `pieces.addPiece` was stripping the OLD chess marker
from a cell when a new piece spawned there but leaving the previous
occupant's record in `world.chessPieces` with a stale position. The
piece would then participate in airborne-settle / gravity / move
validation as if it still lived on the cell, leading to two-pieces-
per-cell corruption.

* `server/game/pieces.js`: `addPiece` now scans `world.chessPieces`
  for any other piece of the same player whose `position` matches
  the spawn cell and drops those records before pushing the new
  one. Warns to the console so we can spot any code path that's
  triggering it.
* `server/king/missingKingSweep.js`: new `dedupePiecePositions`
  pass runs alongside `dedupeChessPieces`. For every `(playerId,
  x, z)` with more than one piece it picks a winner (the one whose
  ID matches the cell marker, otherwise the most-moved), drops the
  others from `chessPieces`, and strips their stale chess markers
  from the cell. On the first deploy in production it resolved 7
  duplicate-piece records at once (pawns and a bishop in home
  zones).
* `server/sockets/chess.js`: when the source-cell re-stamp path
  fires, it now first checks for a FOREIGN chess marker on the
  cell and refuses the move (with a `desync_repaired` reason)
  rather than stacking our marker on top of someone else's. When
  re-stamping is safe, it strips any same-player chess markers
  that DON'T belong to the moving piece before pushing the fresh
  marker.

Client-version handshake: the user asked for stale and cheating
front-ends to be "time-limited" so older logic can't sit on the
server forever. All client inputs are already server-validated —
chess moves, tetromino placements, promotions, deployments, power-
up claims — so a cheating client can't bypass game rules. The new
handshake is a UX nudge:

* `server/bundling/indexHtmlBundleSwap.js`: the swapped script
  tag now also embeds
  `<script>window.__BUNDLE_VERSION__="<mtime>"</script>` so the
  client knows the build it loaded.
* `server/sockets/connection.js`: on every socket connect the
  server emits `server_version { bundleVersion, serverTs }`.
* `public/js/enhanced-gameCore/networkEvents.js`: client compares
  the advertised version against `window.__BUNDLE_VERSION__`. On
  mismatch it renders a non-blocking "A newer version of Tetches
  is available — refresh to pick up the latest fixes" banner with
  Refresh / Later buttons.

### Dissolve timing — idle fallback instead of wall-clock (late May 2026)

Player report: "I think the dissolves are happening too fast… they
are happening not after so many moves but after a 10-min timer. It
should be mostly based on moves but with like a 10-min timer in case
they make no moves in that time."

`IslandManager` used to compare `now - meta.since` (time since
island formed) against a fixed limit. So an active player whose
disconnected island couldn't be reconnected still saw it evaporate
at 10 / 15 minutes regardless of how busy they were. The fix:

* Renamed the constants to `*_IDLE_LIMIT_MS` to make the new
  semantic loud.
* New helper `lastActionAt(player)` returns
  `max(lastChessMoveAt, lastTetrominoPlacementAt, lastActiveAt)`.
* `_processDisconnectedIslands` and `getDisconnectedIslandRiskReport`
  now compare `now - max(lastActionAt(player), islandFormedAt)`
  against the idle limit, so the time clock only ticks while the
  player is QUIET *and* the island has had a chance to be seen.
  Active players are bounded by the move limit alone (15 / 30). An
  idle player who returns to a freshly-formed island still gets a
  full grace window before it dissolves.
* Kept the old class-level aliases (`DISCONNECTED_TIME_LIMIT_MS`,
  `DISCONNECTED_PIECE_TIME_LIMIT_MS`) pointing at the new idle
  limits so any external test/caller keeps building.

### AI no-king rescue (late May 2026)

Player report: "AI Novice has 2 pieces, no king, doing nothing."

The `missingKingSweep` was deliberately skipping computer players
on the assumption the AI runner would self-recover. The runner's
recovery only fires for "exactly 1 king" (king-only detonation) or
"marooned + has king" (forced respawn) — an AI that has lost its
king but still has pawns falls through every branch and just spins
in place forever.

* Removed the `if (player.isComputer) continue;` skip in
  `missingKingSweep.tick`. The sweep already respects
  `pendingRespawn`, so it can't race with the runner's own respawn
  path. AIs with pieces but no king are now rescued the same way
  humans are — fresh king at their home zone, kingLives reset.

### Check — AI defender + AI attacker integration (late May 2026)

Follow-up to the Check feature. The first cut handled human-vs-human
and human-attacks-AI fine, but two paths still bypassed it:

* AI defender: `world.pendingCheck` would land in the AI's runner
  tick, but the runner had no idea what to do with it. New
  `aiActions.performCheckEscape` is now invoked first thing in
  `performComputerAction` when this AI is the defender. It builds
  a ranked candidate list (king-moves → captures-of-attacker →
  generic moves), calls `checkService.validateEscape` on each, and
  plays the first that's accepted. On success it cancels the check
  with reason `ai_escaped`; on failure it returns immediately and
  the deadline timer fires.
* AI attacker: `aiActions.applyChessMove` now takes a `checkService`
  param. If the move would capture a king and no check is already
  outstanding, the AI defers via `checkService.startCheck` just like
  the human chess handler. `performStrategicChessMove` short-circuits
  if this AI is already mid-check on the attacker side — they have
  to wait for the defender to respond like everyone else.

### Nginx cache policy — JS revalidates every load (late May 2026)

Applied `ci/nginx-production.conf` on the live host. JS / CSS / JSON
/ map files now serve with `Cache-Control: no-cache, must-revalidate`
plus ETag so browsers do a 304 round-trip instead of pinning a stale
bundle for 30 days. Image / font assets keep a 7-day cache via a
separate regex.

### Check — timed grace before king capture (late May 2026)

Player request: when a chess move would capture a king, defer the
capture and give the defender a window of grace to escape. "Big
message on screen, auto-zooms to their king and then has a countdown
timer. If they don't move out of the way in time then they are
automatically captured. This takes place BEFORE the attacking piece
has moved."

Server (`server/king/checkService.js`):

* New `pendingCheck` field on `world` (`{ defenderId, attackerId,
  attackerPieceId, attackerFrom, attackerTo, kingPieceId, kingPos,
  deadlineAt, startedAt }`).
* `chess_move` handler now detects "this move would capture a king"
  BEFORE applying state and routes it through `checkService.startCheck`
  instead. The attacker's piece doesn't move, the king isn't removed,
  the deadline timer starts (30 s).
* While the check is active:
  * the attacker piece is locked (any move on it is rejected with
    `attacker_locked`);
  * the defender's moves are validated by `checkService.validateEscape`
    — we hypothetically apply the move, then ask "can any opposing
    piece still legally reach the king?" If yes, reject with
    `check_not_escaped`. Strict per player spec.
  * tetris auto-fall pauses for the defender (client-side guard in
    `gameLoop.js`).
* Deadline expiry calls `kingCaptureService.executeKingCapture` so
  the original move-that-would-have-killed-the-king proceeds.
  Defender escape successful → `cancelCheck` with reason `escaped`.
* `world.pendingCheck` is broadcast on every `game_update` so late
  joiners and reconnects see the same state. `rehydrate()` on
  startup re-arms the deadline from the persisted snapshot.

Client (`public/js/checkAlert.js`):

* Full-screen red banner ("CHECK!") for the defender, with a live
  countdown that ticks down to zero.
* Camera glides to the king position via `flyToPosition`.
* Compact "Threatening their king…" indicator for the attacker.
* Reconciles continuously off `pendingCheck` so a dropped socket
  event doesn't strand the UI.
* `gameLoop.tickTetrominoAutoFall` short-circuits when the local
  player is the defender — focus stays on the king, not on a tetromino
  dropping out from under them.

### Stuck-wings watchdog (late May 2026)

Player report: "I have a queen who has ended up on an island cell
with no connections and she won't stop flying with wings!"

`wingAnimations.js` now tracks `startedAt` per airborne entry. The
flap ticker checks every frame: any piece airborne for more than
`MAX_AIRBORNE_MS` (6 s) gets forcibly settled with a synthetic
`landed` outcome — wings come off, piece returns to base height,
map cleared. The legitimate hover window between `cells_clearing`
and `row_cleared` is ~1 s, so this only fires when a settle event
was dropped or sent out of order.

### Home-zone placement respects existing terrain (late May 2026)

Player report: "I captured AI Expert and they respawned in amongst
the cells I had just got from them as if they didn't exist."

`boardGenerator.calculateHomePosition` only checked zone-vs-zone
overlap, never zone-vs-cell. When a player captures an AI, the AI's
zone is cleared from the placement engine (eliminated filter), but
their old cells are now owned by the captor — and a fresh joiner
could land right on top of them. Added `overlapsExistingTerritory`
which rejects any candidate whose footprint (+1 cell buffer) covers
a cell already owned by a non-eliminated player.

### Auto-fall escapes the frame-budget gate (late May 2026)

Follow-up to the hover-then-fall work. Player: "Nope, the
tetraminos don't drop... you can move them around all you want
indefinitely and even go away and come back. No downwards motion
until you press space to drop it completely."

Root cause: the tetromino auto-fall was buried inside
`updateGameLogic`, which `animate()` only invokes inside
`if (!skipNonEssentialThisFrame && isHeavyFrame)`. The
`skipNonEssentialThisFrame` flag is set the moment any single
frame takes longer than `LATE_FRAME_BUDGET_MS` (33 ms / 30 fps)
and only clears after six consecutive on-budget frames. On
production this rarely recovered, so the entire game-logic tick —
including the auto-fall — was effectively dead.

Fix:

1. Extracted `tickTetrominoAutoFall` from `updateGameLogic`. The
   new function does its own O(1) early-outs (not in tetris,
   no piece, still hovering, etc.) and is now invoked from
   `animate()` on EVERY frame, OUTSIDE the budget gate.
   Auto-fall is core gameplay, not a "nice to have animation".
2. Moved fall-clock state ONTO the tetromino itself
   (`fallStarted`, `lastMoveTime`, `lastFallTime`). The module-
   scope `_lastFallStartedTetromino` was vulnerable to identity
   shuffling across server updates; per-piece state is naturally
   reset on spawn and survives any cross-module references.
3. `updateGameLogic` now only resets the missing-tetromino
   watchdog counter for the in-tetris branch (the watchdog still
   needs the budget-gate cadence — it's a recovery aid, not a
   per-frame requirement).

### Hover-then-fall, move-pause, checkerboard parity (late May 2026)

Follow-up to the watchdog. Player: "They still aren't falling right.
What happened before was the piece hovered until a key was pressed,
then it would drop a bit every second or so. Now it does it randomly
and then stops. The drop should pause half a second if they move it
so that they can move it a far distance, but these delays should
happen concurrently. I think we need to lightly darken every other
cell to make a checkerboard effect.. Given we have bishops where
this matters as they can only go on half the cells."

1. **Hover until first input.** Every new tetromino now spawns with
   `fallStarted: false` (`tetromino/spawn.js#initializeNewTetromino`)
   and the game loop deliberately does NOT auto-drop while the
   flag is false. `markUserInteraction` in `movementQueue.js`
   flips the flag the first time any player-facing export is
   called — `moveTetrominoX`, `moveTetrominoZ`,
   `rotateTetromino`, or `hardDropTetromino`. The auto-fall
   path (`moveTetrominoY` from `gameLoop.js`) intentionally
   does NOT mark interaction so the piece can't bootstrap itself.

2. **First fall lands one interval after first input.** The
   game loop tracks the last tetromino it observed transitioning
   `fallStarted=false → true` (`_lastFallStartedTetromino`).
   On that transition it resets `tetrisLastFallTime = now`, so
   the first drop happens exactly 1 s after the player commits
   to the piece — independent of how long they spent thinking.

3. **0.5 s move-pause, concurrent with the 1 s interval.**
   `markUserInteraction` also stamps `lastMoveTime`. The auto-fall
   condition is now `(now − lastFall > 1000ms) && (now − lastMove
   > 500ms)`. The two countdowns run side by side, so the next
   drop is at `max(lastFall + 1000, lastMove + 500)`. Rapid
   moves keep sliding only the move-pause forward (never adding
   up beyond 500 ms past the last keypress), and a player who
   stops moving still gets the regular 1 s rhythm without a
   stacked stall. Hard-drop only flips `fallStarted` — not
   `lastMoveTime` — because the piece lands immediately.

4. **Checkerboard parity for all cells.** `chooseAppearance` in
   `boardFunctions/rendering.js` already produced light/dark
   defaults for empty cells, but home / tetromino / ex-home
   cells were a single solid colour, hiding the board parity
   bishops care about. New `darkenForChecker(color, x, z)`
   helper multiplies each RGB channel by 0.86 on cells where
   `(x + z) & 1`, applied to home, tetromino, and ex-home
   appearances. Retro / default modes keep their existing
   bespoke palettes.

### Ads round 3, multi-king cells, tetris watchdog (late May 2026)

Follow-up to round 2. Player: "OK, we want it to not render on a
single cell if it is a wide sponsor. The image is appearing upside-
down... the sponsor message should only come up with a click or
tap of the cell and go away after a while. Tetraminos have
appeared to stop falling on their own! I built some stuff quite
near an AI player.. now it said it had cleared disconnected
cells... but it cleared some of mine I think! .. please check the
rules around cells that have paths to multiple kings."

1. **Upside-down ads.** Three.js's `PlaneGeometry` emits vertices
   in TL/TR/BL/BR order — not BL/BR/TL/TR as I had assumed when
   wiring up the manual UV slicing. Mapping `V=0` to the first two
   vertices flipped the texture vertically. Fixed in
   `sponsoredCells.js#orientDecal`: vertex 0+1 (TL/TR) now get
   `V=1` and vertex 2+3 (BL/BR) get `V=0`.

2. **Wide ads never render solo.** Earlier pass fell back to
   single-cell rendering when a wide sponsor's partner cell was
   unavailable; player said "don't try and spread it over 2 cells
   if there is only 1 on its own". `assignSponsors` now skips
   wide creatives entirely when no partner exists — the cell is
   left bare and a later refresh can reuse it once the run grows.

3. **Popup auto-hides.** `displaySponsorInfo` reinstates a 12 s
   auto-hide timer (with a `clearTimeout` reset on each fresh
   click and on explicit `hideSponsorAd`), so the click-driven
   ad box "goes away after a while".

4. **Tetromino watchdog.** `gameLoop.js#updateGameLogic` tracks
   how long the game has sat in `tetris` phase with no
   `currentTetromino`. After 5 s it tries
   `initializeNextTetromino` locally; if that returns null it
   sends `request_tetromino` to the server (which also runs the
   missing-king sweep). A 4 s cooldown prevents the watchdog from
   spamming the network if the player is genuinely between turns.

5. **Multi-king cell protection.** New `isMultiKingAnchoredCell`
   helper in `IslandManager.js#_processDisconnectedIslands`. A
   cell that carries content from MORE THAN ONE player is exempt
   from per-player decay as long as ANY of the OTHER owners still
   has a live `hasPathToKing` through it. Both the piece-removal
   `protect` callback and the cell-clearing loop honour the
   anchor. The cell's grace timer is refreshed so the BFS doesn't
   keep retrying. Cells with only a single owner, or whose other
   owners are also disconnected, decay as before.

### Ads: side-mounted, click-to-open, anti-repeat, wide spread (late May 2026)

Follow-up to the sponsor rebuild — player said "I wanted it on the
SIDE of the cells and now it is on the top of them and on even more
than ever before. The ad box only should show when clicked. Don't
show the same ad within like 20 cells or more. If the image is a
wider aspect ratio then spread it over 2 cells and charge for that.
Don't try and spread it over 2 cells if there is only 1 on it's own."
Reworked the entire sponsored-cell pipeline in
`public/js/sponsoredCells.js` plus the auxiliary helpers:

1. **Side-mounted decals.** Previous fix laid the decal flat on the
   cell's top face. Restored to a vertical billboard, but anchored
   to the OUTWARD-facing side, at the TOP of that side (centre
   y=0.27, height 0.42 — so the top edge sits at the cell's top
   face). The plane rotates around Y to match each placement's
   outward normal (face record now lives in the placement map),
   and UVs flip horizontally for every face except +Z so logos
   read correctly when viewed from -Z / ±X (rotating the plane in
   a right-handed Y-up world mirrors the texture from the viewer's
   POV; one UV flip later, the artwork reads normally).

2. **Click-to-open ad popup.** Removed the auto-show on tetromino
   placement (`movementQueue.js` no longer calls
   `displaySponsorInfo`) and killed the always-on floating banner
   entirely (no `initFloatingBanner` call from
   `main-enhanced.js`). The popup (`#sponsor-ad`) now opens only
   when the player clicks a sponsored cell —
   `chessInteraction.js#showCellInfo` checks `cellMesh.userData.sponsor`
   and calls `displaySponsorInfo` with the sponsor record. The
   popup has no auto-hide timer either; players close it via the
   X button or by clicking elsewhere.

3. **No same sponsor within 20 cells.** New `assignSponsors` step:
   client fetches the whole pool via the new
   `GET /api/advertisers/active` endpoint, then iterates
   placements in run order and picks a sponsor whose nearest
   existing assignment is more than 20 cells (Manhattan distance)
   away. With only one active advertiser most cells now stay bare —
   exactly the "fewer ads" effect the user asked for.

4. **Wide-aspect spread + double charge.** When a sponsor's texture
   loads we cache its aspect ratio (`width/height`); a ratio ≥ 1.5
   marks it "wide". If a wide sponsor lands on a placement AND the
   next placement on the same run+side is unassigned, we paint a
   single wider mesh (geometry width 1.96, shifted 0.5 cell-units
   along the run axis) that spans BOTH cells; the partner cell is
   marked `partner-blank` so it still raises the sponsor popup on
   click but doesn't add a second decal mesh. We charge the
   campaign for two cells via `recordImpression(id, 2)`. If no
   adjacent partner is free, the same sponsor renders on a single
   cell (it's never forced into a half-cell layout).

5. **Server bits.**
   - `GET /api/advertisers/active` — public, returns the whole
     eligible pool with `costPerCell`, `remainingCells`, etc.;
     used for the client-side assignment pass above.
   - `POST /api/advertisers/:id/impression` accepts `cells` (1..4)
     in body or query; defaults to 1, increments
     `cellsSponsored` accordingly.

### Stale bundle, ad approvals, default-red bug (late May 2026)

Player came back with "all the pieces are still red and the knight
still looks silly... head is not round." The previous round of fixes
HAD landed in the source modules — but two layers were swallowing
them: a stale `dist/app.bundle.js` that was bundled before the
edits and a server-side default colour that re-fed broken state.

1. **Stale production bundle.** `public/dist/app.bundle.js` was older
   than the source files in `public/js`. The `indexHtmlBundleSwap`
   middleware preferred the (older) bundle, so nothing the last
   commit edited actually reached the browser. Re-ran
   `scripts/build-client.js`, copied the artefact into
   `/var/www/tetches.live/public/dist/`, restarted PM2; the bundle
   URL is now stamped with `?v=<mtimeMs>` and refreshes on every
   deploy.

2. **Default player colour was hard-coded red.** `createPlayerRecord`
   in `server/world/World.js` defaulted `color` to `0xDD0000`.
   `connection.js` calls `upsertPlayer` *before*
   `PlayerManager.register` assigns a real colour, so every player
   spent a brief moment carrying the legacy red. That value is
   truthy, so the register path's
   `existing.color || generateRandomColor()` then preserved the
   broken value forever. Two of the four live players carried
   colour `14483456` (= `0xDD0000`) as a result. Fix: introduced
   `pickDeterministicColor(playerId)` keyed off a small palette with
   red deliberately omitted, and added a one-shot snapshot
   migration that rewrites both the player record and every chess
   piece carrying the legacy red. The migration logs how many
   players it touched and flips the dirty flag so the repair is
   flushed on the next persistence cycle.

3. **Knight head rebuild — proper 3D primitives.** The extruded 2D
   silhouette looked like a paper cut-out from anything but the
   side angle. Replaced the head shape in
   `public/js/chessPieceCreator/russianPieces.js` with stacked
   spheres (cranium, muzzle, nose tip, paired cheeks), a tilted
   cylinder neck, and a thinner curved mane slab tucked behind.
   The muzzle now stops at `x ≈ 0.34` (was 0.54 in the first
   attempt) so the head sits ON the body rather than lunging
   forward.

4. **Nginx serving JS with `expires 30d`.** Cache-Control was
   `max-age=2592000`, baking stale bundles into players' browsers
   for a month. Updated the source `ci/nginx-production.conf` to
   serve `.js/.mjs/.css/.json/.map` with
   `Cache-Control: no-cache, must-revalidate` and `etag on` (so
   bandwidth stays the same — 304 Not Modified) while binary
   assets keep a 7-day TTL. **TODO: apply on the live host via
   `sudo` — currently the on-disk config under `/etc/nginx/` still
   has the old policy. The deploy strategy meanwhile relies on the
   `?v=<mtimeMs>` query string in the bundle URL to bust caches.**

#### Sponsor system rebuild

The same message included "far too many ads… don't repeat the same
one often at all… they look to be placed by their middle instead of
the top… the shading on the side of the cells clashes with it so
they flicker… the ad box appears under the next piece… I think we
need to approve ads before they go live too." Rebuilt the sponsor
flow end-to-end:

1. **Decal placement on cells.** `public/js/sponsoredCells.js`
   used to mount a 0.88 × 0.88 plane at `(0, 0.48, 0.47)` facing the
   camera — that put it on the front face of the cell, half inside
   it, and z-fighting with the side shading. Rotated the plane
   horizontal (`rotation.x = -π/2`), parked it at
   `y = 0.4705` (2 mm above the cell's top face), added
   `polygonOffset` to defeat the remaining co-planar z-fight, and
   knocked `renderOrder` down to 1 so the falling tetromino
   (renderOrder ≥ 10) still occludes it correctly.

2. **Ad rotation — fewer, fairer, never twice in a row.**
   `routes/advertisers.js#GET /next` now:
   - returns `204 No Content` on ~⅔ of requests
     (`AD_SHOW_RATE_INVERSE = 3`) so the world isn't smothered;
   - picks weighted-random across the eligible pool, weight =
     clamped costPerCell — so a 1000× bid only gets ~10× the slots;
   - tracks `lastServedAdvertiserId` and excludes it from the next
     pool when ≥2 advertisers are eligible, so the same ad never
     comes back-to-back.
   The client handler in `public/utils/sponsors.js` was updated to
   treat 204 as "no ad this time" without caching, dropped its
   in-memory cache from 5 s → 700 ms, and the in-game decal cache
   in `sponsoredCells.js` dropped from 8 s → 1.5 s so a run of four
   cells doesn't all paint the same brand.

3. **Ad approval workflow.** Payment now puts an advertiser in
   `pending_review` (not `active`); the image bytes live in a
   private `advertiser-pending-images/` dir, outside `public/`, so
   they survive PM2 restarts but can't be hot-linked.
   New endpoints:
   - `POST /api/advertisers/:id/admin-review { action, reason }`
     promotes to `active` (writes the image into `public/uploads/`)
     or marks `rejected` with a reason the advertiser can see.
   - `GET /api/advertisers/admin/pending` lists the queue.
   - `GET /api/advertisers/:id/admin/preview-image` streams the
     pending bytes for the admin preview pane.
   - `GET /api/advertisers/:id/status` is the public status check
     keyed by the (private) advertiser id.
   The admin page (`public/admin/advertisers.html`) gained a
   pending-queue card at the top with image preview, approve and
   reject (with reason) buttons; the existing all-ads table is
   unchanged.

4. **Wallet-based advertiser sign-in.** `routes/walletAuth.js` adds
   a Solana ed25519 challenge/verify pair (verified via
   `tweetnacl` + `bs58`), issues an HMAC-signed bearer token (1 h
   TTL, secret seeded from `WALLET_SESSION_SECRET` or a per-boot
   random), and exposes `requireWalletSession` middleware. Two new
   advertiser routes use it:
   - `GET /api/advertisers/mine` — list everything tied to the
     signed-in wallet.
   - `POST /api/advertisers/:id/revise` — re-upload after a
     rejection (only valid in `rejected` or `pending_review`; image
     is held in `pending/` on disk and the status flips back to
     `pending_review`).
   The new `public/advertise-manage.html` page wires it all up:
   Phantom connect → sign challenge → see status + thumbnails for
   every ad on this wallet, with an inline revise form on rejected
   ones. The post-payment page now points here ("Manage my ads")
   and shows the advertiser ID + transaction signature.

5. **Content policy + all-ages warning.** `public/advertise.html`
   gained an explicit all-ages policy block before the form
   (nudity, violence, hate speech, gambling, misleading), plus a
   required "I confirm this is all-ages" checkbox. The post-payment
   confirmation in `public/js/advertiser-registration.js` now says
   "Awaiting moderator review" instead of the old "Activated!"
   message that lied about the new approval gate.

6. **Banner ad moved off the next-piece corner.**
   `public/js/floatingBanner.js` was anchored top-right at
   `top: 80px`, which slid in *underneath* the next-piece HUD
   (`z-index: 1000`, ~120 px tall). Re-anchored to `bottom-left`,
   bumped its `z-index` to 1200, and stretched the rotation
   interval from 15 s → 30 s. The post-placement `#sponsor-ad`
   panel also went from `z-index: 500` to `1100` so it stops being
   hidden by the same HUD.

### Sea aesthetic, mobile drag, longships, knight survival (late May 2026)

Player feedback flagged four loose ends after the polish pass:

1. **Floating-in-the-sea look ruined by hard shadows.** The water
   plane's `receiveShadow = true` plus the sun's directional
   shadow camera dropped a heavy dark blob under every cell —
   making the islands look glued to a flat slab. Fix:
   `water.receiveShadow = false` in `public/js/scene.js`. Cells
   still cast shadows onto each other (useful depth cue between
   stacked tetrominoes) but the sea surface stays clean.

2. **"Clouds" under cells should look like wave foam.** The cell
   support graphic in `public/js/boardFunctions/rendering.js` was
   a three-sphere `MeshStandardMaterial` puff that sat just below
   the cell base. Reskinned to a flat
   `CircleGeometry`-on-the-water-surface that reads as a foam
   splash, plus a sparse field of identical foam patches scattered
   across the open sea via the revived `createFewClouds.js`
   helper. Both pulse gently in `animateFoamPatches` so the sea
   isn't completely static.

3. **Long-press + drag the falling tetris piece on mobile.**
   `public/js/touchGestures.js` gains a `LONG_PRESS_MS` (280 ms)
   timer that promotes a single-finger touch into a drag once the
   finger holds still. While dragging, finger pixel delta is
   converted into board-cell steps using the same orientation
   mapping the swipe handler uses, then committed one cell at a
   time via `moveTetrominoX` / `moveTetrominoZ`. The piece keeps
   falling at the normal rate (we never touch
   `moveTetrominoY`); drift past 14 px before the timer fires
   cancels the drag-arm so a normal swipe still works.

4. **Knights survive without a path to king.** Disconnected-island
   decay (`server/game/IslandManager.js`
   `_processDisconnectedIslands`) was wiping any piece on a
   stranded island. Added a knight-specific protect rule: knights
   are passed straight through `removePiecesAtCells`, and the
   single cell the knight stands on is preserved with the
   timestamp refreshed so we don't re-log it every tick. Other
   stranded pieces still decay normally. Documented in
   `docs/players-bible.md` §15 rule 10.

Plus the start of a new advertising surface to replace the
sponsored-cell rotation that the user described as "complex to
begin with and needs work":

5. **Viking longship fleet (`server/world/boats.js`,
   `public/js/boatsRenderer.js`).** A pool of 6 longships orbits
   the playable area at a 28-unit radius with per-boat jitter so
   they don't queue up in a single line. Each carries an
   advertiser banner pulled from
   `routes/advertisers.pickAdvertiserForBoat()` every ~90 s. The
   server ticks at 200 ms and broadcasts at 500 ms via
   `boats_update`; the client interpolates between snapshots so
   the boats glide rather than teleport. Sails use a procedural
   red/white striped fallback texture until an advertiser image
   loads. `addPassenger`/`removePassenger` and a `passengers: []`
   field on every snapshot lay the groundwork for the
   knight-as-viking ride described in
   `docs/boats-and-viking-knights.md`. Tests:
   `tests/server/boats.test.js` (4).

### Disappearing pieces, sticky selection, pause / dormant-player handling (late May 2026)

Three live-feedback fixes shipped together after the cutover.

**Pieces vanishing during a row-clear cascade
(`public/js/wingAnimations.js`).** The wing-fall animation faded
`mesh.material.opacity` to 0 — but every piece of the same "side"
shares a single `ENHANCED_MATERIALS` instance, so the fade silently
made *all* surviving pieces invisible until something forced a fresh
render. Fix: when wings attach, walk the mesh and replace each
material with a per-instance `material.clone()`. The fall fade now
isolates to the airborne piece.

**Sticky / misrouted piece selection
(`public/js/chessInteraction.js`).** Two cooperating rules:

1. Clicking the currently-selected piece deselects it (no need to
   hunt for an empty cell to dismiss the selection).
2. If a different piece is selected with valid moves, and the
   candidate piece sits orthogonally adjacent to one of those green
   move targets, the click is treated as a "fizzle" — the user must
   double-click within ~450 ms to override. Click guards reset on
   selection / deselection so they never leak across pieces.

**Dormant-player handling (the big one).** Players who go offline
no longer come back to a one-move wipe. Three layered fixes:

1. **Degraded-home cells break line-clear runs
   (`server/game/cells.js`, `server/game/BoardManager.js`).** Cells
   tagged `fromHomeZone: true` (the `home_converted` remnants
   created when an idle home zone loses its `home` marker) are now
   treated as gaps for the line-scan and survive
   `stripForLineClear`. They still convert ownership on tetromino
   placement and still decay via island integrity, but they no
   longer hand a returning player a guaranteed wipe.
2. **Slower degradation while online
   (`server/world/homeZones.js`).** Online but idle players now
   degrade after `HOME_ZONE_DEGRADATION_INTERVAL × 12` (≈ 1 hr),
   matching the user's "if they must degrade then it must happen
   whilst they aren't looking" rule. Offline players continue to
   degrade on the bible's 5-minute timer.
3. **Manual pause / resume (`server/world/pause.js`,
   `server/sockets/lifecycle.js`,
   `public/js/unifiedPlayerBar.js`).** New `pause_player` /
   `resume_player` / `pause_status` socket events plus a "⏸ Pause"
   button in the player sidebar. While paused:
   - The owner's cells are skipped by the line-clear scan
     (`BoardManager._cellIsOwnedByPausedPlayer`).
   - The owner's pieces refuse capture
     (`moveValidation._isOwnerPaused`).
   - Home-zone degradation is frozen.
   - Auto-resumes after 30 minutes; usage is capped at
     `PAUSE_MAX_USES` (4) and a total of 60 minutes per session.

The `players` payload in every broadcast now carries `paused` and
`pauseUsesRemaining` so opponent rows render a "⏸ paused" badge.

Tests: `tests/server/cellsDegradedHome.test.js` (6 tests) for the
degraded-home rule and `tests/server/pauseService.test.js` (7
tests) for the pause budget / idempotency. Existing 404-test
server suite remains green.


### Pre-launch polish (late May 2026)

A small, targeted sweep before opening the door to playtesters.

**Bug: line-clear bled past the home-cell gap
(`server/game/BoardManager.js`, `server/game/LineClearService.js`).**
Home cells correctly *broke the run* during scanning, but the
destructive step still cleared the whole row, so the cells on
the far side of any home / degraded-home / paused-player gap
disappeared too. Fix: `_findClearableLines` now tracks all
qualifying *runs* (range pairs) per line, `findClearableLines`
exposes them via new `rowRuns` / `colRuns` Maps, and
`applyClearedLines` / `_clearLine` clip the destruction to those
ranges. Multiple qualifying runs in the same line both clear,
each bounded by its own gap. Two new tests in
`tests/server/BoardManager.test.js` lock the behaviour in.

**Production hardening.**

- Admin gate (`routes/advertisers.js`, `server/app.js`): the
  `/admin/advertisers` panel and the destructive
  `/api/advertisers` endpoints (POST register, POST activate,
  PUT, DELETE, GET list, GET :id/stats) now require an
  `ADMIN_TOKEN` env var when `NODE_ENV=production`. Pass it via
  the `x-admin-token` header (API) or `?adminToken=…` (admin
  page). In development the gate is open so local workflows
  aren't disturbed.
- Log noise cull (`server/game/IslandManager.js`): the
  "Player … has N disconnected islands after row clear" line
  was being emitted on every 10 s integrity tick, dominating
  PM2 logs (~1 350 of 1 500 lines in a recent capture). It's
  now a single summary "Island integrity: N disconnected
  island(s) pending decay" that only fires when the count
  changes (and a "queue cleared" line when it drops to zero).
- Dead static assets removed from `public/`:
  `enhanced.html`, `enhanced-game.html`, `interaction-test.html`,
  `dev-test.html`, and the never-imported `debugHelper.js`.
  The 2D-retired stubs (`public/2D/index.html`,
  `public/index-2d.html`) stay — they exist solely to give a
  graceful "this mode is gone" page to anyone with a stale
  bookmark.

**Pause-button UX (`public/js/unifiedPlayerBar.js`).** The
sidebar pause control no longer gets stuck on "Pause
(loading…)" if the very first `pause_status` request loses the
race with the socket join — it now retries once after 2.5 s,
falls back to the unfetched default if that also fails, and
shows a tooltip explaining the cap. Initial label is now
`⏸ Pause` so it doesn't *look* broken before the status
returns.


### Power-up orbs + ghost-player sweep + promotion-credit redeem (May 2026)

Three intertwined feature/bugfix shipped in one pass — all sparked
by direct user feedback ("I spawn into a new game and was miles
away from any other player… there are still LOADS of empty
players that need to be cleared… I'd like to spawn a pawn and
have it promoted to deploy a captured piece… maybe also random
orb power-ups").

**Ghost-player sweep (`server/world/ghostPlayerSweep.js`).** A new
service that runs every 30 s (configurable via
`GHOST_PLAYER_SWEEP_MS` in `server/bootstrap.js`) and:

1. Flags any non-eliminated player with **zero chess pieces** for
   longer than `NO_PIECES_GRACE_MS` (60 s) as `eliminated`.
2. Fully removes any eliminated player who is offline (no live
   socket) or is an AI, after their elimination has aged past
   `REMOVAL_GRACE_MS` (90 s), via
   `lifecycleService.removePlayerCompletely`. This also drops
   their home zone, so the placement engine stops anchoring new
   joiners to dead-king corpses (the "miles away" bug).
3. On boot, a separate `reapImmediately()` pass strips any
   zero-piece player from the persisted snapshot before the AI
   roster reattaches — fresh servers no longer inherit ghost
   players from previous sessions.

Per-event activity logging is emitted via
`activityLog.recordPlayerReaped`, so the Recent Activity panel
explains why a player vanished. Existing pawn-promotion and
basket-deploy paths reset the empty-piece timer, so a player who
basket-deploys a queen on the cusp of being reaped is correctly
spared.

Tests in `tests/server/ghostPlayerSweep.test.js` (5 tests) cover
the grace-window flag, AI removal, boot sweep, basket-fed
recovery, and the no-reap-while-online guarantee.

**Power-up orbs (`server/game/PowerUpManager.js`).** Random orbs
appear on empty cells, contain a piece type, and convert into a
real chess piece for whoever connects to the cell first via a
tetromino placement. Implementation:

- `tick()` runs every `POWER_UP_TICK_MS` (15 s), pruning expired
  orbs (`ORB_LIFETIME_MS` = 90 s) and probabilistically spawning
  a new one if below the active cap (1 per 4 living players, max
  6).
- Spawn type uses a weighted random pull from `PIECE_TYPE_WEIGHTS`
  (PAWN 65, KNIGHT 12, BISHOP 10, ROOK 8, QUEEN 5) — pawns are
  the most common, queens are a treat.
- Spawn location targets the player with the **fewest pieces**
  via inverse weighting (`pickTargetPlayer` — a player with 1
  piece is ~6× more likely to attract an orb than one with 12),
  so power-ups bias toward struggling players the user asked for.
- The orb appears within 5–14 cells of that target's home-zone
  centre, in a cell with no chess / tetromino / home content.
- `claimAcrossPlacement(world, playerId, placedCells)` is called
  by both `server/sockets/tetromino.js` and `server/ai/actions.js`
  after a successful tetromino placement. For each cell that
  overlaps an orb, the orb is removed, `pieces.addPiece` spawns
  the contained piece for the placer, and a `powerup_claimed`
  socket event + activity-log event fire.

Client: `public/js/powerUpRenderer.js` (new) builds a Three.js
group per orb (sphere + glow + interior silhouette of the piece
type), `gameLoop.js` calls `syncPowerUps` + `animatePowerUps`
each frame, `networkEvents.js` mirrors the server orb list into
`gameState.powerUps`, and `activityLog.js` renders the new
`chess_piece_spawned`, `powerup_spawned`, `powerup_claimed`,
`powerup_expired` event types with friendly labels.

Tests in `tests/server/powerUpManager.test.js` (7 tests) cover
spawn, claim, expiry, struggling-player bias, occupied-cell
avoidance, no-op claims, and exclusion of eliminated players from
spawn targeting.

**Promotion credits + redeem flow (May 2026, revised).** The first
cut of "deploy from basket" let the player spawn a fresh pawn and
instantly promote it. The user pushed back: that's effectively a free
piece, when the intended UX is "earn the promotion the long way
(walking a pawn across the board) and only then deploy a captured
piece." The reworked flow:

1. **Auto-bank credit.** The chess_move handler watches the moving
   pawn's `forwardDistance`. The instant it crosses
   `PAWN_PROMOTION_DISTANCE` (currently 9) the helper
   `bankPromotionCredit(world, playerId, pawn)` removes the pawn
   from the board and pushes a
   `{ id, fromPieceId, originalX, originalZ, createdAt }` entry
   onto `player.promotionCredits`. A `promotion_credit_added`
   socket event + `pawn_promoted_to_credit` activity event fire.
2. **Redeem on demand.** The player picks a captured piece type
   (must be present in their `capturedBasket`) and emits
   `redeem_promotion { capturedType, creditId? }`. The server
   calls `resolveRedeemSpawnCell(...)`:
   - If the credit's original cell is still owned territory and
     has no chess piece on it, the captured piece spawns there.
   - Otherwise the helper `territory.findNearestOwnedCell(...)`
     in `server/game/territory.js` picks the closest owned cell
     to the player's king (skipping cells that already have a
     chess piece). The user's "if the cell got cleared, fall
     back to the one nearest to the king" rule.
   - If the player has zero owned cells (a king-only edge case
     while we wait for the auto-respawn) the redeem is rejected
     with `No owned cell available to deploy the piece` and the
     credit + basket entry stay banked.
3. **Both ledgers consumed atomically.** A successful redeem
   removes one credit and one matching basket entry, broadcasts
   game state, pushes fresh `captured_basket` + `promotion_credits`
   to the player, and fires `promotion_credit_redeemed` (carries
   `fallback: true` when the original cell was gone).

Legacy `promote_pawn { pieceId }` is still wired up as a manual
"bank now" trigger (in case auto-bank ever misses), but it's a
no-op when the pawn is already gone — strict idempotency.

Failure modes the server enforces on redeem: eliminated player,
invalid type (no PAWN redeems), no credits banked, no matching
basket entry, no owned cell to spawn into. Each returns a
specific `error` string the client surfaces as a toast.

Client UX:
- **Basket badge** (in `public/js/unifiedPlayerBar.js`) is now
  read-only — it shows captured counts but no longer launches a
  dialog. The "free piece" affordance is gone.
- **Promotion-credit badge** (★N) sits next to the basket badge,
  green-bordered. Clicking it (local player only) opens
  `showPromotionRedeemDialog` from `public/js/uiOverlays.js`
  which shows the oldest credit's original cell and the player's
  available captured types. If the basket is empty, the dialog
  explains "capture a piece to redeem this credit" instead of
  showing redeem buttons.
- **Auto-popup.** When `promotion_credit_added` fires for the
  local player, the network-event handler pops the redeem dialog
  open immediately if the basket already holds a redeemable piece;
  otherwise it just toasts "Pawn promoted! Capture a piece to
  redeem this credit."
- **Network wiring.** `NetworkManager.redeemPromotion(type,
  creditId?, callback)` (in `utils/NetworkManagerClass.js`,
  re-exported via `utils/networkManager.js`) emits
  `redeem_promotion`. `promotionCredits` lives on `gameState`
  and is updated by `promotion_credits` (full list) +
  `promotion_credit_added/_redeemed` (single events).

Tests in `tests/server/capturedBasket.test.js` were rewritten
(22 total) to cover:
- promote_pawn banks a credit and removes the pawn,
- distance-not-reached and idempotent-double-call rejections,
- redeem against the original cell,
- fallback-to-nearest-king-cell when the original is gone,
- basket-empty / wrong-type / eliminated-player / no-territory
  rejections, and
- per-player promotion-credit broadcasts.

Server data-model updates:
- `server/world/World.js → createPlayerRecord` initialises
  `capturedBasket: []` and `promotionCredits: []`. The
  `restoreWorldFromSnapshot` backfills both on restored records
  so existing saves Just Work.
- `server/world/activityLog.js` records the two new event types
  (`pawn_promoted_to_credit`, `promotion_redeemed`).
- `server/net/broadcasts.js → buildPlayersList` exposes
  `promotionCreditCount` for the sidebar; a new
  `emitPromotionCredits(playerId)` mirrors `emitCapturedBasket`
  for the local-player private list.
- A new helper module `server/game/territory.js` exposes
  `findKingPosition`, `isOwnedTerritory`, `findNearestOwnedCell`,
  and `cellHasChessPiece` — shared between the redeem flow and
  future "where should this piece go?" features.

**Shared plumbing.**
- `server/game/pieces.js` exports `addPiece(world, spec)`,
  `removePiece(world, pieceId, opts)`, and
  `findEmptyPawnSlot(world, playerId)` — `addPiece`/`removePiece`
  are reused by power-up claims, promotion credit redeems, and
  the bank-a-credit path. New activity event:
  `chess_piece_spawned`.
- `server/world/activityLog.js` records seven event types added
  in this batch (`chess_piece_spawned`, `player_reaped`,
  `powerup_spawned`, `powerup_claimed`, `powerup_expired`,
  `pawn_promoted_to_credit`, `promotion_redeemed`).
- `server/world/World.js → freshWorld` initialises
  `world.powerUps`, `player.capturedBasket`, and
  `player.promotionCredits`; `restoreWorldFromSnapshot` backfills
  the player-record fields so older saves Just Work.
- `server/net/broadcasts.js → buildGameStatePayload` includes
  `powerUps` in both full and sparse game-update payloads;
  `buildPlayersList` exposes `capturedCount`, `capturedSummary`
  and `promotionCreditCount`; `emitCapturedBasket` and
  `emitPromotionCredits` push private per-player ledgers.
- `public/js/utils/gameState.js` handles incoming `powerUps`,
  `capturedBasket`, and `promotionCredits` in its `update(data)`
  path.
- `public/js/gameContext.js` exposes `getPowerUpGroup`
  /`setPowerUpGroup` for the Three.js scene group.
- `public/js/powerUpRenderer.js` translates orb world coordinates
  through `centreBoardMarker.translatePosition` so orbs land on
  the same scene cell as the board mesh; renders a ground disc +
  vertical tether so the player can see *which* cell to build
  under.

All 376 server tests pass with the new code (374 → 376, +2 net
after the deploy-from-basket tests were swapped for the new
promote_pawn/redeem_promotion suite).

### Connectivity rule (orthogonal-only) — decision recorded

The user asked us to weigh diagonal-vs-orthogonal connectivity
for the path-to-king BFS. Both implementations are simple; the
decision matters because island disconnection is one of the
strategic levers of the game. The choice we made:

**Decision: keep orthogonal-only (4-connectivity).**

Pros for allowing diagonals (rejected):
- Connectivity becomes easier to maintain across line-clear
  cascades.
- Single-cell "bridges" let players preserve scraggly
  territories with less material.

Cons (the reason we stuck with orthogonal):
- Tetrominoes themselves are edge-connected; allowing diagonal
  connectivity would mean the game treats two pieces as joined
  when Tetris itself would not.
- Diagonal bridges trivialise the disconnected-island decay
  mechanic — a single corner-touch cell keeps any region alive
  indefinitely.
- Decay thresholds in `IslandManager.js`
  (`DISCONNECTED_MOVE_LIMIT`, etc.) were tuned assuming
  orthogonal connectivity; loosening would force a full
  rebalance.
- Orthogonal connectivity is faster to visually verify (humans
  trace an orthogonal path much quicker than a diagonal one).
- Matches the rook's reach and the players-bible §156 rule
  ("Adjacency – at least one cell of the piece must be
  **orthogonally adjacent**").

The rule is already implemented consistently in
`server/game/IslandManager.js` (`hasPathToKing`, `findIsland`)
and documented in `docs/players-bible.md` §555. No code change
required — this entry exists so future "should we allow
diagonals?" debates start from where we landed.

### Production-readiness audit

See [`docs/production-readiness.md`](docs/production-readiness.md)
for the full P0/P1/P2 list and
[`docs/tetches-cutover.md`](docs/tetches-cutover.md) for the
step-by-step "ship tetches.com on 95.216.77.237" runbook.

**Shipped in the May-21 hardening pass:**

- **Branding.** Codebase + docs + nginx + Jenkins + manifest + meta
  all migrated from `shaktris.com` to `tetches.com`. One-shot
  rebrand script lives at
  [`scripts/rename-shaktris-to-tetches.js`](scripts/rename-shaktris-to-tetches.js)
  for future cleanups.
- **Security middleware.** Helmet (CSP, HSTS, XFO, etc.), CORS
  allowlist via `ALLOWED_ORIGIN`, generic `/api` rate limit, and a
  per-IP+email magic-link throttle. Socket.IO handshake gets the
  same origin allowlist plus tighter ping intervals. Covered by
  `tests/server/security.test.js`.
- **Reliability.** `capturedBasket` + `promotionCredits` now
  persist across restarts (previously zeroed on every reboot —
  silent data loss). Rolling backups under `data/backups/` keep
  six hourly snapshots and prune by mtime. Auto-save throttling
  unchanged; SIGTERM/SIGINT graceful shutdown handler is the same
  one that's been in place since the Phase-3 refactor.
- **Observability.** Pino structured logger
  (`server/observability/logger.js`), Prometheus `/metrics`
  endpoint (`server/observability/metrics.js`) tracking players,
  cells, sockets, API requests, and persistence saves.
  `routes/api.js` gains a cheap `/api/health` probe used by the
  Dockerfile HEALTHCHECK.
- **Build / Deploy.** Multi-stage `Dockerfile` + `.dockerignore`,
  refreshed `Jenkinsfile` with an ESLint stage,
  `.github/workflows/ci.yml` (lint + server tests + advisory
  audit + docker smoke). All ten of the `shaktris-*` PM2 /
  /var/www paths flipped to `tetches-*`.
- **Code quality.** ESLint flat config (`eslint.config.js`) wired
  to `npm run lint`; CI gate is zero errors (warnings allowed).
- **Gameplay.** Player nameplates render above every king on the
  board (`public/js/nameplateRenderer.js`); the strip shows the
  player's captured-piece summary in *the original owner's
  colour* so it's obvious which colour each glyph represents.
  Spectator mode adds the captures strip to the nameplate; HUD
  always shows it for active players. Server's `buildPlayersList`
  now emits a per-piece `capturedBreakdown` so the UI can do this
  without leaking other players' private credits.

**Shipped in the May-22 hardening pass:**

- **Sentry.** Server-side `@sentry/node` integration via
  `server/observability/sentry.js`. Hook is opt-in (`SENTRY_DSN`
  env var); dev runs are silent. Wired into Express
  request/error middleware, `installProcessHandlers()` catches
  uncaught exceptions and unhandled rejections, and the helper
  redacts cookies + auth headers before sending. Tetches project
  lives in the `funge` org on Sentry.io.
- **Sound design.** Procedural Web Audio via
  `public/js/audio/soundManager.js` + a cue catalogue at
  `public/js/audio/cues.js`. Eight cues (line clear, capture, orb
  claim, promotion, drop, hard drop, king fall, error / tick) all
  generated from oscillator envelopes — zero asset licensing, zero
  bundle weight, swap to real samples later by extending the cue
  spec. Floating mute button (`public/js/audio/muteButton.js`) and
  `M` keyboard shortcut; mute state persists via `localStorage`.
- **Keyboard-only input.** `public/js/keyboardChess.js` adds Tab
  to cycle own pieces, arrow keys to cycle valid moves by direction
  relative to the selected piece, Enter to confirm, Escape to
  cancel. Sits on top of the existing tetromino-phase keyboard
  bindings (arrows / Z+X / Space) which were already complete.
- **Touch-only input.** `public/js/touchGestures.js` adds swipe to
  move tetrominoes, double-tap to rotate clockwise, two-finger tap
  to rotate counter-clockwise, and long-press to hard drop. Taps
  fall through to the existing chess-raycast handler so single-tap
  piece selection still works.
- **Deploy script.** `scripts/deploy-tetches-cutover.sh` bundles
  every sudo command from the runbook into one idempotent batch —
  syncs the repo into `/var/www/tetches.live`, runs `npm ci`,
  drops the bootstrap nginx config, runs certbot, swaps in the
  hardened nginx config from `ci/nginx-production.conf`, and
  starts the PM2 process. Re-runnable; each step is guarded.

### Guest name, orb anchors, client bundle (May 2026)

- **Guest name fix.** `join_game` no longer accepts the literal
  `'Guest'` as a real name; the socket handshake `playerName` is
  applied on connect/reconnect; the client always prefers
  `localStorage.playerName` over server placeholders (`Player_xxx`,
  `DevPlayer_xxx`); inline rename via `change_name` stays in-world.
- **Power-up orbs.** Each orb sits on a translucent ghost cell
  (0.94³, matching board cells) plus wireframe + tether beam;
  `translatePosition` keeps orbs aligned with the board grid.
  Claims fire when a tetromino lands on the orb cell **or** on an
  adjacent cell. Orbs spawn in empty sky 4–14 cells from the
  target home zone — players bridge to them. Caps lowered (max 4
  orbs, ~35% spawn chance / 45 s tick).
- **Code shape + bundle.** `NetworkManagerClass` →
  `socketEventBridge` + `eventBus`; `ChessManager` →
  `chess/moveValidation.js`; `npm run build:client` →
  `public/dist/app.bundle.js` (served via `indexHtmlBundleSwap`).

### King lives + selected-piece info card (May 2026)

- **King lives.** Each player gets `KING_INITIAL_LIVES = 3`.
  When a king is about to be removed for an unintentional reason
  (row-clear → `fell_to_water`, island decay, knocked off by a
  landing piece) `server/king/kingLives.js` consumes one life,
  re-anchors the king at the home-zone centre on a fresh
  `king_anchor` cell, and emits `king_respawned` (with
  `remainingLives` + reason). On the last life the player is
  marked eliminated and `king_eliminated` fires for the existing
  game-over flow. Intentional removals (`captured`, `detonated`,
  `king_detonation_collateral`, `suicidal_pawn`, `player_left`,
  `world_reset`) bypass the service. Hooked into
  `BoardManager.settleAirbornePieces`,
  `IslandManager.checkForIslandsAfterRowClear`, and
  `pieces.removePiece` via an opt-in `kingLifeService` ctx field
  so unit tests stay unaffected. Tests:
  `tests/server/kingLives.test.js` (5).

- **Selected-piece info card.**
  `public/js/selectedPieceCard.js` shows a small bottom-right
  panel whenever the local player has a chess piece selected.
  Reads `moveCount`, `captureCount`, `distanceTravelled` and
  `forwardDistance` (pawns only) plus `kingLives` (kings only)
  from `gameState.chessPieces`, refreshing every 500 ms so
  numbers update after server-confirmed moves. The server now
  bumps `piece.distanceTravelled` (Manhattan delta) and
  `piece.captureCount` in `ChessManager.executeChessMove`; the
  mesh `userData` carries the same fields so the card draws
  immediately on click without waiting for the next
  `game_update`.

### Stuck-state recovery: missing king + duplicate pieces (26 May 2026)

A live debug uncovered a worst-case persistence corruption: a human
player's king vanished from `world.chessPieces` without
`kingLifeService.handleKingDeath` ever firing, and two of their other
pieces had been spliced into the array twice with identical IDs.
Symptom: the client tetromino spawn pipeline (`determineInitialTetrominoPosition`)
returned `null` because `getPlayersKing` found no king, so the player
sat on the title screen with no falling piece and no way to escape —
even after a page reload (the broken state lived on the server).

Fixes:

1. `server/king/missingKingSweep.js` — new service.
   `tick()` dedupes `world.chessPieces` by id (first occurrence wins)
   and respawns a fresh king at the home-zone centre for every
   non-eliminated, non-AI player with chess pieces but no king. Sets
   `kingLives` to the default if missing and clears any stale
   `pendingRespawn` flag. Forces a full `game_update` broadcast.
2. `server/bootstrap.js` — calls `missingKingSweep.tick()` on boot
   immediately after the integrity / AI roster passes, and re-runs
   it every `GHOST_PLAYER_SWEEP_MS * 3` (60 s) thereafter.
3. `server/world/World.js#restoreWorldFromSnapshot` — dedupes
   `chessPieces` by id when restoring persistence so the next boot
   doesn't replay the same corruption.
4. `server/sockets/join.js` — the `join_game` handler runs the
   sweep once per join so a stuck user is rescued immediately when
   they reload, rather than having to wait up to a minute.
5. `public/js/tetromino/movementQueue.js#processCleanup` — when the
   client `initializeNextTetromino` returns `null` (king missing),
   the queue now sends `request_tetromino` to the server with a
   "Recovering game state…" toast instead of leaving the player
   with an invisible piece and a hung Space key.

### Player-pieces colour flicker on mode switch (26 May 2026)

Every chess piece briefly turned the local player's warm wood colour
half a second after switching render modes, then snapped back to its
real colour. Root cause: `public/js/boardFunctions/colours.js#isLocal`
checked `gameState.currentPlayer` (which is **"whose turn is it"** in
the player-bar semantics — entirely unrelated to "which player am
I"). When the active turn flipped to another player, all of *their*
pieces were repainted in the local palette. Fix: `isLocal` now reads
only `gameState.localPlayerId` (or `myPlayerId` as a fallback) and
never `currentPlayer`. The flicker is gone.

### Bonus orbs no longer drift into home cells (26 May 2026)

`PowerUpManager.isCellAvailableForOrb` previously only rejected
non-empty cells. If a cell was empty but inside another player's
home-zone rectangle (e.g. after the zone degraded and lost its home
markers), an orb could still land there. Added an
`isInsideAnyHomeZone` guard so the spawn loop refuses to drop an orb
inside any player's home-zone rectangle, occupied or not.

### Advertiser activation is public again (26 May 2026)

`POST /api/advertisers/:id/activate` was decorated with
`requireAdmin` — wrong, that's the **paying customer's** endpoint for
confirming their transaction signature. Production responded with
"Admin endpoints are disabled (ADMIN_TOKEN not configured on this
server)." for anyone connecting a wallet. Removed the middleware and
documented the access policy in the JSDoc block above the route.
`public/advertise.html` also now ships `@solana/web3.js` from
`unpkg.com` so the wallet flow can sign + send the transaction in
the page instead of falling through to the manual signature flow.

### Knight head: less forward poke, rounder profile (26 May 2026)

`createRussianKnightPiece` in
`public/js/chessPieceCreator/russianPieces.js` was redrawn so the
head silhouette sits over the body rather than reaching forward like
a racehorse stretching for the finish line. The muzzle now stops at
x≈0.38 instead of x≈0.54, the forehead/chin curves are gentler, and
the extrude bevel was bumped from 0.025 to 0.045 so the whole head
reads as soft + rounded at all view angles. Ears, mane and forelock
positions were nudged back in line with the new head.

### King death now ends with drama, not a whimper (28 May 2026)

A king that ran out of its three lives (e.g. walked into the water a
third time) used to just flip the player to `eliminated` and emit a
bare `king_eliminated` — all the player's other pieces and cells sat
there untouched. Now the final death routes through the existing
lemming-style detonation:

- `server/king/kingLives.js` — `createKingLifeService` accepts a
  `kingDetonationService`. On the final death it schedules
  `detonateKing` on the next tick (so we never mutate `chessPieces`
  while a caller is iterating it). The detonation reason gets an `ai_`
  prefix for bots so clients show the right toast.
- `server/game/pieces.js` — `removePiece` / `removePiecesAtCells` now
  treat a `detonating` outcome like `respawned`: the king is left in
  play for the detonation service to remove at the end of the
  animation rather than being spliced out immediately.
- `server/bootstrap.js` — wires the detonation service into the
  king-life service.
- The detonation already explodes every owned cell furthest-first and
  removes all collateral pieces, so the player's forces and territory
  now go out in rings. The local client plays the explosion chain plus
  the "GAME OVER" pulse (the redundant `king_eliminated` toast was
  dropped so the detonation owns the on-screen drama).

### King-capture path unified for AI + humans (28 May 2026)

The AI used to call `kingCaptureService.executeKingCapture` directly,
skipping the simultaneous-capture window and King's-Duel detection the
human handler had — so an AI could never be drawn into a duel and its
captures weren't recorded in `pendingKingCaptures`.

- `server/king/capture.js` — new shared `resolveKingCapture({ captorId,
  defeatedId })` entry-point: idempotency guard, reverse-capture →
  King's Duel hand-off, otherwise records + executes. `setDuelService`
  late-binds the duel service to dodge a constructor-time circular dep.
- `server/sockets/chess.js` `handleKingCaptured` and `server/ai/
  actions.js` (both capture sites) now call `resolveKingCapture`. Human
  behaviour is unchanged; the AI is now duel-eligible and idempotent.

### AI pawns freeze at the promotion line (28 May 2026)

AI pawns tracked `forwardDistance` but never froze, so they marched on
as unkillable super-pawns. The freeze logic moved to a shared module
so both paths are identical:

- `server/game/promotion.js` — new home for `markPawnAwaitingPromotion`
  (imported by both `server/sockets/chess.js` and `server/ai/
  actions.js`).
- `server/ai/actions.js` — freezes a pawn that completes the 8-square
  walk and filters frozen pawns out of the move loop so the AI never
  tries to drag a locked pawn around.

### Starting a check now costs your move (28 May 2026)

`server/sockets/chess.js` — the check-defer path returned early without
stamping `lastChessMoveAt`, so a player could fire off back-to-back
king attacks with no cooldown. Both the human handler and the AI
(`server/ai/actions.js`, deferred-check branch) now stamp the move
time + bump `moveCount`, consuming the chess-move cooldown.

### Pieces get a grace window before evaporating (28 May 2026)

`server/world/integrity.js` — `repairChessPieceCellConsistency` used to
delete a non-king piece the instant its supporting cell was gone, which
could vanish a piece mid line-clear cascade before gravity/settle
landed it. Now a cell-less piece starts a `unsupportedSince` clock and
is only removed after a 30 s grace (cleared the moment a cell reappears
under it). Marooned-but-supported pieces are still handled by island
decay's own grace policy.

**Still on the list:**

- **Replay system.** Export activity log + viewer route.
- **Deploy:** run `scripts/deploy-tetches-cutover.sh` on
  tetches.com so the above reaches production.

