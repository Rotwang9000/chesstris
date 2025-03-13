/**
 * Renderer Module
 * 
 * Handles the game's visual representation using canvas.
 */

import * as ChessPieceManager from '../core/chessPieceManager.js';
import * as TetrominoManager from '../core/tetrominoManager.js';
import * as GameState from '../core/gameState.js';

// Canvas and context
let canvas;
let ctx;

// Cell size
const CELL_SIZE = 30;

// Colors
const COLORS = {
	background: '#1a1a1a',
	grid: '#333333',
	homeZone1: '#2c3e50',
	homeZone2: '#c0392b',
	highlight: 'rgba(255, 255, 0, 0.3)',
	validMove: 'rgba(0, 255, 0, 0.3)',
	invalidMove: 'rgba(255, 0, 0, 0.3)',
	ghostPiece: 'rgba(255, 255, 255, 0.2)',
	text: '#ffffff',
	pauseOverlay: 'rgba(0, 0, 0, 0.7)',
	notification: 'rgba(0, 0, 0, 0.8)',
	chatBackground: 'rgba(0, 0, 0, 0.5)',
	chatText: '#ffffff',
	playerInfo: '#333333',
	playerInfoText: '#ffffff'
};

// Highlighted cells
let highlightedCells = [];

// Game state
let gameState = null;

/**
 * Initialize the renderer
 * @param {string} canvasId - The ID of the canvas element
 * @param {Object} config - Configuration options
 */
export function init(canvasId = 'game-canvas', config = {}) {
	// Get the canvas element
	canvas = document.getElementById(canvasId);
	
	if (!canvas) {
		console.error('Canvas element not found');
		return;
	}
	
	// Get the 2D context
	ctx = canvas.getContext('2d');
	
	if (!ctx) {
		console.error('Could not get 2D context');
		return;
	}
	
	// Set up event listeners
	window.addEventListener('resize', handleResize);
	
	// Handle initial resize
	handleResize();
	
	console.log('Renderer initialized');
}

/**
 * Handle window resize
 */
function handleResize() {
	if (!canvas) return;
	
	// Adjust canvas size
	canvas.width = window.innerWidth * 0.8;
	canvas.height = window.innerHeight * 0.8;
	
	// Re-render
	if (gameState) {
		render(gameState);
	}
}

/**
 * Render the game
 * @param {Object} state - The game state
 */
export function render(state) {
	if (!ctx || !canvas) return;
	
	// Store the game state
	gameState = state;
	
	// Clear the canvas
	ctx.fillStyle = COLORS.background;
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	
	// Draw the grid
	drawGrid(state);
	
	// Draw the board
	drawBoard(state);
	
	// Draw the falling piece
	drawFallingPiece(state);
	
	// Draw the ghost piece
	drawGhostPiece(state);
	
	// Draw highlighted cells
	drawHighlightedCells();
	
	// Draw player info
	drawPlayerInfo(state);
	
	// Draw pause overlay if paused
	if (state.isPaused) {
		drawPauseOverlay();
	}
	
	// Draw game over overlay if game is over
	if (state.isGameOver) {
		drawGameOverOverlay(state);
	}
}

/**
 * Draw the grid
 * @param {Object} state - The game state
 */
function drawGrid(state) {
	if (!ctx || !canvas) return;
	
	const { boardWidth, boardHeight } = state;
	
	// Draw grid lines
	ctx.strokeStyle = COLORS.grid;
	ctx.lineWidth = 1;
	
	// Draw vertical lines
	for (let x = 0; x <= boardWidth; x++) {
		ctx.beginPath();
		ctx.moveTo(x * CELL_SIZE, 0);
		ctx.lineTo(x * CELL_SIZE, boardHeight * CELL_SIZE);
		ctx.stroke();
	}
	
	// Draw horizontal lines
	for (let y = 0; y <= boardHeight; y++) {
		ctx.beginPath();
		ctx.moveTo(0, y * CELL_SIZE);
		ctx.lineTo(boardWidth * CELL_SIZE, y * CELL_SIZE);
		ctx.stroke();
	}
}

