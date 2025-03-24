/**
 * Enhanced Game Core - 3D Chess-Tetris Game
 * Main implementation file for the enhanced game
 */

// Import required modules
import * as THREE from './utils/three.module.js';
import * as NetworkManager from './utils/networkManager.js';
import { createFallbackTextures, animateClouds } from './textures.js';
import { createFallbackModels } from './models.js';
import { showToastMessage } from './showToastMessage.js';
import { createNetworkStatusDisplay } from './createNetworkStatusDisplay.js';
import { setupScene, rebuildScene, createFloatingIsland } from './scene.js';
import { boardFunctions } from './boardFunctions.js';


// Global state
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
	pendingCameraReset: null
};

// Cached DOM elements
let containerElement;
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
 * @param {HTMLElement} container - Game container element
 */
export function initGame(container) {
	console.log('Initializing enhanced Shaktris core with Russian theme...');
	
	// Check if THREE is available
	if (typeof THREE === 'undefined') {
		console.error('THREE.js is not loaded! Make sure it is included before gameCore.js');
		showErrorMessage('THREE.js library is missing. Please check your internet connection and reload the page.');
		return false;
	}
	
	// Store container
	containerElement = container;
	
	try {
		// Initialize raycaster for mouse interaction
		raycaster = new THREE.Raycaster();
		mouse = new THREE.Vector2();
		
		// Set default board size
		gameState.boardDimensions.width = 16;
		
		// Create an empty game state - will be replaced with server data
		resetGameState();
		
		// Load assets and set up scene
		console.log('Loading assets...');
		
		// Initialize models and textures first
		createFallbackTextures(textures);
		createFallbackModels(models);
		
		// Set up 3D scene
		const { _scene, _camera, _renderer, _controls, _boardGroup, _tetrominoGroup, _chessPiecesGroup } = setupScene(containerElement);

		scene = _scene;
		camera = _camera;
		renderer = _renderer;
		controls = _controls;
		boardGroup = _boardGroup;
		tetrominoGroup = _tetrominoGroup;
		chessPiecesGroup = _chessPiecesGroup;
		
		console.log('Scene setup complete', boardGroup, tetrominoGroup, chessPiecesGroup);
		// Create empty board visualization
		createBoard(boardGroup);
		
		// Create game status display
		createGameStatusDisplay();
		
		// Add network status display
		createNetworkStatusDisplay();
		
		// Add event handlers with try/catch to prevent fatal errors
		try {
			// Set up network event listeners (with error handling inside)
			setupNetworkEvents();
		} catch (error) {
			console.warn('Error setting up network events:', error);
			// Continue without network functionality
		}
		
		try {
			// Set up input handlers
			setupInputHandlers();
		} catch (error) {
			console.warn('Error setting up input handlers:', error);
			// Continue without input handlers
		}
		
		// Start game loop
		startGameLoop();
		
		// Show tutorial message with a slight delay
		setTimeout(() => {
			showTutorialMessage();
		}, 500);
		
		console.log('Enhanced core initialization completed successfully');
		return true;
	} catch (error) {
		console.error('Error initializing game:', error);
		showErrorMessage(`Initialization error: ${error.message}. Please reload the page.`);
		return false;
	}
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
 * Start playing the game
 */
function startPlayingGame() {
	console.log('Starting game...');
	
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
	if (!NetworkManager.isConnected || !NetworkManager.isConnected()) {
		console.log('Not connected to server, using local state');
		startFirstTurn();
		return;
	}
	
	if (!NetworkManager.getGameId) {
		console.log('No getGameId method available, using local state');
		startFirstTurn();
		return;
	}
	
	const gameId = NetworkManager.getGameId();
	if (!gameId) {
		console.log('No game ID available, using local state');
		startFirstTurn();
		return;
	}
	
	console.log('Requesting game state from server for game ID:', gameId);
	
	// Try multiple methods to ensure we get a response
	if (NetworkManager.getGameState) {
		// Direct API method
		NetworkManager.getGameState({ gameId: gameId })
			.then(response => {
				console.log('Game state received via getGameState API:', response);
				if (response && response.board) {
					handleGameStateUpdate(response);
				} else {
					throw new Error('Invalid game state data received');
				}
			})
			.catch(error => {
				console.warn('Failed to get game state via API, trying message approach:', error);
				sendGameStateRequest();
			});
	} else {
		// Message-based approach
		sendGameStateRequest();
	}
	
	// Set timeout for fallback to local state
	setTimeout(() => {
		if (!gameState.board || gameState.board.length === 0) {
			console.log('No game state received from server after timeout, using local state');
			startFirstTurn();
		}
	}, 8000); // Longer timeout to account for multiple attempts
}

/**
 * Send game state request via available messaging methods
 */
function sendGameStateRequest() {
	const gameId = NetworkManager.getGameId();
	
	// Try all available methods
	if (NetworkManager.sendMessage) {
		NetworkManager.sendMessage('get_game_state', { gameId });
		console.log('Sent get_game_state message');
	}
	
	if (NetworkManager.emit) {
		NetworkManager.emit('get_game_state', { gameId });
		console.log('Emitted get_game_state event');
	}
	
	// Direct socket.io approach as last resort
	if (NetworkManager.getSocket && NetworkManager.getSocket()) {
		const socket = NetworkManager.getSocket();
		socket.emit('get_game_state', { gameId });
		console.log('Direct socket emit for get_game_state');
	}
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
 * Create the game board with enhanced visuals
 */
export function createBoard(boardGroup) {
	console.log('Creating floating islands in the sky...');
	
	// Clear any existing board content
	while (boardGroup.children.length > 0) {
		boardGroup.remove(boardGroup.children[0]);
	}
	
	// Create the floating cells
	const boardSize = gameState.boardSize || 16;
	
	// Create material for cells - use more natural colors
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
	
	console.log(`Creating board with size ${boardSize}. Has board data: ${hasBoardData}`);
	
	// ONLY create cells where there's data
	if (hasBoardData) {
		// Create cells based on actual board data
		for (const key in gameState.board.cells) {
			const [x, z] = key.split(',').map(Number);
			const cell = gameState.board.cells[key];
			
			// Only create a cell if there's content
			if (cell !== null && cell !== undefined) {
				const material = (x + z) % 2 === 0 ? whiteMaterial : darkMaterial;
				createFloatingCube(x, z, material);
			}
		}
	} else {
		// If no board data, create a sparse placeholder grid
		for (let z = 0; z < boardSize; z += 2) {
			for (let x = 0; x < boardSize; x += 2) {
				const material = (x + z) % 2 === 0 ? whiteMaterial : darkMaterial;
				createFloatingCube(x, z, material);
			}
		}
	}
	
	// Position board group at origin (we'll use absolute positions)
	boardGroup.position.set(0, 0, 0);
	
	console.log(`Board created with ${boardGroup.children.length} cells`);
}

/**
 * Create a single floating cube cell at the given position
 * @param {number} x - X position
 * @param {number} z - Z position
 * @param {THREE.Material} material - Material to use for the cell
 */
function createFloatingCube(x, z, material) {
	// Create a cube for the cell
	const cellGeometry = new THREE.BoxGeometry(1, 1, 1);
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
}

/**
 * Set up input handlers for keyboard and mouse
 */
function setupInputHandlers() {
	console.log('Setting up enhanced input handlers...');
	
	// Keyboard events
	document.addEventListener('keydown', handleKeyDown);
	
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
	if (isValidTetrominoPosition(gameState.currentTetromino.shape, newPos)) {
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
	if (isValidTetrominoPosition(gameState.currentTetromino.shape, newPos)) {
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
function isValidTetrominoPosition(shape, position) {
	// Use the imported boardFunctions module
	if (typeof boardFunctions !== 'undefined' && boardFunctions.isValidTetrominoPosition) {
		return boardFunctions.isValidTetrominoPosition(gameState, shape, position);
	}
	
	// Fallback implementation
	// Check each block of the tetromino
	for (let z = 0; z < shape.length; z++) {
		for (let x = 0; x < shape[z].length; x++) {
			if (shape[z][x] === 1) {
				// Calculate block position
				const blockX = position.x + x;
				const blockZ = position.z + z;
				
				// Check if out of bounds - use board boundaries if available
				const minX = gameState.boardBounds?.minX || 0;
				const maxX = gameState.boardBounds?.maxX || 32;
				const minZ = gameState.boardBounds?.minZ || 0;
				const maxZ = gameState.boardBounds?.maxZ || 32;
				
				if (blockX < minX || blockX > maxX || 
					blockZ < minZ || blockZ > maxZ) {
					console.log(`Tetromino out of bounds at (${blockX}, ${blockZ})`);
					return false;
				}
				
				// Check for collision with existing board content using sparse structure
				if (gameState.board && gameState.board.cells) {
					const key = `${blockX},${blockZ}`;
					const cell = gameState.board.cells[key];
					
					if (cell !== undefined && cell !== null) {
						console.log(`Collision detected at (${blockX}, ${blockZ}) with:`, cell);
						return false;
					}
				}
			}
		}
	}
	
	return true;
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
	if (isValidTetrominoPosition(newShape, gameState.currentTetromino.position)) {
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
function placeTetromino() {
	// Use the imported boardFunctions module
	if (typeof boardFunctions !== 'undefined' && boardFunctions.placeTetromino) {
		boardFunctions.placeTetromino(
			gameState, 
			showPlacementEffect, 
			updateGameStatusDisplay, 
			updateBoardVisuals
		);
		return;
	}
	
	// Fallback implementation...
	if (!gameState.currentTetromino) return;
	
	const shape = gameState.currentTetromino.shape;
	const posX = gameState.currentTetromino.position.x;
	const posZ = gameState.currentTetromino.position.z;
	const player = gameState.currentPlayer;
	
	console.log(`Placing tetromino at (${posX}, ${posZ})`);
	
	// If we don't have a board object yet, create one
	if (!gameState.board) {
		gameState.board = {
			cells: {},
			minX: 0,
			maxX: 32,
			minZ: 0,
			maxZ: 32,
			width: 33,
			height: 33
		};
	}
	
	// If we don't have a cells object yet, create one
	if (!gameState.board.cells) {
		gameState.board.cells = {};
	}
	
	// Place each block of the tetromino on the board
	for (let z = 0; z < shape.length; z++) {
		for (let x = 0; x < shape[z].length; x++) {
			if (shape[z][x] === 1) {
				const boardX = posX + x;
				const boardZ = posZ + z;
				
				// Set the cell in the sparse structure
				const key = `${boardX},${boardZ}`;
				gameState.board.cells[key] = {
					type: 'tetromino',
					player: player
				};
				
				// Update board boundaries
				if (boardX < gameState.board.minX) gameState.board.minX = boardX;
				if (boardX > gameState.board.maxX) gameState.board.maxX = boardX;
				if (boardZ < gameState.board.minZ) gameState.board.minZ = boardZ;
				if (boardZ > gameState.board.maxZ) gameState.board.maxZ = boardZ;
				
				// Update board dimensions
				gameState.board.width = gameState.board.maxX - gameState.board.minX + 1;
				gameState.board.height = gameState.board.maxZ - gameState.board.minZ + 1;
				
				// Log the placement
				console.log(`Placed block at (${boardX}, ${boardZ})`);
			}
		}
	}
	
	// Display the placed tetromino with a nice effect
	showPlacementEffect(posX, posZ);
	
	// Switch to chess phase
	gameState.turnPhase = 'chess';
	updateGameStatusDisplay();
	
	// Clear the current tetromino
	gameState.currentTetromino = null;
	
	// Update the board visuals
	updateBoardVisuals();
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
		
		if (!isPlayerFirstPiece && !isTetrominoAdjacentToExistingCells(
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
function isTetrominoAdjacentToExistingCells(shape, posX, posZ) {
	// For each block in the tetromino, check if it's adjacent to an existing cell
	for (let z = 0; z < shape.length; z++) {
		for (let x = 0; x < shape[z].length; x++) {
			if (shape[z][x] === 1) {
				const blockX = posX + x;
				const blockZ = posZ + z;
				
				// Check all 8 adjacent positions
				const directions = [
					{ dx: -1, dz: 0 },  // Left
					{ dx: 1, dz: 0 },   // Right
					{ dx: 0, dz: -1 },  // Up
					{ dx: 0, dz: 1 },   // Down
					{ dx: -1, dz: -1 }, // Top-left
					{ dx: 1, dz: -1 },  // Top-right
					{ dx: -1, dz: 1 },  // Bottom-left
					{ dx: 1, dz: 1 }    // Bottom-right
				];
				
				for (const dir of directions) {
					const adjX = blockX + dir.dx;
					const adjZ = blockZ + dir.dz;
					const key = `${adjX},${adjZ}`;
					
					// Check if the adjacent cell contains a block
					if (gameState.board && gameState.board.cells && 
						gameState.board.cells[key] !== undefined && 
						gameState.board.cells[key] !== null) {
						return true;
					}
				}
			}
		}
	}
	
	// No adjacent existing cells found
	return false;
}

/**
 * Update board cell incrementally (for animations or live updates)
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @param {*} value - Value to set
 */
function updateBoardCell(x, z, value) {
	if (!gameState.board) {
		gameState.board = {
			cells: {},
			minX: 0,
			maxX: 32,
			minZ: 0,
			maxZ: 32,
			width: 33,
			height: 33
		};
	}
	
	if (!gameState.board.cells) {
		gameState.board.cells = {};
	}
	
	// Update the cell
	const key = `${x},${z}`;
	
	if (value === 0 || value === null) {
		// Remove the cell if setting to empty
		delete gameState.board.cells[key];
	} else {
		// Set the cell value
		gameState.board.cells[key] = value;
		
		// Update board boundaries
		if (x < gameState.board.minX) gameState.board.minX = x;
		if (x > gameState.board.maxX) gameState.board.maxX = x;
		if (z < gameState.board.minZ) gameState.board.minZ = z;
		if (z > gameState.board.maxZ) gameState.board.maxZ = z;
		
		// Update board dimensions
		gameState.board.width = gameState.board.maxX - gameState.board.minX + 1;
		gameState.board.height = gameState.board.maxZ - gameState.board.minZ + 1;
	}
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
 * Check for collision at a specific position
 * @param {Array} shape - Tetromino shape
 * @param {number} posX - X position
 * @param {number} posZ - Z position
 * @returns {boolean} - Whether there's a collision
 */
function checkTetrominoCollision(shape, posX, posZ) {
	// Check each block in the tetromino
	for (let z = 0; z < shape.length; z++) {
		for (let x = 0; x < shape[z].length; x++) {
			if (shape[z][x] === 1) {
				const boardX = posX + x;
				const boardZ = posZ + z;
				
				// If this is for the current tetromino (not ghost), ignore collision checking
				// when the tetromino is still above the board
				if (gameState.currentTetromino && 
					gameState.currentTetromino.heightAboveBoard > 0 &&
					shape === gameState.currentTetromino.shape) {
					continue; // Skip collision check while above board
				}
				
				// Check if board position exists
				if (!gameState.board[boardZ] || gameState.board[boardZ][boardX] === undefined) {
					// Create the row if it doesn't exist (we have unlimited board)
					if (!gameState.board[boardZ]) {
						gameState.board[boardZ] = [];
					}
					// Add empty cell
					gameState.board[boardZ][boardX] = 0;
				}
				
				// Only check for direct overlap with existing blocks
				if (gameState.board[boardZ][boardX] !== 0) {
					return true; // Direct collision with existing block
				}
			}
		}
	}
	
	return false; // No collision
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
}

/**
 * Handle mouse move event
 * @param {MouseEvent} event - Mouse event
 */
function handleMouseMove(event) {
	// Calculate mouse position for hover effects
	const rect = containerElement.getBoundingClientRect();
	mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
	mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

/**
 * Handle touch start event
 * @param {TouchEvent} event - Touch event
 */
function handleTouchStart(event) {
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
}

/**
 * Handle touch move event
 * @param {TouchEvent} event - Touch event
 */
function handleTouchMove(event) {
	event.preventDefault();
	
	if (event.touches.length > 0) {
		const rect = containerElement.getBoundingClientRect();
		mouse.x = ((event.touches[0].clientX - rect.left) / rect.width) * 2 - 1;
		mouse.y = -((event.touches[0].clientY - rect.top) / rect.height) * 2 + 1;
	}
}

/**
 * Handle touch end event
 * @param {TouchEvent} event - Touch event
 */
function handleTouchEnd(event) {
	event.preventDefault();
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

// Add a global lastFallTime variable
let lastFallTime = Date.now();

/**
 * Start the game loop with performance optimizations
 */
function startGameLoop() {
	console.log('Starting enhanced game loop with performance optimizations...');
	
	// Reset the fall time whenever we start the game loop
	lastFallTime = Date.now();
	
	// Last time for calculating delta time
	let lastTime = performance.now();
	
	// Throttle values for different update functions
	const LOD_UPDATE_INTERVAL = 500; // ms between LOD updates
	const GAME_LOGIC_INTERVAL = 100; // ms between game logic updates
	
	// Track when we last ran various updates
	let lastLODUpdate = 0;
	let lastGameLogicUpdate = 0;
	
	// Track if we're currently animating
	let isAnimating = false;
	
	// Animation loop function
	function animate() {
		// Prevent multiple simultaneous animations
		if (isAnimating) return;
		isAnimating = true;
		
		// Request next frame
		const animationFrameId = requestAnimationFrame(() => {
			isAnimating = false;
			animate();
		});
		
		// Calculate delta time
		const currentTime = performance.now();
		const deltaTime = (currentTime - lastTime) / 1000; // Convert to seconds
		lastTime = currentTime;
		
		// Handle automatic tetromino falling in tetris phase
		if (gameState.turnPhase === 'tetris' && gameState.currentTetromino) {
			const now = Date.now();
			const FALL_INTERVAL = 1000; // 1 second between falls
			
			if ((now - lastFallTime) > FALL_INTERVAL) {
				// Try to move tetromino down (along Z-axis which is our "vertical" on the board)
				if (moveTetrominoVertical(1)) {
					// Successfully moved down, update rendering
					renderTetromino(gameState.currentTetromino);
				} else {
					// Couldn't move down, place the tetromino
					placeTetromino();
				}
				
				lastFallTime = now;
			}
		}
		
		// Update controls if available (every frame for smooth camera)
		if (controls) {
			controls.update();
		}
		
		// Animate clouds but ensure the board stays fixed - every frame
		animateClouds(scene);
		
		// Only update LOD periodically to improve performance
		if (currentTime - lastLODUpdate > LOD_UPDATE_INTERVAL) {
			updateChessPiecesLOD();
			lastLODUpdate = currentTime;
		}
		
		// Only update game logic periodically to improve performance
		if (currentTime - lastGameLogicUpdate > GAME_LOGIC_INTERVAL) {
			updateGameLogic(deltaTime * (GAME_LOGIC_INTERVAL / 1000));
			lastGameLogicUpdate = currentTime;
		}
		
		// Render the scene (every frame)
		renderer.render(scene, camera);
	}
	
	// Start animation loop
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
		const FALL_INTERVAL = 500; // Faster falling (500ms instead of 1000ms)
		
		if ((now - lastFallTime) > FALL_INTERVAL) {
			console.log("Attempting to process tetromino fall");
			
			// Check if the tetromino is still above the board
			if (gameState.currentTetromino.heightAboveBoard > 0) {
				// Gradually lower the tetromino toward the board
				gameState.currentTetromino.heightAboveBoard -= 0.5;
				if (gameState.currentTetromino.heightAboveBoard < 0) {
					gameState.currentTetromino.heightAboveBoard = 0;
				}
				console.log(`Lowering tetromino, height now: ${gameState.currentTetromino.heightAboveBoard}`);
				renderTetromino(gameState.currentTetromino);
				lastFallTime = now;
				return;
			}
			
			// Tetromino is at board level, try to move it down
			console.log("Attempting to move tetromino down in Z direction");
			// Try to move tetromino down (along Z-axis which is our "vertical" on the board)
			if (moveTetrominoVertical(1)) {
				// Successfully moved down, update rendering
				console.log("Successfully moved tetromino down");
				renderTetromino(gameState.currentTetromino);
			} else {
				// Couldn't move down, place the tetromino
				console.log("Could not move tetromino down, placing it");
				placeTetromino();
			}
			
			lastFallTime = now;
		}
	}
	
	// If we're in chess phase but have no tetromino for next phase
	if (gameState.turnPhase === 'chess' && !gameState.currentTetromino) {
		// Pre-create the tetromino so it's ready for next phase
		// Not rendering it yet, just having it ready
		if (!gameState._nextTetromino) {
			// Define simple tetromino shapes
			const shapes = TETROMINO_SHAPES;
			
			// Pick a random shape
			const shapeKeys = Object.keys(shapes);
			const randomShape = shapeKeys[Math.floor(Math.random() * shapeKeys.length)];
			
			// Get the shape matrix
			const shape = shapes[randomShape];
			
			// Store the next tetromino
			gameState._nextTetromino = {
				shape: shape,
				type: randomShape,
				player: gameState.localPlayerId || 1,
				heightAboveBoard: TETROMINO_START_HEIGHT
			};
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
function handleGameStateUpdate(data) {
	console.log('Received game state from server:', data);
	
	// Update board state
	if (data.board) {
		console.log('Board data received:', data.board);
		updateBoardState(data.board);
	} else {
		console.warn('No board data in game state update');
	}
	
	// Process chess pieces if provided directly
	if (data.chessPieces && Array.isArray(data.chessPieces)) {
		console.log(`Received ${data.chessPieces.length} chess pieces directly`);
		gameState.chessPieces = data.chessPieces;
		// Force update of chess pieces
		setTimeout(() => updateChessPieces(), 200);
	}
	
	// Check for home zones
	if (data.homeZones) {
		console.log('Home zones received:', data.homeZones);
		gameState.homeZones = data.homeZones;
		
		// Reposition camera if there was a pending camera reset
		if (gameState.pendingCameraReset) {
			console.log('Executing pending camera reset with home zone data');
			// Wait a moment for board updates to complete
			setTimeout(() => {
				if(gameState.pendingCameraReset?.animate) {
					resetCameraForGameplay(gameState.pendingCameraReset.animate, gameState.pendingCameraReset.forceImmediate);
				}
				gameState.pendingCameraReset = null;
			}, 300);
		}
	}
	
	
	// Update player list
	if (data.players) {
		console.log('Players received:', data.players);
		
		// Update local game state players
		gameState.players = data.players;
	}
	
	// Update current player and turn phase
	if (data.currentPlayer) {
		gameState.currentPlayer = data.currentPlayer;
	}
	
	// Handle turn phase updates
	if (data.turnPhase) {
		gameState.turnPhase = data.turnPhase;
		
		// If we entered chess phase, make sure pieces are visible
		if (data.turnPhase === 'chess' && gameState.chessPieces && gameState.chessPieces.length > 0) {
			console.log("Entered chess phase - ensuring pieces are visible");
			setTimeout(() => updateChessPieces(), 100);
		}
	}
	
	// Update game status display
	updateGameStatusDisplay();
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
		console.error('Invalid board data received');
		return;
	}
	
	// Check if we have the new sparse board structure
	const isSparseBoard = boardData.cells && typeof boardData.cells === 'object';
	
	if (!isSparseBoard) {
		console.error('Expected sparse board structure not found');
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
	
	if (effectiveBoardSize !== gameState.boardSize || 
		gameState.boardWidth !== width || 
		gameState.boardHeight !== height) {
		console.log(`Board size changed from ${gameState.boardSize}x${gameState.boardWidth}x${gameState.boardHeight} to ${effectiveBoardSize}x${width}x${height}`);
		gameState.boardSize = effectiveBoardSize;
		gameState.boardWidth = width;
		gameState.boardHeight = height;
		
		// Update boundaries
		gameState.boardBounds = {
			minX, maxX, minZ, maxZ,
			width, height
		};
		
		// Recreate the board with new size
		createBoard();
	}
	
	// Update local game state board with the received data
	gameState.board = boardData;
	
	// Count non-empty cells without excessive logging
	let nonEmptyCells = 0;
	let chessCells = 0;
	
	// Look for any problematic cells and log diagnostics
	for (const key in boardData.cells) {
		const [x, z] = key.split(',').map(Number);
		const cell = boardData.cells[key];
		
		if (cell !== null) {
			nonEmptyCells++;
			
			// Check for chess cells that might cause errors
			if (typeof cell === 'object' && cell !== null && cell.type === 'chess') {
				chessCells++;
				if (!cell.chessPiece?.type) {
					console.warn(`Chess cell missing pieceType at (${x},${z}):`, cell);
					// Add a default pieceType to prevent errors
					cell.chessPiece.type = 'PAWN';
				}
			}
		}
	}
	
	// Log summarized info
	console.log(`Board updated with ${nonEmptyCells} non-empty cells, including ${chessCells} chess cells`);
	
	// Update the visual representation
	updateBoardVisuals();
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
	if (typeof boardFunctions !== 'undefined' && boardFunctions.createBoardCells) {
		// Use the boardFunctions module
		boardFunctions.createBoardCells(gameState, boardGroup, createFloatingIsland, THREE);
	} else {
		// If function not available from module, use local function if it exists
		if (typeof createBoardCells === 'function') {
			createBoardCells();
		} else {
			console.warn('createBoardCells function not available');
		}
	}
	
	// Check if we have valid board data
	if (!gameState.board || typeof gameState.board !== 'object' || !gameState.board.cells) {
		console.warn('No board data to visualize');
		return;
	}
	
	// Debug output of the actual board structure
	console.log('Board structure sample:', 
		gameState.board.cells ? `${Object.keys(gameState.board.cells).length} cells` : 'Empty');
	
	// Initialize chess pieces array if needed
	if (!gameState.chessPieces) {
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
			// Handle object-based cell data
			if (cellType.type === 'chess') {
				// Chess piece - add it to gameState.chessPieces for separate handling
				
				// Check if this piece is already in the array
				const existingIndex = gameState.chessPieces.findIndex(p => 
					p.position && p.position.x === x && p.position.z === z);
				
				if (existingIndex === -1) {
					// Add new piece to the array
					gameState.chessPieces.push({
						position: { x, z },
						type: cellType.chessPiece?.type || "PAWN",
						player: cellType.player || 1
					});
				} else {
					// Update existing piece
					gameState.chessPieces[existingIndex] = {
						position: { x, z },
						type: cellType.chessPiece?.type || "PAWN",
						player: cellType.player || 1
					};
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
			// Simple numeric cell type (legacy format)
			// Values 6, 7 etc. are home zones for different players
			if (cellType >= 6 && cellType <= 10) {
				// Home zone
				updateHomeZoneVisual(x, z, cellType);
			} else if (cellType > 0) {
				// Tetromino block or other non-zero cell
				createTetrominoBlock(x, z, cellType);
			}
		}
	}
	
	// After creating all board elements, update the chess pieces
	updateChessPieces();
}

// Add this function to handle LOD (Level of Detail) switching based on camera distance
function updateChessPiecesLOD() {
	// Skip if we don't have camera or pieces
	if (!camera || !chessPiecesGroup) return;
	
	// Get camera position for distance calculations
	const cameraPos = camera.position.clone();
	
	// Process each chess piece
	chessPiecesGroup.children.forEach(piece => {
		if (!piece.userData || !piece.userData.type) return;
		
		// Get piece position (in world space)
		const piecePos = new THREE.Vector3(
			piece.position.x,
			piece.position.y,
			piece.position.z
		);
		
		// Calculate distance to camera
		const distance = cameraPos.distanceTo(piecePos);
		
		// Adjust detail level based on distance
		if (distance > 20) {
			// Far away - use simpler representation
			// Scale down the piece height to make it more visible from a distance
			if (piece.scale.y !== 1.5) {
				piece.scale.set(1.0, 1.5, 1.0);
				
				// Make colors more vibrant for visibility
				piece.children.forEach(child => {
					if (child.material) {
						// Increase emissive intensity for better visibility
						if (child.material.emissiveIntensity !== undefined) {
							child.material.emissiveIntensity = 0.4;
						}
					}
				});
			}
		} else {
			// Close up - use normal proportions and detail
			if (piece.scale.y !== 1.0) {
				piece.scale.set(1.0, 1.0, 1.0);
				
				// Reset emissive intensity
				piece.children.forEach(child => {
					if (child.material) {
						if (child.material.emissiveIntensity !== undefined) {
							child.material.emissiveIntensity = 0.2;
						}
					}
				});
			}
		}
	});
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

function initEventListeners() {
	// Add existing event listeners

	// ... existing code ...

	// Add a T key listener for Tetris phase
	window.addEventListener('keydown', function(event) {
		if (event.key === 't' || event.key === 'T') {
			console.log("T key pressed - switching to Tetris phase");
			handleTetrisPhaseClick();
		}
	});

	// ... existing code ...
}

// Add a debug key listener to check game state
window.addEventListener('keydown', function(event) {
	if (event.key === 'd' || event.key === 'D') {
		console.log("Debug game state:", gameState);
		console.log("Board bounds:", gameState.boardBounds);
		console.log("Chess pieces:", gameState.chessPieces);
		console.log("Current tetromino:", gameState.currentTetromino);
	}
});

// Backup function for rendering tetrominos
function renderCurrentTetromino() {
	const tetromino = gameState.currentTetromino;
	if (!tetromino || !tetromino.shape) return;
	
	// Use the imported boardFunctions module
	if (typeof boardFunctions !== 'undefined' && boardFunctions.renderTetromino) {
		boardFunctions.renderTetromino(
			gameState,
			tetromino,
			tetrominoGroup,
			createTetrominoBlock
		);
		return;
	}
	
	// Fallback implementation
	// Clear existing tetromino group
	while (tetrominoGroup.children.length > 0) {
		tetrominoGroup.remove(tetrominoGroup.children[0]);
	}
	
	// Iterate through the tetromino shape
	for (let z = 0; z < tetromino.shape.length; z++) {
		for (let x = 0; x < tetromino.shape[z].length; x++) {
			if (tetromino.shape[z][x] === 1) {
				// Calculate block position
				const blockX = tetromino.position.x + x;
				const blockZ = tetromino.position.z + z;
				
				// Create a tetromino block
				createTetrominoBlock(
					blockX, 
					blockZ, 
					tetromino.player, 
					false, 
					tetromino.heightAboveBoard || 0
				);
			}
		}
	}
}

/**
 * Generate spiral home zones for all players
 */
function generateSpiralHomeZones() {
	// Get board dimensions for spiral calculations
	const minX = gameState.boardBounds?.minX || 0;
	const maxX = gameState.boardBounds?.maxX || 20;
	const minZ = gameState.boardBounds?.minZ || 0;
	const maxZ = gameState.boardBounds?.maxZ || 20;
	const boardWidth = gameState.boardWidth || (maxX - minX + 1);
	const boardHeight = gameState.boardHeight || (maxZ - minZ + 1);
	
	// Default to at least 2 players if none are set
	const playerCount = gameState.players ? Object.keys(gameState.players).length : 2;
	const homeZoneWidth = 8; // Standard chess width
	const homeZoneHeight = 2; // Standard chess height
	
	// Generate home zones in spiral pattern
	const homeZones = {};
	
	// For each potential player (1-indexed players as commonly used)
	for (let player = 1; player <= Math.max(5, playerCount); player++) {
		// Calculate player index (0-based) for spiral position
		const playerIndex = player - 1;
		
		// Get spiral position
		const spiralPosition = calculateSpiralHomePosition(
			playerIndex,
			Math.max(5, playerCount), // Ensure we account for at least 5 potential players
			boardWidth,
			boardHeight,
			homeZoneWidth,
			homeZoneHeight
		);
		
		// Store home zone information
		homeZones[player] = {
			x: spiralPosition.x,
			z: spiralPosition.z,
			width: homeZoneWidth,
			height: homeZoneHeight,
			orientation: spiralPosition.orientation
		};
		
		// Create home zone cells on the board
		for (let dz = 0; dz < homeZoneHeight; dz++) {
			for (let dx = 0; dx < homeZoneWidth; dx++) {
				const x = spiralPosition.x + dx;
				const z = spiralPosition.z + dz;
				
				// Set cell as home zone
				if (!gameState.board.cells) {
					gameState.board.cells = {};
				}
				
				// Cell key in format "x,z"
				const cellKey = `${x},${z}`;
				
				// Create or update the cell
				gameState.board.cells[cellKey] = {
					type: 'homeZone',
					player: player
				};
				
				// Create visual indicator for home zone
				updateHomeZoneVisual(x, z, player + 5); // +5 to get correct zone type (6-10)
			}
		}
	}
	
	// Store home zones in game state
	gameState.homeZones = homeZones;
}

/**
 * Handle tetris phase debug click
 */
function handleTetrisPhaseClick() {
	gameState.turnPhase = 'tetris';

	// Force refresh piece visibility
	updateGameStatusDisplay();

	// Make sure pieces are shown/hidden correctly
	updateBoardVisuals();

	// Render the current tetromino if we have one
	try {
		if (gameState.currentTetromino && boardFunctions && typeof boardFunctions.renderTetromino === 'function') {
			console.log("Rendering tetromino:", gameState.currentTetromino);
			console.log("Using createTetrominoBlock:", typeof createTetrominoBlock === 'function' ? "Available" : "Not available");
			console.log("tetrominoGroup:", tetrominoGroup);
			
			// Define the block creation function to pass to renderTetromino
			const blockCreationFunction = typeof createTetrominoBlock === 'function' 
				? (x, z, type, isGhost, height) => createTetrominoBlock(x, z, type, isGhost, height)
				: null;
			
			boardFunctions.renderTetromino(
				gameState, 
				gameState.currentTetromino, 
				tetrominoGroup, 
				blockCreationFunction
			);
			
			console.log("Tetromino rendered, blocks in group:", tetrominoGroup.children.length);
		} else if (gameState.currentTetromino) {
			console.warn("No renderTetromino function available");
		}
	} catch (err) {
		console.error("Error rendering tetromino:", err);
	}

	console.log("Debug: Switched to TETRIS phase");
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
 * Update chess pieces visualization
 */
function updateChessPieces() {
	// Get board center for correct positioning
	const minX = gameState.boardBounds?.minX || 0;
	const maxX = gameState.boardBounds?.maxX || 20;
	const minZ = gameState.boardBounds?.minZ || 0;
	const maxZ = gameState.boardBounds?.maxZ || 20;
	
	// Calculate board center (where 0,0 should be rendered)
	const centerX = (minX + maxX) / 2;
	const centerZ = (minZ + maxZ) / 2;
	
	// Clear existing chess pieces
	while (chessPiecesGroup.children.length > 0) {
		chessPiecesGroup.remove(chessPiecesGroup.children[0]);
	}
	
	// Check if we have pieces to display
	if (!gameState.chessPieces || gameState.chessPieces.length === 0) {
		return;
	}
	
	// Cache for positions that have been updated
	const updatedPositions = new Set();
	
	// Create visual pieces for each chess piece in the game state
	for (let i = 0; i < gameState.chessPieces.length; i++) {
		const piece = gameState.chessPieces[i];
		
		// Validate piece data
		if (!piece || !piece.position || piece.position.x === undefined || piece.position.z === undefined) {
			console.warn(`Invalid chess piece data at index ${i}:`, piece);
			continue;
		}
		
		// Create a unique key for this position
		const key = `${piece.position.x},${piece.position.z}`;
		updatedPositions.add(key);
		
		// Determine piece type - handle multiple formats
		let pieceType = piece.type;
		if (typeof pieceType === 'number') {
			// Convert numeric type to string
			switch (pieceType) {
				case 1: pieceType = 'PAWN'; break;
				case 2: pieceType = 'KNIGHT'; break;
				case 3: pieceType = 'BISHOP'; break;
				case 4: pieceType = 'ROOK'; break;
				case 5: pieceType = 'QUEEN'; break;
				case 6: pieceType = 'KING'; break;
				default: pieceType = 'PAWN';
			}
		}
		
		// Get orientation from the piece data or player's home zone
		let orientation = 0; // Default orientation
		
		// Use piece orientation if provided
		if (piece.orientation !== undefined) {
			orientation = piece.orientation;
		} 
		// Or check if player's home zone has orientation data
		else if (piece.player && gameState.homeZones && gameState.homeZones[piece.player]) {
			orientation = gameState.homeZones[piece.player].orientation || 0;
		}
		
		// Create piece with proper center coordinates for alignment gameState, x, z, pieceType, playerIdent, ourPlayerIdent, THREE
		const chessPiece = boardFunctions.createChessPiece(
			gameState,
			piece.position.x, 
			piece.position.z, 
			pieceType, 
			piece.player, 
			gameState.currentPlayer,
			orientation,
			THREE
		);
		
		// Add to the group
		chessPiecesGroup.add(chessPiece);
	}
	
	// Remove pieces that are no longer in the game state
	chessPiecesGroup.children.slice().forEach(piece => {
		if (piece.userData && piece.userData.position) {
			const key = `${piece.userData.position.x},${piece.userData.position.z}`;
			if (!updatedPositions.has(key)) {
				chessPiecesGroup.remove(piece);
			}
		}
	});
	
	// Update LOD for remaining pieces
	updateChessPiecesLOD();
}

/**
 * Creates a tetromino block at the specified position
 * @param {number} x - X position
 * @param {number} z - Z position
 * @param {number|string} playerType - Player identifier
 * @param {boolean} isGhost - Whether this is a ghost piece to show landing position
 * @param {number} heightAboveBoard - Height above the board (y position)
 * @returns {Object} THREE.js Object3D containing the tetromino block
 */
function createTetrominoBlock(x, z, playerType, isGhost = false, heightAboveBoard = 0) {
	// Get board center for correct positioning
	const minX = gameState.boardBounds?.minX || 0;
	const maxX = gameState.boardBounds?.maxX || 20;
	const minZ = gameState.boardBounds?.minZ || 0;
	const maxZ = gameState.boardBounds?.maxZ || 20;
	
	// Calculate board center
	const centerX = (minX + maxX) / 2;
	const centerZ = (minZ + maxZ) / 2;

	// Create a group for the block
	const blockGroup = new THREE.Group();
	
	// Store metadata for identification
	blockGroup.userData = {
		type: 'tetrominoBlock',
		position: { x, z },
		player: playerType
	};
	
	// Set position relative to board center with height offset
	blockGroup.position.set(x - centerX, heightAboveBoard, z - centerZ);
	
	// Determine block color based on player type
	let color;
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
	
	// Make ghost pieces transparent
	const opacity = isGhost ? 0.3 : 1.0;
	
	// Create block geometry (slightly smaller than a unit cube for visibility)
	const geometry = new THREE.BoxGeometry(0.9, 0.9, 0.9);
	const material = new THREE.MeshStandardMaterial({
		color: color,
		transparent: isGhost,
		opacity: opacity,
		metalness: 0.3,
		roughness: 0.7
	});
	
	const mesh = new THREE.Mesh(geometry, material);
	mesh.castShadow = !isGhost;
	mesh.receiveShadow = !isGhost;
	
	// Add to group
	blockGroup.add(mesh);
	
	return blockGroup;
}