/**
 * Viking longships — the shared post-move hook (ships.afterPieceMoved),
 * exercised through BOTH move paths: the human `chess_move` socket
 * handler and the bots' `applyChessMove`. Each must classify embark /
 * land / raid / seize / boarded identically, flip the ship's owner,
 * put `ship` on the `chess_move` broadcast and announce `ship_seized`
 * to the battle's humans.
 */

'use strict';

const World = require('../../server/world/World');
const Sessions = require('../../server/world/Sessions');
const { registerChessHandlers } = require('../../server/sockets/chess');
const { createAiActions } = require('../../server/ai/actions');
const { shipAt } = require('../../server/battle/shipRules');
const ships = require('../../server/battle/ships');
const {
	at, managers, vikingWorld, battle, land, ship, piece, cellAt,
} = require('./shipFixtures');

let gm;
let io;
let seatEvents;

function fakeIo() {
	const emitted = [];
	return { emitted, to: room => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }) };
}

const stubs = () => ({
	broadcaster: { broadcastGameUpdate() {}, emitFullStateTo() {}, emitCapturedBasket() {} },
	integrityService: { runIslandIntegrityPass: () => ({ changed: false, decayCells: [] }) },
	spectatorRegistry: { broadcastUpdate() {} },
});

/** The human path: chess_move through the real handler, acting as `seat`. */
function humanMove(seat, pieceId, dx, dz) {
	const handlers = new Map();
	const socket = {
		id: `sock-${seat}`, on: (e, fn) => handlers.set(e, fn), emit() {},
		to: () => ({ emit() {} }),
	};
	registerChessHandlers(socket, {
		playerId: seat === 's0' ? 'h0' : 'h1',
		resolveActingPlayerId: () => seat,
		io,
		gameManager: gm,
		...stubs(),
		kingCaptureService: {},
		kingDetonationService: {},
		checkService: null,
		activityLog: null,
	});
	let ack = null;
	handlers.get('chess_move')({ pieceId, targetPosition: at(dx, dz) }, r => { ack = r; });
	return ack;
}

const lastChessMove = () => io.emitted.filter(e => e.event === 'chess_move').pop()?.payload;
const seized = () => seatEvents.filter(e => e.event === 'ship_seized');

beforeEach(() => {
	vikingWorld();
	gm = { ...managers(), activityLog: null };
	io = fakeIo();
	seatEvents = [];
	jest.spyOn(Sessions, 'emitToPlayerSockets').mockImplementation((playerId, event, payload) => {
		seatEvents.push({ playerId, event, payload });
		return 1;
	});
	// Keep both seats alive and far away.
	piece('k0', 'KING', -10, -10);
	piece('k1', 'KING', 10, 10, { player: 's1' });
});

afterEach(() => jest.restoreAllMocks());

