/**
 * Tests for `server/game/pieces.js` — the single source of truth for
 * chess-piece lifecycle changes.
 *
 * The user reported pieces vanishing with no entry in the activity log.
 * The fix routes every removal through this helper, which emits a
 * typed event on its activity-log dependency. These tests verify each
 * removal path emits the correct event.
 */

const pieces = require('../../server/game/pieces');

function makeWorld() {
	return {
		id: 'test-world',
		players: {
			p1: { id: 'p1', username: 'Alice' },
			p2: { id: 'p2', username: 'Bob' },
		},
		chessPieces: [
			{ id: 'p1-rook', type: 'ROOK', player: 'p1', position: { x: 1, z: 2 } },
			{ id: 'p1-king', type: 'KING', player: 'p1', position: { x: 0, z: 0 } },
			{ id: 'p2-pawn', type: 'PAWN', player: 'p2', position: { x: 5, z: 6 } },
		],
		board: {
			cells: {
				'1,2': [
					{ type: 'tetromino', player: 'p1' },
					{ type: 'chess', player: 'p1', pieceId: 'p1-rook', pieceType: 'rook' },
				],
				'0,0': [
					{ type: 'home', player: 'p1' },
					{ type: 'chess', player: 'p1', pieceId: 'p1-king', pieceType: 'king' },
				],
				'5,6': [
					{ type: 'tetromino', player: 'p2' },
					{ type: 'chess', player: 'p2', pieceId: 'p2-pawn', pieceType: 'pawn' },
				],
			},
		},
	};
}

function makeActivityLogStub() {
	const events = [];
	return {
		events,
		record(type, payload) { events.push({ type, payload }); },
		recordPieceLost(payload) { events.push({ type: 'chess_piece_lost', payload }); },
		recordPiecesLost(payload) { events.push({ type: 'chess_pieces_lost', payload }); },
		recordPieceCaptured(payload) { events.push({ type: 'chess_piece_captured', payload }); },
	};
}

describe('pieces.removePiece', () => {
	test('strips the chess marker, splices the piece, leaves terrain', () => {
		const world = makeWorld();
		const log = makeActivityLogStub();

		const removed = pieces.removePiece(world, 'p1-rook', {
			reason: pieces.REMOVAL_REASONS.NO_SUPPORTING_CELL,
			activityLog: log,
		});

		expect(removed && removed.id).toBe('p1-rook');
		expect(world.chessPieces.find(p => p.id === 'p1-rook')).toBeUndefined();
		// Terrain stays — only the chess marker should be gone.
		expect(world.board.cells['1,2']).toEqual([
			{ type: 'tetromino', player: 'p1' },
		]);
	});

	test('emits chess_piece_lost with the correct reason', () => {
		const world = makeWorld();
		const log = makeActivityLogStub();

		pieces.removePiece(world, 'p1-rook', {
			reason: pieces.REMOVAL_REASONS.NO_SUPPORTING_CELL,
			activityLog: log,
		});

		expect(log.events).toHaveLength(1);
		expect(log.events[0].type).toBe('chess_piece_lost');
		expect(log.events[0].payload).toMatchObject({
			playerId: 'p1',
			playerName: 'Alice',
			pieceType: 'rook',
			pieceId: 'p1-rook',
			x: 1,
			z: 2,
			reason: 'no_supporting_cell',
		});
	});

	test('emits chess_piece_captured when reason is CAPTURED', () => {
		const world = makeWorld();
		const log = makeActivityLogStub();

		pieces.removePiece(world, 'p2-pawn', {
			reason: pieces.REMOVAL_REASONS.CAPTURED,
			activityLog: log,
			capturedBy: { playerId: 'p1', pieceType: 'rook', pieceId: 'p1-rook' },
		});

		expect(log.events).toHaveLength(1);
		expect(log.events[0].type).toBe('chess_piece_captured');
		expect(log.events[0].payload).toMatchObject({
			playerId: 'p2',
			pieceType: 'pawn',
			capturedBy: { playerId: 'p1', pieceType: 'rook', pieceId: 'p1-rook' },
		});
	});

	test('silent: true suppresses the activity log event', () => {
		const world = makeWorld();
		const log = makeActivityLogStub();

		pieces.removePiece(world, 'p1-rook', {
			reason: pieces.REMOVAL_REASONS.CAPTURED,
			activityLog: log,
			silent: true,
		});

		expect(log.events).toHaveLength(0);
		// Piece is still removed.
		expect(world.chessPieces.find(p => p.id === 'p1-rook')).toBeUndefined();
	});

	test('returns null when the piece is not in chessPieces', () => {
		const world = makeWorld();
		const removed = pieces.removePiece(world, 'no-such-id', {
			reason: pieces.REMOVAL_REASONS.NO_SUPPORTING_CELL,
		});
		expect(removed).toBeNull();
		expect(world.chessPieces).toHaveLength(3);
	});

	test('falls back to the generic record() helper when typed helpers are absent', () => {
		const world = makeWorld();
		const events = [];
		const log = { record: (type, payload) => events.push({ type, payload }) };

		pieces.removePiece(world, 'p1-rook', {
			reason: pieces.REMOVAL_REASONS.ISLAND_DECAY,
			activityLog: log,
		});

		expect(events).toHaveLength(1);
		expect(events[0].type).toBe('chess_piece_lost');
		expect(events[0].payload.reason).toBe('island_decay');
	});
});

