/**
 * ⚠️ DEPRECATED - DO NOT USE ⚠️
 * 
 * This file has been refactored into separate modules located in the /js/rendering/modules/ directory.
 * Please use the new modular structure instead by importing from the index.js file:
 * 
 * import Renderer from './js/rendering/index.js';
 * 
 * The modular structure includes:
 * - core.js: Core renderer functionality
 * - board.js: Board and cell rendering
 * - pieces.js: Chess piece rendering
 * - tetromino.js: Tetris piece rendering
 * - effects.js: Visual effects and decorations
 * - utils.js: Utility functions
 */

/*
// Original code commented out - will be manually deleted after testing confirms the modular structure works

// All the original code would be commented out here
*/

// Import from the modular version
import { init, cleanup } from './index.js';

// Re-export the functions with console warnings
export function init(container, options = {}) {
	console.warn('⚠️ Using deprecated renderer.js. Please update your code to use the modular version from /js/rendering/index.js');
	return init(container, options);
}

export function cleanup() {
	console.warn('⚠️ Using deprecated renderer.js. Please update your code to use the modular version from /js/rendering/index.js');
	cleanup();
}

// Default export
export default {
	init,
	cleanup
}; 