import express from 'express';
import GameManager from '../game/GameManager.js';

const router = express.Router();

// Initialize the game manager (or use the one passed from the main server)
let gameManager;

// Set the game manager instance
export function setGameManager(manager) {
	gameManager = manager;
}

// Get all games
router.get('/games', (req, res) => {
	try {
		// Get all game IDs
		const gameIds = Array.from(gameManager.games.keys());
		
		return res.json({
			success: true,
			games: gameIds
		});
	} catch (error) {
		console.error('Error getting games:', error);
		return res.status(500).json({ success: false, message: 'Internal server error' });
	}
});

// Get a specific game
router.get('/games/:gameId', (req, res) => {
	try {
		const { gameId } = req.params;
		
		// Use the default game ID if specified, or fall back to the GameManager's default
		const targetGameId = (gameId === 'default-game') ? gameManager.DEFAULT_GAME_ID : gameId;
		
		// Check if the game exists
		if (!gameManager.gameExists(targetGameId)) {
			return res.status(404).json({ success: false, message: 'Game not found' });
		}
		
		// Get the game state
		const gameState = gameManager.getGameState(targetGameId);
		
		return res.json({
			success: true,
			gameId: targetGameId,
			gameState
		});
	} catch (error) {
		console.error('Error getting game:', error);
		return res.status(500).json({ success: false, message: 'Internal server error' });
	}
});

// Create a new game
router.post('/games', (req, res) => {
	try {
		const { playerId, username, options } = req.body;
		
		if (!playerId) {
			return res.status(400).json({ success: false, message: 'Player ID is required' });
		}
		
		// Create a new game
		const result = gameManager.createGame(options || {});
		
		if (result.success) {
			// Add the player to the game
			const addPlayerResult = gameManager.addPlayer(result.gameId, playerId, username);
			
			if (addPlayerResult.success) {
				console.log(`Created new game ${result.gameId} with player ${username || 'Anonymous'} (${playerId})`);
				
				return res.json({
					success: true,
					message: 'Game created successfully',
					gameId: result.gameId,
					playerId
				});
			} else {
				console.error('Failed to add player to new game:', addPlayerResult.error);
				return res.status(400).json({ success: false, message: addPlayerResult.error });
			}
		} else {
			console.error('Failed to create game:', result.error);
			return res.status(400).json({ success: false, message: result.error });
		}
	} catch (error) {
		console.error('Error creating game:', error);
		return res.status(500).json({ success: false, message: 'Internal server error' });
	}
});

// Join a game
router.post('/games/:gameId/join', (req, res) => {
	try {
		const { gameId } = req.params;
		const { playerId, username } = req.body;
		
		if (!playerId) {
			return res.status(400).json({ success: false, message: 'Player ID is required' });
		}
		
		// Use the default game ID if specified, or fall back to the GameManager's default
		const targetGameId = (gameId === 'default-game') ? gameManager.DEFAULT_GAME_ID : gameId;
		
		// Check if the game exists
		if (!gameManager.gameExists(targetGameId)) {
			return res.status(404).json({ success: false, message: 'Game not found' });
		}
		
		// Check if the player already exists in the game
		const currentState = gameManager.getGameState(targetGameId);
		if (currentState && currentState.players && currentState.players[playerId]) {
			// Player already exists, update their data and mark as active
			console.log(`Player ${playerId} already exists in game ${targetGameId}, updating data and marking as active`);
			currentState.players[playerId].isActive = true;
			currentState.players[playerId].username = username || currentState.players[playerId].username;
			
			// Return success response
			return res.json({ 
				success: true, 
				message: 'Reconnected to existing game',
				gameId: targetGameId,
				playerId: playerId
			});
		}
		
		// Check if the game is full
		const playerCount = Object.keys(currentState.players).length;
		if (playerCount >= currentState.maxPlayers) {
			return res.status(400).json({
				success: false,
				error: 'Game is full'
			});
		}
		
		// Add player to the game
		const result = gameManager.addPlayer(targetGameId, playerId, username);
		
		if (result.success) {
			console.log(`Player ${username || 'Anonymous'} (${playerId}) joined game ${targetGameId}`);
			
			// Return success response
			return res.json({ 
				success: true, 
				message: 'Joined game successfully',
				gameId: targetGameId,
				playerId: playerId
			});
		} else {
			console.error('Failed to add player:', result.error);
			return res.status(400).json({ success: false, message: result.error });
		}
	} catch (error) {
		console.error('Error joining game:', error);
		return res.status(500).json({ success: false, message: 'Internal server error' });
	}
});

