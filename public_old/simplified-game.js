/**
 * Simplified Game Entry Point for Shaktris
 * 
 * This is a streamlined version of the game that focuses on core functionality
 * without the complexity of multiple rendering modes, etc.
 */

import * as GameManager from './js/core/gameManager.js';
import * as PlayerManager from './js/core/playerManager.js';
import * as TetrominoManager from './js/core/tetrominoManager.js';
import * as ChessPieceManager from './js/core/chessPieceManager.js';
import * as InputController from './js/core/inputController.js';
import * as DebugPanel from './js/utils/debugPanel.js';
import * as SoundManager from './js/utils/soundManager.js';
import * as Renderer2D from './js/rendering/renderer2d.js';

// Force 2D mode to avoid Three.js dependency
window.is2DMode = true;

// Game state
let isInitialized = false;
let isRunning = false;
let debugMode = false;

// Performance tracking
let lastUpdateTime = 0;
let frameCount = 0;
let fps = 0;
let fpsUpdateTime = 0;

// Game board
let gameBoard;
let boardWidth = 10;
let boardHeight = 20;
let cellSize = 30;

/**
 * Initialize the game
 */
async function initGame() {
	try {
		console.log('Initializing game...');
		
		// Create game board
		createGameBoard();
		
		// Initialize modules in the correct order
		await PlayerManager.init();
		console.log('✓ PlayerManager initialized');
		
		await InputController.init();
		console.log('✓ InputController initialized');
		
		await ChessPieceManager.init({
			boardSize: { width: boardWidth, height: boardHeight }
		});
		console.log('✓ ChessPieceManager initialized');
		
		await TetrominoManager.init({
			boardWidth: boardWidth,
			boardHeight: boardHeight,
			initialLevel: 1
		});
		console.log('✓ TetrominoManager initialized');
		
		// Initialize 2D renderer directly
		await Renderer2D.init({
			container: document.getElementById('game-board'),
			width: boardWidth * cellSize,
			height: boardHeight * cellSize,
			cellSize: cellSize
		});
		console.log('✓ Renderer2D initialized');
		
		// Initialize GameManager last
		await GameManager.init({
			renderMode: '2D',
			debug: debugMode,
			container: document.getElementById('game-board')
		});
		console.log('✓ GameManager initialized');
		
		// Initialize optional components
		try {
			await SoundManager.init();
			console.log('✓ SoundManager initialized');
		} catch (e) {
			console.warn('SoundManager initialization failed (non-critical):', e);
		}
		
		try {
			DebugPanel.init();
			console.log('✓ DebugPanel initialized');
		} catch (e) {
			console.warn('DebugPanel initialization failed (non-critical):', e);
		}
		
		// Setup event listeners
		setupEventListeners();
		
		// Set initialization flag
		isInitialized = true;
		
		console.log('Game initialization complete');
		
		// Show ready message
		document.getElementById('status-message').textContent = 'Press Start to begin!';
		document.getElementById('start-button').disabled = false;
		
		// Hide loading screen
		const loadingScreen = document.getElementById('loading-screen');
		if (loadingScreen) {
			loadingScreen.style.display = 'none';
		}
	} catch (error) {
		console.error('Failed to initialize game:', error);
		document.getElementById('status-message').textContent = 'Failed to initialize game. Check console for details.';
	}
}

/**
 * Create game board
 */
function createGameBoard() {
	const gameContainer = document.getElementById('game-container');
	if (!gameContainer) {
		console.error('Game container not found');
		return;
	}
	
	// Create game board
	gameBoard = document.createElement('div');
	gameBoard.id = 'game-board';
	gameBoard.style.width = `${boardWidth * cellSize}px`;
	gameBoard.style.height = `${boardHeight * cellSize}px`;
	gameBoard.style.position = 'relative';
	gameBoard.style.margin = '0 auto';
	gameBoard.style.border = '2px solid #444';
	gameBoard.style.backgroundColor = '#111';
	
	// Add to container
	gameContainer.appendChild(gameBoard);
	
	// Create grid cells
	for (let y = 0; y < boardHeight; y++) {
		for (let x = 0; x < boardWidth; x++) {
			const cell = document.createElement('div');
			cell.className = 'cell';
			cell.style.width = `${cellSize}px`;
			cell.style.height = `${cellSize}px`;
			cell.style.position = 'absolute';
			cell.style.left = `${x * cellSize}px`;
			cell.style.top = `${y * cellSize}px`;
			cell.style.border = '1px solid rgba(255, 255, 255, 0.1)';
			
			gameBoard.appendChild(cell);
		}
	}
}

