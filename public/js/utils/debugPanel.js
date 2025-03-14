/**
 * Debug Panel
 * 
 * Provides a debug panel for monitoring game state and performance.
 */

import { GAME_CONSTANTS } from '../core/constants.js';
import * as GameManager from '../core/gameManager.js';
import * as TetrominoManager from '../core/tetrominoManager.js';
import * as ChessPieceManager from '../core/chessPieceManager.js';
import * as PlayerManager from '../core/playerManager.js';
import * as Network from './network.js';
import * as SessionManager from './sessionManager.js';

// Debug panel state
let isInitialized = false;
let isVisible = false;
let panelElement = null;
let statsInstance = null;
let lastUpdateTime = 0;
let updateInterval = 500; // Update every 500ms

/**
 * Initialize the debug panel
 */
export function init() {
	try {
		if (isInitialized) {
			return;
		}
		
		console.log('Initializing debug panel...');
		
		// Create panel element if it doesn't exist
		if (!panelElement) {
			createPanelElement();
		}
		
		// Initialize Stats.js if available
		if (typeof Stats !== 'undefined') {
			statsInstance = new Stats();
			statsInstance.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
			document.body.appendChild(statsInstance.dom);
			statsInstance.dom.style.position = 'absolute';
			statsInstance.dom.style.top = '0px';
			statsInstance.dom.style.right = '0px';
			statsInstance.dom.style.left = 'auto';
			
			// Hide by default
			statsInstance.dom.style.display = 'none';
		}
		
		// Set up keyboard shortcut (F9)
		document.addEventListener('keydown', (event) => {
			if (event.key === 'F9') {
				event.preventDefault();
				toggle();
			}
		});
		
		isInitialized = true;
		console.log('Debug panel initialized');
	} catch (error) {
		console.error('Error initializing debug panel:', error);
	}
}

/**
 * Create the panel element
 */
function createPanelElement() {
	try {
		// Create panel container
		panelElement = document.createElement('div');
		panelElement.id = 'debug-panel';
		panelElement.style.position = 'fixed';
		panelElement.style.top = '10px';
		panelElement.style.left = '10px';
		panelElement.style.width = '300px';
		panelElement.style.maxHeight = '80vh';
		panelElement.style.overflowY = 'auto';
		panelElement.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
		panelElement.style.color = '#00FF00';
		panelElement.style.fontFamily = 'monospace';
		panelElement.style.fontSize = '12px';
		panelElement.style.padding = '10px';
		panelElement.style.borderRadius = '5px';
		panelElement.style.zIndex = '9999';
		panelElement.style.display = 'none';
		
		// Create sections
		const sections = [
			'connection',
			'game',
			'player',
			'board',
			'tetromino',
			'chess',
			'performance'
		];
		
		sections.forEach(section => {
			const sectionElement = document.createElement('div');
			sectionElement.id = `debug-${section}`;
			sectionElement.className = 'debug-section';
			sectionElement.style.marginBottom = '10px';
			
			const titleElement = document.createElement('div');
			titleElement.className = 'debug-section-title';
			titleElement.textContent = section.toUpperCase();
			titleElement.style.fontWeight = 'bold';
			titleElement.style.borderBottom = '1px solid #00FF00';
			titleElement.style.marginBottom = '5px';
			
			const contentElement = document.createElement('div');
			contentElement.id = `debug-${section}-content`;
			contentElement.className = 'debug-section-content';
			
			sectionElement.appendChild(titleElement);
			sectionElement.appendChild(contentElement);
			panelElement.appendChild(sectionElement);
		});
		
		// Add close button
		const closeButton = document.createElement('button');
		closeButton.textContent = 'Close';
		closeButton.style.backgroundColor = '#333';
		closeButton.style.color = '#FFF';
		closeButton.style.border = 'none';
		closeButton.style.padding = '5px 10px';
		closeButton.style.cursor = 'pointer';
		closeButton.style.marginTop = '10px';
		closeButton.addEventListener('click', () => {
			hide();
		});
		
		panelElement.appendChild(closeButton);
		
		// Add to document
		document.body.appendChild(panelElement);
	} catch (error) {
		console.error('Error creating debug panel element:', error);
	}
}

/**
 * Update the debug panel
 */
export function update() {
	try {
		if (!isInitialized || !isVisible) {
			return;
		}
		
		const now = performance.now();
		if (now - lastUpdateTime < updateInterval) {
			return;
		}
		
		lastUpdateTime = now;
		
		// Update Stats.js
		if (statsInstance) {
			statsInstance.update();
		}
		
		// Update connection section
		updateConnectionSection();
		
		// Update game section
		updateGameSection();
		
		// Update player section
		updatePlayerSection();
		
		// Update board section
		updateBoardSection();
		
		// Update tetromino section
		updateTetrominoSection();
		
		// Update chess section
		updateChessSection();
		
		// Update performance section
		updatePerformanceSection();
	} catch (error) {
		console.error('Error updating debug panel:', error);
	}
}

