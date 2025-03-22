/**
 * TetrominoManager.js - Handles tetromino placement, validation, and related logic
 * This module contains functionality for tetromino operations in the XZ-Y coordinate system
 */

const { TETROMINO_SHAPES } = require('./Constants');
const { log } = require('./GameUtilities');

class TetrominoManager {
	constructor(boardManager, islandManager) {
		this.boardManager = boardManager;
		this.islandManager = islandManager;
	}
	
	/**
	 * Check if a tetromino piece type is valid
	 * @param {string} pieceType - The tetromino piece type (I, O, T, S, Z, J, L)
	 * @returns {boolean} True if the piece type is valid
	 */
	isValidTetrisPiece(pieceType) {
		return ['I', 'O', 'T', 'S', 'Z', 'J', 'L'].includes(pieceType);
	}
	
	/**
	 * Get the shape of a tetris piece based on type and rotation
	 * @param {string} shape - The tetris piece type (I, O, T, S, Z, J, L)
	 * @param {number} rotation - Rotation angle (0, 1, 2, 3)
	 * @returns {Array} The rotated shape
	 */
	getTetrisPieceShape(shape, rotation = 0) {
		return TETROMINO_SHAPES[shape] ? TETROMINO_SHAPES[shape][rotation % 4] : null;
	}
	
	/**
	 * Generate an array of available tetrominos for a player
	 * @param {Object} game - The game object
	 * @param {string} playerId - The player's ID
	 * @returns {Array} Array of available tetrominos
	 */
	generateTetrominos(game, playerId) {
		const pieceTypes = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
		const tetrominos = [];
		
		// Generate a random set of tetrominos
		for (let i = 0; i < 3; i++) {
			const pieceType = pieceTypes[Math.floor(Math.random() * pieceTypes.length)];
			const rotation = Math.floor(Math.random() * 4);
			
			tetrominos.push({
				id: `${playerId}-tetromino-${Date.now()}-${i}`,
				pieceType,
				rotation,
				shape: this.getTetrisPieceShape(pieceType, rotation)
			});
		}
		
		return tetrominos;
	}
	
	/**
	 * Check if a tetromino has an adjacent cell with a specified player's ID
	 * @param {Object} game - The game object
	 * @param {number} x - X coordinate
	 * @param {number} z - Z coordinate
	 * @param {string} playerId - The player's ID
	 * @returns {Object} Result with hasAdjacent flag and coordinates
	 */
	hasAdjacentCell(game, x, z, playerId) {
		// Check adjacent positions in XZ plane
		const adjacentPositions = [
			{ x: x - 1, z }, // left
			{ x: x + 1, z }, // right
			{ x, z: z - 1 }, // forward
			{ x, z: z + 1 }  // backward
		];
		
		const boardWidth = game.board[0].length;
		const boardHeight = game.board.length;
		
		for (const pos of adjacentPositions) {
			// Check bounds
			if (pos.x < 0 || pos.x >= boardWidth || pos.z < 0 || pos.z >= boardHeight) {
				continue;
			}
			
			// Check if there's a cell at this position
			if (game.board[pos.z][pos.x] !== null) {
				const cell = game.board[pos.z][pos.x];
				
				// Cell must belong to the player or be a captured cell
				if (cell.player === playerId) {
					return {
						hasAdjacent: true,
						x: pos.x,
						z: pos.z
					};
				}
			}
		}
		
		return { hasAdjacent: false };
	}
	
