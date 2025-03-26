/**
 * Shaktris Game - Enhanced Core Module (Russian Theme)
 * 
 * This module provides the core functionality for the Shaktris game with Russian theme enhancements.
 */

// Use global THREE if available, otherwise import from module
import * as THREE_MODULE from './utils/three.module.js';

// Set THREE to either the global version or the imported module
export const THREE = (typeof window !== 'undefined' && window.THREE) ? window.THREE : THREE_MODULE;

// Ensure THREE is available
if (!THREE) {
  console.error('THREE.js not available. Game will not function correctly.');
}

// Import other modules
import * as NetworkManager from './utils/networkManager.js';
import { createFallbackTextures, animateClouds } from './textures.js';
import { createFallbackModels } from './models.js';
import { showToastMessage } from './showToastMessage.js';
import { createNetworkStatusDisplay,  } from './createNetworkStatusDisplay.js';
import * as sceneModule from './scene.js';
import { boardFunctions } from './boardFunctions.js';
import { getChessPiece } from './chessPieceCreator.js';
import { createLoadingIndicator, hideAllLoadingElements, showErrorMessage, updateGameIdDisplay, updateGameStatusDisplay, updateNetworkStatus } from './createLoadingIndicator.js';
import { moveTetrominoHorizontal, moveTetrominoVertical, rotateTetromino, hardDropTetromino, createTetrominoBlock } from './tetromino.js';
import { resetCameraForGameplay, setupCamera } from './setupCamera.js';
import { showTutorialMessage } from './createLoadingIndicator.js';
import { findBoardCentreMarker, preserveCentreMarker, updateCellPreservingMarker } from './centreBoardMarker.js';

// Core game state
let gameState = {
	lastGameTime: 0,
	players: {},
	chessPieces: [],
	board: { cells: {} },
	boardBounds: { minX: 0, maxX: 8, minZ: 0, maxZ: 8 },
	selectedPiece: null,
	phase: 'unknown',
	localPlayerId: null,
	currentPlayer: generateRandomPlayerId(), // Use random player ID
	debugMode: false,  // Set to true to enable detailed console logging
	activeTetromino: null,
	tetrominoList: [],
	hoveredCell: { x: -1, y: -1, z: -1 },
	gameOver: false,
	boardSize: {
		width: 16,
		height: 16
	},
	inMultiplayerMode: false,
	showChessControls: false,
	canPlaceTetromino: true,
	selectedTetrominoIndex: -1,
	// Russian theme flags
	autoRotateCamera: true,
	hasSnow: true,
	showTetrisGhost: true,
	isPaused: false,
	// Camera positioning
	pendingCameraReset: null,
	fpsHistory: [],
	// Player tracking
	hoveredPlayer: null,
	error: null
};

/**
 * Generate a random player ID
 * @returns {string} Random player ID
 */
function generateRandomPlayerId() {
	return 'player_' + Math.random().toString(36).substring(2, 10);
}

/**
 * Generate a random color in blue/green range for player
 * @returns {number} Color as hex value
 */
function generatePlayerColor() {
	// Generate colors in blue-green range
	const r = Math.floor(Math.random() * 80);  // Keep red low for blue/green shades
	const g = 100 + Math.floor(Math.random() * 155); // Medium to high green
	const b = 150 + Math.floor(Math.random() * 105); // Medium to high blue
	
	// Convert RGB to hex
	return (r << 16) | (g << 8) | b;
}

// Cached DOM elements
let containerElement, gameContainer;
let scene, camera, renderer, controls, animationFrameId = null;
let boardGroup, tetrominoGroup, chessPiecesGroup;
let raycaster, mouse;
let clouds = null, animationQueue = [];

// Tetromino drop height
const TETROMINO_DROP_HEIGHT = 0.6; 

// Player colors and identifiers
/**
 * Player color scheme constants:
 * - 'self': Red (0xDD0000) for the local player's pieces
 * - 'other': Blue-green (0x0088AA) for all opponent pieces
 * 
 * This simplified color scheme improves gameplay clarity by making it
 * immediately obvious which pieces belong to the local player versus opponents.
 */
export const PLAYER_COLORS = {
	self: 0xDD0000,   // Red for local player
	other: 0x0088AA   // Blue-green for all other players
};

// Tetromino shapes (unchanged from minimal version)
const TETROMINO_SHAPES = {
	I: [
		[0, 0, 0, 0],
		[1, 1, 1, 1],
		[0, 0, 0, 0],
		[0, 0, 0, 0]
	],
	O: [
		[1, 1],
		[1, 1]
	],
	T: [
		[0, 1, 0],
		[1, 1, 1],
		[0, 0, 0]
	],
	J: [
		[1, 0, 0],
		[1, 1, 1],
		[0, 0, 0]
	],
	L: [
		[0, 0, 1],
		[1, 1, 1],
		[0, 0, 0]
	],
	S: [
		[0, 1, 1],
		[1, 1, 0],
		[0, 0, 0]
	],
	Z: [
		[1, 1, 0],
		[0, 1, 1],
		[0, 0, 0]
	]
};

// // Texture cache
// const textureLoader = new THREE.TextureLoader();
// const modelLoader = new GLTFLoader();

// Enhanced game assets
export const models = {
	pieces: {},
	board: null,
	defaultPieces: {}
};

const textures = {
	board: null,
	cells: [],
	skybox: null
};

// Set initial tetromino fall height 
const TETROMINO_START_HEIGHT = 4; // Starting height above the board

// UI controls for game flow
let uiButtons = {};

/**
 * Initialize the game
 * @param {HTMLElement} container - The container to render the game in
 * @returns {boolean} - Whether initialization was successful
 */
export function initGame(container) {
	console.log("Initializing Chesstris game...");
	
	try {
		// Create a thematic loading indicator
		const loadingIndicator = createLoadingIndicator();
		
		// Validate container parameter
		if (!container) {
			console.warn("No container provided for game initialization, looking for default container");
			container = document.getElementById('game-container');
			if (!container) {
				console.warn("No game container found, creating a default one");
				container = document.createElement('div');
				container.id = 'game-container';
				document.body.appendChild(container);
			}
		} else if (!(container instanceof HTMLElement)) {
			console.error("Invalid container provided for game initialization, must be an HTMLElement");
			container = document.getElementById('game-container');
			if (!container) {
				console.warn("No valid game container found, creating a default one");
				container = document.createElement('div');
				container.id = 'game-container';
				document.body.appendChild(container);
			}
		}
		
		// Store container references globally - CRITICAL for input handlers
		containerElement = container;
		gameContainer = container;
		
		console.log("Container element set:", container.id || "unnamed container");
		console.log("Container connected to DOM:", container.isConnected ? "Yes" : "No");
		
		// Get container dimensions
		const containerWidth = container.clientWidth || window.innerWidth;
		const containerHeight = container.clientHeight || window.innerHeight;
		
		console.log(`Container dimensions: ${containerWidth}x${containerHeight}`);
		
		// Make sure THREE is available
		if (!THREE) {
			throw new Error("THREE.js is not initialized");
		}

		// Initialize THREE.js scene
		console.log("Creating THREE.js scene...");
		scene = new THREE.Scene();
		console.log("Creating camera...");
		camera = new THREE.PerspectiveCamera(75, containerWidth / containerHeight, 0.1, 1000);
		
		// Set up renderer with proper pixel ratio for sharper rendering
		console.log("Creating renderer...");
		renderer = new THREE.WebGLRenderer({ 
			antialias: true,
			alpha: true
		});
		renderer.setPixelRatio(window.devicePixelRatio);
		renderer.setSize(containerWidth, containerHeight);
		renderer.shadowMap.enabled = true;
		
		// Clear container before adding new renderer
		console.log("Preparing container...");
		while (containerElement.firstChild) {
			containerElement.removeChild(containerElement.firstChild);
		}
		
		// Add renderer to container
		containerElement.appendChild(renderer.domElement);


		
		// Initialize game state
		console.log("Initializing game state...");
		resetGameState();


		
		// Add lights to the scene
		console.log("Setting up lights...");
		sceneModule.setupLights(scene);
		
		// Set up camera position
		console.log("Setting up camera...");
		setupCamera(camera, controls, renderer);
		
		// Initialize mouse and raycaster
		console.log("Initializing input components...");
		mouse = new THREE.Vector2();
		raycaster = new THREE.Raycaster();
		
		// Initialize input handlers only after scene is set up
		console.log("Setting up input handlers...");
		setupInputHandlers();
		
		// Set up the event system
		console.log("Setting up event system...");
		setupEventSystem();
		
		// Initialize UI with player bar but without start button (we'll show tutorial instead)
		console.log("Setting up game UI...");
		initializeGameUI();
		
		// Hide the start button as we'll show the tutorial instead
		if (uiButtons && uiButtons.startButton) {
			uiButtons.startButton.style.display = 'none';
		}

		startGame(true);
		// Skip tutorial and directly start playing the game instead
		setTimeout(() => {

			// Make sure startPlayingGame is accessible globally
			window.startShaktrisGame = startPlayingGame;
			
			showTutorialMessage(window.startShaktrisGame);
		}, 500); // Short delay to allow the scene to render first
		
		// Start game loop
		console.log("Starting game loop...");
		startGameLoop();
		
		// Request game state only after setup is complete
		console.log("Requesting initial game state...");
		requestGameState();
		
		// Set up a mechanism to hide loading screen if game state doesn't arrive after a timeout
		setTimeout(() => {
			const loadingElement = document.getElementById('loading');
			if (loadingElement && loadingElement.style.display !== 'none') {
				console.log("Loading screen timeout - hiding loading screen forcibly");
				loadingElement.style.display = 'none';
			}
	
		}, 15000); // 15 seconds timeout
		
		console.log("Game initialization complete!");
		return true; // Return success
	} catch (error) {
		console.error("Error initializing game:", error);
		// Hide loading indicator on error
		const loadingIndicator = document.getElementById('loading-indicator');
		if (loadingIndicator) {
			loadingIndicator.style.display = 'none';
		}
		
		// Hide main loading screen too
		const loadingElement = document.getElementById('loading');
		if (loadingElement) {
			loadingElement.style.display = 'none';
		}
		
		// Show an error message to the user
		if (typeof showErrorMessage === 'function') {
			showErrorMessage(`Game initialization failed: ${error.message}`);
		}
		
		return false; // Return failure
	}
}

/**
 * Setup the event system for the game
 */
function setupEventSystem() {
	// Ensure we have a valid element to attach events to
	if (!gameContainer || typeof gameContainer !== 'object') {
		console.error("Cannot set up event system: gameContainer is not valid");
		return;
	}
	
	// Add event listeners for game updates
	window.addEventListener('gameupdate', function(e) {
		try {
			if (!e.detail) {
				console.warn('Game update event received with no detail');
				return;
			}
			
			// Update game state with new data
			updateGameState(e.detail);
			
			// Update board state if we have board data and the boardGroup exists
			if (e.detail.board && boardGroup) {
				updateBoardState(e.detail.board);
				
				// Hide loading indicator once board is updated
				const loadingIndicator = document.getElementById('loading-indicator');
				if (loadingIndicator) {
					loadingIndicator.style.display = 'none';
				}
			}
			
			// Update chess pieces if we have them
			if (e.detail.chessPieces && boardGroup) {
				updateChessPieces(e.detail.chessPieces);
			}
			
			// Update current tetromino if available
			if (e.detail.currentTetromino) {
				updateCurrentTetromino(e.detail.currentTetromino);
			}
			
			// Update game status display
			updateGameStatusDisplay();
		} catch (err) {
			console.error("Error processing game update:", err);
		}
	});
}

/**
 * Reset game state to initial values
 */
