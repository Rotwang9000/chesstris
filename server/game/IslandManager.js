/**
 * IslandManager.js - Handles island detection and connectivity
 * An island is a group of connected cells belonging to a single player
 */

const { log } = require('./GameUtilities');

class IslandManager {
	constructor() {
		// No properties needed for initialization
	}
	
	/**
	 * Check if there is a path from a cell to the player's king
	 * @param {Object} game - The game object
	 * @param {number} startX - Starting X coordinate
	 * @param {number} startZ - Starting Z coordinate
	 * @param {string} playerId - The player's ID
	 * @returns {boolean} True if there is a path
	 */
	hasPathToKing(game, startX, startZ, playerId) {
		// Get the king's position for this player
		let kingX = -1;
		let kingZ = -1;
		let kingFound = false;
		
		// Find the king in chess pieces
		for (const piece of game.chessPieces) {
			if (piece.player === playerId && piece.type === 'king') {
				kingX = piece.x;
				kingZ = piece.z;
				kingFound = true;
				break;
			}
		}
		
		if (!kingFound) {
			// King might not exist yet or might have been captured
			return false;
		}
		
		// Breadth-first search (BFS) to find a path to the king
		const queue = [{ x: startX, z: startZ }];
		const visited = new Set();
		const boardWidth = game.board[0].length;
		const boardHeight = game.board.length;
		
		// Mark the starting point as visited
		visited.add(`${startX},${startZ}`);
		
		while (queue.length > 0) {
			const { x, z } = queue.shift();
			
			// Check if we've reached the king
			if (x === kingX && z === kingZ) {
				return true;
			}
			
			// Check adjacent cells (in XZ plane)
			const adjacentCells = [
				{ x: x - 1, z },  // left
				{ x: x + 1, z },  // right
				{ x, z: z - 1 },  // up
				{ x, z: z + 1 }   // down
			];
			
			for (const cell of adjacentCells) {
				// Skip if out of bounds
				if (cell.x < 0 || cell.x >= boardWidth || cell.z < 0 || cell.z >= boardHeight) {
					continue;
				}
				
				// Skip if already visited
				const cellKey = `${cell.x},${cell.z}`;
				if (visited.has(cellKey)) {
					continue;
				}
				
				// Check if the cell belongs to the player
				const boardCell = game.board[cell.z][cell.x];
				if (boardCell && boardCell.player === playerId) {
					visited.add(cellKey);
					queue.push(cell);
				}
			}
		}
		
		// No path found
		return false;
	}
	
	/**
	 * Detect islands in the game board after a tetromino is placed
	 * @param {Object} game - The game object
	 * @returns {Array} Array of islands
	 */
	detectIslands(game) {
		const boardWidth = game.board[0].length;
		const boardHeight = game.board.length;
		const visited = Array(boardHeight).fill().map(() => Array(boardWidth).fill(false));
		const islands = [];
		
		// Iterate through all cells on the board
		for (let z = 0; z < boardHeight; z++) {
			for (let x = 0; x < boardWidth; x++) {
				if (!visited[z][x] && game.board[z][x] !== null) {
					const cell = game.board[z][x];
					const playerId = cell.player;
					
					// BFS to find all connected cells
					const island = this._findConnectedCells(game, x, z, playerId, visited);
					
					// Only add islands with more than one cell
					if (island.cells.length > 0) {
						islands.push({
							playerId,
							cells: island.cells,
							hasKing: island.hasKing
						});
					}
				}
			}
		}
		
		return islands;
	}
	
