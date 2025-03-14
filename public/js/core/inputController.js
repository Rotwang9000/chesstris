/**
 * Input Controller
 * 
 * Handles keyboard, mouse, and touch input for the game.
 */

import { GAME_CONSTANTS, KEYBOARD_CONTROLS } from './constants.js';
import * as TetrominoManager from './tetrominoManager.js';
import * as ChessPieceManager from './chessPieceManager.js';
import * as GameManager from './gameManager.js';

// Input state
let inputMode = GAME_CONSTANTS.INPUT_MODE.TETROMINO;
let keyStates = {};
let mousePosition = { x: 0, y: 0 };
let isDragging = false;
let dragStartPosition = { x: 0, y: 0 };
let lastKeyRepeatTime = {};
let touchStartPosition = { x: 0, y: 0 };
let touchStartTime = 0;
let doubleTapTimeout = null;
let longPressTimeout = null;
let isLongPress = false;
let eventListenersAttached = false;

// Event handlers
const keydownHandler = handleKeyDown.bind(this);
const keyupHandler = handleKeyUp.bind(this);
const mousemoveHandler = handleMouseMove.bind(this);
const mousedownHandler = handleMouseDown.bind(this);
const mouseupHandler = handleMouseUp.bind(this);
const touchstartHandler = handleTouchStart.bind(this);
const touchmoveHandler = handleTouchMove.bind(this);
const touchendHandler = handleTouchEnd.bind(this);
const contextmenuHandler = handleContextMenu.bind(this);

/**
 * Initialize the input controller
 */
export function init() {
	try {
		console.log('Initializing input controller...');
		
		// Reset state
		inputMode = GAME_CONSTANTS.INPUT_MODE.TETROMINO;
		keyStates = {};
		mousePosition = { x: 0, y: 0 };
		isDragging = false;
		dragStartPosition = { x: 0, y: 0 };
		lastKeyRepeatTime = {};
		
		// Attach event listeners
		attachEventListeners();
		
		console.log('Input controller initialized');
	} catch (error) {
		console.error('Error initializing input controller:', error);
	}
}

/**
 * Attach event listeners
 */
function attachEventListeners() {
	try {
		if (eventListenersAttached) {
			return;
		}
		
		// Keyboard events
		window.addEventListener('keydown', keydownHandler);
		window.addEventListener('keyup', keyupHandler);
		
		// Mouse events
		window.addEventListener('mousemove', mousemoveHandler);
		window.addEventListener('mousedown', mousedownHandler);
		window.addEventListener('mouseup', mouseupHandler);
		window.addEventListener('contextmenu', contextmenuHandler);
		
		// Touch events
		window.addEventListener('touchstart', touchstartHandler, { passive: false });
		window.addEventListener('touchmove', touchmoveHandler, { passive: false });
		window.addEventListener('touchend', touchendHandler);
		
		eventListenersAttached = true;
	} catch (error) {
		console.error('Error attaching event listeners:', error);
	}
}

/**
 * Detach event listeners
 */
export function detachEventListeners() {
	try {
		if (!eventListenersAttached) {
			return;
		}
		
		// Keyboard events
		window.removeEventListener('keydown', keydownHandler);
		window.removeEventListener('keyup', keyupHandler);
		
		// Mouse events
		window.removeEventListener('mousemove', mousemoveHandler);
		window.removeEventListener('mousedown', mousedownHandler);
		window.removeEventListener('mouseup', mouseupHandler);
		window.removeEventListener('contextmenu', contextmenuHandler);
		
		// Touch events
		window.removeEventListener('touchstart', touchstartHandler);
		window.removeEventListener('touchmove', touchmoveHandler);
		window.removeEventListener('touchend', touchendHandler);
		
		eventListenersAttached = false;
	} catch (error) {
		console.error('Error detaching event listeners:', error);
	}
}

/**
 * Update input state
 * @param {number} deltaTime - Time since last update in milliseconds
 */
export function update(deltaTime) {
	try {
		// Process key repeats
		for (const key in keyStates) {
			if (keyStates[key]) {
				const now = performance.now();
				if (!lastKeyRepeatTime[key] || now - lastKeyRepeatTime[key] >= GAME_CONSTANTS.KEY_REPEAT_DELAY) {
					processKeyInput(key);
					lastKeyRepeatTime[key] = now;
				}
			}
		}
	} catch (error) {
		console.error('Error updating input controller:', error);
	}
}

