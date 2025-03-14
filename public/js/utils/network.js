/**
 * Network
 * 
 * Handles network communication with the server.
 */

import { API_ENDPOINTS, SOCKET_EVENTS } from '../core/constants.js';
import * as SessionManager from './sessionManager.js';
import { throttle } from './helpers.js';

// Socket.io instance
let socket = null;

// Connection state
let isConnected = false;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

// Current game ID
let currentGameId = null;

// Event listeners
const eventListeners = {};

/**
 * Initialize the socket connection
 * @returns {Promise<boolean>} Whether connection was successful
 */
export function init() {
	return new Promise((resolve, reject) => {
		try {
			console.log('Initializing network connection...');
			
			// Check if socket.io is available
			if (typeof io === 'undefined') {
				console.error('Socket.io not found. Make sure it is included in your HTML.');
				createMockSocket();
				resolve(false);
				return;
			}
			
			// Create socket connection
			socket = io({
				reconnection: true,
				reconnectionAttempts: maxReconnectAttempts,
				reconnectionDelay: 1000,
				reconnectionDelayMax: 5000,
				timeout: 10000
			});
			
			// Set up event handlers
			socket.on('connect', () => {
				console.log('Connected to server');
				isConnected = true;
				reconnectAttempts = 0;
				
				// Trigger connect event listeners
				triggerEventListeners(SOCKET_EVENTS.CONNECT);
				
				resolve(true);
			});
			
			socket.on('disconnect', () => {
				console.log('Disconnected from server');
				isConnected = false;
				
				// Trigger disconnect event listeners
				triggerEventListeners(SOCKET_EVENTS.DISCONNECT);
			});
			
			socket.on('connect_error', (error) => {
				console.error('Connection error:', error);
				reconnectAttempts++;
				
				if (reconnectAttempts >= maxReconnectAttempts) {
					console.log('Max reconnect attempts reached, falling back to offline mode');
					createMockSocket();
				}
			});
			
			socket.on('error', (error) => {
				console.error('Socket error:', error);
				triggerEventListeners(SOCKET_EVENTS.ERROR, error);
			});
			
			// Set up ping/pong for connection monitoring
			setInterval(() => {
				if (isConnected) {
					const start = Date.now();
					socket.emit(SOCKET_EVENTS.PING, () => {
						const latency = Date.now() - start;
						console.log(`Ping: ${latency}ms`);
					});
				}
			}, 30000);
			
		} catch (error) {
			console.error('Error initializing network:', error);
			createMockSocket();
			resolve(false);
		}
	});
}

/**
 * Create a mock socket for offline mode
 */
function createMockSocket() {
	console.log('Creating mock socket for offline mode');
	
	// Create mock socket object
	socket = {
		id: 'offline-' + Date.now(),
		connected: true,
		disconnected: false,
		
		// Mock emit function
		emit: (event, data, callback) => {
			console.log(`Mock socket emit: ${event}`, data);
			
			// Handle specific events
			switch (event) {
				case SOCKET_EVENTS.JOIN_GAME:
					// Simulate joining a game
					setTimeout(() => {
						triggerEventListeners(SOCKET_EVENTS.GAME_STATE_UPDATE, {
							gameId: data.gameId || 'offline-game',
							players: [
								{
									id: SessionManager.getPlayerId(),
									name: SessionManager.getPlayerName(),
									isActive: true
								}
							],
							board: []
						});
						
						if (callback) callback({ success: true });
					}, 500);
					break;
					
				case SOCKET_EVENTS.PING:
					// Simulate ping response
					if (callback) callback();
					break;
					
				default:
					// For other events, just call the callback if provided
					if (callback) callback({ success: true });
			}
		},
		
		// Mock on function
		on: (event, callback) => {
			console.log(`Mock socket on: ${event}`);
			addEventListenerInternal(event, callback);
		},
		
		// Mock off function
		off: (event, callback) => {
			console.log(`Mock socket off: ${event}`);
			removeEventListenerInternal(event, callback);
		}
	};
	
	// Set connected state
	isConnected = true;
	
	// Trigger connect event
	setTimeout(() => {
		triggerEventListeners(SOCKET_EVENTS.CONNECT);
	}, 100);
}

/**
 * Check if connected to the server
 * @returns {boolean} Whether connected
 */
export function isSocketConnected() {
	return isConnected && socket && (socket.connected || socket.id);
}

/**
 * Get the socket ID
 * @returns {string|null} Socket ID or null if not connected
 */
export function getSocketId() {
	return isSocketConnected() ? socket.id : null;
}

/**
 * Send an event to the server
 * @param {string} event - Event name
 * @param {*} data - Event data
 * @returns {Promise<*>} Server response
 */
export function emit(event, data) {
	return new Promise((resolve, reject) => {
		try {
			if (!isSocketConnected()) {
				console.warn(`Cannot emit ${event}: Not connected to server`);
				reject(new Error('Not connected to server'));
				return;
			}
			
			console.log(`Emitting ${event}:`, data);
			
			socket.emit(event, data, (response) => {
				if (response && response.error) {
					console.error(`Error in ${event}:`, response.error);
					reject(new Error(response.error));
				} else {
					resolve(response);
				}
			});
		} catch (error) {
			console.error(`Error emitting ${event}:`, error);
			reject(error);
		}
	});
}

/**
 * Throttled version of emit to prevent flooding the server
 */
export const throttledEmit = throttle(emit, 100);

/**
 * Add an event listener
 * @param {string} event - Event name
 * @param {Function} callback - Event callback
 */
