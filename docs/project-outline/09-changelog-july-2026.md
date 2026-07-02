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

## 2 July — Battle mode v2: battles are their own world, arrival is a flyover

Owner repro on the v1 build: host clicks **Start battle** and nothing
happens (host stays in the global game, joiner sits on "Waiting…").
Root cause was found in the socket plumbing, and fixing it forced the
bigger design question: battles shouldn't be visible bolt-ons to the
global world at all.

### The bug — battle events never reached the client modules

`socketEventBridge.js` forwards raw socket events to the NetworkManager
event bus through an explicit whitelist (`SIMPLE_FORWARD_EVENTS`) — and
none of the `battle_*` events were on it. Every lobby update, start and
finish emitted by the server died in the bridge. Worse, `battleMode.js`
subscribed via `NetworkManager.onMessage()`, which only fires for
events wrapped in generic `message` envelopes — these never are.
Fixed both ends: `battle_lobby_update` / `battle_started` /
`battle_finished` / `battle_cancelled` / `server_toast` are now
forwarded, and the client subscribes with `NetworkManager.on()`.
A regression test asserts the subscription is on the plain event bus.

### The redesign — "the edge of the game is the edge of the world"

Agreed flow with the owner: arriving at tetches.com no longer joins the
global game. You connect as a spectator over an aerial overview of the
live world, and the welcome modal offers two doors:

- **✦ PLAY NOW** → joins the global world, pieces spawn, and the camera
  makes a sweeping drone flight from the overview down to your king
  (`setupCamera.js#flyToPosition` now scales duration and arc height
  with distance: up to 6.5 s and +70 units for cross-world hops).
- **⚔ BATTLE A FRIEND** → never touches the global world. Straight to
  the battle dialog → lobby → arena. When the battle ends you're
  returned to the overview + welcome modal, not dumped into the world.

What that took:

- `main-enhanced.js#connectForWorldPreview` — connects the socket and
  pulls `get_game_state` for rendering *without* `join_game`; the
  spectator adopts the `gameId` via the new
  `NetworkManager.adoptSpectatorGameId()` so later battle placements
  pass the client-side guards. `initBattleMode` and the tetromino
  socket listeners moved to boot-time `init()` (they only ran after a
  world join, so battle-only players had no piece spawner — the reason
  the joiner never got a tetromino).
- `enhanced-gameCore.js` — new `startBattleSession()` (starts the game
  loop and UI for a seat with no kingdom), `isWorldEntered()` /
  `showWelcomeOverview()` (post-battle return), and the first-frame
  overview reframe once board data lands (`_overviewFramed`).
- **View isolation** (`battle/battleRules.js#isCellVisibleInCurrentView`,
  applied in `boardFunctions/rendering.js` and `updateChessPieces.js`):
  in a battle you render arena cells only — the world does not exist;
  outside a battle the remote battle region (distance ≥1500) is hidden
  from the global view. The chess-piece render hash carries a view tag
  so entering/leaving a battle forces a rebuild.
- `battleMode.js` — `enterBattleFlow()` (welcome-modal entry point,
  connects on demand, claims invite-code seats before opening the
  dialog), `returnToWelcomeIfHomeless()` (battle-only players go back
  to the overview; world players fly home), and a lobby clarity pass:
  numbered steps, live seat list with You/Host badges, bot-fill counts
  on the start button, invite link + code with copy buttons.
- Invite links (`?battle=CODE`) now stash the code and light up the
  welcome modal's battle button instead of auto-joining from under the
  visitor.

### Server: battle-only players must survive the ghost sweep

A battle-only player owns zero world cells, so `ghostPlayerSweep`
would flag them eliminated mid-battle (identity loss on reconnect).
`BattleManager` now stamps real player records with `activeBattleId`
on create/join, clears it on leave/finish/cleanup (including a
stale-stamp sweep in `tick` and boot restore), and the ghost sweep +
`reapImmediately` skip stamped players. Covered by new unit tests.

### Verified

- **623 tests, 57 suites** (12 new: bridge forwarding, dialog/lobby
  DOM, seat adoption without world join, post-battle welcome return,
  ghost-sweep exemption).
- `scripts/e2e-battle-flow.js` extended to replay the exact repro on a
  live server — two battle-only sockets (no `join_game`): create →
  join → start → **both** clients receive `battle_started` → seat
  placements land inside the arena → kings present → forfeit →
  `battle_finished` with the right winner. 48/48 checks green.
- Embedded-browser session had no WebGL (bundle boots clean, flow
  driven by the jsdom suites instead); to re-verify visually on
  production after deploy.

## 2 July — Battle mode v3: bots that play, multi-tab hosts, takeovers + agent gateway (MCP & Gopher)

Owner testing on the v2 deploy surfaced six battle bugs; fixing the
"bot never moves" one uncovered two deeper server faults. Plus the
long-planned agents feature: any MCP-capable agent can now play.

### Battle bug fixes (all owner repros)