/**
 * Draw the board
 * @param {Object} state - The game state
 */
function drawBoard(state) {
	if (!ctx || !canvas) return;
	
	const { board, homeZones, boardWidth, boardHeight } = state;
	
	// Draw home zones
	if (homeZones) {
		for (const playerId in homeZones) {
			const zone = homeZones[playerId];
			const color = playerId === state.playerId ? COLORS.homeZone1 : COLORS.homeZone2;
			
			ctx.fillStyle = color;
			ctx.fillRect(
				zone.x * CELL_SIZE,
				zone.y * CELL_SIZE,
				zone.width * CELL_SIZE,
				zone.height * CELL_SIZE
			);
		}
	}
	
	// Draw board cells
	if (board) {
		for (let y = 0; y < boardHeight; y++) {
			if (!board[y]) continue;
			
			for (let x = 0; x < boardWidth; x++) {
				if (!board[y][x]) continue;
				
				const cell = board[y][x];
				
				// Draw cell
				drawCell(cell);
				
				// Draw tetromino if present
				if (cell.type === 'tetromino') {
					drawTetrominoCell(cell.tetrominoType, x, y);
				}
				
				// Draw piece if present
				if (cell.piece) {
					drawChessPiece(cell.piece, x, y);
				}
			}
		}
	}
}

/**
 * Draw a cell
 * @param {Object} cell - The cell to draw
 */
function drawCell(cell) {
	if (!ctx) return;
	
	const { x, y, playerId, inHomeZone } = cell;
	
	// Draw cell background
	if (inHomeZone) {
		ctx.fillStyle = playerId === gameState.playerId ? COLORS.homeZone1 : COLORS.homeZone2;
	} else {
		ctx.fillStyle = COLORS.grid;
	}
	
	ctx.fillRect(
		x * CELL_SIZE,
		y * CELL_SIZE,
		CELL_SIZE,
		CELL_SIZE
	);
}

/**
 * Draw a chess piece
 * @param {Object} piece - The chess piece to draw
 * @param {number} x - The x coordinate
 * @param {number} y - The y coordinate
 */
function drawChessPiece(piece, x, y) {
	if (!ctx) return;
	
	const { type, playerId } = piece;
	
	// Set color based on player
	ctx.fillStyle = playerId === gameState.playerId ? '#ffffff' : '#ff0000';
	
	// Draw piece
	ctx.beginPath();
	ctx.arc(
		(x + 0.5) * CELL_SIZE,
		(y + 0.5) * CELL_SIZE,
		CELL_SIZE * 0.4,
		0,
		Math.PI * 2
	);
	ctx.fill();
	
	// Draw piece type
	ctx.fillStyle = '#000000';
	ctx.font = '12px Arial';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(
		type.charAt(0).toUpperCase(),
		(x + 0.5) * CELL_SIZE,
		(y + 0.5) * CELL_SIZE
	);
}

/**
 * Draw the falling piece
 * @param {Object} state - The game state
 */
function drawFallingPiece(state) {
	if (!ctx) return;
	
	const { fallingPiece } = state;
	
	if (!fallingPiece) return;
	
	const { type, rotation, x, y, playerId } = fallingPiece;
	
	// Get tetromino shape
	const shape = TetrominoManager.getTetrominoShape(type, rotation);
	
	// Set color based on tetromino type
	ctx.fillStyle = getTetrominoColor(type);
	
	// Draw tetromino
	for (let i = 0; i < shape.length; i++) {
		for (let j = 0; j < shape[i].length; j++) {
			if (shape[i][j]) {
				ctx.fillRect(
					(x + j) * CELL_SIZE,
					(y + i) * CELL_SIZE,
					CELL_SIZE,
					CELL_SIZE
				);
			}
		}
	}
}

