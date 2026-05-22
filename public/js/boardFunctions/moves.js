/**
 * Chess piece movement generation.
 *
 * `getChessPieceMoveSets` returns every legal destination square for
 * a given piece on the current sparse board.  `analyzePossibleMoves`
 * aggregates those moves per-player and tags capture options.
 *
 * These functions never mutate the board; they're purely read-only
 * over `gameState.chessPieces` + `gameState.board.cells`.
 */

import {
	hasBoardCell,
	extractCellContent,
	getPiecesForPlayer,
} from './cells.js';

const KING_OFFSETS = [
	{ dx: -1, dz: -1 }, { dx: 0, dz: -1 }, { dx: 1, dz: -1 },
	{ dx: -1, dz: 0 }, { dx: 1, dz: 0 },
	{ dx: -1, dz: 1 }, { dx: 0, dz: 1 }, { dx: 1, dz: 1 },
];

const KNIGHT_OFFSETS = [
	{ dx: 2, dz: 1 }, { dx: 1, dz: 2 },
	{ dx: -2, dz: 1 }, { dx: -1, dz: 2 },
	{ dx: 2, dz: -1 }, { dx: 1, dz: -2 },
	{ dx: -2, dz: -1 }, { dx: -1, dz: -2 },
];

const ROOK_DIRS = [
	{ dx: 1, dz: 0 }, { dx: -1, dz: 0 },
	{ dx: 0, dz: 1 }, { dx: 0, dz: -1 },
];

const BISHOP_DIRS = [
	{ dx: 1, dz: 1 }, { dx: -1, dz: 1 },
	{ dx: 1, dz: -1 }, { dx: -1, dz: -1 },
];

const PAWN_FORWARD_BY_ORIENTATION = {
	0: { dx: 0, dz: 1 },
	1: { dx: 1, dz: 0 },
	2: { dx: 0, dz: -1 },
	3: { dx: -1, dz: 0 },
};

// Hard ceiling on sliding-piece ray length — without it a corrupt
// or empty board could in theory let us walk Infinity steps. In
// practice no rook/bishop will ever need more than the board's
// diameter; the sparse `hasBoardCell` check terminates the ray as
// soon as we step off the board.
const MAX_SLIDE_STEPS = 256;

/**
 * Build a `"x,z"` → piece map for one move-generator pass.
 *
 * `gameState.chessPieces` is the canonical occupancy source — it's
 * what the server's `_buildPieceLocator` keys off too, so client and
 * server agree about who is where regardless of stale cell markers.
 * (The server additionally treats legacy markers WITHOUT a `pieceId`
 * as blockers, but those only show up in old save data and aren't
 * worth the per-frame cell scan on the client; if it ever matters
 * the server's "Invalid chess move" feedback names the offender.)
 *
 * Without this index, the previous implementation called
 * `getChessPieceAt` (a linear scan of `gameState.chessPieces`)
 * inside every direction loop, which became hundreds of thousands of
 * compares per frame on a busy board — the user-visible "lag" when
 * they had lots of pieces. We pay the O(N) cost once up front and
 * the rest of the generator is O(1) per lookup.
 */
function buildPieceIndex(gameState) {
	// Hot path: an outer pass (e.g. `analyzePossibleMoves`) may have
	// already built the index for this generation cycle. Reusing it
	// keeps the move generator at O(N) total instead of O(N²) when
	// asked for moves for every piece a player owns.
	if (gameState && gameState._tmpPieceIndex instanceof Map) {
		return gameState._tmpPieceIndex;
	}
	const idx = new Map();
	const pieces = gameState?.chessPieces;
	if (!Array.isArray(pieces)) return idx;
	for (const p of pieces) {
		if (!p) continue;
		const pos = p.position || p;
		if (!pos) continue;
		const x = Number(pos.x);
		const z = Number(pos.z);
		if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
		idx.set(`${x},${z}`, p);
	}
	return idx;
}

function lookupOccupant(pieceIndex, x, z) {
	return pieceIndex.get(`${x},${z}`) || null;
}

function addOffsetMoves(gameState, piece, offsets, validMoves, pieceIndex) {
	const { currentX, currentZ, ownerStr } = piece;
	for (const offset of offsets) {
		const toX = currentX + offset.dx;
		const toZ = currentZ + offset.dz;
		if (!hasBoardCell(gameState, toX, toZ)) continue;
		const occupant = lookupOccupant(pieceIndex, toX, toZ);
		if (occupant && String(occupant.player) === ownerStr) continue;
		validMoves.push({ x: toX, z: toZ });
	}
}

