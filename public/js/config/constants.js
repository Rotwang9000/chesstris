/**
 * Constants Configuration
 * 
 * Contains all constants used by the rendering modules.
 */

// Export constants as an object
export const Constants = {
	// Board dimensions
	BOARD_WIDTH: 10,
	BOARD_HEIGHT: 20,
	
	// Cell size
	CELL_SIZE: 30,
	
	// Camera settings
	FOV: 60,
	NEAR_PLANE: 0.1,
	FAR_PLANE: 1000,
	
	// Render modes
	RENDER_MODE: {
		MODE_2D: '2d',
		MODE_3D: '3d'
	},
	
	// Colors
	COLORS: {
		BACKGROUND: 0x87CEEB,
		GRID: 0xCCCCCC,
		HOME_ZONE: 0xFFD54F,
		CELL: 0x4FC3F7
	},
	
	// Texture paths
	TEXTURE_PATHS: {
		BOARD: './assets/textures/board.png',
		CELL: './assets/textures/cell.png',
		HOME_ZONE: './assets/textures/home_zone.png'
	},
	
	// Tetromino types
	TETROMINO_TYPES: {
		I: {
			shape: [
				[0, 0, 0, 0],
				[1, 1, 1, 1],
				[0, 0, 0, 0],
				[0, 0, 0, 0]
			],
			color: 0x00FFFF // Cyan
		},
		J: {
			shape: [
				[1, 0, 0],
				[1, 1, 1],
				[0, 0, 0]
			],
			color: 0x0000FF // Blue
		},
		L: {
			shape: [
				[0, 0, 1],
				[1, 1, 1],
				[0, 0, 0]
			],
			color: 0xFF7F00 // Orange
		},
		O: {
			shape: [
				[1, 1],
				[1, 1]
			],
			color: 0xFFFF00 // Yellow
		},
		S: {
			shape: [
				[0, 1, 1],
				[1, 1, 0],
				[0, 0, 0]
			],
			color: 0x00FF00 // Green
		},
		T: {
			shape: [
				[0, 1, 0],
				[1, 1, 1],
				[0, 0, 0]
			],
			color: 0x800080 // Purple
		},
		Z: {
			shape: [
				[1, 1, 0],
				[0, 1, 1],
				[0, 0, 0]
			],
			color: 0xFF0000 // Red
		}
	}
};

export default Constants; 