export function resetGameState() {
	console.log('Resetting game state...');
	
	// Initialize game state
	gameState = {
		board: { 
			cells: {},  // Object mapping coordinates to cell data
			minX: 0,
			maxX: 15,
			minZ: 0,
			maxZ: 15
		},
		selectedPiece: null, // Currently selected chess piece
		chessPieces: [], // Array of all chess pieces
		currentTetromino: null, // Current active tetromino
		ghostPiece: null, // Ghost piece showing where tetromino will land
		validMoves: [], // Valid moves for selected chess piece
		score: 0,
		level: 1,
		turnPhase: 'tetris', // Start with tetris phase
		currentPlayer: generateRandomPlayerId(), // Use random player ID
		localPlayerId: null, // Local player ID (from network)
		paused: false,
		gameOver: false,
		winner: null,
		lastPlacement: null, // Last tetromino placement
		lastMove: null, // Last chess move
		players: {}, // List of players
		gameStarted: false, // Flag to track if game has been started
		homeZones: {}, // Store home zones information from server
		boardSize: 16, // Use a number rather than an object for boardSize
		boardWidth: 16,
		boardHeight: 16
	};
	
	// Initialize some cells in the board for testing
	for (let z = 0; z < 16; z++) {
		for (let x = 0; x < 16; x++) {
			// Add every third cell for a checkered pattern
			if ((x + z) % 3 === 0) {
				gameState.board.cells[`${x},${z}`] = { type: 'cell' };
			}
		}
	}
}


/**
 * Handle window resize
 */
export function onWindowResize(camera, renderer, containerElement) {
	if (!camera || !renderer || !containerElement) return;
	
	const width = containerElement.clientWidth || window.innerWidth;
	const height = containerElement.clientHeight || window.innerHeight;
	
	// Enforce minimum height
	if (height <= 1) {
		containerElement.style.height = '100%';
		containerElement.style.minHeight = '100vh';
	}
	
	camera.aspect = width / Math.max(height, 1);
	camera.updateProjectionMatrix();
	
	renderer.setSize(width, Math.max(height, window.innerHeight * 0.9));
}


/**
 * Start the actual game play
 */
export function startPlayingGame() {
	console.log('Starting game...');
	
	try {
		// Clear any error states first
		gameState.error = null;
		
		
		// Initialize basic board if needed
		if (!gameState.board || !gameState.board.cells) {
			gameState.board = { 
				cells: {},
				minX: 0,
				maxX: 15,
				minZ: 0,
				maxZ: 15,
				centreMarker: { x: 8, z: 8 }
			};
			
			// Create a simple default board with a checkered pattern
			for (let z = 0; z < 16; z++) {
				for (let x = 0; x < 16; x++) {
					// Add cells with a pattern
					if ((x + z) % 3 === 0) {
						const key = `${x},${z}`;
						gameState.board.cells[key] = { type: 'cell' };
					}
				}
			}
			
			// Update boardSize properties
			gameState.boardSize = 16;
			gameState.boardWidth = 16;
			gameState.boardHeight = 16;
		}
		
		// Initialize phase to tetris phase as default
		gameState.turnPhase = 'tetris';
		
		// Initialize a random tetromino if we don't have one
		if (!gameState.currentTetromino) {
			console.log('Creating initial tetromino');
			gameState.currentTetromino = boardFunctions.createRandomTetromino(gameState);
		}
		
		// Set the gameStarted flag to true
		gameState.gameStarted = true;
		
		// Start the game
		startGame();
		
	} catch (error) {
		console.error('Error starting game:', error);
		showErrorMessage(`Error starting game: ${error.message}`);
	}
}

/**
 * Request game state from server
 */
function requestGameState() {
	console.log("Requesting game state from server...");
	
	// Use event dispatcher if available
	if (typeof dispatchEvent === 'function') {
		dispatchEvent(new CustomEvent('requestgamestate'));
	} else {
		// Fall back to window.dispatchEvent
		window.dispatchEvent(new CustomEvent('requestgamestate'));
	}
}

/**
 * Update the game state with new data
 * @param {Object} data - The new game state data
 */
function updateGameState(data) {
	// Verify we have valid data
	if (!data) return;
	
	// Create a deep copy of the data to avoid reference issues
	const newData = JSON.parse(JSON.stringify(data));
	
	// Update our game state with the new data
	gameState = {...gameState, ...newData};
	
	// Make sure gameStarted flag is set if we have board data and the boardGroup exists
	if (gameState.board && gameState.board.cells && Object.keys(gameState.board.cells).length > 0) {
		gameState.gameStarted = true;
		
		// Hide any tutorial or start screens that might still be visible
		const tutorialElement = document.getElementById('tutorial-message');
		if (tutorialElement) {
			tutorialElement.parentNode.removeChild(tutorialElement);
		}
		
		// Remove the "Waiting for game data" message container if it exists
		const waitingContainer = document.getElementById('waiting-container');
		if (waitingContainer) {
			waitingContainer.parentNode.removeChild(waitingContainer);
		}
		
		// Set initial turn phase to 'tetris' if not already set
		if (!gameState.turnPhase) {
			gameState.turnPhase = 'tetris';
		}
	}
	
	console.log("Game state updated:", gameState);
}

/**
 * Start the first turn of the game (local fallback)
 */
function startFirstTurn() {
	console.log('Waiting for board data from server...');
	
	// Update status display
	updateGameStatusDisplay();
	
	// Show a toast to guide the player
	showToastMessage('Connecting to game server...');
	
	// Create overlay for dimming the screen during connection attempts
	const createConnectionOverlay = () => {
		// Remove any existing overlay first
		const existingOverlay = document.getElementById('connection-overlay');
		if (existingOverlay) {
			existingOverlay.parentNode.removeChild(existingOverlay);
		}
		
		// Create new overlay
		const overlay = document.createElement('div');
		overlay.id = 'connection-overlay';
		overlay.style.position = 'fixed';
		overlay.style.top = '0';
		overlay.style.left = '0';
		overlay.style.width = '100%';
		overlay.style.height = '100%';
		overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
		overlay.style.display = 'flex';
		overlay.style.flexDirection = 'column';
		overlay.style.justifyContent = 'center';
		overlay.style.alignItems = 'center';
		overlay.style.zIndex = '9999';
		overlay.style.color = 'white';
		overlay.style.fontFamily = 'Arial, sans-serif';
		overlay.style.transition = 'opacity 0.5s ease';
		
		// Add connection message
		const message = document.createElement('div');
		message.id = 'connection-message';
		message.textContent = 'Connecting to game server...';
		message.style.fontSize = '24px';
		message.style.marginBottom = '20px';
		
		// Add spinner
		const spinner = document.createElement('div');
		spinner.style.border = '5px solid #f3f3f3';
		spinner.style.borderTop = '5px solid #3498db';
		spinner.style.borderRadius = '50%';
		spinner.style.width = '50px';
		spinner.style.height = '50px';
		spinner.style.animation = 'spin 2s linear infinite';
		
		// Add spinner animation
		const style = document.createElement('style');
		style.textContent = '@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';
		document.head.appendChild(style);
		
		// Add retry info
		const retryInfo = document.createElement('div');
		retryInfo.id = 'retry-info';
		retryInfo.textContent = 'Attempting to connect...';
		retryInfo.style.marginTop = '20px';
		retryInfo.style.fontSize = '16px';
		
		// Assemble overlay
		overlay.appendChild(message);
		overlay.appendChild(spinner);
		overlay.appendChild(retryInfo);
		document.body.appendChild(overlay);
		
		return {
			overlay,
			message,
			retryInfo
		};
	};
	
	// Create the initial overlay
	const { overlay, message, retryInfo } = createConnectionOverlay();
	
	// Set up reconnection attempts with increasing timeouts
	let reconnectAttempt = 0;
	const maxReconnectAttempts = 10;
	const baseTimeout = 2000; // 2 seconds initial timeout
	
	const attemptReconnect = () => {
		reconnectAttempt++;
		
		if (reconnectAttempt > maxReconnectAttempts) {
			// Max attempts reached, show final message
			message.textContent = 'Could not connect to game server';
			retryInfo.textContent = 'Please check your connection and refresh the page.';
			return;
		}
		
		// Calculate timeout with exponential backoff
		const timeout = baseTimeout * Math.pow(1.5, reconnectAttempt - 1);
		
		// Update overlay message
		message.textContent = 'Connecting to game server...';
		retryInfo.textContent = `Attempt ${reconnectAttempt} of ${maxReconnectAttempts} (waiting ${Math.round(timeout/1000)}s)`;
		
		// Try to reconnect after timeout
		setTimeout(() => {
			// Check if we have data already
			if (gameState.board && gameState.board.length) {
				// We got data while waiting, remove overlay
				overlay.style.opacity = '0';
				setTimeout(() => {
					if (overlay.parentNode) {
						overlay.parentNode.removeChild(overlay);
					}
				}, 500);
				return;
			}
			
			// Try to reconnect via NetworkManager
			if (typeof NetworkManager !== 'undefined' && NetworkManager.initialize) {
				retryInfo.textContent = `Attempt ${reconnectAttempt} of ${maxReconnectAttempts} - Reconnecting...`;
				
				// Reinitialize connection and attempt to join game
				NetworkManager.initialize()
					.then(() => NetworkManager.joinGame())
					.then((result) => {
						console.log('Reconnection successful:', result);
						retryInfo.textContent = 'Connection established!';
						
						// Give a moment for the server to send game state
						setTimeout(() => {
							if (!gameState.board || !gameState.board.length) {
								// Still no board data, try next attempt
								attemptReconnect();
							} else {
								// We got data, remove overlay
								overlay.style.opacity = '0';
								setTimeout(() => {
									if (overlay.parentNode) {
										overlay.parentNode.removeChild(overlay);
									}
								}, 500);
							}
						}, 2000);
					})
					.catch((error) => {
						console.error('Reconnection failed:', error);
						retryInfo.textContent = `Connection failed. Retrying in ${Math.round(timeout/1000)}s...`;
						attemptReconnect();
					});
			} else {
				// NetworkManager not available, try next attempt
				retryInfo.textContent = 'Connection service unavailable';
				attemptReconnect();
			}
		}, timeout);
	};
	
	// Start connection attempts if we don't already have board data
	if (!gameState.board || !gameState.board.length) {
		attemptReconnect();
	} else {
		// We already have board data, no need for connection overlay
		if (overlay.parentNode) {
			overlay.parentNode.removeChild(overlay);
		}
	}
}


/**
 * Update render size when container resizes
 */
export function updateRenderSize() {
	if (camera && renderer && containerElement) {
		const width = containerElement.clientWidth || window.innerWidth;
		const height = containerElement.clientHeight || window.innerHeight;
		
		// Enforce minimum height
		if (height <= 1) {
			containerElement.style.height = '100vh';
			containerElement.style.minHeight = '100vh';
		}
		
		camera.aspect = width / Math.max(height, 1);
		camera.updateProjectionMatrix();
		
		renderer.setSize(width, Math.max(height, window.innerHeight * 0.9));
	}
}



/**
 * Sets up input handlers for keyboard, mouse and touch events
 */
function setupInputHandlers() {
	console.log('Setting up enhanced input handlers...');
	
	// Keyboard events
	document.addEventListener('keydown', handleKeyDown);
	
	// Skip mouse and touch events if containerElement is not available
	if (!containerElement) {
		console.warn("Cannot set up mouse/touch handlers - container element is missing");
		return;
	}
	
	// Initialize mouse vector if not already done
	if (!mouse) {
		mouse = new THREE.Vector2();
	}
	
	// Mouse events
	containerElement.addEventListener('mousedown', handleMouseDown);
	containerElement.addEventListener('mousemove', handleMouseMove);
	
	// Add touch support for mobile
	containerElement.addEventListener('touchstart', handleTouchStart, { passive: false });
	containerElement.addEventListener('touchmove', handleTouchMove, { passive: false });
	containerElement.addEventListener('touchend', handleTouchEnd, { passive: false });
}

/**
 * Handle keyboard input
 * @param {KeyboardEvent} event - Keyboard event
 */
