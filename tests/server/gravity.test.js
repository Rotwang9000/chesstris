/**
 * Tests for the world-gravity service.
 *
 * We don't bother spinning up the full integration stack: we exercise the
 * pure helpers (centroid / footprint / shift) and a manually wired
 * service tick to confirm distant players drift towards the centroid
 * without trampling other players' content.
 */

const World = require('../../server/world/World');
const {
	createWorldGravityService,
	buildWorldCentroid,
	collectPlayerFootprint,
	isShiftSafe,
	applyShift,
	homeZoneCentre,
	GRAVITY_TRIGGER_DISTANCE,
} = require('../../server/world/gravity');
const BoardManager = require('../../server/game/BoardManager');

function seedWorld() {
	World.resetWorld();
	const world = World.getWorld();
	world.board.cells = {};
	world.chessPieces = [];
	world.homeZones = {};
	world.players = {};
	return world;
}

function addPlayer(world, id, zone, cells = []) {
	world.players[id] = { id, name: id, isComputer: false, eliminated: false };
	world.homeZones[id] = { ...zone, player: id };
	for (const cell of cells) {
		const key = `${cell.x},${cell.z}`;
		world.board.cells[key] = [{ type: 'tetromino', player: id }];
	}
}

describe('world gravity', () => {
	test('homeZoneCentre returns half-zone centre', () => {
		expect(homeZoneCentre({ x: 0, z: 0, width: 8, height: 2 })).toEqual({ x: 4, z: 1 });
	});

	test('buildWorldCentroid averages all live players', () => {
		const world = seedWorld();
		addPlayer(world, 'a', { x: 0, z: 0, width: 8, height: 2 });
		addPlayer(world, 'b', { x: 100, z: 100, width: 8, height: 2 });
		const centroid = buildWorldCentroid(world);
		expect(centroid.count).toBe(2);
		expect(centroid.x).toBeCloseTo(54);
		expect(centroid.z).toBeCloseTo(51);
	});

	test('collectPlayerFootprint gathers cells/pieces/zone', () => {
		const world = seedWorld();
		addPlayer(world, 'a', { x: 0, z: 0, width: 8, height: 2 }, [
			{ x: 0, z: 0 }, { x: 1, z: 0 },
		]);
		world.chessPieces.push({ id: 'a-king', player: 'a', position: { x: 0, z: 0 } });
		const footprint = collectPlayerFootprint(world, 'a');
		expect(footprint.cells).toHaveLength(2);
		expect(footprint.pieces).toHaveLength(1);
		expect(footprint.zone.x).toBe(0);
	});

	test('isShiftSafe rejects collisions with other players', () => {
		const world = seedWorld();
		addPlayer(world, 'a', { x: 0, z: 0, width: 8, height: 2 }, [{ x: 0, z: 0 }]);
		addPlayer(world, 'b', { x: 1, z: 0, width: 8, height: 2 }, [{ x: 1, z: 0 }]);
		const footprint = collectPlayerFootprint(world, 'a');
		expect(isShiftSafe(world, footprint, 1, 0)).toBe(false);
		expect(isShiftSafe(world, footprint, -1, 0)).toBe(true);
	});

	test('applyShift moves cells, pieces and zone', () => {
		const world = seedWorld();
		addPlayer(world, 'a', { x: 0, z: 0, width: 8, height: 2 }, [{ x: 0, z: 0 }]);
		world.chessPieces.push({ id: 'a-king', player: 'a', position: { x: 0, z: 0 } });
		const footprint = collectPlayerFootprint(world, 'a');
		applyShift(world, 'a', footprint, 2, 3);
		expect(world.board.cells['0,0']).toBeUndefined();
		expect(world.board.cells['2,3']).toBeDefined();
		expect(world.chessPieces[0].position).toEqual({ x: 2, z: 3 });
		expect(world.homeZones.a.x).toBe(2);
		expect(world.homeZones.a.z).toBe(3);
	});

	test('gravity tick drifts a faraway player towards the centroid', () => {
		const world = seedWorld();
		addPlayer(world, 'a', { x: 0, z: 0, width: 8, height: 2 }, [{ x: 0, z: 0 }]);
		const farX = GRAVITY_TRIGGER_DISTANCE * 3;
		addPlayer(world, 'b', { x: farX, z: 0, width: 8, height: 2 }, [{ x: farX, z: 0 }]);

		const boardManager = new BoardManager();
		const persistence = { markDirty: () => {} };
		const broadcaster = { broadcastGameUpdate: () => {} };
		const gravity = createWorldGravityService({ boardManager, broadcaster, persistence });

		const startA = world.homeZones.a.x;
		const startB = world.homeZones.b.x;
		gravity.tick();
		// B drifted west, A drifted east — both got closer to the
		// centroid by exactly one cell.
		expect(world.homeZones.b.x).toBe(startB - 1);
		expect(world.homeZones.a.x).toBe(startA + 1);
	});

	test('gravity tick is a no-op when only one player exists', () => {
		const world = seedWorld();
		addPlayer(world, 'a', { x: 200, z: 0, width: 8, height: 2 }, [{ x: 200, z: 0 }]);

		const boardManager = new BoardManager();
		const persistence = { markDirty: () => {} };
		const broadcaster = { broadcastGameUpdate: () => {} };
		const gravity = createWorldGravityService({ boardManager, broadcaster, persistence });
		gravity.tick();
		expect(world.homeZones.a.x).toBe(200);
	});
});
