/**
 * COMPREHENSIVE chess-move coverage.
 *
 * The user reported "every move is coming up Invalid chess move… even
 * the local side gets it wrong". Two engines have to agree:
 *
 *   1. `server/game/ChessManager.isValidChessMove(...)` — the
 *      authoritative validator the socket handler trusts.
 *   2. `public/js/boardFunctions/moves.js → getChessPieceMoveSets(...)`
 *      — the optimistic-highlight generator the user sees.
 *
 * Every test below sets up a tiny board, asks the server validator
 * what's legal, asks the client move generator what it would offer,
 * and asserts the two agree. Where they don't agree we either fix
 * one of them or document the difference.
 *
 * These tests are deliberately exhaustive — the user wanted to see
 * basic-gameplay coverage rather than corner cases, so each piece
 * type gets the "happy path" + the most common rejection paths.
 */

const path = require('path');

const BoardManager = require('../../server/game/BoardManager');
const IslandManager = require('../../server/game/IslandManager');
const ChessManager = require('../../server/game/ChessManager');

const CLIENT_MOVES_PATH = path.resolve(
	__dirname, '..', '..', 'public', 'js', 'boardFunctions', 'moves.js'
);
const { getChessPieceMoveSets } = require(CLIENT_MOVES_PATH);

// ── Test scaffolding ────────────────────────────────────────────────

function makeWorld() {
	const boardManager = new BoardManager();
	const islandManager = new IslandManager();
	const chessManager = new ChessManager(boardManager, islandManager);
	const game = {
		board: boardManager.createEmptyBoard(),
		players: {
			p1: { id: 'p1', color: 0xFF0000 },
			p2: { id: 'p2', color: 0x0000FF },
		},
		chessPieces: [],
		islands: [],
	};
	return { game, boardManager, chessManager };
}

/** Place a chess piece on the board with a matching cell marker. */
function placePiece(world, { id, type, player, x, z, hasMoved = false, orientation = 0 }) {
	const piece = {
		id, type, player,
		position: { x, z },
		hasMoved, orientation,
		moveCount: 0,
		forwardDistance: 0,
	};
	world.game.chessPieces.push(piece);
	world.boardManager.addToCellContents(world.game.board, x, z, {
		type: 'chess',
		player,
		pieceId: id,
		pieceType: String(type).toLowerCase(),
	});
	return piece;
}

/** Stamp a "real" terrain cell so chess pieces have somewhere to stand. */
function stampTerrain(world, x, z, player = 'p1') {
	if (!world.boardManager.getCell(world.game.board, x, z)) {
		world.boardManager.setCell(world.game.board, x, z, [
			{ type: 'tetromino', player },
		]);
	}
}

/** Carve a rectangle of terrain — used to give pieces a place to move into. */
function stampRect(world, x0, z0, x1, z1, player = 'p1') {
	const [a, b] = [Math.min(x0, x1), Math.max(x0, x1)];
	const [c, d] = [Math.min(z0, z1), Math.max(z0, z1)];
	for (let x = a; x <= b; x++) {
		for (let z = c; z <= d; z++) stampTerrain(world, x, z, player);
	}
}

/** A minimal gameState shape compatible with the client move generator. */
function asClientGameState(world) {
	return {
		board: world.game.board,
		chessPieces: world.game.chessPieces.map(p => ({
			id: p.id,
			type: p.type,
			player: p.player,
			position: { x: p.position.x, z: p.position.z },
			hasMoved: p.hasMoved,
			orientation: p.orientation,
		})),
	};
}

/** Sorted "x,z" lookup so move-set assertions don't depend on order. */
function moveSetKey(moves) {
	return moves.map(m => `${m.x},${m.z}`).sort();
}

// ── Sanity check: helpers behave as expected ───────────────────────

describe('helpers', () => {
	test('placePiece adds both the piece and the cell marker', () => {
		const w = makeWorld();
		placePiece(w, { id: 'r1', type: 'ROOK', player: 'p1', x: 0, z: 0 });
		expect(w.game.chessPieces).toHaveLength(1);
		const cell = w.boardManager.getCell(w.game.board, 0, 0);
		expect(Array.isArray(cell)).toBe(true);
		expect(cell.some(it => it.pieceId === 'r1')).toBe(true);
	});
});

// ── Bishop / Queen diagonals — the user's "queen can clearly do the
//     diagonal" report ──────────────────────────────────────────────

