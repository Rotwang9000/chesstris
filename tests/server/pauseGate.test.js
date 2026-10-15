/**
 * Paused players are "away" and protected.
 *
 * The pause feature (see `server/world/pause.js`) freezes a player's
 * zone, cells and pieces and makes them immune to capture/decay. The
 * user reported they could still *play* while paused — which would turn
 * pause into a free invulnerability shield. These tests lock in the
 * server-side gate that rejects a paused player's chess moves and
 * tetromino placements with `reason: 'paused'` before any board state
 * is touched.
 */

const path = require('path');

const World = require(path.join('..', '..', 'server', 'world', 'World'));
const { registerChessHandlers } = require(path.join('..', '..', 'server', 'sockets', 'chess'));
const { registerTetrominoHandlers } = require(path.join('..', '..', 'server', 'sockets', 'tetromino'));

function makeFakeSocket(playerId) {
	const handlers = new Map();
	const emitted = [];
	return {
		id: `socket-${playerId}`,
		_emitted: emitted,
		on(event, handler) { handlers.set(event, handler); },
		emit(event, payload) { emitted.push({ event, payload }); },
		to() { return { emit() { /* no-op */ } }; },
		trigger(event, data, callback) {
			const handler = handlers.get(event);
			if (!handler) throw new Error(`No handler registered for ${event}`);
			return handler(data, callback);
		},
	};
}

function makeMinimalCtx(playerId, socket) {
	// The pause gate runs before any gameManager/broadcaster use, so a
	// skeleton context is enough to exercise it without standing up the
	// whole game stack.
	return {
		playerId,
		io: { to() { return { emit() {} }; } },
		gameManager: {},
		broadcaster: { broadcastGameUpdate() {} },
		integrityService: { runIslandIntegrityPass() {} },
		spectatorRegistry: { broadcastUpdate() {} },
		activityLog: { record() {}, recordChessMove() {} },
		kingCaptureService: {},
		kingDuelService: {},
		kingDetonationService: {},
		checkService: null,
		lineClearService: { runCascade: () => Promise.resolve({}) },
		socket,
	};
}

describe('paused players cannot act', () => {
	beforeEach(() => {
		World.resetWorld({ id: 'global_game' });
		World.upsertPlayer('p1', { color: 0xff0000 });
	});

	test('a paused player\'s chess move is rejected with reason=paused', () => {
		const player = World.getPlayer('p1');
		player.paused = true;

		const socket = makeFakeSocket('p1');
		registerChessHandlers(socket, makeMinimalCtx('p1', socket));

		let ack = null;
		socket.trigger(
			'chess_move',
			{ pieceId: 'p1-K', targetPosition: { x: 1, z: 0 } },
			(r) => { ack = r; },
		);

		expect(ack).toMatchObject({ success: false, reason: 'paused' });
		// The dedicated failure event carries the reason too, so an
		// older client without the ack path still surfaces it.
		const failed = socket._emitted.find(e => e.event === 'chessFailed');
		expect(failed).toBeDefined();
		expect(failed.payload).toMatchObject({ reason: 'paused' });
	});

	test('resuming lets the chess handler proceed past the pause gate', () => {
		const player = World.getPlayer('p1');
		player.paused = false; // resumed

		const socket = makeFakeSocket('p1');
		registerChessHandlers(socket, makeMinimalCtx('p1', socket));

		let ack = null;
		socket.trigger(
			'chess_move',
			{ pieceId: 'phantom', targetPosition: { x: 1, z: 0 } },
			(r) => { ack = r; },
		);

		// It gets past the pause gate — the rejection is now about the
		// (missing) piece, NOT about being paused.
		expect(ack.success).toBe(false);
		expect(ack.reason).not.toBe('paused');
	});

	test('a paused player\'s tetromino placement is rejected with reason=paused', () => {
		const player = World.getPlayer('p1');
		player.paused = true;

		const socket = makeFakeSocket('p1');
		registerTetrominoHandlers(socket, makeMinimalCtx('p1', socket));

		let ack = null;
		socket.trigger(
			'tetromino_placed',
			{ tetromino: { type: 'I', cells: [] } },
			(r) => { ack = r; },
		);

		expect(ack).toMatchObject({ success: false, reason: 'paused' });
		const failed = socket._emitted.find(e => e.event === 'tetrominoFailed');
		expect(failed).toBeDefined();
		expect(failed.payload).toMatchObject({ reason: 'paused' });
	});

	test('an eliminated player can no longer make chess moves', () => {
		const player = World.getPlayer('p1');
		player.eliminated = true;

		const socket = makeFakeSocket('p1');
		registerChessHandlers(socket, makeMinimalCtx('p1', socket));

		let ack = null;
		socket.trigger(
			'chess_move',
			{ pieceId: 'p1-K', targetPosition: { x: 1, z: 0 } },
			(r) => { ack = r; },
		);

		expect(ack).toMatchObject({ success: false, reason: 'eliminated' });
		const failed = socket._emitted.find(e => e.event === 'chessFailed');
		expect(failed).toBeDefined();
		expect(failed.payload).toMatchObject({ reason: 'eliminated' });
	});

	test('an eliminated player can no longer place tetrominoes', () => {
		const player = World.getPlayer('p1');
		player.eliminated = true;

		const socket = makeFakeSocket('p1');
		registerTetrominoHandlers(socket, makeMinimalCtx('p1', socket));

		let ack = null;
		socket.trigger(
			'tetromino_placed',
			{ tetromino: { type: 'I', cells: [] } },
			(r) => { ack = r; },
		);

		expect(ack).toMatchObject({ success: false, reason: 'eliminated' });
		const failed = socket._emitted.find(e => e.event === 'tetrominoFailed');
		expect(failed).toBeDefined();
		expect(failed.payload).toMatchObject({ reason: 'eliminated' });
	});
});

