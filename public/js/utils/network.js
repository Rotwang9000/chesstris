/**
 * Network Utility Module
 * 
 * Handles communication with the server via Socket.IO
 */

// Socket.IO client
let socket = null;
let _isConnected = false;
let connectionCallbacks = [];
let disconnectionCallbacks = [];
let messageHandlers = {};
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
let players = []; // Store list of players

/**
 * Initialize the network module
 * @param {Object} options - Network options
 * @returns {Promise<boolean>} - True if connected successfully
 */
export async function init(options = {}) {
	try {
		// Default options
		const defaultOptions = {
			autoConnect: false,
			reconnect: true,
			reconnectDelay: 3000,
			url: window.location.origin
		};
		
		// Merge options
		const config = { ...defaultOptions, ...options };
		
		// Load Socket.IO client if not already loaded
		if (typeof io === 'undefined') {
			console.log('Loading Socket.IO client...');
			await loadSocketIO();
		}
		
		// Create socket instance
		socket = io(config.url, {
			autoConnect: false,
			reconnection: config.reconnect,
			reconnectionDelay: config.reconnectDelay,
			reconnectionAttempts: MAX_RECONNECT_ATTEMPTS
		});
		
		// Set up event listeners
		setupEventListeners();
		
		// Register callback handlers
		if (options.onConnect && typeof options.onConnect === 'function') {
			connectionCallbacks.push(options.onConnect);
		}
		
		if (options.onDisconnect && typeof options.onDisconnect === 'function') {
			disconnectionCallbacks.push(options.onDisconnect);
		}
		
		if (options.onError && typeof options.onError === 'function') {
			on('error', options.onError);
		}
		
		// Auto-connect if specified
		if (config.autoConnect) {
			connect();
		}
		
		return true;
	} catch (error) {
		console.error('Error initializing network module:', error);
		return false;
	}
}

/**
 * Load Socket.IO client dynamically
 * @returns {Promise<void>}
 */
function loadSocketIO() {
	return new Promise((resolve, reject) => {
		if (typeof io !== 'undefined') {
			resolve();
			return;
		}
		
		const script = document.createElement('script');
		script.src = '/socket.io/socket.io.js';
		script.async = true;
		script.onload = () => resolve();
		script.onerror = () => reject(new Error('Failed to load Socket.IO client'));
		document.head.appendChild(script);
	});
}

/**
 * Set up socket event listeners
 */
function setupEventListeners() {
	if (!socket) {
		return;
	}
	
	// Connection events
	socket.on('connect', handleConnect);
	socket.on('disconnect', handleDisconnect);
	socket.on('connect_error', handleError);
	socket.on('error', handleError);
	
	// Game events
	socket.on('player_id', (id) => {
		console.log(`Received player ID: ${id}`);
	});
	
	// Player events
	socket.on('player_joined', (data) => {
		// Add player to list
		if (data.players) {
			players = data.players;
		} else if (data.playerId) {
			// Add single player
			const playerExists = players.some(p => p.id === data.playerId);
			if (!playerExists) {
				players.push({
					id: data.playerId,
					name: data.playerName || `Player_${data.playerId.substring(0, 5)}`
				});
			}
		}
		
		// Trigger handlers
		triggerHandlers('player_joined', data);
	});
	
	socket.on('player_left', (data) => {
		// Remove player from list
		if (data.playerId) {
			players = players.filter(p => p.id !== data.playerId);
		}
		
		// Trigger handlers
		triggerHandlers('player_left', data);
	});
	
	// Register existing message handlers
	for (const [event, handlers] of Object.entries(messageHandlers)) {
		for (const handler of handlers) {
			socket.on(event, handler);
		}
	}
}

/**
 * Connect to the server
 * @returns {boolean} - True if connection attempt started
 */
export function connect() {
	if (!socket) {
		console.error('Socket not initialized. Call init() first.');
		// Auto-initialize with default settings
		init().then(() => {
			if (socket) {
				console.log('Auto-initialized socket, connecting...');
				socket.connect();
			}
		}).catch(error => {
			console.error('Failed to auto-initialize socket:', error);
		});
		return false;
	}
	
	if (_isConnected) {
		console.log('Already connected to server.');
		return true;
	}
	
	console.log('Connecting to server...');
	socket.connect();
	return true;
}

/**
 * Disconnect from the server
 */
export function disconnect() {
	if (!socket || !_isConnected) {
		return;
	}
	
	console.log('Disconnecting from server...');
	socket.disconnect();
}

/**
 * Send a message to the server
 * @param {string} event - Event name
 * @param {*} data - Data to send
 * @returns {boolean} - True if message was sent
 */
export function send(event, data = null) {
	if (!socket || !_isConnected) {
		console.error('Cannot send message: Not connected to server');
		return false;
	}
	
	socket.emit(event, data);
	return true;
}

/**
 * Register a callback for when a connection is established
 * @param {Function} callback - Callback function
 */
export function onConnect(callback) {
	if (typeof callback === 'function') {
		connectionCallbacks.push(callback);
		
		// If already connected, call the callback immediately
		if (_isConnected && socket) {
			callback();
		}
	}
}

/**
 * Register a callback for when a disconnection occurs
 * @param {Function} callback - Callback function
 */
export function onDisconnect(callback) {
	if (typeof callback === 'function') {
		disconnectionCallbacks.push(callback);
	}
}

