/**
 * Captured-piece basket flow.
 *
 * User report: "I should see a basket of captured pieces or a count or
 * something.. they should be able to deploy the captured pieces as
 * their own, perhaps when a pawn upgrades but they might have run out
 * of pawns so they need some mechanism to get them back."
 *
 * Behaviour under test:
 *
 *   1. Capturing an opponent's chess piece adds an entry of the right
 *      type to the captor's `world.players[captorId].capturedBasket`.
 *   2. Pawns are deliberately excluded — they're too common to be
 *      strategically interesting as redeploy material.
 *   3. `buildPlayersList` exposes a `capturedCount` + `capturedSummary`
 *      so the sidebar can show "Captured: 3 ♜" without leaking the
 *      full basket to other players.
 *   4. The promote_pawn handler consumes a basket entry when the
 *      client requests `fromBasket: true`, and rejects basket
 *      promotions when no matching entry exists.
 */

const path = require('path');

const World = require(path.join('..', '..', 'server', 'world', 'World'));
const BoardManager = require(path.join('..', '..', 'server', 'game', 'BoardManager'));
const IslandManager = require(path.join('..', '..', 'server', 'game', 'IslandManager'));
const ChessManager = require(path.join('..', '..', 'server', 'game', 'ChessManager'));
const TetrominoManager = require(path.join('..', '..', 'server', 'game', 'TetrominoManager'));
const { registerChessHandlers } = require(path.join('..', '..', 'server', 'sockets', 'chess'));
const { createBroadcaster } = require(path.join('..', '..', 'server', 'net', 'broadcasts'));
const pieces = require(path.join('..', '..', 'server', 'game', 'pieces'));

function makeFakeSocket(playerId) {
	const handlers = new Map();
	const emitted = [];
	return {
		id: `socket-${playerId}`,
		_handlers: handlers,
		_emitted: emitted,
		on(event, handler) { handlers.set(event, handler); },
		emit(event, payload) { emitted.push({ event, payload }); },
		to() { return { emit() { /* noop */ } }; },
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
		recordTetrominoPlaced() {},
		recordTetrominoDissolved() {},
		recordChessMove(payload) { events.push({ type: 'chess_move', payload }); },
		recordChessMoveRejected() {},
		recordRowsCleared() {},
		recordIslandDecayed() {},
		recordTerritoryCaptured() {},
		recordKingDetonation() {},
		recordPieceLost() {},
		recordPiecesLost() {},
		recordPieceCaptured(payload) { events.push({ type: 'chess_piece_captured', payload }); },
		recordPieceDetonated() {},
		recordPiecePromoted(payload) { events.push({ type: 'chess_piece_promoted', payload }); },
		recordPieceSpawned(payload) { events.push({ type: 'chess_piece_spawned', payload }); },
		recordPawnPromotedToCredit(payload) { events.push({ type: 'pawn_promoted_to_credit', payload }); },
		recordPromotionRedeemed(payload) { events.push({ type: 'promotion_redeemed', payload }); },
		recordPlayerJoined() {},
		recordPlayerLeft() {},
		recordChat() {},
	};
}

function makeBroadcasterStub() {
	const calls = [];
	const basketEmits = [];
	const creditEmits = [];
	return {
		_calls: calls,
		_basketEmits: basketEmits,
		_creditEmits: creditEmits,
		broadcastGameUpdate(opts) { calls.push({ method: 'broadcastGameUpdate', opts }); },
		emitFullStateTo() {},
		emitIslandDecayAnimation() {},
		emitToPlayer() {},
		emitCapturedBasket(playerId) {
			const world = World.getWorld();
			const basket = world?.players?.[playerId]?.capturedBasket || [];
			basketEmits.push({ playerId, basket: basket.slice() });
		},
		emitPromotionCredits(playerId) {
			const world = World.getWorld();
			const credits = world?.players?.[playerId]?.promotionCredits || [];
			creditEmits.push({ playerId, credits: credits.slice() });
		},
	};
}

function makeIntegrityServiceStub() {
	return { runIslandIntegrityPass() { return { changed: false, decayCells: [] }; } };
}

