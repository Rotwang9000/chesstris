/**
 * Game Manager Module
 * 
 * Handles the overall game flow, including game initialization,
 * game loop, scoring, and game state management.
 */

import { v4 as uuidv4 } from '../utils/uuid.js';
import * as GameState from './gameState.js';
import * as PlayerManager from './playerManager.js';
import * as TetrominoManager from './tetrominoManager.js';
import * as Constants from './constants.js';

// Game loop variables
let gameLoopInterval = null;
let lastUpdateTime = 0;
let gameSpeed = 1000; // ms per tick
let isPaused = false;
let gameId = null;

/**
 * Initialize a new game
 * @param {Object} options - Game options
 * @returns {Object} The initialized game state
 */
export function initGame(options = {}) {
	// Clear any existing game loop
	if (gameLoopInterval) {
		clearInterval(gameLoopInterval);
	}
	
	// Generate a new game ID
	gameId = uuidv4();
	
	// Initialize game state
	const gameState = GameState.initGameState({
		width: options.width || Constants.INITIAL_BOARD_WIDTH,
		height: options.height || Constants.INITIAL_BOARD_HEIGHT,
		gameId
	});
	
	// Set game speed
	gameSpeed = options.speed || 1000;
	
	// Reset game variables
	isPaused = false;
	lastUpdateTime = Date.now();
	
	// Spawn the first tetromino
	TetrominoManager.spawnTetromino();
	
	// Start the game loop
	startGameLoop();
	
	return gameState;
}

/**
 * Start the game loop
 */
function startGameLoop() {
	if (gameLoopInterval) {
		clearInterval(gameLoopInterval);
	}
	
	gameLoopInterval = setInterval(() => {
		if (!isPaused) {
			update();
		}
	}, 100); // Run at 10 FPS, but only update based on game speed
}

/**
 * Update the game state
 */
function update() {
	const currentTime = Date.now();
	const deltaTime = currentTime - lastUpdateTime;
	
	// Only move the tetromino down if enough time has passed
	if (deltaTime >= gameSpeed) {
		// Move the tetromino down
		TetrominoManager.moveTetromino('down');
		
		// Degrade home zones
		const gameState = GameState.getGameState();
		if (currentTime - gameState.lastDegradation >= Constants.DEGRADATION_INTERVAL) {
			GameState.degradeHomeZones();
			gameState.lastDegradation = currentTime;
		}
		
		// Take a snapshot of the game state for replay
		takeGameStateSnapshot();
		
		// Reset the timer
		lastUpdateTime = currentTime;
	}
	
	// Check for game over
	if (TetrominoManager.isGameOver()) {
		endGame();
	}
}

/**
 * Take a snapshot of the game state for replay
 */
function takeGameStateSnapshot() {
	const gameState = GameState.getGameState();
	const currentTime = Date.now();
	
	// Only take a snapshot every 5 seconds
	if (!gameState.lastSnapshot || currentTime - gameState.lastSnapshot >= 5000) {
		// Create a simplified snapshot of the game state
		const snapshot = {
			timestamp: currentTime,
			board: { ...gameState.board },
			players: { ...gameState.players },
			fallingPiece: gameState.fallingPiece ? { ...gameState.fallingPiece } : null
		};
		
		// Store the snapshot (in a real implementation, this would be sent to the server)
		// For now, we'll just log it
		console.log('Game state snapshot taken', snapshot);
		
		// Update the last snapshot time
		gameState.lastSnapshot = currentTime;
	}
}

/**
 * Pause the game
 * @returns {boolean} The new pause state
 */
export function pauseGame() {
	isPaused = true;
	return isPaused;
}

/**
 * Resume the game
 * @returns {boolean} The new pause state
 */
export function resumeGame() {
	isPaused = false;
	lastUpdateTime = Date.now(); // Reset the timer to prevent sudden drops
	return isPaused;
}

/**
 * Toggle the game pause state
 * @returns {boolean} The new pause state
 */
export function togglePause() {
	return isPaused ? resumeGame() : pauseGame();
}

/**
 * End the current game
 * @returns {Object} The final game state
 */
