/**
 * Viking longships — the bot captain's voyage discipline (shipPlanner).
 *
 * Regressions from the soak review:
 *   • no memory: each tick replanned from scratch, so ships sailed a leg
 *     and straight back — two ships blocking each other's routes did it
 *     in lockstep for minutes — and sailed away from a capture on offer
 *     to chase a slightly better square;
 *   • sea-blind legs: only the destination was checked against the
 *     sea, so a first leg could stop on water sinking in 1 s;
 *   • late flight: a moored ship fled only when its OWN square was due,
 *     by which time the water round it had gone and it was boxed in.
 *
 * Sea timing is injected through the planner's `grid` seam (a
 * `waterGrid` with its `sinkAt` overridden), so each case states the
 * sink times it needs instead of reverse-engineering the spiral.
 */

'use strict';

const World = require('../../server/world/World');
const Sessions = require('../../server/world/Sessions');
const ships = require('../../server/battle/ships');
const shipPlanner = require('../../server/ai/shipPlanner');
const { createAiActions } = require('../../server/ai/actions');
const { shipAt } = require('../../server/battle/shipRules');
const fx = require('./shipFixtures');

const NOW = 5_000_000;

/** A water grid for the current board whose sink times come from `sinkAt(dx, dz)` (offsets). */
function fakeGrid(sinkAtOffset) {
	const battle = fx.battle();
	const real = shipPlanner.waterGrid(ships.boardEnv(World.getWorld(), battle, NOW), battle);
	return {
		...real,
		sinkAt: (x, z) => sinkAtOffset(x - fx.CENTRE.x, z - fx.CENTRE.z),
	};
}

const entryOf = shipId => {
	const found = ships.findShip(World.getWorld(), fx.battle(), shipId);
	return found ? { x: found.x, z: found.z, ship: found.ship } : null;
};
const offset = p => ({ dx: p.x - fx.CENTRE.x, dz: p.z - fx.CENTRE.z });

beforeEach(() => {
	jest.spyOn(console, 'log').mockImplementation(() => {});
	jest.spyOn(Sessions, 'emitToPlayerSockets').mockImplementation(() => 1);
});
afterEach(() => jest.restoreAllMocks());

describe('raid voyages remember where they are going', () => {
	beforeEach(() => {
		fx.vikingWorld({ mode: 'classic', bots: [1] });
		fx.strip(-3, 3, 0, 's0');
		fx.piece('k0', 'KING', -3, 0, { player: 's0' });
		fx.piece('b0', 'BISHOP', 3, 0, { player: 's0' });
		fx.strip(-2, 2, 10, 's1');
		fx.piece('k1', 'KING', 0, 10, { player: 's1' });
		fx.ship(8, 5, { player: 's1', shipId: 'raider' });
		fx.piece('r1', 'ROOK', 8, 5, { player: 's1' });
	});

	test('a capture on offer right here: land, do not chase a better square', () => {
		// Moored beside the bishop (a rook takes it along z = 0)…
		const world = World.getWorld();
		const from = fx.at(8, 5);
		const to = fx.at(4, 0);
		world.board.cells[`${to.x},${to.z}`] = world.board.cells[`${from.x},${from.z}`];
		delete world.board.cells[`${from.x},${from.z}`];
		world.chessPieces.find(p => p.id === 'r1').position = { ...to };
		// …while an undefended queen sits further along the coast.
		fx.strip(-8, -4, -6, 's0');
		fx.piece('q0', 'QUEEN', -8, -6, { player: 's0' });
		const entry = entryOf('raider');
		const memory = {};
		expect(shipPlanner.planVoyage(world, fx.battle(), entry, 's1', { now: NOW, memory })).toBeNull();
	});

	test('the remembered destination holds; arriving there ends the voyage', () => {
		const world = World.getWorld();
		const memory = {};
		const first = shipPlanner.planVoyage(world, fx.battle(), entryOf('raider'), 's1', { now: NOW, memory });
		expect(first.kind).toBe('raid');
		expect(memory.raider).toMatchObject({ dest: first.dest, passengerId: 'r1', player: 's1' });
		let now = NOW;
		let entry = entryOf('raider');
		for (let leg = 0; leg < 8; leg++) {
			const plan = shipPlanner.planVoyage(world, fx.battle(), entry, 's1', { now, memory });
			if (!plan) break;
			expect(plan.dest).toEqual(first.dest);
			expect(ships.sail(world, fx.battle(), 's1', { shipId: 'raider', to: plan.to }, { now }).success).toBe(true);
			now += 3001;
			entry = entryOf('raider');
		}
		// The loop stopped on arrival: the voyage is closed, the last leg
		// kept on record against a bounce straight back.
		expect({ x: entry.x, z: entry.z }).toEqual(first.dest);
		expect(memory.raider).toMatchObject({ dest: null, passengerId: 'r1' });
		expect(memory.raider.prev).not.toBeNull();
		// Still here next tick, with the bishop to take: it stays put.
		expect(shipPlanner.planVoyage(world, fx.battle(), entry, 's1', { now, memory })).toBeNull();
	});

	test('a fresh plan never sails straight back over the leg just sailed', () => {
		const world = World.getWorld();
		const entry = entryOf('raider');
		const fresh = shipPlanner.planVoyage(world, fx.battle(), entry, 's1', { now: NOW });
		expect(fresh.kind).toBe('raid');
		// Pretend we just arrived here FROM the square the fresh plan wants.
		const memory = { raider: { player: 's1', passengerId: 'r1', dest: null, prev: { ...fresh.to }, prevAt: NOW - 1000 } };
		const guarded = shipPlanner.planVoyage(world, fx.battle(), entry, 's1', { now: NOW, memory });
		if (guarded) expect(guarded.to).not.toEqual(fresh.to);
		// The guard lapses after REVERSAL_GUARD_MS.
		memory.raider = { player: 's1', passengerId: 'r1', dest: null, prev: { ...fresh.to }, prevAt: NOW - shipPlanner.REVERSAL_GUARD_MS - 1 };
		expect(shipPlanner.planVoyage(world, fx.battle(), entry, 's1', { now: NOW, memory }).to).toEqual(fresh.to);
	});

	test('a new passenger is a new voyage', () => {
		const memory = { raider: { player: 's1', passengerId: 'someone-else', dest: fx.at(4, 0), prev: null, prevAt: 0 } };
		shipPlanner.planVoyage(World.getWorld(), fx.battle(), entryOf('raider'), 's1', { now: NOW, memory });
		expect(memory.raider.passengerId).toBe('r1');
	});
});

