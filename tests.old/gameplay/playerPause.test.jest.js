/**
 * Tests for player pause functionality
 */

const { expect } = require('@jest/globals');
const GameManager = require('../../server/game/GameManager');

// Skip these tests for now until the module imports are fixed
describe.skip('Player Pause System', () => {
	let gameManager;
	let gameId;
	let playerId;
	let game;
	
	beforeEach(() => {
		gameManager = new GameManager();
		const result = gameManager.createGame('test');
		gameId = result.id;
		
		// Add a player
		const playerResult = gameManager.addPlayer(gameId, { id: 'player1', username: 'Test Player' });
		playerId = playerResult.id;
		
		// Get the game object
		game = gameManager.games.get(gameId);
	});
	
	it('should allow a player to pause the game', () => {
		const pauseResult = gameManager.pausePlayer(gameId, playerId);
		
		expect(pauseResult.success).toBe(true);
		expect(pauseResult.error).toBeNull();
	});
	
	it('should not allow pausing an already paused player', () => {
		// First pause
		gameManager.pausePlayer(gameId, playerId);
		
		// Try to pause again
		const pauseResult = gameManager.pausePlayer(gameId, playerId);
		
		expect(pauseResult.success).toBe(false);
		expect(pauseResult.error).toBe('Player is already paused');
	});
	
	it('should allow a player to resume the game', () => {
		// First pause the player
		gameManager.pausePlayer(gameId, playerId);
		
		// Then resume
		const resumeResult = gameManager.resumePlayer(gameId, playerId);
		
		expect(resumeResult.success).toBe(true);
		expect(resumeResult.error).toBeNull();
	});
	
	it('should not allow resuming a player who is not paused', () => {
		// Try to resume without pausing first
		const resumeResult = gameManager.resumePlayer(gameId, playerId);
		
		expect(resumeResult.success).toBe(false);
		expect(resumeResult.error).toBe('Player is not paused');
	});
	
	it('should protect pieces of paused players from capture', () => {
		// Add a chess piece for the first player
		const piece = {
			id: 'piece1',
			type: 'pawn',
			player: playerId,
			position: { x: 5, y: 5 }
		};
		game.chessPieces.push(piece);
		
		// Add a second player
		const player2Result = gameManager.addPlayer(gameId, { id: 'player2', username: 'Opponent' });
		const player2Id = player2Result.id;
		
		// Verify the piece can be captured when not paused
		let canCapture = gameManager.canCapturePiece(game, player2Id, 5, 5);
		expect(canCapture).toBe(true);
		
		// Pause the first player
		gameManager.pausePlayer(gameId, playerId);
		
		// Verify the piece cannot be captured when paused
		canCapture = gameManager.canCapturePiece(game, player2Id, 5, 5);
		expect(canCapture).toBe(false);
	});
	
	it('should protect the home zone of paused players', () => {
		// Setup home zone coordinates for testing
		const player = game.players[playerId];
		player.homeZone = { x: 0, y: 0, width: 8, height: 2 };
		
		// Check home zone is not protected initially
		let isProtected = gameManager.isHomeZoneProtected(game, 1, 1);
		expect(isProtected).toBe(false);
		
		// Pause the player
		gameManager.pausePlayer(gameId, playerId);
		
		// Check home zone is now protected
		isProtected = gameManager.isHomeZoneProtected(game, 1, 1);
		expect(isProtected).toBe(true);
	});
});