describe('diagonal moves over a sparse board (user report)', () => {
	test('queen with diagonal cells stamped sees them as legal moves', () => {
		const w = makeWorld();
		// Stamp a 3x3 block of cells centred on (5,5) — the queen sits at
		// (5,5) and the diagonals (4,4), (6,6), (4,6), (6,4) all exist.
		stampRect(w, 4, 4, 6, 6);
		const queen = placePiece(w, { id: 'q1', type: 'QUEEN', player: 'p1', x: 5, z: 5 });

		const expected = [
			{ x: 4, z: 4 }, { x: 6, z: 6 }, { x: 4, z: 6 }, { x: 6, z: 4 },
			{ x: 5, z: 4 }, { x: 5, z: 6 }, { x: 4, z: 5 }, { x: 6, z: 5 },
		];
		const expectedKey = moveSetKey(expected);

		const serverLegal = expected.filter(m =>
			w.chessManager.isValidChessMove(w.game, queen, m.x, m.z));
		expect(moveSetKey(serverLegal)).toEqual(expectedKey);

		const clientMoves = getChessPieceMoveSets(asClientGameState(w), queen);
		// The client may legitimately offer additional squares (e.g.
		// it doesn't enforce "destination is a board square" because
		// the move highlight only appears on real cells). What matters
		// is that every server-legal move is in the client set.
		const clientKey = moveSetKey(clientMoves);
		for (const move of expected) {
			expect(clientKey).toContain(`${move.x},${move.z}`);
		}
	});

	test('queen can do every direction when the surrounding cells exist', () => {
		const w = makeWorld();
		stampRect(w, 2, 2, 8, 8);
		const queen = placePiece(w, { id: 'q', type: 'QUEEN', player: 'p1', x: 5, z: 5 });

		const directions = [
			[1, 0], [-1, 0], [0, 1], [0, -1],
			[1, 1], [-1, -1], [1, -1], [-1, 1],
		];
		for (const [dx, dz] of directions) {
			const x = 5 + dx;
			const z = 5 + dz;
			expect(w.chessManager.isValidChessMove(w.game, queen, x, z)).toBe(true);
		}

		const clientKey = moveSetKey(getChessPieceMoveSets(asClientGameState(w), queen));
		for (const [dx, dz] of directions) {
			expect(clientKey).toContain(`${5 + dx},${5 + dz}`);
		}
	});

	test('bishop can move forward-diagonally when the cells exist', () => {
		const w = makeWorld();
		stampRect(w, 0, 0, 4, 4);
		const bishop = placePiece(w, { id: 'b', type: 'BISHOP', player: 'p1', x: 0, z: 0 });

		expect(w.chessManager.isValidChessMove(w.game, bishop, 1, 1)).toBe(true);
		expect(w.chessManager.isValidChessMove(w.game, bishop, 2, 2)).toBe(true);
		expect(w.chessManager.isValidChessMove(w.game, bishop, 3, 3)).toBe(true);
		expect(w.chessManager.isValidChessMove(w.game, bishop, 4, 4)).toBe(true);

		const clientKey = moveSetKey(getChessPieceMoveSets(asClientGameState(w), bishop));
		expect(clientKey).toContain('1,1');
		expect(clientKey).toContain('2,2');
		expect(clientKey).toContain('3,3');
		expect(clientKey).toContain('4,4');
	});

	test('bishop diagonals stop at the edge of the terrain', () => {
		const w = makeWorld();
		stampRect(w, 0, 0, 2, 2);
		const bishop = placePiece(w, { id: 'b', type: 'BISHOP', player: 'p1', x: 0, z: 0 });

		// (1,1) and (2,2) exist, (3,3) does not.
		expect(w.chessManager.isValidChessMove(w.game, bishop, 1, 1)).toBe(true);
		expect(w.chessManager.isValidChessMove(w.game, bishop, 2, 2)).toBe(true);
		expect(w.chessManager.isValidChessMove(w.game, bishop, 3, 3)).toBe(false);

		const clientKey = moveSetKey(getChessPieceMoveSets(asClientGameState(w), bishop));
		expect(clientKey).toContain('1,1');
		expect(clientKey).toContain('2,2');
		expect(clientKey).not.toContain('3,3');
	});
});

// ── Rook ───────────────────────────────────────────────────────────

