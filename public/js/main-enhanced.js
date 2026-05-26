/**
 * Tetches Game - Enhanced Main Entry Point
 * 
 * This file initializes the enhanced game core with Russian theme.
 */

import * as gameCore from './enhanced-gameCore.js';
import * as debugUtils from './utils/debugUtils.js';
import * as NetworkManager from './utils/networkManager.js';
import * as NetworkStatusManager from './utils/networkStatusManager.js';
import { createNetworkStatusDisplay } from './createNetworkStatusDisplay.js';
import { createUnifiedPlayerBar, updateUnifiedPlayerBar, showPlayerBar } from './unifiedPlayerBar.js';
import { showToastMessage as showToastNotification } from './showToastMessage.js';
import './boardFunctions.js'; // Import the updated board functions
import gameState from './utils/gameState.js';
import * as tetrominoModule from './tetromino.js'; // Import tetromino module for socket events
import { initFloatingBanner } from './floatingBanner.js'; // Import floating banner for ads
import { initSponsorSystem } from '../utils/sponsors.js'; // Import sponsor system
import { disposeBoats } from './boatsRenderer.js';


// Global state
let isGameStarted = false;
let playerName = localStorage.getItem('playerName') || '';
let currentGameId = null;

// --- Render profiles: Normal, Cute (low-spec), Retro (CRT Cyrillic) ---
const RENDER_PROFILES = ['normal', 'cute', 'retro'];
const PROFILE_LABELS = { normal: 'Mode: Normal', cute: 'Mode: Cute', retro: 'Mode: Retro' };

function normalizeRenderProfile(value) {
	const v = String(value || '').trim().toLowerCase();
	if (!v) return null;
	if (['cute', 'low', 'low-spec', 'lowspec', 'pixel', 'pixelated'].includes(v)) return 'cute';
	if (['retro', 'crt', 'cyrillic', 'terminal'].includes(v)) return 'retro';
	if (['normal', 'default', '3d', 'high'].includes(v)) return 'normal';
	return null;
}

function resolveRenderProfile() {
	const params = new URLSearchParams(window.location.search);
	const fromPath = window.location.pathname === '/2d' ? 'cute' : null;
	const fromFlags = (params.has('cute') || params.has('low') || params.has('pixel')) ? 'cute'
		: params.has('retro') ? 'retro' : null;
	const fromQuery =
		normalizeRenderProfile(params.get('render')) ||
		normalizeRenderProfile(params.get('mode')) ||
		normalizeRenderProfile(params.get('quality'));
	const stored = normalizeRenderProfile(localStorage.getItem('renderProfile'));
	return fromQuery || fromFlags || fromPath || stored || 'normal';
}

function applyRenderProfileToDom(profile) {
	const gameContainer = document.getElementById('game-container');
	if (gameContainer) {
		gameContainer.classList.toggle('render-cute', profile === 'cute');
		gameContainer.classList.toggle('render-retro', profile === 'retro');
		gameContainer.dataset.renderProfile = profile;
	}
	document.documentElement.dataset.renderProfile = profile;
}

function setupRenderModeToggle(profile) {
	const button = document.getElementById('toggle-render-mode-btn');
	if (!button) return;

	button.textContent = PROFILE_LABELS[profile] || PROFILE_LABELS.normal;

	if (button.dataset.bound === '1') return;
	button.dataset.bound = '1';

	button.addEventListener('click', () => {
		const current = resolveRenderProfile();
		const idx = RENDER_PROFILES.indexOf(current);
		const next = RENDER_PROFILES[(idx + 1) % RENDER_PROFILES.length];

		localStorage.setItem('renderProfile', next);
		applyRenderProfileToDom(next);
		button.textContent = PROFILE_LABELS[next] || PROFILE_LABELS.normal;

		const gs = window.gameState;
		if (gs) {
			gs.renderProfile = next;
			gs.lowQuality = next === 'cute';
			gs.retroMode = next === 'retro';
		}

		try {
			const sceneObj = gs?.scene;
			if (sceneObj && gameCore.setupLightsInPlace) {
				gameCore.setupLightsInPlace(sceneObj, next);
			}
		} catch (e) {
			console.warn('Could not switch lighting in place:', e);
		}

		try {
			const canvas = document.getElementById('game-canvas');
			if (canvas && canvas.__renderer) {
				const isCute = next === 'cute';
				canvas.__renderer.setPixelRatio(isCute ? Math.min(1, window.devicePixelRatio * 0.6) : window.devicePixelRatio);
				canvas.style.imageRendering = isCute ? 'pixelated' : '';
			}
		} catch (e) {
			// Non-critical
		}

		// Apply CRT overlay for retro mode
		applyCrtOverlay(next === 'retro');

		// Force chess piece rebuild — retro uses letter sprites while other
		// modes use 3D geometry, so existing meshes must be replaced.
		if (gs && typeof gameCore.forceChessPieceRebuild === 'function') {
			gameCore.forceChessPieceRebuild();
		}

		try {
			disposeBoats();
		} catch (e) {
			console.warn('Could not dispose boats after profile switch:', e);
		}

		console.log('Switched render mode to', next, 'without page reload');
	});
}