function placeChessPiece(world, boardManager, id, type, player, x, z) {
	const piece = {
		id, type, player,
		position: { x, z },
		color: 0xaabbcc,
		hasMoved: false,
		moveCount: 0,
		orientation: 0,
	};
	world.chessPieces.push(piece);
	const existing = boardManager.getCell(world.board, x, z) || [];
	existing.push({
		type: 'chess', player, pieceId: id,
		pieceType: String(type).toLowerCase(),
		color: piece.color,
	});
	boardManager.setCell(world.board, x, z, existing);
	return piece;
}

describe('server/sockets/chess — captured-piece basket', () => {
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
		const ctx = {
			playerId,
			io,
			gameManager,
			broadcaster,
			integrityService,
			kingCaptureService: { executeKingCapture() {} },
			kingDuelService: { startDuel() { return null; } },
			kingDetonationService: { detonateKing() { return { success: true }; } },
			spectatorRegistry: { broadcastUpdate() {} },
			activityLog,
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

		World.upsertPlayer('p1', { name: 'Alice', color: '#ff0000' });
		World.upsertPlayer('p2', { name: 'Bob', color: '#00ff00' });
		const world = World.getWorld();
		placeChessPiece(world, boardManager, 'p1-K', 'KING', 'p1', 0, 0);
		placeChessPiece(world, boardManager, 'p2-K', 'KING', 'p2', 20, 20);
	});

	test('capturing a rook adds a ROOK entry to the captor\'s basket', () => {
		const world = World.getWorld();
		placeChessPiece(world, boardManager, 'p1-R', 'ROOK', 'p1', 3, 5);
		placeChessPiece(world, boardManager, 'p2-R', 'ROOK', 'p2', 3, 7);
		boardManager.setCell(world.board, 3, 6, [{ type: 'tetromino', player: 'p1' }]);
		jest.spyOn(chessManager, 'isValidChessMove').mockReturnValue(true);

		const { socket } = buildCtx('p1');
		socket.trigger(
			'chess_move',
			{ pieceId: 'p1-R', targetPosition: { x: 3, z: 7 } },
			() => {},
		);

		const basket = world.players['p1'].capturedBasket;
		expect(Array.isArray(basket)).toBe(true);
		expect(basket).toHaveLength(1);
		expect(basket[0]).toMatchObject({
			type: 'ROOK',
			originalOwner: 'p2',
			originalOwnerName: 'Bob',
		});
		expect(typeof basket[0].capturedAt).toBe('number');
	});

	test('capturing a pawn does NOT touch the basket', () => {
		const world = World.getWorld();
		placeChessPiece(world, boardManager, 'p1-R', 'ROOK', 'p1', 3, 5);
		placeChessPiece(world, boardManager, 'p2-P', 'PAWN', 'p2', 3, 7);
		boardManager.setCell(world.board, 3, 6, [{ type: 'tetromino', player: 'p1' }]);
		jest.spyOn(chessManager, 'isValidChessMove').mockReturnValue(true);

		const { socket } = buildCtx('p1');
		socket.trigger(
			'chess_move',
			{ pieceId: 'p1-R', targetPosition: { x: 3, z: 7 } },
			() => {},
		);

		const basket = world.players['p1'].capturedBasket || [];
		expect(basket).toHaveLength(0);
	});

	test('basket changes trigger emitCapturedBasket for the captor', () => {
		const world = World.getWorld();
		placeChessPiece(world, boardManager, 'p1-R', 'ROOK', 'p1', 3, 5);
		placeChessPiece(world, boardManager, 'p2-Q', 'QUEEN', 'p2', 3, 7);
		boardManager.setCell(world.board, 3, 6, [{ type: 'tetromino', player: 'p1' }]);
		jest.spyOn(chessManager, 'isValidChessMove').mockReturnValue(true);

		const { socket } = buildCtx('p1');
		socket.trigger(
			'chess_move',
			{ pieceId: 'p1-R', targetPosition: { x: 3, z: 7 } },
			() => {},
		);

		expect(broadcaster._basketEmits).toHaveLength(1);
		expect(broadcaster._basketEmits[0]).toMatchObject({
			playerId: 'p1',
			basket: [{ type: 'QUEEN' }],
		});
	});

	test('promote_pawn banks a promotion credit and removes the pawn from the board', () => {
		const world = World.getWorld();
		const pawn = placeChessPiece(world, boardManager, 'p1-P', 'PAWN', 'p1', 5, 9);
		pawn.forwardDistance = 99;

		const { socket } = buildCtx('p1');
		let ack = null;
		socket.trigger('promote_pawn', { pieceId: 'p1-P' }, (result) => { ack = result; });

		expect(ack).toMatchObject({ success: true });
		expect(ack.creditId).toBeDefined();
		expect(world.chessPieces.find(p => p.id === 'p1-P')).toBeUndefined();
		expect(world.players['p1'].promotionCredits).toHaveLength(1);
		const credit = world.players['p1'].promotionCredits[0];
		expect(credit).toMatchObject({
			id: ack.creditId,
			fromPieceId: 'p1-P',
			originalX: 5,
			originalZ: 9,
		});
		expect(broadcaster._creditEmits).toHaveLength(1);
		expect(broadcaster._creditEmits[0]).toMatchObject({ playerId: 'p1' });

		const creditEvents = activityLog._events.filter(e => e.type === 'pawn_promoted_to_credit');
		expect(creditEvents).toHaveLength(1);
		expect(creditEvents[0].payload).toMatchObject({ playerId: 'p1', x: 5, z: 9 });
	});

	test('promote_pawn rejects pawns that have not walked far enough', () => {
		const world = World.getWorld();
		const pawn = placeChessPiece(world, boardManager, 'p1-P', 'PAWN', 'p1', 5, 9);
		pawn.forwardDistance = 3;

		const { socket } = buildCtx('p1');
		let ack = null;
		socket.trigger('promote_pawn', { pieceId: 'p1-P' }, (result) => { ack = result; });
		expect(ack).toMatchObject({ success: false });
		expect(ack.error).toMatch(/has not advanced/);
		expect(world.chessPieces.find(p => p.id === 'p1-P')).toBeDefined();
		expect(world.players['p1'].promotionCredits).toHaveLength(0);
	});

	test('promote_pawn is idempotent — the same pawn cannot be banked twice', () => {
		const world = World.getWorld();
		const pawn = placeChessPiece(world, boardManager, 'p1-P', 'PAWN', 'p1', 5, 9);
		pawn.forwardDistance = 99;

		// Simulate a credit already banked by the chess_move auto-bank
		// path. The duplicate `promote_pawn` call should be rejected
		// because the pawn is gone from the board.
		world.players['p1'].promotionCredits = [
			{ id: 'pre-existing', fromPieceId: 'p1-P', originalX: 5, originalZ: 9, createdAt: 0 },
		];
		pieces.removePiece(world, 'p1-P', { reason: 'test_setup', silent: true });

		const { socket } = buildCtx('p1');
		let ack = null;
		socket.trigger('promote_pawn', { pieceId: 'p1-P' }, (result) => { ack = result; });
		expect(ack).toMatchObject({ success: false });
		expect(ack.error).toMatch(/Pawn not found/);
		expect(world.players['p1'].promotionCredits).toHaveLength(1);
	});
});

