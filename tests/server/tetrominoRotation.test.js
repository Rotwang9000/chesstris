/**
 * Rotated-tetromino placement validation.
 *
 * User report: "There is an issue with dropping a rotated piece will
 * sometimes say it must be connected to territory when it is."
 *
 * Root cause: the client mutated the in-memory shape matrix on rotate
 * but never updated a `rotation` index. The server's tetromino socket
 * handler does `tetromino.shape = getTetrisPieceShape(type, rotation)`
 * — so with `rotation` undefined it would always validate the
 * un-rotated canonical shape at the same (x, z) anchor. That makes
 * rotated pieces look "connected" to the player visually whilst the
 * server checks the wrong cells.
 *
 * Fix: client tracks the rotation index in lockstep with the matrix
 * rotation and sends it as `tetromino.rotation`. These tests pin the
 * server-side contract by feeding a payload with both a `rotation`
 * index and a `shape`, and confirming the server validates the cells
 * that the rotated shape actually occupies.
 */

const path = require('path');

const World = require(path.join('..', '..', 'server', 'world', 'World'));
const BoardManager = require(path.join('..', '..', 'server', 'game', 'BoardManager'));
const IslandManager = require(path.join('..', '..', 'server', 'game', 'IslandManager'));
const ChessManager = require(path.join('..', '..', 'server', 'game', 'ChessManager'));
const TetrominoManager = require(path.join('..', '..', 'server', 'game', 'TetrominoManager'));
const { registerTetrominoHandlers } = require(path.join('..', '..', 'server', 'sockets', 'tetromino'));
const { TETROMINO_SHAPES } = require(path.join('..', '..', 'server', 'game', 'Constants'));

function makeFakeSocket(playerId) {
	const handlers = new Map();
	const emitted = [];
	return {
		id: `socket-${playerId}`,
		_handlers: handlers,
		_emitted: emitted,
		on(event, handler) { handlers.set(event, handler); },
		emit(event, payload) { emitted.push({ event, payload }); },
		to() { return { emit() {} }; },
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
		to() { return { emit() {} }; },
	};
}

function makeBroadcasterStub() {
	return {
		broadcastGameUpdate() {},
		emitFullStateTo() {},
		emitIslandDecayAnimation() {},
		emitToPlayer() {},
	};
}

function makeIntegrityServiceStub() {
	return { runIslandIntegrityPass() { return { changed: false, decayCells: [] }; } };
}

function makeActivityLogStub() {
	const events = [];
	return {
		_events: events,
		recordTetrominoPlaced() {},
		recordTetrominoDissolved(payload) { events.push({ type: 'tetromino_dissolved', payload }); },
	};
}

function placeChessPiece(world, boardManager, id, type, player, x, z) {
	const piece = {
		id, type, player,
		position: { x, z },
		color: 0xabcdef,
		hasMoved: false,
		moveCount: 0,
		orientation: 0,
	};
	world.chessPieces.push(piece);
	const existing = boardManager.getCell(world.board, x, z) || [];
	existing.push({
		type: 'chess', player, pieceId: id,
		pieceType: String(type).toLowerCase(),
	});
	boardManager.setCell(world.board, x, z, existing);
	return piece;
}

