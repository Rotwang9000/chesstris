/**
 * Shaktris Game Entry Point
 * 
 * This is the unified entry point for the Shaktris game.
 * It handles initialization, UI setup, and game flow.
 */

// Import core modules
import Network from './js/utils/network-patch.js';
import * as GameState from './js/core/gameState.js';
import * as TetrominoManager from './js/core/tetrominoManager.js';
import * as ChessPieceManager from './js/core/chessPieceManager.js';
import * as GameManager from './js/core/gameManager.js';
import * as Renderer from './js/rendering/renderer.js';
import * as SoundManager from './js/utils/soundManager.js';
import * as DebugPanel from './js/utils/debugPanel.js';
import { GAME_CONSTANTS } from './js/core/constants.js';

// DOM elements
let gameContainer;
let loadingScreen;
let menuScreen;
let gameOverScreen;
let startButton;
let restartButton;
let settingsButton;
let render2DButton;
let render3DButton;

// Game state
let playerId = null;
let playerColor = null;
let playerUsername = null;
let isGameInitialized = false;
let isConnectedToServer = false;
let animationFrameId = null;

/**
 * Initialize the application
 */
async function init() {
	try {
		console.log('Initializing application...');
		
		// Get DOM elements
		gameContainer = document.getElementById('game-container');
		loadingScreen = document.getElementById('loading-screen');
		menuScreen = document.getElementById('menu-screen');
		gameOverScreen = document.getElementById('game-over-screen');
		startButton = document.getElementById('start-button');
		restartButton = document.getElementById('restart-button');
		settingsButton = document.getElementById('settings-button');
		render2DButton = document.getElementById('render-2d-button');
		render3DButton = document.getElementById('render-3d-button');
		
		// Create elements if they don't exist
		if (!gameContainer) {
			gameContainer = createGameContainer();
		}
		
		if (!loadingScreen) {
			loadingScreen = createLoadingScreen();
		}
		
		if (!menuScreen) {
			menuScreen = createMenuScreen();
		}
		
		if (!gameOverScreen) {
			gameOverScreen = createGameOverScreen();
		}
		
		// Initialize sound manager
		await SoundManager.init();
		
		// Initialize debug panel
		setupDebugPanel();
		
		// Determine render mode - default to 3D unless explicitly set to 2D
		let renderMode = GAME_CONSTANTS.RENDER_MODE.MODE_3D;
		if (window.is2DMode === true) {
			console.log('Using 2D mode based on window.is2DMode flag');
			renderMode = GAME_CONSTANTS.RENDER_MODE.MODE_2D;
		}
		
		console.log(`Initializing with render mode: ${renderMode}`);
		
		// Initialize the renderer
		try {
			await Renderer.init(renderMode);
		} catch (error) {
			console.error('Error initializing renderer:', error);
			showErrorMessage('Failed to initialize renderer. Please try again or use a different browser.');
			return;
		}
		
		// Initialize the game
		try {
			await GameManager.init({
				renderMode: renderMode
			});
			isGameInitialized = true;
		} catch (error) {
			console.error('Error initializing game:', error);
			showErrorMessage('Failed to initialize game. Please try again.');
			return;
		}
		
		// Set up event listeners
		setupEventListeners();
		
		// Play menu music
		SoundManager.playMusic('music_menu');
		
		console.log('Application initialized');
	} catch (error) {
		console.error('Error initializing application:', error);
		showErrorMessage('Failed to initialize application. Please try again.', error);
	}
}

/**
 * Create a game container if it doesn't exist
 * @returns {HTMLElement} The game container
 */
function createGameContainer() {
	const container = document.createElement('div');
	container.id = 'game-container';
	container.style.width = '100%';
	container.style.height = '100vh';
	container.style.position = 'relative';
	container.style.overflow = 'hidden';
	container.style.backgroundColor = '#1a1a2e';
	document.body.appendChild(container);
	return container;
}

/**
 * Create a loading screen if it doesn't exist
 * @returns {HTMLElement} The loading screen
 */
function createLoadingScreen() {
	const screen = document.createElement('div');
	screen.id = 'loading-screen';
	screen.style.position = 'absolute';
	screen.style.top = '0';
	screen.style.left = '0';
	screen.style.width = '100%';
	screen.style.height = '100%';
	screen.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
	screen.style.display = 'flex';
	screen.style.flexDirection = 'column';
	screen.style.justifyContent = 'center';
	screen.style.alignItems = 'center';
	screen.style.zIndex = '1000';
	screen.style.color = '#fff';
	screen.style.fontFamily = 'Arial, sans-serif';
	
	const loadingText = document.createElement('h2');
	loadingText.id = 'loading-text';
	loadingText.textContent = 'Loading...';
	loadingText.style.marginBottom = '20px';
	
	const spinner = document.createElement('div');
	spinner.className = 'spinner';
	spinner.style.width = '50px';
	spinner.style.height = '50px';
	spinner.style.border = '5px solid rgba(255, 255, 255, 0.3)';
	spinner.style.borderRadius = '50%';
	spinner.style.borderTop = '5px solid #fff';
	spinner.style.animation = 'spin 1s linear infinite';
	
	const style = document.createElement('style');
	style.textContent = `
		@keyframes spin {
			0% { transform: rotate(0deg); }
			100% { transform: rotate(360deg); }
		}
	`;
	
	document.head.appendChild(style);
	screen.appendChild(loadingText);
	screen.appendChild(spinner);
	gameContainer.appendChild(screen);
	
	// Hide by default
	screen.style.display = 'none';
	
	return screen;
}

