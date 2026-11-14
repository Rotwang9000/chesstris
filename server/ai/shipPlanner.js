/**
 * Viking longships — how a bot captains its ships.
 *
 * Bots sail through the same `ships.sail` the `ship_sail` handler uses;
 * this module only decides WHERE. Three plans, in priority order (spec
 * §3, "Bots"):
 *
 *   1. flee  — the ship's square sinks soon, or its way out to safer
 *              water is about to be cut: head for the reachable water
 *              the sea takes LAST (empty or laden; a ship is the best
 *              lifeboat a bot has).
 *   2. raid  — a passenger aboard: if it can capture from where it is
 *              moored, stay and let it land; otherwise search the water
 *              the ship can reach (bounded BFS over sail legs) for a
 *              moored square that maximises what the passenger could
 *              capture on landing, minus what it risks while it sits
 *              there; sail one leg.
 *   3. home  — an empty ship adrift: sail back alongside our own land so
 *              a knight or rook can step aboard again.
 *
 * Boarding itself is a chess move, so it is scored in actions.js
 * (`boardingChance`, `shipMoveBonus`); seizing an enemy ship and
 * capturing a passenger come through normal move enumeration.
 *
 * Every plan is one leg: the ship then rows for 3 s, and the bot's next
 * tick (5–15 s later) replans from wherever it has got to. Nothing here
 * mutates the world; the only thing written is the caller's voyage
 * memory (`opts.memory`, kept on `battle.fleet.voyages`).
 *
 * Why a voyage memory: destination scores depend on where every ship is
 * right now, so a planner with no memory of where it was heading would
 * sail a leg and sail it straight back on the next tick — and two bots'
 * ships that block each other's routes did exactly that in lockstep for
 * minutes. The memory keeps a raid heading for its chosen square while
 * that square stays nearly as good, lands on arrival, and never undoes
 * the previous leg on the very next plan.
 *
 * Why sea-safe stops: in a Quick battle every square the ship would
 * STOP on — not only the destination — must still be afloat when the
 * bot next ticks, or the passenger drowns mid-voyage.
 *
 * Cost: one plan reads the same squares many times, so every plan runs
 * on a `waterGrid` — a memo of "is this open water / when does it sink"
 * shared by every search of the tick (and by the sea triage).
 */

'use strict';

const rules = require('../battle/shipRules');
const ships = require('../battle/ships');
const { hasSea, sinkAtMs } = require('../battle/sea');

/** The usual chess values; kings are never raid targets (rule 6). */
const PIECE_VALUE = Object.freeze({ QUEEN: 9, ROOK: 5, BISHOP: 3, KNIGHT: 3, PAWN: 1, KING: 0 });

/** Spec: the BFS over sail legs stops after this many squares. */
const MAX_VOYAGE_STATES = 1100;
/** Spec: a ship whose square sinks within this long flees. */
const FLEE_HORIZON_MS = 10 * 1000;
/** Spec: bots leave an empty ship in harbour this long before boarding it. */
const BOARDING_DELAY_MS = 60 * 1000;
/** Chance per chess tick that a bot puts a knight or rook aboard. */
const BOARDING_CHANCE = Object.freeze({ easy: 0.15, medium: 0.3, hard: 0.5 });
/** A raid leg must beat staying put by at least this much. */
const RAID_MIN_GAIN = 0.5;
/** Tie-breaker pull toward the nearest enemy king, per square. */
const KING_PULL = 0.05;
/**
 * A ship flees early when, by the bot's next tick, the best water it
 * could still reach would sink this much sooner than the best it can
 * reach now — its way out is about to be cut.
 */
const ESCAPE_CLOSING_MARGIN_MS = 20 * 1000;
/** ...but only looks (two voyage searches) once its own square sinks within this many horizons. */
const ESCAPE_WATCH_HORIZONS = 8;
/** A leg just sailed may not be sailed straight back within this long. */
const REVERSAL_GUARD_MS = 30 * 1000;
/** The orthogonal steps a ship sails along (mirrors shipRules.sailTargets). */
const ORTHOGONAL = Object.freeze([[1, 0], [-1, 0], [0, 1], [0, -1]]);