/**
 * Start the game loop
 */
function startGame() {
	try {
		if (!isInitialized) {
			console.error('Game not initialized');
			return;
		}
		
		if (isRunning) {
			console.log('Game already running');
			return;
		}
		
		console.log('Starting game...');
		
		// Start the game manager
		GameManager.startGame();
		
		// Set running flag
		isRunning = true;
		
		// Start game loop
		lastUpdateTime = performance.now();
		requestAnimationFrame(gameLoop);
		
		// Update UI
		document.getElementById('status-message').textContent = 'Game running';
		document.getElementById('start-button').disabled = true;
		document.getElementById('pause-button').disabled = false;
	} catch (error) {
		console.error('Failed to start game:', error);
		document.getElementById('status-message').textContent = 'Failed to start game. Check console for details.';
	}
}

/**
 * Game loop
 * @param {number} timestamp - Current timestamp
 */
function gameLoop(timestamp) {
	try {
		if (!isRunning) {
			return;
		}
		
		// Calculate delta time
		const deltaTime = timestamp - lastUpdateTime;
		lastUpdateTime = timestamp;
		
		// Update FPS counter
		frameCount++;
		if (timestamp - fpsUpdateTime > 1000) {
			fps = Math.round((frameCount * 1000) / (timestamp - fpsUpdateTime));
			fpsUpdateTime = timestamp;
			frameCount = 0;
			
			// Update FPS display if it exists
			const fpsDisplay = document.getElementById('fps-display');
			if (fpsDisplay) {
				fpsDisplay.textContent = `${fps} FPS`;
			}
		}
		
		// Update game state
		GameManager.update(deltaTime);
		
		// Render game state directly with 2D renderer
		try {
			const gameState = {
				board: ChessPieceManager.getBoard(),
				currentPiece: TetrominoManager.getCurrentPiece(),
				nextPiece: TetrominoManager.getNextPiece(),
				score: GameManager.getScore(),
				level: GameManager.getLevel(),
				lines: GameManager.getLines()
			};
			
			Renderer2D.render(gameState);
		} catch (renderError) {
			console.error('Error rendering game:', renderError);
		}
		
		// Update debug panel if available
		updateDebugPanel();
		
		// Continue game loop
		requestAnimationFrame(gameLoop);
	} catch (error) {
		console.error('Error in game loop:', error);
		isRunning = false;
		document.getElementById('status-message').textContent = 'Game crashed. Check console for details.';
	}
}

/**
 * Update debug panel
 */
function updateDebugPanel() {
	try {
		// Only update every 10 frames to avoid performance impact
		if (frameCount % 10 !== 0) return;
		
		// Ensure debug panel is initialized and visible
		if (DebugPanel && typeof DebugPanel.debugPanelVisible === 'function' && DebugPanel.debugPanelVisible()) {
			// Game info section
			DebugPanel.updateSection('Game', {
				'FPS': fps,
				'Frame Time': `${Math.round(performance.now() - lastUpdateTime)}ms`,
				'Game State': GameManager.getGameState(),
				'Score': GameManager.getScore(),
				'Level': GameManager.getLevel(),
				'Lines': GameManager.getLines()
			});
			
			// Tetromino info
			DebugPanel.updateSection('Tetromino', {
				'Current Piece': TetrominoManager.getCurrentPiece()?.type || 'None',
				'Next Piece': TetrominoManager.getNextPiece()?.type || 'None',
				'Position': TetrominoManager.getCurrentPiece() ? 
					`(${TetrominoManager.getCurrentPiece().x}, ${TetrominoManager.getCurrentPiece().y})` : 'N/A',
				'Rotation': TetrominoManager.getCurrentPiece()?.rotation || 0
			});
			
			// Chess info
			DebugPanel.updateSection('Chess', {
				'Pieces': ChessPieceManager.getPieceCount(),
				'King Position': ChessPieceManager.getKingPosition() ? 
					`(${ChessPieceManager.getKingPosition().x}, ${ChessPieceManager.getKingPosition().y})` : 'N/A'
			});
		}
	} catch (error) {
		// Don't log errors here to avoid console spam
		// Just fail silently - debug panel is non-critical
	}
}

