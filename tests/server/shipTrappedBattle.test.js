/**
 * Viking battles: a longship hemmed in by land on all four sides is
 * captured with any warrior aboard (owner, 2026-11-17: the world's trap
 * rule in battles too). The seat still gets its usual rebuild.
 */

'use strict';

const World = require('../../server/world/World');
const Sessions = require('../../server/world/Sessions');
const { shipAt } = require('../../server/battle/shipRules');
const ships = require('../../server/battle/ships');
const { vikingWorld, battle, land, ship, piece, cellAt } = require('./shipFixtures');

let events;

beforeEach(() => {
	vikingWorld();
	events = [];
	jest.spyOn(Sessions, 'emitToPlayerSockets').mockImplementation((playerId, event, payload) => {
		events.push({ playerId, event, payload });
		return 1;
	});
	piece('k0', 'KING', -10, -10);
	piece('k1', 'KING', 10, 10, { player: 's1' });
});

afterEach(() => jest.restoreAllMocks());

const box = () => { land(1, 0); land(-1, 0); land(0, 1); land(0, -1); };

test('a ship with land on all four sides is captured, with its warrior', () => {
	ship(0, 0, { shipId: 'boxed' });
	piece('q', 'QUEEN', 0, 0);
	box();
	const removed = [];
	const changed = ships.reconcileShips(World.getWorld(), battle(), {
		now: Date.now(), removePiece: (p, why) => removed.push([p.id, why]),
	});
	expect(changed).toBe(true);
	expect(shipAt(cellAt(0, 0))).toBeNull();
	expect(removed).toEqual([['q', 'ship_trapped']]);
	const trapped = events.filter(e => e.event === 'ship_trapped').map(e => e.payload);
	expect(trapped[0]).toMatchObject({ shipId: 'boxed', playerId: 's0', passengerId: 'q', passengerType: 'QUEEN' });
	expect(trapped[0].battleId).toBeDefined();
});

test('the loss is reported as trapped, not destroyed, and the rebuild clock starts', () => {
	ship(0, 0, { shipId: 'boxed' });
	const world = World.getWorld();
	ships.reconcileShips(world, battle(), { now: Date.now() }); // learn the fleet
	box();
	ships.reconcileShips(world, battle(), { now: Date.now() });
	const lost = events.filter(e => e.event === 'ship_lost').map(e => e.payload);
	expect(lost[0]).toMatchObject({ shipId: 'boxed', seatId: 's0', reason: 'trapped' });
	expect(Number.isFinite(ships.ensureFleet(battle()).respawnAt.s0)).toBe(true);
});

test('three sides of land, or a ship alongside, is not a trap', () => {
	ship(0, 0, { shipId: 'a' });
	land(1, 0); land(-1, 0); land(0, 1);
	ship(0, -1, { shipId: 'b' });
	expect(ships.reconcileShips(World.getWorld(), battle(), { now: Date.now() })).toBe(false);
	expect(shipAt(cellAt(0, 0))).not.toBeNull();
});

test('standard battles never meet the rule', () => {
	battle().edition = 'standard';
	ship(0, 0, { shipId: 'boxed' });
	box();
	ships.reconcileShips(World.getWorld(), battle(), { now: Date.now() });
	expect(shipAt(cellAt(0, 0))).not.toBeNull();
});
