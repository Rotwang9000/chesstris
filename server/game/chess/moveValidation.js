/**
 * Chess move validation — extracted from ChessManager.js as part of
 * the May-2026 code-shape cleanup (1614 LOC → ~1000 LOC). Same logic,
 * same call signatures; ChessManager methods now delegate here so
 * external callers (socket handlers, AI driver, tests) don't change.
 *
 * Two flavours:
 *
 *   • `validateChessMove(ctx, game, playerId, moveData)` — returns
 *     a rich `{ valid, error?, piece?, fromX?, ..., castling? }`
 *     object. Used by the socket / chess-move flow.
 *
 *   • `isValidChessMove(ctx, game, piece, toX, toZ)` — fast yes/no
 *     used by `hasValidChessMoves` and the AI driver while it
 *     enumerates candidate moves.
 *
 * `ctx` is `{ boardManager, buildPieceLocator }` — i.e. the chess
 * manager itself acts as the context. Passing it in (rather than
 * importing `World` here) keeps these helpers pure-ish: they work
 * with any board manager that exposes `getCell(board, x, z)`.
 *
 * The path-clear / locator helpers in this module are also the
 * single source of truth shared between the move-generator and
 * has-any-moves checks, so the two never disagree about whether a
 * slide is blocked.
 */

'use strict';

const { log } = require('../GameUtilities');

const PAWN_FORWARD_BY_ORIENTATION = Object.freeze({
	0: Object.freeze({ dx: 0, dz: 1 }),
	1: Object.freeze({ dx: 1, dz: 0 }),
	2: Object.freeze({ dx: 0, dz: -1 }),
	3: Object.freeze({ dx: -1, dz: 0 }),
});

function pawnForward(orientation) {
	const o = Number.isFinite(orientation) ? orientation : 0;
	return PAWN_FORWARD_BY_ORIENTATION[o] || PAWN_FORWARD_BY_ORIENTATION[0];
}

/**
 * True if the given owner is currently paused. Used so opponent
 * chess pieces refuse to capture a paused player's pieces (the
 * pause feature freezes the player's footprint until they resume).
 */
function _isOwnerPaused(game, ownerId) {
	if (!game || !game.players || ownerId == null) return false;
	const record = game.players[String(ownerId)];
	return !!(record && record.paused === true);
}

/**
 * @typedef {Object} ValidationCtx
 * @property {{ getCell(board: object, x: number, z: number): any[]|null }} boardManager
 * @property {(game: object) => (x: number, z: number) => object|null} buildPieceLocator
 */

/**
 * @param {ValidationCtx} ctx
 */
function validateChessMove(ctx, game, playerId, moveData) {
	try {
		const { pieceId, toX, toZ } = moveData;
		const piece = game.chessPieces.find(p => p.id === pieceId);
		if (!piece) {
			return { valid: false, error: `Chess piece with ID ${pieceId} not found` };
		}
		if (piece.player !== playerId) {
			return { valid: false, error: 'You do not own this chess piece' };
		}

		const fromX = piece.position.x;
		const fromZ = piece.position.z;
		if (fromX === toX && fromZ === toZ) {
			return { valid: false, error: 'Cannot move to the same position' };
		}

		const pieceAt = ctx.buildPieceLocator(game);
		const targetCell = ctx.boardManager.getCell(game.board, toX, toZ);

		const targetPiece = pieceAt(toX, toZ);
		if (targetPiece && String(targetPiece.player) === String(playerId)) {
			return { valid: false, error: 'Cannot capture your own piece' };
		}
		if (targetPiece && _isOwnerPaused(game, targetPiece.player)) {
			return { valid: false, error: 'That player is paused — their pieces are temporarily protected' };
		}

		const typeValidation = validateMoveByPieceType(ctx, game, piece, toX, toZ, pieceAt);
		if (!typeValidation.valid) return typeValidation;

		if (piece.type !== 'KNIGHT') {
			const pathValidation = checkPathObstruction(piece, toX, toZ, pieceAt);
			if (!pathValidation.valid) return pathValidation;
		}

		return {
			valid: true,
			piece,
			fromX, fromZ, toX, toZ,
			targetCell,
			castling: typeValidation.castling || null,
		};
	} catch (error) {
		log(`Error validating chess move: ${error.message}`);
		return { valid: false, error: error.message };
	}
}

