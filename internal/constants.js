/**
 * Mock constants module for testing
 */

module.exports = {
	// Game constants
	MAX_PLAYERS: 8,
	MIN_PLAYERS: 1,
	DEFAULT_WIDTH: 30,
	DEFAULT_HEIGHT: 30,
	DEFAULT_DIFFICULTY: 'medium',
	
	// Computer player difficulty settings
	DIFFICULTY_SETTINGS: {
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
	},
	
	// Game status values
	GAME_STATUS: {
		WAITING: 'waiting',
		ACTIVE: 'active',
		PAUSED: 'paused',
		FINISHED: 'finished'
	},
	
	// Player status values
	PLAYER_STATUS: {
		WAITING: 'waiting',
		READY: 'ready',
		ACTIVE: 'active',
		PAUSED: 'paused',
		ELIMINATED: 'eliminated'
	}
}; 