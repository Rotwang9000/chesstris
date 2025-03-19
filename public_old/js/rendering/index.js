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
import { initCompatibilityLayer } from './compatibility.js';

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
async function init(container, options = {}) {
	try {
		// Basic validation of container
		if (!container || !(container instanceof HTMLElement)) {
			console.error('Invalid container element provided to renderer');
			return false;
		}
		
		console.log('Initializing Chesstris renderer...');
		
		// Set default options for better visuals
		const defaultOptions = {
			enableSkybox: true,     // Enable skybox by default
			enableClouds: true,     // Enable clouds by default
			enableEffects: true,    // Enable visual effects by default
			debug: true             // Enable debug mode by default
		};
		
		// Merge options with defaults
		const mergedOptions = { ...defaultOptions, ...options };
		
		// Always enable debug mode in development
		if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
			mergedOptions.debug = true;
			console.log('Debug mode enabled automatically in development environment');
		}
		
		// Add useTestMode if we're on a test page
		if (window.location.pathname.includes('test') || 
			window.location.pathname.includes('auto-test') ||
			window.location.pathname.includes('renderer_test')) {
			mergedOptions.useTestMode = true;
			console.log('Test mode enabled automatically for test pages');
		}
		
		// Inspect CoreRenderer before attempting to use it
		console.log('CoreRenderer details:', {
			type: typeof CoreRenderer,
			isObject: typeof CoreRenderer === 'object',
			hasInitMethod: CoreRenderer && typeof CoreRenderer.init === 'function',
			keys: CoreRenderer ? Object.keys(CoreRenderer) : 'Not available',
			hasDefault: CoreRenderer && CoreRenderer.default,
			defaultType: CoreRenderer && CoreRenderer.default ? typeof CoreRenderer.default : 'N/A',
			defaultHasInit: CoreRenderer && CoreRenderer.default && typeof CoreRenderer.default.init === 'function'
		});
		
		// Initialize core renderer with more detailed error capturing
		let initResult;
		try {
			console.log('Initializing core renderer...');
			
			// Try directly importing the core module as a fallback
			if (!(CoreRenderer && typeof CoreRenderer.init === 'function')) {
				console.warn('CoreRenderer.init not available through import, trying direct import');
				try {
					// This is a dynamic import to bypass any module resolution issues
					const directCoreModule = await import('./modules/core.js');
					if (directCoreModule && typeof directCoreModule.init === 'function') {
						console.log('Using direct core.js import instead');
						initResult = directCoreModule.init(container, mergedOptions);
					} else {
						console.error('Direct core.js import also failed!');
						return false;
					}
				} catch (directImportError) {
					console.error('Direct import of core.js failed:', directImportError);
					return false;
				}
			} else {
				// Use the regular CoreRenderer import
				console.log('Using CoreRenderer.init directly');
				initResult = CoreRenderer.init(container, mergedOptions);
			}
			
			console.log('Init result:', initResult);
			
			if (!initResult) {
				console.error('Core renderer initialization returned false');
				return false;
			}
			
			console.log('Core renderer initialized successfully');
		} catch (coreError) {
			console.error('Error during core renderer initialization:', coreError);
			console.error('Error stack:', coreError.stack);
			return false;
		}
		
		// Get references to groups from the core renderer
		try {
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
		} catch (refError) {
			console.error('Error getting references from core renderer:', refError);
			return false;
		}
		
		try {
			// Initialize board module if available
			if (typeof BoardRenderer === 'object' && typeof BoardRenderer.init === 'function') {
				console.log('Initializing board module...');
				BoardRenderer.init(boardGroup, materials);
			} else {
				console.warn('BoardRenderer not available or missing init method');
			}
			
			// Initialize pieces module if available
			if (typeof PiecesRenderer === 'object' && typeof PiecesRenderer.init === 'function') {
				console.log('Initializing pieces module...');
				PiecesRenderer.init(piecesGroup);
			} else {
				console.warn('PiecesRenderer not available or missing init method');
			}
			
			// Initialize tetromino module if available
			if (typeof TetrominoRenderer === 'object' && typeof TetrominoRenderer.init === 'function') {
				console.log('Initializing tetromino module...');
				TetrominoRenderer.init(tetrominoGroup, ghostGroup);
			} else {
				console.warn('TetrominoRenderer not available or missing init method');
			}
			
			// Initialize effects module if available
			if (typeof EffectsRenderer === 'object' && typeof EffectsRenderer.init === 'function') {
				console.log('Initializing effects module...');
				EffectsRenderer.init(decorationsGroup);
			} else {
				console.warn('EffectsRenderer not available or missing init method');
			}
		} catch (moduleInitError) {
			console.error('Error initializing renderer modules:', moduleInitError);
			// Continue with initialization despite module errors
		}
		
		// Add skybox and clouds if enabled
		if (mergedOptions.enableSkybox && typeof EffectsRenderer === 'object' && typeof EffectsRenderer.createSkybox === 'function') {
			try {
				const skybox = EffectsRenderer.createSkybox();
				if (skybox && window.scene) {
					window.scene.add(skybox);
					console.log('Skybox added to scene');
				}
			} catch (error) {
				console.warn('Error creating skybox:', error);
			}
		}
		
		if (mergedOptions.enableClouds && typeof EffectsRenderer === 'object' && typeof EffectsRenderer.addClouds === 'function') {
			try {
				EffectsRenderer.addClouds(window.scene);
				console.log('Clouds added to scene');
			} catch (error) {
				console.warn('Error adding clouds:', error);
			}
		}
		
		// Create initial game world if provided with a player ID
		if (options.playerId) {
			try {
				CoreRenderer.initializeGameWorld(options.playerId);
			} catch (error) {
				console.warn('Error initializing game world:', error);
			}
		}
		
		// Initialize compatibility layer to ensure old function calls work
		try {
			initCompatibilityLayer();
			console.log('Compatibility layer initialized');
		} catch (compatError) {
			console.warn('Error initializing compatibility layer:', compatError);
			// Don't fail initialization if compatibility layer fails
		}
		
		// Log success
		console.log('%c Chesstris Renderer Initialized Successfully', 'background: #4CAF50; color: white; padding: 5px; font-size: 14px; font-weight: bold;');
		console.log('Camera Controls:');
		console.log('- window.resetCamera() - Reset camera to default position');
		console.log('- window.topView() - Bird\'s eye view');
		console.log('- window.sideView() - Side view from x-axis');
		
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