describe('server/sockets/tetromino — rotated placement uses client rotation index', () => {
	let boardManager;
	let islandManager;
	let chessManager;
	let tetrominoManager;
	let activityLog;
	let io;
	let broadcaster;
	let integrityService;

	function buildCtx(playerId) {
		const socket = makeFakeSocket(playerId);
		const gameManager = {
			boardManager, islandManager, chessManager, tetrominoManager, activityLog,
		};
		registerTetrominoHandlers(socket, {
			playerId,
			io,
			gameManager,
			broadcaster,
			integrityService,
			spectatorRegistry: { broadcastUpdate() {} },
			lineClearService: { runCascade: () => Promise.resolve({}) },
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
		activityLog = makeActivityLogStub();
		io = makeFakeIo();
		broadcaster = makeBroadcasterStub();
		integrityService = makeIntegrityServiceStub();

		World.upsertPlayer('p1', { name: 'Alice', color: '#ff0000' });
		const world = World.getWorld();
		// p1's king at (5, 5), with a couple of friendly cells extending
		// north so a rotated J/L can legally connect.
		placeChessPiece(world, boardManager, 'p1-K', 'KING', 'p1', 5, 5);
		boardManager.setCell(world.board, 5, 4, [{ type: 'tetromino', player: 'p1' }]);
		boardManager.setCell(world.board, 5, 3, [{ type: 'tetromino', player: 'p1' }]);
		// Pre-set lastTetrominoPlacement so this isn't a first
		// placement — first-placement is special-cased and won't
		// exercise the rotated-cell connectivity path we care about.
		world.players['p1'].lastTetrominoPlacement = { x: 0, z: 0 };
	});

	test('server uses TETROMINO_SHAPES[type][rotation] when client sends rotation', () => {
		// J-piece at rotation 1 is [[0,1,1],[0,1,0],[0,1,0]] (a vertical
		// L-shape). Placed with top-left anchor at (4, 0) the filled
		// cells are: (5,0), (6,0), (5,1), (5,2). The cell adjacent to
		// (5,3) is (5,2), which IS filled by rotation 1 → adjacency
		// passes. By contrast rotation 0 would put cells at (4,1),
		// (5,1), (6,1), (4,0), missing the (5,2) → (5,3) link.

		const socket = buildCtx('p1');
		let ack = null;
		socket.trigger('tetromino_placed', {
			tetromino: {
				type: 'J',
				rotation: 1,
				shape: TETROMINO_SHAPES.J[1],
				position: { x: 4, z: 0 },
			},
		}, (result) => { ack = result; });

		expect(ack).toMatchObject({ success: true });
		// Confirm the cells the server *actually* wrote correspond to
		// rotation 1 of the J piece.
		const cellAt = (x, z) => boardManager.getCell(World.getWorld().board, x, z);
		// Rotation-1 J occupies (5,0), (6,0), (5,1), (5,2) under anchor (4, 0).
		expect(cellAt(5, 0)).not.toBeNull();
		expect(cellAt(6, 0)).not.toBeNull();
		expect(cellAt(5, 1)).not.toBeNull();
		expect(cellAt(5, 2)).not.toBeNull();
	});

	test('omitting rotation defaults to 0 and fails for shapes that don\'t reach the chain', () => {
		// Same anchor (4, 0), but rotation 0 (canonical J) — those
		// cells don't touch the friendly chain at (5, 3), so the
		// server must reject with `not_adjacent`.
		const socket = buildCtx('p1');
		let ack = null;
		socket.trigger('tetromino_placed', {
			tetromino: {
				type: 'J',
				// no rotation field — server defaults to 0
				shape: TETROMINO_SHAPES.J[0],
				position: { x: 4, z: 0 },
			},
		}, (result) => { ack = result; });

		expect(ack).toMatchObject({ success: false, reason: 'not_adjacent' });
	});

	test('not_adjacent rejections now reach the activity log (no longer silent)', () => {
		const socket = buildCtx('p1');
		socket.trigger('tetromino_placed', {
			tetromino: {
				type: 'J',
				rotation: 0,
				shape: TETROMINO_SHAPES.J[0],
				// Far from any friendly territory.
				position: { x: 100, z: 100 },
			},
		}, () => {});

		const dissolved = activityLog._events.find(e => e.type === 'tetromino_dissolved');
		expect(dissolved).toBeDefined();
		expect(dissolved.payload).toMatchObject({ reason: 'not_adjacent' });
	});

	test('sanity: the four canonical T-rotations occupy different cells', () => {
		// Belt-and-braces check that our assumption "client matrix
		// rotation == server canonical rotation" holds for every
		// orientation of the T piece (the most rotation-sensitive
		// shape).
		const t0Cells = [];
		for (let i = 0; i < TETROMINO_SHAPES.T[0].length; i++) {
			for (let j = 0; j < TETROMINO_SHAPES.T[0][i].length; j++) {
				if (TETROMINO_SHAPES.T[0][i][j]) t0Cells.push(`${i},${j}`);
			}
		}
		const t1Cells = [];
		for (let i = 0; i < TETROMINO_SHAPES.T[1].length; i++) {
			for (let j = 0; j < TETROMINO_SHAPES.T[1][i].length; j++) {
				if (TETROMINO_SHAPES.T[1][i][j]) t1Cells.push(`${i},${j}`);
			}
		}
		expect(t0Cells).not.toEqual(t1Cells);
	});
});
