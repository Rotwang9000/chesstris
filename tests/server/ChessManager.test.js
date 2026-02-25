/**
 * Tests for the real server/game/ChessManager.js
 * Covers: piece init, movement validation, castling, pawn promotion,
 *         king capture (transfer + suicidal pawns), piece purchase.
 */

const { GAME_RULES, PIECE_PRICES } = require('../../server/game/Constants');
const { createManagers, createGame, addPlayer, createHomeZone, placeTetromino } = require('./testHelpers');

describe('ChessManager', () => {
	let boardManager, islandManager, chessManager;

	beforeEach(() => {
		({ boardManager, islandManager, chessManager } = createManagers());
	});

	// ── Piece initialisation ────────────────────────────────────────────────

	describe('initializeChessPieces', () => {
		test('creates 16 pieces (8 main + 8 pawns) for a horizontal home zone', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'p1');
			const homeZone = createHomeZone(game, boardManager, 'p1', 0, 0, 0);
			const pieces = chessManager.initializeChessPieces(game, 'p1', homeZone);
			game.chessPieces.push(...pieces);

			expect(pieces).toHaveLength(16);
			expect(pieces.filter(p => p.type === 'KING')).toHaveLength(1);
			expect(pieces.filter(p => p.type === 'QUEEN')).toHaveLength(1);
			expect(pieces.filter(p => p.type === 'ROOK')).toHaveLength(2);
			expect(pieces.filter(p => p.type === 'KNIGHT')).toHaveLength(2);
			expect(pieces.filter(p => p.type === 'BISHOP')).toHaveLength(2);
			expect(pieces.filter(p => p.type === 'PAWN')).toHaveLength(8);
		});

		test('all pieces have moveCount and forwardDistance initialised to 0', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'p1');
			const homeZone = createHomeZone(game, boardManager, 'p1', 0, 0, 0);
			const pieces = chessManager.initializeChessPieces(game, 'p1', homeZone);

			for (const piece of pieces) {
				expect(piece.moveCount).toBe(0);
				expect(piece.forwardDistance).toBe(0);
				expect(piece.hasMoved).toBe(false);
			}
		});

		test('vertical layout (orientation 1) creates pieces along z-axis', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'p1');
			const homeZone = createHomeZone(game, boardManager, 'p1', 0, 0, 1);
			const pieces = chessManager.initializeChessPieces(game, 'p1', homeZone);
			game.chessPieces.push(...pieces);

			expect(pieces).toHaveLength(16);
			const king = pieces.find(p => p.type === 'KING');
			expect(king.position.z).toBe(4);
		});
	});

	// ── Movement validation ─────────────────────────────────────────────────

	describe('isValidChessMove', () => {
		let game;

		beforeEach(() => {
			game = createGame(boardManager);
			addPlayer(game, 'p1');
			addPlayer(game, 'p2', { color: 0x0088AA });
		});

		function setUpBoardWithPiece(type, pos, player = 'p1', options = {}) {
			const piece = {
				id: `${player}-${type}-test`,
				type,
				player,
				position: { x: pos.x, z: pos.z },
				hasMoved: options.hasMoved || false,
				orientation: options.orientation || 0,
				moveCount: 0,
				forwardDistance: 0,
			};
			game.chessPieces.push(piece);
			boardManager.addToCellContents(game.board, pos.x, pos.z, {
				type: 'chess', player, pieceType: type.toLowerCase(), pieceId: piece.id,
			});
			return piece;
		}

		function ensureBoardSquare(x, z, player = 'p1') {
			if (!boardManager.getCell(game.board, x, z)) {
				boardManager.setCell(game.board, x, z, [
					{ type: 'tetromino', player },
				]);
			}
		}

		// ── King ────────────────────────────────────────────────────────

		test('king can move one step in any direction', () => {
			const king = setUpBoardWithPiece('KING', { x: 5, z: 5 });
			ensureBoardSquare(5, 6);
			expect(chessManager.isValidChessMove(game, king, 5, 6)).toBe(true);
		});

		test('king cannot move two steps (without castling)', () => {
			const king = setUpBoardWithPiece('KING', { x: 5, z: 5 }, 'p1', { hasMoved: true });
			ensureBoardSquare(7, 5);
			expect(chessManager.isValidChessMove(game, king, 7, 5)).toBe(false);
		});

		// ── Knight ──────────────────────────────────────────────────────

		test('knight moves in L-shape', () => {
			const knight = setUpBoardWithPiece('KNIGHT', { x: 3, z: 3 });
			ensureBoardSquare(5, 4);
			expect(chessManager.isValidChessMove(game, knight, 5, 4)).toBe(true);
		});

		test('knight cannot move diagonally', () => {
			const knight = setUpBoardWithPiece('KNIGHT', { x: 3, z: 3 });
			ensureBoardSquare(4, 4);
			expect(chessManager.isValidChessMove(game, knight, 4, 4)).toBe(false);
		});

		// ── Bishop ──────────────────────────────────────────────────────

		test('bishop moves diagonally', () => {
			const bishop = setUpBoardWithPiece('BISHOP', { x: 3, z: 3 });
			ensureBoardSquare(4, 4);
			ensureBoardSquare(5, 5);
			expect(chessManager.isValidChessMove(game, bishop, 5, 5)).toBe(true);
		});

		test('bishop blocked by chess piece in path', () => {
			const bishop = setUpBoardWithPiece('BISHOP', { x: 0, z: 0 });
			setUpBoardWithPiece('PAWN', { x: 1, z: 1 }, 'p1');
			ensureBoardSquare(2, 2);
			expect(chessManager.isValidChessMove(game, bishop, 2, 2)).toBe(false);
		});

		// ── Rook ────────────────────────────────────────────────────────

		test('rook moves horizontally', () => {
			const rook = setUpBoardWithPiece('ROOK', { x: 0, z: 0 });
			for (let x = 1; x <= 4; x++) ensureBoardSquare(x, 0);
			expect(chessManager.isValidChessMove(game, rook, 4, 0)).toBe(true);
		});

		test('rook cannot move diagonally', () => {
			const rook = setUpBoardWithPiece('ROOK', { x: 0, z: 0 });
			ensureBoardSquare(1, 1);
			expect(chessManager.isValidChessMove(game, rook, 1, 1)).toBe(false);
		});

		// ── Queen ───────────────────────────────────────────────────────

		test('queen moves diagonally and horizontally', () => {
			const queen = setUpBoardWithPiece('QUEEN', { x: 3, z: 3 });
			ensureBoardSquare(3, 5);
			ensureBoardSquare(3, 4);
			expect(chessManager.isValidChessMove(game, queen, 3, 5)).toBe(true);
			ensureBoardSquare(5, 5);
			ensureBoardSquare(4, 4);
			expect(chessManager.isValidChessMove(game, queen, 5, 5)).toBe(true);
		});

		// ── Pawn ────────────────────────────────────────────────────────

		test('pawn moves one forward', () => {
			const pawn = setUpBoardWithPiece('PAWN', { x: 4, z: 1 }, 'p1', { orientation: 0 });
			ensureBoardSquare(4, 2);
			expect(chessManager.isValidChessMove(game, pawn, 4, 2)).toBe(true);
		});

		test('pawn can move two forward on first move', () => {
			const pawn = setUpBoardWithPiece('PAWN', { x: 4, z: 1 }, 'p1', { orientation: 0 });
			ensureBoardSquare(4, 2);
			ensureBoardSquare(4, 3);
			expect(chessManager.isValidChessMove(game, pawn, 4, 3)).toBe(true);
		});

		test('pawn cannot move two forward after first move', () => {
			const pawn = setUpBoardWithPiece('PAWN', { x: 4, z: 1 }, 'p1', {
				orientation: 0, hasMoved: true,
			});
			ensureBoardSquare(4, 2);
			ensureBoardSquare(4, 3);
			expect(chessManager.isValidChessMove(game, pawn, 4, 3)).toBe(false);
		});

		test('pawn captures diagonally', () => {
			const pawn = setUpBoardWithPiece('PAWN', { x: 4, z: 1 }, 'p1', { orientation: 0 });
			setUpBoardWithPiece('PAWN', { x: 5, z: 2 }, 'p2');
			expect(chessManager.isValidChessMove(game, pawn, 5, 2)).toBe(true);
		});

		test('pawn cannot capture own piece diagonally', () => {
			const pawn = setUpBoardWithPiece('PAWN', { x: 4, z: 1 }, 'p1', { orientation: 0 });
			setUpBoardWithPiece('PAWN', { x: 5, z: 2 }, 'p1');
			expect(chessManager.isValidChessMove(game, pawn, 5, 2)).toBe(false);
		});

		test('pawn cannot move forward into a cell with a chess piece', () => {
			const pawn = setUpBoardWithPiece('PAWN', { x: 4, z: 1 }, 'p1', { orientation: 0 });
			setUpBoardWithPiece('PAWN', { x: 4, z: 2 }, 'p2');
			expect(chessManager.isValidChessMove(game, pawn, 4, 2)).toBe(false);
		});

		// ── Capture ─────────────────────────────────────────────────────

		test('can capture enemy piece', () => {
			const rook = setUpBoardWithPiece('ROOK', { x: 0, z: 0 });
			setUpBoardWithPiece('ROOK', { x: 0, z: 3 }, 'p2');
			ensureBoardSquare(0, 1);
			ensureBoardSquare(0, 2);
			expect(chessManager.isValidChessMove(game, rook, 0, 3)).toBe(true);
		});

		test('cannot capture own piece', () => {
			const rook = setUpBoardWithPiece('ROOK', { x: 0, z: 0 });
			setUpBoardWithPiece('PAWN', { x: 0, z: 3 }, 'p1');
			ensureBoardSquare(0, 1);
			ensureBoardSquare(0, 2);
			expect(chessManager.isValidChessMove(game, rook, 0, 3)).toBe(false);
		});

		// ── Destination must be a board square ──────────────────────────

		test('cannot move to void (no board cell)', () => {
			const rook = setUpBoardWithPiece('ROOK', { x: 0, z: 0 });
			expect(chessManager.isValidChessMove(game, rook, 0, 5)).toBe(false);
		});
	});

	// ── Castling ────────────────────────────────────────────────────────────

	describe('castling', () => {
		test('king can castle with unmoved rook', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'p1');

			// Place king at (4,0) and rook at (7,0) with board squares between
			for (let x = 0; x <= 7; x++) {
				boardManager.setCell(game.board, x, 0, [{ type: 'home', player: 'p1' }]);
			}

			const king = {
				id: 'p1-KING-1', type: 'KING', player: 'p1',
				position: { x: 4, z: 0 }, hasMoved: false, moveCount: 0,
			};
			const rook = {
				id: 'p1-ROOK-1', type: 'ROOK', player: 'p1',
				position: { x: 7, z: 0 }, hasMoved: false, moveCount: 0,
			};
			game.chessPieces.push(king, rook);

			boardManager.addToCellContents(game.board, 4, 0, {
				type: 'chess', player: 'p1', pieceId: king.id, pieceType: 'king',
			});
			boardManager.addToCellContents(game.board, 7, 0, {
				type: 'chess', player: 'p1', pieceId: rook.id, pieceType: 'rook',
			});

			const result = chessManager.validateChessMove(game, 'p1', {
				pieceId: king.id, toX: 6, toZ: 0,
			});
			expect(result.valid).toBe(true);
			expect(result.castling).toBeTruthy();
			expect(result.castling.rookId).toBe(rook.id);
		});

		test('cannot castle if rook has moved', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'p1');

			for (let x = 0; x <= 7; x++) {
				boardManager.setCell(game.board, x, 0, [{ type: 'home', player: 'p1' }]);
			}

			const king = {
				id: 'p1-KING-1', type: 'KING', player: 'p1',
				position: { x: 4, z: 0 }, hasMoved: false,
			};
			const rook = {
				id: 'p1-ROOK-1', type: 'ROOK', player: 'p1',
				position: { x: 7, z: 0 }, hasMoved: true,
			};
			game.chessPieces.push(king, rook);

			boardManager.addToCellContents(game.board, 4, 0, {
				type: 'chess', player: 'p1', pieceId: king.id, pieceType: 'king',
			});
			boardManager.addToCellContents(game.board, 7, 0, {
				type: 'chess', player: 'p1', pieceId: rook.id, pieceType: 'rook',
			});

			const result = chessManager.validateChessMove(game, 'p1', {
				pieceId: king.id, toX: 6, toZ: 0,
			});
			expect(result.valid).toBe(false);
		});
	});

	// ── Pawn promotion ──────────────────────────────────────────────────────

	describe('pawn promotion', () => {
		test('pawn promotes after 9 net forward squares', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'p1');

			// Set up a pawn with forwardDistance = 8 (one more to go)
			const pawn = {
				id: 'p1-PAWN-promo', type: 'PAWN', player: 'p1',
				position: { x: 4, z: 9 }, hasMoved: true,
				moveCount: 8, forwardDistance: 8, orientation: 0,
			};
			game.chessPieces.push(pawn);
			boardManager.setCell(game.board, 4, 9, [{ type: 'tetromino', player: 'p1' }]);
			boardManager.addToCellContents(game.board, 4, 9, {
				type: 'chess', player: 'p1', pieceId: pawn.id, pieceType: 'pawn',
			});
			boardManager.setCell(game.board, 4, 10, [{ type: 'tetromino', player: 'p1' }]);

			const result = chessManager.executeChessMove(game, 'p1', {
				pieceId: pawn.id, toX: 4, toZ: 10,
			});

			expect(result.success).toBe(true);
			expect(result.promotionPending).toBeTruthy();
			expect(result.promotionPending.pieceId).toBe(pawn.id);
		});

		test('pawn does NOT promote with fewer than 9 net forward squares', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'p1');

			const pawn = {
				id: 'p1-PAWN-no-promo', type: 'PAWN', player: 'p1',
				position: { x: 4, z: 5 }, hasMoved: true,
				moveCount: 7, forwardDistance: 7, orientation: 0,
			};
			game.chessPieces.push(pawn);
			boardManager.setCell(game.board, 4, 5, [{ type: 'tetromino', player: 'p1' }]);
			boardManager.addToCellContents(game.board, 4, 5, {
				type: 'chess', player: 'p1', pieceId: pawn.id, pieceType: 'pawn',
			});
			boardManager.setCell(game.board, 4, 6, [{ type: 'tetromino', player: 'p1' }]);

			const result = chessManager.executeChessMove(game, 'p1', {
				pieceId: pawn.id, toX: 4, toZ: 6,
			});

			expect(result.success).toBe(true);
			expect(result.promotionPending).toBeNull();
		});

		test('promotePawn changes piece type', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'p1');

			const pawn = {
				id: 'p1-PAWN-pr', type: 'PAWN', player: 'p1',
				position: { x: 3, z: 3 },
			};
			game.chessPieces.push(pawn);
			boardManager.setCell(game.board, 3, 3, [
				{ type: 'chess', player: 'p1', pieceId: pawn.id, pieceType: 'pawn' },
			]);

			const result = chessManager.promotePawn(game, pawn.id, 'p1', 'KNIGHT');
			expect(result.success).toBe(true);
			expect(pawn.type).toBe('KNIGHT');
		});
	});

	// ── King capture ────────────────────────────────────────────────────────

	describe('king capture', () => {
		test('capturing a king transfers non-pawn pieces to captor', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'attacker', { color: 0xFF0000 });
			addPlayer(game, 'defender', { color: 0x0000FF });

			// Defender's king
			const defKing = {
				id: 'def-KING', type: 'KING', player: 'defender',
				position: { x: 5, z: 5 }, hasMoved: false, moveCount: 0,
			};
			// Defender's rook (should transfer)
			const defRook = {
				id: 'def-ROOK', type: 'ROOK', player: 'defender',
				position: { x: 10, z: 10 }, hasMoved: false, moveCount: 0,
			};
			// Defender's pawn (should become suicidal, not transfer)
			const defPawn = {
				id: 'def-PAWN', type: 'PAWN', player: 'defender',
				position: { x: 8, z: 8 }, hasMoved: false, moveCount: 0,
				forwardDistance: 0, orientation: 0,
			};
			// Attacker's rook doing the capture
			const attRook = {
				id: 'att-ROOK', type: 'ROOK', player: 'attacker',
				position: { x: 5, z: 0 }, hasMoved: true, moveCount: 2,
			};

			game.chessPieces.push(defKing, defRook, defPawn, attRook);

			// Set up board squares
			for (let z = 0; z <= 5; z++) {
				boardManager.setCell(game.board, 5, z, [{ type: 'tetromino', player: 'attacker' }]);
			}
			boardManager.addToCellContents(game.board, 5, 0, {
				type: 'chess', player: 'attacker', pieceId: attRook.id, pieceType: 'rook',
			});
			boardManager.addToCellContents(game.board, 5, 5, {
				type: 'chess', player: 'defender', pieceId: defKing.id, pieceType: 'king',
			});
			boardManager.setCell(game.board, 10, 10, [
				{ type: 'tetromino', player: 'defender' },
				{ type: 'chess', player: 'defender', pieceId: defRook.id, pieceType: 'rook' },
			]);
			boardManager.setCell(game.board, 8, 8, [
				{ type: 'tetromino', player: 'defender' },
				{ type: 'chess', player: 'defender', pieceId: defPawn.id, pieceType: 'pawn' },
			]);

			const result = chessManager.executeChessMove(game, 'attacker', {
				pieceId: attRook.id, toX: 5, toZ: 5,
			});

			expect(result.success).toBe(true);
			expect(result.capture).toBe(true);

			// Rook should have transferred to attacker
			expect(defRook.player).toBe('attacker');

			// Pawn should be marked suicidal
			expect(defPawn._suicidal).toBe(true);
			expect(defPawn._suicidalDetonateAt).toBeDefined();
		});

		test('king goes to prison after capture', () => {
			jest.useFakeTimers();

			const game = createGame(boardManager);
			addPlayer(game, 'a', { color: 0xFF0000 });
			addPlayer(game, 'd', { color: 0x0000FF });

			const defKing = {
				id: 'd-KING', type: 'KING', player: 'd',
				position: { x: 1, z: 1 }, hasMoved: false, moveCount: 0,
			};
			const attRook = {
				id: 'a-ROOK', type: 'ROOK', player: 'a',
				position: { x: 1, z: 0 }, hasMoved: true, moveCount: 1,
			};
			game.chessPieces.push(defKing, attRook);

			boardManager.setCell(game.board, 1, 0, [
				{ type: 'tetromino', player: 'a' },
				{ type: 'chess', player: 'a', pieceId: attRook.id },
			]);
			boardManager.setCell(game.board, 1, 1, [
				{ type: 'tetromino', player: 'd' },
				{ type: 'chess', player: 'd', pieceId: defKing.id },
			]);

			chessManager.executeChessMove(game, 'a', {
				pieceId: attRook.id, toX: 1, toZ: 1,
			});

			// Advance timers to let suicidal pawns + finalisation complete
			jest.runAllTimers();

			expect(game.state.kingPrison).toBeDefined();
			expect(game.state.kingPrison).toHaveLength(1);
			expect(game.state.kingPrison[0].playerId).toBe('d');
			expect(game.state.kingPrison[0].capturedBy).toBe('a');

			jest.useRealTimers();
		});
	});

	// ── hasValidChessMoves ──────────────────────────────────────────────────

	describe('hasValidChessMoves', () => {
		test('returns true when king can move', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'p1');

			const king = {
				id: 'p1-KING', type: 'KING', player: 'p1',
				position: { x: 5, z: 5 }, hasMoved: false,
			};
			game.chessPieces.push(king);
			boardManager.setCell(game.board, 5, 5, [
				{ type: 'tetromino', player: 'p1' },
				{ type: 'chess', player: 'p1', pieceId: king.id },
			]);
			boardManager.setCell(game.board, 5, 6, [{ type: 'tetromino', player: 'p1' }]);

			expect(chessManager.hasValidChessMoves(game, 'p1')).toBe(true);
		});

		test('returns false when player has no pieces', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'p1');

			expect(chessManager.hasValidChessMoves(game, 'p1')).toBe(false);
		});
	});
});
