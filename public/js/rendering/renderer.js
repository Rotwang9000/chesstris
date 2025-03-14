/**
 * Renderer
 * 
 * Main rendering module that handles both 2D and 3D rendering modes.
 * Acts as a facade for the specific rendering implementations.
 */

import { GAME_CONSTANTS } from '../core/constants.js';
import * as Renderer3D from './renderer3d.js';
import * as Renderer2D from './renderer2d.js';

// Current render mode
let currentMode = null;

// Active renderer instance
let activeRenderer = null;

// Canvas element
let canvas = null;

// Rendering context
let context = null;

// Game container
let container = null;

// Debug mode
let debugMode = false;

/**
 * Initialize the renderer
 * @param {string} mode - Render mode (2d or 3d)
 * @returns {Promise<void>}
 */
export async function init(mode = GAME_CONSTANTS.RENDER_MODE.MODE_3D) {
	try {
		// Check if window.is2DMode is set (from 2D/index.html)
		if (window.is2DMode) {
			mode = GAME_CONSTANTS.RENDER_MODE.MODE_2D;
		}
		
		console.log(`Initializing renderer in ${mode} mode`);
		
		// Set current mode
		currentMode = mode;
		
		// Get container
		container = document.getElementById('game-container');
		if (!container) {
			container = document.createElement('div');
			container.id = 'game-container';
			document.body.appendChild(container);
		}
		
		// Create canvas if it doesn't exist
		canvas = document.getElementById('game-canvas');
		if (!canvas) {
			canvas = document.createElement('canvas');
			canvas.id = 'game-canvas';
			container.appendChild(canvas);
		}
		
		// Set canvas size
		resizeCanvas();
		
		// Initialize appropriate renderer
		if (mode === GAME_CONSTANTS.RENDER_MODE.MODE_3D) {
			await initRenderer3D();
		} else {
			await initRenderer2D();
		}
		
		// Add resize listener
		window.addEventListener('resize', handleResize);
		
		console.log(`Renderer initialized in ${mode} mode`);
	} catch (error) {
		console.error('Error initializing renderer:', error);
		throw error;
	}
}

/**
 * Initialize 3D renderer
 * @returns {Promise<void>}
 */
async function initRenderer3D() {
	try {
		console.log('Initializing 3D renderer');
		
		// Initialize 3D renderer
		await Renderer3D.init(canvas);
		
		// Set active renderer
		activeRenderer = Renderer3D;
		
		console.log('3D renderer initialized');
	} catch (error) {
		console.error('Error initializing 3D renderer:', error);
		
		// Fall back to 2D renderer
		console.warn('Falling back to 2D renderer');
		currentMode = GAME_CONSTANTS.RENDER_MODE.MODE_2D;
		await initRenderer2D();
	}
}

/**
 * Initialize 2D renderer
 * @returns {Promise<void>}
 */
async function initRenderer2D() {
	try {
		console.log('Initializing 2D renderer');
		
		// Get 2D context
		context = canvas.getContext('2d');
		
		// Initialize 2D renderer
		await Renderer2D.init(canvas, context);
		
		// Set active renderer
		activeRenderer = Renderer2D;
		
		console.log('2D renderer initialized');
	} catch (error) {
		console.error('Error initializing 2D renderer:', error);
		throw error;
	}
}

/**
 * Handle window resize
 */
function handleResize() {
	try {
		resizeCanvas();
		
		// Notify active renderer
		if (activeRenderer && activeRenderer.handleResize) {
			activeRenderer.handleResize(canvas.width, canvas.height);
		}
	} catch (error) {
		console.error('Error handling resize:', error);
	}
}

/**
 * Resize canvas to fit container
 */
function resizeCanvas() {
	try {
		if (!canvas || !container) return;
		
		// Get container dimensions
		const containerWidth = container.clientWidth || window.innerWidth;
		const containerHeight = container.clientHeight || window.innerHeight;
		
		// Set canvas size
		canvas.width = containerWidth;
		canvas.height = containerHeight;
		
		// Update CSS dimensions
		canvas.style.width = `${containerWidth}px`;
		canvas.style.height = `${containerHeight}px`;
	} catch (error) {
		console.error('Error resizing canvas:', error);
	}
}

/**
 * Render the game
 * @param {Object} gameState - Current game state
 */
export function render(gameState) {
	try {
		if (!activeRenderer) return;
		
		// Call active renderer
		if (activeRenderer.render) {
			activeRenderer.render(gameState);
		}
	} catch (error) {
		console.error('Error rendering game:', error);
	}
}

/**
 * Update the renderer
 * @param {number} deltaTime - Time since last update
 */
export function update(deltaTime) {
	try {
		if (!activeRenderer) return;
		
		// Call active renderer
		if (activeRenderer.update) {
			activeRenderer.update(deltaTime);
		}
	} catch (error) {
		console.error('Error updating renderer:', error);
	}
}

/**
 * Clear the canvas
 */
export function clear() {
	try {
		if (!activeRenderer) return;
		
		// Call active renderer
		if (activeRenderer.clear) {
			activeRenderer.clear();
		}
	} catch (error) {
		console.error('Error clearing canvas:', error);
	}
}

/**
 * Get current render mode
 * @returns {string} - Current render mode
 */
export function getMode() {
	return currentMode;
}

/**
 * Set debug mode
 * @param {boolean} enabled - Whether debug mode is enabled
 */
export function setDebugMode(enabled) {
	debugMode = enabled;
	
	// Notify active renderer
	if (activeRenderer && activeRenderer.setDebugMode) {
		activeRenderer.setDebugMode(enabled);
	}
}

/**
 * Check if debug mode is enabled
 * @returns {boolean} - Whether debug mode is enabled
 */
export function isDebugMode() {
	return debugMode;
}

/**
 * Get canvas element
 * @returns {HTMLCanvasElement} - Canvas element
 */
export function getCanvas() {
	return canvas;
}

/**
 * Get rendering context
 * @returns {CanvasRenderingContext2D|WebGLRenderingContext} - Rendering context
 */
export function getContext() {
	return context;
}

/**
 * Dispose of renderer resources
 */
export function dispose() {
	try {
		// Remove event listeners
		window.removeEventListener('resize', handleResize);
		
		// Dispose active renderer
		if (activeRenderer && activeRenderer.dispose) {
			activeRenderer.dispose();
		}
		
		// Clear references
		activeRenderer = null;
		canvas = null;
		context = null;
		container = null;
	} catch (error) {
		console.error('Error disposing renderer:', error);
	}
}