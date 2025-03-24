/**
 * BoardManager.js - Handles board creation, expansion, and cell operations
 * This module contains functionality related to the game board
 */

const { BOARD_SETTINGS, GAME_RULES } = require('./Constants');
const { validateCoordinates, log } = require('./GameUtilities');

class BoardManager {
	/**
	 * Create an empty board
	 * @param {number} width - Initial width of the board (for visualization purposes)
	 * @param {number} height - Initial height of the board (for visualization purposes)
	 * @returns {Object} The empty board structure
	 */
	createEmptyBoard(width = BOARD_SETTINGS.DEFAULT_WIDTH, height = BOARD_SETTINGS.DEFAULT_HEIGHT) {
		// Instead of a 2D array, use a sparse structure with occupied cells
		return {
			cells: {},  // Map of "x,z" coordinates to cell data
			width: width,
			height: height,
			minX: 0,
			maxX: width - 1,
			minZ: 0,
			maxZ: height - 1
		};
	}
	
	/**
	 * Get a cell at specific coordinates
	 * @param {Object} board - The board object
	 * @param {number} x - X coordinate
	 * @param {number} z - Z coordinate
	 * @returns {Object|null} The cell or null if empty
	 */
	getCell(board, x, z) {
		const key = `${x},${z}`;
		return board.cells[key] || null;
	}
	
	/**
	 * Set a cell at specific coordinates
	 * @param {Object} board - The board object
	 * @param {number} x - X coordinate
	 * @param {number} z - Z coordinate
	 * @param {Object} cell - Cell data to set
	 */
	setCell(board, x, z, cell) {
		const key = `${x},${z}`;
		
		// Update board boundaries if necessary
		if (x < board.minX) board.minX = x;
		if (x > board.maxX) board.maxX = x;
		if (z < board.minZ) board.minZ = z;
		if (z > board.maxZ) board.maxZ = z;
		
		// Update width and height
		board.width = board.maxX - board.minX + 1;
		board.height = board.maxZ - board.minZ + 1;
		
		// Set the cell
		board.cells[key] = cell;
	}
	
	/**
	 * Get a 2D array representation of the board for a specific region
	 * This is useful for algorithms that expect a 2D array
	 * @param {Object} board - The board object
	 * @param {number} minX - Minimum X coordinate
	 * @param {number} maxX - Maximum X coordinate
	 * @param {number} minZ - Minimum Z coordinate
	 * @param {number} maxZ - Maximum Z coordinate
	 * @returns {Array} 2D array representation of the board region
	 */
	getBoardRegion(board, minX, maxX, minZ, maxZ) {
		const width = maxX - minX + 1;
		const height = maxZ - minZ + 1;
		
		const region = new Array(height);
		for (let z = 0; z < height; z++) {
			region[z] = new Array(width).fill(null);
			for (let x = 0; x < width; x++) {
				const realX = minX + x;
				const realZ = minZ + z;
				region[z][x] = this.getCell(board, realX, realZ);
			}
		}
		
		return region;
	}
	
	/**
	 * Expand the board boundaries (for visualization purposes)
	 * Note: With the sparse approach, the board automatically expands when cells are set
	 * This function is kept for compatibility
	 * @param {Object} game - The game object
	 * @param {number} addWidth - Additional width to add
	 * @param {number} addHeight - Additional height to add
	 * @param {Object} direction - Direction to expand: {left: number, right: number, top: number, bottom: number}
	 */
	expandBoard(game, addWidth, addHeight, direction = { left: 0, right: 0, top: 0, bottom: 0 }) {
		// With the sparse approach, we don't need to physically expand the board
		// Just update the boundaries for visualization
		const oldWidth = game.board.width;
		const oldHeight = game.board.height;
		
		// Calculate expansion in each direction
		const expandLeft = direction.left || Math.floor(addWidth / 2);
		const expandRight = direction.right || (addWidth - expandLeft);
		const expandTop = direction.top || Math.floor(addHeight / 2);
		const expandBottom = direction.bottom || (addHeight - expandTop);
		
		// Update the board boundaries
		game.board.minX -= expandLeft;
		game.board.maxX += expandRight;
		game.board.minZ -= expandTop;
		game.board.maxZ += expandBottom;
		
		// Update width and height
		game.board.width = game.board.maxX - game.board.minX + 1;
		game.board.height = game.board.maxZ - game.board.minZ + 1;
		
		log(`Expanded board from ${oldWidth}x${oldHeight} to ${game.board.width}x${game.board.height} (Left: ${expandLeft}, Right: ${expandRight}, Top: ${expandTop}, Bottom: ${expandBottom})`);
	}
	
