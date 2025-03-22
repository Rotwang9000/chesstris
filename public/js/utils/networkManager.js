/**
 * NetworkManager - Handles communication with the Shaktris backend server
 * This module provides utilities for API calls and Socket.IO connections
 */

// Configuration
const API_BASE_URL = '/api'; // Default to same-origin API
const SOCKET_URL = ''; // Empty string means connect to the same server

// State
let socket = null;
let gameId = null;
let playerId = null;
let playerName = null;
let connectionStatus = 'disconnected';
let messageHandlers = {};
let reconnectAttempts = 0;
let maxReconnectAttempts = 5;
let isInitializing = false;
let hasJoinedGame = false;
let lastConnectionAttempt = 0;
let connectionThrottleMs = 2000; // Prevent connection attempts more frequently than 2 seconds

// Add event listeners support
const eventListeners = {
	connect: [],
	disconnect: [],
	error: [],
	message: {}
};

/**
 * Initialize network connection
 * @param {string} playerName - Player name
 * @returns {Promise} - Resolves when connection is established
 */
export function initialize(playerName) {
	// Prevent multiple simultaneous initialization attempts
	if (isInitializing) {
		console.log('NetworkManager: Already initializing, ignoring duplicate call');
		return Promise.resolve({ playerId, status: connectionStatus });
	}
	
	// Check if we already have a connection with a player ID
	if (socket && socket.connected && playerId) {
		console.log('NetworkManager: Already initialized and connected');
		return Promise.resolve({ playerId, status: 'connected' });
	}
	
	// Throttle connection attempts
	const now = Date.now();
	if (now - lastConnectionAttempt < connectionThrottleMs) {
		console.log('NetworkManager: Connection attempt throttled');
		return Promise.reject(new Error('Connection attempt throttled'));
	}
	
	lastConnectionAttempt = now;
	isInitializing = true;
	console.log('NetworkManager: Initializing connection...');
	
	return new Promise((resolve, reject) => {
		// First connect to Socket.IO
		connectSocketIO()
			.then(() => {
				// Now register the player
				return registerPlayer(playerName);
			})
			.then(playerData => {
				playerId = playerData.playerId;
				isInitializing = false;
				resolve({ playerId, status: 'connected' });
			})
			.catch(error => {
				console.error('Failed to initialize network:', error);
				isInitializing = false;
				reject(error);
			});
	});
}

/**
 * Connect to Socket.IO server
 * @returns {Promise} - Resolves when connected
 */
