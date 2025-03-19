/**
 * GameIntegration.js
 * Handles the integration of the improved physics system and Russian theme
 * into the main game.
 */

import * as THREE from '../utils/three.js';
import { initRenderer } from '../rendering/modules/core.js';
import { init as initTetromino, spawnTetromino, moveTetrominoLeft, moveTetrominoRight, 
	moveTetrominoForward, moveTetrominoBackward, dropTetromino, rotateTetromino } from '../rendering/modules/tetromino.js';
import { Constants } from '../config/constants.js';

// Game state
let renderer;
let container;
let gameActive = false;
let gamePaused = false;
let keyState = {
	left: false,
	right: false,
	forward: false,
	backward: false,
	dropping: false,
	rotating: false
};

// Groups for organizing objects
let boardGroup;
let piecesGroup;
let tetrominoGroup;
let ghostGroup;
let highlightGroup;

/**
 * Initialize the game integration
 * @param {HTMLElement} gameContainer - The container element for the game
 * @param {Object} options - Configuration options
 */
export function initGameIntegration(gameContainer, options = {}) {
	console.log('Initializing game integration with improved physics and Russian theme');
	container = gameContainer;
	
	// Create groups
	boardGroup = new THREE.Group();
	piecesGroup = new THREE.Group();
	tetrominoGroup = new THREE.Group();
	ghostGroup = new THREE.Group();
	highlightGroup = new THREE.Group();
	
	// Set default options
	const defaultOptions = {
		enableSkybox: true,
		enableRussianTheme: true,
		enablePhysics: true,
		cellSize: Constants.CELL_SIZE || 1,
		boardSize: Constants.BOARD_SIZE || 10
	};
	
	// Merge options
	const rendererOptions = { ...defaultOptions, ...options };
	
	try {
		// Initialize the renderer
		renderer = initRenderer(container, rendererOptions);
		
		// Add groups to the scene
		renderer.scene.add(boardGroup);
		renderer.scene.add(piecesGroup);
		renderer.scene.add(tetrominoGroup);
		renderer.scene.add(ghostGroup);
		renderer.scene.add(highlightGroup);
		
		// Initialize tetromino module
		initTetromino(tetrominoGroup, ghostGroup);
		
		// Set up event listeners
		setupEventListeners();
		
		// Start animation loop
		animate();
		
		// Set game as active
		gameActive = true;
		
		return {
			renderer,
			boardGroup,
			piecesGroup,
			tetrominoGroup,
			ghostGroup,
			highlightGroup
		};
	} catch (error) {
		console.error('Failed to initialize game integration:', error);
		throw error;
	}
}

/**
 * Set up event listeners for game controls
 */
function setupEventListeners() {
	// Keyboard controls for tetromino movement
	window.addEventListener('keydown', handleKeyDown);
	window.addEventListener('keyup', handleKeyUp);
	
	// Window resize handler
	window.addEventListener('resize', handleWindowResize);
}

/**
 * Handle key down events for tetromino controls
 * @param {KeyboardEvent} event - The keyboard event
 */
function handleKeyDown(event) {
	if (!gameActive || gamePaused) return;
	
	switch (event.key) {
		case 'ArrowLeft':
			keyState.left = true;
			moveTetrominoLeft();
			break;
		case 'ArrowRight':
			keyState.right = true;
			moveTetrominoRight();
			break;
		case 'ArrowUp':
			keyState.forward = true;
			moveTetrominoForward();
			break;
		case 'ArrowDown':
			keyState.backward = true;
			moveTetrominoBackward();
			break;
		case ' ':
			keyState.dropping = true;
			dropTetromino();
			break;
		case 'q':
		case 'Q':
			keyState.rotating = true;
			rotateTetromino();
			break;
	}
}

/**
 * Handle key up events for tetromino controls
 * @param {KeyboardEvent} event - The keyboard event
 */
function handleKeyUp(event) {
	switch (event.key) {
		case 'ArrowLeft':
			keyState.left = false;
			break;
		case 'ArrowRight':
			keyState.right = false;
			break;
		case 'ArrowUp':
			keyState.forward = false;
			break;
		case 'ArrowDown':
			keyState.backward = false;
			break;
		case ' ':
			keyState.dropping = false;
			break;
		case 'q':
		case 'Q':
			keyState.rotating = false;
			break;
	}
}

/**
 * Handle window resize
 */
function handleWindowResize() {
	if (renderer) {
		renderer.handleResize();
	}
}

/**
 * Animation loop
 */
function animate() {
	requestAnimationFrame(animate);
	
	if (renderer) {
		renderer.render();
	}
}

/**
 * Start a new game
 */
export function startNewGame() {
	if (!gameActive) {
		gameActive = true;
	}
	
	// Clear existing tetrominos
	while (tetrominoGroup.children.length > 0) {
		tetrominoGroup.remove(tetrominoGroup.children[0]);
	}
	
	// Spawn a new tetromino
	spawnTetromino();
}

/**
 * Toggle pause state
 * @returns {boolean} - The new pause state
 */
export function togglePause() {
	gamePaused = !gamePaused;
	return gamePaused;
}

/**
 * Reset camera to default position
 */
export function resetCamera() {
	if (renderer) {
		renderer.resetCamera();
	}
}

/**
 * Spawn a new tetromino
 */
export function spawnNewTetromino() {
	spawnTetromino();
}

// Export tetromino control functions
export {
	moveTetrominoLeft,
	moveTetrominoRight,
	moveTetrominoForward,
	moveTetrominoBackward,
	dropTetromino,
	rotateTetromino
}; 