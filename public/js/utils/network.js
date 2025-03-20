/**
 * Network Utility Module
 * 
 * Handles communication with the server via Socket.IO
 */

// Socket.IO connection
let socket = null;
let _isConnected = false;
let isConnecting = false;
let connectionCallbacks = [];
let disconnectionCallbacks = [];
let messageHandlers = {};
let players = []; // Store list of players

// Reconnection settings
let reconnectAttempts = 0;
let reconnectTimeout = null;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;

// Event handlers
const eventHandlers = {};

// Default callbacks
let defaultCallbacks = {
	onConnect: () => console.log('Connected to server'),
	onDisconnect: (reason) => console.log(`Disconnected from server: ${reason}`),
	onError: (error) => console.error('Network error:', error),
	onReconnectAttempt: (attempt) => console.log(`Reconnection attempt ${attempt}/${MAX_RECONNECT_ATTEMPTS}`)
};

// Network configuration
let networkConfig = null;

/**
 * Initialize the network module
 * @param {Object} options - Network options
 * @returns {Promise<boolean>} - True if initialized successfully
 */
export async function init(options = {}) {
	try {
		// Check if Socket.IO is available
		if (typeof io === 'undefined') {
			// Try to dynamically load Socket.IO
			await loadSocketIO();
		}

		// Default options
		const defaultOptions = {
			autoConnect: true,
			reconnect: true,
			reconnectDelay: RECONNECT_BASE_DELAY,
			maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS,
			url: getServerSocketUrl()
		};
		
		// Merge options
		const config = { ...defaultOptions, ...options };
		
		// Store configuration
		networkConfig = config;
		
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
			await connect();
		}
		
		return true;
	} catch (error) {
		console.error('Error initializing network module:', error);
		return false;
	}
}

/**
 * Load Socket.IO client dynamically if not already available
 * @returns {Promise<void>}
 */
async function loadSocketIO() {
	return new Promise((resolve, reject) => {
		if (typeof io !== 'undefined') {
			resolve();
			return;
		}

		// Create script element
		const script = document.createElement('script');
		script.src = '/socket.io/socket.io.js';
		script.async = true;
		script.onload = () => resolve();
		script.onerror = () => reject(new Error('Failed to load Socket.IO'));
		
		// Add to document
		document.head.appendChild(script);
	});
}

/**
 * Get the Socket.IO server URL
 * @returns {string} Socket URL
 */
function getServerSocketUrl() {
	const host = window.location.hostname;
	// For development, use port 3020, otherwise use the current port
	const port = (host === 'localhost' || host === '127.0.0.1') ? 3020 : window.location.port;
	
	// Allow local testing without a server by using a mock socket
	if (host === 'localhost' || host === '127.0.0.1') {
		console.log('Using local mock Socket.IO for development');
		// If we're in local dev mode without a real server, implement a mock socket
		if (typeof window.mockSocket === 'undefined') {
			setupMockSocket();
		}
		return null; // Not needed for mock socket
	}
	
	return `${window.location.protocol}//${host}:${port}`;
}

/**
 * Set up a mock socket for local development without a server
 */
function setupMockSocket() {
	window.mockSocket = true;
	
	// Create a mock io function that returns a mock socket
	window.io = function() {
		return {
			// Basic Socket.IO interface
			on: function(event, callback) {
				// Store event handlers
				if (!window.mockSocketHandlers) {
					window.mockSocketHandlers = {};
				}
				
				if (!window.mockSocketHandlers[event]) {
					window.mockSocketHandlers[event] = [];
				}
				
				window.mockSocketHandlers[event].push(callback);
				
				// Immediately trigger connect event
				if (event === 'connect') {
					setTimeout(() => callback(), 100);
				}
			},
			emit: function(event, data, callback) {
				console.log(`Mock socket: emit ${event}`, data);
				
				// Handle specific events
				if (event === 'startGame') {
					// Simulate server response
					setTimeout(() => {
						if (callback) {
							callback({
								success: true,
								gameId: 'local-game-' + Date.now()
							});
						}
						
						// Trigger game started event
						if (window.mockSocketHandlers['gameStarted']) {
							window.mockSocketHandlers['gameStarted'].forEach(handler => {
								handler({
									success: true,
									gameState: {
										status: 'playing',
										board: Array(16).fill().map(() => Array(16).fill(0)),
										currentPlayer: 1,
										players: [
											{ id: 1, name: 'Player 1' },
											{ id: 2, name: 'Computer' }
										]
									}
								});
							});
						}
					}, 300);
				}
			},
			id: 'mock-socket-id'
		};
	};
}

