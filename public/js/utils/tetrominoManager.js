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

/**
 * Calculate landing position for a tetromino (ghost piece preview)
 * @param {Object} tetromino - Tetromino object
 * @param {Array} board - Game board
 * @returns {Object} Ghost position {x, y, z, rotation}
 */
export function calculateGhostPosition(tetromino, board) {
	try {
		if (!tetromino || !tetromino.position || !board) {
			return null;
		}
		
		// Clone tetromino data to avoid modifying original
		const ghost = {
			type: tetromino.type,
			shape: tetromino.shape,
			position: { ...tetromino.position },
			rotation: tetromino.rotation
		};
		
		// Set initial Y position (starting the fall)
		ghost.position.y = 10; // Start from above the board
		
		// Move the ghost tetromino down along Y axis until it would collide with another cell
		let hasCollided = false;
		let magneticAttachment = false;
		
		while (!hasCollided && !magneticAttachment && ghost.position.y >= 0) {
			// Move one step down
			ghost.position.y--;
			
			// Check for collisions with existing cells
			const collisionResult = checkCollision(ghost, board);
			
			// If we've reached Y=0, check for magnetic attachment
			if (ghost.position.y === 0) {
				const magneticResult = checkMagneticAttachment(ghost, board);
				if (magneticResult.canAttach) {
					magneticAttachment = true;
					// Move back up one step since we've gone too far down
					ghost.position.y++;
					break;
				}
			}
			
			// If collision, move back up one step
			if (collisionResult.hasCollision) {
				hasCollided = true;
				ghost.position.y++;
				break;
			}
		}
		
		// If we didn't find a valid position, return null
		if (!magneticAttachment && ghost.position.y < 0) {
			return null;
		}
		
		return ghost.position;
	} catch (error) {
		console.error('Error calculating ghost position:', error);
		return null;
	}
}

/**
 * Check if tetromino can magnetically attach to any adjacent cells
 * @param {Object} tetromino - Tetromino object
 * @param {Array} board - Game board
 * @returns {Object} Result {canAttach, attachmentPoints}
 */
export function checkMagneticAttachment(tetromino, board) {
	try {
		if (!tetromino || !board) {
			return { canAttach: false, attachmentPoints: [] };
		}
		
		// Get tetromino shape based on rotation
		const shape = getRotatedShape(tetromino.type, tetromino.rotation);
		
		// Check if any part of the tetromino is adjacent to existing cells
		const attachmentPoints = [];
		let hasPathToKing = false;
		
		// Check each block of the tetromino
		for (let z = 0; z < shape.length; z++) {
			for (let x = 0; x < shape[z].length; x++) {
				if (!shape[z][x]) continue; // Skip empty blocks
				
				// Get absolute board coordinates
				const boardX = tetromino.position.x + x;
				const boardZ = tetromino.position.z + z;
				
				// Check adjacent cells (left, right, up, down)
				const adjacentCells = [
					{ x: boardX - 1, z: boardZ }, // left
					{ x: boardX + 1, z: boardZ }, // right
					{ x: boardX, z: boardZ - 1 }, // up
					{ x: boardX, z: boardZ + 1 }  // down
				];
				
				// Check each adjacent cell
				for (const adjCell of adjacentCells) {
					// Skip out of bounds
					if (adjCell.x < 0 || adjCell.z < 0 || 
						adjCell.z >= board.length || 
						adjCell.x >= (board[adjCell.z] ? board[adjCell.z].length : 0)) {
						continue;
					}
					
					// Check if cell exists and has path to king
					const cell = board[adjCell.z][adjCell.x];
					if (cell) {
						// TODO: Implement actual path-to-king validation
						// For now, assume any existing cell has a path to king
						hasPathToKing = true;
						
						attachmentPoints.push({
							tetrominoX: x,
							tetrominoZ: z,
							boardX: boardX,
							boardZ: boardZ,
							adjacentX: adjCell.x,
							adjacentZ: adjCell.z
						});
					}
				}
			}
		}
		
		return {
			canAttach: attachmentPoints.length > 0 && hasPathToKing,
			attachmentPoints
		};
	} catch (error) {
		console.error('Error checking magnetic attachment:', error);
		return { canAttach: false, attachmentPoints: [] };
	}
}

/**
 * Apply gravity to move a tetromino down the Y-axis
 * @param {Object} tetromino - Tetromino object
 * @param {Array} board - Game board
 * @param {number} deltaTime - Time elapsed since last update in ms
 * @returns {Object} Updated tetromino and result {tetromino, landed, attached, disintegrated}
 */
