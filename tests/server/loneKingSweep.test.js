/**
 * Tests for the lone-king auto-detonation sweep — bible §10 catches AI
 * via the AI tick, this sweep catches everyone else.
 */

const World = require('../../server/world/World');
const { createLoneKingSweepService, LONE_KING_GRACE_MS } = require('../../server/king/loneKingSweep');

function buildKingDetonationStub() {
	const calls = [];
	return {
		_calls: calls,
		detonateKing: (opts) => {
			calls.push(opts);
			if (typeof opts.onComplete === 'function') opts.onComplete({ playerId: opts.playerId });
			return { success: true };
		},
	};
}

function buildBroadcasterStub() {
	const broadcasts = [];
	return {
		_broadcasts: broadcasts,
		broadcastGameUpdate: (opts) => broadcasts.push(opts || {}),
	};
}

function buildPersistenceStub() {
	const dirty = { count: 0 };
	return {
		_dirty: dirty,
		markDirty: () => { dirty.count += 1; },
	};
}

describe('LoneKingSweep', () => {
	beforeEach(() => {
		World.resetWorld({ id: 'global_game' });
	});

	test('does nothing when the player still has more than just a king', () => {
		World.getOrCreatePlayer('p1');
		World.getWorld().chessPieces.push(
			{ id: 'p1-K', type: 'KING', player: 'p1', position: { x: 0, z: 0 } },
			{ id: 'p1-R', type: 'ROOK', player: 'p1', position: { x: 1, z: 0 } },
		);

		const detonation = buildKingDetonationStub();
		const sweep = createLoneKingSweepService({
			kingDetonationService: detonation,
			broadcaster: buildBroadcasterStub(),
			persistence: buildPersistenceStub(),
		});

		sweep.tick();
		expect(detonation._calls).toHaveLength(0);
	});

	test('stamps the timestamp on first sight, does NOT detonate on the same tick', () => {
		World.getOrCreatePlayer('p1');
		World.getWorld().chessPieces.push(
			{ id: 'p1-K', type: 'KING', player: 'p1', position: { x: 0, z: 0 } },
		);

		const detonation = buildKingDetonationStub();
		const sweep = createLoneKingSweepService({
			kingDetonationService: detonation,
			broadcaster: buildBroadcasterStub(),
			persistence: buildPersistenceStub(),
		});

		sweep.tick();
		expect(detonation._calls).toHaveLength(0);
	});

	test('detonates after LONE_KING_GRACE_MS has elapsed without action', () => {
		const player = World.getOrCreatePlayer('p1');
		player.lastActiveAt = 0;
		player.lastTetrominoPlacementAt = 0;
		player.lastChessMoveAt = 0;
		World.getWorld().chessPieces.push(
			{ id: 'p1-K', type: 'KING', player: 'p1', position: { x: 0, z: 0 } },
		);

		const detonation = buildKingDetonationStub();
		const sweep = createLoneKingSweepService({
			kingDetonationService: detonation,
			broadcaster: buildBroadcasterStub(),
			persistence: buildPersistenceStub(),
		});

		const dateSpy = jest.spyOn(Date, 'now');
		const t0 = 1_000_000_000;
		dateSpy.mockReturnValue(t0);
		sweep.tick();
		expect(detonation._calls).toHaveLength(0);

		dateSpy.mockReturnValue(t0 + LONE_KING_GRACE_MS + 100);
		sweep.tick();
		expect(detonation._calls).toHaveLength(1);
		expect(detonation._calls[0]).toMatchObject({
			playerId: 'p1',
			kingPieceId: 'p1-K',
			reason: 'lone_king_sweep',
		});
		expect(player.pendingRespawn).toBe(true);
		expect(player.eliminated).toBe(true);

		dateSpy.mockRestore();
	});

	test('resets the grace window if the player takes an action while we were watching', () => {
		const player = World.getOrCreatePlayer('p1');
		// Zero out the auto-stamped `lastActiveAt` from registration so
		// the sweep doesn't think the player is still active.
		player.lastActiveAt = 0;
		player.lastTetrominoPlacementAt = 0;
		player.lastChessMoveAt = 0;
		World.getWorld().chessPieces.push(
			{ id: 'p1-K', type: 'KING', player: 'p1', position: { x: 0, z: 0 } },
		);

		const detonation = buildKingDetonationStub();
		const sweep = createLoneKingSweepService({
			kingDetonationService: detonation,
			broadcaster: buildBroadcasterStub(),
			persistence: buildPersistenceStub(),
		});

		const dateSpy = jest.spyOn(Date, 'now');
		dateSpy.mockReturnValue(1_000);
		sweep.tick();

		// Player wiggles their king — bumps `lastChessMoveAt`.
		player.lastChessMoveAt = 5_000;

		dateSpy.mockReturnValue(LONE_KING_GRACE_MS + 5_000);
		sweep.tick();
		// The action bumped `lastChessMoveAt`, so the sweep resets the
		// timer and doesn't detonate this tick.
		expect(detonation._calls).toHaveLength(0);

		dateSpy.mockRestore();
	});

	test('uses ai_lone_king reason for AI players (allows runner cleanup distinction)', () => {
		const player = World.getOrCreatePlayer('ai-1');
		player.isComputer = true;
		player.lastActiveAt = 0;
		player.lastTetrominoPlacementAt = 0;
		player.lastChessMoveAt = 0;
		player.lastMoveTime = 0;
		World.getWorld().chessPieces.push(
			{ id: 'ai-1-K', type: 'KING', player: 'ai-1', position: { x: 0, z: 0 } },
		);

		const detonation = buildKingDetonationStub();
		const sweep = createLoneKingSweepService({
			kingDetonationService: detonation,
			broadcaster: buildBroadcasterStub(),
			persistence: buildPersistenceStub(),
		});

		const dateSpy = jest.spyOn(Date, 'now');
		dateSpy.mockReturnValue(0);
		sweep.tick();
		dateSpy.mockReturnValue(LONE_KING_GRACE_MS + 1);
		sweep.tick();

		expect(detonation._calls).toHaveLength(1);
		expect(detonation._calls[0].reason).toBe('ai_lone_king');

		dateSpy.mockRestore();
	});
});
