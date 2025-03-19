/**
 * Chess Piece Manager
 * 
 * Handles chess piece creation, movement, and capture.
 */

import { GAME_CONSTANTS, CHESS_PIECE_TYPES, CHESS_PIECE_VALUES } from './constants.js';
import * as PlayerManager from './playerManager.js';
import { generateId } from '../utils/helpers.js';
import * as SessionManager from '../utils/sessionManager.js';
import * as GameState from './gameState.js';

// Chess pieces collection
let chessPieces = {};

// Game board
let board = [];

// Home zones
let homeZones = {};

// Selected piece
let selectedPiece = null;

// Valid moves for selected piece
let validMoves = [];

/**
 * Initialize the chess piece manager
 * @returns {Promise<void>}
 */
export async function init() {
	try {
		console.log('Initializing chess piece manager');
		
		// Reset state
		chessPieces = {};
		homeZones = {};
		selectedPiece = null;
		validMoves = [];
		
		// Initialize board with proper dimensions
		board = [];
		for (let y = 0; y < GAME_CONSTANTS.BOARD_HEIGHT; y++) {
			board[y] = Array(GAME_CONSTANTS.BOARD_WIDTH).fill(null);
		}
		
		console.log('Chess piece manager initialized');
	} catch (error) {
		console.error('Error initializing chess piece manager:', error);
		throw error;
	}
}

/**
 * Update chess pieces
 * @param {number} deltaTime - Time since last update
 */
export function update(deltaTime) {
	// Currently no automatic updates needed
}

/**
 * Initialize home zone for a player
 * @param {string} playerId - Player ID
 */
export function initHomeZone(playerId) {
	try {
		const player = PlayerManager.getPlayerById(playerId);
		
		if (!player) {
			console.error('Player not found:', playerId);
			return;
		}
		
		const playerIndex = PlayerManager.getPlayerIndex(playerId);
		
		// Determine home zone position based on player index
		// Each home zone is 8x2 (standard chess layout)
		let homeZoneX, homeZoneY;
		const homeZoneWidth = 8;
		const homeZoneHeight = 2;
		
		switch (playerIndex) {
			case 0: // Bottom
				homeZoneX = Math.floor((GAME_CONSTANTS.BOARD_WIDTH - homeZoneWidth) / 2);
				homeZoneY = GAME_CONSTANTS.BOARD_HEIGHT - homeZoneHeight;
				break;
			case 1: // Top
				homeZoneX = Math.floor((GAME_CONSTANTS.BOARD_WIDTH - homeZoneWidth) / 2);
				homeZoneY = 0;
				break;
			case 2: // Left
				homeZoneX = 0;
				homeZoneY = Math.floor((GAME_CONSTANTS.BOARD_HEIGHT - homeZoneHeight) / 2);
				break;
			case 3: // Right
				homeZoneX = GAME_CONSTANTS.BOARD_WIDTH - homeZoneWidth;
				homeZoneY = Math.floor((GAME_CONSTANTS.BOARD_HEIGHT - homeZoneHeight) / 2);
				break;
			default:
				// Random position for additional players
				homeZoneX = Math.floor(Math.random() * (GAME_CONSTANTS.BOARD_WIDTH - homeZoneWidth));
				homeZoneY = Math.floor(Math.random() * (GAME_CONSTANTS.BOARD_HEIGHT - homeZoneHeight));
		}
		
		// Create home zone
		homeZones[playerId] = {
			x: homeZoneX,
			y: homeZoneY,
			width: homeZoneWidth,
			height: homeZoneHeight,
			kingId: null
		};
		
		// Create chess pieces
		createChessPieces(playerId);
	} catch (error) {
		console.error('Error initializing home zone:', error);
	}
}

/**
 * Create chess pieces for a player
 * @param {string} playerId - Player ID
 */
