/**
 * Tetromino Manager Module
 * 
 * Handles tetris piece generation, movement, and placement.
 * This module focuses on the game logic for tetrominos, while
 * the rendering/modules/tetromino.js handles the visual representation.
 */

import * as GameState from './gameState.js';
import Network from '../utils/network-patch.js';

// Tetromino shapes
const SHAPES = {
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

// Tetromino colors - Russian-themed
const COLORS = {
	I: 0xc62828, // Kremlin Wall - Deep red
	O: 0x6a1b9a, // Red Square - Purple
	T: 0x1565c0, // Saint Basil's Cathedral - Deep blue
	J: 0xffb300, // Winter Palace - Amber
	L: 0x558b2f, // Lenin's Mausoleum - Green
	S: 0xe65100, // Cathedral of Christ the Saviour - Orange
	Z: 0x00695c  // Peterhof Palace - Teal
};

// Tetromino starting position
const STARTING_HEIGHT = 0;
const STARTING_X_OFFSET = 4; // Center of the board

// Current falling tetromino
let fallingPiece = null;

// Next tetromino
let nextPiece = null;

// Ghost piece (shadow)
let ghostPiece = null;

// Falling speed (cells per second)
let fallingSpeed = 1;

// Last update time
let lastUpdateTime = 0;

// Game loop interval
let gameLoopInterval = null;

/**
 * Generate a random tetromino type
 * @returns {string} The tetromino type (I, O, T, J, L, S, Z)
 */
function getRandomType() {
	const types = Object.keys(SHAPES);
	return types[Math.floor(Math.random() * types.length)];
}

/**
 * Create a new tetromino
 * @param {string} type - The tetromino type (I, O, T, J, L, S, Z)
 * @param {number} x - The x coordinate (center of the board by default)
 * @param {number} y - The y coordinate (top of the board by default)
 * @returns {Object} The tetromino object
 */
function createTetromino(type, x, y) {
	// Get the game state
	const gameState = GameState.getGameState();
	
	// Calculate the center of the board if x is not provided
	const centerX = x !== undefined ? x : Math.floor(gameState.boardWidth / 2) - 1;
	
	return {
		type,
		rotation: 0,
		x: centerX,
		y: y !== undefined ? y : STARTING_HEIGHT,
		shape: getTetrominoShape(type, 0),
		color: COLORS[type]
	};
}

/**
 * Get the tetromino shape based on type and rotation
 * @param {string} type - The tetromino type
 * @param {number} rotation - The rotation (0, 1, 2, 3)
 * @returns {Array} The tetromino shape as an array of [x, y] coordinates
 */
export function getTetrominoShape(type, rotation) {
	// Get the shape matrix
	const shapeMatrix = SHAPES[type];
	
	// Skip rotation for O piece (square)
	if (type === 'O') {
		return getShapeCoordinates(shapeMatrix);
	}
	
	// Rotate the shape
	const rotatedShape = getRotatedShape(shapeMatrix, rotation);
	
	// Convert to coordinates
	return getShapeCoordinates(rotatedShape);
}

/**
 * Get the coordinates of filled cells in a shape matrix
 * @param {Array} shapeMatrix - The shape matrix
 * @returns {Array} Array of [x, y] coordinates
 */
function getShapeCoordinates(shapeMatrix) {
	const coordinates = [];
	
	for (let y = 0; y < shapeMatrix.length; y++) {
		for (let x = 0; x < shapeMatrix[y].length; x++) {
			if (shapeMatrix[y][x]) {
				coordinates.push([x, y]);
			}
		}
	}
	
	return coordinates;
}

/**
 * Rotate a shape matrix
 * @param {Array} shapeMatrix - The shape matrix
 * @param {number} rotation - The rotation (0, 1, 2, 3)
 * @returns {Array} The rotated shape matrix
 */
function getRotatedShape(shapeMatrix, rotation) {
	// Normalize rotation to 0-3
	rotation = ((rotation % 4) + 4) % 4;
	
	// Skip rotation if 0
	if (rotation === 0) {
		return shapeMatrix;
	}
	
	const height = shapeMatrix.length;
	const width = shapeMatrix[0].length;
	let rotatedMatrix;
	
	switch (rotation) {
		case 1: // 90 degrees clockwise
			rotatedMatrix = Array(width).fill().map(() => Array(height).fill(0));
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					rotatedMatrix[x][height - 1 - y] = shapeMatrix[y][x];
				}
			}
			break;
		case 2: // 180 degrees
			rotatedMatrix = Array(height).fill().map(() => Array(width).fill(0));
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					rotatedMatrix[height - 1 - y][width - 1 - x] = shapeMatrix[y][x];
				}
			}
			break;
		case 3: // 270 degrees clockwise
			rotatedMatrix = Array(width).fill().map(() => Array(height).fill(0));
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					rotatedMatrix[width - 1 - x][y] = shapeMatrix[y][x];
				}
			}
			break;
		default:
			rotatedMatrix = shapeMatrix;
	}
	
	return rotatedMatrix;
}