const keyOf = (x, z) => `${x},${z}`;
const typeOf = piece => String((piece && piece.type) || '').toUpperCase();
const valueOf = piece => PIECE_VALUE[typeOf(piece)] || 0;
const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z);

/**
 * The sea horizon a bot plans against: it must still be afloat on its
 * NEXT tick, so the spec's 10 s stretches for slow (Novice) bots.
 */
function fleeHorizonMs(moveIntervalMs) {
	return Math.max(FLEE_HORIZON_MS, (Number(moveIntervalMs) || 10000) * 1.25 + 1000);
}

/** Boarding chance for a bot of this difficulty (unknown → medium). */
function boardingChance(difficulty) {
	return BOARDING_CHANCE[difficulty] != null ? BOARDING_CHANCE[difficulty] : BOARDING_CHANCE.medium;
}

/**
 * A memo over one board state at one instant: is (x, z) open water, and
 * when does it sink? A voyage search reads each square up to twenty
 * times (every leg that could cross it), and each `rules.isWater` call
 * walks the play-area maths, the sea spiral and the piece index — so a
 * plan without the memo cost several ms on the shared event loop.
 *
 * Valid only while the board is unchanged: build a fresh one after a
 * sail (`maybeSail` does).
 *
 * @param {Object} env  `ships.boardEnv(...)` for this battle and instant.
 * @param {Object|null} battle  For sink times (null: nothing sinks).
 */
function waterGrid(env, battle = null) {
	const water = new Map();
	const sinks = new Map();
	const seaOn = !!battle && hasSea(battle);
	return {
		env,
		getCell: env.getCell,
		isWaterAt(x, z) {
			const key = keyOf(x, z);
			let v = water.get(key);
			if (v === undefined) { v = rules.isWater(env, x, z); water.set(key, v); }
			return v;
		},
		sinkAt(x, z) {
			if (!seaOn) return Infinity;
			const key = keyOf(x, z);
			let v = sinks.get(key);
			if (v === undefined) { v = sinkAtMs(battle, x, z); sinks.set(key, v); }
			return v;
		},
	};
}

/** A grid for this battle at `now` (or `env` reused when it already is one). */
function gridFor(world, battle, now, grid = null) {
	return grid || waterGrid(ships.boardEnv(world, battle, now), battle);
}

/** Accept either a grid or a bare board env (older callers and tests). */
function asGrid(envOrGrid) {
	return envOrGrid && typeof envOrGrid.isWaterAt === 'function' ? envOrGrid : waterGrid(envOrGrid);
}

/**
 * One leg's targets from `from` — `rules.sailTargets` exactly, read
 * through the grid's memo. With `departs`, water the sea has taken by
 * then is gone (it blocks the slide, as a sunk square does).
 */
function legsFrom(grid, from, departs = null) {
	const out = [];
	for (const [dx, dz] of ORTHOGONAL) {
		for (let step = 1; step <= rules.SHIP.SAIL_MAX; step++) {
			const x = from.x + dx * step;
			const z = from.z + dz * step;
			if (!grid.isWaterAt(x, z)) break;
			if (departs != null && grid.sinkAt(x, z) <= departs) break;
			out.push({ x, z });
		}
	}
	return out;
}

/**
 * The sea timing a bot's voyage runs to (Quick battles), or null (no
 * sea). A bot sails at most one leg per tick, so leg k departs
 * `(k - 1) * legMs` after `departAt`, and the ship must then sit where
 * it stopped until its next tick — `settleMs` (the flee horizon) after
 * it set off.
 */
function voyageTiming(battle, departAt, moveIntervalMs) {
	if (!hasSea(battle)) return null;
	return {
		departAt,
		legMs: Number(moveIntervalMs) || 10000,
		settleMs: fleeHorizonMs(moveIntervalMs),
	};
}