/**
 * Create a menu screen if it doesn't exist
 * @returns {HTMLElement} The menu screen
 */
function createMenuScreen() {
	const screen = document.createElement('div');
	screen.id = 'menu-screen';
	screen.style.position = 'absolute';
	screen.style.top = '0';
	screen.style.left = '0';
	screen.style.width = '100%';
	screen.style.height = '100%';
	screen.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
	screen.style.display = 'flex';
	screen.style.flexDirection = 'column';
	screen.style.justifyContent = 'center';
	screen.style.alignItems = 'center';
	screen.style.zIndex = '900';
	screen.style.color = '#fff';
	screen.style.fontFamily = 'Arial, sans-serif';
	
	const title = document.createElement('h1');
	title.textContent = 'SHAKTRIS';
	title.style.fontSize = '48px';
	title.style.marginBottom = '40px';
	title.style.color = '#4FC3F7';
	title.style.textShadow = '0 0 10px rgba(79, 195, 247, 0.7)';
	
	const buttonContainer = document.createElement('div');
	buttonContainer.style.display = 'flex';
	buttonContainer.style.flexDirection = 'column';
	buttonContainer.style.gap = '15px';
	
	// Start button
	startButton = document.createElement('button');
	startButton.id = 'start-button';
	startButton.textContent = 'Start Game';
	styleButton(startButton, { primary: true });
	
	// Settings button
	settingsButton = document.createElement('button');
	settingsButton.id = 'settings-button';
	settingsButton.textContent = 'Settings';
	styleButton(settingsButton);
	
	// Render mode buttons
	const renderModeContainer = document.createElement('div');
	renderModeContainer.style.display = 'flex';
	renderModeContainer.style.gap = '10px';
	renderModeContainer.style.marginTop = '20px';
	
	render2DButton = document.createElement('button');
	render2DButton.id = 'render-2d-button';
	render2DButton.textContent = '2D Mode';
	styleButton(render2DButton, { small: true });
	
	render3DButton = document.createElement('button');
	render3DButton.id = 'render-3d-button';
	render3DButton.textContent = '3D Mode';
	styleButton(render3DButton, { small: true });
	
	renderModeContainer.appendChild(render2DButton);
	renderModeContainer.appendChild(render3DButton);
	
	buttonContainer.appendChild(startButton);
	buttonContainer.appendChild(settingsButton);
	
	screen.appendChild(title);
	screen.appendChild(buttonContainer);
	screen.appendChild(renderModeContainer);
	
	gameContainer.appendChild(screen);
	
	return screen;
}

/**
 * Create a game over screen if it doesn't exist
 * @returns {HTMLElement} The game over screen
 */
