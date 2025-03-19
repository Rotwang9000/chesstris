// main.js - Client-side game logic and rendering

// Import network and game state modules
import Network from './js/utils/network-patch.js';
import * as GameState from './js/core/gameState.js';
import * as TetrominoManager from './js/core/tetrominoManager.js';
import * as ChessPieceManager from './js/core/chessPieceManager.js';
import * as GameManager from './js/core/gameManager.js';
import * as Renderer from './js/rendering/renderer.js';
import * as SoundManager from './js/utils/soundManager.js';
import { GAME_CONSTANTS } from './js/core/constants.js';

// ----- Constants -----
const CELL_SIZE = 30;
const DEFAULT_BOARD_WIDTH = 8;
const DEFAULT_BOARD_HEIGHT = 8;

// ----- Game State -----
let playerId = null;
let playerColor = null;
let playerUsername = null;
let selectedPiece = null;
let validMoves = [];
let isGameInitialized = false;
let isConnectedToServer = false;
let animationFrameId = null;

// Initialize the game when the page loads
window.addEventListener('DOMContentLoaded', () => {
	console.log('Initializing application...');
	
	// Wait for socket to be ready before initializing the game
	if (window.socketInitialized) {
		initGame();
	} else {
		window.addEventListener('socketReady', initGame);
	}
});

/**
 * Initialize the game
 */
async function initGame() {
	console.log('Initializing game...');
	
	// Get the container element
	const container = document.getElementById('game-container');
	if (!container) {
		console.error('Game container not found');
		showErrorMessage('Game container not found. Please refresh the page.');
		return;
	}
	
	// Show loading screen
	showLoadingScreen('Initializing game...');
	
	try {
		// Initialize sound manager
		await SoundManager.init({
			volume: 0.5,
			muted: false
		});
		
		// Initialize debug panel
		setupDebugPanel();
		
		// Determine render mode
		let renderMode = GAME_CONSTANTS.RENDER_MODE.MODE_3D;
		if (window.is2DMode) {
			renderMode = GAME_CONSTANTS.RENDER_MODE.MODE_2D;
		}
		
		// Initialize the renderer
		try {
			await Renderer.init(renderMode);
		} catch (rendererError) {
			console.error('Error initializing renderer:', rendererError);
			showErrorMessage('Failed to initialize renderer. Please refresh the page.', rendererError);
			return;
		}
		
		// Initialize the game
		try {
			const gameInitialized = await GameManager.initGame({
				boardWidth: DEFAULT_BOARD_WIDTH,
				boardHeight: DEFAULT_BOARD_HEIGHT,
				cellSize: CELL_SIZE,
				renderMode: renderMode
			});
			
			if (!gameInitialized) {
				showErrorMessage('Failed to initialize game. Please refresh the page.');
				return;
			}
		} catch (gameInitError) {
			console.error('Error initializing game manager:', gameInitError);
			showErrorMessage('Failed to initialize game manager. Please refresh the page.', gameInitError);
			return;
		}
		
		isGameInitialized = true;
		isConnectedToServer = Network.isConnected();
		
		// Set up UI elements
		setupUI();
		
		// Set up event listeners
		setupEventListeners();
		
		// Hide loading screen
		hideLoadingScreen();
		
		// Show welcome message
		showWelcomeMessage();
		
		// Make global objects available for debugging
		window.GameState = GameState;
		window.TetrominoManager = TetrominoManager;
		window.ChessPieceManager = ChessPieceManager;
		window.GameManager = GameManager;
		window.Renderer = Renderer;
		
		console.log('Application initialized');
	} catch (error) {
		console.error('Error initializing game:', error);
		showErrorMessage('Failed to initialize game: ' + error.message, error);
	}
}

/**
 * Set up UI elements
 */
