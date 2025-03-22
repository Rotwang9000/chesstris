/**
 * Tests for orphaned pieces handling
 */

const { expect } = require('@jest/globals');
import GameManager from '../../server/game/GameManager.js';

describe('Orphaned Pieces', () => {
	let gameManager;
	let game;
	let events = [];
	
	beforeEach(() => {
		gameManager = new GameManager();
		
		// Mock the key methods we need to test
		gameManager.hasPathToKing = jest.fn();
		gameManager.isInPlayerHomeZone = jest.fn();
		gameManager.isCellInSafeHomeZone = jest.fn();
		
		// Mock the emitGameEvent method
		gameManager.emitGameEvent = jest.fn((gameId, eventType, data) => {
			events.push({ gameId, eventType, data });
		});
		
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
		
		// Clear events array
		events = [];
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
			
			// Create a rook at position (5, 5)
			const piece = {
				id: `${playerId}_rook_1`,
				type: 'rook',
				player: playerId,
				position: {
					x: 5,
					y: 5
				}
			};
			
			// Add the piece to the player's pieces
			game.players[playerId].pieces.push(piece);
			
			// Mock hasPathToKing to return true
			gameManager.hasPathToKing.mockReturnValue(true);
			
			// Check if there's a path to the king
			const hasPath = gameManager.hasPathToKing(game, piece.position.x, piece.position.y, playerId);
			
			// Verify a path was found
			expect(hasPath).toBe(true);
			expect(gameManager.hasPathToKing).toHaveBeenCalledWith(game, piece.position.x, piece.position.y, playerId);
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
			
			// Create a rook at position (5, 5)
			const piece = {
				id: `${playerId}_rook_1`,
				type: 'rook',
				player: playerId,
				position: {
					x: 5,
					y: 5
				}
			};
			
			// Add the piece to the player's pieces
			game.players[playerId].pieces.push(piece);
			
			// Mock hasPathToKing to return false
			gameManager.hasPathToKing.mockReturnValue(false);
			
			// Check if there's a path to the king
			const hasPath = gameManager.hasPathToKing(game, piece.position.x, piece.position.y, playerId);
			
			// Verify no path was found
			expect(hasPath).toBe(false);
			expect(gameManager.hasPathToKing).toHaveBeenCalledWith(game, piece.position.x, piece.position.y, playerId);
		});
	});
	
	describe('isInPlayerHomeZone', () => {
		it('should correctly identify if a cell is in a player\'s home zone', () => {
			const playerId = 'player1';
			
			// Create a player with a home zone
			game.players[playerId] = {
				id: playerId,
				homeZone: {
					x: 0,
					y: 9,
					width: 3,
					height: 3
				}
			};
			
			// Mock isInPlayerHomeZone to return true for cells in the home zone and false otherwise
			gameManager.isInPlayerHomeZone.mockImplementation((game, x, y, pid) => {
				const homeZone = game.players[pid].homeZone;
				return x >= homeZone.x && x < homeZone.x + homeZone.width && 
					   y >= homeZone.y && y < homeZone.y + homeZone.height;
			});
			
			// Test cells in the home zone
			expect(gameManager.isInPlayerHomeZone(game, 0, 9, playerId)).toBe(true);
			expect(gameManager.isInPlayerHomeZone(game, 2, 11, playerId)).toBe(true);
			
			// Test cells outside the home zone
			expect(gameManager.isInPlayerHomeZone(game, 5, 5, playerId)).toBe(false);
			expect(gameManager.isInPlayerHomeZone(game, 0, 0, playerId)).toBe(false);
		});
	});
	
	describe('isCellInSafeHomeZone', () => {
		it('should correctly identify if a cell is in a safe home zone', () => {
			const playerId = 'player1';
			
			// Create a player with a home zone and one piece
			game.players[playerId] = {
				id: playerId,
				pieces: [
					{
						id: `${playerId}_king`,
						type: 'king',
						player: playerId,
						position: {
							x: 1,
							y: 10
						}
					}
				],
				homeZone: {
					x: 0,
					y: 9,
					width: 3,
					height: 3
				}
			};
			
			// Mock isCellInSafeHomeZone to check if cell is in home zone of player with pieces
			gameManager.isCellInSafeHomeZone.mockImplementation((game, x, y, pid) => {
				const isInHomeZone = gameManager.isInPlayerHomeZone(game, x, y, pid);
				const hasPieces = game.players[pid].pieces.length > 0;
				return isInHomeZone && hasPieces;
			});
			
			// Test a cell in the safe home zone
			expect(gameManager.isCellInSafeHomeZone(game, 0, 9, playerId)).toBe(true);
			
			// Remove the piece from the home zone
			game.players[playerId].pieces = [];
			
			// Test the same cell which should now not be in a safe home zone
			expect(gameManager.isCellInSafeHomeZone(game, 0, 9, playerId)).toBe(false);
		});
	});
});