function addStraightLineMoves(gameState, piece, directions, validMoves, pieceIndex) {
	const { currentX, currentZ, ownerStr } = piece;
	for (const dir of directions) {
		let toX = currentX + dir.dx;
		let toZ = currentZ + dir.dz;
		// `hasBoardCell` is the authoritative terminator — sparse
		// board, no cells outside the rendered footprint. The
		// previous version of this function clamped against a cached
		// `boardBounds` rectangle, which silently amputated valid
		// moves whenever the snapshot lagged the server (e.g. after
		// a tetromino placement extended the board). The user
		// reported bishops being unable to move "forward" while
		// "backward" still worked — a classic stale-bounds symptom.
		for (let step = 0; step < MAX_SLIDE_STEPS; step++) {
			if (!hasBoardCell(gameState, toX, toZ)) break;
			const occupant = lookupOccupant(pieceIndex, toX, toZ);
			if (occupant) {
				if (String(occupant.player) !== ownerStr) validMoves.push({ x: toX, z: toZ });
				break;
			}
			validMoves.push({ x: toX, z: toZ });
			toX += dir.dx;
			toZ += dir.dz;
		}
	}
}

/**
 * Generate castling destinations for a king.  Mirrors the server's
 * `_validateCastle`: scan each cardinal direction for a friendly,
 * unmoved rook with a clear path of real board cells between.  The
 * king's destination is two squares towards the rook; the rook's
 * auto-move (the cell the king crossed) is intentionally NOT a
 * separate highlight — the king only ever needs one click.
 */
function addCastlingMoves(gameState, piece, validMoves, pieceIndex) {
	const { original, currentX, currentZ, ownerStr } = piece;
	if (original.hasMoved) return;

	const directions = [
		{ dx: 1, dz: 0 },
		{ dx: -1, dz: 0 },
		{ dx: 0, dz: 1 },
		{ dx: 0, dz: -1 },
	];

	for (const dir of directions) {
		let searchX = currentX + dir.dx;
		let searchZ = currentZ + dir.dz;
		let foundRook = null;

		for (let i = 0; i < MAX_SLIDE_STEPS; i++) {
			if (!hasBoardCell(gameState, searchX, searchZ)) {
				foundRook = null;
				break;
			}
			const occupant = lookupOccupant(pieceIndex, searchX, searchZ);
			if (occupant) {
				const isFriendlyRook = String(occupant.player) === ownerStr
					&& String(occupant.type || '').toUpperCase() === 'ROOK'
					&& !occupant.hasMoved;
				if (isFriendlyRook) foundRook = occupant;
				break;
			}
			searchX += dir.dx;
			searchZ += dir.dz;
		}

		if (!foundRook) continue;

		validMoves.push({
			x: currentX + dir.dx * 2,
			z: currentZ + dir.dz * 2,
		});
	}
}

function addPawnMoves(gameState, piece, validMoves, pieceIndex) {
	const orientation = Number.isFinite(piece.original.orientation) ? piece.original.orientation : 0;
	const fwd = PAWN_FORWARD_BY_ORIENTATION[orientation] || PAWN_FORWARD_BY_ORIENTATION[0];
	const { currentX, currentZ, ownerStr, original } = piece;

	const f1x = currentX + fwd.dx;
	const f1z = currentZ + fwd.dz;
	const forwardClear = hasBoardCell(gameState, f1x, f1z) && !lookupOccupant(pieceIndex, f1x, f1z);
	if (forwardClear) {
		validMoves.push({ x: f1x, z: f1z });
		if (!original.hasMoved) {
			const f2x = currentX + fwd.dx * 2;
			const f2z = currentZ + fwd.dz * 2;
			if (hasBoardCell(gameState, f2x, f2z) && !lookupOccupant(pieceIndex, f2x, f2z)) {
				validMoves.push({ x: f2x, z: f2z });
			}
		}
	}

	const captureOffsets = fwd.dx === 0
		? [{ dx: -1, dz: fwd.dz }, { dx: 1, dz: fwd.dz }]
		: [{ dx: fwd.dx, dz: -1 }, { dx: fwd.dx, dz: 1 }];

	for (const offset of captureOffsets) {
		const cx = currentX + offset.dx;
		const cz = currentZ + offset.dz;
		if (!hasBoardCell(gameState, cx, cz)) continue;
		const occupant = lookupOccupant(pieceIndex, cx, cz);
		if (occupant && String(occupant.player) !== ownerStr) {
			validMoves.push({ x: cx, z: cz });
		}
	}
}

