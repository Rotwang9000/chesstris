/**
 * Input Controller Module
 * 
 * Handles user input for both keyboard and touch/mobile interfaces.
 * Provides a unified interface for controlling tetrominos and chess pieces.
 */

import * as TetrominoManager from './tetrominoManager.js';
import * as ChessPieceManager from './chessPieceManager.js';
import * as GameState from './gameState.js';

// Input state tracking
const inputState = {
	// Tetromino movement
	left: false,
	right: false,
	up: false,
	down: false,
	rotate: false,
	drop: false,
	
	// Chess piece selection
	selectedPiece: null,
	selectedCell: null,
	
	// Touch tracking
	touchStartX: 0,
	touchStartY: 0,
	touchStartTime: 0,
	isTouching: false,
	isDragging: false,
	
	// Drag threshold in pixels
	dragThreshold: 10,
	
	// Double tap detection
	lastTapTime: 0,
	doubleTapDelay: 300, // ms
	
	// Long press detection
	longPressDelay: 500, // ms
	longPressTimer: null,
	
	// Mode tracking
	inputMode: 'tetromino', // 'tetromino' or 'chess'
};

// Keyboard mapping
const keyMap = {
	// Tetromino controls
	'ArrowLeft': 'left',
	'ArrowRight': 'right',
	'ArrowUp': 'up',
	'ArrowDown': 'down',
	'q': 'rotate',
	'Q': 'rotate',
	'a': 'drop',
	'A': 'drop',
	' ': 'drop', // Space bar
	
	// Chess piece controls
	'Enter': 'select',
	'Escape': 'cancel',
};

/**
 * Initialize the input controller
 */
export function init() {
	console.log('Initializing input controller...');
	
	// Set up keyboard event listeners
	setupKeyboardControls();
	
	// Set up touch event listeners
	setupTouchControls();
	
	// Set up mouse event listeners
	setupMouseControls();
	
	console.log('Input controller initialized');
}

/**
 * Set up keyboard controls
 */
function setupKeyboardControls() {
	// Keydown event
	document.addEventListener('keydown', (event) => {
		const action = keyMap[event.key];
		
		if (action) {
			// Update input state
			inputState[action] = true;
			
			// Handle immediate actions
			handleKeyAction(action, true);
			
			// Prevent default browser behavior for game controls
			event.preventDefault();
		}
	});
	
	// Keyup event
	document.addEventListener('keyup', (event) => {
		const action = keyMap[event.key];
		
		if (action) {
			// Update input state
			inputState[action] = false;
			
			// Handle key release actions
			handleKeyAction(action, false);
			
			// Prevent default browser behavior for game controls
			event.preventDefault();
		}
	});
}

/**
 * Handle keyboard action
 * @param {string} action - The action to perform
 * @param {boolean} isPressed - Whether the key is pressed or released
 */
function handleKeyAction(action, isPressed) {
	// Get the current game state
	const gameState = GameState.getGameState();
	
	// Skip if game is paused or over
	if (gameState.isPaused || gameState.isGameOver) {
		return;
	}
	
	// Handle tetromino mode actions
	if (inputState.inputMode === 'tetromino') {
		switch (action) {
			case 'left':
				if (isPressed) {
					TetrominoManager.moveTetromino(-1, 0);
				}
				break;
			case 'right':
				if (isPressed) {
					TetrominoManager.moveTetromino(1, 0);
				}
				break;
			case 'up':
				// In some Tetris variants, up can mean rotate
				if (isPressed) {
					TetrominoManager.rotateTetromino();
				}
				break;
			case 'down':
				if (isPressed) {
					TetrominoManager.moveTetromino(0, 1);
				}
				break;
			case 'rotate':
				if (isPressed) {
					TetrominoManager.rotateTetromino();
				}
				break;
			case 'drop':
				if (isPressed) {
					TetrominoManager.dropTetromino();
				}
				break;
		}
	}
	// Handle chess mode actions
	else if (inputState.inputMode === 'chess') {
		// Chess piece movement is typically handled by mouse/touch
		// But we can add keyboard navigation for accessibility
		switch (action) {
			case 'select':
				if (isPressed && inputState.selectedCell) {
					if (inputState.selectedPiece) {
						// Move the selected piece to the selected cell
						ChessPieceManager.movePiece(
							inputState.selectedPiece,
							inputState.selectedCell.x,
							inputState.selectedCell.y
						);
						// Clear selection
						inputState.selectedPiece = null;
						inputState.selectedCell = null;
					} else {
						// Select the piece at the selected cell
						const piece = ChessPieceManager.getPieceAt(
							inputState.selectedCell.x,
							inputState.selectedCell.y
						);
						if (piece) {
							inputState.selectedPiece = piece;
						}
					}
				}
				break;
			case 'cancel':
				if (isPressed) {
					// Clear selection
					inputState.selectedPiece = null;
					inputState.selectedCell = null;
				}
				break;
		}
	}
}

