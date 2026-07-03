/**
 * Integration tests for the chess-capture pipeline.
 *
 * The user reported: knight click → knight visually disappeared → ~30s
 * later a "Your knight was captured!" message appeared and a dissolve
 * animation played in the wrong place. Root cause was a tangle of
 * silent server-side capture paths plus a client that never received
 * an authoritative capture-cell signal. The fix:
 *
 *   1. `server/sockets/chess.js` now routes captures through
 *      `pieces.removePiece` (mandatory activity-log emission).
 *   2. The handler emits a dedicated `chess_capture` socket event with
 *      the precise server cell so clients can play a flash / fade
 *      animation at the right place rather than guessing.
 *   3. The broadcast `chess_move` now carries the capture position so
 *      the client toast can say *where* a piece was lost.
 *   4. `server/ai/actions.js` does the same: AI captures emit
 *      `chess_capture` + record `chess_piece_captured` activity.
 *   5. `chessFailed` payloads keep `reason: piece_gone` so the client
 *      knows to drop the optimistic mesh instead of trying to revert
 *      to a phantom source cell.
 *
 * These tests run the real `registerChessHandlers` against a fake
 * socket so we exercise the live code path.
 */

const path = require('path');

const World = require(path.join('..', '..', 'server', 'world', 'World'));
const BoardManager = require(path.join('..', '..', 'server', 'game', 'BoardManager'));
const IslandManager = require(path.join('..', '..', 'server', 'game', 'IslandManager'));
const ChessManager = require(path.join('..', '..', 'server', 'game', 'ChessManager'));
const TetrominoManager = require(path.join('..', '..', 'server', 'game', 'TetrominoManager'));
const { registerChessHandlers } = require(path.join('..', '..', 'server', 'sockets', 'chess'));
const { createAiActions } = require(path.join('..', '..', 'server', 'ai', 'actions'));

function makeFakeSocket(playerId) {
	const handlers = new Map();
	const emitted = [];
	return {
		id: `socket-${playerId}`,
		_handlers: handlers,
		_emitted: emitted,
		on(event, handler) { handlers.set(event, handler); },
		emit(event, payload) { emitted.push({ event, payload }); },
		to() { return { emit() { /* no-op for socket.to(roomId) */ } }; },
		trigger(event, data, callback) {
			const handler = handlers.get(event);
			if (!handler) throw new Error(`No handler registered for ${event}`);
			return handler(data, callback);
		},
	};
}

function makeFakeIo() {
	const emitted = [];
	return {
		_emitted: emitted,
		to(roomId) {
			return {
				emit(event, payload) {
					emitted.push({ room: roomId, event, payload });
				},
			};
		},
	};
}

function makeActivityLogStub() {
	const events = [];
	return {
		_events: events,
		record(type, payload) { events.push({ type, payload }); },
		recordTetrominoPlaced() { /* not needed here */ },
		recordTetrominoDissolved() { /* not needed here */ },
		recordChessMove(payload) { events.push({ type: 'chess_move', payload }); },
		recordRowsCleared() { /* not needed */ },
		recordIslandDecayed() { /* not needed */ },
		recordTerritoryCaptured(payload) { events.push({ type: 'territory_captured', payload }); },
		recordKingDetonation() { /* not needed */ },
		recordPieceLost(payload) { events.push({ type: 'chess_piece_lost', payload }); },
		recordPiecesLost() { /* not needed */ },
		recordPieceCaptured(payload) { events.push({ type: 'chess_piece_captured', payload }); },
		recordPieceDetonated() { /* not needed */ },
		recordPiecePromoted() { /* not needed */ },
		recordPlayerJoined() { /* not needed */ },
		recordPlayerLeft() { /* not needed */ },
		recordChat() { /* not needed */ },
	};
}

function makeBroadcasterStub() {
	const calls = [];
	return {
		_calls: calls,
		broadcastGameUpdate(opts) { calls.push({ method: 'broadcastGameUpdate', opts }); },
		emitFullStateTo() { /* not needed */ },
		emitIslandDecayAnimation() { /* not needed */ },
		emitToPlayer() { /* not needed */ },
	};
}

