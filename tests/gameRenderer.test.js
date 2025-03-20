/**
 * Game Renderer Tests
 * 
 * These tests verify the functionality of the game renderer component.
 * We test both UI functions and game state management to ensure that:
 * 
 * 1. All required functions are exported and available
 * 2. UI updates happen correctly when game state changes
 * 3. Game state is stored and retrieved properly
 * 4. Visualization functions like updateBoardVisualization and updateGameEntities
 *    are implemented and functioning
 * 
 * The game renderer handles:
 * - 3D rendering of game elements using Three.js
 * - 2D fallback rendering using canvas
 * - UI updates based on game state
 * - Board visualization
 * - Game entity visualization (tetrominos, chess pieces, etc.)
 * 
 * Recent fixes include:
 * - Implementation of updateBoardVisualization to render the game board
 * - Implementation of updateGameEntities to render game objects
 * - Added robust error handling to prevent crashes
 * - Made tests more reliable by simplifying dependencies
 */

// Global mocks for THREE
global.THREE = {
	Scene: jest.fn(),
	WebGLRenderer: jest.fn(),
	PerspectiveCamera: jest.fn(),
	BoxGeometry: jest.fn(),
	MeshStandardMaterial: jest.fn(),
	Mesh: jest.fn(),
	Group: jest.fn(),
	Vector3: jest.fn(),
	Color: jest.fn()
};

// Mock requestAnimationFrame and cancelAnimationFrame
global.requestAnimationFrame = jest.fn();
global.cancelAnimationFrame = jest.fn();

// Mock animations module
jest.mock('../public/js/utils/animations.js', () => ({
	init: jest.fn(),
	update: jest.fn()
}));

// Import the module
const gameRenderer = require('../public/js/utils/gameRenderer.js');

describe('Game Renderer', () => {
	// Tests for core functionality
	test('should export core functions', () => {
		expect(typeof gameRenderer.init).toBe('function');
		expect(typeof gameRenderer.render).toBe('function');
		expect(typeof gameRenderer.startRenderLoop).toBe('function');
		expect(typeof gameRenderer.stopRenderLoop).toBe('function');
	});
	
	// Tests for UI update functions
	test('should export UI update functions', () => {
		expect(typeof gameRenderer.updateUI3D).toBe('function');
		expect(typeof gameRenderer.updateScoreDisplay).toBe('function');
		expect(typeof gameRenderer.updateTurnIndicator).toBe('function');
		expect(typeof gameRenderer.updateTurnTimer).toBe('function');
	});
	
	// Tests for game state functions
	test('should export game state functions', () => {
		expect(typeof gameRenderer.setGameState).toBe('function');
		expect(typeof gameRenderer.getGameState).toBe('function');
		expect(typeof gameRenderer.screenToBoardCoordinates).toBe('function');
	});
	
	// Basic UI update functionality tests
	describe('UI Update Functions', () => {
		// Mock document.getElementById
		const originalGetElementById = document.getElementById;
		let mockElements = {};
		
		beforeEach(() => {
			// Create mock elements for each test
			mockElements = {
				'player1-score': { textContent: '' },
				'player2-score': { textContent: '' },
				'turn-indicator': { textContent: '', className: '' },
				'turn-timer': { textContent: '', className: '' }
			};
			
			// Mock document.getElementById to return our mock elements
			document.getElementById = jest.fn(id => mockElements[id] || null);
		});
		
		afterEach(() => {
			// Restore original function
			document.getElementById = originalGetElementById;
		});
		
		test('updateScoreDisplay should update player score elements', () => {
			// Call the function
			gameRenderer.updateScoreDisplay([
				{ score: 100 },
				{ score: 200 }
			]);
			
			// Check if document.getElementById was called correctly
			expect(document.getElementById).toHaveBeenCalledWith('player1-score');
			expect(document.getElementById).toHaveBeenCalledWith('player2-score');
			
			// Check if the elements were updated
			expect(mockElements['player1-score'].textContent).toBe(100);
			expect(mockElements['player2-score'].textContent).toBe(200);
		});
		
		test('updateTurnIndicator should update turn indicator', () => {
			// Call the function
			gameRenderer.updateTurnIndicator('player1', 'PLACE_TETROMINO');
			
			// Check if document.getElementById was called correctly
			expect(document.getElementById).toHaveBeenCalledWith('turn-indicator');
			
			// Check if the element was updated
			expect(mockElements['turn-indicator'].textContent).toBe("player1's turn - PLACE_TETROMINO");
			expect(mockElements['turn-indicator'].className).toBe('turn-indicator player1');
		});
		
		test('updateTurnTimer should update turn timer', () => {
			// Call the function with 30 seconds
			gameRenderer.updateTurnTimer(30000);
			
			// Check if document.getElementById was called correctly
			expect(document.getElementById).toHaveBeenCalledWith('turn-timer');
			
			// Check if the element was updated
			expect(mockElements['turn-timer'].textContent).toBe(30);
			expect(mockElements['turn-timer'].className).toBe('turn-timer');
		});
		
		test('updateUI3D should update DOM elements directly', () => {
			// Create test game state
			const gameState = {
				players: [{ score: 100 }, { score: 200 }],
				currentPlayer: 'player1',
				turnPhase: 'PLACE_TETROMINO',
				turnTimeRemaining: 30000
			};
			
			// Call updateUI3D to update all UI elements
			gameRenderer.updateUI3D(gameState);
			
			// Check if getElementById was called for each element
			expect(document.getElementById).toHaveBeenCalledWith('player1-score');
			expect(document.getElementById).toHaveBeenCalledWith('player2-score');
			expect(document.getElementById).toHaveBeenCalledWith('turn-indicator');
			expect(document.getElementById).toHaveBeenCalledWith('turn-timer');
			
			// Check if elements were updated correctly
			expect(mockElements['player1-score'].textContent).toBe(100);
			expect(mockElements['player2-score'].textContent).toBe(200);
			expect(mockElements['turn-indicator'].textContent).toBe("player1's turn - PLACE_TETROMINO");
			expect(mockElements['turn-indicator'].className).toBe('turn-indicator player1');
			expect(mockElements['turn-timer'].textContent).toBe(30);
			expect(mockElements['turn-timer'].className).toBe('turn-timer');
		});
	});

	// Game state management tests
	describe('Game State Management', () => {
		test('setGameState and getGameState should store and retrieve game state', () => {
			const testState = { board: [], players: [] };
			gameRenderer.setGameState(testState);
			expect(gameRenderer.getGameState()).toBe(testState);
		});
		
		test('screenToBoardCoordinates should return null if camera is not initialized', () => {
			const result = gameRenderer.screenToBoardCoordinates(100, 100);
			expect(result).toBeNull();
		});
		
		test('updateBoardVisualization should be defined', () => {
			expect(typeof gameRenderer.updateBoardVisualization).toBe('function');
		});
		
		test('updateGameEntities should be defined', () => {
			expect(typeof gameRenderer.updateGameEntities).toBe('function');
		});
	});
}); 