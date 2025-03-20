/**
 * Tetromino Manager
 * 
 * Handles tetromino creation, movement, and collision detection.
 */

import { GAME_CONSTANTS, TETROMINO_TYPES } from './constants.js';
import * as ChessPieceManager from './chessPieceManager.js';
import * as GameManager from './gameManager.js';
import * as PlayerManager from './playerManager.js';
import { generateId } from '../utils/helpers.js';

// Tetromino bag
let bag = [];

// Current falling piece
let fallingPiece = null;

// Ghost piece (preview of where the piece will land)
let ghostPiece = null;

// Next pieces
let nextPieces = [];

// Held piece
let heldPiece = null;
let hasHeldThisTurn = false;

// Lock delay
const LOCK_DELAY = GAME_CONSTANTS.LOCK_DELAY || 500; // ms
let lockDelayTimer = 0;
let lastMoveTime = 0;

// Drop speed
let dropSpeed = GAME_CONSTANTS.SPEED.NORMAL;
let dropCounter = 0;

// Lines per level
const LINES_PER_LEVEL = GAME_CONSTANTS.LINES_PER_LEVEL || 10;

/**
 * Initialize the tetromino manager
 * @returns {Promise<void>}
 */
export async function init() {
	try {
		console.log('Initializing tetromino manager');
		
		// Reset state
		bag = [];
		fallingPiece = null;
		ghostPiece = null;
		nextPieces = [];
		heldPiece = null;
		hasHeldThisTurn = false;
		lockDelayTimer = 0;
		lastMoveTime = 0;
		dropSpeed = GAME_CONSTANTS.SPEED.NORMAL;
		dropCounter = 0;
		
		// Fill the bag
		fillBag();
		
		// Fill next pieces
		fillNextPieces();
		
		// Create first piece
		createNewPiece();
		
		console.log('Tetromino manager initialized');
	} catch (error) {
		console.error('Error initializing tetromino manager:', error);
		throw error;
	}
}

/**
 * Update tetromino state
 * @param {number} deltaTime - Time since last update in ms
 */
export function update(deltaTime) {
	try {
		if (!fallingPiece) {
			createNewPiece();
			return;
		}
		
		// Update drop counter
		dropCounter += deltaTime;
		
		// Calculate drop speed based on level
		const currentDropSpeed = calculateDropSpeed();
		
		// Move piece down if enough time has passed
		if (dropCounter >= currentDropSpeed) {
			dropCounter = 0;
			
			// Try to move piece down
			if (!movePieceDown()) {
				// If piece can't move down, start lock delay
				lockDelayTimer += deltaTime;
				
				// Lock piece if lock delay has passed
				if (lockDelayTimer >= LOCK_DELAY) {
					lockPiece();
					lockDelayTimer = 0;
				}
			} else {
				// Reset lock delay if piece moved down
				lockDelayTimer = 0;
			}
		}
		
		// Update ghost piece
		updateGhostPiece();
	} catch (error) {
		console.error('Error updating tetromino:', error);
	}
}

/**
 * Calculate drop speed based on level
 * @returns {number} Drop speed in ms
 */
function calculateDropSpeed() {
	try {
		// Get current level
		const level = GameManager.getLevel();
		
		// Calculate drop speed
		// Formula: baseSpeed * (0.8 - ((level - 1) * 0.007))^(level - 1)
		const baseSpeed = GAME_CONSTANTS.SPEED.NORMAL;
		const speedFactor = Math.pow(0.8 - ((level - 1) * 0.007), level - 1);
		
		return Math.max(baseSpeed * speedFactor, GAME_CONSTANTS.SPEED.MAX);
	} catch (error) {
		console.error('Error calculating drop speed:', error);
		return GAME_CONSTANTS.SPEED.NORMAL;
	}
}

/**
 * Creates a new tetromino piece
 * @returns {Object} The new piece
 */
