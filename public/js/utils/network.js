/**
 * Network Module
 * 
 * Handles communication with the server, including socket connections
 * and API requests.
 */

// Socket.io instance
let socket = null;

// Event listeners
const eventListeners = {};

// Determine environment and set SERVER_URL
const isNodeEnvironment = typeof window === 'undefined';
let SERVER_URL;

// Set SERVER_URL based on environment
if (isNodeEnvironment) {
	// In Node.js (testing environment)
	SERVER_URL = 'http://localhost:3020';
} else {
	// In browser environment
	SERVER_URL = window.location.hostname === 'localhost' 
		? `http://${window.location.hostname}:3020` 
		: window.location.origin;
}

// API endpoints
const API = {
	USERS: `${SERVER_URL}/api/users`,
	GAMES: `${SERVER_URL}/api/games`,
	STATS: `${SERVER_URL}/api/stats`,
	TRANSACTIONS: `${SERVER_URL}/api/transactions`,
	SPONSORS: `${SERVER_URL}/api/sponsors`,
	GAME_STATE: `${SERVER_URL}/api/game-state`,
	JOIN_GAME: `${SERVER_URL}/api/join-game`,
	LEAVE_GAME: `${SERVER_URL}/api/leave-game`
};

/**
 * Storage wrapper that works in both browser and Node
 */
const storage = {
	getItem: (key) => {
		if (isNodeEnvironment) {
			// In Node.js, use a mock storage
			return storage._mockStorage?.[key] || null;
		} else {
			// In browser, use localStorage
			return localStorage.getItem(key);
		}
	},
	setItem: (key, value) => {
		if (isNodeEnvironment) {
			// In Node.js, use a mock storage
			storage._mockStorage = storage._mockStorage || {};
			storage._mockStorage[key] = value;
		} else {
			// In browser, use localStorage
			localStorage.setItem(key, value);
		}
	},
	removeItem: (key) => {
		if (isNodeEnvironment) {
			// In Node.js, use a mock storage
			if (storage._mockStorage) {
				delete storage._mockStorage[key];
			}
		} else {
			// In browser, use localStorage
			localStorage.removeItem(key);
		}
	},
	_mockStorage: {} // Storage for Node environment
};

/**
 * Initialize the socket connection
 * @param {Object} options - Connection options
 * @returns {Promise<Object>} The socket instance
 */
export function initSocket(options = {}) {
	return new Promise((resolve, reject) => {
		try {
			// Close existing socket if any
			if (socket) {
				socket.close();
			}
			
			console.log('Connecting to server at:', SERVER_URL);
			
			// Check if socket.io is available
			if (typeof io !== 'function') {
				console.warn('Socket.IO not available, using mock socket');
				
				// Use mock socket if available
				if (typeof window !== 'undefined') {
					// Create a mock socket
					window.mockSocketConnected = true;
					socket = createMockSocket();
					
						console.log('Using mock socket with ID:', socket.id);
					
					// Set window.socketConnected for debugging
					window.socketConnected = true;
					
					// Setup default event handlers
					setupDefaultEventHandlers();
					
					// Resolve with the mock socket
					resolve(socket);
				} else {
					// No mock socket available
					console.error('Socket.IO not available and no mock socket available');
					reject(new Error('Socket.IO not available'));
				}
			} else {
				// Use real Socket.IO
				try {
					// Connect to the server
					socket = io(SERVER_URL, options);
					
					// Set window.socketConnected for debugging
					if (typeof window !== 'undefined') {
						window.socketConnected = true;
					}
					
					// Wait for connection
					socket.on('connect', () => {
						console.log('Socket connected successfully with ID:', socket.id);
						
						// Setup default event handlers
						setupDefaultEventHandlers();
						
						// Resolve with the socket
						resolve(socket);
					});
					
					// Handle connection error
					socket.on('connect_error', (error) => {
						console.error('Socket connection error:', error);
						
						// Fall back to mock socket
						console.warn('Falling back to mock socket due to connection error');
						if (typeof window !== 'undefined') {
							window.mockSocketConnected = true;
						}
						
						// Create a mock socket
						socket = createMockSocket();
						
						// Setup default event handlers
						setupDefaultEventHandlers();
						
						// Resolve with the mock socket
						resolve(socket);
					});
				} catch (error) {
					console.error('Error creating socket:', error);
					
					// Fall back to mock socket
					console.warn('Falling back to mock socket due to error');
					if (typeof window !== 'undefined') {
						window.mockSocketConnected = true;
					}
					
					// Create a mock socket
					socket = createMockSocket();
					
					// Setup default event handlers
					setupDefaultEventHandlers();
					
					// Resolve with the mock socket
					resolve(socket);
				}
			}
		} catch (error) {
			console.error('Socket initialization error:', error);
			
			// Fall back to mock socket as a last resort
			console.warn('Falling back to mock socket as last resort');
			if (typeof window !== 'undefined') {
				window.mockSocketConnected = true;
			}
			
			// Create a mock socket
			socket = createMockSocket();
			
			// Setup default event handlers
					setupDefaultEventHandlers();
					
			// Resolve with the mock socket
			resolve(socket);
		}
	});
}

