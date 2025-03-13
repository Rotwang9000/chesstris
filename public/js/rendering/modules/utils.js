/**
 * Renderer Utils Module
 * Contains utility functions for the renderer
 */

import * as THREE from 'three';
import { Constants } from '../../config/constants.js';

/**
 * Get the floating height for a cell at specific coordinates
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @returns {number} The floating height
 */
export function getFloatingHeight(x, z) {
	try {
		// Base height is 0
		let height = 0;
		
		// Add some variation based on coordinates
		const variation = Math.sin(x * 0.3) * Math.cos(z * 0.3) * 0.1;
		
		// Add time-based animation
		if (typeof window !== 'undefined') {
			const time = window.performance ? window.performance.now() * 0.0005 : 0;
			const timeVariation = Math.sin(time + x * 0.1 + z * 0.1) * 0.05;
			height += timeVariation;
		}
		
		return height + variation;
	} catch (error) {
		console.warn('Error in getFloatingHeight:', error);
		return 0; // Return a safe default value
	}
}

/**
 * Check if a player can make chess moves
 * @returns {boolean} Whether the player can make chess moves
 */
export function canPlayerMakeChessMoves() {
	try {
		// Always return true for testing
		return true;
	} catch (error) {
		console.warn('Error in canPlayerMakeChessMoves:', error);
		return false;
	}
}

/**
 * Validate geometry parameters to prevent NaN or undefined values
 * @param {Object} params - Geometry parameters
 * @returns {Object} Validated parameters
 */
export function validateGeometryParams(params) {
	const validated = {};
	try {
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
	} catch (error) {
		console.error('Error in validateGeometryParams:', error);
	}
	return validated;
}

/**
 * Generate a seeded pseudorandom number
 * @param {number} seed - The random seed
 * @param {number} multiplier - Multiplier for the random value
 * @param {number} offset - Offset for the random value
 * @returns {number} A pseudorandom number between 0 and multiplier + offset
 */
export function seededRandom(seed, multiplier = 1, offset = 0) {
	try {
		// Simple pseudorandom function
		const x = Math.sin(seed) * 10000;
		return ((x - Math.floor(x)) * multiplier) + offset;
	} catch (error) {
		console.warn('Error in seededRandom:', error);
		return offset;
	}
}

/**
 * Create a pseudo-random number generator with a given seed
 * This function returns another function that can be used to generate
 * a sequence of pseudo-random numbers based on the initial seed.
 * 
 * @param {number} initialSeed - Initial seed for the generator
 * @returns {Function} A function that generates pseudo-random numbers
 */
export function createPseudoRandomGenerator(initialSeed = 1) {
	// Use current time as a fallback seed if none provided
	let seed = initialSeed || Date.now();
	
	// Constants for a good linear congruential generator
	const a = 1664525;
	const c = 1013904223;
	const m = Math.pow(2, 32);
	
	// Return a function that can be called to get the next random number
	return function(min = 0, max = 1) {
		// Update the seed using LCG formula
		seed = (a * seed + c) % m;
		
		// Calculate value between 0 and 1
		const randomValue = seed / m;
		
		// Scale to the requested range
		if (min === 0 && max === 1) {
			return randomValue;
		} else {
			return min + randomValue * (max - min);
		}
	};
}

/**
 * Create a random color with optional hue range
 * @param {number} minHue - Minimum hue (0-1)
 * @param {number} maxHue - Maximum hue (0-1)
 * @param {number} saturation - Color saturation (0-1)
 * @param {number} lightness - Color lightness (0-1)
 * @returns {number} A random color as a THREE.js Color
 */
export function randomColor(minHue = 0, maxHue = 1, saturation = 0.8, lightness = 0.6) {
	try {
		const hue = minHue + Math.random() * (maxHue - minHue);
		return new THREE.Color().setHSL(hue, saturation, lightness);
	} catch (error) {
		console.warn('Error in randomColor:', error);
		return new THREE.Color(0x808080); // Fallback to gray
	}
}

/**
 * Create a random vector within given bounds
 * @param {number} minX - Minimum X value
 * @param {number} maxX - Maximum X value
 * @param {number} minY - Minimum Y value
 * @param {number} maxY - Maximum Y value
 * @param {number} minZ - Minimum Z value
 * @param {number} maxZ - Maximum Z value
 * @returns {THREE.Vector3} A random vector
 */
export function randomVector(minX = -1, maxX = 1, minY = -1, maxY = 1, minZ = -1, maxZ = 1) {
	try {
		const x = minX + Math.random() * (maxX - minX);
		const y = minY + Math.random() * (maxY - minY);
		const z = minZ + Math.random() * (maxZ - minZ);
		return new THREE.Vector3(x, y, z);
	} catch (error) {
		console.warn('Error in randomVector:', error);
		return new THREE.Vector3(); // Fallback to zero vector
	}
}

export default {
	getFloatingHeight,
	canPlayerMakeChessMoves,
	validateGeometryParams,
	seededRandom,
	createPseudoRandomGenerator,
	randomColor,
	randomVector
};
