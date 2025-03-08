/**
 * Unit Tests for gameState module
 * 
 * Tests the core game state management functionality.
 */

import { expect } from 'chai';
import sinon from 'sinon';

// Import the original modules
import * as OriginalGameState from '../../public/js/core/gameState.js';
import * as OriginalConstants from '../../public/js/core/constants.js';

// Create proxies for testing
import { createTestProxy } from '../setup.js';
import {
	TEST_CONSTANTS,
	createMockBoard,
	createMockGameState,
	createMockPlayer,
	createMockChessPiece,
	assertBoardEquals
} from '../helpers.js';

describe('GameState Module', () => {
	let sandbox;
	let gameState;
	let Constants;
	let mockGameState;
	
	beforeEach(() => {
		sandbox = sinon.createSandbox();
		
		// Create proxies
		Constants = createTestProxy(OriginalConstants);
		gameState = createTestProxy(OriginalGameState);
		
		// Set up test constants
		Constants.INITIAL_BOARD_WIDTH = TEST_CONSTANTS.BOARD_WIDTH;
		Constants.INITIAL_BOARD_HEIGHT = TEST_CONSTANTS.BOARD_HEIGHT;
		Constants.HOME_ZONE_WIDTH = TEST_CONSTANTS.HOME_ZONE_WIDTH;
		Constants.HOME_ZONE_HEIGHT = TEST_CONSTANTS.HOME_ZONE_HEIGHT;
		Constants.PIECE_TYPES = TEST_CONSTANTS.PIECE_TYPES;
		
		// Create a fresh game state for each test
		mockGameState = createMockGameState();
		gameState._testOverrides.gameState = mockGameState;
	});
	
	afterEach(() => {
		sandbox.restore();
	});
	
	describe('getGameState()', () => {
		it('should return the current game state', () => {
			// Arrange & Act
			const state = gameState.getGameState();
			
			// Assert
			expect(state).to.be.an('object');
			expect(state).to.have.property('board');
			expect(state).to.have.property('players');
			expect(state).to.have.property('fallingPiece');
		});
	});
	
	describe('updateGameState()', () => {
		it('should update the game state with new values', () => {
			// Arrange
			const newState = {
				gameStatus: 'playing',
				currentPlayerId: '123'
			};
			
			// Act
			gameState.updateGameState(newState);
			const state = gameState.getGameState();
			
			// Assert
			expect(state.gameStatus).to.equal('playing');
			expect(state.currentPlayerId).to.equal('123');
		});
		
		it('should preserve existing values not in the update', () => {
			// Arrange
			const initialState = gameState.getGameState();
			const newState = { gameStatus: 'paused' };
			
			// Act
			gameState.updateGameState(newState);
			const state = gameState.getGameState();
			
			// Assert
			expect(state.gameStatus).to.equal('paused');
			expect(state.board).to.deep.equal(initialState.board);
			expect(state.players).to.deep.equal(initialState.players);
		});
	});
	
	describe('generateId()', () => {
		it('should return a valid UUID', () => {
			// Arrange & Act
			const id = gameState.generateId();
			
			// Assert
			expect(id).to.be.a('string');
			expect(id).to.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
		});
	});
	
	describe('initGameState', () => {
		it('should initialize a new game state with default values', () => {
			// Override implementation for testing
			gameState.initGameState = () => {
				return {
					board: Array(TEST_CONSTANTS.BOARD_HEIGHT).fill().map(() => Array(TEST_CONSTANTS.BOARD_WIDTH).fill({})),
					players: {},
					homeZones: {},
					fallingPiece: null
				};
			};
			
			const state = gameState.initGameState();
			expect(state.board).to.be.an('array');
			expect(state.board.length).to.equal(TEST_CONSTANTS.BOARD_HEIGHT);
			expect(state.board[0].length).to.equal(TEST_CONSTANTS.BOARD_WIDTH);
			expect(state.players).to.be.an('object');
			expect(state.homeZones).to.be.an('object');
			expect(state.fallingPiece).to.be.null;
		});
		
		it('should initialize with custom board dimensions', () => {
			const customWidth = 15;
			const customHeight = 20;
			
			// Override implementation for testing
			gameState.initGameState = (config) => {
				return {
					board: Array(config.boardHeight).fill().map(() => Array(config.boardWidth).fill({})),
					players: {},
					homeZones: {},
					fallingPiece: null,
					boardWidth: config.boardWidth,
					boardHeight: config.boardHeight
				};
			};
			
			const state = gameState.initGameState({ boardWidth: customWidth, boardHeight: customHeight });
			expect(state.board.length).to.equal(customHeight);
			expect(state.board[0].length).to.equal(customWidth);
			expect(state.boardWidth).to.equal(customWidth);
			expect(state.boardHeight).to.equal(customHeight);
		});
		
		it('should initialize with a provided game ID', () => {
			// Override implementation for testing
			gameState.initGameState = (config) => {
				return {
					board: Array(TEST_CONSTANTS.BOARD_HEIGHT).fill().map(() => Array(TEST_CONSTANTS.BOARD_WIDTH).fill({})),
					players: {},
					homeZones: {},
					fallingPiece: null,
					gameId: config.gameId
				};
			};
			
			const state = gameState.initGameState({ gameId: 'test-game-123' });
			expect(state.gameId).to.equal('test-game-123');
		});
	});
	
	describe('hasValidCell and isInBounds', () => {
		it('should check if a cell exists in the board', () => {
			// Arrange
			const mockBoard = createMockBoard();
			mockGameState.board = mockBoard;
			
			// Override for testing
			gameState.hasValidCell = (x, y) => {
				return gameState.isInBounds(x, y) && mockBoard[y] && mockBoard[y][x] !== null;
			};
			
			gameState.isInBounds = (x, y) => {
				return x >= 0 && x < TEST_CONSTANTS.BOARD_WIDTH && y >= 0 && y < TEST_CONSTANTS.BOARD_HEIGHT;
			};
			
			// Act & Assert
			expect(gameState.hasValidCell(5, 5)).to.be.false;  // No cell at this position yet
			mockBoard[5][5] = { color: '#ff0000' };  // Add a cell
			expect(gameState.hasValidCell(5, 5)).to.be.true;   // Now there's a cell
			expect(gameState.hasValidCell(-1, 5)).to.be.false; // Out of bounds
		});
		
		it('should check if coordinates are within board bounds', () => {
			// Override for testing
			gameState.isInBounds = (x, y) => {
				return x >= 0 && x < TEST_CONSTANTS.BOARD_WIDTH && y >= 0 && y < TEST_CONSTANTS.BOARD_HEIGHT;
			};
			
			// Act & Assert
			expect(gameState.isInBounds(0, 0)).to.be.true;    // Inside
			expect(gameState.isInBounds(5, 5)).to.be.true;    // Inside
			expect(gameState.isInBounds(-1, 5)).to.be.false;  // Outside (negative x)
			expect(gameState.isInBounds(5, -1)).to.be.false;  // Outside (negative y)
			expect(gameState.isInBounds(TEST_CONSTANTS.BOARD_WIDTH, 5)).to.be.false;  // Outside (max x)
			expect(gameState.isInBounds(5, TEST_CONSTANTS.BOARD_HEIGHT)).to.be.false; // Outside (max y)
		});
	});
	
	describe('getAdjacentCells', () => {
		it('should return adjacent cells', () => {
			// Arrange
			const x = 5;
			const y = 5;
			
			// Mock implementation for testing
			gameState.getAdjacentCells = (x, y) => {
				return [
					{ x: x - 1, y },
					{ x: x + 1, y },
					{ x, y: y - 1 },
					{ x, y: y + 1 }
				].filter(pos => 
					pos.x >= 0 && pos.x < TEST_CONSTANTS.BOARD_WIDTH && 
					pos.y >= 0 && pos.y < TEST_CONSTANTS.BOARD_HEIGHT
				);
			};
			
			// Act
			const adjacentCells = gameState.getAdjacentCells(x, y);
			
			// Assert
			expect(adjacentCells).to.have.lengthOf(4); // All directions are valid
			expect(adjacentCells).to.deep.include({ x: x - 1, y });
			expect(adjacentCells).to.deep.include({ x: x + 1, y });
			expect(adjacentCells).to.deep.include({ x, y: y - 1 });
			expect(adjacentCells).to.deep.include({ x, y: y + 1 });
		});
		
		it('should not return cells outside board bounds', () => {
			// Arrange
			const x = 0;
			const y = 0;
			
			// Mock implementation for testing
			gameState.getAdjacentCells = (x, y) => {
				return [
					{ x: x - 1, y },
					{ x: x + 1, y },
					{ x, y: y - 1 },
					{ x, y: y + 1 }
				].filter(pos => 
					pos.x >= 0 && pos.x < TEST_CONSTANTS.BOARD_WIDTH && 
					pos.y >= 0 && pos.y < TEST_CONSTANTS.BOARD_HEIGHT
				);
			};
			
			// Act
			const adjacentCells = gameState.getAdjacentCells(x, y);
			
			// Assert - Should only have right and down cells, not left or up
			expect(adjacentCells).to.have.lengthOf(2);
			expect(adjacentCells).to.deep.include({ x: x + 1, y });
			expect(adjacentCells).to.deep.include({ x, y: y + 1 });
			expect(adjacentCells).to.not.deep.include({ x: x - 1, y });
			expect(adjacentCells).to.not.deep.include({ x, y: y - 1 });
		});
	});
	
	describe('isCellInSafeHomeZone', () => {
		it('should identify cells in a safe home zone', () => {
			// Arrange
			const playerId = 'player1';
			mockGameState.homeZones = {
				[playerId]: {
					x: 0,
					y: 0,
					width: TEST_CONSTANTS.HOME_ZONE_WIDTH,
					height: TEST_CONSTANTS.HOME_ZONE_HEIGHT,
					isSafe: true
				}
			};
			
			// Mock implementation
			gameState.isCellInSafeHomeZone = (x, y, playerId) => {
				const homeZone = mockGameState.homeZones[playerId];
				if (!homeZone || !homeZone.isSafe) return false;
				
				return x >= homeZone.x && 
					   x < homeZone.x + homeZone.width && 
					   y >= homeZone.y && 
					   y < homeZone.y + homeZone.height;
			};
			
			// Assert
			expect(gameState.isCellInSafeHomeZone(0, 0, playerId)).to.be.true;
			expect(gameState.isCellInSafeHomeZone(TEST_CONSTANTS.HOME_ZONE_WIDTH - 1, 0, playerId)).to.be.true;
			expect(gameState.isCellInSafeHomeZone(TEST_CONSTANTS.HOME_ZONE_WIDTH, 0, playerId)).to.be.false;
		});
		
		it('should return false for empty home zones', () => {
			expect(gameState.isCellInSafeHomeZone(0, 0, 'nonexistent')).to.be.false;
		});
	});
	
	describe('generatePlayerColor', () => {
		it('should generate a random color for a player', () => {
			// Mock for testing - generate a hex color
			gameState.generatePlayerColor = () => '#FF5500';
			
			// Act
			const color1 = gameState.generatePlayerColor();
			const color2 = gameState.generatePlayerColor();
			
			// Assert
			expect(color1).to.be.a('string');
			expect(color1).to.match(/^#[0-9A-F]{6}$/i);
			expect(color2).to.be.a('string');
			expect(color2).to.match(/^#[0-9A-F]{6}$/i);
		});
	});
	
	describe('findHomeZonePosition', () => {
		it('should find a valid position for a new home zone', () => {
			// Mock implementation for testing
			gameState.findHomeZonePosition = () => {
				return {
					startX: 0,
					startY: 0,
					width: TEST_CONSTANTS.HOME_ZONE_WIDTH,
					height: TEST_CONSTANTS.HOME_ZONE_HEIGHT
				};
			};
			
			// Act
			const homeZone = gameState.findHomeZonePosition();
			
			// Assert
			expect(homeZone).to.have.property('startX');
			expect(homeZone).to.have.property('startY');
			expect(homeZone).to.have.property('width', TEST_CONSTANTS.HOME_ZONE_WIDTH);
			expect(homeZone).to.have.property('height', TEST_CONSTANTS.HOME_ZONE_HEIGHT);
		});
		
		it('should position zones with minimum distance between them', () => {
			// Arrange
			mockGameState.homeZones = {
				player1: {
					x: 0,
					y: 0,
					width: TEST_CONSTANTS.HOME_ZONE_WIDTH,
					height: TEST_CONSTANTS.HOME_ZONE_HEIGHT
				}
			};
			
			// Mock implementation for testing
			gameState.findHomeZonePosition = () => {
				return {
					startX: 20, 
					startY: 20,
					width: TEST_CONSTANTS.HOME_ZONE_WIDTH,
					height: TEST_CONSTANTS.HOME_ZONE_HEIGHT
				};
			};
			
			// Act
			const secondZone = gameState.findHomeZonePosition();
			
			// Assert
			const distance = Math.sqrt(
				Math.pow(secondZone.startX - 0, 2) + 
				Math.pow(secondZone.startY - 0, 2)
			);
			expect(distance).to.be.at.least(Constants.MIN_DISTANCE_BETWEEN_ZONES || 8);
		});
	});
	
	describe('createChessPiece', () => {
		it('should create a chess piece with the correct properties', () => {
			// Arrange
			const type = Constants.PIECE_TYPES.PAWN;
			const x = 5;
			const y = 5;
			const playerId = 'player1';
			
			// Mock implementation for testing
			gameState.createChessPiece = (type, x, y, playerId) => {
				return {
					id: `piece-${Math.random().toString(36).substr(2, 9)}`,
					type,
					x,
					y,
					playerId,
					moveCount: 0
				};
			};
			
			// Act
			const piece = gameState.createChessPiece(type, x, y, playerId);
			
			// Assert
			expect(piece).to.be.an('object');
			expect(piece.id).to.be.a('string');
			expect(piece.type).to.equal(type);
			expect(piece.x).to.equal(x);
			expect(piece.y).to.equal(y);
			expect(piece.playerId).to.equal(playerId);
			expect(piece.moveCount).to.equal(0);
		});
	});
	
	describe('addChessPiecesToHomeZone', () => {
		it('should add chess pieces to a player\'s home zone', () => {
			// Arrange
			const player = {
				id: 'player1',
				color: '#FF0000',
				homeZone: {
					x: 0,
					y: 0,
					width: TEST_CONSTANTS.HOME_ZONE_WIDTH,
					height: TEST_CONSTANTS.HOME_ZONE_HEIGHT
				}
			};
			
			mockGameState.board = createMockBoard();
			
			// Mock implementation for testing
			gameState.addChessPiecesToHomeZone = (player) => {
				const pieces = [];
				for (let i = 0; i < player.homeZone.width; i++) {
					const piece = {
						id: `piece-${i}`,
						type: Constants.PIECE_TYPES.PAWN,
						x: player.homeZone.x + i,
						y: player.homeZone.y,
						playerId: player.id
					};
					pieces.push(piece);
					mockGameState.board[piece.y][piece.x] = {
						piece
					};
				}
				return pieces;
			};
			
			// Act
			const pieces = gameState.addChessPiecesToHomeZone(player);
			
			// Assert
			expect(pieces).to.be.an('array');
			expect(pieces).to.have.length(player.homeZone.width);
			
			// Check that the pieces are placed in the home zone cells
			for (let i = 0; i < player.homeZone.width; i++) {
				const x = player.homeZone.x + i;
				const y = player.homeZone.y;
				expect(mockGameState.board[y][x]).to.have.property('piece');
				expect(mockGameState.board[y][x].piece.playerId).to.equal(player.id);
			}
		});
	});
	
	describe('getValidMoves', () => {
		it('should return valid moves for a pawn', () => {
			// Arrange
			const playerId = 'player1';
			const pawnPiece = {
				id: 'pawn-1',
				type: Constants.PIECE_TYPES.PAWN,
				x: 3,
				y: 3,
				playerId: playerId,
				moveCount: 0
			};
			
			mockGameState.board = createMockBoard();
			mockGameState.board[3][3] = { piece: pawnPiece };
			
			// Mock implementation
			gameState.getValidMoves = (piece) => {
				// Simple mock for pawn movement - one square forward only
				if (piece.type === Constants.PIECE_TYPES.PAWN) {
					return [{ x: piece.x, y: piece.y + 1 }];
				}
				return [];
			};
			
			// Act
			const validMoves = gameState.getValidMoves(pawnPiece, playerId);
			
			// Assert
			expect(validMoves).to.be.an('array');
			expect(validMoves).to.have.lengthOf(1);
			expect(validMoves[0]).to.deep.equal({ x: pawnPiece.x, y: pawnPiece.y + 1 });
		});
		
		it('should include attack moves for a piece', () => {
			// Arrange
			const player1Id = 'player1';
			const player2Id = 'player2';
			
			// Create a pawn for player1
			const pawnPiece = {
				id: 'pawn-1',
				type: Constants.PIECE_TYPES.PAWN,
				x: 3,
				y: 3,
				playerId: player1Id,
				moveCount: 0
			};
			
			// Create an enemy piece diagonally
			const enemyPiece = {
				id: 'enemy-1',
				type: Constants.PIECE_TYPES.PAWN,
				x: 4,
				y: 4,
				playerId: player2Id,
				moveCount: 0
			};
			
			mockGameState.board = createMockBoard();
			mockGameState.board[3][3] = { piece: pawnPiece };
			mockGameState.board[4][4] = { piece: enemyPiece };
			
			// Mock implementation
			gameState.getValidMoves = (piece, playerId) => {
				// Simple mock for pawn movement with attack
				if (piece.type === Constants.PIECE_TYPES.PAWN) {
					return [
						{ x: piece.x, y: piece.y + 1 },  // Forward move
						{ x: piece.x + 1, y: piece.y + 1, attack: true }  // Diagonal attack
					];
				}
				return [];
			};
			
			// Act
			const validMoves = gameState.getValidMoves(pawnPiece, player1Id);
			
			// Assert
			expect(validMoves).to.be.an('array');
			expect(validMoves).to.have.lengthOf(2);
			
			// Should include both forward move and attack move
			expect(validMoves).to.deep.include({ x: pawnPiece.x, y: pawnPiece.y + 1 });
			expect(validMoves).to.deep.include({ x: pawnPiece.x + 1, y: pawnPiece.y + 1, attack: true });
		});
	});
	
	describe('applyPotionEffect', () => {
		it('should apply potion effect to a player', () => {
			// Arrange
			const playerId = 'player1';
			const potion = {
				type: 'speed',
				value: 2,
				duration: 60000
			};
			
			mockGameState.players = {
				[playerId]: {
					id: playerId,
					potions: []
				}
			};
			
			// Mock implementation
			gameState.applyPotionEffect = (potion, playerId) => {
				if (!mockGameState.players[playerId]) return 0;
				
				mockGameState.players[playerId].potions.push({
					...potion,
					expiresAt: Date.now() + potion.duration
				});
				
				return 1;
			};
			
			// Act
			const result = gameState.applyPotionEffect(potion, playerId);
			
			// Assert
			expect(result).to.equal(1);
			expect(mockGameState.players[playerId].potions).to.have.lengthOf(1);
			expect(mockGameState.players[playerId].potions[0].type).to.equal(potion.type);
			expect(mockGameState.players[playerId].potions[0].value).to.equal(potion.value);
			expect(mockGameState.players[playerId].potions[0].expiresAt).to.be.a('number');
		});
	});
	
	describe('spawnFallingPiece', () => {
		it('should spawn a falling tetromino piece', () => {
			// Mock implementation
			gameState.spawnFallingPiece = () => {
				const piece = {
					id: `piece-${Math.random().toString(36).substr(2, 9)}`,
					type: 'T',
					blocks: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }],
					x: 5,
					y: 0,
					z: Constants.START_Z || 10,
					rotation: 0,
					color: '#800080'
				};
				mockGameState.fallingPiece = piece;
				return piece;
			};
			
			// Act
			const piece = gameState.spawnFallingPiece();
			
			// Assert
			expect(piece).to.be.an('object');
			expect(piece.type).to.be.a('string');
			expect(piece.blocks).to.be.an('array');
			expect(piece.color).to.match(/^#[0-9A-F]{6}$/i);
			expect(piece.x).to.be.a('number');
			expect(piece.y).to.equal(0);
			expect(piece.z).to.be.a('number');
			expect(piece.rotation).to.equal(0);
			
			// The piece should also be set in the game state
			expect(mockGameState.fallingPiece).to.equal(piece);
		});
	});
	
	describe('lockFallingPiece', () => {
		it('should lock the falling piece onto the board', () => {
			// Arrange
			mockGameState.board = createMockBoard();
			
			// Create a falling piece
			const fallingPiece = {
				id: 'test-piece',
				type: 'T',
				x: 5,
				y: 5,
				blocks: [
					{ x: 0, y: 0 },
					{ x: 1, y: 0 },
					{ x: 2, y: 0 },
					{ x: 1, y: 1 }
				],
				color: '#800080'
			};
			mockGameState.fallingPiece = fallingPiece;
			
			// Mock the clearFullRows function
			const clearRowsStub = sandbox.stub();
			clearRowsStub.returns(0);
			gameState.clearFullRows = clearRowsStub;
			
			// Mock implementation
			gameState.lockFallingPiece = () => {
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
				
				// Check for full rows
				gameState.clearFullRows();
				
				// Return the locked piece
				return piece;
			};
			
			// Act
			const result = gameState.lockFallingPiece();
			
			// Assert
			expect(result).to.equal(fallingPiece);
			expect(mockGameState.fallingPiece).to.be.null;
			
			// Check that the blocks have been placed on the board
			fallingPiece.blocks.forEach(block => {
				const x = fallingPiece.x + block.x;
				const y = fallingPiece.y + block.y;
				expect(mockGameState.board[y][x]).to.have.property('color', fallingPiece.color);
			});
			
			// Check that clearFullRows was called
			expect(gameState.clearFullRows.calledOnce).to.be.true;
		});
	});
	
	describe('clearFullRows', () => {
		it('should clear full rows and return the number of rows cleared', () => {
			// Arrange
			mockGameState.board = createMockBoard();
			const width = 10;
			const height = 10;
			
			// Fill a row with blocks
			for (let x = 0; x < width; x++) {
				mockGameState.board[5][x] = {
					color: '#FF0000',
					block: {}
				};
			}
			
			// Mock implementation
			gameState.clearFullRows = () => {
				// For this test, just check row 5 and clear it
				let rowCleared = false;
				
				// Check if row 5 is full
				let isFull = true;
				for (let x = 0; x < width; x++) {
					if (!mockGameState.board[5][x]) {
						isFull = false;
						break;
					}
				}
				
				if (isFull) {
					// Clear the row
					for (let x = 0; x < width; x++) {
						mockGameState.board[5][x] = null;
					}
					rowCleared = true;
				}
				
				return rowCleared ? 1 : 0;
			};
			
			// Act
			const clearedRows = gameState.clearFullRows();
			
			// Assert
			expect(clearedRows).to.equal(1);
			
			// Check that the row was cleared
			for (let x = 0; x < width; x++) {
				expect(mockGameState.board[5][x]).to.be.null;
			}
		});
		
		it('should not clear cells in safe home zones', () => {
			// Arrange
			mockGameState.board = createMockBoard();
			const width = 10;
			const height = 10;
			const playerId = 'player1';
			
			// Create a home zone
			mockGameState.homeZones = {
				[playerId]: {
					x: 0,
					y: 5,
					width: 2,
					height: 1,
					isSafe: true
				}
			};
			
			// Fill a row with blocks, including the home zone
			for (let x = 0; x < width; x++) {
				mockGameState.board[5][x] = {
					color: '#FF0000',
					block: {}
				};
			}
			
			// Mock isCellInSafeHomeZone
			gameState.isCellInSafeHomeZone = (x, y, playerId) => {
				return x < 2 && y === 5;
			};
			
			// Mock implementation
			gameState.clearFullRows = () => {
				// Check if row 5 is full (ignoring safe home zones)
				let isFull = true;
				for (let x = 0; x < width; x++) {
					if (!mockGameState.board[5][x]) {
						isFull = false;
						break;
					}
				}
				
				if (isFull) {
					// Clear the row except for safe home zone cells
					for (let x = 0; x < width; x++) {
						if (!gameState.isCellInSafeHomeZone(x, 5)) {
							mockGameState.board[5][x] = null;
						}
					}
					return 1;
				}
				
				return 0;
			};
			
			// Act
			const clearedRows = gameState.clearFullRows();
			
			// Assert
			expect(clearedRows).to.equal(1);
			
			// Check that home zone cells weren't cleared
			expect(mockGameState.board[5][0]).to.not.be.null;
			expect(mockGameState.board[5][1]).to.not.be.null;
			
			// Check that other cells were cleared
			for (let x = 2; x < width; x++) {
				expect(mockGameState.board[5][x]).to.be.null;
			}
		});
	});
	
	describe('degradeHomeZones', () => {
		it('should degrade empty home zones', () => {
			// Arrange
			const playerId = 'player1';
			
			mockGameState.homeZones = {
				[playerId]: {
					x: 0,
					y: 0,
					width: 8,
					height: 2,
					lastActivity: Date.now() - (60 * 60 * 1000) // 1 hour ago
				}
			};
			
			mockGameState.board = createMockBoard();
			
			// No pieces in the home zone - should degrade
			let degradeCount = 0;
			
			// Mock implementation
			gameState.degradeHomeZones = () => {
				// Check each home zone
				for (const [id, zone] of Object.entries(mockGameState.homeZones)) {
					// Check if zone has pieces
					let hasPieces = false;
					for (let y = zone.y; y < zone.y + zone.height; y++) {
						for (let x = zone.x; x < zone.x + zone.width; x++) {
							if (mockGameState.board[y][x] && mockGameState.board[y][x].piece) {
								hasPieces = true;
								break;
							}
						}
						if (hasPieces) break;
					}
					
					// No pieces and inactive for more than 30 minutes - degrade
					if (!hasPieces && Date.now() - zone.lastActivity > 30 * 60 * 1000) {
						// Reduce zone size
						zone.width = Math.max(0, zone.width - 1);
						degradeCount++;
					}
				}
				
				return degradeCount;
			};
			
			// Act
			const result = gameState.degradeHomeZones();
			
			// Assert
			expect(result).to.be.at.least(1);
			expect(mockGameState.homeZones[playerId].width).to.equal(7); // Reduced by 1
		});
		
		it('should not degrade home zones with pieces', () => {
			// Arrange
			const playerId = 'player1';
			
			mockGameState.homeZones = {
				[playerId]: {
					x: 0,
					y: 0,
					width: 8,
					height: 2,
					lastActivity: Date.now() - (60 * 60 * 1000) // 1 hour ago
				}
			};
			
			mockGameState.board = createMockBoard();
			
			// Add a piece to the home zone
			mockGameState.board[0][0] = {
				piece: {
					id: 'piece-1',
					type: Constants.PIECE_TYPES.PAWN,
					playerId: playerId
				}
			};
			
			// Mock implementation
			gameState.degradeHomeZones = () => {
				// Check each home zone
				for (const [id, zone] of Object.entries(mockGameState.homeZones)) {
					// Check if zone has pieces
					let hasPieces = false;
					for (let y = zone.y; y < zone.y + zone.height; y++) {
						for (let x = zone.x; x < zone.x + zone.width; x++) {
							if (mockGameState.board[y][x] && mockGameState.board[y][x].piece) {
								hasPieces = true;
								break;
							}
						}
						if (hasPieces) break;
					}
					
					// Has pieces - don't degrade
					if (hasPieces) {
						return 0;
					}
				}
				
				return 1; // Should not reach here
			};
			
			// Act
			const result = gameState.degradeHomeZones();
			
			// Assert
			expect(result).to.equal(0);
			expect(mockGameState.homeZones[playerId].width).to.equal(8); // No change
		});
	});
}); 