/**
 * Draw the ghost piece
 * @param {Object} state - The game state
 */
function drawGhostPiece(state) {
	if (!ctx) return;
	
	const { ghostPiece } = state;
	
	if (!ghostPiece) return;
	
	const { type, rotation, x, y } = ghostPiece;
	
	// Get tetromino shape
	const shape = TetrominoManager.getTetrominoShape(type, rotation);
	
	// Set color for ghost piece
	ctx.fillStyle = COLORS.ghostPiece;
	
	// Draw ghost tetromino
	for (let i = 0; i < shape.length; i++) {
		for (let j = 0; j < shape[i].length; j++) {
			if (shape[i][j]) {
				ctx.fillRect(
					(x + j) * CELL_SIZE,
					(y + i) * CELL_SIZE,
					CELL_SIZE,
					CELL_SIZE
				);
			}
		}
	}
}

/**
 * Draw highlighted cells
 */
function drawHighlightedCells() {
	if (!ctx) return;
	
	// Draw highlighted cells
	for (const [x, y, type] of highlightedCells) {
		let color;
		
		switch (type) {
			case 'highlight':
				color = COLORS.highlight;
				break;
			case 'valid':
				color = COLORS.validMove;
				break;
			case 'invalid':
				color = COLORS.invalidMove;
				break;
			default:
				color = COLORS.highlight;
		}
		
		ctx.fillStyle = color;
		ctx.fillRect(
			x * CELL_SIZE,
			y * CELL_SIZE,
			CELL_SIZE,
			CELL_SIZE
		);
	}
}

/**
 * Draw player info
 * @param {Object} state - The game state
 */
function drawPlayerInfo(state) {
	if (!ctx || !canvas) return;
	
	const { players } = state;
	
	if (!players) return;
	
	// Draw player info
	let y = 10;
	
	for (const playerId in players) {
		const player = players[playerId];
		
		// Draw player info background
		ctx.fillStyle = COLORS.playerInfo;
		ctx.fillRect(
			canvas.width - 200,
			y,
			190,
			60
		);
		
		// Draw player name
		ctx.fillStyle = COLORS.playerInfoText;
		ctx.font = '14px Arial';
		ctx.textAlign = 'left';
		ctx.textBaseline = 'top';
		ctx.fillText(
			`Player: ${player.name}`,
			canvas.width - 190,
			y + 10
		);
		
		// Draw player score
		ctx.fillText(
			`Score: ${player.score || 0}`,
			canvas.width - 190,
			y + 30
		);
		
		// Highlight current player
		if (playerId === state.playerId) {
			ctx.strokeStyle = '#ffff00';
			ctx.lineWidth = 2;
			ctx.strokeRect(
				canvas.width - 200,
				y,
				190,
				60
			);
		}
		
		y += 70;
	}
}

/**
 * Draw pause overlay
 */
function drawPauseOverlay() {
	if (!ctx || !canvas) return;
	
	// Draw overlay
	ctx.fillStyle = COLORS.pauseOverlay;
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	
	// Draw pause text
	ctx.fillStyle = COLORS.text;
	ctx.font = '36px Arial';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(
		'PAUSED',
		canvas.width / 2,
		canvas.height / 2
	);
	
	// Draw resume instructions
	ctx.font = '18px Arial';
	ctx.fillText(
		'Press P to resume',
		canvas.width / 2,
		canvas.height / 2 + 40
	);
}

/**
 * Draw game over overlay
 * @param {Object} state - The game state
 */
function drawGameOverOverlay(state) {
	if (!ctx || !canvas) return;
	
	// Draw overlay
	ctx.fillStyle = COLORS.pauseOverlay;
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	
	// Draw game over text
	ctx.fillStyle = COLORS.text;
	ctx.font = '36px Arial';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(
		'GAME OVER',
		canvas.width / 2,
		canvas.height / 2 - 40
	);
	
	// Draw winner text
	if (state.winner) {
		const winnerName = state.players[state.winner]?.name || 'Unknown';
		ctx.font = '24px Arial';
		ctx.fillText(
			`Winner: ${winnerName}`,
			canvas.width / 2,
			canvas.height / 2
		);
	}
	
	// Draw restart instructions
	ctx.font = '18px Arial';
	ctx.fillText(
		'Click New Game to play again',
		canvas.width / 2,
		canvas.height / 2 + 40
	);
}