/**
 * Connect to the server
 * @returns {Promise<boolean>} - True if connected successfully
 */
export async function connect() {
	return new Promise((resolve) => {
		if (!networkConfig) {
			console.error('Network not initialized. Call init() first.');
			resolve(false);
			return;
		}
		
		if (_isConnected) {
			console.log('Already connected to server.');
			resolve(true);
			return;
		}
		
		if (isConnecting) {
			console.log('Already attempting to connect...');
			resolve(false);
			return;
		}
		
		isConnecting = true;
		
		try {
			// Check if we're using a mock socket for local development
			if (window.mockSocket) {
				console.log('Using mock socket connection');
				socket = io(); // This will return our mock socket
				
				// Simulate connection
				setTimeout(() => {
					_isConnected = true;
					isConnecting = false;
					
					console.log('Mock socket connection established');
					
					// Call connect callback
					if (defaultCallbacks.onConnect) {
						defaultCallbacks.onConnect();
					}
					
					// Fire connection callbacks
					for (const callback of connectionCallbacks) {
						try {
							callback();
						} catch (error) {
							console.error('Error in connection callback:', error);
						}
					}
					
					// Trigger connected event
					triggerEvent('connected');
					
					resolve(true);
				}, 100);
				
				return;
			}
			
			console.log(`Connecting to server at ${networkConfig.url}...`);
			
			// Create Socket.IO connection
			socket = io(networkConfig.url, {
				reconnection: networkConfig.reconnect,
				reconnectionAttempts: networkConfig.maxReconnectAttempts,
				reconnectionDelay: networkConfig.reconnectDelay,
				transports: ['websocket', 'polling']
			});
			
			// Set up connection event
			socket.on('connect', () => {
				_isConnected = true;
				isConnecting = false;
				reconnectAttempts = 0;
				
				console.log('Socket.IO connection established');
				
				// Call connect callback
				if (defaultCallbacks.onConnect) {
					defaultCallbacks.onConnect();
				}
				
				// Fire connection callbacks
				for (const callback of connectionCallbacks) {
					try {
						callback();
					} catch (error) {
						console.error('Error in connection callback:', error);
					}
				}
				
				// Trigger connected event
				triggerEvent('connected');
				
				resolve(true);
			});
			
			// Set up disconnect event
			socket.on('disconnect', (reason) => {
				console.log(`Socket.IO connection closed: ${reason}`);
				
				// Only update state if we were previously connected
				if (_isConnected) {
					_isConnected = false;
					isConnecting = false;
					
					// Execute disconnection callbacks
					for (const callback of disconnectionCallbacks) {
						try {
							callback(reason);
						} catch (error) {
							console.error('Error in disconnection callback:', error);
						}
					}
					
					// Trigger 'disconnect' event handlers
					triggerEvent('disconnected', { reason });
				}
				
				resolve(false);
			});
			
			// Set up error event
			socket.on('error', (error) => {
				console.error('Socket.IO error:', error);
				
				// Call error callback
				if (defaultCallbacks.onError) {
					defaultCallbacks.onError(error);
				}
				
				// Trigger 'error' event handlers
				triggerEvent('error', { error });
			});
			
			// Set up reconnect event
			socket.on('reconnect_attempt', (attempt) => {
				console.log(`Reconnection attempt ${attempt}/${networkConfig.maxReconnectAttempts}`);
				
				if (defaultCallbacks.onReconnectAttempt) {
					defaultCallbacks.onReconnectAttempt(attempt);
				}
				
				triggerEvent('reconnect_attempt', { attempt });
			});
			
			// Set up message handlers for all registered events
			for (const event in messageHandlers) {
				if (Object.prototype.hasOwnProperty.call(messageHandlers, event)) {
					const handlers = messageHandlers[event];
					socket.on(event, (data) => {
						for (const handler of handlers) {
							try {
								handler(data);
							} catch (error) {
								console.error(`Error in message handler for event ${event}:`, error);
							}
						}
					});
				}
			}
		} catch (error) {
			console.error('Error connecting to server:', error);
			isConnecting = false;
			resolve(false);
		}
	});
}

