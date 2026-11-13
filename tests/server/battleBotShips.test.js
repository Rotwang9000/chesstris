/**
 * Viking longships — the bots as captains (spec §4 step 10).
 *
 *   • sea flight: a ship whose square sinks soon sails for the water
 *     the sea reaches last;
 *   • raid leg: a laden ship sails toward a moored square its passenger
 *     can raid from, and the passenger then lands with the capture;
 *   • lifeboat: a piece on doomed ground steps aboard an empty ship
 *     (the triage treats the ship as safe until its own square sinks);
 *   • harbour boarding after the opening minute, and the seize bonus;
 *   • threat helpers that see past ships;
 *   • standard battles: no sails, the triage unchanged.
 */

'use strict';

const World = require('../../server/world/World');
const Sessions = require('../../server/world/Sessions');
const { createAiActions, triageForSea } = require('../../server/ai/actions');
const shipPlanner = require('../../server/ai/shipPlanner');
const { isKingExposed, checkForThreatenedPieces } = require('../../server/ai/strategy');
const { SHIP, shipAt } = require('../../server/battle/shipRules');
const { SEA, sinkAtMs } = require('../../server/battle/sea');
const fx = require('./shipFixtures');

const NOW = 5_000_000;

function makeActions(emitted) {
	const io = { to: () => ({ emit: (event, payload) => emitted.push({ event, payload }) }) };
	return createAiActions({
		io,
		gameManager: { ...fx.managers(), activityLog: null },
		broadcaster: { broadcastGameUpdate: () => {} },
		integrityService: { runIslandIntegrityPass: () => {} },
		spectatorRegistry: null,
		lineClearService: { runCascade: () => Promise.resolve() },
	});
}

/** Where the ship with this id is now. */
function findShip(shipId) {
	for (const [key, contents] of Object.entries(World.getWorld().board.cells)) {
		const ship = shipAt(contents);
		if (ship && ship.shipId === shipId) {
			const [x, z] = key.split(',').map(Number);
			return { x, z, ship };
		}
	}
	return null;
}

/**
 * Start the battle so that the square at offset (dx, dz) sinks
 * `inMs` after NOW.
 */
function sinkOffsetIn(dx, dz, inMs) {
	const b = fx.battle();
	b.startedAt = 0;
	const { x, z } = fx.at(dx, dz);
	b.startedAt = NOW + inMs - sinkAtMs(b, x, z);
}

