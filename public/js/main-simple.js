/**
 * Shaktris Game - Simplified Main Entry Point
 * 
 * This file initializes the minimal game core for the main game.
 */

import * as gameCore from './minimal-gameCore.js';
import * as debugUtils from './utils/debugUtils.js';
import * as NetworkManager from './utils/networkManager.js';

// Global state
let isGameStarted = false;
let playerName = localStorage.getItem('playerName') || '';

// Main initialization
async function init() {
	console.log('Initializing simplified Shaktris game...');
	
	try {
		// Run diagnostics first to catch any issues
		const diagnostics = debugUtils.printSystemDiagnostics();
		
		// Check THREE.js status
		if (!diagnostics.threeStatus || !diagnostics.threeStatus.isLoaded) {
			throw new Error('THREE.js not available. Please check your internet connection.');
		}
		
		// Show player login if needed
		if (!playerName) {
			showPlayerNamePrompt();
			return;
		}
		
		// Initialize network connection
		try {
			await NetworkManager.initialize(playerName);
			console.log('Network connection established');
		} catch (error) {
			console.warn('Network initialization failed, continuing in offline mode:', error);
		}
		
		// Hide loading screen, show game container
		document.getElementById('loading').style.display = 'none';
		
		const gameContainer = document.getElementById('game-container');
		gameContainer.style.display = 'block';
		
		// Ensure proper heights are set
		gameContainer.style.height = '100vh';
		gameContainer.style.minHeight = '100vh';
		
		// Create player list sidebar
		createPlayerListSidebar();
		
		// Initialize the game
		console.log('Starting game initialization...');
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
		
		// Join or create a game
		joinGame();
		
		console.log('Game initialized successfully');
	} catch (error) {
		console.error('Error initializing game:', error);
		
		// Show error message
		const errorElement = document.getElementById('error-message');
		if (errorElement) {
			errorElement.innerHTML = `
				<h3>Error Starting Game</h3>
				<p>${error.message}</p>
				<div style="margin-top: 15px;">
					<a href="minimal.html" style="color: #3498db; margin-right: 15px;">Try Minimal Version</a>
					<button onclick="window.location.reload()">Reload</button>
				</div>
			`;
			errorElement.style.display = 'flex';
		}
		
		// Hide loading screen
		document.getElementById('loading').style.display = 'none';
	}
}

/**
 * Show player name prompt
 */
