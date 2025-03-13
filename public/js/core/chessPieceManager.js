/**
 * Chess Piece Manager Module
 * 
 * Handles chess piece movement, validation, and interactions.
 */

import * as GameState from './gameState.js';
import Network from '../utils/network-patch.js';

// Chess piece types
export const PIECE_TYPES = {
	PAWN: 'pawn',
	ROOK: 'rook',
	KNIGHT: 'knight',
	BISHOP: 'bishop',
	QUEEN: 'queen',
	KING: 'king'
};

// Chess piece values (for purchasing)
export const PIECE_VALUES = {
	[PIECE_TYPES.PAWN]: 1,
	[PIECE_TYPES.KNIGHT]: 3,
	[PIECE_TYPES.BISHOP]: 3,
	[PIECE_TYPES.ROOK]: 5,
	[PIECE_TYPES.QUEEN]: 9,
	[PIECE_TYPES.KING]: 0 // Cannot be purchased
};

// Chess piece symbols
export const PIECE_SYMBOLS = {
	[PIECE_TYPES.PAWN]: '♟',
	[PIECE_TYPES.ROOK]: '♜',
	[PIECE_TYPES.KNIGHT]: '♞',
	[PIECE_TYPES.BISHOP]: '♝',
	[PIECE_TYPES.QUEEN]: '♛',
	[PIECE_TYPES.KING]: '♚'
};

/**
 * Get all chess pieces for a player
 * @param {string} playerId - The player ID
 * @returns {Array} The player's chess pieces
 */
export function getPlayerPieces(playerId) {
	const gameState = GameState.getGameState();
	const pieces = [];
	
	// Iterate through the board and find pieces belonging to the player
	for (const key in gameState.board) {
		const cell = gameState.board[key];
		if (cell && cell.type === 'chess' && cell.playerId === playerId) {
			pieces.push({
				...cell,
				position: key.split(',').map(Number)
			});
		}
	}
	
	return pieces;
}

/**
 * Get the king piece for a player
 * @param {string} playerId - The player ID
 * @returns {Object|null} The king piece or null if not found
 */
export function getKing(playerId) {
	const pieces = getPlayerPieces(playerId);
	return pieces.find(piece => piece.pieceType === PIECE_TYPES.KING) || null;
}

/**
 * Check if a position is valid (within the board)
 * @param {number} x - The X coordinate
 * @param {number} y - The Y coordinate
 * @param {Object} gameState - The game state
 * @returns {boolean} Whether the position is valid
 */
function isValidPosition(x, y, gameState) {
	return x >= 0 && x < gameState.boardWidth && y >= 0 && y < gameState.boardHeight;
}

/**
 * Get valid moves for a chess piece
 * @param {Object} piece - The piece to get valid moves for
 * @returns {Array} Array of valid move coordinates [x, y]
 */
export function getValidMoves(piece) {
	try {
		const { type, playerId, x, y } = piece;
		
		// Get the game state
		const gameState = GameState.getGameState();
		
		// Check if it's the player's turn
		if (playerId !== GameState.getPlayerId()) {
			return [];
		}
		
		// Get valid moves based on piece type
		let validMoves = [];
		
		switch (type) {
			case 'pawn':
				validMoves = getPawnMoves(x, y, playerId, gameState);
				break;
			case 'rook':
				validMoves = getRookMoves(x, y, playerId, gameState);
				break;
			case 'knight':
				validMoves = getKnightMoves(x, y, playerId, gameState);
				break;
			case 'bishop':
				validMoves = getBishopMoves(x, y, playerId, gameState);
				break;
			case 'queen':
				validMoves = getQueenMoves(x, y, playerId, gameState);
				break;
			case 'king':
				validMoves = getKingMoves(x, y, playerId, gameState);
				break;
			default:
				validMoves = [];
		}
		
		// Filter out moves that would leave the king in check
		// This is a simplified version - in a real chess game, we would need to check for check
		
		return validMoves;
	} catch (error) {
		console.error('Error getting valid moves:', error);
		return [];
	}
}