/**
 * Every square a ship at `start` can reach in any number of legs,
 * breadth first (so `legs` is the fewest legs), each tagged with the
 * FIRST leg of a shortest route there. `start` itself comes first with
 * `legs: 0`. The board is read as it is now: the ship's own square
 * stays occupied, which only ever forbids sailing back over it.
 *
 * `timing` (optional, see `voyageTiming`) makes the search sea-aware
 * leg by leg: a leg may only cross water still there when it sets off,
 * and may only STOP where the ship will still be afloat at the bot's
 * next tick. Squares that fail the stop test may be slid across but are
 * neither returned nor sailed on from. That is how a Quick-battle plan
 * refuses to stop, even for one leg, on water the sea takes first —
 * and how a flight sees that a route out needs several ticks.
 *
 * `canStop(x, z)` (optional) is a further, untimed stop filter.
 *
 * @param {Object} envOrGrid  A `waterGrid`, or a bare board env.
 * @returns {Array<{x:number, z:number, legs:number, first:{x:number,z:number}|null}>}
 */
function reachableWater(envOrGrid, start, maxStates = MAX_VOYAGE_STATES, { canStop = null, timing = null } = {}) {
	const grid = asGrid(envOrGrid);
	const out = [{ x: start.x, z: start.z, legs: 0, first: null }];
	const seen = new Set([keyOf(start.x, start.z)]);
	for (let i = 0; i < out.length && seen.size < maxStates; i++) {
		const cur = out[i];
		const departs = timing ? timing.departAt + cur.legs * timing.legMs : null;
		for (const t of legsFrom(grid, cur, departs)) {
			const key = keyOf(t.x, t.z);
			if (seen.has(key)) continue;
			// Arriving later only ever makes a stop worse, so a square
			// that can't be stopped on now never can on this search.
			seen.add(key);
			if (timing && grid.sinkAt(t.x, t.z) <= departs + timing.settleMs) continue;
			if (canStop && !canStop(t.x, t.z)) continue;
			out.push({ x: t.x, z: t.z, legs: cur.legs + 1, first: cur.first || { x: t.x, z: t.z } });
			if (seen.size >= maxStates) break;
		}
	}
	return out;
}

/**
 * When does a ship at (x, z) stop having a way out? The earliest sink
 * time among its orthogonal neighbours that are open water now (a ship
 * only sails orthogonally, so those are its exits). The spiral sea
 * usually takes the water around a moored ship before the ship's own
 * square, boxing it in; Infinity when it has no open exit to lose.
 */
function exitsCloseAt(grid, x, z) {
	let earliest = Infinity;
	for (const [dx, dz] of ORTHOGONAL) {
		if (!grid.isWaterAt(x + dx, z + dz)) continue;
		earliest = Math.min(earliest, grid.sinkAt(x + dx, z + dz));
	}
	return earliest;
}

/** Until when is (x, z) a safe place to stop: afloat AND not boxed in? */
function stopSafeUntil(grid, x, z) {
	return Math.min(grid.sinkAt(x, z), exitsCloseAt(grid, x, z));
}

/** Where every chess piece stands, keyed "x,z". */
function pieceIndex(world) {
	const byKey = new Map();
	for (const p of world.chessPieces || []) {
		if (p && p.position) byKey.set(keyOf(p.position.x, p.position.z), p);
	}
	return byKey;
}

/**
 * Could a piece of `type` standing at `from` move to `to` by geometry,
 * with slides crossing only real land (never water, never a ship) and
 * no piece in between? This is the subset of `isValidChessMove` that
 * matters for pieces that may board (knight, bishop, rook, queen); the
 * ship veto and target checks are the callers' business.
 */
function reaches(type, from, to, getCell, pieces) {
	const dx = to.x - from.x;
	const dz = to.z - from.z;
	const ax = Math.abs(dx);
	const az = Math.abs(dz);
	if (ax === 0 && az === 0) return false;
	if (type === 'KNIGHT') return (ax === 1 && az === 2) || (ax === 2 && az === 1);
	const straight = ax === 0 || az === 0;
	const diagonal = ax === az;
	if (type === 'ROOK' && !straight) return false;
	if (type === 'BISHOP' && !diagonal) return false;
	if (type === 'QUEEN' && !straight && !diagonal) return false;
	if (type !== 'ROOK' && type !== 'BISHOP' && type !== 'QUEEN') return false;
	const sx = Math.sign(dx);
	const sz = Math.sign(dz);
	for (let x = from.x + sx, z = from.z + sz; x !== to.x || z !== to.z; x += sx, z += sz) {
		if (!rules.isLandCell(getCell(x, z))) return false;
		if (pieces.has(keyOf(x, z))) return false;
	}
	return true;
}

