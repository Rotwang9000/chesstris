/**
 * Renderer Compatibility Layer
 * 
 * This module provides a compatibility layer between the old monolithic 
 * renderer and the new modular system. It ensures that all the old functions
 * remain available globally and redirects calls to the appropriate modules.
 */

import * as Renderer from './renderer-init.js';

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
	if (!isImportingRenderer) {
		try {
			isImportingRenderer = true;
			await Renderer.init(document.getElementById('game-container'), {
				enableSkybox: true,
				enableClouds: true,
				enableEffects: true,
				debug: true
			});
			isImportingRenderer = false;
		} catch (error) {
			console.error('Failed to initialize renderer:', error);
			isImportingRenderer = false;
			return false;
		}
	}
	
	// Expose core renderer functions
	window.resetCamera = () => {
		if (window.camera) {
			window.camera.position.set(12, 15, 20);
			window.camera.lookAt(12, 0, 12);
		}
	};
	
	window.topView = () => {
		if (window.camera) {
			window.camera.position.set(12, 30, 12);
			window.camera.lookAt(12, 0, 12);
		}
	};
	
	window.sideView = () => {
		if (window.camera) {
			window.camera.position.set(30, 15, 12);
			window.camera.lookAt(12, 0, 12);
		}
	};
	
	// Expose other functions that old code might expect
	window.updateBoard = (gameState) => {
		if (window.boardModule && typeof window.boardModule.updateBoard === 'function') {
			window.boardModule.updateBoard(gameState);
		}
	};
	
	window.updateChessPieces = (gameState) => {
		if (window.piecesModule && typeof window.piecesModule.updateChessPieces === 'function') {
			window.piecesModule.updateChessPieces(gameState);
		}
	};
	
	window.updateFallingTetromino = (gameState) => {
		if (window.tetrominoModule && typeof window.tetrominoModule.updateFallingTetromino === 'function') {
			window.tetrominoModule.updateFallingTetromino(gameState);
		}
	};
	
	window.updateGhostPiece = (gameState) => {
		if (window.tetrominoModule && typeof window.tetrominoModule.updateGhostPiece === 'function') {
			window.tetrominoModule.updateGhostPiece(gameState);
		}
	};
	
	isInitialized = true;
	console.log('Compatibility layer initialized successfully');
	return true;
}

/**
 * Provides backward compatibility for the old renderer.init function
 * Redirects to the new modular initialization
 */
export async function initCompatible(container, options = {}) {
	return await Renderer.init(container, options);
}

// Export for debugging
window.rendererCompatibility = {
	initCompatibilityLayer,
	initCompatible
}; 