/**
 * Create a mock socket for offline mode
 * @returns {Object} A mock socket object
 */
function createMockSocket() {
	return {
		id: 'mock-' + Math.random().toString(36).substr(2, 9),
		connected: true,
		
		// Mock event handlers
		handlers: {},
		
		// Mock socket methods
		on: function(event, callback) {
			if (!this.handlers[event]) {
				this.handlers[event] = [];
			}
			this.handlers[event].push(callback);
			return this;
		},
		
		off: function(event, callback) {
			if (this.handlers[event]) {
				this.handlers[event] = this.handlers[event].filter(cb => cb !== callback);
			}
			return this;
		},
		
		emit: function(event, data, callback) {
			console.log('Mock socket emit:', event, data);
			
			// Simulate server response
			if (callback) {
				setTimeout(() => {
					callback({ success: true, mockData: true });
				}, 100);
			}
			
			// Simulate server events
			if (event === 'join_game') {
				setTimeout(() => {
					this.trigger('player_joined', data);
					this.trigger('game_update', {
						players: {
							[data.playerId]: {
								id: data.playerId,
								username: data.username || 'Anonymous',
								isActive: true,
								score: 0
							}
						},
						board: [],
						isActive: true,
						startTime: Date.now(),
						lastUpdate: Date.now()
					});
				}, 200);
			}
			
			return this;
		},
		
		close: function() {
			this.connected = false;
			if (this.handlers.disconnect) {
				this.handlers.disconnect.forEach(cb => cb('manual'));
			}
			return this;
		},
		
		// Helper to trigger events
		trigger: function(event, data) {
			if (this.handlers[event]) {
				this.handlers[event].forEach(cb => cb(data));
			}
			return this;
		}
	};
}

/**
 * Set up default event handlers for common game events
 */
function setupDefaultEventHandlers() {
	if (!socket) return;
	
	// Throttling for board updates
	let lastBoardUpdateTime = 0;
	const BOARD_UPDATE_THROTTLE = 500; // ms
	
	// Board updates
	socket.on('boardUpdate', (data) => {
		// Throttle board updates to prevent flooding
		const now = Date.now();
		if (now - lastBoardUpdateTime < BOARD_UPDATE_THROTTLE) {
			return; // Skip this update
		}
		lastBoardUpdateTime = now;
		
		console.log('Received board update:', data);
		// Dispatch a custom event that other modules can listen for
		if (typeof window !== 'undefined') {
		window.dispatchEvent(new CustomEvent('boardUpdate', { detail: data }));
		}
	});
	
	// Game state updates
	socket.on('game_update', (data) => {
		console.log('Received game state update');
		if (typeof window !== 'undefined') {
			window.dispatchEvent(new CustomEvent('gameStateUpdate', { detail: data }));
		}
	});
	
	// Player events
	socket.on('player_joined', (data) => {
		console.log('Player joined:', data);
		if (typeof window !== 'undefined') {
		window.dispatchEvent(new CustomEvent('playerJoined', { detail: data }));
		}
	});
	
	socket.on('player_left', (data) => {
		console.log('Player left:', data);
		if (typeof window !== 'undefined') {
		window.dispatchEvent(new CustomEvent('playerLeft', { detail: data }));
		}
	});
	
	// Pause system events
	socket.on('playerPaused', (data) => {
		console.log('Player paused:', data);
		if (typeof window !== 'undefined') {
		window.dispatchEvent(new CustomEvent('playerPaused', { detail: data }));
		}
	});
	
	socket.on('playerResumed', (data) => {
		console.log('Player resumed:', data);
		if (typeof window !== 'undefined') {
		window.dispatchEvent(new CustomEvent('playerResumed', { detail: data }));
		}
	});
	
	socket.on('playerPauseExpired', (data) => {
		console.log('Player pause expired:', data);
		if (typeof window !== 'undefined') {
		window.dispatchEvent(new CustomEvent('playerPauseExpired', { detail: data }));
		}
	});
	
	// Piece events
	socket.on('tetromino_placed', (data) => {
		console.log('Tetromino placed:', data);
		if (typeof window !== 'undefined') {
			window.dispatchEvent(new CustomEvent('tetrominoPlaced', { detail: data }));
		}
	});
	
	socket.on('chess_piece_moved', (data) => {
		console.log('Chess piece moved:', data);
		if (typeof window !== 'undefined') {
			window.dispatchEvent(new CustomEvent('chessPieceMoved', { detail: data }));
		}
	});
	
	// Error events
	socket.on('error', (error) => {
		console.error('Server error:', error);
		if (typeof window !== 'undefined') {
		window.dispatchEvent(new CustomEvent('serverError', { detail: error }));
		}
	});
}