/**
 * Spawn a new tetromino at the top of the board
 * @returns {Object|null} The spawned tetromino or null if game over
 */
export function spawnTetromino() {
	try {
		console.log('Spawning new tetromino');
		
		// Get the game state
		const gameState = GameState.getGameState();
		
		// If there's a next piece, use it
		if (nextPiece) {
			console.log(`Using next piece of type ${nextPiece.type}`);
			fallingPiece = nextPiece;
		} else {
			// Create a new tetromino at the top center of the board
			const type = getRandomType();
			console.log(`No next piece, creating new tetromino of type ${type}`);
			fallingPiece = createTetromino(type, STARTING_X_OFFSET, STARTING_HEIGHT);
		}
		
		// Generate the next piece
		nextPiece = generateNextPiece();
		console.log(`Generated next piece of type ${nextPiece.type}`);
		
		// Update the ghost piece
		updateGhostPiece();
		
		// Check if the spawn position is valid
		if (!isValidPosition(fallingPiece, fallingPiece.x, fallingPiece.y)) {
			console.warn('Game over: Cannot spawn tetromino at starting position');
			
			// Game over if the spawn position is invalid
			gameState.isGameOver = true;
			GameState.updateGameState(gameState);
			
			// Play game over sound
			if (window.SoundManager) {
				window.SoundManager.playSound('gameOver');
			}
			
			return null;
		}
		
		console.log(`Successfully spawned tetromino of type ${fallingPiece.type} at position (${fallingPiece.x}, ${fallingPiece.y})`);
		
		// Update the game state
		gameState.fallingPiece = fallingPiece;
		gameState.nextPiece = nextPiece;
		gameState.ghostPiece = ghostPiece;
		
		// Dispatch a game state update event
		GameState.updateGameState(gameState);
		
		// Play spawn sound
		if (window.SoundManager) {
			window.SoundManager.playSound('spawn');
		}
		
		return fallingPiece;
	} catch (error) {
		console.error('Error spawning tetromino:', error);
		return null;
	}
}

/**
 * Generate the next tetromino
 * @returns {Object} The next tetromino
 */
function generateNextPiece() {
	const type = getRandomType();
	return createTetromino(type, STARTING_X_OFFSET, STARTING_HEIGHT);
}

/**
 * Get the falling tetromino
 * @returns {Object} The falling tetromino
 */
export function getFallingPiece() {
	return fallingPiece;
}

/**
 * Set the falling tetromino
 * @param {Object} piece - The tetromino to set as falling
 */
export function setFallingPiece(piece) {
	fallingPiece = piece;
	
	// Update the ghost piece
	updateGhostPiece();
	
	// Update the game state
	const gameState = GameState.getGameState();
	gameState.fallingPiece = fallingPiece;
	gameState.ghostPiece = ghostPiece;
	
	// Dispatch a game state update event
	GameState.updateGameState(gameState);
}

/**
 * Move the tetromino
 * @param {number} dx - The x direction (-1 for left, 1 for right)
 * @param {number} dy - The y direction (1 for down)
 * @returns {boolean} Whether the move was successful
 */
