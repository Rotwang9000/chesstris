/**
 * Bots captaining longships in the SHARED world (worldShipPlanner.js,
 * actions.maybeSail's world branch):
 *
 *   • raid: a laden ship closes on the nearest kingdom whose ruler is
 *     online, then sails to a moored square its passenger can land from
 *     with a capture worth the risk — and stays there for the landing;
 *   • away rulers are never raided: a laden ship with no online target
 *     comes home;
 *   • pickup: an empty ship fetches a raider ashore before its clock
 *     runs out, and the raider steps back aboard;
 *   • traps: a ship with land on three sides gets out, and no plan
 *     stops anywhere one block from trapped;
 *   • bounded: a voyage across a wide world stays cheap;
 *   • through maybeSail: one leg per tick, the human sail's follow-up
 *     (orbs, ship_sailed, the chess-move stamp), unhurried legs at the
 *     difficulty's sail chance, and harbour boarding by difficulty with
 *     the home guard kept.
 */

'use strict';

const World = require('../../server/world/World');
const Sessions = require('../../server/world/Sessions');
const worldShips = require('../../server/world/worldShips');
const planner = require('../../server/ai/worldShipPlanner');
const { createAiActions } = require('../../server/ai/actions');
const { makeShipItem, shipAt, isMoored } = require('../../server/battle/shipRules');
const { managers } = require('./shipFixtures');

const NOW = 10_000_000;
const BOT = 'b0';
const RIVAL = 'p1';

let online;

const cells = () => World.getWorld().board.cells;
const cellAt = (x, z) => cells()[`${x},${z}`] || null;
const getCell = (x, z) => cellAt(x, z);
const isOnline = pid => online.has(String(pid));

function land(x, z, player) {
	cells()[`${x},${z}`] = [{ type: 'tetromino', player, color: '#123456' }];
}

function piece(id, type, x, z, player, extra = {}) {
	const key = `${x},${z}`;
	if (!Array.isArray(cells()[key]) || cells()[key].length === 0) land(x, z, player);
	const record = { id, type, player, position: { x, z }, hasMoved: true, orientation: 0, moveCount: 0, forwardDistance: 0, ...extra };
	World.getWorld().chessPieces.push(record);
	cells()[key].push({ type: 'chess', player, pieceId: id, pieceType: type.toLowerCase() });
	return record;
}

function ship(x, z, player = BOT, shipId = 'w-bot', readyAt = 0) {
	const item = makeShipItem({ shipId, player, battleId: null, homeSeatId: player, readyAt });
	const key = `${x},${z}`;
	cells()[key] = [item, ...(cells()[key] || []).filter(it => it && it.type === 'chess')];
	return item;
}

/** A piece standing on the ship at (x, z) (its passenger). */
function passenger(id, type, x, z, player = BOT) {
	const record = { id, type, player, position: { x, z }, hasMoved: true, orientation: 0, moveCount: 0, forwardDistance: 0 };
	World.getWorld().chessPieces.push(record);
	cells()[`${x},${z}`].push({ type: 'chess', player, pieceId: id, pieceType: type.toLowerCase() });
	return record;
}

function findShip(shipId = 'w-bot') {
	for (const [key, contents] of Object.entries(cells())) {
		const s = shipAt(contents);
		if (s && s.shipId === shipId) {
			const [x, z] = key.split(',').map(Number);
			return { x, z, ship: s };
		}
	}
	return null;
}

/**
 * The bot's kingdom on x 0..7, z 0..1 (king at (4,0), a home guard of
 * rook, bishop and knight), and the rival's on x `rivalX`..+7, z 0..1
 * (king at rivalX+4, 1). Open water all round.
 */
function twoKingdoms({ rivalX = 30 } = {}) {
	World.resetWorld();
	const world = World.getWorld();
	world.players[BOT] = { id: BOT, name: 'Bot', isComputer: true, difficulty: 'hard', minMoveInterval: 5000, color: '#aa0000', moveCount: 0 };
	world.players[RIVAL] = { id: RIVAL, name: 'Rival', color: '#0000aa', moveCount: 0 };
	for (const [pid, x0, orientation] of [[BOT, 0, 0], [RIVAL, rivalX, 2]]) {
		world.homeZones[pid] = { x: x0, z: 0, width: 8, height: 2, orientation };
		for (let x = x0; x < x0 + 8; x++) {
			for (let z = 0; z < 2; z++) land(x, z, pid);
		}
	}
	piece('bk', 'KING', 4, 0, BOT);
	piece('br', 'ROOK', 0, 0, BOT);
	piece('bb', 'BISHOP', 2, 0, BOT);
	piece('bn2', 'KNIGHT', 6, 0, BOT);
	piece('rk', 'KING', rivalX + 4, 1, RIVAL);
	return world;
}

