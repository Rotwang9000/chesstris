/**
 * Debug Panel Module
 * 
 * Provides a visual panel for debugging game state and performance.
 * This panel can be toggled on/off with a keyboard shortcut.
 */

// Debug panel element
let debugPanelElement = null;

// FPS counter
let fpsCounter = 0;
let lastFpsUpdate = 0;
let currentFps = 0;

/**
 * Initialize the debug panel
 */
export function init() {
	console.log('Initializing debug panel');
	
	// Create the debug panel element if it doesn't exist
	if (!debugPanelElement) {
		debugPanelElement = document.createElement('div');
		debugPanelElement.id = 'debug-panel';
		debugPanelElement.className = 'debug-panel';
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
		debugPanelElement.style.borderRadius = '5px';
		debugPanelElement.style.display = 'none'; // Hidden by default
		
		// Add a header
		const header = document.createElement('div');
		header.style.fontWeight = 'bold';
		header.style.marginBottom = '10px';
		header.style.borderBottom = '1px solid #444';
		header.style.paddingBottom = '5px';
		header.textContent = 'Shaktris Debug Panel';
		debugPanelElement.appendChild(header);
		
		// Add content container
		const content = document.createElement('div');
		content.id = 'debug-content';
		debugPanelElement.appendChild(content);
		
		// Add to the document
		document.body.appendChild(debugPanelElement);
		
		// Add keyboard shortcut to toggle the panel (F9)
		document.addEventListener('keydown', (event) => {
			if (event.key === 'F9') {
				event.preventDefault();
				toggleDebugPanel();
			}
		});
		
		console.log('Debug panel created');
	}
	
	// Make the updateDebugPanel function available globally
	window.updateDebugPanel = updateDebugPanel;
}

/**
 * Toggle the debug panel visibility
 */
export function toggleDebugPanel() {
	if (debugPanelElement) {
		debugPanelElement.style.display = debugPanelElement.style.display === 'none' ? 'block' : 'none';
		console.log(`Debug panel ${debugPanelElement.style.display === 'none' ? 'hidden' : 'shown'}`);
	}
}

/**
 * Update the debug panel with the current game state
 * @param {Object} gameState - The current game state
 */
export function updateDebugPanel(gameState) {
	if (!debugPanelElement || debugPanelElement.style.display === 'none') {
		return;
	}
	
	// Update FPS counter
	const now = performance.now();
	fpsCounter++;
	
	if (now - lastFpsUpdate >= 1000) {
		currentFps = Math.round(fpsCounter * 1000 / (now - lastFpsUpdate));
		fpsCounter = 0;
		lastFpsUpdate = now;
	}
	
	// Get the content container
	const content = document.getElementById('debug-content');
	
	// Clear the content
	content.innerHTML = '';
	
	// Add FPS counter
	addDebugSection(content, 'Performance', [
		`FPS: ${currentFps}`,
		`Delta Time: ${window.deltaTime ? window.deltaTime.toFixed(4) : 'N/A'} s`
	]);
	
	// Add game state information
	addDebugSection(content, 'Game State', [
		`Game Mode: ${gameState.isOfflineMode ? 'Offline' : 'Online'}`,
		`Game Status: ${gameState.isGameOver ? 'Game Over' : gameState.isPaused ? 'Paused' : 'Running'}`,
		`Game ID: ${gameState.gameId || 'N/A'}`
	]);
	
	// Add board information
	const boardInfo = [];
	if (gameState.board) {
		boardInfo.push(`Dimensions: ${gameState.board[0]?.length || 0} x ${gameState.board.length || 0}`);
		
		// Count filled cells
		let filledCells = 0;
		gameState.board.forEach(row => {
			row.forEach(cell => {
				if (cell && cell.piece) {
					filledCells++;
				}
			});
		});
		boardInfo.push(`Filled Cells: ${filledCells}`);
	}
	addDebugSection(content, 'Board', boardInfo);
	
	// Add player information
	const playerInfo = [];
	if (gameState.players) {
		Object.keys(gameState.players).forEach(playerId => {
			const player = gameState.players[playerId];
			playerInfo.push(`Player ${playerId}${player.isLocal ? ' (You)' : ''}:`);
			playerInfo.push(`  Name: ${player.name || 'Anonymous'}`);
			playerInfo.push(`  Score: ${player.score || 0}`);
			playerInfo.push(`  Resources: ${player.resources || 0}`);
		});
	}
	addDebugSection(content, 'Players', playerInfo);
	
	// Add tetromino information
	const tetrominoInfo = [];
	if (gameState.fallingPiece) {
		tetrominoInfo.push(`Type: ${gameState.fallingPiece.type}`);
		tetrominoInfo.push(`Position: (${gameState.fallingPiece.x}, ${gameState.fallingPiece.y})`);
		tetrominoInfo.push(`Rotation: ${gameState.fallingPiece.rotation}`);
	} else {
		tetrominoInfo.push('No falling piece');
	}
	addDebugSection(content, 'Current Tetromino', tetrominoInfo);
	
	// Add next tetromino information
	const nextTetrominoInfo = [];
	if (gameState.nextPiece) {
		nextTetrominoInfo.push(`Type: ${gameState.nextPiece.type}`);
	} else {
		nextTetrominoInfo.push('No next piece');
	}
	addDebugSection(content, 'Next Tetromino', nextTetrominoInfo);
	
	// Add home zone information
	const homeZoneInfo = [];
	if (gameState.homeZones) {
		Object.keys(gameState.homeZones).forEach(playerId => {
			const homeZone = gameState.homeZones[playerId];
			homeZoneInfo.push(`Player ${playerId}:`);
			homeZoneInfo.push(`  Position: (${homeZone.x}, ${homeZone.y})`);
			homeZoneInfo.push(`  Size: ${homeZone.width} x ${homeZone.height}`);
		});
	}
	addDebugSection(content, 'Home Zones', homeZoneInfo);
}

/**
 * Add a section to the debug panel
 * @param {HTMLElement} container - The container element
 * @param {string} title - The section title
 * @param {Array<string>} lines - The lines of text to display
 */
function addDebugSection(container, title, lines) {
	// Create section container
	const section = document.createElement('div');
	section.style.marginBottom = '10px';
	
	// Add section title
	const sectionTitle = document.createElement('div');
	sectionTitle.style.fontWeight = 'bold';
	sectionTitle.style.marginBottom = '5px';
	sectionTitle.style.color = '#aaa';
	sectionTitle.textContent = title;
	section.appendChild(sectionTitle);
	
	// Add section content
	const sectionContent = document.createElement('div');
	sectionContent.style.marginLeft = '10px';
	
	// Add lines
	if (lines && lines.length > 0) {
		lines.forEach(line => {
			const lineElement = document.createElement('div');
			lineElement.textContent = line;
			sectionContent.appendChild(lineElement);
		});
	} else {
		const lineElement = document.createElement('div');
		lineElement.textContent = 'No data available';
		lineElement.style.fontStyle = 'italic';
		sectionContent.appendChild(lineElement);
	}
	
	section.appendChild(sectionContent);
	container.appendChild(section);
}

// Initialize the debug panel when the module is loaded
if (typeof window !== 'undefined') {
	window.addEventListener('DOMContentLoaded', init);
}

// Export the update function for global access
export default {
	init,
	toggleDebugPanel,
	updateDebugPanel
}; 