function createGameOverScreen() {
	const screen = document.createElement('div');
	screen.id = 'game-over-screen';
	screen.style.position = 'absolute';
	screen.style.top = '0';
	screen.style.left = '0';
	screen.style.width = '100%';
	screen.style.height = '100%';
	screen.style.display = 'none';
	screen.style.flexDirection = 'column';
	screen.style.justifyContent = 'center';
	screen.style.alignItems = 'center';
	screen.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
	screen.style.zIndex = '950';
	screen.style.color = '#fff';
	screen.style.fontFamily = 'Arial, sans-serif';
	screen.style.transition = 'all 0.5s ease-in-out';
	
	// Create dramatic elements
	const gameOverContainer = document.createElement('div');
	gameOverContainer.style.display = 'flex';
	gameOverContainer.style.flexDirection = 'column';
	gameOverContainer.style.alignItems = 'center';
	gameOverContainer.style.justifyContent = 'center';
	gameOverContainer.style.padding = '40px';
	gameOverContainer.style.borderRadius = '10px';
	gameOverContainer.style.backgroundColor = 'rgba(20, 20, 20, 0.8)';
	gameOverContainer.style.boxShadow = '0 0 30px rgba(255, 0, 0, 0.5)';
	gameOverContainer.style.transform = 'scale(0.9)';
	gameOverContainer.style.transition = 'all 0.5s ease-in-out';
	
	const gameOverTitle = document.createElement('h1');
	gameOverTitle.textContent = 'KING CAPTURED';
	gameOverTitle.style.fontSize = '48px';
	gameOverTitle.style.marginBottom = '20px';
	gameOverTitle.style.color = '#F44336';
	gameOverTitle.style.textShadow = '0 0 10px rgba(244, 67, 54, 0.7)';
	gameOverTitle.style.textAlign = 'center';
	gameOverTitle.style.animation = 'pulse 2s infinite';
	
	// Add animation keyframes
	const style = document.createElement('style');
	style.textContent = `
		@keyframes pulse {
			0% { transform: scale(1); text-shadow: 0 0 10px rgba(244, 67, 54, 0.7); }
			50% { transform: scale(1.05); text-shadow: 0 0 20px rgba(244, 67, 54, 0.9), 0 0 30px rgba(244, 67, 54, 0.7); }
			100% { transform: scale(1); text-shadow: 0 0 10px rgba(244, 67, 54, 0.7); }
		}
		@keyframes fadeIn {
			from { opacity: 0; transform: translateY(-20px); }
			to { opacity: 1; transform: translateY(0); }
		}
	`;
	document.head.appendChild(style);
	
	const gameOverMessage = document.createElement('p');
	gameOverMessage.id = 'game-over-message';
	gameOverMessage.textContent = 'Your king has been captured!';
	gameOverMessage.style.fontSize = '24px';
	gameOverMessage.style.marginBottom = '30px';
	gameOverMessage.style.textAlign = 'center';
	gameOverMessage.style.maxWidth = '600px';
	gameOverMessage.style.lineHeight = '1.5';
	gameOverMessage.style.animation = 'fadeIn 1s ease-out';
	
	const scoreContainer = document.createElement('div');
	scoreContainer.style.marginBottom = '30px';
	scoreContainer.style.textAlign = 'center';
	scoreContainer.style.animation = 'fadeIn 1s ease-out 0.3s both';
	
	const scoreTitle = document.createElement('h2');
	scoreTitle.textContent = 'FINAL SCORE';
	scoreTitle.style.fontSize = '28px';
	scoreTitle.style.marginBottom = '10px';
	
	const scoreValue = document.createElement('p');
	scoreValue.id = 'final-score';
	scoreValue.textContent = '0';
	scoreValue.style.fontSize = '36px';
	scoreValue.style.fontWeight = 'bold';
	scoreValue.style.color = '#4CAF50';
	scoreValue.style.textShadow = '0 0 10px rgba(76, 175, 80, 0.7)';
	
	const statsContainer = document.createElement('div');
	statsContainer.style.display = 'flex';
	statsContainer.style.justifyContent = 'space-between';
	statsContainer.style.width = '100%';
	statsContainer.style.marginTop = '20px';
	statsContainer.style.animation = 'fadeIn 1s ease-out 0.6s both';
	
	const levelContainer = document.createElement('div');
	levelContainer.style.textAlign = 'center';
	
	const levelLabel = document.createElement('p');
	levelLabel.textContent = 'LEVEL';
	levelLabel.style.fontSize = '18px';
	
	const levelValue = document.createElement('p');
	levelValue.id = 'final-level';
	levelValue.textContent = '1';
	levelValue.style.fontSize = '24px';
	levelValue.style.fontWeight = 'bold';
	
	const piecesContainer = document.createElement('div');
	piecesContainer.style.textAlign = 'center';
	
	const piecesLabel = document.createElement('p');
	piecesLabel.textContent = 'PIECES CAPTURED';
	piecesLabel.style.fontSize = '18px';
	
	const piecesValue = document.createElement('p');
	piecesValue.id = 'pieces-captured';
	piecesValue.textContent = '0';
	piecesValue.style.fontSize = '24px';
	piecesValue.style.fontWeight = 'bold';
	
	const buttonContainer = document.createElement('div');
	buttonContainer.style.display = 'flex';
	buttonContainer.style.justifyContent = 'center';
	buttonContainer.style.marginTop = '30px';
	buttonContainer.style.gap = '20px';
	buttonContainer.style.animation = 'fadeIn 1s ease-out 0.9s both';
	
	const restartButton = document.createElement('button');
	restartButton.id = 'restart-button';
	restartButton.textContent = 'PLAY AGAIN';
	styleButton(restartButton, {
		backgroundColor: '#4CAF50',
		hoverColor: '#45a049',
		width: '180px'
	});
	
	const mainMenuButton = document.createElement('button');
	mainMenuButton.id = 'main-menu-button';
	mainMenuButton.textContent = 'MAIN MENU';
	styleButton(mainMenuButton, {
		backgroundColor: '#2196F3',
		hoverColor: '#0b7dda',
		width: '180px'
	});
	
	// Add event listeners
	restartButton.addEventListener('click', () => {
		SoundManager.playSound('menu_confirm');
		restartGame();
	});
	
	mainMenuButton.addEventListener('click', () => {
		SoundManager.playSound('menu_back');
		hideScreen(gameOverScreen);
		showScreen(menuScreen);
	});
	
	// Assemble the components
	levelContainer.appendChild(levelLabel);
	levelContainer.appendChild(levelValue);
	
	piecesContainer.appendChild(piecesLabel);
	piecesContainer.appendChild(piecesValue);
	
	statsContainer.appendChild(levelContainer);
	statsContainer.appendChild(piecesContainer);
	
	scoreContainer.appendChild(scoreTitle);
	scoreContainer.appendChild(scoreValue);
	scoreContainer.appendChild(statsContainer);
	
	buttonContainer.appendChild(restartButton);
	buttonContainer.appendChild(mainMenuButton);
	
	gameOverContainer.appendChild(gameOverTitle);
	gameOverContainer.appendChild(gameOverMessage);
	gameOverContainer.appendChild(scoreContainer);
	gameOverContainer.appendChild(buttonContainer);
	
	screen.appendChild(gameOverContainer);
	
	return screen;
}

