# Tetches — Production-Readiness Audit (May 2026)

A focused, opinionated review of what's between Tetches and a happy
"launched" stamp. Items are grouped by area and ordered roughly by
"how badly will this hurt us in week one of public play". Tick
items off as they ship; add new findings as they surface.

The audit assumes the current single-world model on a single Node
process — the multi-shard discussion is parked at the bottom under
"Scale".

---

## P0 — must fix before opening to non-trusted users

These are the items that would cause real harm (data loss, abuse,
or a broken first impression) if we shipped today.

### Security

- **No HTTP security headers.** `server/app.js` mounts `express` +
  `body-parser` and that's it. Add [`helmet`](https://helmetjs.github.io/)
  with sane defaults (frameguard, contentSecurityPolicy, hsts,
  noSniff). Even a permissive CSP is better than no CSP.
- **No CORS policy.** The Socket.IO server happily accepts
  connections from any origin. Set the `cors` option on
  `socket.io` (and Express middleware) to the production
  origin(s) so a hostile page can't drive someone's session.
- **No rate-limiting at the transport layer.** We have
  per-action cooldowns inside the socket handlers (see
  `server/utils/cooldowns.js`), but a sufficiently fast client
  can still spam the wire. Add
  [`express-rate-limit`](https://www.npmjs.com/package/express-rate-limit)
  on the REST API and [`@socket.io/admin-ui`](https://socket.io/docs/v4/admin-ui/)
  budget hints / a custom token-bucket middleware on the
  socket handshake.
- **Magic-link auth has no rate-limit + no IP throttling.**
  `handleRequestMagicLink` will happily generate and send
  emails to any address as fast as the SMTP relay accepts them.
  At minimum: cap to 3 requests / 10 minutes per `(email, IP)`,
  bounce excess with `429`.
- **Server-side input validation is per-handler and partial.**
  Some socket handlers (`chess_move`, `tetromino_placed`)
  trust client-supplied IDs without a shape check. Centralise
  validation using something tiny like [`zod`](https://zod.dev/)
  or [`ajv`](https://ajv.js.org/) so each event has a schema
  and rejection is consistent.
- **The `tests/security/` suite is failing** (the run produced
  "FAIL security tests/security/inputValidation.test.js"). Even
  if the tests are stale, they're our security smoke test —
  resurrect or replace them, don't leave them red.
- **`.env` is committed** (in the workspace root, dated Jan 2025).
  Verify nothing sensitive is in it (especially API keys for
  SendGrid). Move to `.env.example` for the checked-in template
  and add `.env` to `.gitignore` if it isn't already.

### Reliability

- **Single-process world; no graceful shutdown.**
  `server.listen()` is the only lifecycle. If the process is
  killed mid-write, persistence may corrupt. Wire
  `SIGTERM`/`SIGINT` handlers in `server.js` that:
  1. Refuse new socket connections,
  2. Flush `persistence` to disk,
  3. Close existing sockets cleanly with a "server restarting"
     toast,
  4. Then `process.exit(0)`.
- **No persistence integrity check on boot.** If `world.json`
  is half-written, the server starts with a broken snapshot and
  every player sees an empty/wrong board. Wrap the JSON parse
  in a try/catch that backs the corrupt file aside and starts
  fresh, with a loud log.
- **No backup rotation.** The persistence layer overwrites a
  single file. Add a rolling backup (e.g. keep the last 6
  hourly snapshots) so a bug in `pieces.removePiece` doesn't
  vaporise the world.

### Observability

- **`console.log/warn/error` everywhere; no structured logs.**
  Replace with
  [`pino`](https://getpino.io/) or
  [`winston`](https://github.com/winstonjs/winston) so we can
  pipe logs to a real sink and search them. Tag every event with
  `worldId`, `playerId` where known. Without this, debugging a
  player report in production is a `grep` archaeology dig.
- **No metrics endpoint.** Add a `/metrics` route exposing
  [Prometheus](https://prometheus.io/docs/instrumenting/exposition_formats/)
  counters for: tetrominoes placed/s, chess moves/s, active
  players, active sockets, orb claims, king captures. Five
  minutes of work for a year of "is the game alive?" peace
  of mind.
- **No error reporting.** Catch uncaught exceptions in
  `server.js` and ship them to [Sentry](https://sentry.io/)
  (free tier is fine for indie scale). The current behaviour
  silently kills the Node process — a player report is the
  first we'd hear.

---

## P1 — strongly recommended before public launch

Quality bar that crosses the line from "playable" to "shippable".

### Build / Deploy

- **No Dockerfile.** The repo has a `docker-compose.jenkins.yml`
  (CI only). Add a multi-stage Dockerfile so deploys are
  reproducible: `node:20-alpine` build, copy `package*.json`,
  `npm ci --omit=dev`, copy source, set non-root user. Easy
  Fly.io / Railway / Render target.
- **Static-asset bundling is missing.** `public/js/**` is
  served raw, which means 100+ unbundled ES module requests
  on every cold load. Add a thin Vite or esbuild step so
  production gets a minified, code-split bundle.
- **No service worker / no asset hashing.** Once we bundle,
  hash filenames and cache aggressively. Without this, every
  CSS tweak invalidates everyone's cache the slow way.
- **`docs/deployment-guide.md` is from January.** Reread and
  refresh — half the operational notes predate the
  single-world refactor.
- **No CI gate.** GitHub Actions / your CI of choice should
  run `npm test` + `npm audit --omit=dev` + a lint pass on
  every push. Currently `package.json` exposes scripts but
  nothing wires them to PRs.

### Reliability

- **Persistence is synchronous JSON.** With a few dozen
  active players this is fine; with a hundred it stalls the
  event loop on every flush. Move to async writes with a
  debounced batch (`p-debounce` or just `setTimeout`) and
  consider SQLite/LiteFS if we need crash-safe writes.
- **No client reconnection guarantee.** `socket.io` retries
  by default, but the client app doesn't fully reconcile its
  optimistic state with a re-served snapshot. Search for
  `// TODO sync` in `public/js/utils/NetworkManagerClass.js`
  (and any optimistic-update sites in tetromino/chess flows)
  and add a hard re-sync on `reconnect`.
- **Memory leak risk in activity log.** The buffer is capped at
  200 events per world, but `_activityLogNextId` grows
  monotonically forever — fine for a long time, but
  document the wraparound. More importantly,
  `socket.io` event listeners on the client (`NetworkManager.on`)
  accumulate if the player navigates between menus and back —
  audit `removeListener` calls.

### Performance

- **`NetworkManagerClass.js` is 1,433 lines.** That's a code
  smell, not a bug, but it's becoming a god-object. Split into
  `transport.js` (socket lifecycle), `events.js` (event
  bus / typed event surface), `commands.js` (request/response
  helpers), and `state.js` (cached gameState facade).
- **`server/sockets/chess.js` is 1,030 lines** and growing.
  Same treatment: extract `bankPromotionCredit` and
  `resolveRedeemSpawnCell` (which now live there) into
  `server/game/promotion.js`. Same for `handleKingCaptured`.
- **`server/game/ChessManager.js` is 1,614 lines.** Per the
  workspace rule "if a file is 1500 lines or more, it's time
  to do some refactoring". Pull move generation, validation,
  and execution into separate modules.
- **Client THREE.js scene leaks.** `disposePowerUpVisuals`
  exists; double-check every other renderer (`updateChessPieces`,
  `tetromino.js`, `boardFunctions/rendering.js`) calls
  `geometry.dispose()` + `material.dispose()` on removal.
  Long sessions otherwise grow GPU memory monotonically.

### Code quality

- **No linter is wired in.** Add `eslint` with the recommended
  preset + project-specific rules: tab indentation (per user
  rule), no dynamic imports, no `export let`/no exported
  mutable objects (per user rule), max file length 1,500
  lines. Enforce on CI.
- **Mixed CommonJS + ESM.** Server is CJS (`require`), client
  is ESM (`import`). That's fine, but file extensions and the
  `package.json` `"type": "commonjs"` setting mean any future
  shared module needs the `.mjs` or `.cjs` extension trick.
  Document the convention in `docs/architecture.md`.
- **`createPlayerRecord` defaults are leaking.** New fields
  (e.g. `promotionCredits`) keep getting added, requiring
  backfills in `restoreWorldFromSnapshot`. Consider a schema
  versioning field (`world.schemaVersion`) and a migration
  runner so future additions are explicit.

### Testing

- **The `default` Jest project has 21 failing suites.** Most
  are "Cannot find module '../../public/js/game/X'" — files
  that no longer exist. Per the workspace rule we don't want
  to spend hours on test files, but a half-broken `npm test`
  is a sharp edge for new contributors. Either delete the
  stale tests or move them to `tests/legacy/` outside the
  default project.
- **No client-side test coverage.** Server is at 376 green
  tests; the client has no equivalent. Add a small
  [`vitest`](https://vitest.dev/) project for the pure-logic
  client modules (`gameState.js`, `activityLog.js`,
  `unifiedPlayerBar.js` data-shaping bits).
- **No end-to-end / Playwright tests.** A single
  "two AI players, one human, play 60 s without crashing"
  Playwright run would catch a huge class of regressions.

### UX / Gameplay

- **No onboarding for first-time players.** "What does this
  orb do? Why did my pawn disappear?" — both real reactions
  from the recent test session. Add a one-time popover tour
  on first join (or a `?` button that opens an in-game
  cheatsheet).
- **No undo on accidental tetromino rotation.** The user
  reported lag-induced mis-clicks. Add a 500 ms grace where
  a freshly-placed tetromino can be revoked.
- **Activity feed defaults closed.** Surface a small badge
  with a count of new events while it's hidden so players
  notice when something interesting happens.
- **No sound design.** We have a thoroughly visual game with
  zero audio cues. Even minimal: orb spawn ping, line clear
  thunk, capture chime. Single biggest "this feels polished
  now" lever.
- **No spectator nameplates.** Spectator mode shows the board
  but no indicator of which player is which colour. Easy add.

---

## P2 — quality-of-life and future-proofing

Less urgent, but worth scheduling once the P0/P1 backlog is clear.

### Gameplay

- **Piece shop** (already in the user's plans for
  `redeem_promotion`). Mint a small bag of currency on
  capture; lets players buy promotions without waiting for
  kills.
- **Spectator chess-piece tooltips.** Hover a piece, see who
  it belongs to + `forwardDistance` for pawns. Helps new
  players understand the promotion-credit walk.
- **Tutorials / scripted scenarios.** "Sandbox: practice
  promoting a pawn", "Sandbox: claim a power-up orb". Three
  small scripted boards.
- **AI personalities.** All AI is currently
  one-difficulty-fits-all. Easy/Medium/Hard with different
  aggression and orb-prioritisation makes the game more
  approachable.
- **Cosmetic captures.** Currently `capturedStyles` is
  populated but unused. Let captured pieces inherit their
  original owner's colour so the basket badge is *visibly*
  someone else's pieces.
- **Replay system.** The activity log is already a complete
  reconstruction of the game (it has every move). Add an
  export-to-`.json` button and a `/replays/:id` viewer route
  that scrubs through it.

### Multi-shard

- **One world per process.** Fine for hundreds of players,
  not for thousands. When we need to shard, the right cut is
  by `worldId` (already partially wired — the in-code constant
  `GLOBAL_WORLD_ID` would become a real list). Server-side
  changes will be small because the world is already isolated;
  the chunky bit is the matchmaking layer in front.

### Internationalisation

- All strings are hard-coded English in `public/js/*`. If
  international launch is on the cards, extract to a single
  `i18n.js` lookup so translators have a clear surface.

### Accessibility

- **Colour-only player differentiation.** Colourblind players
  can't distinguish red vs green territory. Add a pattern
  overlay (stripes / dots) toggle.
- **No keyboard-only play.** Mouse-only fails any
  accessibility audit. Map the standard tetromino keys
  (arrows + Z/X + space) and a chess-coordinate input mode.
- **`aria-*` attributes on the dialogs.** `showPromotionRedeemDialog`,
  `showBasketDeployDialog`'s replacement — none of them are
  screen-reader-friendly. A `role="dialog"`, `aria-labelledby`,
  and focus-trap pattern would close that.

---

## Audit summary

| Area              | Status | Notes |
|-------------------|--------|-------|
| Game rules        | Mature | Power-ups, ghost sweep, promotion-credit redeem all shipped this sprint |
| Server tests      | Strong | 376/376 passing in `tests/server/` |
| Client tests      | Missing | No coverage |
| Security          | Weak   | No helmet/CORS/rate-limit/structured input validation |
| Persistence       | Fragile | Sync JSON; no backups; no integrity check on boot |
| Observability     | Weak   | console.* logs; no metrics; no error reporting |
| Build/Deploy      | Manual | No Dockerfile; no bundler; CI broken |
| Onboarding        | Missing | No first-time tour |
| Accessibility     | Weak   | Colour-only, mouse-only |

Tackle the P0 list first (security + reliability + observability),
then chip away at P1 / P2 in priority order. Most of the P0
items are sub-hour fixes — the security gap is the most
embarrassingly easy to close.