	/**
	 * Find all connected cells forming an island
	 * @param {Object} game - The game object
	 * @param {number} startX - Starting X coordinate
	 * @param {number} startZ - Starting Z coordinate
	 * @param {string} playerId - The player's ID
	 * @param {Array} visited - 2D array tracking visited cells
	 * @returns {Object} Object containing cells in the island and whether it has a king
	 * @private
	 */
	_findConnectedCells(game, startX, startZ, playerId, visited) {
		const queue = [{ x: startX, z: startZ }];
		const cells = [];
		let hasKing = false;
		const boardWidth = game.board[0].length;
		const boardHeight = game.board.length;
		
		// Mark the starting cell as visited
		visited[startZ][startX] = true;
		
		// Check if the starting cell has a king on it
		for (const piece of game.chessPieces) {
			if (piece.player === playerId && piece.type === 'king' && 
				piece.x === startX && piece.z === startZ) {
				hasKing = true;
				break;
			}
		}
		
		// Add the starting cell to the island
		cells.push({ x: startX, z: startZ });
		
		while (queue.length > 0) {
			const { x, z } = queue.shift();
			
			// Check adjacent cells (in XZ plane)
			const adjacentCells = [
				{ x: x - 1, z },  // left
				{ x: x + 1, z },  // right
				{ x, z: z - 1 },  // up
				{ x, z: z + 1 }   // down
			];
			
			for (const cell of adjacentCells) {
				// Skip if out of bounds
				if (cell.x < 0 || cell.x >= boardWidth || cell.z < 0 || cell.z >= boardHeight) {
					continue;
				}
				
				// Skip if already visited
				if (visited[cell.z][cell.x]) {
					continue;
				}
				
				// Check if the cell belongs to the player
				const boardCell = game.board[cell.z][cell.x];
				if (boardCell && boardCell.player === playerId) {
					visited[cell.z][cell.x] = true;
					cells.push({ x: cell.x, z: cell.z });
					queue.push(cell);
					
					// Check if this cell has a king
					for (const piece of game.chessPieces) {
						if (piece.player === playerId && piece.type === 'king' && 
							piece.x === cell.x && piece.z === cell.z) {
							hasKing = true;
							break;
						}
					}
				}
			}
		}
		
		return { cells, hasKing };
	}
	
	/**
	 * Update islands after a tetromino is placed
	 * @param {Object} game - The game object
	 * @param {Array} placedCells - Array of placed cell coordinates
	 * @param {string} playerId - The player's ID
	 */
	updateIslandsAfterTetrominoPlacement(game, placedCells, playerId) {
		// Detect islands after tetromino placement
		const islands = this.detectIslands(game);
		
		// Store islands in the game state
		game.islands = islands;
		
		// Check for disconnected islands (islands without a king)
		const playerIslands = islands.filter(island => island.playerId === playerId);
		const disconnectedIslands = playerIslands.filter(island => !island.hasKing);
		
		if (disconnectedIslands.length > 0) {
			log(`Player ${playerId} has ${disconnectedIslands.length} disconnected islands`);
			
			// Handle disconnected islands
			this._processDisconnectedIslands(game, disconnectedIslands);
		}
	}
	
	/**
	 * Process disconnected islands (islands without a king)
	 * @param {Object} game - The game object
	 * @param {Array} disconnectedIslands - Array of disconnected islands
	 * @private
	 */
	_processDisconnectedIslands(game, disconnectedIslands) {
		// Process each disconnected island
		for (const island of disconnectedIslands) {
			const { playerId, cells } = island;
			
			// Remove chess pieces from disconnected islands
			for (let i = game.chessPieces.length - 1; i >= 0; i--) {
				const piece = game.chessPieces[i];
				if (piece.player === playerId) {
					// Check if the piece is on this island
					const isOnIsland = cells.some(cell => cell.x === piece.x && cell.z === piece.z);
					if (isOnIsland) {
						// Remove the piece
						game.chessPieces.splice(i, 1);
						log(`Removed chess piece ${piece.type} at (${piece.x}, ${piece.z}) due to disconnected island`);
					}
				}
			}
			
			// Clear cells on disconnected islands
			for (const cell of cells) {
				// Clear the cell
				game.board[cell.z][cell.x] = null;
				log(`Cleared cell at (${cell.x}, ${cell.z}) due to disconnected island`);
			}
		}
	}
	
	/**
	 * Check for islands after a row is cleared
	 * @param {Object} game - The game object
	 */
	checkForIslandsAfterRowClear(game) {
		// Detect islands after row clear
		const islands = this.detectIslands(game);
		
		// Store islands in the game state
		game.islands = islands;
		
		// Check for disconnected islands (islands without a king) for each player
		const playerIds = Object.keys(game.players);
		
		for (const playerId of playerIds) {
			const playerIslands = islands.filter(island => island.playerId === playerId);
			const disconnectedIslands = playerIslands.filter(island => !island.hasKing);
			
			if (disconnectedIslands.length > 0) {
				log(`Player ${playerId} has ${disconnectedIslands.length} disconnected islands after row clear`);
				
				// Handle disconnected islands
				this._processDisconnectedIslands(game, disconnectedIslands);
			}
		}
	}
}

module.exports = IslandManager; 