/**
 * Tetromino Manager Utility
 *
 * Handles tetromino creation, movement, and collision detection
 */

import * as gameStateManager from './gameStateManager.js';
import * as soundManager from './soundManager.js';
import * as chessManager from './chessManager.js';

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
	S: [
		[0, 1, 1],
		[1, 1, 0],
		[0, 0, 0]
	],
	Z: [
		[1, 1, 0],
		[0, 1, 1],
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
	]
};

// Tetromino types
const TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

// Tetromino colors (for reference)
const COLORS = {
	I: 'cyan',
	O: 'yellow',
	T: 'purple',
	S: 'green',
	Z: 'red',
	J: 'blue',
	L: 'orange'
};

// Current state
let currentTetromino = null;
let nextTetromino = null;
let heldTetromino = null;
let canHold = true;
let dropInterval = null;
let isDropping = false;
let lastMoveTime = 0;
let moveSpeed = 100; // ms between moves
let softDropSpeed = 50; // ms between soft drop moves
let lockDelay = 500; // ms to wait before locking
let lockTimer = null;
let isInitialized = false;
let board = [];
let boardWidth = 10;
let boardHeight = 20;
let gameSpeed = 1000; // ms between drops
let level = 1;
let score = 0;
let lines = 0;

/**
 * Initialize the tetromino manager
 * @param {Object} options - Configuration options
 * @returns {boolean} Success status
 */
export function init(options = {}) {
	try {
		if (isInitialized) {
			console.warn('Tetromino manager already initialized');
			return true;
		}
		
		console.log('Initializing tetromino manager...');
		
		// Apply options
		boardWidth = options.boardWidth || boardWidth;
		boardHeight = options.boardHeight || boardHeight;
		gameSpeed = options.gameSpeed || gameSpeed;
		level = options.level || level;
		
		// Initialize board
		resetBoard();
		
		// Generate first tetromino
		nextTetromino = generateTetromino();
		
		isInitialized = true;
		console.log('Tetromino manager initialized');
		return true;
	} catch (error) {
		console.error('Error initializing tetromino manager:', error);
		return false;
	}
}

/**
 * Reset the game board
 */
function resetBoard() {
	board = [];
	
	for (let y = 0; y < boardHeight; y++) {
		const row = [];
		for (let x = 0; x < boardWidth; x++) {
			row.push(0);
		}
		board.push(row);
	}
}

/**
 * Generate a new random tetromino
 * @returns {Object} Tetromino object
 */
export function generateTetromino() {
	const type = TYPES[Math.floor(Math.random() * TYPES.length)];
	const shape = SHAPES[type];
	
	return {
		type,
		shape: JSON.parse(JSON.stringify(shape)), // Deep copy
		position: {
			x: Math.floor((boardWidth - shape[0].length) / 2),
			y: 0
		},
		rotation: 0
	};
}

/**
 * Spawn the next tetromino
 * @returns {Object} Current tetromino
 */
export function spawnTetromino() {
	// Move next tetromino to current
	currentTetromino = nextTetromino;
	
	// Generate new next tetromino
	nextTetromino = generateTetromino();
	
	// Reset hold flag
	canHold = true;
	
	// Check for collision (game over)
	if (checkCollision(currentTetromino)) {
		gameStateManager.endGame();
		return null;
	}
	
	// Start drop interval
	startDropInterval();
	
	return currentTetromino;
}

/**
 * Start the drop interval
 */
function startDropInterval() {
	if (dropInterval) {
		clearInterval(dropInterval);
	}
	
	dropInterval = setInterval(() => {
		if (!isDropping) {
			moveDown();
		}
	}, gameSpeed / level);
}

/**
 * Stop the drop interval
 */
function stopDropInterval() {
	if (dropInterval) {
		clearInterval(dropInterval);
		dropInterval = null;
	}
}

/**
 * Move the current tetromino left
 * @returns {boolean} Success status
 */
