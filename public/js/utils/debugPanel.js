/**
 * Debug Panel Module
 *
 * Provides a visual panel for debugging game state and performance.
 * This panel can be toggled on/off with a keyboard shortcut (F9).
 */

import { GAME_CONSTANTS } from '../core/constants.js';
import * as GameManager from '../core/gameManager.js';
import * as TetrominoManager from '../core/tetrominoManager.js';
import * as ChessPieceManager from '../core/chessPieceManager.js';
import * as PlayerManager from '../core/playerManager.js';
import * as Network from './network.js';
import * as SessionManager from './sessionManager.js';

// Debug panel element
let debugPanelElement = null;

// Debug panel state
let isInitialized = false;
let isVisible = false;

// Sections for organizing debug info
let sections = {};

// Performance tracking
let lastUpdateTime = performance.now();
let frameCount = 0;
let fps = 0;

/**
 * Initialize the debug panel
 */
export function init() {
	try {
		// Check if already initialized
		if (isInitialized) {
			console.log('Debug panel already initialized');
			return;
		}
		
		// Get existing debug panel element or create a new one
		debugPanelElement = document.getElementById('debug-panel');
		
		if (!debugPanelElement) {
			console.log('Creating new debug panel element');
			debugPanelElement = document.createElement('div');
			debugPanelElement.id = 'debug-panel';
			debugPanelElement.style.position = 'fixed';
			debugPanelElement.style.top = '10px';
			debugPanelElement.style.right = '10px';
			debugPanelElement.style.width = '300px';
			debugPanelElement.style.padding = '10px';
			debugPanelElement.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
			debugPanelElement.style.color = '#fff';
			debugPanelElement.style.fontFamily = 'monospace';
			debugPanelElement.style.fontSize = '12px';
			debugPanelElement.style.zIndex = '9999';
			debugPanelElement.style.overflowY = 'auto';
			debugPanelElement.style.maxHeight = '80vh';
			debugPanelElement.style.border = '1px solid #444';
			debugPanelElement.style.display = 'none'; // Hidden by default
			
			// Add a header
			const header = document.createElement('div');
			header.style.fontWeight = 'bold';
			header.style.fontSize = '14px';
			header.style.marginBottom = '10px';
			header.style.borderBottom = '1px solid #444';
			header.textContent = 'DEBUG PANEL (F9)';
			debugPanelElement.appendChild(header);
			
			// Add to document
			document.body.appendChild(debugPanelElement);
		}
		
		// Create default sections
		createSection('PERFORMANCE');
		createSection('GAME');
		createSection('BOARD');
		createSection('TETROMINO');
		createSection('CHESS');
		createSection('ERRORS');
		
		// Mark as initialized
		isInitialized = true;
		console.log('Debug panel initialized');
	} catch (error) {
		console.error('Error initializing debug panel:', error);
	}
}

/**
 * Toggle debug panel visibility
 */
export function toggle() {
	try {
		if (!isInitialized) {
			init();
		}
		
		isVisible = !isVisible;
		
		if (debugPanelElement) {
			debugPanelElement.style.display = isVisible ? 'block' : 'none';
		}
		
		console.log(`Debug panel ${isVisible ? 'shown' : 'hidden'}`);
	} catch (error) {
		console.error('Error toggling debug panel:', error);
	}
}

/**
 * Check if debug panel is visible
 * @returns {boolean} True if visible, false otherwise
 */
export function debugPanelVisible() {
	return isVisible;
}

/**
 * Check if debug panel is initialized
 * @returns {boolean} True if initialized, false otherwise
 */
export function debugPanelInitialized() {
	return isInitialized;
}

/**
 * Create a section in the debug panel
 * @param {string} name - Section name
 */
export function createSection(name) {
	try {
		if (!debugPanelElement) return;
		
		// Check if section already exists
		if (sections[name]) {
			return;
		}
		
		// Create section container
		const section = document.createElement('div');
		section.className = 'debug-section';
		section.style.marginBottom = '10px';
		
		// Create section title
		const title = document.createElement('div');
		title.className = 'debug-section-title';
		title.textContent = name;
		title.style.fontWeight = 'bold';
		title.style.color = '#ffff00';
		title.style.borderBottom = '1px solid #444';
		title.style.marginBottom = '5px';
		
		// Create section content
		const content = document.createElement('div');
		content.className = 'debug-section-content';
		
		// Add to section
		section.appendChild(title);
		section.appendChild(content);
		
		// Add to debug panel
		debugPanelElement.appendChild(section);
		
		// Store section reference
		sections[name] = {
			element: section,
			content: content,
			data: {}
		};
	} catch (error) {
		console.error('Error creating debug section:', error);
	}
}