describe('two bots whose ships block each other do not shuttle', () => {
	test('over 40 ticks no ship ever reverses its previous leg', () => {
		fx.vikingWorld({ mode: 'classic', bots: [0, 1] });
		const world = World.getWorld();
		// Two coasts facing each other across a channel, each with prey.
		fx.strip(-6, 6, -6, 's0');
		fx.piece('k0', 'KING', -6, -6, { player: 's0' });
		fx.piece('b0', 'BISHOP', 2, -6, { player: 's0' });
		fx.piece('n0', 'KNIGHT', -2, -6, { player: 's0' });
		fx.strip(-6, 6, 6, 's1');
		fx.piece('k1', 'KING', 6, 6, { player: 's1' });
		fx.piece('b1', 'BISHOP', -2, 6, { player: 's1' });
		fx.piece('n1', 'KNIGHT', 2, 6, { player: 's1' });
		// Both laden ships start in the channel, in each other's way.
		fx.ship(0, -1, { player: 's0', shipId: 'ship-s0' });
		fx.piece('r0', 'ROOK', 0, -1, { player: 's0' });
		fx.ship(0, 1, { player: 's1', shipId: 'ship-s1' });
		fx.piece('r1', 'ROOK', 0, 1, { player: 's1' });

		const actions = createAiActions({
			io: { to: () => ({ emit() {} }) },
			gameManager: { ...fx.managers(), activityLog: null },
			broadcaster: { broadcastGameUpdate() {} },
			integrityService: { runIslandIntegrityPass() {} },
			spectatorRegistry: null,
			lineClearService: { runCascade: () => Promise.resolve() },
		});
		const last = {};
		let reversals = 0;
		let now = NOW;
		for (let tick = 0; tick < 40; tick++) {
			for (const seat of ['s0', 's1']) {
				const id = `ship-${seat}`;
				const before = entryOf(id);
				if (!before) continue;
				if (actions.maybeSail(seat, { now }) === 0) continue;
				const after = entryOf(id);
				const leg = { from: { x: before.x, z: before.z }, to: { x: after.x, z: after.z }, at: now };
				const prev = last[id];
				if (prev && now - prev.at < shipPlanner.REVERSAL_GUARD_MS
					&& prev.from.x === leg.to.x && prev.from.z === leg.to.z) reversals++;
				last[id] = leg;
			}
			now += 5000;
		}
		expect(reversals).toBe(0);
		expect(world.battles[fx.BATTLE_ID].fleet.voyages).toBeDefined();
	});
});

