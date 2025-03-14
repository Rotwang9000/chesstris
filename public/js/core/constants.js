/**
 * Game Constants
 * 
 * Contains all game constants and configuration values.
 */

// Game constants
export const GAME_CONSTANTS = {
	// Board dimensions
	BOARD_WIDTH: 10,
	BOARD_HEIGHT: 20,
	
	// Cell size
	CELL_SIZE: 30,
	
	// Game modes
	GAME_MODE: {
		SINGLE_PLAYER: 'single_player',
		MULTIPLAYER: 'multiplayer',
		TUTORIAL: 'tutorial'
	},
	
	// Render modes
	RENDER_MODE: {
		MODE_2D: '2d',
		MODE_3D: '3d'
	},
	
	// Game states
	GAME_STATE: {
		LOADING: 'loading',
		READY: 'ready',
		PLAYING: 'playing',
		PAUSED: 'paused',
		GAME_OVER: 'game_over'
	},
	
	// Input modes
	INPUT_MODE: {
		TETROMINO: 'tetromino',
		CHESS: 'chess',
		UI: 'ui'
	},
	
	// Game speeds (ms per tick)
	SPEED: {
		SLOW: 1000,
		NORMAL: 800,
		FAST: 500,
		TURBO: 200,
		MAX: 100
	},
	
	// Lock delay (ms)
	LOCK_DELAY: 500,
	
	// Lines per level
	LINES_PER_LEVEL: 10,
	
	// Scoring
	SCORING: {
		SOFT_DROP: 1,
		HARD_DROP: 2,
		SINGLE: 100,
		DOUBLE: 300,
		TRIPLE: 500,
		TETRIS: 800,
		BACK_TO_BACK_MULTIPLIER: 1.5,
		COMBO_MULTIPLIER: 50,
		CHESS_CAPTURE: 200,
		CHESS_CHECK: 500,
		CHESS_CHECKMATE: 1000
	},
	
	// Network update rate (ms)
	NETWORK_UPDATE_RATE: 100,
	
	// Input constants
	KEY_REPEAT_DELAY: 150,
	SWIPE_THRESHOLD: 30,
	
	// Animation durations (ms)
	ANIMATION: {
		PIECE_MOVE: 100,
		PIECE_ROTATE: 100,
		LINE_CLEAR: 200,
		LEVEL_UP: 500
	},
	
	// Debug settings
	DEBUG: {
		SHOW_GRID: true,
		SHOW_COLLISION: false,
		SHOW_FPS: true,
		LOG_LEVEL: 'info' // 'debug', 'info', 'warn', 'error'
	},
	
	// Game settings
	SETTINGS: {
		GRAVITY_FACTOR: 0.8,
		LINES_PER_LEVEL: 10,
		NEXT_PIECES: 3,
		GHOST_PIECE_ENABLED: true,
		HOLD_ENABLED: true
	}
};

// Keyboard controls
export const KEYBOARD_CONTROLS = {
	// Tetromino controls
	MOVE_LEFT: 'ArrowLeft',
	MOVE_RIGHT: 'ArrowRight',
	MOVE_DOWN: 'ArrowDown',
	MOVE_UP: 'ArrowUp', // Used for chess
	ROTATE: 'z',
	COUNTER_ROTATE: 'x',
	HARD_DROP: ' ', // Space
	QUICK_DROP: 'Shift',
	HOLD: 'c',
	
	// Chess controls
	SELECT: 'Enter',
	CONFIRM: 'Enter',
	CANCEL: 'Escape',
	
	// Game controls
	PAUSE: 'p',
	MUTE: 'm',
	DEBUG: 'F12',
	
	// New controls
	LEFT: ['ArrowLeft', 'a', 'A'],
	RIGHT: ['ArrowRight', 'd', 'D'],
	DOWN: ['ArrowDown', 's', 'S'],
	ROTATE: ['ArrowUp', 'w', 'W'],
	HARD_DROP: [' ', 'Space'],
	HOLD: ['Shift', 'c', 'C'],
	PAUSE: ['Escape', 'p', 'P']
};

