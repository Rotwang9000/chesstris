/**
 * Shaktris Game - Enhanced Main Entry Point
 * 
 * This file initializes the enhanced game core with Russian theme.
 */

import * as gameCore from './enhanced-gameCore.js';
import * as debugUtils from './utils/debugUtils.js';
import * as NetworkManager from './utils/networkManager.js';
import * as NetworkStatusManager from './utils/networkStatusManager.js';
import { createNetworkStatusDisplay } from './createNetworkStatusDisplay.js';
import { createUnifiedPlayerBar, updateUnifiedPlayerBar } from './unifiedPlayerBar.js';
import './boardFunctions.js'; // Import the updated board functions


// Global state
let isGameStarted = false;
let playerName = localStorage.getItem('playerName') || '';
let currentGameId = null;

// Main initialization
async function init() {
	console.log('Initializing enhanced Shaktris game with Russian theme...');
	
	// Force hide loading screen and error messages - failsafe
	hideLoadingScreen();
	hideError();
	
	try {
		// Run diagnostics first to catch any issues
		const diagnostics = debugUtils.printSystemDiagnostics();
		
		// Check THREE.js status
		if (!diagnostics.threeStatus || !diagnostics.threeStatus.isLoaded) {
			throw new Error('THREE.js not available. Please check your internet connection.');
		}
		
		
		// Initialize NetworkStatusManager
		NetworkStatusManager.init();
		
		// Add status listener
		NetworkStatusManager.addStatusListener((status) => {
			if (status === NetworkStatusManager.NetworkStatus.DISCONNECTED) {
				console.log('Network connection lost, game paused');
				// If game is running, pause it
				if (isGameStarted && gameCore.pauseGame) {
					gameCore.pauseGame();
				}
			} else if (status === NetworkStatusManager.NetworkStatus.CONNECTED) {
				console.log('Network connection restored');
				// If game was paused due to disconnect, resume it
				if (isGameStarted && gameCore.resumeGame) {
					gameCore.resumeGame();
				}
			}
		});
		
		// Create network status display
		createNetworkStatusDisplay();
		
		// Show player login if needed
		if (!playerName) {
			// Always hide loading screen before showing login
			document.getElementById('loading').style.display = 'none';
			showPlayerNamePrompt();
			return;
		}
		
		// Hide loading screen only after game is initialized
		// DO NOT hide it here to avoid flash of content
		
		// Initialize the game first
		console.log('Starting enhanced game initialization...');
		const gameContainer = document.getElementById('game-container');
		gameContainer.style.display = 'block';
		
		// Ensure proper heights are set
		gameContainer.style.height = '100vh';
		gameContainer.style.minHeight = '100vh';
		
		isGameStarted = gameCore.initGame(gameContainer);
		
		if (!isGameStarted) {
			throw new Error('Game initialization failed');
		}
		
		// Set up resize handler
		window.addEventListener('resize', () => {
			if (isGameStarted) {
				gameCore.updateRenderSize();
			}
		});
		
		// Create initial player bar with minimal state
		const initialState = {
			players: {},
			localPlayerId: null
		};
		
		// If we have a player name, add it to the initial state
		if (playerName) {
			const tempId = 'temp-' + Math.random().toString(36).substring(2, 9);
			initialState.players[tempId] = {
				name: playerName,
				id: tempId,
				score: 0
			};
			initialState.localPlayerId = tempId;
		}
		hideError();
		// Create player bar
		createUnifiedPlayerBar(initialState);
		
		// Join or create a game - this will handle the loading screen
		joinGame();
		
		console.log('Enhanced game initialized successfully');
	} catch (error) {
		console.error('Error initializing game:', error);
		
		// Show error message with Russian theme
		const errorElement = document.getElementById('error-message');
		if (errorElement) {
			errorElement.innerHTML = `
				<h3 style="color: #ffcc00; font-family: 'Times New Roman', serif;">Error Starting Game</h3>
				<p>${error.message}</p>
				<div style="margin-top: 15px;">
					<button onclick="window.location.reload()" style="background-color: #333; color: #ffcc00; border: 1px solid #ffcc00; padding: 8px 16px; font-family: 'Times New Roman', serif; cursor: pointer;">Reload</button>
				</div>
			`;
			errorElement.style.display = 'flex';
		}
		
		// Hide loading screen
		document.getElementById('loading').style.display = 'none';

	}
}

/**
 * Show player name prompt with Russian theme
 */
