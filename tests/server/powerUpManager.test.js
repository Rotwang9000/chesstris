/**
 * Tests for the PowerUpManager (server/game/PowerUpManager.js).
 *
 * Covers the user's "Cells that appear randomly which have an orb above
 * them" feature: spawning, claiming, expiry, and the struggling-player
 * weight bias.
 */

const path = require('path');

const World = require(path.join('..', '..', 'server', 'world', 'World'));
const { createPowerUpManager } = require(path.join('..', '..', 'server', 'game', 'PowerUpManager'));

function makeIo() {
	const events = [];
	const room = {
		emit(eventName, payload) {
			events.push({ eventName, payload });
		},
	};
	return {
		_events: events,
		to() { return room; },
	};
}

function makeBroadcaster() {
	return {
		broadcastGameUpdate() {},
	};
}

function makePersistence() {
	return {
		markDirty() { this.dirtyCount = (this.dirtyCount || 0) + 1; },
		dirtyCount: 0,
	};
}

function makeActivityLog() {
	const records = [];
	return {
		records,
		recordPowerupSpawned(payload) { records.push({ type: 'spawned', payload }); },
		recordPowerupClaimed(payload) { records.push({ type: 'claimed', payload }); },
		recordPowerupExpired(payload) { records.push({ type: 'expired', payload }); },
	};
}

function seedWorld({ playerCount = 2, piecesPerPlayer = 4 } = {}) {
	World.resetWorld();
	const world = World.getWorld();
	for (let i = 0; i < playerCount; i++) {
		const id = `p${i + 1}`;
		World.upsertPlayer(id, {
			name: `Player ${i + 1}`,
			isComputer: i === 0,
			color: 0xAA0000,
		});
		world.homeZones[id] = {
			x: i * 40, z: 0, width: 8, height: 2, orientation: 0,
		};
		for (let p = 0; p < piecesPerPlayer; p++) {
			world.chessPieces.push({
				id: `${id}-piece-${p}`,
				type: 'PAWN',
				player: id,
				position: { x: i * 40 + p, z: 1 },
				orientation: 0,
			});
		}
	}
	return world;
}