function handleKeyDown(event) {
	// Only handle keyboard if we're in tetris phase
	if (gameState.turnPhase !== 'tetris' || !gameState.currentTetromino) {
		return;
	}
	
	// Handle tetromino movement and rotation
	let moved = false;
	
	switch (event.key) {
		case 'ArrowLeft':
			// Move tetromino left
			console.log('Move left');
			if (moveTetrominoHorizontal(-1)) moved = true;
			break;
		case 'ArrowRight':
			// Move tetromino right
			console.log('Move right');
			if (moveTetrominoHorizontal(1)) moved = true;
			break;
		case 'ArrowDown':
			// Move tetromino down
			console.log('Move down');
			if (moveTetrominoVertical(1)) moved = true;
			break;
		case 'ArrowUp':
			// Move tetromino up
			console.log('Move up');
			if (moveTetrominoVertical(-1)) moved = true;
			break;
		case 'z':
		case 'Z':
			// Rotate tetromino counterclockwise
			console.log('Rotate CCW');
			if (rotateTetromino(-1)) moved = true;
			break;
		case 'x':
		case 'X':
			// Rotate tetromino clockwise
			console.log('Rotate CW');
			if (rotateTetromino(1)) moved = true;
			break;
		case ' ':
			// Hard drop tetromino
			console.log('Hard drop');
			hardDropTetromino();
			moved = true;
			break;
	}
	
	// If tetromino moved, re-render it
	if (moved && gameState.currentTetromino) {
		renderTetromino(gameState.currentTetromino);
	}
}

/**
 * Handle mouse down event
 * @param {MouseEvent} event - Mouse event
 */
function handleMouseDown(event) {
	// Skip if necessary elements aren't defined
	if (!containerElement || !mouse) {
		return; // Exit early if necessary elements aren't available
	}
	
	try {
		// Calculate mouse position in normalized device coordinates (-1 to +1)
		const rect = containerElement.getBoundingClientRect();
		mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
		
		// Only handle mouse if we're in chess phase
		if (gameState.turnPhase !== 'chess') {
			return;
		}
		
		// Implement ray casting for chess piece selection and movement
		performRaycast();
	} catch (error) {
		console.warn("Error in handleMouseDown:", error);
	}
}

/**
 * Handle mouse move event
 * @param {MouseEvent} event - Mouse event
 */
function handleMouseMove(event) {
	// Skip if containerElement is not defined
	if (!containerElement || !mouse) {
		return; // Exit early if necessary elements aren't available
	}
	
	try {
		// Calculate mouse position for hover effects
		const rect = containerElement.getBoundingClientRect();
		mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
	} catch (error) {
		console.warn("Error in handleMouseMove:", error);
	}
}

/**
 * Handle touch start event
 * @param {TouchEvent} event - Touch event
 */
function handleTouchStart(event) {
	// Skip if necessary elements aren't defined
	if (!containerElement || !mouse) {
		return;
	}
	
	try {
		event.preventDefault();
		
		if (event.touches.length > 0) {
			const rect = containerElement.getBoundingClientRect();
			mouse.x = ((event.touches[0].clientX - rect.left) / rect.width) * 2 - 1;
			mouse.y = -((event.touches[0].clientY - rect.top) / rect.height) * 2 + 1;
			
			// Only handle touch if we're in chess phase
			if (gameState.turnPhase !== 'chess') {
				return;
			}
			
			// Implement ray casting for chess piece selection and movement
			performRaycast();
		}
	} catch (error) {
		console.warn("Error in handleTouchStart:", error);
	}
}

/**
 * Handle touch move event
 * @param {TouchEvent} event - Touch event
 */
function handleTouchMove(event) {
	// Skip if necessary elements aren't defined
	if (!containerElement || !mouse) {
		return;
	}
	
	try {
		if (event.touches.length > 0) {
			const rect = containerElement.getBoundingClientRect();
			mouse.x = ((event.touches[0].clientX - rect.left) / rect.width) * 2 - 1;
			mouse.y = -((event.touches[0].clientY - rect.top) / rect.height) * 2 + 1;
		}
	} catch (error) {
		console.warn("Error in handleTouchMove:", error);
	}
}

/**
 * Handle touch end event
 * @param {TouchEvent} event - Touch event
 */
function handleTouchEnd(event) {
	// Skip if necessary elements aren't defined
	if (!mouse) {
		return;
	}
	
	try {
		// Reset mouse position
		mouse.x = -1000;
		mouse.y = -1000;
	} catch (error) {
		console.warn("Error in handleTouchEnd:", error);
	}
}

/**
 * Perform raycasting for object interaction
 */
function performRaycast() {
	// Set up raycaster
	raycaster.setFromCamera(mouse, camera);
	
	// Get intersections with board and pieces
	const intersects = raycaster.intersectObjects([boardGroup, chessPiecesGroup], true);
	
	// Handle intersections
	if (intersects.length > 0) {
		const intersectedObject = intersects[0].object;
		
		// Check if we hit a cell or a piece
		if (intersectedObject.userData && intersectedObject.userData.type === 'cell') {
			console.log('Clicked on cell:', intersectedObject.userData.position);
			// Handle cell click (move chess piece)
		} else if (intersectedObject.userData && intersectedObject.userData.type === 'chessPiece') {
			console.log('Clicked on chess piece:', intersectedObject.userData);
			// Handle chess piece selection
		}
	}
}

// Add a global tetrisLastFallTime variable
let tetrisLastFallTime = Date.now();

/**
 * Start the game loop with performance optimizations
 */
function startGameLoop() {
	console.log('Starting enhanced game loop with performance optimizations...');
	
	// Reset the fall time whenever we start the game loop
	tetrisLastFallTime = Date.now();
	
	// Last time for calculating delta time
	let lastTime = performance.now();
	
	// Throttle values for different update functions
	const LOD_UPDATE_INTERVAL = gameState.performanceMode ? 3000 : 2000; // ms between LOD updates
	const GAME_LOGIC_INTERVAL = gameState.performanceMode ? 1000 : 500; // ms between game logic updates
	
	// Track when we last ran various updates
	let lastLODUpdate = 0;
	let lastGameLogicUpdate = 0;
	let lastUiUpdate = 0; // For tracking UI updates
	
	// Track FPS for performance monitoring
	let frameCount = 0;
	let lastFpsUpdate = performance.now();
	
	// Frame limiting
	const TARGET_FRAMERATE = gameState.performanceMode ? 20 : 30; // Lower target in performance mode
	const FRAME_TIME = 1000 / TARGET_FRAMERATE;
	let lastFrameTime = 0;
	
	// Flag to track if clouds are in camera view (initialized here, used in animate)
	let cloudsInView = true;
	
	/**
	 * Main render function
	 */
	function animate(time) {
		// Set up the next animation frame
		animationFrameId = requestAnimationFrame(animate);

		try {
			// Calculate time delta for smooth animations
			const delta = (time - lastTime) / 1000;
			lastTime = time;
			
			// Skip if delta is too large (likely due to tab being inactive)
			if (delta > 1) {
				return;
			}
			
			// Update game logic elements if not paused
			if (!gameState.paused) {
				// Update orbit controls if available
				if (controls) {
					controls.update();
				}
				
				// Update animated clouds - ensure clouds array exists and contains valid objects
				if (clouds && Array.isArray(clouds)) {
					for (let i = 0; i < clouds.length; i++) {
						if (clouds[i]) {
							clouds[i].rotation.y += 0.001 * delta;
						}
					}
				}
				
				// Process pending animations
				if (animationQueue && animationQueue.length > 0) {
					processAnimationQueue();
				}
			}
			
			// // Update text display frames
			// if (textDisplay) {
			// 	textDisplay.update();
			// }
			
			// Handle TWEEN animations
			if (window.TWEEN) {
				window.TWEEN.update();
			}
			
			// Render the scene only if all required elements exist and are properly initialized
			if (renderer && scene && camera) {
				// Check if any objects in the scene have been removed incorrectly
				
				// Proactively check and fix scene hierarchy before rendering
				// This helps prevent errors before they occur
				if (scene) {
					try {
						// Check for problematic objects in the scene graph before rendering
						// This recursive function ensures the scene is in a valid state
						const validateSceneGraph = function(object) {
							if (!object) return;
							
							// Ensure object.visible is defined (often source of errors)
							if (object.visible === undefined || object.visible === null) {
								console.warn('Fixed undefined visible property on object', object.name || 'unnamed');
								object.visible = true;
							}
							
							// Make sure matrices are initialized
							if (object.matrixAutoUpdate && (!object.matrix || object.matrix.elements.some(e => Number.isNaN(e)))) {
								console.warn('Fixed invalid matrix on object', object.name || 'unnamed');
								object.updateMatrix();
							}
							
							// Recursively check children
							if (object.children) {
								// Make a copy of the children array to avoid modification during iteration
								const children = [...object.children];
								for (let i = 0; i < children.length; i++) {
									validateSceneGraph(children[i]);
								}
							}
						};
						
						// Run validation before render
						validateSceneGraph(scene);
					} catch (validateError) {
						console.error('Error during scene validation:', validateError);
					}
				}

				try {
					// Safe render call
					renderer.render(scene, camera);
				} catch (renderError) {
					console.error('Error during render:', renderError);
					// If there's a specific error about 'visible' property, try to fix it
					if (renderError.message && renderError.message.includes("Cannot read properties of null (reading 'visible')")) {
						console.warn('Attempting to recover from null object error with recursive cleanup...');
						
						// Recursive function to clean null objects from scene graph
						const cleanNullObjectsRecursive = function(object) {
							if (!object) return null;
							
							// Clean null children
							if (object.children && Array.isArray(object.children)) {
								// Filter out null/undefined children
								const validChildren = object.children.filter(child => child !== null && child !== undefined);
								
								// Process remaining children recursively
								for (let i = 0; i < validChildren.length; i++) {
									cleanNullObjectsRecursive(validChildren[i]);
								}
								
								// Replace original children array with filtered one
								object.children = validChildren;
							}
							
							return object;
						};
						
						// Apply recursive cleanup to the entire scene
						if (scene) {
							cleanNullObjectsRecursive(scene);
							console.log('Scene graph cleaned recursively');
						}
					}
				}
			} else {
				console.warn('Skipping render - missing required components:', 
					{renderer: !!renderer, scene: !!scene, camera: !!camera});
			}
		} catch (error) {
			console.error('Error in animation loop:', error);
			// Don't crash the animation loop due to rendering errors
		}
	}
	
	// Start animation loop
	lastFrameTime = performance.now();
	animate();
}

/**
 * Update game logic
 * @param {number} deltaTime - Time since last frame in seconds
 */
function updateGameLogic(deltaTime) {
	// Only update tetromino if in tetris phase and we have a current tetromino
	if (gameState.turnPhase === 'tetris' && gameState.currentTetromino) {
		const now = Date.now();
		const FALL_INTERVAL = 1000; // Standard fall interval
		
		if ((now - tetrisLastFallTime) > FALL_INTERVAL) {
			// Try to move tetromino down (along Z-axis which is our "vertical" on the board)
			if (moveTetrominoVertical(1)) {
				// Successfully moved down, update rendering
				renderCurrentTetromino();
			} else {
				// Couldn't move down, place the tetromino
				legacy_placeTetromino();
			}
			
			tetrisLastFallTime = now;
		}
		
		// Check if the tetromino is still above the board
		if (gameState.currentTetromino?.heightAboveBoard > 0) {
			// Gradually lower the tetromino toward the board
			gameState.currentTetromino.heightAboveBoard -= 0.5;
			// Re-render after height change
			renderCurrentTetromino();
		}
	}
}

/**
 * Set up network event listeners
 */
