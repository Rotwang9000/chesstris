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
		
		log(`ChessManager: Initialising chess pieces for player ${playerId} with home zone orientation ${homeZone.orientation}`);
		
		// Determine layout based on orientation (not just dimensions)
		// Horizontal layout for orientation 0 (facing up) and 2 (facing down)
		// Vertical layout for orientation 1 (facing right) and 3 (facing left)
		const isHorizontal = homeZone.orientation === 0 || homeZone.orientation === 2;
		
		// Initialize pieces based on home zone orientation
		if (isHorizontal) {
			// Horizontal home zone for orientation 0 or 2
			// Place pieces in traditional chess order: Rook, Knight, Bishop, Queen, King, Bishop, Knight, Rook
			const pieceOrder = ['ROOK', 'KNIGHT', 'BISHOP', 'QUEEN', 'KING', 'BISHOP', 'KNIGHT', 'ROOK'];
			
			// For orientation 0 (facing up), pieces are at bottom and pawns above
			// For orientation 2 (facing down), pieces are at top and pawns below
			const isBottomOriented = homeZone.orientation === 0;
			
			// Place main row pieces
			for (let i = 0; i < pieceOrder.length; i++) {
				const x = homeZone.x + i;
				const z = isBottomOriented ? homeZone.z : homeZone.z + 1;
				const pieceType = pieceOrder[i];
				
				// Create the chess piece
				const piece = {
					id: `${playerId}-${pieceType}-${Date.now()}-${pieces.length}`,
					type: pieceType,
					player: playerId,
					position: { x, z },
					color: playerColor,
					hasMoved: false,
					moveCount: 0,
					forwardDistance: 0,
					orientation: homeZone.orientation
				};
				
				pieces.push(piece);
				
				// Create chess cell object
				const chessPieceObj = {
					type: 'chess',
					pieceType: pieceType.toLowerCase(),
					player: playerId,
					color: playerColor,
					pieceId: piece.id,
					orientation: homeZone.orientation
				};
				
				// Create home zone marker
				const homeZoneObj = {
					type: 'home',
					player: playerId,
					color: playerColor,
					orientation: homeZone.orientation
				};
				
				// Add both objects to the cell
				this.boardManager.setCell(game.board, x, z, [homeZoneObj, chessPieceObj]);
			}
			
			// Place pawns in the other row
			for (let i = 0; i < 8; i++) {
				const x = homeZone.x + i;
				const z = isBottomOriented ? homeZone.z + 1 : homeZone.z;
				const pieceType = 'PAWN';
				
				// Create the pawn
				const piece = {
					id: `${playerId}-${pieceType}-${Date.now()}-${pieces.length}`,
					type: pieceType,
					player: playerId,
					position: { x, z },
					color: playerColor,
					hasMoved: false,
					moveCount: 0,
					forwardDistance: 0,
					orientation: homeZone.orientation
				};
				
				pieces.push(piece);
				
				// Create chess cell object
				const chessPieceObj = {
					type: 'chess',
					pieceType: pieceType.toLowerCase(),
					player: playerId,
					color: playerColor,
					pieceId: piece.id,
					orientation: homeZone.orientation
				};
				
				// Create home zone marker
				const homeZoneObj = {
					type: 'home',
					player: playerId,
					color: playerColor,
					orientation: homeZone.orientation
				};
				
				// Add both objects to the cell
				this.boardManager.setCell(game.board, x, z, [homeZoneObj, chessPieceObj]);
			}
		} else {
			// Vertical home zone for orientation 1 or 3
			// Place pieces in a vertical arrangement
			const pieceOrder = ['ROOK', 'KNIGHT', 'BISHOP', 'QUEEN', 'KING', 'BISHOP', 'KNIGHT', 'ROOK'];
			
			// For orientation 1 (facing right), pieces are at left and pawns to the right
			// For orientation 3 (facing left), pieces are at right and pawns to the left
			const isLeftOriented = homeZone.orientation === 1;
			
			// Place main column pieces
			for (let i = 0; i < pieceOrder.length; i++) {
				const x = isLeftOriented ? homeZone.x : homeZone.x + 1;
				const z = homeZone.z + i;
				const pieceType = pieceOrder[i];
				
				// Create the chess piece
				const piece = {
					id: `${playerId}-${pieceType}-${Date.now()}-${pieces.length}`,
					type: pieceType,
					player: playerId,
					position: { x, z },
					color: playerColor,
					hasMoved: false,
					moveCount: 0,
					forwardDistance: 0,
					orientation: homeZone.orientation
				};
				
				pieces.push(piece);
				
				// Create chess cell object
				const chessPieceObj = {
					type: 'chess',
					pieceType: pieceType.toLowerCase(),
					player: playerId,
					color: playerColor,
					pieceId: piece.id,
					orientation: homeZone.orientation
				};
				
				// Create home zone marker
				const homeZoneObj = {
					type: 'home',
					player: playerId,
					color: playerColor,
					orientation: homeZone.orientation
				};
				
				// Add both objects to the cell
				this.boardManager.setCell(game.board, x, z, [homeZoneObj, chessPieceObj]);
			}
			
			// Place pawns in the other column
			for (let i = 0; i < 8; i++) {
				const x = isLeftOriented ? homeZone.x + 1 : homeZone.x;
				const z = homeZone.z + i;
				const pieceType = 'PAWN';
				
				// Create the pawn
				const piece = {
					id: `${playerId}-${pieceType}-${Date.now()}-${pieces.length}`,
					type: pieceType,
					player: playerId,
					position: { x, z },
					color: playerColor,
					hasMoved: false,
					moveCount: 0,
					forwardDistance: 0,
					orientation: homeZone.orientation
				};
				
				pieces.push(piece);
				
				// Create chess cell object
				const chessPieceObj = {
					type: 'chess',
					pieceType: pieceType.toLowerCase(),
					player: playerId,
					color: playerColor,
					pieceId: piece.id,
					orientation: homeZone.orientation
				};
				
				// Create home zone marker
				const homeZoneObj = {
					type: 'home',
					player: playerId,
					color: playerColor,
					orientation: homeZone.orientation
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
			if (cell && Array.isArray(cell) && cell.some(item => item && item.player === playerId)) {
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
			
			// Check if the destination has a chess piece of the same player
			const targetCell = this.boardManager.getCell(game.board, toX, toZ);
			if (Array.isArray(targetCell)) {
				const friendlyChess = targetCell.find(item => item && item.type === 'chess' && item.player === playerId);
				if (friendlyChess) {
					return {
						valid: false,
						error: 'Cannot capture your own piece'
					};
				}
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
				targetCell,
				castling: typeValidation.castling || null
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
				const orientation = Number.isFinite(piece.orientation) ? piece.orientation : 0;
				const fwd = (() => {
					switch (orientation) {
						case 0: return { dx: 0, dz: 1 };
						case 2: return { dx: 0, dz: -1 };
						case 1: return { dx: 1, dz: 0 };
						case 3: return { dx: -1, dz: 0 };
						default: return { dx: 0, dz: 1 };
					}
				})();

				const isForwardOne = (toX - fromX === fwd.dx && toZ - fromZ === fwd.dz);
				const isForwardTwo = (!piece.hasMoved &&
					toX - fromX === fwd.dx * 2 && toZ - fromZ === fwd.dz * 2);

				if (isForwardOne) {
					const dest = this.boardManager.getCell(game.board, toX, toZ);
					if (!dest || !Array.isArray(dest) || !dest.some(i => i && i.type === 'chess')) {
						return { valid: true };
					}
					return { valid: false, error: 'Pawn cannot move forward into an occupied cell' };
				}

				if (isForwardTwo) {
					const midX = fromX + fwd.dx;
					const midZ = fromZ + fwd.dz;
					const midCell = this.boardManager.getCell(game.board, midX, midZ);
					const midBlocked = Array.isArray(midCell) && midCell.some(i => i && i.type === 'chess');
					const destCell = this.boardManager.getCell(game.board, toX, toZ);
					const destBlocked = Array.isArray(destCell) && destCell.some(i => i && i.type === 'chess');
					if (!midBlocked && !destBlocked) {
						return { valid: true };
					}
					return { valid: false, error: 'Pawn cannot jump over pieces' };
				}

				// Diagonal capture
				const isDiag = fwd.dx === 0
					? (Math.abs(toX - fromX) === 1 && toZ - fromZ === fwd.dz)
					: (Math.abs(toZ - fromZ) === 1 && toX - fromX === fwd.dx);
				if (isDiag) {
					const targetCell = this.boardManager.getCell(game.board, toX, toZ);
					if (Array.isArray(targetCell)) {
						const enemyChess = targetCell.find(item => item && item.type === 'chess' && item.player !== piece.player);
						if (enemyChess) return { valid: true };
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

				// Castling: king moves exactly 2 squares along the home row
				if (!piece.hasMoved && ((deltaX === 2 && deltaZ === 0) || (deltaX === 0 && deltaZ === 2))) {
					const castleResult = this._validateCastle(game, piece, toX, toZ);
					if (castleResult.valid) {
						return { valid: true, castling: castleResult };
					}
					return castleResult;
				}

				return { valid: false, error: 'Kings can only move one step in any direction (or castle)' };
			}
			
			default:
				return { valid: false, error: `Unknown piece type: ${type}` };
		}
	}

	_validateCastle(game, king, toX, toZ) {
		const fromX = king.position.x;
		const fromZ = king.position.z;
		const dx = Math.sign(toX - fromX);
		const dz = Math.sign(toZ - fromZ);

		// Find a rook belonging to the same player along the castling direction
		let rook = null;
		let searchX = fromX + dx;
		let searchZ = fromZ + dz;
		const maxSearch = 8;
		for (let i = 0; i < maxSearch; i++) {
			const cell = this.boardManager.getCell(game.board, searchX, searchZ);
			if (!cell) break;

			if (Array.isArray(cell)) {
				const chessPiece = cell.find(it => it && it.type === 'chess');
				if (chessPiece) {
					if (chessPiece.pieceType === 'rook' &&
						String(chessPiece.player) === String(king.player)) {
						// Found a friendly rook
						rook = game.chessPieces.find(
							p => p && p.id === chessPiece.pieceId
						);
					}
					break;
				}
			}
			searchX += dx;
			searchZ += dz;
		}

		if (!rook) {
			return { valid: false, error: 'No rook found in that direction for castling' };
		}
		if (rook.hasMoved) {
			return { valid: false, error: 'Rook has already moved' };
		}

		// Ensure all cells between king and rook exist and are free of chess pieces
		let checkX = fromX + dx;
		let checkZ = fromZ + dz;
		while (checkX !== rook.position.x || checkZ !== rook.position.z) {
			const cell = this.boardManager.getCell(game.board, checkX, checkZ);
			if (!cell || (Array.isArray(cell) && cell.length === 0)) {
				return { valid: false, error: 'Gap in board between king and rook' };
			}
			if (Array.isArray(cell) && cell.some(it => it && it.type === 'chess')) {
				return { valid: false, error: 'Piece between king and rook' };
			}
			checkX += dx;
			checkZ += dz;
		}

		// The rook moves to the square the king crossed over
		const rookDestX = fromX + dx;
		const rookDestZ = fromZ + dz;

		return {
			valid: true,
			rookId: rook.id,
			rookFromX: rook.position.x,
			rookFromZ: rook.position.z,
			rookToX: rookDestX,
			rookToZ: rookDestZ
		};
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
		
		// Check all cells along the path excluding the destination — only chess pieces block
		while (x !== toX || z !== toZ) {
			const pathCell = this.boardManager.getCell(game.board, x, z);
			if (Array.isArray(pathCell) && pathCell.some(item => item && item.type === 'chess')) {
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
			
			// Find an enemy chess piece at the target position
			for (let i = game.chessPieces.length - 1; i >= 0; i--) {
				const p = game.chessPieces[i];
				if (!p || !p.position) continue;
				if (p.position.x === toX && p.position.z === toZ && p.player !== playerId) {
					capture = true;
					capturedPiece = p;
					
					log(`${piece.type} captures ${p.type} at (${toX}, ${toZ})`);
					game.chessPieces.splice(i, 1);
					
					if (p.type === 'KING') {
						this._handleKingCapture(game, p.player, playerId);
					}
					break;
				}
			}
			
			// Remove only the chess-piece entry from the source cell — preserve
			// tetromino / home-zone content so the board surface stays intact.
			const fromKey = `${fromX},${fromZ}`;
			const fromCell = game.board.cells[fromKey];
			if (Array.isArray(fromCell)) {
				const remaining = fromCell.filter(
					item => !(item && item.type === 'chess' && String(item.player) === String(playerId))
				);
				if (remaining.length > 0) {
					game.board.cells[fromKey] = remaining;
				} else {
					delete game.board.cells[fromKey];
				}
			} else {
				delete game.board.cells[fromKey];
			}
			
			// Update the piece position
			piece.position.x = toX;
			piece.position.z = toZ;
			piece.hasMoved = true;
			piece.moveCount = (piece.moveCount || 0) + 1;

			// Track net forward distance for pawn promotion
			if (piece.type === 'PAWN') {
				this._updatePawnForwardDistance(piece, fromX, fromZ, toX, toZ);
			}
			
			// If capturing, also strip the captured piece's cell entry at the destination
			if (capture) {
				const destCell = game.board.cells[`${toX},${toZ}`];
				if (Array.isArray(destCell)) {
					game.board.cells[`${toX},${toZ}`] = destCell.filter(
						item => !(item && item.type === 'chess' && String(item.player) !== String(playerId))
					);
				}
			}
			
			// Append the chess-piece marker to the destination cell without
			// destroying existing tetromino / home content.
			this.boardManager.addToCellContents(game.board, toX, toZ, {
				type: 'chess',
				player: playerId,
				chessPiece: piece,
				pieceType: piece.type,
				color: game.players[playerId]?.color
			});
			
			// Handle castling: move the rook as well
			if (validation.castling && validation.castling.rookId) {
				const c = validation.castling;
				const rook = game.chessPieces.find(p => p && p.id === c.rookId);
				if (rook) {
					// Remove rook from old cell
					const rookKey = `${c.rookFromX},${c.rookFromZ}`;
					const rookCell = game.board.cells[rookKey];
					if (Array.isArray(rookCell)) {
						const remaining = rookCell.filter(
							item => !(item && item.type === 'chess' && item.pieceId === c.rookId)
						);
						if (remaining.length > 0) {
							game.board.cells[rookKey] = remaining;
						} else {
							delete game.board.cells[rookKey];
						}
					}

					rook.position.x = c.rookToX;
					rook.position.z = c.rookToZ;
					rook.hasMoved = true;

					this.boardManager.addToCellContents(game.board, c.rookToX, c.rookToZ, {
						type: 'chess',
						player: playerId,
						pieceId: rook.id,
						pieceType: 'rook',
						color: game.players[playerId]?.color
					});
					log(`Castling: rook ${c.rookId} moved to (${c.rookToX}, ${c.rookToZ})`);
				}
			}

			// Check for pawn promotion (returns pending info if eligible)
			const promotionPending = this._checkPawnPromotion(game, piece);
			
			// Update island connectivity after the move
			this.islandManager.checkForIslandsAfterRowClear(game);
			
			return {
				success: true,
				piece,
				capture,
				capturedPiece,
				promotionPending
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
	 * Handle king capture — per the bible:
	 * 1. Non-pawn pieces transfer to the captor.
	 * 2. Pawns become "suicidal" (3 s delay, then one per 0.5 s, destroying cells).
	 * 3. Island decay runs after all suicidal pawns detonate.
	 * 4. Defeated player is eliminated; their territory transfers.
	 * 5. Captured king goes to prison.
	 *
	 * @param {Object} game - The game object
	 * @param {string} defeatedId - The player who lost their king
	 * @param {string} captorId - The player who captured the king
	 * @private
	 */
	_handleKingCapture(game, defeatedId, captorId) {
		log(`Player ${defeatedId} lost their king to ${captorId}!`);

		const defeated = game.players[defeatedId];
		const captor = game.players[captorId];
		if (!defeated || !captor) return;

		// ── 1. Transfer non-pawn pieces to the captor ───────────────────────
		const suicidalPawns = [];
		for (const piece of game.chessPieces) {
			if (!piece || piece.player !== defeatedId) continue;
			if (piece.type === 'KING') continue;

			if (piece.type === 'PAWN') {
				suicidalPawns.push(piece);
			} else {
				piece.player = captorId;
				piece.color = captor.color;

				// Update cell entry ownership
				const key = `${piece.position.x},${piece.position.z}`;
				const cell = game.board.cells[key];
				if (Array.isArray(cell)) {
					const entry = cell.find(
						it => it && it.type === 'chess' && String(it.player) === String(defeatedId)
					);
					if (entry) {
						entry.player = captorId;
						entry.color = captor.color;
					}
				}
				log(`Transferred ${piece.type} at (${piece.position.x}, ${piece.position.z}) to ${captorId}`);
			}
		}

		// ── 2. Suicidal pawns — schedule detonation ─────────────────────────
		const detonateAt = Date.now() + GAME_RULES.SUICIDAL_PAWN_DELAY_MS;
		for (let i = 0; i < suicidalPawns.length; i++) {
			suicidalPawns[i]._suicidalDetonateAt =
				detonateAt + i * GAME_RULES.SUICIDAL_PAWN_INTERVAL_MS;
			suicidalPawns[i]._suicidal = true;
		}

		if (suicidalPawns.length > 0) {
			const totalTime =
				GAME_RULES.SUICIDAL_PAWN_DELAY_MS +
				suicidalPawns.length * GAME_RULES.SUICIDAL_PAWN_INTERVAL_MS;

			log(`${suicidalPawns.length} suicidal pawns will detonate over ${totalTime} ms`);

			this._scheduleSuicidalPawns(game, suicidalPawns, captorId, defeatedId);
		} else {
			this._finaliseKingCapture(game, defeatedId, captorId);
		}
	}

	/**
	 * Tick through suicidal pawns one at a time, destroying cells.
	 * @private
	 */
	_scheduleSuicidalPawns(game, pawns, captorId, defeatedId) {
		let idx = 0;

		const detonateNext = () => {
			if (idx >= pawns.length) {
				this.islandManager.checkForIslandsAfterRowClear(game);
				this._finaliseKingCapture(game, defeatedId, captorId);
				return;
			}

			const pawn = pawns[idx];
			idx++;

			if (!pawn || !pawn.position) {
				detonateNext();
				return;
			}

			const px = pawn.position.x;
			const pz = pawn.position.z;
			log(`Suicidal pawn detonates at (${px}, ${pz})`);

			// Remove the pawn from the game
			const pawnIdx = game.chessPieces.indexOf(pawn);
			if (pawnIdx !== -1) game.chessPieces.splice(pawnIdx, 1);

			// Destroy the cell entirely
			const key = `${px},${pz}`;
			delete game.board.cells[key];

			setTimeout(detonateNext, GAME_RULES.SUICIDAL_PAWN_INTERVAL_MS);
		};

		setTimeout(detonateNext, GAME_RULES.SUICIDAL_PAWN_DELAY_MS);
	}

	/**
	 * Finalise king capture after suicidal pawns have detonated.
	 * @private
	 */
	_finaliseKingCapture(game, defeatedId, captorId) {
		const defeated = game.players[defeatedId];
		const captor = game.players[captorId];

		// ── 3. Transfer remaining territory to captor ────────────────────────
		for (const key in game.board.cells) {
			const cell = game.board.cells[key];
			if (!Array.isArray(cell)) continue;
			for (const item of cell) {
				if (item && String(item.player) === String(defeatedId)) {
					item.player = captorId;
					item.color = captor ? captor.color : item.color;
				}
			}
		}

		// ── 4. King goes to prison ──────────────────────────────────────────
		if (!game.state) game.state = {};
		if (!game.state.kingPrison) game.state.kingPrison = [];
		game.state.kingPrison.push({
			playerId: defeatedId,
			capturedBy: captorId,
			capturedAt: Date.now(),
		});

		// ── 5. Track captured styles ────────────────────────────────────────
		if (!captor.capturedStyles) captor.capturedStyles = [];
		captor.capturedStyles.push({
			playerId: defeatedId,
			color: defeated ? defeated.color : null,
		});

		// ── 6. Eliminate the defeated player ─────────────────────────────────
		if (defeated) {
			defeated.eliminated = true;
			defeated.eliminatedAt = Date.now();
		}

		// Check if only one player remains
		const remainingPlayers = Object.values(game.players)
			.filter(p => !p.eliminated && !p.isObserver);

		if (remainingPlayers.length === 1) {
			game.status = 'completed';
			game.winnerId = remainingPlayers[0].id;
			game.completedAt = Date.now();
			log(`Game over! Player ${game.winnerId} wins!`);
		}

		log(`King capture finalised: ${captorId} defeated ${defeatedId}`);
	}
	
	/**
	 * Update the pawn's net forward distance from its start position.
	 * @private
	 */
	_updatePawnForwardDistance(piece, fromX, fromZ, toX, toZ) {
		const orientation = Number.isFinite(piece.orientation) ? piece.orientation : 0;
		let forwardDelta = 0;
		switch (orientation) {
			case 0: forwardDelta = toZ - fromZ; break;
			case 1: forwardDelta = toX - fromX; break;
			case 2: forwardDelta = fromZ - toZ; break;
			case 3: forwardDelta = fromX - toX; break;
		}
		piece.forwardDistance = (piece.forwardDistance || 0) + forwardDelta;
	}

	/**
	 * Check for pawn promotion — triggers after 9 squares forward
	 * from starting position (net forward distance, not total moves).
	 * @param {Object} game - The game object
	 * @param {Object} piece - The chess piece (pawn)
	 * @private
	 */
	_checkPawnPromotion(game, piece) {
		if (piece.type !== 'PAWN') return null;

		const distance = piece.forwardDistance || 0;
		if (distance < GAME_RULES.PAWN_PROMOTION_DISTANCE) return null;

		return { pieceId: piece.id, playerId: piece.player };
	}

	promotePawn(game, pieceId, playerId, chosenType) {
		const validTypes = ['QUEEN', 'ROOK', 'BISHOP', 'KNIGHT'];
		const promotionPiece = validTypes.includes(String(chosenType).toUpperCase())
			? String(chosenType).toUpperCase()
			: 'QUEEN';

		const piece = game.chessPieces.find(
			p => p.id === pieceId && p.player === playerId && p.type === 'PAWN'
		);
		if (!piece) return { success: false, error: 'Pawn not found' };

		piece.type = promotionPiece;

		const cellContents = this.boardManager.getCell(
			game.board, piece.position.x, piece.position.z
		);
		if (Array.isArray(cellContents)) {
			const chessItem = cellContents.find(
				item => item && item.type === 'chess' && item.player === playerId
			);
			if (chessItem) {
				chessItem.pieceType = promotionPiece.toLowerCase();
			}
		}

		log(`Pawn ${pieceId} promoted to ${promotionPiece} at (${piece.position.x}, ${piece.position.z})`);
		return { success: true, pieceType: promotionPiece, piece };
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
	 * Check if a chess move is valid (sparse-board aware)
	 * This is used by the socket server which keeps board squares (tetromino/home) separate from chess-piece occupancy.
	 * @param {Object} game - The game object
	 * @param {Object} piece - Chess piece object from game.chessPieces
	 * @param {number} toX - Target X
	 * @param {number} toZ - Target Z
	 * @returns {boolean} True if valid
	 */
	isValidChessMove(game, piece, toX, toZ) {
		try {
			if (!game || !game.board || !game.board.cells || !piece) return false;
			
			const pos = piece.position || piece;
			if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return false;
			if (!Number.isFinite(toX) || !Number.isFinite(toZ)) return false;
			
			const fromX = pos.x;
			const fromZ = pos.z;
			if (fromX === toX && fromZ === toZ) return false;
			
			// Destination must be an existing board square (tetromino/home/etc.)
			const targetCell = this.boardManager.getCell(game.board, toX, toZ);
			if (!targetCell || !Array.isArray(targetCell) || targetCell.length === 0) return false;
			
			const pieceOwner = piece.player;
			const pieceType = String(piece.type || '').toUpperCase();
			
			// Cannot capture own piece
			const targetChess = targetCell.find(item => item && item.type === 'chess');
			if (targetChess && String(targetChess.player) === String(pieceOwner)) return false;
			
			const deltaX = toX - fromX;
			const deltaZ = toZ - fromZ;
			const absX = Math.abs(deltaX);
			const absZ = Math.abs(deltaZ);
			
			const hasChessPieceAt = (x, z) => {
				const cell = this.boardManager.getCell(game.board, x, z);
				if (!cell || !Array.isArray(cell)) return false;
				return cell.some(item => item && item.type === 'chess');
			};
			
			const isBoardSquare = (x, z) => {
				const cell = this.boardManager.getCell(game.board, x, z);
				return !!(cell && Array.isArray(cell) && cell.length > 0);
			};
			
			const isPathClear = () => {
				const stepX = Math.sign(deltaX);
				const stepZ = Math.sign(deltaZ);
				
				let x = fromX + stepX;
				let z = fromZ + stepZ;
				
				while (x !== toX || z !== toZ) {
					// Cannot move through the void
					if (!isBoardSquare(x, z)) return false;
					// Cannot move through chess pieces
					if (hasChessPieceAt(x, z)) return false;
					
					x += stepX;
					z += stepZ;
				}
				
				return true;
			};
			
			switch (pieceType) {
				case 'KING':
					if (absX <= 1 && absZ <= 1) return true;
					// Castling (2 squares along one axis)
					if (!piece.hasMoved && ((absX === 2 && absZ === 0) || (absX === 0 && absZ === 2))) {
						const castleResult = this._validateCastle(game, piece, toX, toZ);
						return castleResult.valid;
					}
					return false;
					
				case 'KNIGHT':
					return (absX === 1 && absZ === 2) || (absX === 2 && absZ === 1);
					
				case 'BISHOP':
					if (absX !== absZ) return false;
					return isPathClear();
					
				case 'ROOK':
					if (!((absX === 0 && absZ > 0) || (absZ === 0 && absX > 0))) return false;
					return isPathClear();
					
				case 'QUEEN':
					if (
						!((absX === 0 && absZ > 0) || (absZ === 0 && absX > 0) || (absX === absZ && absX > 0))
					) return false;
					return isPathClear();
					
			case 'PAWN': {
				const orientation = Number.isFinite(piece.orientation) ? piece.orientation : 0;
				const forward = (() => {
					switch (orientation) {
						case 0: return { dx: 0, dz: 1 };
						case 2: return { dx: 0, dz: -1 };
						case 1: return { dx: 1, dz: 0 };
						case 3: return { dx: -1, dz: 0 };
						default: return { dx: 0, dz: 1 };
					}
				})();
				
				const isForwardOne =
					deltaX === forward.dx && deltaZ === forward.dz;
				
				const isForwardTwo =
					!piece.hasMoved &&
					deltaX === forward.dx * 2 && deltaZ === forward.dz * 2;
				
				const isDiagonalCapture = (() => {
					if (forward.dx === 0) {
						return (absX === 1 && deltaZ === forward.dz);
					}
					return (absZ === 1 && deltaX === forward.dx);
				})();
				
				if (isForwardOne) {
					return !hasChessPieceAt(toX, toZ);
				}
				
				if (isForwardTwo) {
					// Two-square advance on first move — path and destination must be clear
					const midX = fromX + forward.dx;
					const midZ = fromZ + forward.dz;
					const midCell = this.boardManager.getCell(game.board, midX, midZ);
					const midHasBoard = !!(midCell && Array.isArray(midCell) && midCell.length > 0);
					if (!midHasBoard) return false;
					if (hasChessPieceAt(midX, midZ)) return false;
					return !hasChessPieceAt(toX, toZ);
				}
				
				if (isDiagonalCapture) {
					return !!targetChess && String(targetChess.player) !== String(pieceOwner);
				}
				
				return false;
			}
				
				default:
					return false;
			}
		} catch (error) {
			log(`Error validating chess move (isValidChessMove): ${error.message}`);
			return false;
		}
	}
	
	/**
	 * Check if a player has any valid chess moves available
	 * @param {Object} game - The game object
	 * @param {string} playerId - The player's ID
	 * @returns {boolean} True if the player has at least one valid move
	 */
	hasValidChessMoves(game, playerId) {
		try {
			if (!game || !game.board || !game.board.cells) return false;
			
			// Get all chess pieces for the player
			const playerPieces = game.chessPieces.filter(piece => piece && piece.player === playerId);
			
			// If the player has no pieces, they have no valid moves
			if (!playerPieces.length) {
				log(`Player ${playerId} has no chess pieces`);
				return false;
			}
			
			const isBoardSquare = (x, z) => {
				const cell = this.boardManager.getCell(game.board, x, z);
				return !!(cell && Array.isArray(cell) && cell.length > 0);
			};
			
			const hasChessPieceAt = (x, z) => {
				const cell = this.boardManager.getCell(game.board, x, z);
				if (!cell || !Array.isArray(cell)) return false;
				return cell.some(item => item && item.type === 'chess');
			};
			
			// Check each piece for at least one valid move (efficient ray checks for sliders)
			for (const piece of playerPieces) {
				const pos = piece.position || piece;
				if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) continue;
				
				const type = String(piece.type || '').toUpperCase();
				const x0 = pos.x;
				const z0 = pos.z;
				
				const tryMove = (x, z) => this.isValidChessMove(game, piece, x, z);
				
				if (type === 'KING') {
					for (let dx = -1; dx <= 1; dx++) {
						for (let dz = -1; dz <= 1; dz++) {
							if (dx === 0 && dz === 0) continue;
							if (tryMove(x0 + dx, z0 + dz)) return true;
						}
					}
					// Check castling (2 squares in each direction)
					if (!piece.hasMoved) {
						if (tryMove(x0 + 2, z0)) return true;
						if (tryMove(x0 - 2, z0)) return true;
						if (tryMove(x0, z0 + 2)) return true;
						if (tryMove(x0, z0 - 2)) return true;
					}
					continue;
				}
				
				if (type === 'KNIGHT') {
					const moves = [
						{ dx: 1, dz: 2 }, { dx: 2, dz: 1 },
						{ dx: -1, dz: 2 }, { dx: -2, dz: 1 },
						{ dx: 1, dz: -2 }, { dx: 2, dz: -1 },
						{ dx: -1, dz: -2 }, { dx: -2, dz: -1 }
					];
					
					for (const m of moves) {
						if (tryMove(x0 + m.dx, z0 + m.dz)) return true;
					}
					continue;
				}
				
			if (type === 'PAWN') {
				const orientation = Number.isFinite(piece.orientation) ? piece.orientation : 0;
				const forward = (() => {
					switch (orientation) {
						case 0: return { dx: 0, dz: 1 };
						case 2: return { dx: 0, dz: -1 };
						case 1: return { dx: 1, dz: 0 };
						case 3: return { dx: -1, dz: 0 };
						default: return { dx: 0, dz: 1 };
					}
				})();
				
				if (tryMove(x0 + forward.dx, z0 + forward.dz)) return true;
				
				// Two-square first move
				if (!piece.hasMoved) {
					if (tryMove(x0 + forward.dx * 2, z0 + forward.dz * 2)) return true;
				}
				
				const diagonals = forward.dx === 0
					? [{ dx: -1, dz: forward.dz }, { dx: 1, dz: forward.dz }]
					: [{ dx: forward.dx, dz: -1 }, { dx: forward.dx, dz: 1 }];
				
				for (const d of diagonals) {
					if (tryMove(x0 + d.dx, z0 + d.dz)) return true;
				}
				continue;
			}
				
				// Sliding pieces: ray-cast until void
				const directions = [];
				if (type === 'ROOK' || type === 'QUEEN') {
					directions.push(
						{ dx: 1, dz: 0 }, { dx: -1, dz: 0 },
						{ dx: 0, dz: 1 }, { dx: 0, dz: -1 }
					);
				}
				if (type === 'BISHOP' || type === 'QUEEN') {
					directions.push(
						{ dx: 1, dz: 1 }, { dx: 1, dz: -1 },
						{ dx: -1, dz: 1 }, { dx: -1, dz: -1 }
					);
				}
				
				for (const dir of directions) {
					let step = 1;
					while (true) {
						const x = x0 + dir.dx * step;
						const z = z0 + dir.dz * step;
						
						if (!isBoardSquare(x, z)) break;
						
						if (tryMove(x, z)) return true;
						
						// If square has a chess piece, ray is blocked beyond it
						if (hasChessPieceAt(x, z)) break;
						
						step++;
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