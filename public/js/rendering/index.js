/**
 * Renderer Module Index
 * Main entry point for the refactored renderer
 */

// Import all modules
import CoreRenderer from './modules/core.js';
import BoardRenderer from './modules/board.js';
import PiecesRenderer from './modules/pieces.js';
import TetrominoRenderer from './modules/tetromino.js';
import EffectsRenderer from './modules/effects.js';
import UtilsRenderer from './modules/utils.js';

// Initialize modules
let isInitialized = false;

/**
 * Initialize the renderer
 * @param {HTMLElement} container - The container to render into
 * @param {Object} options - Renderer options
 * @returns {boolean} - Whether initialization was successful
 */
function init(container, options = {}) {
	try {
		// Initialize core renderer
		const success = CoreRenderer.init(container, options);
		if (!success) {
			console.error('Failed to initialize core renderer');
			return false;
		}
		
		// Make modules available globally for easier access
		window.boardModule = BoardRenderer;
		window.piecesModule = PiecesRenderer;
		window.tetrominoModule = TetrominoRenderer;
		window.effectsModule = EffectsRenderer;
		window.utilsModule = UtilsRenderer;
		
		// Initialize board module
		BoardRenderer.init(window.boardGroup, window.materials);
		
		// Initialize pieces module
		PiecesRenderer.init(window.piecesGroup);
		
		// Initialize tetromino module
		TetrominoRenderer.init(window.tetrominoGroup, window.ghostGroup);
		
		// Initialize effects module
		EffectsRenderer.init(window.decorationsGroup);
		
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
