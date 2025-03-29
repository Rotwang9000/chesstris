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

// Export THREE getter function for modules that need it
export function getTHREE() {
	// Ensure THREE is available
	if (!THREE) {
		console.error('THREE.js not available. Game will not function correctly.');
	}
	
	return THREE;
}

/**
 * Get the current game state
 * @returns {Object} - Current game state
 */
export function getGameState() {
	return gameState;
}

// Import other modules
import * as NetworkManager from './utils/networkManager.js';
import { animateClouds } from './textures.js';

import { showToastMessage } from './showToastMessage.js';
import { createNetworkStatusDisplay,  } from './createNetworkStatusDisplay.js';
import * as sceneModule from './scene.js';
import { boardFunctions } from './boardFunctions.js';
import { createLoadingIndicator, hideAllLoadingElements, showErrorMessage, hideError, updateGameIdDisplay, updateGameStatusDisplay, updateNetworkStatus } from './createLoadingIndicator.js';
import { moveTetrominoY, moveTetrominoX, moveTetrominoForwardBack, createTetrominoBlock, showPlacementEffect, tetrominoModule } from './tetromino.js';
import { resetCameraForGameplay } from './setupCamera.js';
import { showTutorialMessage } from './createLoadingIndicator.js';
import { preserveCentreMarker, updateCellPreservingMarker, findBoardCentreMarker, createCentreMarker } from './centreBoardMarker.js';
import { updateUnifiedPlayerBar, createUnifiedPlayerBar } from './unifiedPlayerBar.js';
import { updateChessPieces } from './updateChessPieces.js';
import chessPieceCreator from './chessPieceCreator.js';
import { setChessPiecesGroup, highlightPlayerPieces, removePlayerPiecesHighlight, highlightCurrentPlayerPieces } from './pieceHighlightManager.js';

// Core game state
let gameState = {
	lastGameTime: 0,
	players: {},
	chessPieces: [],
	board: { cells: {} },
	selectedPiece: null,
	phase: 'unknown',
	localPlayerId: null,
	currentPlayer: generateRandomPlayerId(), // Use random player ID
	debugMode: false,  // Disable debug mode now that issues are fixed
	activeTetromino: null,
	tetrominoList: [],
	hoveredCell: { x: -1, y: -1, z: -1 },
	gameOver: false,
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
	error: null,
	currentTetromino: null,
	boardCenter: { x: 0, y: 0, z: 0 },
	isProcessingHardDrop: false
};

/**
 * Generate a random player ID
 * @returns {string} Random player ID
 */
function generateRandomPlayerId() {
	return 'player_' + Math.random().toString(36).substring(2, 10);
}

// Cached DOM elements
let containerElement, gameContainer;
let scene, camera, renderer, controls, animationFrameId = null;
let boardGroup, tetrominoGroup, chessPiecesGroup;
let raycaster, mouse;
let clouds = null, animationQueue = [];

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
	other: 0x0088AA   // Blue-green for all other players - should come from server tho
};

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
export const TETROMINO_START_HEIGHT = 7; // Starting height above the board

// UI controls for game flow
let uiButtons = {};

// Constants for axis helper
const AXIS_LENGTH = 20;
const AXIS_LABEL_SIZE = 1.0;
const AXIS_LABEL_OFFSET = 1.2;

/**
 * Initialize the game
 * @param {HTMLElement} container - The container to render the game in
 * @returns {boolean} - Whether initialization was successful
 */
