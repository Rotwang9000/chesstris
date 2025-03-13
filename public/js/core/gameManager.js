/**
 * Game Manager
 * 
 * Handles the core game logic, state management, and game loop.
 */

import * as PlayerManager from './playerManager.js';
import * as TetrominoManager from './tetrominoManager.js';
import * as ChessPieceManager from './chessPieceManager.js';
import * as Network from '../utils/network.js';
import { GAME_CONSTANTS } from './constants.js';

// Game state
let isInitialized = false;
let isRunning = false;
let isPaused = false;
let isGameOver = false;
let winner = null;
let lastUpdateTime = 0;
let lastNetworkUpdate = 0;
let isOfflineMode = false;
let _homeZoneInitialized = false;

// Game configuration
let config = {
	playerId: null,
	gameId: null,
	offline: false,
	difficulty: 'normal',
	boardWidth: GAME_CONSTANTS.BOARD_WIDTH,
	boardHeight: GAME_CONSTANTS.BOARD_HEIGHT
};

/**
 * Initialize the game
 * @param {Object} options - Game initialization options
 * @returns {Promise<void>}
 */
export async function initGame(options = {}) {
	try {
		console.log('Initializing game with options:', options);
		
		// Update config
		config = { ...config, ...options };
		isOfflineMode = options.offline || false;
		
		// Initialize managers
		await PlayerManager.init();
		await TetrominoManager.init();
		await ChessPieceManager.init();
		
		// Initialize game state
		isInitialized = true;
		isRunning = false;
		isPaused = false;
		isGameOver = false;
		winner = null;
		lastUpdateTime = 0;
		lastNetworkUpdate = 0;
		_homeZoneInitialized = false;
		
		console.log('Game initialized successfully');
	} catch (error) {
		console.error('Error initializing game:', error);
		throw error;
	}
}

/**
 * Start the game
 * @param {string} gameId - Optional game ID to join
 * @returns {Promise<boolean>}
 */
export async function startGame(gameId = null) {
	try {
		console.log('Starting game...');
		
		if (!isInitialized) {
			throw new Error('Game not initialized');
		}
		
		// Update game ID if provided
		if (gameId) {
			config.gameId = gameId;
		}
		
		// Start game loop
		isRunning = true;
		isPaused = false;
		lastUpdateTime = performance.now();
		
		// Initialize home zones if needed
		if (!_homeZoneInitialized) {
			await initHomeZones();
		}
		
		console.log('Game started successfully');
		return true;
	} catch (error) {
		console.error('Error starting game:', error);
		throw error;
	}
}

/**
 * Update the game state
 * @param {number} timestamp - Current timestamp
 */
export function update(timestamp) {
	try {
		if (!isInitialized) {
			console.warn('Game not initialized, cannot update');
			return;
		}
		
		if (!isRunning || isPaused) {
			return;
		}
		
		// Calculate delta time
		const deltaTime = timestamp - lastUpdateTime;
		lastUpdateTime = timestamp;
		
		// Update game logic
		TetrominoManager.update(deltaTime);
		ChessPieceManager.update(deltaTime);
		
		// Update home zones
		updateHomeZones();
		
		// Update player scores in offline mode
		if (isOfflineMode) {
			updateOfflineScores();
		}
		
		// Render the game
		render();
		
		// Emit game state update if online
		if (!isOfflineMode && timestamp - lastNetworkUpdate > 1000) {
			emitGameStateUpdate();
			lastNetworkUpdate = timestamp;
		}
	} catch (error) {
		console.error('Error in game update:', error);
	}
}

/**
 * Render the game
 */
function render() {
	try {
		// Update UI elements
		updateScoreDisplay();
		updateResourceDisplay();
		
		// Update debug panel if it exists
		if (window.DebugPanel) {
			window.DebugPanel.update({
				fps: calculateFPS(),
				isRunning,
				isPaused,
				isGameOver,
				winner,
				playerId: config.playerId,
				gameId: config.gameId
			});
		}
	} catch (error) {
		console.error('Error in game render:', error);
	}
}

/**
 * Initialize home zones
 */
async function initHomeZones() {
	try {
		if (_homeZoneInitialized) {
			return;
		}
		
		// Initialize home zones for each player
		const players = PlayerManager.getAllPlayers();
		for (const player of players) {
			await ChessPieceManager.initHomeZone(player.id);
		}
		
		_homeZoneInitialized = true;
	} catch (error) {
		console.error('Error initializing home zones:', error);
		throw error;
	}
}

