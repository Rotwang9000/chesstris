/**
 * Longships in the shared world (server/world/worldShips.js):
 *
 *   • off unless switched on — the live world is untouched;
 *   • each kingdom's first ship moors behind its queen's start square,
 *     a lost ship is reported and rebuilt after RESPAWN_MS;
 *   • sailing: up to 8 squares, never into the battle-arena region,
 *     never far out past the world's land;
 *   • chess moves meet the same ship rules as Viking battles;
 *   • raids: landing away from your king starts a clock, captures
 *     extend it, getting back aboard ends it, running out loses the piece;
 *   • away rulers: raiders may visit but take neither pieces, ground nor
 *     ships;
 *   • a frozen pawn on the coast can be launched as a longship.
 */

'use strict';

const World = require('../../server/world/World');
const Sessions = require('../../server/world/Sessions');
const worldShips = require('../../server/world/worldShips');
const { createWorldShipService } = require('../../server/world/worldShipService');
const { registerChessHandlers } = require('../../server/sockets/chess');
const { registerBoatHandlers } = require('../../server/sockets/boats');
const { shipAt, makeShipItem, SHIP } = require('../../server/battle/shipRules');
const { managers } = require('./shipFixtures');

const { WORLD_SHIP } = worldShips;

let gm;
let io;
let online;
let personal;

function fakeIo() {
	const emitted = [];
	return { emitted, to: room => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }) };
}

const cells = () => World.getWorld().board.cells;
const cellAt = (x, z) => cells()[`${x},${z}`] || null;

function land(x, z, player) {
	cells()[`${x},${z}`] = [{ type: 'tetromino', player, color: '#123456' }];
}

function piece(id, type, x, z, player, extra = {}) {
	const world = World.getWorld();
	const key = `${x},${z}`;
	if (!Array.isArray(world.board.cells[key]) || world.board.cells[key].length === 0) land(x, z, player);
	const record = { id, type, player, position: { x, z }, hasMoved: true, orientation: 0, moveCount: 0, forwardDistance: 0, ...extra };
	world.chessPieces.push(record);
	world.board.cells[key].push({ type: 'chess', player, pieceId: id, pieceType: type.toLowerCase() });
	return record;
}

function ship(x, z, player, shipId = 'w-a', readyAt = 0) {
	cells()[`${x},${z}`] = [makeShipItem({ shipId, player, battleId: null, homeSeatId: player, readyAt })];
}

/**
 * Two kingdoms: p0's home zone at (0,0) facing +z (queen starts at
 * (3,0)), p1's island at x 20..27 facing -z. Kings far apart.
 */
function twoKingdoms() {
	World.resetWorld();
	const world = World.getWorld();
	for (const [pid, zone] of [['p0', { x: 0, z: 0, width: 8, height: 2, orientation: 0 }],
		['p1', { x: 20, z: 0, width: 8, height: 2, orientation: 2 }]]) {
		world.players[pid] = { id: pid, name: pid.toUpperCase(), color: pid === 'p0' ? '#aa0000' : '#0000aa', moveCount: 0 };
		world.homeZones[pid] = zone;
		for (let x = zone.x; x < zone.x + 8; x++) {
			for (let z = zone.z; z < zone.z + 2; z++) land(x, z, pid);
		}
	}
	piece('k0', 'KING', 4, 0, 'p0');
	piece('k1', 'KING', 24, 1, 'p1');
	return world;
}

function socketFor(playerId, register) {
	const handlers = new Map();
	const socket = { id: `sock-${playerId}`, on: (e, fn) => handlers.set(e, fn), emit() {}, to: () => ({ emit() {} }) };
	register(socket, {
		playerId,
		io,
		gameManager: gm,
		broadcaster: { broadcastGameUpdate() {}, emitFullStateTo() {}, emitCapturedBasket() {} },
		integrityService: { runIslandIntegrityPass: () => ({ changed: false, decayCells: [] }) },
		spectatorRegistry: { broadcastUpdate() {} },
		kingCaptureService: {},
		kingDetonationService: {},
		checkService: null,
		activityLog: null,
		persistence: { markDirty() {} },
	});
	return handlers;
}

function call(playerId, register, event, data) {
	let ack = null;
	socketFor(playerId, register).get(event)(data, r => { ack = r; });
	return ack;
}

const move = (pid, pieceId, x, z) => call(pid, registerChessHandlers, 'chess_move', { pieceId, targetPosition: { x, z } });
const sail = (pid, shipId, x, z) => call(pid, registerBoatHandlers, 'ship_sail', { shipId, to: { x, z } });
const pieceById = id => World.getWorld().chessPieces.find(p => p.id === id) || null;

