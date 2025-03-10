/**
 * Renderer Module Index
 * Main entry point for the refactored renderer
 */

// Import all modules
import * as	 CoreRenderer from './modules/core.js';
import * as BoardRenderer from './modules/board.js';
import * as PiecesRenderer from './modules/pieces.js';
import * as TetrominoRenderer from './modules/tetromino.js';
import * as EffectsRenderer from './modules/effects.js';
import * as UtilsRenderer from './modules/utils.js';

// Shared variables
let isInitialized = false;
let boardGroup;
let piecesGroup;
let tetrominoGroup;
let ghostGroup;
let decorationsGroup;
let materials = {};

/**
 * Initialize the renderer
 * @param {HTMLElement} container - The container to render into
 * @param {Object} options - Renderer options
 * @returns {boolean} - Whether initialization was successful
 */
function init(container, options = {}) {
	try {
		// Initialize core renderer
		const initResult = CoreRenderer.init(container, options);
		if (!initResult) {
			console.error('Failed to initialize core renderer');
			return false;
		}
		
		// Get references to groups from the core renderer
		boardGroup = window.boardGroup || initResult.boardGroup;
		piecesGroup = window.piecesGroup || initResult.piecesGroup;
		tetrominoGroup = window.tetrominoGroup || initResult.tetrominoGroup;
		ghostGroup = window.ghostGroup || initResult.ghostGroup;
		decorationsGroup = window.decorationsGroup || initResult.decorationsGroup;
		materials = window.materials || initResult.materials || {};
		
		// Make modules available globally for easier access
		window.boardModule = BoardRenderer;
		window.piecesModule = PiecesRenderer;
		window.tetrominoModule = TetrominoRenderer;
		window.effectsModule = EffectsRenderer;
		window.utilsModule = UtilsRenderer;
		
		// Initialize board module
		BoardRenderer.init(boardGroup, materials);
		
		// Initialize pieces module
		PiecesRenderer.init(piecesGroup);
		
		// Initialize tetromino module
		TetrominoRenderer.init(tetrominoGroup, ghostGroup);
		
		// Initialize effects module
		EffectsRenderer.init(decorationsGroup);
		
		isInitialized = true;
		return true;
	} catch (error) {
		console.error('Error initializing renderer:', error);
		return false;
	}
}

/**
 * Clean up the renderer
 */
function cleanup() {
	if (!isInitialized) return;
	
	try {
		// Clean up core renderer
		CoreRenderer.cleanup();
		
		// Remove global references
		window.boardModule = null;
		window.piecesModule = null;
		window.tetrominoModule = null;
		window.effectsModule = null;
		window.utilsModule = null;
		
		// Clear shared variables
		boardGroup = null;
		piecesGroup = null;
		tetrominoGroup = null;
		ghostGroup = null;
		decorationsGroup = null;
		materials = {};
		
		isInitialized = false;
	} catch (error) {
		console.error('Error cleaning up renderer:', error);
	}
}

// Export the public API
export {
	init,
	cleanup,
	CoreRenderer,
	BoardRenderer,
	PiecesRenderer,
	TetrominoRenderer,
	EffectsRenderer,
	UtilsRenderer
};

// Default export for easier importing
export default {
	init,
	cleanup
};
