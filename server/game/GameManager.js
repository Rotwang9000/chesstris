/**
 * GameManager.js - Main orchestration class for game logic
 * 
 * This module serves as the central point of coordination for all game-related
 * functionality, delegating to specialized managers for specific operations.
 */

const { BOARD_SETTINGS } = require('./Constants');
const { generateGameId, generateApiToken, log } = require('./GameUtilities');

// Import managers
const BoardManager = require('./BoardManager');
const ChessManager = require('./ChessManager');
const TetrominoManager = require('./TetrominoManager');
const IslandManager = require('./IslandManager');
const PlayerManager = require('./PlayerManager');
const ComputerPlayerManager = require('./ComputerPlayerManager');

class GameManager {
	constructor() {
		// Initialize game storage
		this.games = {};
		this.externalComputerPlayers = {};
		this.apiTokens = {};
		
		// Maximum number of games to keep in memory
		this.MAX_GAMES = 100;
		
		// Initialize managers
		this.boardManager = new BoardManager();
		this.islandManager = new IslandManager();
		this.tetrominoManager = new TetrominoManager(this.boardManager, this.islandManager);
		this.chessManager = new ChessManager(this.boardManager, this.islandManager);
		this.playerManager = new PlayerManager(this.boardManager, this.chessManager, this.tetrominoManager);
		this.computerPlayerManager = new ComputerPlayerManager(this.playerManager);
		
		// Create default game
		this.createGame();
		
		// Set up periodic cleanup
		setInterval(() => this._cleanupOldGames(), 1000 * 60 * 60); // Every hour
	}
	
	/**
	 * Create a new game
	 * @param {Object} options - Game creation options
	 * @returns {Object} Created game information
	 */
	createGame(options = {}) {
		// Use provided gameId or generate a new one
		const gameId = options.gameId || generateGameId();
		
		// Clean up old games if we're exceeding our limit
		if (Object.keys(this.games).length >= this.MAX_GAMES) {
			this._cleanupOldGames();
		}
		
		// Default options
		const defaultOptions = {
			width: BOARD_SETTINGS.DEFAULT_WIDTH,
			height: BOARD_SETTINGS.DEFAULT_HEIGHT,
			maxPlayers: BOARD_SETTINGS.MAX_PLAYERS,
			homeZoneDistance: BOARD_SETTINGS.HOME_ZONE_DISTANCE
		};
		
		// Merge with provided options
		const gameOptions = { ...defaultOptions, ...options };
		
		// Create empty board
		const board = this.boardManager.createEmptyBoard(
			gameOptions.width, 
			gameOptions.height
		);
		
		// Create the game object
		const game = {
			id: gameId,
			board,
			chessPieces: [],
			islands: [],
			players: {},
			homeZones: {},
			maxPlayers: gameOptions.maxPlayers,
			homeZoneDistance: gameOptions.homeZoneDistance,
			status: 'waiting',
			createdAt: Date.now(),
			updatedAt: Date.now()
		};
		
		// Store the game
		this.games[gameId] = game;
		
		log(`Created new game with ID: ${gameId}`);
		
		return {
			gameId,
			width: gameOptions.width,
			height: gameOptions.height,
			maxPlayers: gameOptions.maxPlayers
		};
	}
	
	/**
	 * Get a game by ID
	 * @param {string} gameId - The game ID
	 * @returns {Object} The game object or null if not found
	 */
	getGame(gameId) {
		// Check if the game exists
		if (!this.games[gameId]) {
			return null;
		}
		
		return this.games[gameId];
	}
	
