# 08 Changelog June 2026

> Part of the [Tetches project outline](README.md). June 2026: first
> live-traffic learnings — fixing the bugs and friction that real
> visitors actually hit.

### Production sweep after first week live (12 Jun 2026)

Reviewed the first ~9 days of production traffic (8 days uptime, 0
restarts, clean error log). Reality check: three "human" players in the
world were really one visitor — one was the operator, one was the
deploy-verification browser. The genuine visitor placed a single
tetromino, **detonated their own pawn, and left within three minutes** —
which pointed straight at the two onboarding killers fixed below.

#### Fixed: "Click to start tetris turn" did nothing (the stranded-in-chess bug)

The single worst live bug. `inputManager.js` registers a capture-phase
`click` listener on `document` that, during the **chess** phase, calls
`stopPropagation()` for any click inside the canvas that isn't on a
recognised UI element. The guard only recognised
`button, input, select, a, …` — but the next-piece HUD widget
(`tetromino/nextPiece.js`) is a `div` with `role="button"`, so its
advertised "Click to start tetris turn" affordance was **silently
swallowed**. After your first placement you were stranded in the chess
phase with a dead button; the only obvious escapes were moving a chess
piece (if you understood how) or the pawn-detonate button — exactly
what our one real visitor did before quitting.

- `public/js/inputManager.js` — the UI-element guard now includes
  `[role="button"]`, so ARIA-button HUD widgets receive their clicks.
  (Capture-phase `stopPropagation()` on `document` suppresses listeners
  on the *target itself*, which is why even a probe listener attached
  directly to the widget never fired.)
- Verified end-to-end on an isolated server: place piece → chess phase
  → click next-piece widget → label flips to "tetris turn active" and a
  fresh tetromino spawns.

#### New: traffic-light landing guide (ghost legality)

A new player's first drop usually missed their territory: the piece
dissolved into sand client-side (never even reaching the server — which
is why the logs showed nothing), a small toast flashed past, and the
lesson "pieces must touch your territory" was never taught. The ghost
outline under the falling piece now answers *"will this stick?"* before
the player commits:

- `public/js/tetromino/rendering.js` — `renderGhostPiece()` runs
  `validatePlacementLocally()` (collision + adjacency + path-to-king,
  the same mirror of server rules used at submit time) on every
  re-render (i.e. after each move/rotate) and colours the ghost
  **green** (`0x00dd66`, will place) or **red** (`0xff3344`, will
  dissolve). On a validation error it stays optimistic and lets the
  server decide.
- `public/js/tetromino/movementQueue.js`, `public/js/tetromino/
  network.js` — the dissolve toasts now teach the rule and point at the
  guide: "Missed connection — pieces must land touching your territory.
  Watch the outline: green sticks, red dissolves."
- `public/js/createLoadingIndicator.js` — the welcome modal's How to
  Play list gains a "Landing guide" line (green will stick / red will
  dissolve).
- Verified live on an isolated server: ghost reads `#00dd66` at the
  valid spawn, flips to `#ff3344` three cells off-territory, and back.

#### Fixed: spacebar tolerance

`handleKeyDown` matched the hard drop on `event.key === ' '` only.
Real keyboards emit `' '`, but some automation tools and legacy
browsers emit `'Space'` / `'Spacebar'`. New `isSpaceKey()` helper
accepts all three plus `event.code === 'Space'` (used for both hard
drop and the chess-phase "start tetris turn" shortcut).

#### Fixed: `npm ci` failed on every deploy (stale lockfile)

`package-lock.json` still pinned `@sendgrid/mail` at the root after the
dependency was removed from `package.json`, so `npm ci` refused to run
("lock and manifest out of sync") and `scripts/deploy.sh` silently fell
back to the slower, lock-mutating `npm install`. Regenerated the lock
(`npm install --package-lock-only`); `npm ci --omit=dev` now succeeds.

#### Ops: log rotation + line-clear log spam

- `out.log` had grown to **105 MB in 8 days** with no rotation.
  Installed **pm2-logrotate** on the production host: `max_size 10M`,
  `retain 14`, `compress true`, daily rotate at 03:00. (Host-level PM2
  module — not in the repo; reinstall with `pm2 install pm2-logrotate`
  if the daemon is ever rebuilt.)
- `server/game/BoardManager.js` — dropped the "Found clearable …-line"
  detect log. The cascade re-scans after every clear+gravity iteration,
  so it fired 2-3× per actual clear and was the single largest log
  source (~54k lines in 8 days). The downstream "Cleared …-line" log
  still records every real clear.

#### Trimmed: Auth0 CDN script no longer loaded

`public/index.html` no longer pulls `auth0-spa-js` from the CDN on
every visit — the passwordless-email flow is feature-flagged off and
the kingdom-key login needs no third party. The tag (with restore
instructions) stays in a comment next to the socket.io include for when
email sign-in is revisited.

**Still on the list:**

- Nobody has created an account yet — consider surfacing the login
  affordance in the welcome modal as well as the player bar.
- Replay system: export activity log + viewer route.
- `docs/project-outline/07-changelog-may-2026-c.md` hit ~2,100 lines;
  June entries continue here.
