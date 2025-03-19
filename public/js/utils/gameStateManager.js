/**
 * Game State Manager Utility
 *
 * Manages the game state and coordinates game logic
 */

import * as network from './network.js';
import * as sessionManager from './sessionManager.js';

// Game states
export const GAME_STATES = {
	LOADING: 'loading',
	MENU: 'menu',
	CONNECTING: 'connecting',
	WAITING: 'waiting',
	PLAYING: 'playing',
	PAUSED: 'paused',
	GAME_OVER: 'game_over'
};

// Game modes
export const GAME_MODES = {
	SINGLE_PLAYER: 'single_player',
	MULTIPLAYER: 'multiplayer',
	PRACTICE: 'practice',
	TUTORIAL: 'tutorial'
};

// Default game settings
const DEFAULT_SETTINGS = {
	gameMode: GAME_MODES.SINGLE_PLAYER,
	difficulty: 'normal',
	startLevel: 1,
	boardSize: { width: 10, height: 20 },
	renderMode: '3d'
};

// Game state
let currentState = GAME_STATES.LOADING;
let previousState = null;
let gameMode = GAME_MODES.SINGLE_PLAYER;
let gameId = null;
let playerId = null;
let playerName = null;
let gameData = null;
let settings = { ...DEFAULT_SETTINGS };
let stateChangeCallbacks = {};
let gameUpdateCallbacks = [];
let isInitialized = false;
let lastUpdateTime = 0;

/**
 * Initialize the game state manager
 * @param {Object} options - Configuration options
 * @returns {Promise<boolean>} Success status
 */
export async function init(options = {}) {
	try {
		if (isInitialized) {
			console.warn('Game state manager already initialized');
			return true;
		}
		
		console.log('Initializing game state manager...');
		
		// Apply custom settings if provided
		if (options.settings) {
			settings = { ...DEFAULT_SETTINGS, ...options.settings };
		}
		
		// Load player data from session
		playerId = sessionManager.getPlayerId();
		playerName = sessionManager.getPlayerName();
		
		// Set up network event handlers
		network.on('connect', handleConnect);
		network.on('disconnect', handleDisconnect);
		network.on('game_update', handleGameUpdate);
		network.on('player_joined', handlePlayerJoined);
		network.on('player_left', handlePlayerLeft);
		network.on('tetromino_placed', handleTetrominoPlaced);
		network.on('chess_piece_moved', handleChessPieceMoved);
		network.on('error', handleError);
		
		// Set initial state
		setState(GAME_STATES.MENU);
		
		isInitialized = true;
		console.log('Game state manager initialized');
		return true;
	} catch (error) {
		console.error('Error initializing game state manager:', error);
		return false;
	}
}

/**
 * Register a callback for a specific event
 * @param {string} event - Event name (e.g., 'stateChange')
 * @param {Function} callback - Callback function
 * @returns {boolean} Success status
 */
export function on(event, callback) {
	try {
		if (typeof callback !== 'function') {
			console.error('Callback must be a function');
			return false;
		}
		
		if (event === 'stateChange') {
			// Register for all state changes
			return onAnyStateChange(callback);
		}
		
		// For specific state changes
		if (Object.values(GAME_STATES).includes(event)) {
			if (!stateChangeCallbacks[event]) {
				stateChangeCallbacks[event] = [];
			}
			
			stateChangeCallbacks[event].push(callback);
			return true;
		}
		
		// For game update events
		if (event === 'update') {
			gameUpdateCallbacks.push(callback);
			return true;
		}
		
		console.warn(`Unknown event: ${event}`);
		return false;
	} catch (error) {
		console.error(`Error registering callback for ${event}:`, error);
		return false;
	}
}

/**
 * Get the current game state
 * @returns {string} Current game state
 */
export function getState() {
	return currentState;
}

/**
 * Alias for getState to maintain compatibility
 * @returns {string} Current game state
 */
export function getCurrentState() {
	return getState();
}

export function updateState(data) {
	gameData = data;
}

/**
 * Get the previous game state
 * @returns {string} Previous game state
 */