export function createChessPieces(playerId) {
	try {
		const homeZone = homeZones[playerId];
		
		if (!homeZone) {
			console.error('Home zone not found for player:', playerId);
			return;
		}
		
		// Standard chess piece arrangement
		const backRowPieces = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
		const frontRowPieces = Array(8).fill('pawn');
		
		// Create back row pieces (major pieces)
		for (let i = 0; i < backRowPieces.length; i++) {
			const x = homeZone.x + i;
			const y = homeZone.y + 1; // Back row
			
			const pieceType = backRowPieces[i];
			const pieceId = `${playerId}_${pieceType}_${i}`;
			
			// Create the piece
			chessPieces[pieceId] = {
				id: pieceId,
				type: pieceType,
				playerId: playerId,
				x: x,
				y: y,
				hasMoved: false,
				isPromoted: false
			};
			
			// If it's a king, store its ID in the home zone
			if (pieceType === 'king') {
				homeZone.kingId = pieceId;
			}
			
			// Update the board
			// Ensure the board is large enough
			while (board.length <= y) {
				board.push(Array(GAME_CONSTANTS.BOARD_WIDTH).fill(null));
			}
			
			// Place piece on board
			board[y][x] = {
				id: `cell_${x}_${y}`,
				type: 'cell',
				isHomeZone: true,
				playerId: playerId,
				piece: chessPieces[pieceId],
				color: 0xFFD54F // Yellow for home zone
			};
		}
		
		// Create front row pieces (pawns)
		for (let i = 0; i < frontRowPieces.length; i++) {
			const x = homeZone.x + i;
			const y = homeZone.y; // Front row
			
			const pieceType = frontRowPieces[i];
			const pieceId = `${playerId}_${pieceType}_${i}`;
			
			// Create the piece
			chessPieces[pieceId] = {
				id: pieceId,
				type: pieceType,
				playerId: playerId,
				x: x,
				y: y,
				hasMoved: false,
				isPromoted: false
			};
			
			// Update the board
			// Ensure the board is large enough
			while (board.length <= y) {
				board.push(Array(GAME_CONSTANTS.BOARD_WIDTH).fill(null));
			}
			
			// Place piece on board
			board[y][x] = {
				id: `cell_${x}_${y}`,
				type: 'cell',
				isHomeZone: true,
				playerId: playerId,
				piece: chessPieces[pieceId],
				color: 0xFFD54F // Yellow for home zone
			};
		}
		
		console.log('Created chess pieces for player', playerId);
	} catch (error) {
		console.error('Error creating chess pieces:', error);
	}
}

/**
 * Update home zone
 * @param {string} playerId - Player ID
 */
export function updateHomeZone(playerId) {
	try {
		const homeZone = homeZones[playerId];
		
		if (!homeZone) {
			console.error('Home zone not found for player:', playerId);
			return;
		}
		
		// Check if king is still in home zone
		const kingId = homeZone.kingId;
		let kingFound = false;
		
		// Search for king in home zone
		for (let y = homeZone.y; y < homeZone.y + homeZone.height; y++) {
			for (let x = homeZone.x; x < homeZone.x + homeZone.width; x++) {
				const piece = board[y][x];
				
				if (piece && piece.id === kingId) {
					kingFound = true;
					break;
				}
			}
			
			if (kingFound) break;
		}
		
		// If king not found, player is eliminated
		if (!kingFound) {
			console.log('King not found in home zone, player eliminated:', playerId);
			PlayerManager.eliminatePlayer(playerId);
		}
	} catch (error) {
		console.error('Error updating home zone:', error);
	}
}

/**
 * Select a chess piece
 * @param {number} x - X position
 * @param {number} y - Y position
 * @returns {boolean} - Whether a piece was selected
 */
export function selectPiece(x, y) {
	try {
		// Check if position is within board
		if (x < 0 || x >= GAME_CONSTANTS.BOARD_WIDTH || y < 0 || y >= GAME_CONSTANTS.BOARD_HEIGHT) {
			return false;
		}
		
		// Get piece at position
		const piece = board[y][x];
		
		// Check if piece exists and is a chess piece
		if (!piece || piece.type !== 'chess') {
			selectedPiece = null;
			validMoves = [];
			return false;
		}
		
		// Check if piece belongs to current player
		const currentPlayer = PlayerManager.getCurrentPlayer();
		
		if (!currentPlayer || piece.playerId !== currentPlayer.id) {
			return false;
		}
		
		// Select piece
		selectedPiece = {
			piece,
			x,
			y
		};
		
		// Calculate valid moves
		validMoves = calculateValidMoves(piece, x, y);
		
		return true;
	} catch (error) {
		console.error('Error selecting piece:', error);
		return false;
	}
}

/**
 * Move selected piece
 * @param {number} x - Target X position
 * @param {number} y - Target Y position
 * @returns {boolean} - Whether the piece was moved
 */