/**
 * Style a button with consistent styling
 * @param {HTMLButtonElement} button - The button to style
 * @param {Object} options - Styling options
 */
function styleButton(button, options = {}) {
	button.style.padding = options.small ? '8px 16px' : '12px 24px';
	button.style.fontSize = options.small ? '14px' : '18px';
	button.style.fontWeight = 'bold';
	button.style.border = 'none';
	button.style.borderRadius = '4px';
	button.style.cursor = 'pointer';
	button.style.transition = 'all 0.2s ease';
	button.style.outline = 'none';
	
	if (options.primary) {
		button.style.backgroundColor = '#4FC3F7';
		button.style.color = '#fff';
	} else {
		button.style.backgroundColor = '#333';
		button.style.color = '#fff';
	}
	
	button.onmouseover = () => {
		button.style.transform = 'scale(1.05)';
		button.style.boxShadow = '0 0 10px rgba(79, 195, 247, 0.5)';
	};
	
	button.onmouseout = () => {
		button.style.transform = 'scale(1)';
		button.style.boxShadow = 'none';
	};
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
	try {
		// UI button event listeners
		if (startButton) {
			startButton.addEventListener('click', () => {
				SoundManager.playSound('menu_confirm');
				startGame();
			});
		}
		
		if (restartButton) {
			restartButton.addEventListener('click', () => {
				SoundManager.playSound('menu_confirm');
				restartGame();
			});
		}
		
		if (settingsButton) {
			settingsButton.addEventListener('click', () => {
				SoundManager.playSound('menu_select');
				showSettingsScreen();
			});
		}
		
		// Render mode buttons
		if (render2DButton) {
			render2DButton.addEventListener('click', () => {
				SoundManager.playSound('menu_select');
				setRenderMode(GAME_CONSTANTS.RENDER_MODE.MODE_2D);
				render2DButton.classList.add('active');
				render3DButton.classList.remove('active');
				showNotification('Switched to 2D mode');
			});
		}
		
		if (render3DButton) {
			render3DButton.addEventListener('click', () => {
				SoundManager.playSound('menu_select');
				setRenderMode(GAME_CONSTANTS.RENDER_MODE.MODE_3D);
				render3DButton.classList.add('active');
				render2DButton.classList.remove('active');
				showNotification('Switched to 3D mode');
			});
		}
		
		// Set initial active button
		if (window.is2DMode) {
			if (render2DButton) render2DButton.classList.add('active');
		} else {
			if (render3DButton) render3DButton.classList.add('active');
		}
		
		// Keyboard events
		window.addEventListener('keydown', handleKeyDown);
		
		// Window resize event
		window.addEventListener('resize', handleResize);
		
		// Game state events
		window.addEventListener('game-state-change', (event) => {
			const { state, data } = event.detail;
			
			if (state === GAME_CONSTANTS.GAME_STATE.GAME_OVER) {
				handleGameOver(data);
			}
		});
		
		// Debug panel toggle (F9 key)
		window.addEventListener('keydown', (event) => {
			if (event.key === 'F9') {
				toggleDebugPanel();
			}
		});
		
		// Network events
		if (Network && typeof Network.on === 'function') {
			// Player joined event
			Network.on('player_joined', (data) => {
				console.log('Player joined:', data);
				showNotification(`${data.username || 'A player'} has joined the game`);
			});
			
			// Player left event
			Network.on('player_left', (data) => {
				console.log('Player left:', data);
				showNotification(`${data.username || 'A player'} has left the game`);
			});
			
			// Game update event
			Network.on('game_update', (data) => {
				console.log('Game update received');
				// Update game state
				if (GameManager && typeof GameManager.updateFromServer === 'function') {
					GameManager.updateFromServer(data);
				}
			});
			
			// Error event
			Network.on('error', (data) => {
				console.error('Network error:', data);
				showNotification(`Error: ${data.message}`, 5000);
				logErrorToDebugPanel('Network error', new Error(data.message));
			});
		}
		
		console.log('Event listeners set up');
	} catch (error) {
		console.error('Error setting up event listeners:', error);
		logErrorToDebugPanel('Error setting up event listeners', error);
	}
}

