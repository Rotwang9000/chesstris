# Changelog — August 2026

## 4 August — Expert AI actually hunts

Live Expert had **0 captures** for weeks while farming ~100 pawns from
power-up orbs. Root cause: `buildSpeed` 0.8 + attack detection only at
Chebyshev ≤1, with placement anchored to own cells and quiet chess moves
picked at random — so a hard bot never closed a 50+ cell gap to humans.

### Engine retune (`server/ai/strategy.js`)
- Expert: `buildSpeed` 0.8 → **0.4**, `explorationRate` **0.85**, new
  `huntRadius` **10** (Easy 3 / Medium 6).
- `hasAttackOpportunity` uses `huntRadius` (not adjacency-only).
- `hasEnemyInTheatre` / `nearestEnemyFocus` drive bridging when kingdoms
  are distant but still reachable.

### Behaviour (`actions.js`, `runner.js`)
- Tetromino placement biases anchors + offsets toward the nearest enemy
  king using `explorationRate`.
- Quiet chess moves ranked by closing Manhattan distance to that focus.
- Theatre branch: when an enemy is in range, prefer build/advance over
  local farming.
- AI captures of ROOK/KNIGHT/BISHOP/QUEEN now push `capturedBasket`
  (parity with human `chess_move`) so the player bar count updates.
- `ensureRoster` refreshes persisted AI strategies on every boot so live
  Expert picks up the new numbers after deploy.

Tests: `tests/server/aiStrategy.test.js` (profile, hunt radius, basket).

## 4 August — Player bar activity + AI army soft-cap

* **`(0)` next to names was unused score.** Scoring was never wired
  server-side, so every row showed `0`. Replaced with an **activity
  age** (`now` / `5m` / `2h` / `3d`, colour-coded) from `lastActionAt`.
  AI rows show `AI`. Empty ghost identities (0 pieces — other tabs /
  abandoned cookies) are hidden from the roster.
* **AI Expert had 96 pawns.** Legitimate power-up vacuum over weeks —
  orbs are 65% pawns and AI claimed without a ceiling. Soft-cap AI
  claims at **16 pawns / 32 total pieces**; boot `ensureRoster` trims
  existing bloated armies down to those caps.

## 5 August — Tablet render jitter + a check you couldn't answer

Two field reports from a tablet session: cells "vibrate" whenever the
view is spun, and a player put in check "couldn't do anything about it"
— it was still tetris-drop mode, and the king looked pre-selected.

### Vibrating cells (`rendererManager.js`, camera near plane)
- **Shader precision was the bug.** The renderer asked for
  `precision: 'mediump'` (normal) / `'lowp'` (cute). Desktop GPUs
  silently execute those at full precision, so it cost nothing there —
  but on tablet/phone GPUs mediump is a real 16-bit half float, and
  three r132 injects the qualifier into the **vertex** shader as well.
  With home zones ~100 cells out and battle arenas thousands out, the
  position quantum grows to a visible fraction of a cell, and every
  camera move re-rounds each vertex to a different quantum → geometry
  buzzing many times a second. Now `highp` on every profile (guaranteed
  in vertex shaders everywhere; three downgrades fragment precision
  automatically if a device can't manage it). Cute keeps its savings
  through pixel ratio / AA / shadows, none of which touch precision.
- Camera near plane 0.1 → **1.0** (orbit `minDistance` is 8, so nothing
  is clipped). Depth precision is dominated by the near plane, and
  16-bit mobile depth buffers were putting the sea (y = −0.50) and the
  per-cell foam discs (y = −0.45) in the same depth bucket — z-fighting
  that shimmers as the camera orbits.

### Check: the defender can now actually move (`checkAlert.js`)
The check gives the defender ONE move to save their king, but turn phase
is *client* state and a check nearly always lands mid-drop. In the
tetris phase `selectChessPiece` and `performRaycast` both bail, so the
defender could only watch the countdown expire. The server has no notion
of turn phase and accepts the escape whenever it arrives, so:
- becoming the defender now opens the chess phase for the duration of
  the check (their tetromino was already frozen by `pendingCheck`), with
  a toast explaining it; the previous phase is restored on resolution,
  and a successful escape's own phase advance is left alone.
- any selection carried in from an earlier turn is cleared first, so
  nothing looks "already selected" and swallows the taps meant for the
  king.

### Dangling selections (`chessInteraction.js`, `inputManager.js`)
The "my king appeared to be preselected" half of the report:
- `disposeChessPieceMesh` now drops the selection if it's disposing the
  selected mesh. A selection pointing at a mesh that has left the scene
  graph can never be clicked, yet still counts as "a piece is selected"
  everywhere else — an unbreakable wedge.
- New `clearStaleChessSelection()` sweeps a selection whose mesh is
  detached or whose piece the server no longer knows about; runs from
  the click path and from `handleTouchStart` (touch never reaches the
  document click handler, since the touchstart `preventDefault`
  suppresses the synthesised click).
- Tapping the selected piece outside the chess phase now deselects it.
  Touch devices have no Escape key, so "press Escape to deselect" was a
  dead end on a tablet; the toast now names both routes.

Tests: `tests/core/checkAlert.test.js` (6 cases — force, restore, no-op
for attacker, no double-force when already in chess).
