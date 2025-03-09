/**
 * Tetromino Manager Module
 * 
 * Handles tetromino-related functionality such as spawning, moving,
 * rotating, and locking tetromino pieces.
 */

import { v4 as uuidv4 } from '../utils/uuid.js';
import * as GameState from './gameState.js';
import * as Constants from './constants.js';
import { addSponsorToTetromino } from '../../utils/sponsors.js';

/**
 * Spawn a new falling tetromino piece
 * @param {string} type - The type of tetromino (I, O, T, S, Z, J, L)
 * @param {Object} options - Additional options
 * @returns {Object} The spawned tetromino
 */
export async function spawnTetromino(type = null, options = {}) {
	const gameState = GameState.getGameState();
	
	// If no type is specified, choose a random one
	if (!type) {
		const types = Object.keys(Constants.TETROMINOES);
		type = types[Math.floor(Math.random() * types.length)];
	}
	
	const tetromino = Constants.TETROMINOES[type];
	
	// Create the falling piece
	let fallingPiece = {
		id: uuidv4(),
		type,
		blocks: JSON.parse(JSON.stringify(tetromino.blocks)),
		color: tetromino.color,
		x: Math.floor(Constants.INITIAL_BOARD_WIDTH / 2) - 1,
		y: 0,
		z: Constants.START_Z,
		rotation: 0,
		...options
	};
	
	// Add sponsor based on bidding system
	fallingPiece = await addSponsorToTetromino(fallingPiece);
	
	// Set the falling piece in the game state
	gameState.fallingPiece = fallingPiece;
	
	return fallingPiece;
}

/**
 * Move the current falling tetromino
 * @param {string} direction - The direction to move ('left', 'right', 'down')
 * @returns {boolean} Whether the move was successful
 */
export function moveTetromino(direction) {
	const gameState = GameState.getGameState();
	const { fallingPiece } = gameState;
	
	if (!fallingPiece) {
		return false;
	}
	
	let dx = 0;
	let dy = 0;
	
	switch (direction) {
		case 'left':
			dx = -1;
			break;
		case 'right':
			dx = 1;
			break;
		case 'down':
			dy = 1;
			break;
		default:
			return false;
	}
	
	// Check if the move is valid
	if (isValidMove(fallingPiece.x + dx, fallingPiece.y + dy, fallingPiece.blocks)) {
		fallingPiece.x += dx;
		fallingPiece.y += dy;
		return true;
	}
	
	// If moving down and the move is invalid, lock the piece
	if (direction === 'down') {
		lockTetromino();
	}
	
	return false;
}

/**
 * Rotate the current falling tetromino
 * @param {string} direction - The direction to rotate ('clockwise', 'counterclockwise')
 * @returns {boolean} Whether the rotation was successful
 */
export function rotateTetromino(direction = 'clockwise') {
	const gameState = GameState.getGameState();
	const { fallingPiece } = gameState;
	
	if (!fallingPiece) {
		return false;
	}
	
	// Skip rotation for O tetromino
	if (fallingPiece.type === 'O') {
		return true;
	}
	
	// Create a copy of the blocks
	const blocks = JSON.parse(JSON.stringify(fallingPiece.blocks));
	
	// Rotate the blocks
	const rotatedBlocks = rotateBlocks(blocks, direction);
	
	// Check if the rotation is valid
	if (isValidMove(fallingPiece.x, fallingPiece.y, rotatedBlocks)) {
		fallingPiece.blocks = rotatedBlocks;
		fallingPiece.rotation = (fallingPiece.rotation + (direction === 'clockwise' ? 1 : 3)) % 4;
		return true;
	}
	
	// Try wall kicks
	const kicks = [
		{ dx: 1, dy: 0 },  // Right
		{ dx: -1, dy: 0 }, // Left
		{ dx: 0, dy: -1 }, // Up
		{ dx: 2, dy: 0 },  // 2 Right
		{ dx: -2, dy: 0 }, // 2 Left
	];
	
	for (const kick of kicks) {
		if (isValidMove(fallingPiece.x + kick.dx, fallingPiece.y + kick.dy, rotatedBlocks)) {
			fallingPiece.x += kick.dx;
			fallingPiece.y += kick.dy;
			fallingPiece.blocks = rotatedBlocks;
			fallingPiece.rotation = (fallingPiece.rotation + (direction === 'clockwise' ? 1 : 3)) % 4;
			return true;
		}
	}
	
	return false;
}