/**
 * Set up touch controls
 */
function setupTouchControls() {
	// Touch surface for tetromino control
	const gameContainer = document.getElementById('game-container');
	if (!gameContainer) {
		console.error('Game container not found for touch controls');
		return;
	}
	
	// Touch start
	gameContainer.addEventListener('touchstart', (event) => {
		// Prevent default to avoid scrolling
		event.preventDefault();
		
		// Get touch position
		const touch = event.touches[0];
		inputState.touchStartX = touch.clientX;
		inputState.touchStartY = touch.clientY;
		inputState.touchStartTime = Date.now();
		inputState.isTouching = true;
		inputState.isDragging = false;
		
		// Check for double tap
		const now = Date.now();
		const timeSinceLastTap = now - inputState.lastTapTime;
		
		if (timeSinceLastTap < inputState.doubleTapDelay) {
			// Double tap detected
			handleDoubleTap(touch.clientX, touch.clientY);
		}
		
		inputState.lastTapTime = now;
		
		// Set up long press timer
		inputState.longPressTimer = setTimeout(() => {
			if (inputState.isTouching && !inputState.isDragging) {
				handleLongPress(touch.clientX, touch.clientY);
			}
		}, inputState.longPressDelay);
	});
	
	// Touch move
	gameContainer.addEventListener('touchmove', (event) => {
		if (!inputState.isTouching) return;
		
		// Get touch position
		const touch = event.touches[0];
		const deltaX = touch.clientX - inputState.touchStartX;
		const deltaY = touch.clientY - inputState.touchStartY;
		
		// Check if dragging
		if (!inputState.isDragging && 
			(Math.abs(deltaX) > inputState.dragThreshold || 
			 Math.abs(deltaY) > inputState.dragThreshold)) {
			inputState.isDragging = true;
			
			// Clear long press timer if dragging
			if (inputState.longPressTimer) {
				clearTimeout(inputState.longPressTimer);
				inputState.longPressTimer = null;
			}
		}
		
		// Handle drag
		if (inputState.isDragging) {
			handleDrag(deltaX, deltaY, touch.clientX, touch.clientY);
		}
	});
	
	// Touch end
	gameContainer.addEventListener('touchend', (event) => {
		// Clear long press timer
		if (inputState.longPressTimer) {
			clearTimeout(inputState.longPressTimer);
			inputState.longPressTimer = null;
		}
		
		// Handle tap if not dragging
		if (inputState.isTouching && !inputState.isDragging) {
			const touchDuration = Date.now() - inputState.touchStartTime;
			
			// Only count as tap if duration is short
			if (touchDuration < 300) {
				handleTap(inputState.touchStartX, inputState.touchStartY);
			}
		}
		
		// Handle drag end
		if (inputState.isDragging) {
			handleDragEnd();
		}
		
		// Reset touch state
		inputState.isTouching = false;
		inputState.isDragging = false;
	});
	
	// Touch cancel
	gameContainer.addEventListener('touchcancel', (event) => {
		// Clear long press timer
		if (inputState.longPressTimer) {
			clearTimeout(inputState.longPressTimer);
			inputState.longPressTimer = null;
		}
		
		// Reset touch state
		inputState.isTouching = false;
		inputState.isDragging = false;
	});
}