export function moveLeft() {
	if (!currentTetromino || isDropping) {
		return false;
	}
	
	// Throttle moves
	const now = Date.now();
	if (now - lastMoveTime < moveSpeed) {
		return false;
	}
	lastMoveTime = now;
	
	// Create a copy of the current tetromino
	const newTetromino = JSON.parse(JSON.stringify(currentTetromino));
	newTetromino.position.x--;
	
	// Check for collision
	if (checkCollision(newTetromino)) {
		return false;
	}
	
	// Update position
	currentTetromino.position.x--;
	
	// Reset lock timer
	resetLockTimer();
	
	// Play sound
	soundManager.play('move');
	
	return true;
}

/**
 * Move the current tetromino right
 * @returns {boolean} Success status
 */
export function moveRight() {
	if (!currentTetromino || isDropping) {
		return false;
	}
	
	// Throttle moves
	const now = Date.now();
	if (now - lastMoveTime < moveSpeed) {
		return false;
	}
	lastMoveTime = now;
	
	// Create a copy of the current tetromino
	const newTetromino = JSON.parse(JSON.stringify(currentTetromino));
	newTetromino.position.x++;
	
	// Check for collision
	if (checkCollision(newTetromino)) {
		return false;
	}
	
	// Update position
	currentTetromino.position.x++;
	
	// Reset lock timer
	resetLockTimer();
	
	// Play sound
	soundManager.play('move');
	
	return true;
}

/**
 * Move the current tetromino down
 * @returns {boolean} Success status
 */
export function moveDown() {
	if (!currentTetromino) {
		return false;
	}
	
	// Create a copy of the current tetromino
	const newTetromino = JSON.parse(JSON.stringify(currentTetromino));
	newTetromino.position.y++;
	
	// Check for collision
	if (checkCollision(newTetromino)) {
		// Lock the tetromino
		lockTetromino();
		return false;
	}
	
	// Update position
	currentTetromino.position.y++;
	
	// Reset lock timer
	resetLockTimer();
	
	return true;
}

/**
 * Start soft drop
 * @returns {boolean} Success status
 */
export function startSoftDrop() {
	if (!currentTetromino || isDropping) {
		return false;
	}
	
	isDropping = true;
	
	// Start soft drop interval
	const softDropInterval = setInterval(() => {
		if (!moveDown()) {
			clearInterval(softDropInterval);
			isDropping = false;
		}
	}, softDropSpeed);
	
	return true;
}

/**
 * Stop soft drop
 */
export function stopSoftDrop() {
	isDropping = false;
}

/**
 * Hard drop the current tetromino
 * @returns {boolean} Success status
 */
export function hardDrop() {
	if (!currentTetromino || isDropping) {
		return false;
	}
	
	// Move down until collision
	let distance = 0;
	while (moveDown()) {
		distance++;
	}
	
	// Add score based on distance
	addScore(distance * 2);
	
	// Play sound
	soundManager.play('place');
	
	return true;
}

/**
 * Rotate the current tetromino clockwise
 * @returns {boolean} Success status
 */
export function rotateClockwise() {
	if (!currentTetromino || isDropping) {
		return false;
	}
	
	// Create a copy of the current tetromino
	const newTetromino = JSON.parse(JSON.stringify(currentTetromino));
	
	// Rotate the shape
	const shape = newTetromino.shape;
	const size = shape.length;
	const newShape = [];
	
	for (let y = 0; y < size; y++) {
		newShape[y] = [];
		for (let x = 0; x < size; x++) {
			newShape[y][x] = shape[size - 1 - x][y];
		}
	}
	
	newTetromino.shape = newShape;
	
	// Check for collision with wall kicks
	if (!checkCollisionWithWallKicks(newTetromino)) {
		// Update shape
		currentTetromino.shape = newShape;
		currentTetromino.rotation = (currentTetromino.rotation + 1) % 4;
		
		// Reset lock timer
		resetLockTimer();
		
		// Play sound
		soundManager.play('rotate');
		
		return true;
	}
	
	return false;
}

/**
 * Rotate the current tetromino counter-clockwise
 * @returns {boolean} Success status
 */