/**
 * Start the game
 */
function startGame() {
	try {
		console.log('Starting game from UI...');
		
		// Hide menu screen
		hideScreen(menuScreen);
		
		// Start the game
		GameManager.startGame();
		
		// Play game music
		SoundManager.playSound('game_start');
		
		// Start animation loop if not already running
		if (!animationFrameId) {
			animate();
		}
		
		console.log('Game started successfully');
	} catch (error) {
		console.error('Error starting game:', error);
		showErrorMessage('Failed to start game. Please try again.', error);
	}
}

/**
 * Restart the game
 */
function restartGame() {
	try {
		// Hide game over screen
		hideScreen(gameOverScreen);
		
		// Restart game
		GameManager.restartGame();
		
		// Play game music
		SoundManager.playMusic('music_game');
	} catch (error) {
		console.error('Error restarting game:', error);
		showErrorScreen(error);
	}
}

/**
 * Set render mode
 * @param {string} mode - Render mode
 */
function setRenderMode(mode) {
	try {
		GameManager.setRenderMode(mode);
	} catch (error) {
		console.error('Error setting render mode:', error);
	}
}

/**
 * Animation loop
 */
function animate() {
	try {
		// Update game state
		GameManager.update();
		
		// Update debug panel only every 10 frames to reduce console output
		if (window.frameCount === undefined) {
			window.frameCount = 0;
		}
		
		window.frameCount++;
		if (window.frameCount % 10 === 0) {
			updateDebugPanel();
		}
		
		// Request next frame
		animationFrameId = requestAnimationFrame(animate);
	} catch (error) {
		console.error('Error in animation loop:', error);
		cancelAnimationFrame(animationFrameId);
		showErrorMessage('An error occurred during gameplay. Please refresh the page.', error);
	}
}

/**
 * Handle keyboard input
 * @param {KeyboardEvent} event - Keyboard event
 */
function handleKeyDown(event) {
	// Only process if game is running
	const gameState = GameManager.getGameState();
	const isPaused = gameState && gameState.state === GAME_CONSTANTS.GAME_STATE.PAUSED;
	const isGameOver = gameState && gameState.state === GAME_CONSTANTS.GAME_STATE.GAME_OVER;
	
	if (!isGameInitialized || isPaused || isGameOver) {
		// Allow pause toggle even when paused
		if (event.key === 'p' || event.key === 'P') {
			togglePause();
		}
		return;
	}
	
	// Process key input
	switch (event.key) {
		case 'ArrowLeft':
			TetrominoManager.moveLeft();
			break;
		case 'ArrowRight':
			TetrominoManager.moveRight();
			break;
		case 'ArrowDown':
			TetrominoManager.moveDown();
			break;
		case 'ArrowUp':
			TetrominoManager.rotate();
			break;
		case ' ':
			TetrominoManager.hardDrop();
			break;
		case 'z':
		case 'Z':
			TetrominoManager.rotate();
			break;
		case 'x':
		case 'X':
			TetrominoManager.rotateCounterClockwise();
			break;
		case 'c':
		case 'C':
			TetrominoManager.holdPiece();
			break;
		case 'p':
		case 'P':
			togglePause();
			break;
	}
}

/**
 * Toggle game pause state
 */
function togglePause() {
	const gameState = GameManager.getGameState();
	const isPaused = gameState && gameState.state === GAME_CONSTANTS.GAME_STATE.PAUSED;
	
	if (isPaused) {
		GameManager.resumeGame();
		SoundManager.playSound('pause_off');
	} else {
		GameManager.pauseGame();
		SoundManager.playSound('pause_on');
	}
}

/**
 * Handle window resize
 */
function handleResize() {
	// Update renderer
//	Renderer.resize();
}

/**
 * Set up debug panel
 */
function setupDebugPanel() {
	try {
		// Check if DebugPanel exists and has init method
		if (DebugPanel && typeof DebugPanel.init === 'function') {
			DebugPanel.init();
		} else {
			console.warn('DebugPanel not available or missing init method');
		}
	} catch (error) {
		console.error('Error setting up debug panel:', error);
	}
}

/**
 * Toggle debug panel visibility
 */