function createNewPiece() {
	try {
		// Reset held piece flag
		hasHeldThisTurn = false;
		
		// Get next piece from queue
		const nextPiece = nextPieces.shift();
		
		// Fill next pieces if needed
		if (!nextPiece || nextPieces.length < 3) {
			fillNextPieces();
		}
		
		// If still no next piece, use a default piece (I)
		const pieceType = nextPiece || 'I';
		
		// Check if TETROMINO_TYPES is defined and has the piece type
		if (!TETROMINO_TYPES || !TETROMINO_TYPES[pieceType]) {
			console.error('TETROMINO_TYPES is not defined or does not have the piece type:', pieceType);
			
			// Create a default piece
			fallingPiece = {
				id: generateId(),
				type: 'I',
				shape: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
				color: 0x00FFFF,
				x: Math.floor(GAME_CONSTANTS.BOARD_WIDTH / 2) - 2,
				y: 0,
				rotation: 0
			};
			
			// Update ghost piece
			updateGhostPiece();
			
			return fallingPiece;
		}
		
		// Create new piece
		fallingPiece = {
			id: generateId(),
			type: pieceType,
			shape: TETROMINO_TYPES[pieceType].shape,
			color: TETROMINO_TYPES[pieceType].color,
			x: Math.floor(GAME_CONSTANTS.BOARD_WIDTH / 2) - Math.floor(TETROMINO_TYPES[pieceType].shape[0].length / 2),
			y: 0,
			rotation: 0
		};
		
		// Check if new piece collides with existing pieces
		if (isCollision(fallingPiece.shape, fallingPiece.x, fallingPiece.y)) {
			// Game over
			GameManager.endGame();
			return null;
		}
		
		// Update ghost piece
		updateGhostPiece();
		
		return fallingPiece;
	} catch (error) {
		console.error('Error creating new piece:', error);
		
		// Create a default piece as fallback
		fallingPiece = {
			id: generateId(),
			type: 'I',
			shape: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
			color: 0x00FFFF,
			x: Math.floor(GAME_CONSTANTS.BOARD_WIDTH / 2) - 2,
			y: 0,
			rotation: 0
		};
		
		// Update ghost piece
		updateGhostPiece();
		
		return fallingPiece;
	}
}

/**
 * Fill the next pieces queue
 */
function fillNextPieces() {
	try {
		// Fill bag if empty
		if (bag.length === 0) {
			fillBag();
		}
		
		// If bag is still empty after trying to fill it, create a default bag
		if (bag.length === 0) {
			console.warn('Failed to fill bag, using default pieces');
			bag = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
		}
		
		// Add pieces to next pieces queue
		while (nextPieces.length < 3) {
			// Get next piece from bag
			const nextPiece = bag.shift();
			
			// Add to next pieces
			if (nextPiece) {
				nextPieces.push(nextPiece);
			}
			
			// Fill bag if empty
			if (bag.length === 0) {
				fillBag();
			}
		}
		
		console.log('Next pieces queue filled:', nextPieces);
	} catch (error) {
		console.error('Error filling next pieces:', error);
		
		// Create default next pieces as fallback
		nextPieces = ['I', 'J', 'L'];
	}
}

/**
 * Fill the tetromino bag with all piece types in random order
 */
function fillBag() {
	try {
		// Check if TETROMINO_TYPES is defined
		if (!TETROMINO_TYPES) {
			console.error('TETROMINO_TYPES is not defined');
			
			// Use default piece types
			bag = shuffleArray(['I', 'J', 'L', 'O', 'S', 'T', 'Z']);
			return;
		}
		
		// Create array with all piece types
		const pieceTypes = Object.keys(TETROMINO_TYPES);
		
		// If no piece types found, use default piece types
		if (!pieceTypes || pieceTypes.length === 0) {
			console.warn('No piece types found in TETROMINO_TYPES, using default piece types');
			bag = shuffleArray(['I', 'J', 'L', 'O', 'S', 'T', 'Z']);
			return;
		}
		
		// Shuffle array
		bag = shuffleArray([...pieceTypes]);
		
		console.log('Bag filled with piece types:', bag);
	} catch (error) {
		console.error('Error filling bag:', error);
		
		// Use default piece types as fallback
		bag = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
	}
}

/**
 * Shuffle an array using Fisher-Yates algorithm
 * @param {Array} array - Array to shuffle
 * @returns {Array} Shuffled array
 */
function shuffleArray(array) {
	for (let i = array.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[array[i], array[j]] = [array[j], array[i]];
	}
	return array;
}

/**
 * Update ghost piece position
 */
