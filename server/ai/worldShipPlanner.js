/**
 * World longships — how a bot captains its ships in the SHARED world
 * (server/world/worldShips.js). The battle captain (shipPlanner.js)
 * plans against a small arena and a rising sea; the world has neither,
 * but it is huge, its kingdoms sit far apart, a raider ashore is on a
 * clock, and a ship boxed in by land is lost. So the plans differ:
 *
 *   • stay   — a passenger aboard can land with a worthwhile capture
 *              right here, or a raider ashore can step aboard right
 *              here: sail nowhere, let the chess move happen.
 *   • escape — the ship sits with land on three sides: one more block
 *              traps it (worldShips.isTrapped), so sail out first.
 *   • pickup — an empty ship and one of our pieces ashore on a raid:
 *              sail to a moored square it can step aboard from (or, if
 *              none is in reach yet, toward it). Raiders not picked up
 *              before their clock runs out are lost.
 *   • raid   — a knight, rook, bishop or queen aboard: if a moored
 *              square in reach lets it land with a capture worth the
 *              risk, sail there; otherwise sail toward the nearest
 *              kingdom whose ruler is ONLINE (an away ruler can't be
 *              robbed: worldShips.awayRulerVeto). A target the ship
 *              can't get closer to is given up for a while.
 *   • home   — an empty ship (nobody to pick up), or a passenger with
 *              nowhere to raid: back alongside our own land.
 *
 * Every plan is one leg, and every search is bounded: one breadth-first
 * search over sail legs per ship per tick, capped at
 * MAX_WORLD_VOYAGE_STATES squares (shipPlanner.reachableWater), with
 * stops that would leave the ship one block from trapped never used.
 * Distant goals are approached greedily: the reachable square nearest
 * the goal, which can only ever bring the ship closer.
 *
 * Nothing here mutates the world. The caller keeps the voyage memory
 * (`opts.memory`, keyed by shipId) and writes `plan.memo` back once the
 * sail has gone through; target give-ups are written here directly.
 */

'use strict';

const rules = require('../battle/shipRules');
const planner = require('./shipPlanner');
const worldShips = require('../world/worldShips');

/** Chance per chess move that a bot puts a knight, rook or bishop aboard. */
const WORLD_BOARDING_CHANCE = Object.freeze({ easy: 0.05, medium: 0.1, hard: 0.18 });
/**
 * Chance per tick that a bot sails an unhurried leg (raid, home). A sail
 * is the bot's chess move, so a bot that always sailed would leave its
 * pieces idle for a whole voyage. Pickups and escapes always sail.
 */
const WORLD_SAIL_CHANCE = Object.freeze({ easy: 0.5, medium: 0.7, hard: 0.85 });
/** Bound on one voyage search (the world board is tens of thousands of cells). */
const MAX_WORLD_VOYAGE_STATES = 900;
/** Kingdoms further than this (Manhattan, from the ship) aren't raided. */
const MAX_TARGET_DISTANCE = 220;
/** An approach leg must gain at least this many squares on its goal. */
const APPROACH_MIN_GAIN = 2;
/** A target the ship couldn't close on is left alone this long. */
const TARGET_GIVE_UP_MS = 3 * 60 * 1000;
/** Raiders with less than this left on their clock head back aboard first. */
const RAID_RETURN_MS = 75 * 1000;
/** Land on this many of its four sides and a ship is one block from trapped. */
const TRAP_RISK_SIDES = 3;
/** Stay the course to a remembered landing while it is this nearly as good. */
const LANDING_STICKINESS = 0.5;
/** Pieces further than this (Chebyshev) can't touch a square this turn. */
const THREAT_REACH = 14;
/** Pieces a bot may send raiding (a queen stays home). */
const RAIDER_TYPES = Object.freeze(['KNIGHT', 'ROOK', 'BISHOP']);
/** A bot keeps at least this many knights/bishops/rooks/queens at home. */
const HOME_GUARD_MIN = 2;

