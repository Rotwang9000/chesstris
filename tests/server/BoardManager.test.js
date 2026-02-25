/**
 * Tests for the real server/game/BoardManager.js
 * Covers: board creation, cell CRUD, row clearing, home zone protection, gravity.
 */

const BoardManager = require('../../server/game/BoardManager');
const { GAME_RULES } = require('../../server/game/Constants');
const { createManagers, createGame, addPlayer, createHomeZone, placeTetromino } = require('./testHelpers');

describe('BoardManager', () => {
	let boardManager;

	beforeEach(() => {
		({ boardManager } = createManagers());
	});

	// ── Board creation ──────────────────────────────────────────────────────

	describe('createEmptyBoard', () => {
		test('returns a board with a cells object', () => {
			const board = boardManager.createEmptyBoard();
			expect(board).toBeDefined();
			expect(board.cells).toBeDefined();
			expect(typeof board.cells).toBe('object');
		});

		test('starts with no cells', () => {
			const board = boardManager.createEmptyBoard();
			expect(Object.keys(board.cells)).toHaveLength(0);
		});
	});

	// ── Cell CRUD ───────────────────────────────────────────────────────────

	describe('cell operations', () => {
		let board;
		beforeEach(() => { board = boardManager.createEmptyBoard(); });

		test('setCell and getCell round-trip', () => {
			const content = [{ type: 'tetromino', player: 'p1' }];
			boardManager.setCell(board, 3, 5, content);
			expect(boardManager.getCell(board, 3, 5)).toEqual(content);
		});

		test('getCell returns null for empty coordinates', () => {
			expect(boardManager.getCell(board, 99, 99)).toBeNull();
		});

		test('addToCellContents appends to existing cell', () => {
			boardManager.setCell(board, 0, 0, [{ type: 'home', player: 'p1' }]);
			boardManager.addToCellContents(board, 0, 0, { type: 'chess', player: 'p1' });
			const cell = boardManager.getCell(board, 0, 0);
			expect(cell).toHaveLength(2);
			expect(cell[1].type).toBe('chess');
		});

		test('addToCellContents creates cell if empty', () => {
			boardManager.addToCellContents(board, 10, 10, { type: 'tetromino', player: 'p1' });
			const cell = boardManager.getCell(board, 10, 10);
			expect(cell).toHaveLength(1);
		});

		test('setCell with null deletes the cell', () => {
			boardManager.setCell(board, 0, 0, [{ type: 'home', player: 'p1' }]);
			boardManager.setCell(board, 0, 0, null);
			expect(boardManager.getCell(board, 0, 0)).toBeNull();
		});
	});

	// ── Row clearing ────────────────────────────────────────────────────────

	describe('checkAndClearRows', () => {
		test('clears a row with 8 consecutive filled cells', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'p1');

			// Place 8 consecutive cells in a row at z=5
			for (let x = 0; x < 8; x++) {
				boardManager.setCell(game.board, x, 5, [
					{ type: 'tetromino', player: 'p1' },
				]);
			}

			const cleared = boardManager.checkAndClearRows(game);
			expect(cleared).toContain(5);

			// Cells should be gone
			for (let x = 0; x < 8; x++) {
				expect(boardManager.getCell(game.board, x, 5)).toBeNull();
			}
		});

		test('does NOT clear a row with fewer than 8 consecutive filled cells', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'p1');

			for (let x = 0; x < 7; x++) {
				boardManager.setCell(game.board, x, 3, [
					{ type: 'tetromino', player: 'p1' },
				]);
			}

			const cleared = boardManager.checkAndClearRows(game);
			expect(cleared).toHaveLength(0);
		});

		test('safe home-zone cells reset the consecutive count', () => {
			const { boardManager, chessManager } = createManagers();
			const game = createGame(boardManager);
			addPlayer(game, 'p1');

			// Create a home zone at x=4 with a chess piece (makes it "safe")
			const homeZone = createHomeZone(game, boardManager, 'p1', 4, 5, 0);
			game.chessPieces.push({
				id: 'p1-KING-1', type: 'KING', player: 'p1',
				position: { x: 8, z: 5 }, hasMoved: false,
			});
			// Must also add a chess cell entry so isCellInSafeHomeZone finds it
			boardManager.addToCellContents(game.board, 8, 5, {
				type: 'chess', player: 'p1', pieceId: 'p1-KING-1', pieceType: 'king',
			});

			// Fill cells: x=0..3 (4 cells), then home at x=4..11 breaks it, then x=12..15 (4 cells)
			for (let x = 0; x < 4; x++) {
				boardManager.setCell(game.board, x, 5, [{ type: 'tetromino', player: 'p1' }]);
			}
			for (let x = 12; x < 16; x++) {
				boardManager.setCell(game.board, x, 5, [{ type: 'tetromino', player: 'p1' }]);
			}

			const cleared = boardManager.checkAndClearRows(game);
			// Neither segment reaches 8, so nothing should be cleared
			expect(cleared).toHaveLength(0);
		});

		test('preserves home zone markers when clearing non-home cells', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'p1');

			// Place a home cell with tetromino content at x=0 (not in a safe zone — no pieces)
			boardManager.setCell(game.board, 0, 7, [
				{ type: 'home', player: 'p1' },
				{ type: 'tetromino', player: 'p1' },
			]);

			// Fill the rest of the row for clearing
			for (let x = 1; x < 9; x++) {
				boardManager.setCell(game.board, x, 7, [{ type: 'tetromino', player: 'p1' }]);
			}

			boardManager.checkAndClearRows(game);

			// The non-home cells should be cleared
			expect(boardManager.getCell(game.board, 5, 7)).toBeNull();
		});
	});
});
