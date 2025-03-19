/**
 * Utility functions for game-related calculations and operations
 */
export default {
	/**
	 * Check if coordinates are within the board boundaries
	 * @param {number} x - X coordinate
	 * @param {number} y - Y coordinate
	 * @param {number} z - Z coordinate
	 * @param {object} boardDimensions - Board dimensions object
	 * @returns {boolean} - Whether coordinates are valid
	 */
	isValidCoordinate(x, y, z, boardDimensions = { width: 8, height: 8, depth: 2 }) {
		return (
			x >= 0 && x < boardDimensions.width &&
			y >= 0 && y < boardDimensions.height &&
			z >= 0 && z < boardDimensions.depth
		);
	},

	/**
	 * Get cell color based on position and homeZones
	 * @param {number} x - X coordinate
	 * @param {number} y - Y coordinate
	 * @param {Array} homeZones - Array of home zone objects
	 * @returns {string} - Color string
	 */
	getCellColor(x, y, homeZones = []) {
		// Check if cell is in a home zone
		for (const zone of homeZones) {
			if (
				x >= zone.startX && x <= zone.endX &&
				y >= zone.startY && y <= zone.endY
			) {
				return zone.color;
			}
		}
		
		// Default chess board pattern
		return (x + y) % 2 === 0 ? '#EADDCA' : '#703E21';
	},

	/**
	 * Check if a cell is occupied
	 * @param {number} x - X coordinate
	 * @param {number} y - Y coordinate
	 * @param {number} z - Z coordinate
	 * @param {Array} cells - Array of cell objects
	 * @returns {boolean} - Whether cell is occupied
	 */
	isCellOccupied(x, y, z, cells = []) {
		return cells.some(cell => cell.x === x && cell.y === y && cell.z === z);
	},

	/**
	 * Get piece at specified coordinates
	 * @param {number} x - X coordinate
	 * @param {number} y - Y coordinate
	 * @param {Array} pieces - Array of piece objects
	 * @returns {object|null} - Piece object or null if not found
	 */
	getPieceAt(x, y, pieces = []) {
		return pieces.find(piece => piece.x === x && piece.y === y) || null;
	},

	/**
	 * Check if a tetromino placement is valid
	 * @param {object} tetromino - Tetromino object
	 * @param {number} posX - X position
	 * @param {number} posY - Y position
	 * @param {number} rotation - Rotation index
	 * @param {Array} cells - Array of cell objects
	 * @param {object} boardDimensions - Board dimensions
	 * @returns {boolean} - Whether placement is valid
	 */
	isValidTetrominoPlacement(tetromino, posX, posY, rotation, cells, boardDimensions) {
		if (!tetromino || !tetromino.shapes) {
			return false;
		}

		const shape = tetromino.shapes[rotation % tetromino.shapes.length];
		
		for (let y = 0; y < shape.length; y++) {
			for (let x = 0; x < shape[y].length; x++) {
				if (shape[y][x]) {
					const worldX = posX + x;
					const worldY = posY + y;
					
					// Check boundaries
					if (!this.isValidCoordinate(worldX, worldY, 0, boardDimensions)) {
						return false;
					}
					
					// Check for collision at Z=0
					if (this.isCellOccupied(worldX, worldY, 0, cells)) {
						return false;
					}
				}
			}
		}
		
		return true;
	},

	/**
	 * Generate tetromino cells from shape and position
	 * @param {object} tetromino - Tetromino object
	 * @param {number} posX - X position
	 * @param {number} posY - Y position
	 * @param {number} posZ - Z position
	 * @param {number} rotation - Rotation index
	 * @returns {Array} - Array of cell objects
	 */
	generateTetrominoCells(tetromino, posX, posY, posZ, rotation) {
		const cells = [];
		
		if (!tetromino || !tetromino.shapes) {
			return cells;
		}
		
		const shape = tetromino.shapes[rotation % tetromino.shapes.length];
		
		for (let y = 0; y < shape.length; y++) {
			for (let x = 0; x < shape[y].length; x++) {
				if (shape[y][x]) {
					cells.push({
						x: posX + x,
						y: posY + y,
						z: posZ,
						type: 'tetromino',
						color: tetromino.color
					});
				}
			}
		}
		
		return cells;
	},

	/**
	 * Check if a chess move is valid
	 * @param {object} piece - Chess piece object
	 * @param {number} toX - Target X coordinate
	 * @param {number} toY - Target Y coordinate
	 * @param {Array} validMoves - Array of valid move objects
	 * @returns {boolean} - Whether move is valid
	 */
	isValidChessMove(piece, toX, toY, validMoves = []) {
		return validMoves.some(move => 
			move.pieceId === piece.id && 
			move.toX === toX && 
			move.toY === toY
		);
	},

	/**
	 * Check if a position is a valid drop target for a chess piece
	 * @param {number} x - X coordinate
	 * @param {number} y - Y coordinate
	 * @param {Array} validMoves - Array of valid move objects
	 * @param {string} pieceId - ID of the piece being moved
	 * @returns {boolean} - Whether position is a valid drop target
	 */
	isValidDropTarget(x, y, validMoves, pieceId) {
		return validMoves.some(move => 
			move.pieceId === pieceId && 
			move.toX === x && 
			move.toY === y
		);
	},

	/**
	 * Check if a row clearing condition is met
	 * @param {Array} cells - Array of cell objects
	 * @param {number} length - Number of cells needed in a line
	 * @returns {Array} - Array of clearing objects
	 */
	checkRowClearing(cells, length = 8) {
		const result = [];
		
		// Only check Z=0 plane
		const cellsAtZ0 = cells.filter(cell => cell.z === 0);
		
		// Helper to check if a cell exists at position
		const cellExistsAt = (x, y) => cellsAtZ0.some(cell => cell.x === x && cell.y === y);
		
		// Check horizontal rows
		for (let y = 0; y < 8; y++) {
			let count = 0;
			for (let x = 0; x < 8; x++) {
				if (cellExistsAt(x, y)) {
					count++;
				}
			}
			if (count >= length) {
				result.push({
					direction: 'horizontal',
					position: y,
					cells: Array.from({ length: 8 }, (_, i) => ({ x: i, y }))
				});
			}
		}
		
		// Check vertical columns
		for (let x = 0; x < 8; x++) {
			let count = 0;
			for (let y = 0; y < 8; y++) {
				if (cellExistsAt(x, y)) {
					count++;
				}
			}
			if (count >= length) {
				result.push({
					direction: 'vertical',
					position: x,
					cells: Array.from({ length: 8 }, (_, i) => ({ x, y: i }))
				});
			}
		}
		
		// Check diagonal (top-left to bottom-right)
		let countDiag1 = 0;
		for (let i = 0; i < 8; i++) {
			if (cellExistsAt(i, i)) {
				countDiag1++;
			}
		}
		if (countDiag1 >= length) {
			result.push({
				direction: 'diagonal',
				position: 'main',
				cells: Array.from({ length: 8 }, (_, i) => ({ x: i, y: i }))
			});
		}
		
		// Check diagonal (top-right to bottom-left)
		let countDiag2 = 0;
		for (let i = 0; i < 8; i++) {
			if (cellExistsAt(7 - i, i)) {
				countDiag2++;
			}
		}
		if (countDiag2 >= length) {
			result.push({
				direction: 'diagonal',
				position: 'anti',
				cells: Array.from({ length: 8 }, (_, i) => ({ x: 7 - i, y: i }))
			});
		}
		
		return result;
	},

	/**
	 * Calculate the display coordinates for a game board cell
	 * @param {number} x - Grid X coordinate 
	 * @param {number} y - Grid Y coordinate
	 * @param {number} z - Grid Z coordinate
	 * @param {object} options - Display options
	 * @returns {object} - 3D display coordinates
	 */
	calculateCellDisplayPosition(x, y, z, options = {}) {
		const {
			cellSize = 1,
			boardWidth = 8,
			boardHeight = 8,
			offsetX = 0,
			offsetY = 0,
			offsetZ = 0
		} = options;
		
		// Center the board
		const centerOffsetX = (boardWidth * cellSize) / 2;
		const centerOffsetY = (boardHeight * cellSize) / 2;
		
		return {
			x: (x * cellSize) - centerOffsetX + offsetX,
			y: (z * cellSize) + offsetZ,
			z: (y * cellSize) - centerOffsetY + offsetY
		};
	},

	/**
	 * Check if a pawn is eligible for promotion
	 * @param {object} piece - Chess piece object
	 * @param {number} moveCount - Number of moves made by the pawn
	 * @returns {boolean} - Whether pawn is eligible for promotion
	 */
	isPawnPromotionEligible(piece, moveCount) {
		return piece.type === 'pawn' && moveCount >= 8;
	},

	/**
	 * Get available promotion options for a pawn
	 * @returns {Array} - Array of promotion options
	 */
	getPawnPromotionOptions() {
		return [
			{ type: 'queen', label: 'Queen' },
			{ type: 'rook', label: 'Rook' },
			{ type: 'bishop', label: 'Bishop' },
			{ type: 'knight', label: 'Knight' }
		];
	},

	/**
	 * Get the minimum turn time based on difficulty
	 * @param {string} difficulty - Difficulty level
	 * @returns {number} - Minimum turn time in seconds
	 */
	getMinTurnTime(difficulty) {
		const DIFFICULTY_TURN_TIMES = {
			easy: 20,
			medium: 15,
			hard: 10
		};
		
		return DIFFICULTY_TURN_TIMES[difficulty] || 10;
	}
}; 