- **Bots never moved chess pieces.** Three stacked causes:
  1. *Move selection was hopeless*: `ai/actions.js` picked a random
     piece and a random cell from the WHOLE board as a target — in a
     remote arena (~2,000 cells away) the hit rate was ~0. Rewrote it
     to enumerate legal moves outward from each piece
     (`enumerateMovesForPiece`: knight offsets, bounded slides ≤14,
     pawn pushes/captures), then choose among known-legal moves,
     preferring captures by `aggressiveness`. `ai/runner.js` also
     falls back to the other action type in the same tick when the
     preferred one has no legal move, so chess-less early arenas
     build terrain instead of idling.
  2. *Arena slots were reused while a finished battle lingered*:
     `allocateSlot` skipped `finished` battles, so the next battle
     built at the SAME centre while the old ring/pieces still stood —
     stale enemy pieces inside fresh arenas, and the old battle's
     delayed cleanup stripping the new one's cells ("0 ring cells
     removed" in the log was this). Slots now stay owned until
     cleanup deletes the battle from the registry. Unit test walks
     the full linger → reuse cycle.
  3. *First-visit sockets never joined the world broadcast room*:
     brand-new identities only entered the Socket.IO room on
     `join_game`/`get_game_state`, so a battle-only guest received no
     `game_update` at all — bot moves happened server-side but were
     invisible. Every socket now joins the room at connection time.
- **Host deaf to lobby joins / host stuck in global game on start.**
  `Sessions` kept ONE socket per player, so a host with a second tab
  had all targeted emits routed to the newest tab. Sessions now track
  a Set of sockets per player (`socketsForPlayer`,
  `emitToPlayerSockets`); battle emits, `broadcasts.emitToPlayer` and
  king-duel notifications go to every tab; `handleDisconnect` only
  arms the grace timer when the LAST socket closes. The lobby dialog
  also polls `battle_state` every 4 s as a missed-event safety net.
- **URL now carries the battle** — `?battle=CODE` while seated (lobby
  or fight), restored to `?gameId=global_game` after
  (`syncBattleUrl`). Links are shareable mid-battle.
- **Joining an ACTIVE battle takes over a bot seat** —
  `BattleManager.takeOverBotSeat`: seat flips to human control, AI
  ticker stops, joiner gets `battle_started`, everyone else a toast;
  polite refusal when all seats are human. Clients adopt the seat
  straight from the join ack.
- **Invite links default to the battle** — welcome modal reorders so
  ⚔ JOIN BATTLE is primary (and Enter triggers it) when `?battle=` is
  present; PLAY NOW stays secondary.
- **Second tab no longer silently rejoins** — reconnection auto-adopt
  is skipped when the URL carries a DIFFERENT battle's code while the
  welcome modal is up; mid-fight invites to another battle get a
  "forfeit first" toast instead of a hijack.

### Agent gateway — MCP server + Gopher discovery

The original goal "people can play with their own agents", done:

- `server/mcp/mcpServer.js` (new) — MCP Streamable HTTP endpoint at
  `/mcp` (`@modelcontextprotocol/sdk`). Each MCP session lazily
  registers an external-AI identity and bridges tool calls over a
  loopback Socket.IO connection, so agents go through the exact same
  validated contract as browsers — no parallel rules. Tools:
  `how_to_play`, `join_world`, `get_state` (compact king-centred
  view), `place_tetromino`, `move_piece`, `create_battle`,
  `join_battle`, `start_battle`, `battle_state`, `leave_battle`.
  Sessions idle out after 30 min. Port resolved live via
  `app.locals.getSelfPort` (`bootstrap.js`) so test servers on port 0
  work.
- `server/discovery/agentGopher.js` (new) — Gopher-over-HTTPS
  discovery per the seneschal.space convention:
  `/.well-known/agent.gopher` root menu + `play` submenu +
  `about/agents/mcp/socket/battle` text leaves, served as
  `application/gopher` with open CORS, nosniff and 10-min cache.
  Mounted before the restrictive CORS middleware in `app.js`.
- `docs/mcp-agents.md` (new) — connection config, tool table, session
  behaviour, discovery notes.
- Public companion repo **github.com/Rotwang9000/tetches-agents** —
  README (MCP quick start, tool table, Socket API summary), the two
  worked examples (`random-bot.js`, `spectator-feed.js`), and
  `directory/server.json` in the official MCP-registry manifest shape
  for directory submissions.
- `routes/api.js` — bot registration logic extracted as
  `registerExternalComputerPlayer()` for the MCP bridge to reuse.

### Verified

- **642 tests, 59 suites** (new: `battleBotMoves.test.js` — fresh
  arena has no legal chess move but placement works, terrain unlocks
  a first-try move, captures preferred; `agentDiscovery.test.js` —
  headers, RFC 1436 dot-termination, every internal selector
  resolves; slot-linger test; multi-tab Sessions tests; dialog tests
  for URL sync, resume, refusal and bot-takeover adoption).
- `scripts/e2e-battle-flow.js` grew Scenario C (multi-tab host hears
  lobby joins + start on BOTH sockets; latecomer takes over the bot
  seat mid-fight; second latecomer politely refused): **63/63 green**.
- `scripts/e2e-mcp.js` (new) drives the real `/mcp` endpoint as an
  MCP client: initialise → tools → join → state → placement → battle
  round-trip: **22/22 green**.
- 45 s live-bot watch on an isolated server: bot made 2 placements +
  6 chess moves (was 0 before the fixes).
