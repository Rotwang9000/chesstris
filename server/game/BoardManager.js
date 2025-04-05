/**
 * BoardManager.js - Handles board creation, expansion, and cell operations
 * This module contains functionality related to the game board
 */

const { BOARD_SETTINGS, GAME_RULES } = require('./Constants');
const { validateCoordinates, log } = require('./GameUtilities');

class BoardManager {
	/**
	 * Create an empty board
	 * @returns {Object} The empty board structure with a sparse cell representation
	 */
	createEmptyBoard() {
		// Use a sparse structure with occupied cells - no predefined boundaries
		return {
			cells: {},  // Map of "x,z" coordinates to cell data
			// Track the actual boundaries based on cells that exist
			minX: Infinity,
			maxX: -Infinity,
			minZ: Infinity,
			maxZ: -Infinity
		};
	}
	
	/**
	 * Get a cell at specific coordinates
	 * @param {Object} board - The board object
	 * @param {number} x - X coordinate
	 * @param {number} z - Z coordinate
	 * @returns {Array|null} The cell array or null if empty
	 */
	getCell(board, x, z) {
		const key = `${x},${z}`;
		// Return the array of objects in the cell, or null if empty
		return board.cells[key] || null;
	}
	
	/**
	 * Set a cell at specific coordinates
	 * @param {Object} board - The board object
	 * @param {number} x - X coordinate
	 * @param {number} z - Z coordinate
	 * @param {Object|Array} cell - Cell data to set (object or array of objects)
	 */
	setCell(board, x, z, cell) {
		const key = `${x},${z}`;
		
		// Update board boundaries if necessary
		if (cell !== null) {
			if (x < board.minX) board.minX = x;
			if (x > board.maxX) board.maxX = x;
			if (z < board.minZ) board.minZ = z;
			if (z > board.maxZ) board.maxZ = z;
		}
		
		// Ensure we're setting an array of objects
		if (Array.isArray(cell)) {
			board.cells[key] = cell;
		} else if (cell === null) {
			// If explicitly setting to null, clear the cell
			delete board.cells[key];
			
			// Recalculate board boundaries after deletion
			this.recalculateBoardBoundaries(board);
		} else {
			// Convert single object to array
			board.cells[key] = [cell];
		}
	}
	
	/**
	 * Recalculate board boundaries based on existing cells
	 * @param {Object} board - The board object
	 */
	recalculateBoardBoundaries(board) {
		// Reset boundaries
		board.minX = Infinity;
		board.maxX = -Infinity;
		board.minZ = Infinity;
		board.maxZ = -Infinity;
		
		// Iterate through all cells to find boundaries
		for (const key in board.cells) {
			if (!board.cells[key] || board.cells[key].length === 0) continue;
			
			const [x, z] = key.split(',').map(Number);
			if (x < board.minX) board.minX = x;
			if (x > board.maxX) board.maxX = x;
			if (z < board.minZ) board.minZ = z;
			if (z > board.maxZ) board.maxZ = z;
		}
		
		// If no cells, set default boundaries
		if (board.minX === Infinity) {
			board.minX = 0;
			board.maxX = 0;
			board.minZ = 0;
			board.maxZ = 0;
		}
	}
	
	/**
	 * Add an object to a cell at specific coordinates
	 * @param {Object} board - The board object
	 * @param {number} x - X coordinate
	 * @param {number} z - Z coordinate
	 * @param {Object} cellObject - Cell object to add
	 */
	addToCellContents(board, x, z, cellObject) {
		const key = `${x},${z}`;
		
		// Update board boundaries if necessary
		if (x < board.minX) board.minX = x;
		if (x > board.maxX) board.maxX = x;
		if (z < board.minZ) board.minZ = z;
		if (z > board.maxZ) board.maxZ = z;
		
		// Update width and height
		board.width = board.maxX - board.minX + 1;
		board.height = board.maxZ - board.minZ + 1;
		
		// Add the object to the cell array
		if (!board.cells[key]) {
			board.cells[key] = [];
		}
		
		board.cells[key].push(cellObject);
	}
	
