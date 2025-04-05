/**
 * Board Manager Utility
 * 
 * Provides functions for managing the game board, handling rows,
 * and performing board operations.
 */

/**
 * Create an empty game board with specified dimensions
 * @param {number} width - Board width
 * @param {number} height - Board height
 * @returns {Array} Empty game board
 */
export function createEmptyBoard(width = 30, height = 30) {
	if (width <= 0 || height <= 0) {
		console.error('Invalid board dimensions:', width, height);
		return createEmptyBoard(30, 30); // Default to 30x30 if invalid
	}
	
	// Create a 2D array filled with null values
	const board = new Array(height);
	for (let z = 0; z < height; z++) {
		board[z] = new Array(width).fill(null);
	}
	
	return board;
}

/**
 * Find rows that are completed (have at least 8 cells filled)
 * @param {Array} board - Game board
 * @returns {Array} Indices of completed rows
 */
export function findCompletedRows(board) {
	if (!board || !Array.isArray(board) || board.length === 0) {
		console.error('Invalid board provided to findCompletedRows');
		return [];
	}
	
	const completedRows = [];
	
	for (let z = 0; z < board.length; z++) {
		if (!board[z]) continue;
		
		let filledCount = 0;
		for (let x = 0; x < board[z].length; x++) {
			if (board[z][x]) {
				filledCount++;
			}
		}
		
		// A row is considered complete when at least 8 cells are filled
		// This can be adjusted based on game rules
		if (filledCount >= 8) {
			completedRows.push(z);
		}
	}
	
	return completedRows;
}

/**
 * Clear completed rows and add new empty rows at the top
 * @param {Array} board - Game board
 * @param {Array} rowsToRemove - Indices of rows to remove
 * @returns {Array} Updated board
 */
export function clearRows(board, rowsToRemove) {
	if (!board || !Array.isArray(board) || board.length === 0) {
		console.error('Invalid board provided to clearRows');
		return board;
	}
	
	if (!rowsToRemove || !Array.isArray(rowsToRemove) || rowsToRemove.length === 0) {
		return board; // Nothing to remove
	}
	
	// Create a deep copy of the board to avoid mutating the original
	const newBoard = JSON.parse(JSON.stringify(board));
	const width = newBoard[0].length;
	
	// Sort row indices in descending order to avoid shifting issues
	rowsToRemove.sort((a, b) => b - a);
	
	// Remove completed rows
	for (const rowIndex of rowsToRemove) {
		if (rowIndex < 0 || rowIndex >= newBoard.length) {
			continue; // Skip invalid indices
		}
		
		newBoard.splice(rowIndex, 1);
	}
	
	// Add new empty rows at the top
	for (let i = 0; i < rowsToRemove.length; i++) {
		newBoard.unshift(new Array(width).fill(null));
	}
	
	return newBoard;
}

/**
 * Get the value of a cell at the specified coordinates
 * @param {Array} board - Game board
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate (Y in 2D representation)
 * @returns {*} Cell value or null if out of bounds
 */
export function getCell(board, x, z) {
	if (!board || !Array.isArray(board) || board.length === 0) {
		return null;
	}
	
	if (z < 0 || z >= board.length || !board[z]) {
		return null;
	}
	
	if (x < 0 || x >= board[z].length) {
		return null;
	}
	
	return board[z][x];
}

/**
 * Set the value of a cell at the specified coordinates
 * @param {Array} board - Game board
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate (Y in 2D representation)
 * @param {*} value - Value to set
 * @returns {Array} Updated board
 */
export function setCell(board, x, z, value) {
	if (!board || !Array.isArray(board) || board.length === 0) {
		console.error('Invalid board provided to setCell');
		return board;
	}
	
	if (z < 0 || z >= board.length || !board[z]) {
		console.warn(`Invalid z coordinate: ${z}`);
		return board;
	}
	
	if (x < 0 || x >= board[z].length) {
		console.warn(`Invalid x coordinate: ${x}`);
		return board;
	}
	
	// Create a deep copy to avoid mutating the original board
	const newBoard = JSON.parse(JSON.stringify(board));
	newBoard[z][x] = value;
	
	return newBoard;
}

/**
 * Check if a cell is a home zone cell
 * @param {Array} board - Game board
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @returns {boolean} Whether the cell is a home zone
 */
export function isHomeZoneCell(board, x, z) {
	const cell = getCell(board, x, z);
	
	if (!cell) {
		return false;
	}
	
	// Check if cell is object with properties
	if (typeof cell === 'object' && cell !== null) {
		// Check for home zone property or type
		return cell.isHomeZone || cell.type === 'p1' || cell.type === 'p2';
	}
	
	// Check for string values that indicate home zone
	if (typeof cell === 'string') {
		return cell === 'p1' || cell === 'p2';
	}
	
	return false;
}

/**
 * Check if there's a path from a cell to a player's king
 * Uses breadth-first search to find the path
 * @param {Array} board - Game board
 * @param {number} startX - Starting X coordinate
 * @param {number} startZ - Starting Z coordinate
 * @param {string|number} playerId - Player ID to check path for
 * @returns {boolean} Whether a path exists
 */
export function hasPathToKing(board, startX, startZ, playerId) {
	if (!board || !Array.isArray(board) || board.length === 0) {
		console.error('Invalid board provided to hasPathToKing');
		return false;
	}
	
	if (!playerId) {
		console.error('Invalid player ID provided to hasPathToKing');
		return false;
	}
	
	// Find the king position
	let kingX = -1;
	let kingZ = -1;
	
	for (let z = 0; z < board.length; z++) {
		if (!board[z]) continue;
		
		for (let x = 0; x < board[z].length; x++) {
			const cell = board[z][x];
			
			if (cell && typeof cell === 'object' && 
				cell.type === 'king' && cell.player === playerId) {
				kingX = x;
				kingZ = z;
				break;
			}
		}
		
		if (kingX !== -1) break;
	}
	
	// If king not found, return false
	if (kingX === -1 || kingZ === -1) {
		return false;
	}
	
	// BFS to find path to king
	const queue = [{ x: startX, z: startZ }];
	const visited = new Set();
	const directions = [
		{ dx: 1, dz: 0 },  // Right
		{ dx: -1, dz: 0 }, // Left
		{ dx: 0, dz: 1 },  // Down
		{ dx: 0, dz: -1 }, // Up
		{ dx: 1, dz: 1 },  // Bottom-right (diagonal)
		{ dx: -1, dz: 1 }, // Bottom-left (diagonal)
		{ dx: 1, dz: -1 }, // Top-right (diagonal)
		{ dx: -1, dz: -1 } // Top-left (diagonal)
	];
	
	// Mark start as visited
	visited.add(`${startX},${startZ}`);
	
	while (queue.length > 0) {
		const { x, z } = queue.shift();
		
		// Check if we've reached the king
		if (x === kingX && z === kingZ) {
			return true;
		}
		
		// Try all eight directions
		for (const { dx, dz } of directions) {
			const newX = x + dx;
			const newZ = z + dz;
			const key = `${newX},${newZ}`;
			
			// Skip if already visited
			if (visited.has(key)) {
				continue;
			}
			
			// Skip if out of bounds
			if (newZ < 0 || newZ >= board.length || !board[newZ]) {
				continue;
			}
			
			if (newX < 0 || newX >= board[newZ].length) {
				continue;
			}
			
			// Skip if empty cell
			if (!board[newZ][newX]) {
				continue;
			}
			
			// Mark as visited and add to queue
			visited.add(key);
			queue.push({ x: newX, z: newZ });
		}
	}
	
	// If we've exhausted all possibilities and haven't reached the king
	return false;
} 