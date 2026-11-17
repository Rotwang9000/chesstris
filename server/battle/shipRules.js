/**
 * Viking longships — the pure rules.
 *
 * A longship is ONE board cell: `board.cells["x,z"]` holds a ship item
 *
 *   { type: 'ship', shipId, player, battleId, homeSeatId, readyAt, color }
 *
 * and, when someone is aboard, that passenger's ordinary chess marker.
 * The passenger is an ordinary piece whose `position` is the ship's
 * cell — "aboard" is derived from the cell, never stored on the piece,
 * so there is exactly one source of truth and every existing sweep that
 * asks "does this piece have a cell under it?" keeps working.
 *
 * Rules (owner-approved v1):
 *   1. Any piece except a king or pawn may step aboard with a normal
 *      move. One piece per ship (a second would be capturing your own).
 *   2. A ship sails 1–5 squares in a straight orthogonal line across
 *      open water, then rows for 3 s before it can sail again.
 *   3. While it rows its own side may not step on or off — every
 *      arrival is on show for 3 s, which closes "sail up and take a
 *      king in 500 ms". The lock is one-sided: an enemy may still
 *      capture the passenger or seize the empty ship while it rows.
 *      A two-sided lock was a shield — a laden ship that re-sailed one
 *      square at every lock end could never be touched, yet could
 *      strike at any lock end it chose.
 *   4. Stepping on or off needs the ship moored: touching land on any
 *      of its 8 neighbours, which is how one-step diagonal moves work.
 *      This closes the untouchable offshore knight.
 *   5. A piece aboard never attacks a king; it must land first.
 *   6. Ship to ship is forbidden.
 *   7. Ships are not land: sliders cannot pass over them, nothing builds
 *      from them, and they never clear, fall or decay.
 *   8. A hull is longer than its square: it also lies over the open-water
 *      square its prow points at (`deckSquare`). That square is deck too:
 *      a piece may step aboard by a move that reaches either square, and
 *      step off by a move from either; the ship is moored when either
 *      touches land (owner, 2026-11-17: "board/unboard from either
 *      cell"). The ship still holds one square on the board; the deck
 *      square stays water, so other ships may sail through it.
 *
 * Everything here is dependency-free and takes the board through small
 * injected accessors (`getCell(x, z)`, `isInsidePlayArea(x, z)`,
 * `isSunk(x, z)`), so a client ESM mirror can be generated from this
 * file and fed the client's own board and sea maths.
 */

'use strict';

const SHIP = Object.freeze({
	/** Cell item type. */
	TYPE: 'ship',
	/** Furthest a ship sails in one leg (battles; the world passes `env.sailMax`). */
	SAIL_MAX: 5,
	/** Furthest a ship sails in one leg in the shared world: kingdoms sit far apart. */
	WORLD_SAIL_MAX: 8,
	/** How long a ship rows after sailing before it may sail or be used. */
	ROW_LOCK_MS: 3000,
	/** A seat with no ship gets a new one at its mooring after this long. */
	RESPAWN_MS: 45 * 1000,
	/**
	 * Pieces that may never board. Kings: a king at sea would dodge
	 * `seatIsAlive`, the last-king tie-break and island anchoring.
	 * Pawns: promotion counts forward distance, which sailing would warp.
	 */
	NO_BOARD: Object.freeze(['KING', 'PAWN']),
});

const ORTHOGONAL = Object.freeze([[1, 0], [-1, 0], [0, 1], [0, -1]]);
const NEIGHBOURS_8 = Object.freeze([
	[-1, -1], [0, -1], [1, -1],
	[-1, 0], [1, 0],
	[-1, 1], [0, 1], [1, 1],
]);

/** Reasons a move or a sail is refused, with the words players see. */
const SHIP_REJECTIONS = Object.freeze({
	cannot_board: 'Kings and pawns cannot board a longship.',
	passenger_cannot_sail: 'A king or pawn aboard cannot be rowed away — it must step ashore.',
	ship_rowing: 'That longship is still rowing — pieces cannot step on or off until it steadies.',
	ship_not_moored: 'A longship must be touching land to step on or off.',
	aboard_no_king_attack: 'A piece aboard a longship cannot attack a king — land first.',
	ship_to_ship: 'You cannot step from one longship straight onto another.',
	path_blocked_by_ship: 'A longship blocks the way — pieces cannot slide over it.',
	not_your_ship: 'That is not your longship.',
	no_ship: 'There is no longship there.',
	bad_sail: 'A longship sails in a straight line, up to its range.',
	away_ruler: 'That kingdom\'s ruler is away — raiders may visit, but take nothing.',
	not_water: 'A longship can only sail across open water.',
});