/**
 * Log error to debug panel
 * @param {string} message - Error message
 * @param {Error} error - Error object
 */
function logErrorToDebugPanel(message, error) {
	try {
		if (DebugPanel && typeof DebugPanel.debugPanelInitialized === 'function' && DebugPanel.debugPanelInitialized()) {
			DebugPanel.logError(message, error);
		}
	} catch (e) {
		// Just log to console if debug panel fails
		console.error(message, error);
	}
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
	try {
		// Start button
		const startButton = document.getElementById('start-button');
		if (startButton) {
			startButton.addEventListener('click', () => {
				startGame();
			});
		}
		
		// Pause button
		const pauseButton = document.getElementById('pause-button');
		if (pauseButton) {
			pauseButton.addEventListener('click', () => {
				if (isRunning) {
					GameManager.pauseGame();
					pauseButton.textContent = 'Resume';
					document.getElementById('status-message').textContent = 'Game paused';
				} else {
					GameManager.resumeGame();
					pauseButton.textContent = 'Pause';
					document.getElementById('status-message').textContent = 'Game running';
					
					// Restart game loop if needed
					if (!isRunning) {
						isRunning = true;
						lastUpdateTime = performance.now();
						requestAnimationFrame(gameLoop);
					}
				}
			});
		}
		
		// Restart button
		const restartButton = document.getElementById('restart-button');
		if (restartButton) {
			restartButton.addEventListener('click', () => {
				GameManager.restartGame();
				
				if (!isRunning) {
					isRunning = true;
					lastUpdateTime = performance.now();
					requestAnimationFrame(gameLoop);
				}
				
				document.getElementById('status-message').textContent = 'Game restarted';
				pauseButton.textContent = 'Pause';
			});
		}
		
		// Debug button
		const debugButton = document.getElementById('debug-button');
		if (debugButton) {
			debugButton.addEventListener('click', () => {
				if (DebugPanel && typeof DebugPanel.toggle === 'function') {
					DebugPanel.toggle();
				}
			});
		}
		
		// Keyboard shortcuts
		window.addEventListener('keydown', (event) => {
			// Game controls are handled by InputController
			
			// Debug panel toggle (F9)
			if (event.key === 'F9') {
				if (DebugPanel && typeof DebugPanel.toggle === 'function') {
					DebugPanel.toggle();
				}
			}
			
			// Pause game (Escape)
			if (event.key === 'Escape') {
				if (GameManager.isPaused()) {
					GameManager.resumeGame();
					if (pauseButton) pauseButton.textContent = 'Pause';
					document.getElementById('status-message').textContent = 'Game running';
					
					// Restart game loop if needed
					if (!isRunning) {
						isRunning = true;
						lastUpdateTime = performance.now();
						requestAnimationFrame(gameLoop);
					}
				} else if (isRunning) {
					GameManager.pauseGame();
					if (pauseButton) pauseButton.textContent = 'Resume';
					document.getElementById('status-message').textContent = 'Game paused';
				}
			}
		});
		
		// Window resize
		window.addEventListener('resize', () => {
			// Let GameManager handle resize logic
			if (GameManager && typeof GameManager.handleResize === 'function') {
				GameManager.handleResize();
			}
		});
		
		// Game state change events
		window.addEventListener('game-over', () => {
			isRunning = false;
			document.getElementById('status-message').textContent = 'Game over';
			document.getElementById('start-button').disabled = false;
			document.getElementById('pause-button').disabled = true;
		});
		
		// Handle player join/leave events
		window.addEventListener('player-joined', (event) => {
			console.log('Player joined:', event.detail.playerId);
		});
		
		window.addEventListener('player-left', (event) => {
			console.log('Player left:', event.detail.playerId);
		});
	} catch (error) {
		console.error('Error setting up event listeners:', error);
		logErrorToDebugPanel('Failed to set up event listeners', error);
	}
}