/**
 * Update connection section
 */
function updateConnectionSection() {
	try {
		const content = document.getElementById('debug-connection-content');
		if (!content) return;
		
		const isConnected = Network.isSocketConnected();
		const socketId = Network.getSocketId() || 'N/A';
		const sessionId = SessionManager.getPlayerId() || 'N/A';
		
		content.innerHTML = `
			<div>Connected: <span style="color: ${isConnected ? '#00FF00' : '#FF0000'}">${isConnected}</span></div>
			<div>Socket ID: ${socketId}</div>
			<div>Session ID: ${sessionId}</div>
		`;
	} catch (error) {
		console.error('Error updating connection section:', error);
	}
}

/**
 * Update game section
 */
function updateGameSection() {
	try {
		const content = document.getElementById('debug-game-content');
		if (!content) return;
		
		const gameState = GameManager.getGameState() || 'N/A';
		const isPaused = GameManager.gameIsPaused();
		const isGameOver = GameManager.getGameOverState();
		const renderMode = GameManager.getRenderMode() || 'N/A';
		const score = GameManager.getScore() || 0;
		const level = GameManager.getLevel() || 1;
		
		content.innerHTML = `
			<div>State: ${gameState}</div>
			<div>Paused: ${isPaused}</div>
			<div>Game Over: ${isGameOver}</div>
			<div>Render Mode: ${renderMode}</div>
			<div>Score: ${score}</div>
			<div>Level: ${level}</div>
		`;
	} catch (error) {
		console.error('Error updating game section:', error);
	}
}

/**
 * Update player section
 */
function updatePlayerSection() {
	try {
		const content = document.getElementById('debug-player-content');
		if (!content) return;
		
		const playerId = PlayerManager.getPlayerId() || 'N/A';
		const playerName = PlayerManager.getPlayerName() || 'N/A';
		const score = PlayerManager.getScore() || 0;
		const level = PlayerManager.getLevel() || 1;
		const lines = PlayerManager.getLines() || 0;
		
		content.innerHTML = `
			<div>ID: ${playerId}</div>
			<div>Name: ${playerName}</div>
			<div>Score: ${score}</div>
			<div>Level: ${level}</div>
			<div>Lines: ${lines}</div>
		`;
	} catch (error) {
		console.error('Error updating player section:', error);
	}
}

/**
 * Update board section
 */
function updateBoardSection() {
	try {
		const content = document.getElementById('debug-board-content');
		if (!content) return;
		
		const boardWidth = GAME_CONSTANTS.BOARD_WIDTH;
		const boardHeight = GAME_CONSTANTS.BOARD_HEIGHT;
		const board = GameManager.getBoard();
		const filledCells = board ? countFilledCells(board) : 0;
		const homeZones = ChessPieceManager.getHomeZones ? ChessPieceManager.getHomeZones() : [];
		
		content.innerHTML = `
			<div>Dimensions: ${boardWidth}x${boardHeight}</div>
			<div>Filled Cells: ${filledCells}</div>
			<div>Home Zones: ${homeZones.length}</div>
		`;
	} catch (error) {
		console.error('Error updating board section:', error);
	}
}

/**
 * Count filled cells in the board
 * @param {Array} board - Game board
 * @returns {number} - Number of filled cells
 */
function countFilledCells(board) {
	try {
		let count = 0;
		
		for (let y = 0; y < board.length; y++) {
			for (let x = 0; x < board[y].length; x++) {
				if (board[y][x]) {
					count++;
				}
			}
		}
		
		return count;
	} catch (error) {
		console.error('Error counting filled cells:', error);
		return 0;
	}
}

/**
 * Update tetromino section
 */
function updateTetrominoSection() {
	try {
		const content = document.getElementById('debug-tetromino-content');
		if (!content) return;
		
		const currentPiece = TetrominoManager.getCurrentPiece ? TetrominoManager.getCurrentPiece() : null;
		const nextPieces = TetrominoManager.getNextPieces ? TetrominoManager.getNextPieces() : [];
		const heldPiece = TetrominoManager.getHeldPiece ? TetrominoManager.getHeldPiece() : null;
		const canHold = TetrominoManager.canHoldPiece ? TetrominoManager.canHoldPiece() : false;
		
		content.innerHTML = `
			<div>Current: ${currentPiece ? currentPiece.type : 'None'}</div>
			<div>Position: ${currentPiece ? `(${currentPiece.x}, ${currentPiece.y})` : 'N/A'}</div>
			<div>Next: ${nextPieces.map(p => p.type).join(', ') || 'None'}</div>
			<div>Held: ${heldPiece ? heldPiece.type : 'None'}</div>
			<div>Can Hold: ${canHold}</div>
		`;
	} catch (error) {
		console.error('Error updating tetromino section:', error);
	}
}

