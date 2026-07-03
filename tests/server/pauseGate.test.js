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