/**
 * Register an event handler
 * @param {string} event - Event name
 * @param {Function} callback - Event callback
 */
export function on(event, callback) {
	if (!eventHandlers[event]) {
		eventHandlers[event] = [];
	}
	
	eventHandlers[event].push(callback);
	
	// If already connected, register with Socket.IO
	if (socket && _isConnected && !messageHandlers[event]) {
		messageHandlers[event] = [];
		socket.on(event, (data) => {
			for (const handler of messageHandlers[event]) {
				try {
					handler(data);
				} catch (error) {
					console.error(`Error in message handler for event ${event}:`, error);
				}
			}
		});
	}
	
	// Store in message handlers as well
	if (!messageHandlers[event]) {
		messageHandlers[event] = [];
	}
	
	messageHandlers[event].push(callback);
}

/**
 * Send a message to the server
 * @param {string} event - Event name
 * @param {*} data - Event data
 * @param {Function} [callback] - Optional callback function for response
 * @returns {Promise<*>} - Response from server if applicable
 */
export function send(event, data = null, callback = null) {
	// Handle special case for mock socket in local development
	if (window.mockSocket) {
		console.log(`Mock socket send: ${event}`, data);
		
		// Simulate response for common events
		const simulateResponse = (success = true, responseData = {}) => {
			const response = { success, ...responseData };
			
			// Handle callback or promise
			if (typeof callback === 'function') {
				setTimeout(() => callback(response), 100);
				return true;
			}
			
			return Promise.resolve(response);
		};
		
		// Handle specific events
		switch (event) {
			case 'startGame':
				// Simulate successful game start
				if (typeof callback === 'function') {
					setTimeout(() => {
						callback({
							success: true,
							gameId: 'mock-game-' + Date.now()
						});
						
						// Trigger game state changes after a delay
						triggerMockGameEvents();
					}, 300);
					return true;
				}
				return Promise.resolve({ success: true, gameId: 'mock-game-' + Date.now() });
				
			case 'movePiece':
				return simulateResponse(true, { moved: true, pieceId: data.pieceId });
				
			case 'placeTetromino':
				return simulateResponse(true, { placed: true });
				
			default:
				return simulateResponse(true);
		}
	}

	// Handle callback-based usage
	if (typeof callback === 'function') {
		if (!socket || !_isConnected) {
			console.error('Cannot send message: Not connected to server');
			callback({ success: false, error: 'Not connected to server' });
			return;
		}
		
		// If data is null, send event without data
		if (data === null) {
			socket.emit(event, callback);
			return;
		}
		
		// Send event with data and callback
		socket.emit(event, data, callback);
		return;
	}
	
	// Handle Promise-based usage (backward compatibility)
	return new Promise((resolve, reject) => {
		if (!socket || !_isConnected) {
			console.error('Cannot send message: Not connected to server');
			reject(new Error('Not connected to server'));
			return;
		}
		
		// If data is null, send event without data
		if (data === null) {
			socket.emit(event);
			resolve();
			return;
		}
		
		// Send event with data
		socket.emit(event, data, (response) => {
			if (response && response.error) {
				reject(new Error(response.error));
			} else {
				resolve(response);
			}
		});
	});
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
	return socket ? socket.id : null;
}

/**
 * Get list of connected players
 * @returns {Array} - List of players
 */
export function getPlayers() {
	return [...players];
}

/**
 * Request to spectate a player
 * @param {string} playerId - ID of the player to spectate
 * @returns {boolean} - True if request was sent
 */
export function requestSpectate(playerId) {
	return send('requestSpectate', { playerId });
}

/**
 * Stop spectating
 * @returns {boolean} - True if request was sent
 */
export function stopSpectating() {
	return send('stopSpectating');
}

/**
 * Clean up resources
 */
export function cleanup() {
	// Disconnect if connected
	if (_isConnected) {
		disconnect();
	}
	
	// Clear callbacks and handlers
	connectionCallbacks = [];
	disconnectionCallbacks = [];
	messageHandlers = {};
	
	// Clear reconnect timeout
	if (reconnectTimeout) {
		clearTimeout(reconnectTimeout);
		reconnectTimeout = null;
	}
	
	// Reset state
	socket = null;
	_isConnected = false;
	isConnecting = false;
	reconnectAttempts = 0;
}