describe('bots captain their longships', () => {
	let emitted;
	let sessionEvents;
	let actions;

	beforeEach(() => {
		jest.useFakeTimers({ now: NOW });
		emitted = [];
		sessionEvents = [];
		jest.spyOn(Sessions, 'emitToPlayerSockets').mockImplementation((id, event, payload) => {
			sessionEvents.push({ id, event, payload });
		});
		jest.spyOn(console, 'log').mockImplementation(() => {});
		actions = makeActions(emitted);
	});

	afterEach(() => {
		jest.restoreAllMocks();
		jest.useRealTimers();
	});

	describe('sea flight', () => {
		beforeEach(() => {
			fx.vikingWorld({ mode: 'quick', bots: [1] });
			World.getWorld().players.s1.minMoveInterval = 5000;
			fx.piece('k1', 'KING', 0, 0, { player: 's1' });
			fx.piece('k0', 'KING', -6, 0, { player: 's0' });
			fx.land(12, 0, 's1');
			fx.ship(12, 1, { player: 's1', shipId: 'bviking-ship-1' });
		});

		test('a ship whose square sinks within 10 s sails for the latest-sinking water it can reach', () => {
			sinkOffsetIn(12, 1, 6000);
			const b = fx.battle();
			const before = fx.at(12, 1);
			const env = require('../../server/battle/ships').boardEnv(World.getWorld(), b, NOW);
			const latest = Math.max(...shipPlanner.reachableWater(env, before).map(s => sinkAtMs(b, s.x, s.z)));

			const plan = shipPlanner.planVoyage(World.getWorld(), b, { ...before, ship: findShip('bviking-ship-1').ship }, 's1', { now: NOW, moveIntervalMs: 5000 });
			expect(plan.kind).toBe('flee');
			expect(sinkAtMs(b, plan.dest.x, plan.dest.z)).toBe(latest);

			expect(actions.maybeSail('s1', { now: NOW })).toBe(1);
			const after = findShip('bviking-ship-1');
			expect(after).not.toBeNull();
			expect(after.x === before.x || after.z === before.z).toBe(true);
			expect(Math.abs(after.x - before.x) + Math.abs(after.z - before.z)).toBeLessThanOrEqual(SHIP.SAIL_MAX);
			expect(sinkAtMs(b, after.x, after.z)).toBeGreaterThan(sinkAtMs(b, before.x, before.z));
			expect(after.ship.readyAt).toBe(NOW + SHIP.ROW_LOCK_MS);
			// The human seat is told, exactly as for a human's sail.
			const sailed = sessionEvents.find(e => e.event === 'ship_sailed');
			expect(sailed).toMatchObject({ id: 'h0', payload: { shipId: 'bviking-ship-1', playerId: 's1', passengerId: null } });
		});

		test('a ship the sea will not reach soon stays at its mooring', () => {
			sinkOffsetIn(12, 1, 60 * 1000);
			expect(actions.maybeSail('s1', { now: NOW })).toBe(0);
			expect(findShip('bviking-ship-1')).toMatchObject(fx.at(12, 1));
		});

		test('a rowing ship waits, even with the sea coming', () => {
			sinkOffsetIn(12, 1, 6000);
			findShip('bviking-ship-1').ship.readyAt = NOW + 1000;
			expect(actions.maybeSail('s1', { now: NOW })).toBe(0);
		});

		test('a Novice bot (15 s between moves) flees earlier than the 10 s minimum', () => {
			World.getWorld().players.s1.minMoveInterval = 15000;
			sinkOffsetIn(12, 1, 15000);
			expect(actions.maybeSail('s1', { now: NOW })).toBe(1);
		});
	});

	describe('raid leg', () => {
		beforeEach(() => {
			fx.vikingWorld({ mode: 'classic', bots: [1] });
			// s0's coast: a strip with a bishop on its east end, king west.
			fx.strip(-3, 3, 0, 's0');
			fx.piece('k0', 'KING', -3, 0, { player: 's0' });
			fx.piece('b0', 'BISHOP', 3, 0, { player: 's0' });
			// s1's home far to the south, and its laden ship out at sea.
			fx.strip(-2, 2, 10, 's1');
			fx.piece('k1', 'KING', 0, 10, { player: 's1' });
			fx.ship(8, 5, { player: 's1', shipId: 'bviking-ship-2' });
			fx.piece('r1', 'ROOK', 8, 5, { player: 's1' });
		});

		test('a laden ship sails a leg toward a square its passenger can raid from', () => {
			const world = World.getWorld();
			const entry = { ...fx.at(8, 5), ship: findShip('bviking-ship-2').ship };
			const plan = shipPlanner.planVoyage(world, fx.battle(), entry, 's1', { now: NOW });
			expect(plan.kind).toBe('raid');
			// From the destination the rook reaches the bishop.
			const rook = world.chessPieces.find(p => p.id === 'r1');
			const cells = world.board.cells;
			const getCell = (x, z) => cells[`${x},${z}`] || null;
			const pieces = new Map(world.chessPieces.map(p => [`${p.position.x},${p.position.z}`, p]));
			expect(shipPlanner.reaches('ROOK', plan.dest, fx.at(3, 0), getCell, pieces)).toBe(true);

			expect(actions.maybeSail('s1', { now: NOW })).toBe(1);
			const after = findShip('bviking-ship-2');
			expect(after).toMatchObject(plan.to);
			expect(rook.position).toEqual(plan.to);
			const sailed = sessionEvents.find(e => e.event === 'ship_sailed');
			expect(sailed.payload).toMatchObject({ passengerId: 'r1', playerId: 's1' });
		});

		test('voyage done, the passenger lands with the capture: a raid', () => {
			jest.spyOn(Math, 'random').mockReturnValue(0);
			let now = NOW;
			for (let leg = 0; leg < 6; leg++) {
				if (actions.maybeSail('s1', { now }) === 0) break;
				now += SHIP.ROW_LOCK_MS + 1;
			}
			jest.setSystemTime(now);
			const world = World.getWorld();
			expect(actions.performStrategicChessMove('s1', null, null)).toBe(true);
			expect(world.chessPieces.find(p => p.id === 'b0')).toBeUndefined();
			const move = emitted.find(e => e.event === 'chess_move');
			expect(move.payload.ship).toMatchObject({ kind: 'raid', shipId: 'bviking-ship-2', landOwner: 's0' });
			expect(world.chessPieces.find(p => p.id === 'r1').position).toEqual(fx.at(3, 0));
		});

		test('a raid leg avoids a square an enemy rook could board', () => {
			// An s0 rook on the coast covering the bishop's east side.
			fx.strip(4, 4, -4, 's0');
			fx.piece('r0', 'ROOK', 4, -4, { player: 's0' });
			const world = World.getWorld();
			const entry = { ...fx.at(8, 5), ship: findShip('bviking-ship-2').ship };
			const plan = shipPlanner.planVoyage(world, fx.battle(), entry, 's1', { now: NOW });
			expect(plan.kind).toBe('raid');
			const cells = world.board.cells;
			const getCell = (x, z) => cells[`${x},${z}`] || null;
			const pieces = new Map(world.chessPieces.map(p => [`${p.position.x},${p.position.z}`, p]));
			expect(shipPlanner.reaches('ROOK', fx.at(4, -4), plan.dest, getCell, pieces)).toBe(false);
		});

		test('already moored where it can raid, the ship stays and lets the passenger act', () => {
			// Move the ship alongside the bishop first.
			const world = World.getWorld();
			const from = fx.at(8, 5);
			const to = fx.at(4, 0);
			world.board.cells[`${to.x},${to.z}`] = world.board.cells[`${from.x},${from.z}`];
			delete world.board.cells[`${from.x},${from.z}`];
			world.chessPieces.find(p => p.id === 'r1').position = { ...to };
			expect(actions.maybeSail('s1', { now: NOW })).toBe(0);
		});
	});

	describe('lifeboat', () => {
		// On the east of band 12 the spiral takes (12,-1), (12,0), (12,1)
		// one after another: a rook at (12,0) can step ashore to (12,-1)
		// (sinks first) or aboard the empty ship at (12,1) (sinks last).
		beforeEach(() => {
			fx.vikingWorld({ mode: 'quick', bots: [1] });
			World.getWorld().players.s1.minMoveInterval = 5000;
			World.getWorld().players.s1.difficulty = 'hard';
			fx.piece('k1', 'KING', 0, 0, { player: 's1' });
			fx.piece('k0', 'KING', -6, 6, { player: 's0' });
			fx.land(12, -1, 's1');
			fx.piece('r1', 'ROOK', 12, 0, { player: 's1' });
			fx.ship(12, 1, { player: 's1', shipId: 'bviking-ship-3' });
			sinkOffsetIn(12, 1, 8500);
		});

		test('the triage keeps a ship as a refuge until its own square sinks', () => {
			const world = World.getWorld();
			const b = fx.battle();
			const rook = world.chessPieces.find(p => p.id === 'r1');
			const quiet = [
				{ piece: rook, target: fx.at(12, -1) },
				{ piece: rook, target: fx.at(12, 1) },
			];
			// Without ship-awareness both squares are doomed: no escape.
			const plain = triageForSea(b, [], quiet, { now: NOW, moveIntervalMs: 5000 });
			expect(plain.escapes).toEqual([]);

			const ship = fx.at(12, 1);
			const aware = triageForSea(b, [], quiet, {
				now: NOW,
				moveIntervalMs: 5000,
				isShipSquare: (x, z) => x === ship.x && z === ship.z,
				lifeboatSinkAt: (x, z) => shipPlanner.lifeboatSinkAt(world, b, x, z, NOW),
			});
			expect(aware.escapes.map(c => c.target)).toEqual([ship]);
		});

		test('the bot steps aboard, then sails its lifeboat away from the sea', () => {
			jest.spyOn(Math, 'random').mockReturnValue(0);
			const world = World.getWorld();
			expect(actions.performStrategicChessMove('s1', null, null)).toBe(true);
			const rook = world.chessPieces.find(p => p.id === 'r1');
			expect(rook.position).toEqual(fx.at(12, 1));
			expect(emitted.find(e => e.event === 'chess_move').payload.ship).toMatchObject({ kind: 'embark' });

			expect(actions.maybeSail('s1', { now: NOW })).toBe(1);
			const b = fx.battle();
			expect(sinkAtMs(b, rook.position.x, rook.position.z)).toBeGreaterThan(NOW + SEA.WARNING_MS * 4);
			expect(findShip('bviking-ship-3')).toMatchObject(rook.position);
		});
	});

	describe('harbour boarding and seizing', () => {
		beforeEach(() => {
			fx.vikingWorld({ mode: 'classic', bots: [1], startedAt: NOW });
			World.getWorld().players.s1.difficulty = 'hard';
			// s1's home: a strip with a knight on it and the ship moored
			// behind (south, away from the enemy in the north).
			fx.strip(-3, 3, 4, 's1');
			fx.piece('k1', 'KING', -3, 4, { player: 's1' });
			fx.piece('n1', 'KNIGHT', 0, 4, { player: 's1' });
			fx.ship(1, 6, { player: 's1', shipId: 'bviking-ship-4' });
			fx.land(1, 5, 's1');
			fx.strip(-3, 3, -8, 's0');
			fx.piece('k0', 'KING', 0, -8, { player: 's0' });
		});

		test('in the opening minute nobody boards', () => {
			jest.spyOn(Math, 'random').mockReturnValue(0);
			expect(actions.performStrategicChessMove('s1', null, null)).toBe(true);
			expect(shipAt(fx.cellAt(1, 6)).player).toBe('s1');
			expect(World.getWorld().chessPieces.some(p => p.position.x === fx.at(1, 6).x && p.position.z === fx.at(1, 6).z)).toBe(false);
		});

		test('after a minute a knight steps aboard (chance by difficulty)', () => {
			jest.spyOn(Math, 'random').mockReturnValue(0);
			jest.setSystemTime(NOW + shipPlanner.BOARDING_DELAY_MS);
			expect(actions.performStrategicChessMove('s1', null, null)).toBe(true);
			const knight = World.getWorld().chessPieces.find(p => p.id === 'n1');
			expect(knight.position).toEqual(fx.at(1, 6));
			expect(emitted.find(e => e.event === 'chess_move').payload.ship).toMatchObject({ kind: 'embark', shipId: 'bviking-ship-4' });
		});

		test('the dice can say no: a roll above the chance keeps the knight ashore', () => {
			// Somewhere better to go than the ship (toward the enemy).
			fx.land(1, 2, 's1');
			// First roll: the boarding chance (refused); then the pick.
			jest.spyOn(Math, 'random')
				.mockReturnValueOnce(shipPlanner.boardingChance('hard') + 0.01)
				.mockReturnValue(0);
			jest.setSystemTime(NOW + shipPlanner.BOARDING_DELAY_MS);
			actions.performStrategicChessMove('s1', null, null);
			expect(World.getWorld().chessPieces.find(p => p.id === 'n1').position).not.toEqual(fx.at(1, 6));
			expect(shipPlanner.boardingChance('easy')).toBeLessThan(shipPlanner.boardingChance('medium'));
			expect(shipPlanner.boardingChance('medium')).toBeLessThan(shipPlanner.boardingChance('hard'));
		});

		test("an enemy's empty ship alongside is seized ahead of an ordinary step", () => {
			jest.spyOn(Math, 'random').mockReturnValue(0);
			// Make the ship s0's: the knight can take it with a quiet move.
			shipAt(fx.cellAt(1, 6)).player = 's0';
			expect(actions.performStrategicChessMove('s1', null, null)).toBe(true);
			const move = emitted.find(e => e.event === 'chess_move');
			expect(move.payload.ship).toMatchObject({ kind: 'seize', shipId: 'bviking-ship-4' });
			expect(shipAt(fx.cellAt(1, 6)).player).toBe('s1');
		});
	});

	describe('threat helpers see past ships', () => {
		beforeEach(() => {
			fx.vikingWorld({ mode: 'classic', bots: [1] });
		});

		test('a ship alongside the king is no wall', () => {
			fx.piece('k1', 'KING', 0, 0, { player: 's1' });
			fx.land(1, 0, 's1');
			fx.land(-1, 0, 's1');
			fx.ship(0, 1, { player: 's1' });
			expect(isKingExposed(World.getWorld(), 's1')).toBe(true);
			fx.land(0, -1, 's1');
			expect(isKingExposed(World.getWorld(), 's1')).toBe(false);
		});

		test('an enemy aboard a ship that touches no land threatens nothing', () => {
			fx.piece('k1', 'KING', 0, 0, { player: 's1' });
			fx.ship(0, 2, { player: 's0' });
			fx.piece('q0', 'QUEEN', 0, 2, { player: 's0' });
			const world = World.getWorld();
			world.players.s1.strategy = { huntRadius: 6 };
			expect(checkForThreatenedPieces(world, 's1')).toBe(false);
			// Moored (land alongside), the queen can step off: a threat.
			fx.land(1, 2, 's1');
			expect(checkForThreatenedPieces(world, 's1')).toBe(true);
		});
	});

	describe('standard battles are untouched', () => {
		test('no sail, even with a ship item and the sea at the door', () => {
			fx.vikingWorld({ edition: 'standard', mode: 'quick', bots: [1] });
			fx.piece('k1', 'KING', 0, 0, { player: 's1' });
			fx.ship(12, 1, { player: 's1', shipId: 'x' });
			sinkOffsetIn(12, 1, 3000);
			expect(actions.maybeSail('s1', { now: NOW })).toBe(0);
			expect(findShip('x')).toMatchObject(fx.at(12, 1));
		});

		test('outside a battle maybeSail is a no-op', () => {
			World.resetWorld();
			World.getWorld().players.ai1 = { id: 'ai1', isComputer: true };
			expect(actions.maybeSail('ai1')).toBe(0);
		});
	});
});