// Leave a game
router.post('/games/:gameId/leave', (req, res) => {
	try {
		const { gameId } = req.params;
		const { playerId } = req.body;
		
		if (!playerId) {
			return res.status(400).json({ success: false, message: 'Player ID is required' });
		}
		
		// Use the default game ID if specified, or fall back to the GameManager's default
		const targetGameId = (gameId === 'default-game') ? gameManager.DEFAULT_GAME_ID : gameId;
		
		// Check if the game exists
		if (!gameManager.gameExists(targetGameId)) {
			return res.status(404).json({ success: false, message: 'Game not found' });
		}
		
		// Get the current game state
		const currentState = gameManager.getGameState(targetGameId);
		
		// Check if the player exists in the game
		if (!currentState.players[playerId]) {
			return res.status(404).json({ success: false, message: 'Player not found in game' });
		}
		
		// Mark player as inactive
		currentState.players[playerId].isActive = false;
		
		return res.json({
			success: true,
			message: 'Left game successfully',
			gameId: targetGameId,
			playerId
		});
	} catch (error) {
		console.error('Error leaving game:', error);
		return res.status(500).json({ success: false, message: 'Internal server error' });
	}
});

// ==== NEW API ENDPOINTS FOR COMPUTER PLAYERS ====

/**
 * Register an external computer player
 * Allows third-party developers to register their AI players
 */
router.post('/computer-players/register', (req, res) => {
	try {
		const { name, apiEndpoint, apiKey, description, difficulty } = req.body;
		
		if (!name || !apiEndpoint) {
			return res.status(400).json({ 
				success: false, 
				message: 'Name and API endpoint are required' 
			});
		}
		
		// Generate a player ID for this computer player
		const playerId = `ext-ai-${gameManager._generateUniqueId()}`;
		
		// Register the computer player in the system
		// This would typically store the player in a database
		const registrationResult = gameManager.registerExternalComputerPlayer({
			id: playerId,
			name,
			apiEndpoint,
			apiKey: apiKey || null,
			description: description || '',
			difficulty: difficulty || 'medium',
			isActive: true,
			createdAt: new Date()
		});
		
		if (registrationResult.success) {
			return res.json({
				success: true,
				message: 'Computer player registered successfully',
				playerId,
				apiToken: registrationResult.apiToken // Token for authenticating API calls
			});
		} else {
			return res.status(400).json({
				success: false,
				message: registrationResult.error
			});
		}
	} catch (error) {
		console.error('Error registering computer player:', error);
		return res.status(500).json({ 
			success: false, 
			message: 'Internal server error' 
		});
	}
});

/**
 * Add an external computer player to a game
 */
router.post('/games/:gameId/add-computer-player', (req, res) => {
	try {
		const { gameId } = req.params;
		const { computerId } = req.body;
		
		if (!computerId) {
			return res.status(400).json({ 
				success: false, 
				message: 'Computer player ID is required' 
			});
		}
		
		// Use the default game ID if specified, or fall back to the GameManager's default
		const targetGameId = (gameId === 'default-game') ? gameManager.DEFAULT_GAME_ID : gameId;
		
		// Check if the game exists
		if (!gameManager.gameExists(targetGameId)) {
			return res.status(404).json({ 
				success: false, 
				message: 'Game not found' 
			});
		}
		
		// Add computer player to the game
		const result = gameManager.addExternalComputerPlayer(targetGameId, computerId);
		
		if (result.success) {
			return res.json({
				success: true,
				message: 'Computer player added to game successfully',
				gameId: targetGameId,
				computerId
			});
		} else {
			return res.status(400).json({ 
				success: false, 
				message: result.error 
			});
		}
	} catch (error) {
		console.error('Error adding computer player to game:', error);
		return res.status(500).json({ 
			success: false, 
			message: 'Internal server error' 
		});
	}
});

/**
 * Get all registered external computer players
 */
router.get('/computer-players', (req, res) => {
	try {
		// Get all registered computer players
		const computerPlayers = gameManager.getExternalComputerPlayers();
		
		return res.json({
			success: true,
			computerPlayers: computerPlayers.map(player => ({
				id: player.id,
				name: player.name,
				description: player.description,
				isActive: player.isActive,
				createdAt: player.createdAt
			}))
		});
	} catch (error) {
		console.error('Error getting computer players:', error);
		return res.status(500).json({ 
			success: false, 
			message: 'Internal server error' 
		});
	}
});