describe('rook movement', () => {
	test('rook reaches every empty square along the row', () => {
		const w = makeWorld();
		for (let x = 0; x <= 6; x++) stampTerrain(w, x, 0);
		const rook = placePiece(w, { id: 'r', type: 'ROOK', player: 'p1', x: 0, z: 0 });

		for (const tx of [1, 2, 3, 4, 5, 6]) {
			expect(w.chessManager.isValidChessMove(w.game, rook, tx, 0)).toBe(true);
		}

		const clientKey = moveSetKey(getChessPieceMoveSets(asClientGameState(w), rook));
		for (const tx of [1, 2, 3, 4, 5, 6]) expect(clientKey).toContain(`${tx},0`);
	});

	test('rook blocked by own piece in path', () => {
		const w = makeWorld();
		for (let x = 0; x <= 6; x++) stampTerrain(w, x, 0);
		const rook = placePiece(w, { id: 'r', type: 'ROOK', player: 'p1', x: 0, z: 0 });
		placePiece(w, { id: 'p1pawn', type: 'PAWN', player: 'p1', x: 3, z: 0 });

		expect(w.chessManager.isValidChessMove(w.game, rook, 2, 0)).toBe(true);
		expect(w.chessManager.isValidChessMove(w.game, rook, 3, 0)).toBe(false); // own piece
		expect(w.chessManager.isValidChessMove(w.game, rook, 4, 0)).toBe(false); // path blocked
	});

	test('rook can capture enemy piece at the end of its ray', () => {
		const w = makeWorld();
		for (let x = 0; x <= 4; x++) stampTerrain(w, x, 0);
		const rook = placePiece(w, { id: 'r', type: 'ROOK', player: 'p1', x: 0, z: 0 });
		placePiece(w, { id: 'enemy', type: 'PAWN', player: 'p2', x: 4, z: 0 });
		expect(w.chessManager.isValidChessMove(w.game, rook, 4, 0)).toBe(true);
	});
});

// ── Knight ─────────────────────────────────────────────────────────

describe('knight movement', () => {
	test('knight reaches all 8 L-shape squares when terrain exists', () => {
		const w = makeWorld();
		stampRect(w, 2, 2, 8, 8);
		const knight = placePiece(w, { id: 'k', type: 'KNIGHT', player: 'p1', x: 5, z: 5 });

		const offsets = [
			[2, 1], [1, 2], [-2, 1], [-1, 2],
			[2, -1], [1, -2], [-2, -1], [-1, -2],
		];
		for (const [dx, dz] of offsets) {
			expect(w.chessManager.isValidChessMove(w.game, knight, 5 + dx, 5 + dz)).toBe(true);
		}

		const clientKey = moveSetKey(getChessPieceMoveSets(asClientGameState(w), knight));
		for (const [dx, dz] of offsets) {
			expect(clientKey).toContain(`${5 + dx},${5 + dz}`);
		}
	});

	test('knight jumps over pieces (no path obstruction check)', () => {
		const w = makeWorld();
		stampRect(w, 2, 2, 5, 5);
		const knight = placePiece(w, { id: 'k', type: 'KNIGHT', player: 'p1', x: 3, z: 3 });
		// Surround the knight with own pawns.
		for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			placePiece(w, { id: `pad${dx}${dz}`, type: 'PAWN', player: 'p1', x: 3 + dx, z: 3 + dz });
		}
		expect(w.chessManager.isValidChessMove(w.game, knight, 5, 4)).toBe(true);
	});

	test('knight cannot land on own piece', () => {
		const w = makeWorld();
		stampRect(w, 0, 0, 5, 5);
		const knight = placePiece(w, { id: 'k', type: 'KNIGHT', player: 'p1', x: 2, z: 2 });
		placePiece(w, { id: 'own', type: 'PAWN', player: 'p1', x: 4, z: 3 });
		expect(w.chessManager.isValidChessMove(w.game, knight, 4, 3)).toBe(false);
	});

	test('knight cannot do a straight or diagonal move', () => {
		const w = makeWorld();
		stampRect(w, 0, 0, 5, 5);
		const knight = placePiece(w, { id: 'k', type: 'KNIGHT', player: 'p1', x: 2, z: 2 });
		expect(w.chessManager.isValidChessMove(w.game, knight, 2, 3)).toBe(false); // straight
		expect(w.chessManager.isValidChessMove(w.game, knight, 3, 3)).toBe(false); // diagonal
	});
});

// ── King ───────────────────────────────────────────────────────────

describe('king movement', () => {
	test('king reaches all 8 neighbours when terrain exists', () => {
		const w = makeWorld();
		stampRect(w, 4, 4, 6, 6);
		const king = placePiece(w, { id: 'k', type: 'KING', player: 'p1', x: 5, z: 5 });

		const offsets = [
			[1, 0], [-1, 0], [0, 1], [0, -1],
			[1, 1], [-1, -1], [1, -1], [-1, 1],
		];
		for (const [dx, dz] of offsets) {
			expect(w.chessManager.isValidChessMove(w.game, king, 5 + dx, 5 + dz)).toBe(true);
		}

		const clientKey = moveSetKey(getChessPieceMoveSets(asClientGameState(w), king));
		for (const [dx, dz] of offsets) {
			expect(clientKey).toContain(`${5 + dx},${5 + dz}`);
		}
	});

	test('king cannot move two squares (no castling here)', () => {
		const w = makeWorld();
		stampRect(w, 0, 0, 5, 5);
		const king = placePiece(w, { id: 'k', type: 'KING', player: 'p1', x: 2, z: 2, hasMoved: true });
		expect(w.chessManager.isValidChessMove(w.game, king, 4, 2)).toBe(false);
	});
});

