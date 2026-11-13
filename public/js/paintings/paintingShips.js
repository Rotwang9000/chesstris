/**
 * Longship moments (Viking battles): which ship events become paintings.
 *
 * Ship events reach the director as the `tetches:ship` window event
 * (networkEvents dispatches one for every `ship_*` event and for every
 * `chess_move` carrying `.ship`) and, as a fallback, straight from the
 * raw handlers. The same event may therefore arrive twice: each is
 * keyed (`shipEventKey`) and a repeat is ignored, so it is painted, and
 * the voyage bookkeeping moves, exactly once.
 *
 * The scenes (slot `ship.<scene>`, see paintingCatalogue.js):
 *   embark     a piece steps aboard its own ship          (chess_move ship.kind 'embark')
 *   lifeboat   …from a square the sea takes within 10 s    (embark + the sea's schedule)
 *   setsail    the first laden sail of a voyage            ('sailed' with a passenger;
 *              a voyage starts at embark, empty sails never paint)
 *   landing    ship to ENEMY land, no capture              ('land', landOwner an enemy)
 *   raid       ship to land with a capture                 ('raid')
 *   raidcheck  a check by a piece that landed ≤ 30 s ago   (chess_check)
 *   boarded    a passenger captured                        ('boarded')
 *   seized     an empty enemy ship taken                   ('seized', kind 'seize')
 *   lost       the sea takes a ship with its passenger     ('sunk', passengerId)
 *   emptysunk  …an empty one                               ('sunk', no passenger)
 *   newkeel    a ship rebuilt at the mooring               ('built')
 * A QUEEN landing or raiding is instead her arrival (`arrival.queen`,
 * the owner's centrepiece), which outranks every ship scene.
 * `ship_lost` never paints: it follows a sinking or a seizure that
 * already did ('seized' reason) or a king's fall ('destroyed').
 *
 * Only moments with the viewer on one side are painted. The moment uses
 * the director's attacker/victim fields: `attackerId` is whoever acted
 * (or whose ship it is), `victimId` the other side.
 *
 * Pure (time and board come in through `ctx`), tested in
 * tests/ui/paintings.test.js.
 */

import { normalisePieceType } from './paintingCatalogue.js';

/** A ship painting that waited longer than this is let go (spec: 3 s). */
export const SHIP_STALE_MS = 3000;
/** A check this soon after the attacker came ashore is a raider's check. */
export const RAIDCHECK_WINDOW_MS = 30000;
/** Boarding from a square the sea takes this soon is taking to the boats. */
export const LIFEBOAT_WINDOW_MS = 10000;
/**
 * A great moment between two other warlords (a ship seized, lost with
 * all hands, boarded, a new keel) is shown as smaller "news from afar",
 * at most once in this long, so the fjord's story is told even when the
 * viewer is not in it.
 */
export const DISTANT_GAP_MS = 60000;
export const DISTANT_SCENES = Object.freeze(['seized', 'lost', 'boarded', 'newkeel']);
/** How long an event key is remembered (double delivery is immediate). */
const EVENT_TTL_MS = 60000;

export const SHIP_SCENES = Object.freeze([
	'embark', 'setsail', 'landing', 'raid', 'raidcheck', 'boarded',
	'seized', 'lifeboat', 'lost', 'emptysunk', 'newkeel',
]);

const MOVE_KINDS = new Set(['embark', 'seize', 'boarded', 'land', 'raid']);

function same(a, b) {
	return a != null && b != null && String(a) === String(b);
}

function str(v) {
	return v == null ? '' : String(v);
}

function xz(p) {
	return p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.z)) ? `${p.x},${p.z}` : '?';
}

/**
 * One shape for every way a ship event can arrive.
 *
 * `ship_seized` has a `kind` of its own ('seize'|'boarded'), which
 * collides with the dispatch's `kind` whichever way round the payload
 * is spread — so it is recognised by its fields (`byPieceId` + `at`),
 * and a passenger captured means 'boarded'.
 *
 * @returns {null | {type:string, ...}}
 */
