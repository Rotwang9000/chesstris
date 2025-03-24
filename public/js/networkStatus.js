/**
 * Network Status Management
 * Handles network connection status, disconnection UI, and reconnection attempts
 */

// Network status states
const NetworkStatus = {
	CONNECTED: 'connected',
	DISCONNECTED: 'disconnected',
	CONNECTING: 'connecting',
	ERROR: 'error'
};

// Default settings
const DEFAULT_SETTINGS = {
	initialRetryDelay: 1000,    // Start with 1 second retry
	maxRetryDelay: 30000,       // Max 30 second retry interval
	retryBackoffFactor: 1.5,    // Increase delay by 50% each attempt
	maxRetryAttempts: 10,       // Maximum number of retry attempts
	reconnectAutomatically: true // Try to reconnect automatically
};

let currentStatus = NetworkStatus.DISCONNECTED;
let statusListeners = [];
let retryAttempts = 0;
let retryDelay = DEFAULT_SETTINGS.initialRetryDelay;
let retryTimer = null;
let reconnectOverlay = null;
let reconnectCountdown = null;
let countdownInterval = null;
let settings = { ...DEFAULT_SETTINGS };

/**
 * Initialize the network status manager
 * @param {Object} options - Custom options
 */
function init(options = {}) {
	// Merge custom options with defaults
	settings = { ...DEFAULT_SETTINGS, ...options };
	
	// Create the overlay element if it doesn't exist
	createReconnectOverlay();
	
	// Set up network connectivity listeners
	window.addEventListener('online', handleOnline);
	window.addEventListener('offline', handleOffline);
}

/**
 * Create the reconnect overlay element
 */
function createReconnectOverlay() {
	// Don't create if it already exists
	if (reconnectOverlay) return;
	
	// Create overlay container
	reconnectOverlay = document.createElement('div');
	reconnectOverlay.id = 'reconnect-overlay';
	reconnectOverlay.style.position = 'fixed';
	reconnectOverlay.style.top = '0';
	reconnectOverlay.style.left = '0';
	reconnectOverlay.style.width = '100%';
	reconnectOverlay.style.height = '100%';
	reconnectOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
	reconnectOverlay.style.display = 'none';
	reconnectOverlay.style.flexDirection = 'column';
	reconnectOverlay.style.justifyContent = 'center';
	reconnectOverlay.style.alignItems = 'center';
	reconnectOverlay.style.zIndex = '1000';
	reconnectOverlay.style.color = 'white';
	reconnectOverlay.style.fontFamily = 'Arial, sans-serif';
	
	// Create message element
	const message = document.createElement('div');
	message.textContent = 'Connection lost';
	message.style.fontSize = '24px';
	message.style.marginBottom = '20px';
	
	// Create countdown element
	reconnectCountdown = document.createElement('div');
	reconnectCountdown.textContent = 'Reconnecting in...';
	reconnectCountdown.style.fontSize = '18px';
	reconnectCountdown.style.marginBottom = '30px';
	
	// Create button container
	const buttonContainer = document.createElement('div');
	
	// Create reconnect button
	const reconnectButton = document.createElement('button');
	reconnectButton.textContent = 'Reconnect Now';
	reconnectButton.style.padding = '10px 20px';
	reconnectButton.style.fontSize = '16px';
	reconnectButton.style.backgroundColor = '#4CAF50';
	reconnectButton.style.color = 'white';
	reconnectButton.style.border = 'none';
	reconnectButton.style.borderRadius = '4px';
	reconnectButton.style.marginRight = '10px';
	reconnectButton.style.cursor = 'pointer';
	reconnectButton.onclick = attemptReconnectNow;
	
	// Add elements to the overlay
	buttonContainer.appendChild(reconnectButton);
	reconnectOverlay.appendChild(message);
	reconnectOverlay.appendChild(reconnectCountdown);
	reconnectOverlay.appendChild(buttonContainer);
	
	// Add the overlay to the body
	document.body.appendChild(reconnectOverlay);
}

/**
 * Handle browser online event
 */
function handleOnline() {
	console.log('Browser reports online status');
	attemptReconnect();
}

/**
 * Handle browser offline event
 */
function handleOffline() {
	console.log('Browser reports offline status');
	handleDisconnection();
}

/**
 * Set the current network status
 * @param {string} status - The new status
 */
function setStatus(status) {
	if (currentStatus === status) return;
	
	const prevStatus = currentStatus;
	currentStatus = status;
	
	// Handle status change
	if (status === NetworkStatus.DISCONNECTED) {
		handleDisconnection();
	} else if (status === NetworkStatus.CONNECTED && prevStatus !== NetworkStatus.CONNECTED) {
		handleConnection();
	}
	
	// Notify all listeners
	statusListeners.forEach(listener => listener(status, prevStatus));
}

/**
 * Add a status change listener
 * @param {Function} listener - Function to call on status change
 */