const entryOf = shipId => findShip(shipId);
const plan = (opts = {}) => planner.planWorldVoyage(World.getWorld(), entryOf('w-bot'), BOT, { now: NOW, isOnline, ...opts });

/** Sail the bot's ship plan after plan (5 s apart) until it rests; the stops it made. */
function voyage({ maxLegs = 30, memory = {} } = {}) {
	const stops = [];
	let now = NOW;
	for (let i = 0; i < maxLegs; i++) {
		const p = planner.planWorldVoyage(World.getWorld(), entryOf('w-bot'), BOT, { now, isOnline, memory });
		if (!p) break;
		const result = worldShips.sail(World.getWorld(), BOT, { shipId: 'w-bot', to: p.to }, { now });
		expect(result.success).toBe(true);
		memory['w-bot'] = p.memo;
		stops.push({ kind: p.kind, at: p.to });
		now += 5000;
	}
	return { stops, now };
}

beforeEach(() => {
	online = new Set([RIVAL]);
	worldShips.setEnabled(true);
	worldShips.resetBoundsCache();
	jest.spyOn(Sessions, 'isOnline').mockImplementation(isOnline);
	jest.spyOn(Sessions, 'emitToPlayerSockets').mockImplementation(() => 1);
	jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
	worldShips.setEnabled(null);
	jest.restoreAllMocks();
	jest.useRealTimers();
});

