/**
 * Tests for `server/king/detonation.js`.
 *
 * These tests cover only the pure logic that doesn't touch the live world
 * singleton — `computeExplosionSequence` and `groupSequenceIntoLayers`. The
 * service that drives the layer-by-layer cell removal is tested
 * end-to-end via the AI runner / chess move flows.
 */

const {
	computeExplosionSequence,
	groupSequenceIntoLayers,
} = require('../../server/king/detonation');
const BoardManager = require('../../server/game/BoardManager');

function makeGame() {
	const boardManager = new BoardManager();
	return {
		boardManager,
		game: {
			id: 'test-world',
			board: boardManager.createEmptyBoard(),
			players: {},
			chessPieces: [],
		},
	};
}

function place(boardManager, board, x, z, owner) {
	boardManager.setCell(board, x, z, [{ type: 'tetromino', player: owner }]);
}

describe('king detonation — sequence builder', () => {
	test('returns an empty sequence when the player owns nothing', () => {
		const { game } = makeGame();
		const sequence = computeExplosionSequence(game, 'p1', 0, 0);
		expect(sequence).toEqual([]);
	});

	test('cells further from the king explode first', () => {
		const { boardManager, game } = makeGame();
		place(boardManager, game.board, 5, 5, 'p1');
		place(boardManager, game.board, 5, 6, 'p1');
		place(boardManager, game.board, 5, 7, 'p1');
		place(boardManager, game.board, 5, 8, 'p1');

		const sequence = computeExplosionSequence(game, 'p1', 5, 5);

		// Furthest from king (5,8) → distance 3 → first to explode.
		expect(sequence[0]).toMatchObject({ x: 5, z: 8, distance: 3 });
		// King's own cell is at distance 0 → explodes last.
		expect(sequence[sequence.length - 1]).toMatchObject({ x: 5, z: 5, distance: 0 });
	});

	test('disconnected remnants explode after the connected ring', () => {
		const { boardManager, game } = makeGame();
		// Connected blob around the king.
		place(boardManager, game.board, 0, 0, 'p1');
		place(boardManager, game.board, 1, 0, 'p1');

		// Disconnected remnant somewhere far off.
		place(boardManager, game.board, 10, 10, 'p1');

		const sequence = computeExplosionSequence(game, 'p1', 0, 0);
		// Three cells total.
		expect(sequence).toHaveLength(3);

		// The disconnected remnant has the largest distance value so it's
		// at the front of the explosion order (furthest = first).
		expect(sequence[0]).toMatchObject({ x: 10, z: 10 });
		expect(sequence[0].distance).toBeGreaterThan(sequence[1].distance);
	});

	test('ignores other players cells', () => {
		const { boardManager, game } = makeGame();
		place(boardManager, game.board, 0, 0, 'p1');
		place(boardManager, game.board, 1, 0, 'p2');
		place(boardManager, game.board, 2, 0, 'p1');

		const sequence = computeExplosionSequence(game, 'p1', 0, 0);
		const coords = sequence.map(c => `${c.x},${c.z}`);
		expect(coords).toContain('0,0');
		expect(coords).toContain('2,0');
		expect(coords).not.toContain('1,0');
	});
});

describe('king detonation — layer grouping', () => {
	test('groups cells into furthest-first layers', () => {
		const sequence = [
			{ x: 0, z: 3, distance: 3 },
			{ x: 0, z: 2, distance: 2 },
			{ x: 1, z: 2, distance: 2 },
			{ x: 0, z: 1, distance: 1 },
			{ x: 0, z: 0, distance: 0 },
		];

		const layers = groupSequenceIntoLayers(sequence);
		// Layer 0 = furthest (distance 3).
		expect(layers[0]).toEqual([{ x: 0, z: 3, distance: 3 }]);
		expect(layers[1]).toHaveLength(2); // both distance-2 cells together
		expect(layers[layers.length - 1]).toEqual([{ x: 0, z: 0, distance: 0 }]);
	});
});
