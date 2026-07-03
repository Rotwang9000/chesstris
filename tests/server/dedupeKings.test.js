/**
 * One-king-rule repair (`missingKingSweep.dedupeKings`).
 *
 * A player must own at most one king. The historical king-capture
 * transfer bug (and stale persisted snapshots carrying it forward) could
 * leave a player with two kings — the user reported "I captured a king
 * but BECAME it and had two kings on the board". This sweep retires the
 * surplus, keeping the king nearest the player's home zone (their
 * original) so the legitimate one survives.
 */

const path = require('path');

const World = require(path.join('..', '..', 'server', 'world', 'World'));
const { dedupeKings } = require(path.join('..', '..', 'server', 'king', 'missingKingSweep'));

function king(id, player, x, z) {
	return { id, type: 'KING', player, position: { x, z } };
}

describe('missingKingSweep.dedupeKings', () => {
	beforeEach(() => {
		World.resetWorld({ id: 'global_game' });
	});

	test('removes the surplus king, keeping the one nearest home', () => {
		World.upsertPlayer('p1', { color: 0xff0000 });
		const world = World.getWorld();
		world.homeZones = { p1: { x: 0, z: 0, width: 8, height: 2 } }; // centre ≈ (4, 1)

		// Original king near home, an inherited/duplicate king far away.
		const home = king('p1-K-home', 'p1', 4, 1);
		const far = king('p1-K-far', 'p1', 30, 30);
		world.chessPieces.push(home, far);
		world.board.cells['4,1'] = [{ type: 'chess', pieceType: 'king', player: 'p1', pieceId: 'p1-K-home' }];
		world.board.cells['30,30'] = [{ type: 'chess', pieceType: 'king', player: 'p1', pieceId: 'p1-K-far' }];

		const removed = dedupeKings(world);

		expect(removed).toBe(1);
		const kings = world.chessPieces.filter(p => p.player === 'p1' && p.type === 'KING');
		expect(kings.length).toBe(1);
		expect(kings[0].id).toBe('p1-K-home');
		// The retired king's cell marker is stripped.
		expect(world.board.cells['30,30']).toBeUndefined();
	});

	test('leaves a single king untouched and ignores other players', () => {
		World.upsertPlayer('p1', { color: 0xff0000 });
		World.upsertPlayer('p2', { color: 0x0000ff });
		const world = World.getWorld();
		world.chessPieces.push(
			king('p1-K', 'p1', 4, 1),
			king('p2-K', 'p2', 20, 1),
			{ id: 'p2-R', type: 'ROOK', player: 'p2', position: { x: 21, z: 1 } },
		);

		const removed = dedupeKings(world);

		expect(removed).toBe(0);
		expect(world.chessPieces.filter(p => p.type === 'KING').length).toBe(2);
	});

	test('three kings collapse to one', () => {
		World.upsertPlayer('p1', { color: 0xff0000 });
		const world = World.getWorld();
		world.homeZones = { p1: { x: 0, z: 0, width: 8, height: 2 } };
		world.chessPieces.push(
			king('p1-A', 'p1', 4, 1),
			king('p1-B', 'p1', 10, 10),
			king('p1-C', 'p1', 12, 12),
		);

		const removed = dedupeKings(world);

		expect(removed).toBe(2);
		expect(world.chessPieces.filter(p => p.player === 'p1' && p.type === 'KING').length).toBe(1);
	});
});
