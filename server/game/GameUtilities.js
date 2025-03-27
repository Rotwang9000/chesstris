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
 * Find a position for a player's home zone
 * @param {Object} game - The game object
 * @returns {Object|null} Home zone position or null if not found
 */
function findHomeZonePosition(game) {
	// Import the BoardGenerator module that has our improved home zone placement logic
	const BoardGenerator = require('../boardGenerator');
	const { HOME_ZONE_WIDTH, HOME_ZONE_HEIGHT } = require('./Constants').BOARD_SETTINGS;
	
	// Get the playerIndex based on the number of existing home zones
	const playerIndex = Object.keys(game.homeZones).length;
	
	// Use the improved calculateHomePosition function from BoardGenerator
	// No longer pass board width and height as we're using a boundless board model
	const homePosition = BoardGenerator.calculateHomePosition(
		playerIndex, 
		game, 
		HOME_ZONE_WIDTH, 
		HOME_ZONE_HEIGHT
	);
	
	// Return the home zone with the correct dimensions
	return {
		x: homePosition.x,
		z: homePosition.z,
		width: HOME_ZONE_WIDTH,
		height: HOME_ZONE_HEIGHT,
		orientation: homePosition.orientation
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