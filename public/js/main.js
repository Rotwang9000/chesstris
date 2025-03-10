/**
 * Main Entry Point
 * 
 * Initializes the game and handles the main application flow.
 */

import * as GameManager from './core/gameManager.js';
import * as PlayerManager from './core/playerManager.js';
import * as TetrominoManager from './core/tetrominoManager.js';
import Renderer from './rendering/index.js'; 
import * as Network from './utils/network.js';
import * as Helpers from './utils/helpers.js';
import * as UI from './ui/uiManager.js';
import * as Marketplace from './ui/marketplaceUI.js';
import SessionManager from './services/sessionManager.js';
import WalletManager from './ui/walletManager.js';

// Game state
let isInitialized = false;
let currentUser = null;

/**
 * Initialize the application
 */
async function init() {
	try {
		console.log('Initializing Chesstris...');
		
		// Initialize UI
		UI.init();
		UI.showLoadingScreen('Loading game...');
		
		// Initialize session management
		const session = SessionManager.initSession();
		console.log('Session initialized:', session);
		
		// Initialize wallet UI
		WalletManager.initWalletUI();
		
		// Initialize marketplace UI
		Marketplace.setupMarketplaceUI();
		Marketplace.setupPaymentUI();
		
		// Initialize network connection
		try {
			await Network.initSocket();
			console.log('Network connection established');
			
			// Try to get current user from session or token
			if (session.playerId) {
				// Use player from session
				currentUser = {
					id: session.playerId,
					name: session.username || 'Anonymous'
				};
				
				// Initialize the game renderer
				const gameContainer = document.getElementById('game-container');
				if (!gameContainer) {
					throw new Error('Game container element not found');
				}
				
				const rendererSuccess = Renderer.init(gameContainer, {
					debug: false,
					texturePaths: {
						board: './img/textures/board.png',
						cell: './img/textures/cell.png',
						homeZone: './img/textures/home_zone.png'
					}
				});
				
				if (rendererSuccess) {
					console.log('Renderer initialized successfully');
				} else {
					console.error('Failed to initialize renderer');
					UI.showErrorScreen('Renderer Error', 'Failed to initialize the game renderer. Please refresh the page and try again.');
					return;
				}
				
				// Initialize game state if GameManager.initGame exists
				if (typeof GameManager.initGame === 'function') {
					GameManager.initGame();
				} else {
					console.warn('GameManager.initGame not found, skipping game initialization');
				}
				
				// Set up event listeners
				setupEventListeners();
				
				// Hide loading screen
				UI.hideLoadingScreen();
				UI.showNotification('Welcome to Chesstris - DEBUG MODE ACTIVE', 'info');
				
				// Set initialized flag
				isInitialized = true;
				console.log('Chesstris initialized successfully');
			} else {
				// No session, show login UI
				UI.hideLoadingScreen();
				if (typeof UI.showLoginForm === 'function') {
					UI.showLoginForm();
				} else {
					UI.showMainMenu();
				}
			}
		} catch (error) {
			console.error('Error connecting to server:', error);
			UI.hideLoadingScreen();
			UI.showErrorScreen('Connection Error', 'Unable to connect to server. Please check your internet connection and try again.');
		}
	} catch (error) {
		console.error('Initialization error:', error);
		UI.hideLoadingScreen();
		UI.showErrorScreen('Initialization Error', 'Failed to initialize the application. Please refresh the page and try again.');
	}
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
	// Network events
	Network.on('game_update', handleGameUpdate);
	Network.on('player_joined', handlePlayerJoined);
	Network.on('player_left', handlePlayerLeft);
	Network.on('game_over', handleGameOver);
	
	// UI events
	UI.on('start_game', handleStartGame);
	UI.on('join_game', handleJoinGame);
	UI.on('leave_game', handleLeaveGame);
	UI.on('login', handleLogin);
	UI.on('register', handleRegister);
	UI.on('logout', handleLogout);
	
	// Keyboard events
	document.addEventListener('keydown', handleKeyDown);
}

/**
 * Handle game update event
 * @param {Object} data - The game update data
 */
function handleGameUpdate(data) {
	// Update the game state
	// This would typically sync the local game state with the server
	console.log('Game update received:', data);
}

/**
 * Handle player joined event
 * @param {Object} data - The player data
 */
function handlePlayerJoined(data) {
	console.log('Player joined:', data);
	UI.showNotification(`${data.username} joined the game`, 'info');
}

/**
 * Handle player left event
 * @param {Object} data - The player data
 */
function handlePlayerLeft(data) {
	console.log('Player left:', data);
	UI.showNotification(`${data.username} left the game`, 'info');
}

/**
 * Handle game over event
 * @param {Object} data - The game over data
 */
function handleGameOver(data) {
	console.log('Game over:', data);
	UI.showGameOverScreen(data);
}

/**
 * Handle start game event
 * @param {Object} options - Game options
 */
async function handleStartGame(options) {
	try {
		UI.showLoadingScreen('Starting game...');
		
		// Initialize the game
		const gameState = GameManager.initGame(options);
		
		// If connected to the server, create a game
		if (Network.isConnected()) {
			try {
				const gameData = await Network.createGame(options);
				console.log('Game created on server:', gameData);
			} catch (error) {
				console.warn('Failed to create game on server:', error);
				UI.showNotification('Playing in offline mode', 'warning');
			}
		}
		
		// Add the local player
		const playerId = currentUser?.id || 'local_player';
		const username = currentUser?.username || 'Player 1';
		await PlayerManager.addPlayer(playerId, username, currentUser);
		
		// Show the game screen
		UI.showGameScreen();
		
		console.log('Game started successfully');
	} catch (error) {
		console.error('Failed to start game:', error);
		UI.showErrorScreen('Failed to start game', error.message);
	}
}