function connectSocketIO() {
	// If already connected, return immediately
	if (socket && socket.connected) {
		console.log('NetworkManager: Already connected to Socket.IO');
		connectionStatus = 'connected';
		return Promise.resolve();
	}
	
	// Create socket connection if needed
	if (!socket) {
		console.log('NetworkManager: Creating new socket.io connection');
		socket = io(SOCKET_URL, { 
			reconnection: true, 
			reconnectionDelay: 1000,
			reconnectionDelayMax: 5000,
			reconnectionAttempts: 10,
			// Prevent auto reconnect attempts
			reconnect: false
		});
		
		// Set up connection events
		socket.on('connect', () => {
			console.log('NetworkManager: Socket connected');
			connectionStatus = 'connected';
			reconnectAttempts = 0;
			
			// Emit event to listeners
			emitEvent('connect', { connected: true });
		});
		
		socket.on('disconnect', () => {
			console.log('NetworkManager: Socket disconnected');
			connectionStatus = 'disconnected';
			
			// Emit event to listeners
			emitEvent('disconnect', { connected: false });
		});
		
		socket.on('connect_error', (error) => {
			console.error('NetworkManager: Socket connection error:', error);
			connectionStatus = 'error';
			reconnectAttempts++;
			
			// Emit event to listeners
			emitEvent('error', { error });
			
			if (reconnectAttempts >= maxReconnectAttempts) {
				console.error(`NetworkManager: Max reconnect attempts (${maxReconnectAttempts}) reached.`);
				socket.disconnect();
			}
		});
		
		// Set up message handler for all server messages
		socket.on('message', (data) => {
			console.log('NetworkManager: Received message:', data);
			
			// Emit message to registered handlers
			if (data && data.type) {
				emitMessage(data.type, data.payload || {});
			}
		});
	}
	
	return new Promise((resolve, reject) => {
		if (socket.connected) {
			console.log('NetworkManager: Already connected, resolving immediately');
			connectionStatus = 'connected';
			resolve();
		} else {
			console.log('NetworkManager: Waiting for connection...');
			
			// Set up one-time handler for successful connection
			const connectHandler = () => {
				console.log('NetworkManager: Connection established');
				connectionStatus = 'connected';
				socket.off('connect', connectHandler);
				socket.off('connect_error', errorHandler);
				resolve();
			};
			
			// Set up one-time handler for connection error
			const errorHandler = (error) => {
				console.error('NetworkManager: Connection failed:', error);
				connectionStatus = 'error';
				socket.off('connect', connectHandler);
				socket.off('connect_error', errorHandler);
				reject(new Error('Failed to connect to server'));
			};
			
			// Register handlers
			socket.once('connect', connectHandler);
			socket.once('connect_error', errorHandler);
			
			// If already connecting, just wait for the events
			if (socket.connecting) {
				console.log('NetworkManager: Socket is already connecting, waiting...');
				return;
			}
			
			// Otherwise, connect explicitly
			socket.connect();
		}
	});
}

/**
 * Register a player with the server
 * @param {string} playerName - The player's name
 * @returns {Promise} - Resolves with player data
 */
async function registerPlayer(playerName) {
	try {
		// Instead of using the REST API, use Socket.IO
		// First, ensure socket is connected
		if (!socket) {
			// Initialize Socket.IO first
			connectSocketIO();
			
			// Wait a bit for the connection to establish
			await new Promise(resolve => setTimeout(resolve, 500));
		}
		
		// Check if socket is now available and connected
		if (!socket) {
			throw new Error("Failed to initialize Socket.IO connection");
		}
		
		// Since we don't have a dedicated registration endpoint, we'll use the socket ID
		// as the player ID and handle registration during the join_game event
		console.log('NetworkManager: Using socket ID as player ID:', socket.id);
		const mockPlayerId = socket.id || 'player_' + Math.floor(Math.random() * 10000);
		
		// Create player data object
		const playerData = {
			playerId: mockPlayerId,
			name: playerName
		};
		
		console.log('NetworkManager: Player registered with socket ID:', playerData);
		return playerData;
	} catch (error) {
		console.error('NetworkManager: Failed to register player:', error);
		
		// TEMP: For development, create mock player data
		const mockPlayerId = 'player_' + Math.floor(Math.random() * 10000);
		console.warn('NetworkManager: Using mock player ID for development:', mockPlayerId);
		return { playerId: mockPlayerId, name: playerName };
	}
}

/**
 * Handle Socket.IO connect event
 */
function handleSocketConnect() {
	console.log('NetworkManager: Socket.IO connected');
	connectionStatus = 'connected';
	reconnectAttempts = 0;
	
	// Send authentication message
	if (playerId) {
		socket.emit('auth', { playerId });
	}
	
	// Trigger connect event
	triggerEvent('connect', { status: 'connected' });
}

/**
 * Handle Socket.IO disconnect event
 * @param {string} reason - Disconnect reason
 */
function handleSocketDisconnect(reason) {
	console.log(`NetworkManager: Socket.IO disconnected: ${reason}`);
	connectionStatus = 'disconnected';
	
	// Socket.IO handles reconnection automatically
	
	triggerEvent('disconnect', { reason });
}

/**
 * Handle Socket.IO error
 * @param {Error} error - Error object
 */
