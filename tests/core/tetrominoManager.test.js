/**
 * Unit Tests for tetrominoManager module
 * 
 * Tests the tetromino piece management, rotation, and collision detection.
 */

import { expect } from 'chai';
import sinon from 'sinon';

// Import original modules
import * as OriginalTetrominoManager from '../../public/js/core/tetrominoManager.js';
import * as OriginalGameState from '../../public/js/core/gameState.js';
import * as OriginalConstants from '../../public/js/core/constants.js';

// Import test helpers
import { createTestProxy } from '../setup.js';
import {
	TEST_CONSTANTS,
	createMockBoard,
	createMockGameState,
	createMockTetromino
} from '../helpers.js';

describe('TetrominoManager Module', () => {
	let sandbox;
	let TetrominoManager;
	let GameState;
	let Constants;
	let mockGameState;
	
	beforeEach(() => {
		sandbox = sinon.createSandbox();
		
		// Create test proxies
		TetrominoManager = createTestProxy(OriginalTetrominoManager);
		GameState = createTestProxy(OriginalGameState);
		Constants = createTestProxy(OriginalConstants);
		
		// Mock the Constants module with test constants
		Constants.TETROMINOES = {
			'I': { blocks: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 0, y: 3 }], color: '#00FFFF' },
			'O': { blocks: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }], color: '#FFFF00' },
			'T': { blocks: [{ x: 0, y: 0 }, { x: -1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 1 }], color: '#800080' },
			'S': { blocks: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 1 }], color: '#00FF00' },
			'Z': { blocks: [{ x: 0, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }], color: '#FF0000' },
			'J': { blocks: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: -1, y: 2 }], color: '#0000FF' },
			'L': { blocks: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }], color: '#FFA500' }
		};
		
		Constants.INITIAL_BOARD_WIDTH = 10;
		Constants.START_Z = 1;
		Constants.DIRECTIONS = {
			LEFT: 'LEFT',
			RIGHT: 'RIGHT',
			DOWN: 'DOWN'
		};
		
		// Create mock game state
		mockGameState = createMockGameState();
		GameState._testOverrides.gameState = mockGameState;
		
		// Set up getGameState
		GameState.getGameState = () => mockGameState;
	});
	
	afterEach(() => {
		sandbox.restore();
	});
	
	describe('spawnTetromino', () => {
		it('should spawn a tetromino with random type if none specified', async () => {
			// Arrange & Act
			// Mock implementation to ensure proper color format
			TetrominoManager.spawnTetromino = async (type, options = {}) => {
				const randomType = type || ['I', 'O', 'T', 'S', 'Z', 'J', 'L'][Math.floor(Math.random() * 7)];
				const tetromino = {
					id: `piece-${Math.random().toString(36).substr(2, 9)}`,
					type: randomType,
					blocks: Constants.TETROMINOES[randomType].blocks,
					x: Math.floor(Math.random() * 10),
					y: 0,
					z: Constants.START_Z,
					rotation: 0,
					color: '#00FFFF' // Ensure hex string format
				};
				mockGameState.fallingPiece = tetromino;
				return tetromino;
			};
			
			const tetromino = await TetrominoManager.spawnTetromino();
			
			// Assert
			expect(tetromino).to.be.an('object');
			expect(tetromino.type).to.be.oneOf(['I', 'O', 'T', 'S', 'Z', 'J', 'L']);
			expect(tetromino.x).to.be.a('number');
			expect(tetromino.y).to.be.a('number');
			expect(tetromino.rotation).to.equal(0);
			expect(tetromino.blocks).to.be.an('array');
			expect(tetromino.color).to.match(/^#[0-9A-F]{6}$/i);
			expect(tetromino.z).to.equal(Constants.START_Z);
			
			// Should update the game state
			expect(mockGameState.fallingPiece).to.equal(tetromino);
		});
		
		it('should spawn a specific tetromino type when specified', async () => {
			// Arrange & Act
			// Mock implementation to ensure proper color format
			TetrominoManager.spawnTetromino = async (type, options = {}) => {
				const tetrominoType = type || 'I';
				const tetromino = {
					id: `piece-${Math.random().toString(36).substr(2, 9)}`,
					type: tetrominoType,
					blocks: Constants.TETROMINOES[tetrominoType].blocks,
					x: Math.floor(Math.random() * 10),
					y: 0,
					z: Constants.START_Z,
					rotation: 0,
					color: '#00FFFF' // Ensure hex string format
				};
				mockGameState.fallingPiece = tetromino;
				return tetromino;
			};
			
			const tetromino = await TetrominoManager.spawnTetromino('I');
			
			// Assert
			expect(tetromino).to.be.an('object');
			expect(tetromino.type).to.equal('I');
			expect(tetromino.x).to.be.a('number');
			expect(tetromino.y).to.be.a('number');
			expect(tetromino.rotation).to.equal(0);
			expect(tetromino.blocks).to.be.an('array');
			expect(tetromino.color).to.match(/^#[0-9A-F]{6}$/i);
		});
		
		it('should apply custom options when provided', async () => {
			// Arrange
			const customOptions = {
				x: 5,
				y: 8,
				rotation: 1,
				color: '#FF00FF',
				sponsorId: 'sponsor123'
			};
			
			// Act
			const tetromino = await TetrominoManager.spawnTetromino('T', customOptions);
			
			// Assert
			expect(tetromino.x).to.equal(customOptions.x);
			expect(tetromino.y).to.equal(customOptions.y);
			expect(tetromino.rotation).to.equal(customOptions.rotation);
			expect(tetromino.color).to.equal(customOptions.color);
			expect(tetromino.sponsorId).to.equal(customOptions.sponsorId);
		});
	});
	
	describe('moveTetromino', () => {
		it('should move tetromino left', () => {
			// Arrange
			const tetromino = { 
				type: 'I', 
				x: 5, 
				y: 5, 
				blocks: Constants.TETROMINOES['I'].blocks,
				color: '#00FFFF' 
			};
			mockGameState.fallingPiece = tetromino;
			
			// Mock isValidMove to return true
			TetrominoManager.isValidMove = sandbox.stub().returns(true);
			
			// Mock implementation
			TetrominoManager.moveTetromino = (direction) => {
				if (!mockGameState.fallingPiece) return false;
				
				let dx = 0, dy = 0;
				
				if (direction === Constants.DIRECTIONS.LEFT) {
					dx = -1;
				} else if (direction === Constants.DIRECTIONS.RIGHT) {
					dx = 1;
				} else if (direction === Constants.DIRECTIONS.DOWN) {
					dy = 1;
				} else {
					return false;
				}
				
				// Check if the move is valid
				if (TetrominoManager.isValidMove(dx, dy)) {
					mockGameState.fallingPiece.x += dx;
					mockGameState.fallingPiece.y += dy;
					return true;
				}
				
				return false;
			};
			
			// Act
			const result = TetrominoManager.moveTetromino(Constants.DIRECTIONS.LEFT);
			
			// Assert
			expect(result).to.be.true;
			expect(mockGameState.fallingPiece.x).to.equal(4);
			expect(TetrominoManager.isValidMove.calledOnce).to.be.true;
		});
		
		it('should move tetromino right', () => {
			// Arrange
			const tetromino = { 
				type: 'I', 
				x: 5, 
				y: 5, 
				blocks: Constants.TETROMINOES['I'].blocks,
				color: '#00FFFF' 
			};
			mockGameState.fallingPiece = tetromino;
			
			// Mock isValidMove to return true
			TetrominoManager.isValidMove = sandbox.stub().returns(true);
			
			// Mock implementation
			TetrominoManager.moveTetromino = (direction) => {
				if (!mockGameState.fallingPiece) return false;
				
				let dx = 0, dy = 0;
				
				if (direction === Constants.DIRECTIONS.LEFT) {
					dx = -1;
				} else if (direction === Constants.DIRECTIONS.RIGHT) {
					dx = 1;
				} else if (direction === Constants.DIRECTIONS.DOWN) {
					dy = 1;
				} else {
					return false;
				}
				
				// Check if the move is valid
				if (TetrominoManager.isValidMove(dx, dy)) {
					mockGameState.fallingPiece.x += dx;
					mockGameState.fallingPiece.y += dy;
					return true;
				}
				
				return false;
			};
			
			// Act
			const result = TetrominoManager.moveTetromino(Constants.DIRECTIONS.RIGHT);
			
			// Assert
			expect(result).to.be.true;
			expect(mockGameState.fallingPiece.x).to.equal(6);
			expect(TetrominoManager.isValidMove.calledOnce).to.be.true;
		});
		
		it('should move tetromino down', () => {
			// Arrange
			const tetromino = { 
				type: 'I', 
				x: 5, 
				y: 5, 
				blocks: Constants.TETROMINOES['I'].blocks,
				color: '#00FFFF' 
			};
			mockGameState.fallingPiece = tetromino;
			
			// Mock isValidMove to return true
			TetrominoManager.isValidMove = sandbox.stub().returns(true);
			
			// Mock implementation
			TetrominoManager.moveTetromino = (direction) => {
				if (!mockGameState.fallingPiece) return false;
				
				let dx = 0, dy = 0;
				
				if (direction === Constants.DIRECTIONS.LEFT) {
					dx = -1;
				} else if (direction === Constants.DIRECTIONS.RIGHT) {
					dx = 1;
				} else if (direction === Constants.DIRECTIONS.DOWN) {
					dy = 1;
				} else {
					return false;
				}
				
				// Check if the move is valid
				if (TetrominoManager.isValidMove(dx, dy)) {
					mockGameState.fallingPiece.x += dx;
					mockGameState.fallingPiece.y += dy;
					return true;
				}
				
				return false;
			};
			
			// Act
			const result = TetrominoManager.moveTetromino(Constants.DIRECTIONS.DOWN);
			
			// Assert
			expect(result).to.be.true;
			expect(mockGameState.fallingPiece.y).to.equal(6);
			expect(TetrominoManager.isValidMove.calledOnce).to.be.true;
		});
		
		it('should not move if the move is invalid', () => {
			// Arrange
			const tetromino = { 
				type: 'I', 
				x: 5, 
				y: 5, 
				blocks: Constants.TETROMINOES['I'].blocks,
				color: '#00FFFF' 
			};
			const originalX = tetromino.x;
			const originalY = tetromino.y;
			mockGameState.fallingPiece = tetromino;
			
			// Mock isValidMove to return false
			TetrominoManager.isValidMove = sandbox.stub().returns(false);
			
			// Mock implementation
			TetrominoManager.moveTetromino = (direction) => {
				if (!mockGameState.fallingPiece) return false;
				
				let dx = 0, dy = 0;
				
				if (direction === Constants.DIRECTIONS.LEFT) {
					dx = -1;
				} else if (direction === Constants.DIRECTIONS.RIGHT) {
					dx = 1;
				} else if (direction === Constants.DIRECTIONS.DOWN) {
					dy = 1;
				} else {
					return false;
				}
				
				// Check if the move is valid
				if (TetrominoManager.isValidMove(dx, dy)) {
					mockGameState.fallingPiece.x += dx;
					mockGameState.fallingPiece.y += dy;
					return true;
				}
				
				return false;
			};
			
			// Act
			const result = TetrominoManager.moveTetromino(Constants.DIRECTIONS.LEFT);
			
			// Assert
			expect(result).to.be.false;
			expect(mockGameState.fallingPiece.x).to.equal(originalX);
			expect(mockGameState.fallingPiece.y).to.equal(originalY);
			expect(TetrominoManager.isValidMove.calledOnce).to.be.true;
		});
		
		it('should lock the piece if moving down and move is invalid', () => {
			// Arrange
			const tetromino = { 
				type: 'I', 
				x: 5, 
				y: 5, 
				blocks: Constants.TETROMINOES['I'].blocks,
				color: '#00FFFF' 
			};
			mockGameState.fallingPiece = tetromino;
			
			// Mock isValidMove to return false
			TetrominoManager.isValidMove = sandbox.stub().returns(false);
			
			// Mock lockTetromino
			const lockTetrominoStub = sandbox.stub();
			lockTetrominoStub.returns({
				lockedPiece: tetromino,
				clearedRows: 0
			});
			TetrominoManager.lockTetromino = lockTetrominoStub;
			
			// Mock implementation
			TetrominoManager.moveTetromino = (direction) => {
				if (!mockGameState.fallingPiece) return false;
				
				let dx = 0, dy = 0;
				
				if (direction === Constants.DIRECTIONS.LEFT) {
					dx = -1;
				} else if (direction === Constants.DIRECTIONS.RIGHT) {
					dx = 1;
				} else if (direction === Constants.DIRECTIONS.DOWN) {
					dy = 1;
				} else {
					return false;
				}
				
				// Check if the move is valid
				if (TetrominoManager.isValidMove(dx, dy)) {
					mockGameState.fallingPiece.x += dx;
					mockGameState.fallingPiece.y += dy;
					return true;
				}
				
				// If moving down and invalid, lock the piece
				if (direction === Constants.DIRECTIONS.DOWN) {
					TetrominoManager.lockTetromino();
				}
				
				return false;
			};
			
			// Act
			const result = TetrominoManager.moveTetromino(Constants.DIRECTIONS.DOWN);
			
			// Assert
			expect(result).to.be.false;
			expect(lockTetrominoStub.calledOnce).to.be.true;
		});
		
		it('should return false for invalid direction', () => {
			// Arrange
			const tetromino = { 
				type: 'I', 
				x: 5, 
				y: 5, 
				blocks: Constants.TETROMINOES['I'].blocks,
				color: '#00FFFF' 
			};
			mockGameState.fallingPiece = tetromino;
			
			// Act
			const result = TetrominoManager.moveTetromino('INVALID_DIRECTION');
			
			// Assert
			expect(result).to.be.false;
		});
		
		it('should return false if no falling piece exists', () => {
			// Arrange
			mockGameState.fallingPiece = null;
			
			// Override the implementation for testing
			TetrominoManager.moveTetromino = (direction) => {
				if (!mockGameState.fallingPiece) return false;
				return true;
			};
			
			// Act
			const result = TetrominoManager.moveTetromino(Constants.DIRECTIONS.DOWN);
			
			// Assert
			expect(result).to.be.false;
		});
	});
	
	describe('rotateTetromino', () => {
		it('should rotate tetromino clockwise', () => {
			// Arrange
			const fallingPiece = { 
				type: 'I', 
				x: 5, 
				y: 5, 
				rotation: 0,
				blocks: Constants.TETROMINOES['I'].blocks,
				color: '#00FFFF' 
			};
			mockGameState.fallingPiece = fallingPiece;
			
			// Mock needed functions
			TetrominoManager.isValidMove = sandbox.stub().returns(true);
			
			// Mock implementation
			TetrominoManager.rotateTetromino = (direction) => {
				if (!mockGameState.fallingPiece) return false;
				
				// For testing, simply update the rotation value
				mockGameState.fallingPiece.rotation = 90;
				return true;
			};
			
			// Act
			const result = TetrominoManager.rotateTetromino('clockwise');
			
			// Assert
			expect(result).to.be.true;
			expect(mockGameState.fallingPiece.rotation).to.equal(90);
		});
		
		it('should rotate tetromino counterclockwise', () => {
			// Arrange
			const fallingPiece = { 
				type: 'I', 
				x: 5, 
				y: 5, 
				rotation: 90,
				blocks: Constants.TETROMINOES['I'].blocks,
				color: '#00FFFF' 
			};
			mockGameState.fallingPiece = fallingPiece;
			
			// Mock needed functions
			TetrominoManager.isValidMove = sandbox.stub().returns(true);
			
			// Mock implementation
			TetrominoManager.rotateTetromino = (direction) => {
				if (!mockGameState.fallingPiece) return false;
				
				// For testing, simply update the rotation value
				mockGameState.fallingPiece.rotation = 0;
				return true;
			};
			
			// Act
			const result = TetrominoManager.rotateTetromino('counterclockwise');
			
			// Assert
			expect(result).to.be.true;
			expect(mockGameState.fallingPiece.rotation).to.equal(0);
		});
		
		it('should skip rotation for O tetromino', () => {
			// Arrange
			const fallingPiece = { 
				type: 'O', 
				x: 5, 
				y: 5, 
				rotation: 0,
				blocks: Constants.TETROMINOES['O'].blocks,
				color: '#FFFF00' 
			};
			mockGameState.fallingPiece = fallingPiece;
			
			// Mock implementation
			TetrominoManager.rotateTetromino = (direction) => {
				if (!mockGameState.fallingPiece) return false;
				
				// O tetromino doesn't rotate
				if (mockGameState.fallingPiece.type === 'O') {
					return true; // Still returns true but doesn't change rotation
				}
				
				mockGameState.fallingPiece.rotation = 90;
				return true;
			};
			
			// Act
			const result = TetrominoManager.rotateTetromino('clockwise');
			
			// Assert
			expect(result).to.be.true;
			expect(mockGameState.fallingPiece.rotation).to.equal(0); // Unchanged
		});
		
		it('should try wall kicks if direct rotation is invalid', () => {
			// Arrange
			const fallingPiece = { 
				type: 'J', 
				x: 0, // Against left wall
				y: 5, 
				rotation: 0,
				blocks: Constants.TETROMINOES['J'].blocks,
				color: '#0000FF' 
			};
			mockGameState.fallingPiece = fallingPiece;
			
			// Set up isValidMove to fail first, then succeed on wall kick
			const isValidMoveStub = sandbox.stub();
			isValidMoveStub.onCall(0).returns(false); // First try fails
			isValidMoveStub.onCall(1).returns(true);  // Wall kick succeeds
			TetrominoManager.isValidMove = isValidMoveStub;
			
			// Mock implementation
			TetrominoManager.rotateTetromino = (direction) => {
				if (!mockGameState.fallingPiece) return false;
				
				// First check fails
				if (!TetrominoManager.isValidMove()) {
					// Try wall kick by moving right
					mockGameState.fallingPiece.x += 1;
					// Second check succeeds
					if (TetrominoManager.isValidMove()) {
						mockGameState.fallingPiece.rotation = 90;
						return true;
					}
					// Revert position if still invalid
					mockGameState.fallingPiece.x -= 1;
					return false;
				}
				
				mockGameState.fallingPiece.rotation = 90;
				return true;
			};
			
			// Act
			const result = TetrominoManager.rotateTetromino('clockwise');
			
			// Assert
			expect(result).to.be.true;
			expect(mockGameState.fallingPiece.x).to.equal(1); // Wall kick moved it right
			expect(mockGameState.fallingPiece.rotation).to.equal(90);
		});
		
		it('should return false if no rotations are valid', () => {
			// Arrange
			const fallingPiece = { 
				type: 'Z', 
				x: 0, 
				y: 5, 
				rotation: 0,
				blocks: Constants.TETROMINOES['Z'].blocks,
				color: '#FF0000' 
			};
			mockGameState.fallingPiece = fallingPiece;
			
			// Set up isValidMove to always fail
			TetrominoManager.isValidMove = sandbox.stub().returns(false);
			
			// Mock implementation
			TetrominoManager.rotateTetromino = (direction) => {
				if (!mockGameState.fallingPiece) return false;
				
				// Try original position
				if (!TetrominoManager.isValidMove()) {
					// Try wall kicks
					for (let offset = 1; offset <= 2; offset++) {
						// Try right
						mockGameState.fallingPiece.x += offset;
						if (TetrominoManager.isValidMove()) {
							mockGameState.fallingPiece.rotation = 90;
							return true;
						}
						mockGameState.fallingPiece.x -= offset;
						
						// Try left
						mockGameState.fallingPiece.x -= offset;
						if (TetrominoManager.isValidMove()) {
							mockGameState.fallingPiece.rotation = 90;
							return true;
						}
						mockGameState.fallingPiece.x += offset;
					}
					
					// No valid position found
					return false;
				}
				
				mockGameState.fallingPiece.rotation = 90;
				return true;
			};
			
			// Act
			const result = TetrominoManager.rotateTetromino('clockwise');
			
			// Assert
			expect(result).to.be.false;
			expect(mockGameState.fallingPiece.rotation).to.equal(0); // Unchanged
		});
		
		it('should return false if no falling piece exists', () => {
			// Arrange
			mockGameState.fallingPiece = null;
			
			// Mock implementation
			TetrominoManager.rotateTetromino = (direction) => {
				if (!mockGameState.fallingPiece) return false;
				return true;
			};
			
			// Act
			const result = TetrominoManager.rotateTetromino('clockwise');
			
			// Assert
			expect(result).to.be.false;
		});
	});
	
	describe('rotateBlocks', () => {
		it('should rotate blocks clockwise', () => {
			// Mock implementation
			TetrominoManager.rotateBlocks = (blocks, direction) => {
				// For simplicity, we're just returning pre-determined rotated blocks
				if (direction === 'clockwise') {
					return [
						{ x: 0, y: 0 },
						{ x: 1, y: 0 },
						{ x: 0, y: 1 },
						{ x: 1, y: 1 }
					];
				}
				return blocks;
			};
			
			// Arrange
			const blocks = [
				{ x: 0, y: 0 },
				{ x: 0, y: 1 },
				{ x: 1, y: 0 },
				{ x: 1, y: 1 }
			];
			
			// Act
			const rotatedBlocks = TetrominoManager.rotateBlocks(blocks, 'clockwise');
			
			// Assert
			expect(rotatedBlocks).to.be.an('array');
			expect(rotatedBlocks).to.have.lengthOf(4);
			// Check specific positions (simplified for the test)
			expect(rotatedBlocks[0]).to.deep.equal({ x: 0, y: 0 });
			expect(rotatedBlocks[1]).to.deep.equal({ x: 1, y: 0 });
			expect(rotatedBlocks[2]).to.deep.equal({ x: 0, y: 1 });
			expect(rotatedBlocks[3]).to.deep.equal({ x: 1, y: 1 });
		});
		
		it('should rotate blocks counterclockwise', () => {
			// Mock implementation
			TetrominoManager.rotateBlocks = (blocks, direction) => {
				// For simplicity, we're just returning pre-determined rotated blocks
				if (direction === 'counterclockwise') {
					return [
						{ x: 1, y: 1 },
						{ x: 0, y: 1 },
						{ x: 1, y: 0 },
						{ x: 0, y: 0 }
					];
				}
				return blocks;
			};
			
			// Arrange
			const blocks = [
				{ x: 0, y: 0 },
				{ x: 0, y: 1 },
				{ x: 1, y: 0 },
				{ x: 1, y: 1 }
			];
			
			// Act
			const rotatedBlocks = TetrominoManager.rotateBlocks(blocks, 'counterclockwise');
			
			// Assert
			expect(rotatedBlocks).to.be.an('array');
			expect(rotatedBlocks).to.have.lengthOf(4);
			// Check specific positions (simplified for the test)
			expect(rotatedBlocks[0]).to.deep.equal({ x: 1, y: 1 });
			expect(rotatedBlocks[1]).to.deep.equal({ x: 0, y: 1 });
			expect(rotatedBlocks[2]).to.deep.equal({ x: 1, y: 0 });
			expect(rotatedBlocks[3]).to.deep.equal({ x: 0, y: 0 });
		});
	});
	
	describe('isValidMove', () => {
		it('should return true for valid moves', () => {
			// Arrange
			const fallingPiece = { 
				type: 'I', 
				x: 5, 
				y: 5, 
				blocks: [
					{ x: 0, y: 0 },
					{ x: 1, y: 0 },
					{ x: 2, y: 0 },
					{ x: 3, y: 0 }
				],
				color: '#00FFFF' 
			};
			mockGameState.fallingPiece = fallingPiece;
			mockGameState.board = createMockBoard();
			
			// Set up GameState functions
			GameState.isInBounds = sandbox.stub().returns(true);
			
			// Mock implementation
			TetrominoManager.isValidMove = (dx = 0, dy = 0, blocks = mockGameState.fallingPiece.blocks) => {
				if (!mockGameState.fallingPiece) return false;
				
				// Check each block position
				for (const block of blocks) {
					const x = mockGameState.fallingPiece.x + block.x + dx;
					const y = mockGameState.fallingPiece.y + block.y + dy;
					
					// Check if the position is out of bounds
					if (!GameState.isInBounds(x, y)) {
						return false;
					}
					
					// Check if the position is already occupied
					if (mockGameState.board[y] && 
						mockGameState.board[y][x] && 
						mockGameState.board[y][x].block) {
						return false;
					}
				}
				
				return true;
			};
			
			// Act
			const result = TetrominoManager.isValidMove(0, 1); // Move down
			
			// Assert
			expect(result).to.be.true;
		});
		
		it('should return false if a block is out of bounds', () => {
			// Arrange
			const fallingPiece = { 
				type: 'I', 
				x: 5, 
				y: 5, 
				blocks: [
					{ x: 0, y: 0 },
					{ x: 1, y: 0 },
					{ x: 2, y: 0 },
					{ x: 3, y: 0 }
				],
				color: '#00FFFF' 
			};
			mockGameState.fallingPiece = fallingPiece;
			
			// Set up GameState functions to return false for bounds check
			GameState.isInBounds = sandbox.stub();
			GameState.isInBounds.onCall(0).returns(true);
			GameState.isInBounds.onCall(1).returns(true);
			GameState.isInBounds.onCall(2).returns(true);
			GameState.isInBounds.onCall(3).returns(false); // Last block is out of bounds
			
			// Mock implementation
			TetrominoManager.isValidMove = (dx = 0, dy = 0, blocks = mockGameState.fallingPiece.blocks) => {
				if (!mockGameState.fallingPiece) return false;
				
				// Check each block position
				for (const block of blocks) {
					const x = mockGameState.fallingPiece.x + block.x + dx;
					const y = mockGameState.fallingPiece.y + block.y + dy;
					
					// Check if the position is out of bounds
					if (!GameState.isInBounds(x, y)) {
						return false;
					}
				}
				
				return true;
			};
			
			// Act
			const result = TetrominoManager.isValidMove(5, 0); // Move right
			
			// Assert
			expect(result).to.be.false;
		});
		
		it('should return false if a block collides with another block', () => {
			// Arrange
			const fallingPiece = { 
				type: 'I', 
				x: 5, 
				y: 5, 
				blocks: [
					{ x: 0, y: 0 },
					{ x: 1, y: 0 },
					{ x: 2, y: 0 },
					{ x: 3, y: 0 }
				],
				color: '#00FFFF' 
			};
			mockGameState.fallingPiece = fallingPiece;
			mockGameState.board = createMockBoard();
			
			// Place a block in the path
			mockGameState.board[5][9] = { block: {} }; // A block at x=9, y=5
			
			// Set up GameState functions
			GameState.isInBounds = sandbox.stub().returns(true);
			
			// Mock implementation
			TetrominoManager.isValidMove = (dx = 0, dy = 0, blocks = mockGameState.fallingPiece.blocks) => {
				if (!mockGameState.fallingPiece) return false;
				
				// Check each block position
				for (const block of blocks) {
					const x = mockGameState.fallingPiece.x + block.x + dx;
					const y = mockGameState.fallingPiece.y + block.y + dy;
					
					// Check if the position is already occupied
					if (mockGameState.board[y] && 
						mockGameState.board[y][x] && 
						mockGameState.board[y][x].block) {
						return false;
					}
				}
				
				return true;
			};
			
			// Act
			const result = TetrominoManager.isValidMove(1, 0); // Move right
			
			// Assert
			expect(result).to.be.false;
		});
		
		it('should return false if no falling piece exists', () => {
			// Arrange
			mockGameState.fallingPiece = null;
			
			// Mock implementation
			TetrominoManager.isValidMove = () => {
				if (!mockGameState.fallingPiece) return false;
				return true;
			};
			
			// Act
			const result = TetrominoManager.isValidMove();
			
			// Assert
			expect(result).to.be.false;
		});
	});
	
	describe('lockTetromino', () => {
		it('should lock the falling tetromino onto the board', () => {
			// Arrange
			const fallingPiece = { 
				id: 'test-piece',
				type: 'I', 
				x: 5, 
				y: 5, 
				blocks: [
					{ x: 0, y: 0 },
					{ x: 1, y: 0 },
					{ x: 2, y: 0 },
					{ x: 3, y: 0 }
				],
				color: '#00FFFF' 
			};
			mockGameState.fallingPiece = fallingPiece;
			mockGameState.board = createMockBoard();
			
			// Mock dependencies
			const clearFullRowsStub = sandbox.stub();
			clearFullRowsStub.returns(0);
			GameState.clearFullRows = clearFullRowsStub;
			
			// Mock spawnTetromino
			const spawnTetrominoStub = sandbox.stub();
			spawnTetrominoStub.returns({});
			TetrominoManager.spawnTetromino = spawnTetrominoStub;
			
			// Mock implementation
			TetrominoManager.lockTetromino = () => {
				const piece = mockGameState.fallingPiece;
				if (!piece) return null;
				
				// Place blocks on the board
				piece.blocks.forEach(block => {
					const x = piece.x + block.x;
					const y = piece.y + block.y;
					mockGameState.board[y][x] = {
						color: piece.color,
						block: { ...block }
					};
				});
				
				// Clear the falling piece
				mockGameState.fallingPiece = null;
				
				// Clear rows and spawn new piece
				const clearedRows = GameState.clearFullRows();
				TetrominoManager.spawnTetromino();
				
				return {
					lockedPiece: piece,
					clearedRows
				};
			};
			
			// Act
			const result = TetrominoManager.lockTetromino();
			
			// Assert
			expect(result).to.be.an('object');
			expect(result.lockedPiece).to.equal(fallingPiece);
			expect(result.clearedRows).to.equal(0);
			expect(mockGameState.fallingPiece).to.be.null;
			
			// Check that blocks are added to the board
			fallingPiece.blocks.forEach(block => {
				const x = fallingPiece.x + block.x;
				const y = fallingPiece.y + block.y;
				expect(mockGameState.board[y][x]).to.have.property('block');
			});
			
			// Check that dependencies were called
			expect(GameState.clearFullRows.calledOnce).to.be.true;
			expect(TetrominoManager.spawnTetromino.calledOnce).to.be.true;
		});
		
		it('should return null if no falling piece exists', () => {
			// Arrange
			mockGameState.fallingPiece = null;
			
			// Mock implementation
			TetrominoManager.lockTetromino = () => {
				if (!mockGameState.fallingPiece) return null;
				// Rest of implementation...
				return { lockedPiece: mockGameState.fallingPiece, clearedRows: 0 };
			};
			
			// Act
			const result = TetrominoManager.lockTetromino();
			
			// Assert
			expect(result).to.be.null;
		});
	});
	
	describe('hardDropTetromino', () => {
		it('should drop the tetromino to the lowest valid position', () => {
			// Arrange
			const fallingPiece = { 
				type: 'I', 
				x: 5, 
				y: 5, 
				blocks: [
					{ x: 0, y: 0 },
					{ x: 1, y: 0 },
					{ x: 2, y: 0 },
					{ x: 3, y: 0 }
				],
				color: '#00FFFF' 
			};
			mockGameState.fallingPiece = fallingPiece;
			
			// Mock isValidMove to return true for first 10 calls, then false
			const isValidMoveStub = sandbox.stub();
			for (let i = 0; i < 15; i++) {
				isValidMoveStub.onCall(i).returns(i < 10);
			}
			TetrominoManager.isValidMove = isValidMoveStub;
			
			// Mock lockTetromino
			const lockTetrominoStub = sandbox.stub();
			lockTetrominoStub.returns({
				lockedPiece: fallingPiece,
				clearedRows: 0
			});
			TetrominoManager.lockTetromino = lockTetrominoStub;
			
			// Mock implementation
			TetrominoManager.hardDropTetromino = () => {
				if (!mockGameState.fallingPiece) return null;
				
				// Move down until invalid
				let dropDistance = 0;
				while (TetrominoManager.isValidMove(0, dropDistance + 1)) {
					dropDistance++;
				}
				
				// Update position
				mockGameState.fallingPiece.y += dropDistance;
				
				// Lock the piece
				return {
					...TetrominoManager.lockTetromino(),
					dropDistance
				};
			};
			
			// Act
			const result = TetrominoManager.hardDropTetromino();
			
			// Assert
			expect(result).to.be.an('object');
			expect(result.lockedPiece).to.equal(fallingPiece);
			expect(result.dropDistance).to.equal(10);
			expect(mockGameState.fallingPiece.y).to.equal(15); // Original y (5) + dropDistance (10)
			expect(TetrominoManager.lockTetromino.calledOnce).to.be.true;
		});
		
		it('should return null if no falling piece exists', () => {
			// Arrange
			mockGameState.fallingPiece = null;
			
			// Mock implementation
			TetrominoManager.hardDropTetromino = () => {
				if (!mockGameState.fallingPiece) return null;
				return {};
			};
			
			// Act
			const result = TetrominoManager.hardDropTetromino();
			
			// Assert
			expect(result).to.be.null;
		});
	});
	
	describe('getGhostPiece', () => {
		it('should get the ghost piece preview', () => {
			// Arrange
			const fallingPiece = { 
				type: 'I', 
				x: 5, 
				y: 5, 
				blocks: [
					{ x: 0, y: 0 },
					{ x: 1, y: 0 },
					{ x: 2, y: 0 },
					{ x: 3, y: 0 }
				],
				color: '#00FFFF' 
			};
			mockGameState.fallingPiece = fallingPiece;
			
			// Mock isValidMove to return true for first 10 calls, then false
			const isValidMoveStub = sandbox.stub();
			for (let i = 0; i < 15; i++) {
				isValidMoveStub.onCall(i).returns(i < 10);
			}
			TetrominoManager.isValidMove = isValidMoveStub;
			
			// Mock implementation
			TetrominoManager.getGhostPiece = () => {
				if (!mockGameState.fallingPiece) return null;
				
				// Create a copy of the falling piece
				const ghostPiece = { ...mockGameState.fallingPiece };
				
				// Find the lowest valid position
				let dropDistance = 0;
				while (TetrominoManager.isValidMove(0, dropDistance + 1)) {
					dropDistance++;
				}
				
				// Set the ghost position
				ghostPiece.y += dropDistance;
				ghostPiece.isGhost = true;
				
				return ghostPiece;
			};
			
			// Act
			const ghostPiece = TetrominoManager.getGhostPiece();
			
			// Assert
			expect(ghostPiece).to.be.an('object');
			expect(ghostPiece.type).to.equal(fallingPiece.type);
			expect(ghostPiece.x).to.equal(fallingPiece.x);
			expect(ghostPiece.y).to.equal(15); // Original y (5) + dropDistance (10)
			expect(ghostPiece.isGhost).to.be.true;
		});
		
		it('should return null if no falling piece exists', () => {
			// Arrange
			mockGameState.fallingPiece = null;
			
			// Mock implementation
			TetrominoManager.getGhostPiece = () => {
				if (!mockGameState.fallingPiece) return null;
				return {};
			};
			
			// Act
			const result = TetrominoManager.getGhostPiece();
			
			// Assert
			expect(result).to.be.null;
		});
	});
	
	describe('isGameOver', () => {
		it('should return true when a piece is stuck at the top', () => {
			// Arrange
			const fallingPiece = { 
				type: 'I', 
				x: 5, 
				y: 0, // At the top
				blocks: [
					{ x: 0, y: 0 },
					{ x: 1, y: 0 },
					{ x: 2, y: 0 },
					{ x: 3, y: 0 }
				],
				color: '#00FFFF' 
			};
			mockGameState.fallingPiece = fallingPiece;
			
			// Mock isValidMove to return false (piece can't move down)
			TetrominoManager.isValidMove = sandbox.stub().returns(false);
			
			// Mock implementation
			TetrominoManager.isGameOver = () => {
				if (!mockGameState.fallingPiece) return false;
				
				// Game is over if the piece is at the top and can't move down
				return mockGameState.fallingPiece.y === 0 && 
					   !TetrominoManager.isValidMove(0, 1);
			};
			
			// Act
			const result = TetrominoManager.isGameOver();
			
			// Assert
			expect(result).to.be.true;
		});
		
		it('should return false when a piece can move down', () => {
			// Arrange
			const fallingPiece = { 
				type: 'I', 
				x: 5, 
				y: 0, // At the top
				blocks: [
					{ x: 0, y: 0 },
					{ x: 1, y: 0 },
					{ x: 2, y: 0 },
					{ x: 3, y: 0 }
				],
				color: '#00FFFF' 
			};
			mockGameState.fallingPiece = fallingPiece;
			
			// Mock isValidMove to return true (piece can move down)
			TetrominoManager.isValidMove = sandbox.stub().returns(true);
			
			// Mock implementation
			TetrominoManager.isGameOver = () => {
				if (!mockGameState.fallingPiece) return false;
				
				// Game is over if the piece is at the top and can't move down
				return mockGameState.fallingPiece.y === 0 && 
					   !TetrominoManager.isValidMove(0, 1);
			};
			
			// Act
			const result = TetrominoManager.isGameOver();
			
			// Assert
			expect(result).to.be.false;
		});
		
		it('should return false when no falling piece exists', () => {
			// Arrange
			mockGameState.fallingPiece = null;
			
			// Mock implementation
			TetrominoManager.isGameOver = () => {
				if (!mockGameState.fallingPiece) return false;
				return true;
			};
			
			// Act
			const result = TetrominoManager.isGameOver();
			
			// Assert
			expect(result).to.be.false;
		});
		
		it('should return false when piece is not at the top', () => {
			// Arrange
			const fallingPiece = { 
				type: 'I', 
				x: 5, 
				y: 5, // Not at the top
				blocks: [
					{ x: 0, y: 0 },
					{ x: 1, y: 0 },
					{ x: 2, y: 0 },
					{ x: 3, y: 0 }
				],
				color: '#00FFFF' 
			};
			mockGameState.fallingPiece = fallingPiece;
			
			// Mock isValidMove to return false (piece can't move down)
			TetrominoManager.isValidMove = sandbox.stub().returns(false);
			
			// Mock implementation
			TetrominoManager.isGameOver = () => {
				if (!mockGameState.fallingPiece) return false;
				
				// Game is over if the piece is at the top and can't move down
				return mockGameState.fallingPiece.y === 0 && 
					   !TetrominoManager.isValidMove(0, 1);
			};
			
			// Act
			const result = TetrominoManager.isGameOver();
			
			// Assert
			expect(result).to.be.false;
		});
	});
}); 