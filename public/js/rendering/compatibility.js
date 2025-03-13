/**
 * Renderer Compatibility Layer
 * 
 * This module provides a compatibility layer between the old monolithic 
 * renderer and the new modular system. It ensures that all the old functions
 * remain available globally and redirects calls to the appropriate modules.
 */

// Import modules using a different approach to prevent circular imports
let CoreRenderer, BoardRenderer, PiecesRenderer, TetrominoRenderer, EffectsRenderer, UtilsRenderer;

// Track initialization state
let isInitialized = false;
let isImportingRenderer = false; // Track to prevent recursive imports

/**
 * Initialize the compatibility layer
 * Exposes all necessary functions globally
 */
export async function initCompatibilityLayer() {
	if (isInitialized) {
		console.log('Compatibility layer already initialized');
		return;
	}
	
	console.log('Initializing renderer compatibility layer...');
	
	// Verify THREE.js is in global scope
	if (typeof window.THREE === 'undefined') {
		console.error('THREE.js not available in global scope');
		return false;
	}
	
	// Import required modules only if they haven't been imported yet
	if (!CoreRenderer) {
		try {
			CoreRenderer = await import('./modules/core.js');
			BoardRenderer = await import('./modules/board.js');
			PiecesRenderer = await import('./modules/pieces.js');
			TetrominoRenderer = await import('./modules/tetromino.js');
			EffectsRenderer = await import('./modules/effects.js');
			UtilsRenderer = await import('./modules/utils.js');
			console.log('Renderer modules imported successfully');
		} catch (error) {
			console.error('Failed to import renderer modules:', error);
			return false;
		}
	}
	
	// Expose core renderer functions
	window.resetCamera = CoreRenderer.resetCamera;
	window.topView = CoreRenderer.topView;
	window.sideView = CoreRenderer.sideView;
	
	// Expose BoardRenderer functions globally
	window.updateBoard = BoardRenderer.updateBoard;
	window.createFloatingCell = BoardRenderer.createFloatingCell;
	window.createCell = BoardRenderer.createCell;
	
	// Expose PiecesRenderer functions globally
	window.updateChessPieces = PiecesRenderer.updateChessPieces;
	window.addChessPiece = PiecesRenderer.addChessPiece;
	window.createPlayerNameLabel = PiecesRenderer.createPlayerNameLabel;
	window.updatePlayerLabels = PiecesRenderer.updatePlayerLabels;
	
	// Expose TetrominoRenderer functions globally
	window.updateFallingTetromino = TetrominoRenderer.updateFallingTetromino;
	window.updateGhostPiece = TetrominoRenderer.updateGhostPiece;
	
	// Expose EffectsRenderer functions globally
	window.addCellDecoration = EffectsRenderer.addCellDecoration;
	window.createSkybox = EffectsRenderer.createSkybox;
	window.addClouds = EffectsRenderer.addClouds;
	window.addPotionToCell = EffectsRenderer.addPotionToCell;
	window.animatePotionsAndParticles = EffectsRenderer.animatePotionsAndParticles;
	
	// Expose utility functions globally
	window.getFloatingHeight = UtilsRenderer.getFloatingHeight;
	window.canPlayerMakeChessMoves = UtilsRenderer.canPlayerMakeChessMoves;
	window.validateGeometryParams = UtilsRenderer.validateGeometryParams;
	
	// Set group references if they're available through the window object
	if (window.boardGroup) {
		BoardRenderer.init(window.boardGroup);
	}
	
	if (window.piecesGroup) {
		PiecesRenderer.init(window.piecesGroup);
	}
	
	if (window.tetrominoGroup && window.ghostGroup) {
		TetrominoRenderer.init(window.tetrominoGroup, window.ghostGroup);
	}
	
	if (window.decorationsGroup) {
		EffectsRenderer.init(window.decorationsGroup);
	}
	
	isInitialized = true;
	console.log('Compatibility layer initialized successfully');
	return true;
}

/**
 * Provides backward compatibility for the old renderer.init function
 * Redirects to the new modular initialization
 */
export async function initCompatible(container, options = {}) {
	// Verify THREE.js is in global scope
	if (typeof window.THREE === 'undefined') {
		console.error('THREE.js not available in global scope');
		return false;
	}
	
	// Prevent recursion by using a flag
	if (isImportingRenderer) {
		console.warn('Avoiding recursive import of renderer');
		return false;
	}
	
	try {
		// Set the flag to prevent recursion
		isImportingRenderer = true;
		
		// Import the main init function
		console.log('Importing renderer index module...');
		const module = await import('./index.js');
		
		// Reset the flag since import is complete
		isImportingRenderer = false;
		
		if (!module || typeof module.init !== 'function') {
			console.error('Renderer module could not be loaded properly');
			return false;
		}
		
		console.log('Initializing renderer via compatibility layer...');
		const result = await module.init(container, options);
		
		// Initialize compatibility layer after successful renderer init
		if (result) {
			// Don't initialize compatibility layer again if renderer.init already did it
			if (!isInitialized) {
				await initCompatibilityLayer();
			}
			console.log('Renderer initialized via compatibility layer');
			return true;
		} else {
			console.error('Renderer initialization failed');
			return false;
		}
	} catch (error) {
		// Reset the flag in case of error
		isImportingRenderer = false;
		console.error('Compatibility initialization error:', error);
		return false;
	}
}

export default {
	initCompatibilityLayer,
	initCompatible
}; 