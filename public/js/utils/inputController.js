/**
 * Input Controller Module
 * 
 * Handles user input (keyboard, mouse, touch) and manages callbacks.
 */

import * as gameStateManager from './gameStateManager.js';
import * as gameRenderer from './gameRenderer.js';

// Input state
let isEnabled = false;
let mousePosition = { x: 0, y: 0 };
let isMouseDown = false;
let keyboardState = {};
let isDragging = false;
let dragObject = null;
let isTouchDevice = false;

// Input settings
let settings = {
	mouseSensitivity: 1.0,
	dragThreshold: 5 // Pixels before a mouse down becomes a drag
};

// Input callbacks
const inputCallbacks = {
	onMouseDown: [],
	onMouseUp: [],
	onMouseMove: [],
	onMouseWheel: [],
	onKeyDown: [],
	onKeyUp: [],
	onTouchStart: [],
	onTouchEnd: [],
	onTouchMove: [],
	onClick: [],
	onDragStart: [],
	onDragEnd: [],
	onDrag: []
};

// Key mappings
const keyMappings = {
	'ArrowLeft': 'moveLeft',
	'ArrowRight': 'moveRight',
	'ArrowDown': 'moveDown',
	'ArrowUp': 'rotateClockwise',
	'z': 'rotateCounterClockwise',
	'x': 'rotateClockwise',
	'c': 'hold',
	' ': 'hardDrop',
	'Escape': 'pause',
	'p': 'pause'
};

/**
 * Initialize the input controller
 * @param {Object} options - Input options
 * @returns {Promise<boolean>} - Initialization success
 */
export async function init(options = {}) {
	try {
		// Apply options
		if (options.mouseSensitivity !== undefined) {
			settings.mouseSensitivity = options.mouseSensitivity;
		}
		
		if (options.dragThreshold !== undefined) {
			settings.dragThreshold = options.dragThreshold;
		}
		
		// Register event listeners
		registerEventListeners();
		
		// Check if it's a touch device
		isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
		
		// Enable input
		isEnabled = true;
		
		console.log('Input controller initialized');
		return true;
	} catch (error) {
		console.error('Error initializing input controller:', error);
		return false;
	}
}

/**
 * Register event listeners
 */
function registerEventListeners() {
	// Mouse events
	document.addEventListener('mousedown', handleMouseDown);
	document.addEventListener('mouseup', handleMouseUp);
	document.addEventListener('mousemove', handleMouseMove);
	document.addEventListener('wheel', handleMouseWheel);
	
	// Keyboard events
	document.addEventListener('keydown', handleKeyDown);
	document.addEventListener('keyup', handleKeyUp);
	
	// Touch events
	document.addEventListener('touchstart', handleTouchStart);
	document.addEventListener('touchend', handleTouchEnd);
	document.addEventListener('touchmove', handleTouchMove);
	
	// Prevent context menu on right click
	document.addEventListener('contextmenu', (event) => {
		// Only prevent context menu on game canvas
		if (event.target.tagName === 'CANVAS') {
			event.preventDefault();
		}
	});
}

/**
 * Handle mouse down event
 * @param {MouseEvent} event - Mouse event
 */
function handleMouseDown(event) {
	if (!isEnabled) return;
	
	isMouseDown = true;
	mousePosition = { x: event.clientX, y: event.clientY };
	
	// Check for chess piece selection or move
	handleGameClick(event);
	
	// Trigger callbacks
	triggerCallback('onMouseDown', {
		x: event.clientX,
		y: event.clientY,
		button: event.button,
		originalEvent: event
	});
}

/**
 * Handle mouse up event
 * @param {MouseEvent} event - Mouse event
 */
function handleMouseUp(event) {
	if (!isEnabled) return;
	
	isMouseDown = false;
	
	// Check if we were dragging
	if (isDragging) {
		isDragging = false;
		
		// Trigger drag end callback
		triggerCallback('onDragEnd', {
			x: event.clientX,
			y: event.clientY,
			dragObject,
			originalEvent: event
		});
		
		dragObject = null;
	} else {
	// Trigger click callback
		triggerCallback('onClick', {
			x: event.clientX,
			y: event.clientY,
			button: event.button,
			originalEvent: event
		});
	}
	
	// Trigger mouse up callback
	triggerCallback('onMouseUp', {
		x: event.clientX,
		y: event.clientY,
		button: event.button,
		originalEvent: event
	});
}

