/**
 * Viking longships — the stateful side.
 *
 * `shipRules.js` holds the pure rules; this module applies them to the
 * live world: it spawns each seat's longship at its mooring, sails
 * ships, classifies chess moves that touch a ship, rebuilds lost ships
 * and tells the battle's players what happened.
 *
 * The board cell is the single source of truth for a ship (owner,
 * position, rowing lock). `battle.fleet` only keeps bookkeeping that
 * can't live on a cell:
 *
 *   battle.fleet = {
 *     nextShipId,            // counter for readable, unique ship ids
 *     moorings: {seatId: {x, z}},  // where each seat's ship is built
 *     respawnAt: {seatId: ms},     // seat with no ship: rebuild time
 *     known: {shipId: {player, x, z}},  // last sweep's ships, to spot losses
 *     sunk: {shipId: true},        // sunk since the last sweep (loss reason)
 *     voyages: {shipId: {...}},    // bots' voyage memory (ai/shipPlanner.js)
 *   }
 *
 * The battle record is persisted whole, so none of this needs new
 * persistence keys. Everything here is a no-op outside Viking battles.
 */

'use strict';

const Sessions = require('../world/Sessions');
const rules = require('./shipRules');
const { isVikingBattle } = require('./edition');
const { isInsidePlayArea, playRadiusForSeats } = require('./geometry');
const { isSunk } = require('./sea');

// Mirrors moveValidation's pawn-forward table (see geometry.js header):
// the mooring is one square BEHIND the queen, i.e. against forward.
const FORWARD_BY_ORIENTATION = Object.freeze({
	0: Object.freeze({ dx: 0, dz: 1 }),
	1: Object.freeze({ dx: 1, dz: 0 }),
	2: Object.freeze({ dx: 0, dz: -1 }),
	3: Object.freeze({ dx: -1, dz: 0 }),
});

const keyOf = (x, z) => `${x},${z}`;

function playRadiusOf(battle) {
	return Number(battle && battle.playRadius) || playRadiusForSeats((battle && battle.seatCount) || 2);
}

/**
 * The battle a seat plays in, if it plays Viking rules. Status is not
 * filtered: ship cells exist from arena build to cleanup, and the rules
 * must hold for as long as the cells do.
 */
function vikingBattleOf(world, playerId) {
	const record = world && world.players ? world.players[playerId] : null;
	if (!record || !record.battleId) return null;
	const battle = world.battles ? world.battles[String(record.battleId)] : null;
	return isVikingBattle(battle) ? battle : null;
}

