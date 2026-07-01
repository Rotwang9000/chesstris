# Changelog — July 2026

## 1 July — First-screen simplification, visitor funnel, save nudge

Follow-up to the June onboarding pass. Confirmed the only "player" so far
was the owner on a second device, so this round focuses on making the
first screen friendlier and on actually measuring drop-off.

### Visitor funnel (new)

Previously we had no way to tell how many people loaded the page and
left without playing. Now we do — with zero PII (no IPs, no UAs stored):

- `server/observability/funnel.js` — persisted counters in
  `data/funnel.json` (honours `TETCHES_DATA_DIR`), lifetime totals +
  per-day buckets (60-day retention, 5 s write throttle):
  - `pageViews` — index/`/2d` serves, obvious crawlers filtered by UA
  - `newVisitors` — fresh player identities minted on socket connect
  - `worldJoins` — first-ever world entry (home zone created), humans only
  - `firstPlacements` — first-ever successful tetromino placement
- Wire-ins: `server/app.js` (page views + `GET /api/admin/funnel`,
  admin-token/loopback gated, `?days=N`), `sockets/connection.js`
  (new visitor), `sockets/join.js` (first join), `sockets/tetromino.js`
  (first placement).
- Tests: `tests/server/funnel.test.js` (stages, bot filter, persistence,
  corrupt-file recovery, snapshot windowing).

Reading it: `curl -H "x-admin-token: $ADMIN_TOKEN" https://tetches.com/api/admin/funnel`
— the gap between `pageViews` and `firstPlacements` is the drop-off.

### Welcome modal: one picture, one line, one button

`createLoadingIndicator.js#showTutorialMessage` rebuilt:

- New 8-bit hero banner (`public/img/welcome-hero.png`, 52 KB PNG8,
  generated pixel art: knight + king + falling tetrominoes) replaces the
  text header.
- "How to play" now sits behind a toggle button, collapsed by default —
  rules, landing-guide colours, touch controls, tip and terminology all
  live inside it.
- Primary button relabelled **✦ PLAY NOW** with "no sign-up needed"
  caption, so entering clearly requires no account.
- Below it, one quiet line: "Optional: log in to keep your kingdom on any
  device" (opens the kingdom-key dialog; shows "✓ Logged in as …" when
  already signed in).

### Save-your-kingdom reminder (guests only)

`public/js/auth/saveReminder.js` (new) + `tests/ui/saveReminder.test.js`:

- Armed by the first successful placement of the session
  (`tetromino/network.js` calls `markKingdomProgress()`).
- Guest closes the tab → native "leave site?" dialog. If they stay,
  we open the login dialog (browsers never reveal the dialog outcome, so
  "page still alive 1.5 s later" is the stay signal — timers die with the
  page on a real leave).
- 15-minute snooze so dismissing it doesn't nag; logged-in players and
  players with no progress are never blocked.

### HUD tidy

- Network pill: single writer (`updateNetworkStatus`), moved below the
  TETCHES title (was overlapping it), turned into a rounded pill, and
  now hides itself while connected ("Connected ✓" flashes 2.5 s). The 5 s
  fallback poll no longer re-writes the DOM every tick, and
  "disconnected" is only reported after a connection actually existed.
- Bottom-left strip (`index.html`): buttons share one CSS rule (inline
  styles dropped), laid out with flex + gap. On ≤700 px screens the
  "Copy your Player Code" line and the Advertise link hide (both live
  elsewhere: player bar and desktop).
- Player bar: the on-load auto-open now only happens on ≥900 px screens
  (`WIDE_SCREEN_MIN_PX`); on phones it starts collapsed behind its pull
  tab instead of fighting the welcome modal.

### Verified

- 481 server tests + new funnel/saveReminder suites pass; client bundle
  builds clean.
- Local isolated server (`TETCHES_DATA_DIR`, port 3667): funnel counted
  page view → new visitor → world join; hero modal, How-to-play toggle
  and optional-login link exercised in the embedded browser (WebGL was
  unavailable in that browser session, so the modal was driven directly;
  full in-game flow re-verified on production after deploy).

### Next up (design agreed with owner)

**Battle mode** — 2–4 players, separate small arenas: home cells a fixed
distance apart (8 cells), play zone bounded by a shared-ownership ring
(diameter 32) that anyone may build on; its curvature naturally blocks
long straight-line travel. Opponents: computer or friends via invite
link/code. Needs multi-world support server-side — design doc first.

## 1 July — Battle mode v1 (private 2–4 player arenas)

Design in `docs/battle-mode-design.md` (assessed multi-world refactor vs
remote regions; shipped the latter — arenas are circles of cells parked
at `(2000, 2000)`+ inside the one shared world, so broadcast,
persistence, chess rules, line clears and the AI all keep working
unchanged).

### Server