describe('every stop of a Quick-battle voyage must stay afloat', () => {
	beforeEach(() => {
		// Quick, but the sea has not started: nothing is sunk on the board;
		// sink times come from each test's fake grid.
		fx.vikingWorld({ mode: 'quick', bots: [1], startedAt: NOW });
		fx.strip(-3, 3, 0, 's0');
		fx.piece('k0', 'KING', -3, 0, { player: 's0' });
		fx.piece('b0', 'BISHOP', 3, 0, { player: 's0' });
		fx.strip(-2, 2, 10, 's1');
		fx.piece('k1', 'KING', 0, 10, { player: 's1' });
		fx.ship(8, 5, { player: 's1', shipId: 'raider' });
		fx.piece('r1', 'ROOK', 8, 5, { player: 's1' });
	});

	test('a dry destination whose first leg sinks in 1 s does not produce that leg', () => {
		const world = World.getWorld();
		const dry = fakeGrid(() => Infinity);
		const plan = shipPlanner.planVoyage(world, fx.battle(), entryOf('raider'), 's1', { now: NOW, grid: dry });
		expect(plan.kind).toBe('raid');
		const doomed = offset(plan.to);
		expect(plan.to).not.toEqual(plan.dest); // a multi-leg voyage: the first stop is en route
		const grid = fakeGrid((dx, dz) => (dx === doomed.dx && dz === doomed.dz ? NOW + 1000 : Infinity));
		const safe = shipPlanner.planVoyage(world, fx.battle(), entryOf('raider'), 's1', { now: NOW, grid });
		if (safe) {
			expect(safe.to).not.toEqual(plan.to);
			expect(grid.sinkAt(safe.to.x, safe.to.z)).toBe(Infinity);
		}
	});

	test('the homecoming leg is held to the same rule', () => {
		const world = World.getWorld();
		// Empty the ship: it now wants to come home alongside s1's land.
		world.chessPieces = world.chessPieces.filter(p => p.id !== 'r1');
		const cell = fx.cellAt(8, 5);
		cell.splice(0, cell.length, ...cell.filter(i => i.type !== 'chess'));
		const plan = shipPlanner.planVoyage(world, fx.battle(), entryOf('raider'), 's1', { now: NOW, grid: fakeGrid(() => Infinity) });
		expect(plan.kind).toBe('home');
		const doomed = offset(plan.to);
		const grid = fakeGrid((dx, dz) => (dx === doomed.dx && dz === doomed.dz ? NOW + 1000 : Infinity));
		const safe = shipPlanner.planVoyage(world, fx.battle(), entryOf('raider'), 's1', { now: NOW, grid });
		if (safe) expect(safe.to).not.toEqual(plan.to);
	});
});

describe('a moored ship flees before it is boxed in', () => {
	beforeEach(() => {
		fx.vikingWorld({ mode: 'quick', bots: [1], startedAt: NOW });
		World.getWorld().players.s1.minMoveInterval = 5000;
		fx.piece('k1', 'KING', 0, 0, { player: 's1' });
		fx.piece('k0', 'KING', -6, 0, { player: 's0' });
		fx.land(10, 0, 's1');
		fx.ship(10, 1, { player: 's1', shipId: 'moored' });
	});

	const neighbours = [[11, 1], [9, 1], [10, 2]];
	const sinks = closeIn => (dx, dz) => {
		if (dx === 10 && dz === 1) return NOW + 35 * 1000; // own square
		if (neighbours.some(([nx, nz]) => nx === dx && nz === dz)) return NOW + closeIn;
		return NOW + 200 * 1000;
	};

	test('its exits sink 27 s before its own square: it sails for open water now', () => {
		const grid = fakeGrid(sinks(8 * 1000));
		const plan = shipPlanner.planVoyage(World.getWorld(), fx.battle(), entryOf('moored'), 's1', { now: NOW, moveIntervalMs: 5000, grid });
		expect(plan).toMatchObject({ kind: 'flee' });
		expect(grid.sinkAt(plan.to.x, plan.to.z)).toBeGreaterThan(NOW + 35 * 1000);
	});

	test('a channel a few squares off closing counts too, not only the squares alongside', () => {
		// Open water all round the ship, but a wall of land at dx = 7
		// with one gap at (7, 1): the gap sinks in 8 s, the far side late.
		for (let dz = -14; dz <= 14; dz++) if (dz !== 1) fx.land(7, dz, 's0');
		const grid = fakeGrid((dx, dz) => {
			if (dx === 10 && dz === 1) return NOW + 35 * 1000;
			if (dx === 7 && dz === 1) return NOW + 8 * 1000;
			return dx < 7 ? NOW + 200 * 1000 : NOW + 36 * 1000;
		});
		const plan = shipPlanner.planVoyage(World.getWorld(), fx.battle(), entryOf('moored'), 's1', { now: NOW, moveIntervalMs: 5000, grid });
		expect(plan).toMatchObject({ kind: 'flee' });
		expect(plan.dest.x - fx.CENTRE.x).toBeLessThan(7);
	});

	test('control: exits that outlast the horizon leave it at its mooring', () => {
		const grid = fakeGrid(sinks(30 * 1000));
		expect(shipPlanner.planVoyage(World.getWorld(), fx.battle(), entryOf('moored'), 's1', { now: NOW, moveIntervalMs: 5000, grid })).toBeNull();
	});

	test('standard sea timing is untouched for classic battles: no sea, no flight', () => {
		fx.battle().mode = 'classic';
		const grid = fakeGrid(sinks(1000));
		expect(shipPlanner.planVoyage(World.getWorld(), fx.battle(), entryOf('moored'), 's1', { now: NOW, moveIntervalMs: 5000, grid })).toBeNull();
		expect(shipAt(fx.cellAt(10, 1)).shipId).toBe('moored');
	});
});