/**
 * Process a computer player move
 */
router.post('/games/:gameId/computer-move', (req, res) => {
	try {
		const { gameId } = req.params;
		const { playerId, apiToken, moveType, moveData } = req.body;
		
		// Validate required fields
		if (!playerId || !moveType || !moveData) {
			return res.status(400).json({ 
				success: false, 
				message: 'Missing required fields: playerId, moveType, moveData' 
			});
		}
		
		// Use the default game ID if specified, or fall back to the GameManager's default
		const targetGameId = (gameId === 'default-game') ? gameManager.DEFAULT_GAME_ID : gameId;
		
		// Check if the game exists
		if (!gameManager.gameExists(targetGameId)) {
			return res.status(404).json({ 
				success: false, 
				message: 'Game not found' 
			});
		}
		
		// Get the current game state
		const gameState = gameManager.getGameState(targetGameId);
		
		// Check if the player exists in the game
		if (!gameState.players[playerId]) {
			return res.status(400).json({ 
				success: false, 
				message: 'Player not found in this game' 
			});
		}
		
		// Validate API token for external computer players
		if (playerId.startsWith('ext-ai-') && !gameManager.validateExternalComputerPlayerToken(playerId, apiToken)) {
			return res.status(401).json({ 
				success: false, 
				message: 'Invalid API token' 
			});
		}
		
		// Check if the move type is valid
		if (moveType !== 'tetromino' && moveType !== 'chess') {
			return res.status(400).json({ 
				success: false, 
				message: 'Invalid move type. Must be "tetromino" or "chess".' 
			});
		}
		
		// Check if the move type matches the expected move type
		if (gameState.currentMoveType !== moveType) {
			return res.status(400).json({ 
				success: false, 
				message: `Expected ${gameState.currentMoveType} move, got ${moveType}` 
			});
		}
		
		// Enforce minimum time between moves
		const now = Date.now();
		const lastMoveTime = gameState.players[playerId].lastMoveTime || 0;
		const timeSinceLastMove = now - lastMoveTime;
		
		if (timeSinceLastMove < gameManager.MIN_MOVE_TIME) {
			const waitTime = Math.ceil((gameManager.MIN_MOVE_TIME - timeSinceLastMove) / 1000);
			return res.status(429).json({ 
				success: false, 
				message: `Too many moves. Please wait ${waitTime} seconds before your next move.`,
				retryAfter: waitTime
			});
		}
		
		// Process the move based on the move type
		let moveResult;
		
		if (moveType === 'tetromino') {
			moveResult = gameManager.placeTetrisPiece(targetGameId, playerId, moveData);
		} else if (moveType === 'chess') {
			// Handle skip move request
			if (moveData.skipMove) {
				console.log(`Player ${playerId} is skipping chess move`);
				
				// Check if the player has any valid chess moves
				const hasValidMoves = gameManager.hasValidChessMoves(targetGameId, playerId);
				if (!hasValidMoves) {
					// Update the player's move type to tetromino
					gameState.currentMoveType = 'tetromino';
					
					// Update last move time
					gameState.players[playerId].lastMoveTime = now;
					
					return res.json({
						success: true,
						message: 'Chess move skipped, no valid moves available',
						skipToTetromino: true,
						gameState: gameManager.getGameState(targetGameId)
					});
				} else {
					return res.status(400).json({
						success: false,
						message: 'Cannot skip chess move, valid moves are available'
					});
				}
			} else {
				moveResult = gameManager.moveChessPiece(targetGameId, playerId, moveData);
			}
		} else {
			return res.status(400).json({ 
				success: false, 
				message: 'Invalid move type. Must be "tetromino" or "chess".'
			});
		}
		
		if (moveResult.success) {
			// Update last move time
			gameState.players[playerId].lastMoveTime = now;
			
			return res.json({
				success: true,
				message: `${moveType} move processed successfully`,
				gameState: gameManager.getGameState(targetGameId)
			});
		} else {
			return res.status(400).json({ 
				success: false, 
				message: moveResult.error 
			});
		}
	} catch (error) {
		console.error('Error processing computer move:', error);
		return res.status(500).json({ 
			success: false, 
			message: 'Internal server error' 
		});
	}
});

/**
 * Get available tetromino shapes for placement
 */