function showPlayerNamePrompt() {
	// Hide loading screen
	document.getElementById('loading').style.display = 'none';
	
	// Create or get login container
	let loginContainer = document.getElementById('login-container');
	if (!loginContainer) {
		loginContainer = document.createElement('div');
		loginContainer.id = 'login-container';
		
		// Style the login container with Russian theme
		Object.assign(loginContainer.style, {
			position: 'fixed',
			top: '0',
			left: '0',
			width: '100%',
			height: '100%',
			backgroundColor: 'rgba(0, 0, 0, 0.9)',
			display: 'flex',
			justifyContent: 'center',
			alignItems: 'center',
			zIndex: '1001'
		});
		
		// Add login form with Russian theme
		loginContainer.innerHTML = `
			<div style="background-color: #111; padding: 30px; border-radius: 10px; width: 300px; max-width: 90%; text-align: center; box-shadow: 0 0 20px rgba(255, 204, 0, 0.3); border: 2px solid #ffcc00;">
				<h2 style="color: #ffcc00; margin-top: 0; font-family: 'Times New Roman', serif;">Welcome to Shaktris</h2>
				<div style="font-size: 36px; color: #ffcc00; margin: 10px 0;">☦</div>
				<p style="color: white; margin-bottom: 20px; font-family: 'Times New Roman', serif;">Enter your player name to start playing</p>
				
				<form id="player-form" style="display: flex; flex-direction: column; gap: 15px;">
					<input 
						type="text" 
						id="player-name" 
						placeholder="Your name" 
						style="padding: 10px; border-radius: 5px; border: 1px solid #ffcc00; background-color: #222; color: white; font-size: 16px; font-family: 'Times New Roman', serif;"
						maxlength="20"
						required
					>
					
					<button 
						type="submit" 
						style="padding: 10px; background-color: #333; color: #ffcc00; border: 1px solid #ffcc00; border-radius: 5px; cursor: pointer; font-size: 16px; font-weight: bold; font-family: 'Times New Roman', serif;"
					>
						Start Playing
					</button>
				</form>
			</div>
		`;
		
		document.body.appendChild(loginContainer);
		
		// Focus the input field
		setTimeout(() => {
			document.getElementById('player-name').focus();
		}, 100);
		
		// Add form submit handler
		document.getElementById('player-form').addEventListener('submit', (e) => {
			e.preventDefault();
			
			const nameInput = document.getElementById('player-name');
			const name = nameInput.value.trim();
			
			if (name) {
				playerName = name;
				localStorage.setItem('playerName', name);
				
				// Remove login container
				document.body.removeChild(loginContainer);
				
				// Restart initialization
				init();
			}
		});
	}
}

/**
 * Join or create a game
 */
