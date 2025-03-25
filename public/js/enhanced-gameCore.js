/**
 * Shaktris Game - Enhanced Core Module (Russian Theme)
 * 
 * This module provides the core functionality for the Shaktris game with Russian theme enhancements.
 */

// Use global THREE if available, otherwise import from module
import * as THREE_MODULE from './utils/three.module.js';

// Set THREE to either the global version or the imported module
const THREE = (typeof window !== 'undefined' && window.THREE) ? window.THREE : THREE_MODULE;

// Ensure THREE is available
if (!THREE) {
  console.error('THREE.js not available. Game will not function correctly.');
}

// Import other modules
import * as NetworkManager from './utils/networkManager.js';
import { createFallbackTextures, animateClouds } from './textures.js';
import { createFallbackModels } from './models.js';
import { showToastMessage } from './showToastMessage.js';
import { createNetworkStatusDisplay } from './createNetworkStatusDisplay.js';
import { setupScene, rebuildScene, createFloatingIsland } from './scene.js';
import { boardFunctions } from './boardFunctions.js';
import { createChessPiece as createExternalChessPiece } from './chessPieceCreator.js';

// Core game state
let gameState = {
	board: [],
	chessPieces: [],
	activeTetromino: null,
	tetrominoList: [],
	selectedPiece: null,
	hoveredCell: { x: -1, y: -1, z: -1 },
	gameOver: false,
	winner: null,
	currentTurn: 1,
	turnPhase: 'tetris',
	score: {
		player1: 0,
		player2: 0
	},
	boardDimensions: {
		width: 16,
		height: 16
	},
	localPlayerId: 1,
	inMultiplayerMode: false,
	showChessControls: false,
	// Russian theme flags
	autoRotateCamera: true,
	hasSnow: true,
	showTetrisGhost: true,
	isPaused: false,
	// Camera positioning
	pendingCameraReset: null,
	fpsHistory: []
};

// Cached DOM elements
let containerElement, gameContainer;
let scene, camera, renderer, controls;
let boardGroup, tetrominoGroup, chessPiecesGroup;
let raycaster, mouse;

// Tetromino drop height
const TETROMINO_DROP_HEIGHT = 0.6; 