function updateGhostPiece() {
	try {
		if (!fallingPiece) {
			ghostPiece = null;
			return;
		}
		
		// Create ghost piece as a copy of falling piece
		ghostPiece = {
			...fallingPiece,
			isGhost: true
		};
		
		// Move ghost piece down until collision
		let ghostY = fallingPiece.y;
		
		// Keep moving down until collision
		while (!isCollision(ghostPiece.shape, ghostPiece.x, ghostY + 1)) {
			ghostY++;
		}
		
		// Set ghost piece y position
		ghostPiece.y = ghostY;
		
		// If ghost is at same position as falling piece, don't show it
		if (ghostPiece.y === fallingPiece.y) {
			ghostPiece = null;
		}
		
		// Tell the renderer to update the ghost piece visualization
		// This will improve player feedback about where the piece will land
		if (typeof gameRenderer !== 'undefined' && gameRenderer.updateGhostPiece) {
			gameRenderer.updateGhostPiece(fallingPiece, ghostPiece);
		}
	} catch (error) {
		console.error('Error updating ghost piece:', error);
		ghostPiece = null;
	}
}

/**
 * Move the falling piece left
 * @returns {boolean} Whether the piece was moved
 */
export function movePieceLeft() {
	try {
		if (!fallingPiece) return false;
		
		// Check if piece can move left
		if (!isCollision(fallingPiece.shape, fallingPiece.x - 1, fallingPiece.y)) {
			// Move piece left
			fallingPiece.x--;
			
			// Reset lock delay
			lockDelayTimer = 0;
			
			// Update ghost piece
			updateGhostPiece();
			
			// Update last move time
			lastMoveTime = Date.now();
			
			return true;
		}
		
		return false;
	} catch (error) {
		console.error('Error moving piece left:', error);
		return false;
	}
}

/**
 * Move the falling piece right
 * @returns {boolean} Whether the piece was moved
 */
export function movePieceRight() {
	try {
		if (!fallingPiece) return false;
		
		// Check if piece can move right
		if (!isCollision(fallingPiece.shape, fallingPiece.x + 1, fallingPiece.y)) {
			// Move piece right
			fallingPiece.x++;
			
			// Reset lock delay
			lockDelayTimer = 0;
			
			// Update ghost piece
			updateGhostPiece();
			
			// Update last move time
			lastMoveTime = Date.now();
			
			return true;
		}
		
		return false;
	} catch (error) {
		console.error('Error moving piece right:', error);
		return false;
	}
}

/**
 * Get all pieces (falling, ghost, next, held)
 * @returns {Object} All pieces
 */
export function getAllPieces() {
	return { fallingPiece, ghostPiece, nextPieces, heldPiece };
}

/**
 * Get next pieces
 * @returns {Array} Next pieces
 */
export function getNextPieces() {
	return nextPieces;
}

/**
 * Get current piece
 * @returns {Object} Current piece
 */
export function getCurrentPiece() {
	return fallingPiece;
}

/**
 * Check if tetromino is adjacent to existing cells
 * (This implements the magnetic edge attachment as per game rules)
 * @param {Array} shape - Tetromino shape
 * @param {number} x - X position
 * @param {number} y - Y position
 * @returns {Object|null} Information about adjacent cells or null if none
 */
function checkMagneticAttachment(shape, x, y) {
	try {
		// Adjacent directions to check (right, left, down, up)
		const directions = [
			{ dx: 1, dy: 0 },  // right
			{ dx: -1, dy: 0 }, // left
			{ dx: 0, dy: 1 },  // down
			{ dx: 0, dy: -1 }  // up
		];
		
		// Check each cell in the tetromino
		for (let row = 0; row < shape.length; row++) {
			for (let col = 0; col < shape[row].length; col++) {
				// If this cell is filled
				if (shape[row][col]) {
					const cellX = x + col;
					const cellY = y + row;
					
					// Check each direction
					for (const dir of directions) {
						const adjX = cellX + dir.dx;
						const adjY = cellY + dir.dy;
						
						// Check if the adjacent cell is within bounds
						if (adjX >= 0 && adjX < GAME_CONSTANTS.BOARD_WIDTH && 
							adjY >= 0 && adjY < GAME_CONSTANTS.BOARD_HEIGHT) {
							
							// Check if there's a cell at this position
							if (gameBoard && gameBoard[adjY] && gameBoard[adjY][adjX]) {
								// We found an adjacent cell!
								return { 
									x: cellX, 
									y: cellY, 
									adjacentX: adjX, 
									adjacentY: adjY,
									direction: dir
								};
							}
						}
					}
				}
			}
		}
		
		// No adjacent cells found
		return null;
	} catch (error) {
		console.error('Error checking magnetic attachment:', error);
		return null;
	}
}

/**
 * Visualize magnetic effect
 * @param {Object} attachment - Attachment information
 */
