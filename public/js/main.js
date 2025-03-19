/**
 * Shaktris Game - Main Entry Point
 * 
 * This file initializes all game components and starts the game.
 */

import * as network from './utils/network.js';
import * as sessionManager from './utils/sessionManager.js';
import * as gameStateManager from './utils/gameStateManager.js';
import * as inputController from './utils/inputController.js';
import * as soundManager from './utils/soundManager.js';
import * as uiManager from './utils/uiManager.js';
import * as gameRenderer from './utils/gameRenderer.js';
import * as gameIntegration from './utils/gameIntegration.js';

// Configuration
const config = {
	renderMode: window.is2DMode ? '2d' : '3d',
	debug: false,
	autoConnect: true
};

// DOM elements
let loadingScreen;
let menuScreen;
let gameScreen;
let debugPanel;

/**
 * Initialize the game
 */
async function init() {
	try {
		console.log(`Initializing Shaktris in ${config.renderMode} mode...`);
		
		// Initialize DOM elements
		initDomElements();
		
		// Show loading screen
		showScreen('loading');
		
		// Initialize session manager
		await sessionManager.initSession();
		console.log('Session manager initialized');
		
		// Initialize sound manager
		await soundManager.init({
			masterVolume: sessionManager.getSettings().masterVolume || 0.7,
			musicVolume: sessionManager.getSettings().musicVolume || 0.5,
			sfxVolume: sessionManager.getSettings().sfxVolume || 0.8
		});
		console.log('Sound manager initialized');
		
		// Initialize UI manager
		await uiManager.init({
			rootElement: document.body,
			theme: sessionManager.getSettings().theme || 'dark',
			onGameStateChange: handleGameStateChange
		});
		console.log('UI manager initialized');
		
		// Initialize input controller
		await inputController.init({
			keyBindings: sessionManager.getSettings().keyBindings,
			onInput: handleInput
		});
		console.log('Input controller initialized');
		
		// Initialize game renderer
		const gameContainer = document.getElementById('game-container');
		await gameRenderer.init(gameContainer, {
			mode: config.renderMode,
			showGrid: sessionManager.getSettings().showGrid !== false,
			showShadows: sessionManager.getSettings().showShadows !== false,
			quality: sessionManager.getSettings().quality || 'medium'
		});
		console.log('Game renderer initialized');
		
		// Initialize game state manager
		await gameStateManager.init({
			onStateChange: handleGameStateChange,
			initialState: gameStateManager.GAME_STATES.MENU
		});
		console.log('Game state manager initialized');
		
		// Initialize game integration
		await gameIntegration.init(gameContainer, {
			debugMode: config.debug,
			autoConnect: config.autoConnect,
			uiRoot: document.body,
			initialState: gameStateManager.GAME_STATES.MENU
		});
		console.log('Game integration initialized');
		
		// Set up event listeners
		setupEventListeners();
		
		// Set up debug panel if in debug mode
		if (config.debug) {
			setupDebugPanel();
		}
		
		// Auto-connect to server if enabled
		if (config.autoConnect) {
			network.connect();
		}
		
		// Show menu screen with welcome notification
		showScreen('menu');
		uiManager.showNotification('Welcome to Shaktris!');
		
		console.log('Initialization complete');
	} catch (error) {
		console.error('Error during initialization:', error);
		uiManager.showNotification('Error initializing game. Please refresh the page.', 'error');
	}
}

/**
 * Initialize DOM elements
 */
function initDomElements() {
	loadingScreen = document.getElementById('loading-screen');
	menuScreen = document.getElementById('menu-screen');
	gameScreen = document.getElementById('game-screen');
	debugPanel = document.getElementById('debug-panel');
	
	// Create screens if they don't exist
	if (!loadingScreen) {
		loadingScreen = document.createElement('div');
		loadingScreen.id = 'loading-screen';
		loadingScreen.className = 'screen';
		loadingScreen.innerHTML = `
			<div class="screen-content">
				<h1>Loading Shaktris...</h1>
				<div class="loading-spinner"></div>
			</div>
		`;
		document.body.appendChild(loadingScreen);
	}
	
	if (!menuScreen) {
		menuScreen = document.createElement('div');
		menuScreen.id = 'menu-screen';
		menuScreen.className = 'screen';
		menuScreen.innerHTML = `
			<div class="screen-content">
				<h1>Shaktris</h1>
				<div class="menu-buttons">
					<button id="play-button">Play</button>
					<button id="settings-button">Settings</button>
					<button id="help-button">How to Play</button>
				</div>
			</div>
		`;
		document.body.appendChild(menuScreen);
	}
	
	if (!gameScreen) {
		gameScreen = document.createElement('div');
		gameScreen.id = 'game-screen';
		gameScreen.className = 'screen';
		gameScreen.innerHTML = `
			<div id="game-container"></div>
			<div id="game-ui">
				<div id="score-panel">
					<div>Score: <span id="score">0</span></div>
					<div>Level: <span id="level">1</span></div>
					<div>Lines: <span id="lines">0</span></div>
				</div>
				<div id="next-piece"></div>
				<div id="held-piece"></div>
			</div>
		`;
		document.body.appendChild(gameScreen);
	}
	
	if (!debugPanel) {
		debugPanel = document.createElement('div');
		debugPanel.id = 'debug-panel';
		debugPanel.className = 'debug-panel';
		debugPanel.style.display = config.debug ? 'block' : 'none';
		document.body.appendChild(debugPanel);
	}
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
	// Menu buttons
	const playButton = document.getElementById('play-button');
	const settingsButton = document.getElementById('settings-button');
	const helpButton = document.getElementById('help-button');
	
	if (playButton) {
		playButton.addEventListener('click', () => {
			gameStateManager.setState(gameStateManager.GAME_STATES.PLAYING);
		});
	}
	
	if (settingsButton) {
		settingsButton.addEventListener('click', () => {
			uiManager.showDialog('settings');
		});
	}
	
	if (helpButton) {
		helpButton.addEventListener('click', () => {
			uiManager.showDialog('help');
		});
	}
	
	// Network events
	network.on('connect', () => {
		console.log('Connected to server');
		uiManager.showNotification('Connected to server');
	});
	
	network.on('disconnect', () => {
		console.log('Disconnected from server');
		uiManager.showNotification('Disconnected from server', 'error');
	});
	
	network.on('error', (error) => {
		console.error('Network error:', error);
		uiManager.showNotification(`Network error: ${error.message}`, 'error');
	});
	
	// Window events
	window.addEventListener('resize', handleResize);
}