export function normaliseShipEvent(detail) {
	if (!detail || typeof detail !== 'object') return null;
	const move = detail.move && typeof detail.move === 'object' ? detail.move : null;
	if (move) {
		const kind = move.ship?.kind || detail.kind;
		if (!MOVE_KINDS.has(kind)) return null;
		return { type: 'move', kind, move, shipId: str(move.ship?.shipId ?? detail.shipId) };
	}
	if (detail.byPieceId != null && detail.at && typeof detail.at === 'object') {
		const seizeKind = detail.capturedPieceId != null ? 'boarded' : 'seize';
		return { ...detail, type: 'seized', seizeKind, shipId: str(detail.shipId) };
	}
	const kind = detail.kind;
	if (!['sailed', 'sunk', 'lost', 'built'].includes(kind)) return null;
	return { ...detail, type: kind, shipId: str(detail.shipId) };
}

/** A stable identity for one server event, however it was delivered. */
export function shipEventKey(ev) {
	if (!ev) return null;
	switch (ev.type) {
		case 'move': {
			const m = ev.move;
			return `move:${ev.kind}:${ev.shipId}:${str(m.movedPiece?.id)}:${xz(m.movedFrom)}>${xz(m.movedTo)}`;
		}
		case 'sailed': return `sailed:${ev.shipId}:${xz(ev.from)}>${xz(ev.to)}:${str(ev.readyAt)}`;
		case 'seized': return `seized:${ev.shipId}:${str(ev.byPieceId)}:${xz(ev.at)}`;
		case 'sunk': return `sunk:${ev.shipId}`;
		case 'lost': return `lost:${ev.shipId}:${str(ev.seatId)}:${str(ev.rebuildAt)}`;
		case 'built': return `built:${ev.shipId}:${xz(ev)}`;
		default: return null;
	}
}

function pieceTypeOf(pieces, id) {
	if (id == null || !Array.isArray(pieces)) return null;
	const p = pieces.find(q => q && same(q.id, id));
	return p ? normalisePieceType(p.type) : null;
}

/** The ship item in a cell array (board.cells["x,z"]), if any. */
function shipItemAt(cells, x, z) {
	const cell = cells && typeof cells === 'object' ? cells[`${x},${z}`] : null;
	const list = Array.isArray(cell) ? cell : (cell ? [cell] : []);
	return list.find(item => item && item.type === 'ship') || null;
}

/**
 * Whose land a square is, from the board (a home or built cell's
 * owner) — for a landing whose move did not name it.
 */
function landOwnerAt(cells, to) {
	if (!to || !cells || typeof cells !== 'object') return null;
	const cell = cells[`${to.x},${to.z}`];
	const list = Array.isArray(cell) ? cell : (cell ? [cell] : []);
	for (const item of list) {
		if (!item || item.type === 'chess' || item.type === 'ship' || item.type === 'specialMarker') continue;
		if (item.player != null) return str(item.player);
	}
	return null;
}

/**
 * Remembers what painting a ship event needs to know about the ones
 * before it: voyages (embark → first laden sail), who controls each
 * ship, who came ashore when, and the events already handled.
 */
export class ShipMoments {
	constructor() {
		this.reset();
	}

	/** A new battle: forget everything. */
	reset() {
		this.voyages = new Map();   // shipId → { pieceId, pieceType, sailed }
		this.owners = new Map();    // shipId → controlling seat
		this.landed = new Map();    // pieceId → { at, player }
		this.seen = new Map();      // event key → time handled
		this.lastDistantAt = -Infinity;
	}

