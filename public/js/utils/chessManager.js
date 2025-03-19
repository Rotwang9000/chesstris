/**
 * Chess Manager Utility
 * 
 * Manages chess pieces and their movement
 */

// Constants
const PIECE_TYPES = {
	PAWN: 'pawn',
	ROOK: 'rook',
	KNIGHT: 'knight',
	BISHOP: 'bishop',
	QUEEN: 'queen',
	KING: 'king'
};

const PIECE_COLORS = {
	WHITE: 1,
	BLACK: 2
};

// Chess state
let board = [];
let pieces = [];
let capturedPieces = [];
let selectedPiece = null;
let playerColor = PIECE_COLORS.WHITE;
let isInitialized = false;
let boardWidth = 8;
let boardHeight = 8;
let playerId = null;

/**
 * Initialize the chess manager
 * @param {Object} options - Configuration options
 * @returns {boolean} Success status
 */
export function init(options = {}) {
	try {
		if (isInitialized) {
			console.warn('Chess manager already initialized');
			return true;
		}
		
		console.log('Initializing chess manager...');
		
		// Apply options
		boardWidth = options.boardWidth || boardWidth;
		boardHeight = options.boardHeight || boardHeight;
		playerColor = options.playerColor === 'black' ? PIECE_COLORS.BLACK : PIECE_COLORS.WHITE;
		playerId = options.playerId || null;
		
		// Create board and pieces
		createBoard();
		createPieces();
		
		isInitialized = true;
		console.log('Chess manager initialized');
		return true;
	} catch (error) {
		console.error('Error initializing chess manager:', error);
		return false;
	}
}

/**
 * Set the player ID
 * @param {string} id - Player ID
 */
export function setPlayerId(id) {
	playerId = id;
}

/**
 * Get the player ID
 * @returns {string} Player ID
 */
export function getPlayerId() {
	return playerId;
}

/**
 * Create the chess board
 */
function createBoard() {
	board = Array(boardHeight).fill().map(() => Array(boardWidth).fill(0));
}

/**
 * Create chess pieces
 */