/**
 * Handle mouse move event
 * @param {MouseEvent} event - Mouse event
 */
function handleMouseMove(event) {
	if (!isEnabled) return;
	
	const newPosition = { x: event.clientX, y: event.clientY };
	
	// Check if we're dragging
	if (isMouseDown) {
		const dx = newPosition.x - mousePosition.x;
		const dy = newPosition.y - mousePosition.y;
		const distanceSquared = dx * dx + dy * dy;
		
		if (!isDragging && distanceSquared > settings.dragThreshold * settings.dragThreshold) {
			// Start dragging
			isDragging = true;
			
			// Trigger drag start callback
			triggerCallback('onDragStart', {
				x: event.clientX,
				y: event.clientY,
				originalEvent: event
			});
		} else if (isDragging) {
			// Trigger drag callback
			triggerCallback('onDrag', {
				x: event.clientX,
				y: event.clientY,
				dx,
				dy,
				dragObject,
				originalEvent: event
			});
		}
	}
	
	mousePosition = newPosition;
	
	// Trigger mouse move callback
	triggerCallback('onMouseMove', {
		x: event.clientX,
		y: event.clientY,
		originalEvent: event
	});
}

/**
 * Handle mouse wheel event
 * @param {WheelEvent} event - Wheel event
 */
function handleMouseWheel(event) {
	if (!isEnabled) return;
	
	// Trigger mouse wheel callback
	triggerCallback('onMouseWheel', {
		x: event.clientX,
		y: event.clientY,
		deltaY: event.deltaY,
		originalEvent: event
	});
}

/**
 * Handle key down event
 * @param {KeyboardEvent} event - Keyboard event
 */
function handleKeyDown(event) {
	if (!isEnabled) return;
	
	// Update keyboard state
	keyboardState[event.key] = true;
	
	// Check for game actions
	const action = keyMappings[event.key];
	if (action) {
		// Prevent default for game actions
	event.preventDefault();
		
		// Send action to game state manager
		const currentState = gameStateManager.getGameState();
		if (currentState && currentState.turnPhase === 'tetromino') {
			gameStateManager.handleTetrominoAction(action);
		}
	}
	
	// Trigger key down callback
	triggerCallback('onKeyDown', {
		key: event.key,
		code: event.code,
		action,
		originalEvent: event
	});
}

/**
 * Handle key up event
 * @param {KeyboardEvent} event - Keyboard event
 */
function handleKeyUp(event) {
	if (!isEnabled) return;
	
	// Update keyboard state
	keyboardState[event.key] = false;
	
	// Trigger key up callback
	triggerCallback('onKeyUp', {
		key: event.key,
		code: event.code,
		originalEvent: event
	});
}

/**
 * Handle touch start event
 * @param {TouchEvent} event - Touch event
 */
function handleTouchStart(event) {
	if (!isEnabled) return;
	
	// Prevent default for touch events on game canvas
	if (event.target.tagName === 'CANVAS') {
	event.preventDefault();
}

	isMouseDown = true;
	
	// Get first touch
	const touch = event.touches[0];
	mousePosition = { x: touch.clientX, y: touch.clientY };
	
	// Check for chess piece selection or move
	handleGameClick({
		clientX: touch.clientX,
		clientY: touch.clientY,
		button: 0
	});
	
	// Trigger callbacks
	triggerCallback('onTouchStart', {
		x: touch.clientX,
		y: touch.clientY,
		touches: event.touches,
		originalEvent: event
	});
}

/**
 * Handle touch end event
 * @param {TouchEvent} event - Touch event
 */