- `server/battle/geometry.js` (new) — pure geometry: arena slots on a
  64-cell pitch from `(2000, 2000)` (8 columns, 64 slots), ring as a
  2-cell-thick annulus (radial bands 15–16 of a diameter-32 circle;
  2-thick keeps it orthogonally connected for the N/S/E/W BFS rules),
  play area = bands ≤14, keep-out ≤18, and seat home zones (N/S/W/E,
  8×2 facing the centre; 2-seat battles have pawn rows exactly 8 apart,
  3–4 seats sit 1 cell further out so zones can't collide).
- `server/battle/rules.js` (new) — `ringItemUsableBy` (ring counts as
  friendly ground only for seats of that battle) and
  `validateArenaBounds` (seats must build inside their arena —
  `outside_arena`; everyone else is kept out of live arenas —
  `arena_reserved`).
- `server/battle/BattleManager.js` (new) — lifecycle: create (host takes
  seat 0, 6-char shareable code via `generateGameKey`), join by code,
  start (host-only; empty seats filled with MEDIUM bots; builds ring +
  seat zones + pieces), leave (lobby: free the seat / host cancels;
  active: forfeit → seat eliminated), 5 s sweep (elimination → finished
  + winner toast, lobby timeout 15 min, active cap 2 h, finished linger
  60 s → full cleanup: seats removed, ring stripped, slot freed), orphan
  GC, and boot-time restore (re-arms bot tickers + socket aliases from
  the snapshot).
- **Seat identity**: each participant plays a dedicated seat record
  (`battle-<code>-s<n>`, carries `battleId`/`controlledBy`) so the
  human's main kingdom is untouched mid-battle. The socket stays bound
  to the real id; handlers resolve `ctx.resolveActingPlayerId()` at
  event time (`sockets/tetromino.js`, `sockets/chess.js`), and
  `Sessions.js` gained seat→human aliases so seat-scoped emits
  (`new_tetromino`, duels…) reach the controlling browser.
- `server/sockets/battle.js` (new) — `battle_create/join/start/leave/
  state`, all acting on the socket's real id.
- **Ring cell semantics** (`game/cells.js`): `battleRing` items are
  ownerless, never clearable, never line-clear targets, block line
  clears (near the circle's poles 8+ ring cells are collinear — without
  blocker status the first cascade would delete the wall), anchor
  nothing for gravity, and survive `transferOwnership`/`stripClearable`.
- **Line-clear scan rewrite** (`game/BoardManager.js#_findClearableLines`):
  was O(bounding-box) per axis — a remote arena makes the box ~2000²
  so every cascade probed millions of empty keys. Now buckets occupied
  cells by scan axis and walks sorted runs (O(N log N) in occupied
  cells); `_clearLine` iterates the computed runs. Same results on the
  existing suite.
- **Sweep exemptions** for `player.battleId`: world gravity (both the
  centroid and per-player drift), home-zone degradation, ghost-player
  sweep, board-generator anchor collection, `GameUtilities`
  `livingZoneCount`, AI respawn/self-detonation/roster-trim
  (`ai/runner.js`) — battle seats live and die only by battle rules.
  `bootstrap.js`'s `getWorldCentre`/`getOccupiedCells` (boat steering)
  also ignore the battle region (distance ≥1500 from origin).
- Persistence: `world.battles` registry + seat fields survive snapshots
  (`world/World.js`, `persistence.js`).

### Client

- `public/js/battle/battleMode.js` (new) — ⚔ Battle dialog (create with
  seat count, join by code, lobby with seat list + copy-invite-link,
  start/leave/forfeit), socket listeners, and seat adoption: on
  `battle_started` the module saves the real id and swaps
  `localPlayerId`/`myPlayerId`/`currentPlayer` to the seat id, flies the
  camera to the seat's king (retrying while the arena board data lands),
  and reverses all of it on `battle_finished`/`battle_cancelled`.
  Handles `?battle=CODE` invite links (auto-join + dialog) and re-adopts
  the seat after a mid-battle reconnect via `battle_state`.
- `public/js/battle/battleRules.js` (new) — client mirror of the arena
  rules for instant local feedback.
- Wire-ins: `main-enhanced.js` (init after join), `index.html`
  (⚔ Battle button in the bottom-left strip), welcome modal gains
  "⚔ BATTLE A FRIEND" under PLAY NOW (enters the world, then opens the
  dialog).
- `tetromino/validation.js` + `tetromino/pathViz.js` — local ghost
  validation and the king-path BFS now accept the own-battle ring as
  friendly ground and reject placements outside the arena, matching the
  server.
- `setupCamera.js#setCameraToOverview` — frames only the region the
  player is in (their arena when battling, the organic world otherwise)
  so a distant arena can't zoom the overview into orbit.

### Verified

- `tests/server/battleMode.test.js` (new, 16 tests): band tiling has no
  dead cells, ring is one orthogonally-connected loop, 2-seat pawn rows
  exactly 8 apart, 4-seat zones disjoint + inside the play area, rule
  hooks, and the full manager lifecycle (create/join/start/bots/forfeit/
  winner/cleanup/lobby-timeout). Full suite: **589 tests, 54 suites**.
- Live E2E on an isolated server (3 sockets): create → join → lobby
  update → host-only start → placement as the SEAT id inside the arena →
  `outside_arena` + civilian `arena_reserved` rejections → forfeit →
  `battle_finished` with the right winner. Bot battle: bot placed its
  first tetromino inside the arena within seconds. Restart mid-battle:
  registry + seats persisted, battle restored, bot resumed building
  (24 cells after restart), 196 ring cells intact; cleanup after a
  finish removed all of them.

**Not in v1** (candidates for the next pass): auto-start when the last
seat fills, battle-scoped duel/power-up tuning, spectator flyover of
live arenas, per-battle scoreboard in the player bar.
