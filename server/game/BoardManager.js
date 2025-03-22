/**
 * BoardManager.js - Handles board creation, expansion, and cell operations
 * This module contains functionality related to the game board
 */

const { BOARD_SETTINGS, GAME_RULES } = require('./Constants');
const { validateCoordinates, log } = require('./GameUtilities');

class BoardManager {
	/**
	 * Create an empty board
	 * @param {number} width - Width of the board
	 * @param {number} height - Height of the board
	 * @returns {Array} The empty board
	 */
	createEmptyBoard(width = BOARD_SETTINGS.DEFAULT_WIDTH, height = BOARD_SETTINGS.DEFAULT_HEIGHT) {
		const board = new Array(height);
		for (let z = 0; z < height; z++) {
			board[z] = new Array(width).fill(null);
		}
		return board;
	}
	
	/**
	 * Expand the game board in specified directions
	 * @param {Object} game - The game object
	 * @param {number} addWidth - Additional width to add
	 * @param {number} addHeight - Additional height to add
	 * @param {Object} direction - Direction to expand: {left: number, right: number, top: number, bottom: number}
	 */
	expandBoard(game, addWidth, addHeight, direction = { left: 0, right: 0, top: 0, bottom: 0 }) {
		const oldWidth = game.board[0].length;
		const oldHeight = game.board.length;
		
		// Calculate expansion in each direction
		const expandLeft = direction.left || Math.floor(addWidth / 2);
		const expandRight = direction.right || (addWidth - expandLeft);
		const expandTop = direction.top || Math.floor(addHeight / 2);
		const expandBottom = direction.bottom || (addHeight - expandTop);
		
		const newWidth = oldWidth + expandLeft + expandRight;
		const newHeight = oldHeight + expandTop + expandBottom;
		
		// Create a new, larger board
		const newBoard = this.createEmptyBoard(newWidth, newHeight);
		
		// Calculate offsets based on the direction of expansion
		const xOffset = expandLeft;
		const zOffset = expandTop;
		
		// Copy the old board content to the new board
		for (let z = 0; z < oldHeight; z++) {
			for (let x = 0; x < oldWidth; x++) {
				if (game.board[z][x]) {
					newBoard[z + zOffset][x + xOffset] = game.board[z][x];
					
					// Update piece positions if there are any
					if (game.board[z][x].chessPiece) {
						game.board[z][x].chessPiece.x = x + xOffset;
						game.board[z][x].chessPiece.z = z + zOffset;
					}
				}
			}
		}
		
		// Update home zone positions for all players
		for (const playerId in game.players) {
			const player = game.players[playerId];
			if (player.homeZone) {
				player.homeZone.x += xOffset;
				player.homeZone.z += zOffset;
			}
		}
		
		// Update chess pieces positions in chessPieces array
		if (game.chessPieces && Array.isArray(game.chessPieces)) {
			for (const piece of game.chessPieces) {
				if (piece && piece.position) {
					piece.position.x += xOffset;
					piece.position.z += zOffset;
				}
			}
		}
		
		// Update game's origin coordinates to track negative expansion
		if (!game.origin) {
			game.origin = { x: 0, z: 0 };
		}
		
		// Update origin to reflect expansion in negative directions
		game.origin.x -= expandLeft;
		game.origin.z -= expandTop;
		
		// Replace the old board with the new one
		game.board = newBoard;
		
		log(`Expanded board from ${oldWidth}x${oldHeight} to ${newWidth}x${newHeight} (Left: ${expandLeft}, Right: ${expandRight}, Top: ${expandTop}, Bottom: ${expandBottom})`);
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
			
			// If home zone dimensions are not defined in game state, use constants
			const homeWidth = BOARD_SETTINGS.HOME_ZONE_WIDTH;
			const homeHeight = BOARD_SETTINGS.HOME_ZONE_HEIGHT;
			
			// Check if coordinates are within this home zone
			if (x >= homeX && x < homeX + homeWidth && 
				z >= homeZ && z < homeZ + homeHeight) {
				
				isInHomeZone = true;
				homeZoneOwner = playerId;
				
				// Check if this home zone has at least one piece
				let hasPiece = false;
				for (let hz = homeZ; hz < homeZ + homeHeight; hz++) {
					for (let hx = homeX; hx < homeX + homeWidth; hx++) {
						// Make sure coordinates are valid before accessing
						if (hz >= 0 && hz < game.board.length && 
							hx >= 0 && hx < game.board[hz].length) {
							
							const cell = game.board[hz][hx];
							if (cell && cell.chessPiece && cell.chessPiece.player === playerId) {
								hasPiece = true;
								log(`Found piece in home zone for player ${playerId} at (${hx}, ${hz})`);
								break;
							}
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
		try {
			validateCoordinates(game, x, z);
			
			// Check if there's a cell at this position
			return game.board[z][x] !== null;
		} catch (error) {
			return false;
		}
	}
	
	/**
	 * Check and clear completed rows on the board
	 * @param {Object} game - The game object
	 * @returns {Array} The indices of cleared rows
	 */
	checkAndClearRows(game) {
		const boardSize = game.board.length;
		const clearedRows = [];
		const requiredCellsForClearing = GAME_RULES.REQUIRED_CELLS_FOR_ROW_CLEARING;
		
		// Check each row (on Z-axis, which is vertical on the board)
		for (let z = 0; z < boardSize; z++) {
			// Count filled cells in the row
			let filledCellCount = 0;
			let skippedHomeCells = 0;
			
			for (let x = 0; x < game.board[z].length; x++) {
				// Check if this cell is in a home zone
				const isHomeCellSafe = this.isCellInSafeHomeZone(game, x, z);
				
				// Count only non-home cells that are filled
				if (game.board[z][x]) {
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
				// First, find all cells above this row that will need to fall
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
	 * Make pieces fall towards their respective kings after row clearing
	 * @param {Object} game - The game object
	 * @param {Array} clearedRows - The indices of cleared rows
	 * @private
	 */
	_makePiecesFallTowardsKing(game, clearedRows) {
		// First, identify all king positions by player
		const kingPositions = {};
		
		for (const piece of game.chessPieces) {
			if (piece && piece.type === 'king') {
				kingPositions[piece.player] = {
					x: piece.position.x,
					z: piece.position.z
				};
			}
		}
		
		// Sort cleared rows in descending order to prevent multiple falls
		clearedRows.sort((a, b) => b - a);
		
		// For each cleared row, move cells above it down
		for (const clearedRowZ of clearedRows) {
			for (let z = clearedRowZ - 1; z >= 0; z--) { // Starting from row above the cleared row
				for (let x = 0; x < game.board[z].length; x++) {
					const cell = game.board[z][x];
					if (!cell) continue;
					
					// Skip home cells
					if (this.isCellInSafeHomeZone(game, x, z)) {
						continue;
					}
					
					// Calculate fall direction towards king
					let fallZ = z + 1; // Default falls straight down
					let fallX = x;
					
					// If the cell belongs to a player with a king, adjust to fall towards king
					if (cell.player && kingPositions[cell.player]) {
						const kingPos = kingPositions[cell.player];
						
						// Determine if we should move horizontally towards the king
						if (Math.abs(x - kingPos.x) > 1) {
							if (x < kingPos.x) fallX = x + 1;
							else if (x > kingPos.x) fallX = x - 1;
						}
					}
					
					// Check if target position is valid and empty
					if (fallZ < game.board.length && fallX >= 0 && fallX < game.board[0].length) {
						if (game.board[fallZ][fallX] === null) {
							// Move the cell
							game.board[fallZ][fallX] = cell;
							game.board[z][x] = null;
							
							// Update chess piece position if present
							if (cell.chessPiece) {
								cell.chessPiece.position = { x: fallX, z: fallZ };
								
								// Update in chessPieces array
								const pieceIndex = game.chessPieces.findIndex(p => p && p.id === cell.chessPiece.id);
								if (pieceIndex !== -1) {
									game.chessPieces[pieceIndex].position = { x: fallX, z: fallZ };
								}
							}
						}
					}
				}
			}
		}
		
		log(`Made pieces fall towards kings after clearing rows: ${clearedRows.join(', ')}`);
	}
	
	/**
	 * Clear a row on the board
	 * @param {Object} game - The game object
	 * @param {number} rowIndex - The index of the row to clear
	 */
	clearRow(game, rowIndex) {
		log(`Clearing row ${rowIndex}`);
		
		// First, check for chess pieces in this row
		const piecesToRemove = [];
		
		// Track cells we're going to delete for island split checking
		const cellsToCheck = [];
		
		for (let x = 0; x < game.board[rowIndex].length; x++) {
			const cell = game.board[rowIndex][x];
			if (!cell) continue;
			
			// Check if this cell is in a protected home zone
			if (this.isCellInSafeHomeZone(game, x, rowIndex)) {
				log(`Cell at (${x}, ${rowIndex}) is in a safe home zone, skipping`);
				continue;
			}
			
			// Check if a chess piece is on this cell
			if (cell.chessPiece) {
				piecesToRemove.push({
					id: cell.chessPiece.id,
					type: cell.chessPiece.type,
					player: cell.chessPiece.player,
					position: { x, z: rowIndex }
				});
			}
			
			// If the cell belongs to an island, track it for split checking
			if (cell.island) {
				cellsToCheck.push({ x, z: rowIndex, islandId: cell.island });
			}
			
			// Clear the cell
			game.board[rowIndex][x] = null;
		}
		
		// Remove pieces from chessPieces array
		if (game.chessPieces && Array.isArray(game.chessPieces)) {
			for (const pieceInfo of piecesToRemove) {
				const pieceIndex = game.chessPieces.findIndex(p => 
					p && p.id === pieceInfo.id
				);
				
				if (pieceIndex !== -1) {
					game.chessPieces.splice(pieceIndex, 1);
				}
			}
		}
	}
}

module.exports = BoardManager; 