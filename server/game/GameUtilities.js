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
	const { HOME_ZONE_WIDTH, HOME_ZONE_HEIGHT, HOME_ZONE_DISTANCE, SPIRAL_DIRECTIONS } = require('./Constants').BOARD_SETTINGS;
	
	// If this is the first player, place at the center of the board
	if (Object.keys(game.homeZones).length === 0) {
		const centerX = Math.floor(game.board.width / 2) - Math.floor(HOME_ZONE_WIDTH / 2);
		const centerZ = Math.floor(game.board.height / 2) - Math.floor(HOME_ZONE_HEIGHT / 2);
		
		// With sparse board structure, we don't need to expand for the first player
		// The board will automatically accommodate cells at any position
		return {
			x: centerX,
			z: centerZ,
			width: HOME_ZONE_WIDTH,
			height: HOME_ZONE_HEIGHT
		};
	}
	
	// For subsequent players, place in a spiral pattern
	// Get all existing home zones from the game.homeZones object
	const homeZones = Object.values(game.homeZones);
	
	// Calculate the direction index based on number of home zones
	const directionIndex = homeZones.length % SPIRAL_DIRECTIONS.length;
	const direction = SPIRAL_DIRECTIONS[directionIndex];
	
	// Get the last home zone
	const lastHomeZone = homeZones[homeZones.length - 1];
	
	// Guard against undefined home zone
	if (!lastHomeZone) {
		log('Warning: Last home zone is undefined, falling back to center position');
		return findHomeZonePosition({...game, homeZones: {}}); // Force first player placement
	}
	
	// Calculate the center of the last home zone
	const lastHomeX = lastHomeZone.x + Math.floor(lastHomeZone.width / 2);
	const lastHomeZ = lastHomeZone.z + Math.floor(lastHomeZone.height / 2);
	
	// Move in the current direction by HOME_ZONE_DISTANCE
	const newCenterX = lastHomeX + (direction.x * HOME_ZONE_DISTANCE);
	const newCenterZ = lastHomeZ + (direction.z * HOME_ZONE_DISTANCE);
	
	// Adjust to get the top-left corner of the new home zone
	let newHomeX, newHomeZ;
	
	// Adjust home zone orientation based on direction
	if (direction.x !== 0) {
		// Horizontal direction (right/left) - place as a horizontal zone
		newHomeX = newCenterX - Math.floor(HOME_ZONE_WIDTH / 2);
		newHomeZ = newCenterZ - Math.floor(HOME_ZONE_HEIGHT / 2);
		
		return {
			x: newHomeX >= 0 ? newHomeX : 0,
			z: newHomeZ >= 0 ? newHomeZ : 0,
			width: HOME_ZONE_WIDTH,
			height: HOME_ZONE_HEIGHT
		};
	} else {
		// Vertical direction (up/down) - place as a vertical zone by swapping dimensions
		newHomeX = newCenterX - Math.floor(HOME_ZONE_HEIGHT / 2);
		newHomeZ = newCenterZ - Math.floor(HOME_ZONE_WIDTH / 2);
		
		// Return with swapped width and height for vertical zones
		return {
			x: newHomeX >= 0 ? newHomeX : 0,
			z: newHomeZ >= 0 ? newHomeZ : 0,
			width: HOME_ZONE_HEIGHT,
			height: HOME_ZONE_WIDTH
		};
	}
}

/**
 * Validate coordinates against board boundaries
 * @param {Object} game - The game object
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @throws {Error} If coordinates are out of bounds
 */
function validateCoordinates(game, x, z) {
	// With sparse board structure, we don't need strict boundary validation
	// Cells can be placed at any position, but we'll still validate for extremely
	// out-of-bounds coordinates to catch potential errors
	
	// Set some arbitrary large boundaries to catch obvious errors
	const MAX_COORDINATE = 10000;
	
	if (x < -MAX_COORDINATE || x > MAX_COORDINATE || z < -MAX_COORDINATE || z > MAX_COORDINATE) {
		throw new Error(`Invalid coordinates: (${x}, ${z}) is extremely out of bounds`);
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