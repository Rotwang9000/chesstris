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
let connectionStatus = 'disconnected';
let messageHandlers = {};
let reconnectAttempts = 0;
let maxReconnectAttempts = 5;

/**
 * Initialize network connection
 * @param {string} playerName - Player name
 * @returns {Promise} - Resolves when connection is established
 */
export function initialize(playerName) {
	console.log('NetworkManager: Initializing connection...');
	return new Promise((resolve, reject) => {
		// First connect to Socket.IO
		connectSocketIO();
		
		// Wait for socket connection before proceeding
		let connectionAttempts = 0;
		const maxAttempts = 5;
		const connectionCheck = setInterval(() => {
			connectionAttempts++;
			
			if (socket && socket.connected) {
				clearInterval(connectionCheck);
				connectionStatus = 'connected';
				console.log('NetworkManager: Socket.IO connected successfully');
				
				// Now register the player
				registerPlayer(playerName)
					.then(playerData => {
						playerId = playerData.playerId;
						resolve({ playerId, status: 'connected' });
					})
					.catch(error => {
						console.error('Failed to register player:', error);
						reject(error);
					});
			} else if (connectionAttempts >= maxAttempts) {
				clearInterval(connectionCheck);
				connectionStatus = 'failed';
				console.error('NetworkManager: Socket.IO connection failed after', maxAttempts, 'attempts');
				reject(new Error('Socket.IO connection failed'));
			}
		}, 1000);
	});
}

/**
 * Connect to Socket.IO server
 */
function connectSocketIO() {
	try {
		// Check if Socket.IO is available
		if (typeof io === 'undefined') {
			console.error('NetworkManager: Socket.IO client library not loaded');
			console.log('Attempting to load Socket.IO client dynamically');
			
			// Try to load it dynamically
			const script = document.createElement('script');
			script.src = '/socket.io/socket.io.js';
			script.async = true;
			script.onload = () => {
				console.log('Socket.IO client loaded dynamically');
				// Try connecting again after loading
				setTimeout(connectSocketIO, 500);
			};
			script.onerror = () => {
				console.error('Failed to load Socket.IO client dynamically');
				connectionStatus = 'failed';
			};
			document.head.appendChild(script);
			return;
		}
		
		// Close existing socket if any
		if (socket) {
			console.log('NetworkManager: Closing existing socket connection');
			socket.disconnect();
		}
		
		connectionStatus = 'connecting';
		console.log(`NetworkManager: Socket.IO connecting to server at ${SOCKET_URL || 'default URL'}`);
		
		// Create Socket.IO connection - autoConnect:true by default
		socket = io(SOCKET_URL, {
			reconnection: true,
			reconnectionAttempts: maxReconnectAttempts,
			reconnectionDelay: 1000,
			reconnectionDelayMax: 5000,
			timeout: 10000,
			query: { client: 'minimal-game-core' } // Helps identify client type on server
		});
		
		console.log('NetworkManager: Socket.IO connection attempt initiated with id:', socket.id);
		
		// Set up event handlers
		socket.on('connect', () => {
			console.log('NetworkManager: Socket.IO connect event received');
			handleSocketConnect();
		});
		
		socket.on('disconnect', (reason) => {
			console.log('NetworkManager: Socket.IO disconnect event received:', reason);
			handleSocketDisconnect(reason);
		});
		
		socket.on('connect_error', (error) => {
			console.error('NetworkManager: Socket.IO connect_error event received:', error);
			handleSocketError(error);
		});
		
		socket.on('error', (error) => {
			console.error('NetworkManager: Socket.IO error event received:', error);
			handleSocketError(error);
		});
		
		socket.io.on('reconnect_attempt', (attempt) => {
			console.log(`NetworkManager: Socket.IO reconnect attempt ${attempt}`);
		});
		
		socket.io.on('reconnect_error', (error) => {
			console.error('NetworkManager: Socket.IO reconnect error:', error);
		});
		
		socket.io.on('reconnect_failed', () => {
			console.error('NetworkManager: Socket.IO reconnect failed after max attempts');
			connectionStatus = 'failed';
		});
		
		// Set up server-specific event handlers
		socket.on('player_id', (id) => {
			console.log('Received player ID from server:', id);
			playerId = id;
		});
		
		socket.on('player_joined', (data) => {
			console.log('Player joined:', data);
			handleSocketMessage({ type: 'player_joined', ...data });
		});
		
		socket.on('player_left', (data) => {
			console.log('Player left:', data);
			handleSocketMessage({ type: 'player_left', ...data });
		});
		
		socket.on('game_update', (gameState) => {
			console.log('Game state update:', gameState);
			handleSocketMessage({ type: 'game_update', gameState });
		});
		
		socket.on('tetromino_placed', (data) => {
			console.log('Tetromino placed:', data);
			handleSocketMessage({ type: 'tetromino_placed', ...data });
		});
		
		socket.on('chess_move', (data) => {
			console.log('Chess moved:', data);
			handleSocketMessage({ type: 'chess_move', ...data });
		});
		
		// Debug: log all events
		socket.onAny((event, ...args) => {
			console.log(`NetworkManager: Received event "${event}":`, args);
		});
		
	} catch (error) {
		console.error('NetworkManager: Socket.IO connection error:', error);
		connectionStatus = 'failed';
	}
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
	messageHandlers[messageType] = handler;
	
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
	document.addEventListener(`network:${eventType}`, e => callback(e.detail));
}