/**
 * Set up mouse controls
 */
function setupMouseControls() {
	// Mouse events for chess piece selection and movement
	const gameContainer = document.getElementById('game-container');
	if (!gameContainer) {
		console.error('Game container not found for mouse controls');
		return;
	}
	
	// Mouse down
	gameContainer.addEventListener('mousedown', (event) => {
		// Only handle left mouse button
		if (event.button !== 0) return;
		
		// Get mouse position
		const mouseX = event.clientX;
		const mouseY = event.clientY;
		
		// Handle mouse down based on mode
		if (inputState.inputMode === 'chess') {
			handleChessMouseDown(mouseX, mouseY);
		}
	});
	
	// Mouse up
	gameContainer.addEventListener('mouseup', (event) => {
		// Only handle left mouse button
		if (event.button !== 0) return;
		
		// Get mouse position
		const mouseX = event.clientX;
		const mouseY = event.clientY;
		
		// Handle mouse up based on mode
		if (inputState.inputMode === 'chess') {
			handleChessMouseUp(mouseX, mouseY);
		}
	});
	
	// Mouse move
	gameContainer.addEventListener('mousemove', (event) => {
		// Get mouse position
		const mouseX = event.clientX;
		const mouseY = event.clientY;
		
		// Handle mouse move based on mode
		if (inputState.inputMode === 'chess' && inputState.selectedPiece) {
			handleChessMouseMove(mouseX, mouseY);
		}
	});
}

/**
 * Handle tap event
 * @param {number} x - The x coordinate of the tap
 * @param {number} y - The y coordinate of the tap
 */
function handleTap(x, y) {
	// Get the current game state
	const gameState = GameState.getGameState();
	
	// Skip if game is paused or over
	if (gameState.isPaused || gameState.isGameOver) {
		return;
	}
	
	// Convert screen coordinates to game coordinates
	const gameCoords = screenToGameCoordinates(x, y);
	
	// Handle tap based on mode
	if (inputState.inputMode === 'tetromino') {
		// In tetromino mode, tap to rotate
		TetrominoManager.rotateTetromino();
	} else if (inputState.inputMode === 'chess') {
		// In chess mode, tap to select or move
		handleChessTap(gameCoords.x, gameCoords.y);
	}
}

/**
 * Handle double tap event
 * @param {number} x - The x coordinate of the tap
 * @param {number} y - The y coordinate of the tap
 */
function handleDoubleTap(x, y) {
	// Get the current game state
	const gameState = GameState.getGameState();
	
	// Skip if game is paused or over
	if (gameState.isPaused || gameState.isGameOver) {
		return;
	}
	
	// Handle double tap based on mode
	if (inputState.inputMode === 'tetromino') {
		// In tetromino mode, double tap to drop
		TetrominoManager.dropTetromino();
	}
}

/**
 * Handle long press event
 * @param {number} x - The x coordinate of the press
 * @param {number} y - The y coordinate of the press
 */
function handleLongPress(x, y) {
	// Get the current game state
	const gameState = GameState.getGameState();
	
	// Skip if game is paused or over
	if (gameState.isPaused || gameState.isGameOver) {
		return;
	}
	
	// Convert screen coordinates to game coordinates
	const gameCoords = screenToGameCoordinates(x, y);
	
	// Handle long press based on mode
	if (inputState.inputMode === 'tetromino') {
		// In tetromino mode, long press might show ghost piece or options
		// For now, we'll just use it as an alternative to drop
		TetrominoManager.dropTetromino();
	} else if (inputState.inputMode === 'chess') {
		// In chess mode, long press might show piece info or valid moves
		// This would be implemented in the chess piece manager
		if (typeof ChessPieceManager.showPieceInfo === 'function') {
			ChessPieceManager.showPieceInfo(gameCoords.x, gameCoords.y);
		}
	}
}