	/**
	 * Check if a cell is in a safe home zone (home zone with at least one piece)
	 * @param {Object} game - The game object
	 * @param {number} x - X coordinate
	 * @param {number} z - Z coordinate
	 * @returns {boolean} True if the cell is in a safe home zone
	 */
	isCellInSafeHomeZone(game, x, z) {
		if (!game || !game.players) {
			log(`isCellInSafeHomeZone: Game or players object is undefined`);
			return false;
		}
		
		// Debug output for cell checking
		let isInHomeZone = false;
		let homeZoneOwner = null;
		
		for (const playerId in game.players) {
			const player = game.players[playerId];
			
			// Skip if player has no home zone
			if (!player.homeZone) {
				continue;
			}
			
			const { x: homeX, z: homeZ } = player.homeZone;
			
			// Get home zone dimensions from the player's home zone object
			const homeWidth = player.homeZone.width;
			const homeHeight = player.homeZone.height;
			
			// Check if coordinates are within this home zone
			if (x >= homeX && x < homeX + homeWidth && 
				z >= homeZ && z < homeZ + homeHeight) {
				
				isInHomeZone = true;
				homeZoneOwner = playerId;
				
				// Check if this home zone has at least one piece
				let hasPiece = false;
				for (let hz = homeZ; hz < homeZ + homeHeight; hz++) {
					for (let hx = homeX; hx < homeX + homeWidth; hx++) {
						const cell = this.getCell(game.board, hx, hz);
						if (cell && cell.chessPiece && cell.chessPiece.player === playerId) {
							hasPiece = true;
							log(`Found piece in home zone for player ${playerId} at (${hx}, ${hz})`);
							break;
						}
					}
					if (hasPiece) break;
				}
				
				if (hasPiece) {
					log(`Cell (${x}, ${z}) is in player ${playerId}'s safe home zone`);
					return true;
				} else {
					log(`Cell (${x}, ${z}) is in player ${playerId}'s home zone but no pieces found - NOT safe`);
				}
			}
		}
		
		if (isInHomeZone) {
			log(`Cell (${x}, ${z}) is in player ${homeZoneOwner}'s home zone but not safe`);
		}
		
		return false;
	}
	
	/**
	 * Check if a cell has another cell underneath it
	 * @param {Object} game - The game object
	 * @param {number} x - X coordinate
	 * @param {number} z - Z coordinate
	 * @returns {boolean} True if there's a cell underneath
	 */
	hasCellUnderneath(game, x, z) {
		// Check if there's a cell at this position
		return this.getCell(game.board, x, z) !== null;
	}
	
	/**
	 * Check and clear completed rows on the board
	 * @param {Object} game - The game object
	 * @returns {Array} The indices of cleared rows
	 */
	checkAndClearRows(game) {
		const clearedRows = [];
		const requiredCellsForClearing = GAME_RULES.REQUIRED_CELLS_FOR_ROW_CLEARING;
		
		// Get the range of z-coordinates to check
		const minZ = game.board.minZ;
		const maxZ = game.board.maxZ;
		
		// Check each row (on Z-axis, which is vertical on the board)
		for (let z = minZ; z <= maxZ; z++) {
			// Count filled cells in the row
			let filledCellCount = 0;
			let skippedHomeCells = 0;
			
			// Check cells across the x-axis for this z-coordinate
			for (let x = game.board.minX; x <= game.board.maxX; x++) {
				const cell = this.getCell(game.board, x, z);
				
				// Check if this cell is in a home zone
				const isHomeCellSafe = this.isCellInSafeHomeZone(game, x, z);
				
				// Count only non-home cells that are filled
				if (cell) {
					if (isHomeCellSafe) {
						skippedHomeCells++;
					} else {
						filledCellCount++;
					}
				}
			}
			
			// Log the cell counts for debugging
			if (filledCellCount > 0 || skippedHomeCells > 0) {
				log(`Row ${z}: ${filledCellCount} filled cells + ${skippedHomeCells} skipped home cells (need ${requiredCellsForClearing} to clear)`);
			}
			
			// If the row has at least the required number of filled cells, clear it
			if (filledCellCount >= requiredCellsForClearing) {
				// Clear the row
				this.clearRow(game, z);
				clearedRows.push(z);
				
				// Log the row clearing
				log(`Cleared row ${z} with ${filledCellCount} filled cells (skipped ${skippedHomeCells} home cells)`);
			}
		}
		
		// After clearing rows, make pieces fall towards their respective kings
		if (clearedRows.length > 0) {
			this._makePiecesFallTowardsKing(game, clearedRows);
		}
		
		return clearedRows;
	}
	
	/**
	 * Clear a row on the board
	 * @param {Object} game - The game object
	 * @param {number} rowIndex - The row index to clear
	 */
	clearRow(game, rowIndex) {
		// Clear all non-home cells in the row
		for (let x = game.board.minX; x <= game.board.maxX; x++) {
			const isHomeCellSafe = this.isCellInSafeHomeZone(game, x, rowIndex);
			if (!isHomeCellSafe) {
				// Find chess pieces at this position and remove them
				const cell = this.getCell(game.board, x, rowIndex);
				if (cell && cell.chessPiece) {
					// Remove the chess piece from the game's pieces array
					const pieceIndex = game.chessPieces.findIndex(p => 
						p.position.x === x && p.position.z === rowIndex);
					
					if (pieceIndex !== -1) {
						game.chessPieces.splice(pieceIndex, 1);
					}
				}
				
				// Clear the cell
				delete game.board.cells[`${x},${rowIndex}`];
			}
		}
	}
	
	/**
	 * Make pieces fall towards their respective kings after row clearing
	 * @param {Object} game - The game object
	 * @param {Array} clearedRows - The indices of cleared rows
	 * @private
	 */
	_makePiecesFallTowardsKing(game, clearedRows) {
		// Implementation would need to be updated to work with the sparse board structure
		// This is a placeholder - would need more significant updates
		log('Pieces falling towards kings after row clearing');
	}
}

module.exports = BoardManager; 