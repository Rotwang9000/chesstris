/**
 * ChessManager.js - Manages chess piece movement, validation, and related logic
 * This module contains functionality for chess operations in the XZ-Y coordinate system
 */

const { CHESS_PIECE_POSITIONS, PIECE_PRICES, GAME_RULES } = require('./Constants');
const { log } = require('./GameUtilities');

class ChessManager {
	constructor(boardManager, islandManager) {
		this.boardManager = boardManager;
		this.islandManager = islandManager;
	}
	
	/**
	 * Initialize chess pieces for a player
	 * @param {Object} game - The game object
	 * @param {string} playerId - The player's ID
	 * @param {Object} homeZone - The home zone coordinates
	 * @returns {Array} The initialized chess pieces
	 */
	initializeChessPieces(game, playerId, homeZone) {
		const pieces = [];
		const playerColor = game.players[playerId].color;
		
		// Determine if this is a horizontal or vertical home zone
		const isHorizontal = homeZone.width === 8 && homeZone.height === 2;
		
		// Initialize pieces based on home zone orientation
		if (isHorizontal) {
			// Horizontal home zone (8x2)
			// Place pieces in traditional chess order: Rook, Knight, Bishop, Queen, King, Bishop, Knight, Rook
			const pieceOrder = ['ROOK', 'KNIGHT', 'BISHOP', 'QUEEN', 'KING', 'BISHOP', 'KNIGHT', 'ROOK'];
			
			// Place back row pieces (row 0)
			for (let i = 0; i < pieceOrder.length; i++) {
				const x = homeZone.x + i;
				const z = homeZone.z;
				const pieceType = pieceOrder[i];
				
				// Create the chess piece
				const piece = {
					id: `${playerId}-${pieceType}-${Date.now()}-${pieces.length}`,
					type: pieceType,
					player: playerId,
					position: { x, z },
					color: playerColor,
					hasMoved: false
				};
				
				pieces.push(piece);
				
				// Create chess cell object
				const chessPieceObj = {
					type: 'chess',
					pieceType: pieceType.toLowerCase(),
					player: playerId,
					color: playerColor,
					pieceId: piece.id
				};
				
				// Create home zone marker
				const homeZoneObj = {
					type: 'home',
					player: playerId,
					color: playerColor
				};
				
				// Add both objects to the cell
				this.boardManager.setCell(game.board, x, z, [homeZoneObj, chessPieceObj]);
			}
			
			// Place pawns in the second row (row 1)
			for (let i = 0; i < 8; i++) {
				const x = homeZone.x + i;
				const z = homeZone.z + 1;
				const pieceType = 'PAWN';
				
				// Create the pawn
				const piece = {
					id: `${playerId}-${pieceType}-${Date.now()}-${pieces.length}`,
					type: pieceType,
					player: playerId,
					position: { x, z },
					color: playerColor,
					hasMoved: false
				};
				
				pieces.push(piece);
				
				// Create chess cell object
				const chessPieceObj = {
					type: 'chess',
					pieceType: pieceType.toLowerCase(),
					player: playerId,
					color: playerColor,
					pieceId: piece.id
				};
				
				// Create home zone marker
				const homeZoneObj = {
					type: 'home',
					player: playerId,
					color: playerColor
				};
				
				// Add both objects to the cell
				this.boardManager.setCell(game.board, x, z, [homeZoneObj, chessPieceObj]);
			}
		} else {
			// Vertical home zone (2x8)
			// Place pieces in a vertical arrangement
			const pieceOrder = ['ROOK', 'KNIGHT', 'BISHOP', 'QUEEN', 'KING', 'BISHOP', 'KNIGHT', 'ROOK'];
			
			// Place main column pieces (column 0)
			for (let i = 0; i < pieceOrder.length; i++) {
				const x = homeZone.x;
				const z = homeZone.z + i;
				const pieceType = pieceOrder[i];
				
				// Create the chess piece
				const piece = {
					id: `${playerId}-${pieceType}-${Date.now()}-${pieces.length}`,
					type: pieceType,
					player: playerId,
					position: { x, z },
					color: playerColor,
					hasMoved: false
				};
				
				pieces.push(piece);
				
				// Create chess cell object
				const chessPieceObj = {
					type: 'chess',
					pieceType: pieceType.toLowerCase(),
					player: playerId,
					color: playerColor,
					pieceId: piece.id
				};
				
				// Create home zone marker
				const homeZoneObj = {
					type: 'home',
					player: playerId,
					color: playerColor
				};
				
				// Add both objects to the cell
				this.boardManager.setCell(game.board, x, z, [homeZoneObj, chessPieceObj]);
			}
			
			// Place pawns in the second column (column 1)
			for (let i = 0; i < 8; i++) {
				const x = homeZone.x + 1;
				const z = homeZone.z + i;
				const pieceType = 'PAWN';
				
				// Create the pawn
				const piece = {
					id: `${playerId}-${pieceType}-${Date.now()}-${pieces.length}`,
					type: pieceType,
					player: playerId,
					position: { x, z },
					color: playerColor,
					hasMoved: false
				};
				
				pieces.push(piece);
				
				// Create chess cell object
				const chessPieceObj = {
					type: 'chess',
					pieceType: pieceType.toLowerCase(),
					player: playerId,
					color: playerColor,
					pieceId: piece.id
				};
				
				// Create home zone marker
				const homeZoneObj = {
					type: 'home',
					player: playerId,
					color: playerColor
				};
				
				// Add both objects to the cell
				this.boardManager.setCell(game.board, x, z, [homeZoneObj, chessPieceObj]);
			}
		}
		
		return pieces;
	}
	