const ORTHOGONAL = Object.freeze([[1, 0], [-1, 0], [0, 1], [0, -1]]);
const keyOf = (x, z) => `${x},${z}`;
const typeOf = piece => String((piece && piece.type) || '').toUpperCase();
const valueOf = piece => planner.PIECE_VALUE[typeOf(piece)] || 0;
const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
const chebyshev = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));
const same = (a, b) => !!a && !!b && a.x === b.x && a.z === b.z;

function byDifficulty(table, difficulty) {
	return table[difficulty] != null ? table[difficulty] : table.medium;
}

const boardingChance = difficulty => byDifficulty(WORLD_BOARDING_CHANCE, difficulty);
const sailChance = difficulty => byDifficulty(WORLD_SAIL_CHANCE, difficulty);

/** How many of the four sides of (x, z) are real land. */
function landSides(getCell, x, z) {
	let n = 0;
	for (const [dx, dz] of ORTHOGONAL) {
		if (rules.isLandCell(getCell(x + dx, z + dz))) n++;
	}
	return n;
}

/** Could a ship stop at (x, z) without being one block from trapped? */
function isSafeStop(getCell, x, z) {
	return landSides(getCell, x, z) < TRAP_RISK_SIDES;
}

/**
 * This player's world ships, found through the fleet's `known` index
 * (kept by every sail and by the 2 s sweep) instead of a pass over every
 * cell of the world; each entry is checked against the board. Without
 * an index (an old save, a hand-built test board) it falls back to the
 * full scan.
 */
function shipsOf(world, playerId) {
	const known = world && world.worldFleet && world.worldFleet.known;
	if (!known || typeof known !== 'object') return worldShips.shipsOf(world, playerId);
	const cells = (world.board && world.board.cells) || {};
	const out = [];
	for (const last of Object.values(known)) {
		if (!last || !Number.isFinite(last.x) || !Number.isFinite(last.z)) continue;
		const ship = (cells[keyOf(last.x, last.z)] || []).find(rules.isWorldShipItem);
		if (ship && String(ship.player) === String(playerId)) out.push({ x: last.x, z: last.z, ship });
	}
	return out;
}

/** Is this world record a live kingdom other players can meet? */
function isLiveKingdom(record) {
	return !!record && !record.battleId && !record.eliminated && !record.stowedKingdom;
}

/**
 * Whose pieces matter to a raid by `playerId`: kingdoms that are live,
 * not paused (paused pieces can't be taken) and whose ruler isn't away
 * (worldShips.isAwayRuler — bots never are). Their pieces are both the
 * prey and the danger; an away ruler's pieces stand still.
 */
function activeEnemyIds(world, playerId, isOnline) {
	const out = new Set();
	for (const [id, record] of Object.entries((world && world.players) || {})) {
		if (String(id) === String(playerId) || !isLiveKingdom(record) || record.paused) continue;
		if (worldShips.isAwayRuler(world, id, isOnline)) continue;
		out.add(String(id));
	}
	return out;
}

/** Where every chess piece stands, keyed "x,z". */
function pieceIndex(world) {
	const byKey = new Map();
	for (const p of (world && world.chessPieces) || []) {
		if (p && p.position) byKey.set(keyOf(p.position.x, p.position.z), p);
	}
	return byKey;
}

/**
 * Everything one bot's plans read, built once per tick and shared by
 * all its ships.
 *
 * @param {Object} world
 * @param {string} playerId
 * @param {{grid?:Object, now?:number, isOnline?:Function}} [opts]
 */
