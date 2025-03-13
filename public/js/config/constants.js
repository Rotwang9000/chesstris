/**
 * Game Constants
 * Contains constants used throughout the game
 */

export const Constants = {
	// Board dimensions
	BOARD_SIZE: 8,
	CELL_SIZE: 1,
	BOARD_HEIGHT: 0.5,
	
	// Game settings
	GRAVITY: 0.02,
	FALLING_SPEED: 0.5,
	MOVE_SPEED: 0.2,
	
	// Rendering settings
	SHADOW_MAP_SIZE: 2048,
	FOV: 60,
	NEAR_PLANE: 0.1,
	FAR_PLANE: 1000,
	
	// Colors
	COLORS: {
		BOARD_LIGHT: 0xEEEEEE,
		BOARD_DARK: 0x888888,
		PLAYER_1: 0x2196F3,
		PLAYER_2: 0xF44336,
		GHOST: 0x80CBC4,
		HIGHLIGHT: 0xFFEB3B
	},
	
	// Tetromino shapes
	SHAPES: {
		I: [
			[1, 1, 1, 1]
		],
		J: [
			[1, 0, 0],
			[1, 1, 1]
		],
		L: [
			[0, 0, 1],
			[1, 1, 1]
		],
		O: [
			[1, 1],
			[1, 1]
		],
		S: [
			[0, 1, 1],
			[1, 1, 0]
		],
		T: [
			[0, 1, 0],
			[1, 1, 1]
		],
		Z: [
			[1, 1, 0],
			[0, 1, 1]
		]
	}
};

export default Constants; 