/**
 * Longships in the shared world.
 *
 * The pure rules are the battle ones (server/battle/shipRules.js); this
 * module binds them to the world instead of an arena:
 *
 *   • Sea is any empty square outside the battle-arena region and within
 *     reach of land (LAND_MARGIN squares beyond the world's land bounds),
 *     so ships can't sail off into nothing. The world has no rising sea.
 *   • Every kingdom gets one longship moored behind its queen's starting
 *     square. A kingdom with no ship left gets a new one there after
 *     RESPAWN_MS. More ships come from pawns that finish their march on
 *     the coast and from rare ship orbs, up to MAX_PER_PLAYER.
 *   • A ship sails up to WORLD_SAIL_MAX squares a leg (battles: 5).
 *   • Raids: a piece that lands from a ship where it has no cell route to
 *     its own king is "on a raid" and starts a clock (RAID_BASE_MS). Each
 *     capture it makes ashore adds RAID_PER_CAPTURE_MS. Back aboard one of
 *     its own ships, or joined up with its king by land, the clock stops.
 *     When it runs out the raider is lost.
 *   • Away rulers are safe: a raider may land on the kingdom of a human
 *     who is offline, but may not capture there, nor seize their ships.
 *
 * Bookkeeping that can't live on a cell (the board cell is the single
 * source of truth for a ship) is in `world.worldFleet`, persisted:
 *
 *   world.worldFleet = {
 *     nextShipId,
 *     moorings:  {playerId: {x, z}},   // where the kingdom's ship is built
 *     respawnAt: {playerId: ms},       // kingdom with no ship: rebuild time
 *     known:     {shipId: {player, x, z}},  // last sweep, to spot losses
 *   }
 *
 * Off unless TETCHES_WORLD_SHIPS=1 (or `setEnabled(true)`), so the live
 * world is untouched until the owner switches it on.
 */

'use strict';

const rules = require('../battle/shipRules');
const { isBattleRegionCell } = require('../battle/geometry');

const WORLD_SHIP = Object.freeze({
	SAIL_MAX: rules.SHIP.WORLD_SAIL_MAX,
	RESPAWN_MS: 2 * 60 * 1000,
	MAX_PER_PLAYER: 3,
	RAID_BASE_MS: 3 * 60 * 1000,
	RAID_PER_CAPTURE_MS: 90 * 1000,
	/** How far past the outermost land a ship may still sail. */
	LAND_MARGIN: 12,
	/** How long a land-bounds scan is reused. */
	BOUNDS_TTL_MS: 5000,
});

let enabledOverride = null;

/** Are world longships switched on? */
function enabled() {
	if (enabledOverride !== null) return enabledOverride;
	return process.env.TETCHES_WORLD_SHIPS === '1';
}

/** Tests (and a future admin switch) can force it either way; null = env. */
function setEnabled(value) {
	enabledOverride = value === null ? null : !!value;
}

const keyOf = (x, z) => `${x},${z}`;

const FORWARD_BY_ORIENTATION = Object.freeze({
	0: { dx: 0, dz: 1 },
	1: { dx: 1, dz: 0 },
	2: { dx: 0, dz: -1 },
	3: { dx: -1, dz: 0 },
});

/** Is this player record a main-world kingdom (not a battle seat)? */
function isWorldPlayer(record) {
	return !!record && !record.battleId;
}

/** Do world ship rules apply to this player's moves? */
function appliesTo(world, playerId) {
	if (!enabled()) return false;
	const record = world && world.players ? world.players[String(playerId)] : null;
	return isWorldPlayer(record);
}

function isAiRecord(record) {
	return !!(record && (record.isComputer || record.isAi || record.isAI));
}

/**
 * Is this kingdom's ruler away? Humans with no open socket are away;
 * bots never are. `isOnline` is injected (Sessions.isOnline) so the
 * rules stay testable.
 */
function isAwayRuler(world, ownerId, isOnline) {
	if (ownerId == null || typeof isOnline !== 'function') return false;
	const record = world && world.players ? world.players[String(ownerId)] : null;
	if (!isWorldPlayer(record) || isAiRecord(record)) return false;
	return !isOnline(String(ownerId));
}

// ── Sea ──────────────────────────────────────────────────────────────

let boundsCache = null;

