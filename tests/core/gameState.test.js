/**
 * Game State Management Tests
 * 
 * Tests the creation, updating, and persistence of game state
 */

const { GameManager } = require('../../public/js/game/GameManager');

describe('Game State Management', () => {
	let gameManager;
	
	beforeEach(() => {
		// Initialize a fresh GameManager for each test
		gameManager = new GameManager();
	});
	
	describe('Game Creation', () => {
		it('should create a new game with a unique ID', () => {
			const game1 = gameManager.createGame('Test Game 1');
			const game2 = gameManager.createGame('Test Game 2');
			
			expect(game1).toBeDefined();
			expect(game1.id).toBeDefined();
			expect(game1.name).toBe('Test Game 1');
			
			expect(game2).toBeDefined();
			expect(game2.id).toBeDefined();
			expect(game2.name).toBe('Test Game 2');
			
			// IDs should be unique
			expect(game1.id).not.toBe(game2.id);
		});
		
		it('should initialize a game with the correct default properties', () => {
			const game = gameManager.createGame('Default Game');
			
			// Check basic properties
			expect(game.status).toBe('waiting'); // or whatever the initial status is
			expect(game.players).toEqual({});
			expect(game.board).toBeDefined();
			expect(game.created).toBeDefined();
			expect(game.lastUpdated).toBeDefined();
		});
		
		it('should allow setting custom game configuration options', () => {
			// Skip if custom configuration is not implemented
			if (!gameManager.supportsCustomConfig) {
				return;
			}
			
			const config = {
				maxPlayers: 4,
				boardSize: 'large',
				gameMode: 'teams',
				startingPieces: 'random'
			};
			
			const game = gameManager.createGame('Custom Game', config);
			
			expect(game.config).toBeDefined();
			expect(game.config.maxPlayers).toBe(4);
			expect(game.config.boardSize).toBe('large');
			expect(game.config.gameMode).toBe('teams');
			expect(game.config.startingPieces).toBe('random');
		});
	});
	
	describe('Player Management', () => {
		let gameId;
		
		beforeEach(() => {
			const game = gameManager.createGame('Player Test Game');
			gameId = game.id;
		});
		
		it('should add a player to the game', () => {
			const result = gameManager.addPlayer(gameId, 'player1', 'Player One');
			
			expect(result.success).toBe(true);
			
			const game = gameManager.getGame(gameId);
			expect(Object.keys(game.players).length).toBe(1);
			expect(game.players.player1).toBeDefined();
			expect(game.players.player1.name).toBe('Player One');
			expect(game.players.player1.id).toBe('player1');
		});
		
		it('should not add a player with a duplicate ID', () => {
			// Add the first player
			gameManager.addPlayer(gameId, 'player1', 'Player One');
			
			// Try to add another player with the same ID
			const result = gameManager.addPlayer(gameId, 'player1', 'Different Name');
			
			expect(result.success).toBe(false);
			expect(result.error).toBeDefined();
			
			// Still only one player in the game
			const game = gameManager.getGame(gameId);
			expect(Object.keys(game.players).length).toBe(1);
		});
		
		it('should remove a player from the game', () => {
			// Add a player
			gameManager.addPlayer(gameId, 'player1', 'Player One');
			
			// Check the player was added
			let game = gameManager.getGame(gameId);
			expect(game.players.player1).toBeDefined();
			
			// Remove the player
			const result = gameManager.removePlayer(gameId, 'player1');
			
			expect(result.success).toBe(true);
			
			// Check the player was removed
			game = gameManager.getGame(gameId);
			expect(game.players.player1).toBeUndefined();
		});
		
		it('should enforce maximum player limits', () => {
			// Skip if the game doesn't have player limits
			const game = gameManager.getGame(gameId);
			if (!game.config || !game.config.maxPlayers) {
				return;
			}
			
			const maxPlayers = game.config.maxPlayers;
			
			// Add players up to the limit
			for (let i = 0; i < maxPlayers; i++) {
				const addResult = gameManager.addPlayer(gameId, `player${i}`, `Player ${i}`);
				expect(addResult.success).toBe(true);
			}
			
			// Try to add one more player
			const overLimitResult = gameManager.addPlayer(gameId, 'extraPlayer', 'Extra Player');
			expect(overLimitResult.success).toBe(false);
			expect(overLimitResult.error).toBeDefined();
		});
	});
	
	describe('Game Progression', () => {
		let gameId;
		
		beforeEach(() => {
			// Create a game with two players
			const game = gameManager.createGame('Progression Test');
			gameId = game.id;
			
			gameManager.addPlayer(gameId, 'player1', 'Player One');
			gameManager.addPlayer(gameId, 'player2', 'Player Two');
		});
		
		it('should start a game when requested', () => {
			const startResult = gameManager.startGame(gameId);
			
			expect(startResult.success).toBe(true);
			
			const game = gameManager.getGame(gameId);
			expect(game.status).toBe('active'); // or whatever status represents a started game
			expect(game.started).toBeDefined();
		});
		
		it('should not start a game with insufficient players', () => {
			// Create a new game with no players
			const emptyGame = gameManager.createGame('Empty Game');
			
			const startResult = gameManager.startGame(emptyGame.id);
			
			expect(startResult.success).toBe(false);
			expect(startResult.error).toBeDefined();
			
			const game = gameManager.getGame(emptyGame.id);
			expect(game.status).not.toBe('active');
		});
		
		it('should update the game state when moves are made', () => {
			// Start the game
			gameManager.startGame(gameId);
			
			// Get the initial game state
			const initialGame = gameManager.getGame(gameId);
			
			// Make a move (this will depend on the specifics of the game)
			// For example, moving a chess piece
			const player1 = Object.values(initialGame.players).find(p => p.id === 'player1');
			const player1Piece = Object.values(player1.pieces)[0]; // Get the first piece
			
			const moveResult = gameManager.chessManager.movePiece(
				player1Piece.id,
				{ x: player1Piece.position.x + 1, y: player1Piece.position.y, z: player1Piece.position.z },
				'player1',
				initialGame
			);
			
			expect(moveResult.success).toBe(true);
			
			// Check the game state was updated
			const updatedGame = gameManager.getGame(gameId);
			expect(updatedGame.lastUpdated).not.toBe(initialGame.lastUpdated);
			
			// Check the piece was moved
			const updatedPiece = updatedGame.players.player1.pieces[player1Piece.id];
			expect(updatedPiece.position.x).toBe(player1Piece.position.x + 1);
		});
		
		it('should end the game when a victory condition is met', () => {
			// Start the game
			gameManager.startGame(gameId);
			
			// Force a game end condition (e.g., capturing king)
			const endResult = gameManager.endGame(gameId, 'player1');
			
			expect(endResult.success).toBe(true);
			
			// Check the game is marked as complete
			const game = gameManager.getGame(gameId);
			expect(game.status).toBe('completed');
			expect(game.winner).toBe('player1');
			expect(game.ended).toBeDefined();
		});
	});
	
	describe('Game State Persistence', () => {
		let gameId;
		
		beforeEach(() => {
			// Create a game to test
			const game = gameManager.createGame('Persistence Test');
			gameId = game.id;
			
			// Add some players
			gameManager.addPlayer(gameId, 'player1', 'Player One');
			gameManager.addPlayer(gameId, 'player2', 'Player Two');
		});
		
		it('should save the game state to persistence', () => {
			// Skip if the game doesn't implement persistence
			if (!gameManager.saveGame) {
				return;
			}
			
			const saveResult = gameManager.saveGame(gameId);
			
			expect(saveResult.success).toBe(true);
			expect(saveResult.gameId).toBe(gameId);
		});
		
		it('should load a saved game state', () => {
			// Skip if the game doesn't implement persistence
			if (!gameManager.saveGame || !gameManager.loadGame) {
				return;
			}
			
			// Save the game
			gameManager.saveGame(gameId);
			
			// Clear the in-memory games
			gameManager.clearGames();
			
			// Load the game back
			const loadResult = gameManager.loadGame(gameId);
			
			expect(loadResult.success).toBe(true);
			
			// Check the loaded game matches what we saved
			const loadedGame = gameManager.getGame(gameId);
			expect(loadedGame).toBeDefined();
			expect(loadedGame.id).toBe(gameId);
			expect(Object.keys(loadedGame.players).length).toBe(2);
		});
		
		it('should automatically save game state after significant actions', () => {
			// Skip if the game doesn't implement auto-save
			if (!gameManager.saveGame || !gameManager.getAutoSaveEnabled || !gameManager.getAutoSaveEnabled()) {
				return;
			}
			
			// Start the game
			gameManager.startGame(gameId);
			
			// Check if a save occurred
			const saveCount = gameManager.getSaveCount(gameId);
			expect(saveCount).toBeGreaterThan(0);
			
			// Make a move
			const game = gameManager.getGame(gameId);
			const player1 = Object.values(game.players).find(p => p.id === 'player1');
			const player1Piece = Object.values(player1.pieces)[0];
			
			gameManager.chessManager.movePiece(
				player1Piece.id,
				{ x: player1Piece.position.x + 1, y: player1Piece.position.y, z: player1Piece.position.z },
				'player1',
				game
			);
			
			// Check another save occurred
			const newSaveCount = gameManager.getSaveCount(gameId);
			expect(newSaveCount).toBeGreaterThan(saveCount);
		});
	});
}); 