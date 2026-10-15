/**
 * `tetromino_placed` only accepts integer coordinates.
 *
 * Cell keys are built as `${x + j},${z + i}`. A string x of "0" made
 * "00,0" — a second key for square (0,0) that the occupied and
 * safe-zone checks looked up and found empty, while adjacency (which
 * does arithmetic, so "00" - 1 === -1) still passed. A modified client
 * could overlay an enemy's cells and pieces.
 */

const path = require('path');

const World = require(path.join('..', '..', 'server', 'world', 'World'));
const GameManager = require(path.join('..', '..', 'server', 'game', 'GameManager'));
const { registerTetrominoHandlers } = require(path.join('..', '..', 'server', 'sockets', 'tetromino'));

function setupBoard() {
	World.resetWorld({ id: 'global_game' });
	World.upsertPlayer('p1', { color: 1 });
	World.upsertPlayer('p2', { color: 2 });
	const world = World.getWorld();
	world.players.p1.lastTetrominoPlacement = 1;
	world.players.p1.dealt = { current: 'O', next: 'T', placed: false, drawnAt: 0 };
	// p1's king stands on its own cell at (-1, 0).
	world.board.cells['-1,0'] = [
		{ type: 'tetromino', player: 'p1' },
		{ type: 'chess', player: 'p1', pieceId: 'k1', pieceType: 'king' },
	];
	world.chessPieces.push({ id: 'k1', type: 'KING', player: 'p1', position: { x: -1, z: 0 } });
	// p2 owns the 2×2 block at (0..1, 0..1), with a pawn on (0, 0).
	for (const key of ['0,0', '1,0', '0,1', '1,1']) world.board.cells[key] = [{ type: 'tetromino', player: 'p2' }];
	world.board.cells['0,0'].push({ type: 'chess', player: 'p2', pieceId: 'pp', pieceType: 'pawn' });
	world.chessPieces.push({ id: 'pp', type: 'PAWN', player: 'p2', position: { x: 0, z: 0 } });
	return world;
}

function registerFor(playerId) {
	const handlers = new Map();
	const emitted = [];
	const socket = {
		id: `socket-${playerId}`,
		on(event, handler) { handlers.set(event, handler); },
		emit(event, payload) { emitted.push({ event, payload }); },
		to() { return { emit() {} }; },
	};
	registerTetrominoHandlers(socket, {
		playerId,
		io: { to() { return { emit() {} }; } },
		gameManager: new GameManager(),
		broadcaster: { broadcastGameUpdate() {} },
		integrityService: { runIslandIntegrityPass() { return {}; } },
		spectatorRegistry: { broadcastUpdate() {} },
		lineClearService: { runCascade: () => Promise.resolve({ rows: [], cols: [] }) },
		activityLog: null,
	});
	return {
		emitted,
		place(position) {
			let ack = null;
			World.getPlayer(playerId).lastTetrominoPlacementAt = 0;
			handlers.get('tetromino_placed')({ tetromino: { type: 'O', rotation: 0, position } }, (r) => { ack = r; });
			return ack;
		},
	};
}

describe('tetromino_placed position input', () => {
	test('a numeric overlap with enemy cells is rejected as occupied', () => {
		setupBoard();
		expect(registerFor('p1').place({ x: 0, z: 0 })).toMatchObject({ success: false, reason: 'occupied' });
	});

	test.each([
		['string x', { x: '0', z: 0 }],
		['string z', { x: 0, z: '0' }],
		['padded string', { x: ' 0', z: 0 }],
		['fraction', { x: 0.5, z: 0 }],
		['NaN', { x: NaN, z: 0 }],
		['Infinity', { x: Infinity, z: 0 }],
		['missing z', { x: 0 }],
		['null position', null],
	])('%s is rejected without touching the board', (_label, position) => {
		const world = setupBoard();
		const before = Object.keys(world.board.cells).sort();
		const client = registerFor('p1');
		const ack = client.place(position);
		expect(ack).toMatchObject({ success: false, error: 'Invalid tetromino position' });
		expect(Object.keys(world.board.cells).sort()).toEqual(before);
		expect(client.emitted.some(e => e.event === 'tetrominoFailed')).toBe(true);
	});
});
