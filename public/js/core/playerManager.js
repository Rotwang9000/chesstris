/**
 * Player Manager
 *
 * Handles player creation, management, and state.
 */

import { PLAYER_COLORS, GAME_CONSTANTS } from './constants.js';
import * as SessionManager from '../utils/sessionManager.js';

// Players collection
let players = {};

// Current player ID
let currentPlayerId = null;

/**
 * Initialize the player manager
 * @returns {Promise<void>}
 */
export async function init() {
	try {
		console.log('Initializing player manager');
		
		// Reset players
		players = {};
		
		// Create local player from session
		const session = SessionManager.initSession();
		const localPlayerId = session.playerId;
		
		// Create player
		createPlayer(localPlayerId, session.playerName);
		
		// Set as current player
		currentPlayerId = localPlayerId;
		
		console.log('Player manager initialized');
	} catch (error) {
		console.error('Error initializing player manager:', error);
		throw error;
	}
}

/**
 * Create a new player
 * @param {string} id - Player ID
 * @param {string} name - Player name
 * @returns {Object} - Player object
 */
export function createPlayer(id, name = 'Player') {
	try {
		// Check if player already exists
		if (players[id]) {
			console.log(`Player ${id} already exists`);
			return players[id];
		}
		
		// Get next available color
		const playerCount = Object.keys(players).length;
		const colorIndex = playerCount % PLAYER_COLORS.length;
		
		// Create player
		const player = {
			id,
			name,
			color: PLAYER_COLORS[colorIndex],
			score: 0,
			linesCleared: 0,
			piecesCaptured: 0,
			level: 1,
			isActive: true,
			isReady: false,
			resources: {
				tetrominos: 0,
				chessPieces: 0
			}
		};
		
		// Add to players collection
		players[id] = player;
		
		console.log(`Player created: ${name} (${id})`);
		
		return player;
	} catch (error) {
		console.error('Error creating player:', error);
		throw error;
	}
}

/**
 * Get player by ID
 * @param {string} id - Player ID
 * @returns {Object|null} - Player object or null if not found
 */
export function getPlayerById(id) {
	try {
		return players[id] || null;
	} catch (error) {
		console.error('Error getting player by ID:', error);
		return null;
	}
}

/**
 * Get player index
 * @param {string} id - Player ID
 * @returns {number} - Player index (0-based) or -1 if not found
 */
export function getPlayerIndex(id) {
	try {
		const playerIds = Object.keys(players);
		return playerIds.indexOf(id);
	} catch (error) {
		console.error('Error getting player index:', error);
		return -1;
	}
}

/**
 * Get all players
 * @returns {Array} - Array of player objects
 */
export function getAllPlayers() {
	try {
		return Object.values(players);
	} catch (error) {
		console.error('Error getting all players:', error);
		return [];
	}
}

/**
 * Get active players
 * @returns {Array} - Array of active player objects
 */
export function getActivePlayers() {
	try {
		return Object.values(players).filter(player => player.isActive);
	} catch (error) {
		console.error('Error getting active players:', error);
		return [];
	}
}

/**
 * Get current player
 * @returns {Object|null} - Current player object or null if none
 */
export function getCurrentPlayer() {
	try {
		return players[currentPlayerId] || null;
	} catch (error) {
		console.error('Error getting current player:', error);
		return null;
	}
}

/**
 * Set current player
 * @param {string} id - Player ID
 * @returns {Object|null} - Current player object or null if not found
 */
export function setCurrentPlayer(id) {
	try {
		if (!players[id]) {
			console.error(`Player ${id} not found`);
			return null;
		}
		
		currentPlayerId = id;
		return players[id];
	} catch (error) {
		console.error('Error setting current player:', error);
		return null;
	}
}

/**
 * Update player score
 * @param {string} id - Player ID
 * @param {number} score - New score
 * @returns {Object|null} - Updated player object or null if not found
 */
export function updatePlayerScore(id, score) {
	try {
		if (!players[id]) {
			console.error(`Player ${id} not found`);
			return null;
		}
		
		players[id].score = score;
		
		// Update level based on lines cleared
		players[id].level = Math.floor(players[id].linesCleared / 10) + 1;
		
		return players[id];
	} catch (error) {
		console.error('Error updating player score:', error);
		return null;
	}
}