export async function moveTetromino(dx, dy) {
	// Get the falling piece
	const fallingPiece = getFallingPiece();
	
	// If there's no falling piece, return
	if (!fallingPiece) {
		return false;
	}
	
	// Calculate the new position
	const newX = fallingPiece.x + dx;
	const newY = fallingPiece.y + dy;
	
	// Check if the new position is valid
	if (!isValidPosition(fallingPiece, newX, newY)) {
		// If moving down and the position is invalid, lock the piece
		if (dy > 0) {
			lockTetromino();
			return false;
		}
		
		// If moving horizontally and hitting a wall, try to bounce
		if (dx !== 0 && dy === 0) {
			// Check if we can bounce by moving up
			if (isValidPosition(fallingPiece, newX, fallingPiece.y - 1)) {
				fallingPiece.x = newX;
				fallingPiece.y = fallingPiece.y - 1;
				
				// Update the ghost piece
				updateGhostPiece();
				
				// Update the game state
				const gameState = GameState.getGameState();
				gameState.fallingPiece = fallingPiece;
				gameState.ghostPiece = ghostPiece;
				
				// Dispatch a game state update event
				GameState.updateGameState(gameState);
				
				// Play bounce sound
				if (window.SoundManager) {
					window.SoundManager.playSound('bounce');
				}
				
				return true;
			}
			
			return false;
		}
		
		return false;
	}
	
	// Update the position
	fallingPiece.x = newX;
	fallingPiece.y = newY;
	
	// Update the ghost piece
	updateGhostPiece();
	
	// Update the game state
	const gameState = GameState.getGameState();
	gameState.fallingPiece = fallingPiece;
	gameState.ghostPiece = ghostPiece;
	
	// Dispatch a game state update event
	GameState.updateGameState(gameState);
	
	// Play move sound
	if (window.SoundManager && dx !== 0) {
		window.SoundManager.playSound('move');
	}
	
	return true;
}

/**
 * Rotate the tetromino
 * @returns {boolean} Whether the rotation was successful
 */
export async function rotateTetromino() {
	// Get the falling piece
	const fallingPiece = getFallingPiece();
	
	// If there's no falling piece, return
	if (!fallingPiece) {
		return false;
	}
	
	// Skip rotation for O piece (square)
	if (fallingPiece.type === 'O') {
		return true;
	}
	
	// Calculate the new rotation
	const newRotation = (fallingPiece.rotation + 1) % 4;
	
	// Get the rotated shape
	const rotatedShape = getTetrominoShape(fallingPiece.type, newRotation);
	
	// Check if the rotated position is valid
	if (!isValidPosition({ ...fallingPiece, shape: rotatedShape }, fallingPiece.x, fallingPiece.y)) {
		// Try wall kicks
		const wallKicks = getWallKicks(fallingPiece.type, fallingPiece.rotation, newRotation);
		
		let validKickFound = false;
		
		for (const [kickX, kickY] of wallKicks) {
			if (isValidPosition({ ...fallingPiece, shape: rotatedShape }, fallingPiece.x + kickX, fallingPiece.y + kickY)) {
				// Apply the wall kick
				fallingPiece.x += kickX;
				fallingPiece.y += kickY;
				validKickFound = true;
				break;
			}
		}
		
		if (!validKickFound) {
			return false;
		}
	}
	
	// Update the rotation
	fallingPiece.rotation = newRotation;
	fallingPiece.shape = rotatedShape;
	
	// Update the ghost piece
	updateGhostPiece();
	
	// Update the game state
	const gameState = GameState.getGameState();
	gameState.fallingPiece = fallingPiece;
	gameState.ghostPiece = ghostPiece;
	
	// Dispatch a game state update event
	GameState.updateGameState(gameState);
	
	// Play sound effect
	if (window.SoundManager) {
		window.SoundManager.playSound('rotate');
	}
	
	return true;
}

/**
 * Get wall kicks for a tetromino rotation
 * @param {string} type - The tetromino type
 * @param {number} fromRotation - The current rotation
 * @param {number} toRotation - The target rotation
 * @returns {Array} Array of [x, y] offsets to try
 */
function getWallKicks(type, fromRotation, toRotation) {
	// Basic wall kicks (try left, right, up)
	const basicKicks = [
		[0, 0],   // No kick
		[-1, 0],  // Left
		[1, 0],   // Right
		[0, -1],  // Up
		[-1, -1], // Left and up
		[1, -1]   // Right and up
	];
	
	// Special wall kicks for I piece
	if (type === 'I') {
		return [
			...basicKicks,
			[-2, 0], // Far left
			[2, 0],  // Far right
			[0, -2]  // Far up
		];
	}
	
	return basicKicks;
}

/**
 * Drop the tetromino to the bottom
 * This function is triggered by the 'A' key or double tap on mobile
 * @returns {boolean} Whether the drop was successful
 */
