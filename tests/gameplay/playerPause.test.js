/**
 * Tests for player pause functionality
 */

import { expect } from 'chai';
import * as sinon from 'sinon';
import { createTestProxy } from '../setup.js';
import {
	handlePlayerPause,
	handlePlayerResume,
	isPlayerPaused,
	isPlayerOnPauseCooldown,
	getPauseCooldownRemaining,
	setPauseCooldown,
	createMockGameState,
	createMockIO
} from '../testUtils.js';

describe('Player Pause Functionality', () => {
	let mockGameState;
	let serverProxy;
	let sandbox;
	let ioMock;
	let clockMock;
	let mockPlayers;
	let mockPausedPlayers;
	let mockPlayerPauseCooldowns;
	let originalDate;
	
	beforeEach(() => {
		sandbox = sinon.createSandbox();
		
		// Use fake timers
		clockMock = sinon.useFakeTimers(new Date('2023-01-01T12:00:00Z'));
		
		// Create a mock game state
		mockGameState = createMockGameState();
		
		// Set up mocks for IO
		ioMock = createMockIO(sandbox);
		
		// Initialize mock data
		mockPlayers = mockGameState.players;
		mockGameState.pausedPlayers = new Map();
		mockGameState.PAUSE_MAX_DURATION = 300000; // 5 minutes in ms
	});
	
	afterEach(() => {
		sandbox.restore();
		if (clockMock) {
			clockMock.restore();
		}
	});
	
	describe('handlePlayerPause()', () => {
		it('should pause a player who is not on cooldown', () => {
			// Act
			const result = handlePlayerPause('player1');
			
			// Assert
			expect(result).to.be.true;
			expect(mockPlayers[0].isPaused).to.be.true;
		});
		
		it('should not pause a player who is already on cooldown', () => {
			// Already on cooldown (player3)
			const result = handlePlayerPause('player3');
			
			// Assert
			expect(result).to.be.false;
			expect(mockPlayers[2].isPaused).to.be.false;
		});
	});
	
	describe('handlePlayerResume()', () => {
		it('should resume a paused player', () => {
			// Arrange
			mockPlayers[0].isPaused = true;
			
			// Act
			const result = handlePlayerResume('player1');
			
			// Assert
			expect(result).to.be.true;
			expect(mockPlayers[0].isPaused).to.be.false;
		});
		
		it('should not affect a player who is not paused', () => {
			// Act
			const result = handlePlayerResume('player2');
			
			// Assert
			expect(result).to.be.false;
			expect(mockPlayers[1].isPaused).to.be.false;
		});
	});
	
	describe('isPlayerPaused()', () => {
		it('should return true for a paused player', () => {
			// Arrange
			mockPlayers[0].isPaused = true;
			
			// Act
			const result = isPlayerPaused('player1');
			
			// Assert
			expect(result).to.be.true;
		});
		
		it('should return false for a non-paused player', () => {
			// Act
			const result = isPlayerPaused('player2');
			
			// Assert
			expect(result).to.be.false;
		});
		
		it('should return false for a non-existent player', () => {
			// Act
			const result = isPlayerPaused('nonexistent');
			
			// Assert
			expect(result).to.be.false;
		});
	});
	
	describe('isPlayerOnPauseCooldown()', () => {
		it('should return true for a player on cooldown', () => {
			// Act
			const result = isPlayerOnPauseCooldown('player3');
			
			// Assert
			expect(result).to.be.true;
		});
		
		it('should return false for a player not on cooldown', () => {
			// Act
			const result = isPlayerOnPauseCooldown('player1');
			
			// Assert
			expect(result).to.be.false;
		});
	});
	
	describe('getPauseCooldownRemaining()', () => {
		it('should return remaining cooldown time', () => {
			// Act
			const result = getPauseCooldownRemaining('player3');
			
			// Assert
			expect(result).to.be.approximately(60000, 100); // Approximately 60 seconds
		});
		
		it('should return 0 for a player not on cooldown', () => {
			// Act
			const result = getPauseCooldownRemaining('player1');
			
			// Assert
			expect(result).to.equal(0);
		});
	});
	
	describe('setPauseCooldown()', () => {
		it('should set cooldown for a player', () => {
			// Act
			setPauseCooldown('player1', 120000);
			
			// Assert
			expect(isPlayerOnPauseCooldown('player1')).to.be.true;
			expect(getPauseCooldownRemaining('player1')).to.be.approximately(120000, 100);
		});
	});
}); 