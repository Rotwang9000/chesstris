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
		
		// Initialize chess pieces based on predefined positions
		for (const [pieceType, positions] of Object.entries(CHESS_PIECE_POSITIONS)) {
			for (const position of positions) {
				// Calculate piece position relative to home zone
				const x = homeZone.x + position.xOffset;
				const z = homeZone.z + position.zOffset;
				
				// Make sure the position is within bounds
				if (x >= 0 && x < game.board[0].length && z >= 0 && z < game.board.length) {
					// Create the chess piece
					const piece = {
						id: `${playerId}-${pieceType}-${Date.now()}-${pieces.length}`,
						type: pieceType,
						player: playerId,
						x,
						z,
						color: playerColor,
						hasMoved: false
					};
					
					pieces.push(piece);
					
					// Mark the cell as occupied
					game.board[z][x] = {
						type: 'chess',
						player: playerId,
						color: playerColor,
						pieceType,
						placedAt: Date.now()
					};
				}
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
			
			// Check if the position is valid (within bounds)
			if (x < 0 || x >= game.board[0].length || z < 0 || z >= game.board.length) {
				return {
					success: false,
					error: `Position (${x}, ${z}) is out of bounds`
				};
			}
			
			// Check if the position is occupied
			if (game.board[z][x] !== null) {
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
				x,
				z,
				color: player.color,
				hasMoved: false
			};
			
			// Add the piece to the game
			game.chessPieces.push(piece);
			
			// Mark the cell as occupied
			game.board[z][x] = {
				type: 'chess',
				player: playerId,
				color: player.color,
				pieceType,
				placedAt: Date.now()
			};
			
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
	 * Check if a cell has an adjacent cell with a player's ID
	 * @param {Object} game - The game object
	 * @param {number} x - X coordinate
	 * @param {number} z - Z coordinate
	 * @param {string} playerId - The player's ID
	 * @returns {Object} Result with hasAdjacent flag and coordinates
	 * @private
	 */
	_hasAdjacentCell(game, x, z, playerId) {
		// Check adjacent positions in XZ plane
		const adjacentPositions = [
			{ x: x - 1, z },  // left
			{ x: x + 1, z },  // right
			{ x, z: z - 1 },  // forward
			{ x, z: z + 1 }   // backward
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
				
				// Cell must belong to the player
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
			
			// Check if the destination is within bounds
			if (toX < 0 || toX >= game.board[0].length || toZ < 0 || toZ >= game.board.length) {
				return {
					valid: false,
					error: `Destination (${toX}, ${toZ}) is out of bounds`
				};
			}
			
			// Check if the piece is moving to its current position (no move)
			if (piece.x === toX && piece.z === toZ) {
				return {
					valid: false,
					error: 'Piece is already at the destination'
				};
			}
			
			// Get the destination cell
			const destCell = game.board[toZ][toX];
			
			// Check if the destination is occupied by a friendly piece
			if (destCell !== null && destCell.player === playerId) {
				return {
					valid: false,
					error: 'Destination is occupied by your own piece'
				};
			}
			
			// Validate move based on piece type
			const moveValidation = this._validateMoveByPieceType(game, piece, toX, toZ);
			if (!moveValidation.valid) {
				return moveValidation;
			}
			
			// Check for path obstruction for pieces that move in straight lines
			if (['rook', 'bishop', 'queen'].includes(piece.type)) {
				const pathCheck = this._checkPathObstruction(game, piece, toX, toZ);
				if (!pathCheck.valid) {
					return pathCheck;
				}
			}
			
			// If all checks pass, the move is valid
			return {
				valid: true,
				piece,
				capture: destCell !== null
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
	 * Validate a chess piece move based on its type
	 * @param {Object} game - The game object
	 * @param {Object} piece - The chess piece
	 * @param {number} toX - Destination X coordinate
	 * @param {number} toZ - Destination Z coordinate
	 * @returns {Object} Result of the validation
	 * @private
	 */
	_validateMoveByPieceType(game, piece, toX, toZ) {
		const { x: fromX, z: fromZ, type, hasMoved } = piece;
		const deltaX = Math.abs(toX - fromX);
		const deltaZ = Math.abs(toZ - fromZ);
		
		switch (type) {
			case 'pawn': {
				// Pawns move forward one step, capture diagonally
				// Direction depends on the player's orientation
				// For simplicity, assume forward is +z for all players
				const direction = 1; // Forward direction (can be different for different players)
				const expectedZ = fromZ + direction;
				
				// Check for capture (diagonal move)
				if (deltaX === 1 && deltaZ === 1 && toZ === expectedZ) {
					// Diagonal move is only valid for capture
					return game.board[toZ][toX] !== null 
						? { valid: true } 
						: { valid: false, error: 'Pawns can only move diagonally when capturing' };
				}
				
				// Check for forward move (no capture)
				if (deltaX === 0) {
					// Single step forward
					if (toZ === expectedZ && game.board[toZ][toX] === null) {
						return { valid: true };
					}
					
					// Double step from starting position
					if (!hasMoved && toZ === fromZ + 2 * direction) {
						// Check if path is clear
						if (game.board[fromZ + direction][fromX] === null && 
							game.board[toZ][toX] === null) {
							return { valid: true };
						}
					}
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
				// Knights move in an L-shape: 2 in one direction, 1 in the other
				if ((deltaX === 2 && deltaZ === 1) || (deltaX === 1 && deltaZ === 2)) {
					return { valid: true };
				}
				return { valid: false, error: 'Knights must move in an L-shape' };
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
		const { x: fromX, z: fromZ } = piece;
		
		// Determine the direction of movement
		const dx = Math.sign(toX - fromX);
		const dz = Math.sign(toZ - fromZ);
		
		// Start from the next position after the piece
		let x = fromX + dx;
		let z = fromZ + dz;
		
		// Check all cells along the path excluding the destination
		while (x !== toX || z !== toZ) {
			if (game.board[z][x] !== null) {
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
	 * Execute a chess piece move
	 * @param {Object} game - The game object
	 * @param {string} playerId - The player's ID
	 * @param {Object} moveData - Data about the move
	 * @returns {Object} Result of the move execution
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
			
			const { piece, capture } = validation;
			const { pieceId, toX, toZ } = moveData;
			const { x: fromX, z: fromZ } = piece;
			
			// Handle captured pieces
			if (capture) {
				// Get the cell at the destination
				const capturedCell = game.board[toZ][toX];
				
				// Remove any chess piece at the destination
				for (let i = game.chessPieces.length - 1; i >= 0; i--) {
					const p = game.chessPieces[i];
					if (p.x === toX && p.z === toZ) {
						// Record capture
						log(`${piece.type} captures ${p.type} at (${toX}, ${toZ})`);
						
						// Remove the captured piece
						game.chessPieces.splice(i, 1);
						
						// Check if the captured piece is a king
						if (p.type === 'king') {
							// Handle king capture (may trigger game over)
							this._handleKingCapture(game, p.player);
						}
						
						break;
					}
				}
			}
			
			// Clear the original cell
			game.board[fromZ][fromX] = null;
			
			// Update the piece position
			piece.x = toX;
			piece.z = toZ;
			piece.hasMoved = true;
			
			// Mark the new cell as occupied
			game.board[toZ][toX] = {
				type: 'chess',
				player: playerId,
				color: game.players[playerId].color,
				pieceType: piece.type,
				placedAt: Date.now()
			};
			
			// Check for pawn promotion
			if (piece.type === 'pawn') {
				this._checkPawnPromotion(game, piece);
			}
			
			// Update island connectivity after the move
			this.islandManager.checkForIslandsAfterRowClear(game);
			
			return {
				success: true,
				piece,
				capture
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
		// This depends on the player's orientation and the board setup
		// For simplicity, assume promotion rank is the last row of the board
		const promotionRank = game.board.length - 1;
		
		if (piece.type === 'pawn' && piece.z === promotionRank) {
			// Promote the pawn to a queen (or other piece based on game rules)
			const promotionPiece = GAME_RULES.PAWN_PROMOTION_PIECE || 'queen';
			
			// Update the piece type
			piece.type = promotionPiece;
			
			// Update the cell type
			game.board[piece.z][piece.x].pieceType = promotionPiece;
			
			log(`Pawn promoted to ${promotionPiece} at (${piece.x}, ${piece.z})`);
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
				// Check all possible destination positions within range
				const boardWidth = game.board[0].length;
				const boardHeight = game.board.length;
				
				// Loop through all positions on the board
				for (let z = 0; z < boardHeight; z++) {
					for (let x = 0; x < boardWidth; x++) {
						// Skip the piece's current position
						if (piece.x === x && piece.z === z) continue;
						
						// Check if the move would be valid for this piece type
						const moveIsValid = this._validateMoveByPieceType(game, piece, x, z);
						if (!moveIsValid) continue;
						
						// Check for path obstruction if needed
						const pathClear = this._checkPathObstruction(game, piece, x, z);
						if (!pathClear) continue;
						
						// This position is a valid move
						log(`Player ${playerId} has valid move: ${piece.type} at (${piece.x}, ${piece.z}) to (${x}, ${z})`);
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