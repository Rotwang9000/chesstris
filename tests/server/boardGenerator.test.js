/**
 * Tests for the home-zone placement algorithm.
 *
 * The user-visible promise is "new players spawn near the cluster of
 * existing players". These tests guard against regressions where new
 * home zones drift away from the existing centroid.
 */

const BoardGenerator = require('../../server/boardGenerator');
const { BOARD_SETTINGS } = require('../../server/game/Constants');

const HZ_W = BOARD_SETTINGS.HOME_ZONE_WIDTH;
const HZ_H = BOARD_SETTINGS.HOME_ZONE_HEIGHT;

function makeZone(x, z, orientation = 0) {
	const isVertical = orientation === 1 || orientation === 3;
	return {
		x, z,
		width: isVertical ? HZ_H : HZ_W,
		height: isVertical ? HZ_W : HZ_H,
		orientation,
	};
}

function zoneCentre(zone) {
	return {
		x: zone.x + zone.width / 2,
		z: zone.z + zone.height / 2,
	};
}

describe('calculateHomePosition', () => {
	test('first player lands at the origin (offset for pawn space)', () => {
		const pos = BoardGenerator.calculateHomePosition(0, {}, HZ_W, HZ_H);
		expect(typeof pos.orientation).toBe('number');
		// The first player must always be within 8 units of origin so the
		// rest of the cluster forms around them.
		expect(Math.abs(pos.x)).toBeLessThanOrEqual(8);
		expect(Math.abs(pos.z)).toBeLessThanOrEqual(8);
	});

	test('second player is placed close to the existing zone, not flung far away', () => {
		const gameState = {
			homeZones: {
				p0: makeZone(0, 8, 0),
			},
		};
		const pos = BoardGenerator.calculateHomePosition(1, gameState, HZ_W, HZ_H);
		const newZone = makeZone(pos.x, pos.z, pos.orientation);
		const a = zoneCentre(gameState.homeZones.p0);
		const b = zoneCentre(newZone);
		const distance = Math.hypot(a.x - b.x, a.z - b.z);
		// Should be a real game-board distance, not 100+ units away.
		expect(distance).toBeLessThanOrEqual(60);
	});

	test('20th player is placed near the cluster centroid, not far from it', () => {
		// Seed a tightly-clustered ring of zones around the origin.
		const gameState = { homeZones: {} };
		const seedZones = [
			[0, 8, 0],
			[20, 0, 3],
			[-20, 0, 1],
			[0, -20, 2],
			[14, 14, 0],
			[-14, 14, 0],
			[14, -14, 2],
			[-14, -14, 2],
		];
		seedZones.forEach(([x, z, o], i) => {
			gameState.homeZones[`p${i}`] = makeZone(x, z, o);
		});

		const pos = BoardGenerator.calculateHomePosition(seedZones.length, gameState, HZ_W, HZ_H);
		const newZone = makeZone(pos.x, pos.z, pos.orientation);
		const newCentre = zoneCentre(newZone);

		// Centroid of seed zones.
		let sumX = 0, sumZ = 0;
		Object.values(gameState.homeZones).forEach(zone => {
			const c = zoneCentre(zone);
			sumX += c.x;
			sumZ += c.z;
		});
		const centroid = {
			x: sumX / Object.keys(gameState.homeZones).length,
			z: sumZ / Object.keys(gameState.homeZones).length,
		};
		const distance = Math.hypot(centroid.x - newCentre.x, centroid.z - newCentre.z);
		// Should land within 60 units of the cluster, not 100+ like the
		// old "always spawn relative to origin" behaviour did.
		expect(distance).toBeLessThanOrEqual(60);
	});

	test('placement returns a valid orientation in [0,3]', () => {
		const gameState = { homeZones: { p0: makeZone(0, 8, 0) } };
		const pos = BoardGenerator.calculateHomePosition(1, gameState, HZ_W, HZ_H);
		expect([0, 1, 2, 3]).toContain(pos.orientation);
	});

	test('new placement never overlaps an existing zone', () => {
		const gameState = { homeZones: { p0: makeZone(0, 8, 0) } };
		const pos = BoardGenerator.calculateHomePosition(1, gameState, HZ_W, HZ_H);
		const existing = gameState.homeZones.p0;
		const newW = (pos.orientation === 1 || pos.orientation === 3) ? HZ_H : HZ_W;
		const newH = (pos.orientation === 1 || pos.orientation === 3) ? HZ_W : HZ_H;

		const overlapsX = !(pos.x + newW <= existing.x || pos.x >= existing.x + existing.width);
		const overlapsZ = !(pos.z + newH <= existing.z || pos.z >= existing.z + existing.height);
		expect(overlapsX && overlapsZ).toBe(false);
	});
});