// Touch controls
export const TOUCH_CONTROLS = {
	SWIPE_LEFT: 'swipe_left',
	SWIPE_RIGHT: 'swipe_right',
	SWIPE_DOWN: 'swipe_down',
	SWIPE_UP: 'swipe_up',
	TAP: 'tap',
	DOUBLE_TAP: 'double_tap',
	LONG_PRESS: 'long_press'
};

// Player colors
export const PLAYER_COLORS = {
	WHITE: 0xFFFFFF,
	BLACK: 0x000000
};

// Tetromino types
export const TETROMINO_TYPES = {
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
};

// Tetromino shapes
export const TETROMINO_SHAPES = {
	I: [
		[0, 0, 0, 0],
		[1, 1, 1, 1],
		[0, 0, 0, 0],
		[0, 0, 0, 0]
	],
	J: [
		[1, 0, 0],
		[1, 1, 1],
		[0, 0, 0]
	],
	L: [
		[0, 0, 1],
		[1, 1, 1],
		[0, 0, 0]
	],
	O: [
		[1, 1],
		[1, 1]
	],
	S: [
		[0, 1, 1],
		[1, 1, 0],
		[0, 0, 0]
	],
	T: [
		[0, 1, 0],
		[1, 1, 1],
		[0, 0, 0]
	],
	Z: [
		[1, 1, 0],
		[0, 1, 1],
		[0, 0, 0]
	]
};

// Tetromino colors
export const TETROMINO_COLORS = {
	I: '#00FFFF', // Cyan
	J: '#0000FF', // Blue
	L: '#FF7F00', // Orange
	O: '#FFFF00', // Yellow
	S: '#00FF00', // Green
	T: '#800080', // Purple
	Z: '#FF0000'  // Red
};

// Chess piece types
export const CHESS_PIECE_TYPES = {
	PAWN: {
		value: 1,
		moves: [
			{ dx: 0, dy: 1, capture: false },
			{ dx: 0, dy: 2, capture: false, firstMoveOnly: true },
			{ dx: -1, dy: 1, capture: true, requireCapture: true },
			{ dx: 1, dy: 1, capture: true, requireCapture: true }
		]
	},
	KNIGHT: {
		value: 3,
		moves: [
			{ dx: 1, dy: 2 },
			{ dx: 2, dy: 1 },
			{ dx: 2, dy: -1 },
			{ dx: 1, dy: -2 },
			{ dx: -1, dy: -2 },
			{ dx: -2, dy: -1 },
			{ dx: -2, dy: 1 },
			{ dx: -1, dy: 2 }
		]
	},
	BISHOP: {
		value: 3,
		moves: [
			{ dx: 1, dy: 1, sliding: true },
			{ dx: 1, dy: -1, sliding: true },
			{ dx: -1, dy: -1, sliding: true },
			{ dx: -1, dy: 1, sliding: true }
		]
	},
	ROOK: {
		value: 5,
		moves: [
			{ dx: 0, dy: 1, sliding: true },
			{ dx: 1, dy: 0, sliding: true },
			{ dx: 0, dy: -1, sliding: true },
			{ dx: -1, dy: 0, sliding: true }
		]
	},
	QUEEN: {
		value: 9,
		moves: [
			{ dx: 0, dy: 1, sliding: true },
			{ dx: 1, dy: 1, sliding: true },
			{ dx: 1, dy: 0, sliding: true },
			{ dx: 1, dy: -1, sliding: true },
			{ dx: 0, dy: -1, sliding: true },
			{ dx: -1, dy: -1, sliding: true },
			{ dx: -1, dy: 0, sliding: true },
			{ dx: -1, dy: 1, sliding: true }
		]
	},
	KING: {
		value: 0, // Infinite value
		moves: [
			{ dx: 0, dy: 1 },
			{ dx: 1, dy: 1 },
			{ dx: 1, dy: 0 },
			{ dx: 1, dy: -1 },
			{ dx: 0, dy: -1 },
			{ dx: -1, dy: -1 },
			{ dx: -1, dy: 0 },
			{ dx: -1, dy: 1 }
		]
	}
};

