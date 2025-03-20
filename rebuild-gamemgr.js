const fs = require('fs');
const path = require('path');

// Create a backup first
const filePath = path.join(__dirname, 'server', 'game', 'GameManager.js');
const backupPath = path.join(__dirname, 'server', 'game', 'GameManager.js.backup');
fs.copyFileSync(filePath, backupPath);
console.log('Created backup at ' + backupPath);

// Correct versions of methods
const methodsToAdd = [
  `
	/**
	 * Check if a cell has another cell underneath it
	 * @param {Object} game - The game state
	 * @param {number} x - X coordinate
	 * @param {number} z - Z coordinate
	 * @returns {boolean} True if there's a cell underneath
	 * @private
	 */
	_hasCellUnderneath(game, x, z) {
		const boardSize = game.settings.boardSize;
		
		// Check bounds
		if (x < 0 || x >= boardSize || z < 0 || z >= boardSize) {
			return false;
		}
		
		// Check if there's a cell at this position
		return game.board[z][x] !== null;
	}
  `,
  `
	/**
	 * Place a tetris piece on the board
	 * @param {string} gameId - The ID of the game
	 * @param {string} playerId - The ID of the player
	 * @param {Object} moveData - Data about the move
	 * @returns {Object} Result of the move
	 */
	placeTetrisPiece(gameId, playerId, moveData) {
		try {
			// Get the game state
			const game = this.games.get(gameId);
			if (!game) {
				return {
					success: false,
					error: 'Game ' + gameId + ' not found'
				};
			}
			
			// Check if player exists in the game
			if (!game.players[playerId]) {
				return {
					success: false,
					error: 'Player ' + playerId + ' not found in game ' + gameId
				};
			}
			
			// In asynchronous turns, we don't check if it's the player's turn
			// We only check if the move type is valid
			if (game.players[playerId].currentMoveType !== 'tetromino') {
				return {
					success: false,
					error: 'Expected tetromino move, got ' + game.players[playerId].currentMoveType
				};
			}
			
			// Validate the tetris piece placement
			const { pieceType, rotation, x, z, y = 0 } = moveData;
			
			// Check if the piece type is valid
			if (!this._isValidTetrisPiece(pieceType)) {
				return {
					success: false,
					error: 'Invalid tetris piece type: ' + pieceType
				};
			}
			
			// Get the tetris piece shape based on type and rotation
			const pieceShape = this._getTetrisPieceShape(pieceType, rotation);
			
			// Check minimum move time
			const timeSinceLastMove = Date.now() - (game.players[playerId].lastMoveTime || 0);
			const minMoveInterval = game.players[playerId].minMoveInterval || 10000; // Default 10 seconds
			
			if (timeSinceLastMove < minMoveInterval) {
				return {
					success: false,
					error: 'Must wait ' + ((minMoveInterval - timeSinceLastMove) / 1000) + ' more seconds',
					waitTime: minMoveInterval - timeSinceLastMove
				};
			}
			
			// Check if the piece can be placed at the specified position with Y-axis logic
			if (!this._canPlaceTetromino(game, pieceShape, x, z, y, playerId)) {
				// If at Y=1 and the tetromino can't be placed, it explodes to nothing
				if (y === 1) {
					// No actual placement occurs - tetromino explodes
					// We still consider this a successful move as it's a valid game action
					
					// Update the last move time
					game.players[playerId].lastMoveTime = Date.now();
					
					// If player has no valid chess moves, keep move type as tetromino
					if (this.hasValidChessMoves(gameId, playerId)) {
						game.players[playerId].currentMoveType = 'chess';
					} else {
						game.players[playerId].currentMoveType = 'tetromino';
					}
					
					return {
						success: true,
						message: 'Tetromino exploded at Y=1',
						exploded: true
					};
				}
				
				// If at Y=0 and has no valid connection, it can't be placed
				return {
					success: false,
					error: 'Cannot place tetris piece at position (' + x + ', ' + z + ', ' + y + ')'
				};
			}
			
			// Place the tetris piece at Y=0 (only possible placement)
			this._placeTetromino(game, pieceShape, x, z, playerId);
			
			// Store the placement position for future movement limit checks
			game.players[playerId].lastTetrominoPlacement = { x, z };
			
			// Update the last move time
			game.players[playerId].lastMoveTime = Date.now();
			
			// Check for completed rows
			const completedRows = this._checkAndClearRows(game);
			
			// Update the player's move type for next turn
			// Check if the player has any valid chess moves
			if (this.hasValidChessMoves(gameId, playerId)) {
				game.players[playerId].currentMoveType = 'chess';
			} else {
				// If no valid chess moves, keep the move type as tetromino
				game.players[playerId].currentMoveType = 'tetromino';
			}
			
			// Update the last updated timestamp
			game.lastUpdate = Date.now();
			
			return {
				success: true,
				completedRows: completedRows.length
			};
		} catch (error) {
			console.error('Error placing tetris piece:', error);
			return {
				success: false,
				error: error.message
			};
		}
	}
  `,
  `
}

// Export the GameManager class
module.exports = GameManager;
  `
];

// Read the file
let content = fs.readFileSync(filePath, 'utf8');

// Find where things are broken at the end of the file
const closingBraceIndex = content.lastIndexOf('_hasCellUnderneath');
if (closingBraceIndex === -1) {
  console.error('Could not find the _hasCellUnderneath method. Aborting.');
  process.exit(1);
}

// Get everything up to that point
content = content.substring(0, closingBraceIndex);

// Add our methods
for (const method of methodsToAdd) {
  content += method;
}

// Write the fixed file
fs.writeFileSync(filePath, content);
console.log('Successfully fixed the GameManager.js file'); 