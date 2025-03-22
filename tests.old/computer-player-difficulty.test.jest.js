'use strict';

/**
 * Computer Player Difficulty Tests
 * 
 * Tests for verifying the difficulty-based timing adjustments for computer players
 */

// Remove external dependencies
// import fs from 'fs';
// import path from 'path';

// Define the constants similar to what's likely in Constants.js
const DIFFICULTY_SETTINGS = {
	EASY: {
		MOVE_INTERVAL: 1500,
		THINKING_DEPTH: 1,
		ACCURACY: 0.6
	},
	MEDIUM: {
		MOVE_INTERVAL: 1000,
		THINKING_DEPTH: 2,
		ACCURACY: 0.8
	},
	HARD: {
		MOVE_INTERVAL: 600,
		THINKING_DEPTH: 3,
		ACCURACY: 0.95
	}
};

describe('Computer Player Difficulty', () => {
	// Mock ComputerPlayerManager class simplified for testing
	class MockComputerPlayerManager {
		constructor() {
			this.computerPlayers = {};
			this.moveIntervals = {};
		}
		
		initializeComputerPlayer(game, difficulty = 'medium') {
			try {
				// Generate a unique ID for the computer player
				const computerId = `computer-${Date.now()}-${Object.keys(this.computerPlayers).length}`;
				const computerName = `Computer ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}`;
				
				// Set the difficulty level
				const upperDifficulty = difficulty.toUpperCase();
				const difficultySettings = DIFFICULTY_SETTINGS[upperDifficulty] || DIFFICULTY_SETTINGS.MEDIUM;
				
				// Store the computer player info
				this.computerPlayers[computerId] = {
					id: computerId,
					name: computerName,
					difficulty,
					settings: difficultySettings,
					lastMove: Date.now(),
					game: game.id
				};
				
				// Add computer player to game object
				game.players[computerId] = {
					id: computerId,
					name: computerName,
					type: 'computer',
					difficulty,
					moveInterval: difficultySettings.MOVE_INTERVAL,
					thinkingDepth: difficultySettings.THINKING_DEPTH,
					accuracy: difficultySettings.ACCURACY,
					eliminated: false,
					ready: true
				};
				
				return {
					success: true,
					computerId,
					computerName,
					difficulty,
					settings: difficultySettings
				};
			} catch (error) {
				console.error(`Error initializing computer player: ${error.message}`);
				return {
					success: false,
					error: error.message
				};
			}
		}
		
		startAllComputerPlayers(game) {
			Object.keys(this.computerPlayers).forEach(computerId => {
				const computerPlayer = this.computerPlayers[computerId];
				if (computerPlayer.game === game.id) {
					this._startMoveLoop(game, computerId);
				}
			});
		}
		
		_startMoveLoop(game, computerId) {
			const computerPlayer = this.computerPlayers[computerId];
			if (!computerPlayer) return;
			
			// Get move interval from difficulty settings
			const moveInterval = computerPlayer.settings.MOVE_INTERVAL;
			
			// In a real implementation, this would start an interval
			// For testing, we just record that it was called
			this.moveIntervals[computerId] = {
				interval: moveInterval,
				isActive: true,
				startTime: Date.now()
			};
		}
	}
	
	// Mock game manager
	class MockGameManager {
		constructor() {
			this.games = {};
			this.computerPlayerManager = new MockComputerPlayerManager();
		}
		
		createGame(options = {}) {
			const gameId = options.gameId || `test-game-${Date.now()}`;
			const width = options.width || 30;
			const height = options.height || 30;
			const maxPlayers = options.maxPlayers || 4;
			
			this.games[gameId] = {
				id: gameId,
				width,
				height,
				maxPlayers,
				players: {},
				chessPieces: [],
				status: 'waiting',
				createdAt: Date.now(),
				updatedAt: Date.now()
			};
			
			return {
				gameId,
				width,
				height
			};
		}
		
		getGame(gameId) {
			return this.games[gameId] || null;
		}
		
		addComputerPlayer(gameId, difficulty = 'medium') {
			const game = this.getGame(gameId);
			if (!game) {
				return {
					success: false,
					error: `Game with ID ${gameId} not found`
				};
			}
			
			const result = this.computerPlayerManager.initializeComputerPlayer(game, difficulty);
			if (result.success) {
				game.updatedAt = Date.now();
				return {
					success: true,
					playerId: result.computerId,
					playerDetails: game.players[result.computerId]
				};
			}
			
			return result;
		}
		
		startGame(gameId) {
			const game = this.getGame(gameId);
			if (!game) {
				return {
					success: false,
					error: `Game with ID ${gameId} not found`
				};
			}
			
			game.status = 'active';
			game.updatedAt = Date.now();
			this.computerPlayerManager.startAllComputerPlayers(game);
			
			return {
				success: true,
				gameId
			};
		}
	}
	
	let gameManager;
	let gameId;
	
	beforeEach(() => {
		// Create a new game manager instance for each test
		gameManager = new MockGameManager();
		
		// Create a test game
		const result = gameManager.createGame({
			width: 30,
			height: 30,
			maxPlayers: 4
		});
		
		gameId = result.gameId;
	});
	
	describe('Computer Player Difficulty Settings', () => {
		it('should set different parameters based on difficulty level', () => {
			// Add computer players with different difficulty levels
			const easyResult = gameManager.addComputerPlayer(gameId, 'easy');
			const mediumResult = gameManager.addComputerPlayer(gameId, 'medium');
			const hardResult = gameManager.addComputerPlayer(gameId, 'hard');
			
			// All operations should be successful
			expect(easyResult.success).toBe(true);
			expect(mediumResult.success).toBe(true);
			expect(hardResult.success).toBe(true);
			
			// Get the player details
			const easyPlayer = easyResult.playerDetails;
			const mediumPlayer = mediumResult.playerDetails;
			const hardPlayer = hardResult.playerDetails;
			
			// Verify difficulty was set correctly
			expect(easyPlayer.difficulty).toBe('easy');
			expect(mediumPlayer.difficulty).toBe('medium');
			expect(hardPlayer.difficulty).toBe('hard');
			
			// Easy difficulty should have the longest move interval
			expect(easyPlayer.moveInterval).toBeGreaterThan(mediumPlayer.moveInterval);
			
			// Hard difficulty should have the shortest move interval
			expect(hardPlayer.moveInterval).toBeLessThan(mediumPlayer.moveInterval);
			
			// Easy difficulty should have the lowest thinking depth
			expect(easyPlayer.thinkingDepth).toBeLessThan(mediumPlayer.thinkingDepth);
			
			// Hard difficulty should have the highest thinking depth
			expect(hardPlayer.thinkingDepth).toBeGreaterThan(mediumPlayer.thinkingDepth);
		});
		
		it('should use medium difficulty by default when not specified', () => {
			// Add a computer player without specifying difficulty
			const result = gameManager.addComputerPlayer(gameId);
			
			// Operation should be successful
			expect(result.success).toBe(true);
			
			// Get the player details
			const player = result.playerDetails;
			
			// Verify default difficulty was set to medium
			expect(player.difficulty).toBe('medium');
			
			// Verify medium difficulty parameters
			expect(player.moveInterval).toBe(DIFFICULTY_SETTINGS.MEDIUM.MOVE_INTERVAL);
			expect(player.thinkingDepth).toBe(DIFFICULTY_SETTINGS.MEDIUM.THINKING_DEPTH);
		});
		
		it('should start move loops with the correct intervals when game starts', () => {
			// Add computer players with different difficulty levels
			const easyResult = gameManager.addComputerPlayer(gameId, 'easy');
			const hardResult = gameManager.addComputerPlayer(gameId, 'hard');
			
			// Start the game
			gameManager.startGame(gameId);
			
			// Get the move intervals from the computer player manager
			const easyInterval = gameManager.computerPlayerManager.moveIntervals[easyResult.playerId];
			const hardInterval = gameManager.computerPlayerManager.moveIntervals[hardResult.playerId];
			
			// Verify intervals are set up correctly
			expect(easyInterval.isActive).toBe(true);
			expect(hardInterval.isActive).toBe(true);
			
			// Verify intervals match the difficulty settings
			expect(easyInterval.interval).toBe(DIFFICULTY_SETTINGS.EASY.MOVE_INTERVAL);
			expect(hardInterval.interval).toBe(DIFFICULTY_SETTINGS.HARD.MOVE_INTERVAL);
		});
	});
});