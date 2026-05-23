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

		test('does NOT report a clear when all the run is bare home markers (no removable content)', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'p1');

			// 8 bare home markers in a row with no chess piece in the home
			// zone — i.e. an unsafe / degraded home zone. Without the new
			// "clearable content" filter the old code would report this as
			// cleared even though `_clearLine` couldn't actually remove
			// anything (home markers are always preserved). That was the
			// "phantom clear" players complained about.
			for (let x = 0; x < 8; x++) {
				boardManager.setCell(game.board, x, 9, [
					{ type: 'home', player: 'p1' },
				]);
			}

			const { rows, cols } = boardManager.checkAndClearLines(game);
			expect(rows).toHaveLength(0);
			expect(cols).toHaveLength(0);

			expect(boardManager.getCell(game.board, 0, 9)).not.toBeNull();
		});

		test('home cells count as empty space — a run broken by a home cell does NOT clear', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'p1');

			// 4 tetrominoes - home marker - 4 tetrominoes  ⇒ each side only 4
			// in a row, so neither side reaches the 8-threshold. No clear.
			for (let x = 0; x < 4; x++) {
				boardManager.setCell(game.board, x, 20, [
					{ type: 'tetromino', player: 'p1' },
				]);
			}
			boardManager.setCell(game.board, 4, 20, [
				{ type: 'home', player: 'p1' },
			]);
			for (let x = 5; x < 9; x++) {
				boardManager.setCell(game.board, x, 20, [
					{ type: 'tetromino', player: 'p1' },
				]);
			}

			const { rows, cols } = boardManager.checkAndClearLines(game);
			expect(rows).toHaveLength(0);
			expect(cols).toHaveLength(0);

			for (let x = 0; x < 9; x++) {
				if (x === 4) continue;
				expect(boardManager.getCell(game.board, x, 20)).not.toBeNull();
			}
		});

		test('a full 8-run alongside a home cell still clears (cells on opposite sides counted independently)', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'p1');

			// home + 8 tetrominoes — the right-hand run reaches the threshold.
			boardManager.setCell(game.board, 0, 30, [{ type: 'home', player: 'p1' }]);
			for (let x = 1; x <= 8; x++) {
				boardManager.setCell(game.board, x, 30, [{ type: 'tetromino', player: 'p1' }]);
			}

			const { rows } = boardManager.checkAndClearLines(game);
			expect(rows).toContain(30);

			// Home cell survives the clear (it was treated as empty all along).
			const homeCell = boardManager.getCell(game.board, 0, 30);
			expect(Array.isArray(homeCell)).toBe(true);
			expect(homeCell.some(item => item.type === 'home')).toBe(true);

			// All 8 tetromino cells are gone.
			for (let x = 1; x <= 8; x++) {
				expect(boardManager.getCell(game.board, x, 30)).toBeNull();
			}
		});

		test('lifts chess pieces off cleared cells; orphaned pieces fall into the water (bible §15.2 wings rule)', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'p1');
			game.chessPieces = [
				{ id: 'pawn-1', type: 'PAWN', player: 'p1', position: { x: 7, z: 12 } },
			];

			// 7 tetromino cells plus one chess cell — 8 clearable cells.
			// Under the wings rule the chess marker is stripped along
			// with everything else; the piece becomes airborne and
			// settles afterwards. With no terrain underneath the piece
			// falls (no cell to land on), removing it from
			// `game.chessPieces`.
			for (let x = 0; x < 7; x++) {
				boardManager.setCell(game.board, x, 12, [
					{ type: 'tetromino', player: 'p1' },
				]);
			}
			boardManager.setCell(game.board, 7, 12, [
				{ type: 'tetromino', player: 'p1' },
				{ type: 'chess', player: 'p1', pieceId: 'pawn-1', pieceType: 'pawn' },
			]);

			const { rows, settleOutcomes } = boardManager.checkAndClearLines(game);
			expect(rows).toContain(12);

			for (let x = 0; x <= 7; x++) {
				expect(boardManager.getCell(game.board, x, 12)).toBeNull();
			}
			expect(settleOutcomes).toEqual([
				expect.objectContaining({ pieceId: 'pawn-1', outcome: 'fell' }),
			]);
			expect(game.chessPieces.find(p => p.id === 'pawn-1')).toBeUndefined();
		});

		test('an airborne piece survives when gravity drags a supporting cell back under it', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'p1');
			// King anchors gravity direction at (0, 0).
			boardManager.setCell(game.board, 0, 0, [
				{ type: 'home', player: 'p1' },
				{ type: 'chess', player: 'p1', pieceId: 'king-1', pieceType: 'king' },
			]);
			game.chessPieces = [
				{ id: 'king-1', type: 'KING', player: 'p1', position: { x: 0, z: 0 } },
				{ id: 'rook-1', type: 'ROOK', player: 'p1', position: { x: 4, z: 12 } },
			];

			// Cleared row z=12: 7 tetromino cells + rook cell. The
			// column x=4 only has two cells (z=12 and z=13) so it is
			// not itself clearable — gravity should still pull (4, 13)
			// one step towards the king and into (4, 12), giving the
			// rook a fresh cell to land on.
			for (let x = 0; x < 8; x++) {
				if (x === 4) {
					boardManager.setCell(game.board, x, 12, [
						{ type: 'tetromino', player: 'p1' },
						{ type: 'chess', player: 'p1', pieceId: 'rook-1', pieceType: 'rook' },
					]);
				} else {
					boardManager.setCell(game.board, x, 12, [
						{ type: 'tetromino', player: 'p1' },
					]);
				}
			}
			boardManager.setCell(game.board, 4, 13, [{ type: 'tetromino', player: 'p1' }]);

			const { rows, settleOutcomes } = boardManager.checkAndClearLines(game);
			expect(rows).toContain(12);

			// The rook should have landed back at its original square
			// because gravity dropped a terrain cell underneath it.
			expect(settleOutcomes).toEqual([
				expect.objectContaining({ pieceId: 'rook-1', outcome: 'landed' }),
			]);
			expect(game.chessPieces.find(p => p.id === 'rook-1')).toBeDefined();
			const restoredCell = boardManager.getCell(game.board, 4, 12);
			expect(Array.isArray(restoredCell)).toBe(true);
			expect(restoredCell.some(item => item && item.type === 'chess'
				&& String(item.pieceId) === 'rook-1')).toBe(true);
		});
	});

	describe('findClearableLines / applyClearedLines split', () => {
		test('findClearableLines reports all cells the clear would actually touch (including chess)', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'p1');

			for (let x = 0; x < 7; x++) {
				boardManager.setCell(game.board, x, 40, [{ type: 'tetromino', player: 'p1' }]);
			}
			boardManager.setCell(game.board, 7, 40, [
				{ type: 'tetromino', player: 'p1' },
				{ type: 'chess', player: 'p1', pieceId: 'rook-1', pieceType: 'rook' },
			]);

			const { rows, cols, cells } = boardManager.findClearableLines(game);
			expect(rows).toContain(40);
			expect(cols).toHaveLength(0);

			// All 8 cells should flash under the wings rule — the chess
			// cell flashes too so the client can grow wings on the rook
			// before the clear lifts it.
			expect(cells).toHaveLength(8);
			expect(cells.every(c => c.z === 40)).toBe(true);
			expect(cells.some(c => c.x === 7)).toBe(true);
		});

		test('findClearableLines does NOT mutate the board', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'p1');

			for (let x = 0; x < 8; x++) {
				boardManager.setCell(game.board, x, 50, [{ type: 'tetromino', player: 'p1' }]);
			}

			const snapshotBefore = JSON.stringify(game.board.cells);
			boardManager.findClearableLines(game);
			const snapshotAfter = JSON.stringify(game.board.cells);

			expect(snapshotAfter).toBe(snapshotBefore);
		});

		test('applyClearedLines clears the supplied rows and cols and reports modified count', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'p1');

			for (let x = 0; x < 8; x++) {
				boardManager.setCell(game.board, x, 60, [{ type: 'tetromino', player: 'p1' }]);
			}

			const applied = boardManager.applyClearedLines(game, [60], []);
			expect(applied.rows).toEqual([60]);
			expect(applied.cols).toEqual([]);
			expect(applied.totalCellsCleared).toBe(8);

			for (let x = 0; x < 8; x++) {
				expect(boardManager.getCell(game.board, x, 60)).toBeNull();
			}
		});

		test('home cells bound the clear to the qualifying run on their side only', () => {
			// 8 owned cells, then a home cell, then 4 more owned cells.
			// Only the qualifying 8-run should be cleared; the 4 cells
			// on the far side of the home gap must survive untouched.
			const game = createGame(boardManager);
			addPlayer(game, 'p1');
			for (let x = 0; x < 8; x++) {
				boardManager.setCell(game.board, x, 70, [{ type: 'tetromino', player: 'p1' }]);
			}
			boardManager.setCell(game.board, 8, 70, [{ type: 'home', player: 'p1' }]);
			for (let x = 9; x < 13; x++) {
				boardManager.setCell(game.board, x, 70, [{ type: 'tetromino', player: 'p1' }]);
			}

			const { rows, cells, rowRuns } = boardManager.findClearableLines(game);
			expect(rows).toEqual([70]);
			expect(rowRuns.get(70)).toEqual([{ start: 0, end: 7 }]);
			expect(cells.every(c => c.x <= 7)).toBe(true);

			boardManager.applyClearedLines(game, rows, [], { rowRuns });

			for (let x = 0; x < 8; x++) {
				expect(boardManager.getCell(game.board, x, 70)).toBeNull();
			}
			// Home cell still present.
			expect(boardManager.getCell(game.board, 8, 70)).toEqual([
				expect.objectContaining({ type: 'home', player: 'p1' }),
			]);
			// The 4 cells on the far side must NOT have been stripped.
			for (let x = 9; x < 13; x++) {
				const cell = boardManager.getCell(game.board, x, 70);
				expect(cell).toEqual([
					expect.objectContaining({ type: 'tetromino', player: 'p1' }),
				]);
			}
		});

		test('two qualifying runs in the same line both clear', () => {
			// 8 cells, gap of 2 empty, 8 more cells. Two qualifying
			// runs → both should clear; the gap stays empty.
			const game = createGame(boardManager);
			addPlayer(game, 'p1');
			for (let x = 0; x < 8; x++) {
				boardManager.setCell(game.board, x, 80, [{ type: 'tetromino', player: 'p1' }]);
			}
			for (let x = 10; x < 18; x++) {
				boardManager.setCell(game.board, x, 80, [{ type: 'tetromino', player: 'p1' }]);
			}

			const { rows, rowRuns } = boardManager.findClearableLines(game);
			expect(rows).toEqual([80]);
			expect(rowRuns.get(80)).toEqual([
				{ start: 0, end: 7 },
				{ start: 10, end: 17 },
			]);

			const applied = boardManager.applyClearedLines(game, rows, [], { rowRuns });
			expect(applied.totalCellsCleared).toBe(16);
		});
	});

	describe('checkAndClearLines — dual axis', () => {
		test('clears an x-column with 8 consecutive cells (column-axis clear)', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'p1');

			// 8 consecutive cells along z at constant x — i.e. an x-column.
			for (let z = 0; z < 8; z++) {
				boardManager.setCell(game.board, 5, z, [
					{ type: 'tetromino', player: 'p1' },
				]);
			}

			const { rows, cols } = boardManager.checkAndClearLines(game);
			expect(rows).toHaveLength(0);
			expect(cols).toContain(5);

			for (let z = 0; z < 8; z++) {
				expect(boardManager.getCell(game.board, 5, z)).toBeNull();
			}
		});

		test('clears both a row and a column from a single placement', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'p1');

			for (let x = 0; x < 8; x++) {
				boardManager.setCell(game.board, x, 4, [{ type: 'tetromino', player: 'p1' }]);
			}
			for (let z = 0; z < 8; z++) {
				boardManager.setCell(game.board, 2, z, [{ type: 'tetromino', player: 'p1' }]);
			}

			const { rows, cols } = boardManager.checkAndClearLines(game);
			expect(rows).toContain(4);
			expect(cols).toContain(2);
		});

		test('gravity along x pulls cells towards king for an x-column clear', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'p1');

			// King at (0, 15) — far from the column clear so it doesn't form
			// any z-row by accident.
			boardManager.addToCellContents(game.board, 0, 15, {
				type: 'chess', player: 'p1', pieceType: 'king', pieceId: 'p1-K',
			});
			game.chessPieces.push({
				id: 'p1-K', type: 'KING', player: 'p1',
				position: { x: 0, z: 15 }, hasMoved: false,
			});

			// One isolated trailing cell beyond the column-to-clear.
			// Place it at z=20 so it is not on any z-row that could also clear.
			boardManager.setCell(game.board, 11, 20, [{ type: 'tetromino', player: 'p1' }]);

			// Stack an x-column at x=10 along z=0..7 to trigger an x-axis clear.
			for (let z = 0; z < 8; z++) {
				boardManager.setCell(game.board, 10, z, [{ type: 'tetromino', player: 'p1' }]);
			}

			const { rows, cols } = boardManager.checkAndClearLines(game);
			expect(rows).toHaveLength(0);
			expect(cols).toContain(10);

			// x=11 should have shifted one step towards king (kingX=0 < 11) → x=10.
			expect(boardManager.getCell(game.board, 11, 20)).toBeNull();
			expect(boardManager.getCell(game.board, 10, 20)).not.toBeNull();
		});
	});

	describe('gravity rules — bible §15.2', () => {
		function setupKing(game, playerId, kingX, kingZ) {
			boardManager.addToCellContents(game.board, kingX, kingZ, {
				type: 'chess', player: playerId, pieceType: 'king',
				pieceId: `${playerId}-K`,
			});
			game.chessPieces.push({
				id: `${playerId}-K`, type: 'KING', player: playerId,
				position: { x: kingX, z: kingZ }, hasMoved: false,
			});
		}

		// Fill a z-row with clearable tetromino terrain so the row will
		// actually clear when applyClearedLines runs — without this, the
		// _clearLine helper returns 0 and gravity is skipped.
		function fillClearableRow(game, playerId, z, xStart = 30) {
			for (let x = xStart; x < xStart + 8; x++) {
				boardManager.setCell(game.board, x, z, [{ type: 'tetromino', player: playerId }]);
			}
		}

		test('single-owner cells slide one step closer to the king per cleared line', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'p1');
			setupKing(game, 'p1', 0, 0);

			fillClearableRow(game, 'p1', 10);
			// Trailing cell at z=20 should move to z=19 when z=10 clears.
			boardManager.setCell(game.board, 0, 20, [{ type: 'tetromino', player: 'p1' }]);

			boardManager.applyClearedLines(game, [10], []);
			expect(boardManager.getCell(game.board, 0, 20)).toBeNull();
			expect(boardManager.getCell(game.board, 0, 19)).not.toBeNull();
		});

		test('multi-owner cells do NOT move during gravity', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'p1');
			addPlayer(game, 'p2');
			setupKing(game, 'p1', 0, 0);

			fillClearableRow(game, 'p1', 10);
			boardManager.setCell(game.board, 0, 20, [
				{ type: 'tetromino', player: 'p1' },
				{ type: 'tetromino', player: 'p2' },
			]);

			boardManager.applyClearedLines(game, [10], []);
			expect(boardManager.getCell(game.board, 0, 20)).not.toBeNull();
			expect(boardManager.getCell(game.board, 0, 19)).toBeNull();
		});

		test('chess-piece cell directly adjacent to a cleared row moves with the piece owner', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'p1');
			setupKing(game, 'p1', 0, 0);

			fillClearableRow(game, 'p1', 10);
			game.chessPieces.push({
				id: 'p1-R', type: 'ROOK', player: 'p1',
				position: { x: 0, z: 11 },
			});
			boardManager.setCell(game.board, 0, 11, [
				{ type: 'chess', player: 'p1', pieceId: 'p1-R', pieceType: 'rook' },
			]);

			boardManager.applyClearedLines(game, [10], []);

			expect(boardManager.getCell(game.board, 0, 11)).toBeNull();
			expect(boardManager.getCell(game.board, 0, 10)).not.toBeNull();
			const rook = game.chessPieces.find(p => p.id === 'p1-R');
			expect(rook.position).toEqual({ x: 0, z: 10 });
		});

		test('chess-piece cell linked to a cleared row via sole-ownership cells moves', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'p1');
			setupKing(game, 'p1', 0, 0);

			fillClearableRow(game, 'p1', 10);
			// Unbroken sole-ownership chain at x=0, z=11..14.
			for (let z = 11; z <= 14; z++) {
				boardManager.setCell(game.board, 0, z, [{ type: 'tetromino', player: 'p1' }]);
			}
			game.chessPieces.push({
				id: 'p1-R', type: 'ROOK', player: 'p1',
				position: { x: 0, z: 15 },
			});
			boardManager.setCell(game.board, 0, 15, [
				{ type: 'chess', player: 'p1', pieceId: 'p1-R', pieceType: 'rook' },
			]);

			boardManager.applyClearedLines(game, [10], []);

			expect(boardManager.getCell(game.board, 0, 15)).toBeNull();
			expect(boardManager.getCell(game.board, 0, 14)).not.toBeNull();
			const rook = game.chessPieces.find(p => p.id === 'p1-R');
			expect(rook.position).toEqual({ x: 0, z: 14 });
		});

		test('chess-piece cell stranded by a mixed-owner gap does NOT move', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'p1');
			addPlayer(game, 'p2');
			setupKing(game, 'p1', 0, 0);

			fillClearableRow(game, 'p1', 10);
			// Chain to z=12 is fine, then z=13 is a multi-owner cell —
			// the chain breaks. The chess piece at z=15 is on its own
			// little island and shouldn't move.
			boardManager.setCell(game.board, 0, 11, [{ type: 'tetromino', player: 'p1' }]);
			boardManager.setCell(game.board, 0, 12, [{ type: 'tetromino', player: 'p1' }]);
			boardManager.setCell(game.board, 0, 13, [
				{ type: 'tetromino', player: 'p1' },
				{ type: 'tetromino', player: 'p2' }, // multi-owner — link broken
			]);
			boardManager.setCell(game.board, 0, 14, [{ type: 'tetromino', player: 'p1' }]);
			game.chessPieces.push({
				id: 'p1-R', type: 'ROOK', player: 'p1',
				position: { x: 0, z: 15 },
			});
			boardManager.setCell(game.board, 0, 15, [
				{ type: 'chess', player: 'p1', pieceId: 'p1-R', pieceType: 'rook' },
			]);

			boardManager.applyClearedLines(game, [10], []);

			// Rook stays put — the chain back to the cleared row was broken.
			expect(boardManager.getCell(game.board, 0, 15)).not.toBeNull();
			const rook = game.chessPieces.find(p => p.id === 'p1-R');
			expect(rook.position).toEqual({ x: 0, z: 15 });
		});

		test('chess-piece cell on a fully isolated tile does NOT move', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'p1');
			setupKing(game, 'p1', 0, 0);

			fillClearableRow(game, 'p1', 10);
			// No chain at all — single chess cell way out at z=25.
			game.chessPieces.push({
				id: 'p1-R', type: 'ROOK', player: 'p1',
				position: { x: 0, z: 25 },
			});
			boardManager.setCell(game.board, 0, 25, [
				{ type: 'chess', player: 'p1', pieceId: 'p1-R', pieceType: 'rook' },
			]);

			boardManager.applyClearedLines(game, [10], []);

			expect(boardManager.getCell(game.board, 0, 25)).not.toBeNull();
			const rook = game.chessPieces.find(p => p.id === 'p1-R');
			expect(rook.position).toEqual({ x: 0, z: 25 });
		});

		test('bare home cells do NOT move during gravity (they anchor the home zone)', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'p1');
			setupKing(game, 'p1', 0, 0);

			fillClearableRow(game, 'p1', 10);
			boardManager.setCell(game.board, 0, 20, [{ type: 'home', player: 'p1' }]);

			boardManager.applyClearedLines(game, [10], []);
			expect(boardManager.getCell(game.board, 0, 20)).not.toBeNull();
			expect(boardManager.getCell(game.board, 0, 19)).toBeNull();
		});

		test('chess-piece cell on top of an enemy home is anchored to piece owner and moves when adjacent to the clear', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'p1');
			addPlayer(game, 'enemy');
			setupKing(game, 'p1', 0, 0);

			fillClearableRow(game, 'p1', 10);
			// Adjacent to the clear, so the connectivity test passes.
			game.chessPieces.push({
				id: 'p1-R', type: 'ROOK', player: 'p1',
				position: { x: 0, z: 11 },
			});
			boardManager.setCell(game.board, 0, 11, [
				{ type: 'home', player: 'enemy' },
				{ type: 'chess', player: 'p1', pieceId: 'p1-R', pieceType: 'rook' },
			]);

			boardManager.applyClearedLines(game, [10], []);

			expect(boardManager.getCell(game.board, 0, 11)).toBeNull();
			expect(boardManager.getCell(game.board, 0, 10)).not.toBeNull();
		});

		test('gravity handles a row clear AND a column clear in one tick without double-moving', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'p1');
			setupKing(game, 'p1', 0, 0);

			// Trailing cell well beyond both clears.
			boardManager.setCell(game.board, 20, 20, [{ type: 'tetromino', player: 'p1' }]);
			// Trigger BOTH a row (z=10) and a column (x=10) clear. Use
			// disjoint terrain so the row + column fills don't overlap
			// and the gravity sweep has two cleared lines to process.
			for (let x = 30; x < 38; x++) {
				boardManager.setCell(game.board, x, 10, [{ type: 'tetromino', player: 'p1' }]);
			}
			for (let z = 30; z < 38; z++) {
				boardManager.setCell(game.board, 10, z, [{ type: 'tetromino', player: 'p1' }]);
			}

			boardManager.applyClearedLines(game, [10], [10]);
			expect(boardManager.getCell(game.board, 20, 20)).toBeNull();
			expect(boardManager.getCell(game.board, 19, 19)).not.toBeNull();
		});

		test('two cleared rows pull a distant cell two steps towards the king', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'p1');
			setupKing(game, 'p1', 0, 0);

			fillClearableRow(game, 'p1', 10, 30);
			fillClearableRow(game, 'p1', 20, 30);
			boardManager.setCell(game.board, 0, 30, [{ type: 'tetromino', player: 'p1' }]);

			boardManager.applyClearedLines(game, [10, 20], []);
			expect(boardManager.getCell(game.board, 0, 30)).toBeNull();
			expect(boardManager.getCell(game.board, 0, 28)).not.toBeNull();
		});
	});
	
	describe('isCellInSafeHomeZone', () => {
		test('returns false when home-zone bounds exist but the cell has no active home marker', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'p1');
			createHomeZone(game, boardManager, 'p1', 4, 5, 0);
			
			game.chessPieces.push({
				id: 'p1-KING', type: 'KING', player: 'p1',
				position: { x: 8, z: 5 }, hasMoved: false,
			});
			boardManager.addToCellContents(game.board, 8, 5, {
				type: 'chess', player: 'p1', pieceId: 'p1-KING', pieceType: 'king',
			});
			
			// Replace one home cell with normal terrain only.
			boardManager.setCell(game.board, 4, 5, [{ type: 'tetromino', player: 'p1' }]);
			
			expect(boardManager.isCellInSafeHomeZone(game, 4, 5)).toBe(false);
		});
		
		test('returns false for degraded home zones even if home markers remain', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'p1');
			createHomeZone(game, boardManager, 'p1', 4, 5, 0);
			game.homeZones.p1.isDegraded = true;
			
			game.chessPieces.push({
				id: 'p1-KING', type: 'KING', player: 'p1',
				position: { x: 8, z: 5 }, hasMoved: false,
			});
			boardManager.addToCellContents(game.board, 8, 5, {
				type: 'chess', player: 'p1', pieceId: 'p1-KING', pieceType: 'king',
			});
			
			expect(boardManager.isCellInSafeHomeZone(game, 4, 5)).toBe(false);
		});
	});
});
