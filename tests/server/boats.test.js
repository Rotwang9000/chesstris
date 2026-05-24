'use strict';

const {
	createBoatManager,
	BOAT_COUNT,
	BOAT_WANDER_HALF_DEFAULT,
	BOAT_SEA_Y,
	BOAT_CELL_AVOID_RADIUS,
} = require('../../server/world/boats');

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

	test('boats spawn inside the wander box (no parking far outside the play area)', () => {
		const snap = manager.getSnapshot();
		for (const boat of snap) {
			expect(Math.abs(boat.position.x)).toBeLessThanOrEqual(BOAT_WANDER_HALF_DEFAULT + 0.5);
			expect(Math.abs(boat.position.z)).toBeLessThanOrEqual(BOAT_WANDER_HALF_DEFAULT + 0.5);
			// Hulls float just below cell-base level — see BOAT_SEA_Y.
			expect(boat.position.y).toBeCloseTo(BOAT_SEA_Y, 0);
		}
	});

	test('wander centre tracks the world board centre', () => {
		// Simulate a saved world whose chess cells are clustered far
		// from the origin (typical of a long-running game) and verify
		// the next batch of boats spawns around that centre instead of
		// around (0, 0).
		const offsetManager = createBoatManager({
			io: null,
			pickAdvertiser: () => null,
			getWorldCentre: () => ({ centreX: 30, centreZ: 30, extent: 20 }),
		});
		offsetManager.start();
		try {
			const snap = offsetManager.getSnapshot();
			for (const boat of snap) {
				// Each boat should be within ~ extent*0.7 (=14) of the
				// reported centre, with a tiny slack for the
				// initial _stepBoats movement.
				expect(boat.position.x).toBeGreaterThan(15);
				expect(boat.position.x).toBeLessThan(45);
				expect(boat.position.z).toBeGreaterThan(15);
				expect(boat.position.z).toBeLessThan(45);
			}
		} finally {
			offsetManager.stop();
		}
	});

	test('boats actually move between ticks (wandering toward their waypoint)', async () => {
		const first = manager.getSnapshot().map(b => ({ id: b.id, x: b.position.x, z: b.position.z }));
		// Boats move at ~1.2 ups; sleep a smidge so the next tick
		// computes a non-trivial dt and produces measurable motion.
		await new Promise(r => setTimeout(r, 80));
		manager.tick();
		await new Promise(r => setTimeout(r, 80));
		manager.tick();
		const second = manager.getSnapshot();
		let moved = 0;
		for (const after of second) {
			const before = first.find(f => f.id === after.id);
			if (!before) continue;
			if (Math.abs(before.x - after.position.x) + Math.abs(before.z - after.position.z) > 0.001) {
				moved++;
			}
		}
		expect(moved).toBeGreaterThan(0);
	});

	test('boats avoid occupied cells: never spawn on one, steer around them', async () => {
		// 3×3 island sitting at (0,0) — covers (-1..1, -1..1).
		const cells = [];
		for (let x = -1; x <= 1; x++) {
			for (let z = -1; z <= 1; z++) cells.push({ x, z });
		}
		const avoidManager = createBoatManager({
			io: null,
			pickAdvertiser: () => null,
			getWorldCentre: () => ({ centreX: 0, centreZ: 0, extent: 16 }),
			getOccupiedCells: () => cells,
		});
		avoidManager.start();
		try {
			// No boat may spawn inside the island.
			for (const boat of avoidManager.getSnapshot()) {
				const insideCell = cells.some(c =>
					Math.abs(boat.position.x - c.x) <= BOAT_CELL_AVOID_RADIUS &&
					Math.abs(boat.position.z - c.z) <= BOAT_CELL_AVOID_RADIUS
				);
				expect(insideCell).toBe(false);
			}
			// And after several seconds of simulated drift they still
			// don't end up clipping through it.
			for (let i = 0; i < 30; i++) {
				await new Promise(r => setTimeout(r, 20));
				avoidManager.tick();
			}
			for (const boat of avoidManager.getSnapshot()) {
				const insideCell = cells.some(c =>
					Math.abs(boat.position.x - c.x) <= BOAT_CELL_AVOID_RADIUS &&
					Math.abs(boat.position.z - c.z) <= BOAT_CELL_AVOID_RADIUS
				);
				expect(insideCell).toBe(false);
			}
		} finally {
			avoidManager.stop();
		}
	});

	test('snapshot propagates the placeholder flag for unpaid sails', () => {
		const placeholderManager = createBoatManager({
			io: null,
			pickAdvertiser: () => ({
				id: 'sail-placeholder',
				name: 'Your Ad Here',
				adImage: null,
				adLink: '/advertise',
				adText: 'Advertise on a Tetches sail →',
				placeholder: true,
			}),
		});
		placeholderManager.start();
		try {
			const [boat] = placeholderManager.getSnapshot();
			expect(boat.advertiser).toMatchObject({
				id: 'sail-placeholder',
				name: 'Your Ad Here',
				adLink: '/advertise',
				placeholder: true,
			});
		} finally {
			placeholderManager.stop();
		}
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
