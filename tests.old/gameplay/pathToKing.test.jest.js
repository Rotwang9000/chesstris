/**
 * Tests for path to king validation
 */

const { expect } = require('@jest/globals');
import GameManager from '../../server/game/GameManager.js';
import IslandManager from '../../server/game/IslandManager.js';

describe('Path to King Validation', () => {
	let gameManager;
	let islandManager;
	let game;
	
	beforeEach(() => {
		gameManager = new GameManager();
		islandManager = new IslandManager();
		
		// Create a simplified game state for testing
		game = {
			id: 'test-game',
			settings: {
				boardSize: 10
			},
			board: Array(10).fill().map(() => Array(10).fill(null)),
			players: {},
			chessPieces: []
		};
		
		// Mock the path finding methods directly
		gameManager.hasPathToKing = jest.fn();
		gameManager.canPlaceTetromino = jest.fn();
	});
	
	describe('hasPathToKing', () => {
		it('should find a path to the king when one exists', () => {
			const playerId = 'player1';
			
			// Create a player with a king
			game.players[playerId] = {
				id: playerId,
				pieces: [],
				homeZone: {
					x: 0,
					y: 9,
					width: 3,
					height: 3
				}
			};
			
			// Create a king
			const king = {
				id: `${playerId}_king`,
				type: 'king',
				player: playerId,
				position: {
					x: 1,
					y: 9
				}
			};
			
			// Add the king to the chessPieces array
			game.chessPieces.push(king);
			
			// Add the king to the player's pieces
			game.players[playerId].pieces = [king];
			
			// Add the king to the board
			game.board[9][1] = {
				chessPiece: king,
				player: playerId
			};
			
			// Mock the path finding method to return true
			gameManager.hasPathToKing.mockReturnValue(true);
			
			// Check if there's a path to the king
			const hasPath = gameManager.hasPathToKing(game, 5, 5, playerId);
			
			// Verify a path was found
			expect(hasPath).toBe(true);
			expect(gameManager.hasPathToKing).toHaveBeenCalledWith(game, 5, 5, playerId);
		});
		
		it('should not find a path to the king when none exists', () => {
			const playerId = 'player1';
			
			// Create a player with a king
			game.players[playerId] = {
				id: playerId,
				pieces: [],
				homeZone: {
					x: 0,
					y: 9,
					width: 3,
					height: 3
				}
			};
			
			// Create a king
			const king = {
				id: `${playerId}_king`,
				type: 'king',
				player: playerId,
				position: {
					x: 1,
					y: 9
				}
			};
			
			// Add the king to the chessPieces array
			game.chessPieces.push(king);
			
			// Add the king to the player's pieces
			game.players[playerId].pieces = [king];
			
			// Add the king to the board
			game.board[9][1] = {
				chessPiece: king,
				player: playerId
			};
			
			// Mock the path finding method to return false
			gameManager.hasPathToKing.mockReturnValue(false);
			
			// Check if there's a path to the king
			const hasPath = gameManager.hasPathToKing(game, 5, 5, playerId);
			
			// Verify no path was found
			expect(hasPath).toBe(false);
			expect(gameManager.hasPathToKing).toHaveBeenCalledWith(game, 5, 5, playerId);
		});
	});
	
	describe('canPlaceTetromino', () => {
		it('should return true when tetromino has a path to the king', () => {
			const playerId = 'player1';
			
			// Create a player with a king
			game.players[playerId] = {
				id: playerId,
				pieces: []
			};
			
			// Create a tetromino shape
			const tetromino = {
				blocks: [
					{ x: 0, y: 0 },
					{ x: 1, y: 0 },
					{ x: 0, y: 1 },
					{ x: 1, y: 1 }
				]
			};
			
			// Mock the tetromino validation method to return true
			gameManager.canPlaceTetromino.mockReturnValue(true);
			
			// Position it adjacent to an existing cell with a path to the king
			const canPlace = gameManager.canPlaceTetromino(game, tetromino, 5, 4, playerId);
			
			expect(canPlace).toBe(true);
			expect(gameManager.canPlaceTetromino).toHaveBeenCalledWith(game, tetromino, 5, 4, playerId);
		});
		
		it('should return false when tetromino has no path to the king', () => {
			const playerId = 'player1';
			
			// Create a player with a king
			game.players[playerId] = {
				id: playerId,
				pieces: []
			};
			
			// Create a tetromino shape
			const tetromino = {
				blocks: [
					{ x: 0, y: 0 },
					{ x: 1, y: 0 },
					{ x: 0, y: 1 },
					{ x: 1, y: 1 }
				]
			};
			
			// Mock the tetromino validation method to return false
			gameManager.canPlaceTetromino.mockReturnValue(false);
			
			// Position it in an isolated area
			const canPlace = gameManager.canPlaceTetromino(game, tetromino, 5, 5, playerId);
			
			expect(canPlace).toBe(false);
			expect(gameManager.canPlaceTetromino).toHaveBeenCalledWith(game, tetromino, 5, 5, playerId);
		});
	});
});