export function on(event, callback) {
	try {
		if (!socket) {
			console.warn(`Cannot add listener for ${event}: Socket not initialized`);
			return;
		}
		
		console.log(`Adding listener for ${event}`);
		
		// Add to internal event listeners
		addEventListenerInternal(event, callback);
		
		// Add to socket
		socket.on(event, callback);
	} catch (error) {
		console.error(`Error adding listener for ${event}:`, error);
	}
}

/**
 * Remove an event listener
 * @param {string} event - Event name
 * @param {Function} callback - Event callback
 */
export function off(event, callback) {
	try {
		if (!socket) {
			console.warn(`Cannot remove listener for ${event}: Socket not initialized`);
			return;
		}
		
		console.log(`Removing listener for ${event}`);
		
		// Remove from internal event listeners
		removeEventListenerInternal(event, callback);
		
		// Remove from socket
		socket.off(event, callback);
	} catch (error) {
		console.error(`Error removing listener for ${event}:`, error);
	}
}

/**
 * Add an event listener to internal registry
 * @param {string} event - Event name
 * @param {Function} callback - Event callback
 */
function addEventListenerInternal(event, callback) {
	if (!eventListeners[event]) {
		eventListeners[event] = [];
	}
	
	eventListeners[event].push(callback);
}

/**
 * Remove an event listener from internal registry
 * @param {string} event - Event name
 * @param {Function} callback - Event callback
 */
function removeEventListenerInternal(event, callback) {
	if (!eventListeners[event]) return;
	
	const index = eventListeners[event].indexOf(callback);
	if (index !== -1) {
		eventListeners[event].splice(index, 1);
	}
}

/**
 * Trigger event listeners
 * @param {string} event - Event name
 * @param {*} data - Event data
 */
function triggerEventListeners(event, data) {
	if (!eventListeners[event]) return;
	
	for (const callback of eventListeners[event]) {
		try {
			callback(data);
		} catch (error) {
			console.error(`Error in ${event} listener:`, error);
		}
	}
}

/**
 * Join a game
 * @param {string} gameId - Game ID (optional, defaults to 'default-game')
 * @returns {Promise<Object>} Game data
 */
export function joinGame(gameId = 'default-game') {
	return new Promise(async (resolve, reject) => {
		try {
			if (!isSocketConnected()) {
				await init();
			}
			
			const playerId = SessionManager.getPlayerId();
			const playerName = SessionManager.getPlayerName();
			
			console.log(`Joining game ${gameId} as ${playerName} (${playerId})`);
			
			const response = await emit(SOCKET_EVENTS.JOIN_GAME, {
				gameId,
				playerId,
				playerName
			});
			
			if (response && response.success) {
				currentGameId = gameId;
				console.log(`Joined game ${gameId}`);
				resolve(response);
			} else {
				console.error(`Failed to join game ${gameId}`);
				reject(new Error('Failed to join game'));
			}
		} catch (error) {
			console.error(`Error joining game ${gameId}:`, error);
			reject(error);
		}
	});
}

/**
 * Leave the current game
 * @returns {Promise<Object>} Response
 */
export function leaveGame() {
	return new Promise(async (resolve, reject) => {
		try {
			if (!currentGameId) {
				console.warn('Not in a game');
				resolve({ success: true });
				return;
			}
			
			if (!isSocketConnected()) {
				console.warn('Not connected to server');
				currentGameId = null;
				resolve({ success: true });
				return;
			}
			
			const playerId = SessionManager.getPlayerId();
			
			console.log(`Leaving game ${currentGameId}`);
			
			const response = await emit(SOCKET_EVENTS.LEAVE_GAME, {
				gameId: currentGameId,
				playerId
			});
			
			currentGameId = null;
			
			resolve(response);
		} catch (error) {
			console.error(`Error leaving game:`, error);
			currentGameId = null;
			reject(error);
		}
	});
}

/**
 * Send a player move
 * @param {Object} moveData - Move data
 * @returns {Promise<Object>} Response
 */
export function sendPlayerMove(moveData) {
	return emit(SOCKET_EVENTS.PLAYER_MOVE, {
		...moveData,
		gameId: currentGameId,
		playerId: SessionManager.getPlayerId()
	});
}

/**
 * Send a tetromino placement
 * @param {Object} tetrominoData - Tetromino data
 * @returns {Promise<Object>} Response
 */
export function placeTetromino(tetrominoData) {
	return emit(SOCKET_EVENTS.PLACE_TETROMINO, {
		...tetrominoData,
		gameId: currentGameId,
		playerId: SessionManager.getPlayerId()
	});
}

/**
 * Send a chess piece move
 * @param {Object} moveData - Move data
 * @returns {Promise<Object>} Response
 */
export function moveChessPiece(moveData) {
	return emit(SOCKET_EVENTS.MOVE_CHESS_PIECE, {
		...moveData,
		gameId: currentGameId,
		playerId: SessionManager.getPlayerId()
	});
}

/**
 * Send a chat message
 * @param {string} message - Message text
 * @returns {Promise<Object>} Response
 */
export function sendChatMessage(message) {
	return emit(SOCKET_EVENTS.CHAT_MESSAGE, {
		gameId: currentGameId,
		playerId: SessionManager.getPlayerId(),
		playerName: SessionManager.getPlayerName(),
		message,
		timestamp: Date.now()
	});
}

/**
 * Disconnect from the server
 */
export function disconnect() {
	try {
		if (socket) {
			console.log('Disconnecting from server');
			socket.disconnect();
		}
		
		isConnected = false;
		socket = null;
		currentGameId = null;
	} catch (error) {
		console.error('Error disconnecting from server:', error);
	}
}

/**
 * Reset the network module
 */
export function reset() {
	disconnect();
	eventListeners = {};
	reconnectAttempts = 0;
}