/**
 * Helper function to rotate blocks
 * @param {Array} blocks - The blocks to rotate
 * @param {string} direction - The direction to rotate
 * @returns {Array} The rotated blocks
 */
function rotateBlocks(blocks, direction) {
	const rotatedBlocks = [];
	const size = Math.max(...blocks.map(b => Math.max(b.x, b.y))) + 1;
	
	for (const block of blocks) {
		let newX, newY;
		
		if (direction === 'clockwise') {
			newX = size - 1 - block.y;
			newY = block.x;
		} else {
			newX = block.y;
			newY = size - 1 - block.x;
		}
		
		rotatedBlocks.push({ x: newX, y: newY });
	}
	
	return rotatedBlocks;
}

/**
 * Check if a move is valid
 * @param {number} x - The x position
 * @param {number} y - The y position
 * @param {Array} blocks - The blocks to check
 * @returns {boolean} Whether the move is valid
 */
function isValidMove(x, y, blocks) {
	const gameState = GameState.getGameState();
	
	for (const block of blocks) {
		const blockX = x + block.x;
		const blockY = y + block.y;
		
		// Check if the block is out of bounds
		if (!GameState.isInBounds(blockX, blockY)) {
			return false;
		}
		
		// Check if the block collides with another block
		const key = `${blockX},${blockY}`;
		if (gameState.board[key] && gameState.board[key].block) {
			return false;
		}
	}
	
	return true;
}

/**
 * Lock the current falling tetromino in place
 * @returns {Object} The locked tetromino
 */
export function lockTetromino() {
	const gameState = GameState.getGameState();
	const { fallingPiece } = gameState;
	
	if (!fallingPiece) {
		return null;
	}
	
	// Add the blocks to the board
	for (const block of fallingPiece.blocks) {
		const blockX = fallingPiece.x + block.x;
		const blockY = fallingPiece.y + block.y;
		const key = `${blockX},${blockY}`;
		
		// Create the cell if it doesn't exist
		if (!gameState.board[key]) {
			gameState.board[key] = { x: blockX, y: blockY };
		}
		
		// Add the block to the cell
		gameState.board[key].block = {
			color: fallingPiece.color,
			type: fallingPiece.type,
			sponsor: fallingPiece.sponsor
		};
	}
	
	// Clear any full rows
	const clearedRows = GameState.clearFullRows();
	
	// Spawn a new falling piece
	const newPiece = spawnTetromino();
	
	// Return the result
	return {
		lockedPiece: fallingPiece,
		clearedRows,
		newPiece
	};
}

/**
 * Hard drop the current falling tetromino
 * @returns {Object} The result of the hard drop
 */
export function hardDropTetromino() {
	const gameState = GameState.getGameState();
	const { fallingPiece } = gameState;
	
	if (!fallingPiece) {
		return null;
	}
	
	// Move the piece down until it can't move anymore
	let dropDistance = 0;
	while (isValidMove(fallingPiece.x, fallingPiece.y + 1, fallingPiece.blocks)) {
		fallingPiece.y += 1;
		dropDistance += 1;
	}
	
	// Lock the piece
	const result = lockTetromino();
	
	return {
		...result,
		dropDistance
	};
}

/**
 * Get the ghost piece (preview of where the tetromino will land)
 * @returns {Object|null} The ghost piece or null if no falling piece
 */
export function getGhostPiece() {
	const gameState = GameState.getGameState();
	const { fallingPiece } = gameState;
	
	if (!fallingPiece) {
		return null;
	}
	
	// Create a copy of the falling piece
	const ghostPiece = JSON.parse(JSON.stringify(fallingPiece));
	
	// Move the ghost piece down until it can't move anymore
	while (isValidMove(ghostPiece.x, ghostPiece.y + 1, ghostPiece.blocks)) {
		ghostPiece.y += 1;
	}
	
	return ghostPiece;
}

/**
 * Check if the game is over (tetromino can't spawn)
 * @returns {boolean} Whether the game is over
 */
export function isGameOver() {
	const gameState = GameState.getGameState();
	const { fallingPiece } = gameState;
	
	// If there's a falling piece and it's at the top of the board
	if (fallingPiece && fallingPiece.y === 0) {
		// Check if it can move down
		return !isValidMove(fallingPiece.x, fallingPiece.y + 1, fallingPiece.blocks);
	}
	
	return false;
}

export default {
	spawnTetromino,
	moveTetromino,
	rotateTetromino,
	lockTetromino,
	hardDropTetromino,
	getGhostPiece,
	isGameOver
}; 