/**
 * Get the socket instance
 * @returns {Object|null} The socket instance or null if not connected
 */
export function getSocket() {
	return socket;
}

/**
 * Check if the socket is connected
 * @returns {boolean} Whether the socket is connected
 */
export function isConnected() {
	return socket && socket.connected;
}

/**
 * Add an event listener
 * @param {string} event - The event name
 * @param {Function} callback - The callback function
 */
export function on(event, callback) {
	if (!eventListeners[event]) {
		eventListeners[event] = [];
	}
	
	eventListeners[event].push(callback);
	
	if (socket) {
		socket.on(event, callback);
	}
}

/**
 * Remove an event listener
 * @param {string} event - The event name
 * @param {Function} callback - The callback function
 */
export function off(event, callback) {
	if (eventListeners[event]) {
		eventListeners[event] = eventListeners[event].filter(cb => cb !== callback);
	}
	
	if (socket) {
		socket.off(event, callback);
	}
}

/**
 * Emit an event
 * @param {string} event - The event name
 * @param {*} data - The event data
 * @returns {Promise<*>} The server response
 */
export function emit(event, data) {
	return new Promise((resolve, reject) => {
		if (!socket) {
			console.error('Socket not initialized');
			reject(new Error('Socket not initialized'));
			return;
		}
		
		if (!socket.connected) {
			console.warn('Socket not connected, using mock response');
			// Return a mock response for offline mode
			setTimeout(() => {
				resolve({ success: true, offline: true });
			}, 100);
			return;
		}
		
		console.log(`Emitting ${event} event:`, data);
		
		socket.emit(event, data, (response) => {
			if (response && response.error) {
				console.error(`Error in ${event} event:`, response.error);
				reject(response.error);
			} else {
				console.log(`Received response for ${event} event:`, response);
				resolve(response);
			}
		});
	});
}

/**
 * Make an API request
 * @param {string} endpoint - The API endpoint
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>} - The response data
 */
export async function apiRequest(endpoint, options = {}) {
	try {
		// Ensure we have the correct content type for JSON requests
		if (options.method && (options.method === 'POST' || options.method === 'PUT') && options.body) {
			options.headers = options.headers || {};
			options.headers['Content-Type'] = options.headers['Content-Type'] || 'application/json';
			
			// Convert body to JSON string if it's an object
			if (typeof options.body === 'object') {
				options.body = JSON.stringify(options.body);
			}
		}
		
		// Make the request
		const response = await fetch(`/api${endpoint}`, options);
		
		// Check if the response is OK
		if (!response.ok) {
			const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
			throw new Error(errorData.message || `API request failed with status ${response.status}`);
		}
		
		// Parse the response as JSON
		const data = await response.json();
		return data;
	} catch (error) {
		console.error('API request error:', error);
		throw error;
	}
}

