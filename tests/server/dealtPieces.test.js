/**
 * The server deals every tetromino.
 *
 * Each player has a `current` piece (the only shape they may place) and
 * a `next` preview, both from their 7-bag. Clients used to shuffle their
 * own bag and the server took whatever shape was sent, so a modified
 * client could place an I piece every time.
 */

const path = require('path');

const World = require(path.join('..', '..', 'server', 'world', 'World'));
const GameManager = require(path.join('..', '..', 'server', 'game', 'GameManager'));
const { DRAW_MIN_INTERVAL_MS } = require(path.join('..', '..', 'server', 'game', 'TetrominoManager'));
const { registerTetrominoHandlers } = require(path.join('..', '..', 'server', 'sockets', 'tetromino'));

const TYPES = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];

function setup() {
	World.resetWorld({ id: 'global_game' });
	World.upsertPlayer('p1', { color: 1 });
	const world = World.getWorld();
	world.players.p1.lastTetrominoPlacement = 1;
	// p1's king on its own cell at (0, 0); placements land at x >= 1.
	world.board.cells['0,0'] = [
		{ type: 'tetromino', player: 'p1' },
		{ type: 'chess', player: 'p1', pieceId: 'k1', pieceType: 'king' },
	];
	world.chessPieces.push({ id: 'k1', type: 'KING', player: 'p1', position: { x: 0, z: 0 } });

	const gameManager = new GameManager();
	const handlers = new Map();
	const socket = { id: 's', on(e, h) { handlers.set(e, h); }, emit() {}, to() { return { emit() {} }; } };
	registerTetrominoHandlers(socket, {
		playerId: 'p1',
		io: { to() { return { emit() {} }; } },
		gameManager,
		broadcaster: { broadcastGameUpdate() {} },
		integrityService: { runIslandIntegrityPass() { return {}; } },
		spectatorRegistry: { broadcastUpdate() {} },
		lineClearService: { runCascade: () => Promise.resolve({ rows: [], cols: [] }) },
		activityLog: null,
	});
	const call = (event, data) => {
		let ack = null;
		handlers.get(event)(data, (r) => { ack = r; });
		return ack;
	};
	const place = (type, x = 1) => {
		world.players.p1.lastTetrominoPlacementAt = 0;
		return call('tetromino_placed', { tetromino: { type, rotation: 0, position: { x, z: 0 } } });
	};
	return { world, gameManager, call, place };
}

describe('dealt pieces', () => {
	test('a fresh player is dealt a current and next piece from the bag', () => {
		const { call } = setup();
		const ack = call('get_pieces', {});
		expect(ack.success).toBe(true);
		expect(TYPES).toContain(ack.pieces.current);
		expect(TYPES).toContain(ack.pieces.next);
	});

	test('placing a shape other than the dealt one is refused, board untouched', () => {
		const { world, call, place } = setup();
		const { current } = call('get_pieces', {}).pieces;
		const other = TYPES.find(t => t !== current);
		const before = Object.keys(world.board.cells).length;
		const ack = place(other);
		expect(ack).toMatchObject({ success: false, reason: 'wrong_piece', pieces: { current } });
		expect(Object.keys(world.board.cells)).toHaveLength(before);
	});

	test('the dealt piece places once; the next draw moves next into current', () => {
		const { world, call, place } = setup();
		world.players.p1.dealt = { current: 'O', next: 'T', placed: false, drawnAt: 0 };
		const ack = place('O');
		expect(ack).toMatchObject({ success: true, pieces: { current: 'O', next: 'T' } });

		// Same piece again: already placed.
		expect(place('O', 3)).toMatchObject({ success: false, reason: 'wrong_piece' });

		const drawn = call('draw_piece', {});
		expect(drawn.pieces.current).toBe('T');
		expect(TYPES).toContain(drawn.pieces.next);
	});

	test('a rejected placement keeps the piece, so a bot can try another spot', () => {
		const { world, place } = setup();
		world.players.p1.dealt = { current: 'O', next: 'T', placed: false, drawnAt: 0 };
		expect(place('O', 20)).toMatchObject({ success: false, error: 'invalid_placement', pieces: { current: 'O' } });
		expect(place('O', 1)).toMatchObject({ success: true });
	});

	test('throwing pieces away faster than a human can is ignored', () => {
		const { world, gameManager } = setup();
		world.players.p1.dealt = { current: 'O', next: 'T', placed: false, drawnAt: 0 };
		const t0 = 1_000_000;
		gameManager.tetrominoManager.drawPiece(world, 'p1', t0);
		expect(world.players.p1.dealt.current).toBe('T');
		world.players.p1.dealt.next = 'Z';
		gameManager.tetrominoManager.drawPiece(world, 'p1', t0 + DRAW_MIN_INTERVAL_MS - 1);
		expect(world.players.p1.dealt.current).toBe('T');
		gameManager.tetrominoManager.drawPiece(world, 'p1', t0 + DRAW_MIN_INTERVAL_MS);
		expect(world.players.p1.dealt.current).toBe('Z');
	});

	test('a placed piece can be followed by a draw at once', () => {
		const { world, gameManager } = setup();
		world.players.p1.dealt = { current: 'O', next: 'T', placed: true, drawnAt: Date.now() };
		gameManager.tetrominoManager.drawPiece(world, 'p1');
		expect(world.players.p1.dealt).toMatchObject({ current: 'T', placed: false });
	});

	test('draws follow the 7-bag: every shape once per seven', () => {
		const { world, gameManager } = setup();
		const seen = [];
		let now = 1_000_000;
		gameManager.tetrominoManager.dealtPieces(world, 'p1');
		world.players.p1.tetrominoBag = [];
		world.players.p1.dealt = null;
		for (let i = 0; i < 14; i++) {
			const dealt = i === 0 ? gameManager.tetrominoManager.dealtPieces(world, 'p1') : gameManager.tetrominoManager.drawPiece(world, 'p1', now += DRAW_MIN_INTERVAL_MS);
			seen.push(dealt.current);
		}
		expect([...seen.slice(0, 7)].sort()).toEqual(TYPES);
		expect([...seen.slice(7, 14)].sort()).toEqual(TYPES);
	});

	test('request_tetromino (bots) returns the dealt piece, moving on only after a placement', () => {
		const { world, call, place } = setup();
		world.players.p1.dealt = { current: 'O', next: 'T', placed: false, drawnAt: 0 };
		expect(call('request_tetromino', {}).tetromino.pieceType).toBe('O');
		expect(call('request_tetromino', {}).tetromino.pieceType).toBe('O');
		place('O');
		expect(call('request_tetromino', {}).tetromino.pieceType).toBe('T');
	});
});