/** Is this piece aboard a ship right now? */
function isAboard(getCell, piece) {
	return !!(piece && piece.position && rules.cellHasShip(getCell(piece.position.x, piece.position.z)));
}

/**
 * Score a moored square for a passenger about to land from it:
 * the best enemy piece it could take on landing (never a king, never a
 * passenger — ship to ship is forbidden), minus its own value if an
 * enemy could board and take it there, with a gentle pull toward the
 * nearest enemy king so an empty sea still steers the ship somewhere
 * useful.
 */
function scoreLandingSquare(ctx, square) {
	const { enemyKing } = ctx;
	let score = landingGain(ctx, square);
	if (enemyKing) score -= KING_PULL * manhattan(square, enemyKing);
	return score;
}

/**
 * The capture part of `scoreLandingSquare`, with no pull toward a king:
 * the best piece the passenger could take on landing from `square`,
 * less its own value if an enemy could board and take it there. Above
 * zero means "land from here now" — sailing on would chase a slightly
 * better square while a capture goes begging.
 */
function landingGain(ctx, square) {
	const { getCell, pieces, passenger, enemies } = ctx;
	const type = typeOf(passenger);
	let best = 0;
	for (const enemy of enemies) {
		if (enemy.aboard || typeOf(enemy) === 'KING') continue;
		const v = valueOf(enemy);
		if (v <= best) continue;
		if (reaches(type, square, enemy.position, getCell, pieces)) best = v;
	}
	// Kings and pawns can never board, so only they can't take a passenger.
	let attacked = false;
	for (const enemy of enemies) {
		if (enemy.aboard || !rules.mayBoard(enemy.type)) continue;
		if (reaches(typeOf(enemy), enemy.position, square, getCell, pieces)) { attacked = true; break; }
	}
	return best - (attacked ? valueOf(passenger) : 0);
}

/** Enemy pieces of this battle, tagged with whether they're aboard. */
function enemiesOf(world, battle, playerId, getCell) {
	const seats = new Set((battle.seats || []).map(s => String(s.seatId)));
	return (world.chessPieces || [])
		.filter(p => p && p.position && seats.has(String(p.player)) && String(p.player) !== String(playerId))
		.map(p => ({ id: p.id, type: p.type, player: p.player, position: p.position, aboard: isAboard(getCell, p) }));
}

function nearestKing(enemies, from) {
	let best = null;
	for (const e of enemies) {
		if (typeOf(e) !== 'KING') continue;
		if (!best || manhattan(from, e.position) < manhattan(from, best)) best = e.position;
	}
	return best;
}

/** The latest sink time of anywhere a voyage on `timing` can stop (the ship's own square included). */
function latestReachableSink(grid, entry, own, timing) {
	let latest = own;
	for (const s of reachableWater(grid, entry, MAX_VOYAGE_STATES, { timing })) {
		latest = Math.max(latest, grid.sinkAt(s.x, s.z));
	}
	return latest;
}

/**
 * How hard is the sea pressing on a ship at `entry`?
 *
 *   urgent  — its own square sinks before the bot's next tick;
 *   closing — its way OUT does: setting off a horizon from now, the best
 *             water it could reach sinks ESCAPE_CLOSING_MARGIN_MS sooner
 *             than the best it can reach setting off now. The spiral
 *             sea usually takes the water round a moored ship (or a
 *             channel a few squares off) before the ship's own square,
 *             so waiting for `urgent` left ships boxed in.
 *
 * The closing test costs two voyage searches, so it only runs once the
 * ship's own square is within ESCAPE_WATCH_HORIZONS horizons.
 */
