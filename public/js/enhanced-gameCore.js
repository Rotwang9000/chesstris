/**
 * Enhanced Game Core Module
 * 
 * This module serves as the central hub for game initialization,
 * state management, and core rendering functionality.
 */

// Import game state
import gameState, { reset, update } from './utils/gameState.js';

// Import game modules
import * as sceneModule from './scene.js';
import * as tetrominoModule from './tetromino.js';
import { boardFunctions } from './boardFunctions.js';
import { highlightSinglePiece } from './pieceHighlightManager.js';
import { updateUnifiedPlayerBar, createUnifiedPlayerBar } from './unifiedPlayerBar.js';

// Import other modules
import * as NetworkManager from './utils/networkManager.js';
import { animateClouds } from './textures.js';
import { showToastMessage } from './showToastMessage.js';
import { createNetworkStatusDisplay } from './createNetworkStatusDisplay.js';
import { createLoadingIndicator, hideAllLoadingElements, showErrorMessage, hideError, updateGameIdDisplay, updateGameStatusDisplay, updateNetworkStatus } from './createLoadingIndicator.js';
import { moveTetrominoY, moveTetrominoX, moveTetrominoForwardBack, createTetrominoBlock, showPlacementEffect } from './tetromino.js';
import { resetCameraForGameplay } from './setupCamera.js';
import { showTutorialMessage } from './createLoadingIndicator.js';
import { preserveCentreMarker, updateCellPreservingMarker, findBoardCentreMarker, createCentreMarker } from './centreBoardMarker.js';
import { updateChessPieces } from './updateChessPieces.js';
import chessPieceCreator from './chessPieceCreator.js';
import { setChessPiecesGroup, highlightPlayerPieces, removePlayerPiecesHighlight, highlightCurrentPlayerPieces } from './pieceHighlightManager.js';

// Get THREE from the global scope
// This is loaded via a script tag in the HTML
let THREE = window.THREE;

/**
 * Get the THREE.js instance
 * @returns {Object} THREE instance
 */