// Player colors
const PLAYER_COLORS = {
	1: 0x3377FF, // Blue
	2: 0xFF8800, // Orange
	3: 0x33CC33, // Green
	4: 0xEE3377  // Pink/Purple
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
		
		// Create groups
		console.log("Creating scene groups...");
		boardGroup = new THREE.Group();
		scene.add(boardGroup);
		
		tetrominoGroup = new THREE.Group();
		scene.add(tetrominoGroup);
		
		chessPiecesGroup = new THREE.Group();
		scene.add(chessPiecesGroup);

		// Initialize the board with initial visualization
		console.log("Creating initial board visualization...");
		try {
			createBoard(boardGroup);
		} catch (err) {
			console.error("Error creating initial board:", err);
			// Continue with setup, we'll try again when we get data
		}
		
		// Add lights to the scene
		console.log("Setting up lights...");
		setupLights();
		
		// Set up camera position
		console.log("Setting up camera...");
		setupCamera();
		
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
 * Create a loading indicator with Russian-themed styling
 */
function createLoadingIndicator() {
	// Remove existing loading indicator if present
	const existingIndicator = document.getElementById('loading-indicator');
	if (existingIndicator) {
		document.body.removeChild(existingIndicator);
	}

	// Create loading indicator
	const loadingIndicator = document.createElement('div');
	loadingIndicator.id = 'loading-indicator';
	
	// Style with Russian/chess/tetris theme
	Object.assign(loadingIndicator.style, {
		position: 'fixed',
		top: '0',
		left: '0',
		width: '100%',
		height: '100%',
		backgroundColor: 'rgba(0, 0, 0, 0.9)',
		color: '#ffcc00', // Gold text
		display: 'flex',
		flexDirection: 'column',
		justifyContent: 'center',
		alignItems: 'center',
		zIndex: '9999',
		fontFamily: 'Times New Roman, serif'
	});

	// Create animated chess piece with tetris blocks
	const animationContainer = document.createElement('div');
	Object.assign(animationContainer.style, {
		position: 'relative',
		width: '100px',
		height: '100px',
		marginBottom: '20px'
	});

	// Chess knight symbol with animation
	const chessSymbol = document.createElement('div');
	chessSymbol.innerHTML = '♞';
	Object.assign(chessSymbol.style, {
		fontSize: '80px',
		animation: 'pulse 1.5s infinite',
		color: '#ffcc00',
		textShadow: '0 0 10px rgba(255, 204, 0, 0.7)'
	});

	// Create animation keyframes
	const styleElement = document.createElement('style');
	styleElement.textContent = `
		@keyframes pulse {
			0% { transform: scale(1); }
			50% { transform: scale(1.1); }
			100% { transform: scale(1); }
		}
		@keyframes tetrisfall {
			0% { transform: translateY(-20px); opacity: 0; }
			100% { transform: translateY(0); opacity: 1; }
		}
	`;
	document.head.appendChild(styleElement);

	// Create loading text
	const loadingText = document.createElement('div');
	loadingText.textContent = 'Preparing Chesstris Board...';
	Object.assign(loadingText.style, {
		fontSize: '24px',
		marginBottom: '10px',
		fontWeight: 'bold',
		textShadow: '0 0 5px rgba(255, 204, 0, 0.5)'
	});

	// Create subtitle
	const subtitle = document.createElement('div');
	subtitle.textContent = 'Please wait while the pieces are arranged';
	Object.assign(subtitle.style, {
		fontSize: '16px',
		opacity: '0.8',
		marginBottom: '30px'
	});

	// Add elements to document
	animationContainer.appendChild(chessSymbol);
	loadingIndicator.appendChild(animationContainer);
	loadingIndicator.appendChild(loadingText);
	loadingIndicator.appendChild(subtitle);
	document.body.appendChild(loadingIndicator);

	return loadingIndicator;
}

/**
 * Show error message in a styled overlay
 * @param {string} message - Error message to display
 */
function showErrorMessage(message) {
	// Create error message container if it doesn't exist
	let errorElement = document.getElementById('error-message');
	if (!errorElement) {
		errorElement = document.createElement('div');
		errorElement.id = 'error-message';
		
		// Style the error message with Russian theme
		Object.assign(errorElement.style, {
			position: 'fixed',
			top: '0',
			left: '0',
			width: '100%',
			height: '100%',
			backgroundColor: 'rgba(0, 0, 0, 0.9)',
			display: 'flex',
			justifyContent: 'center',
			alignItems: 'center',
			zIndex: '1001',
			color: '#ffcc00',
			textAlign: 'center',
			fontFamily: 'Times New Roman, serif',
			padding: '20px'
		});
		
		document.body.appendChild(errorElement);
	}
	
	// Set error message with Russian-themed styling
	errorElement.innerHTML = `
		<div style="max-width: 600px; background-color: rgba(50, 0, 0, 0.8); padding: 30px; border-radius: 10px; border: 2px solid #ffcc00;">
			<h2 style="color: #ffcc00; margin-top: 0;">Error</h2>
			<p style="font-size: 18px; margin-bottom: 20px;">${message}</p>
			<button onclick="window.location.reload()" style="background: #333; color: #ffcc00; border: 1px solid #ffcc00; padding: 10px 20px; font-size: 16px; cursor: pointer; font-family: 'Times New Roman', serif;">
				Reload Page
			</button>
			<div style="margin-top: 15px;">
				<a href="minimal.html" style="color: #ffcc00; text-decoration: underline; font-size: 14px;">Try Minimal Version Instead</a>
			</div>
		</div>
	`;
	
	// Show the error message
	errorElement.style.display = 'flex';
}

/**
 * Reset game state to initial values
 */
function resetGameState() {
	console.log('Resetting game state...');
	
	// Initialize game state
	gameState = {
		board: [], // 2D array representing the board cells
		selectedPiece: null, // Currently selected chess piece
		chessPieces: [], // Array of all chess pieces
		currentTetromino: null, // Current active tetromino
		ghostPiece: null, // Ghost piece showing where tetromino will land
		validMoves: [], // Valid moves for selected chess piece
		score: 0,
		level: 1,
		turnPhase: 'tetris', // Start with tetris phase
		currentPlayer: 1, // Player 1 starts
		localPlayerId: 1, // Local player ID (from network)
		paused: false,
		gameOver: false,
		winner: null,
		lastPlacement: null, // Last tetromino placement
		lastMove: null, // Last chess move
		players: [], // List of players
		gameStarted: false, // Flag to track if game has been started
		homeZones: {}, // Store home zones information from server
		boardSize: 30, // Default to 30x30, same as server default
		boardWidth: 30,
		boardHeight: 30
	};
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
 * Create game status display
 */
function createGameStatusDisplay() {
	console.log('Creating game status display...');
	
	// Create or get status container
	let statusContainer = document.getElementById('game-status');
	if (!statusContainer) {
		statusContainer = document.createElement('div');
		statusContainer.id = 'game-status';
		
		// Style the container with Russian theme
		Object.assign(statusContainer.style, {
			position: 'fixed',
			top: '10px',
			right: '10px',
			backgroundColor: 'rgba(0, 0, 0, 0.7)',
			color: '#ffcc00', // Gold text
			padding: '15px',
			borderRadius: '5px',
			fontFamily: 'Times New Roman, serif', // Russian-style font
			fontSize: '16px',
			zIndex: '100',
			minWidth: '220px',
			textAlign: 'center',
			border: '2px solid #ffcc00', // Gold border
			boxShadow: '0 0 10px rgba(255, 204, 0, 0.3)' // Gold glow
		});
		
		document.body.appendChild(statusContainer);
	}
	
	// Create or get controls container for debug options
	let controlsContainer = document.getElementById('debug-controls');
	if (!controlsContainer) {
		controlsContainer = document.createElement('div');
		controlsContainer.id = 'debug-controls';
		
		// Style the container with Russian theme
		Object.assign(controlsContainer.style, {
			position: 'fixed',
			top: '200px',
			right: '10px',
			backgroundColor: 'rgba(0, 0, 0, 0.7)',
			color: '#ffcc00', // Gold text
			padding: '10px',
			borderRadius: '5px',
			fontFamily: 'Times New Roman, serif', // Russian-style font
			fontSize: '14px',
			zIndex: '100',
			minWidth: '150px',
			border: '1px solid #ffcc00' // Gold border
		});
		
		// Add simplified debug controls with Russian-style buttons
		controlsContainer.innerHTML = `
			<div style="text-align: center; margin-bottom: 10px; font-weight: bold;">Game Controls</div>
			<div style="margin-bottom: 10px;">
				<button id="debug-tetris-phase" style="width: 100%; background: #333; color: #ffcc00; border: 1px solid #ffcc00; padding: 5px 10px; margin-bottom: 5px; cursor: pointer;">Tetris Phase</button>
				<button id="debug-chess-phase" style="width: 100%; background: #333; color: #ffcc00; border: 1px solid #ffcc00; padding: 5px 10px; cursor: pointer;">Chess Phase</button>
			</div>
			<div>
				<button id="debug-reset-board" style="width: 100%; background: #333; color: #ffcc00; border: 1px solid #ffcc00; padding: 5px 10px; margin-bottom: 5px; cursor: pointer;">Reset Board</button>
				<button id="debug-reset-camera" style="width: 100%; background: #333; color: #ffcc00; border: 1px solid #ffcc00; padding: 5px 10px; cursor: pointer;">Reset Camera</button>
			</div>
		`;
		
		document.body.appendChild(controlsContainer);
		
		// Add event listeners for debug controls
		document.getElementById('debug-tetris-phase').addEventListener('click', handleTetrisPhaseClick);
		document.getElementById('debug-chess-phase').addEventListener('click', handleChessPhaseClick);
		
		document.getElementById('debug-reset-board').addEventListener('click', () => {
			resetGameState();
			createBoard(boardGroup);
			updateGameStatusDisplay();
		});
		
		document.getElementById('debug-reset-camera').addEventListener('click', () => {
			resetCameraView(true);
		});
	}
	
	// Initial update
	updateGameStatusDisplay();
}

/**
 * Update game status display
 */
function updateGameStatusDisplay() {
	// Create or get game status display
	let statusDisplay = document.getElementById('game-status');
	
	// If no status display exists, create one
	if (!statusDisplay) {
		statusDisplay = document.createElement('div');
		statusDisplay.id = 'game-status';
		
		// Style the status display with Russian theme
		Object.assign(statusDisplay.style, {
			position: 'fixed',
			bottom: '10px',
			left: '50%',
			transform: 'translateX(-50%)',
			backgroundColor: 'rgba(0, 0, 0, 0.7)',
			color: '#ffcc00', // Gold text
			padding: '10px 20px',
			borderRadius: '5px',
			fontFamily: 'Times New Roman, serif', // Russian-style font
			zIndex: '1000',
			textAlign: 'center',
			fontSize: '16px',
			border: '1px solid #ffcc00' // Gold border
		});
		
		document.body.appendChild(statusDisplay);
	}
	
	// Update status based on game state
	if (gameState.isGameOver) {
		statusDisplay.innerHTML = `
			<div style="color: #FFD700; font-size: 18px;">Game Over</div>
			<div>Player ${gameState.winner} wins!</div>
			<div style="margin-top: 5px;">☦</div>
		`;
		statusDisplay.style.backgroundColor = 'rgba(128, 0, 0, 0.8)';
	} else if (!gameState.currentPlayer) {
		statusDisplay.textContent = 'Waiting for game to start...';
	} else {
		let phase = gameState.turnPhase === 'tetris' ? 'Place Tetromino' : 'Move Chess Piece';
		let playerColor = gameState.currentPlayer === 1 ? '#4477FF' : '#FF7744';
		
		statusDisplay.innerHTML = `
			<div>
				Player ${gameState.currentPlayer} - 
				<span style="color: ${playerColor};">${phase}</span>
			</div>
		`;
		
		// Highlight if it's the current turn
		if (NetworkManager.getPlayerId() === `player${gameState.currentPlayer}`) {
			statusDisplay.style.backgroundColor = 'rgba(0, 128, 0, 0.8)';
		} else {
			statusDisplay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
		}
	}
}

/**
 * Update the network status display
 * @param {string} status - The current network status: 'connecting', 'connected', or 'disconnected'
 */
export function updateNetworkStatus(status) {
	const networkStatusElement = document.getElementById('network-status');
	
	if (!networkStatusElement) return;
	
	// Set text and color based on status with Russian theme
	switch (status) {
		case 'connected':
			networkStatusElement.textContent = 'Network: Connected';
			networkStatusElement.style.backgroundColor = 'rgba(0, 128, 0, 0.7)';
			networkStatusElement.style.borderColor = '#ffcc00'; // Gold border
			break;
		case 'disconnected':
			networkStatusElement.textContent = 'Network: Disconnected';
			networkStatusElement.style.backgroundColor = 'rgba(255, 0, 0, 0.7)';
			networkStatusElement.style.borderColor = '#ffcc00'; // Gold border
			break;
		case 'connecting':
			networkStatusElement.textContent = 'Network: Connecting...';
			networkStatusElement.style.backgroundColor = 'rgba(255, 165, 0, 0.7)';
			networkStatusElement.style.borderColor = '#ffcc00'; // Gold border
			break;
		default:
			networkStatusElement.textContent = `Network: ${status}`;
			networkStatusElement.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
			networkStatusElement.style.borderColor = '#ffcc00'; // Gold border
	}
}

/**
 * Show a tutorial message with Russian-themed styling
 */
function showTutorialMessage() {
	// Check if tutorial is already showing
	if (document.getElementById('tutorial-message')) {
		console.log('Tutorial already showing, not creating another one');
		return;
	}
	
	// Create tutorial message
	const tutorialElement = document.createElement('div');
	tutorialElement.id = 'tutorial-message';
	
	// Style the container with Russian theme
	Object.assign(tutorialElement.style, {
		position: 'fixed',
		top: '50%',
		left: '50%',
		transform: 'translate(-50%, -50%)',
		backgroundColor: 'rgba(0, 0, 0, 0.9)',
		color: 'white',
		padding: '20px',
		borderRadius: '10px',
		fontFamily: 'Times New Roman, serif', // Russian-style font
		fontSize: '16px',
		zIndex: '1000',
		maxWidth: '80%',
		textAlign: 'center',
		border: '2px solid #ffcc00', // Gold border
		boxShadow: '0 0 10px rgba(255, 204, 0, 0.5)' // Gold glow
	});
	
	// Add content with Russian-themed styling
	tutorialElement.innerHTML = `
		<h2 style="color: #ffcc00; margin-top: 0; font-family: 'Times New Roman', serif;">Welcome to Shaktris</h2>
		<p>A massively multiplayer game combining Chess and Tetris with Russian-inspired visuals</p>
		
		<div style="text-align: left; margin: 15px 0;">
			<h3 style="color: #ffcc00; font-family: 'Times New Roman', serif;">How to Play:</h3>
			<ul style="line-height: 1.5;">
				<li><strong>All Players Play Simultaneously</strong> - There are no turns between players!</li>
				<li><strong>Player Cycle:</strong> Each player follows their own cycle:
					<ol>
						<li>First, place a Tetromino (pieces now fall vertically from above)</li>
						<li>Then, move one of your chess pieces</li>
						<li>Repeat - each player plays at their own pace</li>
					</ol>
				</li>
				<li><strong>Tetris Phase:</strong> Tetris pieces automatically fall from above
					<ul>
						<li>Arrow keys: Move tetromino horizontally/vertically on the board</li>
						<li>Z/X: Rotate tetromino</li>
						<li>Space: Hard drop tetromino</li>
						<li>Pieces will explode if they collide with existing blocks!</li>
					</ul>
				</li>
				<li><strong>Chess Phase:</strong> After placing your tetromino
					<ul>
						<li>Click on your piece to select it</li>
						<li>Green circles show where you can move</li>
						<li>Click on a green circle to move there</li>
						<li>After moving, your chess phase ends and you start a new tetris phase</li>
					</ul>
				</li>
				<li><strong>Objective:</strong> Capture opponent kings!</li>
			</ul>
		</div>
		
		<p style="font-style: italic; margin-top: 10px;">This is a massively multiplayer game where all players play independently at the same time.</p>
		
		<div style="text-align: center; margin-top: 20px;">
			<div style="font-size: 36px; color: #ffcc00; margin-bottom: 10px;">☦</div>
			<button id="tutorial-close" style="padding: 12px 30px; background-color: #333; color: #ffcc00; border: 2px solid #ffcc00; border-radius: 5px; cursor: pointer; font-size: 18px; font-weight: bold; font-family: 'Times New Roman', serif; animation: pulse 2s infinite;">START PLAYING</button>
		</div>
	`;
	
	// Add pulse animation style
	const style = document.createElement('style');
	style.textContent = `
		@keyframes pulse {
			0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255, 204, 0, 0.7); }
			50% { transform: scale(1.05); box-shadow: 0 0 0 10px rgba(255, 204, 0, 0); }
			100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255, 204, 0, 0); }
		}
	`;
	document.head.appendChild(style);
	
	// Add to body
	document.body.appendChild(tutorialElement);
	
	// Add event listener to close button
	document.getElementById('tutorial-close').addEventListener('click', () => {
		console.log('START PLAYING button clicked - starting game...');
		
		// Remove the tutorial
		document.body.removeChild(tutorialElement);
		
		// Start the game with a slight delay to ensure UI updates
		setTimeout(() => {
			startPlayingGame(); // Start the game when "Start Playing" is clicked
		}, 100);
	});
}

/**
 * Start the actual game play
 */
function startPlayingGame() {
	console.log('Starting game...');
	
	// Remove the loading indicator
	removeLoadingIndicator();
	
	// Prevent multiple start attempts
	if (gameState.gameStarted) {
		console.log('Game already started, ignoring request');
		showToastMessage('Game already in progress!');
		return;
	}
	
	// Mark game as started
	gameState.gameStarted = true;
	
	// Show a toast notification (only once)
	showToastMessage('Starting game!');
	
	// Store camera reset request for when we have game data
	gameState.pendingCameraReset = {
		animate: true,
		timestamp: Date.now()
	};
	
	// Only need to do this once - removes all previous timeout handlers
	let hasRunResetSequence = false;
	
	// Remove the connecting message if it exists
	if (document.getElementById('connection-loading-message')) {
		document.body.removeChild(document.getElementById('connection-loading-message'));
	}
	
	// Check connection and join a game
	if (NetworkManager.isConnected()) {
		updateNetworkStatus('connected');
		
		// Join the global game
		NetworkManager.joinGame()
			.then(gameData => {
				console.log('Joined game:', gameData);
				updateNetworkStatus('connected');
				
				// Request game state from server
				requestGameState();
				
				// Ensure chess pieces are displayed correctly
				setTimeout(() => {
					if (gameState.chessPieces && gameState.chessPieces.length > 0) {
						console.log("Explicitly updating chess pieces after game start");
						updateChessPieces();
					}
				}, 1000); // Give time for game state to be received
			})
			.catch(error => {
				console.error('Failed to join game:', error);
				updateNetworkStatus('error');
				
				// Start with local state as fallback
				startFirstTurn();
			});
	} else {
		// Try to connect
		NetworkManager.initialize()
			.then(() => NetworkManager.joinGame())
			.then(gameData => {
				console.log('Connected and joined game:', gameData);
				updateNetworkStatus('connected');
				
				// Request game state
				requestGameState();
				
				// Ensure chess pieces are displayed correctly
				setTimeout(() => {
					if (gameState.chessPieces && gameState.chessPieces.length > 0) {
						console.log("Explicitly updating chess pieces after game start");
						updateChessPieces();
					}
				}, 1000); // Give time for game state to be received
			})
			.catch(error => {
				console.error('Failed to connect:', error);
				updateNetworkStatus('disconnected');
				
				// Start with local state as fallback
				startFirstTurn();
			});
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
	// Merge new data into game state
	if (!data) return;
	
	// Create a deep copy of the data to avoid reference issues
	const newData = JSON.parse(JSON.stringify(data));
	
	// Update our game state with the new data
	gameState = {...gameState, ...newData};
	
	console.log("Game state updated:", gameState);
}

/**
 * Reset camera with specific gameplay settings
 * @param {boolean} animate - Whether to animate the camera movement
 * @param {boolean} forceImmediate - Whether to position immediately without waiting for home zone
 */
function resetCameraForGameplay(animate = true, forceImmediate = false) {
	console.log('Resetting camera for gameplay view');
	
	if (!camera || !controls) {
		console.warn('Camera or controls not initialized');
		return;
	}
	
	// If we want to wait for game data but don't have it yet, defer the repositioning
	if (!forceImmediate && (!gameState.board || !gameState.board.length || !gameState.homeZones)) {
		console.log('Waiting for game data before repositioning camera...');
		
		// Store the request for later execution
		gameState.pendingCameraReset = {
			animate: animate,
			requestTime: Date.now()
		};
		
		// Set a default position for now
			camera.position.set(20, 25, 20);
		controls.target.set(8, 0, 8);
			controls.update();
		
		return;
	}
	
	// Default camera position - looking at the center of the board
	let targetPosition = {
		x: 8, // Default x
		y: 20, // Default height 
		z: 25  // Default z
	};
	
	let lookAt = {
		x: 8, // Default focus x - center of the board
		y: 0, // Default focus y
		z: 8 // Default focus z - center of the board
	};
	
	// Get player ID
	const playerId = NetworkManager.getPlayerId ? NetworkManager.getPlayerId() : null;
	
	// If we have home zones data and playerId, position based on player's home zone
	if (playerId && gameState.homeZones && Object.keys(gameState.homeZones).length > 0) {
		// Find the player's home zone
		let homeZone = null;
		for (const [id, zone] of Object.entries(gameState.homeZones)) {
			if (id === playerId || id.includes(playerId)) {
				homeZone = zone;
				break;
			}
		}
		
		// If no home zone found, use the first one as fallback
		if (!homeZone && Object.values(gameState.homeZones).length > 0) {
			homeZone = Object.values(gameState.homeZones)[0];
		}
		
		// If home zone found, position camera based on it
		if (homeZone) {
			console.log('Positioning camera based on home zone:', homeZone);
			
			// Calculate position behind the home zone
			// Use cell coordinates directly as they match the board grid
			const homeX = homeZone.x;
			const homeZ = homeZone.z;
			const homeWidth = homeZone.width || 2;
			const homeHeight = homeZone.height || 2;
			
			// Position camera behind and slightly to the side of home zone
			targetPosition = {
				x: homeX - 5, // Position to left of home zone
				y: 15,        // Height
				z: homeZ + homeHeight + 10 // Position behind home zone
			};
			
			// Look at center of home zone
			lookAt = {
				x: homeX + homeWidth/2, // Center X of home zone
				y: 0,                  // Board level
				z: homeZ + homeHeight/2 // Center Z of home zone
			};
			
			console.log('Camera will move to:', targetPosition, 'looking at:', lookAt);
		}
	}
	
	// Set camera position immediately or animate
	if (!animate) {
		camera.position.set(targetPosition.x, targetPosition.y, targetPosition.z);
		
		// Force a render
		if (renderer && scene) {
			renderer.render(scene, camera);
		}
		return;
	}
	
	// Get current position
	const startPosition = {
		x: camera.position.x,
		y: camera.position.y,
		z: camera.position.z
	};
	
	// Get current look-at
	const startLookAt = controls.target.clone();
	
	// Animation duration
	const duration = 2000; // 2 seconds
	const startTime = Date.now();
	
	// Animate camera movement
	function animateCamera() {
		const elapsed = Date.now() - startTime;
		const progress = Math.min(elapsed / duration, 1);
		
		// Ease function (cubic)
		const ease = 1 - Math.pow(1 - progress, 3);
		
		// Update camera position
		camera.position.x = startPosition.x + (targetPosition.x - startPosition.x) * ease;
		camera.position.y = startPosition.y + (targetPosition.y - startPosition.y) * ease;
		camera.position.z = startPosition.z + (targetPosition.z - startPosition.z) * ease;
		
		// Update controls target
		controls.target.x = startLookAt.x + (lookAt.x - startLookAt.x) * ease;
		controls.target.y = startLookAt.y + (lookAt.y - startLookAt.y) * ease;
		controls.target.z = startLookAt.z + (lookAt.z - startLookAt.z) * ease;
		
		// Update controls
		controls.update();
		
		// Force renderer update
		if (renderer && scene) {
			renderer.render(scene, camera);
		}
		
		// Continue animation if not done
		if (progress < 1) {
			requestAnimationFrame(animateCamera);
		}
	}
	
	// Start animation
	animateCamera();
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
 * Helper function to add a chess piece to the board
 */
function addChessPiece(board, pieceCode, x, y) {
	// Check if position is valid
	if (x >= 0 && x < board.length && y >= 0 && y < board.length) {
		// Ensure there's a board cell at this position (not empty)
		const cellType = board[y][x];
		if (cellType === 0) {
			// Create a cell for this piece
			const player = Math.floor(pieceCode / 10);
			board[y][x] = player;
		}
		
		// Place the chess piece
		board[y][x] = pieceCode;
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
 * Creates a board with floating islands in the sky
 * @param {THREE.Group} boardGroup - Group to add board cells to
 */
export function createBoard(boardGroup) {
	console.log('Creating floating islands based on received game state...');
	
	// Safety check for null boardGroup
	if (!boardGroup) {
		console.error('Cannot create board: boardGroup is undefined');
		return;
	}
	
	// Clear any existing board content
	while (boardGroup.children.length > 0) {
		boardGroup.remove(boardGroup.children[0]);
	}
	
	// Get board dimensions from game state
	const boardSize = gameState.boardSize || 16;
	
	// Create materials for cells - use more natural colors
	const whiteMaterial = new THREE.MeshStandardMaterial({ 
		color: 0xf5f5f5,
		roughness: 0.8,
		metalness: 0.1
	});
	
	const darkMaterial = new THREE.MeshStandardMaterial({ 
		color: 0x3a3a3a,
		roughness: 0.7, 
		metalness: 0.2
	});
	
	// Check if there's board data
	const hasBoardData = gameState.board && 
						typeof gameState.board === 'object' && 
						gameState.board.cells && 
						Object.keys(gameState.board.cells).length > 0;
	
	console.log(`Creating board with size ${boardSize}. Has board data: ${hasBoardData} (${hasBoardData ? Object.keys(gameState.board.cells).length : 0} cells)`);
	
	// ONLY create cells where there's data
	if (hasBoardData) {
		// Track count for logging
		let createdCellCount = 0;
		
		// Create cells based on actual board data
		for (const key in gameState.board.cells) {
			const [x, z] = key.split(',').map(Number);
			const cell = gameState.board.cells[key];
			
			// Only create a cell if there's content
			if (cell !== null && cell !== undefined) {
				const material = (x + z) % 2 === 0 ? whiteMaterial : darkMaterial;
				createFloatingCube(x, z, material);
				createdCellCount++;
			}
		}
		
		console.log(`Created ${createdCellCount} board cells based on data`);
	} else {
		// If no board data, create a default checkerboard grid for testing
		console.warn("No board data available, creating default test board");
		for (let z = 0; z < boardSize; z++) {
			for (let x = 0; x < boardSize; x++) {
				// Create a sparse test board
				if ((x + z) % 3 === 0) {
					const material = (x + z) % 2 === 0 ? whiteMaterial : darkMaterial;
					createFloatingCube(x, z, material);
				}
			}
		}
	}
}

/**
 * Utility function to hide all loading elements
 */
function hideAllLoadingElements() {
	console.log("Forcibly hiding all loading elements");
	
	// Hide loading screen
	const loadingElement = document.getElementById('loading');
	if (loadingElement) {
		loadingElement.style.display = 'none';
	}
	
	// Remove loading indicator
	const loadingIndicator = document.getElementById('loading-indicator');
	if (loadingIndicator && loadingIndicator.parentNode) {
		loadingIndicator.parentNode.removeChild(loadingIndicator);
	}
	
	// Hide any other loading elements
	const elements = document.querySelectorAll('[id*="loading"]');
	elements.forEach(el => {
		el.style.display = 'none';
	});
}

/**
 * Create a single floating cube cell at the given position
 * @param {number} x - X position
 * @param {number} z - Z position
 * @param {THREE.Material} material - Material to use for the cell
 * @returns {THREE.Mesh} The created cell
 */
function createFloatingCube(x, z, material) {
	try {
		// Create a cube for the cell
		const cellGeometry = new THREE.BoxGeometry(0.9, 0.9, 0.9);
		const cellMesh = new THREE.Mesh(cellGeometry, material);
		
		// Position the cell at its grid coordinates - perfectly aligned
		cellMesh.position.set(x, 0, z);
		
		// Ensure no rotation at all - critical to prevent board from becoming tilted
		cellMesh.rotation.set(0, 0, 0);
		
		// Mark it as a board cell to prevent it from being animated
		cellMesh.userData = {
			type: 'cell',
			position: { x, z },
			isWhite: (x + z) % 2 === 0,
			isStatic: true // Indicates this should not be rotated or bobbed
		};
		
		// Add shadows
		cellMesh.castShadow = true;
		cellMesh.receiveShadow = true;
		
		// Add to board group
		boardGroup.add(cellMesh);
		
		return cellMesh;
	} catch (error) {
		console.error(`Error creating floating cube at (${x}, ${z}):`, error);
		return null;
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
 * Move the current tetromino horizontally
 * @param {number} dir - Direction (-1 for left, 1 for right)
 * @returns {boolean} - Whether the move was successful
 */
function moveTetrominoHorizontal(dir) {
	if (!gameState.currentTetromino) return false;
	
	// Make a copy of the current position
	const newPos = { 
		x: gameState.currentTetromino.position.x + dir, 
		z: gameState.currentTetromino.position.z 
	};
	
	// Check if the move would be valid
	if (legacy_isValidTetrominoPosition(gameState.currentTetromino.shape, newPos)) {
		// Update position
		gameState.currentTetromino.position = newPos;
		return true;
	}
	
	return false;
}

/**
 * Move the current tetromino vertically
 * @param {number} dir - Direction (-1 for up, 1 for down)
 * @returns {boolean} - Whether the move was successful
 */
function moveTetrominoVertical(dir) {
	if (!gameState.currentTetromino) return false;
	
	// Make a copy of the current position - IMPORTANT: For the board, Z is the "vertical" direction
	const newPos = { 
		x: gameState.currentTetromino.position.x, 
		z: gameState.currentTetromino.position.z + dir 
	};
	
	// Check if the move would be valid
	if (legacy_isValidTetrominoPosition(gameState.currentTetromino.shape, newPos)) {
		// Update position
		gameState.currentTetromino.position = newPos;
		return true;
	}
	
	return false;
}

/**
 * Check if a tetromino position is valid (no collisions)
 * @param {Array} shape - 2D array representing tetromino shape
 * @param {Object} position - Position {x, z}
 * @returns {boolean} - Whether the position is valid
 */
function legacy_isValidTetrominoPosition(shape, position) {
	// Use boardFunctions version instead
	return boardFunctions.isValidTetrominoPosition(gameState, shape, position);
}

/**
 * Rotate the current tetromino
 * @param {number} dir - Direction (1 for clockwise, -1 for counterclockwise)
 * @returns {boolean} - Whether the rotation was successful
 */
function rotateTetromino(dir) {
	if (!gameState.currentTetromino) return false;
	
	// Make a copy of the current shape
	const currentShape = gameState.currentTetromino.shape;
	const size = currentShape.length;
	
	// Create a new rotated shape
	const newShape = [];
	for (let i = 0; i < size; i++) {
		newShape.push(new Array(size).fill(0));
	}
	
	// Rotate the shape matrix
	for (let z = 0; z < size; z++) {
		for (let x = 0; x < size; x++) {
			if (dir === 1) { // Clockwise
				newShape[x][size - 1 - z] = currentShape[z][x];
			} else { // Counterclockwise
				newShape[size - 1 - x][z] = currentShape[z][x];
			}
		}
	}
	
	// Check if the rotated position is valid
	if (legacy_isValidTetrominoPosition(newShape, gameState.currentTetromino.position)) {
		// Update shape
		gameState.currentTetromino.shape = newShape;
		return true;
	}
	
	return false;
}

/**
 * Hard drop the current tetromino to the lowest valid position
 */
function hardDropTetromino() {
	if (!gameState.currentTetromino) return;
	
	// Keep moving down until we hit something
	let moved = true;
	while (moved) {
		moved = moveTetrominoVertical(1);
	}
	
	// Play drop animation
	showDropAnimation();
	
	// Now place the tetromino with enhanced functionality
	enhancedPlaceTetromino();
}

/**
 * Place the current tetromino on the board
 */
function legacy_placeTetromino() {
	// Use boardFunctions version instead
	if (gameState.currentTetromino) {
		boardFunctions.placeTetromino(
			gameState, 
			showPlacementEffect, 
			updateGameStatusDisplay, 
			updateBoardVisuals
		);
	}
}

/**
 * Enhanced version of tetromino placement with server integration
 */
function enhancedPlaceTetromino() {
	if (!gameState.currentTetromino) return;
	
	try {
		// Clone the current tetromino for sending to server
		const tetrominoData = {
			type: gameState.currentTetromino.type,
			shape: gameState.currentTetromino.shape,
			position: { ...gameState.currentTetromino.position },
			player: gameState.currentPlayer
		};
		
		// Check if we can place the tetromino
		// First check if adjacent to existing cells (unless it's the first player's first piece)
		let isPlayerFirstPiece = false;
		
		// Count existing cells for the current player
		const playerCellCount = Object.values(gameState.board.cells || {})
			.filter(cell => cell && cell.player === gameState.currentPlayer)
			.length;
		
		if (playerCellCount === 0) {
			isPlayerFirstPiece = true;
		}
		
		if (!isPlayerFirstPiece && !legacy_isTetrominoAdjacentToExistingCells(
			gameState.currentTetromino.shape,
			gameState.currentTetromino.position.x,
			gameState.currentTetromino.position.z
		)) {
			console.log('Tetromino must be adjacent to existing cells');
			showToastMessage('Tetromino must be adjacent to existing cells');
			
			// Show explosion and proceed to chess phase
			showExplosionAnimation(
				gameState.currentTetromino.position.x,
				gameState.currentTetromino.position.z
			);
			
			// Clear the current tetromino
			gameState.currentTetromino = null;
			
			// Clear existing tetromino group
			while (tetrominoGroup.children.length > 0) {
				tetrominoGroup.remove(tetrominoGroup.children[0]);
			}
			
			// Switch to chess phase
			gameState.turnPhase = 'chess';
			updateGameStatusDisplay();
			
			return;
		}
		
		// Send tetromino placement to server
		sendTetrominoPlacementToServer(tetrominoData);
		
	} catch (error) {
		console.error('Error placing tetromino:', error);
		showToastMessage('Error placing tetromino');
	}
}

/**
 * Check if a tetromino is adjacent to existing cells (for valid placement)
 * @param {Array} shape - 2D array representing tetromino shape
 * @param {number} posX - X position
 * @param {number} posZ - Z position
 * @returns {boolean} - Whether the tetromino is adjacent to existing cells
 */
function legacy_isTetrominoAdjacentToExistingCells(shape, posX, posZ) {
	// Use boardFunctions version instead
	return boardFunctions.isTetrominoAdjacentToExistingCells(gameState, shape, posX, posZ);
}

/**
 * Check collision between tetromino and board or boundary
 * @param {Array} shape - Tetromino shape
 * @param {number} posX - X position
 * @param {number} posZ - Z position
 * @returns {boolean} - Whether there is a collision
 */
function legacy_checkTetrominoCollision(shape, posX, posZ) {
	// Use boardFunctions version instead
	return boardFunctions.checkTetrominoCollision(gameState, shape, posX, posZ);
}

/**
 * Update board cell incrementally (for animations or live updates)
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @param {*} value - Value to set
 */
function legacy_updateBoardCell(x, z, value) {
	// Use boardFunctions version instead
	boardFunctions.updateBoardCell(gameState, x, z, value);
}

/**
 * Show drop animation for hard drops
 */
function showDropAnimation() {
	if (!gameState.currentTetromino) return;
	
	// Create animation element
	const animElement = document.createElement('div');
	animElement.style.position = 'fixed';
	animElement.style.top = '50%';
	animElement.style.left = '50%';
	animElement.style.transform = 'translate(-50%, -50%)';
	animElement.style.color = 'white';
	animElement.style.fontSize = '48px';
	animElement.style.fontWeight = 'bold';
	animElement.style.textShadow = '0 0 10px rgba(0,255,0,0.8)';
	animElement.style.zIndex = '1000';
	animElement.style.pointerEvents = 'none';
	animElement.style.opacity = '0';
	animElement.style.transition = 'all 0.3s';
	animElement.textContent = 'LOCKED!';
	
	document.body.appendChild(animElement);
	
	// Animation sequence
	setTimeout(() => { 
		animElement.style.opacity = '1';
		animElement.style.fontSize = '72px';
	}, 50);
	
	setTimeout(() => {
		animElement.style.opacity = '0';
	}, 400);
	
	setTimeout(() => {
		document.body.removeChild(animElement);
	}, 700);
}

/**
 * Show explosion animation for tetromino collisions
 * @param {number} x - X position
 * @param {number} z - Z position
 */
function showExplosionAnimation(x, z) {
	// Create particle group
	const particleGroup = new THREE.Group();
	scene.add(particleGroup);
	
	// Create particles
	const particleCount = 30;
	for (let i = 0; i < particleCount; i++) {
		const size = Math.random() * 0.3 + 0.1;
		const geometry = new THREE.BoxGeometry(size, size, size);
		const material = new THREE.MeshBasicMaterial({
			color: new THREE.Color().setHSL(Math.random(), 0.8, 0.6),
			transparent: true,
			opacity: 0.8
		});
		
		const particle = new THREE.Mesh(geometry, material);
		particle.position.set(
			x + Math.random() * 3 - 1.5,
			Math.random() * 2 + 0.5,
			z + Math.random() * 3 - 1.5
		);
		
		// Add velocity for animation
		particle.userData.velocity = {
			x: Math.random() * 0.2 - 0.1,
			y: Math.random() * 0.3 + 0.1,
			z: Math.random() * 0.2 - 0.1
		};
		
		particleGroup.add(particle);
	}
	
	// Animate the explosion
	let lifetime = 0;
	const animate = () => {
		lifetime++;
		
		// Update particles
		particleGroup.children.forEach(particle => {
			// Apply velocity
			particle.position.x += particle.userData.velocity.x;
			particle.position.y += particle.userData.velocity.y;
			particle.position.z += particle.userData.velocity.z;
			
			// Apply gravity
			particle.userData.velocity.y -= 0.01;
			
			// Fade out
			if (particle.material) {
				particle.material.opacity = 0.8 * (1 - lifetime/30);
			}
		});
		
		// Continue animation if not done
		if (lifetime < 30) {
			requestAnimationFrame(animate);
		} else {
			// Remove particles
			scene.remove(particleGroup);
		}
	};
	
	// Start animation
	animate();
}

/**
 * Send tetromino placement to server
 * @param {Object} tetrominoData - Tetromino data to send
 */
function sendTetrominoPlacementToServer(tetrominoData) {
	console.log('Sending tetromino placement to server:', tetrominoData);
	
	// Check if connected to the network
	if (!NetworkManager.isConnected()) {
		console.warn('Not connected to server. Continuing with local placement only.');
		// Still continue with the local placement
		return Promise.resolve({ success: true });
	}
	
	// Debug gameId and playerId
	const gameId = NetworkManager.getGameId();
	const playerId = NetworkManager.getPlayerId();
	
	console.log(`Debug - gameId: ${gameId}, playerId: ${playerId}`);
	
	// If gameId is missing, try to join a game first
	if (!gameId) {
		console.log('No gameId detected, attempting to join/create a game first');
		return NetworkManager.joinGame()
			.then(gameData => {
				console.log('Joined game:', gameData);
				// Force update of gameId in the NetworkManager if needed
				if (gameData && gameData.gameId) {
					console.log('Setting gameId manually:', gameData.gameId);
					// Check if NetworkManager has an updateGameId method, if not this is a no-op
					if (typeof NetworkManager.updateGameId === 'function') {
						NetworkManager.updateGameId(gameData.gameId);
					}
				}
				// Now try again with the newly joined game
				return NetworkManager.submitTetrominoPlacement(tetrominoData);
			})
			.then(response => {
				if (response && response.success) {
					console.log('Server accepted tetromino placement after joining game');
					return response;
				} else {
					console.error('Server rejected tetromino placement after joining game:', response);
					// Instead of throwing an error, return a rejection object
					return { success: false, reason: 'rejected' };
				}
			})
			.catch(error => {
				console.error('Error connecting to server during tetromino placement:', error);
				// Connection error - reject with error
				throw error;
			});
	}
	
	// Ensure pieceType is set properly - this is what the server expects
	const modifiedData = {
		...tetrominoData,
		pieceType: tetrominoData.type // Add pieceType property matching the type
	};
	
	console.log('Modified tetromino data for server:', modifiedData);
	
	// Return a promise
	return NetworkManager.submitTetrominoPlacement(modifiedData)
		.then(response => {
			if (response && response.success) {
				console.log('Server accepted tetromino placement');
				return response;
			} else {
				console.error('Server rejected tetromino placement:', response);
				// Instead of throwing an error, return a rejection object
				return { success: false, reason: 'rejected' };
			}
		})
		.catch(error => {
			console.error('Error sending tetromino placement to server:', error);
			// Connection error - reject with error
			throw error;
		});
}


/**
 * Show an effect when a tetromino is placed
 * @param {number} x - X position
 * @param {number} z - Z position
 */
function showPlacementEffect(x, z) {
	// Create simple particles at the placement location
	const particleCount = 20;
	const particleGroup = new THREE.Group();
	scene.add(particleGroup);
	
	// Create particles
	for (let i = 0; i < particleCount; i++) {
		const size = Math.random() * 0.2 + 0.1;
		const geometry = new THREE.BoxGeometry(size, size, size);
		const material = new THREE.MeshBasicMaterial({
			color: 0xFFFFFF,
			transparent: true,
			opacity: 0.8
		});
		
		const particle = new THREE.Mesh(geometry, material);
		particle.position.set(
			x + Math.random() * 3 - 1.5,
			0.5,
			z + Math.random() * 3 - 1.5
		);
		
		// Add velocity
		particle.userData.velocity = {
			x: (Math.random() - 0.5) * 0.2,
			y: Math.random() * 0.3 + 0.1,
			z: (Math.random() - 0.5) * 0.2
		};
		
		particleGroup.add(particle);
	}
	
	// Animate particles
	let lifetime = 0;
	const animate = () => {
		lifetime += 1;
		
		// Update particles
		particleGroup.children.forEach(particle => {
			particle.position.x += particle.userData.velocity.x;
			particle.position.y += particle.userData.velocity.y;
			particle.position.z += particle.userData.velocity.z;
			
			// Apply gravity
			particle.userData.velocity.y -= 0.01;
			
			// Fade out
			if (particle.material) {
				particle.material.opacity = 0.8 * (1 - lifetime/30);
			}
		});
		
		// Continue animation if not done
		if (lifetime < 30) {
			requestAnimationFrame(animate);
		} else {
			// Remove particles
			scene.remove(particleGroup);
		}
	};
	
	// Start animation
	animate();
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
	
	// Track FPS for performance monitoring
	let frameCount = 0;
	let lastFpsUpdate = performance.now();
	
	// Frame limiting
	const TARGET_FRAMERATE = gameState.performanceMode ? 20 : 30; // Lower target in performance mode
	const FRAME_TIME = 1000 / TARGET_FRAMERATE;
	let lastFrameTime = 0;
	
	// Flag to track if clouds are in camera view (initialized here, used in animate)
	let cloudsInView = true;
	
	// Animation loop function
	function animate() {
		// Calculate time since last frame
		const now = performance.now();
		const elapsed = now - lastFrameTime;
		
		// Request next frame immediately to queue it properly
		const animationFrameId = requestAnimationFrame(animate);
		
		// Frame limiting to prevent too frequent updates
		if (elapsed < FRAME_TIME - 1) {
			return; // Skip this frame if we're running too fast
		}
		lastFrameTime = now;
		
		// Calculate delta time
		const deltaTime = Math.min((now - lastTime) / 1000, 0.1); // Convert to seconds, cap at 100ms
		lastTime = now;
		
		// FPS counter
		frameCount++;
		if (now - lastFpsUpdate >= 1000) {
			const fps = Math.round((frameCount * 1000) / (now - lastFpsUpdate));
			console.debug(`FPS: ${fps}`);
			
			// Monitor performance and take action if needed
			monitorPerformance(fps);
			
			frameCount = 0;
			lastFpsUpdate = now;
		}
		
		// Check if clouds are visible (only every 1s to save performance)
		if (!gameState._lastCloudCheck || now - gameState._lastCloudCheck > 1000) {
			// Simple check - just see if camera is pointing somewhat downward
			cloudsInView = camera.rotation.x < 0.3;
			gameState._lastCloudCheck = now;
		}
		
		// Update controls if available (only when needed)
		if (controls && controls.enabled) {
			controls.update();
		}
		
		// Animate clouds but ensure the board stays fixed - every frame
		// Only animate clouds if they're in view
		if (cloudsInView && typeof animateClouds === 'function') {
			animateClouds(scene);
		}
		
		// Only update LOD periodically to improve performance
		if (now - lastLODUpdate > LOD_UPDATE_INTERVAL) {
			updateChessPiecesLOD();
			lastLODUpdate = now;
		}
		
		// Only update game logic periodically to improve performance
		if (now - lastGameLogicUpdate > GAME_LOGIC_INTERVAL) {
			updateGameLogic(deltaTime * (GAME_LOGIC_INTERVAL / 1000));
			lastGameLogicUpdate = now;
		}
		
		// Render the scene (every frame)
		renderer.render(scene, camera);
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
 * Position camera based on home zone data
 */
function resetCameraBasedOnHomeZone() {
	if (!camera || !controls) return;
	
	// Default position in case we can't find home zone
	let targetPosition = { x: 5, y: 15, z: 25 };
	let lookAt = { x: 5, y: 0, z: 12 };
	
	// Try to find the player's home zone
	if (gameState.homeZones && Object.keys(gameState.homeZones).length > 0) {
		// Get player ID if possible
		const playerId = NetworkManager.getPlayerId ? NetworkManager.getPlayerId() : null;
		let homeZone = null;
		
		if (playerId) {
			// Look for player's home zone
			for (const [id, zone] of Object.entries(gameState.homeZones)) {
				if (id === playerId || id.includes(playerId)) {
					homeZone = zone;
					break;
				}
			}
		}
		
		// If no matching zone found, use first one
		if (!homeZone) {
			homeZone = Object.values(gameState.homeZones)[0];
		}
		
		if (homeZone) {
			// Position camera at angle to home zone
			targetPosition = {
				x: homeZone.x - 5,
				y: 15,
				z: homeZone.z + 10
			};
			
			lookAt = {
				x: homeZone.x + (homeZone.width ? homeZone.width/2 : 2),
				y: 0,
				z: homeZone.z + (homeZone.height ? homeZone.height/2 : 2)
			};
			
			console.log('Positioning camera based on home zone:', homeZone);
		}
	}
	
	// Animate camera movement
	animateCamera(targetPosition, lookAt);
}

/**
 * Position camera at default position
 */
function positionCameraDefault() {
	if (!camera || !controls) return;
	
	const targetPosition = { x: 8, y: 20, z: 25 };
	const lookAt = { x: 0, y: 0, z: 0 };
	
	// Animate camera movement
	animateCamera(targetPosition, lookAt);
}

/**
 * Animate camera to target position
 * @param {Object} targetPosition - Target camera position
 * @param {Object} lookAt - Target look-at point
 */
function animateCamera(targetPosition, lookAt) {
	// Get current position
	const startPosition = {
		x: camera.position.x,
		y: camera.position.y,
		z: camera.position.z
	};
	
	// Get current look-at
	const startLookAt = controls.target.clone();
	
	// Animation duration
	const duration = 2000; // 2 seconds
	const startTime = Date.now();
	
	// Animate camera movement
	function animate() {
		const elapsed = Date.now() - startTime;
		const progress = Math.min(elapsed / duration, 1);
		
		// Ease function (cubic)
		const ease = 1 - Math.pow(1 - progress, 3);
		
		// Update camera position
		camera.position.x = startPosition.x + (targetPosition.x - startPosition.x) * ease;
		camera.position.y = startPosition.y + (targetPosition.y - startPosition.y) * ease;
		camera.position.z = startPosition.z + (targetPosition.z - startPosition.z) * ease;
		
		// Update controls target
		controls.target.x = startLookAt.x + (lookAt.x - startLookAt.x) * ease;
		controls.target.y = startLookAt.y + (lookAt.y - startLookAt.y) * ease;
		controls.target.z = startLookAt.z + (lookAt.z - startLookAt.z) * ease;
		
		// Update controls
		controls.update();
		
		// Force renderer update
		if (renderer && scene) {
			renderer.render(scene, camera);
		}
		
		// Continue animation if not done
		if (progress < 1) {
			requestAnimationFrame(animate);
		}
	}
	
	// Start animation
	animate();
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
			resetCameraForGameplay(true, true); // Force immediate update
		}
		
		// Update player list
		const players = gameData.players || data.players;
		if (players) {
			console.log('Players received:', players);
			
			// Update local game state players
			gameState.players = players;
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
 * Update game ID display
 * @param {string} gameId - Game ID
 */
function updateGameIdDisplay(gameId) {
	const gameIdDisplay = document.getElementById('game-id-display');
	if (gameIdDisplay) {
		gameIdDisplay.value = gameId;
	}
}

/**
 * Update the board state based on server data
 * @param {Object} boardData - Sparse board structure with cells and boundaries
 */
function updateBoardState(boardData) {
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
	
	// Update gameState.board with the received data
	gameState.board = boardData;
	
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
	
	// Force recreation of the board - this is critical for rendering
	if (boardGroup) {
		console.log("Clearing existing board group");
		while (boardGroup.children.length > 0) {
			boardGroup.remove(boardGroup.children[0]);
		}
		
		// Create new board cells
		console.log("Creating new board with received data");
		createBoard(boardGroup);
	} else {
		console.error("boardGroup not available, can't recreate board");
	}
	
	// Force a render to update the scene
	if (renderer && scene && camera) {
		renderer.render(scene, camera);
	}
}

/**
 * Update board visual representation
 */
function updateBoardVisuals() {
	// Clear existing tetrominos and chess pieces
	while (tetrominoGroup.children.length > 0) {
		tetrominoGroup.remove(tetrominoGroup.children[0]);
	}
	
	// Don't clear chess pieces here - updateChessPieces will handle them separately
	
	// Create base board cells first
	createBoardCells();
	
	// Check if we have valid board data
	if (!gameState.board || typeof gameState.board !== 'object' || !gameState.board.cells) {
		console.warn('No board data to visualize');
		return;
	}
	
	// Debug output of the actual board structure
	console.log('Board structure sample:', 
		gameState.board.cells ? `${Object.keys(gameState.board.cells).length} cells` : 'Empty');
	
	// Initialize chess pieces array if needed or reset it if empty
	if (!gameState.chessPieces || !gameState.chessPieces.length) {
		gameState.chessPieces = [];
	}
	
	// Create visuals for each cell
	for (const key in gameState.board.cells) {
		const [x, z] = key.split(',').map(Number);
		const cellType = gameState.board.cells[key];
		
		// Skip empty cells
		if (cellType === null || cellType === undefined) continue;
		
		// Process based on cell type
		if (typeof cellType === 'object' && cellType !== null) {
			console.log('Cell type:', cellType);
			// Handle object-based cell data
			if (cellType.type === 'chess') {
				// Chess piece - add it to gameState.chessPieces for separate handling
				if (cellType.chessPiece) {
					// Check if this piece is already in the array
					const existingIndex = gameState.chessPieces.findIndex(p => 
						p.position && p.position.x === x && p.position.z === z);
					
					if (existingIndex === -1) {
						// Add new piece to the array
						const pieceData = {
							id: cellType.chessPiece.id,
							position: { x, z },
							type: cellType.chessPiece.type || "PAWN",
							player: cellType.player || cellType.chessPiece.player || 1,
							color: cellType.color || cellType.chessPiece.color
						};
						gameState.chessPieces.push(pieceData);
					} else {
						// Update existing piece
						gameState.chessPieces[existingIndex] = {
							...gameState.chessPieces[existingIndex],
							id: cellType.chessPiece.id,
							position: { x, z },
							type: cellType.chessPiece.type || "PAWN",
							player: cellType.player || cellType.chessPiece.player || 1,
							color: cellType.color || cellType.chessPiece.color
						};
					}
				}
			} else if (cellType.type === 'tetromino') {
				// Tetromino block
				createTetrominoBlock(x, z, cellType.player || 1);
			} else if (cellType.type === 'homeZone') {
				// Home zone
				const zoneType = (cellType.player + 5);
				updateHomeZoneVisual(x, z, zoneType);
			}
		} else if (typeof cellType === 'number') {
			// Handle legacy numeric cell types
			if (cellType >= 1 && cellType <= 5) {
				// Player tetromino placements - create block
				createTetrominoBlock(x, z, cellType);
			} else if (cellType >= 6 && cellType <= 10) {
				// Home zones - add visual indicator
				updateHomeZoneVisual(x, z, cellType);
			} else if (cellType >= 11) {
				// Chess pieces - add to chessPieces array for separate handling
				const player = Math.floor(cellType / 10);
				const pieceType = cellType % 10;
				
				// Check if piece already exists in the array
				const existingIndex = gameState.chessPieces.findIndex(p => 
					p.position && p.position.x === x && p.position.z === z);
				
				if (existingIndex === -1) {
					// Add new piece to the array
					gameState.chessPieces.push({
						position: { x, z },
						type: pieceType,
						player: player
					});
				} else {
					// Update existing piece
					gameState.chessPieces[existingIndex] = {
						position: { x, z },
						type: pieceType,
						player: player
					};
				}
			}
		}
	}
	
	console.log(`After board processing, we have ${gameState.chessPieces?.length || 0} chess pieces to display`);
	
	// Now that we've processed the board, update chess pieces
	if (gameState.chessPieces && gameState.chessPieces.length > 0) {
		// Force the chess pieces to be recreated by calling the main update function
		updateChessPieces();
	} else {
		console.warn("No chess pieces found to display");
	}
	
	// If we're in tetris phase and have a current tetromino, render it
	if (gameState.turnPhase === 'tetris' && gameState.currentTetromino) {
		renderTetromino(gameState.currentTetromino);
	}
}

/**
 * Handle tetris phase debug click
 */
function handleTetrisPhaseClick() {
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
function handleChessPhaseClick() {
	gameState.turnPhase = 'chess';
	
	// Force refresh piece visibility
	updateGameStatusDisplay();
	
	// Make sure pieces are shown/hidden correctly
	updateBoardVisuals();
	
	console.log("Debug: Switched to CHESS phase");
}

/**
 * Create a base grid of board cells
 */
function legacy_createBoardCells() {
	// Use boardFunctions version instead
	boardFunctions.createBoardCells(gameState, boardGroup, createFloatingIsland, THREE);
}

/**
 * Create a chess piece visualization
 * @param {number} x - X position
 * @param {number} z - Z position
 * @param {string|number} pieceType - Chess piece type (string like 'PAWN' or number)
 * @param {number} playerIdent - Player identifier 
 * @param {number} ourPlayerIdent - Our player identifier
 */
function legacy_createChessPiece(x, z, pieceType, playerIdent, ourPlayerIdent) {
	// Use boardFunctions version instead
	return boardFunctions.createChessPiece(gameState, x, z, pieceType, playerIdent, ourPlayerIdent, undefined, THREE);
}

/**
 * Update home zone visual indication
 * @param {number} x - X position
 * @param {number} z - Z position
 * @param {number} zoneType - Home zone type (6-10)
 */
function updateHomeZoneVisual(x, z, zoneType) {
	// Create a thin plate to indicate home zone
	const zoneGeometry = new THREE.PlaneGeometry(0.95, 0.95);
	
	// Get material based on zone type (subtracting 5 to get player index 1-5)
	const playerType = zoneType - 5;
	
	// Use home zone texture if available
	let zoneMaterial;
	if (textures.cells[zoneType]) {
		zoneMaterial = new THREE.MeshStandardMaterial({ 
			map: textures.cells[zoneType],
			transparent: true,
			opacity: 0.7,
			side: THREE.DoubleSide
		});
	} else {
		// Fallback to color
		const color = PLAYER_COLORS[playerType] || 0xcccccc;
		zoneMaterial = new THREE.MeshStandardMaterial({ 
			color: color,
			transparent: true,
			opacity: 0.5,
			side: THREE.DoubleSide
		});
	}
	
	// Create zone mesh - use absolute coordinates
	const zone = new THREE.Mesh(zoneGeometry, zoneMaterial);
	zone.rotation.x = -Math.PI / 2; // Lay flat on the board
	zone.position.set(x, 0.05, z); // Just above the cell
	
	// Add to board group
	boardGroup.add(zone);
}

/**
 * Create a chess piece visualization
 * @param {number} x - X position
 * @param {number} z - Z position
 * @param {string|number} pieceType - Chess piece type (string like 'PAWN' or number)
 * @param {number} playerIdent - Player identifier 
 * @param {number} ourPlayerIdent - Our player identifier
 */
function createChessPiece_old(x, z, pieceType, playerIdent, ourPlayerIdent) {
	try {
		// Get board center for correct positioning using boardBounds
		const minX = gameState.boardBounds?.minX || 0;
		const maxX = gameState.boardBounds?.maxX || 20;
		const minZ = gameState.boardBounds?.minZ || 0;
		const maxZ = gameState.boardBounds?.maxZ || 20;
		
		// Calculate board center (where 0,0 should be rendered)
		const centerX = (minX + maxX) / 2;
		const centerZ = (minZ + maxZ) / 2;
		
		// Verify parameters for debugging
		if (pieceType === undefined || pieceType === null) {
			console.warn(`Invalid pieceType (${pieceType}) for cell at (${x},${z}), using default`);
			pieceType = 'PAWN'; // Default to pawn
		}
		
		const pieceNames = ['PAWN', 'ROOK', 'KNIGHT', 'BISHOP', 'QUEEN', 'KING'];

		// Ensure string type for piece name
		let type;
		if (typeof pieceType === 'string') {
			type = pieceType.toUpperCase();
		} else if (typeof pieceType === 'number') {
			// Check if it's a legacy format (player*10 + type)
			if (pieceType > 10) {
				// Legacy format - extract type from combined code
				const extractedType = pieceType % 10;
				type = pieceNames[extractedType - 1] || 'PAWN';
			} else {
				// Direct numeric type (1=PAWN, 2=ROOK, etc.)
				type = pieceNames[pieceType - 1] || 'PAWN';
			}
		} else {
			type = 'PAWN'; // Default if unrecognized format
		}
		
		// Look for chess piece in cells to extract actual color
		let pieceColor;
		if (typeof x === 'number' && typeof z === 'number' && 
			gameState.board && gameState.board.cells) {
			const cellKey = `${x},${z}`;
			const cell = gameState.board.cells[cellKey];
			if (cell && cell.type === 'chess' && cell.color) {
				pieceColor = cell.color;
				console.log(`Found colour ${pieceColor} for piece at ${x},${z}`);
			}
		}
		
		// Map player identity to player number (1 or 2)
		const player = playerIdent === ourPlayerIdent ? 1 : 2;
		
		// Define colors for pieces - using traditional Russian chess colors
		const playerColors = {
			1: { // Our player - blue/gold theme
				primary: 0x0055AA,
				secondary: 0xFFD700
			},
			2: { // Opponent - red/gold theme
				primary: 0xAA0000,
				secondary: 0xFFD700
			}
		};
		
		// Get colors for this player
		let colors = playerColors[player];
		
		// Override primary color if we have a piece color from the cell
		if (pieceColor && typeof pieceColor === 'string' && pieceColor.startsWith('#')) {
			// Remove # and convert to number
			const colorHex = parseInt(pieceColor.substring(1), 16);
			colors = {
				primary: colorHex,
				secondary: 0xFFD700 // Keep gold for highlights
			};
		}
		
		// Create a piece group to hold all components
		const pieceGroup = new THREE.Group();
		
		// Position the group using the same coordinate system as the board cells
		pieceGroup.position.set(x - centerX, 0, z - centerZ);
		
		// Base of piece
		const baseGeometry = new THREE.CylinderGeometry(0.35, 0.4, 0.2, 16);
		const baseMaterial = new THREE.MeshStandardMaterial({
			color: colors.primary,
			metalness: 0.7,
			roughness: 0.3
		});
		const base = new THREE.Mesh(baseGeometry, baseMaterial);
		base.position.y = 0.1;
		pieceGroup.add(base);
		
		// Main body of piece - adjust based on type
		let height = 1.0; // Default height
		let bodyWidth = 0.3; // Default width
		
		// Customize for each piece type
		switch (type) {
			case 'KING':
				height = 1.6;
				bodyWidth = 0.35;
				break;
			case 'QUEEN':
				height = 1.5;
				bodyWidth = 0.32;
				break;
			case 'BISHOP':
				height = 1.4;
				bodyWidth = 0.28;
				break;
			case 'KNIGHT':
				height = 1.3;
				bodyWidth = 0.30;
				break;
			case 'ROOK':
				height = 1.2;
				bodyWidth = 0.35;
				break;
			default: // PAWN
				height = 1.0;
				bodyWidth = 0.25;
		}
		
		// Main body shape
		const bodyGeometry = new THREE.CylinderGeometry(bodyWidth * 0.8, bodyWidth, height * 0.7, 16);
		const bodyMaterial = new THREE.MeshStandardMaterial({
			color: colors.primary,
			metalness: 0.5,
			roughness: 0.5,
			emissive: colors.primary,
			emissiveIntensity: 0.2
		});
		const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
		body.position.y = height * 0.35 + 0.1; // Center the body
		pieceGroup.add(body);
		
		// Top part - different for each piece type
		let topPart;
		
		switch (type) {
			case 'KING':
				// Create Russian imperial crown with cross
				const crownGeometry = new THREE.CylinderGeometry(bodyWidth * 1.1, bodyWidth * 0.9, height * 0.2, 16);
				const crownMaterial = new THREE.MeshStandardMaterial({
					color: colors.secondary,
					metalness: 0.8,
					roughness: 0.2,
					emissive: colors.secondary,
					emissiveIntensity: 0.3
				});
				topPart = new THREE.Mesh(crownGeometry, crownMaterial);
				topPart.position.y = height * 0.7 + 0.1;
				pieceGroup.add(topPart);
				
				// Add cross on top
				const crossVGeometry = new THREE.BoxGeometry(0.08, height * 0.25, 0.08);
				const crossHGeometry = new THREE.BoxGeometry(0.25, 0.08, 0.08);
				const crossMaterial = new THREE.MeshStandardMaterial({
					color: colors.secondary,
					metalness: 0.9,
					roughness: 0.1,
					emissive: colors.secondary,
					emissiveIntensity: 0.3
				});
				
				const crossV = new THREE.Mesh(crossVGeometry, crossMaterial);
				crossV.position.y = height * 0.85;
				pieceGroup.add(crossV);
				
				const crossH = new THREE.Mesh(crossHGeometry, crossMaterial);
				crossH.position.y = height * 0.8;
				pieceGroup.add(crossH);
				break;
				
			case 'QUEEN':
				// Create Russian queen crown (smaller than king)
				const queenCrownGeometry = new THREE.CylinderGeometry(bodyWidth * 0.9, bodyWidth * 0.8, height * 0.15, 16);
				const queenCrownMaterial = new THREE.MeshStandardMaterial({
					color: colors.secondary,
					metalness: 0.8,
					roughness: 0.2,
					emissive: colors.secondary,
					emissiveIntensity: 0.3
				});
				topPart = new THREE.Mesh(queenCrownGeometry, queenCrownMaterial);
				topPart.position.y = height * 0.65 + 0.1;
				pieceGroup.add(topPart);
				
				// Add small sphere on top
				const sphereGeometry = new THREE.SphereGeometry(bodyWidth * 0.5, 16, 16);
				const sphereMaterial = new THREE.MeshStandardMaterial({
					color: colors.secondary,
					metalness: 0.8,
					roughness: 0.2,
					emissive: colors.secondary,
					emissiveIntensity: 0.3
				});
				const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
				sphere.position.y = height * 0.8;
				pieceGroup.add(sphere);
				break;
				
			case 'BISHOP':
				// Create bishop's mitre (hat) with orthodox styling
				const mitreGeometry = new THREE.ConeGeometry(bodyWidth * 0.9, height * 0.3, 16);
				const mitreMaterial = new THREE.MeshStandardMaterial({
					color: colors.primary,
					metalness: 0.6,
					roughness: 0.4,
					emissive: colors.primary,
					emissiveIntensity: 0.2
				});
				topPart = new THREE.Mesh(mitreGeometry, mitreMaterial);
				topPart.position.y = height * 0.7 + 0.1;
				pieceGroup.add(topPart);
				
				// Add small cross on top
				const bishopCrossVGeometry = new THREE.BoxGeometry(0.06, height * 0.2, 0.06);
				const bishopCrossHGeometry = new THREE.BoxGeometry(0.18, 0.06, 0.06);
				const bishopCrossMaterial = new THREE.MeshStandardMaterial({
					color: colors.secondary,
					metalness: 0.9,
					roughness: 0.1,
					emissive: colors.secondary,
					emissiveIntensity: 0.3
				});
				
				const bishopCrossV = new THREE.Mesh(bishopCrossVGeometry, bishopCrossMaterial);
				bishopCrossV.position.y = height * 0.9;
				pieceGroup.add(bishopCrossV);
				
				const bishopCrossH = new THREE.Mesh(bishopCrossHGeometry, bishopCrossMaterial);
				bishopCrossH.position.y = height * 0.85;
				pieceGroup.add(bishopCrossH);
				break;
				
			case 'KNIGHT':
				// Create knight with horse-head styling
				const knightHeadGeometry = new THREE.BoxGeometry(bodyWidth * 1.5, height * 0.2, bodyWidth * 2);
				const knightHeadMaterial = new THREE.MeshStandardMaterial({
					color: colors.primary,
					metalness: 0.6,
					roughness: 0.4,
					emissive: colors.primary,
					emissiveIntensity: 0.2
				});
				topPart = new THREE.Mesh(knightHeadGeometry, knightHeadMaterial);
				topPart.position.y = height * 0.7;
				topPart.position.z = bodyWidth * 0.6; // Shift head forward
				topPart.rotation.x = Math.PI / 6; // Tilt head down slightly
				pieceGroup.add(topPart);
				
				// Add mane
				const maneGeometry = new THREE.BoxGeometry(bodyWidth * 1.2, height * 0.15, bodyWidth * 0.6);
				const maneMaterial = new THREE.MeshStandardMaterial({
					color: colors.secondary,
					metalness: 0.7,
					roughness: 0.5,
					emissive: colors.secondary,
					emissiveIntensity: 0.2
				});
				const mane = new THREE.Mesh(maneGeometry, maneMaterial);
				mane.position.y = height * 0.72;
				mane.position.z = -bodyWidth * 0.2; // Shift mane back
				pieceGroup.add(mane);
				break;
				
			case 'ROOK':
				// Create Russian-style castle tower with onion dome
				const towerGeometry = new THREE.BoxGeometry(bodyWidth * 1.6, height * 0.3, bodyWidth * 1.6);
				const towerMaterial = new THREE.MeshStandardMaterial({
					color: colors.primary,
					metalness: 0.6,
					roughness: 0.4,
					emissive: colors.primary,
					emissiveIntensity: 0.2
				});
				topPart = new THREE.Mesh(towerGeometry, towerMaterial);
				topPart.position.y = height * 0.7;
				pieceGroup.add(topPart);
				
				// Add onion dome
				const domeGeometry = new THREE.SphereGeometry(bodyWidth * 0.8, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
				const domeMaterial = new THREE.MeshStandardMaterial({
					color: colors.secondary,
					metalness: 0.8,
					roughness: 0.2,
					emissive: colors.secondary,
					emissiveIntensity: 0.3
				});
				const dome = new THREE.Mesh(domeGeometry, domeMaterial);
				dome.position.y = height * 0.85;
				pieceGroup.add(dome);
				break;
				
			default: // PAWN
				// Create simple sphere top for pawn
				const pawnTopGeometry = new THREE.SphereGeometry(bodyWidth * 1.0, 16, 16);
				const pawnTopMaterial = new THREE.MeshStandardMaterial({
					color: colors.primary,
					metalness: 0.6,
					roughness: 0.4,
					emissive: colors.primary,
					emissiveIntensity: 0.2
				});
				topPart = new THREE.Mesh(pawnTopGeometry, pawnTopMaterial);
				topPart.position.y = height * 0.75;
				pieceGroup.add(topPart);
				
				// Add decorative band
				const bandGeometry = new THREE.TorusGeometry(bodyWidth * 0.9, bodyWidth * 0.15, 12, 16);
				const bandMaterial = new THREE.MeshStandardMaterial({
					color: colors.secondary,
					metalness: 0.8,
					roughness: 0.2,
					emissive: colors.secondary,
					emissiveIntensity: 0.2
				});
				const band = new THREE.Mesh(bandGeometry, bandMaterial);
				band.position.y = height * 0.6;
				band.rotation.x = Math.PI / 2;
				pieceGroup.add(band);
		}
		
		// Position the whole group to be centered on the cell and higher
		pieceGroup.position.y = 0.5;
		
		// Store piece info for raycasting
		pieceGroup.userData = {
			type: 'chessPiece',
			pieceType: type,
			player: player,
			position: { x, z },
			id: `${player}-${type}-${x}-${z}` // Add a unique ID to help with tracking
		};
		
		// Add to chess pieces group
		chessPiecesGroup.add(pieceGroup);
		
		return pieceGroup;
	} catch (error) {
		console.error(`Error creating chess piece at (${x},${z}) with type ${pieceType}:`, error);
		// Create a fallback piece using a simple red cube to show the error
		const errorGeometry = new THREE.BoxGeometry(0.8, 2.0, 0.8);
		const errorMaterial = new THREE.MeshBasicMaterial({ color: 0xFF0000 });
		const errorMesh = new THREE.Mesh(errorGeometry, errorMaterial);
		
		// Calculate board center for correct positioning
		const boardSize = gameState.boardSize || 30;
		const center = boardSize / 2 - 0.5;
		
		// Position the error mesh using the same coordinate system as cells
		errorMesh.position.set(x - center, 1.2, z - center);
		chessPiecesGroup.add(errorMesh);
		return errorMesh;
	}
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



/**
 * Update chess pieces based on game state
 */
function updateChessPieces() {
	console.log('Updating chess pieces visuals using external creator');
	
	// Clear existing chess pieces first
	while (chessPiecesGroup.children.length > 0) {
		const piece = chessPiecesGroup.children[0];
		// Dispose of the piece properly to prevent memory leaks
		if (window.disposeThreeObject) {
			window.disposeThreeObject(piece);
		}
		chessPiecesGroup.remove(piece);
	}
	
	// Extract pieces from board cells - this is the key change
	const extractedPieces = [];
	
	// Check if we have valid board data
	if (gameState.board && gameState.board.cells) {
		// Iterate through all cells to find chess pieces
		for (const key in gameState.board.cells) {
			const [x, z] = key.split(',').map(Number);
			const cell = gameState.board.cells[key];
			
			// Skip empty cells
			if (!cell) continue;
			
			// Process based on cell type
			if (typeof cell === 'object' && cell !== null) {
				// Handle object-based cell data
				if (cell.type === 'chess' && cell.chessPiece) {
					// Add chess piece to our list
					extractedPieces.push({
						id: cell.chessPiece.id || `${cell.player}-${cell.chessPiece.type}-${x}-${z}`,
						position: { x, z },
						type: cell.chessPiece.type || "PAWN",
						player: cell.player || cell.chessPiece.player || 1,
						color: cell.color || cell.chessPiece.color
					});
				}
			} else if (typeof cell === 'number' && cell >= 11) {
				// Handle legacy numeric cell types
				const player = Math.floor(cell / 10);
				const pieceType = cell % 10;
				
				// Add chess piece to our list
				extractedPieces.push({
					id: `${player}-${pieceType}-${x}-${z}`,
					position: { x, z },
					type: pieceType,
					player: player
				});
			}
		}
	}
	
	// Also add pieces from chessPieces array if they're not already on the board
	// This handles pieces that might have moved but aren't yet reflected in the board cells
	if (gameState.chessPieces && Array.isArray(gameState.chessPieces)) {
		for (const piece of gameState.chessPieces) {
			// Skip pieces with no position
			if (!piece || !piece.position) continue;
			
			// Check if this piece already exists in our extracted list by ID
			const existingPiece = extractedPieces.find(p => 
				p.id === piece.id || 
				(p.position.x === piece.position.x && p.position.z === piece.position.z)
			);
			
			if (!existingPiece) {
				extractedPieces.push({
					id: piece.id || `${piece.player}-${piece.type}-${piece.position.x}-${piece.position.z}`,
					position: piece.position,
					type: piece.type,
					player: piece.player,
					color: piece.color
				});
			}
		}
	}
	
	console.log(`Found ${extractedPieces.length} chess pieces to display`);
	
	// Debug output - log all extracted pieces
	if (extractedPieces.length > 0) {
		console.log("Chess pieces details:");
		extractedPieces.forEach((piece, index) => {
			if (index < 10) { // Limit to first 10 to avoid log spam
				console.log(`  Piece ${index}: type=${piece.type}, player=${piece.player}, pos=(${piece.position.x}, ${piece.position.z})`);
			}
		});
	}
	
	// Update gameState.chessPieces with our extracted list
	gameState.chessPieces = extractedPieces;
	
	// Get player identity
	const ourPlayerIdent = gameState.localPlayerId || NetworkManager.getPlayerId?.() || 1;
	
	// Get board center for debugging
	const minX = gameState.boardBounds?.minX || 0;
	const maxX = gameState.boardBounds?.maxX || 20;
	const minZ = gameState.boardBounds?.minZ || 0;
	const maxZ = gameState.boardBounds?.maxZ || 20;
	const centerX = (minX + maxX) / 2;
	const centerZ = (minZ + maxZ) / 2;
	console.log(`Board center is at (${centerX}, ${centerZ}), bounds: x=${minX}-${maxX}, z=${minZ}-${maxZ}`);
	
	// Create visuals for each chess piece
	let createdPieces = 0;
	for (const piece of extractedPieces) {
		try {
			const x = piece.position.x;
			const z = piece.position.z;
			
			// Create the chess piece using our external creator function
			const chessPiece = createExternalChessPiece(
				gameState,
				x, 
				z, 
				piece.type, 
				piece.player, 
				ourPlayerIdent
			);
			
			// Verify the piece was created successfully
			if (chessPiece) {
				// Set an ID on the piece for debugging
				chessPiece.name = `chess-${piece.player}-${piece.type}-${x}-${z}`;
				
				// Debug output piece position
				console.log(`Positioned piece at (${chessPiece.position.x}, ${chessPiece.position.y}, ${chessPiece.position.z})`);
				
				// Make the piece visible
				chessPiece.visible = true;
				
				// Add to our chess pieces group
				chessPiecesGroup.add(chessPiece);
				createdPieces++;
			}
		} catch (error) {
			console.error(`Error creating chess piece at (${piece.position.x}, ${piece.position.z})`, error);
		}
	}
	
	// Add debugging visual markers at board corners
	addBoardCornerMarkers();
	
	// Add group to scene if not already added
	if (!scene.getObjectById(chessPiecesGroup.id)) {
		scene.add(chessPiecesGroup);
	}
	
	// Make sure group is visible
	chessPiecesGroup.visible = true;
	
	console.log(`Created ${createdPieces} chess piece visuals out of ${extractedPieces.length} pieces`);
}

/**
 * Add visual markers at board corners for debugging
 */
function addBoardCornerMarkers() {
	// Get board boundaries
	const minX = gameState.boardBounds?.minX || 0;
	const maxX = gameState.boardBounds?.maxX || 20;
	const minZ = gameState.boardBounds?.minZ || 0;
	const maxZ = gameState.boardBounds?.maxZ || 20;
	
	// Calculate center (this is the 0,0 in the relative coordinate system)
	const centerX = (minX + maxX) / 2;
	const centerZ = (minZ + maxZ) / 2;
	
	// Create markers at corners
	const corners = [
		{ x: minX, z: minZ, color: 0x00ff00 }, // Green - min/min
		{ x: maxX, z: minZ, color: 0xff00ff }, // Magenta - max/min
		{ x: minX, z: maxZ, color: 0xffff00 }, // Yellow - min/max
		{ x: maxX, z: maxZ, color: 0x00ffff }  // Cyan - max/max
	];
	
	// Create a material for the markers
	corners.forEach(corner => {
		const markerGeometry = new THREE.SphereGeometry(0.3, 8, 8);
		const markerMaterial = new THREE.MeshBasicMaterial({ 
			color: corner.color,
			transparent: true,
			opacity: 0.7 
		});
		
		const marker = new THREE.Mesh(markerGeometry, markerMaterial);
		
		// Position in the RELATIVE coordinate system (relative to center)
		marker.position.set(
			corner.x - centerX,
			1.0, // Height above board
			corner.z - centerZ
		);
		
		// Add to chess pieces group so they're managed together
		chessPiecesGroup.add(marker);
		
		// Add a small text label
		const textGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
		const textMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
		const textMesh = new THREE.Mesh(textGeometry, textMaterial);
		textMesh.position.set(0, 0.5, 0); // Just above the marker
		marker.add(textMesh);
	});
	
	// Add a marker at the center (0,0) in relative coordinates
	const centerMarkerGeometry = new THREE.SphereGeometry(0.3, 8, 8);
	const centerMarkerMaterial = new THREE.MeshBasicMaterial({ 
		color: 0xff0000,
		transparent: true,
		opacity: 0.7 
	});
	
	const centerMarker = new THREE.Mesh(centerMarkerGeometry, centerMarkerMaterial);
	centerMarker.position.set(0, 1.0, 0); // At the origin of the relative coordinate system
	chessPiecesGroup.add(centerMarker);
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
		
		// Recreate the board with new size
		createBoard();
		
		// Request full state
		requestGameState();
		return;
	}
	
	// Update visuals for changed cells only
	updateBoardVisuals();
}

// Monitor FPS and trigger reset if performance is too low
function monitorPerformance(fps) {
	// Store last few FPS readings
	if (!gameState.fpsHistory) {
		gameState.fpsHistory = [];
	}
	
	// Add current reading
	gameState.fpsHistory.push(fps);
	
	// Keep only the last 10 readings
	if (gameState.fpsHistory.length > 10) {
		gameState.fpsHistory.shift();
	}
	
	// Calculate average FPS
	const averageFps = gameState.fpsHistory.reduce((sum, fps) => sum + fps, 0) / 
		gameState.fpsHistory.length;
	
	// Log performance stats without triggering a reset for now
	if (averageFps < 15) {
		console.warn(`Performance warning: Average FPS: ${averageFps.toFixed(1)}`);
		
		// Enable performance mode to reduce quality without full reset
		if (!gameState.performanceMode) {
			console.log("Enabling performance mode");
			gameState.performanceMode = true;
			
			// Apply additional optimizations
			if (renderer) {
				renderer.setPixelRatio(1.0); // Reduce to minimum
				renderer.shadowMap.enabled = false; // Disable shadows
			}
		}
	}
}

// Apply THREE.js optimizations
function applyThreeJsOptimizations() {
	if (!THREE) return;
	
	// Log optimization application
	console.log('Applying THREE.js performance optimizations');
	
	// Use shared materials where possible
	if (!window.sharedMaterials) {
		window.sharedMaterials = {};
	}
	
	// Disable shadow auto-update
	if (THREE.WebGLRenderer && renderer) {
		// Disable shadows completely for better performance
		renderer.shadowMap.enabled = false;
		
		// Lower rendering resolution
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // Lower pixel ratio limit
		
		// Turn off antialiasing if it's enabled
		if (renderer.getContext()) {
			try {
				renderer.getContext().getContextAttributes().antialias = false;
			} catch (e) {
				console.log("Unable to disable antialiasing dynamically");
			}
		}
		
		// Optimize rendering precision
		if (typeof THREE.SRGBColorSpace !== 'undefined') {
			renderer.outputColorSpace = THREE.SRGBColorSpace;
		} else if (typeof THREE.sRGBEncoding !== 'undefined') {
			renderer.outputEncoding = THREE.sRGBEncoding;
		}
		
		// Disable tone mapping
		if (typeof THREE.NoToneMapping !== 'undefined') {
			renderer.toneMapping = THREE.NoToneMapping;
		}
	}
	
	// Custom cleanup function instead of overriding prototype
	window.disposeThreeObject = function(obj) {
		if (!obj) return;
		
		// Dispose of geometries and materials
		if (obj.geometry) {
			obj.geometry.dispose();
		}
		
		if (obj.material) {
			if (Array.isArray(obj.material)) {
				obj.material.forEach(m => {
					if (m && m.map) m.map.dispose();
					if (m) m.dispose();
				});
			} else if (obj.material) {
				if (obj.material.map) obj.material.map.dispose();
				obj.material.dispose();
			}
		}
		
		// Recursively dispose children
		if (obj.children && obj.children.length > 0) {
			// Create a copy of the children array to avoid modification during iteration
			const children = obj.children.slice();
			for (let i = 0; i < children.length; i++) {
				window.disposeThreeObject(children[i]);
			}
		}
	};
}

/**
 * Renders the current tetromino
 */
function renderCurrentTetromino() {
	const tetromino = gameState.currentTetromino;
	if (!tetromino || !tetromino.shape) return;
	
	// Always use the boardFunctions module
	boardFunctions.renderTetromino(
		gameState,
		tetromino,
		tetrominoGroup,
		createTetrominoBlock
	);
}

// Performance monitoring and optimization flags
let cloudsInView = true; // Flag to track if clouds are in camera view
let cameraIsAnimating = false; // Flag to track if camera is currently animating

// Object pool for frequently used game objects
const objectPool = {
	tetrominoBlocks: [],
	maxPoolSize: 100, // Maximum number of objects to keep in pool
	
	// Get block from pool or create new
	getTetrominoBlock: function() {
		if (this.tetrominoBlocks.length > 0) {
			return this.tetrominoBlocks.pop();
		}
		
		// Create new block
		const geometry = new THREE.BoxGeometry(0.9, 0.9, 0.9);
		const material = new THREE.MeshStandardMaterial({
			color: 0xffffff, // Will be set later
			metalness: 0.3,
			roughness: 0.7,
			transparent: false
		});
		
		const mesh = new THREE.Mesh(geometry, material);
		return mesh;
	},
	
	// Return block to pool
	returnTetrominoBlock: function(mesh) {
		// Don't exceed max pool size
		if (this.tetrominoBlocks.length >= this.maxPoolSize) {
			// Dispose properly
			if (mesh.geometry) mesh.geometry.dispose();
			if (mesh.material) mesh.material.dispose();
			return;
		}
		
		// Reset properties for reuse
		mesh.visible = true;
		mesh.scale.set(1, 1, 1);
		mesh.position.set(0, 0, 0);
		
		// Add to pool
		this.tetrominoBlocks.push(mesh);
	},
	
	// Clear pool (call when changing levels or scenes)
	clearPool: function() {
		while (this.tetrominoBlocks.length > 0) {
			const mesh = this.tetrominoBlocks.pop();
			if (mesh.geometry) mesh.geometry.dispose();
			if (mesh.material) mesh.material.dispose();
		}
	}
};



/**
 * Removes the loading indicator
 */
function removeLoadingIndicator() {
	if (gameState.loadingOverlay && gameState.loadingOverlay.parentNode) {
		gameState.loadingOverlay.parentNode.removeChild(gameState.loadingOverlay);
		gameState.loadingOverlay = null;
	}
}

/**
 * Set up lights for the scene
 */
function setupLights() {
	// Clear any existing lights first
	scene.children = scene.children.filter(child => !(child instanceof THREE.Light));

	// Create a beautiful light blue sky background
	scene.background = new THREE.Color(0xAFE9FF); // Light sky blue
	scene.fog = new THREE.Fog(0xC5F0FF, 60, 150); // Light blue fog, pushed back

	// Main sunlight - golden warm directional light
	const sunLight = new THREE.DirectionalLight(0xFFFBE8, 1.35); // Warm sunlight
	sunLight.position.set(25, 80, 30);
	sunLight.castShadow = true;
	sunLight.shadow.mapSize.width = 2048;
	sunLight.shadow.mapSize.height = 2048;
	sunLight.shadow.camera.near = 10;
	sunLight.shadow.camera.far = 200;
	sunLight.shadow.camera.left = -50;
	sunLight.shadow.camera.right = 50;
	sunLight.shadow.camera.top = 50;
	sunLight.shadow.camera.bottom = -50;
	sunLight.shadow.bias = -0.0001; // Reduce shadow acne
	scene.add(sunLight);
	
	// Ambient light for general illumination - sky colored
	const ambientLight = new THREE.AmbientLight(0xB0E2FF, 0.65); // Sky-colored
	scene.add(ambientLight);
	
	// Add a soft golden backlight for rim lighting effect
	const backLight = new THREE.DirectionalLight(0xFFF0E0, 0.4);
	backLight.position.set(-15, 20, -25);
	scene.add(backLight);
	
	// Add a soft blue-ish fill light from below for floating cells
	const fillLight = new THREE.DirectionalLight(0xC8E0FF, 0.25);
	fillLight.position.set(-20, -5, -20);
	scene.add(fillLight);
	
	// Add a subtle hemisphere light for better outdoor lighting
	const hemisphereLight = new THREE.HemisphereLight(0xFFFBE8, 0x080820, 0.5);
	scene.add(hemisphereLight);

	// Add beautiful fluffy clouds to scene
	addCloudsToScene();
}

/**
 * Add decorative clouds to the scene
 */
function addCloudsToScene() {
	// Create cloud material
	const cloudMaterial = new THREE.MeshStandardMaterial({
		color: 0xffffff,
			transparent: true,
			opacity: 0.85,
			roughness: 1.0,
			metalness: 0.0
	});
	
	// Create cloud group
	const cloudGroup = new THREE.Group();
	cloudGroup.name = 'clouds';
	
	// Create several clouds at different positions
	for (let i = 0; i < 15; i++) {
		const cloudCluster = new THREE.Group();
		
		// Random position in the sky
		const x = (Math.random() - 0.5) * 100;
		const y = 20 + Math.random() * 20;
		const z = (Math.random() - 0.5) * 100;
		
		// Create 3-5 puffs for each cloud
		const puffCount = 3 + Math.floor(Math.random() * 3);
		
		for (let j = 0; j < puffCount; j++) {
			// Create a puff (a simple sphere)
			const size = 2 + Math.random() * 3;
			const puffGeometry = new THREE.SphereGeometry(size, 7, 7);
			const puff = new THREE.Mesh(puffGeometry, cloudMaterial);
			
			// Position within cluster
			const puffX = (Math.random() - 0.5) * 5;
			const puffY = (Math.random() - 0.5) * 2;
			const puffZ = (Math.random() - 0.5) * 5;
			
			puff.position.set(puffX, puffY, puffZ);
			cloudCluster.add(puff);
		}
		
		// Position the whole cluster
		cloudCluster.position.set(x, y, z);
		cloudGroup.add(cloudCluster);
	}
	
	// Add clouds to scene
	scene.add(cloudGroup);
}

/**
 * Legacy createChessPiece function that now correctly delegates to boardFunctions
 */
function legacy_createChessPiece2(x, z, pieceType, playerIdent, ourPlayerIdent) {
	// Use boardFunctions version instead
	return boardFunctions.createChessPiece(gameState, x, z, pieceType, playerIdent, ourPlayerIdent, undefined, THREE);
}

/**
 * Create a chess piece at the specified position
 * This function now acts as a wrapper to the boardFunctions version
 * @param {Object} gameState - The current game state
 * @param {number} x - X coordinate on the board
 * @param {number} z - Z coordinate on the board
 * @param {string|number} pieceType - Type of piece (PAWN, ROOK, etc. or numeric)
 * @param {number|string} playerIdent - Player identifier
 * @param {number|string} ourPlayerIdent - Our player identifier
 * @param {number} orientation - Rotation orientation for the piece
 * @param {Object} THREE - THREE.js library
 * @returns {Object} THREE.js Group containing the piece
 */
function createChessPiece(gameState, x, z, pieceType, playerIdent, ourPlayerIdent, orientation, THREE) {
	// Directly call boardFunctions version
	const piece = boardFunctions.createChessPiece(gameState, x, z, pieceType, playerIdent, ourPlayerIdent, orientation, THREE);
	
	// Ensure the piece is visible
	if (piece) {
		piece.visible = true;
		
		// Make sure all child objects are also visible
		piece.traverse(child => {
			if (child.isMesh) {
				child.visible = true;
				child.material.needsUpdate = true;
			}
		});
	}
	
	return piece;
}

/**
 * Set up the camera position and controls
 */
function setupCamera() {
	// Position camera at an isometric view
	camera.position.set(15, 20, 15);
	camera.lookAt(0, 0, 0);
	
	// Initialize orbit controls for camera manipulation
	if (typeof THREE.OrbitControls !== 'undefined') {
		// Use THREE's built-in OrbitControls if available
		controls = new THREE.OrbitControls(camera, renderer.domElement);
	} else if (window.OrbitControls) {
		// Or use globally available OrbitControls
		controls = new window.OrbitControls(camera, renderer.domElement);
	} else {
		console.warn("OrbitControls not available, camera controls will be limited");
		// Create minimal controls to avoid errors
		controls = {
			update: function() {},
			enabled: false,
			enableDamping: false,
			dampingFactor: 0.05,
			minDistance: 5,
			maxDistance: 100,
			maxPolarAngle: Math.PI / 2
		};
	}
	
	// Configure controls if they exist
	if (controls.enableDamping !== undefined) {
		controls.enableDamping = true;
		controls.dampingFactor = 0.1;
		controls.rotateSpeed = 0.7;
		controls.minDistance = 5;
		controls.maxDistance = 50;
		controls.maxPolarAngle = Math.PI / 2 - 0.1; // Prevent camera from going below the ground
	}
}

/**
 * Create board cells using boardFunctions
 */
function createBoardCells() {
  boardFunctions.createBoardCells(gameState, boardGroup, createFloatingIsland, THREE);
}

/**
 * Creates a tetromino block at the specified position - this is still needed
 * as it's called by the boardFunctions module
 * @param {number} x - X position
 * @param {number} z - Z position
 * @param {number|string} playerType - Player identifier
 * @param {boolean} isGhost - Whether this is a ghost piece to show landing position
 * @param {number} heightAboveBoard - Height above the board (y position)
 * @returns {THREE.Object3D} The created tetromino block
 */
function createTetrominoBlock(x, z, playerType, isGhost = false, heightAboveBoard = 0) {
	// Get a mesh from object pool
	const block = objectPool.getTetrominoBlock();
	
	// Get material color based on player type
	let color = 0xcccccc; // Default gray
	
	// Map player type to color
	if (typeof playerType === 'number') {
		// Use player colors by index
		color = PLAYER_COLORS[playerType] || 0xcccccc;
	} else if (typeof playerType === 'string') {
		// Map tetromino shape letters to colors
		switch (playerType) {
			case 'I': color = 0x00ffff; break; // Cyan
			case 'J': color = 0x0000ff; break; // Blue
			case 'L': color = 0xff8000; break; // Orange
			case 'O': color = 0xffff00; break; // Yellow
			case 'S': color = 0x00ff00; break; // Green
			case 'T': color = 0x800080; break; // Purple
			case 'Z': color = 0xff0000; break; // Red
			default:  color = 0x888888; break; // Gray for unknown types
		}
	}
	
	// Update material properties
	if (block.material) {
		block.material.color.setHex(color);
		block.material.transparent = isGhost;
		block.material.opacity = isGhost ? 0.3 : 1.0;
		block.material.wireframe = isGhost;
		block.material.emissive = isGhost ? { r: 0, g: 0, b: 0 } : block.material.color;
		block.material.emissiveIntensity = isGhost ? 0 : 0.2;
		block.material.needsUpdate = true;
	}
	
	// Position block
	const heightPos = isGhost ? 0.1 : (0.6 + heightAboveBoard);
	block.position.set(x, heightPos, z);
	
	block.castShadow = !isGhost;
	block.receiveShadow = !isGhost;
	
	// Store type info for identification
	block.userData = {
		type: isGhost ? 'ghostBlock' : 'tetrominoBlock',
		playerType: playerType,
		pooledObject: true // Mark as pooled for proper disposal
	};
	
	// Create a wrapper group to hold the block
	const blockGroup = new THREE.Group();
	blockGroup.add(block);
	blockGroup.position.set(0, 0, 0);
	
	// Add dispose method to properly return to pool
	blockGroup.dispose = function() {
		// Return the mesh to the pool
		if (this.children.length > 0) {
			const mesh = this.children[0];
			objectPool.returnTetrominoBlock(mesh);
			this.remove(mesh);
		}
	};
	
	// Store reference to the pooled block
	blockGroup.userData = {
		type: isGhost ? 'ghostBlock' : 'tetrominoBlock',
		playerType: playerType,
		pooledMesh: block
	};
	
	return blockGroup;
}

/**
 * Create a chess piece at the specified position
 * @param {Object} gameState - The current game state
 * @param {number} x - X coordinate on the board
 * @param {number} z - Z coordinate on the board
 * @param {string|number} pieceType - Type of piece (PAWN, ROOK, etc. or numeric)
 * @param {number|string} playerIdent - Player identifier
 * @param {number|string} ourPlayerIdent - Our player identifier
 * @param {Object} THREE_ - THREE.js library
 * @returns {Object} THREE.js Group containing the piece
 */
function createChessPiece(gameState, x, z, pieceType, playerIdent, ourPlayerIdent, orientation, THREE_) {
	console.log(`Creating chess piece at (${x}, ${z}) of type ${pieceType} for player ${playerIdent}`);
	
	try {
		// Use boardFunctions to create the piece
		const chessPiece = boardFunctions.createChessPiece(
			gameState, 
			x, 
			z, 
			pieceType, 
			playerIdent, 
			ourPlayerIdent, 
			orientation, 
			THREE
		);
		
		// Ensure the piece is visible
		if (chessPiece) {
			chessPiece.visible = true;
			
			// Add debug marker to help with visibility and positioning
			const markerGeometry = new THREE.SphereGeometry(0.1, 8, 8);
			const markerMaterial = new THREE.MeshBasicMaterial({ 
				color: 0xffff00,
				transparent: true,
				opacity: 0.8
			});
			const marker = new THREE.Mesh(markerGeometry, markerMaterial);
			marker.position.set(0, 0, 0); // At the origin of the piece
			chessPiece.add(marker);
			
			// Make sure all child objects are also visible
			chessPiece.traverse(child => {
				if (child.isMesh) {
					child.visible = true;
					if (child.material) {
						child.material.needsUpdate = true;
					}
				}
			});
		}
		
		return chessPiece;
	} catch (err) {
		console.error('Error creating chess piece:', err);
		
		// Create a simple fallback piece with a bright visible color
		const fallbackGroup = new THREE.Group();
		const fallbackGeometry = new THREE.BoxGeometry(0.5, 0.8, 0.5);
		const fallbackMaterial = new THREE.MeshStandardMaterial({ 
			color: 0xff0000,
			emissive: 0xff0000,
			emissiveIntensity: 0.5
		});
		const fallbackMesh = new THREE.Mesh(fallbackGeometry, fallbackMaterial);
		fallbackMesh.position.y = 0.4; // Raise above the board
		fallbackGroup.add(fallbackMesh);
		
		// Get board center for correct positioning
		const boardSize = gameState.boardSize || 30;
		const center = boardSize / 2 - 0.5;
		
		// Position the error mesh using the same coordinate system as cells
		fallbackGroup.position.set(x - center, 0, z - center);
		fallbackGroup.visible = true;
		
		return fallbackGroup;
	}
}

// First, remove the duplicate createChessPiece function and keep the more detailed one
function createChessPiece_fixed(gameState, x, z, pieceType, playerIdent, ourPlayerIdent, orientation, THREE_) {
	console.log(`Creating chess piece at (${x}, ${z}) of type ${pieceType} for player ${playerIdent}`);
	
	try {
		// Create a new THREE.js group for our chess piece
		const pieceGroup = new THREE.Group();
		
		// Get board center for correct positioning
		const minX = gameState.boardBounds?.minX || 0;
		const maxX = gameState.boardBounds?.maxX || 20;
		const minZ = gameState.boardBounds?.minZ || 0;
		const maxZ = gameState.boardBounds?.maxZ || 20;
		const centerX = (minX + maxX) / 2;
		const centerZ = (minZ + maxZ) / 2;
		
		// Log detailed positioning info for debugging
		console.log(`Board center at (${centerX}, ${centerZ}), positioning piece at (${x-centerX}, 0, ${z-centerZ})`);
		
		// Position the piece group using board coordinates
		pieceGroup.position.set(x - centerX, 0, z - centerZ);
		
		// Store metadata in userData for identification
		pieceGroup.userData = {
			type: 'chessPiece',
			position: { x, z },
			pieceType,
			player: playerIdent
		};
		
		// Map player to color based on whether it's our player
		const playerNum = playerIdent === ourPlayerIdent ? 1 : 2;
		const primaryColor = playerNum === 1 ? 0x0055AA : 0xAA0000;
		const secondaryColor = 0xFFD700; // Gold for all players
		
		// Create base geometry
		const baseGeometry = new THREE.CylinderGeometry(0.35, 0.4, 0.2, 16);
		const baseMaterial = new THREE.MeshStandardMaterial({
			color: primaryColor,
			metalness: 0.7,
			roughness: 0.3,
			emissive: primaryColor,
			emissiveIntensity: 0.2
		});
		const base = new THREE.Mesh(baseGeometry, baseMaterial);
		base.position.y = 0.5; // Position above the board
		base.castShadow = true;
		base.receiveShadow = true;
		pieceGroup.add(base);
		
		// Create main body based on piece type
		const bodyHeight = 1.0; // Default height
		const bodyGeometry = new THREE.CylinderGeometry(0.3, 0.35, bodyHeight, 16);
		const bodyMaterial = new THREE.MeshStandardMaterial({
			color: primaryColor,
			metalness: 0.5,
			roughness: 0.5,
			emissive: primaryColor,
			emissiveIntensity: 0.2
		});
		const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
		body.position.y = 0.5 + bodyHeight/2; // Position above base
		body.castShadow = true;
		body.receiveShadow = true;
		pieceGroup.add(body);
		
		// Add top crown based on piece type
		const crownGeometry = new THREE.SphereGeometry(0.25, 16, 16);
		const crownMaterial = new THREE.MeshStandardMaterial({
			color: secondaryColor,
			metalness: 0.8,
			roughness: 0.2,
			emissive: secondaryColor,
			emissiveIntensity: 0.3
		});
		const crown = new THREE.Mesh(crownGeometry, crownMaterial);
		crown.position.y = 0.5 + bodyHeight + 0.1; // Position on top of body
		crown.castShadow = true;
		crown.receiveShadow = true;
		pieceGroup.add(crown);
		
		// Add debug marker at base - a small red sphere
		const markerGeometry = new THREE.SphereGeometry(0.1, 8, 8);
		const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
		const marker = new THREE.Mesh(markerGeometry, markerMaterial);
		marker.position.y = 0.1; // Just above the board
		pieceGroup.add(marker);
		
		// Add debug marker at the top - a small colored sphere
		const topMarkerGeometry = new THREE.SphereGeometry(0.15, 8, 8);
		const topMarkerMaterial = new THREE.MeshBasicMaterial({ 
			color: playerNum === 1 ? 0x0000ff : 0xff0000,
			transparent: true,
			opacity: 0.8
		});
		const topMarker = new THREE.Mesh(topMarkerGeometry, topMarkerMaterial);
		topMarker.position.y = 2.0; // Well above the piece for visibility
		pieceGroup.add(topMarker);
		
		// Ensure all objects in the group are visible
		pieceGroup.traverse(child => {
			if (child.isMesh) {
				child.visible = true;
				if (child.material) {
					child.material.needsUpdate = true;
				}
			}
		});
		
		// Set the entire group to visible
		pieceGroup.visible = true;
		
		return pieceGroup;
		
	} catch (err) {
		console.error('Error creating chess piece:', err);
		
		// Create a simple fallback piece with a bright visible color
		const fallbackGroup = new THREE.Group();
		const fallbackGeometry = new THREE.BoxGeometry(0.5, 0.8, 0.5);
		const fallbackMaterial = new THREE.MeshStandardMaterial({ 
			color: 0xff0000,
			emissive: 0xff0000,
			emissiveIntensity: 0.5
		});
		const fallbackMesh = new THREE.Mesh(fallbackGeometry, fallbackMaterial);
		fallbackMesh.position.y = 0.5; // Raise above the board
		fallbackGroup.add(fallbackMesh);
		
		// Get board center for correct positioning
		const minX = gameState.boardBounds?.minX || 0;
		const maxX = gameState.boardBounds?.maxX || 20;
		const minZ = gameState.boardBounds?.minZ || 0;
		const maxZ = gameState.boardBounds?.maxZ || 20;
		const centerX = (minX + maxX) / 2;
		const centerZ = (minZ + maxZ) / 2;
		
		// Position the error mesh using the same coordinate system as cells
		fallbackGroup.position.set(x - centerX, 0, z - centerZ);
		fallbackGroup.visible = true;
		
		return fallbackGroup;
	}
}

// Remove the first createChessPiece function and replace with the modified one
function createChessPiece(gameState, x, z, pieceType, playerIdent, ourPlayerIdent, orientation, THREE_) {
	return createChessPiece_fixed(gameState, x, z, pieceType, playerIdent, ourPlayerIdent, orientation, THREE_);
}
