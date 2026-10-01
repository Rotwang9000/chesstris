/**
 * Tetromino placement validation (client-side mirrors of the server's
 * rules in `server/game/TetrominoManager.js`). The server is
 * authoritative; these helpers exist to provide fast local predictions
 * for animation start-up before the server round-trips.
 *
 * Server semantics:
 * - A cell is "occupied" only if it contains any **non-home** content.
 *   Cells holding only home markers do not block placement.
 * - Placement must connect (orthogonal adjacency) to the player's own
 *   territory, with a continuous path back to their king. The first
 *   placement may use home zone adjacency directly.
 */

import { hasPathToKing } from './pathViz.js';
import { isRingItemUsable, isCellInsideOwnArena } from '../battle/battleRules.js';

const ORTHO = [
	[0, -1],
	[0, 1],
	[-1, 0],
	[1, 0],
];

function getCellItems(cell) {
	if (cell === null || cell === undefined) return [];
	if (Array.isArray(cell)) return cell;
	if (typeof cell === 'object' && Array.isArray(cell.contents)) return cell.contents;
	return [cell];
}

/**
 * True if any non-home content in the cell would block placement.
 * Marker-only cells (centre/specialMarker debug overlays) never block.
 */
function cellHasNonHomeContent(cell) {
	const items = getCellItems(cell);
	if (items.length === 0) return false;
	return items.some(item => {
		if (!item) return true;
		if (!item.type && item.specialMarker) return false;
		const t = String(item.type || '');
		return !(t === 'home' || t === 'specialMarker' || t === 'boardCentre');
	});
}

/**
 * Mirror of the server rule (bible §15.3): a cell carrying another
 * player's home marker is off-limits while that player's zone is safe,
 * i.e. still holds one of their chess pieces.
 */
function isEnemySafeHomeCell(gameState, x, z) {
	const cells = gameState?.board?.cells || {};
	const me = String(gameState?.localPlayerId ?? '');
	const owners = new Set(getCellItems(cells[`${x},${z}`])
		.filter(item => item && item.type === 'home' && String(item.player) !== me)
		.map(item => String(item.player)));
	for (const owner of owners) {
		const zone = gameState?.homeZones?.[owner];
		if (!zone || zone.isDegraded) continue;
		const w = zone.width || 8;
		const h = zone.height || 2;
		for (let hz = zone.z; hz < zone.z + h; hz++) {
			for (let hx = zone.x; hx < zone.x + w; hx++) {
				if (getCellItems(cells[`${hx},${hz}`]).some(item => item
					&& item.type === 'chess' && String(item.player) === owner)) {
					return true;
				}
			}
		}
	}
	return false;
}

/**
 * Returns `true` when placing `shape` at `(posX, posZ)` would collide
 * with non-home content, or land inside an opponent's safe home zone.
 */
export function checkTetrominoCollision(gameState, shape, posX, posZ) {
	const cells = gameState?.board?.cells;
	if (!cells) return false;

	for (let z = 0; z < shape.length; z++) {
		for (let x = 0; x < shape[z].length; x++) {
			if (shape[z][x] !== 1) continue;
			const cell = cells[`${posX + x},${posZ + z}`];
			if (cellHasNonHomeContent(cell) || isEnemySafeHomeCell(gameState, posX + x, posZ + z)) {
				if (gameState.debugMode) {
					console.log(`Collision (non-home) at (${posX + x}, ${posZ + z}) with:`, cell);
				}
				return true;
			}
		}
	}
	return false;
}

export function isValidTetrominoPosition(gameState, shape, position) {
	if (!position) return false;
	const collided = checkTetrominoCollision(gameState, shape, position.x, position.z);
	if (collided && gameState?.debugMode) {
		console.log(`Collision detected for tetromino at (${position.x}, ${position.z})`);
	}
	return !collided;
}

/**
 * Fast orthogonal-adjacency check — used both as a stand-alone hint and
 * inside `validatePlacementLocally` below.
 */
export function isTetrominoAdjacentToExistingCells(gameState, shape, posX, posZ) {
	const cells = gameState?.board?.cells;
	if (!cells || Object.keys(cells).length === 0) return true;

	const playerId = gameState?.currentPlayer || gameState?.localPlayerId;
	const playerStr = playerId != null ? String(playerId) : null;

	for (let z = 0; z < shape.length; z++) {
		for (let x = 0; x < shape[z].length; x++) {
			if (!shape[z][x]) continue;
			const blockX = posX + x;
			const blockZ = posZ + z;

			for (const [dx, dz] of ORTHO) {
				const cell = cells[`${blockX + dx},${blockZ + dz}`];
				if (!cell) continue;
				const items = getCellItems(cell);
				const owned = items.some(item =>
					item && ((playerStr && String(item.player) === playerStr)
						|| isRingItemUsable(gameState, item))
				);
				if (owned) return true;
			}
		}
	}
	return false;
}

/**
 * Full local mirror of the server's placement check.  Returns `true` if
 * the tetromino could legally land; `false` otherwise.  The server
 * still has final say — this just lets us start the right animation
 * immediately.
 */
export function validatePlacementLocally(tetrominoData, gameState) {
	if (!tetrominoData || !gameState || !gameState.board) {
		console.error('Missing required data for local validation');
		return false;
	}

	const { shape, position } = tetrominoData;
	const { x: posX, z: posZ } = position;
	const playerId = gameState.currentPlayer;
	const isFirstPlacement = !gameState._hasPlacedTetromino;

	// Battle arenas: every cell of the shape must stay inside the play
	// circle (the ring is the wall).
	for (let z = 0; z < shape.length; z++) {
		for (let x = 0; x < shape[z].length; x++) {
			if (shape[z][x] !== 1) continue;
			if (!isCellInsideOwnArena(gameState, posX + x, posZ + z)) {
				console.log('Local validation: outside battle arena');
				return false;
			}
		}
	}

	if (checkTetrominoCollision(gameState, shape, posX, posZ)) {
		console.log('Local validation: Collision detected');
		return false;
	}

	// Same as the server (TetrominoManager): any of the player's own
	// content — home cells included — counts as adjacent ground on EVERY
	// placement, not just the first. Counting home cells only on the
	// first drop showed red ghosts for drops the server then accepted.
	const isOwnedContent = (item) =>
		(item && String(item.player) === String(playerId))
		|| isRingItemUsable(gameState, item);

	let sawAdjacentPlayerContent = false;

	for (let z = 0; z < shape.length; z++) {
		for (let x = 0; x < shape[z].length; x++) {
			if (shape[z][x] !== 1) continue;

			const blockX = posX + x;
			const blockZ = posZ + z;

			for (const [dx, dz] of ORTHO) {
				const adjX = blockX + dx;
				const adjZ = blockZ + dz;
				const cell = gameState.board.cells?.[`${adjX},${adjZ}`];
				const items = getCellItems(cell);
				if (items.length === 0) continue;

				if (items.some(isOwnedContent)) {
					sawAdjacentPlayerContent = true;
					if (isFirstPlacement) return true;

					try {
						const path = hasPathToKing(gameState, adjX, adjZ, playerId);
						if (path) return true;
					} catch (_) { /* fall through to next adjacency */ }
				}

			}
		}
	}

	if (sawAdjacentPlayerContent) {
		console.log('Local validation: adjacent cells found but none connect to king');
	}
	return false;
}
