// Computer Player Difficulty Test
const assert = require('assert');

console.log('Testing computer player difficulty settings...');

// Define difficulty settings
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

// Create a simple mock game manager for testing
class MockGameManager {
	constructor() {
		this.games = {};
		this.computerPlayers = {};
	}
	
	// Add a computer player with specified difficulty
	addComputerPlayer(gameId, difficulty = 'medium') {
		// Default to medium if unspecified
		const difficultyUpperCase = difficulty.toUpperCase();
		const settings = DIFFICULTY_SETTINGS[difficultyUpperCase] || DIFFICULTY_SETTINGS.MEDIUM;
		
		const playerId = `computer-${Date.now()}`;
		this.computerPlayers[playerId] = {
			id: playerId,
			gameId,
			difficulty,
			moveInterval: settings.MOVE_INTERVAL,
			thinkingDepth: settings.THINKING_DEPTH,
			accuracy: settings.ACCURACY
		};
		
		return {
			id: playerId,
			details: this.computerPlayers[playerId]
		};
	}
}

// Create test instance
const gameManager = new MockGameManager();

// Test adding players with different difficulties
const easyPlayer = gameManager.addComputerPlayer('test-game', 'easy');
const mediumPlayer = gameManager.addComputerPlayer('test-game', 'medium');
const hardPlayer = gameManager.addComputerPlayer('test-game', 'hard');
const defaultPlayer = gameManager.addComputerPlayer('test-game');

// Test 1: Easy should have longer move interval than medium
assert.ok(
	easyPlayer.details.moveInterval > mediumPlayer.details.moveInterval,
	'Easy difficulty should have longer move interval than medium'
);

// Test 2: Medium should have longer move interval than hard
assert.ok(
	mediumPlayer.details.moveInterval > hardPlayer.details.moveInterval,
	'Medium difficulty should have longer move interval than hard'
);

// Test 3: Easy should have lower thinking depth than medium
assert.ok(
	easyPlayer.details.thinkingDepth < mediumPlayer.details.thinkingDepth,
	'Easy difficulty should have lower thinking depth than medium'
);

// Test 4: Medium should have lower thinking depth than hard
assert.ok(
	mediumPlayer.details.thinkingDepth < hardPlayer.details.thinkingDepth,
	'Medium difficulty should have lower thinking depth than hard'
);

// Test 5: Default player should be medium difficulty
assert.strictEqual(
	defaultPlayer.details.difficulty,
	'medium',
	'Default player should have medium difficulty'
);

// Test 6: Default player should have medium move interval
assert.strictEqual(
	defaultPlayer.details.moveInterval,
	DIFFICULTY_SETTINGS.MEDIUM.MOVE_INTERVAL,
	'Default player should have medium move interval'
);

console.log('All computer player difficulty tests passed!');