/**
 * Set input mode
 * @param {string} mode - Input mode (tetromino, chess, ui)
 */
export function setInputMode(mode) {
	try {
		if (Object.values(GAME_CONSTANTS.INPUT_MODE).includes(mode)) {
			inputMode = mode;
			console.log(`Input mode set to ${mode}`);
		} else {
			console.warn(`Invalid input mode: ${mode}`);
		}
	} catch (error) {
		console.error('Error setting input mode:', error);
	}
}

/**
 * Get current input mode
 * @returns {string} - Current input mode
 */
export function getInputMode() {
	return inputMode;
}

/**
 * Handle key down event
 * @param {KeyboardEvent} event - Key down event
 */
function handleKeyDown(event) {
	try {
		// Prevent default for game controls
		if (Object.values(KEYBOARD_CONTROLS).includes(event.key)) {
			event.preventDefault();
		}
		
		// Update key state
		keyStates[event.key] = true;
		
		// Process key input
		processKeyInput(event.key);
	} catch (error) {
		console.error('Error handling key down:', error);
	}
}

/**
 * Handle key up event
 * @param {KeyboardEvent} event - Key up event
 */
function handleKeyUp(event) {
	try {
		// Prevent default for game controls
		if (Object.values(KEYBOARD_CONTROLS).includes(event.key)) {
			event.preventDefault();
		}
		
		// Update key state
		keyStates[event.key] = false;
		
		// Handle specific key up events
		if (event.key === KEYBOARD_CONTROLS.QUICK_DROP) {
			TetrominoManager.softDrop(false);
		}
	} catch (error) {
		console.error('Error handling key up:', error);
	}
}

/**
 * Process key input
 * @param {string} key - Key pressed
 */
function processKeyInput(key) {
	try {
		// Check if game is paused
		if (GameManager.getGameOverState()) {
			// Only allow restart key when game over
			if (key === KEYBOARD_CONTROLS.CONFIRM) {
				GameManager.restartGame();
			}
			return;
		}
		
		if (GameManager.gameIsPaused()) {
			// Only allow pause key when paused
			if (key === KEYBOARD_CONTROLS.PAUSE) {
				GameManager.resumeGame();
			}
			return;
		}
		
		// Global keys (work in any mode)
		switch (key) {
			case KEYBOARD_CONTROLS.PAUSE:
				GameManager.pauseGame();
				return;
			case KEYBOARD_CONTROLS.DEBUG:
				toggleDebugPanel();
				return;
		}
		
		// Mode-specific keys
		switch (inputMode) {
			case GAME_CONSTANTS.INPUT_MODE.TETROMINO:
				processTetrominoInput(key);
				break;
			case GAME_CONSTANTS.INPUT_MODE.CHESS:
				processChessInput(key);
				break;
			case GAME_CONSTANTS.INPUT_MODE.UI:
				processUIInput(key);
				break;
		}
	} catch (error) {
		console.error('Error processing key input:', error);
	}
}

/**
 * Process tetromino input
 * @param {string} key - Key pressed
 */
function processTetrominoInput(key) {
	try {
		switch (key) {
			case KEYBOARD_CONTROLS.MOVE_LEFT:
				TetrominoManager.movePieceLeft();
				break;
			case KEYBOARD_CONTROLS.MOVE_RIGHT:
				TetrominoManager.movePieceRight();
				break;
			case KEYBOARD_CONTROLS.MOVE_DOWN:
				TetrominoManager.movePieceDown();
				break;
			case KEYBOARD_CONTROLS.ROTATE:
				TetrominoManager.rotatePiece(true);
				break;
			case KEYBOARD_CONTROLS.COUNTER_ROTATE:
				TetrominoManager.rotatePiece(false);
				break;
			case KEYBOARD_CONTROLS.QUICK_DROP:
				TetrominoManager.softDrop();
				break;
			case KEYBOARD_CONTROLS.HARD_DROP:
				TetrominoManager.hardDrop();
				break;
			case KEYBOARD_CONTROLS.HOLD:
				TetrominoManager.holdPiece();
				break;
		}
	} catch (error) {
		console.error('Error processing tetromino input:', error);
	}
}

