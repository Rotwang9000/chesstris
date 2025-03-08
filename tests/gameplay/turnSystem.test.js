/**
 * Tests for the asynchronous turn system and cooldowns
 */

import { expect } from 'chai';
import sinon from 'sinon';

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
	
	// Stubs
	let moveChessPieceStub;
	let lockFallingPieceStub;
	let getPlayerColorStub;
	let ioEmitStub;
	
	let clock;
	
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
		
		// Create a sinon fake timer
		clock = sinon.useFakeTimers(Date.now());
		
		// Create stubs
		moveChessPieceStub = sinon.stub().returns(true);
		lockFallingPieceStub = sinon.spy();
		getPlayerColorStub = sinon.stub().returns('#FF0000');
		ioEmitStub = sinon.spy();
		
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
		// Restore the sinon fake timer
		clock.restore();
		
		// Reset all stubs and spies
		sinon.restore();
	});
	
	describe('isPlayerOnCooldown', () => {
		it('should return false if player has no turn history', () => {
			const result = isPlayerOnCooldown('player1');
			expect(result).to.be.false;
		});
		
		it('should return true if player is on cooldown', () => {
			// Set up player turn history
			playerTurns.player1 = {
				lastMoveTime: Date.now(),
				pieceDropped: false,
				chessMoved: true
			};
			
			const result = isPlayerOnCooldown('player1');
			expect(result).to.be.true;
		});
		
		it('should return false if player cooldown has expired', () => {
			// Set up player turn history
			playerTurns.player1 = {
				lastMoveTime: Date.now() - 4000, // 4 seconds ago
				pieceDropped: false,
				chessMoved: true
			};
			
			const result = isPlayerOnCooldown('player1');
			expect(result).to.be.false;
		});
		
		it('should respect the current game difficulty cooldown time', () => {
			// Test with hard difficulty (1000ms)
			gameDifficulty = 'hard';
			
			// Set up player turn history with a move 1100ms ago
			playerTurns.player1 = {
				lastMoveTime: Date.now() - 1100,
				pieceDropped: false,
				chessMoved: true
			};
			
			// With hard difficulty (1000ms), player should not be on cooldown after 1100ms
			const result = isPlayerOnCooldown('player1');
			expect(result).to.be.false;
		});
	});
	
	describe('setPlayerCooldown', () => {
		it('should create player turn data if it does not exist', () => {
			const now = Date.now();
			setPlayerCooldown('player1');
			
			expect(playerTurns.player1).to.exist;
			expect(playerTurns.player1.lastMoveTime).to.be.closeTo(now, 10);
			expect(playerTurns.player1.pieceDropped).to.be.false;
			expect(playerTurns.player1.chessMoved).to.be.true;
		});
		
		it('should update existing player turn data', () => {
			// Set up initial player turn data
			playerTurns.player1 = {
				lastMoveTime: Date.now() - 5000,
				pieceDropped: true,
				chessMoved: false
			};
			
			const now = Date.now();
			setPlayerCooldown('player1');
			
			expect(playerTurns.player1.lastMoveTime).to.be.closeTo(now, 10);
			expect(playerTurns.player1.chessMoved).to.be.true;
			// pieceDropped should remain unchanged
			expect(playerTurns.player1.pieceDropped).to.be.true;
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
			
			expect(result).to.be.false;
			expect(moveChessPieceStub.called).to.be.false;
		});
		
		it('should allow move and set cooldown if player is not on cooldown', () => {
			const moveData = { fromX: 0, fromY: 0, toX: 1, toY: 1 };
			const result = handlePlayerMove('player1', moveData);
			
			expect(result).to.be.true;
			expect(moveChessPieceStub.calledOnce).to.be.true;
			expect(moveChessPieceStub.calledWith(
				'player1', moveData.fromX, moveData.fromY, moveData.toX, moveData.toY
			)).to.be.true;
			
			// Check that cooldown was set
			expect(playerTurns.player1).to.exist;
			expect(playerTurns.player1.lastMoveTime).to.be.closeTo(Date.now(), 10);
			expect(playerTurns.player1.chessMoved).to.be.true;
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
			
			expect(result).to.be.false;
			expect(lockFallingPieceStub.called).to.be.false;
		});
		
		it('should allow piece placement and set cooldown if player is not on cooldown', () => {
			const pieceData = { blocks: [[0, 0], [1, 0], [0, 1], [1, 1]] };
			const result = handlePiecePlacement('player1', pieceData);
			
			expect(result).to.be.true;
			expect(lockFallingPieceStub.calledOnce).to.be.true;
			
			// Check that falling piece was set
			expect(fallingPiece).to.deep.equal({
				blocks: pieceData.blocks,
				color: '#FF0000',
				playerId: 'player1'
			});
			
			// Check that cooldown was set
			expect(playerTurns.player1).to.exist;
			expect(playerTurns.player1.lastMoveTime).to.be.closeTo(Date.now(), 10);
			expect(playerTurns.player1.pieceDropped).to.be.true;
		});
	});
	
	describe('getCooldownRemaining', () => {
		it('should return 0 if player has no turn history', () => {
			const result = getCooldownRemaining('player1');
			expect(result).to.equal(0);
		});
		
		it('should return correct remaining cooldown time', () => {
			// Set up player turn history
			playerTurns.player1 = {
				lastMoveTime: Date.now() - 1000, // 1 second ago
				pieceDropped: false,
				chessMoved: true
			};
			
			// With normal difficulty (3000ms), there should be 2000ms remaining
			const result = getCooldownRemaining('player1');
			expect(result).to.be.closeTo(2000, 10);
		});
		
		it('should return 0 if cooldown has expired', () => {
			// Set up player turn history
			playerTurns.player1 = {
				lastMoveTime: Date.now() - 4000, // 4 seconds ago
				pieceDropped: false,
				chessMoved: true
			};
			
			const result = getCooldownRemaining('player1');
			expect(result).to.equal(0);
		});
	});
	
	describe('setGameDifficulty', () => {
		it('should update game difficulty', () => {
			setGameDifficulty('easy');
			expect(gameDifficulty).to.equal('easy');
			expect(ioEmitStub.calledWith('difficultyChanged', { difficulty: 'easy' })).to.be.true;
			
			setGameDifficulty('hard');
			expect(gameDifficulty).to.equal('hard');
			expect(ioEmitStub.calledWith('difficultyChanged', { difficulty: 'hard' })).to.be.true;
		});
		
		it('should not update game difficulty for invalid settings', () => {
			gameDifficulty = 'normal';
			
			// Remove 'ultra-hard' from valid difficulty levels for this test
			const originalDifficulties = { ...DIFFICULTY_LEVELS };
			delete DIFFICULTY_LEVELS['ultra-hard'];
			
			setGameDifficulty('ultra-hard');
			expect(gameDifficulty).to.equal('normal');
			
			setGameDifficulty('invalid');
			expect(gameDifficulty).to.equal('normal');
			
			// Restore original difficulty levels
			DIFFICULTY_LEVELS = originalDifficulties;
		});
	});
}); 