/**
 * Update home zones
 */
function updateHomeZones() {
	try {
		if (!_homeZoneInitialized) {
			return;
		}
		
		// Update home zones for each player
		const players = PlayerManager.getAllPlayers();
		for (const player of players) {
			ChessPieceManager.updateHomeZone(player.id);
		}
	} catch (error) {
		console.error('Error updating home zones:', error);
	}
}

/**
 * Update offline scores
 */
function updateOfflineScores() {
	try {
		const players = PlayerManager.getAllPlayers();
		for (const player of players) {
			// Update score based on lines cleared and pieces captured
			const score = calculatePlayerScore(player);
			PlayerManager.updatePlayerScore(player.id, score);
		}
	} catch (error) {
		console.error('Error updating offline scores:', error);
	}
}

/**
 * Calculate player score
 * @param {Object} player - Player object
 * @returns {number} - Calculated score
 */
function calculatePlayerScore(player) {
	try {
		let score = 0;
		
		// Add points for lines cleared
		score += player.linesCleared * 100;
		
		// Add points for pieces captured
		score += player.piecesCaptured * 50;
		
		// Cap score at 100
		return Math.min(score, 100);
	} catch (error) {
		console.error('Error calculating player score:', error);
		return 0;
	}
}

/**
 * Update score display
 */
function updateScoreDisplay() {
	try {
		const scoreElement = document.getElementById('score-display');
		if (scoreElement) {
			const player = PlayerManager.getPlayer(config.playerId);
			if (player) {
				scoreElement.textContent = `Score: ${player.score}`;
			}
		}
	} catch (error) {
		console.error('Error updating score display:', error);
	}
}

/**
 * Update resource display
 */
function updateResourceDisplay() {
	try {
		const resourceElement = document.getElementById('resource-display');
		if (resourceElement) {
			const player = PlayerManager.getPlayer(config.playerId);
			if (player) {
				resourceElement.textContent = `Resources: ${player.resources}`;
			}
		}
	} catch (error) {
		console.error('Error updating resource display:', error);
	}
}

/**
 * Calculate current FPS
 * @returns {number} - Current FPS
 */
function calculateFPS() {
	try {
		const now = performance.now();
		const delta = now - lastUpdateTime;
		return Math.round(1000 / delta);
	} catch (error) {
		console.error('Error calculating FPS:', error);
		return 0;
	}
}

/**
 * Emit game state update
 */
function emitGameStateUpdate() {
	try {
		if (!isOfflineMode && Network.isConnected()) {
			const gameState = {
				gameId: config.gameId,
				playerId: config.playerId,
				board: ChessPieceManager.getBoard(),
				fallingPiece: TetrominoManager.getFallingPiece(),
				homeZones: ChessPieceManager.getHomeZones(),
				players: PlayerManager.getAllPlayers(),
				isPaused,
				isGameOver,
				winner
			};
			
			Network.emit('gameStateUpdate', gameState);
		}
	} catch (error) {
		console.error('Error emitting game state update:', error);
	}
}

/**
 * Pause the game
 */
export function pauseGame() {
	isPaused = true;
}

/**
 * Resume the game
 */
export function resumeGame() {
	isPaused = false;
}

/**
 * Check if game is paused
 * @returns {boolean} - Whether the game is paused
 */
export function isGamePaused() {
	return isPaused;
}

/**
 * Check if game is running
 * @returns {boolean} - Whether the game is running
 */
export function isGameRunning() {
	return isRunning;
}

/**
 * Check if game is over
 * @returns {boolean} - Whether the game is over
 */
export function isGameOver() {
	return isGameOver;
}

/**
 * Get the winner
 * @returns {string|null} - The winner's player ID or null
 */
export function getWinner() {
	return winner;
}

/**
 * Get the current game state
 * @returns {Object} - The current game state
 */
export function getGameState() {
	return {
		isInitialized,
		isRunning,
		isPaused,
		isGameOver,
		winner,
		playerId: config.playerId,
		gameId: config.gameId,
		offline: isOfflineMode,
		board: ChessPieceManager.getBoard(),
		fallingPiece: TetrominoManager.getFallingPiece(),
		homeZones: ChessPieceManager.getHomeZones(),
		players: PlayerManager.getAllPlayers()
	};
}