function handleSocketError(error) {
	console.error('NetworkManager: Socket.IO error:', error);
	connectionStatus = 'failed';
	triggerEvent('error', error);
}

/**
 * Handle Socket.IO messages
 * @param {Object} message - Message object
 */
function handleSocketMessage(message) {
	try {
		console.log('NetworkManager: Received message:', message);
		
		// Handle message based on type
		if (message.type && messageHandlers[message.type]) {
			messageHandlers[message.type](message);
		} else {
			// Broadcast message to all handlers
			triggerEvent('message', message);
		}
	} catch (error) {
		console.error('NetworkManager: Error handling message:', error, message);
	}
}

/**
 * Register message handler
 * @param {string} messageType - The message type to handle
 * @param {Function} handler - The handler function
 */
export function onMessage(messageType, handler) {
	if (!eventListeners.message[messageType]) {
		eventListeners.message[messageType] = [];
	}
	eventListeners.message[messageType].push(handler);
	
	// Also register with Socket.IO for this specific event
	if (socket) {
		socket.on(messageType, (data) => {
			handler({ type: messageType, ...data });
		});
	}
}

/**
 * Register event listener
 * @param {string} eventType - Event type
 * @param {Function} callback - Callback function
 */
export function addEventListener(eventType, callback) {
	if (eventListeners[eventType]) {
		eventListeners[eventType].push(callback);
	} else {
		console.warn(`NetworkManager: Unknown event type: ${eventType}`);
	}
}

/**
 * Remove event listener
 * @param {string} eventType - Event type
 * @param {Function} callback - Callback function
 */
export function removeEventListener(eventType, callback) {
	if (eventListeners[eventType]) {
		eventListeners[eventType] = eventListeners[eventType].filter(c => c !== callback);
	}
}

/**
 * Trigger event
 * @param {string} eventType - Event type
 * @param {Object} data - Event data
 */
function triggerEvent(eventType, data) {
	const event = new CustomEvent(`network:${eventType}`, { detail: data });
	document.dispatchEvent(event);
}

/**
 * Send Socket.IO message
 * @param {string} eventType - Event type to emit
 * @param {Object} data - Data to send
 * @returns {boolean} Whether the message was sent
 */
export function sendMessage(eventType, data) {
	if (!socket || !socket.connected) {
		console.error('NetworkManager: Cannot send message, socket not connected');
		return false;
	}
	
	try {
		socket.emit(eventType, data);
		return true;
	} catch (error) {
		console.error('NetworkManager: Error sending message:', error);
		return false;
	}
}

/**
 * Join or create a game
 * @param {string} gameId - Optional game ID to join (will create if not specified)
 * @param {string} playerName - Optional player name
 * @returns {Promise} - Resolves when joined/created
 */
export function joinGame(gameId = null, playerName = null) {
	console.log(`NetworkManager: Joining game, gameId: ${gameId}`);
	
	// Prevent joining the same game multiple times
	if (hasJoinedGame) {
		console.log('NetworkManager: Already joined a game, ignoring duplicate call');
		return Promise.resolve({
			success: true,
			gameId: getGameId(),
			message: 'Already joined game'
		});
	}
	
	// Make sure we're connected
	if (!socket || !socket.connected) {
		return Promise.reject(new Error('Not connected to server'));
	}
	
	// If no gameId is provided, default to a standard global game
	const finalGameId = gameId || 'global_game';
	console.log(`NetworkManager: Using gameId: ${finalGameId}`);
	
	// Set the gameId immediately to avoid race conditions
	setGameId(finalGameId);
	
	// Send join game request to server
	return new Promise((resolve, reject) => {
		socket.emit('join_game', finalGameId, playerName, (response) => {
			if (response && response.success) {
				console.log('NetworkManager: Joined game successfully:', response);
				
				// Make sure we have a valid gameId (use response gameId if provided, otherwise keep our finalGameId)
				const confirmedGameId = response.gameId || finalGameId;
				setGameId(confirmedGameId);
				hasJoinedGame = true;
				
				resolve({
					success: true,
					gameId: confirmedGameId,
					message: 'Joined game successfully'
				});
			} else {
				console.error('NetworkManager: Failed to join game:', response);
				reject(new Error(response?.error || 'Failed to join game'));
			}
		});
	});
}