/** The world's land bounds (battle region excluded), cached briefly. */
function landBounds(world, now = Date.now()) {
	if (boundsCache && boundsCache.world === world && now - boundsCache.at < WORLD_SHIP.BOUNDS_TTL_MS) {
		return boundsCache.bounds;
	}
	let bounds = null;
	for (const key of Object.keys((world && world.board && world.board.cells) || {})) {
		const contents = world.board.cells[key];
		if (!rules.isLandCell(contents)) continue;
		const comma = key.indexOf(',');
		const x = Number(key.slice(0, comma));
		const z = Number(key.slice(comma + 1));
		if (!Number.isFinite(x) || !Number.isFinite(z) || isBattleRegionCell(x, z)) continue;
		if (!bounds) bounds = { minX: x, maxX: x, minZ: z, maxZ: z };
		else {
			if (x < bounds.minX) bounds.minX = x;
			if (x > bounds.maxX) bounds.maxX = x;
			if (z < bounds.minZ) bounds.minZ = z;
			if (z > bounds.maxZ) bounds.maxZ = z;
		}
	}
	boundsCache = { world, at: now, bounds };
	return bounds;
}

/** Forget the cached bounds (tests; after big board changes). */
function resetBoundsCache() {
	boundsCache = null;
}

/** The accessors the pure rules need, bound to the shared world. */
function worldEnv(world, now = Date.now()) {
	const cells = (world && world.board && world.board.cells) || {};
	const bounds = landBounds(world, now);
	const m = WORLD_SHIP.LAND_MARGIN;
	let standing = null;
	return {
		now,
		sailMax: WORLD_SHIP.SAIL_MAX,
		getCell: (x, z) => cells[keyOf(x, z)] || null,
		isInsidePlayArea: (x, z) => !!bounds
			&& !isBattleRegionCell(x, z)
			&& x >= bounds.minX - m && x <= bounds.maxX + m
			&& z >= bounds.minZ - m && z <= bounds.maxZ + m,
		isSunk: () => false,
		hasPiece: (x, z) => {
			if (!standing) {
				standing = new Set();
				for (const p of (world && world.chessPieces) || []) {
					if (p && p.position) standing.add(keyOf(p.position.x, p.position.z));
				}
			}
			return standing.has(keyOf(x, z));
		},
	};
}

// ── Fleet ────────────────────────────────────────────────────────────

function ensureFleet(world) {
	if (!world.worldFleet || typeof world.worldFleet !== 'object') world.worldFleet = {};
	const fleet = world.worldFleet;
	if (!Number.isInteger(fleet.nextShipId) || fleet.nextShipId < 1) fleet.nextShipId = 1;
	for (const field of ['moorings', 'respawnAt', 'known']) {
		if (!fleet[field] || typeof fleet[field] !== 'object') fleet[field] = {};
	}
	return fleet;
}

/** Every world ship on the board. One pass over the cells. */
function worldShips(world) {
	const out = [];
	const cells = (world && world.board && world.board.cells) || {};
	for (const key of Object.keys(cells)) {
		const contents = cells[key];
		if (!Array.isArray(contents)) continue;
		const ship = contents.find(rules.isWorldShipItem);
		if (!ship) continue;
		const comma = key.indexOf(',');
		out.push({ x: Number(key.slice(0, comma)), z: Number(key.slice(comma + 1)), ship });
	}
	return out;
}

function findShip(world, shipId) {
	if (shipId == null) return null;
	return worldShips(world).find(e => String(e.ship.shipId) === String(shipId)) || null;
}

function shipsOf(world, playerId) {
	return worldShips(world).filter(e => String(e.ship.player) === String(playerId));
}

function pieceAt(world, x, z) {
	return (world.chessPieces || []).find(p => p && p.position
		&& p.position.x === x && p.position.z === z) || null;
}

/** The queen's starting square for a home zone (ChessManager's layout). */
function queenStartSquare(zone) {
	const o = Number(zone.orientation) || 0;
	if (o === 0) return { x: zone.x + 3, z: zone.z };
	if (o === 2) return { x: zone.x + 3, z: zone.z + 1 };
	if (o === 1) return { x: zone.x, z: zone.z + 3 };
	return { x: zone.x + 1, z: zone.z + 3 };
}