router.get('/games/:gameId/available-tetrominos', (req, res) => {
	try {
		const { gameId } = req.params;
		const { playerId, apiToken } = req.query;
		
		if (!playerId || !apiToken) {
			return res.status(400).json({ 
				success: false, 
				message: 'Player ID and API token are required' 
			});
		}
		
		// Use the default game ID if specified, or fall back to the GameManager's default
		const targetGameId = (gameId === 'default-game') ? gameManager.DEFAULT_GAME_ID : gameId;
		
		// Check if the game exists
		if (!gameManager.gameExists(targetGameId)) {
			return res.status(404).json({ 
				success: false, 
				message: 'Game not found' 
			});
		}
		
		// Validate the API token
		if (!gameManager.validateExternalComputerPlayerToken(playerId, apiToken)) {
			return res.status(401).json({ 
				success: false, 
				message: 'Invalid API token' 
			});
		}
		
		// Get available tetromino shapes for this player
		const tetrominos = gameManager.getAvailableTetrominos(targetGameId, playerId);
		
		return res.json({
			success: true,
			tetrominos
		});
	} catch (error) {
		console.error('Error getting available tetrominos:', error);
		return res.status(500).json({ 
			success: false, 
			message: 'Internal server error' 
		});
	}
});

/**
 * Get chess pieces for a player
 */
router.get('/games/:gameId/chess-pieces', (req, res) => {
	try {
		const { gameId } = req.params;
		const { playerId, apiToken } = req.query;
		
		if (!playerId || !apiToken) {
			return res.status(400).json({ 
				success: false, 
				message: 'Player ID and API token are required' 
			});
		}
		
		// Use the default game ID if specified, or fall back to the GameManager's default
		const targetGameId = (gameId === 'default-game') ? gameManager.DEFAULT_GAME_ID : gameId;
		
		// Check if the game exists
		if (!gameManager.gameExists(targetGameId)) {
			return res.status(404).json({ 
				success: false, 
				message: 'Game not found' 
			});
		}
		
		// Validate the API token
		if (!gameManager.validateExternalComputerPlayerToken(playerId, apiToken)) {
			return res.status(401).json({ 
				success: false, 
				message: 'Invalid API token' 
			});
		}
		
		// Get chess pieces for this player
		const chessPieces = gameManager.getPlayerChessPieces(targetGameId, playerId);
		
		return res.json({
			success: true,
			chessPieces
		});
	} catch (error) {
		console.error('Error getting chess pieces:', error);
		return res.status(500).json({ 
			success: false, 
			message: 'Internal server error' 
		});
	}
});

// Add a method to check if gameManager exists
export function gameManagerExists() {
	return !!gameManager;
}