	/**
	 * Validate and process chess piece purchase
	 * @param {Object} game - The game object
	 * @param {string} playerId - The player's ID
	 * @param {Object} purchaseData - Data about the purchase
	 * @returns {Object} Result of the purchase
	 */
	processPiecePurchase(game, playerId, purchaseData) {
		try {
			const { pieceType, x, z } = purchaseData;
			const player = game.players[playerId];
			
			// Check if the piece type is valid
			if (!PIECE_PRICES[pieceType]) {
				return {
					success: false,
					error: `Invalid piece type: ${pieceType}`
				};
			}
			
			// Check if the player has enough funds
			const price = PIECE_PRICES[pieceType];
			if (player.balance < price) {
				return {
					success: false,
					error: `Insufficient funds to purchase ${pieceType}. Required: ${price}, Available: ${player.balance}`
				};
			}
			
			// Check if the position is occupied using our sparse board structure
			if (this.boardManager.getCell(game.board, x, z) !== null) {
				return {
					success: false,
					error: `Position (${x}, ${z}) is already occupied`
				};
			}
			
			// Check if the position is in a safe home zone
			if (this.boardManager.isCellInSafeHomeZone(game, x, z)) {
				// Allow placing in any home zone that has at least one piece
				// Further validation may be needed
			} else {
				// For positions outside the home zone, check for adjacent cells
				const adjacentResult = this._hasAdjacentCell(game, x, z, playerId);
				if (!adjacentResult.hasAdjacent) {
					return {
						success: false,
						error: `Position (${x}, ${z}) is not adjacent to any of your cells`
					};
				}
				
				// Check if there's a path to the king
				if (!this.islandManager.hasPathToKing(game, adjacentResult.x, adjacentResult.z, playerId)) {
					return {
						success: false,
						error: `No valid path to your king from position (${x}, ${z})`
					};
				}
			}
			
			// Deduct the price from the player's balance
			player.balance -= price;
			
			// Create the chess piece
			const piece = {
				id: `${playerId}-${pieceType}-${Date.now()}`,
				type: pieceType,
				player: playerId,
				position: { x, z },
				color: player.color,
				hasMoved: false
			};
			
			// Add the piece to the game
			game.chessPieces.push(piece);
			
			// Mark the cell as occupied using our sparse board structure
			this.boardManager.setCell(game.board, x, z, {
				type: 'chess',
				player: playerId,
				chessPiece: piece,
				color: player.color
			});
			
			log(`Player ${playerId} purchased ${pieceType} at (${x}, ${z})`);
			
			return {
				success: true,
				piece,
				newBalance: player.balance
			};
		} catch (error) {
			log(`Error processing piece purchase: ${error.message}`);
			return {
				success: false,
				error: error.message
			};
		}
	}
	
	/**
	 * Check if a cell has an adjacent cell that belongs to the player
	 * @param {Object} game - The game object
	 * @param {number} x - X coordinate
	 * @param {number} z - Z coordinate
	 * @param {string} playerId - The player's ID
	 * @returns {Object} Result of the check
	 * @private
	 */
	_hasAdjacentCell(game, x, z, playerId) {
		// Check all adjacent cells (including diagonals)
		const directions = [
			{ x: 0, z: -1 },  // North
			{ x: 1, z: -1 },  // Northeast
			{ x: 1, z: 0 },   // East
			{ x: 1, z: 1 },   // Southeast
			{ x: 0, z: 1 },   // South
			{ x: -1, z: 1 },  // Southwest
			{ x: -1, z: 0 },  // West
			{ x: -1, z: -1 }  // Northwest
		];
		
		for (const dir of directions) {
			const pos = {
				x: x + dir.x,
				z: z + dir.z
			};
			
			// Check if there's a cell at this position using the sparse board structure
			const cell = this.boardManager.getCell(game.board, pos.x, pos.z);
			if (cell !== null && cell.player === playerId) {
				return {
					hasAdjacent: true,
					x: pos.x,
					z: pos.z
				};
			}
		}
		
		return { hasAdjacent: false };
	}
	
