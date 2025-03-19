/**
 * Player Pause System
 * 
 * This module provides functionality for players to temporarily pause their game
 * for up to 15 minutes. During this time, their pieces cannot be captured and
 * their cells won't be cleared. If a player doesn't return within 15 minutes,
 * their main island is removed.
 */

const constants = require('../constants');
const PLAYER_PAUSE_MAX_DURATION = constants.PLAYER_PAUSE_MAX_DURATION || 15 * 60 * 1000;

// Map to track paused players and their pause start times
const pausedPlayers = new Map();

/**
 * Pause a player's game
 * @param {string} playerId - The ID of the player to pause
 * @returns {boolean} - Whether the pause was successful
 */
function handlePlayerPause(playerId) {
	// Check if player is already paused
	if (pausedPlayers.has(playerId)) {
		return false;
	}
	
	// Set the pause start time
	pausedPlayers.set(playerId, Date.now());
	return true;
}

/**
 * Resume a player's game
 * @param {string} playerId - The ID of the player to resume
 * @returns {boolean} - Whether the resume was successful
 */
function handlePlayerResume(playerId) {
	// Check if player is paused
	if (!pausedPlayers.has(playerId)) {
		return false;
	}
	
	// Remove the player from the paused list
	pausedPlayers.delete(playerId);
	return true;
}

/**
 * Check if a player is currently paused
 * @param {string} playerId - The ID of the player to check
 * @returns {boolean} - Whether the player is paused
 */
function isPlayerPaused(playerId) {
	return pausedPlayers.has(playerId);
}

/**
 * Get all currently paused players
 * @returns {Array<string>} - Array of paused player IDs
 */
function getPausedPlayers() {
	return Array.from(pausedPlayers.keys());
}

/**
 * Get the remaining pause time for a player in milliseconds
 * @param {string} playerId - The ID of the player
 * @returns {number} - Remaining pause time in milliseconds, or 0 if not paused
 */
function getPauseTimeRemaining(playerId) {
	if (!pausedPlayers.has(playerId)) {
		return 0;
	}
	
	const pauseStartTime = pausedPlayers.get(playerId);
	const elapsed = Date.now() - pauseStartTime;
	const remaining = PLAYER_PAUSE_MAX_DURATION - elapsed;
	
	return Math.max(0, remaining);
}

/**
 * Check for paused players who have exceeded their maximum pause time
 * @returns {Array<string>} - Array of player IDs who have timed out
 */
function getTimedOutPlayers() {
	const timedOutPlayers = [];
	
	pausedPlayers.forEach((pauseStartTime, playerId) => {
		const elapsed = Date.now() - pauseStartTime;
		if (elapsed >= PLAYER_PAUSE_MAX_DURATION) {
			timedOutPlayers.push(playerId);
		}
	});
	
	return timedOutPlayers;
}

/**
 * Handle a player who has timed out (exceeded max pause duration)
 * @param {string} playerId - The ID of the player who timed out
 */
function handlePlayerTimeout(playerId) {
	// Remove the player from the paused list
	pausedPlayers.delete(playerId);
	
	// The actual handling of removing the player's island and
	// reassigning cells will be done in the GameManager
}

module.exports = {
	handlePlayerPause,
	handlePlayerResume,
	isPlayerPaused,
	getPausedPlayers,
	getPauseTimeRemaining,
	getTimedOutPlayers,
	handlePlayerTimeout
}; 