	/**
	 * A ship event in, a painting moment (or null) out.
	 *
	 * @param {Object} detail  the `tetches:ship` detail (or the same shape)
	 * @param {Object} ctx
	 * @param {string} ctx.localId
	 * @param {number} ctx.now
	 * @param {Object} [ctx.cells]   gameState.board.cells
	 * @param {Array}  [ctx.pieces]  gameState.chessPieces
	 * @param {Function} [ctx.sinkInMs] (x, z) → ms until the sea takes the
	 *   square, or null when there is no sea
	 * @returns {Object|null}
	 */
	fromShipEvent(detail, ctx = {}) {
		const ev = normaliseShipEvent(detail);
		if (!ev) return null;
		const now = Number.isFinite(ctx.now) ? ctx.now : Date.now();
		const key = shipEventKey(ev);
		this.forget(now);
		if (key) {
			if (this.seen.has(key)) return null;
			this.seen.set(key, now);
		}
		const scene = this.apply(ev, ctx, now);
		if (!scene) return null;
		const { attackerId, victimId } = scene;
		if (!same(attackerId, ctx.localId) && !same(victimId, ctx.localId)) {
			// News from afar: a great moment between two others, now and then.
			if (!DISTANT_SCENES.includes(scene.scene) || attackerId == null) return null;
			if (now - this.lastDistantAt < DISTANT_GAP_MS) return null;
			this.lastDistantAt = now;
			return { staleMs: SHIP_STALE_MS, extra: 0, dedupeKey: `ship:${key}`, ...scene, distant: true };
		}
		return { staleMs: SHIP_STALE_MS, extra: 0, dedupeKey: `ship:${key}`, ...scene };
	}

	/**
	 * `chess_check` `{ attackerId, attackerPieceId, defenderId }`: a raider's
	 * check when the attacking piece came ashore within RAIDCHECK_WINDOW_MS.
	 */
	fromCheck(payload, ctx = {}) {
		const now = Number.isFinite(ctx.now) ? ctx.now : Date.now();
		const { attackerId, attackerPieceId, defenderId } = payload || {};
		if (attackerPieceId == null) return null;
		const landing = this.landed.get(str(attackerPieceId));
		if (!landing || now - landing.at > RAIDCHECK_WINDOW_MS) return null;
		if (!same(attackerId, ctx.localId) && !same(defenderId, ctx.localId)) return null;
		return {
			kind: 'ship',
			scene: 'raidcheck',
			dedupeKey: `ship:raidcheck:${str(attackerPieceId)}:${str(defenderId)}`,
			attackerId,
			victimId: defenderId,
			pieceType: normalisePieceType(landing.pieceType),
			staleMs: SHIP_STALE_MS,
			extra: 0,
		};
	}

	forget(now) {
		for (const [key, at] of this.seen) {
			if (now - at > EVENT_TTL_MS) this.seen.delete(key);
		}
		for (const [id, landing] of this.landed) {
			if (now - landing.at > RAIDCHECK_WINDOW_MS) this.landed.delete(id);
		}
	}

	startVoyage(shipId, pieceId, pieceType) {
		this.voyages.set(shipId, { pieceId: str(pieceId), pieceType: normalisePieceType(pieceType), sailed: false });
	}

	/** Update the bookkeeping; return the scene (attacker/victim fields) or null. */
	apply(ev, ctx, now) {
		const shipId = ev.shipId;
		switch (ev.type) {
			case 'move': return this.applyMove(ev, ctx, now);

			case 'sailed': {
				if (ev.playerId != null) this.owners.set(shipId, str(ev.playerId));
				// An empty sail is no voyage, and never painted.
				if (ev.passengerId == null) { this.voyages.delete(shipId); return null; }
				let voyage = this.voyages.get(shipId);
				if (!voyage || !same(voyage.pieceId, ev.passengerId)) {
					// Joined mid-voyage (or missed the embark): this sail starts it.
					this.startVoyage(shipId, ev.passengerId, pieceTypeOf(ctx.pieces, ev.passengerId));
					voyage = this.voyages.get(shipId);
				}
				if (voyage.sailed) return null;
				voyage.sailed = true;
				return {
					kind: 'ship', scene: 'setsail', attackerId: ev.playerId, victimId: null,
					pieceType: voyage.pieceType || pieceTypeOf(ctx.pieces, ev.passengerId),
				};
			}

			case 'seized': {
				const loser = ev.from != null ? str(ev.from) : this.owners.get(shipId) || null;
				if (ev.to != null) this.owners.set(shipId, str(ev.to));
				// A passenger captured is painted from the move ('boarded'),
				// which knows both pieces.
				if (ev.seizeKind !== 'seize') return null;
				return {
					kind: 'ship', scene: 'seized', attackerId: ev.to, victimId: loser,
					pieceType: pieceTypeOf(ctx.pieces, ev.byPieceId),
				};
			}

			case 'sunk': {
				const item = shipItemAt(ctx.cells, ev.x, ev.z);
				const owner = item?.player != null ? str(item.player) : this.owners.get(shipId) || null;
				const voyage = this.voyages.get(shipId);
				this.voyages.delete(shipId);
				this.owners.delete(shipId);
				const laden = ev.passengerId != null;
				return {
					kind: 'ship', scene: laden ? 'lost' : 'emptysunk', attackerId: owner, victimId: null,
					pieceType: laden ? (voyage?.pieceType || pieceTypeOf(ctx.pieces, ev.passengerId)) : null,
				};
			}

			case 'lost':
				// Reported after the sinking / seizure / king's fall that
				// already painted (or not) — never a painting of its own.
				this.voyages.delete(shipId);
				return null;

			case 'built':
				if (ev.seatId != null) this.owners.set(shipId, str(ev.seatId));
				this.voyages.delete(shipId);
				return { kind: 'ship', scene: 'newkeel', attackerId: ev.seatId, victimId: null };

			default:
				return null;
		}
	}