/**
 * Handle join game event
 * @param {string} gameId - The game ID to join
 */
async function handleJoinGame(gameId) {
	try {
		UI.showLoadingScreen('Joining game...');
		
		// Join the game on the server
		const gameData = await Network.joinGame(gameId);
		console.log('Joined game:', gameData);
		
		// Initialize the game with the server data
		const gameState = GameManager.initGame(gameData);
		
		// Show the game screen
		UI.showGameScreen();
		
		console.log('Joined game successfully');
	} catch (error) {
		console.error('Failed to join game:', error);
		UI.showErrorScreen('Failed to join game', error.message);
	}
}

/**
 * Handle leave game event
 */
async function handleLeaveGame() {
	try {
		// End the current game
		const gameResult = GameManager.endGame();
		
		// If connected to the server, leave the game
		if (Network.isConnected()) {
			try {
				await Network.leaveGame(GameManager.getGameId());
			} catch (error) {
				console.warn('Failed to leave game on server:', error);
			}
		}
		
		// Show the main menu
		UI.showMainMenu();
		
		console.log('Left game successfully');
	} catch (error) {
		console.error('Failed to leave game:', error);
		UI.showNotification('Failed to leave game', 'error');
	}
}

/**
 * Handle login event
 * @param {Object} credentials - Login credentials
 */
async function handleLogin(credentials) {
	try {
		UI.showLoadingScreen('Logging in...');
		
		// Login on the server
		const userData = await Network.login(credentials.username, credentials.password);
		
		// Update current user
		currentUser = userData.user;
		UI.updateUserInfo(currentUser);
		
		// Show the main menu
		UI.showMainMenu();
		UI.showNotification('Logged in successfully', 'success');
		
		console.log('Logged in successfully');
	} catch (error) {
		console.error('Login failed:', error);
		UI.hideLoadingScreen();
		UI.showNotification('Login failed: ' + error.message, 'error');
	}
}

/**
 * Handle register event
 * @param {Object} userData - User registration data
 */
async function handleRegister(userData) {
	try {
		UI.showLoadingScreen('Creating account...');
		
		// Register on the server
		const registeredUser = await Network.register(
			userData.username,
			userData.password,
			userData.email
		);
		
		// Update current user
		currentUser = registeredUser.user;
		UI.updateUserInfo(currentUser);
		
		// Show the main menu
		UI.showMainMenu();
		UI.showNotification('Account created successfully', 'success');
		
		console.log('Registered successfully');
	} catch (error) {
		console.error('Registration failed:', error);
		UI.hideLoadingScreen();
		UI.showNotification('Registration failed: ' + error.message, 'error');
	}
}

/**
 * Handle logout event
 */
function handleLogout() {
	// Logout from the server
	Network.logout();
	
	// Clear current user
	currentUser = null;
	UI.updateUserInfo(null);
	
	// Show the main menu
	UI.showMainMenu();
	UI.showNotification('Logged out successfully', 'info');
	
	console.log('Logged out successfully');
}

/**
 * Handle keyboard events
 * @param {KeyboardEvent} event - The keyboard event
 */
function handleKeyDown(event) {
	// Only handle keyboard events when in a game
	if (!GameManager.getGameId() || GameManager.isGamePaused()) {
		return;
	}
	
	const playerId = currentUser?.id || 'local_player';
	
	switch (event.key) {
		case 'ArrowLeft':
			// Move tetromino left
			GameManager.handlePlayerInput(playerId, 'move_tetromino', { direction: 'left' });
			break;
			
		case 'ArrowRight':
			// Move tetromino right
			GameManager.handlePlayerInput(playerId, 'move_tetromino', { direction: 'right' });
			break;
			
		case 'ArrowDown':
			// Move tetromino down
			GameManager.handlePlayerInput(playerId, 'move_tetromino', { direction: 'down' });
			break;
			
		case 'ArrowUp':
			// Rotate tetromino
			GameManager.handlePlayerInput(playerId, 'rotate_tetromino', { direction: 'clockwise' });
			break;
			
		case ' ':
			// Hard drop
			GameManager.handlePlayerInput(playerId, 'hard_drop');
			break;
			
		case 'Escape':
			// Toggle pause
			GameManager.handlePlayerInput(playerId, 'toggle_pause', { isAdmin: true });
			break;
	}
}

/**
 * Clean up the application
 */
function cleanup() {
	// End the current game
	if (GameManager.getGameId()) {
		GameManager.endGame();
	}
	
	// Clean up the renderer
	Renderer.cleanup();
	
	// Disconnect from the server
	if (Network.isConnected()) {
		Network.getSocket().disconnect();
	}
	
	console.log('Application cleaned up');
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', init);

// Clean up when the window is closed
window.addEventListener('beforeunload', cleanup);

// Export for debugging
window.Chesstris = {
	GameManager,
	PlayerManager,
	TetrominoManager,
	Renderer,
	Network,
	Helpers,
	UI,
	getCurrentUser: () => currentUser
}; 