describe('PowerUpManager', () => {
	test('spawns an orb at a random tick when below the cap', () => {
		seedWorld();
		const io = makeIo();
		const broadcaster = makeBroadcaster();
		const persistence = makePersistence();
		const activityLog = makeActivityLog();

		const manager = createPowerUpManager({ io, broadcaster, persistence, activityLog });
		const world = World.getWorld();
		// Give each home zone a board foothold so spawn locations are reachable.
		world.board.cells['4,1'] = [{ type: 'tetromino', player: 'p1', placedAt: Date.now() }];
		world.board.cells['44,1'] = [{ type: 'tetromino', player: 'p2', placedAt: Date.now() }];

		const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.1);
		const spawned = manager._internals.trySpawnOne(world);
		randomSpy.mockRestore();

		expect(spawned).not.toBeNull();
		expect(spawned.id.startsWith('orb-')).toBe(true);
		expect(Number.isFinite(spawned.x)).toBe(true);
		expect(Number.isFinite(spawned.z)).toBe(true);
		expect(['PAWN', 'KNIGHT', 'BISHOP', 'ROOK', 'QUEEN']).toContain(spawned.pieceType);
		expect(world.powerUps.length).toBe(1);
		expect(activityLog.records.some(r => r.type === 'spawned')).toBe(true);
	});

	test('claimAcrossPlacement claims an orb when placement is orthogonally adjacent', () => {
		seedWorld();
		const io = makeIo();
		const manager = createPowerUpManager({
			io, broadcaster: makeBroadcaster(), persistence: makePersistence(),
		});
		const world = World.getWorld();
		world.board.cells['5,5'] = [{ type: 'tetromino', player: 'p2', placedAt: Date.now() }];
		world.powerUps.push({
			id: 'orb-adjacent',
			x: 6,
			z: 5,
			pieceType: 'KNIGHT',
			spawnedAt: Date.now(),
		});

		const claims = manager.claimAcrossPlacement(world, 'p2', [
			{ x: 4, z: 5 },
			{ x: 5, z: 5 },
		]);

		expect(claims).toHaveLength(1);
		expect(claims[0].orb.id).toBe('orb-adjacent');
		expect(claims[0].piece.type).toBe('KNIGHT');
		expect(world.powerUps).toHaveLength(0);
	});

	test('claimAcrossPlacement converts an orb under a tetromino cell into a chess piece', () => {
		seedWorld();
		const io = makeIo();
		const broadcaster = makeBroadcaster();
		const persistence = makePersistence();
		const activityLog = makeActivityLog();

		const manager = createPowerUpManager({ io, broadcaster, persistence, activityLog });
		const world = World.getWorld();

		world.powerUps.push({
			id: 'orb-test',
			x: 5,
			z: 5,
			pieceType: 'ROOK',
			spawnedAt: Date.now(),
		});

		const initialPieceCount = world.chessPieces.length;

		const claims = manager.claimAcrossPlacement(world, 'p2', [
			{ x: 4, z: 5 },
			{ x: 5, z: 5 },
			{ x: 6, z: 5 },
		]);

		expect(claims).toHaveLength(1);
		expect(claims[0].orb.id).toBe('orb-test');
		expect(claims[0].piece.type).toBe('ROOK');
		expect(claims[0].piece.player).toBe('p2');
		expect(world.powerUps).toHaveLength(0);
		expect(world.chessPieces.length).toBe(initialPieceCount + 1);
		expect(activityLog.records.some(r => r.type === 'claimed')).toBe(true);
	});

	test('orbs that pass their expiry are pruned and trigger a powerup_expired event', () => {
		seedWorld();
		const io = makeIo();
		const broadcaster = makeBroadcaster();
		const persistence = makePersistence();
		const activityLog = makeActivityLog();

		const manager = createPowerUpManager({ io, broadcaster, persistence, activityLog });
		const world = World.getWorld();
		const expiringSpawnedAt = Date.now() - manager.ORB_LIFETIME_MS - 1000;
		world.powerUps.push({
			id: 'orb-expiring',
			x: 9,
			z: 9,
			pieceType: 'PAWN',
			spawnedAt: expiringSpawnedAt,
		});

		manager._internals.pruneExpired(world);

		expect(world.powerUps).toHaveLength(0);
		expect(io._events.some(e => e.eventName === 'powerup_expired')).toBe(true);
		expect(activityLog.records.some(r => r.type === 'expired')).toBe(true);
	});

	test('targeting prefers the player with the fewest pieces (weighting bias)', () => {
		const world = seedWorld({ playerCount: 2, piecesPerPlayer: 0 });
		// Player 1 — well-stocked.
		for (let i = 0; i < 12; i++) {
			world.chessPieces.push({
				id: `p1-extra-${i}`,
				type: 'PAWN',
				player: 'p1',
				position: { x: i, z: 1 },
				orientation: 0,
			});
		}
		// Player 2 — only a king left, should get the lion's share of orbs.
		world.chessPieces.push({
			id: 'p2-king',
			type: 'KING',
			player: 'p2',
			position: { x: 40, z: 1 },
			orientation: 0,
		});

		const io = makeIo();
		const broadcaster = makeBroadcaster();
		const persistence = makePersistence();
		const manager = createPowerUpManager({ io, broadcaster, persistence });

		let p2Wins = 0;
		const samples = 200;
		for (let i = 0; i < samples; i++) {
			const target = manager._internals.pickTargetPlayer(world);
			expect(target).not.toBeNull();
			if (target.id === 'p2') p2Wins++;
		}
		// With weights 1/(1+12) vs 1/(1+1) — p2 should win ~87% of the
		// time. Use a generous threshold so we don't flake.
		expect(p2Wins).toBeGreaterThan(samples * 0.6);
	});

	test('orbs do not spawn in empty void — must neighbour existing board cells', () => {
		const world = seedWorld();
		const io = makeIo();
		const manager = createPowerUpManager({
			io, broadcaster: makeBroadcaster(), persistence: makePersistence(),
		});

		expect(manager._internals.isCellAvailableForOrb(world, 99, 99)).toBe(false);
		world.board.cells['10,10'] = [{ type: 'tetromino', player: 'p1', placedAt: Date.now() }];
		expect(manager._internals.isCellAvailableForOrb(world, 10, 10)).toBe(false);
		expect(manager._internals.isCellAvailableForOrb(world, 11, 10)).toBe(true);
	});

	test('orbs do not spawn on top of existing occupied cells', () => {
		const world = seedWorld();
		world.board.cells['10,10'] = [
			{ type: 'tetromino', player: 'p1', placedAt: Date.now() },
		];

		const io = makeIo();
		const manager = createPowerUpManager({
			io, broadcaster: makeBroadcaster(), persistence: makePersistence(),
		});

		expect(manager._internals.isCellAvailableForOrb(world, 10, 10)).toBe(false);
		expect(manager._internals.isCellAvailableForOrb(world, 11, 10)).toBe(true);
	});

	test('claim is a no-op when no orb sits on the placed cell', () => {
		seedWorld();
		const io = makeIo();
		const manager = createPowerUpManager({
			io, broadcaster: makeBroadcaster(), persistence: makePersistence(),
		});
		const world = World.getWorld();
		const initialPieces = world.chessPieces.length;

		const claims = manager.claimAcrossPlacement(world, 'p2', [
			{ x: 100, z: 100 },
			{ x: 101, z: 100 },
		]);

		expect(claims).toEqual([]);
		expect(world.chessPieces.length).toBe(initialPieces);
	});

	test('eligible-player list excludes eliminated players', () => {
		const world = seedWorld();
		world.players.p1.eliminated = true;

		const io = makeIo();
		const manager = createPowerUpManager({
			io, broadcaster: makeBroadcaster(), persistence: makePersistence(),
		});
		const target = manager._internals.pickTargetPlayer(world);
		expect(target).not.toBeNull();
		expect(target.id).toBe('p2');
	});
});