function validateMoveByPieceType(ctx, game, piece, toX, toZ, pieceAt) {
	const fromX = piece.position.x;
	const fromZ = piece.position.z;
	const type = String(piece.type || '').toLowerCase();
	const occupantAt = pieceAt || ctx.buildPieceLocator(game);

	const deltaX = Math.abs(toX - fromX);
	const deltaZ = Math.abs(toZ - fromZ);

	switch (type) {
		case 'pawn':
			return validatePawnMove(piece, fromX, fromZ, toX, toZ, occupantAt);
		case 'rook':
			return (fromX === toX || fromZ === toZ)
				? { valid: true }
				: { valid: false, error: 'Rooks can only move horizontally or vertically' };
		case 'knight':
			return ((deltaX === 2 && deltaZ === 1) || (deltaX === 1 && deltaZ === 2))
				? { valid: true }
				: { valid: false, error: 'Knights can only move in an L-shape' };
		case 'bishop':
			return (deltaX === deltaZ)
				? { valid: true }
				: { valid: false, error: 'Bishops can only move diagonally' };
		case 'queen':
			return (fromX === toX || fromZ === toZ || deltaX === deltaZ)
				? { valid: true }
				: { valid: false, error: 'Queens can only move horizontally, vertically, or diagonally' };
		case 'king':
			return validateKingMove(ctx, game, piece, fromX, fromZ, toX, toZ, deltaX, deltaZ, occupantAt);
		default:
			return { valid: false, error: `Unknown piece type: ${type}` };
	}
}

function validatePawnMove(piece, fromX, fromZ, toX, toZ, occupantAt) {
	const fwd = pawnForward(piece.orientation);
	const isForwardOne = (toX - fromX === fwd.dx && toZ - fromZ === fwd.dz);
	const isForwardTwo = (!piece.hasMoved && toX - fromX === fwd.dx * 2 && toZ - fromZ === fwd.dz * 2);

	if (isForwardOne) {
		if (!occupantAt(toX, toZ)) return { valid: true };
		return { valid: false, error: 'Pawn cannot move forward into an occupied cell' };
	}
	if (isForwardTwo) {
		const midX = fromX + fwd.dx;
		const midZ = fromZ + fwd.dz;
		if (occupantAt(midX, midZ) || occupantAt(toX, toZ)) {
			return { valid: false, error: 'Pawn cannot jump over pieces' };
		}
		return { valid: true };
	}
	const isDiag = fwd.dx === 0
		? (Math.abs(toX - fromX) === 1 && toZ - fromZ === fwd.dz)
		: (Math.abs(toZ - fromZ) === 1 && toX - fromX === fwd.dx);
	if (isDiag) {
		const target = occupantAt(toX, toZ);
		if (target && String(target.player) !== String(piece.player)) {
			return { valid: true };
		}
		return { valid: false, error: 'Pawn can only move diagonally when capturing' };
	}
	return { valid: false, error: 'Invalid pawn move' };
}

function validateKingMove(ctx, game, piece, fromX, fromZ, toX, toZ, deltaX, deltaZ, occupantAt) {
	if (deltaX <= 1 && deltaZ <= 1) return { valid: true };
	if (!piece.hasMoved && ((deltaX === 2 && deltaZ === 0) || (deltaX === 0 && deltaZ === 2))) {
		const castleResult = validateCastle(ctx, game, piece, toX, toZ, occupantAt);
		if (castleResult.valid) return { valid: true, castling: castleResult };
		return castleResult;
	}
	return { valid: false, error: 'Kings can only move one step in any direction (or castle)' };
}

function validateCastle(ctx, game, king, toX, toZ, pieceAt) {
	const fromX = king.position.x;
	const fromZ = king.position.z;
	const dx = Math.sign(toX - fromX);
	const dz = Math.sign(toZ - fromZ);
	const occupantAt = pieceAt || ctx.buildPieceLocator(game);

	let rook = null;
	let searchX = fromX + dx;
	let searchZ = fromZ + dz;
	const maxSearch = 8;
	for (let i = 0; i < maxSearch; i++) {
		const cell = ctx.boardManager.getCell(game.board, searchX, searchZ);
		if (!cell) break;
		const occupant = occupantAt(searchX, searchZ);
		if (occupant) {
			if (
				occupant.piece &&
				String(occupant.pieceType).toLowerCase() === 'rook' &&
				String(occupant.player) === String(king.player)
			) {
				rook = occupant.piece;
			}
			break;
		}
		searchX += dx;
		searchZ += dz;
	}

	if (!rook) return { valid: false, error: 'No rook found in that direction for castling' };
	if (rook.hasMoved) return { valid: false, error: 'Rook has already moved' };

	let checkX = fromX + dx;
	let checkZ = fromZ + dz;
	while (checkX !== rook.position.x || checkZ !== rook.position.z) {
		const cell = ctx.boardManager.getCell(game.board, checkX, checkZ);
		if (!cell || (Array.isArray(cell) && cell.length === 0)) {
			return { valid: false, error: 'Gap in board between king and rook' };
		}
		if (occupantAt(checkX, checkZ)) {
			return { valid: false, error: 'Piece between king and rook' };
		}
		checkX += dx;
		checkZ += dz;
	}

	return {
		valid: true,
		rookId: rook.id,
		rookFromX: rook.position.x,
		rookFromZ: rook.position.z,
		rookToX: fromX + dx,
		rookToZ: fromZ + dz,
	};
}