/**
 * Get valid moves for a pawn
 * @param {number} x - The pawn's X coordinate
 * @param {number} y - The pawn's Y coordinate
 * @param {string} playerId - The player ID
 * @param {Object} gameState - The game state
 * @returns {Array} Array of valid move coordinates [x, y]
 */
function getPawnMoves(x, y, playerId, gameState) {
	const validMoves = [];
	const direction = playerId === GameState.getPlayerId() ? -1 : 1;
	const isStartingPosition = (playerId === GameState.getPlayerId() && y === gameState.boardHeight - 2) ||
							  (playerId !== GameState.getPlayerId() && y === 1);
	
	// Forward move
	const forwardY = y + direction;
	if (isValidPosition(x, forwardY, gameState) && !isOccupied(x, forwardY, gameState)) {
		validMoves.push([x, forwardY]);
		
		// Double move from starting position
		if (isStartingPosition) {
			const doubleForwardY = y + 2 * direction;
			if (isValidPosition(x, doubleForwardY, gameState) && !isOccupied(x, doubleForwardY, gameState)) {
				validMoves.push([x, doubleForwardY]);
			}
		}
	}
	
	// Capture moves
	const capturePositions = [[x - 1, forwardY], [x + 1, forwardY]];
	for (const [captureX, captureY] of capturePositions) {
		if (isValidPosition(captureX, captureY, gameState) && 
			isOccupied(captureX, captureY, gameState) && 
			!isFriendlyPiece(captureX, captureY, playerId, gameState)) {
			validMoves.push([captureX, captureY]);
		}
	}
	
	return validMoves;
}

/**
 * Get valid moves for a rook
 * @param {number} x - The rook's X coordinate
 * @param {number} y - The rook's Y coordinate
 * @param {string} playerId - The player ID
 * @param {Object} gameState - The game state
 * @returns {Array} Array of valid move coordinates [x, y]
 */
function getRookMoves(x, y, playerId, gameState) {
	const validMoves = [];
	const directions = [
		[0, 1],  // Down
		[1, 0],  // Right
		[0, -1], // Up
		[-1, 0]  // Left
	];
	
	for (const [dx, dy] of directions) {
		let newX = x + dx;
		let newY = y + dy;
		
		while (isValidPosition(newX, newY, gameState)) {
			if (isOccupied(newX, newY, gameState)) {
				if (!isFriendlyPiece(newX, newY, playerId, gameState)) {
					validMoves.push([newX, newY]); // Capture
				}
				break; // Can't move past an occupied square
			}
			
			validMoves.push([newX, newY]);
			newX += dx;
			newY += dy;
		}
	}
	
	return validMoves;
}

/**
 * Get valid moves for a knight
 * @param {number} x - The knight's X coordinate
 * @param {number} y - The knight's Y coordinate
 * @param {string} playerId - The player ID
 * @param {Object} gameState - The game state
 * @returns {Array} Array of valid move coordinates [x, y]
 */
function getKnightMoves(x, y, playerId, gameState) {
	const validMoves = [];
	const moves = [
		[x + 1, y + 2], [x + 2, y + 1],
		[x + 2, y - 1], [x + 1, y - 2],
		[x - 1, y - 2], [x - 2, y - 1],
		[x - 2, y + 1], [x - 1, y + 2]
	];
	
	for (const [newX, newY] of moves) {
		if (isValidPosition(newX, newY, gameState) && 
			(!isOccupied(newX, newY, gameState) || !isFriendlyPiece(newX, newY, playerId, gameState))) {
			validMoves.push([newX, newY]);
		}
	}
	
	return validMoves;
}

/**
 * Get valid moves for a bishop
 * @param {number} x - The bishop's X coordinate
 * @param {number} y - The bishop's Y coordinate
 * @param {string} playerId - The player ID
 * @param {Object} gameState - The game state
 * @returns {Array} Array of valid move coordinates [x, y]
 */
