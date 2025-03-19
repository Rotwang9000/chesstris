/**
 * Input Controller Utility
 *
 * Handles keyboard and mouse input for the game
 */

// Default key bindings
const DEFAULT_KEY_BINDINGS = {
	// Movement
	moveLeft: ['ArrowLeft', 'a', 'A'],
	moveRight: ['ArrowRight', 'd', 'D'],
	softDrop: ['ArrowDown', 's', 'S'],
	hardDrop: ['Space', ' '],
	
	// Rotation
	rotateClockwise: ['ArrowUp', 'w', 'W', 'x', 'X'],
	rotateCounterClockwise: ['z', 'Z', 'Control'],
	
	// Game actions
	hold: ['Shift', 'c', 'C'],
	pause: ['Escape', 'p', 'P'],
	
	// Chess piece selection and movement
	select: ['Enter'],
	cancel: ['Escape', 'Backspace'],
	
	// Debug
	debug: ['F9']
};

// Input state
let keyState = {};
let mouseState = {
	x: 0,
	y: 0,
	buttons: 0,
	wheel: 0
};
let isInitialized = false;
let isPaused = false;
let keyBindings = { ...DEFAULT_KEY_BINDINGS };
let callbacks = {};
let inputCallbacks = [];
let touchState = {
	active: false,
	startX: 0,
	startY: 0,
	currentX: 0,
	currentY: 0,
	startTime: 0
};

// Constants
const DOUBLE_TAP_TIME = 300; // ms
const SWIPE_THRESHOLD = 50; // pixels
let lastTapTime = 0;

/**
 * Initialize the input controller
 * @param {Object} options - Configuration options
 * @returns {boolean} Success status
 */
export function init(options = {}) {
	try {
		if (isInitialized) {
			console.warn('Input controller already initialized');
			return true;
		}
		
		console.log('Initializing input controller...');
		
		// Apply custom key bindings if provided
		if (options.keyBindings) {
			keyBindings = { ...DEFAULT_KEY_BINDINGS, ...options.keyBindings };
		}
		
		// Store callback if provided
		if (options.onInput && typeof options.onInput === 'function') {
			inputCallbacks.push(options.onInput);
		}
		
		// Set up keyboard event listeners
		window.addEventListener('keydown', handleKeyDown);
		window.addEventListener('keyup', handleKeyUp);
		
		// Set up mouse event listeners for the game container if provided
		const element = options.element || document.getElementById('game-container');
		
		if (element && element.addEventListener) {
			element.addEventListener('mousedown', handleMouseDown);
			element.addEventListener('mouseup', handleMouseUp);
			element.addEventListener('mousemove', handleMouseMove);
			element.addEventListener('wheel', handleMouseWheel);
			element.addEventListener('contextmenu', handleContextMenu);
			
			// Set up touch event listeners for mobile
			element.addEventListener('touchstart', handleTouchStart);
			element.addEventListener('touchmove', handleTouchMove);
			element.addEventListener('touchend', handleTouchEnd);
			element.addEventListener('touchcancel', handleTouchCancel);
		} else {
			console.warn('No valid element provided for mouse/touch events, using document.body');
			// Fall back to document.body for mouse events
			document.body.addEventListener('mousedown', handleMouseDown);
			document.body.addEventListener('mouseup', handleMouseUp);
			document.body.addEventListener('mousemove', handleMouseMove);
			document.body.addEventListener('wheel', handleMouseWheel);
			document.body.addEventListener('contextmenu', handleContextMenu);
			
			// Set up touch event listeners for mobile
			document.body.addEventListener('touchstart', handleTouchStart);
			document.body.addEventListener('touchmove', handleTouchMove);
			document.body.addEventListener('touchend', handleTouchEnd);
			document.body.addEventListener('touchcancel', handleTouchCancel);
		}
		
		// Set up window blur event to reset keys when window loses focus
		window.addEventListener('blur', handleWindowBlur);
		
		isInitialized = true;
		console.log('Input controller initialized');
		return true;
	} catch (error) {
		console.error('Error initializing input controller:', error);
		return false;
	}
}