export function endGame() {
	// Stop the game loop
	if (gameLoopInterval) {
		clearInterval(gameLoopInterval);
		gameLoopInterval = null;
	}
	
	// Set the game as paused
	isPaused = true;
	
	// Get the final game state
	const gameState = GameState.getGameState();
	
	// Determine the winner
	const winner = PlayerManager.getWinner();
	
	// Create the final game result
	const gameResult = {
		gameId,
		endTime: new Date().toISOString(),
		winner: winner ? {
			id: winner.id,
			username: winner.username,
			score: winner.score
		} : null,
		players: Object.values(gameState.players).map(player => ({
			id: player.id,
			username: player.username,
			score: player.score,
			remainingPieces: player.pieces.length
		}))
	};
	
	// In a real implementation, this would be sent to the server
	console.log('Game ended', gameResult);
	
	return gameResult;
}

/**
 * Restart the game with the same players
 * @returns {Object} The new game state
 */
export function restartGame() {
	// Get the current players
	const gameState = GameState.getGameState();
	const players = Object.values(gameState.players);
	
	// Initialize a new game
	initGame();
	
	// Add the players back
	for (const player of players) {
		PlayerManager.addPlayer(player.id, player.username, { userId: player.userId });
	}
	
	return GameState.getGameState();
}

/**
 * Set the game speed
 * @param {number} speed - The new game speed in ms per tick
 * @returns {number} The new game speed
 */
export function setGameSpeed(speed) {
	gameSpeed = Math.max(100, Math.min(2000, speed));
	return gameSpeed;
}

/**
 * Get the current game ID
 * @returns {string} The current game ID
 */
export function getGameId() {
	return gameId;
}

/**
 * Check if the game is paused
 * @returns {boolean} Whether the game is paused
 */
export function isGamePaused() {
	return isPaused;
}

/**
 * Get the current game speed
 * @returns {number} The current game speed in ms per tick
 */
export function getGameSpeed() {
	return gameSpeed;
}

/**
 * Check if a player can make any valid chess moves
 * @param {string} playerId - The player ID
 * @returns {boolean} Whether the player can make any valid moves
 */
export function canPlayerMakeChessMoves(playerId) {
	const gameState = GameState.getGameState();
	const player = gameState.players[playerId];
	
	if (!player) {
		return false;
	}
	
	// Check each piece to see if it has any valid moves
	for (const piece of player.pieces) {
		const validMoves = GameState.getValidMoves(piece, playerId);
		if (validMoves && validMoves.length > 0) {
			return true;
		}
	}
	
	// No valid moves found
	return false;
}

/**
 * Handle player action based on game state
 * @param {string} playerId - The player ID
 * @param {string} action - The action type ('move_chess_piece', 'place_tetris')
 * @param {Object} data - The action data
 * @returns {Object} The result of the action
 */
export function handlePlayerAction(playerId, action, data) {
	// Check if the player exists
	const player = PlayerManager.getPlayer(playerId);
	if (!player) {
		return { success: false, error: 'Player not found' };
	}
	
	// If the player can't make chess moves, only allow tetris placement
	const canMakeChessMoves = canPlayerMakeChessMoves(playerId);
	
	switch (action) {
		case 'move_chess_piece':
			// Only allow chess movement if the player can make valid moves
			if (!canMakeChessMoves) {
				return { 
					success: false, 
					error: 'No valid chess moves available. Place tetris pieces first to build the board.'
				};
			}
			return PlayerManager.movePiece(data.pieceId, data.targetX, data.targetY, playerId);
			
		case 'place_tetris':
			// Always allow tetris placement
			return TetrominoManager.placeTetrisPiece(data.tetromino, data.x, data.y, playerId);
			
		default:
			return { success: false, error: 'Invalid action' };
	}
}

export default {
	initGame,
	pauseGame,
	resumeGame,
	togglePause,
	endGame,
	restartGame,
	setGameSpeed,
	getGameId,
	isGamePaused,
	getGameSpeed,
	canPlayerMakeChessMoves,
	handlePlayerAction
}; 