/**
 * Handle drag event
 * @param {number} deltaX - The x distance dragged
 * @param {number} deltaY - The y distance dragged
 * @param {number} currentX - The current x position
 * @param {number} currentY - The current y position
 */
function handleDrag(deltaX, deltaY, currentX, currentY) {
	// Get the current game state
	const gameState = GameState.getGameState();
	
	// Skip if game is paused or over
	if (gameState.isPaused || gameState.isGameOver) {
		return;
	}
	
	// Handle drag based on mode
	if (inputState.inputMode === 'tetromino') {
		// Determine drag direction
		const dragThreshold = 30; // Larger threshold for touch
		
		// Only trigger movement when threshold is crossed
		if (Math.abs(deltaX) > dragThreshold || Math.abs(deltaY) > dragThreshold) {
			// Determine primary direction
			if (Math.abs(deltaX) > Math.abs(deltaY)) {
				// Horizontal drag
				if (deltaX > 0) {
					// Right
					TetrominoManager.moveTetromino(1, 0);
				} else {
					// Left
					TetrominoManager.moveTetromino(-1, 0);
				}
			} else {
				// Vertical drag
				if (deltaY > 0) {
					// Down
					TetrominoManager.moveTetromino(0, 1);
				} else {
					// Up - could be used for rotation or other action
					TetrominoManager.rotateTetromino();
				}
			}
			
			// Reset touch start to allow for continuous movement
			inputState.touchStartX = currentX;
			inputState.touchStartY = currentY;
		}
	} else if (inputState.inputMode === 'chess') {
		// In chess mode, drag to move selected piece
		if (inputState.selectedPiece) {
			// Update visual position of the piece during drag
			// This would be implemented in the chess piece manager
			if (typeof ChessPieceManager.updateDragPosition === 'function') {
				const gameCoords = screenToGameCoordinates(currentX, currentY);
				ChessPieceManager.updateDragPosition(inputState.selectedPiece, gameCoords.x, gameCoords.y);
			}
		}
	}
}

/**
 * Handle drag end event
 */
function handleDragEnd() {
	// Get the current game state
	const gameState = GameState.getGameState();
	
	// Skip if game is paused or over
	if (gameState.isPaused || gameState.isGameOver) {
		return;
	}
	
	// Handle drag end based on mode
	if (inputState.inputMode === 'chess') {
		// In chess mode, complete the piece move
		if (inputState.selectedPiece) {
			// Get the current position of the piece
			const currentPosition = ChessPieceManager.getDragPosition(inputState.selectedPiece);
			
			// Try to move the piece to the nearest valid cell
			if (currentPosition) {
				const success = ChessPieceManager.movePiece(
					inputState.selectedPiece,
					Math.round(currentPosition.x),
					Math.round(currentPosition.y)
				);
				
				// If move failed, return piece to original position
				if (!success && typeof ChessPieceManager.resetPiecePosition === 'function') {
					ChessPieceManager.resetPiecePosition(inputState.selectedPiece);
				}
			}
			
			// Clear selection
			inputState.selectedPiece = null;
		}
	}
}

/**
 * Handle chess-specific mouse down
 * @param {number} x - The x coordinate
 * @param {number} y - The y coordinate
 */
function handleChessMouseDown(x, y) {
	// Convert screen coordinates to game coordinates
	const gameCoords = screenToGameCoordinates(x, y);
	
	// Try to select a piece at this position
	const piece = ChessPieceManager.getPieceAt(gameCoords.x, gameCoords.y);
	
	if (piece) {
		// Select the piece
		inputState.selectedPiece = piece;
		
		// Start dragging
		if (typeof ChessPieceManager.startDragging === 'function') {
			ChessPieceManager.startDragging(piece);
		}
	}
}

/**
 * Handle chess-specific mouse move
 * @param {number} x - The x coordinate
 * @param {number} y - The y coordinate
 */
function handleChessMouseMove(x, y) {
	if (!inputState.selectedPiece) return;
	
	// Convert screen coordinates to game coordinates
	const gameCoords = screenToGameCoordinates(x, y);
	
	// Update the visual position of the piece
	if (typeof ChessPieceManager.updateDragPosition === 'function') {
		ChessPieceManager.updateDragPosition(inputState.selectedPiece, gameCoords.x, gameCoords.y);
	}
}

