/**
 * BoardUpdater.js - Provides efficient board update mechanisms
 * Handles sending incremental updates and assigning unique IDs to board cells
 */

class BoardUpdater {
	constructor() {
		// Keep track of the last board state for each game
		this.lastBoardStates = new Map();
		
		// Store cell IDs for games
		this.cellIds = new Map();
		
		// Counter for generating unique cell IDs
		this.idCounter = 1;
	}
	
	/**
	 * Generate a unique ID for a cell
	 * @returns {string} A unique cell ID
	 */
	generateCellId() {
		return `cell_${this.idCounter++}`;
	}
	
	/**
	 * Prepare a board with unique cell IDs
	 * @param {string} gameId - The game ID
	 * @param {Array} board - The game board
	 * @returns {Array} The board with IDs assigned to cells
	 */
	prepareBoard(gameId, board) {
		if (!board || !Array.isArray(board)) {
			return board;
		}
		
		// Create game's cell ID map if it doesn't exist
		if (!this.cellIds.has(gameId)) {
			this.cellIds.set(gameId, new Map());
		}
		
		const cellIdMap = this.cellIds.get(gameId);
		const boardWithIds = [];
		
		// Process each row and cell - preserving the full board dimensions
		for (let z = 0; z < board.length; z++) {
			const row = board[z];
			if (!row) {
				boardWithIds[z] = [];
				continue;
			}
			
			boardWithIds[z] = [];
			
			for (let x = 0; x < row.length; x++) {
				const cell = row[x];
				
				if (cell) {
					// Generate a position key for this cell
					const posKey = `${x},${z}`;
					
					// Check if a cell at this position already has an ID
					let cellId = cellIdMap.get(posKey);
					
					if (!cellId) {
						// If no ID exists for this position, generate a new one
						cellId = this.generateCellId();
						cellIdMap.set(posKey, cellId);
					}
					
					// Add the ID to the cell
					if (typeof cell === 'object') {
						boardWithIds[z][x] = { ...cell, id: cellId };
					} else {
						// For primitive values, create an object
						boardWithIds[z][x] = { value: cell, id: cellId };
					}
				} else {
					// Keep empty cells as they are
					boardWithIds[z][x] = null;
				}
			}
		}
		
		return boardWithIds;
	}
	
	/**
	 * Get incremental changes between an old and new board
	 * @param {string} gameId - The game ID
	 * @param {Array} newBoard - The new board state
	 * @returns {Object} Object containing changes and the full board
	 */
	getIncrementalChanges(gameId, newBoard) {
		if (!newBoard || !Array.isArray(newBoard)) {
			return { board: newBoard, changes: [] };
		}
		
		// Process the board to ensure it has IDs
		const boardWithIds = this.prepareBoard(gameId, newBoard);
		
		// Get the previous board state
		const lastBoard = this.lastBoardStates.get(gameId) || [];
		
		// Calculate changes
		const changes = [];
		let boardSizeChanged = false;
		
		// Check if board dimensions have changed
		if (lastBoard.length !== boardWithIds.length) {
			boardSizeChanged = true;
			console.log(`Board height changed from ${lastBoard.length} to ${boardWithIds.length}`);
		} else if (boardWithIds.length > 0) {
			const maxWidthOld = Math.max(...lastBoard.map(row => row ? row.length : 0));
			const maxWidthNew = Math.max(...boardWithIds.map(row => row ? row.length : 0));
			
			if (maxWidthOld !== maxWidthNew) {
				boardSizeChanged = true;
				console.log(`Board width changed from ${maxWidthOld} to ${maxWidthNew}`);
			}
		}
		
		// If board size changed, we need a full update
		if (boardSizeChanged) {
			// Save the new board state
			this.lastBoardStates.set(gameId, JSON.parse(JSON.stringify(boardWithIds)));
			
			// Log the full board dimensions being sent
			console.log(`Sending full board update with dimensions: ${boardWithIds.length}x${boardWithIds[0]?.length || 0}`);
			
			// Return the full board
			return { board: boardWithIds, changes: [], fullUpdate: true };
		}
		
		// Compare cells to find changes
		for (let z = 0; z < boardWithIds.length; z++) {
			const newRow = boardWithIds[z];
			if (!newRow) continue;
			
			for (let x = 0; x < newRow.length; x++) {
				const newCell = newRow[x];
				
				// Get the old cell (if exists)
				const oldCell = lastBoard[z] && lastBoard[z][x];
				
				// Check if cell has changed
				if (this.hasCellChanged(oldCell, newCell)) {
					// Add to changes list
					changes.push({
						x, 
						z, 
						value: newCell,
						id: newCell ? newCell.id : null,
						previousValue: oldCell
					});
				}
			}
		}
		
		// Save the new board state
		this.lastBoardStates.set(gameId, JSON.parse(JSON.stringify(boardWithIds)));
		
		return { 
			board: boardWithIds, 
			changes,
			fullUpdate: false
		};
	}
	
	/**
	 * Check if a cell has changed
	 * @param {*} oldCell - The previous cell state
	 * @param {*} newCell - The new cell state
	 * @returns {boolean} True if the cell has changed
	 */
	hasCellChanged(oldCell, newCell) {
		// If both are null/undefined, no change
		if (!oldCell && !newCell) return false;
		
		// If one is null and the other isn't, changed
		if (!oldCell || !newCell) return true;
		
		// If both are primitive values, compare directly
		if (typeof oldCell !== 'object' && typeof newCell !== 'object') {
			return oldCell !== newCell;
		}
		
		// If one is an object and the other isn't, changed
		if (typeof oldCell !== 'object' || typeof newCell !== 'object') {
			return true;
		}
		
		// Compare object properties (excluding id)
		const oldKeys = Object.keys(oldCell).filter(k => k !== 'id');
		const newKeys = Object.keys(newCell).filter(k => k !== 'id');
		
		// Different number of properties means changed
		if (oldKeys.length !== newKeys.length) return true;
		
		// Check if any property has changed
		for (const key of oldKeys) {
			if (key === 'id') continue; // Skip ID comparison
			
			if (!newKeys.includes(key) || oldCell[key] !== newCell[key]) {
				return true;
			}
		}
		
		return false;
	}
	
	/**
	 * Clear stored board state for a game (use when game is over)
	 * @param {string} gameId - The game ID
	 */
	clearGameState(gameId) {
		this.lastBoardStates.delete(gameId);
		this.cellIds.delete(gameId);
	}
}

module.exports = new BoardUpdater(); 