/** The board/sea accessors the pure rules need, bound to one battle. */
function boardEnv(world, battle, now = Date.now()) {
	const cells = (world && world.board && world.board.cells) || {};
	const radius = playRadiusOf(battle);
	// Built on first use: most sail checks never meet a cell-less square.
	let standing = null;
	return {
		now,
		getCell: (x, z) => cells[keyOf(x, z)] || null,
		isInsidePlayArea: (x, z) => !!(battle && battle.centre)
			&& isInsidePlayArea(battle.centre, x, z, radius),
		isSunk: (x, z) => isSunk(battle, x, z, now),
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

function ensureFleet(battle) {
	if (!battle.fleet || typeof battle.fleet !== 'object') battle.fleet = {};
	const fleet = battle.fleet;
	if (!Number.isInteger(fleet.nextShipId) || fleet.nextShipId < 1) fleet.nextShipId = 1;
	for (const field of ['moorings', 'respawnAt', 'known', 'sunk', 'voyages']) {
		if (!fleet[field] || typeof fleet[field] !== 'object') fleet[field] = {};
	}
	return fleet;
}

/**
 * Every ship cell of this battle. Ships only ever sit on water inside
 * the play area, so the arena square bounds the scan — no walk of the
 * whole (sparse, possibly huge) world board.
 *
 * @returns {Array<{x:number, z:number, ship:Object}>}
 */
function shipsInBattle(world, battle) {
	const out = [];
	if (!battle || !battle.centre || !world || !world.board) return out;
	const cells = world.board.cells || {};
	const r = playRadiusOf(battle);
	for (let dz = -r; dz <= r; dz++) {
		for (let dx = -r; dx <= r; dx++) {
			const x = battle.centre.x + dx;
			const z = battle.centre.z + dz;
			const ship = rules.shipAt(cells[keyOf(x, z)]);
			if (ship && String(ship.battleId) === String(battle.id)) out.push({ x, z, ship });
		}
	}
	return out;
}

function findShip(world, battle, shipId) {
	if (shipId == null) return null;
	return shipsInBattle(world, battle).find(entry => String(entry.ship.shipId) === String(shipId)) || null;
}

/** The chess piece standing at (x, z), if any. */
function pieceAt(world, x, z) {
	return (world.chessPieces || []).find(p => p && p.position
		&& p.position.x === x && p.position.z === z) || null;
}

/**
 * Tell the battle's human players. Scoped exactly like every other
 * battle event (BattleManager.emitToSeatHumans): each seated human's
 * sockets, never the whole world room.
 */
function emitToBattle(battle, event, payload) {
	if (!battle || !Array.isArray(battle.seats)) return;
	for (const seat of battle.seats) {
		if (!seat || seat.isAi || !seat.controlledBy) continue;
		try { Sessions.emitToPlayerSockets(seat.controlledBy, event, payload); }
		catch (_e) { /* socket closing */ }
	}
}

// ── Spawning ─────────────────────────────────────────────────────────

/** The square behind a queen standing at `queenPos` for this orientation. */
function mooringBehind(queenPos, orientation) {
	const fwd = FORWARD_BY_ORIENTATION[orientation] || FORWARD_BY_ORIENTATION[0];
	return { x: queenPos.x - fwd.dx, z: queenPos.z - fwd.dz };
}

function spawnShip(world, battle, seatId, at) {
	const fleet = ensureFleet(battle);
	const shipId = `${battle.id}-ship-${fleet.nextShipId++}`;
	const record = world.players ? world.players[seatId] : null;
	const item = rules.makeShipItem({
		shipId,
		player: seatId,
		battleId: battle.id,
		homeSeatId: seatId,
		color: record && record.color != null ? record.color : null,
		readyAt: 0,
	});
	world.board.cells[keyOf(at.x, at.z)] = [item];
	fleet.known[shipId] = { player: String(seatId), x: at.x, z: at.z };
	return { shipId, x: at.x, z: at.z, ship: item };
}

/**
 * Arena build (Viking only): moor one longship directly behind each
 * seat's queen. The queen starts ashore on her normal square, so the
 * back rank has no hole; her first landing from any ship is the arrival.
 *
 * @returns {Array<{seatId:string, shipId:string, x:number, z:number}>}
 */
function spawnFleet(world, battle, { now = Date.now() } = {}) {
	if (!isVikingBattle(battle)) return [];
	const fleet = ensureFleet(battle);
	const env = boardEnv(world, battle, now);
	const spawned = [];
	for (const seat of battle.seats || []) {
		const zone = world.homeZones ? world.homeZones[seat.seatId] : null;
		const queen = (world.chessPieces || []).find(p => p
			&& String(p.player) === String(seat.seatId)
			&& String(p.type || '').toUpperCase() === 'QUEEN');
		if (!zone || !queen || !queen.position) continue;
		const at = mooringBehind(queen.position, zone.orientation);
		fleet.moorings[seat.seatId] = at;
		if (!rules.isWater(env, at.x, at.z)) {
			// Somehow not open water: try again from the respawn clock.
			fleet.respawnAt[seat.seatId] = now + rules.SHIP.RESPAWN_MS;
			continue;
		}
		const built = spawnShip(world, battle, seat.seatId, at);
		spawned.push({ seatId: seat.seatId, shipId: built.shipId, x: at.x, z: at.z });
	}
	return spawned;
}

/** Arena cleanup: strip every ship item of this battle from the board. */
function stripBattleShips(world, battleId) {
	let removed = 0;
	const cells = (world && world.board && world.board.cells) || {};
	for (const [key, contents] of Object.entries(cells)) {
		if (!Array.isArray(contents)) continue;
		const filtered = contents.filter(item => !(rules.isShipItem(item)
			&& String(item.battleId || '') === String(battleId)));
		if (filtered.length === contents.length) continue;
		removed++;
		if (filtered.length > 0) cells[key] = filtered;
		else delete cells[key];
	}
	return removed;
}

// ── Sailing ──────────────────────────────────────────────────────────

/**
 * Sail one leg. The caller has already checked guards 1–2 (the actor is
 * live and unpaused; the battle is active and Viking); this checks 3–5:
 *
 *   3. the ship exists and `playerId` controls it;
 *   4. it isn't rowing;
 *   5. integer, orthogonal, 1–5 squares, all open water;
 *   6. nobody aboard who may never board (a king or pawn). The move
 *      rules keep them off, so this is defence in depth: if one ever
 *      ends up aboard (a respawn or rescue that picked a ship cell),
 *      it must not be rowed out to sea where nothing can reach it.
 *
 * Applying it moves the whole cell (ship item and any passenger's chess
 * marker), moves the passenger, and starts the 3 s rowing lock. Not a
 * chess move: no cooldown stamp, no phase change.
 *
 * @returns {{success: true, event: Object} | {success: false, error: string, reason: string}}
 */
function sail(world, battle, playerId, { shipId, to } = {}, { now = Date.now() } = {}) {
	const entry = findShip(world, battle, shipId);
	if (!entry) {
		return { success: false, reason: 'no_ship', error: rules.SHIP_REJECTIONS.no_ship };
	}
	if (String(entry.ship.player) !== String(playerId)) {
		return { success: false, reason: 'not_your_ship', error: rules.SHIP_REJECTIONS.not_your_ship };
	}
	const target = to && typeof to === 'object'
		? { x: Number(to.x), z: Number(to.z) }
		: null;
	const env = boardEnv(world, battle, now);
	const check = rules.validateSail(env, entry.ship, { x: entry.x, z: entry.z }, target, now);
	if (!check.ok) return { success: false, reason: check.reason, error: check.message };

	const passenger = pieceAt(world, entry.x, entry.z);
	if (passenger && !rules.mayBoard(passenger.type)) {
		return {
			success: false,
			reason: 'passenger_cannot_sail',
			error: rules.SHIP_REJECTIONS.passenger_cannot_sail,
		};
	}

	const cells = world.board.cells;
	const fromKey = keyOf(entry.x, entry.z);
	const toKey = keyOf(target.x, target.z);
	const contents = cells[fromKey];
	delete cells[fromKey];
	cells[toKey] = contents;
	for (const item of contents) {
		if (item && item.type === 'chess' && item.position && typeof item.position === 'object') {
			item.position = { x: target.x, z: target.z };
		}
	}
	if (passenger) passenger.position = { x: target.x, z: target.z };
	entry.ship.readyAt = now + rules.SHIP.ROW_LOCK_MS;
	const fleet = ensureFleet(battle);
	fleet.known[String(entry.ship.shipId)] = { player: String(entry.ship.player), x: target.x, z: target.z };

	return {
		success: true,
		event: {
			shipId: String(entry.ship.shipId),
			from: { x: entry.x, z: entry.z },
			to: { x: target.x, z: target.z },
			playerId: String(playerId),
			passengerId: passenger ? String(passenger.id) : null,
			readyAt: entry.ship.readyAt,
		},
	};
}

/**
 * Could this seat sail anything right now? Keeps a player whose only
 * action is a sail in the chess phase (tetromino.js phase skip).
 */
function canSailAnyFor(world, playerId, now = Date.now()) {
	const battle = vikingBattleOf(world, playerId);
	if (!battle || battle.status !== 'active') return false;
	const own = shipsInBattle(world, battle).filter(e => {
		if (String(e.ship.player) !== String(playerId)) return false;
		// A king or pawn aboard can't be sailed (see `sail`, guard 6).
		const passenger = pieceAt(world, e.x, e.z);
		return !passenger || rules.mayBoard(passenger.type);
	});
	if (own.length === 0) return false;
	return rules.canSailAny(boardEnv(world, battle, now), own, now);
}

/** Does the player have a chess-phase action: a legal chess move or a sail? */
function hasChessPhaseAction(world, playerId, chessManager, now = Date.now()) {
	if (chessManager.hasValidChessMoves(world, playerId)) return true;
	return canSailAnyFor(world, playerId, now);
}

// ── Chess moves that touch a ship ────────────────────────────────────

/**
 * Classify a (validated, about-to-be-applied) chess move against the
 * PRE-move board — once the move lands, the target ship has already
 * changed hands and the classification would be lost.
 *
 * @returns {null | {kind, shipId, previousController, landOwner, battleId}}
 */
function planChessMove(world, piece, toX, toZ) {
	if (!piece || !piece.position) return null;
	const battle = vikingBattleOf(world, piece.player);
	if (!battle) return null;
	const cells = world.board.cells || {};
	const fromCell = cells[keyOf(piece.position.x, piece.position.z)];
	const toCell = cells[keyOf(toX, toZ)];
	const captures = Array.isArray(toCell) && toCell.some(item => item && item.type === 'chess'
		&& String(item.player) !== String(piece.player));
	const plan = rules.classifyMove(fromCell, toCell, piece.player, captures);
	return plan ? { ...plan, battleId: battle.id } : null;
}

/**
 * The shared post-move hook — called by the human chess handler AND
 * the bots' `applyChessMove`, so both paths classify and announce
 * identically. The ownership flip itself already happened in the
 * caller's `transferOwnership` (a ship is an ordinary owned cell item).
 *
 * Emits `ship_seized` when a ship changes hands (seize / boarded).
 *
 * @returns {null | {kind:string, shipId:string}} The `chess_move.ship` field.
 */
function afterPieceMoved(world, piece, from, to, captured, plan) {
	if (!plan || !piece) return null;
	const battle = world.battles ? world.battles[String(plan.battleId)] : null;
	if (!battle) return null;
	const info = { kind: plan.kind, shipId: plan.shipId };
	if (plan.landOwner != null) info.landOwner = plan.landOwner;

	// A paused owner's ship keeps its owner (transferOwnership skips
	// paused players), so only announce a change of hands that happened.
	const nowAt = rules.shipAt(world.board.cells[keyOf(to.x, to.z)]);
	const changedHands = !!nowAt && String(nowAt.player) === String(piece.player);
	if ((plan.kind === 'seize' || plan.kind === 'boarded') && changedHands) {
		// `fleet.known` is deliberately left alone: the next sweep sees
		// the old owner's ship gone and reports it lost ('seized').
		emitToBattle(battle, 'ship_seized', {
			shipId: plan.shipId,
			// Controllers, not squares: who lost the ship and who has it now.
			from: plan.previousController,
			to: String(piece.player),
			byPieceId: String(piece.id),
			kind: plan.kind,
			at: { x: to.x, z: to.z },
			capturedPieceId: captured && captured.id != null ? String(captured.id) : null,
		});
	}
	return info;
}

// ── The sea ──────────────────────────────────────────────────────────

/**
 * A ship's square is about to sink (BattleManager.sinkCell). Note who
 * was aboard BEFORE the sea removes them, and remember the loss reason.
 *
 * @returns {null | {shipId, x, z, passengerId}} The `ship_sunk` payload.
 */
function noteSinking(world, battle, x, z) {
	if (!isVikingBattle(battle)) return null;
	const ship = rules.shipAt(world.board.cells[keyOf(x, z)]);
	if (!ship) return null;
	const passenger = pieceAt(world, x, z);
	ensureFleet(battle).sunk[String(ship.shipId)] = true;
	return {
		shipId: String(ship.shipId),
		x,
		z,
		passengerId: passenger ? String(passenger.id) : null,
	};
}

// ── Sweep: losses and rebuilds ───────────────────────────────────────

/**
 * Run from the battle sweep. For each seat:
 *   • controls a ship → nothing to rebuild;
 *   • just lost its last one → `ship_lost` (sunk / seized / destroyed)
 *     and the 45 s rebuild clock starts;
 *   • clock run out → a new ship at the home mooring, but only if the
 *     seat is alive and the mooring is open water (a sunk mooring is
 *     never water again, so the sea ends rebuilding for good). No cap:
 *     a seat that seizes ships keeps them all.
 *
 * @param {Object} world
 * @param {Object} battle
 * @param {{now?: number, seatIsAlive?: (seat:Object) => boolean}} [opts]
 * @returns {boolean} Whether the board changed (a ship was built).
 */
function reconcileShips(world, battle, { now = Date.now(), seatIsAlive = () => true } = {}) {
	if (!isVikingBattle(battle) || battle.status !== 'active') return false;
	const fleet = ensureFleet(battle);
	const current = shipsInBattle(world, battle);
	const byShipId = new Map(current.map(e => [String(e.ship.shipId), e]));
	const controlled = new Map();
	for (const entry of current) {
		const owner = String(entry.ship.player);
		controlled.set(owner, (controlled.get(owner) || 0) + 1);
	}

	let changed = false;
	for (const seat of battle.seats || []) {
		const seatId = String(seat.seatId);
		if ((controlled.get(seatId) || 0) > 0) {
			delete fleet.respawnAt[seatId];
			continue;
		}
		if (!Number.isFinite(fleet.respawnAt[seatId])) {
			const rebuildAt = now + rules.SHIP.RESPAWN_MS;
			fleet.respawnAt[seatId] = rebuildAt;
			for (const [shipId, last] of Object.entries(fleet.known)) {
				if (!last || String(last.player) !== seatId) continue;
				let reason = 'destroyed';
				if (byShipId.has(shipId)) reason = 'seized';
				else if (fleet.sunk[shipId]) reason = 'sunk';
				emitToBattle(battle, 'ship_lost', { shipId, seatId, reason, rebuildAt });
			}
			continue;
		}
		if (now < fleet.respawnAt[seatId]) continue;
		if (!seatIsAlive(seat)) continue;
		const at = fleet.moorings[seatId];
		if (!at) continue;
		const env = boardEnv(world, battle, now);
		// Land built over the mooring (or the sea took it): keep waiting.
		if (!rules.isWater(env, at.x, at.z)) continue;
		const built = spawnShip(world, battle, seatId, at);
		delete fleet.respawnAt[seatId];
		controlled.set(seatId, 1);
		byShipId.set(built.shipId, { x: at.x, z: at.z, ship: built.ship });
		emitToBattle(battle, 'ship_built', { shipId: built.shipId, seatId, x: at.x, z: at.z });
		changed = true;
	}

	const known = {};
	for (const [shipId, entry] of byShipId) {
		known[shipId] = { player: String(entry.ship.player), x: entry.x, z: entry.z };
	}
	fleet.known = known;
	fleet.sunk = {};
	// A bot's voyage memory dies with the ship, or when it changes hands.
	for (const [shipId, memo] of Object.entries(fleet.voyages)) {
		const entry = byShipId.get(shipId);
		if (!entry || !memo || String(memo.player) !== String(entry.ship.player)) delete fleet.voyages[shipId];
	}
	return changed;
}

module.exports = {
	vikingBattleOf,
	boardEnv,
	ensureFleet,
	shipsInBattle,
	findShip,
	emitToBattle,
	mooringBehind,
	spawnShip,
	spawnFleet,
	stripBattleShips,
	sail,
	canSailAnyFor,
	hasChessPhaseAction,
	planChessMove,
	afterPieceMoved,
	noteSinking,
	reconcileShips,
};