function seaPressure(battle, grid, entry, { now, moveIntervalMs }) {
	if (!hasSea(battle)) return { urgent: false, closing: false, own: Infinity };
	const horizonMs = fleeHorizonMs(moveIntervalMs);
	const own = grid.sinkAt(entry.x, entry.z);
	if (own <= now + horizonMs) return { urgent: true, closing: false, own };
	if (own > now + ESCAPE_WATCH_HORIZONS * horizonMs) return { urgent: false, closing: false, own };
	const latestNow = latestReachableSink(grid, entry, own, voyageTiming(battle, now, moveIntervalMs));
	if (latestNow - own < ESCAPE_CLOSING_MARGIN_MS) return { urgent: false, closing: false, own };
	// "A tick from now" with the horizon's slack: a bot's tick can run
	// late (a check to answer, a busy loop), and a missed escape is fatal.
	const latestNext = latestReachableSink(grid, entry, own, voyageTiming(battle, now + horizonMs, moveIntervalMs));
	return { urgent: false, closing: latestNext < latestNow - ESCAPE_CLOSING_MARGIN_MS, own };
}

/**
 * Plan 1 — the sea is coming (Quick battles only; the caller has
 * checked `seaPressure`). Head for the reachable water the sea takes
 * LAST, on a timed search: each stop must still be afloat when the
 * bot next ticks. When the ship's own square is the danger, every stop
 * therefore outlasts it; when the way out is closing, the route may run
 * through water that goes before the ship's own square — that is the
 * point.
 *
 * @returns {null | {kind:'flee', to:{x,z}, dest:{x,z}, sinkAt:number}}
 */
function planSeaFlight(battle, grid, entry, { own, now, moveIntervalMs }) {
	if (!hasSea(battle)) return null;
	let best = null;
	let bestAt = own;
	const timing = voyageTiming(battle, now, moveIntervalMs);
	for (const s of reachableWater(grid, entry, MAX_VOYAGE_STATES, { timing })) {
		if (s.legs === 0) continue;
		const at = grid.sinkAt(s.x, s.z);
		// Latest-sinking first; the shorter voyage on a tie (BFS order).
		if (at > bestAt) { best = s; bestAt = at; }
	}
	return best ? { kind: 'flee', to: best.first, dest: { x: best.x, z: best.z }, sinkAt: bestAt } : null;
}

/** The scoring context for one passenger (see `scoreLandingSquare`). */
function raidContext(world, battle, grid, entry, passenger) {
	const enemies = enemiesOf(world, battle, passenger.player, grid.getCell);
	return {
		getCell: grid.getCell,
		pieces: pieceIndex(world),
		passenger,
		enemies,
		enemyKing: nearestKing(enemies, entry),
	};
}

const sameSquare = (a, b) => !!a && !!b && a.x === b.x && a.z === b.z;

/** Would this plan's leg sail straight back over the leg just sailed? */
function reverses(memo, first, now) {
	return !!memo && !!memo.prev && sameSquare(memo.prev, first)
		&& now - Number(memo.prevAt || 0) < REVERSAL_GUARD_MS;
}

/**
 * Plan 2 — a raid leg for a laden ship.
 *
 * Keeps a remembered destination (`memo.dest`) while it is still
 * reachable, moored, safe from the sea and within RAID_MIN_GAIN of the
 * best fresh square; lands (returns null) on arrival; and never plans
 * a first leg that undoes the previous one.
 *
 * @returns {null | {kind:'raid', to:{x,z}, dest:{x,z}, score:number}}
 */
