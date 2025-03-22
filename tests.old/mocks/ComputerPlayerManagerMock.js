/**
 * Standard mock for ComputerPlayerManager
 * This can be imported in tests that need to mock the ComputerPlayerManager
 * Use: import ComputerPlayerManagerMock from '../mocks/ComputerPlayerManagerMock';
 */

class ComputerPlayerManagerMock {
	constructor() {
		this.computerPlayers = {};
		this.moveIntervals = {};
		
		// Default difficulty settings that match the real implementation
		this.DIFFICULTY_SETTINGS = {
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
	}
	
	// Core methods for computer player management
	initializeComputerPlayer(game, difficulty = 'medium') {
		try {
			// Check if the game can accept more players
			const playerCount = Object.values(game.players).filter(p => !p.isObserver).length;
			if (playerCount >= game.maxPlayers) {
				throw new Error(`Game has reached maximum player limit of ${game.maxPlayers}`);
			}
			
			// Generate a unique ID for the computer player
			const computerId = `computer-${Date.now()}-${Object.keys(this.computerPlayers).length}`;
			const computerName = `Computer ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}`;
			
			// Set the difficulty level
			const upperDifficulty = difficulty.toUpperCase();
			const difficultySettings = this.DIFFICULTY_SETTINGS[upperDifficulty] || this.DIFFICULTY_SETTINGS.MEDIUM;
			
			// Store the computer player info
			this.computerPlayers[computerId] = {
				id: computerId,
				name: computerName,
				difficulty,
				settings: difficultySettings,
				lastMove: Date.now(),
				game: game.id
			};
			
			return {
				success: true,
				computerId,
				computerName,
				difficulty,
				settings: difficultySettings
			};
		} catch (error) {
			return {
				success: false,
				error: error.message
			};
		}
	}
	
	removeComputerPlayer(game, computerId) {
		try {
			// Check if the computer player exists
			if (!this.computerPlayers[computerId]) {
				return {
					success: false,
					error: 'Computer player not found'
				};
			}
			
			// Stop the move loop
			this._stopMoveLoop(computerId);
			
			// Remove from our tracking
			delete this.computerPlayers[computerId];
			
			return {
				success: true,
				computerId
			};
		} catch (error) {
			return {
				success: false,
				error: error.message
			};
		}
	}
	
	startAllComputerPlayers(game) {
		if (!game) return;
		
		// Start move loops for all computer players in this game
		Object.keys(this.computerPlayers).forEach(computerId => {
			const computerPlayer = this.computerPlayers[computerId];
			if (computerPlayer.game === game.id) {
				this._startMoveLoop(game, computerId);
			}
		});
	}
	
	// Helper methods
	_startMoveLoop(game, computerId) {
		// Stop any existing loop
		this._stopMoveLoop(computerId);
		
		const computerPlayer = this.computerPlayers[computerId];
		if (!computerPlayer) return;
		
		// Get move interval from difficulty settings
		const moveInterval = computerPlayer.settings.MOVE_INTERVAL;
		
		// Record the interval details
		this.moveIntervals[computerId] = {
			interval: moveInterval,
			isActive: true,
			startTime: Date.now()
		};
	}
	
	_stopMoveLoop(computerId) {
		if (this.moveIntervals[computerId]) {
			this.moveIntervals[computerId].isActive = false;
			delete this.moveIntervals[computerId];
		}
	}
	
	// Reset for tests
	_reset() {
		this.computerPlayers = {};
		this.moveIntervals = {};
	}
}

export default ComputerPlayerManagerMock; 