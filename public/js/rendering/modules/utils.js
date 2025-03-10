/**
 * Renderer Utilities Module
 * Contains shared utility functions used across the rendering system
 */

import * as THREE from '../../utils/three.js';
import { Constants } from '../../config/constants.js';

/**
 * Validates geometry parameters to ensure they're not NaN or invalid values
 * @param {Object} params - The parameters to validate
 * @returns {Object} - The validated parameters
 */
export function validateGeometryParams(params) {
	const validated = {};
	for (const key in params) {
		let value = params[key];
		if (isNaN(value) || value === undefined || value === null) {
			console.warn(`Invalid geometry parameter: ${key} = ${value}, using fallback`);
			value = key.includes('radius') ? 0.2 : 
				  key.includes('height') ? 0.5 : 
				  key.includes('width') ? 0.5 : 
				  key.includes('depth') ? 0.5 : 0.2;
		}
		validated[key] = value;
	}
	return validated;
}

/**
 * Calculates the floating height for a given position
 * Ensures the result is never NaN
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @returns {number} - The calculated height
 */
export function getFloatingHeight(x, z) {
	// Add some gentle height variation based on position
	// This creates a subtle rolling hills effect
	if (isNaN(x) || isNaN(z)) {
		console.warn(`Invalid coordinates passed to getFloatingHeight: x=${x}, z=${z}`);
		return 0;
	}
	
	const baseHeight = 0;
	const variation = Math.sin(x * 0.5) * Math.cos(z * 0.5) * 0.2;
	
	const result = baseHeight + variation;
	
	// Validate result to avoid NaN propagation
	if (isNaN(result)) {
		console.warn(`getFloatingHeight calculated NaN: x=${x}, z=${z}, variation=${variation}`);
		return 0;
	}
	
	return result;
}

/**
 * Creates a pseudorandom number generator with a seed
 * @param {number} seed - The seed for the random number generator
 * @returns {Function} - A function that generates pseudorandom numbers
 */
export function createPseudoRandomGenerator(seed) {
	return (multiplier = 1, offset = 0) => {
		const val = ((seed + offset) * 9301 + 49297) % 233280;
		return (val / 233280) * multiplier;
	};
}

/**
 * Checks if the player can make chess moves
 * @param {Object} gameState - The current game state
 * @param {Object} sessionData - The current session data
 * @returns {boolean} - Whether the player can make chess moves
 */
export function canPlayerMakeChessMoves(gameState, sessionData) {
	// Get the current player ID from the session
	if (!sessionData || !sessionData.playerId) {
		return false;
	}
	const playerId = sessionData.playerId;
	
	// If no game state or player, return false
	if (!gameState || !playerId) {
		return false;
	}
	
	// Check if the player exists in the game and has any pieces
	const player = gameState.players[playerId];
	if (!player) {
		return false;
	}
	
	// Can make moves if it's the player's turn and they have placed a Tetris piece
	return player.canMakeMove && player.hasPlacedTetris;
}

// Export default object with all utilities
export default {
	validateGeometryParams,
	getFloatingHeight,
	createPseudoRandomGenerator,
	canPlayerMakeChessMoves
};