/**
 * Update chess section
 */
function updateChessSection() {
	try {
		const content = document.getElementById('debug-chess-content');
		if (!content) return;
		
		const pieces = ChessPieceManager.getAllPieces ? ChessPieceManager.getAllPieces() : [];
		const selectedPiece = ChessPieceManager.getSelectedPiece ? ChessPieceManager.getSelectedPiece() : null;
		const piecesByType = groupPiecesByType(pieces);
		
		let html = '';
		
		if (selectedPiece) {
			html += `
				<div>Selected: ${selectedPiece.type} at (${selectedPiece.x}, ${selectedPiece.y})</div>
			`;
		} else {
			html += `<div>Selected: None</div>`;
		}
		
		html += `<div>Total Pieces: ${pieces.length}</div>`;
		
		for (const [type, count] of Object.entries(piecesByType)) {
			html += `<div>${type}: ${count}</div>`;
		}
		
		content.innerHTML = html;
	} catch (error) {
		console.error('Error updating chess section:', error);
	}
}

/**
 * Group pieces by type
 * @param {Array} pieces - Chess pieces
 * @returns {Object} - Pieces grouped by type
 */
function groupPiecesByType(pieces) {
	try {
		const result = {};
		
		for (const piece of pieces) {
			if (!result[piece.type]) {
				result[piece.type] = 0;
			}
			
			result[piece.type]++;
		}
		
		return result;
	} catch (error) {
		console.error('Error grouping pieces by type:', error);
		return {};
	}
}

/**
 * Update performance section
 */
function updatePerformanceSection() {
	try {
		const content = document.getElementById('debug-performance-content');
		if (!content) return;
		
		const fps = statsInstance ? Math.round(1000 / statsInstance.getFPS()) : 'N/A';
		const memory = window.performance && window.performance.memory ? 
			Math.round(window.performance.memory.usedJSHeapSize / (1024 * 1024)) : 'N/A';
		
		content.innerHTML = `
			<div>FPS: ${fps}</div>
			<div>Memory: ${memory !== 'N/A' ? `${memory} MB` : 'N/A'}</div>
			<div>Update Interval: ${updateInterval}ms</div>
		`;
	} catch (error) {
		console.error('Error updating performance section:', error);
	}
}

/**
 * Show the debug panel
 */
export function show() {
	try {
		if (!isInitialized) {
			init();
		}
		
		if (panelElement) {
			panelElement.style.display = 'block';
		}
		
		if (statsInstance) {
			statsInstance.dom.style.display = 'block';
		}
		
		isVisible = true;
		
		// Force an immediate update
		update();
	} catch (error) {
		console.error('Error showing debug panel:', error);
	}
}

/**
 * Hide the debug panel
 */
export function hide() {
	try {
		if (panelElement) {
			panelElement.style.display = 'none';
		}
		
		if (statsInstance) {
			statsInstance.dom.style.display = 'none';
		}
		
		isVisible = false;
	} catch (error) {
		console.error('Error hiding debug panel:', error);
	}
}

/**
 * Toggle the debug panel
 */
export function toggle() {
	try {
		if (isVisible) {
			hide();
		} else {
			show();
		}
	} catch (error) {
		console.error('Error toggling debug panel:', error);
	}
}

/**
 * Check if the debug panel is visible
 * @returns {boolean} - Whether the debug panel is visible
 */
export function isDebugPanelVisible() {
	return isVisible;
}

/**
 * Set the update interval
 * @param {number} interval - Update interval in milliseconds
 */
export function setUpdateInterval(interval) {
	try {
		if (typeof interval === 'number' && interval > 0) {
			updateInterval = interval;
		}
	} catch (error) {
		console.error('Error setting update interval:', error);
	}
}

/**
 * Log a message to the debug panel
 * @param {string} message - Message to log
 * @param {string} level - Log level (info, warn, error)
 */
export function log(message, level = 'info') {
	try {
		if (!isInitialized || !isVisible) {
			return;
		}
		
		const logElement = document.createElement('div');
		logElement.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
		
		switch (level) {
			case 'warn':
				logElement.style.color = '#FFFF00';
				break;
			case 'error':
				logElement.style.color = '#FF0000';
				break;
			default:
				logElement.style.color = '#00FF00';
		}
		
		const logContainer = document.getElementById('debug-log-content');
		if (logContainer) {
			logContainer.appendChild(logElement);
			
			// Limit the number of log entries
			while (logContainer.children.length > 50) {
				logContainer.removeChild(logContainer.firstChild);
			}
			
			// Scroll to bottom
			logContainer.scrollTop = logContainer.scrollHeight;
		}
	} catch (error) {
		console.error('Error logging to debug panel:', error);
	}
} 