	/**
	 * Clean up old games to free memory
	 * @private
	 */
	_cleanupOldGames() {
		const now = Date.now();
		const gameIds = Object.keys(this.games);
		
		// Sort games by last update time (oldest first)
		const sortedGames = gameIds
			.map(id => ({ id, game: this.games[id] }))
			.sort((a, b) => a.game.updatedAt - b.game.updatedAt);
		
		// Remove oldest games if we exceed our limit
		const excessGames = sortedGames.length - this.MAX_GAMES;
		if (excessGames > 0) {
			for (let i = 0; i < excessGames; i++) {
				const { id, game } = sortedGames[i];
				
				// Stop any computer players
				this.computerPlayerManager.stopAllComputerPlayers(game);
				
				// Delete the game
				delete this.games[id];
				log(`Cleaned up old game: ${id}`);
			}
		}
		
		// Also clean up inactive games that are completed or abandoned
		for (const id of gameIds) {
			const game = this.games[id];
			const isOld = now - game.updatedAt > 1000 * 60 * 60 * 24; // 24 hours
			const isInactive = game.status === 'completed' || game.status === 'abandoned';
			
			if (isOld && isInactive) {
				// Stop any computer players
				this.computerPlayerManager.stopAllComputerPlayers(game);
				
				// Delete the game
				delete this.games[id];
				log(`Cleaned up inactive game: ${id}`);
			}
		}
	}
	
	/**
	 * Register a player in a game
	 * @param {string} gameId - The game ID
	 * @param {string} playerId - The player's ID
	 * @param {string} playerName - The player's name
	 * @param {boolean} isObserver - Whether the player is an observer
	 * @returns {Object} Registration result
	 */
	registerPlayer(gameId, playerId, playerName, isObserver = false) {
		// Get the game
		const game = this.getGame(gameId);
		if (!game) {
			return {
				success: false,
				error: `Game with ID ${gameId} not found`
			};
		}
		
		// Register the player
		const result = this.playerManager.registerPlayer(game, playerId, playerName, isObserver);
		
		// Update the game's timestamp
		game.updatedAt = Date.now();
		
		return result;
	}
	
	/**
	 * Set a player's ready status
	 * @param {string} gameId - The game ID
	 * @param {string} playerId - The player's ID
	 * @param {boolean} isReady - The ready status
	 * @returns {Object} Result of the operation
	 */
	setPlayerReady(gameId, playerId, isReady) {
		// Get the game
		const game = this.getGame(gameId);
		if (!game) {
			return {
				success: false,
				error: `Game with ID ${gameId} not found`
			};
		}
		
		// Set the player's ready status
		const result = this.playerManager.setPlayerReady(game, playerId, isReady);
		
		// If all players are ready and game has started, start computer players
		if (result.success && result.allPlayersReady && game.status === 'active') {
			this.computerPlayerManager.startAllComputerPlayers(game);
		}
		
		// Update the game's timestamp
		game.updatedAt = Date.now();
		
		return result;
	}
	
	/**
	 * Remove a player from a game
	 * @param {string} gameId - The game ID
	 * @param {string} playerId - The player's ID
	 * @returns {Object} Removal result
	 */
	removePlayer(gameId, playerId) {
		// Get the game
		const game = this.getGame(gameId);
		if (!game) {
			return {
				success: false,
				error: `Game with ID ${gameId} not found`
			};
		}
		
		// Check if this is a computer player
		const isComputerPlayer = Object.keys(this.computerPlayerManager.computerPlayers)
			.includes(playerId);
		
		// Remove the player
		let result;
		if (isComputerPlayer) {
			result = this.computerPlayerManager.removeComputerPlayer(game, playerId);
		} else {
			result = this.playerManager.removePlayer(game, playerId);
		}
		
		// Update the game's timestamp
		game.updatedAt = Date.now();
		
		return result;
	}
	
	/**
	 * Add a computer player to a game
	 * @param {string} gameId - The game ID
	 * @param {string} difficulty - The difficulty level (easy, medium, hard)
	 * @returns {Object} Result of adding the computer player
	 */
	addComputerPlayer(gameId, difficulty = 'medium') {
		// Get the game
		const game = this.getGame(gameId);
		if (!game) {
			return {
				success: false,
				error: `Game with ID ${gameId} not found`
			};
		}
		
		// Add the computer player
		const result = this.computerPlayerManager.initializeComputerPlayer(game, difficulty);
		
		// Update the game's timestamp
		game.updatedAt = Date.now();
		
		return result;
	}
	