export function initGame(container) {
	console.log("Initializing Shaktris game...");
	
	try {
		// Create a thematic loading indicator
		const loadingIndicator = createLoadingIndicator();
		console.log("Loading indicator created");

		// Check if in development mode
		const isDevMode = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
		if (isDevMode) {
			console.log("Development mode detected: enabling debug features");
			gameState.debugMode = true;
		}

		// Initialize game state
		console.log("Initializing game state...");
		resetGameState(gameState);
		
		// Ensure debug mode is preserved across resets if in dev mode
		if (isDevMode) {
			gameState.debugMode = true;
		}
		
		// Expose highlight functions globally for player list sidebar
		exposeHighlightFunctionsGlobally();

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

		// Initialize materials for chess pieces
		console.log("Initializing chess piece materials...");
		chessPieceCreator.initMaterials();
		
		// Initialize THREE.js scene
		console.log("Creating THREE.js scene...");
		scene = new THREE.Scene();
		// Use a pleasant sky blue color
		scene.background = new THREE.Color(0xAFE9FF);
		scene.fog = new THREE.Fog(0xC5F0FF, 60, 150);
		
		console.log("Creating camera...");
		camera = new THREE.PerspectiveCamera(75, containerWidth / containerHeight, 0.1, 1000);
		camera.position.set(20, 25, 20);
		camera.lookAt(8, 0, 8);
		
		// Set up renderer with proper pixel ratio for sharper rendering
		console.log("Creating renderer...");
		renderer = new THREE.WebGLRenderer({ 
			antialias: true,
			alpha: true,
			powerPreference: 'high-performance'
		});
		renderer.setPixelRatio(window.devicePixelRatio);
		renderer.setSize(containerWidth, containerHeight);
		renderer.shadowMap.enabled = true;
		renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		
		// Clear container before adding new renderer
		console.log("Preparing container...");
		while (containerElement.firstChild) {
			containerElement.removeChild(containerElement.firstChild);
		}
		
		// Add renderer to container
		containerElement.appendChild(renderer.domElement);

		// Check if renderer is successfully attached
		if (!containerElement.contains(renderer.domElement)) {
			console.error("Renderer canvas was not successfully attached to container");
			// Force attach
			containerElement.appendChild(renderer.domElement);
		}
		
		// Add lights to the scene
		console.log("Setting up lights...");
		sceneModule.setupLights(scene);
		
		// Set up camera position and controls
		console.log("Setting up camera and controls...");
		controls = initializeOrbitControls(camera, renderer.domElement);
		
		if (!controls) {
			console.error("Failed to initialize orbit controls");
		} else {
			// Show a toast message that controls are ready
			setTimeout(() => {
				if (typeof showToastMessage === 'function') {
					showToastMessage("Game controls active. Click and drag to move camera.", 8000);
				}
			}, 1500);
		}
		hideError();
		// Initialize scene components
		console.log("Setting up scene components...");
		initializeScene();
		
		// Set up the event system
		console.log("Setting up event system...");
		setupEventSystem();
		
		// Setup network events - this should happen BEFORE requesting data
		console.log("Set up network events...");
		setupNetworkEvents();
		
		// Ensure network connection
		if (NetworkManager && NetworkManager.ensureConnected) {
			console.log("Ensuring network connection...");
			NetworkManager.ensureConnected();
		}
		
		// Request game state after the network is set up
		console.log("Requesting initial game state...");
		requestGameState();
		
		// Initialize UI with player bar but without start button
		console.log("Setting up game UI...");
		initializeGameUI();
		
		// Hide the start button as we'll show the tutorial instead
		if (uiButtons && uiButtons.startButton) {
			uiButtons.startButton.style.display = 'none';
		}

		// Show tutorial message with a delay to allow the scene to render first
		setTimeout(() => {
			// Make sure startPlayingGame is accessible globally
			window.startShaktrisGame = startPlayingGame;
			
			console.log("Showing tutorial message...");
			showTutorialMessage(window.startShaktrisGame);
			// Reset camera position based on received data 
			console.log("Resetting camera based on received game data");
			resetCameraForGameplay(renderer, camera, controls, gameState, scene, true, false);

		}, 500);
		
		// Start game loop
		console.log("Starting game loop...");
		startGameLoop();
		
		// Set up a mechanism to hide loading screen if game state doesn't arrive
		setTimeout(() => {
			const loadingElement = document.getElementById('loading');
			if (loadingElement && loadingElement.style.display !== 'none') {
				console.log("Loading screen timeout - hiding loading screen forcibly");
				loadingElement.style.display = 'none';
			}
		}, 10000); // 10 seconds timeout
		
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
 * Initialize the scene components
 */
function initializeScene() {
	// Create or initialize groups if they don't exist
	if (!boardGroup) {
		boardGroup = new THREE.Group();
		boardGroup.name = 'boardGroup';
		scene.add(boardGroup);
	}
	
	if (!tetrominoGroup) {
		tetrominoGroup = new THREE.Group();
		tetrominoGroup.name = 'tetrominos';
		scene.add(tetrominoGroup);
	}
	
	// Initialize the tetromino group
	gameState.tetrominoGroup = tetrominoGroup;
	
	if (!chessPiecesGroup) {
		chessPiecesGroup = new THREE.Group();
		chessPiecesGroup.name = 'chessPieces';
		scene.add(chessPiecesGroup);
		
		// Initialize the chess pieces group in the highlight manager
		setChessPiecesGroup(chessPiecesGroup);
	}
	
	// Initialize raycaster for interactions
	raycaster = new THREE.Raycaster();
	mouse = new THREE.Vector2();
	
	// Add axis helpers if in debug mode
	if (gameState.debugMode) {
		createLabeledAxisHelpers();
	}
	
	// Set up input handlers
	console.log("Setting up input handlers...");
	setupInputHandlers();
	
	// Force a render of the scene to show something
	if (renderer && scene && camera) {
		renderer.render(scene, camera);
	}
}

/**
 * Create labeled axis helpers for development mode
 */
function createLabeledAxisHelpers() {
	// First add the standard THREE.js AxesHelper
	const axesHelper = new THREE.AxesHelper(AXIS_LENGTH);
	axesHelper.name = 'axesHelper';
	scene.add(axesHelper);
	
	// Create a group to hold the labels
	const labelsGroup = new THREE.Group();
	labelsGroup.name = 'axisLabels';
	scene.add(labelsGroup);
	
	// Create text for X axis (red)
	createAxisLabel('X', new THREE.Vector3(AXIS_LENGTH * AXIS_LABEL_OFFSET, 0, 0), 0xff0000, labelsGroup);
	createAxisLabel('-X', new THREE.Vector3(-AXIS_LENGTH * AXIS_LABEL_OFFSET, 0, 0), 0xff0000, labelsGroup);
	
	// Create text for Y axis (green)
	createAxisLabel('Y', new THREE.Vector3(0, AXIS_LENGTH * AXIS_LABEL_OFFSET, 0), 0x00ff00, labelsGroup);
	createAxisLabel('-Y', new THREE.Vector3(0, -AXIS_LENGTH * AXIS_LABEL_OFFSET, 0), 0x00ff00, labelsGroup);
	
	// Create text for Z axis (blue)
	createAxisLabel('Z', new THREE.Vector3(0, 0, AXIS_LENGTH * AXIS_LABEL_OFFSET), 0x0000ff, labelsGroup);
	createAxisLabel('-Z', new THREE.Vector3(0, 0, -AXIS_LENGTH * AXIS_LABEL_OFFSET), 0x0000ff, labelsGroup);
	
	console.log('Axis helpers added to scene for development mode');
}

/**
 * Create a text label for an axis
 * @param {string} text - The text to display
 * @param {THREE.Vector3} position - The position of the label
 * @param {number} color - The color of the label
 * @param {THREE.Group} group - The group to add the label to
 */
function createAxisLabel(text, position, color, group) {
	// Create a canvas for the text
	const canvas = document.createElement('canvas');
	const context = canvas.getContext('2d');
	canvas.width = 128;
	canvas.height = 64;
	
	// Set up the canvas
	context.fillStyle = 'rgba(0, 0, 0, 0)';
	context.fillRect(0, 0, canvas.width, canvas.height);
	
	// Draw the text
	context.font = 'bold 40px Arial';
	context.textAlign = 'center';
	context.textBaseline = 'middle';
	
	// Convert hex color to CSS color string
	const r = (color >> 16) & 255;
	const g = (color >> 8) & 255;
	const b = color & 255;
	context.fillStyle = `rgb(${r}, ${g}, ${b})`;
	
	context.fillText(text, canvas.width / 2, canvas.height / 2);
	
	// Create a texture from the canvas
	const texture = new THREE.CanvasTexture(canvas);
	texture.needsUpdate = true;
	
	// Create a material with the texture
	const material = new THREE.SpriteMaterial({
		map: texture,
		transparent: true
	});
	
	// Create a sprite with the material
	const sprite = new THREE.Sprite(material);
	sprite.position.copy(position);
	sprite.scale.set(AXIS_LABEL_SIZE * 2, AXIS_LABEL_SIZE, 1);
	
	// Add the sprite to the group
	group.add(sprite);
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
			updateGameState(e.detail, tetrominoGroup);
			
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
				updateBoardVisuals();
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
export function resetGameState(gameState) {
	// Save debug mode value to restore it later
	const wasDebugMode = gameState.debugMode;
	
	// Reset core game properties
	gameState.turnPhase = 'tetris';
	gameState.inProgress = false;
	gameState.paused = false;
	gameState.score = 0;
	gameState.level = 1;
	
	// Initialize empty board
	gameState.board = {

		cells: {}
	};
	
	// Clear any existing tetromino
	gameState.currentTetromino = null;
	
	// Set initial center position
	gameState.boardCenter = { x: 0, y: 0, z: 0 };
	
	// Reset camera position
	if (gameState.camera) {
		gameState.camera.position.set(0, 15, 20);
		gameState.camera.lookAt(0, 0, 0);
	}
	
	// Restore debug mode if it was enabled before reset
	gameState.debugMode = wasDebugMode;
	
	
	console.log('Game state has been reset');
}


/**
 * Handle window resize
 */
export function onWindowResize(camera, renderer, containerElement) {
	if (!camera || !renderer || !containerElement) {
		console.error('Missing required parameters for window resize');
		return;
	}
	
	try {
		// Update camera aspect ratio
		if (camera.isPerspectiveCamera) {
			camera.aspect = containerElement.clientWidth / containerElement.clientHeight;
			camera.updateProjectionMatrix();
		}
		
		// Update renderer size
		renderer.setSize(containerElement.clientWidth, containerElement.clientHeight);
		
		// Import the tetromino module to synchronize center positions
		tetrominoModule.synchronizeCenterPositions(gameState);
		
		// Force a render
		renderer.render(gameState.scene, camera);
		
		console.log(`Window resized: ${containerElement.clientWidth}x${containerElement.clientHeight}`);
	} catch (error) {
		console.error('Error during window resize:', error);
	}
}


/**
 * Start the actual game play
 */
export function startPlayingGame() {
	console.log('Starting game...');
	// Reset camera position based on received data 
	console.log("Resetting camera based on received game data");
	resetCameraForGameplay(renderer, camera, controls, gameState, scene, true, false);

	try {
		// Clear any error states first
		gameState.error = null;
		
		// Ensure the current player is set to the local player if available
		if (gameState.localPlayerId) {
			console.log(`Setting current player to local player ID: ${gameState.localPlayerId}`);
			gameState.currentPlayer = gameState.localPlayerId;
		} else {
			console.log(`No local player ID available, using current player: ${gameState.currentPlayer}`);
		}
		hideError();
		// Initialize phase to tetris phase as default
		gameState.turnPhase = 'tetris';
		
		// Initialize a random tetromino if we don't have one
		if (!gameState.currentTetromino) {
			console.log('Creating initial tetromino');
			gameState.currentTetromino = tetrominoModule.initializeNextTetromino(gameState);
		}
		
		// Set the gameStarted flag to true
		gameState.gameStarted = true;
		
		// Initialize the tetris fall time
		tetrisLastFallTime = Date.now();
		
		// Set a height above board for animation effect
		gameState.currentTetromino.heightAboveBoard = TETROMINO_START_HEIGHT;
		
		// Render the current tetromino
		renderCurrentTetromino();
		
		// Update the game status display
		updateGameStatusDisplay();
		
		// Update board visuals to show the current game state
		updateBoardVisuals();
		
		console.log('Game started with tetromino:', gameState.currentTetromino);

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
function updateGameState(data, tetrominoGroup) {
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
	
	// Update the tetromino group
	gameState.tetrominoGroup = tetrominoGroup;
	
	console.log("Game state updated:", gameState);
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
	
	// Mouse events - only add these if we're not using OrbitControls
	// OrbitControls adds its own mouse event handlers
	if (!controls || !controls.enabled) {
		console.log("Setting up game-specific mouse handlers");
		containerElement.addEventListener('mousedown', handleMouseDown);
		containerElement.addEventListener('mousemove', handleMouseMove);
		
		// Add touch support for mobile
		containerElement.addEventListener('touchstart', handleTouchStart, { passive: false });
		containerElement.addEventListener('touchmove', handleTouchMove, { passive: false });
		containerElement.addEventListener('touchend', handleTouchEnd, { passive: false });
	} else {
		console.log("Using OrbitControls for mouse handling - game-specific handlers not added");
	}
	
	// Add a diagnostic message to help debug
	console.log("Input handler setup complete. Controls status:", controls ? "available" : "not available");
}

/**
 * Handle keyboard input
 * @param {KeyboardEvent} event - Keyboard event
 */
function handleKeyDown(event) {
	// Check for debug mode toggle (Ctrl+D)
	if (event.key === 'd' && event.ctrlKey) {
		event.preventDefault();
		gameState.debugMode = !gameState.debugMode;
		console.log(`Debug mode ${gameState.debugMode ? 'enabled' : 'disabled'}`);
		
		// Update axis helpers visibility
		updateAxisHelpersVisibility();
		
		// Show toast message
		if (typeof showToastMessage === 'function') {
			showToastMessage(`Debug mode ${gameState.debugMode ? 'enabled' : 'disabled'}`, 3000);
		}
		
		return;
	}
	
	// Check if we have a tetromino to manipulate, we'll need this for most commands
	if (!gameState.currentTetromino) {
		// Check for spacebar in empty state to start tetris phase
		if (event.key === ' ' && gameState.turnPhase === 'chess') {
			event.preventDefault();
			handleTetrisPhaseClick();
			return;
		}
		return;
	}
	
	// Only proceed in the tetris phase
	if (gameState.turnPhase !== 'tetris') {
		return;
	}
	
	// Flag to track if we need to re-render
	let moved = false;
	
	
	// Handle key based on its code
	switch (event.key) {
		case 'ArrowLeft':
			// Move tetromino left along X-axis
			console.log('Move left (X-axis)');
			if (tetrominoModule.moveTetrominoX(-1, gameState)) {
				renderCurrentTetromino();
			}
			moved = true;
			break;
		case 'ArrowRight':
			// Move tetromino right along X-axis
			console.log('Move right (X-axis)');
			if (tetrominoModule.moveTetrominoX(1, gameState)) {
				renderCurrentTetromino();
			}
			moved = true;
			break;
		case 'ArrowDown':
			// Move tetromino backward along Z-axis (away from camera)
			console.log('Move backward (Z-axis)');
			if (tetrominoModule.moveTetrominoZ(1, gameState)) {
				renderCurrentTetromino();
			}
			moved = true;
			break;
		case 'ArrowUp':
			// Move tetromino forward along Z-axis (toward camera) 
			console.log('Move forward (Z-axis)');
			if (tetrominoModule.moveTetrominoZ(-1, gameState)) {
				renderCurrentTetromino();
			}
			moved = true;
			break;

		case 'z':
		case 'Z':
			// Rotate tetromino counterclockwise
			console.log('Rotate CCW');
			if (tetrominoModule.rotateTetromino(-1, gameState)) {
				renderCurrentTetromino();
			}
			moved = true;
			break;
		case 'x':
		case 'X':
			// Rotate tetromino clockwise
			console.log('Rotate CW');
			if (tetrominoModule.rotateTetromino(1, gameState)) {
				renderCurrentTetromino();
			}
			moved = true;
			break;

		case ' ':
			// Hard drop tetromino
			console.log('Hard drop (Y-axis)');
			event.preventDefault(); // Prevent page scrolling
			
			// Prevent multiple processing of the same keypress
			if (gameState.isProcessingHardDrop) {
				console.log('Already processing a hard drop, ignoring');
				return;
			}
			
			gameState.isProcessingHardDrop = true;
			
			// First use hardDropTetromino to drop the piece
			if (tetrominoModule.hardDropTetromino(gameState)) {
				// Ensure the current tetromino is rendered in its new position
				renderCurrentTetromino();
				
				// Force a render update to show the dropped tetromino
				if (renderer && scene && camera) {
					renderer.render(scene, camera);
				}
				
				// Then attempt to place it with a short delay to ensure the drop animation is visible
				setTimeout(() => {
					if (typeof tetrominoModule.enhancedPlaceTetromino === 'function') {
						tetrominoModule.enhancedPlaceTetromino(gameState)
							.then(result => {
								// If placement failed, we already transitioned to chess phase in enhancedPlaceTetromino
								// If successful, we continue the game flow
								if (result === true) {
									console.log('Tetromino placed successfully');
									// Make sure to update the board visuals
									if (typeof gameState.updateBoardVisuals === 'function') {
										gameState.updateBoardVisuals();
									}
								} else {
									console.log('Tetromino placement failed, now in chess phase');
									// Force a scene update after phase change
									if (renderer && scene && camera) {
										renderer.render(scene, camera);
									}
								}
								
								// Reset the processing flag
								gameState.isProcessingHardDrop = false;
							})
							.catch(err => {
								console.error('Error during tetromino placement:', err);
								// Ensure we still transition to chess phase on error
								gameState.turnPhase = 'chess';
								updateGameStatusDisplay();
								// Force a scene update after phase change
								if (renderer && scene && camera) {
									renderer.render(scene, camera);
								}
								
								// Reset the processing flag
								gameState.isProcessingHardDrop = false;
							});
					} else {
						// Fallback to legacy placement if the function isn't exported
						legacy_placeTetromino();
						
						// Reset the processing flag
						gameState.isProcessingHardDrop = false;
					}
				}, 100); // Short delay to ensure drop animation is visible
			} else {
				console.log('Hard drop failed, no valid position found');
				gameState.isProcessingHardDrop = false;
			}
			
			moved = true;
			break;
	}
	
	// If tetromino moved, this will trigger a re-render after imports are resolved
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
			console.log("Skipping large delta frame:", delta);
			return;
		}
		
		// Update game logic elements if not paused
		if (!gameState.paused) {
			// Always update controls every frame for smooth camera movement
			if (controls) {
				controls.update();
			}
			
			// Calculate time since last controls update
			const timeSinceControlsUpdate = time - lastControlsUpdate;
			
			// Update controls more frequently for responsive UI
			if (timeSinceControlsUpdate > 16) { // ~60fps
				if (controls) {
					controls.update();
				}
				lastControlsUpdate = time;
			}
			
			// Update camera position display if available
			if (window.cameraInfoDisplay && time - window.cameraInfoDisplay.lastUpdate > window.cameraInfoDisplay.updateInterval) {
				try {
					updateCameraInfoDisplay();
					window.cameraInfoDisplay.lastUpdate = time;
				} catch (err) {
					// Silently handle errors to avoid console spam
				}
			}
			
			// Update animated clouds - ensure clouds array exists and contains valid objects
			// Only update on heavy operation frames to reduce load
			if (isHeavyOperationFrame && clouds && Array.isArray(clouds)) {
				for (let i = 0; i < clouds.length; i++) {
					if (clouds[i]) {
						clouds[i].rotation.y += 0.001 * delta * 3; // Multiply by 3 since we're updating every 3rd frame
					}
				}
			}
			
			// Process pending animations - this is lightweight so can run every frame
			if (animationQueue && animationQueue.length > 0) {
				processAnimationQueue();
			}
			
			// Update player bar periodically 
			const UI_UPDATE_INTERVAL = 2000; // Update UI every 2 seconds (reduced frequency)
			const timeSinceUiUpdate = time - lastUiUpdate;
			if (timeSinceUiUpdate > UI_UPDATE_INTERVAL) {
				// Update player bar
				if (typeof updateUnifiedPlayerBar === 'function') {
					try {
						updateUnifiedPlayerBar(gameState);
					} catch (playerBarError) {
						console.error('Error updating player bar:', playerBarError);
					}
				}
				
				// Update chess pieces
				if (typeof updateChessPieces === 'function' && chessPiecesGroup) {
					try {
						updateBoardVisuals();
					} catch (chessPiecesError) {
						console.error('Error updating chess pieces:', chessPiecesError);
					}
				}
				
				lastUiUpdate = time;
			}
		}
		
		// Handle TWEEN animations if available - lightweight, can run every frame
		if (window.TWEEN) {
			window.TWEEN.update();
		}
		
		// Update FPS counter
		frameCount++;
		const timeSinceFpsUpdate = time - lastFpsUpdate;
		if (timeSinceFpsUpdate > 1000) { // Every second
			const fps = Math.round((frameCount * 1000) / timeSinceFpsUpdate);
			frameCount = 0;
			lastFpsUpdate = time;
			
			// Store FPS for camera info display
			if (window.cameraInfoDisplay) {
				window.cameraInfoDisplay.fps = fps;
			}
			
			// Monitor performance - but don't apply drastic measures too early
			if (time > 10000) { // Only after 10 seconds of runtime
				monitorPerformance(fps);
			}
		}
		
		// Render the scene only if all required elements exist and are properly initialized
		if (renderer && scene && camera) {
			// PERFORMANCE OPTIMIZATION: Only run scene validation occasionally
			// This is expensive and doesn't need to run every single frame
			const SCENE_VALIDATION_INTERVAL = 5000; // ms between validations (5 seconds)
			const now = Date.now();
			if (!lastSceneValidation || now - lastSceneValidation > SCENE_VALIDATION_INTERVAL) {
				// Proactively check and fix scene hierarchy before rendering
				// This helps prevent errors before they occur
				if (scene) {
					try {
						// Add a diagnostic check to count objects in the scene
						if (gameState.debugMode) {
							let objectCount = 0;
							let nullChildrenCount = 0;
							let undefinedVisibleCount = 0;
							
							const countObjects = (obj) => {
								if (!obj) return;
								objectCount++;
								
								// Check for common error conditions
								if (obj.visible === undefined || obj.visible === null) {
									undefinedVisibleCount++;
								}
								
								if (obj.children) {
									// Check for null children
									const nullChildren = obj.children.filter(c => c === null || c === undefined).length;
									if (nullChildren > 0) {
										nullChildrenCount += nullChildren;
										console.warn(`Object "${obj.name || 'unnamed'}" has ${nullChildren} null children`);
									}
									
									obj.children.forEach(child => {
										if (child !== null && child !== undefined) {
											countObjects(child);
										}
									});
								}
							};
							
							countObjects(scene);
							// console.log(`Scene contains ${objectCount} objects, ${nullChildrenCount} null children, ${undefinedVisibleCount} with undefined visible property`);
						}
						
						// Check for problematic objects in the scene graph before rendering
						// This recursive function ensures the scene is in a valid state
						const validateSceneGraph = function(object) {
							// Skip validation for null or undefined objects
							if (!object) return;
							
							try {
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

									// Remove null children, which can cause render errors
									const hasNullChildren = children.some(child => child === null || child === undefined);
									if (hasNullChildren) {
										console.warn('Removing null children from object', object.name || 'unnamed');
										object.children = object.children.filter(child => child !== null && child !== undefined);
									}

									// Now validate remaining children
									for (let i = 0; i < children.length; i++) {
										if (children[i] !== null && children[i] !== undefined) {
											validateSceneGraph(children[i]);
										}
									}
								}
							} catch (validateObjectError) {
								console.error('Error validating object in scene graph:', validateObjectError);
							}
						};
						
						// Run validation before render
						validateSceneGraph(scene);
					} catch (validateError) {
						console.error('Error during scene validation:', validateError);
					}
				}
				lastSceneValidation = now;
			}

			try {
				// PERFORMANCE OPTIMIZATION: Only check specific groups occasionally
				if (!lastGroupCheck || now - lastGroupCheck > SCENE_VALIDATION_INTERVAL) {
					// Check specific object groups before rendering
					if (chessPiecesGroup) {
						// ... existing code ...
					}
					lastGroupCheck = now;
				}
				
				// Safe render call - this must happen every frame
				renderer.render(scene, camera);
			} catch (renderError) {
				console.error('Error during render:', renderError);
				// ... existing code ...
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

// Add variables to track validation timings
let lastSceneValidation = null;
let lastGroupCheck = null;

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
			// Try to move tetromino down (along Y-axis which is our "vertical" on the board)
			if (tetrominoModule.moveTetrominoY(1, gameState)) {
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
			// Helper function to safely add event listener
			const safeAddEventListener = (eventType, callback) => {
				try {
					// Check if the eventType is actually supported by NetworkManager
					if (NetworkManager.addEventListener) {
						// Special handling for message event which is stored differently
						if (eventType === 'message') {
							console.log(`Adding event listener for message (special handling)`);
							// Use onMessage instead for general messages
							if (NetworkManager.onMessage) {
								NetworkManager.onMessage('general', callback);
							} else {
								console.warn(`NetworkManager.onMessage is not available for message events`);
							}
						} else {
							console.log(`Adding event listener for: ${eventType}`);
							NetworkManager.addEventListener(eventType, callback);
						}
					} else {
						console.warn(`NetworkManager.addEventListener is not a function`);
					}
				} catch (err) {
					console.error(`Error adding ${eventType} event listener:`, err);
				}
			};
			
			// Connection events
			safeAddEventListener('connect', () => {
				console.log('Connected to server');
				updateNetworkStatus('connected');
				
				// Update game ID display if available
				if (NetworkManager.getGameId && NetworkManager.getGameId()) {
					updateGameIdDisplay(NetworkManager.getGameId());
				}
			});
			
			safeAddEventListener('disconnect', () => {
				console.log('Disconnected from server');
				updateNetworkStatus('disconnected');
			});
			
			// Game state updates - this is the main way we receive game data
			safeAddEventListener('game_state', (data) => {
				console.log('Game state update received:', data);
				if (data) {
					handleGameStateUpdate(data);
				}
			});
			
			// Smaller incremental updates
			safeAddEventListener('game_update', (data) => {
				console.log('Game update received:', data);
				if (data) {
					handleGameUpdate(data);
				}
			});
			
			// Player events
			safeAddEventListener('player_joined', (data) => {
				if (data && data.playerName) {
					console.log('Player joined:', data);
					showToastMessage(`Player ${data.playerName} joined the game`);
				}
			});
			
			safeAddEventListener('player_left', (data) => {
				if (data && data.playerName) {
					console.log('Player left:', data);
					showToastMessage(`Player ${data.playerName} left the game`);
				}
			});
			
			// General messages - use onMessage instead of addEventListener for message
			if (NetworkManager.onMessage) {
				console.log('Adding message handler for general messages');
				NetworkManager.onMessage('general', (data) => {
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
			} else {
				console.warn('NetworkManager.onMessage not available, cannot register for general messages');
			}
			
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
		updateUnifiedPlayerBar(gameState);
	}
	
	// Update chess pieces if included
	if (data.chessPieces) {
		gameState.chessPieces = data.chessPieces;
		updateBoardVisuals();
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
			hideError();
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
			updateBoardVisuals();
		} else {
			console.log('No chess pieces in direct array - will extract from cells');
			// Update chess pieces from board cells
			updateBoardVisuals();
		}
		
		// Check for home zones
		const homeZones = gameData.homeZones || data.homeZones;
		if (homeZones) {
			console.log('Home zones received:', homeZones);
			gameState.homeZones = homeZones;
		}
		
		// Update player list
		const players = gameData.players || data.players;
		if (players) {
			console.log('Players received:', players);
			
			// Update local game state players
			gameState.players = players;
			
			// Update player bar to show all connected players
			createUnifiedPlayerBar(gameState);
			updateUnifiedPlayerBar(gameState);
			
			// Also update the player list in the sidebar if NetworkManager is available
			if (NetworkManager.updatePlayerList) {
				console.log('Updating player list in sidebar');
				// Convert to format expected by the sidebar
				const playerList = Object.keys(players).map(id => ({
					id: id,
					name: players[id].name || id,
					isComputer: players[id].isComputer || false
				}));
				
				// Send player list update event
				NetworkManager.triggerEvent('player_list', { players: playerList });
			}
		}
		
		// Update current player and turn phase
		const currentPlayer = gameData.currentPlayer || data.currentPlayer;
		if (currentPlayer) {
			gameState.currentPlayer = currentPlayer;
			
			// Highlight current player's pieces in red
			if (gameState.turnPhase === 'chess' && chessPiecesGroup) {
				highlightCurrentPlayerPieces(currentPlayer);
			}
		}
		
		// Handle turn phase updates
		const turnPhase = gameData.turnPhase || data.turnPhase;
		if (turnPhase) {
			gameState.turnPhase = turnPhase;
			
			// If we entered chess phase, make sure pieces are visible
			if (turnPhase === 'chess' && gameState.chessPieces && gameState.chessPieces.length > 0) {
				console.log("Entered chess phase - ensuring pieces are visible");
				updateBoardVisuals();
				
				// Highlight current player's pieces in red when entering chess phase
				if (gameState.currentPlayer) {
					
					highlightCurrentPlayerPieces(gameState.currentPlayer);
				}
			}
		}
		
		// Update game status display
		updateGameStatusDisplay();
		

		// Force a final render pass to ensure visibility
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
		

		
		console.log(`Received board data`);
		
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
	try {
		// console.log("Updating board visuals...");
		const startTime = performance.now();
		
		// ----- BOARD CELLS HANDLING -----
		// Check if we need to create the board group from scratch
		let boardGroupExists = !!gameState.boardGroup;
		
		if (!boardGroupExists) {
			// Create a new group for the board if it doesn't exist
			gameState.boardGroup = new THREE.Group();
			gameState.boardGroup.name = 'board';
			
			// Add the board group to the scene
			if (gameState.scene) {
				gameState.scene.add(gameState.boardGroup);
			}
			
			console.log("Created new board group");
		}
		
		// Use the efficient rendering function that reuses existing cells
		const boardStats = boardFunctions.renderBoard(gameState, gameState.boardGroup, sceneModule.createFloatingIsland, THREE);
		
		// ----- CHESS PIECES HANDLING -----
		// Create or ensure chess pieces group exists
		if (!chessPiecesGroup) {
			chessPiecesGroup = new THREE.Group();
			chessPiecesGroup.name = 'chessPieces';
			gameState.scene.add(chessPiecesGroup);
			console.log("Created new chess pieces group");
		}
		
		// Delegate chess piece updating to the dedicated function in updateChessPieces.js
		// This handles all extraction, positioning, and rendering of chess pieces
		if (typeof updateChessPieces === 'function') {
			try {
				updateChessPieces(chessPiecesGroup, camera, gameState);
			} catch (chessPiecesError) {
				console.error('Error updating chess pieces:', chessPiecesError);
			}
		} else {
			console.warn('updateChessPieces function not available');
		}
		
		// Sync center positions for tetromino if that module is loaded
		if (typeof tetrominoModule.synchronizeCenterPositions === 'function') {
			tetrominoModule.synchronizeCenterPositions(gameState);
		}
		
		// Force a render update to ensure all changes are visible
		if (gameState.renderer && gameState.scene && gameState.camera) {
			gameState.renderer.render(gameState.scene, gameState.camera);
		}
		
		// Report performance
		const endTime = performance.now();
		console.log(`Board/chess visual update completed in ${(endTime - startTime).toFixed(2)}ms`);

		if(gameState.board && gameState.board.cells && Object.keys(gameState.board.cells).length > 0){
			// Hide all loading elements
			hideAllLoadingElements();
		}

	} catch (error) {
		console.error("Error in updateBoardVisuals:", error);
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

	// Apply each change
	let changedCells = 0;
	for (const change of changes) {
		// Extract change details
		const { x, z, value } = change;
		
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
		console.log(`Board expansion needed`);
		
		
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
		animateClouds(scene); // Call with optimization flag
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
	if (!gameState.currentTetromino) return;

	// Remove previous tetromino mesh if it exists
	if (gameState.currentTetromino.mesh && gameState.scene) {
		gameState.scene.remove(gameState.currentTetromino.mesh);
	}

	// Create the current tetromino
	gameState.currentTetromino.mesh = tetrominoModule.createTetrominoMesh(gameState.currentTetromino, gameState);
	
	if (gameState.scene && gameState.currentTetromino.mesh) {
		gameState.scene.add(gameState.currentTetromino.mesh);
		
		// Synchronize center positions to ensure alignment between cells and pieces
		if (typeof tetrominoModule.synchronizeCenterPositions === 'function') {
			tetrominoModule.synchronizeCenterPositions(gameState);
		}
	}

	//Render the tetromino
	tetrominoModule.renderTetromino(gameState, tetrominoGroup);

	// Update the board visuals
	updateBoardVisuals();
}


/**
 * Initialize the game UI elements
 */
function initializeGameUI() {
	console.log("Initializing game UI...");
	
	// Create player bar with current game state
	try {
		// Explicitly create player bar
		if (typeof createUnifiedPlayerBar === 'function') {
			console.log("Creating player bar...");
			createUnifiedPlayerBar(gameState);
		} else {
			console.error("createUnifiedPlayerBar function not available");
		}
	} catch (error) {
		console.error("Error creating player bar:", error);
	}
	
	// Create network status display
	try {
		if (typeof createNetworkStatusDisplay === 'function') {
			createNetworkStatusDisplay();
		}
	} catch (error) {
		console.error("Error creating network status display:", error);
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
	// Setup raycaster for mouse interactions
	raycaster = new THREE.Raycaster();
	mouse = new THREE.Vector2();
	// Set default viewing position
	resetCameraForGameplay(
		renderer,
		camera,
		controls,
		gameState,
		scene,
		true,
		false
	);
	
	// The groups are already added to the scene in setupScene, no need to add them again
	

	// Initialize input handlers only after scene is set up
	console.log("Setting up input handlers...");
	setupInputHandlers();

	// Set up the event system
	console.log("Setting up event system...");
	setupEventSystem();
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
 * Initialize orbit controls for camera manipulation
 * @param {THREE.Camera} camera - The camera to control
 * @param {HTMLElement} domElement - The DOM element to attach controls to
 * @returns {Object} - The initialized controls
 */
function initializeOrbitControls(camera, domElement) {
	console.log("Initializing orbit controls...");
	
	let orbitControls = null;
	
	try {
		// Log available paths to help diagnose issues
		console.log("Checking for OrbitControls in:", {
			"THREE.OrbitControls": typeof THREE.OrbitControls,
			"global OrbitControls": typeof OrbitControls,
			"THREE_MODULE.OrbitControls": THREE_MODULE ? typeof THREE_MODULE.OrbitControls : "module not available"
		});
		
		// Check if OrbitControls is available from THREE
		if (typeof THREE.OrbitControls === 'function') {
			orbitControls = new THREE.OrbitControls(camera, domElement);
			console.log("Using THREE.OrbitControls");
		} 
		// Check if it's available as a global
		else if (typeof window.OrbitControls === 'function') {
			orbitControls = new window.OrbitControls(camera, domElement);
			console.log("Using window.OrbitControls");
		}
		// Check as a global variable
		else if (typeof OrbitControls === 'function') {
			orbitControls = new OrbitControls(camera, domElement);
			console.log("Using global OrbitControls");
		}
		// Check if the original THREE module has it
		else if (THREE_MODULE && typeof THREE_MODULE.OrbitControls === 'function') {
			orbitControls = new THREE_MODULE.OrbitControls(camera, domElement);
			console.log("Using THREE_MODULE.OrbitControls");
		} 
		else {
			console.error("OrbitControls not found in any expected location");
			// Create a temporary message to notify the user
			const errorMsg = document.createElement('div');
			errorMsg.style.position = 'fixed';
			errorMsg.style.top = '10px';
			errorMsg.style.left = '10px';
			errorMsg.style.background = 'rgba(255,0,0,0.7)';
			errorMsg.style.color = 'white';
			errorMsg.style.padding = '10px';
			errorMsg.style.borderRadius = '5px';
			errorMsg.style.zIndex = '9999';
			errorMsg.textContent = 'Camera controls unavailable - OrbitControls not loaded';
			document.body.appendChild(errorMsg);
			return null;
		}
		
		if (!orbitControls) {
			console.error("Failed to initialize OrbitControls");
			return null;
		}
		
		// Configure the controls
		configureOrbitControls(orbitControls);
		
		return orbitControls;
	} catch (error) {
		console.error("Error initializing OrbitControls:", error);
		return null;
	}
}

/**
 * Configure orbit controls with proper settings
 * @param {Object} controls - The OrbitControls object to configure
 */
function configureOrbitControls(controls) {
	if (!controls) return;
	
	// Configure controls for smooth movement
	controls.enableDamping = true;
	controls.dampingFactor = 0.15;
	controls.screenSpacePanning = true;
	controls.minDistance = 10;
	controls.maxDistance = 80;
	controls.maxPolarAngle = Math.PI / 2 - 0.1; // Prevent going below horizon
	controls.target.set(8, 0, 8); // Look at center of board
	
	// Make sure these critical properties are set to enable interaction
	controls.enabled = true;
	controls.enableRotate = true;
	controls.enablePan = true;
	controls.enableZoom = true;
	
	// Set up controls to handle touch events properly
	controls.touches = {
		ONE: THREE.TOUCH ? THREE.TOUCH.ROTATE : 0,
		TWO: THREE.TOUCH ? THREE.TOUCH.DOLLY_PAN : 1
	};
	
	// Enable smoother rotating/panning
	controls.rotateSpeed = 0.7;
	controls.panSpeed = 0.8;
	controls.zoomSpeed = 1.0;
	
	// Ensure first update is called
	controls.update();
	
	console.log("OrbitControls configured successfully");
	
	// Add a visible indicator in the corner to show controls are active
	const existingIndicator = document.getElementById('controls-indicator');
	if (existingIndicator) {
		// Remove existing indicator to avoid duplicates
		existingIndicator.parentNode.removeChild(existingIndicator);
	}
	
	const controlIndicator = document.createElement('div');
	controlIndicator.id = 'controls-indicator';
	controlIndicator.style.position = 'fixed';
	controlIndicator.style.bottom = '10px';
	controlIndicator.style.right = '10px';
	controlIndicator.style.background = 'rgba(0,0,0,0.7)';
	controlIndicator.style.color = '#ffcc00';
	controlIndicator.style.padding = '8px 12px';
	controlIndicator.style.borderRadius = '5px';
	controlIndicator.style.fontSize = '14px';
	controlIndicator.style.zIndex = '9999';
	controlIndicator.style.fontWeight = 'bold';
	controlIndicator.style.boxShadow = '0 0 10px rgba(0,0,0,0.5)';
	controlIndicator.style.border = '1px solid #ffcc00';
	controlIndicator.style.fontFamily = 'monospace';
	controlIndicator.innerHTML = `
		<div>🎮 Camera Controls Active</div>
		<div id="camera-position" style="font-size: 12px; margin-top: 5px; font-weight: normal;">
			Position: (0, 0, 0)<br>
			Looking at: (0, 0, 0)
		</div>
	`;
	document.body.appendChild(controlIndicator);
	
	// Start updating camera information
	startCameraInfoUpdates(camera, controls);
	
	// Add some help text with improved styling
	const existingHelpText = document.getElementById('controls-help');
	if (existingHelpText) {
		// Remove existing help text to avoid duplicates
		existingHelpText.parentNode.removeChild(existingHelpText);
	}
	
	const helpText = document.createElement('div');
	helpText.id = 'controls-help';
	helpText.style.position = 'fixed';
	helpText.style.bottom = '60px';
	helpText.style.right = '10px';
	helpText.style.background = 'rgba(0,0,0,0.7)';
	helpText.style.color = '#ffffff';
	helpText.style.padding = '10px 15px';
	helpText.style.borderRadius = '5px';
	helpText.style.fontSize = '13px';
	helpText.style.zIndex = '9999';
	helpText.style.maxWidth = '250px';
	helpText.style.lineHeight = '1.5';
	helpText.style.boxShadow = '0 0 10px rgba(0,0,0,0.5)';
	helpText.style.border = '1px solid #555';
	helpText.innerHTML = '🖱️ <b>Mouse controls:</b><br>' + 
						 '• Left click + drag: Rotate camera<br>' + 
						 '• Right click + drag: Pan camera<br>' + 
						 '• Scroll wheel: Zoom in/out';
	document.body.appendChild(helpText);
}

/**
 * Start updating camera position and target information in the control indicator
 * @param {THREE.Camera} camera - The camera to track
 * @param {OrbitControls} controls - The orbit controls
 */
function startCameraInfoUpdates(camera, controls) {
	if (!camera || !controls) return;
	
	const positionElement = document.getElementById('camera-position');
	if (!positionElement) return;
	
	// Store references globally so the main animation loop can update the display
	window.cameraInfoDisplay = {
		element: positionElement,
		camera: camera,
		controls: controls,
		lastUpdate: 0,
		updateInterval: 100 // Update every 100ms to avoid performance impact
	};
	
	// Do an initial update
	updateCameraInfoDisplay();
}

/**
 * Update the camera information display
 */
function updateCameraInfoDisplay() {
	if (!window.cameraInfoDisplay) return;
	
	const { element, camera, controls } = window.cameraInfoDisplay;
	if (!element || !camera || !controls) return;
	
	// Format a vector3 to a clean string with 2 decimal places
	const formatVector = (vector) => {
		if (!vector) return "(0, 0, 0)";
		const x = vector.x.toFixed(2);
		const y = vector.y.toFixed(2);
		const z = vector.z.toFixed(2);
		return `(${x}, ${y}, ${z})`;
	};
	
	const posText = formatVector(camera.position);
	const targetText = formatVector(controls.target);
	
	let displayText = "Position: " + posText + "<br>Looking at: " + targetText;
	
	// Add FPS information if debug mode is enabled
	if (gameState.debugMode && window.cameraInfoDisplay.fps) {
		displayText += "<br>FPS: " + window.cameraInfoDisplay.fps;
	}
	
	element.innerHTML = displayText;
}

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
	let lastControlsUpdate = 0; // For tracking controls updates
	
	// Track FPS for performance monitoring
	let frameCount = 0;
	let lastFpsUpdate = performance.now();
	let frameSkip = 0; // Skip frames for heavy operations
	
	// Frame limiting
	const TARGET_FRAMERATE = gameState.performanceMode ? 20 : 60; // Higher framerate for smoother controls
	const FRAME_TIME = 1000 / TARGET_FRAMERATE;
	let lastFrameTime = 0;
	
	// Add variables to track validation timings
	let lastSceneValidation = null;
	let lastGroupCheck = null;
	
	// Flag to track if clouds are in camera view (initialized here, used in animate)
	let cloudsInView = true;
	
	// Ensure controls are initialized with damping enabled
	if (controls) {
		controls.enableDamping = true;
		controls.dampingFactor = 0.1; // Make camera movement smoother
		controls.update();
		console.log("Ensuring OrbitControls are properly configured in game loop");
	}
	
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
				console.log("Skipping large delta frame:", delta);
				return;
			}
			
			// Update frame counter for skipping heavy operations
			frameCount++;
			frameSkip = (frameSkip + 1) % 3; // Skip every 3rd frame for heavy operations
			const isHeavyOperationFrame = frameSkip === 0;
			
			// Update game logic elements if not paused
			if (!gameState.paused) {
				// Always update controls every frame for smooth camera movement
				if (controls) {
					controls.update();
				}
				
				// Calculate time since last controls update
				const timeSinceControlsUpdate = time - lastControlsUpdate;
				
				// Update controls more frequently for responsive UI
				if (timeSinceControlsUpdate > 16) { // ~60fps
					if (controls) {
						controls.update();
					}
					lastControlsUpdate = time;
				}
				
				// Update camera position display if available
				if (window.cameraInfoDisplay && time - window.cameraInfoDisplay.lastUpdate > window.cameraInfoDisplay.updateInterval) {
					try {
						updateCameraInfoDisplay();
						window.cameraInfoDisplay.lastUpdate = time;
					} catch (err) {
						// Silently handle errors to avoid console spam
					}
				}
				
				// Update animated clouds - ensure clouds array exists and contains valid objects
				// Only update on heavy operation frames to reduce load
				if (isHeavyOperationFrame && clouds && Array.isArray(clouds)) {
					for (let i = 0; i < clouds.length; i++) {
						if (clouds[i]) {
							clouds[i].rotation.y += 0.001 * delta * 3; // Multiply by 3 since we're updating every 3rd frame
						}
					}
				}
				
				// Process pending animations - this is lightweight so can run every frame
				if (animationQueue && animationQueue.length > 0) {
					processAnimationQueue();
				}
				
				// Update player bar periodically 
				const UI_UPDATE_INTERVAL = 2000; // Update UI every 2 seconds (reduced frequency)
				const timeSinceUiUpdate = time - lastUiUpdate;
				if (timeSinceUiUpdate > UI_UPDATE_INTERVAL) {
					// Update player bar
					if (typeof updateUnifiedPlayerBar === 'function') {
						try {
							updateUnifiedPlayerBar(gameState);
						} catch (playerBarError) {
							console.error('Error updating player bar:', playerBarError);
						}
					}
					
					// Update chess pieces
					if (typeof updateChessPieces === 'function' && chessPiecesGroup) {
						try {
							updateBoardVisuals();
						} catch (chessPiecesError) {
							console.error('Error updating chess pieces:', chessPiecesError);
						}
					}
					
					lastUiUpdate = time;
				}
			}
			
			// Handle TWEEN animations if available
			if (window.TWEEN) {
				window.TWEEN.update();
			}
			
			// Update FPS counter
			const timeSinceFpsUpdate = time - lastFpsUpdate;
			if (timeSinceFpsUpdate > 1000) { // Every second
				const fps = Math.round((frameCount * 1000) / timeSinceFpsUpdate);
				frameCount = 0;
				lastFpsUpdate = time;
				
				// Store FPS for camera info display
				if (window.cameraInfoDisplay) {
					window.cameraInfoDisplay.fps = fps;
				}
				
				// Monitor performance - but don't apply drastic measures too early
				if (time > 10000) { // Only after 10 seconds of runtime
					monitorPerformance(fps);
				}
			}
			
			// Only update LOD and game logic on heavy operation frames
			if (isHeavyOperationFrame) {
				// Update animated clouds
				if (time - lastLODUpdate > LOD_UPDATE_INTERVAL) {
					lastLODUpdate = time;
					// Update clouds
					if (typeof animateClouds === 'function') {
						animateClouds(scene);
					}
				}
				
				// Update game logic
				if (time - lastGameLogicUpdate > GAME_LOGIC_INTERVAL) {
					lastGameLogicUpdate = time;
					updateGameLogic(delta);
				}
			}
			
			// Render the scene only if all required elements exist and are properly initialized
			if (renderer && scene && camera) {
				// PERFORMANCE OPTIMIZATION: Only run scene validation occasionally
				// This is expensive and doesn't need to run every single frame
				const SCENE_VALIDATION_INTERVAL = 5000; // ms between validations (5 seconds)
				const now = Date.now();
				if (!lastSceneValidation || now - lastSceneValidation > SCENE_VALIDATION_INTERVAL) {
					// Proactively check and fix scene hierarchy before rendering
					// This helps prevent errors before they occur
					if (scene) {
						try {
							// Add a diagnostic check to count objects in the scene
							if (gameState.debugMode) {
								let objectCount = 0;
								let nullChildrenCount = 0;
								let undefinedVisibleCount = 0;
								
								const countObjects = (obj) => {
									if (!obj) return;
									objectCount++;
									
									// Check for common error conditions
									if (obj.visible === undefined || obj.visible === null) {
										undefinedVisibleCount++;
									}
									
									if (obj.children) {
										// Check for null children
										const nullChildren = obj.children.filter(c => c === null || c === undefined).length;
										if (nullChildren > 0) {
											nullChildrenCount += nullChildren;
											console.warn(`Object "${obj.name || 'unnamed'}" has ${nullChildren} null children`);
										}
										
										obj.children.forEach(child => {
											if (child !== null && child !== undefined) {
												countObjects(child);
											}
										});
									}
								};
								
								countObjects(scene);
								// console.log(`Scene contains ${objectCount} objects, ${nullChildrenCount} null children, ${undefinedVisibleCount} with undefined visible property`);
							}
							
							// Check for problematic objects in the scene graph before rendering
							// This recursive function ensures the scene is in a valid state
							const validateSceneGraph = function(object) {
								// Skip validation for null or undefined objects
								if (!object) return;
								
								try {
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

										// Remove null children, which can cause render errors
										const hasNullChildren = children.some(child => child === null || child === undefined);
										if (hasNullChildren) {
											console.warn('Removing null children from object', object.name || 'unnamed');
											object.children = object.children.filter(child => child !== null && child !== undefined);
										}

										// Now validate remaining children
										for (let i = 0; i < children.length; i++) {
											if (children[i] !== null && children[i] !== undefined) {
												validateSceneGraph(children[i]);
											}
										}
									}
								} catch (validateObjectError) {
									console.error('Error validating object in scene graph:', validateObjectError);
								}
							};
							
							// Run validation before render
							validateSceneGraph(scene);
						} catch (validateError) {
							console.error('Error during scene validation:', validateError);
						}
					}
					lastSceneValidation = now;
				}

				try {
					// PERFORMANCE OPTIMIZATION: Only check specific groups occasionally
					if (!lastGroupCheck || now - lastGroupCheck > SCENE_VALIDATION_INTERVAL) {
						// Check specific object groups before rendering
						if (chessPiecesGroup) {
							// ... existing code ...
						}
						lastGroupCheck = now;
					}
					
					// Safe render call - this must happen every frame
					renderer.render(scene, camera);
				} catch (renderError) {
					console.error('Error during render:', renderError);
					// ... existing code ...
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
	
	// Start the game loop
	animationFrameId = requestAnimationFrame(animate);
}

// Expose highlight functions to global scope for player list sidebar
export function exposeHighlightFunctionsGlobally() {
	console.log("Exposing highlight functions and game state to global scope");
	window.gameCore = window.gameCore || {};
	window.gameCore.highlightPlayerPieces = highlightPlayerPieces;
	window.gameCore.removePlayerPiecesHighlight = removePlayerPiecesHighlight;
	window.gameCore.highlightCurrentPlayerPieces = highlightCurrentPlayerPieces;
	
	// Also expose gameState
	window.gameState = gameState;
}

// Define the legacy_placeTetromino function
function legacy_placeTetromino() {
	console.log('Placing tetromino on board using improved placement sequence');
	if (!gameState.currentTetromino){
		console.log('No tetromino to place');
		return;
	} 
	
	try {
		// Ensure the scene is included in the gameState
		if (!gameState.scene && typeof scene !== 'undefined') {
			gameState.scene = scene;
		}
		hideError();

		// Store position for potential animations
		const tetrominoX = gameState.currentTetromino.position.x;
		const tetrominoZ = gameState.currentTetromino.position.z;

		// First, check if placement is valid locally (adjacent to existing cells)
		const isAdjacent = tetrominoModule.isTetrominoAdjacentToExistingCells(
			gameState, 
			gameState.currentTetromino.shape,
			tetrominoX,
			tetrominoZ
		);

		if (!isAdjacent) {
			console.log('Local validation: Tetromino must be adjacent to existing cells');
			
			// Show explosion animation and transition to chess phase
			tetrominoModule.showExplosionAnimation(tetrominoX, tetrominoZ, gameState);
			
			// Clean up tetromino and transition to chess phase
			tetrominoModule.cleanupTetrominoAndTransitionToChess(
				gameState,
				'Tetromino must be adjacent to existing cells',
				tetrominoX,
				tetrominoZ
			);
			
			return;
		}

		// If placement seems valid locally, show placement effect
		tetrominoModule.showPlacementEffect(tetrominoX, tetrominoZ, gameState);
		
		// Start sending move to server and handle the result
		tetrominoModule.enhancedPlaceTetromino(gameState)
			.then(result => {
				console.log('Server tetromino placement completed with result:', result);
				
				// If server validated the placement, check if there are valid chess moves
				if (result) {
					// Check if there are any valid chess moves for the current player
					const canMakeChessMove = boardFunctions.analyzePossibleMoves(gameState, gameState.currentPlayer);
					
					// If no valid chess moves, skip to next tetromino turn
					if (!canMakeChessMove.hasMoves) {
						console.log('No valid chess moves available, skipping to next tetromino turn');
						
						// Skip to next player's turn and set to tetromino phase
						if (typeof advanceTurn === 'function') {
							advanceTurn();
							gameState.turnPhase = 'tetromino';
							updateGameStatusDisplay();
						}
					}
				}
			})
			.catch(err => {
				console.error('Error during tetromino placement:', err);
				
				// Even if there's an error, we should ensure transition to chess phase
				if (gameState.turnPhase !== 'chess') {
					gameState.currentTetromino = null;
					gameState.turnPhase = 'chess';
					updateGameStatusDisplay();
				}
			});
		
	} catch (error) {
		console.error('Error placing tetromino:', error);
		
		// Even if there's an error, we should switch phases and clean up
		if (gameState.currentTetromino) {
			const tetrominoX = gameState.currentTetromino.position.x;
			const tetrominoZ = gameState.currentTetromino.position.z;
			
			tetrominoModule.cleanupTetrominoAndTransitionToChess(
				gameState,
				'Error placing tetromino: ' + (error.message || 'Unknown error'),
				tetrominoX,
				tetrominoZ
			);
		} else {
			gameState.currentTetromino = null;
			gameState.turnPhase = 'chess';
			updateGameStatusDisplay();
		}
	}
}

/**
/**
 * Updates the board center position and synchronizes all related game elements
 * @param {Object} newCenter - The new board center coordinates {x, z}
 * @returns {boolean} - Whether the update was successful
 */
export function updateBoardCenter(newCenter) {
	console.log('Updating board center to:', newCenter);
	
	try {
		// Try to import centreBoardMarker functions if not already available
		let createCentreMarker, findBoardCentreMarker;
		try {
			// Dynamic import for centreBoardMarker functions
			const centreBoardMarker = require('./centreBoardMarker.js');
			createCentreMarker = centreBoardMarker.createCentreMarker;
			findBoardCentreMarker = centreBoardMarker.findBoardCentreMarker;
		} catch (e) {
			console.warn('Failed to import centreBoardMarker module, using direct updates');
		}
		
		// Ensure gameState exists
		if (!gameState) {
			console.error('No gameState available for board center update');
			return false;
		}
		
		// If newCenter is not provided, try to find the current centre marker
		if (!newCenter) {
			if (typeof findBoardCentreMarker === 'function') {
				newCenter = findBoardCentreMarker(gameState);
				console.log('Found existing board centre marker:', newCenter);
			} else {
				// Fallback to existing or default center
				newCenter = gameState.board?.centreMarker || { x: 15, z: 15 };
				console.log('Using existing or default board centre:', newCenter);
			}
		}
		
		// Update the centre marker in the board data
		if (typeof createCentreMarker === 'function') {
			createCentreMarker(gameState, newCenter.x, newCenter.z);
			console.log('Updated board centre marker using centreBoardMarker module');
		} else {
			// Direct update if module not available
			if (!gameState.board) gameState.board = { cells: {} };
			gameState.board.centreMarker = { x: newCenter.x, z: newCenter.z };
			console.log('Updated board centre marker directly');
		}
		
		// Update the boardCenter property in gameState
		gameState.boardCenter = {
			x: newCenter.x,
			y: 0,
			z: newCenter.z
		};
		
		// Synchronize the board center with all game elements
		if (typeof tetrominoModule.synchronizeCenterPositions === 'function') {
			tetrominoModule.synchronizeCenterPositions(gameState);
			console.log('Synchronized tetromino positions with new board centre');
		}
		
		// If there's a current tetromino, update its visualization
		if (gameState.currentTetromino && tetrominoModule.renderTetromino) {
			tetrominoModule.renderTetromino(gameState);
			console.log('Re-rendered current tetromino with new board centre');
		}
		
		// If there's a board visualization function, update it
		if (typeof updateBoardVisuals === 'function') {
			updateBoardVisuals();
			console.log('Updated board visualizations');
		}
		
		// Force a render update if the scene and renderer are available
		if (gameState.scene && renderer && camera) {
			renderer.render(gameState.scene, camera);
			console.log('Forced render update with new board centre');
		}
		
		return true;
	} catch (error) {
		console.error('Error updating board center:', error);
		return false;
	}
}

/**
 * Handle network errors during tetromino placement
 * @param {Object} error - The error object
 * @param {Object} gameState - The current game state
 * @returns {Promise<boolean>} - Promise that resolves to true if reconnection was successful
 */
export function handleNetworkErrorDuringPlacement(error, gameState) {
	console.error('Network error during tetromino placement:', error);
	
	// Show a message to the user
	if (typeof showToastMessage === 'function') {
		showToastMessage('Connection lost. Attempting to reconnect...');
	}
	
	// Update network status display if available
	if (typeof updateNetworkStatus === 'function') {
		updateNetworkStatus('disconnected');
	}
	
	// Use 5 maximum attempts with backoff strategy
	return NetworkManager.ensureConnected(null, 5)
		.then(connected => {
			if (connected) {
				console.log('Successfully reconnected to server');
				
				// Update status
				if (typeof updateNetworkStatus === 'function') {
					updateNetworkStatus('connected');
				}
				
				if (typeof showToastMessage === 'function') {
					showToastMessage('Reconnected successfully. You can continue playing.');
				}
				
				return true;
			} else {
				console.error('Failed to reconnect after multiple attempts');
				
				// Show error message
				if (typeof showToastMessage === 'function') {
					showToastMessage('Failed to reconnect. Please refresh the page and try again.');
				}
				
				// If there's a current tetromino, reject it with an explosion
				if (gameState && gameState.currentTetromino) {
					// Use imported function if available 
					const { explosionX, explosionZ } = getTetrominoPositionForExplosion(gameState);
					
					// Find the cleanupTetrominoAndTransitionToChess function
					let cleanupFunction;
					try {
						// Try to import from tetromino.js if not already available
						const tetrominoModule = require('./tetromino.js');
						cleanupFunction = tetrominoModule.cleanupTetrominoAndTransitionToChess;
					} catch (e) {
						console.warn('Could not import cleanupTetrominoAndTransitionToChess function');
					}
					
					// Call the cleanup function if available
					if (typeof cleanupFunction === 'function') {
						cleanupFunction(
							gameState,
							'Connection lost. Please refresh the page and try again.',
							explosionX,
							explosionZ
						);
					} else {
						// Fallback: just clear the current tetromino
						gameState.currentTetromino = null;
						gameState.turnPhase = 'chess';
						if (typeof updateGameStatusDisplay === 'function') {
							updateGameStatusDisplay();
						}
					}
				}
				
				return false;
			}
		})
		.catch(error => {
			console.error('Error during reconnection process:', error);
			
			// Show error message
			if (typeof showToastMessage === 'function') {
				showToastMessage('Error during reconnection. Please refresh the page.');
			}
			
			// If there's a current tetromino, reject it
			if (gameState && gameState.currentTetromino) {
				const { explosionX, explosionZ } = getTetrominoPositionForExplosion(gameState);
				
				// Find and call cleanup function
				try {
					const tetrominoModule = require('./tetromino.js');
					if (typeof tetrominoModule.cleanupTetrominoAndTransitionToChess === 'function') {
						tetrominoModule.cleanupTetrominoAndTransitionToChess(
							gameState,
							'Connection error. Please refresh the page.',
							explosionX,
							explosionZ
						);
					}
				} catch (e) {
					// Fallback cleanup
					gameState.currentTetromino = null;
					gameState.turnPhase = 'chess';
					if (typeof updateGameStatusDisplay === 'function') {
						updateGameStatusDisplay();
					}
				}
			}
			
			return false;
		});
}

/**
 * Get the tetromino position for explosion effects
 * @param {Object} gameState - The current game state
 * @returns {Object} - The position {explosionX, explosionZ}
 */
function getTetrominoPositionForExplosion(gameState) {
	let explosionX, explosionZ;
	
	if (gameState && gameState.currentTetromino) {
		explosionX = gameState.currentTetromino.position.x;
		explosionZ = gameState.currentTetromino.position.z;
	} else {
		// Default to board centre if no current tetromino
		const boardCenter = gameState?.boardCenter || gameState?.board?.centreMarker || { x: 15, z: 15 };
		explosionX = boardCenter.x;
		explosionZ = boardCenter.z;
	}
	
	return { explosionX, explosionZ };
}

/**
 * Update axis helpers visibility based on debug mode
 */
function updateAxisHelpersVisibility() {
	// Clear any existing axis helpers
	const axesHelper = scene.getObjectByName('axesHelper');
	const axisLabels = scene.getObjectByName('axisLabels');
	
	if (axesHelper) scene.remove(axesHelper);
	if (axisLabels) scene.remove(axisLabels);
	
	// Add axis helpers if debug mode is enabled
	if (gameState.debugMode) {
		createLabeledAxisHelpers();
	}
}