/**
 * Increment lines cleared
 * @param {string} id - Player ID
 * @param {number} lines - Number of lines cleared
 * @returns {Object|null} - Updated player object or null if not found
 */
export function incrementLinesCleared(id, lines = 1) {
	try {
		if (!players[id]) {
			console.error(`Player ${id} not found`);
			return null;
		}
		
		players[id].linesCleared += lines;
		
		// Update level based on lines cleared
		players[id].level = Math.floor(players[id].linesCleared / 10) + 1;
		
		return players[id];
	} catch (error) {
		console.error('Error incrementing lines cleared:', error);
		return null;
	}
}

/**
 * Increment pieces captured
 * @param {string} id - Player ID
 * @param {number} pieces - Number of pieces captured
 * @returns {Object|null} - Updated player object or null if not found
 */
export function incrementPiecesCaptured(id, pieces = 1) {
	try {
		if (!players[id]) {
			console.error(`Player ${id} not found`);
			return null;
		}
		
		players[id].piecesCaptured += pieces;
		
		return players[id];
	} catch (error) {
		console.error('Error incrementing pieces captured:', error);
		return null;
	}
}

/**
 * Update player resources
 * @param {string} id - Player ID
 * @param {string} resourceType - Resource type ('tetrominos' or 'chessPieces')
 * @param {number} amount - Amount to add (can be negative)
 * @returns {Object|null} - Updated player object or null if not found
 */
export function updatePlayerResource(id, resourceType, amount) {
	try {
		if (!players[id]) {
			console.error(`Player ${id} not found`);
			return null;
		}
		
		if (!players[id].resources[resourceType] && players[id].resources[resourceType] !== 0) {
			console.error(`Resource type ${resourceType} not found`);
			return null;
		}
		
		players[id].resources[resourceType] += amount;
		
		// Ensure resource doesn't go below 0
		if (players[id].resources[resourceType] < 0) {
			players[id].resources[resourceType] = 0;
		}
		
		return players[id];
	} catch (error) {
		console.error('Error updating player resource:', error);
		return null;
	}
}

/**
 * Set player active state
 * @param {string} id - Player ID
 * @param {boolean} isActive - Whether player is active
 * @returns {Object|null} - Updated player object or null if not found
 */
export function setPlayerActive(id, isActive) {
	try {
		if (!players[id]) {
			console.error(`Player ${id} not found`);
			return null;
		}
		
		players[id].isActive = isActive;
		
		return players[id];
	} catch (error) {
		console.error('Error setting player active state:', error);
		return null;
	}
}

/**
 * Set player ready state
 * @param {string} id - Player ID
 * @param {boolean} isReady - Whether player is ready
 * @returns {Object|null} - Updated player object or null if not found
 */
export function setPlayerReady(id, isReady) {
	try {
		if (!players[id]) {
			console.error(`Player ${id} not found`);
			return null;
		}
		
		players[id].isReady = isReady;
		
		return players[id];
	} catch (error) {
		console.error('Error setting player ready state:', error);
		return null;
	}
}

/**
 * Eliminate a player
 * @param {string} id - Player ID
 * @returns {boolean} - Whether player was eliminated
 */
export function eliminatePlayer(id) {
	try {
		if (!players[id]) {
			console.error(`Player ${id} not found`);
			return false;
		}
		
		// Set player as inactive
		players[id].isActive = false;
		
		console.log(`Player ${id} eliminated`);
		
		return true;
	} catch (error) {
		console.error('Error eliminating player:', error);
		return false;
	}
}

/**
 * Reset the player manager
 */
export function reset() {
	init();
}

/**
 * Update player states
 * @param {number} deltaTime - Time since last update in milliseconds
 */
export function update(deltaTime) {
	try {
		// Update player states if needed
		// This is a placeholder for future player animations or time-based effects
		
		// For now, we don't need to do anything here
		// But the function needs to exist to prevent errors
	} catch (error) {
		console.error('Error updating players:', error);
	}
}