function makeIntegrityServiceStub() {
	return {
		runIslandIntegrityPass() { return { changed: false, decayCells: [] }; },
		processWorldIntegrityMaintenance() { /* not needed */ },
	};
}

function makeSpectatorRegistryStub() {
	return { broadcastUpdate() { /* not needed */ } };
}

function makeKingServicesStub() {
	return {
		kingCaptureService: { executeKingCapture() { /* not needed */ } },
		kingDuelService: { startDuel() { return null; } },
		kingDetonationService: { detonateKing() { return { success: true }; } },
	};
}

function placeChessPiece(world, boardManager, id, type, player, x, z, color) {
	const piece = {
		id,
		type,
		player,
		position: { x, z },
		color: color || 0x4488ff,
		hasMoved: false,
		moveCount: 0,
		orientation: 0,
	};
	world.chessPieces.push(piece);
	const existing = boardManager.getCell(world.board, x, z) || [];
	existing.push({
		type: 'chess',
		player,
		pieceId: id,
		pieceType: String(type).toLowerCase(),
		color: piece.color,
	});
	boardManager.setCell(world.board, x, z, existing);
	return piece;
}

function attachHomeMarker(world, boardManager, playerId, x, z) {
	const existing = boardManager.getCell(world.board, x, z) || [];
	existing.unshift({ type: 'home', player: playerId });
	boardManager.setCell(world.board, x, z, existing);
}