async function joinGame(gameId = null) {
	try {
		// Force hide any error messages - failsafe
		hideError();
		
		// Check if NetworkManager is available directly from import
		if (!NetworkManager) {
			showError('Network manager not available. Please refresh the page.');
			hideLoadingScreen(); // Ensure loading screen is hidden
			return false;
		}

		// Add direct detection of existing connection
		if (NetworkManager.isConnected && NetworkManager.isConnected()) {
			console.log('NetworkManager already connected, proceeding to join game directly');
			return joinGameAfterConnection(gameId);
		}

		// Show connecting message
		showToastNotification('Connecting to game server...');

		// Initialize network connection with progressive retry
		let connected = false;
		let attempts = 0;
		const maxInitialAttempts = 3;
		let retryDelay = 2000; // Start with 2 seconds
		const maxRetryDelay = 30000; // Cap at 30 seconds

		while (!connected && attempts < maxInitialAttempts) {
			attempts++;
			console.log(`Connection attempt ${attempts}...`);
			
			try {
				const connectionResult = await NetworkManager.initialize(playerName || 'Guest');
				if (connectionResult) {
					connected = true;
					hideError();
					console.log('Successfully connected to server');
					break;
				} else {
					await new Promise(resolve => setTimeout(resolve, retryDelay));
					retryDelay = Math.min(retryDelay * 1.5, maxRetryDelay);
				}
			} catch (error) {
				console.warn(`Connection attempt ${attempts} failed:`, error);
				await new Promise(resolve => setTimeout(resolve, retryDelay));
				retryDelay = Math.min(retryDelay * 1.5, maxRetryDelay);
			}
		}

		// If not connected after initial attempts, set up continuous retry in background
		if (!connected) {
			showError('Having trouble connecting to server. Will keep trying in background...');
			
			// Set up progressive retry in background
			const retryConnection = async () => {
				try {
					console.log(`Background connection attempt, delay: ${retryDelay}ms`);
					const result = await NetworkManager.initialize(playerName || 'Guest');
					if (result) {
						hideError();
						showToastNotification('Connected to server!');
						console.log('Background connection attempt successful');
						
						// Now try to join the game
						joinGameAfterConnection(gameId);
						return true;
					}
				} catch (error) {
					console.warn('Background connection attempt failed:', error);
				}
				
				// Schedule next retry with increasing delay
				retryDelay = Math.min(retryDelay * 1.5, maxRetryDelay);
				setTimeout(retryConnection, retryDelay);
				return false;
			};
			
			// Start background retry process
			setTimeout(retryConnection, retryDelay);
			
			// Don't block UI - hide loading screen
			document.getElementById('loading').style.display = 'none';
			return false;
		}

		// Set up connection status monitoring
		NetworkManager.on('disconnect', () => {
			showError('Lost connection to server. Attempting to reconnect...');
			
			// Set up progressive retry
			let reconnectDelay = 2000;
			const reconnectMaxDelay = 30000;
			
			const attemptReconnect = async () => {
				try {
					console.log(`Reconnection attempt, delay: ${reconnectDelay}ms`);
					await NetworkManager.reconnect();
					if (NetworkManager.isConnected()) {
						hideError();
						showToastNotification('Reconnected to server!');
						
						// Rejoin the game if we have a game ID
						if (currentGameId) {
							NetworkManager.joinGame(currentGameId);
						}
						return;
					}
				} catch (error) {
					console.warn('Reconnection attempt failed:', error);
				}
				
				// Schedule next retry with increasing delay
				reconnectDelay = Math.min(reconnectDelay * 1.5, reconnectMaxDelay);
				setTimeout(attemptReconnect, reconnectDelay);
			};
			
			// Start reconnection process
			setTimeout(attemptReconnect, reconnectDelay);
		});

		NetworkManager.on('connect', () => {
			hideError();
			console.log('Reconnected to server');
			if(!isGameStarted){
				joinGameAfterConnection(gameId);
			}
		});

		return joinGameAfterConnection(gameId);
	} catch (error) {
		console.error('Error joining game:', error);
		showError('An error occurred while joining the game. Please try again.');
		
		// Hide loading screen even if there's an error
		document.getElementById('loading').style.display = 'none';
		return false;
	}
}

/**
 * Join game after connection is established
 */
async function joinGameAfterConnection(gameId = null) {
	try {
		// Use NetworkManager directly from import
		if (!NetworkManager) {
			console.error('NetworkManager not available');
			showError('Network manager not available. Please refresh the page.');
			hideLoadingScreen();
			return false;
		}
		
		// Attempt to join the game
		console.log(`Attempting to join game: ${gameId || 'global game'}`);
		const joinResult = await NetworkManager.joinGame(gameId);
		if (!joinResult || !joinResult.success) {
			console.error('Failed to join game:', joinResult);
			showError('Could not join game. Please try again.');
			
			// Hide loading screen
			document.getElementById('loading').style.display = 'none';
			return false;
		}

		// Store the game ID
		currentGameId = joinResult.gameId;
		console.log(`Successfully joined game: ${currentGameId}`);

		// Register for game state updates
		console.log('Registering for game state updates');
		NetworkManager.onMessage('game_state', (data) => {
			console.log('Game state message received:', data);
			if (typeof gameCore !== 'undefined' && gameCore.handleGameStateUpdate) {
				gameCore.handleGameStateUpdate(data);
				
				// Also update the unified player bar if we have one
				if (data && data.players) {
					updateUnifiedPlayerBar(data);
				}
			}
		});

		// Register for game updates
		NetworkManager.onMessage('game_update', (data) => {
			console.log('Game update message received:', data);
			if (typeof gameCore !== 'undefined' && gameCore.handleGameUpdate) {
				gameCore.handleGameUpdate(data);
				
				// Update player bar if the update affects player state
				if (data && (data.players || data.currentPlayer)) {
					// Get current game state 
					if (window.gameState) {
						updateUnifiedPlayerBar(window.gameState);
					}
				}
			}
		});

		// Enable game state polling
		console.log('Starting game state polling');
		NetworkManager.startGameStatePolling();

		// Explicitly request initial game state
		console.log('Requesting initial game state...');
		try {
			const state = await NetworkManager.getGameState({ gameId: currentGameId });
			console.log('Initial game state received:', state);
			if (typeof gameCore !== 'undefined' && gameCore.handleGameStateUpdate) {
				gameCore.handleGameStateUpdate(state);
				
				// Initialize the player bar with the initial state
				createUnifiedPlayerBar(state);
			}
		} catch (error) {
			console.error('Error fetching initial game state:', error);
			showToastNotification('Error fetching game state. Will try again...');
			
			// Retry once more with a delay
			setTimeout(async () => {
				try {
					console.log('Retrying game state request...');
					const state = await NetworkManager.getGameState({ gameId: currentGameId });
					console.log('Game state received on retry:', state);
					if (typeof gameCore !== 'undefined' && gameCore.handleGameStateUpdate) {
						gameCore.handleGameStateUpdate(state);
						
						// Initialize the player bar with the retry state
						createUnifiedPlayerBar(state);
					}
				} catch (retryError) {
					console.error('Failed to get game state on retry:', retryError);
					showToastNotification('Could not fetch game state. Try refreshing the page.');
				}
			}, 3000);
		}

		// Update game ID display
		const gameIdDisplay = document.getElementById('game-id-display');
		if (gameIdDisplay) {
			gameIdDisplay.value = currentGameId;
		}

		// Hide loading screen
		document.getElementById('loading').style.display = 'none';
		
		// Show success message
		showToastNotification('Connected to game server!');
		
		// Set up player list updates
		setupPlayerListUpdates();
		
		return true;
	} catch (error) {
		console.error('Error joining game after connection:', error);
		showError('Error joining game. Will retry in background.');
		
		// Hide loading screen
		document.getElementById('loading').style.display = 'none';
		return false;
	}
}

