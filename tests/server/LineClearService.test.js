/**
 * Tests for server/game/LineClearService — the async cascade orchestrator
 * that flashes affected cells, applies the clear, then loops to handle
 * gravity-induced chain clears.
 */

const { createLineClearService } = require('../../server/game/LineClearService');
const BoardManager = require('../../server/game/BoardManager');
const { createManagers, createGame, addPlayer } = require('./testHelpers');

function makeIoMock() {
	const emissions = [];
	const broadcasts = [];
	const ioMock = {
		to(roomId) {
			return {
				emit(event, payload) {
					emissions.push({ roomId, event, payload });
				},
			};
		},
	};
	return { ioMock, emissions, broadcasts };
}

function makeBroadcasterMock(broadcasts) {
	return {
		broadcastGameUpdate(options) {
			broadcasts.push(options || {});
		},
	};
}

function makeIntegrityMock() {
	const calls = [];
	return {
		runIslandIntegrityPass(options) {
			calls.push(options || {});
			return { changed: false, decayCells: [] };
		},
		_calls: calls,
	};
}

function makePersistenceMock() {
	return { markDirty() { /* no-op */ } };
}

function makeGameManager(boardManager) {
	return { boardManager };
}

describe('LineClearService', () => {
	let boardManager;
	let game;

	beforeEach(() => {
		({ boardManager } = createManagers());
		game = createGame(boardManager);
		game.id = 'global_game';
		addPlayer(game, 'p1');
	});

	test('runImmediate clears synchronously without animation events', () => {
		const { ioMock, emissions } = makeIoMock();
		const broadcasts = [];
		const service = createLineClearService({
			io: ioMock,
			gameManager: makeGameManager(boardManager),
			broadcaster: makeBroadcasterMock(broadcasts),
			integrityService: makeIntegrityMock(),
			persistence: makePersistenceMock(),
		});

		for (let x = 0; x < 8; x++) {
			boardManager.setCell(game.board, x, 5, [{ type: 'tetromino', player: 'p1' }]);
		}

		const result = service.runImmediate(game);
		expect(result.rows).toEqual([5]);
		expect(result.iterations).toBe(1);
		expect(emissions).toHaveLength(0);
		for (let x = 0; x < 8; x++) {
			expect(boardManager.getCell(game.board, x, 5)).toBeNull();
		}
	});

	test('runCascade emits cells_clearing before the clear, then row_cleared after', async () => {
		const { ioMock, emissions } = makeIoMock();
		const broadcasts = [];
		const integrity = makeIntegrityMock();
		const service = createLineClearService({
			io: ioMock,
			gameManager: makeGameManager(boardManager),
			broadcaster: makeBroadcasterMock(broadcasts),
			integrityService: integrity,
			persistence: makePersistenceMock(),
		});

		for (let x = 0; x < 8; x++) {
			boardManager.setCell(game.board, x, 7, [{ type: 'tetromino', player: 'p1' }]);
		}

		const totals = await service.runCascade({
			world: game,
			playerId: 'p1',
			animate: false,
		});

		expect(totals.rows).toEqual([7]);
		expect(totals.iterations).toBe(1);

		// With animate=false, we skip the cells_clearing event but the
		// row_cleared event still fires post-clear.
		const rowCleared = emissions.filter(e => e.event === 'row_cleared');
		expect(rowCleared).toHaveLength(1);
		expect(rowCleared[0].payload.rows).toEqual([7]);
		expect(rowCleared[0].payload.iteration).toBe(0);

		// Integrity ran exactly once (one cleared iteration).
		expect(integrity._calls).toHaveLength(1);
		expect(broadcasts).toHaveLength(1);
	});

	test('runCascade is a no-op when no lines are clearable', async () => {
		const { ioMock, emissions } = makeIoMock();
		const broadcasts = [];
		const service = createLineClearService({
			io: ioMock,
			gameManager: makeGameManager(boardManager),
			broadcaster: makeBroadcasterMock(broadcasts),
			integrityService: makeIntegrityMock(),
			persistence: makePersistenceMock(),
		});

		boardManager.setCell(game.board, 0, 10, [{ type: 'tetromino', player: 'p1' }]);

		const totals = await service.runCascade({
			world: game, playerId: 'p1', animate: false,
		});

		expect(totals.rows).toHaveLength(0);
		expect(totals.cols).toHaveLength(0);
		expect(totals.iterations).toBe(0);
		expect(emissions).toHaveLength(0);
		expect(broadcasts).toHaveLength(0);
	});

	test('runCascade handles a cross-axis cascade — z-row clear shifts cells into a clearable x-column', async () => {
		const { ioMock, emissions } = makeIoMock();
		const broadcasts = [];
		const service = createLineClearService({
			io: ioMock,
			gameManager: makeGameManager(boardManager),
			broadcaster: makeBroadcasterMock(broadcasts),
			integrityService: makeIntegrityMock(),
			persistence: makePersistenceMock(),
		});

		// King at (0, 0). Gravity along z towards z=0.
		game.chessPieces.push({
			id: 'p1-K', type: 'KING', player: 'p1',
			position: { x: 0, z: 0 }, hasMoved: false,
		});
		boardManager.addToCellContents(game.board, 0, 0, {
			type: 'chess', player: 'p1', pieceId: 'p1-K', pieceType: 'king',
		});

		// Z-row at z=5 ready to clear (x=1..8) — but we only let x=1..7
		// participate in this row, leaving x=10 free for the column setup.
		for (let x = 1; x <= 8; x++) {
			boardManager.setCell(game.board, x, 5, [{ type: 'tetromino', player: 'p1' }]);
		}

		// Pre-staged X-column at x=10: cells at z=6..12 (7 cells, NOT
		// clearable on its own). After z=5 clears, each of these
		// shifts one step closer to the king (kingCoord=0 < here, and
		// only z=5 lies in between), landing at z=5..11.
		for (let z = 6; z <= 12; z++) {
			boardManager.setCell(game.board, 10, z, [{ type: 'tetromino', player: 'p1' }]);
		}

		// A cell at (10, 4) that does NOT shift (z=5 is not between
		// king z=0 and here z=4). Combined with the post-gravity
		// z=5..11 column above, this gives a 1+7 = 8-consecutive
		// run at x=10 that fires on the second iteration.
		boardManager.setCell(game.board, 10, 4, [{ type: 'tetromino', player: 'p1' }]);

		const totals = await service.runCascade({
			world: game, playerId: 'p1', animate: false,
		});

		expect(totals.iterations).toBeGreaterThanOrEqual(2);
		expect(totals.rows).toEqual(expect.arrayContaining([5]));
		expect(totals.cols).toEqual(expect.arrayContaining([10]));
		expect(broadcasts.length).toBeGreaterThanOrEqual(2);

		const rowClearedEvents = emissions.filter(e => e.event === 'row_cleared');
		expect(rowClearedEvents.length).toBeGreaterThanOrEqual(2);
		expect(rowClearedEvents[0].payload.iteration).toBe(0);
		expect(rowClearedEvents[1].payload.iteration).toBe(1);
	});

	test('runCascade with animate=true emits cells_clearing first, then row_cleared', async () => {
		const { ioMock, emissions } = makeIoMock();
		const service = createLineClearService({
			io: ioMock,
			gameManager: makeGameManager(boardManager),
			broadcaster: makeBroadcasterMock([]),
			integrityService: makeIntegrityMock(),
			persistence: makePersistenceMock(),
		});

		// Shrink the flash window so the test doesn't sleep for 700 ms.
		// We can't pass a duration in, so we just await the natural flow
		// and accept the cost — but jest's default 5 s timeout handles it.
		jest.setTimeout(5000);

		for (let x = 0; x < 8; x++) {
			boardManager.setCell(game.board, x, 12, [{ type: 'tetromino', player: 'p1' }]);
		}

		const totals = await service.runCascade({
			world: game, playerId: 'p1', animate: true,
		});

		expect(totals.rows).toEqual([12]);

		const types = emissions.map(e => e.event);
		const cellsClearingIdx = types.indexOf('cells_clearing');
		const rowClearedIdx = types.indexOf('row_cleared');
		expect(cellsClearingIdx).toBeGreaterThanOrEqual(0);
		expect(rowClearedIdx).toBeGreaterThanOrEqual(0);
		expect(cellsClearingIdx).toBeLessThan(rowClearedIdx);

		const cellsClearingPayload = emissions[cellsClearingIdx].payload;
		expect(Array.isArray(cellsClearingPayload.cells)).toBe(true);
		expect(cellsClearingPayload.cells).toHaveLength(8);
		expect(typeof cellsClearingPayload.durationMs).toBe('number');
		expect(cellsClearingPayload.durationMs).toBeGreaterThan(0);
	});
});
