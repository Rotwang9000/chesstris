/**
 * Longships on the client: the generated rules mirror
 * (js/viking/shipRulesClient.js) fed with the client's own board and
 * sea maths, plus the pure helpers the controls build on.
 *
 * Nothing here touches THREE or the DOM, so it is unit-tested directly
 * (tests/ui/longshipControls.test.js) and the highlights a player sees
 * equal what the server's moveValidation / ships.sail will accept.
 *
 * Ship rules apply only inside a Viking battle, exactly like the
 * server's `_shipRulesApply`: the shared world and standard battles
 * never meet a ship, and their move lists are left untouched.
 */

import {
	SHIP,
	SHIP_REJECTIONS,
	shipAt,
	cellHasShip,
	isRowing,
	sailTargets,
	validateSail,
	chessMoveVeto,
	classifyMove,
	isMoored,
} from '../viking/shipRulesClient.js';
import { seaSinkAt, battlePlayRadius } from '../battle/battleRules.js';

export { SHIP, SHIP_REJECTIONS };

// ── Clock ────────────────────────────────────────────────────────────────────
// `readyAt` is server epoch ms. Each sail tells us the server's "now"
// (readyAt - ROW_LOCK_MS at the moment it was sent), which is a better
// offset than nothing in a Classic battle (no sea clock to borrow).

let shipClockOffset = null;

/** Note a server timestamp that was "now" on the server when sent. */
export function noteServerNow(serverMs, localMs = Date.now()) {
	const n = Number(serverMs);
	if (!Number.isFinite(n)) return;
	shipClockOffset = n - localMs;
}

/** Note a fresh sail's readyAt (the sail happened ROW_LOCK_MS before it). */
export function noteSailReadyAt(readyAt, localMs = Date.now()) {
	const n = Number(readyAt);
	if (!Number.isFinite(n) || n <= 0) return;
	noteServerNow(n - SHIP.ROW_LOCK_MS, localMs);
}

/** Forget the learnt offset (tests, leaving a battle). */
export function resetShipClock() {
	shipClockOffset = null;
}

/** Best guess at the server's clock. */
export function shipServerNow(gameState, localMs = Date.now()) {
	if (shipClockOffset !== null) return localMs + shipClockOffset;
	const seaOffset = Number(gameState?.activeBattle?.sea?.clockOffset);
	return localMs + (Number.isFinite(seaOffset) ? seaOffset : 0);
}

// ── Environment ──────────────────────────────────────────────────────────────

/** Do the ship rules apply to the local player right now? */
export function shipRulesActive(gameState) {
	return gameState?.activeBattle?.edition === 'viking';
}

/** A board cell as an item array (the client sees arrays, rarely {contents}). */
export function cellItems(gameState, x, z) {
	const cell = gameState?.board?.cells?.[`${x},${z}`];
	if (!cell) return null;
	if (Array.isArray(cell)) return cell;
	if (Array.isArray(cell.contents)) return cell.contents;
	if (typeof cell === 'object' && cell.type) return [cell];
	return null;
}

function radialBand(centre, x, z) {
	const dx = x - centre.x;
	const dz = z - centre.z;
	return Math.round(Math.sqrt(dx * dx + dz * dz));
}

/**
 * The accessors the pure rules take, bound to the client's board, the
 * active battle's arena and its sea. Mirrors server/battle/ships.js
 * `boardEnv`.
 */
export function shipEnv(gameState, now = shipServerNow(gameState)) {
	const battle = gameState?.activeBattle || null;
	const radius = battlePlayRadius(battle);
	let standing = null;
	return {
		now,
		getCell: (x, z) => cellItems(gameState, x, z),
		isInsidePlayArea: (x, z) => !!(battle && battle.centre)
			&& radialBand(battle.centre, x, z) <= radius,
		isSunk: (x, z) => seaSinkAt(battle, x, z) <= now,
		hasPiece: (x, z) => {
			if (!standing) {
				standing = new Set();
				for (const p of gameState?.chessPieces || []) {
					const pos = p?.position;
					if (pos) standing.add(`${Number(pos.x)},${Number(pos.z)}`);
				}
			}
			return standing.has(`${x},${z}`);
		},
	};
}

// ── Ships on the board ──────────────────────────────────────────────────────

/**
 * Every ship in the active battle's arena: `{ship, x, z, passenger}`.
 * Scans the arena disc only (a few hundred lookups), not the world.
 */