export function applyGravity(tetromino, board, deltaTime) {
	try {
		if (!tetromino || !board) {
			return { tetromino, landed: false, attached: false, disintegrated: false };
		}
		
		// Clone tetromino to avoid modifying original
		const newTetromino = { ...tetromino };
		newTetromino.position = { ...tetromino.position };
		
		// Accumulate fall timer
		newTetromino.fallTime = (tetromino.fallTime || 0) + deltaTime;
		
		// Calculate fall speed based on current height
		// Starts slow at height 10, accelerates as it gets closer to the board
		const maxHeight = 10;
		const minFallInterval = 50; // ms at fastest
		const maxFallInterval = 300; // ms at slowest
		
		// Linear interpolation between max and min interval based on height
		const heightRatio = Math.min(1, Math.max(0, newTetromino.position.y / maxHeight));
		const fallInterval = minFallInterval + heightRatio * (maxFallInterval - minFallInterval);
		
		// Check if it's time to fall
		if (newTetromino.fallTime >= fallInterval) {
			// Reset fall timer
			newTetromino.fallTime = 0;
			
			// Move down one step
			newTetromino.position.y -= 1;
			
			// Handle different cases based on height
			if (newTetromino.position.y < 0) {
				// Gone below board, tetromino is lost
				return { tetromino: newTetromino, landed: true, attached: false, disintegrated: true };
			}
			
			// Check for collisions with existing cells
			const collisionResult = checkCollision(newTetromino, board);
			
			if (collisionResult.hasCollision) {
				// Collision detected, move back up
				newTetromino.position.y += 1;
				
				// Tetromino has hit another cell, causes disintegration
				return { tetromino: newTetromino, landed: true, attached: false, disintegrated: true };
			}
			
			// If at ground level (y=0), check for magnetic attachment
			if (newTetromino.position.y === 0) {
				const attachmentResult = checkMagneticAttachment(newTetromino, board);
				
				if (attachmentResult.canAttach) {
					// Tetromino can attach to board
					return { tetromino: newTetromino, landed: true, attached: true, disintegrated: false, attachmentPoints: attachmentResult.attachmentPoints };
				}
			}
		}
		
		// Still falling
		return { tetromino: newTetromino, landed: false, attached: false, disintegrated: false };
	} catch (error) {
		console.error('Error applying gravity:', error);
		// Return original tetromino in case of error
		return { tetromino, landed: false, attached: false, disintegrated: false };
	}
}

/**
 * Place tetromino on the board
 * @param {Object} tetromino - Tetromino object
 * @param {Array} board - Game board
 * @param {string} playerId - ID of the player placing the tetromino
 * @returns {Array} Updated board with tetromino placed
 */
export function placeTetromino(tetromino, board, playerId) {
	try {
		if (!tetromino || !board || !Array.isArray(board) || !playerId) {
			return board;
		}
		
		// Get tetromino shape based on rotation
		const shape = getRotatedShape(tetromino.type, tetromino.rotation);
		
		// Create a copy of the board
		const newBoard = JSON.parse(JSON.stringify(board));
		
		// Place each block of the tetromino on the board
		for (let z = 0; z < shape.length; z++) {
			for (let x = 0; x < shape[z].length; x++) {
				if (!shape[z][x]) continue; // Skip empty blocks
				
				// Get absolute board coordinates
				const boardX = tetromino.position.x + x;
				const boardZ = tetromino.position.z + z;
				
				// Skip if out of bounds
				if (boardZ < 0 || boardZ >= newBoard.length || 
					boardX < 0 || boardX >= (newBoard[boardZ] ? newBoard[boardZ].length : 0)) {
					continue;
				}
				
				// Set cell value
				newBoard[boardZ][boardX] = {
					type: 'tetromino',
					playerId,
					tetrominoType: tetromino.type,
					color: getTetrominoColor(tetromino.type),
					timestamp: Date.now()
				};
			}
		}
		
		return newBoard;
	} catch (error) {
		console.error('Error placing tetromino:', error);
		return board;
	}
}

/**
 * Get color for tetromino type
 * @param {string} type - Tetromino type
 * @returns {string} Tetromino color
 */
function getTetrominoColor(type) {
	// Return color based on tetromino type
	switch (type) {
		case 'I':
			return '#00FFFF'; // Cyan
		case 'J':
			return '#0000FF'; // Blue
		case 'L':
			return '#FF7F00'; // Orange
		case 'O':
			return '#FFFF00'; // Yellow
		case 'S':
			return '#00FF00'; // Green
		case 'T':
			return '#800080'; // Purple
		case 'Z':
			return '#FF0000'; // Red
		default:
			return '#FFFFFF'; // White (fallback)
	}
} 