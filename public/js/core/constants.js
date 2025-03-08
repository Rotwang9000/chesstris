/**
 * Constants Module
 * 
 * Central location for all game constants and configuration values.
 */

// Board dimensions
export const INITIAL_BOARD_WIDTH = 24;
export const INITIAL_BOARD_HEIGHT = 24;
export const CELL_SIZE = 1;
export const CELL_HEIGHT = 0.2;

// Game settings
export const HOME_ZONE_WIDTH = 8;
export const HOME_ZONE_HEIGHT = 2;
export const COOLDOWN_EASY = 20000;    // 20 seconds
export const COOLDOWN_NORMAL = 10000;  // 10 seconds
export const COOLDOWN_HARD = 5000;     // 5 seconds
export const PAUSE_DURATION = 900000;  // 15 minutes

// Tetromino properties
export const START_Z = 10;
export const FALL_SPEED = 0.05;
export const TETROMINO_COLORS = {
	I: 0x00ffff, // Cyan
	J: 0x0000ff, // Blue
	L: 0xffa500, // Orange
	O: 0xffff00, // Yellow
	S: 0x00ff00, // Green
	T: 0x800080, // Purple
	Z: 0xff0000  // Red
};

// Tetromino shapes
export const TETROMINOES = {
	I: {
		blocks: [
			{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 0, y: 3 }
		],
		color: TETROMINO_COLORS.I
	},
	J: {
		blocks: [
			{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: -1, y: 2 }
		],
		color: TETROMINO_COLORS.J
	},
	L: {
		blocks: [
			{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }
		],
		color: TETROMINO_COLORS.L
	},
	O: {
		blocks: [
			{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }
		],
		color: TETROMINO_COLORS.O
	},
	S: {
		blocks: [
			{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 1 }
		],
		color: TETROMINO_COLORS.S
	},
	T: {
		blocks: [
			{ x: 0, y: 0 }, { x: -1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 1 }
		],
		color: TETROMINO_COLORS.T
	},
	Z: {
		blocks: [
			{ x: 0, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }
		],
		color: TETROMINO_COLORS.Z
	}
};

// Chess piece values
export const PIECE_VALUES = {
	'pawn': 0.1,
	'knight': 0.5,
	'bishop': 0.5,
	'rook': 0.5,
	'queen': 1.0
};

// Market settings
export const MARKET_REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes

// Analytics
export const IMPRESSION_FREQUENCY = 0.2;
export const CLICK_VALUE = 0.01;

// Home zone configuration
export const MIN_DISTANCE_BETWEEN_ZONES = 8;
export const MAX_DISTANCE_BETWEEN_ZONES = 12;
export const DEGRADATION_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Tetromino configuration
export const PIECE_HOVER_HEIGHT = 0.2;

// Chess piece types
export const PIECE_TYPES = {
	PAWN: 'pawn',
	ROOK: 'rook',
	KNIGHT: 'knight',
	BISHOP: 'bishop',
	QUEEN: 'queen',
	KING: 'king'
};

