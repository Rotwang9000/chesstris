/**
 * Shaktris Game - Enhanced Main Entry Point
 * 
 * This file initializes the enhanced game core with Russian theme.
 */

import * as gameCore from './enhanced-gameCore.js';
import * as debugUtils from './utils/debugUtils.js';
import * as NetworkManagerModule from './utils/networkManager.js';
import './boardFunctions.js'; // Import the updated board functions

// Make NetworkManager available globally for other modules to access
window.NetworkManager = NetworkManagerModule;

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
		
		// Make sure NetworkManager is globally available
		if (!window.NetworkManager) {
			console.warn('NetworkManager not globally available, assigning it now');
			window.NetworkManager = NetworkManagerModule;
		}
		
		// Initialize NetworkStatusManager if available
		if (window.NetworkStatusManager) {
			window.NetworkStatusManager.init();
			
			// Add status listener
			window.NetworkStatusManager.addStatusListener((status) => {
				if (status === window.NetworkStatusManager.NetworkStatus.DISCONNECTED) {
					console.log('Network connection lost, game paused');
					// If game is running, pause it
					if (isGameStarted && gameCore.pauseGame) {
						gameCore.pauseGame();
					}
				} else if (status === window.NetworkStatusManager.NetworkStatus.CONNECTED) {
					console.log('Network connection restored');
					// If game was paused due to disconnect, resume it
					if (isGameStarted && gameCore.resumeGame) {
						gameCore.resumeGame();
					}
				}
			});
		}
		
		// Show player login if needed
		if (!playerName) {
			// Always hide loading screen before showing login
			document.getElementById('loading').style.display = 'none';
			showPlayerNamePrompt();
			return;
		}
		
		// Hide loading screen only after game is initialized
		// DO NOT hide it here to avoid flash of content
		
		// Create player list sidebar with Russian theme
		createPlayerListSidebar();
		
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
					<a href="minimal.html" style="color: #ffcc00; margin-right: 15px; font-family: 'Times New Roman', serif;">Try Minimal Version</a>
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
 * Create player list sidebar with Russian theme
 */
function createPlayerListSidebar() {
	// Create sidebar element
	const sidebar = document.createElement('div');
	sidebar.id = 'player-sidebar';
	
	// Style the sidebar with Russian theme
	Object.assign(sidebar.style, {
		position: 'fixed',
		top: '0',
		left: '0',
		width: '200px',
		height: '100%',
		backgroundColor: 'rgba(0, 0, 0, 0.7)',
		color: 'white',
		padding: '10px',
		zIndex: '100',
		overflowY: 'auto',
		transform: 'translateX(-180px)',
		transition: 'transform 0.3s',
		boxShadow: '0 0 10px rgba(255, 204, 0, 0.3)',
		borderRight: '1px solid #ffcc00',
		fontFamily: 'Times New Roman, serif'
	});
	
	// Add sidebar content with Russian theme
	sidebar.innerHTML = `
		<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
			<h3 style="margin: 0; color: #ffcc00; font-family: 'Times New Roman', serif;">Players</h3>
			<button id="toggle-sidebar" style="background: none; border: none; color: #ffcc00; cursor: pointer; font-size: 20px;">
				→
			</button>
		</div>
		<div id="player-list" style="margin-top: 15px;">
			<div style="color: #ffcc00; text-align: center; padding: 10px; font-style: italic;">
				No players online
			</div>
		</div>
		<div style="margin-top: 20px; border-top: 1px solid #ffcc00; padding-top: 10px;">
			<div style="font-size: 14px; color: #ffcc00;">You are playing as:</div>
			<div style="margin-top: 5px; font-weight: bold;">${playerName}</div>
			<button id="change-name" style="margin-top: 10px; padding: 5px; background: #333; color: #ffcc00; border: 1px solid #ffcc00; border-radius: 3px; cursor: pointer; font-size: 12px; width: 100%; font-family: 'Times New Roman', serif;">
				Change Name
			</button>
		</div>
	`;
	
	document.body.appendChild(sidebar);
	
	// Add event listeners
	document.getElementById('toggle-sidebar').addEventListener('click', toggleSidebar);
	document.getElementById('change-name').addEventListener('click', () => {
		localStorage.removeItem('playerName');
		window.location.reload();
	});
	
	// Hover behavior for easier access
	sidebar.addEventListener('mouseenter', () => {
		sidebar.style.transform = 'translateX(0)';
	});
	
	sidebar.addEventListener('mouseleave', () => {
		sidebar.style.transform = 'translateX(-180px)';
	});
	
	// Set up player list updates
	setupPlayerListUpdates();
}

/**
 * Toggle sidebar visibility
 */
function toggleSidebar() {
	const sidebar = document.getElementById('player-sidebar');
	if (sidebar) {
		const isHidden = sidebar.style.transform === 'translateX(-180px)';
		sidebar.style.transform = isHidden ? 'translateX(0)' : 'translateX(-180px)';
		
		// Update toggle button text
		const toggleButton = document.getElementById('toggle-sidebar');
		if (toggleButton) {
			toggleButton.textContent = isHidden ? '←' : '→';
		}
	}
}

/**
 * Set up player list updates
 */
function setupPlayerListUpdates() {
	if (NetworkManagerModule.isConnected()) {
		// Listen for player list updates
		NetworkManagerModule.onMessage('player_list', (data) => {
			if (data && data.players) {
				updatePlayerList(data.players);
			}
		});
		
		// Request initial player list
		NetworkManagerModule.requestPlayerList();
	}
}