/**
 * Set up debug panel
 */
function setupDebugPanel() {
	if (!debugPanel) {
		return;
	}
	
	// Add toggle button
	const toggleButton = document.createElement('button');
	toggleButton.id = 'debug-toggle';
	toggleButton.textContent = 'Debug';
	toggleButton.className = 'debug-toggle';
	toggleButton.addEventListener('click', () => {
		debugPanel.style.display = debugPanel.style.display === 'none' ? 'block' : 'none';
	});
	document.body.appendChild(toggleButton);
	
	// Initialize debug panel content
	debugPanel.innerHTML = `
		<h3>Debug Info</h3>
		<pre>Initializing...</pre>
	`;
}

/**
 * Handle game state change
 * @param {string} newState - New game state
 * @param {string} oldState - Old game state
 */
function handleGameStateChange(newState, oldState) {
	console.log(`Game state changed: ${oldState} -> ${newState}`);
	
	// Show appropriate screen
	switch (newState) {
		case gameStateManager.GAME_STATES.LOADING:
			showScreen('loading');
			break;
			
		case gameStateManager.GAME_STATES.MENU:
			showScreen('menu');
			break;
			
		case gameStateManager.GAME_STATES.PLAYING:
			showScreen('game');
			break;
	}
}

/**
 * Handle input events
 * @param {string} action - Input action
 * @param {Object} event - Original event
 */
function handleInput(action, event) {
	// This is handled by gameIntegration.js
	// This function is here for compatibility with older code
}

/**
 * Show a specific screen
 * @param {string} screenName - Screen name to show
 */
function showScreen(screenName) {
	// Hide all screens
	const screens = document.querySelectorAll('.screen');
	screens.forEach(screen => {
		screen.style.display = 'none';
	});
	
	// Show requested screen
	let screenToShow;
	
	switch (screenName) {
		case 'loading':
			screenToShow = loadingScreen;
			break;
			
		case 'menu':
			screenToShow = menuScreen;
			break;
			
		case 'game':
			screenToShow = gameScreen;
			break;
			
		default:
			console.error(`Unknown screen: ${screenName}`);
			return;
	}
	
	if (screenToShow) {
		screenToShow.style.display = 'block';
	}
}

/**
 * Start the game
 */
function startGame() {
	// This is handled by gameIntegration.js
	// This function is here for compatibility with older code
	gameStateManager.setState(gameStateManager.GAME_STATES.PLAYING);
}

/**
 * Handle window resize
 */
function handleResize() {
	// Update renderer if initialized
	if (gameRenderer) {
		// The renderer handles resizing internally
	}
}

/**
 * Clean up resources
 */
function cleanup() {
	try {
		console.log('Cleaning up resources...');
		
		// Clean up managers
		gameIntegration.cleanup();
		
		console.log('Cleanup complete');
	} catch (error) {
		console.error('Error during cleanup:', error);
	}
}

/**
 * Initialize game settings
 */
function initializeSettings() {
	// Default settings
	settings = {
		cellSize: 30,
		showGrid: true,
		showGhostPiece: true, // Enable ghost piece by default
		renderMode: '3d', // '2d' or '3d'
		sound: {
			enabled: true,
			volume: 0.5
		},
		controls: {
			moveLeft: 'ArrowLeft',
			moveRight: 'ArrowRight',
			moveDown: 'ArrowDown',
			rotateClockwise: 'ArrowUp',
			rotateCCW: 'z',
			hardDrop: ' ', // Space
			toggleView: 'v', // Toggle between 2D and 3D
			hold: 'c',
			pause: 'p'
		}
	};
	
	// Load settings from localStorage if available
	const savedSettings = localStorage.getItem('chesstrisSettings');
	if (savedSettings) {
		try {
			const parsedSettings = JSON.parse(savedSettings);
			// Merge saved settings with default settings
			settings = { ...settings, ...parsedSettings };
		} catch (error) {
			console.error('Error loading settings:', error);
		}
	}
	
	// Save initial settings
	saveSettings();
	
	// Apply settings to UI
	applySettingsToUI();
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);

// Clean up before unload
window.addEventListener('beforeunload', cleanup);