	/**
	 * Handle a player action in a game
	 * @param {string} gameId - The game ID
	 * @param {string} playerId - The player's ID
	 * @param {Object} action - The action data
	 * @returns {Object} Result of handling the action
	 */
	handlePlayerAction(gameId, playerId, action) {
		// Get the game
		const game = this.getGame(gameId);
		if (!game) {
			return {
				success: false,
				error: `Game with ID ${gameId} not found`
			};
		}
		
		// Handle the player action
		const result = this.playerManager.handlePlayerAction(game, playerId, action);
		
		// Update the game's timestamp
		game.updatedAt = Date.now();
		
		return result;
	}
	
	/**
	 * Expand the game board
	 * @param {string} gameId - The game ID
	 * @param {number} additionalWidth - Additional width to add
	 * @param {number} additionalHeight - Additional height to add
	 * @returns {Object} Result of the expansion
	 */
	expandBoard(gameId, additionalWidth = 10, additionalHeight = 10) {
		// Get the game
		const game = this.getGame(gameId);
		if (!game) {
			return {
				success: false,
				error: `Game with ID ${gameId} not found`
			};
		}
		
		// Expand the board
		this.boardManager.expandBoard(game, additionalWidth, additionalHeight);
		
		// Update the game's timestamp
		game.updatedAt = Date.now();
		
		return {
			success: true,
			newWidth: game.board.width,
			newHeight: game.board.height
		};
	}
	
	/**
	 * Generate an API token for a player
	 * @param {string} playerId - The player's ID
	 * @returns {string} The generated API token
	 */
	generateApiToken(playerId) {
		// Generate a unique token
		const token = generateApiToken();
		
		// Store the token to player mapping
		this.apiTokens[token] = playerId;
		
		log(`Generated API token for player ${playerId}`);
		
		return token;
	}
	
	/**
	 * Validate an API token and get the associated player ID
	 * @param {string} token - The API token
	 * @returns {string|null} The player ID or null if invalid
	 */
	validateApiToken(token) {
		return this.apiTokens[token] || null;
	}
	
	/**
	 * Get the game state for a specific player
	 * @param {string} gameId - The game ID
	 * @param {string} playerId - The player's ID
	 * @returns {Object} The game state
	 */
	getGameStateForPlayer(gameId, playerId) {
		// Get the game
		const game = this.getGame(gameId);
		if (!game) {
			return {
				success: false,
				error: `Game with ID ${gameId} not found`
			};
		}
		
		// Check if the player exists
		if (!game.players[playerId]) {
			return {
				success: false,
				error: `Player ${playerId} not found in game ${gameId}`
			};
		}
		
		// Convert sparse board to 2D array for compatibility with client
		const visibleRegion = {
			minX: game.board.minX,
			maxX: game.board.maxX,
			minZ: game.board.minZ,
			maxZ: game.board.maxZ
		};
		
		const boardRegion = this.boardManager.getBoardRegion(
			game.board,
			visibleRegion.minX,
			visibleRegion.maxX, 
			visibleRegion.minZ,
			visibleRegion.maxZ
		);
		
		// Create a tailored game state for the player
		const gameState = {
			id: game.id,
			status: game.status,
			board: boardRegion,
			boardBounds: {
				minX: game.board.minX,
				maxX: game.board.maxX,
				minZ: game.board.minZ,
				maxZ: game.board.maxZ,
				width: game.board.width,
				height: game.board.height
			},
			chessPieces: game.chessPieces,
			players: game.players,
			homeZones: game.homeZones,
			currentPlayer: playerId,
			updatedAt: game.updatedAt
		};
		
		return {
			success: true,
			gameState
		};
	}
}

module.exports = GameManager; 