export function rotateCounterClockwise() {
	if (!currentTetromino || isDropping) {
		return false;
	}
	
	// Create a copy of the current tetromino
	const newTetromino = JSON.parse(JSON.stringify(currentTetromino));
	
	// Rotate the shape
	const shape = newTetromino.shape;
	const size = shape.length;
	const newShape = [];
	
	for (let y = 0; y < size; y++) {
		newShape[y] = [];
		for (let x = 0; x < size; x++) {
			newShape[y][x] = shape[x][size - 1 - y];
		}
	}
	
	newTetromino.shape = newShape;
	
	// Check for collision with wall kicks
	if (!checkCollisionWithWallKicks(newTetromino)) {
		// Update shape
		currentTetromino.shape = newShape;
		currentTetromino.rotation = (currentTetromino.rotation + 3) % 4;
		
		// Reset lock timer
		resetLockTimer();
		
		// Play sound
		soundManager.play('rotate');
		
		return true;
	}
	
	return false;
}

/**
 * Check for collision with wall kicks
 * @param {Object} tetromino - Tetromino to check
 * @returns {boolean} True if collision, false if no collision
 */
function checkCollisionWithWallKicks(tetromino) {
	// Try original position
	if (!checkCollision(tetromino)) {
		return false;
	}
	
	// Try wall kicks
	const wallKicks = [
		{ x: -1, y: 0 }, // Left
		{ x: 1, y: 0 },  // Right
		{ x: 0, y: -1 }, // Up
		{ x: -2, y: 0 }, // Left x2
		{ x: 2, y: 0 },  // Right x2
		{ x: 0, y: -2 }, // Up x2
		{ x: -1, y: -1 }, // Left + Up
		{ x: 1, y: -1 }   // Right + Up
	];
	
	for (const kick of wallKicks) {
		const kickedTetromino = JSON.parse(JSON.stringify(tetromino));
		kickedTetromino.position.x += kick.x;
		kickedTetromino.position.y += kick.y;
		
		if (!checkCollision(kickedTetromino)) {
			// Apply wall kick
			currentTetromino.position.x += kick.x;
			currentTetromino.position.y += kick.y;
			return false;
		}
	}
	
	return true;
}

/**
 * Hold the current tetromino
 * @returns {boolean} Success status
 */
export function holdTetromino() {
	if (!currentTetromino || !canHold || isDropping) {
		return false;
	}
	
	// Play sound
	soundManager.play('move');
	
	// Swap current and held tetrominos
	const temp = heldTetromino;
	heldTetromino = {
		type: currentTetromino.type,
		shape: JSON.parse(JSON.stringify(SHAPES[currentTetromino.type])), // Reset rotation
		position: { x: 0, y: 0 },
		rotation: 0
	};
	
	if (temp) {
		// Use held tetromino
		currentTetromino = {
			type: temp.type,
			shape: temp.shape,
			position: {
				x: Math.floor((boardWidth - temp.shape[0].length) / 2),
				y: 0
			},
			rotation: temp.rotation
		};
	} else {
		// Use next tetromino
		currentTetromino = nextTetromino;
		nextTetromino = generateTetromino();
	}
	
	// Prevent holding again until next tetromino
	canHold = false;
	
	// Reset lock timer
	resetLockTimer();
	
	return true;
}

/**
 * Lock the current tetromino in place
 */
function lockTetromino() {
	if (!currentTetromino) {
		return;
	}
	
	// Check if tetromino has a valid connection to the player's king
	if (!hasPathToKing(currentTetromino)) {
		// If no valid connection, don't place the tetromino
		// Play error sound
		soundManager.play('error');
		
		// Spawn next tetromino
		spawnTetromino();
		return;
	}
	
	// Add tetromino to board
	const { shape, position, type } = currentTetromino;
	const typeValue = TYPES.indexOf(type) + 1; // 1-7 for I-L
	
	for (let y = 0; y < shape.length; y++) {
		for (let x = 0; x < shape[y].length; x++) {
			if (shape[y][x]) {
				const boardX = position.x + x;
				const boardY = position.y + y;
				
				// Check if within board bounds
				if (boardY >= 0 && boardY < boardHeight && boardX >= 0 && boardX < boardWidth) {
					board[boardY][boardX] = typeValue;
				}
			}
		}
	}
	
	// Clear any full rows
	const clearedRows = clearRows();
	
	// Update score and level
	if (clearedRows > 0) {
		addScore(calculateScore(clearedRows));
		addLines(clearedRows);
		
		// Play clear sound
		soundManager.play('clear');
	} else {
		// Play place sound
		soundManager.play('place');
	}
	
	// Spawn next tetromino
	spawnTetromino();
}

