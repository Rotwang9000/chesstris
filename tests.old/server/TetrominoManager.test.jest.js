/**
 * Unit Tests for server/game/TetrominoManager.js
 * 
 * Tests tetromino validation, placement, and integration with chess move validation.
 */

const TetrominoManager = require('../../server/game/TetrominoManager');
const BoardManager = require('../../server/game/BoardManager');
const IslandManager = require('../../server/game/IslandManager');
const { TETROMINO_SHAPES } = require('../../server/game/Constants');

describe('TetrominoManager', () => {
	let tetrominoManager;
	let boardManager;
	let islandManager;
	let mockGame;
	
	beforeEach(() => {
		// Create mock dependencies
		boardManager = {
			hasCellUnderneath: jest.fn(),
			checkAndClearRows: jest.fn().mockReturnValue([])
		};
		
		islandManager = {
			updateIslandsAfterTetrominoPlacement: jest.fn(),
			hasPathToKing: jest.fn().mockReturnValue(true)
		};
		
		// Create tetromino manager
		tetrominoManager = new TetrominoManager(boardManager, islandManager);
		
		// Create mock game
		mockGame = {
			board: createEmptyBoard(16, 16),
			chessPieces: [],
			players: {
				'player1': {
					id: 'player1',
					color: 0x0000ff,
					lastTetrominoPlacement: null
				},
				'player2': {
					id: 'player2',
					color: 0xff0000,
					lastTetrominoPlacement: { x: 5, z: 5 }
				}
			},
			homeZones: {
				'player1': { x: 2, z: 14, width: 4, height: 2 }
			}
		};
		
		// Add player1's home cells to the board
		for (let z = 14; z < 16; z++) {
			for (let x = 0; x < 4; x++) {
				mockGame.board[z][x] = {
					type: 'home',
					player: 'player1',
					color: 0x0000ff
				};
			}
		}
		
		// Add some existing cells for player1
		mockGame.board[12][2] = {
			type: 'tetromino',
			player: 'player1',
			color: 0x0000ff
		};
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
	
	describe('isValidTetrisPiece', () => {
		it('should return true for valid tetris piece types', () => {
			expect(tetrominoManager.isValidTetrisPiece('I')).toBe(true);
			expect(tetrominoManager.isValidTetrisPiece('O')).toBe(true);
			expect(tetrominoManager.isValidTetrisPiece('T')).toBe(true);
			expect(tetrominoManager.isValidTetrisPiece('S')).toBe(true);
			expect(tetrominoManager.isValidTetrisPiece('Z')).toBe(true);
			expect(tetrominoManager.isValidTetrisPiece('J')).toBe(true);
			expect(tetrominoManager.isValidTetrisPiece('L')).toBe(true);
		});
		
		it('should return false for invalid tetris piece types', () => {
			expect(tetrominoManager.isValidTetrisPiece('X')).toBe(false);
			expect(tetrominoManager.isValidTetrisPiece('')).toBe(false);
			expect(tetrominoManager.isValidTetrisPiece(null)).toBe(false);
			expect(tetrominoManager.isValidTetrisPiece(undefined)).toBe(false);
			expect(tetrominoManager.isValidTetrisPiece(123)).toBe(false);
		});
	});
	
	describe('getTetrisPieceShape', () => {
		it('should return the correct shape for a piece type and rotation', () => {
			// Test each piece type with each rotation
			for (const pieceType of ['I', 'O', 'T', 'S', 'Z', 'J', 'L']) {
				for (let rotation = 0; rotation < 4; rotation++) {
					const shape = tetrominoManager.getTetrisPieceShape(pieceType, rotation);
					expect(shape).toEqual(TETROMINO_SHAPES[pieceType][rotation % 4]);
				}
			}
		});
		
		it('should return null for invalid piece types', () => {
			expect(tetrominoManager.getTetrisPieceShape('X', 0)).toBeNull();
			expect(tetrominoManager.getTetrisPieceShape(null, 0)).toBeNull();
			expect(tetrominoManager.getTetrisPieceShape(undefined, 0)).toBeNull();
		});
	});
	
	describe('generateTetrominos', () => {
		it('should generate an array of tetrominos for a player', () => {
			const tetrominos = tetrominoManager.generateTetrominos(mockGame, 'player1');
			
			expect(tetrominos).toBeInstanceOf(Array);
			expect(tetrominos.length).toBe(3);
			
			tetrominos.forEach(tetromino => {
				expect(tetromino).toHaveProperty('id');
				expect(tetromino).toHaveProperty('pieceType');
				expect(tetromino).toHaveProperty('rotation');
				expect(tetromino).toHaveProperty('shape');
				expect(['I', 'O', 'T', 'S', 'Z', 'J', 'L']).toContain(tetromino.pieceType);
				expect(tetromino.rotation).toBeGreaterThanOrEqual(0);
				expect(tetromino.rotation).toBeLessThan(4);
				expect(tetromino.shape).toBeInstanceOf(Array);
			});
		});
	});
	
	describe('hasAdjacentCell', () => {
		it('should return true when a tetromino has an adjacent cell with the player ID', () => {
			// Test adjacent to existing cell
			const result = tetrominoManager.hasAdjacentCell(mockGame, 3, 12, 'player1');
			
			expect(result.hasAdjacent).toBe(true);
			expect(result.x).toBe(2);
			expect(result.z).toBe(12);
		});
		
		it('should return false when a tetromino has no adjacent cells with the player ID', () => {
			// Test away from any existing cells
			const result = tetrominoManager.hasAdjacentCell(mockGame, 10, 10, 'player1');
			
			expect(result.hasAdjacent).toBe(false);
		});
		
		it('should check all four adjacent positions', () => {
			// Place cells in specific positions to test all directions
			mockGame.board[5][5] = {
				type: 'tetromino',
				player: 'player1',
				color: 0x0000ff
			};
			
			// Test each adjacent position
			expect(tetrominoManager.hasAdjacentCell(mockGame, 4, 5, 'player1').hasAdjacent).toBe(true); // Left
			expect(tetrominoManager.hasAdjacentCell(mockGame, 6, 5, 'player1').hasAdjacent).toBe(true); // Right
			expect(tetrominoManager.hasAdjacentCell(mockGame, 5, 4, 'player1').hasAdjacent).toBe(true); // Forward
			expect(tetrominoManager.hasAdjacentCell(mockGame, 5, 6, 'player1').hasAdjacent).toBe(true); // Backward
		});
	});
	
	describe('canPlaceTetromino', () => {
		beforeEach(() => {
			// Mock hasPathToKing to return true by default
			islandManager.hasPathToKing.mockReturnValue(true);
		});
		
		it('should return true for valid first placement adjacent to home zone', () => {
			// Test placement adjacent to home zone for first placement
			const tetromino = {
				shape: TETROMINO_SHAPES['I'][0]
			};
			
			// This should be valid because it's adjacent to player1's home zone
			const canPlace = tetrominoManager.canPlaceTetromino(
				mockGame,
				tetromino,
				2, // x
				13, // z
				0, // y
				'player1'
			);
			
			expect(canPlace).toBe(true);
		});
		
		it('should return true for valid placement with path to king', () => {
			// Add player's last tetromino placement to simulate not being first placement
			mockGame.players['player1'].lastTetrominoPlacement = { x: 2, z: 12 };
			
			const tetromino = {
				shape: TETROMINO_SHAPES['I'][0]
			};
			
			// This should be valid because it's adjacent to player's cell and has path to king
			const canPlace = tetrominoManager.canPlaceTetromino(
				mockGame,
				tetromino,
				3, // x
				12, // z
				0, // y
				'player1'
			);
			
			expect(canPlace).toBe(true);
			expect(islandManager.hasPathToKing).toHaveBeenCalled();
		});
		
		it('should return false for placement with no adjacent cells', () => {
			const tetromino = {
				shape: TETROMINO_SHAPES['I'][0]
			};
			
			// This should be invalid because it's not adjacent to any existing cells
			const canPlace = tetrominoManager.canPlaceTetromino(
				mockGame,
				tetromino,
				10, // x
				10, // z
				0, // y
				'player1'
			);
			
			expect(canPlace).toBe(false);
		});
		
		it('should return false for placement that overlaps existing cells', () => {
			const tetromino = {
				shape: TETROMINO_SHAPES['I'][0]
			};
			
			// This should be invalid because it overlaps with an existing cell
			const canPlace = tetrominoManager.canPlaceTetromino(
				mockGame,
				tetromino,
				2, // x
				12, // z
				0, // y
				'player1'
			);
			
			expect(canPlace).toBe(false);
		});
		
		it('should return false for placement at Y=1 with cells underneath', () => {
			const tetromino = {
				shape: TETROMINO_SHAPES['I'][0]
			};
			
			// Mock hasCellUnderneath to return true
			boardManager.hasCellUnderneath.mockReturnValue(true);
			
			// This should be invalid because Y=1 with cells underneath
			const canPlace = tetrominoManager.canPlaceTetromino(
				mockGame,
				tetromino,
				2, // x
				13, // z
				1, // y
				'player1'
			);
			
			expect(canPlace).toBe(false);
			expect(boardManager.hasCellUnderneath).toHaveBeenCalled();
		});
		
		it('should return false for placement with no path to king (except first placement)', () => {
			// Add player's last tetromino placement to simulate not being first placement
			mockGame.players['player1'].lastTetrominoPlacement = { x: 2, z: 12 };
			
			// Mock hasPathToKing to return false
			islandManager.hasPathToKing.mockReturnValue(false);
			
			const tetromino = {
				shape: TETROMINO_SHAPES['I'][0]
			};
			
			// This should be invalid because there's no path to king
			const canPlace = tetrominoManager.canPlaceTetromino(
				mockGame,
				tetromino,
				3, // x
				12, // z
				0, // y
				'player1'
			);
			
			expect(canPlace).toBe(false);
			expect(islandManager.hasPathToKing).toHaveBeenCalled();
		});
	});
	
	describe('placeTetromino', () => {
		it('should place tetromino on the board and update game state', () => {
			const tetromino = {
				shape: TETROMINO_SHAPES['I'][0]
			};
			
			const placedCells = tetrominoManager.placeTetromino(
				mockGame,
				tetromino,
				5, // x
				5, // z
				'player1'
			);
			
			// Check that cells were placed correctly
			expect(placedCells.length).toBeGreaterThan(0);
			placedCells.forEach(cell => {
				expect(mockGame.board[cell.z][cell.x]).toEqual({
					type: 'tetromino',
					player: 'player1',
					color: 0x0000ff,
					placedAt: expect.any(Number)
				});
			});
			
			// Check that island connectivity was updated
			expect(islandManager.updateIslandsAfterTetrominoPlacement).toHaveBeenCalled();
		});
	});
	
	describe('processTetrominoPiece', () => {
		it('should successfully process valid tetromino placement', () => {
			// Mock dependencies
			tetrominoManager.isValidTetrisPiece = jest.fn().mockReturnValue(true);
			tetrominoManager.getTetrisPieceShape = jest.fn().mockReturnValue(TETROMINO_SHAPES['I'][0]);
			tetrominoManager.canPlaceTetromino = jest.fn().mockReturnValue(true);
			tetrominoManager.placeTetromino = jest.fn().mockReturnValue([{ x: 5, z: 5 }]);
			
			const result = tetrominoManager.processTetrominoPiece(
				mockGame,
				'player1',
				{
					pieceType: 'I',
					rotation: 0,
					x: 5,
					z: 5
				}
			);
			
			// Verify result
			expect(result.success).toBe(true);
			expect(result.completedRows).toBe(0);
			expect(result.placedCells).toEqual([{ x: 5, z: 5 }]);
			
			// Verify method calls
			expect(tetrominoManager.isValidTetrisPiece).toHaveBeenCalledWith('I');
			expect(tetrominoManager.getTetrisPieceShape).toHaveBeenCalledWith('I', 0);
			expect(tetrominoManager.canPlaceTetromino).toHaveBeenCalled();
			expect(tetrominoManager.placeTetromino).toHaveBeenCalled();
			expect(boardManager.checkAndClearRows).toHaveBeenCalled();
			
			// Verify game state update
			expect(mockGame.players['player1'].lastTetrominoPlacement).toEqual({ x: 5, z: 5 });
		});
		
		it('should return exploded=true for tetromino that explodes at Y=1', () => {
			// Mock dependencies
			tetrominoManager.isValidTetrisPiece = jest.fn().mockReturnValue(true);
			tetrominoManager.getTetrisPieceShape = jest.fn().mockReturnValue(TETROMINO_SHAPES['I'][0]);
			tetrominoManager.canPlaceTetromino = jest.fn().mockReturnValue(false);
			
			const result = tetrominoManager.processTetrominoPiece(
				mockGame,
				'player1',
				{
					pieceType: 'I',
					rotation: 0,
					x: 5,
					z: 5,
					y: 1 // At Y=1, which should cause explosion
				}
			);
			
			// Verify result
			expect(result.success).toBe(true);
			expect(result.exploded).toBe(true);
			expect(result.message).toContain('exploded');
			
			// Verify method calls
			expect(tetrominoManager.isValidTetrisPiece).toHaveBeenCalledWith('I');
			expect(tetrominoManager.getTetrisPieceShape).toHaveBeenCalledWith('I', 0);
			expect(tetrominoManager.canPlaceTetromino).toHaveBeenCalled();
			
			// placeTetromino should not be called for explosion
			expect(tetrominoManager.placeTetromino).not.toHaveBeenCalled();
		});
		
		it('should return error for invalid tetromino type', () => {
			// Mock dependencies
			tetrominoManager.isValidTetrisPiece = jest.fn().mockReturnValue(false);
			
			const result = tetrominoManager.processTetrominoPiece(
				mockGame,
				'player1',
				{
					pieceType: 'X', // Invalid type
					rotation: 0,
					x: 5,
					z: 5
				}
			);
			
			// Verify result
			expect(result.success).toBe(false);
			expect(result.error).toContain('Invalid tetris piece type');
			
			// Verify method calls
			expect(tetrominoManager.isValidTetrisPiece).toHaveBeenCalledWith('X');
			expect(tetrominoManager.getTetrisPieceShape).not.toHaveBeenCalled();
			expect(tetrominoManager.canPlaceTetromino).not.toHaveBeenCalled();
			expect(tetrominoManager.placeTetromino).not.toHaveBeenCalled();
		});
		
		it('should return error for invalid placement position', () => {
			// Mock dependencies
			tetrominoManager.isValidTetrisPiece = jest.fn().mockReturnValue(true);
			tetrominoManager.getTetrisPieceShape = jest.fn().mockReturnValue(TETROMINO_SHAPES['I'][0]);
			tetrominoManager.canPlaceTetromino = jest.fn().mockReturnValue(false);
			
			const result = tetrominoManager.processTetrominoPiece(
				mockGame,
				'player1',
				{
					pieceType: 'I',
					rotation: 0,
					x: 5,
					z: 5,
					y: 0 // At Y=0, not an explosion but invalid placement
				}
			);
			
			// Verify result
			expect(result.success).toBe(false);
			expect(result.error).toContain('Cannot place tetris piece');
			
			// Verify method calls
			expect(tetrominoManager.isValidTetrisPiece).toHaveBeenCalledWith('I');
			expect(tetrominoManager.getTetrisPieceShape).toHaveBeenCalledWith('I', 0);
			expect(tetrominoManager.canPlaceTetromino).toHaveBeenCalled();
			expect(tetrominoManager.placeTetromino).not.toHaveBeenCalled();
		});
	});
});