describe('server/sockets/chess — redeem_promotion', () => {
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
		const ctx = {
			playerId,
			io,
			gameManager,
			broadcaster,
			integrityService,
			kingCaptureService: { executeKingCapture() {} },
			kingDuelService: { startDuel() { return null; } },
			kingDetonationService: { detonateKing() { return { success: true }; } },
			spectatorRegistry: { broadcastUpdate() {} },
			activityLog,
		};
		registerChessHandlers(socket, ctx);
		return { socket, ctx };
	}

	function seedOwnedTerritory(world, playerId, x, z) {
		// Board needs the player's tetromino/home content under the cell
		// so `findNearestOwnedCell` recognises it as owned territory.
		const cell = boardManager.getCell(world.board, x, z) || [];
		cell.push({ type: 'tetromino', player: playerId, placedAt: 0 });
		boardManager.setCell(world.board, x, z, cell);
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

		World.upsertPlayer('p1', { name: 'Alice', color: '#ff0000' });
		World.upsertPlayer('p2', { name: 'Bob', color: '#00ff00' });
		const world = World.getWorld();
		world.homeZones.p1 = { x: 0, z: 0, width: 8, height: 2, orientation: 0 };
		placeChessPiece(world, boardManager, 'p1-K', 'KING', 'p1', 4, 0);
		placeChessPiece(world, boardManager, 'p2-K', 'KING', 'p2', 4, 21);
	});

	test('deploys a captured piece at the credit\'s original cell when still owned', () => {
		const world = World.getWorld();
		seedOwnedTerritory(world, 'p1', 5, 9);
		world.players['p1'].capturedBasket = [
			{ type: 'ROOK', originalOwner: 'p2', originalOwnerName: 'Bob', capturedAt: 0 },
		];
		world.players['p1'].promotionCredits = [
			{ id: 'credit-1', fromPieceId: 'p1-P', originalX: 5, originalZ: 9, createdAt: 0 },
		];

		const { socket } = buildCtx('p1');
		let ack = null;
		socket.trigger('redeem_promotion', {
			creditId: 'credit-1', capturedType: 'ROOK',
		}, (result) => { ack = result; });

		expect(ack).toMatchObject({
			success: true, pieceType: 'ROOK', fallback: false,
		});
		expect(ack.position).toEqual({ x: 5, z: 9 });

		const deployed = world.chessPieces.find(p => p.id === ack.pieceId);
		expect(deployed).toBeDefined();
		expect(deployed.type).toBe('ROOK');
		expect(deployed.position).toEqual({ x: 5, z: 9 });
		expect(world.players['p1'].capturedBasket).toHaveLength(0);
		expect(world.players['p1'].promotionCredits).toHaveLength(0);

		const events = activityLog._events.filter(e => e.type === 'promotion_redeemed');
		expect(events).toHaveLength(1);
		expect(events[0].payload).toMatchObject({
			creditId: 'credit-1',
			capturedType: 'rook',
			x: 5, z: 9,
			fallback: false,
		});
	});

	test('falls back to nearest owned cell when the original cell is gone', () => {
		const world = World.getWorld();
		// Original cell 5,9 is NOT owned. Player has territory at
		// (5,0) right next to their king at (4,0).
		seedOwnedTerritory(world, 'p1', 5, 0);
		seedOwnedTerritory(world, 'p1', 6, 1);
		world.players['p1'].capturedBasket = [{ type: 'QUEEN' }];
		world.players['p1'].promotionCredits = [
			{ id: 'credit-x', fromPieceId: 'p1-P', originalX: 5, originalZ: 9, createdAt: 0 },
		];

		const { socket } = buildCtx('p1');
		let ack = null;
		socket.trigger('redeem_promotion', {
			creditId: 'credit-x', capturedType: 'QUEEN',
		}, (result) => { ack = result; });

		expect(ack).toMatchObject({ success: true, fallback: true });
		expect(ack.position).toEqual({ x: 5, z: 0 });
	});

	test('rejects when basket has no matching captured type', () => {
		const world = World.getWorld();
		seedOwnedTerritory(world, 'p1', 5, 9);
		world.players['p1'].capturedBasket = [{ type: 'BISHOP' }];
		world.players['p1'].promotionCredits = [
			{ id: 'credit-1', fromPieceId: 'p1-P', originalX: 5, originalZ: 9, createdAt: 0 },
		];

		const { socket } = buildCtx('p1');
		let ack = null;
		socket.trigger('redeem_promotion', {
			creditId: 'credit-1', capturedType: 'ROOK',
		}, (result) => { ack = result; });
		expect(ack.success).toBe(false);
		expect(ack.error).toMatch(/No captured ROOK/);
		expect(world.players['p1'].promotionCredits).toHaveLength(1);
		expect(world.players['p1'].capturedBasket).toHaveLength(1);
	});

	test('rejects when player has no promotion credits at all', () => {
		const world = World.getWorld();
		world.players['p1'].capturedBasket = [{ type: 'ROOK' }];
		world.players['p1'].promotionCredits = [];
		const { socket } = buildCtx('p1');
		let ack = null;
		socket.trigger('redeem_promotion', { capturedType: 'ROOK' }, (result) => { ack = result; });
		expect(ack.success).toBe(false);
		expect(ack.error).toMatch(/No promotion credits/);
	});

	test('rejects pawn-type redeem (only QRBN allowed)', () => {
		const world = World.getWorld();
		seedOwnedTerritory(world, 'p1', 5, 9);
		world.players['p1'].capturedBasket = [{ type: 'PAWN' }];
		world.players['p1'].promotionCredits = [{
			id: 'credit-pawn', fromPieceId: 'p1-P', originalX: 5, originalZ: 9, createdAt: 0,
		}];

		const { socket } = buildCtx('p1');
		let ack = null;
		socket.trigger('redeem_promotion', { capturedType: 'PAWN' }, (result) => { ack = result; });
		expect(ack.success).toBe(false);
		expect(ack.error).toMatch(/Invalid captured type/);
	});

	test('eliminated players cannot redeem credits', () => {
		const world = World.getWorld();
		world.players['p1'].eliminated = true;
		world.players['p1'].capturedBasket = [{ type: 'ROOK' }];
		world.players['p1'].promotionCredits = [{
			id: 'credit-elim', fromPieceId: 'p1-P', originalX: 5, originalZ: 9, createdAt: 0,
		}];

		const { socket } = buildCtx('p1');
		let ack = null;
		socket.trigger('redeem_promotion', { capturedType: 'ROOK' }, (result) => { ack = result; });
		expect(ack.success).toBe(false);
		expect(ack.error).toMatch(/eliminated/);
		expect(world.players['p1'].promotionCredits).toHaveLength(1);
		expect(world.players['p1'].capturedBasket).toHaveLength(1);
	});

	test('rejects when the player has no owned cells at all (cannot find a spawn)', () => {
		const world = World.getWorld();
		// Remove the king so the helper can't find any owned cell.
		world.chessPieces = world.chessPieces.filter(p => p.player !== 'p1');
		world.players['p1'].capturedBasket = [{ type: 'ROOK' }];
		world.players['p1'].promotionCredits = [{
			id: 'credit-noland', fromPieceId: 'p1-P', originalX: 5, originalZ: 9, createdAt: 0,
		}];

		const { socket } = buildCtx('p1');
		let ack = null;
		socket.trigger('redeem_promotion', { capturedType: 'ROOK' }, (result) => { ack = result; });
		expect(ack.success).toBe(false);
		expect(ack.error).toMatch(/No owned cell/);
	});
});