	/**
	 * Validate a chess piece move
	 * @param {Object} game - The game object
	 * @param {string} playerId - The player's ID
	 * @param {Object} moveData - Data about the move
	 * @returns {Object} Result of the validation
	 */
	validateChessMove(game, playerId, moveData) {
		try {
			const { pieceId, toX, toZ } = moveData;
			
			// Find the piece
			const piece = game.chessPieces.find(p => p.id === pieceId);
			if (!piece) {
				return {
					valid: false,
					error: `Chess piece with ID ${pieceId} not found`
				};
			}
			
			// Verify ownership
			if (piece.player !== playerId) {
				return {
					valid: false,
					error: 'You do not own this chess piece'
				};
			}
			
			// Get piece's current position
			const fromX = piece.position.x;
			const fromZ = piece.position.z;
			
			// Check if trying to move to the same position
			if (fromX === toX && fromZ === toZ) {
				return {
					valid: false,
					error: 'Cannot move to the same position'
				};
			}
			
			// Check if the destination has a piece of the same player
			const targetCell = this.boardManager.getCell(game.board, toX, toZ);
			if (targetCell && targetCell.player === playerId) {
				return {
					valid: false,
					error: 'Cannot capture your own piece'
				};
			}
			
			// Validate move based on piece type
			const typeValidation = this._validateMoveByPieceType(game, piece, toX, toZ);
			if (!typeValidation.valid) {
				return typeValidation;
			}
			
			// Check for path obstructions (except knights which can jump)
			if (piece.type !== 'KNIGHT') {
				const pathValidation = this._checkPathObstruction(game, piece, toX, toZ);
				if (!pathValidation.valid) {
					return pathValidation;
				}
			}
			
			// Move is valid
			return {
				valid: true,
				piece,
				fromX,
				fromZ,
				toX,
				toZ,
				targetCell
			};
		} catch (error) {
			log(`Error validating chess move: ${error.message}`);
			return {
				valid: false,
				error: error.message
			};
		}
	}
	
	/**
	 * Validate a move based on the chess piece type
	 * @param {Object} game - The game object
	 * @param {Object} piece - The chess piece
	 * @param {number} toX - Destination X coordinate
	 * @param {number} toZ - Destination Z coordinate
	 * @returns {Object} Result of the validation
	 * @private
	 */
	_validateMoveByPieceType(game, piece, toX, toZ) {
		const fromX = piece.position.x;
		const fromZ = piece.position.z;
		const type = piece.type.toLowerCase();
		
		// Calculate the absolute differences in coordinates
		const deltaX = Math.abs(toX - fromX);
		const deltaZ = Math.abs(toZ - fromZ);
		
		switch (type) {
			case 'pawn': {
				// Pawns move forward one step, or two on first move
				const direction = 1; // Assumes pawns always move in positive Z direction
				
				// Normal forward move (one step)
				if (fromX === toX && toZ - fromZ === direction) {
					// Check if destination is empty
					if (this.boardManager.getCell(game.board, toX, toZ) === null) {
						return { valid: true };
					}
					return { valid: false, error: 'Pawn cannot move forward into an occupied cell' };
				}
				
				// First move (can be two steps)
				if (!piece.hasMoved && fromX === toX && toZ - fromZ === 2 * direction) {
					// Check if both the destination and the cell in between are empty
					const middleZ = fromZ + direction;
					if (this.boardManager.getCell(game.board, toX, middleZ) === null && 
						this.boardManager.getCell(game.board, toX, toZ) === null) {
						return { valid: true };
					}
					return { valid: false, error: 'Pawn cannot jump over pieces' };
				}
				
				// Diagonal capture
				if (deltaX === 1 && toZ - fromZ === direction) {
					// Check if there is an opponent's piece to capture
					const targetCell = this.boardManager.getCell(game.board, toX, toZ);
					if (targetCell !== null && targetCell.player !== piece.player) {
						return { valid: true };
					}
					return { valid: false, error: 'Pawn can only move diagonally when capturing' };
				}
				
				return { valid: false, error: 'Invalid pawn move' };
			}
			
			case 'rook': {
				// Rooks move horizontally or vertically
				if (fromX === toX || fromZ === toZ) {
					return { valid: true };
				}
				return { valid: false, error: 'Rooks can only move horizontally or vertically' };
			}
			
			case 'knight': {
				// Knights move in an L-shape (2 in one direction, 1 in perpendicular direction)
				if ((deltaX === 2 && deltaZ === 1) || (deltaX === 1 && deltaZ === 2)) {
					return { valid: true };
				}
				return { valid: false, error: 'Knights can only move in an L-shape' };
			}
			
			case 'bishop': {
				// Bishops move diagonally
				if (deltaX === deltaZ) {
					return { valid: true };
				}
				return { valid: false, error: 'Bishops can only move diagonally' };
			}
			
			case 'queen': {
				// Queens move horizontally, vertically, or diagonally
				if (fromX === toX || fromZ === toZ || deltaX === deltaZ) {
					return { valid: true };
				}
				return { valid: false, error: 'Queens can only move horizontally, vertically, or diagonally' };
			}
			
			case 'king': {
				// Kings move one step in any direction
				if (deltaX <= 1 && deltaZ <= 1) {
					return { valid: true };
				}
				return { valid: false, error: 'Kings can only move one step in any direction' };
			}
			
			default:
				return { valid: false, error: `Unknown piece type: ${type}` };
		}
	}
	