export function getPreviousState() {
	return previousState;
}

/**
 * Set the game state
 * @param {string} state - New game state
 * @param {Object} data - Additional data for the state change
 * @returns {boolean} Success status
 */
export function setState(state, data = {}) {
	try {
		if (!Object.values(GAME_STATES).includes(state)) {
			console.error(`Invalid game state: ${state}`);
			return false;
		}
		
		// Don't change if it's the same state
		if (state === currentState) {
			return true;
		}
		
		console.log(`Changing game state: ${currentState} -> ${state}`);
		
		// Store previous state
		previousState = currentState;
		
		// Update current state
		currentState = state;
		
		// Perform state-specific actions
		switch (state) {
			case GAME_STATES.CONNECTING:
				// Connect to server
				network.connect();
				break;
				
			case GAME_STATES.PLAYING:
				// Start game loop
				lastUpdateTime = Date.now();
				break;
				
			case GAME_STATES.PAUSED:
				// Pause game
				break;
				
			case GAME_STATES.GAME_OVER:
				// Handle game over
				sessionManager.recordGamePlayed({
					gameId,
					result: data.result || 'unknown',
					score: data.score || 0,
					level: data.level || 1,
					duration: data.duration || 0
				});
				break;
		}
		
		// Trigger state change callbacks
		triggerStateChangeCallbacks(state, previousState, data);
		
		return true;
	} catch (error) {
		console.error('Error setting game state:', error);
		return false;
	}
}

/**
 * Register a callback for a specific state change
 * @param {string} state - State to listen for
 * @param {Function} callback - Callback function
 * @returns {boolean} Success status
 */
export function onStateChange(state, callback) {
	if (typeof callback !== 'function') {
		console.error('Callback must be a function');
		return false;
	}
	
	if (!stateChangeCallbacks[state]) {
		stateChangeCallbacks[state] = [];
	}
	
	stateChangeCallbacks[state].push(callback);
	return true;
}

/**
 * Register a callback for any state change
 * @param {Function} callback - Callback function
 */
export function onAnyStateChange(callback) {
	onStateChange('any', callback);
}

/**
 * Register a callback for game updates
 * @param {Function} callback - Callback function
 */
export function onGameUpdate(callback) {
	gameUpdateCallbacks.push(callback);
}

/**
 * Start a new game
 * @param {Object} options - Game options
 * @returns {Promise<boolean>} Success status
 */
export async function startGame(options = {}) {
	try {
		console.log('Starting new game...');
		
		// Apply game options
		const gameOptions = {
			...settings,
			...options
		};
		
		// Set game mode
		gameMode = gameOptions.gameMode || GAME_MODES.SINGLE_PLAYER;
		
		// Connect to server if not already connected
		if (!network.isConnected()) {
			setState(GAME_STATES.CONNECTING);
			await new Promise(resolve => {
				const checkConnection = () => {
					if (network.isConnected()) {
						resolve();
					} else {
						setTimeout(checkConnection, 100);
					}
				};
				checkConnection();
			});
		}
		
		// Join or create game based on mode
		if (gameMode === GAME_MODES.SINGLE_PLAYER || gameMode === GAME_MODES.PRACTICE) {
			// Create a new game
			const result = await network.createGame(playerId, playerName, gameOptions);
			
			if (result.success) {
				gameId = result.gameId;
				console.log(`Created new game with ID: ${gameId}`);
			} else {
				console.error('Failed to create game:', result.message);
				return false;
			}
		} else {
			// Join existing game
			const targetGameId = gameOptions.gameId || 'default-game';
			const result = await network.joinGame(playerId, playerName, targetGameId);
			
			if (result.success) {
				gameId = result.gameId;
				console.log(`Joined game with ID: ${gameId}`);
			} else {
				console.error('Failed to join game:', result.message);
				return false;
			}
		}
		
		// Set state to playing
		setState(GAME_STATES.PLAYING);
		
		return true;
	} catch (error) {
		console.error('Error starting game:', error);
		return false;
	}
}