function createPieces() {
	pieces = [];
	capturedPieces = [];
	
	// Create pawns
	for (let i = 0; i < boardWidth; i++) {
		// White pawns
		pieces.push({
			id: `wp${i}`,
			type: PIECE_TYPES.PAWN,
			player: PIECE_COLORS.WHITE,
			position: { x: i, y: boardHeight - 2 },
			hasMoved: false
		});
		
		// Black pawns
		pieces.push({
			id: `bp${i}`,
			type: PIECE_TYPES.PAWN,
			player: PIECE_COLORS.BLACK,
			position: { x: i, y: 1 },
			hasMoved: false
		});
	}
	
	// Create rooks
	pieces.push({
		id: 'wr1',
		type: PIECE_TYPES.ROOK,
		player: PIECE_COLORS.WHITE,
		position: { x: 0, y: boardHeight - 1 },
		hasMoved: false
	});
	pieces.push({
		id: 'wr2',
		type: PIECE_TYPES.ROOK,
		player: PIECE_COLORS.WHITE,
		position: { x: boardWidth - 1, y: boardHeight - 1 },
		hasMoved: false
	});
	pieces.push({
		id: 'br1',
		type: PIECE_TYPES.ROOK,
		player: PIECE_COLORS.BLACK,
		position: { x: 0, y: 0 },
		hasMoved: false
	});
	pieces.push({
		id: 'br2',
		type: PIECE_TYPES.ROOK,
		player: PIECE_COLORS.BLACK,
		position: { x: boardWidth - 1, y: 0 },
		hasMoved: false
	});
	
	// Create knights
	pieces.push({
		id: 'wn1',
		type: PIECE_TYPES.KNIGHT,
		player: PIECE_COLORS.WHITE,
		position: { x: 1, y: boardHeight - 1 }
	});
	pieces.push({
		id: 'wn2',
		type: PIECE_TYPES.KNIGHT,
		player: PIECE_COLORS.WHITE,
		position: { x: boardWidth - 2, y: boardHeight - 1 }
	});
	pieces.push({
		id: 'bn1',
		type: PIECE_TYPES.KNIGHT,
		player: PIECE_COLORS.BLACK,
		position: { x: 1, y: 0 }
	});
	pieces.push({
		id: 'bn2',
		type: PIECE_TYPES.KNIGHT,
		player: PIECE_COLORS.BLACK,
		position: { x: boardWidth - 2, y: 0 }
	});
	
	// Create bishops
	pieces.push({
		id: 'wb1',
		type: PIECE_TYPES.BISHOP,
		player: PIECE_COLORS.WHITE,
		position: { x: 2, y: boardHeight - 1 }
	});
	pieces.push({
		id: 'wb2',
		type: PIECE_TYPES.BISHOP,
		player: PIECE_COLORS.WHITE,
		position: { x: boardWidth - 3, y: boardHeight - 1 }
	});
	pieces.push({
		id: 'bb1',
		type: PIECE_TYPES.BISHOP,
		player: PIECE_COLORS.BLACK,
		position: { x: 2, y: 0 }
	});
	pieces.push({
		id: 'bb2',
		type: PIECE_TYPES.BISHOP,
		player: PIECE_COLORS.BLACK,
		position: { x: boardWidth - 3, y: 0 }
	});
	
	// Create queens
	pieces.push({
		id: 'wq',
		type: PIECE_TYPES.QUEEN,
		player: PIECE_COLORS.WHITE,
		position: { x: 3, y: boardHeight - 1 }
	});
	pieces.push({
		id: 'bq',
		type: PIECE_TYPES.QUEEN,
		player: PIECE_COLORS.BLACK,
		position: { x: 3, y: 0 }
	});
	
	// Create kings
	pieces.push({
		id: 'wk',
		type: PIECE_TYPES.KING,
		player: PIECE_COLORS.WHITE,
		position: { x: 4, y: boardHeight - 1 },
		hasMoved: false
	});
	pieces.push({
		id: 'bk',
		type: PIECE_TYPES.KING,
		player: PIECE_COLORS.BLACK,
		position: { x: 4, y: 0 },
		hasMoved: false
	});
}

/**
 * Get all chess pieces
 * @returns {Array} Array of chess pieces
 */
export function getPieces() {
	return [...pieces];
}

/**
 * Get all captured pieces
 * @returns {Array} Array of captured pieces
 */
export function getCapturedPieces() {
	return [...capturedPieces];
}

/**
 * Get pieces by player
 * @param {number} player - Player color
 * @returns {Array} Array of player's pieces
 */
export function getPiecesByPlayer(player) {
	return pieces.filter(piece => piece.player === player);
}

/**
 * Get piece at position
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @returns {Object|null} Piece at position or null if none
 */
export function getPieceAtPosition(x, y) {
	return pieces.find(piece => piece.position.x === x && piece.position.y === y) || null;
}

/**
 * Select a piece
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @returns {boolean} Success status
 */
export function selectPiece(x, y) {
	try {
		// Get piece at position
		const piece = getPieceAtPosition(x, y);
		
		// If no piece or not player's piece, deselect
		if (!piece || piece.player !== playerColor) {
			selectedPiece = null;
			return false;
		}
		
		// Select piece
		selectedPiece = piece;
		return true;
	} catch (error) {
		console.error('Error selecting piece:', error);
		return false;
	}
}

/**
 * Get the selected piece
 * @returns {Object|null} Selected piece or null if none
 */
export function getSelectedPiece() {
	return selectedPiece;
}

/**
 * Move the selected piece
 * @param {number} x - Target X coordinate
 * @param {number} y - Target Y coordinate
 * @returns {boolean} Success status
 */
