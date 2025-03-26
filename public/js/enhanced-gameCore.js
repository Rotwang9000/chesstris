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
import { createFallbackTextures, animateClouds } from './textures.js';
import { createFallbackModels } from './models.js';
import { showToastMessage } from './showToastMessage.js';
import { createNetworkStatusDisplay,  } from './createNetworkStatusDisplay.js';
import * as sceneModule from './scene.js';
import { boardFunctions } from './boardFunctions.js';
import { createLoadingIndicator, hideAllLoadingElements, showErrorMessage, updateGameIdDisplay, updateGameStatusDisplay, updateNetworkStatus } from './createLoadingIndicator.js';
import { moveTetrominoHorizontal, moveTetrominoVertical, rotateTetromino, hardDropTetromino, createTetrominoBlock } from './tetromino.js';
import { resetCameraForGameplay, setupCamera } from './setupCamera.js';
import { showTutorialMessage } from './createLoadingIndicator.js';
import { preserveCentreMarker, updateCellPreservingMarker } from './centreBoardMarker.js';
import { updatePlayerBar, createPlayerBar } from './updatePlayerBar.js';
import { updateChessPieces } from './updateChessPieces.js';
import chessPieceCreator from './chessPieceCreator.js';

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
const TETROMINO_START_HEIGHT = 4; // Starting height above the board

// UI controls for game flow
let uiButtons = {};

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

		// Initialize game state
		console.log("Initializing game state...");
		resetGameState(gameState);

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
		
		// Initialize scene components
		console.log("Setting up scene components...");
		initializeScene();
		
		// Set up the event system
		console.log("Setting up event system...");
		setupEventSystem();
		
		// Setup network events - this should happen BEFORE requesting data
		console.log("Setting up network events...");
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
	
	if (!chessPiecesGroup) {
		chessPiecesGroup = new THREE.Group();
		chessPiecesGroup.name = 'chessPieces';
		scene.add(chessPiecesGroup);
	}
	
	// Initialize raycaster for interactions
	raycaster = new THREE.Raycaster();
	mouse = new THREE.Vector2();
	
	// Set up input handlers
	console.log("Setting up input handlers...");
	setupInputHandlers();
	
	// Force a render of the scene to show something
	if (renderer && scene && camera) {
		renderer.render(scene, camera);
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
				updateChessPieces(chessPiecesGroup, camera, gameState);
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
	console.log('Resetting game state...');
	
	// Initialize game state
	gameState = {
		board: { 
			cells: {},  // Object mapping coordinates to cell data
			minX: 0,
			maxX: 15,
			minZ: 0,
			maxZ: 15,
			centreMarker: { x: 7, z: 7 }
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
	let lastControlsUpdate = 0; // For tracking controls updates
	
	// Track FPS for performance monitoring
	let frameCount = 0;
	let lastFpsUpdate = performance.now();
	
	// Frame limiting
	const TARGET_FRAMERATE = gameState.performanceMode ? 20 : 60; // Higher framerate for smoother controls
	const FRAME_TIME = 1000 / TARGET_FRAMERATE;
	let lastFrameTime = 0;
	
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
			
			// Handle TWEEN animations if available
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
				
				// Monitor performance - but don't apply drastic measures too early
				if (time > 10000) { // Only after 10 seconds of runtime
					monitorPerformance(fps);
				}
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
		updatePlayerBar(gameState);
	}
	
	// Update chess pieces if included
	if (data.chessPieces) {
		gameState.chessPieces = data.chessPieces;
		updateChessPieces(chessPiecesGroup, camera, gameState);
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
			updateChessPieces(chessPiecesGroup, camera, gameState);
		} else {
			console.log('No chess pieces in direct array - will extract from cells');
			// Update chess pieces from board cells
			updateChessPieces(chessPiecesGroup, camera, gameState);
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
			createPlayerBar(gameState);
			updatePlayerBar(gameState);
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
				updateChessPieces(chessPiecesGroup, camera, gameState);
			}
		}
		
		// Update game status display
		updateGameStatusDisplay();
		
		// Reset camera position based on received data 
		console.log("Resetting camera based on received game data");
		resetCameraForGameplay(renderer, camera, controls, gameState, scene, true, true);
		
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
			updateChessPieces(chessPiecesGroup, camera, gameState);
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
	console.log("Initializing game UI...");
	
	// Create player bar with current game state
	try {
		// Explicitly create player bar
		if (typeof createPlayerBar === 'function') {
			console.log("Creating player bar...");
			createPlayerBar(gameState);
		} else {
			console.error("createPlayerBar function not available");
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
 * Start the player's turn
 */
function startTurn() {	
	// If not our turn, do nothing
	
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
		// Check if OrbitControls is available from THREE
		if (typeof THREE.OrbitControls === 'function') {
			orbitControls = new THREE.OrbitControls(camera, domElement);
			console.log("Using THREE.OrbitControls");
		} 
		// Check if it's available as a global
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
			return null;
		}
		
		// Configure controls for smooth movement
		orbitControls.enableDamping = true;
		orbitControls.dampingFactor = 0.15;
		orbitControls.screenSpacePanning = true;
		orbitControls.minDistance = 10;
		orbitControls.maxDistance = 80;
		orbitControls.maxPolarAngle = Math.PI / 2 - 0.1; // Prevent going below horizon
		orbitControls.target.set(8, 0, 8); // Look at center of board
		
		// Set up controls to handle touch events properly
		orbitControls.touches = {
			ONE: THREE.TOUCH ? THREE.TOUCH.ROTATE : 0,
			TWO: THREE.TOUCH ? THREE.TOUCH.DOLLY_PAN : 1
		};
		
		// Enable smoother rotating/panning
		orbitControls.rotateSpeed = 0.7;
		orbitControls.panSpeed = 0.8;
		orbitControls.zoomSpeed = 1.0;
		
		// Ensure first update is called
		orbitControls.update();
		
		console.log("OrbitControls initialized successfully");
		
		// Add a visible indicator in the corner to show controls are active
		const controlIndicator = document.createElement('div');
		controlIndicator.style.position = 'fixed';
		controlIndicator.style.bottom = '10px';
		controlIndicator.style.right = '10px';
		controlIndicator.style.background = 'rgba(0,0,0,0.5)';
		controlIndicator.style.color = '#ffcc00';
		controlIndicator.style.padding = '5px 10px';
		controlIndicator.style.borderRadius = '3px';
		controlIndicator.style.fontSize = '12px';
		controlIndicator.style.zIndex = '9999';
		controlIndicator.textContent = 'Camera Controls Active';
		document.body.appendChild(controlIndicator);
		
		// Add some help text
		const helpText = document.createElement('div');
		helpText.style.position = 'fixed';
		helpText.style.bottom = '40px';
		helpText.style.right = '10px';
		helpText.style.background = 'rgba(0,0,0,0.5)';
		helpText.style.color = '#ffffff';
		helpText.style.padding = '5px 10px';
		helpText.style.borderRadius = '3px';
		helpText.style.fontSize = '12px';
		helpText.style.zIndex = '9999';
		helpText.style.maxWidth = '200px';
		helpText.innerHTML = 'Mouse: Left click + drag to rotate<br>Right click + drag to pan<br>Scroll to zoom';
		document.body.appendChild(helpText);
		
		return orbitControls;
	} catch (error) {
		console.error("Error initializing OrbitControls:", error);
		return null;
	}
}