function isShipItem(item) {
	return !!(item && item.type === SHIP.TYPE);
}

/** A longship of the shared world (not of a battle). */
function isWorldShipItem(item) {
	return isShipItem(item) && item.world === true && item.battleId == null;
}

/** The ship item in a cell's contents, or null. */
function shipAt(cell) {
	if (!Array.isArray(cell)) return null;
	for (const item of cell) {
		if (isShipItem(item)) return item;
	}
	return null;
}

function cellHasShip(cell) {
	return shipAt(cell) !== null;
}

/** Real ground: a non-empty cell that isn't a ship. */
function isLandCell(cell) {
	return Array.isArray(cell) && cell.length > 0 && !cellHasShip(cell);
}

/** May a piece of this type step aboard? */
function mayBoard(pieceType) {
	return !SHIP.NO_BOARD.includes(String(pieceType || '').toUpperCase());
}

/**
 * Does the moving piece's side control this ship? A piece with no
 * owner on record is treated as the ship's own side, so the stricter
 * rule applies whenever we can't tell.
 */
function controls(ship, piece) {
	if (!ship) return false;
	if (!piece || piece.player == null || ship.player == null) return true;
	return String(ship.player) === String(piece.player);
}

/** Is the ship still rowing (locked) at `now`? */
function isRowing(ship, now) {
	return !!ship && Number(ship.readyAt) > now;
}

/**
 * Open water: inside the arena's play area, nothing there (no land, no
 * other ship) and not already taken by the sea. Sunk squares are not
 * water, so ships are driven inward and go down when their square does.
 *
 * `env.hasPiece` (optional) also rules out a square where a chess piece
 * stands with no cell under it — for a moment that happens (a piece
 * lifted by a line clear before it settles, a king's detonation
 * stripping cells) — so a ship can never sail under a piece and pick it
 * up as a passenger it was never allowed to take (a king, a pawn, a
 * second piece).
 *
 * @param {{getCell:Function, isInsidePlayArea:Function, isSunk:Function, hasPiece?:Function}} env
 */
function isWater(env, x, z) {
	if (!Number.isInteger(x) || !Number.isInteger(z)) return false;
	if (typeof env.isInsidePlayArea === 'function' && !env.isInsidePlayArea(x, z)) return false;
	const cell = env.getCell(x, z);
	if (Array.isArray(cell) && cell.length > 0) return false;
	if (typeof env.hasPiece === 'function' && env.hasPiece(x, z)) return false;
	return !(typeof env.isSunk === 'function' && env.isSunk(x, z));
}

/**
 * Is the square at (x, z) touching land on any of its 8 neighbours?
 * Another ship alongside doesn't count — that would let a chain of
 * ships ferry pieces across open sea.
 *
 * @param {(x:number, z:number) => Array|null} getCell
 */
function isMoored(getCell, x, z) {
	for (const [dx, dz] of NEIGHBOURS_8) {
		if (isLandCell(getCell(x + dx, z + dz))) return true;
	}
	return false;
}

// ── Heading and the second deck square ─────────────────────────────

/** The four headings, in the renderer's order (ties break the same way). */
const HEADINGS = Object.freeze([
	Object.freeze({ dx: 0, dz: 1 }),
	Object.freeze({ dx: 1, dz: 0 }),
	Object.freeze({ dx: 0, dz: -1 }),
	Object.freeze({ dx: -1, dz: 0 }),
]);

/** A stored direction as one of HEADINGS' unit steps, or null. */
function unitHeading(d) {
	if (!d || typeof d !== 'object') return null;
	const dx = Math.sign(Number(d.dx) || 0);
	const dz = Math.sign(Number(d.dz) || 0);
	if (dx === 0 && dz === 0) return null;
	if (dx !== 0 && dz !== 0) {
		return Math.abs(Number(d.dx)) >= Math.abs(Number(d.dz)) ? { dx, dz: 0 } : { dx: 0, dz };
	}
	return { dx, dz };
}

