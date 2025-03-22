/**
 * Tests for path to king validation
 */

import { expect } from 'chai';
import GameManager from '../../server/game/GameManager.js';

describe('Path to King Validation', () => {
	let gameManager;
	let game;
	
	beforeEach(() => {
		gameManager = new GameManager();
		
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
			
			// Add the king to the chessPieces array
			game.chessPieces.push(king);
			
			// Add the king to the player's pieces
			game.players[playerId].pieces = [king];
			
			// Add the king to the board
			game.board[9][1] = {
				chessPiece: king,
				player: playerId
			};
			
			// Create a path from (5,5) to the king
			for (let y = 6; y < 9; y++) {
				game.board[y][5] = {
					player: playerId
				};
			}
			
			// Connect to the king
			game.board[9][5] = {
				player: playerId
			};
			for (let x = 2; x <= 5; x++) {
				game.board[9][x] = {
					player: playerId
				};
			}
			
			// Check if there's a path to the king
			const hasPath = gameManager._hasPathToKing(game, 5, 5, playerId);
			
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
			
			// Add the king to the chessPieces array
			game.chessPieces.push(king);
			
			// Add the king to the player's pieces
			game.players[playerId].pieces = [king];
			
			// Add the king to the board
			game.board[9][1] = {
				chessPiece: king,
				player: playerId
			};
			
			// Create a barrier between (5,5) and the king
			for (let x = 0; x < 10; x++) {
				game.board[7][x] = {
					player: 'other'
				};
			}
			
			// Check if there's a path to the king
			const hasPath = gameManager._hasPathToKing(game, 5, 5, playerId);
			
			// Verify no path was found
			expect(hasPath).to.be.false;
		});
	});
	
	describe('_canPlaceTetromino', () => {
		it('should return true when tetromino has a path to the king', () => {
			const playerId = 'player1';
			
			// Create a player with a king
			game.players[playerId] = {
				id: playerId,
				pieces: []
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
			
			// Create a path to the king
			for (let y = 6; y < 9; y++) {
				game.board[y][5] = {
					player: playerId
				};
			}
			
			// Connect to the king
			game.board[9][5] = {
				player: playerId
			};
			for (let x = 2; x <= 5; x++) {
				game.board[9][x] = {
					player: playerId
				};
			}
			
			// Create a simple tetromino
			const tetromino = [
				[1, 1],
				[1, 1]
			];
			
			// Position it adjacent to an existing cell with a path to the king
			// Place it at (5, 5) which is adjacent to the path at (5, 6)
			const canPlace = gameManager._canPlaceTetromino(game, tetromino, 5, 4, playerId);
			
			expect(canPlace).to.be.true;
		});
		
		it('should return false when tetromino has no path to the king', () => {
			const playerId = 'player1';
			
			// Create a player with a king
			game.players[playerId] = {
				id: playerId,
				pieces: []
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
			
			// Create a barrier between potential tetromino placement and the king
			for (let x = 0; x < 10; x++) {
				game.board[7][x] = {
					player: 'other'
				};
			}
			
			// Create a simple tetromino
			const tetromino = [
				[1, 1],
				[1, 1]
			];
			
			// Position it in an isolated area
			const canPlace = gameManager._canPlaceTetromino(game, tetromino, 5, 5, playerId);
			
			expect(canPlace).to.be.false;
		});
	});
}); 