export function setupNetworkEvents() {
	console.log('Setting up network events...');
	
	if (typeof NetworkManager !== 'undefined') {
		try {
			// Connection events
			NetworkManager.addEventListener('connect', () => {
				console.log('Connected to server');
				updateNetworkStatus('connected');
				
				// Update game ID display if available
				if (NetworkManager.getGameId && NetworkManager.getGameId()) {
					updateGameIdDisplay(NetworkManager.getGameId());
				}
			});
			
			NetworkManager.addEventListener('disconnect', () => {
				console.log('Disconnected from server');
				updateNetworkStatus('disconnected');
			});
			
			// Game state updates - this is the main way we receive game data
			NetworkManager.addEventListener('game_state', (data) => {
				console.log('Game state update received:', data);
				if (data) {
					handleGameStateUpdate(data);
				}
			});
			
			// Smaller incremental updates
			NetworkManager.addEventListener('game_update', (data) => {
				console.log('Game update received:', data);
				if (data) {
					handleGameUpdate(data);
				}
			});
			
			// Player events
			NetworkManager.addEventListener('player_joined', (data) => {
				if (data && data.playerName) {
					console.log('Player joined:', data);
					showToastMessage(`Player ${data.playerName} joined the game`);
				}
			});
			
			NetworkManager.addEventListener('player_left', (data) => {
				if (data && data.playerName) {
					console.log('Player left:', data);
					showToastMessage(`Player ${data.playerName} left the game`);
				}
			});
			
			// General messages
			NetworkManager.addEventListener('message', (data) => {
				console.log('Message received:', data);
				// Handle based on type
				if (data.type && data.payload) {
					switch (data.type) {
						case 'game_state':
							handleGameStateUpdate(data.payload);
							break;
						case 'game_update':
							handleGameUpdate(data.payload);
							break;
						case 'player_joined':
							if (data.payload && data.payload.playerName) {
								showToastMessage(`Player ${data.payload.playerName} joined the game`);
							}
							break;
						case 'player_left':
							if (data.payload && data.payload.playerName) {
								showToastMessage(`Player ${data.payload.playerName} left the game`);
							}
							break;
					}
				}
			});
			
			console.log('Network event listeners set up successfully');
		} catch (error) {
			console.error('Error setting up network event listeners:', error);
		}
	} else {
		console.warn('NetworkManager not available, skipping network event setup');
	}
}

/**
 * Handle incremental game updates from the server (small changes)
 * @param {Object} data - Update data containing parts of the game state
 */
function handleGameUpdate(data) {
	// Apply partial updates to the game state
	if (data.board) {
		// Instead of full logging, just log count of changed cells
		if (data.boardChanges) {
			// Process incremental updates
			updateBoardStateIncremental(data.boardChanges);
		} else {
			// Full board update as fallback
			updateBoardState(data.board);
		}
	}
	
	// Process player updates (joined, left, moved, etc.)
	if (data.players) {
		gameState.players = data.players;
		// Update player bar when players change
		updatePlayerBar();
	}
	
	// Update chess pieces if included
	if (data.chessPieces) {
		gameState.chessPieces = data.chessPieces;
		updateChessPieces();
	}
	
	// Handle tetromino placements
	if (data.tetrominoPlacement) {
		processTetromino(data.tetrominoPlacement);
	}
	
	// Update UI based on changes
	updateGameStatusDisplay();
}

/**
 * Handle game state update from the server
 * @param {Object} data - Game state data
 */
export function handleGameStateUpdate(data) {
	console.log('Received game state from server:', JSON.stringify(data).substring(0, 300) + '...');
	
	// Force hide loading screen immediately - critical for ensuring visibility
	hideAllLoadingElements();
	
	// Validate the data
	if (!data) {
		console.error('Received empty game state data');
		return;
	}
	
	try {
		// Extract the actual game state data
		// It may be directly in 'data' or nested within 'data.state'
		const gameData = data.state || data;
		
		// Check if we have a local player ID from the server
		if (gameData.localPlayerId || data.localPlayerId) {
			// Server is telling us which player we are
			gameState.localPlayerId = gameData.localPlayerId || data.localPlayerId;
			console.log(`Local player ID set from server: ${gameState.localPlayerId}`);
		} else if (NetworkManager && NetworkManager.getPlayerId) {
			// Try to get our player ID from network manager
			const networkPlayerId = NetworkManager.getPlayerId();
			if (networkPlayerId) {
				// Convert string IDs like "player1" to numeric IDs
				if (typeof networkPlayerId === 'string' && networkPlayerId.startsWith('player')) {
					const numericId = parseInt(networkPlayerId.replace('player', ''), 10);
					if (!isNaN(numericId)) {
						gameState.localPlayerId = numericId;
						console.log(`Local player ID set from network manager: ${gameState.localPlayerId} (converted from ${networkPlayerId})`);
					}
				} else {
					gameState.localPlayerId = networkPlayerId;
					console.log(`Local player ID set from network manager: ${gameState.localPlayerId}`);
				}
			}
		}
		
		// Ensure localPlayerId is always set to a valid value
		if (!gameState.localPlayerId) {
			gameState.localPlayerId = 1; // Default to player 1
			console.log('Local player ID defaulted to 1 as no ID was provided');
		}
		
		// Update board state - check both in gameData and directly in data
		const boardData = gameData.board || data.board;
		if (boardData) {
			console.log('Board data received, updating board with:', 
				JSON.stringify(boardData).substring(0, 100) + '...');
			updateBoardState(boardData);
		} else {
			console.warn('No board data in game state update');
		}
		
		// Process chess pieces if provided directly
		const chessPieces = gameData.chessPieces || data.chessPieces;
		if (chessPieces && Array.isArray(chessPieces) && chessPieces.length > 0) {
			console.log(`Received ${chessPieces.length} chess pieces directly`);
			console.log('Chess pieces sample:', chessPieces.slice(0, 2));
			gameState.chessPieces = chessPieces;
			// Force update of chess pieces
			updateChessPieces();
		} else {
			console.log('No chess pieces in direct array - will extract from cells');
			// The updateBoardVisuals function will handle extracting pieces from cells
		}
		
		// Check for home zones
		const homeZones = gameData.homeZones || data.homeZones;
		if (homeZones) {
			console.log('Home zones received:', homeZones);
			gameState.homeZones = homeZones;
			
			// Set camera based on home zones
			resetCameraForGameplay(renderer, camera, controls, gameState, scene, true, true); // Force immediate update
		}
		
		// Update player list
		const players = gameData.players || data.players;
		if (players) {
			console.log('Players received:', players);
			
			// Update local game state players
			gameState.players = players;
			
			// Update player bar to show all connected players
			updatePlayerBar();
		}
		
		// Update current player and turn phase
		const currentPlayer = gameData.currentPlayer || data.currentPlayer;
		if (currentPlayer) {
			gameState.currentPlayer = currentPlayer;
		}
		
		// Handle turn phase updates
		const turnPhase = gameData.turnPhase || data.turnPhase;
		if (turnPhase) {
			gameState.turnPhase = turnPhase;
			
			// If we entered chess phase, make sure pieces are visible
			if (turnPhase === 'chess' && gameState.chessPieces && gameState.chessPieces.length > 0) {
				console.log("Entered chess phase - ensuring pieces are visible");
				updateChessPieces();
			}
		}
		
		// Update game status display
		updateGameStatusDisplay();
		
		// Final board render - force a render pass to ensure visibility
		if (renderer && scene && camera) {
			console.log("Forcing a render pass to ensure visibility");
			renderer.render(scene, camera);
		}
		
	} catch (error) {
		console.error('Error processing game state update:', error);
	}
}

/**
 * Update the board state based on server data
 * @param {Object} boardData - Sparse board structure with cells and boundaries
 */
function updateBoardState(boardData) {
	try {
		if (!boardData || typeof boardData !== 'object') {
			console.error('Invalid board data received:', boardData);
			return;
		}
		
		// Debug log the actual board structure
		console.log('Received board data structure:', JSON.stringify(boardData).substring(0, 200) + '...');
		
		// Check if we have the new sparse board structure
		const isSparseBoard = boardData.cells && typeof boardData.cells === 'object';
		
		if (!isSparseBoard) {
			console.error('Expected sparse board structure not found, raw data:', boardData);
			return;
		}
		
		// Update board boundaries
		const minX = boardData.minX !== undefined ? boardData.minX : 0;
		const maxX = boardData.maxX !== undefined ? boardData.maxX : 20;
		const minZ = boardData.minZ !== undefined ? boardData.minZ : 0;
		const maxZ = boardData.maxZ !== undefined ? boardData.maxZ : 20;
		const width = boardData.width || (maxX - minX + 1);
		const height = boardData.height || (maxZ - minZ + 1);
		
		console.log(`Received board data with boundaries: minX=${minX}, maxX=${maxX}, minZ=${minZ}, maxZ=${maxZ}, width=${width}, height=${height}`);
		
		// Use the larger dimension as the board size
		const effectiveBoardSize = Math.max(width, height);
		
		// Use our new centreBoardMarker module to preserve the centre marker
		const centreMarker = preserveCentreMarker(gameState, boardData);
		
		// Update gameState.board with the received data
		gameState.board = boardData;
		
		// Set the preserved centre marker
		if (centreMarker) {
			gameState.board.centreMarker = centreMarker;
			
			// Also ensure the cell contains the marker
			if (gameState.board.cells) {
				const key = `${centreMarker.x},${centreMarker.z}`;
				if (!gameState.board.cells[key]) {
					gameState.board.cells[key] = {};
				}
				
				// Add the special marker to ensure it exists in the cells
				gameState.board.cells[key].specialMarker = {
					type: 'boardCentre',
					isCentreMarker: true,
					centreX: centreMarker.x,
					centreZ: centreMarker.z
				};
			}
		}
		
		// Set board boundaries in gameState
		gameState.boardBounds = {
			minX, maxX, minZ, maxZ,
			width, height
		};
		gameState.boardSize = effectiveBoardSize;
		gameState.boardWidth = width;
		gameState.boardHeight = height;
		
		// Count non-empty cells without excessive logging
		let nonEmptyCells = 0;
		
		// Process cells to ensure correct structure
		for (const key in boardData.cells) {
			const cell = boardData.cells[key];
			if (cell !== null && cell !== undefined) {
				nonEmptyCells++;
			}
		}
		
		// Log summarized info
		console.log(`Board updated with ${nonEmptyCells} non-empty cells`);
		
		// Flag that the game has started since we have board data now
		gameState.gameStarted = true;
		
		// Remove any "waiting for game data" message
		const waitingElement = document.getElementById('waiting-for-game-data');
		if (waitingElement) {
			waitingElement.parentNode.removeChild(waitingElement);
		}
		
		// Force recreation of the board - this is critical for rendering
		if (boardGroup) {
			console.log("Clearing existing board group");
			while (boardGroup.children.length > 0) {
				boardGroup.remove(boardGroup.children[0]);
			}
			
			// Create new board cells
			console.log("Creating new board with received data");
			sceneModule.createBoard(boardGroup, gameState);
		} else {
			console.error("boardGroup not available, can't recreate board");
		}
		
		// Update game status display with the latest state
		if (typeof updateGameStatusDisplay === 'function') {
			updateGameStatusDisplay();
		}
		
		// Force a render to update the scene - with null checks
		try {
			if (renderer && scene && camera) {
				renderer.render(scene, camera);
			} else {
				console.warn("Cannot render - one or more rendering components missing:", {
					renderer: !!renderer,
					scene: !!scene,
					camera: !!camera
				});
			}
		} catch (err) {
			console.warn("Error during rendering:", err);
			// Continue processing even if render fails
		}
	} catch (error) {
		console.error('Error in updateBoardState:', error);
		// Ensure we don't interrupt the game flow even if there's an error
	}
}

/**
 * Update board visuals based on the current game state
 */