/**
 * Get all games
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
function getGames(req, res) {
	try {
		// Get all games
		const games = [];
		
		for (const [id, game] of gameManager.games.entries()) {
			games.push({
				id,
				playerCount: Object.keys(game.players).length,
				maxPlayers: game.maxPlayers,
				createdAt: game.createdAt
			});
		}
		
		return res.json({
			success: true,
			games
		});
	} catch (error) {
		console.error('Error getting games:', error);
		return res.status(500).json({
			success: false,
			error: error.message
		});
	}
}

/**
 * Create a new game
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
function createGame(req, res) {
	try {
		const { playerId, options = {} } = req.body;
		
		// Set default options if not provided
		const gameOptions = {
			boardWidth: options.boardWidth || 20,
			boardHeight: options.boardHeight || 20,
			maxPlayers: options.maxPlayers || 2048, // Default to 2048 players
			// Add other game options here
		};
		
		// Create a new game
		const result = gameManager.createGame(gameOptions);
		
		if (!result.success) {
			return res.status(400).json({
				success: false,
				error: result.error
			});
		}
		
		const gameId = result.gameId;
		
		// Add the player to the game
		const addPlayerResult = gameManager.addPlayer(gameId, playerId);
		
		if (!addPlayerResult.success) {
			return res.status(400).json({
				success: false,
				error: addPlayerResult.error
			});
		}
		
		// Get the updated game state
		const game = gameManager.getGame(gameId);
		
		return res.json({
			success: true,
			message: `Game ${gameId} created and player ${playerId} joined`,
			gameId,
			gameState: game
		});
	} catch (error) {
		console.error('Error creating game:', error);
		return res.status(500).json({
			success: false,
			error: error.message
		});
	}
}

/**
 * Join a game
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
function joinGame(req, res) {
	try {
		const { gameId, playerId } = req.body;
		
		// Check if the game exists
		const game = gameManager.getGame(gameId);
		if (!game) {
			return res.status(404).json({
				success: false,
				error: `Game ${gameId} not found`
			});
		}
		
		// Check if the player already exists in the game
		if (game.players[playerId]) {
			// Player already exists, update their status
			game.players[playerId].active = true;
			game.players[playerId].lastSeen = Date.now();
			
			return res.json({
				success: true,
				message: `Player ${playerId} rejoined game ${gameId}`,
				gameState: game
			});
		}
		
		// Check if the game is full
		const playerCount = Object.keys(game.players).length;
		if (playerCount >= game.maxPlayers) {
			return res.status(400).json({
				success: false,
				error: 'Game is full'
			});
		}
		
		// Add the player to the game
		const result = gameManager.addPlayer(gameId, playerId);
		
		if (result.success) {
			return res.json({
				success: true,
				message: `Player ${playerId} joined game ${gameId}`,
				gameState: game
			});
		} else {
			return res.status(400).json({
				success: false,
				error: result.error
			});
		}
	} catch (error) {
		console.error('Error joining game:', error);
		return res.status(500).json({
			success: false,
			error: error.message
		});
	}
}

/**
 * Place a tetris piece
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
function placeTetrisPiece(req, res) {
	try {
		const { gameId, playerId, moveData } = req.body;
		
		// Check if the game exists
		const game = gameManager.getGame(gameId);
		if (!game) {
			return res.status(404).json({
				success: false,
				error: `Game ${gameId} not found`
			});
		}
		
		// Check if the player exists in the game
		if (!game.players[playerId]) {
			return res.status(404).json({
				success: false,
				error: `Player ${playerId} not found in game ${gameId}`
			});
		}
		
		// Place the tetris piece
		const result = gameManager.placeTetrisPiece(gameId, playerId, moveData);
		
		if (result.success) {
			// Get the updated game state
			const updatedGame = gameManager.getGame(gameId);
			
			return res.json({
				success: true,
				message: `Tetris piece placed successfully`,
				completedRows: result.completedRows,
				gameState: updatedGame
			});
		} else {
			return res.status(400).json({
				success: false,
				error: result.error
			});
		}
	} catch (error) {
		console.error('Error placing tetris piece:', error);
		return res.status(500).json({
			success: false,
			error: error.message
		});
	}
}

/**
 * Move a chess piece
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
function moveChessPiece(req, res) {
	try {
		const { gameId, playerId, moveData } = req.body;
		
		// Check if the game exists
		const game = gameManager.getGame(gameId);
		if (!game) {
			return res.status(404).json({
				success: false,
				error: `Game ${gameId} not found`
			});
		}
		
		// Check if the player exists in the game
		if (!game.players[playerId]) {
			return res.status(404).json({
				success: false,
				error: `Player ${playerId} not found in game ${gameId}`
			});
		}
		
		// Check if the player has any valid chess moves
		const hasValidMoves = gameManager.hasValidChessMoves(gameId, playerId);
		if (!hasValidMoves) {
			// Update the player's move type to tetromino
			game.players[playerId].currentMoveType = 'tetromino';
			
			return res.json({
				success: false,
				error: 'No valid chess moves available',
				skipToTetromino: true,
				gameState: game
			});
		}
		
		// Move the chess piece
		const result = gameManager.moveChessPiece(gameId, playerId, moveData);
		
		if (result.success) {
			// Get the updated game state
			const updatedGame = gameManager.getGame(gameId);
			
			return res.json({
				success: true,
				message: `Chess piece moved successfully`,
				capture: result.capture,
				gameState: updatedGame
			});
		} else {
			return res.status(400).json({
				success: false,
				error: result.error
			});
		}
	} catch (error) {
		console.error('Error moving chess piece:', error);
		return res.status(500).json({
			success: false,
			error: error.message
		});
	}
}

/**
 * Get game state
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
function getGameState(req, res) {
	try {
		const { gameId } = req.params;
		
		// Check if the game exists
		const game = gameManager.getGame(gameId);
		if (!game) {
			return res.status(404).json({
				success: false,
				error: `Game ${gameId} not found`
			});
		}
		
		return res.json({
			success: true,
			gameState: game
		});
	} catch (error) {
		console.error('Error getting game state:', error);
		return res.status(500).json({
			success: false,
			error: error.message
		});
	}
}

// Register the routes
router.get('/games', getGames);
router.post('/create', createGame);
router.post('/join', joinGame);
router.post('/move/tetromino', placeTetrisPiece);
router.post('/move/chess', moveChessPiece);
router.get('/game/:gameId', getGameState);

export default router; 