/**
 * Update player list with Russian theme
 * @param {Array} players - List of players
 */
function updatePlayerList(players) {
	const playerList = document.getElementById('player-list');
	if (!playerList) return;
	
	// Clear current list
	playerList.innerHTML = '';
	
	if (!players || players.length === 0) {
		playerList.innerHTML = `
			<div style="color: #ffcc00; text-align: center; padding: 10px; font-style: italic;">
				No players online
			</div>
		`;
		return;
	}
	
	// Add players with Russian theme
	players.forEach(player => {
		const playerItem = document.createElement('div');
		
		// Determine player color based on player number
		let playerColor = '#aaaaaa';
		if (player.playerNumber === 1 || player.player === 1) {
			playerColor = '#3377FF';
		} else if (player.playerNumber === 2 || player.player === 2) {
			playerColor = '#FF8800';
		}
		
		// Style the player item with Russian theme
		Object.assign(playerItem.style, {
			padding: '8px',
			marginBottom: '5px',
			borderRadius: '3px',
			backgroundColor: player.id === NetworkManagerModule.getPlayerId() ? 'rgba(255, 204, 0, 0.2)' : 'transparent',
			border: player.id === NetworkManagerModule.getPlayerId() ? '1px solid #ffcc00' : 'none'
		});
		
		// Add player info with Russian theme
		playerItem.innerHTML = `
			<div style="display: flex; align-items: center;">
				<div style="width: 10px; height: 10px; border-radius: 50%; background-color: ${playerColor}; margin-right: 5px;"></div>
				<span style="font-family: 'Times New Roman', serif;">${player.name || player.id} ${player.id === NetworkManagerModule.getPlayerId() ? '(You)' : ''}</span>
			</div>
			${player.isComputer ? '<div style="font-size: 11px; color: #ffcc00; font-style: italic;">(Computer)</div>' : ''}
		`;
		
		playerList.appendChild(playerItem);
	});
}

/**
 * Join or create a game
 */
async function joinGame(gameId = null) {
	try {
		// Force hide any error messages - failsafe
		hideError();
		
		// First check if NetworkManager is available
		if (!window.NetworkManager) {
			console.error('NetworkManager not available, trying to reinitialize');
			window.NetworkManager = NetworkManagerModule;
			
			// If still not available, show error
			if (!window.NetworkManager) {
				showError('Network manager not available. Please refresh the page.');
				hideLoadingScreen(); // Ensure loading screen is hidden
				return false;
			}
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
				const connectionResult = await NetworkManagerModule.initialize(playerName || 'Guest');
				if (connectionResult && connectionResult.playerId) {
					connected = true;
					hideError();
					console.log('Successfully connected to server');
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
					const result = await NetworkManagerModule.initialize(playerName || 'Guest');
					if (result && result.playerId) {
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
		NetworkManagerModule.on('disconnect', () => {
			showError('Lost connection to server. Attempting to reconnect...');
			
			// Set up progressive retry
			let reconnectDelay = 2000;
			const reconnectMaxDelay = 30000;
			
			const attemptReconnect = async () => {
				try {
					console.log(`Reconnection attempt, delay: ${reconnectDelay}ms`);
					await NetworkManagerModule.reconnect();
					if (NetworkManagerModule.isConnected()) {
						hideError();
						showToastNotification('Reconnected to server!');
						
						// Rejoin the game if we have a game ID
						if (currentGameId) {
							NetworkManagerModule.joinGame(currentGameId);
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

		NetworkManagerModule.on('connect', () => {
			hideError();
			console.log('Reconnected to server');
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
		// Attempt to join the game
		const joinResult = await NetworkManagerModule.joinGame(gameId);
		if (!joinResult || !joinResult.success) {
			console.error('Failed to join game:', joinResult);
			showError('Could not join game. Please try again.');
			
			// Hide loading screen
			document.getElementById('loading').style.display = 'none';
			return false;
		}

		// Store the game ID
		currentGameId = joinResult.gameId;

		// Register for game state updates
		NetworkManagerModule.onMessage('game_state', (data) => {
			console.log('Game state message received:', data);
			if (typeof gameCore !== 'undefined' && gameCore.handleGameStateUpdate) {
				gameCore.handleGameStateUpdate(data);
			}
		});

		// Register for game updates
		NetworkManagerModule.onMessage('game_update', (data) => {
			console.log('Game update message received:', data);
			if (typeof gameCore !== 'undefined' && gameCore.handleGameUpdate) {
				gameCore.handleGameUpdate(data);
			}
		});

		// Enable game state polling
		NetworkManagerModule.startGameStatePolling();

		// Explicitly request initial game state
		setTimeout(() => {
			console.log('Requesting initial game state...');
			if (NetworkManagerModule.getGameState) {
				NetworkManagerModule.getGameState()
					.then(state => {
						console.log('Initial game state received:', state);
						if (typeof gameCore !== 'undefined' && gameCore.handleGameStateUpdate) {
							gameCore.handleGameStateUpdate(state);
						}
					})
					.catch(err => console.error('Error fetching initial game state:', err));
			}
		}, 1000);

		// Update game ID display
		const gameIdDisplay = document.getElementById('game-id-display');
		if (gameIdDisplay) {
			gameIdDisplay.value = currentGameId;
		}

		// Hide loading screen
		document.getElementById('loading').style.display = 'none';
		
		// Show success message
		showToastNotification('Connected to game server!');
		
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
			const result = await NetworkManagerModule.initialize(playerName || 'Guest');
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