/**
 * Where a kingdom's ship is built: behind the queen's starting square,
 * or the nearest open water around the back rank.
 */
function homeMooring(world, zone, env) {
	if (!zone) return null;
	const fwd = FORWARD_BY_ORIENTATION[Number(zone.orientation) || 0] || FORWARD_BY_ORIENTATION[0];
	const queen = queenStartSquare(zone);
	const behind = { x: queen.x - fwd.dx, z: queen.z - fwd.dz };
	if (rules.isWater(env, behind.x, behind.z)) return behind;
	// Search outward from the square behind the queen, preferring squares
	// touching land (moored), so the ship is usable where it's built.
	let best = null;
	for (let r = 1; r <= 4 && !best; r++) {
		for (let dz = -r; dz <= r; dz++) {
			for (let dx = -r; dx <= r; dx++) {
				if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
				const x = behind.x + dx;
				const z = behind.z + dz;
				if (!rules.isWater(env, x, z) || !rules.isMoored(env.getCell, x, z)) continue;
				const d = Math.abs(dx) + Math.abs(dz);
				if (!best || d < best.d) best = { x, z, d };
			}
		}
	}
	return best ? { x: best.x, z: best.z } : null;
}

/** Nearest open water (moored preferred) to (x, z), within `radius`. */
function nearestWater(env, at, radius = 3) {
	let best = null;
	for (let dz = -radius; dz <= radius; dz++) {
		for (let dx = -radius; dx <= radius; dx++) {
			const x = at.x + dx;
			const z = at.z + dz;
			if (!rules.isWater(env, x, z)) continue;
			const moored = rules.isMoored(env.getCell, x, z);
			const score = Math.abs(dx) + Math.abs(dz) + (moored ? 0 : 10);
			if (!best || score < best.score) best = { x, z, score };
		}
	}
	return best ? { x: best.x, z: best.z } : null;
}

function spawnShip(world, playerId, at, now = Date.now()) {
	const fleet = ensureFleet(world);
	const shipId = `w-ship-${fleet.nextShipId++}`;
	const record = world.players ? world.players[playerId] : null;
	const item = rules.makeShipItem({
		shipId,
		player: playerId,
		battleId: null,
		homeSeatId: playerId,
		color: record && record.color != null ? record.color : null,
		readyAt: 0,
	});
	item.builtAt = now;
	world.board.cells[keyOf(at.x, at.z)] = [item];
	fleet.known[shipId] = { player: String(playerId), x: at.x, z: at.z };
	return { shipId, x: at.x, z: at.z, ship: item };
}

/**
 * Give `playerId` an extra ship at the nearest open water to `near`
 * (a promoted pawn, a claimed orb). Respects MAX_PER_PLAYER.
 *
 * @returns {null | {shipId, x, z}} null with a `reason` on refusal.
 */
function launchShipNear(world, playerId, near, { now = Date.now(), radius = 1 } = {}) {
	if (!enabled() || !appliesTo(world, playerId)) return { refused: 'not_enabled' };
	if (shipsOf(world, playerId).length >= WORLD_SHIP.MAX_PER_PLAYER) return { refused: 'fleet_full' };
	const env = worldEnv(world, now);
	const at = nearestWater(env, near, radius);
	if (!at) return { refused: 'no_water' };
	const built = spawnShip(world, playerId, at, now);
	return { shipId: built.shipId, x: at.x, z: at.z };
}

// ── Sailing ──────────────────────────────────────────────────────────

