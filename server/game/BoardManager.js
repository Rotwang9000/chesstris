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
		for (const playerId in game.players) {
			const player = game.players[playerId];
			
			// Skip if player has no home zone
			if (!player.homeZone) continue;
			
			const { x: homeX, z: homeZ } = player.homeZone;
			const homeWidth = BOARD_SETTINGS.HOME_ZONE_WIDTH;
			const homeHeight = BOARD_SETTINGS.HOME_ZONE_HEIGHT;
			
			// Check if coordinates are within this home zone
			if (x >= homeX && x < homeX + homeWidth && 
				z >= homeZ && z < homeZ + homeHeight) {
				
				// Check if this home zone has at least one piece
				let hasPiece = false;
				for (let hz = homeZ; hz < homeZ + homeHeight; hz++) {
					for (let hx = homeX; hx < homeX + homeWidth; hx++) {
						const cell = game.board[hz][hx];
						if (cell && cell.chessPiece && cell.chessPiece.player === playerId) {
							hasPiece = true;
							break;
						}
					}
					if (hasPiece) break;
				}
				
				return hasPiece;
			}
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
			for (let x = 0; x < game.board[z].length; x++) {
				// Skip cells in safe home zones (home zones with at least one piece)
				if (game.board[z][x] && !this.isCellInSafeHomeZone(game, x, z)) {
					filledCellCount++;
				}
			}
			
			// If the row has at least the required number of filled cells, clear it
			if (filledCellCount >= requiredCellsForClearing) {
				this.clearRow(game, z);
				clearedRows.push(z);
				
				// Log the row clearing
				log(`Cleared row ${z} with ${filledCellCount} filled cells`);
			}
		}
		
		return clearedRows;
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
		const piecesToTrack = [];
		
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