function service() {
	return createWorldShipService({ gameManager: gm, broadcaster: { broadcastGameUpdate() {} }, persistence: { markDirty() {} }, io });
}

beforeEach(() => {
	twoKingdoms();
	gm = { ...managers(), activityLog: null };
	io = fakeIo();
	online = new Set(['p0', 'p1']);
	personal = [];
	worldShips.setEnabled(true);
	worldShips.resetBoundsCache();
	jest.spyOn(Sessions, 'isOnline').mockImplementation(pid => online.has(String(pid)));
	jest.spyOn(Sessions, 'emitToPlayerSockets').mockImplementation((playerId, event, payload) => {
		personal.push({ playerId, event, payload });
		return 1;
	});
});

afterEach(() => {
	worldShips.setEnabled(null);
	jest.restoreAllMocks();
});

describe('switch', () => {
	test('off: no rules, no sweep, sailing refused', () => {
		worldShips.setEnabled(false);
		expect(worldShips.appliesTo(World.getWorld(), 'p0')).toBe(false);
		expect(service().tick()).toBeNull();
		ship(3, -1, 'p0');
		expect(sail('p0', 'w-a', 3, -3)).toMatchObject({ success: false, reason: 'not_viking' });
	});

	test('battle seats are never world players', () => {
		World.getWorld().players.seat = { id: 'seat', battleId: 'b1' };
		expect(worldShips.appliesTo(World.getWorld(), 'seat')).toBe(false);
	});
});

describe('fleet upkeep', () => {
	test('first ship moors behind the queen start square, at once', () => {
		const result = service().tick(1000);
		expect(result.built.map(b => b.playerId).sort()).toEqual(['p0', 'p1']);
		expect(shipAt(cellAt(3, -1))).toMatchObject({ player: 'p0', world: true });
		// p1 faces -z: queen starts at (23, 1), so behind is (23, 2).
		expect(shipAt(cellAt(23, 2))).toMatchObject({ player: 'p1', world: true });
		expect(shipAt(cellAt(3, -1)).battleId).toBeUndefined();
	});

	test('a lost ship is reported, then rebuilt after RESPAWN_MS', () => {
		const svc = service();
		svc.tick(1000);
		delete cells()['3,-1'];
		svc.tick(2000);
		const lost = personal.filter(e => e.event === 'ship_lost');
		expect(lost).toHaveLength(1);
		expect(lost[0].payload).toMatchObject({ seatId: 'p0', reason: 'destroyed', rebuildAt: 2000 + WORLD_SHIP.RESPAWN_MS });
		svc.tick(2000 + WORLD_SHIP.RESPAWN_MS - 1);
		expect(shipAt(cellAt(3, -1))).toBeNull();
		svc.tick(2000 + WORLD_SHIP.RESPAWN_MS);
		expect(shipAt(cellAt(3, -1))).toMatchObject({ player: 'p0' });
		expect(personal.some(e => e.event === 'ship_built' && e.playerId === 'p0')).toBe(true);
	});

	test('ships of a kingdom that is gone sink quietly', () => {
		service().tick(1000);
		World.getWorld().players.p1.eliminated = true;
		service().tick(1500);
		expect(shipAt(cellAt(23, 2))).toBeNull();
	});
});

describe('sailing', () => {
	beforeEach(() => ship(3, -1, 'p0'));

	test('up to 8 squares in a line, then it rows', () => {
		expect(sail('p0', 'w-a', 3, -10)).toMatchObject({ success: false, reason: 'bad_sail' });
		const ack = sail('p0', 'w-a', 3, -9);
		expect(ack).toMatchObject({ success: true, to: { x: 3, z: -9 } });
		expect(shipAt(cellAt(3, -9))).toMatchObject({ player: 'p0' });
		expect(cellAt(3, -1)).toBeNull();
		World.getPlayer('p0').lastChessMoveAt = 0; // the sail was the chess move
		expect(sail('p0', 'w-a', 3, -8)).toMatchObject({ success: false, reason: 'ship_rowing' });
		expect(io.emitted.some(e => e.event === 'ship_sailed')).toBe(true);
	});

	test('not someone else\'s ship', () => {
		expect(sail('p1', 'w-a', 3, -4)).toMatchObject({ success: false, reason: 'not_your_ship' });
	});

	test('not far out past the land', () => {
		// Land spans z 0..1, margin 12: z = -12 is the last sea square.
		const world = World.getWorld();
		const env = worldShips.worldEnv(world);
		expect(env.isInsidePlayArea(3, -12)).toBe(true);
		expect(env.isInsidePlayArea(3, -13)).toBe(false);
	});

	test('never into the battle-arena region', () => {
		const { isBattleRegionCell } = require('../../server/battle/geometry');
		const env = worldShips.worldEnv(World.getWorld());
		// Find a battle-region square and check it is never water.
		expect(isBattleRegionCell(2000, 2000)).toBe(true);
		expect(env.isInsidePlayArea(2000, 2000)).toBe(false);
	});
});