export function listShips(gameState) {
	const out = [];
	const battle = gameState?.activeBattle;
	const cells = gameState?.board?.cells;
	if (!cells) return out;
	const pieceAt = new Map();
	for (const p of gameState?.chessPieces || []) {
		const pos = p?.position;
		if (pos) pieceAt.set(`${Number(pos.x)},${Number(pos.z)}`, p);
	}
	const visit = (key) => {
		const cell = cells[key];
		const items = Array.isArray(cell) ? cell : (Array.isArray(cell?.contents) ? cell.contents : null);
		const ship = shipAt(items);
		if (!ship) return;
		const [x, z] = key.split(',').map(Number);
		out.push({ ship, x, z, passenger: pieceAt.get(key) || null });
	};
	if (battle && battle.centre) {
		const r = battlePlayRadius(battle) + 1;
		for (let dx = -r; dx <= r; dx++) {
			for (let dz = -r; dz <= r; dz++) visit(`${battle.centre.x + dx},${battle.centre.z + dz}`);
		}
	} else {
		for (const key of Object.keys(cells)) visit(key);
	}
	out.sort((a, b) => String(a.ship.shipId).localeCompare(String(b.ship.shipId), undefined, { numeric: true }));
	return out;
}

/** The ships a player controls, in a stable order. */
export function shipsControlledBy(gameState, playerId) {
	if (playerId == null) return [];
	return listShips(gameState).filter(e => String(e.ship.player) === String(playerId));
}

/** The ship entry at (x, z), or null. */
export function shipEntryAt(gameState, x, z) {
	const ship = shipAt(cellItems(gameState, x, z));
	if (!ship) return null;
	const passenger = (gameState?.chessPieces || []).find(
		p => p?.position && Number(p.position.x) === x && Number(p.position.z) === z,
	) || null;
	return { ship, x, z, passenger };
}

/** The ship entry with this id, or null. */
export function findShip(gameState, shipId) {
	if (shipId == null) return null;
	return listShips(gameState).find(e => String(e.ship.shipId) === String(shipId)) || null;
}

/** Milliseconds left on the rowing lock (0 when ready). */
export function rowingMsLeft(ship, now) {
	if (!ship) return 0;
	return Math.max(0, Number(ship.readyAt) - now);
}

// ── Sail lanes ───────────────────────────────────────────────────────────────

/**
 * Where the ship can sail this leg: `{lanes, reason}`. `lanes` is every
 * legal destination (`{x, z, distance}`), `reason` explains an empty
 * list ('ship_rowing' | 'passenger_cannot_sail' | 'no_water' | null).
 */
export function laneTargets(gameState, entry, now = shipServerNow(gameState)) {
	if (!entry || !entry.ship) return { lanes: [], reason: 'no_ship' };
	if (isRowing(entry.ship, now)) return { lanes: [], reason: 'ship_rowing' };
	const type = String(entry.passenger?.type || '').toUpperCase();
	if (entry.passenger && SHIP.NO_BOARD.includes(type)) return { lanes: [], reason: 'passenger_cannot_sail' };
	const lanes = sailTargets(shipEnv(gameState, now), { x: entry.x, z: entry.z });
	return { lanes, reason: lanes.length ? null : 'no_water' };
}

/** Would the server accept this sail? `{ok}` or `{ok:false, reason, message}`. */
export function checkSail(gameState, entry, to, now = shipServerNow(gameState)) {
	if (!entry) return { ok: false, reason: 'no_ship', message: SHIP_REJECTIONS.no_ship };
	return validateSail(shipEnv(gameState, now), entry.ship, { x: entry.x, z: entry.z }, to, now);
}

// ── Chess moves ──────────────────────────────────────────────────────────────

function isSquareShip(gameState, x, z) {
	return cellHasShip(cellItems(gameState, x, z));
}

/**
 * Is the straight path between from and to (exclusive) blocked by a
 * ship? Knights jump; everyone else slides (a king's step has no
 * squares between, its castle walk is handled separately).
 */
function slidePathHitsShip(gameState, from, to) {
	const dx = Math.sign(to.x - from.x);
	const dz = Math.sign(to.z - from.z);
	const adx = Math.abs(to.x - from.x);
	const adz = Math.abs(to.z - from.z);
	if (!(adx === 0 || adz === 0 || adx === adz)) return false; // not a line
	for (let x = from.x + dx, z = from.z + dz; x !== to.x || z !== to.z; x += dx, z += dz) {
		if (isSquareShip(gameState, x, z)) return true;
	}
	return false;
}