function updateBoardVisuals() {
	console.log('Updating board visuals');
	
	try {
		// Ensure boardGroup exists
		if (!boardGroup) {
			console.warn('boardGroup is not initialized, creating a new one');
			boardGroup = new THREE.Group();
			boardGroup.name = 'boardGroup';
			
			// Only add to scene if scene exists
			if (scene) {
				scene.add(boardGroup);
			} else {
				console.error('Cannot add boardGroup to scene - scene is undefined');
			}
		}
		
		// Ensure we have a valid board
		if (!gameState.board) {
			console.warn('No board found in game state, creating empty board');
			gameState.board = { cells: {} };
		}
		
		// Create board cells if they don't exist
		if (boardGroup.children.length === 0) {
			try {
				sceneModule.createBoard(boardGroup, gameState);
			} catch (err) {
				console.error('Error creating board cells:', err);
			}
		}
		
		// Update chess pieces for current state
		try {
			updateChessPieces();
		} catch (err) {
			console.warn('Error updating chess pieces:', err);
		}
		
		// Update tetromino for current state if in tetris phase
		if (gameState.turnPhase === 'tetris' && gameState.currentTetromino) {
			try {
				renderCurrentTetromino();
			} catch (err) {
				console.warn('Error rendering tetromino:', err);
			}
		}
		
		// Force a render if all required components exist
		if (renderer && scene && camera) {
			try {
				renderer.render(scene, camera);
			} catch (err) {
				console.warn('Error during render in updateBoardVisuals:', err);
			}
		}
	} catch (error) {
		console.error('Unexpected error in updateBoardVisuals:', error);
	}
}

/**
 * Handle tetris phase debug click
 */
export function handleTetrisPhaseClick() {
	// Use boardFunctions version instead
	boardFunctions.handleTetrisPhaseClick(
		gameState, 
		updateGameStatusDisplay, 
		updateBoardVisuals, 
		tetrominoGroup, 
		createTetrominoBlock
	);
}

/**
 * Handle chess phase debug click
 */
export function handleChessPhaseClick() {
	gameState.turnPhase = 'chess';
	
	// Force refresh piece visibility
	updateGameStatusDisplay();
	
	// Make sure pieces are shown/hidden correctly
	updateBoardVisuals();
	
	console.log("Debug: Switched to CHESS phase");
}



function updateChessPiecesLOD() {
	// Update LOD based on distance
	// const distance = camera.position.distanceTo(chessPiecesGroup.position);
	
	// // Update LOD based on distance
	// if (distance < 10) {
	// 	chessPiecesGroup.visible = true;
	// } else {
	// 	chessPiecesGroup.visible = false;
	// }
	
	// // Update LOD for each piece
	// for (const piece of chessPiecesGroup.children) {
	// 	const pieceDistance = camera.position.distanceTo(piece.position);
	// 	if (pieceDistance < 10) {
	// 		piece.visible = true;
	// 	} else {
	// 		piece.visible = false;
	// 	}
	// }

	// Update LOD for each piece
	updateChessPieces();

}

// Add a timer to track when chess pieces were last updated
let lastChessPiecesUpdate = 0;
const CHESS_PIECES_UPDATE_INTERVAL = 250; // Milliseconds between updates

function updateChessPieces() {
	// Rate-limit updates to reduce performance impact
	const now = Date.now();
	if (now - lastChessPiecesUpdate < CHESS_PIECES_UPDATE_INTERVAL) {
		return; // Skip if called too soon after previous update
	}
	lastChessPiecesUpdate = now;

	// Only log during debug mode or first run
	const isFirstRun = !chessPiecesGroup?.userData?.initialized;
	
	// Ensure the group is valid before proceeding
	if (!chessPiecesGroup) {
		console.error('Chess pieces group is not initialized, cannot update chess pieces');
		return;
	}
	
	// Mark as initialized 
	if (!chessPiecesGroup.userData) {
		chessPiecesGroup.userData = {};
	}
	chessPiecesGroup.userData.initialized = true;
	
	if (isFirstRun || gameState.debugMode) {
		console.log('Updating chess pieces visuals');
	}
	
	try {
		// Safety check - ensure the group has a children array
		if (!chessPiecesGroup.children) {
			console.error('Chess pieces group has no children array');
			chessPiecesGroup.children = [];
			return;
		}
		
		// Create a map of existing pieces by ID for quick lookup
		const existingPieceMap = {};
		chessPiecesGroup.children.forEach(piece => {
			if (piece && piece.userData && piece.userData.id) {
				existingPieceMap[piece.userData.id] = piece;
			}
		});
		
		// Extract pieces data - first look in gameState.chessPieces
		let chessPieces = [];
		
		if (gameState.chessPieces && Array.isArray(gameState.chessPieces) && gameState.chessPieces.length > 0) {
			// Use the pre-extracted pieces from boardFunctions
			chessPieces = gameState.chessPieces;
			if (isFirstRun || gameState.debugMode) {
				console.log(`Using ${chessPieces.length} pre-extracted chess pieces`);
			}
		} else {
			// Otherwise manually extract from board cells - legacy method
			// Check if we have valid board data
			if (gameState.board && gameState.board.cells) {
				// Iterate through all cells to find chess pieces
				for (const key in gameState.board.cells) {
					try {
						const [x, z] = key.split(',').map(Number);
						
						// Get cell content
						const cellData = gameState.board.cells[key];
						
						// Ensure boardFunctions is available
						if (!boardFunctions || !boardFunctions.extractCellContent) {
							console.warn('boardFunctions.extractCellContent is not available');
							continue;
						}
						
						// Extract chess content using the new helper function
						const chessContent = boardFunctions.extractCellContent(cellData, 'chess');
						
						// If chess piece content exists, extract it for rendering
						if (chessContent) {
							const pieceId = chessContent.pieceId || 
								`${chessContent.player}-${chessContent.chessPiece?.type || 'PAWN'}-${x}-${z}`;
							
							chessPieces.push({
								id: pieceId,
								position: { x, z },
								type: chessContent.pieceType || "PAWN",
								player: chessContent.player || 1,
								color: chessContent.color || 0xcccccc
							});
						}
					} catch (cellErr) {
						console.error('Error processing board cell:', cellErr);
					}
				}
				if (isFirstRun || gameState.debugMode) {
					console.log(`Extracted ${chessPieces.length} chess pieces from board cells`);
				}
			}
		}
		
		// Quick safety check - if we have no chess pieces, stop processing
		if (!chessPieces || chessPieces.length === 0) {
			if (isFirstRun || gameState.debugMode) {
				console.warn('No chess pieces to render, skipping update');
			}
			return;
		}
		
		// Create/update visual pieces
		if (isFirstRun || gameState.debugMode) {
			console.log(`Processing ${chessPieces.length} chess pieces`, chessPieces);
		}
		
		// Keep track of which pieces we've processed to remove any that are no longer needed
		const processedPieceIds = new Set();
		let piecesCreated = 0;
		let piecesReused = 0;
		
		// Reset the group position to origin - this is critical!
		// The board cells are positioned directly at their coordinates without any group offset
		chessPiecesGroup.position.set(0, 0, 0);
		
		// Find the board centre marker for accurate positioning - CRITICAL for alignment with cells
		const centreMarker = findBoardCentreMarker(gameState);
		
		// Always ensure we have a valid centre marker
		if (!centreMarker && gameState.board) {
			console.error('Centre marker not found! Creating a new one');
			// Force create a centre marker in case it doesn't exist
			gameState.board.centreMarker = {
				x: Math.floor((gameState.boardBounds?.minX || 0 + gameState.boardBounds?.maxX || 20) / 2),
				z: Math.floor((gameState.boardBounds?.minZ || 0 + gameState.boardBounds?.maxZ || 20) / 2)
			};
		}
		
		const centreX = centreMarker?.x ?? 14;
		const centreZ = centreMarker?.z ?? 17;
		
		console.log(`Using board centre at (${centreX}, ${centreZ}) for chess piece positioning`);
		
		chessPieces.forEach(piece => {
			try {
				// Skip invalid pieces
				if (!piece || !piece.position) {
					console.warn('Skipping invalid chess piece:', piece);
					return;
				}
				
				// Ensure player is always defined and represented consistently
				if (piece.player === undefined || piece.player === null) {
					piece.player = 'unknown';
				}
				
				// Generate a consistent ID for the piece
				const pieceId = piece.id || `${piece.player}-${piece.type}-${piece.position.x}-${piece.position.z}`;
				processedPieceIds.add(pieceId);
				
				// Get the position and orientation of the piece
				const { x, z } = piece.position;
				
				// Check if we already have this piece at this location
				const existingPiece = existingPieceMap[pieceId];
				
				// If the piece exists and hasn't moved, reuse it
				if (existingPiece && 
					existingPiece.userData && 
					existingPiece.userData.position && 
					existingPiece.userData.position.x === x && 
					existingPiece.userData.position.z === z) {
					
					// Update player info in userData
					existingPiece.userData.player = piece.player;
					
					// Piece hasn't changed, just make sure it's visible
					existingPiece.visible = true;
					
					// Apply hover highlight if needed
					if (gameState.hoveredPlayer && 
					    (String(gameState.hoveredPlayer) === String(piece.player)) && 
					    typeof highlightSinglePiece === 'function') {
						try {
							highlightSinglePiece(existingPiece);
						} catch (highlightErr) {
							console.error('Error highlighting piece:', highlightErr);
						}
					}
					
					piecesReused++;
					return;
				}
				
				// If the piece exists but has moved, update its position
				if (existingPiece) {
					// Calculate position exactly as the board cells do - relative to centre marker
					existingPiece.position.x = x - centreX;
					existingPiece.position.z = z - centreZ;
					existingPiece.position.y = 0.7; // Height above cell
					
					// Update userData
					existingPiece.userData.position = { x, z };
					existingPiece.userData.player = piece.player;
					existingPiece.visible = true;
					
					// Apply hover highlight if needed
					if (gameState.hoveredPlayer && 
					    (String(gameState.hoveredPlayer) === String(piece.player)) && 
					    typeof highlightSinglePiece === 'function') {
						try {
							highlightSinglePiece(existingPiece);
						} catch (highlightErr) {
							console.error('Error highlighting piece:', highlightErr);
						}
					}
					
					piecesReused++;
					return;
				}
				
				// Create a new piece if it doesn't exist
				let pieceObject;
				
				try {
					if (typeof getChessPiece === 'function') {
						// Use the imported getChessPiece function
						const pieceTypeStr = typeof piece.type === 'string' 
							? piece.type.toUpperCase() // Convert to uppercase
							: (piece.type >= 1 && piece.type <= 6) 
								? ['PAWN', 'ROOK', 'KNIGHT', 'BISHOP', 'QUEEN', 'KING'][piece.type - 1] 
								: 'PAWN'; // Default to PAWN if invalid
								
						console.log(`Creating ${pieceTypeStr} piece for player ${piece.player}`);
						
						// Create the piece with correct type
						pieceObject = getChessPiece(
							pieceTypeStr, // Use proper string type
							piece.player === gameState.localPlayerId ? 'self' : 'other',
							piece.player === gameState.localPlayerId
						);
						
						// Position correctly relative to board centre at increased height
						pieceObject.position.set(x - centreX, 0.7, z - centreZ); // Raised to 0.7 from 0.5
						
						// Apply rotation based on player
						pieceObject.rotation.y = String(piece.player) === String(gameState.localPlayerId) ? 0 : Math.PI;
					} else if (boardFunctions && typeof boardFunctions.createChessPiece === 'function') {
						// Fallback to boardFunctions implementation - modify the function inputs to use our centreMarker
						const modifiedGameState = {...gameState};
						
						// Override boardBounds to ensure correct centre calculation
						if (centreMarker) {
							modifiedGameState.boardBounds = {
								...gameState.boardBounds,
								// Use the actual centre marker for reliable positioning
								minX: centreX * 2 - gameState.boardBounds.maxX,
								maxX: gameState.boardBounds.maxX,
								minZ: centreZ * 2 - gameState.boardBounds.maxZ,
								maxZ: gameState.boardBounds.maxZ
							};
						}
						
						pieceObject = boardFunctions.createChessPiece(
							modifiedGameState, 
							x, z, 
							piece.type, 
							piece.player, // Ensure player is set correctly
							gameState.playerId, 
							String(piece.player) !== String(gameState.localPlayerId) ? Math.PI : 0, // Rotation based on player comparison
							THREE
						);
					} else {
						console.error('Cannot create chess piece - no creation functions available');
						return;
					}
					
					// Verify the piece was created successfully
					if (!pieceObject) {
						console.error('Failed to create chess piece object for', piece);
						return;
					}
					
					// Add the piece ID to the userData
					pieceObject.userData = pieceObject.userData || {};
					pieceObject.userData.id = pieceId;
					pieceObject.userData.player = piece.player;
					pieceObject.userData.position = { x, z };
					
					// Make sure the piece is visible
					pieceObject.visible = true;
					
					// Make sure all child meshes are visible
					pieceObject.traverse(child => {
						if (child.isMesh) {
							child.visible = true;
							
							// Ensure child has materials
							if (!child.material) {
								// console.warn('Chess piece mesh has no material, creating default');
								child.material = new THREE.MeshBasicMaterial({ color: 0xcccccc });
							}
						}
					});
					
					// Apply hover highlight if needed
					if (gameState.hoveredPlayer && 
					    (String(gameState.hoveredPlayer) === String(piece.player)) && 
					    typeof highlightSinglePiece === 'function') {
						try {
							highlightSinglePiece(pieceObject);
						} catch (highlightErr) {
							console.error('Error highlighting piece:', highlightErr);
						}
					}
					
					// Add the piece to the chess pieces group
					chessPiecesGroup.add(pieceObject);
					piecesCreated++;
				} catch (createErr) {
					console.error(`Error creating chess piece:`, createErr);
				}
			} catch (pieceErr) {
				console.error(`Error processing chess piece:`, pieceErr);
			}
		});
		
		if (isFirstRun || gameState.debugMode) {
			console.log(`Chess pieces update complete: ${piecesCreated} created, ${piecesReused} reused`);
		}
		
		// Remove any pieces that are no longer in the game state
		for (let i = chessPiecesGroup.children.length - 1; i >= 0; i--) {
			try {
				const piece = chessPiecesGroup.children[i];
				if (!piece) {
					// Remove null pieces
					chessPiecesGroup.children.splice(i, 1);
					continue;
				}
				
				// Skip pieces without userData or ID
				if (!piece.userData || !piece.userData.id) continue;
				
				// Remove pieces not in the current game state
				if (!processedPieceIds.has(piece.userData.id)) {
					// Dispose resources
					if (piece.geometry) piece.geometry.dispose();
					if (piece.material) {
						if (Array.isArray(piece.material)) {
							piece.material.forEach(m => m && m.dispose && m.dispose());
						} else if (piece.material && piece.material.dispose) {
							piece.material.dispose();
						}
					}
					
					// Remove from group
					chessPiecesGroup.remove(piece);
				}
			} catch (removeErr) {
				console.error('Error removing outdated chess piece:', removeErr);
				// Force removal anyway to prevent errors
				if (i < chessPiecesGroup.children.length) {
					chessPiecesGroup.children.splice(i, 1);
				}
			}
		}
	} catch (mainErr) {
		console.error('Error in updateChessPieces:', mainErr);
	}
}

