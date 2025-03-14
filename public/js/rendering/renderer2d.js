/**
 * 2D Renderer
 * 
 * Handles rendering the game in 2D mode using the Canvas API.
 */

import { GAME_CONSTANTS } from '../core/constants.js';

// Canvas and context
let canvas = null;
let ctx = null;

// Cell size
let cellSize = 30;

// Board dimensions
let boardWidth = GAME_CONSTANTS.BOARD_WIDTH;
let boardHeight = GAME_CONSTANTS.BOARD_HEIGHT;

// Colors
const COLORS = {
	BACKGROUND: '#87CEEB',
	GRID: '#CCCCCC',
	CELL_LIGHT: '#4FC3F7',
	CELL_DARK: '#039BE5',
	HOME_ZONE: '#FFD54F',
	TETROMINO: {
		I: '#00BCD4',
		J: '#2196F3',
		L: '#FF9800',
		O: '#FFEB3B',
		S: '#4CAF50',
		T: '#9C27B0',
		Z: '#F44336'
	},
	GHOST: 'rgba(255, 255, 255, 0.3)',
	TEXT: '#FFFFFF',
	SHADOW: 'rgba(0, 0, 0, 0.5)'
};

/**
 * Initialize the 2D renderer
 * @param {HTMLCanvasElement} canvasElement - Canvas element
 * @param {CanvasRenderingContext2D} context - Canvas context
 * @returns {Promise<boolean>} - Whether initialization was successful
 */
export async function init(canvasElement, context) {
	try {
		console.log('Initializing 2D renderer');
		
		// Store canvas and context
		canvas = canvasElement;
		ctx = context;
		
		// Set initial dimensions
		resizeCanvas();
		
		console.log('2D renderer initialized');
		return true;
	} catch (error) {
		console.error('Error initializing 2D renderer:', error);
		return false;
	}
}

/**
 * Resize the canvas
 */
export function resizeCanvas() {
	try {
		if (!canvas) return;
		
		// Get container dimensions
		const container = canvas.parentElement;
		if (!container) return;
		
		const width = container.clientWidth;
		const height = container.clientHeight;
		
		// Set canvas dimensions
		canvas.width = width;
		canvas.height = height;
		
		// Calculate cell size based on board dimensions and canvas size
		const maxCellWidth = width / boardWidth;
		const maxCellHeight = height / boardHeight;
		cellSize = Math.min(maxCellWidth, maxCellHeight) * 0.9;
		
		// Center the board
		boardOffsetX = (width - (boardWidth * cellSize)) / 2;
		boardOffsetY = (height - (boardHeight * cellSize)) / 2;
	} catch (error) {
		console.error('Error resizing canvas:', error);
	}
}

// Board offset for centering
let boardOffsetX = 0;
let boardOffsetY = 0;

/**
 * Render the game state
 * @param {Object} gameState - Game state
 */
export function render(gameState) {
	try {
		if (!ctx || !canvas) return;
		
		// Clear canvas
		ctx.fillStyle = COLORS.BACKGROUND;
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		
		// Draw board
		drawBoard(gameState);
		
		// Draw tetromino
		if (gameState.fallingPiece) {
			drawTetromino(gameState.fallingPiece);
		}
		
		// Draw ghost piece
		if (gameState.ghostPiece) {
			drawGhostPiece(gameState.ghostPiece);
		}
		
		// Draw chess pieces
		if (gameState.chessPieces) {
			drawChessPieces(gameState.chessPieces);
		}
		
		// Draw UI elements
		drawUI(gameState);
	} catch (error) {
		console.error('Error rendering game:', error);
	}
}

/**
 * Draw the game board
 * @param {Object} gameState - Game state
 */
