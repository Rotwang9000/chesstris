# 07 Changelog May 2026 C

> Part of the [Tetches project outline](README.md). May 2026: power-up orbs, connectivity, production audit.

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
- **Code shape + bundle.** `NetworkManagerClass` →
  `socketEventBridge` + `eventBus`; `ChessManager` →
  `chess/moveValidation.js`; `npm run build:client` →
  `public/dist/app.bundle.js` (served via `indexHtmlBundleSwap`).

**Still on the list:**

- **Replay system.** Export activity log + viewer route.
- **Deploy:** run `scripts/deploy-tetches-cutover.sh` on
  tetches.com so the above reaches production.