/**
 * Process chess input
 * @param {string} key - Key pressed
 */
function processChessInput(key) {
	try {
		const selectedPiece = ChessPieceManager.getSelectedPiece();
		
		if (!selectedPiece) {
			// No piece selected, arrow keys navigate the board
			switch (key) {
				case KEYBOARD_CONTROLS.MOVE_LEFT:
				case KEYBOARD_CONTROLS.MOVE_RIGHT:
				case KEYBOARD_CONTROLS.MOVE_UP:
				case KEYBOARD_CONTROLS.MOVE_DOWN:
					// TODO: Implement board navigation
					break;
				case KEYBOARD_CONTROLS.SELECT:
					// Select piece at cursor position
					// TODO: Implement cursor-based selection
					break;
			}
			return;
		}
		
		// Piece selected, arrow keys move the piece
		switch (key) {
			case KEYBOARD_CONTROLS.MOVE_LEFT:
				movePieceInDirection(selectedPiece, -1, 0);
				break;
			case KEYBOARD_CONTROLS.MOVE_RIGHT:
				movePieceInDirection(selectedPiece, 1, 0);
				break;
			case KEYBOARD_CONTROLS.MOVE_UP:
				movePieceInDirection(selectedPiece, 0, -1);
				break;
			case KEYBOARD_CONTROLS.MOVE_DOWN:
				movePieceInDirection(selectedPiece, 0, 1);
				break;
			case KEYBOARD_CONTROLS.CONFIRM:
				// Confirm move
				// TODO: Implement move confirmation
				break;
			case KEYBOARD_CONTROLS.CANCEL:
				// Cancel selection
				ChessPieceManager.deselectPiece();
				break;
		}
	} catch (error) {
		console.error('Error processing chess input:', error);
	}
}

/**
 * Move a piece in a direction
 * @param {Object} piece - Piece to move
 * @param {number} dx - X direction
 * @param {number} dy - Y direction
 */
function movePieceInDirection(piece, dx, dy) {
	try {
		const { x, y } = piece;
		ChessPieceManager.movePiece(x + dx, y + dy);
	} catch (error) {
		console.error('Error moving piece in direction:', error);
	}
}

/**
 * Process UI input
 * @param {string} key - Key pressed
 */
function processUIInput(key) {
	try {
		// TODO: Implement UI navigation
	} catch (error) {
		console.error('Error processing UI input:', error);
	}
}

/**
 * Toggle debug panel
 */
function toggleDebugPanel() {
	try {
		const debugPanel = document.getElementById('debug-panel');
		if (debugPanel) {
			debugPanel.style.display = debugPanel.style.display === 'none' ? 'block' : 'none';
		}
	} catch (error) {
		console.error('Error toggling debug panel:', error);
	}
}

/**
 * Handle mouse move event
 * @param {MouseEvent} event - Mouse move event
 */
function handleMouseMove(event) {
	try {
		// Update mouse position
		mousePosition.x = event.clientX;
		mousePosition.y = event.clientY;
		
		// Handle dragging
		if (isDragging) {
			const dx = mousePosition.x - dragStartPosition.x;
			const dy = mousePosition.y - dragStartPosition.y;
			
			// TODO: Implement drag behavior based on input mode
		}
	} catch (error) {
		console.error('Error handling mouse move:', error);
	}
}

/**
 * Handle mouse down event
 * @param {MouseEvent} event - Mouse down event
 */
function handleMouseDown(event) {
	try {
		// Update mouse position
		mousePosition.x = event.clientX;
		mousePosition.y = event.clientY;
		
		// Start dragging
		isDragging = true;
		dragStartPosition.x = mousePosition.x;
		dragStartPosition.y = mousePosition.y;
		
		// Convert screen coordinates to board coordinates
		const boardCoords = screenToBoard(mousePosition.x, mousePosition.y);
		
		// Handle click based on input mode
		switch (inputMode) {
			case GAME_CONSTANTS.INPUT_MODE.CHESS:
				handleChessClick(boardCoords.x, boardCoords.y, event.button);
				break;
			case GAME_CONSTANTS.INPUT_MODE.TETROMINO:
				// TODO: Implement tetromino click behavior
				break;
			case GAME_CONSTANTS.INPUT_MODE.UI:
				// UI clicks are handled by the browser
				break;
		}
	} catch (error) {
		console.error('Error handling mouse down:', error);
	}
}