describe('worldShipPlanner', () => {
	test('a laden ship sails toward the online kingdom, then to a landing with a capture, and waits there', () => {
		twoKingdoms();
		piece('rr', 'ROOK', 31, 0, RIVAL);
		ship(3, -1);
		passenger('bn', 'KNIGHT', 3, -1);
		const first = plan();
		expect(first).toMatchObject({ kind: 'raid', urgent: false });
		expect(first.to.x === 3 || first.to.z === -1).toBe(true);

		const { stops } = voyage();
		expect(stops.length).toBeGreaterThan(1);
		expect(stops.every(s => s.kind === 'raid')).toBe(true);
		const end = findShip();
		// Moored where the knight can take the rook on landing.
		expect(isMoored(getCell, end.x, end.z)).toBe(true);
		const ctx = planner.worldContext(World.getWorld(), BOT, { now: NOW, isOnline });
		expect(planner.landingValue(ctx, end, World.getWorld().chessPieces.find(p => p.id === 'bn'))).toBeGreaterThan(0);
		expect(plan({ now: NOW + 60_000 })).toBeNull();
	});

	test('a defended victim is not worth the passenger', () => {
		twoKingdoms();
		piece('rp', 'PAWN', 31, 0, RIVAL);
		piece('rr', 'ROOK', 33, 0, RIVAL); // guards the pawn along the row
		ship(29, -1);
		passenger('bn', 'KNIGHT', 29, -1);
		const ctx = planner.worldContext(World.getWorld(), BOT, { now: NOW, isOnline });
		expect(planner.landingValue(ctx, { x: 29, z: -1 }, World.getWorld().chessPieces.find(p => p.id === 'bn'))).toBeLessThanOrEqual(0);
	});

	test('an away ruler is never raided: no target, so a laden ship at sea comes home', () => {
		twoKingdoms();
		piece('rr', 'ROOK', 31, 0, RIVAL);
		online.clear();
		ship(29, -1);
		passenger('bn', 'KNIGHT', 29, -1);
		const ctx = planner.worldContext(World.getWorld(), BOT, { now: NOW, isOnline });
		expect(ctx.enemies).toHaveLength(0);
		expect(plan()).toMatchObject({ kind: 'home' });
		const { stops } = voyage();
		expect(stops.every(s => s.kind === 'home')).toBe(true);
		const end = findShip();
		expect(planner.touchesOwnLand(getCell, end.x, end.z, BOT)).toBe(true);
	});

	test('a bot rival is always fair game (bots are never away)', () => {
		twoKingdoms();
		online.clear();
		World.getWorld().players[RIVAL].isComputer = true;
		ship(3, -1);
		passenger('bn', 'KNIGHT', 3, -1);
		expect(plan()).toMatchObject({ kind: 'raid', target: RIVAL });
	});

	test('an empty ship fetches a raider ashore, which can then step aboard', () => {
		twoKingdoms();
		piece('bn', 'KNIGHT', 32, 0, BOT, { raid: { startedAt: NOW, deadline: NOW + 120_000, captures: 1 } });
		ship(3, -1);
		const first = plan();
		expect(first).toMatchObject({ kind: 'pickup', urgent: true });
		const { stops } = voyage();
		expect(stops.every(s => s.kind === 'pickup')).toBe(true);
		const end = findShip();
		const ctx = planner.worldContext(World.getWorld(), BOT, { now: NOW, isOnline });
		expect(planner.canStepAboard(ctx, World.getWorld().chessPieces.find(p => p.id === 'bn'), end)).toBe(true);
	});

	test('an empty ship with nobody to fetch comes home', () => {
		twoKingdoms();
		ship(20, -6);
		expect(plan()).toMatchObject({ kind: 'home' });
		voyage();
		const end = findShip();
		expect(planner.touchesOwnLand(getCell, end.x, end.z, BOT)).toBe(true);
		expect(plan()).toBeNull();
	});

	test('a ship one block from trapped gets out, and no plan stops anywhere like that', () => {
		twoKingdoms();
		// A one-wide inlet cut into the bot's coast at x=10: land at
		// x 9 and 11 for z -3..-1, closed at z=0 by the island row.
		for (let z = -3; z <= 0; z++) { land(9, z, BOT); land(11, z, BOT); }
		land(10, 0, BOT);
		ship(10, -1);
		expect(planner.landSides(getCell, 10, -1)).toBe(3);
		const p = plan();
		expect(p).toMatchObject({ kind: 'escape', urgent: true });
		expect(planner.isSafeStop(getCell, p.to.x, p.to.z)).toBe(true);

		// And a raid voyage past the inlet never stops in it.
		piece('rr', 'ROOK', 31, 0, RIVAL);
		passenger('bn', 'KNIGHT', 10, -1);
		const { stops } = voyage();
		for (const s of stops) expect(planner.isSafeStop(getCell, s.at.x, s.at.z)).toBe(true);
	});

	test('a voyage search across a wide world stays bounded and quick', () => {
		twoKingdoms({ rivalX: 400 });
		ship(3, -1);
		passenger('bn', 'KNIGHT', 3, -1);
		// Out of raid range: home it is (already there).
		expect(plan()).toBeNull();
		World.getWorld().players[RIVAL].isComputer = true;
		land(200, 0, RIVAL);
		piece('rk2', 'KNIGHT', 200, 0, RIVAL);
		World.getWorld().chessPieces.find(p => p.id === 'rk').position = { x: 150, z: 1 };
		const t0 = Date.now();
		const p = plan();
		expect(Date.now() - t0).toBeLessThan(500);
		expect(p).toMatchObject({ kind: 'raid' });
	});

	test('mayLaunchRaid: one raider at a time, and the home guard stays', () => {
		twoKingdoms();
		expect(planner.mayLaunchRaid(World.getWorld(), BOT, getCell)).toBe(true);
		World.getWorld().chessPieces.find(p => p.id === 'bb').raid = { deadline: NOW + 1 };
		expect(planner.mayLaunchRaid(World.getWorld(), BOT, getCell)).toBe(false);
		delete World.getWorld().chessPieces.find(p => p.id === 'bb').raid;
		World.getWorld().chessPieces = World.getWorld().chessPieces.filter(p => p.id !== 'bb');
		expect(planner.mayLaunchRaid(World.getWorld(), BOT, getCell)).toBe(false);
	});
});

