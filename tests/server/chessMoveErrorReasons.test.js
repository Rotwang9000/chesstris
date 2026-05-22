/**
 * Tests for `server/sockets/chess.js` rejection reasons.
 *
 * The user reported "every move comes up Invalid chess move". The
 * server now distinguishes
 *
 *   - `destination_missing` — the target square no longer exists on
 *     the live board (race with line-clear / island decay). The
 *     server pushes a fresh game_update so the client's next click
 *     is against the current state.
 *   - `invalid_geometry` — the geometry of the move is illegal for
 *     the chosen piece type.
 *
 * These tests exercise the live `registerChessHandlers` against a
 * fake socket + io so the wire payloads are real.
 */

const path = require('path');

const World = require(path.join('..', '..', 'server', 'world', 'World'));
const BoardManager = require(path.join('..', '..', 'server', 'game', 'BoardManager'));
const IslandManager = require(path.join('..', '..', 'server', 'game', 'IslandManager'));
const ChessManager = require(path.join('..', '..', 'server', 'game', 'ChessManager'));
const TetrominoManager = require(path.join('..', '..', 'server', 'game', 'TetrominoManager'));
const { registerChessHandlers } = require(path.join('..', '..', 'server', 'sockets', 'chess'));

function makeSocket(playerId) {
	const handlers = new Map();
	const emitted = [];
	return {
		id: `socket-${playerId}`,
		_emitted: emitted,
		on(event, handler) { handlers.set(event, handler); },
		emit(event, payload) { emitted.push({ event, payload }); },
		to() { return { emit() {} }; },
		trigger(event, data, cb) {
			const handler = handlers.get(event);
			if (!handler) throw new Error(`No handler for ${event}`);
			return handler(data, cb);
		},
	};
}

function makeIo() {
	const emitted = [];
	return {
		_emitted: emitted,
		to() { return { emit(event, payload) { emitted.push({ event, payload }); } }; },
	};
}

function makeActivityStub() {
	return {
		record() {},
		recordChessMove() {},
		recordRowsCleared() {},
		recordIslandDecayed() {},
		recordTerritoryCaptured() {},
		recordPieceLost() {},
		recordPiecesLost() {},
		recordPieceCaptured() {},
		recordPieceDetonated() {},
		recordPiecePromoted() {},
		recordTetrominoPlaced() {},
		recordTetrominoDissolved() {},
		recordKingDetonation() {},
		recordPlayerJoined() {},
		recordPlayerLeft() {},
		recordChat() {},
	};
}

function makeBroadcasterStub() {
	const calls = [];
	return {
		_calls: calls,
		broadcastGameUpdate(opts) { calls.push({ method: 'broadcastGameUpdate', opts }); },
		emitFullStateTo() {},
		emitIslandDecayAnimation() {},
		emitToPlayer() {},
	};
}

function makeIntegrityStub() {
	return {
		runIslandIntegrityPass() { return { changed: false, decayCells: [] }; },
		processWorldIntegrityMaintenance() {},
	};
}

function makeSpectatorRegistryStub() { return { broadcastUpdate() {} }; }

function makeKingServicesStub() {
	return {
		kingCaptureService: { executeKingCapture() {} },
		kingDuelService: { startDuel() { return null; } },
		kingDetonationService: { detonateKing() { return { success: true }; } },
	};
}

function placePiece(world, boardManager, id, type, player, x, z) {
	const piece = {
		id, type, player,
		position: { x, z },
		hasMoved: false,
		moveCount: 0,
		orientation: 0,
		color: 0x4488ff,
	};
	world.chessPieces.push(piece);
	const existing = boardManager.getCell(world.board, x, z) || [];
	existing.push({
		type: 'chess',
		player,
		pieceId: id,
		pieceType: String(type).toLowerCase(),
	});
	boardManager.setCell(world.board, x, z, existing);
	return piece;
}