function worldContext(world, playerId, { grid = null, now = Date.now(), isOnline = null } = {}) {
	grid = grid || planner.waterGrid(worldShips.worldEnv(world, now));
	const getCell = grid.getCell;
	const enemyIds = activeEnemyIds(world, playerId, isOnline);
	const enemies = [];
	const kings = new Map();
	const raiders = [];
	let ownKing = null;
	for (const p of (world && world.chessPieces) || []) {
		if (!p || !p.position) continue;
		const owner = String(p.player);
		if (owner === String(playerId)) {
			if (typeOf(p) === 'KING') ownKing = p.position;
			const ship = rules.shipAt(getCell(p.position.x, p.position.z));
			if (p.raid && !(ship && String(ship.player) === owner)) raiders.push(p);
			continue;
		}
		if (!enemyIds.has(owner)) continue;
		const aboard = planner.isAboard(getCell, p);
		enemies.push({ id: p.id, type: p.type, player: owner, position: p.position, aboard });
		if (typeOf(p) === 'KING' && !kings.has(owner)) kings.set(owner, p.position);
	}
	const fleet = world.worldFleet || {};
	const mooring = fleet.moorings && fleet.moorings[String(playerId)];
	return {
		world,
		playerId: String(playerId),
		now,
		grid,
		getCell,
		pieces: pieceIndex(world),
		enemies,
		kings,
		raiders,
		home: mooring ? { x: mooring.x, z: mooring.z } : ownKing,
	};
}

/**
 * Online kingdoms worth sailing at, nearest king first, within
 * MAX_TARGET_DISTANCE of `from`.
 */
function raidTargets(ctx, from) {
	const out = [];
	for (const [id, king] of ctx.kings) {
		const d = manhattan(from, king);
		if (d <= MAX_TARGET_DISTANCE) out.push({ id, king, d });
	}
	out.sort((a, b) => a.d - b.d);
	return out;
}

/** Can any active enemy (other than `except`) strike the square `sq`? */
function isDefended(ctx, sq, except = null) {
	for (const e of ctx.enemies) {
		if (e === except || e.aboard || chebyshev(e.position, sq) > THREAT_REACH) continue;
		const t = typeOf(e);
		if (t === 'KING' || t === 'PAWN') {
			if (chebyshev(e.position, sq) === 1) return true;
			continue;
		}
		if (planner.reaches(t, e.position, sq, ctx.getCell, ctx.pieces)) return true;
	}
	return false;
}

/**
 * What landing from a ship moored at `square` is worth to `passenger`:
 * the best capture it could make (never a king, never a piece aboard —
 * ship to ship is forbidden), less its own value when the victim's
 * square is defended, less its own value again when an enemy could
 * board the ship and take it before it lands. Above zero is worth it.
 */
function landingValue(ctx, square, passenger) {
	const type = typeOf(passenger);
	const own = valueOf(passenger);
	let best = -Infinity;
	for (const e of ctx.enemies) {
		if (e.aboard || typeOf(e) === 'KING' || chebyshev(e.position, square) > THREAT_REACH) continue;
		const v = valueOf(e);
		if (v <= best) continue;
		if (!planner.reaches(type, square, e.position, ctx.getCell, ctx.pieces)) continue;
		const net = v - (isDefended(ctx, e.position, e) ? own : 0);
		if (net > best) best = net;
	}
	if (best <= 0) return best === -Infinity ? 0 : best;
	let boarded = false;
	for (const e of ctx.enemies) {
		if (e.aboard || !rules.mayBoard(e.type) || chebyshev(e.position, square) > THREAT_REACH) continue;
		if (planner.reaches(typeOf(e), e.position, square, ctx.getCell, ctx.pieces)) { boarded = true; break; }
	}
	return best - (boarded ? own : 0);
}

/** Could `piece` (on land) step aboard a ship at `square` with its own move? */
function canStepAboard(ctx, piece, square) {
	return rules.isMoored(ctx.getCell, square.x, square.z)
		&& planner.reaches(typeOf(piece), piece.position, square, ctx.getCell, ctx.pieces);
}

/** Does (x, z) touch land of `playerId`'s (terrain or home, any of 8 sides)? */
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

