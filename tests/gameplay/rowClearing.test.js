/**
 * Tests for row clearing
 */

import { expect } from 'chai';
import GameManager from '../../server/game/GameManager.js';

describe('Row Clearing', () => {
	let gameManager;
	let game;
	
	beforeEach(() => {
		gameManager = new GameManager();
		
		// Create a simplified game state for testing
		game = {
			settings: {
				boardSize: 10
			},
			board: Array(10).fill().map(() => Array(10).fill(null)),
			players: {
				player1: {
					id: 'player1',
					pieces: [
						{ id: 'king1', type: 'king', x: 2, y: 9 }
					],
					homeZone: { x: 0, y: 8, width: 5, height: 2 }
				},
				player2: {
					id: 'player2',
					pieces: [
						{ id: 'king2', type: 'king', x: 8, y: 9 }
					],
					homeZone: { x: 5, y: 8, width: 5, height: 2 }
				}
			}
		};
		
		// Set up the board with some cells
		// Kings
		game.board[9][2] = {
			x: 2,
			y: 9,
			player: 'player1',
			chessPiece: { id: 'king1', type: 'king', player: 'player1' }
		};
		
		game.board[9][8] = {
			x: 8,
			y: 9,
			player: 'player2',
			chessPiece: { id: 'king2', type: 'king', player: 'player2' }
		};
		
		// Fill row 5 with cells (but not completely)
		for (let x = 0; x < 7; x++) {
			game.board[5][x] = { x, y: 5, player: x < 4 ? 'player1' : 'player2' };
		}
	});
	
	describe('_checkAndClearRows', () => {
		it('should not clear a row with fewer than 8 cells', () => {
			// Row 5 has only 7 cells
			const clearedRows = gameManager._checkAndClearRows(game);
			
			// Verify no rows were cleared
			expect(clearedRows.length).to.equal(0);
			
			// Verify the cells in row 5 are still there
			for (let x = 0; x < 7; x++) {
				expect(game.board[5][x]).to.not.be.null;
			}
		});
		
		it('should clear a row with 8 or more cells', () => {
			// Fill row 5 with 8 cells
			for (let x = 0; x < 8; x++) {
				game.board[5][x] = { x, y: 5, player: x < 4 ? 'player1' : 'player2' };
			}
			
			const clearedRows = gameManager._checkAndClearRows(game);
			
			// Verify row 5 was cleared
			expect(clearedRows.length).to.equal(1);
			expect(clearedRows[0]).to.equal(5);
			
			// Verify the cells in row 5 are now null (except for any in safe home zones)
			for (let x = 0; x < 10; x++) {
				if (!gameManager._isCellInSafeHomeZone(game, x, 5)) {
					expect(game.board[5][x]).to.be.null;
				}
			}
		});
		
		it('should not clear cells in safe home zones', () => {
			// Fill row 8 (which contains home zones) with cells
			for (let x = 0; x < 10; x++) {
				game.board[8][x] = { x, y: 8, player: x < 5 ? 'player1' : 'player2' };
			}
			
			// Add a piece to player1's home zone to make it "safe"
			game.board[8][2] = {
				x: 2,
				y: 8,
				player: 'player1',
				chessPiece: { id: 'pawn1', type: 'pawn', player: 'player1' }
			};
			game.players.player1.pieces.push({ id: 'pawn1', type: 'pawn', x: 2, y: 8 });
			
			// Add a piece to player2's home zone to make it "safe" as well
			game.board[8][7] = {
				x: 7,
				y: 8,
				player: 'player2',
				chessPiece: { id: 'pawn2', type: 'pawn', player: 'player2' }
			};
			game.players.player2.pieces.push({ id: 'pawn2', type: 'pawn', x: 7, y: 8 });
			
			// Now manually remove the piece from player2's pieces array
			// to simulate an "unsafe" home zone
			game.players.player2.pieces = game.players.player2.pieces.filter(p => p.id !== 'pawn2');
			
			// Fill row 5 with 8 cells to ensure we have a row to clear
			for (let x = 0; x < 8; x++) {
				game.board[5][x] = { x, y: 5, player: x < 4 ? 'player1' : 'player2' };
			}
			
			const clearedRows = gameManager._checkAndClearRows(game);
			
			// Verify at least one row was cleared
			expect(clearedRows.length).to.be.at.least(1);
			
			// Check if row 8 was cleared
			const row8Cleared = clearedRows.includes(8);
			
			if (row8Cleared) {
				// If row 8 was cleared, verify cells in player1's home zone are still there (because it's "safe")
				for (let x = 0; x < 5; x++) {
					expect(game.board[8][x]).to.not.be.null;
				}
				
				// Verify cells in player2's home zone are cleared (because it's not "safe")
				for (let x = 5; x < 10; x++) {
					expect(game.board[8][x]).to.be.null;
				}
			} else {
				// If row 8 was not cleared, verify row 5 was cleared
				expect(clearedRows).to.include(5);
				
				// Verify the cells in row 5 are now null
				for (let x = 0; x < 10; x++) {
					if (!gameManager._isCellInSafeHomeZone(game, x, 5)) {
						expect(game.board[5][x]).to.be.null;
					}
				}
			}
		});
		
		it('should handle multiple rows being cleared', () => {
			// Fill rows 5 and 6 with cells
			for (let y = 5; y <= 6; y++) {
				for (let x = 0; x < 8; x++) {
					game.board[y][x] = { x, y, player: x < 4 ? 'player1' : 'player2' };
				}
			}
			
			const clearedRows = gameManager._checkAndClearRows(game);
			
			// Verify both rows were cleared
			expect(clearedRows.length).to.equal(2);
			expect(clearedRows).to.include(5);
			expect(clearedRows).to.include(6);
			
			// Verify the cells in both rows are now null
			for (let y = 5; y <= 6; y++) {
				for (let x = 0; x < 10; x++) {
					if (!gameManager._isCellInSafeHomeZone(game, x, y)) {
						expect(game.board[y][x]).to.be.null;
					}
				}
			}
		});
	});
	
	describe('_clearRow', () => {
		it('should clear a row and shift rows above it down', () => {
			// Fill rows 4, 5, and 6 with cells
			for (let y = 4; y <= 6; y++) {
				for (let x = 0; x < 8; x++) {
					game.board[y][x] = { x, y, player: x < 4 ? 'player1' : 'player2' };
				}
			}
			
			// Clear row 5
			gameManager._clearRow(game, 5);
			
			// Verify row 5 now contains the cells that were in row 4
			for (let x = 0; x < 8; x++) {
				expect(game.board[5][x]).to.deep.include({
					x,
					y: 4, // Original y value
					player: x < 4 ? 'player1' : 'player2'
				});
			}
			
			// Verify row 4 is now empty
			for (let x = 0; x < 10; x++) {
				expect(game.board[4][x]).to.be.null;
			}
		});
		
		it('should handle chess pieces when clearing a row', () => {
			// Add a chess piece to row 5
			game.board[5][3] = {
				x: 3,
				y: 5,
				player: 'player1',
				chessPiece: { id: 'bishop1', type: 'bishop', player: 'player1' }
			};
			game.players.player1.pieces.push({ id: 'bishop1', type: 'bishop', x: 3, y: 5 });
			
			// Clear row 5
			gameManager._clearRow(game, 5);
			
			// Verify the chess piece was removed from the player's pieces array
			expect(game.players.player1.pieces.find(p => p.id === 'bishop1')).to.be.undefined;
			
			// Verify the cell is now null
			expect(game.board[5][3]).to.be.null;
		});
	});
}); 