/**
 * Which way the prow of a ship at (x, z) points:
 *
 *   1. at an open-water square when any side has one (the bow, which
 *      overhangs, never pokes into land);
 *   2. the way it last sailed, if that way is open;
 *   3. alongside the shore it touches (keel parallel to the land);
 *   4. the way with the most open water ahead (up to `lookahead`);
 *   5. away from `centre`, then the fixed HEADINGS order.
 *
 * Pure: `isOpen(x, z)` says whether a square is open water. The
 * renderer draws the hull this way and the rules read its second deck
 * square from it, so what a player sees is what the server accepts.
 */
function headingAt(isOpen, x, z, lastDir = null, centre = null, lookahead = 4) {
	const water = (dx, dz) => !!isOpen(x + dx, z + dz);
	const last = unitHeading(lastDir);
	const ahead = HEADINGS.filter(d => water(d.dx, d.dz));
	if (ahead.length === 0) return last || HEADINGS[0];
	if (last && water(last.dx, last.dz)) return last;
	const open = (d) => {
		let n = 0;
		for (let k = 1; k <= lookahead; k++) {
			if (!isOpen(x + d.dx * k, z + d.dz * k)) break;
			n++;
		}
		return n;
	};
	const landSide = (d) => !water(d.dx, d.dz);
	const score = (d) => {
		let s = 0;
		if (landSide({ dx: d.dz, dz: -d.dx }) || landSide({ dx: -d.dz, dz: d.dx })) s += 100;
		if (!landSide({ dx: -d.dx, dz: -d.dz })) s += 10;
		return s + open(d);
	};
	let best = null;
	let bestScore = -Infinity;
	let bestAway = -Infinity;
	for (const d of ahead) {
		const s = score(d);
		const away = centre ? (d.dx * (x - centre.x) + d.dz * (z - centre.z)) : 0;
		if (s > bestScore || (s === bestScore && away > bestAway)) {
			best = d; bestScore = s; bestAway = away;
		}
	}
	return best;
}

/** A ship's heading under the rules' own idea of open water. */
function shipHeading(env, ship, x, z) {
	return headingAt((a, b) => isWater(env, a, b), x, z, ship && ship.dir, (env && env.centre) || null);
}

/**
 * The ship's second deck square: the open water its prow lies over
 * (rule 8), or null when it has none (water nowhere beside it).
 *
 * @returns {{x:number, z:number, dx:number, dz:number} | null}
 */
function deckSquare(env, ship, x, z) {
	if (!ship || !env) return null;
	const d = shipHeading(env, ship, x, z);
	const bx = x + d.dx;
	const bz = z + d.dz;
	return isWater(env, bx, bz) ? { x: bx, z: bz, dx: d.dx, dz: d.dz } : null;
}

/** Moored (rule 4) by its own square or by its deck square. */
function isShipMoored(env, ship, x, z) {
	if (isMoored(env.getCell, x, z)) return true;
	const deck = deckSquare(env, ship, x, z);
	return !!deck && isMoored(env.getCell, deck.x, deck.z);
}

/**
 * Does a boarding piece's own geometry carry it from `a` to `b`? Only
 * the pieces that may board (knight, bishop, rook, queen); a slider's
 * squares in between must be land with no piece on them.
 */
function reaches(env, type, a, b, pieceAt) {
	const t = String(type || '').toUpperCase();
	const dx = b.x - a.x;
	const dz = b.z - a.z;
	const ax = Math.abs(dx);
	const az = Math.abs(dz);
	if (ax === 0 && az === 0) return false;
	if (t === 'KNIGHT') return (ax === 1 && az === 2) || (ax === 2 && az === 1);
	const straight = ax === 0 || az === 0;
	const diagonal = ax === az;
	if (t === 'ROOK' && !straight) return false;
	if (t === 'BISHOP' && !diagonal) return false;
	if (t === 'QUEEN' && !straight && !diagonal) return false;
	if (t !== 'ROOK' && t !== 'BISHOP' && t !== 'QUEEN') return false;
	const sx = Math.sign(dx);
	const sz = Math.sign(dz);
	for (let x = a.x + sx, z = a.z + sz; x !== b.x || z !== b.z; x += sx, z += sz) {
		if (!isLandCell(env.getCell(x, z))) return false;
		if (pieceAt(x, z)) return false;
	}
	return true;
}