/** The voyage search for one ship: every safe stop it can reach (start first). */
function reachable(ctx, entry) {
	return planner.reachableWater(ctx.grid, entry, MAX_WORLD_VOYAGE_STATES, {
		canStop: (x, z) => isSafeStop(ctx.getCell, x, z),
	});
}

/**
 * The reachable stop nearest `goal`, if it gains at least
 * APPROACH_MIN_GAIN squares on where the ship is now (fewer legs on a
 * tie: BFS order).
 */
function approach(reach, entry, goal) {
	let best = null;
	let bestD = manhattan(entry, goal) - APPROACH_MIN_GAIN + 1;
	for (const s of reach) {
		if (s.legs === 0) continue;
		const d = manhattan(s, goal);
		if (d < bestD) { best = s; bestD = d; }
	}
	return best;
}

const legTo = (kind, s, extra = {}) => ({ kind, to: s.first, dest: { x: s.x, z: s.z }, ...extra });

/**
 * The one leg (if any) this bot should sail one of its world ships now.
 *
 * @param {Object} world
 * @param {{x:number, z:number, ship:Object}} entry
 * @param {string} playerId
 * @param {{now?:number, memory?:Object, ctx?:Object, grid?:Object, isOnline?:Function}} [opts]
 *   `memory` — voyage memory keyed by shipId; `ctx` — a shared
 *   `worldContext` for this bot and instant.
 * @returns {null | {kind:'escape'|'pickup'|'raid'|'home', to:{x,z}, dest:{x,z}, urgent:boolean, memo:Object}}
 */
function planWorldVoyage(world, entry, playerId, {
	now = Date.now(), memory = null, ctx = null, grid = null, isOnline = null,
} = {}) {
	if (!entry || !entry.ship || String(entry.ship.player) !== String(playerId)) return null;
	if (rules.isRowing(entry.ship, now)) return null;
	ctx = ctx || worldContext(world, playerId, { grid, now, isOnline });
	const getCell = ctx.getCell;
	const shipId = String(entry.ship.shipId);
	const passenger = ctx.pieces.get(keyOf(entry.x, entry.z)) || null;
	if (passenger && (String(passenger.player) !== String(playerId) || !rules.mayBoard(passenger.type))) return null;

	let memo = memory ? memory[shipId] || null : null;
	if (memo && (memo.player !== String(playerId)
		|| (memo.passengerId || null) !== (passenger ? String(passenger.id) : null))) {
		// New hands or a new passenger: a new voyage (give-ups kept).
		memo = { giveUp: memo.player === String(playerId) ? memo.giveUp || {} : {} };
	}
	const giveUp = (memo && memo.giveUp) || {};
	const memoFor = extra => ({
		player: String(playerId),
		passengerId: passenger ? String(passenger.id) : null,
		giveUp,
		...extra,
	});
	const moored = rules.isMoored(getCell, entry.x, entry.z);
	// A raider waiting for this ship, nearest first.
	const raider = passenger ? null : ctx.raiders.slice()
		.sort((a, b) => manhattan(a.position, entry) - manhattan(b.position, entry))[0] || null;

	// Stay: a landing worth making, or a raider able to step aboard, here.
	if (passenger && moored && landingValue(ctx, entry, passenger) > 0) return null;
	if (raider && canStepAboard(ctx, raider, entry)) return null;

	let reach = null;
	const search = () => (reach = reach || reachable(ctx, entry));

	// Escape: one block from trapped.
	if (!isSafeStop(getCell, entry.x, entry.z)) {
		const out = search().find(s => s.legs > 0);
		if (out) return legTo('escape', out, { urgent: true, memo: memoFor({}) });
	}

	// Pickup: the nearest raider ashore, before its clock runs out.
	if (raider) {
		const berth = search().find(s => s.legs > 0 && canStepAboard(ctx, raider, s));
		if (berth) return legTo('pickup', berth, { urgent: true, memo: memoFor({}) });
		const nearer = approach(search(), entry, raider.position);
		if (nearer) return legTo('pickup', nearer, { urgent: true, memo: memoFor({}) });
	}

	if (passenger) {
		// Raid: the best landing in reach...
		let best = null;
		let bestScore = 0;
		let remembered = null;
		let rememberedScore = 0;
		for (const s of search()) {
			if (s.legs === 0 || !rules.isMoored(getCell, s.x, s.z)) continue;
			const score = landingValue(ctx, s, passenger) - 0.01 * s.legs;
			if (score <= 0) continue;
			if (same(memo && memo.dest, s)) { remembered = s; rememberedScore = score; }
			if (score > bestScore) { best = s; bestScore = score; }
		}
		if (remembered && rememberedScore >= bestScore - LANDING_STICKINESS) best = remembered;
		if (best) return legTo('raid', best, { urgent: false, memo: memoFor({ dest: { x: best.x, z: best.z } }) });

		// ...else close on the nearest online kingdom not given up on.
		const targets = raidTargets(ctx, entry).filter(t => !(Number(giveUp[t.id]) > now));
		const target = (memo && targets.find(t => t.id === memo.targetId)) || targets[0] || null;
		if (target) {
			const nearer = approach(search(), entry, target.king);
			if (nearer) {
				return legTo('raid', nearer, { urgent: false, target: target.id, memo: memoFor({ targetId: target.id }) });
			}
			// Can't get closer from here (a bay, a wall of land): leave it.
			giveUp[target.id] = now + TARGET_GIVE_UP_MS;
			if (memory) memory[shipId] = memoFor({});
		}
	}

	// Home: alongside our own land, where a raider can step aboard again.
	if (touchesOwnLand(getCell, entry.x, entry.z, playerId)) return null;
	const berth = search().find(s => s.legs > 0 && touchesOwnLand(getCell, s.x, s.z, playerId));
	if (berth) return legTo('home', berth, { urgent: false, memo: memoFor({}) });
	if (ctx.home) {
		const nearer = approach(search(), entry, ctx.home);
		if (nearer) return legTo('home', nearer, { urgent: false, memo: memoFor({}) });
	}
	return null;
}