function addStatusListener(listener) {
	if (typeof listener === 'function' && !statusListeners.includes(listener)) {
		statusListeners.push(listener);
	}
}

/**
 * Remove a status change listener
 * @param {Function} listener - The listener to remove
 */
function removeStatusListener(listener) {
	const index = statusListeners.indexOf(listener);
	if (index !== -1) {
		statusListeners.splice(index, 1);
	}
}

/**
 * Handle disconnection
 */
function handleDisconnection() {
	// Show the reconnect overlay
	showReconnectOverlay();
	
	if (settings.reconnectAutomatically) {
		// Start the reconnect timer
		scheduleReconnect();
	}
}

/**
 * Handle successful connection
 */
function handleConnection() {
	// Hide the reconnect overlay
	hideReconnectOverlay();
	
	// Reset retry counters
	resetRetryCounters();
	
	// Clear any pending timers
	clearRetryTimer();
}

/**
 * Show the reconnect overlay
 */
function showReconnectOverlay() {
	if (reconnectOverlay) {
		reconnectOverlay.style.display = 'flex';
	}
}

/**
 * Hide the reconnect overlay
 */
function hideReconnectOverlay() {
	if (reconnectOverlay) {
		reconnectOverlay.style.display = 'none';
	}
}

/**
 * Schedule a reconnect attempt
 */
function scheduleReconnect() {
	// Clear any existing timer
	clearRetryTimer();
	
	// Don't retry if we've reached the maximum attempts
	if (retryAttempts >= settings.maxRetryAttempts) {
		setStatus(NetworkStatus.ERROR);
		reconnectCountdown.textContent = 'Maximum reconnection attempts reached. Please refresh the page.';
		return;
	}
	
	// Calculate next retry delay with exponential backoff
	retryDelay = Math.min(
		retryDelay * settings.retryBackoffFactor,
		settings.maxRetryDelay
	);
	
	// Set the countdown timer
	updateCountdown(Math.ceil(retryDelay / 1000));
	
	// Schedule the next retry
	retryTimer = setTimeout(() => {
		attemptReconnect();
	}, retryDelay);
}

/**
 * Update the countdown timer display
 * @param {number} seconds - Seconds remaining
 */
function updateCountdown(seconds) {
	// Clear any existing interval
	if (countdownInterval) {
		clearInterval(countdownInterval);
	}
	
	// Update the display immediately
	if (reconnectCountdown) {
		reconnectCountdown.textContent = `Reconnecting in ${seconds} seconds...`;
	}
	
	// Set up interval to count down
	countdownInterval = setInterval(() => {
		seconds--;
		
		if (reconnectCountdown) {
			reconnectCountdown.textContent = `Reconnecting in ${seconds} seconds...`;
		}
		
		if (seconds <= 0) {
			clearInterval(countdownInterval);
			countdownInterval = null;
		}
	}, 1000);
}

/**
 * Attempt to reconnect immediately
 */
function attemptReconnectNow() {
	// Clear the retry timer
	clearRetryTimer();
	
	// Clear the countdown
	if (countdownInterval) {
		clearInterval(countdownInterval);
		countdownInterval = null;
	}
	
	// Attempt to reconnect
	attemptReconnect();
}

/**
 * Attempt to reconnect to the server
 */
function attemptReconnect() {
	// Increment retry counter
	retryAttempts++;
	
	setStatus(NetworkStatus.CONNECTING);
	
	// Show connecting message
	if (reconnectCountdown) {
		reconnectCountdown.textContent = 'Attempting to reconnect...';
	}
	
	// Call the NetworkManager's reconnect function if available
	if (window.NetworkManager && typeof window.NetworkManager.reconnect === 'function') {
		window.NetworkManager.reconnect()
			.then(() => {
				// Connection successful
				setStatus(NetworkStatus.CONNECTED);
			})
			.catch(error => {
				console.error('Reconnection attempt failed:', error);
				setStatus(NetworkStatus.DISCONNECTED);
				
				// Schedule next reconnect attempt
				scheduleReconnect();
			});
	} else {
		// If NetworkManager is not available, try reloading the page
		// This is a fallback that should rarely be needed
		console.warn('NetworkManager not available, attempting page refresh');
		window.location.reload();
	}
}

/**
 * Clear the retry timer
 */
function clearRetryTimer() {
	if (retryTimer) {
		clearTimeout(retryTimer);
		retryTimer = null;
	}
}

/**
 * Reset the retry counters
 */
function resetRetryCounters() {
	retryAttempts = 0;
	retryDelay = settings.initialRetryDelay;
}

/**
 * Get the current network status
 * @returns {string} Current network status
 */
function getStatus() {
	return currentStatus;
}

// Export the functions and constants
window.NetworkStatusManager = {
	init,
	setStatus,
	getStatus,
	addStatusListener,
	removeStatusListener,
	attemptReconnectNow,
	NetworkStatus
}; 