function getBishopMoves(x, y, playerId, gameState) {
	const validMoves = [];
	const directions = [
		[1, 1],   // Down-right
		[1, -1],  // Up-right
		[-1, -1], // Up-left
		[-1, 1]   // Down-left
	];
	
	for (const [dx, dy] of directions) {
		let newX = x + dx;
		let newY = y + dy;
		
		while (isValidPosition(newX, newY, gameState)) {
			if (isOccupied(newX, newY, gameState)) {
				if (!isFriendlyPiece(newX, newY, playerId, gameState)) {
					validMoves.push([newX, newY]); // Capture
				}
				break; // Can't move past an occupied square
			}
			
			validMoves.push([newX, newY]);
			newX += dx;
			newY += dy;
		}
	}
	
	return validMoves;
}

/**
 * Get valid moves for a queen
 * @param {number} x - The queen's X coordinate
 * @param {number} y - The queen's Y coordinate
 * @param {string} playerId - The player ID
 * @param {Object} gameState - The game state
 * @returns {Array} Array of valid move coordinates [x, y]
 */
function getQueenMoves(x, y, playerId, gameState) {
	// Queen moves like a rook and bishop combined
	const rookMoves = getRookMoves(x, y, playerId, gameState);
	const bishopMoves = getBishopMoves(x, y, playerId, gameState);
	
	return [...rookMoves, ...bishopMoves];
}

/**
 * Get valid moves for a king
 * @param {number} x - The king's X coordinate
 * @param {number} y - The king's Y coordinate
 * @param {string} playerId - The player ID
 * @param {Object} gameState - The game state
 * @returns {Array} Array of valid move coordinates [x, y]
 */
function getKingMoves(x, y, playerId, gameState) {
	const validMoves = [];
	const directions = [
		[0, 1],   // Down
		[1, 1],   // Down-right
		[1, 0],   // Right
		[1, -1],  // Up-right
		[0, -1],  // Up
		[-1, -1], // Up-left
		[-1, 0],  // Left
		[-1, 1]   // Down-left
	];
	
	for (const [dx, dy] of directions) {
		const newX = x + dx;
		const newY = y + dy;
		
		if (isValidPosition(newX, newY, gameState) && 
			(!isOccupied(newX, newY, gameState) || !isFriendlyPiece(newX, newY, playerId, gameState))) {
			validMoves.push([newX, newY]);
		}
	}
	
	// Castling is not implemented in this simplified version
	
	return validMoves;
}

/**
 * Check if a position is occupied by a piece
 * @param {number} x - The X coordinate
 * @param {number} y - The Y coordinate
 * @param {Object} gameState - The game state
 * @returns {boolean} Whether the position is occupied
 */
function isOccupied(x, y, gameState) {
	const key = `${x},${y}`;
	return gameState.board[key] && gameState.board[key].piece;
}

/**
 * Check if a position is occupied by a friendly piece
 * @param {number} x - The X coordinate
 * @param {number} y - The Y coordinate
 * @param {string} playerId - The player ID
 * @param {Object} gameState - The game state
 * @returns {boolean} Whether the position is occupied by a friendly piece
 */
function isFriendlyPiece(x, y, playerId, gameState) {
	const key = `${x},${y}`;
	return gameState.board[key] && 
		   gameState.board[key].piece && 
		   gameState.board[key].piece.playerId === playerId;
}

/**
 * Move a chess piece
 * @param {Object} piece - The piece to move
 * @param {number} toX - The destination X coordinate
 * @param {number} toY - The destination Y coordinate
 * @returns {Promise<boolean>} Whether the move was successful
 */