/** Castling: the walk from the king towards its rook stops at a ship. */
function castleWalkHitsShip(gameState, from, to, pieceAt) {
	const dx = Math.sign(to.x - from.x);
	const dz = Math.sign(to.z - from.z);
	let x = from.x + dx;
	let z = from.z + dz;
	for (let i = 0; i < 8; i++) {
		if (!cellItems(gameState, x, z)) return false;
		if (isSquareShip(gameState, x, z)) return true;
		if (pieceAt(x, z)) return false;
		x += dx;
		z += dz;
	}
	return false;
}

/**
 * Why the server would refuse this otherwise-legal move because of a
 * ship, or null. Same order as moveValidation.validateChessMove: the
 * veto (boarding, rowing, mooring, no king attacks from aboard), then
 * ships as non-path squares.
 *
 * @returns {null | {reason:string, message:string}}
 */
export function shipMoveRefusal(gameState, piece, move, { now = shipServerNow(gameState), pieceAt } = {}) {
	const from = { x: Number(piece.position.x), z: Number(piece.position.z) };
	const to = { x: Number(move.x), z: Number(move.z) };
	const lookup = pieceAt || ((x, z) => (gameState?.chessPieces || []).find(
		p => p?.position && Number(p.position.x) === x && Number(p.position.z) === z) || null);
	const occupant = lookup(to.x, to.z);
	const target = occupant ? { pieceType: occupant.type, player: occupant.player } : null;
	const env = { getCell: (x, z) => cellItems(gameState, x, z), now };
	const veto = chessMoveVeto(env, piece, from, to, target);
	if (veto) return veto;
	const type = String(piece.type || '').toUpperCase();
	if (type === 'KNIGHT') return null;
	const castle = type === 'KING' && (Math.abs(to.x - from.x) === 2 || Math.abs(to.z - from.z) === 2);
	const blocked = castle
		? castleWalkHitsShip(gameState, from, to, lookup)
		: slidePathHitsShip(gameState, from, to);
	if (blocked) return { reason: 'path_blocked_by_ship', message: SHIP_REJECTIONS.path_blocked_by_ship };
	return null;
}

/**
 * Split a geometric move list into what the server accepts and what a
 * ship rule refuses. Outside Viking battles every move is kept and the
 * list is returned as is.
 *
 * @returns {{moves:Array, refused:Array<{x:number,z:number,reason:string,message:string}>}}
 */
export function applyShipRules(gameState, piece, moves, options = {}) {
	if (!shipRulesActive(gameState) || !piece?.position || !Array.isArray(moves)) {
		return { moves, refused: [] };
	}
	const now = options.now ?? shipServerNow(gameState);
	const index = new Map();
	for (const p of gameState?.chessPieces || []) {
		const pos = p?.position;
		if (pos) index.set(`${Number(pos.x)},${Number(pos.z)}`, p);
	}
	const pieceAt = (x, z) => index.get(`${x},${z}`) || null;
	const kept = [];
	const refused = [];
	for (const move of moves) {
		const refusal = shipMoveRefusal(gameState, piece, move, { now, pieceAt });
		if (refusal) refused.push({ x: move.x, z: move.z, reason: refusal.reason, message: refusal.message });
		else {
			const kind = classifyMove(
				cellItems(gameState, piece.position.x, piece.position.z),
				cellItems(gameState, move.x, move.z),
				piece.player,
				!!pieceAt(move.x, move.z),
			);
			kept.push(kind ? { ...move, ship: kind.kind } : move);
		}
	}
	return { moves: kept, refused };
}

// ── Words ────────────────────────────────────────────────────────────────────