describe('chess moves meet the ship rules', () => {
	test('a rook steps aboard its own moored ship; a slider cannot pass over it', () => {
		ship(8, 0, 'p0');
		land(9, 0, 'p0');
		land(10, 0, 'p0');
		piece('r', 'ROOK', 7, 0, 'p0');
		const rook = pieceById('r');
		expect(gm.chessManager.isValidChessMove(World.getWorld(), rook, 10, 0)).toBe(false);
		expect(move('p0', 'r', 8, 0)).toMatchObject({ success: true });
		expect(cellAt(8, 0).map(i => i.type).sort()).toEqual(['chess', 'ship']);
	});

	test('pawns cannot board', () => {
		ship(2, 2, 'p0');
		piece('pw', 'PAWN', 2, 1, 'p0');
		expect(gm.chessManager.isValidChessMove(World.getWorld(), pieceById('pw'), 2, 2)).toBe(false);
	});
});

describe('raids', () => {
	/** A p0 rook aboard p0's ship moored against p1's island at (19, 0). */
	function rookOffTheirCoast() {
		ship(19, 0, 'p0', 'w-r');
		piece('r', 'ROOK', 19, 0, 'p0');
		piece('n1', 'KNIGHT', 20, 1, 'p1'); // p1 has the home square row 0..1
	}

	test('landing away from your king starts the clock; a capture extends it', () => {
		rookOffTheirCoast();
		const t0 = Date.now();
		expect(move('p0', 'r', 20, 0)).toMatchObject({ success: true });
		const rook = pieceById('r');
		expect(rook.raid).toBeTruthy();
		expect(rook.raid.deadline).toBeGreaterThanOrEqual(t0 + WORLD_SHIP.RAID_BASE_MS);
		const before = rook.raid.deadline;
		// Capture the knight next door.
		piece('n2', 'KNIGHT', 21, 0, 'p1');
		World.getWorld().players.p0.lastChessMoveAt = 0;
		expect(move('p0', 'r', 21, 0)).toMatchObject({ success: true });
		expect(pieceById('r').raid.deadline).toBe(before + WORLD_SHIP.RAID_PER_CAPTURE_MS);
		expect(pieceById('r').raid.captures).toBe(1);
	});

	test('the clock running out loses the raider', () => {
		rookOffTheirCoast();
		expect(move('p0', 'r', 20, 0)).toMatchObject({ success: true });
		const deadline = pieceById('r').raid.deadline;
		const svc = service();
		svc.tick(deadline - 1);
		expect(pieceById('r')).not.toBeNull();
		svc.tick(deadline);
		expect(pieceById('r')).toBeNull();
		expect(io.emitted.find(e => e.event === 'raid_expired').payload).toMatchObject({ pieceId: 'r', playerId: 'p0' });
	});

	test('stepping back aboard your own ship stops the clock', () => {
		rookOffTheirCoast();
		expect(move('p0', 'r', 20, 0)).toMatchObject({ success: true });
		World.getWorld().players.p0.lastChessMoveAt = 0;
		expect(move('p0', 'r', 19, 0)).toMatchObject({ success: true });
		expect(pieceById('r').raid).toBeUndefined();
	});
});