/**
 * Join an existing game
 * @param {string} gameId - The ID of the game to join (optional, will use default-game if not provided)
 * @param {string} username - The player's username
 * @returns {Promise<Object>} - Result of the join operation
 */
export async function joinGame(gameId, username) {
	console.log(`Attempting to join game: ${gameId || 'default-game'} as ${username}`);
	
	// Generate a player ID if none exists
	if (!localStorage.getItem('playerId')) {
		const playerId = 'player-' + Math.random().toString(36).substring(2, 9);
		localStorage.setItem('playerId', playerId);
		console.log(`Generated new player ID: ${playerId}`);
	}
	
	const playerId = localStorage.getItem('playerId');
	console.log(`Using player ID: ${playerId}`);
	
	// First try API method
	try {
		console.log(`Attempting to join game via API: ${gameId || 'default-game'}`);
		const result = await apiRequest(`/games/${gameId || 'default-game'}/join`, {
			method: 'POST',
			body: {
				playerId,
				username
			}
		});
		
		if (result.success) {
			console.log(`Successfully joined game via API: ${result.gameId}`);
			return result;
		} else {
			console.warn(`API join failed: ${result.message}, falling back to socket`);
		}
	} catch (error) {
		console.warn('API join failed, falling back to socket:', error);
	}
	
	// Fall back to socket method if API fails
	return new Promise((resolve, reject) => {
		try {
			if (!socket || !socket.connected) {
				console.error('Socket not connected, cannot join game');
				reject({ success: false, message: 'Socket not connected' });
				return;
			}
			
			console.log(`Attempting to join game via socket: ${gameId || 'default-game'}`);
			
			// Set up one-time handler for join response
			socket.once('join_game_response', (response) => {
				console.log('Received join_game_response:', response);
				if (response.success) {
					console.log(`Successfully joined game via socket: ${response.gameId}`);
					resolve(response);
				} else {
					console.error(`Failed to join game via socket: ${response.message}`);
					reject(response);
				}
			});
			
			// Set up error handler
			const errorHandler = (error) => {
				console.error('Socket error while joining game:', error);
				reject({ success: false, message: error.message || 'Unknown error' });
			};
			
			socket.once('error', errorHandler);
			
			// Emit join event
			socket.emit('join_game', { playerId, username, gameId: gameId || 'default-game' });
			console.log(`Emitted join_game event for ${gameId || 'default-game'}`);
			
			// Clean up error handler after 5 seconds (timeout)
			setTimeout(() => {
				socket.off('error', errorHandler);
			}, 5000);
		} catch (error) {
			console.error('Error in socket join:', error);
			reject({ success: false, message: error.message || 'Unknown error' });
		}
	});
}

/**
 * Create a new game
 * @param {string} username - The player's username
 * @param {Object} options - Game options
 * @returns {Promise<Object>} - Result of the create operation
 */
export async function createGame(username, options = {}) {
	console.log(`Attempting to create a new game as ${username}`);
	
	// Generate a player ID if none exists
	if (!localStorage.getItem('playerId')) {
		const playerId = 'player-' + Math.random().toString(36).substring(2, 9);
		localStorage.setItem('playerId', playerId);
		console.log(`Generated new player ID: ${playerId}`);
	}
	
	const playerId = localStorage.getItem('playerId');
	console.log(`Using player ID: ${playerId}`);
	
	// First try API method
	try {
		console.log('Attempting to create game via API');
		const result = await apiRequest('/games', {
			method: 'POST',
			body: {
				playerId,
				username,
				options
			}
		});
		
		if (result.success) {
			console.log(`Successfully created game via API: ${result.gameId}`);
			return result;
		} else {
			console.warn(`API create failed: ${result.message}, falling back to socket`);
		}
	} catch (error) {
		console.warn('API create failed, falling back to socket:', error);
	}
	
	// Fall back to socket method if API fails
	return new Promise((resolve, reject) => {
		try {
			if (!socket || !socket.connected) {
				console.error('Socket not connected, cannot create game');
				reject({ success: false, message: 'Socket not connected' });
				return;
			}
			
			console.log('Attempting to create game via socket');
			
			// Set up one-time handler for create response
			socket.once('create_game_response', (response) => {
				console.log('Received create_game_response:', response);
				if (response.success) {
					console.log(`Successfully created game via socket: ${response.gameId}`);
					resolve(response);
				} else {
					console.error(`Failed to create game via socket: ${response.message}`);
					reject(response);
				}
			});
			
			// Set up error handler
			const errorHandler = (error) => {
				console.error('Socket error while creating game:', error);
				reject({ success: false, message: error.message || 'Unknown error' });
			};
			
			socket.once('error', errorHandler);
			
			// Emit create event
			socket.emit('create_game', { playerId, username, options });
			console.log('Emitted create_game event');
			
			// Clean up error handler after 5 seconds (timeout)
			setTimeout(() => {
				socket.off('error', errorHandler);
			}, 5000);
		} catch (error) {
			console.error('Error in socket create:', error);
			reject({ success: false, message: error.message || 'Unknown error' });
		}
	});
}

