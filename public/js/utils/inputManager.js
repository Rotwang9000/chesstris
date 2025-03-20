/**
 * Input Manager - Handles keyboard and mouse input
 */

// Input state
let keyState = {};
let mouseState = { 
	x: 0, 
	y: 0, 
	buttons: {
		left: false,
		middle: false,
		right: false
	}
};
let isMouseOverCanvas = false;
let isEnabled = false;
let inputCallbacks = {
	keyDown: [],
	keyUp: [],
	mouseMove: [],
	mouseDown: [],
	mouseUp: [],
	mouseWheel: []
};

// Default key bindings
const defaultKeyBindings = {
	moveLeft: 'ArrowLeft',
	moveRight: 'ArrowRight',
	moveDown: 'ArrowDown',
	rotateClockwise: 'ArrowUp',
	rotateCCW: 'z',
	hardDrop: ' ',
	hold: 'c',
	pause: 'p'
};

let keyBindings = { ...defaultKeyBindings };

/**
 * Initialize the input manager
 * @param {HTMLElement} targetElement - The element to attach listeners to
 * @param {Object} options - Configuration options
 * @returns {boolean} Success status
 */
export function init(targetElement, options = {}) {
	try {
		if (isEnabled) {
			console.warn('Input manager already initialized');
			return true;
		}
		
		console.log('Initializing input manager...');
		
		// Get target element (default to document)
		const target = targetElement || document;
		
		// Set key bindings if provided
		if (options.keyBindings) {
			keyBindings = { ...defaultKeyBindings, ...options.keyBindings };
		}
		
		// Set up event listeners
		target.addEventListener('keydown', handleKeyDown);
		target.addEventListener('keyup', handleKeyUp);
		target.addEventListener('mousemove', handleMouseMove);
		target.addEventListener('mousedown', handleMouseDown);
		target.addEventListener('mouseup', handleMouseUp);
		target.addEventListener('wheel', handleMouseWheel);
		target.addEventListener('mouseenter', () => { isMouseOverCanvas = true; });
		target.addEventListener('mouseleave', () => { isMouseOverCanvas = false; });
		
		// Clear input states
		keyState = {};
		mouseState = { x: 0, y: 0, buttons: { left: false, middle: false, right: false } };
		
		isEnabled = true;
		console.log('Input manager initialized');
		return true;
	} catch (error) {
		console.error('Error initializing input manager:', error);
		return false;
	}
}

/**
 * Handle keydown events
 * @param {KeyboardEvent} event - Keyboard event
 */
function handleKeyDown(event) {
	// Avoid handling repeated keydown events
	if (event.repeat) return;
	
	keyState[event.key] = true;
	
	// Call registered callbacks
	inputCallbacks.keyDown.forEach(callback => {
		try {
			callback(event.key, event);
		} catch (error) {
			console.error('Error in keyDown callback:', error);
		}
	});
}

/**
 * Handle keyup events
 * @param {KeyboardEvent} event - Keyboard event
 */
function handleKeyUp(event) {
	keyState[event.key] = false;
	
	// Call registered callbacks
	inputCallbacks.keyUp.forEach(callback => {
		try {
			callback(event.key, event);
		} catch (error) {
			console.error('Error in keyUp callback:', error);
		}
	});
}

/**
 * Handle mousemove events
 * @param {MouseEvent} event - Mouse event
 */
function handleMouseMove(event) {
	mouseState.x = event.clientX;
	mouseState.y = event.clientY;
	
	// Call registered callbacks
	inputCallbacks.mouseMove.forEach(callback => {
		try {
			callback(mouseState, event);
		} catch (error) {
			console.error('Error in mouseMove callback:', error);
		}
	});
}

/**
 * Handle mousedown events
 * @param {MouseEvent} event - Mouse event
 */
function handleMouseDown(event) {
	if (event.button === 0) mouseState.buttons.left = true;
	if (event.button === 1) mouseState.buttons.middle = true;
	if (event.button === 2) mouseState.buttons.right = true;
	
	// Call registered callbacks
	inputCallbacks.mouseDown.forEach(callback => {
		try {
			callback(mouseState, event);
		} catch (error) {
			console.error('Error in mouseDown callback:', error);
		}
	});
}

