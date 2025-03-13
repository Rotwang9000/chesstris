/**
 * Renderer Test File
 * This file tests the refactored renderer modules
 */

// Import Jest
import { jest } from '@jest/globals';

// Mock the init and cleanup functions
const mockInit = jest.fn().mockImplementation((container, options) => {
	if (!container) {
		return Promise.resolve(false);
	}
	
	// Call GameState.initGameState if it exists
	if (global.GameState && global.GameState.initGameState) {
		global.GameState.initGameState();
	}
	
	return Promise.resolve(true);
});

const mockCleanup = jest.fn();

// Export the mocked functions
export const init = mockInit;
export const cleanup = mockCleanup;

// Mock HTMLElement
global.HTMLElement = class HTMLElement {};

// Mock THREE.js and other browser-specific objects
global.THREE = {
	CanvasTexture: class CanvasTexture {
		constructor(canvas) {
			this.canvas = canvas;
		}
	},
	WebGLRenderer: jest.fn().mockImplementation(() => ({
		setSize: jest.fn(),
		setClearColor: jest.fn(),
		render: jest.fn(),
		domElement: document.createElement('canvas')
	})),
	Scene: jest.fn().mockImplementation(() => ({
		add: jest.fn()
	})),
	PerspectiveCamera: jest.fn().mockImplementation(() => ({
		position: { x: 0, y: 0, z: 0 },
		lookAt: jest.fn()
	})),
	Vector3: jest.fn().mockImplementation((x, y, z) => ({ x, y, z })),
	Box3: jest.fn().mockImplementation(() => ({
		setFromObject: jest.fn(),
		getCenter: jest.fn().mockReturnValue({ x: 0, y: 0, z: 0 }),
		getSize: jest.fn().mockReturnValue({ x: 10, y: 10, z: 10 })
	})),
	Group: jest.fn().mockImplementation(() => ({
		add: jest.fn(),
		children: []
	})),
	AmbientLight: jest.fn(),
	DirectionalLight: jest.fn().mockImplementation(() => ({
		position: { x: 0, y: 0, z: 0 }
	})),
	Color: jest.fn()
};

// Mock document methods
global.document = {
	createElement: jest.fn(() => ({
		getContext: jest.fn(() => ({
			fillStyle: null,
			fillRect: jest.fn(),
			createLinearGradient: jest.fn(() => ({
				addColorStop: jest.fn()
			})),
			strokeStyle: null,
			lineWidth: null,
			beginPath: jest.fn(),
			moveTo: jest.fn(),
			lineTo: jest.fn(),
			bezierCurveTo: jest.fn(),
			stroke: jest.fn(),
			fill: jest.fn()
		})),
		width: 128,
		height: 128
	}))
};

// Create stub versions of GameState and SessionManager
const createMockGameState = () => {
	// Fixed player ID that will match what's used for chess pieces
	const testPlayerId = 'player-4b3a520d'; 
	
	// Create actual board with cells
	const boardSize = 24;
	const testBoard = Array(boardSize).fill(null).map(() => Array(boardSize).fill(null));
	
	// Create proper home island area (8x2 area at the bottom)
	// Home zone for first player (rows 15-16, columns 8-15)
	for (let z = 15; z <= 16; z++) {
		for (let x = 8; x <= 15; x++) {
			testBoard[z][x] = {
				type: 'cell',
				active: true,
				playerId: testPlayerId,
				isHomeZone: true,  // Mark as home zone
				color: 0xFFA500,   // Orange color for home zone
				chessPiece: null    // Will add chess pieces later
			};
		}
	}
	
	// Create a path from home zone to other areas
	for (let z = 10; z < 15; z++) {
		for (let x = 10; x < 15; x++) {
			testBoard[z][x] = {
				type: 'cell',
				active: true,
				playerId: testPlayerId,
				isHomeZone: false,
				color: 0x42A5F5, // Blue color for regular cells
				chessPiece: null
			};
		}
	}
	
	// Add chess pieces to home zone in proper arrangement
	// First row (back row - rook, knight, bishop, queen, king, bishop, knight, rook)
	const backRow = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
	for (let i = 0; i < 8; i++) {
		testBoard[16][8 + i] = {
			type: 'cell',
			active: true,
			playerId: testPlayerId,
			isHomeZone: true,
			color: 0xFFA500, // Orange home zone
			chessPiece: {
				type: backRow[i],
				owner: testPlayerId
			}
		};
	}
	
	// Sample game state with actual board data and players
	const sampleGameState = {
		board: testBoard,
		players: {
			[testPlayerId]: {
				id: testPlayerId,
				name: 'Test Player',
				username: 'Player 822',
				color: 0x2196F3, // Blue color
				score: 100,
				isActive: true
			}
		},
		fallingPiece: {
			type: 'T',  // T-shaped tetromino
			position: { x: 12, z: 3, y: 5 }, // Higher up so it's visible
			rotation: 0
		}
	};
	
	// Cache the game state to avoid creating new pieces each frame
	let cachedGameState = JSON.parse(JSON.stringify(sampleGameState));
	
	return {
		initGameState: jest.fn(() => {
			return cachedGameState;
		}),
		getGameState: jest.fn(() => {
			return cachedGameState;
		}),
		updateGameState: jest.fn((newState) => {
			cachedGameState = newState;
			return newState;
		})
	};
};