/**
 * Handle mouse up event
 * @param {MouseEvent} event - Mouse up event
 */
function handleMouseUp(event) {
	try {
		// Update mouse position
		mousePosition.x = event.clientX;
		mousePosition.y = event.clientY;
		
		// End dragging
		if (isDragging) {
			const dx = mousePosition.x - dragStartPosition.x;
			const dy = mousePosition.y - dragStartPosition.y;
			
			// Convert screen coordinates to board coordinates
			const startBoardCoords = screenToBoard(dragStartPosition.x, dragStartPosition.y);
			const endBoardCoords = screenToBoard(mousePosition.x, mousePosition.y);
			
			// Handle drag end based on input mode
			switch (inputMode) {
				case GAME_CONSTANTS.INPUT_MODE.CHESS:
					handleChessDragEnd(startBoardCoords.x, startBoardCoords.y, endBoardCoords.x, endBoardCoords.y);
					break;
				case GAME_CONSTANTS.INPUT_MODE.TETROMINO:
					// TODO: Implement tetromino drag behavior
					break;
			}
			
			isDragging = false;
		}
	} catch (error) {
		console.error('Error handling mouse up:', error);
	}
}

/**
 * Handle context menu event
 * @param {MouseEvent} event - Context menu event
 */
function handleContextMenu(event) {
	try {
		// Prevent context menu in game modes
		if (inputMode !== GAME_CONSTANTS.INPUT_MODE.UI) {
			event.preventDefault();
		}
	} catch (error) {
		console.error('Error handling context menu:', error);
	}
}

/**
 * Handle touch start event
 * @param {TouchEvent} event - Touch start event
 */
function handleTouchStart(event) {
	try {
		// Prevent default to avoid scrolling
		if (inputMode !== GAME_CONSTANTS.INPUT_MODE.UI) {
			event.preventDefault();
		}
		
		// Get touch position
		const touch = event.touches[0];
		touchStartPosition.x = touch.clientX;
		touchStartPosition.y = touch.clientY;
		touchStartTime = performance.now();
		
		// Clear timeouts
		if (doubleTapTimeout) {
			clearTimeout(doubleTapTimeout);
		}
		
		// Set long press timeout
		isLongPress = false;
		longPressTimeout = setTimeout(() => {
			isLongPress = true;
			handleLongPress(touchStartPosition.x, touchStartPosition.y);
		}, 500);
	} catch (error) {
		console.error('Error handling touch start:', error);
	}
}

/**
 * Handle touch move event
 * @param {TouchEvent} event - Touch move event
 */
function handleTouchMove(event) {
	try {
		// Prevent default to avoid scrolling
		if (inputMode !== GAME_CONSTANTS.INPUT_MODE.UI) {
			event.preventDefault();
		}
		
		// Get touch position
		const touch = event.touches[0];
		const touchPosition = {
			x: touch.clientX,
			y: touch.clientY
		};
		
		// Calculate distance moved
		const dx = touchPosition.x - touchStartPosition.x;
		const dy = touchPosition.y - touchStartPosition.y;
		
		// If moved significantly, cancel long press
		if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
			if (longPressTimeout) {
				clearTimeout(longPressTimeout);
				longPressTimeout = null;
			}
		}
		
		// Handle drag based on input mode
		switch (inputMode) {
			case GAME_CONSTANTS.INPUT_MODE.TETROMINO:
				handleTetrominoTouchDrag(dx, dy);
				break;
			case GAME_CONSTANTS.INPUT_MODE.CHESS:
				// Chess drag is handled on touch end
				break;
		}
	} catch (error) {
		console.error('Error handling touch move:', error);
	}
}

/**
 * Handle touch end event
 * @param {TouchEvent} event - Touch end event
 */
