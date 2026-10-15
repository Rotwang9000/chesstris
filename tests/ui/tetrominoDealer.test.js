/**
 * @jest-environment jsdom
 *
 * Client side of server-dealt tetrominoes (public/js/tetromino/dealer.js).
 * The server decides every shape; the client spawns the piece it already
 * knows is next, asks for a new deal, and corrects a falling piece if
 * the server disagrees.
 */

const mockSent = [];
let mockNextAck = null;
jest.mock('../../public/js/utils/networkManager.js', () => ({
	__esModule: true,
	default: {
		isConnected: () => true,
		sendMessage: (event, data) => {
			mockSent.push(event);
			return Promise.resolve(mockNextAck);
		},
	},
}));
jest.mock('../../public/js/tetromino/rendering.js', () => ({ renderTetromino: jest.fn() }));
jest.mock('../../public/js/tetromino/nextPiece.js', () => ({ updateNextTetrominoDisplay: jest.fn() }));

import { takeDealtPiece, applyServerPieces } from '../../public/js/tetromino/dealer.js';
import { renderTetromino } from '../../public/js/tetromino/rendering.js';

const flush = () => new Promise(r => setTimeout(r, 0));

beforeEach(() => {
	mockSent.length = 0;
	mockNextAck = null;
	renderTetromino.mockClear();
});

describe('takeDealtPiece', () => {
	test('a fresh deal spawns current without asking the server', () => {
		const gameState = { dealtPieces: { current: 'T', next: 'L', used: false } };
		expect(takeDealtPiece(gameState)).toBe('T');
		expect(gameState.nextTetromino).toBe('L');
		expect(mockSent).toEqual([]);
	});

	test('once current is used, the next spawn is `next` and a draw is requested', async () => {
		const gameState = { dealtPieces: { current: 'T', next: 'L', used: true } };
		mockNextAck = { success: true, pieces: { current: 'L', next: 'S' } };
		expect(takeDealtPiece(gameState)).toBe('L');
		expect(mockSent).toEqual(['draw_piece']);
		await flush();
		expect(gameState.dealtPieces).toEqual({ current: 'L', next: 'S', used: true });
		expect(gameState.nextTetromino).toBe('S');
	});

	test('with no deal yet it still spawns something and asks for a deal', () => {
		const gameState = {};
		expect(['I', 'J', 'L', 'O', 'S', 'T', 'Z']).toContain(takeDealtPiece(gameState));
		expect(mockSent).toEqual(['draw_piece']);
	});
});

describe('applyServerPieces', () => {
	test('swaps a still-falling piece the server does not agree with', () => {
		const gameState = { currentTetromino: { type: 'I', shape: [[1, 1, 1, 1]], rotation: 2, heightAboveBoard: 7 } };
		applyServerPieces(gameState, { current: 'O', next: 'Z' });
		expect(gameState.currentTetromino).toMatchObject({ type: 'O', rotation: 0, heightAboveBoard: 7 });
		expect(renderTetromino).toHaveBeenCalled();
	});

	test('leaves a landed piece alone', () => {
		const gameState = { currentTetromino: { type: 'I', shape: [[1, 1, 1, 1]], rotation: 0, heightAboveBoard: 0 } };
		applyServerPieces(gameState, { current: 'O', next: 'Z' });
		expect(gameState.currentTetromino.type).toBe('I');
	});

	test('ignores junk', () => {
		const gameState = { dealtPieces: { current: 'T', next: 'L', used: false } };
		applyServerPieces(gameState, { current: 'X', next: 'L' });
		applyServerPieces(gameState, undefined);
		expect(gameState.dealtPieces).toEqual({ current: 'T', next: 'L', used: false });
	});
});