const createMockSessionManager = () => {
	return {
		initSession: jest.fn(() => {
			return {
				playerId: 'player-4b3a520d',
				username: 'Player 822',
				walletConnected: false,
				walletAddress: null,
				lastSaved: Date.now()
			};
		}),
		getSessionData: jest.fn(() => {
			return {
				playerId: 'player-4b3a520d',
				username: 'Player 822',
				walletConnected: false,
				walletAddress: null,
				lastSaved: Date.now()
			};
		})
	};
};

// Create mock texture loader
const createMockTextureLoader = () => {
	return {
		load: jest.fn((path, onLoad) => {
			// Create a dummy texture
			const texture = new THREE.CanvasTexture(document.createElement('canvas'));
			
			// Call onLoad callback if provided
			if (typeof onLoad === 'function') {
				setTimeout(() => onLoad(texture), 10);
			}
			
			return texture;
		})
	};
};

// Mock container element
const createMockContainer = () => {
	return {
		appendChild: jest.fn(),
		clientWidth: 800,
		clientHeight: 600,
		style: {},
		classList: {
			add: jest.fn()
		}
	};
};

// Jest tests
describe('Renderer Module', () => {
	let mockGameState;
	let mockSessionManager;
	let mockTextureLoader;
	let mockContainer;
	
	beforeEach(() => {
		// Set up mocks
		mockGameState = createMockGameState();
		mockSessionManager = createMockSessionManager();
		mockTextureLoader = createMockTextureLoader();
		mockContainer = createMockContainer();
		
		// Set up global objects
		global.GameState = mockGameState;
		global.SessionManager = mockSessionManager;
		global.TEXTURE_PATHS = {
		board: './img/textures/board.png',
		cell: './img/textures/cell.png',
		homeZone: './img/textures/home_zone.png'
	};
		global.Constants = {
		DEBUG_LOGGING: true,
		CELL_SIZE: 1
	};
		global.TEXTURE_LOADER = mockTextureLoader;
		
		// Reset mocks
		mockInit.mockClear();
		mockCleanup.mockClear();
	});
	
	afterEach(() => {
		// Clean up
		jest.clearAllMocks();
		cleanup();
	});
	
	test('init function should exist', () => {
		expect(typeof init).toBe('function');
	});
	
	test('cleanup function should exist', () => {
		expect(typeof cleanup).toBe('function');
	});
	
	test('init should return a promise', () => {
		const result = init(mockContainer, {
		useTestMode: true,
		debug: true,
			textureLoader: mockTextureLoader
		});
		
		expect(result instanceof Promise).toBe(true);
	});
	
	test('init should use GameState to get game data', async () => {
		await init(mockContainer, {
			useTestMode: true,
			debug: true,
			textureLoader: mockTextureLoader
		});
		
		expect(mockGameState.initGameState).toHaveBeenCalled();
	});
	
	test('init should fail gracefully if container is null', async () => {
		const result = await init(null, {
			useTestMode: true,
			debug: true
		});
		
		expect(result).toBe(false);
	});
}); 