function handleTouchEnd(event) {
	try {
		// Clear long press timeout
		if (longPressTimeout) {
			clearTimeout(longPressTimeout);
			longPressTimeout = null;
		}
		
		// Get touch position
		const touchEndPosition = {
			x: event.changedTouches[0].clientX,
			y: event.changedTouches[0].clientY
		};
		
		// Calculate distance and time
		const dx = touchEndPosition.x - touchStartPosition.x;
		const dy = touchEndPosition.y - touchStartPosition.y;
		const touchDuration = performance.now() - touchStartTime;
		
		// Convert to board coordinates
		const startBoardCoords = screenToBoard(touchStartPosition.x, touchStartPosition.y);
		const endBoardCoords = screenToBoard(touchEndPosition.x, touchEndPosition.y);
		
		// Handle based on input mode
		switch (inputMode) {
			case GAME_CONSTANTS.INPUT_MODE.TETROMINO:
				handleTetrominoTouchEnd(dx, dy, touchDuration);
				break;
			case GAME_CONSTANTS.INPUT_MODE.CHESS:
				if (!isLongPress) {
					if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
						// Tap
						handleChessClick(startBoardCoords.x, startBoardCoords.y, 0);
					} else {
						// Drag
						handleChessDragEnd(startBoardCoords.x, startBoardCoords.y, endBoardCoords.x, endBoardCoords.y);
					}
				}
				break;
		}
		
		// Check for double tap
		if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && touchDuration < 300) {
			doubleTapTimeout = setTimeout(() => {
				// Single tap
				handleTap(touchStartPosition.x, touchStartPosition.y);
				doubleTapTimeout = null;
			}, 300);
		}
	} catch (error) {
		console.error('Error handling touch end:', error);
	}
}

/**
 * Handle tetromino touch drag
 * @param {number} dx - X distance
 * @param {number} dy - Y distance
 */
function handleTetrominoTouchDrag(dx, dy) {
	try {
		// Horizontal swipe for movement
		if (Math.abs(dx) > GAME_CONSTANTS.SWIPE_THRESHOLD) {
			if (dx > 0) {
				TetrominoManager.movePieceRight();
			} else {
				TetrominoManager.movePieceLeft();
			}
			
			// Reset start position for continuous movement
			touchStartPosition.x += dx;
		}
		
		// Vertical swipe for fast fall
		if (dy > GAME_CONSTANTS.SWIPE_THRESHOLD) {
			TetrominoManager.softDrop();
		}
	} catch (error) {
		console.error('Error handling tetromino touch drag:', error);
	}
}

/**
 * Handle tetromino touch end
 * @param {number} dx - X distance
 * @param {number} dy - Y distance
 * @param {number} duration - Touch duration
 */
function handleTetrominoTouchEnd(dx, dy, duration) {
	try {
		// Turn off soft drop
		TetrominoManager.softDrop(false);
		
		// Quick downward swipe for hard drop
		if (dy > 100 && duration < 300) {
			TetrominoManager.hardDrop();
		}
	} catch (error) {
		console.error('Error handling tetromino touch end:', error);
	}
}

/**
 * Handle tap
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 */
function handleTap(x, y) {
	try {
		// Convert to board coordinates
		const boardCoords = screenToBoard(x, y);
		
		// Handle based on input mode
		switch (inputMode) {
			case GAME_CONSTANTS.INPUT_MODE.TETROMINO:
				// Tap to rotate
				TetrominoManager.rotatePiece(true);
				break;
			case GAME_CONSTANTS.INPUT_MODE.CHESS:
				// Handled in handleChessClick
				break;
		}
	} catch (error) {
		console.error('Error handling tap:', error);
	}
}

/**
 * Handle double tap
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 */
function handleDoubleTap(x, y) {
	try {
		// Convert to board coordinates
		const boardCoords = screenToBoard(x, y);
		
		// Handle based on input mode
		switch (inputMode) {
			case GAME_CONSTANTS.INPUT_MODE.TETROMINO:
				// Double tap for hard drop
				TetrominoManager.hardDrop();
				break;
			case GAME_CONSTANTS.INPUT_MODE.CHESS:
				// Double tap to select/deselect
				const piece = ChessPieceManager.getBoard()[boardCoords.y][boardCoords.x];
				if (piece) {
					ChessPieceManager.selectPiece(boardCoords.x, boardCoords.y);
				} else {
					ChessPieceManager.deselectPiece();
				}
				break;
		}
	} catch (error) {
		console.error('Error handling double tap:', error);
	}
}

