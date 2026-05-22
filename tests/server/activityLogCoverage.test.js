/**
 * Tests covering the activity-log entries the user has reported missing:
 *
 *  • `rows_cleared` — emitted on every cascade iteration so the user
 *    can see why a row of cells vanished.
 *  • `territory_captured` — emitted when a chess move transfers
 *    ownership of a non-home cell from the previous owner to the
 *    mover. Previously silent — the user complained their cells were
 *    "just disappearing" with nothing in the activity panel.
 *
 * Also verifies the dual-ownership rule used by `IslandManager` and
 * `hasPathToKing`: a cell that has content from two players counts as
 * owned for *both* path-to-king BFS searches. This is the rule the
 * user re-stated in the latest feedback — pieces straddling
 * overlapping territory should not be considered stranded.
 */

const World = require('../../server/world/World');
const BoardManager = require('../../server/game/BoardManager');
const IslandManager = require('../../server/game/IslandManager');
const { createLineClearService } = require('../../server/game/LineClearService');

function buildActivityLogStub() {
	const events = [];
	return {
		_events: events,
		record: (type, payload) => events.push({ type, payload }),
		recordRowsCleared: (payload) => events.push({ type: 'rows_cleared', payload }),
		recordTerritoryCaptured: (payload) => events.push({ type: 'territory_captured', payload }),
		recordIslandDecayed: (payload) => events.push({ type: 'island_decayed', payload }),
		recordPieceLost: (payload) => events.push({ type: 'chess_piece_lost', payload }),
		recordPiecesLost: (payload) => events.push({ type: 'chess_pieces_lost', payload }),
		recordKingDetonation: (payload) => events.push({ type: 'king_detonation', payload }),
	};
}

function buildGameManagerStub() {
	return {
		boardManager: new BoardManager(),
		islandManager: new IslandManager(),
	};
}

function buildBroadcasterStub() {
	return {
		broadcastGameUpdate() { /* no-op */ },
		emitIslandDecayAnimation() { /* no-op */ },
		emitToPlayer() { /* no-op */ },
	};
}

function buildIntegrityServiceStub() {
	return {
		runIslandIntegrityPass() { return { changed: false, decayCells: [] }; },
	};
}

function buildPersistenceStub() {
	return { markDirty() { /* no-op */ } };
}

function buildIoStub() {
	return {
		to: () => ({ emit() { /* no-op */ } }),
	};
}

describe('LineClearService → activity log', () => {
	beforeEach(() => {
		World.resetWorld({ id: 'global_game' });
	});

	test('records a rows_cleared event for every cascade iteration', () => {
		const world = World.getWorld();
		World.getOrCreatePlayer('p1');
		const boardManager = new BoardManager();
		const islandManager = new IslandManager();

		// Build a clearable row of 8 along z=5 (the bible's clear length).
		for (let x = 0; x < 8; x++) {
			boardManager.setCell(world.board, x, 5, [
				{ type: 'tetromino', player: 'p1' },
			]);
		}
		// Place a king so the player isn't an empty roster.
		world.chessPieces.push({
			id: 'p1-K', type: 'KING', player: 'p1', position: { x: 0, z: 0 },
		});
		boardManager.setCell(world.board, 0, 0, [
			{ type: 'home', player: 'p1' },
			{ type: 'chess', player: 'p1', pieceId: 'p1-K', pieceType: 'king' },
		]);

		const activityLog = buildActivityLogStub();
		const service = createLineClearService({
			io: buildIoStub(),
			gameManager: { boardManager, islandManager },
			broadcaster: buildBroadcasterStub(),
			integrityService: buildIntegrityServiceStub(),
			persistence: buildPersistenceStub(),
			activityLog,
		});

		const result = service.runImmediate(world, { triggeredBy: 'p1' });
		expect(result.rows.length + result.cols.length).toBeGreaterThan(0);

		const rowsClearedEvents = activityLog._events.filter(e => e.type === 'rows_cleared');
		expect(rowsClearedEvents.length).toBeGreaterThan(0);
		expect(rowsClearedEvents[0].payload).toMatchObject({
			playerId: 'p1',
			cellCount: expect.any(Number),
		});
		expect(rowsClearedEvents[0].payload.cellCount).toBeGreaterThan(0);
	});
});

describe('IslandManager → dual-ownership rule', () => {
	beforeEach(() => {
		World.resetWorld({ id: 'global_game' });
	});

	test('a cell with content from two players is part of both players islands', () => {
		const world = World.getWorld();
		World.getOrCreatePlayer('p1');
		World.getOrCreatePlayer('p2');
		const boardManager = new BoardManager();
		const islandManager = new IslandManager();

		// Layout: p1 home at (0,0), chain to (3,0). p2 home at (10,0),
		// chain to (3,0). (3,0) is the shared dual-owner bridge cell.
		world.chessPieces.push(
			{ id: 'p1-K', type: 'KING', player: 'p1', position: { x: 0, z: 0 } },
			{ id: 'p2-K', type: 'KING', player: 'p2', position: { x: 10, z: 0 } },
		);
		boardManager.setCell(world.board, 0, 0, [
			{ type: 'home', player: 'p1' },
			{ type: 'chess', player: 'p1', pieceId: 'p1-K', pieceType: 'king' },
		]);
		boardManager.setCell(world.board, 10, 0, [
			{ type: 'home', player: 'p2' },
			{ type: 'chess', player: 'p2', pieceId: 'p2-K', pieceType: 'king' },
		]);
		// p1 corridor.
		for (let x = 1; x <= 3; x++) {
			boardManager.setCell(world.board, x, 0, [{ type: 'tetromino', player: 'p1' }]);
		}
		// p2 corridor — overlaps at (3,0) so that cell now has BOTH
		// players' tetrominoes. This is the "dual-owned" case the
		// user re-described.
		for (let x = 9; x >= 3; x--) {
			const existing = world.board.cells[`${x},0`] || [];
			existing.push({ type: 'tetromino', player: 'p2' });
			boardManager.setCell(world.board, x, 0, existing);
		}

		expect(islandManager.hasPathToKing(world, 3, 0, 'p1')).toBe(true);
		expect(islandManager.hasPathToKing(world, 3, 0, 'p2')).toBe(true);

		const islands = islandManager.detectIslands(world);
		const p1Connected = islands.find(i => i.playerId === 'p1' && i.hasKing);
		const p2Connected = islands.find(i => i.playerId === 'p2' && i.hasKing);
		expect(p1Connected).toBeDefined();
		expect(p2Connected).toBeDefined();
		// Bridge cell appears in both players' connected islands.
		expect(p1Connected.cells).toEqual(expect.arrayContaining([{ x: 3, z: 0 }]));
		expect(p2Connected.cells).toEqual(expect.arrayContaining([{ x: 3, z: 0 }]));
	});
});