	/**
	 * Check if a tetromino can be placed at the specified position
	 * @param {Object} game - The game object
	 * @param {Array|Object} tetromino - The tetromino shape (2D array or object with shape property)
	 * @param {number} x - X coordinate (top-left corner)
	 * @param {number} z - Z coordinate (top-left corner)
	 * @param {number} y - Y coordinate (height level, default is 0)
	 * @param {string} playerId - The player's ID
	 * @returns {boolean} True if the tetromino can be placed
	 */
	canPlaceTetromino(game, tetromino, x, z, y = 0, playerId) {
		// Handle both array and object formats for tetromino
		const shape = Array.isArray(tetromino) ? tetromino : tetromino.shape;
		const depth = shape.length;
		const width = shape[0].length;
		const boardWidth = game.board[0].length;
		const boardHeight = game.board.length;
		
		// Y-axis logic (tetrominos fall along Y-axis)
		if (y === 1) {
			// When a Tetris piece gets to Y=1, if there is a cell underneath, it should explode to nothing
			for (let i = 0; i < depth; i++) {
				for (let j = 0; j < width; j++) {
					if (shape[i][j] && this.boardManager.hasCellUnderneath(game, x + j, z + i)) {
						return false; // Will explode
					}
				}
			}
			
			// No cells underneath, can't place at Y=1
			return false;
		}
		
		// Check bounds
		for (let i = 0; i < depth; i++) {
			for (let j = 0; j < width; j++) {
				if (shape[i][j]) {
					const posX = x + j;
					const posZ = z + i;
					
					// Check if the cell is within the bounds of the board
					if (posX < 0 || posX >= boardWidth || posZ < 0 || posZ >= boardHeight) {
						return false;
					}
					
					// Check if the cell is already occupied
					if (game.board[posZ][posX] !== null) {
						return false;
					}
				}
			}
		}
		
		// Check if this is the player's first tetromino placement
		const isFirstPlacement = !game.players[playerId].lastTetrominoPlacement;
		
		// Check if the tetromino has at least one cell adjacent to an existing cell
		// or has a path to the player's king
		let hasAdjacent = false;
		
		for (let i = 0; i < depth; i++) {
			for (let j = 0; j < width; j++) {
				if (shape[i][j]) {
					const posX = x + j;
					const posZ = z + i;
					
					const adjacentResult = this.hasAdjacentCell(game, posX, posZ, playerId);
					if (adjacentResult.hasAdjacent) {
						hasAdjacent = true;
						
						// If it's the first placement or there's a path to the king, it's valid
						if (isFirstPlacement || this.islandManager.hasPathToKing(game, adjacentResult.x, adjacentResult.z, playerId)) {
							return true;
						}
					}
				}
			}
		}
		
		// For the first placement, check if it's adjacent to the player's home zone
		if (isFirstPlacement) {
			// Find the player's home zone
			const homeZone = game.homeZones[playerId];
			if (homeZone) {
				for (let i = 0; i < depth; i++) {
					for (let j = 0; j < width; j++) {
						if (shape[i][j]) {
							const posX = x + j;
							const posZ = z + i;
							
							// Check adjacent to home zone cells
							const adjacentPositions = [
								{ x: posX - 1, z: posZ },
								{ x: posX + 1, z: posZ },
								{ x: posX, z: posZ - 1 },
								{ x: posX, z: posZ + 1 }
							];
							
							for (const pos of adjacentPositions) {
								// Check if this position is within bounds
								if (pos.x >= 0 && pos.x < boardWidth && pos.z >= 0 && pos.z < boardHeight) {
									// Check if there's a home cell here
									const cell = game.board[pos.z][pos.x];
									if (cell && cell.type === 'home' && cell.player === playerId) {
										return true;
									}
								}
							}
						}
					}
				}
			}
		}
		
		return hasAdjacent;
	}
	
	/**
	 * Place a tetromino on the board
	 * @param {Object} game - The game object
	 * @param {Array} tetromino - The tetromino shape
	 * @param {number} x - X coordinate
	 * @param {number} z - Z coordinate
	 * @param {string} playerId - The player's ID
	 * @returns {Array} The cells that were placed
	 */
	placeTetromino(game, tetromino, x, z, playerId) {
		// Get player color
		const playerColor = game.players[playerId].color;
		
		// Handle both array and object formats for tetromino
		const shape = Array.isArray(tetromino) ? tetromino : tetromino.shape;
		const depth = shape.length;
		const width = shape[0].length;
		
		// Track placed cells
		const placedCells = [];
		
		// Place the tetromino
		for (let i = 0; i < depth; i++) {
			for (let j = 0; j < width; j++) {
				if (shape[i][j]) {
					const posX = x + j;
					const posZ = z + i;
					
					// Create a new cell
					game.board[posZ][posX] = {
						type: 'tetromino',
						player: playerId,
						color: playerColor,
						placedAt: Date.now()
					};
					
					// Add to placed cells
					placedCells.push({ x: posX, z: posZ });
				}
			}
		}
		
		// Update island connectivity
		this.islandManager.updateIslandsAfterTetrominoPlacement(game, placedCells, playerId);
		
		return placedCells;
	}
	
	/**
	 * Process a tetris piece placement
	 * @param {Object} game - The game object
	 * @param {string} playerId - The ID of the player
	 * @param {Object} moveData - Data about the move
	 * @returns {Object} Result of the move
	 */
	processTetrominoPiece(game, playerId, moveData) {
		try {
			// Validate the tetris piece placement
			const { pieceType, rotation, x, z, y = 0 } = moveData;
			
			// Check if the piece type is valid
			if (!this.isValidTetrisPiece(pieceType)) {
				return {
					success: false,
					error: 'Invalid tetris piece type: ' + pieceType
				};
			}
			
			// Get the tetris piece shape based on type and rotation
			const pieceShape = this.getTetrisPieceShape(pieceType, rotation);
			
			// Check if the piece can be placed at the specified position with Y-axis logic
			if (!this.canPlaceTetromino(game, pieceShape, x, z, y, playerId)) {
				// If at Y=1 and the tetromino can't be placed, it explodes to nothing
				if (y === 1) {
					log(`Tetromino exploded at Y=1 for player ${playerId}`);
					return {
						success: true,
						message: 'Tetromino exploded at Y=1',
						exploded: true
					};
				}
				
				// If at Y=0 and has no valid connection, it can't be placed
				return {
					success: false,
					error: `Cannot place tetris piece at position (${x}, ${z}, ${y})`
				};
			}
			
			// Place the tetris piece at Y=0 (only possible placement)
			const placedCells = this.placeTetromino(game, pieceShape, x, z, playerId);
			
			// Store the placement position for future movement limit checks
			game.players[playerId].lastTetrominoPlacement = { x, z };
			
			// Check for completed rows
			const completedRows = this.boardManager.checkAndClearRows(game);
			
			return {
				success: true,
				completedRows: completedRows.length,
				placedCells
			};
		} catch (error) {
			log(`Error processing tetromino piece: ${error.message}`);
			return {
				success: false,
				error: error.message
			};
		}
	}
}

module.exports = TetrominoManager; 