/**
 * Is there anyone worth putting a raider aboard for? (An online kingdom
 * within reach of one of `ships`.)
 */
function hasRaidTarget(ctx, ships) {
	return (ships || []).some(entry => raidTargets(ctx, entry).length > 0);
}

/**
 * May this bot send a piece raiding now? Only one raider at a time
 * (nobody aboard, nobody ashore on a raid), and never if that would
 * leave fewer than HOME_GUARD_MIN knights/bishops/rooks/queens home.
 */
function mayLaunchRaid(world, playerId, getCell) {
	let guards = 0;
	for (const p of (world && world.chessPieces) || []) {
		if (!p || !p.position || String(p.player) !== String(playerId)) continue;
		if (p.raid || planner.isAboard(getCell, p)) return false;
		const t = typeOf(p);
		if (t !== 'KING' && t !== 'PAWN') guards++;
	}
	return guards > HOME_GUARD_MIN;
}

module.exports = {
	WORLD_BOARDING_CHANCE,
	WORLD_SAIL_CHANCE,
	MAX_WORLD_VOYAGE_STATES,
	MAX_TARGET_DISTANCE,
	TARGET_GIVE_UP_MS,
	RAID_RETURN_MS,
	RAIDER_TYPES,
	HOME_GUARD_MIN,
	boardingChance,
	sailChance,
	landSides,
	isSafeStop,
	shipsOf,
	activeEnemyIds,
	worldContext,
	raidTargets,
	landingValue,
	canStepAboard,
	touchesOwnLand,
	planWorldVoyage,
	hasRaidTarget,
	mayLaunchRaid,
};
