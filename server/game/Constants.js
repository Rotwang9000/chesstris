/**
 * Constants.js - Game constants and configuration values
 * This module centralizes all game-related constants for easy configuration
 */

// Game board settings
const BOARD_SETTINGS = {
	DEFAULT_WIDTH: 30,
	DEFAULT_HEIGHT: 30,
	MIN_HOME_ZONE_DISTANCE: 8,
	MAX_HOME_ZONE_DISTANCE: 12,
	HOME_ZONE_WIDTH: 8,
	HOME_ZONE_HEIGHT: 2,
	HOME_ZONE_DEGRADATION_INTERVAL: 300000, // 5 minutes
	MAX_PLAYERS_PER_GAME: 2048,
	DEFAULT_CELL_SIZE: 1,
	HOME_ZONE_DISTANCE: 16,  // Exact distance for 8-move pawn clash
	HOME_ZONE_SIZE: 5,       // Standard home zone size
	// Direction vectors for spiral pattern
	SPIRAL_DIRECTIONS: [
		{ x: 1, z: 0 },  // Right (+X)
		{ x: 0, z: 1 },  // Down (+Z)
		{ x: -1, z: 0 }, // Left (-X)
		{ x: 0, z: -1 }  // Up (-Z)
	]
};

// Player settings
const PLAYER_SETTINGS = {
	MIN_MOVE_TIME: 10000, // 10 seconds minimum between moves
	DEFAULT_MOVE_TYPE: 'tetromino',
	PAUSE_CHECK_INTERVAL: 60000, // 1 minute
	MAX_PAUSE_DURATION: 900000 // 15 minutes
};

// Difficulty settings
const DIFFICULTY_SETTINGS = {
	EASY: {
		name: 'easy',
		minMoveInterval: 15000 // 15 seconds
	},
	MEDIUM: {
		name: 'medium',
		minMoveInterval: 10000 // 10 seconds
	},
	HARD: {
		name: 'hard',
		minMoveInterval: 5000 // 5 seconds
	}
};

// Piece prices in SOL
const PIECE_PRICES = {
	PAWN: 0.1,
	ROOK: 0.5,
	KNIGHT: 0.5,
	BISHOP: 0.5,
	QUEEN: 1.0
	// Kings cannot be purchased
};

// Tetromino shapes
const TETROMINO_SHAPES = {
	I: [
		[[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
		[[0, 0, 1, 0], [0, 0, 1, 0], [0, 0, 1, 0], [0, 0, 1, 0]],
		[[0, 0, 0, 0], [0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0]],
		[[0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0]]
	],
	O: [
		[[1, 1], [1, 1]],
		[[1, 1], [1, 1]],
		[[1, 1], [1, 1]],
		[[1, 1], [1, 1]]
	],
	T: [
		[[0, 1, 0], [1, 1, 1], [0, 0, 0]],
		[[0, 1, 0], [0, 1, 1], [0, 1, 0]],
		[[0, 0, 0], [1, 1, 1], [0, 1, 0]],
		[[0, 1, 0], [1, 1, 0], [0, 1, 0]]
	],
	S: [
		[[0, 1, 1], [1, 1, 0], [0, 0, 0]],
		[[0, 1, 0], [0, 1, 1], [0, 0, 1]],
		[[0, 0, 0], [0, 1, 1], [1, 1, 0]],
		[[1, 0, 0], [1, 1, 0], [0, 1, 0]]
	],
	Z: [
		[[1, 1, 0], [0, 1, 1], [0, 0, 0]],
		[[0, 0, 1], [0, 1, 1], [0, 1, 0]],
		[[0, 0, 0], [1, 1, 0], [0, 1, 1]],
		[[0, 1, 0], [1, 1, 0], [1, 0, 0]]
	],
	J: [
		[[1, 0, 0], [1, 1, 1], [0, 0, 0]],
		[[0, 1, 1], [0, 1, 0], [0, 1, 0]],
		[[0, 0, 0], [1, 1, 1], [0, 0, 1]],
		[[0, 1, 0], [0, 1, 0], [1, 1, 0]]
	],
	L: [
		[[0, 0, 1], [1, 1, 1], [0, 0, 0]],
		[[0, 1, 0], [0, 1, 0], [0, 1, 1]],
		[[0, 0, 0], [1, 1, 1], [1, 0, 0]],
		[[1, 1, 0], [0, 1, 0], [0, 1, 0]]
	]
};

// Chess piece starting positions (relative to home zone top-left)
const CHESS_PIECE_POSITIONS = {
	KING: { x: 4, z: 0 },
	QUEEN: { x: 3, z: 0 },
	BISHOP1: { x: 2, z: 0 },
	BISHOP2: { x: 5, z: 0 },
	KNIGHT1: { x: 1, z: 0 },
	KNIGHT2: { x: 6, z: 0 },
	ROOK1: { x: 0, z: 0 },
	ROOK2: { x: 7, z: 0 },
	PAWNS: [
		{ x: 0, z: 1 }, { x: 1, z: 1 }, { x: 2, z: 1 }, { x: 3, z: 1 },
		{ x: 4, z: 1 }, { x: 5, z: 1 }, { x: 6, z: 1 }, { x: 7, z: 1 }
	]
};

// Game rules
const GAME_RULES = {
	REQUIRED_CELLS_FOR_ROW_CLEARING: 8,
	PAWN_PROMOTION_DISTANCE: 8
};

// Export all constants
module.exports = {
	BOARD_SETTINGS,
	PLAYER_SETTINGS,
	DIFFICULTY_SETTINGS,
	PIECE_PRICES,
	TETROMINO_SHAPES,
	CHESS_PIECE_POSITIONS,
	GAME_RULES
}; 