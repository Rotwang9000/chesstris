/**
 * GameUtilities.js - Shared utility functions for Shaktris game
 * This module provides common utility functions used across different game components
 */

const crypto = require('crypto');

/**
 * Generate a random game ID
 * @returns {string} A random game ID
 */
function generateGameId() {
	return crypto.randomBytes(8).toString('hex');
}

/**
 * Generate a random API token
 * @returns {string} A random API token
 */
function generateApiToken() {
	return crypto.randomBytes(16).toString('hex');
}

/**
 * Generate a random color in hex format with good contrast
 * @returns {string} A random color string in hex format
 */
function generateRandomColor() {
	// Generate a random, vibrant color for good visual distinction
	const hue = Math.floor(Math.random() * 360);
	const saturation = 70 + Math.floor(Math.random() * 30); // 70-100%
	const lightness = 40 + Math.floor(Math.random() * 20);  // 40-60%
	
	// Convert HSL to RGB
	const h = hue / 360;
	const s = saturation / 100;
	const l = lightness / 100;
	
	let r, g, b;
	
	if (s === 0) {
		r = g = b = l; // achromatic
	} else {
		const hue2rgb = (p, q, t) => {
			if (t < 0) t += 1;
			if (t > 1) t -= 1;
			if (t < 1/6) return p + (q - p) * 6 * t;
			if (t < 1/2) return q;
			if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
			return p;
		};
		
		const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
		const p = 2 * l - q;
		
		r = hue2rgb(p, q, h + 1/3);
		g = hue2rgb(p, q, h);
		b = hue2rgb(p, q, h - 1/3);
	}
	
	// Convert to hex
	const toHex = (x) => {
		const hex = Math.round(x * 255).toString(16);
		return hex.length === 1 ? '0' + hex : hex;
	};
	
	return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Find a valid position for a home zone using a spiral pattern
 * @param {Object} game - The game object
 * @returns {Object} Home zone position, width and height
 */
function findHomeZonePosition(game) {
	const { HOME_ZONE_SIZE, HOME_ZONE_DISTANCE, SPIRAL_DIRECTIONS } = require('./Constants').BOARD_SETTINGS;
	
	// If this is the first player, place at the center of the board
	if (Object.keys(game.players).length === 0) {
		const centerX = Math.floor(game.board[0].length / 2) - Math.floor(HOME_ZONE_SIZE / 2);
		const centerZ = Math.floor(game.board.length / 2) - Math.floor(HOME_ZONE_SIZE / 2);
		
		// Ensure the board is large enough for the first home zone
		if (centerX < 0 || centerZ < 0 || 
			centerX + HOME_ZONE_SIZE > game.board[0].length || 
			centerZ + HOME_ZONE_SIZE > game.board.length) {
			// If not, expand the board
			const boardManager = new (require('./BoardManager'))();
			const expandX = Math.max(0, HOME_ZONE_SIZE - game.board[0].length);
			const expandZ = Math.max(0, HOME_ZONE_SIZE - game.board.length);
			boardManager.expandBoard(game, expandX, expandZ);
			
			// Recalculate center position
			return findHomeZonePosition(game);
		}
		
		return {
			x: centerX,
			z: centerZ,
			width: HOME_ZONE_SIZE,
			height: HOME_ZONE_SIZE
		};
	}
	
	// For subsequent players, place in a spiral pattern
	// First, find the last player added
	const players = Object.values(game.players);
	const lastPlayer = players[players.length - 1];
	
	// Calculate the direction index based on number of players
	const directionIndex = players.length % SPIRAL_DIRECTIONS.length;
	const direction = SPIRAL_DIRECTIONS[directionIndex];
	
	// Calculate the position for the new home zone
	// Start from the center of the last player's home zone
	const lastHomeX = lastPlayer.homeZone.x + Math.floor(HOME_ZONE_SIZE / 2);
	const lastHomeZ = lastPlayer.homeZone.z + Math.floor(HOME_ZONE_SIZE / 2);
	
	// Move in the current direction by HOME_ZONE_DISTANCE
	const newCenterX = lastHomeX + (direction.x * HOME_ZONE_DISTANCE);
	const newCenterZ = lastHomeZ + (direction.z * HOME_ZONE_DISTANCE);
	
	// Adjust to get the top-left corner of the new home zone
	const newHomeX = newCenterX - Math.floor(HOME_ZONE_SIZE / 2);
	const newHomeZ = newCenterZ - Math.floor(HOME_ZONE_SIZE / 2);
	
	// Check if the board needs to be expanded to fit the new home zone
	const needsExpansionLeft = newHomeX < 0 ? Math.abs(newHomeX) : 0;
	const needsExpansionRight = (newHomeX + HOME_ZONE_SIZE) > game.board[0].length ? 
		(newHomeX + HOME_ZONE_SIZE - game.board[0].length) : 0;
	const needsExpansionTop = newHomeZ < 0 ? Math.abs(newHomeZ) : 0;
	const needsExpansionBottom = (newHomeZ + HOME_ZONE_SIZE) > game.board.length ? 
		(newHomeZ + HOME_ZONE_SIZE - game.board.length) : 0;
	
	// Expand board if necessary
	if (needsExpansionLeft || needsExpansionRight || needsExpansionTop || needsExpansionBottom) {
		const boardManager = new (require('./BoardManager'))();
		const expandX = needsExpansionLeft + needsExpansionRight;
		const expandZ = needsExpansionTop + needsExpansionBottom;
		
		// Expand in the specific directions needed
		boardManager.expandBoard(game, expandX, expandZ, {
			left: needsExpansionLeft,
			right: needsExpansionRight,
			top: needsExpansionTop,
			bottom: needsExpansionBottom
		});
		
		// Recalculate position after expansion
		return findHomeZonePosition(game);
	}
	
	// Return the calculated position
	return {
		x: newHomeX >= 0 ? newHomeX : 0,
		z: newHomeZ >= 0 ? newHomeZ : 0,
		width: HOME_ZONE_SIZE,
		height: HOME_ZONE_SIZE
	};
}

/**
 * Validate coordinates against board boundaries
 * @param {Object} game - The game object
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @throws {Error} If coordinates are out of bounds
 */
function validateCoordinates(game, x, z) {
	const boardHeight = game.board.length;
	const boardWidth = game.board[0].length;
	
	if (x < 0 || x >= boardWidth || z < 0 || z >= boardHeight) {
		throw new Error(`Invalid coordinates: (${x}, ${z}) is out of bounds`);
	}
}

/**
 * Deep clone an object
 * @param {Object} obj - The object to clone
 * @returns {Object} A deep clone of the object
 */
function deepClone(obj) {
	return JSON.parse(JSON.stringify(obj));
}

/**
 * Log a message with a timestamp
 * @param {string} message - The message to log
 */
function log(message) {
	const timestamp = new Date().toISOString();
	console.log(`[${timestamp}] ${message}`);
}

// Export utility functions
module.exports = {
	generateGameId,
	generateApiToken,
	generateRandomColor,
	findHomeZonePosition,
	validateCoordinates,
	deepClone,
	log
}; 