function planRaidLeg(world, battle, grid, entry, passenger, { now, moveIntervalMs, memo = null, ctx = null }) {
	const getCell = grid.getCell;
	ctx = ctx || raidContext(world, battle, grid, entry, passenger);
	if (ctx.enemies.length === 0) return null;
	// In a Quick battle never stop — even for one leg — where the sea
	// will have taken the ship by the bot's next tick, and never plan a
	// landing where the ship would be boxed in by then.
	const safeAfter = hasSea(battle) ? now + fleeHorizonMs(moveIntervalMs) : -Infinity;
	const timing = voyageTiming(battle, now, moveIntervalMs);
	const landable = s => rules.isMoored(getCell, s.x, s.z)
		&& (!hasSea(battle) || stopSafeUntil(grid, s.x, s.z) > safeAfter);

	const here = rules.isMoored(getCell, entry.x, entry.z) ? scoreLandingSquare(ctx, entry) : -Infinity;
	let best = null;
	let bestScore = -Infinity;
	let remembered = null;
	let rememberedScore = -Infinity;
	for (const s of reachableWater(grid, entry, MAX_VOYAGE_STATES, { timing })) {
		if (s.legs === 0 || !landable(s)) continue;
		// Each extra leg is another 3 s on show: a sliver of cost.
		const score = scoreLandingSquare(ctx, s) - 0.01 * s.legs;
		if (memo && sameSquare(memo.dest, s)) { remembered = s; rememberedScore = score; }
		if (reverses(memo, s.first, now)) continue;
		if (score > bestScore) { best = s; bestScore = score; }
	}
	let target = best;
	let targetScore = bestScore;
	// Stay the course while the old destination is nearly as good.
	if (remembered && !reverses(memo, remembered.first, now)
		&& (!best || rememberedScore >= bestScore - RAID_MIN_GAIN)) {
		target = remembered;
		targetScore = rememberedScore;
	}
	if (!target) return null;
	// Already moored somewhere decent: land rather than dither.
	if (here !== -Infinity && targetScore < here + RAID_MIN_GAIN) return null;
	return { kind: 'raid', to: target.first, dest: { x: target.x, z: target.z }, score: targetScore };
}

/** Does this square touch land the seat owns (terrain, or its home)? */
function touchesOwnLand(getCell, x, z, playerId) {
	for (let dx = -1; dx <= 1; dx++) {
		for (let dz = -1; dz <= 1; dz++) {
			if (dx === 0 && dz === 0) continue;
			const cell = getCell(x + dx, z + dz);
			if (!rules.isLandCell(cell)) continue;
			if (cell.some(item => item && item.type !== 'chess' && String(item.player) === String(playerId))) return true;
		}
	}
	return false;
}

/**
 * Plan 3 — an empty ship adrift (after fleeing, or seized out at sea):
 * bring it alongside our own land, the nearest such square. In a Quick
 * battle every stop must outlast the bot's next tick, and the berth
 * must stay safe (afloat, not boxed in) for two of them — so it isn't
 * chased straight back out by the sea it just fled.
 *
 * @returns {null | {kind:'home', to:{x,z}, dest:{x,z}}}
 */
function planHomecoming(battle, grid, entry, playerId, { now, moveIntervalMs, memo = null }) {
	if (touchesOwnLand(grid.getCell, entry.x, entry.z, playerId)) return null;
	const horizon = fleeHorizonMs(moveIntervalMs);
	const sea = hasSea(battle);
	const timing = voyageTiming(battle, now, moveIntervalMs);
	for (const s of reachableWater(grid, entry, MAX_VOYAGE_STATES, { timing })) {
		if (s.legs === 0 || reverses(memo, s.first, now)) continue;
		if (sea && stopSafeUntil(grid, s.x, s.z) <= now + 2 * horizon) continue;
		if (touchesOwnLand(grid.getCell, s.x, s.z, playerId)) {
			return { kind: 'home', to: s.first, dest: { x: s.x, z: s.z } };
		}
	}
	return null;
}

/**
 * Write (or clear) this ship's voyage memory after a decision.
 * `plan` null or a flight: forget the voyage (a flight is no raid, and
 * may legitimately double back).
 */
function remember(memory, shipId, plan, { now, from, passengerId, playerId }) {
	if (!memory) return;
	if (!plan || plan.kind === 'flee') { delete memory[shipId]; return; }
	memory[shipId] = {
		player: String(playerId),
		passengerId: passengerId != null ? String(passengerId) : null,
		dest: plan.kind === 'raid' ? { x: plan.dest.x, z: plan.dest.z } : null,
		prev: { x: from.x, z: from.z },
		prevAt: now,
	};
}

/**
 * The one leg (if any) this bot should sail its ship now.
 *
 * @param {Object} world
 * @param {Object} battle  An active Viking battle.
 * @param {{x:number, z:number, ship:Object}} entry  One of the bot's ships.
 * @param {string} playerId
 * @param {{now?:number, moveIntervalMs?:number, memory?:Object, grid?:Object}} [opts]
 *   `memory` — the caller's voyage memory keyed by shipId
 *   (`battle.fleet.voyages`); without it every plan starts fresh.
 *   `grid` — a `waterGrid` for this board and instant, to share.
 * @returns {null | {kind:'flee'|'raid'|'home', to:{x:number,z:number}, dest:{x:number,z:number}}}
 */