describe('server/game/pieces — findEmptyPawnSlot', () => {
	let boardManager;

	beforeEach(() => {
		World.resetWorld({ id: 'global_game' });
		boardManager = new BoardManager();
		World.upsertPlayer('p1', { name: 'Alice' });
		const world = World.getWorld();
		world.homeZones.p1 = { x: 10, z: 5, width: 8, height: 2, orientation: 0 };
	});

	test('returns the first slot when the entire pawn row is empty', () => {
		const world = World.getWorld();
		const pieces = require('../../server/game/pieces');
		const slot = pieces.findEmptyPawnSlot(world, 'p1');
		expect(slot).toEqual({ x: 10, z: 6 });
	});

	test('skips slots that already host a chess piece', () => {
		const world = World.getWorld();
		const pieces = require('../../server/game/pieces');
		placeChessPiece(world, boardManager, 'p1-pawn', 'PAWN', 'p1', 10, 6);
		placeChessPiece(world, boardManager, 'p1-pawn2', 'PAWN', 'p1', 11, 6);
		const slot = pieces.findEmptyPawnSlot(world, 'p1');
		expect(slot).toEqual({ x: 12, z: 6 });
	});

	test('returns null when every pawn slot is occupied', () => {
		const world = World.getWorld();
		const pieces = require('../../server/game/pieces');
		for (let i = 0; i < 8; i++) {
			placeChessPiece(world, boardManager, `p1-${i}`, 'PAWN', 'p1', 10 + i, 6);
		}
		expect(pieces.findEmptyPawnSlot(world, 'p1')).toBeNull();
	});

	test('respects orientation (downwards-facing home zone places pawns at z, not z+1)', () => {
		const world = World.getWorld();
		const pieces = require('../../server/game/pieces');
		world.homeZones.p1.orientation = 2;
		const slot = pieces.findEmptyPawnSlot(world, 'p1');
		expect(slot).toEqual({ x: 10, z: 5 });
	});

	test('respects vertical orientations (1 / 3)', () => {
		const world = World.getWorld();
		const pieces = require('../../server/game/pieces');
		world.homeZones.p1 = { x: 100, z: 50, width: 2, height: 8, orientation: 1 };
		expect(pieces.findEmptyPawnSlot(world, 'p1')).toEqual({ x: 101, z: 50 });
		world.homeZones.p1.orientation = 3;
		expect(pieces.findEmptyPawnSlot(world, 'p1')).toEqual({ x: 100, z: 50 });
	});

	test('returns null for unknown players or players without a home zone', () => {
		const world = World.getWorld();
		const pieces = require('../../server/game/pieces');
		expect(pieces.findEmptyPawnSlot(world, 'p-ghost')).toBeNull();
		delete world.homeZones.p1;
		expect(pieces.findEmptyPawnSlot(world, 'p1')).toBeNull();
	});
});