function visualizeMagneticEffect(attachment) {
	try {
		if (!attachment) return;
		
		// Create magnetic effect
		if (typeof gameRenderer !== 'undefined' && gameRenderer.createMagneticEffect) {
			gameRenderer.createMagneticEffect(attachment);
		}
	} catch (error) {
		console.error('Error visualizing magnetic effect:', error);
	}
}

/**
 * Move the falling piece down
 * @returns {boolean} Whether the piece was moved
 */
export function movePieceDown() {
	try {
		if (!fallingPiece) return false;
		
		// Check if the piece can move down
		if (isCollision(fallingPiece.shape, fallingPiece.x, fallingPiece.y + 1)) {
			// Check for magnetic attachment when at Y=0 as per game rules
			if (fallingPiece.y === 0) {
				const attachment = checkMagneticAttachment(fallingPiece.shape, fallingPiece.x, fallingPiece.y);
				if (attachment) {
					// Visualize magnetic effect
					visualizeMagneticEffect(attachment);
					
					// The piece is attachable, so lock it
					lockPiece();
					
					// Create attachment animation
					if (typeof gameRenderer !== 'undefined' && gameRenderer.createTetrominoAttachAnimation) {
						gameRenderer.createTetrominoAttachAnimation(fallingPiece);
					}
					
					return false;
				} else {
					// No attachment found, piece continues falling through and disintegrates
					if (typeof gameRenderer !== 'undefined' && gameRenderer.createTetrominoDisintegrationAnimation) {
						gameRenderer.createTetrominoDisintegrationAnimation(fallingPiece);
					}
					
					// Create a new piece
					createNewPiece();
					return false;
				}
			}
			return false;
		}
		
		// Move the piece down
		fallingPiece.y++;
		
		// Check for magnetic attachment at any Y position
		const attachment = checkMagneticAttachment(fallingPiece.shape, fallingPiece.x, fallingPiece.y);
		if (attachment) {
			// Visualize the potential attachment
			visualizeMagneticEffect(attachment);
		}
		
		return true;
	} catch (error) {
		console.error('Error moving piece down:', error);
		return false;
	}
}

/**
 * Soft drop the falling piece
 * @returns {boolean} Whether the piece was moved
 */
export function softDrop() {
	try {
		if (!fallingPiece) return false;
		
		// Move piece down
		const moved = movePieceDown();
		
		// Add score if piece moved
		if (moved) {
			GameManager.addScore(GAME_CONSTANTS.SCORING.SOFT_DROP, 'soft_drop');
		}
		
		return moved;
	} catch (error) {
		console.error('Error soft dropping piece:', error);
		return false;
	}
}

/**
 * Hard drop the falling piece
 * @returns {boolean} Whether the piece was locked
 */
export function hardDrop() {
	try {
		if (!fallingPiece) return false;
		
		// Calculate distance to drop
		let distance = 0;
		
		// Move piece down until it collides
		while (!isCollision(fallingPiece.shape, fallingPiece.x, fallingPiece.y + 1)) {
			fallingPiece.y++;
			distance++;
		}
		
		// Add score based on distance
		GameManager.addScore(distance * GAME_CONSTANTS.SCORING.HARD_DROP, 'hard_drop');
		
		// Lock piece
		return lockPiece();
	} catch (error) {
		console.error('Error hard dropping piece:', error);
		return false;
	}
}

/**
 * Rotate the falling piece
 * @param {boolean} clockwise - Whether to rotate clockwise
 * @returns {boolean} Whether the piece was rotated
 */
export function rotatePiece(clockwise = true) {
	try {
		if (!fallingPiece) return false;
		
		// Get current rotation
		const currentRotation = fallingPiece.rotation;
		
		// Calculate new rotation
		const newRotation = clockwise
			? (currentRotation + 1) % 4
			: (currentRotation + 3) % 4;
		
		// Rotate shape
		const newShape = rotateShape(fallingPiece.shape, clockwise);
		
		// Try to place the rotated piece
		// First try without wall kicks
		if (!isCollision(newShape, fallingPiece.x, fallingPiece.y)) {
			// Update piece
			fallingPiece.shape = newShape;
			fallingPiece.rotation = newRotation;
			
			// Reset lock delay
			lockDelayTimer = 0;
			
			// Update ghost piece
			updateGhostPiece();
			
			return true;
		}
		
		// Try with wall kicks
		const wallKicks = getWallKicks(fallingPiece.type, currentRotation, clockwise);
		
		for (const [dx, dy] of wallKicks) {
			if (!isCollision(newShape, fallingPiece.x + dx, fallingPiece.y + dy)) {
				// Update piece
				fallingPiece.shape = newShape;
				fallingPiece.rotation = newRotation;
				fallingPiece.x += dx;
				fallingPiece.y += dy;
				
				// Reset lock delay
				lockDelayTimer = 0;
				
				// Update ghost piece
				updateGhostPiece();
				
				return true;
			}
		}
		
		return false;
	} catch (error) {
		console.error('Error rotating piece:', error);
		return false;
	}
}