/**
 * Check if the tetromino has a valid path to the player's king
 * @param {Object} tetromino - Tetromino to check
 * @returns {boolean} True if there's a path to the king, false otherwise
 */
function hasPathToKing(tetromino) {
	try {
		// Get the player's king
		if (!chessManager) {
			// If chessManager is not properly initialized, allow placement
			console.warn('Chess manager not initialized, skipping path check');
			return true;
		}
		
		// Check if the required functions exist
		if (typeof chessManager.getPiecesByPlayer !== 'function') {
			console.warn('Chess manager missing getPiecesByPlayer function, skipping path check');
			return true;
		}
		
		const playerPieces = chessManager.getPiecesByPlayer(1); // 1 = WHITE
		
		// If no pieces found, allow placement
		if (!playerPieces || !Array.isArray(playerPieces)) {
			console.warn('No player pieces found, skipping path check');
			return true;
		}
		
		const king = playerPieces.find(piece => piece.type === 'king');
		
		// If no king found, allow placement
		if (!king) {
			console.warn('No king found, skipping path check');
			return true;
		}
		
		// Create a temporary board with the tetromino placed
		const tempBoard = JSON.parse(JSON.stringify(board));
		const { shape, position } = tetromino;
		const typeValue = 1; // Use any non-zero value
		
		// Add tetromino to temp board
		for (let y = 0; y < shape.length; y++) {
			for (let x = 0; x < shape[y].length; x++) {
				if (shape[y][x]) {
					const boardX = position.x + x;
					const boardY = position.y + y;
					
					// Check if within board bounds
					if (boardY >= 0 && boardY < boardHeight && boardX >= 0 && boardX < boardWidth) {
						tempBoard[boardY][boardX] = typeValue;
					}
				}
			}
		}
		
		// Check if any part of the tetromino is adjacent to an existing piece or the king
		for (let y = 0; y < shape.length; y++) {
			for (let x = 0; x < shape[y].length; x++) {
				if (shape[y][x]) {
					const boardX = position.x + x;
					const boardY = position.y + y;
					
					// Skip if out of bounds
					if (boardY < 0 || boardY >= boardHeight || boardX < 0 || boardX >= boardWidth) {
						continue;
					}
					
					// Check if adjacent to king
					if (Math.abs(boardX - king.position.x) <= 1 && Math.abs(boardY - king.position.y) <= 1) {
						return true;
					}
					
					// Check if adjacent to existing piece
					// Check left
					if (boardX > 0 && board[boardY][boardX - 1] !== 0) {
						return true;
					}
					
					// Check right
					if (boardX < boardWidth - 1 && board[boardY][boardX + 1] !== 0) {
						return true;
					}
					
					// Check up
					if (boardY > 0 && board[boardY - 1][boardX] !== 0) {
						return true;
					}
					
					// Check down
					if (boardY < boardHeight - 1 && board[boardY + 1][boardX] !== 0) {
						return true;
					}
				}
			}
		}
		
		// No valid connection found
		return false;
	} catch (error) {
		console.error('Error checking path to king:', error);
		return true;
	}
}

/**
 * Clear full rows
 * @returns {number} Number of rows cleared
 */
function clearRows() {
	let clearedRows = 0;
	
	for (let y = boardHeight - 1; y >= 0; y--) {
		let rowFull = true;
		
		for (let x = 0; x < boardWidth; x++) {
			if (board[y][x] === 0) {
				rowFull = false;
				break;
			}
		}
		
		if (rowFull) {
			// Remove the row
			board.splice(y, 1);
			
			// Add a new empty row at the top
			const newRow = [];
			for (let x = 0; x < boardWidth; x++) {
				newRow.push(0);
			}
			board.unshift(newRow);
			
			// Increment counter
			clearedRows++;
			
			// Check the same row again (since rows shifted down)
			y++;
		}
	}
	
	return clearedRows;
}

