/**
 * Main Entry Point
 * 
 * Initializes the game and handles the main application flow.
 */

import * as GameManager from './core/gameManager.js';
import * as PlayerManager from './core/playerManager.js';
import * as TetrominoManager from './core/tetrominoManager.js';
import * as InputController from './core/inputController.js';
import { initCompatible as Renderer } from './rendering/compatibility.js'; 
import * as Network from './utils/network.js';
import * as Helpers from './utils/helpers.js';
import * as UI from './ui/uiManager.js';
import * as Marketplace from './ui/marketplaceUI.js';
import SessionManager from './services/sessionManager.js';
import WalletManager from './ui/walletManager.js';
import DebugPanel from './ui/debugPanel.js';

// Game state
let isInitialized = false;
let currentUser = null;
let renderMode = '3d'; // Default to 3D mode

/**
 * Initialize the application
 */
async function init() {
	try {
		console.log('Initializing game...');
		
		// Determine render mode from URL
		determineRenderMode();
		
		// Initialize session
		const session = SessionManager.initSession();
		console.log('Session initialized:', session);
		
		// Initialize network
		await Network.init();
		console.log('Network initialized');
		
		// Initialize game
		await GameManager.initGame({
			playerId: session.playerId,
			offline: !Network.isConnected()
		});
		console.log('Game initialized');
		
		// Join the default game world if connected
		if (Network.isConnected()) {
			try {
				console.log('Joining default game world...');
				const result = await Network.joinGame('default-game', session.username || 'Anonymous');
				console.log('Join game result:', result);
				
				if (result.success) {
					console.log('Successfully joined default game world');
				} else {
					console.error('Failed to join default game world:', result.message);
				}
			} catch (error) {
				console.error('Error joining default game world:', error);
			}
		}
		
		// Start the game
		await GameManager.startGame();
		console.log('Game started');
		
		// Initialize UI
		UI.init();
		console.log('UI initialized');
		
		// Hide loading screen
		document.getElementById('loading-screen').style.display = 'none';
		console.log('Loading screen hidden');
		
		// Initialize input controller
		InputController.init();
		console.log('Input controller initialized');
		
		// Set up event listeners
		setupEventListeners();
		console.log('Event listeners set up');
		
		// Start game loop
		gameLoop();
		console.log('Game loop started');
		
		// Set initialized flag
		isInitialized = true;
		console.log('Initialization complete');
	} catch (error) {
		console.error('Error during initialization:', error);
		document.getElementById('loading-error').textContent = 'Error: ' + error.message;
		document.getElementById('loading-error').style.display = 'block';
	}
}

/**
 * Determine render mode from URL
 */
function determineRenderMode() {
	// Check URL path for /2d or /2D
	const path = window.location.pathname.toLowerCase();
	if (path.endsWith('/2d')) {
		renderMode = '2d';
		console.log('2D render mode selected based on URL');
	} else {
		renderMode = '3d';
		console.log('3D render mode selected based on URL');
	}
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
	// UI events
	UI.on('start_game', handleStartGame);
	UI.on('create_game', handleCreateGame);
	UI.on('join_game', handleJoinGame);
	UI.on('pause_game', handlePauseGame);
	UI.on('resume_game', handleResumeGame);
	UI.on('toggle_debug', toggleDebugPanel);
	UI.on('toggle_render_mode', toggleRenderMode);
	UI.on('toggle_sound', toggleSound);
	UI.on('toggle_music', toggleMusic);
	UI.on('send_chat', handleChatMessage);
	UI.on('purchase_piece', handlePiecePurchase);
	
	// Window events
	window.addEventListener('resize', handleResize);
	window.addEventListener('beforeunload', handleBeforeUnload);
	
	// Debug panel events
	DebugPanel.on('toggle_wireframe', toggleWireframe);
	DebugPanel.on('toggle_axes', toggleAxes);
	DebugPanel.on('toggle_stats', toggleStats);
	DebugPanel.on('toggle_grid', toggleGrid);
	DebugPanel.on('toggle_shadows', toggleShadows);
	DebugPanel.on('toggle_physics_debug', togglePhysicsDebug);
	
	console.log('Event listeners set up');
}

/**
 * Handle window resize
 */
function handleResize() {
	// Update renderer size
	if (typeof Renderer.resize === 'function') {
		Renderer.resize();
	}
}

/**
 * Handle before unload
 */
function handleBeforeUnload(event) {
	// Save game state
	if (isInitialized) {
		SessionManager.saveSession();
	}
}

/**
 * Handle start game
 */
async function handleStartGame(options = {}) {
	try {
		UI.showLoadingScreen('Starting game...');
		
		// Start the game
		const success = await GameManager.startGame();
		
		if (success) {
		UI.showGameScreen();
			
			// Set input mode to tetromino initially
			InputController.setInputMode('tetromino');
		
		console.log('Game started successfully');
		} else {
			throw new Error('Failed to start game');
		}
	} catch (error) {
		console.error('Failed to start game:', error);
		UI.showErrorScreen('Failed to start game', error.message);
	}
}

/**
 * Handle create game
 */