/**
 * Rotate a tetromino shape
 * @param {Array} shape - Shape to rotate
 * @param {boolean} clockwise - Whether to rotate clockwise
 * @returns {Array} Rotated shape
 */
function rotateShape(shape, clockwise = true) {
	try {
		const rows = shape.length;
		const cols = shape[0].length;
		const newShape = Array(cols).fill().map(() => Array(rows).fill(0));
		
		for (let y = 0; y < rows; y++) {
			for (let x = 0; x < cols; x++) {
				if (clockwise) {
					newShape[x][rows - 1 - y] = shape[y][x];
				} else {
					newShape[cols - 1 - x][y] = shape[y][x];
				}
			}
		}
		
		return newShape;
	} catch (error) {
		console.error('Error rotating shape:', error);
		return shape;
	}
}

/**
 * Get wall kicks for a rotation
 * @param {string} type - Piece type
 * @param {number} rotation - Current rotation
 * @param {boolean} clockwise - Whether rotation is clockwise
 * @returns {Array} Wall kicks
 */
function getWallKicks(type, rotation, clockwise) {
	// Default wall kicks
	const defaultKicks = [
		[0, 0],
		[-1, 0],
		[1, 0],
		[0, -1],
		[-1, -1],
		[1, -1]
	];
	
	// Return default kicks
	return defaultKicks;
}

/**
 * Hold the current piece
 * @returns {boolean} Whether the piece was held
 */
export function holdPiece() {
	try {
		if (!fallingPiece) return false;
		
		// Check if piece has already been held this turn
		if (hasHeldThisTurn) return false;
		
		// Set held flag
		hasHeldThisTurn = true;
		
		// Store current piece type
		const currentType = fallingPiece.type;
		
		// Check if there's already a held piece
		if (heldPiece) {
			// Swap pieces
			const tempType = heldPiece;
			heldPiece = currentType;
			
			// Create new piece with held piece type
			fallingPiece = {
				id: generateId(),
				type: tempType,
				shape: TETROMINO_TYPES[tempType].shape,
				color: TETROMINO_TYPES[tempType].color,
				x: Math.floor(GAME_CONSTANTS.BOARD_WIDTH / 2) - Math.floor(TETROMINO_TYPES[tempType].shape[0].length / 2),
				y: 0,
				rotation: 0
			};
		} else {
			// Store current piece
			heldPiece = currentType;
			
			// Create new piece
			createNewPiece();
		}
		
		// Update ghost piece
		updateGhostPiece();
		
		return true;
	} catch (error) {
		console.error('Error holding piece:', error);
		return false;
	}
}

/**
 * Locks the current falling piece into the board
 * @returns {boolean} Whether the piece was locked
 */
function lockPiece() {
	try {
		if (!fallingPiece) return false;
		
		// Add piece to board
		const board = ChessPieceManager.getBoard();
		const shape = fallingPiece.shape;
		const color = fallingPiece.color;
		
		for (let y = 0; y < shape.length; y++) {
			for (let x = 0; x < shape[y].length; x++) {
				if (shape[y][x]) {
					const boardX = fallingPiece.x + x;
					const boardY = fallingPiece.y + y;
					
					// Ensure board is large enough (rows)
					while (boardY >= board.length) {
						board.push(Array(GAME_CONSTANTS.BOARD_WIDTH).fill(null));
					}
					
					// Ensure the row has enough columns
					if (!board[boardY]) {
						board[boardY] = Array(GAME_CONSTANTS.BOARD_WIDTH).fill(null);
					}
					
					// Ensure the specific column exists
					if (boardX >= board[boardY].length) {
						// Extend the row to accommodate the piece
						const extension = Array(boardX - board[boardY].length + 1).fill(null);
						board[boardY] = [...board[boardY], ...extension];
					}
					
					// Add tetromino block to board
					board[boardY][boardX] = {
						id: `${fallingPiece.id}-${x}-${y}`,
						type: 'tetromino',
						color
					};
				}
			}
		}
		
		// Check for cleared lines
		const clearedLines = checkClearedLines();
		
		// Update score
		updateScore(clearedLines);
		
		// Create new piece
		createNewPiece();
		
		return true;
	} catch (error) {
		console.error('Error locking piece:', error);
		return false;
	}
}

