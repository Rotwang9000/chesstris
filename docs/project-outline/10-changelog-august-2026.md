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