export async function dropTetromino() {
	// Get the falling piece
	const fallingPiece = getFallingPiece();
	
	// If there's no falling piece, return
	if (!fallingPiece) {
		return false;
	}
	
	// Get the ghost piece
	const ghost = getGhostPiece();
	
	if (!ghost) {
		return false;
	}
	
	// Move the piece to the ghost position
	fallingPiece.y = ghost.y;
	
	// Update the game state
	const gameState = GameState.getGameState();
	gameState.fallingPiece = fallingPiece;
	
	// Dispatch a game state update event
	GameState.updateGameState(gameState);
	
	// Lock the tetromino
	lockTetromino();
	
	// Play drop sound
	if (window.SoundManager) {
		window.SoundManager.playSound('drop');
	}
	
	return true;
}

/**
 * Lock the tetromino in place
 */
function lockTetromino() {
	// Get the falling piece
	const fallingPiece = getFallingPiece();
	
	// If there's no falling piece, return
	if (!fallingPiece) {
		return;
	}
	
	// Get the game state
	const gameState = GameState.getGameState();
	
	// Add the tetromino to the board
	for (const [blockX, blockY] of fallingPiece.shape) {
		const x = fallingPiece.x + blockX;
		const y = fallingPiece.y + blockY;
		
		// Skip if out of bounds
		if (x < 0 || x >= gameState.boardWidth || y < 0 || y >= gameState.boardHeight) {
			continue;
		}
		
		// Set the cell
		if (!gameState.board[y]) {
			gameState.board[y] = [];
		}
		
		gameState.board[y][x] = {
			type: 'tetromino',
			tetrominoType: fallingPiece.type,
			color: fallingPiece.color
		};
	}
	
	// Clear the falling piece
	gameState.fallingPiece = null;
	setFallingPiece(null);
	
	// Check for completed rows
	const rowsCleared = checkCompletedRows();
	
	// Update score based on rows cleared
	if (rowsCleared > 0) {
		// Calculate score
		const scoreMultiplier = [0, 100, 300, 500, 800]; // Points for 0, 1, 2, 3, 4 rows
		const score = scoreMultiplier[rowsCleared] * (gameState.level || 1);
		
		// Update game state
		gameState.score = (gameState.score || 0) + score;
		gameState.linesCleared = (gameState.linesCleared || 0) + rowsCleared;
		
		// Update level
		const newLevel = Math.floor(gameState.linesCleared / 10) + 1;
		if (newLevel !== gameState.level) {
			gameState.level = newLevel;
			fallingSpeed = 1 + (newLevel - 1) * 0.5; // Increase speed with level
		}
		
		// Play sound effect
		if (window.SoundManager) {
			if (rowsCleared === 4) {
				window.SoundManager.playSound('tetris');
			} else {
				window.SoundManager.playSound('lineClear');
			}
		}
	}
	
	// Spawn a new tetromino
	spawnTetromino();
	
	// Dispatch a game state update event
	GameState.updateGameState(gameState);
}

/**
 * Check for completed rows and clear them
 * @returns {number} The number of rows cleared
 */
function checkCompletedRows() {
	// Get the game state
	const gameState = GameState.getGameState();
	const { board, boardWidth, boardHeight } = gameState;
	
	// Keep track of completed rows
	const completedRows = [];
	
	// Check each row
	for (let y = 0; y < boardHeight; y++) {
		if (!board[y]) continue;
		
		let isRowComplete = true;
		
		// Check if the row is complete
		for (let x = 0; x < boardWidth; x++) {
			if (!board[y][x] || board[y][x].type !== 'tetromino') {
				isRowComplete = false;
				break;
			}
		}
		
		// Add to completed rows
		if (isRowComplete) {
			completedRows.push(y);
		}
	}
	
	// Clear completed rows
	for (const y of completedRows) {
		// Remove the row
		board[y] = Array(boardWidth).fill(null);
		
		// Shift rows down
		for (let row = y; row > 0; row--) {
			board[row] = board[row - 1] ? [...board[row - 1]] : Array(boardWidth).fill(null);
		}
		
		// Clear the top row
		board[0] = Array(boardWidth).fill(null);
	}
	
	return completedRows.length;
}

/**
 * Check if a tetromino position is valid
 * @param {Object} piece - The tetromino to check
 * @param {number} x - The x coordinate
 * @param {number} y - The y coordinate
 * @returns {boolean} Whether the position is valid
 */