	/**
	 * Check if there are any pieces obstructing the path
	 * @param {Object} game - The game object
	 * @param {Object} piece - The chess piece
	 * @param {number} toX - Destination X coordinate
	 * @param {number} toZ - Destination Z coordinate
	 * @returns {Object} Result of the path check
	 * @private
	 */
	_checkPathObstruction(game, piece, toX, toZ) {
		const fromX = piece.position.x;
		const fromZ = piece.position.z;
		
		// Determine the direction of movement
		const dx = Math.sign(toX - fromX);
		const dz = Math.sign(toZ - fromZ);
		
		// Start from the next position after the piece
		let x = fromX + dx;
		let z = fromZ + dz;
		
		// Check all cells along the path excluding the destination
		while (x !== toX || z !== toZ) {
			if (this.boardManager.getCell(game.board, x, z) !== null) {
				return {
					valid: false,
					error: `Path is obstructed at position (${x}, ${z})`
				};
			}
			
			x += dx;
			z += dz;
		}
		
		return { valid: true };
	}
	
	/**
	 * Execute a validated chess move
	 * @param {Object} game - The game object
	 * @param {string} playerId - The player's ID
	 * @param {Object} moveData - Data about the move
	 * @returns {Object} Result of executing the move
	 */
	executeChessMove(game, playerId, moveData) {
		try {
			// Validate the move first
			const validation = this.validateChessMove(game, playerId, moveData);
			if (!validation.valid) {
				return {
					success: false,
					error: validation.error
				};
			}
			
			const { piece, fromX, fromZ, toX, toZ, targetCell } = validation;
			
			// Check for capture
			let capture = false;
			let capturedPiece = null;
			
			if (targetCell) {
				capture = true;
				
				// Find and remove the captured piece from the chessPieces array
				for (let i = game.chessPieces.length - 1; i >= 0; i--) {
					const p = game.chessPieces[i];
					if (p.position.x === toX && p.position.z === toZ) {
						capturedPiece = p;
						
						// Record capture
						log(`${piece.type} captures ${p.type} at (${toX}, ${toZ})`);
						
						// Remove the captured piece
						game.chessPieces.splice(i, 1);
						
						// Check if the captured piece is a king
						if (p.type === 'KING') {
							// Handle king capture (may trigger game over)
							this._handleKingCapture(game, p.player);
						}
						
						break;
					}
				}
			}
			
			// Clear the original cell
			delete game.board.cells[`${fromX},${fromZ}`];
			
			// Update the piece position
			piece.position.x = toX;
			piece.position.z = toZ;
			piece.hasMoved = true;
			
			// Mark the new cell as occupied
			this.boardManager.setCell(game.board, toX, toZ, {
				type: 'chess',
				player: playerId,
				chessPiece: piece,
				color: game.players[playerId].color
			});
			
			// Check for pawn promotion
			this._checkPawnPromotion(game, piece);
			
			// Update island connectivity after the move
			this.islandManager.checkForIslandsAfterRowClear(game);
			
			return {
				success: true,
				piece,
				capture,
				capturedPiece
			};
		} catch (error) {
			log(`Error executing chess move: ${error.message}`);
			return {
				success: false,
				error: error.message
			};
		}
	}
	