function drawBoard(gameState) {
	try {
		// Draw background
		ctx.fillStyle = COLORS.BACKGROUND;
		ctx.fillRect(
			boardOffsetX,
			boardOffsetY,
			boardWidth * cellSize,
			boardHeight * cellSize
		);
		
		// Draw cells
		for (let y = 0; y < boardHeight; y++) {
			for (let x = 0; x < boardWidth; x++) {
				// Determine cell color
				const isEvenCell = (x + y) % 2 === 0;
				const isHomeZone = gameState && gameState.homeZones && 
					Object.values(gameState.homeZones).some(zone => 
						x >= zone.x && x < zone.x + zone.width && 
						y >= zone.y && y < zone.y + zone.height
					);
				
				let cellColor = isEvenCell ? COLORS.CELL_LIGHT : COLORS.CELL_DARK;
				
				if (isHomeZone) {
					cellColor = COLORS.HOME_ZONE;
				}
				
				// Draw cell
				ctx.fillStyle = cellColor;
				ctx.fillRect(
					boardOffsetX + x * cellSize,
					boardOffsetY + y * cellSize,
					cellSize,
					cellSize
				);
				
				// Draw cell border
				ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
				ctx.lineWidth = 1;
				ctx.strokeRect(
					boardOffsetX + x * cellSize,
					boardOffsetY + y * cellSize,
					cellSize,
					cellSize
				);
				
				// Draw cell content if exists
				if (gameState && gameState.board && gameState.board[y] && gameState.board[y][x]) {
					const cell = gameState.board[y][x];
					
					if (cell.type === 'tetromino') {
						ctx.fillStyle = cell.color || '#FF0000';
						ctx.fillRect(
							boardOffsetX + x * cellSize + 1,
							boardOffsetY + y * cellSize + 1,
							cellSize - 2,
							cellSize - 2
						);
					}
				}
			}
		}
		
		// Draw grid
		ctx.strokeStyle = COLORS.GRID;
		ctx.lineWidth = 1;
		
		// Vertical lines
		for (let x = 0; x <= boardWidth; x++) {
			ctx.beginPath();
			ctx.moveTo(boardOffsetX + x * cellSize, boardOffsetY);
			ctx.lineTo(boardOffsetX + x * cellSize, boardOffsetY + boardHeight * cellSize);
			ctx.stroke();
		}
		
		// Horizontal lines
		for (let y = 0; y <= boardHeight; y++) {
			ctx.beginPath();
			ctx.moveTo(boardOffsetX, boardOffsetY + y * cellSize);
			ctx.lineTo(boardOffsetX + boardWidth * cellSize, boardOffsetY + y * cellSize);
			ctx.stroke();
		}
	} catch (error) {
		console.error('Error drawing board:', error);
	}
}

/**
 * Draw a tetromino
 * @param {Object} tetromino - Tetromino data
 */
function drawTetromino(tetromino) {
	try {
		if (!tetromino || !tetromino.shape) return;
		
		const shape = tetromino.shape;
		const color = tetromino.color || COLORS.TETROMINO.I;
		
		// Draw each block of the tetromino
		for (let y = 0; y < shape.length; y++) {
			for (let x = 0; x < shape[y].length; x++) {
				if (shape[y][x]) {
					const boardX = tetromino.x + x;
					const boardY = tetromino.y + y;
					
					// Draw block
					ctx.fillStyle = color;
					ctx.fillRect(
						boardOffsetX + boardX * cellSize + 1,
						boardOffsetY + boardY * cellSize + 1,
						cellSize - 2,
						cellSize - 2
					);
					
					// Draw highlight
					ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
					ctx.fillRect(
						boardOffsetX + boardX * cellSize + 1,
						boardOffsetY + boardY * cellSize + 1,
						cellSize - 2,
						cellSize / 4
					);
					
					// Draw shadow
					ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
					ctx.fillRect(
						boardOffsetX + boardX * cellSize + 1,
						boardOffsetY + boardY * cellSize + cellSize - cellSize / 4,
						cellSize - 2,
						cellSize / 4 - 1
					);
				}
			}
		}
	} catch (error) {
		console.error('Error drawing tetromino:', error);
	}
}

