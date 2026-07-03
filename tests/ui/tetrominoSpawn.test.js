/**
 * @jest-environment jsdom
 *
 * Tetromino spawn anchoring (public/js/tetromino/spawn.js).
 *
 * The falling piece belongs to the LOCAL player, so it must spawn
 * anchored to the local king — NOT to `currentPlayer`, which is the
 * whose-turn field and can point at any other player in the shared
 * world (or a battle bot). The regression showed up in 4-seat battles
 * as the local piece materialising above a bot's home zone.
 */

// The real boardFunctions barrel drags in the network stack (socket.io
// via networkManager) which cannot load under jest. Substitute just
// the king lookup the spawn search needs; the validation helpers are
// stubbed so the position search runs deterministically over an empty
// board.
jest.mock('../../public/js/boardFunctions.js', () => ({
	boardFunctions: {
		getPlayersKing(gameState, playerId) {
			const king = (gameState.chessPieces || []).find(
				p => p && p.type === 'king' && String(p.player) === String(playerId)
			);
			if (!king) return null;
			return king;
		},
		isTetrominoAdjacentToExistingCells: () => false,
	},
}));
jest.mock('../../public/utils/sponsors.js', () => ({
	fetchNextSponsor: () => Promise.resolve(null),
}));
jest.mock('../../public/js/tetromino/validation.js', () => ({
	isValidTetrominoPosition: () => true,
	isTetrominoAdjacentToExistingCells: () => false,
}));
jest.mock('../../public/js/tetromino/nextPiece.js', () => ({
	updateNextTetrominoDisplay: () => {},
}));

import { determineInitialTetrominoPosition } from '../../public/js/tetromino/spawn.js';

const SHAPE_O = [
	[1, 1],
	[1, 1],
];

/**
 * Minimal state: two kings far apart, empty board (adjacency check
 * fails everywhere so the search falls through to the non-adjacent
 * pass, which still scans around the anchor king).
 */
function makeState({ localPlayerId, currentPlayer }) {
	return {
		localPlayerId,
		currentPlayer,
		board: { cells: {} },
		chessPieces: [
			{ id: 'k-me', type: 'king', player: 'me', position: { x: 10, z: 10 }, orientation: 0 },
			{ id: 'k-bot', type: 'king', player: 'bot', position: { x: 500, z: 500 }, orientation: 0 },
		],
	};
}

function distance(pos, king) {
	return Math.hypot(pos.x - king.x, pos.z - king.z);
}

describe('determineInitialTetrominoPosition', () => {
	test('anchors to the local king even when it is another player\'s turn', () => {
		const state = makeState({ localPlayerId: 'me', currentPlayer: 'bot' });
		const pos = determineInitialTetrominoPosition(state, SHAPE_O);
		expect(pos).not.toBeNull();
		expect(distance(pos, { x: 10, z: 10 })).toBeLessThan(30);
		expect(distance(pos, { x: 500, z: 500 })).toBeGreaterThan(400);
	});

	test('falls back to currentPlayer when no local id is known', () => {
		const state = makeState({ localPlayerId: null, currentPlayer: 'bot' });
		const pos = determineInitialTetrominoPosition(state, SHAPE_O);
		expect(pos).not.toBeNull();
		expect(distance(pos, { x: 500, z: 500 })).toBeLessThan(30);
	});

	test('returns null when the anchor player has no king', () => {
		const state = makeState({ localPlayerId: 'ghost', currentPlayer: 'ghost' });
		state.chessPieces = [];
		expect(determineInitialTetrominoPosition(state, SHAPE_O)).toBeNull();
	});
});
