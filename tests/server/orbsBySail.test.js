/**
 * Longships collect orbs (owner, 2026-11-16): a sail claims every orb on
 * the squares the ship crossed; the piece lands by the claimant's king.
 */

const path = require('path');

const World = require(path.join('..', '..', 'server', 'world', 'World'));
const { createPowerUpManager } = require(path.join('..', '..', 'server', 'game', 'PowerUpManager'));

function makeIo() {
	const events = [];
	return { _events: events, to() { return { emit: (eventName, payload) => events.push({ eventName, payload }) }; } };
}

function setup() {
	World.resetWorld();
	const world = World.getWorld();
	World.upsertPlayer('p2', { name: 'Two', isComputer: false, color: 0x00aa00 });
	world.homeZones.p2 = { x: 0, z: 0, width: 8, height: 2, orientation: 0 };
	for (let x = 0; x < 8; x++) {
		for (let z = 0; z < 2; z++) world.board.cells[`${x},${z}`] = [{ type: 'home', player: 'p2' }];
	}
	world.chessPieces.push({ id: 'p2-king', type: 'KING', player: 'p2', position: { x: 4, z: 0 }, orientation: 0 });
	world.board.cells['4,0'].push({ type: 'chess', player: 'p2', pieceId: 'p2-king', chessPiece: { type: 'KING' } });
	const io = makeIo();
	const manager = createPowerUpManager({ io, broadcaster: { broadcastGameUpdate() {} }, persistence: { markDirty() {} } });
	return { world, io, manager };
}

describe('orbs hauled aboard by a sailing longship', () => {
	test('every orb on the squares crossed, the destination included, is claimed', () => {
		const { world, io, manager } = setup();
		world.powerUps.push({ id: 'o-mid', x: 12, z: 10, pieceType: 'ROOK', spawnedAt: Date.now() });
		world.powerUps.push({ id: 'o-end', x: 14, z: 10, pieceType: 'PAWN', spawnedAt: Date.now() });
		world.powerUps.push({ id: 'o-off', x: 14, z: 11, pieceType: 'QUEEN', spawnedAt: Date.now() });

		const claims = manager.claimBySail(world, 'p2', { x: 10, z: 10 }, { x: 14, z: 10 });

		expect(claims.map(c => c.orb.id).sort()).toEqual(['o-end', 'o-mid']);
		expect(world.powerUps.map(o => o.id)).toEqual(['o-off']);
		// the new pieces wait at home, by the king, not out on the water
		for (const c of claims) {
			const at = c.piece.position || { x: c.piece.x, z: c.piece.z };
			expect(at.z).toBeLessThan(2);
			expect(at.x === 4 && at.z === 0).toBe(false);
		}
		const emitted = io._events.filter(e => e.eventName === 'powerup_claimed');
		expect(emitted).toHaveLength(2);
		expect(emitted[0].payload.bySea).toBe(true);
	});

	test('the square the ship left is not crossed again', () => {
		const { world, manager } = setup();
		world.powerUps.push({ id: 'o-start', x: 10, z: 10, pieceType: 'PAWN', spawnedAt: Date.now() });
		expect(manager.claimBySail(world, 'p2', { x: 10, z: 10 }, { x: 10, z: 13 })).toEqual([]);
		expect(world.powerUps).toHaveLength(1);
	});

	test('with nowhere at home to put the piece, the orb keeps floating', () => {
		const { world, manager } = setup();
		for (const key of Object.keys(world.board.cells)) {
			if (key !== '4,0') world.board.cells[key].push({ type: 'chess', player: 'p2', pieceId: `x${key}` });
		}
		world.powerUps.push({ id: 'o', x: 11, z: 10, pieceType: 'KNIGHT', spawnedAt: Date.now() });
		expect(manager.claimBySail(world, 'p2', { x: 10, z: 10 }, { x: 12, z: 10 })).toEqual([]);
		expect(world.powerUps).toHaveLength(1);
	});

	test('a diagonal or garbled leg claims nothing', () => {
		const { world, manager } = setup();
		world.powerUps.push({ id: 'o', x: 11, z: 11, pieceType: 'PAWN', spawnedAt: Date.now() });
		expect(manager.claimBySail(world, 'p2', { x: 10, z: 10 }, { x: 12, z: 12 })).toEqual([]);
		expect(manager.claimBySail(world, 'p2', null, { x: 12, z: 12 })).toEqual([]);
	});
});