/**
 * Set the game ID directly (internal use)
 * @param {string} id - The game ID to set
 */
function setGameId(id) {
	if (!id) {
		console.warn('NetworkManager: Attempted to set empty gameId, defaulting to global_game');
		gameId = 'global_game';
		return;
	}
	
	console.log(`NetworkManager: Setting gameId to ${id}`);
	gameId = id;
}

/**
 * Update the game ID (public API)
 * @param {string} id - The game ID to set
 */
export function updateGameId(id) {
	setGameId(id);
}

/**
 * Submit a tetromino placement
 * @param {Object} tetromino - Tetromino data
 * @returns {Promise} - Resolves with placement result
 */
export async function submitTetrominoPlacement(tetromino) {
	if (!gameId || !playerId) {
		console.error('NetworkManager: Cannot submit tetromino placement, not in a game');
		return Promise.reject(new Error('Not in a game'));
	}
	
	try {
		// Make sure the tetromino data has the format the server expects
		// Server needs 'pieceType' property, but our frontend uses 'type'
		const tetrominoData = {
			...tetromino
		};
		
		// Ensure pieceType is set - it's required by the server
		if (!tetrominoData.pieceType && tetrominoData.type) {
			tetrominoData.pieceType = tetrominoData.type;
		}
		
		console.log('NetworkManager: Sending tetromino data to server:', tetrominoData);
		
		// Use Socket.IO for communication instead of REST API
		return new Promise((resolve, reject) => {
			// Send via Socket.IO
			socket.emit('tetromino_placed', {
				gameId,
				playerId,
				tetromino: tetrominoData
			}, (response) => {
				// This callback will be called when the server responds
				if (response && response.success) {
					console.log('NetworkManager: Tetromino placement successful', response);
					resolve(response);
				} else {
					console.error('NetworkManager: Tetromino placement failed', response);
					reject(new Error(response?.error || 'Failed to place tetromino'));
				}
			});
			
			// If socket.io doesn't respond within 2 seconds, resolve anyway
			// This prevents the game from getting stuck waiting for a response
			setTimeout(() => {
				console.log('NetworkManager: Socket.IO response timeout - assuming success');
				resolve({ success: true, gameState: 'chess' });
			}, 2000);
		});
	} catch (error) {
		console.error('NetworkManager: Failed to submit tetromino placement:', error);
		
		// For development, assume success
		return Promise.resolve({ success: true, gameState: 'chess' });
	}
}

/**
 * Submit a chess move
 * @param {Object} move - Chess move data
 * @returns {Promise} - Resolves with move result
 */
export async function submitChessMove(move) {
	if (!gameId || !playerId) {
		console.error('NetworkManager: Cannot submit chess move, not in a game');
		return false;
	}
	
	try {
		// First try to send via Socket.IO for real-time sync
		sendMessage('chess_move', {
			gameId,
			playerId,
			move
		});
		
		// Then send via API for persistence
		const response = await fetch(`${API_BASE_URL}/games/${gameId}/chess`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Player-ID': playerId
			},
			body: JSON.stringify({ move })
		});
		
		if (!response.ok) {
			throw new Error(`Server returned ${response.status}: ${response.statusText}`);
		}
		
		const data = await response.json();
		console.log('NetworkManager: Chess move submitted:', data);
		return data;
	} catch (error) {
		console.error('NetworkManager: Failed to submit chess move:', error);
		
		// For development, assume success
		return { success: true, gameState: 'tetris' };
	}
}

