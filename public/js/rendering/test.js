/**
 * Renderer Test File
 * This file tests the refactored renderer modules
 */

import { init, cleanup } from './index.js';

// Test function to verify the refactored renderer
function testRenderer() {
	console.log('Testing refactored renderer...');
	
	// Get container element
	const container = document.getElementById('game-container');
	if (!container) {
		console.error('Game container not found');
		return false;
	}
	
	// Initialize renderer
	const success = init(container);
	if (!success) {
		console.error('Failed to initialize renderer');
		return false;
	}
	
	console.log('Renderer initialized successfully');
	
	// Test cleanup (commented out for now)
	// setTimeout(() => {
	//     cleanup();
	//     console.log('Renderer cleaned up');
	// }, 5000);
	
	return true;
}

// Export test function
export { testRenderer };

// Auto-run test if this file is loaded directly
if (typeof window !== 'undefined' && window.location.pathname.includes('test.html')) {
	window.addEventListener('DOMContentLoaded', () => {
		testRenderer();
	});
} 