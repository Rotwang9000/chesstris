/**
 * A home zone's rectangle must cover exactly its home markers. Vertical
 * zones (orientation 1 / 3) are laid out 2 wide × 8 deep but used to be
 * recorded as 8 × 2, so degradation, safe-home checks and island
 * protection all looked at the wrong cells.
 */

const World = require('../../server/world/World');
const GameManager = require('../../server/game/GameManager');

function markersOf(world, playerId) {
	const out = [];
	for (const [key, cell] of Object.entries(world.board.cells)) {
		if (!Array.isArray(cell)) continue;
		if (cell.some(i => i && i.type === 'home' && String(i.player) === playerId)) {
			const [x, z] = key.split(',').map(Number);
			out.push({ x, z });
		}
	}
	return out;
}

describe('home zone rectangle matches its cells', () => {
	test('every orientation: the zone covers all 16 markers', () => {
		World.resetWorld();
		const gm = new GameManager();
		const seen = new Set();
		for (let i = 0; i < 12; i++) {
			const id = `p${i}`;
			const res = gm.registerPlayer(World.getWorldId(), id, `P${i}`);
			expect(res.success).not.toBe(false);
			const world = World.getWorld();
			const zone = world.homeZones[id];
			if (!zone) continue;
			seen.add(zone.orientation);
			const markers = markersOf(world, id);
			expect(markers).toHaveLength(16);
			expect(zone.width * zone.height).toBe(16);
			for (const { x, z } of markers) {
				expect(x).toBeGreaterThanOrEqual(zone.x);
				expect(x).toBeLessThan(zone.x + zone.width);
				expect(z).toBeGreaterThanOrEqual(zone.z);
				expect(z).toBeLessThan(zone.z + zone.height);
			}
		}
		// Enough players that both layouts were exercised.
		expect([...seen].some(o => o === 1 || o === 3)).toBe(true);
		expect([...seen].some(o => o === 0 || o === 2)).toBe(true);
	});

	test('restore fixes zones saved with the old 8×2 vertical shape', () => {
		World.resetWorld();
		const snap = JSON.parse(JSON.stringify(World.getWorld()));
		snap.homeZones = {
			v: { x: 0, z: 0, width: 8, height: 2, orientation: 3, isDegraded: true },
			h: { x: 20, z: 0, width: 8, height: 2, orientation: 0, isDegraded: true },
		};
		World.restoreWorldFromSnapshot(snap);
		const zones = World.getWorld().homeZones;
		expect(zones.v).toMatchObject({ width: 2, height: 8, isDegraded: false });
		expect(zones.h).toMatchObject({ width: 8, height: 2, isDegraded: true });
	});
});