/**
 * Draw a ghost piece
 * @param {Object} ghostPiece - Ghost piece data
 */
function drawGhostPiece(ghostPiece) {
	try {
		if (!ghostPiece || !ghostPiece.shape) return;
		
		const shape = ghostPiece.shape;
		
		// Draw each block of the ghost piece
		for (let y = 0; y < shape.length; y++) {
			for (let x = 0; x < shape[y].length; x++) {
				if (shape[y][x]) {
					const boardX = ghostPiece.x + x;
					const boardY = ghostPiece.y + y;
					
					// Draw block
					ctx.fillStyle = COLORS.GHOST;
					ctx.fillRect(
						boardOffsetX + boardX * cellSize + 3,
						boardOffsetY + boardY * cellSize + 3,
						cellSize - 6,
						cellSize - 6
					);
					
					// Draw border
					ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
					ctx.lineWidth = 1;
					ctx.strokeRect(
						boardOffsetX + boardX * cellSize + 3,
						boardOffsetY + boardY * cellSize + 3,
						cellSize - 6,
						cellSize - 6
					);
				}
			}
		}
	} catch (error) {
		console.error('Error drawing ghost piece:', error);
	}
}

/**
 * Draw chess pieces
 * @param {Object} chessPieces - Chess pieces data
 */
function drawChessPieces(chessPieces) {
	try {
		if (!chessPieces) return;
		
		// Draw each chess piece
		for (const pieceId in chessPieces) {
			const piece = chessPieces[pieceId];
			
			if (!piece) continue;
			
			const x = piece.x;
			const y = piece.y;
			
			// Draw piece
			ctx.fillStyle = piece.playerId === 'player1' ? '#FFFFFF' : '#000000';
			ctx.beginPath();
			ctx.arc(
				boardOffsetX + x * cellSize + cellSize / 2,
				boardOffsetY + y * cellSize + cellSize / 2,
				cellSize / 3,
				0,
				Math.PI * 2
			);
			ctx.fill();
			
			// Draw piece border
			ctx.strokeStyle = piece.playerId === 'player1' ? '#000000' : '#FFFFFF';
			ctx.lineWidth = 2;
			ctx.stroke();
			
			// Draw piece type
			ctx.fillStyle = piece.playerId === 'player1' ? '#000000' : '#FFFFFF';
			ctx.font = `bold ${cellSize / 3}px Arial`;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(
				getPieceSymbol(piece.type),
				boardOffsetX + x * cellSize + cellSize / 2,
				boardOffsetY + y * cellSize + cellSize / 2
			);
		}
	} catch (error) {
		console.error('Error drawing chess pieces:', error);
	}
}

/**
 * Get chess piece symbol
 * @param {string} type - Piece type
 * @returns {string} - Piece symbol
 */
function getPieceSymbol(type) {
	switch (type) {
		case 'king': return 'K';
		case 'queen': return 'Q';
		case 'rook': return 'R';
		case 'bishop': return 'B';
		case 'knight': return 'N';
		case 'pawn': return 'P';
		default: return '?';
	}
}

/**
 * Draw UI elements
 * @param {Object} gameState - Game state
 */