	/**
	 * Remove an object from a cell based on a filter function
	 * @param {Object} board - The board object
	 * @param {number} x - X coordinate
	 * @param {number} z - Z coordinate
	 * @param {Function} filterFn - Function that returns true for items to keep
	 * @returns {Object|null} The removed object or null if none found
	 */
	removeFromCellContents(board, x, z, filterFn) {
		const key = `${x},${z}`;
		const cell = board.cells[key];
		
		if (!cell || !Array.isArray(cell) || cell.length === 0) {
			return null;
		}
		
		// Find the index of the first item that should be removed
		const indexToRemove = cell.findIndex(item => !filterFn(item));
		
		if (indexToRemove !== -1) {
			// Remove the item
			const removedItem = cell.splice(indexToRemove, 1)[0];
			
			// If the cell is now empty, remove it
			if (cell.length === 0) {
				delete board.cells[key];
			}
			
			return removedItem;
		}
		
		return null;
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
						const cellContents = this.getCell(game.board, hx, hz);
						if (cellContents) {
							// Look for chess pieces in the cell array
							for (const item of cellContents) {
								if (item && item.type === 'chess' && item.player === playerId) {
									hasPiece = true;
									log(`Found piece in home zone for player ${playerId} at (${hx}, ${hz})`);
									break;
								}
							}
							if (hasPiece) break;
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
		// Check if there's a cell at this position (any content means it's occupied)
		const cellContents = this.getCell(game.board, x, z);
		return cellContents !== null && Array.isArray(cellContents) && cellContents.length > 0;
	}
	
	/**
	 * Check if a cell has a specific type of content
	 * @param {Object} game - The game object
	 * @param {number} x - X coordinate
	 * @param {number} z - Z coordinate
	 * @param {string} type - The type to look for (e.g., 'tetromino', 'chess', 'home')
	 * @returns {boolean} True if the cell has the specified type
	 */
	hasCellType(game, x, z, type) {
		const cellContents = this.getCell(game.board, x, z);
		if (!cellContents) return false;
		
		return cellContents.some(item => item && item.type === type);
	}
	
	/**
	 * Find all cell contents of a specific type
	 * @param {Object} game - The game object
	 * @param {number} x - X coordinate
	 * @param {number} z - Z coordinate
	 * @param {string} type - The type to look for
	 * @returns {Array} Array of matching cell contents
	 */
	getCellContentsByType(game, x, z, type) {
		const cellContents = this.getCell(game.board, x, z);
		if (!cellContents) return [];
		
		return cellContents.filter(item => item && item.type === type);
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
			// We need to track consecutive filled cells, not just total count
			let maxConsecutive = 0;
			let currentConsecutive = 0;
			let skippedHomeCells = 0;
			
			// Check cells across the x-axis for this z-coordinate
			for (let x = game.board.minX; x <= game.board.maxX; x++) {
				const cellContents = this.getCell(game.board, x, z);
				
				// Check if this cell is in a home zone
				const isHomeCellSafe = this.isCellInSafeHomeZone(game, x, z);
				
				if (isHomeCellSafe) {
					// Home cells break the consecutive sequence
					skippedHomeCells++;
					currentConsecutive = 0;
				} else if (cellContents && cellContents.length > 0) {
					// Cell is filled and not a home cell
					currentConsecutive++;
					// Update the maximum consecutive count
					maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
				} else {
					// Empty cell breaks the consecutive sequence
					currentConsecutive = 0;
				}
			}
			
			// Log the cell counts for debugging
			if (maxConsecutive > 0 || skippedHomeCells > 0) {
				log(`Row ${z}: ${maxConsecutive} max consecutive filled cells + ${skippedHomeCells} skipped home cells (need ${requiredCellsForClearing} to clear)`);
			}
			
			// If the row has at least the required number of consecutive filled cells, clear it
			if (maxConsecutive >= requiredCellsForClearing) {
				// Clear the row
				this.clearRow(game, z);
				clearedRows.push(z);
				
				// Log the row clearing
				log(`Cleared row ${z} with ${maxConsecutive} consecutive filled cells (skipped ${skippedHomeCells} home cells)`);
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
	 * @param {number} rowIndex - The index of the row to clear
	 */
	clearRow(game, rowIndex) {
		// Loop through the cells in the row
		for (let x = game.board.minX; x <= game.board.maxX; x++) {
			const key = `${x},${rowIndex}`;
			const cellContents = game.board.cells[key];
			
			// Skip empty cells
			if (!cellContents || cellContents.length === 0) continue;
			
			// Skip cells in safe home zones
			if (this.isCellInSafeHomeZone(game, x, rowIndex)) {
				log(`Skipping cell at (${x}, ${rowIndex}) in safe home zone`);
				continue;
			}
			
			// Remove non-home cell content (tetrominos, etc.)
			// But preserve home zone markers
			const homeZoneMarkers = cellContents.filter(item => 
				item && item.type === 'home'
			);
			
			if (homeZoneMarkers.length > 0) {
				// Only keep home zone markers
				game.board.cells[key] = homeZoneMarkers;
			} else {
				// Remove the cell completely
				delete game.board.cells[key];
			}
			
			log(`Cleared cell at (${x}, ${rowIndex})`);
		}
		
		log(`Cleared row ${rowIndex}`);
		
		// Check if there are any chess pieces that need to be adjusted
		this._makePiecesFallTowardsKing(game, [rowIndex]);
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