export function getTHREE() {
	return THREE;
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

// TETROMINO_START_HEIGHT is now in the gameState object

// UI controls for game flow
let uiButtons = {};

// Constants for axis helper
const AXIS_LENGTH = 20;
const AXIS_LABEL_SIZE = 1.0;
const AXIS_LABEL_OFFSET = 1.2;

/**
 * Get the current game state
 * @returns {Object} The current game state object
 */
export function getGameState() {
	return gameState;
}

/**
 * Initialize the game
 * @param {HTMLElement} container - The container to render the game in
 * @returns {boolean} - Whether initialization was successful
 */
export function initGame(container) {
	console.log("Initializing Shaktris game...");
	
	try {
		// Make sure THREE is available by getting it from the global scope
		if (!THREE && window.THREE) {
			console.log("Getting THREE from global scope");
			THREE = window.THREE;
		}
		
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
		reset();
		
		// Ensure debug mode is preserved across resets if in dev mode
		if (isDevMode) {
			gameState.debugMode = true;
		}
		
		// Expose the gameState singleton on the window object for backward compatibility
		window.gameState = gameState;
		
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
		
		// Initialize animations module
		console.log("Loading animations module...");
		initializeAnimations()
			.then(animModule => {
				console.log("Animations module loaded and ready");
				// Force a board visual update to ensure proper rendering
				if (typeof updateBoardVisuals === 'function') {
					updateBoardVisuals();
				}
			})
			.catch(error => {
				console.warn("Failed to load animations module, continuing without animations:", error);
			});
		
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
	gameState.scene = scene;
	
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
export function resetGameState(gameStateObj) {
	// Call the imported reset function from the singleton
	reset();
}


/**
 * Update the game state with new data
 * @param {Object} data - The new game state data
 */
function updateGameState(data, tetrominoGroup) {
	// Verify we have valid data
	if (!data) return;
	
	// Update our game state with the new data using the imported update function
	update(data);
	
	// Update the tetromino group
	gameState.tetrominoGroup = tetrominoGroup;
	gameState.scene = scene;
	
	console.log("Game state updated:", gameState);
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
		gameState.currentTetromino.heightAboveBoard = gameState.TETROMINO_START_HEIGHT;
		
		// Render the current tetromino
		renderCurrentTetromino();
		
		// Update the game status display
		updateGameStatusDisplay();
		
		// Force a complete update of chess pieces to ensure correct coloring
		if (chessPiecesGroup) {
			console.log("Forcing complete chess pieces update to ensure proper colors");
			// First make sure we have current pieces information
			if (!gameState.chessPieces || gameState.chessPieces.length === 0) {
				gameState.chessPieces = boardFunctions.extractChessPiecesFromCells(gameState);
				console.log(`Extracted ${gameState.chessPieces.length} chess pieces for initial coloring`);
			}
			
			// Apply highlighting for current player's pieces
			if (gameState.currentPlayer) {
				console.log(`Highlighting pieces for current player: ${gameState.currentPlayer}`);
				highlightCurrentPlayerPieces(gameState.currentPlayer);
			}
			
			// Update all chess pieces visuals with forced refresh
			updateChessPieces(chessPiecesGroup, camera, {
				...gameState,
				_forceUpdate: true
			});
		}
		
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
	
	// Get orientation from current player's king
	let orientation = gameState.orientation; // Default fallback
	
	// Get the current player's king to determine orientation using boardFunctions helper
	const currentPlayer = gameState.currentPlayer;
	const kingPiece = boardFunctions.getPlayersKing(gameState, currentPlayer, false);
	
	if (kingPiece && kingPiece.orientation !== undefined) {
		orientation = kingPiece.orientation;
		console.log(`Using king's orientation: ${orientation}`);
	} else {
		console.log(`No king found or no orientation, using default: ${orientation}`);
	}
	
	/*
	 * Orientation-based movement system:
	 * 
	 * The player is always viewing the board from behind their king.
	 * Arrow keys should move tetrominos in the direction relative to this viewpoint:
	 * 
	 * - Up Arrow: Move tetromino away from the player's viewpoint
	 * - Down Arrow: Move tetromino toward the player's viewpoint
	 * - Left Arrow: Move tetromino to the left from the player's viewpoint
	 * - Right Arrow: Move tetromino to the right from the player's viewpoint
	 * 
	 * The four orientation cases (0, 1, 2, 3) correspond to the king's facing direction:
	 * 0: Facing up (positive Z, or North)
	 * 1: Facing right (positive X, or East)
	 * 2: Facing down (negative Z, or South)
	 * 3: Facing left (negative X, or West)
	 * 
	 * Note: We've completely reversed all directions to fix the backward movement issue.
	 */
	
	// Handle key based on its code
	switch (event.key) {
		case 'ArrowLeft':
			console.log('Move left relative to player view');
			// Apply movement based on orientation (player viewing from behind king)
			switch (orientation) {
				case 0: // Facing up
					tetrominoModule.moveTetrominoX(1);
					break;
				case 1: // Facing right
					tetrominoModule.moveTetrominoZ(-1);
					break;
				case 2: // Facing down
					tetrominoModule.moveTetrominoX(-1);
					break;
				case 3: // Facing left
					tetrominoModule.moveTetrominoZ(1);
					break;
				default:
					// Default to standard movement
					tetrominoModule.moveTetrominoX(1);
			}
			moved = true;
			break;
		case 'ArrowRight':
			console.log('Move right relative to player view');
			// Apply movement based on orientation (player viewing from behind king)
			switch (orientation) {
				case 0: // Facing up
					tetrominoModule.moveTetrominoX(-1);
					break;
				case 1: // Facing right
					tetrominoModule.moveTetrominoZ(1);
					break;
				case 2: // Facing down
					tetrominoModule.moveTetrominoX(1);
					break;
				case 3: // Facing left
					tetrominoModule.moveTetrominoZ(-1);
					break;
				default:
					// Default to standard movement
					tetrominoModule.moveTetrominoX(-1);
			}
			moved = true;
			break;
		case 'ArrowDown':
			console.log('Move toward player view');
			// Apply movement based on orientation (player viewing from behind king)
			switch (orientation) {
				case 0: // Facing up
					tetrominoModule.moveTetrominoZ(-1);
					break;
				case 1: // Facing right
					tetrominoModule.moveTetrominoX(-1);
					break;
				case 2: // Facing down
					tetrominoModule.moveTetrominoZ(1);
					break;
				case 3: // Facing left
					tetrominoModule.moveTetrominoX(1);
					break;
				default:
					// Default to standard movement
					tetrominoModule.moveTetrominoZ(-1);
			}
			moved = true;
			break;
		case 'ArrowUp':
			console.log('Move away from player view');
			// Apply movement based on orientation (player viewing from behind king)
			switch (orientation) {
				case 0: // Facing up
					tetrominoModule.moveTetrominoZ(1);
					break;
				case 1: // Facing right
					tetrominoModule.moveTetrominoX(1);
					break;
				case 2: // Facing down
					tetrominoModule.moveTetrominoZ(-1);
					break;
				case 3: // Facing left
					tetrominoModule.moveTetrominoX(-1);
					break;
				default:
					// Default to standard movement
					tetrominoModule.moveTetrominoZ(1);
			}
			moved = true;
			break;

		case 'z':
		case 'Z':
			// Rotate tetromino counterclockwise
			console.log('Rotate CCW');
			tetrominoModule.rotateTetromino(-1);
			moved = true;
			break;
		case 'x':
		case 'X':
			// Rotate tetromino clockwise
			console.log('Rotate CW');
			tetrominoModule.rotateTetromino(1);
			moved = true;
			break;

		case ' ':
			// Hard drop tetromino
			console.log('Hard drop (Y-axis)');
			event.preventDefault(); // Prevent page scrolling
			tetrominoModule.hardDropTetromino();
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
	
	// Debug information
	console.log(`Raycast detected ${intersects.length} intersections`);
	
	// Handle intersections
	if (intersects.length > 0) {
		const intersectedObject = intersects[0].object;
		
		// Find the parent piece (if it's a submesh)
		let parentPiece = intersectedObject;
		while (parentPiece.parent && 
			   parentPiece.parent !== chessPiecesGroup && 
			   parentPiece.parent !== boardGroup &&
			   parentPiece.parent !== scene) {
			parentPiece = parentPiece.parent;
		}

		console.log('Intersected object:', parentPiece);
		console.log('Object userData:', parentPiece.userData);

		// Check if we hit a move highlight
		if (window.moveHighlightsGroup && window.moveHighlightsGroup.children.length > 0) {
			// Check if we clicked on a move highlight
			const moveHighlights = raycaster.intersectObjects(window.moveHighlightsGroup.children, true);
			if (moveHighlights.length > 0) {
				const highlight = moveHighlights[0].object;
				if (highlight.userData && highlight.userData.moveTarget) {
					console.log('Moving to highlighted cell:', highlight.userData);
					moveChessPieceToCell(highlight.userData.x, highlight.userData.z);
					return;
				}
			}
		}

		// Check if we hit a cell or a piece
		if (parentPiece.userData && parentPiece.userData.type === 'cell') {
			const cellPosition = parentPiece.userData.position;
			console.log('Clicked on cell:', cellPosition);
			
			// If we have a selected piece, try to move it to this cell
			if (gameState.selectedChessPiece && gameState.turnPhase === 'chess') {
				moveChessPieceToCell(cellPosition.x, cellPosition.z);
			}
		} else if (parentPiece.userData && 
				  (parentPiece.userData.type === 'chess' || parentPiece.userData.pieceType || 
				   parentPiece.userData.type === 'chessPiece')) {
			console.log('Clicked on chess piece:', parentPiece.userData);
			
			// Handle chess piece selection
			if (gameState.turnPhase === 'chess') {
				const piecePlayer = parentPiece.userData.player;
				const isLocalPlayerPiece = String(piecePlayer) === String(gameState.localPlayerId);
				
				console.log(`Piece player: ${piecePlayer}, Local player: ${gameState.localPlayerId}, Is local: ${isLocalPlayerPiece}`);
				
				if (isLocalPlayerPiece) {
					// Select our own piece
					selectChessPiece(parentPiece);
				} else {
					// Show info for opponent's piece
					showPieceInfo(parentPiece);
				}
			}
		}
	}
}

/**
 * Handle mouse hover for chess pieces
 */
function handleMouseHover() {
	// Only process if mouse is defined
	if (!mouse || !raycaster) return;
	
	// Set up raycaster
	raycaster.setFromCamera(mouse, camera);
	
	// Get intersections with chess pieces only
	const intersects = raycaster.intersectObjects([chessPiecesGroup], true);
	
	// Clear previous hover state
	if (gameState.hoveredPlayer && gameState.hoveredPlayer !== gameState.selectedHoveredPlayer) {
		// Remove hover highlight but keep selected piece highlighted
		gameState.hoveredPlayer = null;
		updateUnifiedPlayerBar(gameState);
		
		// Hide the piece info popup if it exists
		const popup = document.getElementById('piece-info-popup');
		if (popup) {
			popup.style.opacity = '0';
		}
	}
	
	// Handle intersections
	if (intersects.length > 0) {
		const intersectedObject = intersects[0].object;
		
		// Find the parent piece (if it's a submesh)
		let parentPiece = intersectedObject;
		while (parentPiece.parent && 
			   parentPiece.parent !== chessPiecesGroup && 
			   parentPiece.parent !== boardGroup &&
			   parentPiece.parent !== scene) {
			parentPiece = parentPiece.parent;
		}
		
		// Check if it's a chess piece
		if (parentPiece.userData && 
		   (parentPiece.userData.type === 'chess' || parentPiece.userData.pieceType || 
		    parentPiece.userData.type === 'chessPiece')) {
			const piecePlayer = parentPiece.userData.player;
			
			// Only highlight if it's not already the selected player's pieces
			if (String(piecePlayer) !== String(gameState.selectedHoveredPlayer)) {
				gameState.hoveredPlayer = piecePlayer;
				updateUnifiedPlayerBar(gameState);
				
				// Show piece info popup for opponent's pieces
				const isLocalPlayerPiece = String(piecePlayer) === String(gameState.localPlayerId);
				if (!isLocalPlayerPiece && gameState.turnPhase === 'chess') {
					showPieceInfoPopup(parentPiece);
				}
			}
		}
	}
}

/**
 * Select a chess piece for potential movement
 * @param {Object} piece - The chess piece to select
 */
function selectChessPiece(piece) {
	// Clear any previous selection first
	clearChessSelection();
	
	// Set this piece as selected
	gameState.selectedChessPiece = piece;
	gameState.selectedHoveredPlayer = piece.userData.player;
	
	// Highlight the selected piece
	highlightSinglePiece(piece);
	
	// Calculate and display valid moves
	showValidMoves(piece);
	
	// Update player bar to show this is the selected player
	updateUnifiedPlayerBar(gameState);
}

/**
 * Show valid moves for a selected chess piece
 * @param {Object} piece - The chess piece
 */
function showValidMoves(piece) {
	if (!piece || !piece.userData) return;
	
	// Get piece data from userData
	const pieceData = {
		id: piece.userData.id || `piece_${Date.now()}`,
		type: piece.userData.pieceType || piece.userData.type,
		player: piece.userData.player,
		x: piece.userData.position?.x || 0,
		z: piece.userData.position?.z || 0
	};
	
	// Calculate valid moves using boardFunctions
	const validMoves = boardFunctions.getChessPieceMoveSets(gameState, pieceData);
	gameState.validMoves = validMoves;
	
	// Highlight valid cells on the board
	highlightValidMoves(validMoves);
}

/**
 * Highlight cells that represent valid moves
 * @param {Array} validMoves - Array of valid move coordinates
 */
function highlightValidMoves(validMoves) {
	if (!validMoves || !Array.isArray(validMoves) || !boardGroup) return;
	
	// Get the THREE instance
	const THREE = getTHREE();
	if (!THREE) return;
	
	// Clean up any existing move highlights
	clearMoveHighlights();
	
	// Create a group for move highlights if it doesn't exist
	if (!window.moveHighlightsGroup) {
		window.moveHighlightsGroup = new THREE.Group();
		window.moveHighlightsGroup.name = 'moveHighlights';
		scene.add(window.moveHighlightsGroup);
	}
	
	// Create highlight for each valid move
	validMoves.forEach(move => {
		// Create a highlight mesh
		const geometry = new THREE.CircleGeometry(0.4, 32);
		const material = new THREE.MeshBasicMaterial({
			color: 0x00FF00,
			transparent: true,
			opacity: 0.5,
			side: THREE.DoubleSide
		});
		
		const highlight = new THREE.Mesh(geometry, material);
		highlight.name = 'moveHighlight';
		highlight.rotation.x = -Math.PI / 2; // Lay flat on the board
		
		// Position at the target cell (adjust for board centering if needed)
		const boardWidth = gameState.boardSize ? gameState.boardSize.width : 20;
		const boardHeight = gameState.boardSize ? gameState.boardSize.height : 20;
		
		highlight.position.set(
			move.x - (boardWidth / 2) + 0.5,
			0.02, // Just above the board surface
			move.z - (boardHeight / 2) + 0.5
		);
		
		// Store the move coordinates in the highlight's userData
		highlight.userData = {
			moveTarget: true,
			x: move.x,
			z: move.z
		};
		
		// Add to the highlights group
		window.moveHighlightsGroup.add(highlight);
	});
}

/**
 * Clear all move highlights from the board
 */
function clearMoveHighlights() {
	if (!window.moveHighlightsGroup) return;
	
	// Remove all highlights
	while (window.moveHighlightsGroup.children.length > 0) {
		const highlight = window.moveHighlightsGroup.children[0];
		
		// Dispose of geometries and materials
		if (highlight.geometry) highlight.geometry.dispose();
		if (highlight.material) {
			if (Array.isArray(highlight.material)) {
				highlight.material.forEach(m => m.dispose());
			} else {
				highlight.material.dispose();
			}
		}
		
		window.moveHighlightsGroup.remove(highlight);
	}
}

/**
 * Clear the current chess selection and highlights
 */
function clearChessSelection() {
	// Clear the selected piece
	gameState.selectedChessPiece = null;
	gameState.selectedHoveredPlayer = null;
	
	// Clear valid moves
	gameState.validMoves = [];
	
	// Clear move highlights
	clearMoveHighlights();
}

/**
 * Move a chess piece to the specified cell
 * @param {number} x - Target x-coordinate
 * @param {number} z - Target z-coordinate
 */
function moveChessPieceToCell(x, z) {
	if (!gameState.selectedChessPiece || !gameState.validMoves) {
		console.log('No piece selected or no valid moves available');
		return;
	}
	
	// Check if the target cell is a valid move
	const isValidMove = gameState.validMoves.some(move => move.x === x && move.z === z);
	
	if (!isValidMove) {
		console.log('Invalid move target');
		return;
	}
	
	// Get the piece data
	const piece = gameState.selectedChessPiece;
	const pieceData = {
		id: piece.userData.id || `piece_${Date.now()}`,
		type: piece.userData.pieceType || piece.userData.type,
		player: piece.userData.player,
		x: piece.userData.position?.x || 0,
		z: piece.userData.position?.z || 0
	};
	
	console.log(`Moving piece from [${pieceData.x}, ${pieceData.z}] to [${x}, ${z}]`);
	
	// Store original position in case we need to revert
	const originalX = pieceData.x;
	const originalZ = pieceData.z;
	
	// Disable further interactions during the move
	gameState.processingMove = true;
	
	// Start the move animation
	animateChessPieceMove(piece, originalX, originalZ, x, z, () => {
		// After animation, send the move to the server
		sendChessMoveToServer(pieceData, x, z, (success, responseData) => {
			// Re-enable interactions
			gameState.processingMove = false;
			
			if (success) {
				console.log('Server accepted the move');
				// Update the game state
				updateGameStateAfterChessMove(pieceData, x, z);
				
				// Transition to tetris phase
				gameState.turnPhase = 'tetris';
				updateGameStatusDisplay();
				
				// Show success message
				showTemporaryMessage('Move successful! Now for the Tetris phase.', 'success');
			} else {
				console.error('Server rejected the move');
				// Revert the move animation
				animateChessPieceMove(piece, x, z, originalX, originalZ, () => {
					// Show error message after animation completes
					showTemporaryMessage('Invalid move! Please try again.', 'error');
				});
			}
		});
	});
	
	// Clear selection and highlights
	clearChessSelection();
}

/**
 * Animate a chess piece moving from one position to another
 * @param {Object} piece - The chess piece object
 * @param {number} fromX - Starting x-coordinate
 * @param {number} fromZ - Starting z-coordinate
 * @param {number} toX - Target x-coordinate
 * @param {number} toZ - Target z-coordinate
 * @param {Function} onComplete - Callback when animation completes
 */
function animateChessPieceMove(piece, fromX, fromZ, toX, toZ, onComplete) {
	if (!piece || !window.TWEEN) {
		// If TWEEN isn't available, just update position instantly
		updatePiecePosition(piece, toX, toZ);
		if (onComplete) onComplete();
		return;
	}
	
	// Calculate world coordinates for the animation
	const boardWidth = gameState.boardSize ? gameState.boardSize.width : 20;
	const boardHeight = gameState.boardSize ? gameState.boardSize.height : 20;
	
	const startPos = {
		x: fromX - (boardWidth / 2) + 0.5,
		y: piece.position.y,
		z: fromZ - (boardHeight / 2) + 0.5
	};
	
	const endPos = {
		x: toX - (boardWidth / 2) + 0.5,
		y: piece.position.y + 0.5, // Lift up during move
		z: toZ - (boardHeight / 2) + 0.5
	};
	
	const finalPos = {
		x: toX - (boardWidth / 2) + 0.5,
		y: piece.position.y,
		z: toZ - (boardHeight / 2) + 0.5
	};
	
	// Create the animation
	const duration = 500; // 500ms
	
	// First tween: move up and to the target
	const upTween = new TWEEN.Tween(startPos)
		.to(endPos, duration / 2)
		.easing(TWEEN.Easing.Quadratic.Out)
		.onUpdate(() => {
			piece.position.set(startPos.x, startPos.y, startPos.z);
		});
	
	// Second tween: land on the target
	const downTween = new TWEEN.Tween(endPos)
		.to(finalPos, duration / 2)
		.easing(TWEEN.Easing.Bounce.Out)
		.onUpdate(() => {
			piece.position.set(endPos.x, endPos.y, endPos.z);
		})
		.onComplete(() => {
			// Update piece userData with new position
			if (piece.userData) {
				piece.userData.position = { x: toX, z: toZ };
			}
			
			// Call the completion callback
			if (onComplete) onComplete();
		});
	
	// Chain the animations and start
	upTween.chain(downTween);
	upTween.start();
}

/**
 * Update a piece's position directly (no animation)
 * @param {Object} piece - The chess piece object
 * @param {number} x - New x-coordinate
 * @param {number} z - New z-coordinate
 */
function updatePiecePosition(piece, x, z) {
	if (!piece) return;
	
	// Calculate world coordinates
	const boardWidth = gameState.boardSize ? gameState.boardSize.width : 20;
	const boardHeight = gameState.boardSize ? gameState.boardSize.height : 20;
	
	// Update position
	piece.position.set(
		x - (boardWidth / 2) + 0.5,
		piece.position.y,
		z - (boardHeight / 2) + 0.5
	);
	
	// Update piece userData with new position
	if (piece.userData) {
		piece.userData.position = { x, z };
	}
}

/**
 * Send a chess move to the server
 * @param {Object} piece - The piece data
 * @param {number} toX - Target x-coordinate
 * @param {number} toZ - Target z-coordinate
 * @param {Function} callback - Called with true if successful, false otherwise
 */
function sendChessMoveToServer(piece, toX, toZ, callback) {
	// Create the move data
	const moveData = {
		pieceId: piece.id,
		pieceType: piece.type,
		player: piece.player,
		fromX: piece.x,
		fromZ: piece.z,
		toX: toX,
		toZ: toZ
	};
	
	console.log('Sending chess move to server:', moveData);
	
	// Send to server
	fetch('/api/move-chess', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(moveData)
	})
	.then(response => {
		if (!response.ok) {
			console.error('Server response not OK:', response.status);
			throw new Error(`Server responded with status: ${response.status}`);
		}
		return response.json();
	})
	.then(data => {
		if (data.success) {
			console.log('Move successful:', data);
			callback(true, data);
		} else {
			console.error('Move rejected by server:', data.error || 'Unknown error');
			callback(false, data);
		}
	})
	.catch(error => {
		console.error('Error sending chess move:', error);
		callback(false, { error: error.message || 'Network error' });
	});
}

/**
 * Update the game state after a successful chess move
 * @param {Object} piece - The piece data
 * @param {number} toX - Target x-coordinate
 * @param {number} toZ - Target z-coordinate
 */
function updateGameStateAfterChessMove(piece, toX, toZ) {
	// Update the board state
	if (gameState.board && gameState.board.cells) {
		// Remove piece from original position
		const oldCellKey = `${piece.x},${piece.z}`;
		if (gameState.board.cells[oldCellKey]) {
			const oldCell = gameState.board.cells[oldCellKey];
			if (oldCell.chess) {
				oldCell.chess = null;
			}
		}
		
		// Add piece to new position
		const newCellKey = `${toX},${toZ}`;
		if (!gameState.board.cells[newCellKey]) {
			gameState.board.cells[newCellKey] = {};
		}
		
		// Check if there's a piece to capture
		if (gameState.board.cells[newCellKey].chess) {
			// Handle capture logic
			console.log('Capturing piece:', gameState.board.cells[newCellKey].chess);
		}
		
		// Place the piece in the new cell
		gameState.board.cells[newCellKey].chess = {
			id: piece.id,
			type: piece.type,
			player: piece.player
		};
	}
	
	// Update chessPieces array
	if (gameState.chessPieces && Array.isArray(gameState.chessPieces)) {
		// Find and update the piece
		const pieceIndex = gameState.chessPieces.findIndex(p => p.id === piece.id);
		if (pieceIndex >= 0) {
			gameState.chessPieces[pieceIndex].x = toX;
			gameState.chessPieces[pieceIndex].z = toZ;
		}
	}
	
	// Increment move counter
	if (gameState.moveCount !== undefined) {
		gameState.moveCount++;
	}
}

/**
 * Show piece information when clicking on an opponent's piece
 * @param {Object} piece - The chess piece
 */
function showPieceInfo(piece) {
	if (!piece || !piece.userData) return;
	
	// Highlight this piece temporarily
	highlightSinglePiece(piece);
	
	// Store the player ID for the player bar
	gameState.selectedHoveredPlayer = piece.userData.player;
	
	// Update the player bar
	updateUnifiedPlayerBar(gameState);
	
	// Show a popup with piece info
	showPieceInfoPopup(piece);
}

/**
 * Display a popup with chess piece information
 * @param {Object} piece - The chess piece
 */
function showPieceInfoPopup(piece) {
	const pieceType = piece.userData.pieceType || piece.userData.type;
	const piecePlayer = piece.userData.player;
	
	// Create or update the info popup
	let popup = document.getElementById('piece-info-popup');
	
	if (!popup) {
		popup = document.createElement('div');
		popup.id = 'piece-info-popup';
		popup.style.position = 'absolute';
		popup.style.padding = '10px';
		popup.style.background = 'rgba(0, 0, 0, 0.8)';
		popup.style.color = 'white';
		popup.style.borderRadius = '5px';
		popup.style.zIndex = '1000';
		popup.style.pointerEvents = 'none'; // Don't block clicks
		popup.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.5)';
		popup.style.transition = 'opacity 0.3s';
		popup.style.fontFamily = 'Arial, sans-serif';
		document.body.appendChild(popup);
	}
	
	// Get piece position for the popup content
	const position = piece.userData.position || { x: '?', z: '?' };
	
	// Set content with more detailed information
	popup.innerHTML = `
		<div style="font-weight: bold; margin-bottom: 5px;">${pieceType ? pieceType.toUpperCase() : 'UNKNOWN'}</div>
		<div>Player: ${piecePlayer}</div>
		<div>Position: [${position.x}, ${position.z}]</div>
	`;
	
	// Position near the mouse if available
	if (mouse && mouse.clientX && mouse.clientY) {
		popup.style.left = `${mouse.clientX + 15}px`;
		popup.style.top = `${mouse.clientY + 15}px`;
	} else {
		// Fallback positioning
		popup.style.left = '50%';
		popup.style.top = '50%';
		popup.style.transform = 'translate(-50%, -50%)';
	}
	
	popup.style.opacity = '1';
	
	// Auto-hide after a few seconds
	if (window.popupTimeout) {
		clearTimeout(window.popupTimeout);
	}
	
	window.popupTimeout = setTimeout(() => {
		popup.style.opacity = '0';
		// Only clear the selected player if it's not a selected piece
		if (!gameState.selectedChessPiece || 
			(gameState.selectedChessPiece.userData.player !== piecePlayer)) {
			setTimeout(() => {
				gameState.selectedHoveredPlayer = null;
				updateUnifiedPlayerBar(gameState);
			}, 300);
		}
	}, 3000);
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
			
			// Process mouse hover for chess pieces
			if (gameState.turnPhase === 'chess') {
				handleMouseHover();
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
				
				// Animate floating islands using our new function
				if (typeof sceneModule !== 'undefined' && typeof sceneModule.animateFloatingIslands === 'function') {
					sceneModule.animateFloatingIslands(scene);
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
		
		// Call animation module's update function if available
		if (window.animationsModule && typeof window.animationsModule.updateAnimations === 'function') {
			window.animationsModule.updateAnimations();
		}
		
		// Call any registered animation callbacks (for backwards compatibility)
		if (window._animationCallbacks && Array.isArray(window._animationCallbacks)) {
			for (let i = 0; i < window._animationCallbacks.length; i++) {
				if (typeof window._animationCallbacks[i] === 'function') {
					try {
						window._animationCallbacks[i]();
					} catch (err) {
						console.warn('Error in animation callback:', err);
					}
				}
			}
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
		
		// Only update LOD and game logic on heavy operation frames
		if (isHeavyOperationFrame) {
			// Update animated clouds
			if (time - lastLODUpdate > LOD_UPDATE_INTERVAL) {
				lastLODUpdate = time;
				// Update clouds
				if (typeof animateClouds === 'function') {
					animateClouds(scene);
				}
				
				// Update floating islands animation
				if (typeof sceneModule !== 'undefined' && typeof sceneModule.animateFloatingIslands === 'function') {
					sceneModule.animateFloatingIslands(scene);
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
	if (!axesHelper || !textElements) {
		return;
	}
	
	const showAxes = gameState.debugMode;
	axesHelper.visible = showAxes;
	
	// Update text elements visibility
	textElements.forEach(element => {
		element.visible = showAxes;
	});
}

function showTemporaryMessage(message, type = 'info') {
	// Get or create message element
	let messageElement = document.getElementById('game-message');
	if (!messageElement) {
		messageElement = document.createElement('div');
		messageElement.id = 'game-message';
		
		// Style the message container
		Object.assign(messageElement.style, {
			position: 'absolute',
			bottom: '20px',
			left: '50%',
			transform: 'translateX(-50%)',
			padding: '10px 20px',
			borderRadius: '5px',
			fontSize: '16px',
			fontWeight: 'bold',
			textAlign: 'center',
			zIndex: '1000',
			transition: 'opacity 0.3s ease',
			pointerEvents: 'none',
			opacity: '0'
		});
		
		document.body.appendChild(messageElement);
	}
	
	// Set style based on type
	let bgColor, textColor;
	switch (type) {
		case 'error':
			bgColor = 'rgba(220, 50, 50, 0.9)';
			textColor = '#ffffff';
			break;
		case 'success':
			bgColor = 'rgba(50, 180, 50, 0.9)';
			textColor = '#ffffff';
			break;
		case 'info':
		default:
			bgColor = 'rgba(50, 50, 220, 0.9)';
			textColor = '#ffffff';
			break;
	}
	
	// Apply styles
	messageElement.style.backgroundColor = bgColor;
	messageElement.style.color = textColor;
	
	// Set message text
	messageElement.textContent = message;
	
	// Show the message
	messageElement.style.opacity = '1';
	
	// Clear any existing timeout
	if (window.messageTimeout) {
		clearTimeout(window.messageTimeout);
	}
	
	// Auto-hide after a few seconds
	window.messageTimeout = setTimeout(() => {
		messageElement.style.opacity = '0';
	}, 3000);
}

// After existing initialization functions, add this new function

/**
 * Initialize and load the animations module
 * @returns {Promise} Promise that resolves when animations module is loaded
 */
export function initializeAnimations() {
	return new Promise((resolve, reject) => {
		try {
			// Import animations module dynamically
			import('./animations.js')
				.then(module => {
					// Make it available globally
					window.animationsModule = module;
					
					// Log success
					console.log('Animations module loaded successfully');
					
					// Add TWEEN update to animation loop if not already available
					if (!window.TWEEN && typeof module.updateAnimations === 'function') {
						// Add the update function to be called in the animation loop
						if (!window._animationCallbacks) {
							window._animationCallbacks = [];
						}
						window._animationCallbacks.push(module.updateAnimations);
						console.log('Added animations update function to animation loop');
					}
					
					resolve(module);
				})
				.catch(error => {
					console.error('Failed to load animations module:', error);
					reject(error);
				});
		} catch (error) {
			console.error('Error initializing animations:', error);
			reject(error);
		}
	});
}
