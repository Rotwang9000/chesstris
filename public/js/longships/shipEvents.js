/**
 * One window event for everything that happens to a longship:
 *
 *   window.addEventListener('tetches:ship', e => e.detail.kind ...)
 *
 * networkEvents dispatches it for every ship_* socket event and for
 * every chess_move that carries `.ship`; the renderer listens for
 * animations, the painting director for paintings, and the controls
 * here for the HUD button and lanes. kind values:
 *
 *   ship_* events     sailed, sunk, seized, lost, built   (payload spread in)
 *   chess_move.ship   embark, land, raid, boarded, seize  ({kind, move})
 */

export const SHIP_EVENT = 'tetches:ship';

/** Socket event name → detail kind. */
export const SHIP_SOCKET_EVENTS = Object.freeze({
	ship_sailed: 'sailed',
	ship_sunk: 'sunk',
	ship_seized: 'seized',
	ship_lost: 'lost',
	ship_built: 'built',
});

const MOVE_KINDS = new Set(['embark', 'land', 'raid', 'boarded', 'seize']);

/** The detail for a ship_* socket event, or null for anything else. */
export function shipSocketDetail(eventName, payload) {
	const kind = SHIP_SOCKET_EVENTS[eventName];
	if (!kind) return null;
	const body = payload && typeof payload === 'object' ? payload : {};
	// ship_seized carries its own kind ('seize' | 'boarded'); `kind` is
	// the event's here, so keep the server's as `seizeKind`.
	if (kind === 'seized' && typeof body.kind === 'string') return { ...body, kind, seizeKind: body.kind };
	return { ...body, kind };
}

/** The detail for a chess_move broadcast, or null when no ship is involved. */
export function chessMoveShipDetail(payload) {
	const kind = payload?.ship?.kind;
	if (!MOVE_KINDS.has(kind)) return null;
	return { kind, move: payload };
}

/** Fire the window event (no-op without a window). */
export function dispatchShipEvent(detail) {
	if (!detail || typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return false;
	try {
		window.dispatchEvent(new CustomEvent(SHIP_EVENT, { detail }));
		return true;
	} catch (_e) {
		return false;
	}
}