/**
 * Register a callback for an input action
 * @param {string} action - Action name
 * @param {Function} callback - Callback function
 */
export function on(action, callback) {
	if (!callbacks[action]) {
		callbacks[action] = [];
	}
	callbacks[action].push(callback);
}

/**
 * Remove a callback for an input action
 * @param {string} action - Action name
 * @param {Function} callback - Callback function to remove
 */
export function off(action, callback) {
	if (!callbacks[action]) {
		return;
	}
	
	if (callback) {
		// Remove specific callback
		callbacks[action] = callbacks[action].filter(cb => cb !== callback);
	} else {
		// Remove all callbacks for this action
		delete callbacks[action];
	}
}

/**
 * Set custom key bindings
 * @param {Object} bindings - Custom key bindings
 */
export function setKeyBindings(bindings) {
	keyBindings = { ...DEFAULT_KEY_BINDINGS, ...bindings };
}

/**
 * Reset key bindings to default
 */
export function resetKeyBindings() {
	keyBindings = { ...DEFAULT_KEY_BINDINGS };
}

/**
 * Get current key bindings
 * @returns {Object} Current key bindings
 */
export function getKeyBindings() {
	return { ...keyBindings };
}

/**
 * Check if a key is currently pressed
 * @param {string} key - Key to check
 * @returns {boolean} Whether the key is pressed
 */
export function isKeyPressed(key) {
	return !!keyState[key];
}

/**
 * Check if an action's key is currently pressed
 * @param {string} action - Action to check
 * @returns {boolean} Whether any key for the action is pressed
 */
export function isActionPressed(action) {
	if (!keyBindings[action]) {
		return false;
	}
	
	return keyBindings[action].some(key => isKeyPressed(key));
}

/**
 * Get current mouse position
 * @returns {Object} Mouse position {x, y}
 */
export function getMousePosition() {
	return { x: mouseState.x, y: mouseState.y };
}

/**
 * Check if a mouse button is currently pressed
 * @param {number} button - Button to check (0 = left, 1 = middle, 2 = right)
 * @returns {boolean} Whether the button is pressed
 */
export function isMouseButtonPressed(button) {
	return !!(mouseState.buttons & (1 << button));
}

/**
 * Pause input processing
 */
export function pause() {
	isPaused = true;
}

/**
 * Resume input processing
 */
export function resume() {
	isPaused = false;
}

/**
 * Clean up resources
 */
export function cleanup() {
	try {
		console.log('Cleaning up input controller...');
		
		// Remove keyboard event listeners
		window.removeEventListener('keydown', handleKeyDown);
		window.removeEventListener('keyup', handleKeyUp);
		
		// Remove mouse event listeners from all elements
		document.removeEventListener('mousedown', handleMouseDown);
		document.removeEventListener('mouseup', handleMouseUp);
		document.removeEventListener('mousemove', handleMouseMove);
		document.removeEventListener('wheel', handleMouseWheel);
		document.removeEventListener('contextmenu', handleContextMenu);
		
		// Remove touch event listeners
		document.removeEventListener('touchstart', handleTouchStart);
		document.removeEventListener('touchmove', handleTouchMove);
		document.removeEventListener('touchend', handleTouchEnd);
		document.removeEventListener('touchcancel', handleTouchCancel);
		
		// Remove window blur event
		window.removeEventListener('blur', handleWindowBlur);
		
		// Reset state
		keyState = {};
		mouseState = { x: 0, y: 0, buttons: 0, wheel: 0 };
		touchState = { active: false, startX: 0, startY: 0, currentX: 0, currentY: 0, startTime: 0 };
		callbacks = {};
		isInitialized = false;
		isPaused = false;
		
		console.log('Input controller cleaned up');
	} catch (error) {
		console.error('Error cleaning up input controller:', error);
	}
}

// Event handlers

/**
 * Handle key down event
 * @param {KeyboardEvent} event - Keyboard event
 */