function drawUI(gameState) {
	try {
		// Draw score
		if (gameState.players) {
			const player = gameState.players[gameState.currentPlayerId];
			
			if (player) {
				ctx.fillStyle = COLORS.TEXT;
				ctx.font = '20px Arial';
				ctx.textAlign = 'left';
				ctx.textBaseline = 'top';
				ctx.fillText(`Score: ${player.score}`, 10, 10);
				ctx.fillText(`Level: ${player.level}`, 10, 40);
				ctx.fillText(`Lines: ${player.linesCleared}`, 10, 70);
			}
		}
		
		// Draw next piece
		if (gameState.nextPieces && gameState.nextPieces.length > 0) {
			const nextPiece = gameState.nextPieces[0];
			
			if (nextPiece) {
				ctx.fillStyle = COLORS.TEXT;
				ctx.font = '20px Arial';
				ctx.textAlign = 'right';
				ctx.textBaseline = 'top';
				ctx.fillText('Next:', canvas.width - 10, 10);
				
				// Draw next piece preview
				const shape = TETROMINO_SHAPES[nextPiece];
				const color = TETROMINO_COLORS[nextPiece];
				
				if (shape) {
					const previewSize = cellSize * 0.8;
					const previewX = canvas.width - 10 - shape[0].length * previewSize;
					const previewY = 40;
					
					for (let y = 0; y < shape.length; y++) {
						for (let x = 0; x < shape[y].length; x++) {
							if (shape[y][x]) {
								ctx.fillStyle = color;
								ctx.fillRect(
									previewX + x * previewSize,
									previewY + y * previewSize,
									previewSize - 1,
									previewSize - 1
								);
							}
						}
					}
				}
			}
		}
		
		// Draw held piece
		if (gameState.heldPiece) {
			const heldPiece = gameState.heldPiece;
			
			ctx.fillStyle = COLORS.TEXT;
			ctx.font = '20px Arial';
			ctx.textAlign = 'right';
			ctx.textBaseline = 'top';
			ctx.fillText('Hold:', canvas.width - 10, 120);
			
			// Draw held piece preview
			const shape = TETROMINO_SHAPES[heldPiece];
			const color = TETROMINO_COLORS[heldPiece];
			
			if (shape) {
				const previewSize = cellSize * 0.8;
				const previewX = canvas.width - 10 - shape[0].length * previewSize;
				const previewY = 150;
				
				for (let y = 0; y < shape.length; y++) {
					for (let x = 0; x < shape[y].length; x++) {
						if (shape[y][x]) {
							ctx.fillStyle = color;
							ctx.fillRect(
								previewX + x * previewSize,
								previewY + y * previewSize,
								previewSize - 1,
								previewSize - 1
							);
						}
					}
				}
			}
		}
	} catch (error) {
		console.error('Error drawing UI:', error);
	}
}

/**
 * Update the renderer
 * @param {number} deltaTime - Time since last update
 */
export function update(deltaTime) {
	// No animation in 2D mode
}

/**
 * Clear the renderer
 */
export function clear() {
	try {
		if (!ctx || !canvas) return;
		
		ctx.clearRect(0, 0, canvas.width, canvas.height);
	} catch (error) {
		console.error('Error clearing renderer:', error);
	}
}

/**
 * Handle window resize
 * @param {number} width - New width
 * @param {number} height - New height
 */
export function handleResize(width, height) {
	try {
		resizeCanvas();
	} catch (error) {
		console.error('Error handling resize:', error);
	}
}

/**
 * Dispose of resources
 */
export function dispose() {
	try {
		canvas = null;
		ctx = null;
	} catch (error) {
		console.error('Error disposing renderer:', error);
	}
}

// Export constants
export const TETROMINO_SHAPES = {
	I: [
		[1, 1, 1, 1]
	],
	J: [
		[1, 0, 0],
		[1, 1, 1]
	],
	L: [
		[0, 0, 1],
		[1, 1, 1]
	],
	O: [
		[1, 1],
		[1, 1]
	],
	S: [
		[0, 1, 1],
		[1, 1, 0]
	],
	T: [
		[0, 1, 0],
		[1, 1, 1]
	],
	Z: [
		[1, 1, 0],
		[0, 1, 1]
	]
};

export const TETROMINO_COLORS = {
	I: COLORS.TETROMINO.I,
	J: COLORS.TETROMINO.J,
	L: COLORS.TETROMINO.L,
	O: COLORS.TETROMINO.O,
	S: COLORS.TETROMINO.S,
	T: COLORS.TETROMINO.T,
	Z: COLORS.TETROMINO.Z
}; 