/**
 * Get current connection status
 * @returns {string} - Connection status
 */
export function getStatus() {
	return connectionStatus;
}

/**
 * Check if socket is connected
 * @returns {boolean} - Whether socket is connected
 */
export function isConnected() {
	// Check if socket exists
	if (!socket) {
		console.warn('NetworkManager: Socket not initialized - attempting to initialize');
		connectSocketIO();
		// Return false for now, the connection will be established asynchronously
		return false;
	}

	// Check connection status - if not connected, try to reconnect
	if (!socket.connected) {
		console.warn('NetworkManager: Socket exists but not connected - attempting to reconnect');
		socket.connect();
	}
	
	// Return current connection status (may be false even after reconnect attempt)
	// This is fine as subsequent calls will try again
	return socket.connected;
}

/**
 * Get current player ID
 * @returns {string} - Player ID
 */
export function getPlayerId() {
	return playerId;
}

/**
 * Get current game ID
 * @returns {string} - Game ID
 */
export function getGameId() {
	return gameId;
}

/**
 * Request the player list from server
 * @returns {Promise} - Resolves with player list or rejects with error
 */
export function requestPlayerList() {
	return sendMessage('get_player_list', {
		gameId: getGameId()
	});
}

/**
 * Get current game state
 * @param {object} options - Options for the request
 * @returns {Promise} - Resolves with game state
 */
export function getGameState(options = {}) {
	console.log('NetworkManager: Requesting game state');
	
	// Make sure we're connected
	if (!socket || !socket.connected) {
		return Promise.reject(new Error('Not connected to server'));
	}
	
	// Use current gameId if not specified
	const requestGameId = options.gameId || gameId;
	
	// Always ensure gameId is a string
	const serializedGameId = typeof requestGameId === 'object' ? 
		JSON.stringify(requestGameId) : String(requestGameId || 'global_game');
	
	// Log the exact format being sent
	console.log(`NetworkManager: Requesting game state for game ID: ${serializedGameId} (type: ${typeof serializedGameId})`);
	
	// Send message to server
	return new Promise((resolve, reject) => {
		sendMessage('get_game_state', {
			gameId: serializedGameId
		}, (response) => {
			if (response) {
				resolve(response);
			} else {
				reject(new Error('Failed to get game state'));
			}
		});
	});
}

// For development: Auto-initialize with a mock player when in development mode
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
	// Check if io is available (Socket.IO loaded)
	if (typeof io === 'undefined') {
		console.warn('NetworkManager: Socket.IO not available. Auto-initialization disabled.');
	} else {
		// setTimeout to let other scripts load first
		setTimeout(() => {
			const mockPlayerName = 'DevPlayer_' + Math.floor(Math.random() * 1000);
			initialize(mockPlayerName)
				.then(() => {
					console.log('NetworkManager: Auto-initialized in development mode');
					return joinGame();
				})
				.then(gameData => {
					console.log('NetworkManager: Auto-joined game in development mode:', gameData);
				})
				.catch(error => {
					console.warn('NetworkManager: Auto-initialization failed:', error);
				});
		}, 1000);
	}
}

/**
 * Emit an event to all registered listeners
 * @param {string} event - Event name
 * @param {any} data - Event data
 */
function emitEvent(event, data) {
	if (eventListeners[event]) {
		for (const callback of eventListeners[event]) {
			try {
				callback(data);
			} catch (error) {
				console.error(`NetworkManager: Error in ${event} event listener:`, error);
			}
		}
	}
}

/**
 * Emit a message event to registered listeners
 * @param {string} messageType - Message type
 * @param {any} data - Message data
 */
function emitMessage(messageType, data) {
	if (eventListeners.message[messageType]) {
		for (const callback of eventListeners.message[messageType]) {
			try {
				callback(data);
			} catch (error) {
				console.error(`NetworkManager: Error in ${messageType} message listener:`, error);
			}
		}
	}
} 