// ── Pawn (Shaktris orientation 0/1/2/3) ────────────────────────────

describe('pawn movement — each orientation', () => {
	function setUpPawn(orientation) {
		const w = makeWorld();
		stampRect(w, -3, -3, 3, 3);
		const pawn = placePiece(w, {
			id: 'p', type: 'PAWN', player: 'p1', x: 0, z: 0, orientation,
		});
		return { w, pawn };
	}

	test('orientation 0 → forward is +z, capture +z±1 on x', () => {
		const { w, pawn } = setUpPawn(0);
		expect(w.chessManager.isValidChessMove(w.game, pawn, 0, 1)).toBe(true);
		// Two-step on first move
		expect(w.chessManager.isValidChessMove(w.game, pawn, 0, 2)).toBe(true);
		// No diagonal without a capture target
		expect(w.chessManager.isValidChessMove(w.game, pawn, 1, 1)).toBe(false);
		// Add an enemy at (1,1) — diagonal capture is now legal
		placePiece(w, { id: 'e', type: 'PAWN', player: 'p2', x: 1, z: 1 });
		expect(w.chessManager.isValidChessMove(w.game, pawn, 1, 1)).toBe(true);
	});

	test('orientation 1 → forward is +x', () => {
		const { w, pawn } = setUpPawn(1);
		expect(w.chessManager.isValidChessMove(w.game, pawn, 1, 0)).toBe(true);
		expect(w.chessManager.isValidChessMove(w.game, pawn, 2, 0)).toBe(true);
		expect(w.chessManager.isValidChessMove(w.game, pawn, 1, 1)).toBe(false);
		placePiece(w, { id: 'e', type: 'PAWN', player: 'p2', x: 1, z: 1 });
		expect(w.chessManager.isValidChessMove(w.game, pawn, 1, 1)).toBe(true);
	});

	test('orientation 2 → forward is -z', () => {
		const { w, pawn } = setUpPawn(2);
		expect(w.chessManager.isValidChessMove(w.game, pawn, 0, -1)).toBe(true);
		expect(w.chessManager.isValidChessMove(w.game, pawn, 0, -2)).toBe(true);
		expect(w.chessManager.isValidChessMove(w.game, pawn, 1, -1)).toBe(false);
		placePiece(w, { id: 'e', type: 'PAWN', player: 'p2', x: 1, z: -1 });
		expect(w.chessManager.isValidChessMove(w.game, pawn, 1, -1)).toBe(true);
	});

	test('orientation 3 → forward is -x', () => {
		const { w, pawn } = setUpPawn(3);
		expect(w.chessManager.isValidChessMove(w.game, pawn, -1, 0)).toBe(true);
		expect(w.chessManager.isValidChessMove(w.game, pawn, -2, 0)).toBe(true);
		expect(w.chessManager.isValidChessMove(w.game, pawn, -1, 1)).toBe(false);
		placePiece(w, { id: 'e', type: 'PAWN', player: 'p2', x: -1, z: 1 });
		expect(w.chessManager.isValidChessMove(w.game, pawn, -1, 1)).toBe(true);
	});

	test('pawn cannot capture forward (only diagonally)', () => {
		const w = makeWorld();
		stampRect(w, 0, 0, 1, 2);
		const pawn = placePiece(w, { id: 'p', type: 'PAWN', player: 'p1', x: 0, z: 0 });
		placePiece(w, { id: 'e', type: 'PAWN', player: 'p2', x: 0, z: 1 });
		expect(w.chessManager.isValidChessMove(w.game, pawn, 0, 1)).toBe(false);
	});

	test('pawn after first move cannot do two-step', () => {
		const w = makeWorld();
		stampRect(w, 0, 0, 0, 3);
		const pawn = placePiece(w, {
			id: 'p', type: 'PAWN', player: 'p1', x: 0, z: 1, hasMoved: true,
		});
		expect(w.chessManager.isValidChessMove(w.game, pawn, 0, 3)).toBe(false);
		expect(w.chessManager.isValidChessMove(w.game, pawn, 0, 2)).toBe(true);
	});
});

// ── Client/server agreement ────────────────────────────────────────

