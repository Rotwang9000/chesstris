'use strict';

const { createBoatManager, BOAT_COUNT, BOAT_LOOP_RADIUS } = require('../../server/world/boats');

describe('BoatManager (server/world/boats)', () => {
	let manager;
	let pickedAds;
	let nextAdIndex;

	beforeEach(() => {
		pickedAds = [
			{ id: 'adv-1', name: 'Mead Hall', adImage: '/uploads/1.png', adLink: null, adText: null },
			{ id: 'adv-2', name: 'Skald Inc.', adImage: '/uploads/2.png', adLink: null, adText: null },
		];
		nextAdIndex = 0;
		manager = createBoatManager({
			io: null,
			pickAdvertiser: () => {
				const ad = pickedAds[nextAdIndex % pickedAds.length];
				nextAdIndex++;
				return ad;
			},
		});
		manager.start();
	});

	afterEach(() => {
		manager.stop();
	});

	test('spawns BOAT_COUNT boats with sail adverts assigned', () => {
		const snap = manager.getSnapshot();
		expect(snap).toHaveLength(BOAT_COUNT);
		for (const boat of snap) {
			expect(boat.id).toMatch(/^boat-/);
			expect(boat.kind).toBe('longship');
			expect(Number.isFinite(boat.heading)).toBe(true);
			expect(boat.advertiser).not.toBeNull();
		}
	});

	test('boats sit roughly on the configured loop radius (with jitter)', () => {
		manager.tick();
		const snap = manager.getSnapshot();
		for (const boat of snap) {
			const r = Math.hypot(boat.position.x, boat.position.z);
			// Allow generous slack for the per-boat jitter — we only
			// care that no boat is parked on top of the play area.
			expect(r).toBeGreaterThan(BOAT_LOOP_RADIUS - 12);
			expect(r).toBeLessThan(BOAT_LOOP_RADIUS + 12);
		}
	});

	test('boats move between ticks', () => {
		const first = manager.getSnapshot().map(b => ({ id: b.id, x: b.position.x, z: b.position.z }));
		// Simulate ~2 seconds of elapsed time by advancing the
		// internal start timestamp backwards.
		const guts = manager.boats;
		for (const b of guts) {
			b.theta0 -= b.direction * 0.5; // shove the phase forward
		}
		manager.tick();
		const second = manager.getSnapshot();
		let moved = 0;
		for (const after of second) {
			const before = first.find(f => f.id === after.id);
			if (!before) continue;
			if (Math.abs(before.x - after.position.x) + Math.abs(before.z - after.position.z) > 0.01) {
				moved++;
			}
		}
		expect(moved).toBeGreaterThan(0);
	});

	test('addPassenger / removePassenger round-trip', () => {
		const [first] = manager.getSnapshot();
		const passenger = { pieceId: 'p1-KNIGHT', type: 'KNIGHT', player: 'p1' };
		expect(manager.addPassenger(first.id, passenger)).toBe(true);
		const after = manager.getSnapshot().find(b => b.id === first.id);
		expect(after.passengers).toHaveLength(1);
		expect(after.passengers[0]).toMatchObject({ pieceId: 'p1-KNIGHT' });

		const removed = manager.removePassenger(first.id, p => p.pieceId === 'p1-KNIGHT');
		expect(removed).toBe(true);
		const cleared = manager.getSnapshot().find(b => b.id === first.id);
		expect(cleared.passengers).toHaveLength(0);
	});
});
