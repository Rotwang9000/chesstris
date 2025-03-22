/**
 * Tests for piece acquisition functionality
 */

const { expect } = require('@jest/globals');
import GameManager from '../../server/game/GameManager.js';
const { GAME_EVENTS, PIECE_PRICES } = require('../../server/constants');
// Sinon replaced with Jest

describe('Piece Acquisition Tests', () => {
	// Add custom matcher if needed
	beforeAll(() => {
		expect.extend({
			toInclude(received, expected) {
				const pass = received.includes(expected);
				return {
					pass,
					message: () => 
						`expected ${received} ${pass ? 'not to' : 'to'} include ${expected}`,
				};
			}
		});
	});
	let gameManager;
	let gameId;
	let playerId;
	let mockIo;
	let emitGameEventSpy;
	
	beforeEach(() => {
		// Mock socket.io
		mockIo = {
			to: jest.fn().returnsThis(),
			emit: jest.spyOn()
		};
		
		// Initialize game manager with mock io
		gameManager = new GameManager(mockIo);
		
		// Spy on the emitGameEvent method
		emitGameEventSpy = jest.spyOn(gameManager, 'emitGameEvent');
		
		// Create a game for testing
		gameId = 'test-game-id';
		const gameResult = gameManager.createGame({gameId});
		if (!gameResult.success) {
			throw new Error('Failed to create game');
		}
		
		// Add a player to the game
		playerId = 'test-player-id';
		const playerResult = gameManager.addPlayer(gameId, playerId);
		if (!playerResult.success) {
			throw new Error('Failed to add player');
		}
		
		// Start the game
		gameManager.startGame(gameId);
		
		// Ensure the games collection exists
		if (!gameManager.games) {
			gameManager.games = new Map();
		}
		
		// Make sure the game is in the games collection
		if (!gameManager.games.has(gameId)) {
			const game = gameManager.getGameState(gameId);
			if (game) {
				gameManager.games.set(gameId, game);
			}
		}
	});
	
	afterEach(() => {
		// Clean up any timers or async operations
		jest.clearAllMocks();
		
		// Clean up any intervals the GameManager might have created
		if (gameManager.pauseTimeoutInterval) {
			clearInterval(gameManager.pauseTimeoutInterval);
			gameManager.pauseTimeoutInterval = null;
		}
		
		// Clean up home zone degradation timer
		if (gameManager.homeZoneDegradationTimers && gameManager.homeZoneDegradationTimers[gameId]) {
			clearInterval(gameManager.homeZoneDegradationTimers[gameId]);
			delete gameManager.homeZoneDegradationTimers[gameId];
		}
	});
	
	it('can purchase a pawn with correct amount', function(done) {
		// Set timeout for this test
		this.timeout(5000);
		
		// Arrange
		const pieceType = 'pawn';
		const amount = PIECE_PRICES ? PIECE_PRICES.PAWN : 0.1;
		
		// Make sure we have constants
		if (!gameManager.constants) {
			gameManager.constants = { PIECE_PRICES: { PAWN: 0.1, ROOK: 0.5, KNIGHT: 0.5, BISHOP: 0.5, QUEEN: 1.0 } };
		}
		
		try {
			// Act
			const result = gameManager.purchasePiece(gameId, playerId, pieceType, amount);
			
			// Assert
			expect(result.success).toBe(true);
			expect(result.piece).toBeDefined();
			expect(result.piece.type).toBe(pieceType.toLowerCase());
			expect(result.piece.player).toBe(playerId);
			expect(result.position).toBeDefined();
			expect(result.position.x).toBeDefined();
			expect(result.position.y).toBeDefined();
			
			// Check that the piece was added to the game
			const game = gameManager.getGameState(gameId);
			const pieceInGame = game.chessPieces.find(p => p.id === result.piece.id);
			expect(pieceInGame).toBeDefined();
			
			// Check that the event was emitted
			expect(emitGameEventSpy.toHaveBeenCalledWith(
				gameId,
				'piecePurchased',
				jest.match({ 
					playerId, 
					pieceType: pieceType.toLowerCase(),
					piece: result.piece
				})
			)).toBe(true);
			
			done();
		} catch (error) {
			done(error);
		}
	});
	
	it('cannot purchase a pawn with insufficient amount', function(done) {
		this.timeout(5000);
		
		// Arrange
		const pieceType = 'pawn';
		const amount = (PIECE_PRICES ? PIECE_PRICES.PAWN : 0.1) - 0.01; // Less than required
		
		// Make sure we have constants
		if (!gameManager.constants) {
			gameManager.constants = { PIECE_PRICES: { PAWN: 0.1, ROOK: 0.5, KNIGHT: 0.5, BISHOP: 0.5, QUEEN: 1.0 } };
		}
		
		try {
			// Act
			const result = gameManager.purchasePiece(gameId, playerId, pieceType, amount);
			
			// Assert
			expect(result.success).toBe(false);
			expect(result.error).toContain('Insufficient payment');
			
			// Check that no piece was added
			const game = gameManager.getGameState(gameId);
			const initialPieceCount = game.chessPieces ? game.chessPieces.length : 0;
			expect(initialPieceCount).toBe(0);
			
			// Check that the failure event was emitted
			expect(emitGameEventSpy.toHaveBeenCalledWith(
				gameId,
				'piecePurchaseFailed',
				jest.match({ 
					playerId, 
					pieceType,
					error: jest.match.string 
				})
			)).toBe(true);
			
			done();
		} catch (error) {
			done(error);
		}
	});
	
	it('cannot purchase an invalid piece type', function(done) {
		this.timeout(5000);
		
		// Arrange
		const pieceType = 'unicorn'; // Invalid piece type
		const amount = 1.0;
		
		// Make sure we have constants
		if (!gameManager.constants) {
			gameManager.constants = { PIECE_PRICES: { PAWN: 0.1, ROOK: 0.5, KNIGHT: 0.5, BISHOP: 0.5, QUEEN: 1.0 } };
		}
		
		try {
			// Act
			const result = gameManager.purchasePiece(gameId, playerId, pieceType, amount);
			
			// Assert
			expect(result.success).toBe(false);
			expect(result.error).toContain('Invalid piece type');
			
			// Check that the failure event was emitted
			expect(emitGameEventSpy.toHaveBeenCalledWith(
				gameId,
				'piecePurchaseFailed',
				jest.match({ 
					playerId, 
					pieceType,
					error: jest.match.string 
				})
			)).toBe(true);
			
			done();
		} catch (error) {
			done(error);
		}
	});
	
	it('cannot purchase a king', function(done) {
		this.timeout(5000);
		
		// Arrange
		const pieceType = 'king';
		const amount = 5.0; // Arbitrary high amount
		
		// Make sure we have constants
		if (!gameManager.constants) {
			gameManager.constants = { PIECE_PRICES: { PAWN: 0.1, ROOK: 0.5, KNIGHT: 0.5, BISHOP: 0.5, QUEEN: 1.0 } };
		}
		
		try {
			// Act
			const result = gameManager.purchasePiece(gameId, playerId, pieceType, amount);
			
			// Assert
			expect(result.success).toBe(false);
			expect(result.error).toContain('Kings cannot be purchased');
			
			// Check that the failure event was emitted
			expect(emitGameEventSpy.toHaveBeenCalledWith(
				gameId,
				'piecePurchaseFailed',
				jest.match({ 
					playerId, 
					pieceType,
					error: jest.match.string 
				})
			)).toBe(true);
			
			done();
		} catch (error) {
			done(error);
		}
	});
	
	it('expands home zone if needed to place piece', function(done) {
		this.timeout(5000);
		
		// Arrange - Mock a full home zone
		const game = gameManager.getGameState(gameId);
		
		// Make sure we have constants
		if (!gameManager.constants) {
			gameManager.constants = { 
				PIECE_PRICES: { PAWN: 0.1, ROOK: 0.5, KNIGHT: 0.5, BISHOP: 0.5, QUEEN: 1.0 },
				HOME_ZONE_MAX_SIZE: 5
			};
		}
		
		// Ensure the home zone exists
		if (!game.players[playerId].homeZone) {
			game.players[playerId].homeZone = {
				x: 0,
				y: 0,
				width: 1,
				height: 1
			};
		}
		
		// Mock board setup with cells
		if (!game.board) {
			game.board = Array(10).fill().map(() => Array(10).fill(null));
		}
		
		// Fill all home zone cells with pieces
		for (let y = 0; y < game.players[playerId].homeZone.height; y++) {
			for (let x = 0; x < game.players[playerId].homeZone.width; x++) {
				const cellX = game.players[playerId].homeZone.x + x;
				const cellY = game.players[playerId].homeZone.y + y;
				
				// Create a cell with a piece in it
				game.board[cellY][cellX] = {
					x: cellX,
					y: cellY,
					owner: playerId,
					chessPiece: { id: `existing-piece-${x}-${y}`, type: 'pawn', player: playerId }
				};
			}
		}
		
		// Spy on the expand method
		const expandSpy = jest.spyOn(gameManager, '_expandHomeZoneIfNeeded');
		
		try {
			// Act - Try to purchase a piece
			const result = gameManager.purchasePiece(gameId, playerId, 'pawn', gameManager.constants.PIECE_PRICES.PAWN);
			
			// Assert
			expect(result.success).toBe(true);
			expect(expandSpy).toHaveBeenCalled().toBe(true);
			expect(game.players[playerId].homeZone.width).to.be.greaterThan(1);
			
			done();
		} catch (error) {
			done(error);
		}
	});
});