/**
 * A move that only works through a ship's deck square (rule 8): the
 * piece's geometry reaches the deck square of the ship at `to`
 * (boarding), or carries it from the deck square of the ship it is on
 * to `to` (landing). Returns `{via}` (the deck square used) or null.
 * The ordinary veto (`chessMoveVeto`) still applies on top, with the
 * real squares.
 *
 * @param {Object} env      full rules env (getCell, isInsidePlayArea, isSunk, hasPiece, centre)
 * @param {{type:string}} piece
 * @param {{x:number,z:number}} from
 * @param {{x:number,z:number}} to
 * @param {(x:number, z:number) => any} pieceAt  any piece standing there, or null
 */
function deckMove(env, piece, from, to, pieceAt) {
	if (!env || !piece || !from || !to || !mayBoard(piece.type)) return null;
	const fromShip = shipAt(env.getCell(from.x, from.z));
	const toShip = shipAt(env.getCell(to.x, to.z));
	if (fromShip && toShip) return null; // ship to ship (rule 6)
	if (fromShip) {
		const deck = deckSquare(env, fromShip, from.x, from.z);
		if (!deck || (deck.x === to.x && deck.z === to.z)) return null;
		const toCell = env.getCell(to.x, to.z);
		if (!Array.isArray(toCell) || toCell.length === 0) return null;
		return reaches(env, piece.type, deck, to, pieceAt) ? { via: { x: deck.x, z: deck.z } } : null;
	}
	if (toShip) {
		const deck = deckSquare(env, toShip, to.x, to.z);
		if (!deck || (deck.x === from.x && deck.z === from.z)) return null;
		return reaches(env, piece.type, from, deck, pieceAt) ? { via: { x: deck.x, z: deck.z } } : null;
	}
	return null;
}

/** How far a ship may sail in one leg under this env. */
function sailMaxOf(env) {
	const n = Number(env && env.sailMax);
	return Number.isInteger(n) && n > 0 ? n : SHIP.SAIL_MAX;
}

/** Every square a ship at `from` can reach this leg, nearest first per direction. */
function sailTargets(env, from) {
	const out = [];
	if (!from) return out;
	const max = sailMaxOf(env);
	for (const [dx, dz] of ORTHOGONAL) {
		for (let step = 1; step <= max; step++) {
			const x = from.x + dx * step;
			const z = from.z + dz * step;
			if (!isWater(env, x, z)) break;
			out.push({ x, z, distance: step });
		}
	}
	return out;
}

/**
 * Validate one sail leg: integer, orthogonal, 1–sailMax squares, every
 * square crossed (destination included) open water, and not rowing.
 *
 * @returns {{ok: true} | {ok: false, reason: string, message: string}}
 */
function validateSail(env, ship, from, to, now) {
	const refuse = reason => ({ ok: false, reason, message: SHIP_REJECTIONS[reason] || reason });
	if (!ship || !from) return refuse('no_ship');
	if (isRowing(ship, now)) return refuse('ship_rowing');
	if (!to || !Number.isInteger(to.x) || !Number.isInteger(to.z)) return refuse('bad_sail');
	const dx = to.x - from.x;
	const dz = to.z - from.z;
	if ((dx !== 0) === (dz !== 0)) return refuse('bad_sail'); // diagonal or no move
	const distance = Math.abs(dx) + Math.abs(dz);
	if (distance > sailMaxOf(env)) return refuse('bad_sail');
	const sx = Math.sign(dx);
	const sz = Math.sign(dz);
	for (let step = 1; step <= distance; step++) {
		if (!isWater(env, from.x + sx * step, from.z + sz * step)) return refuse('not_water');
	}
	return { ok: true };
}

/**
 * Can any of these ships sail right now? Used to keep a player in the
 * chess phase when their only possible action is a sail.
 *
 * @param {Array<{ship:Object, x:number, z:number}>} ships
 */
function canSailAny(env, ships, now) {
	for (const entry of ships || []) {
		if (!entry || isRowing(entry.ship, now)) continue;
		if (sailTargets(env, { x: entry.x, z: entry.z }).length > 0) return true;
	}
	return false;
}

/**
 * The ship-specific veto on a chess move that is otherwise legal by its
 * piece geometry. Returns null when ships have nothing to say.
 *
 * Path squares are handled separately (`pathBlockedByShip`) because
 * only the slider validators walk a path.
 *
 * @param {{getCell:Function, now:number}} env
 * @param {{type:string}} piece
 * @param {{x:number, z:number}} from
 * @param {{x:number, z:number}} to
 * @param {{pieceType?:string}|null} target  Whatever stands on `to`.
 * @returns {null | {reason:string, message:string}}
 */