describe('server/sockets/chess — capture event flow', () => {
	let boardManager;
	let islandManager;
	let chessManager;
	let tetrominoManager;
	let activityLog;
	let io;
	let broadcaster;
	let integrityService;

	function buildCtx(playerId, extraCtx = {}) {
		const socket = makeFakeSocket(playerId);
		const gameManager = {
			boardManager,
			islandManager,
			chessManager,
			tetrominoManager,
			activityLog,
		};
		const ctx = {
			playerId,
			io,
			gameManager,
			broadcaster,
			integrityService,
			...makeKingServicesStub(),
			spectatorRegistry: makeSpectatorRegistryStub(),
			activityLog,
			...extraCtx,
		};
		registerChessHandlers(socket, ctx);
		return { socket, ctx };
	}

	beforeEach(() => {
		World.resetWorld({ id: 'global_game' });
		boardManager = new BoardManager();
		islandManager = new IslandManager();
		chessManager = new ChessManager(boardManager, islandManager);
		tetrominoManager = new TetrominoManager(boardManager, islandManager);
		activityLog = makeActivityLogStub();
		chessManager.activityLog = activityLog;
		io = makeFakeIo();
		broadcaster = makeBroadcasterStub();
		integrityService = makeIntegrityServiceStub();

		// Two players, each with a king and a piece next to each other so
		// a single move is a capture.
		World.upsertPlayer('p1', { color: 0xff0000 });
		World.upsertPlayer('p2', { color: 0x0000ff });
		const world = World.getWorld();
		placeChessPiece(world, boardManager, 'p1-K', 'KING', 'p1', 0, 0);
		placeChessPiece(world, boardManager, 'p2-K', 'KING', 'p2', 10, 0);
		attachHomeMarker(world, boardManager, 'p1', 0, 0);
		attachHomeMarker(world, boardManager, 'p2', 10, 0);
	});

	test('captures emit `chess_capture` with the precise server cell', () => {
		const world = World.getWorld();
		// p1's rook at (3, 5), enemy pawn directly in its file at (3, 7).
		const rook = placeChessPiece(world, boardManager, 'p1-R', 'ROOK', 'p1', 3, 5);
		const pawn = placeChessPiece(world, boardManager, 'p2-P', 'PAWN', 'p2', 3, 7);
		// Make sure rook movement is unobstructed: synthesize an empty
		// chain of bridging cells so isValidChessMove(rook, 3, 7) passes.
		boardManager.setCell(world.board, 3, 6, [{ type: 'tetromino', player: 'p1' }]);

		// Override ChessManager's stricter validation to a simple
		// adjacency check — `isValidChessMove` has dozens of guards we
		// don't want to fight here; the capture flow is what's under
		// test.
		jest.spyOn(chessManager, 'isValidChessMove').mockReturnValue(true);

		const { socket } = buildCtx('p1');
		let ackResult = null;
		socket.trigger(
			'chess_move',
			{ pieceId: 'p1-R', targetPosition: { x: 3, z: 7 } },
			(result) => { ackResult = result; },
		);

		expect(ackResult).toMatchObject({ success: true });
		// Rook moved to capture cell.
		expect(rook.position).toEqual({ x: 3, z: 7 });
		// Pawn is gone from world.chessPieces.
		expect(world.chessPieces.find(p => p.id === 'p2-P')).toBeUndefined();

		const captureEmit = io._emitted.find(e => e.event === 'chess_capture');
		expect(captureEmit).toBeDefined();
		expect(captureEmit.payload).toMatchObject({
			at: { x: 3, z: 7 },
			capturedPiece: {
				id: 'p2-P',
				type: 'PAWN',
				player: 'p2',
				position: { x: 3, z: 7 },
			},
			capturedBy: {
				playerId: 'p1',
				pieceId: 'p1-R',
				pieceType: 'rook',
			},
		});

		const moveEmit = io._emitted.find(e => e.event === 'chess_move');
		expect(moveEmit).toBeDefined();
		expect(moveEmit.payload).toMatchObject({
			playerId: 'p1',
			movedFrom: { x: 3, z: 5 },
			movedTo: { x: 3, z: 7 },
			capturedPiece: { id: 'p2-P', position: { x: 3, z: 7 } },
		});
	});

	test('captures record `chess_piece_captured` in the activity log', () => {
		const world = World.getWorld();
		placeChessPiece(world, boardManager, 'p1-R', 'ROOK', 'p1', 3, 5);
		placeChessPiece(world, boardManager, 'p2-P', 'PAWN', 'p2', 3, 7);
		boardManager.setCell(world.board, 3, 6, [{ type: 'tetromino', player: 'p1' }]);
		jest.spyOn(chessManager, 'isValidChessMove').mockReturnValue(true);

		const { socket } = buildCtx('p1');
		socket.trigger(
			'chess_move',
			{ pieceId: 'p1-R', targetPosition: { x: 3, z: 7 } },
			() => { /* ack ignored */ },
		);

		const capturedEvent = activityLog._events.find(e => e.type === 'chess_piece_captured');
		expect(capturedEvent).toBeDefined();
		expect(capturedEvent.payload).toMatchObject({
			playerId: 'p2',
			pieceType: 'pawn',
			pieceId: 'p2-P',
			x: 3,
			z: 7,
			reason: 'captured',
			capturedBy: {
				playerId: 'p1',
				pieceType: 'rook',
				pieceId: 'p1-R',
			},
		});
	});

	test('starting a check consumes the chess-move cooldown (H7)', () => {
		const world = World.getWorld();
		// p1 rook lined up to attack p2's king at (10, 0).
		placeChessPiece(world, boardManager, 'p1-R', 'ROOK', 'p1', 10, 3);
		boardManager.setCell(world.board, 10, 2, [{ type: 'tetromino', player: 'p1' }]);
		boardManager.setCell(world.board, 10, 1, [{ type: 'tetromino', player: 'p1' }]);
		jest.spyOn(chessManager, 'isValidChessMove').mockReturnValue(true);

		let startCheckCalls = 0;
		const checkService = {
			CHECK_DEADLINE_MS: 20000,
			startCheck() { startCheckCalls++; return true; },
			validateEscape() { return { valid: false }; },
			cancelCheck() { /* noop */ },
			expireCheck() { /* noop */ },
		};

		const { socket } = buildCtx('p1', { checkService });

		let firstAck = null;
		socket.trigger(
			'chess_move',
			{ pieceId: 'p1-R', targetPosition: { x: 10, z: 0 } },
			(r) => { firstAck = r; },
		);
		// Attack deferred into a check, and the attacker's cooldown is now
		// stamped.
		expect(firstAck).toMatchObject({ success: true, check: true });
		expect(startCheckCalls).toBe(1);
		expect(Number.isFinite(World.getPlayer('p1').lastChessMoveAt)).toBe(true);

		// An immediate follow-up move is rate-limited — no check spam.
		let secondAck = null;
		socket.trigger(
			'chess_move',
			{ pieceId: 'p1-R', targetPosition: { x: 10, z: 0 } },
			(r) => { secondAck = r; },
		);
		expect(secondAck).toMatchObject({ success: false, error: 'rate_limited' });
		expect(startCheckCalls).toBe(1); // second attempt never reached startCheck
	});

	test('`chessFailed` preserves reason=piece_gone so the client can react', () => {
		const world = World.getWorld();
		placeChessPiece(world, boardManager, 'p1-R', 'ROOK', 'p1', 3, 5);
		// Don't add the target piece — but we'll attempt to capture a
		// non-existent piece id. Pre-conditions: the server has to find
		// the user's own piece (so the user can move at all) but the
		// target capture is a no-op. Easier reproduction: have the
		// user try to move a piece id that's *not* in chessPieces.
		jest.spyOn(chessManager, 'isValidChessMove').mockReturnValue(true);

		const { socket } = buildCtx('p1');
		let ackResult = null;
		socket.trigger(
			'chess_move',
			{ pieceId: 'phantom-rook', targetPosition: { x: 3, z: 6 } },
			(result) => { ackResult = result; },
		);

		expect(ackResult).toMatchObject({
			success: false,
			reason: 'piece_gone',
		});

		// Server should also emit a `chessFailed` socket event with the
		// reason intact, so the client can react via the dedicated
		// handler even if the ack-callback path were ever to break.
		const failedEmit = socket._emitted.find(e => e.event === 'chessFailed');
		expect(failedEmit).toBeDefined();
		expect(failedEmit.payload).toMatchObject({ reason: 'piece_gone' });
	});

	test('ChessManager.executeChessMove routes capture through pieces.removePiece', () => {
		const world = World.getWorld();
		const rook = placeChessPiece(world, boardManager, 'p1-R', 'ROOK', 'p1', 3, 5);
		placeChessPiece(world, boardManager, 'p2-P', 'PAWN', 'p2', 3, 7);
		boardManager.setCell(world.board, 3, 6, [{ type: 'tetromino', player: 'p1' }]);

		// Force validation through by stubbing the public entry point —
		// ChessManager's full validateChessMove is exhaustively tested
		// elsewhere; here we only care that the *capture path* delegates
		// to `pieces.removePiece` and emits an activity event.
		jest.spyOn(chessManager, 'validateChessMove').mockReturnValue({
			valid: true,
			piece: rook,
			fromX: 3, fromZ: 5, toX: 3, toZ: 7,
			targetCell: boardManager.getCell(world.board, 3, 7),
		});

		const result = chessManager.executeChessMove(world, 'p1', {
			pieceId: 'p1-R',
			fromX: 3, fromZ: 5, toX: 3, toZ: 7,
		});

		expect(result.success).toBe(true);
		expect(result.capture).toBe(true);
		expect(world.chessPieces.find(p => p.id === 'p2-P')).toBeUndefined();
		const capturedEvent = activityLog._events.find(e => e.type === 'chess_piece_captured');
		expect(capturedEvent).toBeDefined();
		expect(capturedEvent.payload).toMatchObject({
			pieceId: 'p2-P',
			reason: 'captured',
		});
	});
});