function handleTouchEnd(event) {
	if (!isEnabled) return;
	
	// Prevent default for touch events on game canvas
	if (event.target.tagName === 'CANVAS') {
		event.preventDefault();
	}
	
	isMouseDown = false;
	
	// Get touch position
	let x = mousePosition.x;
	let y = mousePosition.y;
	
	if (event.changedTouches.length > 0) {
		const touch = event.changedTouches[0];
		x = touch.clientX;
		y = touch.clientY;
	}
	
	// Check if we were dragging
	if (isDragging) {
		isDragging = false;
		
		// Trigger drag end callback
		triggerCallback('onDragEnd', {
			x,
			y,
			dragObject,
			originalEvent: event
		});
		
		dragObject = null;
	} else {
		// Trigger click callback
		triggerCallback('onClick', {
			x,
			y,
			button: 0,
			originalEvent: event
		});
	}
	
	// Trigger touch end callback
	triggerCallback('onTouchEnd', {
		x,
		y,
		touches: event.touches,
		originalEvent: event
	});
}

/**
 * Handle touch move event
 * @param {TouchEvent} event - Touch event
 */
function handleTouchMove(event) {
	if (!isEnabled) return;
	
	// Prevent default for touch events on game canvas
	if (event.target.tagName === 'CANVAS') {
		event.preventDefault();
	}
	
	// Get first touch
	const touch = event.touches[0];
	const newPosition = { x: touch.clientX, y: touch.clientY };
	
	// Check if we're dragging
	if (isMouseDown) {
		const dx = newPosition.x - mousePosition.x;
		const dy = newPosition.y - mousePosition.y;
		const distanceSquared = dx * dx + dy * dy;
		
		if (!isDragging && distanceSquared > settings.dragThreshold * settings.dragThreshold) {
			// Start dragging
			isDragging = true;
			
			// Trigger drag start callback
			triggerCallback('onDragStart', {
				x: touch.clientX,
				y: touch.clientY,
				originalEvent: event
			});
		} else if (isDragging) {
			// Trigger drag callback
			triggerCallback('onDrag', {
				x: touch.clientX,
				y: touch.clientY,
				dx,
				dy,
				dragObject,
				originalEvent: event
			});
		}
	}
	
	mousePosition = newPosition;
	
	// Trigger touch move callback
	triggerCallback('onTouchMove', {
		x: touch.clientX,
		y: touch.clientY,
		touches: event.touches,
		originalEvent: event
	});
}

/**
 * Handle game clicks (for chess piece selection and movement)
 * @param {MouseEvent|Object} event - Mouse event or similar object
 */
function handleGameClick(event) {
	const gameState = gameStateManager.getGameState();
	if (!gameState) return;
	
	// Get board coordinates from screen coordinates
	const boardCoords = screenToBoardCoordinates(event.clientX, event.clientY);
	if (!boardCoords) return;
	
	// Check if we have a selected piece
	const selectedPiece = gameStateManager.getSelectedChessPiece();
	
	if (selectedPiece) {
		// Attempt to move the selected piece
		if (gameStateManager.moveSelectedPiece(boardCoords.x, boardCoords.z)) {
			console.log(`Moving piece to ${boardCoords.x}, ${boardCoords.z}`);
		} else {
			// If move failed, check if clicked on a different chess piece
			const clickedPiece = findChessPieceAt(boardCoords.x, boardCoords.z);
			if (clickedPiece && clickedPiece.playerId === gameState.localPlayerId) {
				// Select the new piece
				gameStateManager.selectChessPiece(clickedPiece.id);
			} else {
				// Clear selection
				gameStateManager.clearChessPieceSelection();
			}
		}
	} else {
		// No piece selected, try to select one
		const clickedPiece = findChessPieceAt(boardCoords.x, boardCoords.z);
		if (clickedPiece && clickedPiece.playerId === gameState.localPlayerId) {
			// Select the piece
			gameStateManager.selectChessPiece(clickedPiece.id);
		}
	}
}

/**
 * Convert screen coordinates to board coordinates
 * @param {number} screenX - X position in screen space
 * @param {number} screenY - Y position in screen space
 * @returns {Object|null} - {x, z} board coordinates or null if not on board
 */
