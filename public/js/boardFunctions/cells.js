/**
 * Helpers for the sparse board cell store.
 *
 * Cells live on `gameState.board.cells` keyed by `"x,z"`.  Each value
 * may be:
 *   - `null` / `undefined` — empty
 *   - a primitive `number` (legacy encoding)
 *   - an object with a `type` property
 *   - an object with a `contents` array of typed objects
 *   - an array of typed objects (the modern multi-object encoding the
 *     server emits)
 *
 * All helpers below normalise away those shapes.
 */

const MARKER_TYPES = new Set(['specialMarker', 'boardCentre']);

/**
 * Find a specific `contentType` inside a board cell, regardless of
 * which encoding the cell uses.  Returns the matching content object
 * or `null`.
 */
export function extractCellContent(cell, contentType) {
	if (!cell) return null;

	if (typeof cell === 'number') {
		if (contentType === 'chess' && cell >= 11) {
			const player = Math.floor(cell / 10);
			const pieceType = cell % 10;
			return { type: 'chess', player, chessPiece: { type: pieceType, player } };
		}
		if (contentType === 'tetromino' && cell >= 1 && cell <= 5) {
			return { type: 'tetromino', player: cell };
		}
		if (contentType === 'homeZone' && cell >= 6 && cell <= 10) {
			return { type: 'homeZone', player: cell - 5 };
		}
		return null;
	}

	if (Array.isArray(cell)) {
		return cell.find(item => item && item.type === contentType) || null;
	}

	if (typeof cell === 'object') {
		if (cell.type === contentType) return cell;
		if (Array.isArray(cell.contents)) {
			return cell.contents.find(item => item && item.type === contentType) || null;
		}
	}

	return null;
}

/**
 * Returns `true` if the cell at `(x, z)` contains real terrain — i.e.
 * something a chess piece could stand on.  Marker-only cells (centre
 * marker, special debug markers) do NOT count.
 */
export function hasBoardCell(gameState, x, z) {
	const cell = gameState?.board?.cells?.[`${x},${z}`];
	if (!cell) return false;

	if (Array.isArray(cell)) {
		return cell.some(item => item && !MARKER_TYPES.has(item.type));
	}
	if (typeof cell === 'object' && Array.isArray(cell.contents)) {
		return cell.contents.some(item => item && !MARKER_TYPES.has(item.type));
	}
	if (typeof cell === 'object' && cell.type) {
		return !MARKER_TYPES.has(cell.type);
	}
	return typeof cell !== 'undefined';
}

/**
 * Looks up the chess piece (if any) currently at `(x, z)` by scanning
 * `gameState.chessPieces`.  Returns `null` if no piece is there.
 */
export function getChessPieceAt(gameState, x, z) {
	const pieces = gameState?.chessPieces;
	if (!Array.isArray(pieces)) return null;
	for (const p of pieces) {
		if (!p) continue;
		const pos = p.position || p;
		if (!pos) continue;
		if (Number(pos.x) === Number(x) && Number(pos.z) === Number(z)) return p;
	}
	return null;
}

/**
 * Returns every chess piece in `gameState.chessPieces` whose `player`
 * matches `playerId` (string-compared).  This used to live in
 * `./pieces.js`, but that module pulls in `../centreBoardMarker.js`
 * which in turn pulls in renderer code — too heavy for the move
 * generator (and impossible to load in Node-style unit tests).  Keep
 * it next to the other cell helpers so `moves.js` can import it
 * without dragging the rendering stack along.
 */
export function getPiecesForPlayer(gameState, playerId) {
	if (!Array.isArray(gameState?.chessPieces)) return [];
	const target = String(playerId);
	return gameState.chessPieces.filter(piece => String(piece.player) === target);
}