export async function movePiece(piece, toX, toY) {
	// Validate piece
	if (!piece || typeof piece !== 'object') {
		console.error('Invalid piece object provided');
		return false;
	}
	
	// Validate coordinates
	if (typeof toX !== 'number' || typeof toY !== 'number' || 
		toX < 0 || toY < 0 || 
		toX >= GameState.getGameState().boardWidth || 
		toY >= GameState.getGameState().boardHeight) {
		console.error('Invalid destination coordinates:', toX, toY);
		return false;
	}
	
	// Get the current position
	const fromX = piece.x;
	const fromY = piece.y;
	
	// Log move attempt
	console.log(`Attempting to move piece from (${fromX}, ${fromY}) to (${toX}, ${toY})`);
	
	// Get the player ID
	const currentPlayerId = GameState.getPlayerId();
	
	// Anti-cheat: Ensure the piece belongs to the current player
	if (piece.playerId !== currentPlayerId) {
		console.error('Cannot move opponent\'s piece');
		return false;
	}
	
	// Get valid moves
	const validMoves = getValidMoves(piece);
	
	// Check if the destination is in the valid moves
	const isValidMove = validMoves.some(([x, y]) => x === toX && y === toY);
	
	if (!isValidMove) {
		console.error('Invalid move destination');
		return false;
	}
	
	// Try to move the piece via the server if connected
	if (Network.isConnected() && !GameState.isOfflineMode()) {
		try {
			await Network.emit('moveChessPiece', {
				playerId: currentPlayerId,
				fromX,
				fromY,
				toX,
				toY
			});
			
			// The server will send back the updated game state
			return true;
		} catch (error) {
			console.error('Error moving piece:', error);
			
			// If there's an error, try to handle the move locally
			const success = updateLocalGameState(piece, fromX, fromY, toX, toY);
			return success;
		}
	} else {
		// If in offline mode, update the local game state
		const success = updateLocalGameState(piece, fromX, fromY, toX, toY);
		return success;
	}
}

/**
 * Update the local game state after a move
 * @param {Object} piece - The piece that was moved
 * @param {number} fromX - The source X coordinate
 * @param {number} fromY - The source Y coordinate
 * @param {number} toX - The destination X coordinate
 * @param {number} toY - The destination Y coordinate
 * @returns {boolean} Whether the update was successful
 */
function updateLocalGameState(piece, fromX, fromY, toX, toY) {
	// Get the game state
	const gameState = GameState.getGameState();
	
	// Check for a capture
	const targetCell = GameState.getCell(toX, toY);
	
	if (targetCell && targetCell.piece) {
		console.log(`Captured piece at (${toX}, ${toY}):`, targetCell.piece);
		
		// Anti-cheat: Ensure kings cannot be directly captured
		if (targetCell.piece.type === 'king') {
			if (piece.type !== 'knight' && piece.type !== 'pawn') {
				// Check if path is blocked (kings can't be captured through other pieces)
				const path = getPath(fromX, fromY, toX, toY, piece.type);
				for (let i = 1; i < path.length - 1; i++) {
					const [pathX, pathY] = path[i];
					const cellInPath = GameState.getCell(pathX, pathY);
					if (cellInPath && cellInPath.piece) {
						console.error('Cannot capture king through other pieces');
						return false;
					}
				}
			}
		}
		
		// Check if this is a king capture, indicating game over
		if (targetCell.piece.type === 'king') {
			gameState.isGameOver = true;
			gameState.winner = piece.playerId;
			
			console.log(`Game over! Player ${piece.playerId} wins by capturing the king.`);
		}
	}
	
	// Remove the piece from the source cell
	GameState.removeChessPiece(fromX, fromY);
	
	// Update the piece location
	piece.x = toX;
	piece.y = toY;
	
	// Place the piece in the destination cell
	GameState.setChessPiece(toX, toY, piece);
	
	// Handle special case for pawns reaching the opposite end of the board (promotion)
	if (piece.type === 'pawn') {
		const playerHomeZone = GameState.getHomeZone(piece.playerId);
		const opponentHomeZones = Object.entries(gameState.homeZones)
			.filter(([id]) => id !== piece.playerId)
			.map(([, zone]) => zone);
		
		for (const zone of opponentHomeZones) {
			if (toX >= zone.x && toX < zone.x + zone.width && 
				toY >= zone.y && toY < zone.y + zone.height) {
				// Promote pawn to queen
				piece.type = 'queen';
				GameState.setChessPiece(toX, toY, piece);
				console.log(`Promoted pawn to queen at (${toX}, ${toY})`);
				break;
			}
		}
	}
	
	// Update the game state
	GameState.updateGameState(gameState);
	
	// Play sound effect if available
	if (window.SoundManager) {
		if (targetCell && targetCell.piece) {
			window.SoundManager.playSound('chessPieceCapture');
		} else {
			window.SoundManager.playSound('chessPieceMove');
		}
	}
	
	return true;
}