/** Friendly words for every ship refusal the server can send. */
export const SHIP_REFUSAL_TEXT = Object.freeze({
	cannot_board: 'Kings and pawns cannot board a longship.',
	ship_rowing: 'Your longship is still rowing: your pieces can step on or off once it steadies.',
	ship_not_moored: 'A longship must touch land (diagonals count) to step on or off.',
	aboard_no_king_attack: 'A piece aboard a longship cannot attack a king. Land first.',
	ship_to_ship: 'You cannot step from one longship straight onto another.',
	path_blocked_by_ship: 'A longship blocks the way: pieces cannot slide over it.',
	passenger_cannot_sail: 'A king or pawn aboard cannot be rowed away: it must step ashore.',
	not_your_ship: 'That is not your longship.',
	no_ship: 'That longship is gone.',
	bad_sail: 'A longship sails 1 to 5 squares in a straight line.',
	not_water: 'A longship can only sail across open water.',
	not_viking: 'Longships only sail in Viking battles.',
	not_registered: 'Not connected to the battle yet. Try again in a moment.',
	eliminated: 'Your warlord has fallen: your longship cannot sail.',
	paused: 'You are paused. Press Resume to sail.',
	server_error: 'The longship could not sail. Please try again.',
	no_water: 'No open water to sail to from here.',
	timeout: 'No answer from the server. Try again.',
});

/** The words for a refusal reason (or the server's own message). */
export function shipRefusalText(reason, fallback = null) {
	return SHIP_REFUSAL_TEXT[reason] || fallback || 'The longship could not do that.';
}

/**
 * The hint when you select your own piece and it has nowhere to step,
 * in a Viking battle — or null when ships have nothing to do with it
 * (the caller then gives its ordinary "nowhere to go yet").
 *
 *   • aboard a ship that is still rowing: it says so, and when the crew
 *     can step off (or the ship sail on);
 *   • a move a ship rule refuses (not moored, a rowing ship to board):
 *     that rule, plus the way to sail when the ship can;
 *   • aboard with sail lanes: no square ashore from here, sail.
 *
 * @param {Object} gameState
 * @param {{type?:string, position:{x:number,z:number}}} piece
 * @param {Object} [opts]
 * @param {Array<{reason:string,message?:string}>} [opts.refused] gameState.shipRefusedMoves
 * @param {number} [opts.lanes] how many sail lanes are showing
 * @param {boolean} [opts.touch] a finger (tap) rather than a mouse (click)
 * @param {number} [opts.now] server ms
 * @returns {string|null}
 */
export function noMoveShipTip(gameState, piece, {
	refused = [], lanes = 0, touch = false, now = shipServerNow(gameState),
} = {}) {
	const sailHint = `${touch ? 'Tap' : 'Click'} a tile on the water to sail.`;
	const pos = piece?.position;
	const x = Number(pos?.x);
	const z = Number(pos?.z);
	const entry = pos && Number.isFinite(x) && Number.isFinite(z) ? shipEntryAt(gameState, x, z) : null;
	const getCell = (a, b) => cellItems(gameState, a, b);

	if (entry && rowingMsLeft(entry.ship, now) > 0) {
		const secs = Math.max(1, Math.ceil(rowingMsLeft(entry.ship, now) / 1000));
		const crew = String(piece.type || '').toLowerCase() || 'crew';
		// Once it steadies, can it sail on? (A king or pawn aboard can't
		// be rowed away; and it needs open water beside it.)
		const sailsOn = !SHIP.NO_BOARD.includes(String(piece.type || '').toUpperCase())
			&& sailTargets(shipEnv(gameState, now), { x, z }).length > 0;
		if (isMoored(getCell, x, z)) {
			return `Your longship is still rowing: your ${crew} can step off in ${secs} s${sailsOn ? ', or sail on' : ''}.`;
		}
		return sailsOn
			? `Your longship is still rowing: it can sail on in ${secs} s. Your ${crew} steps off once it touches land.`
			: `Your longship is still rowing (${secs} s). Your ${crew} steps off once it touches land.`;
	}
	if (refused.length > 0) {
		const why = refused.find(m => m.reason === 'ship_rowing')
			|| refused.find(m => m.reason === 'ship_not_moored')
			|| refused[0];
		const text = SHIP_REFUSAL_TEXT[why.reason] || why.message || shipRefusalText(why.reason);
		return lanes > 0 ? `${text} ${sailHint}` : text;
	}
	if (lanes > 0) {
		return entry && !isMoored(getCell, x, z)
			? `Out at sea: sail next to land to step off. ${sailHint}`
			: `No square to step onto from here. ${sailHint}`;
	}
	return null;
}

/** Is this a ship refusal reason (so a ship toast, not a generic one)? */
export function isShipRefusal(reason) {
	return Object.prototype.hasOwnProperty.call(SHIP_REFUSAL_TEXT, reason);
}