function setupUI() {
	// Create game controls
	const controlsContainer = document.createElement('div');
	controlsContainer.id = 'game-controls';
	controlsContainer.className = 'game-controls';
	
	// Create button container
	const buttonContainer = document.createElement('div');
	buttonContainer.className = 'button-container';
	
	// Start Game button
	const startGameButton = document.createElement('button');
	startGameButton.id = 'start-game-btn';
	startGameButton.textContent = 'Start Game';
	startGameButton.addEventListener('click', startGame);
	buttonContainer.appendChild(startGameButton);
	
	// Pause button
	const pauseButton = document.createElement('button');
	pauseButton.id = 'pause-btn';
	pauseButton.textContent = 'Pause';
	pauseButton.addEventListener('click', togglePause);
	buttonContainer.appendChild(pauseButton);
	
	// Debug button
	const debugButton = document.createElement('button');
	debugButton.id = 'debug-btn';
	debugButton.textContent = 'Debug';
	debugButton.addEventListener('click', toggleDebugPanel);
	buttonContainer.appendChild(debugButton);
	
	// Add render mode buttons
	const renderModeContainer = document.createElement('div');
	renderModeContainer.style.display = 'flex';
	renderModeContainer.style.gap = '20px';
	renderModeContainer.style.marginTop = '20px';
	
	// 2D mode button
	const render2DButton = document.createElement('button');
	render2DButton.textContent = '2D Mode';
	render2DButton.addEventListener('click', () => {
		setRenderMode(GAME_CONSTANTS.RENDER_MODE.MODE_2D);
		
		// Update button styles
		render2DButton.classList.add('active');
		render3DButton.classList.remove('active');
		
		showNotification('Switched to 2D mode');
	});
	
	// 3D mode button
	const render3DButton = document.createElement('button');
	render3DButton.textContent = '3D Mode';
	render3DButton.addEventListener('click', () => {
		setRenderMode(GAME_CONSTANTS.RENDER_MODE.MODE_3D);
		
		// Update button styles
		render3DButton.classList.add('active');
		render2DButton.classList.remove('active');
		
		showNotification('Switched to 3D mode');
	});
	
	// Set initial active button
	if (window.is2DMode) {
		render2DButton.classList.add('active');
	} else {
		render3DButton.classList.add('active');
	}
	
	renderModeContainer.appendChild(render2DButton);
	renderModeContainer.appendChild(render3DButton);
	
	buttonContainer.appendChild(renderModeContainer);
	
	controlsContainer.appendChild(buttonContainer);
	
	// Add controls to the container
	document.getElementById('game-container').appendChild(controlsContainer);
	
	// Create game info display
	setupGameInfoDisplay();
}

/**
 * Set up the game info display
 */
function setupGameInfoDisplay() {
	// Create game info container
	const gameInfoContainer = document.createElement('div');
	gameInfoContainer.id = 'game-info';
	gameInfoContainer.className = 'game-info';
	
	// Score display
	const scoreContainer = document.createElement('div');
	scoreContainer.className = 'info-item';
	
	const scoreLabel = document.createElement('span');
	scoreLabel.className = 'info-label';
	scoreLabel.textContent = 'Score:';
	scoreContainer.appendChild(scoreLabel);
	
	const scoreValue = document.createElement('span');
	scoreValue.id = 'score-value';
	scoreValue.className = 'info-value';
	scoreValue.textContent = '0';
	scoreContainer.appendChild(scoreValue);
	
	gameInfoContainer.appendChild(scoreContainer);
	
	// Level display
	const levelContainer = document.createElement('div');
	levelContainer.className = 'info-item';
	
	const levelLabel = document.createElement('span');
	levelLabel.className = 'info-label';
	levelLabel.textContent = 'Level:';
	levelContainer.appendChild(levelLabel);
	
	const levelValue = document.createElement('span');
	levelValue.id = 'level-value';
	levelValue.className = 'info-value';
	levelValue.textContent = '1';
	levelContainer.appendChild(levelValue);
	
	gameInfoContainer.appendChild(levelContainer);
	
	// Lines cleared display
	const linesContainer = document.createElement('div');
	linesContainer.className = 'info-item';
	
	const linesLabel = document.createElement('span');
	linesLabel.className = 'info-label';
	linesLabel.textContent = 'Lines:';
	linesContainer.appendChild(linesLabel);
	
	const linesValue = document.createElement('span');
	linesValue.id = 'lines-value';
	linesValue.className = 'info-value';
	linesValue.textContent = '0';
	linesContainer.appendChild(linesValue);
	
	gameInfoContainer.appendChild(linesContainer);
	
	// Add game info to the container
	document.getElementById('game-container').appendChild(gameInfoContainer);
}