/** Sail one leg of a world ship. Same guards as ships.sail (3–6). */
function sail(world, playerId, { shipId, to } = {}, { now = Date.now() } = {}) {
	const entry = findShip(world, shipId);
	if (!entry) return { success: false, reason: 'no_ship', error: rules.SHIP_REJECTIONS.no_ship };
	if (String(entry.ship.player) !== String(playerId)) {
		return { success: false, reason: 'not_your_ship', error: rules.SHIP_REJECTIONS.not_your_ship };
	}
	const target = to && typeof to === 'object' ? { x: Number(to.x), z: Number(to.z) } : null;
	const env = worldEnv(world, now);
	const check = rules.validateSail(env, entry.ship, { x: entry.x, z: entry.z }, target, now);
	if (!check.ok) return { success: false, reason: check.reason, error: check.message };

	const passenger = pieceAt(world, entry.x, entry.z);
	if (passenger && !rules.mayBoard(passenger.type)) {
		return { success: false, reason: 'passenger_cannot_sail', error: rules.SHIP_REJECTIONS.passenger_cannot_sail };
	}

	const cells = world.board.cells;
	const contents = cells[keyOf(entry.x, entry.z)];
	delete cells[keyOf(entry.x, entry.z)];
	cells[keyOf(target.x, target.z)] = contents;
	for (const item of contents) {
		if (item && item.type === 'chess' && item.position && typeof item.position === 'object') {
			item.position = { x: target.x, z: target.z };
		}
	}
	if (passenger) passenger.position = { x: target.x, z: target.z };
	entry.ship.readyAt = now + rules.SHIP.ROW_LOCK_MS;
	ensureFleet(world).known[String(entry.ship.shipId)] = {
		player: String(entry.ship.player), x: target.x, z: target.z,
	};
	return {
		success: true,
		event: {
			shipId: String(entry.ship.shipId),
			from: { x: entry.x, z: entry.z },
			to: { x: target.x, z: target.z },
			playerId: String(playerId),
			passengerId: passenger ? String(passenger.id) : null,
			readyAt: entry.ship.readyAt,
			world: true,
		},
	};
}

/** Could this kingdom sail anything right now? */
function canSailAnyFor(world, playerId, now = Date.now()) {
	if (!appliesTo(world, playerId)) return false;
	const own = shipsOf(world, playerId).filter(e => {
		const passenger = pieceAt(world, e.x, e.z);
		return !passenger || rules.mayBoard(passenger.type);
	});
	if (own.length === 0) return false;
	return rules.canSailAny(worldEnv(world, now), own, now);
}

// ── Chess moves that touch a ship, and raids ─────────────────────────

/**
 * Classify a chess move against the PRE-move board (see
 * ships.planChessMove). World moves that touch no ship but start or end
 * a raider's walk still get a plan, so the raid clock can follow.
 */
function planChessMove(world, piece, toX, toZ) {
	if (!piece || !piece.position || !appliesTo(world, piece.player)) return null;
	const cells = world.board.cells || {};
	const fromCell = cells[keyOf(piece.position.x, piece.position.z)];
	const toCell = cells[keyOf(toX, toZ)];
	const captures = Array.isArray(toCell) && toCell.some(item => item && item.type === 'chess'
		&& String(item.player) !== String(piece.player));
	const plan = rules.classifyMove(fromCell, toCell, piece.player, captures);
	if (plan) return { ...plan, world: true, captures };
	if (piece.raid) return { kind: 'raid_step', world: true, captures, shipId: null };
	return null;
}

/**
 * The away-ruler veto for a world move whose geometry is legal: a
 * raider (on a raid, or stepping off a ship) may not capture an away
 * ruler's piece, and nobody may seize an away ruler's ship.
 *
 * @returns {null | {reason, message}}
 */
function awayRulerVeto(world, piece, toX, toZ, isOnline) {
	if (!piece || !appliesTo(world, piece.player)) return null;
	const cells = world.board.cells || {};
	const toCell = cells[keyOf(toX, toZ)];
	const refuse = () => ({ reason: 'away_ruler', message: rules.SHIP_REJECTIONS.away_ruler });
	const toShip = rules.shipAt(toCell);
	if (toShip && String(toShip.player) !== String(piece.player)
		&& isAwayRuler(world, toShip.player, isOnline)) return refuse();
	const target = Array.isArray(toCell) && toCell.find(item => item && item.type === 'chess'
		&& String(item.player) !== String(piece.player));
	if (!target) return null;
	const fromShip = rules.shipAt(cells[keyOf(piece.position.x, piece.position.z)]);
	const raider = !!piece.raid || !!fromShip;
	if (raider && isAwayRuler(world, target.player, isOnline)) return refuse();
	return null;
}

/**
 * Should a raider landing on (x, z) leave the ground with its owner?
 * True when the ground belongs to an away ruler: visiting takes nothing.
 */
function keepsGroundOwner(world, piece, landOwner, isOnline) {
	if (!piece || landOwner == null) return false;
	if (String(landOwner) === String(piece.player)) return false;
	return isAwayRuler(world, landOwner, isOnline);
}