describe('server/net/broadcasts — buildPlayersList includes basket summary', () => {
	beforeEach(() => {
		World.resetWorld({ id: 'global_game' });
		World.upsertPlayer('alice', { name: 'Alice' });
		World.upsertPlayer('bob', { name: 'Bob' });
	});

	test('empty basket reports capturedCount=0 and an empty summary', () => {
		const persistence = { markDirty() {} };
		const io = { to() { return { emit() {} }; } };
		const broadcaster = createBroadcaster({ io, persistence });
		const list = broadcaster.buildPlayersList();
		const alice = list.find(p => p.id === 'alice');
		expect(alice).toMatchObject({ capturedCount: 0, capturedSummary: {} });
	});

	test('basket summary aggregates by type', () => {
		const world = World.getWorld();
		world.players['alice'].capturedBasket = [
			{ type: 'ROOK' }, { type: 'ROOK' }, { type: 'QUEEN' }, { type: 'BISHOP' },
		];
		const persistence = { markDirty() {} };
		const io = { to() { return { emit() {} }; } };
		const broadcaster = createBroadcaster({ io, persistence });
		const list = broadcaster.buildPlayersList();
		const alice = list.find(p => p.id === 'alice');
		expect(alice.capturedCount).toBe(4);
		expect(alice.capturedSummary).toEqual({ ROOK: 2, QUEEN: 1, BISHOP: 1 });
	});

	test('emitCapturedBasket targets the right player with their full basket', () => {
		const world = World.getWorld();
		world.players['alice'].capturedBasket = [{ type: 'KNIGHT' }];
		const sentToAlice = [];
		const persistence = { markDirty() {} };
		const io = { to() { return { emit() {} }; } };

		// Patch the Sessions module to point alice at a fake socket.
		const Sessions = require(path.join('..', '..', 'server', 'world', 'Sessions'));
		const originalSocketForPlayer = Sessions.socketForPlayer;
		Sessions.socketForPlayer = (pid) => pid === 'alice'
			? { emit(event, payload) { sentToAlice.push({ event, payload }); } }
			: null;

		try {
			const broadcaster = createBroadcaster({ io, persistence });
			const ok = broadcaster.emitCapturedBasket('alice');
			expect(ok).toBe(true);
			expect(sentToAlice).toHaveLength(1);
			expect(sentToAlice[0]).toMatchObject({
				event: 'captured_basket',
				payload: { basket: [{ type: 'KNIGHT' }] },
			});
		} finally {
			Sessions.socketForPlayer = originalSocketForPlayer;
		}
	});
});