/**
 * Calculate score based on cleared rows
 * @param {number} rows - Number of rows cleared
 * @returns {number} Score
 */
function calculateScore(rows) {
	const basePoints = [0, 100, 300, 500, 800]; // 0, 1, 2, 3, 4 rows
	return basePoints[rows] * level;
}

/**
 * Add score
 * @param {number} points - Points to add
 */
function addScore(points) {
	score += points;
	
	// Update game state
	gameStateManager.updateGameData({ score });
}

/**
 * Add lines
 * @param {number} count - Number of lines to add
 */
function addLines(count) {
	lines += count;
	
	// Update level
	const newLevel = Math.floor(lines / 10) + 1;
	if (newLevel > level) {
		level = newLevel;
		
		// Update game speed
		if (dropInterval) {
			clearInterval(dropInterval);
			startDropInterval();
		}
	}
	
	// Update game state
	gameStateManager.updateGameData({ lines, level });
}

/**
 * Check for collision
 * @param {Object} tetromino - Tetromino to check
 * @returns {boolean} True if collision, false if no collision
 */
function checkCollision(tetromino) {
	const { shape, position } = tetromino;
	
	for (let y = 0; y < shape.length; y++) {
		for (let x = 0; x < shape[y].length; x++) {
			if (shape[y][x]) {
				const boardX = position.x + x;
				const boardY = position.y + y;
				
				// Check if out of bounds
				if (boardX < 0 || boardX >= boardWidth || boardY >= boardHeight) {
					return true;
				}
				
				// Check if overlapping with existing blocks (but ignore if above the board)
				if (boardY >= 0 && board[boardY][boardX] !== 0) {
					return true;
				}
			}
		}
	}
	
	return false;
}

/**
 * Reset the lock timer
 */
function resetLockTimer() {
	if (lockTimer) {
		clearTimeout(lockTimer);
	}
	
	// Check if tetromino would collide if moved down
	const newTetromino = JSON.parse(JSON.stringify(currentTetromino));
	newTetromino.position.y++;
	
	if (checkCollision(newTetromino)) {
		// Start lock timer
		lockTimer = setTimeout(() => {
			lockTetromino();
		}, lockDelay);
	}
}

/**
 * Get the current board state
 * @returns {Array} Board state
 */
export function getBoard() {
	return board;
}

/**
 * Get the current tetromino
 * @returns {Object} Current tetromino
 */
export function getCurrentTetromino() {
	return currentTetromino;
}

/**
 * Get the next tetromino
 * @returns {Object} Next tetromino
 */
export function getNextTetromino() {
	return nextTetromino;
}

/**
 * Get the held tetromino
 * @returns {Object} Held tetromino
 */
export function getHeldTetromino() {
	return heldTetromino;
}

/**
 * Get the current score
 * @returns {number} Score
 */
export function getScore() {
	return score;
}

/**
 * Get the current level
 * @returns {number} Level
 */
export function getLevel() {
	return level;
}

/**
 * Get the current lines
 * @returns {number} Lines
 */
export function getLines() {
	return lines;
}

/**
 * Pause the game
 */
export function pause() {
	stopDropInterval();
}

/**
 * Resume the game
 */
export function resume() {
	if (currentTetromino) {
		startDropInterval();
	}
}

/**
 * Reset the game
 */
export function reset() {
	// Stop intervals
	stopDropInterval();
	if (lockTimer) {
		clearTimeout(lockTimer);
		lockTimer = null;
	}
	
	// Reset state
	currentTetromino = null;
	nextTetromino = generateTetromino();
	heldTetromino = null;
	canHold = true;
	isDropping = false;
	lastMoveTime = 0;
	resetBoard();
	level = 1;
	score = 0;
	lines = 0;
}

/**
 * Clean up resources
 */
export function cleanup() {
	// Stop intervals
	stopDropInterval();
	if (lockTimer) {
		clearTimeout(lockTimer);
		lockTimer = null;
	}
	
	// Reset state
	currentTetromino = null;
	nextTetromino = null;
	heldTetromino = null;
	canHold = true;
	isDropping = false;
	lastMoveTime = 0;
	board = [];
	isInitialized = false;
} 