describe('maybeSail and chess moves in the world', () => {
	let emitted;
	let claims;
	let actions;

	beforeEach(() => {
		jest.useFakeTimers({ now: NOW });
		emitted = [];
		claims = [];
		const io = { to: room => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }) };
		actions = createAiActions({
			io,
			gameManager: { ...managers(), activityLog: null },
			broadcaster: { broadcastGameUpdate: () => {} },
			integrityService: { runIslandIntegrityPass: () => {} },
			spectatorRegistry: null,
			lineClearService: { runCascade: () => Promise.resolve() },
			powerUpManager: { claimBySail: (world, pid, from, to) => { claims.push({ pid, from, to }); return []; } },
		});
	});

	test('one raid leg per tick, followed up exactly like a human sail', () => {
		twoKingdoms();
		piece('rr', 'ROOK', 31, 0, RIVAL);
		ship(3, -1);
		passenger('bn', 'KNIGHT', 3, -1);
		expect(actions.maybeSail(BOT, { now: NOW, random: () => 0, isOnline })).toBe(1);
		const after = findShip();
		expect(after.x !== 3 || after.z !== -1).toBe(true);
		const sailed = emitted.find(e => e.event === 'ship_sailed');
		expect(sailed.payload).toMatchObject({ shipId: 'w-bot', world: true, from: { x: 3, z: -1 }, to: { x: after.x, z: after.z } });
		expect(claims).toEqual([{ pid: BOT, from: { x: 3, z: -1 }, to: { x: after.x, z: after.z } }]);
		const bot = World.getPlayer(BOT);
		expect(bot.lastChessMoveAt).toBe(NOW);
		expect(bot.moveCount).toBe(1);
		// Still rowing: nothing this instant.
		expect(actions.maybeSail(BOT, { now: NOW + 1000, random: () => 0, isOnline })).toBe(0);
	});

	test('unhurried legs sail at the difficulty\'s sail chance; pickups always', () => {
		twoKingdoms();
		ship(3, -1);
		passenger('bn', 'KNIGHT', 3, -1);
		expect(actions.maybeSail(BOT, { now: NOW, random: () => 0.99, isOnline })).toBe(0);
		World.getWorld().chessPieces = World.getWorld().chessPieces.filter(p => p.id !== 'bn');
		cells()['3,-1'] = cells()['3,-1'].filter(it => it.type !== 'chess');
		piece('bn', 'KNIGHT', 32, 0, BOT, { raid: { startedAt: NOW, deadline: NOW + 120_000, captures: 0 } });
		expect(actions.maybeSail(BOT, { now: NOW, random: () => 0.99, isOnline })).toBe(1);
	});

	test('battle-free world without world ships: nothing sails', () => {
		twoKingdoms();
		ship(3, -1);
		passenger('bn', 'KNIGHT', 3, -1);
		worldShips.setEnabled(false);
		expect(actions.maybeSail(BOT, { now: NOW, random: () => 0, isOnline })).toBe(0);
	});

	test('a full raid: board, sail, land with a capture, step back aboard', () => {
		twoKingdoms();
		piece('rr', 'ROOK', 31, 0, RIVAL);
		// The empty ship at home, alongside the knight that will board it.
		ship(4, -1);
		jest.spyOn(Math, 'random').mockReturnValue(0);
		let now = NOW;
		const tick = () => { now += 6000; jest.setSystemTime(now); };

		// Board (a quiet move: no capture on offer at home).
		expect(actions.performStrategicChessMove(BOT, null, null)).toBe(true);
		const aboard = World.getWorld().chessPieces.find(p => p.position.x === 4 && p.position.z === -1);
		expect(aboard).toBeTruthy();
		expect(planner.RAIDER_TYPES).toContain(aboard.type);

		// Sail until the ship rests at a landing.
		let legs = 0;
		for (; legs < 30; legs++) {
			tick();
			if (actions.maybeSail(BOT, { now, random: () => 0, isOnline }) === 0) break;
		}
		expect(legs).toBeGreaterThan(0);
		expect(actions.prefersChessMove(BOT)).toBe(true);

		// Land with the capture: the rook is gone and the raid clock runs.
		tick();
		expect(actions.performStrategicChessMove(BOT, null, null)).toBe(true);
		expect(World.getWorld().chessPieces.some(p => p.id === 'rr')).toBe(false);
		const raider = World.getWorld().chessPieces.find(p => p.id === aboard.id);
		expect(raider.raid).toBeTruthy();
		expect(raider.position).toEqual({ x: 31, z: 0 });

		// The empty ship waits (the raider can step aboard from here)...
		tick();
		expect(actions.maybeSail(BOT, { now, random: () => 0, isOnline })).toBe(0);
		// ...and the raider, nothing left to take, steps back aboard.
		expect(actions.performStrategicChessMove(BOT, null, null)).toBe(true);
		const back = World.getWorld().chessPieces.find(p => p.id === aboard.id);
		expect(shipAt(cellAt(back.position.x, back.position.z))).toMatchObject({ shipId: 'w-bot' });
		expect(back.raid).toBeUndefined();
	});

	test('no boarding when every kingdom in reach has an away ruler', () => {
		twoKingdoms();
		online.clear();
		ship(4, -1);
		jest.spyOn(Math, 'random').mockReturnValue(0);
		for (let i = 0; i < 5; i++) {
			jest.setSystemTime(NOW + i * 6000);
			actions.performStrategicChessMove(BOT, null, null);
			expect(shipAt(cellAt(4, -1))).toBeTruthy();
			expect(World.getWorld().chessPieces.some(p => p.position.x === 4 && p.position.z === -1)).toBe(false);
		}
	});
});