describe('human chess_move', () => {
	test('embark onto your own ship', () => {
		piece('r', 'ROOK', 0, 0);
		ship(1, 0, { shipId: 'mine' });
		expect(humanMove('s0', 'r', 1, 0)).toMatchObject({ success: true });
		expect(lastChessMove().ship).toEqual({ kind: 'embark', shipId: 'mine' });
		expect(shipAt(cellAt(1, 0)).player).toBe('s0');
		expect(seized()).toHaveLength(0);
		expect(cellAt(1, 0).map(i => i.type).sort()).toEqual(['chess', 'ship']);
	});

	test('seize an enemy empty ship: it becomes yours and the battle hears of it', () => {
		piece('r', 'ROOK', 0, 0);
		ship(1, 0, { shipId: 'theirs', player: 's1' });
		expect(humanMove('s0', 'r', 1, 0)).toMatchObject({ success: true });
		expect(lastChessMove().ship).toEqual({ kind: 'seize', shipId: 'theirs' });
		expect(shipAt(cellAt(1, 0)).player).toBe('s0');
		expect(seized().map(e => e.playerId).sort()).toEqual(['h0', 'h1']);
		expect(seized()[0].payload).toMatchObject({
			shipId: 'theirs', from: 's1', to: 's0', byPieceId: 'r', kind: 'seize', at: at(1, 0), capturedPieceId: null,
		});
	});

	test('the next battle sweep reports the loser\'s ship lost as "seized"', () => {
		piece('r', 'ROOK', 0, 0);
		ship(1, 0, { shipId: 'theirs', player: 's1' });
		const world = World.getWorld();
		ships.reconcileShips(world, battle(), { now: Date.now() }); // learn the fleet
		expect(humanMove('s0', 'r', 1, 0)).toMatchObject({ success: true });
		ships.reconcileShips(world, battle(), { now: Date.now() });
		const lost = seatEvents.filter(e => e.event === 'ship_lost').map(e => e.payload);
		expect(lost[0]).toMatchObject({ shipId: 'theirs', seatId: 's1', reason: 'seized' });
	});

	test('capture the passenger: boarded, and the ship changes hands', () => {
		ship(1, 0, { shipId: 'theirs', player: 's1' });
		piece('victim', 'BISHOP', 1, 0, { player: 's1' });
		piece('r', 'ROOK', 0, 0);
		expect(humanMove('s0', 'r', 1, 0)).toMatchObject({ success: true });
		expect(lastChessMove().ship).toEqual({ kind: 'boarded', shipId: 'theirs' });
		expect(lastChessMove().capturedPiece).toMatchObject({ id: 'victim' });
		expect(shipAt(cellAt(1, 0)).player).toBe('s0');
		expect(seized()[0].payload).toMatchObject({ kind: 'boarded', capturedPieceId: 'victim' });
		expect(World.getWorld().chessPieces.some(p => p.id === 'victim')).toBe(false);
	});

	test('land on enemy soil, and raid it', () => {
		ship(0, 0, { shipId: 'mine' });
		land(1, 0, 's1');
		land(1, 1, 's1');
		piece('q', 'QUEEN', 0, 0);
		piece('foe', 'KNIGHT', 1, 1, { player: 's1' });
		expect(humanMove('s0', 'q', 1, 0)).toMatchObject({ success: true });
		expect(lastChessMove().ship).toEqual({ kind: 'land', shipId: 'mine', landOwner: 's1' });
		// The ship stays behind, empty, still ours.
		expect(cellAt(0, 0).map(i => i.type)).toEqual(['ship']);
		expect(shipAt(cellAt(0, 0)).player).toBe('s0');

		// Back aboard (wait out the move cooldown), then off again with a capture.
		World.getPlayer('s0').lastChessMoveAt = 0;
		expect(humanMove('s0', 'q', 0, 0)).toMatchObject({ success: true });
		expect(lastChessMove().ship.kind).toBe('embark');
		World.getPlayer('s0').lastChessMoveAt = 0;
		expect(humanMove('s0', 'q', 1, 1)).toMatchObject({ success: true });
		expect(lastChessMove().ship).toMatchObject({ kind: 'raid', shipId: 'mine' });
	});

	test('a refused ship move names the rule it broke', () => {
		piece('n', 'KNIGHT', 0, 0);
		ship(2, 1, { shipId: 'adrift' }); // not touching land
		expect(humanMove('s0', 'n', 2, 1)).toMatchObject({ success: false, reason: 'ship_not_moored' });
		World.getPlayer('s0').lastChessMoveAt = 0;
		piece('p', 'PAWN', 4, 4, { orientation: 0 });
		ship(4, 5, { shipId: 'quay' });
		expect(humanMove('s0', 'p', 4, 5)).toMatchObject({ success: false, reason: 'cannot_board' });
	});

	test('standard battles: chess_move has no ship field at all', () => {
		battle().edition = 'standard';
		piece('r', 'ROOK', 0, 0);
		land(1, 0);
		expect(humanMove('s0', 'r', 1, 0)).toMatchObject({ success: true });
		expect(Object.prototype.hasOwnProperty.call(lastChessMove(), 'ship')).toBe(false);
	});
});

describe('bot applyChessMove', () => {
	function bot() {
		World.getPlayer('s1').isComputer = true;
		World.getPlayer('s1').strategy = { aggressiveness: 1, defensiveness: 0.5, buildSpeed: 0.5, kingProtection: 0.5 };
		return createAiActions({
			io,
			gameManager: gm,
			...stubs(),
			lineClearService: { runCascade: () => Promise.resolve() },
		});
	}

	test('a bot knight seizes an empty enemy ship — same classification and event', () => {
		// The knight's only legal move is the L onto s0's moored ship.
		piece('n1', 'KNIGHT', 0, 0, { player: 's1' });
		ship(1, 2, { shipId: 'mine', player: 's0' });
		land(2, 2, 's0');
		expect(bot().performStrategicChessMove('s1', null, null)).toBe(true);
		expect(lastChessMove()).toMatchObject({ playerId: 's1', ship: { kind: 'seize', shipId: 'mine' } });
		expect(shipAt(cellAt(1, 2)).player).toBe('s1');
		expect(seized()[0].payload).toMatchObject({ shipId: 'mine', from: 's0', to: 's1', byPieceId: 'n1' });
	});

	test('a bot boards a laden ship by capturing the passenger', () => {
		piece('n1', 'KNIGHT', 0, 0, { player: 's1' });
		ship(1, 2, { shipId: 'mine', player: 's0' });
		land(2, 2, 's0');
		piece('crew', 'ROOK', 1, 2);
		expect(bot().performStrategicChessMove('s1', null, null)).toBe(true);
		expect(lastChessMove().ship).toEqual({ kind: 'boarded', shipId: 'mine' });
		expect(shipAt(cellAt(1, 2)).player).toBe('s1');
	});
});