function handleKeyDown(event) {
	if (isPaused) return;
	
	// Update key state
	keyState[event.key] = true;
	
	// Find matching actions
	for (const [action, keys] of Object.entries(keyBindings)) {
		if (keys.includes(event.key)) {
			// Trigger callbacks
			triggerCallbacks(`${action}:down`, { key: event.key });
			triggerCallbacks(action, { key: event.key, type: 'down' });
			
			// Prevent default for game keys
			event.preventDefault();
			break;
		}
	}
}

/**
 * Handle key up event
 * @param {KeyboardEvent} event - Keyboard event
 */
function handleKeyUp(event) {
	// Update key state even when paused
	keyState[event.key] = false;
	
	if (isPaused) return;
	
	// Find matching actions
	for (const [action, keys] of Object.entries(keyBindings)) {
		if (keys.includes(event.key)) {
			// Trigger callbacks
			triggerCallbacks(`${action}:up`, { key: event.key });
			triggerCallbacks(action, { key: event.key, type: 'up' });
			
			// Prevent default for game keys
			event.preventDefault();
			break;
		}
	}
}

/**
 * Handle mouse down event
 * @param {MouseEvent} event - Mouse event
 */
function handleMouseDown(event) {
	if (isPaused) return;
	
	// Update mouse state
	mouseState.buttons |= (1 << event.button);
	mouseState.x = event.clientX;
	mouseState.y = event.clientY;
	
	// Trigger callbacks
	triggerCallbacks('mousedown', {
		x: mouseState.x,
		y: mouseState.y,
		button: event.button
	});
}

/**
 * Handle mouse up event
 * @param {MouseEvent} event - Mouse event
 */
function handleMouseUp(event) {
	if (isPaused) return;
	
	// Update mouse state
	mouseState.buttons &= ~(1 << event.button);
	mouseState.x = event.clientX;
	mouseState.y = event.clientY;
	
	// Trigger callbacks
	triggerCallbacks('mouseup', {
		x: mouseState.x,
		y: mouseState.y,
		button: event.button
	});
	
	// Trigger click callback
	triggerCallbacks('click', {
		x: mouseState.x,
		y: mouseState.y,
		button: event.button
	});
}

/**
 * Handle mouse move event
 * @param {MouseEvent} event - Mouse event
 */
function handleMouseMove(event) {
	if (isPaused) return;
	
	// Calculate delta
	const deltaX = event.clientX - mouseState.x;
	const deltaY = event.clientY - mouseState.y;
	
	// Update mouse state
	mouseState.x = event.clientX;
	mouseState.y = event.clientY;
	
	// Trigger callbacks
	triggerCallbacks('mousemove', {
		x: mouseState.x,
		y: mouseState.y,
		deltaX,
		deltaY,
		buttons: mouseState.buttons
	});
}

/**
 * Handle mouse wheel event
 * @param {WheelEvent} event - Wheel event
 */
function handleMouseWheel(event) {
	if (isPaused) return;
	
	// Update mouse state
	mouseState.wheel += event.deltaY;
	
	// Trigger callbacks
	triggerCallbacks('wheel', {
		x: mouseState.x,
		y: mouseState.y,
		deltaY: event.deltaY
	});
	
	// Prevent default scrolling
	event.preventDefault();
}

/**
 * Handle context menu event
 * @param {MouseEvent} event - Mouse event
 */
function handleContextMenu(event) {
	// Prevent default context menu
	event.preventDefault();
}

/**
 * Handle touch start event
 * @param {TouchEvent} event - Touch event
 */