function toggleDebugPanel() {
	try {
		// Check if DebugPanel exists and has toggle method
		if (DebugPanel && typeof DebugPanel.toggle === 'function') {
			DebugPanel.toggle();
		} else {
			// Fallback implementation
			const debugPanel = document.getElementById('debug-panel');
			if (debugPanel) {
				debugPanel.style.display = debugPanel.style.display === 'none' ? 'block' : 'none';
			}
		}
	} catch (error) {
		console.error('Error toggling debug panel:', error);
	}
}

/**
 * Update debug panel with current game state
 */
function updateDebugPanel() {
	try {
		// Check if DebugPanel exists and has debugPanelVisible method
		if (!DebugPanel || typeof DebugPanel.debugPanelVisible !== 'function' || !DebugPanel.debugPanelVisible()) {
			return;
		}
		
		// Get current game state
		const gameState = GameManager.getGameState();
		
		// Check if updateSection method exists
		if (typeof DebugPanel.updateSection !== 'function') {
			console.warn('DebugPanel.updateSection is not a function');
			return;
		}
		
		// Update connection section
		DebugPanel.updateSection('CONNECTION', {
			'Socket Connected': isConnectedToServer ? 'Yes' : 'No',
			'Player ID': playerId || 'Not assigned'
		});
		
		// Update game section
		DebugPanel.updateSection('GAME', {
			'Initialized': isGameInitialized ? 'Yes' : 'No',
			'State': gameState ? gameState.state : 'Unknown',
			'Paused': gameState && gameState.state === GAME_CONSTANTS.GAME_STATE.PAUSED ? 'Yes' : 'No',
			'Game Over': gameState && gameState.state === GAME_CONSTANTS.GAME_STATE.GAME_OVER ? 'Yes' : 'No',
			'Render Mode': GameManager.getRenderMode(),
			'Score': GameManager.getScore(),
			'Level': GameManager.getLevel(),
			'Lines': GameManager.getLines()
		});
		
		// Update player section
		DebugPanel.updateSection('PLAYER', {
			'ID': playerId || 'Not assigned',
			'Username': playerUsername || 'Anonymous',
			'Color': playerColor || 'Not assigned'
		});
		
		// Update board section
		DebugPanel.updateSection('BOARD', {
			'Width': GAME_CONSTANTS.BOARD_WIDTH,
			'Height': GAME_CONSTANTS.BOARD_HEIGHT
		});
		
		// Update tetromino section
		DebugPanel.updateSection('TETROMINO', {
			'Current': TetrominoManager.getFallingPiece() ? TetrominoManager.getFallingPiece().type : 'None',
			'Next': TetrominoManager.getNextPiece() || 'None',
			'Held': TetrominoManager.getHeldPiece() || 'None'
		});
		
		// Update chess section
		DebugPanel.updateSection('CHESS', {
			'Pieces': Object.keys(ChessPieceManager.getChessPieces()).length,
			'Selected': ChessPieceManager.getSelectedPiece() ? 'Yes' : 'No',
			'Valid Moves': ChessPieceManager.getValidMoves().length
		});
		
		// Update performance section
		const now = performance.now();
		DebugPanel.updateSection('PERFORMANCE', {
			'FPS': Math.round(1000 / (now - (window.lastUpdateTime || now))),
			'Frame Time': Math.round(now - (window.lastUpdateTime || now)) + 'ms'
		});
		
		// Update last frame time
		window.lastUpdateTime = now;
	} catch (error) {
		console.error('Error updating debug panel:', error);
	}
}

/**
 * Show error message
 * @param {string} message - Error message
 * @param {Error} error - Error object
 */
function showErrorMessage(message, error) {
	try {
		// Create error container if it doesn't exist
		let errorContainer = document.getElementById('error-container');
		if (!errorContainer) {
			errorContainer = document.createElement('div');
			errorContainer.id = 'error-container';
			errorContainer.style.position = 'absolute';
			errorContainer.style.top = '20px';
			errorContainer.style.left = '50%';
			errorContainer.style.transform = 'translateX(-50%)';
			errorContainer.style.backgroundColor = 'rgba(244, 67, 54, 0.9)';
			errorContainer.style.color = 'white';
			errorContainer.style.padding = '15px 20px';
			errorContainer.style.borderRadius = '5px';
			errorContainer.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.5)';
			errorContainer.style.zIndex = '2000';
			errorContainer.style.maxWidth = '80%';
			errorContainer.style.textAlign = 'center';
			errorContainer.style.fontFamily = 'Arial, sans-serif';
			document.body.appendChild(errorContainer);
		}
		
		// Set error message
		errorContainer.innerHTML = `<strong>Error:</strong> ${message}`;
		
		// Log error to console
		if (error) {
			console.error('Error details:', error);
			logErrorToDebugPanel(message, error);
		}
		
		// Show error container
		errorContainer.style.display = 'block';
		
		// Hide after 5 seconds
		setTimeout(() => {
			errorContainer.style.display = 'none';
		}, 5000);
	} catch (e) {
		// Last resort error handling
		console.error('Error showing error message:', e);
		alert(`Error: ${message}`);
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
		console.error('Error logging to debug panel:', e);
	}
}

