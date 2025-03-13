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

// Add a method to check if gameManager exists
export function gameManagerExists() {
	return !!gameManager;
}

export default router; 