/**
 * Get tetromino color based on type
 * @param {string} type - The tetromino type
 * @returns {string} The color
 */
function getTetrominoColor(type) {
	switch (type) {
		case 'I': return '#00bcd4'; // Cyan
		case 'O': return '#ffeb3b'; // Yellow
		case 'T': return '#9c27b0'; // Purple
		case 'J': return '#2196f3'; // Blue
		case 'L': return '#ff9800'; // Orange
		case 'S': return '#4caf50'; // Green
		case 'Z': return '#f44336'; // Red
		default: return '#ffffff'; // White
	}
}

/**
 * Highlight cells
 * @param {Array} cells - Array of [x, y] coordinates to highlight
 * @param {string} type - The type of highlight (highlight, valid, invalid)
 */
export function highlightCells(cells, type = 'valid') {
	highlightedCells = cells.map(([x, y]) => [x, y, type]);
	
	// Re-render
	if (gameState) {
		render(gameState);
	}
}

/**
 * Clear highlighted cells
 */
export function clearHighlights() {
	highlightedCells = [];
	
	// Re-render
	if (gameState) {
		render(gameState);
	}
}

/**
 * Show notification
 * @param {string} message - The notification message
 */
export function showNotification(message) {
	if (!ctx || !canvas) return;
	
	// Draw notification background
	ctx.fillStyle = COLORS.notification;
	ctx.fillRect(
		canvas.width / 2 - 150,
		20,
		300,
		40
	);
	
	// Draw notification text
	ctx.fillStyle = COLORS.text;
	ctx.font = '16px Arial';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(
		message,
		canvas.width / 2,
		40
	);
	
	// Remove notification after 3 seconds
	setTimeout(() => {
		// Re-render
		if (gameState) {
			render(gameState);
		}
	}, 3000);
}

/**
 * Show chat message
 * @param {Object} data - The chat message data
 */
export function showChatMessage(data) {
	if (!ctx || !canvas) return;
	
	const { playerId, message } = data;
	const playerName = gameState.players[playerId]?.name || 'Unknown';
	
	// Draw chat background
	ctx.fillStyle = COLORS.chatBackground;
	ctx.fillRect(
		10,
		canvas.height - 60,
		300,
		50
	);
	
	// Draw chat text
	ctx.fillStyle = COLORS.chatText;
	ctx.font = '14px Arial';
	ctx.textAlign = 'left';
	ctx.textBaseline = 'top';
	ctx.fillText(
		`${playerName}: ${message}`,
		20,
		canvas.height - 50
	);
	
	// Remove chat message after 5 seconds
	setTimeout(() => {
		// Re-render
		if (gameState) {
			render(gameState);
		}
	}, 5000);
}

/**
 * Show pause screen
 */
export function showPauseScreen() {
	if (gameState) {
		gameState.isPaused = true;
		render(gameState);
	}
}

/**
 * Hide pause screen
 */
export function hidePauseScreen() {
	if (gameState) {
		gameState.isPaused = false;
		render(gameState);
	}
}

/**
 * Show game over screen
 * @param {string} winner - The winner's player ID
 */
export function showGameOver(winner) {
	if (gameState) {
		gameState.isGameOver = true;
		gameState.winner = winner;
		render(gameState);
	}
}

/**
 * Highlight a cell on the board
 * @param {number} x - The x coordinate
 * @param {number} y - The y coordinate
 * @param {string} type - The type of highlight ('selected' or 'valid-move')
 */