/**
 * Set up the debug panel
 */
function setupDebugPanel() {
	// Create debug panel container
	const debugPanel = document.createElement('div');
	debugPanel.id = 'debug-panel';
	debugPanel.className = 'debug-panel';
	debugPanel.style.display = 'none'; // Hidden by default
	
	// Debug panel title
	const debugTitle = document.createElement('h3');
	debugTitle.textContent = 'Debug Panel';
	debugPanel.appendChild(debugTitle);
	
	// Close button
	const closeButton = document.createElement('button');
	closeButton.className = 'close-button';
	closeButton.textContent = 'X';
	closeButton.addEventListener('click', () => {
		debugPanel.style.display = 'none';
	});
	debugPanel.appendChild(closeButton);
	
	// Connection status
	const connectionStatus = document.createElement('div');
	connectionStatus.id = 'connection-status';
	connectionStatus.className = 'debug-section';
	
	const connectionTitle = document.createElement('h4');
	connectionTitle.textContent = 'Connection Status';
	connectionStatus.appendChild(connectionTitle);
	
	const connectionInfo = document.createElement('div');
	connectionInfo.id = 'connection-info';
	connectionStatus.appendChild(connectionInfo);
	
	debugPanel.appendChild(connectionStatus);
	
	// Game state
	const gameStateSection = document.createElement('div');
	gameStateSection.id = 'game-state-section';
	gameStateSection.className = 'debug-section';
	
	const gameStateTitle = document.createElement('h4');
	gameStateTitle.textContent = 'Game State';
	gameStateSection.appendChild(gameStateTitle);
	
	const gameStateInfo = document.createElement('div');
	gameStateInfo.id = 'game-state-info';
	gameStateSection.appendChild(gameStateInfo);
	
	debugPanel.appendChild(gameStateSection);
	
	// Error log
	const errorSection = document.createElement('div');
	errorSection.id = 'error-section';
	errorSection.className = 'debug-section';
	
	const errorTitle = document.createElement('h4');
	errorTitle.textContent = 'Error Log';
	errorSection.appendChild(errorTitle);
	
	const errorLog = document.createElement('div');
	errorLog.id = 'error-log';
	errorSection.appendChild(errorLog);
	
	const clearErrorsButton = document.createElement('button');
	clearErrorsButton.textContent = 'Clear Errors';
	clearErrorsButton.addEventListener('click', () => {
		errorLog.innerHTML = '';
	});
	errorSection.appendChild(clearErrorsButton);
	
	debugPanel.appendChild(errorSection);
	
	// Add debug panel to the container
	document.body.appendChild(debugPanel);
	
	// Listen for debug toggle event
	window.addEventListener('toggleDebug', toggleDebugPanel);
}

/**
 * Toggle the debug panel
 */
function toggleDebugPanel() {
	const debugPanel = document.getElementById('debug-panel');
	if (debugPanel) {
		if (debugPanel.style.display === 'none') {
			debugPanel.style.display = 'block';
			updateDebugPanel();
		} else {
			debugPanel.style.display = 'none';
		}
	}
}

/**
 * Update the debug panel with current information
 */
function updateDebugPanel() {
	const debugPanel = document.getElementById('debug-panel');
	if (!debugPanel || debugPanel.style.display === 'none') return;
	
	// Update connection status
	const connectionInfo = document.getElementById('connection-info');
	if (connectionInfo) {
		const isConnected = Network.isConnected();
		connectionInfo.innerHTML = `
			<p>Connected: <span class="${isConnected ? 'connected' : 'disconnected'}">${isConnected ? 'Yes' : 'No'}</span></p>
			<p>Socket ID: ${Network.getSocketId() || 'N/A'}</p>
		`;
	}
	
	// Update game state info
	const gameStateInfo = document.getElementById('game-state-info');
	if (gameStateInfo) {
		const gameState = GameManager.getGameState();
		const renderMode = GameManager.getRenderMode() || 'N/A';
		
		gameStateInfo.innerHTML = `
			<p>Game Initialized: ${isGameInitialized ? 'Yes' : 'No'}</p>
			<p>Game Running: ${GameManager.isGameRunning() ? 'Yes' : 'No'}</p>
			<p>Render Mode: ${renderMode}</p>
			<p>Board Size: ${DEFAULT_BOARD_WIDTH}x${DEFAULT_BOARD_HEIGHT}</p>
			<p>Player ID: ${playerId || 'N/A'}</p>
		`;
	}
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
	// Keyboard events
	document.addEventListener('keydown', handleKeyDown);
	
	// Window resize event
	window.addEventListener('resize', handleResize);
}

