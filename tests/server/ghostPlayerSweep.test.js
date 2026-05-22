/**
 * Tests for the GhostPlayerSweep (server/world/ghostPlayerSweep.js).
 *
 * Covers the user's "There are still LOADS of empty players that need
 * to be cleared" bug — verifies that players with 0 chess pieces get
 * flagged as eliminated and that offline eliminated records get fully
 * reaped after the removal grace window.
 */

const path = require('path');

const World = require(path.join('..', '..', 'server', 'world', 'World'));
const Sessions = require(path.join('..', '..', 'server', 'world', 'Sessions'));
const {
	createGhostPlayerSweepService,
	NO_PIECES_GRACE_MS,
	REMOVAL_GRACE_MS,
} = require(path.join('..', '..', 'server', 'world', 'ghostPlayerSweep'));

function makeBroadcaster() {
	let calls = 0;
	return {
		broadcastGameUpdate() { calls++; },
		get callCount() { return calls; },
	};
}

function makePersistence() {
	return { markDirty() { this.calls = (this.calls || 0) + 1; }, calls: 0 };
}

function makeLifecycle() {
	const removed = [];
	return {
		removed,
		removePlayerCompletely(playerId) {
			removed.push(playerId);
			const world = World.getWorld();
			delete world.players[playerId];
		},
	};
}

function makeAiRunner() {
	const stopped = [];
	return {
		stopped,
		stopAiPlayer(id) { stopped.push(id); },
	};
}

function seed({ playerCount = 2 } = {}) {
	World.resetWorld();
	for (let i = 0; i < playerCount; i++) {
		World.upsertPlayer(`p${i + 1}`, {
			name: `P${i + 1}`,
			isComputer: i === 0,
		});
	}
	return World.getWorld();
}

describe('GhostPlayerSweep', () => {
	afterEach(() => {
		Sessions.clearAll();
	});

	test('player with 0 pieces gets flagged as eliminated after the grace window', () => {
		const world = seed();
		world.chessPieces.push({
			id: 'piece-1',
			type: 'PAWN',
			player: 'p2',
			position: { x: 0, z: 0 },
		});

		const sweep = createGhostPlayerSweepService({
			broadcaster: makeBroadcaster(),
			persistence: makePersistence(),
			lifecycleService: makeLifecycle(),
			aiRunner: makeAiRunner(),
		});

		const t0 = 1_000_000;
		let { flagged } = sweep.tick({ now: t0 });
		expect(flagged).toEqual([]);
		expect(world.players.p1.eliminated).toBe(false);

		({ flagged } = sweep.tick({ now: t0 + NO_PIECES_GRACE_MS / 2 }));
		expect(flagged).toEqual([]);

		({ flagged } = sweep.tick({ now: t0 + NO_PIECES_GRACE_MS + 1 }));
		expect(flagged).toEqual(['p1']);
		expect(world.players.p1.eliminated).toBe(true);
	});

	test('eliminated AI with 0 pieces gets fully removed after REMOVAL_GRACE_MS', () => {
		const world = seed();
		world.players.p1.eliminated = true;
		world.players.p1.eliminatedAt = 100;

		const lifecycle = makeLifecycle();
		const aiRunner = makeAiRunner();
		const sweep = createGhostPlayerSweepService({
			broadcaster: makeBroadcaster(),
			persistence: makePersistence(),
			lifecycleService: lifecycle,
			aiRunner,
		});

		const removalAfter = 100 + REMOVAL_GRACE_MS + 1;
		const result = sweep.tick({ now: removalAfter });
		expect(result.removed).toEqual(['p1']);
		expect(world.players.p1).toBeUndefined();
		expect(aiRunner.stopped).toEqual(['p1']);
		expect(lifecycle.removed).toEqual(['p1']);
	});

	test('reapImmediately purges any persisted zero-piece player on boot', () => {
		const world = seed({ playerCount: 3 });
		world.chessPieces.push({
			id: 'piece',
			type: 'PAWN',
			player: 'p3',
			position: { x: 0, z: 0 },
		});

		const lifecycle = makeLifecycle();
		const sweep = createGhostPlayerSweepService({
			broadcaster: makeBroadcaster(),
			persistence: makePersistence(),
			lifecycleService: lifecycle,
			aiRunner: makeAiRunner(),
		});

		const result = sweep.reapImmediately();
		expect(result.removed).toHaveLength(2);
		expect(result.removed).toContain('p1');
		expect(result.removed).toContain('p2');
		expect(world.players.p3).toBeDefined();
	});

	test('does not reap a player who later recovers (basket-fed pawn promotion)', () => {
		const world = seed();
		world.chessPieces.push({
			id: 'p2-pawn',
			type: 'PAWN',
			player: 'p2',
			position: { x: 10, z: 0 },
		});

		const sweep = createGhostPlayerSweepService({
			broadcaster: makeBroadcaster(),
			persistence: makePersistence(),
			lifecycleService: makeLifecycle(),
		});

		const t0 = 5_000_000;
		sweep.tick({ now: t0 });
		world.chessPieces.push({
			id: 'p1-pawn',
			type: 'PAWN',
			player: 'p1',
			position: { x: 0, z: 0 },
		});

		const { flagged } = sweep.tick({ now: t0 + NO_PIECES_GRACE_MS + 1 });
		expect(flagged).toEqual([]);
		expect(world.players.p1.eliminated).toBe(false);
	});

	test('player records with online sockets are NOT removed even when eliminated', () => {
		const world = seed();
		world.players.p1.eliminated = true;
		world.players.p1.eliminatedAt = 100;
		world.players.p1.isComputer = false;

		const fakeSocket = { id: 'sock-1', emit() {} };
		Sessions.bind(fakeSocket, 'p1');

		const lifecycle = makeLifecycle();
		const sweep = createGhostPlayerSweepService({
			broadcaster: makeBroadcaster(),
			persistence: makePersistence(),
			lifecycleService: lifecycle,
		});

		const result = sweep.tick({ now: 100 + REMOVAL_GRACE_MS + 1 });
		expect(result.removed).toEqual([]);
		expect(world.players.p1).toBeDefined();
	});
});