describe('a paused player\'s cells are frozen', () => {
	test('an opponent may stand on a paused player\'s cell but does not take it', () => {
		const GameManager = require(path.join('..', '..', 'server', 'game', 'GameManager'));
		World.resetWorld({ id: 'global_game' });
		World.upsertPlayer('p1', { color: 1 });
		World.upsertPlayer('p2', { color: 2, paused: true });
		const world = World.getWorld();
		world.board.cells['0,0'] = [
			{ type: 'tetromino', player: 'p1' },
			{ type: 'chess', player: 'p1', pieceId: 'r1', pieceType: 'rook' },
		];
		world.chessPieces.push({ id: 'r1', type: 'ROOK', player: 'p1', position: { x: 0, z: 0 } });
		world.board.cells['1,0'] = [{ type: 'tetromino', player: 'p2' }];
		world.board.cells['2,0'] = [{ type: 'tetromino', player: 'p2' }];

		const socket = makeFakeSocket('p1');
		registerChessHandlers(socket, {
			...makeMinimalCtx('p1', socket),
			gameManager: new GameManager(),
			activityLog: null,
		});
		let ack = null;
		socket.trigger('chess_move', { pieceId: 'r1', targetPosition: { x: 2, z: 0 } }, (r) => { ack = r; });

		expect(ack).toMatchObject({ success: true });
		const cell = world.board.cells['2,0'];
		expect(cell.find(i => i.type === 'tetromino')).toMatchObject({ player: 'p2' });
		expect(cell.find(i => i.type === 'chess')).toMatchObject({ player: 'p1', pieceId: 'r1' });
	});
});

describe('a paused player cannot detonate or promote', () => {
	beforeEach(() => {
		World.resetWorld({ id: 'global_game' });
		World.upsertPlayer('p1', { color: 0xff0000, paused: true });
		World.getWorld().chessPieces.push({ id: 'p1-P', type: 'PAWN', player: 'p1', position: { x: 0, z: 0 }, forwardDistance: 99 });
	});

	test.each([
		['detonate_pawn', { pieceId: 'p1-P' }],
		['promote_pawn', { pieceId: 'p1-P' }],
		['redeem_promotion', { capturedType: 'QUEEN' }],
		['deploy_promotion', { pawnId: 'p1-P', capturedType: 'QUEEN' }],
	])('%s is refused with reason=paused', (event, data) => {
		const socket = makeFakeSocket('p1');
		registerChessHandlers(socket, makeMinimalCtx('p1', socket));
		let ack = null;
		socket.trigger(event, data, (r) => { ack = r; });
		expect(ack).toMatchObject({ success: false, reason: 'paused' });
		expect(World.getWorld().chessPieces.find(p => p.id === 'p1-P')).toMatchObject({ type: 'PAWN' });
	});
});