/**
 * Get path between two positions for checking if path is clear
 * @param {number} fromX - Starting X coordinate
 * @param {number} fromY - Starting Y coordinate
 * @param {number} toX - Ending X coordinate
 * @param {number} toY - Ending Y coordinate
 * @param {string} pieceType - Type of piece (for determining movement pattern)
 * @returns {Array} Array of [x, y] positions in the path
 */
function getPath(fromX, fromY, toX, toY, pieceType) {
	const path = [[fromX, fromY]];
	const dx = toX - fromX;
	const dy = toY - fromY;
	
	// Knight has no path to check (jumps)
	if (pieceType === 'knight') {
		path.push([toX, toY]);
		return path;
	}
	
	// For diagonal movement
	if (Math.abs(dx) === Math.abs(dy) && dx !== 0) {
		const stepX = dx > 0 ? 1 : -1;
		const stepY = dy > 0 ? 1 : -1;
		let x = fromX + stepX;
		let y = fromY + stepY;
		
		while (x !== toX && y !== toY) {
			path.push([x, y]);
			x += stepX;
			y += stepY;
		}
	}
	// For horizontal movement
	else if (dy === 0 && dx !== 0) {
		const step = dx > 0 ? 1 : -1;
		for (let x = fromX + step; x !== toX + step; x += step) {
			path.push([x, fromY]);
		}
	}
	// For vertical movement
	else if (dx === 0 && dy !== 0) {
		const step = dy > 0 ? 1 : -1;
		for (let y = fromY + step; y !== toY + step; y += step) {
			path.push([fromX, y]);
		}
	}
	
	return path;
}

/**
 * Purchase a chess piece
 * @param {string} pieceType - The type of piece to purchase
 * @param {number} x - The X coordinate to place the piece
 * @param {number} y - The Y coordinate to place the piece
 * @returns {Promise<boolean>} Whether the purchase was successful
 */
export async function purchasePiece(pieceType, x, y) {
	try {
		// Check if the piece type is valid
		if (!Object.values(PIECE_TYPES).includes(pieceType)) {
			console.error('Invalid piece type:', pieceType);
			return false;
		}
		
		// Check if the piece can be purchased (kings cannot be purchased)
		if (pieceType === PIECE_TYPES.KING) {
			console.error('Kings cannot be purchased');
			return false;
		}
		
		// Get the game state
		const gameState = GameState.getGameState();
		const playerId = GameState.getPlayerId();
		
		// Check if the player has enough resources
		const pieceValue = PIECE_VALUES[pieceType];
		const playerResources = gameState.players[playerId]?.resources || 0;
		
		if (playerResources < pieceValue) {
			console.error(`Not enough resources to purchase ${pieceType}. Need ${pieceValue}, have ${playerResources}`);
			return false;
		}
		
		// Check if the position is valid
		if (!isValidPosition(x, y, gameState)) {
			console.error('Invalid position for piece placement');
			return false;
		}
		
		// Check if the position is in the player's home zone
		if (!isInHomeZone(x, y, playerId, gameState)) {
			console.error('Pieces can only be purchased in your home zone');
			return false;
		}
		
		// Check if the position is already occupied
		if (isOccupied(x, y, gameState)) {
			console.error('Position is already occupied');
			return false;
		}
		
		// Send the purchase request to the server
		try {
			await Network.emit('purchasePiece', {
				playerId,
				pieceType,
				x,
				y
			});
			
			// Update the game state locally for immediate feedback
			updateLocalPurchase(pieceType, x, y, pieceValue);
			
			return true;
		} catch (error) {
			console.error('Error sending purchase to server:', error);
			
			// If we're in offline mode, still update the local game state
			if (!Network.isConnected()) {
				updateLocalPurchase(pieceType, x, y, pieceValue);
				return true;
			}
			
			return false;
		}
	} catch (error) {
		console.error('Error purchasing piece:', error);
		return false;
	}
}