/**
 * Highlight a single chess piece with a hover effect
 */
function highlightSinglePiece(piece) {
	// Safety check - if piece is null or undefined, don't proceed
	if (!piece) {
		console.warn('Attempted to highlight null/undefined piece');
		return;
	}
	
	// Clean up previous highlight elements if they exist
	const existingHighlight = piece.getObjectByName('hover-highlight');
	const existingGlow = piece.getObjectByName('hover-glow');
	
	// Remove old elements from animation loop first
	if (existingHighlight && existingHighlight.userData && existingHighlight.userData.animation) {
		if (window._highlightAnimations) {
			const index = window._highlightAnimations.indexOf(existingHighlight.userData.animation);
			if (index > -1) {
				window._highlightAnimations.splice(index, 1);
			}
		}
	}
	
	// Remove old highlight meshes
	if (existingHighlight) {
		piece.remove(existingHighlight);
		if (existingHighlight.geometry) existingHighlight.geometry.dispose();
		if (existingHighlight.material) existingHighlight.material.dispose();
	}
	
	if (existingGlow) {
		piece.remove(existingGlow);
		if (existingGlow.geometry) existingGlow.geometry.dispose();
		if (existingGlow.material) existingGlow.material.dispose();
	}
	
	// Create new highlight
	try {
		const geometry = new THREE.RingGeometry(0.5, 0.6, 32);
		const material = new THREE.MeshBasicMaterial({
			color: 0xFFFFFF,
			transparent: true,
			opacity: 0.6,
			side: THREE.DoubleSide
		});
		
		const highlight = new THREE.Mesh(geometry, material);
		highlight.name = 'hover-highlight';
		highlight.rotation.x = -Math.PI / 2; // Lay flat
		highlight.position.y = -0.65; // Positioned below the piece, adjusted for new height
		
		// Create glow effect - add a larger, fainter ring
		const glowGeometry = new THREE.RingGeometry(0.7, 0.9, 32);
		const glowMaterial = new THREE.MeshBasicMaterial({
			color: 0xFFFFFF,
			transparent: true,
			opacity: 0.3,
			side: THREE.DoubleSide
		});
		const glow = new THREE.Mesh(glowGeometry, glowMaterial);
		glow.name = 'hover-glow';
		glow.rotation.x = -Math.PI / 2; // Lay flat
		glow.position.y = -0.67; // Positioned just below the highlight, adjusted for new height
		
		piece.add(highlight);
		piece.add(glow);
		
		// Add animation using TWEEN for better performance if available
		if (window.TWEEN) {
			const scaleData = { value: 1.0 };
			const scaleTween = new TWEEN.Tween(scaleData)
				.to({ value: 1.1 }, 800)
				.easing(TWEEN.Easing.Quadratic.InOut)
				.yoyo(true)
				.repeat(Infinity)
				.onUpdate(() => {
					if (highlight && highlight.scale) {
						highlight.scale.set(scaleData.value, scaleData.value, 1);
					}
					if (glow && glow.scale) {
						glow.scale.set(scaleData.value * 1.1, scaleData.value * 1.1, 1);
					}
				})
				.start();
			
			// Store reference to the tween for later cleanup
			highlight.userData.tween = scaleTween;
		} else {
			// Fallback to traditional animation loop
			const startTime = Date.now();
			highlight.userData.animation = function() {
				const elapsed = (Date.now() - startTime) / 1000;
				const scale = 1 + 0.1 * Math.sin(elapsed * 3);
				highlight.scale.set(scale, scale, 1);
				glow.scale.set(scale * 1.1, scale * 1.1, 1);
			};
			
			// Add to animation loop
			if (!window._highlightAnimations) {
				window._highlightAnimations = [];
				
				// Set up animation loop if not already running
				if (!window._highlightAnimationLoop) {
					window._highlightAnimationLoop = function() {
						if (window._highlightAnimations && window._highlightAnimations.length > 0) {
							window._highlightAnimations.forEach(anim => {
								if (typeof anim === 'function') {
									try {
										anim();
									} catch (e) {
										console.warn('Error in highlight animation:', e);
									}
								}
							});
						}
						requestAnimationFrame(window._highlightAnimationLoop);
					};
					window._highlightAnimationLoop();
				}
			}
			
			window._highlightAnimations.push(highlight.userData.animation);
		}
		
		// Scale piece slightly
		piece.scale.set(1.1, 1.1, 1.1);
	} catch (error) {
		console.error('Error creating highlight effect:', error);
	}
}

/**
 * Update board state incrementally with only changed cells
 * @param {Array} changes - Array of cell changes with format {id, x, z, value}
 */
function updateBoardStateIncremental(changes) {
	if (!changes || !Array.isArray(changes) || changes.length === 0) {
		return;
	}
	
	// Ensure board exists
	if (!gameState.board) {
		console.warn("Cannot apply incremental updates to non-existent board");
		return;
	}
	
	// Save the centre marker if it exists
	const existingCentreMarker = gameState.board.centreMarker;
	
	// Track if we need to expand the board
	let needsBoardRebuild = false;
	let maxX = gameState.boardWidth || gameState.boardSize - 1;
	let maxZ = gameState.boardHeight || gameState.boardSize - 1;
	
	// Apply each change
	let changedCells = 0;
	for (const change of changes) {
		// Extract change details
		const { x, z, value } = change;
		
		// Check if coordinates are outside current board
		if (x > maxX || z > maxZ || x < 0 || z < 0) {
			needsBoardRebuild = true;
			maxX = Math.max(maxX, x);
			maxZ = Math.max(maxZ, z);
			continue;
		}
		
		// Check if this is a centre marker - protect it from being removed
		if (existingCentreMarker && 
			x === existingCentreMarker.x && 
			z === existingCentreMarker.z) {
			
			// Use the new helper function to preserve the marker
			const cellKey = `${x},${z}`;
			if (gameState.board.cells && gameState.board.cells[cellKey]) {
				// Get the current cell data
				const currentCell = gameState.board.cells[cellKey];
				
				// Update the value while preserving the marker
				value = updateCellPreservingMarker(currentCell, value, existingCentreMarker);
				
				// If the function returned the same object, skip this update to avoid issues
				if (value === currentCell) {
					console.log('Skipping update to protect centre marker');
					continue;
				}
			}
		}
		
		// Apply change to our board
		if (!gameState.board[z]) {
			gameState.board[z] = [];
		}
		
		gameState.board[z][x] = value;
		changedCells++;
	}
	
	console.log(`Applied ${changedCells} incremental board changes`);
	
	// If board needs to be expanded, update dimensions and request full state
	if (needsBoardRebuild) {
		console.log(`Board expansion needed - board needs to be at least ${maxX+1}x${maxZ+1}`);
		
		// Update our dimensions
		gameState.boardWidth = Math.max(gameState.boardWidth || 0, maxX + 1);
		gameState.boardHeight = Math.max(gameState.boardHeight || 0, maxZ + 1);
		gameState.boardSize = Math.max(gameState.boardWidth, gameState.boardHeight);
		
		// Restore the centre marker before recreating
		if (existingCentreMarker) {
			gameState.board.centreMarker = existingCentreMarker;
		}
		
		// Recreate the board with new size
		sceneModule.createBoard(boardGroup, gameState);
			
		// Request full state
		requestGameState();
		return;
	}
	
	// Restore the centre marker in case it was removed or modified
	if (existingCentreMarker) {
		gameState.board.centreMarker = existingCentreMarker;
		
		// Also make sure the centre marker cell exists and contains the special marker
		if (gameState.board.cells) {
			const cellKey = `${existingCentreMarker.x},${existingCentreMarker.z}`;
			
			// Check if the cell exists
			if (!gameState.board.cells[cellKey]) {
				// Cell doesn't exist, create it
				gameState.board.cells[cellKey] = [{
					type: 'specialMarker',
					isCentreMarker: true,
					centreX: existingCentreMarker.x,
					centreZ: existingCentreMarker.z
				}];
				console.log(`Created new centre marker cell at ${cellKey}`);
			} else if (Array.isArray(gameState.board.cells[cellKey])) {
				// Check if the marker already exists in the array
				const markerExists = gameState.board.cells[cellKey].some(item => 
					(item.type === 'specialMarker' && item.isCentreMarker) ||
					(item.type === 'boardCentre'));
					
				if (!markerExists) {
					// Marker doesn't exist in array, add it
					gameState.board.cells[cellKey].push({
						type: 'specialMarker',
						isCentreMarker: true,
						centreX: existingCentreMarker.x,
						centreZ: existingCentreMarker.z
					});
					console.log(`Added centre marker to existing array cell at ${cellKey}`);
				}
			} else if (typeof gameState.board.cells[cellKey] === 'object') {
				// Legacy format - add special marker property
				gameState.board.cells[cellKey].specialMarker = {
					type: 'boardCentre',
					isCentreMarker: true,
					centreX: existingCentreMarker.x,
					centreZ: existingCentreMarker.z
				};
				console.log(`Updated legacy centre marker in cell at ${cellKey}`);
			}
		}
	}
	
	// Update visuals for changed cells only
	updateBoardVisuals();
}