/**
 * Show notification
 * @param {string} message - Notification message
 * @param {number} duration - Duration in milliseconds
 */
function showNotification(message, duration = 3000) {
	try {
		// Create notification container if it doesn't exist
		let notificationContainer = document.getElementById('notification-container');
		if (!notificationContainer) {
			notificationContainer = document.createElement('div');
			notificationContainer.id = 'notification-container';
			notificationContainer.style.position = 'absolute';
			notificationContainer.style.bottom = '20px';
			notificationContainer.style.left = '50%';
			notificationContainer.style.transform = 'translateX(-50%)';
			notificationContainer.style.backgroundColor = 'rgba(33, 150, 243, 0.9)';
			notificationContainer.style.color = 'white';
			notificationContainer.style.padding = '10px 20px';
			notificationContainer.style.borderRadius = '5px';
			notificationContainer.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.3)';
			notificationContainer.style.zIndex = '1500';
			notificationContainer.style.fontFamily = 'Arial, sans-serif';
			document.body.appendChild(notificationContainer);
		}
		
		// Set notification message
		notificationContainer.textContent = message;
		
		// Show notification
		notificationContainer.style.display = 'block';
		
		// Hide after duration
		setTimeout(() => {
			notificationContainer.style.display = 'none';
		}, duration);
	} catch (error) {
		console.error('Error showing notification:', error);
	}
}

/**
 * Show loading screen
 * @param {string} message - Loading message
 */
function showLoadingScreen(message = 'Loading...') {
	try {
		if (!loadingScreen) {
			loadingScreen = createLoadingScreen();
		}
		
		// Set loading message
		const loadingText = document.getElementById('loading-text');
		if (loadingText) {
			loadingText.textContent = message;
		}
		
		// Show loading screen
		loadingScreen.style.display = 'flex';
	} catch (error) {
		console.error('Error showing loading screen:', error);
	}
}

/**
 * Hide loading screen
 */
function hideLoadingScreen() {
	try {
		if (loadingScreen) {
			loadingScreen.style.display = 'none';
		}
	} catch (error) {
		console.error('Error hiding loading screen:', error);
	}
}

/**
 * Show screen
 * @param {HTMLElement} screen - Screen to show
 */
function showScreen(screen) {
	if (screen) {
		screen.style.display = 'flex';
	}
}

/**
 * Hide screen
 * @param {HTMLElement} screen - Screen to hide
 */
function hideScreen(screen) {
	if (screen) {
		screen.style.display = 'none';
	}
}

/**
 * Show settings screen
 */
function showSettingsScreen() {
	try {
		// Create settings screen if it doesn't exist
		let settingsScreen = document.getElementById('settings-screen');
		if (!settingsScreen) {
			settingsScreen = createSettingsScreen();
		}
		
		// Show settings screen
		showScreen(settingsScreen);
		
		// Play settings music
		SoundManager.playSound('menu_open');
	} catch (error) {
		console.error('Error showing settings screen:', error);
		showNotification('Settings screen not available');
	}
}

/**
 * Create a settings screen if it doesn't exist
 * @returns {HTMLElement} The settings screen
 */
