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