	applyMove(ev, ctx, now) {
		const { move, kind, shipId } = ev;
		const mover = move.playerId != null ? str(move.playerId) : null;
		const piece = move.movedPiece || {};
		const pieceType = normalisePieceType(piece.type);
		const captured = move.capturedPiece || null;
		const landOwner = move.ship?.landOwner != null ? str(move.ship.landOwner)
			: ((kind === 'land' || kind === 'raid') ? landOwnerAt(ctx.cells, move.movedTo) : null);

		switch (kind) {
			case 'embark': {
				if (mover) this.owners.set(shipId, mover);
				this.startVoyage(shipId, piece.id, pieceType);
				const from = move.movedFrom;
				const sinkIn = typeof ctx.sinkInMs === 'function' && from ? ctx.sinkInMs(from.x, from.z) : null;
				const fleeing = Number.isFinite(sinkIn) && sinkIn > 0 && sinkIn <= LIFEBOAT_WINDOW_MS;
				return { kind: 'ship', scene: fleeing ? 'lifeboat' : 'embark', attackerId: mover, victimId: null, pieceType };
			}

			case 'seize':
				// Painted from `ship_seized` (sent first), which names the loser.
				if (mover) this.owners.set(shipId, mover);
				this.startVoyage(shipId, piece.id, pieceType);
				return null;

			case 'boarded': {
				const loser = captured?.player != null ? str(captured.player) : this.owners.get(shipId) || null;
				if (mover) this.owners.set(shipId, mover);
				this.startVoyage(shipId, piece.id, pieceType);
				return {
					kind: 'ship', scene: 'boarded', attackerId: mover, victimId: loser,
					pieceType, victimType: normalisePieceType(captured?.type),
					// The same capture as the chess_capture that follows: one card.
					...(captured?.id != null ? { dedupeKey: `piece:${captured.id}` } : {}),
				};
			}

			case 'land':
			case 'raid': {
				this.voyages.delete(shipId);
				if (piece.id != null) this.landed.set(str(piece.id), { at: now, player: mover, pieceType });
				const raid = kind === 'raid';
				const hostOwner = landOwner && !same(landOwner, mover) ? landOwner : null;
				const victimId = raid ? (captured?.player != null ? str(captured.player) : hostOwner) : hostOwner;
				const capturedKey = raid && captured?.id != null ? { dedupeKey: `piece:${captured.id}` } : {};
				if (pieceType === 'queen') {
					return {
						kind: 'arrival', pieceType: 'queen', viaShip: true, raid,
						attackerId: mover, victimId, playerId: mover,
						victimType: normalisePieceType(captured?.type),
						...capturedKey,
					};
				}
				// Coming home to your own shore is no landing.
				if (!raid && !hostOwner) return null;
				return {
					kind: 'ship', scene: raid ? 'raid' : 'landing', attackerId: mover, victimId,
					pieceType, victimType: normalisePieceType(captured?.type),
					...capturedKey,
				};
			}

			default:
				return null;
		}
	}
}
