/**
 * Unit Tests for server/game/ChessManager.js
 * 
 * Tests chess move validation and the hasValidChessMoves method.
 */

const ChessManager = require('../../server/game/ChessManager');
const BoardManager = require('../../server/game/BoardManager');
const IslandManager = require('../../server/game/IslandManager');

describe('ChessManager', () => {
	let chessManager;
	let boardManager;
	let islandManager;
	let mockGame;
	
	beforeEach(() => {
		// Create mock dependencies
		boardManager = {
			isCellInSafeHomeZone: jest.fn().mockReturnValue(false)
		};
		
		islandManager = {
			hasPathToKing: jest.fn().mockReturnValue(true)
		};
		
		// Create chess manager
		chessManager = new ChessManager(boardManager, islandManager);
		
		// Create mock game
		mockGame = {
			board: createEmptyBoard(16, 16),
			chessPieces: [],
			players: {
				'player1': {
					id: 'player1',
					color: 0x0000ff
				},
				'player2': {
					id: 'player2',
					color: 0xff0000
				}
			}
		};
		
		// Add player1's chess pieces
		mockGame.chessPieces.push(
			{ id: 'p1-pawn-1', type: 'pawn', player: 'player1', x: 2, z: 12, hasMoved: false },
			{ id: 'p1-rook-1', type: 'rook', player: 'player1', x: 1, z: 14, hasMoved: false },
			{ id: 'p1-knight-1', type: 'knight', player: 'player1', x: 3, z: 14, hasMoved: false },
			{ id: 'p1-king-1', type: 'king', player: 'player1', x: 4, z: 14, hasMoved: false }
		);
		
		// Add player2's chess pieces
		mockGame.chessPieces.push(
			{ id: 'p2-pawn-1', type: 'pawn', player: 'player2', x: 10, z: 3, hasMoved: false },
			{ id: 'p2-rook-1', type: 'rook', player: 'player2', x: 9, z: 1, hasMoved: false },
			{ id: 'p2-knight-1', type: 'knight', player: 'player2', x: 11, z: 1, hasMoved: false },
			{ id: 'p2-king-1', type: 'king', player: 'player2', x: 12, z: 1, hasMoved: false }
		);
		
		// Update board with chess piece positions
		mockGame.chessPieces.forEach(piece => {
			mockGame.board[piece.z][piece.x] = {
				type: 'chess',
				player: piece.player,
				pieceType: piece.type
			};
		});
		
		// Add some tetromino cells to the board
		mockGame.board[10][5] = { type: 'tetromino', player: 'player1' };
		mockGame.board[10][6] = { type: 'tetromino', player: 'player1' };
		mockGame.board[11][5] = { type: 'tetromino', player: 'player1' };
		mockGame.board[11][6] = { type: 'tetromino', player: 'player1' };
		
		mockGame.board[5][10] = { type: 'tetromino', player: 'player2' };
		mockGame.board[5][11] = { type: 'tetromino', player: 'player2' };
		mockGame.board[6][10] = { type: 'tetromino', player: 'player2' };
		mockGame.board[6][11] = { type: 'tetromino', player: 'player2' };
	});
	
	// Helper to create an empty board
	function createEmptyBoard(width, height) {
		const board = [];
		for (let z = 0; z < height; z++) {
			board[z] = [];
			for (let x = 0; x < width; x++) {
				board[z][x] = null;
			}
		}
		return board;
	}
	
	describe('hasValidChessMoves', () => {
		it('should return true when a player has valid chess moves', () => {
			// Create a clear path for the pawn
			mockGame.board[11][2] = null;
			
			// Check if player1 has valid moves
			const hasValidMoves = chessManager.hasValidChessMoves(mockGame, 'player1');
			
			expect(hasValidMoves).toBe(true);
		});
		
		it('should return false when a player has no valid chess moves', () => {
			// Block all possible moves for player1's pieces
			// Surround pawn with blockers
			mockGame.board[11][1] = { type: 'tetromino', player: 'player1' };
			mockGame.board[11][2] = { type: 'tetromino', player: 'player1' };
			mockGame.board[11][3] = { type: 'tetromino', player: 'player1' };
			
			// Block knight's moves
			for (let z = 12; z <= 16; z++) {
				for (let x = 1; x <= 5; x++) {
					if (mockGame.board[z][x] === null) {
						mockGame.board[z][x] = { type: 'tetromino', player: 'player1' };
					}
				}
			}
			
			// Block rook and king moves
			for (let z = 13; z <= 15; z++) {
				for (let x = 0; x <= 5; x++) {
					if (mockGame.board[z][x] === null) {
						mockGame.board[z][x] = { type: 'tetromino', player: 'player1' };
					}
				}
			}
			
			// Check if player1 has valid moves
			const hasValidMoves = chessManager.hasValidChessMoves(mockGame, 'player1');
			
			expect(hasValidMoves).toBe(false);
		});
		
		it('should return false if the player has no chess pieces', () => {
			// Remove all player1's pieces
			mockGame.chessPieces = mockGame.chessPieces.filter(piece => piece.player !== 'player1');
			
			// Update board to remove player1's pieces
			for (let z = 0; z < mockGame.board.length; z++) {
				for (let x = 0; x < mockGame.board[z].length; x++) {
					if (mockGame.board[z][x] && mockGame.board[z][x].type === 'chess' && mockGame.board[z][x].player === 'player1') {
						mockGame.board[z][x] = null;
					}
				}
			}
			
			const hasValidMoves = chessManager.hasValidChessMoves(mockGame, 'player1');
			
			expect(hasValidMoves).toBe(false);
		});
		
		it('should check each piece type for valid moves', () => {
			// Make and test specific mocks to validate each piece type's movement
			// For this test, we'll create a clearer board for easier validation
			mockGame = {
				board: createEmptyBoard(16, 16),
				chessPieces: [],
				players: {
					'player1': {
						id: 'player1',
						color: 0x0000ff
					}
				}
			};
			
			// Place pieces in positions where they have clear moves
			mockGame.chessPieces = [
				// Pawn with clear forward path
				{ id: 'p1-pawn', type: 'pawn', player: 'player1', x: 5, z: 10, hasMoved: false },
				
				// Rook with clear horizontal and vertical paths
				{ id: 'p1-rook', type: 'rook', player: 'player1', x: 8, z: 8, hasMoved: false },
				
				// Knight with clear L-shaped moves
				{ id: 'p1-knight', type: 'knight', player: 'player1', x: 3, z: 3, hasMoved: false },
				
				// Bishop with clear diagonal paths
				{ id: 'p1-bishop', type: 'bishop', player: 'player1', x: 12, z: 12, hasMoved: false },
				
				// Queen with clear paths in all directions
				{ id: 'p1-queen', type: 'queen', player: 'player1', x: 8, z: 12, hasMoved: false },
				
				// King with clear adjacent moves
				{ id: 'p1-king', type: 'king', player: 'player1', x: 4, z: 14, hasMoved: false }
			];
			
			// Update board with chess piece positions
			mockGame.chessPieces.forEach(piece => {
				mockGame.board[piece.z][piece.x] = {
					type: 'chess',
					player: piece.player,
					pieceType: piece.type
				};
			});
			
			// Spy on validation methods
			const validateSpy = jest.spyOn(chessManager, '_validateMoveByPieceType');
			const pathSpy = jest.spyOn(chessManager, '_checkPathObstruction').mockReturnValue(true);
			
			// Check valid moves
			const hasValidMoves = chessManager.hasValidChessMoves(mockGame, 'player1');
			
			expect(hasValidMoves).toBe(true);
			expect(validateSpy).toHaveBeenCalled();
			expect(pathSpy).toHaveBeenCalled();
		});
		
		it('should check path obstructions for non-knight pieces', () => {
			// Spy on validation methods
			const validateSpy = jest.spyOn(chessManager, '_validateMoveByPieceType')
				.mockImplementation((game, piece, x, z) => {
					// Return true for specific test cases
					return true;
				});
			
			const pathSpy = jest.spyOn(chessManager, '_checkPathObstruction')
				.mockImplementation((game, piece, x, z) => {
					// Return false to simulate path obstruction for all except knights
					return piece.type === 'knight';
				});
			
			// With path obstructions for non-knight pieces
			// Knight should still be able to move
			const hasValidMoves = chessManager.hasValidChessMoves(mockGame, 'player1');
			
			expect(hasValidMoves).toBe(true);
			expect(validateSpy).toHaveBeenCalled();
			expect(pathSpy).toHaveBeenCalled();
		});
		
		it('should handle errors gracefully and default to true', () => {
			// Force an error by making _validateMoveByPieceType throw
			jest.spyOn(chessManager, '_validateMoveByPieceType').mockImplementation(() => {
				throw new Error('Test error');
			});
			
			// Should return true (safe default) when an error occurs
			const hasValidMoves = chessManager.hasValidChessMoves(mockGame, 'player1');
			
			expect(hasValidMoves).toBe(true);
		});
	});
	
	describe('_validateMoveByPieceType', () => {
		it('should validate pawn moves correctly', () => {
			const pawn = mockGame.chessPieces.find(p => p.id === 'p1-pawn-1');
			
			// Valid forward move (1 space)
			expect(chessManager._validateMoveByPieceType(mockGame, pawn, 2, 11)).toBe(true);
			
			// Valid forward move (2 spaces) for unmoved pawn
			expect(chessManager._validateMoveByPieceType(mockGame, pawn, 2, 10)).toBe(true);
			
			// Invalid sideways move
			expect(chessManager._validateMoveByPieceType(mockGame, pawn, 3, 12)).toBe(false);
			
			// Invalid diagonal move without capture
			expect(chessManager._validateMoveByPieceType(mockGame, pawn, 3, 11)).toBe(false);
			
			// Valid diagonal move with capture (simulate enemy piece)
			mockGame.board[11][3] = { type: 'chess', player: 'player2' };
			expect(chessManager._validateMoveByPieceType(mockGame, pawn, 3, 11)).toBe(true);
		});
		
		it('should validate rook moves correctly', () => {
			const rook = mockGame.chessPieces.find(p => p.id === 'p1-rook-1');
			
			// Valid horizontal move
			expect(chessManager._validateMoveByPieceType(mockGame, rook, 5, 14)).toBe(true);
			
			// Valid vertical move
			expect(chessManager._validateMoveByPieceType(mockGame, rook, 1, 10)).toBe(true);
			
			// Invalid diagonal move
			expect(chessManager._validateMoveByPieceType(mockGame, rook, 3, 12)).toBe(false);
		});
		
		it('should validate knight moves correctly', () => {
			const knight = mockGame.chessPieces.find(p => p.id === 'p1-knight-1');
			
			// Valid L-shaped moves
			expect(chessManager._validateMoveByPieceType(mockGame, knight, 1, 13)).toBe(true); // 2 left, 1 forward
			expect(chessManager._validateMoveByPieceType(mockGame, knight, 5, 13)).toBe(true); // 2 right, 1 forward
			expect(chessManager._validateMoveByPieceType(mockGame, knight, 2, 12)).toBe(true); // 1 left, 2 forward
			expect(chessManager._validateMoveByPieceType(mockGame, knight, 4, 12)).toBe(true); // 1 right, 2 forward
			
			// Invalid moves
			expect(chessManager._validateMoveByPieceType(mockGame, knight, 4, 14)).toBe(false); // 1 right, same row
			expect(chessManager._validateMoveByPieceType(mockGame, knight, 5, 11)).toBe(false); // 2 right, 3 forward
		});
		
		it('should validate king moves correctly', () => {
			const king = mockGame.chessPieces.find(p => p.id === 'p1-king-1');
			
			// Valid moves (1 space in any direction)
			expect(chessManager._validateMoveByPieceType(mockGame, king, 3, 14)).toBe(true); // Left
			expect(chessManager._validateMoveByPieceType(mockGame, king, 5, 14)).toBe(true); // Right
			expect(chessManager._validateMoveByPieceType(mockGame, king, 4, 13)).toBe(true); // Forward
			expect(chessManager._validateMoveByPieceType(mockGame, king, 3, 13)).toBe(true); // Diagonal
			
			// Invalid moves (more than 1 space)
			expect(chessManager._validateMoveByPieceType(mockGame, king, 2, 14)).toBe(false);
			expect(chessManager._validateMoveByPieceType(mockGame, king, 4, 12)).toBe(false);
		});
	});
	
	describe('_checkPathObstruction', () => {
		it('should detect obstructions in a straight line path', () => {
			const rook = mockGame.chessPieces.find(p => p.id === 'p1-rook-1');
			
			// Clear path
			expect(chessManager._checkPathObstruction(mockGame, rook, 1, 10)).toBe(true);
			
			// Place obstruction
			mockGame.board[12][1] = { type: 'tetromino', player: 'player1' };
			
			// Path with obstruction
			expect(chessManager._checkPathObstruction(mockGame, rook, 1, 10)).toBe(false);
		});
		
		it('should always return true for knight (jumps over pieces)', () => {
			const knight = mockGame.chessPieces.find(p => p.id === 'p1-knight-1');
			
			// Place obstructions in the way
			mockGame.board[13][3] = { type: 'tetromino', player: 'player1' };
			
			// Knight should still have clear path (jumps over)
			expect(chessManager._checkPathObstruction(mockGame, knight, 1, 13)).toBe(true);
		});
		
		it('should detect obstructions in a diagonal path', () => {
			// Add a bishop
			const bishop = { id: 'p1-bishop-1', type: 'bishop', player: 'player1', x: 5, z: 5, hasMoved: false };
			mockGame.chessPieces.push(bishop);
			mockGame.board[5][5] = { type: 'chess', player: 'player1', pieceType: 'bishop' };
			
			// Clear diagonal path
			expect(chessManager._checkPathObstruction(mockGame, bishop, 7, 7)).toBe(true);
			
			// Place obstruction
			mockGame.board[6][6] = { type: 'tetromino', player: 'player1' };
			
			// Path with obstruction
			expect(chessManager._checkPathObstruction(mockGame, bishop, 7, 7)).toBe(false);
		});
	});
});