describe('server/sockets/chess — rejection reasons', () => {
	let boardManager;
	let islandManager;
	let chessManager;
	let tetrominoManager;
	let activityLog;
	let io;
	let broadcaster;
	let integrityService;

	function buildCtx(playerId) {
		const socket = makeSocket(playerId);
		const gameManager = {
			boardManager, islandManager, chessManager, tetrominoManager, activityLog,
		};
		registerChessHandlers(socket, {
			playerId, io, gameManager,
			broadcaster, integrityService,
			...makeKingServicesStub(),
			spectatorRegistry: makeSpectatorRegistryStub(),
			activityLog,
		});
		return socket;
	}

	beforeEach(() => {
		World.resetWorld({ id: 'global_game' });
		boardManager = new BoardManager();
		islandManager = new IslandManager();
		chessManager = new ChessManager(boardManager, islandManager);
		tetrominoManager = new TetrominoManager(boardManager, islandManager);
		activityLog = makeActivityStub();
		chessManager.activityLog = activityLog;
		io = makeIo();
		broadcaster = makeBroadcasterStub();
		integrityService = makeIntegrityStub();

		World.upsertPlayer('p1', { color: 0xff0000 });
		World.upsertPlayer('p2', { color: 0x0000ff });
		const world = World.getWorld();
		placePiece(world, boardManager, 'p1-K', 'KING', 'p1', 0, 0);
		placePiece(world, boardManager, 'p2-K', 'KING', 'p2', 10, 0);
	});

	test('destination_missing reason when the target square does not exist', () => {
		const world = World.getWorld();
		// Build a short row of cells for the rook to potentially use.
		for (let x = 0; x <= 4; x++) {
			boardManager.setCell(world.board, x, 1, [{ type: 'tetromino', player: 'p1' }]);
		}
		placePiece(world, boardManager, 'p1-R', 'ROOK', 'p1', 0, 1);

		const socket = buildCtx('p1');
		let ack = null;
		socket.trigger('chess_move',
			{ pieceId: 'p1-R', targetPosition: { x: 0, z: 10 } },
			(result) => { ack = result; },
		);

		expect(ack).toEqual(expect.objectContaining({
			success: false,
			reason: 'destination_missing',
		}));

		const failEmit = socket._emitted.find(e => e.event === 'chessFailed');
		expect(failEmit).toBeDefined();
		expect(failEmit.payload.reason).toBe('destination_missing');
		expect(failEmit.payload.attempted).toEqual({ x: 0, z: 10 });

		// The server should have pushed a fresh snapshot so the client
		// can drop the stale highlight that pointed at the missing cell.
		expect(broadcaster._calls.find(c =>
			c.method === 'broadcastGameUpdate' && c.opts?.forceFullUpdate === true
		)).toBeDefined();
	});

	test('bad_geometry reason when target exists but move is geometrically wrong', () => {
		const world = World.getWorld();
		// Rook on (0,0), target (3,3) — geometry rejection (rook can't
		// move diagonally) but the cell exists.
		for (let x = 0; x <= 5; x++) {
			for (let z = 0; z <= 5; z++) {
				const cell = boardManager.getCell(world.board, x, z);
				if (!cell) boardManager.setCell(world.board, x, z, [{ type: 'tetromino', player: 'p1' }]);
			}
		}
		placePiece(world, boardManager, 'p1-R', 'ROOK', 'p1', 0, 0);

		const socket = buildCtx('p1');
		let ack = null;
		socket.trigger('chess_move',
			{ pieceId: 'p1-R', targetPosition: { x: 3, z: 3 } },
			(result) => { ack = result; },
		);

		expect(ack).toEqual(expect.objectContaining({
			success: false,
			reason: 'bad_geometry',
		}));

		// We do NOT force-refresh in the geometry case because the
		// client snapshot is still authoritative — the user just
		// clicked the wrong square.
		const refreshCall = broadcaster._calls.find(c =>
			c.method === 'broadcastGameUpdate' && c.opts?.forceFullUpdate === true
		);
		expect(refreshCall).toBeUndefined();
	});

	test('path_blocked reason when an in-line piece sits between source and target', () => {
		const world = World.getWorld();
		for (let x = 0; x <= 4; x++) {
			boardManager.setCell(world.board, x, 1, [{ type: 'tetromino', player: 'p1' }]);
		}
		placePiece(world, boardManager, 'p1-R', 'ROOK', 'p1', 0, 1);
		placePiece(world, boardManager, 'p2-P', 'PAWN', 'p2', 2, 1);

		const socket = buildCtx('p1');
		let ack = null;
		socket.trigger('chess_move',
			{ pieceId: 'p1-R', targetPosition: { x: 4, z: 1 } },
			(result) => { ack = result; },
		);
		expect(ack).toEqual(expect.objectContaining({
			success: false,
			reason: 'path_blocked',
		}));
	});

	test('path_off_board reason when a queen tries to slide across empty space', () => {
		const world = World.getWorld();
		// (0,0) source, (4,4) target, (2,2) MISSING.
		boardManager.setCell(world.board, 0, 0, [{ type: 'tetromino', player: 'p1' }]);
		boardManager.setCell(world.board, 1, 1, [{ type: 'tetromino', player: 'p1' }]);
		boardManager.setCell(world.board, 3, 3, [{ type: 'tetromino', player: 'p1' }]);
		boardManager.setCell(world.board, 4, 4, [{ type: 'tetromino', player: 'p1' }]);
		placePiece(world, boardManager, 'p1-Q', 'QUEEN', 'p1', 0, 0);

		const socket = buildCtx('p1');
		let ack = null;
		socket.trigger('chess_move',
			{ pieceId: 'p1-Q', targetPosition: { x: 4, z: 4 } },
			(result) => { ack = result; },
		);
		expect(ack).toEqual(expect.objectContaining({
			success: false,
			reason: 'path_off_board',
		}));
	});

	test('friendly_blocker reason when destination has your own piece', () => {
		const world = World.getWorld();
		for (let x = 0; x <= 4; x++) {
			boardManager.setCell(world.board, x, 1, [{ type: 'tetromino', player: 'p1' }]);
		}
		placePiece(world, boardManager, 'p1-R', 'ROOK', 'p1', 0, 1);
		placePiece(world, boardManager, 'p1-P', 'PAWN', 'p1', 4, 1);

		const socket = buildCtx('p1');
		let ack = null;
		socket.trigger('chess_move',
			{ pieceId: 'p1-R', targetPosition: { x: 4, z: 1 } },
			(result) => { ack = result; },
		);
		expect(ack).toEqual(expect.objectContaining({
			success: false,
			reason: 'friendly_blocker',
		}));
	});

	test('rejection events land in the activity log', () => {
		const world = World.getWorld();
		for (let x = 0; x <= 4; x++) {
			boardManager.setCell(world.board, x, 1, [{ type: 'tetromino', player: 'p1' }]);
		}
		placePiece(world, boardManager, 'p1-R', 'ROOK', 'p1', 0, 1);

		const recorded = [];
		activityLog.recordChessMoveRejected = (entry) => recorded.push(entry);

		const socket = buildCtx('p1');
		socket.trigger('chess_move',
			{ pieceId: 'p1-R', targetPosition: { x: 0, z: 10 } },
			() => {},
		);
		expect(recorded).toHaveLength(1);
		expect(recorded[0].reason).toBe('destination_missing');
		expect(recorded[0].from).toEqual({ x: 0, z: 1 });
		expect(recorded[0].to).toEqual({ x: 0, z: 10 });
		expect(recorded[0].pieceType).toBe('rook');
	});

	test('piece_gone reason when the piece id is no longer on the board', () => {
		const socket = buildCtx('p1');
		let ack = null;
		socket.trigger('chess_move',
			{ pieceId: 'nonexistent-id', targetPosition: { x: 0, z: 1 } },
			(result) => { ack = result; },
		);
		expect(ack).toEqual(expect.objectContaining({
			success: false,
			reason: 'piece_gone',
		}));
	});

	test('valid moves still succeed and emit chess_move broadcast', () => {
		const world = World.getWorld();
		for (let z = 0; z <= 3; z++) {
			boardManager.setCell(world.board, 1, z, [{ type: 'tetromino', player: 'p1' }]);
		}
		const rook = placePiece(world, boardManager, 'p1-R', 'ROOK', 'p1', 1, 0);

		const socket = buildCtx('p1');
		let ack = null;
		socket.trigger('chess_move',
			{ pieceId: 'p1-R', targetPosition: { x: 1, z: 3 } },
			(result) => { ack = result; },
		);
		expect(ack).toEqual(expect.objectContaining({ success: true }));
		expect(rook.position).toEqual({ x: 1, z: 3 });
		expect(io._emitted.find(e => e.event === 'chess_move')).toBeDefined();
	});
});