export function moveSelectedPiece(x, y) {
	try {
		// If no piece selected, return
		if (!selectedPiece) {
			return false;
		}
		
		// Check if move is valid
		if (!isValidMove(selectedPiece, x, y)) {
			return false;
		}
		
		// Check if there's a piece at the target position
		const targetPiece = getPieceAtPosition(x, y);
		
		// If there's a piece and it's the player's, select it instead
		if (targetPiece && targetPiece.player === playerColor) {
			selectedPiece = targetPiece;
			return true;
		}
		
		// If there's an opponent's piece, capture it
		if (targetPiece) {
			capturePiece(targetPiece);
		}
		
		// Move the piece
		const oldPosition = { ...selectedPiece.position };
		selectedPiece.position.x = x;
		selectedPiece.position.y = y;
		
		// Mark as moved (for pawns, kings, rooks)
		if (selectedPiece.hasMoved !== undefined) {
			selectedPiece.hasMoved = true;
		}
		
		// Check for pawn promotion
		if (selectedPiece.type === PIECE_TYPES.PAWN) {
			checkPawnPromotion(selectedPiece);
		}
		
		// Deselect piece
		selectedPiece = null;
		
		return true;
	} catch (error) {
		console.error('Error moving piece:', error);
		return false;
	}
}

/**
 * Check if a move is valid
 * @param {Object} piece - Piece to move
 * @param {number} x - Target X coordinate
 * @param {number} y - Target Y coordinate
 * @returns {boolean} Whether the move is valid
 */
function isValidMove(piece, x, y) {
	// Check if coordinates are within board
	if (x < 0 || x >= boardWidth || y < 0 || y >= boardHeight) {
		return false;
	}
	
	// Check if target position has a piece of the same color
	const targetPiece = getPieceAtPosition(x, y);
	if (targetPiece && targetPiece.player === piece.player) {
		return false;
	}
	
	// Check piece-specific movement rules
	switch (piece.type) {
		case PIECE_TYPES.PAWN:
			return isValidPawnMove(piece, x, y);
		case PIECE_TYPES.ROOK:
			return isValidRookMove(piece, x, y);
		case PIECE_TYPES.KNIGHT:
			return isValidKnightMove(piece, x, y);
		case PIECE_TYPES.BISHOP:
			return isValidBishopMove(piece, x, y);
		case PIECE_TYPES.QUEEN:
			return isValidQueenMove(piece, x, y);
		case PIECE_TYPES.KING:
			return isValidKingMove(piece, x, y);
		default:
			return false;
	}
}

/**
 * Check if a pawn move is valid
 * @param {Object} piece - Pawn piece
 * @param {number} x - Target X coordinate
 * @param {number} y - Target Y coordinate
 * @returns {boolean} Whether the move is valid
 */
function isValidPawnMove(piece, x, y) {
	const { position } = piece;
	const direction = piece.player === PIECE_COLORS.WHITE ? -1 : 1;
	const startRow = piece.player === PIECE_COLORS.WHITE ? boardHeight - 2 : 1;
	
	// Forward movement
	if (x === position.x && y === position.y + direction) {
		return !getPieceAtPosition(x, y);
	}
	
	// Double forward movement from starting position
	if (x === position.x && y === position.y + 2 * direction && position.y === startRow) {
		return !getPieceAtPosition(x, y) && !getPieceAtPosition(x, position.y + direction);
	}
	
	// Diagonal capture
	if ((x === position.x - 1 || x === position.x + 1) && y === position.y + direction) {
		const targetPiece = getPieceAtPosition(x, y);
		return targetPiece && targetPiece.player !== piece.player;
	}
	
	return false;
}

/**
 * Check if a rook move is valid
 * @param {Object} piece - Rook piece
 * @param {number} x - Target X coordinate
 * @param {number} y - Target Y coordinate
 * @returns {boolean} Whether the move is valid
 */
function isValidRookMove(piece, x, y) {
	const { position } = piece;
	
	// Must move horizontally or vertically
	if (x !== position.x && y !== position.y) {
		return false;
	}
	
	// Check for pieces in the way
	if (x === position.x) {
		// Vertical movement
		const start = Math.min(position.y, y) + 1;
		const end = Math.max(position.y, y);
		
		for (let i = start; i < end; i++) {
			if (getPieceAtPosition(x, i)) {
				return false;
			}
		}
	} else {
		// Horizontal movement
		const start = Math.min(position.x, x) + 1;
		const end = Math.max(position.x, x);
		
		for (let i = start; i < end; i++) {
			if (getPieceAtPosition(i, y)) {
				return false;
			}
		}
	}
	
	return true;
}