/**
 * Handle long press
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 */
function handleLongPress(x, y) {
	try {
		// Convert to board coordinates
		const boardCoords = screenToBoard(x, y);
		
		// Handle based on input mode
		switch (inputMode) {
			case GAME_CONSTANTS.INPUT_MODE.TETROMINO:
				// Long press to hold piece
				TetrominoManager.holdPiece();
				break;
			case GAME_CONSTANTS.INPUT_MODE.CHESS:
				// Long press to show piece info
				const piece = ChessPieceManager.getBoard()[boardCoords.y][boardCoords.x];
				if (piece) {
					// TODO: Show piece info
				}
				break;
		}
	} catch (error) {
		console.error('Error handling long press:', error);
	}
}

/**
 * Handle chess click
 * @param {number} x - Board X coordinate
 * @param {number} y - Board Y coordinate
 * @param {number} button - Mouse button (0 = left, 2 = right)
 */
function handleChessClick(x, y, button) {
	try {
		// Right click to deselect
		if (button === 2) {
			ChessPieceManager.deselectPiece();
			return;
		}
		
		// Get selected piece
		const selectedPiece = ChessPieceManager.getSelectedPiece();
		
		if (selectedPiece) {
			// If a piece is already selected, try to move it
			ChessPieceManager.movePiece(x, y);
		} else {
			// No piece selected, try to select one
			ChessPieceManager.selectPiece(x, y);
		}
	} catch (error) {
		console.error('Error handling chess click:', error);
	}
}

/**
 * Handle chess drag end
 * @param {number} startX - Start X coordinate
 * @param {number} startY - Start Y coordinate
 * @param {number} endX - End X coordinate
 * @param {number} endY - End Y coordinate
 */
function handleChessDragEnd(startX, startY, endX, endY) {
	try {
		// Select piece at start position
		if (ChessPieceManager.selectPiece(startX, startY)) {
			// Move to end position
			ChessPieceManager.movePiece(endX, endY);
		}
	} catch (error) {
		console.error('Error handling chess drag end:', error);
	}
}

/**
 * Convert screen coordinates to board coordinates
 * @param {number} screenX - Screen X coordinate
 * @param {number} screenY - Screen Y coordinate
 * @returns {Object} - Board coordinates
 */
function screenToBoard(screenX, screenY) {
	try {
		// TODO: Implement proper conversion based on renderer
		
		// Placeholder implementation
		const gameContainer = document.getElementById('game-container');
		if (!gameContainer) {
			return { x: 0, y: 0 };
		}
		
		const rect = gameContainer.getBoundingClientRect();
		const boardWidth = GAME_CONSTANTS.BOARD_WIDTH;
		const boardHeight = GAME_CONSTANTS.BOARD_HEIGHT;
		
		const x = Math.floor((screenX - rect.left) / (rect.width / boardWidth));
		const y = Math.floor((screenY - rect.top) / (rect.height / boardHeight));
		
		// Clamp to board bounds
		return {
			x: Math.max(0, Math.min(boardWidth - 1, x)),
			y: Math.max(0, Math.min(boardHeight - 1, y))
		};
	} catch (error) {
		console.error('Error converting screen to board coordinates:', error);
		return { x: 0, y: 0 };
	}
}

/**
 * Check if a key is pressed
 * @param {string} key - Key to check
 * @returns {boolean} - Whether the key is pressed
 */
export function isKeyPressed(key) {
	return !!keyStates[key];
}

/**
 * Get mouse position
 * @returns {Object} - Mouse position
 */
export function getMousePosition() {
	return { ...mousePosition };
}

/**
 * Check if mouse is dragging
 * @returns {boolean} - Whether the mouse is dragging
 */
export function isDraggingMouse() {
	return isDragging;
}

/**
 * Get drag start position
 * @returns {Object} - Drag start position
 */
export function getDragStartPosition() {
	return { ...dragStartPosition };
}

/**
 * Reset the input controller
 */
export function reset() {
	try {
		// Reset state
		inputMode = GAME_CONSTANTS.INPUT_MODE.TETROMINO;
		keyStates = {};
		mousePosition = { x: 0, y: 0 };
		isDragging = false;
		dragStartPosition = { x: 0, y: 0 };
		lastKeyRepeatTime = {};
		
		console.log('Input controller reset');
	} catch (error) {
		console.error('Error resetting input controller:', error);
	}
}
