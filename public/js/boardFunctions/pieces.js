/**
 * Chess piece extraction + per-player lookups.
 *
 * `extractChessPiecesFromCells` walks the sparse board and produces
 * the flat `chessPieces` array the rest of the client reads from.
 *
 * `getPlayersKing`, `getPiecesForPlayer`, and `getPieceForPlayer`
 * are simple filters over that array; they're cheap enough that we
 * don't cache them.
 */

import { translatePosition } from '../centreBoardMarker.js';
import { extractCellContent, getPiecesForPlayer as _getPiecesForPlayer } from './cells.js';

// Re-exported from `cells.js` to avoid a circular helper-module split.
// Older callers still `import { getPiecesForPlayer } from './pieces.js';`.
export const getPiecesForPlayer = _getPiecesForPlayer;

function pieceIdFor(piece, x, z, defaultType = 'PAWN') {
	if (piece && piece.pieceId) return piece.pieceId;
	const player = piece && piece.player != null ? piece.player : 1;
	const type = (piece && (piece.pieceType || piece.type)) || defaultType;
	return `${player}-${type}-${x}-${z}`;
}

function buildPieceEntry(piece, x, z) {
	const player = piece.player ?? 1;
	const type = piece.pieceType || piece.type || 'PAWN';
	return {
		id: pieceIdFor(piece, x, z, type),
		position: { x, z },
		type,
		player,
		color: piece.color ?? 0xcccccc,
		orientation: piece.orientation ?? 0,
		awaitingPromotion: piece.awaitingPromotion === true,
	};
}

export function extractChessPiecesFromCells(gameState) {
	const out = [];
	const cells = gameState?.board?.cells;
	if (!cells) {
		console.warn('No valid board data to extract chess pieces from');
		return out;
	}

	for (const key of Object.keys(cells)) {
		try {
			const [x, z] = key.split(',').map(Number);
			if (!Number.isFinite(x) || !Number.isFinite(z)) {
				console.warn(`Invalid cell coordinates in key: ${key}`);
				continue;
			}

			const cellData = cells[key];
			if (!cellData) continue;

			if (Array.isArray(cellData)) {
				const chessMarkers = cellData.filter(
					item => item && item.type === 'chess' && (item.pieceType || item.pieceId),
				);
				if (chessMarkers.length > 1 && gameState?.debugMode) {
					console.warn(`Cell (${x},${z}) has ${chessMarkers.length} chess markers — using first only`);
				}
				const chessPiece = chessMarkers[0];
				if (chessPiece) out.push(buildPieceEntry(chessPiece, x, z));
				continue;
			}

			if (typeof cellData === 'object' && cellData !== null) {
				if (cellData.chess) {
					out.push(buildPieceEntry(cellData.chess, x, z));
					continue;
				}
				const chessContent = extractCellContent(cellData, 'chess');
				if (chessContent) out.push(buildPieceEntry(chessContent, x, z));
			}
		} catch (err) {
			console.error(`Error extracting chess piece at ${key}:`, err);
		}
	}

	return out;
}

export function getPieceForPlayer(gameState, playerId, pieceType) {
	const target = String(pieceType).toLowerCase();
	return getPiecesForPlayer(gameState, playerId)
		.filter(piece => String(piece.type).toLowerCase() === target);
}

export function getPlayersKing(gameState, playerId, absoluteCoordinates = false) {
	const kings = getPieceForPlayer(gameState, playerId, 'king');
	if (kings.length === 0) {
		console.warn('No king found for player ' + playerId, gameState);
		return null;
	}
	const king = kings[0];
	if (!absoluteCoordinates) return king;

	return {
		...king,
		position: translatePosition(king.position, gameState, true),
	};
}