function checkPathObstruction(piece, toX, toZ, pieceAt) {
	const fromX = piece.position.x;
	const fromZ = piece.position.z;
	const dx = Math.sign(toX - fromX);
	const dz = Math.sign(toZ - fromZ);
	let x = fromX + dx;
	let z = fromZ + dz;
	while (x !== toX || z !== toZ) {
		if (pieceAt(x, z)) {
			return { valid: false, error: `Path is obstructed at position (${x}, ${z})` };
		}
		x += dx;
		z += dz;
	}
	return { valid: true };
}

/**
 * Fast boolean validity check used by `hasValidChessMoves` and the
 * AI driver. Doesn't allocate a result object on the hot path.
 *
 * @param {ValidationCtx} ctx
 */
function isValidChessMove(ctx, game, piece, toX, toZ) {
	try {
		if (!game || !game.board || !game.board.cells || !piece) return false;
		const pos = piece.position || piece;
		if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return false;
		if (!Number.isFinite(toX) || !Number.isFinite(toZ)) return false;

		const fromX = pos.x;
		const fromZ = pos.z;
		if (fromX === toX && fromZ === toZ) return false;

		const targetCell = ctx.boardManager.getCell(game.board, toX, toZ);
		if (!targetCell || !Array.isArray(targetCell) || targetCell.length === 0) return false;

		const pieceOwner = piece.player;
		const pieceType = String(piece.type || '').toUpperCase();
		const pieceAt = ctx.buildPieceLocator(game);
		const targetChess = pieceAt(toX, toZ);
		if (targetChess && String(targetChess.player) === String(pieceOwner)) return false;
		if (targetChess && _isOwnerPaused(game, targetChess.player)) return false;

		const deltaX = toX - fromX;
		const deltaZ = toZ - fromZ;
		const absX = Math.abs(deltaX);
		const absZ = Math.abs(deltaZ);

		const hasChessPieceAt = (x, z) => !!pieceAt(x, z);
		const isBoardSquare = (x, z) => {
			const cell = ctx.boardManager.getCell(game.board, x, z);
			return !!(cell && Array.isArray(cell) && cell.length > 0);
		};
		const isPathClear = () => {
			const stepX = Math.sign(deltaX);
			const stepZ = Math.sign(deltaZ);
			let x = fromX + stepX;
			let z = fromZ + stepZ;
			while (x !== toX || z !== toZ) {
				if (!isBoardSquare(x, z)) return false;
				if (hasChessPieceAt(x, z)) return false;
				x += stepX;
				z += stepZ;
			}
			return true;
		};

		switch (pieceType) {
			case 'KING':
				if (absX <= 1 && absZ <= 1) return true;
				if (!piece.hasMoved && ((absX === 2 && absZ === 0) || (absX === 0 && absZ === 2))) {
					return validateCastle(ctx, game, piece, toX, toZ, pieceAt).valid;
				}
				return false;
			case 'KNIGHT':
				return (absX === 1 && absZ === 2) || (absX === 2 && absZ === 1);
			case 'BISHOP':
				if (absX !== absZ) return false;
				return isPathClear();
			case 'ROOK':
				if (!((absX === 0 && absZ > 0) || (absZ === 0 && absX > 0))) return false;
				return isPathClear();
			case 'QUEEN':
				if (!((absX === 0 && absZ > 0) || (absZ === 0 && absX > 0) || (absX === absZ && absX > 0))) return false;
				return isPathClear();
			case 'PAWN': {
				const forward = pawnForward(piece.orientation);
				const isForwardOne = deltaX === forward.dx && deltaZ === forward.dz;
				const isForwardTwo = !piece.hasMoved && deltaX === forward.dx * 2 && deltaZ === forward.dz * 2;
				const isDiagonalCapture = forward.dx === 0
					? (absX === 1 && deltaZ === forward.dz)
					: (absZ === 1 && deltaX === forward.dx);
				if (isForwardOne) return !hasChessPieceAt(toX, toZ);
				if (isForwardTwo) {
					const midX = fromX + forward.dx;
					const midZ = fromZ + forward.dz;
					const midCell = ctx.boardManager.getCell(game.board, midX, midZ);
					const midHasBoard = !!(midCell && Array.isArray(midCell) && midCell.length > 0);
					if (!midHasBoard) return false;
					if (hasChessPieceAt(midX, midZ)) return false;
					return !hasChessPieceAt(toX, toZ);
				}
				if (isDiagonalCapture) {
					return !!targetChess && String(targetChess.player) !== String(pieceOwner);
				}
				return false;
			}
			default:
				return false;
		}
	} catch (error) {
		log(`Error validating chess move (isValidChessMove): ${error.message}`);
		return false;
	}
}

