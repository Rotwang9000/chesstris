/**
 * Territory helpers — small, focused utilities for "where on this
 * player's land should X happen?" questions. Kept separate from the
 * bigger IslandManager so callers don't have to spin up a class
 * instance just to ask for a fallback spawn cell.
 */

const SAFE_PIECE_TYPES = new Set([
	'tetromino', 'home', // these are valid "owned territory" markers
]);

/**
 * Locate the player's king on the board.
 *
 * @param {Object} world
 * @param {string} playerId
 * @returns {{x:number, z:number} | null}
 */
function findKingPosition(world, playerId) {
	if (!world || !Array.isArray(world.chessPieces)) return null;
	const pid = String(playerId);
	for (const piece of world.chessPieces) {
		if (!piece || String(piece.player) !== pid) continue;
		if (String(piece.type || '').toUpperCase() !== 'KING') continue;
		const pos = piece.position || piece;
		if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.z)) {
			return { x: pos.x, z: pos.z };
		}
	}
	return null;
}

/**
 * Is `(x, z)` an owned-territory cell for `playerId`?
 *
 * "Owned" = the cell has at least one of {`tetromino`, `home`}
 * content item belonging to the player. We deliberately exclude
 * cells that ONLY contain a chess marker — those are footholds the
 * piece is standing on, but they're transient and we don't want to
 * spawn a redeem-piece on top of someone (the caller is responsible
 * for skipping occupied chess cells anyway).
 */
function isOwnedTerritory(world, x, z, playerId) {
	if (!world || !world.board || !world.board.cells) return false;
	const cell = world.board.cells[`${x},${z}`];
	if (!Array.isArray(cell) || cell.length === 0) return false;
	const pid = String(playerId);
	return cell.some(item =>
		item
		&& SAFE_PIECE_TYPES.has(item.type)
		&& String(item.player) === pid
	);
}

/**
 * Find the player's owned cell that is closest to their king (or to
 * `targetPosition` if provided). Tie-broken by lower x then lower z
 * so the result is deterministic across snapshots.
 *
 * Returns `null` if the player has no king and no `targetPosition`,
 * or if they have no owned cells. Optionally pass a `predicate(cell)`
 * to filter candidates (e.g. "skip cells with a chess piece on them").
 *
 * @param {Object} world
 * @param {string} playerId
 * @param {Object} [opts]
 * @param {{x:number, z:number}} [opts.target]    Defaults to king position.
 * @param {(x:number, z:number) => boolean} [opts.skip] Return `true` to skip a cell.
 * @returns {{x:number, z:number} | null}
 */
function findNearestOwnedCell(world, playerId, opts = {}) {
	if (!world || !playerId) return null;
	const target = opts.target || findKingPosition(world, playerId);
	if (!target) return null;
	const pid = String(playerId);
	const skip = typeof opts.skip === 'function' ? opts.skip : null;

	let best = null;
	let bestDistSq = Infinity;
	for (const [key, cell] of Object.entries(world.board.cells || {})) {
		if (!Array.isArray(cell) || cell.length === 0) continue;
		const ownsCell = cell.some(item =>
			item
			&& SAFE_PIECE_TYPES.has(item.type)
			&& String(item.player) === pid
		);
		if (!ownsCell) continue;
		const [xs, zs] = key.split(',');
		const x = Number(xs);
		const z = Number(zs);
		if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
		if (skip && skip(x, z)) continue;
		const dx = x - target.x;
		const dz = z - target.z;
		const distSq = dx * dx + dz * dz;
		if (distSq < bestDistSq
			|| (distSq === bestDistSq && best && (x < best.x || (x === best.x && z < best.z)))
		) {
			best = { x, z };
			bestDistSq = distSq;
		}
	}
	return best;
}

/**
 * Does the cell at `(x, z)` currently host any chess piece (regardless
 * of owner)? Used by the redeem flow to avoid landing a new piece on
 * top of an existing one.
 */
function cellHasChessPiece(world, x, z) {
	if (!world || !world.board || !world.board.cells) return false;
	const cell = world.board.cells[`${x},${z}`];
	if (!Array.isArray(cell)) return false;
	return cell.some(item => item && item.type === 'chess');
}

module.exports = {
	findKingPosition,
	isOwnedTerritory,
	findNearestOwnedCell,
	cellHasChessPiece,
};