/**
 * Check for cleared lines
 * @returns {number} Number of cleared lines
 */
function checkClearedLines() {
	try {
		const board = ChessPieceManager.getBoard();
		let clearedLines = 0;
		
		// Check each row
		for (let y = 0; y < board.length; y++) {
			// Skip if row doesn't exist
			if (!board[y]) continue;
			
			// Check if row is full
			const isFull = board[y].every(cell => cell !== null);
			
			if (isFull) {
				// Remove row
				board.splice(y, 1);
				
				// Add empty row at top
				board.unshift(Array(GAME_CONSTANTS.BOARD_WIDTH).fill(null));
				
				// Increment cleared lines
				clearedLines++;
				
				// Decrement y to check the same row again (since rows shifted down)
				y--;
			}
		}
		
		return clearedLines;
	} catch (error) {
		console.error('Error checking cleared lines:', error);
		return 0;
	}
}

/**
 * Update score based on cleared lines
 * @param {number} clearedLines - Number of cleared lines
 */
function updateScore(clearedLines) {
	try {
		if (clearedLines === 0) return;
		
		// Get current level
		const level = GameManager.getLevel();
		
		// Calculate score
		let score = 0;
		
		switch (clearedLines) {
			case 1:
				score = GAME_CONSTANTS.SCORING.SINGLE * level;
				break;
			case 2:
				score = GAME_CONSTANTS.SCORING.DOUBLE * level;
				break;
			case 3:
				score = GAME_CONSTANTS.SCORING.TRIPLE * level;
				break;
			case 4:
				score = GAME_CONSTANTS.SCORING.TETRIS * level;
				break;
			default:
				score = clearedLines * GAME_CONSTANTS.SCORING.SINGLE * level;
		}
		
		// Add score
		GameManager.addScore(score, `clear_${clearedLines}`);
		
		// Add lines
		GameManager.addLines(clearedLines);
	} catch (error) {
		console.error('Error updating score:', error);
	}
}

/**
 * Check if a piece collides with the board or boundaries
 * @param {Array} shape - Piece shape
 * @param {number} x - X position
 * @param {number} y - Y position
 * @returns {boolean} Whether the piece collides
 */
function isCollision(shape, x, y) {
	try {
		const board = ChessPieceManager.getBoard();
		
		// Check each cell of the piece
		for (let pieceY = 0; pieceY < shape.length; pieceY++) {
			for (let pieceX = 0; pieceX < shape[pieceY].length; pieceX++) {
				// Skip empty cells
				if (!shape[pieceY][pieceX]) continue;
				
				// Calculate board position
				const boardX = x + pieceX;
				const boardY = y + pieceY;
				
				// Check boundaries
				if (boardX < 0 || boardX >= GAME_CONSTANTS.BOARD_WIDTH || boardY < 0) {
					return true;
				}
				
				// Check if position is outside the board (vertically)
				if (boardY >= board.length) {
					continue; // Allow piece to extend beyond current board height
				}
				
				// Check if position is occupied
				if (board[boardY] && board[boardY][boardX]) {
					return true;
				}
			}
		}
		
		return false;
	} catch (error) {
		console.error('Error checking collision:', error);
		return true; // Assume collision on error
	}
}

/**
 * Get the falling piece
 * @returns {Object|null} - The falling piece or null if none
 */
export function getFallingPiece() {
	return fallingPiece;
}

/**
 * Get the ghost piece
 * @returns {Object|null} - The ghost piece or null if none
 */
export function getGhostPiece() {
	return ghostPiece;
}

/**
 * Get the next piece type
 * @returns {string|null} - The next piece type or null if none
 */
export function getNextPiece() {
	return nextPieces.length > 0 ? nextPieces[0] : null;
}

/**
 * Get the held piece type
 * @returns {string|null} - The held piece type or null if none
 */
export function getHeldPiece() {
	return heldPiece;
}

/**
 * Reset the tetromino manager
 */
export function reset() {
	init();
} 