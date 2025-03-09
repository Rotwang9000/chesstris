/**
 * Player Controls Module
 * 
 * Contains functionality for player pause, resume, and cooldown management.
 * This is a modern ES module that centralizes player control functionality.
 */

// Mock game state for testing
let gameState = {
    players: []
};

/**
 * Get a player by ID
 * @param {string} playerId - The player's unique ID
 * @returns {Object|undefined} The player object or undefined if not found
 */
export function getPlayer(playerId) {
    return gameState?.players?.find(player => player.id === playerId);
}

/**
 * Get the remaining cooldown time for a player's pause
 * @param {string} playerId - The player's unique ID
 * @returns {number} The remaining cooldown time in milliseconds
 */
export function getPauseCooldownRemaining(playerId) {
    const player = getPlayer(playerId);
    if (!player || !player.pauseCooldown) {
        return 0;
    }
    const now = Date.now();
    const remaining = Math.max(0, player.pauseCooldown - now);
    return remaining;
}

/**
 * Check if a player is currently on pause cooldown
 * @param {string} playerId - The player's unique ID
 * @returns {boolean} True if the player is on cooldown, false otherwise
 */
export function isPlayerOnPauseCooldown(playerId) {
    return getPauseCooldownRemaining(playerId) > 0;
}

/**
 * Set a pause cooldown for a player
 * @param {string} playerId - The player's unique ID
 * @param {number} duration - The cooldown duration in milliseconds
 */
export function setPauseCooldown(playerId, duration) {
    const player = getPlayer(playerId);
    if (player) {
        player.pauseCooldown = Date.now() + duration;
    }
}

/**
 * Pause a player
 * @param {string} playerId - The player's unique ID
 * @returns {boolean} True if the player was paused, false otherwise
 */
export function handlePlayerPause(playerId) {
    const player = getPlayer(playerId);
    if (player && !isPlayerOnPauseCooldown(playerId)) {
        player.isPaused = true;
        // Set a cooldown period (e.g., 5 minutes = 300000 ms)
        setPauseCooldown(playerId, 300000);
        return true;
    }
    return false;
}

/**
 * Resume a paused player
 * @param {string} playerId - The player's unique ID
 * @returns {boolean} True if the player was resumed, false otherwise
 */
export function handlePlayerResume(playerId) {
    const player = getPlayer(playerId);
    if (player && player.isPaused) {
        player.isPaused = false;
        return true;
    }
    return false;
}

/**
 * Check if a player is paused
 * @param {string} playerId - The player's unique ID
 * @returns {boolean} True if the player is paused, false otherwise
 */
export function isPlayerPaused(playerId) {
    const player = getPlayer(playerId);
    return player ? !!player.isPaused : false;
}

/**
 * Set the game state (used for testing)
 * @param {Object} newState - The new game state
 */
export function setGameState(newState) {
    gameState = newState;
}

// Default export with all functions
export default {
    getPlayer,
    getPauseCooldownRemaining,
    isPlayerOnPauseCooldown,
    setPauseCooldown,
    handlePlayerPause,
    handlePlayerResume,
    isPlayerPaused,
    setGameState
}; 