/**
 * Move a chess piece
 * @param {number} fromX - Starting X coordinate
 * @param {number} fromY - Starting Y coordinate
 * @param {number} toX - Destination X coordinate
 * @param {number} toY - Destination Y coordinate
 * @returns {Promise<Object>} The move result
 */
export async function moveChessPiece(fromX, fromY, toX, toY) {
	const playerId = storage.getItem('player_id');
	
	if (!playerId) {
		throw new Error('Player ID not found. Please join a game first.');
	}
	
	try {
		return await emit('move_chess_piece', {
		playerId,
			pieceId: `piece_${fromX}_${fromY}`,
			fromPosition: { x: fromX, y: fromY },
			toPosition: { x: toX, y: toY }
		});
	} catch (error) {
		console.error('Error moving chess piece:', error);
		
		// Return a mock response for offline mode
		return { 
			success: true, 
			offline: true,
			movedPiece: {
		fromX,
		fromY,
		toX,
		toY
			}
		};
	}
}

/**
 * Place a tetromino piece
 * @param {Object} piece - The tetromino piece data
 * @returns {Promise<Object>} The placement result
 */
export async function placeTetromino(piece) {
	const playerId = storage.getItem('player_id');
	
	if (!playerId) {
		throw new Error('Player ID not found. Please join a game first.');
	}
	
	try {
		return await emit('place_tetromino', {
		playerId,
			tetromino: {
				shape: piece.shape,
				rotation: piece.rotation
			},
			position: {
				x: piece.x,
				y: piece.y
			}
		});
	} catch (error) {
		console.error('Error placing tetromino:', error);
		
		// Return a mock response for offline mode
		return { 
			success: true, 
			offline: true,
			placedCells: []
		};
	}
}

/**
 * Pause the game for the current player
 * @returns {Promise<Object>} The pause result
 */
export async function pauseGame() {
	const playerId = storage.getItem('player_id');
	
	if (!playerId) {
		throw new Error('Player ID not found. Please join a game first.');
	}
	
	try {
	return await emit('pauseGame', { playerId });
	} catch (error) {
		console.error('Error pausing game:', error);
		
		// Return a mock response for offline mode
		return { 
			success: true, 
			offline: true
		};
	}
}

/**
 * Resume the game for the current player
 * @returns {Promise<Object>} The resume result
 */
export async function resumeGame() {
	const playerId = storage.getItem('player_id');
	
	if (!playerId) {
		throw new Error('Player ID not found. Please join a game first.');
	}
	
	try {
	return await emit('resumeGame', { playerId });
	} catch (error) {
		console.error('Error resuming game:', error);
		
		// Return a mock response for offline mode
		return { 
			success: true, 
			offline: true
		};
	}
}

/**
 * Get the current game state
 * @returns {Promise<Object>} The game state
 */
export async function getGameState() {
	try {
		return await apiRequest(API.GAME_STATE);
	} catch (error) {
		console.error('Error getting game state:', error);
		
		// Return a default game state for offline mode
		return {
			players: {},
			board: [],
			isActive: true,
			startTime: Date.now(),
			lastUpdate: Date.now(),
			offline: true
		};
	}
}

/**
 * Disconnect from the server
 */
export function disconnect() {
	if (socket) {
		socket.close();
		socket = null;
	}
}

// Export the API endpoints for direct use
export { API };
