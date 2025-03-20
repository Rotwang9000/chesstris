/**
 * Shaktris Game - Simplified Main Entry Point
 * 
 * This file initializes the minimal game core for the main game.
 */

import * as gameCore from './minimal-gameCore.js';
import * as debugUtils from './utils/debugUtils.js';

// Global state
let isGameStarted = false;

// Main initialization
async function init() {
	console.log('Initializing simplified Shaktris game...');
	
	try {
		// Run diagnostics first to catch any issues
		const diagnostics = debugUtils.printSystemDiagnostics();
		
		// Check THREE.js status
		if (!diagnostics.threeStatus || !diagnostics.threeStatus.isLoaded) {
			throw new Error('THREE.js not available. Please check your internet connection.');
		}
		
		// Hide loading screen, show game container
		document.getElementById('loading').style.display = 'none';
		
		const gameContainer = document.getElementById('game-container');
		gameContainer.style.display = 'block';
		
		// Ensure proper heights are set
		gameContainer.style.height = '100vh';
		gameContainer.style.minHeight = '100vh';
		
		// Initialize the game
		console.log('Starting game initialization...');
		isGameStarted = gameCore.initGame(gameContainer);
		
		if (!isGameStarted) {
			throw new Error('Game initialization failed');
		}
		
		// Set up resize handler
		window.addEventListener('resize', () => {
			if (isGameStarted) {
				gameCore.updateRenderSize();
			}
		});
		
		console.log('Game initialized successfully');
	} catch (error) {
		console.error('Error initializing game:', error);
		
		// Show error message
		const errorElement = document.getElementById('error-message');
		if (errorElement) {
			errorElement.innerHTML = `
				<h3>Error Starting Game</h3>
				<p>${error.message}</p>
				<div style="margin-top: 15px;">
					<a href="minimal.html" style="color: #3498db; margin-right: 15px;">Try Minimal Version</a>
					<button onclick="window.location.reload()">Reload</button>
				</div>
			`;
			errorElement.style.display = 'flex';
		}
		
		// Hide loading screen
		document.getElementById('loading').style.display = 'none';
	}
}

// Start initialization when DOM is loaded
document.addEventListener('DOMContentLoaded', init);

// Export for ES modules
export { init }; 