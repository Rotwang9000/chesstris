/**
 * Computer Player Difficulty Tests
 * 
 * Tests for verifying the difficulty-based timing adjustments for computer players
 */

const { expect } = require('chai');
const GameManager = require('../server/game/GameManager');

describe('Computer Player Difficulty', () => {
	let gameManager;
	let gameId;
	
	beforeEach(() => {
		// Create a new game manager instance for each test
		gameManager = new GameManager();
		gameId = 'test-game-id';
		
		// Create a test game
		gameManager.createGame({
			gameId,
			width: 30,
			height: 30,
			expandBoardAsNeeded: true
		});
	});
	
	describe('External Computer Player Registration', () => {
		it('should set the correct difficulty level when registering external computer players', () => {
			// Register computer players with different difficulty levels
			const easyPlayer = gameManager.registerExternalComputerPlayer({
				id: 'easy-ai',
				name: 'Easy AI',
				apiEndpoint: 'https://example.com/easy-ai',
				difficulty: 'easy'
			});
			
			const mediumPlayer = gameManager.registerExternalComputerPlayer({
				id: 'medium-ai',
				name: 'Medium AI',
				apiEndpoint: 'https://example.com/medium-ai',
				difficulty: 'medium'
			});
			
			const hardPlayer = gameManager.registerExternalComputerPlayer({
				id: 'hard-ai',
				name: 'Hard AI',
				apiEndpoint: 'https://example.com/hard-ai',
				difficulty: 'hard'
			});
			
			const defaultPlayer = gameManager.registerExternalComputerPlayer({
				id: 'default-ai',
				name: 'Default AI',
				apiEndpoint: 'https://example.com/default-ai'
				// No difficulty specified
			});
			
			// Assert all registrations were successful
			expect(easyPlayer.success).to.be.true;
			expect(mediumPlayer.success).to.be.true;
			expect(hardPlayer.success).to.be.true;
			expect(defaultPlayer.success).to.be.true;
			
			// Get the registered players
			const easyAI = gameManager.externalComputerPlayers.get('easy-ai');
			const mediumAI = gameManager.externalComputerPlayers.get('medium-ai');
			const hardAI = gameManager.externalComputerPlayers.get('hard-ai');
			const defaultAI = gameManager.externalComputerPlayers.get('default-ai');
			
			// Assert the difficulty levels were correctly set
			expect(easyAI.difficulty).to.equal('easy');
			expect(mediumAI.difficulty).to.equal('medium');
			expect(hardAI.difficulty).to.equal('hard');
			expect(defaultAI.difficulty).to.equal('medium'); // Default should be medium
		});
	});
	
	describe('Move Interval Based on Difficulty', () => {
		it('should set the correct minMoveInterval for different difficulty levels', () => {
			// Register and add computer players with different difficulty levels
			gameManager.registerExternalComputerPlayer({
				id: 'easy-ai',
				name: 'Easy AI',
				apiEndpoint: 'https://example.com/easy-ai',
				difficulty: 'easy'
			});
			
			gameManager.registerExternalComputerPlayer({
				id: 'medium-ai',
				name: 'Medium AI',
				apiEndpoint: 'https://example.com/medium-ai',
				difficulty: 'medium'
			});
			
			gameManager.registerExternalComputerPlayer({
				id: 'hard-ai',
				name: 'Hard AI',
				apiEndpoint: 'https://example.com/hard-ai',
				difficulty: 'hard'
			});
			
			// Add players to the game
			gameManager.addExternalComputerPlayer(gameId, 'easy-ai');
			gameManager.addExternalComputerPlayer(gameId, 'medium-ai');
			gameManager.addExternalComputerPlayer(gameId, 'hard-ai');
			
			const game = gameManager.getGameState(gameId);
			
			// Assert the minMoveInterval was correctly set based on difficulty
			expect(game.players['easy-ai'].minMoveInterval).to.equal(15000);
			expect(game.players['medium-ai'].minMoveInterval).to.equal(10000);
			expect(game.players['hard-ai'].minMoveInterval).to.equal(5000);
		});
	});
}); 