// Movement patterns for chess pieces
export const MOVEMENT_PATTERNS = {
	[PIECE_TYPES.PAWN]: {
		moveDirections: [{ dx: 0, dy: 1 }],
		attackDirections: [{ dx: 1, dy: 1 }, { dx: -1, dy: 1 }],
		maxDistance: 1,
		canJump: false
	},
	[PIECE_TYPES.ROOK]: {
		moveDirections: [
			{ dx: 1, dy: 0 }, { dx: -1, dy: 0 },
			{ dx: 0, dy: 1 }, { dx: 0, dy: -1 }
		],
		attackDirections: [
			{ dx: 1, dy: 0 }, { dx: -1, dy: 0 },
			{ dx: 0, dy: 1 }, { dx: 0, dy: -1 }
		],
		maxDistance: Infinity,
		canJump: false
	},
	[PIECE_TYPES.KNIGHT]: {
		moveDirections: [
			{ dx: 1, dy: 2 }, { dx: 2, dy: 1 },
			{ dx: -1, dy: 2 }, { dx: -2, dy: 1 },
			{ dx: 1, dy: -2 }, { dx: 2, dy: -1 },
			{ dx: -1, dy: -2 }, { dx: -2, dy: -1 }
		],
		attackDirections: [
			{ dx: 1, dy: 2 }, { dx: 2, dy: 1 },
			{ dx: -1, dy: 2 }, { dx: -2, dy: 1 },
			{ dx: 1, dy: -2 }, { dx: 2, dy: -1 },
			{ dx: -1, dy: -2 }, { dx: -2, dy: -1 }
		],
		maxDistance: 1,
		canJump: true
	},
	[PIECE_TYPES.BISHOP]: {
		moveDirections: [
			{ dx: 1, dy: 1 }, { dx: -1, dy: 1 },
			{ dx: 1, dy: -1 }, { dx: -1, dy: -1 }
		],
		attackDirections: [
			{ dx: 1, dy: 1 }, { dx: -1, dy: 1 },
			{ dx: 1, dy: -1 }, { dx: -1, dy: -1 }
		],
		maxDistance: Infinity,
		canJump: false
	},
	[PIECE_TYPES.QUEEN]: {
		moveDirections: [
			{ dx: 1, dy: 0 }, { dx: -1, dy: 0 },
			{ dx: 0, dy: 1 }, { dx: 0, dy: -1 },
			{ dx: 1, dy: 1 }, { dx: -1, dy: 1 },
			{ dx: 1, dy: -1 }, { dx: -1, dy: -1 }
		],
		attackDirections: [
			{ dx: 1, dy: 0 }, { dx: -1, dy: 0 },
			{ dx: 0, dy: 1 }, { dx: 0, dy: -1 },
			{ dx: 1, dy: 1 }, { dx: -1, dy: 1 },
			{ dx: 1, dy: -1 }, { dx: -1, dy: -1 }
		],
		maxDistance: Infinity,
		canJump: false
	},
	[PIECE_TYPES.KING]: {
		moveDirections: [
			{ dx: 1, dy: 0 }, { dx: -1, dy: 0 },
			{ dx: 0, dy: 1 }, { dx: 0, dy: -1 },
			{ dx: 1, dy: 1 }, { dx: -1, dy: 1 },
			{ dx: 1, dy: -1 }, { dx: -1, dy: -1 }
		],
		attackDirections: [
			{ dx: 1, dy: 0 }, { dx: -1, dy: 0 },
			{ dx: 0, dy: 1 }, { dx: 0, dy: -1 },
			{ dx: 1, dy: 1 }, { dx: -1, dy: 1 },
			{ dx: 1, dy: -1 }, { dx: -1, dy: -1 }
		],
		maxDistance: 1,
		canJump: false
	}
};

// Sponsor options for tetromino blocks
export const SPONSORS = [
	{ id: 'sponsor1', name: 'TechCorp', image: 'techcorp.png', adUrl: 'https://example.com/ad1' },
	{ id: 'sponsor2', name: 'GameFusion', image: 'gamefusion.png', adUrl: 'https://example.com/ad2' },
	{ id: 'sponsor3', name: 'ChessWorld', image: 'chessworld.png', adUrl: 'https://example.com/ad3' }
];

// Types of magic potions
export const POTION_TYPES = {
	SPEED: 'speed', // Move pieces faster
	JUMP: 'jump',   // Allow pieces to jump over others
	SHIELD: 'shield', // Protect a piece from capture
	GROW: 'grow'    // Expand home zone
};

// Theme configuration
export const THEMES = {
	default: {
		name: 'Default',
		boardColor: 0x333333,
		gridColor: 0x444444,
		backgroundColor: 0x222222,
		highlightColor: 0x00ff00,
		attackHighlightColor: 0xff0000
	},
	russian: {
		name: 'Russian',
		boardColor: 0x3b0000,
		gridColor: 0x4b0000,
		backgroundColor: 0x220000,
		highlightColor: 0xE5B022,
		attackHighlightColor: 0xD52B1E
	}
};

export default {
	INITIAL_BOARD_WIDTH,
	INITIAL_BOARD_HEIGHT,
	CELL_SIZE,
	CELL_HEIGHT,
	HOME_ZONE_WIDTH,
	HOME_ZONE_HEIGHT,
	MIN_DISTANCE_BETWEEN_ZONES,
	MAX_DISTANCE_BETWEEN_ZONES,
	DEGRADATION_INTERVAL,
	START_Z,
	PIECE_HOVER_HEIGHT,
	PIECE_TYPES,
	MOVEMENT_PATTERNS,
	TETROMINOES,
	SPONSORS,
	POTION_TYPES,
	THEMES
}; 