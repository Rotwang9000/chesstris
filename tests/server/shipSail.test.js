/**
 * Viking longships — the `ship_sail` socket action, run through the
 * real handler (server/sockets/boats.js) on a fake socket: every guard
 * in order, the passenger travelling with the ship, the ack, the scoped
 * `ship_sailed` event and the 3 s rowing lock.
 */

'use strict';

const World = require('../../server/world/World');
const Sessions = require('../../server/world/Sessions');
const { registerBoatHandlers } = require('../../server/sockets/boats');
const { SHIP } = require('../../server/battle/shipRules');
const {
	at, vikingWorld, battle, land, ship, piece, cellAt,
} = require('./shipFixtures');

let events;
let broadcasts;
let integrityPasses;
let acting;

function sailSocket() {
	const handlers = new Map();
	const socket = { on: (event, fn) => handlers.set(event, fn) };
	registerBoatHandlers(socket, {
		playerId: 'h0',
		resolveActingPlayerId: () => acting,
		broadcaster: { broadcastGameUpdate: () => { broadcasts++; } },
		integrityService: { runIslandIntegrityPass: () => { integrityPasses++; return { changed: false }; } },
		persistence: { markDirty: () => {} },
	});
	return data => new Promise(resolve => handlers.get('ship_sail')(data, resolve));
}

let sail;

beforeEach(() => {
	vikingWorld();
	events = [];
	broadcasts = 0;
	integrityPasses = 0;
	acting = 's0';
	jest.spyOn(Sessions, 'emitToPlayerSockets').mockImplementation((playerId, event, payload) => {
		events.push({ playerId, event, payload });
		return 1;
	});
	land(-1, 0);
	ship(0, 0, { shipId: 'drakkar' });
	sail = sailSocket();
});

afterEach(() => jest.restoreAllMocks());

const to = (dx, dz) => at(dx, dz);

describe('guards, in order', () => {
	test('1. unknown, eliminated and paused players cannot sail', async () => {
		acting = 'nobody';
		expect(await sail({ shipId: 'drakkar', to: to(0, 2) })).toMatchObject({ success: false, reason: 'not_registered' });
		acting = 's0';
		World.getPlayer('s0').eliminated = true;
		expect(await sail({ shipId: 'drakkar', to: to(0, 2) })).toMatchObject({ success: false, reason: 'eliminated' });
		World.getPlayer('s0').eliminated = false;
		World.getPlayer('s0').paused = true;
		expect(await sail({ shipId: 'drakkar', to: to(0, 2) })).toMatchObject({ success: false, reason: 'paused' });
	});

	test('2. only seats of an ACTIVE Viking battle', async () => {
		acting = 'h0'; // the real player in the shared world
		expect(await sail({ shipId: 'drakkar', to: to(0, 2) })).toMatchObject({ success: false, reason: 'not_viking' });
		acting = 's0';
		battle().edition = 'standard';
		expect(await sail({ shipId: 'drakkar', to: to(0, 2) })).toMatchObject({ success: false, reason: 'not_viking' });
		battle().edition = 'viking';
		battle().status = 'finished';
		expect(await sail({ shipId: 'drakkar', to: to(0, 2) })).toMatchObject({ success: false, reason: 'not_viking' });
	});

	test('3. the ship must exist and be yours', async () => {
		expect(await sail({ shipId: 'ghost', to: to(0, 2) })).toMatchObject({ success: false, reason: 'no_ship' });
		acting = 's1';
		expect(await sail({ shipId: 'drakkar', to: to(0, 2) })).toMatchObject({ success: false, reason: 'not_your_ship' });
	});

	test('4. not while rowing', async () => {
		cellAt(0, 0)[0].readyAt = Date.now() + 2000;
		expect(await sail({ shipId: 'drakkar', to: to(0, 2) })).toMatchObject({ success: false, reason: 'ship_rowing' });
	});

	test('5. integer, orthogonal, 1-5 squares, open water all the way', async () => {
		expect(await sail({ shipId: 'drakkar', to: to(2, 2) })).toMatchObject({ reason: 'bad_sail' });
		expect(await sail({ shipId: 'drakkar', to: to(0, 6) })).toMatchObject({ reason: 'bad_sail' });
		expect(await sail({ shipId: 'drakkar', to: { x: at(0, 2).x + 0.5, z: at(0, 2).z } })).toMatchObject({ reason: 'bad_sail' });
		expect(await sail({ shipId: 'drakkar', to: 'north' })).toMatchObject({ reason: 'bad_sail' });
		expect(await sail({ shipId: 'drakkar' })).toMatchObject({ reason: 'bad_sail' });
		land(0, 2);
		expect(await sail({ shipId: 'drakkar', to: to(0, 3) })).toMatchObject({ reason: 'not_water' }); // crosses land
		ship(3, 0, { shipId: 'other' });
		expect(await sail({ shipId: 'drakkar', to: to(3, 0) })).toMatchObject({ reason: 'not_water' }); // onto a ship
		// A piece standing with no cell under it (lifted by a line clear,
		// say) is not open water: a ship must never scoop it up.
		World.getWorld().chessPieces.push({ id: 'floating', type: 'PAWN', player: 's1', position: to(0, -2) });
		expect(await sail({ shipId: 'drakkar', to: to(0, -3) })).toMatchObject({ reason: 'not_water' });
		expect(await sail({ shipId: 'drakkar', to: to(0, -2) })).toMatchObject({ reason: 'not_water' });
		World.getWorld().chessPieces = World.getWorld().chessPieces.filter(p => p.id !== 'floating');
		expect(await sail({ shipId: 'drakkar', to: to(0, -3) })).toMatchObject({ success: true });
		// Beyond the ring wall (play radius 14).
		World.getWorld().board.cells = {};
		ship(0, 13, { shipId: 'edge' });
		expect(await sail({ shipId: 'edge', to: to(0, 17) })).toMatchObject({ reason: 'not_water' });
	});

	test('junk payloads are refused, never thrown', async () => {
		for (const junk of [null, undefined, 42, 'x', [], { shipId: { $ne: 1 } }]) {
			const ack = await sail(junk);
			expect(ack.success).toBe(false);
		}
	});
});