/**
 * Update the local game state after a purchase
 * @param {string} pieceType - The type of piece purchased
 * @param {number} x - The X coordinate
 * @param {number} y - The Y coordinate
 * @param {number} pieceValue - The value of the piece
 */
function updateLocalPurchase(pieceType, x, y, pieceValue) {
	const gameState = GameState.getGameState();
	const playerId = GameState.getPlayerId();
	const key = `${x},${y}`;
	
	// Create the cell if it doesn't exist
	if (!gameState.board[key]) {
		gameState.board[key] = {
			x,
			y,
			type: 'cell',
			playerId,
			inHomeZone: true
		};
	}
	
	// Add the piece to the cell
	gameState.board[key].piece = {
		type: pieceType,
		playerId
	};
	
	// Deduct resources from the player
	if (gameState.players[playerId]) {
		gameState.players[playerId].resources -= pieceValue;
	}
	
	// Update the game state
	GameState.updateGameState(gameState);
	
	// Dispatch a board update event
	window.dispatchEvent(new CustomEvent('boardUpdate', { 
		detail: gameState 
	}));
	
	console.log(`Purchased ${pieceType} at (${x}, ${y}) for ${pieceValue} resources`);
}

/**
 * Check if a position is in a player's home zone
 * @param {number} x - The X coordinate
 * @param {number} y - The Y coordinate
 * @param {string} playerId - The player ID
 * @param {Object} gameState - The game state
 * @returns {boolean} Whether the position is in the player's home zone
 */
function isInHomeZone(x, y, playerId, gameState) {
	const homeZone = gameState.homeZones?.[playerId];
	if (!homeZone) return false;
	
	return x >= homeZone.x && 
		   x < homeZone.x + homeZone.width && 
		   y >= homeZone.y && 
		   y < homeZone.y + homeZone.height;
}

/**
 * Check if a player is in check
 * @param {string} playerId - The player ID
 * @returns {boolean} Whether the player is in check
 */
export function isInCheck(playerId) {
	const gameState = GameState.getGameState();
	const king = getKing(playerId);
	
	if (!king) return false;
	
	// Get all opponent pieces
	const opponentPieces = [];
	for (const key in gameState.board) {
		const cell = gameState.board[key];
		if (cell && cell.type === 'chess' && cell.playerId !== playerId) {
			opponentPieces.push({
				...cell,
				position: key.split(',').map(Number)
			});
		}
	}
	
	// Check if any opponent piece can capture the king
	for (const piece of opponentPieces) {
		const validMoves = getValidMoves(piece);
		for (const [x, y] of validMoves) {
			if (x === king.position[0] && y === king.position[1]) {
				return true;
			}
		}
	}
	
	return false;
}

/**
 * Check if a player is in checkmate
 * @param {string} playerId - The player ID
 * @returns {boolean} Whether the player is in checkmate
 */
export function isInCheckmate(playerId) {
	// First check if the player is in check
	if (!isInCheck(playerId)) return false;
	
	// Get all player pieces
	const pieces = getPlayerPieces(playerId);
	
	// Check if any piece has a valid move that gets out of check
	for (const piece of pieces) {
		const validMoves = getValidMoves(piece);
		
		for (const [toX, toY] of validMoves) {
			// Simulate the move
			const gameState = GameState.getGameState();
			const simulatedState = simulateMove(piece, toX, toY, gameState);
			
			// Check if the move gets out of check
			if (!isPlayerInCheckInState(playerId, simulatedState)) {
				return false;
			}
		}
	}
	
	// No moves get out of check, so it's checkmate
	return true;
}