export function getChessPieceMoveSets(gameState, piece) {
	if (!piece || !piece.position) {
		console.warn('Invalid piece provided to getChessPieceMoveSets');
		return [];
	}

	const validMoves = [];
	const pieceType = typeof piece.type === 'string' ? piece.type.toUpperCase() : 'PAWN';
	const ctx = {
		original: piece,
		currentX: piece.position.x,
		currentZ: piece.position.z,
		ownerStr: String(piece.player),
	};
	const pieceIndex = buildPieceIndex(gameState);

	switch (pieceType) {
		case 'KING':
			addOffsetMoves(gameState, ctx, KING_OFFSETS, validMoves, pieceIndex);
			addCastlingMoves(gameState, ctx, validMoves, pieceIndex);
			break;
		case 'QUEEN':
			addStraightLineMoves(gameState, ctx, ROOK_DIRS, validMoves, pieceIndex);
			addStraightLineMoves(gameState, ctx, BISHOP_DIRS, validMoves, pieceIndex);
			break;
		case 'ROOK': addStraightLineMoves(gameState, ctx, ROOK_DIRS, validMoves, pieceIndex); break;
		case 'BISHOP': addStraightLineMoves(gameState, ctx, BISHOP_DIRS, validMoves, pieceIndex); break;
		case 'KNIGHT': addOffsetMoves(gameState, ctx, KNIGHT_OFFSETS, validMoves, pieceIndex); break;
		case 'PAWN': addPawnMoves(gameState, ctx, validMoves, pieceIndex); break;
		default:
			console.warn(`Unknown piece type: ${pieceType}`);
	}

	return validMoves;
}

export function analyzePossibleMoves(gameState, playerId) {
	const playerPieces = getPiecesForPlayer(gameState, playerId);
	const allMoves = [];
	const piecesWithMoves = [];
	const piecesWithoutMoves = [];
	const captureMoves = [];

	// Build the piece index ONCE up-front and reuse for every piece's
	// per-direction lookups inside `getChessPieceMoveSets`. Without
	// this, an N-piece board re-walked the chessPieces array O(N)
	// times per direction per piece — measurable lag at 30+ pieces.
	// We expose the index on `gameState._tmpPieceIndex` so the inner
	// `buildPieceIndex` call can short-circuit. It's reset after the
	// analysis pass.
	gameState._tmpPieceIndex = (() => {
		const idx = new Map();
		if (!Array.isArray(gameState.chessPieces)) return idx;
		for (const p of gameState.chessPieces) {
			if (!p) continue;
			const pos = p.position || p;
			if (!pos) continue;
			const x = Number(pos.x);
			const z = Number(pos.z);
			if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
			idx.set(`${x},${z}`, p);
		}
		return idx;
	})();

	try {
		for (const piece of playerPieces) {
			const moves = getChessPieceMoveSets(gameState, piece);
			if (moves.length === 0) {
				piecesWithoutMoves.push(piece);
				continue;
			}
			piecesWithMoves.push(piece);
			for (const move of moves) {
				allMoves.push({ piece, move });
				const targetCell = gameState.board?.cells?.[`${move.x},${move.z}`];
				const chessContent = targetCell ? extractCellContent(targetCell, 'chess') : null;
				if (chessContent && chessContent.player !== piece.player) {
					captureMoves.push({ piece, move, targetPiece: chessContent });
				}
			}
		}
	} finally {
		gameState._tmpPieceIndex = null;
	}

	return {
		totalPieces: playerPieces.length,
		piecesWithMoves: piecesWithMoves.length,
		piecesWithoutMoves: piecesWithoutMoves.length,
		totalPossibleMoves: allMoves.length,
		possibleCaptures: captureMoves.length,
		hasMoves: allMoves.length > 0,
		allMoves,
		captureMoves,
		movablePieces: piecesWithMoves,
		immobilePieces: piecesWithoutMoves,
	};
}