function applyCrtOverlay(enabled) {
	let overlay = document.getElementById('crt-overlay');
	if (enabled) {
		if (!overlay) {
			overlay = document.createElement('div');
			overlay.id = 'crt-overlay';
			overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;' +
				'background:repeating-linear-gradient(0deg,rgba(0,0,0,0.15) 0px,rgba(0,0,0,0.15) 1px,transparent 1px,transparent 3px);' +
				'mix-blend-mode:multiply;';
			document.body.appendChild(overlay);
		}
		overlay.style.display = '';
	} else if (overlay) {
		overlay.style.display = 'none';
	}
}

function openPlayerCodePanel() {
	showPlayerBar();
	const playerCodeInput = document.getElementById('sidebar-player-code-display');
	if (playerCodeInput) {
		playerCodeInput.focus();
		playerCodeInput.select();
		playerCodeInput.setSelectionRange(0, 99999);
	}
}

function wireSessionWarningLink() {
	const warningEl = document.getElementById('session-warning');
	if (!warningEl || warningEl.dataset.wired === '1') return;
	warningEl.dataset.wired = '1';
	warningEl.addEventListener('click', openPlayerCodePanel);
	warningEl.addEventListener('keydown', (event) => {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			openPlayerCodePanel();
		}
	});
}

// Main initialization
async function init() {
	console.log('Initializing enhanced Tetches game with Russian theme...');
	
	// Force hide loading screen and error messages - failsafe
	hideLoadingScreen();
	hideError();

	// Apply render profile ASAP so CSS + UI reflect it even before game starts
	const renderProfile = resolveRenderProfile();
	applyRenderProfileToDom(renderProfile);
	setupRenderModeToggle(renderProfile);
	applyCrtOverlay(renderProfile === 'retro');
	
	try {
		// Run diagnostics first to catch any issues
		const diagnostics = debugUtils.printSystemDiagnostics();
		
		// Check THREE.js status
		if (!diagnostics.threeStatus || !diagnostics.threeStatus.isLoaded) {
			throw new Error('THREE.js not available. Please check your internet connection.');
		}

		// If the browser cannot create any WebGL context, fail fast and
		// surface the same overlay that the deeper renderer code uses.
		// This avoids a confusing chain of "module errors" deep in
		// `enhanced-gameCore.js`.
		if (diagnostics.webglStatus && !diagnostics.webglStatus.hasWebGL && !diagnostics.webglStatus.hasWebGL2) {
			if (typeof gameCore.showWebglUnavailableOverlay === 'function') {
				gameCore.showWebglUnavailableOverlay('No WebGL context available at startup');
			}
			hideLoadingScreen();
			throw new Error('WebGL unavailable: hardware acceleration disabled or unsupported.');
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
		
		isGameStarted = gameCore.initGame(gameContainer, { renderProfile });
		
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
		wireSessionWarningLink();
		
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
				<h2 style="color: #ffcc00; margin-top: 0; font-family: 'Times New Roman', serif;">Welcome to Tetches</h2>
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
		
		// Check for saved state from mode switch (should rejoin same game)
		if (!gameId) {
			try {
				const savedState = sessionStorage.getItem('tetches_mode_switch_state');
				if (savedState) {
					const state = JSON.parse(savedState);
					// Only use if saved within last 30 seconds (recent mode switch)
					if (state.gameId && Date.now() - state.timestamp < 30000) {
						console.log('Restoring game from mode switch:', state.gameId);
						gameId = state.gameId;
						// Restore player name if saved
						if (state.playerName) {
							localStorage.setItem('playerName', state.playerName);
						}
					}
					// Clear the saved state after reading
					sessionStorage.removeItem('tetches_mode_switch_state');
				}
			} catch (e) {
				console.warn('Could not restore mode switch state:', e);
			}
		}
		
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
		showToastNotification('Connecting to world server...');

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
		console.error('Error joining world:', error);
		showError('An error occurred while entering the world. Please try again.');
		
		// Hide loading screen even if there's an error
		document.getElementById('loading').style.display = 'none';
		return false;
	}
}

/**
 * Join a game after connection is established
 * @param {string} gameId - Optional specific game ID to join
 */
async function joinGameAfterConnection(gameId = null) {
	try {
		// Hide any previous errors
		hideError();
		
		// Set up network events
		gameCore.setupNetworkEvents();
		
		// Set up tetromino-specific socket event listeners
		if (typeof tetrominoModule !== 'undefined' && tetrominoModule.initializeTetrominoSocketListeners) {
			tetrominoModule.initializeTetrominoSocketListeners();
		}
		
		// Join game
		console.log('Joining game:', gameId || 'any available game');
		const result = await NetworkManager.joinGame(gameId);
		
		// Update current game ID for reconnection
		if (result && result.gameId) {
			currentGameId = result.gameId;
			console.log('Successfully joined game:', currentGameId);
			
			// Update local player ID if provided
			if (result.playerId) {
				gameState.localPlayerId = result.playerId;
				console.log('Local player ID set to:', gameState.localPlayerId);
			}

			if (result.playerName && result.playerName !== 'Guest') {
				try { localStorage.setItem('playerName', result.playerName); } catch (_e) { /* ignore */ }
				if (!gameState.players) gameState.players = {};
				if (!gameState.players[gameState.localPlayerId]) {
					gameState.players[gameState.localPlayerId] = { id: gameState.localPlayerId };
				}
				gameState.players[gameState.localPlayerId].name = result.playerName;
			}
			if (Array.isArray(result.players) && result.players.length > 0) {
				gameState.players = gameState.players || {};
				for (const entry of result.players) {
					if (!entry || !entry.id) continue;
					gameState.players[entry.id] = { ...gameState.players[entry.id], ...entry };
				}
			}
			
			// Update window title with world ID
			document.title = `Tetches - World ${currentGameId}`;
			
			// Show in URL but don't reload page
			const url = new URL(window.location);
			url.searchParams.set('gameId', currentGameId);
			window.history.pushState({}, '', url);
			
			// Set up player list updates
			setupPlayerListUpdates();
			
			// Hide loading screen
			hideLoadingScreen();
			
			// Hide instructions if game has started
			const instructionsElement = document.getElementById('game-instructions');
			if (instructionsElement) {
				instructionsElement.style.display = 'none';
			}
			
			// Start the game
			if (gameCore.startPlayingGame) {
				gameCore.startPlayingGame();
			}
			
			// Update player bar - delayed to ensure it gets the right data
			setTimeout(() => {
				updateUnifiedPlayerBar(gameState);
			}, 1000);
			
			// Initialize advertising/sponsor systems after game starts
			setTimeout(() => {
				initSponsorSystem().catch(err => console.warn('Sponsor system init error:', err));
				initFloatingBanner().catch(err => console.warn('Floating banner init error:', err));
			}, 2000);
		} else {
			throw new Error('Failed to join game');
		}
	} catch (error) {
		console.error('Error entering world after connection:', error);
		showError(`Failed to enter world: ${error.message || 'Unknown error'}`);
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
						const normalisedPlayers = Array.isArray(data.players)
							? data.players.reduce((acc, playerEntry) => {
								if (!playerEntry || !playerEntry.id) return acc;
								acc[playerEntry.id] = {
									id: playerEntry.id,
									name: playerEntry.name || playerEntry.id,
									isComputer: !!playerEntry.isComputer
								};
								return acc;
							}, {})
							: (typeof data.players === 'object' ? data.players : {});
						
						// Update the game state with players
						if (gameState) {
							gameState.players = Object.assign({}, gameState.players || {}, normalisedPlayers);
							
							// Update the unified player bar with the updated game state
							updateUnifiedPlayerBar(gameState);
						} else {
							// If no game state yet, create a minimal one for the player bar
							const minimalState = {
								players: normalisedPlayers,
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