/**
 * Register a message handler
 * @param {string} event - Event name
 * @param {Function} handler - Handler function
 */
export function on(event, handler) {
	if (typeof handler !== 'function') {
		return;
	}
	
	if (!messageHandlers[event]) {
		messageHandlers[event] = [];
	}
	
	messageHandlers[event].push(handler);
	
	// Register with socket if it exists
	if (socket) {
		socket.on(event, handler);
	}
}

/**
 * Remove a message handler
 * @param {string} event - Event name
 * @param {Function} handler - Handler function to remove
 */
export function off(event, handler) {
	if (!messageHandlers[event]) {
		return;
	}
	
	// If handler is provided, remove specific handler
	if (handler) {
		messageHandlers[event] = messageHandlers[event].filter(h => h !== handler);
		
		// Remove from socket if it exists
		if (socket) {
			socket.off(event, handler);
		}
	} else {
		// Otherwise, remove all handlers for this event
		messageHandlers[event] = [];
		
		// Remove from socket if it exists
		if (socket) {
			socket.off(event);
		}
	}
}

/**
 * Check if connected to the server
 * @returns {boolean} - True if connected
 */
export function isConnected() {
	return _isConnected;
}

/**
 * Get the socket ID
 * @returns {string|null} - Socket ID or null if not connected
 */
export function getSocketId() {
	return socket && _isConnected ? socket.id : null;
}

/**
 * Get the list of players
 * @returns {Array} List of players
 */
export function getPlayers() {
	return [...players];
}

/**
 * Request to spectate a player
 * @param {string} playerId - ID of the player to spectate
 */
export function requestSpectate(playerId) {
	if (!isConnected()) {
		console.error('Cannot request spectate: not connected to server');
		return;
	}
	
	emit('request_spectate', { playerId });
}

/**
 * Stop spectating a player
 */
export function stopSpectating() {
	if (!isConnected()) {
		console.error('Cannot stop spectating: not connected to server');
		return;
	}
	
	emit('stop_spectating');
}

// Event handlers

/**
 * Handle connection event
 */
function handleConnect() {
	console.log('Connected to server');
	_isConnected = true;
	reconnectAttempts = 0;
	
	// Call all connection callbacks
	connectionCallbacks.forEach(callback => {
		try {
			callback();
		} catch (error) {
			console.error('Error in connection callback:', error);
		}
	});
}

/**
 * Handle disconnect event
 * @param {string} reason - Reason for disconnection
 */
function handleDisconnect(reason) {
	console.log(`Disconnected from server: ${reason}`);
	_isConnected = false;
	
	// Call all disconnection callbacks
	disconnectionCallbacks.forEach(callback => {
		try {
			callback(reason);
		} catch (error) {
			console.error('Error in disconnection callback:', error);
		}
	});
}

/**
 * Handle connection error
 * @param {Error} error - Connection error
 */
function handleError(error) {
	console.error('Connection error:', error);
}

/**
 * Handle game update event
 * @param {Object} data - Game update data
 */
function handleGameUpdate(data) {
	triggerHandlers('game:update', data);
}

/**
 * Handle game join event
 * @param {Object} data - Game join data
 */
function handleGameJoin(data) {
	triggerHandlers('game:join', data);
}

/**
 * Handle game leave event
 * @param {Object} data - Game leave data
 */
function handleGameLeave(data) {
	triggerHandlers('game:leave', data);
}

/**
 * Handle game start event
 * @param {Object} data - Game start data
 */
function handleGameStart(data) {
	triggerHandlers('game:start', data);
}

/**
 * Handle game end event
 * @param {Object} data - Game end data
 */
function handleGameEnd(data) {
	triggerHandlers('game:end', data);
}

/**
 * Handle game error event
 * @param {Object} data - Game error data
 */
function handleGameError(data) {
	triggerHandlers('game:error', data);
}

/**
 * Handle player join event
 * @param {Object} data - Player join data
 */
function handlePlayerJoin(data) {
	triggerHandlers('player:join', data);
}

/**
 * Handle player leave event
 * @param {Object} data - Player leave data
 */
function handlePlayerLeave(data) {
	triggerHandlers('player:leave', data);
}

/**
 * Handle player update event
 * @param {Object} data - Player update data
 */
function handlePlayerUpdate(data) {
	triggerHandlers('player:update', data);
}

/**
 * Handle chat message event
 * @param {Object} data - Chat message data
 */
function handleChatMessage(data) {
	triggerHandlers('chat:message', data);
}

/**
 * Trigger all handlers for an event
 * @param {string} event - Event name
 * @param {*} data - Event data
 */
function triggerHandlers(event, data) {
	if (!messageHandlers[event]) {
		return;
	}
	
	messageHandlers[event].forEach(handler => {
		try {
			handler(data);
		} catch (error) {
			console.error(`Error in ${event} handler:`, error);
		}
	});
}

/**
 * Clean up resources
 */
export function cleanup() {
	// Disconnect from server
	if (socket && _isConnected) {
		socket.disconnect();
	}
	
	// Clear all callbacks and handlers
	connectionCallbacks = [];
	disconnectionCallbacks = [];
	messageHandlers = {};
	
	// Reset state
	_isConnected = false;
	reconnectAttempts = 0;
	socket = null;
}