/**
 * Remove a callback for a network event
 * @param {string} event - Event name
 * @param {Function} callback - Callback function to remove
 */
export function off(event, callback) {
	if (!eventHandlers[event]) {
		return;
	}
	
	if (callback) {
		// Remove specific callback
		eventHandlers[event] = eventHandlers[event].filter(cb => cb !== callback);
		
		// Also remove from message handlers
		if (messageHandlers[event]) {
			messageHandlers[event] = messageHandlers[event].filter(cb => cb !== callback);
		}
	} else {
		// Remove all callbacks for this event
		delete eventHandlers[event];
		delete messageHandlers[event];
	}
}

/**
 * Trigger a network event
 * @param {string} event - Event name
 * @param {Object} data - Event data
 */
function triggerEvent(event, data) {
	// Call handlers for this event
	if (eventHandlers[event]) {
		for (const callback of eventHandlers[event]) {
			try {
				callback(data);
			} catch (error) {
				console.error(`Error in callback for event '${event}':`, error);
			}
		}
	}
	
	// Call wildcard handlers
	if (eventHandlers['*']) {
		for (const callback of eventHandlers['*']) {
			try {
				callback(event, data);
			} catch (error) {
				console.error(`Error in wildcard callback for event '${event}':`, error);
			}
		}
	}
}

/**
 * Trigger mock game events for local development
 */
function triggerMockGameEvents() {
	// Create a mock game board
	const mockBoard = Array(16).fill().map(() => Array(16).fill(0));
	
	// Add some blocks to the board
	for (let i = 14; i < 16; i++) {
		for (let j = 0; j < 16; j++) {
			mockBoard[i][j] = Math.random() > 0.7 ? Math.floor(Math.random() * 7) + 1 : 0;
		}
	}
	
	// Generate mock tetromino
	const tetrominoTypes = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
	const mockTetromino = {
		type: tetrominoTypes[Math.floor(Math.random() * tetrominoTypes.length)],
		position: { x: 8, y: 0, z: 0 },
		shape: [
			[1, 1, 1],
			[0, 1, 0],
			[0, 0, 0]
		]
	};
	
	// Generate mock chess pieces
	const pieceTypes = ['pawn', 'rook', 'knight', 'bishop', 'queen', 'king'];
	const mockChessPieces = [];
	
	// Player 1 pieces (blue)
	for (let i = 0; i < 6; i++) {
		mockChessPieces.push({
			id: `p1-${pieceTypes[i % 6]}-${i}`,
			type: pieceTypes[i % 6],
			player: 1,
			x: i * 2,
			z: 14
		});
	}
	
	// Player 2 pieces (red)
	for (let i = 0; i < 6; i++) {
		mockChessPieces.push({
			id: `p2-${pieceTypes[i % 6]}-${i}`,
			type: pieceTypes[i % 6],
			player: 2,
			x: i * 2,
			z: 0
		});
	}
	
	// Create a simple game state
	const mockGameState = {
		state: 'PLAYING',
		board: mockBoard,
		currentTetromino: mockTetromino,
		ghostPiece: {
			position: { x: 8, y: 0, z: 10 }
		},
		chessPieces: mockChessPieces,
		players: [
			{ id: 1, name: 'Player 1', score: 0 },
			{ id: 2, name: 'Computer', score: 0 }
		],
		currentPlayer: 1,
		turnPhase: 'chess',
		turnStartTime: Date.now(),
		isGameStarted: true,
		isGamePaused: false,
		isGameOver: false
	};
	
	// Simulate events
	setTimeout(() => {
		if (eventHandlers['boardUpdate']) {
			for (const handler of eventHandlers['boardUpdate']) {
				handler({ board: mockBoard });
			}
		}
		
		if (eventHandlers['gameStateUpdate']) {
			for (const handler of eventHandlers['gameStateUpdate']) {
				handler(mockGameState);
			}
		}
		
		if (eventHandlers['turnChanged']) {
			for (const handler of eventHandlers['turnChanged']) {
				handler({ player: 1, phase: 'chess' });
			}
		}
	}, 500);
}