describe('server/ai/actions — captures emit chess_capture + activity events', () => {
	let boardManager;
	let islandManager;
	let chessManager;
	let tetrominoManager;
	let activityLog;
	let io;
	let broadcaster;
	let integrityService;
	let lineClearService;

	beforeEach(() => {
		World.resetWorld({ id: 'global_game' });
		boardManager = new BoardManager();
		islandManager = new IslandManager();
		chessManager = new ChessManager(boardManager, islandManager);
		tetrominoManager = new TetrominoManager(boardManager, islandManager);
		activityLog = makeActivityLogStub();
		chessManager.activityLog = activityLog;
		io = makeFakeIo();
		broadcaster = makeBroadcasterStub();
		integrityService = makeIntegrityServiceStub();
		lineClearService = { runCascade: () => Promise.resolve({}) };

		World.upsertPlayer('ai-1', { color: 0x00ff00, isComputer: true });
		World.upsertPlayer('p2', { color: 0x0000ff });
	});

	test('AI capture emits `chess_capture` and records `chess_piece_captured`', () => {
		const world = World.getWorld();
		const aiQueen = placeChessPiece(world, boardManager, 'ai-Q', 'QUEEN', 'ai-1', 4, 4);
		placeChessPiece(world, boardManager, 'p2-R', 'ROOK', 'p2', 6, 6);
		// Bridge cells so connectivity checks don't reject the move.
		boardManager.setCell(world.board, 5, 5, [{ type: 'tetromino', player: 'ai-1' }]);

		jest.spyOn(chessManager, 'isValidChessMove').mockImplementation((w, p, tx, tz) => {
			// AI's chess move loop picks pieces and targets at random;
			// allow only the queen → rook attack.
			return p?.id === 'ai-Q' && tx === 6 && tz === 6;
		});

		const aiActions = createAiActions({
			io,
			gameManager: {
				boardManager,
				islandManager,
				chessManager,
				tetrominoManager,
				activityLog,
			},
			broadcaster,
			integrityService,
			spectatorRegistry: makeSpectatorRegistryStub(),
			lineClearService,
		});

		aiActions.performStrategicChessMove('ai-1', { executeKingCapture() { /* noop */ } });

		expect(world.chessPieces.find(p => p.id === 'p2-R')).toBeUndefined();
		expect(aiQueen.position).toEqual({ x: 6, z: 6 });

		const captureEmit = io._emitted.find(e => e.event === 'chess_capture');
		expect(captureEmit).toBeDefined();
		expect(captureEmit.payload).toMatchObject({
			at: { x: 6, z: 6 },
			capturedPiece: { id: 'p2-R', position: { x: 6, z: 6 } },
			capturedBy: { playerId: 'ai-1' },
		});

		const capturedEvent = activityLog._events.find(e => e.type === 'chess_piece_captured');
		expect(capturedEvent).toBeDefined();
		expect(capturedEvent.payload).toMatchObject({
			playerId: 'p2',
			pieceId: 'p2-R',
			x: 6,
			z: 6,
		});
	});

	test('AI pawn freezes at the promotion threshold (H5)', () => {
		const world = World.getWorld();
		// Orientation 0 → forward is +z. One step short of the 8-square
		// promotion walk, so a single forward move trips the freeze.
		const pawn = placeChessPiece(world, boardManager, 'ai-P', 'PAWN', 'ai-1', 4, 4);
		pawn.forwardDistance = 7;
		// Destination cell must exist for the AI's target picker.
		boardManager.setCell(world.board, 4, 5, [{ type: 'tetromino', player: 'ai-1' }]);

		jest.spyOn(chessManager, 'isValidChessMove').mockImplementation((w, p, tx, tz) =>
			p?.id === 'ai-P' && tx === 4 && tz === 5
		);

		const aiActions = createAiActions({
			io,
			gameManager: {
				boardManager, islandManager, chessManager, tetrominoManager, activityLog,
			},
			broadcaster,
			integrityService,
			spectatorRegistry: makeSpectatorRegistryStub(),
			lineClearService,
		});

		aiActions.performStrategicChessMove('ai-1', { executeKingCapture() { /* noop */ } });

		expect(pawn.position).toEqual({ x: 4, z: 5 });
		expect(pawn.forwardDistance).toBe(8);
		// Frozen — both the piece and its cell marker carry the flag.
		expect(pawn.awaitingPromotion).toBe(true);
		const marker = boardManager.getCell(world.board, 4, 5)
			.find(it => it && it.type === 'chess' && it.pieceId === 'ai-P');
		expect(marker).toBeDefined();
		expect(marker.awaitingPromotion).toBe(true);

		// A frozen pawn is the AI's only piece → the next chess turn finds
		// no movable piece and reports "no move" rather than dragging the
		// locked pawn around.
		const movedAgain = aiActions.performStrategicChessMove('ai-1', { executeKingCapture() { /* noop */ } });
		expect(movedAgain).toBe(false);
		expect(pawn.position).toEqual({ x: 4, z: 5 });
	});
});
