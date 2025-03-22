/**
 * Tests for chess movement validation
 */

const { expect } = require('@jest/globals');
import GameManager from '../../server/game/GameManager.js';

describe('Chess Movement Validation', () => {
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
		
		// Add a player
		const playerId = 'player1';
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
		
		// Fill the board with cells to allow movement
		for (let y = 0; y < 10; y++) {
			for (let x = 0; x < 10; x++) {
				game.board[y][x] = { player: playerId };
			}
		}
	});
	
	describe('_isValidChessMove', () => {
		it('should validate king movement', () => {
			const king = {
				id: 'king1',
				type: 'king',
				player: 'player1'
			};
			
			// Kings can move one square in any direction
			expect(gameManager._isValidChessMove(game, king, 5, 5, 5, 6)).toBe(true); // Down
			expect(gameManager._isValidChessMove(game, king, 5, 5, 5, 4)).toBe(true); // Up
			expect(gameManager._isValidChessMove(game, king, 5, 5, 6, 5)).toBe(true); // Right
			expect(gameManager._isValidChessMove(game, king, 5, 5, 4, 5)).toBe(true); // Left
			expect(gameManager._isValidChessMove(game, king, 5, 5, 6, 6)).toBe(true); // Down-Right
			expect(gameManager._isValidChessMove(game, king, 5, 5, 4, 6)).toBe(true); // Down-Left
			expect(gameManager._isValidChessMove(game, king, 5, 5, 6, 4)).toBe(true); // Up-Right
			expect(gameManager._isValidChessMove(game, king, 5, 5, 4, 4)).toBe(true); // Up-Left
			
			// King can't move more than one square
			expect(gameManager._isValidChessMove(game, king, 5, 5, 5, 7)).toBe(false); // Two squares down
			expect(gameManager._isValidChessMove(game, king, 5, 5, 7, 5)).toBe(false); // Two squares right
			expect(gameManager._isValidChessMove(game, king, 5, 5, 7, 7)).toBe(false); // Two squares diagonally
		});
		
		it('should validate queen movement', () => {
			const queen = {
				id: 'queen1',
				type: 'queen',
				player: 'player1'
			};
			
			// Queens can move any number of squares horizontally, vertically, or diagonally
			expect(gameManager._isValidChessMove(game, queen, 5, 5, 5, 9)).toBe(true); // Down
			expect(gameManager._isValidChessMove(game, queen, 5, 5, 5, 0)).toBe(true); // Up
			expect(gameManager._isValidChessMove(game, queen, 5, 5, 9, 5)).toBe(true); // Right
			expect(gameManager._isValidChessMove(game, queen, 5, 5, 0, 5)).toBe(true); // Left
			expect(gameManager._isValidChessMove(game, queen, 5, 5, 8, 8)).toBe(true); // Down-Right
			expect(gameManager._isValidChessMove(game, queen, 5, 5, 2, 8)).toBe(true); // Down-Left
			expect(gameManager._isValidChessMove(game, queen, 5, 5, 8, 2)).toBe(true); // Up-Right
			expect(gameManager._isValidChessMove(game, queen, 5, 5, 2, 2)).toBe(true); // Up-Left
			
			// Queen can't move in an L-shape (like a knight)
			expect(gameManager._isValidChessMove(game, queen, 5, 5, 7, 6)).toBe(false);
			expect(gameManager._isValidChessMove(game, queen, 5, 5, 3, 6)).toBe(false);
		});
		
		it('should validate rook movement', () => {
			const rook = {
				id: 'rook1',
				type: 'rook',
				player: 'player1'
			};
			
			// Rooks can move any number of squares horizontally or vertically
			expect(gameManager._isValidChessMove(game, rook, 5, 5, 5, 9)).toBe(true); // Down
			expect(gameManager._isValidChessMove(game, rook, 5, 5, 5, 0)).toBe(true); // Up
			expect(gameManager._isValidChessMove(game, rook, 5, 5, 9, 5)).toBe(true); // Right
			expect(gameManager._isValidChessMove(game, rook, 5, 5, 0, 5)).toBe(true); // Left
			
			// Rooks can't move diagonally
			expect(gameManager._isValidChessMove(game, rook, 5, 5, 6, 6)).toBe(false);
			expect(gameManager._isValidChessMove(game, rook, 5, 5, 8, 8)).toBe(false);
		});
		
		it('should validate bishop movement', () => {
			const bishop = {
				id: 'bishop1',
				type: 'bishop',
				player: 'player1'
			};
			
			// Bishops can move any number of squares diagonally
			expect(gameManager._isValidChessMove(game, bishop, 5, 5, 8, 8)).toBe(true); // Down-Right
			expect(gameManager._isValidChessMove(game, bishop, 5, 5, 2, 8)).toBe(true); // Down-Left
			expect(gameManager._isValidChessMove(game, bishop, 5, 5, 8, 2)).toBe(true); // Up-Right
			expect(gameManager._isValidChessMove(game, bishop, 5, 5, 2, 2)).toBe(true); // Up-Left
			
			// Bishops can't move horizontally or vertically
			expect(gameManager._isValidChessMove(game, bishop, 5, 5, 5, 9)).toBe(false);
			expect(gameManager._isValidChessMove(game, bishop, 5, 5, 9, 5)).toBe(false);
		});
		
		it('should validate knight movement', () => {
			const knight = {
				id: 'knight1',
				type: 'knight',
				player: 'player1'
			};
			
			// Knights move in an L-shape (2 squares in one direction, then 1 square perpendicular)
			expect(gameManager._isValidChessMove(game, knight, 5, 5, 7, 6)).toBe(true); // 2 right, 1 down
			expect(gameManager._isValidChessMove(game, knight, 5, 5, 7, 4)).toBe(true); // 2 right, 1 up
			expect(gameManager._isValidChessMove(game, knight, 5, 5, 3, 6)).toBe(true); // 2 left, 1 down
			expect(gameManager._isValidChessMove(game, knight, 5, 5, 3, 4)).toBe(true); // 2 left, 1 up
			expect(gameManager._isValidChessMove(game, knight, 5, 5, 6, 7)).toBe(true); // 1 right, 2 down
			expect(gameManager._isValidChessMove(game, knight, 5, 5, 4, 7)).toBe(true); // 1 left, 2 down
			expect(gameManager._isValidChessMove(game, knight, 5, 5, 6, 3)).toBe(true); // 1 right, 2 up
			expect(gameManager._isValidChessMove(game, knight, 5, 5, 4, 3)).toBe(true); // 1 left, 2 up
			
			// Knights can't move in other patterns
			expect(gameManager._isValidChessMove(game, knight, 5, 5, 6, 6)).toBe(false); // Diagonal
			expect(gameManager._isValidChessMove(game, knight, 5, 5, 5, 7)).toBe(false); // Vertical
			expect(gameManager._isValidChessMove(game, knight, 5, 5, 7, 5)).toBe(false); // Horizontal
		});
		
		it('should validate pawn movement', () => {
			const pawn = {
				id: 'pawn1',
				type: 'pawn',
				player: 'player1'
			};
			
			// In this game, pawns can move one square in any direction
			expect(gameManager._isValidChessMove(game, pawn, 5, 5, 5, 6)).toBe(true); // Down
			expect(gameManager._isValidChessMove(game, pawn, 5, 5, 5, 4)).toBe(true); // Up
			expect(gameManager._isValidChessMove(game, pawn, 5, 5, 6, 5)).toBe(true); // Right
			expect(gameManager._isValidChessMove(game, pawn, 5, 5, 4, 5)).toBe(true); // Left
			expect(gameManager._isValidChessMove(game, pawn, 5, 5, 6, 6)).toBe(true); // Down-Right
			expect(gameManager._isValidChessMove(game, pawn, 5, 5, 4, 6)).toBe(true); // Down-Left
			expect(gameManager._isValidChessMove(game, pawn, 5, 5, 6, 4)).toBe(true); // Up-Right
			expect(gameManager._isValidChessMove(game, pawn, 5, 5, 4, 4)).toBe(true); // Up-Left
			
			// Pawns can't move more than one square
			expect(gameManager._isValidChessMove(game, pawn, 5, 5, 5, 7)).toBe(false);
			expect(gameManager._isValidChessMove(game, pawn, 5, 5, 7, 5)).toBe(false);
		});
		
		it('should prevent moving to a cell occupied by the player\'s own piece', () => {
			const king = {
				id: 'king1',
				type: 'king',
				player: 'player1'
			};
			
			// Place a piece at the destination
			game.board[6][5].chessPiece = {
				id: 'pawn1',
				type: 'pawn',
				player: 'player1'
			};
			
			// Attempt to move the king to the occupied cell
			expect(gameManager._isValidChessMove(game, king, 5, 5, 5, 6)).toBe(false);
		});
		
		it('should allow capturing opponent pieces', () => {
			const king = {
				id: 'king1',
				type: 'king',
				player: 'player1'
			};
			
			// Place an opponent's piece at the destination
			game.board[6][5].chessPiece = {
				id: 'pawn2',
				type: 'pawn',
				player: 'player2'
			};
			
			// Attempt to capture the opponent's piece
			expect(gameManager._isValidChessMove(game, king, 5, 5, 5, 6)).toBe(true);
		});
		
		it('should prevent moving outside the board', () => {
			const king = {
				id: 'king1',
				type: 'king',
				player: 'player1'
			};
			
			// Place the king at the edge of the board
			expect(gameManager._isValidChessMove(game, king, 0, 0, -1, 0)).toBe(false);
			expect(gameManager._isValidChessMove(game, king, 0, 0, 0, -1)).toBe(false);
			expect(gameManager._isValidChessMove(game, king, 9, 9, 10, 9)).toBe(false);
			expect(gameManager._isValidChessMove(game, king, 9, 9, 9, 10)).toBe(false);
		});

		it('should prevent queen from moving through obstacles', () => {
			const queen = {
				id: 'queen1',
				type: 'queen',
				player: 'player1'
			};
			
			// Place obstacles on the board
			game.board[5][7].chessPiece = { id: 'obstacle1', type: 'pawn', player: 'player2' }; // Right path
			game.board[7][5].chessPiece = { id: 'obstacle2', type: 'pawn', player: 'player2' }; // Down path
			game.board[7][7].chessPiece = { id: 'obstacle3', type: 'pawn', player: 'player2' }; // Diagonal path
			
			// Queen shouldn't be able to move through obstacles
			expect(gameManager._isValidChessMove(game, queen, 5, 5, 5, 9)).toBe(false); // Down past obstacle
			expect(gameManager._isValidChessMove(game, queen, 5, 5, 9, 5)).toBe(false); // Right past obstacle
			expect(gameManager._isValidChessMove(game, queen, 5, 5, 9, 9)).toBe(false); // Diagonal past obstacle
			
			// Queen should be able to move to the obstacle (capturing it)
			expect(gameManager._isValidChessMove(game, queen, 5, 5, 5, 7)).toBe(true); // To the obstacle
			expect(gameManager._isValidChessMove(game, queen, 5, 5, 7, 5)).toBe(true); // To the obstacle
			expect(gameManager._isValidChessMove(game, queen, 5, 5, 7, 7)).toBe(true); // To the obstacle
		});
		
		it('should prevent rook from moving through obstacles', () => {
			const rook = {
				id: 'rook1',
				type: 'rook',
				player: 'player1'
			};
			
			// Place obstacles on the board
			game.board[5][7].chessPiece = { id: 'obstacle1', type: 'pawn', player: 'player2' }; // Right path
			game.board[7][5].chessPiece = { id: 'obstacle2', type: 'pawn', player: 'player2' }; // Down path
			
			// Rook shouldn't be able to move through obstacles
			expect(gameManager._isValidChessMove(game, rook, 5, 5, 5, 9)).toBe(false); // Down past obstacle
			expect(gameManager._isValidChessMove(game, rook, 5, 5, 9, 5)).toBe(false); // Right past obstacle
			
			// Rook should be able to move to the obstacle (capturing it)
			expect(gameManager._isValidChessMove(game, rook, 5, 5, 5, 7)).toBe(true); // To the obstacle
			expect(gameManager._isValidChessMove(game, rook, 5, 5, 7, 5)).toBe(true); // To the obstacle
		});
		
		it('should prevent bishop from moving through obstacles', () => {
			const bishop = {
				id: 'bishop1',
				type: 'bishop',
				player: 'player1'
			};
			
			// Create a helper function to check if specific coordinates have a piece
			const hasPiece = (x, y) => {
				return game.board[y] && game.board[y][x] && game.board[y][x].chessPiece != null;
			};
			
			// First test - right diagonal with obstacle
			// Place an obstacle at (6,6) which is in the path from (5,5) to (8,8)
			if (!game.board[6][6]) game.board[6][6] = {};
			game.board[6][6].chessPiece = { id: 'obstacle1', type: 'pawn', player: 'player2' };
			
			// Verify the obstacle is in place
			expect(hasPiece(6, 6)).toBe(true);
			
			// Try to move past the obstacle
			expect(gameManager._isValidChessMove(game, bishop, 5, 5, 8, 8)).toBe(false);
			
			// Clear only the specific obstacle
			delete game.board[6][6].chessPiece;
			
			// Second test - left diagonal with obstacle
			// Create a board cell at (3,7) if it doesn't exist
			if (!game.board[7]) game.board[7] = [];
			if (!game.board[7][3]) game.board[7][3] = {};
			
			// Put an obstacle at (3,7)
			game.board[7][3].chessPiece = { id: 'obstacle2', type: 'pawn', player: 'player2' };
			
			// Test that we can access this cell
			expect(game.board[7][3].chessPiece).to.not.be.undefined;
			
			// Try to move past the obstacle (diagonal from (5,5) to (1,9))
			expect(gameManager._isValidChessMove(game, bishop, 5, 5, 1, 9)).toBe(false);
			
			// Test moving to the obstacle (capturing it)
			expect(gameManager._isValidChessMove(game, bishop, 5, 5, 3, 7)).toBe(true);
		});
		
		it('should allow knight to jump over obstacles', () => {
			const knight = {
				id: 'knight1',
				type: 'knight',
				player: 'player1'
			};
			
			// Place obstacles on the path, but not at the destination
			game.board[5][6].chessPiece = { id: 'obstacle1', type: 'pawn', player: 'player2' }; // On the path
			game.board[6][5].chessPiece = { id: 'obstacle2', type: 'pawn', player: 'player2' }; // On the path
			
			// Knight should be able to jump over obstacles
			expect(gameManager._isValidChessMove(game, knight, 5, 5, 7, 6)).toBe(true); // Can jump over obstacles
		});
	});
});