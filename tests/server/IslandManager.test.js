/**
 * Tests for the real server/game/IslandManager.js
 * Covers: path to king (BFS), island detection, disconnected island removal.
 */

const { createManagers, createGame, addPlayer, placeTetromino } = require('./testHelpers');

describe('IslandManager', () => {
	let boardManager, islandManager;

	beforeEach(() => {
		({ boardManager, islandManager } = createManagers());
	});

	// ── hasPathToKing ───────────────────────────────────────────────────────

	describe('hasPathToKing', () => {
		test('finds direct path through adjacent owned cells', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'p1');

			game.chessPieces.push({
				id: 'p1-KING', type: 'KING', player: 'p1',
				position: { x: 0, z: 0 },
			});

			// Chain of cells: (0,0) → (1,0) → (2,0) → (3,0)
			for (let x = 0; x <= 3; x++) {
				boardManager.setCell(game.board, x, 0, [
					{ type: 'tetromino', player: 'p1' },
				]);
			}

			expect(islandManager.hasPathToKing(game, 3, 0, 'p1')).toBe(true);
		});

		test('returns false when no path exists', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'p1');

			game.chessPieces.push({
				id: 'p1-KING', type: 'KING', player: 'p1',
				position: { x: 0, z: 0 },
			});

			boardManager.setCell(game.board, 0, 0, [{ type: 'tetromino', player: 'p1' }]);
			// Isolated cell at (5, 5) — no connection
			boardManager.setCell(game.board, 5, 5, [{ type: 'tetromino', player: 'p1' }]);

			expect(islandManager.hasPathToKing(game, 5, 5, 'p1')).toBe(false);
		});

		test('diagonal-only link does NOT count as connected (orthogonal only)', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'p1');

			game.chessPieces.push({
				id: 'p1-KING', type: 'KING', player: 'p1',
				position: { x: 0, z: 0 },
			});

			boardManager.setCell(game.board, 0, 0, [{ type: 'tetromino', player: 'p1' }]);
			boardManager.setCell(game.board, 1, 1, [{ type: 'tetromino', player: 'p1' }]);
			boardManager.setCell(game.board, 2, 2, [{ type: 'tetromino', player: 'p1' }]);

			expect(islandManager.hasPathToKing(game, 2, 2, 'p1')).toBe(false);
		});

		test('orthogonal L-shaped path works', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'p1');

			game.chessPieces.push({
				id: 'p1-KING', type: 'KING', player: 'p1',
				position: { x: 0, z: 0 },
			});

			// L-shape: (0,0)→(1,0)→(1,1)→(1,2)
			boardManager.setCell(game.board, 0, 0, [{ type: 'tetromino', player: 'p1' }]);
			boardManager.setCell(game.board, 1, 0, [{ type: 'tetromino', player: 'p1' }]);
			boardManager.setCell(game.board, 1, 1, [{ type: 'tetromino', player: 'p1' }]);
			boardManager.setCell(game.board, 1, 2, [{ type: 'tetromino', player: 'p1' }]);

			expect(islandManager.hasPathToKing(game, 1, 2, 'p1')).toBe(true);
		});

		test('enemy cells do not form a path for the player', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'p1');
			addPlayer(game, 'p2');

			game.chessPieces.push({
				id: 'p1-KING', type: 'KING', player: 'p1',
				position: { x: 0, z: 0 },
			});

			boardManager.setCell(game.board, 0, 0, [{ type: 'tetromino', player: 'p1' }]);
			boardManager.setCell(game.board, 1, 0, [{ type: 'tetromino', player: 'p2' }]);
			boardManager.setCell(game.board, 2, 0, [{ type: 'tetromino', player: 'p1' }]);

			expect(islandManager.hasPathToKing(game, 2, 0, 'p1')).toBe(false);
		});

		test('returns false when king does not exist', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'p1');

			boardManager.setCell(game.board, 0, 0, [{ type: 'tetromino', player: 'p1' }]);

			expect(islandManager.hasPathToKing(game, 0, 0, 'p1')).toBe(false);
		});
	});

	// ── detectIslands ───────────────────────────────────────────────────────

	describe('detectIslands', () => {
		test('detects a single connected island', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'p1');

			game.chessPieces.push({
				id: 'p1-KING', type: 'KING', player: 'p1',
				position: { x: 0, z: 0 },
			});

			for (let x = 0; x <= 3; x++) {
				boardManager.setCell(game.board, x, 0, [
					{ type: 'tetromino', player: 'p1' },
				]);
			}

			const islands = islandManager.detectIslands(game);
			const p1Islands = islands.filter(i => i.playerId === 'p1');
			expect(p1Islands).toHaveLength(1);
			expect(p1Islands[0].hasKing).toBe(true);
			expect(p1Islands[0].cells).toHaveLength(4);
		});

		test('detects disconnected islands separately', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'p1');

			game.chessPieces.push({
				id: 'p1-KING', type: 'KING', player: 'p1',
				position: { x: 0, z: 0 },
			});

			boardManager.setCell(game.board, 0, 0, [{ type: 'tetromino', player: 'p1' }]);
			boardManager.setCell(game.board, 1, 0, [{ type: 'tetromino', player: 'p1' }]);

			// Disconnected group
			boardManager.setCell(game.board, 10, 10, [{ type: 'tetromino', player: 'p1' }]);
			boardManager.setCell(game.board, 11, 10, [{ type: 'tetromino', player: 'p1' }]);

			const islands = islandManager.detectIslands(game);
			const p1Islands = islands.filter(i => i.playerId === 'p1');
			expect(p1Islands).toHaveLength(2);

			const withKing = p1Islands.filter(i => i.hasKing);
			const withoutKing = p1Islands.filter(i => !i.hasKing);
			expect(withKing).toHaveLength(1);
			expect(withoutKing).toHaveLength(1);
		});

		test('handles two players sharing adjacent cells correctly', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'p1');
			addPlayer(game, 'p2');

			game.chessPieces.push(
				{ id: 'p1-KING', type: 'KING', player: 'p1', position: { x: 0, z: 0 } },
				{ id: 'p2-KING', type: 'KING', player: 'p2', position: { x: 2, z: 0 } },
			);

			boardManager.setCell(game.board, 0, 0, [{ type: 'tetromino', player: 'p1' }]);
			boardManager.setCell(game.board, 1, 0, [
				{ type: 'tetromino', player: 'p1' },
				{ type: 'tetromino', player: 'p2' },
			]);
			boardManager.setCell(game.board, 2, 0, [{ type: 'tetromino', player: 'p2' }]);

			const islands = islandManager.detectIslands(game);
			const p1Islands = islands.filter(i => i.playerId === 'p1');
			const p2Islands = islands.filter(i => i.playerId === 'p2');

			expect(p1Islands).toHaveLength(1);
			expect(p1Islands[0].hasKing).toBe(true);
			expect(p2Islands).toHaveLength(1);
			expect(p2Islands[0].hasKing).toBe(true);
		});
	});

	// ── Disconnected island removal ─────────────────────────────────────────

	describe('updateIslandsAfterTetrominoPlacement', () => {
		test('removes disconnected island cells and chess pieces', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'p1');

			game.chessPieces.push(
				{ id: 'p1-KING', type: 'KING', player: 'p1', position: { x: 0, z: 0 } },
				{ id: 'p1-PAWN', type: 'PAWN', player: 'p1', position: { x: 10, z: 10 } },
			);

			boardManager.setCell(game.board, 0, 0, [{ type: 'tetromino', player: 'p1' }]);
			boardManager.setCell(game.board, 10, 10, [
				{ type: 'tetromino', player: 'p1' },
				{ type: 'chess', player: 'p1', pieceId: 'p1-PAWN' },
			]);

			islandManager.updateIslandsAfterTetrominoPlacement(game, [{ x: 0, z: 0 }], 'p1');

			// Disconnected cell should be gone
			expect(boardManager.getCell(game.board, 10, 10)).toBeNull();

			// Pawn should be removed
			expect(game.chessPieces.find(p => p.id === 'p1-PAWN')).toBeUndefined();

			// King's cell should survive
			expect(boardManager.getCell(game.board, 0, 0)).not.toBeNull();
		});
		
		test('preserves disconnected cells/pieces inside a safe home zone', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'p1');
			
			// Connected king island.
			game.chessPieces.push({
				id: 'p1-KING', type: 'KING', player: 'p1', position: { x: 0, z: 0 },
			});
			boardManager.setCell(game.board, 0, 0, [
				{ type: 'tetromino', player: 'p1' },
				{ type: 'chess', player: 'p1', pieceId: 'p1-KING' },
			]);
			
			// Separate home-zone island with one pawn (safe home zone).
			game.homeZones = {
				p1: { x: 10, z: 10, width: 8, height: 2, orientation: 0, player: 'p1' },
			};
			
			for (let x = 10; x < 18; x++) {
				for (let z = 10; z < 12; z++) {
					boardManager.setCell(game.board, x, z, [{ type: 'home', player: 'p1' }]);
				}
			}
			
			game.chessPieces.push({
				id: 'p1-PAWN-HOME', type: 'PAWN', player: 'p1', position: { x: 10, z: 10 },
			});
			boardManager.addToCellContents(game.board, 10, 10, {
				type: 'chess', player: 'p1', pieceId: 'p1-PAWN-HOME', pieceType: 'pawn',
			});
			
			islandManager.updateIslandsAfterTetrominoPlacement(game, [{ x: 0, z: 0 }], 'p1');
			
			const homeCell = boardManager.getCell(game.board, 10, 10);
			expect(homeCell).not.toBeNull();
			
			const pawn = game.chessPieces.find(p => p.id === 'p1-PAWN-HOME');
			expect(pawn).toBeDefined();
		});
		
		test('recreates a support cell when a king has no board square', () => {
			const game = createGame(boardManager);
			addPlayer(game, 'p1');
			
			game.chessPieces.push({
				id: 'p1-KING', type: 'KING', player: 'p1', position: { x: 7, z: 7 },
			});
			
			// Simulate broken state: king exists but board cell vanished.
			expect(boardManager.getCell(game.board, 7, 7)).toBeNull();
			
			islandManager.updateIslandsAfterTetrominoPlacement(game, [], 'p1');
			
			const kingCell = boardManager.getCell(game.board, 7, 7);
			expect(kingCell).not.toBeNull();
			expect(kingCell.some(item => item && item.player === 'p1' && item.type !== 'chess')).toBe(true);
			expect(kingCell.some(item => item && item.type === 'chess' && item.pieceId === 'p1-KING')).toBe(true);
		});
	});
});