/**
 * Pause the game
 * @returns {boolean} Success status
 */
export function pauseGame() {
	try {
		if (currentState !== GAME_STATES.PLAYING) {
			console.warn('Cannot pause: game is not in playing state');
			return false;
		}
		
		setState(GAME_STATES.PAUSED);
		return true;
	} catch (error) {
		console.error('Error pausing game:', error);
		return false;
	}
}

/**
 * Resume the game
 * @returns {boolean} Success status
 */
export function resumeGame() {
	try {
		if (currentState !== GAME_STATES.PAUSED) {
			console.warn('Cannot resume: game is not paused');
			return false;
		}
		
		setState(GAME_STATES.PLAYING);
		return true;
	} catch (error) {
		console.error('Error resuming game:', error);
		return false;
	}
}

/**
 * End the current game
 * @param {Object} data - Game end data
 * @returns {boolean} Success status
 */
export function endGame(data = {}) {
	try {
		if (currentState !== GAME_STATES.PLAYING && currentState !== GAME_STATES.PAUSED) {
			console.warn('Cannot end: no active game');
			return false;
		}
		
		setState(GAME_STATES.GAME_OVER, data);
		return true;
	} catch (error) {
		console.error('Error ending game:', error);
		return false;
	}
}

/**
 * Get the current game data
 * @returns {Object} Game data
 */
export function getGameData() {
	return gameData;
}

/**
 * Get the current game settings
 * @returns {Object} Game settings
 */
export function getSettings() {
	return { ...settings };
}

/**
 * Update game settings
 * @param {Object} newSettings - New settings
 * @returns {boolean} Success status
 */
export function updateSettings(newSettings) {
	try {
		settings = { ...settings, ...newSettings };
		return true;
	} catch (error) {
		console.error('Error updating settings:', error);
		return false;
	}
}

/**
 * Get the current game mode
 * @returns {string} Game mode
 */
export function getGameMode() {
	return gameMode;
}

/**
 * Get the current game ID
 * @returns {string} Game ID
 */
export function getGameId() {
	return gameId;
}

/**
 * Get the player ID
 * @returns {string} Player ID
 */
export function getPlayerId() {
	return playerId;
}

/**
 * Get the player name
 * @returns {string} Player name
 */
export function getPlayerName() {
	return playerName;
}

/**
 * Set the player name
 * @param {string} name - New player name
 * @returns {boolean} Success status
 */
export function setPlayerName(name) {
	try {
		playerName = name;
		sessionManager.setPlayerName(name);
		return true;
	} catch (error) {
		console.error('Error setting player name:', error);
		return false;
	}
}

/**
 * Place a tetromino on the board
 * @param {Object} tetromino - Tetromino data
 * @param {Object} position - Position data
 * @returns {Promise<boolean>} Success status
 */
export async function placeTetromino(tetromino, position) {
	try {
		if (currentState !== GAME_STATES.PLAYING) {
			console.warn('Cannot place tetromino: game is not in playing state');
			return false;
		}
		
		const result = await network.placeTetromino(playerId, tetromino, position);
		return result.success;
	} catch (error) {
		console.error('Error placing tetromino:', error);
		return false;
	}
}

/**
 * Move a chess piece
 * @param {string} pieceId - Piece ID
 * @param {Object} fromPosition - Starting position
 * @param {Object} toPosition - Target position
 * @returns {Promise<boolean>} Success status
 */
export async function moveChessPiece(pieceId, fromPosition, toPosition) {
	try {
		if (currentState !== GAME_STATES.PLAYING) {
			console.warn('Cannot move chess piece: game is not in playing state');
			return false;
		}
		
		const result = await network.moveChessPiece(playerId, pieceId, fromPosition, toPosition);
		return result.success;
	} catch (error) {
		console.error('Error moving chess piece:', error);
		return false;
	}
}

/**
 * Clean up resources
 */