/**
 * Start a new game
 */
function startGame() {
	try {
		console.log('Starting game from UI...');
		
		// Play sound
		SoundManager.playSound('menu_confirm');
		
		// Start the game
		GameManager.startGame();
		
		// Play start sound
		SoundManager.playSound('game_start');
		
		// Start animation loop if not already running
		if (!animationFrameId) {
			animate();
		}
		
		console.log('Game started successfully');
	} catch (error) {
		console.error('Error starting game:', error);
		showErrorMessage('Failed to start game: ' + error.message, error);
	}
}

/**
 * Toggle pause state
 */
function togglePause() {
	try {
		if (GameManager.isGamePaused()) {
			GameManager.resumeGame();
			showNotification('Game resumed');
		} else {
			GameManager.pauseGame();
			showNotification('Game paused');
		}
	} catch (error) {
		console.error('Error toggling pause:', error);
		showErrorMessage('Failed to toggle pause: ' + error.message, error);
	}
}

/**
 * Animation loop
 */
function animate() {
	try {
		animationFrameId = requestAnimationFrame(animate);
		
		// Update game state
		GameManager.update();
		
		// Update debug panel occasionally
		if (Math.random() < 0.01) { // Update roughly every 100 frames
			updateDebugPanel();
		}
	} catch (error) {
		console.error('Error in animation loop:', error);
		// Don't show error message here to avoid spamming the user
		// Just log it and continue
	}
}

/**
 * Handle keyboard events
 * @param {KeyboardEvent} event - The keyboard event
 */
function handleKeyDown(event) {
	// Skip if game is not initialized
	if (!isGameInitialized) {
		return;
	}
	
	try {
		// Handle tetromino movement
		switch (event.key) {
			case 'ArrowLeft':
				// Move tetromino left
				TetrominoManager.moveTetromino('left');
				event.preventDefault();
				break;
			case 'ArrowRight':
				// Move tetromino right
				TetrominoManager.moveTetromino('right');
				event.preventDefault();
				break;
			case 'ArrowDown':
				// Move tetromino down
				TetrominoManager.moveTetromino('down');
				event.preventDefault();
				break;
			case 'ArrowUp':
				// Rotate tetromino
				TetrominoManager.rotateTetromino();
				event.preventDefault();
				break;
			case ' ':
				// Drop tetromino
				TetrominoManager.dropTetromino();
				event.preventDefault();
				break;
			case 'p':
			case 'P':
				// Toggle pause
				togglePause();
				event.preventDefault();
				break;
			case 'F9':
				// Toggle debug panel
				toggleDebugPanel();
				event.preventDefault();
				break;
		}
	} catch (error) {
		console.error('Error handling keyboard input:', error);
		logErrorToDebugPanel('Error handling keyboard input', error);
	}
}

/**
 * Handle window resize event
 */
function handleResize() {
	// Notify the renderer of the resize
	if (Renderer && Renderer.handleResize) {
		Renderer.handleResize();
	}
}

/**
 * Set render mode
 * @param {string} mode - The render mode to set
 */
function setRenderMode(mode) {
	try {
		GameManager.setRenderMode(mode);
	} catch (error) {
		console.error('Error setting render mode:', error);
	}
}

/**
 * Show welcome message
 */
function showWelcomeMessage() {
	showNotification('Welcome to Shaktris! Click Start Game to begin.');
}

/**
 * Show error message
 * @param {string} message - The error message to show
 * @param {Error} [error] - The error object (optional)
 */