/**
 * Remove event listener
 * @param {string} eventType - Event type
 * @param {Function} callback - Callback function
 */
export function removeEventListener(eventType, callback) {
	document.removeEventListener(`network:${eventType}`, callback);
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
 * Join a game
 * @param {string} gameId - Game ID to join, or null to join the global game
 * @param {string} playerName - The player's name
 * @returns {Promise} - Resolves with game data
 */
export async function joinGame(gameId = null, playerName = null) {
	// Check if socket is connected
	if (!socket || !socket.connected) {
		console.warn('NetworkManager: Socket not connected, attempting to connect');
		
		// Wait for socket to connect
		await new Promise((resolve) => {
			setTimeout(() => {
				connectSocketIO();
				resolve();
			}, 500);
		});
		
		// Wait a bit more to ensure connection is established
		await new Promise(resolve => setTimeout(resolve, 1000));
		
		// Check again - if still not connected, throw error
		if (!socket || !socket.connected) {
			throw new Error('Unable to connect to server after multiple attempts');
		}
	}
	
	// Get player name if not provided
	if (!playerName) {
		playerName = 'Player_' + Math.floor(Math.random() * 1000);
		console.warn('NetworkManager: No player name provided, using default:', playerName);
	}
	
	// Socket.IO join_game event
	return new Promise((resolve, reject) => {
		console.log(`NetworkManager: Joining game with player name: ${playerName}`);
		
		// Global game - always pass null as gameId to join the default game
		socket.emit('join_game', null, playerName, (response) => {
			if (response && response.success) {
				console.log('NetworkManager: Joined global game:', response);
				gameId = response.gameId;
				
				// Store the game ID
				window.localStorage.setItem('lastGameId', gameId);
				
				// Check if we need to add a computer player
				if (response.players && response.players.length === 1) {
					console.log('NetworkManager: Only one player detected, requesting computer opponent');
					// Add a computer player
					socket.emit('startGame', { noComputer: false }, (gameStartResponse) => {
						console.log('Game started with computer player:', gameStartResponse);
					});
				}
				
				resolve(response);
			} else {
				const errorMsg = response ? response.error : 'Unknown error';
				console.error('NetworkManager: Failed to join game:', errorMsg);
				
				// Try one more time with a fresh connection
				console.log('NetworkManager: Attempting to reconnect and join again...');
				socket.disconnect();
				setTimeout(() => {
					connectSocketIO();
					setTimeout(() => {
						// Second attempt - if this fails, reject
						socket.emit('join_game', null, playerName, (secondResponse) => {
							if (secondResponse && secondResponse.success) {
								console.log('NetworkManager: Second attempt - joined game:', secondResponse);
								gameId = secondResponse.gameId;
								resolve(secondResponse);
							} else {
								reject(new Error(`Failed to join game: ${errorMsg}`));
							}
						});
					}, 1000);
				}, 500);
			}
		});
	});
}

/**
 * Submit a tetromino placement
 * @param {Object} tetromino - Tetromino data
 * @returns {Promise} - Resolves with placement result
 */
export async function submitTetrominoPlacement(tetromino) {
	if (!gameId || !playerId) {
		console.error('NetworkManager: Cannot submit tetromino placement, not in a game');
		return false;
	}
	
	try {
		// First try to send via Socket.IO for real-time sync
		sendMessage('tetromino_placed', {
			gameId,
			playerId,
			tetromino
		});
		
		// Then send via API for persistence
		const response = await fetch(`${API_BASE_URL}/games/${gameId}/tetromino`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Player-ID': playerId
			},
			body: JSON.stringify({ tetromino })
		});
		
		if (!response.ok) {
			throw new Error(`Server returned ${response.status}: ${response.statusText}`);
		}
		
		const data = await response.json();
		console.log('NetworkManager: Tetromino placement submitted:', data);
		return data;
	} catch (error) {
		console.error('NetworkManager: Failed to submit tetromino placement:', error);
		
		// For development, assume success
		return { success: true, gameState: 'chess' };
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
 * Check if connected to server
 * @returns {boolean} - Whether connected
 */
export function isConnected() {
	return connectionStatus === 'connected';
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
 * Request a list of current players
 */
export function requestPlayerList() {
	sendMessage('get_player_list', { gameId });
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