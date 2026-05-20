/**
 * Integration test for the activity-log integration of the integrity
 * service.
 *
 * The user reported a rook silently disappearing — most likely killed
 * by `integrity.repairChessPieceCellConsistency` when the supporting
 * cell was stripped. Previously that path only console-logged.
 *
 * This test sets up a world with a rook whose supporting cell has
 * vanished, runs the integrity pass, and asserts a `chess_piece_lost`
 * activity event was recorded with the correct reason.
 */

const World = require('../../server/world/World');
const { createIntegrityService } = require('../../server/world/integrity');

function buildActivityLogStub() {
	const events = [];
	return {
		_events: events,
		record: (type, payload) => events.push({ type, payload }),
		recordPieceLost: (payload) => events.push({ type: 'chess_piece_lost', payload }),
		recordPieceCaptured: (payload) => events.push({ type: 'chess_piece_captured', payload }),
		recordIslandDecayed: (payload) => events.push({ type: 'island_decayed', payload }),
		recordKingDetonation: (payload) => events.push({ type: 'king_detonation', payload }),
	};
}

function buildGameManagerStub() {
	return {
		islandManager: {
			checkForIslandsAfterRowClear() { /* no-op for this test */ },
			getDisconnectedIslandRiskReport() { return []; },
		},
		boardManager: {
			recalculateBoardBoundaries() { /* no-op */ },
		},
	};
}

function buildBroadcasterStub() {
	return {
		emitIslandDecayAnimation() { /* no-op */ },
		broadcastGameUpdate() { /* no-op */ },
		emitToPlayer() { /* no-op */ },
	};
}

function buildPersistenceStub() {
	return { markDirty() { /* no-op */ } };
}

describe('Integrity → activity log', () => {
	beforeEach(() => {
		World.resetWorld({ id: 'global_game' });
	});

	test('records chess_piece_lost when a rook has no supporting cell', () => {
		const world = World.getWorld();
		World.getOrCreatePlayer('p1');
		// Put a king so the player isn't orphaned (and so it isn't
		// auto-treated as an unknown-owner cleanup).
		world.chessPieces.push(
			{ id: 'p1-K', type: 'KING', player: 'p1', position: { x: 0, z: 0 } },
			{ id: 'p1-R', type: 'ROOK', player: 'p1', position: { x: 5, z: 5 } },
		);
		world.board.cells['0,0'] = [
			{ type: 'home', player: 'p1' },
			{ type: 'chess', player: 'p1', pieceId: 'p1-K', pieceType: 'king' },
		];
		// The rook's supporting cell intentionally does not exist —
		// the user's reported "vanished rook" scenario.

		const activityLog = buildActivityLogStub();
		const service = createIntegrityService({
			gameManager: buildGameManagerStub(),
			broadcaster: buildBroadcasterStub(),
			persistence: buildPersistenceStub(),
			activityLog,
		});

		const result = service.runIslandIntegrityPass({ emitAnimation: false });

		expect(result.changed).toBe(true);
		expect(world.chessPieces.find(p => p.id === 'p1-R')).toBeUndefined();

		const lostEvents = activityLog._events.filter(e => e.type === 'chess_piece_lost');
		expect(lostEvents).toHaveLength(1);
		expect(lostEvents[0].payload).toMatchObject({
			playerId: 'p1',
			pieceType: 'rook',
			pieceId: 'p1-R',
			x: 5,
			z: 5,
			reason: 'no_supporting_cell',
		});
	});

	test('records chess_piece_lost when a piece has an invalid position', () => {
		const world = World.getWorld();
		World.getOrCreatePlayer('p1');
		world.chessPieces.push(
			{ id: 'p1-K', type: 'KING', player: 'p1', position: { x: 0, z: 0 } },
			{ id: 'p1-B', type: 'BISHOP', player: 'p1', position: null },
		);
		world.board.cells['0,0'] = [
			{ type: 'home', player: 'p1' },
			{ type: 'chess', player: 'p1', pieceId: 'p1-K', pieceType: 'king' },
		];

		const activityLog = buildActivityLogStub();
		const service = createIntegrityService({
			gameManager: buildGameManagerStub(),
			broadcaster: buildBroadcasterStub(),
			persistence: buildPersistenceStub(),
			activityLog,
		});

		service.runIslandIntegrityPass({ emitAnimation: false });

		const lostEvents = activityLog._events.filter(e => e.type === 'chess_piece_lost');
		expect(lostEvents).toHaveLength(1);
		expect(lostEvents[0].payload.reason).toBe('invalid_position');
		expect(lostEvents[0].payload.pieceType).toBe('bishop');
	});

	test('records chess_piece_lost when the owner has been removed from world.players', () => {
		const world = World.getWorld();
		World.getOrCreatePlayer('alive');
		world.chessPieces.push(
			{ id: 'alive-K', type: 'KING', player: 'alive', position: { x: 0, z: 0 } },
			{ id: 'ghost-R', type: 'ROOK', player: 'ghost', position: { x: 5, z: 5 } },
		);
		world.board.cells['0,0'] = [
			{ type: 'home', player: 'alive' },
			{ type: 'chess', player: 'alive', pieceId: 'alive-K', pieceType: 'king' },
		];
		world.board.cells['5,5'] = [
			{ type: 'tetromino', player: 'ghost' },
			{ type: 'chess', player: 'ghost', pieceId: 'ghost-R', pieceType: 'rook' },
		];

		const activityLog = buildActivityLogStub();
		const service = createIntegrityService({
			gameManager: buildGameManagerStub(),
			broadcaster: buildBroadcasterStub(),
			persistence: buildPersistenceStub(),
			activityLog,
		});

		service.runIslandIntegrityPass({ emitAnimation: false });

		const lostEvents = activityLog._events.filter(e => e.type === 'chess_piece_lost');
		expect(lostEvents.length).toBeGreaterThanOrEqual(1);
		expect(lostEvents.some(e => e.payload.reason === 'owner_gone')).toBe(true);
	});
});