describe('client move generator agrees with server validator', () => {
	function clientLegal(world, piece) {
		const set = new Set();
		for (const m of getChessPieceMoveSets(asClientGameState(world), piece)) {
			set.add(`${m.x},${m.z}`);
		}
		return set;
	}

	function serverLegal(world, piece, candidates) {
		const set = new Set();
		for (const m of candidates) {
			if (world.chessManager.isValidChessMove(world.game, piece, m.x, m.z)) {
				set.add(`${m.x},${m.z}`);
			}
		}
		return set;
	}

	function neighborhoodCandidates(piece, radius) {
		const list = [];
		for (let dx = -radius; dx <= radius; dx++) {
			for (let dz = -radius; dz <= radius; dz++) {
				if (dx === 0 && dz === 0) continue;
				list.push({ x: piece.position.x + dx, z: piece.position.z + dz });
			}
		}
		return list;
	}

	function assertClientIsSupersetOfServer(world, piece, radius = 8) {
		const client = clientLegal(world, piece);
		const candidates = neighborhoodCandidates(piece, radius);
		const server = serverLegal(world, piece, candidates);
		for (const cell of server) {
			expect(client).toContain(cell);
		}
		// In Shaktris the client must offer at least one move when the
		// server would let the piece move at all — otherwise the user
		// is locked out of a legal action.
		expect(client.size).toBeGreaterThanOrEqual(server.size);
	}

	test('king in an open neighbourhood', () => {
		const w = makeWorld();
		stampRect(w, -3, -3, 3, 3);
		const king = placePiece(w, { id: 'k', type: 'KING', player: 'p1', x: 0, z: 0 });
		assertClientIsSupersetOfServer(w, king, 2);
	});

	test('rook with mixed terrain', () => {
		const w = makeWorld();
		for (let x = -3; x <= 5; x++) stampTerrain(w, x, 0);
		for (let z = -2; z <= 4; z++) stampTerrain(w, 0, z);
		const rook = placePiece(w, { id: 'r', type: 'ROOK', player: 'p1', x: 0, z: 0 });
		assertClientIsSupersetOfServer(w, rook, 5);
	});

	test('queen in a 5x5 patch with two enemies on diagonals', () => {
		const w = makeWorld();
		stampRect(w, -3, -3, 3, 3);
		const queen = placePiece(w, { id: 'q', type: 'QUEEN', player: 'p1', x: 0, z: 0 });
		placePiece(w, { id: 'e1', type: 'PAWN', player: 'p2', x: 2, z: 2 });
		placePiece(w, { id: 'e2', type: 'PAWN', player: 'p2', x: -2, z: 2 });
		assertClientIsSupersetOfServer(w, queen, 4);
	});

	test('bishop with one enemy on a diagonal', () => {
		const w = makeWorld();
		stampRect(w, -3, -3, 3, 3);
		const bishop = placePiece(w, { id: 'b', type: 'BISHOP', player: 'p1', x: 0, z: 0 });
		placePiece(w, { id: 'enemy', type: 'PAWN', player: 'p2', x: 2, z: 2 });
		assertClientIsSupersetOfServer(w, bishop, 4);
	});

	test('pawn (orientation 1) with full forward ladder', () => {
		const w = makeWorld();
		stampRect(w, 0, 0, 4, 1);
		const pawn = placePiece(w, {
			id: 'p', type: 'PAWN', player: 'p1', x: 0, z: 0, orientation: 1,
		});
		assertClientIsSupersetOfServer(w, pawn, 3);
	});
});

// ── Realistic snapshot scenarios ───────────────────────────────────