/**
 * Handle chess-specific mouse up
 * @param {number} x - The x coordinate
 * @param {number} y - The y coordinate
 */
function handleChessMouseUp(x, y) {
	if (!inputState.selectedPiece) return;
	
	// Convert screen coordinates to game coordinates
	const gameCoords = screenToGameCoordinates(x, y);
	
	// Try to move the piece to this position
	const success = ChessPieceManager.movePiece(
		inputState.selectedPiece,
		Math.round(gameCoords.x),
		Math.round(gameCoords.y)
	);
	
	// If move failed, return piece to original position
	if (!success && typeof ChessPieceManager.resetPiecePosition === 'function') {
		ChessPieceManager.resetPiecePosition(inputState.selectedPiece);
	}
	
	// End dragging
	if (typeof ChessPieceManager.endDragging === 'function') {
		ChessPieceManager.endDragging(inputState.selectedPiece);
	}
	
	// Clear selection
	inputState.selectedPiece = null;
}

/**
 * Handle chess-specific tap
 * @param {number} x - The game x coordinate
 * @param {number} y - The game y coordinate
 */
function handleChessTap(x, y) {
	// Round to nearest cell
	const cellX = Math.round(x);
	const cellY = Math.round(y);
	
	// If we already have a selected piece, try to move it
	if (inputState.selectedPiece) {
		// Try to move the piece to this position
		const success = ChessPieceManager.movePiece(
			inputState.selectedPiece,
			cellX,
			cellY
		);
		
		// Clear selection regardless of success
		inputState.selectedPiece = null;
		
		// If move was successful, we're done
		if (success) {
			return;
		}
	}
	
	// If no piece was selected or move failed, try to select a piece
	const piece = ChessPieceManager.getPieceAt(cellX, cellY);
	
	if (piece) {
		// Select the piece
		inputState.selectedPiece = piece;
		
		// Highlight valid moves if function exists
		if (typeof ChessPieceManager.highlightValidMoves === 'function') {
			ChessPieceManager.highlightValidMoves(piece);
		}
	}
}

/**
 * Convert screen coordinates to game coordinates
 * @param {number} screenX - The screen x coordinate
 * @param {number} screenY - The screen y coordinate
 * @returns {Object} The game coordinates
 */
function screenToGameCoordinates(screenX, screenY) {
	// This is a placeholder implementation
	// In a real implementation, this would use raycasting or other techniques
	// to convert screen coordinates to game world coordinates
	
	// For now, we'll just return normalized coordinates
	const gameContainer = document.getElementById('game-container');
	
	if (!gameContainer) {
		return { x: 0, y: 0 };
	}
	
	const rect = gameContainer.getBoundingClientRect();
	
	// Normalize to 0-1 range
	const normalizedX = (screenX - rect.left) / rect.width;
	const normalizedY = (screenY - rect.top) / rect.height;
	
	// Convert to game coordinates (assuming 10x10 board for simplicity)
	// This would need to be adjusted based on actual game dimensions
	const gameX = Math.floor(normalizedX * 10);
	const gameY = Math.floor(normalizedY * 10);
	
	return { x: gameX, y: gameY };
}

/**
 * Set the input mode
 * @param {string} mode - The input mode ('tetromino' or 'chess')
 */
export function setInputMode(mode) {
	if (mode === 'tetromino' || mode === 'chess') {
		inputState.inputMode = mode;
		console.log(`Input mode set to: ${mode}`);
	} else {
		console.error(`Invalid input mode: ${mode}`);
	}
}

/**
 * Get the current input mode
 * @returns {string} The current input mode
 */
export function getInputMode() {
	return inputState.inputMode;
}

/**
 * Get the input state
 * @returns {Object} The current input state
 */
export function getInputState() {
	return { ...inputState };
}

// Export functions
export default {
	init,
	setInputMode,
	getInputMode,
	getInputState
}; 