function handleTouchStart(event) {
	if (isPaused) return;
	
	// Get primary touch
	const touch = event.touches[0];
	
	// Update touch state
	touchState.active = true;
	touchState.startX = touch.clientX;
	touchState.startY = touch.clientY;
	touchState.currentX = touch.clientX;
	touchState.currentY = touch.clientY;
	touchState.startTime = Date.now();
	
	// Update mouse state for compatibility
	mouseState.x = touch.clientX;
	mouseState.y = touch.clientY;
	mouseState.buttons = 1; // Simulate left button
	
	// Check for double tap
	const now = Date.now();
	if (now - lastTapTime < DOUBLE_TAP_TIME) {
		triggerCallbacks('doubletap', {
			x: touchState.currentX,
			y: touchState.currentY
		});
	}
	lastTapTime = now;
	
	// Trigger callbacks
	triggerCallbacks('touchstart', {
		x: touchState.currentX,
		y: touchState.currentY,
		touches: event.touches.length
	});
	
	// Prevent default to avoid scrolling
	event.preventDefault();
}

/**
 * Handle touch move event
 * @param {TouchEvent} event - Touch event
 */
function handleTouchMove(event) {
	if (isPaused || !touchState.active) return;
	
	// Get primary touch
	const touch = event.touches[0];
	
	// Calculate delta
	const deltaX = touch.clientX - touchState.currentX;
	const deltaY = touch.clientY - touchState.currentY;
	
	// Update touch state
	touchState.currentX = touch.clientX;
	touchState.currentY = touch.clientY;
	
	// Update mouse state for compatibility
	mouseState.x = touch.clientX;
	mouseState.y = touch.clientY;
	
	// Trigger callbacks
	triggerCallbacks('touchmove', {
		x: touchState.currentX,
		y: touchState.currentY,
		deltaX,
		deltaY,
		touches: event.touches.length
	});
	
	// Prevent default to avoid scrolling
	event.preventDefault();
}

/**
 * Handle touch end event
 * @param {TouchEvent} event - Touch event
 */
function handleTouchEnd(event) {
	if (!touchState.active) return;
	
	// Calculate swipe
	const deltaX = touchState.currentX - touchState.startX;
	const deltaY = touchState.currentY - touchState.startY;
	const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
	const duration = Date.now() - touchState.startTime;
	
	// Update mouse state for compatibility
	mouseState.buttons = 0;
	
	// Check for swipe
	if (distance > SWIPE_THRESHOLD) {
		// Determine swipe direction
		const absX = Math.abs(deltaX);
		const absY = Math.abs(deltaY);
		
		if (absX > absY) {
			// Horizontal swipe
			if (deltaX > 0) {
				triggerCallbacks('swiperight', { distance, duration });
			} else {
				triggerCallbacks('swipeleft', { distance, duration });
			}
		} else {
			// Vertical swipe
			if (deltaY > 0) {
				triggerCallbacks('swipedown', { distance, duration });
			} else {
				triggerCallbacks('swipeup', { distance, duration });
			}
		}
	} else {
		// Tap
		triggerCallbacks('tap', {
			x: touchState.currentX,
			y: touchState.currentY
		});
	}
	
	// Trigger callbacks
	triggerCallbacks('touchend', {
		x: touchState.currentX,
		y: touchState.currentY,
		touches: event.touches.length
	});
	
	// Reset touch state
	touchState.active = false;
	
	// Prevent default
	event.preventDefault();
}

/**
 * Handle touch cancel event
 * @param {TouchEvent} event - Touch event
 */
function handleTouchCancel(event) {
	// Reset touch state
	touchState.active = false;
	
	// Update mouse state for compatibility
	mouseState.buttons = 0;
	
	// Trigger callbacks
	triggerCallbacks('touchcancel', {
		x: touchState.currentX,
		y: touchState.currentY
	});
}

/**
 * Handle window blur event
 */
function handleWindowBlur() {
	// Reset all keys when window loses focus
	keyState = {};
	mouseState.buttons = 0;
	touchState.active = false;
	
	// Trigger callbacks
	triggerCallbacks('blur');
}

/**
 * Trigger callbacks for an action
 * @param {string} action - Action name
 * @param {Object} data - Event data
 */
function triggerCallbacks(action, data = {}) {
	if (!callbacks[action]) {
		return;
	}
	
	// Call all callbacks for this action
	for (const callback of callbacks[action]) {
		try {
			callback(data);
		} catch (error) {
			console.error(`Error in callback for action ${action}:`, error);
		}
	}
} 