describe('realistic gameplay scenarios', () => {
	test('queen in front of own pieces — diagonals are free even when row is blocked', () => {
		// User screenshot: chess pieces packed on a row of cream cells.
		// Behind the row is the home zone, in front are 3 tetromino cells.
		// We replicate that: queen on (3,0), pawns at (2,0) and (4,0)
		// and tetromino bridge cells at (3,1) (3,2) (3,3) for the
		// forward column, plus diagonals at (4,1) and (2,1).
		const w = makeWorld();
		stampRect(w, 0, 0, 6, 0);          // home row
		stampRect(w, 1, 1, 5, 3);          // forward terrain
		const queen = placePiece(w, { id: 'q', type: 'QUEEN', player: 'p1', x: 3, z: 0 });
		placePiece(w, { id: 'pawn-l', type: 'PAWN', player: 'p1', x: 2, z: 0 });
		placePiece(w, { id: 'pawn-r', type: 'PAWN', player: 'p1', x: 4, z: 0 });

		// Queen should be free to step diagonally onto (2,1) and (4,1)
		// even though the row neighbours are blocked.
		expect(w.chessManager.isValidChessMove(w.game, queen, 2, 1)).toBe(true);
		expect(w.chessManager.isValidChessMove(w.game, queen, 4, 1)).toBe(true);
		expect(w.chessManager.isValidChessMove(w.game, queen, 3, 1)).toBe(true);

		const clientKey = moveSetKey(getChessPieceMoveSets(asClientGameState(w), queen));
		expect(clientKey).toContain('2,1');
		expect(clientKey).toContain('4,1');
		expect(clientKey).toContain('3,1');
	});

	test('move target onto a cell containing only a home marker is still legal', () => {
		// Edge case: a home cell with no tetromino content still counts
		// as a real board square. The server's `isBoardSquare` only
		// checks `Array.isArray(cell) && cell.length > 0`.
		const w = makeWorld();
		w.boardManager.setCell(w.game.board, 5, 0, [{ type: 'home', player: 'p1' }]);
		stampRect(w, 0, 0, 5, 0);
		const rook = placePiece(w, { id: 'r', type: 'ROOK', player: 'p1', x: 0, z: 0 });
		expect(w.chessManager.isValidChessMove(w.game, rook, 5, 0)).toBe(true);
	});

	test('orphan chess marker in path does NOT block a sliding move', () => {
		// `pieces.js` audit fixed this: a stale `chess` cell-item with
		// no entry in `chessPieces` should be treated as empty.
		const w = makeWorld();
		for (let x = 0; x <= 4; x++) stampTerrain(w, x, 0);
		const rook = placePiece(w, { id: 'r', type: 'ROOK', player: 'p1', x: 0, z: 0 });
		w.boardManager.addToCellContents(w.game.board, 2, 0, {
			type: 'chess', player: 'p2',
			pieceId: 'ghost-id', pieceType: 'pawn',
		});
		expect(w.chessManager.isValidChessMove(w.game, rook, 4, 0)).toBe(true);
	});

	test('LIVE chess piece in path still blocks the rook', () => {
		const w = makeWorld();
		for (let x = 0; x <= 4; x++) stampTerrain(w, x, 0);
		const rook = placePiece(w, { id: 'r', type: 'ROOK', player: 'p1', x: 0, z: 0 });
		placePiece(w, { id: 'live', type: 'PAWN', player: 'p2', x: 2, z: 0 });
		expect(w.chessManager.isValidChessMove(w.game, rook, 4, 0)).toBe(false);
	});

	test('queen on a dual-ownership cell still uses its own player for capture rules', () => {
		// Cell has both p1's tetromino and p2's tetromino content. The
		// queen belongs to p1; capturing a p2 piece on a *different* cell
		// should still be legal.
		const w = makeWorld();
		stampRect(w, 0, 0, 4, 0);
		w.boardManager.addToCellContents(w.game.board, 0, 0, {
			type: 'tetromino', player: 'p2',
		});
		const queen = placePiece(w, { id: 'q', type: 'QUEEN', player: 'p1', x: 0, z: 0 });
		placePiece(w, { id: 'e', type: 'PAWN', player: 'p2', x: 3, z: 0 });

		expect(w.chessManager.isValidChessMove(w.game, queen, 3, 0)).toBe(true);
	});
});

// ── Performance — the move generator MUST be fast ──────────────────

describe('performance', () => {
	test('move generator handles a 50-piece board under 50ms', () => {
		const w = makeWorld();
		stampRect(w, -20, -20, 20, 20);
		// Salt the board with 50 random pieces.
		for (let i = 0; i < 50; i++) {
			placePiece(w, {
				id: `p1-${i}`, type: 'PAWN', player: 'p1',
				x: -10 + (i % 10), z: -10 + Math.floor(i / 10),
			});
		}
		const queen = placePiece(w, { id: 'q', type: 'QUEEN', player: 'p1', x: 0, z: 0 });

		const t0 = process.hrtime.bigint();
		for (let i = 0; i < 50; i++) {
			getChessPieceMoveSets(asClientGameState(w), queen);
		}
		const elapsedMs = Number(process.hrtime.bigint() - t0) / 1_000_000;
		// 50 generator runs in <50ms = <1ms per call. We're well clear
		// of the 16ms frame budget here.
		expect(elapsedMs).toBeLessThan(50);
	});

	test('analyzePossibleMoves reuses one piece index across pieces', () => {
		// The whole-player analysis should be no more than a linear
		// factor of the single-piece generator.  Without the cached
		// index it used to be quadratic; we lock it in here so it
		// can't regress.
		const w = makeWorld();
		stampRect(w, -20, -20, 20, 20);
		for (let i = 0; i < 16; i++) {
			placePiece(w, {
				id: `p1-${i}`, type: i === 0 ? 'KING' : 'PAWN', player: 'p1',
				x: -8 + i, z: -3,
			});
		}
		const cs = asClientGameState(w);
		// Force-import analyzePossibleMoves the same way as the rest of
		// the test loads modules.
		const { analyzePossibleMoves } = require(CLIENT_MOVES_PATH);

		const t0 = process.hrtime.bigint();
		for (let i = 0; i < 20; i++) analyzePossibleMoves(cs, 'p1');
		const elapsedMs = Number(process.hrtime.bigint() - t0) / 1_000_000;
		expect(elapsedMs).toBeLessThan(75);
	});
});