/**
 * Simulate a move and return the resulting game state
 * @param {Object} piece - The chess piece
 * @param {number} toX - The destination x coordinate
 * @param {number} toY - The destination y coordinate
 * @param {Object} gameState - The current game state
 * @returns {Object} The simulated game state
 */
function simulateMove(piece, toX, toY, gameState) {
	// Create a deep copy of the game state
	const simulatedState = JSON.parse(JSON.stringify(gameState));
	
	// Remove the piece from its current position
	const fromKey = `${piece.position[0]},${piece.position[1]}`;
	delete simulatedState.board[fromKey];
	
	// Place the piece at the new position
	const toKey = `${toX},${toY}`;
	simulatedState.board[toKey] = {
		...piece,
		position: [toX, toY]
	};
	
	return simulatedState;
}

/**
 * Check if a player is in check in a given game state
 * @param {string} playerId - The player ID
 * @param {Object} gameState - The game state to check
 * @returns {boolean} Whether the player is in check
 */
function isPlayerInCheckInState(playerId, gameState) {
	// Find the king
	let king = null;
	for (const key in gameState.board) {
		const cell = gameState.board[key];
		if (cell && cell.type === 'chess' && cell.playerId === playerId && cell.pieceType === PIECE_TYPES.KING) {
			king = {
				...cell,
				position: key.split(',').map(Number)
			};
			break;
		}
	}
	
	if (!king) return false;
	
	// Get all opponent pieces
	const opponentPieces = [];
	for (const key in gameState.board) {
		const cell = gameState.board[key];
		if (cell && cell.type === 'chess' && cell.playerId !== playerId) {
			opponentPieces.push({
				...cell,
				position: key.split(',').map(Number)
			});
		}
	}
	
	// Check if any opponent piece can capture the king
	for (const piece of opponentPieces) {
		const validMoves = getValidMovesInState(piece, gameState);
		for (const [x, y] of validMoves) {
			if (x === king.position[0] && y === king.position[1]) {
				return true;
			}
		}
	}
	
	return false;
}

/**
 * Get valid moves for a chess piece in a given game state
 * @param {Object} piece - The chess piece
 * @param {Object} gameState - The game state to check
 * @returns {Array} Array of valid move positions [x, y]
 */
function getValidMovesInState(piece, gameState) {
	// This is a simplified version that doesn't check for check
	// In a real implementation, you would need to adapt all the move functions to work with a provided game state
	
	const [x, y] = piece.position;
	const playerId = piece.playerId;
	const validMoves = [];
	
	switch (piece.pieceType) {
		case PIECE_TYPES.PAWN:
			// Simplified pawn moves
			const direction = gameState.homeZones[playerId].some(zone => 
				zone[0] === x && zone[1] === y
			) ? -1 : 1;
			
			const forwardY = y + direction;
			if (isValidPosition(x, forwardY, gameState) && !getCellAt(x, forwardY, gameState)) {
				validMoves.push([x, forwardY]);
			}
			
			// Captures
			for (const dx of [-1, 1]) {
				const captureX = x + dx;
				if (isValidPosition(captureX, forwardY, gameState)) {
					const cell = getCellAt(captureX, forwardY, gameState);
					if (cell && cell.type === 'chess' && cell.playerId !== playerId) {
						validMoves.push([captureX, forwardY]);
					}
				}
			}
			break;
			
		// Add simplified implementations for other piece types if needed
		
		default:
			// For simplicity, return an empty array for other piece types
			break;
	}
	
	return validMoves;
}

/**
 * Get the cost of a chess piece
 * @param {string} pieceType - The type of piece
 * @returns {number} The cost of the piece
 */
export function getPieceCost(pieceType) {
	return PIECE_VALUES[pieceType] || 0;
}

/**
 * Get the symbol for a chess piece
 * @param {string} pieceType - The type of piece
 * @returns {string} The symbol for the piece
 */
export function getPieceSymbol(pieceType) {
	return PIECE_SYMBOLS[pieceType] || '?';
}
