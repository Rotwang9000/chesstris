/**
 * Tests for `server/world/pause.js`.
 *
 * Pause is a per-player switch with limited uses + a per-session
 * total-time budget. The tests mock `World.getPlayer` so we don't need
 * the whole bootstrap to construct a player record.
 */

jest.mock('../../server/world/World', () => {
	const players = new Map();
	return {
		__esModule: false,
		getPlayer: jest.fn((id) => players.get(String(id)) || null),
		getWorldId: jest.fn(() => 'world-test'),
		markDirty: jest.fn(),
		__setPlayer(id, record) {
			players.set(String(id), record);
		},
		__reset() { players.clear(); },
	};
});

const World = require('../../server/world/World');
const { createPauseService, PAUSE_MAX_USES, PAUSE_MAX_TOTAL_MS } = require('../../server/world/pause');

describe('PauseService', () => {
	const io = {
		to: jest.fn().mockReturnValue({ emit: jest.fn() }),
	};
	const broadcaster = { broadcastGameUpdate: jest.fn() };
	const persistence = { markDirty: jest.fn() };
	let service;

	beforeEach(() => {
		World.__reset();
		World.__setPlayer('p1', { id: 'p1' });
		jest.clearAllMocks();
		service = createPauseService({ io, broadcaster, persistence });
	});

	afterEach(() => {
		service.shutdown();
	});

	test('pause then resume flips `paused` and broadcasts state', () => {
		const player = World.getPlayer('p1');
		const r1 = service.pause('p1');
		expect(r1.ok).toBe(true);
		expect(r1.status.active).toBe(true);
		expect(player.paused).toBe(true);
		expect(broadcaster.broadcastGameUpdate).toHaveBeenCalled();

		const r2 = service.resume('p1');
		expect(r2.ok).toBe(true);
		expect(r2.status.active).toBe(false);
		expect(player.paused).toBe(false);
	});

	test('initial usesRemaining starts at PAUSE_MAX_USES', () => {
		const status = service.getStatus('p1');
		expect(status.usesRemaining).toBe(PAUSE_MAX_USES);
		expect(status.maxTotalMs).toBe(PAUSE_MAX_TOTAL_MS);
		expect(status.active).toBe(false);
	});

	test('uses run out after PAUSE_MAX_USES pause/resume cycles', () => {
		for (let i = 0; i < PAUSE_MAX_USES; i++) {
			const r = service.pause('p1');
			expect(r.ok).toBe(true);
			service.resume('p1');
		}
		const exhausted = service.pause('p1');
		expect(exhausted.ok).toBe(false);
		expect(exhausted.error).toBe('pause_uses_exhausted');
	});

	test('pause is idempotent when already active', () => {
		const r1 = service.pause('p1');
		expect(r1.ok).toBe(true);
		const r2 = service.pause('p1');
		expect(r2.ok).toBe(true);
		expect(r2.alreadyPaused).toBe(true);
		const status = service.getStatus('p1');
		expect(status.usesRemaining).toBe(PAUSE_MAX_USES - 1);
	});

	test('resume is idempotent when already inactive', () => {
		const r = service.resume('p1');
		expect(r.ok).toBe(true);
		expect(r.alreadyResumed).toBe(true);
	});

	test('unknown player id returns player_not_found', () => {
		const r = service.pause('ghost');
		expect(r.ok).toBe(false);
		expect(r.error).toBe('player_not_found');
	});

	test('resetUsage restores usesRemaining', () => {
		service.pause('p1');
		service.resume('p1');
		expect(service.getStatus('p1').usesRemaining).toBe(PAUSE_MAX_USES - 1);
		service.resetUsage('p1');
		expect(service.getStatus('p1').usesRemaining).toBe(PAUSE_MAX_USES);
	});
});