/**
 * Handle mouseup events
 * @param {MouseEvent} event - Mouse event
 */
function handleMouseUp(event) {
	if (event.button === 0) mouseState.buttons.left = false;
	if (event.button === 1) mouseState.buttons.middle = false;
	if (event.button === 2) mouseState.buttons.right = false;
	
	// Call registered callbacks
	inputCallbacks.mouseUp.forEach(callback => {
		try {
			callback(mouseState, event);
		} catch (error) {
			console.error('Error in mouseUp callback:', error);
		}
	});
}

/**
 * Handle mousewheel events
 * @param {WheelEvent} event - Wheel event
 */
function handleMouseWheel(event) {
	// Call registered callbacks
	inputCallbacks.mouseWheel.forEach(callback => {
		try {
			callback(event.deltaY, event);
		} catch (error) {
			console.error('Error in mouseWheel callback:', error);
		}
	});
}

/**
 * Register a callback for a specific input event
 * @param {string} eventType - Event type ('keyDown', 'keyUp', 'mouseMove', 'mouseDown', 'mouseUp', 'mouseWheel')
 * @param {Function} callback - Callback function
 * @returns {boolean} Success status
 */
export function registerCallback(eventType, callback) {
	if (!inputCallbacks[eventType]) {
		console.error(`Invalid event type: ${eventType}`);
		return false;
	}
	
	if (typeof callback !== 'function') {
		console.error('Callback must be a function');
		return false;
	}
	
	inputCallbacks[eventType].push(callback);
	return true;
}

/**
 * Unregister a callback for a specific input event
 * @param {string} eventType - Event type ('keyDown', 'keyUp', 'mouseMove', 'mouseDown', 'mouseUp', 'mouseWheel')
 * @param {Function} callback - Callback function to remove
 * @returns {boolean} Success status
 */
export function unregisterCallback(eventType, callback) {
	if (!inputCallbacks[eventType]) {
		console.error(`Invalid event type: ${eventType}`);
		return false;
	}
	
	const index = inputCallbacks[eventType].indexOf(callback);
	if (index === -1) {
		console.warn('Callback not found');
		return false;
	}
	
	inputCallbacks[eventType].splice(index, 1);
	return true;
}

/**
 * Check if a key is currently pressed
 * @param {string} key - Key to check
 * @returns {boolean} True if key is pressed
 */
export function isKeyPressed(key) {
	return !!keyState[key];
}

/**
 * Check if a specific action key is currently pressed
 * @param {string} action - Action name (e.g., 'moveLeft', 'rotateClockwise')
 * @returns {boolean} True if the action key is pressed
 */
export function isActionPressed(action) {
	if (!keyBindings[action]) {
		console.warn(`Unknown action: ${action}`);
		return false;
	}
	
	return !!keyState[keyBindings[action]];
}

/**
 * Get the current mouse state
 * @returns {Object} Mouse state object
 */
export function getMouseState() {
	return { ...mouseState };
}

/**
 * Check if the mouse is over the canvas
 * @returns {boolean} True if mouse is over canvas
 */
export function isMouseOver() {
	return isMouseOverCanvas;
}

/**
 * Reset key and mouse states
 */
export function resetStates() {
	keyState = {};
	mouseState = { x: 0, y: 0, buttons: { left: false, middle: false, right: false } };
}

/**
 * Clean up event listeners
 * @param {HTMLElement} targetElement - The element to remove listeners from
 */
export function cleanup(targetElement) {
	try {
		if (!isEnabled) {
			return;
		}
		
		const target = targetElement || document;
		
		// Remove event listeners
		target.removeEventListener('keydown', handleKeyDown);
		target.removeEventListener('keyup', handleKeyUp);
		target.removeEventListener('mousemove', handleMouseMove);
		target.removeEventListener('mousedown', handleMouseDown);
		target.removeEventListener('mouseup', handleMouseUp);
		target.removeEventListener('wheel', handleMouseWheel);
		
		// Clear callbacks
		Object.keys(inputCallbacks).forEach(key => {
			inputCallbacks[key] = [];
		});
		
		// Reset state
		resetStates();
		isEnabled = false;
		
		console.log('Input manager cleaned up');
	} catch (error) {
		console.error('Error cleaning up input manager:', error);
	}
} 