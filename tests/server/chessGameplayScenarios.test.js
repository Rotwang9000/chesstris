/**
 * BASIC GAMEPLAY SCENARIOS — the user demanded these tests after
 * reporting "Every move is coming up Invalid chess move… These
 * aren't even edge cases but basic gameplay fails".
 *
 * The strategy is:
 *   - build small sparse boards that mirror what a player would see
 *     in a real session,
 *   - ask BOTH the server validator (`isValidChessMove`) and the
 *     client move generator (`getChessPieceMoveSets`) what they think,
 *   - assert they agree on the SAME set of legal moves.
 *
 * Tests that fail today should be fixed (or the engine corrected).
 * "Wide view" wins — this file is intentionally bigger than feels
 * comfortable because the user has lost too many pieces to vague
 * rejections.
 */

const path = require('path');

const BoardManager = require('../../server/game/BoardManager');
const IslandManager = require('../../server/game/IslandManager');
const ChessManager = require('../../server/game/ChessManager');

const CLIENT_MOVES_PATH = path.resolve(
	__dirname, '..', '..', 'public', 'js', 'boardFunctions', 'moves.js'
);
const { getChessPieceMoveSets } = require(CLIENT_MOVES_PATH);

// ── Helpers ────────────────────────────────────────────────────────

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