/**
 * Monitor FPS and trigger reset if performance is too low
 * @param {number} fps - Current frames per second
 */
function monitorPerformance(fps) {
	// Store last few FPS readings
	if (!gameState.fpsHistory) {
		gameState.fpsHistory = [];
	}
	
	// Add current FPS to history
	gameState.fpsHistory.push(fps);
	
	// Keep only the last 30 readings
	if (gameState.fpsHistory.length > 30) {
		gameState.fpsHistory.shift();
	}
	
	// Calculate average FPS
	const avgFps = gameState.fpsHistory.reduce((sum, fps) => sum + fps, 0) / gameState.fpsHistory.length;
	
	// If average FPS is below threshold, optimize the scene
	if (avgFps < 20 && !gameState.hasOptimizedForPerformance) {
		console.warn(`Low performance detected (${avgFps.toFixed(1)} FPS), applying optimizations`);
		
		// Apply performance optimizations
		applyThreeJsOptimizations();
		
		// Flag that we've optimized
		gameState.hasOptimizedForPerformance = true;
	}
}

/**
 * Apply optimizations to improve performance
 */
function applyThreeJsOptimizations() {
	// Reduce shadow map size if shadows are enabled
	if (renderer && renderer.shadowMap && renderer.shadowMap.enabled) {
		renderer.shadowMap.autoUpdate = false;
		renderer.shadowMap.needsUpdate = true;
	}
	
	// Reduce draw distance
	if (camera) {
		camera.far = Math.min(camera.far, 100);
		camera.updateProjectionMatrix();
	}
	
	// Simplify materials
	if (scene) {
		scene.traverse(obj => {
			if (obj.isMesh) {
				// Use basic materials instead of standard materials for better performance
				if (obj.material && obj.material.type === 'MeshStandardMaterial') {
					const color = obj.material.color ? obj.material.color.clone() : new THREE.Color(0xcccccc);
					const opacity = obj.material.opacity || 1;
					const transparent = obj.material.transparent || false;
					
					// Dispose old material to prevent memory leaks
					if (obj.material.dispose) {
						obj.material.dispose();
					}
					
					// Create a simpler material
					obj.material = new THREE.MeshLambertMaterial({
						color,
						opacity,
						transparent
					});
				}
				
				// Disable shadows on smaller/less important objects
				if (obj.userData && obj.userData.type === 'cloud') {
					obj.castShadow = false;
					obj.receiveShadow = false;
				}
			}
		});
	}
	
	// Disable pixel ratio adjustment
	if (renderer) {
		renderer.setPixelRatio(1);
	}
	
	// Disable expensive post-processing effects if any
	
	// Reduce cloud count
	if (typeof animateClouds === 'function') {
		animateClouds(true); // Call with optimization flag
	}
	
	// Force a full garbage collection if possible
	if (typeof window !== 'undefined' && window.gc) {
		try {
			window.gc();
		} catch (e) {
			console.log('Manual GC not available');
		}
	}
	
	console.log('Performance optimizations applied');
}

/**
 * Render the current tetromino on the board
 */
function renderCurrentTetromino() {
	// If no tetromino exists in game state, return
	if (!gameState.currentTetromino) return;
	
	// Clear existing tetromino group
	while (tetrominoGroup.children.length > 0) {
		tetrominoGroup.remove(tetrominoGroup.children[0]);
	}
	
	// Use the boardFunctions module to render the tetromino
	boardFunctions.renderTetromino(
		gameState,
		gameState.currentTetromino,
		tetrominoGroup,
		createTetrominoBlock
	);
}


/**
 * Initialize the game UI elements
 */
function initializeGameUI() {
	// Create player bar if it doesn't exist
	if (!document.getElementById('player-bar')) {
		createPlayerBar();
	}
	
	// Create phase buttons if they don't exist
	if (!document.getElementById('phase-buttons')) {
		const phaseButtonsContainer = document.createElement('div');
		phaseButtonsContainer.id = 'phase-buttons';
		phaseButtonsContainer.className = 'phase-buttons';
		
		// Tetris phase button
		const tetrisButton = document.createElement('button');
		tetrisButton.textContent = 'Tetris Phase';
		tetrisButton.className = 'phase-button tetris-button';
		tetrisButton.onclick = handleTetrisPhaseClick;
		
		// Chess phase button
		const chessButton = document.createElement('button');
		chessButton.textContent = 'Chess Phase';
		chessButton.className = 'phase-button chess-button';
		chessButton.onclick = handleChessPhaseClick;
		
		// Add buttons to container
		phaseButtonsContainer.appendChild(tetrisButton);
		phaseButtonsContainer.appendChild(chessButton);
		
		// Add container to document
		document.body.appendChild(phaseButtonsContainer);
	}
	
	// Create debug panel if debugging is enabled
	if (gameState.debugMode && !document.getElementById('debug-panel')) {
		const debugPanel = document.createElement('div');
		debugPanel.id = 'debug-panel';
		debugPanel.className = 'debug-panel';
		debugPanel.innerHTML = '<h4>Debug Panel</h4><div id="debug-content"></div>';
		document.body.appendChild(debugPanel);
	}


}

/**
 * Create a player bar to display player information
 */
function createPlayerBar() {
	// Create player bar container
	const playerBar = document.createElement('div');
	playerBar.id = 'player-bar';
	playerBar.className = 'player-bar';
	
	// Setup header
	const header = document.createElement('div');
	header.className = 'player-bar-header';
	header.innerHTML = '<h3>Players</h3>';
	playerBar.appendChild(header);
	
	// Create player container
	const playerContainer = document.createElement('div');
	playerContainer.id = 'player-container';
	playerContainer.className = 'player-container';
	playerBar.appendChild(playerContainer);
	
	// Add to document
	document.body.appendChild(playerBar);
	
	// Populate player information
	if (gameState.players) {
		Object.keys(gameState.players).forEach(playerId => {
			const player = gameState.players[playerId];
			// Add player info to the bar
			addPlayerToBar(
				playerBar,
				playerId,
				player.name || `Player ${playerId}`,
				{
					color: player.color || '#4399ea',
					isCurrentTurn: playerId === gameState.currentPlayer,
					score: player.score || 0
				},
				playerId === gameState.localPlayerId
			);
		});
	}
	
	// If we don't have players yet, show a message
	if (!gameState.players || Object.keys(gameState.players).length === 0) {
		const waitingMessage = document.createElement('div');
		waitingMessage.className = 'waiting-message';
		waitingMessage.textContent = 'Waiting for players...';
		playerContainer.appendChild(waitingMessage);
	}
	
	return playerBar;
}

/**
 * Add a player to the player bar
 * @param {HTMLElement} playerBar - The player bar element
 * @param {string} playerId - Player ID
 * @param {string} playerName - Player name
 * @param {Object} colorInfo - Player color and turn information
 * @param {boolean} isLocalPlayer - Whether this is the local player
 */
function addPlayerToBar(playerBar, playerId, playerName, colorInfo, isLocalPlayer) {
	// Get or create the player container
	let playerContainer = document.getElementById('player-container');
	if (!playerContainer) {
		playerContainer = document.createElement('div');
		playerContainer.id = 'player-container';
		playerContainer.className = 'player-container';
		playerBar.appendChild(playerContainer);
	}
	
	// Check if player already exists
	let playerElement = document.getElementById(`player-${playerId}`);
	
	// If player element doesn't exist, create it
	if (!playerElement) {
		playerElement = document.createElement('div');
		playerElement.id = `player-${playerId}`;
		playerElement.className = 'player-item';
		
		// Add player element to container
		playerContainer.appendChild(playerElement);
	}
	
	// Update player element content
	playerElement.innerHTML = '';
	
	// Create color indicator
	const colorIndicator = document.createElement('div');
	colorIndicator.className = 'player-color';
	colorIndicator.style.backgroundColor = colorInfo.color || '#4399ea';
	playerElement.appendChild(colorIndicator);
	
	// Create name display
	const nameDisplay = document.createElement('div');
	nameDisplay.className = 'player-name';
	nameDisplay.textContent = playerName;
	
	// Highlight if this is the local player
	if (isLocalPlayer) {
		nameDisplay.classList.add('local-player');
		nameDisplay.textContent += ' (You)';
	}
	
	// Highlight if this is the current player's turn
	if (colorInfo.isCurrentTurn) {
		playerElement.classList.add('current-turn');
		const turnIndicator = document.createElement('span');
		turnIndicator.className = 'turn-indicator';
		turnIndicator.textContent = '🎮';
		nameDisplay.appendChild(turnIndicator);
	} else {
		playerElement.classList.remove('current-turn');
	}
	
	playerElement.appendChild(nameDisplay);
	
	// Create score display if score exists
	if (colorInfo.score !== undefined) {
		const scoreDisplay = document.createElement('div');
		scoreDisplay.className = 'player-score';
		scoreDisplay.textContent = `Score: ${colorInfo.score}`;
		playerElement.appendChild(scoreDisplay);
	}
	
	// Add hover effect that highlights this player's pieces
	playerElement.addEventListener('mouseenter', () => {
		// Set this as the hovered player in game state
		gameState.hoveredPlayer = playerId;
		
		// Highlight all of this player's pieces
		highlightPlayerPieces(playerId);
	});
	
	playerElement.addEventListener('mouseleave', () => {
		// Clear the hovered player
		gameState.hoveredPlayer = null;
		
		// Remove highlights
		removePlayerPiecesHighlight();
	});
}

/**
 * Highlight all pieces belonging to a specific player
 * @param {string} playerId - Player ID
 */
function highlightPlayerPieces(playerId) {
	// If no chess pieces group, return
	if (!chessPiecesGroup) return;
	
	// Apply highlight to matching pieces
	chessPiecesGroup.children.forEach(piece => {
		if (piece.userData && String(piece.userData.player) === String(playerId)) {
			highlightSinglePiece(piece);
		}
	});
}

/**
 * Remove highlights from all chess pieces
 */
function removePlayerPiecesHighlight() {
	// If no chess pieces group, return
	if (!chessPiecesGroup) return;
	
	// Remove highlights from all pieces
	chessPiecesGroup.children.forEach(piece => {
		// Clean up previous highlight elements
		const existingHighlight = piece.getObjectByName('hover-highlight');
		const existingGlow = piece.getObjectByName('hover-glow');
		
		// Remove animations
		if (existingHighlight && existingHighlight.userData && existingHighlight.userData.animation) {
			if (window._highlightAnimations) {
				const index = window._highlightAnimations.indexOf(existingHighlight.userData.animation);
				if (index > -1) {
					window._highlightAnimations.splice(index, 1);
				}
			}
		}
		
		// Remove meshes
		if (existingHighlight) {
			piece.remove(existingHighlight);
			if (existingHighlight.geometry) existingHighlight.geometry.dispose();
			if (existingHighlight.material) existingHighlight.material.dispose();
		}
		
		if (existingGlow) {
			piece.remove(existingGlow);
			if (existingGlow.geometry) existingGlow.geometry.dispose();
			if (existingGlow.material) existingGlow.material.dispose();
		}
		
		// Reset scale
		piece.scale.set(1, 1, 1);
	});
}

/**
 * Update the player bar with current game state
 */
function updatePlayerBar() {
	// Get the player container
	const playerContainer = document.getElementById('player-container');
	if (!playerContainer) return;
	
	// Clear existing content
	playerContainer.innerHTML = '';
	
	// Add each player
	if (gameState.players) {
		Object.keys(gameState.players).forEach(playerId => {
			const player = gameState.players[playerId];
			// Add player to bar
			addPlayerToBar(
				document.getElementById('player-bar'),
				playerId,
				player.name || `Player ${playerId}`,
				{
					color: player.color || '#4399ea',
					isCurrentTurn: playerId === gameState.currentPlayer,
					score: player.score || 0
				},
				playerId === gameState.localPlayerId
			);
		});
	}
}

