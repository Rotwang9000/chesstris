# 07 Changelog May 2026 C

> Part of the [Tetches project outline](README.md). May 2026: power-up orbs, connectivity, production audit.

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

**Still on the list:**

- **Replay system.** Export activity log + viewer route.
- **Deploy:** run `scripts/deploy-tetches-cutover.sh` on
  tetches.com so the above reaches production.

