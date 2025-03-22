/**
 * Tests for the asynchronous turn system and cooldowns
 */

// Import Jest's expect
const { expect } = require('@jest/globals');

describe('Turn System and Cooldowns', () => {
	// Mock game state
	let playerTurns;
	let gameDifficulty;
	let fallingPiece;
	let DIFFICULTY_LEVELS;
	let TURN_COOLDOWN;
	
	// Mock functions
	let isPlayerOnCooldown;
	let setPlayerCooldown;
	let handlePlayerMove;
	let handlePiecePlacement;
	let getCooldownRemaining;
	let setGameDifficulty;
	
	// Stubs/mocks
	let moveChessPieceStub;
	let lockFallingPieceStub;
	let getPlayerColorStub;
	let ioEmitStub;
	
	// Use a variable to store the current mock time
	let mockTime;
	
	beforeEach(() => {
		// Reset the mock game state
		playerTurns = {};
		gameDifficulty = 'normal';
		fallingPiece = null;
		
		DIFFICULTY_LEVELS = {
			easy: 5000,
			normal: 3000,
			hard: 1000,
			'ultra-hard': 500
		};
		TURN_COOLDOWN = 3000;
		
		// Setup Jest fake timers
		jest.useFakeTimers();
		mockTime = Date.now();
		// Mock Date.now to use our controlled time
		jest.spyOn(Date, 'now').mockImplementation(() => mockTime);
		
		// Create Jest mocks
		moveChessPieceStub = jest.fn().mockReturnValue(true);
		lockFallingPieceStub = jest.fn();
		getPlayerColorStub = jest.fn().mockReturnValue('#FF0000');
		ioEmitStub = jest.fn();
		
		// Implement the functions we're testing
		isPlayerOnCooldown = (playerId) => {
			if (!playerTurns[playerId]) {
				return false;
			}
			
			const now = Date.now();
			const cooldownTime = DIFFICULTY_LEVELS[gameDifficulty] || TURN_COOLDOWN;
			const timeSinceLastMove = now - playerTurns[playerId].lastMoveTime;
			
			return timeSinceLastMove < cooldownTime;
		};
		
		setPlayerCooldown = (playerId) => {
			if (!playerTurns[playerId]) {
				playerTurns[playerId] = {
					lastMoveTime: Date.now(),
					pieceDropped: false,
					chessMoved: true
				};
			} else {
				playerTurns[playerId].lastMoveTime = Date.now();
				playerTurns[playerId].chessMoved = true;
			}
		};
		
		handlePlayerMove = (playerId, moveData) => {
			// Check if the player is on cooldown
			if (isPlayerOnCooldown(playerId)) {
				return false;
			}
			
			// Attempt to move the piece
			const success = moveChessPieceStub(
				playerId,
				moveData.fromX,
				moveData.fromY,
				moveData.toX,
				moveData.toY
			);
			
			// If the move was successful, set the player's cooldown
			if (success) {
				setPlayerCooldown(playerId);
			}
			
			return success;
		};
		
		handlePiecePlacement = (playerId, pieceData) => {
			// Check if the player is on cooldown
			if (isPlayerOnCooldown(playerId)) {
				return false;
			}
			
			// Set the falling piece according to player's data
			fallingPiece = {
				blocks: pieceData.blocks,
				color: getPlayerColorStub(playerId),
				playerId: playerId
			};
			
			// Attempt to lock the piece
			lockFallingPieceStub();
			
			// Set the player's cooldown and mark that they've placed a piece
			if (!playerTurns[playerId]) {
				playerTurns[playerId] = {
					lastMoveTime: Date.now(),
					pieceDropped: true,
					chessMoved: false
				};
			} else {
				playerTurns[playerId].lastMoveTime = Date.now();
				playerTurns[playerId].pieceDropped = true;
			}
			
			return true;
		};
		
		getCooldownRemaining = (playerId) => {
			if (!playerTurns[playerId]) {
				return 0;
			}
			
			const now = Date.now();
			const cooldownTime = DIFFICULTY_LEVELS[gameDifficulty] || TURN_COOLDOWN;
			const timeSinceLastMove = now - playerTurns[playerId].lastMoveTime;
			
			if (timeSinceLastMove >= cooldownTime) {
				return 0;
			}
			
			return cooldownTime - timeSinceLastMove;
		};
		
		setGameDifficulty = (difficulty) => {
			if (DIFFICULTY_LEVELS[difficulty]) {
				gameDifficulty = difficulty;
				ioEmitStub('difficultyChanged', { difficulty });
			}
		};
	});
	
	afterEach(() => {
		// Restore the Jest fake timers
		jest.useRealTimers();
		
		// Reset all mocks
		jest.clearAllMocks();
	});
	
	describe('isPlayerOnCooldown', () => {
		it('should return false if player has no turn history', () => {
			const result = isPlayerOnCooldown('player1');
			expect(result).toBe(false);
		});
		
		it('should return true if player is on cooldown', () => {
			// Set up player turn history
			playerTurns.player1 = {
				lastMoveTime: Date.now(),
				pieceDropped: false,
				chessMoved: true
			};
			
			const result = isPlayerOnCooldown('player1');
			expect(result).toBe(true);
		});
		
		it('should return false if player cooldown has expired', () => {
			// Set up player turn history
			playerTurns.player1 = {
				lastMoveTime: Date.now(),
				pieceDropped: false,
				chessMoved: true
			};
			
			// Advance time by 4 seconds (more than the cooldown)
			mockTime += 4000;
			
			const result = isPlayerOnCooldown('player1');
			expect(result).toBe(false);
		});
		
		it('should respect the current game difficulty cooldown time', () => {
			// Test with hard difficulty (1000ms)
			gameDifficulty = 'hard';
			
			// Set up player turn history
			playerTurns.player1 = {
				lastMoveTime: Date.now(),
				pieceDropped: false,
				chessMoved: true
			};
			
			// Advance time by 1100ms (more than hard difficulty cooldown)
			mockTime += 1100;
			
			// With hard difficulty (1000ms), player should not be on cooldown after 1100ms
			const result = isPlayerOnCooldown('player1');
			expect(result).toBe(false);
		});
	});
	
	describe('setPlayerCooldown', () => {
		it('should create player turn data if it does not exist', () => {
			const now = Date.now();
			setPlayerCooldown('player1');
			
			expect(playerTurns.player1).toBeDefined();
			expect(playerTurns.player1.lastMoveTime).toBeCloseTo(now, -2); // Within 100ms
			expect(playerTurns.player1.pieceDropped).toBe(false);
			expect(playerTurns.player1.chessMoved).toBe(true);
		});
		
		it('should update existing player turn data', () => {
			// Set up initial player turn data
			const initialTime = Date.now();
			playerTurns.player1 = {
				lastMoveTime: initialTime - 5000,
				pieceDropped: true,
				chessMoved: false
			};
			
			setPlayerCooldown('player1');
			
			expect(playerTurns.player1.lastMoveTime).toBeCloseTo(initialTime, -2); // Within 100ms
			expect(playerTurns.player1.chessMoved).toBe(true);
			// pieceDropped should remain unchanged
			expect(playerTurns.player1.pieceDropped).toBe(true);
		});
	});
	
	describe('handlePlayerMove', () => {
		it('should reject move if player is on cooldown', () => {
			// Set up player on cooldown
			playerTurns.player1 = {
				lastMoveTime: Date.now(),
				pieceDropped: false,
				chessMoved: true
			};
			
			const moveData = { fromX: 0, fromY: 0, toX: 1, toY: 1 };
			const result = handlePlayerMove('player1', moveData);
			
			expect(result).toBe(false);
			expect(moveChessPieceStub).not.toHaveBeenCalled();
		});
		
		it('should allow move and set cooldown if player is not on cooldown', () => {
			const moveData = { fromX: 0, fromY: 0, toX: 1, toY: 1 };
			const result = handlePlayerMove('player1', moveData);
			
			expect(result).toBe(true);
			expect(moveChessPieceStub).toHaveBeenCalledTimes(1);
			expect(moveChessPieceStub).toHaveBeenCalledWith(
				'player1', moveData.fromX, moveData.fromY, moveData.toX, moveData.toY
			);
			
			// Check that cooldown was set
			expect(playerTurns.player1).toBeDefined();
			expect(playerTurns.player1.lastMoveTime).toBeCloseTo(Date.now(), -2);
			expect(playerTurns.player1.chessMoved).toBe(true);
		});
	});
	
	describe('handlePiecePlacement', () => {
		it('should reject piece placement if player is on cooldown', () => {
			// Set up player on cooldown
			playerTurns.player1 = {
				lastMoveTime: Date.now(),
				pieceDropped: false,
				chessMoved: true
			};
			
			const pieceData = { blocks: [[0, 0], [1, 0], [0, 1], [1, 1]] };
			const result = handlePiecePlacement('player1', pieceData);
			
			expect(result).toBe(false);
			expect(lockFallingPieceStub).not.toHaveBeenCalled();
		});
		
		it('should allow piece placement and set cooldown if player is not on cooldown', () => {
			const pieceData = { blocks: [[0, 0], [1, 0], [0, 1], [1, 1]] };
			const result = handlePiecePlacement('player1', pieceData);
			
			expect(result).toBe(true);
			expect(lockFallingPieceStub).toHaveBeenCalledTimes(1);
			
			// Check that falling piece was set
			expect(fallingPiece).toEqual({
				blocks: pieceData.blocks,
				color: '#FF0000',
				playerId: 'player1'
			});
			
			// Check that cooldown was set
			expect(playerTurns.player1).toBeDefined();
			expect(playerTurns.player1.lastMoveTime).toBeCloseTo(Date.now(), -2);
			expect(playerTurns.player1.pieceDropped).toBe(true);
		});
	});
	
	describe('getCooldownRemaining', () => {
		it('should return 0 if player has no turn history', () => {
			const result = getCooldownRemaining('player1');
			expect(result).toBe(0);
		});
		
		it('should return correct remaining cooldown time', () => {
			// Set up player turn history
			playerTurns.player1 = {
				lastMoveTime: Date.now(),
				pieceDropped: false,
				chessMoved: true
			};
			
			// Advance time by 1 second
			mockTime += 1000;
			
			// With normal difficulty (3000ms), there should be 2000ms remaining
			const result = getCooldownRemaining('player1');
			expect(result).toBeCloseTo(2000, -1);
		});
		
		it('should return 0 if cooldown has expired', () => {
			// Set up player turn history
			playerTurns.player1 = {
				lastMoveTime: Date.now(),
				pieceDropped: false,
				chessMoved: true
			};
			
			// Advance time by 4 seconds (more than the cooldown)
			mockTime += 4000;
			
			const result = getCooldownRemaining('player1');
			expect(result).toBe(0);
		});
	});
	
	describe('setGameDifficulty', () => {
		it('should update game difficulty', () => {
			setGameDifficulty('easy');
			expect(gameDifficulty).toBe('easy');
			expect(ioEmitStub).toHaveBeenCalledWith('difficultyChanged', { difficulty: 'easy' });
			
			setGameDifficulty('hard');
			expect(gameDifficulty).toBe('hard');
			expect(ioEmitStub).toHaveBeenCalledWith('difficultyChanged', { difficulty: 'hard' });
		});
		
		it('should not update game difficulty for invalid settings', () => {
			gameDifficulty = 'normal';
			
			// Remove 'ultra-hard' from valid difficulty levels for this test
			const originalDifficulties = { ...DIFFICULTY_LEVELS };
			delete DIFFICULTY_LEVELS['ultra-hard'];
			
			setGameDifficulty('ultra-hard');
			expect(gameDifficulty).toBe('normal');
			
			setGameDifficulty('invalid');
			expect(gameDifficulty).toBe('normal');
			
			// Restore original difficulty levels
			DIFFICULTY_LEVELS = originalDifficulties;
		});
	});
});