	/**
	 * Handle king capture
	 * @param {Object} game - The game object
	 * @param {string} playerId - The player who lost their king
	 * @private
	 */
	_handleKingCapture(game, playerId) {
		log(`Player ${playerId} lost their king!`);
		
		// Mark the player as eliminated
		game.players[playerId].eliminated = true;
		game.players[playerId].eliminatedAt = Date.now();
		
		// Check if only one player remains
		const remainingPlayers = Object.values(game.players)
			.filter(p => !p.eliminated && !p.isObserver);
		
		if (remainingPlayers.length === 1) {
			// Game over, declare the remaining player as the winner
			game.status = 'completed';
			game.winnerId = remainingPlayers[0].id;
			game.completedAt = Date.now();
			log(`Game over! Player ${game.winnerId} wins!`);
		}
	}
	
	/**
	 * Check for pawn promotion
	 * @param {Object} game - The game object
	 * @param {Object} piece - The chess piece (pawn)
	 * @private
	 */
	_checkPawnPromotion(game, piece) {
		// Check if the pawn has reached the promotion rank
		// Use the board's max Z coordinate for promotion rank
		const promotionRank = game.board.maxZ;
		
		if (piece.type === 'PAWN' && piece.position.z === promotionRank) {
			// Promote the pawn to a queen (or other piece based on game rules)
			const promotionPiece = GAME_RULES.PAWN_PROMOTION_PIECE || 'QUEEN';
			
			// Update the piece type
			piece.type = promotionPiece;
			
			// Update the cell to reflect the new piece type
			const cell = this.boardManager.getCell(game.board, piece.position.x, piece.position.z);
			if (cell) {
				cell.chessPiece.type = promotionPiece;
			}
			
			log(`Pawn promoted to ${promotionPiece} at (${piece.position.x}, ${piece.position.z})`);
		}
	}
	
	/**
	 * Process a chess piece move from the client
	 * @param {Object} game - The game object
	 * @param {string} playerId - The player's ID
	 * @param {Object} moveData - Data about the move
	 * @returns {Object} Result of the move
	 */
	processChessMove(game, playerId, moveData) {
		// Execute the move
		return this.executeChessMove(game, playerId, moveData);
	}
	
	/**
	 * Check if a player has any valid chess moves available
	 * @param {Object} game - The game object
	 * @param {string} playerId - The player's ID
	 * @returns {boolean} True if the player has at least one valid move
	 */
	hasValidChessMoves(game, playerId) {
		try {
			// Get all chess pieces for the player
			const playerPieces = game.chessPieces.filter(piece => piece.player === playerId);
			
			// If the player has no pieces, they have no valid moves
			if (!playerPieces.length) {
				log(`Player ${playerId} has no chess pieces`);
				return false;
			}
			
			// Check each piece for valid moves
			for (const piece of playerPieces) {
				// Get the board boundaries from our sparse structure
				const minX = game.board.minX;
				const maxX = game.board.maxX;
				const minZ = game.board.minZ;
				const maxZ = game.board.maxZ;
				
				// Loop through all positions within the board boundaries
				for (let z = minZ; z <= maxZ; z++) {
					for (let x = minX; x <= maxX; x++) {
						// Skip the piece's current position
						if (piece.position.x === x && piece.position.z === z) continue;
						
						// Check if the move would be valid for this piece type
						const moveValidation = this._validateMoveByPieceType(game, piece, x, z);
						if (!moveValidation.valid) continue;
						
						// Check for path obstruction if needed (except for knights which can jump)
						if (piece.type !== 'KNIGHT') {
							const pathValidation = this._checkPathObstruction(game, piece, x, z);
							if (!pathValidation.valid) continue;
						}
						
						// Check if the destination contains a friendly piece
						const targetCell = this.boardManager.getCell(game.board, x, z);
						if (targetCell && targetCell.player === playerId) continue;
						
						// This position is a valid move
						log(`Player ${playerId} has valid move: ${piece.type} at (${piece.position.x}, ${piece.position.z}) to (${x}, ${z})`);
						return true;
					}
				}
			}
			
			// If we got here, no valid moves were found
			log(`Player ${playerId} has no valid chess moves available`);
			return false;
		} catch (error) {
			log(`Error checking for valid chess moves: ${error.message}`);
			// Default to true to be safe (don't automatically skip turns on error)
			return true;
		}
	}
}

module.exports = ChessManager; 