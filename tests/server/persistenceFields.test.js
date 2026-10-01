/**
 * Player fields that must survive a save/restore. Losing them used to
 * delete every stowed kingdom on restart, refill every king's lives and
 * reset the idle / elimination clocks.
 */

const World = require('../../server/world/World');
const { buildSnapshot } = require('../../server/persistence');

describe('persistence keeps per-player state', () => {
	test('stowed kingdom, king lives, clocks and pause allowance round-trip', () => {
		World.resetWorld();
		const p = World.upsertPlayer('alice', { name: 'Alice' });
		Object.assign(p, {
			stowedKingdom: { stowedAt: 123, cells: [{ x: 1, z: 2 }], pieces: [{ type: 'KING' }] },
			dormantSince: 123,
			kingLives: 1,
			joinedAt: 100,
			lastDisconnectAt: 200,
			eliminatedAt: 300,
			paused: true,
			pauseState: { active: true, pausedAt: 999, usesRemaining: 1, totalPausedMs: 5000 },
		});

		const snapshot = JSON.parse(JSON.stringify(buildSnapshot()));
		World.resetWorld();
		World.restoreWorldFromSnapshot(snapshot.world);
		const back = World.getPlayer('alice');

		expect(back.stowedKingdom).toEqual({ stowedAt: 123, cells: [{ x: 1, z: 2 }], pieces: [{ type: 'KING' }] });
		expect(back.dormantSince).toBe(123);
		expect(back.kingLives).toBe(1);
		expect(back.joinedAt).toBe(100);
		expect(back.lastDisconnectAt).toBe(200);
		expect(back.eliminatedAt).toBe(300);
		// Allowance kept, but an active pause ends with the restart (its
		// auto-resume timer is gone).
		expect(back.pauseState).toMatchObject({ active: false, usesRemaining: 1, totalPausedMs: 5000 });
		expect(back.paused).toBeFalsy();
	});

	test('a player who never lost a life keeps the default', () => {
		World.resetWorld();
		World.upsertPlayer('bob', { name: 'Bob' });
		const snapshot = JSON.parse(JSON.stringify(buildSnapshot()));
		expect('kingLives' in snapshot.world.players.bob).toBe(false);
	});
});