export function movePiece(x, y) {
	try {
		// Check if a piece is selected
		if (!selectedPiece) {
			return false;
		}
		
		// Check if position is within board
		if (x < 0 || x >= GAME_CONSTANTS.BOARD_WIDTH || y < 0 || y >= GAME_CONSTANTS.BOARD_HEIGHT) {
			return false;
		}
		
		// Check if move is valid
		const isValidMove = validMoves.some(move => move.x === x && move.y === y);
		
		if (!isValidMove) {
			return false;
		}
		
		// Get target piece
		const targetPiece = board[y][x];
		
		// If target has a piece, capture it
		if (targetPiece) {
			capturePiece(targetPiece, selectedPiece.piece.playerId);
		}
		
		// Move piece
		board[y][x] = selectedPiece.piece;
		board[selectedPiece.y][selectedPiece.x] = null;
		
		// Update home zones
		for (const playerId in homeZones) {
			updateHomeZone(playerId);
		}
		
		// Clear selection
		selectedPiece = null;
		validMoves = [];
		
		return true;
	} catch (error) {
		console.error('Error moving piece:', error);
		return false;
	}
}

/**
 * Capture a piece
 * @param {string} pieceId - ID of the piece to capture
 * @param {string} capturedById - ID of the piece that captured it
 * @returns {boolean} Whether the capture was successful
 */
export function capturePiece(pieceId, capturedById) {
	try {
		// Check if the piece exists
		if (!chessPieces[pieceId]) {
			console.warn(`Piece ${pieceId} does not exist`);
			return false;
		}
		
		// Get the piece and the capturing piece
		const piece = chessPieces[pieceId];
		const capturingPiece = chessPieces[capturedById];
		
		// Mark the piece as captured
		piece.captured = true;
		
		// Remove the piece from the board
		const { x, y } = piece;
		if (board[y] && board[y][x]) {
			board[y][x].piece = null;
		}
		
		// Add to captured pieces array
		if (!capturedPieces) {
			capturedPieces = [];
		}
		capturedPieces.push(piece);
		
		// Log the capture
		console.log(`Piece ${pieceId} (${piece.type}) captured by ${capturedById}`);
		
		// Check if the captured piece is a king
		if (piece.type === 'king') {
			// Import GameManager dynamically to avoid circular dependency
			import('../core/gameManager.js').then(GameManager => {
				// Call the checkKingCaptured function
				GameManager.checkKingCaptured(piece, capturingPiece);
			}).catch(error => {
				console.error('Error importing GameManager:', error);
			});
		}
		
		return true;
	} catch (error) {
		console.error('Error capturing piece:', error);
		return false;
	}
}

/**
 * Calculate valid moves for a piece
 * @param {Object} piece - Chess piece
 * @param {number} x - Current X position
 * @param {number} y - Current Y position
 * @returns {Array} - Array of valid move positions
 */