function planVoyage(world, battle, entry, playerId, {
	now = Date.now(), moveIntervalMs = 10000, memory = null, grid = null,
} = {}) {
	if (!entry || !entry.ship || String(entry.ship.player) !== String(playerId)) return null;
	if (rules.isRowing(entry.ship, now)) return null;
	grid = gridFor(world, battle, now, grid);
	const shipId = String(entry.ship.shipId);
	const passenger = (world.chessPieces || []).find(p => p && p.position
		&& p.position.x === entry.x && p.position.z === entry.z) || null;
	let memo = memory ? memory[shipId] || null : null;
	if (memo && (String(memo.player) !== String(playerId)
		|| (memo.passengerId || null) !== (passenger ? String(passenger.id) : null))) {
		// New hands or a new passenger: a new voyage.
		delete memory[shipId];
		memo = null;
	}
	const opts = { now, moveIntervalMs, memo };
	const decide = plan => {
		remember(memory, shipId, plan, {
			now, from: entry, passengerId: passenger ? passenger.id : null, playerId,
		});
		return plan;
	};

	const pressure = seaPressure(battle, grid, entry, opts);
	if (pressure.urgent) {
		const flight = planSeaFlight(battle, grid, entry, { ...pressure, ...opts });
		if (flight) return decide(flight);
	}
	let ctx = null;
	if (passenger) {
		// A passenger of someone else's (a paused owner's ship kept its
		// owner when its passenger was taken) isn't ours to carry; nor
		// is a king or pawn that somehow ended up aboard (ships.sail
		// refuses them).
		if (String(passenger.player) !== String(playerId) || !rules.mayBoard(passenger.type)) return null;
		ctx = raidContext(world, battle, grid, entry, passenger);
		// Arrived, or a capture on offer right here: let the chess move land.
		const moored = rules.isMoored(grid.getCell, entry.x, entry.z);
		if (moored && sameSquare(memo && memo.dest, entry)) {
			// Voyage over. Keep the last leg on record so a fresh plan
			// next tick can't bounce straight back the way it came.
			memory[shipId] = { ...memo, dest: null };
			return null;
		}
		if (moored && landingGain(ctx, entry) > 0) return decide(null);
	}
	if (pressure.closing && !pressure.urgent) {
		const flight = planSeaFlight(battle, grid, entry, { ...pressure, ...opts });
		if (flight) return decide(flight);
	}
	if (passenger) return decide(planRaidLeg(world, battle, grid, entry, passenger, { ...opts, ctx }));
	const home = planHomecoming(battle, grid, entry, playerId, opts);
	// A ship already at its berth keeps any memory of the leg in (so it
	// can't be bounced straight back out); otherwise record the decision.
	return home || !memo ? decide(home) : null;
}

/**
 * For the sea triage: when does a ship at (x, z) stop being a refuge?
 * Not its own square's time — it can sail — but the latest-sinking
 * water it can reach. Pass the tick's `grid` to share its memo.
 */
function lifeboatSinkAt(world, battle, x, z, now = Date.now(), grid = null) {
	grid = gridFor(world, battle, now, grid);
	let latest = grid.sinkAt(x, z);
	for (const s of reachableWater(grid, { x, z })) {
		latest = Math.max(latest, grid.sinkAt(s.x, s.z));
	}
	return latest;
}

module.exports = {
	PIECE_VALUE,
	MAX_VOYAGE_STATES,
	FLEE_HORIZON_MS,
	BOARDING_DELAY_MS,
	BOARDING_CHANCE,
	REVERSAL_GUARD_MS,
	ESCAPE_CLOSING_MARGIN_MS,
	fleeHorizonMs,
	boardingChance,
	waterGrid,
	voyageTiming,
	reachableWater,
	exitsCloseAt,
	stopSafeUntil,
	reaches,
	isAboard,
	scoreLandingSquare,
	landingGain,
	seaPressure,
	planSeaFlight,
	planRaidLeg,
	planHomecoming,
	planVoyage,
	lifeboatSinkAt,
};