function chessMoveVeto(env, piece, from, to, target) {
	const fromShip = shipAt(env.getCell(from.x, from.z));
	const toShip = shipAt(env.getCell(to.x, to.z));
	if (!fromShip && !toShip) return null;
	const refuse = reason => ({ reason, message: SHIP_REJECTIONS[reason] });

	if (fromShip && toShip) return refuse('ship_to_ship');
	if (toShip) {
		if (!mayBoard(piece && piece.type)) return refuse('cannot_board');
		// One-sided: only the ship's own side waits out the rowing.
		// An enemy capturing the passenger or seizing the empty ship
		// may strike at once — otherwise re-sailing at every lock end
		// would make a laden ship untouchable (rule 3).
		if (isRowing(toShip, env.now) && controls(toShip, piece)) return refuse('ship_rowing');
		if (!isShipMoored(env, toShip, to.x, to.z)) return refuse('ship_not_moored');
		return null;
	}
	if (isRowing(fromShip, env.now)) return refuse('ship_rowing');
	if (!isShipMoored(env, fromShip, from.x, from.z)) return refuse('ship_not_moored');
	if (target && String(target.pieceType || '').toLowerCase() === 'king') {
		return refuse('aboard_no_king_attack');
	}
	return null;
}

/** A ship is not a path square: sliders (and castling, and pawn double steps) stop at it. */
function pathBlockedByShip(getCell, x, z) {
	return cellHasShip(getCell(x, z));
}

/**
 * Who the ground in this cell belongs to, for "did they land on enemy
 * soil?" — the owner of the terrain, else of the home marker, else null
 * (neutral ring, or nobody).
 */
function landOwnerOf(cell) {
	if (!Array.isArray(cell)) return null;
	let home = null;
	for (const item of cell) {
		if (!item || item.player == null || item.type === 'chess' || isShipItem(item)) continue;
		if (item.type === 'home') {
			if (home === null) home = String(item.player);
			continue;
		}
		return String(item.player);
	}
	return home;
}

/**
 * Classify a chess move against the PRE-move board.
 *
 *   embark  — land onto your own empty ship
 *   seize   — onto an enemy's empty ship (it becomes yours)
 *   boarded — capture the passenger of an enemy ship (it becomes yours)
 *   land    — off a ship onto land, no capture
 *   raid    — off a ship onto land, capturing
 *
 * @param {Array|null} fromCell
 * @param {Array|null} toCell
 * @param {string} moverId
 * @param {boolean} captures  Does the move capture a piece?
 * @returns {null | {kind:string, shipId:string, previousController:string|null, landOwner:string|null}}
 */
function classifyMove(fromCell, toCell, moverId, captures) {
	const fromShip = shipAt(fromCell);
	const toShip = shipAt(toCell);
	if (toShip) {
		const previousController = toShip.player != null ? String(toShip.player) : null;
		let kind = 'embark';
		if (captures) kind = 'boarded';
		else if (previousController !== String(moverId)) kind = 'seize';
		return { kind, shipId: String(toShip.shipId), previousController, landOwner: null };
	}
	if (fromShip) {
		return {
			kind: captures ? 'raid' : 'land',
			shipId: String(fromShip.shipId),
			previousController: fromShip.player != null ? String(fromShip.player) : null,
			landOwner: landOwnerOf(toCell),
		};
	}
	return null;
}

/**
 * A fresh ship item. A battle ship carries its `battleId`; a ship of the
 * shared world has none and is marked `world: true` instead.
 */
function makeShipItem({ shipId, player, battleId = null, homeSeatId, color = null, readyAt = 0 }) {
	const item = {
		type: SHIP.TYPE,
		shipId: String(shipId),
		player: String(player),
		homeSeatId: String(homeSeatId),
		readyAt: Number(readyAt) || 0,
	};
	if (battleId != null) item.battleId = String(battleId);
	else item.world = true;
	if (color != null) item.color = color;
	return item;
}

module.exports = {
	SHIP,
	SHIP_REJECTIONS,
	isShipItem,
	isWorldShipItem,
	shipAt,
	cellHasShip,
	isLandCell,
	mayBoard,
	isRowing,
	controls,
	isWater,
	isMoored,
	HEADINGS,
	headingAt,
	shipHeading,
	deckSquare,
	isShipMoored,
	deckMove,
	sailMaxOf,
	sailTargets,
	validateSail,
	canSailAny,
	chessMoveVeto,
	pathBlockedByShip,
	landOwnerOf,
	classifyMove,
	makeShipItem,
};