// Initialize game when the page loads
window.addEventListener('DOMContentLoaded', () => {
	// Create UI if it doesn't exist
	if (!document.getElementById('game-container')) {
		createGameUI();
	}
	
	// Initialize game
	initGame();
});

/**
 * Create basic game UI
 */
function createGameUI() {
	const body = document.body;
	
	// Set body styles
	body.style.margin = '0';
	body.style.padding = '0';
	body.style.overflow = 'hidden';
	body.style.fontFamily = 'Arial, sans-serif';
	body.style.backgroundColor = '#1a1a1a';
	body.style.color = '#fff';
	
	// Create main container
	const mainContainer = document.createElement('div');
	mainContainer.id = 'main-container';
	mainContainer.style.display = 'flex';
	mainContainer.style.flexDirection = 'column';
	mainContainer.style.height = '100vh';
	mainContainer.style.width = '100vw';
	body.appendChild(mainContainer);
	
	// Create header
	const header = document.createElement('header');
	header.style.padding = '10px';
	header.style.backgroundColor = '#333';
	header.style.display = 'flex';
	header.style.justifyContent = 'space-between';
	header.style.alignItems = 'center';
	mainContainer.appendChild(header);
	
	// Game title
	const gameTitle = document.createElement('h1');
	gameTitle.textContent = 'SHAKTRIS';
	gameTitle.style.margin = '0';
	gameTitle.style.fontSize = '24px';
	header.appendChild(gameTitle);
	
	// Controls
	const controls = document.createElement('div');
	controls.style.display = 'flex';
	controls.style.gap = '10px';
	header.appendChild(controls);
	
	// Start button
	const startButton = document.createElement('button');
	startButton.id = 'start-button';
	startButton.textContent = 'Start';
	startButton.disabled = true;
	styleButton(startButton);
	controls.appendChild(startButton);
	
	// Pause button
	const pauseButton = document.createElement('button');
	pauseButton.id = 'pause-button';
	pauseButton.textContent = 'Pause';
	pauseButton.disabled = true;
	styleButton(pauseButton);
	controls.appendChild(pauseButton);
	
	// Restart button
	const restartButton = document.createElement('button');
	restartButton.id = 'restart-button';
	restartButton.textContent = 'Restart';
	styleButton(restartButton);
	controls.appendChild(restartButton);
	
	// Debug button
	const debugButton = document.createElement('button');
	debugButton.id = 'debug-button';
	debugButton.textContent = 'Debug';
	styleButton(debugButton);
	controls.appendChild(debugButton);
	
	// Main content area (flex layout)
	const content = document.createElement('div');
	content.style.display = 'flex';
	content.style.flex = '1';
	content.style.overflow = 'hidden';
	mainContainer.appendChild(content);
	
	// Game canvas container (center, main area)
	const gameContainer = document.createElement('div');
	gameContainer.id = 'game-container';
	gameContainer.style.flex = '1';
	gameContainer.style.position = 'relative';
	gameContainer.style.backgroundColor = '#000';
	gameContainer.style.display = 'flex';
	gameContainer.style.justifyContent = 'center';
	gameContainer.style.alignItems = 'center';
	content.appendChild(gameContainer);
	
	// Sidebar (right side)
	const sidebar = document.createElement('div');
	sidebar.style.width = '250px';
	sidebar.style.backgroundColor = '#2a2a2a';
	sidebar.style.padding = '20px';
	sidebar.style.display = 'flex';
	sidebar.style.flexDirection = 'column';
	sidebar.style.gap = '20px';
	content.appendChild(sidebar);
	
	// Status section
	const statusSection = document.createElement('div');
	statusSection.style.marginBottom = '20px';
	sidebar.appendChild(statusSection);
	
	const statusTitle = document.createElement('h2');
	statusTitle.textContent = 'Status';
	statusTitle.style.marginBottom = '10px';
	statusTitle.style.fontSize = '18px';
	statusTitle.style.borderBottom = '1px solid #444';
	statusTitle.style.paddingBottom = '5px';
	statusSection.appendChild(statusTitle);
	
	const statusMessage = document.createElement('div');
	statusMessage.id = 'status-message';
	statusMessage.textContent = 'Initializing...';
	statusMessage.style.marginBottom = '10px';
	statusSection.appendChild(statusMessage);
	
	const fpsDisplay = document.createElement('div');
	fpsDisplay.id = 'fps-display';
	fpsDisplay.textContent = '0 FPS';
	fpsDisplay.style.fontSize = '14px';
	fpsDisplay.style.color = '#aaa';
	statusSection.appendChild(fpsDisplay);
	
	// Score section
	const scoreSection = document.createElement('div');
	sidebar.appendChild(scoreSection);
	
	const scoreTitle = document.createElement('h2');
	scoreTitle.textContent = 'Score';
	scoreTitle.style.marginBottom = '10px';
	scoreTitle.style.fontSize = '18px';
	scoreTitle.style.borderBottom = '1px solid #444';
	scoreTitle.style.paddingBottom = '5px';
	scoreSection.appendChild(scoreTitle);
	
	// Create score display items
	createScoreItem(scoreSection, 'Score', 'score-value', '0');
	createScoreItem(scoreSection, 'Level', 'level-value', '1');
	createScoreItem(scoreSection, 'Lines', 'lines-value', '0');
	
	// Next piece section
	const nextPieceSection = document.createElement('div');
	sidebar.appendChild(nextPieceSection);
	
	const nextPieceTitle = document.createElement('h2');
	nextPieceTitle.textContent = 'Next Piece';
	nextPieceTitle.style.marginBottom = '10px';
	nextPieceTitle.style.fontSize = '18px';
	nextPieceTitle.style.borderBottom = '1px solid #444';
	nextPieceTitle.style.paddingBottom = '5px';
	nextPieceSection.appendChild(nextPieceTitle);
	
	const nextPieceDisplay = document.createElement('div');
	nextPieceDisplay.id = 'next-piece-display';
	nextPieceDisplay.style.width = '100px';
	nextPieceDisplay.style.height = '100px';
	nextPieceDisplay.style.backgroundColor = '#111';
	nextPieceDisplay.style.margin = '0 auto';
	nextPieceSection.appendChild(nextPieceDisplay);
	
	// Controls help section
	const controlsSection = document.createElement('div');
	sidebar.appendChild(controlsSection);
	
	const controlsTitle = document.createElement('h2');
	controlsTitle.textContent = 'Controls';
	controlsTitle.style.marginBottom = '10px';
	controlsTitle.style.fontSize = '18px';
	controlsTitle.style.borderBottom = '1px solid #444';
	controlsTitle.style.paddingBottom = '5px';
	controlsSection.appendChild(controlsTitle);
	
	const controlsList = document.createElement('ul');
	controlsList.style.padding = '0 0 0 20px';
	controlsList.style.margin = '0';
	controlsList.style.fontSize = '14px';
	controlsList.style.color = '#aaa';
	controlsSection.appendChild(controlsList);
	
	// Add control items
	const controls2 = [
		{ key: '←/→', action: 'Move piece' },
		{ key: '↑', action: 'Rotate piece' },
		{ key: '↓', action: 'Soft drop' },
		{ key: 'Space', action: 'Hard drop' },
		{ key: 'C', action: 'Hold piece' },
		{ key: 'Esc', action: 'Pause game' },
		{ key: 'F9', action: 'Toggle debug panel' }
	];
	
	controls2.forEach(control => {
		const item = document.createElement('li');
		item.innerHTML = `<strong>${control.key}</strong>: ${control.action}`;
		item.style.marginBottom = '5px';
		controlsList.appendChild(item);
	});
	
	// Create debug panel
	const debugPanel = document.createElement('div');
	debugPanel.id = 'debug-panel';
	debugPanel.style.display = 'none';
	body.appendChild(debugPanel);
	
	// Loading screen (initially visible)
	const loadingScreen = document.createElement('div');
	loadingScreen.id = 'loading-screen';
	loadingScreen.style.position = 'fixed';
	loadingScreen.style.top = '0';
	loadingScreen.style.left = '0';
	loadingScreen.style.width = '100%';
	loadingScreen.style.height = '100%';
	loadingScreen.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
	loadingScreen.style.display = 'flex';
	loadingScreen.style.flexDirection = 'column';
	loadingScreen.style.justifyContent = 'center';
	loadingScreen.style.alignItems = 'center';
	loadingScreen.style.zIndex = '1000';
	loadingScreen.style.color = '#fff';
	
	const loadingTitle = document.createElement('h1');
	loadingTitle.textContent = 'SHAKTRIS';
	loadingTitle.style.fontSize = '48px';
	loadingTitle.style.marginBottom = '20px';
	loadingScreen.appendChild(loadingTitle);
	
	const loadingText = document.createElement('p');
	loadingText.textContent = 'Loading...';
	loadingText.style.fontSize = '24px';
	loadingText.style.marginBottom = '20px';
	loadingScreen.appendChild(loadingText);
	
	// Loading spinner
	const spinner = document.createElement('div');
	spinner.style.width = '50px';
	spinner.style.height = '50px';
	spinner.style.border = '5px solid rgba(255, 255, 255, 0.3)';
	spinner.style.borderRadius = '50%';
	spinner.style.borderTop = '5px solid #fff';
	spinner.style.animation = 'spin 1s linear infinite';
	loadingScreen.appendChild(spinner);
	
	// Add keyframes for spinner animation
	const style = document.createElement('style');
	style.textContent = `
		@keyframes spin {
			0% { transform: rotate(0deg); }
			100% { transform: rotate(360deg); }
		}
	`;
	document.head.appendChild(style);
	
	body.appendChild(loadingScreen);
}