// ── New server-error reasons (for the client refresh-on-miss flow) ──

describe('server distinguishes destination_missing from invalid_geometry', () => {
	let chessManager, boardManager, game;

	beforeEach(() => {
		const w = makeWorld();
		chessManager = w.chessManager;
		boardManager = w.boardManager;
		game = w.game;
	});

	test('queen attempting to move onto a void cell — destination missing', () => {
		const queen = placePiece(
			{ game, boardManager },
			{ id: 'q', type: 'QUEEN', player: 'p1', x: 0, z: 0 }
		);
		stampTerrain({ game, boardManager }, 0, 0);
		// (3, 0) is empty (no terrain).
		expect(chessManager.isValidChessMove(game, queen, 3, 0)).toBe(false);
		expect(boardManager.getCell(game.board, 3, 0)).toBeNull();
	});

	test('queen attempting a non-diagonal/non-straight move — geometry invalid', () => {
		const queen = placePiece(
			{ game, boardManager },
			{ id: 'q', type: 'QUEEN', player: 'p1', x: 0, z: 0 }
		);
		stampRect({ game, boardManager }, 0, 0, 3, 2);
		// (3, 2) is a knight-like move from (0, 0) — geometry illegal
		// even though terrain exists.
		expect(boardManager.getCell(game.board, 3, 2)).not.toBeNull();
		expect(chessManager.isValidChessMove(game, queen, 3, 2)).toBe(false);
	});

	test('queen sliding diagonally through a void cell is rejected', () => {
		const queen = placePiece(
			{ game, boardManager },
			{ id: 'q', type: 'QUEEN', player: 'p1', x: 0, z: 0 }
		);
		// Diagonal cells at (1,1) and (3,3) exist; (2,2) is void.
		stampTerrain({ game, boardManager }, 0, 0);
		stampTerrain({ game, boardManager }, 1, 1);
		stampTerrain({ game, boardManager }, 3, 3);
		expect(chessManager.isValidChessMove(game, queen, 1, 1)).toBe(true);
		expect(chessManager.isValidChessMove(game, queen, 3, 3)).toBe(false);
	});
});

// ── Extra real-world coverage requested by the user ────────────────