describe('a clean sail', () => {
	test('the ship and its passenger move together; nothing else changes', async () => {
		const queen = piece('q', 'QUEEN', 0, 0);
		const seat = World.getPlayer('s0');
		seat.lastChessMoveAt = 1234;
		const dest = to(0, 3);
		const before = Date.now();
		const ack = await sail({ shipId: 'drakkar', to: dest });
		expect(ack).toMatchObject({
			success: true, shipId: 'drakkar', from: at(0, 0), to: dest, playerId: 's0', passengerId: 'q',
		});
		expect(ack.readyAt).toBeGreaterThanOrEqual(before + SHIP.ROW_LOCK_MS);
		expect(cellAt(0, 0)).toBeNull();
		const moved = cellAt(0, 3);
		expect(moved.map(i => i.type).sort()).toEqual(['chess', 'ship']);
		expect(moved.find(i => i.type === 'ship').readyAt).toBe(ack.readyAt);
		expect(queen.position).toEqual(dest);
		// Not a chess move: the cooldown stamp is untouched.
		expect(seat.lastChessMoveAt).toBe(1234);
		expect(broadcasts).toBe(1);
		expect(integrityPasses).toBe(1);
	});

	test('an empty ship sails too, and ship_sailed reaches only the seated humans', async () => {
		await sail({ shipId: 'drakkar', to: to(0, 2) });
		const sailed = events.filter(e => e.event === 'ship_sailed');
		expect(sailed.map(e => e.playerId).sort()).toEqual(['h0', 'h1']);
		expect(sailed[0].payload).toMatchObject({ shipId: 'drakkar', passengerId: null, to: to(0, 2) });
	});

	test('then it rows: a second sail inside 3 s is refused, after 3 s it goes', async () => {
		const realNow = Date.now;
		try {
			const t0 = realNow();
			Date.now = () => t0;
			expect((await sail({ shipId: 'drakkar', to: to(0, 2) })).success).toBe(true);
			Date.now = () => t0 + SHIP.ROW_LOCK_MS - 1;
			expect(await sail({ shipId: 'drakkar', to: to(0, 4) })).toMatchObject({ reason: 'ship_rowing' });
			Date.now = () => t0 + SHIP.ROW_LOCK_MS;
			expect((await sail({ shipId: 'drakkar', to: to(0, 4) })).success).toBe(true);
		} finally {
			Date.now = realNow;
		}
	});

	test('sailing during your own check is allowed (it cannot affect the check)', async () => {
		World.getWorld().pendingChecks = { s0: { defenderId: 's0', attackerId: 's1', kingPieceId: 'k' } };
		expect((await sail({ shipId: 'drakkar', to: to(0, 2) })).success).toBe(true);
	});
});