function isValidPosition(piece, x, y) {
	if (!piece) return false;
	
	// Get the game state
	const gameState = GameState.getGameState();
	
	// Check each cell of the tetromino
	for (const [blockX, blockY] of piece.shape) {
		const boardX = x + blockX;
		const boardY = y + blockY;
		
		// Check if out of bounds
		if (boardX < 0 || boardY < 0 || boardX >= gameState.boardWidth || boardY >= gameState.boardHeight) {
			return false;
		}
		
		// Check if collides with another piece
		if (gameState.board[boardY] && 
			gameState.board[boardY][boardX] && 
			gameState.board[boardY][boardX].type === 'tetromino') {
			return false;
		}
	}
	
	return true;
}

/**
 * Update the ghost piece (preview of where the tetromino will land)
 */
function updateGhostPiece() {
	try {
		// If there's no falling piece, clear the ghost piece
		if (!fallingPiece) {
			console.log('No falling piece, clearing ghost piece');
			ghostPiece = null;
			return;
		}
		
		console.log(`Updating ghost piece for tetromino of type ${fallingPiece.type}`);
		
		// Create a copy of the falling piece
		ghostPiece = { ...fallingPiece };
		
		// Move the ghost piece down until it collides
		let y = fallingPiece.y;
		
		while (isValidPosition(fallingPiece, fallingPiece.x, y + 1)) {
			y++;
		}
		
		// Set the ghost piece position
		ghostPiece.y = y;
		
		console.log(`Ghost piece positioned at (${ghostPiece.x}, ${ghostPiece.y}), ${y - fallingPiece.y} cells below the falling piece`);
		
		// Update the game state
		const gameState = GameState.getGameState();
		gameState.ghostPiece = ghostPiece;
		GameState.updateGameState(gameState);
	} catch (error) {
		console.error('Error updating ghost piece:', error);
	}
}

/**
 * Get the ghost piece (preview of where the tetromino will land)
 * @returns {Object|null} The ghost piece or null if no falling piece
 */
export function getGhostPiece() {
	return ghostPiece;
}

/**
 * Start the game loop
 */
export function startGameLoop() {
	// Clear any existing interval
	if (gameLoopInterval) {
		clearInterval(gameLoopInterval);
	}
	
	// Set the last update time
	lastUpdateTime = Date.now();
	
	// Start the game loop
	gameLoopInterval = setInterval(updateGame, 16); // ~60 FPS
}

/**
 * Stop the game loop
 */
export function stopGameLoop() {
	if (gameLoopInterval) {
		clearInterval(gameLoopInterval);
		gameLoopInterval = null;
	}
}

/**
 * Update the game
 */
function updateGame() {
	// Get the game state
	const gameState = GameState.getGameState();
	
	// Skip if paused or game over
	if (gameState.isPaused || gameState.isGameOver) {
		return;
	}
	
	// Get the current time
	const currentTime = Date.now();
	const deltaTime = (currentTime - lastUpdateTime) / 1000; // Convert to seconds
	
	// Update the last update time
	lastUpdateTime = currentTime;
	
	// Move the tetromino down based on falling speed
	if (fallingPiece) {
		// Calculate how far to move down
		const fallDistance = fallingSpeed * deltaTime;
		
		// Accumulate fractional movement
		fallingPiece.fallAccumulator = (fallingPiece.fallAccumulator || 0) + fallDistance;
		
		// Move down if accumulated enough
		if (fallingPiece.fallAccumulator >= 1) {
			// Get the number of cells to move down
			const cellsToMove = Math.floor(fallingPiece.fallAccumulator);
			
			// Reset the accumulator
			fallingPiece.fallAccumulator -= cellsToMove;
			
			// Move down
			for (let i = 0; i < cellsToMove; i++) {
				if (!moveTetromino(0, 1)) {
					break;
				}
			}
		}
	} else {
		// Spawn a new tetromino if there isn't one
		spawnTetromino();
	}
}

/**
 * Initialize the tetromino manager
 */
export function init() {
	// Get the game state
	const gameState = GameState.getGameState();
	
	// Set initial values
	fallingPiece = null;
	nextPiece = null;
	ghostPiece = null;
	fallingSpeed = 1;
	lastUpdateTime = Date.now();
	
	// Start the game loop
	startGameLoop();
	
	// Spawn the first tetromino
	spawnTetromino();
	
	console.log('Tetromino manager initialized');
}

// Export functions
export default {
	init,
	getTetrominoShape,
	spawnTetromino,
	getFallingPiece,
	setFallingPiece,
	moveTetromino,
	rotateTetromino,
	dropTetromino,
	getGhostPiece,
	startGameLoop,
	stopGameLoop
};
