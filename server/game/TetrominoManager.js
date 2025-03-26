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
		
		// Validate game and board
		if (!game || !game.board) {
			console.error("Invalid game object or board in canPlaceTetromino");
			return false;
		}
		
		// If shape is invalid, log an error and return false
		if (!shape || !Array.isArray(shape) || shape.length === 0) {
			console.error("Invalid tetromino shape in canPlaceTetromino:", shape);
			return false;
		}
		
		const depth = shape.length;
		const width = shape[0].length;
		
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
		
		// Check for collision with existing cells
		for (let i = 0; i < depth; i++) {
			for (let j = 0; j < width; j++) {
				if (shape[i][j]) {
					const posX = x + j;
					const posZ = z + i;
					
					// Check if the cell contains any non-home objects (occupied)
					const cellContents = this.boardManager.getCell(game.board, posX, posZ);
					
					if (cellContents && cellContents.length > 0) {
						// Check if cell has any non-home content (which would block placement)
						const hasNonHomeContent = cellContents.some(item => 
							!(item && item.type === 'home')
						);
						
						if (hasNonHomeContent) {
							return false; // Cell is occupied with non-home content
						}
					}
				}
			}
		}
		
		// Check if this is the player's first tetromino placement
		const isFirstPlacement = !game.players[playerId] || !game.players[playerId].lastTetrominoPlacement;
		
		// Check if the tetromino has at least one cell adjacent to an existing cell
		// or has a path to the player's king
		let hasAdjacent = false;
		
		for (let i = 0; i < depth; i++) {
			for (let j = 0; j < width; j++) {
				if (shape[i][j]) {
					const posX = x + j;
					const posZ = z + i;
					
					// Check adjacent cells
					const adjacentPositions = [
						{ x: posX - 1, z: posZ }, // left
						{ x: posX + 1, z: posZ }, // right
						{ x: posX, z: posZ - 1 }, // forward
						{ x: posX, z: posZ + 1 }  // backward
					];
					
					for (const pos of adjacentPositions) {
						const adjacentCell = this.boardManager.getCell(game.board, pos.x, pos.z);
						
						if (adjacentCell && adjacentCell.length > 0) {
							// Check if any adjacent cell belongs to the player
							const hasPlayerContent = adjacentCell.some(item => 
								item && item.player === playerId && item.type !== 'home'
							);
							
							if (hasPlayerContent) {
								hasAdjacent = true;
								
								// If it's the first placement or there's a path to the king, it's valid
								if (isFirstPlacement || this.islandManager.hasPathToKing(game, pos.x, pos.z, playerId)) {
									return true;
								}
							}
						}
					}
				}
			}
		}
		
		// For the first placement, check if it's adjacent to the player's home zone
		if (isFirstPlacement && game.homeZones && game.homeZones[playerId]) {
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
								const adjacentCell = this.boardManager.getCell(game.board, pos.x, pos.z);
								
								if (adjacentCell && adjacentCell.length > 0) {
									// Check if any adjacent cell is a home cell for this player
									const hasHomeCell = adjacentCell.some(item => 
										item && item.type === 'home' && item.player === playerId
									);
									
									if (hasHomeCell) {
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
	 * @param {Array|Object} tetromino - The tetromino shape
	 * @param {number} x - X coordinate
	 * @param {number} z - Z coordinate
	 * @param {string} playerId - The player's ID
	 * @returns {Array} The cells that were placed
	 */
	placeTetromino(game, tetromino, x, z, playerId) {
		// Get player information
		const player = game.players[playerId];
		
		// Handle both array and object formats for tetromino
		const tetrominoObj = Array.isArray(tetromino) ? { shape: tetromino } : tetromino;
		const shape = tetrominoObj.shape;
		const pieceType = tetrominoObj.pieceType || tetrominoObj.type || 'I';
		
		if (!shape || !Array.isArray(shape)) {
			console.error("Invalid tetromino shape in placeTetromino:", shape);
			return [];
		}
		
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
					
					// Create a new tetromino cell object
					const tetrominoCell = {
						type: 'tetromino',
						pieceType: pieceType,
						player: playerId,
						placedAt: Date.now()
					};
					
					// Preserve any existing home zone markers
					const cellContents = this.boardManager.getCell(game.board, posX, posZ);
					const homeMarkers = cellContents ? 
						cellContents.filter(item => item && item.type === 'home') : 
						[];
					
					// Combine home markers with the new tetromino cell
					const newCellContents = [...homeMarkers, tetrominoCell];
					
					// Set the cell contents
					this.boardManager.setCell(game.board, posX, posZ, newCellContents);
					
					// Add to placed cells for tracking
					placedCells.push({
						x: posX,
						z: posZ,
						cell: tetrominoCell
					});
				}
			}
		}
		
		// Update player's last tetromino placement time
		if (player) {
			player.lastTetrominoPlacement = Date.now();
		}
		
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