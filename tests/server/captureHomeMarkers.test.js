/**
 * On a king capture the captor inherits the loser's territory. The
 * loser's home markers must become ordinary captor ground — re-owning
 * them left 'home' cells with no zone record once the loser was reaped,
 * which line clears treat as permanent gaps.
 */

const World = require('../../server/world/World');
const { createKingCaptureService } = require('../../server/king/capture');

describe('king capture and the loser\'s home zone', () => {
	test('home markers turn into captor ground; other items change owner', () => {
		World.resetWorld();
		World.upsertPlayer('win', { name: 'Win' });
		World.upsertPlayer('lose', { name: 'Lose' });
		const w = World.getWorld();
		w.homeZones.lose = { x: 0, z: 0, width: 2, height: 1, orientation: 0 };
		w.board.cells['0,0'] = [{ type: 'home', player: 'lose' }];
		w.board.cells['1,0'] = [{ type: 'home', player: 'lose' }, { type: 'tetromino', player: 'lose' }];
		w.board.cells['5,5'] = [{ type: 'tetromino', player: 'lose' }];

		const io = { to: () => ({ emit: () => {} }), emit: () => {} };
		const svc = createKingCaptureService({
			io,
			gameManager: { islandManager: { checkForIslandsAfterRowClear() {} } },
			broadcaster: { broadcastGameUpdate() {}, clearDeltaCache() {} },
		});
		svc.executeKingCapture('win', 'lose');

		const all = Object.values(w.board.cells).flat();
		expect(all.some(i => i && i.type === 'home')).toBe(false);
		expect(all.some(i => i && i.player === 'lose')).toBe(false);
		// Empty home cell → captor ground; a cell that already had
		// (now captor-owned) terrain gets no duplicate.
		expect(w.board.cells['0,0']).toEqual([expect.objectContaining({ type: 'tetromino', player: 'win', fromHomeZone: true })]);
		expect(w.board.cells['1,0']).toEqual([expect.objectContaining({ type: 'tetromino', player: 'win' })]);
		expect(w.board.cells['5,5'][0].player).toBe('win');
		expect(w.homeZones.lose).toBeUndefined();
	});
});
