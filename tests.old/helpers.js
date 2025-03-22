/**
 * Test Helpers
 * 
 * Common utilities for testing
 */

import { expect } from 'chai';

// Constants for testing
export const TEST_CONSTANTS = {
	BOARD_WIDTH: 24,
	BOARD_HEIGHT: 24,
	HOME_ZONE_WIDTH: 8,
	HOME_ZONE_HEIGHT: 2,
	PIECE_TYPES: {
		PAWN: 'PAWN',
		KNIGHT: 'KNIGHT',
		BISHOP: 'BISHOP',
		ROOK: 'ROOK',
		QUEEN: 'QUEEN',
		KING: 'KING'
	},
	TETROMINO_TYPES: ['I', 'O', 'T', 'S', 'Z', 'J', 'L'],
	DIRECTIONS: {
		LEFT: 'LEFT',
		RIGHT: 'RIGHT',
		DOWN: 'DOWN'
	}
};

// Create a mock board for testing
export const createMockBoard = (width = TEST_CONSTANTS.BOARD_WIDTH, height = TEST_CONSTANTS.BOARD_HEIGHT) => {
	const board = Array(height).fill(null).map(() => Array(width).fill(null));
	return board;
};

// Create a mock game state for testing
export const createMockGameState = (overrides = {}) => {
	return {
		board: createMockBoard(),
		players: {},
		homeZones: {},
		fallingPiece: null,
		config: {
			boardWidth: TEST_CONSTANTS.BOARD_WIDTH,
			boardHeight: TEST_CONSTANTS.BOARD_HEIGHT,
			homeZoneWidth: TEST_CONSTANTS.HOME_ZONE_WIDTH,
			homeZoneHeight: TEST_CONSTANTS.HOME_ZONE_HEIGHT
		},
		...overrides
	};
};

// Create a mock player for testing
export const createMockPlayer = (id, overrides = {}) => {
	return {
		id,
		username: `Player${id}`,
		color: '#ff0000',
		pieces: [],
		score: 0,
		homeZone: {
			x: 0,
			y: 0,
			width: TEST_CONSTANTS.HOME_ZONE_WIDTH,
			height: TEST_CONSTANTS.HOME_ZONE_HEIGHT
		},
		...overrides
	};
};

// Create a mock chess piece for testing
export const createMockChessPiece = (type, playerId, position, overrides = {}) => {
	return {
		id: `piece-${Math.random().toString(36).substr(2, 9)}`,
		type,
		playerId,
		position,
		moves: 0,
		...overrides
	};
};

// Create a mock tetromino for testing
export const createMockTetromino = (type, position, overrides = {}) => {
	return {
		type,
		position,
		blocks: [], // Should be filled based on type
		color: '#ff0000',
		...overrides
	};
};

// Assertion helpers
export const assertBoardEquals = (actual, expected) => {
	expect(actual).to.deep.equal(expected);
};

export const assertPositionEquals = (actual, expected) => {
	expect(actual.x).to.equal(expected.x);
	expect(actual.y).to.equal(expected.y);
}; 