// Chess piece values
export const CHESS_PIECE_VALUES = {
	[CHESS_PIECE_TYPES.KING]: 0, // Infinite value, but 0 for calculation
	[CHESS_PIECE_TYPES.QUEEN]: 9,
	[CHESS_PIECE_TYPES.ROOK]: 5,
	[CHESS_PIECE_TYPES.BISHOP]: 3,
	[CHESS_PIECE_TYPES.KNIGHT]: 3,
	[CHESS_PIECE_TYPES.PAWN]: 1
};

// Network events
export const NETWORK_EVENTS = {
	CONNECT: 'connect',
	DISCONNECT: 'disconnect',
	JOIN_ROOM: 'join_room',
	LEAVE_ROOM: 'leave_room',
	GAME_START: 'game_start',
	GAME_END: 'game_end',
	PLAYER_MOVE: 'player_move',
	PLAYER_ACTION: 'player_action',
	GAME_STATE: 'game_state',
	CHAT_MESSAGE: 'chat_message',
	ERROR: 'error'
};

// Socket events (for client-server communication)
export const SOCKET_EVENTS = {
	CONNECT: 'connect',
	DISCONNECT: 'disconnect',
	JOIN_GAME: 'join_game',
	LEAVE_GAME: 'leave_game',
	PLAYER_READY: 'player_ready',
	PLAYER_MOVE: 'player_move',
	PLACE_TETROMINO: 'place_tetromino',
	MOVE_CHESS_PIECE: 'move_chess_piece',
	GAME_STATE_UPDATE: 'game_state_update',
	CHAT_MESSAGE: 'chat_message',
	ERROR: 'error',
	PING: 'ping',
	PONG: 'pong'
};

// API endpoints
export const API_ENDPOINTS = {
	LOGIN: '/api/login',
	LOGOUT: '/api/logout',
	REGISTER: '/api/register',
	PROFILE: '/api/profile',
	LEADERBOARD: '/api/leaderboard',
	GAMES: '/api/games',
	MATCHMAKING: '/api/matchmaking',
	GAME: '/api/game',
	PLAYER: '/api/player',
	SCORES: '/api/scores'
};

// Local storage keys
export const STORAGE_KEYS = {
	SESSION_ID: 'shaktris_session_id',
	PLAYER_ID: 'shaktris_player_id',
	PLAYER_NAME: 'shaktris_player_name',
	HIGH_SCORES: 'shaktris_high_scores',
	SETTINGS: 'shaktris_settings'
};

// Direction constants
export const DIRECTION = {
	UP: 'up',
	RIGHT: 'right',
	DOWN: 'down',
	LEFT: 'left'
};

// Event types
export const EVENT_TYPES = {
	PIECE_MOVE: 'piece_move',
	PIECE_ROTATE: 'piece_rotate',
	PIECE_LOCK: 'piece_lock',
	LINE_CLEAR: 'line_clear',
	LEVEL_UP: 'level_up',
	GAME_OVER: 'game_over',
	CHESS_MOVE: 'chess_move',
	CHESS_CAPTURE: 'chess_capture'
};

// Sound effects
export const SOUND_EFFECTS = {
	MOVE: 'move',
	ROTATE: 'rotate',
	LOCK: 'lock',
	LINE_CLEAR: 'line_clear',
	TETRIS: 'tetris',
	LEVEL_UP: 'level_up',
	GAME_OVER: 'game_over',
	CHESS_MOVE: 'chess_move',
	CHESS_CAPTURE: 'chess_capture',
	MENU_SELECT: 'menu_select',
	MENU_CONFIRM: 'menu_confirm'
};

// Default settings
export const DEFAULT_SETTINGS = {
	volume: 0.5,
	musicVolume: 0.3,
	sfxVolume: 0.7,
	renderMode: GAME_CONSTANTS.RENDER_MODE.MODE_3D,
	showGhost: true,
	showGrid: true,
	showNextPieces: true,
	showHeldPiece: true
};