/**
 * Check if a knight move is valid
 * @param {Object} piece - Knight piece
 * @param {number} x - Target X coordinate
 * @param {number} y - Target Y coordinate
 * @returns {boolean} Whether the move is valid
 */
function isValidKnightMove(piece, x, y) {
	const { position } = piece;
	const dx = Math.abs(x - position.x);
	const dy = Math.abs(y - position.y);
	
	// Knight moves in an L shape: 2 squares in one direction and 1 in the other
	return (dx === 2 && dy === 1) || (dx === 1 && dy === 2);
}

/**
 * Check if a bishop move is valid
 * @param {Object} piece - Bishop piece
 * @param {number} x - Target X coordinate
 * @param {number} y - Target Y coordinate
 * @returns {boolean} Whether the move is valid
 */
function isValidBishopMove(piece, x, y) {
	const { position } = piece;
	const dx = Math.abs(x - position.x);
	const dy = Math.abs(y - position.y);
	
	// Must move diagonally
	if (dx !== dy) {
		return false;
	}
	
	// Check for pieces in the way
	const xDirection = x > position.x ? 1 : -1;
	const yDirection = y > position.y ? 1 : -1;
	
	for (let i = 1; i < dx; i++) {
		const checkX = position.x + i * xDirection;
		const checkY = position.y + i * yDirection;
		
		if (getPieceAtPosition(checkX, checkY)) {
			return false;
		}
	}
	
	return true;
}

/**
 * Check if a queen move is valid
 * @param {Object} piece - Queen piece
 * @param {number} x - Target X coordinate
 * @param {number} y - Target Y coordinate
 * @returns {boolean} Whether the move is valid
 */
function isValidQueenMove(piece, x, y) {
	// Queen can move like a rook or bishop
	return isValidRookMove(piece, x, y) || isValidBishopMove(piece, x, y);
}

/**
 * Check if a king move is valid
 * @param {Object} piece - King piece
 * @param {number} x - Target X coordinate
 * @param {number} y - Target Y coordinate
 * @returns {boolean} Whether the move is valid
 */
function isValidKingMove(piece, x, y) {
	const { position } = piece;
	const dx = Math.abs(x - position.x);
	const dy = Math.abs(y - position.y);
	
	// King can move one square in any direction
	return dx <= 1 && dy <= 1;
}

/**
 * Capture a piece
 * @param {Object} piece - Piece to capture
 */
function capturePiece(piece) {
	// Remove piece from pieces array
	const index = pieces.findIndex(p => p.id === piece.id);
	if (index !== -1) {
		pieces.splice(index, 1);
	}
	
	// Add to captured pieces
	capturedPieces.push(piece);
}

/**
 * Check for pawn promotion
 * @param {Object} pawn - Pawn piece
 */
function checkPawnPromotion(pawn) {
	const promotionRow = pawn.player === PIECE_COLORS.WHITE ? 0 : boardHeight - 1;
	
	// If pawn reached the end of the board, promote to knight
	if (pawn.position.y === promotionRow) {
		pawn.type = PIECE_TYPES.KNIGHT;
	}
}

/**
 * Reset the chess manager
 */
export function reset() {
	try {
		// Reset state
		createBoard();
		createPieces();
		selectedPiece = null;
		
		return true;
	} catch (error) {
		console.error('Error resetting chess manager:', error);
		return false;
	}
}

/**
 * Clean up resources
 */
export function cleanup() {
	try {
		console.log('Cleaning up chess manager...');
		
		// Reset state
		board = [];
		pieces = [];
		capturedPieces = [];
		selectedPiece = null;
		isInitialized = false;
		
		console.log('Chess manager cleaned up');
	} catch (error) {
		console.error('Error cleaning up chess manager:', error);
	}
}
