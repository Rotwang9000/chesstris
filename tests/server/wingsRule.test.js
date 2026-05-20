/**
 * Tests for the bible §15.2 "wings" rule — chess pieces on cleared
 * cells lift off, hover, then attempt to land. Survival depends on
 * what's under them when gravity finishes.
 */

const BoardManager = require('../../server/game/BoardManager');
const LineClearServiceModule = require('../../server/game/LineClearService');

function createGame(boardManager) {
	const game = {
		board: boardManager.createEmptyBoard(),
		players: {},
		homeZones: {},
		chessPieces: [],
		currentTurns: {},
		id: 'wings-test-world',
	};
	return game;
}

function addPlayer(game, id) {
	game.players[id] = { id, name: id, eliminated: false };
}

describe('Wings rule — pieces on cleared cells lift off and settle', () => {
	let boardManager;
	beforeEach(() => { boardManager = new BoardManager(); });

	test('piece falls into the water when no cell remains under it after gravity', () => {
		const game = createGame(boardManager);
		addPlayer(game, 'p1');
		game.chessPieces = [
			{ id: 'pawn-1', type: 'PAWN', player: 'p1', position: { x: 7, z: 5 } },
		];

		for (let x = 0; x < 7; x++) {
			boardManager.setCell(game.board, x, 5, [{ type: 'tetromino', player: 'p1' }]);
		}
		boardManager.setCell(game.board, 7, 5, [
			{ type: 'tetromino', player: 'p1' },
			{ type: 'chess', player: 'p1', pieceId: 'pawn-1', pieceType: 'pawn' },
		]);

		const { settleOutcomes } = boardManager.checkAndClearLines(game);
		expect(settleOutcomes).toHaveLength(1);
		expect(settleOutcomes[0]).toMatchObject({ pieceId: 'pawn-1', outcome: 'fell' });
		expect(game.chessPieces.find(p => p.id === 'pawn-1')).toBeUndefined();
	});

	test('an airborne piece bumps another piece off when gravity drops a chess cell beneath it', () => {
		const game = createGame(boardManager);
		addPlayer(game, 'p1');
		// King anchors gravity for p1 at (0, 0).
		boardManager.setCell(game.board, 0, 0, [
			{ type: 'home', player: 'p1' },
			{ type: 'chess', player: 'p1', pieceId: 'king-1', pieceType: 'king' },
		]);
		game.chessPieces = [
			{ id: 'king-1', type: 'KING', player: 'p1', position: { x: 0, z: 0 } },
			// Airborne rook on the cleared row.
			{ id: 'rook-1', type: 'ROOK', player: 'p1', position: { x: 4, z: 12 } },
			// A friendly bishop one row past — adjacent to the clear,
			// so gravity-eligible (its cell is owned by the bishop's
			// player and directly touches the cleared row).
			{ id: 'bishop-1', type: 'BISHOP', player: 'p1', position: { x: 4, z: 13 } },
		];

		// Clearable row z=12 (8 cells), p1 owner.
		for (let x = 0; x < 8; x++) {
			if (x === 4) {
				boardManager.setCell(game.board, x, 12, [
					{ type: 'tetromino', player: 'p1' },
					{ type: 'chess', player: 'p1', pieceId: 'rook-1', pieceType: 'rook' },
				]);
			} else {
				boardManager.setCell(game.board, x, 12, [{ type: 'tetromino', player: 'p1' }]);
			}
		}
		boardManager.setCell(game.board, 4, 13, [
			{ type: 'tetromino', player: 'p1' },
			{ type: 'chess', player: 'p1', pieceId: 'bishop-1', pieceType: 'bishop' },
		]);

		const { settleOutcomes } = boardManager.checkAndClearLines(game);
		const rookOutcome = settleOutcomes.find(o => o.pieceId === 'rook-1');
		expect(rookOutcome).toBeDefined();
		expect(rookOutcome.outcome).toBe('landed');
		expect(rookOutcome.bumpedPieceId).toBe('bishop-1');

		expect(game.chessPieces.find(p => p.id === 'rook-1')).toBeDefined();
		expect(game.chessPieces.find(p => p.id === 'bishop-1')).toBeUndefined();
		// The rook's new cell should have exactly one chess marker
		// and it should be the rook's.
		const cell = boardManager.getCell(game.board, 4, 12);
		const chessItems = (cell || []).filter(it => it && it.type === 'chess');
		expect(chessItems).toHaveLength(1);
		expect(String(chessItems[0].pieceId)).toBe('rook-1');
	});

	test('runImmediate settles airborne pieces and exposes the outcomes', () => {
		const game = createGame(boardManager);
		addPlayer(game, 'p1');
		game.chessPieces = [
			{ id: 'pawn-2', type: 'PAWN', player: 'p1', position: { x: 0, z: 20 } },
		];

		for (let x = 0; x < 8; x++) {
			if (x === 0) {
				boardManager.setCell(game.board, x, 20, [
					{ type: 'tetromino', player: 'p1' },
					{ type: 'chess', player: 'p1', pieceId: 'pawn-2', pieceType: 'pawn' },
				]);
			} else {
				boardManager.setCell(game.board, x, 20, [{ type: 'tetromino', player: 'p1' }]);
			}
		}

		const fakeIO = { to: () => ({ emit: () => {} }) };
		const fakeGameManager = { boardManager };
		const fakeBroadcaster = { broadcastGameUpdate: () => {} };
		const fakeIntegrity = { runIslandIntegrityPass: () => {} };
		const fakePersistence = { markDirty: () => {} };

		const service = LineClearServiceModule.createLineClearService({
			io: fakeIO,
			gameManager: fakeGameManager,
			broadcaster: fakeBroadcaster,
			integrityService: fakeIntegrity,
			persistence: fakePersistence,
			activityLog: null,
		});

		// Need to mock World context — runImmediate doesn't touch World
		// directly, only runCascade does. Use runImmediate to skip that.
		const result = service.runImmediate(game, { triggeredBy: 'p1' });
		expect(result.rows).toContain(20);
		expect(result.settleOutcomes).toHaveLength(1);
		expect(result.settleOutcomes[0]).toMatchObject({
			pieceId: 'pawn-2',
			outcome: 'fell',
		});
		expect(game.chessPieces.find(p => p.id === 'pawn-2')).toBeUndefined();
	});

	test('cells_clearing payload includes the airbornePieceIds for the wing flap', () => {
		const game = createGame(boardManager);
		addPlayer(game, 'p1');
		game.chessPieces = [
			{ id: 'pawn-3', type: 'PAWN', player: 'p1', position: { x: 3, z: 30 } },
			{ id: 'bishop-3', type: 'BISHOP', player: 'p1', position: { x: 5, z: 30 } },
		];

		for (let x = 0; x < 8; x++) {
			const items = [{ type: 'tetromino', player: 'p1' }];
			if (x === 3) items.push({ type: 'chess', player: 'p1', pieceId: 'pawn-3', pieceType: 'pawn' });
			if (x === 5) items.push({ type: 'chess', player: 'p1', pieceId: 'bishop-3', pieceType: 'bishop' });
			boardManager.setCell(game.board, x, 30, items);
		}

		const captured = [];
		const fakeIO = {
			to: () => ({
				emit: (name, payload) => captured.push({ name, payload }),
			}),
		};
		const fakeGameManager = { boardManager };
		const fakeBroadcaster = { broadcastGameUpdate: () => {} };
		const fakeIntegrity = { runIslandIntegrityPass: () => {} };
		const fakePersistence = { markDirty: () => {} };

		// World import is needed by runCascade — patch its getWorldId.
		const World = require('../../server/world/World');
		const originalGetWorldId = World.getWorldId;
		World.getWorldId = () => 'wings-test-world';
		const originalMarkDirty = World.markDirty;
		World.markDirty = () => {};

		const service = LineClearServiceModule.createLineClearService({
			io: fakeIO,
			gameManager: fakeGameManager,
			broadcaster: fakeBroadcaster,
			integrityService: fakeIntegrity,
			persistence: fakePersistence,
			activityLog: null,
		});

		return service.runCascade({
			world: game,
			playerId: 'p1',
			animate: false,
		}).then(() => {
			World.getWorldId = originalGetWorldId;
			World.markDirty = originalMarkDirty;

			const rowCleared = captured.find(c => c.name === 'row_cleared');
			expect(rowCleared).toBeDefined();
			expect(new Set(rowCleared.payload.airbornePieceIds))
				.toEqual(new Set(['pawn-3', 'bishop-3']));
			expect(rowCleared.payload.settleOutcomes).toHaveLength(2);
		});
	});
});
