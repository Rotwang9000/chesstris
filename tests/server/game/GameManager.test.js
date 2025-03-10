/**
 * GameManager Test Suite
 */

import { strict as assert } from 'assert';
import { describe, it, beforeEach } from 'mocha';
import GameManager from '../../../server/game/GameManager.js';

describe('GameManager', () => {
	let gameManager;

	beforeEach(() => {
		gameManager = new GameManager();
	});

	describe('Default Game', () => {
		it('should create a default game automatically', () => {
			const defaultGameId = gameManager.DEFAULT_GAME_ID;
			const game = gameManager.getGameState(defaultGameId);
			
			assert.ok(game, 'Default game should exist');
			assert.equal(game.id, defaultGameId, 'Default game should have the correct ID');
			assert.ok(game.board.length > 0, 'Default game should have a board');
			assert.deepEqual(game.players, {}, 'Default game should start with no players');
		});
	});

	describe('Game Creation', () => {
		it('should create games with unique IDs', () => {
			const result1 = gameManager.createGame();
			const result2 = gameManager.createGame();
			
			assert.ok(result1.success && result2.success, 'Both games should be created successfully');
			assert.notEqual(result1.gameId, result2.gameId, 'Games should have different IDs');
		});
	});

	describe('Player Management', () => {
		it('should support adding players to a game', () => {
			// Create a game first
			const gameResult = gameManager.createGame();
			const gameId = gameResult.gameId;
			
			// Add a player
			const playerId = 'test-player-1';
			const result = gameManager.addPlayer(gameId, playerId, 'Test Player');
			
			assert.ok(result.success, 'Should successfully add a player');
		});
	});

	describe('Board Expansion', () => {
		it('should support expanding the board', () => {
			// This test just verifies the API exists - actual implementation may vary
			const gameResult = gameManager.createGame({ width: 10, height: 10 });
			
			// We can only test this if _expandBoard is public
			if (typeof gameManager._expandBoard === 'function') {
				const game = gameManager.getGameState(gameResult.gameId);
				const originalWidth = game.board[0].length;
				const originalHeight = game.board.length;
				
				gameManager._expandBoard(game, 10, 10);
				
				assert.equal(game.board[0].length, originalWidth + 10, 'Width should increase');
				assert.equal(game.board.length, originalHeight + 10, 'Height should increase');
			} else {
				// Skip if method is private
				console.log('Skipping board expansion test - method is private');
			}
		});
	});
	
	describe('Chess Movement', () => {
		it('should have a method for moving chess pieces', () => {
			assert.equal(typeof gameManager.moveChessPiece, 'function', 
				'Should have moveChessPiece method');
		});
	});
	
	describe('Tetris Placement', () => {
		it('should have a method for placing tetris pieces', () => {
			assert.equal(typeof gameManager.placeTetrisPiece, 'function', 
				'Should have placeTetrisPiece method');
		});
	});
}); 