async function handleCreateGame(options = {}) {
	try {
		UI.showLoadingScreen('Creating game...');
		
		// Create a new game
		const gameData = await Network.createGame(options.username || SessionManager.getSession().username);
		console.log('Game created:', gameData);
		
		// Initialize the game with the server data
		await GameManager.initGame({
			playerId: SessionManager.getSession().playerId,
			gameId: gameData.gameId
		});
		
		// Start the game
		await GameManager.startGame(gameData.gameId);
		
		// Show the game screen
		UI.showGameScreen();
		
		// Set input mode to tetromino initially
		InputController.setInputMode('tetromino');
		
		console.log('Game created successfully');
	} catch (error) {
		console.error('Failed to create game:', error);
		UI.showErrorScreen('Failed to create game', error.message);
	}
}

/**
 * Handle join game
 */
async function handleJoinGame(gameId) {
	try {
		UI.showLoadingScreen('Joining game...');
		
		// Join the game on the server
		const gameData = await Network.joinGame(gameId);
		console.log('Joined game:', gameData);
		
		// Start the game with the provided game ID
		await GameManager.startGame(gameId);
		
		// Show the game screen
		UI.showGameScreen();
		
		// Set input mode to tetromino initially
		InputController.setInputMode('tetromino');
		
		console.log('Joined game successfully');
	} catch (error) {
		console.error('Failed to join game:', error);
		UI.showErrorScreen('Failed to join game', error.message);
	}
}

/**
 * Handle pause game
 */
async function handlePauseGame() {
	try {
		await GameManager.pauseGame();
		UI.showPauseScreen();
	} catch (error) {
		console.error('Failed to pause game:', error);
	}
}

/**
 * Handle resume game
 */
async function handleResumeGame() {
	try {
		await GameManager.resumeGame();
		UI.hidePauseScreen();
	} catch (error) {
		console.error('Failed to resume game:', error);
	}
}

/**
 * Toggle debug panel
 */
function toggleDebugPanel() {
	DebugPanel.toggle();
}

/**
 * Toggle render mode
 */
function toggleRenderMode() {
	// This would require a full reload to switch between 2D and 3D
	if (renderMode === '3d') {
		window.location.href = window.location.origin + '/2d';
	} else {
		window.location.href = window.location.origin;
	}
}

/**
 * Toggle wireframe mode
 */
function toggleWireframe() {
	if (typeof Renderer.toggleWireframe === 'function') {
		Renderer.toggleWireframe();
	}
}

/**
 * Toggle axes helper
 */
function toggleAxes() {
	if (typeof Renderer.toggleAxes === 'function') {
		Renderer.toggleAxes();
	}
}

/**
 * Toggle stats panel
 */
function toggleStats() {
	if (typeof Renderer.toggleStats === 'function') {
		Renderer.toggleStats();
	}
}

/**
 * Toggle grid helper
 */
function toggleGrid() {
	if (typeof Renderer.toggleGrid === 'function') {
		Renderer.toggleGrid();
	}
}

/**
 * Toggle shadows
 */
function toggleShadows() {
	if (typeof Renderer.toggleShadows === 'function') {
		Renderer.toggleShadows();
	}
}

/**
 * Toggle physics debug
 */
function togglePhysicsDebug() {
	if (typeof Renderer.togglePhysicsDebug === 'function') {
		Renderer.togglePhysicsDebug();
	}
}

/**
 * Toggle sound
 */
function toggleSound() {
	// TODO: Implement sound toggling
	console.log('Sound toggled');
}

/**
 * Toggle music
 */
function toggleMusic() {
	// TODO: Implement music toggling
	console.log('Music toggled');
}

/**
 * Handle chat message
 */
async function handleChatMessage(message) {
	try {
		await GameManager.sendChatMessage(message);
	} catch (error) {
		console.error('Failed to send chat message:', error);
	}
}

/**
 * Handle piece purchase
 */
async function handlePiecePurchase(data) {
	try {
		await GameManager.purchasePiece(data.pieceType, data.x, data.y);
	} catch (error) {
		console.error('Failed to purchase piece:', error);
	}
}

/**
 * Clean up resources when the application is unloaded
 */
function cleanup() {
	try {
		console.log('Cleaning up resources...');
		
		// Save session data
		if (isInitialized) {
			SessionManager.saveSession();
		}
	
	// Disconnect from the server
	if (Network.isConnected()) {
			Network.disconnect();
	}
	
		console.log('Cleanup complete');
	} catch (error) {
		console.error('Error during cleanup:', error);
	}
}

/**
 * Main game loop
 * @param {number} timestamp - Current timestamp
 */
function gameLoop(timestamp) {
	try {
		// Call the game manager's update function
		if (isInitialized && !GameManager.isGamePaused()) {
			GameManager.update(timestamp);
		}
		
		// Request next frame
		requestAnimationFrame(gameLoop);
	} catch (error) {
		console.error('Error in game loop:', error);
	}
}

// Initialize the application when the DOM is ready
document.addEventListener('DOMContentLoaded', init);

// Clean up resources when the page is unloaded
window.addEventListener('beforeunload', cleanup);

// Export functions for debugging
window.debug = {
	GameManager,
	PlayerManager,
	TetrominoManager,
	InputController,
	Network,
	UI,
	SessionManager,
	renderMode
}; 