function showPlayerNamePrompt() {
	// Hide loading screen
	document.getElementById('loading').style.display = 'none';
	
	// Create or get login container
	let loginContainer = document.getElementById('login-container');
	if (!loginContainer) {
		loginContainer = document.createElement('div');
		loginContainer.id = 'login-container';
		
		// Style the login container
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
		
		// Add login form
		loginContainer.innerHTML = `
			<div style="background-color: #111; padding: 30px; border-radius: 10px; width: 300px; max-width: 90%; text-align: center; box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);">
				<h2 style="color: #3498db; margin-top: 0;">Welcome to Shaktris</h2>
				<p style="color: white; margin-bottom: 20px;">Enter your player name to start playing</p>
				
				<form id="player-form" style="display: flex; flex-direction: column; gap: 15px;">
					<input 
						type="text" 
						id="player-name" 
						placeholder="Your name" 
						style="padding: 10px; border-radius: 5px; border: none; font-size: 16px;"
						maxlength="20"
						required
					>
					
					<button 
						type="submit" 
						style="padding: 10px; background-color: #3498db; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; font-weight: bold;"
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
 * Create player list sidebar
 */
function createPlayerListSidebar() {
	// Create sidebar element
	const sidebar = document.createElement('div');
	sidebar.id = 'player-sidebar';
	
	// Style the sidebar
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
		boxShadow: '0 0 10px rgba(0, 0, 0, 0.5)'
	});
	
	// Add sidebar content
	sidebar.innerHTML = `
		<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
			<h3 style="margin: 0; color: #3498db;">Players</h3>
			<button id="toggle-sidebar" style="background: none; border: none; color: white; cursor: pointer; font-size: 20px;">
				→
			</button>
		</div>
		<div id="player-list" style="margin-top: 15px;">
			<div style="color: #aaa; text-align: center; padding: 10px;">
				No players online
			</div>
		</div>
		<div style="margin-top: 20px; border-top: 1px solid #444; padding-top: 10px;">
			<div style="font-size: 14px; color: #aaa;">You are playing as:</div>
			<div style="margin-top: 5px; font-weight: bold;">${playerName}</div>
			<button id="change-name" style="margin-top: 10px; padding: 5px; background: #333; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 12px; width: 100%;">
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
	const button = document.getElementById('toggle-sidebar');
	
	if (sidebar.style.transform === 'translateX(0px)') {
		sidebar.style.transform = 'translateX(-180px)';
		button.textContent = '→';
	} else {
		sidebar.style.transform = 'translateX(0)';
		button.textContent = '←';
	}
}

/**
 * Set up player list updates
 */
function setupPlayerListUpdates() {
	// Listen for player list updates
	NetworkManager.onMessage('player_list', (message) => {
		updatePlayerList(message.players);
	});
	
	// Listen for player joined events
	NetworkManager.onMessage('player_joined', (message) => {
		if (message.playerId !== NetworkManager.getPlayerId()) {
			showToastNotification(`${message.playerName} joined the game`);
		}
	});
	
	// Listen for player left events
	NetworkManager.onMessage('player_left', (message) => {
		showToastNotification(`${message.playerName} left the game`);
	});
}

/**
 * Update the player list display
 * @param {Array} players - List of players
 */
function updatePlayerList(players) {
	const playerList = document.getElementById('player-list');
	if (!playerList || !players || players.length === 0) return;
	
	// Sort players by name
	players.sort((a, b) => a.name.localeCompare(b.name));
	
	// Clear current list
	playerList.innerHTML = '';
	
	// Add each player
	players.forEach(player => {
		const isCurrentPlayer = player.id === NetworkManager.getPlayerId();
		
		const playerItem = document.createElement('div');
		playerItem.style.padding = '5px';
		playerItem.style.marginBottom = '5px';
		playerItem.style.borderRadius = '3px';
		playerItem.style.backgroundColor = isCurrentPlayer ? 'rgba(52, 152, 219, 0.3)' : 'transparent';
		
		// Player color indicator and name
		playerItem.innerHTML = `
			<div style="display: flex; align-items: center;">
				<div style="width: 10px; height: 10px; border-radius: 50%; background-color: ${player.color || '#ffffff'}; margin-right: 8px;"></div>
				<span ${isCurrentPlayer ? 'style="font-weight: bold;"' : ''}>${player.name}${isCurrentPlayer ? ' (You)' : ''}</span>
			</div>
		`;
		
		playerList.appendChild(playerItem);
	});
}

/**
 * Join or create a game
 */
async function joinGame() {
	// Check for game ID in URL
	const urlParams = new URLSearchParams(window.location.search);
	const gameId = urlParams.get('game');
	
	try {
		// Check connection status first
		if (!NetworkManager.isConnected()) {
			console.warn('Not connected to server, trying to initialize connection first');
			
			// Try to initialize with a random player name
			try {
				const randomName = 'Player_' + Math.floor(Math.random() * 1000);
				await NetworkManager.initialize(randomName);
				console.log('Connection initialized with temporary name:', randomName);
			} catch (initError) {
				console.error('Failed to initialize connection:', initError);
				showToastNotification('Connection to server failed - playing offline');
				
				// Return empty game data to continue in offline mode
				return { success: false, gameId: 'offline_mode' };
			}
		}
		
		// Now try to join with the connection established
		const gameData = await NetworkManager.joinGame(gameId);
		console.log('Joined game:', gameData);
		
		// Update URL if needed
		if (!gameId && gameData.gameId) {
			// Add game ID to URL without reloading page
			const newUrl = new URL(window.location);
			newUrl.searchParams.set('game', gameData.gameId);
			window.history.pushState({}, '', newUrl);
		}
		
		// Update game ID display
		const gameIdDisplay = document.getElementById('game-id-display');
		if (gameIdDisplay && gameData.gameId) {
			gameIdDisplay.value = gameData.gameId;
		}
		
		// Show notification
		showToastNotification(`Joined game ${gameData.gameId}`);
		
		// Update player list if available
		if (gameData.players) {
			updatePlayerList(gameData.players);
		}
		
		return gameData;
	} catch (error) {
		console.error('Error joining game:', error);
		showToastNotification('Failed to join game - playing offline');
		
		// Return empty game data to continue in offline mode
		return { success: false, gameId: 'offline_mode' };
	}
}

/**
 * Show a toast notification
 * @param {string} message - Message to display
 */
function showToastNotification(message) {
	// Create or get notification element
	let toast = document.getElementById('toast-notification');
	if (!toast) {
		toast = document.createElement('div');
		toast.id = 'toast-notification';
		
		// Style the toast
		Object.assign(toast.style, {
			position: 'fixed',
			top: '20px',
			left: '50%',
			transform: 'translateX(-50%)',
			backgroundColor: 'rgba(0, 0, 0, 0.8)',
			color: 'white',
			padding: '10px 20px',
			borderRadius: '5px',
			zIndex: '1002',
			transition: 'opacity 0.3s',
			opacity: '0',
			pointerEvents: 'none'
		});
		
		document.body.appendChild(toast);
	}
	
	// Set message and show
	toast.textContent = message;
	toast.style.opacity = '1';
	
	// Hide after 3 seconds
	setTimeout(() => {
		toast.style.opacity = '0';
	}, 3000);
}

// Start initialization when DOM is loaded
document.addEventListener('DOMContentLoaded', init);

// Export for ES modules
export { init }; 