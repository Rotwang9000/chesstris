/**
 * Tests for orphaned pieces handling
 */

import { expect } from 'chai';
import GameManager from '../../server/game/GameManager.js';

describe('Orphaned Pieces', () => {
	let gameManager;
	let game;
	let events = [];
	
	beforeEach(() => {
		gameManager = new GameManager();
		
		// Mock the emitGameEvent method
		gameManager.emitGameEvent = (gameId, eventType, data) => {
			events.push({ gameId, eventType, data });
		};
		
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
	
	describe('_hasPathToKing', () => {
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
			
			// Create a piece
			const piece = {
				id: `${playerId}_knight`,
				type: 'knight',
				player: playerId,
				position: {
					x: 5,
					y: 5
				}
			};
			
			// Add pieces to the player
			game.players[playerId].pieces = [king, piece];
			
			// Add pieces to the board
			game.board[9][1] = {
				chessPiece: king,
				player: playerId
			};
			
			game.board[5][5] = {
				chessPiece: piece,
				player: playerId
			};
			
			// Mark the cells in the path as belonging to the player
			for (let y = 6; y < 9; y++) {
				game.board[y][5] = {
					player: playerId
				};
			}
			
			// Add the path connection to the king's position
			game.board[9][5] = {
				player: playerId
			};
			for (let x = 2; x <= 5; x++) {
				game.board[9][x] = {
					player: playerId
				};
			}
			
			// Check if there's a path to the king
			const hasPath = gameManager._hasPathToKing(game, piece.position.x, piece.position.y, playerId);
			
			// Verify a path was found
			expect(hasPath).to.be.true;
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
			
			// Create a piece
			const piece = {
				id: `${playerId}_knight`,
				type: 'knight',
				player: playerId,
				position: {
					x: 5,
					y: 5
				}
			};
			
			// Add pieces to the player
			game.players[playerId].pieces = [king, piece];
			
			// Add pieces to the board
			game.board[9][1] = {
				chessPiece: king,
				player: playerId
			};
			
			game.board[5][5] = {
				chessPiece: piece,
				player: playerId
			};
			
			// Create a barrier between the piece and the king
			for (let x = 0; x < 10; x++) {
				game.board[7][x] = {
					player: 'other'
				};
			}
			
			// Check if there's a path to the king
			const hasPath = gameManager._hasPathToKing(game, piece.position.x, piece.position.y, playerId);
			
			// Verify no path was found
			expect(hasPath).to.be.false;
		});
	});
	
	describe('_isInPlayerHomeZone', () => {
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
			
			// Test cells in the home zone
			expect(gameManager._isInPlayerHomeZone(game, 0, 9, playerId)).to.be.true;
			expect(gameManager._isInPlayerHomeZone(game, 2, 11, playerId)).to.be.true;
			
			// Test cells outside the home zone
			expect(gameManager._isInPlayerHomeZone(game, 5, 5, playerId)).to.be.false;
			expect(gameManager._isInPlayerHomeZone(game, 3, 9, playerId)).to.be.false;
		});
	});
	
	describe('_isCellInSafeHomeZone', () => {
		it('should correctly identify if a cell is in a safe home zone', () => {
			const playerId = 'player1';
			
			// Create a player with a home zone
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
			
			// Create a piece in the home zone
			const piece = {
				id: `${playerId}_piece`,
				type: 'knight',
				player: playerId,
				x: 1,
				y: 9
			};
			
			// Add the piece to the player
			game.players[playerId].pieces = [piece];
			
			// Test a cell in the safe home zone
			expect(gameManager._isCellInSafeHomeZone(game, 0, 9, playerId)).to.be.true;
			
			// Remove the piece from the home zone
			game.players[playerId].pieces = [];
			
			// Test a cell in the now unsafe home zone
			expect(gameManager._isCellInSafeHomeZone(game, 0, 9, playerId)).to.be.false;
		});
	});
}); 