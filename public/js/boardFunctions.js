/**
 * Board functions — public API for the rest of the client.
 *
 * The implementation was split into focused sub-modules during the
 * Phase-4 frontend refactor:
 *
 *   - `boardFunctions/cells.js`     sparse-cell helpers
 *   - `boardFunctions/colours.js`   player-aware colour resolver
 *   - `boardFunctions/pieces.js`    chess-piece extraction + lookup
 *   - `boardFunctions/moves.js`     move generation + analysis
 *   - `boardFunctions/rendering.js` THREE.js rendering for the board + pieces
 *
 * The legacy `boardFunctions` object is preserved so existing call sites
 * (e.g. `boardFunctions.getPlayersKing(...)`) keep working.
 */

import { toRelativePosition, toAbsolutePosition, translatePosition } from './centreBoardMarker.js';
import { isTetrominoAdjacentToExistingCells, renderTetromino } from './tetromino.js';

import { extractCellContent, hasBoardCell, getChessPieceAt } from './boardFunctions/cells.js';
import { getPlayerColor } from './boardFunctions/colours.js';
import {
	extractChessPiecesFromCells,
	getPiecesForPlayer,
	getPieceForPlayer,
	getPlayersKing,
} from './boardFunctions/pieces.js';
import {
	getChessPieceMoveSets,
	analyzePossibleMoves,
} from './boardFunctions/moves.js';
import {
	renderBoard,
	createChessPiece,
} from './boardFunctions/rendering.js';

export {
	extractCellContent,
	hasBoardCell,
	getChessPieceAt,
	getPlayerColor,
	extractChessPiecesFromCells,
	getPiecesForPlayer,
	getPieceForPlayer,
	getPlayersKing,
	getChessPieceMoveSets,
	analyzePossibleMoves,
	renderBoard,
	createChessPiece,
};

export const boardFunctions = Object.freeze({
	isTetrominoAdjacentToExistingCells,
	renderTetromino,
	extractCellContent,
	hasBoardCell,
	getChessPieceAt,
	getPlayerColor,
	extractChessPiecesFromCells,
	getPiecesForPlayer,
	getPieceForPlayer,
	getPlayersKing,
	getChessPieceMoveSets,
	analyzePossibleMoves,
	renderBoard,
	createChessPiece,
	toRelativePosition,
	toAbsolutePosition,
	translatePosition,
});
