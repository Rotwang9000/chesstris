/**
 * Bundle stub of longships/shipEnv.js (see vikingLazy/runtime.js).
 *
 * `shipRulesActive` and `cellItems` are pure board reads, here in full
 * (the same as shipEnv's; tests/ui/vikingLazy.test.js), so the standard
 * game's clicks and move lists never wait on the Viking chunk. The rest
 * forwards once it is here; before (a Viking battle's first instant),
 * moves onto or across a ship are held back with a "try again" note
 * rather than offered on a ship not drawn yet (the server's rules apply
 * either way).
 */
import { vk, loadViking } from '../../runtime.js';

export function shipRulesActive(gameState) {
	return gameState?.activeBattle?.edition === 'viking';
}

export function cellItems(gameState, x, z) {
	const cell = gameState?.board?.cells?.[`${x},${z}`];
	if (!cell) return null;
	if (Array.isArray(cell)) return cell;
	if (Array.isArray(cell.contents)) return cell.contents;
	if (typeof cell === 'object' && cell.type) return [cell];
	return null;
}

function env() {
	const m = vk('shipEnv');
	if (!m) loadViking();
	return m;
}

/** The words for a move the stub holds back (the chunk's own reasons come later). */
const SHIP_LOADING_TEXT = 'The longships are still coming into view: try that again in a moment.';

function hasShip(gameState, x, z) {
	const items = cellItems(gameState, x, z);
	return Array.isArray(items) && items.some(item => !!(item && item.type === 'ship'));
}

/**
 * Before the chunk: the rules can't be read yet, so hold back what a
 * ship could make illegal — any move onto a ship's square, and (but for
 * a knight's jump) any slide across one. The rest of the list is kept
 * as is; once the chunk is here the full rules apply.
 */
function holdBackShipMoves(gameState, piece, moves) {
	if (!piece?.position || !Array.isArray(moves)) return { moves, refused: [] };
	const from = { x: Number(piece.position.x), z: Number(piece.position.z) };
	const jumps = String(piece.type || '').toUpperCase() === 'KNIGHT';
	const crossesShip = (to) => {
		const dx = Math.sign(to.x - from.x);
		const dz = Math.sign(to.z - from.z);
		const adx = Math.abs(to.x - from.x);
		const adz = Math.abs(to.z - from.z);
		if (!(adx === 0 || adz === 0 || adx === adz)) return false;
		for (let x = from.x + dx, z = from.z + dz; x !== to.x || z !== to.z; x += dx, z += dz) {
			if (hasShip(gameState, x, z)) return true;
		}
		return false;
	};
	const kept = [];
	const refused = [];
	for (const move of moves) {
		const to = { x: Number(move?.x), z: Number(move?.z) };
		if (hasShip(gameState, to.x, to.z) || (!jumps && crossesShip(to))) {
			refused.push({ x: to.x, z: to.z, reason: 'ship_loading', message: SHIP_LOADING_TEXT });
		} else {
			kept.push(move);
		}
	}
	return { moves: kept, refused };
}

export function applyShipRules(gameState, piece, moves, options) {
	if (!shipRulesActive(gameState)) return { moves, refused: [] };
	const m = env();
	return m ? m.applyShipRules(gameState, piece, moves, options) : holdBackShipMoves(gameState, piece, moves);
}

export function shipEntryAt(gameState, x, z) {
	const m = shipRulesActive(gameState) ? env() : vk('shipEnv');
	return m ? m.shipEntryAt(gameState, x, z) : null;
}

export function findShip(gameState, shipId) {
	const m = vk('shipEnv');
	return m ? m.findShip(gameState, shipId) : null;
}

export function noMoveShipTip(gameState, piece, opts) {
	const m = vk('shipEnv');
	if (m) return m.noMoveShipTip(gameState, piece, opts);
	// Boxed in only by moves held back until the ships are drawn.
	return (opts?.refused || []).some(r => r?.reason === 'ship_loading') ? SHIP_LOADING_TEXT : null;
}

/** The refusal words once the chunk is here; before, the server's own message is used. */
export const SHIP_REFUSAL_TEXT = new Proxy(Object.freeze({}), {
	get: (_target, key) => vk('shipEnv')?.SHIP_REFUSAL_TEXT?.[key],
});