/**
 * Update the UI state based on the current game state
 */
function updateUIState() {
	// Update player bar
	updatePlayerBar();
	
	// Update phase buttons
	const tetrisButton = document.querySelector('.tetris-button');
	const chessButton = document.querySelector('.chess-button');
	
	if (tetrisButton && chessButton) {
		// Highlight the current phase
		if (gameState.turnPhase === 'tetris') {
			tetrisButton.classList.add('active');
			chessButton.classList.remove('active');
		} else if (gameState.turnPhase === 'chess') {
			tetrisButton.classList.remove('active');
			chessButton.classList.add('active');
		}
	}
	
	// Update debug panel if it exists
	if (gameState.debugMode) {
		const debugContent = document.getElementById('debug-content');
		if (debugContent) {
			const debugInfo = `
				<p>Current player: ${gameState.currentPlayer}</p>
				<p>Turn phase: ${gameState.turnPhase}</p>
				<p>Player count: ${gameState.players ? Object.keys(gameState.players).length : 0}</p>
				<p>FPS: ${gameState.lastFPS ? gameState.lastFPS.toFixed(1) : 'N/A'}</p>
			`;
			debugContent.innerHTML = debugInfo;
		}
	}
}

/**
 * Start the game
 * @param {boolean} justLooking - Whether the player is just observing or playing
 */
function startGame(justLooking = false) {
	// Cleanup any existing game elements
	if (animationFrameId) {
		cancelAnimationFrame(animationFrameId);
		animationFrameId = null;
	}
	
	// Clear scene if it exists
	if (scene) {
		while (scene.children.length > 0) {
			const object = scene.children[0];
			scene.remove(object);
		}
	}
	
	// Setup scene, camera, and renderer
	const sceneResult = sceneModule.setupScene(
		containerElement,
		scene,
		camera,
		renderer,
		controls,
		boardGroup,
		tetrominoGroup,
		chessPiecesGroup,
		clouds,
		gameState
	);
	
	// Extract return values from setupScene
	scene = sceneResult._scene;
	camera = sceneResult._camera;
	renderer = sceneResult._renderer;
	controls = sceneResult._controls;
	boardGroup = sceneResult._boardGroup;
	tetrominoGroup = sceneResult._tetrominoGroup;
	chessPiecesGroup = sceneResult._chessPiecesGroup;
	clouds = sceneResult._clouds;
	
	// Set default viewing position
	resetCameraForGameplay(
		renderer,
		camera,
		controls,
		gameState,
		scene,
		true,
		true
	);
	
	// The groups are already added to the scene in setupScene, no need to add them again
	
	// Setup raycaster for mouse interactions
	raycaster = new THREE.Raycaster();
	mouse = new THREE.Vector2();
	
	// Setup input handlers
	setupInputHandlers();
	
	// Setup network events
	setupNetworkEvents();
	
	// Start the game loop
	startGameLoop();
	

	NetworkManager.ensureConnected();
	
	// Initialize the UI
	initializeGameUI();
	
	// Hide loading elements
	hideAllLoadingElements();
}

/**
 * Skip the current player's move
 */
function skipCurrentMove() {
	// If not in a game or not our turn, do nothing
	if (!gameState.gameStarted || String(gameState.currentPlayer) !== String(gameState.localPlayerId)) {
		return;
	}
	
	// Confirm with the user
	if (confirm('Are you sure you want to skip your turn?')) {
		// Notify server
		if (typeof NetworkManager !== 'undefined' && NetworkManager.sendAction) {
			NetworkManager.sendAction({
				type: 'skipTurn',
				player: gameState.localPlayerId
			});
		}
		
		// Local state update - will be overridden by server update
		const nextPlayerId = getNextPlayer();
		gameState.currentPlayer = nextPlayerId;
		
		// Update UI
		updateGameStatusDisplay();
	}
}

/**
 * Move the camera to view a player's home zone
 */
function moveToPlayerZone() {
	// If no local player ID, do nothing
	if (!gameState.localPlayerId) return;
	
	// Find the player's king
	const playerPieces = gameState.chessPieces.filter(
		piece => String(piece.player) === String(gameState.localPlayerId)
	);
	
	// If no pieces, use center of board
	if (!playerPieces.length) {
		resetCameraForGameplay(renderer, camera, controls, gameState, scene);
		return;
	}
	
	// Find the king, or any piece if king not found
	const kingPiece = playerPieces.find(piece => 
		piece.type === 'KING' || piece.type === 'king'
	) || playerPieces[0];
	
	// Get the position
	const position = kingPiece.position;
	
	// Move camera to focus on that position
	if (camera && controls && position) {
		// Calculate target position
		const targetX = position.x - gameState.board.centreMarker.x;
		const targetZ = position.z - gameState.board.centreMarker.z;
		
		// Set camera position
		controls.target.set(targetX, 0, targetZ);
		camera.position.set(targetX, 15, targetZ + 15);
		
		// Update controls
		controls.update();
	}
}

/**
 * Start the player's turn
 */
function startTurn() {	
	// If not our turn, do nothing
	if (String(gameState.currentPlayer) !== String(gameState.localPlayerId)) {
		console.log(`Not our turn (current: ${gameState.currentPlayer}, local: ${gameState.localPlayerId})`);
		updateGameStatusDisplay();
		return;
	}
	
	console.log(`Starting turn for player ${gameState.localPlayerId}`);
	
	// Default to tetris phase
	gameState.turnPhase = 'tetris';
	
	// Create a new tetromino if none exists
	if (!gameState.currentTetromino) {
		gameState.currentTetromino = boardFunctions.createRandomTetromino(gameState);
	}
	
	// Update UI
	updateGameStatusDisplay();
	
	// Update board visuals
	updateBoardVisuals();
	
	// Render current tetromino
	renderCurrentTetromino();
}

/**
 * Highlight a chess piece
 * @param {Object} piece - The piece to highlight
 * @param {boolean} isHighlighted - Whether to highlight or unhighlight
 */
function highlightChessPiece(piece, isHighlighted) {
	if (!piece) return;
	
	// Handle array of pieces
	if (Array.isArray(piece)) {
		piece.forEach(p => highlightChessPiece(p, isHighlighted));
		return;
	}
	
	// Skip if the piece doesn't have a material
	if (!piece.material) return;
	
	// Store original material if not already stored
	if (isHighlighted && !piece.userData.originalMaterial) {
		piece.userData.originalMaterial = piece.material.clone();
	}
	
	if (isHighlighted) {
		// Apply highlight material
		const highlightMaterial = new THREE.MeshBasicMaterial({
			color: 0xffff00,
			transparent: true,
			opacity: 0.8
		});
		piece.material = highlightMaterial;
	} else {
		// Restore original material
		if (piece.userData.originalMaterial) {
			piece.material.dispose();
			piece.material = piece.userData.originalMaterial;
			delete piece.userData.originalMaterial;
		}
	}
}

/**
 * Clean up Three.js resources
 */
export function cleanupThreeJsResources() {
	// Cancel animation frame
	if (animationFrameId) {
		cancelAnimationFrame(animationFrameId);
		animationFrameId = null;
	}
	
	// Dispose renderer
	if (renderer) {
		renderer.dispose();
		renderer.forceContextLoss();
		renderer.domElement = null;
		renderer = null;
	}
	
	// Clean up scene
	if (scene) {
		const cleanGroup = (group) => {
			if (!group) return;
			
			// Remove all children
			while (group.children.length > 0) {
				const child = group.children[0];
				
				// Recursively clean if it's a group
				if (child.isGroup) {
					cleanGroup(child);
				}
				
				// Dispose geometries and materials
				if (child.geometry) {
					child.geometry.dispose();
				}
				
				if (child.material) {
					if (Array.isArray(child.material)) {
						child.material.forEach(material => {
							if (material.map) material.map.dispose();
							material.dispose();
						});
					} else {
						if (child.material.map) child.material.map.dispose();
						child.material.dispose();
					}
				}
				
				// Remove from parent
				group.remove(child);
			}
		};
		
		// Clean all groups
		cleanGroup(scene);
		
		// Clear main scene references
		boardGroup = null;
		tetrominoGroup = null;
		chessPiecesGroup = null;
		scene = null;
	}
	
	// Clear other references
	camera = null;
	controls = null;
	raycaster = null;
	mouse = null;
	clouds = null;
	
	console.log('Three.js resources cleaned up');
}

/**
 * Handle page unload
 */
export function onPageUnload() {
	// Clean up Three.js resources
	cleanupThreeJsResources();
	
	// Disconnect from server
	if (NetworkManager && NetworkManager.disconnect) {
		NetworkManager.disconnect();
	}
	
	console.log('Page unload cleanup complete');
}

/**
 * Test function to verify the scene setup is working correctly
 */
export function testSceneSetup() {
	try {
		console.log("Running scene setup test...");
		
		// Create a container if needed
		if (!containerElement) {
			console.log("Creating temporary container for test");
			containerElement = document.createElement('div');
			containerElement.style.width = '400px';
			containerElement.style.height = '300px';
			document.body.appendChild(containerElement);
		}
		
		// Create new groups
		const testBoardGroup = new THREE.Group();
		testBoardGroup.name = 'testBoardGroup';
		
		const testTetrominoGroup = new THREE.Group();
		testTetrominoGroup.name = 'testTetrominoGroup';
		
		const testChessPiecesGroup = new THREE.Group();
		testChessPiecesGroup.name = 'testChessPiecesGroup';
		
		// Setup scene with sceneModule
		console.log("Setting up test scene with sceneModule");
		const sceneResult = sceneModule.setupScene(
			containerElement,
			null, // New scene
			null, // New camera
			null, // New renderer
			null, // New controls
			testBoardGroup,
			testTetrominoGroup,
			testChessPiecesGroup,
			null, // New clouds
			gameState
		);
		
		// Extract return values
		const testScene = sceneResult._scene;
		const testCamera = sceneResult._camera;
		const testRenderer = sceneResult._renderer;
		const testControls = sceneResult._controls;
		const retrievedBoardGroup = sceneResult._boardGroup;
		
		// Create a sample board
		console.log("Creating sample board");
		
		// Create a simple mock game state for testing
		const testGameState = {
			board: {
				cells: {
					"0,0": { type: "cell" },
					"1,0": { type: "cell" },
					"0,1": { type: "cell" },
					"1,1": { type: "cell" }
				}
			},
			boardSize: 2
		};
		
		// Temporarily swap game state
		const oldGameState = gameState;
		gameState = testGameState;
		
		// Create a test board
		sceneModule.createBoard(retrievedBoardGroup, gameState);
		
		// Restore original game state
		gameState = oldGameState;
		
		// Check results
		const success = 
			testScene !== null && 
			testCamera !== null && 
			testRenderer !== null && 
			retrievedBoardGroup !== null &&
			retrievedBoardGroup.children.length === 4; // Should have 4 cells
		
		console.log(`Scene test ${success ? 'PASSED' : 'FAILED'}`);
		console.log(`- Scene: ${testScene ? 'OK' : 'MISSING'}`);
		console.log(`- Camera: ${testCamera ? 'OK' : 'MISSING'}`);
		console.log(`- Renderer: ${testRenderer ? 'OK' : 'MISSING'}`);
		console.log(`- BoardGroup: ${retrievedBoardGroup ? 'OK' : 'MISSING'}`);
		console.log(`- Board cells: ${retrievedBoardGroup ? retrievedBoardGroup.children.length : 0}/4`);
		
		// Clean up - remove renderer from DOM
		if (testRenderer && testRenderer.domElement && testRenderer.domElement.parentNode) {
			testRenderer.domElement.parentNode.removeChild(testRenderer.domElement);
		}
		
		return success;
	} catch (error) {
		console.error("Scene test failed with error:", error);
		return false;
	}
}