/**
 * After a world chess move: start, extend or stop the mover's raid
 * clock. `hasPathToKing(x, z, playerId)` is injected (IslandManager).
 *
 * @returns {null | {raid: {startedAt, deadline, captures}} | {raidEnded: true}}
 */
function afterWorldMove(world, piece, to, plan, captured, { now = Date.now(), hasPathToKing } = {}) {
	if (!piece || !appliesTo(world, piece.player)) return null;
	const cells = world.board.cells || {};
	const here = cells[keyOf(to.x, to.z)];
	const aboardOwn = rules.shipAt(here) && String(rules.shipAt(here).player) === String(piece.player);
	const homeward = typeof hasPathToKing === 'function' && hasPathToKing(to.x, to.z, piece.player);

	if (aboardOwn || homeward) {
		if (piece.raid) {
			delete piece.raid;
			return { raidEnded: true };
		}
		return null;
	}
	const landing = plan && (plan.kind === 'land' || plan.kind === 'raid');
	if (!piece.raid && !landing) return null;
	if (!piece.raid) {
		piece.raid = { startedAt: now, deadline: now + WORLD_SHIP.RAID_BASE_MS, captures: 0 };
	}
	if (captured) {
		piece.raid.captures = (piece.raid.captures || 0) + 1;
		piece.raid.deadline += WORLD_SHIP.RAID_PER_CAPTURE_MS;
	}
	return { raid: { ...piece.raid } };
}

// ── Sweep ────────────────────────────────────────────────────────────

/**
 * Periodic world-ship upkeep:
 *   • strip ships whose owner is gone (left, stowed, eliminated);
 *   • moor a first ship for every kingdom that never had one;
 *   • report lost ships and rebuild after RESPAWN_MS;
 *   • end raids that rejoined their king, expire raids that ran out.
 *
 * @param {Object} world
 * @param {Object} hooks
 * @param {number} [hooks.now]
 * @param {(x,z,playerId) => boolean} [hooks.hasPathToKing]
 * @param {(piece, reason) => void} [hooks.removePiece]  Removes a lost raider.
 * @param {(playerId, event, payload) => void} [hooks.emitTo]
 * @param {(event, payload) => void} [hooks.emitAll]
 * @returns {{changed: boolean, built: Array, lost: Array, expired: Array}}
 */