function screenToBoardCoordinates(screenX, screenY) {
	// Use gameRenderer.screenToBoardCoordinates if available
	if (gameRenderer && typeof gameRenderer.screenToBoardCoordinates === 'function') {
		return gameRenderer.screenToBoardCoordinates(screenX, screenY);
	}
	
	// Fallback implementation for 2D
	try {
		// Get game container
		const gameContainer = document.getElementById('game-container');
		if (!gameContainer) return null;
		
		// Get container dimensions
		const rect = gameContainer.getBoundingClientRect();
		
		// Check if click is outside of container
		if (screenX < rect.left || screenX > rect.right || 
			screenY < rect.top || screenY > rect.bottom) {
			return null;
		}
		
		// Convert to relative position in container
		const relX = (screenX - rect.left) / rect.width;
		const relY = (screenY - rect.top) / rect.height;
		
		// Get current game state
		const gameState = gameStateManager.getGameState();
		
		// Get board dimensions
		const boardWidth = gameState.board?.length || 16;
		const boardHeight = gameState.board?.[0]?.length || 16;
		
		// Convert to board coordinates 
		const x = Math.floor(relX * boardWidth);
		// In the 3D game Z is the equivalent of Y in 2D space
		const z = Math.floor(relY * boardHeight);
		
		return { x, z };
	} catch (error) {
		console.error('Error converting screen to board coordinates:', error);
		return null;
	}
}

/**
 * Find a chess piece at board coordinates
 * @param {number} x - Board X coordinate
 * @param {number} z - Board Z coordinate
 * @returns {Object|null} - Chess piece object or null if not found
 */
function findChessPieceAt(x, z) {
	const gameState = gameStateManager.getGameState();
	if (!gameState || !gameState.chessPieces) return null;
	
	return gameState.chessPieces.find(piece => 
		piece && piece.position && 
		Math.floor(piece.position.x) === x && 
		Math.floor(piece.position.z) === z
	);
}

/**
 * Trigger a callback
 * @param {string} type - Callback type
 * @param {Object} data - Callback data
 */
function triggerCallback(type, data) {
	if (!inputCallbacks[type]) return;
	
	for (const callback of inputCallbacks[type]) {
		try {
			callback(data);
		} catch (error) {
			console.error(`Error in ${type} callback:`, error);
		}
	}
}

/**
 * Register a callback
 * @param {string} type - Callback type
 * @param {Function} callback - Callback function
 */
export function on(type, callback) {
	if (!inputCallbacks[type]) {
		inputCallbacks[type] = [];
	}
	
	inputCallbacks[type].push(callback);
}

/**
 * Unregister a callback
 * @param {string} type - Callback type
 * @param {Function} callback - Callback function
 */
export function off(type, callback) {
	if (!inputCallbacks[type]) return;
	
	if (callback) {
		// Remove specific callback
		inputCallbacks[type] = inputCallbacks[type].filter(cb => cb !== callback);
	} else {
		// Remove all callbacks for this type
		inputCallbacks[type] = [];
	}
}

/**
 * Enable/disable input
 * @param {boolean} enabled - Whether input should be enabled
 */
export function setEnabled(enabled) {
	isEnabled = enabled;
}

/**
 * Clean up resources
 */
export function cleanup() {
	// Remove event listeners
	document.removeEventListener('mousedown', handleMouseDown);
	document.removeEventListener('mouseup', handleMouseUp);
	document.removeEventListener('mousemove', handleMouseMove);
	document.removeEventListener('wheel', handleMouseWheel);
	document.removeEventListener('keydown', handleKeyDown);
	document.removeEventListener('keyup', handleKeyUp);
	document.removeEventListener('touchstart', handleTouchStart);
	document.removeEventListener('touchend', handleTouchEnd);
	document.removeEventListener('touchmove', handleTouchMove);
	
	// Clear callbacks
	for (const type in inputCallbacks) {
		inputCallbacks[type] = [];
	}
	
	// Reset state
	isEnabled = false;
	isMouseDown = false;
	isDragging = false;
	dragObject = null;
	keyboardState = {};
}