function showErrorMessage(message, error) {
	// Log to console
	if (error) {
		console.error(message, error);
	} else {
		console.error(message);
	}
	
	// Log to debug panel
	logErrorToDebugPanel(message, error);
	
	// Remove existing error message
	const existingError = document.getElementById('error-message');
	if (existingError) {
		existingError.remove();
	}
	
	// Create error message element
	const errorElement = document.createElement('div');
	errorElement.id = 'error-message';
	errorElement.className = 'error-message';
	
	// Add error message
	const messageElement = document.createElement('p');
	messageElement.textContent = message;
	errorElement.appendChild(messageElement);
	
	// Add close button
	const closeButton = document.createElement('button');
	closeButton.textContent = 'Close';
	closeButton.addEventListener('click', () => {
		errorElement.remove();
	});
	errorElement.appendChild(closeButton);
	
	// Add to document
	document.body.appendChild(errorElement);
}

/**
 * Log an error to the debug panel
 * @param {string} message - The error message
 * @param {Error} error - The error object
 */
function logErrorToDebugPanel(message, error) {
	const errorLog = document.getElementById('error-log');
	if (!errorLog) return;
	
	const errorEntry = document.createElement('div');
	errorEntry.className = 'error-entry';
	
	const timestamp = new Date().toLocaleTimeString();
	errorEntry.innerHTML = `
		<p><strong>${timestamp}</strong>: ${message}</p>
		${error ? `<p class="error-stack">${error.stack || error.message || 'Unknown error'}</p>` : ''}
	`;
	
	errorLog.appendChild(errorEntry);
	
	// Scroll to bottom
	errorLog.scrollTop = errorLog.scrollHeight;
}

/**
 * Show a notification
 * @param {string} message - The message to show
 * @param {number} duration - The duration to show the message in milliseconds
 */
function showNotification(message, duration = 3000) {
	// Remove existing notification
	const existingNotification = document.getElementById('notification');
	if (existingNotification) {
		existingNotification.remove();
	}
	
	// Create notification element
	const notificationElement = document.createElement('div');
	notificationElement.id = 'notification';
	notificationElement.className = 'notification';
	notificationElement.textContent = message;
	
	// Add to document
	document.body.appendChild(notificationElement);
	
	// Remove after duration
	setTimeout(() => {
		if (notificationElement.parentNode) {
			notificationElement.parentNode.removeChild(notificationElement);
		}
	}, duration);
}

/**
 * Show loading screen
 * @param {string} message - The message to show on the loading screen
 */
function showLoadingScreen(message = 'Loading...') {
	// Get or create loading screen
	let loadingScreen = document.getElementById('loading-screen');
	
	if (!loadingScreen) {
		loadingScreen = document.createElement('div');
		loadingScreen.id = 'loading-screen';
		loadingScreen.className = 'loading-screen';
		
		// Create loading content
		const loadingContent = document.createElement('div');
		loadingContent.className = 'loading-content';
		
		// Game title
		const gameTitle = document.createElement('h1');
		gameTitle.className = 'game-title';
		gameTitle.textContent = 'Shaktris';
		loadingContent.appendChild(gameTitle);
		
		// Game subtitle
		const gameSubtitle = document.createElement('h2');
		gameSubtitle.className = 'game-subtitle';
		gameSubtitle.textContent = 'Chess meets Tetris';
		loadingContent.appendChild(gameSubtitle);
		
		// Loading message
		const loadingMessage = document.createElement('p');
		loadingMessage.id = 'loading-message';
		loadingMessage.textContent = message;
		loadingContent.appendChild(loadingMessage);
		
		// Loading spinner
		const loadingSpinner = document.createElement('div');
		loadingSpinner.className = 'loading-spinner';
		loadingContent.appendChild(loadingSpinner);
		
		loadingScreen.appendChild(loadingContent);
		document.body.appendChild(loadingScreen);
	} else {
		// Update loading message
		const loadingMessage = document.getElementById('loading-message');
		if (loadingMessage) {
			loadingMessage.textContent = message;
		}
	}
}

/**
 * Hide loading screen
 */
function hideLoadingScreen() {
	const loadingScreen = document.getElementById('loading-screen');
	if (loadingScreen) {
		loadingScreen.style.display = 'none';
	}
}

// Export functions for external use
export {
	startGame,
	togglePause,
	toggleDebugPanel,
	showNotification,
	showErrorMessage
}; 