function placePiece(world, opts) {
	const { id, type, player, x, z, hasMoved = false, orientation = 0 } = opts;
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

function stampTerrain(world, x, z, player = 'p1', kind = 'tetromino') {
	if (!world.boardManager.getCell(world.game.board, x, z)) {
		world.boardManager.setCell(world.game.board, x, z, [
			{ type: kind, player },
		]);
	}
}

function stampRect(world, x0, z0, x1, z1, player = 'p1') {
	const [a, b] = [Math.min(x0, x1), Math.max(x0, x1)];
	const [c, d] = [Math.min(z0, z1), Math.max(z0, z1)];
	for (let x = a; x <= b; x++) {
		for (let z = c; z <= d; z++) stampTerrain(world, x, z, player);
	}
}

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

function clientLegalSet(world, piece) {
	const set = new Set();
	for (const m of getChessPieceMoveSets(asClientGameState(world), piece)) {
		set.add(`${m.x},${m.z}`);
	}
	return set;
}

function serverLegalSet(world, piece, candidates) {
	const set = new Set();
	for (const m of candidates) {
		if (world.chessManager.isValidChessMove(world.game, piece, m.x, m.z)) {
			set.add(`${m.x},${m.z}`);
		}
	}
	return set;
}

function neighborhood(piece, r) {
	const list = [];
	for (let dx = -r; dx <= r; dx++) {
		for (let dz = -r; dz <= r; dz++) {
			if (dx === 0 && dz === 0) continue;
			list.push({ x: piece.position.x + dx, z: piece.position.z + dz });
		}
	}
	return list;
}

/**
 * Strict client/server agreement — every server-legal move MUST appear
 * in the client move set, AND every client move set entry MUST be
 * server-legal (so we're not letting the client offer phantom moves).
 *
 * This is the assertion the user actually cares about: "click the
 * highlighted square, the server accepts it".
 */
function assertExactAgreement(world, piece, radius = 6) {
	const client = clientLegalSet(world, piece);
	const candidates = neighborhood(piece, radius);
	const server = serverLegalSet(world, piece, candidates);
	for (const cell of server) {
		expect(client).toContain(cell);
	}
	// Critically: every offered move should be accepted.
	for (const cell of client) {
		const [x, z] = cell.split(',').map(Number);
		expect(world.chessManager.isValidChessMove(world.game, piece, x, z)).toBe(true);
	}
}

// ── 1. Diagonal queen — user's screenshot ──────────────────────────

describe('queen diagonals on a tiny terrain footprint', () => {
	test('queen on a packed home row sees forward diagonals', () => {
		const w = makeWorld();
		// Replicates the user screenshot: row of pieces at z=0, a
		// strip of terrain extending forward.
		stampRect(w, 0, 0, 6, 0, 'p1');
		stampRect(w, 0, 1, 6, 1, 'p1');
		const queen = placePiece(w, { id: 'q', type: 'QUEEN', player: 'p1', x: 3, z: 0 });
		placePiece(w, { id: 'L', type: 'PAWN', player: 'p1', x: 2, z: 0 });
		placePiece(w, { id: 'R', type: 'PAWN', player: 'p1', x: 4, z: 0 });

		expect(w.chessManager.isValidChessMove(w.game, queen, 2, 1)).toBe(true);
		expect(w.chessManager.isValidChessMove(w.game, queen, 4, 1)).toBe(true);
		expect(w.chessManager.isValidChessMove(w.game, queen, 3, 1)).toBe(true);

		const client = clientLegalSet(w, queen);
		expect(client).toContain('2,1');
		expect(client).toContain('4,1');
		expect(client).toContain('3,1');
	});

	test('queen with terrain only on the diagonal still offers diagonal slides', () => {
		const w = makeWorld();
		// Just the queen's square + a single forward diagonal step.
		stampTerrain(w, 5, 5);
		stampTerrain(w, 6, 6);
		stampTerrain(w, 4, 4);
		const queen = placePiece(w, { id: 'q', type: 'QUEEN', player: 'p1', x: 5, z: 5 });
		expect(w.chessManager.isValidChessMove(w.game, queen, 6, 6)).toBe(true);
		expect(w.chessManager.isValidChessMove(w.game, queen, 4, 4)).toBe(true);
		assertExactAgreement(w, queen);
	});

	test('queen on a "T" footprint — every accessible square is offered', () => {
		const w = makeWorld();
		// Plus footprint:  centre + N + S + E + W + NE + SW
		for (const [x, z] of [
			[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1],
		]) stampTerrain(w, x, z);
		const queen = placePiece(w, { id: 'q', type: 'QUEEN', player: 'p1', x: 0, z: 0 });
		assertExactAgreement(w, queen);
	});
});

// ── 2. Bishop bidirectional ────────────────────────────────────────

describe('bishop diagonal moves (the "forwards only" bug)', () => {
	test('bishop in a 3x3 patch offers all four diagonals', () => {
		const w = makeWorld();
		stampRect(w, -1, -1, 1, 1);
		const b = placePiece(w, { id: 'b', type: 'BISHOP', player: 'p1', x: 0, z: 0 });
		assertExactAgreement(w, b, 2);
		const client = clientLegalSet(w, b);
		expect(client).toContain('1,1');
		expect(client).toContain('-1,1');
		expect(client).toContain('1,-1');
		expect(client).toContain('-1,-1');
	});

	test('bishop blocked one direction still moves the other three', () => {
		const w = makeWorld();
		stampRect(w, -2, -2, 2, 2);
		const b = placePiece(w, { id: 'b', type: 'BISHOP', player: 'p1', x: 0, z: 0 });
		placePiece(w, { id: 'block', type: 'PAWN', player: 'p1', x: 1, z: 1 });
		const client = clientLegalSet(w, b);
		expect(client).not.toContain('1,1');
		expect(client).not.toContain('2,2');
		expect(client).toContain('-1,1');
		expect(client).toContain('1,-1');
		expect(client).toContain('-1,-1');
	});
});

// ── 3. Pawn orientation, two-step, capture matrix ──────────────────

describe('pawn movement in every orientation', () => {
	for (const orientation of [0, 1, 2, 3]) {
		const fwd = ({ 0: [0, 1], 1: [1, 0], 2: [0, -1], 3: [-1, 0] })[orientation];
		test(`pawn (orientation ${orientation}) forward one + two-step`, () => {
			const w = makeWorld();
			stampRect(w, -3, -3, 3, 3);
			const p = placePiece(w, {
				id: 'p', type: 'PAWN', player: 'p1',
				x: 0, z: 0, orientation,
			});
			const oneX = fwd[0], oneZ = fwd[1];
			const twoX = fwd[0] * 2, twoZ = fwd[1] * 2;
			expect(w.chessManager.isValidChessMove(w.game, p, oneX, oneZ)).toBe(true);
			expect(w.chessManager.isValidChessMove(w.game, p, twoX, twoZ)).toBe(true);
			const client = clientLegalSet(w, p);
			expect(client).toContain(`${oneX},${oneZ}`);
			expect(client).toContain(`${twoX},${twoZ}`);
		});

		test(`pawn (orientation ${orientation}) diagonal captures only when target enemy`, () => {
			const w = makeWorld();
			stampRect(w, -3, -3, 3, 3);
			const p = placePiece(w, {
				id: 'p', type: 'PAWN', player: 'p1',
				x: 0, z: 0, orientation,
			});
			const diagonals = fwd[0] === 0
				? [{ dx: -1, dz: fwd[1] }, { dx: 1, dz: fwd[1] }]
				: [{ dx: fwd[0], dz: -1 }, { dx: fwd[0], dz: 1 }];

			for (const d of diagonals) {
				const tx = d.dx, tz = d.dz;
				expect(w.chessManager.isValidChessMove(w.game, p, tx, tz)).toBe(false);
				const before = clientLegalSet(w, p);
				expect(before.has(`${tx},${tz}`)).toBe(false);
			}

			// Now stamp an enemy in one diagonal — the move should now appear.
			const target = diagonals[0];
			placePiece(w, { id: 'e', type: 'PAWN', player: 'p2', x: target.dx, z: target.dz });
			expect(w.chessManager.isValidChessMove(w.game, p, target.dx, target.dz)).toBe(true);
			const after = clientLegalSet(w, p);
			expect(after).toContain(`${target.dx},${target.dz}`);
		});
	}
});

// ── 4. Pawn after promotion — should move like a queen ─────────────

describe('pawn that has been promoted', () => {
	test('after promote to QUEEN, generator + validator agree on queen moves', () => {
		const w = makeWorld();
		stampRect(w, -3, -3, 3, 3);
		const promoted = placePiece(w, {
			id: 'P', type: 'QUEEN', player: 'p1',
			x: 0, z: 0, orientation: 1, hasMoved: true,
		});
		// The piece's `type` is now QUEEN, so the engine + client
		// generator should offer queen moves.
		assertExactAgreement(w, promoted);
	});

	test('after promote to KNIGHT, generator + validator agree on knight moves', () => {
		const w = makeWorld();
		stampRect(w, -3, -3, 3, 3);
		const promoted = placePiece(w, {
			id: 'P', type: 'KNIGHT', player: 'p1',
			x: 0, z: 0, orientation: 1, hasMoved: true,
		});
		assertExactAgreement(w, promoted);
	});
});

// ── 5. King moves & castling ───────────────────────────────────────

describe('king + castling rules', () => {
	test('unmoved king can castle short when rook and path are clear', () => {
		const w = makeWorld();
		stampRect(w, 0, 0, 7, 0);
		const king = placePiece(w, { id: 'k', type: 'KING', player: 'p1', x: 4, z: 0 });
		const rook = placePiece(w, { id: 'r', type: 'ROOK', player: 'p1', x: 7, z: 0 });
		expect(w.chessManager.isValidChessMove(w.game, king, 6, 0)).toBe(true);
		// Cleanup unused var.
		expect(rook.hasMoved).toBe(false);
	});

	test('king cannot castle through a chess piece', () => {
		const w = makeWorld();
		stampRect(w, 0, 0, 7, 0);
		const king = placePiece(w, { id: 'k', type: 'KING', player: 'p1', x: 4, z: 0 });
		placePiece(w, { id: 'r', type: 'ROOK', player: 'p1', x: 7, z: 0 });
		placePiece(w, { id: 'b', type: 'BISHOP', player: 'p1', x: 5, z: 0 });
		expect(w.chessManager.isValidChessMove(w.game, king, 6, 0)).toBe(false);
	});

	test('king cannot castle over a gap in the board', () => {
		const w = makeWorld();
		// (5,0) is missing — there's a void between king and rook.
		stampTerrain(w, 4, 0);
		stampTerrain(w, 6, 0);
		stampTerrain(w, 7, 0);
		const king = placePiece(w, { id: 'k', type: 'KING', player: 'p1', x: 4, z: 0 });
		placePiece(w, { id: 'r', type: 'ROOK', player: 'p1', x: 7, z: 0 });
		expect(w.chessManager.isValidChessMove(w.game, king, 6, 0)).toBe(false);
	});

	test('king after moving cannot castle even if path is clear', () => {
		const w = makeWorld();
		stampRect(w, 0, 0, 7, 0);
		const king = placePiece(w, {
			id: 'k', type: 'KING', player: 'p1', x: 4, z: 0, hasMoved: true,
		});
		placePiece(w, { id: 'r', type: 'ROOK', player: 'p1', x: 7, z: 0 });
		expect(w.chessManager.isValidChessMove(w.game, king, 6, 0)).toBe(false);
	});
});

// ── 6. Captures: the user's "knight just disappeared" ──────────────

describe('captures emit the correct move-set entries', () => {
	test('knight capture is offered by the client when an enemy sits on its L', () => {
		const w = makeWorld();
		stampTerrain(w, 0, 0);
		stampTerrain(w, 2, 1);
		const knight = placePiece(w, { id: 'k', type: 'KNIGHT', player: 'p1', x: 0, z: 0 });
		placePiece(w, { id: 'e', type: 'PAWN', player: 'p2', x: 2, z: 1 });

		expect(w.chessManager.isValidChessMove(w.game, knight, 2, 1)).toBe(true);
		expect(clientLegalSet(w, knight)).toContain('2,1');
	});

	test('queen capture along a long diagonal is offered', () => {
		const w = makeWorld();
		stampRect(w, 0, 0, 4, 4);
		const q = placePiece(w, { id: 'q', type: 'QUEEN', player: 'p1', x: 0, z: 0 });
		placePiece(w, { id: 'e', type: 'PAWN', player: 'p2', x: 4, z: 4 });
		expect(w.chessManager.isValidChessMove(w.game, q, 4, 4)).toBe(true);
		expect(clientLegalSet(w, q)).toContain('4,4');
	});

	test('rook cannot jump over a captureable enemy to reach an empty square beyond', () => {
		const w = makeWorld();
		for (let x = 0; x <= 4; x++) stampTerrain(w, x, 0);
		const r = placePiece(w, { id: 'r', type: 'ROOK', player: 'p1', x: 0, z: 0 });
		placePiece(w, { id: 'e', type: 'PAWN', player: 'p2', x: 2, z: 0 });
		expect(w.chessManager.isValidChessMove(w.game, r, 4, 0)).toBe(false);
		expect(clientLegalSet(w, r)).not.toContain('4,0');
	});
});

// ── 7. Source-cell desync handling (user's "rook disappeared") ─────

describe('desync robustness — orphan & ghost markers', () => {
	test('stale chess marker on the destination cell does NOT block capture', () => {
		const w = makeWorld();
		stampRect(w, 0, 0, 4, 0);
		const r = placePiece(w, { id: 'r', type: 'ROOK', player: 'p1', x: 0, z: 0 });
		// Add a STALE marker at (4,0) with a pieceId not in chessPieces.
		w.boardManager.addToCellContents(w.game.board, 4, 0, {
			type: 'chess', player: 'p2',
			pieceId: 'ghost-id', pieceType: 'pawn',
		});
		// Validator considers the destination empty — the rook can land.
		expect(w.chessManager.isValidChessMove(w.game, r, 4, 0)).toBe(true);
	});

	test('two ghost markers on the path do NOT stop the rook reaching the end', () => {
		const w = makeWorld();
		for (let x = 0; x <= 5; x++) stampTerrain(w, x, 0);
		const r = placePiece(w, { id: 'r', type: 'ROOK', player: 'p1', x: 0, z: 0 });
		w.boardManager.addToCellContents(w.game.board, 2, 0, {
			type: 'chess', player: 'p2',
			pieceId: 'ghost-a', pieceType: 'pawn',
		});
		w.boardManager.addToCellContents(w.game.board, 3, 0, {
			type: 'chess', player: 'p1',
			pieceId: 'ghost-b', pieceType: 'pawn',
		});
		expect(w.chessManager.isValidChessMove(w.game, r, 5, 0)).toBe(true);
	});

	test('marker without a pieceId still treated as a real obstruction (legacy data)', () => {
		// Older bots / migration paths leave markers with no pieceId; we
		// have to treat them as REAL so people can\'t accidentally walk
		// through them. The server validator currently treats null-id
		// markers as live — this test pins that behaviour in.
		const w = makeWorld();
		for (let x = 0; x <= 3; x++) stampTerrain(w, x, 0);
		const r = placePiece(w, { id: 'r', type: 'ROOK', player: 'p1', x: 0, z: 0 });
		w.boardManager.addToCellContents(w.game.board, 1, 0, {
			type: 'chess', player: 'p2', pieceType: 'pawn',
		});
		expect(w.chessManager.isValidChessMove(w.game, r, 3, 0)).toBe(false);
	});
});

// ── 8. Sliding past the corner of the footprint ────────────────────

describe('long-slide moves only when terrain exists', () => {
	test('queen can slide 5 squares along a straight strip', () => {
		const w = makeWorld();
		for (let x = 0; x <= 5; x++) stampTerrain(w, x, 0);
		const q = placePiece(w, { id: 'q', type: 'QUEEN', player: 'p1', x: 0, z: 0 });
		const client = clientLegalSet(w, q);
		for (let x = 1; x <= 5; x++) expect(client).toContain(`${x},0`);
		expect(client).not.toContain('6,0');
	});

	test('bishop slides until the diagonal cell is missing', () => {
		const w = makeWorld();
		// Diagonal at (1,1), (2,2), (3,3) but not (4,4).
		stampTerrain(w, 0, 0);
		stampTerrain(w, 1, 1);
		stampTerrain(w, 2, 2);
		stampTerrain(w, 3, 3);
		const b = placePiece(w, { id: 'b', type: 'BISHOP', player: 'p1', x: 0, z: 0 });
		const client = clientLegalSet(w, b);
		expect(client).toContain('1,1');
		expect(client).toContain('2,2');
		expect(client).toContain('3,3');
		expect(client).not.toContain('4,4');
	});
});

// ── 9. Edge cases the user has actually hit ─────────────────────────

describe('regressions for previously-reported user bugs', () => {
	test('source cell containing only a chess marker still lets the piece move', () => {
		// The piece is "in mid-air" — terrain is gone, but the
		// chessPiece + cell marker still exist. The server validator
		// requires the *destination* to be a real cell, not the
		// source — so as long as the destination has terrain the move
		// should succeed.
		const w = makeWorld();
		// Source has ONLY a chess marker.
		w.boardManager.setCell(w.game.board, 0, 0, [
			{ type: 'chess', player: 'p1', pieceId: 'rook', pieceType: 'rook' },
		]);
		stampTerrain(w, 1, 0);
		w.game.chessPieces.push({
			id: 'rook', type: 'ROOK', player: 'p1',
			position: { x: 0, z: 0 }, hasMoved: false, moveCount: 0,
			forwardDistance: 0, orientation: 0,
		});
		const rook = w.game.chessPieces[0];
		expect(w.chessManager.isValidChessMove(w.game, rook, 1, 0)).toBe(true);
	});

	test('queen can pivot around its own square without the surrounding terrain', () => {
		// The queen lands on the only existing diagonal cell — there
		// shouldn\'t be a path issue because she only takes one step.
		const w = makeWorld();
		stampTerrain(w, 0, 0);
		stampTerrain(w, 1, 1);
		const q = placePiece(w, { id: 'q', type: 'QUEEN', player: 'p1', x: 0, z: 0 });
		expect(w.chessManager.isValidChessMove(w.game, q, 1, 1)).toBe(true);
	});

	test('the move generator always honours the SAME source as the validator', () => {
		// The user reported their piece "had drifted" and the move
		// generator and validator disagreed about its position. We
		// pin that down by checking that both use the same `position`.
		const w = makeWorld();
		stampRect(w, 0, 0, 3, 3);
		const q = placePiece(w, { id: 'q', type: 'QUEEN', player: 'p1', x: 1, z: 1 });
		// Move the queen via chessPieces but DON'T re-stamp the cell;
		// the validator should still trust piece.position.
		q.position = { x: 2, z: 2 };

		expect(w.chessManager.isValidChessMove(w.game, q, 3, 3)).toBe(true);
		const client = clientLegalSet(w, q);
		expect(client).toContain('3,3');
	});

	test('king with no legal moves yields an empty client move set', () => {
		const w = makeWorld();
		// King fully boxed in by own pieces, surrounded by terrain.
		stampRect(w, -1, -1, 1, 1);
		const king = placePiece(w, { id: 'k', type: 'KING', player: 'p1', x: 0, z: 0 });
		for (const [dx, dz] of [
			[-1, -1], [0, -1], [1, -1],
			[-1, 0], [1, 0],
			[-1, 1], [0, 1], [1, 1],
		]) {
			placePiece(w, {
				id: `pad${dx},${dz}`, type: 'PAWN', player: 'p1',
				x: dx, z: dz,
			});
		}
		const client = clientLegalSet(w, king);
		expect(client.size).toBe(0);
	});

	test('moving onto a cell with both tetromino + chess of a different player succeeds', () => {
		// User reported: "I went to capture a piece with my knight,
		// it disappeared". The cell here has both a friendly-but-old
		// tetromino marker and an enemy chess marker; the knight
		// should still be able to capture.
		const w = makeWorld();
		stampTerrain(w, 0, 0);
		stampTerrain(w, 2, 1, 'p1', 'tetromino');
		w.boardManager.addToCellContents(w.game.board, 2, 1, {
			type: 'tetromino', player: 'p2',
		});
		const knight = placePiece(w, { id: 'k', type: 'KNIGHT', player: 'p1', x: 0, z: 0 });
		placePiece(w, { id: 'e', type: 'PAWN', player: 'p2', x: 2, z: 1 });
		expect(w.chessManager.isValidChessMove(w.game, knight, 2, 1)).toBe(true);
	});
});

// ── 9b. Client/server DISAGREEMENT cases — these expose real bugs ──

describe('client and server must agree about every move', () => {
	test('piece at a position with no cell marker still blocks an enemy slide', () => {
		// Server walks cell markers, client walks chessPieces.
		// If a piece is at (3,0) in chessPieces but the cell at (3,0)
		// has no chess marker, the two engines disagree.
		const w = makeWorld();
		for (let x = 0; x <= 5; x++) stampTerrain(w, x, 0);
		const r = placePiece(w, { id: 'r', type: 'ROOK', player: 'p1', x: 0, z: 0 });

		// Inject a chessPieces entry at (3,0) WITHOUT stamping the
		// matching chess marker — emulates a snapshot race where the
		// position list updated before the cell did.
		w.game.chessPieces.push({
			id: 'phantom', type: 'PAWN', player: 'p2',
			position: { x: 3, z: 0 }, hasMoved: false, moveCount: 0,
			forwardDistance: 0, orientation: 0,
		});

		// Both engines should reach the SAME verdict — even with the
		// markers out of step, the piece at (3,0) must block the slide
		// (or both must allow it). Today the client treats it as a
		// blocker while the server sees clear path.
		const serverSeesBlocked = !w.chessManager.isValidChessMove(w.game, r, 5, 0);
		const clientOffersMove = clientLegalSet(w, r).has('5,0');
		expect(serverSeesBlocked).toBe(!clientOffersMove);
	});

	test('chess marker referring to a live piece elsewhere still blocks the path', () => {
		// A different snapshot race: the cell at (3,0) has a chess
		// marker pointing to a real piece's ID, but that piece is
		// actually at (5,5) in chessPieces. Server walks markers,
		// client walks chessPieces. They disagree.
		const w = makeWorld();
		for (let x = 0; x <= 5; x++) stampTerrain(w, x, 0);
		stampTerrain(w, 5, 5);
		const r = placePiece(w, { id: 'r', type: 'ROOK', player: 'p1', x: 0, z: 0 });
		placePiece(w, { id: 'moved', type: 'PAWN', player: 'p2', x: 5, z: 5 });

		// Add a stale chess marker at (3,0) referencing the same id
		w.boardManager.addToCellContents(w.game.board, 3, 0, {
			type: 'chess', player: 'p2',
			pieceId: 'moved', pieceType: 'pawn',
		});

		const serverSeesBlocked = !w.chessManager.isValidChessMove(w.game, r, 5, 0);
		const clientOffersMove = clientLegalSet(w, r).has('5,0');
		expect(serverSeesBlocked).toBe(!clientOffersMove);
	});

	test('two pieces at the same position are treated consistently', () => {
		// Defensive: two chessPieces entries claim (3,0). The cell
		// has one marker. Client sees one occupant; server only
		// sees the marker. Validators should agree.
		const w = makeWorld();
		for (let x = 0; x <= 5; x++) stampTerrain(w, x, 0);
		const r = placePiece(w, { id: 'r', type: 'ROOK', player: 'p1', x: 0, z: 0 });
		placePiece(w, { id: 'dup1', type: 'PAWN', player: 'p2', x: 3, z: 0 });
		w.game.chessPieces.push({
			id: 'dup2', type: 'PAWN', player: 'p2',
			position: { x: 3, z: 0 }, hasMoved: false,
			moveCount: 0, forwardDistance: 0, orientation: 0,
		});

		const serverSeesBlocked = !w.chessManager.isValidChessMove(w.game, r, 5, 0);
		const clientOffersMove = clientLegalSet(w, r).has('5,0');
		expect(serverSeesBlocked).toBe(!clientOffersMove);
	});

	test('piece.hasMoved disagreement between client + server cache', () => {
		// Server says hasMoved=true (no two-step). Client mesh
		// reflects hasMoved=false. They MUST agree (else the user
		// thinks pawn can two-step but server refuses).
		const w = makeWorld();
		stampRect(w, 0, 0, 0, 3);
		const pawn = placePiece(w, {
			id: 'p', type: 'PAWN', player: 'p1', x: 0, z: 0, hasMoved: true,
		});

		// Server: hasMoved=true, so (0,2) is rejected.
		expect(w.chessManager.isValidChessMove(w.game, pawn, 0, 2)).toBe(false);

		// Now simulate a client gameState where the pawn appears
		// "fresh" (hasMoved=false). The user would see a two-step
		// move offered. Both engines should yield the same verdict
		// when given the same data.
		const wireData = asClientGameState(w);
		wireData.chessPieces[0].hasMoved = false;
		const clientMoves = getChessPieceMoveSets(wireData, wireData.chessPieces[0]);
		const clientOffersTwoStep = clientMoves.some(m => m.x === 0 && m.z === 2);
		// If the server says no, the client must say no too — given
		// the SAME hasMoved value. When data is fresh on both sides
		// the answer should match.
		expect(clientOffersTwoStep).toBe(true); // OK if client agrees with its OWN data
		// And re-running the server with the matching wire data must agree.
		const stale = w.game.chessPieces[0];
		stale.hasMoved = false;
		expect(w.chessManager.isValidChessMove(w.game, stale, 0, 2)).toBe(true);
	});

	test('queen sees a long ray of legal moves with NO disagreements', () => {
		// The big assertion: for an open board the client and
		// server return literally the same set of moves.
		const w = makeWorld();
		stampRect(w, 0, 0, 7, 7);
		const q = placePiece(w, { id: 'q', type: 'QUEEN', player: 'p1', x: 0, z: 0 });

		const client = clientLegalSet(w, q);
		// Compare against server, full neighbourhood.
		for (const cell of client) {
			const [x, z] = cell.split(',').map(Number);
			expect(w.chessManager.isValidChessMove(w.game, q, x, z)).toBe(true);
		}

		const expectedRays = [];
		for (let i = 1; i <= 7; i++) {
			expectedRays.push(`${i},0`, `0,${i}`, `${i},${i}`);
		}
		for (const cell of expectedRays) {
			expect(client).toContain(cell);
		}
	});
});

// ── 9c. More client/server agreement gaps the user may hit ─────────

describe('further client/server agreement gaps', () => {
	test('pawn diagonal capture onto a stale-marker cell — both engines agree', () => {
		// Server: marker pieceId in livePieceIds (piece is elsewhere)
		//         ⇒ pawn capture allowed (false positive)
		// Client: lookupOccupant(1,1) sees no piece ⇒ no capture offered
		const w = makeWorld();
		stampRect(w, 0, 0, 1, 1);
		const pawn = placePiece(w, { id: 'p', type: 'PAWN', player: 'p1', x: 0, z: 0 });
		// Real piece sits elsewhere…
		stampTerrain(w, 5, 5);
		placePiece(w, { id: 'e', type: 'PAWN', player: 'p2', x: 5, z: 5 });
		// …but a stale marker lingers at (1,1).
		w.boardManager.addToCellContents(w.game.board, 1, 1, {
			type: 'chess', player: 'p2', pieceId: 'e', pieceType: 'pawn',
		});
		const serverAllows = w.chessManager.isValidChessMove(w.game, pawn, 1, 1);
		const clientOffers = clientLegalSet(w, pawn).has('1,1');
		expect(serverAllows).toBe(clientOffers);
	});

	test('knight L-jump onto a cell with phantom occupant — engines agree', () => {
		const w = makeWorld();
		stampTerrain(w, 0, 0);
		stampTerrain(w, 2, 1);
		const knight = placePiece(w, { id: 'k', type: 'KNIGHT', player: 'p1', x: 0, z: 0 });
		// Phantom enemy in chessPieces at (2,1) — no matching cell
		// marker. Client treats it as a capture target; server doesn\'t
		// see any chess marker there so it allows the landing.
		w.game.chessPieces.push({
			id: 'phantom', type: 'PAWN', player: 'p2',
			position: { x: 2, z: 1 },
			hasMoved: false, moveCount: 0, forwardDistance: 0, orientation: 0,
		});
		const serverAllows = w.chessManager.isValidChessMove(w.game, knight, 2, 1);
		const clientOffers = clientLegalSet(w, knight).has('2,1');
		expect(serverAllows).toBe(clientOffers);
	});

	test('bishop diagonal slide with phantom blocker in chessPieces — engines agree', () => {
		const w = makeWorld();
		stampRect(w, 0, 0, 4, 4);
		const b = placePiece(w, { id: 'b', type: 'BISHOP', player: 'p1', x: 0, z: 0 });
		// Phantom piece occupies (2,2) in chessPieces but the cell has
		// no chess marker → server walks straight through it; client
		// stops at the phantom.
		w.game.chessPieces.push({
			id: 'phantom', type: 'PAWN', player: 'p2',
			position: { x: 2, z: 2 },
			hasMoved: false, moveCount: 0, forwardDistance: 0, orientation: 0,
		});
		const serverAllows = w.chessManager.isValidChessMove(w.game, b, 4, 4);
		const clientOffers = clientLegalSet(w, b).has('4,4');
		expect(serverAllows).toBe(clientOffers);
	});

	test('client move generator should offer castling when geometry allows it', () => {
		// User scenario: unmoved king + unmoved rook + clear row.
		// Server accepts castle as a king move; client never offered
		// it, so the user can\'t request the castle from the UI.
		const w = makeWorld();
		stampRect(w, 0, 0, 7, 0);
		const king = placePiece(w, { id: 'k', type: 'KING', player: 'p1', x: 4, z: 0 });
		placePiece(w, { id: 'r', type: 'ROOK', player: 'p1', x: 7, z: 0 });

		expect(w.chessManager.isValidChessMove(w.game, king, 6, 0)).toBe(true);
		const client = clientLegalSet(w, king);
		expect(client).toContain('6,0');
	});

	test('validateChessMove detects a phantom OWN piece blocker via chessPieces', () => {
		// Hardening the AI/legacy path: if there\'s an own piece in
		// chessPieces at (3,0) but no matching marker, the validator
		// should still treat (3,0) as occupied (you can\'t capture
		// your own piece, even via a phantom).
		const w = makeWorld();
		for (let x = 0; x <= 4; x++) stampTerrain(w, x, 0);
		placePiece(w, { id: 'r', type: 'ROOK', player: 'p1', x: 0, z: 0 });
		w.game.chessPieces.push({
			id: 'phantom-own', type: 'PAWN', player: 'p1',
			position: { x: 3, z: 0 },
			hasMoved: false, moveCount: 0, forwardDistance: 0, orientation: 0,
		});

		const result = w.chessManager.validateChessMove(w.game, 'p1', {
			pieceId: 'r', toX: 3, toZ: 0,
		});
		expect(result.valid).toBe(false);
	});

	test('isValidChessMove and validateChessMove agree on a clean board', () => {
		// Reference test: on a clean board, the two validator paths
		// must produce the same yes/no answer for every queen move.
		const w = makeWorld();
		stampRect(w, 0, 0, 4, 4);
		const queen = placePiece(w, { id: 'q', type: 'QUEEN', player: 'p1', x: 0, z: 0 });

		for (let x = 0; x <= 4; x++) {
			for (let z = 0; z <= 4; z++) {
				if (x === 0 && z === 0) continue;
				const a = w.chessManager.isValidChessMove(w.game, queen, x, z);
				const b = w.chessManager.validateChessMove(w.game, 'p1', {
					pieceId: 'q', toX: x, toZ: z,
				});
				expect(b.valid).toBe(a);
			}
		}
	});

	test('isValidChessMove and validateChessMove agree across messy snapshots', () => {
		// Same as above but with snapshot drift (stale markers + phantom
		// chessPieces entries). Right now they disagree — the AI path
		// uses raw cell markers, the socket path uses livePieceIds.
		const w = makeWorld();
		stampRect(w, 0, 0, 4, 4);
		const queen = placePiece(w, { id: 'q', type: 'QUEEN', player: 'p1', x: 0, z: 0 });
		// Ghost marker at (2,2)
		w.boardManager.addToCellContents(w.game.board, 2, 2, {
			type: 'chess', player: 'p2', pieceId: 'ghost', pieceType: 'pawn',
		});
		// Phantom piece in chessPieces at (4,0) with no marker.
		w.game.chessPieces.push({
			id: 'phantom', type: 'PAWN', player: 'p2',
			position: { x: 4, z: 0 },
			hasMoved: false, moveCount: 0, forwardDistance: 0, orientation: 0,
		});

		for (let x = 0; x <= 4; x++) {
			for (let z = 0; z <= 4; z++) {
				if (x === 0 && z === 0) continue;
				const a = w.chessManager.isValidChessMove(w.game, queen, x, z);
				const b = w.chessManager.validateChessMove(w.game, 'p1', {
					pieceId: 'q', toX: x, toZ: z,
				});
				expect(b.valid).toBe(a);
			}
		}
	});

	test('rook capture cell with no terrain — only chess marker', () => {
		// Cell at (3,0) has ONLY a chess marker (enemy). Server says
		// it\'s a valid board square so capture is legal; client must
		// match. The user saw lots of capture attempts fail here.
		const w = makeWorld();
		for (let x = 0; x <= 3; x++) stampTerrain(w, x, 0);
		const r = placePiece(w, { id: 'r', type: 'ROOK', player: 'p1', x: 0, z: 0 });
		// Replace cell at (3,0) with chess-only:
		w.game.board.cells['3,0'] = [
			{ type: 'chess', player: 'p2', pieceId: 'e1', pieceType: 'pawn' },
		];
		w.game.chessPieces.push({
			id: 'e1', type: 'PAWN', player: 'p2',
			position: { x: 3, z: 0 }, hasMoved: false, moveCount: 0,
			forwardDistance: 0, orientation: 0,
		});
		expect(w.chessManager.isValidChessMove(w.game, r, 3, 0)).toBe(true);
		const client = clientLegalSet(w, r);
		expect(client).toContain('3,0');
	});

	test('move-generator must offer the move when server accepts it (random pieces, sparse board)', () => {
		// Sweep through every offset within reach for a queen and
		// ensure: server-yes  ⇒  client-yes (no missed highlights).
		const w = makeWorld();
		stampRect(w, -4, -4, 4, 4);
		placePiece(w, { id: 'p2-K', type: 'KING', player: 'p2', x: 3, z: 0 });
		const q = placePiece(w, { id: 'q', type: 'QUEEN', player: 'p1', x: 0, z: 0 });

		const client = clientLegalSet(w, q);
		for (let dx = -4; dx <= 4; dx++) {
			for (let dz = -4; dz <= 4; dz++) {
				if (dx === 0 && dz === 0) continue;
				const x = dx, z = dz;
				if (w.chessManager.isValidChessMove(w.game, q, x, z)) {
					expect(client.has(`${x},${z}`)).toBe(true);
				}
			}
		}
	});

	test('client must not offer moves the server would reject (no phantom highlights)', () => {
		const w = makeWorld();
		stampRect(w, -3, -3, 3, 3);
		const q = placePiece(w, { id: 'q', type: 'QUEEN', player: 'p1', x: 0, z: 0 });
		placePiece(w, { id: 'e', type: 'PAWN', player: 'p2', x: 1, z: 1 });

		const client = clientLegalSet(w, q);
		for (const cell of client) {
			const [x, z] = cell.split(',').map(Number);
			expect(w.chessManager.isValidChessMove(w.game, q, x, z)).toBe(true);
		}
	});

	test('rook sliding through a friendly piece must NOT be offered (even via stale marker)', () => {
		const w = makeWorld();
		for (let x = 0; x <= 5; x++) stampTerrain(w, x, 0);
		const r = placePiece(w, { id: 'r', type: 'ROOK', player: 'p1', x: 0, z: 0 });
		placePiece(w, { id: 'own', type: 'PAWN', player: 'p1', x: 3, z: 0 });

		const client = clientLegalSet(w, r);
		expect(client.has('4,0')).toBe(false);
		expect(client.has('5,0')).toBe(false);
	});

	test('blocker that owns the path is detected by BOTH server and client (stale marker only)', () => {
		// The "stale marker only" path: chessPieces is missing the
		// piece entirely, but a chess marker lingers on the cell.
		// This is the legacy-data case — both engines should accept
		// the rook's slide because the marker has no live piece.
		const w = makeWorld();
		for (let x = 0; x <= 5; x++) stampTerrain(w, x, 0);
		const r = placePiece(w, { id: 'r', type: 'ROOK', player: 'p1', x: 0, z: 0 });
		w.boardManager.addToCellContents(w.game.board, 3, 0, {
			type: 'chess', player: 'p2',
			pieceId: 'ghost-id', pieceType: 'pawn',
		});

		const serverSeesBlocked = !w.chessManager.isValidChessMove(w.game, r, 5, 0);
		const clientOffersMove = clientLegalSet(w, r).has('5,0');
		expect(serverSeesBlocked).toBe(!clientOffersMove);
	});

	test('king castling long (queenside) is offered when valid', () => {
		// Mirror of the short-castle test, but to the opposite side.
		const w = makeWorld();
		stampRect(w, 0, 0, 7, 0);
		const king = placePiece(w, { id: 'k', type: 'KING', player: 'p1', x: 4, z: 0 });
		placePiece(w, { id: 'r', type: 'ROOK', player: 'p1', x: 0, z: 0 });
		expect(w.chessManager.isValidChessMove(w.game, king, 2, 0)).toBe(true);
		const client = clientLegalSet(w, king);
		expect(client).toContain('2,0');
	});

	test('castling rook auto-moves are not surfaced as separate highlights', () => {
		const w = makeWorld();
		stampRect(w, 0, 0, 7, 0);
		const king = placePiece(w, { id: 'k', type: 'KING', player: 'p1', x: 4, z: 0 });
		placePiece(w, { id: 'r', type: 'ROOK', player: 'p1', x: 7, z: 0 });
		const client = clientLegalSet(w, king);
		// Castling adds (6,0). It should NOT also add (7,0) — the king
		// can never legitimately land on its own rook.
		expect(client.has('6,0')).toBe(true);
		expect(client.has('7,0')).toBe(false);
	});

	test('validateChessMove (AI path) ignores ghost chess markers like isValidChessMove does', () => {
		// Two server validators are in play:
		//   1. isValidChessMove — used by the socket handler. Filters
		//      ghost markers via livePieceIds.
		//   2. validateChessMove → _checkPathObstruction — used by AI
		//      bots. Currently treats ANY chess marker as a blocker.
		// They must agree, otherwise human + bot players see different
		// rules.
		const w = makeWorld();
		for (let x = 0; x <= 4; x++) stampTerrain(w, x, 0);
		const r = placePiece(w, { id: 'r', type: 'ROOK', player: 'p1', x: 0, z: 0 });
		// Ghost marker at (2, 0) — no matching live piece.
		w.boardManager.addToCellContents(w.game.board, 2, 0, {
			type: 'chess', player: 'p2',
			pieceId: 'ghost', pieceType: 'pawn',
		});
		// (4, 0) — real enemy.
		placePiece(w, { id: 'enemy', type: 'PAWN', player: 'p2', x: 4, z: 0 });

		// Sockets / human players see this as legal.
		const socketLegal = w.chessManager.isValidChessMove(w.game, r, 4, 0);
		// AI bots see this as illegal.
		const aiResult = w.chessManager.validateChessMove(w.game, 'p1', {
			pieceId: 'r', toX: 4, toZ: 0,
		});
		expect(socketLegal).toBe(aiResult.valid);
	});
});

// ── 10. Stress / mixed-board ───────────────────────────────────────

describe('stress + mixed configurations', () => {
	test('analyzer offers movements for every piece on a busy 5x5 board', () => {
		const { analyzePossibleMoves } = require(CLIENT_MOVES_PATH);
		const w = makeWorld();
		stampRect(w, 0, 0, 5, 5);
		placePiece(w, { id: 'k', type: 'KING', player: 'p1', x: 0, z: 0 });
		placePiece(w, { id: 'q', type: 'QUEEN', player: 'p1', x: 5, z: 5 });
		placePiece(w, { id: 'r1', type: 'ROOK', player: 'p1', x: 2, z: 2 });
		placePiece(w, { id: 'b1', type: 'BISHOP', player: 'p1', x: 3, z: 3 });
		placePiece(w, { id: 'kn1', type: 'KNIGHT', player: 'p1', x: 1, z: 4 });
		const cs = asClientGameState(w);
		const result = analyzePossibleMoves(cs, 'p1');
		expect(result.totalPieces).toBe(5);
		expect(result.hasMoves).toBe(true);
	});

	test('the move generator never returns the source square', () => {
		const w = makeWorld();
		stampRect(w, -3, -3, 3, 3);
		const q = placePiece(w, { id: 'q', type: 'QUEEN', player: 'p1', x: 0, z: 0 });
		const client = clientLegalSet(w, q);
		expect(client.has('0,0')).toBe(false);
	});

	test('client move generator never offers a square that\'s already an own piece', () => {
		const w = makeWorld();
		stampRect(w, 0, 0, 5, 0);
		const r = placePiece(w, { id: 'r', type: 'ROOK', player: 'p1', x: 0, z: 0 });
		placePiece(w, { id: 'p1pawn', type: 'PAWN', player: 'p1', x: 3, z: 0 });
		const client = clientLegalSet(w, r);
		expect(client.has('3,0')).toBe(false);
	});

	test('long ray queen offers many enemies but skips own piece', () => {
		const w = makeWorld();
		stampRect(w, 0, 0, 6, 0);
		const q = placePiece(w, { id: 'q', type: 'QUEEN', player: 'p1', x: 0, z: 0 });
		placePiece(w, { id: 'own', type: 'PAWN', player: 'p1', x: 2, z: 0 });
		placePiece(w, { id: 'enemy', type: 'PAWN', player: 'p2', x: 5, z: 0 });
		const client = clientLegalSet(w, q);
		expect(client).toContain('1,0');
		expect(client).not.toContain('2,0');
		expect(client).not.toContain('3,0');
		expect(client).not.toContain('5,0');
	});
});