export function highlightCell(x, y, type) {
	const gameState = GameState.getGameState();
	const cellSize = gameState.cellSize || CELL_SIZE;
	
	// Create highlight element
	const highlight = document.createElement('div');
	highlight.className = `cell-highlight ${type}`;
	highlight.style.width = `${cellSize}px`;
	highlight.style.height = `${cellSize}px`;
	highlight.style.left = `${x * cellSize}px`;
	highlight.style.top = `${y * cellSize}px`;
	highlight.dataset.x = x;
	highlight.dataset.y = y;
	
	// Add to highlights container
	const highlightsContainer = getHighlightsContainer();
	highlightsContainer.appendChild(highlight);
}

/**
 * Get or create the highlights container
 * @returns {HTMLElement} The highlights container
 */
function getHighlightsContainer() {
	let highlightsContainer = document.getElementById('highlights-container');
	
	if (!highlightsContainer) {
		highlightsContainer = document.createElement('div');
		highlightsContainer.id = 'highlights-container';
		highlightsContainer.style.position = 'absolute';
		highlightsContainer.style.top = '0';
		highlightsContainer.style.left = '0';
		highlightsContainer.style.pointerEvents = 'none';
		
		const boardContainer = document.getElementById('board-container');
		boardContainer.appendChild(highlightsContainer);
	}
	
	return highlightsContainer;
}

/**
 * Draw a tetromino cell
 * @param {string} type - The tetromino type
 * @param {number} x - The x coordinate
 * @param {number} y - The y coordinate
 */
function drawTetrominoCell(type, x, y) {
	if (!ctx) return;
	
	// Set color based on tetromino type
	ctx.fillStyle = getTetrominoColor(type);
	
	// Draw tetromino cell
	ctx.fillRect(
		x * CELL_SIZE + 1,
		y * CELL_SIZE + 1,
		CELL_SIZE - 2,
		CELL_SIZE - 2
	);
	
	// Draw highlight
	ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
	ctx.beginPath();
	ctx.moveTo(x * CELL_SIZE + 1, y * CELL_SIZE + 1);
	ctx.lineTo(x * CELL_SIZE + CELL_SIZE - 1, y * CELL_SIZE + 1);
	ctx.lineTo(x * CELL_SIZE + CELL_SIZE - 1, y * CELL_SIZE + CELL_SIZE - 1);
	ctx.lineTo(x * CELL_SIZE + 1, y * CELL_SIZE + CELL_SIZE - 1);
	ctx.closePath();
	ctx.fill();
}

/**
 * Draw a tetromino in the next piece preview
 * @param {Object} tetromino - The tetromino to draw
 * @param {HTMLElement} container - The container element for the preview
 */
export function drawNextPiecePreview(tetromino, container) {
	// Clear the container
	container.innerHTML = '';
	
	if (!tetromino) return;
	
	// Create a 4x4 grid for the preview
	const previewGrid = document.createElement('div');
	previewGrid.className = 'next-piece-grid';
	
	// Get the shape of the tetromino
	const shape = tetromino.shape;
	
	// Create a 4x4 grid
	for (let y = 0; y < 4; y++) {
		for (let x = 0; x < 4; x++) {
			const cell = document.createElement('div');
			cell.className = 'next-piece-cell';
			
			// Check if this cell is part of the tetromino
			let isFilled = false;
			
			// For each block in the tetromino shape
			for (let i = 0; i < shape.length; i++) {
				const blockX = shape[i][0];
				const blockY = shape[i][1];
				
				// Adjust coordinates to center the piece in the preview
				const adjustedX = blockX + 1; // Center horizontally
				const adjustedY = blockY + 1; // Center vertically
				
				if (adjustedX === x && adjustedY === y) {
					isFilled = true;
					break;
				}
			}
			
			if (isFilled) {
				cell.classList.add('filled');
				cell.style.backgroundColor = tetromino.color;
			}
			
			previewGrid.appendChild(cell);
		}
	}
	
	container.appendChild(previewGrid);
}