describe('away rulers', () => {
	function raiderNextToKnight() {
		ship(19, 0, 'p0', 'w-r');
		piece('r', 'ROOK', 19, 0, 'p0');
		piece('n1', 'KNIGHT', 20, 0, 'p1');
	}

	test('an offline ruler\'s pieces cannot be taken by raiders', () => {
		raiderNextToKnight();
		online.delete('p1');
		const ack = move('p0', 'r', 20, 0);
		expect(ack).toMatchObject({ success: false, reason: 'away_ruler' });
		expect(pieceById('n1')).not.toBeNull();
	});

	test('online, the same capture stands', () => {
		raiderNextToKnight();
		expect(move('p0', 'r', 20, 0)).toMatchObject({ success: true });
		expect(pieceById('n1')).toBeNull();
	});

	test('visiting an away ruler\'s land leaves the ground theirs', () => {
		ship(19, 0, 'p0', 'w-r');
		piece('r', 'ROOK', 19, 0, 'p0');
		online.delete('p1');
		expect(move('p0', 'r', 20, 0)).toMatchObject({ success: true });
		const ground = cellAt(20, 0).filter(i => i.type !== 'chess');
		expect(ground.every(i => i.player === 'p1')).toBe(true);
	});

	test('an away ruler\'s ship cannot be seized', () => {
		ship(8, 0, 'p1', 'theirs');
		piece('r', 'ROOK', 7, 0, 'p0');
		online.delete('p1');
		expect(move('p0', 'r', 8, 0)).toMatchObject({ success: false, reason: 'away_ruler' });
		online.add('p1');
		World.getWorld().players.p0.lastChessMoveAt = 0;
		expect(move('p0', 'r', 8, 0)).toMatchObject({ success: true });
		expect(shipAt(cellAt(8, 0)).player).toBe('p0');
		expect(io.emitted.some(e => e.event === 'ship_seized')).toBe(true);
	});

	test('bots are never away', () => {
		World.getWorld().players.p1.isComputer = true;
		raiderNextToKnight();
		online.delete('p1');
		expect(move('p0', 'r', 20, 0)).toMatchObject({ success: true });
	});
});

describe('pawn launches a longship', () => {
	test('a frozen pawn beside water becomes a ship; no water, no launch', () => {
		piece('pw', 'PAWN', 0, 1, 'p0', { awaitingPromotion: true });
		// (-1, 1) and (-1, 2), (0, 2) ... are open water beside the pawn.
		const ack = call('p0', registerChessHandlers, 'launch_promotion_ship', { pawnId: 'pw' });
		expect(ack).toMatchObject({ success: true });
		expect(pieceById('pw')).toBeNull();
		expect(shipAt(cellAt(ack.x, ack.z))).toMatchObject({ player: 'p0', world: true });
		expect(Math.max(Math.abs(ack.x - 0), Math.abs(ack.z - 1))).toBe(1);
		expect(cellAt(0, 1)).not.toBeNull(); // the ground stays
		expect(io.emitted.some(e => e.event === 'ship_launched')).toBe(true);
	});

	test('the fleet is capped', () => {
		for (let i = 0; i < WORLD_SHIP.MAX_PER_PLAYER; i++) ship(-5, -5 - i * 2, 'p0', `w-${i}`);
		piece('pw', 'PAWN', 0, 1, 'p0', { awaitingPromotion: true });
		expect(call('p0', registerChessHandlers, 'launch_promotion_ship', { pawnId: 'pw' }))
			.toMatchObject({ success: false, reason: 'fleet_full' });
	});
});

test('row lock constant is shared with battles', () => {
	expect(SHIP.ROW_LOCK_MS).toBe(3000);
	expect(WORLD_SHIP.SAIL_MAX).toBe(8);
});

describe('ship orbs', () => {
	const { createPowerUpManager } = require('../../server/game/PowerUpManager');
	function manager() {
		return createPowerUpManager({ io, broadcaster: { broadcastGameUpdate() {} }, persistence: { markDirty() {} } });
	}

	test('claiming a ship orb launches a longship on the nearest water', () => {
		World.getWorld().powerUps = [{ id: 'orb-s', x: 8, z: 0, pieceType: 'SHIP', spawnedAt: 0, expiresAt: Date.now() + 60000 }];
		const result = manager().tryClaimAtCell(World.getWorld(), 'p0', 8, 0);
		expect(result.ship).toBeTruthy();
		expect(shipAt(cellAt(result.ship.x, result.ship.z))).toMatchObject({ player: 'p0', world: true });
		expect(io.emitted.find(e => e.event === 'powerup_claimed').payload).toMatchObject({ pieceType: 'SHIP', playerId: 'p0' });
		expect(World.getWorld().powerUps).toHaveLength(0);
	});

	test('fleet full: the orb gives a knight instead', () => {
		for (let i = 0; i < WORLD_SHIP.MAX_PER_PLAYER; i++) ship(-5, -5 - i * 2, 'p0', `w-${i}`);
		World.getWorld().powerUps = [{ id: 'orb-s', x: 8, z: 0, pieceType: 'SHIP', spawnedAt: 0, expiresAt: Date.now() + 60000 }];
		const result = manager().tryClaimAtCell(World.getWorld(), 'p0', 8, 0);
		expect(result.piece).toMatchObject({ type: 'KNIGHT', player: 'p0' });
	});
});