describe('pieces.removePiecesAtCells', () => {
	test('removes only the pieces of the named player at the named cells', () => {
		const world = makeWorld();
		const log = makeActivityLogStub();

		const removed = pieces.removePiecesAtCells(
			world,
			'p1',
			[
				{ x: 1, z: 2 }, // p1-rook lives here
				{ x: 9, z: 9 }, // empty
				{ x: 5, z: 6 }, // p2-pawn lives here — wrong owner, ignored
			],
			{ reason: pieces.REMOVAL_REASONS.ISLAND_DECAY, activityLog: log },
		);

		expect(removed.map(p => p.id)).toEqual(['p1-rook']);
		expect(world.chessPieces.find(p => p.id === 'p1-rook')).toBeUndefined();
		expect(world.chessPieces.find(p => p.id === 'p2-pawn')).toBeDefined();

		expect(log.events).toHaveLength(1);
		expect(log.events[0].type).toBe('chess_piece_lost');
		expect(log.events[0].payload.reason).toBe('island_decay');
		expect(log.events[0].payload.pieceType).toBe('rook');
	});

	test('respects the protect() predicate (home zones not decayed)', () => {
		const world = makeWorld();
		const log = makeActivityLogStub();

		const removed = pieces.removePiecesAtCells(
			world,
			'p1',
			[
				{ x: 0, z: 0 }, // p1-king home cell
				{ x: 1, z: 2 }, // p1-rook
			],
			{
				reason: pieces.REMOVAL_REASONS.ISLAND_DECAY,
				activityLog: log,
				protect: (_piece, pos) => pos.x === 0 && pos.z === 0,
			},
		);

		expect(removed.map(p => p.id)).toEqual(['p1-rook']);
		// The king (protected) survives the sweep.
		expect(world.chessPieces.find(p => p.id === 'p1-king')).toBeDefined();
	});
});

describe('pieces.removeAllPlayerPieces', () => {
	test('removes every piece for the player and emits a single summary event', () => {
		const world = makeWorld();
		world.chessPieces.push(
			{ id: 'p1-pawn', type: 'PAWN', player: 'p1', position: { x: 2, z: 2 } },
		);
		world.board.cells['2,2'] = [
			{ type: 'chess', player: 'p1', pieceId: 'p1-pawn', pieceType: 'pawn' },
		];
		const log = makeActivityLogStub();

		const removed = pieces.removeAllPlayerPieces(world, 'p1', {
			reason: pieces.REMOVAL_REASONS.PLAYER_LEFT,
			activityLog: log,
		});

		expect(removed).toHaveLength(3); // rook, king, pawn
		expect(world.chessPieces.find(p => p.player === 'p1')).toBeUndefined();
		// p2 untouched
		expect(world.chessPieces.find(p => p.id === 'p2-pawn')).toBeDefined();

		expect(log.events).toHaveLength(1);
		expect(log.events[0].type).toBe('chess_pieces_lost');
		expect(log.events[0].payload).toMatchObject({
			playerId: 'p1',
			playerName: 'Alice',
			pieceCount: 3,
			reason: 'player_left',
		});
	});
});

describe('pieces.relocatePiece', () => {
	test('updates the piece position and moves the chess marker', () => {
		const world = makeWorld();
		const piece = world.chessPieces.find(p => p.id === 'p1-rook');

		pieces.relocatePiece(world, piece, { x: 3, z: 4 });

		expect(piece.position).toEqual({ x: 3, z: 4 });
		// Old cell still has the underlying terrain but no chess marker.
		expect(world.board.cells['1,2']).toEqual([{ type: 'tetromino', player: 'p1' }]);
		// New cell has the marker.
		const newCell = world.board.cells['3,4'];
		expect(Array.isArray(newCell)).toBe(true);
		expect(newCell.some(i =>
			i.type === 'chess' && String(i.pieceId) === 'p1-rook'
		)).toBe(true);
	});
});