function calculateValidMoves(piece, x, y) {
	try {
		const moves = [];
		
		// Calculate moves based on piece type
		switch (piece.pieceType) {
			case CHESS_PIECE_TYPES.KING:
				// King can move one square in any direction
				for (let dy = -1; dy <= 1; dy++) {
					for (let dx = -1; dx <= 1; dx++) {
						if (dx === 0 && dy === 0) continue;
						
						const newX = x + dx;
						const newY = y + dy;
						
						// Check if position is within board
						if (newX < 0 || newX >= GAME_CONSTANTS.BOARD_WIDTH || newY < 0 || newY >= GAME_CONSTANTS.BOARD_HEIGHT) {
							continue;
						}
						
						// Check if position is empty or has enemy piece
						const targetPiece = board[newY][newX];
						
						if (!targetPiece || targetPiece.playerId !== piece.playerId) {
							moves.push({ x: newX, y: newY });
						}
					}
				}
				break;
				
			case CHESS_PIECE_TYPES.PAWN:
				// Pawn can move one square forward or diagonally to capture
				const directions = [
					{ dx: 0, dy: -1, captureOnly: false },
					{ dx: -1, dy: -1, captureOnly: true },
					{ dx: 1, dy: -1, captureOnly: true }
				];
				
				for (const { dx, dy, captureOnly } of directions) {
					const newX = x + dx;
					const newY = y + dy;
					
					// Check if position is within board
					if (newX < 0 || newX >= GAME_CONSTANTS.BOARD_WIDTH || newY < 0 || newY >= GAME_CONSTANTS.BOARD_HEIGHT) {
						continue;
					}
					
					// Check if position is valid based on move type
					const targetPiece = board[newY][newX];
					
					if (captureOnly) {
						// Can only move diagonally if capturing
						if (targetPiece && targetPiece.playerId !== piece.playerId) {
							moves.push({ x: newX, y: newY });
						}
					} else {
						// Can only move forward if empty
						if (!targetPiece) {
							moves.push({ x: newX, y: newY });
						}
					}
				}
				break;
				
			// Add more piece types as needed
				
			default:
				// Default to king-like movement for other pieces
				for (let dy = -1; dy <= 1; dy++) {
					for (let dx = -1; dx <= 1; dx++) {
						if (dx === 0 && dy === 0) continue;
						
						const newX = x + dx;
						const newY = y + dy;
						
						// Check if position is within board
						if (newX < 0 || newX >= GAME_CONSTANTS.BOARD_WIDTH || newY < 0 || newY >= GAME_CONSTANTS.BOARD_HEIGHT) {
							continue;
						}
						
						// Check if position is empty or has enemy piece
						const targetPiece = board[newY][newX];
						
						if (!targetPiece || targetPiece.playerId !== piece.playerId) {
							moves.push({ x: newX, y: newY });
						}
					}
				}
		}
		
		return moves;
	} catch (error) {
		console.error('Error calculating valid moves:', error);
		return [];
	}
}

/**
 * Get the current board state
 * @returns {Array} 2D array representing the board
 */
export function getBoard() {
	try {
		// Check if board needs initialization
		if (!board || !Array.isArray(board) || board.length === 0) {
			console.warn('Board not initialized, creating default board');
			// Don't return the result of createDefaultBoard directly
			// Instead, call it to initialize the module-level board variable
			createDefaultBoard();
		}
		
		// Now create a copy of the board with additional cell properties
		const boardWithProperties = [];
		for (let rowIndex = 0; rowIndex < board.length; rowIndex++) {
			boardWithProperties[rowIndex] = [];
			for (let colIndex = 0; colIndex < (board[rowIndex] ? board[rowIndex].length : 0); colIndex++) {
				// Check if this position is in a home zone
				const isHomeZone = isPositionInHomeZone(colIndex, rowIndex);
				
				// Determine cell color based on position and home zone
				let color;
				if (isHomeZone) {
					color = 0xFFD54F; // Yellow for home zone
				} else {
					color = (colIndex + rowIndex) % 2 === 0 ? 0x4FC3F7 : 0x29B6F6; // Checkerboard pattern
				}
				
				boardWithProperties[rowIndex][colIndex] = {
					piece: board[rowIndex][colIndex], // The chess piece at this position (if any)
					isHomeZone: isHomeZone,
					color: color,
					x: colIndex,
					y: rowIndex
				};
			}
		}
		
		// console.log('Board retrieved with dimensions:', boardWithProperties.length, 'x', 
		// 	(boardWithProperties[0] ? boardWithProperties[0].length : 0));
		
		return boardWithProperties;
	} catch (error) {
		console.error('Error getting board:', error);
		// Create a new default board but don't call getBoard again
		return createDefaultBoard();
	}
}

/**
 * Check if a position is in a home zone
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @returns {boolean} True if position is in a home zone
 */
function isPositionInHomeZone(x, y) {
	// Check if position exists in any home zone
	for (const playerId in homeZones) {
		if (homeZones[playerId] && Array.isArray(homeZones[playerId])) {
			for (const position of homeZones[playerId]) {
				if (position.x === x && position.y === y) {
					return true;
				}
			}
		}
	}
	
	// Default home zone at the bottom of the board if no home zones defined
	if (Object.keys(homeZones).length === 0) {
		return y >= GAME_CONSTANTS.BOARD_HEIGHT - 2;
	}
	
	return false;
}

/**
 * Create a default board if none exists
 * @returns {Array} 2D array representing the default board
 */