export function cleanup() {
	try {
		console.log('Cleaning up game state manager...');
		
		// Remove network event handlers
		network.off('connect', handleConnect);
		network.off('disconnect', handleDisconnect);
		network.off('game_update', handleGameUpdate);
		network.off('player_joined', handlePlayerJoined);
		network.off('player_left', handlePlayerLeft);
		network.off('tetromino_placed', handleTetrominoPlaced);
		network.off('chess_piece_moved', handleChessPieceMoved);
		network.off('error', handleError);
		
		// Reset state
		currentState = GAME_STATES.LOADING;
		previousState = null;
		gameMode = GAME_MODES.SINGLE_PLAYER;
		gameId = null;
		gameData = null;
		settings = { ...DEFAULT_SETTINGS };
		stateChangeCallbacks = {};
		gameUpdateCallbacks = [];
		isInitialized = false;
		
		console.log('Game state manager cleaned up');
	} catch (error) {
		console.error('Error cleaning up game state manager:', error);
	}
}

// Event handlers

/**
 * Handle connection to server
 */
function handleConnect() {
	console.log('Connected to server');
	
	// If we were connecting, move to menu state
	if (currentState === GAME_STATES.CONNECTING) {
		setState(GAME_STATES.MENU);
	}
}

/**
 * Handle disconnection from server
 */
function handleDisconnect() {
	console.log('Disconnected from server');
	
	// If we were playing, move to menu state
	if (currentState === GAME_STATES.PLAYING || currentState === GAME_STATES.PAUSED) {
		setState(GAME_STATES.MENU, { reason: 'disconnected' });
	}
}

/**
 * Handle game update from server
 * @param {Object} data - Game update data
 */
function handleGameUpdate(data) {
	// Update game data
	gameData = data;
	lastUpdateTime = Date.now();
	
	// Trigger game update callbacks
	for (const callback of gameUpdateCallbacks) {
		try {
			callback(gameData);
		} catch (error) {
			console.error('Error in game update callback:', error);
		}
	}
}

/**
 * Handle player joined event
 * @param {Object} data - Player data
 */
function handlePlayerJoined(data) {
	console.log(`Player joined: ${data.username} (${data.playerId})`);
	
	// Update game data if available
	if (gameData && gameData.players) {
		gameData.players[data.playerId] = {
			id: data.playerId,
			username: data.username,
			isActive: true
		};
	}
}

/**
 * Handle player left event
 * @param {Object} data - Player data
 */
function handlePlayerLeft(data) {
	console.log(`Player left: ${data.username} (${data.playerId})`);
	
	// Update game data if available
	if (gameData && gameData.players && gameData.players[data.playerId]) {
		gameData.players[data.playerId].isActive = false;
	}
}

/**
 * Handle tetromino placed event
 * @param {Object} data - Tetromino data
 */
function handleTetrominoPlaced(data) {
	console.log(`Tetromino placed by player ${data.playerId}`);
	
	// Game data will be updated via game_update event
}

/**
 * Handle chess piece moved event
 * @param {Object} data - Chess piece data
 */
function handleChessPieceMoved(data) {
	console.log(`Chess piece ${data.pieceId} moved by player ${data.playerId}`);
	
	// Game data will be updated via game_update event
}

/**
 * Handle error from server
 * @param {Object} data - Error data
 */
function handleError(data) {
	console.error('Server error:', data.message);
}

/**
 * Trigger state change callbacks
 * @param {string} newState - New state
 * @param {string} oldState - Old state
 * @param {Object} data - Additional data
 */
function triggerStateChangeCallbacks(newState, oldState, data) {
	// Trigger specific state callbacks
	if (stateChangeCallbacks[newState]) {
		for (const callback of stateChangeCallbacks[newState]) {
			try {
				callback(oldState, data);
			} catch (error) {
				console.error(`Error in state change callback for ${newState}:`, error);
			}
		}
	}
	
	// Trigger 'any' state callbacks
	if (stateChangeCallbacks.any) {
		for (const callback of stateChangeCallbacks.any) {
			try {
				callback(newState, oldState, data);
			} catch (error) {
				console.error('Error in any state change callback:', error);
			}
		}
	}
} 