/**
 * Does the player have ANY legal move? Used to fall straight back
 * to the tetromino phase when a player is stuck (chessless turn) so
 * the round doesn't deadlock.
 *
 * @param {ValidationCtx} ctx
 */
function hasValidChessMoves(ctx, game, playerId) {
	try {
		if (!game || !game.board || !game.board.cells) return false;
		const pid = String(playerId);
		const playerPieces = game.chessPieces.filter(p => p && String(p.player) === pid);
		if (!playerPieces.length) {
			log(`Player ${playerId} has no chess pieces`);
			return false;
		}

		const pieceAt = ctx.buildPieceLocator(game);
		const isBoardSquare = (x, z) => {
			const cell = ctx.boardManager.getCell(game.board, x, z);
			return !!(cell && Array.isArray(cell) && cell.length > 0);
		};
		const hasChessPieceAt = (x, z) => !!pieceAt(x, z);

		for (const piece of playerPieces) {
			const pos = piece.position || piece;
			if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) continue;
			const type = String(piece.type || '').toUpperCase();
			const x0 = pos.x;
			const z0 = pos.z;
			const tryMove = (x, z) => isValidChessMove(ctx, game, piece, x, z);

			if (type === 'KING') {
				for (let dx = -1; dx <= 1; dx++) {
					for (let dz = -1; dz <= 1; dz++) {
						if (dx === 0 && dz === 0) continue;
						if (tryMove(x0 + dx, z0 + dz)) return true;
					}
				}
				if (!piece.hasMoved) {
					if (tryMove(x0 + 2, z0)) return true;
					if (tryMove(x0 - 2, z0)) return true;
					if (tryMove(x0, z0 + 2)) return true;
					if (tryMove(x0, z0 - 2)) return true;
				}
				continue;
			}

			if (type === 'KNIGHT') {
				const moves = [
					{ dx: 1, dz: 2 }, { dx: 2, dz: 1 },
					{ dx: -1, dz: 2 }, { dx: -2, dz: 1 },
					{ dx: 1, dz: -2 }, { dx: 2, dz: -1 },
					{ dx: -1, dz: -2 }, { dx: -2, dz: -1 },
				];
				for (const m of moves) {
					if (tryMove(x0 + m.dx, z0 + m.dz)) return true;
				}
				continue;
			}

			if (type === 'PAWN') {
				const forward = pawnForward(piece.orientation);
				if (tryMove(x0 + forward.dx, z0 + forward.dz)) return true;
				if (!piece.hasMoved) {
					if (tryMove(x0 + forward.dx * 2, z0 + forward.dz * 2)) return true;
				}
				const diagonals = forward.dx === 0
					? [{ dx: -1, dz: forward.dz }, { dx: 1, dz: forward.dz }]
					: [{ dx: forward.dx, dz: -1 }, { dx: forward.dx, dz: 1 }];
				for (const d of diagonals) {
					if (tryMove(x0 + d.dx, z0 + d.dz)) return true;
				}
				continue;
			}

			const directions = [];
			if (type === 'ROOK' || type === 'QUEEN') {
				directions.push(
					{ dx: 1, dz: 0 }, { dx: -1, dz: 0 },
					{ dx: 0, dz: 1 }, { dx: 0, dz: -1 },
				);
			}
			if (type === 'BISHOP' || type === 'QUEEN') {
				directions.push(
					{ dx: 1, dz: 1 }, { dx: 1, dz: -1 },
					{ dx: -1, dz: 1 }, { dx: -1, dz: -1 },
				);
			}
			for (const dir of directions) {
				let step = 1;
				while (true) {
					const x = x0 + dir.dx * step;
					const z = z0 + dir.dz * step;
					if (!isBoardSquare(x, z)) break;
					if (tryMove(x, z)) return true;
					if (hasChessPieceAt(x, z)) break;
					step++;
				}
			}
		}

		log(`Player ${playerId} has no valid chess moves available`);
		return false;
	} catch (error) {
		log(`Error checking for valid chess moves: ${error.message}`);
		return true;
	}
}

module.exports = {
	validateChessMove,
	validateMoveByPieceType,
	validateCastle,
	checkPathObstruction,
	isValidChessMove,
	hasValidChessMoves,
};
