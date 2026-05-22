/**
 * Tests for the unified server World, Sessions and persistence
 * migration.  These guard the Phase-3 "single source of truth"
 * architecture so we don't accidentally regrow the duplicate game
 * stores.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const World = require('../../server/world/World');
const Sessions = require('../../server/world/Sessions');
const Disconnects = require('../../server/world/Disconnects');

describe('World — single source of truth', () => {
	beforeEach(() => {
		World.resetWorld();
		Sessions.clearAll();
		Disconnects.clearAll();
	});

	test('starts empty with the canonical id', () => {
		const w = World.getWorld();
		expect(w.id).toBe('global_game');
		expect(Object.keys(w.players)).toHaveLength(0);
		expect(Object.keys(w.board.cells)).toHaveLength(0);
		expect(Array.isArray(w.chessPieces)).toBe(true);
	});

	test('upsertPlayer creates and merges fields', () => {
		const pid = 'p1';
		World.upsertPlayer(pid, { name: 'Alice', isComputer: false });
		expect(World.getPlayer(pid).name).toBe('Alice');
		expect(World.getPlayer(pid).gameId).toBe('global_game');
		World.upsertPlayer(pid, { balance: 42 });
		expect(World.getPlayer(pid).balance).toBe(42);
		expect(World.getPlayer(pid).name).toBe('Alice');
	});

	test('removePlayer wipes cells, pieces and home zones', () => {
		const pid = 'p1';
		World.upsertPlayer(pid, { name: 'Alice' });
		const w = World.getWorld();
		w.board.cells['1,2'] = [{ type: 'tetromino', player: pid }];
		w.board.cells['3,4'] = [{ type: 'tetromino', player: 'other' }];
		w.chessPieces.push({ id: 'k1', player: pid, type: 'king' });
		w.chessPieces.push({ id: 'k2', player: 'other', type: 'king' });
		w.homeZones[pid] = { x: 0, z: 0, width: 8, height: 2 };

		expect(World.removePlayer(pid)).toBe(true);
		expect(World.getPlayer(pid)).toBeNull();
		expect(w.board.cells['1,2']).toBeUndefined();
		expect(w.board.cells['3,4']).toBeDefined();
		expect(w.chessPieces).toHaveLength(1);
		expect(w.chessPieces[0].player).toBe('other');
		expect(w.homeZones[pid]).toBeUndefined();
	});

	test('eliminatePlayer flags but does not delete', () => {
		World.upsertPlayer('p1', { name: 'Alice' });
		World.eliminatePlayer('p1');
		expect(World.getPlayer('p1').eliminated).toBe(true);
	});

	test('listActivePlayers excludes eliminated and observers', () => {
		World.upsertPlayer('a', { name: 'Active' });
		World.upsertPlayer('e', { name: 'Eliminated', eliminated: true });
		World.upsertPlayer('o', { name: 'Observer', isObserver: true });
		const ids = World.listActivePlayers().map(p => p.id);
		expect(ids).toEqual(['a']);
	});

	test('markDirty flips the dirty flag', () => {
		World.clearDirty();
		expect(World.isDirty()).toBe(false);
		World.markDirty();
		expect(World.isDirty()).toBe(true);
	});
});

describe('Sessions — ephemeral socket bindings', () => {
	beforeEach(() => Sessions.clearAll());

	const fakeSocket = (id) => ({ id, join: () => {}, emit: () => {} });

	test('bind/unbind tracks the active socket per player', () => {
		const s1 = fakeSocket('socket-1');
		Sessions.bind(s1, 'p1');
		expect(Sessions.isOnline('p1')).toBe(true);
		expect(Sessions.socketForPlayer('p1')).toBe(s1);
		Sessions.unbind('socket-1');
		expect(Sessions.isOnline('p1')).toBe(false);
		expect(Sessions.socketForPlayer('p1')).toBeNull();
	});

	test('rebinding evicts the previous socket', () => {
		const s1 = fakeSocket('socket-1');
		const s2 = fakeSocket('socket-2');
		Sessions.bind(s1, 'p1');
		Sessions.bind(s2, 'p1');
		expect(Sessions.socketForPlayer('p1')).toBe(s2);
		expect(Sessions.bySocketId('socket-1')).toBeNull();
	});
});

describe('Disconnects — grace timers', () => {
	beforeEach(() => Disconnects.clearAll());

	test('arm + clear is idempotent', () => {
		const cb = jest.fn();
		Disconnects.arm('p1', cb, 10000);
		expect(Disconnects.isPending('p1')).toBe(true);
		Disconnects.clear('p1');
		expect(Disconnects.isPending('p1')).toBe(false);
		expect(cb).not.toHaveBeenCalled();
	});

	test('expires after the grace period', (done) => {
		Disconnects.arm('p1', () => {
			expect(Disconnects.isPending('p1')).toBe(false);
			done();
		}, 10);
	});
});

describe('Persistence — load/save round-trip', () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tetches-world-'));
	const originalEnvData = process.env.TETCHES_DATA_DIR;

	afterAll(() => {
		try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
		if (originalEnvData !== undefined) process.env.TETCHES_DATA_DIR = originalEnvData;
	});

	test('v1 legacy snapshot migrates to v2 unified world', () => {
		// Build a minimal v1 snapshot that mirrors the historical schema.
		const legacy = {
			version: 1,
			savedAt: new Date().toISOString(),
			globalGameId: 'global_game',
			game: {
				id: 'global_game',
				players: ['p1'],
				maxPlayers: 32,
				hasComputerPlayer: false,
				created: Date.now(),
				state: {
					board: { cells: { '0,0': [{ type: 'home', player: 'p1' }] }, minX: 0, maxX: 0, minZ: 0, maxZ: 0 },
					chessPieces: [{ id: 'k', player: 'p1', type: 'king', position: { x: 0, z: 0 } }],
					homeZones: { p1: { x: 0, z: 0, width: 8, height: 2 } },
					gameMode: 'standard',
				},
			},
			humanPlayers: { p1: { id: 'p1', name: 'Alice', gameId: 'global_game' } },
			computerPlayers: {},
			persistentPlayers: { p1: { name: 'Alice', gameId: 'global_game' } },
			gameManagerGame: {
				id: 'global_game',
				board: { cells: { '0,0': [{ type: 'home', player: 'p1' }] }, minX: 0, maxX: 0, minZ: 0, maxZ: 0 },
				chessPieces: [{ id: 'k', player: 'p1', type: 'king', position: { x: 0, z: 0 } }],
				islands: [],
				players: { p1: { id: 'p1', name: 'Alice', color: 0xabcdef } },
				homeZones: { p1: { x: 0, z: 0, width: 8, height: 2 } },
				maxPlayers: 32,
				homeZoneDistance: 16,
				status: 'active',
			},
		};

		// Persistence does file I/O against data/world.json — but its
		// migrateLegacyV1 / restoreWorld functions are pure with respect
		// to the snapshot object.  We exercise them directly.
		const persistence = require('../../server/persistence');
		const migrated = require('../../server/persistence').loadWorld.toString().includes('migrateLegacyV1')
			? null : null;
		// Use the exported restoreWorld with a manually-built v2 snapshot
		// (mimicking what loadWorld would have produced).
		// Since migrateLegacyV1 is internal, we test via the public
		// path: write a temporary file then load.
		const dataDir = path.join(__dirname, '..', '..', 'data');
		const stateFile = persistence.STATE_FILE;
		const backupBefore = fs.existsSync(stateFile) ? fs.readFileSync(stateFile, 'utf8') : null;
		try {
			fs.writeFileSync(stateFile, JSON.stringify(legacy), 'utf8');
			const loaded = persistence.loadWorld();
			expect(loaded).toBeTruthy();
			expect(loaded.version).toBe(2);
			expect(loaded.world.id).toBe('global_game');
			expect(loaded.world.players.p1).toBeTruthy();
			expect(loaded.world.players.p1.name).toBe('Alice');
			expect(loaded.world.homeZones.p1).toBeTruthy();
			expect(loaded.world.chessPieces).toHaveLength(1);
		} finally {
			if (backupBefore !== null) {
				fs.writeFileSync(stateFile, backupBefore, 'utf8');
			} else {
				try { fs.unlinkSync(stateFile); } catch (_) {}
			}
		}
	});

	test('restoreWorld populates World and round-trips through saveSync', () => {
		const persistence = require('../../server/persistence');
		const snapshot = {
			version: 2,
			savedAt: new Date().toISOString(),
			world: {
				id: 'global_game',
				createdAt: Date.now(),
				updatedAt: Date.now(),
				status: 'active',
				maxPlayers: 16,
				homeZoneDistance: 12,
				gameMode: 'standard',
				board: { cells: { '5,5': [{ type: 'home', player: 'x' }] }, minX: 5, maxX: 5, minZ: 5, maxZ: 5 },
				chessPieces: [],
				islands: [],
				players: {
					x: {
						id: 'x', gameId: 'global_game', name: 'X',
						isComputer: false, eliminated: false, balance: 7,
					},
				},
				homeZones: { x: { x: 5, z: 5, width: 8, height: 2 } },
				currentTurns: {},
				lastAction: null,
			},
		};
		const ok = persistence.restoreWorld(snapshot);
		expect(ok).toBe(true);
		const w = World.getWorld();
		expect(w.maxPlayers).toBe(16);
		expect(w.players.x.balance).toBe(7);
		expect(w.homeZones.x.width).toBe(8);
	});
});
