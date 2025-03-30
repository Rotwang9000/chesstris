/**
 * gameState.js - Singleton Game State Module
 * 
 * This module provides a centralised place to store and manage game state
 * that can be imported and shared across different files.
 */

// Create a singleton instance of the game state
const gameState = {
	lastGameTime: 0,
	players: {},
	chessPieces: [],
	board: { cells: {} },
	selectedPiece: null,
	phase: 'unknown',
	localPlayerId: null,
	currentPlayer: null, // Will be set in initialise()
	debugMode: false,
	activeTetromino: null,
	tetrominoList: [],
	hoveredCell: { x: -1, y: -1, z: -1 },
	gameOver: false,
	inMultiplayerMode: false,
	showChessControls: false,
	canPlaceTetromino: true,
	selectedTetrominoIndex: -1,
	// Theme flags
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
	isProcessingHardDrop: false,
	// Game state
	turnPhase: 'tetris',
	inProgress: false,
	paused: false,
	score: 0,
	level: 1,
	gameStarted: false,
	orientation: 0,
	// Tetromino settings
	TETROMINO_START_HEIGHT: 10,
	// Movement queue system
	tetrominoMovementQueue: [],
	isProcessingMovementQueue: false,
	lastMovementTime: 0,
	pendingRender: false,
	// Movement deltas for relative movement
	movementDelta: { x: 0, z: 0, y: 0, rotation: 0 }
};

/**
 * Generate a random player ID
 * @returns {string} Random player ID
 */
function generateRandomPlayerId() {
	return 'player_' + Math.random().toString(36).substring(2, 10);
}

/**
 * Initialise the game state with default values
 */
function initialise() {
	// Set current player to a random ID initially
	gameState.currentPlayer = generateRandomPlayerId();
	
	// Check if in development mode
	const isDevMode = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
	if (isDevMode) {
		console.log("Development mode detected: enabling debug features");
		gameState.debugMode = true;
	}
	
	console.log('Game state has been initialised');
}

/**
 * Reset game state to initial values
 */
function reset() {
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
 * Update the game state with new data
 * @param {Object} data - The new game state data
 */
function update(data) {
	// Verify we have valid data
	if (!data) return;
	
	// Create a deep copy of the data to avoid reference issues
	const newData = JSON.parse(JSON.stringify(data));
	
	// Update our game state with the new data
	Object.assign(gameState, newData);
	
	// Make sure gameStarted flag is set if we have board data
	if (gameState.board && gameState.board.cells && Object.keys(gameState.board.cells).length > 0) {
		gameState.gameStarted = true;
		// Set the orientation to the first chess piece
		if (gameState.chessPieces.length > 0) {
			gameState.orientation = gameState.chessPieces[0].orientation;
		}
	}
}

// Initialise the game state
initialise();

// Export the singleton instance and its methods
export default gameState;
export { reset, update, initialise };