function showError(message) {
	const errorElement = document.getElementById('error-message');
	if (errorElement) {
		errorElement.textContent = message;
		errorElement.style.display = 'block';
	} else {
		console.error(message);
	}
}

function hideError() {
	const errorElement = document.getElementById('error-message');
	if (errorElement) {
		errorElement.style.display = 'none';
	}
}

/**
 * Set up player list updates
 */
function setupPlayerListUpdates() {
	// First, make sure NetworkManager is properly imported
	if (!NetworkManager) {
		console.warn('NetworkManager not available, will retry later');
		setTimeout(setupPlayerListUpdates, 5000); // Longer delay to prevent rapid retries
		return;
	}
	
	try {
		// Check if NetworkManager is connected - try multiple methods
		let connected = false;
		
		// Method 1: Direct connection check
		if (typeof NetworkManager.isConnected === 'function') {
			connected = NetworkManager.isConnected();
			console.log('Connection check via isConnected():', connected);
		}
		
		// Method 2: Check connection status
		if (!connected && typeof NetworkManager.getStatus === 'function') {
			const status = NetworkManager.getStatus();
			connected = (status === 'connected');
			console.log('Connection check via getStatus():', status, connected);
		}
		
		// Method 3: Check if socket is available
		if (!connected && typeof NetworkManager.getSocket === 'function') {
			const socket = NetworkManager.getSocket();
			if (socket && socket.connected) {
				connected = true;
				console.log('Connection confirmed via socket check');
			}
		}
		
		// If connected by any method, set up player list functionality
		if (connected) {
			console.log('Network connection confirmed, setting up player list functionality');
			
			// Listen for player list updates
			if (typeof NetworkManager.onMessage === 'function') {
				NetworkManager.onMessage('player_list', (data) => {
					if (data && data.players) {
						// Update the game state with players
						if (window.gameState) {
							window.gameState.players = Object.assign({}, window.gameState.players || {}, data.players);
							
							// Update the unified player bar with the updated game state
							updateUnifiedPlayerBar(window.gameState);
						} else {
							// If no game state yet, create a minimal one for the player bar
							const minimalState = {
								players: data.players,
								localPlayerId: NetworkManager.getPlayerId?.() || null
							};
							updateUnifiedPlayerBar(minimalState);
						}
					}
				});
				console.log('Player list message handler registered');
			}
			
			// Request initial player list
			if (typeof NetworkManager.requestPlayerList === 'function') {
				console.log('Requesting initial player list');
				NetworkManager.requestPlayerList();
			}
			
			// Register for connection status changes
			if (typeof NetworkManager.on === 'function') {
				NetworkManager.on('connect', () => {
					console.log('Connection established/restored, refreshing player list');
					if (typeof NetworkManager.requestPlayerList === 'function') {
						NetworkManager.requestPlayerList();
					}
				});
			}
			
			// Successfully set up
			return;
		}
		
		// If we get here, we're not connected - try to initialize connection
		console.log('Network not connected, attempting to initialize connection');
		if (typeof NetworkManager.initialize === 'function') {
			NetworkManager.initialize(playerName || 'Guest')
				.then(result => {
					if (result) {
						console.log('Successfully initialized connection, setting up player list');
						// Call self again to set up listeners now that we're connected
						setTimeout(setupPlayerListUpdates, 1000);
					} else {
						console.log('Failed to initialize connection, will retry later');
						setTimeout(setupPlayerListUpdates, 5000);
					}
				})
				.catch(error => {
					console.error('Error initializing network connection:', error);
					setTimeout(setupPlayerListUpdates, 5000);
				});
		} else {
			// Last resort - just retry later
			console.log('Network initialize function not available, will retry later');
			setTimeout(setupPlayerListUpdates, 5000);
		}
	} catch (error) {
		console.error('Error setting up player list updates:', error);
		setTimeout(setupPlayerListUpdates, 5000);
	}
}