function createSettingsScreen() {
	const screen = document.createElement('div');
	screen.id = 'settings-screen';
	screen.style.position = 'absolute';
	screen.style.top = '0';
	screen.style.left = '0';
	screen.style.width = '100%';
	screen.style.height = '100%';
	screen.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
	screen.style.display = 'flex';
	screen.style.flexDirection = 'column';
	screen.style.justifyContent = 'center';
	screen.style.alignItems = 'center';
	screen.style.zIndex = '950';
	screen.style.color = '#fff';
	screen.style.fontFamily = 'Arial, sans-serif';
	
	const title = document.createElement('h1');
	title.textContent = 'SETTINGS';
	title.style.fontSize = '36px';
	title.style.marginBottom = '30px';
	title.style.color = '#4FC3F7';
	title.style.textShadow = '0 0 10px rgba(79, 195, 247, 0.7)';
	
	const settingsContainer = document.createElement('div');
	settingsContainer.style.width = '80%';
	settingsContainer.style.maxWidth = '500px';
	settingsContainer.style.display = 'flex';
	settingsContainer.style.flexDirection = 'column';
	settingsContainer.style.gap = '20px';
	
	// Volume control
	const volumeContainer = document.createElement('div');
	volumeContainer.style.display = 'flex';
	volumeContainer.style.flexDirection = 'column';
	volumeContainer.style.gap = '10px';
	
	const volumeLabel = document.createElement('label');
	volumeLabel.textContent = 'Volume';
	volumeLabel.style.fontSize = '18px';
	
	const volumeSlider = document.createElement('input');
	volumeSlider.type = 'range';
	volumeSlider.min = '0';
	volumeSlider.max = '100';
	volumeSlider.value = '50';
	volumeSlider.style.width = '100%';
	
	volumeContainer.appendChild(volumeLabel);
	volumeContainer.appendChild(volumeSlider);
	
	// Controls info
	const controlsContainer = document.createElement('div');
	controlsContainer.style.marginTop = '20px';
	controlsContainer.style.textAlign = 'left';
	
	const controlsTitle = document.createElement('h3');
	controlsTitle.textContent = 'Controls';
	controlsTitle.style.marginBottom = '10px';
	controlsTitle.style.fontSize = '20px';
	
	const controlsList = document.createElement('ul');
	controlsList.style.listStyleType = 'none';
	controlsList.style.padding = '0';
	
	const controls = [
		{ key: 'Arrow Keys', action: 'Move tetromino' },
		{ key: 'Space', action: 'Hard drop' },
		{ key: 'Z', action: 'Rotate clockwise' },
		{ key: 'X', action: 'Rotate counter-clockwise' },
		{ key: 'C', action: 'Hold piece' },
		{ key: 'P', action: 'Pause game' },
		{ key: 'F9', action: 'Toggle debug panel' }
	];
	
	controls.forEach(control => {
		const controlItem = document.createElement('li');
		controlItem.style.marginBottom = '5px';
		controlItem.style.display = 'flex';
		
		const keySpan = document.createElement('span');
		keySpan.textContent = control.key;
		keySpan.style.fontWeight = 'bold';
		keySpan.style.minWidth = '120px';
		
		const actionSpan = document.createElement('span');
		actionSpan.textContent = control.action;
		
		controlItem.appendChild(keySpan);
		controlItem.appendChild(actionSpan);
		controlsList.appendChild(controlItem);
	});
	
	controlsContainer.appendChild(controlsTitle);
	controlsContainer.appendChild(controlsList);
	
	// Back button
	const backButton = document.createElement('button');
	backButton.textContent = 'Back to Menu';
	styleButton(backButton);
	backButton.style.marginTop = '30px';
	
	backButton.addEventListener('click', () => {
		SoundManager.playSound('menu_back');
		hideScreen(screen);
		showScreen(menuScreen);
	});
	
	settingsContainer.appendChild(volumeContainer);
	settingsContainer.appendChild(controlsContainer);
	
	screen.appendChild(title);
	screen.appendChild(settingsContainer);
	screen.appendChild(backButton);
	
	// Hide by default
	screen.style.display = 'none';
	
	gameContainer.appendChild(screen);
	
	return screen;
}

/**
 * Handle game over event
 * @param {Object} data - Game over data
 */
function handleGameOver(data = {}) {
	try {
		console.log('Game over!', data);
		
		// Update game over screen with final stats
		const finalScore = document.getElementById('final-score');
		if (finalScore) {
			finalScore.textContent = GameManager.getScore() || '0';
		}
		
		const finalLevel = document.getElementById('final-level');
		if (finalLevel) {
			finalLevel.textContent = GameManager.getLevel() || '1';
		}
		
		const piecesCaptured = document.getElementById('pieces-captured');
		if (piecesCaptured) {
			const capturedCount = data.capturedPieces || ChessPieceManager.getCapturedPiecesCount() || 0;
			piecesCaptured.textContent = capturedCount;
		}
		
		// Set custom message based on game over reason
		const gameOverMessage = document.getElementById('game-over-message');
		if (gameOverMessage) {
			if (data.reason === 'king_captured') {
				gameOverMessage.textContent = 'Your king has been captured! The kingdom has fallen.';
			} else if (data.reason === 'board_full') {
				gameOverMessage.textContent = 'The board is full! Your kingdom is trapped.';
			} else if (data.reason === 'time_up') {
				gameOverMessage.textContent = 'Time has run out! Your kingdom has fallen to the sands of time.';
			} else {
				gameOverMessage.textContent = 'Game over! Your chess-tetris journey has ended.';
			}
		}
		
		// Play game over sound
		SoundManager.playSound('game_over');
		
		// Show game over screen with animation
		showScreen(gameOverScreen);
		
		// Animate the game over container
		const gameOverContainer = gameOverScreen.querySelector('div');
		if (gameOverContainer) {
			gameOverContainer.style.transform = 'scale(1)';
		}
	} catch (error) {
		console.error('Error handling game over:', error);
	}
}

// Initialize the application when the page loads
window.addEventListener('DOMContentLoaded', () => {
	console.log('DOM content loaded, initializing application...');
	init();
});

// Export functions for external use
export {
	init,
	startGame,
	restartGame,
	setRenderMode,
	togglePause,
	showErrorMessage,
	showNotification,
	showLoadingScreen,
	hideLoadingScreen
}; 