/**
 * Create a score display item
 * @param {HTMLElement} parent - Parent element
 * @param {string} label - Item label
 * @param {string} id - Value element ID
 * @param {string} initialValue - Initial value
 */
function createScoreItem(parent, label, id, initialValue) {
	const item = document.createElement('div');
	item.style.display = 'flex';
	item.style.justifyContent = 'space-between';
	item.style.marginBottom = '10px';
	
	const labelElement = document.createElement('span');
	labelElement.textContent = label + ':';
	
	const valueElement = document.createElement('span');
	valueElement.id = id;
	valueElement.textContent = initialValue;
	valueElement.style.fontWeight = 'bold';
	
	item.appendChild(labelElement);
	item.appendChild(valueElement);
	parent.appendChild(item);
}

/**
 * Style a button
 * @param {HTMLButtonElement} button - Button to style
 */
function styleButton(button) {
	button.style.backgroundColor = '#444';
	button.style.color = '#fff';
	button.style.border = 'none';
	button.style.padding = '8px 12px';
	button.style.borderRadius = '4px';
	button.style.cursor = 'pointer';
	button.style.fontSize = '14px';
	button.style.transition = 'background-color 0.2s';
	
	button.addEventListener('mouseover', () => {
		if (!button.disabled) {
			button.style.backgroundColor = '#555';
		}
	});
	
	button.addEventListener('mouseout', () => {
		if (!button.disabled) {
			button.style.backgroundColor = '#444';
		}
	});
	
	button.addEventListener('mousedown', () => {
		if (!button.disabled) {
			button.style.backgroundColor = '#333';
		}
	});
	
	button.addEventListener('mouseup', () => {
		if (!button.disabled) {
			button.style.backgroundColor = '#555';
		}
	});
}

// Export for access in window context
window.ShaktrisSimple = {
	startGame,
	logError: logErrorToDebugPanel
}; 