/**
 * Update a section with new data
 * @param {string} sectionName - Section name
 * @param {Object} data - Data to display (key-value pairs)
 */
export function updateSection(sectionName, data) {
	try {
		if (!isInitialized || !isVisible) return;
		
		// Get section
		const section = sections[sectionName];
		if (!section) {
			createSection(sectionName);
			return updateSection(sectionName, data);
		}
		
		// Update section data
		section.data = { ...section.data, ...data };
		
		// Clear content
		section.content.innerHTML = '';
		
		// Add data items
		Object.entries(section.data).forEach(([key, value]) => {
			const item = document.createElement('div');
			item.className = 'debug-item';
			item.style.display = 'flex';
			item.style.justifyContent = 'space-between';
			item.style.marginBottom = '2px';
			
			const keyElement = document.createElement('span');
			keyElement.className = 'debug-key';
			keyElement.textContent = key;
			keyElement.style.color = '#aaaaaa';
			
			const valueElement = document.createElement('span');
			valueElement.className = 'debug-value';
			valueElement.textContent = value;
			valueElement.style.color = '#00ff00';
			
			item.appendChild(keyElement);
			item.appendChild(valueElement);
			section.content.appendChild(item);
		});
	} catch (error) {
		console.error('Error updating debug section:', error);
	}
}

/**
 * Log an error to the debug panel
 * @param {string} message - Error message
 * @param {Error} error - Error object
 */
export function logError(message, error) {
	try {
		if (!isInitialized) return;
		
		// Get error section
		const section = sections['ERRORS'];
		if (!section) {
			createSection('ERRORS');
			return logError(message, error);
		}
		
		// Create error item
		const errorItem = document.createElement('div');
		errorItem.className = 'debug-error';
		errorItem.style.color = '#ff0000';
		errorItem.style.marginBottom = '5px';
		
		// Add timestamp
		const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
		errorItem.textContent = `[${timestamp}] ${message}`;
		
		// Add error details if available
		if (error) {
			const details = document.createElement('div');
			details.style.marginLeft = '10px';
			details.style.fontSize = '10px';
			details.style.color = '#ff6666';
			details.textContent = error.message || error.toString();
			errorItem.appendChild(details);
		}
		
		// Add to section content
		section.content.appendChild(errorItem);
		
		// Auto-scroll to bottom
		section.content.scrollTop = section.content.scrollHeight;
	} catch (e) {
		console.error('Error logging to debug panel:', e);
	}
}

/**
 * Update FPS counter
 */
export function updateFPS() {
	try {
		if (!isInitialized || !isVisible) return;
		
		// Calculate FPS
		const now = performance.now();
		frameCount++;
		
		if (now - lastUpdateTime >= 1000) {
			fps = Math.round((frameCount * 1000) / (now - lastUpdateTime));
			frameCount = 0;
			lastUpdateTime = now;
			
			// Update performance section
			updateSection('PERFORMANCE', {
				'FPS': fps
			});
		}
	} catch (error) {
		console.error('Error updating FPS:', error);
	}
}

/**
 * Clear all debug panel content
 */
export function clear() {
	try {
		if (!isInitialized) return;
		
		// Clear all sections
		Object.values(sections).forEach(section => {
			section.content.innerHTML = '';
			section.data = {};
		});
	} catch (error) {
		console.error('Error clearing debug panel:', error);
	}
}

export function update(gameState) {
	if (!debugPanelElement || debugPanelElement.style.display === 'none') {
		return;
	}
	return;
	// Update FPS counter
	const now = performance.now();
	frameCount++;
	
	if (now - lastUpdateTime >= 1000) {
		fps = Math.round((frameCount * 1000) / (now - lastUpdateTime));
		frameCount = 0;
		lastUpdateTime = now;
	}
	
	// Get the content container
	const content = document.getElementById('debug-content');
	
	// Clear the content	
	content.innerHTML = '';
	
	// Add FPS counter
	addDebugSection(content, 'Performance', [
		`FPS: ${fps}`,
		`Delta Time: ${window.deltaTime ? window.deltaTime.toFixed(4) : 'N/A'} s`
	]);
	
	// Add game state information
	addDebugSection(content, 'Game State', [
		`Game Mode: ${gameState.isOfflineMode ? 'Offline' : 'Online'}`,
		`Game Status: ${gameState.isGameOver ? 'Game Over' : gameState.isPaused ? 'Paused' : 'Running'}`,
		`Game ID: ${gameState.gameId || 'N/A'}`
	]);
}


// Export the module
export default {
	init,
	toggle,
	isVisible,
	isInitialized,
	createSection,
	updateSection,
	logError,
	updateFPS,
	clear,
	update
}; 