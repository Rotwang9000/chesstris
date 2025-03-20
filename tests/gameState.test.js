/**
 * Game State Manager Unit Tests
 */

describe('Game State Manager', () => {
	// Import the module for testing
	// We need to use jest.doMock to ensure it uses our mocked dependencies
	jest.doMock('../public/js/utils/network.js', () => ({
		send: jest.fn(),
		on: jest.fn(),
		off: jest.fn(),
		isConnected: jest.fn().mockReturnValue(true),
		cleanup: jest.fn()
	}));

	jest.doMock('../public/js/utils/gameRenderer.js', () => ({
		setGameState: jest.fn(),
		showVictoryAnimation: jest.fn(),
		showDefeatAnimation: jest.fn(),
		createRowClearingAnimation: jest.fn(),
		createTetrominoAttachAnimation: jest.fn(),
		createTetrominoDisintegrationAnimation: jest.fn()
	}));

	// This must be required after the mocks are set up
	const gameStateManager = require('../public/js/utils/gameStateManager.js');
	
	// Mock dependencies - references to retain access to the mock functions
	const mockNetwork = require('../public/js/utils/network.js');
	const mockGameRenderer = require('../public/js/utils/gameRenderer.js');
	
	beforeEach(() => {
		// Reset mocks before each test
		jest.clearAllMocks();
		
		// Reset the game state manager
		gameStateManager.cleanup();
	});
	
	describe('Initialization', () => {
		test('should initialize properly', async () => {
			const result = await gameStateManager.init();
			expect(result).toBe(true);
		});
		
		test('should register event handlers on init', async () => {
			await gameStateManager.init();
			expect(mockNetwork.on).toHaveBeenCalled();
		});
	});
	
	describe('Game State Management', () => {
		test('should update game state correctly', async () => {
			await gameStateManager.init();
			
			const testState = {
				board: [[1, 0], [0, 1]],
				chessPieces: [{ id: 'piece1', type: 'pawn', position: { x: 0, z: 0 } }]
			};
			
			gameStateManager.updateGameState(testState);
			const currentState = gameStateManager.getGameState();
			
			expect(currentState.board).toEqual(testState.board);
			expect(currentState.chessPieces).toEqual(testState.chessPieces);
		});
		
		test('should notify listeners of state changes', async () => {
			await gameStateManager.init();
			
			const mockCallback = jest.fn();
			gameStateManager.onAnyStateChange(mockCallback);
			
			const testState = { testValue: 'test' };
			gameStateManager.updateGameState(testState);
			
			expect(mockCallback).toHaveBeenCalled();
		});
	});
	
	describe('Event Handling', () => {
		test('should register and trigger events', async () => {
			await gameStateManager.init();
			
			const mockCallback = jest.fn();
			gameStateManager.on('testEvent', mockCallback);
			
			// Manually trigger the event (simulate internal trigger)
			const testData = { value: 'test' };
			gameStateManager.triggerEvent('testEvent', testData);
			
			expect(mockCallback).toHaveBeenCalledWith(testData);
		});
		
		test('should clean up event listeners', async () => {
			await gameStateManager.init();
			
			const mockCallback = jest.fn();
			gameStateManager.on('testEvent', mockCallback);
			gameStateManager.off('testEvent', mockCallback);
			
			// Trigger the event after removing the listener
			gameStateManager.triggerEvent('testEvent', {});
			
			expect(mockCallback).not.toHaveBeenCalled();
		});
	});
	
	describe('Game State Changes', () => {
		test('should handle game state transitions', async () => {
			await gameStateManager.init();
			
			// Test state transition
			gameStateManager.setState(gameStateManager.GAME_STATES.PLAYING);
			
			const currentState = gameStateManager.getGameState();
			expect(currentState.currentGameState).toBe(gameStateManager.GAME_STATES.PLAYING);
			expect(currentState.isGameStarted).toBe(true);
		});
		
		test('should handle game over state', async () => {
			await gameStateManager.init();
			
			// Set up a mock local player ID
			gameStateManager.updateGameState({
				localPlayerId: 'player1',
				players: {
					player1: { name: 'Player 1' }
				}
			});
			
			// Trigger game over with the local player winning
			gameStateManager.handleGameOver({ winner: 'player1' });
			
			const currentState = gameStateManager.getGameState();
			expect(currentState.isGameOver).toBe(true);
			expect(mockGameRenderer.showVictoryAnimation).toHaveBeenCalled();
		});
	});
	
	describe('Chess Piece Management', () => {
		test('should handle chess piece selection', async () => {
			await gameStateManager.init();
			
			// Add a test chess piece
			gameStateManager.updateGameState({
				chessPieces: [
					{ id: 'piece1', type: 'pawn', position: { x: 0, z: 0 } }
				]
			});
			
			// Select the piece
			gameStateManager.selectChessPiece('piece1');
			
			// Should send a request for valid moves
			expect(mockNetwork.send).toHaveBeenCalledWith('getValidMoves', { pieceId: 'piece1' });
		});
		
		test('should handle chess piece movement', async () => {
			await gameStateManager.init();
			
			// Set up a selected piece and valid moves
			gameStateManager.selectChessPiece('piece1');
			gameStateManager.handleValidMoves({
				pieceId: 'piece1',
				validMoves: [{ x: 1, z: 1 }]
			});
			
			// Move the piece to a valid position
			gameStateManager.moveSelectedPiece(1, 1);
			
			expect(mockNetwork.send).toHaveBeenCalledWith('movePiece', {
				pieceId: 'piece1',
				position: { x: 1, z: 1 }
			});
		});
	});
	
	describe('Tetromino Management', () => {
		test('should handle tetromino placement', async () => {
			await gameStateManager.init();
			
			const tetromino = {
				type: 'I',
				position: { x: 0, y: 0, z: 0 },
				rotation: 0
			};
			
			gameStateManager.placeTetromino(tetromino, { x: 1, z: 1 });
			
			expect(mockNetwork.send).toHaveBeenCalledWith('placeTetromino', {
				tetromino: tetromino,
				position: { x: 1, z: 1 }
			});
		});
		
		test('should handle tetromino rotation', async () => {
			await gameStateManager.init();
			
			gameStateManager.rotateTetromino('clockwise');
			
			expect(mockNetwork.send).toHaveBeenCalledWith('rotateTetromino', {
				direction: 'clockwise'
			});
		});
	});
}); 