function reconcile(world, hooks = {}) {
	const out = { changed: false, built: [], lost: [], expired: [] };
	if (!enabled() || !world || !world.board || !world.board.cells) return out;
	const now = hooks.now || Date.now();
	const emitTo = hooks.emitTo || (() => {});
	const emitAll = hooks.emitAll || (() => {});
	const fleet = ensureFleet(world);
	const players = world.players || {};
	const cells = world.board.cells;

	const eligible = pid => {
		const rec = players[pid];
		return isWorldPlayer(rec) && !rec.eliminated && !rec.stowedKingdom
			&& !!(world.homeZones && world.homeZones[pid]);
	};

	// Ships of owners who are gone sink quietly with their kingdom.
	let current = worldShips(world);
	for (const entry of current) {
		if (eligible(String(entry.ship.player))) continue;
		const contents = cells[keyOf(entry.x, entry.z)];
		const rest = (contents || []).filter(item => !rules.isWorldShipItem(item));
		if (rest.length > 0) cells[keyOf(entry.x, entry.z)] = rest;
		else delete cells[keyOf(entry.x, entry.z)];
		out.changed = true;
	}
	if (out.changed) current = worldShips(world);

	const controlled = new Map();
	for (const entry of current) {
		const owner = String(entry.ship.player);
		controlled.set(owner, (controlled.get(owner) || 0) + 1);
	}
	const byShipId = new Map(current.map(e => [String(e.ship.shipId), e]));

	let env = null;
	for (const pid of Object.keys(players)) {
		if (!eligible(pid)) {
			// Away (stowed) or out: a returning kingdom gets its ship at once.
			delete fleet.respawnAt[pid];
			delete fleet.moorings[pid];
			continue;
		}
		if ((controlled.get(pid) || 0) > 0) {
			delete fleet.respawnAt[pid];
			continue;
		}
		const firstShip = !fleet.moorings[pid];
		if (!firstShip && !Number.isFinite(fleet.respawnAt[pid])) {
			const rebuildAt = now + WORLD_SHIP.RESPAWN_MS;
			fleet.respawnAt[pid] = rebuildAt;
			for (const [shipId, last] of Object.entries(fleet.known)) {
				if (!last || String(last.player) !== pid) continue;
				const reason = byShipId.has(shipId) ? 'seized' : 'destroyed';
				out.lost.push({ shipId, playerId: pid, reason, rebuildAt });
				emitTo(pid, 'ship_lost', { shipId, seatId: pid, reason, rebuildAt, world: true });
			}
			continue;
		}
		if (!firstShip && now < fleet.respawnAt[pid]) continue;
		if (!env) env = worldEnv(world, now);
		const zone = world.homeZones[pid];
		const zoneKey = `${zone.x},${zone.z}`;
		let at = fleet.moorings[pid];
		// Rebuilt at the same mooring unless the kingdom moved (a stowed
		// kingdom relocated) or the water there is gone.
		if (!at || at.zone !== zoneKey || !rules.isWater(env, at.x, at.z)) {
			const found = homeMooring(world, zone, env);
			at = found ? { x: found.x, z: found.z, zone: zoneKey } : null;
		}
		// No water behind the kingdom yet: try again on a later sweep.
		if (!at) continue;
		fleet.moorings[pid] = at;
		const built = spawnShip(world, pid, { x: at.x, z: at.z }, now);
		delete fleet.respawnAt[pid];
		controlled.set(pid, 1);
		byShipId.set(built.shipId, { x: at.x, z: at.z, ship: built.ship });
		out.built.push({ shipId: built.shipId, playerId: pid, x: at.x, z: at.z });
		if (!firstShip) emitTo(pid, 'ship_built', { shipId: built.shipId, seatId: pid, x: at.x, z: at.z, world: true });
		out.changed = true;
	}

	const known = {};
	for (const [shipId, entry] of byShipId) {
		known[shipId] = { player: String(entry.ship.player), x: entry.x, z: entry.z };
	}
	fleet.known = known;
	for (const pid of Object.keys(fleet.moorings)) {
		if (!players[pid]) delete fleet.moorings[pid];
	}

	// Raid clocks.
	for (const piece of [...(world.chessPieces || [])]) {
		if (!piece || !piece.raid || !piece.position) continue;
		const { x, z } = piece.position;
		const ship = rules.shipAt(cells[keyOf(x, z)]);
		const aboardOwn = ship && String(ship.player) === String(piece.player);
		const homeward = typeof hooks.hasPathToKing === 'function'
			&& hooks.hasPathToKing(x, z, piece.player);
		if (aboardOwn || homeward || !appliesTo(world, piece.player)) {
			delete piece.raid;
			out.changed = true;
			continue;
		}
		if (now < Number(piece.raid.deadline)) continue;
		const lost = { pieceId: String(piece.id), playerId: String(piece.player), type: piece.type, x, z };
		if (typeof hooks.removePiece === 'function') hooks.removePiece(piece, 'raid_expired');
		out.expired.push(lost);
		emitAll('raid_expired', lost);
		out.changed = true;
	}
	return out;
}

/** Remove every world ship (switching the feature off, tests). */
function stripWorldShips(world) {
	let removed = 0;
	const cells = (world && world.board && world.board.cells) || {};
	for (const [key, contents] of Object.entries(cells)) {
		if (!Array.isArray(contents)) continue;
		const filtered = contents.filter(item => !rules.isWorldShipItem(item));
		if (filtered.length === contents.length) continue;
		removed++;
		if (filtered.length > 0) cells[key] = filtered;
		else delete cells[key];
	}
	return removed;
}

module.exports = {
	WORLD_SHIP,
	enabled,
	setEnabled,
	appliesTo,
	isAwayRuler,
	landBounds,
	resetBoundsCache,
	worldEnv,
	ensureFleet,
	worldShips,
	findShip,
	shipsOf,
	queenStartSquare,
	homeMooring,
	nearestWater,
	spawnShip,
	launchShipNear,
	sail,
	canSailAnyFor,
	planChessMove,
	awayRulerVeto,
	keepsGroundOwner,
	afterWorldMove,
	reconcile,
	stripWorldShips,
};