function createDefaultBoard() {
	try {
		console.log('Creating default board...');
		
		// Initialize board with proper dimensions
		board = []; // Set the module-level board variable directly
		for (let y = 0; y < GAME_CONSTANTS.BOARD_HEIGHT; y++) {
			board[y] = Array(GAME_CONSTANTS.BOARD_WIDTH).fill(null);
		}
		
		// Create a copy of the board with additional cell properties for return value
		const boardWithProperties = [];
		for (let rowIndex = 0; rowIndex < GAME_CONSTANTS.BOARD_HEIGHT; rowIndex++) {
			boardWithProperties[rowIndex] = [];
			for (let colIndex = 0; colIndex < GAME_CONSTANTS.BOARD_WIDTH; colIndex++) {
				// Default home zone at the bottom of the board
				const isHomeZone = rowIndex >= GAME_CONSTANTS.BOARD_HEIGHT - 2;
				
				// Determine cell color based on position and home zone
				let color;
				if (isHomeZone) {
					color = 0xFFD54F; // Yellow for home zone
				} else {
					color = (colIndex + rowIndex) % 2 === 0 ? 0x4FC3F7 : 0x29B6F6; // Checkerboard pattern
				}
				
				boardWithProperties[rowIndex][colIndex] = {
					piece: null,
					isHomeZone: isHomeZone,
					color: color,
					x: colIndex,
					y: rowIndex
				};
			}
		}
		
		console.log('Default board created with dimensions:', board.length, 'x', 
			(board[0] ? board[0].length : 0));
		
		return boardWithProperties;
	} catch (error) {
		console.error('Error creating default board:', error);
		// Return a minimal valid board to prevent further errors
		return Array(GAME_CONSTANTS.BOARD_HEIGHT).fill().map(() => 
			Array(GAME_CONSTANTS.BOARD_WIDTH).fill().map(() => ({
				piece: null,
				isHomeZone: false,
				color: 0x4FC3F7,
				x: 0,
				y: 0
			}))
		);
	}
}

/**
 * Get home zones
 * @returns {Object} - Home zones
 */
export function getHomeZones() {
	return homeZones;
}

/**
 * Get selected piece
 * @returns {Object|null} - Selected piece or null if none selected
 */
export function getSelectedPiece() {
	return selectedPiece;
}

/**
 * Get valid moves
 * @returns {Array} - Valid moves for selected piece
 */
export function getValidMoves() {
	return validMoves;
}

/**
 * Reset the chess piece manager
 */
export function reset() {
	init();
}

/**
 * Set up initial chess pieces for all players
 */
export function setupInitialPieces() {
	try {
		console.log('Setting up initial chess pieces...');
		
		// Get current player ID
		const playerId = SessionManager.getPlayerId();
		
		if (!playerId) {
			console.error('No player ID found');
			return;
		}
		
		// Initialize home zone for the current player
		initHomeZone(playerId);
		
		// Mark the home zone cells on the board
		const homeZone = homeZones[playerId];
		if (homeZone) {
			for (let y = homeZone.y; y < homeZone.y + homeZone.height; y++) {
				for (let x = homeZone.x; x < homeZone.x + homeZone.width; x++) {
					// Ensure the board is large enough
					while (board.length <= y) {
						board.push(Array(GAME_CONSTANTS.BOARD_WIDTH).fill(null));
					}
					
					// Mark cell as home zone
					board[y][x] = {
						id: `cell_${x}_${y}`,
						type: 'cell',
						isHomeZone: true,
						playerId: playerId,
						color: 0xFFD54F // Yellow for home zone
					};
				}
			}
		}
		
		// Create chess pieces for the player
		createChessPieces(playerId);
		
		console.log('Initial chess pieces set up successfully');
	} catch (error) {
		console.error('Error setting up initial chess pieces:', error);
	}
}

/**
 * Get all chess pieces
 * @returns {Object} - All chess pieces
 */
export function getChessPieces() {
	return chessPieces;
}

export function getAllPieces() {
	return {
		chessPieces,
		homeZones
	};
}

/**
 * Get the count of captured pieces
 * @returns {number} The number of captured pieces
 */
export function getCapturedPiecesCount() {
	try {
		// If we have a capturedPieces array, return its length
		if (capturedPieces && Array.isArray(capturedPieces)) {
			return capturedPieces.length;
		}
		
		// If we don't have a capturedPieces array, count the pieces that are marked as captured
		let count = 0;
		for (const pieceId in chessPieces) {
			if (chessPieces[pieceId].captured) {
				count++;
			}
		}
		
		return count;
	} catch (error) {
		console.error('Error getting captured pieces count:', error);
		return 0;
	}
}