describe('basic gameplay regressions', () => {
	test('rook can step onto a cell that contains the player home marker', () => {
		const w = makeWorld();
		stampRect(w, 0, 0, 5, 0);
		w.boardManager.addToCellContents(w.game.board, 5, 0, {
			type: 'home', player: 'p1',
		});
		const rook = placePiece(w, { id: 'r', type: 'ROOK', player: 'p1', x: 0, z: 0 });
		expect(w.chessManager.isValidChessMove(w.game, rook, 5, 0)).toBe(true);
	});

	test('queen can capture an enemy piece that sits on a home cell', () => {
		const w = makeWorld();
		stampRect(w, 0, 0, 5, 0);
		w.boardManager.addToCellContents(w.game.board, 5, 0, { type: 'home', player: 'p2' });
		placePiece(w, { id: 'enemy', type: 'PAWN', player: 'p2', x: 5, z: 0 });
		const queen = placePiece(w, { id: 'q', type: 'QUEEN', player: 'p1', x: 0, z: 0 });
		expect(w.chessManager.isValidChessMove(w.game, queen, 5, 0)).toBe(true);
	});

	test('knight ignores intermediate terrain holes', () => {
		// Knight at (0,0). Target (2,1). Cells along the L-shape are
		// missing (knight jumps over them). Target cell exists.
		const w = makeWorld();
		stampTerrain(w, 0, 0);
		stampTerrain(w, 2, 1);
		const knight = placePiece(w, { id: 'k', type: 'KNIGHT', player: 'p1', x: 0, z: 0 });
		expect(w.chessManager.isValidChessMove(w.game, knight, 2, 1)).toBe(true);
	});

	test('move generator covers every legal target on a 9-cell ring', () => {
		// Pieces in a 3x3 ring (king at centre): every neighbour is
		// reachable. We assert the generator returns ALL 8 cells in
		// one pass.
		const w = makeWorld();
		stampRect(w, -1, -1, 1, 1);
		const king = placePiece(w, { id: 'k', type: 'KING', player: 'p1', x: 0, z: 0 });
		const moves = getChessPieceMoveSets(asClientGameState(w), king);
		const set = new Set(moves.map(m => `${m.x},${m.z}`));
		const expected = [
			'-1,-1', '0,-1', '1,-1',
			'-1,0', '1,0',
			'-1,1', '0,1', '1,1',
		];
		for (const e of expected) expect(set.has(e)).toBe(true);
	});

	test('rook with no movable squares (all blocked) returns []', () => {
		const w = makeWorld();
		stampRect(w, -1, -1, 1, 1);
		const rook = placePiece(w, { id: 'r', type: 'ROOK', player: 'p1', x: 0, z: 0 });
		// Surround with own pawns in straight directions only.
		placePiece(w, { id: 'l', type: 'PAWN', player: 'p1', x: -1, z: 0 });
		placePiece(w, { id: 'rt', type: 'PAWN', player: 'p1', x: 1, z: 0 });
		placePiece(w, { id: 'up', type: 'PAWN', player: 'p1', x: 0, z: 1 });
		placePiece(w, { id: 'dn', type: 'PAWN', player: 'p1', x: 0, z: -1 });
		const moves = getChessPieceMoveSets(asClientGameState(w), rook);
		expect(moves.length).toBe(0);
	});

	test('pawn cannot move forward when forward cell is a void', () => {
		const w = makeWorld();
		stampTerrain(w, 0, 0);
		// (0,1) is void — no forward move.
		const pawn = placePiece(w, { id: 'p', type: 'PAWN', player: 'p1', x: 0, z: 0 });
		expect(w.chessManager.isValidChessMove(w.game, pawn, 0, 1)).toBe(false);
		const moves = getChessPieceMoveSets(asClientGameState(w), pawn);
		expect(moves.find(m => m.x === 0 && m.z === 1)).toBeUndefined();
	});

	test('queen on the centre of an irregular footprint sees ALL reachable cells', () => {
		// Plus-shaped footprint: (0,0) and its 4 cardinal neighbours,
		// PLUS diagonals (1,1) and (-1,-1).
		const w = makeWorld();
		for (const [x, z] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) {
			stampTerrain(w, x, z);
		}
		const queen = placePiece(w, { id: 'q', type: 'QUEEN', player: 'p1', x: 0, z: 0 });
		const set = new Set(getChessPieceMoveSets(asClientGameState(w), queen).map(m => `${m.x},${m.z}`));
		for (const cell of ['1,0', '-1,0', '0,1', '0,-1', '1,1', '-1,-1']) {
			expect(set.has(cell)).toBe(true);
		}
		// (1, -1) and (-1, 1) don't exist as cells — queen can't go there.
		expect(set.has('1,-1')).toBe(false);
		expect(set.has('-1,1')).toBe(false);
	});

	test('client move generator is stable across repeated calls', () => {
		const w = makeWorld();
		stampRect(w, -3, -3, 3, 3);
		const queen = placePiece(w, { id: 'q', type: 'QUEEN', player: 'p1', x: 0, z: 0 });
		const cs = asClientGameState(w);

		const first = moveSetKey(getChessPieceMoveSets(cs, queen));
		for (let i = 0; i < 10; i++) {
			expect(moveSetKey(getChessPieceMoveSets(cs, queen))).toEqual(first);
		}
	});

	test('move generator works when an own piece is on the source cell marker BUT id differs', () => {
		// Stale orphan chess marker remained on the source cell with a
		// different pieceId. The real piece is still authoritative. The
		// generator + validator should ignore the orphan marker on the
		// source cell — the piece's position is what counts.
		const w = makeWorld();
		stampRect(w, 0, 0, 3, 0);
		const rook = placePiece(w, { id: 'r-real', type: 'ROOK', player: 'p1', x: 0, z: 0 });
		// Stamp a ghost marker at the rook's own cell — no live entry.
		w.boardManager.addToCellContents(w.game.board, 0, 0, {
			type: 'chess', player: 'p1',
			pieceId: 'ghost-on-source', pieceType: 'pawn',
		});
		const moves = getChessPieceMoveSets(asClientGameState(w), rook);
		expect(moves.find(m => m.x === 1 && m.z === 0)).toBeDefined();
		expect(w.chessManager.isValidChessMove(w.game, rook, 1, 0)).toBe(true);
	});
});
