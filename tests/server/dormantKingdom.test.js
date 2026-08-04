'use strict';

const {
	DORMANT_IDLE_MS,
	homeZoneCentre,
	collectTerritory,
	transplantStowed,
	createDormantKingdomService,
} = require('../../server/world/dormantKingdom');

describe('dormantKingdom', () => {
	test('homeZoneCentre returns the middle of a zone', () => {
		expect(homeZoneCentre({ x: 0, z: 0, width: 8, height: 2 })).toEqual({ x: 4, z: 1 });
	});

	test('collectTerritory gathers owned cells and pieces', () => {
		const world = {
			board: {
				cells: {
					'0,0': [{ type: 'home', player: 'p1' }],
					'1,0': [{ type: 'tetromino', player: 'p1', pieceType: 'I' }],
					'5,5': [{ type: 'tetromino', player: 'p2', pieceType: 'O' }],
				},
			},
			chessPieces: [
				{ id: 'k1', type: 'KING', player: 'p1', position: { x: 1, z: 0 } },
			],
			homeZones: { p1: { x: 0, z: 0, width: 8, height: 2 } },
		};
		const snap = collectTerritory(world, 'p1');
		expect(Object.keys(snap.cells)).toHaveLength(2);
		expect(snap.chessPieces).toHaveLength(1);
		expect(snap.homeZone.x).toBe(0);
	});

	test('transplantStowed shifts cells and re-stamps pieces at the new home', () => {
		const world = {
			board: { cells: {} },
			chessPieces: [],
			homeZones: {},
			players: { p1: { id: 'p1', color: 0xff0000 } },
		};
		const stowed = {
			homeZone: { x: 0, z: 0, width: 8, height: 2 },
			cells: {
				'0,0': [{ type: 'tetromino', player: 'p1', pieceType: 'home_converted', fromHomeZone: true }],
				'1,0': [{ type: 'tetromino', player: 'p1', pieceType: 'I' }],
			},
			chessPieces: [
				{ id: 'k1', type: 'KING', player: 'p1', position: { x: 1, z: 0 } },
			],
		};
		const stats = transplantStowed(world, 'p1', stowed, { x: 40, z: 40, width: 8, height: 2 });
		expect(stats.placedCells).toBe(2);
		expect(stats.placedPieces).toBe(1);
		expect(world.homeZones.p1.x).toBe(40);
		expect(world.chessPieces).toHaveLength(1);
		expect(world.chessPieces[0].position.x).toBe(41);
	});

	test('shouldStowPlayer after 24h offline idle', () => {
		const World = require('../../server/world/World');
		const Sessions = require('../../server/world/Sessions');
		const now = Date.now();
		World.resetWorld();
		const world = World.getWorld();
		world.players.idle1 = {
			id: 'idle1',
			name: 'Idle',
			lastTetrominoPlacementAt: now - DORMANT_IDLE_MS - 1000,
		};
		world.homeZones.idle1 = { x: 0, z: 0, width: 8, height: 2 };
		world.chessPieces = [{ id: 'k', type: 'KING', player: 'idle1', position: { x: 1, z: 0 } }];
		world.board.cells = {
			'0,0': [{ type: 'home', player: 'idle1' }],
			'1,0': [{ type: 'chess', player: 'idle1', pieceId: 'k', pieceType: 'king' }],
		};
		jest.spyOn(Sessions, 'isOnline').mockReturnValue(false);
		const svc = createDormantKingdomService({
			gameManager: { boardManager: { recalculateBoardBoundaries: () => {} } },
			broadcaster: { broadcastGameUpdate: () => {} },
			persistence: { markDirty: () => {} },
			integrityService: { runIslandIntegrityPass: () => ({ changed: false }) },
		});
		expect(svc.shouldStowPlayer(World.getPlayer('idle1'), 'idle1', now)).toBe(true);
		const { stowed } = svc.tick({ now });
		expect(stowed).toContain('idle1');
		expect(World.getPlayer('idle1').stowedKingdom).toBeTruthy();
		expect(World.getWorld().homeZones.idle1).toBeUndefined();
		Sessions.isOnline.mockRestore();
	});
});