/**
 * Initialize network connection with retry
 */
async function initializeNetworkWithRetry() {
	let connected = false;
	let attempts = 0;
	let retryDelay = 2000; // Start with 2 seconds
	const maxRetryDelay = 30000; // Cap at 30 seconds

	while (!connected && attempts < 10) { // Limit to 10 attempts before returning
		attempts++;
		console.log(`Network initialization attempt ${attempts}...`);
		
		try {
			const result = await NetworkManager.initialize(playerName || 'Guest');
			if (result && result.playerId) {
				connected = true;
				console.log('Successfully connected to server');
				return true;
			}
		} catch (error) {
			console.warn(`Network initialization attempt ${attempts} failed:`, error);
			
			// Show message every few attempts
			if (attempts % 3 === 0) {
				showToastNotification(`Still trying to connect (attempt ${attempts})...`);
			}
		}
		
		// Wait before retrying
		await new Promise(resolve => setTimeout(resolve, retryDelay));
		
		// Increase delay for next attempt (with cap)
		retryDelay = Math.min(retryDelay * 1.5, maxRetryDelay);
	}
	
	return false;
}

/**
 * Show toast notification with Russian theme
 * @param {string} message - Message to display
 */
function showToastNotification(message) {
	// Create toast container if it doesn't exist
	let toastContainer = document.getElementById('toast-container');
	if (!toastContainer) {
		toastContainer = document.createElement('div');
		toastContainer.id = 'toast-container';
		
		// Style container
		Object.assign(toastContainer.style, {
			position: 'fixed',
			bottom: '20px',
			left: '50%',
			transform: 'translateX(-50%)',
			zIndex: '1000',
			pointerEvents: 'none'
		});
		
		document.body.appendChild(toastContainer);
	}
	
	// Create toast element with Russian theme
	const toast = document.createElement('div');
	
	// Style toast with Russian theme
	Object.assign(toast.style, {
		backgroundColor: 'rgba(0, 0, 0, 0.8)',
		color: '#ffcc00',
		padding: '10px 20px',
		borderRadius: '5px',
		marginBottom: '10px',
		boxShadow: '0 0 10px rgba(255, 204, 0, 0.3)',
		fontFamily: 'Times New Roman, serif',
		border: '1px solid #ffcc00',
		opacity: '0',
		transform: 'translateY(20px)',
		transition: 'opacity 0.3s, transform 0.3s'
	});
	
	// Set message
	toast.textContent = message;
	
	// Add to container
	toastContainer.appendChild(toast);
	
	// Animate in
	setTimeout(() => {
		toast.style.opacity = '1';
		toast.style.transform = 'translateY(0)';
	}, 10);
	
	// Remove after 3 seconds
	setTimeout(() => {
		toast.style.opacity = '0';
		toast.style.transform = 'translateY(-20px)';
		
		setTimeout(() => {
			if (toast.parentNode) {
				toast.parentNode.removeChild(toast);
			}
		}, 300);
	}, 3000);
}

// Helper function to ensure loading screen is always hidden
function hideLoadingScreen() {
	console.log('Forcibly hiding loading screen');
	const loadingElement = document.getElementById('loading');
	if (loadingElement) {
		loadingElement.style.display = 'none';
	}
	
	// Also hide any loading indicator elements
	const loadingIndicator = document.getElementById('loading-indicator');
	if (loadingIndicator) {
		if (loadingIndicator.parentNode) {
			loadingIndicator.parentNode.removeChild(loadingIndicator);
		}
	}
	
	// Hide other potential loading elements
	const elements = document.querySelectorAll('[id*="loading"]');
	elements.forEach(el => {
		el.style.display = 'none';
	});
}

// Start initialization
init(); 